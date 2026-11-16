"use client";
import { useTaskContentReady } from "@/components/work/TaskInitialLoad";
import { useEffect, useId, useRef, type ReactNode } from "react";

export default function TaskModal({
  open,
  title,
  busy = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const contentReady = useTaskContentReady();
  const visible = open && contentReady;
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (visible && !node?.open) node?.showModal();
    if (!visible && node?.open) node.close();
    return () => {
      node?.close();
    };
  }, [visible]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5 text-foreground shadow-2xl backdrop:bg-black/60 sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="mb-5 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label={`Close ${title}`}
          disabled={busy}
          onClick={onClose}
          className="rounded-lg border border-card-border px-3 py-1.5 disabled:opacity-50"
        >
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}
