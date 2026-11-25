"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Squares2X2Icon, XMarkIcon } from "@heroicons/react/24/outline";
import DashboardQuickAdd from "@/components/DashboardQuickAdd";
import { NotificationBell } from "@/components/notifications/NotificationInbox";
import { useInbox } from "@/components/notifications/InboxProvider";
import SearchTrigger from "@/components/search/SearchTrigger";

export default function MobileQuickActions({
  navigationOpen,
  closeNavigation,
}: {
  navigationOpen: boolean;
  closeNavigation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { unread } = useInbox();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (navigationOpen) setOpen(false);
  }, [navigationOpen]);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("dashboard:search-open", close);
    return () => window.removeEventListener("dashboard:search-open", close);
  }, []);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Element;
      if (!root.current?.contains(target) && !target.closest('[data-notification-preview="true"]'))
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    const screen = window.matchMedia("(min-width: 768px)");
    const resize = () => {
      if (screen.matches) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    screen.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      screen.removeEventListener("change", resize);
    };
  }, [open]);

  const itemClass =
    "flex flex-col items-center gap-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none";
  const itemStyle = (index: number) => ({
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(-6px)",
    transitionDelay: open ? `${index * 40}ms` : "0ms",
  });

  return (
    <div
      ref={root}
      className="fixed right-4 top-[calc(var(--shell-top,0px)+1rem+env(safe-area-inset-top,0px))] z-40 md:hidden"
    >
      <button
        ref={trigger}
        data-mobile-actions-trigger="true"
        type="button"
        aria-label="Quick actions"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          closeNavigation();
          setOpen((value) => !value);
        }}
        className={`relative flex min-h-11 min-w-11 items-center justify-center rounded-xl border bg-card-bg shadow-lg transition-colors motion-reduce:transition-none ${open ? "border-sky-400/50 text-sky-300" : "border-card-border text-foreground"}`}
      >
        <Squares2X2Icon
          aria-hidden="true"
          className={`absolute h-5 w-5 transition-[opacity,transform] duration-200 motion-reduce:transition-none ${open ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
        />
        <XMarkIcon
          aria-hidden="true"
          className={`h-5 w-5 transition-[opacity,transform] duration-200 motion-reduce:transition-none ${open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0"}`}
        />
        {!!unread && !open && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-blue-600 px-1.5 text-xs text-white">
            <span className="sr-only">Unread notifications: </span>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <div
        id={id}
        role="region"
        aria-label="Quick actions"
        aria-hidden={!open}
        inert={!open}
        className={`absolute right-0 top-[calc(100%+.75rem)] grid w-64 max-w-[calc(100vw-2rem)] origin-top-right grid-cols-3 gap-2 rounded-2xl border border-card-border bg-card-bg p-4 shadow-2xl transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-2 scale-95 opacity-0"}`}
      >
        <div className={itemClass} style={itemStyle(0)}>
          <NotificationBell compact active={open} />
          <span className="text-[11px] text-muted">Notifications</span>
        </div>
        <div className={itemClass} style={itemStyle(1)}>
          <DashboardQuickAdd
            compact
            onOpen={() => setOpen(false)}
            onClosed={() => trigger.current?.focus()}
          />
          <span className="text-[11px] text-muted">Quick add</span>
        </div>
        <div className={itemClass} style={itemStyle(2)}>
          <SearchTrigger compact onOpen={() => setOpen(false)} />
          <span className="text-[11px] text-muted">Search</span>
        </div>
      </div>
    </div>
  );
}
