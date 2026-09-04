/* Long Box service worker.
   Cache-first for the app shell so it opens offline. Cover images are
   cached opportunistically as you scroll past them. */
const SHELL = "longbox-shell-v8";
const IMGS  = "longbox-imgs-v1";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== IMGS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // never cache the live data source or the lookup APIs
  if (url.hostname.includes("googleapis.com") ||
      url.hostname.includes("openlibrary.org") && url.pathname.endsWith("search.json") ||
      url.hostname.includes("docs.google.com")) {
    return;
  }

  // cover images: serve from cache, fill the cache in the background
  if (req.destination === "image") {
    e.respondWith(
      caches.open(IMGS).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") c.put(req, res.clone());
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // app shell: cache first, network as a fallback
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
