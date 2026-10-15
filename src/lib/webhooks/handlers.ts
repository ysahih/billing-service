import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { idOf, setSubscriptionStatus, subscriptionIdOfInvoice, syncInvoice, syncSubscription, type Outcome } from "./sync";

type Tx = Prisma.TransactionClient;

/** Data fetched from Stripe BEFORE the transaction opens. No network calls inside a transaction. */
export interface Prefetched {
  subscription?: Stripe.Subscription;
}

export type Handler = (tx: Tx, event: Stripe.Event, pre: Prefetched) => Promise<Outcome>;

export const handlers: Partial<Record<Stripe.Event.Type, Handler>> = {
  // The session only references the subscription by id, so the processor prefetches it.
  // The local Customer row normally exists already (created by the checkout route); the
  // upsert covers a session created some other way.
  "checkout.session.completed": async (tx, event, pre) => {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") return "ignored";
    const stripeCustomerId = idOf(session.customer);
    const userId = session.client_reference_id;
    if (stripeCustomerId && userId) {
      await tx.customer.upsert({
        where: { stripeCustomerId },
        update: {},
        create: { userId, stripeCustomerId },
      });
    }
    if (!pre.subscription) throw new Error(`Subscription for session ${session.id} was not prefetched`);
    return syncSubscription(tx, pre.subscription, event.created);
  },

  "customer.subscription.created": (tx, event) =>
    syncSubscription(tx, event.data.object as Stripe.Subscription, event.created),

  "customer.subscription.updated": (tx, event) =>
    syncSubscription(tx, event.data.object as Stripe.Subscription, event.created),

  "customer.subscription.deleted": (tx, event) =>
    syncSubscription(tx, event.data.object as Stripe.Subscription, event.created, { status: "canceled" }),

  "invoice.paid": async (tx, event) => {
    const invoice = event.data.object as Stripe.Invoice;
    const outcome = await syncInvoice(tx, invoice, event.created);
    const subId = subscriptionIdOfInvoice(invoice);
    // Recovery: a past_due subscription whose invoice is now paid is back in good standing.
    if (subId && outcome === "processed") await setSubscriptionStatus(tx, subId, "active", event.created, ["past_due"]);
    return outcome;
  },

  "invoice.payment_failed": async (tx, event) => {
    const invoice = event.data.object as Stripe.Invoice;
    const outcome = await syncInvoice(tx, invoice, event.created);
    const subId = subscriptionIdOfInvoice(invoice);
    // A failure older than the invoice's current state (e.g. it was since paid) changes nothing.
    if (subId && outcome === "processed") await setSubscriptionStatus(tx, subId, "past_due", event.created, ["active", "trialing"]);
    return outcome;
  },

  "customer.subscription.trial_will_end": async (_tx, event) => {
    const sub = event.data.object as Stripe.Subscription;
    console.info(`[webhook] trial ending for ${sub.id} at ${sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : "?"}`);
    return "processed";
  },
};

/** Best-effort customer id for the event log, so admin can filter events per customer. */
export function customerIdOfEvent(event: Stripe.Event): string | null {
  const obj = event.data.object as { object?: string; id?: string; customer?: string | { id: string } | null };
  if (obj.object === "customer") return obj.id ?? null;
  return idOf(obj.customer ?? null);
}
