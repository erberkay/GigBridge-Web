// WebHarita — masaüstü görünümü (≥769 px). Registry anahtarı: harita (#/harita; misafir + dinleyici + panel rolleri salt-okuma).
// Spec: specs/public-a.md §4 + design/WebHarita.dc.html sahibinin CLAUDE CODE notu. CSS: css/dk-harita.css (tümü .dk-harita altında).
// Legacy karşılığı: js/pages/customer.js renderHarita() (≤768 mobilde AYNEN kalır; router bu modülü orada yüklemez).
//
// Legacy özellikleri (korundu): Leaflet + OSM karoları (aynı sağlayıcı; koyu görünüm yalnız CSS filtresi), discoverEvents() içinden
// location{lat,lng} olanlar, başlık "Yakınındaki etkinlikler" + sayaç + lejant (Şu an çalıyor / Yaklaşan), konumsuz etkinlik uyarısı
// ("{n} etkinlik haritada gösterilemiyor — …", kapatılabilir), pine tıklayınca etkinlik kartı (tür, başlık, mekan, tarih, fiyat, Detay),
// pine tıklayınca tam konuma yakınlaşma (zoom ≥ 16), boş yere tıklayınca kart kapanır + önceki görünüme dönülür, zoom +/- (sağ alt),
// "Konumlu etkinlik yok" boş durumu, "Harita yüklenemedi." hata durumu.
// Yeni (tasarım): 400 px liste paneli (arama + tarih + tür filtresi, mesafeye göre sıralı), iki yönlü liste↔pin seçimi, tür renkli pinler
// + canlı halkası, kullanıcı konumu işaretçisi, pinin yanına yapışan/kenarda taraf değiştiren kart, "Konumuma git", lejant çipi.
// ROUTING="none" (helpers): yol çizgisi ÇİZİLMEZ; kartta kuş uçuşu mesafe + "Yol tarifi" (Google Maps yön bağlantısı, yeni sekme).
// Konum izni yoksa mesafe rozetleri gizli, liste tarihe göre sıralı (sahibi notu).
//
// Veri (YAZMA YOK): discoverEvents() (tek sorgu). Aynı mekandaki etkinlikler aynı koordinatı paylaştığı için pinler mekan noktası
// etrafında sabit piksel halkasına açılır (her etkinlik ayrı seçilebilir; merkezde ince bağlantı çizgili mekan noktası).
// Şehir: header şehir seçicisi (localStorage gb_city). "TÜMÜ" → legacy gibi tüm etkinlikler; şehir seçiliyse o şehir (public-a Q17).
// URL (#/harita?…): sec={eventId} (seçim, replaceState) · tur={jazz|electronic|rock|pop|akustik|hiphop|rnb} · tarih={bugun|yarin|bu-hafta|
// hafta-sonu} (ayrık filtreler pushState → geri tuşu önceki filtreye döner) · q= (arama, 250 ms debounce, replaceState). update(query) uygular.
// Klavye: satırlar ↑/↓; pinler tek sekme durağı (roving tabindex, ←/→/↑/↓/Home/End); satır/pin Enter/Space → odak karta (role=dialog),
// kart sekme sırasında kaynağın hemen arkasındaymış gibi (Shift+Tab kaynağa, sondan Tab kaynaktan sonrakine); Esc/× → odak kaynağa.
// Konum: açılışta yalnız izin zaten "granted" ise sessizce alınır; aksi halde "Konumuma git" / header "Konumumu kullan" ister.
import { h, loadLeaflet } from "../../ui.js";
import { discoverEvents } from "../../data.js";
import { publicShell, headerVariant } from "../shared/public-shell.js";
import { svgIcon, svgRaw, svgPath } from "../shared/icons.js";
import { cx, dkSegmented, dkEmpty, dkButton, dkSkeleton, dkToast } from "../shared/ui.js";
import { CITY_EVENT } from "../shared/city-picker.js";
import * as cityPickerMod from "../shared/city-picker.js";
import { evTitle, evImage, evHref, evCity } from "../shared/cards.js";
import {
  ALL_CITIES, getActiveCity, setActiveCity, sameCity, trUpper, matchText, eventStartMs, isLive, isEventOver, isToday, isTomorrow,
  startOfDay, fmtTime, fmtPrice, fmtInt, DAYS_TR_SHORT, MONTHS_TR_SHORT, haversineKm, latLngOf, ROUTING, fetchRoute, directionsUrl,
  debounce, swapAnim, writeQuery, eventGenres, clamp, initials,
} from "../shared/helpers.js";
import { GENRE_FAMILIES, FILTER_FAMILIES, genreFamily, genreGrad, genreLabel, primaryGenre, matchesFamilies, genreSoft } from "../shared/genres.js";

// ── Artboard SVG gövdeleri (birebir) ──
const P = {
  note: "M9 17V5l10-2v12M9 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  headset: "M4 15v-3a8 8 0 0 1 16 0v3M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z",
  mic: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M4 10h16M9 3v4M15 3v4"></path>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"></rect><path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-4h4v4"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
  crosshair: '<circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2.2" fill="currentColor"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>',
};
// Pin ikonu tür ailesine göre (artboard DCLogic G: Jazz/Rock/Akustik nota · Electronic/R&B kulaklık · Pop/Hip-Hop mikrofon; yedek nota)
const FAMILY_ICON = { jazz: P.note, rock: P.note, akustik: P.note, electronic: P.headset, rnb: P.headset, pop: P.mic, hiphop: P.mic };

const WHENS = [
  { key: "", label: "Tümü" },
  { key: "bugun", label: "Bugün" },
  { key: "yarin", label: "Yarın" },
  { key: "bu-hafta", label: "Bu hafta" },
  { key: "hafta-sonu", label: "Hafta sonu" },
];
const DAY = 86400e3;
const FAR_KM = 15;                  // bu mesafeden uzak pin gruplarına "{İLÇE} ↗ 24 KM" etiketi (artboard "KİLYOS ↑ 24 KM")
const GROUP_PX = 40;                // bu piksel mesafesindeki pinler halkaya açılır
const DETAIL_ZOOM = 16;             // legacy: pin/seçim → max(zoom, 16)
const FIT_MAX_ZOOM = 15;
const TR_CENTER = [39.0, 35.0];     // legacy: konumlu etkinlik yoksa Türkiye, zoom 6
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";   // legacy ile AYNI sağlayıcı (OSM); koyu görünüm CSS filtresi
const BANNER_KEY = "gb_harita_banner_closed";

// Kullanıcı konumu — modül düzeyinde (remount'larda korunur; legacy customer.js userCoords gibi). Header şehir seçicisinin
// "Konumumu kullan"ı city-picker.lastCoords'a yazar → burada okunur (SHARED-CANDIDATE: ortak bir setUserCoords/getUserCoords
// olmadığı için harita kendi konumunu city-picker'a geri yazamıyor; Keşfet mesafe rozetleriyle paylaşım için helpers'a taşınmalı).
let userCoords = null;
const pickerCoords = () => cityPickerMod.lastCoords || null;

