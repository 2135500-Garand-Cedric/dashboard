"use client";
import { useEffect, useRef, useState } from "react";
import { workRead } from "@/lib/work-management/client";
type Label = { id: number; name: string; color: string; active: boolean };
export default function ActivityTypeSettings({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [items, setItems] = useState<Label[]>([]),
    [name, setName] = useState(""),
    [color, setColor] = useState("#3b82f6"),
    [error, setError] = useState("");
  const load = () => workRead<Label[]>("/api/activity-types").then(setItems);
  useEffect(() => {
    ref.current?.showModal();
    void load().catch((e) => setError(e.message));
  }, []);
  async function change(url: string, method: string, body?: unknown) {
    try {
      setError("");
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error || "Unable to save activity label.");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update label.");
    }
  }
  const input = "min-w-0 rounded border border-card-border bg-card-bg p-2";
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label="Activity type settings"
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg space-y-4 overflow-y-auto rounded-xl border border-card-border bg-card-bg p-5 text-foreground backdrop:bg-black/60"
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">Activity labels and colors</h2>
        <button type="button" onClick={onClose} className={input}>
          Close settings
        </button>
      </div>
      {error && (
        <p role="alert" className="text-rose-500">
          {error}
        </p>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void change("/api/activity-types", "POST", { name, color }).then(() => setName(""));
        }}
      >
        <input
          aria-label="New activity label"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${input} flex-1`}
        />
        <input
          type="color"
          aria-label="New label color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-10"
        />
        <button className={input}>Add label</button>
      </form>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`Color for ${item.name}`}
              type="color"
              value={item.color}
              onChange={(e) =>
                void change(`/api/activity-types/${item.id}`, "PATCH", { color: e.target.value })
              }
              className="h-9 w-9"
            />
            <input
              aria-label={`Label ${item.id}`}
              value={item.name}
              onChange={(e) =>
                setItems(
                  items.map((row) => (row.id === item.id ? { ...row, name: e.target.value } : row)),
                )
              }
              onBlur={(e) =>
                void change(`/api/activity-types/${item.id}`, "PATCH", { name: e.target.value })
              }
              className={`${input} flex-1`}
            />
            <label className="text-sm">
              <input
                type="checkbox"
                checked={item.active}
                onChange={(e) =>
                  void change(`/api/activity-types/${item.id}`, "PATCH", {
                    active: e.target.checked,
                  })
                }
              />{" "}
              Active
            </label>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this label? Events keep their timing and task links."))
                  void change(`/api/activity-types/${item.id}`, "DELETE");
              }}
              className={`${input} text-rose-500`}
            >
              Delete label
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
