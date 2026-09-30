// WebLanding — masaüstü açılış sayfası (≥769 px). Registry anahtarı: landing (#/, misafir + girişsiz).
// Spec: specs/public-a.md §2 (artboard design/WebLanding.dc.html; sahibinin CLAUDE CODE notu YOK).
// CSS: css/dk-landing.css — tüm seçiciler .dk-landing kökü altında.
// Legacy karşılığı: js/pages/auth.js landing() (≤768 ve anonim oturum kapalıyken mobilde aynen kalır).
//
// Legacy özellikleri (korundu): marka + slogan (→ hero), 4 özellik satırı (→ FeatureGrid, aynı başlıklar), "Giriş yap",
// "Hesap oluştur", "Yönetici girişi" (→ #/yonetici), yasal bağlantılar (→ footer YASAL kolonu).
// Yeni (tasarım): hero kolajı (gerçek veri), rol gezgini, "Bu hafta sahnede." (gerçek etkinlikler), uygulama tanıtımı, CTA.
//
// Veri (yazma YOK):
//   discoverEvents()  → "Bu hafta sahnede." (bugün 00:00 ≤ başlangıç ≤ şimdi + 7 gün, gb_city süzgeci, başlangıca göre, ilk 4)
//                        + kolaj etkinliği (seçili şehirde afişli CANLI etkinlik, yoksa afişli sıradaki) + header şehir
//                        sayıları (sameCity ile birleştirilir)
//   listRealArtists() → kolaj sanatçı çipi (fotoğraflı, en çok takipçili; önce seçili şehir, yoksa tümü)
//   listVenues()      → kolaj mekan çipi (Bayes puanı en yüksek onaylı mekan; önce seçili şehir, yoksa tümü)
//   Kolaj TEK davranış (hep ya da hiç): seçili şehirde öne çıkarılacak etkinlik varsa üç parça da gerçek veri; yoksa
//   (şehirde etkinlik yok / veri yok / hata / oturum yok) üç parça birlikte genel yedek — dekoratif görsel + sayısız metin.
//   Başka şehrin etkinliği kolaja taşınmaz (header şehri ile çelişmesin).
//   Üç okuma 60 sn modül önbelleğinde (her #/ girişinde tüm koleksiyonları yeniden okumamak için).
//   Oturum yoksa (anonim giriş kapalı → kurallar okumaya izin vermez) sorgu atılmaz: kolaj genel yedek,
//   etkinlik bölümü gizli (bölüm numaraları kayar).
// URL: #/?rol=customer|artist|venue|organizer → rol sekmesi (paylaşılabilir; replaceState). update(query) geri/ileri'de uygular.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { discoverEvents, listRealArtists, listVenues, bayesianScore } from "../../data.js";
import { publicShell } from "../shared/public-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkAvatar, dkSkeleton } from "../shared/ui.js";
import { openLogin } from "../shared/overlays.js";
import { eventCard, evTitle, evHref, evCity, evImage } from "../shared/cards.js";
import { IMG, appStoreHref, playStoreHref } from "../shared/assets.js";
import {
  ALL_CITIES, getActiveCity, sameCity, eventStartMs, isLive, startOfDay, fmtTime, fmtDayLabel, fmtRating, trUpper,
  artistGenres, writeQuery,
} from "../shared/helpers.js";
import { genreLabel } from "../shared/genres.js";

// ── 60 sn modül önbelleği (etkinlik.js "Benzer" önbelleğiyle aynı desen) ──
// SHARED-CANDIDATE: Keşfet aynı üç okumayı (discoverEvents/listRealArtists/listVenues) önbelleksiz yapıyor; Landing →
// "Misafir olarak keşfet" geçişinde aynı koleksiyonlar iki kez okunuyor. Ortak bir önbellek shared/ ya da data.js'e taşınabilir.
const CACHE_TTL = 60e3;
const _cache = new Map();
function cached(key, load) {
  const c = _cache.get(key);
  if (c && Date.now() - c.at < CACHE_TTL) return c.p;
  const p = load().catch((err) => { if (_cache.get(key)?.p === p) _cache.delete(key); throw err; });
  _cache.set(key, { at: Date.now(), p });
  return p;
}

