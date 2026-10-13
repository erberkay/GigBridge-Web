// ŞEHİR — 81 il merkezi koordinatı + en yakın il + sanatçı yoğunluğuna göre şehir sıralaması (Sanatçı Bul ŞEHİR filtresi).
// İÇE AKTARMA YOK (saf modül): masaüstü (venue/sanatci-bul.js) ve legacy mobil (pages/venue.js renderArtists) ortak kullanır.
// Konum: navigator.geolocation → en yakın il MERKEZİ (dış servis / ters coğrafi kodlama YOK). İzin yok / hata → sessizce null.
// Oturum belleği (sessionStorage; erişilemezse sessizce yok sayılır): bulunan il (tekrar sormamak için) + "ilk ziyaret ön seçimi
// yapıldı" bayrağı (kullanıcı "Tüm Şehirler"e döndüyse aynı oturumda yeniden konum şehrine zorlanmaz).

// [il, enlem, boylam] — il merkezleri (yaklaşık, 2 ondalık). Adlar helpers.PROVINCES ile birebir aynı yazım.
export const PROVINCE_CENTERS = [
  ["Adana", 37.00, 35.32], ["Adıyaman", 37.76, 38.28], ["Afyonkarahisar", 38.76, 30.54], ["Ağrı", 39.72, 43.05],
  ["Aksaray", 38.37, 34.03], ["Amasya", 40.65, 35.83], ["Ankara", 39.93, 32.86], ["Antalya", 36.89, 30.71],
  ["Ardahan", 41.11, 42.70], ["Artvin", 41.18, 41.82], ["Aydın", 37.85, 27.84], ["Balıkesir", 39.65, 27.88],
  ["Bartın", 41.64, 32.34], ["Batman", 37.88, 41.13], ["Bayburt", 40.26, 40.23], ["Bilecik", 40.14, 29.98],
  ["Bingöl", 38.88, 40.50], ["Bitlis", 38.40, 42.11], ["Bolu", 40.74, 31.61], ["Burdur", 37.72, 30.29],
  ["Bursa", 40.19, 29.06], ["Çanakkale", 40.15, 26.41], ["Çankırı", 40.60, 33.62], ["Çorum", 40.55, 34.95],
  ["Denizli", 37.78, 29.09], ["Diyarbakır", 37.91, 40.24], ["Düzce", 40.84, 31.16], ["Edirne", 41.68, 26.56],
  ["Elazığ", 38.67, 39.22], ["Erzincan", 39.75, 39.49], ["Erzurum", 39.90, 41.27], ["Eskişehir", 39.78, 30.52],
  ["Gaziantep", 37.07, 37.38], ["Giresun", 40.91, 38.39], ["Gümüşhane", 40.46, 39.48], ["Hakkari", 37.58, 43.74],
  ["Hatay", 36.20, 36.16], ["Iğdır", 39.92, 44.04], ["Isparta", 37.76, 30.55], ["İstanbul", 41.01, 28.98],
  ["İzmir", 38.42, 27.14], ["Kahramanmaraş", 37.58, 36.94], ["Karabük", 41.20, 32.62], ["Karaman", 37.18, 33.22],
  ["Kars", 40.60, 43.10], ["Kastamonu", 41.38, 33.78], ["Kayseri", 38.73, 35.48], ["Kilis", 36.72, 37.12],
  ["Kırıkkale", 39.85, 33.51], ["Kırklareli", 41.73, 27.22], ["Kırşehir", 39.15, 34.16], ["Kocaeli", 40.77, 29.92],
  ["Konya", 37.87, 32.48], ["Kütahya", 39.42, 29.98], ["Malatya", 38.35, 38.31], ["Manisa", 38.61, 27.43],
  ["Mardin", 37.31, 40.74], ["Mersin", 36.81, 34.64], ["Muğla", 37.22, 28.36], ["Muş", 38.75, 41.51],
  ["Nevşehir", 38.62, 34.71], ["Niğde", 37.97, 34.68], ["Ordu", 40.98, 37.88], ["Osmaniye", 37.07, 36.25],
  ["Rize", 41.02, 40.52], ["Sakarya", 40.78, 30.40], ["Samsun", 41.29, 36.33], ["Siirt", 37.93, 41.94],
  ["Sinop", 42.03, 35.15], ["Sivas", 39.75, 37.02], ["Şanlıurfa", 37.16, 38.79], ["Şırnak", 37.52, 42.46],
  ["Tekirdağ", 40.98, 27.51], ["Tokat", 40.31, 36.55], ["Trabzon", 41.00, 39.72], ["Tunceli", 39.11, 39.55],
  ["Uşak", 38.68, 29.41], ["Van", 38.49, 43.38], ["Yalova", 40.66, 29.27], ["Yozgat", 39.82, 34.81],
  ["Zonguldak", 41.45, 31.79],
];
export const PROVINCE_NAMES = PROVINCE_CENTERS.map((p) => p[0]);

