// WebEtkinlik — masaüstü etkinlik detayı (≥769 px). Registry anahtarı: etkinlik (#/etkinlik/:id).
// Spec: specs/public-b.md "WebEtkinlik" (artboard design/WebEtkinlik.dc.html; sahibinin CLAUDE CODE notu YOK).
// CSS: css/dk-etkinlik.css — tüm seçiciler .dk-etkinlik kökü (ve .dk-etkinlik-* alt sınıfları) altında.
// ≤768 px legacy js/pages/customer.js eventDetail() AYNEN kalır (router bu modülü orada yüklemez).
//
// Legacy eventDetail özellikleri (hepsi korundu, tasarıma yerleştirildi):
//   · afiş + karartma (→ hero, Ken Burns) · geri düğmesi (→ breadcrumb) · kalp favori (→ hero kalbi + bilet kartı "Favorilere ekle",
//     tek durum; favEvent/unfavEvent + "Favorilere eklendi"/"Favoriden çıkarıldı"/"İşlem başarısız") · VIP DENEYİM rozeti (→ 3. hero çipi)
//   · tür çipi (+ "Tür belirtilmemiş") · başlık · meta: sanatçı ("Sanatçı henüz açıklanmadı"), mekan, organizatör, tarih/saat
//   · 3 istatistik: Katılımcı / Bilet (₺ | Ücretsiz) / Durum (Sıcak ≥10 | Yeni) · "Etkinlik hakkında" ("Açıklama eklenmemiş.")
//   · Mekan kartı → #/mekan/:id + Değerlendir · Sanatçı kartı (yalnız artistName varsa) → #/sanatci/:id + Değerlendir
//   · konum doğrulama kartı (yalnız katılıyorsa; geolocation + haversine ≤150 m; 4 legacy durum + yenile)
//   · katılımcı önizlemesi → #/katilimcilar/:id ("Henüz katılımcı yok") · Katıl/Katılıyorum (attendEvent/unattendEvent, aynı yazımlar:
//     anonymousAttendance bayrağı, kontenjan ön kontrolü "Kontenjan dolu", "Yükleniyor...", "Katıldın! 🎉"/"Katılım iptal edildi")
//   · Puan & Yorum modalı (submitArtistReview/submitVenueReview; "Puan seç", "Yorum en az 10 karakter olmalı", "Yorumun gönderildi",
//     "Gönderilemedi") · misafir kapıları (dkLoginGate: "Etkinliğe katılmak", "Favorilere eklemek", "Değerlendirme yapmak").
// Yeni (tasarım): breadcrumb, paylaş (pano), yapışkan bilet kartı + "Bileti gör · Biletlerim", harita önizlemesi (Leaflet, statik) +
//   "Yol tarifi" (Google Maps), katılımcı avatar yığını, etkinliğin sanatçı+mekan yorumları, Benzer etkinlikler, geçmiş/dolu durumları.
// Uygulama paritesi eki: bilet kapıda okutulduysa (attendee.ticketStatus === "used") katılım iptal edilemez (kurallar silmeyi reddeder)
//   → düğme "Giriş yapıldı" (pasif) + doğrulama kartı "Girişin onaylandı" (app EventDetailScreen ile aynı davranış).
// Panel rolleri (sanatçı/mekan/organizatör/yönetici; masaüstünde herkese açık sayfaları SALT-OKUMA görür): katıl/favori/değerlendir yok
//   (submitArtistReview authorType "customer" yazar → panel hesabı dinleyici yorumu gibi görünmesin).
//
// Veri (okuma): eventById · attendees/{uid} getDoc (katılım + bilet durumu; isAttending ile aynı okuma) · isFavEvent
//   · userById(venueId) (mekan alt satırı) · attendees orderBy(joinedAt desc) limit 20 (yığın; tek-alan indeksi)
//   · artistReviews + getVenueReviews (legacy venueDetail görünürlük kuralları) · discoverEvents (Benzer; 5 dk modül önbelleği).
//   Tarih/saat her zaman İstanbul saatiyle gösterilir (evWhen).
// Yazım: yalnız data.js'in mevcut fonksiyonları (legacy/app ile aynı şekil). Bileşik indeks YOK.
import { h, loadLeaflet } from "../../ui.js";
import { session } from "../../store.js";
import {
  eventById, userById, attendEvent, unattendEvent, isFavEvent, favEvent, unfavEvent,
  artistReviews, getVenueReviews, submitArtistReview, submitVenueReview, updateMyReview, discoverEvents,
} from "../../data.js";
import { db, doc, getDoc, getDocs, collection, query, orderBy, limit } from "../../firebase.js";
import { publicShell, headerVariant } from "../shared/public-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { cx, dkBreadcrumb, dkGenreTag, dkKpi, dkSectionHead, dkEmpty, dkSkeleton, dkModal, dkToast, dkLoginGate, dkStars } from "../shared/ui.js";
import { eventCard } from "../shared/cards.js";
import { invalidateAccountCounts } from "../shared/live.js";
import { SITE_HOST } from "../shared/assets.js";
import {
  eventStartMs, isEventOver, isLive, toMs, fmtPrice, fmtInt, fmtRating, fold, initials, sameCity,
  haversineKm, latLngOf, directionsUrl, MONTHS_TR_SHORT, DAYS_TR_SHORT, AVATAR_GRADS, eventGenres,
} from "../shared/helpers.js";
import { genreFamily, genreFamilyKey, primaryGenre } from "../shared/genres.js";

// ── Artboard SVG gövdeleri (birebir; registry'deki eşdeğerlerinden farklı olanlar) ──
const P = {
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.4-7.5 10.4z"></path>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"></path><path d="M5 12v7.5h14V12"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  clock: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
  flame: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.3 2.4-5.4 3.6-8.3.6 1.9 1.6 3 2.9 3.6.2-2.6 1.3-4.9 3.3-6.6.2 3.3 3.2 5.7 3.2 10 0 4-2.6 7.5-6.5 7.5z"></path>',
  chevron: '<path d="m9 6 6 6-6 6"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  nav: '<path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.6 1.6 6.6c.2.8 1.3.9 1.6.1z"></path>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"></path>',
  note: '<path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  people: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"></path>',
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
};
const ic = (k, size, sw, color, extra = {}) => svgRaw(P[k], { size, sw, color, ...extra });

// Avatar gradyanları: legacy customer.js AVATAR_PALETTES (12 çift; artboard AV = ilk 7) — SHARED-CANDIDATE: WebKatilimcilar da kullanır
const AV = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#EC4899", "#BE185D"], ["#06B6D4", "#0891B2"], ["#F97316", "#EA580C"], ["#6366F1", "#4F46E5"], ["#14B8A6", "#0D9488"], ["#A855F7", "#9333EA"], ["#84CC16", "#65A30D"], ["#FB7185", "#E11D48"]]
  .map(([a, b]) => `linear-gradient(135deg,${a},${b})`);
const avHash = (s) => { let n = 0; for (const c of String(s || "")) n += c.charCodeAt(0); return AV[n % 7]; };
// Sanatçı avatarı: legacy customer.js GENRE_GRADS (artboard: Jazz → #F59E0B→#D97706). SHARED-CANDIDATE: legacy tür gradyanı genres.js'te yok.
const LEGACY_GENRE_GRADS = { jazz: ["#F59E0B", "#D97706"], electronic: ["#06B6D4", "#0891B2"], rock: ["#EF4444", "#B91C1C"], pop: ["#EC4899", "#BE185D"], akustik: ["#10B981", "#059669"], "hip-hop": ["#6366F1", "#4F46E5"], "r&b": ["#A855F7", "#7C3AED"], techno: ["#8B5CF6", "#6D28D9"], house: ["#F97316", "#EA580C"], klasik: ["#14B8A6", "#0D9488"] };
const legacyGrad = (g) => { const [a, b] = LEGACY_GENRE_GRADS[fold(g)] || ["#A855F7", "#7C3AED"]; return `linear-gradient(135deg, ${a}, ${b})`; };
const VENUE_GRAD = "linear-gradient(135deg, #0D3B5E, #1A5276)";   // legacy mekan infoCard sabiti

