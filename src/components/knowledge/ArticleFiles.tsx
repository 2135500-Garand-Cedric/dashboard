"use client";
/* eslint-disable @next/next/no-img-element -- Private originals are authenticated. */
import { useRef, useState } from "react";
import TaskModal from "@/components/shared/TaskModal";
import PrivatePdfPreview from "@/components/documents/PrivatePdfPreview";
import { createWorkWriter } from "@/lib/work-management/client";
import { savePrivateFile } from "./files";
import { button, input, primary, useKnowledgeRead, ReadState, Paging, type Page } from "./shared";
type Attachment = {
  id: number;
  originalName: string;
  mimeType: string;
  byteSize: number;
  revision: number;
  removedAt: string | null;
  cleanupPending: boolean;
};
const uploadKeys = new WeakMap<File, Map<string, string>>();
export default function ArticleFiles({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [page, setPage] = useState(1),
    [file, setFile] = useState<File | null>(null),
    [replace, setReplace] = useState<Attachment | null>(null),
    [view, setView] = useState<Attachment | null>(null),
    [renaming, setRenaming] = useState<Attachment | null>(null),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const writer = useRef(createWorkWriter());
  const base = `/api/knowledge/${id}/attachments`,
    { data, error: readError, reload } = useKnowledgeRead<Page<Attachment>>(`${base}?page=${page}`);
  function url(item: Attachment) {
    return `${base}/${item.id}/file`;
  }
  async function run(action: () => Promise<unknown>, changed = false) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (changed) {
        reload();
        onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "File operation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file) return;
    let keys = uploadKeys.get(file);
    if (!keys) {
      keys = new Map();
      uploadKeys.set(file, keys);
    }
    const endpoint = replace ? `${base}/${replace.id}` : base,
      identity = `${endpoint}:${replace?.revision || 0}`;
    const key = keys.get(identity) || crypto.randomUUID();
    keys.set(identity, key);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(endpoint, {
      method: replace ? "PATCH" : "POST",
      headers: {
        "Idempotency-Key": key,
        ...(replace ? { "If-Match": `"${replace.revision}"` } : {}),
      },
      body: form,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status < 500) keys.delete(identity);
      throw new Error(body?.error || "Upload could not be confirmed. Retry safely.");
    }
    keys.delete(identity);
    setFile(null);
    setReplace(null);
  }
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
      <label className="block text-sm">
        {replace ? `Replace ${replace.originalName}` : "Add image or PDF (up to 15 MB)"}
        <input
          key={`${replace?.id || 0}:${file?.name || ""}`}
          className={`${input} mt-2`}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          disabled={busy}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            setError("");
            if (selected && (!selected.size || selected.size > 15 * 1024 * 1024)) {
              setError("Choose a nonempty image or PDF up to 15 MB.");
              return;
            }
            setFile(selected || null);
          }}
        />
      </label>
      {file && (
        <button className={primary} disabled={busy} onClick={() => run(upload, true)}>
          Upload {replace ? "replacement" : "file"}
        </button>
      )}
      {replace && (
        <button
          className={button}
          onClick={() => {
            setReplace(null);
            setFile(null);
          }}
        >
          Cancel replacement
        </button>
      )}
      {!data ? (
        <ReadState error={readError} retry={reload} />
      ) : (
        <>
          {!data.total && <p className="text-sm text-gray-400">No attachments yet.</p>}
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li key={item.id} className="min-w-0 rounded-lg border border-card-border p-3">
                <p className="break-words font-medium">{item.originalName}</p>
                {item.removedAt ? (
                  <span className="text-sm text-gray-400">Removed</span>
                ) : (
                  <>
                    <p className="text-xs text-gray-400">{Math.ceil(item.byteSize / 1024)} KB</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className={button}
                        onClick={() => {
                          setView(item);
                          setError("");
                        }}
                      >
                        Open
                      </button>
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            savePrivateFile(`${url(item)}?v=${item.revision}`, item.originalName),
                          )
                        }
                      >
                        Save original
                      </button>

                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => {
                          setRenaming(item);
                          setName(item.originalName);
                          setError("");
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => {
                          setReplace(item);
                          setFile(null);
                        }}
                      >
                        Replace
                      </button>
                      <button
                        className={`${button} text-rose-300`}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove this file? Old article revisions will no longer be able to display it.",
                            )
                          )
                            void run(
                              () =>
                                writer.current(
                                  `${base}/${item.id}`,
                                  "DELETE",
                                  undefined,
                                  item.revision,
                                ),
                              true,
                            );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
                {item.cleanupPending && (
                  <button
                    className={`${button} mt-2`}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          writer.current(
                            `${base}/${item.id}/cleanup`,
                            "POST",
                            undefined,
                            item.revision,
                          ),
                        true,
                      )
                    }
                  >
                    Retry file cleanup
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Paging {...data} onPage={setPage} />
        </>
      )}
      <TaskModal
        open={!!renaming}
        title="Rename attachment"
        busy={busy}
        onClose={() => setRenaming(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!renaming) return;
            void run(async () => {
              await writer.current(`${base}/${renaming.id}`, "PATCH", { name }, renaming.revision);
              setRenaming(null);
            }, true);
          }}
        >
          <label className="block space-y-2 text-sm">
            Attachment name
            <input
              className={input}
              value={name}
              required
              maxLength={200}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-rose-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button className={primary} type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save name"}
            </button>
            <button
              className={button}
              type="button"
              disabled={busy}
              onClick={() => setRenaming(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      </TaskModal>
      <TaskModal
        open={!!view}
        title={view?.originalName || "Original file"}
        busy={busy}
        onClose={() => setView(null)}
      >
        {view && (
          <div className="space-y-4">
            {view.mimeType === "application/pdf" ? (
              <PrivatePdfPreview key={view.id} url={url(view)} label={view.originalName} />
            ) : (
              <img
                src={url(view)}
                alt={view.originalName}
                className="max-h-[65dvh] w-full object-contain"
              />
            )}
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                run(() => savePrivateFile(`${url(view)}?v=${view.revision}`, view.originalName))
              }
            >
              Save original
            </button>
            {error && (
              <p role="alert" className="text-rose-400">
                {error}
              </p>
            )}
          </div>
        )}
      </TaskModal>
    </div>
  );
}
