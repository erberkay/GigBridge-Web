// WebMekanAnalitik — "Analitik" masaüstü görünümü (≥769 px). Registry anahtarı: venueAnalitik (#/venue/analitik, yalnız mekan).
// Spec: specs/mekan.md WebMekanAnalitik (+ §0 kabuk). Artboard: design/WebMekanAnalitik.dc.html. CSS: css/dk-mekan-analitik.css
// (.dk-mekan-analitik kökü = kabuğun içerik bölgesi). ≤768: legacy renderAnalytics aynen.
//
// Legacy (js/pages/venue.js renderAnalytics + mCard/smCard/statCard/reviewItem) özellikleri — KORUNDU:
//   dönem (Bu Hafta / Bu Ay / 3 Ay / 1 Yıl; [şimdi − gün, şimdi]; varsayılan 30), TÜM metrik formülleri (toplam katılım, ort. gece,
//   gelir = bilet × katılım, iptal oranı, farklı sanatçı, ort. bilet, yorum sayısı, ort. puan = venueRating), günlük doluluk
//   (Pzt→Paz), YOĞUN SAATLER (kart 03'te Günler | Saatler geçişi), müzik türü dağılımı (ilk 5; katılım 0 ise 1 sayılır),
//   sanatçı performansları (ilk 5), müşteri yorumlarının TAM listesi (yalnız authorType müşteri; "Tüm yorumlar" modalı),
//   yorum yok notu, genel özet (tüm zamanlar: venueStats formülleri — Toplam Etkinlik / Yaklaşan / Toplam Katılım / Ort. Katılım /
//   Sanatçılı / VIP), "Yüklenemedi" hata durumu.
// Tasarımın ekledikleri: trend çizgi grafiği (Katılım | Gelir, üzerine gelme/odak/tık ipucu), etkinlik bazında sonuç tablosu,
//   sanatçı seçimi + sahne performansı paneli, tarih aralığı etiketi, pano yerleşimi. "ÖRNEK VERİ" etiketi ÇİZİLMEZ (spec).
//
// URL: #/venue/analitik?donem=7|30|90|365&seri=gelir&dagilim=saat&sanatci={artistId|artistName}&ev={eventId} (replaceState;
//   update(query) geri/ileri + paylaşılan bağlantı). ?ev → tablo 05'e kaydırır + satırı vurgular (aralık dışıysa dönem 1 Yıl).
// Okumalar (yazım YOK): events where venueId==uid (yerel salt-okuma — venueEvents()/venueStats() KULLANILMAZ: afiş temizleme
//   yazım yan etkisi var; formüller birebir), getVenueReviews (yalnız okuma), userById (ilk 5 sanatçının foto/puanı, önbellekli).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { db, collection, query, where, getDocs } from "../../firebase.js";
import { getVenueReviews, userById } from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkModal, dkSkeleton } from "../shared/ui.js";
import { trUpper, writeQuery, eventStartMs, MONTHS_TR, MONTHS_TR_SHORT, DAYS_TR_SHORT, toMs, isLive, isEventOver, clamp } from "../shared/helpers.js";
import { genreColor } from "../shared/genres.js";

const PERIODS = [[7, "Bu Hafta"], [30, "Bu Ay"], [90, "3 Ay"], [365, "1 Yıl"]];
const NF = new Intl.NumberFormat("tr-TR");
const fmt = (n) => NF.format(Math.round(Number(n) || 0));
const TL = (n) => "₺" + fmt(n);
const dl = (ms) => { const d = new Date(ms); return d.getDate() + " " + MONTHS_TR_SHORT[d.getMonth()]; };
const firstGenre = (e) => (Array.isArray(e.genre) ? e.genre[0] : e.genre) || "";
const att = (e) => Number(e.attendeeCount) || 0;
const price = (e) => Number(e.ticketPrice) || 0;
// takvim günü başı: `back` gün önce 00:00 (negatif → ileri); DST'de de doğru (Date aritmetiği)
const dayStart = (ms, back = 0) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime(); };
// Dönem penceresi (TEK başlangıç) = legacy renderAnalytics + spec: [şimdi − dönem × 24 sa, şimdi] → ≤768 (legacy) ile aynı
// KPI'lar. KPI'lar, kartlar 02–05, grafik kovaları (ilk kova `since`'ten başlar; kovalar gün sınırlı) ve aralık etiketi aynı `since`.
const sinceOf = (period, now) => now - period * 86400e3;

// Artboard SVG gövdeleri (birebir)
const I = {
  users: '<circle cx="9" cy="8.5" r="3.5"></circle><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"></path><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.3c1.8.7 3 2.3 3.5 4.7"></path>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M6.5 9.5v.01M17.5 14.5v.01"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"></path><path d="M14 7v10" stroke-dasharray="2 2"></path>',
  xcircle: '<circle cx="12" cy="12" r="8.5"></circle><path d="M9 9l6 6M15 9l-6 6"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8 8z"></path><circle cx="8" cy="8.5" r="1.4"></circle>',
  chat: '<path d="M4 5h16v11H9l-5 4z"></path><path d="M8 9.5h8M8 12.5h5"></path>',
  chevR: '<path d="m9 6 6 6-6 6"></path>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
};
const ico = (k, size = 16, o = {}) => svgRaw(I[k], { size, sw: "1.8", ...o });

// Yıldızlar (gerçek puana göre: dolu / yarım / boş — artboard hep 5 dolu çiziyordu; spec)
function stars(r, size, gap) {
  const r2 = Math.round(clamp(Number(r) || 0, 0, 5) * 2) / 2;
  const row = h("span", { class: "dk-mekan-analitik-stars", style: { gap: gap + "px" }, role: "img", "aria-label": `5 üzerinden ${r2.toLocaleString("tr-TR")} yıldız` });
  for (let i = 1; i <= 5; i++) {
    const full = i <= r2, half = !full && i - 0.5 === r2;
    if (full) row.append(svgRaw(I.star, { size, fill: true, color: "#FF8A2A" }));
    else row.append(h("span", { class: "dk-mekan-analitik-starw", style: { width: size + "px", height: size + "px" } },
      svgRaw(I.star, { size, sw: "1.8", color: "#FF8A2A" }),
      half ? svgRaw(I.star, { size, fill: true, color: "#FF8A2A", cls: "dk-mekan-analitik-starhalf" }) : null));
  }
  return row;
}

