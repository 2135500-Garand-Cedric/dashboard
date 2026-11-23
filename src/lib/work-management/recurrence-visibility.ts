import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { localToday } from "./date-format";

const NEXT_OCCURRENCES = 4;
// Limit before pagination/counting and before organizational filters, so changing
// a project/filter cannot reveal another four copies of the same series.
export async function recurrenceVisibility(db: Prisma.TransactionClient, now = new Date()) {
  const today = localToday(now, getAppTimeZone());
  const [tasks, events] = await Promise.all([
    db.todo.findMany({
      where: {
        userId: owner,
        recurrenceId: { not: null },
        archivedAt: null,
        status: { notIn: ["DONE", "CANCELLED"] },
        OR: [{ deadlineDate: { gte: today } }, { deadlineAt: { gte: now } }],
      },
      select: { id: true, recurrenceId: true, deadlineDate: true, deadlineAt: true },
    }),
    db.event.findMany({
      where: {
        userId: owner,
        recurrenceId: { not: null },
        completed: false,
        OR: [{ allDayStart: { gte: today } }, { date: { gte: now } }],
      },
      select: { id: true, recurrenceId: true, allDayStart: true, date: true },
    }),
  ]);
  function hidden(rows: { id: number; recurrenceId: number | null; key: string }[]) {
    const counts = new Map<number, number>();
    return rows
      .sort((a, b) => a.key.localeCompare(b.key) || a.id - b.id)
      .filter((row) => {
        const count = (counts.get(row.recurrenceId!) || 0) + 1;
        counts.set(row.recurrenceId!, count);
        return count > NEXT_OCCURRENCES;
      })
      .map((row) => row.id);
  }
  const taskIds = hidden(
    tasks.map((row) => ({
      ...row,
      key: row.deadlineAt?.toISOString() || `${row.deadlineDate}T00:00:00.000Z`,
    })),
  );
  const eventIds = hidden(
    events.map((row) => ({
      ...row,
      key: row.date?.toISOString() || `${row.allDayStart}T00:00:00.000Z`,
    })),
  );
  return {
    task: taskIds.length ? ({ id: { notIn: taskIds } } satisfies Prisma.TodoWhereInput) : {},
    event: eventIds.length ? ({ id: { notIn: eventIds } } satisfies Prisma.EventWhereInput) : {},
  };
}
