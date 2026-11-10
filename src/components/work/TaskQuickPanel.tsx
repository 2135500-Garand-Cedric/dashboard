"use client";
import { useEffect, useRef } from "react";
import TaskDetails from "./TaskDetails";
export default function TaskQuickPanel({ id, returnTo, onClose, onChanged }: { id: number; returnTo: string; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} aria-label="Task details" onCancel={event => { event.preventDefault(); ref.current?.querySelector<HTMLButtonElement>("[data-close-task]")?.click(); }} className="fixed inset-0 m-0 h-dvh max-h-dvh w-screen max-w-none overflow-y-auto border-0 bg-card-bg p-0 text-foreground backdrop:bg-black/50 md:left-auto md:ml-auto md:w-[min(1100px,calc(100vw-3rem))] md:border-l md:border-card-border">
    <TaskDetails key={id} todoId={id} returnTo={returnTo} panel onClose={onClose} onChanged={onChanged} />
  </dialog>;
}
