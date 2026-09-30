// WebEtkinlikler — masaüstü "Tüm etkinlikler" (≥769 px). Registry anahtarı: etkinlikler (#/etkinlikler).
// Spec: specs/public-a.md §3 (artboard design/WebEtkinlikler.dc.html; sahibinin CLAUDE CODE notu YOK).
// CSS: css/dk-etkinlikler.css — seçiciler .dk-etkinlikler kökü ya da .dk-etkinlikler-* sınıfları (çekmece portalda) altında.
//
// Legacy karşılığı: customer.js customerPage() → detailShell("Etkinlikler", eventsListView) + buildDateFilters() + dateMatches().
// Legacy özellikleri (korundu): discoverEvents() tam listesi · takvim şeridi (Tümü / Bu Hafta / Bu Ay + 14 gün, aktifte prizma) ·
//   dateMatches anlamı (hafta = bugün 00:00 ≤ t ≤ şimdi+7 g, ay = ≤ şimdi+30 g, gün = aynı yerel gün, zamansız kayıt yalnız "Tümü") ·
//   şehir süzgeci (gb_city / activeCity; artık görünür ve değiştirilebilir) · durum rozeti önceliği (dolu > VIP > özel > yoğun > popüler > yeni) ·
//   kart → #/etkinlik/:id · boş durum "Etkinlik yok / Bu tarihte etkinlik bulunamadı." · hata "Bir sorun oldu / Bağlantını kontrol edip tekrar dene."
//   (legacy'nin geri düğmesi → breadcrumb "Keşfet"; "Cte" → tasarımın "CMT"si).
// Yeni (tasarım): breadcrumb + serif başlık + toplam sayaç, gün noktaları, filtre kenar çubuğu (tür aileleri + sayılar, fiyat, şehir arama/listesi),
//   etkin filtre çipleri, sıralama, sayfalama (9'ar), boş durumda "Filtreleri temizle".
//
// URL (#/etkinlikler?…; paylaşılabilir): tarih=bu-hafta|bu-ay|YYYY-MM-DD · tur=jazz,electronic,… (aile anahtarları) · fiyat=ucretsiz|ucretli ·
//   sehir=<slug>|tumu · sirala=populerlik|fiyat · sayfa=N. Ayrık filtre değişimi history.pushState (geri tuşu önceki filtreye döner →
//   router update(query)); "Daha fazla yükle" ve klavye ok tuşu gezinmesi (odak oturumu başına tek push) replaceState.
//   Tarih/tür/fiyat/sıralama/sayfa varsayılanları URL'ye yazılmaz; sehir= ise HER ZAMAN yazılır (kendini tanımlayan URL: sehir= olmayan
//   giriş bağlantısı açılışta gb_city ile çözülür ve replaceState ile sehir=<slug|tumu> olarak kanonikleşir → geri/ileri ve yeniden
//   bağlanmada gb_city sonradan değişse de aynı şehir döner).
// Şehir (Q11): sayfa durumu URL'den; gb_city (tercih) YALNIZ açık seçimde yazılır — kenar çubuğu/çekmece şehir satırı ve header seçici.
//   URL kaynaklı değişim (paylaşılan bağlantı, geri/ileri), çip kaldırma ve Temizle yalnız sayfayı süzer, gb_city'ye dokunmaz; header
//   etiketi ve header seçicisinin işaretli satırı bu sayfadayken sayfanın şehrini gösterir (header.setCity, kalıcı değil; seçici yerel varyant).
// Veri: yalnız discoverEvents() (okuma). Yazma YOK. Tüm süzme/sıralama istemcide (legacy gibi).
import { h } from "../../ui.js";
import { discoverEvents } from "../../data.js";
import { publicShell } from "../shared/public-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { cx, dkRadio, dkCheckbox, dkSegmented, dkFilterChip, dkSkeletonCard, dkBreadcrumb, dkSearchInput, dkButton, dkDrawer, dkPopover } from "../shared/ui.js";
import { CITY_EVENT, cityPicker } from "../shared/city-picker.js";
import { eventCard, evCity } from "../shared/cards.js";
import {
  ALL_CITIES, PROVINCES, getActiveCity, setActiveCity, fold, sortTR, fmtInt, isFree, eventStartMs, eventGenres,
  startOfDay, isoDate, DAYS_TR, DAYS_TR_SHORT, MONTHS_TR_SHORT, trUpper, writeQuery, hashBase, swapAnim,
} from "../shared/helpers.js";
import { GENRE_FAMILIES, FILTER_FAMILIES, genreFamilyKey } from "../shared/genres.js";

// artboard + spec §3.6: sayfa boyu 9 → "Daha fazla yükle" (+9). Her genişlikte aynı (sayfa=N paylaşılan bağlantıda aynı sayıyı verir).
// Kolon sayısı yalnız CSS'te (dk-etkinlikler.css: sonuç kolonu ≥800 px → 3, altı 2 — Q12).
const PAGE = 9;
const DAY = 86400e3;
const STRIP_DAYS = 14;           // legacy buildDateFilters: 14 günlük takvim
const QUICK = [["all", "Tümü"], ["week", "Bu Hafta"], ["month", "Bu Ay"]];
const PRICES = [["all", "Tümü"], ["free", "Ücretsiz"], ["paid", "Ücretli"]];
const SORTS = [["date", "Tarih"], ["pop", "Popülerlik"], ["price", "Fiyat"]];
const Q_DATE = { week: "bu-hafta", month: "bu-ay" };
const Q_PRICE = { free: "ucretsiz", paid: "ucretli" };
const Q_SORT = { pop: "populerlik", price: "fiyat" };

