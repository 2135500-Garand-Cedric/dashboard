"use client";
import { useCallback, useEffect, useRef } from "react";

// Browser Back is not reliably cancellable in the App Router. TaskDetails keeps
// an in-memory draft for that path; explicit exits and reloads are guarded here.
export function useWorkDraftGuard(dirty: boolean | (() => boolean), onDiscard?: () => void) {
  const dirtyRef = useRef(dirty),
    discardRef = useRef(onDiscard);
  dirtyRef.current = dirty;
  discardRef.current = onDiscard;
  const confirmLeave = useCallback(() => {
    if (!(typeof dirtyRef.current === "function" ? dirtyRef.current() : dirtyRef.current))
      return true;
    if (!window.confirm("Discard your unsaved changes?")) return false;
    discardRef.current?.();
    return true;
  }, []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (typeof dirtyRef.current === "function" ? dirtyRef.current() : dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (
        !anchor ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.href === window.location.href
      )
        return;
      if (!confirmLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [confirmLeave]);
  return confirmLeave;
}
