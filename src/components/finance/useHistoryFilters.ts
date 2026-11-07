"use client";
import { useEffect, useState } from "react";

// Only applied filters enter the URL; browser back/forward restores the history view.
export function useHistoryFilters<T extends Record<string, string>>(defaults: T) {
  const [draft, setDraft] = useState(defaults), [filters, updateFilters] = useState(defaults), [page, updatePage] = useState(1);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search), next = { ...defaults };
      for (const key of Object.keys(defaults) as (keyof T)[]) next[key] = (params.get(String(key)) ?? defaults[key]) as T[keyof T];
      const value = params.get("page") ?? "1";
      setDraft(next); updateFilters(next); updatePage(/^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1);
    };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [defaults]);
  function write(next: T, nextPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    if (nextPage > 1) params.set("page", String(nextPage));
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }
  function setFilters(next: T) { updateFilters(next); updatePage(1); write(next, 1); }
  function setPage(value: number) { updatePage(value); write(filters, value); }
  return { draft, setDraft, filters, setFilters, page, setPage };
}
