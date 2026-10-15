import "server-only";
import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | undefined;

export function stripe(): Stripe {
  client ??= new Stripe(env().STRIPE_SECRET_KEY, {
    appInfo: { name: "billing-service" },
    maxNetworkRetries: 2,
  });
  return client;
}