// ── biçimleyiciler ──
// Mesafe (artboard/spec §4.5 tr-TR): < 10 km bir ondalık virgüllü "0,6 km", ≥ 10 km tam sayı "24 km".
// SHARED-CANDIDATE: helpers.fmtKm 1 km altında "620 m" veriyor; public-a §4.5 her yerde artboard biçimini istiyor.
function fmtDist(km) {
  const x = Number(km);
  if (!isFinite(x)) return "";
  if (x < 10) return Math.max(0.1, Math.round(x * 10) / 10).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";
  return Math.round(x).toLocaleString("tr-TR") + " km";
}
// Liste: "Bugün 21:00" / "Yarın 22:00" / "Sal 20:30" (6 gün içinde) / "13 Kas 21:30"
function whenShort(e) {
  const s = eventStartMs(e); if (s == null) return e?.date || "";
  const t = fmtTime(s), d = new Date(s);
  if (isToday(s)) return `Bugün ${t}`;
  if (isTomorrow(s)) return `Yarın ${t}`;
  if (s >= startOfDay() && s < startOfDay() + 7 * DAY) return `${DAYS_TR_SHORT[d.getDay()]} ${t}`;
  return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${t}`;
}
// Kart: "Bugün · 26 Eyl · 21:00" / "Sal · 29 Eyl · 20:30"
function whenFull(e) {
  const s = eventStartMs(e); if (s == null) return e?.date || "";
  const d = new Date(s);
  const day = isToday(s) ? "Bugün" : isTomorrow(s) ? "Yarın" : DAYS_TR_SHORT[d.getDay()];
  return `${day} · ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} · ${fmtTime(s)}`;
}
// Kuşbakışı yön oku (kullanıcı → pin)
function bearingArrow(from, to) {
  const toRad = (x) => x * Math.PI / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) - Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][Math.round(deg / 45) % 8];
}
// Tarih süzgeci (spec §4.6): bugün/yarın = aynı yerel gün (bugün canlıları da kapsar) · bu hafta = bugün 00:00 … şimdi + 7 gün ·
// hafta sonu = bu (ya da içinde bulunulan) Cumartesi 00:00 – Pazartesi 00:00 (Q16: yalnız yaklaşan hafta sonu)
function matchWhen(e, key, now = Date.now()) {
  if (!key) return true;
  const s = eventStartMs(e); if (s == null) return false;
  if (key === "bugun") return isLive(e, now) || isToday(s);
  if (key === "yarin") return isTomorrow(s);
  if (key === "bu-hafta") return isLive(e, now) || (s >= startOfDay(now) && s <= now + 7 * DAY);
  if (key === "hafta-sonu") {
    const today = new Date(startOfDay(now)); const dow = today.getDay();   // 0 Paz … 6 Cmt
    const sat = startOfDay(now) + (dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow) * DAY;
    const mon = sat + 2 * DAY;
    return (s >= sat && s < mon) || (isLive(e, now) && now >= sat && now < mon);
  }
  return true;
}
const WHEN_KEYS = new Set(WHENS.map((w) => w.key));
const famOf = (e) => genreFamily(primaryGenre(e));
const readSession = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const writeSession = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// leaflet.css bağlantısı yüklenene dek bekle (ui.loadLeaflet yalnız betiği bekler; CSS'siz kurulan harita bir an bozuk çizilir)
function leafletCssReady(timeout = 4000) {
  const link = document.querySelector("link[data-leaflet]");
  if (!link || link.sheet) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { clearTimeout(t); link.removeEventListener("load", done); link.removeEventListener("error", done); res(); };
    const t = setTimeout(done, timeout);
    link.addEventListener("load", done); link.addEventListener("error", done);
  });
}

export function haritaView(ctx) {
  const rm = reducedMotion();
  const unsubs = [];
  let dead = false;

  // ── durum ──
  const st = {
    all: [], loaded: false, error: false,
    city: getActiveCity(),
    tur: "", tarih: "", q: "", sel: null,
    scope: [], withLoc: [], noLoc: 0, visible: [],
    bannerClosed: readSession(BANNER_KEY) === "1",
  };
  const readQ = (q) => {
    const tur = q?.get("tur") || "";
    st.tur = FILTER_FAMILIES.includes(tur) ? tur : "";
    const tarih = q?.get("tarih") || "";
    st.tarih = WHEN_KEYS.has(tarih) ? tarih : "";
    st.q = q?.get("q") || "";
    st.sel = q?.get("sec") || null;
  };
  readQ(ctx.query);
  if (!userCoords) userCoords = pickerCoords();

  // ── kabuk ──
  const shell = publicShell({ active: "harita", footer: false, fullHeight: true, onCity: (c) => setCity(c) });
  const root = h("div", { class: "dk-harita" });
  shell.main.append(root);

  // ══════════ Liste paneli ══════════
  const eyebrow = h("span", { class: "dk-harita-eyebrow" });
  const count = h("span", { class: "dk-harita-count", "aria-live": "polite" });
  const legendDot = (color, label) => h("span", { class: "dk-harita-lg" }, h("span", { class: "dk-harita-lgdot", style: { background: color } }), label);

  const searchInput = h("input", { type: "search", class: "dk-harita-q", placeholder: "Etkinlik, sanatçı veya mekan", autocomplete: "off", spellcheck: "false" });
  searchInput.value = st.q;
  const search = h("label", { class: "dk-harita-search" },
    svgIcon("search", { size: 16, sw: "2", color: "#8A8E97" }),
    h("span", { class: "dk-sr" }, "Etkinlik, sanatçı veya mekan ara"),
    searchInput);
  const pushQ = debounce(() => writeQuery({ q: st.q.trim() || null }), 250);
  // "search": type=search kutusunda Esc/× ile temizleme (bazı tarayıcılar "input" yerine yalnız bunu yollar)
  const onSearch = () => { if (searchInput.value === st.q) return; st.q = searchInput.value; pushQ(); refilter(); };
  searchInput.addEventListener("input", onSearch);
  searchInput.addEventListener("search", onSearch);
  unsubs.push(() => pushQ.cancel());

  const when = dkSegmented({
    items: WHENS, value: st.tarih, size: 34, stretch: true, label: "Tarih", cls: "dk-harita-when",
    onChange: (k) => { st.tarih = k; writeQuery({ tarih: k || null }, { push: true }); refilter(); },
  });

  const chips = new Map();
  const chipsWrap = h("div", { class: "dk-harita-chips", role: "group", "aria-label": "Tür filtresi" });
  [["", "Tümü", "#F2F1EE"], ...FILTER_FAMILIES.map((k) => [k, GENRE_FAMILIES[k].label, GENRE_FAMILIES[k].color])].forEach(([k, label, color]) => {
    const b = h("button", { type: "button", class: "dk-harita-chip dk-press", "aria-pressed": "false", onclick: () => {
      st.tur = k; writeQuery({ tur: k || null }, { push: true }); syncChips(); refilter();
    } }, h("span", { class: "dk-harita-chipdot", style: { background: color } }), label);
    chips.set(k, b); chipsWrap.append(b);
  });
  const syncChips = () => chips.forEach((b, k) => { const on = k === st.tur; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  syncChips();

  const list = h("ul", { class: "dk-harita-list dk-scroll", "aria-label": "Etkinlikler" });
  const bannerSlot = h("div", { class: "dk-harita-bannerslot" });

  const aside = h("aside", { class: "dk-harita-aside", "aria-label": "Etkinlik listesi" },
    h("div", { class: "dk-harita-top" },
      h("div", { class: "dk-harita-titles" },
        eyebrow,
        h("h1", { class: "dk-harita-h1" }, "Yakınındaki ", h("em", {}, "etkinlikler"))),
      h("div", { class: "dk-harita-meta" }, count,
        h("span", { class: "dk-harita-legend" }, legendDot("#7CE0B0", "Şu an çalıyor"), legendDot("#FF4FA3", "Yaklaşan"))),
      search, when, chipsWrap),
    list, bannerSlot);

  // ══════════ Harita bölümü ══════════
  const mapEl = h("div", { class: "dk-harita-leaflet" });
  const zoomLabel = h("span", { class: "dk-harita-zl" }, "×1,0");
  const lgMe = h("span", { class: "dk-harita-lgi" }, h("span", { class: "dk-harita-lime" }), "Konumun");
  const lgRoute = h("span", { class: "dk-harita-lgi" }, h("span", { class: "dk-harita-liroute" }), "Rota");
  const legendChip = h("div", { class: "dk-harita-legendchip" }, lgMe, lgRoute, zoomLabel);
  const attr = h("a", { class: "dk-harita-attr", href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener" }, "© OpenStreetMap katkıda bulunanlar");
  const overlaySlot = h("div", { class: "dk-harita-ovslot" });
  const section = h("section", { class: "dk-harita-map" }, mapEl, legendChip, attr, overlaySlot);
  root.append(aside, section);

  // ── yardımcılar (başlık/sayaç/lejant) ──
  const cityLabel = () => (st.city === ALL_CITIES ? null : st.city);
  const drawHead = () => {
    const c = cityLabel();
    eyebrow.textContent = `HARİTA · ${c ? trUpper(c) : "TÜM ŞEHİRLER"}`;
    section.setAttribute("aria-label", c ? `${c} etkinlik haritası` : "Etkinlik haritası");
    if (!st.loaded && !st.error) { count.replaceChildren(dkSkeleton({ w: 84, h: 12, r: 3 })); return; }
    count.textContent = st.error ? "" : `${st.visible.length} ETKİNLİK`;   // veri hatasında "0 ETKİNLİK" yanıltıcı → sayaç boş
  };
  // Lejant çipi yalnız "Konumun" (ve rota çizilebiliyorsa "Rota") varken görünür; yalnız ölçek sayısı taşıyan boş çip gösterilmez
  // (misafir / konumsuz → çip yok).
  const drawLegend = () => {
    lgMe.hidden = !userCoords;
    lgRoute.hidden = !(userCoords && ROUTING !== "none");   // ROUTING="none" → çizgi yok → "Rota" lejantı da yok
    legendChip.hidden = !!st.mapError || (lgMe.hidden && lgRoute.hidden);
  };
  // Ölçek etiketi (Q14): son "ev" görünümüne (ilk sığdırma, şehir değişimi, Konumuma git) göre büyütme 2^(z − z0).
  // Biçim: ≥ 10 tam sayı "×16" · 1–10 tek ondalık "×2,0" · < 1 en çok iki anlamlı basamak "×0,5" / "×0,25" / "×0,063" · çok küçükte "×<0,01"
  let z0 = null;
  const fmtScale = (r) => {
    if (!isFinite(r) || r <= 0) return "×1,0";
    if (r >= 10) return "×" + Math.round(r).toLocaleString("tr-TR");
    if (r >= 1) return "×" + r.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (r < 0.01) return "×<0,01";
    return "×" + r.toLocaleString("tr-TR", { maximumSignificantDigits: 2 });
  };
  const drawZoom = () => { zoomLabel.textContent = !map || z0 == null ? "×1,0" : fmtScale(Math.pow(2, map.getZoom() - z0)); };

  // ── veri kapsamı + süzgeç ──
  const kmOf = (e) => (userCoords ? haversineKm(userCoords, latLngOf(e)) : null);
  const computeScope = () => {
    const live = st.all.filter((e) => !isEventOver(e));
    st.scope = st.city === ALL_CITIES ? live : live.filter((e) => sameCity(evCity(e), st.city));
    st.withLoc = st.scope.filter((e) => latLngOf(e));
    st.noLoc = st.scope.length - st.withLoc.length;
  };
  const computeVisible = () => {
    const now = Date.now();
    const q = st.q.trim();
    const v = st.withLoc.filter((e) => !isEventOver(e)
      && (!st.tur || matchesFamilies(eventGenres(e), [st.tur]))
      && matchWhen(e, st.tarih, now)
      && (!q || matchText(q, e.title, e.artistName, e.venueName)));
    if (userCoords) {
      const d = new Map(v.map((e) => [e.id, kmOf(e)]));
      v.sort((a, b) => (d.get(a.id) - d.get(b.id)) || ((eventStartMs(a) ?? 0) - (eventStartMs(b) ?? 0)));
    } else {
      v.sort((a, b) => (eventStartMs(a) ?? 0) - (eventStartMs(b) ?? 0));
    }
    st.visible = v;
  };

  // ══════════ Liste ══════════
  const rows = new Map();
  const rowFor = (e) => {
    const fam = famOf(e);
    const live = isLive(e);
    const km = kmOf(e);
    const on = st.sel === e.id;
    // Harita yüklenemediyse satır kart açamaz → doğrudan etkinlik sayfasına gider (çıkmaz satır olmasın)
    const btn = h("button", { type: "button", class: cx("dk-harita-row", "dk-press", on && "is-on"), "aria-pressed": st.mapError ? null : on ? "true" : "false", dataset: { id: e.id },
      style: { "--dk-hg": fam.color }, onclick: (ev) => { if (st.mapError) location.hash = evHref(e); else select(e.id, { from: "list", kb: ev.detail === 0 }); } },
    h("span", { class: "dk-harita-acc", "aria-hidden": "true" }),
    h("span", { class: "dk-harita-rowmain" },
      h("span", { class: "dk-harita-kick" }, genreLabel(primaryGenre(e)) || fam.label.toLocaleUpperCase("tr-TR"),
        live ? h("span", { class: "dk-harita-canli" }, h("span", { class: "dk-harita-canlidot" }), "CANLI") : null),
      h("span", { class: "dk-harita-rowt" }, evTitle(e)),
      h("span", { class: "dk-harita-rows" }, [e.venueName, whenShort(e)].filter(Boolean).join(" · "))),
    h("span", { class: "dk-harita-rowside" },
      km != null ? h("span", { class: "dk-harita-dist" }, svgIcon("navigation", { size: 11, sw: "2.2" }), fmtDist(km)) : null,
      h("span", { class: "dk-harita-price" }, fmtPrice(e.ticketPrice))));
    rows.set(e.id, btn);
    return h("li", { class: "dk-harita-li" }, btn);
  };
  const emptyLi = (title, sub, btnLabel, onClick) => h("li", { class: "dk-harita-empty" },
    h("span", { class: "dk-harita-emptyt" }, title),
    sub ? h("span", { class: "dk-harita-emptys" }, sub) : null,
    btnLabel ? h("button", { type: "button", class: "dk-harita-emptyb dk-press", onclick: onClick }, btnLabel) : null);
  const renderList = ({ keepScroll = false } = {}) => {
    const top = list.scrollTop;
    const focusedId = document.activeElement?.closest?.(".dk-harita-row")?.dataset?.id || null;
    rows.clear();
    list.replaceChildren();
    list.removeAttribute("aria-busy");
    if (st.error) {
      list.append(emptyLi("Etkinlikler yüklenemedi.", "Bağlantını kontrol edip tekrar dene.", "Tekrar dene", () => load()));
    } else if (!st.loaded) {
      list.setAttribute("aria-busy", "true");
      for (let i = 0; i < 5; i++) list.append(h("li", { class: "dk-harita-li", "aria-hidden": "true" },
        h("span", { class: "dk-harita-skel" }, dkSkeleton({ w: "38%", h: 10, r: 3 }), dkSkeleton({ w: "72%", h: 15, r: 4 }), dkSkeleton({ w: "56%", h: 12, r: 3 }))));
    } else if (!st.withLoc.length) {
      const c = cityLabel();
      list.append(c
        ? emptyLi(`${c} için konumlu etkinlik yok`, "Mekanlar konum ekledikçe burada görünür.", "Tüm şehirleri göster", () => pickAllCities())
        : emptyLi("Konumlu etkinlik yok", "Mekanlar konum ekledikçe burada görünür."));
    } else if (!st.visible.length) {
      list.append(emptyLi("Bu filtrelerle etkinlik yok", null, "Filtreleri temizle", () => resetFilters()));
    } else {
      st.visible.forEach((e) => list.append(rowFor(e)));
    }
    if (keepScroll) list.scrollTop = top;
    if (focusedId && rows.get(focusedId)) rows.get(focusedId).focus({ preventScroll: true });
  };
  // ↑/↓ listede satırlar arası odak
  list.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    const all = [...list.querySelectorAll(".dk-harita-row")];
    const i = all.indexOf(document.activeElement); if (i < 0) return;
    const n = all[i + (ev.key === "ArrowDown" ? 1 : -1)];
    if (n) { ev.preventDefault(); n.focus(); }
  });

  // ── konumsuz etkinlik uyarısı ──
  const renderBanner = () => {
    bannerSlot.replaceChildren();
    if (!st.loaded || st.bannerClosed || st.noLoc <= 0) return;
    const close = h("button", { type: "button", class: "dk-harita-bannerx dk-press", "aria-label": "Kapat", onclick: () => {
      st.bannerClosed = true; writeSession(BANNER_KEY, "1"); renderBanner();
    } }, svgIcon("x", { size: 14, sw: "2" }));
    bannerSlot.append(h("div", { class: "dk-harita-banner", role: "status" },
      svgRaw(P.info, { size: 16, sw: "1.9", color: "#FFD700", cls: "dk-harita-bannerico" }),
      h("span", { class: "dk-harita-bannert" }, `${fmtInt(st.noLoc)} etkinlik haritada gösterilemiyor — mekanları henüz konum eklememiş.`),
      close));
  };

  // ══════════ Harita (Leaflet) ══════════
  let L = null, map = null, meMarker = null, prevView = null, interacted = false, didFit = false;
  const pins = new Map();       // id → { marker, el, e, dx, dy, ll }
  let extras = [];              // hub + uzak etiket işaretçileri
  let routeLayers = [];
  let routeReq = 0;
  // Pin düşüşü (artboard gbDrop: 520 ms, gecikme 120 + i·60 ms) yalnız ilk veri çiziminde. Düşüş sürerken pinler yeniden
  // kurulursa (ilk sığdırma/konum gelişi → zoomend → yeniden gruplama, sıralama değişimi) animasyon KALDIĞI yerden sürer:
  // her pinin ilk gecikmesi saklanır, yeniden kurulumda geçen süre kadar negatif animation-delay verilir.
  const DROP_MS = 520;
  let dropT0 = null;
  const dropDelay = new Map();  // id → ilk çizimdeki gecikme (ms)
  let pinTab = null;            // pinlerde tek sekme durağı (roving tabindex): odaklanabilir pinin etkinlik id'si

  const pinAria = (e) => [evTitle(e), e.venueName, isLive(e) ? "şu an çalıyor" : null].filter(Boolean).join(", ");
  const pinEl = (e, delay) => {
    const fam = famOf(e);
    const el = h("button", { type: "button", class: cx("dk-harita-pin", delay != null && "dk-pindrop"), "aria-pressed": "false", tabindex: "-1", dataset: { id: e.id },
      style: { "--dk-hg": fam.color, "--dk-delay": delay != null ? Math.round(delay) + "ms" : null } },
    h("span", { class: "dk-harita-pinhalo dk-ping", "aria-hidden": "true" }),
    h("span", { class: "dk-harita-pinc", "aria-hidden": "true" }, svgPath(FAMILY_ICON[fam.key] || P.note, { size: 15, sw: "2.2", color: "#06070A" })),
    h("span", { class: "dk-harita-pinlive", "aria-hidden": "true" }));
    return el;
  };
  const syncPin = (rec) => {
    const on = st.sel === rec.e.id;
    const live = isLive(rec.e);
    rec.el.classList.toggle("is-sel", on);
    rec.el.classList.toggle("is-live", live);
    rec.el.setAttribute("aria-pressed", on ? "true" : "false");
    rec.el.setAttribute("aria-label", pinAria(rec.e));
    rec.marker.setZIndexOffset(on ? 200000 : 0);
  };
  const clearPins = () => {
    pins.forEach((r) => r.marker.remove()); pins.clear();
    extras.forEach((m) => m.remove()); extras = [];
  };
  // Gruplama: o anki zoom'da ekranda birbirine GROUP_PX'ten yakın pinler (aynı mekan dahil) tek grupta toplanır ve grubun
  // çapası (ilk üye = listede önce gelen) etrafında sabit piksel halkasına açılır → her etkinlik ayrı, tıklanabilir pin kalır.
  // zoomend'de gruplar yeniden hesaplanır (değiştiyse pinler animasyonsuz yeniden kurulur).
  let groupSig = "";
  const computeGroups = () => {
    const z = map.getZoom();
    const groups = [];
    st.visible.forEach((e, i) => {
      const ll = latLngOf(e);
      const p = map.project([ll.lat, ll.lng], z);
      let g = groups.find((x) => x.p.distanceTo(p) <= GROUP_PX);
      if (!g) { g = { p, ll, items: [] }; groups.push(g); }
      g.items.push({ e, i });
    });
    return groups;
  };
  const sigOf = (groups) => groups.map((g) => g.items.map((x) => x.e.id).join(",")).join("|") + (userCoords ? "@u" : "");
  const renderPins = () => {
    if (!map) return;
    const now = performance.now();
    if (dropT0 == null && !rm && st.loaded && st.visible.length) {
      dropT0 = now;
      st.visible.forEach((e, i) => dropDelay.set(e.id, 120 + Math.min(i, 24) * 60));
    }
    const elapsed = dropT0 == null ? 0 : now - dropT0;
    const focusedId = document.activeElement?.closest?.(".dk-harita-pin")?.dataset?.id || null;
    clearPins();
    const groups = computeGroups();
    groupSig = sigOf(groups);
    groups.forEach(({ ll, items }) => {
      const n = items.length;
      // halka yarıçapı: en az 22 px; pin başına ~36 px çevre
      const R = n > 1 ? Math.max(22, Math.round((36 * n) / (2 * Math.PI))) : 0;
      const offs = items.map((_, k) => (n > 1 ? { dx: Math.round(R * Math.cos(-Math.PI / 2 + (2 * Math.PI * k) / n)), dy: Math.round(R * Math.sin(-Math.PI / 2 + (2 * Math.PI * k) / n)) } : { dx: 0, dy: 0 }));
      if (n > 1) {
        const S = 2 * R + 8, c = S / 2;
        const legs = offs.map((o) => `<path d="M${c} ${c}L${c + o.dx} ${c + o.dy}"></path>`).join("");
        const svg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" aria-hidden="true"><g stroke="rgba(242,241,238,0.22)" stroke-width="1" fill="none">${legs}</g><circle cx="${c}" cy="${c}" r="3.5" fill="rgba(242,241,238,0.6)" stroke="#0A0C10" stroke-width="1.5"></circle></svg>`;
        extras.push(L.marker([ll.lat, ll.lng], { icon: L.divIcon({ className: "dk-harita-mk dk-harita-hub", html: svg, iconSize: [S, S], iconAnchor: [c, c] }), interactive: false, keyboard: false, zIndexOffset: -1000 }).addTo(map));
      }
      items.forEach(({ e }, k) => {
        const { dx, dy } = offs[k];
        const base = dropDelay.get(e.id);
        const d = base != null && !rm ? base - elapsed : null;
        const el = pinEl(e, d != null && d + DROP_MS > 0 ? d : null);
        const marker = L.marker([ll.lat, ll.lng], {
          icon: L.divIcon({ className: "dk-harita-mk", html: el, iconSize: [44, 44], iconAnchor: [22 - dx, 22 - dy] }),
          keyboard: false, riseOnHover: false, bubblingMouseEvents: false,
        }).addTo(map);
        // klavyeyle (Enter/Space → click.detail 0) seçilirse odak karta geçer
        marker.on("click", (ev) => select(e.id, { from: "pin", kb: ev?.originalEvent?.detail === 0 }));
        const rec = { marker, el, e, dx, dy, ll, R };
        pins.set(e.id, rec);
        syncPin(rec);
      });
      // uzak grup etiketi (artboard "KİLYOS ↑ 24 KM"): kullanıcı konumu varken ≥ 15 km. Metin düğümü (HTML dizgesi değil) →
      // "R&B Bar" gibi adlar bozulmadan, kaçışsız güvenli.
      const km = userCoords ? haversineKm(userCoords, ll) : null;
      if (km != null && km >= FAR_KM) {
        const e0 = items[0].e;
        const name = trUpper(e0.district || e0.location?.district || e0.venueName || "");
        const txt = `${name ? name + " " : ""}${bearingArrow(userCoords, ll)} ${Math.round(km).toLocaleString("tr-TR")} KM`;
        extras.push(L.marker([ll.lat, ll.lng], { icon: L.divIcon({ className: "dk-harita-mk", html: h("span", { class: "dk-harita-far" }, txt), iconSize: [0, 0], iconAnchor: [-(R + 22), 6] }), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map));
      }
    });
    syncPinTab();
    if (focusedId && pins.get(focusedId)) pins.get(focusedId).el.focus({ preventScroll: true });
  };
  // Pinler tek sekme durağı (roving tabindex): seçili pin, yoksa listede ilk görünen; ←/→/↑/↓ liste sırasında pinler arası gezinir.
  function syncPinTab() {
    if (!pins.size) { pinTab = null; return; }
    if (st.sel && pins.has(st.sel)) pinTab = st.sel;
    else if (!pinTab || !pins.has(pinTab)) pinTab = st.visible.find((e) => pins.has(e.id))?.id || null;
    pins.forEach((r, id) => r.el.setAttribute("tabindex", id === pinTab ? "0" : "-1"));
  }
  const onPinKey = (ev) => {
    const el = ev.target.closest?.(".dk-harita-pin");
    if (!el || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(ev.key)) return;
    const order = st.visible.map((e) => e.id).filter((id) => pins.has(id));
    const i = order.indexOf(el.dataset.id); if (i < 0) return;
    const j = ev.key === "Home" ? 0 : ev.key === "End" ? order.length - 1
      : clamp(i + (ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : -1), 0, order.length - 1);
    ev.preventDefault(); ev.stopPropagation();   // Leaflet klavye kaydırması çalışmasın
    pinTab = order[j];
    pins.forEach((r, id) => r.el.setAttribute("tabindex", id === pinTab ? "0" : "-1"));
    const rec = pins.get(pinTab);
    rec.el.focus({ preventScroll: true });
    // odaklanan pin görünür alanın dışındaysa haritayı (seçim yapmadan) ona kaydır
    if (map && !map.getBounds().contains(rec.marker.getLatLng())) map.panTo(rec.marker.getLatLng(), { animate: !rm });
  };
  // İlk yeniden gruplamayı ilk pin çizimi yapar (afterData: önce sığdır, sonra çiz) → zoomend erken çizim yapıp düşüşü tüketmez
  const regroup = () => { if (map && st.loaded && groupSig && sigOf(computeGroups()) !== groupSig) { renderPins(); placeCard(); } };
  const renderMe = () => {
    if (!map) return;
    if (!userCoords) { meMarker?.remove(); meMarker = null; return; }
    const ll = [userCoords.lat, userCoords.lng];
    if (meMarker) { meMarker.setLatLng(ll); return; }
    meMarker = L.marker(ll, { icon: L.divIcon({ className: "dk-harita-mk", iconSize: [32, 32], iconAnchor: [16, 16],
      html: '<span class="dk-harita-me"><span class="dk-harita-mehalo dk-ping"></span><span class="dk-harita-medot"></span></span>' }),
    interactive: false, keyboard: false, zIndexOffset: 100000 }).addTo(map);
  };
  // pin halkaları (±R) + sol üst lejant + sağ alt kontroller (64×170) dışarıda kalsın
  const fitPadding = () => ({ paddingTopLeft: [80, 112], paddingBottomRight: [132, 112] });
  const fitVisible = ({ animate = false, near = true } = {}) => {
    if (!map) return;
    let pts = st.visible.map((e) => latLngOf(e));
    if (!pts.length) pts = st.withLoc.map((e) => latLngOf(e));
    if (near && userCoords && pts.length) {
      const close = pts.filter((p) => haversineKm(userCoords, p) <= 25);
      if (close.length) pts = [...close, userCoords];
    }
    // z0 = HEDEF zoom (animasyonlu sığdırmada getZoom() henüz eski değeri verir) → ölçek etiketi sığdırma bitince ×1,0
    if (!pts.length) { map.setView(TR_CENTER, 6, { animate: false }); z0 = 6; drawZoom(); return; }
    if (pts.length === 1) { map.setView([pts[0].lat, pts[0].lng], 13, { animate: animate && !rm }); z0 = 13; }
    else {
      const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng]));
      const pad = fitPadding();
      map.fitBounds(b, { ...pad, maxZoom: FIT_MAX_ZOOM, animate: animate && !rm });
      const bz = map.getBoundsZoom(b, false, L.point(pad.paddingTopLeft).add(pad.paddingBottomRight));
      z0 = isFinite(bz) ? Math.min(FIT_MAX_ZOOM, bz) : FIT_MAX_ZOOM;
    }
    didFit = true;
    drawZoom();
  };
  const anyVisibleInView = () => {
    if (!map || !st.visible.length) return true;
    const b = map.getBounds();
    return st.visible.some((e) => { const p = latLngOf(e); return b.contains([p.lat, p.lng]); });
  };

  // ── rota (ROUTING="none" → fetchRoute null → çizgi yok; sağlayıcı eklenirse glow + kesikli çizgi) ──
  const clearRoute = () => { routeLayers.forEach((l) => l.remove()); routeLayers = []; };
  const drawRoute = async (e) => {
    clearRoute();
    if (!map || !userCoords || ROUTING === "none") return;
    const req = ++routeReq;
    let geo = null;
    try { geo = await fetchRoute(userCoords, latLngOf(e)); } catch (_) { geo = null; }
    if (dead || req !== routeReq || !geo || st.sel !== e.id) return;
    const coords = (geo.coordinates || geo).map((c) => (Array.isArray(c) ? [c[1], c[0]] : [c.lat, c.lng]));
    routeLayers = [
      L.polyline(coords, { color: "#4ED8FF", weight: 9, opacity: 0.14, lineCap: "round", interactive: false }).addTo(map),
      L.polyline(coords, { color: "#4ED8FF", weight: 2.4, opacity: 0.95, dashArray: "5 5", lineCap: "round", className: "dk-dash", interactive: false }).addTo(map),
    ];
  };

  // ══════════ Kart ══════════
  let card = null, cardFor = null, cardSig = "";
  let cardOrigin = null;        // { kind: "list" | "pin", id } — seçimin geldiği yer (odak dönüşü + sekme sırası)
  const cardSigOf = (e) => JSON.stringify([e.id, isLive(e), whenFull(e), kmOf(e) != null ? fmtDist(kmOf(e)) : "", e.attendeeCount || 0, evTitle(e), fmtPrice(e.ticketPrice), evImage(e) || "", e.venueName || "", e.artistName || ""]);
  const originEl = () => (cardOrigin ? (cardOrigin.kind === "pin" ? pins.get(cardOrigin.id)?.el : rows.get(cardOrigin.id)) || rows.get(cardOrigin.id) || pins.get(cardOrigin.id)?.el : null);
  // Kart, sekme sırasında seçimin geldiği satırın/pinin HEMEN ARKASINDA duruyormuş gibi davranır: kartın başından Shift+Tab
  // kaynağa, sonundan Tab kaynaktan sonraki odaklanabilir öğeye gider (kart DOM'da harita bölümünün sonunda olsa da).
  const TABBABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const cardTabbables = () => [...card.querySelectorAll(TABBABLE)].filter((el) => el.offsetParent !== null);
  const afterOrigin = (src) => {
    const all = [...root.querySelectorAll(TABBABLE)].filter((el) => !card.contains(el) && el.tabIndex >= 0 && el.offsetParent !== null);
    const i = all.indexOf(src);
    return i < 0 ? null : all[i + 1] || null;
  };
  const onCardKey = (ev) => {
    if (ev.key !== "Tab" || !card) return;
    const inCard = cardTabbables();
    const a = document.activeElement;
    const src = originEl();
    if (!src || !src.isConnected) return;
    if (ev.shiftKey && (a === card || a === inCard[0])) { ev.preventDefault(); ev.stopPropagation(); src.focus({ preventScroll: true }); return; }
    if (!ev.shiftKey && (a === inCard[inCard.length - 1] || (a === card && !inCard.length))) {
      const next = afterOrigin(src);
      if (next) { ev.preventDefault(); ev.stopPropagation(); next.focus(); }
    }
  };
  // ...ve kaynaktan sonraki öğeden Shift+Tab kartın son öğesine döner
  const onRootTab = (ev) => {
    if (ev.key !== "Tab" || !ev.shiftKey || !card || card.contains(ev.target)) return;
    const src = originEl();
    if (!src || !src.isConnected || afterOrigin(src) !== ev.target) return;
    const inCard = cardTabbables();
    ev.preventDefault();
    (inCard[inCard.length - 1] || card).focus({ preventScroll: true });
  };
  root.addEventListener("keydown", onRootTab);
  const placeCard = ({ zoom, center } = {}) => {
    if (!card || !map || !cardFor) return;
    const rec = pins.get(cardFor);
    const e = rec?.e || st.visible.find((x) => x.id === cardFor);
    if (!e) return;
    const ll = rec?.ll || latLngOf(e);
    let pt;
    if (zoom != null && center) {
      pt = map.project([ll.lat, ll.lng], zoom).subtract(map.project(center, zoom)).add(map.getSize().divideBy(2));
    } else pt = map.latLngToContainerPoint([ll.lat, ll.lng]);
    const x = pt.x + (rec?.dx || 0), y = pt.y + (rec?.dy || 0);
    const W = section.clientWidth, H = section.clientHeight, CW = card.offsetWidth, CH = card.offsetHeight;
    // artboard: pinin 34 px sağı; sığmazsa 34 px solu. Halkaya açılmış grupta halkanın dışına yerleşir (kardeş pinleri örtmez).
    const R = rec?.R || 0;
    let left = Math.max(x, pt.x + R) + 34;
    if (left + CW > W - 16) left = Math.min(x, pt.x - R) - 34 - CW;
    left = clamp(left, 16, Math.max(16, W - CW - 16));
    const top = clamp(y - 120, 70, Math.max(70, H - CH - 16));
    card.style.left = Math.round(left) + "px";
    card.style.top = Math.round(top) + "px";
  };
  const closeCard = () => { card?.remove(); card = null; cardFor = null; cardSig = ""; };
  // kart yeniden kurulurken odak kartın içindeyse aynı role (kapat / yol tarifi / detay / kartın kendisi) geri verilir
  const cardFocusKey = () => {
    const a = document.activeElement;
    if (!card || !a || !card.contains(a)) return null;
    return [".dk-harita-cclose", ".dk-harita-cdir", ".dk-harita-cdetail"].find((s) => a.matches(s)) || "card";
  };
  const renderCard = (e, changed) => {
    const fam = famOf(e);
    const live = isLive(e);
    const km = kmOf(e);
    const img = evImage(e);
    const media = img
      ? h("img", { class: "dk-harita-cimg", src: img, alt: "", decoding: "async" })
      : h("span", { class: "dk-harita-cimg dk-harita-cph", style: { background: genreGrad(primaryGenre(e), 150) }, "aria-hidden": "true" }, h("span", {}, initials(evTitle(e))));
    if (img) media.addEventListener("error", () => media.replaceWith(h("span", { class: "dk-harita-cimg dk-harita-cph", style: { background: genreGrad(primaryGenre(e), 150) }, "aria-hidden": "true" }, h("span", {}, initials(evTitle(e))))), { once: true });
    const dir = directionsUrl(e);
    const closeBtn = h("button", { type: "button", class: "dk-harita-cclose dk-press", "aria-label": "Kartı kapat", onclick: () => closeSel({ restore: true, focus: true }) }, svgIcon("x", { size: 15, sw: "2" }));
    const inner = [
      h("div", { class: "dk-harita-cmedia" }, media,
        h("span", { class: "dk-harita-cgrad", "aria-hidden": "true" }),
        h("span", { class: "dk-harita-cbadges" },
          h("span", { class: "dk-harita-cbadge", style: { color: fam.color, borderColor: genreSoft(primaryGenre(e), 0.5) } }, genreLabel(primaryGenre(e)) || fam.label.toLocaleUpperCase("tr-TR")),
          live ? h("span", { class: "dk-harita-cbadge dk-harita-clive" },
            h("span", { class: "dk-harita-clivedot" }, h("span", { class: "dk-ping" }), h("span", {})), "ŞU AN ÇALIYOR") : null),
        closeBtn),
      h("div", { class: "dk-harita-cbody" },
        h("h2", { class: "dk-harita-ct" }, evTitle(e)),
        h("div", { class: "dk-harita-clines" },
          h("span", { class: "dk-harita-cl is-date" }, svgRaw(P.calendar, { size: 14, sw: "1.9", color: "#FF8A2A" }), h("span", {}, whenFull(e))),
          // artboard: parçalar ayrı esnek öğeler (aralarında 8 px boşluk) → "Babylon Club · Kerem Görsev", "0,6 km uzaklıkta · 124 katılımcı"
          h("span", { class: "dk-harita-cl" }, svgRaw(P.building, { size: 14, sw: "1.9" }),
            h("span", { class: "dk-harita-cltxt" }, e.venueName || "Mekan"),
            e.artistName ? h("span", {}, "·") : null, e.artistName ? h("span", { class: "dk-harita-cltxt" }, e.artistName) : null),
          km != null
            ? h("span", { class: "dk-harita-cl" }, svgIcon("navigation", { size: 14, sw: "1.9", color: "#4ED8FF" }), h("span", { class: "dk-harita-cdist" }, fmtDist(km)),
              h("span", {}, "uzaklıkta ·"), h("span", {}, fmtInt(e.attendeeCount || 0)), h("span", {}, "katılımcı"))
            : h("span", { class: "dk-harita-cl" }, svgIcon("users2", { size: 14, sw: "1.9" }), h("span", {}, fmtInt(e.attendeeCount || 0)), h("span", {}, "katılımcı"))),
        h("div", { class: "dk-harita-cfoot" },
          h("span", { class: "dk-harita-cprice" }, fmtPrice(e.ticketPrice)),
          dir ? h("a", { class: "dk-harita-cdir dk-press", href: dir, target: "_blank", rel: "noopener", "aria-label": "Yol tarifi (Google Haritalar, yeni sekmede açılır)" },
            svgIcon("navigation", { size: 14, sw: "2" }), "Yol tarifi") : null,
          h("a", { class: "dk-harita-cdetail dk-press", href: evHref(e) }, "Detay", svgIcon("arrowRight", { size: 14, sw: "2.2" })))),
    ];
    cardSig = cardSigOf(e);
    if (!card) {
      card = h("div", { class: "dk-harita-card dk-fa is-tracking", role: "dialog", "aria-label": evTitle(e), tabindex: "-1" }, ...inner);
      card.addEventListener("keydown", onCardKey);
      section.append(card);
      cardFor = e.id;
      placeCard();
      void card.offsetWidth;
      card.classList.remove("is-tracking");
    } else {
      const fk = cardFocusKey();
      card.replaceChildren(...inner);
      card.setAttribute("aria-label", evTitle(e));
      cardFor = e.id;
      if (changed) swapAnim(card);
      placeCard();
      if (fk) (fk === "card" ? card : card.querySelector(fk) || card).focus({ preventScroll: true });
    }
  };
  // Aynı etkinlik için yalnız içerik değiştiyse yeniden kur (dakikalık tazeleme / süzgeç yazımı odağı ve animasyonu bozmasın)
  const refreshCard = (e) => { if (map && card && cardFor === e.id && cardSigOf(e) !== cardSig) renderCard(e, false); };

  // ══════════ Seçim (iki yönlü) ══════════
  const syncSelectionUI = () => {
    rows.forEach((b, id) => { const on = id === st.sel; b.classList.toggle("is-on", on); if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", on ? "true" : "false"); });
    pins.forEach((rec) => syncPin(rec));
    syncPinTab();
  };
  const focusMapOn = (e) => {
    if (!map) return;
    const ll = latLngOf(e);
    if (!prevView) prevView = { center: map.getCenter(), zoom: map.getZoom() };
    const z = Math.max(map.getZoom(), DETAIL_ZOOM);
    // legacy: pin ortalanır. Dar haritada (kart ortalanmış pinin sağına sığmıyorsa) pin + kart birlikte ortalanacak şekilde kaydır.
    let target = L.latLng(ll.lat, ll.lng);
    const W = section.clientWidth, CW = card?.offsetWidth || 340, R = pins.get(e.id)?.R || 0;
    if (W / 2 + R + 34 + CW > W - 16) {
      const shift = Math.min(W / 2 - 16 - R - 22, (R + 34 + CW) / 2);
      target = map.unproject(map.project(target, z).add([shift, 0]), z);
    }
    if (rm) map.setView(target, z, { animate: false });
    else if (Math.abs(z - map.getZoom()) > 3 || map.distance(map.getCenter(), target) > 50000) map.flyTo(target, z, { duration: 0.9 });
    else map.setView(target, z, { animate: true });
  };
  function select(id, { from = "list", fly = true, kb = false } = {}) {
    const e = st.visible.find((x) => x.id === id);
    if (!e) return;
    const changed = st.sel !== id;
    st.sel = id;
    cardOrigin = { kind: from, id };
    writeQuery({ sec: id });
    syncSelectionUI();
    if (map) {
      renderCard(e, changed);
      if (fly) focusMapOn(e);
      drawRoute(e);
      // klavyeyle seçildiyse odak karta (role=dialog, etiket = başlık): Tab → Kapat · Yol tarifi · Detay; Esc/× kaynağa döner
      if (kb && card) card.focus({ preventScroll: true });
    }
    if (from === "pin") rows.get(id)?.scrollIntoView({ block: "nearest", behavior: rm ? "auto" : "smooth" });
  }
  function closeSel({ restore = true, focus = false } = {}) {
    const was = st.sel;
    if (!was && !card) return;
    const hadFocus = !!(card && card.contains(document.activeElement));
    const inMap = section.contains(document.activeElement);
    const fromPin = !!document.activeElement?.closest?.(".dk-harita-pin") || ((hadFocus || inMap) && cardOrigin?.kind === "pin");
    st.sel = null;
    cardOrigin = null;
    writeQuery({ sec: null });
    closeCard();
    clearRoute(); routeReq++;
    syncSelectionUI();
    if (restore && prevView && map) map.setView(prevView.center, prevView.zoom, { animate: !rm });
    prevView = null;
    // odak: pindeyse pinde kalır (yeniden gruplanırsa renderPins aynı etkinliğin pinine taşır), değilse listedeki satıra döner
    if ((focus || hadFocus) && was) ((fromPin ? pins.get(was)?.el : null) || rows.get(was) || pins.get(was)?.el)?.focus({ preventScroll: true });
  }

  // ══════════ Süzgeç / şehir / sıfırlama ══════════
  function refilter({ keepScroll = false, fitIfHidden = true } = {}) {
    computeVisible();
    drawHead();
    renderList({ keepScroll });
    renderPins();
    // veri gelmeden (ör. konum izni hazırsa açılıştaki konum) seçim düşürülmez: sec= derin bağlantısını load()/afterData uygular
    if (st.sel && st.loaded && !st.visible.some((e) => e.id === st.sel)) closeSel({ restore: false });
    else if (st.sel) { const e = st.visible.find((x) => x.id === st.sel); if (e) refreshCard(e); }
    drawMapEmpty();   // kapsam (şehir) değişince "Konumlu etkinlik yok" katmanı da güncellenir
    if (fitIfHidden && map && st.loaded && !anyVisibleInView()) fitVisible({ animate: true, near: false });
  }
  function setCity(c) {
    st.city = c || ALL_CITIES;
    closeSel({ restore: false });
    prevView = null;
    computeScope();
    renderBanner();
    refilter({ fitIfHidden: false });
    if (map && st.loaded) fitVisible({ animate: true });
  }
  function pickAllCities() {
    setActiveCity(ALL_CITIES);
    window.dispatchEvent(new CustomEvent(CITY_EVENT, { detail: { city: ALL_CITIES } }));   // header düğmesi etiketini günceller
    setCity(ALL_CITIES);
  }
  function resetFilters() {
    st.tur = ""; st.tarih = ""; st.q = "";
    searchInput.value = ""; when.dk.set(""); syncChips();
    pushQ.cancel();
    writeQuery({ tur: null, tarih: null, q: null }, { push: true });
    refilter();
    searchInput.focus({ preventScroll: true });
  }

  // ══════════ Konum ══════════
  const setCoords = (c, { recenter = false } = {}) => {
    const had = !!userCoords;
    userCoords = c;
    drawLegend();
    renderMe();
    refilter({ keepScroll: true, fitIfHidden: false });
    if (recenter && map) { map.setView([c.lat, c.lng], 15, { animate: !rm }); prevView = null; z0 = 15; drawZoom(); }
    else if (!had && map && st.loaded && !interacted && !st.sel) fitVisible({ animate: true });
  };
  let locating = false;
  const locateBtn = h("button", { type: "button", class: "dk-harita-locate dk-press", "aria-label": "Konumuma git" }, svgRaw(P.crosshair, { size: 18, sw: "1.9" }));
  locateBtn.addEventListener("click", () => {
    interacted = true;
    if (!navigator.geolocation) { dkToast("Tarayıcı konumu desteklemiyor", { type: "err" }); return; }
    if (locating) return;
    locating = true; locateBtn.classList.add("is-busy"); locateBtn.setAttribute("aria-busy", "true");
    navigator.geolocation.getCurrentPosition((pos) => {
      locating = false; locateBtn.classList.remove("is-busy"); locateBtn.removeAttribute("aria-busy");
      if (dead) return;
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { recenter: true });
    }, () => {
      locating = false; locateBtn.classList.remove("is-busy"); locateBtn.removeAttribute("aria-busy");
      if (!dead) dkToast("Konum alınamadı (izin?)", { type: "err" });
    }, { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false });
  });
  // Açılışta sessiz konum: YALNIZ izin önceden verilmişse ("granted"). Varsayılan "prompt" durumunda sayfa açılır açılmaz
  // tarayıcı izin penceresi çıkmasın (legacy harita konum sormazdı) → izin "Konumuma git" ya da header "Konumumu kullan" ile istenir.
  const autoLocate = async () => {
    if (userCoords || !navigator.geolocation) return;
    let state = null;
    try { state = (await navigator.permissions?.query?.({ name: "geolocation" }))?.state || null; } catch (_) { state = null; }
    if (dead || state !== "granted" || userCoords) return;
    navigator.geolocation.getCurrentPosition((pos) => { if (!dead && !userCoords) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); }, () => {}, { timeout: 10000, maximumAge: 300000 });
  };
  // Header şehir seçicisinde "Konumumu kullan" → city-picker.lastCoords
  const onCityEvt = () => { const c = pickerCoords(); if (c && (!userCoords || c.lat !== userCoords.lat || c.lng !== userCoords.lng)) setCoords(c); };
  window.addEventListener(CITY_EVENT, onCityEvt);
  unsubs.push(() => window.removeEventListener(CITY_EVENT, onCityEvt));

  // ══════════ Harita kurulumu ══════════
  const showMapOverlay = (node) => overlaySlot.replaceChildren(node ? h("div", { class: "dk-harita-overlay" }, node) : "");
  const drawMapEmpty = () => {
    if (st.loaded && !st.error && map && !st.withLoc.length) {
      showMapOverlay(dkEmpty({ variant: "plain", icon: "pin", title: "Konumlu etkinlik yok", sub: "Mekanlar konum ekledikçe burada görünür." }));
    } else if (!st.mapError) showMapOverlay(null);
  };
  const initMap = async () => {
    try {
      L = await loadLeaflet();
      await leafletCssReady();
    } catch (err) {
      if (dead) return;
      st.mapError = true;
      attr.hidden = true; drawLegend();
      renderList({ keepScroll: true });   // satırlar etkinlik sayfasına giden bağlantı gibi davranır
      showMapOverlay(dkEmpty({ variant: "plain", icon: "alertCircle", title: "Harita yüklenemedi.", sub: "Bağlantını kontrol edip sayfayı yenile.",
        action: dkButton("Sayfayı yenile", { variant: "outline", size: 40, onClick: () => location.reload() }) }));
      return;
    }
    if (dead) return;
    map = L.map(mapEl, {
      zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 19,
      // fadeAnimation kapalı: karo solması tasarımda yok (Leaflet solmayı Date ile hesaplar → sabit saatli ortamda karolar görünmez kalıyordu)
      zoomAnimation: !rm, fadeAnimation: false, markerZoomAnimation: !rm, inertia: !rm, worldCopyJump: false,
    });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "© OpenStreetMap katkıda bulunanlar" }).addTo(map);
    L.control.zoom({
      position: "bottomright", zoomInTitle: "Yakınlaştır", zoomOutTitle: "Uzaklaştır",
      zoomInText: svgIcon("plus", { size: 16, sw: "2" }).outerHTML, zoomOutText: svgIcon("minus", { size: 16, sw: "2" }).outerHTML,
    }).addTo(map);
    const Locate = L.Control.extend({ options: { position: "bottomright" }, onAdd: () => { L.DomEvent.disableClickPropagation(locateBtn); return locateBtn; } });
    new Locate().addTo(map);   // alt köşede sonra eklenen üstte → "Konumuma git" zoom grubunun üstünde
    map.setView(TR_CENTER, 6, { animate: false });

    map.on("click", () => closeSel({ restore: true }));
    map.on("movestart", () => card?.classList.add("is-tracking"));
    map.on("move", () => placeCard());
    map.on("moveend", () => { card?.classList.remove("is-tracking"); placeCard(); });
    map.on("zoomanim", (ev) => { if (!card) return; card.classList.remove("is-tracking"); card.classList.add("is-zooming"); placeCard({ zoom: ev.zoom, center: ev.center }); });
    map.on("zoomend", () => { card?.classList.remove("is-zooming"); drawZoom(); regroup(); placeCard(); });
    mapEl.addEventListener("keydown", onPinKey);
    const markInteract = () => { interacted = true; };
    ["wheel", "pointerdown", "keydown"].forEach((t) => mapEl.addEventListener(t, markInteract, { passive: true }));

    const ro = new ResizeObserver(() => { if (!map) return; map.invalidateSize({ pan: false }); placeCard(); });
    ro.observe(section);
    unsubs.push(() => ro.disconnect());

    renderMe();
    if (st.loaded) afterData();
  };
  // veri + harita ikisi de hazır olunca
  function afterData() {
    if (!map) return;
    fitVisible();       // önce sığdır (animasyonsuz) → pinler SON zoom'da, düşüş animasyonuyla bir kez çizilir
    renderPins();
    drawMapEmpty();
    if (st.sel) {
      const e = st.visible.find((x) => x.id === st.sel);
      if (e) select(e.id, { from: "pin" }); else { st.sel = null; writeQuery({ sec: null }); }
    }
    setTimeout(() => { if (!dead && map) { map.invalidateSize({ pan: false }); placeCard(); } }, 200);   // legacy: 200 ms sonra invalidateSize
  }

  // ══════════ Veri ══════════
  let loadSeq = 0;
  async function load() {
    const my = ++loadSeq;
    st.error = false; st.loaded = false;
    drawHead(); renderList();
    try {
      const events = await discoverEvents();
      if (dead || my !== loadSeq) return;
      st.all = events;
      st.loaded = true;
      // header şehir sayaçları (tüm yaklaşan etkinlikler)
      const counts = {};
      events.forEach((e) => { const c = evCity(e); if (c) counts[c] = (counts[c] || 0) + 1; });
      shell.header.setCityCounts({ ...counts, [ALL_CITIES]: events.length });
    } catch (err) {
      if (dead || my !== loadSeq) return;
      console.warn("[harita] discoverEvents", err);
      st.error = true; st.all = [];
    }
    computeScope();
    computeVisible();
    drawHead();
    renderList();
    renderBanner();
    if (st.sel && !st.visible.some((e) => e.id === st.sel)) { st.sel = null; writeQuery({ sec: null }); }
    if (map) afterData();
  }

  // ── Esc: kartı kapat, odağı seçili satıra ver ──
  const onKey = (ev) => {
    if (ev.key !== "Escape" || !card) return;
    if (document.querySelector('[aria-modal="true"], .dk-popv')) return;   // üst katman (modal/çekmece/popover) açıksa ESC onun
    if (ev.target === searchInput) {
      // arama kutusunda: önce tarayıcının kendi davranışı (metni temizle); kutu boşken Esc kartı kapatır, odak kutuda kalır
      if (searchInput.value) return;
      ev.preventDefault();
      closeSel({ restore: true, focus: false });
      return;
    }
    ev.preventDefault();
    closeSel({ restore: true, focus: root.contains(document.activeElement) });
  };
  document.addEventListener("keydown", onKey);
  unsubs.push(() => document.removeEventListener("keydown", onKey));

  // ── dakikalık tazeleme: canlı durumu / biten etkinlikler ──
  const tick = setInterval(() => {
    if (dead || !st.loaded) return;
    const before = st.visible.map((e) => e.id).join("|");
    computeScope(); computeVisible();
    if (st.visible.map((e) => e.id).join("|") !== before) { refilter({ keepScroll: true, fitIfHidden: false }); return; }
    renderList({ keepScroll: true });
    pins.forEach((r) => syncPin(r));
    if (st.sel) { const e = st.visible.find((x) => x.id === st.sel); if (e) refreshCard(e); }
  }, 60000);
  unsubs.push(() => clearInterval(tick));

  // ── başlat ──
  drawHead(); drawLegend(); drawZoom(); renderList();
  load();
  initMap();
  autoLocate();

  return {
    node: shell.node,
    update(query) {
      pushQ.cancel();
      const prevSel = st.sel;
      readQ(query);
      searchInput.value = st.q;
      when.dk.set(st.tarih);
      syncChips();
      const nextSel = st.sel;
      st.sel = prevSel;
      refilter();
      if (nextSel === st.sel) return;
      if (!st.loaded) { st.sel = nextSel; return; }                     // veri gelince load()/afterData uygular
      if (nextSel && st.visible.some((e) => e.id === nextSel)) select(nextSel, { from: "pin" });
      else if (nextSel) { closeSel({ restore: true }); writeQuery({ sec: null }); }   // bilinmeyen/gizli etkinlik → URL ile kart uyuşsun
      else closeSel({ restore: true });
    },
    onSession(s) {
      // header varyantı (misafir/dinleyici/panel) değişmediyse remount etme (harita + seçim korunur)
      return headerVariant(s) === shell.header.variant;
    },
    destroy() {
      dead = true;
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      try { clearPins(); clearRoute(); meMarker?.remove(); } catch (_) {}
      // Leaflet 1.9.4 zoom animasyonu 250 ms'lik setTimeout(_onZoomTransitionEnd) ve tekerlek zoom'u 40 ms'lik zamanlayıcı bırakır;
      // map.remove() bunları iptal etmez → sayfadan animasyon sırasında çıkınca "_leaflet_pos" TypeError. Önce etkisizleştir.
      try {
        if (map) {
          map.stop();
          map._animatingZoom = false;                        // _onZoomTransitionEnd bu bayrak yoksa hemen döner
          clearTimeout(map.scrollWheelZoom?._timer);         // bekleyen tekerlek zoom'u (_performZoom)
          map.off();
        }
      } catch (_) {}
      try { map?.remove(); } catch (_) {}
      map = null;
      shell.destroy();
    },
  };
}
