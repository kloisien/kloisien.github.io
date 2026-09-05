/* Long Box service worker - build 2026-09-04.28
   The page itself is fetched network-first so that uploading a new build takes
   effect on the next load. Only assets and cover images are cache-first. */
const SHELL = "longbox-shell-2026-09-04-28";
const IMGS  = "longbox-imgs-v1";
const ASSETS = ["./manifest.json","./icon-180.png","./icon-192.png","./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(ASSETS.concat(["./","./index.html"])))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== IMGS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // never touch the live data source or the lookup APIs
  if (url.hostname.includes("googleapis.com") ||
      url.hostname.includes("openlibrary.org") ||
      url.hostname.includes("docs.google.com")) return;

  // the page: network first, fall back to cache when offline
  const isDoc = req.mode === "navigate" || req.destination === "document" ||
                url.pathname.endsWith("/") || url.pathname.endsWith("index.html");
  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // cover images: cache first, fill in the background
  if (req.destination === "image") {
    e.respondWith(
      caches.open(IMGS).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") c.put(req, res.clone());
          return res;
        } catch (err) { return hit || Response.error(); }
      })
    );
    return;
  }

  // everything else: cache first
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
