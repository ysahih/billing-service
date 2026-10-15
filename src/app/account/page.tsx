import Link from "next/link";
import { CancelControls } from "@/components/CancelControls";
import { PaymentFailedBanner } from "@/components/PaymentFailedBanner";
import { PlanChanger } from "@/components/PlanChanger";
import { currentSubscription, outstandingInvoice } from "@/lib/billing";
import { accessFor } from "@/lib/entitlements";
import { PLANS, PLAN_ORDER, isPlanKey } from "@/lib/plans";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export default async function AccountPage() {
  const user = await requireUser();
  const sub = await currentSubscription(user.id);

  if (!sub) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-2 text-neutral-600">{user.email} has no subscription.</p>
        <Link href="/pricing" className="mt-4 inline-block underline">Choose a plan</Link>
      </div>
    );
  }

  const plan = isPlanKey(sub.plan) ? PLANS[sub.plan] : null;
  const access = accessFor(sub.status);
  const unpaid = access === "restricted" ? await outstandingInvoice(sub.stripeSubscriptionId) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-neutral-500">{user.email}</p>
      </div>

      {access === "restricted" && <PaymentFailedBanner invoice={unpaid} />}

      <section className="rounded border border-neutral-200 bg-white p-5">
        <h2 className="font-medium">Plan</h2>
        <p className="mt-1">
          {plan?.name ?? sub.plan} · <span data-testid="subscription-status">{sub.status}</span>
        </p>
        <p className="text-sm text-neutral-500">
          Current period ends {fmtDate(sub.currentPeriodEnd)}
        </p>
        <div className="mt-4">
          <PlanChanger
            key={sub.plan}
            currentPlan={sub.plan}
            plans={PLAN_ORDER.map((k) => ({ key: k, name: PLANS[k].name, monthlyAmount: PLANS[k].monthlyAmount }))}
          />
        </div>
        <div className="mt-6 border-t border-neutral-100 pt-4">
          <CancelControls cancelAtPeriodEnd={sub.cancelAtPeriodEnd} periodEnd={fmtDate(sub.currentPeriodEnd)} />
        </div>
      </section>
    </div>
  );
}
