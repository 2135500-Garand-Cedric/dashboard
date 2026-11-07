"use client";

import { useCallback, useEffect, useState } from "react";

export const fieldClass = "w-full min-w-0 min-h-11 text-base md:text-sm rounded-lg border border-card-border bg-card-bg px-3 py-2 text-foreground focus:outline-2 focus:outline-blue-500";
export const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
export const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-500/10 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";

export class FinanceRequestError extends Error {
  constructor(message: string, public code?: string, public existingId?: number) { super(message); }
}

export async function financeRequest<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, cache: "no-store" }); }
  catch { throw new Error("Could not reach the server. Check your connection and try again."); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new FinanceRequestError(typeof data?.error === "string" ? data.error : "Unable to complete the finance request. Please try again.", typeof data?.code === "string" ? data.code : undefined, typeof data?.existingId === "number" ? data.existingId : undefined);
  }
  return data;
}

export function useFinanceData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    financeRequest<T>(url, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load finance data.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, attempt]);
  return { data, setData, loading, error, retry };
}

export function FinanceLoadError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="card flex flex-wrap items-center justify-between gap-3" role="alert"><p className="text-rose-500">{error}</p><button type="button" onClick={retry} className={secondaryButton}>Retry</button></div>;
}

export function FinanceStatus({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500"}`}>{active ? "Active" : "Inactive"}</span>;
}
