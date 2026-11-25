"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PlusIcon,
  PencilSquareIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import TaskModal from "@/components/shared/TaskModal";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type { WorkContact } from "@/lib/work-management/types";
import { useSnackbar } from "@/context/SnackbarContext";
import {
  fieldClass,
  primaryButton,
  settingsButton,
  secondaryButton,
} from "@/components/finance/shared";

const blank = { name: "", company: "", email: "", phone: "", notes: "" };
type Directory = { items: WorkContact[]; total: number; page: number; pageSize: number };

export default function PeopleManager({ focusId }: { focusId?: string }) {
  const [focused, setFocused] = useState<WorkContact | null>(null);
  const [focusError, setFocusError] = useState("");
  const scrolled = useRef("");
  const [data, setData] = useState<Directory | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [editing, setEditing] = useState<WorkContact | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [toggle, setToggle] = useState<WorkContact | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const writer = useRef(createWorkWriter());
  const { showMessage } = useSnackbar();
  useEffect(() => {
    scrolled.current = "";
  }, [focusId]);
  useEffect(() => {
    let active = true;
    setFocused(null);
    setFocusError("");
    if (!focusId) return;
    if (!/^[1-9]\d*$/.test(focusId) || Number(focusId) > 2147483647) {
      setFocusError("Person not found.");
      return;
    }
    void workRead<WorkContact>(`/api/work-contacts/${focusId}`)
      .then((person) => {
        if (active) setFocused(person);
      })
      .catch(() => {
        if (active) setFocusError("This person is no longer available.");
      });
    return () => {
      active = false;
    };
  }, [focusId, refresh]);
  useEffect(() => {
    if (!focused || !data || scrolled.current === focusId) return;
    const element = document.getElementById(`person-${focused.id}`);
    if (element) {
      scrolled.current = focusId ?? "";
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "center" });
    }
  }, [focused, data, focusId]);
  const visiblePeople = data
    ? focused && !data.items.some((person) => person.id === focused.id)
      ? [focused, ...data.items]
      : data.items
    : [];
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const timer = setTimeout(
      () => {
        void workRead<Directory>(`/api/work-contacts?q=${encodeURIComponent(query)}&page=${page}`)
          .then((result) => {
            if (active) setData(result);
          })
          .catch((failure) => {
            if (active)
              setError(failure instanceof Error ? failure.message : "Unable to load people.");
          });
      },
      query ? 200 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, page, refresh]);
  function edit(person: WorkContact | null) {
    setEditError("");
    setEditing(person);
    setDraft(
      person
        ? {
            name: person.name,
            company: person.company ?? "",
            email: person.email ?? "",
            phone: person.phone ?? "",
            notes: person.notes ?? "",
          }
        : blank,
    );
    setOpen(true);
  }
  async function save(statusOnly = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const person = statusOnly ? toggle : editing;
      if (statusOnly && !person) return;
      await writer.current(
        person ? `/api/work-contacts/${person.id}` : "/api/work-contacts",
        person ? "PATCH" : "POST",
        statusOnly
          ? { active: !person!.active }
          : {
              ...draft,
              company: draft.company || null,
              email: draft.email || null,
              phone: draft.phone || null,
              notes: draft.notes || null,
            },
        person?.revision,
      );
      showMessage(
        statusOnly
          ? person!.active
            ? "Person deactivated. Existing links were kept."
            : "Person reactivated."
          : "Person saved.",
      );
      setOpen(false);
      setToggle(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setToggle(null);
      const message =
        failure instanceof Error ? failure.message : "Unable to save person. Reload and try again.";
      setEditError(message);
      showMessage(message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className={`${primaryButton} gap-2`} onClick={() => edit(null)}>
          <PlusIcon className="h-5 w-5" />
          New person
        </button>
        <input
          aria-label="Search people"
          className={`${fieldClass} max-w-md`}
          placeholder="Search name, organization or email"
          maxLength={120}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </div>
      {error && (
        <div role="alert" className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-rose-400">{error}</p>
          <button className={secondaryButton} onClick={() => setRefresh((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}
      {focusError && (
        <p role="alert" className="card text-rose-400">
          {focusError}
        </p>
      )}
      {focused && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            Selected person: <strong>{focused.name}</strong>
          </p>
          <Link href="/settings/people" className="text-blue-400 hover:underline">
            Clear selection
          </Link>
        </div>
      )}
      {!data && !error && <p role="status">Loading people…</p>}
      {data && (
        <>
          {!data.total && !focused && (
            <p className="card text-muted">
              {query
                ? "No people match your search."
                : "No people yet. Add someone to use in tasks and reimbursements."}
            </p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visiblePeople.map((person) => (
              <li
                key={person.id}
                id={`person-${person.id}`}
                tabIndex={-1}
                data-focused={person.id === focused?.id ? "true" : undefined}
                className={`card flex min-w-0 flex-col gap-4 ${person.id === focused?.id ? "ring-2 ring-sky-500" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-sky-500/10 p-3">
                    <UserIcon className="h-6 w-6 text-sky-400" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold">{person.name}</h2>
                    <span
                      className={`text-xs ${person.active ? "text-emerald-400" : "text-muted"}`}
                    >
                      {person.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 break-words text-sm [overflow-wrap:anywhere]">
                  {person.company && (
                    <p className="flex items-center gap-2">
                      <BuildingOfficeIcon className="h-4 w-4 shrink-0 text-muted" />
                      {person.company}
                    </p>
                  )}
                  {person.email && (
                    <p className="flex items-center gap-2">
                      <EnvelopeIcon className="h-4 w-4 shrink-0 text-muted" />
                      {person.email}
                    </p>
                  )}
                  {person.phone && (
                    <p className="flex items-center gap-2">
                      <PhoneIcon className="h-4 w-4 shrink-0 text-muted" />
                      {person.phone}
                    </p>
                  )}
                  {person.notes && (
                    <p className="whitespace-pre-wrap border-t border-card-border pt-3 text-muted">
                      {person.notes}
                    </p>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-card-border pt-4">
                  <button
                    aria-label={`Edit ${person.name}`}
                    className={`${settingsButton} border-sky-500/40`}
                    disabled={busy}
                    onClick={() => edit(person)}
                  >
                    <PencilSquareIcon className="h-4 w-4 text-sky-400" />
                    Edit
                  </button>
                  <button
                    aria-label={`${person.active ? "Deactivate" : "Reactivate"} ${person.name}`}
                    className={`${settingsButton} ${person.active ? "border-amber-500/40" : "border-emerald-500/40"}`}
                    disabled={busy}
                    onClick={() => setToggle(person)}
                  >
                    {person.active ? (
                      <UserMinusIcon className="h-4 w-4 text-amber-400" />
                    ) : (
                      <UserPlusIcon className="h-4 w-4 text-emerald-400" />
                    )}
                    {person.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {data.total > data.pageSize && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={secondaryButton}
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
              >
                Previous
              </button>
              <span>
                {data.page} / {Math.ceil(data.total / data.pageSize)}
              </span>
              <button
                className={secondaryButton}
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => setPage(data.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      <TaskModal
        open={open}
        title={editing ? "Edit person" : "New person"}
        busy={busy}
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {editError && (
            <p role="alert" className="text-sm text-rose-400">
              {editError}
            </p>
          )}
          {(
            [
              ["name", "Name", 120],
              ["company", "Organization", 120],
              ["email", "Email", 254],
              ["phone", "Phone", 40],
            ] as const
          ).map(([key, label, limit]) => (
            <label key={key} className="block space-y-1 text-sm">
              {label}
              <input
                aria-label={`Person ${key}`}
                className={fieldClass}
                type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                required={key === "name"}
                maxLength={limit}
                value={draft[key]}
                disabled={busy}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <label className="block space-y-1 text-sm">
            Notes
            <textarea
              aria-label="Person notes"
              className={fieldClass}
              rows={3}
              maxLength={2000}
              disabled={busy}
              value={draft.notes}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, notes: event.target.value }))
              }
            />
          </label>
          <div className="flex gap-2">
            <button className={primaryButton} disabled={busy}>
              {busy ? "Saving…" : "Save person"}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </TaskModal>
      <TaskModal
        open={!!toggle}
        title={toggle?.active ? "Deactivate person" : "Reactivate person"}
        busy={busy}
        onClose={() => setToggle(null)}
      >
        <p className="mb-4">
          {toggle?.active
            ? "Existing task and reimbursement links will be kept. This person will no longer be available for new assignments."
            : "Make this person available in tasks and reimbursements again?"}
        </p>
        <button className={primaryButton} disabled={busy} onClick={() => save(true)}>
          Confirm
        </button>
      </TaskModal>
    </section>
  );
}
