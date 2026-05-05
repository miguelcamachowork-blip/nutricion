// Stub service worker.
// The app never registered one, but iPads / browsers that visited an earlier
// version may still have a stale SW (or other code) requesting this URL,
// producing 404s in the network panel. Serving an empty SW that
// auto-unregisters guarantees a clean state.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          // Force a reload so the page no longer reports a controlling SW.
          client.navigate(client.url).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    })(),
  );
});
