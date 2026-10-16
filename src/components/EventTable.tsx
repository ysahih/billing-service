import type { WebhookEvent } from "@prisma/client";
import Link from "next/link";

const OUTCOME_TONE: Record<string, string> = {
  processed: "text-green-700",
  ignored: "text-neutral-500",
  stale: "text-amber-700",
};

const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

/**
 * The event log. `Created` is when Stripe created the event, `Received` when we committed it;
 * a large gap between them is the first thing to look at when state seems wrong.
 */
export function EventTable({
  events,
  formatPayload,
}: {
  events: WebhookEvent[];
  formatPayload: (payload: unknown) => unknown;
}) {
  if (events.length === 0) return <p className="mt-2 text-sm text-neutral-500">No events.</p>;
  return (
    <div className="mt-2 divide-y divide-neutral-100 bg-white text-sm">
      {events.map((e) => (
        <details key={e.id} className="group">
          <summary className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 p-2 sm:grid-cols-[14rem_1fr_6rem_10rem]">
            <span className="font-mono text-xs">{e.type}</span>
            <span className={`text-xs ${OUTCOME_TONE[e.outcome] ?? ""}`}>{e.outcome}</span>
            <span className="truncate font-mono text-xs text-neutral-500">
              {e.stripeCustomerId ? (
                <Link href={`/admin/events?customer=${e.stripeCustomerId}`} className="hover:underline">{e.stripeCustomerId}</Link>
              ) : "—"}
            </span>
            <span className="text-xs text-neutral-500" title={`received ${fmt(e.processedAt)}`}>
              {fmt(e.stripeCreatedAt)}
            </span>
          </summary>
          <div className="space-y-1 px-2 pb-3 text-xs text-neutral-600">
            <p>
              <span className="font-mono">{e.stripeEventId}</span> · created {fmt(e.stripeCreatedAt)} · received {fmt(e.processedAt)}
            </p>
            <pre className="max-h-96 overflow-auto rounded bg-neutral-900 p-3 text-neutral-100">
              {JSON.stringify(formatPayload(e.payload), null, 2)}
            </pre>
          </div>
        </details>
      ))}
    </div>
  );
}
