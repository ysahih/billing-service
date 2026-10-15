import "server-only";
import type Stripe from "stripe";
import { stripe } from "./stripe";
import { PLANS, type PlanKey } from "./plans";

export interface PlanPrices {
  base: Stripe.Price;
  metered: Stripe.Price | null;
}

let cache: Promise<Map<string, Stripe.Price>> | undefined;

function loadPrices(): Promise<Map<string, Stripe.Price>> {
  const lookupKeys = Object.values(PLANS).flatMap((p) =>
    p.meteredLookupKey ? [p.baseLookupKey, p.meteredLookupKey] : [p.baseLookupKey],
  );
  cache ??= stripe()
    .prices.list({ lookup_keys: lookupKeys, active: true, limit: 100 })
    .then((res) => new Map(res.data.map((price) => [price.lookup_key ?? "", price])))
    .catch((err) => {
      cache = undefined; // do not cache failures
      throw err;
    });
  return cache;
}

export async function pricesFor(plan: PlanKey): Promise<PlanPrices> {
  const prices = await loadPrices();
  const def = PLANS[plan];
  const base = prices.get(def.baseLookupKey);
  if (!base) throw new Error(`Price "${def.baseLookupKey}" not found in Stripe. Run \`pnpm stripe:setup\`.`);
  const metered = def.meteredLookupKey ? (prices.get(def.meteredLookupKey) ?? null) : null;
  if (def.meteredLookupKey && !metered) {
    throw new Error(`Price "${def.meteredLookupKey}" not found in Stripe. Run \`pnpm stripe:setup\`.`);
  }
  return { base, metered };
}
