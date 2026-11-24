"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { workRead, createWorkWriter } from "@/lib/work-management/client";
import { templates, linkLabel } from "@/lib/knowledge/markdown";
import { useWorkDraftGuard } from "@/components/work/useWorkDraftGuard";
import { useSnackbar } from "@/context/SnackbarContext";
import { useDateTime } from "@/context/SettingsContext";
import TaskModal from "@/components/shared/TaskModal";
import { FolderSelect } from "./Folders";
import { formatInsertion, type FormatKind } from "@/lib/knowledge/editor-format";
import WorkPicker from "./WorkPicker";
import { TemplatePicker } from "./Templates";
import { InlineImages } from "./InlineImages";
import ArticlePicker from "./ArticlePicker";
import Markdown from "./Markdown";
import {
  button,
  primary,
  input,
  card,
  typeName,
  ReadState,
  useKnowledgeRead,
  Paging,
  type Page,
} from "./shared";
export type RelatedWork = { kind: string; id: number; title: string };
export type ArticleDraft = {
  relatedWork: RelatedWork[];
  imageDraftId: string | null;
  folderId: number | null;
  title: string;
  summary: string;
  body: string;
  type: string;
  tags: string;
  pinned: boolean;
  archived: boolean;
};
export type EditableArticle = {
  folderId: number | null;
  id: number;
  revision: number;
  title: string;
  summary: string;
  body: string;
  type: string;
  tags: string[];
  pinned: boolean;
  archivedAt: string | null;
};
const drafts = new Map<string, ArticleDraft>();
export default function ArticleEditor({ id }: { id?: number }) {
  return id ? <ExistingEditor id={id} /> : <Editor />;
}
function ExistingEditor({ id }: { id: number }) {
  const { data, error, reload } = useKnowledgeRead<EditableArticle>(`/api/knowledge/${id}`);
  if (!data) return <ReadState error={error} retry={reload} />;
  return <Editor key={id} existing={data} />;
}
function Editor({ existing }: { existing?: EditableArticle }) {
  const params = useSearchParams(),
    router = useRouter(),
    { showMessage } = useSnackbar();
  const taskId =
    !existing && /^\d+$/.test(params.get("taskId") || "")
      ? Number(params.get("taskId"))
      : undefined;
  const projectId =
    !existing && /^\d+$/.test(params.get("projectId") || "")
      ? Number(params.get("projectId"))
      : undefined;
  const key = existing
    ? `article:${existing.id}`
    : `new:${taskId || ""}:${projectId || ""}:${params.get("folder") || ""}`;
  const initial: ArticleDraft = existing
    ? {
        relatedWork: [],
        imageDraftId: null,
        folderId: existing.folderId,
        title: existing.title,
        summary: existing.summary,
        body: existing.body,
        type: existing.type,
        tags: existing.tags.join(", "),
        pinned: existing.pinned,
        archived: !!existing.archivedAt,
      }
    : {
        relatedWork: [
          ...(taskId
            ? [{ kind: "task", id: taskId, title: `TASK-${String(taskId).padStart(4, "0")}` }]
            : []),
          ...(projectId
            ? [{ kind: "project", id: projectId, title: `Project #${projectId}` }]
            : []),
        ],
        imageDraftId: null,
        folderId: /^[1-9]\d*$/.test(params.get("folder") || "")
          ? Number(params.get("folder"))
          : null,
        title: params.get("title") || "",
        summary: "",
        body: "",
        type: "REFERENCE",
        tags: "",
        pinned: false,
        archived: false,
      };
  const baseline = useRef(JSON.stringify(initial));
  const [draft, setDraft] = useState<ArticleDraft>(() => ({ ...initial, ...drafts.get(key) })),
    [mode, setMode] = useState("write"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [picker, setPicker] = useState(false),
    [workOpen, setWorkOpen] = useState(false),
    [templateOpen, setTemplateOpen] = useState(false),
    [imageOpen, setImageOpen] = useState(false),
    [articleRevision, setArticleRevision] = useState(existing?.revision),
    [notesOpen, setNotesOpen] = useState(false),
    [latest, setLatest] = useState<EditableArticle | null>(null),
    [latestOpen, setLatestOpen] = useState(false);
  const current = useRef(draft),
    saved = useRef(false),
    textarea = useRef<HTMLTextAreaElement>(null),
    writer = useRef(createWorkWriter());
  current.current = draft;
  const dirty = JSON.stringify(draft) !== baseline.current;
  useWorkDraftGuard(
    () => !saved.current && JSON.stringify(current.current) !== baseline.current,
    () => {
      drafts.delete(key);
      const id = current.current.imageDraftId;
      if (id) void fetch(`/api/knowledge/drafts/${id}`, { method: "DELETE", keepalive: true });
    },
  );
  useEffect(() => {
    if (dirty) drafts.set(key, draft);
    else drafts.delete(key);
  }, [draft, dirty, key]);
  function change(value: Partial<ArticleDraft>) {
    saved.current = false;
    setDraft((old) => ({ ...old, ...value }));
  }
  const selection = useRef({ start: draft.body.length, end: draft.body.length });
  const pendingCaret = useRef<number | null>(null);
  const restoreCaret = useCallback(() => {
    const node = textarea.current,
      position = pendingCaret.current;
    if (!node || position === null) return;
    node.focus();
    node.setSelectionRange(position, position);
    selection.current = { start: position, end: position };
    if (document.activeElement === node) pendingCaret.current = null;
  }, []);
  useLayoutEffect(restoreCaret, [restoreCaret, draft.body, mode]);
  // A native picker dialog closes in its passive effect. Retry only if its modal
  // focus trap prevented the layout effect from focusing the editor.
  useEffect(restoreCaret, [restoreCaret, draft.body, mode, picker, templateOpen, imageOpen]);
  function insert(value: string, caret = value.length) {
    const start = Math.min(
      textarea.current?.selectionStart ?? selection.current.start,
      draft.body.length,
    );
    const end = Math.min(
      textarea.current?.selectionEnd ?? selection.current.end,
      draft.body.length,
    );
    pendingCaret.current = start + caret;
    change({ body: draft.body.slice(0, start) + value + draft.body.slice(end) });
    if (mode === "preview") setMode("write");
  }
  function format(kind: FormatKind) {
    const start = textarea.current?.selectionStart ?? selection.current.start;
    const end = textarea.current?.selectionEnd ?? selection.current.end;
    const formatted = formatInsertion(kind, draft.body.slice(start, end));
    insert(formatted.value, formatted.caret);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { relatedWork, imageDraftId, ...content } = draft;
      const result = await writer.current<{ id: number }>(
        existing ? `/api/knowledge/${existing.id}` : "/api/knowledge",
        existing ? "PATCH" : "POST",
        {
          ...content,
          tags: draft.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          ...(!existing
            ? {
                taskIds: relatedWork.filter((row) => row.kind === "task").map((row) => row.id),
                projectIds: relatedWork
                  .filter((row) => row.kind === "project")
                  .map((row) => row.id),
                ...(imageDraftId ? { draftId: imageDraftId } : {}),
              }
            : {}),
        },
        articleRevision,
      );
      saved.current = true;
      baseline.current = JSON.stringify(draft);
      drafts.delete(key);
      showMessage("Article saved.");
      router.push(`/knowledge/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save article.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5 pt-10 md:pt-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={existing ? `/knowledge/${existing.id}` : "/knowledge"} className={button}>
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">{existing ? "Edit article" : "New article"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400" role="status">
            {busy ? "Saving…" : dirty ? "Unsaved changes" : "No unsaved changes"}
          </span>
          <button className={primary} onClick={save} disabled={busy || !draft.title.trim()}>
            Save article
          </button>
        </div>
      </header>
      {error && (
        <div role="alert" className="rounded-lg border border-rose-500/40 p-3 text-rose-400">
          {error}
          {existing && (
            <button
              className={`${button} ml-3`}
              onClick={async () => {
                try {
                  setLatest(await workRead<EditableArticle>(`/api/knowledge/${existing.id}`));
                  setLatestOpen(true);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not load saved article.");
                }
              }}
            >
              Compare latest saved version
            </button>
          )}
        </div>
      )}
      <fieldset disabled={busy} className="space-y-4">
        <div className={`${card} grid gap-4 lg:grid-cols-[2fr_1fr]`}>
          <div className="space-y-3">
            <label className="block">
              Title
              <input
                className={`${input} mt-1 text-xl`}
                value={draft.title}
                maxLength={300}
                onChange={(event) => change({ title: event.target.value })}
              />
            </label>
            <label className="block">
              Summary
              <textarea
                className={`${input} mt-1`}
                rows={2}
                value={draft.summary}
                maxLength={1000}
                onChange={(event) => change({ summary: event.target.value })}
              />
            </label>
          </div>
          <div className="space-y-3">
            <FolderSelect value={draft.folderId} onChange={(folderId) => change({ folderId })} />
            <label className="block">
              Type
              <select
                aria-label="Article type"
                className={`${input} mt-1`}
                value={draft.type}
                onChange={(event) => change({ type: event.target.value })}
              >
                {Object.keys(templates).map((type) => (
                  <option key={type} value={type}>
                    {typeName(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Tags <span className="text-sm text-gray-400">separated by commas</span>
              <input
                className={`${input} mt-1`}
                value={draft.tags}
                onChange={(event) => change({ tags: event.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-4">
              <label>
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(event) => change({ pinned: event.target.checked })}
                />{" "}
                Pinned
              </label>
              {existing && (
                <label>
                  <input
                    type="checkbox"
                    checked={draft.archived}
                    onChange={(event) => change({ archived: event.target.checked })}
                  />{" "}
                  Archived
                </label>
              )}
            </div>
          </div>
        </div>
        {!existing && (
          <section className={card} aria-label="Related work">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Related tasks & projects</h2>
              <button className={button} type="button" onClick={() => setWorkOpen(true)}>
                Link task or project
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {draft.relatedWork.map((row) => (
                <li
                  key={`${row.kind}:${row.id}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-sm">
                    <span className="mr-2 text-gray-400">
                      {row.kind === "task" ? "Task" : "Project"}
                    </span>
                    {row.title}
                  </span>
                  <button
                    type="button"
                    className={button}
                    aria-label={`Remove ${row.title}`}
                    onClick={() =>
                      change({
                        relatedWork: draft.relatedWork.filter(
                          (item) => item.kind !== row.kind || item.id !== row.id,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {taskId &&
              draft.relatedWork.some((row) => row.kind === "task" && row.id === taskId) && (
                <button
                  type="button"
                  className={`${button} mt-3`}
                  onClick={() => setNotesOpen(true)}
                >
                  Include selected task notes
                </button>
              )}
          </section>
        )}
        <div className={card}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-black/15 p-1">
              {["write", "preview", "split"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`${button} ${mode === value ? "border-blue-500/60 text-blue-300" : "border-transparent"}`}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <button type="button" className={button} onClick={() => setTemplateOpen(true)}>
              Templates
            </button>
            <button type="button" className={button} onClick={() => setImageOpen(true)}>
              Insert image
            </button>
            <button type="button" className={button} onClick={() => format("heading")}>
              Heading
            </button>
            <button type="button" className={button} onClick={() => format("bold")}>
              Bold
            </button>
            <button type="button" className={button} onClick={() => format("code")}>
              Code
            </button>
            <button type="button" className={button} onClick={() => format("checklist")}>
              Bullet list
            </button>
            <button type="button" className={button} onClick={() => setPicker(true)}>
              Insert article link
            </button>
          </div>
          <div className={mode === "split" ? "grid gap-6 xl:grid-cols-2" : ""}>
            {mode !== "preview" && (
              <textarea
                ref={textarea}
                onSelect={(event) => {
                  selection.current = {
                    start: event.currentTarget.selectionStart,
                    end: event.currentTarget.selectionEnd,
                  };
                }}
                aria-label="Article Markdown"
                className={`${input} min-h-[55dvh] font-mono text-sm leading-7`}
                maxLength={200000}
                value={draft.body}
                onChange={(event) => change({ body: event.target.value })}
              />
            )}
            {mode !== "write" && (
              <div className="mx-auto w-full max-w-4xl">
                <Markdown body={draft.body} />
              </div>
            )}
          </div>
        </div>
      </fieldset>
      <TaskModal open={workOpen} title="Link related work" onClose={() => setWorkOpen(false)}>
        {workOpen && (
          <WorkPicker
            onLink={(kind, id, title) => {
              if (!draft.relatedWork.some((row) => row.kind === kind && row.id === id))
                change({ relatedWork: [...draft.relatedWork, { kind, id, title }] });
              setWorkOpen(false);
            }}
          />
        )}
      </TaskModal>
      <TemplatePicker
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        body={draft.body}
        type={draft.type}
        onApply={(body, replace) => {
          if (replace) {
            pendingCaret.current = body.length;
            change({ body });
            if (mode === "preview") setMode("write");
          } else insert(body);
          setTemplateOpen(false);
        }}
      />
      <InlineImages
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        articleId={existing?.id}
        articleRevision={articleRevision}
        draftId={draft.imageDraftId}
        onDraft={(id) => change({ imageDraftId: id })}
        onRevision={setArticleRevision}
        body={draft.body}
        onInsert={(text) => {
          insert(text);
          setImageOpen(false);
        }}
      />
      <ArticlePicker
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={(article) => {
          insert(`[${linkLabel(article.title)}](/knowledge/${article.id})`);
          setPicker(false);
        }}
      />
      <TaskModal
        open={notesOpen}
        title="Include selected task notes"
        onClose={() => setNotesOpen(false)}
      >
        {taskId && notesOpen && (
          <NoteSelection
            taskId={taskId}
            onInclude={(text) => {
              change({ body: draft.body + "\n\n" + text });
              setNotesOpen(false);
            }}
          />
        )}
      </TaskModal>
      <TaskModal
        open={latestOpen}
        title="Latest saved article"
        onClose={() => setLatestOpen(false)}
      >
        {latest && (
          <>
            <h3 className="text-xl font-bold">{latest.title}</h3>
            <Markdown body={latest.body} />
            <button
              className={button}
              onClick={() => {
                if (window.confirm("Discard your draft and edit the latest saved version?")) {
                  saved.current = true;
                  drafts.delete(key);
                  window.location.reload();
                }
              }}
            >
              Discard draft and reload latest
            </button>
            <p className="mt-3 text-sm text-gray-400">
              Your draft is unchanged while this comparison is open.
            </p>
          </>
        )}
      </TaskModal>
    </div>
  );
}
function NoteSelection({
  taskId,
  onInclude,
}: {
  taskId: number;
  onInclude: (text: string) => void;
}) {
  const { formatInstant } = useDateTime();
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Record<number, { body: string; createdAt: string }>>({});
  const { data, error, reload } = useKnowledgeRead<
    Page<never> & {
      notes: { id: number; body: string; createdAt: string; removedAt: string | null }[];
    }
  >(`/api/todos/${taskId}/timeline?filter=notes&page=${page}`);
  return (
    <div className="space-y-3">
      {!data ? (
        <ReadState error={error} retry={reload} />
      ) : (
        <>
          {data.notes
            .filter((note) => !note.removedAt)
            .map((note) => (
              <label key={note.id} className="flex gap-3 rounded-lg border border-card-border p-3">
                <input
                  type="checkbox"
                  checked={!!selected[note.id]}
                  onChange={(event) =>
                    setSelected((old) => {
                      const next = { ...old };
                      if (event.target.checked) next[note.id] = note;
                      else delete next[note.id];
                      return next;
                    })
                  }
                />
                <span className="whitespace-pre-wrap text-sm">{note.body}</span>
              </label>
            ))}
          <Paging {...data} onPage={setPage} />
        </>
      )}
      <button
        className={primary}
        disabled={!Object.keys(selected).length}
        onClick={() =>
          onInclude(
            Object.entries(selected)
              .map(
                ([id, note]) =>
                  `### Note from [TASK-${String(taskId).padStart(4, "0")}](/todos/${taskId})\n\nWritten ${formatInstant(note.createdAt)}\n\n${note.body}\n\nSource: task note #${id} (copied excerpt).`,
              )
              .join("\n\n"),
          )
        }
      >
        Include {Object.keys(selected).length} selected note(s)
      </button>
    </div>
  );
}
