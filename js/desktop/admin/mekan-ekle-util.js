// GEÇİCİ — Berkay: gerek kalmayınca kaldırılacak
// Admin › Mekan Ekle saf yardımcıları (DOM / Firebase yok → Node'da test edilebilir): e-posta üretimi, koordinat ayıklama,
// şehir/ilçe eşleme, sabit listeler.
import { ILCELER } from "./mekan-ekle-ilceler.js";

// Berkay'ın Gmail'i: + etiketli adresler (berkayer032+<slug>@gmail.com) aynı gelen kutusuna düşer.
export const EMAIL_BASE = "berkayer032";
export const EMAIL_DOMAIN = "gmail.com";

// Mekan türü önerileri: ilk 5'i organizatör Mekan Seç çipleriyle (js/desktop/organizer/mekan-sec.js TYPES) BİREBİR —
// süzme orada büyük/küçük harf duyarsız eşleşir. Alan serbest metin de kabul eder (datalist).
export const VENUE_TYPES = ["Gece kulübü", "Jazz kulübü", "Konser salonu", "Lounge", "Beach club", "Canlı müzik sahnesi", "Bar", "Pub", "Restoran", "Kafe", "Otel", "Açık hava"];
// Olanaklar: mekan profiliyle aynı liste (js/desktop/venue/profil.js AMENITY_OPTIONS = app venue/ProfileScreen)
export const AMENITY_OPTIONS = ["Profesyonel Ses Sistemi", "Işık Sistemi", "DJ Booth", "Soyunma Odası", "Parking", "VIP Alan", "Sahne", "Bar", "Klima", "Wi-Fi", "Engelli Erişimi", "Sigara Alanı"];

const TRMAP = { ı: "i", İ: "i", ş: "s", Ş: "s", ç: "c", Ç: "c", ğ: "g", Ğ: "g", ö: "o", Ö: "o", ü: "u", Ü: "u", â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u" };
const foldTR = (s) => String(s ?? "").replace(/[ıİşŞçÇğĞöÖüÜâÂîÎûÛ]/g, (c) => TRMAP[c]).toLowerCase().trim();

/** "Platform Kuşadası" → "platformkusadasi" (ı→i ş→s ç→c ğ→g ö→o ü→u, küçük harf, harf/rakam dışı atılır, ≤ 40) */
export function slugify(name) {
  return foldTR(name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "").slice(0, 40);
}
/** Mekan adından giriş e-postası: berkayer032+<slug>@gmail.com (slug boşsa ""). */
export const venueEmail = (name) => { const s = slugify(name); return s ? `${EMAIL_BASE}+${s}@${EMAIL_DOMAIN}` : ""; };
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── koordinat ──
const N = "(-?\\d{1,3}(?:\\.\\d+)?)";
const pair = (a, b) => ({ lat: Number(a), lng: Number(b) });
const dms = (d, m, s, hemi) => { const v = Number(d) + Number(m) / 60 + Number(s) / 3600; return /[SWGB]/i.test(hemi) ? -v : v; };

/**
 * Serbest metinden koordinat: "38.0123, 27.1234" · "38.0123 27.1234" · "38,0123 27,1234" (ondalık virgül) ·
 * 37°51'38.9"N 27°15'29.3"E · Google Haritalar bağlantıları (…!3d<lat>!4d<lng>, …/@<lat>,<lng>,…, ?q=<lat>,<lng>, ll=, query=, destination=).
 * Dönüş: null (boş) | { lat, lng } | { error }. Aralık denetimi checkCoords'ta.
 */
export function parseCoords(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(s)) {
    return { error: "Kısa bağlantı (maps.app.goo.gl) buradan çözülemez. Google Haritalar'da noktaya sağ tıkla, üstteki koordinata tıkla (kopyalanır) ve buraya yapıştır." };
  }
  let m;
  // yer sayfası bağlantısı: pinin kendisi (!3d…!4d…) — @ kısmı yalnız harita merkezidir, önce bu denenir
  if ((m = s.match(new RegExp(`!3d${N}!4d${N}`)))) return pair(m[1], m[2]);
  let dec = s;
  try { dec = decodeURIComponent(s.replace(/\+/g, " ")); } catch { /* bozuk kodlama → ham metin */ }
  if ((m = dec.match(new RegExp(`[?&](?:q|query|ll|sll|center|destination|daddr)=(?:loc:)?\\s*${N}\\s*,\\s*${N}`, "i")))) return pair(m[1], m[2]);
  if ((m = dec.match(new RegExp(`@${N},\\s*${N}`)))) return pair(m[1], m[2]);
  if ((m = dec.match(/(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:[.,]\d+)?)["″]?\s*([NSKG])[\s,]+(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:[.,]\d+)?)["″]?\s*([EWDB])/i))) {
    return { lat: dms(m[1], m[2], m[3].replace(",", "."), m[4]), lng: dms(m[5], m[6], m[7].replace(",", "."), m[8]) };
  }
  if ((m = dec.match(/^\(?\s*(-?\d{1,3}),(\d+)\s*[;\s]\s*(-?\d{1,3}),(\d+)\s*\)?$/))) return pair(`${m[1]}.${m[2]}`, `${m[3]}.${m[4]}`);
  if ((m = dec.match(new RegExp(`^\\(?\\s*${N}\\s*[,;\\s]\\s*${N}\\s*\\)?$`)))) return pair(m[1], m[2]);
  return { error: "Biçim tanınmadı. Örnek: 38.0123, 27.1234 ya da bir Google Haritalar bağlantısı." };
}

