"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MESSAGES: Record<string, string> = {
  payment_required: "Blocked: payment past due.",
  quota_exceeded: "Blocked: plan quota reached. Upgrade for more calls.",
  no_subscription: "Blocked: no subscription.",
};

/** Demo control: stands in for a product API calling POST /api/usage. */
export function UsageSimulator() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function simulate(quantity: number) {
    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const json = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Recorded ${quantity} call(s)${json.reported ? ", reported to Stripe" : ""}.` : (MESSAGES[json.error] ?? "Request failed."));
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {[1, 100, 1000].map((n) => (
        <button key={n} onClick={() => simulate(n)} className="rounded border border-neutral-300 bg-white px-3 py-1.5">
          Simulate {n.toLocaleString()} call{n > 1 ? "s" : ""}
        </button>
      ))}
      {message && <span className="text-neutral-600">{message}</span>}
    </div>
  );
}
