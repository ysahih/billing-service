// Masking for the public demo's admin view. Pure, so it is unit-tested.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** youssef@example.com → y•••@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

// Keys in Stripe objects that hold personal data typed in by a visitor.
const PERSONAL_KEYS = new Set([
  "name",
  "customer_name",
  "phone",
  "customer_phone",
  "address",
  "customer_address",
  "shipping",
  "customer_shipping",
  "shipping_details",
  "tax_ids",
  "customer_tax_ids",
]);

/** Deep copy of a webhook payload with personal fields redacted and emails masked. */
export function redactPayload(value: unknown): unknown {
  if (typeof value === "string") return value.replace(EMAIL, maskEmail);
  if (Array.isArray(value)) return value.map(redactPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, PERSONAL_KEYS.has(k) && v != null ? "[redacted]" : redactPayload(v)]),
    );
  }
  return value;
}
