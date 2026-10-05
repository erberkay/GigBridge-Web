// WebMekanPanel — Mekan Paneli · Ana Sayfa, masaüstü görünümü (≥769 px). Registry anahtarı: venuePanel (#/venue).
// Spec: specs/mekan.md §0 + § WebMekanPanel · Artboard: design/WebMekanPanel.dc.html (sahibi notu YOK).
// CSS: css/dk-mekan-panel.css — tüm seçiciler .dk-mekan-panel kökü / .dk-mekan-panel-* sınıfları altında
// (portal katmanları — modal içerikleri — .dk-mekan-panel-* ad alanlı sınıflar taşır).
// ≤768: legacy js/pages/venue.js renderHome aynen (router bu modülü mobilde yüklemez).
//
// Legacy renderHome özellikleri (KORUNDU; yerleşim tasarıma uyduruldu):
//   · aynı veri: venueEvents, venueOrgRequests, venueResidencies, listRealArtists, kabul edilmiş davetler (Onaylı durumu),
//     venueRating (users denorm → getVenueReviews yedeği) · aynı hesaplar: bu ay gelir (son 30 gün bilet×katılım),
//     onaylı etkinlik, bu hafta katılım (son 7 gün), ort. puan, yorum sayısı, iptal oranı (>%10 kırmızı)
//   · hızlı eylemler (Etkinlik Oluştur / Sanatçı Bul / Analitik / Mesajlar) · "Ekle" → #/venue/olustur
//   · organizatör istekleri: Reddet (setRequestStatus) / Onayla → onay modalı (sanatçılı + sanatçısız varyant) →
//     acceptOrgRequest(req, profile); konum pinlenmemişse "Haritada görünmek için…" uyarısı; mesaj → requestChat → #/venue/mesaj
//   · uzun dönem anlaşmalar (bekleyen + aktif; bekleyende de İptal), "bitiş dd.mm.yyyy" / "Sanatçı onayı bekleniyor",
//     iptal onayı → cancelResidencyDoc; hata "İptal edilemedi"
//   · etkinlik satırları: VIP rozeti (yalnız onaylı eski kayıtlar — VIP talebi kaldırıldı), Onaylı/Bekliyor kuralı (org ‖ sanatçısız ‖ kabul edilmiş davet ‖
//     confirmed/live/completed), davet ücreti, tür gradyanlı kapak yedeği, "Tüm etkinlikleri gör (N)" yerinde açılır /
//     "Yalnız yaklaşanları göster" · önerilen sanatçı → Davet modalı (tek etkinlik / uzun dönem) doğrudan · boş durumlar ·
//     yükleme hatası "Yüklenemedi / Bağlantıyı kontrol edip yenile."
// Tasarımın ekledikleri: selamlama hero'su (bu geceki etkinlik), KPI alt satırları, Yaklaşan/Geçmiş sekmeli tablo
// (?sekme=gecmis|tumu, replaceState), BU GECE rozeti, kapasite çubuğu, Düzenle (#/venue/duzenle/:id — organizatör
// etkinliğinde yok) / Rapor (#/venue/analitik?ev=:id), "Sanatçı yanıtları" (YENİ sorgu: invitations where venueId==uid —
// tek eşitlik, indeks gerekmez; hata → kart gizlenir), üst bar araması (Enter → Sanatçı Bul ?q=, yazarken tabloyu süzer).
// Uygulama (RN) paritesi: istek onay/red, sahneye eklenen sanatçı, anlaşma iptali ve davetlerde bildirim
// (data.sendNotification → fromUserId = auth uid; alan şekli app pushAppNotification ile aynı). Bildirim hatası akışı durdurmaz.
import { h, openImageCropper } from "../../ui.js";
import { session } from "../../store.js";
import { db, collection, query, where, getDocs } from "../../firebase.js";
import {
  venueEvents, venueOrgRequests, acceptOrgRequest, setRequestStatus, venueResidencies, cancelResidencyDoc,
  listRealArtists, listGroups, venueAcceptedInvitations, getVenueReviews, findExistingInvitation, createInvitation,
  createGroupInvitation, createResidency, uploadImage, sendNotification,
} from "../../data.js";
import { requestChat as legacyRequestChat } from "../../pages/messages.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { cx, dkModal, dkToast, dkEmpty, dkSkeleton, dkButton, dkAvatar, dkLoginGate } from "../shared/ui.js";
import {
  eventStartMs, isEventOver, isToday, isLive, fmtTime, fmtTL, fmtPrice, isFree, shortNumTR, trUpper, fold, matchText,
  MONTHS_TR, MONTHS_TR_SHORT, DAYS_TR_SHORT, rgba, writeQuery, toMs, isoDate, initials,
} from "../shared/helpers.js";
import { genreColor, genreGrad, primaryGenre } from "../shared/genres.js";

const NS = "dk-mekan-panel";
const c = (s) => `${NS}-${s}`;
const MIN_STAGE_FEE = 3500;
const DAY = 86400e3;
const MON_UP = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];
const UP_LIMIT = 5;    // legacy: ilk 5 yaklaşan
const PAST_LIMIT = 6;  // tasarım: "Son 6 etkinlik gösteriliyor"

// ── artboard SVG gövdeleri (birebir) ──
const I = {
  users: '<circle cx="9" cy="8.5" r="3.5"></circle><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"></path><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.3c1.8.7 3 2.3 3.5 4.7"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  chat: '<path d="M4 5h16v11H9l-5 4z"></path><path d="M8 9.5h8M8 12.5h5"></path>',
  xCircle: '<circle cx="12" cy="12" r="8.5"></circle><path d="M9 9l6 6M15 9l-6 6"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  chart: '<path d="M4 20V4"></path><path d="M4 20h16"></path><path d="M8.5 16v-5"></path><path d="M13 16V8"></path><path d="M17.5 16v-3"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  sparkle: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"></path>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"></rect><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10.5 21v-3h3v3"></path>',
  repeat: '<path d="M17 2l3 3-3 3"></path><path d="M4 11V9a4 4 0 0 1 4-4h12"></path><path d="M7 22l-3-3 3-3"></path><path d="M20 13v2a4 4 0 0 1-4 4H4"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  chevron: '<path d="m9 6 6 6-6 6"></path>',
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"></rect><circle cx="8.5" cy="9.5" r="1.8"></circle><path d="m21 16-5-5-9 8.5"></path>',
  chevronDown: '<path d="m6 9 6 6 6-6"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>',
};
const raw = (k, size, sw = "1.8", o = {}) => svgRaw(I[k], { size, sw, ...o });

// ── küçük biçimleyiciler ──
const pad2 = (n) => String(n).padStart(2, "0");
const nameOf = (x) => x?.displayName || x?.name || x?.artistName || "Sanatçı";
const genreOfArtist = (x) => (Array.isArray(x?.genres) ? x.genres[0] : x?.genre) || "";
const evTime = (e) => e?.startTime || fmtTime(eventStartMs(e));
// "Bu gece": şu an sahnede (başlangıç ≤ şimdi < bitiş — gece yarısını geçen etkinlik dahil) ya da bugün başlayan, bitmemiş etkinlik
const isTonight = (e) => !isEventOver(e) && (isLive(e) || isToday(eventStartMs(e)));
const priceOf = (a) => Number(a?.price ?? a?.stageFee ?? a?.fee) || 0; // legacy venue.js priceOf (önerilen sanatçı ücreti)
// "10 Ekim 2026" (legacy fmtDateTR)
function fmtDateTR(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d)) return String(iso);
  return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`;
}
// "2 Eki Cum 22:00"
function fmtWhen(iso, time) {
  const d = iso ? new Date(String(iso).length <= 10 ? iso + "T00:00:00" : iso) : null;
  if (!d || isNaN(d)) return time || "";
  return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${DAYS_TR_SHORT[d.getDay()]}${time ? " " + time : ""}`;
}
// Uygulamanın bildirim gövdelerindeki tarih ("15 Eki 2026")
const trShortDate = (iso) => { const d = iso ? new Date(String(iso).length <= 10 ? iso + "T00:00:00" : iso) : null; return d && !isNaN(d) ? d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }) : (iso || ""); };
const fmtDays = (days) => (Array.isArray(days) ? days : []).map((d) => DAYS_TR_SHORT[d] || "").filter(Boolean).join(",");

