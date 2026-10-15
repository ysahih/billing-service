import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { resetDb, seedCustomer } from "../helpers/db";
import { fixture, signedRequest } from "../helpers/stripe";

// Each test drives the real route handler: raw body → signature check → processor → Postgres.
// The only Stripe API call (subscription retrieve after checkout) is stubbed.

const send = async (event: unknown) => {
  const res = await POST(signedRequest(event));
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
};

const sub = () => db.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: "sub_1QfixtureSUB" } });

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  vi.spyOn(stripe().subscriptions, "retrieve").mockResolvedValue(
    fixture<Stripe.Subscription>("subscription") as never,
  );
});

async function subscribed() {
  await seedCustomer();
  await send(fixture("checkout.session.completed"));
}

describe("signature verification", () => {
  it("rejects a body signed with the wrong secret and records nothing", async () => {
    const res = await POST(signedRequest(fixture("checkout.session.completed"), "whsec_wrong"));
    expect(res.status).toBe(400);
    expect(await db.webhookEvent.count()).toBe(0);
  });

  it("rejects a body altered after signing", async () => {
    const req = signedRequest(fixture("invoice.paid"));
    const tampered = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: (await req.text()).replace('"amount_paid":4900', '"amount_paid":1'),
    });
    expect((await POST(tampered)).status).toBe(400);
  });

  it("rejects a request without a signature header", async () => {
    const res = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});

describe("checkout.session.completed", () => {
  it("creates the subscription from the Stripe subscription, not from the session", async () => {
    await seedCustomer();
    const { status, body } = await send(fixture("checkout.session.completed"));

    expect(status).toBe(200);
    expect(body).toEqual({ received: true, result: "processed" });
    expect(stripe().subscriptions.retrieve).toHaveBeenCalledWith("sub_1QfixtureSUB");
    expect(await sub()).toMatchObject({
      status: "active",
      plan: "pro",
      priceId: "price_pro_monthly",
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(1760000000 * 1000),
      currentPeriodEnd: new Date(1762678400 * 1000),
    });
  });

  it("creates the Customer mapping if the checkout route did not", async () => {
    await db.user.create({ data: { id: "user_fixture", email: "fixture@example.com" } });
    await send(fixture("checkout.session.completed"));
    expect(await db.customer.findUnique({ where: { stripeCustomerId: "cus_QfixtureCUS" } })).toMatchObject({
      userId: "user_fixture",
    });
    expect((await sub()).status).toBe("active");
  });
});

describe("customer.subscription.updated", () => {
  it("applies plan, period end and cancel_at_period_end", async () => {
    await subscribed();
    await send(fixture("customer.subscription.updated"));
    expect(await sub()).toMatchObject({ plan: "scale", priceId: "price_scale_monthly", cancelAtPeriodEnd: true });
  });

  it("ignores an event older than the state already applied", async () => {
    await subscribed();
    await send(fixture("customer.subscription.updated")); // created 1760100000

    const delayed = fixture<Stripe.Event>("customer.subscription.updated", { id: "evt_delayed", created: 1760050000 });
    (delayed.data.object as Stripe.Subscription).cancel_at_period_end = false;
    const { body } = await send(delayed);

    expect(body.result).toBe("stale");
    expect((await sub()).cancelAtPeriodEnd).toBe(true);
    expect((await db.webhookEvent.findUniqueOrThrow({ where: { stripeEventId: "evt_delayed" } })).outcome).toBe("stale");
  });
});

describe("customer.subscription.deleted", () => {
  it("marks the subscription canceled", async () => {
    await subscribed();
    await send(fixture("customer.subscription.deleted"));
    expect((await sub()).status).toBe("canceled");
  });
});

describe("failed payment and recovery", () => {
  it("invoice.payment_failed records the invoice and sets past_due", async () => {
    await subscribed();
    await send(fixture("invoice.payment_failed"));

    expect((await sub()).status).toBe("past_due");
    expect(await db.invoice.findUniqueOrThrow({ where: { stripeInvoiceId: "in_1QfixtureINV" } })).toMatchObject({
      status: "open",
      amountDue: 4900,
      amountPaid: 0,
      attemptCount: 1,
      nextPaymentAttempt: new Date(1760432000 * 1000),
      hostedInvoiceUrl: expect.stringContaining("invoice.stripe.com"),
      stripeSubscriptionId: "sub_1QfixtureSUB",
    });
  });

  it("a later invoice.paid clears past_due and updates the same invoice row", async () => {
    await subscribed();
    await send(fixture("invoice.payment_failed"));
    await send(fixture("invoice.paid"));

    expect((await sub()).status).toBe("active");
    const invoices = await db.invoice.findMany();
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ status: "paid", amountPaid: 4900, nextPaymentAttempt: null });
  });

  it("a payment_failed delivered after the invoice was paid does not regress it", async () => {
    await subscribed();
    await send(fixture("invoice.paid"));
    await send(fixture("invoice.payment_failed")); // created earlier, delivered later

    expect((await db.invoice.findFirstOrThrow()).status).toBe("paid");
    expect((await sub()).status).toBe("active");
  });

  it("invoice status changes do not block a newer subscription snapshot", async () => {
    await subscribed();
    await send(fixture("invoice.payment_failed")); // created 1760000300
    // A plan change created after the failure must still apply.
    await send(fixture("customer.subscription.updated")); // created 1760100000
    expect((await sub()).plan).toBe("scale");
  });
});

describe("other events", () => {
  it("customer.subscription.trial_will_end is logged and acknowledged", async () => {
    await subscribed();
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const { status, body } = await send(fixture("customer.subscription.trial_will_end"));
    expect(status).toBe(200);
    expect(body.result).toBe("processed");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("trial ending for sub_1QfixtureSUB"));
  });

  it("unknown event types return 200 and are recorded as ignored", async () => {
    const { status, body } = await send({
      id: "evt_unknown",
      object: "event",
      type: "charge.dispute.funds_withdrawn",
      created: 1760000000,
      data: { object: { object: "dispute", customer: "cus_QfixtureCUS" } },
    });
    expect(status).toBe(200);
    expect(body.result).toBe("ignored");
    expect(await db.webhookEvent.findUniqueOrThrow({ where: { stripeEventId: "evt_unknown" } })).toMatchObject({
      outcome: "ignored",
      stripeCustomerId: "cus_QfixtureCUS",
    });
  });

  it("a handler failure returns 500 and rolls back, ledger row included, so the retry can succeed", async () => {
    // No local customer and no userId metadata: the handler cannot attach the subscription.
    const orphan = fixture<Stripe.Event>("customer.subscription.updated");
    (orphan.data.object as Stripe.Subscription).metadata = {};
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await send(orphan)).status).toBe(500);
    expect(await db.webhookEvent.count()).toBe(0);
    expect(await db.subscription.count()).toBe(0);

    // The customer mapping appears; Stripe retries the same event; it now applies.
    await seedCustomer();
    expect((await send(orphan)).body.result).toBe("processed");
  });
});
