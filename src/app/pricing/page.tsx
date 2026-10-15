import Link from "next/link";
import { currentSubscription } from "@/lib/billing";
import { PLANS, PLAN_ORDER, formatMoney } from "@/lib/plans";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const user = await currentUser();
  const subscription = user ? await currentSubscription(user.id) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Pricing</h1>
      <p className="mt-2 text-neutral-600">Monthly plans. Test mode — use card 4242 4242 4242 4242.</p>
      {subscription && (
        <p className="mt-4 rounded border border-neutral-300 bg-white p-3 text-sm">
          You are on {PLANS[subscription.plan as keyof typeof PLANS]?.name ?? subscription.plan}.{" "}
          <Link href="/account" className="underline">Change plan in your account</Link>.
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key];
          return (
            <form
              key={key}
              action="/api/checkout"
              method="POST"
              className="flex flex-col rounded border border-neutral-200 bg-white p-5"
            >
              <input type="hidden" name="plan" value={key} />
              <h2 className="text-lg font-medium">{plan.name}</h2>
              <p className="mt-2 text-3xl font-semibold">
                {formatMoney(plan.monthlyAmount)}
                <span className="text-sm font-normal text-neutral-500"> / month</span>
              </p>
              <ul className="mt-4 flex-1 space-y-1 text-sm text-neutral-600">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                disabled={!!subscription}
                data-testid={`subscribe-${key}`}
                className="mt-6 rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-40"
              >
                Subscribe
              </button>
            </form>
          );
        })}
      </div>
      {!user && (
        <p className="mt-6 text-sm text-neutral-500">
          You will be asked to <Link href="/login?next=/pricing" className="underline">sign in</Link> first.
        </p>
      )}
    </div>
  );
}
