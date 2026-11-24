import { activeDraft, draftId as parseDraftId } from "./draft-core";
import { validateInlineImages } from "./image-input";
import { folderRows, validateFolder } from "./folders";
import { descendantIds, isFolderArchived } from "./folder-tree";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner, OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { mutation, version } from "@/lib/work-management/server";
import { appendTaskActivity } from "@/lib/work-management/activity-server";
import { appendProjectActivity } from "@/lib/work-management/project-core";
import {
  workBody,
  workId,
  WorkValidationError,
  type WorkCommand,
} from "@/lib/work-management/validation";
import { articleInput, listPage, ARTICLE_TYPES } from "./input";
import { articleLinks } from "./markdown";
import { articleRow, articleSummarySelect, recordArticleRevision, type KnowledgeDB } from "./core";
const pageSize = 20;
export async function listArticles(params: URLSearchParams) {
  const page = listPage(params),
    q = (params.get("q") || "").trim();
  if (q.length > 300 || q.includes("\0"))
    throw new WorkValidationError("Search using up to 300 characters.");
  const type = params.get("type") || "",
    tag = params.get("tag") || "";
  if (type && !ARTICLE_TYPES.includes(type as (typeof ARTICLE_TYPES)[number]))
    throw new WorkValidationError("Choose a valid article type.");
  if (tag.length > 80 || tag.includes("\0")) throw new WorkValidationError("Choose a valid tag.");
  const folder = params.get("folder") || "",
    collection = params.get("collection") || "all";
  if (!["all", "pinned", "recent"].includes(collection))
    throw new WorkValidationError("Choose a valid collection.");
  const folderId = folder && folder !== "unfiled" ? workId(folder) : null;
  // SQL text is entirely static. Every owner/filter/search/pagination value is
  // a separate bound parameter. Avoid nested Sql objects across Next HMR runtimes.
  const where = `a."userId"=$1
    AND ($2::boolean = (a."archivedAt" IS NOT NULL OR coalesce(a."folderId"=ANY($6::int[]), false)))
    AND ($7::int[] IS NULL OR a."folderId"=ANY($7::int[]))
    AND (NOT $8::boolean OR a."folderId" IS NULL)
    AND (NOT $9::boolean OR a.pinned)
    AND ($3::text='' OR a.type=$3)
    AND ($4::text='' OR EXISTS (SELECT 1 FROM "KnowledgeArticleTag" at JOIN "KnowledgeTag" t ON t.id=at."tagId" WHERE at."articleId"=a.id AND t."normalizedName"=lower($4) AND t."userId"=$1))
    AND ($5::text='' OR strpos(lower(a.title || ' ' || a.summary || ' ' || a.body), lower($5))>0
      OR to_tsvector('simple', a.title || ' ' || a.summary || ' ' || a.body) @@ plainto_tsquery('simple', $5)
      OR EXISTS (SELECT 1 FROM "KnowledgeArticleTag" at JOIN "KnowledgeTag" t ON t.id=at."tagId" WHERE at."articleId"=a.id AND strpos(t."normalizedName",lower($5))>0 AND t."userId"=$1))`;
  return prisma.$transaction(
    async (db) => {
      const folders = await folderRows(db);
      if (folderId && !folders.some((row) => row.id === folderId))
        throw new WorkValidationError("Folder not found.", 404);
      const archivedIds = folders
        .filter((row) => isFolderArchived(folders, row.id))
        .map((row) => row.id);
      const searchAll = !!q && params.get("searchAll") === "1";
      const scope =
        folderId && !searchAll ? (q ? descendantIds(folders, folderId) : [folderId]) : null;
      const values = [
        owner,
        params.get("archived") === "1",
        type,
        tag,
        q,
        archivedIds,
        scope,
        folder === "unfiled" && !searchAll,
        collection === "pinned",
      ];
      const [{ total }] = await db.$queryRawUnsafe<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM "KnowledgeArticle" a WHERE ${where}`,
        ...values,
      );
      const rows = await db.$queryRawUnsafe<{ id: number; snippet: string }[]>(
        `
        SELECT a.id, substring(a.body FROM greatest(1, strpos(lower(a.body), lower($5))-70) FOR 220) AS snippet
        FROM "KnowledgeArticle" a WHERE ${where}
        ORDER BY CASE WHEN $5<>'' AND strpos(lower(a.title), lower($5))>0 THEN 0 ELSE 1 END,
          CASE WHEN NOT $10::boolean THEN a.pinned ELSE false END DESC, a."updatedAt" DESC, a.id DESC OFFSET $11::integer LIMIT 20`,
        ...values,
        collection === "recent",
        (page - 1) * pageSize,
      );
      const articles = await db.knowledgeArticle.findMany({
        where: { id: { in: rows.map((row) => row.id) }, userId: owner },
        select: { ...articleSummarySelect, tags: { include: { tag: true } } },
      });
      return {
        items: rows.map((row) => ({
          ...articles.find((article) => article.id === row.id)!,
          snippet: row.snippet,
        })),
        total,
        page,
        pageSize,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function articleDetail(id: number, params = new URLSearchParams()) {
  const page = listPage(params),
    skip = (page - 1) * pageSize;
  return prisma.$transaction(
    async (db) => {
      const article = await articleRow(db, id);
      const folderArchived = isFolderArchived(await folderRows(db), article.folderId);
      const [tags, backlinks, outgoing, tasks, projects, counts] = await Promise.all([
        db.knowledgeArticleTag.findMany({
          where: { articleId: id, userId: owner },
          include: { tag: true },
        }),
        db.knowledgeArticleLink.findMany({
          where: { targetId: id, userId: owner },
          select: { source: { select: articleSummarySelect } },
          skip,
          take: pageSize,
          orderBy: { sourceId: "desc" },
        }),
        db.knowledgeArticleLink.findMany({
          where: { sourceId: id, userId: owner },
          select: { target: { select: articleSummarySelect } },
          skip,
          take: pageSize,
          orderBy: { targetId: "desc" },
        }),
        db.knowledgeTaskLink.findMany({
          where: { articleId: id, userId: owner },
          select: { todo: { select: { id: true, title: true, status: true, archivedAt: true } } },
          skip,
          take: pageSize,
          orderBy: { todoId: "desc" },
        }),
        db.knowledgeProjectLink.findMany({
          where: { articleId: id, userId: owner },
          select: { project: { select: { id: true, name: true, status: true } } },
          skip,
          take: pageSize,
          orderBy: { projectId: "desc" },
        }),
        db.knowledgeArticle.findUniqueOrThrow({
          where: { id },
          select: {
            _count: { select: { incoming: true, outgoing: true, tasks: true, projects: true } },
          },
        }),
      ]);
      const broken = articleLinks(article.body).filter(
        (target) => !outgoing.some((entry) => entry.target.id === target),
      );
      // Missing links can be inherited from old revision imports; do not confuse pagination with missing targets.
      const existing = broken.length
        ? await db.knowledgeArticle.count({ where: { userId: owner, id: { in: broken } } })
        : 0;
      return {
        ...article,
        folderArchived,
        tags: tags.map((entry) => entry.tag.name),
        backlinks: backlinks.map((entry) => entry.source),
        outgoing: outgoing.map((entry) => entry.target),
        tasks: tasks.map((entry) => entry.todo),
        projects: projects.map((entry) => entry.project),
        counts: counts._count,
        page,
        pageSize,
        brokenLinkCount: broken.length - existing,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
async function writeContent(db: KnowledgeDB, id: number, input: ReturnType<typeof articleInput>) {
  const targets = articleLinks(input.body);
  if (targets.length > 200)
    throw new WorkValidationError("Use up to 200 article links per article.");
  if (
    (await db.knowledgeArticle.count({ where: { id: { in: targets }, userId: owner } })) !==
    targets.length
  )
    throw new WorkValidationError(
      "An article link points to a missing or unavailable article. Choose an existing article.",
    );
  await db.knowledgeArticleTag.deleteMany({ where: { articleId: id, userId: owner } });
  for (const name of input.tags) {
    const tag = await db.knowledgeTag.upsert({
      where: { userId_normalizedName: { userId: owner, normalizedName: name.toLowerCase() } },
      create: { name, normalizedName: name.toLowerCase(), userId: owner },
      update: {},
    });
    await db.knowledgeArticleTag.create({ data: { articleId: id, tagId: tag.id, userId: owner } });
  }
  await db.knowledgeArticleLink.deleteMany({ where: { sourceId: id, userId: owner } });
  if (targets.length)
    await db.knowledgeArticleLink.createMany({
      data: targets.map((targetId) => ({ sourceId: id, targetId, userId: owner })),
    });
}
export async function saveArticle(id: number | null, value: unknown, command: WorkCommand) {
  const raw = workBody(value, [
    "draftId",
    "taskIds",
    "projectIds",
    "folderId",
    "title",
    "summary",
    "body",
    "type",
    "tags",
    "pinned",
    "archived",
    "taskId",
    "projectId",
    "restoreRevision",
  ]);
  if (
    id &&
    (raw.taskId != null ||
      raw.projectId != null ||
      raw.taskIds != null ||
      raw.projectIds != null ||
      raw.draftId != null)
  )
    throw new WorkValidationError("Use the related work controls to change links.");
  if (!id && raw.restoreRevision != null)
    throw new WorkValidationError("Choose an existing article to restore.");
  const parsed = raw.restoreRevision == null ? articleInput(value) : null;
  const taskId = raw.taskId == null ? null : workId(raw.taskId),
    projectId = raw.projectId == null ? null : workId(raw.projectId);
  function selectedIds(value: unknown, single: number | null) {
    if (value !== undefined && (!Array.isArray(value) || value.length > 30))
      throw new WorkValidationError("Choose up to 30 tasks or projects.");
    return [
      ...new Set([...(single ? [single] : []), ...(Array.isArray(value) ? value.map(workId) : [])]),
    ];
  }
  const taskIds = selectedIds(raw.taskIds, taskId),
    projectIds = selectedIds(raw.projectIds, projectId);
  const draftId = raw.draftId == null ? null : parseDraftId(raw.draftId);
  return mutation(`knowledge:${id || "new"}:save`, value, command, async (db) => {
    const current = id ? await articleRow(db, id) : null;
    if (current) version(current, command);
    if (draftId) await activeDraft(db, draftId);
    let input = parsed;
    if (current && raw.restoreRevision != null) {
      const old = await db.knowledgeArticleRevision.findFirst({
        where: { articleId: current.id, userId: owner, revision: workId(raw.restoreRevision) },
      });
      if (!old) throw new WorkValidationError("Revision not found.", 404);
      input = articleInput({
        folderId: current.folderId,
        title: old.title,
        summary: old.summary,
        body: old.body,
        type: old.type,
        tags: old.tags,
        pinned: current.pinned,
        archived: !!current.archivedAt,
      });
    }
    if (!input) throw new WorkValidationError("Enter an article.");
    const { archived } = input;
    const folderId = raw.folderId === undefined ? (current?.folderId ?? null) : input.folderId;
    await validateFolder(db, folderId, current?.folderId);
    const content = {
      folderId,
      title: input.title,
      summary: input.summary,
      body: input.body,
      type: input.type,
      pinned: input.pinned,
    };
    const article = current
      ? await db.knowledgeArticle.update({
          where: { id: current.id },
          data: {
            ...content,
            archivedAt: archived ? current.archivedAt || new Date() : null,
            revision: { increment: 1 },
          },
        })
      : await db.knowledgeArticle.create({
          data: { ...content, userId: owner, archivedAt: archived ? new Date() : null },
        });
    if (raw.restoreRevision == null) await validateInlineImages(db, input.body, draftId);
    if (draftId) {
      await db.workAttachment.updateMany({
        where: { knowledgeDraftId: draftId, userId: owner },
        data: { knowledgeDraftId: null, knowledgeArticleId: article.id },
      });
      await db.knowledgeDraft.update({
        where: { id: draftId },
        data: { savedArticleId: article.id },
      });
    }
    await writeContent(db, article.id, input);
    await recordArticleRevision(
      db,
      article.id,
      raw.restoreRevision != null ? "RESTORED" : current ? "EDITED" : "CREATED",
    );
    for (const taskId of taskIds) await setWorkLink(db, article.id, "task", taskId, true);
    for (const projectId of projectIds)
      await setWorkLink(db, article.id, "project", projectId, true);
    return article;
  });
}
async function setWorkLink(
  db: KnowledgeDB,
  articleId: number,
  kind: "task" | "project",
  id: number,
  linked: boolean,
) {
  await articleRow(db, articleId);
  const row =
    kind === "task"
      ? await db.todo.findFirst({ where: { id, userId: owner }, select: { id: true } })
      : await db.workProject.findFirst({ where: { id, userId: owner }, select: { id: true } });
  if (!row) throw new WorkValidationError("Related work not found.", 404);
  const data = { articleId, userId: owner, actorGithubId: OWNER_GITHUB_ID };
  const existing =
    kind === "task"
      ? await db.knowledgeTaskLink.count({ where: { articleId, todoId: id, userId: owner } })
      : await db.knowledgeProjectLink.count({ where: { articleId, projectId: id, userId: owner } });
  if (!!existing === linked) return { linked };
  if (kind === "task") {
    if (linked) await db.knowledgeTaskLink.create({ data: { ...data, todoId: id } });
    else await db.knowledgeTaskLink.deleteMany({ where: { articleId, todoId: id, userId: owner } });
    await appendTaskActivity(db, id, linked ? "DOCUMENTATION_LINKED" : "DOCUMENTATION_UNLINKED", {
      articleId,
    });
  } else {
    if (linked) await db.knowledgeProjectLink.create({ data: { ...data, projectId: id } });
    else
      await db.knowledgeProjectLink.deleteMany({
        where: { articleId, projectId: id, userId: owner },
      });
    await appendProjectActivity(
      db,
      id,
      linked ? "DOCUMENTATION_LINKED" : "DOCUMENTATION_UNLINKED",
      { articleId },
    );
  }
  return { linked };
}
export async function changeWorkLink(articleId: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["kind", "id", "linked"]);
  if (!["task", "project"].includes(String(body.kind)) || typeof body.linked !== "boolean")
    throw new WorkValidationError("Choose a task or project and link action.");
  const id = workId(body.id);
  return mutation(`knowledge:${articleId}:link`, body, command, (db) =>
    setWorkLink(db, articleId, body.kind as "task" | "project", id, body.linked as boolean),
  );
}
export async function workArticles(
  kind: string,
  id: number,
  params = new URLSearchParams(),
  db: KnowledgeDB = prisma,
) {
  if (!["task", "project"].includes(kind))
    throw new WorkValidationError("Choose a task or project.");
  const parent =
    kind === "task"
      ? await db.todo.count({ where: { id, userId: owner } })
      : await db.workProject.count({ where: { id, userId: owner } });
  if (!parent) throw new WorkValidationError("Related work not found.", 404);
  const page = listPage(params),
    indirect = params.get("indirect") === "1" && kind === "project";
  const where: Prisma.KnowledgeArticleWhereInput = {
    userId: owner,
    ...(kind === "task"
      ? { tasks: { some: { todoId: id, userId: owner } } }
      : indirect
        ? {
            tasks: { some: { userId: owner, todo: { projectId: id, userId: owner } } },
            projects: { none: { projectId: id } },
          }
        : { projects: { some: { projectId: id, userId: owner } } }),
  };
  return {
    items: await db.knowledgeArticle.findMany({
      where,
      select: articleSummarySelect,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    total: await db.knowledgeArticle.count({ where }),
    page,
    pageSize,
  };
}
export async function revisions(id: number, params: URLSearchParams) {
  await articleRow(prisma, id);
  const page = listPage(params);
  return {
    items: await prisma.knowledgeArticleRevision.findMany({
      where: { articleId: id, userId: owner },
      orderBy: { revision: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    total: await prisma.knowledgeArticleRevision.count({ where: { articleId: id, userId: owner } }),
    page,
    pageSize,
  };
}
export async function tagOptions() {
  return prisma.knowledgeTag.findMany({
    where: { userId: owner, articles: { some: {} } },
    select: { id: true, name: true },
    orderBy: { normalizedName: "asc" },
    take: 500,
  });
}
export async function workOptions(kind: string, q: string) {
  if (q.length > 200 || q.includes("\0"))
    throw new WorkValidationError("Search using up to 200 characters.");
  if (kind === "task")
    return prisma.todo.findMany({
      where: { userId: owner, title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
  if (kind === "project")
    return (
      await prisma.workProject.findMany({
        where: { userId: owner, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true },
        orderBy: { updatedAt: "desc" },
        take: 30,
      })
    ).map((row) => ({ id: row.id, title: row.name }));
  throw new WorkValidationError("Choose a task or project.");
}
