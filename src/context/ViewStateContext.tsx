"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";

type Store = Record<string, unknown>;
type State = {
  values: Store;
  update: (key: string, value: unknown | ((previous: unknown) => unknown)) => void;
};
const Context = createContext<State | null>(null);
export function ViewStateProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Store>({});
  const update = useCallback((key: string, value: unknown | ((previous: unknown) => unknown)) => {
    setValues((old) => {
      const next = typeof value === "function" ? value(old[key]) : value;
      return Object.is(next, old[key]) ? old : { ...old, [key]: next };
    });
  }, []);
  return <Context.Provider value={{ values, update }}>{children}</Context.Provider>;
}
export function useViewState<T>(key: string, initial: T): [T, (value: SetStateAction<T>) => void] {
  const state = useContext(Context);
  if (!state) throw new Error("ViewStateProvider is required.");
  const { values, update } = state;
  const current = (values[key] === undefined ? initial : values[key]) as T;
  const set = useCallback(
    (value: SetStateAction<T>) => {
      update(key, (previous: unknown) =>
        typeof value === "function"
          ? (value as (old: T) => T)(previous === undefined ? initial : (previous as T))
          : value,
      );
    },
    [update, key, initial],
  );
  return [current, set];
}
