// Masaüstü görünümleri için ortak, SAF yardımcılar (DOM/Firebase yazımı yok).
// Legacy modüllerdeki kopyaların (customer/artist/venue/organizer) TEK masaüstü kaynağı.
// Sahibi: foundation (adım 1). Değişiklik gerekiyorsa geriye uyumlu ekle (başka görünümler kullanıyor).
import { eventStartMs as _eventStartMs, eventEndMs as _eventEndMs, isEventOver as _isEventOver } from "../../data.js";

// ══════════ Şehirler ══════════
// 81 il — RN app (src/data/locations.ts) ile aynı yazım ("Hakkari"). Karşılaştırmada daima fold() kullan
// (legacy customer.js "Hakkâri" yazar; fold ikisini eşitler).
export const PROVINCES = ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis", "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa", "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak"];
export const ALL_CITIES = "TÜMÜ";            // şehir seçici "hepsi" değeri (legacy ile aynı)
export const CITY_KEY = "gb_city";           // localStorage anahtarı — legacy Keşfet ile ORTAK
export function getActiveCity() { try { return localStorage.getItem(CITY_KEY) || ALL_CITIES; } catch { return ALL_CITIES; } }
export function setActiveCity(c) { try { localStorage.setItem(CITY_KEY, c || ALL_CITIES); } catch {} }
export const sameCity = (a, b) => fold(a) === fold(b);

// ══════════ Türkçe metin ══════════
const TRX = { "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u", "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u" };
// Aksansız + küçük harf (arama/karşılaştırma anahtarı): "İstanbul" → "istanbul", "Hakkâri" → "hakkari"
export const fold = (s) => String(s ?? "").replace(/[ıİşŞçÇğĞöÖüÜâÂîÎûÛ]/g, (c) => TRX[c] || c).toLowerCase().trim();
export const trLower = (s) => String(s ?? "").toLocaleLowerCase("tr-TR");
export const trUpper = (s) => String(s ?? "").toLocaleUpperCase("tr-TR");
// Arama: tüm kelimeler (fold) metinde geçiyor mu. matchText("İst jazz", ev.title, ev.venueName)
export function matchText(q, ...fields) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}
export const sortTR = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "tr");
export function initials(name, n = 1) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return trUpper(parts.slice(0, n).map((p) => p[0]).join(""));
}

// ══════════ Sayı / para ══════════
const NF = new Intl.NumberFormat("tr-TR");
export const fmtInt = (n) => NF.format(Math.round(Number(n) || 0));                  // 12345 → "12.345"
// ₺ biçimi (legacy ui.fmtTL ile aynı): 1234 → "₺1.234"; 0/boş → free ya da "—"
export function fmtTL(n, { free = null, empty = "—" } = {}) {
  const x = Number(n);
  if (isFinite(x) && x > 0) return "₺" + NF.format(Math.round(x));
  if (free != null && (x === 0 || n === 0 || n === "0")) return free;
  return empty;
}
// Bilet fiyatı (legacy ile aynı): ticketPrice boş/0 → "Ücretsiz" (Keşfet kartlarında upper:true → "ÜCRETSİZ")
export const isFree = (n) => !(Number(n) > 0);
export const fmtPrice = (n, { upper = false } = {}) => (isFree(n) ? (upper ? "ÜCRETSİZ" : "Ücretsiz") : fmtTL(n));
// Kısa (legacy artist kFmt/customer shortNum): 950 → "950", 12400 → "12.4K", 1250000 → "1.3M"
export function kFmt(n) {
  const x = Number(n) || 0;
  if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(1) + "M";
  if (Math.abs(x) >= 1000) return (x / 1000).toFixed(1) + "K";
  return String(Math.round(x));
}
// ₺ kısa (sanatçı paneli toplam kazanç): 30000 → "₺30.0K", 850 → "₺850", 0 → "₺0"
export function fmtTLK(n) {
  const x = Number(n) || 0;
  if (x >= 1000) return "₺" + kFmt(x);
  return x > 0 ? "₺" + NF.format(Math.round(x)) : "₺0";
}
// Türkçe kısa (takipçi): 950 → "950", 12400 → "12,4 B", 31000 → "31 B", 1250000 → "1,3 Mn"
export function shortNumTR(n) {
  const x = Number(n) || 0;
  const f = (v) => v.toFixed(1).replace(".", ",").replace(/,0$/, "");
  if (Math.abs(x) >= 1e6) return f(x / 1e6) + " Mn";
  if (Math.abs(x) >= 1000) return f(x / 1000) + " B";
  return String(Math.round(x));
}
// Mesafe: 0.62 → "620 m", 3.456 → "3,5 km"
export function fmtKm(km) {
  const x = Number(km);
  if (!isFinite(x)) return "";
  if (x < 1) return Math.max(10, Math.round(x * 1000 / 10) * 10) + " m";
  return x.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: x < 10 ? 1 : 0 }) + " km";
}
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Yıldız metni (tasarım): "★★★★☆" — dolu #FFD700, boş #3A3E48 (renkleri CSS'te ver)
export const starsText = (n) => { const k = clamp(Math.round(Number(n) || 0), 0, 5); return { full: "★".repeat(k), empty: "★".repeat(5 - k) }; };
export const fmtRating = (avg) => (Number(avg) > 0 ? (Math.round(Number(avg) * 10) / 10).toFixed(1) : null);

