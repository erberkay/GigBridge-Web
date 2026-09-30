// WebKesfet — masaüstü Keşfet (≥769 px). Registry anahtarı: kesfet (#/kesfet).
// Spec: specs/public-a.md §1 (artboard design/WebKesfet.dc.html + sahibinin CLAUDE CODE notu).
// CSS: css/dk-kesfet.css — tüm seçiciler .dk-kesfet kökü altında.
// Legacy karşılığı: js/pages/customer.js kesfetPage()/renderKesfet() — ≤768'de (ve admin önizlemesinde) AYNEN kalır.
//
// Legacy özellikleri (korundu → yeni yerleri):
//   şehir açılır listesi (Konumumu kullan + Nominatim, şehir arama, 81 il, gb_city) → hero ŞEHİR segmenti + header şehir düğmesi
//     (ortak cityPicker; ikisi "dk:citychange" ile senkron) · arama (başlık/mekan/sanatçı) → hero arama çubuğu + "ARAMA SONUÇLARI"
//   · tür filtresi (legacy #poda filtre damlası) → her zaman görünen TÜR çipleri (7 aile; etkinlik + sanatçı + mekana uygulanır)
//   · "Sanatçıları Ara" kısayolu → SANATÇILAR sekmesi · kategori sekmeleri + kayma animasyonu · hero karuseli (VIP önce, sonra
//   tarih, ilk 5, otomatik geçiş) · GigBridge Top 10 (attendeeCount) · Sadece GigBridge'de (her zaman; boş durum metni) · En Yeniler
//   (isNew) · Bu Hafta (≤ şimdi + 7 gün) · Popüler Sanatçılar (takip et; TÜMÜ → SANATÇILAR) · ETKİNLİKLER/MEKANLAR/SANATÇILAR
//   listeleri + boş durumları · takip (misafirde giriş kapısı, "İşlem başarısız") · hata kutusu "Bir sorun oldu / Keşfet yüklenemedi."
//   · mesafe rozeti (Konumumu kullan sonrası; legacy distPill → kart altlığında küçük camgöbeği çip).
//
// URL (paylaşılabilir, geri tuşu çalışır): #/kesfet?kategori=etkinlikler|mekanlar|sanatcilar&sehir=istanbul|tumu&tur=jazz|…&q=…
//   kategori/sehir/tur → history.pushState (ayrık değişim) · q → replaceState (yazarken, gecikmeli) · update(query) geri/ileri'de uygular.
//   sehir'siz kayıt → history.state.dkKesfetCity (geri/ileri) ya da güncel gb_city (bağlantı) — seçilen şehir sessizce sıfırlanmaz.
// Veri (yeni sorgu YOK; legacy ile aynı üç okuma): discoverEvents(), listRealArtists(), listVenues() + girişliyse followingList(uid).
// Yazma: yalnız takip (legacy ile aynı followArtist/unfollowArtist → following + followers + new_follower bildirimi).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { discoverEvents, listRealArtists, listVenues, followingList, followArtist, unfollowArtist } from "../../data.js";
import { publicShell } from "../shared/public-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import {
  cx, dkChip, dkUnderlineTabs, dkSectionHead, dkEmpty, dkSkeleton, dkSkeletonCard, dkCarouselDots, dkCarouselArrows,
  dkEventBadge, dkToast, dkPopover, dkLoginGate, dkButton,
} from "../shared/ui.js";
import { isRealUser } from "../shared/overlays.js";
import { cityPicker, CITY_EVENT, lastCoords } from "../shared/city-picker.js";
import { eventCardOverlay, eventCardTop10, eventCardWide, artistCard, artistRow, venueCard, evTitle, evSub, evCity, evImage, evHref, evWhen } from "../shared/cards.js";
import { GENRE_FAMILIES, FILTER_FAMILIES, genreColor, genreLabel, genreGrad, primaryGenre, matchesFamilies } from "../shared/genres.js";
import {
  ALL_CITIES, PROVINCES, getActiveCity, setActiveCity, sameCity, fold, trUpper, sortTR, eventStartMs, eventGenres, artistGenres,
  fmtPrice, isFree, initials, haversineKm, latLngOf, fmtKm, debounce, swapAnim, writeQuery, hashBase, clamp,
} from "../shared/helpers.js";
import { appStoreHref, playStoreHref } from "../shared/assets.js";

// ── Artboard SVG gövdeleri (birebir; kayıtta farklı sürümü olanlar) ──
const P = {
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"></rect>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"></path><path d="M14 7v10" stroke-dasharray="2 2"></path>',
  venue: '<path d="M4 21V5l8-2v18M12 7l8 2v12M3 21h18"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor"></path><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>',
  compass: '<circle cx="12" cy="12" r="9"></circle><path d="m15.5 8.5-2 5-5 2 2-5z"></path>',
  ticketEmpty: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"></path>',
  star: '<path d="M12 3.5 13.8 9l5.7.2-4.5 3.5 1.6 5.5L12 15l-4.6 3.2L9 12.7 4.5 9.2l5.7-.2z"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  chevDown: '<path d="m6 9 6 6 6-6"></path>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"></rect><path d="M11 18.5h2"></path>',
  play: '<path d="M5 3.5v17l14-8.5z"></path>',
  nav: '<path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.6 1.6 6.6c.2.8 1.3.9 1.6.1z"></path>',
  alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5.5M12 16.5v.01"></path>',
};
// artboard'da stroke-linecap/linejoin verilmeyen ikonlar (svgRaw varsayılanı round/round)
const BUTT = { "stroke-linecap": "butt" };
const MITER = { "stroke-linejoin": "miter" };

