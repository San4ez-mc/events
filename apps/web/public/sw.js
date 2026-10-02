/*
 * Minimal service worker. It exists so browsers treat the site as an installable app (Android Chrome requires one) and
 * so web-push can be added later. It deliberately does NOT cache anything: events change constantly and a stale cached
 * page is worse than a loading spinner. Network only.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Intentionally empty: let the browser handle every request normally.
});

// Ready for web push (iOS 16.4+ for installed apps): shows the notification and opens its link on tap.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON — ignore.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Кіро", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(url));
});
