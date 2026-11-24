import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { mutation, version } from "@/lib/work-management/server";
import {
  workBody,
  workId,
  WorkValidationError,
  type WorkCommand,
} from "@/lib/work-management/validation";
import { descendantIds, folderPath, isFolderArchived, FOLDER_ICONS } from "./folder-tree";
import type { KnowledgeDB } from "./core";
export async function folderRows(db: KnowledgeDB = prisma) {
  return db.knowledgeFolder.findMany({
    where: { userId: owner },
    orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
  });
}
export async function listFolders() {
  return prisma.$transaction(
    async (db) => {
      const folders = await folderRows(db);
      const groups = await db.knowledgeArticle.groupBy({
        by: ["folderId", "archivedAt"],
        where: { userId: owner },
        _count: true,
      });
      return folders.map((folder) => {
        const effectiveArchived = isFolderArchived(folders, folder.id);
        const own = groups.filter((group) => group.folderId === folder.id);
        return {
          ...folder,
          effectiveArchived,
          activeArticleCount: own
            .filter((group) => !group.archivedAt && !effectiveArchived)
            .reduce((n, g) => n + g._count, 0),
          archivedArticleCount: own
            .filter((group) => !!group.archivedAt || effectiveArchived)
            .reduce((n, g) => n + g._count, 0),
        };
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function validateFolder(
  db: KnowledgeDB,
  id: number | null,
  currentId?: number | null,
) {
  if (id === null) return;
  const folders = await folderRows(db);
  if (!folders.some((folder) => folder.id === id))
    throw new WorkValidationError("Folder not found.", 404);
  if (id !== currentId && isFolderArchived(folders, id))
    throw new WorkValidationError(
      "Choose an active folder. Restore its archived parents first.",
      409,
    );
}
export async function saveFolder(id: number | null, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["name", "parentId", "color", "icon", "archived"]);
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 120 ||
    /[\x00-\x1f/\\]/.test(body.name)
  )
    throw new WorkValidationError("Enter a folder name of 1–120 characters without slashes.");
  const name = body.name.trim(),
    normalizedName = name.toLowerCase();
  const requestedParentId = body.parentId == null ? null : workId(body.parentId);
  const color = body.color ?? "#60a5fa",
    icon = body.icon ?? "folder";
  if (typeof color !== "string" || !/^#[a-f\d]{6}$/i.test(color))
    throw new WorkValidationError("Choose a valid folder color.");
  if (!FOLDER_ICONS.includes(icon as (typeof FOLDER_ICONS)[number]))
    throw new WorkValidationError("Choose a valid folder icon.");
  if (body.archived !== undefined && typeof body.archived !== "boolean")
    throw new WorkValidationError("Choose a valid archive setting.");
  return mutation(`knowledge:folder:${id || "new"}`, body, command, async (db) => {
    const folders = await folderRows(db),
      current = id ? folders.find((row) => row.id === id) : null;
    if (id && !current) throw new WorkValidationError("Folder not found.", 404);
    if (current) version(current, command);
    const parentId = Object.hasOwn(body, "parentId")
      ? requestedParentId
      : (current?.parentId ?? null);
    const descendants = id ? descendantIds(folders, id) : [];
    if (parentId !== null && descendants.includes(parentId))
      throw new WorkValidationError("A folder cannot be moved into itself or a subfolder.", 409);
    await validateFolder(db, parentId, current?.parentId);
    const newDepth = folderPath(folders, parentId).length + 1;
    const depthBelow = current
      ? Math.max(
          ...descendants.map(
            (child) => folderPath(folders, child).length - folderPath(folders, current.id).length,
          ),
        )
      : 0;
    if (newDepth + depthBelow > 12) throw new WorkValidationError("Use up to 12 folder levels.");
    if (
      folders.some(
        (row) =>
          row.id !== id && row.parentId === parentId && row.normalizedName === normalizedName,
      )
    )
      throw new WorkValidationError("A folder with this name already exists here.", 409);
    const archived = body.archived === undefined ? !!current?.archivedAt : body.archived;
    const data = {
      name,
      normalizedName,
      parentId,
      color: body.color === undefined ? (current?.color ?? color) : color,
      icon: body.icon === undefined ? (current?.icon ?? String(icon)) : String(icon),
      archivedAt: archived ? current?.archivedAt || new Date() : null,
    };
    return current
      ? db.knowledgeFolder.update({
          where: { id: current.id },
          data: { ...data, revision: { increment: 1 } },
        })
      : db.knowledgeFolder.create({ data: { ...data, userId: owner } });
  });
}
