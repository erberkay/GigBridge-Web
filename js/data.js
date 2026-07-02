// Veri katmanı — app'in Firestore şemasıyla birebir sorgular.
import {
  db, collection, collectionGroup, doc, getDoc, getDocs, updateDoc, addDoc, setDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayRemove, increment,
  storage, ref, uploadBytes, getDownloadURL,
} from "./firebase.js";

// Görsel yükle (Storage) → indirilebilir URL. event_banners/{uid}/... sahibe yazılabilir.
export async function uploadImage(file, uid) {
  if (!file) return null;
  const r = ref(storage, `event_banners/${uid}/${Date.now()}_${(file.name || "img").replace(/[^\w.-]/g, "")}`);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
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
  await addDoc(collection(db, "invitations"), {
    venueId: venue.id, venueName: venue.displayName ?? "",
    artistId: artist.id, artistName: artist.displayName ?? artist.name ?? "",
    genre: (Array.isArray(artist.genres) ? artist.genres[0] : artist.genre) ?? "",
    eventDate: f.date, eventTime: f.time, fee: Number(f.fee),
    message: f.message ?? "", photoUrl: f.photoUrl ?? null, eventId: f.eventId ?? null,
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
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

// ══════════════ MÜŞTERİ (customer) ══════════════

// Keşfet: yaklaşan etkinlikler (bugün 12s öncesinden itibaren), en yakın önce.
export async function discoverEvents() {
  const snap = await getDocs(query(collection(db, "events"), where("status", "==", "upcoming")));
  const now = Date.now();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => { const ms = msOf(e); return ms === 0 || ms >= now - 12 * 3600e3; })
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
export async function attendEvent(ev, uid, displayName) {
  await setDoc(doc(db, "events", ev.id, "attendees", uid), { userId: uid, displayName: displayName || "", joinedAt: serverTimestamp() });
  await updateDoc(doc(db, "events", ev.id), { attendeeCount: increment(1) });
}
export async function unattendEvent(eventId, uid) {
  await deleteDoc(doc(db, "events", eventId, "attendees", uid));
  await updateDoc(doc(db, "events", eventId), { attendeeCount: increment(-1) });
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
}
export async function unfollowArtist(uid, artistId) {
  await deleteDoc(doc(db, "users", uid, "following", artistId));
  try { await deleteDoc(doc(db, "users", artistId, "followers", uid)); } catch (_) {}
}
export async function followingList(uid) { const s = await getDocs(collection(db, "users", uid, "following")); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }

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
export async function submitArtistReview(uid, authorName, artist, rating, comment) {
  await setDoc(doc(db, "reviews", `${uid}_${artist.id}`), { authorId: uid, authorName, authorType: "customer", targetId: artist.id, targetName: artist.displayName ?? "", targetType: "artist", rating, comment: comment ?? "", createdAt: serverTimestamp() });
}
export async function getVenueReviews(venueId) {
  const s = await getDocs(query(collection(db, "venueReviews"), where("venueId", "==", venueId)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byMs);
}
export async function submitVenueReview(uid, authorName, venue, rating, comment) {
  await setDoc(doc(db, "venueReviews", `${uid}_${venue.id}`), { authorId: uid, authorName, authorType: "customer", venueId: venue.id, venueName: venue.displayName ?? "", rating, overallRating: rating, comment: comment ?? "", createdAt: serverTimestamp() });
}
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
export async function createPost(uid, name, city, content) {
  await addDoc(collection(db, "timeline"), { authorId: uid, authorName: name, authorCity: city ?? "", type: "discovery", content, likeCount: 0, commentCount: 0, createdAt: serverTimestamp() });
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
