"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { DateTime } from "@/context/SettingsContext";
import { createWorkWriter } from "@/lib/work-management/client";
import TaskModal from "@/components/shared/TaskModal";
import WorkPicker from "./WorkPicker";
import Markdown from "./Markdown";
import { FolderBreadcrumbs } from "./Folders";
import ArticleFiles from "./ArticleFiles";
import { savePrivateFile } from "./files";
import type { EditableArticle } from "./ArticleEditor";
import {
  button,
  primary,
  card,
  typeName,
  useKnowledgeRead,
  Paging,
  ReadState,
  type Page,
  type ArticleSummary,
} from "./shared";
type Detail = EditableArticle & {
  folderArchived: boolean;
  createdAt: string;
  updatedAt: string;
  backlinks: ArticleSummary[];
  outgoing: ArticleSummary[];
  tasks: { id: number; title: string; status: string }[];
  projects: { id: number; name: string; status: string }[];
  counts: { incoming: number; outgoing: number; tasks: number; projects: number };
  page: number;
  pageSize: number;
  brokenLinkCount: number;
};
export default function ArticleDetail({ id }: { id: number }) {
  const [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [linkOpen, setLinkOpen] = useState(false);
  const {
    data,
    error: readError,
    reload,
  } = useKnowledgeRead<Detail>(`/api/knowledge/${id}?page=${page}`);
  const [filesOpen, setFilesOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false);
  const writer = useRef(createWorkWriter());
  async function run(action: () => Promise<unknown>, refresh = true) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (refresh) reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save this change.");
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <ReadState error={readError} retry={reload} />;
  return (
    <div className="space-y-5 pt-10 md:pt-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/knowledge" className={button}>
          ← Knowledge
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link className={primary} href={`/knowledge/${id}/edit`}>
            Edit article
          </Link>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              run(
                () => savePrivateFile(`/api/knowledge/export?id=${id}`, `article-${id}.zip`),
                false,
              )
            }
          >
            Export article
          </button>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              run(() =>
                writer.current(
                  `/api/knowledge/${id}`,
                  "PATCH",
                  {
                    title: data.title,
                    summary: data.summary,
                    body: data.body,
                    type: data.type,
                    tags: data.tags,
                    pinned: data.pinned,
                    archived: !data.archivedAt,
                  },
                  data.revision,
                ),
              )
            }
          >
            {data.archivedAt ? "Restore from archive" : "Archive"}
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
      <FolderBreadcrumbs folderId={data.folderId} />
      {data.folderArchived && (
        <p className="text-sm text-amber-300">This article is in an archived folder.</p>
      )}
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article className={card}>
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-wrap items-center gap-2 text-sm text-blue-300">
              <span>{typeName(data.type)}</span>
              {data.pinned && <span>★ Pinned</span>}
              {data.archivedAt && (
                <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-amber-300">
                  Archived
                </span>
              )}
            </div>
            <h1 className="mt-3 break-words text-3xl font-bold sm:text-4xl">{data.title}</h1>
            {data.summary && (
              <p className="mt-4 text-lg leading-relaxed text-gray-300">{data.summary}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <span
                  className="rounded-full border border-card-border px-2 py-0.5 text-xs text-gray-400"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-4 border-b border-card-border pb-5 text-xs text-gray-400">
              Updated <DateTime value={data.updatedAt} /> · Revision {data.revision}
            </p>
            {data.brokenLinkCount > 0 && (
              <p role="alert" className="mt-3 text-amber-300">
                Some article links are unavailable. Edit the article to correct them.
              </p>
            )}
            <div className="py-3">
              <Markdown body={data.body} />
            </div>
          </div>
        </article>
        <aside className="min-w-0 space-y-4">
          <details className={card} open>
            <summary className="cursor-pointer font-semibold">Related work</summary>
            <div className="mt-4 space-y-3">
              <button className={button} onClick={() => setLinkOpen(true)}>
                Link task or project
              </button>
              <Link className={button} href={`/todos/new?knowledgeArticleId=${id}`}>
                Create linked task
              </Link>
              {data.tasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-2">
                  <Link className="min-w-0 text-sm text-blue-300" href={`/todos/${task.id}`}>
                    <span className="block text-xs text-gray-400">
                      TASK-{String(task.id).padStart(4, "0")} · {task.status.replaceAll("_", " ")}
                    </span>
                    {task.title}
                  </Link>
                  <button
                    aria-label={`Unlink ${task.title}`}
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        writer.current(`/api/knowledge/${id}/links`, "POST", {
                          kind: "task",
                          id: task.id,
                          linked: false,
                        }),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {data.projects.map((project) => (
                <div key={project.id} className="flex items-start justify-between gap-2">
                  <Link className="text-sm text-blue-300" href={`/projects/${project.id}`}>
                    {project.name}
                  </Link>
                  <button
                    aria-label={`Unlink ${project.name}`}
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        writer.current(`/api/knowledge/${id}/links`, "POST", {
                          kind: "project",
                          id: project.id,
                          linked: false,
                        }),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {!data.counts.tasks && !data.counts.projects && (
                <p className="text-sm text-gray-400">No linked tasks or projects.</p>
              )}
            </div>
          </details>
          <details className={card}>
            <summary className="cursor-pointer font-semibold">Article links & backlinks</summary>
            <div className="mt-3 space-y-3">
              <h3 className="text-sm text-gray-400">
                Links from this article ({data.counts.outgoing})
              </h3>
              {data.outgoing.map((article) => (
                <Link
                  key={article.id}
                  href={`/knowledge/${article.id}`}
                  className="block text-sm text-blue-300"
                >
                  {article.title}
                  {article.archivedAt ? " · Archived" : ""}
                </Link>
              ))}
              <h3 className="text-sm text-gray-400">
                Links to this article ({data.counts.incoming})
              </h3>
              {data.backlinks.map((article) => (
                <Link
                  key={article.id}
                  href={`/knowledge/${article.id}`}
                  className="block text-sm text-blue-300"
                >
                  {article.title}
                  {article.archivedAt ? " · Archived" : ""}
                </Link>
              ))}
            </div>
          </details>
          <Paging
            page={page}
            total={Math.max(...Object.values(data.counts))}
            pageSize={data.pageSize}
            onPage={setPage}
          />
          <details
            className={card}
            open={filesOpen}
            onToggle={(event) => setFilesOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer font-semibold">Attachments</summary>
            <div className="mt-4">{filesOpen && <ArticleFiles id={id} onChanged={reload} />}</div>
          </details>
          <details
            className={card}
            open={historyOpen}
            onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer font-semibold">Revision history</summary>
            <div className="mt-4">
              {historyOpen && (
                <History
                  id={id}
                  revision={data.revision}
                  onRestore={(revision) =>
                    run(() =>
                      writer.current(
                        `/api/knowledge/${id}`,
                        "PATCH",
                        { restoreRevision: revision },
                        data.revision,
                      ),
                    )
                  }
                />
              )}
            </div>
          </details>
        </aside>
      </div>
      <TaskModal
        open={linkOpen}
        title="Link related work"
        busy={busy}
        onClose={() => setLinkOpen(false)}
      >
        {linkOpen && (
          <WorkPicker
            onLink={(kind, workId) =>
              run(async () => {
                await writer.current(`/api/knowledge/${id}/links`, "POST", {
                  kind,
                  id: workId,
                  linked: true,
                });
                setLinkOpen(false);
              })
            }
          />
        )}
        {error && (
          <p role="alert" className="mt-3 text-rose-400">
            {error}
          </p>
        )}
      </TaskModal>
    </div>
  );
}
type Revision = EditableArticle & { revision: number; recordedAt: string; action: string };
function History({
  id,
  revision,
  onRestore,
}: {
  id: number;
  revision: number;
  onRestore: (revision: number) => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Revision | null>(null);
  const { data, error, reload } = useKnowledgeRead<Page<Revision>>(
    `/api/knowledge/${id}/revisions?page=${page}`,
  );
  return (
    <>
      {!data ? (
        <ReadState error={error} retry={reload} />
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((row) => (
              <li key={row.revision}>
                <button
                  className="text-left text-sm text-blue-300"
                  onClick={() => setSelected(row)}
                >
                  Revision {row.revision} · {row.action.replaceAll("_", " ")}
                  <span className="block text-xs text-gray-400">
                    <DateTime value={row.recordedAt} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Paging {...data} onPage={setPage} />
        </>
      )}
      <TaskModal
        open={!!selected}
        title={selected ? `Revision ${selected.revision}` : "Revision"}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <h3 className="text-xl font-bold">{selected.title}</h3>
            <p className="text-gray-400">{selected.summary}</p>
            <p className="mt-2 text-sm text-gray-400">
              {typeName(selected.type)} · {selected.tags.join(", ")}
            </p>
            <Markdown body={selected.body} />
            <button
              className={`${primary} mt-4`}
              disabled={selected.revision === revision}
              onClick={() => {
                if (
                  window.confirm(
                    "Restore this content as a new revision? Related work and files remain unchanged.",
                  )
                ) {
                  onRestore(selected.revision);
                  setSelected(null);
                }
              }}
            >
              Restore this content
            </button>
          </>
        )}
      </TaskModal>
    </>
  );
}
