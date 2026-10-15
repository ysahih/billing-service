import { describe, expect, it } from "vitest";
import { accessFor, canRecordUsage } from "@/lib/entitlements";
import { mrrContribution } from "@/lib/mrr";

describe("accessFor", () => {
  it.each([
    ["active", "full"],
    ["trialing", "full"],
    ["past_due", "restricted"],
    ["unpaid", "restricted"],
    ["incomplete", "restricted"],
    ["paused", "restricted"],
    ["canceled", "none"],
    ["incomplete_expired", "none"],
    [null, "none"],
  ])("%s → %s", (status, access) => expect(accessFor(status)).toBe(access));
});

describe("canRecordUsage", () => {
  const base = { status: "active", usedThisPeriod: 0, quantity: 1, includedCalls: 1_000, hasOverage: false };

  it("allows usage within quota", () => expect(canRecordUsage(base)).toEqual({ ok: true }));

  it("blocks a past_due customer even with quota left", () =>
    expect(canRecordUsage({ ...base, status: "past_due" })).toEqual({ ok: false, reason: "payment_required" }));

  it("blocks without a subscription", () =>
    expect(canRecordUsage({ ...base, status: "canceled" })).toEqual({ ok: false, reason: "no_subscription" }));

  it("hard-caps plans without overage, counting the request itself", () => {
    expect(canRecordUsage({ ...base, usedThisPeriod: 999, quantity: 1 })).toEqual({ ok: true });
    expect(canRecordUsage({ ...base, usedThisPeriod: 999, quantity: 2 })).toEqual({ ok: false, reason: "quota_exceeded" });
  });

  it("never caps plans with overage pricing", () =>
    expect(canRecordUsage({ ...base, hasOverage: true, usedThisPeriod: 5_000_000 })).toEqual({ ok: true }));
});

describe("mrrContribution", () => {
  it("counts active and past_due at the plan's monthly price", () => {
    expect(mrrContribution({ status: "active", plan: "pro" })).toBe(4_900);
    expect(mrrContribution({ status: "past_due", plan: "scale" })).toBe(19_900);
  });
  it("excludes trials, cancellations and unknown plans", () => {
    expect(mrrContribution({ status: "trialing", plan: "pro" })).toBe(0);
    expect(mrrContribution({ status: "canceled", plan: "pro" })).toBe(0);
    expect(mrrContribution({ status: "active", plan: "legacy" })).toBe(0);
  });
});
