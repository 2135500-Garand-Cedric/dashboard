import {
  dateInZone,
  shiftDate,
  occurrenceDates,
  seriesTiming,
  nextOccurrenceDates,
} from "./rules.mjs";

export async function generateSeries(db, series, through) {
  if (!series.active) return;
  const end = series.until && series.until < through ? series.until : through;
  if (end <= series.generatedThrough) return;
  const dates = occurrenceDates(
    series.anchor,
    series.frequency,
    shiftDate(series.generatedThrough, 1),
    end,
  );
  const skips = new Set(
    (
      await db.recurrenceSkip.findMany({
        where: { recurrenceId: series.id },
        select: { date: true },
      })
    ).map((row) => row.date),
  );
  const template = series.template;
  if (series.kind === "TASK" && template.data.projectId) {
    const project = await db.workProject.findFirst({
      where: {
        id: template.data.projectId,
        userId: series.userId,
        archivedAt: null,
        status: "ACTIVE",
      },
    });
    // Closing a project pauses generation without losing the repeat rule.
    if (!project) return;
  }
  for (const date of dates) {
    if (skips.has(date)) continue;
    const delegate = series.kind === "TASK" ? db.todo : db.event;
    if (
      await delegate.findUnique({
        where: { recurrenceId_recurrenceDate: { recurrenceId: series.id, recurrenceDate: date } },
      })
    )
      continue;
    const data = {
      ...template.data,
      ...seriesTiming(series, date),
      userId: series.userId,
      recurrenceId: series.id,
      recurrenceDate: date,
    };
    if (series.kind === "TASK") {
      // Stages/contacts can be retired after the series was created.
      if (
        data.stageId &&
        !(await db.workProjectStage.findFirst({
          where: { id: data.stageId, projectId: data.projectId, active: true },
        }))
      )
        data.stageId = null;
      const contacts = await db.workContact.findMany({
        where: { id: { in: template.contacts || [] }, userId: series.userId, active: true },
        select: { id: true },
      });
      if (
        data.requesterId &&
        !(await db.workContact.findFirst({
          where: { id: data.requesterId, userId: series.userId, active: true },
        }))
      )
        data.requesterId = null;
      const row = await db.todo.create({
        data: {
          ...data,
          status: "TODO",
          subtasks: { create: (template.checklist || []).map((title) => ({ title })) },
          affectedPeople: { create: contacts.map(({ id }) => ({ contactId: id })) },
        },
      });
      await db.workActivity.create({
        data: {
          userId: series.userId,
          actorGithubId: "89470930",
          todoId: row.id,
          todoReference: `TASK-${String(row.id).padStart(4, "0")}`,
          action: "RECURRENCE_CREATED",
          changes: { recurrence: { before: null, after: { id: series.id, date } } },
        },
      });
    } else {
      const links = template.links || [];
      const owned = await db.todo.count({
        where: { id: { in: links.map((link) => link.todoId) }, userId: series.userId },
      });
      if (owned !== links.length) continue;
      const row = await db.event.create({
        data: {
          ...data,
          linkedTodoId: links.length === 1 ? links[0].todoId : null,
          taskLinks: { create: links.map((link) => ({ ...link, origin: "EXPLICIT" })) },
        },
      });
      await db.workEventActivity.create({
        data: {
          eventId: row.id,
          sourceEventId: row.id,
          userId: series.userId,
          actorGithubId: "89470930",
          action: "RECURRENCE_CREATED",
          changes: { recurrence: { before: null, after: { id: series.id, date } } },
        },
      });
    }
  }
  await db.recurrenceSeries.update({ where: { id: series.id }, data: { generatedThrough: end } });
}

// Keep enough actual records for four upcoming unfinished occurrences, including
// annual/leap-day schedules and after an occurrence is completed or skipped.
export async function ensureSeriesWindow(db, series, now = new Date(), through = null) {
  if (!series.active) return;
  const today = dateInZone(now, series.timeZone);
  const future =
    series.kind === "TASK"
      ? {
          archivedAt: null,
          status: { notIn: ["DONE", "CANCELLED"] },
          OR: [{ deadlineDate: { gte: today } }, { deadlineAt: { gte: now } }],
        }
      : { completed: false, OR: [{ allDayStart: { gte: today } }, { date: { gte: now } }] };
  const delegate = series.kind === "TASK" ? db.todo : db.event;
  const count = await delegate.count({
    where: { recurrenceId: series.id, userId: series.userId, ...future },
  });
  let target = through || shiftDate(today, series.kind === "TASK" ? 42 : 366);
  if (count < 4) {
    const from = series.generatedThrough >= today ? shiftDate(series.generatedThrough, 1) : today;
    const skips = new Set(
      (
        await db.recurrenceSkip.findMany({
          where: { recurrenceId: series.id },
          select: { date: true },
        })
      ).map((row) => row.date),
    );
    const existing = await delegate.findMany({
      where: { recurrenceId: series.id, recurrenceDate: { gte: from } },
      select: { recurrenceDate: true },
    });
    const represented = new Set([...skips, ...existing.map((row) => row.recurrenceDate)]);
    const next = nextOccurrenceDates(
      series.anchor,
      series.frequency,
      from,
      4 - count + represented.size,
    )
      .filter((date) => !represented.has(date) && (!series.until || date <= series.until))
      .slice(0, 4 - count);
    if (next.length && next.at(-1) > target) target = next.at(-1);
  }
  // Leap-day schedules may need sixteen years to find four dates; generate in
  // bounded windows so the existing ten-year safety limit stays intact.
  while (
    series.generatedThrough < target &&
    (!series.until || series.generatedThrough < series.until)
  ) {
    const end = shiftDate(series.generatedThrough, 3650);
    const before = series.generatedThrough;
    await generateSeries(db, series, end < target ? end : target);
    series = await db.recurrenceSeries.findUnique({ where: { id: series.id } });
    if (series.generatedThrough === before) break; // Paused project.
  }
}

// Same owner lock as ordinary work mutations. The unique keys also guard retries.
export async function ensureOccurrences(db, userId = 1, now = new Date(), through = null) {
  const candidates = await db.recurrenceSeries.findMany({ where: { userId, active: true } });
  for (const candidate of candidates) {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(62019, ${userId}::integer)`;
        const series = await tx.recurrenceSeries.findFirst({ where: { id: candidate.id, userId } });
        if (series) await ensureSeriesWindow(tx, series, now, through);
      },
      { timeout: 30000, maxWait: 15000 },
    );
  }
}