// Türkiye kutusu (yaklaşık; uyarı içindir, engellemez)
export const TR_BOX = { latMin: 35.8, latMax: 42.2, lngMin: 25.6, lngMax: 44.9 };
const inTR = (lat, lng) => lat >= TR_BOX.latMin && lat <= TR_BOX.latMax && lng >= TR_BOX.lngMin && lng <= TR_BOX.lngMax;

/** { error } (geçersiz — sunucu da reddeder) | { warn } (Türkiye dışı) | {} */
export function checkCoords(c) {
  if (!c) return {};
  const { lat, lng } = c;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: "Enlem -90 ile 90 arasında olmalı." };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: "Boylam -180 ile 180 arasında olmalı." };
  if (!inTR(lat, lng)) {
    return { warn: inTR(lng, lat) ? "Bu nokta Türkiye dışında. Enlem ile boylam yer değiştirmiş olabilir (önce enlem ~36–42, sonra boylam ~26–45)." : "Bu nokta Türkiye dışında görünüyor. Koordinatı kontrol et." };
  }
  return {};
}
export const fmtCoord = (n) => (Number.isFinite(n) ? String(Math.round(n * 1e7) / 1e7) : "");
export const fmtPair = (c) => (c ? `${fmtCoord(c.lat)}, ${fmtCoord(c.lng)}` : "");

// ── şehir / ilçe ──
export const CITY_NAMES = Object.keys(ILCELER);
/** Yazılan şehri resmî ada çevirir ("izmir" → "İzmir"); listede yoksa null. */
export const canonicalCity = (s) => CITY_NAMES.find((c) => foldTR(c) === foldTR(s)) || null;
export const districtsOf = (city) => ILCELER[canonicalCity(city)] || [];
/** İlçeyi o şehrin resmî yazımına çevirir; listede yoksa yazıldığı gibi (serbest metin kabul). */
export const canonicalDistrict = (city, d) => districtsOf(city).find((x) => foldTR(x) === foldTR(d)) || String(d ?? "").trim();
/** "@ad", "instagram.com/ad/" → "ad" (sunucu da aynı biçimi ister) */
export function igHandle(v) {
  let s = String(v ?? "").trim();
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  return s.replace(/^@/, "");
}
