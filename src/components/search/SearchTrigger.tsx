"use client";
import { useEffect, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useSearch } from "./SearchProvider";

export default function SearchTrigger({
  compact = false,
  onOpen,
}: {
  compact?: boolean;
  onOpen?: () => void;
}) {
  const { show } = useSearch();
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <button
      data-search-trigger="true"
      type="button"
      aria-label="Search dashboard"
      aria-haspopup="dialog"
      className={
        compact
          ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
          : "flex min-h-11 w-full items-center gap-2 rounded-lg border border-card-border bg-background/30 px-3 py-2 text-sm hover:border-blue-500"
      }
      onClick={() => {
        onOpen?.();
        show();
      }}
    >
      <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-sky-400" aria-hidden="true" />
      {!compact && (
        <>
          <span className="flex-1 text-left">Search dashboard</span>
          <kbd className="text-xs text-muted">{mac ? "⌘ K" : "Ctrl K"}</kbd>
        </>
      )}
    </button>
  );
}
