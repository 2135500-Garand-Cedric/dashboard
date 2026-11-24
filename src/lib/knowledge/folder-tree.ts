export const FOLDER_ICONS = ["folder", "briefcase", "server", "book", "home", "code"] as const;
export type FolderNode = {
  id: number;
  parentId: number | null;
  name: string;
  archivedAt: Date | string | null;
};
export type Folder = FolderNode & {
  revision: number;
  color: string;
  icon: string;
  effectiveArchived: boolean;
  activeArticleCount: number;
  archivedArticleCount: number;
};
export function folderPath<T extends FolderNode>(folders: T[], id: number | null): T[] {
  const rows = new Map(folders.map((folder) => [folder.id, folder])),
    seen = new Set<number>(),
    path: T[] = [];
  while (id !== null) {
    if (seen.has(id)) throw new Error("Folder hierarchy contains a cycle.");
    seen.add(id);
    const folder = rows.get(id);
    if (!folder) break;
    path.unshift(folder);
    id = folder.parentId;
  }
  return path;
}
export function descendantIds(folders: FolderNode[], id: number): number[] {
  const result = new Set([id]),
    queue = [id];
  while (queue.length) {
    const parent = queue.shift();
    for (const folder of folders)
      if (folder.parentId === parent && !result.has(folder.id)) {
        result.add(folder.id);
        queue.push(folder.id);
      }
  }
  return [...result];
}
export function isFolderArchived(folders: FolderNode[], id: number | null): boolean {
  return folderPath(folders, id).some((folder) => !!folder.archivedAt);
}
