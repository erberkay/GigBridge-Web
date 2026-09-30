// WebSanatciPanel — masaüstü görünümü (≥769 px). Registry anahtarı: artistPanel (#/artist).
// Spec: specs/sanatci.md § WebSanatciPanel + sahibinin CLAUDE CODE notu (design/WebSanatciPanel.dc.html).
// CSS: css/dk-sanatci-panel.css — tüm seçiciler .dk-sanatci-panel kökü (ve portal içindeki .dk-sanatci-panel-* onay modalı) altında.
// ≤768: legacy artist.js homePage()/renderHome() aynen kalır (router bu modülü mobilde yüklemez).
//
// Legacy özellikleri (korundu): 4 statBox (Performans = bu ay onaylanan updatedAt ≥ ay başı · Puan = reviews ortalaması (rating>0) ·
//   Toplam kazanç = kabul edilen davetlerin fee toplamı "₺30.0K" · Takipçi = users.followerCount kFmt) · Gelen Teklifler canlı
//   (listenArtistOffers) + onay modalı (confirmOffer) → respondToOffer → toast / ERR-AHOME-001 · Sahnelerim: bekleyen rezidans
//   (legacy home'da "— incele" çipi → burada satır içi Kabul/Reddet: legacy renderStages.respond() birebir: setResidencyStatus +
//   syncResidentDenorm + pushAppNotification "residency_update") + aktif rezidanslar (ilk 2, → #/artist/sahnelerim) + boş metin
//   "Aktif sahne anlaşman yok" · Yaklaşan Performanslar (kabul edilmiş, bugün 00:00 ve sonrası, "Belirtilmemiş" ücret) + boş metin
//   "Onaylı performans yok" · Aldığınız Puanlar kartı → #/artist/yorumlar · zil → #/artist/bildirimler (kabuk) · teklif detayı
//   (legacy offerDetailModal → yeni sayfa #/artist/teklif/{id}).
// Tasarım ekleri: selamlama alt satırı, Takvim / Profili düzenle, DURUM sütunlu teklif tablosu (bu oturumda karar verilen satırlar
//   rozetle kalır — oturumluk Map), profil tamamlama kartı (ui.js profileCompletion), 14 günlük sahne şeridi (expandOccurrences +
//   kabul edilmiş etkinlikler), Son yorumlar (ilk 3).
// Bilinçli sapmalar (spec Q3/Q5/Q6 varsayılanları): teklif tablosunda TARİH • SAAT MEKAN hücresinin 2. satırı (artboard'un 5 sütunu
//   1440'ta üst üste biniyor) · "Geri al" YOK (arka uçta geri alma yok) · "Takvim" → #/artist/sahnelerim (bare #takvim router'ı bozar).
import { h, profileCompletion } from "../../ui.js";
import { session } from "../../store.js";
import {
  getUser, artistReviews, listenArtistOffers, listenArtistAccepted, listenArtistResidencies,
  respondToOffer, setResidencyStatus, syncResidentDenorm, pushAppNotification,
} from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw, svgPath } from "../shared/icons.js";
import { cx, dkModal, dkToast, dkSkeleton } from "../shared/ui.js";
import { rgba, trUpper, initials } from "../shared/helpers.js";
import { genreColor } from "../shared/genres.js";

