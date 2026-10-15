import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { processEvent } from "@/lib/webhooks/process";
import { resetDb, seedCustomer } from "../helpers/db";
import { fixture } from "../helpers/stripe";

const retrieveSubscription = vi.fn(async () => fixture<Stripe.Subscription>("subscription"));
const deps = { db, retrieveSubscription };

beforeEach(async () => {
  await resetDb();
  retrieveSubscription.mockClear();
  await seedCustomer();
  await processEvent(fixture("checkout.session.completed"), deps);
});

describe("webhook idempotency", () => {
  it("the same event delivered twice changes state once", async () => {
    const cancel = fixture<Stripe.Event>("customer.subscription.updated"); // sets cancel_at_period_end
    const resume = fixture<Stripe.Event>("customer.subscription.updated", { id: "evt_resume", created: 1760150000 });
    (resume.data.object as Stripe.Subscription).cancel_at_period_end = false;

    expect(await processEvent(cancel, deps)).toBe("processed");
    expect(await processEvent(resume, deps)).toBe("processed");
    // Stripe redelivers the first event. Reapplying it would re-cancel the subscription.
    expect(await processEvent(cancel, deps)).toBe("duplicate");

    const sub = await db.subscription.findFirstOrThrow();
    expect(sub.cancelAtPeriodEnd).toBe(false);
    expect(await db.webhookEvent.count({ where: { stripeEventId: cancel.id } })).toBe(1);
  });

  it("a redelivered checkout does not call Stripe again", async () => {
    expect(await processEvent(fixture("checkout.session.completed"), deps)).toBe("duplicate");
    expect(retrieveSubscription).toHaveBeenCalledTimes(1);
  });

  it("two concurrent deliveries of one event: exactly one applies", async () => {
    const failed = fixture<Stripe.Event>("invoice.payment_failed");
    // Both pass the fast-path pre-check before either commits; the unique constraint decides.
    const results = await Promise.all([processEvent(failed, deps), processEvent(failed, deps)]);

    expect(results.sort()).toEqual(["duplicate", "processed"]);
    expect(await db.webhookEvent.count({ where: { stripeEventId: failed.id } })).toBe(1);
    expect(await db.invoice.count()).toBe(1);
  });

  it("many concurrent deliveries still produce one ledger row", async () => {
    const paid = fixture<Stripe.Event>("invoice.paid");
    const results = await Promise.all(Array.from({ length: 8 }, () => processEvent(paid, deps)));
    expect(results.filter((r) => r === "processed")).toHaveLength(1);
    expect(await db.webhookEvent.count({ where: { stripeEventId: paid.id } })).toBe(1);
  });
});
