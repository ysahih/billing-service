/**
 * Pushes the plan catalog (src/lib/plans.ts) to Stripe TEST mode. Safe to re-run:
 * every object is found by a stable identifier before anything is created.
 *
 *   pnpm stripe:setup
 */
import Stripe from "stripe";
import { API_CALLS_METER_EVENT, PLANS, PLAN_ORDER } from "../src/lib/plans";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY must be a test-mode key (sk_test_…). Refusing to run.");
  process.exit(1);
}
const stripe = new Stripe(key);

async function ensureMeter(): Promise<Stripe.Billing.Meter> {
  for await (const meter of stripe.billing.meters.list({ status: "active" })) {
    if (meter.event_name === API_CALLS_METER_EVENT) return meter;
  }
  return stripe.billing.meters.create({
    display_name: "API calls",
    event_name: API_CALLS_METER_EVENT,
    default_aggregation: { formula: "sum" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
    value_settings: { event_payload_key: "value" },
  });
}

async function ensureProduct(id: string, name: string): Promise<Stripe.Product> {
  try {
    return await stripe.products.retrieve(id);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") {
      return stripe.products.create({ id, name });
    }
    throw err;
  }
}

async function main() {
  const meter = await ensureMeter();
  console.log(`meter      ${meter.id} (${meter.event_name})`);

  const existing = new Map<string, Stripe.Price>();
  const allKeys = PLAN_ORDER.flatMap((k) => [PLANS[k].baseLookupKey, PLANS[k].meteredLookupKey ?? []].flat());
  const listed = await stripe.prices.list({ lookup_keys: allKeys, active: true, limit: 100 });
  for (const p of listed.data) if (p.lookup_key) existing.set(p.lookup_key, p);

  for (const key of PLAN_ORDER) {
    const plan = PLANS[key];
    const product = await ensureProduct(`billing_service_${plan.key}`, plan.name);

    const base =
      existing.get(plan.baseLookupKey) ??
      (await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: plan.monthlyAmount,
        recurring: { interval: "month", usage_type: "licensed" },
        lookup_key: plan.baseLookupKey,
        nickname: `${plan.name} monthly`,
      }));
    console.log(`${plan.key.padEnd(10)} ${base.id} (${plan.baseLookupKey})`);

    if (plan.meteredLookupKey && plan.overageCentsPerCall) {
      // Graduated tiers: the included quota is free, overage is billed per call.
      const metered =
        existing.get(plan.meteredLookupKey) ??
        (await stripe.prices.create({
          product: product.id,
          currency: "usd",
          recurring: { interval: "month", usage_type: "metered", meter: meter.id },
          billing_scheme: "tiered",
          tiers_mode: "graduated",
          tiers: [
            { up_to: plan.includedCalls, unit_amount: 0 },
            { up_to: "inf", unit_amount_decimal: Stripe.Decimal.from(plan.overageCentsPerCall) },
          ],
          lookup_key: plan.meteredLookupKey,
          nickname: `${plan.name} API calls`,
        }));
      console.log(`${"".padEnd(10)} ${metered.id} (${plan.meteredLookupKey})`);
    }
  }

  // Portal is used for payment methods and invoice history only. Plan changes and
  // cancellation go through the app so the user sees the proration preview first.
  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const portal =
    configs.data.find((c) => c.metadata?.app === "billing-service") ??
    (await stripe.billingPortal.configurations.create({
      metadata: { app: "billing-service" },
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
        subscription_cancel: { enabled: false },
      },
    }));
  console.log(`\nportal     ${portal.id}`);
  console.log(`\nAdd to .env:\nSTRIPE_PORTAL_CONFIGURATION_ID="${portal.id}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