// ══════════ Ortak saf yardımcılar (teklif.js de kullanır; legacy artist.js ile birebir) ══════════
export const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const DAY_LABELS_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const DOW_UP = ["PAZ", "PZT", "SAL", "ÇAR", "PER", "CUM", "CMT"];
export const DOW_LONG = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const pad2 = (n) => String(n).padStart(2, "0");
export const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export function parseTL(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}
export const tl = (n) => "₺" + Number(n).toLocaleString("tr-TR");
// "2026-10-03" → "3 Ekim 2026" (artist.js isoToTR)
export function isoToTR(iso) {
  if (typeof iso !== "string") return "";
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const mi = parseInt(m[2], 10) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${parseInt(m[3], 10)} ${MONTHS_TR[mi]} ${parseInt(m[1], 10)}`;
}
function parseTRDate(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})$/);
  if (!m) return null;
  const mi = MONTHS_TR.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (mi < 0) return null;
  return new Date(parseInt(m[3], 10), mi, parseInt(m[1], 10)).getTime();
}
export function toISOKey(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  const ms = parseTRDate(input);
  return ms != null ? toISODate(new Date(ms)) : null;
}
export function resolveMs(x) {
  const at = x?.eventAt;
  if (at?.toMillis) return at.toMillis();
  const d = x?.eventDate ?? x?.date;
  if (typeof d === "string") {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getTime();
    const tr = parseTRDate(d);
    if (tr != null) return tr;
  }
  return null;
}
export const dotISO = (iso) => (iso || "").split("-").reverse().join(".");
export function formatDays(days) {
  return [...(days || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_LABELS_TR[d]).join(", ");
}
// Rezidansın pencereye düşen tekrarları (ISO listesi) — app/legacy expandOccurrences birebir
export function expandOccurrences(r, windowStart, windowEnd) {
  const out = [];
  const start = new Date(`${r.startDate}T00:00`);
  const end = new Date(`${r.endDate}T23:59`);
  const from = start > windowStart ? start : windowStart;
  const to = end < windowEnd ? end : windowEnd;
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  while (cur <= to) {
    if ((r.daysOfWeek || []).includes(cur.getDay())) out.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
// data.js axIsoToTR ile aynı ("03 Eki 2026") — respondToOffer bu alanı sohbet durum mesajında kullanır
function axIsoToTR(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return (typeof iso === "string" && iso) ? iso : "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}
// Davet dokümanı → listenArtistOffers ile aynı teklif görünüm modeli (+ status)
export function offerFromDoc(id, x = {}) {
  const fee = parseTL(x.fee);
  return {
    id,
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
    status: x.status ?? "pending",
  };
}
export const offerDate = (o) => (o?.dateISO ? isoToTR(o.dateISO) : "") || o?.date || "—";
export const offerWhen = (o) => `${offerDate(o)} • ${o?.time ?? "—"}`;
export const offerSortKey = (o) => `${o?.dateISO || "9999"} ${o?.time || ""}`;
export const meOf = (s = session) => ({ uid: s.user?.uid, name: s.profile?.displayName || "Sanatçı" });

// Bu oturumda karar verilen teklifler (sahibi notu: masaüstünde karar verilen satır tabloda rozetle kalır). Yeniden yüklemede sıfırlanır.
const DECIDED = new Map();            // `${uid}|${id}` → { offer, status }
const OFFER_CACHE = new Map();        // id → son görülen teklif görünüm modeli (Teklif sayfası anında çizsin)
export function rememberDecision(uid, offer, status) {
  if (!uid || !offer?.id) return;
  DECIDED.set(`${uid}|${offer.id}`, { offer: { ...offer, status }, status });
  OFFER_CACHE.set(offer.id, { ...offer, status });
}
export function decidedList(uid) {
  const out = [];
  DECIDED.forEach((v, k) => { if (k.startsWith(uid + "|")) out.push(v); });
  return out;
}
export const decisionOf = (uid, id) => DECIDED.get(`${uid}|${id}`) || null;
export function cacheOffers(list) { (list || []).forEach((o) => { if (o?.id) OFFER_CACHE.set(o.id, { status: "pending", ...o }); }); }
export const cachedOffer = (id) => OFFER_CACHE.get(id) || null;

// ══════════ Artboard SVG gövdeleri (birebir) ══════════
const I = {
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  envOpen: '<path d="M3.5 9.5 12 4l8.5 5.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"></path><path d="m3.5 9.5 8.5 6 8.5-6"></path>',
  plusC: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 8.5v7M8.5 12h7"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  clock: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
  bldg: '<path d="M4 20V8l8-4 8 4v12"></path><path d="M9 20v-6h6v6M4 20h16"></path>',
  alert: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5M12 16v.01"></path>',
};
const KPI_ICONS = {
  month: "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  rating: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  earn: "M3.5 7h17v10h-17zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 7V5.5M17.5 17v1.5",
  foll: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6",
};
export const STATUS = {
  pending: { label: "BEKLİYOR", c: "#FFD700" },
  accepted: { label: "KABUL EDİLDİ", c: "#7CE0B0" },
  rejected: { label: "REDDEDİLDİ", c: "#FF5A6E" },
};
const C = { res: "#FF4FA3", gig: "#FFD700" };
const kFmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));   // legacy artist.js kFmt
const P = "dk-sanatci-panel";
// "btn is-outline" → "dk-sanatci-panel-btn is-outline" (is-* durum/değişken sınıfları öneksiz)
const cls = (s) => s.split(" ").filter(Boolean).map((x) => (x.startsWith("is-") ? x : `${P}-${x}`)).join(" ");

export function artistPanelView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid;
  const profile = s.profile || {};
  const name = profile.displayName || "Sanatçı";
  const shell = panelShell({ role: "artist", active: ctx.route?.nav || "home", title: "Ana Sayfa", ctx, contentGap: 28, shellBadges: false });
  const root = shell.content;
  root.classList.add(P);
  const unsubs = [];
  let alive = true;

  // ── durum ──
  // busy: yanıtı sürmekte olan teklifler (id → teklif). Gecikme telafili anlık görüntü teklifi respondToOffer bitmeden listeden
  // düşürür → satır, sayaç ve "Bekleyen teklif yok" titremesin diye karar kaydedilene dek bekleyen sayılır.
  const st = { offers: null, accepted: null, residencies: null, reviews: null, busy: new Map(), resBusy: false, resFocus: false, day: 0, profileKey: JSON.stringify(profile) };

  // ═════════ HERO ═════════
  const greet = h("p", { class: cls("sub") }, " ");
  const hero = h("div", { class: cx(cls("hero"), "dk-rise") },
    h("div", { class: cls("hcol") },
      h("span", { class: cls("eb") }, "MERHABA"),
      h("h1", { class: cls("h1") }, "Tekrar hoş geldin, ", h("em", {}, name)),
      greet),
    h("div", { class: cls("hact") },
      h("a", { href: "#/artist/sahnelerim", class: cx(cls("btn is-outline"), "dk-press") }, svgRaw(I.cal, { size: 16, sw: "2", color: "#FF4FA3" }), "Takvim"),
      h("a", { href: "#/artist/profil", class: cx(cls("btn is-primary"), "dk-press") }, "Profili düzenle", svgRaw(I.arrow, { size: 15, sw: "2.2" }))));

  // ═════════ KPI ═════════
  const KPIS = [
    { key: "month", label: "PERFORMANS", sub: "Bu ay onaylanan", c: "#FF4FA3" },
    { key: "rating", label: "PUAN", sub: " ", c: "#FFD700" },
    { key: "earn", label: "KAZANÇ", sub: "Toplam · kabul edilen teklifler", c: "#7CE0B0" },
    { key: "foll", label: "TAKİPÇİ", sub: "Kişi", c: "#4ED8FF" },
  ];
  const kpi = {};
  const kpiRow = h("section", { class: cls("kpis"), "aria-label": "Özet istatistikler" }, ...KPIS.map((d, i) => {
    const v = h("span", { class: cls("kv"), style: { color: d.c } }, "—");
    const sb = h("span", { class: cls("ks") }, d.sub);
    kpi[d.key] = { set: (x) => { v.textContent = x; }, sub: (x) => { sb.textContent = x; } };
    return h("div", { class: cx(cls("kpi"), "dk-rise"), style: { "--dk-delay": `${60 + i * 60}ms` } },
      h("div", { class: cls("ktop") },
        h("span", { class: cls("kl") }, d.label),
        h("span", { class: cls("kic"), style: { background: rgba(d.c, 0.1), color: d.c } }, svgPath(KPI_ICONS[d.key], { size: 16, sw: "2" }))),
      v, sb);
  }));

  // ═════════ GELEN TEKLİFLER ═════════
  const offPill = h("span", { class: cls("pill"), hidden: true });
  const tBody = h("div", { role: "rowgroup", class: cls("tbody") });
  const offEmpty = h("div", { class: cls("offempty"), hidden: true }, svgRaw(I.envOpen, { size: 18, sw: "1.8" }), "Bekleyen teklif yok");
  const offers = h("section", { class: cx(cls("card offers")), "aria-labelledby": "dk-sp-h-off" },
    h("div", { class: cls("offhead") },
      h("div", { class: cls("offtl") }, h("span", { class: cls("bar"), "aria-hidden": "true" }), h("h2", { id: "dk-sp-h-off", class: cls("h2") }, "Gelen Teklifler"), offPill),
      h("span", { class: cls("hint") }, "Satıra tıkla → teklif detayı")),
    h("div", { role: "table", "aria-label": "Gelen teklifler", class: cls("table") },
      h("div", { role: "row", class: cls("tr th") },
        h("span", { role: "columnheader" }, "MEKAN"), h("span", { role: "columnheader" }, "ÜCRET"),
        h("span", { role: "columnheader" }, "DURUM"), h("span", { role: "columnheader", class: cls("thr") }, "İŞLEM")),
      tBody),
    offEmpty);

  // ═════════ SAĞ KOLON: profil tamamlama + puanlar ═════════
  const compCard = h("section", { class: cls("card comp"), "aria-labelledby": "dk-sp-h-comp" });
  const rateVal = h("span", { class: cls("rv") }, "—");
  const rateCnt = h("span", { class: cls("rc") }, " ");
  const rateCard = h("section", { class: cls("card rate"), "aria-labelledby": "dk-sp-h-rate" },
    h("h2", { id: "dk-sp-h-rate", class: cls("ml") }, "ALDIĞINIZ PUANLAR"),
    h("div", { class: cls("rrow") }, svgRaw(I.star, { size: 22, fill: true, color: "#FFD700" }), rateVal, rateCnt),
    h("p", { class: cls("p") }, "Sana yapılan tüm değerlendirme ve yorumları (mekanlar ve dinleyiciler) gör."),
    h("a", { href: "#/artist/yorumlar", class: cx(cls("alink"), "dk-link") }, "Aldığım yorumlar", svgRaw(I.arrow, { size: 14, sw: "2.2" })));
  const row2 = h("div", { class: cls("row2") }, offers, h("div", { class: cls("side") }, compCard, rateCard));

  // ═════════ SAHNE TAKVİMİ (14 gün) ═════════
  const dayGrid = h("div", { role: "group", "aria-label": "Gün seç", class: cls("days") });
  const dayBar = h("div", { class: cls("daybar") });
  const cal = h("section", { class: cls("card cal"), "aria-labelledby": "dk-sp-h-cal" },
    h("div", { class: cls("calhead") },
      h("div", { class: cls("offtl") }, h("span", { class: cls("bar"), "aria-hidden": "true" }), h("h2", { id: "dk-sp-h-cal", class: cls("h2") }, "Sahne takvimi"), h("span", { class: cls("muted13") }, "Önümüzdeki 14 gün")),
      h("div", { class: cls("legend") },
        h("span", {}, h("span", { class: cls("ldot"), style: { background: C.res } }), "Uzun dönem"),
        h("span", {}, h("span", { class: cls("ldot"), style: { background: C.gig } }), "Etkinlik"))),
    dayGrid, dayBar);

  // ═════════ ALT SATIR: Sahnelerim · Yaklaşan · Son yorumlar ═════════
  const stageBox = h("div", { class: cls("stack") });
  const gigBox = h("div", { class: cls("list") });
  const revBox = h("div", { class: cls("stack") });
  const colHead = (id, title, link) => h("div", { class: cls("colhead") },
    h("div", { class: cls("offtl") }, h("span", { class: cls("bar"), "aria-hidden": "true" }), h("h2", { id, class: cls("h2") }, title)),
    link || null);
  const stageLink = h("a", { href: "#/artist/sahnelerim", class: cx(cls("clink"), "dk-link") }, "Takvim");
  const row4 = h("div", { class: cls("row4") },
    h("section", { class: cls("col col-stage"), "aria-labelledby": "dk-sp-h-stage" },
      colHead("dk-sp-h-stage", "Sahnelerim", stageLink), stageBox),
    h("section", { class: cls("col col-gig"), "aria-labelledby": "dk-sp-h-gig" }, colHead("dk-sp-h-gig", "Yaklaşan Performanslar"), gigBox),
    h("section", { class: cls("col col-rev"), "aria-labelledby": "dk-sp-h-rev" },
      colHead("dk-sp-h-rev", "Son yorumlar", h("a", { href: "#/artist/yorumlar", class: cx(cls("clink"), "dk-link") }, "Tümünü gör →")), revBox));

  root.append(hero, kpiRow, row2, cal, row4);

  // ── iskeletler ──
  const skelRows = (n) => Array.from({ length: n }, () => h("div", { class: cls("tr row skel") },
    h("div", { class: cls("c1") }, dkSkeleton({ w: "55%", h: 15 }), dkSkeleton({ w: "40%", h: 12 })),
    dkSkeleton({ w: 64, h: 14 }), dkSkeleton({ w: 84, h: 24, r: 4 }), h("span", { class: cls("acts") }, dkSkeleton({ w: 150, h: 40 }))));
  tBody.append(...skelRows(3));
  stageBox.append(dkSkeleton({ h: 70, r: 10 }));
  gigBox.append(h("div", { class: cls("gig") }, dkSkeleton({ w: "70%", h: 14 })), h("div", { class: cls("gig") }, dkSkeleton({ w: "55%", h: 14 })));
  revBox.append(dkSkeleton({ h: 118, r: 10 }));

  // ═════════ ÇİZİMLER ═════════
  function greetDraw() {
    if (st.offers == null || st.accepted == null) return;
    const n = pendingCount();
    const m = upcomingGigs().length;
    greet.textContent = n ? `${n} teklif yanıtını bekliyor · ${m} onaylı performans yaklaşıyor` : `Bekleyen teklif yok · ${m} onaylı performans yaklaşıyor`;
  }
  const pendingLive = () => (st.offers || []).filter((o) => !decisionOf(uid, o.id));
  // canlı listeden erken düşmüş ama yanıtı henüz bitmemiş teklifler
  const inflight = () => { const ids = new Set((st.offers || []).map((o) => o.id)); return [...st.busy.values()].filter((o) => !ids.has(o.id) && !decisionOf(uid, o.id)); };
  const pendingCount = () => pendingLive().length + inflight().length;

  // Tür çipi (tablo varyantı; artboard h20 border-box)
  const genreChip = (g) => { const c = genreColor(g); return h("span", { class: cls("gchip"), style: { color: c, borderColor: rgba(c, 0.45) } }, g); };
  const statusBadge = (k) => { const S = STATUS[k] || STATUS.pending; return h("span", { class: cls("st"), style: { color: S.c, borderColor: rgba(S.c, 0.4), background: rgba(S.c, 0.08) } }, h("span", { class: cls("stdot"), style: { background: S.c } }), S.label); };

  function offerRow(o, status) {
    const pending = status === "pending";
    const href = "#/artist/teklif/" + encodeURIComponent(o.id);
    const busy = st.busy.has(o.id);
    let acts;
    if (pending) {
      const rej = h("button", { type: "button", class: cx(cls("tbtn is-outline"), "dk-press"), "aria-label": `${o.venue} teklifini reddet`, disabled: busy }, "Reddet");
      const acc = h("button", { type: "button", class: cx(cls("tbtn is-primary"), "dk-press"), "aria-label": `${o.venue} teklifini kabul et`, disabled: busy }, "Kabul");
      rej.addEventListener("click", () => confirmOffer(o, "reject"));
      acc.addEventListener("click", () => confirmOffer(o, "accept"));
      acts = [rej, acc];
    } else {
      acts = [h("a", { href, class: cx(cls("tbtn is-outline is-detail"), "dk-press") }, "Detay", svgRaw(I.arrow, { size: 13, sw: "2.2" }))];
    }
    const row = h("div", { role: "row", class: cx(cls("tr row"), "dk-row"), dataset: { id: o.id } },
      h("div", { role: "cell", class: cls("c1") },
        h("span", { class: cls("l1") }, h("a", { href, class: cls("vname"), title: o.venue }, o.venue), o.genre && o.genre !== "—" ? genreChip(o.genre) : null),
        h("span", { class: cls("when") }, offerWhen(o)),
        o.message ? h("span", { class: cls("msg") }, `“${o.message}”`) : null),
      h("span", { role: "cell", class: cls("fee") }, o.fee),
      h("span", { role: "cell", class: cls("stcell") }, statusBadge(status)),
      h("div", { role: "cell", class: cls("acts") }, ...acts));
    row.addEventListener("click", (e) => { if (e.target.closest("a,button")) return; location.hash = href; });
    return row;
  }

  function drawOffers() {
    if (st.offers == null) return;
    const live = st.offers;
    const liveIds = new Set(live.map((o) => o.id));
    const rows = [
      ...live.map((o) => { const d = decisionOf(uid, o.id); return { o: d ? d.offer : o, status: d ? d.status : "pending" }; }),
      ...decidedList(uid).filter((d) => !liveIds.has(d.offer.id)).map((d) => ({ o: d.offer, status: d.status })),
      ...inflight().map((o) => ({ o, status: "pending" })),
    ].sort((a, b) => offerSortKey(a.o).localeCompare(offerSortKey(b.o)));
    tBody.replaceChildren(...rows.map((r) => offerRow(r.o, r.status)));
    const n = pendingCount();
    offPill.hidden = !n;
    offPill.textContent = `${n} bekliyor`;
    offEmpty.hidden = n > 0;
    shell.setBadge("home", n);
    greetDraw();
  }

  function confirmOffer(o, action) {
    const acc = action === "accept";
    dkModal({
      variant: "confirm", size: 440, align: "top", top: 260, cls: cls("conf"),
      title: acc ? "Teklifi Kabul" : "Teklifi Reddet",
      sub: `${o.venue} teklifini ${acc ? "kabul edeceksin" : "reddedeceksin"}. Emin misin?`,
      actions: [
        { label: "İptal", variant: "outline" },
        { label: acc ? "Kabul" : "Reddet", variant: acc ? "primary" : "danger", keepOpen: true, onClick: async (close, btn) => {
          if (st.busy.has(o.id)) return false;
          st.busy.set(o.id, o); btn.disabled = true; drawOffers();
          try {
            await respondToOffer(o, action, meOf(s));
            rememberDecision(uid, o, acc ? "accepted" : "rejected");
            close();
            dkToast(acc ? `${o.venue} teklifini kabul ettin — performans takvime eklendi` : `${o.venue} teklifi reddedildi`, { type: acc ? "ok" : "err" });
          } catch (_) {
            dkToast("İşlem gerçekleştirilemedi. (ERR-AHOME-001)", { type: "err" });
          } finally {
            st.busy.delete(o.id);
            if (alive) {
              drawOffers();
              // tetikleyici satır yeniden çizildi → odak aynı satırın ilk eylemine (Detay / Reddet)
              requestAnimationFrame(() => {
                try { tBody.querySelector(`[data-id="${CSS.escape(o.id)}"]`)?.querySelector("a.is-detail, button")?.focus({ preventScroll: true }); } catch (_) {}
              });
            }
          }
          return false;
        } },
      ],
    });
  }

  function drawCompletion(p) {
    const { pct, missing } = profileCompletion(p);
    const done = pct >= 100;
    compCard.replaceChildren(
      h("div", { class: cls("comphead") },
        h("h2", { id: "dk-sp-h-comp", class: cls("ml") }, "PROFİL TAMAMLAMA"),
        h("span", { class: cls("pct"), style: done ? { color: "#7CE0B0" } : null }, "%" + pct)),
      h("div", { role: "progressbar", "aria-label": "Profil tamamlama", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", class: cls("track") },
        h("span", { class: cx(cls("fill"), "dk-prism"), style: { width: pct + "%" } })),
      h("p", { class: cls("p") }, done ? "Tamamlanmış profiller tekliflerde daha güvenilir görünür." : "Tamamlanmış profiller tekliflerde daha güvenilir görünür. Eksikler:"),
      done
        ? h("span", { class: cls("complete") }, "Profil eksiksiz")
        : h("div", { class: cls("chips") }, ...missing.map((m) => h("a", { href: `#/artist/profil?tab=${encodeURIComponent(m.anchor)}`, class: cx(cls("mchip"), "dk-press") },
          svgRaw(I.plusC, { size: 13, sw: "2" }), m.label))));
  }

  function drawRatings() {
    const list = st.reviews || [];
    const rs = list.map((r) => r.rating ?? 0).filter((x) => x > 0);
    const avg = rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : "—";
    kpi.rating.set(avg);
    kpi.rating.sub(`${rs.length} değerlendirme`);
    rateVal.textContent = avg;
    rateCnt.textContent = `· ${rs.length} değerlendirme`;
    // Son yorumlar (artistReviews byMs ile yeniden eskiye sıralı)
    const top = list.slice(0, 3);
    if (!top.length) {
      revBox.replaceChildren(h("div", { class: cls("emptyrow") }, svgRaw(I.star, { size: 18, sw: "1.8", fill: false }), "Henüz yorum almadın"));
      return;
    }
    revBox.replaceChildren(...top.map((r) => {
      const t = r.authorType === "venue" ? { label: "Mekan", c: "#FF8A2A", grad: "linear-gradient(135deg,#FF8A2A,#D97706)" }
        : r.authorType === "customer" ? { label: "Dinleyici", c: "#4ED8FF", grad: "linear-gradient(135deg,#4ED8FF,#0891B2)" }
        : { label: "Değerlendiren", c: "#A3A7AF", grad: "linear-gradient(135deg,#4ED8FF,#0891B2)" };
      const nm = r.authorName ?? "Değerlendiren";
      const k = Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)));
      const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("tr-TR") : "Yakın zamanda";
      return h("article", { class: cls("rev") },
        h("div", { class: cls("revtop") },
          h("span", { class: cls("rav"), style: { background: t.grad }, "aria-hidden": "true" }, initials(nm)),
          h("span", { class: cls("revcol") }, h("span", { class: cls("revname") }, nm), h("span", { class: cls("revdate") }, date)),
          h("span", { class: cls("revpill"), style: { color: t.c, background: rgba(t.c, 0.12) } }, t.label)),
        h("span", { class: cls("stars"), role: "img", "aria-label": `${k} / 5 yıldız` }, "★".repeat(k), h("span", { class: cls("stoff") }, "★".repeat(5 - k))),
        r.comment ? h("p", { class: cls("revtxt") }, r.comment) : null);
    }));
  }

  function drawRatingsError() {
    kpi.rating.set("—");
    kpi.rating.sub(" ");
    rateVal.textContent = "—";
    rateCnt.textContent = " ";
    revBox.replaceChildren(h("div", { class: cls("emptyrow") }, svgRaw(I.alert, { size: 18, sw: "1.8" }), "Yüklenemedi"));
  }

  const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  function upcomingGigs() {
    const t0 = todayStart().getTime();
    return (st.accepted || []).map((d) => ({
      venue: d.venueName ?? "—",
      date: isoToTR(d.eventDate ?? d.date) || "—",
      time: d.eventTime ?? d.time ?? "",
      fee: d.fee != null ? tl(parseTL(d.fee) ?? 0) : "Belirtilmemiş",
      _ms: resolveMs(d),
    })).filter((g) => g._ms == null || g._ms >= t0).sort((a, b) => (a._ms ?? Infinity) - (b._ms ?? Infinity));
  }

  function drawAccepted() {
    const docs = st.accepted || [];
    // KPI: toplam kazanç + bu ay onaylanan (legacy birebir)
    const total = docs.reduce((a, d) => a + (parseTL(d.fee) ?? 0), 0);
    kpi.earn.set(total >= 1000 ? `₺${(total / 1000).toFixed(1)}K` : total > 0 ? tl(total) : "₺0");
    const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
    kpi.month.set(String(docs.filter((d) => (d.updatedAt?.toMillis?.() ?? 0) >= som.getTime()).length));
    // Yaklaşan Performanslar
    const gigs = upcomingGigs();
    if (!gigs.length) gigBox.replaceChildren(h("div", { class: cls("emptyrow is-inlist") }, svgRaw(I.cal, { size: 18, sw: "1.8" }), "Onaylı performans yok"));
    else gigBox.replaceChildren(...gigs.map((g) => h("div", { class: cx(cls("gig"), "dk-fade") },
      h("span", { class: cls("gdot"), "aria-hidden": "true" }),
      h("span", { class: cls("gcol") }, h("span", { class: cls("gv") }, g.venue), h("span", { class: cls("gd") }, `${g.date} • ${g.time}`)),
      h("span", { class: cls("gfee") }, g.fee))));
    greetDraw();
    drawCal();
  }

  // Odak koruması: yeniden çizimde odak şeritteyse aynı öğeye (data-fk) döner; bir karar bittiğinde (st.resFocus) kabul edilen
  // anlaşmanın AKTİF kartına / sonraki bekleyen kartın ilk düğmesine / "Takvim" bağlantısına taşınır (odak <body>'ye düşmesin).
  function drawStages() {
    const ae = document.activeElement;
    const fk = ae && ae !== document.body && stageBox.contains(ae) ? (ae.dataset?.fk || "") : null;
    const list = st.residencies || [];
    const pending = list.filter((r) => r.status === "pending");
    const active = list.filter((r) => r.status === "active");
    const kids = [];
    const resBtn = (r, action, label, variant) => h("button", {
      type: "button", class: cx(cls(`tbtn ${variant}`), "dk-press"), "aria-disabled": st.resBusy ? "true" : null,
      dataset: { fk: `${r.id}|${action}` }, onclick: () => respondRes(r, action),
    }, label);
    if (pending.length) {
      kids.push(h("div", { class: cx(cls("pend"), "dk-fade") },
        h("span", { class: cls("pendt") }, svgRaw(I.clock, { size: 15, sw: "2" }), `${pending.length} yeni sahne anlaşması teklifi`),
        ...pending.map((r) => h("div", { class: cls("pendit") },
          h("div", { class: cls("pendb") },
            h("span", { class: cls("pv") }, r.venueName || "Mekan"),
            h("span", { class: cls("pm") }, `${formatDays(r.daysOfWeek)} · ${r.time}${r.fee ? ` · ${tl(r.fee)}/gece` : ""}`),
            h("span", { class: cls("pp") }, `${dotISO(r.startDate)} – ${dotISO(r.endDate)}`)),
          h("div", { class: cls("pacts") }, resBtn(r, "rejected", "Reddet", "is-outline"), resBtn(r, "active", "Kabul Et", "is-primary"))))));
    }
    if (!active.length && !pending.length) {
      kids.push(h("div", { class: cls("emptyrow") }, svgRaw(I.bldg, { size: 18, sw: "1.8" }), "Aktif sahne anlaşman yok"));
    } else {
      active.slice(0, 2).forEach((r) => kids.push(h("a", { href: "#/artist/sahnelerim", class: cls("res"), dataset: { fk: `res|${r.id}` } },
        h("span", { class: cls("resic"), "aria-hidden": "true" }, svgRaw(I.bldg, { size: 18, sw: "1.9" })),
        h("span", { class: cls("rescol") }, h("span", { class: cls("pv") }, r.venueName || "Mekan"), h("span", { class: cls("resm") }, `${formatDays(r.daysOfWeek)} · ${r.time} · bitiş ${dotISO(r.endDate)}`)),
        h("span", { class: cls("aktif") }, "AKTİF"))));
    }
    stageBox.replaceChildren(...kids);
    // odaklı öğe hâlâ varsa ona; yoksa (kart karar/anlık görüntüyle kalktı) kabul edilen anlaşmanın AKTİF kartı → sonraki bekleyen
    // kartın ilk düğmesi → ilk aktif kart → "Takvim". Karar sürerken (gecikme telafili anlık görüntü) de aynı hedef hemen seçilir.
    let target = fk ? stageBox.querySelector(`[data-fk="${CSS.escape(fk)}"]`) : null;
    if (!target && (fk != null || st.resFocus)) {
      const f = st.resFocus;
      target = (f?.action === "active" && stageBox.querySelector(`[data-fk="${CSS.escape("res|" + f.id)}"]`))
        || stageBox.querySelector(`.${P}-pendit button`) || stageBox.querySelector(`a.${P}-res`) || stageLink;
    }
    if (!st.resBusy) st.resFocus = null;
    if (target && document.activeElement !== target) { try { target.focus({ preventScroll: true }); } catch (_) {} }
  }

  // Rezidans kabul/ret — legacy renderStages.respond() birebir (bildirim metinleri + syncResidentDenorm)
  async function respondRes(r, action) {
    if (st.resBusy) return;
    // meşgul durumu yerinde işaretlenir (düğme DOM'da ve odakta kalır); kilit legacy'deki gibi tüm kartlar için
    st.resBusy = true;
    st.resFocus = stageBox.contains(document.activeElement) ? { id: r.id, action } : null;
    stageBox.querySelectorAll(`.${P}-pendit button`).forEach((b) => b.setAttribute("aria-disabled", "true"));
    try {
      await setResidencyStatus(r.id, action, uid);
      syncResidentDenorm(uid).catch(() => {});
      pushAppNotification({
        toUserId: r.venueId, fromUserId: uid, fromName: name, type: "residency_update",
        title: action === "active" ? "Anlaşma Kabul Edildi 🎉" : "Anlaşma Reddedildi",
        body: action === "active"
          ? `${name}, uzun dönem sahne anlaşmanızı kabul etti (${formatDays(r.daysOfWeek)} · ${r.time}).`
          : `${name}, uzun dönem sahne anlaşma teklifinizi reddetti.`,
      }).catch(() => {});
      if (action === "active") dkToast("Anlaşma aktif — sahne takvimine eklendi", { type: "ok" });
      else dkToast("Teklif reddedildi", { type: "err" });
    } catch (_) { dkToast("İşlem tamamlanamadı. İnternet bağlantını kontrol et.", { type: "err" }); }
    finally { st.resBusy = false; if (alive) drawStages(); }
  }

  // ── 14 günlük şerit ──
  function calEntries() {
    const t0 = todayStart();
    const end = new Date(t0); end.setDate(end.getDate() + 13); end.setHours(23, 59, 59, 999);
    const map = new Map();
    const push = (iso, e) => { const l = map.get(iso) || []; l.push(e); map.set(iso, l); };
    (st.residencies || []).filter((r) => r.status === "active").forEach((r) => {
      expandOccurrences(r, t0, end).forEach((iso) => push(iso, { c: C.res, text: `${r.venueName || "Mekan"}${r.time ? ` · ${r.time}` : ""} · Uzun dönem` }));
    });
    (st.accepted || []).forEach((d) => {
      const iso = toISOKey(d.eventDate);
      if (!iso) return;
      const dd = new Date(`${iso}T00:00`);
      if (dd >= t0 && dd <= end) push(iso, { c: C.gig, text: `${d.venueName ?? "Mekan"}${d.eventTime ? ` · ${d.eventTime}` : ""} · Etkinlik` });
    });
    return map;
  }
  const dayBtns = [];
  let calDays = [];
  let calMap = new Map();
  // Veri değişince şerit yeniden kurulur (odak şeritteyse seçili güne geri döner); gün seçimi düğümleri YERİNDE günceller
  // (tıklanan düğme DOM'da kalır → odak + .dk-press basma geri bildirimi korunur).
  function drawCal() {
    const hadFocus = dayGrid.contains(document.activeElement);
    calMap = calEntries();
    const t0 = todayStart();
    calDays = Array.from({ length: 14 }, (_, i) => { const d = new Date(t0); d.setDate(d.getDate() + i); return d; });
    dayBtns.length = 0;
    dayGrid.replaceChildren(...calDays.map((d, i) => {
      const iso = toISODate(d);
      const ent = calMap.get(iso) || [];
      const b = h("button", {
        type: "button", class: cx(cls("day"), i === 0 && "is-today", "dk-press"),
        "aria-label": `${d.getDate()} ${MONTHS_TR[d.getMonth()]}, ${ent.length ? ent.length + " sahne" : "boş"}`,
      },
      h("span", { class: cls("dow"), style: i === 0 ? { color: "#FF4FA3" } : null }, i === 0 ? "BUGÜN" : DOW_UP[d.getDay()]),
      h("span", { class: cls("dd") }, String(d.getDate())),
      h("span", { class: cls("dots") }, ...ent.map((e) => h("span", { class: cls("dot"), style: { background: e.c } }))));
      b.addEventListener("click", () => pickDay(i, false));
      b.addEventListener("keydown", (e) => {
        const k = e.key;
        let n = null;
        if (k === "ArrowRight" || k === "ArrowDown") n = Math.min(13, i + 1);
        else if (k === "ArrowLeft" || k === "ArrowUp") n = Math.max(0, i - 1);
        else if (k === "Home") n = 0; else if (k === "End") n = 13;
        if (n == null) return;
        e.preventDefault(); pickDay(n, true);
      });
      dayBtns.push(b);
      return b;
    }));
    markDay();
    if (hadFocus) { try { dayBtns[st.day]?.focus({ preventScroll: true }); } catch (_) {} }
  }
  function markDay() {
    dayBtns.forEach((b, i) => {
      const sel = i === st.day;
      b.classList.toggle("is-sel", sel);
      b.setAttribute("aria-pressed", sel ? "true" : "false");
      b.tabIndex = sel ? 0 : -1;
    });
    const sd = calDays[st.day] || calDays[0];
    const ent = calMap.get(toISODate(sd)) || [];
    dayBar.replaceChildren(
      h("span", { class: cls("daytitle") }, trUpper(`${sd.getDate()} ${MONTHS_TR[sd.getMonth()]} · ${DOW_LONG[sd.getDay()]}`)),
      h("span", { class: cls("daydiv"), "aria-hidden": "true" }),
      ent.length
        ? h("div", { class: cls("dayents") }, ...ent.map((e) => h("span", { class: cls("dayent") }, h("span", { class: cls("edot"), style: { background: e.c } }), e.text)))
        : h("span", { class: cls("dayempty") }, "Bu gün için planlanmış sahne yok."));
  }
  function pickDay(i, focus) {
    st.day = i;
    markDay();
    if (focus) { try { dayBtns[i]?.focus(); } catch (_) {} }
  }
  drawCal();

  // ═════════ VERİ ═════════
  drawCompletion(profile);
  if (uid) {
    unsubs.push(listenArtistOffers(uid, (list) => {
      if (!alive) return;
      st.offers = (list || []).slice();
      cacheOffers(st.offers);
      drawOffers();
    }));
    unsubs.push(listenArtistAccepted(uid, (docs) => {
      if (!alive) return;
      st.accepted = docs || [];
      drawAccepted();
    }));
    unsubs.push(listenArtistResidencies(uid, (list) => {
      if (!alive) return;
      st.residencies = list || [];
      drawStages();
      drawCal();
    }));
    // hata → legacy renderHome gibi "—" kalır (uydurma 0 yok)
    getUser(uid).then((u) => { if (alive) kpi.foll.set(kFmt(u?.followerCount ?? 0)); }).catch(() => { if (alive) kpi.foll.set("—"); });
    artistReviews(uid).then((list) => { if (!alive) return; st.reviews = list || []; drawRatings(); })
      .catch(() => { if (!alive) return; drawRatingsError(); });
  }

  return {
    node: shell.node,
    destroy() {
      alive = false;
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
    // Aynı kimlikle oturum yayını: profil değişmediyse yerinde kal (dinleyiciler/seçili gün korunur); değiştiyse yeniden kur
    onSession(ns) {
      if (ns?.user?.uid !== uid) return false;
      return JSON.stringify(ns.profile || {}) === st.profileKey;
    },
  };
}
