/* GigBridge Service Worker — KOD (html/js/css) NETWORK-FIRST, görsel/font CACHE-FIRST.
   - Kod dosyaları HER ZAMAN sunucudan taze çekilir → deploy sonrası eski sürüm TAKILMAZ.
     Ağ isteği düşerse bir kez daha denenir (HTTP önbelleğine izin vererek); o da düşerse son bilinen sürüm (cache) sunulur,
     o da yoksa açık bir ağ hatası döner (undefined yanıt → "Failed to fetch dynamically imported module" yerine).
   - Yalnız başarılı (2xx) yanıtlar önbelleğe yazılır (404/500 çevrimdışı yedeğe girmez); ?r= önbellek kıran tekrarlar yazılmaz.
   - Görsel/font: cache'ten anında (hızlı) + arka planda tazele.
   - Yalnız KENDİ origin GET; Firebase/Google/CDN (cross-origin) dokunulmaz.
   - CACHE sürümü her SW değişikliğinde artar → activate eski önbellekleri siler.
*/
const CACHE = "gb-runtime-v21";

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
  const cacheable = (res) => res && res.ok && res.type === "basic" && !url.searchParams.has("r");

  event.respondWith(
    caches.open(CACHE).then((cache) => {
      if (isCode) {
        return fetch(event.request, { cache: "reload" })
          .catch(() => fetch(event.request))                       // geçici ağ hatası → bir kez daha
          .then((res) => { if (cacheable(res)) cache.put(event.request, res.clone()).catch(() => {}); return res; })
          .catch(() => cache.match(event.request).then((c) => c || Response.error())); // çevrimdışı: son bilinen sürüm
      }
      // Görsel/font/diğer: CACHE-FIRST (hızlı) + arka planda tazele
      return cache.match(event.request).then((cached) => {
        const fresh = fetch(event.request, { cache: "reload" })
          .then((res) => { if (cacheable(res)) cache.put(event.request, res.clone()).catch(() => {}); return res; })
          .catch(() => cached || Response.error());
        return cached || fresh;
      });
    })
  );
});
