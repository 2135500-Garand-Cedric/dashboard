import { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { reportList, type WeeklyPeriod } from "./period";

type DB = Prisma.TransactionClient;
export async function practiceSummary(db: DB, p: WeeklyPeriod) {
  const rows = await db.$queryRaw<
    {
      kind: string;
      sessions: bigint;
      reviews: bigint;
      weak: bigint;
      good: bigint;
      perfect: bigint;
      seconds: bigint | null;
      timed: bigint;
      measured: bigint;
      impact: number | null;
    }[]
  >(Prisma.sql`
    SELECT CASE WHEN "activityId" = 5 THEN 'kanji' ELSE 'vocab' END AS kind,
      count(*) AS sessions, coalesce(sum("wordCount"), 0) AS reviews,
      coalesce(sum("weakCount"), 0) AS weak, coalesce(sum("goodCount"), 0) AS good, coalesce(sum("perfectCount"), 0) AS perfect,
      sum("durationSeconds") AS seconds, count("durationSeconds") AS timed,
      count(*) FILTER (WHERE "averageBefore" IS NOT NULL AND "averageAfter" IS NOT NULL) AS measured,
      sum("averageAfter" - "averageBefore") AS impact
    FROM "Practice" WHERE "userId" = ${owner}
      AND date >= (${p.start}::timestamptz AT TIME ZONE 'UTC')
      AND date < (${p.cutoff}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY CASE WHEN "activityId" = 5 THEN 'kanji' ELSE 'vocab' END`);
  function summary(kind: string) {
    const row = rows.find((row) => row.kind === kind);
    const count = Number(row?.sessions ?? 0),
      timed = Number(row?.timed ?? 0),
      measured = Number(row?.measured ?? 0);
    return {
      sessions: count,
      reviews: Number(row?.reviews ?? 0),
      weak: Number(row?.weak ?? 0),
      good: Number(row?.good ?? 0),
      perfect: Number(row?.perfect ?? 0),
      durationSeconds: timed ? Number(row!.seconds) : count ? null : 0,
      partialTime: timed < count,
      impact: measured ? row!.impact : count ? null : 0,
      partialImpact: measured < count,
    };
  }
  return { vocab: summary("vocab"), kanji: summary("kanji") };
}
export async function practiceItems(
  db: DB,
  p: WeeklyPeriod,
  section: "vocab" | "kanji",
  offset = 0,
  limit = 3,
) {
  const where: Prisma.PracticeWhereInput = {
    userId: owner,
    date: { gte: p.start, lt: p.cutoff },
    activityId: section === "kanji" ? 5 : { not: 5 },
  };
  const [total, rows] = await Promise.all([
    db.practice.count({ where }),
    db.practice.findMany({
      where,
      select: {
        id: true,
        date: true,
        activityName: true,
        wordCount: true,
        durationSeconds: true,
        activity: { select: { activity: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: offset,
      take: limit,
    }),
  ]);
  return reportList(
    total,
    rows.map((row) => ({
      id: `practice:${row.id}`,
      title: row.activityName ?? row.activity.activity,
      subtitle: `${row.wordCount} word reviews`,
      when: row.date.toISOString(),
      href: `/japanese/practice/history/${row.id}`,
      badges: row.durationSeconds === null ? ["Time not recorded"] : [],
    })),
    offset,
    section,
    p,
  );
}

export async function knowledgeItems(
  db: DB,
  p: WeeklyPeriod,
  section: "created" | "changed",
  offset = 0,
  limit = 3,
) {
  const condition =
    section === "created"
      ? Prisma.sql`a."createdAt" >= ${p.start} AND a."createdAt" < ${p.cutoff}`
      : Prisma.sql`a."createdAt" < ${p.start} AND EXISTS (SELECT 1 FROM "KnowledgeArticleRevision" r WHERE r."articleId" = a.id AND r."userId" = ${owner} AND r."recordedAt" >= ${p.start} AND r."recordedAt" < ${p.cutoff})`;
  const base = Prisma.sql`FROM "KnowledgeArticle" a WHERE a."userId" = ${owner} AND ${condition}`;
  const [counts, rows] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total ${base}`),
    db.$queryRaw<
      {
        id: number;
        title: string;
        type: string;
        archived: boolean;
        at: Date;
        action: string | null;
      }[]
    >(Prisma.sql`
      SELECT a.id, coalesce(r.title, a.title) AS title, coalesce(r.type, a.type) AS type,
        a."archivedAt" IS NOT NULL AS archived, coalesce(r."recordedAt", a."createdAt") AS at, r.action
      FROM "KnowledgeArticle" a LEFT JOIN LATERAL (
        SELECT title, type, "recordedAt", action FROM "KnowledgeArticleRevision"
        WHERE "articleId" = a.id AND "userId" = ${owner} AND "recordedAt" < ${p.cutoff}
        ORDER BY "recordedAt" DESC, revision DESC LIMIT 1
      ) r ON true
      WHERE a."userId" = ${owner} AND ${condition}
      ORDER BY at DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`),
  ]);
  return reportList(
    Number(counts[0].total),
    rows.map((row) => ({
      id: `article:${row.id}`,
      title: row.title,
      subtitle: row.type.charAt(0) + row.type.slice(1).toLowerCase(),
      when: row.at.toISOString(),
      href: `/knowledge/${row.id}`,
      badges: [
        ...(row.archived ? ["Archived"] : []),
        ...(section === "changed" && row.action
          ? [row.action.charAt(0) + row.action.slice(1).toLowerCase()]
          : []),
      ],
    })),
    offset,
    section,
    p,
  );
}
