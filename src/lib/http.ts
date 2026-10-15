import "server-only";
import { BillingError } from "./subscription-changes";

export function errorResponse(err: unknown): Response {
  if (err instanceof BillingError) return Response.json({ error: err.message }, { status: err.status });
  console.error("[subscription]", err);
  return Response.json({ error: "Something went wrong talking to Stripe" }, { status: 502 });
}

export const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });
