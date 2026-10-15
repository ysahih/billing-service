"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelControls({ cancelAtPeriodEnd, periodEnd }: { cancelAtPeriodEnd: boolean; periodEnd: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "cancel" | "resume") {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/subscription/${action}`, { method: "POST" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Request failed");
      setPending(false);
      return;
    }
    // The flag flips when the webhook lands; poll briefly rather than assume.
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="text-sm">
      {cancelAtPeriodEnd ? (
        <>
          <p className="text-amber-700">Cancels at the end of the period ({periodEnd}).</p>
          <button disabled={pending} onClick={() => act("resume")} className="mt-2 rounded border border-neutral-300 bg-white px-3 py-1.5 disabled:opacity-40">
            Resume subscription
          </button>
        </>
      ) : (
        <button disabled={pending} onClick={() => act("cancel")} className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-red-700 disabled:opacity-40">
          Cancel at period end
        </button>
      )}
      {pending && <p className="mt-2 text-neutral-500">Waiting for Stripe to confirm…</p>}
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
