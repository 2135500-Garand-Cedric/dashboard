/* Push-only service worker: never cache authenticated pages, APIs or uploads. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function notificationUrl(value) {
  try {
    const url = new URL(value || "/settings", self.location.origin);
    if (
      url.origin === self.location.origin &&
      /^\/(settings|events\/\d+|todos\/\d+|projects\/\d+|notifications(?:\/[a-f0-9-]{36})?)$/.test(
        url.pathname,
      )
    )
      return url.href;
  } catch {
    // Untrusted URLs never leave this origin.
  }
  return new URL("/settings", self.location.origin).href;
}
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    // Every received push must display a visible notification on iOS.
  }
  event.waitUntil(
    self.registration.showNotification(
      typeof data.title === "string" ? data.title.slice(0, 150) : "Dashboard reminder",
      {
        body:
          typeof data.body === "string"
            ? data.body.slice(0, 300)
            : "Open Dashboard to view your reminder.",
        icon: "/icons/dashboard-192.png",
        tag: typeof data.tag === "string" ? data.tag.slice(0, 100) : "dashboard-reminder",
        renotify: false,
        data: { url: notificationUrl(data.url) },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(notificationUrl(event.notification.data?.url));
  const destination = new URL("/notifications/open", self.location.origin);
  destination.searchParams.set("target", target.pathname);
  const url = destination.href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "navigate" in client) {
          const navigated = await client.navigate(url);
          if (navigated) return navigated.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
