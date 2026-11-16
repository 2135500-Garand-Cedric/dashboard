import type { ReactNode } from "react";
import { secondaryButton } from "./shared";

export function HistoryFiltersButton({
  open,
  onToggle,
  filters,
}: {
  open: boolean;
  onToggle: () => void;
  filters: Record<string, string>;
}) {
  const activeCount = Object.values(filters).filter(Boolean).length;
  return (
    <button
      type="button"
      className={secondaryButton}
      aria-expanded={open}
      aria-controls="finance-history-filters"
      onClick={onToggle}
    >
      Search & filters{activeCount > 0 ? ` (${activeCount} active)` : ""}
    </button>
  );
}

export default function HistoryFilters({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <section
      id="finance-history-filters"
      aria-label="Search and filters"
      hidden={!open}
      className="card space-y-4"
    >
      {children}
    </section>
  );
}
