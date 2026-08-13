// Kitchen-only worker. Its /kitchen/ scope keeps the installed operations app
// separate from the customer PWA even when both are installed from Chrome.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }
  event.waitUntil(self.registration.showNotification(payload.title || "Kitchen Alert", {
    body: payload.body || "", icon: "/ladha_icon_kitchen.png", badge: "/ladha_icon_kitchen.png",
    tag: payload.tag || "ladha-kitchen-notification", renotify: true, requireInteraction: true,
    data: { url: payload.url || "/kitchen/orders" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/kitchen/orders";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).pathname.startsWith("/kitchen/"));
    return existing && "focus" in existing ? existing.focus().then(() => existing.navigate(targetUrl)) : self.clients.openWindow(targetUrl);
  }));
});
