"use client";

import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";
import { formatEventRange, validateEventDates } from "@/lib/event-dates";
import { Cog6ToothIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMemory } from "@/context/MemoryContext";

type Todo = { id: number; title: string; done: boolean };
type EventItem = {
  id: number;
  title: string;
  description?: string | null;
  date: string | null;
  endDate: string | null;
  type?: string | null;
  linkedTodo?: Todo | null;
};
type ActivityType = { id: number; name: string; color: string; active: boolean };

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [typeName, setTypeName] = useState("");
  const [typeColor, setTypeColor] = useState("#3b82f6");

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [createError, setCreateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState("");

  const { pageRouter, get, set } = useMemory();

  const load = async () => {
    setLoading(true);
    const [eventsRes, typesRes] = await Promise.all([
      fetch("/api/events"),
      fetch("/api/activity-types"),
    ]);
    const data = await eventsRes.json();
    const types = await typesRes.json();
    const normalized = data.map((e: EventItem) => ({
      ...e,
      date: e.date ? new Date(e.date).toISOString() : null,
      endDate: e.endDate ? new Date(e.endDate).toISOString() : null,
    }));
    setEvents(normalized);
    setActivityTypes(types);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleEventClick = (clickInfo: EventClickArg) => {
    const id = Number(clickInfo.event.id);
    pageRouter('/events', `/events/${id}`);
  };

  const handleMonthChange = (info: DatesSetArg) => {
    const start = new Date(info.startStr);
    start.setDate(start.getDate() + 14);
    const month = start.getMonth() + 1;
    const year = start.getFullYear();

    set("calendar_currentMonth", month);
    set("calendar_currentYear", year);
  };


  const getColorForType = (type?: string | null) => {
    return activityTypes.find((activityType) => activityType.name.toLowerCase() === type?.toLowerCase())?.color || "#9ca3af";
  };

  const saveActivityType = async () => {
    const res = await fetch("/api/activity-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: typeName, color: typeColor }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Unable to create activity type");
      return;
    }
    setTypeName("");
    setTypeColor("#3b82f6");
    await load();
  };

  const updateActivityType = async (activityType: ActivityType, changes: Partial<ActivityType>) => {
    const res = await fetch(`/api/activity-types/${activityType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (res.ok) await load();
  };

  const deleteActivityType = async (activityType: ActivityType) => {
    if (!confirm(`Delete activity type "${activityType.name}"? Existing events will keep their details but lose this type.`)) return;
    const res = await fetch(`/api/activity-types/${activityType.id}`, { method: "DELETE" });
    if (res.ok) await load();
  };

  const createEvent = async () => {
    const error = validateEventDates(newDate || null, newEndDate || null);
    if (error) {
      setCreateError(error);
      return;
    }
    const dateValue = newDate ? new Date(newDate).toISOString() : null;
    const endDateValue = newEndDate ? new Date(newEndDate).toISOString() : null;
    setCreateError("");
    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          date: dateValue,
          endDate: endDateValue,
          type: newType,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Unable to create event.");
        return;
      }
      setNewTitle("");
      setNewDesc("");
      setNewDate("");
      setNewEndDate("");
      setNewType("");
      setCreating(false);
      await load();
    } catch {
      setCreateError("Unable to create event. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const fcEvents = events
    .filter((e) => e.date) // FullCalendar only accepts real dates
    .map((e) => ({
      id: String(e.id),
      title: e.title,
      start: e.date!,
      end: e.endDate || undefined,
      allDay: false,
      textColor: "#ffffff",
      backgroundColor: getColorForType(e.type),
      borderColor: getColorForType(e.type),
    }));

  // Split events into upcoming and TBD
  const now = new Date();
    
  const upcomingEvents = events
    .filter((e) => e.date && new Date(e.endDate || e.date) >= now)
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
    
  const tbdEvents = events.filter((e) => !e.date);

  return (
    <div className="calendar-page flex flex-col xl:flex-row gap-6 p-2 md:p-6">
      {/* Calendar */}
      <div className="min-w-0 flex-1 bg-card rounded-xl shadow p-4 card">
        <div className="fullcalendar-theme">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={`${get("calendar_currentYear", new Date().getFullYear())}-${String(get("calendar_currentMonth", new Date().getMonth() + 1)).padStart(2, "0")}-01`}
            events={fcEvents}
            eventClick={handleEventClick}
            height="auto"
            displayEventTime={false}
            eventDisplay="block"
            nextDayThreshold="00:00:00"
            dayMaxEvents={3}
            eventDidMount={(info) => {
              info.el.title = `${info.event.title}\n${formatEventRange(info.event.start?.toISOString(), info.event.end?.toISOString())}`;
            }}
            datesSet={handleMonthChange}
          />
        </div>
      </div>

      {/* Sidebar */}
      <aside className="calendar-sidebar w-full xl:w-96 xl:shrink-0 bg-card rounded-xl shadow p-4 card flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Events</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              title="Activity type settings"
              aria-label="Activity type settings"
              className="p-2 rounded hover:bg-accent/10 cursor-pointer"
            >
              <Cog6ToothIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCreating(!creating)}
              className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
            >
              {creating ? "Cancel" : "New"}
            </button>
          </div>
        </div>

        {creating ? (
          <form onSubmit={(e) => { e.preventDefault(); void createEvent(); }} className="space-y-2 mb-4 border rounded p-3 bg-accent/5">
            <input
              placeholder="Title"
              aria-label="Title"
              required
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
            <label className="block text-sm">
              <span className="block mb-1">Start date and time</span>
              <input
                type="datetime-local"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full min-w-0 border rounded px-2 py-1"
              />
            </label>
            <label className="block text-sm">
              <span className="block mb-1">End date and time (optional)</span>
              <input
                type="datetime-local"
                value={newEndDate}
                min={newDate || undefined}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="w-full min-w-0 border rounded px-2 py-1"
              />
            </label>
            <p className="text-xs text-gray-500">Leave both dates blank for a TBD event.</p>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Type (optional)</option>
              {activityTypes.filter((activityType) => activityType.active).map((activityType) => (
                <option key={activityType.id} value={activityType.name}>{activityType.name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-green-600 text-white rounded px-2 py-1 hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Event"}
            </button>
            {createError && <p role="alert" className="text-sm text-red-600">{createError}</p>}
          </form>
        ) : loading ? (
          <div>Loading...</div>
        ) : (
          <>
            {/* Upcoming events */}
            <div className="mb-4">
              <h3 className="text-medium mb-2">Upcoming</h3>
              <ul className="calendar-event-list space-y-2 max-h-70 overflow-y-auto pr-1">
                {upcomingEvents.length === 0 && (
                  <li className="text-sm text-gray-500">No upcoming events</li>
                )}
                {upcomingEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="p-2 border rounded hover:bg-accent/10 cursor-pointer transition flex items-center gap-2"
                    onClick={() => pageRouter('/events', `/events/${ev.id}`)}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getColorForType(ev.type) }}
                    />
                    <div>
                      <div className="font-medium">{ev.title}</div>
                      <div className="text-sm text-gray-500">
                        {formatEventRange(ev.date, ev.endDate)}
                        {ev.date && new Date(ev.date) <= now && ev.endDate && <span className="block text-blue-500">In progress</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* TBD events */}
            <div>
              <h3 className="text-medium mb-2">TBD</h3>
              <ul className="calendar-event-list space-y-2 max-h-70 overflow-y-auto pr-1">
                {tbdEvents.length === 0 && (
                  <li className="text-sm text-gray-500">No TBD events</li>
                )}
                {tbdEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="p-2 border rounded hover:bg-accent/10 cursor-pointer transition flex items-center gap-2"
                    onClick={() => pageRouter('/events', `/events/${ev.id}`)}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getColorForType(ev.type) }}
                    />
                    <div>
                      <div className="font-medium">{ev.title}</div>
                      <div className="text-sm text-gray-500 italic">
                        No date set
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </aside>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card rounded-xl shadow-xl p-6 card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold">Activity type settings</h2>
              <button onClick={() => setSettingsOpen(false)} title="Close settings" aria-label="Close settings" className="p-1 rounded hover:bg-accent/10 cursor-pointer">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="flex gap-2 mb-5">
              <input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="New activity type" className="flex-1 border rounded px-3 py-2" />
              <input type="color" value={typeColor} onChange={(e) => setTypeColor(e.target.value)} title="Choose color" className="w-11 h-10 border rounded p-1 cursor-pointer" />
              <button onClick={saveActivityType} title="Add activity type" aria-label="Add activity type" className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
                <PlusIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {activityTypes.map((activityType) => (
                <div key={activityType.id} className="flex items-center gap-2 border rounded p-2">
                  <input type="color" value={activityType.color} onChange={(e) => updateActivityType(activityType, { color: e.target.value })} title={`Color for ${activityType.name}`} className="w-9 h-9 border rounded p-1 cursor-pointer" />
                  <input value={activityType.name} onChange={(e) => setActivityTypes((current) => current.map((item) => item.id === activityType.id ? { ...item, name: e.target.value } : item))} onBlur={(e) => updateActivityType(activityType, { name: e.target.value })} className="min-w-0 flex-1 border rounded px-2 py-1" />
                  <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                    <input type="checkbox" checked={activityType.active} onChange={(e) => updateActivityType(activityType, { active: e.target.checked })} /> Active
                  </label>
                  <button onClick={() => deleteActivityType(activityType)} title={`Delete ${activityType.name}`} aria-label={`Delete ${activityType.name}`} className="p-2 rounded text-red-600 hover:bg-red-50 cursor-pointer">
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {!activityTypes.length && <p className="text-sm text-gray-500">No activity types yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
