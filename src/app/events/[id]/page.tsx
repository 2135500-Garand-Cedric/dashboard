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
  date?: string | null;
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

  const getColorForType = (type?: string | null) => {
    switch (type) {
      case "CSI2110":
        return "red";
      case "MAT2377":
        return "blue";
      case "JPN2901":
        return "orange";
      case "SEG2105":
        return "purple";
      case "CEG2136":
        return "cyan"
      case "personal":
        return "green";
      default:
        return "gray";
    }
  };

  const loadEvent = async () => {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();

    setEvent(data);
    setTitleDraft(data.title);
    setDescDraft(data.description || "");
    setTypeDraft(data.type || "");

    if (data.date) {
      const eventDate = new Date(data.date);
      setDateDraft(eventDate.toISOString().slice(0, 10));
      setTimeDraft(
        eventDate.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    } else {
      setDateDraft("");
      setTimeDraft("");
    }
  };

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  if (!event) return <div className="text-center py-10">Loading...</div>;

  const saveEvent = async () => {
    let dateValue: string | null = null;

    if (dateDraft && timeDraft) {
      const combinedDate = new Date(`${dateDraft}T${timeDraft}`);
      dateValue = combinedDate.toISOString();
    }

    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleDraft,
        description: descDraft,
        type: typeDraft,
        date: dateValue,
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
                <option value="CSI2110">CSI 2110</option>
                <option value="MAT2377">MAT 2377</option>
                <option value="JPN2901">JPN 2901</option>
                <option value="SEG2105">SEG 2105</option>
                <option value="CEG2136">CEG 2136</option>
                <option value="personal">Personal</option>
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

          {/* Date & Time */}
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
              ) : event.date ? (
                <span className="text-gray-700">
                  {new Date(event.date).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-gray-400">TBD</span>
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
              ) : event.date ? (
                <span className="text-gray-700">
                  {new Date(event.date).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                <span className="text-gray-400">TBD</span>
              )}
            </div>
          </div>

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
