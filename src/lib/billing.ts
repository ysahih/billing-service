import "server-only";
import { db } from "./db";

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
