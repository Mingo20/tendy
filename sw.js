// Tendy — Service Worker: red primero para documentos/estilos (actualizaciones
// inmediatas), caché como respaldo sin conexión. Íconos cache-first.
const CACHE = "tendy-v2";
const SHELL = ["./", "./index.html", "./css/styles.css", "./js/app.js", "./manifest.webmanifest"];
const PREFETCH = ["./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([...SHELL, ...PREFETCH]))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.includes("/functions/")) return;
  const isStatic = /\.(png|ico|woff2?|webmanifest)$/.test(url.pathname);
  e.respondWith(
    (async () => {
      if (isStatic) {
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        const res = await fetch(e.request);
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }
      // documentos, estilos y scripts: red primero, caché de respaldo
      try {
        const res = await fetch(e.request);
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      } catch {
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        throw new Error("sin conexión");
      }
    })()
  );
});
