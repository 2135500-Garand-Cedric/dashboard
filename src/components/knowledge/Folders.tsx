"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  FolderIcon,
  BriefcaseIcon,
  ServerIcon,
  BookOpenIcon,
  HomeIcon,
  CodeBracketIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import TaskModal from "@/components/shared/TaskModal";
import { useViewState } from "@/context/ViewStateContext";
import { createWorkWriter } from "@/lib/work-management/client";
import { descendantIds, folderPath, FOLDER_ICONS, type Folder } from "@/lib/knowledge/folder-tree";
import { button, primary, input, ReadState, useKnowledgeRead } from "./shared";
export function FolderSymbol({
  folder,
  className = "h-5 w-5 shrink-0",
}: {
  folder: Pick<Folder, "icon" | "color">;
  className?: string;
}) {
  const Icon =
    (
      {
        folder: FolderIcon,
        briefcase: BriefcaseIcon,
        server: ServerIcon,
        book: BookOpenIcon,
        home: HomeIcon,
        code: CodeBracketIcon,
      } as const
    )[folder.icon as (typeof FOLDER_ICONS)[number]] || FolderIcon;
  return <Icon className={className} style={{ color: folder.color }} aria-hidden="true" />;
}
export function FolderSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { data, error, reload } = useKnowledgeRead<Folder[]>("/api/knowledge/folders");
  return (
    <label className="block">
      Folder
      <select
        aria-label="Article folder"
        className={`${input} mt-1`}
        value={value ?? ""}
        disabled={!data}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">Unfiled</option>
        {data
          ?.filter((folder) => !folder.effectiveArchived || folder.id === value)
          .map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folderPath(data, folder.id)
                .map((node) => node.name)
                .join(" / ")}
              {folder.effectiveArchived ? " (Archived)" : ""}
            </option>
          ))}
      </select>
      {error && <ReadState error={error} retry={reload} />}
    </label>
  );
}
export function FolderBreadcrumbs({ folderId }: { folderId: number | null }) {
  const { data } = useKnowledgeRead<Folder[]>("/api/knowledge/folders");
  const path = data ? folderPath(data, folderId) : [];
  return (
    <nav
      aria-label="Article location"
      className="flex flex-wrap items-center gap-2 text-sm text-gray-400"
    >
      <Link className="hover:text-blue-300" href="/knowledge">
        Knowledge
      </Link>
      {folderId === null ? (
        <>
          <span>/</span>
          <Link href="/knowledge?folder=unfiled">Unfiled</Link>
        </>
      ) : (
        path.map((folder) => (
          <span className="inline-flex items-center gap-2" key={folder.id}>
            <span>/</span>
            <Link
              className="inline-flex items-center gap-1 hover:text-blue-300"
              href={`/knowledge?folder=${folder.id}`}
            >
              <FolderSymbol folder={folder} className="h-4 w-4" />
              {folder.name}
            </Link>
          </span>
        ))
      )}
    </nav>
  );
}
export function FolderNavigation({
  folders,
  selected,
  collection,
  archived,
  onSelect,
  onCollection,
  onCreate,
}: {
  folders: Folder[];
  selected: string;
  collection: string;
  archived: boolean;
  onSelect: (folder: string) => void;
  onCollection: (collection: string) => void;
  onCreate: () => void;
}) {
  const [expanded, setExpanded] = useViewState<number[]>("knowledge.expandedFolders", []);
  function tree(parentId: number | null): React.ReactNode {
    return folders
      .filter((folder) => folder.parentId === parentId && (archived || !folder.effectiveArchived))
      .map((folder) => {
        const children = folders.some(
          (child) => child.parentId === folder.id && (archived || !child.effectiveArchived),
        );
        const open = expanded.includes(folder.id);
        const count = folders
          .filter((row) => descendantIds(folders, folder.id).includes(row.id))
          .reduce(
            (total, row) => total + (archived ? row.archivedArticleCount : row.activeArticleCount),
            0,
          );
        return (
          <li key={folder.id}>
            <div className="flex min-w-0 items-center gap-1">
              <button
                className="rounded p-1 disabled:opacity-0"
                aria-label={`${open ? "Collapse" : "Expand"} ${folder.name}`}
                disabled={!children}
                aria-expanded={children ? open : undefined}
                onClick={() =>
                  setExpanded((old) =>
                    open ? old.filter((id) => id !== folder.id) : [...old, folder.id],
                  )
                }
              >
                {open ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>
              <button
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${selected === String(folder.id) ? "bg-blue-500/15 text-blue-300" : "hover:bg-blue-500/5"}`}
                aria-current={selected === String(folder.id) ? "page" : undefined}
                onClick={() => onSelect(String(folder.id))}
              >
                <FolderSymbol folder={folder} />
                <span className="min-w-0 flex-1 break-words">
                  {folder.name}
                  {folder.effectiveArchived ? " (Archived)" : ""}
                </span>
                <span className="text-xs text-gray-400">{count}</span>
              </button>
            </div>
            {children && open && (
              <ul className="ml-3 border-l border-card-border pl-2">{tree(folder.id)}</ul>
            )}
          </li>
        );
      });
  }
  return (
    <nav aria-label="Knowledge folders" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Browse</h2>
        <button className={button} aria-label="New folder" onClick={onCreate}>
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1">
        {[
          ["all", "All articles"],
          ["pinned", "Pinned"],
          ["recent", "Recently updated"],
          ["unfiled", "Unfiled"],
          ["archived", "Archived"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${(!selected && collection === key) || (selected === "unfiled" && key === "unfiled") ? "bg-blue-500/15 text-blue-300" : "hover:bg-blue-500/5"}`}
            onClick={() => (key === "unfiled" ? onSelect("unfiled") : onCollection(key))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="border-t border-card-border pt-3">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-gray-400">Folders</h3>
        <ul>{tree(null)}</ul>
        {!folders.length && (
          <p className="text-sm text-gray-400">Create a folder to organize your articles.</p>
        )}
      </div>
    </nav>
  );
}
export function FolderManager({
  open,
  folder,
  parentId,
  folders,
  onClose,
  onSaved,
}: {
  open: boolean;
  folder: Folder | null;
  parentId: number | null;
  folders: Folder[];
  onClose: () => void;
  onSaved: (folder: Folder) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <TaskModal
      open={open}
      title={folder ? "Manage folder" : "New folder"}
      busy={busy}
      onClose={onClose}
    >
      {open && (
        <FolderForm
          key={folder?.id || `new:${parentId}`}
          folder={folder}
          parentId={parentId}
          folders={folders}
          onSaved={onSaved}
          onBusy={setBusy}
        />
      )}
    </TaskModal>
  );
}
function FolderForm({
  folder,
  parentId,
  folders,
  onSaved,
  onBusy,
}: {
  folder: Folder | null;
  parentId: number | null;
  folders: Folder[];
  onSaved: (folder: Folder) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState(folder?.name || ""),
    [parent, setParent] = useState<number | null>(folder ? folder.parentId : parentId),
    [color, setColor] = useState(folder?.color || "#60a5fa"),
    [icon, setIcon] = useState(folder?.icon || "folder"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const writer = useRef(createWorkWriter());
  const forbidden = folder ? descendantIds(folders, folder.id) : [];
  async function save(archived = !!folder?.archivedAt) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const row = await writer.current<Folder>(
        folder ? `/api/knowledge/folders/${folder.id}` : "/api/knowledge/folders",
        folder ? "PATCH" : "POST",
        { name, parentId: parent, color, icon, archived },
        folder?.revision,
      );
      onSaved(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save folder.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        <label className="block">
          Name
          <input
            aria-label="Folder name"
            className={`${input} mt-1`}
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block">
          Parent folder
          <select
            aria-label="Parent folder"
            className={`${input} mt-1`}
            value={parent ?? ""}
            onChange={(event) => setParent(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Knowledge (top level)</option>
            {folders
              .filter(
                (row) =>
                  !forbidden.includes(row.id) &&
                  (!row.effectiveArchived || row.id === folder?.parentId),
              )
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {folderPath(folders, row.id)
                    .map((node) => node.name)
                    .join(" / ")}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label>
            Icon
            <select
              aria-label="Folder icon"
              className={`${input} mt-1`}
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            >
              {FOLDER_ICONS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Color
            <input
              aria-label="Folder color"
              className={`${input} mt-1 h-11`}
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
        </div>
        {folder?.effectiveArchived && !folder.archivedAt && (
          <p className="text-sm text-amber-300">
            A parent folder is archived. Restore that parent or move this folder to an active
            location.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className={primary} type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save folder"}
          </button>
          {folder && (
            <button
              type="button"
              className={button}
              disabled={busy || (!!folder.effectiveArchived && !folder.archivedAt)}
              onClick={() => {
                if (
                  folder.archivedAt ||
                  window.confirm(
                    "Archive this folder and hide its contents from the active view? All articles, subfolders, and links will be kept.",
                  )
                )
                  void save(!folder.archivedAt);
              }}
            >
              {folder.archivedAt ? "Restore folder" : "Archive folder"}
            </button>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
    </form>
  );
}
