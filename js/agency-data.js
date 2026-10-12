// AJANS (userType 'agency') veri katmanı — fotoğraf çekimi, ışıkçı, cihaz kiralama işletmeleri. Yönetici onaylı (approved:false doğar).
// Uygulama karşılığı: GigBridge src/services/agency.ts — anahtarlar, etiketler, sorgu biçimleri ve yazım şekli BİREBİR aynı.
//   users/{uid}: displayName (ajans adı), city, agencyServices: string[] (1–10; hazır anahtar ya da ajansın kendi hizmet adı, ≤ 40),
//                bio (≤ 2000), phone (≤ 50), photoURL (logo; Storage profile_photos/{uid})
//   agencyItems/{id}: { agencyId, title 2–80, category 1–40, description ≤ 1000, photos ≤ 6, price number|null (0–10.000.000),
//                       priceUnit gun|saat|etkinlik|adet|paket, quantity int 1–9999|null, active bool, createdAt, updatedAt }
//     Kural keys().hasOnly → BAŞKA ALAN YAZILMAZ. createdAt yalnız oluştururken (serverTimestamp = request.time); güncellemede
//     dokunulmaz (updateDoc birleştirir → aynen kalır). updatedAt her yazımda serverTimestamp.
//     Okuma: başkası yalnız active:true (sorgu bu filtreyi taşımalı), sahibi hepsini (yalnız agencyId). orderBy YOK (bileşik indeks
//     gerekmesin) → istemcide updatedAt azalan.
//   Fotoğraflar: Storage agency_items/{uid}/{Date.now()}_{n}.jpg (herkes okur; yalnız sahibi yazar/siler; image/*, < 8 MB).
import {
  db, storage, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp,
  ref, uploadBytes, getDownloadURL, deleteObject,
} from "./firebase.js";

export const AGENCY_COLOR = "#FBBF24";
export const AGENCY_RGB = "251,191,36";
// Ajans rol ikonu (kamera + ışık parıltısı) ve "İşletme" grubu ikonu (çanta) — 24 px stroke yolları (uygulama ile aynı)
export const AGENCY_ICON_D = "M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 19 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17zM11 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM21 5.5v3M19.5 7h3";
export const BUSINESS_ICON_D = "M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18zM9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4 12.5h16";

