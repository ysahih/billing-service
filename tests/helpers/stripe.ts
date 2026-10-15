import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";

const FIXTURES = join(__dirname, "..", "fixtures");

/** Loads a fixture by name, with optional shallow overrides of the event envelope. */
export function fixture<T = Stripe.Event>(name: string, overrides: Partial<Stripe.Event> = {}): T {
  const data = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
  return { ...data, ...overrides } as T;
}

/** A webhook request exactly as Stripe would send it: raw JSON body + valid signature. */
export function signedRequest(event: unknown, secret = process.env.STRIPE_WEBHOOK_SECRET!): Request {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}
