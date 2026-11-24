"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated originals bypass the public image optimizer. */
import { useRef, useState } from "react";
import TaskModal from "@/components/shared/TaskModal";
import { createWorkWriter } from "@/lib/work-management/client";
import { inlineImageIds, linkLabel } from "@/lib/knowledge/markdown";
import { button, primary, input, ReadState, useKnowledgeRead } from "./shared";
type ImageRecord = {
  id: number;
  originalName: string;
  mimeType: string;
  byteSize: number;
  revision: number;
  articleRevision?: number;
};
const uploadKeys = new WeakMap<File, Map<string, string>>(),
  deleteKeys = new Map<string, string>();
export function InlineImages({
  open,
  onClose,
  articleId,
  articleRevision,
  draftId,
  onDraft,
  onRevision,
  onInsert,
  body,
}: {
  open: boolean;
  onClose: () => void;
  articleId?: number;
  articleRevision?: number;
  draftId: string | null;
  onDraft: (id: string | null) => void;
  onRevision: (revision: number) => void;
  onInsert: (markdown: string) => void;
  body: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [file, setFile] = useState<File | null>(null);
  const writer = useRef(createWorkWriter()),
    proposedDraft = useRef<string | null>(null);
  const scope = articleId ? `articleId=${articleId}` : draftId ? `draftId=${draftId}` : null;
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      let target = scope;
      if (!target) {
        const id = proposedDraft.current || crypto.randomUUID();
        proposedDraft.current = id;
        await writer.current("/api/knowledge/drafts", "POST", { id });
        onDraft(id);
        target = `draftId=${id}`;
      }
      const identity = `${target}:${articleRevision || 0}`;
      let keys = uploadKeys.get(file);
      if (!keys) {
        keys = new Map();
        uploadKeys.set(file, keys);
      }
      const key = keys.get(identity) || crypto.randomUUID();
      keys.set(identity, key);
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/knowledge/images?${target}`, {
        method: "POST",
        headers: {
          "Idempotency-Key": key,
          ...(articleId ? { "If-Match": `"${articleRevision}"` } : {}),
        },
        body: form,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status < 500) keys.delete(identity);
        throw new Error(result?.error || "Upload could not be confirmed. Retry safely.");
      }
      keys.delete(identity);
      if (result.articleRevision) onRevision(result.articleRevision);
      setFile(null);
      setRefresh((value) => value + 1);
      onInsert(`\n![${linkLabel(file.name)}](/api/knowledge/images/${result.id}/file)\n`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload image.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(image: ImageRecord) {
    if (
      !window.confirm(
        "Remove this original image? Saved article revisions that use it will no longer display it.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const identity = `${image.id}:${image.revision}:${articleRevision || 0}`,
        key = deleteKeys.get(identity) || crypto.randomUUID();
      deleteKeys.set(identity, key);
      const response = await fetch(`/api/knowledge/images/${image.id}`, {
        method: "DELETE",
        headers: {
          "Idempotency-Key": key,
          "If-Match": `"${image.revision}"`,
          ...(articleId ? { "If-Article-Match": String(articleRevision) } : {}),
        },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status < 500) deleteKeys.delete(identity);
        throw new Error(result?.error || "Unable to remove image.");
      }
      deleteKeys.delete(identity);
      if (result.articleRevision) onRevision(result.articleRevision);
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove image.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskModal open={open} title="Article images" busy={busy} onClose={onClose}>
      {open && (
        <div className="space-y-4">
          <label className="block">
            Choose an image
            <input
              aria-label="Inline image file"
              className={`${input} mt-2`}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy}
              onChange={(event) => {
                setError("");
                const next = event.target.files?.[0] || null;
                if (next && (!next.size || next.size > 15 * 1024 * 1024)) {
                  setError("Choose a nonempty image up to 15 MB.");
                  return;
                }
                setFile(next);
              }}
            />
          </label>
          {file && (
            <button className={primary} disabled={busy} onClick={upload}>
              {busy ? "Uploading…" : "Upload and insert image"}
            </button>
          )}
          <p className="text-sm text-gray-400">
            Images appear inside the article. PDFs and other supporting files stay in attachments.
          </p>
          {scope && (
            <ImageGallery
              key={`${scope}:${refresh}`}
              scope={scope}
              body={body}
              busy={busy}
              onInsert={(image) =>
                onInsert(
                  `\n![${linkLabel(image.originalName)}](/api/knowledge/images/${image.id}/file)\n`,
                )
              }
              onRemove={remove}
              onReset={
                !articleId
                  ? async () => {
                      if (
                        !window.confirm(
                          "Start adding unsaved images again? Remove any old image lines from the article and reinsert the images you want to keep.",
                        )
                      )
                        return;
                      if (draftId)
                        await fetch(`/api/knowledge/drafts/${draftId}`, { method: "DELETE" });
                      proposedDraft.current = null;
                      onDraft(null);
                      setError("");
                      setRefresh((value) => value + 1);
                    }
                  : undefined
              }
            />
          )}{" "}
          {error && (
            <p role="alert" className="text-rose-400">
              {error}
            </p>
          )}
        </div>
      )}
    </TaskModal>
  );
}
function ImageGallery({
  scope,
  body,
  busy,
  onInsert,
  onRemove,
  onReset,
}: {
  scope: string;
  body: string;
  busy: boolean;
  onInsert: (image: ImageRecord) => void;
  onRemove: (image: ImageRecord) => void;
  onReset?: () => void;
}) {
  const { data, error, reload } = useKnowledgeRead<ImageRecord[]>(`/api/knowledge/images?${scope}`),
    used = new Set(inlineImageIds(body));
  return !data ? (
    <div>
      <ReadState error={error} retry={reload} />
      {error && onReset && (
        <button className={`${button} mt-3`} onClick={onReset}>
          Start adding images again
        </button>
      )}
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.map((image) => (
        <div key={image.id} className="min-w-0 rounded-lg border border-card-border p-3">
          <img
            src={`/api/knowledge/images/${image.id}/file`}
            alt={image.originalName}
            className="h-28 w-full object-contain"
          />
          <p className="mt-2 break-words text-sm">{image.originalName}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={button} disabled={busy} onClick={() => onInsert(image)}>
              Insert
            </button>
            <button
              className={button}
              disabled={busy || used.has(image.id)}
              title={
                used.has(image.id)
                  ? "Remove the image's Markdown from the article first."
                  : undefined
              }
              onClick={() => onRemove(image)}
            >
              Remove original
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
