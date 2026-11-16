"use client";
import { useViewState } from "@/context/ViewStateContext";
import type { ReactNode } from "react";
export default function FilterPanel({
  name,
  children,
  actions,
}: {
  name: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useViewState(`${name}:filters-open`, false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-card-border bg-card-bg px-4 py-2 text-sm"
        >
          {open ? "Hide search and filters" : "Show search and filters"}
        </button>
      </div>
      <div hidden={!open}>{children}</div>
    </div>
  );
}
