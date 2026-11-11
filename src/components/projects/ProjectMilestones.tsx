"use client";
import { useEffect, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { describeWorkDate, localParts } from "@/lib/work-management/date-format";
import type { WorkProject, WorkKeyDate } from "@/lib/work-management/types";
import { useWorkDraftGuard } from "@/components/work/useWorkDraftGuard";
type Milestone = WorkKeyDate & { completedAt: string | null };
const input = "w-full min-w-0 rounded border border-card-border bg-card-bg p-2 text-sm";
const button = "rounded border border-card-border px-3 py-2 text-sm disabled:opacity-50";
export default function ProjectMilestones({
  project,
  onChanged,
}: {
  project: WorkProject;
  onChanged: (row: WorkProject) => void;
}) {
  const [items, setItems] = useState<Milestone[] | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<{
      id?: number;
      label: string;
      kind: string;
      value: string;
      zone: string;
      occurrence: string;
      revision: number;
    } | null>(null);
  const writer = useRef(createWorkWriter()),
    lock = useRef(false);
  const leave = useWorkDraftGuard(!!draft, () => setDraft(null));
  useEffect(() => {
    let active = true;
    void workRead<{ items: Milestone[] }>(`/api/projects/${project.id}/milestones`)
      .then((row) => {
        if (active) setItems(row.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [project.id, project.revision, refresh]);
  async function save(body: unknown, revision = project.revision) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const row = await writer.current<WorkProject>(
        `/api/projects/${project.id}/milestones`,
        "POST",
        body,
        revision,
      );
      setDraft(null);
      onChanged(row);
      setRefresh((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save milestone.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      id="project-milestones"
      aria-label="Project milestones"
      className="scroll-mt-24 space-y-4 rounded-xl border border-card-border bg-card-bg p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Informational milestones</h2>
        <button
          type="button"
          disabled={busy || !!project.archivedAt || !!draft}
          onClick={() =>
            setDraft({
              label: "",
              kind: "DATE",
              value: "",
              zone: project.timeZone,
              occurrence: "",
              revision: project.revision,
            })
          }
          className={button}
        >
          Add milestone
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Milestones inform planning. They do not complete tasks or reserve time.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            className="underline"
          >
            Retry milestones
          </button>
        </p>
      )}
      {draft && (
        <form
          aria-label="Milestone editor"
          className="space-y-3 rounded border border-card-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              {
                action: draft.id ? "edit" : "create",
                ...(draft.id ? { id: draft.id } : {}),
                label: draft.label,
                date:
                  draft.kind === "DATE"
                    ? { kind: "DATE", date: draft.value }
                    : {
                        kind: "TIME",
                        local: draft.value,
                        timeZone: draft.zone,
                        ...(draft.occurrence ? { occurrence: draft.occurrence } : {}),
                      },
              },
              draft.revision,
            );
          }}
        >
          <label className="block text-sm">
            Label
            <input
              aria-label="Milestone label"
              required
              maxLength={120}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              disabled={busy}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Date precision
            <select
              aria-label="Milestone date precision"
              value={draft.kind}
              disabled={busy}
              onChange={(e) =>
                setDraft({ ...draft, kind: e.target.value, value: "", occurrence: "" })
              }
              className={input}
            >
              <option value="DATE">Calendar date</option>
              <option value="TIME">Exact date and time</option>
            </select>
          </label>
          <label className="block text-sm">
            Milestone date
            <input
              aria-label="Milestone date"
              type={draft.kind === "DATE" ? "date" : "datetime-local"}
              required
              value={draft.value}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, value: e.target.value, occurrence: "" })}
              className={input}
            />
          </label>
          {draft.kind === "TIME" && (
            <>
              <label className="block text-sm">
                Time zone
                <input
                  aria-label="Milestone time zone"
                  required
                  value={draft.zone}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, zone: e.target.value, occurrence: "" })}
                  className={input}
                />
              </label>
              <select
                aria-label="Milestone repeated time"
                value={draft.occurrence}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, occurrence: e.target.value })}
                className={input}
              >
                <option value="">Require explicit repeated-time choice</option>
                <option value="earlier">Earlier occurrence</option>
                <option value="later">Later occurrence</option>
              </select>
            </>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={`${button} bg-blue-600 text-white`}>
              Save milestone
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (leave()) setDraft(null);
              }}
              className={button}
            >
              Cancel milestone edit
            </button>
          </div>
        </form>
      )}
      {!items ? (
        <p role="status">Loading milestones…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No milestones yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((row) => (
            <li key={row.id} className="space-y-2 rounded border border-card-border p-3">
              <p className="break-words font-medium">
                {row.completedAt ? "✓ Reached · " : "◇ "}
                {row.label}
              </p>
              <p className="text-sm text-gray-500">{describeWorkDate(row)}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-label={`Edit milestone ${row.id}`}
                  disabled={busy || !!draft || !!project.archivedAt}
                  onClick={() =>
                    setDraft({
                      id: row.id,
                      label: row.label,
                      kind: row.at ? "TIME" : "DATE",
                      value: row.at ? localParts(row.at, row.timeZone!) : row.date!,
                      zone: row.timeZone || project.timeZone,
                      occurrence: "",
                      revision: project.revision,
                    })
                  }
                  className={button}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Toggle milestone ${row.id}`}
                  disabled={busy || !!draft || !!project.archivedAt}
                  onClick={() =>
                    void save({ action: "complete", id: row.id, completed: !row.completedAt })
                  }
                  className={button}
                >
                  {row.completedAt ? "Mark not reached" : "Mark reached"}
                </button>
                <button
                  type="button"
                  aria-label={`Remove milestone ${row.id}`}
                  disabled={busy || !!draft || !!project.archivedAt}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this informational milestone? Its history will remain.",
                      )
                    )
                      void save({ action: "remove", id: row.id });
                  }}
                  className={button}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
