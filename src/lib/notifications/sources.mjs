import { GRACE_MS } from "./rules.mjs";

/** @param {import('../../generated/prisma/index.js').PrismaClient} db */
export async function reminderSources(db, userId, now = new Date(), pastMs = GRACE_MS) {
  const start = new Date(now.getTime() - pastMs);
  const end = new Date(now.getTime() + 9 * 86400000);
  // Extra calendar days cover the extreme UTC offsets and DST transitions.
  const dates = {
    gte: new Date(start.getTime() - 2 * 86400000).toISOString().slice(0, 10),
    lte: end.toISOString().slice(0, 10),
  };
  const activeTask = { userId, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] } };
  const [events, tasks, followUps, milestones] = await Promise.all([
    db.event.findMany({
      where: {
        userId,
        completed: false,
        conversions: { none: { active: true, mode: "PLACEHOLDER" } },
        OR: [{ date: { gte: start, lte: end } }, { allDayStart: dates }],
      },
      include: {
        taskLinks: {
          include: { todo: { select: { status: true, archivedAt: true, userId: true } } },
        },
      },
    }),
    db.todo.findMany({
      where: {
        ...activeTask,
        OR: [{ deadlineAt: { gte: start, lte: end } }, { deadlineDate: dates }],
      },
      select: { id: true, title: true, deadlineAt: true, deadlineDate: true },
    }),
    db.workFollowUp.findMany({
      where: {
        status: "ACTIVE",
        todo: activeTask,
        OR: [{ at: { gte: start, lte: end } }, { date: dates }],
      },
      include: { todo: { select: { title: true } } },
    }),
    db.workKeyDate.findMany({
      where: {
        todoId: null,
        removedAt: null,
        completedAt: null,
        project: { userId, archivedAt: null, status: "ACTIVE" },
        OR: [{ at: { gte: start, lte: end } }, { date: dates }],
      },
      select: { id: true, label: true, at: true, date: true, projectId: true },
    }),
  ]);
  return [
    ...events
      .filter(
        (event) =>
          event.kind !== "WORK_SESSION" ||
          event.taskLinks.some(
            (link) =>
              link.role === "SESSION_TARGET" &&
              link.todo.userId === userId &&
              !link.todo.archivedAt &&
              !["DONE", "CANCELLED"].includes(link.todo.status),
          ),
      )
      .map((event) => ({
        kind: "EVENT",
        id: event.id,
        title: event.title,
        label: event.kind === "WORK_SESSION" ? "Work session" : "Event",
        option: event.kind === "WORK_SESSION" ? "sessions" : "events",
        at: event.date,
        date: event.allDayStart,
        minutes: event.reminderMinutes,
        url: `/events/${event.id}`,
      })),
    ...tasks.map((task) => ({
      kind: "DEADLINE",
      id: task.id,
      title: task.title,
      label: "Task deadline",
      option: "deadlines",
      at: task.deadlineAt,
      date: task.deadlineDate,
      url: `/todos/${task.id}`,
    })),
    ...followUps.map((followUp) => ({
      kind: "FOLLOW_UP",
      id: followUp.id,
      title: followUp.todo.title,
      label: "Follow-up",
      option: "followUps",
      at: followUp.at,
      date: followUp.date,
      url: `/todos/${followUp.todoId}`,
    })),
    ...milestones.map((milestone) => ({
      kind: "MILESTONE",
      id: milestone.id,
      title: milestone.label,
      label: "Project milestone",
      option: "milestones",
      at: milestone.at,
      date: milestone.date,
      url: `/projects/${milestone.projectId}`,
    })),
  ];
}

function taskReason(task) {
  if (task.archivedAt) return "TASK_ARCHIVED";
  if (task.status === "DONE") return "TASK_COMPLETED";
  if (task.status === "CANCELLED") return "TASK_CANCELLED";
  return null;
}

// Lookup by identity deliberately has no date window. Older active reminders
// must survive worker downtime and remain resolvable when snoozed.
export async function resolveReminder(db, userId, kind, id) {
  let source, reason;
  if (kind === "EVENT") {
    const event = await db.event.findFirst({
      where: { id, userId },
      include: {
        conversions: { where: { active: true, mode: "PLACEHOLDER" } },
        taskLinks: { include: { todo: true } },
      },
    });
    if (!event) return { reason: "SOURCE_REMOVED" };
    reason = event.completed
      ? "EVENT_COMPLETED"
      : event.conversions.length
        ? "EVENT_CONVERTED"
        : null;
    if (
      !reason &&
      event.kind === "WORK_SESSION" &&
      !event.taskLinks.some(
        (link) =>
          link.role === "SESSION_TARGET" && link.todo.userId === userId && !taskReason(link.todo),
      )
    )
      reason = "SESSION_TARGET_INACTIVE";
    const activity = event.type
      ? await db.activityType.findFirst({ where: { name: event.type } })
      : null;
    source = {
      kind,
      id,
      title: event.title,
      label: event.kind === "WORK_SESSION" ? "Work session" : "Event",
      option: event.kind === "WORK_SESSION" ? "sessions" : "events",
      at: event.date,
      date: event.allDayStart,
      minutes: event.reminderMinutes,
      url: `/events/${id}`,
      color: activity?.color,
    };
  } else if (kind === "DEADLINE") {
    const task = await db.todo.findFirst({
      where: { id, userId },
      include: { activityType: true },
    });
    if (!task) return { reason: "SOURCE_REMOVED" };
    reason = taskReason(task);
    source = {
      kind,
      id,
      title: task.title,
      label: "Task deadline",
      option: "deadlines",
      at: task.deadlineAt,
      date: task.deadlineDate,
      url: `/todos/${id}`,
      color: task.activityType?.color,
    };
  } else if (kind === "FOLLOW_UP") {
    const followUp = await db.workFollowUp.findFirst({
      where: { id, todo: { userId } },
      include: { todo: { include: { activityType: true } } },
    });
    if (!followUp) return { reason: "SOURCE_REMOVED" };
    reason =
      taskReason(followUp.todo) ||
      (followUp.status !== "ACTIVE" ? `FOLLOW_UP_${followUp.status}` : null);
    source = {
      kind,
      id,
      title: followUp.todo.title,
      label: "Follow-up",
      option: "followUps",
      at: followUp.at,
      date: followUp.date,
      url: `/todos/${followUp.todoId}`,
      color: followUp.todo.activityType?.color,
    };
  } else if (kind === "MILESTONE") {
    const milestone = await db.workKeyDate.findFirst({
      where: { id, todoId: null, project: { userId } },
      include: { project: { include: { activityType: true } } },
    });
    if (!milestone) return { reason: "SOURCE_REMOVED" };
    reason = milestone.removedAt
      ? "MILESTONE_REMOVED"
      : milestone.completedAt
        ? "MILESTONE_COMPLETED"
        : milestone.project.archivedAt
          ? "PROJECT_ARCHIVED"
          : milestone.project.status !== "ACTIVE"
            ? "PROJECT_INACTIVE"
            : null;
    source = {
      kind,
      id,
      title: milestone.label,
      label: "Project milestone",
      option: "milestones",
      at: milestone.at,
      date: milestone.date,
      url: `/projects/${milestone.projectId}`,
      color: milestone.project.activityType?.color,
    };
  } else return { reason: "UNKNOWN_SOURCE" };
  if (reason) return { reason, source };
  if (!source.at && !source.date) return { reason: "DATE_REMOVED", source };
  return { source };
}
