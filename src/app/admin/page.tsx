import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { adminView } from "@/lib/admin";
import { db } from "@/lib/db";
import { mrrContribution } from "@/lib/mrr";
import { formatMoney } from "@/lib/plans";

export default async function AdminCustomersPage() {
  const admin = await adminView();
  const customers = await db.customer.findMany({
    include: {
      user: true,
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = customers.map((c) => {
    const sub = c.subscriptions[0];
    return { c, sub, mrr: sub ? mrrContribution(sub) : 0 };
  });
  const total = rows.reduce((sum, r) => sum + r.mrr, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="text-sm text-neutral-600">
          MRR <span className="font-semibold tabular-nums text-neutral-900">{formatMoney(total)}</span>
        </p>
      </div>
      <table className="mt-4 w-full bg-white text-sm">
        <thead className="text-left text-neutral-500">
          <tr className="border-b border-neutral-200">
            <th className="p-2 font-normal">Email</th>
            <th className="p-2 font-normal">Stripe customer</th>
            <th className="p-2 font-normal">Plan</th>
            <th className="p-2 font-normal">Status</th>
            <th className="p-2 text-right font-normal">MRR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, sub, mrr }) => (
            <tr key={c.id} className="border-b border-neutral-100">
              <td className="p-2">
                <Link href={`/admin/customers/${c.id}`} className="underline">{admin.email(c.user.email)}</Link>
              </td>
              <td className="p-2 font-mono text-xs">{c.stripeCustomerId}</td>
              <td className="p-2">{sub?.plan ?? "—"}</td>
              <td className="p-2"><StatusPill status={sub?.status} /></td>
              <td className="p-2 text-right tabular-nums">{formatMoney(mrr)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-neutral-500">No customers yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
