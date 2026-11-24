import { prisma } from "@/lib/prisma";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { workHistory, attention } from "./work";
import { practiceSummary, practiceItems, knowledgeItems } from "./learning";
import { weeklyFinance } from "./finance";
import { readCursor, weeklyPeriod } from "./period";

async function section<T>(read: () => Promise<T>) {
  try {
    return { data: await read(), error: null };
  } catch {
    return { data: null, error: "This section is temporarily unavailable. Please retry." };
  }
}
function snapshot<T>(
  read: (db: import("@/generated/prisma").Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(read, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
export async function weeklyReport(params: URLSearchParams, now = new Date()) {
  const p = weeklyPeriod(params, getAppTimeZone(), now);
  const [work, needsAttention, japanese, knowledge, finance] = await Promise.all([
    section(() =>
      snapshot(async (db) => {
        const [completed, reopened, cancelled] = await Promise.all([
          workHistory(db, p, "completed"),
          workHistory(db, p, "reopened"),
          workHistory(db, p, "cancelled"),
        ]);
        return { completed, reopened, cancelled };
      }),
    ),
    section(() =>
      snapshot(async (db) => {
        const [tasks, projects] = await Promise.all([
          attention(db, p, "attention"),
          attention(db, p, "projects"),
        ]);
        return { tasks, projects };
      }),
    ),
    section(() => snapshot((db) => practiceSummary(db, p))),
    section(() =>
      snapshot(async (db) => {
        const [created, changed] = await Promise.all([
          knowledgeItems(db, p, "created"),
          knowledgeItems(db, p, "changed"),
        ]);
        return { created, changed };
      }),
    ),
    section(() => weeklyFinance(p)),
  ]);
  return {
    period: {
      week: p.week,
      lastDay: p.lastDay,
      currentWeek: p.currentWeek,
      current: p.current,
      timeZone: p.timeZone,
      asOf: p.now.toISOString(),
      start: p.start.toISOString(),
      end: p.end.toISOString(),
      cutoff: p.cutoff.toISOString(),
      currency: p.currency,
      dataset: p.dataset,
    },
    work,
    attention: needsAttention,
    japanese,
    knowledge,
    finance,
  };
}
export type WeeklyReport = Awaited<ReturnType<typeof weeklyReport>>;
export async function weeklyItems(params: URLSearchParams, now = new Date()) {
  const { section, offset, period: p } = readCursor(params, getAppTimeZone(), now);
  const limit = 20;
  if (section === "unmatched") return (await weeklyFinance(p, offset, limit)).unmatched;
  return snapshot(async (db) => {
    if (["completed", "reopened", "cancelled"].includes(section))
      return workHistory(db, p, section as "completed" | "reopened" | "cancelled", offset, limit);
    if (section === "attention" || section === "projects")
      return attention(db, p, section, offset, limit);
    if (section === "vocab" || section === "kanji")
      return practiceItems(db, p, section, offset, limit);
    return knowledgeItems(db, p, section as "created" | "changed", offset, limit);
  });
}
