// WebOrgEtkinlikler — masaüstü görünümü (≥769 px). Registry anahtarı: orgEtkinlik (#/organizer/etkinlik).
// Spec: specs/org-admin.md § WebOrgEtkinlikler (+ F1–F7). Artboard: design/WebOrgEtkinlikler.dc.html (sahibi notu YOK).
// CSS: css/dk-org-etkinlikler.css — sayfa kökü .dk-org-etkinlikler (kabuğun <main>'i), çekmece .dk-org-etkinlikler-drw (portal).
// ≤768: legacy organizer.js renderEvents/openCreateEvent/openEditEvent aynen kalır (router bu modülü mobilde yüklemez).
//
// URL (helpers.writeQuery, replaceState): ?durum=tumu|aktif|istek|gecmis · &q=<metin> · &yeni=1 (oluştur çekmecesi) ·
//   &duzenle=<eventId> (düzenle çekmecesi) · &izin=<staffUid> (sahip: düzenle çekmecesinde onay bandı — bildirimden gelir).
//
// Legacy özellikleri (korundu, organizer.js 193–527 + 2026-09-29 düzeltmeleri):
//   · Aktif/Geçmiş listeleri + bekleyen/reddedilen mekan istekleri (durum rozetleriyle) → tek tablo + 4 filtre
//   · Yeni etkinlik: kapak fotoğrafı (openImageCropper 16:9 → uploadImage, hata olursa fotosuz devam), mekan seçici (listVenues,
//     arama), sanatçı seçici (listArtists, isimli olanlar, ARAMA + seçili mekanın şehri önce), Kaldır, tarih (min bugün) / saat /
//     açıklama, doğrulama sırası ad → mekan → tarih → yinelenen istek (organizerRequests: pending|accepted + aynı mekan/ad/tarih/saat),
//     createOrgVenueRequest (app şeması, artistId/artistName), toast "İstek gönderildi — {mekan}"
//   · Düzenle: isOwner = (orgRole||"owner") !== "staff" · approvedForMe = editApprovedFor ∋ uid · canEdit · started = eventStartMs ≤ şimdi
//     kilit/başladı bantları, değiştirilemez tarih satırı, SAHİP: "Tarihi değiştir" (sil + yeniden oluştur) ve "Etkinliği Sil"
//     (mekana event_deleted bildirimi, best-effort), PERSONEL: yalnız onaylıysa kaydeder, değilse "Düzenleme İzni İste"
//     (edit_request → sahip; relatedUserId + staffId + staffName + fromName; fromUserId = auth uid sendNotification'da)
//   · Kaydet onayı ("Emin misiniz?") → updateEventFields(title, venueName, description)
//   · Sahip onay bandı (bildirimden): approveEventEdit + edit_approved bildirimi (fromName = orgName) → "İzin verildi"
//   · Mesaj düğmesi: requestChat({ otherId: venueId, otherName }) → #/organizer/mesaj · hata/boş durumları ("Yüklenemedi" …)
// Tasarım ekleri: tek tablo, 4 filtre + sayaç, arama, çekmece, akış adımları, satır içi açılır seçiciler, satır içi form hataları,
//   yeniden oluştur → ÖN DOLDURULMUŞ oluştur çekmecesi (ad, saat, mekan [userById], sanatçı).
//
// Bu dosya ayrıca WebOrgPanel'in (panel.js) kullandığı organizatör ortak yardımcılarını dışa aktarır (org bağlamı, etkinlik
// zamanı/durumu, tarih biçimleri, mesaj yönlendirme, düzenleme izni verme, zil bildirimleri).
import { h, openImageCropper } from "../../ui.js";
import { session } from "../../store.js";
import {
  organizerEvents, organizerRequests, listVenues, listArtists, uploadImage, eventById, userById, orgMembers,
  updateEventFields, deleteEventById, sendNotification, createOrgVenueRequest, approveEventEdit, markNotifRead,
} from "../../data.js";
import { requestChat as legacyRequestChat } from "../../pages/messages.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkButton, dkInput, dkTextarea, dkSearchInput, dkPageHero, dkStatusBadge, dkEmpty, dkSkeleton, dkDrawer, dkModal, dkToast } from "../shared/ui.js";
import { subscribeLive } from "../shared/live.js";
import { fold, matchText, trUpper, toMs, isLive, eventStartMs, eventEndMs, writeQuery, hashBase, isoDate, MONTHS_TR_SHORT } from "../shared/helpers.js";
import { genreColor } from "../shared/genres.js";
import { isDesktop } from "../../viewport.js";

// ══════════════════════════════════════════════════════════════════════
// ORTAK (panel.js de kullanır)
// ══════════════════════════════════════════════════════════════════════

// Artboard SVG gövdeleri — WebOrgPanel / WebOrgEtkinlikler inline <svg>'lerinden BİREBİR (icons.js kayıtlarından bazıları
// farklı yarıçap/stroke taşıyor, ör. saat r8.5 ↔ artboard r9).
export const I = {
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  people: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"></path><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  userPlus: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M19 8v6M16 11h6"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  shield: '<path d="M12 3 5 6v5.5c0 4.4 3 7.9 7 9.5 4-1.6 7-5.1 7-9.5V6z"></path><path d="m9 12 2 2 4-4"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  chevR: '<path d="m9 6 6 6-6 6"></path>',
  chevD: '<path d="m6 9 6 6 6-6"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
  chat: '<path d="M4 5h16v11H9l-5 4z"></path>',
  key: '<circle cx="8" cy="15" r="4"></circle><path d="m11 12 9-9M17 6l2 2M15 8l2 2"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3.5 6.5 8.5 7 8.5-7"></path>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.8"></circle><path d="m21 16-5-5-9 8"></path>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"></path><path d="M15 9h4a1 1 0 0 1 1 1v11"></path><path d="M3 21h18M8 8h3M8 12h3M8 16h3"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3 14.5 21l-4.5-7-7-4.5z"></path>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"></path>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path>',
  alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v6M12 16.5h.01"></path>',
};
// ico("calendar", 16, { color: "#FF4FA3", sw: "2.2" })
export const ico = (name, size = 16, { color = "currentColor", sw = "2", cls } = {}) => svgRaw(I[name] || "", { size, color, sw, cls });

// Oturumdaki organizatör bağlamı (legacy: orgId = p.orgId || uid · isOwner = (orgRole||"owner") !== "staff")
export function orgCtx(s = session) {
  const p = s.profile || {};
  const uid = s.user?.uid || p.id || null;
  return {
    uid, p, orgId: p.orgId || uid,
    isOwner: (p.orgRole || "owner") !== "staff",
    orgName: p.orgName || "Organizasyonunuz",
  };
}

