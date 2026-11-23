"use client";
import type {
  InitialTaskReads,
  TaskDetailsResponse,
} from "@/lib/work-management/task-details-types";
import TaskInitialLoad from "./TaskInitialLoad";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import {
  isClosed,
  STATUS_LABELS,
  PRIORITY_LABELS,
  WORK_STATUSES,
  WORK_PRIORITIES,
  WORK_KINDS,
  KIND_LABELS,
  taskReference,
  type ChecklistItem,
  type WorkContact,
  type WorkActivityType,
  type WorkStatus,
  type WorkTodo,
  type SupportEditorHandle,
  type SupportEditorState,
} from "@/lib/work-management/types";
import TaskFoundationFields, {
  foundationDraft,
  foundationPayload,
  type TaskFoundationDraft,
} from "@/components/todos/TaskFoundationFields";
import TaskClosureDialog from "@/components/todos/TaskClosureDialog";
import TaskProject from "@/components/projects/TaskProject";
import FocusControl from "./FocusControl";
import TaskCalendar from "./TaskCalendar";
import RecurrenceControl from "@/components/recurrence/RecurrenceControl";
import TaskDates from "./TaskDates";
import TaskRelationships from "./TaskRelationships";
import TaskTimeline from "./TaskTimeline";
import TaskAttachments from "./TaskAttachments";
import ContactPicker from "./ContactPicker";
import { useWorkDraftGuard } from "./useWorkDraftGuard";
const inputClass =
  "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2";
const buttonClass =
  "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
type People = { requester: WorkContact[]; affected: WorkContact[] };
const peopleOf = (task: WorkTodo): People => ({
  requester: task.requester ? [task.requester] : [],
  affected: task.affectedPeople ?? [],
});
const personPayload = (people: People) => ({
  requesterId: people.requester[0]?.id ?? null,
  affectedContactIds: people.affected.map((person) => person.id),
});
type TaskDraft = {
  base: WorkTodo;
  title: string;
  description: string;
  summary: string;
  draft: TaskFoundationDraft;
  people: People;
  newStep: string;
  stepDrafts: Record<number, string>;
};
// Browser-memory only: no localStorage, database draft writes or fake history.
const taskDrafts = new Map<number, TaskDraft>();
const time = (value?: string | null, timeZone = "UTC") =>
  value ? new Date(value).toLocaleString("en-CA", { timeZone }) : "Not recorded";

