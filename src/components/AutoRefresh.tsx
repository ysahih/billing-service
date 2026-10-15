"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server component every `intervalMs` until unmounted or `maxMs` passes. */
export function AutoRefresh({ intervalMs = 2000, maxMs = 60_000 }: { intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > maxMs) clearInterval(id);
      else router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxMs]);
  return null;
}
