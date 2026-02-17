/* iPad Visitor Log PWA Service Worker (fixed)
   - App-shell caching for offline use
   - Network-first for HTML (so updates apply), cache-first for assets
   - iOS/Safari-friendly absolute-path fallbacks
   - Install diagnostics: logs which APP_SHELL item fails (prevents silent no-offline)
*/

const CACHE_VERSION = "v1.0.2";
const CACHE_NAME = `visitor-log-${CACHE_VERSION}`;

/**
 * IMPORTANT:
 * - Prefer absolute paths ("/index.html") for consistent matching on iOS/Safari.
 * - These paths assume your app is hosted at the site root.
 *   If your app lives in a subfolder (e.g. /visitorlog/), see note at bottom.
 */
const APP_SHELL = [
  "/",              // root
  "/index.html",    // welcome/start page
  "/app.html",      // main visitor log app
  "/manifest.json",

  // Logos / icons
  "/CSELogo.png",
  "/logo.png",
  "/logo-192.png",
  "/logo-512.png",
  "/logo-maskable-512.png"
];

// Install: cache core files (with diagnostics)
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Use add() individually so one missing file doesn't silently fail without telling you which.
    const results = await Promise.allSettled(APP_SHELL.map((p) => cache.add(p)));

    const failed = results
      .map((r, i) => ({ status: r.status, reason: r.status === "rejected" ? String(r.reason) : null, path: APP_SHELL[i] }))
      .filter((x) => x.status === "rejected");

    if (failed.length) {
      // This shows up in DevTools / Safari Web Inspector console.
      console.error("Service worker install failed. Uncacheable APP_SHELL items:", failed);
      // Throw to ensure SW does NOT install partially (better than thinking offline works when it doesn't).
      throw new Error("SW install failed: one or more APP_SHELL items could not be fetched.");
    }

    await self.skipWaiting();
  })());
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("visitor-log-") && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );

    await self.clients.claim();
  })());
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only same-origin (avoid caching 3rd party)
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";

  const isHTML =
    req.mode === "navigate" ||
    accept.includes("text/html") ||
    url.pathname.endsWith(".html");

  if (isHTML) {
    // Network-first for HTML so updates apply when online
    event.respondWith(networkFirstHTML(req));
  } else {
    // Cache-first for assets (fast + offline)
    event.respondWith(cacheFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);

  // Ignore search params for same file (optional but helps with cache hits)
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;

  const res = await fetch(req);
  if (res && res.ok) {
    cache.put(req, res.clone());
  }
  return res;
}

async function networkFirstHTML(req) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // Offline: try cached version of the requested page (ignore querystring)
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    // Offline navigation fallback: prefer app.html, then index.html
    const fallbackApp = await cache.match("/app.html");
    if (fallbackApp) return fallbackApp;

    const fallbackIndex = await cache.match("/index.html");
    if (fallbackIndex) return fallbackIndex;

    // Last resort: root
    const fallbackRoot = await cache.match("/");
    if (fallbackRoot) return fallbackRoot;

    throw err;
  }
}

/**
 * If your app is hosted in a subfolder like:
 *   https://example.com/visitorlog/index.html
 * then you MUST change APP_SHELL to include that base path, e.g.:
 *   const BASE = "/visitorlog";
 *   `${BASE}/index.html`, etc.
 * and your manifest scope/start_url should match that folder.
 */
