import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { isQuoteFresh, planChangeItems, summarizePreview } from "@/lib/proration";

const item = (id: string, priceId: string, usage: "licensed" | "metered") =>
  ({ id, price: { id: priceId, recurring: { usage_type: usage } } }) as unknown as Stripe.SubscriptionItem;

const sub = (...items: Stripe.SubscriptionItem[]) =>
  ({ items: { data: items } }) as unknown as Pick<Stripe.Subscription, "items">;

describe("planChangeItems", () => {
  it("Starter → Pro swaps the flat fee in place and adds the metered price", () => {
    expect(planChangeItems(sub(item("si_base", "price_starter", "licensed")), { baseId: "price_pro", meteredId: "price_pro_calls" })).toEqual([
      { id: "si_base", price: "price_pro" },
      { price: "price_pro_calls" },
    ]);
  });

  it("Pro → Scale swaps both items in place", () => {
    const current = sub(item("si_base", "price_pro", "licensed"), item("si_meter", "price_pro_calls", "metered"));
    expect(planChangeItems(current, { baseId: "price_scale", meteredId: "price_scale_calls" })).toEqual([
      { id: "si_base", price: "price_scale" },
      { id: "si_meter", price: "price_scale_calls" },
    ]);
  });

  it("Pro → Starter removes the metered item", () => {
    const current = sub(item("si_meter", "price_pro_calls", "metered"), item("si_base", "price_pro", "licensed"));
    expect(planChangeItems(current, { baseId: "price_starter", meteredId: null })).toEqual([
      { id: "si_base", price: "price_starter" },
      { id: "si_meter", deleted: true },
    ]);
  });

  it("refuses a subscription without a flat-fee item", () => {
    expect(() => planChangeItems(sub(item("si_meter", "p", "metered")), { baseId: "x", meteredId: null })).toThrow();
  });
});

describe("summarizePreview", () => {
  const line = (amount: number, proration: boolean, description: string) =>
    ({ amount, description, parent: { type: "subscription_item_details", subscription_item_details: { proration } } }) as unknown as Stripe.InvoiceLineItem;

  // Pro ($49) → Scale ($199) exactly halfway through a 30-day period.
  const preview = {
    currency: "usd",
    total: 19_900 + 7_500,
    next_payment_attempt: 1_762_678_400,
    period_end: 1_760_000_000,
    lines: {
      data: [
        line(-2_450, true, "Unused time on Pro after 15 Oct"),
        line(9_950, true, "Remaining time on Scale after 15 Oct"),
        line(19_900, false, "1 × Scale (at $199.00 / month)"),
      ],
    },
  } as unknown as Stripe.Invoice;

  it("nets only the proration lines", () => {
    const s = summarizePreview(preview);
    expect(s.prorationAmount).toBe(7_500); // -24.50 credit + 99.50 charge
    expect(s.lines.map((l) => l.amount)).toEqual([-2_450, 9_950]);
  });

  it("reports the full next invoice total and date", () => {
    const s = summarizePreview(preview);
    expect(s.nextInvoiceTotal).toBe(27_400);
    expect(s.nextInvoiceDate).toBe(1_762_678_400);
  });

  it("is a net credit on downgrade", () => {
    const down = { ...preview, lines: { data: [line(-9_950, true, "Unused Scale"), line(2_450, true, "Remaining Pro")] } } as unknown as Stripe.Invoice;
    expect(summarizePreview(down).prorationAmount).toBe(-7_500);
  });
});

describe("isQuoteFresh", () => {
  const now = 1_760_000_000;
  it("accepts a recent quote", () => expect(isQuoteFresh(now - 60, now)).toBe(true));
  it("rejects an expired quote", () => expect(isQuoteFresh(now - 16 * 60, now)).toBe(false));
  it("rejects a quote from the future", () => expect(isQuoteFresh(now + 5, now)).toBe(false));
});
