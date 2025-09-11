"use client";

import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";

type Todo = { id: number; title: string; done: boolean };
type EventItem = {
  id: number;
  title: string;
  description?: string | null;
  date: string;
  type?: string | null;
  linkedTodo?: Todo | null;
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Draft state for new event
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newType, setNewType] = useState("");

  const router = useRouter();

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/events");
    const data = await res.json();
    const normalized = data.map((e: any) => ({
      ...e,
      date: new Date(e.date).toISOString(),
    }));
    setEvents(normalized);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleEventClick = (clickInfo: any) => {
    const id = Number(clickInfo.event.id);
    router.push(`/events/${id}`);
  };

  const getColorForType = (type?: string | null) => {
    switch (type) {
      case "exam":
        return "red";
      case "meeting":
        return "blue";
      case "personal":
        return "green";
      default:
        return "gray";
    }
  };

  const createEvent = async () => {
    const combinedDate = new Date(`${newDate}T${newTime}`);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        description: newDesc,
        date: combinedDate.toISOString(),
        type: newType,
      }),
    });

    if (res.ok) {
      setNewTitle("");
      setNewDesc("");
      setNewDate("");
      setNewTime("");
      setNewType("");
      setCreating(false);
      await load();
    }
  };

  const fcEvents = events.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.date,
    backgroundColor: getColorForType(e.type),
    borderColor: getColorForType(e.type),
  }));

  return (
    <div className="flex gap-6 p-6">
      {/* Calendar */}
      <div className="flex-1 bg-card rounded-xl shadow p-4 card">
        <div className="fullcalendar-theme">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={fcEvents}
            eventClick={handleEventClick}
            height="auto"
            displayEventTime={false}
          />
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-96 bg-card rounded-xl shadow p-4 card">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Upcoming events</h3>
          <button
            onClick={() => setCreating(!creating)}
            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {creating ? "Cancel" : "New"}
          </button>
        </div>
        
        {creating ? (
          // Show only the create form when adding a new event
          <div className="space-y-2 mb-4 border rounded p-3 bg-accent/5">
            <input
              placeholder="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
            <textarea
              placeholder="Description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full border rounded px-2 py-1"
              rows={2}
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 border rounded px-2 py-1"
              />
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="flex-1 border rounded px-2 py-1"
              />
            </div>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Type (optional)</option>
              <option value="exam">Exam</option>
              <option value="meeting">Meeting</option>
              <option value="personal">Personal</option>
            </select>
            <button
              onClick={createEvent}
              className="w-full bg-green-600 text-white rounded px-2 py-1 hover:bg-green-700"
            >
              Save Event
            </button>
          </div>
        ) : (
          // Show upcoming events list only if not creating
          loading ? (
            <div>Loading...</div>
          ) : (
            <ul className="space-y-3">
              {events.slice(0, 10).map((ev) => (
                <li
                  key={ev.id}
                  className="p-2 border rounded hover:bg-accent/10 cursor-pointer transition"
                  onClick={() => router.push(`/events/${ev.id}`)}
                >
                  <div className="flex justify-between">
                    <div>
                      <div className="font-medium">{ev.title}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(ev.date).toLocaleDateString()}{" "}
                        {new Date(ev.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-sm">
                      {ev.linkedTodo
                        ? ev.linkedTodo.done
                          ? "✅"
                          : "🟡"
                        : "—"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </aside>

    </div>
  );
}
