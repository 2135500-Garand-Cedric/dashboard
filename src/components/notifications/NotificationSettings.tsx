"use client";
import { useEffect, useState } from "react";
import {
  BellIcon,
  ArrowPathIcon,
  DevicePhoneMobileIcon,
  PaperAirplaneIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { registerDashboardWorker } from "./PwaRegistration";
import { useSettings } from "@/context/SettingsContext";

type Preferences = {
  enabled: boolean;
  events: boolean;
  sessions: boolean;
  deadlines: boolean;
  followUps: boolean;
  milestones: boolean;
  showDetails: boolean;
  leadMinutes: number;
  dateOnlyTime: string;
};
type Device = {
  id: string;
  label: string;
  endpointHash: string;
  lastSuccessAt: string | null;
  keyChanged: boolean;
};
type Overview = {
  configured: boolean;
  publicKey: string | null;
  settings: Preferences;
  worker: { lastSeenAt: string | null; errorCode: string | null };
  devices: Device[];
};
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const input = "mt-1 w-full rounded-lg border border-card-border bg-card-bg p-2 text-foreground";
const options = [
  [0, "At the scheduled time"],
  [5, "5 minutes before"],
  [15, "15 minutes before"],
  [30, "30 minutes before"],
  [60, "1 hour before"],
  [1440, "1 day before"],
  [10080, "1 week before"],
] as const;
async function request<T>(path = "", method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/notifications${path}`, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to update notifications. Try again.");
  return result;
}
function publicKeyBytes(value: string) {
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
async function browserDeviceHash() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return "";
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(subscription.endpoint),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export default function NotificationSettings() {
  const { timeZone } = useSettings();
  const [data, setData] = useState<Overview | null>(null),
    [draft, setDraft] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null),
    [needsInstall, setNeedsInstall] = useState(false);
  const [hash, setHash] = useState(""),
    [label, setLabel] = useState("This device"),
    [permission, setPermission] = useState<NotificationPermission>("default");
  async function reload(reset = true) {
    const result = await request<Overview>();
    setData(result);
    if (reset) setDraft(result.settings);
    if (window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window)
      setHash(await browserDeviceHash());
    if ("Notification" in window) setPermission(Notification.permission);
  }
  useEffect(() => {
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && navigator.standalone === true);
    setNeedsInstall(ios && !installed);
    setSupported(
      window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
    );
    setLabel(ios ? "My iPhone / iPad" : "My browser");
    void reload().catch((error) =>
      setError(error instanceof Error ? error.message : "Unable to load notifications."),
    );
  }, []);
  const current = data?.devices.find((device) => device.endpointHash === hash);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update notifications.");
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    if (!data?.publicKey) return;
    // Ask immediately in this click handler; iOS requires a direct user gesture.
    const granted = await Notification.requestPermission();
    setPermission(granted);
    if (granted !== "granted")
      throw new Error(
        "Notifications are blocked. Allow them in your phone or browser notification settings, then try again.",
      );
    const registration = await registerDashboardWorker();
    let subscription = await registration.pushManager.getSubscription();
    const key = publicKeyBytes(data.publicKey);
    if (subscription) {
      const previous = subscription.options.applicationServerKey;
      if (!previous || !key.every((byte, index) => byte === new Uint8Array(previous)[index])) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    await request("/subscriptions", "POST", { ...subscription.toJSON(), label });
    await reload(false);
    setNotice("Notifications enabled on this device.");
  }
  return (
    <section
      aria-label="Phone and notifications"
      className="space-y-5 rounded-xl border border-card-border bg-card-bg p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <BellIcon className="h-5 w-5 text-blue-400" />
          Phone & notifications
        </h2>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void perform(() => reload())}
        >
          <ArrowPathIcon className="h-4 w-4" />
          Reload
        </button>
      </header>
      <p>
        On iPhone: open this dashboard in Safari, choose Share → Add to Home Screen, then open its
        icon and enable notifications here.
      </p>
      {needsInstall && (
        <p role="status" className="rounded-lg border border-blue-400/30 p-3">
          Open the installed Home Screen app to enable iPhone notifications.
        </p>
      )}
      {supported === false && (
        <p role="status">
          This browser cannot register for push here. Use the installed iPhone app over HTTPS, or a
          supported desktop browser.
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-rose-500">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-500">
          {notice}
        </p>
      )}
      {!data || !draft ? (
        <p role="status">Loading notification settings…</p>
      ) : (
        <>
          {!data.configured && (
            <p role="status" className="rounded-lg border border-amber-400/30 p-3">
              Server setup is required: configure the Web Push keys and start the notification
              worker. See the notification deployment instructions in the README.
            </p>
          )}
          {data.configured &&
            (!data.worker.lastSeenAt ||
              Date.now() - Date.parse(data.worker.lastSeenAt) > 300000) && (
              <p role="alert" className="rounded-lg border border-amber-400/30 p-3">
                The reminder worker has not checked in recently. Scheduled reminders need the
                notification-worker container running.
              </p>
            )}
          {data.configured && data.worker.errorCode && (
            <p role="alert" className="text-amber-500">
              The worker cannot send notifications. Check that its push configuration matches the
              dashboard.
            </p>
          )}
          {permission === "denied" && (
            <p>
              Notifications are blocked for this app. Change its permission in your device or
              browser settings.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm">
              Device name
              <input
                className={input}
                maxLength={80}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${button} border-blue-400/40`}
              disabled={busy || !data.configured || !supported || needsInstall || !label.trim()}
              onClick={() => void perform(enable)}
            >
              <DevicePhoneMobileIcon className="h-4 w-4 text-blue-400" />
              {current && !current.keyChanged ? "Refresh this device" : "Enable on this device"}
            </button>
            <button
              type="button"
              className={`${button} border-emerald-400/40`}
              disabled={busy || !current || current.keyChanged || permission !== "granted"}
              onClick={() =>
                void perform(async () => {
                  await request("/test", "POST", { id: current!.id });
                  setNotice("Test notification accepted by the push service. Check this device.");
                })
              }
            >
              <PaperAirplaneIcon className="h-4 w-4 text-emerald-400" />
              Send test notification
            </button>
          </div>
          <form
            className="space-y-4 border-t border-card-border pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                const saved = await request<Overview>("", "PATCH", draft);
                setData(saved);
                setDraft(saved.settings);
                setNotice("Notification preferences saved.");
              });
            }}
          >
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              Send calendar reminders
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["events", "Events"],
                  ["sessions", "Work sessions"],
                  ["deadlines", "Task deadlines"],
                  ["followUps", "Task follow-ups"],
                  ["milestones", "Project milestones"],
                  ["showDetails", "Show titles on the lock screen"],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })}
                  />
                  {text}
                </label>
              ))}
              <label className="text-sm">
                Default reminder for timed items
                <select
                  className={input}
                  value={draft.leadMinutes}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, leadMinutes: Number(event.target.value) })
                  }
                >
                  {options.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Time for date-only items
                <input
                  className={input}
                  type="time"
                  required
                  value={draft.dateOnlyTime}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, dateOnlyTime: event.target.value })}
                />
              </label>
            </div>
            <button className={`${button} border-blue-400/40`} disabled={busy}>
              Save notification preferences
            </button>
          </form>
          <div className="space-y-3 border-t border-card-border pt-5">
            <h3 className="font-semibold">Registered devices</h3>
            {!data.devices.length ? (
              <p>No devices enabled yet.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.devices.map((device) => (
                  <li
                    key={device.id}
                    className="min-w-0 space-y-2 rounded-lg border border-card-border p-3"
                  >
                    <p className="break-words font-medium">
                      {device.label}
                      {device.id === current?.id ? " · This device" : ""}
                    </p>
                    {device.keyChanged && (
                      <p className="text-sm text-amber-500">
                        Enable this device again to update its registration.
                      </p>
                    )}
                    <p className="text-sm">
                      {device.lastSuccessAt
                        ? `Last accepted: ${new Date(device.lastSuccessAt).toLocaleString(undefined, { timeZone })}`
                        : "No notification sent yet"}
                    </p>
                    <button
                      type="button"
                      className={`${button} border-rose-400/40`}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Disable notifications for ${device.label}?`))
                          void perform(async () => {
                            await request("/subscriptions", "DELETE", { id: device.id });
                            if (device.id === current?.id) {
                              const registration =
                                await navigator.serviceWorker.getRegistration("/");
                              await (
                                await registration?.pushManager.getSubscription()
                              )?.unsubscribe();
                            }
                            await reload(false);
                            setNotice("Device notifications disabled.");
                          });
                      }}
                    >
                      <TrashIcon className="h-4 w-4 text-rose-400" />
                      Disable device
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
