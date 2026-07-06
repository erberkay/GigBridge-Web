/* GigBridge Service Worker — network-first.
   Amaç: her deploy'da kendi JS/CSS/HTML'imiz OTOMATİK taze gelsin (cache takılması bitsin).
   - Sadece KENDİ origin'imizdeki GET istekleri yakalanır (Firebase/Google/CDN/fontlar cross-origin → dokunulmaz).
   - Her istek sunucudan taze çekilir (cache: 'no-store' → tarayıcı HTTP cache'i baypas edilir).
   - Ağ yoksa (offline) son bilinen sürüm cache'ten sunulur.
*/
const CACHE = "gb-runtime-v1";

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
  // Yalnız kendi origin + GET (POST, cross-origin API/auth/font'lara karışma)
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        // Taze cevabı offline yedeği olarak sakla
        const copy = response.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request)) // offline → son sürüm
  );
});
