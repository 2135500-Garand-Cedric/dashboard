"use client";
/* eslint-disable @next/next/no-img-element */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type {
  SupportEditorHandle,
  SupportEditorState,
  WorkAttachment,
} from "@/lib/work-management/types";
import PrivatePdfPreview from "@/components/documents/PrivatePdfPreview";
const buttonClass =
  "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const drafts = new Map<number, { file: File; replacement: WorkAttachment | null }>(),
  uploadKeys = new WeakMap<File, Map<string, string>>(),
  writer = createWorkWriter();
async function upload(todoId: number, file: File, previous: WorkAttachment | null) {
  const url = previous
      ? `/api/todos/${todoId}/attachments/${previous.id}`
      : `/api/todos/${todoId}/attachments`,
    identity = `${url}:${previous?.revision ?? "new"}`;
  let pending = uploadKeys.get(file);
  if (!pending) {
    pending = new Map();
    uploadKeys.set(file, pending);
  }
  const key = pending.get(identity) ?? crypto.randomUUID();
  pending.set(identity, key);
  const form = new FormData();
  form.set("file", file);
  const response = await fetch(url, {
    method: previous ? "PATCH" : "POST",
    headers: {
      "Idempotency-Key": key,
      ...(previous ? { "If-Match": `"${previous.revision}"` } : {}),
    },
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    if (!response.ok && response.status < 500) pending.delete(identity);
    throw new Error(
      data?.error ||
        "The upload could not be confirmed. Try uploading again; the same request will be retried safely.",
    );
  }
  pending.delete(identity);
  return data as WorkAttachment;
}
const TaskAttachments = forwardRef<
  SupportEditorHandle,
  { id: number; onStateChange: (state: SupportEditorState) => void; onRecordsChanged: () => void }
>(function TaskAttachments({ id, onStateChange, onRecordsChanged }, ref) {
  const cached = drafts.get(id),
    [file, setFile] = useState<File | null>(cached?.file ?? null),
    [replacement, setReplacement] = useState<WorkAttachment | null>(cached?.replacement ?? null);
  const [data, setData] = useState<{
      items: WorkAttachment[];
      total: number;
      page: number;
      pageSize: number;
    } | null>(null),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<WorkAttachment | null>(null),
    [imageError, setImageError] = useState(false);
  const selectionTarget = useRef<WorkAttachment | null>(null);
  const lock = useRef(false),
    liveDraft = useRef<{ file: File; replacement: WorkAttachment | null } | null>(null),
    library = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  liveDraft.current = file ? { file, replacement } : null;
  const discard = useCallback(() => {
    drafts.delete(id);
    liveDraft.current = null;
    selectionTarget.current = null;
    setFile(null);
    setReplacement(null);
  }, [id]);
  useImperativeHandle(ref, () => ({ discard, isDirty: () => !!file, isBusy: () => lock.current }), [
    discard,
    file,
  ]);
  useEffect(() => {
    onStateChange({ dirty: !!file, busy });
  }, [file, busy, onStateChange]);
  useEffect(
    () => () => {
      if (liveDraft.current) drafts.set(id, liveDraft.current);
    },
    [id],
  );
  useEffect(() => {
    let active = true;
    setData(null);
    setLoadError("");
    void workRead<NonNullable<typeof data>>(`/api/todos/${id}/attachments?page=${page}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : "Unable to load attachments.");
      });
    return () => {
      active = false;
    };
  }, [id, page, refresh]);
  function choose(selected?: File) {
    if (!selected) return;
    if (!selected.size || selected.size > 15 * 1024 * 1024) {
      setError(
        "Choose a nonempty image or PDF up to 15 MB. Your previous file selection was kept.",
      );
      return;
    }
    if (
      selected.type &&
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
        "application/octet-stream",
      ].includes(selected.type)
    ) {
      setError(
        "Choose JPEG, PNG, WebP, single-frame GIF or PDF. Export HEIC photos as JPEG first. Your previous selection was kept.",
      );
      return;
    }
    setReplacement(selectionTarget.current);
    setFile(selected);
    setError("");
    setNotice("");
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setRefresh((value) => value + 1);
      onRecordsChanged();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save attachment. Your file selection was kept.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Task attachments" className="space-y-4 border-t border-card-border pt-5">
      <h2 className="font-semibold">Attachments</h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!file || window.confirm("Discard the selected file?")) {
              selectionTarget.current = null;
              library.current?.click();
            }
          }}
          className={buttonClass}
        >
          Choose image or PDF
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!file || window.confirm("Discard the selected file?")) {
              selectionTarget.current = null;
              camera.current?.click();
            }
          }}
          className={buttonClass}
        >
          Take photo
        </button>
      </div>
      <input
        ref={library}
        aria-label="Attachment file"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={camera}
        aria-label="Attachment camera"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <p className="text-xs text-gray-500">
        JPEG, PNG, WebP, single-frame GIF or PDF · Maximum 15 MB · Images up to 40 megapixels
      </p>
      {file && (
        <div className="space-y-3 rounded-lg border border-card-border p-3">
          <p className="break-words text-sm">
            {replacement ? `Replacing ${replacement.originalName} with ` : "Selected: "}
            {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const result = await upload(id, file, replacement);
                  discard();
                  setPreview(null);
                  setPage(1);
                  setNotice(
                    result.cleanupPending
                      ? "Attachment saved. Cleanup of the previous file is pending; retry cleanup below."
                      : "Attachment saved.",
                  );
                })
              }
              className={`${buttonClass} bg-blue-600 text-white`}
            >
              {busy ? "Uploading…" : replacement ? "Replace attachment" : "Upload attachment"}
            </button>
            <button type="button" disabled={busy} onClick={discard} className={buttonClass}>
              Discard file selection
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-500">
          {notice}
        </p>
      )}
      {loadError ? (
        <p role="alert" className="text-sm text-rose-500">
          {loadError}{" "}
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            className="underline"
          >
            Retry attachments
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading attachments…</p>
      ) : (
        <>
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="min-w-0 space-y-2 rounded-lg border border-card-border p-3"
              >
                <p className="break-words text-sm font-medium">
                  {item.originalName}
                  {item.removedAt ? " · Removed" : ""}
                </p>
                <p className="text-xs text-gray-500">
                  {(item.byteSize / 1024 / 1024).toFixed(2)} MB · Added{" "}
                  {new Date(item.createdAt).toLocaleString("en-CA", {
                    timeZone: "America/Toronto",
                  })}
                  {item.revision > 1 ? ` · Version ${item.revision}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {!item.removedAt && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setPreview(preview?.id === item.id ? null : item);
                          setImageError(false);
                        }}
                        className={buttonClass}
                      >
                        Preview attachment {item.id}
                      </button>
                      <a
                        download
                        href={`/api/todos/${id}/attachments/${item.id}/file?download=1`}
                        className={buttonClass}
                      >
                        Download original
                      </a>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!file || window.confirm("Discard the selected file?")) {
                            selectionTarget.current = item;
                            library.current?.click();
                          }
                        }}
                        className={buttonClass}
                      >
                        Choose replacement {item.id}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove this attachment? The original file will be deleted; its metadata and activity record will be kept.",
                            )
                          )
                            void perform(async () => {
                              const result = await writer<WorkAttachment>(
                                `/api/todos/${id}/attachments/${item.id}`,
                                "DELETE",
                                undefined,
                                item.revision,
                              );
                              if (preview?.id === item.id) setPreview(null);
                              if (replacement?.id === item.id) discard();
                              setNotice(
                                result.cleanupPending
                                  ? "Attachment removed; file cleanup is pending. Retry cleanup below."
                                  : "Attachment removed.",
                              );
                            });
                        }}
                        className={`${buttonClass} text-rose-500`}
                      >
                        Remove attachment {item.id}
                      </button>
                    </>
                  )}
                  {item.cleanupPending && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          const result = await writer<{ cleanupPending: boolean }>(
                            `/api/todos/${id}/attachments/${item.id}/cleanup`,
                            "POST",
                            undefined,
                            item.revision,
                          );
                          setNotice(
                            result.cleanupPending
                              ? "File cleanup is still pending. Check private storage permissions and try again."
                              : "File cleanup completed.",
                          );
                        })
                      }
                      className={buttonClass}
                    >
                      Retry file cleanup {item.id}
                    </button>
                  )}
                </div>
                {preview?.id === item.id && !item.removedAt && (
                  <div className="mt-3 min-w-0 rounded-lg border border-card-border p-2">
                    {item.mimeType === "application/pdf" ? (
                      <PrivatePdfPreview
                        url={`/api/todos/${id}/attachments/${item.id}/file?v=${item.revision}`}
                        label={item.originalName}
                      />
                    ) : (
                      <>
                        <img
                          src={`/api/todos/${id}/attachments/${item.id}/file?v=${item.revision}`}
                          alt={`Attachment preview: ${item.originalName}`}
                          onError={() => setImageError(true)}
                          className="max-h-[60dvh] w-full object-contain"
                        />
                        {imageError && (
                          <p role="alert" className="text-sm text-rose-500">
                            Unable to preview this image. Try downloading the original or replacing
                            it.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!data.total && (
            <p className="text-sm text-gray-500">
              No attachments. Notes can be saved without a file.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              {data.total} attachment records · Page {data.page}/
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
                className={buttonClass}
              >
                Previous attachments
              </button>
              <button
                type="button"
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => setPage(data.page + 1)}
                className={buttonClass}
              >
                Next attachments
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
});
export default TaskAttachments;
