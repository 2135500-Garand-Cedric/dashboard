import type { WorkTodo, WorkActivityType } from "./types";
export type InitialTaskReads = Record<string, { data?: unknown; error?: string }>;
export type TaskDetailsResponse = {
  task: WorkTodo;
  activityTypes: WorkActivityType[];
  initial: InitialTaskReads;
};
