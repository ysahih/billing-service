import "server-only";
import { currentSubscription } from "./billing";
import type { PlanKey } from "./plans";
import { pricesFor } from "./prices";
import { planChangeItems, summarizePreview, type ProrationSummary } from "./proration";
import { stripe } from "./stripe";

// Every function here ASKS Stripe to change something and returns. None of them writes
// billing state locally: the resulting customer.subscription.updated webhook does that.

export class BillingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function liveSubscriptionFor(userId: string) {
  const local = await currentSubscription(userId);
  if (!local) throw new BillingError("No active subscription", 404);
  // Item ids must come from Stripe, not the read model, which may lag by a webhook.
  return stripe().subscriptions.retrieve(local.stripeSubscriptionId);
}

async function itemsFor(userId: string, plan: PlanKey) {
  const sub = await liveSubscriptionFor(userId);
  const { base, metered } = await pricesFor(plan);
  if (sub.items.data.some((i) => i.price.id === base.id)) throw new BillingError("Already on this plan");
  return { sub, items: planChangeItems(sub, { baseId: base.id, meteredId: metered?.id ?? null }) };
}

export async function previewPlanChange(
  userId: string,
  plan: PlanKey,
): Promise<ProrationSummary & { prorationDate: number }> {
  const { sub, items } = await itemsFor(userId, plan);
  // Pin the proration timestamp: the confirm step sends the same value, so Stripe charges
  // exactly what the user was shown, not a figure recomputed seconds later.
  const prorationDate = Math.floor(Date.now() / 1000);
  const preview = await stripe().invoices.createPreview({
    customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscription: sub.id,
    subscription_details: {
      items,
      proration_behavior: "create_prorations",
      proration_date: prorationDate,
    },
  });
  return { ...summarizePreview(preview), prorationDate };
}

export async function confirmPlanChange(userId: string, plan: PlanKey, prorationDate: number) {
  const { sub, items } = await itemsFor(userId, plan);
  await stripe().subscriptions.update(
    sub.id,
    { items, proration_behavior: "create_prorations", proration_date: prorationDate },
    // A double-clicked confirm must not apply the change twice.
    { idempotencyKey: `plan-change-${sub.id}-${plan}-${prorationDate}` },
  );
}

export async function setCancelAtPeriodEnd(userId: string, cancel: boolean) {
  const sub = await liveSubscriptionFor(userId);
  if (!cancel && sub.status === "canceled") throw new BillingError("Subscription already ended");
  await stripe().subscriptions.update(sub.id, { cancel_at_period_end: cancel });
}
