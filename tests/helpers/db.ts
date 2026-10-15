import { db } from "@/lib/db";

export async function resetDb() {
  await db.$executeRawUnsafe(
    'TRUNCATE "WebhookEvent", "UsageRecord", "Invoice", "Subscription", "Customer", "User" CASCADE',
  );
}

/** The user + customer mapping that the checkout route would have created before redirecting. */
export async function seedCustomer(opts: { userId?: string; stripeCustomerId?: string; email?: string } = {}) {
  const user = await db.user.create({
    data: { id: opts.userId ?? "user_fixture", email: opts.email ?? "fixture@example.com" },
  });
  const customer = await db.customer.create({
    data: { userId: user.id, stripeCustomerId: opts.stripeCustomerId ?? "cus_QfixtureCUS" },
  });
  return { user, customer };
}
