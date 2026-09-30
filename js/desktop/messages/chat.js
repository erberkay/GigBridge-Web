// ORTAK SOHBET ÇEKİRDEĞİ — WebMesajlar (dinleyici, #/mesajlar) + WebPanelMesajlar (#/artist|venue|organizer/mesaj).
// Sahibi: WebMesajlar uygulayıcısı (specs/foundation.md §3 "WebMesajlar ↔ WebPanelMesajlar ortak sohbet parçaları").
// Spec: specs/hesap.md § WebMesajlar + specs/sanatci.md § WebPanelMesajlar. Artboard'lar: WebMesajlar / WebPanelMesajlar.
//
// createChat({ host, ns, variant, role, ctx }) → { destroy(), update(query), onSession(s) }
//   host    : içeriğin çizileceği öğe (dinleyici: publicShell.main içindeki div · panel: panelShell.content)
//   ns      : sınıf ön eki ("dk-mesajlar" | "dk-panel-mesajlar") — tüm sınıflar `${ns}-*`; CSS her görünümün kendi dosyasında
//   variant : "listener" (340 / esnek / 300, kişi özeti + sıradaki etkinlik) | "panel" (320 / esnek / 280, sekmeler + teklif kartı + son teklif)
//   role    : oturum sahibinin rolü (customer | artist | venue | organizer)
//
// Legacy (js/pages/messages.js messagesView) davranışları KORUNDU:
//   · listenConversations (live.js subscribeLive ile kabuklarla paylaşılan TEK dinleyici) → satır: foto (otherPhoto) ya da baş harf, ad,
//     son mesaj zamanı, son mesaj, okunmamış sayısı · açılan konuşmada markRead(conv.id, uid) (+ açıkken yeni mesaj gelirse yeniden)
//   · listenMessages(convId) (createdAt artan) · sendMessage({...}) aynı şekil (fromName = displayName || orgName || "Ben", fromType,
//     toId, toName, text, convId, isGroup) · maxlength 1000 · Enter gönderir · hata → toast "Mesaj gönderilemedi" + metin geri yazılır
//   · Yeni mesaj: mekan → listArtists (ad/şehir araması) · diğerleri → followingList (yalnız takip edilenler) · legacy boş metinleri
//   · Teklif balonu (m.type === "offer" && alıcı ben && invitationId): getInvitationStatus → zaten yanıtlandıysa durum; değilse
//     respondToOffer({ id, ...offerInfo, date }, accept|reject, { uid, name }) · toast "{Mekan} teklifi kabul edildi ✓" / "Teklif reddedildi" /
//     "İşlem başarısız, tekrar dene". offerInfo = invitations/{id} dokümanı + mesaj offerMeta'sı (web { venue, dateISO, time, feeRaw } VE
//     uygulama FindArtistScreen { venueName, eventDate, eventTime, fee } şekilleri) → kart ve kabulde yazılan etkinlik iki yolda da doğru.
//   · Grup sohbetleri (gönderen adı, "Grup sohbeti") · boş gelen kutusu + boş sohbet metinleri · requestChat() bekleyen hedefi (aşağıya bak)
// Tasarımın getirdikleri: 3 bölme, arama, okunmamış vurgusu, rol noktası, gün ayırıcıları, balon gruplama, sayaç, yeni mesaj animasyonu,
//   kişi özeti (takip + sıradaki etkinlik) / mekan özeti (son teklif), sekmeler (Tümü/Okunmamış/Teklifler), teklif etiketleri.
// Arka uç gerektirenler GİZLİ: "Okundu/Gönderildi" (readBy) ve "yazıyor…" (typing) — yazılmıyor, gösterilmiyor (sahibi notu).
// Uygulama paritesi (yalnız okuma): konuşma dokümanında blockedBy / deletedGroup varsa yazma kutusu yerine uygulamanın uyarı metni.
// "Diğer seçenekler" (dinleyici): "Sohbeti sil" = uygulamanın deleteConversation akışı birebir (hiddenFor arrayUnion(me); herkes gizlediyse sil).
// URL: ?c={convId} (replaceState) — paylaşılabilir; update(query) geri/ileri'de uygular.
// Okundu: seçilen konuşma okundu yapılır; otomatik açılan konuşma yalnız sekme görünür+odaklıyken (otomasyon hariç) ya da ilk etkileşimde.
//   Okundu yazılana dek etkin satır/"N YENİ" gerçek sayıyı gösterir → kabuk Mesajlar rozetiyle tutarlı (ayrıntı: createChat içi).
// ≤1023: tek bölmeli akış (liste → sohbet → geri), ≥1024: liste + sohbet, ≥1280: + sağ bölme.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import * as legacyMessages from "../../pages/messages.js";
import {
  listenMessages, sendMessage, markRead, convIdFor, listArtists, followingList, respondToOffer, getInvitationStatus,
  userById, isFollowing, followArtist, unfollowArtist, eventsByArtist, getVenueReviews, artistFollowerCount,
} from "../../data.js";
import { db, collection, doc, query, where, onSnapshot, getDocs, getDoc, updateDoc, deleteDoc, arrayUnion } from "../../firebase.js";
import { svgRaw } from "../shared/icons.js";
import { cx, uid as mkId, dkToast, dkConfirm, dkPopover, dkSkeleton } from "../shared/ui.js";
import { subscribeLive, invalidateAccountCounts } from "../shared/live.js";
import {
  toMs, fmtTime, startOfDay, isToday, isYesterday, MONTHS_TR, MONTHS_TR_SHORT, DAYS_TR, DAYS_TR_SHORT,
  trUpper, trLower, writeQuery, rgba, shortNumTR, fmtRating, fmtPrice, eventStartMs, isEventOver, artistGenres, eventGenres,
} from "../shared/helpers.js";
import { genreColor, genreGrad } from "../shared/genres.js";
import { evTitle, evImage, evHref } from "../shared/cards.js";

// ══════════ requestChat — bekleyen sohbet hedefi ══════════
// Diğer sayfalar legacy `messages.requestChat({ otherId, otherName })` çağırıp mesajlar rotasına gider. Legacy modülün `pending`'i dışa
// aktarılmıyor (js/pages/messages.js bu grubun dosyası değil) → masaüstü görünüm onu yalnız legacy modül bir okuyucu dışa aktarırsa alır:
// SHARED-CANDIDATE: js/pages/messages.js'e `export function takePendingChat() { const t = pending; pending = null; return t; }` eklenmeli
// (tek satır; legacy davranışı değişmez). Eklendiği an aşağıdaki ad alanı okuması onu kendiliğinden kullanır (import * → eksik dışa aktarım
// hata değil, undefined). O zamana dek: bu modülün requestChat'i (masaüstü çağıranlar için) + `?c={convIdFor(me, other)}` derin bağlantısı.
let _pending = null;
export function requestChat(target) { _pending = target && target.otherId ? target : null; }
function takePending() {
  let t = null;
  try { const f = legacyMessages.takePendingChat; if (typeof f === "function") t = f(); } catch (_) {}
  // Legacy `pending` okunamasa da bu bağlanışla BAYATLADI (çağıranlar hedefi ayrıca bu modüle / ?c= ile verir) → temizle; yoksa sonraki
  // ≤768 legacy messagesView bağlanışı eski hedefi açardı. requestChat(null) legacy'nin kendi dışa aktarımı; davranışı `pending = null`.
  try { if (typeof legacyMessages.requestChat === "function") legacyMessages.requestChat(null); } catch (_) {}
  if (!t && _pending) t = _pending;
  _pending = null;
  return t && t.otherId ? t : null;
}

// ══════════ Artboard SVG gövdeleri (birebir) ══════════
const I = {
  pen: '<path d="M12 20h8.5"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  bubble: '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"></path>',
  userCircle: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="10" r="3"></circle><path d="M6.5 18.5a6.5 6.5 0 0 1 11 0"></path>',
  more: '<circle cx="5.5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="18.5" cy="12" r="1.6"></circle>',
  send: '<path d="m21 3-9.5 9.5M21 3l-6.5 18-3-8.5L3 9.5z"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  people: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.4M15.5 4.6a3.5 3.5 0 0 1 0 6.8"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5.5M12 7.5v.01"></path>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3.5 6.5 8.5 6.5 8.5-6.5"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  chevR: '<path d="m9 6 6 6-6 6"></path>',
  chevL: '<path d="m15 6-6 6 6 6"></path>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  spinner: '<path d="M21 12a9 9 0 1 1-9-9"></path>',
};
const ico = (k, size, sw, o = {}) => svgRaw(I[k], { size, sw, ...o });
// replaceChildren null/false çocukları ATLAMAZ (foundation §1.3) → süzerek
const rc = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

// Baş harf avatarı gradyanları — artboard (sanatçı / mekan) + tasarımda olmayanlar için rol renkleri
const GRAD = {
  artist: "linear-gradient(135deg, #FF4FA3, #7C3AED)",
  venue: "linear-gradient(135deg, #FF8A2A, #B45309)",
  customer: "linear-gradient(135deg, #4ED8FF, #0891B2)",
  organizer: "linear-gradient(135deg, #FF4FA3, #FF8A2A)",
  group: "linear-gradient(135deg, #A78BFA, #6D28D9)",
  unknown: "linear-gradient(135deg, #2C303A, #1C2029)",
};
const TYPEC = { artist: "#FF4FA3", venue: "#FF8A2A", customer: "#4ED8FF", organizer: "#FF4FA3", group: "#A78BFA" };
const TYPE_LABEL = { artist: "Sanatçı", venue: "Mekan", customer: "Dinleyici", organizer: "Organizatör" };
const OFFER_TAG = { pending: ["TEKLİF BEKLİYOR", "#FF4FA3"], accepted: ["KABUL EDİLDİ", "#7CE0B0"], rejected: ["REDDEDİLDİ", "#FF5A6E"] };
const OFFER_ST = { pending: ["BEKLİYOR", "#FF4FA3"], accepted: ["KABUL EDİLDİ", "#7CE0B0"], rejected: ["REDDEDİLDİ", "#FF5A6E"] };
const DONE = {
  accepted: { t: "Kabul edildi", c: "#7CE0B0", i: "check" },
  rejected: { t: "Reddedildi", c: "#FF8A98", i: "x" },
};
const SAFETY = "Kişisel bilgilerini ve ödeme detaylarını mesajla paylaşma. Biletler yalnızca GigBridge üzerinden satılır.";
const MAXLEN = 1000;