// Uygulama paritesinde bildirim (best-effort; fromUserId = auth uid — data.sendNotification kuralı sağlar).
// Alan şekli app pushAppNotification ile aynı: { toUserId, fromUserId, fromName, type, title, body, eventId, relatedUserId, read, createdAt }.
function notify(toUserId, { type, title, body, eventId = null }) {
  if (!toUserId) return;
  const fromName = session.profile?.displayName ?? "Mekan";
  sendNotification(toUserId, { type, title, body, fromName, extra: { eventId: eventId ?? null, relatedUserId: null } }).catch(() => {});
}

// Mekanın ortalama puanı: users denorm, yoksa venueReviews'tan (legacy venueRating birebir)
export async function venueRating(uid, p) {
  let avg = Number(p?.avgRating) || 0, count = Number(p?.reviewCount) || 0;
  if (!avg || !count) {
    try {
      const revs = await getVenueReviews(uid);
      const rated = (revs || []).filter((r) => Number(r.overallRating ?? r.rating) > 0);
      if (!count) count = rated.length;
      if (!avg) avg = rated.length ? rated.reduce((a, r) => a + Number(r.overallRating ?? r.rating), 0) / rated.length : 0;
    } catch (_) {}
  }
  return { avg, count };
}

// YENİ sorgu (spec §7): mekanın tüm davetleri — tek eşitlik (indeks gerekmez), durum istemcide süzülür.
// fromCache: sunucuya ulaşılamadı (getDocs çevrimdışıyken hata atmak yerine önbelleği — çoğu zaman boş — döndürür).
async function venueInvitations(uid) {
  const s = await getDocs(query(collection(db, "invitations"), where("venueId", "==", uid)));
  const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.fromCache = !!s.metadata?.fromCache;
  return list;
}

// Sohbete git: legacy bekleyen hedef + masaüstü sohbetin bekleyen hedefi (chat.js) → #/venue/mesaj
export async function openVenueChat(otherId, otherName) {
  if (!otherId) return;
  try { legacyRequestChat({ otherId, otherName }); } catch (_) {}
  try { const m = await import("../messages/chat.js"); m.requestChat?.({ otherId, otherName }); } catch (_) {}
  location.hash = "#/venue/mesaj";
}

