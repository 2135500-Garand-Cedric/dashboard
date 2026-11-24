import { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { planningWhere, planningWindow } from "@/lib/work-management/planning-rules";
import { recurrenceVisibility } from "@/lib/work-management/recurrence-visibility";
import { reportList, type ReportItem, type WeeklyPeriod } from "./period";

type DB = Prisma.TransactionClient;
export async function workHistory(
  db: DB,
  p: WeeklyPeriod,
  section: "completed" | "reopened" | "cancelled",
  offset = 0,
  limit = 3,
) {
  const action = { completed: "COMPLETED", reopened: "REOPENED", cancelled: "CANCELLED" }[section];
  // Distinct logical tasks, not note echoes or repeated completion events.
  const chosen = Prisma.sql`WITH chosen AS (
    SELECT DISTINCT ON (COALESCE(a."todoId"::text, a."todoReference")) a.*
    FROM "WorkActivity" a LEFT JOIN "Todo" t ON t.id = a."todoId"
    WHERE a."userId" = ${owner} AND a.action = ${action}
      AND (a."todoId" IS NOT NULL OR a."todoReference" IS NOT NULL)
      AND (a."todoId" IS NULL OR t."userId" = ${owner})
      AND a."createdAt" >= (${p.start}::timestamptz AT TIME ZONE 'UTC')
      AND a."createdAt" < (${p.cutoff}::timestamptz AT TIME ZONE 'UTC')
    ORDER BY COALESCE(a."todoId"::text, a."todoReference"), a."createdAt" DESC, a.id DESC
  )`;
  const [counts, rows] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`${chosen} SELECT count(*) AS total FROM chosen`),
    db.$queryRaw<
      {
        id: number;
        todoId: number | null;
        todoReference: string | null;
        title: string | null;
        project: string | null;
        status: string | null;
        archived: boolean;
        createdAt: Date;
      }[]
    >(Prisma.sql`${chosen}
      SELECT a.id, a."todoId", a."todoReference", COALESCE(t.title, a.changes->'title'->>'after', a."todoReference", 'Deleted task') AS title,
        p.name AS project, t.status::text AS status, t."archivedAt" IS NOT NULL AS archived, a."createdAt"
      FROM chosen a LEFT JOIN "Todo" t ON t.id = a."todoId" AND t."userId" = ${owner}
      LEFT JOIN "WorkProject" p ON p.id = t."projectId" AND p."userId" = ${owner}
      ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`),
  ]);
  return reportList(
    Number(counts[0].total),
    rows.map((row) => ({
      id: `task:${row.todoId ?? row.todoReference ?? row.id}`,
      title: row.title || "Deleted task",
      subtitle: row.project,
      when: row.createdAt.toISOString(),
      href: row.todoId ? `/todos/${row.todoId}` : null,
      badges: [
        ...(!row.todoId ? ["Deleted"] : []),
        ...(row.archived ? ["Archived"] : []),
        ...(section === "completed" && row.status && row.status !== "DONE"
          ? [row.status === "CANCELLED" ? "Now cancelled" : "Reopened"]
          : []),
      ],
    })),
    offset,
    section,
    p,
  );
}

export async function attention(
  db: DB,
  p: WeeklyPeriod,
  section: "attention" | "projects",
  offset = 0,
  limit = 3,
) {
  const window = planningWindow(p.today, p.timeZone);
  if (section === "projects") {
    const where: Prisma.WorkProjectWhereInput = {
      userId: owner,
      archivedAt: null,
      status: "ACTIVE",
      targetDate: { lt: window.through },
    };
    const [total, rows] = await Promise.all([
      db.workProject.count({ where }),
      db.workProject.findMany({
        where,
        select: { id: true, name: true, targetDate: true },
        orderBy: [{ targetDate: "asc" }, { id: "asc" }],
        skip: offset,
        take: limit,
      }),
    ]);
    return reportList(
      total,
      rows.map((row) => ({
        id: `project:${row.id}`,
        title: row.name,
        subtitle: "Project target",
        when: row.targetDate,
        href: `/projects/${row.id}`,
        badges: [row.targetDate! < p.today ? "Overdue" : "Upcoming"],
      })),
      offset,
      section,
      p,
    );
  }
  const visible = await recurrenceVisibility(db, p.now);
  const overdue = planningWhere("overdue", p.today, p.timeZone, p.now, owner),
    followups = planningWhere("followups", p.today, p.timeZone, p.now, owner),
    upcoming = planningWhere("upcoming", p.today, p.timeZone, p.now, owner);
  const where: Prisma.TodoWhereInput = {
    AND: [
      { userId: owner, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] } },
      visible.task,
      { OR: [overdue, followups, upcoming] },
    ],
  };
  const [total, rows] = await Promise.all([
    db.todo.count({ where }),
    db.todo.findMany({
      where,
      select: {
        id: true,
        title: true,
        deadlineDate: true,
        deadlineAt: true,
        project: { select: { userId: true, name: true } },
        followUps: {
          where: { status: "ACTIVE", OR: [{ date: { lte: p.today } }, { at: { lte: p.now } }] },
          select: { id: true },
        },
      },
      orderBy: [{ deadlineDate: "asc" }, { deadlineAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
    }),
  ]);
  return reportList(
    total,
    rows.map((row) => {
      const late = !!(
        (row.deadlineDate && row.deadlineDate < p.today) ||
        (row.deadlineAt && row.deadlineAt < p.now)
      );
      const next = !!(
        (row.deadlineDate && row.deadlineDate >= p.today && row.deadlineDate < window.through) ||
        (row.deadlineAt && row.deadlineAt >= p.now && row.deadlineAt < window.upcomingEnd)
      );
      return {
        id: `task:${row.id}`,
        title: row.title,
        subtitle: row.project?.userId === owner ? row.project.name : null,
        when: row.deadlineAt?.toISOString() ?? row.deadlineDate,
        href: `/todos/${row.id}`,
        badges: [
          ...(late ? ["Overdue deadline"] : []),
          ...(row.followUps.length ? ["Follow-up due"] : []),
          ...(next ? ["Upcoming deadline"] : []),
        ],
      } satisfies ReportItem;
    }),
    offset,
    section,
    p,
  );
}
