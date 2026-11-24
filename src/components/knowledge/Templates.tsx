"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import TaskModal from "@/components/shared/TaskModal";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { templates } from "@/lib/knowledge/markdown";
import {
  button,
  primary,
  input,
  card,
  typeName,
  ReadState,
  Paging,
  useKnowledgeRead,
  type Page,
} from "./shared";
import Markdown from "./Markdown";
export type Template = {
  id: number;
  name: string;
  body: string;
  type: string;
  revision: number;
  archivedAt: string | null;
};
type TemplateText = { name: string; body: string; type: string };
export function TemplatePicker({
  open,
  onClose,
  onApply,
  body,
  type,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (text: string, replace: boolean) => void;
  body: string;
  type: string;
}) {
  return (
    <TaskModal open={open} title="Article templates" onClose={onClose}>
      {open && <TemplateChoices body={body} type={type} onApply={onApply} />}
    </TaskModal>
  );
}
function TemplateChoices({
  body,
  type,
  onApply,
}: {
  body: string;
  type: string;
  onApply: (text: string, replace: boolean) => void;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<TemplateText | null>(null),
    [saving, setSaving] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const {
    data,
    error: readError,
    reload,
  } = useKnowledgeRead<Page<Template>>(
    `/api/knowledge/templates?q=${encodeURIComponent(q)}&page=${page}`,
  );
  if (saving)
    return (
      <div className="space-y-3">
        <button className={button} onClick={() => setSaving(false)}>
          ← Choose a template
        </button>
        <TemplateForm
          initial={{ name: "", body, type }}
          onSaved={() => {
            setSaving(false);
            reload();
          }}
        />
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={!body.trim()} onClick={() => setSaving(true)}>
          Save current text as template
        </button>
        <Link className={button} href="/knowledge/templates">
          Manage templates
        </Link>
      </div>
      <input
        aria-label="Search templates"
        className={input}
        type="search"
        maxLength={160}
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          setPage(1);
        }}
        placeholder="Search templates…"
      />
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-400">Built-in templates</h3>
        {Object.entries(templates)
          .filter(([key]) => typeName(key).toLowerCase().includes(q.toLowerCase()))
          .map(([key, text]) => (
            <button
              className={`${button} w-full justify-start ${selected?.name === `${typeName(key)} template` ? "border-blue-500/60" : ""}`}
              key={key}
              onClick={() =>
                setSelected({ name: `${typeName(key)} template`, type: key, body: text })
              }
            >
              {typeName(key)} template
            </button>
          ))}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-400">Your templates</h3>
        {!data ? (
          <ReadState error={readError} retry={reload} />
        ) : (
          <>
            {data.items.map((row) => (
              <button
                className={`${button} w-full justify-start ${selected?.name === row.name ? "border-blue-500/60" : ""}`}
                key={row.id}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    setSelected(await workRead<Template>(`/api/knowledge/templates/${row.id}`));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not load template.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {row.name}
              </button>
            ))}
            {!data.total && <p className="text-sm text-gray-400">No custom templates yet.</p>}
            <Paging {...data} onPage={setPage} />
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
      {selected && (
        <section className="space-y-3 border-t border-card-border pt-4">
          <h3 className="font-semibold">{selected.name}</h3>
          <div className="flex flex-wrap gap-2">
            <button className={primary} onClick={() => onApply(selected.body, false)}>
              Insert at cursor
            </button>
            <button
              className={button}
              onClick={() => {
                if (!body || window.confirm("Replace the article text with this template?"))
                  onApply(selected.body, true);
              }}
            >
              Replace article text
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-blue-300">Preview template</summary>
            <Markdown body={selected.body} />
          </details>
        </section>
      )}
    </div>
  );
}
export function TemplatesPage() {
  const [q, setQ] = useState(""),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<Template | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const {
    data,
    error: readError,
    reload,
  } = useKnowledgeRead<Page<Template>>(
    `/api/knowledge/templates?q=${encodeURIComponent(q)}&archived=${archived ? 1 : 0}&page=${page}`,
  );
  return (
    <div className="space-y-5 pt-10 md:pt-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link className={button} href="/knowledge">
            ← Knowledge
          </Link>
          <h1 className="text-3xl font-bold">Templates</h1>
        </div>
        <button
          className={primary}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          New template
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Search templates"
          className={`${input} flex-1`}
          type="search"
          value={q}
          maxLength={160}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Search templates…"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => {
              setArchived(event.target.checked);
              setPage(1);
            }}
          />
          Archived
        </label>
      </div>
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
      {!data ? (
        <ReadState error={readError} retry={reload} />
      ) : (
        <>
          {!data.total && (
            <div className={card}>
              No templates yet. Create a reusable layout for your next article.
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {data.items.map((row) => (
              <div className={card} key={row.id}>
                <p className="text-xs text-blue-300">
                  {typeName(row.type)}
                  {row.archivedAt ? " · Archived" : ""}
                </p>
                <h2 className="mt-2 text-lg font-semibold">{row.name}</h2>
                <button
                  className={`${button} mt-4`}
                  onClick={async () => {
                    setError("");
                    try {
                      setEditing(await workRead<Template>(`/api/knowledge/templates/${row.id}`));
                      setOpen(true);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Unable to load template.");
                    }
                  }}
                >
                  Edit template
                </button>
              </div>
            ))}
          </div>
          <Paging {...data} onPage={setPage} />
        </>
      )}
      <TaskModal
        open={open}
        title={editing ? "Edit template" : "New template"}
        onClose={() => setOpen(false)}
      >
        {open && (
          <TemplateForm
            key={editing?.id || "new"}
            existing={editing || undefined}
            onSaved={() => {
              setOpen(false);
              reload();
            }}
          />
        )}
      </TaskModal>
    </div>
  );
}
function TemplateForm({
  existing,
  initial,
  onSaved,
}: {
  existing?: Template;
  initial?: TemplateText;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || initial?.name || ""),
    [body, setBody] = useState(existing?.body || initial?.body || ""),
    [type, setType] = useState(existing?.type || initial?.type || "REFERENCE"),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const writer = useRef(createWorkWriter());
  async function save(archived = !!existing?.archivedAt) {
    setBusy(true);
    setError("");
    try {
      await writer.current(
        existing ? `/api/knowledge/templates/${existing.id}` : "/api/knowledge/templates",
        existing ? "PATCH" : "POST",
        { name, body, type, archived },
        existing?.revision,
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save template.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="space-y-4" disabled={busy}>
        <label className="block">
          Template name
          <input
            aria-label="Template name"
            className={`${input} mt-1`}
            maxLength={160}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block">
          Type
          <select
            aria-label="Template type"
            className={`${input} mt-1`}
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {Object.keys(templates).map((value) => (
              <option key={value} value={value}>
                {typeName(value)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={button} onClick={() => setPreview(!preview)}>
          {preview ? "Write template" : "Preview template"}
        </button>
        {preview ? (
          <Markdown body={body} />
        ) : (
          <textarea
            aria-label="Template Markdown"
            className={`${input} min-h-64 font-mono text-sm`}
            maxLength={200000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <button className={primary} type="submit" disabled={!name.trim() || !body.trim() || busy}>
            {busy ? "Saving…" : "Save template"}
          </button>
          {existing && (
            <button className={button} type="button" onClick={() => save(!existing.archivedAt)}>
              {existing.archivedAt ? "Restore template" : "Archive template"}
            </button>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
    </form>
  );
}
