// Veri katmanı — app'in Firestore şemasıyla birebir sorgular.
import {
  db, collection, doc, getDoc, getDocs, updateDoc, addDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, arrayRemove, increment,
} from "./firebase.js";

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

// ── Etkinlikler ──
export async function venueEvents(uid) {
  const snap = await getDocs(query(collection(db, "events"), where("venueId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs);
}
export async function organizerEvents(orgId) {
  const snap = await getDocs(query(collection(db, "events"), where("organizerId", "==", orgId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs);
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
    artistId: null, artistName: "",
    date: f.date ?? "",
    eventAt: eventAt && !isNaN(eventAt) ? eventAt : null,
    startTime: f.time ?? "",
    genre: f.genre ? [f.genre] : [],
    ticketPrice: f.price ? Number(f.price) : null,
    description: f.description ?? "",
    bannerUrl: null,
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

// ── Mekan: sanatçı bul + davet ──
export async function listArtists() {
  const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "artist")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function createInvitation(venue, artist, f) {
  await addDoc(collection(db, "invitations"), {
    venueId: venue.id, venueName: venue.displayName ?? "",
    artistId: artist.id, artistName: artist.displayName ?? artist.name ?? "",
    genre: (Array.isArray(artist.genres) ? artist.genres[0] : artist.genre) ?? "",
    eventDate: f.date, eventTime: f.time, fee: Number(f.fee),
    message: f.message ?? "", photoUrl: null, eventId: null,
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// ── Organizatör: mekana istek gönder (venueRequests) ──
export async function createVenueRequest(profile, venue, f) {
  await addDoc(collection(db, "venueRequests"), {
    title: f.title,
    eventDate: f.date, eventTime: f.time, description: f.description ?? "",
    bannerUrl: null,
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

export function listenConversations(uid, cb) {
  return onSnapshot(query(collection(db, "conversations"), where("participants", "array-contains", uid)), (snap) => {
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
        };
      })
      .sort((a, b) => msOf(b) - msOf(a));
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
