import { folderRows } from "./folders";
import { folderPath } from "./folder-tree";
import { zipSync, strToU8 } from "fflate";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { workFileStore, documentHash, fileOperation } from "@/lib/work-management/files";
import { WorkValidationError } from "@/lib/work-management/validation";
import MarkdownIt from "markdown-it";
import { markdown, articleIdFromHref } from "./markdown";

// Use the parser's actual inline rules to locate destinations. Text, fenced code,
// inline code, and escaped link syntax are never interpreted as export links.
export function exportMarkdown(
  body: string,
  names: Map<number, string>,
  attachments: Map<string, string>,
) {
  const parser = new MarkdownIt({ html: false });
  const mapped = (href: string) => {
    const id = articleIdFromHref(href),
      name = id ? names.get(id) : attachments.get(href);
    return name ? name + (id ? href.replace(/^\/knowledge\/\d+/, "") : "") : null;
  };
  let replacements: { start: number; end: number; value: string }[] = [];
  for (const name of ["link", "image"]) {
    const original = parser.inline.ruler.getRules("").find((rule) => rule.name === name)!;
    parser.inline.ruler.at(name, (state, silent) => {
      const start = state.pos;
      const matched = original(state, silent);
      if (!matched || silent) return matched;
      const source = state.src.slice(start, state.pos);
      const destinations = [
        ...source.matchAll(/\]\(\s*<?(\/(?:knowledge|api\/knowledge)\/[^\s)>]+)>?(?:\s|\))/g),
      ];
      const destination = destinations[destinations.length - 1];
      if (destination) {
        const href = destination[1],
          value = mapped(href);
        if (value) {
          const position = start + destination.index! + destination[0].indexOf(href);
          replacements.push({ start: position, end: position + href.length, value });
        }
      }
      return matched;
    });
  }
  const env: { references?: Record<string, { href: string; title: string }> } = {};
  const tokens = markdown.parse(body, env),
    excluded = new Set<number>();
  for (const token of tokens) {
    if (["fence", "code_block"].includes(token.type) && token.map)
      for (let i = token.map[0]; i < token.map[1]; i++) excluded.add(i);
  }
  return body
    .split("\n")
    .map((line, index) => {
      if (excluded.has(index)) return line;
      replacements = [];
      parser.parseInline(line, env);
      for (const replacement of [
        ...new Map(replacements.map((row) => [row.start, row])).values(),
      ].sort((a, b) => b.start - a.start))
        line = line.slice(0, replacement.start) + replacement.value + line.slice(replacement.end);
      // Markdown reference-style definitions carry destinations outside inline links.
      return line.replace(
        /^( {0,3}\[([^\]]+)\]:\s*)(<?)(\S+?)(>?)(\s.*)?$/,
        (full, prefix, label, open, href, close, rest) => {
          const reference = env.references?.[label.trim().replace(/\s+/g, " ").toUpperCase()];
          const value = reference && mapped(href);
          return value ? `${prefix}${open}${value}${close}${rest || ""}` : full;
        },
      );
    })
    .join("\n");
}
export async function exportKnowledge(id?: number) {
  // A repeatable snapshot plus file hash verification prevents exporting
  // inconsistent bytes. Concurrent file removal causes an explicit retry error.
  return prisma.$transaction(
    async (db) => {
      const articles = await db.knowledgeArticle.findMany({
        where: { userId: owner, ...(id ? { id } : {}) },
        include: {
          tags: { include: { tag: true } },
          tasks: { select: { todoId: true } },
          projects: { select: { projectId: true } },
          attachments: { where: { removedAt: null } },
        },
        orderBy: { id: "asc" },
      });
      if (id && !articles.length) throw new WorkValidationError("Article not found.", 404);
      const size = articles.reduce(
        (total, row) =>
          total +
          Buffer.byteLength(row.body) +
          row.attachments.reduce((sum, file) => sum + file.byteSize, 0),
        0,
      );
      if (size > 100 * 1024 * 1024 || articles.length > 1000)
        throw new WorkValidationError(
          "This export is too large. Export individual articles instead.",
          413,
        );
      const folders = await folderRows(db);
      const includedFolderIds = new Set(
        articles.flatMap((row) => folderPath(folders, row.folderId).map((folder) => folder.id)),
      );
      const manifestFolders = id
        ? folders.filter((folder) => includedFolderIds.has(folder.id))
        : folders;
      const names = new Map(articles.map((row) => [row.id, `article-${row.id}.md`]));
      const files: Record<string, Uint8Array> = {},
        manifest: unknown[] = [];
      const attachments = new Map(
        articles.flatMap((row) =>
          row.attachments.map((file) => [
            file.inlineImage
              ? `/api/knowledge/images/${file.id}/file`
              : `/api/knowledge/${row.id}/attachments/${file.id}/file`,
            `attachments/${file.id}-${file.storageKey}`,
          ]),
        ),
      );
      for (const row of articles) {
        for (const file of row.attachments) {
          const name = `attachments/${file.id}-${file.storageKey}`;
          const bytes = await fileOperation(() => workFileStore().read(file.storageKey));
          if (bytes.length !== file.byteSize || documentHash(bytes) !== file.contentHash)
            throw new WorkValidationError(
              "An attachment differs from its saved original. Restore or replace it before exporting.",
              409,
            );
          files[name] = bytes;
          attachments.set(
            file.inlineImage
              ? `/api/knowledge/images/${file.id}/file`
              : `/api/knowledge/${row.id}/attachments/${file.id}/file`,
            name,
          );
        }
        files[names.get(row.id)!] = strToU8(
          `---\n${["id", "title", "summary", "type", "revision", "createdAt", "updatedAt", "archivedAt"].map((key) => `${key}: ${JSON.stringify(row[key as keyof typeof row])}`).join("\n")}\ntags: ${JSON.stringify(row.tags.map((entry) => entry.tag.name))}\n---\n\n${exportMarkdown(row.body, names, attachments)}`,
        );
        manifest.push({
          id: row.id,
          folderId: row.folderId,
          folderPath: folderPath(folders, row.folderId).map((folder) => folder.name),
          filename: names.get(row.id),
          taskIds: row.tasks.map((entry) => entry.todoId),
          projectIds: row.projects.map((entry) => entry.projectId),
          attachments: row.attachments.map((file) => ({
            id: file.id,
            originalName: file.originalName,
            filename: attachments.get(
              file.inlineImage
                ? `/api/knowledge/images/${file.id}/file`
                : `/api/knowledge/${row.id}/attachments/${file.id}/file`,
            ),
            inlineImage: file.inlineImage,
            hash: file.contentHash,
          })),
        });
      }
      files["manifest.json"] = strToU8(
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            folders: manifestFolders.map(({ id, parentId, name, color, icon, archivedAt }) => ({
              id,
              parentId,
              name,
              color,
              icon,
              archivedAt,
            })),
            articles: manifest,
          },
          null,
          2,
        ),
      );
      return zipSync(files, { level: 0 });
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
