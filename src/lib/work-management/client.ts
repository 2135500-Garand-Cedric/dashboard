export async function workRead<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null)
    throw new Error(data?.error || "Unable to load this record. Please try again.");
  return data as T;
}

// Reuse the key for an identical retry if the response was lost. New intent or
// a newer revision gets a new key. Keys are local to this page, never persisted.
export function createWorkWriter() {
  const pending = new Map<string, string>();
  return async function write<T>(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
    revision?: number,
  ): Promise<T> {
    const identity = JSON.stringify([url, method, body ?? null, revision ?? null]);
    const key = pending.get(identity) ?? crypto.randomUUID();
    pending.set(identity, key);
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        ...(revision === undefined ? {} : { "If-Match": `"${revision}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) {
      if (!response.ok && response.status < 500) pending.delete(identity);
      throw new Error(data?.error || "Unable to save this change. Please try again.");
    }
    pending.delete(identity);
    return data as T;
  };
}
