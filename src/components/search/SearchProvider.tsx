"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { SearchKind } from "@/lib/search/types";
import SearchDialog from "./SearchDialog";

type SearchState = {
  open: boolean;
  query: string;
  kind: SearchKind | "all";
  includeArchived: boolean;
  page: number;
  show: () => void;
  close: () => void;
  setQuery: (value: string) => void;
  setKind: (value: SearchKind | "all") => void;
  setIncludeArchived: (value: boolean) => void;
  setPage: (value: number) => void;
  clear: () => void;
  denied: (status: number) => void;
};
const Context = createContext<SearchState | null>(null);

function NavigationObserver({ close }: { close: () => void }) {
  const pathname = usePathname(),
    params = useSearchParams();
  const route = `${pathname}?${params.toString()}`;
  const previous = useRef(route);
  useEffect(() => {
    if (previous.current !== route) {
      close();
      previous.current = route;
    }
  }, [route, close]);
  return null;
}

export default function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false),
    [query, updateQuery] = useState("");
  const [kind, updateKind] = useState<SearchKind | "all">("all");
  const [includeArchived, updateArchived] = useState(false),
    [page, setPage] = useState(1);
  const currentKind = useRef(kind);
  currentKind.current = kind;
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => {
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    window.dispatchEvent(new Event("dashboard:search-open"));
    setOpen(true);
  }, []);
  const setQuery = useCallback((value: string) => {
    updateQuery(value);
    setPage(1);
  }, []);
  const setKind = useCallback((value: SearchKind | "all") => {
    if (currentKind.current !== value) {
      currentKind.current = value;
      updateKind(value);
      setPage(1);
    }
  }, []);
  const setIncludeArchived = useCallback((value: boolean) => {
    updateArchived(value);
    setPage(1);
  }, []);
  const clear = useCallback(() => {
    updateQuery("");
    setPage(1);
  }, []);
  const denied = useCallback((status: number) => {
    setOpen(false);
    updateQuery("");
    updateKind("all");
    updateArchived(false);
    setPage(1);
    window.location.assign(status === 403 ? "/access-denied" : "/api/auth/signin");
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return;
      event.preventDefault();
      show();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [show]);
  return (
    <Context.Provider
      value={{
        open,
        query,
        kind,
        includeArchived,
        page,
        show,
        close,
        setQuery,
        setKind,
        setIncludeArchived,
        setPage,
        clear,
        denied,
      }}
    >
      {children}
      <Suspense fallback={null}>
        <NavigationObserver close={close} />
      </Suspense>
      <SearchDialog />
    </Context.Provider>
  );
}
export function useSearch() {
  const value = useContext(Context);
  if (!value) throw new Error("SearchProvider is required.");
  return value;
}
