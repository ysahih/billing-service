// The plan catalog. `pnpm stripe:setup` pushes this to Stripe; at runtime prices are
// resolved by lookup_key, so no price ids live in config.

export type PlanKey = "starter" | "pro" | "scale";

export interface Plan {
  key: PlanKey;
  name: string;
  /** Flat monthly fee, minor units (USD cents). */
  monthlyAmount: number;
  /** API calls included per billing period. */
  includedCalls: number;
  /**
   * Overage price per call in cents (decimal string, as Stripe expects).
   * null = not metered: usage beyond the quota is refused instead of billed.
   */
  overageCentsPerCall: string | null;
  /** lookup_key of the licensed (flat fee) price. */
  baseLookupKey: string;
  /** lookup_key of the metered price, if any. */
  meteredLookupKey: string | null;
  features: string[];
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    monthlyAmount: 900,
    includedCalls: 1_000,
    overageCentsPerCall: null,
    baseLookupKey: "starter_monthly",
    meteredLookupKey: null,
    features: ["1,000 API calls / month", "Hard cap, no overage"],
  },
  pro: {
    key: "pro",
    name: "Pro",
    monthlyAmount: 4_900,
    includedCalls: 50_000,
    overageCentsPerCall: "0.2",
    baseLookupKey: "pro_monthly",
    meteredLookupKey: "pro_api_calls",
    features: ["50,000 API calls / month", "$0.002 per call after that"],
  },
  scale: {
    key: "scale",
    name: "Scale",
    monthlyAmount: 19_900,
    includedCalls: 500_000,
    overageCentsPerCall: "0.1",
    baseLookupKey: "scale_monthly",
    meteredLookupKey: "scale_api_calls",
    features: ["500,000 API calls / month", "$0.001 per call after that"],
  },
};

export const PLAN_ORDER: PlanKey[] = ["starter", "pro", "scale"];

/** Billing Meter that metered prices aggregate. */
export const API_CALLS_METER_EVENT = "api_call";

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && value in PLANS;
}

/** Maps a base price lookup_key back to its plan. Unknown keys return null. */
export function planFromLookupKey(lookupKey: string | null | undefined): PlanKey | null {
  if (!lookupKey) return null;
  return PLAN_ORDER.find((k) => PLANS[k].baseLookupKey === lookupKey) ?? null;
}

export function formatMoney(minor: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    minor / 100,
  );
}
