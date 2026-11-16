"use client";
import { useEffect } from "react";
export async function registerDashboardWorker() {
  if (!window.isSecureContext || !("serviceWorker" in navigator))
    throw new Error("Notifications require HTTPS and a supported browser.");
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  if (!registration.active) await navigator.serviceWorker.ready;
  return registration;
}
export default function PwaRegistration() {
  useEffect(() => {
    if (window.isSecureContext && "serviceWorker" in navigator)
      void registerDashboardWorker().catch(() => {
        // Settings provides an actionable retry; ordinary navigation stays usable.
      });
  }, []);
  return null;
}
