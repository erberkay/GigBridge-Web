/* GigBridge Service Worker — KOD (html/js/css) NETWORK-FIRST, görsel/font CACHE-FIRST.
   - Kod dosyaları HER ZAMAN sunucudan taze çekilir → deploy sonrası eski sürüm TAKILMAZ.
     (Çevrimdışıysa son bilinen sürüm cache'ten sunulur.)
   - Görsel/font: cache'ten anında (hızlı) + arka planda tazele.
   - Yalnız KENDİ origin GET; Firebase/Google/CDN (cross-origin) dokunulmaz.
*/
const CACHE = "gb-runtime-v19";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Kod: navigasyon (HTML) + .js/.css + kök → NETWORK-FIRST (taze; çevrimdışı fallback cache).
  const isCode = event.request.mode === "navigate" || url.pathname === "/" || /\.(?:js|css|html)$/.test(url.pathname);

  event.respondWith(
    caches.open(CACHE).then((cache) => {
      if (isCode) {
        return fetch(event.request, { cache: "reload" })
          .then((res) => { cache.put(event.request, res.clone()).catch(() => {}); return res; })
          .catch(() => cache.match(event.request)); // çevrimdışı: son bilinen sürüm
      }
      // Görsel/font/diğer: CACHE-FIRST (hızlı) + arka planda tazele
      return cache.match(event.request).then((cached) => {
        const fresh = fetch(event.request, { cache: "reload" })
          .then((res) => { cache.put(event.request, res.clone()).catch(() => {}); return res; })
          .catch(() => cached);
        return cached || fresh;
      });
    })
  );
});
