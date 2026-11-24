"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PlusIcon,
  ClipboardDocumentCheckIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  BookOpenIcon,
  LanguageIcon,
} from "@heroicons/react/24/outline";
import TaskModal from "@/components/shared/TaskModal";
import { useSettings } from "@/context/SettingsContext";
import { useSnackbar } from "@/context/SnackbarContext";

const EventForm = dynamic(() => import("@/components/calendar/EventForm"), {
  ssr: false,
  loading: () => <p role="status">Loading event editor…</p>,
});
const actions = [
  {
    label: "New task",
    href: "/todos/new?returnTo=%2F",
    icon: ClipboardDocumentCheckIcon,
    color: "border-blue-400/40 text-blue-300",
  },
  {
    label: "New event",
    href: null,
    icon: CalendarDaysIcon,
    color: "border-violet-400/40 text-violet-300",
  },
  {
    label: "New expense",
    href: "/finance/expenses/new?returnTo=%2F",
    icon: BanknotesIcon,
    color: "border-emerald-400/40 text-emerald-300",
  },
  {
    label: "New Knowledge article",
    href: "/knowledge/new?returnTo=%2F",
    icon: BookOpenIcon,
    color: "border-amber-400/40 text-amber-300",
  },
  {
    label: "New vocabulary",
    href: "/japanese/add-vocabulary?returnTo=%2F",
    icon: LanguageIcon,
    color: "border-rose-400/40 text-rose-300",
  },
];

export default function DashboardQuickAdd({ onEventSaved }: { onEventSaved: () => void }) {
  const [screen, setScreen] = useState<"menu" | "event" | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const { timeZone } = useSettings();
  const { showMessage } = useSnackbar();

  useEffect(() => {
    const check = () => setBlocked(!!document.querySelector("dialog[open]"));
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    check();
    return () => observer.disconnect();
  }, []);

  function close() {
    setBusy(false);
    setScreen(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function cancelEvent() {
    if (busy) return;
    const cancel = editor.current?.querySelector<HTMLButtonElement>("[data-event-cancel]");
    if (cancel) cancel.click();
    else close();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Quick add"
        aria-haspopup="dialog"
        aria-expanded={screen !== null}
        disabled={blocked || busy || screen !== null}
        onClick={() => setScreen("menu")}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-400/50 px-2.5 text-sm font-medium text-blue-300 hover:bg-blue-500/10 disabled:opacity-50 sm:px-3"
      >
        <PlusIcon className="h-5 w-5" />
        <span className="hidden sm:inline">Quick add</span>
      </button>
      <TaskModal open={screen === "menu"} title="Quick add" onClose={close}>
        <div className="grid gap-3">
          {actions.map(({ label, href, icon: Icon, color }) => {
            const content = (
              <>
                <Icon className="h-6 w-6 shrink-0" />
                <span>{label}</span>
              </>
            );
            const className = `flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-left font-medium hover:bg-white/5 ${color}`;
            return href ? (
              <Link key={label} href={href} className={className} onClick={close}>
                {content}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                className={className}
                onClick={() => setScreen("event")}
              >
                {content}
              </button>
            );
          })}
        </div>
      </TaskModal>
      <TaskModal
        open={screen === "event"}
        title="New event or work session"
        busy={busy}
        onClose={cancelEvent}
      >
        <div ref={editor}>
          {screen === "event" && (
            <EventForm
              embedded
              timeZone={timeZone}
              onBusyChange={setBusy}
              onCancel={close}
              onSaved={() => {
                showMessage("Event created successfully.");
                onEventSaved();
                close();
              }}
            />
          )}
        </div>
      </TaskModal>
    </>
  );
}