// ══════════ Tarih ══════════
export const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const MONTHS_TR_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const DAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const DAYS_TR_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const DAY = 86400e3;
// Firestore Timestamp | Date | ms | ISO/"YYYY-MM-DD" → ms (yoksa null)
export function toMs(v) {
  try {
    if (v == null || v === "") return null;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (v instanceof Date) return isNaN(v) ? null : v.getTime();
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "object" && typeof v.seconds === "number") return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  } catch { return null; }
}
export const toDate = (v) => { const t = toMs(v); return t == null ? null : new Date(t); };
export const startOfDay = (ms = Date.now()) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const isSameDay = (a, b) => a != null && b != null && startOfDay(a) === startOfDay(b);
export const isToday = (ms) => isSameDay(ms, Date.now());
export const isTomorrow = (ms) => isSameDay(ms, Date.now() + DAY);
export const isYesterday = (ms) => isSameDay(ms, Date.now() - DAY);
// "Bu hafta" = bugünden itibaren 7 gün (legacy Keşfet "Bu Hafta" ile aynı pencere)
export const isWithinDays = (ms, days = 7) => ms != null && ms >= startOfDay() && ms < startOfDay() + days * DAY;
export const isWeekend = (ms) => { const d = new Date(ms).getDay(); return d === 0 || d === 6; };
const pad2 = (n) => String(n).padStart(2, "0");
export const isoDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const fmtTime = (v) => { const d = toDate(v); return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ""; };
// "29 Eylül 2026" (yıl yalnız farklıysa: yearAlways=true ile her zaman)
export function fmtDateLong(v, { yearAlways = false } = {}) {
  const d = toDate(v); if (!d) return typeof v === "string" ? v : "";
  const y = d.getFullYear() !== new Date().getFullYear() || yearAlways ? " " + d.getFullYear() : "";
  return `${d.getDate()} ${MONTHS_TR[d.getMonth()]}${y}`;
}
export const fmtDateShort = (v) => { const d = toDate(v); return d ? `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}` : ""; };  // "29 Eyl"
// "Bugün" / "Yarın" / "Cmt 3 Eki"
export function fmtDayLabel(v) {
  const t = toMs(v); if (t == null) return "";
  if (isToday(t)) return "Bugün";
  if (isTomorrow(t)) return "Yarın";
  const d = new Date(t);
  return `${DAYS_TR_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`;
}
// Göreli zaman (bildirim/akış/mesaj):
//   <1 dk "şimdi" · <60 dk "12 dk önce" · <24 sa "3 sa önce" · takvimde dün "Dün 18:40" · eski "20 Eylül" (başka yıl: "20 Eylül 2025")
//   seçenekler: now ("Az önce" vb.), yesterday: "time" | "short" ("Dün") | false, days: n → "{n} gün önce" (n güne kadar), upper: true → TR büyük harf
export function timeAgo(v, { now = "şimdi", yesterday = "time", days = 0, upper = false } = {}) {
  const t = toMs(v); if (t == null) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  let out;
  if (m < 1) out = now;
  else if (m < 60) out = `${m} dk önce`;
  else if (m < 1440) out = `${Math.floor(m / 60)} sa önce`;
  else if (yesterday && isYesterday(t)) out = yesterday === "short" ? "Dün" : `Dün ${fmtTime(t)}`;
  else if (days && diff < days * DAY) out = `${Math.floor(diff / DAY)} gün önce`;
  else out = fmtDateLong(t);
  return upper ? trUpper(out) : out;
}