export default function TaskDetails({
  todoId,
  panel = false,
  returnTo = "/todos",
  onClose,
  onChanged,
}: {
  todoId: number;
  panel?: boolean;
  returnTo?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [initialReads, setInitialReads] = useState<InitialTaskReads>();
  const initialRequest = useRef<{ id: number; promise: Promise<TaskDetailsResponse> } | null>(null);
  const initialized = useRef<number | null>(null);
  const [todo, setTodo] = useState<WorkTodo | null>(null),
    [activityTypes, setActivityTypes] = useState<WorkActivityType[]>([]),
    [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [summary, setSummary] = useState("");
  const [draft, setDraft] = useState<TaskFoundationDraft | null>(null),
    [people, setPeople] = useState<People>({ requester: [], affected: [] });
  const [newStep, setNewStep] = useState(""),
    [stepDrafts, setStepDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [closure, setClosure] = useState<"IN_PROGRESS" | "DONE" | "CANCELLED" | null>(null);
  const notes = useRef<SupportEditorHandle>(null),
    files = useRef<SupportEditorHandle>(null),
    relationships = useRef<SupportEditorHandle>(null),
    dates = useRef<SupportEditorHandle>(null),
    membership = useRef<SupportEditorHandle>(null),
    schedule = useRef<SupportEditorHandle>(null);
  const [notesState, setNotesState] = useState<SupportEditorState>({ dirty: false, busy: false }),
    [filesState, setFilesState] = useState<SupportEditorState>({ dirty: false, busy: false });
  const [relationshipState, setRelationshipState] = useState<SupportEditorState>({
    dirty: false,
    busy: false,
  });
  const [datesState, setDatesState] = useState<SupportEditorState>({ dirty: false, busy: false });
  const [membershipState, setMembershipState] = useState<SupportEditorState>({
    dirty: false,
    busy: false,
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [calendarState, setCalendarState] = useState<SupportEditorState>({
    dirty: false,
    busy: false,
  });
  const peopleDirty =
    !!todo &&
    JSON.stringify(personPayload(people)) !== JSON.stringify(personPayload(peopleOf(todo)));
  const supportingBusy =
    calendarState.busy ||
    membershipState.busy ||
    datesState.busy ||
    relationshipState.busy ||
    notesState.busy ||
    filesState.busy;
  const recordAdded = useCallback(
    () =>
      setTodo((previous) =>
        previous
          ? { ...previous, supportingRecordCount: Math.max(1, previous.supportingRecordCount ?? 0) }
          : previous,
      ),
    [],
  );
  const write = useRef(createWorkWriter()),
    lock = useRef(false),
    current = useRef(todoId),
    generation = useRef(0),
    retryAction = useRef<(() => Promise<void>) | null>(null);
  current.current = todoId;
  const dirty =
    !!todo &&
    todo.id === todoId &&
    ((editing &&
      (title !== todo.title ||
        description !== (todo.description ?? "") ||
        summary !== (todo.completionSummary ?? "") ||
        JSON.stringify(draft) !== JSON.stringify(foundationDraft(todo)))) ||
      peopleDirty ||
      !!newStep ||
      Object.keys(stepDrafts).length > 0);
  const liveDraft = useRef<TaskDraft | null>(null),
    discarded = useRef(false);
  liveDraft.current =
    dirty && todo && draft && !discarded.current
      ? { base: todo, title, description, summary, draft, people, newStep, stepDrafts }
      : null;
  const forgetDraft = useCallback(() => {
    discarded.current = true;
    liveDraft.current = null;
    taskDrafts.delete(todoId);
  }, [todoId]);
  const confirmLeave = useWorkDraftGuard(
    () =>
      dirty ||
      !!membership.current?.isDirty() ||
      !!notes.current?.isDirty() ||
      !!files.current?.isDirty() ||
      !!relationships.current?.isDirty() ||
      !!dates.current?.isDirty() ||
      !!schedule.current?.isDirty(),
    () => {
      forgetDraft();
      notes.current?.discard();
      files.current?.discard();
      relationships.current?.discard();
      dates.current?.discard();
      membership.current?.discard();
      schedule.current?.discard();
    },
  );
  useEffect(
    () => () => {
      if (liveDraft.current) taskDrafts.set(todoId, liveDraft.current);
    },
    [todoId],
  );
  const adopt = useCallback((task: WorkTodo) => {
    setTodo((previous) => ({
      ...task,
      dependents: task.dependents ?? previous?.dependents,
      dependentCount: task.dependentCount ?? previous?.dependentCount,
      supportingRecordCount: task.supportingRecordCount ?? previous?.supportingRecordCount,
    }));
    setTitle(task.title);
    setDescription(task.description ?? "");
    setSummary(task.completionSummary ?? "");
    setDraft(foundationDraft(task));
    setPeople(peopleOf(task));
    setNewStep("");
    setStepDrafts({});
  }, []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoadError("");
    let task: WorkTodo, catalog: WorkActivityType[];
    if (initialized.current !== todoId) {
      if (initialRequest.current?.id !== todoId) {
        const promise = workRead<TaskDetailsResponse>(`/api/todos/${todoId}/details`);
        initialRequest.current = { id: todoId, promise };
        void promise.catch(() => {
          if (initialRequest.current?.promise === promise) initialRequest.current = null;
        });
      }
      const result = await initialRequest.current.promise;
      task = result.task;
      catalog = result.activityTypes;
      if (current.current === todoId && generation.current === version) {
        setInitialReads(result.initial);
        initialized.current = todoId;
      }
    } else {
      [task, catalog] = await Promise.all([
        workRead<WorkTodo>(`/api/todos/${todoId}`),
        workRead<WorkActivityType[]>("/api/activity-types"),
      ]);
    }
    if (current.current !== todoId || generation.current !== version) return;
    const saved = taskDrafts.get(todoId);
    if (saved) {
      adopt(saved.base);
      setTitle(saved.title);
      setDescription(saved.description);
      setSummary(saved.summary);
      setDraft(saved.draft);
      setPeople(saved.people);
      setNewStep(saved.newStep);
      setStepDrafts(saved.stepDrafts);
      setEditing(true);
      discarded.current = false;
      setNotice("Unsaved draft restored. Save to apply it, or discard edits.");
    } else {
      adopt(task);
      setEditing(false);
    }
    setActivityTypes(catalog);
    setError("");
  }, [todoId, adopt]);
  useEffect(() => {
    void load().catch((error) => {
      if (current.current === todoId)
        setLoadError(error instanceof Error ? error.message : "Unable to load task.");
    });
  }, [load, todoId]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    retryAction.current = action;
    try {
      await action();
      retryAction.current = null;
    } catch (error) {
      if (current.current === todoId)
        setError(error instanceof Error ? error.message : "Unable to save this change.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (
      !busy &&
      !notes.current?.isBusy() &&
      !files.current?.isBusy() &&
      !relationships.current?.isBusy() &&
      !dates.current?.isBusy() &&
      !membership.current?.isBusy() &&
      !schedule.current?.isBusy() &&
      confirmLeave()
    )
      onClose();
  }
  if (!todo || todo.id !== todoId || !draft)
    return (
      <div className="p-5">
        <button type="button" data-close-task onClick={close} className={buttonClass}>
          {panel ? "Close details" : "Back to All Work"}
        </button>
        {loadError ? (
          <p role="alert" className="mt-4 text-rose-500">
            {loadError}{" "}
            <button
              type="button"
              onClick={() =>
                void load().catch((error) =>
                  setLoadError(error instanceof Error ? error.message : "Unable to load task."),
                )
              }
              className="underline"
            >
              Retry
            </button>
          </p>
        ) : (
          <p role="status" className="mt-4">
            Loading task…
          </p>
        )}
      </div>
    );
  async function patch(body: Record<string, unknown>, revision = todo!.revision) {
    const updated = await write.current<WorkTodo>(`/api/todos/${todoId}`, "PATCH", body, revision);
    if (current.current !== todoId) return;
    adopt(updated);
    onChanged?.();
  }
  async function save() {
    if (Object.keys(stepDrafts).length || newStep.trim())
      throw new Error("Save or discard the pending checklist changes before saving the task.");
    await patch({
      title,
      ...(description !== (todo!.description ?? "") ? { description } : {}),
      ...foundationPayload(draft!),
      ...personPayload(people),
      ...(isClosed(todo!.status) ? { completionSummary: summary || null } : {}),
    });
    forgetDraft();
    setEditing(false);
    setNotice("Task saved.");
  }
  async function stepChange(step: ChecklistItem, body: Record<string, unknown>, remove = false) {
    const result = await write.current<ChecklistItem>(
      `/api/todos/subtasks/${step.id}`,
      remove ? "DELETE" : "PATCH",
      remove ? undefined : body,
      step.revision,
    );
    if (current.current !== todoId) return;
    setTodo((previous) =>
      previous
        ? {
            ...previous,
            revision: previous.revision + 1,
            subtasks: remove
              ? previous.subtasks?.filter((item) => item.id !== step.id)
              : previous.subtasks?.map((item) => (item.id === step.id ? result : item)),
          }
        : previous,
    );
    setStepDrafts((previous) => {
      const next = { ...previous };
      delete next[step.id];
      return next;
    });
    onChanged?.();
  }
  return (
    <TaskInitialLoad
      key={todoId}
      initial={initialReads}
      fallback={
        <div className="p-5">
          <button type="button" data-close-task onClick={close} className={buttonClass}>
            {panel ? "Close details" : "Back to All Work"}
          </button>
          <p role="status" className="mt-4">
            Loading task…
          </p>
        </div>
      }
    >
      <article
        data-work-dirty={dirty}
        className="task-details mx-auto min-w-0 max-w-[1500px] p-4 sm:p-6"
      >
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || supportingBusy}
              data-close-task
              onClick={close}
              className={buttonClass}
            >
              {panel ? "Close details" : "← All Work"}
            </button>
            <button
              type="button"
              disabled={busy || supportingBusy}
              onClick={() => {
                if (confirmLeave()) {
                  taskDrafts.delete(todoId);
                  void perform(load);
                }
              }}
              className={buttonClass}
            >
              Reload task
            </button>
            <button
              type="button"
              disabled={
                busy ||
                editing ||
                supportingBusy ||
                dirty ||
                datesState.dirty ||
                membershipState.dirty ||
                relationshipState.dirty ||
                !!todo.archivedAt
              }
              onClick={() => setScheduleOpen(true)}
              className={`${buttonClass} bg-blue-600 text-white`}
            >
              Schedule work session
            </button>
            <FocusControl
              compact
              id={todoId}
              revision={todo.revision}
              disabled={
                busy ||
                editing ||
                supportingBusy ||
                dirty ||
                relationshipState.dirty ||
                datesState.dirty ||
                membershipState.dirty ||
                calendarState.dirty
              }
              onToggle={(date, active) =>
                void perform(async () => {
                  const task = await write.current<WorkTodo>(
                    `/api/todos/${todoId}/focus`,
                    "POST",
                    { date, active },
                    todo.revision,
                  );
                  adopt(task);
                  onChanged?.();
                })
              }
            />
            <button
              type="button"
              disabled={
                busy ||
                supportingBusy ||
                editing ||
                dirty ||
                peopleDirty ||
                relationshipState.dirty ||
                datesState.dirty ||
                membershipState.dirty ||
                calendarState.dirty
              }
              onClick={() => void perform(() => patch({ archived: !todo.archivedAt }))}
              className={`${buttonClass} border-amber-500/40`}
            >
              {todo.archivedAt ? "Restore task" : "Archive task"}
            </button>
            {panel && (
              <Link
                href={`/todos/${todoId}?returnTo=${encodeURIComponent(returnTo)}`}
                className={buttonClass}
              >
                Open full page
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void perform(save)}
                  className={`${buttonClass} bg-blue-600 text-white`}
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirmLeave()) {
                      adopt(todo);
                      setEditing(false);
                      setError("");
                    }
                  }}
                  className={buttonClass}
                >
                  Discard edits
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={
                  busy ||
                  supportingBusy ||
                  relationshipState.dirty ||
                  datesState.dirty ||
                  membershipState.dirty ||
                  calendarState.dirty ||
                  peopleDirty ||
                  !!todo.archivedAt
                }
                onClick={() => {
                  discarded.current = false;
                  setEditing(true);
                }}
                className={buttonClass}
              >
                Edit
              </button>
            )}
          </div>
        </header>
        <p className="mb-2 text-sm text-gray-500">
          {todo.reference ?? taskReference(todo.id)}
          {todo.archivedAt ? " · Archived" : ""}
        </p>
        {editing ? (
          <label className="block text-sm">
            Task title
            <input
              aria-label="Task title"
              required
              maxLength={500}
              disabled={busy}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={`${inputClass} mt-1 text-xl font-semibold`}
            />
          </label>
        ) : (
          <h1
            id={`task-title-${todoId}`}
            className="break-words text-3xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]"
          >
            {todo.title}
          </h1>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-3 py-1 font-semibold ${todo.status === "DONE" ? "bg-emerald-500/15 text-emerald-500" : todo.status === "WAITING" ? "bg-amber-500/15 text-amber-500" : "bg-blue-500/10 text-blue-400"}`}
          >
            {STATUS_LABELS[todo.status]}
          </span>
          {editing ? (
            <>
              <select
                aria-label="Priority"
                value={draft.priorityLevel ?? ""}
                disabled={busy}
                className="rounded-lg border border-card-border bg-card-bg p-2"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    priorityLevel: event.target.value as TaskFoundationDraft["priorityLevel"],
                  })
                }
              >
                {!draft.priorityLevel && <option value="">Unmapped priority</option>}
                {WORK_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABELS[value]} priority
                  </option>
                ))}
              </select>
              <select
                aria-label="Activity type"
                value={draft.activityTypeId ?? ""}
                disabled={busy}
                className="rounded-lg border border-card-border bg-card-bg p-2"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    activityTypeId: event.target.value ? Number(event.target.value) : null,
                  })
                }
              >
                <option value="">Unclassified</option>
                {activityTypes
                  .filter((type) => type.active || type.id === draft.activityTypeId)
                  .map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                      {!type.active ? " (inactive)" : ""}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Kind"
                value={draft.kind ?? ""}
                disabled={busy}
                className="rounded-lg border border-card-border bg-card-bg p-2"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: (event.target.value as TaskFoundationDraft["kind"]) || null,
                  })
                }
              >
                <option value="">Not recorded</option>
                {WORK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              {todo.priorityLevel && (
                <span
                  className={`rounded-full px-3 py-1 ${todo.priorityLevel === "URGENT" ? "bg-rose-500/15 font-semibold text-rose-500" : "border border-card-border"}`}
                >
                  {PRIORITY_LABELS[todo.priorityLevel]} priority
                </span>
              )}
              {todo.kind && (
                <span className="rounded-full border border-card-border px-3 py-1">
                  {KIND_LABELS[todo.kind]}
                </span>
              )}
              {todo.activityType && (
                <span className="inline-flex items-center gap-2 rounded-full border border-card-border px-3 py-1">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: todo.activityType.color }}
                  />
                  {todo.activityType.name}
                </span>
              )}
            </>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="my-4 rounded-lg border border-rose-500/30 p-3 text-sm text-rose-500"
          >
            {error}
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                className="underline"
                onClick={() => {
                  if (retryAction.current) void perform(retryAction.current);
                }}
              >
                Retry failed change
              </button>
              <button
                type="button"
                disabled={busy}
                className="underline"
                onClick={() => {
                  if (confirmLeave()) void perform(load);
                }}
              >
                Reload record
              </button>
            </div>
          </div>
        )}
        {notice && (
          <p role="status" className="my-3 text-sm text-emerald-500">
            {notice}
          </p>
        )}
        <RecurrenceControl
          kind="TASK"
          id={todo.id}
          revision={todo.revision}
          date={todo.deadlineDate || todo.deadlineAt}
          disabled={busy || supportingBusy || editing || !!todo.archivedAt}
          onChanged={() => {
            void perform(load);
            onChanged?.();
          }}
        />
        <TaskDates
          ref={dates}
          task={todo}
          disabled={
            busy ||
            editing ||
            relationshipState.busy ||
            relationshipState.dirty ||
            membershipState.busy ||
            membershipState.dirty ||
            calendarState.dirty ||
            peopleDirty ||
            !!todo.archivedAt
          }
          onStateChange={setDatesState}
          onChanged={(task) => {
            adopt(task);
            onChanged?.();
          }}
        />
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
          <div className="min-w-0 space-y-6">
            <section
              id="task-description"
              className="scroll-mt-6 rounded-xl border border-card-border bg-card-bg p-5"
            >
              <h2 className="mb-3 text-lg font-semibold">Description</h2>
              {editing ? (
                <textarea
                  aria-label="Description"
                  maxLength={50000}
                  rows={5}
                  disabled={busy}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className={inputClass}
                />
              ) : (
                <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                  {todo.description || "No description"}
                </p>
              )}
            </section>
            <TaskAttachments
              ref={files}
              id={todoId}
              onStateChange={setFilesState}
              onRecordsChanged={recordAdded}
            />
            <TaskTimeline
              ref={notes}
              id={todoId}
              revision={todo.revision}
              currentStatus={todo.status}
              onStateChange={setNotesState}
              onTaskChanged={(task) => {
                setTodo(task);
                onChanged?.();
              }}
              onRecordsChanged={recordAdded}
            />
            {(editing ||
              [
                todo.desiredOutcome,
                todo.nextAction,
                todo.waitingOn,
                todo.waitingReason,
                todo.workaround,
              ].some(Boolean)) && (
              <TaskFoundationFields
                section="main"
                task={todo}
                draft={draft}
                onChange={setDraft}
                activityTypes={activityTypes}
                editing={editing}
                disabled={busy}
              />
            )}
            {isClosed(todo.status) && (
              <section
                aria-label="Closure information"
                className="rounded-lg border border-card-border p-3 text-sm"
              >
                <h2 className="font-semibold">Completion outcome</h2>
                <p className="mt-2">
                  {todo.status === "DONE" ? "Completed" : "Cancelled"}:{" "}
                  {time(
                    todo.status === "DONE" ? todo.completedAt : todo.cancelledAt,
                    todo.timeZone,
                  )}
                </p>
                {todo.closureType === "ACCEPTED_WORKAROUND" && (
                  <p className="mt-2 text-amber-500">
                    Closed with an explicitly accepted workaround
                  </p>
                )}
                {editing ? (
                  <label className="mt-2 block">
                    Completion summary
                    <textarea
                      aria-label="Completion summary"
                      value={summary}
                      disabled={busy}
                      onChange={(event) => setSummary(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                ) : (
                  todo.completionSummary && (
                    <p className="mt-2 whitespace-pre-wrap break-words">{todo.completionSummary}</p>
                  )
                )}
              </section>
            )}
            <section aria-label="Checklist" className="rounded-xl border border-card-border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Checklist</h2>
                <span className="text-xs text-gray-500">
                  {todo.subtasks?.filter((step) => step.done).length ?? 0}/
                  {todo.subtasks?.length ?? 0} completed
                </span>
              </div>
              <ul className="space-y-3">
                {todo.subtasks?.map((step) => (
                  <li key={step.id} className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Complete checklist: ${step.title}`}
                      checked={step.done}
                      disabled={
                        busy ||
                        editing ||
                        supportingBusy ||
                        relationshipState.dirty ||
                        datesState.dirty ||
                        membershipState.dirty ||
                        calendarState.dirty ||
                        peopleDirty ||
                        !!todo.archivedAt
                      }
                      onChange={(event) =>
                        void perform(() => stepChange(step, { done: event.target.checked }))
                      }
                    />
                    {editing ? (
                      <>
                        <input
                          aria-label={`Checklist item title: ${step.title}`}
                          value={stepDrafts[step.id] ?? step.title}
                          disabled={busy}
                          onChange={(event) =>
                            setStepDrafts((previous) => {
                              const next = { ...previous };
                              if (event.target.value === step.title) delete next[step.id];
                              else next[step.id] = event.target.value;
                              return next;
                            })
                          }
                          onBlur={(event) => {
                            if (event.target.value !== step.title)
                              void perform(() => stepChange(step, { title: event.target.value }));
                          }}
                          className="min-w-0 flex-1 rounded border bg-card-bg p-2"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Delete checklist: ${step.title}`}
                          onClick={() => void perform(() => stepChange(step, {}, true))}
                          className={`${buttonClass} text-rose-500`}
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <span
                        className={`min-w-0 break-words text-sm ${step.done ? "line-through text-gray-500" : ""}`}
                      >
                        {step.title}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {!todo.subtasks?.length && (
                <p className="text-sm text-gray-500">No checklist items.</p>
              )}
              {editing && (
                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="New checklist item"
                    placeholder="New checklist item"
                    maxLength={500}
                    disabled={busy}
                    value={newStep}
                    onChange={(event) => setNewStep(event.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    disabled={busy || !newStep.trim()}
                    onClick={() =>
                      void perform(async () => {
                        const step = await write.current<ChecklistItem>(
                          `/api/todos/${todoId}/subtasks`,
                          "POST",
                          { title: newStep },
                          todo.revision,
                        );
                        if (current.current !== todoId) return;
                        setTodo((previous) =>
                          previous
                            ? {
                                ...previous,
                                revision: previous.revision + 1,
                                subtasks: [...(previous.subtasks ?? []), step],
                              }
                            : previous,
                        );
                        setNewStep("");
                        onChanged?.();
                      })
                    }
                    className={buttonClass}
                  >
                    Add step
                  </button>
                </div>
              )}
            </section>
            <TaskRelationships
              ref={relationships}
              task={todo}
              activityTypes={activityTypes}
              disabled={
                busy ||
                editing ||
                datesState.busy ||
                datesState.dirty ||
                membershipState.dirty ||
                calendarState.dirty ||
                peopleDirty ||
                !!todo.archivedAt
              }
              onStateChange={setRelationshipState}
              onChanged={(task) => {
                adopt(task);
                onChanged?.();
              }}
            />
            <TaskCalendar
              ref={schedule}
              open={scheduleOpen}
              onOpen={() => setScheduleOpen(true)}
              onClose={() => setScheduleOpen(false)}
              id={todoId}
              revision={todo.revision}
              title={todo.title}
              archived={!!todo.archivedAt}
              disabled={
                busy ||
                editing ||
                dirty ||
                notesState.busy ||
                filesState.busy ||
                relationshipState.busy ||
                relationshipState.dirty ||
                membershipState.busy ||
                membershipState.dirty ||
                datesState.busy ||
                datesState.dirty
              }
              onStateChange={setCalendarState}
              onScheduled={async () => {
                await load();
                onChanged?.();
              }}
            />
          </div>
          <aside className="min-w-0 space-y-5 self-start rounded-xl border border-card-border bg-card-bg p-4 lg:sticky lg:top-5">
            <section className="space-y-3">
              <label className="block text-sm">
                Status
                <select
                  aria-label="Task status"
                  value={todo.status}
                  disabled={
                    busy ||
                    editing ||
                    supportingBusy ||
                    relationshipState.dirty ||
                    datesState.dirty ||
                    membershipState.dirty ||
                    calendarState.dirty ||
                    peopleDirty ||
                    !!todo.archivedAt ||
                    isClosed(todo.status)
                  }
                  onChange={(event) => {
                    const status = event.target.value as WorkStatus;
                    if (isClosed(status) || status === "IN_PROGRESS") {
                      setError("");
                      setClosure(status as "IN_PROGRESS" | "DONE" | "CANCELLED");
                    } else void perform(() => patch({ status }));
                  }}
                  className={`${inputClass} mt-1`}
                >
                  {WORK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {isClosed(todo.status) && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      editing ||
                      supportingBusy ||
                      relationshipState.dirty ||
                      datesState.dirty ||
                      membershipState.dirty ||
                      calendarState.dirty ||
                      peopleDirty
                    }
                    onClick={() => void perform(() => patch({ status: "TODO" }))}
                    className={buttonClass}
                  >
                    Reopen task
                  </button>
                )}
              </div>
            </section>
            <section aria-label="Task people" className="space-y-3">
              <h2 className="font-semibold">People</h2>
              <ContactPicker
                label="Requester"
                value={people.requester}
                disabled={
                  busy ||
                  editing ||
                  supportingBusy ||
                  !!todo.archivedAt ||
                  relationshipState.dirty ||
                  membershipState.dirty ||
                  datesState.dirty ||
                  calendarState.dirty
                }
                onChange={(requester) => setPeople((old) => ({ ...old, requester }))}
              />
              <ContactPicker
                label="Affected people"
                multiple
                value={people.affected}
                disabled={
                  busy ||
                  editing ||
                  supportingBusy ||
                  !!todo.archivedAt ||
                  relationshipState.dirty ||
                  membershipState.dirty ||
                  datesState.dirty ||
                  calendarState.dirty
                }
                onChange={(affected) => setPeople((old) => ({ ...old, affected }))}
              />
              {peopleDirty && !editing && (
                <button
                  type="button"
                  className={`${buttonClass} bg-blue-600 text-white`}
                  disabled={
                    busy ||
                    supportingBusy ||
                    !!newStep ||
                    Object.keys(stepDrafts).length > 0 ||
                    relationshipState.dirty ||
                    membershipState.dirty ||
                    datesState.dirty ||
                    calendarState.dirty
                  }
                  onClick={() =>
                    void perform(async () => {
                      await patch(personPayload(people));
                      setNotice("People saved.");
                    })
                  }
                >
                  Save people
                </button>
              )}
            </section>
            <TaskProject
              ref={membership}
              task={todo}
              disabled={
                busy ||
                editing ||
                supportingBusy ||
                relationshipState.dirty ||
                datesState.dirty ||
                peopleDirty ||
                calendarState.dirty ||
                !!newStep ||
                Object.keys(stepDrafts).length > 0 ||
                !!todo.archivedAt
              }
              onStateChange={setMembershipState}
              onChanged={(task) => {
                adopt(task);
                onChanged?.();
              }}
            />
            <details
              open={editing || undefined}
              className="task-secondary-section border-t border-card-border pt-3"
            >
              <summary className="cursor-pointer font-medium">Record details</summary>
              <div className="space-y-3 mb-4">
                {([["system", "System"]] as const)
                  .filter(([key]) => editing || !!todo[key])
                  .map(([key, label]) => (
                    <label key={key} className="block text-sm">
                      {label}
                      {editing ? (
                        <input
                          aria-label={label}
                          maxLength={120}
                          disabled={busy}
                          value={draft[key]}
                          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                          className={inputClass}
                        />
                      ) : (
                        <p className="mt-1">{todo[key]}</p>
                      )}
                    </label>
                  ))}
              </div>
              <dl className="space-y-2 border-t border-card-border pt-3 text-xs text-gray-500">
                <div>
                  <dt>Created</dt>
                  <dd>{time(todo.createdAt, todo.timeZone)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{time(todo.updatedAt, todo.timeZone)}</dd>
                </div>
                {todo.archivedAt && (
                  <div>
                    <dt>Archived</dt>
                    <dd>{time(todo.archivedAt, todo.timeZone)}</dd>
                  </div>
                )}
              </dl>
              {!!todo.supportingRecordCount && (
                <p className="text-xs text-gray-500">
                  This task has retained history; completing or cancelling it keeps that history.
                </p>
              )}
              {!editing && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    supportingBusy ||
                    !!todo.dependentCount ||
                    !!todo.supportingRecordCount ||
                    !!todo.parentId ||
                    !!todo.childCount ||
                    !!todo.dependencyCount ||
                    !!todo.relatedCount
                  }
                  onClick={() => {
                    if (
                      confirmLeave() &&
                      window.confirm(
                        "Delete this task and its checklist? Linked calendar events and recorded history will be kept.",
                      )
                    )
                      void perform(async () => {
                        await write.current(
                          `/api/todos/${todoId}`,
                          "DELETE",
                          undefined,
                          todo.revision,
                        );
                        onChanged?.();
                        onClose();
                      });
                  }}
                  className={`${buttonClass} text-rose-500`}
                >
                  Delete task
                </button>
              )}
            </details>
          </aside>
        </div>
        {closure && (
          <TaskClosureDialog
            task={todo}
            status={closure}
            busy={busy}
            error={error}
            onCancel={() => setClosure(null)}
            onConfirm={(body, revision) =>
              perform(async () => {
                await patch(body, revision);
                setClosure(null);
              })
            }
          />
        )}
      </article>
    </TaskInitialLoad>
  );
}