// ══════════ biçim yardımcıları ══════════
const initial = (n) => (String(n || "?").trim().charAt(0) || "?").toLocaleUpperCase("tr-TR");
// Liste zamanı: bugün "18:42" · dün "Dün" · bu yıl "24 Eyl" · başka yıl "24 Eyl 2025"
function timeShort(v) {
  const t = toMs(v); if (t == null) return "";
  if (isToday(t)) return fmtTime(t);
  if (isYesterday(t)) return "Dün";
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""}`;
}
// Gün ayırıcısı: "BUGÜN" · "DÜN" · "24 EYLÜL" (başka yıl "24 EYLÜL 2025")
function dayLabel(t) {
  if (isToday(t)) return "BUGÜN";
  if (isYesterday(t)) return "DÜN";
  const d = new Date(t);
  return trUpper(`${d.getDate()} ${MONTHS_TR[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""}`);
}
// "2026-10-02" → yerel tarih (UTC kayması yok)
function isoLocal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) { const t = toMs(iso); return t == null ? null : new Date(t); }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
// Teklif tarihi karosu / son teklif satırı: "2 Eki Cuma"
function offerDate(iso) {
  const d = isoLocal(iso); if (!d || isNaN(d)) return iso || "—";
  return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${DAYS_TR[d.getDay()]}`;
}
// respondToOffer durum mesajı tarihi — data.js axIsoToTR / listenArtistOffers `date` alanıyla aynı biçim ("02 Eki 2026")
function offerDateTR(iso) {
  const d = iso ? isoLocal(iso) : null;
  if (!d || isNaN(d)) return (typeof iso === "string" && iso) ? iso : "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}
// Teklif verisi — iki yazar şekli tek biçime: web createInvitation offerMeta { venue, dateISO, time, feeRaw } ·
// uygulama FindArtistScreen offerMeta { venueName, eventDate, eventTime, fee } (src/services/respondToOffer.ts OfferMeta).
// Kaynak öncelik: invitations/{id} dokümanı (iki yol için kanonik) → mesajın offerMeta'sı. Çıktı data.js respondToOffer'ın okuduğu şekildir.
function offerInfo(meta, inv) {
  const o = meta || {}, i = inv || {};
  const pick = (...v) => { const x = v.find((y) => y != null && y !== ""); return x === undefined ? null : x; };
  return {
    venueId: pick(i.venueId, o.venueId),
    venue: pick(i.venueName, o.venue, o.venueName),
    eventId: pick(i.eventId, o.eventId),
    dateISO: pick(i.eventDate, o.dateISO, o.eventDate) || "",
    time: pick(i.eventTime, o.time, o.eventTime) || "",
    feeRaw: pick(i.fee, o.feeRaw, o.fee),
    genre: pick(i.genre, o.genre) || "",
    photoUrl: pick(i.photoUrl, o.photoUrl),
  };
}
const feeIsNum = (v) => { const n = Number(v); return v != null && v !== "" && isFinite(n) && n > 0; };
const feeText = (v) => (feeIsNum(v) ? "₺" + Number(v).toLocaleString("tr-TR") : "Belirtilmemiş");
// Sıradaki etkinlik zamanı (artboard DCLogic): bugün "BUGÜN · 21:00" · önümüzdeki 6 gün yalnız gün "ÇAR · 21:00" ·
// daha ileri "CMT 10 EKİ · 22:00" (gün adı tek başına belirsizleşir)
function nextWhen(e) {
  const s = eventStartMs(e); if (s == null) return trUpper(e?.date || "");
  const d = new Date(s);
  const ahead = Math.round((startOfDay(s) - startOfDay(Date.now())) / 864e5);
  const day = ahead <= 0 ? "BUGÜN"
    : ahead < 7 ? trUpper(DAYS_TR_SHORT[d.getDay()])
      : trUpper(`${DAYS_TR_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`);
  return `${day} · ${fmtTime(s)}`;
}
const firstGenre = (u) => artistGenres(u)[0] || "";

// ══════════ profil önbelleği — modül düzeyi, 5 dk TTL (yalnız okuma) ══════════
// Her satır için users/{otherId} okunur (tür / foto / şehir). Bağlanış başına önbellek her ziyarette N okuma demekti (üretim Firestore'u
// uygulamayla paylaşılıyor, okuma faturalanır) → görünümler arası paylaşılan kısa ömürlü depo. Hata önbelleğe alınmaz (sonraki bağlanış
// yeniden dener); "yok" (null) gerçek sonuçtur, TTL boyunca tutulur. Bir bağlanış içinde girdi sabitlenir (makeCaches → _prof) →
// TTL bağlanış ortasında dolsa da satırlar "yükleniyor"a düşüp titremez.
// SHARED-CANDIDATE: data.js listenConversations zaten aynı dokümanı okuyor (yalnız photoURL'ü tutuyor); userType/city/genres'i de
// döndürürse bu ek okumalar tamamen kalkar.
const PROF_TTL = 5 * 60e3;
const PROF_MAX = 400;
const _profStore = new Map();   // uid → { p: Promise, v: user | null (yok) | undefined (yükleniyor), t: ms }
function sharedProfile(id) {
  const now = Date.now();
  let e = _profStore.get(id);
  if (e && (e.v === undefined || now - e.t < PROF_TTL)) return e;
  e = { p: null, v: undefined, t: now };
  const rec = e;
  e.p = userById(id).then((u) => { rec.v = u; rec.t = Date.now(); return u; })
    .catch(() => { rec.v = null; if (_profStore.get(id) === rec) _profStore.delete(id); return null; });
  _profStore.delete(id); _profStore.set(id, e);   // ekleme sırası = yaş → en eskiyi at
  if (_profStore.size > PROF_MAX) _profStore.delete(_profStore.keys().next().value);
  return e;
}

// ══════════ görünüm örneği ömürlü önbellekler (yalnız okuma) ══════════
// Her createChat (rota bağlanışı) kendi önbelleğini kurar → takipçi sayısı / sıradaki etkinlik sayfaya her girişte tazedir (profil:
// yukarıdaki TTL deposu). Takip anahtarı sonrası takipçi sayısı (sunucuda Cloud Function'ın güncellediği users.followerCount) kullanıcının
// kendi eylemiyle ±1 iyimser güncellenir (bumpFollowers); sayı bilinmiyorsa girdi düşürülür ve taze profil okunur.
function makeCaches() {
  const _prof = new Map();   // uid → paylaşılan depo girdisi (bu bağlanış boyunca sabit)
  function profile(id) {
    if (!id) return { p: Promise.resolve(null), v: null };
    let e = _prof.get(id);
    if (!e) { e = sharedProfile(id); _prof.set(id, e); }
    return e;
  }
  const _next = new Map();   // "artist:id" | "venue:id" → Promise<event|null>
  function nextEventOf(type, id) {
    const k = type + ":" + id;
    if (!_next.has(k)) {
      const load = type === "artist" ? eventsByArtist(id)
        // Mekan: venueEvents() KULLANILMAZ (cleanupEventBanners yazmaya çalışır) → salt-okuma sorgu (tek alan eşitliği, mevcut indeks)
        : getDocs(query(collection(db, "events"), where("venueId", "==", id))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
      _next.set(k, load.then((list) => (list || [])
        .filter((e) => (e.status ?? "upcoming") === "upcoming" && !isEventOver(e) && eventStartMs(e) != null)
        .sort((a, b) => eventStartMs(a) - eventStartMs(b))[0] || null).catch(() => null));
    }
    return _next.get(k);
  }
  const _meta = new Map();   // "venue:id" → "4.7 (128) · 600 kişi" · "artist:id" → "12,4 B takipçi"
  const _fol = new Map();    // artistId → gösterilen takipçi sayısı
  const folText = (n) => (Number(n) > 0 ? `${shortNumTR(n)} takipçi` : "");
  function metaOf(type, u) {
    const k = type + ":" + u.id;
    if (_meta.has(k)) return _meta.get(k);
    let p;
    if (type === "venue") {
      const cap = Number(u.capacity) > 0 ? `${Number(u.capacity).toLocaleString("tr-TR")} kişi` : "";
      const rated = (avg, n) => [n > 0 && fmtRating(avg) ? `${fmtRating(avg)} (${n})` : "", cap].filter(Boolean).join(" · ");
      p = Number(u.reviewCount) > 0 && Number(u.avgRating) > 0
        ? Promise.resolve(rated(u.avgRating, Number(u.reviewCount)))
        : getVenueReviews(u.id).then((rs) => {
          const vals = (rs || []).map((r) => Number(r.overallRating ?? r.rating)).filter((x) => x > 0);
          return rated(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, vals.length);
        }).catch(() => rated(0, 0));
    } else if (type === "artist") {
      p = (Number(u.followerCount) > 0 ? Promise.resolve(Number(u.followerCount)) : artistFollowerCount(u.id))
        .then((n) => { n = Number(n) || 0; _fol.set(u.id, n); return folText(n); }).catch(() => "");
    } else p = Promise.resolve("");
    _meta.set(k, p);
    return p;
  }
  // taze profil (takip anahtarı sonrası): önbellekteki değeri yerinde günceller (yükleniyor durumuna düşmez → satırlar titremez)
  function refreshProfile(id) {
    return userById(id).then((u) => {
      if (u) {
        const t = Date.now();
        const e = _prof.get(id);
        if (e) { e.v = u; e.t = t; } else _prof.set(id, { p: Promise.resolve(u), v: u, t });
        const se = _profStore.get(id);
        if (se && se !== e) { se.v = u; se.t = t; } else if (!se) _profStore.set(id, _prof.get(id));
      }
      return u;
    }).catch(() => null);
  }
  // d = +1 (takip) / -1 (bırak) → true: sayı güncellendi · false: sayı bilinmiyordu (girdi düşürüldü, yeniden okunmalı)
  function bumpFollowers(id, d) {
    const k = "artist:" + id;
    if (!_fol.has(id)) { _meta.delete(k); return false; }
    const n = Math.max(0, _fol.get(id) + d);
    _fol.set(id, n); _meta.set(k, Promise.resolve(folText(n)));
    return true;
  }
  return { profile, nextEventOf, metaOf, refreshProfile, bumpFollowers };
}

// ══════════════════════════════════════════════════════════════════════
export function createChat({ host, ns, variant = "listener", role = "customer", ctx } = {}) {
  const P = variant === "panel";
  const c = (s) => `${ns}-${s}`;
  const { profile, nextEventOf, metaOf, refreshProfile, bumpFollowers } = makeCaches();
  const sess = () => ctx?.session || session;
  const me = sess().user?.uid;
  const myType = sess().profile?.userType || role || "customer";
  const offerRole = myType === "artist" || myType === "venue";
  const unsubs = [];
  let alive = true;
  let booted = false;
  unsubs.push(() => { alive = false; });

  // ── durum ──
  const S = {
    convs: [], ready: false, drafts: new Map(), activeId: null,
    composing: false, q: "", tab: "all", stickyId: null,
    people: null,
    msgs: null, convDoc: null,
    inv: { byId: new Map(), byOther: new Map(), ready: !offerRole },
    offerLocal: new Map(),   // invitationId → yanıt (dinleyici gelene dek anında geri bildirim)
  };
  const texts = new Map();   // convId → yazılmakta olan metin (konuşma değişince korunur)
  // Okundu politikası — otomatik açılan konuşma (en son / ?c= bağlantısı):
  //   · sekme görünür + odaklıysa (gerçek kullanıcı) bağlanışta hemen okundu yapılır;
  //   · değilse (arka plan sekmesi, önizleme) ya da tarayıcı otomasyonla sürülüyorsa (navigator.webdriver — paylaşılan emülatörde
  //     ekran görüntüleri okunmamışları silmesin) bu görünümde ilk etkileşime (fare, tık, tuş, tekerlek, dokunma) dek bekler.
  //   Satıra tıklayarak seçim her zaman doğrudan okundu yapar. Okundu yazılana dek etkin konuşmanın okunmamışı listede/"N YENİ"de
  //   GERÇEK sayıyla görünür → kabuğun Mesajlar rozetiyle (aynı live.js toplamı) her an tutarlı.
  const autoRead = () => { try { return !navigator.webdriver && document.visibilityState === "visible" && document.hasFocus(); } catch (_) { return false; } };
  let userActed = autoRead();
  const EVS = ["pointerdown", "keydown", "mousemove", "wheel", "touchstart"];
  const onAct = () => { if (userActed) return; userActed = true; offAct(); if (alive) { maybeMarkRead(true); if (booted) renderList(); } };
  const offAct = () => EVS.forEach((t) => document.removeEventListener(t, onAct, true));
  if (!userActed) EVS.forEach((t) => document.addEventListener(t, onAct, { capture: true, passive: true }));
  unsubs.push(offAct);
  const mq = window.matchMedia("(max-width: 1023px)");
  let single = mq.matches;
  let pendingTarget = takePending();

  // ════════════ İSKELET ════════════
  host.classList.add(ns);
  const searchId = mkId(ns + "-q");
  const listPh = () => (P && myType === "artist" ? "Mekan ara" : "Konuşmalarda ara");
  const searchLabel = h("label", { for: searchId, class: "dk-sr" }, "Konuşmalarda ara");
  const searchIn = h("input", { id: searchId, type: "search", class: cx(c("sin"), "dk-in"), placeholder: listPh(), autocomplete: "off", spellcheck: "false" });
  const titleWrap = h("div", { class: c("lrow") });
  const tabsEl = P ? h("div", { role: "tablist", "aria-label": "Konuşma filtresi", class: c("tabs") }) : null;
  const lhead = h("div", { class: c("lhead") }, titleWrap, tabsEl,
    h("div", { class: c("search") }, searchLabel, ico("search", 16, "2", { color: "#8A8E97", cls: c("sic") }), searchIn));
  const listUl = h("ul", { id: mkId(ns + "-list"), class: cx(c("ul"), "dk-scroll"), "aria-label": "Konuşma listesi" });
  // panel: sekmelerin denetlediği bölge (role=tabpanel, etkin sekmeyle etiketli). <ul> liste rolünü korusun diye ayrı sarmalayıcı.
  const tabPanel = P ? h("div", { id: mkId(ns + "-tp"), role: "tabpanel", class: c("tp") }, listUl) : null;
  const listBox = tabPanel || listUl;   // yeni mesaj panelinde gizlenen konuşma bölgesi
  const cmpBox = h("div", { class: cx(c("cmp"), "dk-fade"), hidden: true });
  const listPane = h(P ? "section" : "aside", { class: c("list"), "aria-label": "Konuşmalar" }, lhead, listBox, cmpBox);

  const chatSec = h("section", { class: c("chat"), "aria-label": "Sohbet" });
  const chead = h("div", { class: c("chead"), hidden: true });
  const logInner = h("div", { class: c("logi") });
  const log = h("div", { class: cx(c("log"), "dk-scroll"), role: "log", "aria-live": "polite", "aria-label": "Mesaj geçmişi" }, logInner);
  const composer = h("div", { class: c("composer"), hidden: true });
  chatSec.append(chead, log, composer);

  const pane = h("aside", { class: cx(c("pane"), "dk-scroll"), "aria-label": "Profil özeti", hidden: true });
  host.append(listPane, chatSec, pane);

  // ════════════ yardımcılar ════════════
  // En yeni önce (lastMessageTime; bekleyen serverTimestamp = şimdi). data.js sırası konuşmalarda createdAt/eventAt'e bakıyor → grup
  // sohbetleri öne kaçıyordu; uygulama gibi son mesaja göre sıralanır. Yerel taslaklar en üstte.
  const lastMs = (cv) => toMs(cv.lastMessageTime) ?? (cv.lastMessage ? Date.now() : 0);
  const allConvs = () => {
    const ids = new Set(S.convs.map((x) => x.id));
    return [...S.drafts.values()].filter((d) => !ids.has(d.id)).concat([...S.convs].sort((a, b) => lastMs(b) - lastMs(a)));
  };
  const getConv = (id) => (id ? S.convs.find((x) => x.id === id) || S.drafts.get(id) || null : null);
  // karşı tarafın profili (tür/foto/şehir) yüklenince bir kez toplu yeniden çiz
  const waiting = new Set();
  let refreshQueued = false;
  const queueRefresh = () => {
    if (refreshQueued) return; refreshQueued = true;
    requestAnimationFrame(() => { refreshQueued = false; if (!alive) return; renderList(); renderHeader(); renderPane(false); if (S.activeId) { renderLog(); renderComposer(); } });
  };
  const prof = (id) => {
    const e = profile(id);
    if (e.v === undefined && id && !waiting.has(id)) { waiting.add(id); e.p.then(() => { waiting.delete(id); queueRefresh(); }); }
    return e.v;
  };
  const typeOf = (cv) => {
    if (!cv) return "unknown";
    if (cv.isGroup) return "group";
    const pr = prof(cv.otherId);
    return pr?.userType || (pr === null ? "customer" : "unknown");
  };
  const photoOf = (cv) => (cv?.isGroup ? null : cv?.otherPhoto || prof(cv?.otherId)?.photoURL || null);
  const hrefOf = (cv) => {
    const t = typeOf(cv);
    if (t === "artist") return "#/sanatci/" + encodeURIComponent(cv.otherId);
    if (t === "venue") return "#/mekan/" + encodeURIComponent(cv.otherId);
    return null;
  };
  // etkin konuşma yalnız okundu gerçekten yazılacaksa (readsActive) 0 sayılır; aksi hâlde gerçek sayı (kabuk rozetiyle tutarlı)
  const readsActive = () => userActed && document.visibilityState === "visible" && (!single || host.classList.contains("is-chat"));
  const unreadOf = (cv) => (cv.id === S.activeId && readsActive() ? 0 : Number(cv.unread) || 0);
  const totalUnread = () => S.convs.reduce((a, cv) => a + unreadOf(cv), 0);
  const invWith = (cv) => (cv && !cv.isGroup ? S.inv.byOther.get(cv.otherId) || null : null);

  function avatar(size, { name, photo, type, cls }) {
    const st = { width: size + "px", height: size + "px" };
    if (photo) {
      const img = h("img", { src: photo, alt: "", class: cx(c("av"), cls), style: st, decoding: "async" });
      img.addEventListener("error", () => img.replaceWith(avatar(size, { name, type, cls })), { once: true });
      return img;
    }
    return h("span", { class: cx(c("av"), c("avi"), cls), style: { ...st, background: GRAD[type] || GRAD.unknown }, "aria-hidden": "true" }, initial(name));
  }

  // ════════════ SOL BÖLME ════════════
  const composeBtn = h("button", { type: "button", class: cx(c("icbtn"), "dk-press"), "aria-label": "Yeni mesaj" }, ico("pen", P ? 16 : 18, "1.9"));
  const closeCmpBtn = h("button", { type: "button", class: cx(c("icbtn"), "dk-press"), "aria-label": "Yeni mesajı kapat" }, ico("x", P ? 16 : 18, "2"));
  const pill = h("span", { class: c("pill"), hidden: true });
  const titleEl = h(P ? "h2" : "h1", { class: c("h") }, P ? "Konuşmalar" : "Mesajlar");
  const cmpTitle = P ? h("h2", { class: c("h") }, "Yeni Mesaj") : h("h1", { class: c("h") }, "Yeni ", h("em", {}, "mesaj"));
  composeBtn.addEventListener("click", () => setComposing(true));
  closeCmpBtn.addEventListener("click", () => { setComposing(false); composeBtn.focus(); });

  function renderTitle() {
    const want = S.composing ? [closeCmpBtn, cmpTitle] : [titleEl, pill, composeBtn];
    if (titleWrap.children.length !== want.length || want.some((n, i) => titleWrap.children[i] !== n)) rc(titleWrap, want);
    const n = totalUnread();
    pill.hidden = !n;
    pill.textContent = `${n > 99 ? "99+" : n} YENİ`;
  }

  // Sekmeler (panel): Tümü / Okunmamış / Teklifler — WAI-ARIA sekme deseni: ←/→ (döngülü) + Home/End, otomatik etkinleştirme;
  // her sekme aria-controls → tabPanel, tabPanel aria-labelledby → etkin sekme.
  const TABS = [["all", "Tümü"], ["unread", "Okunmamış"], ...(offerRole ? [["offer", "Teklifler"]] : [])];
  const tabBtns = new Map();
  if (P) {
    TABS.forEach(([k, label]) => {
      const b = h("button", { type: "button", role: "tab", id: mkId(ns + "-tab-" + k), "aria-controls": tabPanel.id, class: cx(c("tab"), "dk-press"), "aria-selected": "false", tabindex: "-1" }, label);
      b.addEventListener("click", () => setTab(k));
      b.addEventListener("keydown", (e) => {
        const i = TABS.findIndex(([x]) => x === k);
        const n = TABS.length;
        const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
        if (j < 0) return;
        e.preventDefault();
        const nk = TABS[j][0];
        setTab(nk); tabBtns.get(nk).focus();
      });
      tabBtns.set(k, b);
      tabsEl.append(b);
    });
    tabsEl.style.gridTemplateColumns = `repeat(${TABS.length}, minmax(0, 1fr))`;
  }
  function setTab(k) {
    if (S.tab !== k) S.stickyId = null;
    S.tab = k;
    tabBtns.forEach((b, key) => { const on = key === k; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; b.classList.toggle("is-on", on); });
    if (tabPanel && tabBtns.get(k)) tabPanel.setAttribute("aria-labelledby", tabBtns.get(k).id);
    if (booted) renderList();
  }

  searchIn.addEventListener("input", () => { S.q = searchIn.value; if (S.composing) renderCompose(); else renderList(); });
  searchIn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { const f = (S.composing ? cmpBox : listUl).querySelector("button"); if (f) { e.preventDefault(); f.focus(); } }
    else if (e.key === "Escape" && S.composing) { e.preventDefault(); setComposing(false); composeBtn.focus(); }
  });

  function setComposing(on) {
    S.composing = !!on;
    S.q = ""; searchIn.value = "";
    const venue = myType === "venue";
    searchIn.placeholder = on ? (venue ? "Sanatçı adı veya şehir ara..." : "Takip ettiklerinde ara...") : listPh();
    searchLabel.textContent = on ? (venue ? "Sanatçılarda ara" : "Takip ettiklerinde ara") : "Konuşmalarda ara";
    listBox.hidden = on; cmpBox.hidden = !on;
    if (tabsEl) tabsEl.hidden = on;
    renderTitle();
    if (on) {
      cmpBox.classList.remove("dk-fade"); void cmpBox.offsetWidth; cmpBox.classList.add("dk-fade");
      loadPeople(); renderCompose(); requestAnimationFrame(() => searchIn.focus());
    } else renderList();
  }

  // — konuşma satırları (anahtarlı: odak korunur, değişmeyen satır yeniden çizilmez) —
  const rows = new Map();   // id → li
  function rowNode(cv) {
    let li = rows.get(cv.id);
    if (!li) {
      const btn = h("button", { type: "button", class: cx(c("row"), "dk-row") });
      li = h("li", { class: c("li") }, btn);
      li._btn = btn;
      btn.addEventListener("click", () => { select(li._id, { user: true }); if (single) requestAnimationFrame(focusInput); });
      rows.set(cv.id, li);
    }
    li._id = cv.id;
    const on = cv.id === S.activeId;
    const un = unreadOf(cv);
    const type = typeOf(cv);
    const inv = P ? invWith(cv) : null;
    const tag = inv ? OFFER_TAG[inv.status] : null;
    const photo = photoOf(cv);
    const preview = cv.draft ? "Sohbeti başlatmak için mesaj gönderin."
      // teklifleri yalnız mekan gönderir → sanatçıya "gönderdi", mekanın kendisine "gönderildi"
      : String(cv.lastMessage || "").startsWith("Sahne teklifi —") ? (myType === "venue" ? "Sahne teklifi gönderildi" : "Sahne teklifi gönderdi") : (cv.lastMessage || "…");
    const time = timeShort(cv.lastMessageTime);
    const sig = [on, un, type, photo, cv.otherName, preview, time, tag?.[0]].join("|");
    const btn = li._btn;
    btn.classList.toggle("is-on", on);
    btn.classList.toggle("is-unread", un > 0);
    btn.setAttribute("aria-current", on ? "true" : "false");
    btn.setAttribute("aria-label", cv.otherName + (un > 0 ? `, ${un} okunmamış mesaj` : ""));
    if (li._sig === sig) return li;
    li._sig = sig;
    const avWrap = h("span", { class: c("avw") }, avatar(P ? 46 : 48, { name: cv.otherName, photo, type }));
    if (!P && type !== "unknown") avWrap.append(h("span", { class: c("rdot"), style: { background: TYPEC[type] || "#8A8E97" } }));
    rc(btn,
      h("span", { class: c("bar"), "aria-hidden": "true" }),
      avWrap,
      h("span", { class: c("rcol") },
        h("span", { class: c("l1") }, h("span", { class: c("name") }, cv.otherName), h("span", { class: c("time") }, time)),
        h("span", { class: c("l2") }, h("span", { class: c("prev") }, preview), un > 0 ? h("span", { class: c("badge") }, un > 99 ? "99+" : String(un)) : null),
        tag ? h("span", { class: c("otag"), style: { color: tag[1], borderColor: rgba(tag[1], 0.5) } }, tag[0]) : null));
    return li;
  }
  const skelRows = (n, av) => Array.from({ length: n }, () => h("li", { class: c("skrow"), "aria-hidden": "true" },
    dkSkeleton({ w: av, h: av, r: av / 2 }),
    h("span", { class: c("skcol") }, dkSkeleton({ w: "62%", h: 14 }), dkSkeleton({ w: "86%", h: 12 }))));

  function renderList() {
    renderTitle();
    // Yeni mesaj paneli açıkken konuşma listesi gizli; panel yalnız kendi girdileriyle (kişi listesi yüklendi / arama / profil
    // zenginleştirmesi) yeniden çizilir → canlı konuşma anlık görüntüleri kaydırılan kişi listesini başa sarmaz.
    if (S.composing) return;
    if (!S.ready) {
      rows.clear();
      rc(listUl, skelRows(5, P ? 46 : 48));
      listUl.setAttribute("aria-busy", "true");
      return;
    }
    listUl.removeAttribute("aria-busy");
    const all = allConvs();
    if (!all.length) {
      rows.clear();
      rc(listUl, h("li", { class: c("none") },
        ico("bubble", 32, "1.5"),
        h("span", { class: c("none-t") }, "Henüz mesajınız yok."),
        "Sanatçı veya mekan profilinden mesaj başlatabilirsiniz."));
      return;
    }
    const q = trLower(S.q.trim());
    const f = all.filter((cv) => (!q || trLower(cv.otherName).includes(q))
      && (S.tab === "all" || (S.tab === "unread" && (unreadOf(cv) > 0 || cv.id === S.stickyId)) || (S.tab === "offer" && !!invWith(cv))));
    if (!f.length) {
      if (listUl.contains(document.activeElement)) searchIn.focus({ preventScroll: true });
      rc(listUl, h("li", { class: c("none") },
        P ? null : ico("search", 32, "1.5"),
        h("span", { class: c("none-t") }, "Sonuç yok"),
        P || !q ? "Bu filtreyle eşleşen konuşma bulunamadı." : `“${S.q.trim()}” ile eşleşen konuşma bulunamadı.`));
      return;
    }
    const keep = new Set(f.map((x) => x.id));
    [...rows.keys()].forEach((k) => { if (!keep.has(k)) rows.delete(k); });
    const hadFocus = listUl.contains(document.activeElement);
    const nodes = f.map(rowNode);
    // en az DOM hareketi: yalnız yeri değişen satırları taşı (odaklı düğme DOM'dan çıkmaz)
    nodes.forEach((n, i) => { const cur = listUl.children[i]; if (cur !== n) listUl.insertBefore(n, cur || null); });
    while (listUl.children.length > nodes.length) listUl.lastChild.remove();
    // odaklı satır süzgeçten düştüyse odak <body>'ye kaçmasın → etkin satır ya da ilk satır, yoksa arama
    if (hadFocus && !listUl.contains(document.activeElement)) (rows.get(S.activeId)?._btn || listUl.querySelector("button") || searchIn).focus({ preventScroll: true });
  }
  // ↑/↓ satırlar arası
  const arrowNav = (box) => (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const btns = [...box.querySelectorAll("button:not([disabled])")];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) { searchIn.focus(); return; }
    btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  };
  listUl.addEventListener("keydown", arrowNav(listUl));
  cmpBox.addEventListener("keydown", arrowNav(cmpBox));
  // Esc: yeni mesaj panelinin herhangi bir yerinden (arama kutusundaki Esc aşağıda) kapatır
  cmpBox.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.composing) { e.preventDefault(); setComposing(false); composeBtn.focus(); } });

  // — Yeni mesaj (compose): mekan → listArtists · diğerleri → followingList (legacy composeModal) —
  let peopleLoading = false;
  async function loadPeople() {
    if (S.people || peopleLoading) return;
    peopleLoading = true;
    try {
      if (myType === "venue") {
        const arts = await listArtists();
        S.people = arts.map((a) => ({ id: a.id, name: a.displayName || a.name || "Sanatçı", city: a.city || "", type: "artist", photo: a.photoURL || null, genre: firstGenre(a) }));
      } else {
        const fol = await followingList(me);
        S.people = fol.map((f) => ({
          id: f.artistId || f.targetId || f.id, name: f.artistName || f.targetName || "Kullanıcı", city: "",
          type: f.targetType && f.targetType !== "artist" ? f.targetType : "artist", photo: f.photoURL || null, genre: f.genre || "",
        }));
      }
    } catch (_) { S.people = []; }
    peopleLoading = false;
    if (alive && S.composing) renderCompose();
  }
  function renderCompose({ keepScroll = false } = {}) {
    const venue = myType === "venue";
    const ul = h("ul", { class: cx(c("cmp-ul"), "dk-scroll"), "aria-label": venue ? "Sanatçılar" : "Takip ettiklerin" });
    const foot = venue ? null : P
      ? h("p", { class: c("cmp-foot") }, "Yalnızca takip ettiğin kullanıcılara mesaj atabilirsin. Profil > Takip Ettiklerim ekranından kullanıcı bulup takip edebilirsin.")
      : h("p", { class: c("cmp-foot") }, "Yalnızca takip ettiğin kullanıcılara mesaj atabilirsin. Yeni kişileri ", h("a", { href: "#/takip" }, "Takip ettiklerim"), " sayfasından bulabilirsin.");
    if (!S.people) {
      ul.setAttribute("aria-busy", "true");
      ul.append(...skelRows(3, 40));
    } else {
      const q = trLower(S.q.trim());
      const f = S.people.filter((p) => !q || trLower(p.name + " " + (p.city || "")).includes(q));
      if (!f.length) {
        ul.append(h("li", { class: c("none") }, venue ? "Sanatçı bulunamadı. Farklı bir isim ya da şehir aratmayı deneyin."
          : "Yalnızca takip ettiğin kullanıcılara mesaj atabilirsin. Profil > Takip Ettiklerim ekranından kullanıcı bulup takip edebilirsin."));
      } else {
        let needs = false;
        f.forEach((p) => {
          const pr = profile(p.id);
          if (pr.v === undefined && (!p.photo || !p.genre)) needs = true;
          const genre = p.genre || firstGenre(pr.v);
          const sub = [TYPE_LABEL[p.type] || "Sanatçı", genre || p.city].filter(Boolean).join(" · ");
          const b = h("button", { type: "button", class: cx(c("prow"), "dk-row") },
            avatar(40, { name: p.name, photo: p.photo || pr.v?.photoURL || null, type: p.type }),
            h("span", { class: c("pcol") }, h("span", { class: c("pname2") }, p.name), h("span", { class: c("psub") }, sub)),
            ico("chevR", 18, "2", { color: "#8A8E97" }));
          b.addEventListener("click", () => pickPerson(p));
          ul.append(h("li", { class: c("li") }, b));
        });
        // venue listesi büyük olabilir → yalnız takip listesi için profil zenginleştirmesi (aynı sorgu için; kaydırma korunur)
        if (needs && !venue) {
          const q0 = S.q;
          Promise.all(f.map((p) => profile(p.id).p)).then(() => { if (alive && S.composing && S.q === q0) renderCompose({ keepScroll: true }); });
        }
      }
    }
    const oldUl = cmpBox.querySelector("ul");
    const st = keepScroll && oldUl ? oldUl.scrollTop : 0;
    const btns = [...cmpBox.querySelectorAll("button")];
    const fi = btns.indexOf(document.activeElement);
    rc(cmpBox, h("span", { class: c("cmp-eb") }, venue ? "SANATÇILAR" : "TAKİP ETTİKLERİN"), ul, foot);
    if (st) ul.scrollTop = st;
    if (fi >= 0) cmpBox.querySelectorAll("button")[fi]?.focus({ preventScroll: true });
  }
  function pickPerson(p) {
    const id = convIdFor(me, p.id);
    if (!S.convs.some((x) => x.id === id) && !S.drafts.has(id)) {
      S.drafts.set(id, { id, otherId: p.id, otherName: p.name, isGroup: false, draft: true, otherPhoto: p.photo || null, lastMessage: "", lastMessageTime: null, unread: 0 });
    }
    setComposing(false);
    select(id, { user: true });
    requestAnimationFrame(focusInput);
  }

  // ════════════ ORTA BÖLME ════════════
  const backBtn = h("button", { type: "button", class: cx(c("back"), "dk-press"), "aria-label": "Konuşmalara dön" }, ico("chevL", 18, "2"));
  backBtn.addEventListener("click", () => { const id = S.activeId; select(null, { user: true }); requestAnimationFrame(() => rows.get(id)?._btn?.focus()); });
  const moreBtn = P ? null : h("button", { type: "button", class: cx(c("more"), "dk-press"), "aria-label": "Diğer seçenekler", "aria-haspopup": "menu", "aria-expanded": "false" }, svgRaw(I.more, { size: 18, fill: true }));
  let menuPop = null;
  if (moreBtn) {
    moreBtn.addEventListener("click", () => {
      if (menuPop) { menuPop.close(); return; }
      const cv = getConv(S.activeId); if (!cv) return;
      const del = h("button", { type: "button", role: "menuitem", class: cx(c("mitem"), "dk-row"), disabled: cv.draft ? true : null }, ico("trash", 16, "1.9"), "Sohbeti sil");
      // odak önce tetikleyiciye: menü öğesi popover'la DOM'dan çıkar → dkModal onu "önceki odak" diye saklarsa kapanışta odak <body>'ye düşer
      del.addEventListener("click", () => { try { moreBtn.focus({ preventScroll: true }); } catch (_) {} menuPop?.close(); deleteConversation(cv); });
      del.addEventListener("keydown", (e) => { if (e.key === "Tab") menuPop?.close(); });
      menuPop = dkPopover({ anchor: moreBtn, content: h("div", { role: "menu", class: c("menu"), "aria-label": "Sohbet seçenekleri" }, del),
        role: "presentation", anim: "pop", width: 220, offset: 8, onClose: () => { menuPop = null; } });
    });
    unsubs.push(() => menuPop?.close());
  }

  let headSig = "";
  function renderHeader() {
    const cv = getConv(S.activeId);
    chatSec.setAttribute("aria-label", cv ? `${cv.otherName} ile sohbet` : "Sohbet");
    if (!cv) { headSig = ""; rc(chead); chead.hidden = true; return; }
    chead.hidden = false;
    const type = typeOf(cv);
    const inv = P ? invWith(cv) : null;
    let status, color, dot;
    if (cv.isGroup) { status = "Grup sohbeti"; color = "#8A8E97"; dot = TYPEC.group; }
    else if (inv && inv.status === "pending") { status = "Yanıt bekleyen teklif var"; color = "#FF4FA3"; dot = "#FF4FA3"; }
    else if (type === "unknown") { status = "GigBridge"; color = "#8A8E97"; dot = "#5E636D"; }
    else { status = `${TYPE_LABEL[type] || "Kullanıcı"} · GigBridge`; color = "#8A8E97"; dot = TYPEC[type] || "#8A8E97"; }
    const href = hrefOf(cv);
    const photo = photoOf(cv);
    const sig = [cv.id, cv.otherName, photo, type, status, href].join("|");
    if (sig === headSig) return;
    headSig = sig;
    const venueBtn = P && type === "venue";
    rc(chead,
      backBtn,
      avatar(P ? 40 : 42, { name: cv.otherName, photo, type }),
      h("div", { class: c("hcol") },
        h("h2", { class: c("hname") }, cv.otherName),
        h("span", { class: c("hst"), style: { color } }, h("span", { class: c("hdot"), style: { background: dot } }), status)),
      href ? h("a", { href, class: cx(c("obtn"), "dk-press") }, ico(venueBtn ? "building" : "userCircle", 16, "1.9"), venueBtn ? "Mekanı gör" : "Profili gör") : null,
      moreBtn);
  }

  // — mesaj günlüğü: anahtarlı uzlaştırma (aria-live günlük her yeni mesajda baştan okunmasın) —
  let seen = new Set();          // bu konuşmada çizilmiş mesaj kimlikleri (yeni gelenler animasyonlu)
  let firstPaint = true;
  let nodeCache = new Map();     // anahtar → { sig, node }
  const offerCards = new Map();  // mesaj id → { node, sync }
  // Konuşma geçişi: geçmiş toplu eklenirken günlük sessiz (aria-live off + aria-busy); ilk tam çizimden sonraki karede yeniden "polite"
  // → yalnız sonradan gelen mesajlar duyurulur.
  let logQuiet = false;
  const quietLog = () => { logQuiet = true; log.setAttribute("aria-busy", "true"); log.setAttribute("aria-live", "off"); };
  const wakeLog = () => {
    if (!logQuiet) return;
    logQuiet = false;
    requestAnimationFrame(() => { if (logQuiet || !alive) return; log.removeAttribute("aria-busy"); log.setAttribute("aria-live", "polite"); });
  };
  const setLog = (nodes) => {
    nodes.forEach((n, i) => { const cur = logInner.children[i]; if (cur !== n) logInner.insertBefore(n, cur || null); });
    while (logInner.children.length > nodes.length) logInner.lastChild.remove();
  };
  function placeholder(kind) {
    const cv = getConv(S.activeId);
    if (kind === "loading") return h("div", { class: c("loading"), role: "status", "aria-label": "Mesajlar yükleniyor" }, svgRaw(I.spinner, { size: 22, sw: "2.4", cls: "dk-spin" }));
    if (kind === "empty") {
      return h("div", { class: cx(c("cempty"), "dk-fade") }, ico("bubble", 40, "1.4"),
        h("span", { class: c("cempty-t") }, `${cv.otherName} ile sohbet`), "Sohbeti başlatmak için mesaj gönderin.");
    }
    // konuşma seçili değil (liste hazır — hazır değilken renderLog "loading" çizer)
    const none = !allConvs().length;
    const btn = h("button", { type: "button", class: cx(c("obtn"), "dk-press") }, ico("pen", 16, "1.9"), "Yeni mesaj");
    btn.addEventListener("click", () => setComposing(true));
    return h("div", { class: cx(c("cempty"), "dk-fade") }, ico("bubble", 40, "1.4"),
      h("span", { class: c("cempty-t") }, none ? "Yeni bir sohbet başlat" : "Bir konuşma seç"), btn);
  }
  let loadNode = null;   // liste yüklenirken sohbet bölmesindeki döner gösterge (spec hesap §6 "list skeleton rows; chat spinner")
  function renderLog() {
    const cv = getConv(S.activeId);
    chatSec.classList.toggle(c("chat-none"), !cv);
    if (!cv && !S.ready) { nodeCache.clear(); setLog([loadNode ||= placeholder("loading")]); return; }
    loadNode = null;
    if (!cv) { nodeCache.clear(); setLog([placeholder("none")]); wakeLog(); return; }
    if (S.msgs == null) { setLog([placeholder("loading")]); return; }
    const msgs = S.msgs;
    if (!msgs.length) { setLog([placeholder("empty")]); firstPaint = false; wakeLog(); return; }
    // öğeler: gün ayırıcıları zaman damgalarından hesaplanır (saklanmaz)
    const items = [];
    let lastDay = null;
    const now = Date.now();
    msgs.forEach((m) => {
      const t = toMs(m.createdAt) ?? now;   // bekleyen serverTimestamp → şimdi
      const day = startOfDay(t);
      if (day !== lastDay) { items.push({ sep: dayLabel(t), key: "sep:" + day }); lastDay = day; }
      items.push({ m, t, mine: m.senderId === me, key: "m:" + m.id });
    });
    const typeO = typeOf(cv);
    const photoO = photoOf(cv);
    const nodes = items.map((it, i) => {
      if (it.sep) return cached(it.key, it.sep, () => h("div", { role: "separator", "aria-label": it.sep, class: c("sep") },
        h("span", { class: c("sepl") }), h("span", { class: c("sept") }, it.sep), h("span", { class: c("sepl") })));
      const prev = items[i - 1], next = items[i + 1];
      const first = !prev || !!prev.sep || prev.m.senderId !== it.m.senderId;
      const last = !next || !!next.sep || next.m.senderId !== it.m.senderId;
      const m = it.m;
      const isNew = !firstPaint && !seen.has(m.id);
      const mt = first ? 14 : (P ? 6 : 4);
      const time = fmtTime(it.t);
      const senderName = cv.isGroup && !it.mine ? (m.senderName || "") : "";
      const themAv = (vis) => h("span", { class: c("mav"), style: { visibility: vis ? "visible" : "hidden" } },
        avatar(30, cv.isGroup ? { name: senderName || cv.otherName, type: "group" } : { name: cv.otherName, photo: photoO, type: typeO }));
      if (m.type === "offer" && !it.mine && m.invitationId) {
        return cached(it.key, [mt, time, photoO, typeO].join("|"), () => h("div", { class: cx(c("msg"), c("them"), c("orow"), isNew && "dk-inmsg"), style: { marginTop: mt + "px" } },
          themAv(true),
          h("div", { class: c("ocol") }, offerCard(m).node, h("span", { class: c("mtime") }, time))));
      }
      const sig = [it.mine, first, last, mt, m.text, time, senderName, it.mine ? "" : photoO, it.mine ? "" : typeO].join("|");
      return cached(it.key, sig, () => {
        const radius = it.mine ? `16px ${first ? 16 : 6}px ${last ? 4 : 6}px 16px` : `${first ? 16 : 6}px 16px 16px ${last ? 4 : 6}px`;
        const bubble = h("div", { class: cx(c("bubble"), it.mine ? c("bme") : c("bthem")), style: { borderRadius: radius } }, m.text || "");
        if (it.mine) {
          return h("div", { class: cx(c("msg"), c("me"), isNew && "dk-inmsg"), style: { marginTop: mt + "px" } },
            h("div", { class: c("mcol") }, bubble, last ? h("span", { class: c("mtime") }, time) : null));
        }
        return h("div", { class: cx(c("msg"), c("them"), isNew && "dk-inmsg"), style: { marginTop: mt + "px" } },
          themAv(last),
          h("div", { class: c("mcol") }, senderName && first ? h("span", { class: c("sender") }, senderName) : null,
            bubble, last ? h("span", { class: c("mtime") }, time) : null));
      });
    });
    const keys = new Set(items.map((x) => x.key));
    [...nodeCache.keys()].forEach((k) => { if (!keys.has(k)) nodeCache.delete(k); });
    setLog(nodes);
    msgs.forEach((m) => seen.add(m.id));
    firstPaint = false;
    wakeLog();
  }
  function cached(key, sig, build) {
    const e = nodeCache.get(key);
    if (e && e.sig === sig) return e.node;
    const node = build();
    nodeCache.set(key, { sig, node });
    return node;
  }

  // — teklif kartı (sanatçının aldığı sahne teklifi; legacy offerBubble akışı) —
  const offerStatus = (invId) => S.offerLocal.get(invId) || S.inv.byId.get(invId)?.status || null;
  function offerCard(m) {
    let rec = offerCards.get(m.id);
    if (rec) { rec.sync(); return rec; }
    const info = () => offerInfo(m.offerMeta, S.inv.byId.get(m.invitationId));
    const tDate = h("span", { class: c("otv") }), tTime = h("span", { class: c("otv") }), tGenre = h("span", { class: c("otv") });
    const fee = h("span", { class: c("ofee") });
    const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
    const fill = () => {
      const x = info();
      setText(tDate, x.dateISO ? offerDate(x.dateISO) : "—"); setText(tTime, x.time || "—"); setText(tGenre, x.genre || "—");
      setText(fee, feeText(x.feeRaw));
    };
    const yes = h("button", { type: "button", class: cx(c("oyes"), "dk-press") }, ico("check", 15, "2.6"), "Evet");
    const no = h("button", { type: "button", class: cx(c("ono"), "dk-press") }, ico("x", 15, "2.4"), "Hayır");
    const actions = h("div", { class: c("oact") }, yes, no);
    const body = h("div", { class: c("obody") },
      h("span", { class: c("otext") }, m.text || ""),
      h("div", { class: c("otiles") },
        h("span", { class: c("otile") }, h("span", { class: c("otl") }, "TARİH"), tDate),
        h("span", { class: c("otile") }, h("span", { class: c("otl") }, "SAAT"), tTime),
        h("span", { class: c("otile") }, h("span", { class: c("otl") }, "TÜR"), tGenre)),
      actions);
    const art = h("article", { class: c("offer"), "aria-label": "Sahne teklifi" },
      h("div", { class: c("ohead") }, ico("mail", 14, "2", { color: "#FF4FA3" }), h("span", { class: c("oeb") }, "SAHNE TEKLİFİ"), fee),
      body);
    let shown = null;
    const setStatus = (st) => {
      const pending = !st || st === "pending";
      art.classList.toggle("is-pending", pending);
      art.classList.toggle("dk-glow", pending);
      // teklif durumu henüz bilinmiyorsa (dinleyici gelmedi) düğmeler görünmez → kabul edilmiş teklifte "Evet/Hayır" parlaması olmaz
      actions.classList.toggle("is-wait", pending && !S.inv.ready);
      if (pending) {
        if (shown !== "pending" && body.lastChild !== actions) body.lastChild.replaceWith(actions);
        shown = "pending";
        return;
      }
      if (shown === st) return;
      const d = DONE[st] || { t: "Yanıtlandı", c: "#8A8E97", i: "check" };
      const done = h("div", { role: "status", class: cx(c("odone"), shown && "dk-fade"), style: { color: d.c, borderColor: rgba(d.c, 0.4), background: rgba(d.c, 0.08) } },
        ico(d.i, 15, "2.4"), d.t);
      body.lastChild.replaceWith(done);
      shown = st;
    };
    const respond = async (action) => {
      if (yes.disabled) return;
      yes.disabled = no.disabled = true; actions.classList.add("is-busy");
      const status = await getInvitationStatus(m.invitationId);
      if (!alive) return;
      if (status && status !== "pending") {
        S.offerLocal.set(m.invitationId, status); setStatus(status);
        dkToast("Bu teklif zaten yanıtlandı", { type: "info" });
        return;
      }
      const x = info();
      try {
        await respondToOffer({ id: m.invitationId, ...x, date: offerDateTR(x.dateISO) }, action,
          { uid: me, name: sess().profile?.displayName ?? "Sanatçı" });
        const st = action === "accept" ? "accepted" : "rejected";
        S.offerLocal.set(m.invitationId, st);
        if (alive) { setStatus(st); renderHeader(); renderList(); renderPane(false); }
        dkToast(action === "accept" ? `${x.venue || "Mekan"} teklifi kabul edildi ✓` : "Teklif reddedildi", { type: action === "accept" ? "ok" : "err" });
      } catch (_) {
        yes.disabled = no.disabled = false; actions.classList.remove("is-busy");
        dkToast("İşlem başarısız, tekrar dene", { type: "err" });
      }
    };
    yes.addEventListener("click", () => respond("accept"));
    no.addEventListener("click", () => respond("reject"));
    rec = { node: art, sync: () => { fill(); setStatus(offerStatus(m.invitationId)); } };
    rec.sync();
    offerCards.set(m.id, rec);
    return rec;
  }

  // — yazma kutusu —
  const inputId = mkId(ns + "-in");
  const inLabel = h("label", { for: inputId, class: "dk-sr" }, "Mesaj");
  const input = h("input", { id: inputId, type: "text", class: cx(c("cin"), "dk-in"), placeholder: "Mesaj yazın...", maxlength: String(MAXLEN), autocomplete: "off" });
  const sendBtn = h("button", { type: "button", class: cx(c("send"), "dk-press"), "aria-label": "Mesajı gönder", disabled: true }, ico("send", 19, "2.1"));
  const counter = h("span", { class: c("count") }, `0 / ${MAXLEN}`);
  const composeRow = h("div", { class: c("crow") }, inLabel, input, sendBtn);
  const metaRow = h("div", { class: c("cmeta") }, h("span", {}, "Enter ile gönder"), counter);
  const blockedNote = h("div", { class: c("blocked"), role: "status" });
  const syncInput = () => {
    const v = input.value;
    sendBtn.disabled = !v.trim() || !!getConv(S.activeId)?.unverified;   // ?c= taslağı: karşı taraf doğrulanana dek gönderim yok
    counter.textContent = `${v.length} / ${MAXLEN}`;
    if (S.activeId) { if (v) texts.set(S.activeId, v); else texts.delete(S.activeId); }
  };
  input.addEventListener("input", syncInput);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener("click", () => send());
  function focusInput() { if (!composer.hidden && composer.contains(input)) try { input.focus({ preventScroll: true }); } catch (_) {} }
  const isLocked = () => { const d = S.convDoc || {}; return (Array.isArray(d.blockedBy) && d.blockedBy.length > 0) || d.deletedGroup === true; };

  function renderComposer() {
    const cv = getConv(S.activeId);
    composer.hidden = !cv;
    if (!cv) return;
    if (isLocked()) {
      rc(blockedNote, ico("lock", 16, "2"), S.convDoc?.deletedGroup === true ? "Bu grup silindiği için artık mesaj gönderilemez." : "Bu sohbette mesajlaşma engellendiği için mesaj gönderilemez.");
      rc(composer, blockedNote);
      return;
    }
    inLabel.textContent = P && typeOf(cv) === "venue" ? `${cv.otherName} mekanına mesaj` : `${cv.otherName} kişisine mesaj`;
    if (!composer.contains(input)) rc(composer, composeRow, metaRow);
  }

  // Gönderim: sıraya alınır (çift gönderim kilidi + sıra korunur); metin anında temizlenir, hata → geri yazılır + toast
  let chain = Promise.resolve();
  let inflight = 0;
  function send() {
    const cv = getConv(S.activeId);
    const text = input.value.trim();
    if (!cv || !text || isLocked() || cv.unverified) return;
    input.value = ""; syncInput();
    const convId = cv.id;
    const wasDraft = !!cv.draft;
    const prof = sess().profile || {};
    inflight++;
    chain = chain.then(async () => {
      try {
        await sendMessage({
          fromId: me, fromName: prof.displayName || prof.orgName || "Ben",
          fromType: prof.userType, toId: cv.otherId, toName: cv.otherName,
          text, convId: convId || undefined, isGroup: cv.isGroup,
        });
        // taslak → ilk mesajla konuşma sunucuda oluştu: mesaj dinleyicisini ŞİMDİ (yeniden) kur. Konuşma listesinin yerel (gecikme telafili)
        // anlık görüntüsünde başlatılan dinleyici, doküman sunucuya yazılmadan kural get()'ine takılıp ölebiliyor.
        if (alive && S.activeId === convId && (wasDraft || !unMsgs)) { try { unMsgs?.(); } catch (_) {} unMsgs = null; startMessages(convId); }
      } catch (_) {
        dkToast("Mesaj gönderilemedi", { type: "err" });
        if (!alive) return;
        if (S.activeId === convId && !input.value) { input.value = text; syncInput(); focusInput(); }
        else if (!texts.get(convId)) texts.set(convId, text);
      } finally { inflight--; }
    });
  }

  // ════════════ SAĞ BÖLME ════════════
  let paneSeq = 0, paneSig = "";
  let paneFollowChanged = null;   // renderPane kurar: (artistId, takipte?) → takipçi satırı + boş etkinlik metni
  function renderPane(fade) {
    const cv = getConv(S.activeId);
    if (!cv) { paneSig = ""; ++paneSeq; rc(pane); pane.hidden = true; return; }
    pane.hidden = false;
    const type = typeOf(cv);
    const pr = cv.isGroup ? null : prof(cv.otherId);
    const inv = P ? invWith(cv) : null;
    const sig = [cv.id, cv.otherName, type, pr ? "1" : pr === null ? "0" : "?", inv?.id, inv?.status, S.inv.ready].join("|");
    if (!fade && sig === paneSig) return;
    paneSig = sig;
    const seq = ++paneSeq;
    const block = h("div", { class: cx(c("pblock"), fade && "dk-fade") });
    // kapak: mekan → bannerUrl / photoURL / galeri · sanatçı/diğer → photoURL
    const coverSrc = cv.isGroup ? null
      : (type === "venue" ? (pr?.bannerUrl || pr?.photoURL || (Array.isArray(pr?.gallery) ? pr.gallery[0] : null)) : pr?.photoURL) || cv.otherPhoto || null;
    const genre = type === "artist" ? firstGenre(pr) : "";
    let tag = "", tagC = "#8A8E97";
    if (cv.isGroup) { tag = "GRUP"; tagC = TYPEC.group; }
    else if (type === "artist") { tag = genre ? `SANATÇI · ${trUpper(genre)}` : "SANATÇI"; tagC = genre ? genreColor(genre) : TYPEC.artist; }
    else if (type === "venue") { tag = pr?.venueType ? `MEKAN · ${trUpper(pr.venueType)}` : "MEKAN"; tagC = TYPEC.venue; }
    else if (type === "organizer") { tag = "ORGANİZATÖR"; tagC = TYPEC.organizer; }
    else if (type === "customer") { tag = "DİNLEYİCİ"; tagC = TYPEC.customer; }
    const ph = () => h("span", { class: c("cph") }, initial(cv.otherName));
    const img = coverSrc ? h("img", { src: coverSrc, alt: cv.otherName, class: c("cimg"), decoding: "async" }) : null;
    if (img) img.addEventListener("error", () => img.replaceWith(ph()), { once: true });
    block.append(h("div", { class: c("cover") }, img || ph(), h("span", { class: c("scrim") }),
      tag ? h("span", { class: c("tag"), style: { color: tagC, borderColor: rgba(tagC, 0.5) } }, tag) : null));
    const metaLine = h("span", { class: c("pline"), hidden: true });
    block.append(h("div", { class: c("pinfo") },
      h("span", { class: c("pname") }, cv.otherName),
      pr?.city ? h("span", { class: c("pline") }, ico("pin", 14, "2", { color: "#4ED8FF" }), pr.city) : null,
      metaLine));
    const fillMeta = (u) => metaOf(type, u).then((txt) => {
      if (!alive || seq !== paneSeq) return;
      if (!txt) { metaLine.hidden = true; return; }
      rc(metaLine, type === "venue" ? svgRaw(I.star, { size: 14, fill: true, color: "#FF8A2A" }) : ico("people", 14, "2", { color: "#A3A7AF" }), txt);
      metaLine.hidden = false;
    });
    if (pr && (type === "venue" || type === "artist")) fillMeta(pr);
    let noNext = null;   // "Yaklaşan etkinlik yok…" kutusu (takip durumuna göre metin)
    const noNextText = (on) => (on ? "Yaklaşan etkinlik yok. Takip ettiğin için yeni tarih eklendiğinde bildirim alırsın." : "Yaklaşan etkinlik yok.");
    // takip anahtarı sonrası: takipçi satırı taze profil + meta ile yeniden, "yaklaşan etkinlik yok" metni yeni duruma göre
    paneFollowChanged = type === "artist" ? (id, on, bumped) => {
      if (id !== cv.otherId || seq !== paneSeq) return;
      if (noNext) noNext.textContent = noNextText(on);
      if (bumped) fillMeta(pr || { id });
      else refreshProfile(id).then((u) => { if (alive && seq === paneSeq) fillMeta(u || pr || { id }); });
    } : null;
    const href = hrefOf(cv);
    const light = (label) => h("a", { href, class: cx(c("light"), "dk-press") }, label, ico("arrow", 14, "2.2"));
    if (!P) {
      const btns = [href ? light("Profile git") : null, type === "artist" ? followToggle(cv, seq) : null].filter(Boolean);
      if (btns.length) block.append(h("div", { class: c("pbtns"), style: { gridTemplateColumns: `repeat(${btns.length}, minmax(0, 1fr))` } }, ...btns));
    } else if (href) {
      block.append(light(type === "venue" ? "Mekan profiline git" : type === "artist" ? "Sanatçı profiline git" : "Profile git"));
    }
    const kids = [block];
    if (!P && (type === "artist" || type === "venue")) {
      // SIRADAKİ ETKİNLİK (salt-okuma: sanatçı eventsByArtist · mekan venueId sorgusu; upcoming + bitmemiş, en yakın)
      const sec = h("div", { class: c("psec") }, h("span", { class: c("peb") }, "SIRADAKİ ETKİNLİK"), dkSkeleton({ h: 78, r: 10 }));
      kids.push(sec);
      nextEventOf(type, cv.otherId).then(async (e) => {
        if (!alive || seq !== paneSeq) return;
        if (e) { sec.lastChild.replaceWith(nextCard(e)); return; }
        const following = type === "artist" ? await followState(cv.otherId) : false;
        if (!alive || seq !== paneSeq) return;
        noNext = h("div", { class: c("dash") }, noNextText(following));
        sec.lastChild.replaceWith(noNext);
      });
    } else if (P && offerRole && !cv.isGroup && (type === "venue" || type === "artist")) {
      // SON TEKLİF (invitations dinleyicisi; bu karşı tarafla en son teklif)
      const sec = h("div", { class: c("psec") }, h("span", { class: c("peb") }, "SON TEKLİF"));
      if (!S.inv.ready) sec.append(dkSkeleton({ h: 150, r: 10 }));
      else if (inv) sec.append(lastOfferCard(inv));
      else sec.append(h("div", { class: c("dash") }, myType === "artist"
        ? "Bu mekandan henüz teklif yok. Mekan sana teklif gönderdiğinde burada ve sohbette görünür."
        : "Bu sanatçıya henüz teklif göndermedin. Gönderdiğin teklifler burada ve sohbette görünür."));
      kids.push(sec);
    }
    const noteText = P && myType === "artist" && type === "venue"
      ? "Kabul ettiğin teklifler Ana Sayfa’daki sahnelerine eklenir ve etkinlik mekan tarafından yayınlanır."
      : P && myType === "venue" && type === "artist"
        ? "Sanatçı teklifini kabul ettiğinde etkinlik Ana Sayfa’ndaki takvimine eklenir."
        : SAFETY;
    kids.push(h("div", { class: c("note") }, ico(P ? "info" : "shield", 15, "2", { cls: c("nic") }), h("span", {}, noteText)));
    pane.setAttribute("aria-label", `${cv.otherName} ${P && type === "venue" ? "mekan özeti" : P && type === "artist" ? "sanatçı özeti" : "profil özeti"}`);
    rc(pane, kids);
  }
  function nextCard(e) {
    const img = evImage(e);
    const where = e.venueName || e.artistName || "";   // artboard: "{mekan} · {fiyat}" (mekan kişisinde de mekanın adı)
    return h("a", { href: evHref(e), class: cx(c("next"), "dk-press") },
      img ? h("img", { src: img, alt: "", class: c("nimg"), decoding: "async" })
        : h("span", { class: cx(c("nimg"), c("nph")), style: { background: genreGrad(eventGenres(e)[0]) } }, initial(evTitle(e))),
      h("span", { class: c("ncol") },
        h("span", { class: c("nwhen"), style: { color: "#FF5A6E" } }, nextWhen(e)),   // artboard: her durumda #FF5A6E (DCLogic nextC)
        h("span", { class: c("ntitle") }, evTitle(e)),
        h("span", { class: c("nwhere") }, where ? where + " · " : "", h("span", { class: c("nprice") }, fmtPrice(e.ticketPrice ?? e.price)))));
  }
  function lastOfferCard(inv) {
    const st = OFFER_ST[inv.status] || [trUpper(inv.status || "—"), "#8A8E97"];
    return h("div", { class: c("lcard") },
      h("div", { class: c("lhead2") },
        h("span", { class: cx(c("lfee"), !feeIsNum(inv.fee) && "is-text") }, feeText(inv.fee)),
        h("span", { class: c("lst"), style: { color: st[1], borderColor: rgba(st[1], 0.5) } }, st[0])),
      h("dl", { class: c("dl") },
        h("div", { class: c("dlr") }, h("dt", {}, "Tarih"), h("dd", {}, offerDate(inv.eventDate))),
        h("div", { class: c("dlr") }, h("dt", {}, "Saat"), h("dd", {}, inv.eventTime || "—")),
        h("div", { class: c("dlr") }, h("dt", {}, "Tür"), h("dd", {}, inv.genre || "—"))));
  }

  // — takip anahtarı (dinleyici → sanatçı; followArtist/unfollowArtist iyimser, hata → geri al) —
  const _follow = new Map();   // artistId → Promise<bool>
  const followState = (id) => { if (!_follow.has(id)) _follow.set(id, isFollowing(me, id).catch(() => false)); return _follow.get(id); };
  function followToggle(cv, seq) {
    const b = h("button", { type: "button", class: cx(c("follow"), "dk-press"), "aria-pressed": "false", disabled: true }, "Takip et");
    const set = (on) => { b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("is-on", on); b.textContent = on ? "Takiptesin" : "Takip et"; };
    followState(cv.otherId).then((on) => { if (!alive || seq !== paneSeq) return; set(on); b.disabled = false; });
    let busy = false;
    b.addEventListener("click", async () => {
      if (busy) return;
      const next = b.getAttribute("aria-pressed") !== "true";
      busy = true; set(next);
      const pr = profile(cv.otherId).v || { displayName: cv.otherName };
      try {
        if (next) await followArtist(me, { ...pr, id: cv.otherId });
        else await unfollowArtist(me, cv.otherId);
        _follow.set(cv.otherId, Promise.resolve(next));
        invalidateAccountCounts(me);
        const bumped = bumpFollowers(cv.otherId, next ? 1 : -1);   // takipçi satırı ±1 (bilinmiyorsa önbellek düşer → taze okuma)
        if (alive) paneFollowChanged?.(cv.otherId, next, bumped);
      } catch (_) {
        set(!next);
        dkToast("İşlem başarısız, tekrar dene", { type: "err" });
      } finally { busy = false; }
    });
    return b;
  }

  // — Sohbeti sil (uygulama MessagesScreen.deleteConversation birebir) —
  async function deleteConversation(cv) {
    const ok = await dkConfirm({ title: "Sohbeti Sil", body: `${cv.otherName} ile sohbet sizin listenizden silinecek. Karşı tarafta kalmaya devam eder.`, confirmLabel: "Sil", cancelLabel: "İptal", danger: true, size: 420 });
    if (!ok || !alive) return;
    const ref = doc(db, "conversations", cv.id);
    try {
      await updateDoc(ref, { hiddenFor: arrayUnion(me) });
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data(); const parts = d.participants ?? []; const hidden = d.hiddenFor ?? [];
          if (parts.length > 0 && parts.every((p) => hidden.includes(p))) await deleteDoc(ref).catch(() => {});
        }
      } catch (_) { /* gizleme yapıldı; kalıcı silme sonraki gizlemede denenir (uygulama ile aynı) */ }
      if (!alive) return;
      S.drafts.delete(cv.id);
      if (S.activeId === cv.id) select(null, { user: true, autoPick: !single, exclude: cv.id });
      // silinen sohbetin başlığı (Diğer seçenekler) gitti ya da başka sohbete ait → odak yeni etkin satıra, yoksa aramaya.
      // Kullanıcı bu arada başka bir yere odaklandıysa dokunma.
      const fa = document.activeElement;
      if (!fa || fa === document.body || fa === moreBtn || !fa.isConnected) {
        requestAnimationFrame(() => {
          if (!alive) return;
          const f2 = document.activeElement;
          if (f2 && f2 !== document.body && f2 !== moreBtn && f2.isConnected) return;
          try { (rows.get(S.activeId)?._btn || searchIn).focus({ preventScroll: true }); } catch (_) {}
        });
      }
      dkToast("Sohbet silindi", { type: "ok" });
    } catch (_) {
      dkToast("Sohbet silinemedi. İnternet bağlantını kontrol edip tekrar dene.", { type: "err" });
    }
  }

  // ════════════ SEÇİM + DİNLEYİCİLER ════════════
  let unMsgs = null, unDoc = null;
  function stopActive() {
    try { unMsgs?.(); } catch (_) {} unMsgs = null;
    try { unDoc?.(); } catch (_) {} unDoc = null;
  }
  function startMessages(id) {
    unMsgs = listenMessages(id, (msgs) => {
      if (!alive || S.activeId !== id) return;
      S.msgs = msgs;
      renderLog();
      maybeMarkRead();
    });
  }
  function select(id, { user = false, autoPick = false, exclude = null } = {}) {
    if (user) userActed = true;
    if (!id && autoPick) { const f = allConvs().find((x) => x.id !== exclude); id = f ? f.id : null; }
    id = id || null;
    if (id && id === S.activeId) { applySingle(); return; }
    // yazılmamış taslak bırakılınca listeden düşer (DCLogic: "created" yalnız ilk mesaja kadar yerel)
    const prevId = S.activeId;
    if (prevId && S.drafts.has(prevId) && !S.convs.some((x) => x.id === prevId) && !texts.get(prevId)) S.drafts.delete(prevId);
    stopActive();
    menuPop?.close();
    S.activeId = id;
    // "Okunmamış" sekmesinde seçilen satır, okundu yapılınca süzgeçten düşmesin (odaklı düğme DOM'dan çıkmaz) — başka konuşmaya geçene dek
    S.stickyId = id && S.tab === "unread" ? id : null;
    S.msgs = null; S.convDoc = null;
    seen = new Set(); firstPaint = true; nodeCache = new Map(); offerCards.clear();
    // URL her zaman ekrandaki konuşmayı yansıtır (açılamayan ?c= bağlantısı da temizlenir) — replaceState, geçmiş kaydı eklemez
    writeQuery({ c: id });
    input.value = id ? (texts.get(id) || "") : "";
    syncInput();
    applySingle();   // is-chat sınıfı çizimden önce (readsActive / unreadOf ona bakar)
    if (id) quietLog();   // konuşma geçişinde tüm geçmiş aria-live ile baştan okunmasın
    renderList(); renderHeader(); renderComposer(); renderLog(); renderPane(true);
    log.scrollTop = 0;
    applySingle();
    if (!id) return;
    const cv = getConv(id);
    // konuşma dokümanı (blockedBy / deletedGroup — uygulama paritesi, salt okuma). Olmayan dokümanın get'i kurallarca serbest.
    unDoc = onSnapshot(doc(db, "conversations", id), (snap) => {
      if (!alive || S.activeId !== id) return;
      const prevLocked = isLocked();
      S.convDoc = snap.exists() ? snap.data() : null;
      if (prevLocked !== isLocked()) renderComposer();
    }, () => {});
    // taslak (doküman yok) → mesaj dinleyicisi konuşma oluşunca başlar (yoksa kuraldaki get() hatasıyla hemen ölür; legacy'de bu yüzden
    // bekleyen sohbette ilk mesaj ekrana düşmüyordu)
    if (cv?.draft && !S.convs.some((x) => x.id === id)) { S.msgs = []; renderLog(); }
    else startMessages(id);
    maybeMarkRead(true);
  }
  const lastMark = new Map();
  function maybeMarkRead(force) {
    const cv = S.convs.find((x) => x.id === S.activeId);
    if (!cv || !(Number(cv.unread) > 0)) return;
    if (!readsActive()) return;
    const key = cv.unread + ":" + (toMs(cv.lastMessageTime) || 0);
    if (!force && lastMark.get(cv.id) === key) return;
    lastMark.set(cv.id, key);
    markRead(cv.id, me);
  }
  function applySingle() {
    host.classList.toggle("is-single", single);
    host.classList.toggle("is-chat", single && !!S.activeId);
  }

  // ?c={convIdFor(me, other)} → henüz olmayan 1:1 konuşma için yerel taslak (ad/foto profilden). Geçersizse false.
  // Karşı taraf profili doğrulanana dek (unverified) gönderim kapalı; kullanıcı yoksa (silinmiş hesap / bozuk bağlantı) taslak düşer —
  // yoksa ilk mesaj var olmayan bir katılımcıyla konuşma dokümanı yazardı.
  function draftFromConvId(id) {
    const parts = String(id || "").split("__");
    const other = parts.length === 2 && parts.includes(me) ? parts.find((x) => x !== me) : null;
    if (!other || other === me) return false;
    const e = profile(other);
    if (e.v === null) return false;   // bu oturumda "yok" olduğu zaten biliniyor
    const known = e.v || null;
    S.drafts.set(id, { id, otherId: other, otherName: known ? (known.displayName || known.orgName || "Kullanıcı") : "Sohbet", isGroup: false, draft: true,
      otherPhoto: known?.photoURL || null, lastMessage: "", lastMessageTime: null, unread: 0, unverified: !known });
    if (!known) e.p.then((u) => {
      const d = S.drafts.get(id);
      if (!d || !alive) return;
      if (!u) {
        S.drafts.delete(id);
        if (S.activeId === id) {
          const fa = document.activeElement;
          const hadFocus = !fa || fa === document.body || host.contains(fa);
          select(null, { autoPick: !single });
          dkToast("Kullanıcı bulunamadı", { type: "err" });
          if (hadFocus) requestAnimationFrame(() => { if (alive) try { (rows.get(S.activeId)?._btn || searchIn).focus({ preventScroll: true }); } catch (_) {} });
        } else renderList();
        return;
      }
      d.unverified = false;
      d.otherName = u.displayName || u.orgName || "Kullanıcı"; d.otherPhoto = u.photoURL || null;
      headSig = ""; renderList(); if (S.activeId === id) { renderHeader(); renderPane(false); renderLog(); renderComposer(); syncInput(); }
    });
    return true;
  }

  // ilk seçim: ?c= → bekleyen requestChat hedefi → (≥1024) en son konuşma · (≤1023) liste
  // Liste hazır olmadan gelen update(query) (geri/ileri, bağlantı) bağlanıştaki ctx.query'nin yerine geçer (lateQuery).
  let lateQuery = null;
  function initialSelect() {
    const q = lateQuery || ctx?.query || new URLSearchParams();
    lateQuery = null;
    let id = q.get("c");
    if (pendingTarget) {
      const t = pendingTarget; pendingTarget = null;
      id = convIdFor(me, t.otherId);
      if (!S.convs.some((x) => x.id === id)) S.drafts.set(id, { id, otherId: t.otherId, otherName: t.otherName || "Sohbet", isGroup: false, draft: true, otherPhoto: null, lastMessage: "", lastMessageTime: null, unread: 0 });
      select(id, { user: true });
      requestAnimationFrame(focusInput);
      return;
    }
    if (id && !getConv(id) && !draftFromConvId(id)) id = null;
    select(id, { autoPick: !id && !single });
  }

  // canlı konuşma listesi — kabuklarla paylaşılan TEK listenConversations (live.js)
  unsubs.push(subscribeLive(me, (st) => {
    if (!alive) return;
    const becameReady = !S.ready && !!st.ready?.c;
    S.convs = st.conversations || [];
    S.ready = !!st.ready?.c;
    if (!booted) return;
    // taslak gerçek konuşmaya dönüştüyse: taslağı at, mesaj dinleyicisini başlat
    S.drafts.forEach((d, id) => { if (S.convs.some((x) => x.id === id)) { S.drafts.delete(id); if (S.activeId === id && !unMsgs && !inflight) startMessages(id); } });
    if (becameReady) { initialSelect(); return; }
    // etkin konuşma başka yerden silindi/gizlendiyse
    if (S.activeId && !getConv(S.activeId)) { select(null, { autoPick: !single }); return; }
    renderList(); renderHeader(); renderPane(false);
    if (!S.activeId) renderLog();
    maybeMarkRead();
  }, { notifications: false, messages: true }));

  // teklifler (sanatçı: bana gelenler · mekan: gönderdiklerim) — tek alan eşitliği (otomatik indeks), kurallar izin veriyor
  if (offerRole && me) {
    const field = myType === "artist" ? "artistId" : "venueId";
    unsubs.push(onSnapshot(query(collection(db, "invitations"), where(field, "==", me)), (snap) => {
      if (!alive) return;
      const byId = new Map(), byOther = new Map();
      snap.docs.forEach((d) => {
        const x = { id: d.id, ...d.data() };
        byId.set(d.id, x);
        const other = myType === "artist" ? x.venueId : x.artistId;
        if (!other) return;
        const prev = byOther.get(other);
        if (!prev || (toMs(x.createdAt) || 0) >= (toMs(prev.createdAt) || 0)) byOther.set(other, x);
      });
      S.inv = { byId, byOther, ready: true };
      S.offerLocal.forEach((st, id) => { if (byId.get(id)?.status === st) S.offerLocal.delete(id); });
      if (!booted) return;
      offerCards.forEach((r) => r.sync());
      renderList(); renderHeader(); renderPane(false);
    }, () => { S.inv = { ...S.inv, ready: true }; if (alive && booted) { offerCards.forEach((r) => r.sync()); renderPane(false); } }));
  }

  // görünüm modu (≤1023 tek bölme)
  const onMq = () => {
    single = mq.matches;
    if (!single && !S.activeId && S.ready) select(null, { autoPick: true });
    else { applySingle(); renderList(); }
    maybeMarkRead();
  };
  mq.addEventListener("change", onMq);
  unsubs.push(() => mq.removeEventListener("change", onMq));
  const onVis = () => {
    if (!alive) return;
    if (!userActed && autoRead()) { userActed = true; offAct(); }
    maybeMarkRead(); renderList();
  };
  document.addEventListener("visibilitychange", onVis);
  unsubs.push(() => document.removeEventListener("visibilitychange", onVis));
  unsubs.push(stopActive);

  // ilk çizim
  booted = true;
  applySingle();
  setTab("all");
  if (S.ready) initialSelect();
  else { renderList(); renderLog(); }

  return {
    destroy() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
    update(q) {
      if (!alive) return;
      if (!S.ready) { lateQuery = q || new URLSearchParams(); return; }   // liste gelince initialSelect bunu uygular
      const id = q?.get?.("c") || null;
      if (id === S.activeId) return;
      // açılamayan konuşma (başkasının / bozuk kimlik): ekrandaki konuşma kalır, adres çubuğu ona geri eşitlenir
      if (id && !getConv(id) && !draftFromConvId(id)) { writeQuery({ c: S.activeId }); return; }
      select(id, { autoPick: !id && !single });
    },
    onSession(s) { return !!s?.user && s.user.uid === me; },
  };
}