// Artboard SVG gövdeleri (birebir)
const P = {
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  chevronDown: '<path d="m6 9 6 6 6-6"></path>',
  alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5.5M12 16.5v.01"></path>',
};

// ── saf yardımcılar ──
const citySlug = (c) => fold(c).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const isDayKey = (df) => typeof df === "string" && df.startsWith("d:");
function dayMsOf(df) {
  const [y, m, d] = df.slice(2).split("-").map(Number);
  const t = new Date(y, m - 1, d).getTime();
  return isFinite(t) ? t : null;
}
// "Cumartesi, 26 Eyl" (artboard dayLong; aria + çip + gün etiketi)
function dayLong(ms) { const d = new Date(ms); return `${DAYS_TR[d.getDay()]}, ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`; }
// legacy dateMatches (customer.js:474) birebir
function dateMatch(ms, df, now) {
  if (df === "all") return true;
  if (ms == null) return false;
  const t0 = startOfDay(now);
  if (df === "week") return ms >= t0 && ms <= now + 7 * DAY;
  if (df === "month") return ms >= t0 && ms <= now + 30 * DAY;
  return startOfDay(ms) === dayMsOf(df);
}
const priceMatch = (ev, price) => price === "all" || (price === "free" ? ev.free : !ev.free);
const cityMatch = (ev, city) => city === ALL_CITIES || ev.cityKey === fold(city);
const genreMatch = (ev, gsel) => !gsel.length || gsel.some((k) => ev.fams.has(k));
function prep(e) {
  const city = evCity(e);
  return {
    e, ms: eventStartMs(e), city, cityKey: fold(city),
    fams: new Set(eventGenres(e).map(genreFamilyKey)),
    free: isFree(e.ticketPrice), price: isFree(e.ticketPrice) ? 0 : Number(e.ticketPrice),
    att: Number(e.attendeeCount) || 0,
  };
}
const byDate = (a, b) => ((a.ms == null) - (b.ms == null)) || ((a.ms || 0) - (b.ms || 0));
const SORTERS = {
  date: byDate,
  pop: (a, b) => (b.att - a.att) || byDate(a, b),          // popülerlik = katılımcı sayısı azalan
  price: (a, b) => (a.price - b.price) || byDate(a, b),    // fiyat artan (ücretsiz = 0 önce)
};
const DEFAULTS = { df: "all", gsel: [], price: "all", city: ALL_CITIES, sort: "date", page: 1 };
const sameState = (a, b) => a.df === b.df && a.gsel.join() === b.gsel.join() && a.price === b.price
  && fold(a.city) === fold(b.city) && a.sort === b.sort && a.page === b.page;
const activeCount = (s) => (s.df !== "all") + s.gsel.length + (s.price !== "all") + (s.city !== ALL_CITIES);

// Klavye gezinmesi kaynağı: ok tuşu seçimi eşzamanlı click() ile uygulanır; o sırada `roving` = grup öğesi → setFilter bunu okuyup
// geçmişi şişirmez (odak oturumu başına tek pushState) ve şehir tercihini odak listeden çıkınca yazar.
let roving = null;
function roveClick(group, btn) { roving = group; try { btn.click(); } finally { roving = null; } }
// SHARED-CANDIDATE: dkSegmented(role radiogroup)/dkRadioGroup ok tuşu + roving tabindex sağlamıyor → yerel radioKeys/rove.
// Radyo grubu klavyesi (ok tuşları seçimi taşır; yalnız seçili öğe sekme durağı) — artboard'da yok, erişilebilirlik eki.
function radioKeys(group) {
  group.addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const btns = [...group.querySelectorAll('[role="radio"]')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0 || !btns.length) return;
    e.preventDefault();
    const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
    const j = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : (i + (fwd ? 1 : -1) + btns.length) % btns.length;
    btns[j].focus(); roveClick(group, btns[j]);
  });
}
function rove(group) {
  const btns = [...group.querySelectorAll('[role="radio"]')];
  const on = btns.find((b) => b.getAttribute("aria-checked") === "true") || btns[0];
  btns.forEach((b) => { b.tabIndex = b === on ? 0 : -1; });
}

