"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import ContactManager from "@/components/work/ContactManager";
import WorkContextManager from "@/components/todos/WorkContextManager";
import { workRead } from "@/lib/work-management/client";
import type { WorkContext } from "@/lib/work-management/types";
export default function WorkDirectoryPage() {
  const [contexts, setContexts] = useState<WorkContext[] | null>(null),
    [error, setError] = useState("");
  async function reload() {
    setError("");
    try {
      setContexts(await workRead<WorkContext[]>("/api/work-contexts"));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load contexts.");
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  return (
    <div className="mx-auto max-w-7xl space-y-5 pt-12 md:pt-2">
      <Link href="/todos" className="inline-block rounded border border-card-border px-4 py-2">
        ← All Work
      </Link>
      <h1 className="text-2xl font-bold">Contexts & contacts</h1>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {error && (
          <p role="alert">
            {error} <button onClick={() => void reload()}>Retry contexts</button>
          </p>
        )}
        {contexts ? (
          <WorkContextManager contexts={contexts} onRefresh={reload} />
        ) : (
          !error && <p role="status">Loading contexts…</p>
        )}
        <ContactManager />
      </div>
    </div>
  );
}