// ══════════ Etkinlik zamanı (TEK tanım) ══════════
// Başlangıç: data.js eventStartMs (eventAt → dateKey+startTime → date).
// Bitiş: data.js eventEndMs (endAt → dateKey+endTime → başlangıç + 6 sa). "Bitti" = isEventOver (bitiş < şimdi).
// CANLI: başlangıç ≤ şimdi < bitiş. (Legacy customer/organizer +3 sa kullanıyordu; masaüstü, listelerin
// etkinliği gizlediği an ile tutarlı olsun diye data.js'in +6 sa penceresini kullanır. Bilet "geçmiş" de aynı.)
export const eventStartMs = (e) => _eventStartMs(e);
export const eventEndMs = (e) => _eventEndMs(e);
export const isEventOver = (e) => _isEventOver(e);
export function isLive(e, now = Date.now()) {
  const s = _eventStartMs(e); if (s == null) return false;
  const end = _eventEndMs(e);
  return now >= s && now < (end ?? s + 6 * 3600e3);
}
export const isUpcoming = (e, now = Date.now()) => { const s = _eventStartMs(e); return s != null && s > now; };
// Etkinlik türleri dizi olarak (genre dizi ya da eski kayıtlarda string)
export const eventGenres = (e) => (Array.isArray(e?.genre) ? e.genre : e?.genre ? [e.genre] : []).filter(Boolean);
export const artistGenres = (u) => [...new Set((Array.isArray(u?.genres) ? u.genres : u?.genre ? [u.genre] : []).filter(Boolean))];
// Doluluk (legacy statusBadge önceliği ile)
export const isFull = (e) => !!(e?.capacity && (e.attendeeCount || 0) >= e.capacity);

