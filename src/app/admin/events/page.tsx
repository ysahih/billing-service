import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { EventTable } from "@/components/EventTable";
import { db } from "@/lib/db";

const PAGE_SIZE = 50;

type Filters = { type?: string; outcome?: string; customer?: string; q?: string; before?: string };

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const where: Prisma.WebhookEventWhereInput = {
    ...(f.type ? { type: f.type } : {}),
    ...(f.outcome ? { outcome: f.outcome } : {}),
    ...(f.customer ? { stripeCustomerId: f.customer.trim() } : {}),
    ...(f.q ? { stripeEventId: { contains: f.q.trim() } } : {}),
    ...(f.before ? { processedAt: { lt: new Date(f.before) } } : {}),
  };

  const [events, types, counts] = await Promise.all([
    db.webhookEvent.findMany({ where, orderBy: { processedAt: "desc" }, take: PAGE_SIZE + 1 }),
    db.webhookEvent.findMany({ distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } }),
    db.webhookEvent.groupBy({ by: ["outcome"], _count: true }),
  ]);
  const page = events.slice(0, PAGE_SIZE);
  const next = events.length > PAGE_SIZE ? page[page.length - 1]?.processedAt.toISOString() : null;
  const nextQuery = next ? new URLSearchParams({ ...stripEmpty(f), before: next }).toString() : null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Webhook events</h1>
        <p className="text-xs text-neutral-500">
          {counts.map((c) => `${c._count} ${c.outcome}`).join(" · ") || "none yet"}
        </p>
      </div>

      <form className="mt-4 flex flex-wrap gap-2 text-sm" method="GET">
        <select name="type" defaultValue={f.type ?? ""} className="rounded border border-neutral-300 bg-white px-2 py-1">
          <option value="">All types</option>
          {types.map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
        </select>
        <select name="outcome" defaultValue={f.outcome ?? ""} className="rounded border border-neutral-300 bg-white px-2 py-1">
          <option value="">All outcomes</option>
          <option value="processed">processed</option>
          <option value="ignored">ignored</option>
          <option value="stale">stale</option>
        </select>
        <input name="customer" defaultValue={f.customer ?? ""} placeholder="cus_…" className="rounded border border-neutral-300 px-2 py-1 font-mono" />
        <input name="q" defaultValue={f.q ?? ""} placeholder="evt_…" className="rounded border border-neutral-300 px-2 py-1 font-mono" />
        <button className="rounded bg-neutral-900 px-3 py-1 text-white">Filter</button>
        <Link href="/admin/events" className="px-2 py-1 text-neutral-500">Reset</Link>
      </form>

      <EventTable events={page} />

      {nextQuery && (
        <Link href={`/admin/events?${nextQuery}`} className="mt-4 inline-block text-sm underline">Older events →</Link>
      )}
    </div>
  );
}

function stripEmpty(f: Filters): Record<string, string> {
  return Object.fromEntries(Object.entries(f).filter(([k, v]) => v && k !== "before")) as Record<string, string>;
}
