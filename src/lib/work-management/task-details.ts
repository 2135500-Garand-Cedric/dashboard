import { workArticles } from "@/lib/knowledge/server";
import { prisma } from "@/lib/prisma";
import { getTodoInDb, listWorkContacts, WORK_USER_ID } from "./server";
import { taskReadSnapshot } from "./read-snapshot";
import { listAttachments, taskTimeline } from "./supporting";
import { readRelationships } from "./relationships";
import { readTaskDates } from "./date-server";
import { readFocus } from "./my-work-server";
import { taskCalendar } from "./calendar-server";

export async function readTaskDetails(id: number) {
  return taskReadSnapshot(prisma, async (db) => {
    // Authorize and load the canonical task once. Section readers reuse this
    // same snapshot and task through the request-local read context.
    const task = await getTodoInDb(db, id);
    const initial: Record<string, { data?: unknown; error?: string }> = {};
    const add = async (url: string, read: Promise<unknown>) => {
      initial[url] = { data: await read };
    };
    const [activityTypes, projects] = await Promise.all([
      db.activityType.findMany({ orderBy: { name: "asc" } }),
      // Picker choices need names and IDs, not progress/count calculations for
      // every project in the application.
      db.workProject.findMany({
        where: { userId: WORK_USER_ID, archivedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      add(
        `/api/knowledge/work?kind=task&id=${id}&page=1`,
        workArticles("task", id, new URLSearchParams(), db),
      ),
      add(`/api/todos/${id}/attachments?page=1`, listAttachments(id, new URLSearchParams())),
      add(`/api/todos/${id}/timeline?filter=notes&page=1`, taskTimeline(id, new URLSearchParams())),
      add(`/api/todos/${id}/dates`, readTaskDates(id, new URLSearchParams())),
      add(
        `/api/todos/${id}/recurrence`,
        task.recurrenceId
          ? db.recurrenceSeries
              .findFirst({ where: { id: task.recurrenceId, userId: WORK_USER_ID } })
              .then((series) => ({ series }))
          : Promise.resolve({ series: null }),
      ),
      add(`/api/todos/${id}/focus`, readFocus(id)),
      add(`/api/todos/${id}/calendar?page=1`, taskCalendar(id, new URLSearchParams())),
      add("/api/work-contacts?q=&page=1", listWorkContacts(new URLSearchParams())),
      ...["children", "blocked-by", "blocks", "related"].map(async (section) => {
        for (let page = 1; ; page++) {
          const result = await readRelationships(
            id,
            new URLSearchParams({ section, page: String(page) }),
          );
          initial[`/api/todos/${id}/relationships?section=${section}&page=${page}`] = {
            data: result,
          };
          if (page * result.pageSize >= result.total) break;
        }
      }),
    ]);
    initial["/api/projects?view=active&page=1"] = {
      data: {
        items: projects,
        total: projects.length,
        page: 1,
        pageSize: Math.max(1, projects.length),
      },
    };
    if (task.projectId) {
      const project = await db.workProject.findFirst({
        where: { id: task.projectId, userId: WORK_USER_ID },
        select: { id: true, name: true, stages: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
      });
      initial[`/api/projects/${task.projectId}`] = project
        ? { data: project }
        : { error: "Project not found." };
    }
    return { task, activityTypes, initial };
  });
}
