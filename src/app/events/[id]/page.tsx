"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PencilSquareIcon,
  CheckIcon,
  ArrowLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

type Todo = { id: number; title: string; done: boolean };
type EventItem = {
  id: number;
  title: string;
  description?: string | null;
  date: string;
  type?: string | null;
  linkedTodo?: Todo | null;
};

export default function EventPage() {
  const params = useParams();
  const eventId = Number(params.id);
  const router = useRouter();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [typeDraft, setTypeDraft] = useState<string | null>("");
  const [dateDraft, setDateDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");

  const loadEvent = async () => {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();
    const eventDate = new Date(data.date);
    setEvent(data);
    setTitleDraft(data.title);
    setDescDraft(data.description || "");
    setTypeDraft(data.type || "");
    setDateDraft(eventDate.toISOString().slice(0, 10)); // YYYY-MM-DD
    setTimeDraft(
      eventDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    );
  };

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  if (!event) return <div className="text-center py-10">Loading...</div>;

  const saveEvent = async () => {
    const combinedDate = new Date(`${dateDraft}T${timeDraft}`);
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleDraft,
        description: descDraft,
        type: typeDraft,
        date: combinedDate.toISOString(),
      }),
    });
    setEditMode(false);
    await loadEvent();
  };

  const deleteEvent = async () => {
    if (confirm("Are you sure you want to delete this event?")) {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
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
            onClick={() => router.push("/events")}
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
              <h1 className="text-xl font-semibold">{event.title}</h1>
            )}
          </div>

          <div className="flex gap-2 ml-4">
            {/* Edit/Save button */}
            <button
              onClick={async () => {
                if (editMode) await saveEvent();
                setEditMode(!editMode);
              }}
              className="flex items-center gap-1 border rounded px-3 py-1 hover:bg-gray-100 hover:text-black cursor-pointer"
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

            {/* Delete button */}
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
                <option value="exam">Exam</option>
                <option value="meeting">Meeting</option>
                <option value="personal">Personal</option>
              </select>
            ) : (
              <span className="text-gray-700">{event.type || "None"}</span>
            )}
          </div>

          {/* Date & Time separated */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1">Date</label>
              {editMode ? (
                <input
                  type="date"
                  value={dateDraft}
                  onChange={(e) => setDateDraft(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              ) : (
                <span className="text-gray-700">
                  {new Date(event.date).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1">Time</label>
              {editMode ? (
                <input
                  type="time"
                  value={timeDraft}
                  onChange={(e) => setTimeDraft(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              ) : (
                <span className="text-gray-700">
                  {new Date(event.date).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Linked todo */}
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