// ── Kategori / tür anahtarları (URL) ──
const CATS = [
  { key: "tumu", label: "TÜMÜ", icon: () => svgRaw(P.grid, { size: 15, sw: "1.9", attrs: { ...BUTT, ...MITER } }) },
  { key: "etkinlikler", label: "ETKİNLİKLER", icon: () => svgRaw(P.ticket, { size: 15, sw: "1.9", attrs: BUTT }) },
  { key: "mekanlar", label: "MEKANLAR", icon: () => svgRaw(P.venue, { size: 15, sw: "1.9" }) },
  { key: "sanatcilar", label: "SANATÇILAR", icon: () => svgRaw(P.mic, { size: 15, sw: "1.9" }) },
];
const CAT_KEYS = CATS.map((c) => c.key);
const famSlug = (k) => (k === "hiphop" ? "hip-hop" : k || "");
function famFromSlug(s) {
  const t = fold(s || "").replace(/[^a-z&]/g, "");
  if (!t) return "";
  if (t === "r&b" || t === "rb") return "rnb";
  return FILTER_FAMILIES.includes(t) ? t : "";
}
const citySlug = (c) => (c === ALL_CITIES ? "tumu" : fold(c).replace(/\s+/g, "-"));
const cityUp = (c) => (c === ALL_CITIES ? "TÜM ŞEHİRLER" : trUpper(c));
const emptyTitleFor = (c) => (c === ALL_CITIES ? "Henüz etkinlik yok" : `${c} için etkinlik yok`);
const EMPTY_SUB = "Yakında canlı müzik etkinlikleri burada görünecek.";
const WEEK_MS = 7 * 86400e3;
const AUTO_MS = 5000;   // hero otomatik geçiş (sahibi: 4–5 sn)

// Takipçi sırası (Popüler Sanatçılar): followerCount azalan, eşitlikte ad (tr)
const byFollowers = (a, b) => (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0) || sortTR(a.displayName, b.displayName);
// Mekan sırası: puan azalan, eşitlikte ad (legacy doküman sırası belirsizdi)
const byRating = (a, b) => (Number(b.avgRating) || 0) - (Number(a.avgRating) || 0) || sortTR(a.displayName, b.displayName);
const msOf = (e) => eventStartMs(e);
const byDate = (a, b) => (msOf(a) ?? 0) - (msOf(b) ?? 0);

