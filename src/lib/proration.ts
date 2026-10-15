import type Stripe from "stripe";

// Pure helpers for plan changes. No I/O, so the money logic is unit-testable.

export interface TargetPrices {
  baseId: string;
  meteredId: string | null;
}

/**
 * The `items` diff that moves a subscription to the target plan:
 * swap the flat-fee price in place, and add / swap / remove the metered item.
 * Swapping in place (by item id) is what makes Stripe prorate rather than start fresh.
 */
export function planChangeItems(
  current: Pick<Stripe.Subscription, "items">,
  target: TargetPrices,
): Stripe.SubscriptionUpdateParams.Item[] {
  const items = current.items.data;
  const base = items.find((i) => i.price.recurring?.usage_type !== "metered");
  const metered = items.find((i) => i.price.recurring?.usage_type === "metered");
  if (!base) throw new Error("Subscription has no flat-fee item");

  const diff: Stripe.SubscriptionUpdateParams.Item[] = [{ id: base.id, price: target.baseId }];
  if (metered && target.meteredId) diff.push({ id: metered.id, price: target.meteredId });
  else if (metered && !target.meteredId) diff.push({ id: metered.id, deleted: true });
  else if (!metered && target.meteredId) diff.push({ price: target.meteredId });
  return diff;
}

export interface ProrationSummary {
  /** Net of all proration lines: credit for unused time on the old plan + charge for the new one. */
  prorationAmount: number;
  /** Total of the next invoice, prorations included. */
  nextInvoiceTotal: number;
  currency: string;
  /** When that invoice is generated (unix seconds). */
  nextInvoiceDate: number | null;
  lines: { description: string; amount: number }[];
}

export function isProrationLine(line: Stripe.InvoiceLineItem): boolean {
  const p = line.parent;
  return Boolean(p?.subscription_item_details?.proration ?? p?.invoice_item_details?.proration);
}

export function summarizePreview(invoice: Stripe.Invoice): ProrationSummary {
  const prorations = invoice.lines.data.filter(isProrationLine);
  return {
    prorationAmount: prorations.reduce((sum, l) => sum + l.amount, 0),
    nextInvoiceTotal: invoice.total,
    currency: invoice.currency,
    nextInvoiceDate: invoice.next_payment_attempt ?? invoice.period_end ?? null,
    lines: prorations.map((l) => ({ description: l.description ?? "Proration", amount: l.amount })),
  };
}

/** Previews are only honoured for a short window, so a stale tab cannot confirm an old quote. */
export const PRORATION_QUOTE_TTL_SECONDS = 15 * 60;

export function isQuoteFresh(prorationDate: number, nowSeconds: number): boolean {
  return prorationDate <= nowSeconds && nowSeconds - prorationDate <= PRORATION_QUOTE_TTL_SECONDS;
}
