// Veri katmanı — app'in Firestore şemasıyla birebir sorgular.
import {
  db, collection, collectionGroup, doc, getDoc, getDocs, updateDoc, addDoc, setDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayRemove, increment, writeBatch,
  storage, ref, uploadBytes, getDownloadURL, deleteObject, auth, deleteUser,
} from "./firebase.js";
import { session } from "./store.js";
// Sayfaların data.js üzerinden alabilmesi için yeniden dışa aktar (artist.js isim cooldown damgası).
export { serverTimestamp } from "./firebase.js";

// ── Test hesapları (users.testAccount === true; app isRealArtist ile aynı kural) ──
// Herkese açık dizinlerde (Keşfet, arama, sanatçı/mekan listeleri, Top 10, Akış önerileri) görünmez — gerçek kullanıcıya.
// Test hesabıyla girilince test hesapları birbirini GÖRÜR (teklif → kabul → etkinlik → ödeme kabul testleri; denetim 12 Eki).
export const isTestAccount = (u) => u?.testAccount === true;
const viewerIsTestAccount = () => isTestAccount(session.profile);
const hideTest = (list) => (viewerIsTestAccount() ? list : list.filter((u) => !isTestAccount(u)));
// Test hesabı kimlikleri (etkinlik / sunucu Top 10 süzgeci için; tek eşitlik sorgusu, 5 dk önbellek). Okunamazsa boş küme.
let _testIds = null, _testIdsAt = 0;
export function testAccountIds() {
  if (viewerIsTestAccount()) return Promise.resolve(new Set());   // test hesabı test kayıtlarını görür
  if (!_testIds || Date.now() - _testIdsAt > 5 * 60e3) {
    _testIdsAt = Date.now();
    _testIds = getDocs(query(collection(db, "users"), where("testAccount", "==", true)))
      .then((s) => new Set(s.docs.map((d) => d.id)))
      .catch(() => { _testIds = null; return new Set(); });
  }
  return _testIds;
}

// ── Şehir eşleşmesi (Türkçe katlamalı): sanatçı city VEYA serviceCities (ilçe metni içerebilir: "İzmir (Kuşadası)") ──
const _TRX = { "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u", "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u" };
const _fold = (s) => String(s ?? "").replace(/[ıİşŞçÇğĞöÖüÜâÂîÎûÛ]/g, (c) => _TRX[c] || c).toLowerCase().trim();
export const foldTR = _fold;   // arama anahtarı: "İlkay Şahin" → "ilkay sahin" (desktop helpers.fold ile aynı)
function _placeMatches(text, want) {
  const t = _fold(text);
  if (!t || !want) return false;
  return t === want || t.split(/[^a-z0-9]+/).includes(want) || (want.includes(" ") && t.includes(want));
}
// city: seçili şehir ("TÜMÜ"/boş → her zaman true). Gruplar yalnız city taşır (serviceCities yok) → aynı fonksiyon.
export function servesCity(a, city) {
  const want = _fold(city);
  if (!want || want === "tumu") return true;
  const svc = Array.isArray(a?.serviceCities) ? a.serviceCities : [];
  return [a?.city, ...svc].some((c) => _placeMatches(c, want));
}

// ── Yardımcılar (app utils/price.ts + eventDate.ts karşılığı) ──
// TL ayrıştır: sayıysa aynen; "2.500" gibi string ise rakamları toplar (nokta binlik ayraç).
function axParseTL(v) {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const digits = String(v).replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return isFinite(n) ? n : null;
}
// ISO tarihi ("2026-07-15") TR görünümüne çevirir; geçersizse ham metni ya da "—".
function axIsoToTR(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return (typeof iso === "string" && iso) ? iso : "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}
// Etkinlik tarih alanları: { date (TR gösterim), eventAt (JS Date → Firestore Timestamp'e dönüşür), dateKey (ISO) }.
function axEventDateFields(input) {
  const d = input ? new Date(input) : null;
  if (!d || isNaN(d)) return { date: (typeof input === "string" ? input : ""), eventAt: null, dateKey: "" };
  return {
    date: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }),
    eventAt: d,
    dateKey: d.toISOString().slice(0, 10),
  };
}

// Hesabı sil — auth kullanıcısını siler; veri temizliğini onUserDeleted CF'i (KVKK cascade) yapar.
export async function deleteMyAccount() {
  await deleteUser(auth.currentUser);
}

// Görsel yükle (Storage) → indirilebilir URL. event_banners/{uid}/... sahibe yazılabilir.
export async function uploadImage(file, uid) {
  if (!file) return null;
  const r = ref(storage, `event_banners/${uid}/${Date.now()}_${(file.name || "img").replace(/[^\w.-]/g, "")}`);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

// Storage'daki afiş görselini sil (bitmiş etkinlik temizliği). Hata yut — best-effort.
export async function deleteBanner(bannerUrl) {
  if (!bannerUrl) return;
  try { await deleteObject(ref(storage, bannerUrl)); } catch (_) {}
}

const byMs = (a, b) => (msOf(b) - msOf(a));
function msOf(x) {
  const v = x.eventAt ?? x.createdAt ?? x.date;
  try {
    if (v && typeof v.toMillis === "function") return v.toMillis();
    if (typeof v === "number") return v;
    const t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  } catch { return 0; }
}

// Etkinlik başlangıç ms (createdAt fallback YOK — yalnız gerçek etkinlik zamanı)
export function eventStartMs(e) {
  if (e?.eventAt && typeof e.eventAt.toMillis === "function") { const t = e.eventAt.toMillis(); if (!isNaN(t)) return t; }
  if (e?.dateKey) { const t = Date.parse(e.dateKey + (e.startTime ? "T" + e.startTime : "T00:00")); if (!isNaN(t)) return t; }
  if (typeof e?.date === "string") { const t = Date.parse(e.date); if (!isNaN(t)) return t; }
  return null;
}
// Etkinlik bitiş ms: endAt varsa onu, yoksa endTime, yoksa başlangıç + 6 saat
export function eventEndMs(e) {
  if (e?.endAt && typeof e.endAt.toMillis === "function") { const t = e.endAt.toMillis(); if (!isNaN(t)) return t; }
  const s = eventStartMs(e);
  if (s == null) return null;
  if (e?.endTime && e?.dateKey) { let t = Date.parse(e.dateKey + "T" + e.endTime); if (!isNaN(t)) { if (t <= s) t += 86400e3; return t; } }
  return s + 6 * 3600e3;
}
// Etkinlik bitti mi (saati geçti mi) — bittiyse listelerde gösterilmez
export function isEventOver(e) { const t = eventEndMs(e); return t != null && t < Date.now(); }

// ── Etkinlikler ──
// Bitmiş etkinliklerin afiş görsellerini fire-and-forget temizle (Storage + bannerUrl).
// Doküman SİLİNMEZ; yalnız foto + bannerUrl gider, bannerCleaned=true işaretlenir. Bloklamaz, hata yutar.
function cleanupEventBanners(events) {
  for (const e of events) {
    if (!e || !e.bannerUrl || e.bannerCleaned || !isEventOver(e)) continue;
    deleteBanner(e.bannerUrl);
    updateDoc(doc(db, "events", e.id), { bannerUrl: null, bannerCleaned: true }).catch(() => {});
  }
}
export async function venueEvents(uid) {
  const snap = await getDocs(query(collection(db, "events"), where("venueId", "==", uid)));
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs);
  cleanupEventBanners(events);
  return events;
}
export async function organizerEvents(orgId) {
  const snap = await getDocs(query(collection(db, "events"), where("organizerId", "==", orgId)));
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs);
  cleanupEventBanners(events);
  return events;
}

