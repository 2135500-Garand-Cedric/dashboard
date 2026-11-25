"use client";

import { useEffect, useState } from "react";
import { EnvelopeIcon, CheckIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useSnackbar } from "@/context/SnackbarContext";

type Preferences = { enabled: boolean; recipient: string; revision: number; configured: boolean };
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-card-border px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50";

export default function EmailSettings() {
  const [settings, setSettings] = useState<Preferences | null>(null);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { showMessage } = useSnackbar();
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void fetch("/api/settings/email", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load email settings.");
        if (!controller.signal.aborted) {
          setSettings(data);
          setRecipient(data.recipient);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(failure.message || "Unable to load email settings.");
      });
    return () => controller.abort();
  }, [retry]);

  async function save(enabled: boolean, address: string) {
    if (!settings || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/settings/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, recipient: address, revision: settings.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save email settings.");
      setSettings(data);
      setRecipient(data.recipient);
      showMessage(
        enabled ? "Email settings saved." : "Emails are disabled. Pending sends are canceled.",
      );
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Unable to save email settings.";
      setError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Email preferences"
      className="max-w-2xl space-y-5 rounded-xl border border-card-border bg-card-bg p-5 sm:p-6"
    >
      <header className="flex items-center gap-3">
        <EnvelopeIcon className="h-6 w-6 text-sky-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Dashboard emails</h2>
      </header>
      {error && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-rose-400">{error}</p>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => setRetry((value) => value + 1)}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reload settings
          </button>
        </div>
      )}
      {!settings ? (
        !error && <p role="status">Loading email settings…</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-card-border p-4">
            <div>
              <p className="font-medium">Allow emails</p>
              <span className={`text-sm ${settings.enabled ? "text-emerald-400" : "text-muted"}`}>
                {settings.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Allow dashboard emails"
              aria-checked={settings.enabled}
              disabled={busy}
              onClick={() =>
                save(!settings.enabled, settings.enabled ? settings.recipient : recipient)
              }
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${settings.enabled ? "bg-emerald-600" : "bg-slate-600"}`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${settings.enabled ? "left-6" : "left-1"}`}
              />
            </button>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(settings.enabled, recipient);
            }}
          >
            <label className="block space-y-2 text-sm">
              <span>Send emails to</span>
              <input
                type="email"
                aria-label="Email recipient"
                autoComplete="email"
                maxLength={254}
                value={recipient}
                disabled={busy}
                onChange={(event) => setRecipient(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-card-border bg-background px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className={`${button} border-sky-500/50`}
              disabled={busy || recipient === settings.recipient}
            >
              <CheckIcon className="h-4 w-4 text-sky-400" />
              {busy ? "Saving…" : "Save recipient"}
            </button>
          </form>
          {!settings.configured && (
            <p className="text-sm text-amber-400">Email delivery is unavailable on this server.</p>
          )}
        </>
      )}
    </section>
  );
}
