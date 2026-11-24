"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { useSnackbar } from "@/context/SnackbarContext";
import { useInbox } from "./InboxProvider";

export default function NotificationSourceOpen({ id }: { id: string }) {
  const router = useRouter();
  const { refresh } = useInbox();
  const { showMessage } = useSnackbar();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [write] = useState(createWorkWriter);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const item = await workRead<{ url: string | null; revision: number }>(
          `/api/notifications/inbox/${id}`,
        );
        if (cancelled) return;
        if (!item.url) {
          setError("This reminder’s source was removed or rescheduled.");
          return;
        }
        try {
          await write(`/api/notifications/inbox/${id}`, "PATCH", { action: "read" }, item.revision);
        } catch {
          if (!cancelled)
            showMessage("Unable to mark the reminder read. You can retry from the inbox.");
        }
        if (!cancelled) {
          refresh();
          router.replace(item.url);
        }
      } catch {
        if (!cancelled) setError("Unable to open this reminder. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Snackbar's callback changes on render; it must not restart an open command.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retry, router, refresh, write]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Opening reminder</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="rounded-lg border border-card-border px-4 py-2"
            onClick={() => {
              setError("");
              setRetry(retry + 1);
            }}
          >
            Retry
          </button>
        </>
      ) : (
        <p role="status">Loading the current source…</p>
      )}
      <Link className="block text-blue-300" href="/notifications">
        Go to inbox
      </Link>
    </div>
  );
}
