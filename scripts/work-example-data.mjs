import { createHash } from "node:crypto";
import { loadWorkServices } from "./helpers/work-services.mjs";
export async function seedWorkExamples(db, now = new Date()) {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.ALLOW_WORK_EXAMPLES !== "1"
  )
    throw new Error("Explicit nonproduction example environment required.");
  const api = loadWorkServices(db),
    zone = api.config.APP_TIME_ZONE,
    month = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(now),
    year = month.find((p) => p.type === "year").value,
    number = month.find((p) => p.type === "month").value,
    period = `${year}-${number}`;
  const key = (name) => {
    const hex = createHash("sha256").update(`work-phase07-v1:${period}:${name}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  };
  const receipt = async (name) =>
    db.workMutationReceipt.findUnique({
      where: { userId_requestKey: { userId: 1, requestKey: key(name) } },
    });
  const completed = await receipt("complete");
  if (completed) return { ...completed.result, reused: true };
  const step = async (name, action) => {
    const old = await receipt(name);
    return old ? old.result : action({ requestKey: key(name) });
  };
  const manifest = {
    period,
    taskIds: [],
    eventIds: [],
    editedEventIds: [],
    convertedEventIds: [],
    contactIds: [],
  };
  const activityTypes = await db.activityType.findMany(),
    activityType = (name) =>
      activityTypes.find((row) => row.name.toLowerCase() === name.toLowerCase() && row.active)
        ?.id ?? null;
  const task = async (name, fields = {}) => {
    const row = await step(`task:${name}`, (command) =>
      api.server.createTodo(
        {
          title: `[Example] ${name}`,
          description: "Synthetic development work-management example. Not a real request.",
          activityTypeId: activityType("Personal"),
          ...fields,
        },
        command,
      ),
    );
    manifest.taskIds.push(row.id);
    return row;
  };
  const patch = async (name, row, body) =>
    step(name, async (command) =>
      api.server.patchTodo(row.id, body, {
        ...command,
        revision: (await api.server.getTodo(row.id)).revision,
      }),
    );
  const dates = async (name, row, body) =>
    step(name, async (command) =>
      api.dates.taskDateCommand(row.id, body, {
        ...command,
        revision: (await api.server.getTodo(row.id)).revision,
      }),
    );
  const d = (day) =>
    `${period}-${String(Math.min(day, new Date(Number(year), Number(number), 0).getDate())).padStart(2, "0")}`;
  const date = (day) => ({ kind: "DATE", date: d(day) }),
    time = (day, hour) => ({ kind: "TIME", local: `${d(day)}T${hour}`, timeZone: zone });
  const event = async (name, body) => {
    const row = await step(`event:${name}`, (command) =>
      api.server.createEvent(
        {
          title: `[Example] ${name}`,
          description: "Synthetic development calendar example.",
          kind: "ORDINARY",

          ...body,
        },
        command,
      ),
    );
    manifest.eventIds.push(row.id);
    return row;
  };
  const link = async (name, a, b, kind) =>
    step(name, async (command) =>
      api.relationships.relationshipCommand(
        a.id,
        { kind, targetId: b.id },
        { ...command, revision: (await api.server.getTodo(a.id)).revision },
      ),
    );
  const createContact = async (name) => {
    const row = await step(`contact:${name}`, (command) =>
      api.server.createWorkContact(
        { name: `[Example] ${name}`, company: "Synthetic requester / vendor" },
        command,
      ),
    );
    manifest.contactIds.push(row.id);
    return row;
  };
  const requester = await createContact("IT requester");
  const programming = await task("Submit programming assignment", {
      activityTypeId: activityType("School"),
      status: "TODO",
    }),
    lab = await task("Submit lab report", {
      activityTypeId: activityType("School"),
      status: "IN_PROGRESS",
    }),
    outline = await task("Submit project outline", {
      activityTypeId: activityType("School"),
    });
  const study = await task("Prepare for midterm", {
    activityTypeId: activityType("School"),
    nextAction: "Review practice questions before the exam.",
  });
  await dates("study:deadline", study, { action: "deadline", date: date(17) });
  const laptop = await task("Prepare an employee laptop", {
    activityTypeId: activityType("Work"),
    requesterId: requester.id,
    status: "TODO",
  });
  await dates("laptop:deadline", laptop, { action: "deadline", date: date(14) });
  const install = await task("Install required applications", {
    activityTypeId: activityType("Work"),
    parentId: laptop.id,
    parentRevision: (await api.server.getTodo(laptop.id)).revision,
  });
  const verify = await task("Verify employee access", {
    activityTypeId: activityType("Work"),
    parentId: laptop.id,
    parentRevision: (await api.server.getTodo(laptop.id)).revision,
  });
  await link("verify:dependency", verify, install, "blocked-by");
  await step("laptop:checklist", async (command) =>
    api.server.createSubtask(
      laptop.id,
      { title: "Check charger and asset label" },
      { ...command, revision: (await api.server.getTodo(laptop.id)).revision },
    ),
  );
  const printer = await task("Follow replacement printer delivery", {
    activityTypeId: activityType("Work"),
    kind: "ISSUE",
    status: "WAITING",
    waitingReason: "Replacement unit is in transit.",
    workaround: "Use the shared printer temporarily.",
  });
  await dates("printer:followup", printer, {
    action: "followup-create",
    date: date(12),
    reason: "Ask the vendor for tracking status.",
  });
  await task("Investigate intermittent backup failure", {
    activityTypeId: activityType("Work"),
    kind: "ISSUE",
    priorityLevel: "URGENT",
    nextAction: "Check the last failed backup log.",
  });
  const fix = await task("Document a resolved network issue", {
    activityTypeId: activityType("Work"),
    kind: "MAINTENANCE",
  });
  await patch("fix:complete", fix, {
    status: "DONE",
    completionSummary: "Synthetic completed example; documentation saved.",
  });
  const weekly = await task("Review weekly personal goals", { status: "IN_PROGRESS" }),
    vocab = await task("Review difficult Japanese words", { status: "TODO" }),
    exchange = await task("Organize a language exchange", { status: "BACKLOG" });
  const cancelled = await task("Replace an unused test device", {
    activityTypeId: activityType("Work"),
  });
  await patch("cancelled:close", cancelled, {
    status: "CANCELLED",
    completionSummary: "Synthetic cancelled example; device no longer needed.",
  });
  await step("printer:note", (command) =>
    api.supporting.createNote(
      printer.id,
      {
        body: "Synthetic progress note: vendor confirmed the replacement order. Next check is a follow-up, not a completion deadline.",
        documentationUrls: [],
      },
      command,
    ),
  );
  const sources = await step("source-plan", (command) =>
    api.server.mutation("work-examples:source-plan", { period }, command, async (tx) => {
      const specs = [
        [3, 16, "Weekly planning", "Personal", null, false],
        [6, 18, "Japanese conversation practice", "JPN2902", null, false],
        [8, 15, "Assignment research", "CSI2101", 10, false],
        [11, 17, "Project outline due", "CSI2101", null, true],
        [13, 20, "Programming assignment due", "CSI2101", null, false],
        [14, 14, "Study group", "JPN2902", null, false],
        [16, 16, "Team project workshop", "JPN2902", 18, false],
        [19, 18, "Vocabulary review", "Personal", null, true],
        [21, 17, "Lab report due", "CSI2101", null, false],
        [23, 18, "Japanese listening practice", "JPN2902", null, false],
        [25, 15, "Final project preparation", "CSI2101", 27, false],
        [28, 18, "Monthly review", "Personal", null, false],
      ];
      const candidates = await tx.event.findMany({
          where: { userId: 1, description: "Sample calendar event for development." },
          include: { taskLinks: true },
        }),
        approved = [];
      for (const [day, hour, title, type, endDay, completed] of specs) {
        const stamp = (day) => `${d(day)}T${String(hour).padStart(2, "0")}:00:00.000Z`;
        const row = candidates.find(
          (row) =>
            row.title === title &&
            row.type === type &&
            row.completed === completed &&
            row.date?.toISOString() === stamp(day) &&
            (row.endDate?.toISOString() ?? null) === (endDay ? stamp(endDay) : null) &&
            row.taskLinks.length === 0,
        );
        if (row) approved.push(row);
      }
      return approved;
    }),
  );
  const placeholders = {
    "Project outline due": [outline, 11],
    "Programming assignment due": [programming, 13],
    "Lab report due": [lab, 21],
  };
  for (const source of sources) {
    if (placeholders[source.title]) {
      const [target, day] = placeholders[source.title];
      await step(`convert:${source.id}`, async (command) => {
        const body = {
            mode: "PLACEHOLDER",
            taskId: target.id,
            changeDeadline: true,
            deadline: date(day),
          },
          preview = await api.calendar.previewConversion(source.id, body);
        return api.calendar.confirmConversion(
          source.id,
          { ...body, previewToken: preview.token },
          { ...command, revision: preview.event.revision },
        );
      });
      manifest.convertedEventIds.push(source.id);
    } else {
      const name = source.title,
        session =
          name === "Weekly planning" || name === "Vocabulary review" || name === "Monthly review",
        target = name === "Vocabulary review" ? vocab : weekly,
        informational = name === "Assignment research" || name === "Final project preparation";
      await step(`edit-source:${source.id}`, async (command) => {
        const current = await api.server.getEvent(source.id);
        const body = {
          description:
            "Synthetic development calendar example, upgraded for work-management distinctions.",
          kind: session ? "WORK_SESSION" : informational ? "INFORMATIONAL" : "ORDINARY",
        };
        if (informational) body.title = `${name} availability`;
        if (session) {
          const start = new Date(source.date),
            end = new Date(start.getTime() + 3600000);
          const { localParts } = api.format;
          body.timing = {
            kind: "TIMED",
            start: { kind: "TIME", local: localParts(start, zone), timeZone: zone },
            end: { kind: "TIME", local: localParts(end, zone), timeZone: zone },
          };
          body.links = [{ todoId: target.id, role: "SESSION_TARGET" }];
        }
        return api.server.patchEvent(source.id, body, { ...command, revision: current.revision });
      });
      manifest.editedEventIds.push(source.id);
    }
  }
  for (const [name, row, day] of [
    ["programming", programming, 13],
    ["lab", lab, 21],
    ["outline", outline, 11],
  ])
    if (!sources.some((source) => placeholders[source.title]?.[0].id === row.id))
      await dates(`${name}:fallback-deadline`, row, { action: "deadline", date: date(day) });
  await patch("outline:done", outline, {
    status: "DONE",
    completionSummary: "Synthetic assignment completed before its deadline.",
  });
  await event("Attend midterm exam", {
    type: "CSI2101",
    timing: { kind: "TIMED", start: time(18, "09:00"), end: time(18, "11:00") },
    links: [{ todoId: study.id, role: "RELATED" }],
  });
  await event("Work on programming assignment", {
    kind: "WORK_SESSION",
    type: "CSI2101",
    timing: { kind: "TIMED", start: time(12, "19:00"), end: time(12, "20:30") },
    links: [{ todoId: programming.id, role: "SESSION_TARGET" }],
  });
  await event("Finish lab report draft", {
    kind: "WORK_SESSION",
    type: "CSI2101",
    timing: { kind: "TIMED", start: time(20, "18:00"), end: time(20, "19:30") },
    links: [{ todoId: lab.id, role: "SESSION_TARGET" }],
  });
  await event("Install laptop applications", {
    kind: "WORK_SESSION",
    timing: { kind: "TIMED", start: time(13, "10:00"), end: time(13, "11:00") },
    links: [
      { todoId: install.id, role: "SESSION_TARGET" },
      { todoId: laptop.id, role: "RELATED" },
    ],
  });
  await event("Employee orientation", {
    timing: { kind: "TIMED", start: time(16, "09:00"), end: time(16, "10:00") },
    links: [{ todoId: laptop.id, role: "RELATED" }],
  });
  const tomorrow = (day) =>
    new Date(Date.parse(`${d(day)}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  await event("Birthday gathering", {
    timing: { kind: "ALL_DAY", startDate: d(22), endExclusive: tomorrow(22) },
  });
  await event("Reading week", {
    kind: "INFORMATIONAL",

    timing: { kind: "ALL_DAY", startDate: d(24), endExclusive: tomorrow(27) },
  });
  await event("Language exchange meetup (time TBD)", {
    timing: { kind: "TBD" },
    links: [{ todoId: exchange.id, role: "RELATED" }],
  });
  const endOfMonth = d(31),
    nextDay = new Date(Date.parse(`${endOfMonth}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  await event("Cross-month project work", {
    kind: "WORK_SESSION",
    timing: {
      kind: "TIMED",
      start: { kind: "TIME", local: `${endOfMonth}T23:00`, timeZone: zone },
      end: { kind: "TIME", local: `${nextDay}T01:00`, timeZone: zone },
    },
    links: [{ todoId: programming.id, role: "SESSION_TARGET" }],
  });
  const result = await step("complete", (command) =>
    api.server.mutation("work-examples:complete", { period }, command, async () => ({
      ...manifest,
      sourceSnapshots: sources,
      reused: false,
    })),
  );
  return result;
}