// ── Artboard SVG gövdeleri (birebir) ──
const P = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6z"></path><path d="m9 12 2.2 2.2L15.5 10"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"></path>',
  venue: '<path d="M4 21V5l8-2v18M12 7l8 2v12M3 21h18M7 8v.01M7 12v.01M7 16v.01M16 12v.01M16 16v.01"></path>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"></path><path d="M9 4v14M15 6v14"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"></rect><path d="M11 18.5h2"></path>',
  play: '<path d="M5 3.5v17l14-8.5z"></path>',
};
const arrowIc = (size, sw = "2.2", color) => svgRaw(P.arrow, { size, sw, color });

// ── Sabit içerik (artboard DCLogic FEATS / ROLES — metinler birebir) ──
const FEATS = [
  { k: "mic", title: "Sanatçı profilleri ve portföyler", desc: "Biyografi, türler, paketler, performans videoları ve dinleyici yorumları tek profilde.", c: "#FF4FA3" },
  { k: "venue", title: "Mekanları keşfet ve etkinlikleri takip et", desc: "Şehrindeki mekanları puan ve kapasiteleriyle gör, sıradaki etkinliklerini kaçırma.", c: "#FF8A2A" },
  { k: "map", title: "Yakınındaki etkinlikleri haritada gör", desc: "Şu an çalan ve yaklaşan etkinlikler haritada; mesafe ve yol tarifiyle.", c: "#4ED8FF" },
  { k: "star", title: "Sanatçı ve mekanlara puan ver", desc: "Katıldığın etkinlikten sonra yıldız ver, yorum yaz; Top 10 sıralaması buradan oluşur.", c: "#FFD700" },
];
// Rol anahtarları = WebKayit ?rol= anahtarları (auth REG_TYPES). Görseller DEKORATİF (assets/web; sahibi kararı b):
// artboard'un "rock" görseli (Mekan) kaldırıldı → sahnede vokalist (mekan sahnesi) kullanılıyor.
const ROLES = [
  { id: "customer", name: "Dinleyici", short: "Keşfet, katıl, takip et", c: "#4ED8FF", eyebrow: "DİNLEYİCİLER İÇİN", title: "Şehrin sahnesi, senin takviminde.", cta: "Dinleyici olarak katıl", img: IMG.jazzClub, pos: "50% 50%",
    bullets: ["Etkinlikleri tarihe, türe ve şehre göre keşfet", "Etkinliğe katıl; biletin QR kod olarak Biletlerim'de", "Sanatçıları takip et, mekan ve etkinlikleri favorile", "Akış'ta katıldığın etkinlikler hakkında paylaş", "Sanatçı ve mekanlara puan ver, yorum yaz"] },
  { id: "artist", name: "Sanatçı", short: "Profil, teklif, sahne", c: "#FF4FA3", eyebrow: "SANATÇILAR İÇİN", title: "Sahne bul, teklif al, dinleyicini büyüt.", cta: "Sanatçı olarak katıl", img: IMG.guitarist, pos: "57% 20%",
    bullets: ["Portföyünü, paketlerini ve fiyatlarını tek profilde topla", "Mekanlardan teklif al, mesajlarla anlaş", "Top 10 sıralamasında yerini gör", "Çaldığın mekanları değerlendir"] },
  { id: "venue", name: "Mekan", short: "Etkinlik yayınla, sanatçı bul", c: "#FF8A2A", eyebrow: "MEKANLAR İÇİN", title: "Sahnene uygun sanatçıyı dakikalar içinde bul.", cta: "Mekan olarak katıl", img: IMG.vocalist, pos: "55% 50%",
    bullets: ["Etkinlik oluştur ve yayınla", "Türe ve bütçeye göre sanatçı bul", "Analitik ile etkinliklerinin ilgisini izle", "Sanatçıları sahne performansı, dakiklik ve iletişim üzerinden değerlendir"] },
  { id: "organizer", name: "Organizatör", short: "Etkinlik, mekan, ekip", c: "#FF4FA3", eyebrow: "ORGANİZATÖRLER İÇİN", title: "Etkinliklerini tek panelden yönet.", cta: "Organizatör olarak katıl", img: IMG.electronicNight, pos: "50% 50%",
    bullets: ["Etkinliklerini oluştur ve takip et", "Mekan seç, sanatçılarla mesajlaş", "Ekibinle birlikte çalış"] },
];
const ROLE_IDS = ROLES.map((r) => r.id);
const roleFromQuery = (q) => { const v = q?.get?.("rol"); return ROLE_IDS.includes(v) ? v : "customer"; };

