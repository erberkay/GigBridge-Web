// Veri katmanı — app'in Firestore şemasıyla birebir sorgular.
import {
  db, collection, collectionGroup, doc, getDoc, getDocs, updateDoc, addDoc, setDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayRemove, increment,
  storage, ref, uploadBytes, getDownloadURL, deleteObject, auth, deleteUser,
} from "./firebase.js";
// Sayfaların data.js üzerinden alabilmesi için yeniden dışa aktar (artist.js isim cooldown damgası).
export { serverTimestamp } from "./firebase.js";

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

// Mekan listesi (organizatörün istek göndereceği mekanlar)
export async function listVenues() {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "venue")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.approved !== false);
}

// ── Admin ──
export async function listPendingByRole(role) {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", role)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.approved === false && u.rejected !== true);
}
export async function approveUser(uid) { await updateDoc(doc(db, "users", uid), { approved: true, approvedAt: serverTimestamp() }); }
export async function rejectUser(uid) { await updateDoc(doc(db, "users", uid), { approved: false, rejected: true }); }

export async function listPendingVip() {
  const snap = await getDocs(query(collection(db, "events"), where("vipStatus", "==", "pending")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function approveVip(id) { await updateDoc(doc(db, "events", id), { vipStatus: "approved", vipApprovedAt: serverTimestamp() }); }
export async function rejectVip(id) { await updateDoc(doc(db, "events", id), { vipStatus: "rejected" }); }

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
    status: "upcoming",
    isNew: true,
    attendeeCount: 0,
    capacity: f.capacity ? Number(f.capacity) : (venue?.capacity ?? null),
    city: venue?.city ?? venue?.location?.city ?? null,
    district: venue?.district ?? null,
    location: loc,
    vipStatus: f.vip ? "pending" : null,
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
export async function createVenueRequest(profile, venue, f) {
  await addDoc(collection(db, "venueRequests"), {
    title: f.title,
    eventDate: f.date, eventTime: f.time, description: f.description ?? "",
    bannerUrl: f.bannerUrl ?? null,
    organizerId: profile.orgId ?? profile.id,
    organizerName: profile.orgName ?? profile.displayName ?? "",
    createdByUid: profile.id,
    venueId: venue.id, venueName: venue.displayName ?? "",
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// ── Mesajlaşma (MessagesScreen şemasıyla birebir) ──
export function convIdFor(a, b) { return [a, b].sort().join("__"); }
const emojiFor = (t) => (t === "artist" ? "🎤" : t === "venue" ? "🏢" : t === "organizer" ? "📣" : "👤");

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
  const snap = await getDocs(query(collection(db, "events"), where("status", "==", "upcoming")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => !isEventOver(e))
    .sort((a, b) => msOf(a) - msOf(b));
}
export async function eventById(id) { const s = await getDoc(doc(db, "events", id)); return s.exists() ? { id, ...s.data() } : null; }
export async function userById(id) { const s = await getDoc(doc(db, "users", id)); return s.exists() ? { id, ...s.data() } : null; }

// Popüler sanatçılar (gerçek/tamamlanmış kayıtlar)
export async function listRealArtists() {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "artist")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => (a.displayName || "").trim() && (a.createdAt != null || (a.email || "").includes("@")));
}

// ── Katılım (events/{id}/attendees/{uid} + attendeeCount ±1) ──
export async function isAttending(eventId, uid) { try { return (await getDoc(doc(db, "events", eventId, "attendees", uid))).exists(); } catch { return false; } }
export async function attendEvent(ev, uid, displayName, anonymous) {
  await setDoc(doc(db, "events", ev.id, "attendees", uid), { userId: uid, displayName: displayName || "", anonymous: anonymous === true, joinedAt: serverTimestamp() });
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
export async function followArtist(uid, artist) {
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
// extra düz alan olarak yayılır: edit_request → {eventId, staffId, staffName})
export async function sendNotification(toUserId, { type, title, body, extra = {} }) {
  await addDoc(collection(db, "notifications"), {
    toUserId, type: type ?? "info", title: title ?? "", body: body ?? "",
    read: false, createdAt: serverTimestamp(), ...extra,
  });
}

// Organizatör → mekana etkinlik isteği; app'in create modal'ındaki gibi SANATÇI alanlarıyla.
// (createVenueRequest'in artistId/artistName içeren üst kümesi; acceptOrgRequest bu alanları okur.)
export async function createOrgVenueRequest(profile, venue, f) {
  await addDoc(collection(db, "venueRequests"), {
    title: f.title,
    eventDate: f.date, eventTime: f.time ?? "", description: f.description ?? "",
    bannerUrl: f.bannerUrl ?? null,
    artistId: f.artistId ?? null, artistName: f.artistName ?? "",
    organizerId: profile.orgId ?? profile.id,
    organizerName: profile.orgName ?? profile.displayName ?? "",
    createdByUid: profile.id,
    venueId: venue.id, venueName: venue.displayName ?? "",
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
export async function watchArtist(uid, artist) {
  const name = artist.displayName ?? artist.name ?? "";
  const genre = (Array.isArray(artist.genres) ? artist.genres[0] : artist.genre) ?? "";
  await setDoc(doc(db, "users", uid, "watchedArtists", artist.id), {
    artistId: artist.id, artistName: name, genre, createdAt: serverTimestamp(),
  });
}
export async function unwatchArtist(uid, artistId) {
  await deleteDoc(doc(db, "users", uid, "watchedArtists", artistId));
}
export async function watchedArtists(uid) {
  const snap = await getDocs(collection(db, "users", uid, "watchedArtists"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  const members = Array.isArray(group.memberIds) ? group.memberIds : [];
  if (!members.length) { await addDoc(collection(db, "invitations"), base); return; }
  for (const mid of members) await addDoc(collection(db, "invitations"), { ...base, artistId: mid });
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
  await updateDoc(doc(db, "residencies", id), {
    status,
    cancelledBy: status === "cancelled" ? byUid : null,
    updatedAt: serverTimestamp(),
  });
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
export async function respondToOffer(offer, action, me) {
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

