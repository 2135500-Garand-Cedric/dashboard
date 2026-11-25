"use client";
import Link from "next/link";
import {
  BanknotesIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  FolderIcon,
  LanguageIcon,
  UsersIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { SEARCH_LABELS, SEARCH_SHORTCUTS, type SearchResponse } from "@/lib/search/types";
import { useSearch } from "./SearchProvider";

const icons = {
  tasks: DocumentTextIcon,
  projects: FolderIcon,
  knowledge: BookOpenIcon,
  calendar: CalendarDaysIcon,
  finance: BanknotesIcon,
  people: UsersIcon,
  vocabulary: LanguageIcon,
};
function Highlight({ text, query }: { text: string; query: string }) {
  const term = query.normalize("NFC").trim();
  if (!term || [...term].length > 120) return <>{text}</>;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    <>
      {text
        .normalize("NFC")
        .split(new RegExp(`(${escaped})`, "gi"))
        .map((part, index) =>
          index % 2 ? (
            <mark key={index} className="rounded bg-sky-400/15 text-sky-200">
              {part}
            </mark>
          ) : (
            part
          ),
        )}
    </>
  );
}
export function SearchShortcuts() {
  const { close } = useSearch();
  return (
    <section aria-label="Go to page" className="space-y-2">
      <h3 className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">Go to page</h3>
      {SEARCH_SHORTCUTS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          data-search-link
          onClick={(event) => {
            if (
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              event.currentTarget.href === window.location.href
            )
              close();
          }}
          className="flex min-h-11 items-center justify-between rounded-lg px-3 py-2 hover:bg-white/5 focus:bg-white/5 focus:outline-2 focus:outline-sky-500"
        >
          {item.title}
          <ArrowRightIcon className="h-4 w-4 text-muted" />
        </Link>
      ))}
    </section>
  );
}
export default function SearchResults({
  data,
  retry,
  expanded = false,
}: {
  data: SearchResponse;
  retry: () => void;
  expanded?: boolean;
}) {
  const { query, setKind, close } = useSearch();
  const hasResults = data.groups.some((group) => group.items.length);
  const hasErrors = data.groups.some((group) => group.error);
  if (data.groups.length && data.groups.every((group) => group.error))
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 p-4"
      >
        <p className="text-sm text-amber-400">Search is temporarily unavailable.</p>
        <button
          className="min-h-11 rounded-lg border border-card-border px-3 text-sm"
          onClick={retry}
        >
          Retry search
        </button>
      </div>
    );
  function samePage(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.currentTarget.href === window.location.href
    )
      close();
  }
  return (
    <div className="space-y-5">
      {!hasResults && !hasErrors && (
        <p role="status" className="p-4 text-muted">
          No matches. Try a different word or include archived records.
        </p>
      )}
      {data.groups.map((group) => {
        if (!group.items.length && !group.error) return null;
        const Icon = icons[group.kind];
        return (
          <section
            key={group.kind}
            aria-label={`${SEARCH_LABELS[group.kind]} results`}
            className="space-y-2"
          >
            <header className="flex items-center justify-between gap-3 px-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4 text-sky-400" />
                {SEARCH_LABELS[group.kind]}
              </h3>
              {!expanded && group.hasMore && (
                <Link
                  href={`/search?type=${group.kind}`}
                  prefetch={false}
                  className="min-h-11 content-center text-sm text-blue-400 hover:underline"
                  onClick={(event) => {
                    setKind(group.kind);
                    samePage(event);
                  }}
                >
                  See all <span className="sr-only">{SEARCH_LABELS[group.kind]}</span>
                </Link>
              )}
            </header>
            {group.error ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 p-3"
              >
                <p className="text-sm text-amber-400">{group.error}</p>
                <button
                  className="min-h-11 rounded border border-card-border px-3 text-sm"
                  onClick={retry}
                >
                  Retry {SEARCH_LABELS[group.kind]}
                </button>
              </div>
            ) : (
              <ul className="space-y-1">
                {group.items.map((result) => (
                  <li key={result.key}>
                    <Link
                      data-search-link
                      href={result.href}
                      prefetch={false}
                      onClick={samePage}
                      className="flex min-w-0 gap-3 rounded-xl border border-transparent p-3 hover:border-card-border hover:bg-white/5 focus:bg-white/5 focus:outline-2 focus:outline-sky-500"
                    >
                      <Icon
                        aria-hidden="true"
                        className="mt-1 h-5 w-5 shrink-0 text-sky-400"
                        style={result.color ? { color: result.color } : undefined}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words font-medium [overflow-wrap:anywhere]">
                          <Highlight text={result.title} query={query} />
                        </p>
                        <p className="break-words text-xs text-muted [overflow-wrap:anywhere]">
                          <Highlight text={result.subtitle} query={query} />
                        </p>
                        {result.snippet && (
                          <p className="line-clamp-2 break-words text-sm text-slate-300 [overflow-wrap:anywhere]">
                            <Highlight text={result.snippet} query={query} />
                          </p>
                        )}
                        {!!result.badges.length && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {result.badges.map((badge) => (
                              <span
                                key={badge}
                                className="rounded border border-card-border px-1.5 py-0.5 text-[11px] text-muted"
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
