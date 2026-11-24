import { PrismaClient } from "../src/generated/prisma/index.js";
import { reminderCandidate } from "../src/lib/notifications/rules.mjs";
import { reminderState } from "../src/lib/notifications/engine.mjs";

if (
  process.env.NODE_ENV !== "development" ||
  process.env.ALLOW_NOTIFICATION_EXAMPLES !== "1" ||
  process.env.PUSH_ENABLED === "true"
) {
  throw new Error("Run only in development with ALLOW_NOTIFICATION_EXAMPLES=1 and push disabled.");
}

const db = new PrismaClient({ log: [] });
const userId = 1;
const requestKey = "2e8b7ccd-3980-4e77-8b35-8742adce2750";
try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(94723, ${userId}::integer)`;
    const previous = await tx.workMutationReceipt.findUnique({
      where: { userId_requestKey: { userId, requestKey } },
    });
    if (previous) return { ...previous.result, alreadyCreated: true };
    const state = await reminderState(tx, userId);
    if (!state) throw new Error("The development owner is missing.");
    for (const category of ["events", "sessions", "deadlines", "followUps"]) {
      if (!state.settings[category]) {
        throw new Error(`Enable ${category} reminders before adding these examples.`);
      }
    }
    const now = new Date();
    const minutes = (offset) => new Date(now.getTime() + offset * 60000);
    const activity = await tx.activityType.findFirst({ where: { active: true } });
    const project = await tx.workProject.create({
      data: {
        userId,
        name: "[Example] Notification inbox previews",
        summary: "Fictional reminders for exploring the inbox. No real appointments or work.",
        activityTypeId: activity?.id,
      },
    });
    const deadline = await tx.todo.create({
      data: {
        userId,
        projectId: project.id,
        activityTypeId: activity?.id,
        title: "[Example] Submit monthly paperwork",
        description: "Sample deadline reminder. This is not a real assignment.",
        deadlineAt: minutes(-5),
        deadlineTimeZone: state.zone,
      },
    });
    const task = await tx.todo.create({
      data: {
        userId,
        projectId: project.id,
        activityTypeId: activity?.id,
        title: "[Example] Follow up with the supplier",
        description: "Fictional task used to preview follow-up and work-session reminders.",
      },
    });
    const followUp = await tx.workFollowUp.create({
      data: { todoId: task.id, at: minutes(-8), timeZone: state.zone, reason: "Example follow-up" },
    });
    async function event(title, offset, fields = {}) {
      return tx.event.create({
        data: {
          userId,
          title: `[Example] ${title}`,
          description: "Fictional event for the notification inbox preview.",
          date: minutes(offset),
          timeZone: state.zone,
          type: activity?.name,
          reminderMinutes: 15,
          ...fields,
        },
      });
    }
    const meeting = await event("Team catch-up", 10);
    const session = await event("Review the backup procedure", 8, {
      kind: "WORK_SESSION",
      endDate: minutes(45),
    });
    await tx.eventTaskLink.create({
      data: { eventId: session.id, todoId: task.id, role: "SESSION_TARGET" },
    });
    const appointment = await event("Book a dentist appointment", -60, { reminderMinutes: 0 });
    const completed = await event("Completed appointment", -120, { completed: true });
    async function notification(source, fields = {}) {
      const candidate = reminderCandidate(source, state.settings, state.zone);
      return tx.userNotification.create({
        data: {
          userId,
          occurrenceKey: candidate.occurrenceKey,
          sourceKind: source.kind,
          sourceId: source.id,
          category: source.option,
          titleSnapshot: source.title,
          labelSnapshot: source.label,
          targetAt: candidate.targetAt,
          dueAt: candidate.sendAt,
          createdAt: now,
          ...fields,
        },
      });
    }
    function eventSource(row, session = false) {
      return {
        kind: "EVENT",
        id: row.id,
        title: row.title,
        at: row.date,
        minutes: row.reminderMinutes,
        option: session ? "sessions" : "events",
        label: session ? "Work session" : "Event",
      };
    }
    const rows = await Promise.all([
      notification(eventSource(meeting)),
      notification({
        kind: "DEADLINE",
        id: deadline.id,
        title: deadline.title,
        at: deadline.deadlineAt,
        option: "deadlines",
        label: "Task deadline",
      }),
      notification({
        kind: "FOLLOW_UP",
        id: followUp.id,
        title: task.title,
        at: followUp.at,
        option: "followUps",
        label: "Follow-up",
      }),
      notification(eventSource(session, true), { readAt: minutes(-1) }),
      notification(eventSource(appointment), {
        snoozedUntil: minutes(180),
        dueAt: minutes(180),
        generation: 1,
        readAt: now,
      }),
      notification(eventSource(completed), {
        lifecycle: "RESOLVED",
        retiredReason: "EVENT_COMPLETED",
        retiredAt: now,
        dismissedAt: now,
        readAt: now,
      }),
    ]);
    const summary = { notifications: rows.length, unread: 3, read: 1, snoozed: 1, history: 1 };
    await tx.workMutationReceipt.create({
      data: {
        userId,
        requestKey,
        fingerprint: "notification-examples-v1",
        operation: "seed:notification-examples",
        result: { ...summary, notificationIds: rows.map((row) => row.id) },
      },
    });
    return summary;
  });
  // Keep output limited to counts; reruns preserve manual edits and dismissals.
  const summary = Object.fromEntries(
    Object.entries(result).filter(([key]) => key !== "notificationIds"),
  );
  console.log(JSON.stringify(summary));
} finally {
  await db.$disconnect();
}
