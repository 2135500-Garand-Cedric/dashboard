"use client";

import { createContext, useContext, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";

type MemoryStore = Record<string, any>;

interface MemoryContextType {
  get: (key: string, defaultValue?: any) => any;
  set: (key: string, value: any) => void;
  remove: (key: string) => void;
  clear: () => void;
  pageRouter: (prev: string, page: string) => void;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

export const MemoryProvider = ({ children }: { children: ReactNode }) => {
  const [store, setStore] = useState<MemoryStore>({});
  const router = useRouter();

  const get = (key: string, defaultValue?: any) => store[key] ?? defaultValue;

  const set = (key: string, value: any) => {
    setStore((prev) => ({ ...prev, [key]: value }));
  };

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