export function etkinliklerView(ctx) {
  let dead = false;
  const unsubs = [];
  let pendingCitySlug = null;                            // 81 il dışında kalan şehir adı → veri gelince çözülür
  let cityIndex = { list: [], counts: new Map() };       // etkinliği olan şehirler (sayı azalan) + fold → sayı (parseQuery'den ÖNCE)
  let state = parseQuery(ctx.query);
  let events = [];                                       // prep()'li liste
  let loadState = "loading";                             // loading | ready | error
  let drawer = null;
  let roveGroup = null;                                  // bu odak oturumunda ok tuşuyla zaten push yapılmış grup
  let cityDirty = false;                                 // ok tuşuyla seçilmiş, henüz gb_city'ye yazılmamış şehir

  function cityFromSlug(s) {
    if (!s) return null;
    const k = String(s).toLowerCase();
    if (k === "tumu" || k === "tum") return ALL_CITIES;
    return PROVINCES.find((p) => citySlug(p) === k) || cityIndex.list.find((c) => citySlug(c) === k) || null;
  }
  // sehir= yoksa giriş bağlantısıdır → o anki gb_city (sonra URL'ye yazılır); çözülemeyen ad veri gelince etkinlik şehirlerinden denenir
  function parseQuery(q) {
    const t = q.get("tarih") || "";
    const df = t === "bu-hafta" ? "week" : t === "bu-ay" ? "month"
      : (/^\d{4}-\d{2}-\d{2}$/.test(t) && dayMsOf("d:" + t) != null) ? "d:" + t : "all";
    const tur = (q.get("tur") || "").split(",").map((x) => x.trim().toLowerCase());
    const f = q.get("fiyat"), so = q.get("sirala"), sehir = q.get("sehir");
    let city = cityFromSlug(sehir);
    if (city == null) { pendingCitySlug = sehir || null; city = getActiveCity(); } else pendingCitySlug = null;
    const page = Math.max(1, Math.min(50, parseInt(q.get("sayfa"), 10) || 1));
    return {
      df, gsel: FILTER_FAMILIES.filter((k) => tur.includes(k)),
      price: f === "ucretsiz" ? "free" : f === "ucretli" ? "paid" : "all",
      city, sort: so === "populerlik" ? "pop" : so === "fiyat" ? "price" : "date", page,
    };
  }
  function writeUrl(push) {
    const s = state;
    if (dead || hashBase() !== ctx.base) return;          // başka rotaya geçildiyse onun URL'sine yazma
    writeQuery({
      tarih: s.df === "all" ? null : Q_DATE[s.df] || s.df.slice(2),
      tur: s.gsel.length ? s.gsel.join(",") : null,
      fiyat: Q_PRICE[s.price] || null,
      sehir: s.city === ALL_CITIES ? "tumu" : citySlug(s.city),
      sirala: Q_SORT[s.sort] || null,
      sayfa: s.page > 1 ? s.page : null,
    }, { push });
  }
  // Tercih (gb_city) yalnız açık şehir seçiminde yazılır; header etiketi olayla eşlenir
  function persistCity(c) {
    cityDirty = false;
    if (fold(getActiveCity()) !== fold(c)) setActiveCity(c);
    window.dispatchEvent(new CustomEvent(CITY_EVENT, { detail: { city: c } }));
  }
  // Yalnız sayfa (URL/çip/Temizle/geri-ileri): gb_city'ye dokunmadan header etiketini sayfanın şehrine eşle
  const showCity = (c) => { try { shell.header.setCity(c); } catch (_) {} };
  // opts.persist: açık şehir seçimi (şehir satırı) → gb_city yazılır (ok tuşuyla gezinirken odak listeden çıkınca)
  function setFilter(patch, { push = true, anim = true, fromCityList = false, persist = false } = {}) {
    const rg = roving;
    const prev = state;
    state = { ...state, ...patch };
    if (!("page" in patch)) state.page = 1;
    if (sameState(prev, state)) return;
    if (rg) { if (roveGroup === rg) push = false; roveGroup = rg; }   // ok tuşu: odak oturumu başına tek geçmiş kaydı
    else if (push) roveGroup = null;
    if (fold(prev.city) !== fold(state.city)) {
      pendingCitySlug = null;
      if (persist && rg) { cityDirty = true; showCity(state.city); }
      else if (persist) persistCity(state.city);
      else { cityDirty = false; showCity(state.city); }
      if (!fromCityList) panel.clearCityQuery();   // header/çip/Temizle/URL → eski şehir araması seçili şehri gizlemesin
    }
    writeUrl(push);
    render({ anim });
  }
  // Ok tuşuyla gezilen grup odağı bırakınca: sonraki gezinme yeni geçmiş kaydı açar; bekleyen şehir seçimi gb_city'ye yazılır.
  // (şehir listesi her seçimde yeniden çizilir → odak anlık body'ye düşüp geri gelir; kontrol bir sonraki görevde yapılır)
  function onRoveLeave(group, fn) {
    group.addEventListener("focusout", () => setTimeout(() => {
      if (dead || group.contains(document.activeElement)) return;
      if (roveGroup === group) roveGroup = null;
      fn?.();
    }, 0));
  }
  // artboard reset: tarih/tür/fiyat/şehir varsayılana; sıralama korunur. Yalnız sayfa — kayıtlı şehir tercihi (gb_city) korunur (Q11).
  function resetAll() { setFilter({ df: DEFAULTS.df, gsel: [], price: DEFAULTS.price, city: DEFAULTS.city }); }

  // ── veri türevleri ──
  const now = () => Date.now();
  function filtered(s = state) {
    const t = now();
    return events.filter((ev) => dateMatch(ev.ms, s.df, t) && genreMatch(ev, s.gsel) && priceMatch(ev, s.price) && cityMatch(ev, s.city))
      .sort(SORTERS[s.sort] || byDate);
  }
  function buildCityIndex() {
    const m = new Map();
    events.forEach((ev) => { if (!ev.cityKey) return; const x = m.get(ev.cityKey) || { name: ev.city, n: 0 }; x.n++; m.set(ev.cityKey, x); });
    const list = [...m.values()].sort((a, b) => (b.n - a.n) || sortTR(a.name, b.name)).map((x) => x.name);
    const counts = new Map([...m.entries()].map(([k, x]) => [k, x.n]));
    cityIndex = { list, counts };
  }

  // ══════════ KABUK ══════════
  const shell = publicShell({ active: "etkinlikler", footer: "full" });
  const root = h("div", { class: "dk-etkinlikler" });
  shell.main.append(root);

  // ── 1. Sayfa başı ──
  const total = h("span", { class: "dk-etkinlikler-total" });
  const head = h("section", { class: "dk-etkinlikler-head", "aria-labelledby": "dk-etk-h" },
    h("div", { class: "dk-etkinlikler-headl" },
      dkBreadcrumb({ items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Etkinlikler" }], cls: "dk-etkinlikler-bc" }),
      h("h1", { id: "dk-etk-h", class: "dk-display dk-etkinlikler-h1" }, "Tüm ", h("em", {}, "etkinlikler")),
      h("p", { class: "dk-etkinlikler-lead" }, "Tarihe, türe, fiyata ve şehre göre süz; sana uygun geceyi bul.")),
    total);

  // ── 2. Tarih şeridi (role=tablist; ok tuşları + Home/End, otomatik etkinleştirme) ──
  // Sekmeler sonuç kolonunu (role=tabpanel, #dk-etk-res; etiketi seçili sekme) denetler
  const strip = h("div", { role: "tablist", "aria-label": "Tarih", class: "dk-etkinlikler-strip" });
  const stripItems = [];
  const tabAttrs = () => ({ id: `dk-etk-tab-${stripItems.length}`, "aria-controls": "dk-etk-res" });
  QUICK.forEach(([k, label]) => {
    const b = h("button", { type: "button", role: "tab", class: "dk-etkinlikler-q dk-press", "aria-selected": "false", tabindex: "-1", ...tabAttrs() },
      label, h("span", { class: "dk-etkinlikler-prism dk-prism", "aria-hidden": "true" }));
    b.addEventListener("click", () => setFilter({ df: k }));
    stripItems.push({ k, b });
    strip.append(b);
  });
  strip.append(h("span", { class: "dk-etkinlikler-sep", "aria-hidden": "true" }));
  {
    const t0 = new Date(startOfDay(now()));
    for (let i = 0; i < STRIP_DAYS; i++) {
      const d = new Date(t0); d.setDate(t0.getDate() + i);
      const ms = d.getTime(), k = "d:" + isoDate(ms);
      const rel = i < 2;
      const dot = h("span", { class: "dk-etkinlikler-ddot", "aria-hidden": "true" });
      const b = h("button", { type: "button", role: "tab", class: "dk-etkinlikler-day dk-press", "aria-selected": "false", tabindex: "-1", "aria-label": dayLong(ms), ...tabAttrs() },
        h("span", { class: cx("dk-etkinlikler-dl", rel && "is-rel") }, i === 0 ? "BUGÜN" : i === 1 ? "YARIN" : trUpper(DAYS_TR_SHORT[d.getDay()])),
        h("span", { class: "dk-etkinlikler-ds" }, `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`),
        dot, h("span", { class: "dk-etkinlikler-prism dk-prism", "aria-hidden": "true" }));
      b.addEventListener("click", () => setFilter({ df: k }));
      stripItems.push({ k, b, ms, dot });
      strip.append(b);
    }
  }
  strip.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const i = stripItems.findIndex((x) => x.b === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = stripItems.length;
    const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    stripItems[j].b.focus(); roveClick(strip, stripItems[j].b);
  });
  onRoveLeave(strip);
  const stripWrap = h("div", { class: "dk-etkinlikler-stripw" }, strip);
  // Kenar solması: şerit taşarsa (≤1402 px) kaydırılabilir + kenar maskesi
  const fadeStrip = () => {
    const max = strip.scrollWidth - strip.clientWidth;
    strip.classList.toggle("is-fade-l", max > 1 && strip.scrollLeft > 1);
    strip.classList.toggle("is-fade-r", max > 1 && strip.scrollLeft < max - 1);
  };
  strip.addEventListener("scroll", fadeStrip, { passive: true });
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(fadeStrip); ro.observe(strip);
    unsubs.push(() => ro.disconnect());
  }
  function scrollStripTo(b) {
    if (!b || strip.scrollWidth <= strip.clientWidth) return;
    const l = b.offsetLeft, r = l + b.offsetWidth;
    if (l < strip.scrollLeft) strip.scrollLeft = l - 24;
    else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 24;
  }
  function renderStrip() {
    const t = state.city;
    let sel = null;
    stripItems.forEach((x) => {
      const on = x.k === state.df;
      if (on) sel = x.b;
      x.b.classList.toggle("is-on", on);
      x.b.setAttribute("aria-selected", on ? "true" : "false");
      if (x.dot) x.dot.classList.toggle("has-ev", events.some((ev) => ev.ms != null && startOfDay(ev.ms) === x.ms && cityMatch(ev, t)));
    });
    stripItems.forEach((x) => { x.b.tabIndex = x.b === (sel || stripItems[0].b) ? 0 : -1; });
    res.setAttribute("aria-labelledby", (sel || stripItems[0].b).id);
    scrollStripTo(sel);
    fadeStrip();
  }

  // ── 3. Filtre paneli (kenar çubuğu + ≤1023 çekmecesi aynı bileşen) ──
  function filterPanel({ getState, onPatch, onReset, withHead, onCityLeave }) {
    let cityQ = "";
    const fs = (legend, gapCls, ...kids) => h("fieldset", { class: cx("dk-etkinlikler-fs", gapCls) }, h("legend", { class: "dk-etkinlikler-lg" }, legend), ...kids);

    // TARİH
    const dateRows = QUICK.map(([k, label]) => { const r = dkRadio({ label, height: 40, onChange: () => onPatch({ df: k }) }); r.dataset.k = k; return r; });
    const dateGroup = h("div", { role: "radiogroup", "aria-label": "Tarih", class: "dk-etkinlikler-rg dk-etkinlikler-rg4" }, ...dateRows);
    radioKeys(dateGroup); onRoveLeave(dateGroup);
    const dayChipTxt = h("span", {});
    const dayChip = h("span", { class: "dk-etkinlikler-daychip", hidden: true },
      svgRaw(P.calendar, { size: 14, sw: "2", color: "#4ED8FF" }), dayChipTxt);

    // TÜR (aile çoklu seçim, sayılar diğer filtrelere göre)
    const genreRows = FILTER_FAMILIES.map((k) => {
      const f = GENRE_FAMILIES[k];
      const r = dkCheckbox({ label: f.label, dot: f.color, count: "", onChange: (on) => {
        const cur = new Set(getState().gsel); if (on) cur.add(k); else cur.delete(k);
        onPatch({ gsel: FILTER_FAMILIES.filter((x) => cur.has(x)) });
      } });
      return { k, r, n: r.querySelector(".dk-tg-n") };
    });

    // FİYAT (Segmented, radiogroup)
    const priceSeg = dkSegmented({ items: PRICES.map(([key, label]) => ({ key, label })), value: getState().price, size: 34, role: "radiogroup", label: "Fiyat", stretch: true, onChange: (k) => onPatch({ price: k }) });
    radioKeys(priceSeg); onRoveLeave(priceSeg);

    // ŞEHİR (arama + radyo listesi)
    const cityList = h("div", { role: "radiogroup", "aria-label": "Şehir", class: "dk-etkinlikler-cities dk-scroll" });
    radioKeys(cityList); onRoveLeave(cityList, onCityLeave);
    const search = dkSearchInput({ variant: "compact", placeholder: "Şehir ara...", label: "Şehir ara", onInput: (v) => { cityQ = v; renderCities(); } });
    function renderCities() {
      const st = getState();
      const act = document.activeElement;
      const focusKey = cityList.contains(act) ? act.dataset.city : null;
      const q = fold(cityQ.trim());
      let names;
      if (!q) {
        names = [ALL_CITIES, ...cityIndex.list];
        if (st.city !== ALL_CITIES && !names.some((c) => fold(c) === fold(st.city))) names.push(st.city);
      } else {
        const seen = new Set(cityIndex.list.map(fold));
        names = [ALL_CITIES, ...cityIndex.list, ...PROVINCES.filter((p) => !seen.has(fold(p)))]
          .filter((c) => (c === ALL_CITIES ? fold("Tüm şehirler") + " " + fold(ALL_CITIES) : fold(c)).includes(q));
      }
      const ready = loadState === "ready";
      const rows = names.map((c) => {
        const all = c === ALL_CITIES;
        const n = all ? events.length : (cityIndex.counts.get(fold(c)) || 0);
        const r = dkRadio({ label: all ? "Tüm şehirler" : c, count: ready ? n : "", height: 38, checked: all ? st.city === ALL_CITIES : fold(c) === fold(st.city), onChange: () => onPatch({ city: c }, { fromCityList: true, persist: true }) });
        r.dataset.city = c;
        return r;
      });
      cityList.replaceChildren(...(rows.length ? rows : [h("span", { class: "dk-etkinlikler-nocity" }, "Şehir bulunamadı")]));
      // arama etkinken liste 81 ile uzayabilir → kenar çubuğunda yalnız o sırada ~10,5 satırla sınırlı iç kaydırma (CSS .is-q)
      cityList.classList.toggle("is-q", !!q);
      rove(cityList);
      if (focusKey) rows.find((r) => r.dataset.city === focusKey)?.focus({ preventScroll: true });
    }

    const node = h("div", { class: "dk-etkinlikler-fp" },
      withHead ? h("div", { class: "dk-etkinlikler-sh" },
        h("span", { class: "dk-etkinlikler-sht" }, svgIcon("sliders", { size: 16, sw: "1.9" }), "Filtreler"),
        h("button", { type: "button", class: "dk-etkinlikler-clr dk-link", onclick: onReset }, "Temizle")) : null,
      fs("TARİH", "dk-etkinlikler-fs-date", dateGroup, dayChip),
      fs("TÜR", "dk-etkinlikler-fs-genre", ...genreRows.map((x) => x.r)),
      fs("FİYAT", "dk-etkinlikler-fs-price", priceSeg),
      fs("ŞEHİR", "dk-etkinlikler-fs-city", search, cityList));

    function refresh() {
      const st = getState();
      dateRows.forEach((r) => r.dk.set(r.dataset.k === st.df));
      rove(dateGroup);
      const isDay = isDayKey(st.df) && dayMsOf(st.df) != null;
      dayChip.hidden = !isDay;
      dayChipTxt.textContent = isDay ? dayLong(dayMsOf(st.df)) : "";
      const ready = loadState === "ready", t = now();
      const base = ready ? events.filter((ev) => dateMatch(ev.ms, st.df, t) && priceMatch(ev, st.price) && cityMatch(ev, st.city)) : [];
      genreRows.forEach(({ k, r, n }) => {
        r.dk.set(st.gsel.includes(k));
        if (n) n.textContent = ready ? String(base.filter((ev) => ev.fams.has(k)).length) : "";
      });
      priceSeg.dk.set(st.price);
      rove(priceSeg);
      renderCities();
    }
    refresh();
    const clearCityQuery = () => { if (!cityQ) return; cityQ = ""; search.input.value = ""; };
    return { node, refresh, search, clearCityQuery };
  }

  const panel = filterPanel({ getState: () => state, onPatch: (p, o) => setFilter(p, o), onReset: resetAll, withHead: true,
    onCityLeave: () => { if (cityDirty) persistCity(state.city); } });
  const aside = h("aside", { "aria-label": "Filtreler", class: "dk-etkinlikler-side dk-scroll" }, panel.node);

  // ── 4. Sonuç kolonu ──
  const fBadge = h("span", { class: "dk-etkinlikler-fbadge", hidden: true });
  const fBtn = h("button", { type: "button", class: "dk-etkinlikler-fbtn dk-press", "aria-haspopup": "dialog", "aria-expanded": "false" },
    svgIcon("sliders", { size: 16, sw: "1.9" }), h("span", {}, "Filtreler"), fBadge);
  fBtn.addEventListener("click", () => openDrawer());
  const countLabel = h("span", { class: "dk-etkinlikler-count", role: "status", tabindex: "-1" });
  const chipBox = h("span", { class: "dk-etkinlikler-chips" });
  const sortSeg = dkSegmented({ items: SORTS.map(([key, label]) => ({ key, label })), value: state.sort, size: 34, role: "radiogroup", label: "Sırala", onChange: (k) => setFilter({ sort: k }) });
  radioKeys(sortSeg); onRoveLeave(sortSeg);
  const bar = h("div", { class: "dk-etkinlikler-bar" },
    h("div", { class: "dk-etkinlikler-barl" }, fBtn, countLabel, chipBox),
    h("div", { class: "dk-etkinlikler-sort" }, h("span", { class: "dk-etkinlikler-sortl", "aria-hidden": "true" }, "SIRALA"), sortSeg));
  const grid = h("div", { class: "dk-etkinlikler-grid" });
  const emptyBox = h("div", { class: "dk-etkinlikler-empty", hidden: true });
  const more = h("div", { class: "dk-etkinlikler-more", hidden: true });
  const allShown = h("span", { class: "dk-etkinlikler-all", hidden: true }, "TÜM ETKİNLİKLER GÖSTERİLDİ");
  const res = h("div", { id: "dk-etk-res", role: "tabpanel", class: "dk-etkinlikler-res" }, bar, emptyBox, grid, more, allShown);

  root.append(head, stripWrap, h("div", { class: "dk-etkinlikler-body" }, aside, res));

  // ── FilterSidebar yapışkanlığı (spec §3.3: sticky, header 76 + 24 → top 100; artboard'daki gibi TAM BOY, iç kaydırma yok) ──
  // Panel ekrana sığmıyorsa (1440×900'de ≈1013 > 900 − 124) "alttan yapışkan": top = innerHeight − H − 24 (negatif) → sayfa kaydıkça
  // panel önce sonuna kadar akar, sonra alt kenarı ekranın 24 px üstünde durur; hiçbir satır erişilemez kalmaz. Yükseklik panel
  // YAPIŞIKKEN değişirse (ör. şehir aramasında yazarken liste uzar) top hemen değişmez — panel imlecin altından kaymaz; bir sonraki
  // sayfa kaydırmasında / pencere boyutu değişiminde uygulanır.
  let sideTop = 100, sidePending = false;
  function fitSide(force) {
    if (dead) return;
    const H = aside.offsetHeight;
    if (!H) return;                                    // ≤1023: kenar çubuğu gizli (çekmece)
    const t = Math.min(100, Math.floor(window.innerHeight - H - 24));
    if (t === sideTop) { sidePending = false; return; }
    if (!force) {
      const body = aside.parentElement;
      const flowTop = body.getBoundingClientRect().top + (parseFloat(getComputedStyle(body).paddingTop) || 0);
      if (aside.getBoundingClientRect().top - flowTop > 0.5) { sidePending = true; return; }   // yapışık → kaydırmada uygula
    }
    sidePending = false; sideTop = t;
    aside.style.top = t + "px";
  }
  const onWinResize = () => fitSide(true);
  const onWinScroll = () => { if (sidePending) fitSide(true); };
  window.addEventListener("resize", onWinResize);
  window.addEventListener("scroll", onWinScroll, { passive: true });
  unsubs.push(() => { window.removeEventListener("resize", onWinResize); window.removeEventListener("scroll", onWinScroll); });
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => fitSide(false));
    ro.observe(aside);
    unsubs.push(() => ro.disconnect());
  }

  function renderToolbar() {
    const s = state;
    const ready = loadState === "ready";
    fBadge.hidden = !activeCount(s);
    fBadge.textContent = String(activeCount(s));
    fBtn.setAttribute("aria-label", activeCount(s) ? `Filtreler, ${activeCount(s)} etkin` : "Filtreler");
    sortSeg.dk.set(s.sort);
    rove(sortSeg);
    // etkin filtre çipleri (odaktaki çip kaldırılırsa odak sıradaki çipe / sayı etiketine geçer)
    const act = document.activeElement;
    const focusIdx = chipBox.contains(act) ? [...chipBox.children].indexOf(act) : -1;
    const chips = [];
    if (s.df !== "all") chips.push([s.df === "week" ? "Bu Hafta" : s.df === "month" ? "Bu Ay" : dayLong(dayMsOf(s.df)), () => setFilter({ df: "all" })]);
    s.gsel.forEach((k) => chips.push([GENRE_FAMILIES[k].label, () => setFilter({ gsel: state.gsel.filter((x) => x !== k) })]));
    if (s.price !== "all") chips.push([s.price === "free" ? "Ücretsiz" : "Ücretli", () => setFilter({ price: "all" })]);
    if (s.city !== ALL_CITIES) chips.push([s.city, () => setFilter({ city: ALL_CITIES })]);
    chipBox.replaceChildren(...chips.map(([label, fn]) => dkFilterChip(label, fn)));
    if (focusIdx >= 0) (chipBox.children[Math.min(focusIdx, chipBox.children.length - 1)] || countLabel).focus({ preventScroll: true });
    if (!ready) countLabel.textContent = "";
  }

  function renderResults(anim) {
    more.hidden = true; allShown.hidden = true;
    if (loadState === "loading") {
      emptyBox.hidden = true; grid.hidden = false;
      grid.setAttribute("aria-busy", "true");
      grid.replaceChildren(...Array.from({ length: 6 }, () => dkSkeletonCard("date")));
      return;
    }
    grid.removeAttribute("aria-busy");
    if (loadState === "error") {
      grid.hidden = true; grid.replaceChildren();
      const retry = h("button", { type: "button", class: "dk-etkinlikler-reset dk-press" }, "Tekrar dene");
      retry.addEventListener("click", () => load());
      emptyBox.replaceChildren(svgRaw(P.alert, { size: 40, sw: "1.4" }),
        h("span", { class: "dk-etkinlikler-empty-t" }, "Bir sorun oldu"),
        h("span", { class: "dk-etkinlikler-empty-s" }, "Bağlantını kontrol edip tekrar dene."), retry);
      emptyBox.setAttribute("role", "alert");
      emptyBox.hidden = false;
      countLabel.textContent = "";
      return;
    }
    emptyBox.removeAttribute("role");
    const list = filtered();
    countLabel.textContent = `${fmtInt(list.length)} etkinlik`;
    if (!list.length) {
      grid.hidden = true; grid.replaceChildren();
      const kids = [svgRaw(P.calendar, { size: 40, sw: "1.4" }),
        h("span", { class: "dk-etkinlikler-empty-t" }, "Etkinlik yok"),
        h("span", { class: "dk-etkinlikler-empty-s" }, "Bu tarihte etkinlik bulunamadı.")];
      if (activeCount(state)) {
        const b = h("button", { type: "button", class: "dk-etkinlikler-reset dk-press" }, "Filtreleri temizle");
        b.addEventListener("click", resetAll);
        kids.push(b);
      }
      emptyBox.replaceChildren(...kids);
      emptyBox.hidden = false;
      if (anim) swapAnim(emptyBox);
      return;
    }
    emptyBox.hidden = true; emptyBox.replaceChildren();
    grid.hidden = false;
    const shown = Math.min(list.length, state.page * PAGE);
    grid.replaceChildren(...list.slice(0, shown).map((ev) => eventCard(ev.e, { city: true })));
    if (anim) swapAnim(grid);
    renderMore(list.length, shown);
  }
  function renderMore(n, shown) {
    more.hidden = !(n > shown);
    allShown.hidden = !(n <= shown && state.page > 1 && n > PAGE);
    if (more.hidden) { more.replaceChildren(); return; }
    const btn = h("button", { type: "button", class: "dk-etkinlikler-morebtn dk-press" }, "Daha fazla yükle", svgRaw(P.chevronDown, { size: 15, sw: "2" }));
    btn.addEventListener("click", loadMore);
    more.replaceChildren(h("span", { class: "dk-etkinlikler-morecap" }, `${fmtInt(n)} etkinlikten ${fmtInt(shown)} tanesi gösteriliyor`), btn);
  }
  function loadMore() {
    const list = filtered();
    const before = Math.min(list.length, state.page * PAGE);
    state = { ...state, page: state.page + 1 };
    writeUrl(false);
    const shown = Math.min(list.length, state.page * PAGE);
    const added = list.slice(before, shown).map((ev) => eventCard(ev.e, { city: true }));
    grid.append(...added);
    renderMore(list.length, shown);
    // klavye kullanıcıları için odak ilk yeni karta (fareyle tıklamada halka görünmez)
    added[0]?.focus({ preventScroll: true });
  }

  function render({ anim = false } = {}) {
    if (dead) return;
    total.textContent = loadState === "ready" ? `${fmtInt(events.length)} ETKİNLİK · 14 GÜNLÜK TAKVİM` : "";
    renderStrip();
    panel.refresh();
    renderToolbar();
    renderResults(anim);
  }

  // ── ≤1023: filtre çekmecesi (soldan 320; taslak durum → "Uygula" ile işlenir) ──
  // SHARED-CANDIDATE: dkDrawer yalnız sağdan açılıyor → sol varyant cls "dk-etkinlikler-drw" + dk-etkinlikler.css ile (dkDrawer({ side: "left" }) önerisi).
  function openDrawer() {
    if (drawer) return;
    let draft = { ...state, gsel: [...state.gsel] };
    let cityPicked = false;            // taslak şehir bir şehir satırından mı seçildi (→ Uygula'da gb_city yazılır) yoksa Temizle mi
    const dp = filterPanel({ getState: () => draft, withHead: false, onPatch: (p, o) => {
      if ("city" in p) { cityPicked = !!o?.persist; if (!o?.fromCityList) dp.clearCityQuery(); }
      draft = { ...draft, ...p }; dp.refresh(); updApply();
    } });
    const applyBtn = dkButton("Uygula", { variant: "light", size: 44, full: true, onClick: () => {
      const d = draft; drawer?.close("apply");
      setFilter({ df: d.df, gsel: d.gsel, price: d.price, city: d.city }, { persist: cityPicked });
    } });
    const clearBtn = dkButton("Temizle", { variant: "outline", size: 44, onClick: () => { draft = { ...draft, df: "all", gsel: [], price: "all", city: ALL_CITIES }; cityPicked = false; dp.clearCityQuery(); dp.refresh(); updApply(); } });
    // ilk odak: seçili TARİH radyosu (dkDrawer [autofocus]'u tercih eder; yoksa en alttaki şehir aramasına giderdi)
    dp.node.querySelector('.dk-etkinlikler-fs-date [aria-checked="true"]')?.setAttribute("autofocus", "");
    const updApply = () => {
      const n = events.length ? filtered(draft).length : null;
      applyBtn.setAttribute("aria-label", n == null ? "Uygula" : `Uygula, ${n} etkinlik`);
    };
    drawer = dkDrawer({ title: "Filtreler", width: 320, cls: "dk-etkinlikler-drw", body: dp.node, footer: [clearBtn, applyBtn], closeLabel: "Filtreleri kapat",
      onClose: () => { drawer = null; fBtn.setAttribute("aria-expanded", "false"); } });
    fBtn.setAttribute("aria-expanded", "true");
    updApply();
  }
  // ≥1024'e genişleyince kenar çubuğu geri gelir → açık çekmece (ayrı taslakla) kapanır
  const mqWide = window.matchMedia("(min-width: 1024px)");
  const onWide = () => { if (mqWide.matches) drawer?.close("resize"); };
  mqWide.addEventListener("change", onWide);
  unsubs.push(() => mqWide.removeEventListener("change", onWide));

  // ── veri ──
  async function load() {
    loadState = "loading";
    render();
    let list;
    try { list = await discoverEvents(); } catch (err) {
      if (dead) return;
      console.warn("[etkinlikler] discoverEvents:", err?.code || err);
      loadState = "error"; render(); return;
    }
    if (dead) return;
    events = list.map(prep);
    buildCityIndex();
    if (pendingCitySlug) {            // 81 il dışındaki şehir adı (ör. eski kayıt) → etkinlik şehirlerinden çöz; çözülemezse giriş şehri kalır
      const c = cityFromSlug(pendingCitySlug);
      pendingCitySlug = null;
      if (c != null && fold(c) !== fold(state.city)) { state = { ...state, city: c }; showCity(c); }
      writeUrl(false);               // kanonik sehir=
    }
    loadState = "ready";
    const counts = { [ALL_CITIES]: events.length };
    cityIndex.list.forEach((c) => { counts[c] = cityIndex.counts.get(fold(c)) || 0; });
    shell.header.setCityCounts(counts);
    hdrCounts = counts;
    render({ anim: true });
  }

  // Header'dan (ya da başka bir bileşenden) şehir değişimi → listeyi süz + URL (gb_city'yi seçici zaten yazdı)
  const onCity = (e) => {
    const c = e.detail?.city;
    if (!c || fold(c) === fold(state.city)) return;
    setFilter({ city: c });
  };
  window.addEventListener(CITY_EVENT, onCity);
  unsubs.push(() => window.removeEventListener(CITY_EVENT, onCity));

  // ── Header şehir seçicisi: işaretli satır = sayfanın şehri (yerel varyant) ──
  // SHARED-CANDIDATE: cityButton seçiciyi daima value = getActiveCity() (gb_city) ile açıyor. Bu sayfada header ETİKETİ sayfanın şehrini
  // gösterir (URL/çip/Temizle yalnız sayfa — Q11) → etiket "İstanbul" iken listede TÜMÜ işaretli kalıyordu (aria-selected dahil).
  // Öneri: cityButton, setCity() ile gösterdiği şehri cityPicker'a `value` olarak versin. O zamana dek header düğmesinin tıklaması
  // yakalama evresinde burada karşılanır ve AYNI ortak seçici (cityPicker + dkPopover, aynı ölçüler) value = sayfa şehri ile açılır;
  // seçim davranışı değişmez (cityPicker: gb_city yazar + dk:citychange → onCity sayfayı süzer).
  let hdrCounts = null, cityPop = null;
  const hdrCityBtn = shell.node.querySelector(".dk-citybtn");
  const onHdrCity = (e) => {
    if (!hdrCityBtn || !hdrCityBtn.contains(e.target)) return;
    e.stopPropagation();                                       // ortak cityButton.open çalışmasın
    if (cityPop) { cityPop.close("toggle"); return; }
    const cp = cityPicker({ value: state.city, counts: hdrCounts,
      onPick: () => { cityPop?.close("pick"); try { hdrCityBtn.focus({ preventScroll: true }); } catch (_) {} } });
    cityPop = dkPopover({ anchor: hdrCityBtn, content: cp.node, label: "Şehir seç", width: 320, offset: 8, cls: "dk-cp-pop",
      onClose: () => { cityPop = null; hdrCityBtn.classList.remove("is-open"); } });
    hdrCityBtn.classList.add("is-open");
    requestAnimationFrame(() => { try { cp.input.focus({ preventScroll: true }); } catch (_) {} });
  };
  const hdrRight = hdrCityBtn?.parentElement;
  hdrRight?.addEventListener("click", onHdrCity, true);
  unsubs.push(() => { hdrRight?.removeEventListener("click", onHdrCity, true); cityPop?.close("destroy"); });

  // Header etiketi sayfanın şehrini gösterir (URL'den gelen şehir gb_city'ye YAZILMAZ); URL kanonik hâle gelir (sehir= her zaman)
  showCity(state.city);
  if (!pendingCitySlug) writeUrl(false);
  render();
  load();

  return {
    node: shell.node,
    update(query) {
      const next = parseQuery(query);
      if (pendingCitySlug && loadState !== "loading") pendingCitySlug = null;   // veri hazır ve hâlâ çözülemedi → giriş şehri
      if (!sameState(next, state)) {
        const cityChanged = fold(next.city) !== fold(state.city);
        state = next;
        if (cityChanged) { cityDirty = false; showCity(state.city); panel.clearCityQuery(); }   // geri/ileri: yalnız sayfa
        drawer?.close("update");
        render({ anim: true });
      }
      if (!pendingCitySlug) writeUrl(false);   // sehir= olmayan giriş (ör. menüdeki "Etkinlikler") → kanonik URL
    },
    onSession() { return true; },   // içerik oturuma bağlı değil (kimlik değişimini router ayrıca ele alır)
    destroy() {
      dead = true;
      if (cityDirty) { cityDirty = false; setActiveCity(state.city); }   // ok tuşuyla seçilmiş şehir tercihi kaybolmasın
      try { drawer?.close("destroy"); } catch (_) {}
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}
