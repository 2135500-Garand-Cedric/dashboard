"use client";
import { useEffect, useRef } from "react";
import { useViewState } from "@/context/ViewStateContext";
export function usePersistentQuery(key: string, path: string, query: string) {
  const [saved, setSaved] = useViewState(`${key}:query`, "");
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    const current = new URLSearchParams(query);
    // Retired task filters must not return as hidden constraints when a
    // saved URL is restored after the fields have been removed.
    const retired = ["context", "company", "course"];
    if (
      retired.some((field) => current.has(field)) ||
      ["history", "all"].includes(current.get("view") || "")
    ) {
      retired.forEach((field) => current.delete(field));
      if (["history", "all"].includes(current.get("view") || "")) current.delete("view");
      window.history.replaceState(null, "", `${path}${current.size ? `?${current}` : ""}`);
      return;
    }
    if (initialized.current !== key) {
      initialized.current = key;
      if (!query && saved) {
        const restored = new URLSearchParams(saved);
        retired.forEach((field) => restored.delete(field));
        if (["history", "all"].includes(restored.get("view") || "")) restored.delete("view");
        if (restored.size) window.history.replaceState(null, "", `${path}?${restored}`);
        else setSaved("");
        return;
      }
    }
    const next = new URLSearchParams(query);
    next.delete("task");
    const value = next.toString();
    if (value !== saved) setSaved(value);
  }, [query, saved, setSaved, path, key]);
}
export function newTaskHref(params: URLSearchParams, returnTo: string) {
  const next = new URLSearchParams({ returnTo });
  for (const name of ["activityType", "project", "stage"]) {
    if (params.get(name)) next.set(name, params.get(name)!);
  }
  return `/todos/new?${next}`;
}
