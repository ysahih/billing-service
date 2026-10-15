export function StatusPill({ status }: { status?: string }) {
  const tone =
    status === "active" || status === "trialing" ? "bg-green-100 text-green-800"
    : status === "past_due" || status === "unpaid" ? "bg-red-100 text-red-800"
    : "bg-neutral-100 text-neutral-600";
  return <span className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>{status ?? "none"}</span>;
}
