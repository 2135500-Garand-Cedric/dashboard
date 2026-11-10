"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type { SupportEditorHandle, SupportEditorState, WorkActivityEntry, WorkNote, WorkNoteVersion } from "@/lib/work-management/types";
import { valueLabel } from "@/components/todos/TaskActivityPreview";
const buttonClass = "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const inputClass = "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2 text-sm";
const timestamp = (value: string) => new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
function localTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function safeLink(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function NoteText({ body, urls }: { body: string; urls: string[] }) {
  return <><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{body}</p>{urls.length > 0 && <ul className="mt-3 space-y-2">{urls.map(url => <li key={url}>{safeLink(url) ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="break-all text-sm text-blue-400 underline">{url}</a> : <span className="text-sm text-gray-500">Invalid documentation link</span>}</li>)}</ul>}</>;
}
function RevisionHistory({ todoId, noteId }: { todoId: number; noteId: number }) {
  const [page, setPage] = useState(1), [data, setData] = useState<{ items: WorkNoteVersion[]; total: number; page: number; pageSize: number } | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setData(null); setError("");
    void workRead<{ items: WorkNoteVersion[]; total: number; page: number; pageSize: number }>(`/api/todos/${todoId}/notes/${noteId}/revisions?page=${page}`).then(value => { if (active) setData(value); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Unable to load revisions."); });
    return () => { active = false; };
  }, [todoId, noteId, page, retry]);
  return <div className="mt-3 space-y-3 border-t border-card-border pt-3">{error ? <p role="alert" className="text-sm text-rose-500">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Retry revisions</button></p> : !data ? <p role="status">Loading revisions…</p> : <>{data.items.map(version => <article key={version.id} className="space-y-2 rounded border border-card-border p-3"><p className="text-xs text-gray-500">Version {version.revision} · {timestamp(version.recordedAt)} · {version.action.replace("NOTE_", "").toLowerCase()}</p>{version.occurredAt && <p className="text-xs text-gray-500">Occurred: {timestamp(version.occurredAt)}</p>}<NoteText body={version.body || "Removed note"} urls={version.documentationUrls} /></article>)}<div className="flex flex-wrap items-center gap-2"><button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className={buttonClass}>Previous revisions</button><span className="text-xs">{data.page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)} className={buttonClass}>Next revisions</button></div></>}</div>;
}
type Draft = { editing: WorkNote | null; body: string; urls: string; occurred: string };
const drafts = new Map<number, Draft>(), writer = createWorkWriter();
const TaskTimeline = forwardRef<SupportEditorHandle, { id: number; revision: number; onStateChange: (state: SupportEditorState) => void; onRecordsChanged: () => void }>(function TaskTimeline({ id, revision, onStateChange, onRecordsChanged }, ref) {
  const cached = drafts.get(id);
  const [filter, setFilter] = useState("notes"), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{ notes: WorkNote[]; activity: (WorkActivityEntry & { noteRevision: WorkNoteVersion | null })[]; total: number; page: number; pageSize: number } | null>(null), [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(!!cached), [editing, setEditing] = useState<WorkNote | null>(cached?.editing ?? null), [body, setBody] = useState(cached?.body ?? ""), [urls, setUrls] = useState(cached?.urls ?? ""), [occurred, setOccurred] = useState(cached?.occurred ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(cached ? "Unsaved note restored." : ""), [history, setHistory] = useState<string | null>(null);
  const lock = useRef(false), liveDraft = useRef<Draft | null>(null);
  const dirty = adding && (body !== (editing?.body ?? "") || urls !== (editing?.documentationUrls.join("\n") ?? "") || occurred !== localTime(editing?.occurredAt ?? null));
  liveDraft.current = dirty ? { editing, body, urls, occurred } : null;
  const discard = useCallback(() => { drafts.delete(id); liveDraft.current = null; setAdding(false); setEditing(null); setBody(""); setUrls(""); setOccurred(""); setError(""); }, [id]);
  useImperativeHandle(ref, () => ({ discard, isDirty: () => dirty, isBusy: () => lock.current }), [discard, dirty]);
  useEffect(() => { onStateChange({ dirty, busy }); }, [dirty, busy, onStateChange]);
  useEffect(() => () => { if (liveDraft.current) drafts.set(id, liveDraft.current); }, [id]);
  useEffect(() => {
    let active = true; setData(null); setLoadError("");
    void workRead<NonNullable<typeof data>>(`/api/todos/${id}/timeline?filter=${filter}&page=${page}`).then(value => { if (active) setData(value); }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Unable to load notes and activity."); });
    return () => { active = false; };
  }, [id, revision, filter, page, refresh]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); setRefresh(value => value + 1); onRecordsChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save note."); }
    finally { lock.current = false; setBusy(false); }
  }
  function start(note: WorkNote | null) {
    if (dirty && !window.confirm("Discard the unsaved note changes?")) return;
    drafts.delete(id); setEditing(note); setBody(note?.body ?? ""); setUrls(note?.documentationUrls.join("\n") ?? ""); setOccurred(localTime(note?.occurredAt ?? null)); setAdding(true); setError("");
  }
  function card(note: WorkNote, version?: WorkNoteVersion) {
    const cardKey = `${note.id}-${version?.revision ?? "current"}`;
    const latest = !version || version.revision === note.revision;
    return <article key={`${note.id}-${version?.revision ?? "current"}`} aria-label={`Note ${note.id}${version ? ` version ${version.revision}` : ""}`} className="min-w-0 space-y-3 rounded-xl border border-card-border bg-card-bg p-4">
      <div className="flex flex-wrap justify-between gap-2"><p className="text-xs text-gray-500">Recorded <time dateTime={note.createdAt}>{timestamp(note.createdAt)}</time>{note.revision > 1 ? ` · ${note.removedAt ? "Removed" : "Edited"}` : ""}{version ? ` · Version ${version.revision}` : ""}</p>{latest && !note.removedAt && <button type="button" disabled={busy} onClick={() => start(note)} className={buttonClass}>Edit note {note.id}</button>}</div>
      {(version?.occurredAt ?? note.occurredAt) && <p className="text-xs text-gray-500">Occurred: {timestamp((version?.occurredAt ?? note.occurredAt)!)}</p>}
      {note.removedAt ? <p className="text-sm text-gray-500">Note removed. Earlier versions remain in revision history.</p> : <NoteText body={version?.body ?? note.body} urls={version?.documentationUrls ?? note.documentationUrls} />}
      <div className="flex flex-wrap gap-2"><button type="button" aria-expanded={history === cardKey} disabled={busy} onClick={() => setHistory(history === cardKey ? null : cardKey)} className={buttonClass}>Revisions for note {note.id}</button>{latest && !note.removedAt && <button type="button" disabled={busy} className={`${buttonClass} text-rose-500`} onClick={() => { if (window.confirm("Remove this note from the current notes? Earlier content remains in revision history; this does not erase it permanently.")) void perform(async () => { await writer(`/api/todos/${id}/notes/${note.id}`, "DELETE", undefined, note.revision); if (editing?.id === note.id) discard(); setNotice("Note removed; revisions retained."); }); }}>Remove note {note.id}</button>}</div>
      {history === cardKey && <RevisionHistory todoId={id} noteId={note.id} />}
    </article>;
  }
  return <section aria-label="Notes and activity" className="space-y-4 border-t border-card-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Notes and activity</h2><button type="button" disabled={busy} onClick={() => start(null)} className={buttonClass}>Add note</button></div>
    {adding && <form aria-label="Note editor" className="space-y-3 rounded-xl border border-card-border p-4" onSubmit={event => { event.preventDefault(); void perform(async () => {
      const originalOccurred = editing?.occurredAt ?? null;
      const occurredAt = occurred === localTime(originalOccurred) ? originalOccurred : occurred ? new Date(occurred).toISOString() : null;
      await writer(editing ? `/api/todos/${id}/notes/${editing.id}` : `/api/todos/${id}/notes`, editing ? "PATCH" : "POST", { body, documentationUrls: urls.split(/\r?\n/).map(value => value.trim()).filter(Boolean), occurredAt }, editing?.revision);
      discard(); setPage(1); setNotice("Note saved.");
    }); }}>
      <label className="block text-sm">Note<textarea aria-label="Note text" required maxLength={50000} rows={5} disabled={busy} value={body} onChange={event => setBody(event.target.value)} className={`${inputClass} mt-1`} /></label>
      <details open={!!urls || !!occurred}><summary className="cursor-pointer text-sm">Links and occurred-at time (optional)</summary><div className="mt-3 space-y-3"><label className="block text-sm">Documentation links (one URL per line)<textarea aria-label="Documentation links" maxLength={21000} rows={2} disabled={busy} value={urls} onChange={event => setUrls(event.target.value)} className={`${inputClass} mt-1`} /></label><label className="block text-sm">Occurred at (your local time)<input aria-label="Note occurred at" type="datetime-local" disabled={busy} value={occurred} onChange={event => setOccurred(event.target.value)} className={`${inputClass} mt-1`} /></label></div></details>
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || !body.trim()} className={`${buttonClass} bg-blue-600 text-white`}>{busy ? "Saving note…" : "Save note"}</button><button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard the unsaved note changes?")) discard(); }} className={buttonClass}>Cancel note edit</button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-rose-500">{error} Your note draft has been kept. Try saving again, or reload the timeline to review newer changes.</p>}{notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={filter === "notes"} onClick={() => { setFilter("notes"); setPage(1); }} className={`${buttonClass} ${filter === "notes" ? "bg-blue-600 text-white" : ""}`}>Notes only</button><button type="button" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setPage(1); }} className={`${buttonClass} ${filter === "all" ? "bg-blue-600 text-white" : ""}`}>All activity</button><button type="button" onClick={() => setRefresh(value => value + 1)} className={buttonClass}>Reload timeline</button></div>
    {loadError ? <p role="alert" className="text-sm text-rose-500">{loadError} <button type="button" className="underline" onClick={() => setRefresh(value => value + 1)}>Retry timeline</button></p> : !data ? <p role="status">Loading notes and activity…</p> : <>
      {filter === "notes" ? data.notes.map(note => card(note)) : data.activity.map(entry => entry.noteRevision?.note ? <div key={entry.id} className="space-y-2"><p className="text-xs capitalize text-gray-500">{entry.action.replace(/_/g, " ").toLowerCase()} · {timestamp(entry.createdAt)}</p>{card(entry.noteRevision.note, entry.noteRevision)}</div> : <article key={entry.id} className="rounded-xl border border-card-border p-4"><p className="text-sm font-medium capitalize">{entry.action.replace(/_/g, " ").toLowerCase()}</p><time className="text-xs text-gray-500" dateTime={entry.createdAt}>{timestamp(entry.createdAt)}</time><dl className="mt-3 space-y-2 text-sm">{Object.entries(entry.changes).map(([field, change]) => <div key={field} className="break-words [overflow-wrap:anywhere]"><dt className="font-medium">{field.replace(/([A-Z])/g, " $1")}</dt><dd className="whitespace-pre-wrap text-gray-500">{valueLabel(change.before)} → {valueLabel(change.after)}</dd></div>)}</dl></article>)}
      {!data.total && <p className="text-sm text-gray-500">{filter === "notes" ? "No notes yet." : "No recorded activity yet."}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{data.total} {filter === "notes" ? "notes" : "entries"} · Page {data.page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className="flex gap-2"><button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className={buttonClass}>Previous history</button><button type="button" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)} className={buttonClass}>Next history</button></div></div>
    </>}
  </section>;
});
export default TaskTimeline;
