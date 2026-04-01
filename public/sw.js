const CACHE_NAME = "vogeltagebuch-v1";
const OFFLINE_URLS = ["/", "/beobachtungen", "/vogelarten"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nur GET-Requests cachen
  if (request.method !== "GET") return;

  // Supabase-API-Calls nicht cachen
  if (request.url.includes("supabase.co")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Erfolgreiche Antwort cachen
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: aus Cache laden
        return caches.match(request).then(
          (cached) => cached || new Response("Offline", { status: 503 })
        );
      })
  );
});
