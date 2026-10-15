import { currentSubscription } from "@/lib/billing";
import { getOrCreateStripeCustomer } from "@/lib/customers";
import { env } from "@/lib/env";
import { isPlanKey } from "@/lib/plans";
import { pricesFor } from "@/lib/prices";
import { currentUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

/**
 * Creates a Checkout Session and redirects to it.
 *
 * This handler deliberately writes NO subscription state. A completed Checkout Session
 * is not proof of an active subscription; the webhook is.
 */
export async function POST(request: Request) {
  const appUrl = env().APP_URL;
  const form = await request.formData();
  const plan = form.get("plan");
  if (!isPlanKey(plan)) return new Response("Unknown plan", { status: 400 });

  const user = await currentUser();
  if (!user) return Response.redirect(`${appUrl}/login?next=/pricing`, 303);

  // Already subscribed: plan changes go through the proration preview, not a new checkout.
  if (await currentSubscription(user.id)) return Response.redirect(`${appUrl}/account`, 303);

  const customer = await getOrCreateStripeCustomer(user);
  const { base, metered } = await pricesFor(plan);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customer.stripeCustomerId,
    client_reference_id: user.id,
    line_items: [
      { price: base.id, quantity: 1 },
      // Metered prices take no quantity: usage is reported to the meter.
      ...(metered ? [{ price: metered.id }] : []),
    ],
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id, plan },
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout/cancel`,
  });

  if (!session.url) return new Response("Stripe returned no checkout URL", { status: 502 });
  return Response.redirect(session.url, 303);
}
