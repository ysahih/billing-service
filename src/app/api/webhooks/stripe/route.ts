import type Stripe from "stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { processEvent } from "@/lib/webhooks/process";

// Signature verification needs the exact bytes Stripe signed. In the App Router there is no
// body parser to disable (the Pages Router `config.api.bodyParser = false` does not apply):
// read the body with `request.text()` and never call `request.json()` first.
// Node runtime because Prisma and the Stripe SDK's crypto need it; never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, env().STRIPE_WEBHOOK_SECRET);
  } catch {
    // Bad signature or malformed payload: tell the sender, but do not leak details.
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await processEvent(event, {
      db,
      retrieveSubscription: (id) => stripe().subscriptions.retrieve(id),
    });
    return Response.json({ received: true, result });
  } catch (err) {
    // Nothing was committed. A 500 makes Stripe redeliver with backoff.
    console.error(`[webhook] failed to process ${event.id} (${event.type})`, err);
    return new Response("Processing failed", { status: 500 });
  }
}
