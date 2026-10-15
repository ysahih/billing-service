// Feature gating by subscription status. Pure: the status comes from the webhook-fed read model.

export type Access = "full" | "restricted" | "none";

/**
 * full        — product works normally
 * restricted  — payment problem: billing pages work, the metered API is blocked until paid
 * none        — no subscription
 */
export function accessFor(status: string | null | undefined): Access {
  switch (status) {
    case "active":
    case "trialing":
      return "full";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "restricted";
    default:
      return "none";
  }
}

export type UsageDecision =
  | { ok: true }
  | { ok: false; reason: "no_subscription" | "payment_required" | "quota_exceeded" };

/**
 * Whether `quantity` more API calls may be recorded.
 * Plans with overage pricing never hit a quota; plans without it are hard-capped.
 */
export function canRecordUsage(input: {
  status: string | null | undefined;
  usedThisPeriod: number;
  quantity: number;
  includedCalls: number;
  hasOverage: boolean;
}): UsageDecision {
  const access = accessFor(input.status);
  if (access === "none") return { ok: false, reason: "no_subscription" };
  if (access === "restricted") return { ok: false, reason: "payment_required" };
  if (!input.hasOverage && input.usedThisPeriod + input.quantity > input.includedCalls) {
    return { ok: false, reason: "quota_exceeded" };
  }
  return { ok: true };
}