// ── Organizatör ↔ Mekan istekleri (venueRequests) ──
export async function venueOrgRequests(uid) {
  // Mekana gelen istekler (onay bekleyen)
  const snap = await getDocs(query(collection(db, "venueRequests"), where("venueId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === "pending").sort(byMs);
}
export async function organizerRequests(uid) {
  // Organizatörün gönderdiği istekler
  const snap = await getDocs(query(collection(db, "venueRequests"), where("createdByUid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs);
}

// ── Profil ──
export async function getUser(uid) { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? { id: uid, ...s.data() } : null; }
export async function saveProfile(uid, patch) { await updateDoc(doc(db, "users", uid), patch); }
// Organizatör profili: users/{uid} + (sahipse) organizations/{orgId}.name TEK batch'te.
// Org adı users.displayName'e YAZILMAZ — app'te kayıt olan organizatörde displayName kişinin
// ad-soyadıdır; orgName'den yazmak her kayıtta ad değişikliği sayılıp nameChangeOk'a takılıyordu.
export async function saveOrganizerProfile(uid, patch, org) {
  const b = writeBatch(db);
  b.update(doc(db, "users", uid), patch);
  if (org?.orgId && org.name) b.update(doc(db, "organizations", org.orgId), { name: org.name });
  await b.commit();
}

// Mekan listesi (organizatörün istek göndereceği mekanlar)
export async function listVenues() {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "venue")));
  return hideTest(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.approved !== false));
}

// ── Admin ──
export async function listPendingByRole(role) {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", role)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.approved === false && u.rejected !== true);
}
export async function approveUser(uid) { await updateDoc(doc(db, "users", uid), { approved: true, approvedAt: serverTimestamp() }); }
export async function rejectUser(uid) { await updateDoc(doc(db, "users", uid), { approved: false, rejected: true }); }

export async function listReports() {
  const snap = await getDocs(collection(db, "reports"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status !== "resolved").sort(byMs);
}
export async function resolveReport(id) { await updateDoc(doc(db, "reports", id), { status: "resolved", resolvedAt: serverTimestamp() }); }

// Sorun / talep bildir (reports). Mekan yalnız kendi reporterId'siyle yazabilir.
export async function submitReport(uid, { subject, message, reporterName, reporterType, extra = {} }) {
  await addDoc(collection(db, "reports"), {
    reporterId: uid, subject: subject || "", message: message || "",
    reporterName: reporterName || "", reporterType: reporterType || "",
    type: "report", status: "pending", createdAt: serverTimestamp(), ...extra,
  });
}

// ── Mekan adı değişikliği: yönetici onaylı istek (reports + kendi dokümanında durum) ──
export async function requestNameChange(uid, { currentName, requestedName, reason, reporterName }) {
  await addDoc(collection(db, "reports"), {
    reporterId: uid, targetUserId: uid, type: "name_change",
    subject: "Mekan adı değişikliği talebi",
    reporterName: reporterName || currentName || "", reporterType: "venue",
    currentName: currentName || "", requestedName,
    reason: reason || "", message: reason || "",
    status: "pending", createdAt: serverTimestamp(),
  });
  // Mekanın kendi panelinde "inceleniyor" göstermek için (kendi dokümanını okuyabilir/yazabilir)
  try { await updateDoc(doc(db, "users", uid), { nameChangeStatus: "pending", nameChangeRequested: requestedName, nameChangeReason: reason || "" }); } catch (_) {}
}
export async function cancelNameChange(uid) {
  try { await updateDoc(doc(db, "users", uid), { nameChangeStatus: null, nameChangeRequested: null, nameChangeReason: null }); } catch (_) {}
}
// Onaylanan istek uygulandıysa mekanın kendi bayrağını temizle (displayName artık yeni ad)
export async function clearNameChangeFlag(uid) {
  try { await updateDoc(doc(db, "users", uid), { nameChangeStatus: null, nameChangeRequested: null, nameChangeReason: null }); } catch (_) {}
}
// Admin: adı onayla → users.displayName güncelle (KURAL: admin displayName+displayNameChangedAt yazabilmeli) + isteği çöz.
export async function approveNameChange(req) {
  await updateDoc(doc(db, "users", req.targetUserId), { displayName: req.requestedName, displayNameChangedAt: serverTimestamp() });
  await updateDoc(doc(db, "reports", req.id), { status: "resolved", decision: "approved", resolvedAt: serverTimestamp() });
}
export async function rejectNameChange(req) {
  await updateDoc(doc(db, "reports", req.id), { status: "resolved", decision: "rejected", resolvedAt: serverTimestamp() });
}

// venueRequests durum güncelle
export async function setRequestStatus(id, status, extra = {}) {
  await updateDoc(doc(db, "venueRequests", id), { status, updatedAt: serverTimestamp(), ...extra });
}

// Organizatör isteğini KABUL et → app'teki gibi events'e etkinlik yaz + isteği 'accepted' yap.
export async function acceptOrgRequest(req, venue) {
  const eventAt = req.eventDate ? new Date(`${req.eventDate}T${req.eventTime || "00:00"}:00`) : null;
  const loc = venue?.location?.lat != null
    ? { lat: venue.location.lat, lng: venue.location.lng }
    : (venue?.city ? { city: venue.city } : null);
  const ref = await addDoc(collection(db, "events"), {
    title: req.title ?? "Etkinlik",
    venueId: venue.id,
    venueName: venue.displayName ?? req.venueName ?? "",
    artistId: req.artistId ?? null,
    artistName: req.artistName ?? "",
    organizerId: req.organizerId ?? null,
    organizerName: req.organizerName ?? "",
    date: req.eventDate ?? "",
    eventAt: eventAt && !isNaN(eventAt) ? eventAt : null,
    startTime: req.eventTime ?? "",
    description: req.description ?? null,
    bannerUrl: req.bannerUrl ?? req.photoUrl ?? null,
    ...posterFields(req),   // organizatörün istekte yüklediği dikey afiş etkinliğe geçer
    genre: [],
    location: loc,
    city: venue?.city ?? venue?.location?.city ?? null,
    status: "upcoming",
    attendeeCount: 0,
    capacity: venue?.capacity ?? null,
    endAt: null,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "venueRequests", req.id), { status: "accepted", eventId: ref.id, updatedAt: serverTimestamp() });
  return ref.id;
}

// Dikey afiş (Instagram ~9:16; isteğe bağlı) — shared/poster.js uploadPoster çıktısı. Yalnız kuralın (firestore.rules posterFieldOk)
// kabul ettiği Storage indirme URL'i yazılır: geçersiz değer tüm etkinlik/istek yazımını reddettirirdi → sessizce atlanır.
// Desen poster.js POSTER_URL_RE ile aynı (uygulama src/utils/posters.ts) — kural değişirse üçü birlikte.
const _POSTER_RE = /^(https:\/\/firebasestorage\.googleapis\.com|http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2):[0-9]+)\/v0\/b\/[^/]+\/o\/event_banners%2F[^/?%]+%2F[^/?]+\?.*$/;
const _okPoster = (v) => (typeof v === "string" && v.length <= 2000 && _POSTER_RE.test(v) ? v : null);
function posterFields(x) {
  const posterUrl = _okPoster(x?.posterUrl);
  return posterUrl ? { posterUrl, posterThumbUrl: _okPoster(x?.posterThumbUrl) || posterUrl } : {};
}

// ── Mekan: etkinlik oluştur (CreateEventScreen addDoc ile uyumlu) ──
export async function createEvent(venue, f) {
  const eventAt = f.date ? new Date(`${f.date}T${f.time || "00:00"}:00`) : null;
  const loc = venue?.location?.lat != null ? { lat: venue.location.lat, lng: venue.location.lng } : (venue?.city ? { city: venue.city } : null);
  return (await addDoc(collection(db, "events"), {
    title: f.title,
    venueId: venue.id,
    venueName: venue.displayName ?? "",
    artistId: f.artistId ?? null, artistName: f.artistName ?? "",
    date: f.date ?? "",
    eventAt: eventAt && !isNaN(eventAt) ? eventAt : null,
    startTime: f.time ?? "",
    genre: f.genre ? [f.genre] : [],
    ticketPrice: f.price ? Number(f.price) : null,
    description: f.description ?? "",
    bannerUrl: f.bannerUrl ?? null,
    ...posterFields(f),
    status: "upcoming",
    isNew: true,
    attendeeCount: 0,
    capacity: f.capacity ? Number(f.capacity) : (venue?.capacity ?? null),
    city: venue?.city ?? venue?.location?.city ?? null,
    district: venue?.district ?? null,
    location: loc,
    vipStatus: null, // VIP talep özelliği kaldırıldı; yalnız eski "approved" kayıtlar rozet gösterir
    createdAt: serverTimestamp(),
  })).id;
}

// ── Mekan: analitik (etkinliklerden türetilir) ──
export async function venueStats(uid) {
  const evs = await venueEvents(uid);
  const now = Date.now();
  const ms = (e) => (e.eventAt?.toMillis?.() ?? Date.parse(e.date) ?? 0);
  return {
    eventCount: evs.length,
    upcoming: evs.filter((e) => e.status === "upcoming" && ms(e) >= now - 6 * 3600e3).length,
    totalAttendance: evs.reduce((s, e) => s + (e.attendeeCount ?? 0), 0),
    withArtist: evs.filter((e) => e.artistId).length,
    vip: evs.filter((e) => e.vipStatus === "approved").length,
    avgAttendance: evs.length ? Math.round(evs.reduce((s, e) => s + (e.attendeeCount ?? 0), 0) / evs.length) : 0,
  };
}

// ── Mekan: sanatçı bul + davet ──
export async function listArtists() {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "artist")));
  return hideTest(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
export async function createInvitation(venue, artist, f) {
  const genre = (Array.isArray(artist.genres) ? artist.genres[0] : artist.genre) ?? "";
  const feeN = Number(f.fee);
  const ref = await addDoc(collection(db, "invitations"), {
    venueId: venue.id, venueName: venue.displayName ?? "",
    artistId: artist.id, artistName: artist.displayName ?? artist.name ?? "",
    genre,
    eventDate: f.date, eventTime: f.time, fee: feeN,
    message: f.message ?? "", photoUrl: f.photoUrl ?? null, eventId: f.eventId ?? null,
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  // Sohbete de teklifi düşür — sanatçı mesajlardan Evet/Hayır ile yanıtlayabilsin (best-effort).
  try {
    const feeTxt = isFinite(feeN) && feeN > 0 ? "₺" + feeN.toLocaleString("tr-TR") : "Belirtilmemiş";
    await postOfferMessage({
      fromId: venue.id, fromName: venue.displayName ?? "Mekan", fromEmoji: "🏢",
      toId: artist.id, toName: artist.displayName ?? artist.name ?? "Sanatçı", toEmoji: "🎤",
      text: `Sahne teklifi — ${axIsoToTR(f.date)}${f.time ? " · " + f.time : ""} · ${feeTxt}${f.message ? "\n" + f.message : ""}`,
      type: "offer", invitationId: ref.id,
      offerMeta: {
        venueId: venue.id, venue: venue.displayName ?? "Mekan",
        eventId: f.eventId ?? null, dateISO: f.date ?? "", time: f.time ?? "",
        feeRaw: isFinite(feeN) ? feeN : null, genre, photoUrl: f.photoUrl ?? null,
      },
    });
  } catch (e) { console.warn("[createInvitation] teklif mesajı yazılamadı", e); }
}

// Uzun dönem (rezidans) teklifi — app'in residencies şemasıyla birebir.
export async function createResidency(profile, artist, f) {
  const start = new Date(); const end = new Date(); end.setMonth(end.getMonth() + (Number(f.months) || 3));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await addDoc(collection(db, "residencies"), {
    venueId: profile.id, venueName: profile.displayName ?? "",
    artistId: artist.id, artistName: artist.displayName ?? artist.name ?? "",
    startDate: iso(start), endDate: iso(end),
    daysOfWeek: f.days || [], time: f.time || "", fee: Number(f.fee) || null,
    photoUrl: null, status: "pending", createdBy: profile.id, cancelledBy: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// ── Organizatör: mekana istek gönder (venueRequests) ──
// MEKAN ÜCRETİ (rentalFee, ₺ tam sayı; isteğe bağlı — uygulama VenuesScreen/EventsScreen): yalnız > 0 ise yazılır, en çok 10.000.000.
// Kabulden sonra ödeme tutarı sunucuda bu alandan okunur (functions/payments.js createPayment venue_rental).
const rentalFeeField = (v) => { const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10) || 0; return n > 0 ? { rentalFee: Math.min(n, 10000000) } : {}; };
export async function createVenueRequest(profile, venue, f) {
  await addDoc(collection(db, "venueRequests"), {
    title: f.title,
    eventDate: f.date, eventTime: f.time, description: f.description ?? "",
    bannerUrl: f.bannerUrl ?? null,
    ...posterFields(f),
    organizerId: profile.orgId ?? profile.id,
    organizerName: profile.orgName ?? profile.displayName ?? "",
    createdByUid: profile.id,
    venueId: venue.id, venueName: venue.displayName ?? "",
    ...rentalFeeField(f.rentalFee),
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// ── Mesajlaşma (MessagesScreen şemasıyla birebir) ──
export function convIdFor(a, b) { return [a, b].sort().join("__"); }
const emojiFor = (t) => (t === "artist" ? "🎤" : t === "venue" ? "🏢" : t === "organizer" ? "📣" : t === "agency" ? "📸" : "👤");

const _convPhotoCache = {};   // otherId → photoURL (oturum içi; mesaj listesi avatarları için)
export function listenConversations(uid, cb) {
  return onSnapshot(query(collection(db, "conversations"), where("participants", "array-contains", uid)), async (snap) => {
    const list = snap.docs
      .filter((d) => !((d.data().hiddenFor ?? []).includes(uid)))
      .map((d) => {
        const data = d.data();
        const other = (data.participants || []).find((p) => p !== uid) || "";
        return {
          id: d.id, otherId: other,
          otherName: data.isGroup ? (data.name ?? "Grup") : (data.participantNames?.[other] ?? "Kullanıcı"),
          lastMessage: data.lastMessage ?? "", lastMessageTime: data.lastMessageTime,
          unread: data.unreadCount?.[uid] ?? 0, isGroup: data.isGroup === true,
          otherPhoto: null,
        };
      })
      .sort((a, b) => msOf(b) - msOf(a));
    // Karşı tarafın profil fotoğrafı (grup değilse) — mesaj avatarında göstermek için, cache'li.
    await Promise.all(list.filter((c) => !c.isGroup && c.otherId).map(async (c) => {
      if (c.otherId in _convPhotoCache) { c.otherPhoto = _convPhotoCache[c.otherId]; return; }
      try {
        const s = await getDoc(doc(db, "users", c.otherId));
        const ph = s.exists() ? (s.data().photoURL ?? null) : null;
        _convPhotoCache[c.otherId] = ph; c.otherPhoto = ph;
      } catch { c.otherPhoto = null; }
    }));
    cb(list);
  }, () => cb([]));
}

export function listenMessages(convId, cb) {
  return onSnapshot(query(collection(db, "conversations", convId, "messages"), orderBy("createdAt", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}

export async function sendMessage({ fromId, fromName, fromType, toId, toName, text, convId, isGroup }) {
  const cid = convId || convIdFor(fromId, toId);
  const convRef = doc(db, "conversations", cid);
  const snap = await getDoc(convRef);
  if (!snap.exists() && !isGroup) {
    await setDoc(convRef, {
      participants: [fromId, toId],
      participantNames: { [fromId]: fromName, [toId]: toName },
      participantEmojis: { [fromId]: emojiFor(fromType), [toId]: "👤" },
      lastMessage: text, lastMessageTime: serverTimestamp(),
      unreadCount: { [toId]: 1, [fromId]: 0 }, hiddenFor: [],
    });
  } else {
    const summary = { lastMessage: text, lastMessageTime: serverTimestamp(), hiddenFor: arrayRemove(fromId) };
    if (!isGroup && toId) summary["unreadCount." + toId] = increment(1);
    await updateDoc(convRef, summary);
  }
  await addDoc(collection(db, "conversations", cid, "messages"), { senderId: fromId, senderName: fromName, text, createdAt: serverTimestamp() });
  return cid;
}

export async function markRead(convId, uid) { try { await updateDoc(doc(db, "conversations", convId), { ["unreadCount." + uid]: 0 }); } catch (_) {} }

// ══════════════ MÜŞTERİ (customer) ══════════════

// Keşfet: yaklaşan etkinlikler (bugün 12s öncesinden itibaren), en yakın önce.
export async function discoverEvents() {
  // Test hesabının (mekan/organizatör) etkinlikleri herkese açık listelerde/haritada görünmez; test hesabıyla girilince görünür (test akışları).
  const viewerIsTest = isTestAccount(session.profile);
  const [snap, testIds] = await Promise.all([
    getDocs(query(collection(db, "events"), where("status", "==", "upcoming"))),
    viewerIsTest ? Promise.resolve(new Set()) : testAccountIds(),
  ]);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => !isEventOver(e) && ![e.venueId, e.organizerId, e.createdBy].some((x) => x && testIds.has(x)))
    .sort((a, b) => msOf(a) - msOf(b));
}
export async function eventById(id) { const s = await getDoc(doc(db, "events", id)); return s.exists() ? { id, ...s.data() } : null; }
export async function userById(id) { const s = await getDoc(doc(db, "users", id)); return s.exists() ? { id, ...s.data() } : null; }

// Popüler sanatçılar (gerçek/tamamlanmış kayıtlar)
export async function listRealArtists() {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "artist")));
  return hideTest(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => (a.displayName || "").trim() && (a.createdAt != null || (a.email || "").includes("@"))));
}

// Keşfet / arama: sanatçı GRUPLARI da sanatçı olarak listelenir (app HomeScreen ile aynı süzgeç: adı olan, üyesi olan,
// yasaklı olmayan; ayrıca test hesabının kurduğu grup gizli). Sanatçı kartı alanlarına uyarlanır: isGroup, displayName, genres.
// Kart grubun kendi sayfasına gider (groupHref = #/sanatci/<grupId> — sanatçı sayfası grup kimliğini de çözer).
export async function listDirectoryGroups() {
  const [snap, testIds] = await Promise.all([getDocs(collection(db, "groups")), testAccountIds()]);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((g) => String(g.name || "").trim() && Array.isArray(g.memberIds) && g.memberIds.length > 0 && g.banned !== true
      && !(g.createdBy && testIds.has(g.createdBy)))
    .map((g) => {
      const owner = g.createdBy || (Array.isArray(g.adminIds) && g.adminIds[0]) || g.memberIds[0];
      return {
        ...g, isGroup: true, displayName: String(g.name).trim(), genres: groupGenres(g),
        city: g.city || "", serviceCities: Array.isArray(g.serviceCities) ? g.serviceCities : [], photoURL: g.photoURL || null,
        followerCount: Number(g.followerCount) || 0,
        memberCount: g.memberIds.length, ownerId: owner || null, groupHref: groupHref(g.id),
      };
    });
}

// ── Sanatçı GRUPLARI (groups/{id}) — grup sayfası ──
// Web'de ayrı rota yok: #/sanatci/<grupId> (masaüstü public/sanatci.js + mobil pages/group.js) kimliği önce users'ta, sonra
// groups'ta arar. Etkinlikler grup performansında artistId = grupId yazdığı için eski "#/sanatci/<ev.artistId>" bağlantıları da çalışır.
// Uygulama yükseltmesi: grup dokümanı sanatçı profil alanlarını users/{uid} sanatçı dokümanıyla AYNI adlarla taşır (tagline, bio,
// genres[] — eski tek `genre`, city, district, packages, social …) + sunucu sayaçları avgRating/reviewCount/followerCount.
export const groupHref = (id) => "#/sanatci/" + encodeURIComponent(id);
export function groupGenres(g) {
  const list = Array.isArray(g?.genres) ? g.genres.filter((x) => typeof x === "string" && x.trim()) : [];
  return list.length ? list : (typeof g?.genre === "string" && g.genre.trim() ? [g.genre.trim()] : []);
}
export async function groupById(id) { const s = await getDoc(doc(db, "groups", id)); return s.exists() ? { id, ...s.data() } : null; }
// Grup dokümanını sanatçı sayfası alanlarına uyarla (isGroup + displayName + genres[]; diğer alanlar aynı adla gelir).
export function asGroupProfile(g) {
  const name = String(g.name || g.displayName || "").trim() || "Grup";
  return {
    ...g, isGroup: true, name, displayName: name, genres: groupGenres(g),
    memberIds: Array.isArray(g.memberIds) ? g.memberIds : [], adminIds: Array.isArray(g.adminIds) ? g.adminIds : [],
  };
}
// #/sanatci/:id çözümleyici: users/{id} sanatçıysa (ya da userType'sız eski kayıt) sanatçı; değilse groups/{id} (yasaklı değilse) grup.
// Kimlikler çakışmaz (auth uid ↔ otomatik doküman kimliği); grup kimliğiyle oluşmuş taslak users dokümanı (userType'sız) grubu gölgelemez.
export function pickPerformer(u, g) {
  if (g && g.banned !== true && (!u || u.userType !== "artist")) return asGroupProfile(g);
  return u;
}
// Grup iletişim kişisi (mesaj / serbest teklif isteği alıcısı): ödemeyi alan yönetici (geçerliyse) → kurucu → ilk yönetici → ilk üye.
export function groupContactId(g) {
  const admins = Array.isArray(g?.adminIds) ? g.adminIds : [], members = Array.isArray(g?.memberIds) ? g.memberIds : [];
  const pay = typeof g?.payoutAdminId === "string" && admins.includes(g.payoutAdminId) && members.includes(g.payoutAdminId) ? g.payoutAdminId : null;
  return pay || (typeof g?.createdBy === "string" && g.createdBy) || admins[0] || members[0] || null;
}
// Üye profilleri (memberIds → users) — sırayla: kurucu, yöneticiler, diğerleri. Okunamayan üye yedek adla kalır.
export async function groupMembers(g) {
  const ids = [...new Set(Array.isArray(g?.memberIds) ? g.memberIds : [])];
  const admins = Array.isArray(g?.adminIds) ? g.adminIds : [];
  const rank = (id) => (id === g?.createdBy ? 0 : admins.includes(id) ? 1 : 2);
  const list = await Promise.all(ids.map(async (id) => {
    const u = await userById(id).catch(() => null);
    return { id, user: u, name: String(u?.displayName || u?.name || "").trim() || "Sanatçı", photoURL: u?.photoURL || null,
      role: id === g?.createdBy ? "founder" : admins.includes(id) ? "admin" : "member" };
  }));
  return list.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "tr"));
}
// Grup etkinlikleri: grup performansı artistId = grupId yazar; bazı kayıtlar groupId taşır → iki tek alanlı sorgu birleşir (yeni indeks yok).
export async function eventsByGroup(gid) {
  const [a, b] = await Promise.all([
    getDocs(query(collection(db, "events"), where("artistId", "==", gid))),
    getDocs(query(collection(db, "events"), where("groupId", "==", gid))).catch(() => null),
  ]);
  const m = new Map();
  [...a.docs, ...(b ? b.docs : [])].forEach((d) => { if (!m.has(d.id)) m.set(d.id, { id: d.id, ...d.data() }); });
  return [...m.values()];
}
// Grup yorumları: reviews targetId == grupId, targetType "artist" (uygulama ve etkinlik sayfasıyla aynı). Bir süre "group"
// yazan sürüm olabilir → ikisi de okunur (mekan yorumu tipi yok).
export async function groupReviews(gid) {
  const s = await getDocs(query(collection(db, "reviews"), where("targetId", "==", gid)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => ["group", "artist"].includes(r.targetType ?? "group")).sort(byMs);
}
// targetType "artist": sunucu (functions/groupStats.js) grup kimliğini tanır ve puanı groups/{gid}.avgRating/reviewCount'a
// yazar (users/{gid} oluşturmaz); Top 10 / sıralama yalnız "artist" yorumlarını sayar. Kimlik kuralı: `${uid}_${grupId}`.
export async function submitGroupReview(uid, authorName, group, rating, comment, ev) {
  await setDoc(doc(db, "reviews", `${uid}_${group.id}`), { authorId: uid, authorName, authorType: "customer", targetId: group.id, targetName: group.displayName ?? group.name ?? "", targetType: "artist", rating, comment: comment ?? "", eventId: ev?.id ?? null, event: ev?.title ?? "", createdAt: serverTimestamp() });
}
// Grup takibi (favori) — app services/follow.ts: users/{uid}/followingGroups/{gid} + ayna groups/{gid}/followers/{uid}
// (web Top 10 / Favoriler / Takip ile aynı şekil; users/{gid}/followers aynasına yazılmaz → sahte users dokümanı yok).
export async function isFollowingGroup(uid, gid) { try { return (await getDoc(doc(db, "users", uid, "followingGroups", gid))).exists(); } catch { return false; } }
export async function followGroup(uid, g) {
  assertNotVenueFollow();
  const genre = (Array.isArray(g.genres) ? g.genres[0] : g.genre) ?? "";
  await setDoc(doc(db, "users", uid, "followingGroups", g.id), {
    groupId: g.id, groupName: g.name ?? g.displayName ?? "", targetType: "group", genre: genre || "", photoURL: g.photoURL ?? null, notifyEvents: true, followedAt: serverTimestamp(),
  });
  setDoc(doc(db, "groups", g.id, "followers", uid), { followedAt: serverTimestamp(), notifyEvents: true }).catch(() => {});
}
export async function unfollowGroup(uid, gid) {
  await deleteDoc(doc(db, "users", uid, "followingGroups", gid));
  deleteDoc(doc(db, "groups", gid, "followers", uid)).catch(() => {});
}
// Canlı takipçi sayısı (groups/{gid}/followers aynası); sunucu sayacı (followerCount) daha büyükse o (v2 aynası users/{gid}/followers).
export async function groupFollowerCount(g) {
  let live = null;
  try { live = (await getDocs(collection(db, "groups", g.id, "followers"))).size; } catch { live = null; }
  const server = Number(g.followerCount) || 0;
  return live == null ? server : Math.max(live, server);
}

// ── Katılım (events/{id}/attendees/{uid} + attendeeCount ±1) ──
export async function isAttending(eventId, uid) { try { return (await getDoc(doc(db, "events", eventId, "attendees", uid))).exists(); } catch { return false; } }
export async function attendEvent(ev, uid, displayName, anonymous) {
  // "Katılımlarda Adımı Gizle" YAZIM ANINDA taze okunur: session.profile bayat olabilir (ayar uygulamada / başka
  // sekmede değişti) → bayat false kişiyi listede açık gösterirdi. Okunamazsa çağıranın değeri; sunucu
  // (functions onAttendeeCreatedPrivacy) yine canlı ayara eşitler.
  let anon = anonymous === true;
  try {
    const me = await getDoc(doc(db, "users", uid));
    if (me.exists()) anon = me.data()?.privacySettings?.anonymousAttendance === true;
  } catch (_) {}
  await setDoc(doc(db, "events", ev.id, "attendees", uid), { userId: uid, displayName: displayName || "", anonymous: anon, joinedAt: serverTimestamp() });
  await updateDoc(doc(db, "events", ev.id), { attendeeCount: increment(1) });
}
export async function unattendEvent(eventId, uid) {
  await deleteDoc(doc(db, "events", eventId, "attendees", uid));
  await updateDoc(doc(db, "events", eventId), { attendeeCount: increment(-1) });
}
// Etkinlik katılımcı listesi (EventAttendeesScreen)
export async function eventAttendees(eventId) {
  const s = await getDocs(collection(db, "events", eventId, "attendees"));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function attendedEvents(uid) {
  const snap = await getDocs(query(collectionGroup(db, "attendees"), where("userId", "==", uid)));
  const out = [];
  for (const d of snap.docs) {
    try { const ev = await getDoc(d.ref.parent.parent); if (ev.exists()) out.push({ id: ev.id, ...ev.data(), joinedAt: d.data().joinedAt }); } catch (_) {}
  }
  return out.sort((a, b) => msOf(b) - msOf(a));
}

// ── Takip (following + ayna followers) ──
export async function isFollowing(uid, artistId) { try { return (await getDoc(doc(db, "users", uid, "following", artistId))).exists(); } catch { return false; } }
// MEKAN sosyal takip yapmaz: sanatçıyı / grubu yalnız gizli izleme listesine alır (watchArtist → users/{mekan}/watchedArtists;
// sanatçı görmez, takipçi sayısı değişmez, bildirim gitmez). Kural da reddeder (firestore.rules isVenueAccount) — savunma.
function assertNotVenueFollow() {
  if (session.profile?.userType === "venue") throw new Error("venue-social-follow");
}
export async function followArtist(uid, artist) {
  assertNotVenueFollow();
  const name = artist.displayName ?? artist.name ?? "";
  const genre = (Array.isArray(artist.genres) ? artist.genres[0] : artist.genre) ?? "";
  await setDoc(doc(db, "users", uid, "following", artist.id), { artistId: artist.id, artistName: name, genre, followedAt: serverTimestamp() });
  try { await setDoc(doc(db, "users", artist.id, "followers", uid), { followedAt: serverTimestamp() }); } catch (_) {}
  // Faz 2 — 'Beni Takip Et' halkası: sanatçıya yeni takipçi bildirimi (best-effort)
  try { await sendNotification(artist.id, { type: "new_follower", title: "Yeni takipçi", body: "Bir dinleyici seni takibe aldı.", extra: { followerId: uid } }); } catch (_) {}
}
export async function unfollowArtist(uid, artistId) {
  await deleteDoc(doc(db, "users", uid, "following", artistId));
  try { await deleteDoc(doc(db, "users", artistId, "followers", uid)); } catch (_) {}
}
export async function followingList(uid) { const s = await getDocs(collection(db, "users", uid, "following")); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
// Sanatçının canlı takipçi sayısı (followers alt koleksiyonu)
export async function artistFollowerCount(artistId) {
  try { return (await getDocs(collection(db, "users", artistId, "followers"))).size; } catch { return null; }
}
// Mekanın etkinlik yorumları (timeline, venueId filtresi — VenueDetail 'Etkinlik Yorumları')
export async function venueTimeline(venueId) {
  const s = await getDocs(query(collection(db, "timeline"), where("venueId", "==", venueId)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs).slice(0, 20);
}

// ── Favori mekan / etkinlik ──
export async function isFavVenue(uid, venueId) { try { return (await getDoc(doc(db, "users", uid, "favorites", venueId))).exists(); } catch { return false; } }
export async function favVenue(uid, v) { await setDoc(doc(db, "users", uid, "favorites", v.id), { venueId: v.id, venueName: v.displayName ?? v.name ?? "", city: v.city ?? "", addedAt: serverTimestamp() }); }
export async function unfavVenue(uid, venueId) { await deleteDoc(doc(db, "users", uid, "favorites", venueId)); }
export async function favVenues(uid) { const s = await getDocs(collection(db, "users", uid, "favorites")); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
export async function isFavEvent(uid, eventId) { try { return (await getDoc(doc(db, "users", uid, "favoriteEvents", eventId))).exists(); } catch { return false; } }
export async function favEvent(uid, ev) { await setDoc(doc(db, "users", uid, "favoriteEvents", ev.id), { title: ev.title ?? "", venue: ev.venueName ?? "", artist: ev.artistName ?? "", date: ev.date ?? "", genre: Array.isArray(ev.genre) ? ev.genre[0] : (ev.genre ?? ""), price: ev.ticketPrice ?? null, savedAt: serverTimestamp() }); }
export async function unfavEvent(uid, eventId) { await deleteDoc(doc(db, "users", uid, "favoriteEvents", eventId)); }
export async function favEvents(uid) { const s = await getDocs(collection(db, "users", uid, "favoriteEvents")); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }

// ── Yorumlar (reviews = sanatçı, venueReviews = mekan) ──
export async function artistReviews(artistId) {
  const s = await getDocs(query(collection(db, "reviews"), where("targetId", "==", artistId)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => (r.targetType ?? "artist") === "artist").sort(byMs);
}
export async function submitArtistReview(uid, authorName, artist, rating, comment, ev) {
  await setDoc(doc(db, "reviews", `${uid}_${artist.id}`), { authorId: uid, authorName, authorType: "customer", targetId: artist.id, targetName: artist.displayName ?? "", targetType: "artist", rating, comment: comment ?? "", eventId: ev?.id ?? null, event: ev?.title ?? "", createdAt: serverTimestamp() });
}
export async function getVenueReviews(venueId) {
  const s = await getDocs(query(collection(db, "venueReviews"), where("venueId", "==", venueId)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs);
}
export async function submitVenueReview(uid, authorName, venue, rating, comment, ev) {
  await setDoc(doc(db, "venueReviews", `${uid}_${venue.id}`), { authorId: uid, authorName, authorType: "customer", venueId: venue.id, venueName: venue.displayName ?? "", rating, overallRating: rating, comment: comment ?? "", eventId: ev?.id ?? null, event: ev?.title ?? "", createdAt: serverTimestamp() });
}
// Kendi yorumunu düzenle/sil (MyReviewsScreen — kurallar author'a izin verir; denorm'u CF günceller)
export async function updateMyReview(col, id, patch) { await updateDoc(doc(db, col, id), patch); }
export async function deleteMyReview(col, id) { await deleteDoc(doc(db, col, id)); }
export async function myReviews(uid) {
  const [a, v] = await Promise.all([
    getDocs(query(collection(db, "reviews"), where("authorId", "==", uid))),
    getDocs(query(collection(db, "venueReviews"), where("authorId", "==", uid))),
  ]);
  return [...a.docs.map((d) => ({ id: d.id, _col: "reviews", ...d.data() })), ...v.docs.map((d) => ({ id: d.id, _col: "venueReviews", ...d.data() }))].sort(byMs);
}

// ── Timeline (akış) ──
export function listenTimeline(cb) {
  return onSnapshot(query(collection(db, "timeline"), orderBy("createdAt", "desc"), limit(50)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}
export async function createPost(uid, name, city, content, extra = {}) {
  await addDoc(collection(db, "timeline"), {
    authorId: uid, authorName: name, authorCity: city ?? "",
    type: extra.type || "discovery", content,
    event: extra.event ?? null, venue: extra.venue ?? null, venueId: extra.venueId ?? null,
    rating: extra.rating ?? 0,
    likeCount: 0, commentCount: 0, createdAt: serverTimestamp(),
  });
}
// Gönderi yorumları (timeline/{postId}/comments)
export function listenComments(postId, cb) {
  return onSnapshot(query(collection(db, "timeline", postId, "comments"), orderBy("createdAt", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}
export async function addComment(postId, uid, name, text) {
  await addDoc(collection(db, "timeline", postId, "comments"), { authorId: uid, authorName: name, text, createdAt: serverTimestamp() });
  try { await updateDoc(doc(db, "timeline", postId), { commentCount: increment(1) }); } catch (_) {}
}
export async function isLiked(postId, uid) { try { return (await getDoc(doc(db, "timeline", postId, "likes", uid))).exists(); } catch { return false; } }
export async function toggleLike(postId, uid, liked) {
  if (liked) { await deleteDoc(doc(db, "timeline", postId, "likes", uid)); await updateDoc(doc(db, "timeline", postId), { likeCount: increment(-1) }); }
  else { await setDoc(doc(db, "timeline", postId, "likes", uid), { likedAt: serverTimestamp() }); await updateDoc(doc(db, "timeline", postId), { likeCount: increment(1) }); }
}

// ── Bildirimler ──
export function listenNotifications(uid, cb) {
  return onSnapshot(query(collection(db, "notifications"), where("toUserId", "==", uid), orderBy("createdAt", "desc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}
export async function markNotifRead(id) { try { await updateDoc(doc(db, "notifications", id), { read: true }); } catch (_) {} }
export async function deleteNotif(id) { try { await deleteDoc(doc(db, "notifications", id)); } catch (_) {} }


// ═══════════ APP PARİTE — organizer/venue/artist veri fonksiyonları ═══════════
export async function orgMembers(orgId) {
  try {
    const snap = await getDocs(query(collection(db, "organizations", orgId, "members"), orderBy("joinedAt", "asc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (_) {
    // orderBy başarısızsa (eksik alan/indeks) sıralamasız oku
    const snap = await getDocs(collection(db, "organizations", orgId, "members"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

// Üyeyi ekipten çıkar (yalnız owner — app'teki 'Ekipten Çıkar')
export async function removeOrgMember(orgId, memberDocId) {
  await deleteDoc(doc(db, "organizations", orgId, "members", memberDocId));
}

// Gönderilen personel davetleri (KURAL: organizerInvites yalnız invitedByUid == uid ile sorgulanabilir)
export async function orgInvites(uid) {
  const snap = await getDocs(query(collection(db, "organizerInvites"), where("invitedByUid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

// E-posta ile personel daveti — app TeamScreen invite modal şemasıyla birebir (duplicate kontrolü dahil)
export async function createOrgInvite({ orgId, orgName, invitedEmail, invitedByUid, invitedByName }) {
  const dup = await getDocs(query(collection(db, "organizerInvites"),
    where("invitedByUid", "==", invitedByUid),
    where("invitedEmail", "==", invitedEmail),
    where("status", "==", "pending")));
  if (!dup.empty) { const e = new Error("duplicate-invite"); e.code = "duplicate-invite"; throw e; }
  await addDoc(collection(db, "organizerInvites"), {
    orgId, orgName: orgName ?? "", invitedEmail,
    invitedByUid, invitedByName: invitedByName ?? "",
    status: "pending", createdAt: serverTimestamp(),
  });
}

// Etkinlik alanlarını güncelle (OrgEditEvent: yalnız title/venueName/description — app'in updateDoc'uyla birebir)
export async function updateEventFields(eventId, patch) {
  await updateDoc(doc(db, "events", eventId), patch);
}

// Etkinliği kalıcı sil (yalnız owner — OrgEditEvent 'Etkinliği Sil')
export async function deleteEventById(eventId) {
  await deleteDoc(doc(db, "events", eventId));
}

// Staff'a düzenleme izni ver (owner). arrayUnion import edilmediğinden oku-birleştir-yaz.
export async function approveEventEdit(eventId, staffId) {
  const s = await getDoc(doc(db, "events", eventId));
  if (!s.exists()) { const e = new Error("not-found"); e.code = "not-found"; throw e; }
  const arr = Array.isArray(s.data().editApprovedFor) ? s.data().editApprovedFor : [];
  if (!arr.includes(staffId)) await updateDoc(doc(db, "events", eventId), { editApprovedFor: [...arr, staffId] });
}

// Bildirim yaz — app notifications şemasıyla birebir (listenNotifications toUserId+createdAt okur;
// extra düz alan olarak yayılır: edit_request → {eventId, relatedUserId, staffId, staffName}).
// fromUserId = oturumdaki uid: kural (notifications create) fromUserId == auth.uid ister; extra ezemez.
export async function sendNotification(toUserId, { type, title, body, fromName, extra = {} }) {
  const fromUserId = auth.currentUser?.uid ?? null;
  if (!toUserId || toUserId === fromUserId) return; // kendine bildirim yok (app pushAppNotification gibi)
  await addDoc(collection(db, "notifications"), {
    toUserId, type: type ?? "info", title: title ?? "", body: body ?? "",
    read: false, createdAt: serverTimestamp(), ...extra,
    fromUserId, fromName: fromName ?? "",
  });
}

// Organizatör → mekana etkinlik isteği; app'in create modal'ındaki gibi SANATÇI alanlarıyla.
// (createVenueRequest'in artistId/artistName içeren üst kümesi; acceptOrgRequest bu alanları okur.)
export async function createOrgVenueRequest(profile, venue, f) {
  await addDoc(collection(db, "venueRequests"), {
    title: f.title,
    eventDate: f.date, eventTime: f.time ?? "", description: f.description ?? "",
    bannerUrl: f.bannerUrl ?? null,
    ...posterFields(f),
    artistId: f.artistId ?? null, artistName: f.artistName ?? "",
    organizerId: profile.orgId ?? profile.id,
    organizerName: profile.orgName ?? profile.displayName ?? "",
    createdByUid: profile.id,
    venueId: venue.id, venueName: venue.displayName ?? "",
    ...rentalFeeField(f.rentalFee),
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function venueResidencies(uid) {
  const snap = await getDocs(query(collection(db, "residencies"), where("venueId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.status === "pending" || r.status === "active");
}

// Anlaşmayı iptal et (app: status='cancelled' + cancelledBy)
export async function cancelResidencyDoc(id, uid) {
  await updateDoc(doc(db, "residencies", id), { status: "cancelled", cancelledBy: uid ?? null, updatedAt: serverTimestamp() });
}

// ── Etkinlik güncelle / sil (EditEventScreen karşılığı; web'de endAt yazmak için de kullanılır) ──
export async function updateEvent(id, patch) {
  await updateDoc(doc(db, "events", id), { ...patch, updatedAt: serverTimestamp() });
}
// Düzenleme kaydı — app'in 2 günlük düzenleme kilidi için lastEditedAt damgalar.
export async function saveEventEdits(id, patch) {
  await updateDoc(doc(db, "events", id), { ...patch, lastEditedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function deleteEvent(id) { await deleteDoc(doc(db, "events", id)); }

// ── Mekanın gizli sanatçı takip listesi (users/{uid}/watchedArtists) — yalnız mekan görür ──
// Alanlar uygulamayla BİREBİR (ArtistDetail / Sanatçı Bul: artistId, artistName, genre, watchedAt); grup kimliği de olur.
export async function watchArtist(uid, artist) {
  const name = artist.displayName ?? artist.name ?? "";
  const genre = (Array.isArray(artist.genres) ? artist.genres[0] : artist.genre) ?? "";
  await setDoc(doc(db, "users", uid, "watchedArtists", artist.id), {
    artistId: artist.id, artistName: name, genre, watchedAt: serverTimestamp(),
  });
}
export async function unwatchArtist(uid, artistId) {
  await deleteDoc(doc(db, "users", uid, "watchedArtists", artistId));
}
export async function watchedArtists(uid) {
  const snap = await getDocs(collection(db, "users", uid, "watchedArtists"));
  // Eski web kayıtları createdAt yazıyordu → watchedAt yoksa ona düşülür (geriye uyum)
  return snap.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, watchedAt: x.watchedAt ?? x.createdAt ?? null }; });
}

// ── Sanatçının etkinlikleri (ArtistPerformanceScreen: geçmiş performans + katılım) ──
export async function eventsByArtist(artistId) {
  const snap = await getDocs(query(collection(db, "events"), where("artistId", "==", artistId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Mekanın kabul edilmiş davetleri (ArtistReviewScreen listesi + home 'Onaylı' durumu) ──
export async function venueAcceptedInvitations(uid) {
  const snap = await getDocs(query(collection(db, "invitations"),
    where("venueId", "==", uid), where("status", "==", "accepted")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Aynı sanatçı + aynı tarih için mevcut (reddedilmemiş) teklif var mı? (çift teklif koruması)
export async function findExistingInvitation(venueId, artistId, eventDate) {
  try {
    const snap = await getDocs(query(collection(db, "invitations"),
      where("venueId", "==", venueId), where("artistId", "==", artistId), where("eventDate", "==", eventDate)));
    const hit = snap.docs.find((d) => d.data().status !== "rejected");
    return hit ? { id: hit.id, ...hit.data() } : null;
  } catch { return null; }
}

// ── Gruplar — FindArtist 'Gruplar' filtresi (koleksiyon yoksa boş liste döner) ──

// Grup daveti — app gibi tüm üyelere yayılır (fan-out); üye yoksa tek doküman yazılır.
export async function createGroupInvitation(venue, group, f) {
  const base = {
    venueId: venue.id, venueName: venue.displayName ?? "",
    groupId: group.id, groupName: group.name ?? group.displayName ?? "Grup",
    artistName: group.name ?? group.displayName ?? "Grup",
    genre: (Array.isArray(group.genres) ? group.genres[0] : group.genre) ?? "",
    eventDate: f.date, eventTime: f.time, fee: Number(f.fee),
    message: f.message ?? "", photoUrl: f.photoUrl ?? null, eventId: f.eventId ?? null,
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  // TEK davet (uygulama venue/FindArtistScreen ile aynı model: groupId, artistId YOK). Grubun YÖNETİCİSİ kabul / ret /
  // karşı teklif yapar, tüm üyeler görür; sunucu (notify handleNewInvitation) üyelerin hepsine bildirim gönderir; ödeme
  // tek tahsilat → grubun "ödemeyi alan yöneticisi"ne (functions/payments.js groupPayee). Eski üye başına (artistId'li)
  // davetler okunmaya devam eder.
  await addDoc(collection(db, "invitations"), base);
}

// ── Mekan → sanatçı değerlendirmesi (reviews, {uid}_{artistId} deterministik id — kural uyumlu) ──
export async function submitVenueArtistReview(uid, authorName, artist, { rating, ratings, comment }) {
  await setDoc(doc(db, "reviews", `${uid}_${artist.id}`), {
    authorId: uid, authorName: authorName ?? "", authorType: "venue",
    targetId: artist.id,
    targetName: artist.artistName ?? artist.displayName ?? artist.name ?? "",
    targetType: "artist",
    rating: Number(rating) || 0, ratings: ratings ?? {}, comment: comment ?? "",
    createdAt: serverTimestamp(),
  });
}

export function listenArtistOffers(uid, cb) {
  return onSnapshot(
    query(collection(db, "invitations"), where("artistId", "==", uid), where("status", "==", "pending")),
    (snap) => cb(snap.docs.map((d) => {
      const x = d.data();
      const fee = axParseTL(x.fee);
      return {
        id: d.id,
        venue: x.venueName ?? "Mekan",
        dateISO: x.eventDate ?? "",
        date: x.eventDate ? axIsoToTR(x.eventDate) : "—",
        time: x.eventTime ?? "—",
        feeRaw: x.fee ?? null,
        fee: fee != null ? "₺" + fee.toLocaleString("tr-TR") : "Belirtilmemiş",
        genre: x.genre ?? "—",
        venueId: x.venueId,
        message: x.message,
        eventId: x.eventId ?? null,
        photoUrl: x.photoUrl ?? null,
      };
    })),
    () => cb([]),
  );
}

// ── Sanatçı: kabul edilmiş davetler (yaklaşan gig + kazanç + takvim) — canlı ──
export function listenArtistAccepted(uid, cb) {
  return onSnapshot(
    query(collection(db, "invitations"), where("artistId", "==", uid), where("status", "==", "accepted")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );
}

// Tek seferlik: kabul edilmiş davetler (Mekan Değerlendir + profil istatistiği)
export async function artistAcceptedInvitations(uid) {
  const snap = await getDocs(query(collection(db, "invitations"), where("artistId", "==", uid), where("status", "==", "accepted")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Sanatçı: rezidanslar (pending+active) — canlı ──
export function listenArtistResidencies(uid, cb) {
  return onSnapshot(
    query(collection(db, "residencies"), where("artistId", "==", uid), where("status", "in", ["pending", "active"])),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );
}

// Rezidans durum güncelle (sanatçı kabul/ret/iptal) — app setResidencyStatus birebir
export async function setResidencyStatus(id, status, byUid) {
  if (status === "active") await assertTaxProfile(byUid);
  await updateDoc(doc(db, "residencies", id), {
    status,
    cancelledBy: status === "cancelled" ? byUid : null,
    updatedAt: serverTimestamp(),
  });
}

// Aktif rezidansı (mekanla anlaşma) sanatçının user dokümanına DENORMALİZE et.
// Kurallar başkasının residencies'ini okutmaz → kamusal profil için band burada saklanır.
// Sanatçı KENDİ profilini açınca / rezidans kabul-iptal edince çağrılır (owner yazar).
const _RES_DAY_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
function _fmtResDays(days) {
  return Array.isArray(days)
    ? [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => _RES_DAY_TR[d]).filter(Boolean).join(", ")
    : "";
}
export async function syncResidentDenorm(uid, current) {
  let residentVenue = "", residentDays = "";
  try {
    const snap = await getDocs(query(collection(db, "residencies"), where("artistId", "==", uid), where("status", "==", "active")));
    if (!snap.empty) {
      const r = snap.docs.map((d) => d.data())
        .sort((a, b) => ((b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0)))[0];
      residentVenue = r.venueName || "";
      residentDays = _fmtResDays(r.daysOfWeek);
    }
    if (!current || current.residentVenue !== residentVenue || current.residentDays !== residentDays) {
      await updateDoc(doc(db, "users", uid), { residentVenue, residentDays });
    }
  } catch (_) { /* best-effort */ }
  return { residentVenue, residentDays };
}

// Uygulama içi bildirim (notifications) — app pushAppNotification birebir
export async function pushAppNotification(opts) {
  if (!opts.toUserId || opts.toUserId === opts.fromUserId) return; // kendine bildirim yok
  await addDoc(collection(db, "notifications"), {
    toUserId: opts.toUserId, fromUserId: opts.fromUserId, fromName: opts.fromName ?? "",
    type: opts.type, title: opts.title, body: opts.body,
    eventId: opts.eventId ?? null, relatedUserId: opts.relatedUserId ?? null,
    read: false, createdAt: serverTimestamp(),
  });
}

// ── Teklif akışı konuşma mesajı (app services/offerChat.postOfferMessage birebir) ──
export async function postOfferMessage({ fromId, fromName, fromEmoji, toId, toName, toEmoji, text, type, invitationId, offerMeta }) {
  if (!fromId || !toId || fromId === toId) return;
  const cid = convIdFor(fromId, toId);
  const convRef = doc(db, "conversations", cid);
  const snap = await getDoc(convRef);
  if (!snap.exists()) {
    await setDoc(convRef, {
      participants: [fromId, toId],
      participantNames: { [fromId]: fromName, [toId]: toName },
      participantEmojis: { [fromId]: fromEmoji, [toId]: toEmoji },
      lastMessage: text, lastMessageTime: serverTimestamp(),
      unreadCount: { [toId]: 1, [fromId]: 0 }, hiddenFor: [],
    });
  } else {
    await updateDoc(convRef, {
      lastMessage: text, lastMessageTime: serverTimestamp(),
      hiddenFor: arrayRemove(fromId),
      ["unreadCount." + toId]: increment(1),
    });
  }
  const msg = { senderId: fromId, senderName: fromName, text, createdAt: serverTimestamp() };
  if (type) msg.type = type;                       // "offer" → sohbette Evet/Hayır butonlu kart
  if (invitationId) msg.invitationId = invitationId;
  if (offerMeta) msg.offerMeta = offerMeta;
  await addDoc(collection(db, "conversations", cid, "messages"), msg);
}

// Davet durumu (yarış koruması: mesajdan yanıtlarken hâlâ pending mi?).
export async function getInvitationStatus(id) {
  try { const s = await getDoc(doc(db, "invitations", id)); return s.exists() ? (s.data().status ?? null) : null; }
  catch { return null; }
}

// ── Teklif kabul/ret — app HomeScreen/OfferDetail handleAction AKIŞI BİREBİR ──
// Kabul: etkinliğe bağla/oluştur (NON-FATAL) → daveti güncelle → konuşmaya statik durum
// mesajı (best-effort). me = { uid, name }.
// VERGİ BİLGİSİ KAPISI: sanatçı profilini Vergi Bilgileri olmadan kullanabilir ama mekanla ANLAŞAMAZ (teklif / rezidans kabulü).
// Kural tarafı: firestore.rules invArtistUpdateOk / invGroupAdminDecisionOk / residencies (taxProfiles/{uid} var olmalı).
export const TAX_REQUIRED_CODE = "tax-profile-required";
export async function assertTaxProfile(uid) {
  if (!uid || String(uid).startsWith("demo_")) return;
  const s = await getDoc(doc(db, "taxProfiles", uid));
  if (!s.exists()) {
    const e = new Error("Teklif kabul etmek için önce Vergi Bilgilerini doldurmalısın.");
    e.code = TAX_REQUIRED_CODE;
    throw e;
  }
}

export async function respondToOffer(offer, action, me) {
  if (action === "accept") await assertTaxProfile(me?.uid);
  if (action === "accept") {
    try {
      if (offer.eventId) {
        // Mevcut etkinliğe bağla (çift etkinlik OLUŞTURMA)
        await updateDoc(doc(db, "events", offer.eventId), {
          artistId: me.uid,
          artistName: me.name ?? "",
          fee: axParseTL(offer.feeRaw ?? offer.fee) ?? 0,
        });
      } else {
        // Serbest davet — mekan panelinde görünmesi için yeni etkinlik yaz
        const { date: evDisplay, eventAt } = axEventDateFields(offer.dateISO || offer.date);
        await addDoc(collection(db, "events"), {
          title: `${me.name ?? "Sanatçı"} — ${offer.venue ?? "Mekan"}`,
          venueId: offer.venueId ?? null,
          venueName: offer.venue ?? "",
          artistId: me.uid,
          artistName: me.name ?? "",
          date: evDisplay,
          eventAt,
          startTime: offer.time && offer.time !== "—" ? offer.time : "",
          genre: offer.genre && offer.genre !== "—" ? [offer.genre] : [],
          fee: axParseTL(offer.feeRaw ?? offer.fee) ?? 0,
          bannerUrl: offer.photoUrl ?? null,
          status: "upcoming",
          attendeeCount: 0,
          invitationId: offer.id,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.warn("[OfferAccept] event write failed (kabul yine de devam)", e); }
  }

  await updateDoc(doc(db, "invitations", offer.id), {
    status: action === "accept" ? "accepted" : "rejected",
    updatedAt: serverTimestamp(),
  });

  // Statik durum mesajı — best-effort, karar mesaj yazılamasa da geçerli
  if (offer.venueId) {
    postOfferMessage({
      fromId: me.uid, fromName: me.name ?? "Sanatçı", fromEmoji: "🎤",
      toId: offer.venueId, toName: offer.venue ?? "Mekan", toEmoji: "🏢",
      text: action === "accept"
        ? `Teklif kabul edildi${offer.date && offer.date !== "—" ? ` — ${offer.date}` : ""}${offer.time && offer.time !== "—" ? ` · ${offer.time}` : ""}`
        : "Teklif reddedildi",
    }).catch(() => {});
  }
}

// ── Sanatçının verdiği mekan değerlendirmeleri (mükerrer kontrol) ──
export async function artistVenueReviewsGiven(uid) {
  const snap = await getDocs(query(collection(db, "venueReviews"), where("authorId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Sanatçı → mekan değerlendirmesi (app VenueReviewScreen şemasıyla birebir).
// Deterministik doküman kimliği `${uid}_${venueId}` — kural bu id'yi zorunlu kılar.
export async function submitArtistVenueReview(uid, f) {
  const isAnonymous = f.visibility === "anonymous";
  await setDoc(doc(db, "venueReviews", `${uid}_${f.venueId}`), {
    artistId: uid,
    artistName: isAnonymous ? "Anonim Sanatçı" : f.artistName,
    authorName: isAnonymous ? "Anonim Sanatçı" : f.artistName,
    authorId: uid,
    authorType: "artist",
    visibility: f.visibility,          // 'everyone' | 'artists' | 'anonymous'
    isAnonymous,                        // geriye dönük uyum
    venueId: f.venueId,
    venueName: f.venueName,
    ratings: f.ratings,                 // { payment, equipment, treatment, communication }
    overallRating: f.overallRating,
    comment: (f.comment || "").trim(),
    createdAt: serverTimestamp(),
  });
}

// ── Top 10: sanatçı puanları CANLI reviews'tan (app services/ratings birebir) ──
// Not: kural gereği hedefi kendisi olan sanatçı tüm yorumları okuyamayabilir;
// çağıran taraf .catch(() => new Map()) ile boş haritayla devam etmeli.
export async function fetchArtistRatings() {
  const sums = new Map();
  const snap = await getDocs(query(collection(db, "reviews"), where("targetType", "==", "artist")));
  snap.docs.forEach((d) => {
    const x = d.data();
    const rating = x.rating ?? 0;
    if (!x.targetId || !(rating > 0)) return;
    const cur = sums.get(x.targetId) ?? { sum: 0, count: 0 };
    cur.sum += rating; cur.count += 1;
    sums.set(x.targetId, cur);
  });
  const out = new Map();
  sums.forEach((v, k) => out.set(k, { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count }));
  return out;
}

// Bayesian (ağırlıklı) puan — app ratings.ts ile birebir. Az yorumlu 5.0'lar tepeye
// zıplamaz; çok yorumlu yüksek puanlar hak ettiği yeri alır.
export const BAYES_C = 8;
export function bayesianScore(avg, count, mean, C = BAYES_C) { return (C * mean + avg * count) / (C + count); }
export function ratingsGlobalMean(map) { let sum = 0, n = 0; map.forEach((v) => { sum += v.avg * v.count; n += v.count; }); return n > 0 ? sum / n : 4; }

// ── Top 10: gruplar (şehir filtresi opsiyonel) ──
export async function listGroups(city) {
  const base = collection(db, "groups");
  const snap = await getDocs(city ? query(base, where("city", "==", city)) : base);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