// ══════════════════════════════════════════════════════════════════════
// GÖRÜNÜM
// ══════════════════════════════════════════════════════════════════════
export function venuePanelView(ctx) {
  const uid = ctx.session?.user?.uid || session.user?.uid;
  const p = () => session.profile || ctx.session?.profile || {};
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });

  // ── durum ──
  const initTab = (q) => { const s = q?.get?.("sekme"); return s === "gecmis" ? "past" : s === "tumu" ? "all" : "up"; };
  let tab = initTab(ctx.query);
  let term = "";
  let data = null; // { events, accByEvent, pendByEvent, residencies, artistsById, ... }

  const shell = panelShell({
    role: "venue", active: ctx.route?.nav || "home", title: "Ana Sayfa", crumb: "Mekan Paneli", ctx,
    search: {
      onSubmit: (q) => { location.hash = "#/venue/sanatci" + (q ? "?q=" + encodeURIComponent(q) : ""); },
      onInput: (q) => { term = q || ""; drawTable(); },
    },
  });
  const root = h("div", { class: NS });
  shell.content.append(root);

  // ═════════ 1 · HERO ═════════
  const now = Date.now();
  const today = new Date(now);
  const eyebrow = trUpper(`${today.toLocaleDateString("tr-TR", { weekday: "long" })} · ${today.getDate()} ${MONTHS_TR[today.getMonth()]}`);
  const heroLine = h("p", { class: c("lead") }, dkSkeleton({ w: 420, h: 16, r: 4 }));
  const revVal = h("span", { class: cx(c("pairv"), "is-rev") }, "—");
  const confVal = h("span", { class: c("pairv") }, "—");
  const hero = h("section", { "aria-label": "Özet", class: cx(c("hero"), "dk-rise") },
    h("div", { class: c("herol") },
      h("span", { class: c("heroeb") }, eyebrow),
      h("h2", { class: c("h2") }, "Hoş geldin, ", h("em", {}, p().displayName || "Mekan"), "."),
      heroLine),
    h("div", { class: c("pair") },
      h("div", { class: c("paircell") }, h("span", { class: c("pairl") }, "BU AY GELİR"), revVal),
      h("span", { class: c("pairdiv"), "aria-hidden": "true" }),
      h("div", { class: c("paircell") }, h("span", { class: c("pairl") }, "ONAYLI ETKİNLİK"), confVal)));

  // ═════════ 2 · KPI ═════════
  const kpi = (icon, label, tint) => {
    const tile = h("span", { class: c("kpiic"), style: { background: rgba(tint, 0.1), color: tint } }, raw(icon, 16));
    const v = h("span", { class: c("kpiv") }, "—");
    const s = h("span", { class: c("kpis") }, " ");
    const el = h("div", { class: c("kpi") }, h("div", { class: c("kpih") }, tile, h("span", { class: c("kpil") }, label)), v, s);
    el.set = (val, sub) => { v.textContent = val; s.textContent = sub || " "; };
    el.tint = (col) => { tile.style.background = rgba(col, 0.1); tile.style.color = col; };
    return el;
  };
  const kWeek = kpi("users", "BU HAFTA KATILIM", "#7CE0B0");
  const kRate = kpi("star", "ORT. PUAN", "#FF8A2A");
  const kRev = kpi("chat", "YORUM SAYISI", "#7CE0B0");
  const kCancel = kpi("xCircle", "İPTAL ORANI", "#7CE0B0");
  const kpis = h("section", { "aria-label": "Göstergeler", class: c("kpis4") }, kWeek, kRate, kRev, kCancel);

  // ═════════ 3 · HIZLI EYLEMLER ═════════
  const qa = (href, icon, color, title, sub) => h("a", { href, class: cx(c("qa"), "dk-press", "dk-card") },
    h("span", { class: c("qaic"), style: { background: rgba(color, 0.12), color } }, raw(icon, 20)),
    h("span", { class: c("qat") }, h("span", { class: c("qatt") }, title), h("span", { class: c("qats") }, sub)),
    h("span", { class: c("qaar") }, raw("arrow", 16)));
  const quick = h("section", { "aria-label": "Hızlı eylemler", class: c("qas") },
    qa("#/venue/olustur", "plus", "#FF8A2A", "Etkinlik Oluştur", "Yeni gece planla"),
    qa("#/venue/sanatci", "search", "#A78BFA", "Sanatçı Bul", "Tür, şehir, puan"),
    qa("#/venue/analitik", "chart", "#7CE0B0", "Analitik", "Katılım ve gelir"),
    qa("#/venue/mesaj", "chat", "#4ED8FF", "Mesajlar", "Sanatçı ve organizatörler"));

  // ═════════ 4 · ETKİNLİKLER TABLOSU ═════════
  const tabBtns = new Map();
  const tablist = h("div", { role: "tablist", "aria-label": "Etkinlik zamanı", class: c("seg") });
  [["up", "Yaklaşan"], ["past", "Geçmiş"]].forEach(([k, l]) => {
    const n = h("span", { class: c("segn") }, "");
    const b = h("button", { type: "button", role: "tab", id: "dk-mp-tab-" + k, class: cx(c("segb"), "dk-press"), "aria-controls": "dk-mp-evpanel" }, l, n);
    b.n = n;
    b.addEventListener("click", () => setTab(k));
    tabBtns.set(k, b); tablist.append(b);
  });
  tablist.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "past" ? "up" : "past";
    setTab(next); tabBtns.get(next).focus();
  });
  const addLink = h("a", { href: "#/venue/olustur", class: cx(c("add"), "dk-press") }, raw("plus", 15, "2.2", { color: "#FF8A2A" }), "Ekle");
  const COLS = ["TARİH", "ETKİNLİK", "SANATÇI", "BİLET", "KATILIMCI", "DURUM", "İŞLEM"];
  const thead = h("div", { role: "row", class: cx(c("tr"), c("th")) },
    ...COLS.map((t, i) => h("span", { role: "columnheader", class: cx(i === 2 && c("colartist"), i === 3 && c("colprice"), i === 6 && c("right")) }, t)));
  const rowsBox = h("div", { role: "rowgroup", id: "dk-mp-evrows", class: cx(c("rows"), "dk-fa") });
  const evPanel = h("div", { role: "tabpanel", id: "dk-mp-evpanel", "aria-labelledby": "dk-mp-tab-up", class: c("tblscroll") },
    h("div", { role: "table", "aria-label": "Etkinlik listesi", class: c("tbl") }, h("div", { role: "rowgroup" }, thead), rowsBox));
  const footNote = h("span", { class: c("footnote") }, "");
  const footLink = h("button", { type: "button", class: cx(c("footlink"), "dk-link"), hidden: true });
  let allFrom = "up"; // "tümü" görünümü hangi sekmeden açıldı → daraltınca oraya dönülür
  footLink.addEventListener("click", () => { if (tab === "all") setTab(allFrom); else { allFrom = tab; setTab("all"); } });
  const evSection = h("section", { "aria-labelledby": "dk-mp-h-ev", class: cx(c("card"), c("evcard")) },
    h("div", { class: c("evhead") },
      h("div", { class: c("sh") }, h("span", { class: c("eb") }, "01 · TAKVİM"), h("h3", { id: "dk-mp-h-ev", class: c("h3ev") }, "Etkinlikler")),
      h("div", { class: c("evtools") }, tablist, addLink)),
    evPanel,
    h("div", { class: c("foot") }, footNote, footLink));

  // ═════════ 5 · ALT IZGARA ═════════
  const invCount = h("span", { class: c("invcount") });
  const invList = h("div", { class: c("list") }, skelRows(3));
  const invCard = h("div", { class: cx(c("card"), c("pad")) },
    h("div", { class: c("cardhead") }, h("div", { class: c("sh") }, h("span", { class: c("eb") }, "02 · DAVETLER"), h("h3", { class: c("h3") }, "Sanatçı yanıtları")), invCount),
    invList);
  const reqList = h("div", { class: c("list") }, skelRows(1));
  const reqCard = h("div", { class: cx(c("card"), c("pad")) },
    h("div", { class: c("sh") }, h("span", { class: cx(c("eb"), "is-accent") }, "ONAY BEKLİYOR"), h("h3", { class: c("h3") }, "Organizatör istekleri")),
    reqList);
  const resList = h("div", { class: c("list") }, skelRows(1));
  const resCard = h("div", { class: cx(c("card"), c("pad")) },
    h("div", { class: c("sh") }, h("span", { class: c("eb") }, "SAHNE PROGRAMI"), h("h3", { class: c("h3") }, "Uzun dönem anlaşmalar")),
    resList);
  const sugList = h("div", { class: c("list") }, skelRows(3));
  const sugCard = h("div", { class: cx(c("card"), c("pad"), c("sugcard")) },
    h("div", { class: c("cardhead") },
      h("div", { class: c("sh") }, h("span", { class: c("eb") }, "03 · SİZE ÖZEL"), h("h3", { class: c("h3") }, "Önerilen sanatçılar")),
      h("a", { href: "#/venue/sanatci", class: c("all") }, "Tümünü gör", raw("chevron", 14))),
    sugList);
  const bottom = h("section", { "aria-label": "Davetler ve öneriler", class: c("grid3") },
    invCard, h("div", { class: c("stack") }, reqCard, resCard), sugCard);

  root.append(hero, kpis, quick, evSection, bottom);
  drawTableSkeleton();

  // ══════════════════════════════════════════════════════════════════════
  // VERİ
  // ══════════════════════════════════════════════════════════════════════
  async function load() {
    const prof = p();
    const [evR, reqR, resR, artR, invR, ratR] = await Promise.allSettled([
      venueEvents(uid),
      venueOrgRequests(uid),
      venueResidencies(uid),
      listRealArtists(),
      venueInvitations(uid),
      venueRating(uid, prof),
    ]);
    if (!alive) return;
    if (evR.status !== "fulfilled") { showError(); return; }
    // Çevrimdışı: Firestore hata atmadan boş önbellek döndürür → yanıltıcı "Henüz etkinlik yok" yerine Yüklenemedi.
    // (Paralel davet sorgusu sunucuya ulaşamadıysa ve etkinlik de gelmediyse bağlantı yok sayılır.)
    if (invR.status === "fulfilled" && invR.value.fromCache && !(evR.value || []).length) { showError(); return; }
    let invitations = invR.status === "fulfilled" ? invR.value : null;
    let accepted = invitations ? invitations.filter((i) => i.status === "accepted") : null;
    if (!accepted) { try { accepted = await venueAcceptedInvitations(uid); } catch (_) { accepted = []; } }
    if (!alive) return;
    const artists = artR.status === "fulfilled" ? artR.value : [];
    data = {
      events: evR.value || [],
      reqs: reqR.status === "fulfilled" ? reqR.value : null,
      residencies: resR.status === "fulfilled" ? resR.value : [],
      artists,
      artistsById: new Map(artists.map((a) => [a.id, a])),
      invitations,
      accByEvent: new Map(),
      pendByEvent: new Map(),
      rating: ratR.status === "fulfilled" ? ratR.value : { avg: Number(prof.avgRating) || 0, count: Number(prof.reviewCount) || 0 },
    };
    accepted.forEach((i) => { if (i.eventId) data.accByEvent.set(i.eventId, i); });
    (invitations || []).forEach((i) => { if (i.eventId && i.status === "pending" && !data.pendByEvent.has(i.eventId)) data.pendByEvent.set(i.eventId, i); });
    drawSummary();
    drawTable();
    drawInvites();
    drawRequests();
    drawResidencies();
    drawSuggestions();
  }
  function showError() {
    const retry = dkButton("Yenile", { variant: "outline", size: 40, icon: "refresh", onClick: () => { root.replaceChildren(hero, kpis, quick, evSection, bottom); drawTableSkeleton(); load(); } });
    root.replaceChildren(dkEmpty({ icon: "alertCircle", title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile.", action: retry, cls: c("err") }));
  }
  // Davet / uzun dönem teklifi gönderildi → "Sanatçı yanıtları" + "Uzun dönem anlaşmalar" (+ tablodaki teklif ücreti) tazelenir
  async function reloadInvites() {
    const [invR, resR] = await Promise.allSettled([venueInvitations(uid), venueResidencies(uid)]);
    if (!alive || !data) return;
    if (invR.status === "fulfilled") {
      data.invitations = invR.value;
      data.pendByEvent = new Map();
      invR.value.forEach((i) => { if (i.eventId && i.status === "pending" && !data.pendByEvent.has(i.eventId)) data.pendByEvent.set(i.eventId, i); });
      invCard.hidden = false; bottom.classList.remove("no-inv");
      drawInvites();
    }
    if (resR.status === "fulfilled") { data.residencies = resR.value || []; drawResidencies(); }
    drawTable();
  }
  // Etkinlikleri yeniden oku (istek onayı yeni etkinlik ekler) — tablo + özet
  async function reloadEvents() {
    try {
      const evs = await venueEvents(uid);
      if (!alive || !data) return;
      data.events = evs || [];
      drawSummary(); drawTable();
    } catch (_) {}
  }

  // ── Özet: hero + gelir + KPI (legacy hesapları birebir) ──
  function drawSummary() {
    const t = Date.now();
    const evs = data.events;
    const notCancelled = evs.filter((e) => e.status !== "cancelled");
    const confirmedCount = evs.filter((e) => ["upcoming", "live", "completed", "confirmed"].includes(e.status)).length;
    const inWin = (e, from) => { const s = eventStartMs(e); return s != null && s >= from && s <= t; };
    const monthly = notCancelled.filter((e) => inWin(e, t - 30 * DAY)).reduce((s, e) => s + (Number(e.ticketPrice) || 0) * (e.attendeeCount || 0), 0);
    // BU HAFTA: legacy/mobil ile AYNI kayan 7×24 sa pencere (masaüstü ve mobil aynı sayıyı göstersin); etiket pencerenin
    // gerçek başlangıç–bitiş günleri ("22–29 Eyl").
    const weekFrom = t - 7 * DAY;
    const week = notCancelled.filter((e) => inWin(e, weekFrom));
    const weekAtt = week.reduce((s, e) => s + (e.attendeeCount || 0), 0);
    const cancelled = evs.filter((e) => e.status === "cancelled").length;
    const cancelRate = evs.length ? Math.round(cancelled / evs.length * 100) : 0;

    revVal.textContent = "₺" + monthly.toLocaleString("tr-TR");
    confVal.textContent = String(confirmedCount);
    const d1 = new Date(weekFrom), d2 = new Date(t);
    const range = d1.getMonth() === d2.getMonth()
      ? `${d1.getDate()}–${d2.getDate()} ${MONTHS_TR_SHORT[d2.getMonth()]}`
      : `${d1.getDate()} ${MONTHS_TR_SHORT[d1.getMonth()]}–${d2.getDate()} ${MONTHS_TR_SHORT[d2.getMonth()]}`;
    kWeek.set(weekAtt.toLocaleString("tr-TR"), `${range} · ${week.length} etkinlik`);
    const { avg, count } = data.rating;
    kRate.set(avg ? avg.toFixed(1) : "—", `${count} değerlendirme`);
    kRev.set(String(count), "Müşteri yorumları");
    kCancel.set(evs.length ? "%" + cancelRate : "—", evs.length ? `${evs.length} etkinlikte ${cancelled} iptal` : "Henüz etkinlik yok");
    kCancel.tint(cancelRate > 10 ? "#FF5A6E" : "#7CE0B0");

    // Bu gece: bugün başlayan (yerel) ve bitmemiş, iptal olmayan ilk etkinlik
    const up = notCancelled.filter((e) => !isEventOver(e)).sort((a, b) => (eventStartMs(a) ?? Infinity) - (eventStartMs(b) ?? Infinity));
    const tonight = up.find(isTonight);
    heroLine.replaceChildren();
    if (tonight) {
      const att = Number(tonight.attendeeCount) || 0;
      const meta = [tonight.artistName, evTime(tonight)].filter(Boolean).join(" · ");
      heroLine.append("Bu gece ", h("span", { class: c("strong") }, tonight.title || "Etkinlik"), " sahnede" + (meta ? " · " + meta : "") + ` — ${att} kişi katılıyor.`);
    } else if (up.length) {
      const n = up[0]; const s = eventStartMs(n); const d = s != null ? new Date(s) : null;
      heroLine.append("Bu gece etkinlik yok · Sıradaki: ", h("span", { class: c("strong") }, n.title || "Etkinlik"),
        d ? ` · ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${evTime(n)}` : "");
    } else {
      heroLine.append("Yaklaşan etkinlik yok — ", h("a", { href: "#/venue/olustur", class: c("herolink") }, "ilk etkinliğini oluştur"), ".");
    }
  }

  // ── Tablo ──
  function lists() {
    const evs = data?.events || [];
    const up = evs.filter((e) => e.status !== "cancelled" && !isEventOver(e)).sort((a, b) => (eventStartMs(a) ?? Infinity) - (eventStartMs(b) ?? Infinity));
    const past = evs.filter((e) => e.status === "cancelled" || isEventOver(e)).sort((a, b) => (eventStartMs(b) ?? 0) - (eventStartMs(a) ?? 0));
    const all = [...evs].sort((a, b) => (eventStartMs(b) ?? 0) - (eventStartMs(a) ?? 0)); // legacy showAll sırası
    return { up, past, all };
  }
  function setTab(k, { write = true } = {}) {
    if (k === tab) { if (k !== "all") return; }
    tab = k;
    if (write) writeQuery({ sekme: k === "past" ? "gecmis" : k === "all" ? "tumu" : null });
    drawTable();
    swap(rowsBox);
  }
  function drawTableSkeleton() {
    rowsBox.replaceChildren(...Array.from({ length: 4 }, () => h("div", { class: cx(c("tr"), c("skelrow")), "aria-hidden": "true" },
      dkSkeleton({ w: 60, h: 24, r: 4 }), h("span", { class: c("skelev") }, dkSkeleton({ w: 44, h: 44, r: 6 }), dkSkeleton({ w: "60%", h: 14, r: 4 })),
      h("span", { class: c("colartist") }, dkSkeleton({ w: "70%", h: 14, r: 4 })), h("span", { class: c("colprice") }, dkSkeleton({ w: 48, h: 14, r: 4 })), dkSkeleton({ w: "80%", h: 10, r: 4 }), dkSkeleton({ w: 84, h: 26, r: 13 }), h("span"))));
    tabBtns.forEach((b, k) => { b.setAttribute("aria-selected", k === tab ? "true" : "false"); b.classList.toggle("is-on", k === tab); b.tabIndex = k === tab || (tab === "all" && k === "up") ? 0 : -1; });
  }
  function drawTable() {
    if (!data) return;
    const L = lists();
    tabBtns.get("up").n.textContent = String(L.up.length);
    tabBtns.get("past").n.textContent = String(L.past.length);
    tabBtns.forEach((b, k) => {
      const on = k === tab;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.classList.toggle("is-on", on);
      b.tabIndex = on || (tab === "all" && k === "up") ? 0 : -1;
    });
    // sekme paneli adı: seçili sekme; "tümü" (alt bağlantı) durumunda sekme seçili değil → düz etiket
    if (tab === "all") { evPanel.removeAttribute("aria-labelledby"); evPanel.setAttribute("aria-label", "Tüm etkinlikler"); }
    else { evPanel.removeAttribute("aria-label"); evPanel.setAttribute("aria-labelledby", "dk-mp-tab-" + tab); }
    const mode = tab === "past" ? "past" : "up";
    let src = tab === "past" ? L.past : tab === "all" ? L.all : L.up;
    const q = term.trim();
    if (q) src = src.filter((e) => matchText(q, e.title, e.artistName));
    const limit = tab === "past" ? PAST_LIMIT : tab === "all" ? Infinity : UP_LIMIT;
    const shown = q ? src : src.slice(0, limit);
    rowsBox.replaceChildren();
    if (!shown.length) {
      rowsBox.append(h("div", { role: "row", class: c("emptyrow") }, h("span", { role: "cell", class: c("emptycell") },
        q ? h("span", { class: c("emptyt") }, `“${q}” ile eşleşen etkinlik yok`)
          : tab === "past" ? h("span", { class: c("emptyt") }, "Geçmiş etkinlik yok")
          : [svgIcon("calendar", { size: 26, sw: "1.6", color: "#5E636D" }), h("span", { class: c("emptyt") }, "Henüz etkinlik yok"), h("span", { class: c("emptys") }, "Sanatçı davet ederek ilk etkinliğinizi oluşturun")])));
    } else {
      shown.forEach((e) => rowsBox.append(evRow(e, tab === "all" ? (e.status === "cancelled" || isEventOver(e) ? "past" : "up") : mode)));
    }
    // alt satır
    const total = data.events.length;
    if (q) footNote.textContent = `Arama: ${shown.length} etkinlik`;
    else if (tab === "up") footNote.textContent = L.up.length ? `Yaklaşan ${L.up.length} etkinlik · Bekleyen davetli etkinlik sarı çubukla işaretli` : "Yaklaşan etkinlik yok";
    else if (tab === "past") footNote.textContent = `Son ${shown.length} etkinlik gösteriliyor`;
    else footNote.textContent = `Tüm etkinlikler · ${total} etkinlik`;
    // Yaklaşan: legacy kuralı (tüm etkinlik sayısı gösterilenden fazlaysa). Geçmiş: yalnız geçmiş listesi kesildiyse.
    const needMore = !q && (tab === "up" ? total > shown.length : tab === "past" ? L.past.length > shown.length : false);
    footLink.hidden = !(needMore || tab === "all");
    footLink.replaceChildren(tab === "all" ? (allFrom === "past" ? "Yalnız geçmişi göster" : "Yalnız yaklaşanları göster") : `Tüm etkinlikleri gör (${total})`, raw("arrow", 14));
    footLink.setAttribute("aria-expanded", tab === "all" ? "true" : "false");
    footLink.setAttribute("aria-controls", "dk-mp-evrows");
  }

  function residencyFor(e) {
    if (!e.artistId) return null;
    const s = eventStartMs(e); if (s == null) return null;
    const d = new Date(s); const iso = isoDate(s);
    return (data.residencies || []).find((r) => r.status === "active" && r.artistId === e.artistId
      && (r.daysOfWeek || []).includes(d.getDay()) && (!r.startDate || r.startDate <= iso) && (!r.endDate || iso <= r.endDate)) || null;
  }
  function feeText(e) {
    if (Number(e.fee) > 0) return fmtTL(e.fee);
    const acc = data.accByEvent.get(e.id);
    if (acc && Number(acc.fee) > 0) return fmtTL(acc.fee);
    const pend = data.pendByEvent.get(e.id);
    if (pend && Number(pend.fee) > 0) return fmtTL(pend.fee) + " teklif";
    const r = residencyFor(e);
    if (r && Number(r.fee) > 0) return fmtTL(r.fee) + "/gece";
    return "—";
  }
  const ST = {
    ok: ["Onaylı", "#7CE0B0", "rgba(124,224,176,0.10)", "rgba(124,224,176,0.35)"],
    wait: ["Bekliyor", "#FFD700", "rgba(255,215,0,0.08)", "rgba(255,215,0,0.35)"],
    done: ["Tamamlandı", "#A3A7AF", "rgba(163,167,175,0.08)", "#2C303A"],
    cancel: ["İptal", "#FF5A6E", "rgba(255,90,110,0.08)", "rgba(255,90,110,0.35)"],
  };
  function evRow(e, mode) {
    const s = eventStartMs(e);
    const d = s != null ? new Date(s) : null;
    const g = primaryGenre(e);
    const gc = g ? genreColor(g) : "#8A8E97";
    const tonight = mode === "up" && isTonight(e);
    let st;
    if (mode === "past") st = e.status === "cancelled" ? "cancel" : "done";
    else st = (e.organizerId || !e.artistId || data.accByEvent.has(e.id) || ["confirmed", "live", "completed"].includes(e.status)) ? "ok" : "wait";
    const [stL, stFg, stBg, stBd] = ST[st];
    const dd = d ? String(d.getDate()) : "—";
    const mm = d ? MON_UP[d.getMonth()] : "";
    // kapak: bannerUrl ya da tür gradyanı + 2 harf (legacy vx-gtag)
    const thumb = e.bannerUrl
      ? h("img", { src: e.bannerUrl, alt: "", loading: "lazy", decoding: "async", class: c("thumb") })
      : h("span", { class: cx(c("thumb"), "is-ph"), style: { background: genreGrad(g, 135) }, "aria-hidden": "true" }, trUpper((g || "GB").slice(0, 2)));
    if (e.bannerUrl) thumb.addEventListener("error", () => thumb.replaceWith(h("span", { class: cx(c("thumb"), "is-ph"), style: { background: genreGrad(g, 135) }, "aria-hidden": "true" }, trUpper((g || "GB").slice(0, 2)))), { once: true });
    const vip = e.vipStatus === "approved" ? "VIP" : null;
    const price = isFree(e.ticketPrice) ? "Ücretsiz" : fmtTL(e.ticketPrice);
    const a = e.artistId ? data.artistsById.get(e.artistId) : null;
    const artistAv = e.artistName || e.artistId
      ? dkAvatar({ name: e.artistName || nameOf(a), photo: a?.photoURL, size: 30, type: "artist", position: "center 25%" })
      : h("span", { class: c("noav"), "aria-hidden": "true" }, raw("mic", 14, "1.8"));
    const cap = e.capacity ?? p().capacity ?? null;
    const att = Number(e.attendeeCount) || 0;
    const pct = cap ? Math.max(0, Math.min(100, Math.round(att / Number(cap) * 100))) : 0;
    const label = `${e.title || "Etkinlik"} ${dd} ${mm}`.trim();
    let action;
    if (mode === "up") {
      action = e.organizerId
        ? h("span", { class: c("orgtag"), title: "Organizatör etkinliği — düzenlemeyi organizatör yapar" }, "Organizatör")
        : h("a", { href: "#/venue/duzenle/" + encodeURIComponent(e.id), class: cx(c("act"), "dk-press"), "aria-label": "Düzenle: " + label }, "Düzenle");
    } else {
      action = h("a", { href: "#/venue/analitik?ev=" + encodeURIComponent(e.id), class: cx(c("act"), "dk-press"), "aria-label": "Rapor: " + label }, "Rapor");
    }
    return h("div", { role: "row", class: cx(c("tr"), c("row"), "dk-row", st === "wait" && "is-wait") },
      h("span", { role: "cell", class: c("date") },
        h("span", { class: c("dd") }, dd),
        h("span", { class: c("mmt") }, h("span", {}, mm), h("span", { class: c("tm") }, evTime(e) || "—"))),
      h("span", { role: "cell", class: c("ev") }, thumb,
        h("span", { class: c("evcol") },
          h("span", { class: c("evt") },
            h("span", { class: c("evtt"), title: e.title || "Etkinlik" }, e.title || "Etkinlik"),
            tonight ? h("span", { class: c("tonight") }, "BU GECE") : null,
            vip ? h("span", { class: c("vip") }, raw("sparkle", 10, "2"), vip) : null),
          h("span", { class: c("evg"), style: { color: gc } },
            h("span", { class: c("gdot"), style: { background: gc } }),
            h("span", { class: c("gname") }, g ? trUpper(g) : "—"),
            h("span", { class: c("gprice") }, " · " + price)),
          // ≤1279 sıkışık tablo: SANATÇI sütunu düşer → sanatçı + ücret etkinlik hücresinde
          h("span", { class: c("evar") }, [e.artistName || "Sanatçı yok", feeText(e) !== "—" ? feeText(e) : null].filter(Boolean).join(" · ")))),
      h("span", { role: "cell", class: cx(c("ar"), c("colartist")) }, artistAv,
        h("span", { class: c("arcol") },
          h("span", { class: c("arn") }, e.artistName || "Sanatçı yok"),
          h("span", { class: c("arf") }, feeText(e)))),
      h("span", { role: "cell", class: cx(c("price"), c("colprice"), isFree(e.ticketPrice) && "is-free") }, price),
      h("span", { role: "cell", class: c("att") },
        cap
          ? [h("span", { class: c("attt") }, h("span", { class: c("attn") }, att.toLocaleString("tr-TR")), ` / ${Number(cap).toLocaleString("tr-TR")}`),
            h("span", { class: c("bar"), role: "progressbar", "aria-label": "Doluluk", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) },
              h("span", { class: c("barf"), style: { width: pct + "%", background: mode === "past" ? "#A3A7AF" : "#FF8A2A" } }))]
          : h("span", { class: c("attt") }, h("span", { class: c("attn") }, att.toLocaleString("tr-TR")), " kişi")),
      h("span", { role: "cell" },
        h("span", { class: c("pill"), style: { color: stFg, background: stBg, borderColor: stBd } }, h("span", { class: c("pdot"), style: { background: stFg } }), stL)),
      h("span", { role: "cell", class: c("actcell") }, action));
  }

  // ── Sanatçı yanıtları ──
  function drawInvites() {
    if (!data.invitations) { invCard.hidden = true; bottom.classList.add("no-inv"); return; } // sorgu hatası → kart gizli (spec §9)
    // grup yayılımını tekilleştir (groupId + eventDate), son güncellenen önce
    const seen = new Set();
    const list = [...data.invitations]
      .sort((a, b) => (toMs(b.updatedAt ?? b.createdAt) ?? 0) - (toMs(a.updatedAt ?? a.createdAt) ?? 0))
      .filter((i) => { if (!i.groupId) return true; const k = i.groupId + "|" + i.eventDate; if (seen.has(k)) return false; seen.add(k); return true; });
    const pending = list.filter((i) => i.status === "pending").length;
    invCount.textContent = pending ? `${pending} BEKLİYOR` : "";
    invCount.hidden = !pending;
    invList.replaceChildren();
    if (!list.length) { invList.append(emptyBox("Henüz davet göndermedin.")); return; }
    const evById = new Map(data.events.map((e) => [e.id, e]));
    list.slice(0, 3).forEach((i) => {
      const name = i.groupName || i.artistName || "Sanatçı";
      const art = i.artistId && !i.groupId ? data.artistsById.get(i.artistId) : null; // grup davetinde üye fotoğrafı gösterilmez
      const ev = i.eventId ? evById.get(i.eventId) : null;
      const S = i.status === "accepted" ? ["Kabul etti", "#7CE0B0"] : i.status === "rejected" ? ["Reddetti", "#FF5A6E"] : i.status === "pending" ? ["Yanıt bekleniyor", "#FFD700"] : ["İptal edildi", "#8A8E97"];
      const fee = Number(i.fee) > 0 ? fmtTL(i.fee) + (i.status === "pending" ? " teklif" : "") : "—";
      const msg = h("button", { type: "button", class: cx(c("msg32"), "dk-press"), "aria-label": `${name} ile mesajlaş` }, raw("chat", 15));
      msg.addEventListener("click", () => openVenueChat(i.artistId, i.artistName || name));
      if (!i.artistId) msg.disabled = true;
      invList.append(h("div", { class: cx(c("item"), i.status === "pending" && "is-pending") },
        dkAvatar({ name, photo: art?.photoURL, size: 40, type: "artist", position: "center 25%" }),
        h("span", { class: c("icol") },
          h("span", { class: c("iname") }, name),
          h("span", { class: c("imeta") }, `${ev?.title || "Etkinliksiz teklif"} · ${fmtWhen(i.eventDate, i.eventTime)}`),
          h("span", { class: c("ifee") }, fee)),
        h("span", { class: c("iright") }, h("span", { class: c("istat"), style: { color: S[1] } }, S[0]), msg)));
    });
  }

  // ── Organizatör istekleri ──
  function drawRequests() {
    reqList.replaceChildren();
    if (!data.reqs) { reqList.append(emptyBox("İstekler yüklenemedi")); return; }
    if (!data.reqs.length) { reqList.append(emptyBox("Bekleyen istek yok")); return; }
    data.reqs.forEach((req) => reqList.append(reqCardEl(req)));
  }
  function reqCardEl(req) {
    const when = [fmtDateTR(req.eventDate), req.eventTime].filter(Boolean).join(" · ");
    const msg = h("button", { type: "button", class: cx(c("msg36"), "dk-press"), "aria-label": "Organizatöre mesaj gönder" }, raw("chat", 16));
    msg.addEventListener("click", () => openVenueChat(req.createdByUid || req.organizerId, req.organizerName || "Organizatör"));
    const rej = h("button", { type: "button", class: cx(c("rej"), "dk-press") }, "Reddet");
    const acc = h("button", { type: "button", class: cx(c("acc"), "dk-press") }, "Onayla");
    const card = h("div", { class: c("req") },
      h("div", { class: c("reqtop") },
        h("span", { class: c("reqcol") },
          h("span", { class: c("reqt") }, req.title || "Etkinlik"),
          h("span", { class: c("reqorg") }, raw("building", 12), h("span", {}, req.organizerName || "Organizatör")),
          h("span", { class: c("reqd") }, when)),
        msg),
      h("div", { class: c("reqbtns") }, rej, acc));
    const resolve = (text) => {
      const box = emptyBox(text, true);
      const hadFocus = card.contains(document.activeElement);
      box.setAttribute("tabindex", "-1"); box.setAttribute("role", "status");
      card.replaceWith(box);
      if (hadFocus) { try { box.focus({ preventScroll: true }); } catch (_) {} }
    };
    rej.addEventListener("click", async () => {
      if (dkLoginGate("İsteği yanıtlamak")) return;
      rej.disabled = acc.disabled = true;
      try {
        await setRequestStatus(req.id, "rejected");
        resolve("İstek reddedildi");
        dkToast("Reddedildi");
        notify(req.createdByUid ?? req.organizerId, { type: "venue_request_update", title: "Etkinlik İsteğin Reddedildi", body: `${p().displayName ?? "Mekan"}, "${req.title ?? "etkinlik"}" isteğini reddetti.` });
      } catch (_) { rej.disabled = acc.disabled = false; dkToast("İşlem başarısız", { type: "err" }); }
    });
    acc.addEventListener("click", () => openAcceptModal(req, resolve));
    return card;
  }
  function openAcceptModal(req, resolve) {
    if (dkLoginGate("İsteği onaylamak")) return;
    const hasArtist = !!(req.artistId || req.artistName);
    // Tasarım: başlık satırı → p → SANATÇI etiketi → not kutusu → düğmeler (diyalog gap 18; gövde aynı aralıkla)
    const body = [
      h("p", { class: c("msub") }, [req.title || "Etkinlik", fmtDateTR(req.eventDate), req.eventTime].filter(Boolean).join(" · ")),
      h("span", { class: c("mlabel") }, "SANATÇI"),
      hasArtist
        ? h("div", { class: c("mnote") }, raw("mic", 15, "1.8", { color: "#FF8A2A" }), h("span", { class: c("mnote-strong") }, `${req.artistName || "Sanatçı"} — organizatörün seçtiği sanatçı`))
        : h("div", { class: c("mnote") }, raw("info", 15, "1.8", { color: "#8A8E97" }), h("span", {}, "Sanatçıyı organizatör belirler — etkinlik organizatöre aittir.")),
    ];
    const m = dkModal({
      variant: "panel", size: 480, top: 200, title: "İsteği Onayla", cls: cx(c("modal"), c("mdlaccept")),
      body,
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Onayla ve Yayınla", variant: "role", icon: raw("check", 16, "2.2"), keepOpen: true, busyLabel: "Onaylanıyor…", onClick: async (close) => {
          try {
            const prof = session.profile || p();
            const newId = await acceptOrgRequest(req, prof);
            close();
            resolve("Onaylandı, etkinlik oluşturuldu");
            const pinned = prof?.location?.lat != null;
            dkToast("Onaylandı, etkinlik oluşturuldu", pinned ? {} : { onExpire: () => { if (alive) dkToast("Haritada görünmek için Profil > Mekan Konumu bölümünden konumunu pinle", { type: "info", duration: 4200 }); } });
            const name = prof.displayName ?? "Mekan";
            if (req.artistId) notify(req.artistId, { type: "event_invite", title: "Sahneye Eklendin 🎤", eventId: newId,
              body: `${name}, "${req.title ?? "etkinlik"}" etkinliğinde seni sahneye ekledi (${trShortDate(req.eventDate)}${req.eventTime ? " · " + req.eventTime : ""}).` });
            notify(req.createdByUid ?? req.organizerId, { type: "venue_request_update", title: "Etkinlik İsteğin Onaylandı 🎉",
              body: `${name}, "${req.title ?? "etkinlik"}" isteğini onayladı — etkinlik yayında.` });
            reloadEvents();
          } catch (_) { dkToast("İşlem başarısız", { type: "err" }); }
        } },
      ],
    });
    return m;
  }

  // ── Uzun dönem anlaşmalar ──
  function drawResidencies() {
    resList.replaceChildren();
    const list = data.residencies || [];
    if (!list.length) { resList.append(emptyBox("Aktif anlaşma yok")); return; }
    list.forEach((r) => resList.append(resRow(r)));
  }
  function resRow(r) {
    const active = r.status === "active";
    const period = h("span", { class: c("resp") }, r.status === "pending" ? "Sanatçı onayı bekleniyor"
      : (r.endDate ? "bitiş " + String(r.endDate).split("-").reverse().join(".") : "devam ediyor"));
    const meta = [fmtDays(r.daysOfWeek), r.time, r.fee ? fmtTL(r.fee) + "/gece" : null].filter(Boolean).join(" · ");
    const pill = h("span", { class: cx(c("rpill"), active ? "is-ok" : "is-wait") }, active ? "Aktif" : "Bekliyor");
    const cancel = h("button", { type: "button", class: cx(c("rcancel"), "dk-link") }, "İptal");
    cancel.setAttribute("aria-label", `İptal: ${r.artistName || "Sanatçı"} anlaşması`);
    cancel.addEventListener("click", () => {
      if (dkLoginGate("Anlaşmayı iptal etmek")) return;
      dkModal({
        variant: "panel", size: 440, top: 200, title: "Anlaşmayı İptal Et", cls: cx(c("modal"), c("mdlres")),
        body: h("p", { class: c("msub") }, `${r.artistName || "Sanatçı"} ile uzun dönem anlaşma iptal edilecek. Emin misiniz?`),
        actions: [
          { label: "Vazgeç", variant: "outline" },
          { label: "İptal Et", variant: "danger", keepOpen: true, busyLabel: "İptal ediliyor…", onClick: async (close) => {
            try {
              await cancelResidencyDoc(r.id, uid);
              close();
              pill.className = cx(c("rpill"), "is-cancel"); pill.textContent = "İptal edildi";
              period.textContent = "Anlaşma sona erdi";
              const hadFocus = cancel === document.activeElement;
              cancel.remove();
              if (hadFocus) { try { row.focus({ preventScroll: true }); } catch (_) {} }
              dkToast("Anlaşma iptal edildi");
              notify(r.artistId, { type: "residency_update", title: "Anlaşma İptal Edildi",
                body: `${p().displayName ?? "Mekan"}, uzun dönem sahne anlaşmasını iptal etti (${fmtDays(r.daysOfWeek) || "—"} · ${r.time || "—"}).` });
            } catch (_) { dkToast("İptal edilemedi", { type: "err" }); }
          } },
        ],
      });
    });
    const row = h("div", { class: c("item"), tabindex: "-1" },
      h("span", { class: c("resic") }, raw("repeat", 17)),
      h("span", { class: c("icol") },
        h("span", { class: c("iname") }, r.artistName || "Sanatçı"),
        h("span", { class: c("resm") }, meta || "—"),
        period),
      h("span", { class: cx(c("iright"), c("resright")) }, pill, cancel));
    return row;
  }

  // ── Önerilen sanatçılar (mekan şehri önce, sonra puan, sonra takipçi) ──
  function drawSuggestions() {
    sugList.replaceChildren();
    const city = fold(p().city || p().location?.city || "");
    const list = [...data.artists].sort((a, b) => {
      const ca = city && fold(a.city) === city ? 1 : 0, cb = city && fold(b.city) === city ? 1 : 0;
      if (ca !== cb) return cb - ca;
      const ra = Number(a.avgRating) || 0, rb = Number(b.avgRating) || 0;
      if (ra !== rb) return rb - ra;
      return (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0);
    }).slice(0, 3);
    if (!list.length) { sugList.append(dkEmpty({ icon: "users", title: "Henüz sanatçı yok", sub: "Sistemdeki sanatçılar yakında burada görünecek", variant: "plain", cls: c("sugempty") })); return; }
    list.forEach((a) => {
      const name = nameOf(a); const g = genreOfArtist(a); const rating = Number(a.avgRating) || 0;
      const photo = a.photoURL
        ? h("img", { src: a.photoURL, alt: name, decoding: "async", class: c("sphoto") })
        : h("span", { class: cx(c("sphoto"), "is-ph"), style: { background: genreGrad(g, 135) }, role: "img", "aria-label": name }, initials(String(name).replace(/^DJ\s+/i, "")));
      const inv = h("button", { type: "button", class: cx(c("invite"), "dk-press") }, "Davet et");
      inv.setAttribute("aria-label", `Davet et: ${name}`);
      inv.addEventListener("click", () => openInviteModal(a, { events: data.events, onSent: reloadInvites }));
      sugList.append(h("div", { class: c("item") }, photo,
        h("span", { class: c("icol") },
          h("span", { class: c("iname") }, name),
          h("span", { class: c("smeta") }, [g || "Müzik", `${shortNumTR(a.followerCount ?? 0)} takipçi`].join(" · ")),
          h("span", { class: c("srate") }, raw("star", 11, null, { fill: true, color: "#FF8A2A" }), rating ? rating.toFixed(1) : "Yeni",
            priceOf(a) > 0 ? h("span", { class: c("sprice") }, "· " + fmtTL(priceOf(a))) : null)),
        inv));
    });
  }

  function emptyBox(text, ok = false) {
    return h("div", { class: c("emptybox") }, ok ? raw("check", 16, "1.8", { color: "#7CE0B0" }) : null, h("span", {}, text));
  }
  function skelRows(n) {
    return Array.from({ length: n }, () => h("div", { class: cx(c("item"), c("skelitem")), "aria-hidden": "true" },
      dkSkeleton({ w: 40, h: 40, r: 20 }), h("span", { class: c("icol") }, dkSkeleton({ w: "60%", h: 13, r: 4 }), dkSkeleton({ w: "85%", h: 11, r: 4 }))));
  }

  load();

  return {
    node: shell.node,
    destroy() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); shell.destroy(); },
    update(q) { const k = initTab(q); if (k !== tab) { tab = k; if (data) { drawTable(); swap(rowsBox); } else drawTableSkeleton(); } },
    onSession(s) { return !!s?.user && s.user.uid === uid; },
  };
}

