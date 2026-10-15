import "server-only";
import { db } from "./db";
import { stripe } from "./stripe";

/**
 * Returns the Stripe customer for a user, creating it on first use.
 *
 * The user→customer mapping is identity, not billing state, so it is fine to write here.
 * The Stripe idempotency key means two concurrent first checkouts produce ONE Stripe
 * customer; the upsert on the unique userId makes the local row converge too.
 */
export async function getOrCreateStripeCustomer(user: { id: string; email: string }) {
  const existing = await db.customer.findUnique({ where: { userId: user.id } });
  if (existing) return existing;

  const created = await stripe().customers.create(
    { email: user.email, metadata: { userId: user.id } },
    { idempotencyKey: `customer-create-${user.id}` },
  );

  return db.customer.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, stripeCustomerId: created.id },
  });
}
