// WebBiletlerim — masaüstü görünümü (≥769 px). Registry anahtarı: biletlerim (#/biletlerim).
// Spec: specs/hesap.md § WebBiletlerim (+ Bilet.dc.html / WebBiletlerim.dc.html sahip notları: QR okutma + koçan yırtılma).
// CSS: css/dk-biletlerim.css — tüm seçiciler .dk-biletlerim kökü altında (e-bilet katmanı portalda, kendi .dk-biletlerim kökünde).
//
// Veri (legacy customer.js ticketsView + app TicketsScreen/ETicket/tickets.ts ile AYNI):
//   • Bilet = events/{eventId}/attendees/{uid}. Liste: collectionGroup('attendees').where('userId','==',uid) (mevcut indeks) +
//     üst etkinlik getDoc. data.js attendedEvents attendee alanlarını (ticketStatus/checkedInAt) taşımadığı için sorgu burada.
//   • Yaklaşan = başlangıç yok ya da başlangıç + 6 sa > şimdi (app TICKET_VALID_TAIL_MS); diğerleri Geçmiş.
//   • Canlı check-in: her yaklaşan biletin attendee dokümanı onSnapshot → ticketStatus 'used' + sunucu checkedInAt.
//   • QR: callable getTicketQrToken({eventId}) (europe-west1; js/firebase.js `functions`), 15 sn zaman aşımı, 25 sn'de bir yenile,
//     hata: geçerli token varsa göster + 5 sn sonra dene, yoksa "YENİDEN DENE". Token dizgesi olduğu gibi QR'a (ECL M, sessiz bölge 0).
//     Fonksiyon erişilemezse (emülatör / deploy yok) sahte QR YOK → kesikli "YENİDEN DENE" kutusu + "QR KODU ŞU AN YÜKLENEMİYOR".
//   • Yırtılma animasyonu yalnız sunucu check-in olayıyla oynar (QR'a tıklama YOK); bilet başına bir kez
//     (localStorage "gb_animated_ticket_ids", app ile aynı anahtar/biçim "{eventId}_{uid}", en çok 200).
//   • Bu sayfa Firestore'a YAZMAZ (okuma + callable).
// Sözleşme: biletlerimView(ctx) → { node, destroy(), update(query), onSession(session) }.
import { h } from "../../ui.js";
import { session as storeSession } from "../../store.js";
import { db, functions, collectionGroup, query, where, getDocs, getDoc, doc, onSnapshot } from "../../firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";
import { accountShell } from "../shared/account-shell.js";
import { cx, dkPageHead, dkSegmented, dkEmpty, dkSkeleton, dkButton, portalRoot, eventStatusKey } from "../shared/ui.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import {
  eventStartMs, fmtTime, fmtDayLabel, isToday, isTomorrow, DAYS_TR_SHORT, MONTHS_TR_SHORT, trUpper, fmtPrice, isFree,
  haversineKm, fmtKm, writeQuery, initials, toMs,
} from "../shared/helpers.js";
import { genreGrad, primaryGenre } from "../shared/genres.js";
import { dateTile, evImage } from "../shared/cards.js";

const P = "dk-biletlerim-";
const TICKET_VALID_TAIL_MS = 6 * 3600 * 1000;

// ── Artboard ikonları (WebBiletlerim.dc.html gövdeleri birebir) ──
const I_CLOCK = '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>';
const I_PIN = '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>';
const I_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"></path>';
const I_QR = '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h1M18 14h2"></path>';
const I_STAR = '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>';
const I_X = '<path d="M6 6l12 12M18 6 6 18"></path>';

const pad2 = (n) => String(n).padStart(2, "0");
/** Sunucu check-in zamanı (ms) → yerel "HH:MM" (app formatCheckInClock). */
const clockOf = (ms) => (ms == null || !Number.isFinite(ms) ? "" : `${pad2(new Date(ms).getHours())}:${pad2(new Date(ms).getMinutes())}`);
const monShort = (d) => trUpper(MONTHS_TR_SHORT[d.getMonth()]);

// ── Etkinlik alanları (app TicketsScreen eşlemesi) ──
const tTitle = (e) => e?.title || "Etkinlik";
const tArtist = (e) => e?.artistName ?? e?.artist ?? "";
const tVenue = (e) => e?.venueName ?? e?.venue ?? "";
const tSub = (e) => [tArtist(e), tVenue(e)].filter(Boolean).join(" · ") || "—";
const tPrice = (e) => e?.ticketPrice ?? e?.price;
// Tür etiketi büyük harf — kelime bazında (app src/utils/genreLabel.ts birebir): İngilizce "Electronic" → "ELECTRONIC"
// (tr-TR "ELECTRONİC" yapardı), Türkçe "Akustik" → "AKUSTİK" (en-US "AKUSTIK" yapardı).
// SHARED-CANDIDATE: genres.js genreLabel tüm türleri trUpper ile çeviriyor → "ELECTRONİC"/"MELODİC TECHNO"; app ile aynı
//   kelime bazlı kurala geçmeli (artboard "ELECTRONIC · TREND"). Paylaşılan düzeltme gelene dek yerel.
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_ASCII_WORDS = new Set(["akustik", "klasik", "alternatif", "elektronik", "enstrumantal", "ilahi"]);
const isTurkishWord = (w) => TR_LETTERS.test(w) || TR_ASCII_WORDS.has(w.toLocaleLowerCase("en-US"));
const genreUpper = (g) => (g ? String(g).replace(/[^\s\-/&+.,]+/g, (w) => w.toLocaleUpperCase(isTurkishWord(w) ? "tr-TR" : "en-US")) : "");
// Kart üst satırı: "JAZZ · YENİ" / "ELECTRONIC · TREND" / "POP" (tek kısa etiket; legacy statusBadge önceliği)
const TAGS = { busy: "TREND", popular: "TREND", new: "YENİ", vipEvent: "VIP" };
function kicker(e) {
  const g = genreUpper(primaryGenre(e));
  const tag = TAGS[eventStatusKey(e)] || null;
  return [g || null, tag].filter(Boolean).join(" · ") || "ETKİNLİK";
}
// "Bugün 21:00" / "Yarın 22:00" / "Paz 4 Eki 20:00"
function whenLong(e) {
  const s = eventStartMs(e);
  if (s == null) return [e?.date, e?.startTime].filter((x) => typeof x === "string" && x).join(" ") || "Tarih yok";
  return `${fmtDayLabel(s)} ${fmtTime(s)}`;
}
// Görsel üstü durum rozeti: BU GECE / YARIN / "PAZ 20:00"
function statusChip(s) {
  if (s == null) return null;
  if (isToday(s)) return { label: "BU GECE", fg: "#FF5A6E", bd: "rgba(255,90,110,0.5)" };
  if (isTomorrow(s)) return { label: "YARIN", fg: "#FF4FA3", bd: "rgba(255,79,163,0.5)" };
  return { label: `${trUpper(DAYS_TR_SHORT[new Date(s).getDay()])} ${fmtTime(s)}`, fg: "#A3A7AF", bd: "#2C303A" };
}
// Geçmiş: "CMT 19 EYL · 21:00"
function whenPast(e) {
  const s = eventStartMs(e);
  if (s == null) return trUpper(e?.date || "TARİH YOK");
  const d = new Date(s);
  return `${trUpper(DAYS_TR_SHORT[d.getDay()])} ${d.getDate()} ${monShort(d)} · ${fmtTime(s)}`;
}