// ── Tarih biçimleri (artboard: sıfırsız gün) — HER ZAMAN İstanbul saati ──
// Etkinlik saatleri İstanbul duvar saatidir (app/legacy ev.dateKey + ev.startTime yazar/gösterir); tarayıcının saat dilimi
// (ör. New York'tan bakan) tarih/saati kaydırmamalı. SHARED-CANDIDATE: helpers.fmtTime/isToday + cards.js kicker yerel saat
// dilimini kullanıyor; helpers.js'e TZ'li biçimleyiciler (istParts/istDayKey) eklenmeli.
const TZ = "Europe/Istanbul";
const pad2 = (n) => String(n).padStart(2, "0");
let _istFmt = null;
function istParts(ms) {   // → { y, m (1-12), d, hh, mm } İstanbul saatiyle
  try {
    _istFmt ||= new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = {}; for (const x of _istFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: +p.year, m: +p.month, d: +p.day, hh: pad2(+p.hour % 24), mm: p.minute };
  } catch (_) { const d = new Date(ms); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: pad2(d.getHours()), mm: pad2(d.getMinutes()) }; }
}
// Etkinliğin İstanbul duvar saati: eventAt (eventStartMs) → İstanbul; yoksa kayıtlı dateKey/startTime (dönüştürmeden)
function evWhen(ev) {
  if (ev?.eventAt && typeof ev.eventAt.toMillis === "function") { const ms = ev.eventAt.toMillis(); if (!isNaN(ms)) { const p = istParts(ms); return { ...p, time: `${p.hh}:${p.mm}` }; } }
  const dk = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ev?.dateKey || ""));
  const st = /^(\d{1,2}):(\d{2})/.exec(String(ev?.startTime || ""));
  if (dk) return { y: +dk[1], m: +dk[2], d: +dk[3], time: st ? `${pad2(st[1])}:${st[2]}` : "" };
  const ms = eventStartMs(ev);
  if (ms == null) return null;
  const p = istParts(ms);
  return { ...p, time: st ? `${pad2(st[1])}:${st[2]}` : `${p.hh}:${p.mm}` };
}
const dayKey = (p) => (p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : "");
const dayMonYearP = (p) => `${p.d} ${MONTHS_TR_SHORT[p.m - 1]} ${p.y}`;
const weekdayLongP = (p) => `${DAYS_TR_SHORT[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]}, ${dayMonYearP(p)}`;
const dayMonYear = (ms) => dayMonYearP(istParts(ms));

// ── Benzer etkinlikler: discoverEvents 5 dk modül önbelleği (her görüntülemede tüm "upcoming" taramasını tekrarlamasın) ──
// SHARED-CANDIDATE: Keşfet/Landing/Akış aynı discoverEvents okumasını ayrı ayrı yapıyor → ortak önbellek live.js'te olmalı.
let _upcoming = null, _upcomingAt = 0;
function upcomingEvents() {
  if (_upcoming && Date.now() - _upcomingAt < 300000) return _upcoming;
  _upcomingAt = Date.now();
  _upcoming = discoverEvents().catch((e) => { _upcoming = null; throw e; });
  return _upcoming;
}

