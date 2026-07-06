/* GigBridge Service Worker — stale-while-revalidate (hız + otomatik güncelleme).
   - Cache'ten ANINDA sunar (hızlı açılış) + arka planda sunucudan taze çekip cache'i günceller.
   - Deploy sonrası: ilk açılış cache'ten (hızlı, eski olabilir), arka planda yeni indirilir →
     BİR SONRAKİ açılış güncel. (Hemen görmek istersen tek hard-refresh yeter.)
   - Yalnız KENDİ origin GET istekleri; Firebase/Google/CDN/font (cross-origin) dokunulmaz.
   - Offline: son bilinen sürüm cache'ten sunulur.
*/
const CACHE = "gb-runtime-v12";

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

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        // Arka planda taze çek (cache: 'reload' → sunucuya git, HTTP cache'i baypas et) + cache'i güncelle
        const fresh = fetch(event.request, { cache: "reload" })
          .then((res) => { cache.put(event.request, res.clone()).catch(() => {}); return res; })
          .catch(() => cached);
        // Cache varsa ANINDA dön (hızlı); yoksa (ilk ziyaret) network'ü bekle
        return cached || fresh;
      })
    )
  );
});