// "Bu hafta" — WebEtkinlikler `tarih=bu-hafta` ile aynı pencere (legacy dateMatches week): bugün 00:00 ≤ başlangıç ≤ şimdi + 7 gün.
// Başlamış (canlı) etkinlikler de dahil (discoverEvents bitenleri zaten eler).
const WEEK_MS = 7 * 86400e3;
const inThisWeek = (e, now = Date.now()) => { const s = eventStartMs(e); return s != null && s >= startOfDay(now) && s <= now + WEEK_MS; };
const inCity = (x, city, get = (y) => y?.city) => city === ALL_CITIES || sameCity(get(x), city);
// Önce seçili şehirden, yoksa tümünden — kolaj çipleri (sanatçı/mekan) için; yalnız şehirde öne çıkan etkinlik varken kullanılır
const preferCity = (list, city, get) => { if (city === ALL_CITIES) return list; const c = list.filter((x) => inCity(x, city, get)); return c.length ? c : list; };
// Gerçek başlangıç zamanına göre (discoverEvents msOf = eventAt ?? createdAt sırası eventAt'i boş kayıtlarda yanlış olabilir)
const byStart = (a, b) => (eventStartMs(a) ?? Infinity) - (eventStartMs(b) ?? Infinity);

// Giriş: sayfa değiştirmeden giriş modalı (PublicHeader "Giriş yap" ile aynı davranış; Ctrl/Cmd/Shift-tık #/login'e gider)
// aria-haspopup="dialog": ekran okuyucu sayfa değişimi değil iletişim kutusu bekler
function loginLink(cls, label) {
  const a = h("a", { href: "#/login", class: cls, "aria-haspopup": "dialog" }, label);
  a.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); openLogin(); });
  return a;
}
const relHref = (u) => String(u || "").replace(/^\//, "");   // "/indir/" → "indir/" (footer ile aynı; alt yolda da çalışır)

export function landingView(ctx) {
  const unsubs = [];
  let dead = false;
  const hasSession = !!session.user;         // yok → anonim oturum kapalı (kurallar okumaya izin vermez)
  let city = getActiveCity();
  let data = null;                            // { events, artists, venues } | { error: true }

  const shell = publicShell({ active: null, logoHref: "#/", onCity: (c) => { city = c || getActiveCity(); if (data) paint(); } });
  unsubs.push(() => shell.destroy());
  const root = h("div", { class: "dk-landing" });
  shell.main.append(root);

  // ════════════════════ 1. HERO ════════════════════
  const heroText = h("div", { class: "dk-landing-hero-l dk-rise" },
    h("span", { class: "dk-landing-hero-eb" }, h("span", { class: "dk-landing-hero-line", "aria-hidden": "true" }), "CANLI MÜZİK PLATFORMU · GIGBRIDGES.COM"),
    h("h1", { id: "dk-landing-h-hero", class: "dk-landing-h1" }, "Sanatçılar, mekanlar ve müzik severler ", h("em", {}, "bir arada.")),
    h("p", { class: "dk-landing-lead" }, "Şehrindeki konserleri ve DJ setlerini keşfet, etkinliklere katıl, sevdiğin sanatçıları takip et. Sanatçı ve mekanlar için de sahneye giden en kısa yol."),
    h("div", { class: "dk-landing-ctas" },
      h("a", { href: "#/register", class: "dk-landing-btn dk-landing-btn-pink dk-press" }, "Hesap oluştur", arrowIc(16)),
      loginLink("dk-landing-btn dk-landing-btn-outline dk-press", "Giriş yap"),
      // Anonim oturum kapalıyken misafir gezinme mümkün değil (#/kesfet → #/'e döner) → bağlantı gizli
      hasSession ? h("a", { href: "#/kesfet", class: "dk-landing-guest dk-link" }, "Misafir olarak keşfet", arrowIc(14, "2")) : null),
    h("a", { href: "#/yonetici", class: "dk-landing-admin dk-link" }, svgRaw(P.shield, { size: 14, sw: "1.8" }), "Yönetici girişi"));

  const collage = h("div", { class: "dk-landing-hc dk-rise", style: { "--dk-delay": "120ms" } });
  const hero = h("section", { class: "dk-landing-hero", "aria-labelledby": "dk-landing-h-hero" },
    h("div", { class: "dk-container dk-landing-hero-grid" }, heroText, collage));

  // ════════════════════ 2. FEATURES ════════════════════
  const featIcon = { mic: P.mic, venue: P.venue, map: P.map, star: P.star };
  const featSvg = (k) => {
    const svg = svgRaw(featIcon[k], { size: 20, sw: "1.8" });
    if (k === "star") svg.removeAttribute("stroke-linecap");   // artboard yıldızında yalnız linejoin var → birebir
    return svg;
  };
  const features = h("section", { class: "dk-landing-feat", "aria-labelledby": "dk-landing-h-feat" },
    h("div", { class: "dk-container dk-landing-stack", style: { gap: "48px" } },
      h("div", { class: "dk-landing-feat-head" },
        h("div", { class: "dk-landing-sh" },
          h("span", { class: "dk-landing-eb" }, "01 · NELER VAR"),
          h("h2", { id: "dk-landing-h-feat", class: "dk-landing-h2" }, "Canlı müziğin her tarafı, ", h("em", {}, "tek yerde."))),
        h("p", { class: "dk-landing-feat-p" }, "Uygulamadaki tüm özellikler web'de de aynı hesapla çalışır.")),
      h("div", { class: "dk-landing-fgrid" },
        ...FEATS.map((f, i) => h("div", { class: "dk-landing-fitem" },
          h("span", { class: "dk-landing-fno" }, "0" + (i + 1)),
          h("span", { class: "dk-landing-ftile", style: { color: f.c } }, featSvg(f.k)),
          h("h3", { class: "dk-landing-ft" }, f.title),
          h("p", { class: "dk-landing-fd" }, f.desc))))));

  // ════════════════════ 3. ROLES (dikey sekmeler + panel) ════════════════════
  let role = roleFromQuery(ctx.query);
  const tabBtns = new Map();
  const tablist = h("div", { role: "tablist", "aria-label": "Rol seç", "aria-orientation": "vertical", class: "dk-landing-tabs" });
  const panel = h("div", { role: "tabpanel", id: "dk-landing-rolepanel", class: "dk-landing-panel dk-fa", tabindex: "0" });
  ROLES.forEach((r) => {
    const b = h("button", { type: "button", role: "tab", id: "dk-landing-tab-" + r.id, "aria-controls": "dk-landing-rolepanel", class: "dk-landing-tab dk-press", style: { "--dk-landing-rc": r.c } },
      h("span", { class: "dk-landing-tab-bar", "aria-hidden": "true" }),
      h("span", { class: "dk-landing-tab-dot", "aria-hidden": "true" }),
      h("span", { class: "dk-landing-tab-col" }, h("span", { class: "dk-landing-tab-name" }, r.name), h("span", { class: "dk-landing-tab-short" }, r.short)),
      svgRaw(P.arrow, { size: 16, sw: "2", cls: "dk-landing-tab-arrow" }));
    b.addEventListener("click", () => selectRole(r.id, { url: true }));
    tabBtns.set(r.id, b);
    tablist.append(b);
  });
  tablist.addEventListener("keydown", (e) => {
    const i = ROLE_IDS.indexOf(role);
    let j = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % ROLE_IDS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + ROLE_IDS.length) % ROLE_IDS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = ROLE_IDS.length - 1;
    if (j == null) return;
    e.preventDefault();
    selectRole(ROLE_IDS[j], { url: true });
    tabBtns.get(ROLE_IDS[j]).focus();
  });
  function paintPanel() {
    const r = ROLES.find((x) => x.id === role) || ROLES[0];
    panel.style.setProperty("--dk-landing-rc", r.c);
    panel.setAttribute("aria-labelledby", "dk-landing-tab-" + r.id);
    panel.replaceChildren(
      h("span", { class: "dk-landing-panel-bar", "aria-hidden": "true" }),
      h("div", { class: "dk-landing-panel-text" },
        h("span", { class: "dk-landing-panel-eb" }, r.eyebrow),
        h("h3", { class: "dk-landing-h3" }, r.title),
        h("ul", { class: "dk-landing-bullets" }, ...r.bullets.map((t) => h("li", {}, svgRaw(P.check, { size: 18, sw: "2" }), h("span", {}, t)))),
        h("a", { href: "#/register?rol=" + r.id, class: "dk-landing-panel-cta dk-press" }, r.cta, arrowIc(15))),
      h("div", { class: "dk-landing-panel-media", "aria-hidden": "true" },
        h("img", { src: r.img.src, alt: "", loading: "lazy", decoding: "async", style: { objectPosition: r.pos } }),
        h("span", { class: "dk-landing-panel-grad" })));
  }
  function selectRole(id, { url = false, anim = true } = {}) {
    const next = ROLE_IDS.includes(id) ? id : "customer";   // önce normalize (geçersiz ?rol= aynı rolde paneli yeniden oynatmasın)
    const changed = next !== role;
    role = next;
    tabBtns.forEach((b, k) => {
      const on = k === role;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("is-on", on);
    });
    if (changed || !panel.firstChild) {
      paintPanel();
      if (anim && changed) { panel.classList.toggle("dk-fa"); panel.classList.toggle("dk-fb"); }   // artboard flip: gb-fa ↔ gb-fb
    }
    if (url) writeQuery({ rol: role === "customer" ? null : role });
  }
  selectRole(role, { anim: false });
  // 769–1023: sekmeler yatay şerit → aria-orientation
  const mqRow = window.matchMedia("(max-width: 1023px)");
  const syncOrient = () => tablist.setAttribute("aria-orientation", mqRow.matches ? "horizontal" : "vertical");
  syncOrient();
  mqRow.addEventListener("change", syncOrient);
  unsubs.push(() => mqRow.removeEventListener("change", syncOrient));

  const roles = h("section", { class: "dk-landing-roles", "aria-labelledby": "dk-landing-h-roles" },
    h("div", { class: "dk-container dk-landing-stack", style: { gap: "40px" } },
      h("div", { class: "dk-landing-sh" },
        h("span", { class: "dk-landing-eb" }, "02 · KİMLER İÇİN"),
        h("h2", { id: "dk-landing-h-roles", class: "dk-landing-h2" }, "Dört rol, ", h("em", {}, "tek sahne."))),
      h("div", { class: "dk-landing-rgrid" }, tablist, panel)));

  // ════════════════════ 4. EVENTS "Bu hafta sahnede." ════════════════════
  // Yükleniyor: 4 iskelet kart (spec §2.6) — dk-ui.css .dk-skel-card/.dk-skel-body, görsel 200 (Landing)
  const evGrid = h("div", { class: "dk-landing-evgrid", "aria-busy": "true" },
    ...Array.from({ length: 4 }, () => h("div", { class: "dk-skel-card dk-landing-skel", "aria-hidden": "true" },
      dkSkeleton({ h: 200, r: 0 }),
      h("div", { class: "dk-skel-body dk-landing-skel-body" }, dkSkeleton({ w: "55%", h: 11 }), dkSkeleton({ w: "85%", h: 18 }), dkSkeleton({ w: "60%", h: 13 }),
        // alt satır (fiyat · katılımcı) — yüklenince kart boyu zıplamasın
        h("span", { class: "dk-landing-skel-foot" }, dkSkeleton({ w: 44, h: 13 }), dkSkeleton({ w: 84, h: 13 }))))));
  const events = h("section", { class: "dk-landing-ev", "aria-labelledby": "dk-landing-h-ev", hidden: !hasSession },
    h("div", { class: "dk-container dk-landing-stack", style: { gap: "32px" } },
      h("div", { class: "dk-landing-evhead" },
        h("div", { class: "dk-landing-sh" },
          h("span", { class: "dk-landing-eb" }, "03 · ÖNE ÇIKANLAR"),
          h("h2", { id: "dk-landing-h-ev", class: "dk-landing-h2" }, "Bu hafta ", h("em", {}, "sahnede."))),
        h("a", { href: "#/etkinlikler?tarih=bu-hafta", class: "dk-landing-all dk-link" }, "Tümünü gör", arrowIc(15, "2"))),
      evGrid));

  // ════════════════════ 5. APP PROMO ════════════════════
  const appEb = h("span", { class: "dk-landing-eb" }, "04 · UYGULAMA");
  // Erişilebilir ad = görünen metin ("İndir App Store"; WCAG 2.5.3); yeni sekmede açılan için gizli ipucu
  const store = (href, icon, label, ext) => h("a", { href, class: "dk-landing-store dk-press", target: ext ? "_blank" : null, rel: ext ? "noopener" : null },
    svgRaw(icon, { size: 22, sw: "1.8" }),
    h("span", { class: "dk-landing-store-col" }, h("span", { class: "dk-landing-store-k" }, "İndir"), " ", h("span", { class: "dk-landing-store-l" }, label)),
    ext ? h("span", { class: "dk-sr" }, " (yeni sekmede açılır)") : null);
  const appStore = appStoreHref(), play = playStoreHref();
  const app = h("section", { id: "uygulama", class: "dk-landing-appwrap", "aria-labelledby": "dk-landing-h-app" },
    h("div", { class: "dk-container" },
      h("div", { class: "dk-landing-app" },
        h("span", { class: "dk-landing-app-prism dk-prism", "aria-hidden": "true" }),
        h("div", { class: "dk-landing-app-text" },
          appEb,
          h("h2", { id: "dk-landing-h-app", class: "dk-landing-h2 dk-landing-h2-44" }, "GigBridge ", h("em", {}, "cebinde.")),
          h("p", { class: "dk-landing-app-p" }, "QR biletin, takip ettiğin sanatçıların yeni etkinlik bildirimleri ve yakınındaki sahneler. Kapıda girişini uygulamayla doğrula.")),
        h("div", { class: "dk-landing-stores" },
          // App Store kimliği yok → /indir/ (cihaz algılayan indirme sayfası); Google Play → mağaza (yeni sekme)
          store(/^https?:/.test(appStore) ? appStore : relHref(appStore), P.phone, "App Store", /^https?:/.test(appStore)),
          store(play, P.play, "Google Play", /^https?:/.test(play))))));

  // ════════════════════ 6. CTA ════════════════════
  const cta = h("section", { class: "dk-landing-cta", "aria-labelledby": "dk-landing-h-cta" },
    h("div", { class: "dk-container dk-landing-cta-in" },
      h("h2", { id: "dk-landing-h-cta", class: "dk-landing-cta-h" }, "Sahneye ", h("em", {}, "bir adım.")),
      h("p", { class: "dk-landing-cta-p" }, "Kayıt olmak ücretsiz. Hesabını oluştur, rolünü seç, hemen başla."),
      h("div", { class: "dk-landing-cta-row" },
        h("a", { href: "#/register", class: "dk-landing-btn dk-landing-btn-pink dk-press" }, "Hesap oluştur"),
        loginLink("dk-landing-btn dk-landing-btn-outline dk-press", "Giriş yap"))));

  root.append(hero, features, roles, events, app, cta);

  // ════════════════════ Kolaj ════════════════════
  // Yükleniyor: çerçeve + iskelet. Veri: canlı/sıradaki etkinlik (afişli), en çok takipçili sanatçı, en iyi puanlı mekan.
  // Şehirde öne çıkan etkinlik yok / veri yok / hata / oturum yok: üç parça birlikte genel yedek (dekoratif görsel yalnız
  // ARKA PLAN + genel metin, sayı YOK).
  // DOM sırası = görsel okuma sırası (odak sırası; WCAG 2.4.3): mekan çipi (üst sol) → ana kart → sanatçı çipi (alt).
  // Çipler z-index 1 ile ana kartın üstünde kalır (CSS) → görünüm artboard ile aynı.
  function collageSkeleton() {
    collage.replaceChildren(
      h("div", { class: "dk-landing-hc-venue", "aria-hidden": "true" }, dkSkeleton({ w: "40%", h: 10 }), dkSkeleton({ w: "80%", h: 15 }), dkSkeleton({ w: "60%", h: 12 })),
      h("div", { class: "dk-landing-hc-main is-loading", "aria-hidden": "true" }, dkSkeleton({ w: "100%", h: "100%", r: 0 })),
      h("div", { class: "dk-landing-hc-artist", "aria-hidden": "true" }, dkSkeleton({ w: 48, h: 48, r: 24 }),
        h("span", { class: "dk-landing-hc-acol" }, dkSkeleton({ w: "70%", h: 14 }), dkSkeleton({ w: "85%", h: 10 }))));
  }
  // Afişi yüklenemeyen etkinlikler bir sonraki boyamada atlanır (dekoratif görsel gerçek etkinliğin yerine KONMAZ)
  const badBanners = new Set();
  function pickEvent(list) {
    const now = Date.now();
    // Yalnız seçili şehir (TÜMÜ → hepsi): başka şehrin etkinliği kolaja taşınmaz; şehirde yoksa kolaj bütünüyle genel yedek (spec §2.7)
    const pool = list.filter((e) => { const src = evImage(e); return src && !badBanners.has(src) && inCity(e, city, evCity); });
    const live = pool.filter((e) => isLive(e, now)).sort(byStart)[0];
    if (live) return { e: live, live: true };
    const next = pool.filter((e) => { const s = eventStartMs(e); return s != null && s > now; }).sort(byStart)[0];
    return next ? { e: next, live: false } : null;
  }
  function pickArtist(list) {
    const withPhoto = list.filter((u) => u.photoURL);
    const pool = preferCity(withPhoto.length ? withPhoto : list, city);
    return [...pool].sort((a, b) => (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0))[0] || null;
  }
  function pickVenue(list) {
    if (!list.length) return null;
    const rated = list.filter((v) => Number(v.avgRating) > 0 && Number(v.reviewCount) > 0);
    // Bayes ortalaması (Top 10 ile aynı formül): tek 5 yıldızlı yorum listenin başına oturmasın
    const mean = rated.length ? rated.reduce((s, v) => s + Number(v.avgRating) * Number(v.reviewCount), 0) / rated.reduce((s, v) => s + Number(v.reviewCount), 0) : 4;
    const score = (v) => (Number(v.avgRating) > 0 ? bayesianScore(Number(v.avgRating), Number(v.reviewCount) || 0, mean) : 0);
    const pool = preferCity(list, city);   // önce seçili şehrin mekanları (etkinliği olan şehirde çip genel kalmasın)
    return [...pool].sort((a, b) => score(b) - score(a) || (Number(b.capacity) || 0) - (Number(a.capacity) || 0))[0] || null;
  }
  const liveDot = (live) => h("span", { class: "dk-landing-hc-dot", "aria-hidden": "true" },
    live ? h("span", { class: "dk-landing-hc-ping dk-ping" }) : null, h("span", { class: "dk-landing-hc-core" }));
  function paintCollage() {
    const d = data && !data.error ? data : null;
    const ev = d ? pickEvent(d.events) : null;
    // Hep ya da hiç: öne çıkan etkinlik yoksa çipler de genel (gerçek + genel karışık kolaj yok)
    const ar = ev ? pickArtist(d.artists) : null;
    const ve = ev ? pickVenue(d.venues) : null;
    let main;
    if (ev) {
      const e = ev.e, s = eventStartMs(e);
      const venue = trUpper(e.venueName || evCity(e) || "");
      const when = ev.live ? "ŞU AN" : trUpper(fmtDayLabel(s) + " " + fmtTime(s)).trim();
      const n = Number(e.attendeeCount) || 0;
      const sub = [e.artistName, n > 0 ? `${n} kişi katılıyor` : null].filter(Boolean).join(" · ") || evCity(e);
      const src = evImage(e);
      const img = h("img", { class: "dk-landing-hc-img dk-kb", src, alt: "", decoding: "async" });
      // Afiş kırık → bu etkinliği atla, sıradakini seç (o da yoksa genel yedek). Dekoratif görsel gerçek verinin altına girmez.
      img.addEventListener("error", () => { badBanners.add(src); if (!dead && img.isConnected) paintCollage(); }, { once: true });
      main = h("a", { href: evHref(e), class: "dk-landing-hc-main" },
        img, h("span", { class: "dk-landing-hc-grad", "aria-hidden": "true" }),
        h("span", { class: "dk-landing-hc-cap" },
          h("span", { class: cx("dk-landing-hc-eb", !ev.live && "is-next") }, liveDot(ev.live), h("span", { class: "dk-landing-hc-ebt" }, venue ? `${when} · ${venue}` : when)),
          h("span", { class: "dk-landing-hc-t" }, evTitle(e)),
          sub ? h("span", { class: "dk-landing-hc-s" }, sub) : null));
    } else {
      // Genel (sayısız) yedek — dekoratif görsel yalnız arka plan
      main = h("div", { class: "dk-landing-hc-main" },
        h("img", { class: "dk-landing-hc-img dk-kb", src: IMG.jazzClub.src, alt: "", decoding: "async" }),
        h("span", { class: "dk-landing-hc-grad", "aria-hidden": "true" }),
        h("span", { class: "dk-landing-hc-cap" },
          h("span", { class: "dk-landing-hc-eb is-next" }, liveDot(false), h("span", { class: "dk-landing-hc-ebt" }, "CANLI MÜZİK · ŞEHRİNDE")),
          h("span", { class: "dk-landing-hc-t" }, "Sahne seni bekliyor"),
          h("span", { class: "dk-landing-hc-s" }, "Konserler, DJ setleri ve akustik geceler")));
    }
    let artistEl;
    if (ar) {
      const g = artistGenres(ar)[0];
      const name = ar.displayName || "Sanatçı";
      artistEl = h("a", { href: "#/sanatci/" + encodeURIComponent(ar.id), class: "dk-landing-hc-artist" },
        dkAvatar({ name, photo: ar.photoURL, size: 48, type: "artist", position: "70% 20%", cls: "dk-landing-hc-av" }),
        h("span", { class: "dk-landing-hc-acol" },
          h("span", { class: "dk-landing-hc-name" }, name),
          h("span", { class: "dk-landing-hc-role" }, g ? `SANATÇI · ${genreLabel(g)}` : "SANATÇI")));
    } else {
      artistEl = h("div", { class: "dk-landing-hc-artist" },
        dkAvatar({ name: "S", size: 48, type: "artist", icon: svgRaw(P.mic, { size: 20, sw: "1.8", color: "#F2F1EE" }), cls: "dk-landing-hc-av" }),
        h("span", { class: "dk-landing-hc-acol" },
          h("span", { class: "dk-landing-hc-name" }, "Sanatçılar"),
          h("span", { class: "dk-landing-hc-role" }, "SANATÇI · PORTFÖY")));
    }
    let venueEl;
    if (ve) {
      const name = ve.displayName || ve.name || "Mekan";
      const rating = fmtRating(ve.avgRating);
      const cap = Number(ve.capacity) > 0 ? `${ve.capacity} kişi` : null;
      const line = [rating, cap].filter(Boolean).join(" · ") || ve.city || "";
      venueEl = h("a", { href: "#/mekan/" + encodeURIComponent(ve.id), class: "dk-landing-hc-venue" },
        h("span", { class: "dk-landing-hc-vk" }, "MEKAN"),
        h("span", { class: "dk-landing-hc-name" }, name),
        line ? h("span", { class: "dk-landing-hc-vline" }, rating ? svgRaw(P.star, { size: 13, fill: true, color: "#FFD700" }) : null, h("span", {}, line)) : null);
    } else {
      venueEl = h("div", { class: "dk-landing-hc-venue" },
        h("span", { class: "dk-landing-hc-vk" }, "MEKAN"),
        h("span", { class: "dk-landing-hc-name" }, "Mekanlar"),
        h("span", { class: "dk-landing-hc-vline" }, svgRaw(P.star, { size: 13, fill: true, color: "#FFD700" }), h("span", {}, "Puanlar ve yorumlar")));
    }
    collage.replaceChildren(venueEl, main, artistEl);   // okuma/odak sırası: üst sol çip → ana kart → alt çip
  }

  // ════════════════════ Etkinlikler ════════════════════
  function paintEvents() {
    const d = data && !data.error ? data : null;
    const now = Date.now();
    const list = d ? d.events.filter((e) => inThisWeek(e, now) && inCity(e, city, evCity)).sort(byStart).slice(0, 4) : [];
    // Bu hafta (şehirde) etkinlik yoksa / hata / oturum yok → bölüm gizli (spec §2.6 Q9 birincil seçenek); numaralar kayar
    const show = list.length > 0;
    events.hidden = !show;
    root.classList.toggle("is-noev", !show);
    appEb.textContent = (show ? "04" : "03") + " · UYGULAMA";
    evGrid.removeAttribute("aria-busy");
    evGrid.replaceChildren(...list.map((e) => eventCard(e, { media: 200, footer: "attendees-plain" })));
  }
  function paint() {
    if (dead) return;
    paintCollage();
    paintEvents();
  }

  // ════════════════════ Veri ════════════════════
  if (!hasSession) {
    data = { error: true };
    paint();
  } else {
    collageSkeleton();
    Promise.allSettled([cached("events", discoverEvents), cached("artists", listRealArtists), cached("venues", listVenues)]).then(([ev, ar, ve]) => {
      if (dead) return;
      const events = ev.status === "fulfilled" ? ev.value : [];
      data = {
        error: ev.status !== "fulfilled" && ar.status !== "fulfilled" && ve.status !== "fulfilled",
        events,
        artists: ar.status === "fulfilled" ? ar.value : [],
        venues: ve.status === "fulfilled" ? ve.value : [],
      };
      // Header şehir seçicisine yaklaşan etkinlik sayıları (Keşfet ile aynı sıralama: etkinliği olan şehirler üstte)
      if (events.length) {
        const counts = { [ALL_CITIES]: events.length };
        // Yazım farkları ("istanbul" / "İstanbul") tek satırda birleşir (Keşfet cityCounts ile aynı)
        events.forEach((e) => {
          const c = evCity(e); if (!c) return;
          const k = Object.keys(counts).find((x) => x !== ALL_CITIES && sameCity(x, c)) || c;
          counts[k] = (counts[k] || 0) + 1;
        });
        shell.header.setCityCounts(counts);
      }
      paint();
    });
  }

  return {
    node: shell.node,
    update(query) { selectRole(roleFromQuery(query)); },
    onSession() { return true; },   // sayfada oturuma bağlı içerik yok (kimlik değişimini router ayrıca ele alır)
    destroy() { dead = true; unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
  };
}
