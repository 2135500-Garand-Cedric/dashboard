"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { useSnackbar } from "@/context/SnackbarContext";
import { useWorkDraftGuard } from "@/components/work/useWorkDraftGuard";
import { useViewState } from "@/context/ViewStateContext";
import ProjectPicker from "@/components/projects/ProjectPicker";
import type { WorkActivityType, WorkTodo } from "@/lib/work-management/types";
import { KIND_LABELS, PRIORITY_LABELS } from "@/lib/work-management/types";

const write = createWorkWriter();
const input = "mt-1 w-full rounded-lg border border-card-border bg-card-bg p-3 text-sm";
function TaskForm() {
  const { showMessage } = useSnackbar();
  const params = useSearchParams(),
    router = useRouter(),
    search = params.toString();
  const initial = useMemo(
    () => ({
      title: "",
      description: "",
      activityType: params.get("activityType") || "",
      project: params.get("project") || "",
      priority: "NORMAL",
      kind: "TASK",
    }),
    [params],
  );
  const [draft, setDraft] = useViewState(`new-task:${search}`, initial);
  const [activityTypes, setActivityTypes] = useState<WorkActivityType[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [catalogError, setCatalogError] = useState("");
  const clean = useRef(false),
    lock = useRef(false);
  const leave = useWorkDraftGuard(
    () => !clean.current && JSON.stringify(draft) !== JSON.stringify(initial),
  );
  const rawReturn = params.get("returnTo") || "/todos";
  const returnTo =
    /^\/(todos|my-work|projects)(?:[/?]|$)/.test(rawReturn) && !rawReturn.includes("\\")
      ? rawReturn
      : "/todos";
  async function loadActivityTypes() {
    setCatalogError("");
    try {
      setActivityTypes(await workRead<WorkActivityType[]>("/api/activity-types"));
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Unable to load activity types.");
    }
  }
  useEffect(() => {
    void loadActivityTypes();
  }, []);
  const field = (key: keyof typeof draft, value: string) =>
    setDraft((old) => ({ ...old, [key]: value }));
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8 pt-12 md:pt-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (leave()) {
            clean.current = true;
            setDraft(initial);
            router.push(returnTo);
          }
        }}
        className="rounded-lg border border-card-border px-4 py-2"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold">New task</h1>
      <form
        aria-label="New task"
        className="space-y-4 rounded-xl border border-card-border bg-card-bg p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            const row = await write<WorkTodo>("/api/todos", "POST", {
              title: draft.title,
              description: draft.description || null,
              ...(draft.activityType
                ? {
                    activityTypeId:
                      draft.activityType === "none" ? null : Number(draft.activityType),
                  }
                : {}),
              projectId: draft.project && draft.project !== "none" ? Number(draft.project) : null,
              ...(params.get("stage") && draft.project === params.get("project")
                ? { stageId: Number(params.get("stage")) }
                : {}),
              priorityLevel: draft.priority,
              kind: draft.kind,
            });
            clean.current = true;
            setDraft(initial);
            showMessage(`${row.reference} created.`);
            router.push(returnTo);
          } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to create task.");
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm">
          Title
          <input
            required
            maxLength={500}
            value={draft.title}
            disabled={busy}
            onChange={(event) => field("title", event.target.value)}
            className={input}
          />
        </label>
        <label className="block text-sm">
          Description
          <textarea
            rows={5}
            maxLength={20000}
            value={draft.description}
            disabled={busy}
            onChange={(event) => field("description", event.target.value)}
            className={input}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Activity type
            <select
              aria-label="Task activity type"
              value={draft.activityType || ""}
              disabled={busy}
              onChange={(event) => field("activityType", event.target.value)}
              className={input}
            >
              <option value="">
                {draft.project && draft.project !== "none"
                  ? "Use project activity type"
                  : "No activity type"}
              </option>
              {draft.project && draft.project !== "none" && (
                <option value="none">No activity type</option>
              )}
              {activityTypes
                .filter((row) => row.active || String(row.id) === draft.activityType)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {!row.active ? " (inactive)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <ProjectPicker
            label="Project"
            value={draft.project}
            onChange={(value) => field("project", value)}
          />
          <label className="text-sm">
            Priority
            <select
              value={draft.priority}
              disabled={busy}
              onChange={(event) => field("priority", event.target.value)}
              className={input}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Type
            <select
              value={draft.kind}
              disabled={busy}
              onChange={(event) => field("kind", event.target.value)}
              className={input}
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {catalogError && (
          <p role="alert" className="text-rose-500">
            {catalogError}{" "}
            <button type="button" onClick={() => void loadActivityTypes()}>
              Retry activity types
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="text-rose-500">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            disabled={busy || !draft.title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create task"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (leave()) {
                clean.current = true;
                setDraft(initial);
                router.push(returnTo);
              }
            }}
            className="rounded-lg border border-card-border px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
export default function NewTaskPage() {
  return (
    <Suspense fallback={<p role="status">Loading task form…</p>}>
      <TaskForm />
    </Suspense>
  );
}
