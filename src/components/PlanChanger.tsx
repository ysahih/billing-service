"use client";

import { useState } from "react";
import { AutoRefresh } from "./AutoRefresh";
import { formatMoney } from "@/lib/plans";

interface PlanOption {
  key: string;
  name: string;
  monthlyAmount: number;
}

interface Preview {
  prorationAmount: number;
  nextInvoiceTotal: number;
  currency: string;
  nextInvoiceDate: number | null;
  prorationDate: number;
  lines: { description: string; amount: number }[];
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "preview"; plan: PlanOption; preview: Preview }
  | { kind: "submitted"; plan: PlanOption }
  | { kind: "error"; message: string };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/**
 * Preview, then confirm. The user sees the exact prorated amount Stripe will bill before
 * anything changes; the confirm call reuses the preview's proration timestamp.
 */
export function PlanChanger({ currentPlan, plans }: { currentPlan: string; plans: PlanOption[] }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function preview(plan: PlanOption) {
    setState({ kind: "loading" });
    try {
      setState({ kind: "preview", plan, preview: await post("/api/subscription/preview", { plan: plan.key }) });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  async function confirm(plan: PlanOption, prorationDate: number) {
    setState({ kind: "loading" });
    try {
      await post("/api/subscription/change", { plan: plan.key, prorationDate });
      setState({ kind: "submitted", plan });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {plans
          .filter((p) => p.key !== currentPlan)
          .map((p) => (
            <button
              key={p.key}
              onClick={() => preview(p)}
              disabled={state.kind === "loading" || state.kind === "submitted"}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Switch to {p.name} ({formatMoney(p.monthlyAmount)}/mo)
            </button>
          ))}
      </div>

      {state.kind === "loading" && <p className="mt-3 text-sm text-neutral-500">Asking Stripe…</p>}
      {state.kind === "error" && <p className="mt-3 text-sm text-red-600">{state.message}</p>}

      {state.kind === "preview" && (
        <div className="mt-4 rounded border border-neutral-300 bg-white p-4 text-sm" data-testid="proration-preview">
          <p className="font-medium">Switch to {state.plan.name}</p>
          <ul className="mt-2 space-y-1 text-neutral-600">
            {state.preview.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>{l.description}</span>
                <span className="tabular-nums">{formatMoney(l.amount, state.preview.currency)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-neutral-200 pt-2">
            <span>Prorated adjustment</span>
            <span className="font-medium tabular-nums">{formatMoney(state.preview.prorationAmount, state.preview.currency)}</span>
          </p>
          <p className="mt-1 flex justify-between text-neutral-600">
            <span>
              Next invoice
              {state.preview.nextInvoiceDate && ` on ${new Date(state.preview.nextInvoiceDate * 1000).toLocaleDateString()}`}
            </span>
            <span className="tabular-nums">{formatMoney(state.preview.nextInvoiceTotal, state.preview.currency)}</span>
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            Prorations are added to your next invoice. Usage-based charges are billed at period end and are not included.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => confirm(state.plan, state.preview.prorationDate)}
              className="rounded bg-neutral-900 px-3 py-1.5 text-white"
            >
              Confirm change
            </button>
            <button onClick={() => setState({ kind: "idle" })} className="px-3 py-1.5 text-neutral-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.kind === "submitted" && (
        <p className="mt-3 text-sm text-neutral-600">
          <AutoRefresh />
          Change to {state.plan.name} requested. This page updates when Stripe confirms it.
        </p>
      )}
    </div>
  );
}
