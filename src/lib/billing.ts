import "server-only";
import { db } from "./db";
import { stripe } from "./stripe";

// Statuses in which a subscription still exists from the customer's point of view.
// A user in one of these must change plan from /account, not start a second checkout.
const LIVE_STATUSES = ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"];

/** The user's current subscription as last reported by Stripe webhooks, or null. */
export async function currentSubscription(userId: string) {
  return db.subscription.findFirst({
    where: { customer: { userId }, status: { in: LIVE_STATUSES } },
    orderBy: { createdAt: "desc" },
    include: { customer: true },
  });
}

/** The most recent unpaid invoice for a subscription — what the past-due banner links to. */
export async function outstandingInvoice(stripeSubscriptionId: string) {
  return db.invoice.findFirst({
    where: { stripeSubscriptionId, status: "open" },
    orderBy: { createdAt: "desc" },
  });
}

export async function invoicesFor(customerId: string, take = 24) {
  return db.invoice.findMany({ where: { customerId }, orderBy: { periodEnd: "desc" }, take });
}

/**
 * What the customer will be billed at renewal, straight from Stripe. Display only — never
 * persisted. Returns null if Stripe cannot produce a preview (e.g. the subscription is ending).
 */
export async function upcomingInvoice(stripeCustomerId: string, stripeSubscriptionId: string) {
  try {
    const preview = await stripe().invoices.createPreview({
      customer: stripeCustomerId,
      subscription: stripeSubscriptionId,
    });
    return { amount: preview.amount_due, currency: preview.currency, date: preview.next_payment_attempt ?? preview.period_end };
  } catch (err) {
    console.warn("[billing] upcoming invoice preview failed", err);
    return null;
  }
}