// dk-fa ↔ dk-fb (artboard gb-fa/gb-fb takası): listeyi yeniden oynat
function swap(el) {
  if (el.classList.contains("dk-fa")) { el.classList.remove("dk-fa"); el.classList.add("dk-fb"); }
  else { el.classList.remove("dk-fb"); el.classList.add("dk-fa"); }
}

// ══════════════════════════════════════════════════════════════════════
// DAVET MODALI (WebMekanSanatciBul §4 "Invite Modal" — Tek Etkinlik / Uzun Dönem)
// SHARED-CANDIDATE: aynı modal Sanatçı Bul'da (venue/sanatci-bul.js, başka grup) da var; ortak modüle taşınmalı.
// Yazımlar legacy inviteModal ile birebir: findExistingInvitation → uploadImage → createInvitation | createGroupInvitation;
// uzun dönem → createResidency. + uygulama paritesinde event_invite / residency_offer bildirimi (best-effort).
// ══════════════════════════════════════════════════════════════════════
let inviteSeq = 0; // modal başına benzersiz sekme/panel kimlikleri (aria-controls)
export function openInviteModal(x, { events = [], mode: initMode = "single", onSent } = {}) {
  if (dkLoginGate("Davet göndermek")) return;
  const C = (s) => `dk-mekan-panel-inv-${s}`;
  const isG = !!(x._group || x.memberIds);
  const name = nameOf(x);
  const g = genreOfArtist(x);
  const rating = Number(x.avgRating) || 0;
  let mode = initMode;
  let months = 3;
  const days = new Set();
  let photoFile = null, photoUrl = null;

  const errEl = h("div", { role: "alert", class: cx(C("err"), "dk-pop"), hidden: true });
  function err(t) { errEl.replaceChildren(raw("info", 15, "1.8"), h("span", {}, t)); errEl.hidden = false; errEl.classList.remove("dk-pop"); void errEl.offsetWidth; errEl.classList.add("dk-pop"); }
  function clearErr() { errEl.hidden = true; }
  const lbl = (t, ctl, extra) => h("label", { class: C("fld") }, h("span", { class: C("lbl") }, t), ctl, extra || null);
  const inp = (attrs) => h("input", { class: C("in"), ...attrs });
  // tek etkinlik
  const nowMs = Date.now();
  const upcoming = events.filter((e) => e.status !== "cancelled" && !isEventOver(e) && (eventStartMs(e) ?? 0) > nowMs && !e.artistId && !e.organizerId)
    .sort((a, b) => (eventStartMs(a) ?? 0) - (eventStartMs(b) ?? 0));
  const sel = h("select", { class: cx(C("in"), C("sel")) },
    h("option", { value: "" }, "Yeni tarih (etkinliksiz teklif)"),
    ...upcoming.map((e) => { const s = eventStartMs(e); const d = s != null ? new Date(s) : null;
      return h("option", { value: e.id }, `${e.title || "Etkinlik"}${d ? ` · ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${DAYS_TR_SHORT[d.getDay()]} ${evTime(e)}` : ""}`); }));
  const todayIso = isoDate(Date.now());
  const dateIn = inp({ type: "date", min: todayIso }); // app FindArtistScreen: minimumDate = bugün
  const timeIn = inp({ type: "time" });
  const feeIn = inp({ type: "number", min: "3500", step: "500", placeholder: "En az 3500", class: cx(C("in"), C("mono")) });
  const msgIn = h("textarea", { class: cx(C("in"), C("ta")), rows: 3, placeholder: "Merhaba, mekanımızda sahne almanızı isteriz…" });
  const photoTxt = h("span", {}, "Etkinlik fotoğrafı (opsiyonel)");
  const photoThumb = h("img", { class: C("thumb"), alt: "", hidden: true });
  const fileIn = h("input", { type: "file", accept: "image/*", class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
  const photoBtn = h("button", { type: "button", class: cx(C("photo"), "dk-press") }, raw("image", 16, "1.8"), photoTxt, photoThumb);
  photoBtn.addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files?.[0]; fileIn.value = "";
    if (!f) return;
    const blob = await openImageCropper(f, { aspect: 16 / 9 });
    if (!blob) return;
    photoFile = blob;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(blob);
    photoThumb.src = photoUrl; photoThumb.hidden = false;
    photoTxt.textContent = "Etkinlik fotoğrafı eklendi ✓";
    photoBtn.classList.add("is-set");
  });
  sel.addEventListener("change", () => {
    const e = upcoming.find((z) => z.id === sel.value);
    if (e) { const s = eventStartMs(e); dateIn.value = e.dateKey || (s != null ? isoDate(s) : ""); timeIn.value = evTime(e) || ""; }
    dateIn.readOnly = timeIn.readOnly = !!e;
    dateIn.classList.toggle("is-ro", !!e); timeIn.classList.toggle("is-ro", !!e);
    clearErr();
  });
  const selWrap = h("span", { class: C("selwrap") }, sel, raw("chevronDown", 16, "1.8", { cls: C("chev"), color: "#8A8E97" }));
  const uidN = ++inviteSeq;
  const singleBox = h("div", { class: C("box"), role: "tabpanel", id: `dk-mp-inv-single-${uidN}`, "aria-labelledby": `dk-mp-inv-tsingle-${uidN}` },
    isG ? null : lbl("ETKİNLİK", selWrap),
    h("div", { class: C("g2") }, lbl("TARİH", dateIn), lbl("SAAT", timeIn)),
    lbl("ÜCRET (₺)", feeIn),
    lbl("MESAJ (OPSİYONEL)", msgIn),
    photoBtn, fileIn);
  // uzun dönem
  const chip = (text, on, onClick) => { const b = h("button", { type: "button", class: cx(C("chip"), "dk-press", on && "is-on"), "aria-pressed": on ? "true" : "false" }, text); b.addEventListener("click", () => onClick(b)); return b; };
  const monthRow = h("div", { class: C("chips"), role: "group", "aria-label": "Süre" });
  [1, 3, 6].forEach((m) => monthRow.append(chip(m + " ay", m === 3, (b) => {
    months = m; [...monthRow.children].forEach((z) => { z.classList.toggle("is-on", z === b); z.setAttribute("aria-pressed", z === b ? "true" : "false"); }); clearErr();
  })));
  const dayRow = h("div", { class: C("chips"), role: "group", "aria-label": "Sahne günleri" });
  ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].forEach((d, i) => { const idx = i === 6 ? 0 : i + 1; dayRow.append(chip(d, false, (b) => {
    if (days.has(idx)) days.delete(idx); else days.add(idx);
    b.classList.toggle("is-on", days.has(idx)); b.setAttribute("aria-pressed", days.has(idx) ? "true" : "false"); clearErr();
  })); });
  const rTime = inp({ type: "time" });
  const rFee = inp({ type: "number", min: "3500", step: "500", placeholder: "En az 3500", class: cx(C("in"), C("mono")) });
  const longBox = h("div", { class: C("box"), hidden: true, role: "tabpanel", id: `dk-mp-inv-long-${uidN}`, "aria-labelledby": `dk-mp-inv-tlong-${uidN}` },
    h("div", { class: C("fld") }, h("span", { class: C("lbl") }, "SÜRE"), monthRow),
    h("div", { class: C("fld") }, h("span", { class: C("lbl") }, "SAHNE GÜNLERİ"), dayRow),
    h("div", { class: C("g2") }, lbl("SAAT", rTime), lbl("GECE BAŞINA ÜCRET (₺)", rFee)));
  // mod sekmeleri (grup: uzun dönem yok — legacy createResidency yalnız bireysel sanatçı)
  const tabs = h("div", { role: "tablist", "aria-label": "Davet türü", class: C("tabs") });
  const tSingle = h("button", { type: "button", role: "tab", id: `dk-mp-inv-tsingle-${uidN}`, "aria-controls": singleBox.id, class: cx(C("tab"), "dk-press") }, "Tek Etkinlik");
  const tLong = h("button", { type: "button", role: "tab", id: `dk-mp-inv-tlong-${uidN}`, "aria-controls": longBox.id, class: cx(C("tab"), "dk-press") }, "Uzun Dönem");
  tabs.append(tSingle, tLong);
  const setMode = (m) => {
    mode = m;
    [[tSingle, "single"], [tLong, "longterm"]].forEach(([b, k]) => { const on = k === m; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    singleBox.hidden = m !== "single"; longBox.hidden = m !== "longterm"; clearErr();
  };
  tSingle.addEventListener("click", () => setMode("single"));
  tLong.addEventListener("click", () => setMode("longterm"));
  tabs.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = mode === "single" ? "longterm" : "single"; setMode(n); (n === "single" ? tSingle : tLong).focus(); } });
  if (isG) tLong.hidden = true;
  setMode(isG ? "single" : mode);

  [dateIn, timeIn, feeIn, msgIn, rTime, rFee].forEach((el) => el.addEventListener("input", clearErr));

  const subParts = [isG ? "Grup" : null, g || null, x.city || null, rating ? "★ " + rating.toFixed(1) : null].filter(Boolean);
  const m = dkModal({
    variant: "panel", size: 560, top: 140, title: "Davet Gönder — " + name, cls: cx("dk-mekan-panel-modal", C("modal")),
    sub: subParts.join(" · ") || "Sanatçı",
    body: [tabs, singleBox, longBox, errEl],
    onClose: () => { if (photoUrl) URL.revokeObjectURL(photoUrl); },
    actions: [
      { label: "Vazgeç", variant: "outline" },
      { label: "Gönder", variant: "role", icon: raw("send", 16, "2"), keepOpen: true, busyLabel: "Gönderiliyor…", onClick: async (close) => {
        const prof = session.profile || {};
        const me = session.user?.uid;
        const venueName = prof.displayName ?? "Mekan";
        if (mode === "single") {
          const f = { date: dateIn.value, time: timeIn.value, fee: feeIn.value, message: msgIn.value.trim(), eventId: sel.value || null };
          if (!f.date || !f.time) return err("Tarih ve saat gir");
          if (f.date < isoDate(Date.now())) return err("Geçmiş bir tarih seçilemez");
          if (!(Number(f.fee) >= MIN_STAGE_FEE)) return err(`Ücret en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")}`);
          try {
            if (!isG) {
              const dup = await findExistingInvitation(me, x.id, f.date).catch(() => null);
              if (dup) return err("Bu sanatçıya bu tarih için zaten teklif gönderilmiş");
            }
            if (photoFile) f.photoUrl = await uploadImage(photoFile, me);
            if (isG) { delete f.eventId; await createGroupInvitation(prof, x, f); }
            else await createInvitation(prof, x, f);
            const body = `${venueName} ${isG ? "grubunuzu" : "seni"} ${trShortDate(f.date)}${f.time ? " · " + f.time : ""} tarihli sahneye davet etti (${fmtTL(f.fee)}).`;
            if (isG) (x.memberIds || []).forEach((mid) => notify(mid, { type: "event_invite", title: "Yeni Sahne Teklifi 🎤", body }));
            else notify(x.id, { type: "event_invite", title: "Yeni Sahne Teklifi 🎤", body, eventId: f.eventId });
            close(); dkToast("Davet gönderildi"); onSent?.();
          } catch (_) { err("Gönderilemedi"); }
        } else {
          if (!days.size) return err("En az bir gün seç");
          if (!rTime.value) return err("Saat gir");
          if (!(Number(rFee.value) >= MIN_STAGE_FEE)) return err(`Ücret en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")}`);
          try {
            await createResidency(prof, x, { months, days: [...days], time: rTime.value, fee: rFee.value });
            notify(x.id, { type: "residency_offer", title: "Uzun Dönem Sahne Teklifi 🎶",
              body: `${venueName}, ${months} aylık sahne anlaşması önerdi (${fmtDays([...days])} · ${rTime.value}).` });
            close(); dkToast("Anlaşma teklifi gönderildi"); onSent?.();
          } catch (_) { err("Gönderilemedi"); }
        }
      } },
    ],
  });
  // başlık satırı: 48'lik avatar + başlık/alt yazı sütunu + kapat (tasarım: gap 14)
  m.dialog.querySelector(".dk-mdl-headrow")?.prepend(
    dkAvatar({ name: String(name).replace(/^DJ\s+/i, ""), photo: x.photoURL, size: 48, type: "artist", genre: x.photoURL ? undefined : g || undefined, position: "center 25%", fontSize: 19, cls: C("av") }));
  return m;
}