// ── Veri ──
// SHARED-CANDIDATE: data.js attendedEvents() attendee alanlarını (ticketStatus/checkedInAt/verified) taşımıyor (spec §7 "extend");
// data.js'e dokunmamak için aynı sorgu (collectionGroup attendees.userId — mevcut indeks) burada, attendee alanlarıyla birlikte.
async function loadTickets(uid) {
  const snap = await getDocs(query(collectionGroup(db, "attendees"), where("userId", "==", uid)));
  const rows = await Promise.all(snap.docs.map(async (d) => {
    const ref = d.ref.parent?.parent;
    if (!ref) return null;
    try {
      const ev = await getDoc(ref);
      if (!ev.exists()) return null;
      const a = d.data() || {};
      return {
        id: ev.id, ...ev.data(), joinedAt: a.joinedAt,
        att: { ticketStatus: a.ticketStatus || null, checkedInAt: toMs(a.checkedInAt), joinedAt: toMs(a.joinedAt), anonymous: !!a.anonymous, verified: !!a.verified, verifiedVia: a.verifiedVia || null },
      };
    } catch (_) { return null; }
  }));
  return rows.filter(Boolean);
}
const initialState = (e) => (e.att?.ticketStatus === "used" ? { status: "used", checkedInAt: e.att.checkedInAt ?? null } : { status: "valid", checkedInAt: null });

/** events/{eventId}/attendees/{uid} canlı dinleyicisi (app subscribeTicket birebir). */
function subscribeTicket(eventId, uid, cb) {
  return onSnapshot(doc(db, "events", eventId, "attendees", uid), (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const used = data?.ticketStatus === "used";
    cb({ status: used ? "used" : "valid", checkedInAt: used ? toMs(data?.checkedInAt) : null });
  }, () => { /* izin/ağ hatası: mevcut durum korunur (app ile aynı) */ });
}

// ── QR token (app src/services/tickets.ts fetchTicketQrToken birebir) ──
const CALL_TIMEOUT_MS = 15000;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
let _getTokenCall = null;
async function fetchTicketQrToken(eventId) {
  if (!_getTokenCall) _getTokenCall = httpsCallable(functions, "getTicketQrToken");
  const res = await withTimeout(_getTokenCall({ eventId }), CALL_TIMEOUT_MS);
  const d = res?.data ?? {};
  return {
    token: typeof d.token === "string" ? d.token : null,
    expiresAt: typeof d.expiresAt === "number" ? d.expiresAt : 0,
    used: d.used === true,
    checkedInAt: typeof d.checkedInAt === "number" ? d.checkedInAt : null,
  };
}
// Hata → ipucu metni. Sunucu (functions/tickets.js getTicketQrToken) yalnız şu kodlarla Türkçe cümle döner; SDK altyapı
// hataları (internal "Response is not valid JSON object." / unavailable / deadline-exceeded / fonksiyon yok → "not-found" tek kelime /
// zaman aşımı) kullanıcıya İngilizce gösterilmez → genel metin.
const SERVER_MSG_CODES = new Set(["invalid-argument", "not-found", "unauthenticated", "failed-precondition", "permission-denied"]);
function tokenErrorHint(e) {
  const code = String(e?.code ?? "").replace(/^functions\//, "");
  const msg = String(e?.message ?? "").trim();
  const bare = !msg || /^[A-Za-z_-]+$/.test(msg);
  if (!SERVER_MSG_CODES.has(code) || bare) return "QR KODU ŞU AN YÜKLENEMİYOR";
  return trUpper(msg);
}

// ── QR kodlayıcı: qrcode-generator 1.4.4 (MIT, Kazuhiko Arase) — cdnjs, SRI ile; ilk bilet açılışında bir kez yüklenir ──
const QR_LIB_SRC = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const QR_LIB_SRI = "sha512-ZDSPMa/JM1D+7kdg2x3BsruQ6T/JpJo3jWDWkCZsP+5yVyp1KfESqLI+7RqB5k24F7p2cV7i2YHh/890y6P6Sw==";
let _qrLib = null;
function loadQrLib() {
  if (typeof window.qrcode === "function") return Promise.resolve(window.qrcode);
  if (_qrLib) return _qrLib;
  _qrLib = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = QR_LIB_SRC; s.integrity = QR_LIB_SRI; s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer"; s.async = true;
    s.onload = () => (typeof window.qrcode === "function" ? resolve(window.qrcode) : reject(new Error("qrcode")));
    s.onerror = () => { s.remove(); reject(new Error("qrcode")); };
    document.head.append(s);
  });
  _qrLib.catch(() => { _qrLib = null; });
  return _qrLib;
}
// Metin → SVG (125×125, crispEdges, #111214, sessiz bölge 0, ECL M) — yatay koşular tek path (artboard QR path biçimi)
function qrSvg(qrcode, text) {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      const s0 = c;
      while (c < n && qr.isDark(r, c)) c++;
      d += `M${s0} ${r}h${c - s0}v1h-${c - s0}z`;
    }
  }
  return svgRaw(`<path d="${d}" fill="#111214"></path>`, { size: 125, viewBox: `0 0 ${n} ${n}`, fill: true, color: "#111214", attrs: { "shape-rendering": "crispEdges" } });
}

