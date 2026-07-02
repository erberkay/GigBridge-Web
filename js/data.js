// Veri katmanı — app'in Firestore şemasıyla birebir sorgular.
import {
  db, collection, doc, getDoc, getDocs, updateDoc, addDoc, setDoc,
  query, where, orderBy, serverTimestamp,
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
