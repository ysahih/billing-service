import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { currentSubscription } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Landing here proves only that the browser came back from Stripe. We do NOT read the
// session and mark the user subscribed; we wait for the webhook to write the subscription.
export default async function CheckoutSuccessPage() {
  const user = await requireUser();
  const subscription = await currentSubscription(user.id);

  if (!subscription) {
    return (
      <div>
        <AutoRefresh />
        <h1 className="text-2xl font-semibold">Confirming your subscription…</h1>
        <p className="mt-2 text-neutral-600">
          Payment details received. Waiting for Stripe to confirm the subscription — this usually
          takes a few seconds.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">You&apos;re subscribed</h1>
      <p className="mt-2 text-neutral-600">
        {PLANS[subscription.plan as keyof typeof PLANS]?.name ?? subscription.plan} is{" "}
        <span data-testid="subscription-status">{subscription.status}</span>.
      </p>
      <Link href="/account" className="mt-6 inline-block underline">Go to your account</Link>
    </div>
  );
}
