"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTaskRead, useInitialTaskLoad } from "@/components/work/TaskInitialLoad";
import { createWorkWriter } from "@/lib/work-management/client";
import ArticlePicker from "./ArticlePicker";
import { button, card, Paging, ReadState, type ArticleSummary, type Page } from "./shared";
export default function WorkDocumentation({
  kind,
  id,
  title,
}: {
  kind: "task" | "project";
  id: number;
  title: string;
}) {
  return (
    <section aria-label="Documentation" className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Documentation</h2>
        <Link
          className={button}
          href={`/knowledge/new?${kind === "task" ? "taskId" : "projectId"}=${id}&title=${encodeURIComponent(title)}`}
        >
          Create article
        </Link>
      </div>
      <WorkArticles kind={kind} id={id} />
      {kind === "project" && (
        <div className="mt-4 border-t border-card-border pt-3">
          <h3 className="mb-3 text-sm font-medium text-gray-400">From project tasks</h3>
          <WorkArticles kind={kind} id={id} indirect />
        </div>
      )}
    </section>
  );
}
function WorkArticles({
  kind,
  id,
  indirect = false,
}: {
  kind: string;
  id: number;
  indirect?: boolean;
}) {
  const read = useTaskRead(),
    [page, setPage] = useState(1),
    [data, setData] = useState<Page<ArticleSummary> | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false);
  const writer = useRef(createWorkWriter());
  const url = `/api/knowledge/work?kind=${kind}&id=${id}&page=${page}${indirect ? "&indirect=1" : ""}`;
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void read<Page<ArticleSummary>>(url)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [read, url, refresh]);
  useInitialTaskLoad(!data && !error);
  async function link(article: ArticleSummary, linked: boolean) {
    setBusy(true);
    setError("");
    try {
      await writer.current(`/api/knowledge/${article.id}/links`, "POST", { kind, id, linked });
      setPicker(false);
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change documentation links.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {!indirect && (
        <button className={button} disabled={busy} onClick={() => setPicker(true)}>
          Link article
        </button>
      )}
      {!data ? (
        <ReadState error={error} retry={() => setRefresh((value) => value + 1)} />
      ) : (
        <>
          {error && (
            <p role="alert" className="text-rose-400">
              {error}
            </p>
          )}
          <ul className="space-y-3">
            {data.items.map((article) => (
              <li key={article.id} className="flex items-start justify-between gap-3">
                <Link href={`/knowledge/${article.id}`} className="text-blue-300">
                  {article.title}
                  {article.archivedAt ? " · Archived" : ""}
                </Link>
                {!indirect && (
                  <button
                    className={button}
                    aria-label={`Unlink ${article.title}`}
                    disabled={busy}
                    onClick={() => link(article, false)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!data.total && <p className="text-sm text-gray-400">No linked articles.</p>}
          <Paging {...data} onPage={setPage} />
        </>
      )}
      <ArticlePicker
        open={picker}
        onClose={() => {
          if (!busy) setPicker(false);
        }}
        onSelect={(article) => {
          if (!busy) void link(article, true);
        }}
      />
    </div>
  );
}
