"use client";
import { useId, useState } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { SEARCH_KINDS, SEARCH_LABELS, type SearchKind } from "@/lib/search/types";
import { useSearch } from "./SearchProvider";
import { useSearchRequest } from "./useSearchRequest";
import SearchResults, { SearchShortcuts } from "./SearchResults";
import { searchKeyboard } from "./keyboard";

export default function SearchContent({
  expanded = false,
  active = true,
}: {
  expanded?: boolean;
  active?: boolean;
}) {
  const search = useSearch();
  const [composing, setComposing] = useState(false);
  const result = useSearchRequest(expanded ? "page" : "dialog", active, composing);
  const resultsId = useId();
  const kind = expanded && search.kind === "all" ? "tasks" : search.kind;
  return (
    <div
      onKeyDown={searchKeyboard}
      className={`flex min-h-0 flex-1 flex-col ${expanded ? "gap-5" : ""}`}
    >
      <div
        className={`shrink-0 space-y-3 ${expanded ? "" : "border-b border-card-border px-4 pb-4 sm:px-5"}`}
      >
        <div className="flex items-center gap-2 rounded-xl border border-card-border bg-background px-3 focus-within:border-sky-500">
          <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-sky-400" />
          <input
            data-search-input
            aria-label="Search dashboard"
            aria-controls={resultsId}
            type="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={240}
            className="min-h-12 min-w-0 flex-1 bg-transparent py-3 outline-none [&::-webkit-search-cancel-button]:hidden"
            value={search.query}
            placeholder="Search tasks, articles, people, finance…"
            onChange={(event) => search.setQuery(event.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
          />
          {search.query && (
            <button
              aria-label="Clear search"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/5"
              onClick={search.clear}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <select
            aria-label="Search category"
            value={kind}
            className="min-h-11 max-w-full rounded-lg border border-card-border bg-card-bg px-3 text-sm"
            onChange={(event) => {
              const value = event.target.value as SearchKind | "all";
              search.setKind(value);
              if (expanded) window.history.replaceState(null, "", `/search?type=${value}`);
            }}
          >
            {!expanded && <option value="all">All categories</option>}
            {SEARCH_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {SEARCH_LABELS[kind]}
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={search.includeArchived}
              onChange={(event) => search.setIncludeArchived(event.target.checked)}
            />
            Include archived/inactive
          </label>
        </div>
      </div>
      <div
        id={resultsId}
        aria-live="polite"
        aria-busy={result.loading}
        className={
          expanded
            ? "min-w-0 space-y-4"
            : "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4"
        }
      >
        {result.error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/30 p-3 text-sm"
          >
            <p className="text-rose-400">{result.error}</p>
            <button
              className="min-h-11 rounded border border-card-border px-3"
              onClick={result.retry}
            >
              Try again
            </button>
          </div>
        )}
        {result.loading && (
          <p role="status" className="px-3 text-sm text-muted">
            Searching…
          </p>
        )}
        {!search.query.trim() ? (
          <SearchShortcuts />
        ) : !result.ready && !result.error ? (
          <p className="p-3 text-sm text-muted">
            {composing
              ? "Finish typing to search."
              : "Enter two characters, or one Japanese character."}
          </p>
        ) : null}
        {result.data && (
          <SearchResults data={result.data} retry={result.retry} expanded={expanded} />
        )}
        {expanded && result.data && result.ready && (
          <div className="flex flex-wrap items-center gap-3 border-t border-card-border pt-4">
            <button
              className="min-h-11 rounded-lg border border-card-border px-4 text-sm disabled:opacity-40"
              disabled={search.page <= 1 || result.loading}
              onClick={() => search.setPage(search.page - 1)}
            >
              Previous results
            </button>
            <span className="text-sm text-muted">Page {search.page}</span>
            <button
              className="min-h-11 rounded-lg border border-card-border px-4 text-sm disabled:opacity-40"
              disabled={!result.data.groups[0]?.hasMore || search.page >= 200 || result.loading}
              onClick={() => search.setPage(search.page + 1)}
            >
              Next results
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
