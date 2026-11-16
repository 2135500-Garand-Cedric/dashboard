"use client";
import { useRef, useState } from "react";
import { createWorkWriter } from "@/lib/work-management/client";
import type { WorkContext } from "@/lib/work-management/types";
export default function WorkContextManager({
  contexts,
  onRefresh,
}: {
  contexts: WorkContext[];
  onRefresh: () => Promise<void>;
}) {
  const write = useRef(createWorkWriter()),
    busyRef = useRef(false);
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(action: () => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
      setName("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save context.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      id="contexts"
      aria-labelledby="contexts-title"
      className="min-w-0 rounded-xl border border-card-border bg-card-bg p-5"
    >
      <h2 id="contexts-title" className="text-xl font-semibold">
        Contexts
      </h2>
      <div className="mt-3 space-y-2">
        {error && (
          <p role="alert" className="text-rose-500">
            {error}
          </p>
        )}
        {contexts.map((context) => (
          <form
            key={`${context.id}-${context.revision}`}
            className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-card-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(new FormData(event.currentTarget).get("name") || "").trim();
              if (value !== context.name)
                void save(() =>
                  write.current(
                    `/api/work-contexts/${context.id}`,
                    "PATCH",
                    { name: value },
                    context.revision,
                  ),
                );
            }}
          >
            <input
              aria-label={`Context name: ${context.name}`}
              defaultValue={context.name}
              disabled={busy}
              name="name"
              required
              maxLength={80}
              className="min-w-0 flex-1 rounded border bg-card-bg p-2"
            />
            <span className={`text-xs ${context.active ? "text-emerald-400" : "text-gray-400"}`}>
              {context.active ? "Active" : "Inactive"}
            </span>
            <button
              type="submit"
              disabled={busy}
              className="rounded border border-card-border px-3 py-2 text-sm"
            >
              Save name
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void save(() =>
                  write.current(
                    `/api/work-contexts/${context.id}`,
                    "PATCH",
                    { active: !context.active },
                    context.revision,
                  ),
                )
              }
              className="rounded border px-3 py-2 text-sm"
            >
              {context.active ? "Deactivate" : "Reactivate"}
            </button>
          </form>
        ))}
        <form
          className="flex flex-wrap gap-2 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(() => write.current("/api/work-contexts", "POST", { name }));
          }}
        >
          <input
            aria-label="New context name"
            placeholder="New context"
            maxLength={80}
            required
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded border bg-card-bg p-2"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded bg-blue-600 px-3 py-2 text-white"
          >
            Add context
          </button>
        </form>
      </div>
    </section>
  );
}