// ── Animasyon bir kez oynasın (app ile aynı anahtar) ──
const ANIMATED_KEY = "gb_animated_ticket_ids";
const ANIMATED_MAX = 200;
function readAnimated() {
  try { const a = JSON.parse(localStorage.getItem(ANIMATED_KEY) || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch (_) { return []; }
}
const hasAnimatedTicket = (key) => readAnimated().includes(key);
function markTicketAnimated(key) {
  try {
    const ids = readAnimated().filter((x) => x !== key);
    ids.push(key);
    localStorage.setItem(ANIMATED_KEY, JSON.stringify(ids.length > ANIMATED_MAX ? ids.slice(ids.length - ANIMATED_MAX) : ids));
  } catch (_) {}
}

// ── Görsel / yer tutucu ──
function mediaEl(e, cls) {
  const src = evImage(e);
  const ph = () => h("span", { class: cx(P + "ph", cls), style: { background: genreGrad(primaryGenre(e), 150) }, "aria-hidden": "true" },
    h("span", {}, initials(tTitle(e))));
  if (!src) return ph();
  const img = h("img", { src, alt: "", loading: "lazy", decoding: "async", class: cls });
  img.addEventListener("error", () => img.replaceWith(ph()), { once: true });
  return img;
}

// ══════════════════════════════════════════════════════════════════════
// TicketCard (yaklaşan) — WebBiletlerim 205–256
// ══════════════════════════════════════════════════════════════════════
// SHARED-CANDIDATE: TicketCard / PastTicketCard (EventCard varyantları, spec "new") cards.js'te yok → yerel.
let _cardSeq = 0;
function ticketCard(e, st, { index, onOpen }) {
  const s = eventStartMs(e);
  const chip = statusChip(s);
  const img = mediaEl(e, P + "img");
  // aria-label (spec "{başlık} biletini aç") görünür metnin yerini aldığı için sanatçı·mekan, zaman/mesafe ve fiyat ya da
  // "GİRİŞ YAPILDI · HH:MM" durumu aria-describedby ile okunur (setState'te fiyat ↔ giriş kimliği değişir).
  const uidp = `dk-bl-c${++_cardSeq}-`;
  const distTxt = h("span", {});
  const dist = h("span", { class: P + "mi", hidden: true }, svgRaw(I_PIN, { size: 14, sw: "1.8", color: "#4ED8FF" }), distTxt);
  const price = h("span", { id: uidp + "p", class: cx(P + "price", isFree(tPrice(e)) && "is-free") }, fmtPrice(tPrice(e)));
  const usedTime = h("span", {});
  const used = h("span", { id: uidp + "u", class: P + "used" }, svgRaw(I_CHECK, { size: 14, sw: "2.4" }), usedTime);
  const dt = dateTile(s, { variant: "overlay" });
  dt.classList.add(P + "dt");
  const btn = h("button", { type: "button", class: P + "card", "aria-label": `${tTitle(e)} biletini aç` },
    h("span", { class: P + "media" }, img, h("span", { class: P + "shade" }), dt,
      chip ? h("span", { class: P + "chip", style: { color: chip.fg, borderColor: chip.bd } }, chip.label) : null),
    h("span", { class: P + "body" },
      h("span", { class: P + "kick" }, kicker(e)),
      h("span", { class: P + "title" }, tTitle(e)),
      h("span", { id: uidp + "s", class: P + "sub" }, tSub(e)),
      h("span", { id: uidp + "m", class: P + "meta" }, h("span", { class: P + "mi" }, svgRaw(I_CLOCK, { size: 14, sw: "1.8" }), whenLong(e)), dist)),
    h("span", { class: P + "perf", "aria-hidden": "true" }, h("span", { class: P + "notch is-l" }), h("span", { class: P + "notch is-r" })),
    h("span", { class: P + "foot" }, price, used,
      h("span", { class: P + "cta" }, svgRaw(I_QR, { size: 14, sw: "2" }), "BİLETİ GÖR")));
  btn.addEventListener("click", () => onOpen(e, btn));
  const node = h("div", { class: cx(P + "cw", "dk-rise"), style: { "--dk-delay": 140 + 80 * Math.min(index, 8) + "ms" } }, btn);
  const setState = (x) => {
    const isUsed = x.status === "used";
    btn.classList.toggle("is-used", isUsed);
    price.hidden = isUsed;
    used.hidden = !isUsed;
    const at = clockOf(x.checkedInAt);
    usedTime.textContent = at ? `GİRİŞ YAPILDI · ${at}` : "GİRİŞ YAPILDI";
    btn.setAttribute("aria-describedby", [uidp + "s", uidp + "m", uidp + (isUsed ? "u" : "p")].join(" "));
  };
  const setDist = (txt) => { distTxt.textContent = txt || ""; dist.hidden = !txt; };
  setState(st);
  return { node, btn, setState, setDist };
}

// PastTicketCard — WebBiletlerim 258–276
function pastCard(e, st, { index }) {
  const isUsed = st.status === "used";
  return h("div", { class: cx(P + "past", "dk-rise"), style: { "--dk-delay": 100 + 60 * Math.min(index, 8) + "ms" } },
    mediaEl(e, P + "pimg"),
    h("div", { class: P + "pbody" },
      h("span", { class: P + "pwhen" }, whenPast(e)),
      h("span", { class: P + "ptitle" }, tTitle(e)),
      h("span", { class: P + "psub" }, tSub(e))),
    h("div", { class: P + "pfoot" },
      // Süresi dolmuş ama hiç okutulmamış bilet "KULLANILDI" değildir (spec açık soru 3) → "SÜRESİ DOLDU"
      h("span", { class: P + "plbl" }, isUsed ? "KULLANILDI" : "SÜRESİ DOLDU"),
      h("a", { href: "#/katildiklarim?puanla=" + encodeURIComponent(e.id), class: cx(P + "rate", "dk-press"), "aria-label": `${tTitle(e)} etkinliğini puanla` },
        svgRaw(I_STAR, { size: 13, fill: true, attrs: { stroke: "currentColor", "stroke-width": "1.5", "stroke-linejoin": "round" } }), "PUANLA")));
}

// Yükleniyor iskeleti (tasarımda yok): 3 bilet kartı biçiminde
function skeletonCard() {
  return h("div", { class: P + "skel", "aria-hidden": "true" },
    dkSkeleton({ h: 168, r: 0 }),
    h("div", { class: P + "skelbody" }, dkSkeleton({ w: "46%", h: 11, r: 4 }), dkSkeleton({ w: "78%", h: 20, r: 5 }), dkSkeleton({ w: "62%", h: 14, r: 4 }), dkSkeleton({ w: "54%", h: 13, r: 4 })),
    h("span", { class: P + "perf" }),
    h("div", { class: P + "skelfoot" }, dkSkeleton({ w: 56, h: 16, r: 4 }), dkSkeleton({ w: 116, h: 34, r: 4 })));
}

// ══════════════════════════════════════════════════════════════════════
// E-BİLET MODALI — WebBiletlerim 309–416 (Bilet.dc.html ile aynı bileşen; app ETicket.tsx durum makinesi birebir)
//   idle → scanning(0) → confirmed(950) → tearing(1550) → used(3250). Tetik: sunucu check-in (attendee onSnapshot / token used).
// SHARED-CANDIDATE: overlays.js özel (şablonsuz) tam ekran katman kaydı dışa açmıyor (dkModal başlık/kutu şablonlu) → ESC, odak
//   tuzağı, #app inert, kaydırma kilidi, odağı geri verme, "dk:teardown" kapanışı burada yerel.
// ══════════════════════════════════════════════════════════════════════
const T_CONFIRM = 950;
const T_TEAR = 1550;
const T_END = 3250;
const ENTER_MS = 620;
const QR_REFRESH_MS = 25000;
const QR_RETRY_MS = 5000;
const BITS = [
  { x: 24, y: 317, s: 3, d: 140, k: "b" },
  { x: 41, y: 319, s: 2, d: 190, k: "a" },
  { x: 238, y: 318, s: 2.5, d: 470, k: "c" },
  { x: 254, y: 316, s: 3.5, d: 500, k: "a" },
  { x: 266, y: 320, s: 2, d: 530, k: "b" },
  { x: 275, y: 317, s: 3, d: 545, k: "c" },
];
const IDLE_HINT = "GİRİŞTE GÖREVLİYE OKUT";
const USED_HINT = "BU BİLET KULLANILDI";
const FOCUSABLE = 'a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"]),[tabindex]:not([tabindex="-1"])';

function openETicket({ e, uid, initial, onClose }) {
  const eventId = e.id;
  const ticketKey = `${eventId}_${uid}`;
  const openedAt = performance.now();
  const prevFocus = document.activeElement;
  const rmq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduce = !!rmq?.matches;
  let phase = "idle";
  let usedAt = "";
  let usedKnown = false;
  let triggered = false;
  let alive = true;
  let qr = { token: null, error: false, hint: null };
  let qrExp = 0;
  let refreshT = null;
  let wake = null;
  let unsub = () => {};
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); };
  const clearTimers = () => { timers.forEach((id) => clearTimeout(id)); timers.clear(); };
  const stopRefresh = () => { if (refreshT) { clearTimeout(refreshT); refreshT = null; } };

  // ── Gövde (bilgi) ──
  const s = eventStartMs(e);
  const d = s == null ? null : new Date(s);
  const info = {
    genre: kicker(e),
    title: tTitle(e),
    artist: tArtist(e),
    date: d ? `${d.getDate()} ${monShort(d)}` : "—",
    time: (s != null ? fmtTime(s) : "") || e?.startTime || "—",
    venue: tVenue(e) || "—",
  };
  const sumId = "dk-bl-sum-" + Math.random().toString(36).slice(2, 8);
  const summary = h("span", { id: sumId, class: "dk-sr" },
    [`E-bilet. ${info.title}`, info.artist, `Tarih ${info.date}`, `saat ${info.time}`, `mekan ${info.venue}`].filter(Boolean).join(", "));
  const announcer = h("span", { class: "dk-sr", role: "status", "aria-live": "polite" });

  const heroImg = evImage(e)
    ? h("img", { src: evImage(e), alt: "", decoding: "async" })
    : null;
  const heroFallback = () => h("span", { class: P + "herofb", style: { background: genreGrad(primaryGenre(e), 135) } }, svgIcon("music", { size: 40, color: "rgba(255,255,255,0.85)" }));
  if (heroImg) heroImg.addEventListener("error", () => heroImg.replaceWith(heroFallback()), { once: true });
  const titleEl = h("span", { class: P + "etitle" }, info.title);
  const stamp = h("span", { class: P + "stamp" }, h("span", { class: P + "stamp-t" }, "GİRİŞ YAPILDI"), h("span", { class: P + "stamp-h" }));
  const sheenMain = h("span", { class: P + "sheen", style: { top: "-20px" } });
  const cutMain = h("div", { class: P + "cut-main" },
    h("span", { class: P + "holo", style: { top: "0" } }),
    h("div", { class: P + "paper-main" },
      h("div", { class: P + "hero" }, heroImg || heroFallback(), h("span", { class: P + "badge" }, "GIGBRIDGE · E-BİLET")),
      h("div", { class: P + "head" },
        h("span", { class: P + "egenre" }, info.genre),
        titleEl,
        h("span", { class: P + "eartist" }, info.artist)),
      h("div", { class: P + "info" },
        ...[["TARİH", info.date], ["SAAT", info.time], ["MEKAN", info.venue]].map(([l, v], i) =>
          h("div", { class: P + "icol" }, h("span", { class: P + "ilbl" }, l), h("span", { class: cx(P + "ival", i === 2 && "is-2") }, v))))),
    sheenMain);
  const main = h("div", { class: P + "main" }, cutMain);

  // ── Koçan (QR) ──
  const qrBox = h("div", { class: P + "qr" });
  const qrLabel = h("span", { class: P + "qrlbl" }, "GİRİŞTE OKUT");
  const stub = h("div", { class: P + "stub" },
    h("div", { class: P + "cut-stub" },
      h("span", { class: P + "holo", style: { top: "-314px" } }),
      h("div", { class: P + "paper-stub" }, qrBox, qrLabel),
      h("span", { class: P + "sheen", style: { top: "-334px" } })));
  const perf = h("span", { class: P + "perfline", "aria-hidden": "true" });
  const done = h("div", { class: P + "done", role: "status", "aria-live": "polite" },
    h("span", { class: P + "done-ic" }, svgRaw(I_CHECK, { size: 18, sw: "2.4" })),
    h("span", { class: P + "done-t" }, "GİRİŞ ONAYLANDI"),
    h("span", { class: P + "done-s" }));
  const bitsWrap = BITS.map((b) => h("span", { class: cx(P + "bit", P + "bit-" + b.k), style: { top: b.y + "px", left: b.x + "px", width: b.s + "px", height: b.s + "px", animationDelay: b.d + "ms" } }));
  const float = h("div", { class: P + "float" }, stub, main, perf);
  const fit = h("div", { class: P + "fit" }, h("div", { class: P + "tin" }, float));

  const hint = h("span", { class: P + "hint" }, IDLE_HINT);
  const closeBtn = h("button", { type: "button", class: cx(P + "close", "dk-press"), "aria-label": "E-bileti kapat" }, svgRaw(I_X, { size: 16, sw: "2" }), "KAPAT");
  const bg = h("button", { type: "button", class: P + "bg", "aria-label": "Bileti kapat", tabindex: "-1" });
  const ovl = h("div", { class: cx("dk-biletlerim", P + "ovl"), role: "dialog", "aria-modal": "true", "aria-label": "E-bilet", "aria-describedby": sumId, tabindex: "-1" },
    bg, summary, announcer, fit, h("div", { class: P + "below" }, hint, closeBtn));

  // ── QR alanı içeriği ──
  let qrContent = null;
  const lock = h("span", { class: P + "lock" }, ...["tl", "tr", "bl", "br"].map((k) => h("span", { class: cx(P + "corner", "is-" + k) })));
  const beam = h("span", { class: P + "beam" }, h("span", { class: P + "trail" }));
  const ring = h("span", { class: P + "ring" });
  const pop = h("span", { class: P + "pop" }, svgRaw(I_CHECK, { size: 26, sw: "2.6" }));
  let qrLibFailed = false;
  let qrRenderSeq = 0;
  function setQrContent(node) {
    if (qrContent === node) return;
    // odaklı içerik ("YENİDEN DENE") değişirse odak diyalog içinde kalsın (KAPAT) — ör. hata sırasında check-in gelirse
    const hadFocus = !!qrContent?.contains(document.activeElement);
    if (qrContent) qrContent.remove();
    qrContent = node;
    if (node) qrBox.prepend(node);
    if (hadFocus && alive) closeBtn.focus({ preventScroll: true });
  }
  function renderQr() {
    const value = qr.token ?? (usedKnown ? `gigbridge:bilet:kullanildi:${eventId}` : null);
    if (value && !qrLibFailed) {
      const seq = ++qrRenderSeq;
      loadQrLib().then((lib) => {
        if (!alive || seq !== qrRenderSeq) return;
        const decorative = !qr.token;
        const box = h("div", decorative
          ? { class: P + "qrimg", "aria-hidden": "true" }
          : { class: P + "qrimg", role: "img", "aria-label": "Giriş QR kodu. Girişte görevliye okut." }, qrSvg(lib, value));
        setQrContent(box);
        syncWake();
      }).catch(() => {
        if (!alive || seq !== qrRenderSeq) return;
        qrLibFailed = true;
        qr = { ...qr, error: true, hint: "QR KODU ŞU AN YÜKLENEMİYOR" };
        renderQr();
        render();
      });
      if (!qrContent) setQrContent(skeleton());
      return;
    }
    qrRenderSeq++;
    if ((qr.error || qrLibFailed) && !usedKnown) {
      setQrContent(h("button", { type: "button", class: P + "qrretry", "aria-label": "QR kodu yüklenemedi. Yeniden dene", onclick: retry },
        svgIcon("refresh", { size: 22, color: "#3A3D44" }), h("span", {}, "YENİDEN DENE")));
    } else setQrContent(skeleton());
  }
  const skeleton = () => h("div", { class: P + "qrskel", role: "img", "aria-label": "QR kodu yükleniyor" }, h("span", { class: P + "spin" }));
  function retry() {
    qrLibFailed = false;
    qr = { ...qr, error: false, hint: null };
    setQrContent(skeleton()); // odaklı "YENİDEN DENE" çıkar → setQrContent odağı KAPAT'a taşır
    if (!ovl.contains(document.activeElement)) closeBtn.focus({ preventScroll: true });
    render();
    loadToken();
  }

  // ── Durum → DOM (ETicket.tsx bayrakları) ──
  function render() {
    const stubOn = phase !== "used";
    const lockOn = phase === "scanning" || phase === "confirmed" || phase === "tearing";
    const okOn = phase === "confirmed" || phase === "tearing";
    const stampOn = phase === "tearing" || phase === "used";
    const tearing = phase === "tearing";
    if (stubOn && stub.parentNode !== float) float.prepend(stub);
    if (!stubOn && stub.parentNode) stub.remove();
    stub.classList.toggle(P + "tearoff", tearing);
    main.classList.toggle(P + "recoil", tearing);
    if (lockOn && !lock.parentNode) qrBox.append(lock); else if (!lockOn && lock.parentNode) lock.remove();
    if (phase === "scanning" && !beam.parentNode) qrBox.append(beam); else if (phase !== "scanning" && beam.parentNode) beam.remove();
    if (okOn && !ring.parentNode) qrBox.append(ring, pop); else if (!okOn && ring.parentNode) { ring.remove(); pop.remove(); }
    qrBox.classList.toggle("is-ok", okOn);
    qrLabel.textContent = phase === "idle" ? "GİRİŞTE OKUT" : phase === "scanning" ? "OKUNUYOR…" : "OKUNDU";
    qrLabel.classList.toggle("is-strong", okOn);
    perf.style.opacity = stubOn && !tearing ? "1" : "0";
    stamp.lastChild.textContent = usedAt;
    if (stampOn && !stamp.parentNode) cutMain.insertBefore(stamp, sheenMain);
    stamp.classList.toggle(P + "stamp-in", tearing);
    // yeniden ekleme animasyonu baştan başlatır → yalnız bağlı değilse ekle
    if (tearing && !bitsWrap[0].parentNode) float.append(...bitsWrap); else if (!tearing) bitsWrap.forEach((b) => b.remove());
    done.lastChild.textContent = usedAt ? `${usedAt} · İyi eğlenceler!` : "İyi eğlenceler!";
    if (stampOn && !done.parentNode) float.append(done);
    done.classList.toggle("dk-rise", tearing);
    done.classList.toggle(P + "done-in", tearing);
    // artboard: "BU BİLET KULLANILDI" okundu anından (950 ms) itibaren; açılışta zaten kullanılmışsa hemen (okutma oynamayacaksa)
    const showUsed = okOn || phase === "used" || (usedKnown && phase === "idle" && triggered && !timers.size);
    hint.textContent = showUsed ? USED_HINT : usedKnown ? IDLE_HINT : qr.error && qr.hint ? qr.hint : IDLE_HINT;
    hint.classList.toggle("is-err", !usedKnown && phase !== "used" && !!qr.error);
    syncWake();
  }
  const setPhase = (p) => { phase = p; render(); };
  const announce = (t) => { announcer.textContent = ""; setTimeout(() => { if (alive) announcer.textContent = t; }, 60); };

  function goFinal() { clearTimers(); setPhase("used"); }
  function play() {
    clearTimers();
    setPhase("scanning");
    later(T_CONFIRM, () => { setPhase("confirmed"); announce("Giriş onaylandı"); });
    later(T_TEAR, () => setPhase("tearing"));
    later(T_END, () => { setPhase("used"); markTicketAnimated(ticketKey); });
  }
  /** Canlı durum / token yanıtı → 'used' ise BİR KEZ tetikle (tekrar gelen olay yok sayılır). */
  function handleLive(st) {
    if (!alive || st.status !== "used") return;
    if (st.checkedInAt != null) usedAt = clockOf(st.checkedInAt);
    const first = !usedKnown;
    usedKnown = true;
    stopRefresh();
    if (first && !qr.token) renderQr();
    if (triggered) { render(); return; }
    triggered = true;
    if (hasAnimatedTicket(ticketKey)) { goFinal(); return; }
    const start = () => {
      if (reduce) { goFinal(); announce("Giriş onaylandı"); markTicketAnimated(ticketKey); return; }
      play();
    };
    // Açılır açılmaz 'used' geldiyse okutma, bilet gbTicketIn (620 ms) ile yerine oturduktan sonra başlar
    const wait = reduce ? 0 : Math.max(0, ENTER_MS - (performance.now() - openedAt));
    render();
    if (wait > 0) later(wait, start); else start();
  }

  // ── Token yaşam döngüsü ──
  // Tek döngü: her çağrı sıra numarası alır; yalnız EN SON çağrının yanıtı işlenir ve yenileme zamanlayıcısı kurulmadan önce
  // eskisi temizlenir → görünürlük olayı çağrı sürerken gelse de iki paralel 25 sn döngüsü oluşmaz.
  let tokenSeq = 0;
  let tokenInFlight = false;
  const scheduleToken = (ms) => { stopRefresh(); if (alive && !usedKnown) refreshT = setTimeout(loadToken, ms); };
  async function loadToken() {
    stopRefresh();
    if (usedKnown || !alive) return;
    const seq = ++tokenSeq;
    tokenInFlight = true;
    try {
      const r = await fetchTicketQrToken(eventId);
      if (!alive || seq !== tokenSeq) return;
      if (r.used) { handleLive({ status: "used", checkedInAt: r.checkedInAt }); return; }
      if (usedKnown) return; // çağrı sürerken canlı check-in geldi → bu token artık gösterilmez
      qrExp = r.expiresAt;
      qr = { token: r.token, error: r.token == null, hint: r.token == null ? "QR KODU ŞU AN YÜKLENEMİYOR" : null };
      renderQr();
      render();
      scheduleToken(QR_REFRESH_MS);
    } catch (err) {
      if (!alive || seq !== tokenSeq || usedKnown) return;
      const stale = Date.now() > qrExp;
      if (stale || !qr.token) { qr = { token: null, error: true, hint: tokenErrorHint(err) }; renderQr(); render(); }
      else scheduleToken(QR_RETRY_MS);
    } finally {
      if (seq === tokenSeq) tokenInFlight = false;
    }
  }

  // ── Ekranı açık tut (app'teki parlaklık artırımının web karşılığı): QR gerçekten görünürken ──
  function syncWake() {
    const want = alive && phase === "idle" && !usedKnown && !!qr.token && document.visibilityState === "visible";
    if (want && !wake && navigator.wakeLock?.request) {
      wake = navigator.wakeLock.request("screen").then((w) => { if (!alive || !wake) { w.release().catch(() => {}); return null; } return w; }).catch(() => null);
    } else if (!want && wake) {
      const p = wake; wake = null;
      p.then((w) => w?.release().catch(() => {}));
    }
  }

  // ── Katman: ESC / odak tuzağı / inert / kaydırma kilidi ──
  const app = document.getElementById("app");
  const appWasInert = app?.hasAttribute("inert");
  const de = document.documentElement;
  const sbw = window.innerWidth - de.clientWidth;
  const saved = { o: de.style.overflow, p: document.body.style.paddingRight };
  function onKey(ev) {
    if (ev.defaultPrevented) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close("esc"); return; }
    if (ev.key !== "Tab") return;
    const f = [...ovl.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!f.length) { ev.preventDefault(); ovl.focus({ preventScroll: true }); return; }
    const first = f[0], last = f[f.length - 1];
    const ae = document.activeElement;
    const inside = ovl.contains(ae) && ae !== ovl;
    if (ev.shiftKey && (ae === first || !inside)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (ae === last || !inside)) { ev.preventDefault(); first.focus(); }
  }
  const onVis = () => {
    // sekme geri geldi → token'ı tazele (çağrı zaten sürüyorsa onun yanıtı yeterince taze)
    if (document.visibilityState === "visible" && !usedKnown && !tokenInFlight) loadToken();
    wake = null; // sekme gizlenince tarayıcı kilidi zaten bırakır
    syncWake();
  };
  const onMotion = (ev) => {
    reduce = !!ev.matches;
    if (reduce && (phase === "scanning" || phase === "confirmed" || phase === "tearing")) {
      if (phase === "scanning") announce("Giriş onaylandı");
      goFinal();
      markTicketAnimated(ticketKey);
    }
  };
  const onResize = () => {
    // küçük ekranda bileti sığdır (app `fit`): (yükseklik − 32 − 22 − 44) / 540, [0.6, 1]
    const raw = (window.innerHeight - 32 - 22 - 44) / 540;
    const f = Math.min(1, Math.max(0.6, raw));
    ovl.style.setProperty("--dk-biletlerim-fit", String(f));
    // 0.6 da sığmıyorsa (≈ < 422 px yükseklik; yatay telefon / küçük pencere) katman üstten başlar ve kayar → KAPAT erişilebilir
    ovl.classList.toggle(P + "scroll", raw < 0.6);
  };
  const onTeardown = (ev) => { const r = ev.detail?.reason; if (r === "mode" || r === "identity") close("teardown"); };

  let closed = false;
  function close(reason = "close") {
    if (closed) return;
    closed = true;
    alive = false;
    clearTimers();
    stopRefresh();
    try { unsub(); } catch (_) {}
    syncWake();
    if (wake) { const p = wake; wake = null; p.then((w) => w?.release().catch(() => {})); }
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("dk:teardown", onTeardown);
    try { rmq?.removeEventListener?.("change", onMotion); } catch (_) {}
    if (app && !appWasInert) app.removeAttribute("inert");
    de.style.overflow = saved.o; document.body.style.paddingRight = saved.p;
    ovl.remove();
    try { if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === "function") prevFocus.focus({ preventScroll: true }); } catch (_) {}
    onClose?.(reason);
  }
  // Çift tık / çift dokunuş: kartı açan ilk tıktan hemen sonra gelen ikinci tık artık zemine düşer → açılıştan sonraki
  // kısa pencerede zemin tıkı yok sayılır (ESC / KAPAT her zaman çalışır).
  const BG_GUARD_MS = 500;
  bg.addEventListener("click", (ev) => {
    if (performance.now() - openedAt < BG_GUARD_MS) { ev.preventDefault(); return; }
    close("backdrop");
  });
  closeBtn.addEventListener("click", (ev) => {
    // aynı çift tıkın ikinci tıkı KAPAT'ın üstüne denk gelebilir (işaretçi tıkı: detail > 0; klavye Enter/Space: 0)
    if (ev.detail > 0 && performance.now() - openedAt < BG_GUARD_MS) return;
    close("x");
  });

  // ── Aç ──
  onResize();
  render();
  renderQr();
  portalRoot().append(ovl);
  if (app) app.setAttribute("inert", "");
  de.style.overflow = "hidden";
  if (sbw > 0) document.body.style.paddingRight = sbw + "px";
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("resize", onResize);
  window.addEventListener("dk:teardown", onTeardown);
  try { rmq?.addEventListener?.("change", onMotion); } catch (_) {}
  requestAnimationFrame(() => { if (alive) closeBtn.focus({ preventScroll: true }); });
  // Başlık tek satır, sığmazsa küçülür (app adjustsFontSizeToFit, minimumFontScale 0.7)
  const fitTitle = () => {
    if (!alive) return;
    let size = 27;
    titleEl.style.fontSize = "";
    while (titleEl.scrollWidth > titleEl.clientWidth + 0.5 && size > 27 * 0.7) { size -= 0.5; titleEl.style.fontSize = size + "px"; }
  };
  requestAnimationFrame(fitTitle);
  document.fonts?.ready?.then(fitTitle).catch(() => {});

  // Canlı bilet durumu (görevli okuttuğu an ticketStatus:'used')
  if (initial?.status === "used") handleLive(initial);
  unsub = subscribeTicket(eventId, uid, handleLive);
  loadToken();

  return { close, eventId };
}

