"use client";
import { useCallback, useEffect, useState } from "react";
import {
  UserPlusIcon,
  ShieldCheckIcon,
  KeyIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { JAPANESE_CAPABILITIES, validPermissions } from "@/lib/accounts/capabilities";
import TaskModal from "@/components/shared/TaskModal";
import { useSnackbar } from "@/context/SnackbarContext";
type Member = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  active: boolean;
  createdAt: string;
  lastSignedInAt: string | null;
  initialization: { choice: string } | null;
  permissions: { capability: string }[];
  authAccounts: { provider: string }[];
};
type Invite = {
  id: string;
  label: string;
  expires: string;
  usedAt: string | null;
  revokedAt: string | null;
};
type Data = {
  users: Member[];
  invitations: Invite[];
  pack: { id: number; wordCount: number } | null;
};
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40";
export default function UserManagement() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [inviteOpen, setInviteOpen] = useState(false),
    [label, setLabel] = useState(""),
    [url, setUrl] = useState(""),
    [selected, setSelected] = useState<Member | null>(null),
    [permissions, setPermissions] = useState<string[]>([]),
    [active, setActive] = useState(true),
    [confirm, setConfirm] = useState<{
      action: string;
      userId?: number;
      id?: string;
      title: string;
    } | null>(null);
  const { showMessage } = useSnackbar();
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setData(value);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load accounts.");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function command(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      await reload();
      showMessage("Change saved.");
      return value;
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to save.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  function toggle(capability: string, checked: boolean) {
    let next = checked
      ? [...permissions, capability]
      : permissions.filter((item) => item !== capability);
    if (checked && ["japanese.practice", "japanese.vocabulary.manage"].includes(capability))
      next = [...new Set([...next, "japanese.vocabulary.read"])];
    if (!checked && capability === "japanese.vocabulary.read")
      next = next.filter(
        (item) => !["japanese.practice", "japanese.vocabulary.manage"].includes(item),
      );
    setPermissions(next);
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheckIcon className="h-7 w-7 text-blue-400" />
          User management
        </h1>
        <div className="flex gap-2">
          <button
            className={`${button} border-blue-500/40`}
            onClick={() => {
              setInviteOpen(true);
              setUrl("");
              setLabel("");
            }}
          >
            <UserPlusIcon className="h-5 w-5" />
            Invite someone
          </button>
          <button className={button} onClick={reload}>
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading accounts…</p>}
      {data && (
        <>
          <section className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Starter vocabulary</h2>
              <p>
                {data.pack?.wordCount ?? 0} words · Version {data.pack?.id ?? "—"}
              </p>
              <p className="mt-1 text-sm text-muted">
                Contains all owner words. Publishing a new copy only affects future setups.
              </p>
            </div>
            <button
              disabled={busy}
              className={`${button} border-emerald-500/40`}
              onClick={() =>
                setConfirm({
                  action: "publish",
                  title:
                    "Publish all your current vocabulary as a new starter version? Existing learner copies will stay independent.",
                })
              }
            >
              Publish current vocabulary
            </button>
          </section>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.users.map((user) => (
              <article key={user.id} className="card min-w-0 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="break-words text-lg font-semibold">
                    {user.name || `Account #${user.id}`}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-xs ${user.active ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}
                  >
                    {user.active ? (user.role === "OWNER" ? "Owner" : "Active") : "Suspended"}
                  </span>
                </div>
                <p className="break-words text-sm text-muted">
                  {user.email || "No verified contact email"}
                </p>
                <p className="text-sm">
                  {user.authAccounts
                    .map((a) => (a.provider === "github" ? "GitHub" : "Google"))
                    .join(" · ")}{" "}
                  · {user.initialization ? "Setup complete" : "Awaiting setup"}
                </p>
                <p className="text-xs text-muted">
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                  <br />
                  Last sign-in:{" "}
                  {user.lastSignedInAt
                    ? new Date(user.lastSignedInAt).toLocaleString()
                    : "Not recorded"}
                </p>
                {user.role !== "OWNER" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`${button} border-blue-500/40`}
                      onClick={() => {
                        setSelected(user);
                        setPermissions(user.permissions.map((p) => p.capability));
                        setActive(user.active);
                      }}
                    >
                      Edit access
                    </button>
                    <button
                      className={`${button} border-amber-500/40`}
                      onClick={() =>
                        setConfirm({
                          action: "revoke-sessions",
                          userId: user.id,
                          title: `Sign ${user.name || "this member"} out on all devices?`,
                        })
                      }
                    >
                      <KeyIcon className="h-4 w-4" />
                      Revoke sessions
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Invitations</h2>
            {!data.invitations.length && <p className="text-muted">No invitations yet.</p>}
            {data.invitations.map((invite) => {
              const state = invite.usedAt
                ? "Used"
                : invite.revokedAt
                  ? "Revoked"
                  : new Date(invite.expires) < new Date()
                    ? "Expired"
                    : "Available";
              return (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-3"
                >
                  <div>
                    <p className="font-medium">{invite.label}</p>
                    <p className="text-sm text-muted">
                      {state} · Expires {new Date(invite.expires).toLocaleDateString()}
                    </p>
                  </div>
                  {state === "Available" && (
                    <button
                      className={`${button} border-rose-500/40`}
                      onClick={() =>
                        setConfirm({
                          action: "revoke-invite",
                          id: invite.id,
                          title: `Revoke the invitation for ${invite.label}?`,
                        })
                      }
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}
      <TaskModal open={inviteOpen} title="Invite someone" onClose={() => setInviteOpen(false)}>
        {url ? (
          <div className="space-y-4">
            <p>
              This single-use link expires in seven days. Copy it now; it is not stored in readable
              form.
            </p>
            <input
              aria-label="Invitation link"
              readOnly
              value={url}
              className="w-full rounded-lg border border-card-border bg-card-bg p-3"
            />
            <button
              className={button}
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => showMessage("Invitation copied."))
                  .catch(() => showMessage("Select the link and copy it manually."))
              }
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              Copy link
            </button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const value = await command({ action: "invite", label });
              if (value) setUrl(value.url);
            }}
          >
            <label className="block">
              Invitation label
              <input
                required
                maxLength={100}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-2 w-full rounded-lg border border-card-border bg-card-bg p-3"
              />
            </label>
            <button disabled={busy} className={button}>
              Create invitation link
            </button>
          </form>
        )}
      </TaskModal>
      <TaskModal
        open={!!selected}
        title={`Access for ${selected?.name || "member"}`}
        onClose={() => setSelected(null)}
      >
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              validPermissions(permissions);
            } catch (error) {
              showMessage((error as Error).message);
              return;
            }
            const value = await command({
              action: "update",
              userId: selected!.id,
              permissions,
              active,
            });
            if (value) setSelected(null);
          }}
        >
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Account active
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              onClick={() => setPermissions([...JAPANESE_CAPABILITIES])}
            >
              Japanese learner
            </button>
            <button type="button" className={button} onClick={() => setPermissions([])}>
              Remove access
            </button>
          </div>
          {JAPANESE_CAPABILITIES.map((cap) => (
            <label key={cap} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={permissions.includes(cap)}
                onChange={(e) => toggle(cap, e.target.checked)}
              />
              {cap.replace("japanese.", "").replaceAll(".", " ")}
            </label>
          ))}
          <p className="rounded-lg border border-card-border p-3 text-sm text-muted">
            Other modules remain owner-only until separately prepared for independent user data.
          </p>
          <button disabled={busy} className={`${button} border-blue-500/40`}>
            Save access
          </button>
        </form>
      </TaskModal>
      <TaskModal open={!!confirm} title="Confirm change" onClose={() => setConfirm(null)}>
        <p>{confirm?.title}</p>
        <div className="mt-5 flex gap-3">
          <button
            disabled={busy}
            className={`${button} border-amber-500/50`}
            onClick={async () => {
              if (confirm && (await command(confirm))) setConfirm(null);
            }}
          >
            Confirm
          </button>
          <button className={button} onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </TaskModal>
    </div>
  );
}
