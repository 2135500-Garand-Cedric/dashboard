import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { mutation, version } from "@/lib/work-management/server";
import { workBody, WorkValidationError, type WorkCommand } from "@/lib/work-management/validation";
import { ARTICLE_TYPES, listPage } from "./input";
import { validateInlineImages } from "./image-input";
export async function listTemplates(params: URLSearchParams) {
  const page = listPage(params),
    q = (params.get("q") || "").trim();
  if (q.length > 160 || q.includes("\0"))
    throw new WorkValidationError("Search templates using up to 160 characters.");
  const where = {
    userId: owner,
    archivedAt: params.get("archived") === "1" ? { not: null } : null,
    name: { contains: q, mode: "insensitive" as const },
  };
  return {
    items: await prisma.knowledgeTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        revision: true,
        archivedAt: true,
        updatedAt: true,
      },
      orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
      take: 20,
      skip: (page - 1) * 20,
    }),
    total: await prisma.knowledgeTemplate.count({ where }),
    page,
    pageSize: 20,
  };
}
export async function readTemplate(id: number) {
  const row = await prisma.knowledgeTemplate.findFirst({ where: { id, userId: owner } });
  if (!row) throw new WorkValidationError("Template not found.", 404);
  return row;
}
export async function saveTemplate(id: number | null, value: unknown, command: WorkCommand) {
  const input = workBody(value, ["name", "body", "type", "archived"]);
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 160 ||
    /[\x00-\x1f]/.test(input.name)
  )
    throw new WorkValidationError("Name your template using 1–160 characters.");
  if (
    typeof input.body !== "string" ||
    !input.body.trim() ||
    input.body.length > 200000 ||
    input.body.includes("\0")
  )
    throw new WorkValidationError("Write template text between 1 and 200,000 characters.");
  if (!ARTICLE_TYPES.includes(input.type as (typeof ARTICLE_TYPES)[number]))
    throw new WorkValidationError("Choose a valid template type.");
  if (input.archived !== undefined && typeof input.archived !== "boolean")
    throw new WorkValidationError("Choose a valid archive setting.");
  const name = input.name.trim(),
    body = input.body.replace(/\r\n?/g, "\n"),
    type = String(input.type);
  return mutation(`knowledge:template:${id || "new"}`, value, command, async (db) => {
    const current = id
      ? await db.knowledgeTemplate.findFirst({ where: { id, userId: owner } })
      : null;
    if (id && !current) throw new WorkValidationError("Template not found.", 404);
    if (current) version(current, command);
    if (
      await db.knowledgeTemplate.count({
        where: {
          userId: owner,
          normalizedName: name.toLowerCase(),
          ...(id ? { id: { not: id } } : {}),
        },
      })
    )
      throw new WorkValidationError("A template with this name already exists.", 409);
    await validateInlineImages(db, body, null);
    const data = {
      name,
      normalizedName: name.toLowerCase(),
      body,
      type,
      archivedAt:
        input.archived === undefined
          ? (current?.archivedAt ?? null)
          : input.archived
            ? current?.archivedAt || new Date()
            : null,
    };
    return current
      ? db.knowledgeTemplate.update({
          where: { id: current.id },
          data: { ...data, revision: { increment: 1 } },
        })
      : db.knowledgeTemplate.create({ data: { ...data, userId: owner } });
  });
}
