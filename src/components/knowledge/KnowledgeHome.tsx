"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TaskModal from "@/components/shared/TaskModal";
import { FolderNavigation, FolderManager, FolderSymbol } from "./Folders";
import { folderPath, type Folder } from "@/lib/knowledge/folder-tree";
import { useEffect, useRef, useState } from "react";
import {
  BookOpenIcon,
  FolderIcon,
  PlusIcon,
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { useViewState } from "@/context/ViewStateContext";
import { DateTime } from "@/context/SettingsContext";
import {
  button,
  primary,
  input,
  card,
  typeName,
  useKnowledgeRead,
  ReadState,
  Paging,
  type ArticleSummary,
  type Page,
} from "./shared";
import { savePrivateFile } from "./files";
export default function KnowledgeHome() {
  const incoming = useSearchParams().get("folder");
  const defaults = {
    q: "",
    type: "",
    tag: "",
    archived: false,
    open: false,
    page: 1,
    folder: incoming || "",
    collection: "all",
    withinFolder: false,
  };
  const [stored, setFilters] = useViewState("knowledge.filters", defaults);
  const filters = { ...defaults, ...stored };
  const [navigationOpen, setNavigationOpen] = useState(false),
    [managerOpen, setManagerOpen] = useState(false),
    [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const folders = useKnowledgeRead<Folder[]>("/api/knowledge/folders");
  const lastIncoming = useRef<string | null | undefined>(undefined),
    resolvedIncoming = useRef<string | null>(null);
  useEffect(() => {
    if (incoming === null) {
      lastIncoming.current = null;
      resolvedIncoming.current = null;
      return;
    }
    if (incoming === lastIncoming.current) return;
    lastIncoming.current = incoming;
    resolvedIncoming.current = null;
    setFilters((old) =>
      old.folder === incoming
        ? old
        : {
            ...old,
            folder: incoming,
            archived: false,
            collection: "all",
            page: 1,
            q: "",
          },
    );
  }, [incoming, setFilters]);
  useEffect(() => {
    if (!incoming || !folders.data || resolvedIncoming.current === incoming) return;
    resolvedIncoming.current = incoming;
    const folder = folders.data.find((row) => String(row.id) === incoming);
    if (folder?.effectiveArchived)
      setFilters((old) => (old.folder === incoming ? { ...old, archived: true } : old));
  }, [incoming, folders.data, setFilters]);
  const selected = folders.data?.find((row) => String(row.id) === filters.folder);
  const path = folders.data ? folderPath(folders.data, selected?.id ?? null) : [];
  function chooseFolder(folder: string) {
    const row = folders.data?.find((item) => String(item.id) === folder);
    setFilters((old) => ({
      ...old,
      folder,
      archived: !!row?.effectiveArchived || filters.archived,
      collection: "all",
      q: "",
      page: 1,
    }));
    setNavigationOpen(false);
  }
  function chooseCollection(collection: string) {
    setFilters((old) => ({
      ...old,
      folder: "",
      collection,
      archived: collection === "archived",
      q: "",
      page: 1,
    }));
    setNavigationOpen(false);
  }
  function createFolder() {
    setEditingFolder(null);
    setManagerOpen(true);
    setNavigationOpen(false);
  }
  const navigation = folders.data ? (
    <FolderNavigation
      folders={folders.data}
      selected={filters.folder}
      collection={filters.collection}
      archived={filters.archived}
      onSelect={chooseFolder}
      onCollection={chooseCollection}
      onCreate={createFolder}
    />
  ) : (
    <ReadState error={folders.error} retry={folders.reload} />
  );
  const children =
    folders.data?.filter(
      (row) =>
        row.parentId === (selected?.id ?? null) && (filters.archived || !row.effectiveArchived),
    ) || [];
  const [downloadError, setDownloadError] = useState(""),
    [downloading, setDownloading] = useState(false);
  const params = new URLSearchParams({
    folder: filters.folder,
    collection: filters.collection === "archived" ? "all" : filters.collection,
    searchAll: filters.folder && !filters.withinFolder ? "1" : "0",
    q: filters.q,
    type: filters.type,
    tag: filters.tag,
    archived: filters.archived ? "1" : "0",
    page: String(filters.page),
  });
  const { data, error, reload } = useKnowledgeRead<Page<ArticleSummary>>(
    `/api/knowledge?${params}`,
  );
  const tags = useKnowledgeRead<{ id: number; name: string }[]>("/api/knowledge/tags");
  function filter(change: Partial<typeof filters>) {
    setFilters((old) => ({ ...old, ...change, page: 1 }));
  }
  return (
    <div className="space-y-5 pt-10 md:pt-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <BookOpenIcon className="h-8 w-8 text-blue-400" />
          Knowledge
        </h1>
        <div className="flex flex-wrap gap-2">
          <button className={`${button} lg:hidden`} onClick={() => setNavigationOpen(true)}>
            <FolderIcon className="h-5 w-5" />
            Folders
          </button>
          <Link href="/knowledge/templates" className={button}>
            Templates
          </Link>
          <button className={button} onClick={createFolder}>
            New folder
          </button>
          <Link
            href={
              selected && !selected.effectiveArchived
                ? `/knowledge/new?folder=${selected.id}`
                : "/knowledge/new"
            }
            className={primary}
          >
            <PlusIcon className="h-5 w-5" />
            New article
          </Link>
        </div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className={`${card} hidden lg:block`}>{navigation}</aside>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav
              aria-label="Folder breadcrumbs"
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <button className="text-blue-300" onClick={() => chooseCollection("all")}>
                Knowledge
              </button>
              {filters.folder === "unfiled" ? (
                <span>/ Unfiled</span>
              ) : (
                path.map((row) => (
                  <span key={row.id} className="inline-flex items-center gap-2">
                    <span className="text-gray-400">/</span>
                    <button
                      className="inline-flex items-center gap-1 text-blue-300"
                      onClick={() => chooseFolder(String(row.id))}
                    >
                      <FolderSymbol folder={row} />
                      {row.name}
                    </button>
                  </span>
                ))
              )}
              {!filters.folder && filters.collection !== "all" && (
                <span>
                  /{" "}
                  {filters.collection === "recent"
                    ? "Recently updated"
                    : filters.collection === "pinned"
                      ? "Pinned"
                      : "Archived"}
                </span>
              )}
            </nav>
            {selected && (
              <button
                className={button}
                onClick={() => {
                  setEditingFolder(selected);
                  setManagerOpen(true);
                }}
              >
                Manage folder
              </button>
            )}
          </div>
          {selected?.effectiveArchived && (
            <p className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300">
              This folder is archived. Its articles and subfolders are preserved.
            </p>
          )}
          {!filters.q &&
            filters.folder !== "unfiled" &&
            ["all", "archived"].includes(filters.collection) &&
            children.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {children.map((folder) => (
                  <button
                    className={`${card} flex items-center gap-3 text-left hover:border-blue-500/50`}
                    key={folder.id}
                    onClick={() => chooseFolder(String(folder.id))}
                  >
                    <FolderSymbol folder={folder} className="h-7 w-7 shrink-0" />
                    <span className="min-w-0 break-words font-medium">
                      {folder.name}
                      {folder.effectiveArchived ? " · Archived" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          <div className="flex flex-wrap gap-3">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search knowledge</span>
              <input
                className={input}
                type="search"
                value={filters.q}
                onChange={(event) => filter({ q: event.target.value })}
                maxLength={300}
                placeholder="Search articles, error messages, tags…"
              />
            </label>
            <button
              className={button}
              aria-expanded={filters.open}
              onClick={() => setFilters((old) => ({ ...old, open: !old.open }))}
            >
              <AdjustmentsHorizontalIcon className="h-5 w-5" />
              Search & filters{filters.type || filters.tag || filters.archived ? " •" : ""}
            </button>
          </div>
          {filters.folder && filters.q && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.withinFolder}
                onChange={(event) => filter({ withinFolder: event.target.checked })}
              />
              Search only this folder and its subfolders
            </label>
          )}
          {filters.open && (
            <div className={`${card} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
              <label>
                Type
                <select
                  className={input}
                  value={filters.type}
                  onChange={(event) => filter({ type: event.target.value })}
                >
                  <option value="">All types</option>
                  {["REFERENCE", "PROCEDURE", "TROUBLESHOOTING"].map((type) => (
                    <option key={type} value={type}>
                      {typeName(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tag
                <select
                  className={input}
                  value={filters.tag}
                  onChange={(event) => filter({ tag: event.target.value })}
                >
                  <option value="">All tags</option>
                  {tags.data?.map((tag) => (
                    <option key={tag.id} value={tag.name}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                View
                <select
                  className={input}
                  value={filters.archived ? "archived" : "active"}
                  onChange={(event) => filter({ archived: event.target.value === "archived" })}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  className={button}
                  onClick={() =>
                    filter({
                      q: "",
                      type: "",
                      tag: "",
                      archived: false,
                      folder: "",
                      collection: "all",
                      withinFolder: false,
                    })
                  }
                >
                  Clear filters
                </button>
                <button
                  className={button}
                  disabled={downloading}
                  onClick={async () => {
                    setDownloading(true);
                    setDownloadError("");
                    try {
                      await savePrivateFile("/api/knowledge/export", "knowledge.zip");
                    } catch (err) {
                      setDownloadError(err instanceof Error ? err.message : "Export failed.");
                    } finally {
                      setDownloading(false);
                    }
                  }}
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Export all
                </button>
              </div>
            </div>
          )}
          {downloadError && (
            <p role="alert" className="text-rose-400">
              {downloadError}
            </p>
          )}
          {!data ? (
            <ReadState error={error} retry={reload} />
          ) : (
            <>
              <p className="text-sm text-gray-400">
                {data.total} article{data.total === 1 ? "" : "s"}
              </p>
              {!data.items.length && (
                <div className={card}>
                  <h2 className="font-semibold">
                    {filters.q || filters.type || filters.tag
                      ? "No matching articles"
                      : filters.folder
                        ? "No articles in this folder"
                        : "Your knowledge library starts here"}
                  </h2>
                  <p className="mt-2 text-gray-400">
                    {filters.q || filters.type || filters.tag
                      ? "Try another search or clear the filters."
                      : "Save a procedure, a useful command, or the solution to a recurring problem."}
                  </p>
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {data.items.map((article) => (
                  <Link
                    className={`${card} transition hover:border-blue-500/50`}
                    key={article.id}
                    href={`/knowledge/${article.id}`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-blue-300">
                      <span>{typeName(article.type)}</span>
                      {article.pinned && <span>★ Pinned</span>}
                      {article.archivedAt && <span>Archived</span>}
                    </div>
                    <h2 className="text-lg font-semibold">{article.title}</h2>
                    {(article.summary || article.snippet) && (
                      <p className="mt-2 line-clamp-3 text-sm text-gray-400">
                        {article.summary || article.snippet}
                      </p>
                    )}
                    <p className="mt-4 text-xs text-gray-400">
                      Updated <DateTime value={article.updatedAt} />
                    </p>
                  </Link>
                ))}
              </div>
              <Paging {...data} onPage={(page) => setFilters((old) => ({ ...old, page }))} />
            </>
          )}
        </div>
      </div>
      <TaskModal open={navigationOpen} title="Folders" onClose={() => setNavigationOpen(false)}>
        {navigation}
      </TaskModal>
      <FolderManager
        open={managerOpen}
        folder={editingFolder}
        parentId={selected && !selected.effectiveArchived ? selected.id : null}
        folders={folders.data || []}
        onClose={() => setManagerOpen(false)}
        onSaved={(folder) => {
          setManagerOpen(false);
          folders.reload();
          reload();
          setFilters((old) => ({
            ...old,
            folder: String(folder.id),
            collection: "all",
            archived:
              !!folder.archivedAt ||
              !!folders.data?.find((row) => row.id === folder.parentId)?.effectiveArchived,
            page: 1,
          }));
        }}
      />
    </div>
  );
}