// Hazır hizmetler. Bu üç anahtarın DIŞINDAKİ her metin ajansın kendi hizmet adıdır (olduğu gibi gösterilir).
export const SERVICE_PRESETS = [
  { key: "photo", label: "Fotoğraf Çekimi", desc: "Etkinlik ve sahne fotoğrafı, video",
    icon: "M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.5-2h7.6l1.5 2h2.2A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" },
  { key: "light", label: "Işıkçı", desc: "Sahne ışığı ve ışık operatörü",
    icon: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" },
  { key: "rental", label: "Cihaz Kiralama", desc: "Ses, ışık ve sahne ekipmanı",
    icon: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 7.5v.01" },
];
const CUSTOM_SERVICE_ICON = "M3.5 12.5V5A1.5 1.5 0 0 1 5 3.5h7.5l8 8a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0zM8 8v.01";
export const SERVICE_LABELS = Object.fromEntries(SERVICE_PRESETS.map((p) => [p.key, p.label]));
export const isPresetService = (key) => Object.prototype.hasOwnProperty.call(SERVICE_LABELS, key);
export const serviceLabel = (key) => SERVICE_LABELS[key] || String(key ?? "");
export const serviceIcon = (key) => SERVICE_PRESETS.find((p) => p.key === key)?.icon || CUSTOM_SERVICE_ICON;

export const SERVICES_MAX = 10;
export const SERVICE_NAME_MAX = 40;
export const ITEM_PHOTOS_MAX = 6;
export const ITEM_TITLE_MIN = 2;
export const ITEM_TITLE_MAX = 80;
export const ITEM_DESC_MAX = 1000;
export const PRICE_MAX = 10000000;
export const QTY_MAX = 9999;
export const CITY_MAX = 100;
export const PHONE_MAX = 50;
export const BIO_MAX = 2000;

export const PRICE_UNITS = [
  { key: "gun", label: "gün" },
  { key: "saat", label: "saat" },
  { key: "etkinlik", label: "etkinlik" },
  { key: "adet", label: "adet" },
  { key: "paket", label: "paket" },
];
export const unitLabel = (u) => PRICE_UNITS.find((x) => x.key === u)?.label || "gün";

// "₺1.500 / gün" · fiyat yoksa "Fiyat için sor"
export function priceText(it) {
  const p = it?.price;
  if (typeof p !== "number" || !Number.isFinite(p)) return "Fiyat için sor";
  return `₺${Math.round(p).toLocaleString("tr-TR")} / ${unitLabel(it.priceUnit)}`;
}

// Hizmet listesi: kırp, boşları at, aynıları (büyük/küçük harf duyarsız) tekle — sıra korunur
export function normalizeServices(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((s) => {
    const v = String(s ?? "").trim();
    if (!v) return;
    const k = v.toLocaleLowerCase("tr-TR");
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  });
  return out;
}
// Doğrulama: hata metni ya da null (uygulama servicesError ile aynı metinler)
export function servicesError(list) {
  if (!list.length) return "En az bir hizmet seç.";
  if (list.length > SERVICES_MAX) return `En çok ${SERVICES_MAX} hizmet ekleyebilirsin.`;
  if (list.some((s) => !String(s).trim() || String(s).trim().length > SERVICE_NAME_MAX)) return `Hizmet adı 1–${SERVICE_NAME_MAX} karakter olmalı.`;
  return null;
}

const msOf = (ts) => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0);

function toItem(id, d) {
  return {
    id,
    agencyId: String(d.agencyId ?? ""),
    title: typeof d.title === "string" ? d.title : "",
    category: typeof d.category === "string" ? d.category : "",
    description: typeof d.description === "string" ? d.description : "",
    photos: Array.isArray(d.photos) ? d.photos.filter((x) => typeof x === "string" && x) : [],
    price: typeof d.price === "number" && Number.isFinite(d.price) ? d.price : null,
    priceUnit: PRICE_UNITS.some((u) => u.key === d.priceUnit) ? d.priceUnit : "gun",
    quantity: typeof d.quantity === "number" ? d.quantity : null,
    active: d.active === true,
    updatedMs: msOf(d.updatedAt) || msOf(d.createdAt),
  };
}

// Bir ajansın kataloğu. ownerView: sahibi taslaklarını da görür; başkası yalnız yayındakileri (kural sorguda active filtresi ister).
export async function listAgencyItems(agencyId, { ownerView = false } = {}) {
  if (!agencyId) return [];
  const base = collection(db, "agencyItems");
  const q = ownerView
    ? query(base, where("agencyId", "==", agencyId))
    : query(base, where("agencyId", "==", agencyId), where("active", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toItem(d.id, d.data())).sort((a, b) => b.updatedMs - a.updatedMs);
}

// Tüm yayındaki ilanların ajans başına sayısı (Ajans Bul kartları) — tek sorgu, tek alan eşitliği (otomatik indeks)
export async function activeItemCounts() {
  const snap = await getDocs(query(collection(db, "agencyItems"), where("active", "==", true)));
  const m = new Map();
  snap.docs.forEach((d) => { const a = d.data().agencyId; if (a) m.set(a, (m.get(a) || 0) + 1); });
  return m;
}

// Yazılacak doküman gövdesi (kural alan listesi: agencyId · title · category · description · photos · price · priceUnit · quantity ·
// active · createdAt · updatedAt). Sayılar: price null ya da 0–10M (yuvarlanmaz; ondalık kabul) · quantity tam sayı 1–9999 ya da null.
function itemBody(input) {
  const price = typeof input.price === "number" && Number.isFinite(input.price) ? Math.min(PRICE_MAX, Math.max(0, input.price)) : null;
  const qty = typeof input.quantity === "number" && Number.isInteger(input.quantity) ? Math.min(QTY_MAX, Math.max(1, input.quantity)) : null;
  return {
    title: String(input.title ?? "").trim().slice(0, ITEM_TITLE_MAX),
    category: String(input.category ?? "").trim().slice(0, SERVICE_NAME_MAX),
    description: String(input.description ?? "").trim().slice(0, ITEM_DESC_MAX),
    photos: (Array.isArray(input.photos) ? input.photos : []).filter((x) => typeof x === "string" && x).slice(0, ITEM_PHOTOS_MAX),
    price,
    priceUnit: PRICE_UNITS.some((u) => u.key === input.priceUnit) ? input.priceUnit : "gun",
    quantity: qty,
    active: input.active === true,
    updatedAt: serverTimestamp(),
  };
}

// Yeni ilan (id yok) ya da güncelleme → ilan kimliği. createdAt yalnız oluştururken yazılır (kural güncellemede aynen ister).
export async function saveAgencyItem(agencyId, input, id) {
  const data = itemBody(input);
  if (id) {
    await updateDoc(doc(db, "agencyItems", id), data);
    return id;
  }
  const r = await addDoc(collection(db, "agencyItems"), { agencyId, ...data, createdAt: serverTimestamp() });
  return r.id;
}

export async function setAgencyItemActive(id, active) {
  await updateDoc(doc(db, "agencyItems", id), { active: !!active, updatedAt: serverTimestamp() });
}

// Storage'daki bir dosyayı indirme URL'inden sil — hata yut (best-effort)
export async function deleteAgencyPhoto(url) {
  if (!url) return;
  try { await deleteObject(ref(storage, url)); } catch (_) {}
}

// İlanı ve fotoğraflarını sil (fotoğraf silinemezse sessiz geçer)
export async function deleteAgencyItem(item) {
  if (!item?.id) return;
  await deleteDoc(doc(db, "agencyItems", item.id));
  await Promise.all((item.photos || []).map((u) => deleteAgencyPhoto(u)));
}

// Kırpılmış görseli (Blob) katalog yoluna yükle → indirme URL'i
export async function uploadAgencyPhoto(agencyId, blob, n = 0) {
  const r = ref(storage, `agency_items/${agencyId}/${Date.now()}_${n}.jpg`);
  await uploadBytes(r, blob, { contentType: blob?.type || "image/jpeg" });
  return await getDownloadURL(r);
}

// Ajans logosu — ortak profil fotoğrafı yolu (profile_photos/{uid}; diğer rollerin uygulama yolu ile aynı)
export async function uploadAgencyLogo(uid, blob) {
  const r = ref(storage, `profile_photos/${uid}`);
  await uploadBytes(r, blob, { contentType: blob?.type || "image/jpeg" });
  return await getDownloadURL(r);
}

// ─── Ajans profilleri ("Ajans Bul") ───
function toAgency(id, d) {
  return {
    id,
    name: typeof d.displayName === "string" && d.displayName.trim() ? d.displayName.trim() : "Ajans",
    city: typeof d.city === "string" ? d.city.trim() : "",
    photoURL: typeof d.photoURL === "string" && d.photoURL ? d.photoURL : null,
    services: Array.isArray(d.agencyServices) ? d.agencyServices.filter((x) => typeof x === "string" && x) : [],
    bio: typeof d.bio === "string" ? d.bio : "",
    phone: typeof d.phone === "string" ? d.phone : "",
    email: typeof d.email === "string" ? d.email : "",
  };
}
// Görünür ajans: onaylı (alan yoksa onaylı sayılır), reddedilmemiş, kapatılmamış, silinmekte değil
const listable = (d) => !!d && d.approved !== false && d.rejected !== true && d.banned !== true && d.pendingDeletion !== true;

export async function listAgencies() {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "agency")));
  return snap.docs
    .filter((d) => listable(d.data()))
    .map((d) => toAgency(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export async function getAgency(id) {
  if (!id) return null;
  const s = await getDoc(doc(db, "users", id));
  if (!s.exists()) return null;
  const d = s.data();
  if (d.userType !== "agency" || !listable(d)) return null;
  return toAgency(s.id, d);
}

// Ajans profilini (Ajans Bul ayrıntısı) gören rol → kendi panelindeki adresi. Ajans / dinleyici görüntüleyemez → null.
export const AGENCY_FINDER_ROLES = ["venue", "organizer", "artist"];
export function agencyHref(viewerType, id) {
  if (!id || !AGENCY_FINDER_ROLES.includes(viewerType)) return null;
  return `#/${viewerType}/ajans?id=${encodeURIComponent(id)}`;
}
