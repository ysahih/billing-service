import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { recordUsage } from "@/lib/usage";
import { resetDb, seedCustomer } from "../helpers/db";

async function subscribe(plan: string, status = "active") {
  const { user, customer } = await seedCustomer();
  await db.subscription.create({
    data: {
      customerId: customer.id,
      stripeSubscriptionId: "sub_usage",
      status,
      plan,
      priceId: `price_${plan}`,
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000),
      lastEventAt: new Date(),
    },
  });
  return user;
}

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

describe("recordUsage", () => {
  it("hard-caps Starter at its included calls", async () => {
    const user = await subscribe("starter");
    expect((await recordUsage(user.id, 1_000)).ok).toBe(true);
    expect(await recordUsage(user.id, 1)).toEqual({ ok: false, reason: "quota_exceeded" });
  });

  it("does not let concurrent requests jointly overshoot the cap", async () => {
    const user = await subscribe("starter");
    const results = await Promise.all(Array.from({ length: 5 }, () => recordUsage(user.id, 300)));
    expect(results.filter((r) => r.ok)).toHaveLength(3); // 900 of 1,000; a 4th would be 1,200
    const total = await db.usageRecord.aggregate({ _sum: { quantity: true } });
    expect(total._sum.quantity).toBe(900);
  });

  it("blocks a past_due customer", async () => {
    const user = await subscribe("pro", "past_due");
    expect(await recordUsage(user.id, 1)).toEqual({ ok: false, reason: "payment_required" });
    expect(await db.usageRecord.count()).toBe(0);
  });

  it("reports metered usage to Stripe with the record id as idempotency identifier", async () => {
    const user = await subscribe("pro");
    const create = vi.spyOn(stripe().billing.meterEvents, "create").mockResolvedValue({} as never);

    const result = await recordUsage(user.id, 42);
    if (!result.ok) throw new Error(result.reason);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "api_call",
        identifier: result.record.id,
        payload: { stripe_customer_id: "cus_QfixtureCUS", value: "42" },
      }),
    );
    expect((await db.usageRecord.findUniqueOrThrow({ where: { id: result.record.id } })).reportedAt).not.toBeNull();
  });

  it("keeps the record, unreported, when Stripe is down", async () => {
    const user = await subscribe("pro");
    vi.spyOn(stripe().billing.meterEvents, "create").mockRejectedValue(new Error("stripe down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await recordUsage(user.id, 5);
    expect(result).toMatchObject({ ok: true, reported: false });
    expect((await db.usageRecord.findFirstOrThrow()).reportedAt).toBeNull();
  });

  it("does not report Starter usage to Stripe", async () => {
    const user = await subscribe("starter");
    const create = vi.spyOn(stripe().billing.meterEvents, "create");
    await recordUsage(user.id, 1);
    expect(create).not.toHaveBeenCalled();
  });
});