// ── etkinlik zamanı / durumu (masaüstü tek tanım: helpers + data.js; canlı = başlangıç ≤ şimdi < bitiş) ──
export const evStart = (e) => eventStartMs(e);
// Legacy isPastEv: durum completed/past/cancelled/archived ya da bitişi geçmiş (bitiş: endAt → endTime → +6 sa, data.js)
export function isPastEv(e) {
  if (["completed", "past", "cancelled", "archived"].includes(e?.status)) return true;
  const end = eventEndMs(e);
  return end != null && end < Date.now();
}
export const evStatusKey = (e) => (isPastEv(e) ? "past" : isLive(e) ? "live" : "up");
// Legacy renderHome kuralı: iptal edilmemiş ve başlangıcı bugün 00:00 ve sonrası → yaklaşan (sıralı)
export function upcomingEvents(events) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const t0 = d.getTime();
  return (events || []).filter((e) => e.status !== "cancelled" && (evStart(e) ?? 0) >= t0).sort((a, b) => (evStart(a) ?? 0) - (evStart(b) ?? 0));
}
// venueRequests tarih/saat → ms (eventDate "YYYY-MM-DD" + eventTime)
export function reqMs(r) {
  const d = String(r?.eventDate || "");
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return toMs(r?.eventDate) ?? null;
  const [hh, mm] = String(r?.eventTime || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  return new Date(+m[1], +m[2] - 1, +m[3], hh, mm).getTime();
}
// "2 Eki 2026" (spec §7: toLocaleDateString tr-TR, fmtDate DEĞİL)
export const fmtDayMonYear = (ms) => (ms == null ? "—" : new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }));
// "6 Eki"
export const fmtDayMon = (ms) => (ms == null ? "" : `${new Date(ms).getDate()} ${MONTHS_TR_SHORT[new Date(ms).getMonth()]}`);
// Etkinlik saati: startTime, yoksa başlangıç zamanından
export function evTime(e) {
  if (e?.startTime) return e.startTime;
  const s = evStart(e);
  if (s == null) return "";
  const d = new Date(s);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Mekanla mesajlaş — legacy msgBtn: requestChat + #/organizer/mesaj. Masaüstü WebPanelMesajlar bekleyen hedefi chat.js'ten okur
// (legacy messages.js'in `pending`'i dışa aktarılmıyor) → ikisine de yaz; legacy mesaj sekmesi (legacy-in-shell) de açabilsin.
export function openVenueChat(otherId, otherName) {
  if (!otherId) return;
  const t = { otherId, otherName: otherName || "Mekan" };
  try { legacyRequestChat(t); } catch (_) {}
  import("../messages/chat.js").then((m) => { try { m.requestChat?.(t); } catch (_) {} }).catch(() => {})
    .finally(() => { location.hash = "#/organizer/mesaj"; });
}

// Düzenleme izni ver (sahip) — legacy openEditEvent onay bandı + spec WebOrgPanel §6 (sonra markNotifRead).
// approveEventEdit hata verirse fırlatır (çağıran "İzin verilemedi" gösterir); edit_approved bildirimi best-effort.
export async function grantEditPermission({ eventId, eventTitle, staffId, notifIds = [] }) {
  const p = session.profile || {};
  await approveEventEdit(eventId, staffId);
  try {
    await sendNotification(staffId, { type: "edit_approved", title: "Düzenleme İzni Verildi",
      body: `"${eventTitle || "Etkinlik"}" etkinliğini artık düzenleyebilirsin.`,
      fromName: p.orgName || "Organizasyon", extra: { eventId } });
  } catch (_) {}
  notifIds.forEach((id) => { if (id) markNotifRead(id); });
}

// ══════════ ZİL (her iki görünüm) ══════════
// SHARED-CANDIDATE: panel-shell "live" bildirim satırları yalnız okundu işaretliyor (href/onClick yok) → organizatörde edit_request
// satırı düzenle çekmecesini (onay bandıyla) açamıyordu (legacy notifRow davranışı). Burada kabuk "custom" modda beslenir:
// gerçek bildirimler (href'li) + mekan istek yanıtlarından türetilen satırlar (spec WebOrgPanel §9 yedeği).
// venue_request_update yazanlar: app mekan HomeScreen + masaüstü mekan paneli (requestId/status YOK; başlık "Etkinlik İsteğin
// Onaylandı 🎉" / "… Reddedildi", gövde `{mekan}, "{başlık}" isteğini onayladı|reddetti…`), legacy web mekan hiç yazmaz, CF yalnız push.
// → durum başlık/gövdeden çıkarılır; aynı isteğin gerçek bildirimi varsa türetilen satır atlanır; iki kaynak tek (tasarım) başlık kullanır.
// Tık → okundu: belge düzeyi yakalama dinleyicisi satırı href + başlık + gövdeyle eşler (kabuk custom satırlarda markNotifRead
// çağırmıyor); aynı metinli tüm okunmamış kopyalar birlikte okundu olur (ayırt edilemeyen yinelenen istekler). Kabuk bir gün satır
// başına onClick desteklerse bu blok sadeleşir.
const DAY = 86400e3;
const seenKey = (uid) => `gb.org.notifSeen.${uid}`;
function readSeen(uid) {
  try { const v = Number(localStorage.getItem(seenKey(uid))); if (v > 0) return v; } catch (_) {}
  return Date.now() - 7 * DAY; // ilk kez: son 7 günün yanıtları "yeni"
}
function writeSeen(uid, ms) { try { localStorage.setItem(seenKey(uid), String(ms)); } catch (_) {} }
const enc = encodeURIComponent;
// venue_request_update durumu: alan (seed/gelecekteki CF) → yoksa başlık/gövde metninden (app + masaüstü mekan yazımı)
function vruStatus(n) {
  if (n.status === "accepted" || n.status === "rejected") return n.status;
  const s = `${n.title || ""} ${n.body || ""}`;
  if (/reddedildi|reddetti/i.test(s)) return "rejected";
  if (/onaylandı|onayladı|kabul edildi/i.test(s)) return "accepted";
  return null;
}
const VRU_TITLE = { accepted: "Mekan isteği onaylandı", rejected: "İstek reddedildi" }; // tasarım popover metni (spec WebOrgPanel §5)
function notifHref(n) {
  const t = String(n.type || "");
  if (t === "edit_request" && n.eventId) {
    const sid = n.staffId || n.relatedUserId;
    return `#/organizer/etkinlik?duzenle=${enc(n.eventId)}${sid ? "&izin=" + enc(sid) : ""}`;
  }
  if (t === "edit_approved" && n.eventId) return `#/organizer/etkinlik?duzenle=${enc(n.eventId)}`;
  if (t === "venue_request_update") return vruStatus(n) === "accepted" ? "#/organizer/etkinlik?durum=aktif" : "#/organizer/etkinlik?durum=istek";
  if (/message|mesaj/i.test(t)) return "#/organizer/mesaj";
  return "#/organizer/bildirim";
}
function notifKind(n) {
  const t = String(n.type || "");
  if (t === "edit_request") return { icon: "key", color: "#FF4FA3" };
  if (t === "edit_approved") return { icon: "check", color: "#7CE0B0" };
  if (t === "venue_request_update") {
    const st = vruStatus(n);
    if (st === "accepted") return { icon: "check", color: "#7CE0B0" };
    if (st === "rejected") return { icon: "trash", color: "#FF5A6E" };
    return { icon: "building", color: "#FF8A2A" };
  }
  if (/deleted|cancel|reject/i.test(t)) return { icon: "trash", color: "#FF5A6E" };
  if (/message|mesaj/i.test(t)) return { icon: "chatSquare", color: "#A78BFA" };
  return { icon: "bellPanel", color: "#4ED8FF" };
}
// Bu gerçek bildirim şu isteğin yanıtı mı? requestId varsa kesin; yoksa aynı mekan + aynı durum + gövdede istek başlığı
function vruCovers(n, r) {
  if (n.requestId) return n.requestId === r.id;
  const title = String(r.title || "").trim();
  return !!title && n.fromUserId === r.venueId && vruStatus(n) === r.status && String(n.body || "").includes(title);
}
// shell: panelShell({ notifications: "custom" }) sonucu. Dönüş: { setRequests(list), notifications(), onNotifs(fn), destroy() }
export function attachOrgBell(shell, { uid }) {
  let live = { notifications: [] };
  let reqs = [];
  let items = [];
  const listeners = new Set();
  const build = () => {
    const seen = readSeen(uid);
    const all = live.notifications || [];
    const real = all.map((n) => {
      const st = n.type === "venue_request_update" ? vruStatus(n) : null;
      return { ...notifKind(n), id: n.id, title: (st && VRU_TITLE[st]) || n.title || "Bildirim", body: n.body || "", createdAt: n.createdAt, read: !!n.read, href: notifHref(n), _ms: toMs(n.createdAt) ?? 0 };
    });
    const vrus = all.filter((n) => n.type === "venue_request_update");
    const recent = Date.now() - 30 * DAY; // eski yanıtlar zili doldurmasın (son 30 gün)
    const derived = reqs.filter((r) => (r.status === "accepted" || r.status === "rejected") && (toMs(r.updatedAt) ?? 0) >= recent && !vrus.some((n) => vruCovers(n, r))).map((r) => {
      const ms = toMs(r.updatedAt) ?? toMs(r.createdAt) ?? 0;
      const acc = r.status === "accepted";
      return {
        derived: r.id, icon: acc ? "check" : "trash", color: acc ? "#7CE0B0" : "#FF5A6E",
        title: VRU_TITLE[r.status],
        body: `${r.venueName || "Mekan"}, “${r.title || "Etkinlik"}” isteğini ${acc ? "onayladı" : "reddetti"}.`,
        createdAt: r.updatedAt || r.createdAt, read: ms <= seen, _ms: ms,
        href: acc ? "#/organizer/etkinlik?durum=aktif" : "#/organizer/etkinlik?durum=istek",
      };
    });
    items = [...real, ...derived].sort((a, b) => b._ms - a._ms);
    shell.setNotifications(items);
    listeners.forEach((fn) => { try { fn(all); } catch (e) { console.error(e); } });
  };
  const un = uid ? subscribeLive(uid, (st) => {
    live = st;
    shell.setBadge("mesaj", st.unreadMessages || 0);
    build();
  }) : () => {};
  // Satır tıklaması → okundu (gerçek) / görüldü (türetilen). Popover portalda; satır ↔ öğe eşlemesi href + başlık + gövde metniyle.
  // Aynı metinli birden çok okunmamış öğe (ör. aynı etkinlik için tekrar gönderilen izin isteği) ayırt edilemez → hepsi okundu.
  const onClick = (e) => {
    const row = e.target?.closest?.(".dk-ps-notifpop .dk-ps-nrow");
    if (!row) return;
    const href = row.getAttribute("href");
    const title = row.querySelector(".dk-ps-nt")?.textContent || "";
    const body = row.querySelector(".dk-ps-nb")?.textContent || "";
    const hits = items.filter((x) => !x.read && x.href === href && x.title === title && (x.body || "") === body);
    let seenMs = 0;
    hits.forEach((it) => { if (it.id) markNotifRead(it.id); else if (it.derived) seenMs = Math.max(seenMs, it._ms); });
    if (seenMs) { writeSeen(uid, Math.max(readSeen(uid), seenMs)); build(); }
    // aynı rotada (yalnız ?sorgu değişir) popover kendiliğinden kapanmaz → gezinti sonrası kapat
    const x = document.querySelector(".dk-ps-notifpop .dk-ps-nclose");
    if (x && href && hashBase(href) === hashBase()) setTimeout(() => { if (x.isConnected) x.click(); }, 0);
  };
  document.addEventListener("click", onClick, true);
  return {
    setRequests(list) { reqs = list || []; build(); },
    notifications: () => live.notifications || [],
    // kayıt anında mevcut listeyle de çağır (canlı mağaza doluysa bir sonraki değişikliği beklemesin)
    onNotifs(fn) { listeners.add(fn); try { fn(live.notifications || []); } catch (e) { console.error(e); } return () => listeners.delete(fn); },
    destroy() { try { un(); } catch (_) {} document.removeEventListener("click", onClick, true); listeners.clear(); },
  };
}

// ══════════════════════════════════════════════════════════════════════
// GÖRÜNÜM
// ══════════════════════════════════════════════════════════════════════
const FILTERS = [["tumu", "Tümü"], ["aktif", "Aktif"], ["istek", "Mekan istekleri"], ["gecmis", "Geçmiş"]];
const FILTER_KEYS = new Set(FILTERS.map(([k]) => k));
const PAGE = "#/organizer/etkinlik";
const P = "dk-org-etkinlikler"; // sınıf öneki

// Sanatçı seçici avatar rengi (spec: Jazz #FF8A2A · Electronic #A78BFA · Rock #FF5A6E · Pop #EC4899 · Akustik #7CE0B0 · Hip-Hop #F97316 · R&B #4ED8FF; yedek #A3A7AF)
const artistGenre = (a) => (Array.isArray(a?.genres) ? a.genres[0] : a?.genre) || "";
const artistCity = (a) => a?.city || a?.location?.city || "";
const venueCity = (v) => v?.city || v?.location?.city || "";

export const NOT_READY = false;

export function orgEtkinliklerView(ctx) {
  const O = orgCtx(ctx.session || session);
  const { uid, orgId, isOwner } = O;
  const unsubs = [];
  let alive = true;

  const shell = panelShell({
    role: "organizer", active: ctx.route?.nav || "etkinlik", title: "Etkinlikler", crumb: "Etkinlikler", ctx, notifications: "custom",
    shellBadges: false, // Etkinlikler rozeti load()'daki organizerRequests'ten (kabuğun aynı sorgusu tekrarlanmasın)
    // üst bar araması bu sayfada tablo aramasını doldurur (spec F4 önerisi: Enter → ?q=)
    search: { onSubmit: (q) => { setQuery(q); searchBox.input.value = q; } },
  });
  const root = shell.content;
  root.classList.add(P);
  const bell = attachOrgBell(shell, { uid });
  unsubs.push(() => bell.destroy());

  // ── durum ──
  const S = { events: [], reqs: [], loaded: false, error: false, filter: "tumu", q: "", editId: null };
  let drawer = null; // { kind: "create"|"edit", id, izin, close(silent) }
  let loadP = null;

  // ── hero ──
  const newBtn = dkButton("Yeni etkinlik", { variant: "primary", size: 44, icon: ico("plus", 17, { color: "#06070A", sw: "2.2" }), onClick: () => startCreate() });
  const hero = dkPageHero({
    eyebrow: `ETKİNLİKLER · ${trUpper(O.orgName)}`, title: "Etkinliklerin, ", em: "tek tabloda", tail: ".",
    lead: "Yeni etkinlik oluşturduğunda seçtiğin mekana istek gider; mekan onaylayınca etkinlik aktif olur.",
    actions: [newBtn], cls: `${P}-hero`,
  });
  hero.querySelector("h1").style.fontSize = ""; // boyut CSS'te (52 → ≤1023'te 40)
  root.append(hero);

  // ── filtre çubuğu ──
  const tableId = `${P}-tbl`;
  const chips = new Map();
  const tablist = h("div", { role: "tablist", "aria-label": "Durum filtresi", class: `${P}-chips` });
  FILTERS.forEach(([k, label]) => {
    const cnt = h("span", { class: `${P}-chipn` }, "0");
    const b = h("button", { type: "button", role: "tab", "aria-selected": "false", "aria-controls": tableId, tabindex: "-1", class: `${P}-chip dk-press`, dataset: { k } }, label, cnt);
    b.addEventListener("click", () => setFilter(k));
    chips.set(k, { b, cnt });
    tablist.append(b);
  });
  tablist.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const keys = FILTERS.map(([k]) => k);
    let i = keys.indexOf(S.filter);
    if (e.key === "ArrowLeft") i = (i - 1 + keys.length) % keys.length;
    else if (e.key === "ArrowRight") i = (i + 1) % keys.length;
    else if (e.key === "Home") i = 0; else i = keys.length - 1;
    setFilter(keys[i]);
    chips.get(keys[i]).b.focus();
  });
  const searchBox = dkSearchInput({ placeholder: "Etkinlik, mekan veya sanatçı", label: "Etkinlik ara", radius: 6, iconName: "search2", uaPad: true, cls: `${P}-search`,
    onInput: (v) => setQuery(v) });
  root.append(h("div", { class: `${P}-bar` }, tablist, searchBox));

  // ── tablo ──
  const COLS = ["ETKİNLİK", "MEKAN", "TARİH · SAAT", "DURUM", "İŞLEM"];
  const tbody = h("div", { role: "rowgroup", class: `${P}-tbody` });
  const table = h("section", { role: "table", "aria-label": "Etkinlik tablosu", id: tableId, class: `${P}-table` },
    h("div", { role: "rowgroup", class: `${P}-thead` },
      h("div", { role: "row", class: `${P}-hrow ${P}-grid` }, ...COLS.map((c, i) => h("span", { role: "columnheader", class: i === 4 ? "is-right" : null }, c)))),
    tbody);
  root.append(table);

  // ── veri ──
  const rowsAll = () => {
    const act = S.events.filter((e) => !isPastEv(e)).sort((a, b) => (evStart(a) ?? 0) - (evStart(b) ?? 0));
    const past = S.events.filter((e) => isPastEv(e)).sort((a, b) => (evStart(b) ?? 0) - (evStart(a) ?? 0));
    const reqs = S.reqs.filter((r) => r.status === "pending" || r.status === "rejected").sort((a, b) => (reqMs(a) ?? 0) - (reqMs(b) ?? 0));
    const evRow = (e) => {
      const ms = evStart(e);
      return { key: "e:" + e.id, kind: "event", id: e.id, title: e.title || "Etkinlik", artist: e.artistName || "", venue: e.venueName || "", venueId: e.venueId,
        date: fmtDayMonYear(ms), time: evTime(e) || "—", st: evStatusKey(e), img: e.bannerUrl || "", ev: e };
    };
    const reqRow = (r) => ({ key: "r:" + r.id, kind: "req", id: r.id, title: r.title || "Etkinlik", artist: r.artistName || "", venue: r.venueName || "", venueId: r.venueId,
      date: fmtDayMonYear(reqMs(r)), time: r.eventTime || "—", st: r.status === "rejected" ? "rejected" : "pending", img: r.bannerUrl || "", req: r });
    return [...act.map(evRow), ...reqs.map(reqRow), ...past.map(evRow)];
  };
  const inFilter = (r, k) => k === "tumu" || (k === "aktif" && r.kind === "event" && (r.st === "live" || r.st === "up"))
    || (k === "istek" && r.kind === "req") || (k === "gecmis" && r.st === "past");

  const thumb = (url) => {
    const box = h("span", { class: `${P}-thumb` });
    const fallback = () => { box.replaceChildren(ico("calendar", 20, { color: "#5E636D" })); box.classList.add("is-empty"); };
    if (url) {
      const img = h("img", { src: url, alt: "", loading: "lazy", decoding: "async" });
      img.addEventListener("error", fallback, { once: true });
      box.append(img);
    } else fallback();
    return box;
  };
  const msgButton = (venueId, venueName, size = 36) => venueId
    ? h("button", { type: "button", class: `${P}-msg dk-press`, "aria-label": `${venueName || "Mekan"} ile mesajlaş`, style: size !== 36 ? { width: size + "px", height: size + "px" } : null,
      onclick: (e) => { e.stopPropagation(); openVenueChat(venueId, venueName); } }, ico("chat", 15))
    : null;

  function renderRow(r) {
    const editBtn = r.kind === "event"
      ? h("button", { type: "button", class: `${P}-edit dk-press`, "aria-label": `${r.title} etkinliğini düzenle`, onclick: (e) => { e.stopPropagation(); startEdit(r.id); } },
        ico("pencil", 14), h("span", { class: `${P}-editl` }, "Düzenle"))
      : null;
    const row = h("div", { role: "row", class: cx(`${P}-row`, `${P}-grid`, "dk-row", r.kind === "event" && "is-event", S.editId && r.kind === "event" && S.editId === r.id && "is-editing"), dataset: { key: r.key } },
      h("div", { role: "cell", class: `${P}-c1` },
        thumb(r.img),
        h("div", { class: `${P}-tcol` },
          h("span", { class: `${P}-title` }, r.title),
          h("span", { class: `${P}-artist` }, ico("mic", 12), h("span", { class: "dk-truncate" }, r.artist || "—")),
          // ≤1023: MEKAN ve TARİH sütunları gizlenir, bu satır görünür (spec §10)
          h("span", { class: `${P}-meta` }, ico("pin", 12, { color: "#FF8A2A" }), h("span", { class: "dk-truncate" }, [r.venue || "—", r.date, r.time !== "—" ? r.time : ""].filter(Boolean).join(" · "))))),
      h("span", { role: "cell", class: `${P}-c2` }, ico("pin", 13, { color: "#FF8A2A" }), h("span", { class: "dk-truncate" }, r.venue || "—")),
      h("span", { role: "cell", class: `${P}-c3` }, h("span", { class: `${P}-d` }, r.date), h("span", { class: `${P}-h` }, r.time)),
      h("span", { role: "cell", class: `${P}-c4` }, dkStatusBadge(r.st, { variant: "pill" })),
      h("div", { role: "cell", class: `${P}-c5` }, editBtn, msgButton(r.venueId, r.venue)));
    if (r.kind === "event") {
      row.addEventListener("click", (e) => { if (e.target.closest("button,a,input")) return; startEdit(r.id); });
    }
    return row;
  }

  const asRow = (el) => h("div", { role: "row" }, h("div", { role: "cell" }, el)); // boş/hata durumu: tablo ARIA ağacı geçerli kalsın
  function render() {
    const all = S.loaded ? rowsAll() : [];
    chips.forEach(({ b, cnt }, k) => {
      const on = k === S.filter;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      cnt.textContent = S.loaded ? String(all.filter((r) => inFilter(r, k)).length) : "–";
    });
    if (!S.loaded && !S.error) {
      tbody.replaceChildren(...Array.from({ length: 5 }, () => h("div", { class: `${P}-row ${P}-grid ${P}-skrow`, "aria-hidden": "true" },
        h("div", { class: `${P}-c1` }, dkSkeleton({ w: 44, h: 44, r: 8 }), h("div", { class: `${P}-tcol` }, dkSkeleton({ w: 160, h: 14 }), dkSkeleton({ w: 96, h: 11 }))),
        h("span", { class: `${P}-c2` }, dkSkeleton({ w: 120, h: 13 })), h("span", { class: `${P}-c3` }, dkSkeleton({ w: 90, h: 13 })),
        h("span", { class: `${P}-c4` }, dkSkeleton({ w: 84, h: 22, r: 12 })), h("span", { class: `${P}-c5` }))));
      table.setAttribute("aria-busy", "true");
      return;
    }
    table.removeAttribute("aria-busy");
    if (S.error) {
      tbody.replaceChildren(asRow(dkEmpty({ variant: "plain", icon: ico("alert", 30, { color: "#5E636D" }), title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile." })));
      return;
    }
    const q = S.q.trim();
    const inF = all.filter((r) => inFilter(r, S.filter));
    const rows = inF.filter((r) => !q || matchText(q, r.title, r.venue, r.artist));
    // Yeniden çizim tbody'deki odaklı düğmeyi (ör. çekmece kapanınca dönülen "Düzenle") siler → aynı satırın aynı düğmesine,
    // satır kalmadıysa içerik bölgesine (#dk-main, tabindex -1) taşı; odak <body>'ye düşmesin.
    const ae = document.activeElement;
    const fRow = ae && ae !== tbody && tbody.contains(ae) ? ae.closest(`.${P}-row`) : null;
    const fKey = fRow?.dataset.key || null;
    const fCls = ae?.classList?.contains(`${P}-msg`) ? `${P}-msg` : `${P}-edit`;
    if (!rows.length) {
      // Tasarım metni yalnız gerçekten boş filtre için (Aktif/Tümü → "Aktif etkinlik yok", Geçmiş → "Geçmiş etkinlik yok");
      // aramanın gizlediği satırlar ve boş "Mekan istekleri" için ayrı metin (sayaçla çelişmesin).
      const e = inF.length && q
        ? { title: "Sonuç bulunamadı", sub: `“${q}” için eşleşen etkinlik yok.` }
        : S.filter === "gecmis" ? { title: "Geçmiş etkinlik yok", sub: "Mekan onayladığında etkinliklerin burada görünür." }
        : S.filter === "istek" ? { title: "Bekleyen mekan isteği yok", sub: "Yeni etkinlik oluşturduğunda seçtiğin mekana giden istek burada görünür." }
        : { title: "Aktif etkinlik yok", sub: "Mekan onayladığında etkinliklerin burada görünür." };
      tbody.replaceChildren(asRow(dkEmpty({ variant: "plain", icon: ico(q && inF.length ? "search" : "calendar", 30, { color: "#5E636D" }), title: e.title, sub: e.sub })));
      if (fRow) focusSafe(root);
      return;
    }
    tbody.replaceChildren(...rows.map(renderRow));
    if (fRow) {
      const nr = [...tbody.children].find((el) => el.dataset.key === fKey);
      focusSafe(nr?.querySelector(`.${fCls}`) || nr?.querySelector("button") || root);
    }
  }
  function focusSafe(el) { try { el?.focus({ preventScroll: true }); } catch (_) {} }
  const markEditing = () => tbody.querySelectorAll(`.${P}-row`).forEach((el) => el.classList.toggle("is-editing", !!S.editId && el.dataset.key === "e:" + S.editId));

  async function load() {
    if (!uid) { S.error = true; render(); return; }
    loadP = (async () => {
      try {
        const [events, reqs] = await Promise.all([organizerEvents(orgId), organizerRequests(uid)]);
        if (!alive) return;
        S.events = events || []; S.reqs = reqs || []; S.loaded = true; S.error = false;
        shell.setBadge("etkinlik", S.reqs.filter((r) => r.status === "pending").length);
        bell.setRequests(S.reqs);
      } catch (e) {
        console.warn("[org etkinlikler]", e);
        if (!alive) return;
        if (!S.loaded) S.error = true;
      }
      render();
    })();
    return loadP;
  }

  // ── filtre / arama ──
  function setFilter(k) {
    if (!FILTER_KEYS.has(k)) k = "tumu";
    S.filter = k;
    writeQuery({ durum: k === "tumu" ? null : k });
    render();
  }
  function setQuery(v) {
    S.q = String(v || "");
    writeQuery({ q: S.q.trim() || null });
    render();
  }

  // ══════════ ÇEKMECELER ══════════
  const onRoute = () => alive && hashBase() === PAGE;
  // closeDrawer(silent): URL'ye dokunmadan kapat (başka çekmeceye geçiş / update / destroy)
  function closeDrawer() {
    if (!drawer) return;
    const d = drawer; drawer = null;
    d.silent = true;
    d.close();
  }
  function afterClose(d, reason) {
    if (drawer === d) drawer = null;
    if (S.editId && d.kind === "edit") { S.editId = null; markEditing(); }
    d.cleanup?.();
    const user = !d.silent && reason !== "route" && reason !== "mode" && reason !== "identity" && onRoute();
    if (user) writeQuery({ yeni: null, duzenle: null, izin: null });
    // Çekmece odağı açanına döndüremediyse (URL'den açıldı / tetikleyici yeniden çizimle gitti) odak kapanan panelde ya da
    // <body>'de kalır → satırın "Düzenle"sine, yoksa içerik bölgesine.
    if (user) {
      const a = document.activeElement;
      if (!a || a === document.body || a.closest?.(".dk-drw-wrap")) {
        const row = d.kind === "edit" ? [...tbody.children].find((el) => el.dataset.key === "e:" + d.id) : null;
        focusSafe(row?.querySelector(`.${P}-edit`) || (d.kind === "create" ? newBtn : null) || root);
      }
    }
  }
  function startCreate(prefill) {
    writeQuery({ yeni: 1, duzenle: null, izin: null });
    openCreate(prefill);
  }
  function startEdit(id, izin) {
    writeQuery({ duzenle: id, izin: izin || null, yeni: null });
    openEditById(id, izin);
  }

  // Legacy kırpıcı (#modal-root, z 3000) çekmecenin üstünde açılır; çekmecenin belge düzeyi ESC/Tab tuzağı onu kapatmasın diye
  // kırpıcı açıkken pencere düzeyinde (önce çalışır) ESC → İptal, Tab → kırpıcı içinde döngü.
  function cropWithKeys(file) {
    const ov = () => document.querySelector("#modal-root .cr-overlay");
    const onKey = (e) => {
      const o = ov(); if (!o) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); o.querySelector(".btn-ghost")?.click(); return; }
      if (e.key === "Tab") {
        const f = [...o.querySelectorAll("button,input")].filter((x) => !x.disabled);
        if (!f.length) return;
        e.preventDefault(); e.stopPropagation();
        const i = f.indexOf(document.activeElement);
        const n = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length;
        f[n].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    let tries = 0;
    const focusIt = () => { const o = ov(); if (o) { o.querySelector(".cr-actions .btn:not(.btn-ghost)")?.focus(); return; } if (++tries < 90 && alive) requestAnimationFrame(focusIt); };
    requestAnimationFrame(focusIt);
    return openImageCropper(file, { aspect: 16 / 9 }).catch(() => null).finally(() => window.removeEventListener("keydown", onKey, true));
  }

  // ── Yeni etkinlik ──
  let venuesP = null, artistsP = null;
  function openCreate(prefill = {}) {
    closeDrawer();
    const profile = session.profile || { id: uid };
    let venueSel = prefill.venue || null;
    let artistSel = prefill.artist || null;
    let file = null;
    let busy = false;
    let pick = "";

    // 1) akış adımları
    const steps = h("ol", { "aria-label": "Etkinlik akışı", class: `${P}-steps` },
      ...[["01", "Bilgileri gir"], ["02", "Mekan onayı"], ["03", "Yayında"]].map(([n, l], i) =>
        h("li", { class: cx(`${P}-step`, i === 0 && "is-on"), "aria-current": i === 0 ? "step" : null }, h("span", { class: `${P}-stepn` }, n), h("span", { class: `${P}-stepl` }, l))));

    // 2) kapak
    const fileIn = h("input", { type: "file", accept: "image/*", hidden: true });
    const coverInner = () => [ico("image", 24, { color: "#8A8E97" }), h("span", {}, "Kapak fotoğrafı ekle (16:9, opsiyonel)"), h("span", { class: `${P}-covsub` }, "JPG · PNG")];
    const cover = h("button", { type: "button", class: `${P}-cover dk-press` }, ...coverInner());
    let previewUrl = null;
    cover.addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", async () => {
      const picked = fileIn.files?.[0] || null;
      fileIn.value = "";
      if (!picked) return;
      const cropped = await cropWithKeys(picked);
      if (!cropped || !alive) { try { cover.focus(); } catch (_) {} return; }
      file = cropped;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(cropped);
      cover.classList.add("has-img");
      cover.setAttribute("aria-label", "Kapak fotoğrafını değiştir");
      cover.replaceChildren(h("img", { src: previewUrl, alt: "" }), h("span", { class: `${P}-covchg` }, ico("image", 13), "Değiştir"));
      try { cover.focus(); } catch (_) {}
    });

    // 3) ad
    const tIn = dkInput({ id: `${P}-c-title`, placeholder: "Örn. Yaz Festivali", value: prefill.title || "", onInput: () => setErr("") });
    // 4) mekan seçici
    const venueLbl = h("span", { class: `${P}-pbl` });
    const venueBtn = h("button", { type: "button", class: `${P}-pick dk-press`, "aria-expanded": "false", "aria-haspopup": "listbox", id: `${P}-c-venue` },
      ico("building", 18), venueLbl, ico("chevD", 16));
    const venueList = h("div", { class: `${P}-dlist dk-scroll`, role: "listbox", "aria-label": "Mekanlar" });
    const venueQ = h("input", { type: "text", "aria-label": "Mekan ara", placeholder: "Mekan ara...", class: `${P}-dq`, autocomplete: "off" });
    const venueDrop = h("div", { class: `${P}-drop dk-pop`, hidden: true },
      h("label", { class: `${P}-dsearch` }, ico("search", 15), venueQ), venueList);
    // 5) sanatçı seçici
    const artistLbl = h("span", { class: `${P}-pbl` });
    const artistBtn = h("button", { type: "button", class: `${P}-pick dk-press`, "aria-expanded": "false", "aria-haspopup": "listbox", id: `${P}-c-artist` },
      ico("mic", 18), artistLbl, ico("chevD", 16));
    const artistClear = h("button", { type: "button", class: `${P}-clear dk-press`, hidden: true }, ico("x", 14), "Kaldır");
    const artistList = h("div", { class: `${P}-dlist dk-scroll`, role: "listbox", "aria-label": "Sanatçılar" });
    const artistQ = h("input", { type: "text", "aria-label": "Sanatçı ara", placeholder: "Sanatçı ara...", class: `${P}-dq`, autocomplete: "off" });
    const artistDrop = h("div", { class: `${P}-drop dk-pop`, hidden: true },
      h("label", { class: `${P}-dsearch` }, ico("search", 15), artistQ), artistList);
    const artistNote = h("span", { class: `${P}-anote`, hidden: true }, ico("check", 13, { color: "#7CE0B0", sw: "2.4" }), "Kayıtlı sanatçı seçildi — kabul edilince teklif gönderilir");
    // 6) tarih / saat
    const dIn = dkInput({ id: `${P}-c-date`, type: "date", attrs: { min: isoDate(Date.now()) }, onInput: () => setErr("") });
    const hIn = dkInput({ id: `${P}-c-time`, type: "time", value: prefill.time || "" });
    // 7) açıklama
    const descIn = dkTextarea({ id: `${P}-c-desc`, rows: 3, placeholder: "Açıklama..." });

    const lbl = (text, forId) => h(forId ? "label" : "span", { class: "dk-lbl", for: forId || null }, text);
    const body = h("div", { class: `${P}-form` },
      steps,
      h("div", { class: `${P}-covwrap` }, cover, fileIn),
      h("div", { class: `${P}-fld` }, lbl("ETKİNLİK ADI *", tIn.id), tIn),
      h("div", { class: `${P}-fld` }, lbl("MEKAN *"), venueBtn, venueDrop,
        h("span", { class: `${P}-help` }, "Seçtiğin mekana istek gönderilir. ", h("a", { href: "#/organizer/mekan", class: `${P}-helpa` }, "Mekanları haritada gör"))),
      h("div", { class: `${P}-fld` }, lbl("SANATÇI (OPSİYONEL)"), h("div", { class: `${P}-prow` }, artistBtn, artistClear), artistDrop, artistNote),
      h("div", { class: `${P}-two` },
        h("div", { class: `${P}-fld` }, lbl("ETKİNLİK TARİHİ *", dIn.id), dIn),
        h("div", { class: `${P}-fld` }, lbl("SAAT", hIn.id), hIn)),
      h("div", { class: `${P}-fld` }, lbl("AÇIKLAMA", descIn.id), descIn),
      h("div", { class: `${P}-callout` }, ico("info", 16, { color: "#4ED8FF" }),
        h("span", {}, "Aynı ad, mekan, tarih ve saatle bekleyen veya kabul edilmiş bir istek varsa yeni istek gönderilmez.")));

    const errEl = h("span", { role: "alert", class: `${P}-err` });
    const setErr = (m) => { errEl.textContent = m || ""; };
    const cancelBtn = dkButton("İptal", { variant: "outline", size: 44, onClick: () => d.close("cancel") });
    const submitBtn = dkButton("Oluştur ve istek gönder", { variant: "primary", size: 44, icon: ico("send", 17, { color: "#06070A", sw: "2.2" }), onClick: () => submit() });

    const paintVenue = () => {
      venueLbl.textContent = venueSel ? (venueSel.displayName || "Mekan") : "Mekan Seç * (istek gönderilir)";
      venueBtn.classList.toggle("is-set", !!venueSel);
    };
    const paintArtist = () => {
      artistLbl.textContent = artistSel ? artistSel.name : "Sistemden sanatçı seçin (opsiyonel)";
      artistBtn.classList.toggle("is-set", !!artistSel);
      artistClear.hidden = !artistSel;
      artistNote.hidden = !artistSel;
    };
    paintVenue(); paintArtist();

    const setPick = (k) => {
      pick = k;
      venueDrop.hidden = k !== "venue";
      artistDrop.hidden = k !== "artist";
      venueBtn.setAttribute("aria-expanded", k === "venue" ? "true" : "false");
      artistBtn.setAttribute("aria-expanded", k === "artist" ? "true" : "false");
      const show = (drop, q) => requestAnimationFrame(() => {
        try { q.focus({ preventScroll: true }); drop.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } catch (_) {}
      });
      if (k === "venue") { venueQ.value = ""; drawVenues(); show(venueDrop, venueQ); }
      if (k === "artist") { artistQ.value = ""; drawArtists(); show(artistDrop, artistQ); }
    };
    venueBtn.addEventListener("click", () => setPick(pick === "venue" ? "" : "venue"));
    artistBtn.addEventListener("click", () => setPick(pick === "artist" ? "" : "artist"));
    artistClear.addEventListener("click", () => { artistSel = null; paintArtist(); artistBtn.focus(); });

    const optRow = ({ av, name, meta, onPick }) => {
      const b = h("button", { type: "button", role: "option", class: `${P}-opt dk-row` }, av,
        h("span", { class: `${P}-ocol` }, h("span", { class: `${P}-on` }, name), meta ? h("span", { class: `${P}-om` }, meta) : null),
        ico("chevR", 16, { color: "#8A8E97" }));
      b.addEventListener("click", onPick);
      return b;
    };
    const listMsg = (list, text) => list.replaceChildren(h("div", { class: `${P}-dempty` }, text));
    let venues = null, artists = null;
    function drawVenues() {
      if (!venuesP) venuesP = listVenues();
      if (!venues) {
        listMsg(venueList, "Yükleniyor…");
        venuesP.then((vs) => { venues = vs || []; if (pick === "venue") drawVenues(); })
          .catch(() => { venuesP = null; listMsg(venueList, "Mekanlar yüklenemedi."); });
        return;
      }
      const q = fold(venueQ.value);
      const list = venues.filter((vn) => !q || fold(vn.displayName).includes(q) || fold(venueCity(vn)).includes(q));
      if (!list.length) return listMsg(venueList, "Kayıtlı mekan bulunamadı.");
      venueList.replaceChildren(...list.map((vn) => optRow({
        av: h("span", { class: `${P}-vav` }, (vn.displayName || "M").charAt(0).toLocaleUpperCase("tr-TR")),
        name: vn.displayName || "Mekan", meta: venueCity(vn),
        onPick: () => { venueSel = vn; paintVenue(); setPick(""); setErr(""); venueBtn.focus(); },
      })));
    }
    function drawArtists() {
      if (!artistsP) artistsP = listArtists();
      if (!artists) {
        listMsg(artistList, "Yükleniyor…");
        artistsP.then((as) => { artists = (as || []).filter((a) => (a.displayName || a.name || "").trim()); if (pick === "artist") drawArtists(); })
          .catch(() => { artistsP = null; listMsg(artistList, "Sanatçılar yüklenemedi."); });
        return;
      }
      // legacy: seçili mekanın şehrindeki sanatçılar önce
      const vc = fold(venueCity(venueSel));
      const sorted = vc ? [...artists].sort((a, b) => (fold(artistCity(b)) === vc ? 1 : 0) - (fold(artistCity(a)) === vc ? 1 : 0)) : artists;
      const q = fold(artistQ.value);
      const list = sorted.filter((a) => !q || fold(a.displayName || a.name).includes(q));
      if (!list.length) return listMsg(artistList, "Kayıtlı sanatçı bulunamadı.");
      artistList.replaceChildren(...list.map((a) => {
        const name = a.displayName || a.name || "Sanatçı";
        const g = artistGenre(a);
        return optRow({
          av: h("span", { class: `${P}-aav`, style: { background: g ? genreColor(g) : "#A3A7AF" } }, name.replace(/^DJ\s+/i, "").charAt(0).toLocaleUpperCase("tr-TR")),
          name, meta: [g, artistCity(a)].filter(Boolean).join(" · "),
          onPick: () => { artistSel = { id: a.id, name }; paintArtist(); setPick(""); artistBtn.focus(); },
        });
      }));
    }
    venueQ.addEventListener("input", drawVenues);
    artistQ.addEventListener("input", drawArtists);
    // Açılır liste açıkken ESC yalnız listeyi kapatsın (çekmecenin belge düzeyi ESC'sinden önce: pencere yakalama evresi)
    const onEsc = (e) => {
      if (e.key !== "Escape" || !pick || document.querySelector("#modal-root .cr-overlay")) return;
      e.preventDefault(); e.stopPropagation();
      const btn = pick === "venue" ? venueBtn : artistBtn;
      setPick(""); btn.focus();
    };
    window.addEventListener("keydown", onEsc, true);

    async function submit() {
      if (busy) return;
      const f = { title: tIn.value.trim(), date: dIn.value.trim(), time: hIn.value.trim(), description: (descIn.input || descIn).value.trim() };
      if (!f.title) { setErr("Etkinlik adı gir"); tIn.focus(); return; }
      if (!venueSel) { setErr("Mekan seç"); venueBtn.focus(); return; }
      if (!f.date) { setErr("Etkinlik tarihi seç"); dIn.focus(); return; }
      busy = true; setErr(""); submitBtn.dk.setBusy(true);
      try {
        // Aynı başlık/mekan/tarih/saat için bekleyen ya da kabul edilmiş istek varsa engelle (legacy birebir)
        const prev = await organizerRequests(uid);
        const dup = prev.find((r) => ["pending", "accepted"].includes(r.status) && r.venueId === venueSel.id
          && (r.title || "") === f.title && r.eventDate === f.date && (r.eventTime || "") === (f.time || ""));
        if (dup) { setErr("Bu istek zaten gönderilmiş"); return; }
        if (artistSel) { f.artistId = artistSel.id; f.artistName = artistSel.name; }
        try { if (file) f.bannerUrl = await uploadImage(file, uid); } catch (_) { /* foto olmadan devam (legacy) */ }
        await createOrgVenueRequest(profile, venueSel, f);
        dkToast("İstek gönderildi — " + (venueSel.displayName || "Mekan"));
        d.close("action");
        S.filter = "istek";
        writeQuery({ durum: "istek" });
        render();
        load();
      } catch (e) {
        console.warn("[org create]", e);
        dkToast("İstek gönderilemedi", { type: "err" });
      } finally {
        busy = false;
        if (submitBtn.isConnected) submitBtn.dk.setBusy(false);
      }
    }

    const rec = { kind: "create" };
    rec.cleanup = () => { window.removeEventListener("keydown", onEsc, true); if (previewUrl) URL.revokeObjectURL(previewUrl); };
    const d = dkDrawer({
      eyebrow: "YENİ ETKİNLİK · MEKANA İSTEK", title: "Yeni Etkinlik", body, footer: [errEl, cancelBtn, submitBtn], cls: `${P}-drw`,
      onClose: (reason) => afterClose(rec, reason),
    });
    rec.close = () => d.close("switch");
    drawer = rec;
    // odak: diyaloğun kendisi (tabindex -1, halka yok; ekran okuyucu başlığı okur, Tab → kapat → alanlar). dkDrawer ilk input'a
    // odaklanıyordu → ad alanı açılışta camgöbeği kenarlıkla geliyordu (artboard dinlenme hali nötr).
    requestAnimationFrame(() => focusSafe(d.panel));
  }

  // ── Düzenle ──
  async function openEditById(id, izin) {
    if (drawer && drawer.kind === "edit" && drawer.id === id && (drawer.izin || null) === (izin || null)) return;
    if (!S.loaded) { try { await (loadP || load()); } catch (_) {} }
    if (!alive || !onRoute()) return;
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    if (q.get("duzenle") !== id) return; // bu arada başka bir şey seçildi
    let ev = S.events.find((e) => e.id === id);
    if (!ev) {
      try { ev = await eventById(id); } catch (e) { if (!alive) return; closeDrawer(); dkToast("Etkinlik açılamadı", { type: "err" }); writeQuery({ duzenle: null, izin: null }); return; }
      if (!alive) return;
      // URL ile arayüz ayrışmasın: önceki çekmece (başka etkinlik) açıksa kapat
      if (!ev) { closeDrawer(); dkToast("Etkinlik bulunamadı", { type: "err" }); writeQuery({ duzenle: null, izin: null }); return; }
    }
    openEdit(ev, izin);
  }

  function openEdit(ev, izin) {
    closeDrawer();
    const p = session.profile || {};
    const approvedForMe = Array.isArray(ev.editApprovedFor) && ev.editApprovedFor.includes(uid);
    const canEdit = isOwner || approvedForMe;
    const sMs = evStart(ev);
    const started = sMs != null && sMs <= Date.now();
    const time = evTime(ev);
    const when = [sMs != null ? fmtDayMonYear(sMs) : "", time].filter(Boolean).join(" · ");
    const lock = !canEdit || started;
    S.editId = ev.id; markEditing();

    // sahip onay bandı (bildirimden ?izin=). URL'deki uid'ye körü körüne güvenilmez: bu etkinlik için o kişiden gelen bir edit_request
    // bildirimi ya da org'da "staff" üyeliği doğrulanana kadar bant düğmesiz; doğrulanamazsa bant kaldırılır (legacy yalnız gerçek
    // bildirimden açıyordu).
    let approve = null;
    if (isOwner && izin && izin !== uid) {
      const reqNotif = () => bell.notifications().find((x) => x.type === "edit_request" && x.eventId === ev.id && (x.staffId || x.relatedUserId) === izin);
      const n0 = reqNotif();
      const nameOf = (n) => (n ? (n.staffName || n.fromName || "") : "");
      const txt = h("span", { class: `${P}-bt` }, `${nameOf(n0) || "Personel"}, bu etkinliği düzenlemek için izin istiyor.`);
      const chip = () => h("span", { class: `${P}-okchip` }, ico("check", 13, { color: "#7CE0B0", sw: "2.4" }), "İzin verildi");
      approve = h("div", { class: `${P}-banner is-key`, "aria-busy": n0 ? null : "true" }, ico("key", 16, { color: "#FF4FA3" }), txt);
      const mountCtl = () => {
        approve.removeAttribute("aria-busy");
        const granted = Array.isArray(ev.editApprovedFor) && ev.editApprovedFor.includes(izin);
        if (granted) { approve.append(chip()); return; }
        const btn = dkButton("İzin Ver", { variant: "primary", size: 40, icon: ico("check", 15, { color: "#06070A", sw: "2.4" }), cls: `${P}-grant` });
        btn.addEventListener("click", async () => {
          if (btn.disabled) return;
          btn.dk.setBusy(true);
          try {
            const ids = bell.notifications().filter((x) => x.type === "edit_request" && x.eventId === ev.id && (x.staffId || x.relatedUserId) === izin && !x.read).map((x) => x.id);
            await grantEditPermission({ eventId: ev.id, eventTitle: ev.title, staffId: izin, notifIds: ids });
            ev.editApprovedFor = [...(ev.editApprovedFor || []), izin];
            dkToast("İzin verildi");
            btn.replaceWith(chip());
          } catch (e) {
            console.warn("[org grant]", e);
            dkToast("İzin verilemedi", { type: "err" });
            if (btn.isConnected) btn.dk.setBusy(false);
          }
        });
        approve.append(btn);
      };
      if (n0) mountCtl();
      else {
        orgMembers(orgId).then((ms) => {
          if (!alive) return;
          const m = (ms || []).find((x) => (x.userId || x.id) === izin);
          const n1 = reqNotif(); // canlı zil bu arada dolmuş olabilir
          if (!n1 && !(m && (m.role || "staff") === "staff")) { approve.remove(); return; }
          const name = nameOf(n1) || m?.displayName || "";
          if (name) txt.textContent = `${name}, bu etkinliği düzenlemek için izin istiyor.`;
          mountCtl();
        }).catch(() => { if (reqNotif()) mountCtl(); else approve.remove(); });
      }
    }
    const lockBanner = !canEdit ? h("div", { class: `${P}-banner` }, ico("lock", 16, { color: "#8A8E97" }), h("span", { class: `${P}-bt` }, "Bu etkinliği düzenlemek için organizasyon sahibinin izni gerekir.")) : null;
    const startedBanner = started ? h("div", { class: `${P}-banner is-warn` }, ico("clock", 16, { color: "#FF8A2A" }), h("span", { class: `${P}-bt` }, "Etkinlik başladı — artık düzenlenemez.")) : null;
    const coverEl = h("div", { class: `${P}-ecover` });
    if (ev.bannerUrl) {
      const img = h("img", { src: ev.bannerUrl, alt: "" });
      img.addEventListener("error", () => { img.remove(); coverEl.classList.add("is-empty"); coverEl.prepend(ico("calendar", 28, { color: "#5E636D" })); }, { once: true });
      coverEl.append(img);
    } else { coverEl.classList.add("is-empty"); coverEl.append(ico("calendar", 28, { color: "#5E636D" })); }
    coverEl.append(h("span", { class: `${P}-ebadge` }, dkStatusBadge(evStatusKey(ev), { variant: "pill" })));
    const dateRow = h("div", { class: `${P}-daterow` }, ico("calendar", 18, { color: "#FF4FA3" }),
      h("div", { class: `${P}-dcol` }, h("span", { class: `${P}-dl` }, "TARİH & SAAT (DEĞİŞTİRİLEMEZ)"), h("span", { class: `${P}-dv` }, when || "—")),
      ico("lock", 15, { color: "#8A8E97" }));
    const ownerLink = isOwner
      ? h("button", { type: "button", class: `${P}-relink dk-press`, onclick: () => askRecreate() }, ico("swap", 15, { color: "#FF8A2A" }), "Tarihi değiştir (iptal et ve yeniden oluştur)")
      : h("span", { class: `${P}-hint` }, "Tarih değişikliği ve silme yalnızca organizasyon sahibinde.");
    const eT = dkInput({ id: `${P}-e-title`, value: ev.title || "", placeholder: "Etkinlik adı", disabled: lock, onInput: () => setErr("") });
    const eV = dkInput({ id: `${P}-e-venue`, value: ev.venueName || "", placeholder: "Mekan adı", disabled: lock });
    const eD = dkTextarea({ id: `${P}-e-desc`, rows: 4, value: ev.description || "", placeholder: "Etkinlik hakkında kısa bilgi...", attrs: lock ? { disabled: "" } : {} });
    const lbl = (text, forId) => h("label", { class: "dk-lbl", for: forId }, text);
    const delBtn = isOwner ? dkButton("Etkinliği Sil", { variant: "danger-outline", size: 40, icon: ico("trash", 15, { color: "#FF5A6E" }), cls: `${P}-del`, onClick: () => askDelete() }) : null;
    const body = h("div", { class: `${P}-form` },
      approve, lockBanner, startedBanner, coverEl, dateRow, ownerLink,
      h("div", { class: `${P}-fld` }, lbl("ETKİNLİK ADI *", eT.id), eT),
      h("div", { class: `${P}-fld` }, lbl("MEKAN", eV.id), eV),
      h("div", { class: `${P}-fld` }, lbl("AÇIKLAMA", eD.id), eD),
      delBtn);

    const errEl = h("span", { role: "alert", class: `${P}-err` });
    const setErr = (m) => { errEl.textContent = m || ""; };
    let primary = null;
    if (!started && canEdit) primary = dkButton("Değişiklikleri Kaydet", { variant: "primary", size: 44, icon: ico("check", 17, { color: "#06070A", sw: "2.2" }), onClick: () => askSave() });
    else if (!started && !canEdit) primary = dkButton("Düzenleme İzni İste", { variant: "primary", size: 44, icon: ico("key", 17, { color: "#06070A", sw: "2.2" }), onClick: () => requestPermission() });
    const closeBtn = dkButton("Kapat", { variant: "outline", size: 44, onClick: () => d.close("cancel") });

    // Onay diyaloğu (ConfirmDialog 440): eylem başarısızsa açık kalır (legacy keepOpen)
    const confirmDlg = ({ title, body: text, cta, danger, run }) => dkModal({
      variant: "confirm", size: 440, title, sub: text, cls: `${P}-cf`,
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: cta, variant: danger ? "danger" : "primary", busyLabel: cta, onClick: async () => (await run()) === false ? false : undefined },
      ],
    });
    function askSave() {
      const patch = { title: eT.value.trim(), venueName: eV.value.trim(), description: (eD.input || eD).value.trim() };
      if (!patch.title) { setErr("Etkinlik adı gir"); eT.focus(); return; }
      setErr("");
      confirmDlg({ title: "Emin misiniz?", body: `Etkinlik “${when || "—"}” tarihinde yayınlanacak. Değişiklikleri kaydetmek istiyor musunuz?`, cta: "Kaydet ve Yayınla",
        run: async () => {
          try { await updateEventFields(ev.id, patch); }
          catch (e) { console.warn("[org save]", e); dkToast("Kaydedilemedi", { type: "err" }); return false; }
          dkToast("Etkinlik güncellendi");
          setTimeout(() => d.close("action"), 0);
          load();
        } });
    }
    function askDelete() {
      confirmDlg({ title: "Etkinliği Sil", body: "Bu etkinlik kalıcı olarak silinecek. Emin misiniz? Mekana “Etkinlik İptal Edildi” bildirimi gider.", cta: "Sil", danger: true,
        run: async () => {
          try {
            if (ev.venueId) {
              try {
                await sendNotification(ev.venueId, { type: "event_deleted", title: "Etkinlik İptal Edildi",
                  body: `${p.orgName || p.displayName || "Organizatör"}, "${ev.title || "Etkinlik"}" etkinliğini sildi.`,
                  fromName: p.orgName || p.displayName || "Organizatör" });
              } catch (_) {}
            }
            await deleteEventById(ev.id);
          } catch (e) { console.warn("[org delete]", e); dkToast("Silinemedi", { type: "err" }); return false; }
          dkToast("Etkinlik silindi");
          setTimeout(() => d.close("action"), 0);
          load();
        } });
    }
    function askRecreate() {
      confirmDlg({ title: "Etkinliği Sil ve Yeniden Oluştur", body: "Tarih doğrudan değiştirilemez. Bu etkinlik KALICI OLARAK SİLİNECEK; ardından yeni tarihle yeniden oluşturman gerekir.", cta: "Sil ve Yeniden Oluştur", danger: true,
        run: async () => {
          try { await deleteEventById(ev.id); }
          catch (e) { console.warn("[org recreate]", e); dkToast("Silinemedi", { type: "err" }); return false; }
          dkToast("Etkinlik silindi — yeni tarihle oluşturabilirsin");
          load();
          // ön doldurulmuş oluştur çekmecesi (spec §6): ad, saat, mekan (userById), sanatçı; tarih boş
          let venue = null;
          if (ev.venueId) { try { venue = await userById(ev.venueId); } catch (_) {} }
          if (!alive || !onRoute()) return;
          setTimeout(() => startCreate({
            title: ev.title || "", time: ev.startTime || "",
            venue: venue ? { ...venue, displayName: venue.displayName || ev.venueName || "Mekan" } : null,
            artist: ev.artistId ? { id: ev.artistId, name: ev.artistName || "Sanatçı" } : null,
          }), 0);
        } });
    }
    let reqBusy = false;
    async function requestPermission() {
      if (reqBusy) return;
      reqBusy = true; primary?.dk.setBusy(true);
      try {
        const members = await orgMembers(p.orgId || uid).catch(() => []);
        const owner = members.find((mm) => mm.role === "owner");
        const ownerId = owner?.userId || owner?.id;
        if (!ownerId) { dkToast("Organizasyon sahibi bulunamadı", { type: "err" }); return; }
        // relatedUserId + fromName: app NotificationsFeed onay ekranına bunlarla gider (staffId/staffName eski web alanı) — legacy birebir
        await sendNotification(ownerId, { type: "edit_request", title: "Düzenleme İzni İstendi",
          body: `${p.displayName || p.orgName || "Personel"}, "${ev.title || "Etkinlik"}" etkinliğini düzenlemek istiyor.`,
          fromName: p.displayName || "Üye",
          extra: { eventId: ev.id, relatedUserId: uid, staffId: uid, staffName: p.displayName || "" } });
        dkToast("Düzenleme izni isteğin organizasyon sahibine iletildi");
      } catch (e) { console.warn("[org edit_request]", e); dkToast("İstek gönderilemedi", { type: "err" }); }
      finally { reqBusy = false; if (primary?.isConnected) primary.dk.setBusy(false); }
    }

    const rec = { kind: "edit", id: ev.id, izin: izin || null };
    const d = dkDrawer({
      eyebrow: "ETKİNLİĞİ DÜZENLE", title: ev.title || "Etkinlik", body, footer: [errEl, closeBtn, primary].filter(Boolean), cls: `${P}-drw`,
      onClose: (reason) => afterClose(rec, reason),
    });
    rec.close = () => d.close("switch");
    drawer = rec;
    // odak: diyaloğun kendisi (tabindex -1, halka yok) — ilk alan/düğme odaklanınca açılışta camgöbeği kenarlık/halka görünüyordu
    // (artboard/orgshots dinlenme hali). Ekran okuyucu başlığı okur; Tab sırası: kapat → bant → alanlar → alt çubuk.
    requestAnimationFrame(() => focusSafe(d.panel));
  }

  // ── URL → durum ──
  function apply(query, { initial = false } = {}) {
    const q = query instanceof URLSearchParams ? query : new URLSearchParams(query || "");
    const f = q.get("durum");
    S.filter = FILTER_KEYS.has(f) ? f : "tumu";
    S.q = q.get("q") || "";
    if (searchBox.input.value !== S.q) searchBox.input.value = S.q;
    render();
    const dz = q.get("duzenle"), yeni = q.get("yeni") === "1";
    const openIt = () => {
      if (!alive) return;
      if (dz) openEditById(dz, q.get("izin") || null);
      else if (yeni) { if (!(drawer && drawer.kind === "create")) openCreate(); }
      else if (drawer) closeDrawer();
    };
    // ilk kurulumda router düğümü henüz #app'e takmadı → portal rol/alan özniteliklerini (org değişkenleri) kopyalayabilsin diye ertele
    if (initial) setTimeout(openIt, 0); else openIt();
  }

  load();
  apply(ctx.query, { initial: true });

  return {
    node: shell.node,
    update(query) { apply(query); },
    onSession(s) {
      const a = s?.profile || {};
      return a.orgName === O.p.orgName && a.orgRole === O.p.orgRole && a.photoURL === O.p.photoURL && a.displayName === O.p.displayName && a.orgId === O.p.orgId;
    },
    destroy() {
      alive = false;
      closeDrawer();
      // ≥769 → ≤768 geçişi: legacy organizer.js tabFromHash() "?sorgu"yu ayıklamıyor ("etkinlik?durum=aktif" → "Yakında").
      // Bu görünümün yazdığı durum/q/yeni/duzenle/izin mobilde anlamsız → legacy sayfa hash'i okumadan önce tabana indir.
      // (Doğrudan mobilde açılan sorgulu bağlantı için legacy düzeltmesi gerekir — rapor.)
      try {
        if (!isDesktop() && hashBase() === PAGE && location.hash.includes("?")) history.replaceState(history.state, "", location.pathname + location.search + PAGE);
      } catch (_) {}
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}
