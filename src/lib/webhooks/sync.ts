import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { planFromLookupKey } from "../plans";

// Pure-ish writers that project Stripe objects onto the read model. Every function takes the
// transaction client of the webhook being processed. Nothing outside src/lib/webhooks calls these.

type Tx = Prisma.TransactionClient;
export type Outcome = "processed" | "ignored" | "stale";

const toDate = (unixSeconds: number) => new Date(unixSeconds * 1000);

export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/** The licensed (flat fee) item decides the plan and the billing period. */
export function baseItem(sub: Stripe.Subscription): Stripe.SubscriptionItem {
  const item =
    sub.items.data.find((i) => i.price.recurring?.usage_type === "licensed") ?? sub.items.data[0];
  if (!item) throw new Error(`Subscription ${sub.id} has no items`);
  return item;
}

async function customerIdFor(tx: Tx, stripeCustomerId: string, userIdHint?: string | null): Promise<string> {
  const existing = await tx.customer.findUnique({ where: { stripeCustomerId } });
  if (existing) return existing.id;
  // The checkout route creates the mapping before redirecting, so this is a fallback for
  // customers created outside the app. Without a user to attach to, fail loudly: the
  // transaction rolls back and Stripe retries the event.
  if (!userIdHint) throw new Error(`No local customer for ${stripeCustomerId} and no userId metadata`);
  const created = await tx.customer.upsert({
    where: { userId: userIdHint },
    update: {},
    create: { userId: userIdHint, stripeCustomerId },
  });
  return created.id;
}

/**
 * Upserts a subscription from a Stripe Subscription object.
 * Events older than the last one applied to the row are ignored ("stale"), so a delayed
 * `customer.subscription.updated` cannot overwrite a newer state.
 */
export async function syncSubscription(
  tx: Tx,
  sub: Stripe.Subscription,
  eventCreated: number,
  overrides: { status?: string } = {},
): Promise<Outcome> {
  const stripeCustomerId = idOf(sub.customer);
  if (!stripeCustomerId) throw new Error(`Subscription ${sub.id} has no customer`);

  const eventAt = toDate(eventCreated);
  const existing = await tx.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
  if (existing && existing.lastEventAt > eventAt) return "stale";

  const item = baseItem(sub);
  const data = {
    status: overrides.status ?? sub.status,
    plan: planFromLookupKey(item.price.lookup_key) ?? "unknown",
    priceId: item.price.id,
    currentPeriodStart: toDate(item.current_period_start),
    currentPeriodEnd: toDate(item.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    lastEventAt: eventAt,
  };

  if (existing) {
    await tx.subscription.update({ where: { id: existing.id }, data });
  } else {
    const customerId = await customerIdFor(tx, stripeCustomerId, sub.metadata?.userId);
    await tx.subscription.create({ data: { ...data, customerId, stripeSubscriptionId: sub.id } });
  }
  return "processed";
}

/** Upserts an invoice row. Same staleness rule as subscriptions. */
export async function syncInvoice(tx: Tx, invoice: Stripe.Invoice, eventCreated: number): Promise<Outcome> {
  const stripeCustomerId = idOf(invoice.customer);
  if (!invoice.id || !stripeCustomerId) throw new Error("Invoice without id or customer");

  const eventAt = toDate(eventCreated);
  const existing = await tx.invoice.findUnique({ where: { stripeInvoiceId: invoice.id } });
  if (existing && existing.lastEventAt > eventAt) return "stale";

  const data = {
    stripeSubscriptionId: subscriptionIdOfInvoice(invoice),
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    status: invoice.status ?? "draft",
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    periodStart: toDate(invoice.period_start),
    periodEnd: toDate(invoice.period_end),
    attemptCount: invoice.attempt_count,
    nextPaymentAttempt: invoice.next_payment_attempt ? toDate(invoice.next_payment_attempt) : null,
    lastEventAt: eventAt,
  };

  if (existing) {
    await tx.invoice.update({ where: { id: existing.id }, data });
  } else {
    const customerId = await customerIdFor(tx, stripeCustomerId);
    await tx.invoice.create({ data: { ...data, customerId, stripeInvoiceId: invoice.id } });
  }
  return "processed";
}

export function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription);
}

/**
 * Fast-path status change driven by an invoice event, which carries the subscription id but
 * not the subscription.
 *
 * It applies only if no NEWER subscription snapshot has been written, and it deliberately
 * does not advance `lastEventAt`: subscription.* events are the ordered, authoritative
 * snapshots, and Stripe always emits one when the status really changes. Advancing the
 * watermark here could make us drop a plan change created a second earlier but delivered later.
 */
export async function setSubscriptionStatus(
  tx: Tx,
  stripeSubscriptionId: string,
  status: string,
  eventCreated: number,
  onlyIfCurrently?: string[],
): Promise<Outcome> {
  const { count } = await tx.subscription.updateMany({
    where: {
      stripeSubscriptionId,
      lastEventAt: { lte: toDate(eventCreated) },
      ...(onlyIfCurrently ? { status: { in: onlyIfCurrently } } : {}),
    },
    data: { status },
  });
  return count > 0 ? "processed" : "stale";
}