export function kesfetView(ctx) {
  const unsubs = [];
  let dead = false;
  const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ── durum ──
  let data = null;               // null = yükleniyor · { events, artists, venues } · { error: true }
  let followSet = new Set();
  let pendingCitySlug = null;                // veri gelince çözülecek (il listesinde olmayan etkinlik şehri)
  const q0 = parseQuery(ctx.query);
  // Sorguda sehir yoksa GÜNCEL tercih (gb_city) — bağlama anında yakalanmış eski şehir asla geri yazılmaz.
  let city = q0.city || getActiveCity();
  if (q0.city && !sameCity(q0.city, getActiveCity())) setActiveCity(q0.city);   // paylaşılan bağlantı → header da aynı şehri göstersin
  let cat = q0.cat, fam = q0.fam, term = q0.term;
  // Her geçmiş kaydı kendi şehrini history.state'te taşır (URL temiz kalır): sehir'siz bir kayda geri/ileri ile
  // dönülünce o kaydın şehri geri yüklenir; bağlantıyla açılan yeni (state'siz) kayıt güncel tercihi kullanır.
  const CITY_STATE = "dkKesfetCity";
  const stampCity = () => {
    if (hashBase() !== ctx.base) return;
    try { const st = history.state && typeof history.state === "object" ? history.state : {}; if (st[CITY_STATE] !== city) history.replaceState({ ...st, [CITY_STATE]: city }, "", location.href); } catch (_) {}
  };
  const wq = (patch, opts) => { writeQuery(patch, opts); stampCity(); };
  // Takip yetkisi WebSanatci ile aynı kural: misafir (giriş kapısı) / dinleyici / sanatçı. Mekan (gizli izleme listesi
  // → Sanatçı Bul) ve organizatör/yönetici sosyal takip YAZMAZ → düğme gizli.
  const role = () => (!isRealUser() ? "guest" : session.isAdmin ? "admin" : (session.profile?.userType || "customer"));
  const canFollowRole = () => ["guest", "customer", "artist"].includes(role());

  function parseQuery(q) {
    const k = fold(q?.get?.("kategori") || "");
    const s = q?.get?.("sehir");
    let c = null;
    if (s != null && s !== "") { c = cityFromSlug(s); if (!c) pendingCitySlug = s; }
    return { cat: CAT_KEYS.includes(k) ? k : "tumu", fam: famFromSlug(q?.get?.("tur")), term: q?.get?.("q") || "", city: c };
  }
  function cityFromSlug(s) {
    const f = fold(s).replace(/-/g, " ").trim();
    if (!f) return null;
    if (f === "tumu") return ALL_CITIES;
    return PROVINCES.find((p) => fold(p) === f) || (data?.events || []).map(evCity).find((c) => c && fold(c) === f) || null;
  }

  // ── kabuk ──
  const shell = publicShell({ active: "kesfet" });
  unsubs.push(() => shell.destroy());
  const root = h("div", { class: "dk-kesfet" });
  shell.main.append(root);

  // ════════════════════ HERO — sol: metin + arama + tür çipleri ════════════════════
  // artboard: "{{cityUp}} · CANLI MÜZİK" esnek kapta iki öğe olarak çizilir (şehir | "· CANLI MÜZİK", arada 10 px)
  const heroEbText = h("span", {});
  const heroEb = h("span", { class: "dk-kesfet-eb" }, h("span", { class: "dk-kesfet-eb-bar", "aria-hidden": "true" }), heroEbText, h("span", {}, "· CANLI MÜZİK"));
  const input = h("input", { type: "search", class: "dk-kesfet-si", placeholder: "Etkinlik, sanatçı veya mekan", autocomplete: "off", enterkeyhint: "search" });
  input.value = term;
  const cityVal = h("span", { class: "dk-kesfet-sc-city" });
  const cityBtn = h("button", { type: "button", class: "dk-kesfet-sc dk-press dk-press-o", "aria-haspopup": "dialog", "aria-expanded": "false" },
    h("span", { class: "dk-kesfet-sc-col" },
      h("span", { class: "dk-kesfet-sk", "aria-hidden": "true" }, "ŞEHİR"),
      h("span", { class: "dk-kesfet-sc-v" }, svgIcon("pin", { size: 14, color: "#4ED8FF" }), cityVal)),
    svgRaw(P.chevDown, { size: 14, cls: "dk-kesfet-sc-chev" }));
  const goBtn = h("button", { type: "button", class: "dk-kesfet-go dk-press dk-press-o" }, svgIcon("search", { size: 17, sw: "2.2" }), "Ara");
  const searchWrap = h("div", { class: "dk-kesfet-sw" },
    h("div", { role: "search", "aria-label": "Keşfet'te ara", class: "dk-kesfet-sb" },
      h("label", { class: "dk-kesfet-sq" }, h("span", { class: "dk-kesfet-sk" }, "NE ARIYORSUN"), input),
      cityBtn, goBtn));
  const chips = new Map();
  const genreRow = h("div", { role: "group", "aria-label": "Türe göre filtrele", class: "dk-kesfet-gr" },
    h("span", { class: "dk-kesfet-gr-l", "aria-hidden": "true" }, "TÜR"),
    ...["", ...FILTER_FAMILIES].map((k) => {
      const c = dkChip({ label: k ? GENRE_FAMILIES[k].label : "Tümü", dot: k ? GENRE_FAMILIES[k].color : "#F2F1EE", pressed: k === fam, size: 32, cls: "dk-press-o", onClick: () => setFam(k) });
      chips.set(k, c);
      return c;
    }));
  const heroLeft = h("div", { class: "dk-kesfet-hl dk-rise" },
    heroEb,
    h("h1", { class: "dk-kesfet-h1" }, "Şehrin canlı müziği, ", h("em", {}, "tek bir yerde.")),
    h("p", { class: "dk-kesfet-lead" }, "Konserleri, DJ setlerini ve akustik geceleri keşfet. Etkinliğe katıl, sevdiğin sanatçıları takip et, yeni sahnelerinden ilk sen haberdar ol."),
    searchWrap, genreRow);

  // ════════════════════ HERO — sağ: karusel kartı ════════════════════
  const heroCard = h("div", { class: "dk-kesfet-hc dk-rise", style: { "--dk-delay": "120ms" }, role: "region", "aria-roledescription": "karusel", "aria-label": "Öne çıkan etkinlikler" });
  const hero = h("section", { class: "dk-kesfet-hero", "aria-label": "Öne çıkan" }, heroLeft, heroCard);

  // ════════════════════ KATEGORİ ÇUBUĞU ════════════════════
  const bodyId = "dk-kesfet-body";
  const tabs = dkUnderlineTabs({
    items: CATS.map((c) => ({ key: c.key, label: c.label, icon: c.icon() })),
    value: cat, variant: "mono", underline: "solid", label: "Kategori",
    onChange: (k) => setCat(k),
  });
  const tabId = (k) => `dk-kesfet-tab-${k}`;
  tabs.querySelectorAll("[role=tab]").forEach((t, i) => { t.id = tabId(CAT_KEYS[i]); t.setAttribute("aria-controls", bodyId); });
  const summary = h("span", { class: "dk-kesfet-sum", "aria-live": "polite" });
  const catsBar = h("div", { class: "dk-kesfet-cats" }, tabs, summary);

  // ════════════════════ GÖVDE + UYGULAMA TANITIMI ════════════════════
  const body = h("div", { class: "dk-kesfet-body dk-sb", id: bodyId, role: "tabpanel", "aria-labelledby": tabId(cat) });
  root.append(hero, catsBar, body, appPromo());
  const syncTabs = () => { tabs.dk.set(cat); body.setAttribute("aria-labelledby", tabId(cat)); };

  // ══════════════════════════════════════════════════════════════════════
  // Filtre değişimleri
  // ══════════════════════════════════════════════════════════════════════
  function setCat(k, { push = true, reveal = false, focusTab = false } = {}) {
    if (!CAT_KEYS.includes(k)) k = "tumu";
    if (k === cat) return;
    cat = k;
    syncTabs();
    if (push) wq({ kategori: k === "tumu" ? null : k }, { push: true });
    paintBody();
    if (reveal) revealBar();
    // Tetikleyen düğme gövdeyle birlikte yok oldu → odak seçili sekmeye (klavye kullanıcısı kaybolmasın)
    if (focusTab) document.getElementById(tabId(k))?.focus({ preventScroll: true });
  }
  function setFam(k, { push = true } = {}) {
    fam = k || "";
    chips.forEach((c, key) => c.dk.set(key === fam));
    if (push) wq({ tur: famSlug(fam) || null }, { push: true });
    t10Off = 0;
    paintHero(); paintBody();
  }
  function setCity(c, { push = true } = {}) {
    city = c || ALL_CITIES;
    if (push) wq({ sehir: citySlug(city) }, { push: true });
    t10Off = 0;
    paintEyebrow(); paintHero(); paintBody();
  }
  // Header şehir düğmesi + hero ŞEHİR segmenti + "Konumumu kullan" → cityPicker "dk:citychange" yayar (localStorage'a yazmış olarak)
  const onCityEvent = (e) => { if (!dead) setCity(e.detail?.city || getActiveCity()); };
  window.addEventListener(CITY_EVENT, onCityEvent);
  unsubs.push(() => window.removeEventListener(CITY_EVENT, onCityEvent));

  // Arama: yazarken ≈200 ms gecikmeli canlı süzme (URL replaceState), "Ara"/Enter hemen, Esc temizler
  const applyTerm = (v, { reveal = false } = {}) => {
    const next = String(v ?? "");
    const changed = next.trim() !== term.trim();
    term = next;
    wq({ q: term.trim() ? term : null });
    if (changed) paintBody();
    if (reveal && term.trim()) revealBar("results");
  };
  const termLive = debounce(() => applyTerm(input.value), 200);
  unsubs.push(() => termLive.cancel());
  input.addEventListener("input", () => termLive());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); termLive.cancel(); applyTerm(input.value, { reveal: true }); }
    else if (e.key === "Escape" && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ""; termLive.cancel(); applyTerm(""); }
  });
  goBtn.addEventListener("click", () => { termLive.cancel(); applyTerm(input.value, { reveal: true }); });

  // Hero ŞEHİR segmenti → ortak şehir seçici (artboard: top 76 / right 110 → segmentin sağ kenarına hizalı, 17 px altında)
  let cityPop = null;
  const closeCityPop = () => { cityPop?.close(); cityPop = null; };
  cityBtn.addEventListener("click", () => {
    if (cityPop) return closeCityPop();
    const cp = cityPicker({ value: city, counts: cityCounts(), onPick: () => { closeCityPop(); cityBtn.focus({ preventScroll: true }); } });
    cityPop = dkPopover({ anchor: cityBtn, content: cp.node, label: "Şehir seç", width: 320, offset: 17, cls: "dk-cp-pop",
      onClose: () => { cityPop = null; cityBtn.classList.remove("is-open"); } });
    cityBtn.classList.add("is-open");
    requestAnimationFrame(() => cp.input.focus({ preventScroll: true }));
  });
  unsubs.push(closeCityPop);

  // "Konumumu kullan" (hero ya da header seçicisi): konum alındı ama şehir eşleşmediyse "dk:citychange" gelmez →
  // legacy gibi (konumdan sonra drawBody) mesafe çiplerini yine de çiz. Düğmenin disabled'ı kalkınca konum değiştiyse boya.
  // SHARED-CANDIDATE: city-picker locateCity() konum alınınca bir "dk:coords" olayı yayarsa bu gözlemci gereksizleşir.
  let paintedCoords = lastCoords;
  const locObs = [];
  const repaintIfCoords = () => { if (!dead && data && !data.error && lastCoords && lastCoords !== paintedCoords) { paintHero(); paintBody(); } };
  const onLocClick = (e) => {
    const b = e.target?.closest?.(".dk-cp-loc");
    if (!b) return;
    const mo = new MutationObserver(() => { if (!b.disabled) { mo.disconnect(); locObs.splice(locObs.indexOf(mo), 1); repaintIfCoords(); } });
    mo.observe(b, { attributes: true, attributeFilter: ["disabled"] });
    locObs.push(mo);
  };
  document.addEventListener("click", onLocClick, true);
  unsubs.push(() => { document.removeEventListener("click", onLocClick, true); locObs.splice(0).forEach((m) => m.disconnect()); });

  // Kategori çubuğunu görünür yap:
  //   "above"   → çubuk görünümün üstünde kaldıysa (Popüler Sanatçılar TÜMÜ, footer "Mekanlar/Sanatçılar" bağlantısı)
  //   "results" → "Ara"/Enter: sonuçlar çoğunlukla ekranın altında kalacaksa çubuğu header'ın altına getir
  // Geri/ileri (geçmişte gezinme) sonrası çağrılmaz — tarayıcı kaydırmayı kendisi geri yükler. Chrome, bağlantı tıklamasıyla
  // olan hash gezintisinde de popstate yayar → gezinme türü Navigation API'den ("traverse"); yoksa popstate'ten, yakın zamanda
  // #/kesfet bağlantısı tıklandıysa bağlantı sayılır.
  let travAt = -1e9, linkAt = -1e9;
  const nav = window.navigation;
  if (nav && typeof nav.addEventListener === "function") {
    const onNav = (e) => { if (e.navigationType === "traverse") travAt = performance.now(); };
    nav.addEventListener("navigate", onNav);
    unsubs.push(() => nav.removeEventListener("navigate", onNav));
  } else {
    const onPop = () => { if (performance.now() - linkAt > 400) travAt = performance.now(); };
    const onLink = (e) => { const a = e.target?.closest?.("a[href]"); if (a && /^#\/kesfet(?:\?|$)/.test(a.getAttribute("href") || "")) linkAt = performance.now(); };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onLink, true);
    unsubs.push(() => { window.removeEventListener("popstate", onPop); document.removeEventListener("click", onLink, true); });
  }
  const isTraversal = () => performance.now() - travAt < 400;
  function revealBar(mode = "above") {
    const r = catsBar.getBoundingClientRect();
    const top = 76;   // yapışkan header
    const need = mode === "results" ? (r.top < top || r.bottom > window.innerHeight * 0.6) : r.top < top;
    if (need) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top), behavior: reduceMq.matches ? "auto" : "smooth" });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Türetilmiş listeler
  // ══════════════════════════════════════════════════════════════════════
  function derive() {
    const fk = fam ? [fam] : null;
    const ok = (gs) => !fk || matchesFamilies(gs, fk);
    const inCity = (e) => city === ALL_CITIES || sameCity(evCity(e), city);
    const cityEvents = data.events.filter((e) => inCity(e) && ok(eventGenres(e)));
    const artists = data.artists.filter((a) => ok(artistGenres(a))).sort(byFollowers);
    const venues = data.venues.filter((v) => ok(artistGenres(v))).sort(byRating);
    return { cityEvents, artists, venues };
  }
  // Şehir seçici sayıları (tüm etkinlikler; TÜMÜ = toplam — artboard DCLogic ile aynı)
  function cityCounts() {
    if (!data?.events) return null;
    const m = { [ALL_CITIES]: data.events.length };
    data.events.forEach((e) => {
      const c = evCity(e); if (!c) return;
      const k = Object.keys(m).find((x) => x !== ALL_CITIES && sameCity(x, c)) || c;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Boyama
  // ══════════════════════════════════════════════════════════════════════
  function paintEyebrow() {
    heroEbText.textContent = cityUp(city);
    // artboard DCLogic: segment {{city}} = 'TÜMÜ' (tüm şehirler); header düğmesi "Tüm şehirler" kalır
    cityVal.textContent = city === ALL_CITIES ? "TÜMÜ" : city;
    cityBtn.setAttribute("aria-label", `Şehir seç, şu an ${city === ALL_CITIES ? "Tüm şehirler" : city}`);
  }

  // ── Hero karuseli ──
  let heroIdx = 0, heroN = 0, heroGo = null, heroTimer = null, heroHold = false, heroPaused = false, pauseBtn = null;
  function stopAuto() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }
  function startAuto() {
    stopAuto();
    syncPause();
    if (heroN < 2 || reduceMq.matches || heroPaused) return;   // hareket azaltmada / kullanıcı durdurduysa otomatik geçiş kapalı
    heroTimer = setInterval(() => { if (!heroHold && !document.hidden && heroCard.isConnected) heroGo?.(heroIdx + 1); }, AUTO_MS);
  }
  // WCAG 2.2.2: kalıcı durdur/oynat. Artboard'da çizili değil → görsel olarak gizli, klavye odağında görünür (sayacın yanında).
  function syncPause() {
    if (!pauseBtn) return;
    const show = heroN > 1 && !reduceMq.matches;
    pauseBtn.hidden = !show;
    pauseBtn.setAttribute("aria-label", heroPaused ? "Otomatik geçişi başlat" : "Otomatik geçişi durdur");
    pauseBtn.replaceChildren(svgIcon(heroPaused ? "playFilled" : "pause", { size: 12 }));
  }
  const onReduce = () => startAuto();
  reduceMq.addEventListener?.("change", onReduce);
  unsubs.push(() => { reduceMq.removeEventListener?.("change", onReduce); stopAuto(); });
  // Üzerine gelince / odak içerideyken dur (DCLogic hoverHold)
  heroCard.addEventListener("mouseenter", () => { heroHold = true; });
  heroCard.addEventListener("mouseleave", () => { heroHold = heroCard.contains(document.activeElement); });
  heroCard.addEventListener("focusin", () => { heroHold = true; });
  heroCard.addEventListener("focusout", (e) => { if (!heroCard.contains(e.relatedTarget)) heroHold = heroCard.matches(":hover"); });

  function heroEmpty(title, sub, iconBody = P.compass) {
    return h("div", { class: "dk-kesfet-hc-empty" },
      svgRaw(iconBody, { size: 40, sw: "1.4" }),
      h("span", { class: "dk-kesfet-hc-et" }, title),
      h("span", { class: "dk-kesfet-hc-es" }, sub));
  }
  function slideMedia(e) {
    const g = primaryGenre(e);
    const ph = () => h("span", { class: "dk-kesfet-hs-img dk-kesfet-hs-ph", style: { background: genreGrad(g, 150) }, "aria-hidden": "true" }, initials(evTitle(e)));
    const src = evImage(e);
    if (!src) return ph();
    const img = h("img", { src, alt: "", decoding: "async", class: "dk-kesfet-hs-img dk-kb" });
    img.addEventListener("error", () => img.replaceWith(ph()), { once: true });
    return img;
  }
  function paintHero() {
    stopAuto();
    heroGo = null; heroN = 0; pauseBtn = null;
    if (!data) {
      heroCard.replaceChildren(h("div", { class: "dk-kesfet-hc-skel", "aria-hidden": "true" }, dkSkeleton({ w: "100%", h: "100%", r: 0 })));
      heroCard.setAttribute("aria-busy", "true");
      return;
    }
    heroCard.removeAttribute("aria-busy");
    // Hata iletisi yalnız gövdede (role=alert) — hero nötr kalır (ikon, metinsiz)
    if (data.error) { heroCard.replaceChildren(h("div", { class: "dk-kesfet-hc-empty", "aria-hidden": "true" }, svgRaw(P.compass, { size: 40, sw: "1.4" }))); return; }
    const { cityEvents } = derive();
    // VIP önce, sonra tarih; ilk 5
    const list = [...cityEvents].sort((a, b) => ((b.vipStatus === "approved") - (a.vipStatus === "approved")) || byDate(a, b)).slice(0, 5);
    if (!list.length) { heroCard.replaceChildren(heroEmpty(emptyTitleFor(city), EMPTY_SUB)); return; }
    heroN = list.length; heroIdx = 0;
    const slides = list.map((e) => {
      const g = primaryGenre(e);
      const badge = dkEventBadge(e, { variant: "hero", kesfet: true });
      return h("a", { href: evHref(e), class: "dk-kesfet-hs" },
        slideMedia(e),
        h("span", { class: "dk-kesfet-hs-grad", "aria-hidden": "true" }),
        badge ? h("span", { class: "dk-kesfet-hs-badge" }, badge) : null,
        h("div", { class: "dk-kesfet-hs-body" },
          g ? h("span", { class: "dk-kesfet-hs-g", style: { color: genreColor(g) } }, genreLabel(g)) : null,
          h("span", { class: "dk-kesfet-hs-t" }, evTitle(e)),
          evSub(e) ? h("span", { class: "dk-kesfet-hs-s" }, evSub(e)) : null,
          h("span", { class: "dk-kesfet-hs-row" },
            h("span", { class: "dk-kesfet-hs-date" }, svgRaw(P.cal, { size: 13, attrs: MITER }), evWhen(e)),
            h("span", { class: "dk-kesfet-hs-price", style: { color: isFree(e.ticketPrice) ? "#7CE0B0" : "#F2F1EE" } }, fmtPrice(e.ticketPrice, { upper: true })),
            distChip(e, "hero"))));
    });
    const dots = dkCarouselDots({ count: list.length, index: 0, titles: list.map(evTitle), label: "Öne çıkan etkinlikler", onPick: (i) => go(i, true) });
    const arrows = dkCarouselArrows({ variant: "overlay", labels: ["Önceki etkinlik", "Sonraki etkinlik"], onPrev: () => go(heroIdx - 1, true), onNext: () => go(heroIdx + 1, true) });
    function go(i, user = false) {
      heroIdx = ((i % heroN) + heroN) % heroN;
      slides.forEach((s, j) => {
        const on = j === heroIdx;
        s.classList.toggle("is-on", on);
        s.setAttribute("aria-hidden", on ? "false" : "true");
        s.tabIndex = on ? 0 : -1;
      });
      dots.dk.set(heroIdx);
      if (user) startAuto();   // elle geçişte sayaç baştan
    }
    if (heroN < 2) arrows.dk.setDisabled(true, true);   // tek slayt: oklar işlevsiz
    heroGo = (i) => go(i);
    pauseBtn = h("button", { type: "button", class: "dk-kesfet-hc-pause dk-press" });
    pauseBtn.addEventListener("click", () => { heroPaused = !heroPaused; startAuto(); });
    dots.append(pauseBtn);
    heroCard.replaceChildren(...slides, h("div", { class: "dk-kesfet-hc-ctl" }, dots, arrows));
    go(0);
    startAuto();
  }

  // ── Özet (kategori çubuğunun sağı) ──
  function paintSummary(d) {
    if (!d) { summary.textContent = ""; return; }
    summary.textContent = cat === "mekanlar" ? `${d.venues.length} MEKAN`
      : cat === "sanatcilar" ? `${d.artists.length} SANATÇI`
      : `${d.cityEvents.length} ETKİNLİK · ${cityUp(city)}`;
  }

  // ── Top 10 izi ──
  let t10Off = 0, t10 = null;
  function t10Apply() {
    if (!t10 || !t10.track.isConnected) return;
    const card = t10.cards[0];
    const gap = 20;
    const step = (card ? card.getBoundingClientRect().width : 300) + gap;
    const visible = Math.max(1, Math.floor((t10.track.clientWidth + gap) / step));
    const max = Math.max(0, t10.cards.length - visible);
    t10Off = clamp(t10Off, 0, max);
    t10.track.scrollLeft = 0;
    t10.inner.style.transform = `translateX(${-t10Off * step}px)`;
    const active = document.activeElement;
    t10.arrows.dk.setDisabled(t10Off <= 0, t10Off >= max);
    // odaktaki ok devre dışı kaldıysa odağı diğer oka ver (klavye kaybolmasın)
    if (active && active.disabled) { const other = active === t10.arrows.dk.prev ? t10.arrows.dk.next : t10.arrows.dk.prev; if (!other.disabled) other.focus(); }
    t10.visible = visible;
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => t10Apply()) : null;
  unsubs.push(() => ro?.disconnect());

  function top10Section(cityEvents) {
    const top = [...cityEvents].sort((a, b) => (Number(b.attendeeCount) || 0) - (Number(a.attendeeCount) || 0)).slice(0, 10);
    const cards = top.map((e, i) => withDist(eventCardTop10(e, i + 1), e, ".dk-ect-w"));
    const arrows = dkCarouselArrows({ variant: "outline", labels: ["Top 10 geri kaydır", "Top 10 ileri kaydır"],
      onPrev: () => { t10Off -= 2; t10Apply(); }, onNext: () => { t10Off += 2; t10Apply(); } });
    arrows.querySelectorAll("button").forEach((b) => b.classList.add("dk-press-o"));
    const inner = h("div", { class: "dk-track-in dk-kesfet-t10-in" }, ...cards);
    const track = h("div", { class: "dk-track dk-kesfet-t10-track" }, inner);
    // Klavyeyle görünmeyen karta gelinince izi kaydır (overflow:hidden kabın kendi kaydırmasını engelle)
    track.addEventListener("focusin", (e) => {
      const i = cards.indexOf(e.target.closest(".dk-ect"));
      if (i < 0 || !t10) return;
      const vis = t10.visible || 4;
      if (i < t10Off) t10Off = i; else if (i >= t10Off + vis) t10Off = i - vis + 1;
      t10Apply();
    });
    t10 = { track, inner, cards, arrows, visible: 4 };
    ro?.disconnect(); ro?.observe(track);
    const head = dkSectionHead({
      id: "dk-kesfet-h-top", eyebrow: "01 · KATILIMCI SAYISINA GÖRE", eyebrowColor: "#FFD700",
      eyebrowIcon: svgRaw(P.trophy, { size: 14, fill: true }),
      title: "GigBridge ", em: "Top 10", emColor: "#FFD700", size: 48,
      right: h("div", { class: "dk-kesfet-t10-ctl" }, tumuLink("#/etkinlikler?sirala=populerlik"), arrows),
    });
    requestAnimationFrame(() => t10Apply());
    return h("section", { class: "dk-kesfet-t10", "aria-labelledby": "dk-kesfet-h-top" }, head, track);
  }

  function tumuLink(href) {
    return h("a", { href, class: "dk-sh-link dk-link" }, "TÜMÜ", svgIcon("chevronRight", { size: 13, sw: "2.2" }));
  }
  function section(id, head, content, cls) {
    return h("section", { class: cx("dk-kesfet-sec", cls), "aria-labelledby": id }, head, content);
  }
  const sh = (id, eyebrow, title, em, link) => dkSectionHead({ id, eyebrow, title, em, size: 48, right: link });

  // Mesafe rozeti (legacy distPill; "Konumumu kullan" sonrası). SHARED-CANDIDATE: cards.js kartlarına `distance` seçeneği
  // olarak eklenebilir (Harita/Etkinlikler de kullanır) — şimdilik kart DOM'una yerel olarak ekleniyor.
  function distChip(e, variant = "card") {
    if (!lastCoords) return null;
    const p = latLngOf(e); if (!p) return null;
    const km = haversineKm(lastCoords, p);
    if (km == null || !isFinite(km)) return null;
    return h("span", { class: cx("dk-kesfet-dist", variant === "hero" && "is-hero"), title: "Konumuna uzaklık" },
      svgRaw(P.nav, { size: variant === "hero" ? 11 : 10, fill: true, color: "#4ED8FF" }), fmtKm(km));
  }
  function withDist(card, e, sel) {
    const chip = distChip(e);
    const slot = chip && card.querySelector(sel);
    if (slot) { slot.classList.add("dk-kesfet-has-dist"); slot.append(chip); }
    return card;
  }
  const overlay = (e) => withDist(eventCardOverlay(e), e, ".dk-eco-foot > span:first-child");

  // Takip (iyimser; misafirde giriş kapısı; hata → geri al + "İşlem başarısız")
  const me = () => session.user?.uid || null;
  async function toggleFollow(a, next) {
    if (dkLoginGate("Takip etmek")) return false;
    try {
      if (next) { await followArtist(me(), a); followSet.add(a.id); }
      else { await unfollowArtist(me(), a.id); followSet.delete(a.id); }
      return true;
    } catch (_) { dkToast("İşlem başarısız", { type: "err" }); return false; }
  }
  const canFollow = (a) => a.id !== me() && canFollowRole();   // kendi kartında / mekan-organizatör-yöneticide düğme yok
  function artistCardEl(a) {
    const el = artistCard(a, { followed: followSet.has(a.id), onFollow: (next) => toggleFollow(a, next) });
    if (!canFollow(a)) el.querySelector(".dk-fol")?.remove();
    return el;
  }
  const artistRowEl = (a) => artistRow(a, { followed: followSet.has(a.id), onFollow: canFollow(a) ? (next) => toggleFollow(a, next) : false });

  function dashedEmpty({ icon, title, sub, cls }) {
    return dkEmpty({ icon, title, sub, cls: cx("dk-kesfet-empty", cls) });
  }

  function paintBody() {
    if (dead) return;
    if (!data) {
      paintSummary(null);
      body.setAttribute("aria-busy", "true");
      body.replaceChildren(h("section", { class: "dk-kesfet-sec dk-kesfet-cat", "aria-label": "Yükleniyor" },
        h("div", { class: "dk-grid dk-grid-ev dk-kesfet-lim4" }, ...[0, 1, 2, 3].map(() => dkSkeletonCard("overlay")))));
      return;
    }
    body.removeAttribute("aria-busy");
    if (data.error) {
      paintSummary(null);
      const box = dkEmpty({ icon: svgRaw(P.alert, { size: 40, sw: "1.4" }), title: "Bir sorun oldu", sub: "Keşfet yüklenemedi.", cls: "dk-kesfet-empty",
        action: dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: retry }) });
      box.setAttribute("role", "alert");
      body.replaceChildren(h("section", { class: "dk-kesfet-sec dk-kesfet-cat", "aria-label": "Hata" }, box));
      swapAnim(body, "dk-sa", "dk-sb");
      return;
    }
    const d = derive();
    paintSummary(d);
    paintedCoords = lastCoords;
    t10 = null; ro?.disconnect();
    const q = fold(term.trim());
    let content;
    if (q) content = searchView(d, q);
    else if (cat === "etkinlikler") content = eventsView(d);
    else if (cat === "mekanlar") content = venuesView(d);
    else if (cat === "sanatcilar") content = artistsView(d);
    else content = allView(d);
    body.replaceChildren(content);
    swapAnim(body, "dk-sa", "dk-sb");
  }

  // ── Arama sonuçları (başlık/mekan/sanatçı; şehir + tür süzgeçli — legacy ile aynı) ──
  function searchView(d, q) {
    const list = d.cityEvents.filter((e) => [e.title, e.venueName, e.artistName].some((x) => fold(x).includes(q)));
    return h("section", { class: "dk-kesfet-sec dk-kesfet-srch", "aria-labelledby": "dk-kesfet-h-srch" },
      h("div", { class: "dk-kesfet-srch-head" },
        h("span", { class: "dk-eyebrow" }, "ARAMA SONUÇLARI"),
        h("h2", { id: "dk-kesfet-h-srch", class: "dk-display dk-kesfet-srch-h" }, `“${term.trim()}”`)),
      list.length
        ? h("div", { class: "dk-grid dk-grid-ev" }, ...list.map(overlay))
        : h("div", { class: "dk-kesfet-se", role: "status" }, svgRaw(P.search, { size: 32, sw: "1.6", attrs: MITER }), h("span", {}, "Sonuç bulunamadı")));
  }

  // ── TÜMÜ ──
  function allView(d) {
    const ev = d.cityEvents;
    const wrap = h("div", { class: "dk-kesfet-all" });
    if (!ev.length) wrap.append(dashedEmpty({ icon: svgRaw(P.compass, { size: 40, sw: "1.4" }), title: emptyTitleFor(city), sub: EMPTY_SUB, cls: "is-inset" }));
    else wrap.append(top10Section(ev));
    // 02 · Sadece GigBridge'de — her zaman
    const excl = ev.filter((e) => e.vipStatus === "approved" || e.isExclusive);
    wrap.append(section("dk-kesfet-h-excl", sh("dk-kesfet-h-excl", "02 · ÖZEL ETKİNLİKLER, VIP DENEYİMLER", "Sadece ", "GigBridge'de", tumuLink("#/etkinlikler")),
      excl.length
        ? h("div", { class: "dk-kesfet-g2" }, ...excl.map((e) => eventCardWide(e)))
        : h("div", { class: "dk-kesfet-xe" }, svgRaw(P.star, { size: 18, sw: "1.7", attrs: BUTT }), "Şu an özel etkinlik yok — VIP deneyimler yakında burada.")));
    // 03 · En Yeniler (yalnız varsa; masaüstünde ilk 4)
    const news = ev.filter((e) => e.isNew === true).slice(0, 4);
    if (news.length) wrap.append(section("dk-kesfet-h-new", sh("dk-kesfet-h-new", "03 · YENİ EKLENENLER", "GigBridge'de ", "En Yeniler!", tumuLink("#/etkinlikler")),
      h("div", { class: "dk-grid dk-grid-ev dk-kesfet-lim4" }, ...news.map(overlay))));
    // 04 · Bu Hafta (başlangıç ≤ şimdi + 7 gün; tarihe göre; ilk 4)
    const lim = Date.now() + WEEK_MS;
    const week = ev.filter((e) => { const s = msOf(e); return s != null && s <= lim; }).sort(byDate).slice(0, 4);
    if (week.length) wrap.append(section("dk-kesfet-h-week", sh("dk-kesfet-h-week", `04 · ${city === ALL_CITIES ? "ÖNÜMÜZDEKİ 7 GÜN" : trUpper(city)}`, "Bu ", "Hafta", tumuLink("#/etkinlikler?tarih=bu-hafta")),
      h("div", { class: "dk-grid dk-grid-ev dk-kesfet-lim4" }, ...week.map(overlay))));
    // 05 · Popüler Sanatçılar (followerCount'a göre; ilk 5; TÜMÜ → SANATÇILAR sekmesi)
    if (d.artists.length) {
      const all = h("button", { type: "button", class: "dk-sh-link dk-link" }, "TÜMÜ", svgIcon("chevronRight", { size: 13, sw: "2.2" }));
      all.addEventListener("click", () => setCat("sanatcilar", { reveal: true, focusTab: true }));
      wrap.append(section("dk-kesfet-h-art", sh("dk-kesfet-h-art", "05 · SANATÇILAR", "Popüler ", "Sanatçılar", all),
        h("div", { class: "dk-grid dk-grid-art dk-kesfet-lim5" }, ...d.artists.slice(0, 5).map(artistCardEl))));
    }
    return wrap;
  }

  // ── ETKİNLİKLER ──
  function eventsView(d) {
    const list = [...d.cityEvents].sort(byDate);
    return h("section", { class: "dk-kesfet-sec dk-kesfet-cat", "aria-label": "Etkinlikler" },
      list.length
        ? h("div", { class: "dk-grid dk-grid-ev" }, ...list.map(overlay))
        : dashedEmpty({ icon: svgRaw(P.ticketEmpty, { size: 40, sw: "1.4", attrs: BUTT }), title: emptyTitleFor(city), sub: EMPTY_SUB }));
  }
  // ── MEKANLAR ──
  function venuesView(d) {
    return h("section", { class: "dk-kesfet-sec dk-kesfet-cat", "aria-label": "Mekanlar" },
      d.venues.length
        ? h("div", { class: "dk-kesfet-g3" }, ...d.venues.map((v) => venueCard(v)))
        : dashedEmpty({ icon: null, title: "Henüz mekan yok", sub: "Mekanlar katıldıkça burada listelenecek." }));
  }
  // ── SANATÇILAR ──
  function artistsView(d) {
    return h("section", { class: "dk-kesfet-rows", "aria-label": "Sanatçılar" },
      ...(d.artists.length
        ? d.artists.map(artistRowEl)
        : [dashedEmpty({ icon: null, title: "Henüz sanatçı yok", sub: "Sanatçılar katıldıkça burada görünecek.", cls: "is-span" })]));
  }

  // ── Uygulama tanıtımı (Keşfet varyantı) — SHARED-CANDIDATE: Landing'in AppPromo'su ile ortak bileşen olabilir (ölçüler farklı: 52/20) ──
  function appPromo() {
    const rel = (u) => String(u || "").replace(/^\//, "");
    const store = (href, icon, label) => {
      const ext = /^https?:/.test(href);
      // erişilebilir ad = görünen metin ("İndir App Store") — WCAG 2.5.3 label-in-name
      return h("a", { href: ext ? href : rel(href), class: "dk-kesfet-store dk-press dk-press-o", target: ext ? "_blank" : null, rel: ext ? "noopener" : null },
        svgRaw(icon, { size: 20, sw: "1.8" }),
        h("span", { class: "dk-kesfet-store-col" }, h("span", { class: "dk-kesfet-store-k" }, "İndir "), h("span", { class: "dk-kesfet-store-l" }, label)));
    };
    return h("section", { id: "uygulama", class: "dk-kesfet-app", "aria-labelledby": "dk-kesfet-h-app" },
      h("span", { class: "dk-kesfet-app-prism dk-prism", "aria-hidden": "true" }),
      h("div", { class: "dk-kesfet-app-t" },
        h("h2", { id: "dk-kesfet-h-app", class: "dk-kesfet-app-h" }, "GigBridge ", h("em", {}, "cebinde.")),
        h("p", { class: "dk-kesfet-app-p" }, "QR biletin, favori sanatçılarının yeni etkinlik bildirimleri ve yakınındaki sahneler tek uygulamada.")),
      h("div", { class: "dk-kesfet-stores" },
        // App Store kimliği yok → /indir/ (cihaz algılayan indirme sayfası); Google Play → mağaza (yeni sekme)
        store(appStoreHref(), P.phone, "App Store"),
        store(playStoreHref(), P.play, "Google Play")));
  }

  // ══════════════════════════════════════════════════════════════════════
  // Veri
  // ══════════════════════════════════════════════════════════════════════
  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    data = null;
    paintHero(); paintBody();
    try {
      const [events, artists, venues] = await Promise.all([discoverEvents(), listRealArtists(), listVenues()]);
      let fs = new Set();
      if (isRealUser() && canFollowRole()) { try { fs = new Set((await followingList(me())).map((f) => f.artistId || f.id)); } catch (_) {} }
      if (dead || seq !== loadSeq) return;
      data = { events, artists, venues };
      followSet = fs;
      if (pendingCitySlug) {   // il listesinde olmayan etkinlik şehri (veriyle çözülür)
        const c = cityFromSlug(pendingCitySlug); pendingCitySlug = null;
        if (c && !sameCity(c, city)) { city = c; setActiveCity(c); shell.header.setCity(c); paintEyebrow(); }
      }
      shell.header.setCityCounts(cityCounts());
    } catch (e) {
      console.warn("[kesfet] yüklenemedi:", e);
      if (dead || seq !== loadSeq) return;
      data = { error: true };
    }
    paintHero(); paintBody();
  }
  // "Tekrar dene": düğme gövdeyle birlikte yok olur → odak gövdeye (tabpanel) taşınır, yüklenince orada kalır
  function retry() {
    body.tabIndex = -1;
    body.focus({ preventScroll: true });
    load();
  }

  paintEyebrow();
  // Bağlama kaydı da şehrini taşısın (sehir'siz #/kesfet'e geri dönüşte bu şehir geri gelir)
  stampCity();
  load();

  return {
    node: shell.node,
    // Yalnız ?sorgu değişti (geri/ileri, footer "Mekanlar/Sanatçılar", paylaşılan bağlantı) → yerinde uygula
    update(query) {
      const s = parseQuery(query);
      // sehir yoksa: geri/ileri ile dönülen kaydın kendi şehri (history.state), bağlantıyla açılan yeni kayıtta GÜNCEL tercih
      // (header "Keşfet", footer "Mekanlar/Sanatçılar" kullanıcının seçtiği şehri sıfırlamaz).
      let stCity = null;
      try { const v = history.state?.[CITY_STATE]; if (typeof v === "string" && v) stCity = v; } catch (_) {}
      const nextCity = s.city || (query?.get?.("sehir") ? city : (stCity || getActiveCity()));
      const cityCh = !sameCity(nextCity, city);
      const famCh = s.fam !== fam;
      const catCh = s.cat !== cat;
      const termCh = s.term !== term;
      if (!cityCh && !famCh && !catCh && !termCh) { stampCity(); return; }
      if (cityCh) { city = nextCity; setActiveCity(city); shell.header.setCity(city); paintEyebrow(); }
      stampCity();
      if (famCh) { fam = s.fam; chips.forEach((c, key) => c.dk.set(key === fam)); }
      if (catCh) { cat = s.cat; syncTabs(); }
      if (termCh) { term = s.term; termLive.cancel(); if (input.value !== term) input.value = term; }
      if (cityCh || famCh) { t10Off = 0; paintHero(); }
      paintBody();
      if (catCh && !isTraversal()) revealBar("above");
    },
    onSession() { return true; },   // takip durumu kimliğe bağlı; kimlik değişiminde router zaten yeniden kurar
    destroy() { dead = true; unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
  };
}