// Mekan puanı — legacy venueRating birebir (users denorm; yoksa venueReviews'tan)
function venueRating(p, revs) {
  let avg = Number(p?.avgRating) || 0, count = Number(p?.reviewCount) || 0;
  if (!avg || !count) {
    const rated = (revs || []).filter((r) => Number(r.overallRating ?? r.rating) > 0);
    if (!count) count = rated.length;
    if (!avg) avg = rated.length ? rated.reduce((a, r) => a + Number(r.overallRating ?? r.rating), 0) / rated.length : 0;
  }
  return { avg, count };
}
async function venueEventsRO(uid) {
  const s = await getDocs(query(collection(db, "events"), where("venueId", "==", uid)));
  // çevrimdışı: SDK boş önbellek sonucu döndürür → "0" metrikler yerine hata durumu (Tekrar dene)
  if (s.empty && s.metadata.fromCache) throw new Error("offline");
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// id → { p: Promise<user|null>, v, done } — çözülen değer eşzamanlı okunur. Hata önbelleğe ALINMAZ (geçici hata kalıcı "—" bırakmasın);
// önbellek her load()'da (ilk yükleme + "Tekrar dene") temizlenir → puan/foto her açılışta tazelenir.
const _users = new Map();
function userInfo(id) {
  let c = _users.get(id);
  if (!c) {
    c = { v: null, done: false };
    c.p = userById(id).then((v) => { c.v = v; c.done = true; return v; }, () => { if (_users.get(id) === c) _users.delete(id); return null; });
    _users.set(id, c);
  }
  return c.p;
}

// ── URL durumu ──
function readState(q) {
  const p = Number(q?.get("donem"));
  return {
    period: [7, 30, 90, 365].includes(p) ? p : 30,
    series: q?.get("seri") === "gelir" ? "rev" : "att",
    dist: q?.get("dagilim") === "saat" ? "hour" : "day",
    artist: q?.get("sanatci") || "",
    ev: q?.get("ev") || "",
  };
}
const toQuery = (s) => ({ donem: s.period !== 30 ? s.period : null, seri: s.series === "rev" ? "gelir" : null, dagilim: s.dist === "hour" ? "saat" : null, sanatci: s.artist || null, ev: s.ev || null });

// ══════════════════════════════════════════════════════════════════════
export function venueAnalitikView(ctx) {
  const uid = ctx.session?.user?.uid || session.user?.uid;
  const profile = () => session.profile || ctx.session?.profile || {};
  const sigOf = (p) => [p?.displayName || "", p?.photoURL || "", p?.capacity ?? "", p?.avgRating ?? "", p?.reviewCount ?? ""].join("|");
  const sig0 = sigOf(profile());
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });

  let st = readState(ctx.query);
  let events = [], custReviews = [], rating = { avg: 0, count: 0 };
  let loaded = false, failed = false;
  let flip = false;
  let hi = null;              // vurgulu kova (null → en yüksek)
  let expanded = false;       // tablo 05: tüm satırlar
  let pendingEv = st.ev;      // ?ev derin bağlantısı (bir kez uygula)

  const shell = panelShell({ role: "venue", active: ctx.route?.nav || "analitik", title: "Analitik", crumb: "Analitik", ctx });
  const root = shell.content;
  root.classList.add("dk-mekan-analitik");

  // ── HERO ──
  const rangeEl = h("span", { class: "dk-mekan-analitik-range" });
  const periodBtns = PERIODS.map(([d, l]) => {
    const b = h("button", { type: "button", role: "tab", id: "dk-ma-p" + d, "aria-controls": "dk-ma-panel", class: "dk-mekan-analitik-pb dk-press", onclick: () => setPeriod(d) }, l);
    b.dataset.k = String(d); return b;
  });
  const periodSeg = h("div", { role: "tablist", "aria-label": "Dönem", class: "dk-mekan-analitik-pseg" }, ...periodBtns);
  periodSeg.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = PERIODS.findIndex(([d]) => d === st.period);
    const n = PERIODS[(i + (e.key === "ArrowRight" ? 1 : -1) + PERIODS.length) % PERIODS.length][0];
    setPeriod(n); periodBtns.find((b) => b.dataset.k === String(n)).focus();
  });
  const hero = h("div", { class: "dk-mekan-analitik-hero dk-rise" },
    h("div", { class: "dk-mekan-analitik-herocol" },
      h("span", { class: "dk-mekan-analitik-eyebrow" }, "ANALİTİK"),
      h("h2", { class: "dk-mekan-analitik-h2" }, "Mekanının ", h("em", {}, "nabzı"), ", tek ekranda."),
      h("p", { class: "dk-mekan-analitik-lead" }, "Mekanınızın tüm performans verileri · ", rangeEl)),
    h("div", { class: "dk-mekan-analitik-heroright" }, periodSeg));
  const body = h("div", { class: "dk-mekan-analitik-body", role: "tabpanel", id: "dk-ma-panel" }); // Dönem sekmelerinin paneli
  root.append(hero, body);

  // ── ortak parçalar ──
  const animCls = () => (flip ? "dk-fa" : "dk-fb");
  const cardHead = (eyebrow, titleEl, right, id) => h("div", { class: "dk-mekan-analitik-chead" },
    h("div", { class: "dk-mekan-analitik-ccol" }, h("span", { class: "dk-mekan-analitik-ceb" }, eyebrow), h("h3", { class: "dk-mekan-analitik-h3" }, h("span", { id }, titleEl))),
    right || null);
  const miniSeg = (label, items, value, onPick) => {
    const el = h("div", { role: "radiogroup", "aria-label": label, class: "dk-mekan-analitik-sseg" });
    items.forEach(([k, l]) => {
      const on = k === value;
      el.append(h("button", { type: "button", role: "radio", "aria-checked": on ? "true" : "false", tabindex: on ? "0" : "-1", class: "dk-mekan-analitik-sb dk-press", dataset: { k }, onclick: () => onPick(k) }, l));
    });
    el.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const i = items.findIndex(([k]) => k === value);
      const k = items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length][0];
      onPick(k, true);
    });
    return el;
  };
  const dashedEmpty = (text, height) => h("div", { class: "dk-mekan-analitik-dempty", style: { height: height + "px" } }, text);

  // ══════════ hesaplar ══════════
  function compute() {
    const now = Date.now(), since = sinceOf(st.period, now);
    const withMs = events.map((e) => ({ e, ms: eventStartMs(e) })).filter((x) => x.ms != null);
    const inRange = withMs.filter((x) => x.ms >= since && x.ms <= now);
    const ok = inRange.filter((x) => x.e.status !== "cancelled");
    const totalAtt = ok.reduce((a, x) => a + att(x.e), 0);
    const totalRev = ok.reduce((a, x) => a + price(x.e) * att(x.e), 0);
    const priced = ok.filter((x) => price(x.e) > 0);
    const cancelRate = inRange.length ? Math.round(inRange.filter((x) => x.e.status === "cancelled").length / inRange.length * 100) : 0;
    const uniq = new Set(ok.map((x) => x.e.artistId || x.e.artistName).filter(Boolean)).size;
    const avgTicket = priced.length ? Math.round(priced.reduce((a, x) => a + price(x.e), 0) / priced.length) : 0;

    // zaman kovaları (artboard; gün sınırlı, son kova bugünle biter). İlk kova tam `since` anından başlar → grafik toplamı =
    // KPI toplamı (7: ilk gün kovası pencerenin baştaki kısmi gününü de kapsar; 30/90: ilk kova kısalır/uzar; 365: ilk ay kovası).
    let buckets = [];
    if (st.period === 7) {
      for (let i = 6; i >= 0; i--) { const s = dayStart(now, i); const d = new Date(s); buckets.push({ st: s, en: dayStart(now, i - 1), label: DAYS_TR_SHORT[d.getDay()] + " " + d.getDate(), sub: dl(s) }); }
    } else if (st.period === 30 || st.period === 90) {
      const w = st.period === 30 ? 6 : 7, n = st.period === 30 ? 5 : 13;
      for (let i = n - 1; i >= 0; i--) { const s = i === n - 1 ? since : dayStart(now, w * i + w - 1), en = dayStart(now, w * i - 1); buckets.push({ st: s, en, label: dl(s), sub: dl(s) + " – " + dl(en - 1) }); }
    } else {
      const c = new Date(now);
      for (let i = 11; i >= 0; i--) { const s = new Date(c.getFullYear(), c.getMonth() - i, 1); const en = new Date(c.getFullYear(), c.getMonth() - i + 1, 1); buckets.push({ st: i === 11 ? since : s.getTime(), en: en.getTime(), label: MONTHS_TR_SHORT[s.getMonth()], sub: MONTHS_TR_SHORT[s.getMonth()] + " " + s.getFullYear() }); }
    }
    buckets[0].st = since; // (7) ilk gün kovası pencerenin başladığı andan itibaren
    const valOf = (e) => (st.series === "att" ? att(e) : price(e) * att(e));
    buckets = buckets.map((b) => { const evs = ok.filter((x) => x.ms >= b.st && x.ms < b.en); return { ...b, v: evs.reduce((a, x) => a + valOf(x.e), 0), n: evs.length }; });

    // günler (Pzt→Paz) + saatler (legacy)
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    ok.forEach((x) => { byDay[new Date(x.ms).getDay()] += att(x.e); });
    const byHour = {};
    ok.forEach((x) => { const hh = parseInt(String(x.e.startTime || x.e.time || "").split(":")[0], 10); if (isNaN(hh) || hh < 0 || hh > 23) return; byHour[hh] = (byHour[hh] || 0) + att(x.e); });

    // türler (ilk 5; katılım 0 → 1)
    const byG = {};
    ok.forEach((x) => { const g = firstGenre(x.e); if (!g) return; byG[g] = (byG[g] || 0) + (att(x.e) || 1); });
    const gTop = Object.entries(byG).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // sanatçılar (ilk 5; anahtar artistId || artistName)
    const byA = {};
    ok.forEach((x) => {
      const k = x.e.artistId || x.e.artistName; if (!k) return;
      const o = byA[k] || (byA[k] = { key: k, id: x.e.artistId || null, name: x.e.artistName || "Sanatçı", genre: firstGenre(x.e), att: 0, rev: 0, count: 0 });
      o.att += att(x.e); o.rev += price(x.e) * att(x.e); o.count++;
    });
    const aTop = Object.values(byA).sort((a, b) => b.att - a.att).slice(0, 5);

    const rows = inRange.slice().sort((a, b) => b.ms - a.ms);
    return { now, since, inRange, ok, totalAtt, totalRev, cancelRate, uniq, avgTicket, buckets, byDay, byHour, gTop, aTop, rows };
  }
  function overall() { // venueStats formülleri (tüm zamanlar)
    const now = Date.now();
    const ms = (e) => (e.eventAt?.toMillis?.() ?? Date.parse(e.date) ?? 0);
    const total = events.reduce((a, e) => a + (e.attendeeCount ?? 0), 0);
    return {
      eventCount: events.length,
      upcoming: events.filter((e) => e.status === "upcoming" && ms(e) >= now - 6 * 3600e3).length,
      totalAttendance: total,
      avgAttendance: events.length ? Math.round(total / events.length) : 0,
      withArtist: events.filter((e) => e.artistId).length,
      vip: events.filter((e) => e.vipStatus === "approved").length,
      vipPending: events.filter((e) => e.vipStatus === "pending").length,
    };
  }

  // ══════════ çizim ══════════
  let chart = null;       // { box, update(hiIndex), W }
  let ro = null;
  let data = null;

  function render() {
    if (!alive) return;
    paintHero();
    if (!loaded) return renderSkeleton();
    if (failed) return renderError();
    data = compute();
    const d = data;
    const kpi = (icon, label, value) => h("div", { class: "dk-mekan-analitik-kpi" },
      h("div", { class: "dk-mekan-analitik-kpitop" }, h("span", { class: "dk-mekan-analitik-kpiic" }, ico(icon, 16)), h("span", { class: "dk-mekan-analitik-kpil" }, label)),
      h("span", { class: cx("dk-mekan-analitik-kpiv", animCls()) }, value));
    const tile = (icon, label, value, color) => h("div", { class: "dk-mekan-analitik-tile" },
      h("span", { class: "dk-mekan-analitik-tileic" }, ico(icon, 18)),
      h("span", { class: "dk-mekan-analitik-tilecol" }, h("span", { class: "dk-mekan-analitik-tilev", style: color ? { color } : null }, value), h("span", { class: "dk-mekan-analitik-tilel" }, label)));

    const metrics = h("div", { class: "dk-mekan-analitik-metrics" },
      h("section", { "aria-label": "Birincil metrikler", class: "dk-mekan-analitik-kpis" },
        kpi("users", "TOPLAM KATILIM", fmt(d.totalAtt)),
        kpi("moon", "ORT. GECE KATILIMI", d.ok.length ? fmt(d.totalAtt / d.ok.length) : "0"),
        kpi("cash", "TOPLAM GELİR", d.totalRev ? TL(d.totalRev) : "—"),
        kpi("star", "ORT. PUAN", rating.avg ? rating.avg.toFixed(1) : "—")),
      h("section", { "aria-label": "İkincil metrikler", class: "dk-mekan-analitik-tiles" },
        tile("ticket", "Etkinlik Sayısı", String(d.inRange.length)),
        tile("xcircle", "İptal Oranı", d.inRange.length ? "%" + d.cancelRate : "—", d.cancelRate > 10 ? "#FF5A6E" : null),
        tile("mic", "Farklı Sanatçı", String(d.uniq)),
        tile("tag", "Ort. Bilet", d.avgTicket ? TL(d.avgTicket) : "—"),
        tile("chat", "Yorum Sayısı", String(rating.count))));

    const dash = h("div", { class: "dk-mekan-analitik-dash" },
      h("div", { class: "dk-mekan-analitik-row is-a" }, trendCard(), genreCard()),
      h("div", { class: "dk-mekan-analitik-row is-b" }, daysCard(), artistsCard()),
      h("div", { class: "dk-mekan-analitik-row is-c" }, tableCard(), h("div", { class: "dk-mekan-analitik-rcol" }, reviewsCard(), overallCard())));
    body.replaceChildren(metrics, dash);
    requestAnimationFrame(() => { if (alive) chart?.layout(false); });
    if (pendingEv) requestAnimationFrame(() => applyEvLink());
  }
  function paintHero() {
    periodBtns.forEach((b) => { const on = b.dataset.k === String(st.period); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    body.setAttribute("aria-labelledby", "dk-ma-p" + st.period);
    const now = Date.now(), since = sinceOf(st.period, now);
    const y1 = new Date(since).getFullYear(), y2 = new Date(now).getFullYear();
    rangeEl.textContent = trUpper(`${dl(since)} – ${dl(now)} ${y1 === y2 ? y2 : y1 + "–" + String(y2).slice(2)}`);
  }
  function renderSkeleton() {
    body.replaceChildren(h("div", { class: "dk-mekan-analitik-skel", "aria-busy": "true", "aria-label": "Yükleniyor" },
      h("div", { class: "dk-mekan-analitik-kpis" }, ...Array.from({ length: 4 }, () => dkSkeleton({ h: 120, r: 12 }))),
      h("div", { class: "dk-mekan-analitik-tiles" }, ...Array.from({ length: 5 }, () => dkSkeleton({ h: 72, r: 10 }))),
      h("div", { class: "dk-mekan-analitik-row is-a" }, dkSkeleton({ h: 350, r: 12 }), dkSkeleton({ h: 350, r: 12 }))));
  }
  function renderError() {
    body.replaceChildren(h("div", { class: "dk-mekan-analitik-error", role: "alert" }, ico("info", 36, { sw: "1.5", color: "#8A8E97" }),
      h("span", { class: "dk-mekan-analitik-error-t" }, "Yüklenemedi"),
      h("span", { class: "dk-mekan-analitik-error-s" }, "Bağlantıyı kontrol edip yenile."),
      h("button", { type: "button", class: "dk-mekan-analitik-error-b dk-press", onclick: () => load() }, "Tekrar dene")));
  }

  // ── 01 · TREND ──
  function trendCard() {
    const d = data;
    const seriesSeg = miniSeg("Seri", [["att", "Katılım"], ["rev", "Gelir"]], st.series, (k) => { if (k === st.series) return; st.series = k; bump(); requestAnimationFrame(() => body.querySelector('.dk-mekan-analitik-sseg[aria-label="Seri"] [aria-checked="true"]')?.focus()); });
    const card = h("section", { "aria-labelledby": "dk-ma-h-trend", class: "dk-mekan-analitik-card is-trend" },
      cardHead("01 · TREND", st.series === "att" ? "Katılımcı trendi" : "Gelir trendi", seriesSeg, "dk-ma-h-trend"));
    const allZero = !d.buckets.some((b) => b.v > 0);
    if (allZero) { card.append(dashedEmpty("Bu dönem için etkinlik verisi yok", 250)); chart = null; return card; }
    // artboard role="img"; içinde odaklanabilir kova düğmeleri olduğu için role="group" (ekran okuyucu düğmeleri görebilsin)
    const box = h("div", { class: "dk-mekan-analitik-chart", role: "group" });
    card.append(box);
    chart = lineChart(box, d.buckets);
    return card;
  }
  function lineChart(box, buckets) {
    const short = (v, nice) => st.series === "rev" ? (v >= 1000 ? "₺" + fmt(v / 1000) + " B" : "₺" + fmt(v)) : nice < 10 ? v.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : fmt(v);
    const n = buckets.length;
    let maxI = 0; buckets.forEach((b, i) => { if (b.v > buckets[maxI].v) maxI = i; });
    const maxV = Math.max(1, ...buckets.map((b) => b.v));
    const mag = Math.pow(10, Math.floor(Math.log10(maxV)));
    const nice = Math.ceil(maxV / (mag / 2)) * (mag / 2);
    box.setAttribute("aria-label", `${st.series === "att" ? "Katılımcı" : "Gelir"} çizgi grafiği, en yüksek: ${buckets[maxI].sub} ${short(buckets[maxI].v, nice)}`);
    let W = 0, H = 250, geo = null;
    const pts = [], labels = [], hits = [];
    const tipL = h("span", { class: "dk-mekan-analitik-tipl" }), tipV = h("span", { class: "dk-mekan-analitik-tipv" }), tipS = h("span", { class: "dk-mekan-analitik-tips" });
    const tip = h("div", { class: "dk-mekan-analitik-tip", "aria-hidden": "true" }, tipL, tipV, tipS);
    const cur = () => (hi != null && hi < n ? hi : maxI);
    const select = (i) => {
      if (!geo) return;
      hi = i;
      const k = cur();
      pts.forEach((p, j) => { const on = j === k; const d = on ? 12 : 8; p.style.width = p.style.height = d + "px"; p.style.left = (geo.x(j) - d / 2).toFixed(1) + "px"; p.style.top = (geo.y(buckets[j].v) - d / 2).toFixed(1) + "px"; p.classList.toggle("is-hi", on); });
      labels.forEach((l, j) => l.classList.toggle("is-hi", j === k));
      geo.hiLine.setAttribute("x1", geo.x(k).toFixed(1)); geo.hiLine.setAttribute("x2", geo.x(k).toFixed(1));
      const hx = geo.x(k), hy = geo.y(buckets[k].v);
      tip.style.left = clamp(hx - 66, 0, Math.max(0, W - 132)) + "px";
      tip.style.top = (hy < 96 ? hy + 14 : hy - 78) + "px";
      tipL.textContent = trUpper(buckets[k].sub);
      tipV.textContent = st.series === "att" ? fmt(buckets[k].v) + " kişi" : TL(buckets[k].v);
      tipS.textContent = buckets[k].n + " etkinlik";
    };
    // layout(animate): ölçülen genişlikle yeniden çiz (ResizeObserver); çizgi çizim animasyonu yalnız ilk çizimde
    const layout = (still) => {
      const w = Math.round(box.clientWidth);
      if (!w || w === W) return;
      W = w; H = box.clientHeight || 250;
      const L = 48, R = W - 8, T = 16, B = H - 34;
      const x = (i) => (n === 1 ? (L + R) / 2 : L + i * (R - L) / (n - 1));
      const y = (v) => B - (v / nice) * (B - T);
      const lineD = buckets.map((b, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(b.v).toFixed(1)).join(" ");
      const areaD = lineD + " L" + x(n - 1).toFixed(1) + " " + B + " L" + x(0).toFixed(1) + " " + B + " Z";
      const kids = [];
      [0, 1, 2, 3, 4].forEach((k) => {
        const v = nice * k / 4, yy = Math.round(y(v));
        kids.push(h("span", { class: cx("dk-mekan-analitik-grid", k === 0 && "is-base"), style: { top: yy + "px" } }),
          h("span", { class: "dk-mekan-analitik-ytick", style: { top: yy - 7 + "px" } }, short(v, nice)));
      });
      const svg = svgRaw(
        `<path d="${areaD}" fill="rgba(255,138,42,0.10)"></path>` +
        `<line x1="0" x2="0" y1="${T}" y2="${B}" stroke="#2C303A" stroke-width="1"></line>` +
        `<path d="${lineD}" pathLength="1600" class="dk-draw ${still ? "is-still" : animCls()}" fill="none" stroke="#FF8A2A" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"></path>`,
        { width: W, height: H, viewBox: `0 0 ${W} ${H}`, fill: true, color: "none", cls: "dk-mekan-analitik-svg" });
      geo = { x, y, hiLine: svg.querySelector("line") };
      kids.push(svg);
      pts.length = 0; labels.length = 0; hits.length = 0;
      const colW = n === 1 ? 200 : (R - L) / (n - 1);
      buckets.forEach((b, i) => {
        const p = h("span", { class: "dk-mekan-analitik-pt" }); pts.push(p);
        const lab = h("span", { class: "dk-mekan-analitik-xl", style: { left: (x(i) - 32).toFixed(1) + "px", top: B + 12 + "px" } }, (n > 8 && i % 2 === 1 && i !== n - 1) ? "" : b.label);
        labels.push(lab);
        // isabet alanı: kova kolonu, grafik kutusuna kırpılır (kenar kovalar kartın dışına taşıp yatay kaydırma üretmesin)
        const hl = Math.max(0, x(i) - colW / 2), hr = Math.min(W, x(i) + colW / 2);
        const hit = h("button", { type: "button", class: "dk-mekan-analitik-hit", "aria-label": `${b.sub}: ${st.series === "att" ? fmt(b.v) + " kişi" : TL(b.v)}`,
          style: { left: hl.toFixed(1) + "px", width: (hr - hl).toFixed(1) + "px", height: B - 4 + "px" } });
        hit.addEventListener("mouseenter", () => select(i));
        hit.addEventListener("focus", () => select(i));
        hit.addEventListener("click", () => select(i));
        hits.push(hit);
        kids.push(p, lab, hit);
      });
      kids.push(tip);
      box.replaceChildren(...kids);
      select(hi);
    };
    if (typeof ResizeObserver !== "undefined") {
      ro?.disconnect();
      let first = true;
      ro = new ResizeObserver(() => { if (!alive) return; const was = W; layout(!first && was !== 0); first = false; });
      ro.observe(box);
    }
    return { layout: (still) => layout(still) };
  }

  // ── 02 · TÜR ──
  function genreCard() {
    const d = data;
    const tot = d.gTop.reduce((a, [, c]) => a + c, 0);
    const card = h("section", { "aria-labelledby": "dk-ma-h-genre", class: "dk-mekan-analitik-card is-genre" }, cardHead("02 · TÜR", "Müzik türü dağılımı", null, "dk-ma-h-genre"));
    if (!d.gTop.length) card.append(dashedEmpty("Tür bilgisi olan etkinlik yok", 200));
    card.append(barList(d.gTop.map(([g, c], i) => ({ label: g, pct: tot ? Math.round(c / tot * 100) : 0, value: "%" + (tot ? Math.round(c / tot * 100) : 0), rest: "· " + fmt(c) + " kişi", first: i === 0 }))),
      h("span", { class: "dk-mekan-analitik-foot" }, "Katılımcı sayısına göre, ilk 5 tür."));
    return card;
  }
  function barList(items) {
    return h("div", { role: "list", class: "dk-mekan-analitik-bars" }, ...items.map((it) => h("div", { role: "listitem", class: "dk-mekan-analitik-bar" },
      h("div", { class: "dk-mekan-analitik-barrow" }, h("span", { class: "dk-mekan-analitik-barl" }, it.label),
        h("span", { class: cx("dk-mekan-analitik-barv", it.first && "is-first") }, it.value, " ", h("span", { class: "dk-mekan-analitik-barrest" }, it.rest))),
      // Artboard render'ı (ref PNG): tüm dolgular tam turuncu — tasarımdaki satır içi .45 opaklığı aynı öğedeki replay animasyonu
      // (gbFade to{opacity:1}, both) ezdiği için tuvalde hiç görünmüyor; görünen tasarım esas alındı. Öne çıkan satır değer rengiyle ayrılır.
      h("span", { class: "dk-mekan-analitik-track" }, h("span", { class: "dk-mekan-analitik-fillw", style: { width: it.pct + "%" } },
        h("span", { class: cx("dk-mekan-analitik-fill", animCls()) }))))));
  }

  // ── 03 · GÜNLER | SAATLER ──
  function daysCard() {
    const d = data;
    const distSeg = miniSeg("Dağılım", [["day", "Günler"], ["hour", "Saatler"]], st.dist, (k, kb) => {
      if (k === st.dist) return; st.dist = k; sync();
      const old = body.querySelector(".dk-mekan-analitik-card.is-days");
      if (!old) return;
      // kart yeniden kuruluyor → odak geçişteydiyse (tık / Boşluk / Enter / oklar) yeni kartın seçili düğmesine taşınır (body'ye düşmesin)
      const hadFocus = kb || old.contains(document.activeElement);
      const nc = daysCard(); old.replaceWith(nc);
      if (hadFocus) nc.querySelector(`.dk-mekan-analitik-sseg [data-k="${k}"]`)?.focus();
    });
    const hour = st.dist === "hour";
    const card = h("section", { "aria-labelledby": "dk-ma-h-day", class: "dk-mekan-analitik-card is-days" },
      cardHead(hour ? "03 · SAATLER" : "03 · GÜNLER", hour ? "Yoğun Saatler" : "Günlük doluluk trendi", null, "dk-ma-h-day"));
    if (!hour) {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const dMax = Math.max(...d.byDay);
      const topDay = dMax ? DAYS_TR_SHORT[d.byDay.indexOf(dMax)] : "";
      card.append(h("div", { class: "dk-mekan-analitik-cols", role: "img", "aria-label": "Haftanın günlerine göre katılım" + (topDay ? ", en yoğun " + topDay : "") },
        ...order.map((di) => {
          const v = d.byDay[di], top = v === dMax && dMax > 0;
          return h("div", { class: "dk-mekan-analitik-col" },
            h("span", { class: cx("dk-mekan-analitik-colv", top && "is-top") }, v ? fmt(v) : ""),
            h("span", { class: "dk-mekan-analitik-colbarw", style: { height: (dMax ? Math.round(v / dMax * 86) : 0) + "%" } }, // tam turuncu (ref PNG; bkz. barList)
              h("span", { class: cx("dk-mekan-analitik-colbar", animCls()) })),
            h("span", { class: "dk-mekan-analitik-coll" }, DAYS_TR_SHORT[di]));
        })),
      h("span", { class: "dk-mekan-analitik-note" }, topDay ? "En yoğun gün: " + topDay + " · seçili dönem" : "Bu dönem için etkinlik verisi yok"));
    } else {
      const hours = Object.keys(d.byHour).map(Number).sort((a, b) => a - b);
      const hMax = Math.max(0, ...hours.map((x) => d.byHour[x]));
      if (!hours.length) card.append(dashedEmpty("Saat bilgisi olan etkinlik yok", 220));
      else {
        const topH = hours.find((x) => d.byHour[x] === hMax);
        card.append(barList(hours.map((x) => ({ label: String(x).padStart(2, "0") + ":00", pct: hMax ? Math.round(d.byHour[x] / hMax * 100) : 0, value: fmt(d.byHour[x]), rest: "kişi", first: x === topH }))),
          h("span", { class: "dk-mekan-analitik-note" }, "En yoğun saat: " + String(topH).padStart(2, "0") + ":00 · seçili dönem"));
      }
    }
    // Legacy "Yoğun Saatler" korunur: geçiş kartın altında (artboard başlığı 360 px kartta kırılmasın; satır B'deki boş alan)
    card.append(h("div", { class: "dk-mekan-analitik-distrow" }, distSeg));
    return card;
  }

  // ── 04 · SANATÇILAR ──
  let perfList = null, perfPanel = null, perfGrid = null;
  function artistsCard() {
    perfList = h("div", { role: "list", class: "dk-mekan-analitik-ranks" });
    perfPanel = h("div", { class: "dk-mekan-analitik-perf", "aria-live": "polite" });
    perfGrid = h("div", { class: "dk-mekan-analitik-perfgrid" }, perfList, perfPanel);
    const card = h("section", { id: "performans", "aria-labelledby": "dk-ma-h-perf", class: "dk-mekan-analitik-card is-perf" },
      cardHead("04 · SANATÇILAR", "Sanatçı performansları", h("a", { href: "#/venue/sanatci", class: "dk-mekan-analitik-find" }, "Sanatçı bul", ico("chevR", 14)), "dk-ma-h-perf"),
      perfGrid);
    paintArtists();
    // fotoğraf + puan (ilk 5 sanatçı; users dokümanı)
    const ids = data.aTop.map((a) => a.id).filter(Boolean);
    Promise.all(ids.map(userInfo)).then(() => { if (alive && perfList?.isConnected) paintArtists(); });
    return card;
  }
  function selectedKey() { const a = data.aTop; return a.find((x) => x.key === st.artist) ? st.artist : a[0]?.key || ""; }
  function paintArtists(keepFocus = false) {
    const aTop = data.aTop;
    // yeniden çizim düğmeleri değiştirir → seçimden (ya da foto/puan gelişinden) önce odak listedeyse aynı sanatçıya geri döner
    const focusKey = perfList?.contains(document.activeElement) ? document.activeElement.dataset?.k : null;
    const sel = selectedKey();
    const users = new Map();
    // önbellekten eşzamanlı oku (çözülmüşse)
    aTop.forEach((a) => { if (a.id) { const c = _users.get(a.id); if (c?.done) users.set(a.id, c.v); } });
    perfList.replaceChildren(...(aTop.length ? aTop.map((a, i) => {
      const on = a.key === sel, u = users.get(a.id);
      const av = u?.photoURL ? h("img", { src: u.photoURL, alt: "", class: "dk-mekan-analitik-rav", loading: "lazy" }) : h("span", { class: "dk-mekan-analitik-rav is-ini", "aria-hidden": "true" }, trUpper(String(a.name).charAt(0) || "?"));
      if (av.tagName === "IMG") av.addEventListener("error", () => av.replaceWith(h("span", { class: "dk-mekan-analitik-rav is-ini", "aria-hidden": "true" }, trUpper(String(a.name).charAt(0) || "?"))), { once: true });
      const b = h("button", { type: "button", "aria-pressed": on ? "true" : "false", class: "dk-mekan-analitik-rank dk-press", dataset: { k: a.key },
        "aria-label": `${i + 1}. ${a.name}, ${a.genre ? a.genre + ", " : ""}${a.count} etkinlik, ${fmt(a.att)} katılımcı${a.rev ? ", " + TL(a.rev) : ""}`,
        onclick: () => { st.artist = a.key; sync(); paintArtists(true); } },
      h("span", { class: cx("dk-mekan-analitik-rk", i === 0 && "is-first") }, "#" + (i + 1)), av,
      h("span", { class: "dk-mekan-analitik-rnc" }, h("span", { class: "dk-mekan-analitik-rn" }, a.name), h("span", { class: "dk-mekan-analitik-rs" }, `${a.genre ? a.genre + " · " : ""}${a.count} etkinlik`,
        a.rev ? h("span", { class: "dk-mekan-analitik-rsrev" }, " · " + TL(a.rev)) : null)), // dar kartta (<720) GELİR kolonu gizli → alt satırda
      h("span", { class: "dk-mekan-analitik-rright" }, h("span", { class: "dk-mekan-analitik-rv" }, fmt(a.att)), h("span", { class: "dk-mekan-analitik-rvl" }, "katılımcı")),
      h("span", { class: "dk-mekan-analitik-rrev" }, a.rev ? TL(a.rev) : "—"));
      return h("div", { role: "listitem", class: "dk-mekan-analitik-rankli" }, b); // button rolü + aria-pressed korunur
    }) : [dashedEmpty("Bu dönem için sanatçı verisi yok", 120)]));
    const fk = keepFocus ? st.artist : focusKey;
    if (fk != null) { const nb = [...perfList.querySelectorAll(".dk-mekan-analitik-rank")].find((x) => x.dataset.k === fk); try { nb?.focus({ preventScroll: true }); } catch (_) {} }
    perfGrid.classList.toggle("is-empty", !aTop.length);
    if (!aTop.length) { perfPanel.replaceChildren(); perfPanel.hidden = true; return; }
    perfPanel.hidden = false;
    const a = aTop.find((x) => x.key === sel);
    const u = a.id ? users.get(a.id) : null;
    const now = Date.now();
    const past = events.map((e) => ({ e, ms: eventStartMs(e) }))
      // "Geçmiş" = bitmiş (sürmekte olan "Canlı" etkinlik sayılmaz — tablo 05 ile tutarlı)
      .filter((x) => x.ms != null && x.ms <= now && isEventOver(x.e) && x.e.status !== "cancelled" && (a.id ? x.e.artistId === a.id : !x.e.artistId && x.e.artistName === a.name))
      .sort((p, q) => q.ms - p.ms);
    const r = Number(u?.avgRating) || 0, rc = Number(u?.reviewCount) || 0;
    const vName = profile().displayName || "Mekan";
    perfPanel.replaceChildren(
      h("span", { class: "dk-mekan-analitik-peb" }, "SAHNE PERFORMANSI"),
      h("span", { class: "dk-mekan-analitik-pname" }, a.name),
      h("div", { class: "dk-mekan-analitik-pstats" },
        h("span", { class: "dk-mekan-analitik-pcell" }, h("span", { class: "dk-mekan-analitik-pv" }, String(past.length)), h("span", { class: "dk-mekan-analitik-pl" }, "Geçmiş Etkinlik")),
        h("span", { class: "dk-mekan-analitik-pcell" }, h("span", { class: "dk-mekan-analitik-pv" }, fmt(past.reduce((s, x) => s + att(x.e), 0))), h("span", { class: "dk-mekan-analitik-pl" }, "Toplam Katılım")),
        h("span", { class: "dk-mekan-analitik-pcell" }, h("span", { class: "dk-mekan-analitik-pv is-rate" }, r ? r.toFixed(1) : "—"), h("span", { class: "dk-mekan-analitik-pl" }, "Ort. Puan" + (rc ? ` (${rc})` : "")))),
      h("div", { class: "dk-mekan-analitik-pevs" }, ...past.slice(0, 3).map((x) => {
        const dd = new Date(x.ms);
        return h("div", { class: "dk-mekan-analitik-pev" },
          h("span", { class: "dk-mekan-analitik-pevcol" }, h("span", { class: "dk-mekan-analitik-pevt" }, x.e.title || "Etkinlik"),
            // dar panelde mekan adı kısalır, tarih (yıl dahil) her zaman tam kalır
            h("span", { class: "dk-mekan-analitik-pevm" }, h("span", { class: "dk-mekan-analitik-pevmv" }, x.e.venueName || vName),
              h("span", { class: "dk-mekan-analitik-pevmd" }, ` · ${dd.getDate()} ${MONTHS_TR_SHORT[dd.getMonth()]} ${dd.getFullYear()}`))),
          h("span", { class: "dk-mekan-analitik-peva" }, ico("users", 12), h("span", {}, fmt(att(x.e)))));
      })));
  }

  // ── 05 · ETKİNLİKLER ──
  function tableCard() {
    const d = data;
    const cap0 = Number(profile().capacity) || null;
    const all = d.rows;
    const shown = expanded ? all : all.slice(0, 6);
    const rows = shown.map(({ e, ms }) => {
      const cancel = e.status === "cancelled", live = !cancel && isLive(e);
      const cap = Number(e.capacity) || cap0;
      const a = att(e), pct = cap ? Math.round(a / cap * 100) : null;
      const g = firstGenre(e);
      const rev = cancel ? "—" : price(e) ? TL(price(e) * a) : "₺0";
      const subParts = [g ? h("span", { style: { color: genreColor(g) } }, g) : null, e.artistName || null, price(e) ? TL(price(e)) : "Ücretsiz"].filter(Boolean);
      const sub = h("span", { class: "dk-mekan-analitik-tsub" });
      subParts.forEach((p, i) => { if (i) sub.append(" · "); sub.append(p); });
      sub.append(h("span", { class: "dk-mekan-analitik-tsubrev" }, " · gelir " + rev)); // dar tabloda GELİR kolonu gizli → alt satırda
      sub.title = sub.textContent; // kesilirse tam metin (tür · sanatçı · bilet · gelir) ipucunda
      return h("div", { role: "row", class: "dk-mekan-analitik-tr dk-mekan-analitik-trow", dataset: { ev: e.id } },
        h("span", { role: "cell", class: "dk-mekan-analitik-tdate" }, trUpper(dl(ms))),
        h("span", { role: "cell", class: "dk-mekan-analitik-tev" }, h("span", { class: "dk-mekan-analitik-ttitle", title: e.title || null }, e.title || "Etkinlik"), sub),
        h("span", { role: "cell", class: "dk-mekan-analitik-tatt" },
          h("span", { class: "dk-mekan-analitik-tattn" }, h("span", { class: "dk-mekan-analitik-tattv" }, cancel ? "—" : fmt(a)), cap && !cancel ? h("span", { class: "dk-mekan-analitik-tattc" }, ` / ${fmt(cap)} · %${pct}`) : null),
          cap && !cancel ? h("span", { class: "dk-mekan-analitik-prog" }, h("span", { style: { width: Math.min(100, pct) + "%" } })) : null),
        h("span", { role: "cell", class: "dk-mekan-analitik-trev" }, rev),
        h("span", { role: "cell" }, h("span", { class: cx("dk-mekan-analitik-status", cancel ? "is-cancel" : live ? "is-live" : "") }, cancel ? "İptal" : live ? "Canlı" : "Tamamlandı")));
    });
    const moreBtn = all.length > 6
      ? h("button", { type: "button", class: "dk-mekan-analitik-more dk-link", "aria-expanded": expanded ? "true" : "false", onclick: () => { expanded = !expanded; const old = body.querySelector(".dk-mekan-analitik-card.is-table"); old?.replaceWith(tableCard()); body.querySelector(".dk-mekan-analitik-more")?.focus(); } },
        expanded ? `Daha az göster · toplam ${all.length}` : `+${all.length - 6} etkinlik daha · toplam ${all.length}`)
      : h("span", {}, all.length + " etkinlik");
    return h("section", { "aria-labelledby": "dk-ma-h-tbl", class: "dk-mekan-analitik-card is-table" },
      h("div", { class: "dk-mekan-analitik-thead" }, cardHead("05 · ETKİNLİKLER", "Etkinlik bazında sonuçlar", h("span", { class: "dk-mekan-analitik-trange" }, rangeEl.textContent), "dk-ma-h-tbl")),
      h("div", { role: "table", "aria-label": "Etkinlik sonuçları" },
        h("div", { role: "row", class: "dk-mekan-analitik-tr dk-mekan-analitik-th" },
          h("span", { role: "columnheader" }, "TARİH"), h("span", { role: "columnheader" }, "ETKİNLİK"), h("span", { role: "columnheader" }, "KATILIM · DOLULUK"),
          h("span", { role: "columnheader", class: "dk-mekan-analitik-threv" }, "GELİR"), h("span", { role: "columnheader" }, "DURUM")),
        ...(rows.length ? rows : [h("div", { role: "row", class: "dk-mekan-analitik-tempty" }, h("span", { role: "cell", "aria-colspan": "5" }, "Bu dönem için etkinlik verisi yok"))])),
      h("div", { class: "dk-mekan-analitik-tfoot" }, moreBtn, cap0 ? h("span", {}, `Kapasite: ${fmt(cap0)} kişi`) : null));
  }

  // ── 06 · YORUMLAR ──
  const reviewCard = (r) => {
    const rt = Number(r.overallRating ?? r.rating) || 0;
    const when = toMs(r.createdAt);
    const meta = [r.event || null, when ? (() => { const d = new Date(when); return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`; })() : null].filter(Boolean).join(" · ");
    return h("div", { class: "dk-mekan-analitik-rev" },
      h("div", { class: "dk-mekan-analitik-revhead" }, h("span", { class: "dk-mekan-analitik-revn" }, r.authorName || "Müşteri"), stars(rt, 10, 1)),
      r.comment ? h("p", { class: "dk-mekan-analitik-revt" }, r.comment) : null,
      meta ? h("span", { class: "dk-mekan-analitik-revm" }, ico("cal", 11), meta) : null);
  };
  function reviewsCard() {
    const withText = custReviews.filter((r) => String(r.comment || "").trim());
    // Puan + sayı = KPI ORT. PUAN / Yorum Sayısı ile TEK kaynak (legacy venueRating; legacy "Yorum & Puanlama" kutusu ve artboard'da
    // üçü aynı sayı). "yalnız müşteri yorumları" (artboard metni) altındaki görünen yorum listesini niteler.
    const cAvg = rating.avg, cCount = rating.count;
    return h("section", { "aria-labelledby": "dk-ma-h-rev", class: "dk-mekan-analitik-card is-rev" },
      cardHead("06 · YORUMLAR", "Yorum & puanlama", null, "dk-ma-h-rev"),
      h("div", { class: "dk-mekan-analitik-score" },
        h("span", { class: "dk-mekan-analitik-scorev" }, cAvg ? cAvg.toFixed(1) : "—"),
        h("span", { class: "dk-mekan-analitik-scorecol" }, stars(cAvg, 13, 2), h("span", { class: "dk-mekan-analitik-scoret" }, `${fmt(cCount)} değerlendirme · yalnız müşteri yorumları`))),
      withText.length ? reviewCard(withText[0])
        : h("div", { class: "dk-mekan-analitik-rev is-empty" }, h("p", { class: "dk-mekan-analitik-revt" }, "Henüz müşteri yorumu yok. Müşteriler etkinliklerine katıldıkça yorumları burada görünür.")),
      withText.length ? h("button", { type: "button", class: "dk-mekan-analitik-all dk-link", "aria-haspopup": "dialog", onclick: () => openAllReviews(withText) }, "Tüm yorumlar", ico("arrowR", 14)) : null);
  }
  function openAllReviews(list) {
    dkModal({ variant: "panel", size: 560, title: "Tüm yorumlar", sub: `${list.length} müşteri yorumu`, cls: "dk-mekan-analitik-revmodal",
      body: h("div", { class: "dk-mekan-analitik-revlist" }, ...list.map(reviewCard)) });
  }

  // ── TÜM ZAMANLAR ──
  function overallCard() {
    const o = overall();
    const cell = (v, l) => h("span", { class: "dk-mekan-analitik-ocell" }, h("span", { class: "dk-mekan-analitik-ov" }, v), h("span", { class: "dk-mekan-analitik-ol" }, l));
    return h("section", { "aria-labelledby": "dk-ma-h-all", class: "dk-mekan-analitik-card is-all" },
      cardHead("TÜM ZAMANLAR", "Genel özet", null, "dk-ma-h-all"),
      h("div", { class: "dk-mekan-analitik-ogrid" },
        cell(fmt(o.eventCount), "Toplam Etkinlik"), cell(fmt(o.upcoming), "Yaklaşan"), cell(fmt(o.totalAttendance), "Toplam Katılım"),
        cell(fmt(o.avgAttendance), "Ort. Katılım"), cell(fmt(o.withArtist), "Sanatçılı"), cell(fmt(o.vip), o.vipPending ? `VIP (${o.vipPending} onayda)` : "VIP")));
  }

  // ── ?ev derin bağlantısı ──
  // Tek seferlik: uygulandıktan (ya da bulunamadıktan) sonra ?ev URL'den düşer → yenileme/paylaşım kullanıcının dönem seçimini ezmez
  function applyEvLink() {
    const id = pendingEv; if (!id || !loaded || failed) return;
    pendingEv = "";
    const done = () => { if (st.ev) { st.ev = ""; sync(); } };
    const ev = events.find((e) => e.id === id); if (!ev) return done();
    const ms = eventStartMs(ev), now = Date.now();
    if (ms != null && ms < sinceOf(st.period, now) && st.period !== 365) { st.period = 365; sync(); pendingEv = id; flip = !flip; hi = null; expanded = false; render(); return; }
    done();
    const idx = data.rows.findIndex((x) => x.e.id === id);
    if (idx < 0) return;
    if (idx >= 6 && !expanded) { expanded = true; body.querySelector(".dk-mekan-analitik-card.is-table")?.replaceWith(tableCard()); }
    const row = body.querySelector(`.dk-mekan-analitik-trow[data-ev="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    row.classList.remove("is-flash"); void row.offsetWidth; row.classList.add("is-flash");
  }

  // ── durum ──
  function sync() { if (alive) writeQuery(toQuery(st)); }
  function bump() { flip = !flip; sync(); render(); }
  function setPeriod(d) { if (d === st.period) return; st.period = d; hi = null; expanded = false; bump(); }

  async function load() {
    loaded = false; failed = false; _users.clear(); render();
    const [evs, revs] = await Promise.all([
      venueEventsRO(uid).then((v) => ({ ok: true, v })).catch(() => ({ ok: false, v: [] })),
      getVenueReviews(uid).catch(() => []),
    ]);
    if (!alive) return;
    failed = !evs.ok;
    events = evs.v;
    rating = venueRating(profile(), revs);
    custReviews = (revs || []).filter((r) => (r.authorType ?? "customer") === "customer");
    loaded = true;
    render();
  }
  if (uid) load(); else { loaded = true; failed = true; render(); }
  unsubs.push(() => { ro?.disconnect(); ro = null; });

  return {
    node: shell.node,
    update(q) {
      const next = readState(q);
      const periodChanged = next.period !== st.period, seriesChanged = next.series !== st.series;
      const other = next.dist !== st.dist || next.artist !== st.artist || next.ev !== st.ev;
      if (!periodChanged && !seriesChanged && !other) return;
      st = next;
      if (next.ev) pendingEv = next.ev;
      if (periodChanged) { hi = null; expanded = false; } // seri değişimi vurgulu noktayı korur (artboard)
      if (periodChanged || seriesChanged) flip = !flip;
      render();
    },
    onSession(s) { return s?.user?.uid === uid && sigOf(s?.profile) === sig0; },
    destroy() {
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}
