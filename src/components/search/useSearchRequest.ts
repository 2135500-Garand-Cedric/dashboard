"use client";
import { useEffect, useState } from "react";
import {
  searchInput,
  searchReady,
  type SearchInput,
  type SearchResponse,
} from "@/lib/search/types";
import { useSearch } from "./SearchProvider";

export function useSearchRequest(view: SearchInput["view"], active: boolean, composing: boolean) {
  const { query, kind, includeArchived, page, denied } = useSearch();
  const [data, setData] = useState<{ key: string; response: SearchResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0),
    [settled, setSettled] = useState("");
  const body = {
    query,
    kind: view === "page" && kind === "all" ? "tasks" : kind,
    includeArchived,
    view,
    page: view === "dialog" ? 1 : page,
  };
  const key = JSON.stringify(body);
  let validation = "";
  try {
    searchInput(body);
  } catch (failure) {
    validation = failure instanceof Error ? failure.message : "Enter a valid search.";
  }
  const ready = searchReady(query) && !validation && !composing;
  useEffect(() => {
    if (!active || !ready) {
      setData(null);
      setError(null);
      setSettled("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: key,
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (controller.signal.aborted) return;
          if (response.status === 401 || response.status === 403) {
            setData(null);
            denied(response.status);
            return;
          }
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Search is temporarily unavailable.");
          if (!controller.signal.aborted) {
            setData({ key, response: result });
            setError(null);
          }
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setError({
              key,
              message: failure instanceof Error ? failure.message : "Unable to search. Try again.",
            });
        })
        .finally(() => {
          if (!controller.signal.aborted) setSettled(`${key}:${refresh}`);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, ready, key, refresh, denied]);
  return {
    data: ready && data?.key === key ? data.response : null,
    error: validation || (error?.key === key ? error.message : ""),
    loading: active && ready && settled !== `${key}:${refresh}`,
    ready,
    retry: () => {
      setError(null);
      setRefresh((value) => value + 1);
    },
  };
}
