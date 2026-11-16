"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { workRead } from "@/lib/work-management/client";
import type { InitialTaskReads } from "@/lib/work-management/task-details-types";

type InitialLoad = {
  read: typeof workRead;
  ready: boolean;
  report: (key: symbol, pending: boolean) => void;
  forget: (key: symbol) => void;
};
const Context = createContext<InitialLoad | null>(null);

export default function TaskInitialLoad({
  children,
  fallback,
  initial,
}: {
  children: ReactNode;
  fallback: ReactNode;
  initial?: InitialTaskReads;
}) {
  const [ready, setReady] = useState(false);
  const revealed = useRef(false),
    mounted = useRef(false);
  const seed = useRef(initial);
  seed.current = initial;
  const read = useCallback(async <T,>(url: string): Promise<T> => {
    const entry = !revealed.current ? seed.current?.[url] : undefined;
    if (entry) {
      if (entry.error) throw new Error(entry.error);
      return entry.data as T;
    }
    return workRead<T>(url);
  }, []);
  const sections = useRef(new Map<symbol, boolean>());
  const frame = useRef<number | null>(null);
  const check = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!mounted.current || revealed.current || [...sections.current.values()].some(Boolean))
      return;
    // Wait for the complete mount/update commit, including dependent reads.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (mounted.current && ![...sections.current.values()].some(Boolean)) {
        revealed.current = true;
        setReady(true);
      }
    });
  }, []);
  const report = useCallback(
    (key: symbol, pending: boolean) => {
      if (revealed.current) return;
      sections.current.set(key, pending);
      check();
    },
    [check],
  );
  const forget = useCallback(
    (key: symbol) => {
      sections.current.delete(key);
      check();
    },
    [check],
  );
  useEffect(() => {
    mounted.current = true;
    check();
    return () => {
      mounted.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [check]);
  const value = useMemo(() => ({ ready, report, forget, read }), [ready, report, forget, read]);
  return (
    <Context.Provider value={value}>
      {!ready && fallback}
      <div hidden={!ready} aria-busy={!ready}>
        {children}
      </div>
    </Context.Provider>
  );
}

// Each initially visible section reports its whole loading state, including
// debounce delays, dependent requests and pagination. Errors also settle it.
export function useInitialTaskLoad(pending: boolean) {
  const context = useContext(Context);
  const report = context?.report,
    forget = context?.forget;
  const key = useRef(Symbol("task-section"));
  useLayoutEffect(() => {
    const token = key.current;
    report?.(token, pending);
    return () => forget?.(token);
  }, [report, forget, pending]);
}

export function useTaskContentReady() {
  return useContext(Context)?.ready ?? true;
}

// Initial reads come from the single task-details response. Once revealed,
// searches, edits, pagination and retries use their normal fresh API reads.
export function useTaskRead(): typeof workRead {
  return useContext(Context)?.read ?? workRead;
}
