import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@/generated/prisma";

type DB = Prisma.TransactionClient;
const scope = new AsyncLocalStorage<{ db: DB; reads: Map<string, Promise<unknown>> }>();

// Only the initial details loader shares this read-only, request-local snapshot.
// Ordinary API reads and every mutation retain their existing transactions.
export function taskReadSnapshot<T>(client: PrismaClient, read: (db: DB) => Promise<T>) {
  return client.$transaction((db) => scope.run({ db, reads: new Map() }, () => read(db)), {
    isolationLevel: "RepeatableRead",
    timeout: 10000,
  });
}
export function readSnapshot<T>(client: PrismaClient, read: (db: DB) => Promise<T>) {
  const current = scope.getStore();
  return current
    ? read(current.db)
    : client.$transaction(read, { isolationLevel: "RepeatableRead" });
}
export function memoTaskRead<T>(db: DB, key: string, read: () => Promise<T>): Promise<T> {
  const current = scope.getStore();
  if (!current || current.db !== db) return read();
  let pending = current.reads.get(key);
  if (!pending) {
    pending = read();
    current.reads.set(key, pending);
  }
  return pending as Promise<T>;
}
