"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type InboxContext = { unread: number | null; error: boolean; version: number; refresh: () => void };
const Context = createContext<InboxContext | null>(null);
export function InboxProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    controller.current?.abort();
    const pending = new AbortController();
    controller.current = pending;
    try {
      const response = await fetch("/api/notifications/inbox/count", {
        cache: "no-store",
        signal: pending.signal,
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!pending.signal.aborted) {
        setUnread(data.unread);
        setError(false);
      }
    } catch {
      if (!pending.signal.aborted) setError(true);
    }
  }, []);
  const refresh = useCallback(() => {
    setVersion((value) => value + 1);
    void load();
  }, [load]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      controller.current?.abort();
    };
  }, [load, refresh]);
  return (
    <Context.Provider value={{ unread, error, version, refresh }}>{children}</Context.Provider>
  );
}
export function useInbox() {
  const context = useContext(Context);
  if (!context) throw new Error("InboxProvider is required.");
  return context;
}
