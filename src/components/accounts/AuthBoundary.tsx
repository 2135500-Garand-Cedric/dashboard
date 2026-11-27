"use client";
import { useEffect, useState } from "react";
export default function AuthBoundary({
  children,
  userId,
  sessionId,
}: {
  children: React.ReactNode;
  userId: number;
  sessionId?: string;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const channel = new BroadcastChannel("dashboard-auth");
    let controller: AbortController | null = null;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      setVisible(false);
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/account", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          window.location.replace("/signin");
          return;
        }
        const data = await response.json();
        if (data.actor.id !== userId || data.actor.sessionId !== sessionId) {
          window.location.replace("/");
          return;
        }
        setVisible(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setVisible(false);
      }
    };
    const changed = () => {
      setVisible(false);
      window.location.replace("/signin");
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setVisible(false);
        window.location.reload();
      }
    };
    channel.onmessage = changed;
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", restore);
    return () => {
      controller?.abort();
      channel.close();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", restore);
    };
  }, [userId, sessionId]);
  return (
    <>
      <div style={{ visibility: visible ? "visible" : "hidden" }} aria-hidden={!visible}>
        {children}
      </div>
      {!visible && (
        <p role="status" className="fixed inset-x-0 top-8 z-50 bg-card-bg p-6">
          Checking your session… <button onClick={() => window.location.reload()}>Reload</button>
        </p>
      )}
    </>
  );
}