// ══════════════════════════════════════════════════════════════════════
// Görünüm
// ══════════════════════════════════════════════════════════════════════
export function biletlerimView(ctx) {
  const sess = ctx?.session || storeSession;
  const uid = sess.user && !sess.guest ? sess.user.uid : null;
  const sessKey = (x) => `${x?.user?.uid || ""}|${x?.guest ? 1 : 0}|${x?.user?.emailVerified ? 1 : 0}|${JSON.stringify(x?.profile || null)}`;
  const openedWith = sessKey(sess);
  const shell = accountShell({ active: "biletlerim", contentGap: 32, session: sess });
  const content = shell.content;
  content.classList.add("dk-biletlerim");
  const countsReady = Promise.resolve(shell.refreshCounts()).catch(() => null);

  let alive = true;
  let tab = ctx?.query?.get("sekme") === "gecmis" ? "past" : "up";
  let wantTicket = ctx?.query?.get("bilet") || null;
  let tickets = null; // null = yükleniyor
  let upcoming = [];
  let past = [];
  const live = new Map(); // eventId → { status, checkedInAt }
  const cards = new Map(); // eventId → ticketCard
  let liveUnsubs = [];
  let coords = null;
  let modal = null;

  // ── Başlık + sayaç ──
  const countTxt = h("span", {});
  const count = h("span", { class: P + "count", "aria-live": "polite" }, h("span", { class: P + "dot", "aria-hidden": "true" }), countTxt);
  const head = dkPageHead({ title: "Bilet", em: "lerim", lead: "Katıldığın etkinliklerin e-biletleri. Girişte bileti aç, QR kodu görevliye okut.", right: count });

  // ── Sekmeler ──
  const seg = dkSegmented({
    label: "Bilet listesi", value: tab, countColor: "#8A8E97",
    items: [{ key: "up", label: "Yaklaşan", count: "" }, { key: "past", label: "Geçmiş", count: "" }],
    onChange: (k) => setTab(k, true),
  });
  const tabIds = { up: "dk-bl-tab-up", past: "dk-bl-tab-past" };
  const panelId = "dk-bl-panel";
  seg.querySelectorAll('[role="tab"]').forEach((b, i) => { b.id = i === 0 ? tabIds.up : tabIds.past; b.setAttribute("aria-controls", panelId); });
  const tabsRow = h("div", { class: cx(P + "tabs", "dk-rise"), style: { "--dk-delay": "80ms" } },
    seg, h("span", { class: P + "note" }, "Bilet, etkinlik başlangıcından 6 saat sonrasına kadar geçerlidir."));
  const panel = h("div", { id: panelId, role: "tabpanel", class: P + "panel" });

  // ── Girişte nasıl kullanılır ──
  const STEPS = [
    ["01", "Bileti aç", "Kapıda bilet kartına tıkla; e-bilet tam ekran açılır."],
    ["02", "QR'ı okut", "Mekan görevlisi koçandaki QR kodu okutur."],
    ["03", "Koçan yırtılır", "Giriş onaylanır, bilet \"Giriş yapıldı\" damgasıyla kalır."],
  ];
  const how = h("section", { class: cx(P + "how", "dk-rise"), style: { "--dk-delay": "200ms" }, "aria-labelledby": "dk-bl-how" },
    h("h2", { id: "dk-bl-how", class: P + "how-h" }, "GİRİŞTE NASIL KULLANILIR"),
    h("ol", { class: P + "steps" }, ...STEPS.map(([n, t, b]) => h("li", { class: P + "step" },
      h("span", { class: P + "step-n" }, n),
      h("span", { class: P + "step-c" }, h("span", { class: P + "step-t" }, t), h("span", { class: P + "step-b" }, b))))));

  content.append(head, tabsRow, panel, how);

  // ── Durum ──
  const stateOf = (e) => live.get(e.id) || initialState(e);
  const activeCount = () => upcoming.filter((e) => stateOf(e).status !== "used").length;
  function syncCounts() {
    if (!Array.isArray(tickets)) { // yükleniyor / hata: sayı yok
      count.style.visibility = "hidden";
      seg.dk.setCount("up", ""); seg.dk.setCount("past", "");
      return;
    }
    count.style.visibility = "";
    countTxt.textContent = `${activeCount()} AKTİF BİLET`;
    seg.dk.setCount("up", upcoming.length);
    seg.dk.setCount("past", past.length);
    // Kenar menüsü "Biletlerim" hapı = aktif (okutulmamış) yaklaşan bilet (spec §3). Kabuğun önbellekli sayacı (kurulumda
    // istenen aynı promise) çözüldükten SONRA yazılır → üzerine yazılmaz.
    // SHARED-CANDIDATE: live.accountCounts().tickets okutulmuş (used) biletleri de sayıyor; spec aktif = ticketStatus !== 'used'.
    countsReady.then(() => { if (alive && Array.isArray(tickets)) shell.setCount("tickets", activeCount()); });
  }
  function distOf(e) {
    const lat = e?.location?.lat, lng = e?.location?.lng;
    if (!coords || lat == null || lng == null) return "";
    const km = haversineKm(coords, { lat: Number(lat), lng: Number(lng) });
    return Number.isFinite(km) ? fmtKm(km) : "";
  }

  function renderPanel() {
    cards.clear();
    panel.setAttribute("aria-labelledby", tabIds[tab]);
    if (tickets == null) {
      panel.replaceChildren(h("div", { class: P + "grid-up", "aria-busy": "true" }, skeletonCard(), skeletonCard(), skeletonCard()));
      return;
    }
    if (tickets === false) {
      panel.replaceChildren(dkEmpty({
        icon: "alertCircle", ring: true, title: "Bir sorun oldu", sub: "Bağlantını kontrol edip tekrar dene.",
        action: dkButton("Tekrar dene", { variant: "light", size: 42, onClick: () => load({ refocus: true }) }),
      }));
      return;
    }
    if (tab === "up") {
      if (!upcoming.length) {
        panel.replaceChildren(dkEmpty({
          icon: "ticket", ring: true, title: "Aktif biletin yok.", sub: "Keşfet'ten bir etkinliğe \"Katıl\" dediğinde bileti burada görünür.",
          action: dkButton("Keşfet'e git", { variant: "light", size: 42, href: "#/kesfet" }),
        }));
        return;
      }
      const grid = h("div", { class: P + "grid-up" });
      upcoming.forEach((e, i) => {
        const c = ticketCard(e, stateOf(e), { index: i, onOpen: (ev) => openTicket(ev) });
        c.setDist(distOf(e));
        cards.set(e.id, c);
        grid.append(c.node);
      });
      panel.replaceChildren(grid);
    } else {
      if (!past.length) {
        panel.replaceChildren(dkEmpty({ icon: "clock", ring: true, title: "Geçmiş biletin yok.", sub: "Katıldığın etkinlikler bittiğinde burada puanlayabilirsin." }));
        return;
      }
      panel.replaceChildren(h("div", { class: P + "grid-past" }, ...past.map((e, i) => pastCard(e, stateOf(e), { index: i }))));
    }
  }

  function setTab(k, fromUser) {
    if (k !== "up" && k !== "past") k = "up";
    const changed = k !== tab;
    tab = k;
    if (seg.dk.get() !== k) seg.dk.set(k);
    if (fromUser) writeQuery({ sekme: k === "past" ? "gecmis" : null });
    if (changed) renderPanel();
  }

  // ── Canlı check-in dinleyicileri (yaklaşan biletler; app TicketsScreen) ──
  function subscribeUpcoming() {
    liveUnsubs.forEach((f) => { try { f(); } catch (_) {} });
    liveUnsubs = [];
    if (!uid) return;
    upcoming.forEach((e) => {
      liveUnsubs.push(subscribeTicket(e.id, uid, (st) => {
        if (!alive) return;
        const cur = live.get(e.id) || initialState(e);
        if (cur.status === st.status && cur.checkedInAt === st.checkedInAt) return;
        live.set(e.id, st);
        cards.get(e.id)?.setState(st);
        syncCounts();
      }));
    });
  }

  // ── Bilet modalı ──
  function openTicket(e) {
    if (!uid || !alive) return;
    if (modal) modal.close("replace");
    modal = openETicket({
      e, uid, initial: stateOf(e),
      onClose: () => {
        modal = null;
        wantTicket = null;
        if (alive && readBilet() === e.id) writeQuery({ bilet: null });
      },
    });
    wantTicket = e.id;
    writeQuery({ bilet: e.id });
  }
  const readBilet = () => new URLSearchParams((location.hash.split("?")[1]) || "").get("bilet");
  function syncTicketFromQuery() {
    if (tickets == null || tickets === false) return;
    if (!wantTicket) { if (modal) modal.close("query"); return; }
    if (modal?.eventId === wantTicket) return;
    const e = upcoming.find((x) => x.id === wantTicket);
    if (e) openTicket(e);
    else { wantTicket = null; writeQuery({ bilet: null }); }
  }

  // ── Yükleme ──
  // "Tekrar dene" iskelet çizilirken DOM'dan çıkar → odak <body>'ye düşmesin: yeniden çizimden sonra panelin ilk
  // odaklanabilir öğesine (ilk bilet / yeni "Tekrar dene" / "Keşfet'e git"), yoksa panelin kendisine taşınır.
  function focusPanel() {
    if (!alive || (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) return;
    let t = panel.querySelector('button:not([disabled]), a[href]');
    if (!t) { panel.setAttribute("tabindex", "-1"); t = panel; }
    t.focus({ preventScroll: true });
  }
  async function load({ refocus = false } = {}) {
    tickets = null;
    syncCounts();
    renderPanel();
    if (!uid) { tickets = []; upcoming = []; past = []; syncCounts(); renderPanel(); if (refocus) focusPanel(); return; }
    let list;
    try { list = await loadTickets(uid); } catch (err) {
      if (!alive) return;
      console.warn("[biletlerim] biletler yüklenemedi", err?.code || err?.message || err);
      tickets = false; syncCounts(); renderPanel(); if (refocus) focusPanel(); return;
    }
    if (!alive) return;
    const now = Date.now();
    const up = [], pa = [];
    for (const e of list) {
      const st = eventStartMs(e);
      if (st == null || st + TICKET_VALID_TAIL_MS > now) up.push(e); else pa.push(e);
    }
    // Yaklaşan: en yakın önce (tarihsizler sona; eşitlikte en yeni katılım); geçmiş: en yeni önce
    up.sort((a, b) => ((eventStartMs(a) ?? Infinity) - (eventStartMs(b) ?? Infinity)) || ((b.att?.joinedAt || 0) - (a.att?.joinedAt || 0)));
    pa.sort((a, b) => (eventStartMs(b) ?? 0) - (eventStartMs(a) ?? 0));
    tickets = list; upcoming = up; past = pa;
    live.clear();
    syncCounts();
    renderPanel();
    subscribeUpcoming();
    if (refocus) focusPanel();
    syncTicketFromQuery();
  }

  // Mesafe için konum (legacy ticketsView gibi sayfa açılışında bir kez, 8 sn); izin yoksa rozet gizli kalır
  if (navigator.geolocation) {
    try {
      navigator.geolocation.getCurrentPosition((pos) => {
        if (!alive) return;
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        upcoming.forEach((e) => cards.get(e.id)?.setDist(distOf(e)));
      }, () => {}, { timeout: 8000, maximumAge: 5 * 60 * 1000 });
    } catch (_) {}
  }

  load();

  return {
    node: shell.node,
    update(q) {
      const k = q?.get("sekme") === "gecmis" ? "past" : "up";
      setTab(k, false);
      wantTicket = q?.get("bilet") || null;
      syncTicketFromQuery();
    },
    onSession(s) { return sessKey(s) === openedWith; },
    destroy() {
      alive = false;
      if (modal) { try { modal.close("destroy"); } catch (_) {} modal = null; }
      liveUnsubs.forEach((f) => { try { f(); } catch (_) {} });
      liveUnsubs = [];
      shell.destroy();
    },
  };
}