// Türkçe katlama (helpers.fold / data.foldTR ile aynı eşleme): "İZMİR" ≡ "izmir" ≡ "Izmir"
const TRX = { "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u", "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u" };
export const foldTR = (s) => String(s ?? "").replace(/[ıİşŞçÇğĞöÖüÜâÂîÎûÛ]/g, (c) => TRX[c] || c).toLowerCase().trim();
const BY_FOLD = new Map(PROVINCE_NAMES.map((n) => [foldTR(n), n]));

/** Serbest şehir metni → il adı ("izmir", "İzmir (Kuşadası)", "Istanbul / Kadıköy" → resmî yazım); il değilse null. */
export function canonicalProvince(s) {
  const f = foldTR(String(s ?? "").split(/[(/,]/)[0]);
  return BY_FOLD.get(f) || null;
}

/** En yakın il merkezi (küçük mesafede eşdikdörtgen yaklaşımı yeterli). */
export function nearestProvince(lat, lng) {
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const k = Math.cos((la * Math.PI) / 180);
  let best = null, bd = Infinity;
  for (const [n, a, b] of PROVINCE_CENTERS) {
    const dy = a - la, dx = (b - lo) * k, d = dy * dy + dx * dx;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** İl araması (Türkçe duyarsız): önce adın başıyla eşleşenler, sonra içinde geçenler (tr sıralı). */
export function searchProvinces(q, limit = 8) {
  const f = foldTR(q);
  if (!f) return [];
  const starts = [], inner = [];
  PROVINCE_NAMES.forEach((n) => { const x = foldTR(n); if (x.startsWith(f)) starts.push(n); else if (x.includes(f)) inner.push(n); });
  return [...starts, ...inner].slice(0, limit);
}

/** Şehir sıralaması: [{ name, n, f }] — n = o şehirdeki sanatçı/grup sayısı, eşitlikte toplam takipçi (f), sonra ad.
 *  Şehir adı il ise resmî yazıma çevrilir (aynı il farklı yazımlarla bölünmesin); il değilse metin aynen kalır.
 *  withService: sanatçı hizmet şehirlerinde (serviceCities) de sayılır — masaüstü süzgeci (data.servesCity) ile aynı kapsam. */
export function rankCities(items, { withService = false } = {}) {
  const m = new Map();
  (items || []).forEach((x) => {
    const raws = [x?.city, ...(withService && Array.isArray(x?.serviceCities) ? x.serviceCities : [])];
    const seen = new Set();
    raws.forEach((v) => {
      const raw = String(v || "").trim();
      if (!raw) return;
      const name = canonicalProvince(raw) || raw;
      const key = foldTR(name);
      if (seen.has(key)) return;
      seen.add(key);
      const r = m.get(key) || { name, n: 0, f: 0 };
      r.n += 1; r.f += Number(x.followerCount) || 0;
      m.set(key, r);
    });
  });
  return [...m.values()].sort((a, b) => (b.n - a.n) || (b.f - a.f) || a.name.localeCompare(b.name, "tr"));
}
/** Şehir → sayı (arama sonuçlarında rozet) */
export function cityCountMap(items, opts) {
  const out = new Map();
  rankCities(items, opts).forEach((r) => out.set(foldTR(r.name), r.n));
  return out;
}

// ── Konum (oturum belleği) ──
const K_CITY = "gb_artist_geo_city", K_DONE = "gb_artist_geo_preselect";
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
};
export const cachedGeoProvince = () => { const c = ss.get(K_CITY); return c && BY_FOLD.has(foldTR(c)) ? c : null; };
/** Bu oturumda konum şehri ön seçimi yapılmadıysa true döner ve işaretler (yalnız bir kez). */
export function takeGeoPreselect() { if (ss.get(K_DONE) === "1") return false; ss.set(K_DONE, "1"); return true; }
/** Kullanıcı şehri kendisi seçtiyse (ya da paylaşılan ?sehir= ile geldiyse) ön seçim artık yapılmaz. */
export const skipGeoPreselect = () => ss.set(K_DONE, "1");

let _pending = null;
/** Tarayıcı konumundan en yakın il. İzin reddi / destek yok / zaman aşımı → sessizce null (toast YOK). */
export function locateProvince() {
  const cached = cachedGeoProvince();
  if (cached) return Promise.resolve(cached);
  if (_pending) return _pending;
  const run = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.geolocation) return null;
      try {
        const st = await navigator.permissions?.query?.({ name: "geolocation" });
        if (st && st.state === "denied") return null;
      } catch (_) {}
      const pos = await new Promise((res) => {
        try { navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 10000, maximumAge: 10 * 60e3, enableHighAccuracy: false }); }
        catch (_) { res(null); }
      });
      const c = pos ? nearestProvince(pos.coords?.latitude, pos.coords?.longitude) : null;
      if (c) ss.set(K_CITY, c);
      return c;
    } catch (_) { return null; }
  };
  _pending = run().finally(() => { _pending = null; });
  return _pending;
}
