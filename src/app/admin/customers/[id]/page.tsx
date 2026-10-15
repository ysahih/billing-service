import Link from "next/link";
import { notFound } from "next/navigation";
import { EventTable } from "@/components/EventTable";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { mrrContribution } from "@/lib/mrr";
import { formatMoney } from "@/lib/plans";
import { usageSince } from "@/lib/usage";

const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16);

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      user: true,
      subscriptions: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { periodEnd: "desc" } },
    },
  });
  if (!customer) notFound();

  const events = await db.webhookEvent.findMany({
    where: { stripeCustomerId: customer.stripeCustomerId },
    orderBy: { stripeCreatedAt: "desc" },
    take: 100,
  });
  const current = customer.subscriptions[0];
  const used = current ? await usageSince(customer.id, current.currentPeriodStart) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{customer.user.email}</h1>
        <p className="font-mono text-xs text-neutral-500">{customer.stripeCustomerId}</p>
        <p className="mt-1 text-sm text-neutral-600">
          MRR {formatMoney(current ? mrrContribution(current) : 0)} · {used.toLocaleString()} API calls this period
        </p>
      </div>

      <section>
        <h2 className="font-medium">Subscriptions</h2>
        <table className="mt-2 w-full bg-white text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b border-neutral-200">
              <th className="p-2 font-normal">Subscription</th>
              <th className="p-2 font-normal">Plan</th>
              <th className="p-2 font-normal">Status</th>
              <th className="p-2 font-normal">Period end</th>
              <th className="p-2 font-normal">Last event</th>
            </tr>
          </thead>
          <tbody>
            {customer.subscriptions.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100">
                <td className="p-2 font-mono text-xs">{s.stripeSubscriptionId}</td>
                <td className="p-2">{s.plan}</td>
                <td className="p-2">
                  <StatusPill status={s.status} />
                  {s.cancelAtPeriodEnd && <span className="ml-1 text-xs text-amber-700">cancelling</span>}
                </td>
                <td className="p-2">{fmt(s.currentPeriodEnd)}</td>
                <td className="p-2 text-neutral-500">{fmt(s.lastEventAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-medium">Invoices</h2>
        <table className="mt-2 w-full bg-white text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b border-neutral-200">
              <th className="p-2 font-normal">Invoice</th>
              <th className="p-2 font-normal">Issued</th>
              <th className="p-2 font-normal">Due / paid</th>
              <th className="p-2 font-normal">Status</th>
              <th className="p-2 font-normal">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {customer.invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-neutral-100">
                <td className="p-2 font-mono text-xs">
                  {inv.hostedInvoiceUrl ? (
                    <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="underline">{inv.stripeInvoiceId}</a>
                  ) : inv.stripeInvoiceId}
                </td>
                <td className="p-2">{fmt(inv.periodEnd)}</td>
                <td className="p-2 tabular-nums">
                  {formatMoney(inv.amountDue, inv.currency)} / {formatMoney(inv.amountPaid, inv.currency)}
                </td>
                <td className="p-2">{inv.status}</td>
                <td className="p-2">
                  {inv.attemptCount}
                  {inv.nextPaymentAttempt && <span className="text-neutral-500"> · next {fmt(inv.nextPaymentAttempt)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Webhook events</h2>
          <Link href={`/admin/events?customer=${customer.stripeCustomerId}`} className="text-sm underline">Open in event log</Link>
        </div>
        <EventTable events={events} />
      </section>
    </div>
  );
}
