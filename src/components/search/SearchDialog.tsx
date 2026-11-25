"use client";
import { useEffect, useId, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useSearch } from "./SearchProvider";
import SearchContent from "./SearchContent";

export default function SearchDialog() {
  const { open, close } = useSearch();
  const ref = useRef<HTMLDialogElement>(null),
    title = useId();
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      const active = document.activeElement;
      restore.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : ([...document.querySelectorAll<HTMLElement>("[data-search-trigger]")].find(
              (element) => element.getClientRects().length > 0,
            ) ?? null);
      node.showModal();
      node.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
    }
    if (!open && node.open) {
      node.close();
      const target =
        restore.current?.isConnected && !restore.current.closest("[inert]")
          ? restore.current
          : document.querySelector<HTMLElement>('[data-mobile-actions-trigger="true"]');
      target?.focus({ preventScroll: true });
    }
  }, [open]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      ref.current?.style.setProperty(
        "--search-viewport-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      ref.current?.style.setProperty("--search-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="fixed left-2 top-[calc(var(--search-viewport-top,0px)+.5rem)] m-0 h-[calc(var(--search-viewport-height,100dvh)-1rem)] max-h-none w-[calc(100%-1rem)] max-w-none overflow-hidden rounded-2xl border border-card-border bg-card-bg p-0 text-foreground shadow-2xl backdrop:bg-black/65 md:inset-0 md:m-auto md:h-[min(42rem,calc(var(--search-viewport-height,100dvh)-2rem))] md:w-[calc(100%-2rem)] md:max-w-[45rem]"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          close();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Tab") {
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <h2 id={title} className="font-semibold">
            Search dashboard
          </h2>
          <button
            aria-label="Close search"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/5"
            onClick={close}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>
        <SearchContent active={open} />
      </div>
    </dialog>
  );
}
