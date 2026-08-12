/**
 * Ladha service worker. One file serves both PWA scopes (customer "/" and
 * kitchen "/kitchen/") — its only real job is Web Push: receiving a push
 * event with no page open, showing a native notification, and routing a tap
 * to the right screen. It intentionally does NOT cache the app shell —
 * this is a live-order app, stale menu/order data is worse than a network
 * request, so there's no offline-first tradeoff worth making here.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal offline fallback — navigation requests only. No asset caching
// intentionally: this is a live-order app where stale data is worse than
// a network request. This just replaces the browser's generic "no internet"
// error with a branded Ladha page.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      new Response(
        `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ladha — Offline</title><style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;margin:0;background:#F7FBF8;color:#1F2937;text-align:center;padding:1.5rem}h1{color:#114B36;font-size:1.5rem;font-weight:900;margin:0 0 .5rem}p{color:#6B7280;font-size:.9rem;max-width:280px;line-height:1.6;margin:.25rem 0}button{margin-top:1.5rem;background:#114B36;color:#fff;border:none;border-radius:12px;padding:.75rem 2rem;font-size:.9rem;font-weight:700;cursor:pointer}button:active{background:#0D3D2B}</style></head><body><div style="font-size:2.5rem;margin-bottom:1rem">&#127869;</div><h1>You're offline</h1><p>Ladha needs a network connection to show menus and place orders.</p><p>Check your connection and try again.</p><button onclick="location.reload()">Try again</button></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      )
    )
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Ladha", body: event.data.text() };
  }

  const title = payload.title || "Ladha";
  const options = {
    body: payload.body || "",
    icon: payload.scope === "admin" ? "/ladha_icon_kitchen.png" : "/ladha_icon_customer.png",
    badge: payload.scope === "admin" ? "/ladha_icon_kitchen.png" : "/ladha_icon_customer.png",
    tag: payload.tag,
    // Kitchen alerts (new order) require staff to actually act — keep them
    // on screen until dismissed instead of auto-hiding like a normal toast.
    requireInteraction: payload.scope === "admin",
    data: { url: payload.url || (payload.scope === "admin" ? "/kitchen/orders" : "/") },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && "focus" in client) return client.focus();
      }
      for (const client of clientList) {
        if ("navigate" in client && "focus" in client) return client.focus().then(() => client.navigate(targetUrl));
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