// ══════════ Konum / harita ══════════
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// Etkinlik/mekan konumu {lat,lng} (location.{lat,lng} | location.{latitude,longitude} | lat/lng alanları)
export function latLngOf(x) {
  const l = x?.location || x;
  const lat = Number(l?.lat ?? l?.latitude), lng = Number(l?.lng ?? l?.longitude);
  return isFinite(lat) && isFinite(lng) && (lat || lng) ? { lat, lng } : null;
}
// Yol çizgisi sağlayıcısı (TAKILABİLİR). "none" = haritada yol ÇİZİLMEZ; yalnız mesafe + "Yol tarifi" derin bağlantısı.
// Üçüncü taraf yönlendirme çağrısı YOK. İleride sağlayıcı seçilirse (anahtar/CF proxy) fetchRoute burada uygulanır.
export const ROUTING = "none";
export async function fetchRoute(/* from, to */) { return null; }   // ROUTING === "none" → çizilecek rota yok
// "Yol tarifi": Google Maps yön derin bağlantısı (masaüstü + Android; iOS'ta da açılır)
export function directionsUrl(to, from = null) {
  const d = latLngOf(to); if (!d) return null;
  const o = from ? latLngOf(from) : null;
  return `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}${o ? `&origin=${o.lat},${o.lng}` : ""}`;
}
export const mapsSearchUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || "")}`;

// ══════════ Zamanlama ══════════
export function debounce(fn, ms = 250) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.cancel = () => { clearTimeout(t); t = null; };
  d.flush = (...a) => { d.cancel(); fn(...a); };
  return d;
}
// Animasyonu yeniden oynat (artboard'lardaki gb-fa/gb-fb takası): swapAnim(listEl) → dk-fa ↔ dk-fb
export function swapAnim(el, a = "dk-fa", b = "dk-fb") {
  if (!el) return;
  if (el.classList.contains(a)) { el.classList.remove(a); el.classList.add(b); }
  else { el.classList.remove(b); el.classList.add(a); }
}
export function replayAnim(el, cls) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

// ══════════ URL sorgusu (#/rota?anahtar=değer) ══════════
// Router: yalnız ?sorgu değişirse görünüm yeniden kurulmaz, view.update(query) çağrılır.
// Görünüm filtre yazarken writeQuery kullanır → history.replaceState (hashchange YOK → odak/kaydırma korunur).
export const hashBase = (hash = location.hash) => (hash || "#/").split("?")[0];
export const queryOf = (hash = location.hash) => new URLSearchParams((hash || "").split("?")[1] || "");
export const readQuery = queryOf;
// writeQuery({ tur: "jazz", sehir: null }) → mevcut sorguyla BİRLEŞTİRİR (null/""/undefined siler).
//   { replace: true } (varsayılan) → history.replaceState; { push: true } → history.pushState (geri tuşu önceki filtreye döner:
//   tarayıcı geri gelişte hashchange üretir → router view.update(query) çağırır).
//   { reset: true } → mevcut sorguyu atıp yalnız verilenleri yazar. Dönüş: yeni hash.
export function writeQuery(patch, { push = false, reset = false, base = hashBase() } = {}) {
  const q = reset ? new URLSearchParams() : queryOf();
  const entries = patch instanceof URLSearchParams ? [...patch.entries()] : Object.entries(patch || {});
  for (const [k, v] of entries) {
    if (v == null || v === "" || v === false) q.delete(k); else q.set(k, String(v));
  }
  const qs = q.toString();
  const hash = base + (qs ? "?" + qs : "");
  if (hash !== location.hash) {
    const url = location.pathname + location.search + hash;   // ?emu=1 gibi arama kısmı korunur
    if (push) history.pushState(null, "", url); else history.replaceState(null, "", url);
  }
  return hash;
}

// ══════════ Renk ══════════
export function rgba(hex, a = 1) {
  const m = String(hex || "").replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  if (!isFinite(n) || full.length !== 6) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Masaüstü rol renkleri (legacy ui.js ROLE mobilde aynen kalır)
export const ROLE_COLORS = { customer: "#4ED8FF", artist: "#FF4FA3", venue: "#FF8A2A", organizer: "#FF4FA3", admin: "#A78BFA" };
export const roleColor = (t) => ROLE_COLORS[t] || "#FF4FA3";
export const ROLE_LABELS = { customer: "Dinleyici", artist: "Sanatçı", venue: "Mekan", organizer: "Organizatör", admin: "Yönetici" };
// Baş harf avatarı gradyanları (tasarım; kullanıcı TÜRÜNE göre — legacy'deki hash paletleri yerine)
export const AVATAR_GRADS = {
  customer: "linear-gradient(135deg, #4ED8FF, #0891B2)",
  artist: "linear-gradient(160deg, rgba(255,79,163,0.2), rgba(78,216,255,0.08))",   // yer tutucu (baş harf #F2F1EE)
  venue: "linear-gradient(135deg, #FF8A2A, #D97706)",
  organizer: "linear-gradient(135deg, #FF4FA3, #FF8A2A)",
  admin: "linear-gradient(135deg, #A78BFA, #4ED8FF)",
};
export const avatarGrad = (t) => AVATAR_GRADS[t] || AVATAR_GRADS.customer;
export const avatarInk = (t) => (t === "artist" ? "#F2F1EE" : "#06070A");
