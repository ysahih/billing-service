/**
 * Re-sends usage records that never reached Stripe (e.g. Stripe was down at request time).
 * Idempotent: each meter event uses the record id as its identifier, so a record that did
 * reach Stripe but was not marked locally is deduplicated by Stripe.
 *
 *   pnpm usage:report      (run on a schedule in production)
 */
import { db } from "@/lib/db";
import { PLANS, isPlanKey } from "@/lib/plans";
import { reportToStripe } from "@/lib/usage";

// Stripe accepts meter events up to 35 days old.
const MAX_AGE_MS = 35 * 24 * 60 * 60 * 1000;

async function main() {
  const pending = await db.usageRecord.findMany({
    where: { reportedAt: null, recordedAt: { gte: new Date(Date.now() - MAX_AGE_MS) } },
    include: { customer: { include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { recordedAt: "asc" },
  });

  let sent = 0;
  for (const record of pending) {
    const plan = record.customer.subscriptions[0]?.plan;
    // Non-metered plans (Starter) are never billed for usage; nothing to report.
    if (!isPlanKey(plan) || !PLANS[plan].meteredLookupKey) continue;
    if (await reportToStripe(record, record.customer.stripeCustomerId)) sent++;
  }
  console.log(`reported ${sent} usage record(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
