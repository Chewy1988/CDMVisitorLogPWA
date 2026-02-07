const CACHE_NAME = "ipadlogin-cache-v1";
const FILES_TO_CACHE = [
  "/",                 // Root
  "/index.html",       // Main page
  "/manifest.json",    // PWA manifest
  "/logo.png",         // Logo
  "/service-worker.js" // This file itself
];

// --- Install: cache files ---
self.addEventListener("install", event => {
  console.log("[Service Worker] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("[Service Worker] Caching app shell");
        return cache.addAll(FILES_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// --- Activate: clean up old caches ---
self.addEventListener("activate", event => {
  console.log("[Service Worker] Activating...");
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// --- Fetch: respond with cached resources when offline ---
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) return response;
        // Otherwise, fetch from network
        return fetch(event.request).catch(() => {
          // Optional fallback for HTML pages
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
      })
  );
});
