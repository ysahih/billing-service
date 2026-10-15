import "server-only";
import type { UsageRecord } from "@prisma/client";
import { currentSubscription } from "./billing";
import { db } from "./db";
import { canRecordUsage, type UsageDecision } from "./entitlements";
import { API_CALLS_METER_EVENT, PLANS, isPlanKey } from "./plans";
import { stripe } from "./stripe";

export const API_CALLS_METRIC = "api_calls";

export async function usageSince(customerId: string, since: Date): Promise<number> {
  const agg = await db.usageRecord.aggregate({
    where: { customerId, metric: API_CALLS_METRIC, recordedAt: { gte: since } },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

export type RecordResult =
  | { ok: true; record: UsageRecord; reported: boolean; usedThisPeriod: number }
  | Extract<UsageDecision, { ok: false }>;

export async function recordUsage(userId: string, quantity: number): Promise<RecordResult> {
  const sub = await currentSubscription(userId);
  if (!sub) return { ok: false, reason: "no_subscription" };
  const plan = isPlanKey(sub.plan) ? PLANS[sub.plan] : null;
  if (!plan) return { ok: false, reason: "no_subscription" };

  // Check-and-insert under a per-customer advisory lock, so concurrent requests cannot
  // jointly overshoot a hard cap.
  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sub.customerId}))`;
    const agg = await tx.usageRecord.aggregate({
      where: { customerId: sub.customerId, metric: API_CALLS_METRIC, recordedAt: { gte: sub.currentPeriodStart } },
      _sum: { quantity: true },
    });
    const used = agg._sum.quantity ?? 0;
    const decision = canRecordUsage({
      status: sub.status,
      usedThisPeriod: used,
      quantity,
      includedCalls: plan.includedCalls,
      hasOverage: plan.meteredLookupKey !== null,
    });
    if (!decision.ok) return decision;
    const record = await tx.usageRecord.create({
      data: { customerId: sub.customerId, metric: API_CALLS_METRIC, quantity },
    });
    return { ok: true as const, record, usedThisPeriod: used + quantity };
  });
  if (!outcome.ok) return outcome;

  // Only metered plans bill usage through Stripe. Reporting happens after commit, so a
  // Stripe outage never loses the local record; `pnpm usage:report` sweeps anything unreported.
  const reported = plan.meteredLookupKey ? await reportToStripe(outcome.record, sub.customer.stripeCustomerId) : false;
  return { ...outcome, reported };
}

/** Sends one usage record to the Stripe meter. Safe to retry: the record id is the idempotency identifier. */
export async function reportToStripe(record: UsageRecord, stripeCustomerId: string): Promise<boolean> {
  try {
    await stripe().billing.meterEvents.create({
      event_name: API_CALLS_METER_EVENT,
      identifier: record.id,
      timestamp: Math.floor(record.recordedAt.getTime() / 1000),
      payload: { stripe_customer_id: stripeCustomerId, value: String(record.quantity) },
    });
    await db.usageRecord.update({ where: { id: record.id }, data: { reportedAt: new Date() } });
    return true;
  } catch (err) {
    console.error(`[usage] failed to report ${record.id}; will be retried by usage:report`, err);
    return false;
  }
}
