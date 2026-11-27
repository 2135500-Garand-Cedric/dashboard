"use client";
import { createContext, useContext } from "react";
const Context = createContext<readonly string[]>([]);
export function AccessProvider({
  children,
  permissions,
}: {
  children: React.ReactNode;
  permissions: readonly string[];
}) {
  return <Context.Provider value={permissions}>{children}</Context.Provider>;
}
export function useCapability(capability: string) {
  return useContext(Context).includes(capability);
}
