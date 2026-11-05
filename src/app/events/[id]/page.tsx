"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PencilSquareIcon,
  CheckIcon,
  ArrowLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { useSnackbar } from "@/context/SnackbarContext";
import { useMemory } from "@/context/MemoryContext";
import { formatEventRange, toLocalDateTime, validateEventDates } from "@/lib/event-dates";

type Todo = { id: number; title: string; done: boolean };
type EventItem = {
  id: number;
  title: string;
  completed: boolean;
  description?: string | null;
  date?: string | null;
  endDate?: string | null;
  type?: string | null;
  linkedTodo?: Todo | null;
};
type ActivityType = { id: number; name: string; color: string; active: boolean };

export default function EventPage() {
  const params = useParams();
  const eventId = Number(params.id);
  const router = useRouter();
  const { get } = useMemory();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [typeDraft, setTypeDraft] = useState<string | null>("");
  const [dateDraft, setDateDraft] = useState("");
  const [endDateDraft, setEndDateDraft] = useState("");
  const [saveError, setSaveError] = useState("");
  const [completionSaving, setCompletionSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showMessage } = useSnackbar();

  const getColorForType = (type?: string | null) => {
    return activityTypes.find((activityType) => activityType.name.toLowerCase() === type?.toLowerCase())?.color || "#9ca3af";
  };

  const loadEvent = useCallback(async () => {
    const [eventRes, typesRes] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch("/api/activity-types"),
    ]);
    const data = await eventRes.json();
    setActivityTypes(await typesRes.json());

    setEvent(data);
    setTitleDraft(data.title);
    setDescDraft(data.description || "");
    setTypeDraft(data.type || "");

    setDateDraft(toLocalDateTime(data.date));
    setEndDateDraft(toLocalDateTime(data.endDate));
  }, [eventId]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  if (!event) return <div className="text-center py-10">Loading...</div>;

  const saveEvent = async () => {
    const error = validateEventDates(dateDraft || null, endDateDraft || null);
    if (error) {
      setSaveError(error);
      return;
    }
    const dateValue = dateDraft ? new Date(dateDraft).toISOString() : null;
    const endDateValue = endDateDraft ? new Date(endDateDraft).toISOString() : null;
    setSaveError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleDraft,
          description: descDraft,
          type: typeDraft,
          date: dateValue,
          endDate: endDateValue,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Unable to save event.");
        return;
      }
      setEditMode(false);
      await loadEvent();
    } catch {
      setSaveError("Unable to save event. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCompletion = async () => {
    setCompletionSaving(true);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !event.completed }),
      });
      if (!response.ok) throw new Error("Unable to update completion.");
      setEvent(await response.json());
    } catch {
      showMessage("Unable to update event completion. Please try again.");
    } finally {
      setCompletionSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (confirm("Are you sure you want to delete this event?")) {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        showMessage("Event deleted successfully");
        router.push("/events");
      }
    }
  };

  const createLinkedTodo = async () => {
    const title = `${titleDraft} (from event)`;
    const res = await fetch(`/api/events/${eventId}/create-todo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) await loadEvent();
  };

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push(get("prev_page", "/events"))}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer mr-4"
          >
            <ArrowLeftIcon className="w-5 h-5" /> Back
          </button>

          <div className="flex-1 flex justify-center items-center gap-2">
            {editMode ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="text-lg font-semibold border rounded px-3 py-1 flex-1 text-center"
              />
            ) : (
              <h1 className={`text-xl font-semibold ${event.completed ? "line-through text-gray-500" : ""}`}>{event.title}</h1>
            )}
          </div>

          <div className="flex gap-2 ml-4">
            <button
              onClick={async () => {
                if (editMode) await saveEvent();
                else setEditMode(true);
              }}
              disabled={saving}
              className="flex items-center gap-1 border rounded px-3 py-1 disabled:opacity-50 hover:bg-gray-100 hover:text-black cursor-pointer"
            >
              {editMode ? (
                <>
                  <CheckIcon className="w-5 h-5 text-green-600" />
                  Save
                </>
              ) : (
                <>
                  <PencilSquareIcon className="w-5 h-5" />
                  Edit
                </>
              )}
            </button>

            {!editMode && (
              <button
                onClick={deleteEvent}
                className="flex items-center gap-1 border rounded px-3 py-1 transition hover:bg-red-100 hover:text-red-600 cursor-pointer"
              >
                <TrashIcon className="w-5 h-5" />
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${event.completed ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-accent/10 text-accent"}`}>
            {event.completed ? "✓ Completed" : "Open"}
          </span>
          <button type="button" onClick={() => void toggleCompletion()} disabled={completionSaving || saving}
            aria-pressed={event.completed}
            className="rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-accent/10 disabled:opacity-50 cursor-pointer">
            {completionSaving ? "Saving…" : event.completed ? "Mark incomplete" : "Mark completed"}
          </button>
        </div>

        {/* Event details */}
        <div className="mb-6 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Description</label>
            {editMode ? (
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                className="w-full border rounded px-3 py-2"
                rows={4}
              />
            ) : (
              <p className="text-gray-700">{event.description || "No description"}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Type</label>
            {editMode ? (
              <select
                value={typeDraft ?? ""}
                onChange={(e) => setTypeDraft(e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white text-gray-900 cursor-pointer"
              >
                <option value="">None</option>
                {activityTypes
                  .filter((activityType) => activityType.active || activityType.name.toLowerCase() === typeDraft?.toLowerCase())
                  .map((activityType) => (
                    <option key={activityType.id} value={activityType.name}>{activityType.name}</option>
                  ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getColorForType(event.type) }}
                />
                <span className="text-gray-700">{event.type || "None"}</span>
              </div>
            )}
          </div>

          {/* Start and optional end */}
          {editMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="block text-gray-500 mb-1">Start date and time</span>
                <input
                  type="datetime-local"
                  value={dateDraft}
                  onChange={(e) => setDateDraft(e.target.value)}
                  className="w-full min-w-0 border rounded px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="block text-gray-500 mb-1">End date and time (optional)</span>
                <input
                  type="datetime-local"
                  value={endDateDraft}
                  min={dateDraft || undefined}
                  onChange={(e) => setEndDateDraft(e.target.value)}
                  className="w-full min-w-0 border rounded px-3 py-2"
                />
              </label>
              {saveError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{saveError}</p>}
            </div>
          ) : (
            <div>
              <div className="block text-sm text-gray-500 mb-1">Date and time</div>
              <p>{formatEventRange(event.date, event.endDate)}</p>
            </div>
          )}

          {/* Linked Todo */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Linked Todo</label>
            {event.linkedTodo ? (
              <button
                onClick={() => router.push(`/todos/${event.linkedTodo!.id}`)}
                className="text-blue-600 hover:underline cursor-pointer"
              >
                {event.linkedTodo.title}
              </button>
            ) : (
              <button
                onClick={createLinkedTodo}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
              >
                Create linked todo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
