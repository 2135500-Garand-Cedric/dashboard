"use client";
import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSnackbar } from "@/context/SnackbarContext";
import type { Actor } from "@/lib/accounts/context.mjs";
type Data = {
  actor: Actor;
  accounts: { provider: string }[];
  providers: string[];
  pack: { id: number; wordCount: number } | null;
};
const field = "w-full rounded-lg border border-card-border bg-card-bg p-3";
export default function AccountForm({
  setup = false,
  accessDenied = false,
  hideTitle = false,
}: {
  setup?: boolean;
  accessDenied?: boolean;
  hideTitle?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null),
    [name, setName] = useState(""),
    [zone, setZone] = useState(""),
    [choice, setChoice] = useState("PACK"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { showMessage } = useSnackbar();
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load your account.");
        return response.json();
      })
      .then((value: Data) => {
        setData(value);
        setName(value.actor.name ?? "");
        setZone(value.actor.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(setup ? "/api/onboarding" : "/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", name, timeZone: zone, choice }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (setup) window.location.assign("/japanese/practice");
      else {
        showMessage("Account saved.");
        router.refresh();
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  async function method(provider: string, action: "link" | "unlink") {
    setBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, provider }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === "link") await signIn(provider, { callbackUrl: "/settings/account" });
      else {
        const channel = new BroadcastChannel("dashboard-auth");
        channel.postMessage("changed");
        channel.close();
        window.location.replace("/signin");
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to update sign-in methods.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await signOut({ redirect: false });
      const channel = new BroadcastChannel("dashboard-auth");
      channel.postMessage("changed");
      channel.close();
      window.location.replace("/signin");
    } catch {
      showMessage("Unable to sign out. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        {!hideTitle && (
          <h1 className="text-2xl font-bold">
            {setup ? "Set up Japanese practice" : "My account"}
          </h1>
        )}
        <button
          className="rounded-lg border border-card-border px-3 py-2"
          disabled={busy}
          onClick={logout}
        >
          Sign out
        </button>
      </header>
      {accessDenied && (
        <p role="alert" className="rounded-lg border border-amber-500/40 p-4 text-amber-200">
          This page is not available for your account. Contact the person who invited you if you
          need access.
        </p>
      )}
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading account…</p>}
      {data && (
        <>
          <form className="card space-y-5" onSubmit={save}>
            <label className="block space-y-2">
              Display name
              <input
                className={field}
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block space-y-2">
              Timezone
              <select
                aria-label="Timezone"
                className={field}
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                {[
                  ...new Set([
                    zone,
                    "UTC",
                    ...[
                      "Pacific/Honolulu",
                      "America/Anchorage",
                      "America/Los_Angeles",
                      "America/Denver",
                      "America/Phoenix",
                      "America/Chicago",
                      "America/Toronto",
                      "America/Halifax",
                      "America/St_Johns",
                      "America/Sao_Paulo",
                      "Europe/London",
                      "Europe/Paris",
                      "Africa/Johannesburg",
                      "Africa/Cairo",
                      "Europe/Helsinki",
                      "Asia/Dubai",
                      "Asia/Kolkata",
                      "Asia/Dhaka",
                      "Asia/Bangkok",
                      "Asia/Singapore",
                      "Asia/Tokyo",
                      "Australia/Perth",
                      "Australia/Adelaide",
                      "Australia/Sydney",
                      "Pacific/Auckland",
                    ],
                  ]),
                ]
                  .filter(Boolean)
                  .map((item) => (
                    <option key={item} value={item}>
                      {item.split("/").at(-1)?.replaceAll("_", " ")} (
                      {
                        new Intl.DateTimeFormat("en", {
                          timeZone: item,
                          timeZoneName: "shortOffset",
                        })
                          .formatToParts(new Date())
                          .find((part) => part.type === "timeZoneName")?.value
                      }
                      )
                    </option>
                  ))}
              </select>
            </label>
            {setup && (
              <fieldset className="space-y-3">
                <legend className="mb-2 font-semibold">Your vocabulary</legend>
                <label className="block rounded-lg border border-blue-500/30 p-4">
                  <input
                    type="radio"
                    name="choice"
                    value="PACK"
                    checked={choice === "PACK"}
                    onChange={() => setChoice("PACK")}
                  />{" "}
                  Start with {data.pack?.wordCount ?? 0} starter words
                  <p className="mt-2 text-sm text-muted">
                    Your own editable copy, with fresh progress.
                  </p>
                </label>
                <label className="block rounded-lg border border-card-border p-4">
                  <input
                    type="radio"
                    name="choice"
                    value="EMPTY"
                    checked={choice === "EMPTY"}
                    onChange={() => setChoice("EMPTY")}
                  />{" "}
                  Start with an empty list
                </label>
              </fieldset>
            )}
            <button
              disabled={busy}
              className="rounded-lg border border-blue-500/50 px-4 py-3 disabled:opacity-50"
            >
              {busy ? "Saving…" : setup ? "Start learning" : "Save account"}
            </button>
            {setup && busy && (
              <p role="status">
                Copying your vocabulary. Keep this page open; retrying will not create duplicates.
              </p>
            )}
          </form>
          {!setup && (
            <section className="card space-y-4">
              <h2 className="text-lg font-semibold">Sign-in methods</h2>
              {data.providers.map((provider) => {
                const linked = data.accounts.some((a) => a.provider === provider);
                return (
                  <div key={provider} className="flex items-center justify-between gap-3">
                    <span>
                      {provider === "github" ? "GitHub" : "Google"} {linked && "· Connected"}
                    </span>
                    <button
                      disabled={
                        busy ||
                        (linked && data.accounts.length <= 1) ||
                        (data.actor.role === "OWNER" && provider === "github")
                      }
                      className="rounded-lg border border-card-border px-3 py-2 disabled:opacity-40"
                      onClick={() => method(provider, linked ? "unlink" : "link")}
                    >
                      {linked ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                );
              })}
            </section>
          )}
          <Link className="text-blue-300" href="/privacy">
            Account privacy and deletion requests
          </Link>
        </>
      )}
    </div>
  );
}