// ── Katılımcı okumaları (modül içi; data.js eventAttendees TÜM alt koleksiyonu okur → büyük etkinlikte yüzlerce okuma) ──
// Önizleme yalnız en yeni 20 kayıt (joinedAt tek alan sıralaması → otomatik tek-alan indeksi; bileşik indeks YOK);
// kendi kaydım (katılım + bilet durumu) tek getDoc (legacy isAttending ile aynı okuma, ticketStatus da gelir).
async function recentAttendees(eventId) {
  const s = await getDocs(query(collection(db, "events", eventId, "attendees"), orderBy("joinedAt", "desc"), limit(20)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function myAttendee(eventId, uid) {
  const s = await getDoc(doc(db, "events", eventId, "attendees", uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

const myName = () => session.profile?.displayName || session.user?.displayName || "Kullanıcı";
const shareUrl = (id) => `https://${SITE_HOST}/#/etkinlik/${encodeURIComponent(id)}`;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
  // yedek: gizli textarea + execCommand (izin verilmeyen bağlamlar)
  try {
    const ta = h("textarea", { style: { position: "fixed", top: "-100px", left: "0", opacity: "0" }, readonly: true });
    ta.value = text; document.body.append(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch (_) { return false; }
}

// Rota değişiminde sayfa başına dön (router kaydırmayı sıfırlamıyor; "Benzer etkinlikler" kartı sayfanın dibinden açılır).
// Aynı etkinliğin yeniden kurulumunda (oturum/mod geçişi) kaydırma korunur.
let _mountedId = null;

export function etkinlikView(ctx) {
  const id = ctx.seg?.[2] || "";
  const base = ctx.base || location.hash.split("?")[0];
  if (_mountedId !== id) { try { window.scrollTo(0, 0); } catch (_) {} }
  _mountedId = id;
  const shell = publicShell({ active: "etkinlikler" });
  const root = h("div", { class: "dk-etkinlik" });
  shell.main.append(root);

  let alive = true;
  const cleanups = [];
  let openModal = null;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); cleanups.push(() => clearTimeout(t)); return t; };

  // ── yükleniyor iskeleti (".loading" işareti: legacy mount/araç sözleşmesi) ──
  const skeleton = () => h("div", { class: "dk-etkinlik-skel", "aria-busy": "true" },
    h("span", { class: "loading dk-sr" }, "Yükleniyor"),
    h("div", { class: "dk-etkinlik-skel-crumb" }, dkSkeleton({ w: 220, h: 12, r: 4 })),
    dkSkeleton({ w: "auto", h: 480, r: 14, cls: "dk-etkinlik-skel-hero" }),
    h("div", { class: "dk-etkinlik-main" },
      h("div", { class: "dk-etkinlik-col" },
        h("div", { class: "dk-etkinlik-kpis" }, dkSkeleton({ h: 96, r: 10 }), dkSkeleton({ h: 96, r: 10 }), dkSkeleton({ h: 96, r: 10 })),
        h("div", { class: "dk-etkinlik-sec" }, dkSkeleton({ w: 280, h: 34, r: 6 }), dkSkeleton({ h: 14 }), dkSkeleton({ w: "92%", h: 14 }), dkSkeleton({ w: "70%", h: 14 }))),
      h("div", { class: "dk-etkinlik-aside" }, dkSkeleton({ h: 520, r: 14 }))));
  root.append(skeleton());

  const showState = (node) => { root.replaceChildren(h("div", { class: "dk-etkinlik-state" }, node)); };
  const notFound = () => showState(dkEmpty({
    icon: "alertCircle", title: "Etkinlik bulunamadı", variant: "dashed",
    action: h("a", { href: "#/etkinlikler", class: "dk-etkinlik-state-link" }, "Etkinliklere dön", svgIcon("arrowRight", { size: 15 })),
  }));
  const loadError = () => showState(dkEmpty({
    icon: "alertTriangle", title: "Bir sorun oldu", sub: "Bağlantını kontrol edip tekrar dene.", variant: "dashed",
    action: h("button", { type: "button", class: "dk-etkinlik-state-link", onclick: () => { root.replaceChildren(skeleton()); load(); } }, "Tekrar dene", svgIcon("refresh", { size: 15 })),
  }));

  async function load() {
    if (!id) { notFound(); return; }
    let ev;
    try { ev = await eventById(id); } catch (_) { if (alive) loadError(); return; }
    if (!alive) return;
    if (!ev) { notFound(); return; }
    const variant = headerVariant(session);       // guest | customer | panel
    const canAct = variant === "customer";
    const uid = session.user?.uid || null;
    const [mineR, favR, venueR, attendeesR, aRevR, vRevR] = await Promise.allSettled([
      canAct && uid ? myAttendee(id, uid) : Promise.resolve(null),
      canAct ? isFavEvent(uid, id) : Promise.resolve(false),
      ev.venueId ? userById(ev.venueId) : Promise.resolve(null),
      recentAttendees(id),
      ev.artistId ? artistReviews(ev.artistId) : Promise.resolve([]),
      ev.venueId ? getVenueReviews(ev.venueId) : Promise.resolve([]),
    ]);
    if (!alive) return;
    const val = (r, d) => (r.status === "fulfilled" ? r.value : d);
    const mine = val(mineR, null);
    const reviewsFailed = aRevR.status === "rejected" && vRevR.status === "rejected";
    render(ev, {
      variant, canAct, uid,
      attending: canAct && !!mine,
      fav: !!val(favR, false),
      venue: val(venueR, null),
      attendees: val(attendeesR, null) || [],
      ticketUsed: !!(mine && mine.ticketStatus === "used"),
      aRevs: val(aRevR, []), vRevs: val(vRevR, []), reviewsFailed,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  function render(ev, st) {
    const { canAct, uid } = st;
    const title = ev.title || "Etkinlik";
    const g = primaryGenre(ev);
    const when = evWhen(ev);                        // İstanbul duvar saati (tarayıcı saat diliminden bağımsız)
    const over = isEventOver(ev);
    const tonight = !over && (isLive(ev) || (!!when && dayKey(when) === dayKey(istParts(Date.now()))));
    const venueName = ev.venueName || "Mekan";
    const city = (ev.city || ev.location?.city || "").trim();
    const ll = latLngOf(ev);
    let att = st.attending, favd = st.fav, count = Number(ev.attendeeCount) || 0, ticketUsed = st.ticketUsed;
    let busyJoin = false, busyFav = false;
    const isFullNow = () => !!(ev.capacity && count >= ev.capacity);

    // ── Breadcrumb ──
    const crumb = dkBreadcrumb({ variant: "text", cls: "dk-etkinlik-crumb", items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Etkinlikler", href: "#/etkinlikler" }, { label: title }] });

    // ── Hero ──
    const heroFav = h("button", { type: "button", class: "dk-etkinlik-hbtn dk-press dk-press-o" });
    const heroShare = h("button", { type: "button", class: "dk-etkinlik-hbtn dk-press dk-press-o", "aria-label": "Paylaş" }, ic("share", 18, "1.9"));
    const media = ev.bannerUrl && !ev.bannerCleaned
      ? h("img", { class: "dk-etkinlik-hero-img dk-kb", src: ev.bannerUrl, alt: `${title}, ${venueName} sahnesi`, decoding: "async" })
      : null;
    const fam = genreFamily(g);
    const ph = () => h("span", { class: "dk-etkinlik-hero-ph", style: { background: `linear-gradient(135deg, ${fam.color}55, ${fam.dark}22), #0E1014` }, "aria-hidden": "true" });
    if (media) media.addEventListener("error", () => media.replaceWith(ph()), { once: true });
    const chips = h("div", { class: "dk-etkinlik-chips" },
      tonight ? h("span", { class: "dk-etkinlik-live" },
        h("span", { class: "dk-etkinlik-live-dot", "aria-hidden": "true" }, h("span", { class: "dk-ping" }), h("span", {})), "BU GECE") : null,
      g ? dkGenreTag(g, { variant: "hero" }) : h("span", { class: "dk-etkinlik-chip-muted" }, "TÜR BELİRTİLMEMİŞ"),
      (ev.vipStatus === "approved" || ev.isVip) ? h("span", { class: "dk-etkinlik-vip" }, svgIcon("sparkles", { size: 12, sw: "2" }), "VIP DENEYİM") : null);
    const metaItem = (icon, text, dim) => h("span", { class: cx(dim && "is-dim") }, icon, text);
    const whenTxt = when ? [dayMonYearP(when), when.time].filter(Boolean).join(" · ") : [ev.date, ev.startTime].filter(Boolean).join(" · ");
    const meta = h("div", { class: "dk-etkinlik-meta" },
      ev.artistName ? metaItem(ic("mic", 16, "1.9", "#FF4FA3"), ev.artistName) : metaItem(ic("mic", 16, "1.9", "#FF4FA3"), "Sanatçı henüz açıklanmadı", true),
      metaItem(ic("pin", 16, "1.9", "#FF8A2A"), [venueName, city].filter(Boolean).join(", ")),
      whenTxt ? metaItem(ic("clock", 16, "1.9", "#4ED8FF"), whenTxt) : null,
      ev.organizerName ? metaItem(svgIcon("building", { size: 16, sw: "1.9", color: "#A78BFA" }), ev.organizerName) : null);
    const hero = h("section", { class: "dk-etkinlik-hero dk-rise", "aria-labelledby": "dk-etk-h1" },
      media || ph(),
      h("span", { class: "dk-etkinlik-hero-scrim", "aria-hidden": "true" }),
      h("div", { class: "dk-etkinlik-hero-acts" }, canAct || st.variant === "guest" ? heroFav : null, heroShare),
      h("div", { class: "dk-etkinlik-hero-body" }, chips,
        h("h1", { id: "dk-etk-h1", class: cx("dk-etkinlik-title", title.length > 56 && "is-long") }, title), meta));

    // ── KPI ──
    const kpiCount = dkKpi({ label: "KATILIMCI", value: fmtInt(count), variant: "card" });
    const kpiPrice = dkKpi({ label: "BİLET", value: fmtPrice(ev.ticketPrice), variant: "card" });
    const statusKpi = () => {
      if (isFullNow() && !att && !over) return dkKpi({ label: "DURUM", value: "Dolu", variant: "card", valueColor: "#FF5A6E" });
      return count >= 10
        ? dkKpi({ label: "DURUM", value: "Sıcak", variant: "card", valueColor: "#7CE0B0", valueIcon: ic("flame", 22, "1.9") })
        : dkKpi({ label: "DURUM", value: "Yeni", variant: "card", valueColor: "#A78BFA", valueIcon: svgIcon("sparkles", { size: 22, sw: "1.9" }) });
    };
    let kpiStatus = statusKpi();
    const kpis = h("div", { class: "dk-etkinlik-kpis" }, kpiCount, kpiPrice, kpiStatus);

    // ── Etkinlik hakkında ──
    const paras = String(ev.description || "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    const about = h("section", { class: "dk-etkinlik-sec dk-etkinlik-about", "aria-labelledby": "dk-etk-about" },
      h("h2", { id: "dk-etk-about", class: "dk-etkinlik-h2" }, "Etkinlik hakkında"),
      ...(paras.length ? paras.map((p) => h("p", {}, p)) : [h("p", { class: "is-dim" }, "Açıklama eklenmemiş.")]));

    // ── Sanatçı + mekan + harita ──
    const rateBtn = (kind) => h("button", { type: "button", class: "dk-etkinlik-rate dk-press", onclick: () => openReview(kind) },
      ic("star", 15, "1.9", "#FFD700"), "Değerlendir");
    const entCard = ({ href, av, name, sub }) => {
      const inner = [av, h("span", { class: "dk-etkinlik-ent-t" }, h("span", { class: "dk-etkinlik-ent-n" }, name), h("span", { class: "dk-etkinlik-ent-s" }, sub)),
        href ? ic("chevron", 18, "2", "#8A8E97", { cls: "dk-etkinlik-ent-chev" }) : null];
      return href ? h("a", { href, class: "dk-etkinlik-ent is-link" }, ...inner) : h("div", { class: "dk-etkinlik-ent" }, ...inner);
    };
    const artistCol = ev.artistName ? h("div", { class: "dk-etkinlik-pcol" },
      h("span", { class: "dk-etkinlik-lbl" }, "SANATÇI"),
      entCard({
        href: ev.artistId ? "#/sanatci/" + encodeURIComponent(ev.artistId) : null,
        av: h("span", { class: "dk-etkinlik-ent-av is-artist", style: { background: legacyGrad(g) }, "aria-hidden": "true" }, initials(ev.artistName)),
        name: ev.artistName, sub: g || "Müzik",
      }),
      canAct || st.variant === "guest" ? (ev.artistId ? rateBtn("artist") : null) : null) : null;
    const v = st.venue;
    const vRating = fmtRating(v?.avgRating);
    const vSub = v ? [v.city || city, vRating ? `★ ${vRating}` : null, v.capacity ? `${v.capacity} kişi` : null].filter(Boolean).join(" · ") : "";
    const venueCol = h("div", { class: cx("dk-etkinlik-pcol", !artistCol && "is-wide") },
      h("span", { class: "dk-etkinlik-lbl" }, "MEKAN"),
      entCard({
        href: ev.venueId ? "#/mekan/" + encodeURIComponent(ev.venueId) : null,
        av: h("span", { class: "dk-etkinlik-ent-av is-venue", style: { background: VENUE_GRAD }, "aria-hidden": "true" }, initials(venueName)),
        name: venueName, sub: vSub || city || "Mekan profilini görüntüle",
      }),
      canAct || st.variant === "guest" ? (ev.venueId ? rateBtn("venue") : null) : null);
    const people = h("section", { class: "dk-etkinlik-people", "aria-labelledby": "dk-etk-people" },
      h("h2", { id: "dk-etk-people", class: "dk-sr" }, "Sanatçı ve mekan"),
      artistCol, venueCol, ll ? mapPanel(ll, venueName) : null);

    // ── Konum doğrulama kartı (yalnız katılıyorsa) ──
    const verSlot = h("div", { class: "dk-etkinlik-verslot" });
    const drawVer = () => {
      verSlot.replaceChildren();
      const show = canAct && att && !over;
      verSlot.hidden = !show;
      if (show) verSlot.append(verifyCard());
    };
    function verifyCard() {
      if (ticketUsed) {
        return h("div", { class: "dk-etkinlik-ver is-ok dk-pop", role: "status" },
          h("span", { class: "dk-etkinlik-ver-ic" }, svgIcon("checkDouble", { size: 20, sw: "2" })),
          h("span", { class: "dk-etkinlik-ver-t" }, h("span", { class: "dk-etkinlik-ver-h" }, "Girişin onaylandı"), h("span", { class: "dk-etkinlik-ver-m" }, "Biletin kapıda görevli tarafından okutuldu.")));
      }
      const t = h("span", { class: "dk-etkinlik-ver-h" }, "Konum doğrulaması");
      const m = h("span", { class: "dk-etkinlik-ver-m" }, "Konumun kontrol ediliyor...");
      const set = (a, b) => { t.textContent = a; m.textContent = b; };
      let runId = 0;
      // fresh = yenile düğmesi: önbellekteki konumu kullanma (legacy her yenilemede taze konum ister)
      const run = (fresh) => {
        const my = ++runId;
        set("Konum doğrulaması", "Konumun kontrol ediliyor...");
        if (!ll) return set("Etkinliğin konumu yok", "Konum yok — girişini kapıdaki QR ile uygulamadan yapabilirsin.");
        if (!navigator.geolocation) return set("Konum izni gerekli", "Tarayıcın konumu desteklemiyor; girişini uygulamadan doğrulayabilirsin.");
        navigator.geolocation.getCurrentPosition((pos) => {
          if (!alive || my !== runId || !card.isConnected) return;
          const dKm = haversineKm({ lat: pos.coords.latitude, lng: pos.coords.longitude }, ll);
          if (dKm <= 0.15) set("Etkinlik yerindesin", "Girişini kapıdaki QR kod ile uygulamadan doğrulayabilirsin.");
          else set("Etkinlik yerinde değilsin", `Etkinliğe ~${dKm < 1 ? Math.round(dKm * 1000) + " m" : dKm.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " km"} uzaktasın. QR ile girişi uygulama yapar.`);
        }, () => {
          if (!alive || my !== runId || !card.isConnected) return;
          set("Konum izni gerekli", "Tarayıcıdan konum iznini açabilir ya da girişini uygulamadan yapabilirsin.");
        }, { maximumAge: fresh ? 0 : 60000, timeout: 15000 });
      };
      const card = h("div", { class: "dk-etkinlik-ver dk-pop" },
        h("span", { class: "dk-etkinlik-ver-ic" }, ic("nav", 20, "1.9")),
        h("span", { class: "dk-etkinlik-ver-t", role: "status", "aria-live": "polite" }, t, m),
        h("button", { type: "button", class: "dk-etkinlik-ver-btn dk-press", "aria-label": "Konumu yeniden kontrol et", onclick: () => run(true) }, ic("refresh", 17, "2")));
      run(false);
      return card;
    }

    // ── Katılıyor (N) ──
    const attCountEl = h("span", {});
    const attLbl1 = h("span", { class: "dk-etkinlik-stack-l1" });
    const attLbl2 = h("span", { class: "dk-etkinlik-stack-l2" }, "Katılımcıları görmek için tıkla →");
    const stackEl = h("span", { class: "dk-etkinlik-stack", "aria-hidden": "true" });
    const others = st.attendees
      .filter((a) => !a.anonymous && (a.userId || a.id) !== uid)
      .sort((a, b) => ((toMs(b.joinedAt) || 0) - (toMs(a.joinedAt) || 0)) || String(a.id).localeCompare(String(b.id)))   // eşitlikte doküman kimliği (tam liste okumasıyla aynı sıra)
      .slice(0, 7);
    const meAv = () => {
      const p = session.profile || {};
      return p.photoURL
        ? h("img", { class: "dk-etkinlik-stack-me", src: p.photoURL, alt: "", decoding: "async" })
        : h("span", { class: "dk-etkinlik-stack-me is-ini", style: { background: AVATAR_GRADS.customer } }, initials(myName()));
    };
    const drawAtt = () => {
      attCountEl.textContent = ` (${fmtInt(count)})`;
      // replaceChildren null atlamaz (ui.js yaması yalnız append) → diziyi süz
      stackEl.replaceChildren(...[
        canAct && att ? meAv() : null,
        ...others.map((a, i) => h("span", { class: "dk-etkinlik-stack-av", style: { background: AV[i % AV.length] } }, initials(a.displayName || a.name || "K"))),
      ].filter(Boolean));
      stackEl.hidden = !stackEl.childNodes.length;
      if (count <= 0 && !(canAct && att)) { attLbl1.textContent = "Henüz katılımcı yok"; attLbl2.hidden = true; }
      else {
        attLbl2.hidden = false;
        attLbl1.textContent = canAct && att ? (count > 1 ? `Sen ve ${fmtInt(count - 1)} kişi daha katılıyor` : "Sen katılıyorsun") : `${fmtInt(count)} kişi katılıyor`;
      }
    };
    const attHref = "#/katilimcilar/" + encodeURIComponent(id);
    const attSec = h("section", { class: "dk-etkinlik-sec", "aria-labelledby": "dk-etk-att" },
      h("div", { class: "dk-etkinlik-sechead" },
        h("h2", { id: "dk-etk-att", class: "dk-etkinlik-h2" }, "Katılıyor", attCountEl),
        h("a", { href: attHref, class: "dk-etkinlik-more dk-link" }, "Tümünü gör", ic("chevron", 14, "2"))),
      h("a", { href: attHref, class: "dk-etkinlik-stackcard" }, stackEl, h("span", { class: "dk-etkinlik-stack-t" }, attLbl1, attLbl2)));

    // ── Yorumlar ve puanlar ──
    const artistName = ev.artistName || "Sanatçı";
    const custOnly = (r) => (r.authorType ?? "customer") === "customer";
    const visOf = (r) => r.visibility ?? (r.isAnonymous ? "anonymous" : "everyone");
    let revList = [
      ...st.aRevs.filter(custOnly).map((r) => ({ ...r, _kind: "artist", _name: r.authorName || "Kullanıcı", _rating: r.rating })),
      ...st.vRevs.filter((r) => (r.authorType ?? "customer") !== "artist" || visOf(r) !== "artists").map((r) => {
        const anon = (r.authorType ?? "customer") === "artist" && visOf(r) === "anonymous";
        return { ...r, _kind: "venue", _name: anon ? "Anonim Sanatçı" : (r.authorName || "Kullanıcı"), _rating: r.overallRating ?? r.rating };
      }),
    ];
    const myReview = (kind) => (kind === "artist" ? st.aRevs : st.vRevs).find((r) => r.authorId && r.authorId === uid) || null;
    const revMs = (r) => (r._fresh ? Date.now() : toMs(r.createdAt) || 0);
    const sortRevs = () => revList.sort((a, b) => ((b.eventId === id) - (a.eventId === id)) || (revMs(b) - revMs(a)));
    const revBox = h("div", { class: "dk-etkinlik-revs" });
    const reviewCard = (r) => {
      const artistPill = r._kind === "artist";
      return h("article", { class: cx("dk-etkinlik-rv", r._fresh && "dk-pop") },
        h("div", { class: "dk-etkinlik-rv-top" },
          h("span", { class: "dk-etkinlik-rv-av", style: { background: r._fresh ? AVATAR_GRADS.customer : avHash(r._name) }, "aria-hidden": "true" }, initials(r._name)),
          h("span", { class: "dk-etkinlik-rv-who" },
            h("span", { class: "dk-etkinlik-rv-n" }, r._name),
            h("span", { class: "dk-etkinlik-rv-d" }, r._fresh ? "Az önce" : (toMs(r.createdAt) ? dayMonYear(toMs(r.createdAt)) : ""))),
          dkStars(r._rating, { size: 14, gap: 2, empty: "none", emptyStroke: "#FFD700" })),
        h("div", { class: "dk-etkinlik-rv-tags" },
          h("span", { class: cx("dk-etkinlik-rv-tag", artistPill ? "is-artist" : "is-venue") }, artistPill ? `Sanatçı · ${artistName}` : `Mekan · ${venueName}`),
          r.event ? h("span", { class: "dk-etkinlik-rv-tag is-ev" }, ic("note", 11, "2"), h("span", { class: "dk-truncate" }, r.event)) : null),
        r.comment ? h("p", { class: "dk-etkinlik-rv-p" }, r.comment) : null);
    };
    const drawRevs = () => {
      sortRevs();
      const top = revList.slice(0, 3);
      revBox.replaceChildren(...(top.length ? top.map(reviewCard)
        : [dkEmpty({ icon: svgRaw(P.star, { size: 24, sw: "1.6" }), sub: "Henüz yorum yok.", variant: "dashed", compact: true, cls: "dk-etkinlik-rv-empty" })]));
    };
    const canReview = (canAct || st.variant === "guest") && (ev.venueId || ev.artistId);
    const revSec = st.reviewsFailed ? null : h("section", { class: "dk-etkinlik-sec", "aria-labelledby": "dk-etk-rev" },
      h("div", { class: "dk-etkinlik-sechead" },
        h("div", { class: "dk-etkinlik-rvhead" },
          h("h2", { id: "dk-etk-rev", class: "dk-etkinlik-h2" }, "Yorumlar ve puanlar"),
          h("span", { class: "dk-etkinlik-rvsub" }, "Bu etkinliğin sanatçısı ve mekanı için yapılan değerlendirmeler")),
        canReview ? h("button", { type: "button", class: "dk-etkinlik-addrv dk-press", onclick: () => openReview(ev.venueId ? "venue" : "artist") }, "+ Yorum yap") : null),
      revBox);

    // ── Bilet kartı (aside) ──
    const joinBtn = h("button", { type: "button", class: "dk-etkinlik-join dk-press dk-press-o" });
    const helpEl = h("span", { class: "dk-etkinlik-help" });
    const tixLink = h("a", { href: "#/biletlerim", class: "dk-etkinlik-tix" }, ic("qr", 15, "1.9"), "Bileti gör · Biletlerim");
    const favBtn = h("button", { type: "button", class: "dk-etkinlik-sbtn dk-press dk-press-o" });
    const shareBtn = h("button", { type: "button", class: "dk-etkinlik-sbtn dk-press dk-press-o" });
    const shareStat = h("span", { class: "dk-etkinlik-sstat", role: "status" });
    const rowCount = h("span", { class: "dk-etkinlik-row-v" });
    const row = (icon, label, value) => h("div", { class: "dk-etkinlik-row" }, icon, h("span", { class: "dk-etkinlik-row-l" }, label), value instanceof Node ? value : h("span", { class: "dk-etkinlik-row-v" }, value));
    const ticket = h("div", { class: "dk-etkinlik-ticket" },
      h("span", { class: "dk-etkinlik-ticket-bar dk-prism", "aria-hidden": "true" }),
      h("div", { class: "dk-etkinlik-price" },
        h("span", { class: "dk-etkinlik-price-l" }, "BİLET FİYATI"),
        h("span", { class: "dk-etkinlik-price-v" }, fmtPrice(ev.ticketPrice))),
      h("div", { class: "dk-etkinlik-rows" },
        row(ic("calendar", 17, "1.9", "#8A8E97"), "Tarih", when ? weekdayLongP(when) : (ev.date || "—")),
        row(ic("clock", 17, "1.9", "#8A8E97"), "Saat", when?.time || ev.startTime || "—"),
        row(ic("pin", 17, "1.9", "#8A8E97"), "Mekan", venueName),
        row(ic("people", 17, "1.9", "#8A8E97"), "Katılımcı", rowCount)),
      joinBtn, helpEl, tixLink,
      h("div", { class: cx("dk-etkinlik-sec2", !(canAct || st.variant === "guest") && "is-single") }, canAct || st.variant === "guest" ? favBtn : null, shareBtn),
      shareStat);
    const aside = h("aside", { class: "dk-etkinlik-aside", "aria-label": "Bilet" }, ticket,
      h("div", { class: "dk-etkinlik-note" }, ic("info", 17, "1.9", "#8A8E97", { cls: "dk-etkinlik-note-ic" }),
        h("span", {}, "Kapıda girişini GigBridge uygulamasındaki QR kod ile doğrularsın. Katılımlarda adını gizlemek için Profil › Gizlilik.")));

    // Meşgul (yazım sürüyor) hâlinde düğme ODAKLANABİLİR kalır: `disabled` odaktaki düğmeyi bulandırır (klavye odağı <body>'ye
    // düşer) → aria-disabled + aria-busy; tekrar tıklamayı busyJoin/busyFav korur. Gerçek `disabled` yalnız kalıcı durumlarda.
    const setBusy = (btn, on) => { if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy"); };
    const paintJoin = () => {
      joinBtn.replaceChildren();
      joinBtn.classList.remove("is-on", "is-off");
      joinBtn.disabled = false;
      joinBtn.setAttribute("aria-pressed", att ? "true" : "false");
      setBusy(joinBtn, busyJoin);
      let label, ariaOff = false;
      if (busyJoin) { label = "Yükleniyor..."; ariaOff = true; if (att) joinBtn.classList.add("is-on"); }
      else if (!st.canAct && st.variant === "panel") { label = "Katıl"; joinBtn.disabled = true; joinBtn.classList.add("is-off"); }
      else if (over) { label = "Etkinlik sona erdi"; joinBtn.disabled = true; joinBtn.classList.add("is-off"); }
      else if (att && ticketUsed) { label = "Giriş yapıldı"; ariaOff = true; joinBtn.classList.add("is-on"); joinBtn.append(svgIcon("checkDouble", { size: 18, sw: "2.4" })); }
      else if (att) { label = "Katılıyorum"; joinBtn.classList.add("is-on"); joinBtn.append(ic("check", 18, "2.4")); }
      else if (isFullNow()) { label = "Kontenjan dolu"; joinBtn.disabled = true; joinBtn.classList.add("is-off"); }
      else label = "Katıl";
      if (ariaOff) joinBtn.setAttribute("aria-disabled", "true"); else joinBtn.removeAttribute("aria-disabled");
      joinBtn.append(label);
      // yardımcı satır / bilet bağlantısı
      tixLink.hidden = !(canAct && att);
      let help = "";
      if (st.variant === "panel") help = "Etkinliğe katılım dinleyici hesabıyla yapılır.";
      else if (!att && !over && !isFullNow()) help = "Katıldığında biletin QR kod olarak Biletlerim'de oluşur.";
      helpEl.textContent = help;
      helpEl.hidden = !help;
    };
    const paintFav = () => {
      const on = favd;
      heroFav.classList.toggle("is-on", on);
      heroFav.setAttribute("aria-pressed", on ? "true" : "false");
      heroFav.setAttribute("aria-label", on ? "Favoriden çıkar" : "Favorilere ekle");
      heroFav.replaceChildren(ic("heart", 19, "2", "currentColor", { attrs: { fill: on ? "currentColor" : "none" } }));
      favBtn.classList.toggle("is-fav", on);
      favBtn.setAttribute("aria-pressed", on ? "true" : "false");
      favBtn.replaceChildren(ic("heart", 16, "2", "currentColor", { attrs: { fill: on ? "currentColor" : "none" } }), on ? "Favorilerde" : "Favorilere ekle");
      for (const b of [heroFav, favBtn]) {
        setBusy(b, busyFav);
        if (busyFav) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
      }
    };
    let shared = false;
    const paintShare = () => {
      shareBtn.classList.toggle("is-copied", shared);
      shareBtn.replaceChildren(shared ? ic("check", 16, "2.2") : ic("share", 16, "1.9"), shared ? "Kopyalandı" : "Paylaş");
      shareStat.textContent = shared ? `Bağlantı panoya kopyalandı — ${SITE_HOST}` : "";
    };
    const paintCounts = () => {
      kpiCount.dk.setValue(fmtInt(count));
      const next = statusKpi(); kpiStatus.replaceWith(next); kpiStatus = next;
      rowCount.textContent = `${fmtInt(count)} kişi`;
      drawAtt();
    };

    // ── eylemler ──
    async function toggleJoin() {
      if (busyJoin || over) return;
      if (dkLoginGate("Etkinliğe katılmak")) return;
      if (!canAct) return;
      if (att && ticketUsed) { dkToast("Bu etkinliğe girişin onaylandı; katılım artık iptal edilemez.", { type: "info" }); return; }
      if (!att && isFullNow()) { dkToast("Kontenjan dolu", { type: "err" }); return; }
      busyJoin = true; paintJoin();
      const wasAtt = att;
      try {
        if (att) { await unattendEvent(id, uid); att = false; count = Math.max(0, count - 1); }
        else { await attendEvent(ev, uid, myName(), session.profile?.privacySettings?.anonymousAttendance === true); att = true; count += 1; }
        if (!alive) return;
        invalidateAccountCounts(uid);
        dkToast(att ? "Katıldın! 🎉" : "Katılım iptal edildi");
      } catch (e) {
        if (!alive) return;
        // kullanılmış bilet: kurallar silmeyi reddeder → gerçek nedeni göster (app ile aynı)
        if (wasAtt && e?.code === "permission-denied") {
          try {
            const s = await getDoc(doc(db, "events", id, "attendees", uid));
            if (s.data()?.ticketStatus === "used") { ticketUsed = true; busyJoin = false; paintJoin(); drawVer(); dkToast("Bu etkinliğe girişin onaylandı; katılım artık iptal edilemez.", { type: "info" }); return; }
          } catch (_) {}
        }
        // sayfa açıkken etkinlik dolduysa kurallar (eventHasRoom) katılımı reddeder → güncel sayıyı oku, "Kontenjan dolu" göster
        // (app EventDetailScreen handleAttend ile aynı sonuç; ek okuma yalnız hata anında)
        if (!wasAtt && e?.code === "permission-denied") {
          try {
            const d = (await getDoc(doc(db, "events", id))).data();
            if (!alive) return;
            if (d) {
              if (typeof d.attendeeCount === "number") count = Math.max(0, d.attendeeCount);
              if (d.capacity != null) ev.capacity = d.capacity;
              if (isFullNow()) { busyJoin = false; paintJoin(); paintCounts(); dkToast("Kontenjan dolu", { type: "err" }); return; }
            }
          } catch (_) { if (!alive) return; }
        }
        dkToast("İşlem başarısız", { type: "err" });
      }
      busyJoin = false;
      paintJoin(); paintCounts(); drawVer();
    }
    async function toggleFav() {
      if (busyFav) return;
      if (dkLoginGate("Favorilere eklemek")) return;
      if (!canAct) return;
      busyFav = true; paintFav();
      try {
        if (favd) { await unfavEvent(uid, id); favd = false; } else { await favEvent(uid, ev); favd = true; }
        if (!alive) return;
        invalidateAccountCounts(uid);
        dkToast(favd ? "Favorilere eklendi" : "Favoriden çıkarıldı");
      } catch (_) { if (alive) dkToast("İşlem başarısız", { type: "err" }); }
      busyFav = false; if (alive) paintFav();
    }
    let shareT = null;
    async function share() {
      const url = shareUrl(id);
      try {
        if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title, url }); return; }
      } catch (e) { if (e?.name === "AbortError") return; }
      const ok = await copyText(url);
      if (!alive) return;
      if (!ok) { dkToast("Bağlantı kopyalanamadı", { type: "err" }); return; }
      shared = true; paintShare();
      // durum satırı (bilet kartında) görünür alanda değilse (ör. hero "Paylaş"ı, sayfa başı) geri bildirim toast ile
      const r = shareStat.getBoundingClientRect();
      if (!(r.height && r.top >= 76 && r.bottom <= window.innerHeight)) dkToast("Bağlantı panoya kopyalandı");   // 76 = yapışkan header
      clearTimeout(shareT);
      shareT = later(() => { shared = false; if (alive) paintShare(); }, 2500);
    }
    joinBtn.addEventListener("click", toggleJoin);
    heroFav.addEventListener("click", toggleFav);
    favBtn.addEventListener("click", toggleFav);
    heroShare.addEventListener("click", share);
    shareBtn.addEventListener("click", share);

    // ── Puan & Yorum modalı ──
    function openReview(kind) {
      if (dkLoginGate("Değerlendirme yapmak")) return;
      if (!canAct) return;
      const targets = [];
      if (ev.venueId) targets.push({ key: "venue", label: `Mekan · ${venueName}`, name: venueName });
      if (ev.artistId) targets.push({ key: "artist", label: `Sanatçı · ${artistName}`, name: artistName });
      if (!targets.length) return;
      let cur = targets.some((t) => t.key === kind) ? kind : targets[0].key;
      let rating = 0, dirty = false, busy = false;
      const taId = "dk-etk-rv-ta", cntId = "dk-etk-rv-cnt";
      const ta = h("textarea", { id: taId, class: "dk-etkinlik-rvm-ta", rows: 4, maxlength: 500, placeholder: "Yorumunuzu yazın... (en az 10 karakter)", "aria-describedby": cntId });
      const cnt = h("span", { id: cntId, class: "dk-etkinlik-rvm-cnt" });
      // mevcut değerlendirme bilgisi (hedef başına TEK yorum: doküman kimliği uid_hedef) — WebKatildiklarim ile aynı metinler
      const note = h("p", { class: "dk-etkinlik-rvm-note", role: "note", hidden: true });
      const cancelBtn = h("button", { type: "button", class: "dk-etkinlik-rvm-cancel dk-press" }, "İptal");
      const sendBtn = h("button", { type: "button", class: "dk-etkinlik-rvm-send dk-press dk-press-o" }, "Gönder");
      // hedef seçimi (yalnız var olan hedefler; tek hedefte gizli)
      const segBtns = new Map();
      const seg = targets.length > 1 ? h("div", { class: "dk-etkinlik-rvm-seg", role: "radiogroup", "aria-label": "Kime yorum" }) : null;
      targets.forEach((t) => {
        const b = h("button", { type: "button", role: "radio", class: "dk-etkinlik-rvm-segb dk-press" }, t.label);
        b.addEventListener("click", () => pickTarget(t.key));
        segBtns.set(t.key, b); seg?.append(b);
      });
      seg?.addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
        e.preventDefault();
        const keys = [...segBtns.keys()]; let i = keys.indexOf(cur);
        i = (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + keys.length) % keys.length;
        pickTarget(keys[i]); segBtns.get(keys[i]).focus();
      });
      // yıldızlar
      const starBtns = [];
      const stars = h("div", { class: "dk-etkinlik-rvm-stars", role: "radiogroup", "aria-label": "Puan" });
      for (let i = 1; i <= 5; i++) {
        const b = h("button", { type: "button", role: "radio", class: "dk-etkinlik-rvm-star dk-press", "aria-label": `${i} yıldız` });
        b.addEventListener("click", () => { rating = i; dirty = true; paint(); });
        starBtns.push(b); stars.append(b);
      }
      stars.addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
        e.preventDefault();
        const next = Math.min(5, Math.max(1, (rating || 0) + (e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1)));
        rating = next; dirty = true; paint(); starBtns[next - 1].focus();
      });
      const len = () => ta.value.trim().length;
      const cantSend = () => rating < 1 || len() < 10;
      const subEl = () => m?.dialog.querySelector(".dk-mdl-sub");
      const paint = () => {
        segBtns.forEach((b, k) => { const on = k === cur; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
        starBtns.forEach((b, j) => {
          const i = j + 1, on = i <= rating;
          b.setAttribute("aria-checked", i === rating ? "true" : "false");
          b.tabIndex = (rating ? i === rating : i === 1) ? 0 : -1;
          b.replaceChildren(svgRaw(P.star, { size: 36, sw: "1.5", color: on ? "#FFD700" : "#5E636D", attrs: { fill: on ? "#FFD700" : "none" } }));
        });
        const n = len();
        cnt.textContent = `${n}/500` + (n < 10 ? " · en az 10 karakter" : "");
        cnt.classList.toggle("is-warn", n > 0 && n < 10);
        sendBtn.disabled = busy || cantSend();
        const t = targets.find((x) => x.key === cur);
        const s = subEl(); if (s) s.textContent = `${t.name} · ${title}`;
        const ex = myReview(cur);
        note.textContent = !ex ? ""
          : ex.eventId === id ? "Bu etkinlik için değerlendirmen var; kaydedince güncellenir."
            : `Bu ${cur === "artist" ? "sanatçı" : "mekan"} için ${ex.event ? `“${ex.event}” etkinliğindeki ` : "önceki "}değerlendirmen bu etkinlikle güncellenecek.`;
        note.hidden = !ex;
      };
      // Önceki değerlendirme (doküman kimliği uid_hedef → yeniden gönderim onu günceller): alanları onunla doldur
      const prefill = () => {
        const r = myReview(cur);
        rating = r ? Math.round(Number(r.overallRating ?? r.rating) || 0) : 0;
        ta.value = r?.comment || "";
        dirty = false;
      };
      function pickTarget(k) { if (k === cur) return; cur = k; if (!dirty) prefill(); paint(); }
      ta.addEventListener("input", () => { dirty = true; paint(); });
      const submit = async () => {
        if (busy) return;
        if (rating < 1) { dkToast("Puan seç", { type: "err" }); return; }
        if (len() < 10) { dkToast("Yorum en az 10 karakter olmalı", { type: "err" }); return; }
        busy = true; paint();
        const text = ta.value.trim();
        const evRef = { id, title: ev.title };
        const kindNow = cur;
        const ex = myReview(kindNow);
        const sameEvent = !!(ex && ex.id && ex.eventId === id);
        try {
          let local;
          if (sameEvent) {
            // Bu etkinliğe bağlı mevcut yorum → legacy/app "Yorumu Düzenle" yaması (updateMyReview; eventId/event/createdAt korunur)
            const patch = kindNow === "venue" ? { comment: text, rating, overallRating: rating } : { comment: text, rating };
            await updateMyReview(kindNow === "venue" ? "venueReviews" : "reviews", ex.id, patch);
            local = { ...ex, ...patch, _kind: kindNow, _name: myName(), _rating: rating };
          } else {
            // Yeni ya da başka etkinliğe bağlı yorum → legacy reviewModal yazımı (aynı data.js fonksiyonları/alanları; hedef başına
            // TEK doküman uid_hedef → bu etkinliğe yeniden bağlanır; kullanıcı modaldaki notla önceden bilgilendirilir)
            if (kindNow === "artist") await submitArtistReview(uid, myName(), { id: ev.artistId, displayName: ev.artistName ?? "" }, rating, text, evRef);
            else await submitVenueReview(uid, myName(), { id: ev.venueId, displayName: ev.venueName ?? "" }, rating, text, evRef);
            local = { id: `${uid}_${kindNow === "artist" ? ev.artistId : ev.venueId}`, authorId: uid, authorName: myName(), rating, overallRating: rating, comment: text, eventId: id, event: ev.title || "", _kind: kindNow, _name: myName(), _rating: rating, _fresh: true };
          }
          if (!alive) return;
          invalidateAccountCounts(uid);
          dkToast(sameEvent ? "Yorum güncellendi" : "Yorumun gönderildi");
          // aynı hedefe önceki yorum aynı dokümana yazıldı → listede değiştir
          revList = revList.filter((r) => !(r._kind === kindNow && r.authorId === uid));
          revList.unshift(local);
          const src = kindNow === "artist" ? st.aRevs : st.vRevs;
          const i = src.findIndex((r) => r.authorId === uid);
          if (i >= 0) src[i] = { ...src[i], ...local }; else src.push(local);
          drawRevs();
          m.close("sent");
        } catch (_) { if (alive) dkToast(sameEvent ? "Güncellenemedi" : "Gönderilemedi", { type: "err" }); }
        busy = false; if (m && alive) paint();
      };
      sendBtn.addEventListener("click", submit);
      const body = [
        seg,
        stars,
        note,
        h("div", { class: "dk-etkinlik-rvm-fld" }, h("label", { for: taId, class: "dk-etkinlik-rvm-lbl" }, "YORUMUN"), ta, cnt),
        h("div", { class: "dk-etkinlik-rvm-acts" }, cancelBtn, sendBtn),
      ].filter(Boolean);
      const first = targets.find((t) => t.key === cur);
      const m = dkModal({
        title: "Puan & Yorum", sub: `${first.name} · ${title}`, body, size: 480, variant: "panel", align: "center", serifTitle: true, cls: "dk-etkinlik-rvm",
        initialFocus: seg ? ".dk-etkinlik-rvm-segb[tabindex='0']" : ".dk-etkinlik-rvm-star[tabindex='0']",
        onClose: () => { if (openModal === m) openModal = null; },
      });
      cancelBtn.addEventListener("click", () => m.close("cancel"));
      openModal = m;
      prefill(); paint();
    }

    // ── Benzer etkinlikler ──
    const simSec = h("section", { class: "dk-etkinlik-sim", "aria-labelledby": "dk-etk-sim", hidden: true });
    upcomingEvents().then((list) => {
      if (!alive) return;
      const myFam = g ? genreFamilyKey(g) : null;
      const myGenres = new Set(eventGenres(ev).map(fold));
      const scored = (list || []).filter((e) => e.id !== id).map((e) => {
        let s = 0;
        const gs = eventGenres(e);
        if (gs.some((x) => myGenres.has(fold(x)))) s += 2;
        else if (myFam && myFam !== "other" && gs.some((x) => genreFamilyKey(x) === myFam)) s += 2;
        if (city && sameCity(e.city || e.location?.city, city)) s += 1;
        return { e, s, t: eventStartMs(e) ?? Infinity };
      }).sort((a, b) => (b.s - a.s) || (a.t - b.t)).slice(0, 4).map((x) => x.e);
      if (!scored.length) return;
      simSec.replaceChildren(
        dkSectionHead({ eyebrow: "SENİN İÇİN", title: "Benzer ", em: "etkinlikler", size: 44, id: "dk-etk-sim", link: { href: "#/etkinlikler", label: "Tümünü gör", variant: "sans" } }),
        h("div", { class: "dk-etkinlik-simgrid" }, ...scored.map((e) => eventCard(e, { badge: false, footer: "attendees-plain" }))));
      simSec.hidden = false;
    }).catch(() => {});

    // ── yerleşim ──
    const col = h("div", { class: "dk-etkinlik-col" }, kpis, about, people, verSlot, attSec, revSec);
    const mainEl = h("div", { class: "dk-etkinlik-main" }, col, aside);
    root.replaceChildren(crumb, hero, mainEl, simSec);
    // ≤1023 (tek kolon): bilet kartı DOM'da KPI'ların hemen ardına TAŞINIR → görsel sıra = klavye odak sırası (CSS order yok).
    const mqOne = matchMedia("(max-width: 1023px)");
    const placeAside = () => {
      const f = aside.contains(document.activeElement) ? document.activeElement : null;
      if (mqOne.matches) { if (aside.previousElementSibling !== kpis) kpis.after(aside); }
      else if (aside.parentNode !== mainEl) mainEl.append(aside);
      if (f && document.activeElement !== f) { try { f.focus({ preventScroll: true }); } catch (_) {} }
    };
    // Yapışkan bilet kartı yalnız görünür alana sığıyorsa (top 96 + 16 alt pay); sığmıyorsa normal akış (alt kısmı kesilmesin).
    const fitAside = () => { aside.classList.toggle("is-tall", !mqOne.matches && aside.offsetHeight + 112 > window.innerHeight); };
    const onMq = () => { placeAside(); fitAside(); };
    placeAside();
    mqOne.addEventListener("change", onMq);
    window.addEventListener("resize", fitAside);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => fitAside()) : null;
    ro?.observe(aside);
    fitAside();
    cleanups.push(() => { mqOne.removeEventListener("change", onMq); window.removeEventListener("resize", fitAside); ro?.disconnect(); });
    paintJoin(); paintFav(); paintShare(); paintCounts(); drawVer(); if (revSec) drawRevs();
  }

  // ── Harita önizlemesi (Leaflet, statik; yol çizilmez — helpers.ROUTING "none") ──
  let map = null;
  function mapPanel(ll, label) {
    // Leaflet kabı: etkileşimsiz önizleme (erişilebilir eylem = "Haritada göster / Yol tarifi" bağlantısı); OSM atıf bağlantısı içeride kalır
    const canvas = h("div", { class: "dk-etkinlik-map-canvas" });
    const cta = h("a", { href: directionsUrl(ll), target: "_blank", rel: "noopener", class: "dk-etkinlik-map-cta dk-press" },
      ic("nav", 15, null, "currentColor", { fill: true }), "Haritada göster / Yol tarifi");
    const box = h("div", { class: "dk-etkinlik-map" }, canvas, cta);
    const pinHTML = () => `<span class="dk-etkinlik-pin"><span class="dk-etkinlik-pin-ping dk-ping"></span><span class="dk-etkinlik-pin-dot"></span></span><span class="dk-etkinlik-pin-lbl"></span>`;
    loadLeaflet().then((L) => {
      if (!alive) return;
      map = L.map(canvas, {
        center: [ll.lat, ll.lng], zoom: 15, zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, touchZoom: false, tap: false, attributionControl: true,
        fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false,   // statik önizleme: karolar anında görünür
      });
      map.attributionControl.setPrefix(false);
      map.attributionControl.setPosition("bottomleft");
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({ className: "dk-etkinlik-pinwrap", html: pinHTML(), iconSize: [28, 28], iconAnchor: [14, 14] });
      const mk = L.marker([ll.lat, ll.lng], { icon, keyboard: false, interactive: false }).addTo(map);
      const lblEl = mk.getElement()?.querySelector(".dk-etkinlik-pin-lbl");
      if (lblEl) lblEl.textContent = label;
      requestAnimationFrame(() => { try { map?.invalidateSize(); } catch (_) {} });
    }).catch(() => {
      if (!alive) return;
      // Leaflet yüklenemedi → dekoratif sokak deseni (artboard SVG'si, semt etiketleri olmadan) + pin
      canvas.innerHTML = '<svg width="100%" height="220" viewBox="0 0 824 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="position:absolute;top:0;left:0;display:block"><g fill="none" stroke="#161A22" stroke-width="1.2" stroke-linecap="round"><path d="M0 60 C 160 70, 320 50, 520 40 S 760 30, 824 36"></path><path d="M0 150 C 200 140, 380 160, 600 136 S 780 140, 824 150"></path><path d="M140 0 C 150 80, 130 160, 160 220"></path><path d="M300 0 C 320 90, 290 150, 310 220"></path><path d="M620 0 C 600 90, 640 160, 610 220"></path></g><g fill="none" stroke="#1D222C" stroke-width="3.4" stroke-linecap="round"><path d="M-10 110 C 180 120, 360 96, 470 108 C 580 120, 700 100, 834 112"></path><path d="M430 0 C 440 70, 400 150, 420 220"></path></g></svg>'
        + `<span class="dk-etkinlik-pinwrap is-static">${pinHTML()}</span>`;
      const lblEl = canvas.querySelector(".dk-etkinlik-pin-lbl");
      if (lblEl) lblEl.textContent = label;
    });
    return box;
  }

  load();

  return {
    node: shell.node,
    update() { /* sayfa sorgu parametresi kullanmıyor */ },
    onSession(s) { return !!s?.user; },
    destroy() {
      alive = false;
      if ((location.hash || "").split("?")[0] !== base) _mountedId = null;   // başka rotaya gidildi
      cleanups.forEach((f) => { try { f(); } catch (_) {} });
      try { openModal?.close("destroy"); } catch (_) {}
      try { map?.remove(); } catch (_) {}
      map = null;
      shell.destroy();
    },
  };
}
