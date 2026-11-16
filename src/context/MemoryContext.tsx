"use client";

import { createContext, useContext, ReactNode, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type MemoryStore = Record<string, unknown>;

interface MemoryContextType {
  get: <T = unknown>(key: string, defaultValue?: T) => T;
  set: (key: string, value: unknown) => void;
  remove: (key: string) => void;
  clear: () => void;
  pageRouter: (prev: string, page: string) => void;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

export const MemoryProvider = ({ children }: { children: ReactNode }) => {
  const [store, setStore] = useState<MemoryStore>({});
  const router = useRouter();
  const current = useRef(store);
  current.current = store;

  const get = useCallback(
    <T,>(key: string, defaultValue?: T) => (current.current[key] ?? defaultValue) as T,
    [],
  );

  const set = useCallback((key: string, value: unknown) => {
    setStore((prev) => (Object.is(prev[key], value) ? prev : { ...prev, [key]: value }));
  }, []);

  const remove = (key: string) => {
    setStore((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const clear = () => setStore({});

  const pageRouter = (prev: string, page: string) => {
    set("prev_page", prev);
    router.push(page);
  };

  return (
    <MemoryContext.Provider value={{ get, set, remove, clear, pageRouter }}>
      {children}
    </MemoryContext.Provider>
  );
};

export const useMemory = () => {
  const context = useContext(MemoryContext);
  if (!context) throw new Error("useMemory must be used within MemoryProvider");
  return context;
};
