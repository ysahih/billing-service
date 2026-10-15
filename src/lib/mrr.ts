import { PLANS, isPlanKey } from "./plans";

// Statuses that count toward MRR. past_due still counts: the customer has not churned, and
// Stripe is still trying to collect. Trials are excluded until they convert.
const MRR_STATUSES = new Set(["active", "past_due"]);

/** Monthly recurring revenue from one subscription, minor units. Metered overage is not recurring. */
export function mrrContribution(sub: { status: string; plan: string }): number {
  if (!MRR_STATUSES.has(sub.status) || !isPlanKey(sub.plan)) return 0;
  return PLANS[sub.plan].monthlyAmount;
}
