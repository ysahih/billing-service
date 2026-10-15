import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

/** Opens the Stripe Billing Portal, used here for payment methods and billing details. */
export async function POST() {
  const { APP_URL, STRIPE_PORTAL_CONFIGURATION_ID } = env();
  const user = await currentUser();
  if (!user) return Response.redirect(`${APP_URL}/login?next=/account`, 303);
  const customer = await db.customer.findUnique({ where: { userId: user.id } });
  if (!customer) return Response.redirect(`${APP_URL}/pricing`, 303);

  const session = await stripe().billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${APP_URL}/account`,
    ...(STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: STRIPE_PORTAL_CONFIGURATION_ID } : {}),
  });
  return Response.redirect(session.url, 303);
}
