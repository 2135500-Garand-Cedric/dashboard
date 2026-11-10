"use client";
import { useEffect, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type { WorkContact } from "@/lib/work-management/types";
import { useWorkDraftGuard } from "./useWorkDraftGuard";
const contactWriter = createWorkWriter();
let contactDraft: { editing: WorkContact | "new"; name: string; company: string } | null = null;
export default function ContactManager() {
  const [open, setOpen] = useState(!!contactDraft),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{
    items: WorkContact[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [editing, setEditing] = useState<WorkContact | "new" | null>(contactDraft?.editing ?? null),
    [name, setName] = useState(contactDraft?.name ?? ""),
    [company, setCompany] = useState(contactDraft?.company ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    write = useRef(contactWriter);
  const dirty =
    !!editing &&
    (name !== (editing === "new" ? "" : editing.name) ||
      company !== (editing === "new" ? "" : (editing.company ?? "")));
  const draftRef = useRef<typeof contactDraft>(null);
  draftRef.current = dirty && editing ? { editing, name, company } : null;
  const confirmLeave = useWorkDraftGuard(dirty, () => {
    contactDraft = null;
    draftRef.current = null;
  });
  useEffect(
    () => () => {
      contactDraft = draftRef.current;
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(null);
    const timer = setTimeout(() => {
      void workRead<{ items: WorkContact[]; total: number; page: number; pageSize: number }>(
        `/api/work-contacts?q=${encodeURIComponent(query)}&page=${page}`,
      )
        .then((result) => {
          if (active) {
            setData(result);
            setError("");
          }
        })
        .catch((error) => {
          if (active) setError(error instanceof Error ? error.message : "Unable to load contacts.");
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query, page, refresh]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      setRefresh((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save contact.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function edit(contact: WorkContact | "new") {
    if (!confirmLeave()) return;
    setEditing(contact);
    setName(contact === "new" ? "" : contact.name);
    setCompany(contact === "new" ? "" : (contact.company ?? ""));
  }
  return (
    <details
      className="scroll-mt-24 rounded-lg border border-card-border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">Manage contacts</summary>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => edit("new")}
              className="scroll-mt-24 rounded border px-3 py-2"
            >
              New contact
            </button>
            <input
              aria-label="Search contact directory"
              placeholder="Search contacts or company"
              maxLength={120}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="min-w-0 flex-1 rounded border bg-card-bg p-2"
            />
          </div>
          {editing && (
            <form
              aria-label="Contact editor"
              className="grid gap-3 rounded-lg border border-card-border p-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  await write.current(
                    editing === "new" ? "/api/work-contacts" : `/api/work-contacts/${editing.id}`,
                    editing === "new" ? "POST" : "PATCH",
                    { name, company: company || null },
                    editing === "new" ? undefined : editing.revision,
                  );
                  contactDraft = null;
                  draftRef.current = null;
                  setEditing(null);
                });
              }}
            >
              <label className="text-sm">
                Contact name
                <input
                  aria-label="Contact name"
                  required
                  maxLength={120}
                  disabled={busy}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="scroll-mt-24 mt-1 w-full rounded border bg-card-bg p-2"
                />
              </label>
              <label className="text-sm">
                Contact company (optional)
                <input
                  aria-label="Contact company"
                  maxLength={120}
                  disabled={busy}
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className="scroll-mt-24 mt-1 w-full rounded border bg-card-bg p-2"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="scroll-mt-24 rounded bg-blue-600 px-3 py-2 text-white"
                >
                  Save contact
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirmLeave()) setEditing(null);
                  }}
                  className="scroll-mt-24 rounded border px-3 py-2"
                >
                  Cancel contact edit
                </button>
              </div>
            </form>
          )}
          {error && (
            <p role="alert" className="text-rose-500">
              {error}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Reload contacts
              </button>
            </p>
          )}
          {!data && !error ? (
            <p role="status">Loading contacts…</p>
          ) : (
            data && (
              <>
                <ul className="divide-y divide-card-border">
                  {data.items.map((contact) => (
                    <li
                      key={contact.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <span className="min-w-0 break-words">
                        {contact.name}
                        {contact.company ? ` · ${contact.company}` : ""}
                        <span className="ml-2 text-xs text-gray-500">
                          #{contact.id}
                          {!contact.active ? " · Inactive" : ""}
                        </span>
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => edit(contact)}
                          aria-label={`Edit contact ${contact.id}`}
                          className="scroll-mt-24 rounded border px-3 py-2 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy || !!editing}
                          onClick={() => {
                            if (
                              !contact.active ||
                              window.confirm(
                                "Deactivate this contact? Existing task links will be kept.",
                              )
                            )
                              void perform(async () => {
                                await write.current(
                                  `/api/work-contacts/${contact.id}`,
                                  "PATCH",
                                  { active: !contact.active },
                                  contact.revision,
                                );
                              });
                          }}
                          aria-label={`${contact.active ? "Deactivate" : "Reactivate"} contact ${contact.id}`}
                          className="scroll-mt-24 rounded border px-3 py-2 text-sm"
                        >
                          {contact.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {!data.total && <p className="text-gray-500">No contacts found.</p>}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <button
                    type="button"
                    disabled={data.page <= 1}
                    onClick={() => setPage(data.page - 1)}
                    className="scroll-mt-24 rounded border px-3 py-2"
                  >
                    Previous contacts
                  </button>
                  <span>
                    {data.total} contacts · Page {data.page}/
                    {Math.max(1, Math.ceil(data.total / data.pageSize))}
                  </span>
                  <button
                    type="button"
                    disabled={data.page * data.pageSize >= data.total}
                    onClick={() => setPage(data.page + 1)}
                    className="scroll-mt-24 rounded border px-3 py-2"
                  >
                    Next contacts
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}
    </details>
  );
}
