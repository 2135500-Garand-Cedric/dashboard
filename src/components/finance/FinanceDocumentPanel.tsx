"use client";
/* eslint-disable @next/next/no-img-element -- Private originals must bypass the public image optimizer. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TaskModal from "@/components/shared/TaskModal";
import {
  MAX_RECEIPT_BYTES,
  RECEIPT_FILE_ACCEPT,
  type ReceiptDocument,
} from "@/lib/finance/receipts";
import ReceiptPdfPreview from "./ReceiptPdfPreview";
import { secondaryButton } from "./shared";

export default function FinanceDocumentPanel({
  document,
  baseUrl,
  title,
  file,
  onFile,
  onDelete,
}: {
  document: ReceiptDocument | null;
  baseUrl: string;
  title: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onDelete: () => void;
}) {
  const [fileError, setFileError] = useState("");
  const [originalOpen, setOriginalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
  const originalFile = useRef<{ id: number; file: File } | null>(null);
  async function downloadOriginal() {
    if (!document || downloading) return;
    setOriginalOpen(true);
    setDownloading(true);
    setDownloadMessage("");
    try {
      let original = originalFile.current?.id === document.id ? originalFile.current.file : null;
      if (!original) {
        const response = await fetch(`${baseUrl}?v=${document.id}&download=1`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Could not download the document. Try again.");
        original = new File([await response.blob()], document.originalName, {
          type: document.mimeType,
        });
        originalFile.current = { id: document.id, file: original };
      }
      if (
        navigator.canShare?.({ files: [original] }) &&
        window.matchMedia("(pointer: coarse)").matches
      ) {
        await navigator.share({ files: [original], title });
      } else {
        const url = URL.createObjectURL(original);
        const link = window.document.createElement("a");
        link.href = url;
        link.download = document.originalName;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setDownloadMessage(
          error instanceof Error && error.name === "NotAllowedError"
            ? "Your file is ready. Tap Save or share original to save it to Files."
            : error instanceof Error
              ? error.message
              : "Could not download the document. Try again.",
        );
      }
    } finally {
      setDownloading(false);
    }
  }
  function choose(selected?: File) {
    if (!selected) return;
    if (!selected.size || selected.size > MAX_RECEIPT_BYTES) {
      setFileError("Choose an image or PDF up to 15 MB.");
      return;
    }
    if (
      selected.type &&
      !RECEIPT_FILE_ACCEPT.split(",").includes(selected.type) &&
      selected.type !== "application/octet-stream"
    ) {
      setFileError("Choose JPEG, PNG, WebP, single-frame GIF or PDF. Export HEIC photos as JPEG.");
      return;
    }
    setFileError("");
    onFile(selected);
  }
  const [localUrl, setLocalUrl] = useState(""),
    [imageError, setImageError] = useState(false);
  useEffect(() => {
    if (!file) {
      setLocalUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const storedUrl = document ? `${baseUrl}?v=${document.id}` : "",
    previewUrl = localUrl || storedUrl;
  useEffect(() => {
    setImageError(false);
  }, [previewUrl]);
  const mimeType = file?.type || document?.mimeType;
  return (
    <section className="card order-first min-w-0 space-y-4 xl:order-none">
      <h3 className="text-lg font-semibold">{title} (optional)</h3>
      <p className="text-sm text-gray-400">
        JPEG, PNG, WebP, single-frame GIF or PDF · up to 15 MB. Export HEIC photos as JPEG.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className={`${secondaryButton} relative overflow-hidden`}>
          {document ? "Replace file" : "Choose photo or PDF"}
          <input
            aria-label={`Choose ${title.toLowerCase()} file`}
            type="file"
            accept={RECEIPT_FILE_ACCEPT}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              choose(selected);
              event.target.value = "";
            }}
          />
        </label>
        <label className={`${secondaryButton} relative overflow-hidden`}>
          Take photo
          <input
            aria-label={`Take ${title.toLowerCase()} photo`}
            type="file"
            accept="image/*"
            capture="environment"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              choose(selected);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {fileError && (
        <p role="alert" className="text-sm text-rose-500">
          {fileError}
        </p>
      )}
      {file && (
        <div className="space-y-2">
          <p className="break-words text-sm">Selected: {file.name}. Uploads when you save.</p>
          <button type="button" className={secondaryButton} onClick={() => onFile(null)}>
            Discard selected file
          </button>
        </div>
      )}
      {previewUrl ? (
        <div className="overflow-hidden rounded-lg border border-card-border">
          {mimeType === "application/pdf" ? (
            <ReceiptPdfPreview url={previewUrl} label={title} />
          ) : (
            <img
              src={previewUrl}
              onError={() => setImageError(true)}
              alt={`${title} preview`}
              className="max-h-[40dvh] xl:max-h-[75dvh] w-full object-contain"
            />
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-card-border p-8 text-center text-gray-400">
          No document attached. You can save without a document and attach one later.
        </div>
      )}
      {imageError && (
        <p role="alert" className="text-sm text-amber-500">
          Could not load the image preview. Open the original or choose a valid replacement.
        </p>
      )}
      {document && (
        <>
          <p className="break-words text-sm text-gray-400">
            {document.originalName} · {(document.byteSize / 1024).toFixed(0)} KB
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={storedUrl}
              onClick={(event) => {
                event.preventDefault();
                setOriginalOpen(true);
              }}
              className={secondaryButton}
            >
              Open original
            </a>
            <a
              href={`${storedUrl}&download=1`}
              onClick={(event) => {
                event.preventDefault();
                void downloadOriginal();
              }}
              className={secondaryButton}
            >
              Download original
            </a>
            <button type="button" className={`${secondaryButton} text-rose-500`} onClick={onDelete}>
              Delete document
            </button>
          </div>
        </>
      )}
      {originalOpen &&
        document &&
        createPortal(
          <TaskModal open title={`${title} original`} onClose={() => setOriginalOpen(false)}>
            <p className="mb-3 break-words text-sm">{document.originalName}</p>
            <div className="max-h-[60dvh] overflow-auto rounded-lg border border-card-border">
              {document.mimeType === "application/pdf" ? (
                <ReceiptPdfPreview url={storedUrl} label={title} />
              ) : (
                <img
                  src={storedUrl}
                  alt={`${title} original`}
                  className="h-auto w-full object-contain"
                />
              )}
            </div>
            {downloadMessage && (
              <p role="alert" className="mt-3 text-sm text-rose-500">
                {downloadMessage}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={downloading}
                className={secondaryButton}
                onClick={() => void downloadOriginal()}
              >
                {downloading ? "Preparing file…" : "Save or share original"}
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setOriginalOpen(false)}
              >
                Back to {title === "Receipt" ? "expense" : "income"}
              </button>
            </div>
          </TaskModal>,
          window.document.body,
        )}
    </section>
  );
}
