import Link from "next/link";
import { CancelControls } from "@/components/CancelControls";
import { PaymentFailedBanner } from "@/components/PaymentFailedBanner";
import { PlanChanger } from "@/components/PlanChanger";
import { UsageSimulator } from "@/components/UsageSimulator";
import { currentSubscription, invoicesFor, outstandingInvoice, upcomingInvoice } from "@/lib/billing";
import { accessFor } from "@/lib/entitlements";
import { PLANS, PLAN_ORDER, formatMoney, isPlanKey } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { usageSince } from "@/lib/usage";

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
  const [used, invoices, upcoming] = await Promise.all([
    usageSince(sub.customerId, sub.currentPeriodStart),
    invoicesFor(sub.customerId),
    sub.cancelAtPeriodEnd ? null : upcomingInvoice(sub.customer.stripeCustomerId, sub.stripeSubscriptionId),
  ]);
  const included = plan?.includedCalls ?? 0;

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
          {sub.cancelAtPeriodEnd ? (
            <>Ends {fmtDate(sub.currentPeriodEnd)}, no further charges</>
          ) : upcoming ? (
            <>
              Renews {fmtDate(new Date(upcoming.date * 1000))} for {formatMoney(upcoming.amount, upcoming.currency)}
              {plan?.meteredLookupKey && " (usage so far included)"}
            </>
          ) : (
            <>Renews {fmtDate(sub.currentPeriodEnd)}</>
          )}
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

      <section className="rounded border border-neutral-200 bg-white p-5">
        <h2 className="font-medium">Usage this period</h2>
        <p className="mt-1 tabular-nums" data-testid="usage">
          {used.toLocaleString()} / {included.toLocaleString()} API calls included
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-neutral-100">
          <div
            className={`h-full ${used > included ? "bg-amber-500" : "bg-neutral-800"}`}
            style={{ width: `${included ? Math.min(100, (used / included) * 100) : 0}%` }}
          />
        </div>
        {used > included && plan?.overageCentsPerCall && (
          <p className="mt-1 text-sm text-amber-700">
            {(used - included).toLocaleString()} calls over quota, billed at {plan.overageCentsPerCall}¢ each at period end.
          </p>
        )}
        <UsageSimulator />
      </section>

      <section className="rounded border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Invoices</h2>
          <form action="/api/portal" method="POST">
            <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm">Update payment method</button>
          </form>
        </div>
        {invoices.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No invoices yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="py-1 font-normal">Period</th>
                <th className="py-1 font-normal">Amount</th>
                <th className="py-1 font-normal">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-neutral-100">
                  <td className="py-2">{fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</td>
                  <td className="py-2 tabular-nums">{formatMoney(inv.amountDue, inv.currency)}</td>
                  <td className="py-2">{inv.status}</td>
                  <td className="py-2 text-right">
                    {inv.hostedInvoiceUrl && (
                      <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="underline">View</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
