// PanelShell — sanatçı / mekan / organizatör / yönetici masaüstü kabuğu (256px yapışkan kenar çubuğu + 72px üst bar).
// Kaynak (ölçüler birebir): WebSanatciPanel (artist), WebMekanPanel (venue), WebOrgPanel (organizer), WebAdmin (admin).
// Spec: sanatci §0.1, mekan §0.3–0.8, org-admin F4–F7 + WebAdmin §3. CSS: css/dk-panel-shell.css.
// Rol farkları (spec tabloları mekan §0.8 / org-admin F6) BİLEREK korunur — gözden geçirenler artboard ile karşılaştırır.
//
// SÖZLEŞME (adım 1'de tanımlandı; aynen korunur, yalnız eklendi):
//   panelShell(opts) → { node, content, main, setTitle(t), setSubtitle(s), setCrumb(c), setActive(key), setBadge(key, n),
//                        setNotifications(items), search, destroy() }
//   opts = {
//     role:   "artist" | "venue" | "organizer" | "admin",
//     active: artist: home|kesfet|top10|mekanlar|mesaj|profil · venue: home|olustur(CTA)|sanatci|analitik|mesaj|profil
//             organizer: home|etkinlik|mekan|ekip|mesaj|profil · admin: onaylar|vip|ad|sorun
//     title, subtitle (sanatçı: başlık üstte + alt satır), crumb (mekan: "Babylon Club / {crumb}" nav + h1; org/admin: mono eyebrow + başlık),
//     search: { placeholder, onSubmit(q), onInput(q), value } | false  (mekan: "/" kısayolu + kbd çipi),
//     headerActions: Node[] (arama öncesi; WebAdmin "Keşfet önizleme"),
//     onPreview(): admin "Keşfet ekranı" + "Siteye dön" (yönetici için router tüm public rotaları #/admin'e çevirir),
//     notifications: "live" (varsayılan; listenNotifications) | "custom" (setNotifications ile görünüm verir — WebAdmin),
//     contentGap (px), contentPad ("32px 40px 40px" — satır içi, TÜM genişliklerde geçerli; duyarlı dolgu için görünüm CSS'inde
//                 --dk-ps-padx / --dk-ps-padt / --dk-ps-padb değişkenlerini ez), ctx,
//     titleTag: üst bar başlığının etiketi (varsayılan: mekan "h1", diğerleri "span" — tasarımlı görünümlerde sayfa h1'i
//               içerikte; legacy-in-shell "h1" verir), shellBadges (false → rozetleri görünüm yönetir)
//   }
//   "Siteye dön" + logo: WebKesfet (#/kesfet) görünümü hazırsa #/kesfet; NOT_READY iken bağlantı GİZLİ, logo panel evine
//   (legacy politika panel rollerini herkese açık sayfadan panel evine geri atıyor → ölü uç olmasın). Üst bar araması:
//   görünüm kendi onSubmit/onInput'unu vermiyorsa Enter varsayılan rotaya (sanatçı Keşfet / mekan Sanatçı Bul / org
//   Etkinlikler, ?q=) gider — o hedef görünüm hazır değilse arama GİZLİ (legacy sekmeler ?q okumuyor).
//   ≤1023: arama 40×40 ikon düğmesine katlanır; tıklayınca ya da "/" ile üst barda genişler (ESC / boşken odak kaybı kapatır).
//   node = .dk kökü (class "dk dk-panel dk-ps", data-role, data-area="panel"); content = görünüm içeriği (max 1280, sola hizalı)
//   destroy = bildirim/okunmamış dinleyicileri, belge klavye/tık dinleyicileri, açık popover → kapat.
// 769–1023: kenar çubuğu ekran dışı çekmece + üst barda hamburger.
import { h } from "../../ui.js";
import { session, logout } from "../../store.js";
import { svgIcon, svgRaw } from "./icons.js";
import { cx, dkAvatar, dkConfirm, dkSearchInput } from "./ui.js";
import { dkPopover } from "./overlays.js";
import { subscribeLive } from "./live.js";
import { rgba, timeAgo, trUpper } from "./helpers.js";
import { markNotifRead, listenArtistOffers, organizerRequests } from "../../data.js";
import { routeReady, routeReadySync } from "../registry.js";

export const NOT_READY = false;

// ── rol yapılandırması ──
// nav: [anahtar, etiket, rota, ikon, ikon seçenekleri]
const ROLES = {
  artist: {
    color: "#FF4FA3", badge: "SANATÇI PANELİ", asideLabel: "Sanatçı paneli", headMode: "subtitle", sw: "1.9",
    nav: [
      ["home", "Ana Sayfa", "#/artist", "home"],
      ["kesfet", "Keşfet", "#/artist/kesfet", "compass"],
      ["top10", "Top 10", "#/artist/top10", "trophy"],
      ["mekanlar", "Mekanlar", "#/artist/mekanlar", "star", { stroke: true }],
      ["mesaj", "Mesajlar", "#/artist/mesaj", "chatBubble"],
      ["profil", "Profilim", "#/artist/profil", "userCircle"],
    ],
    searchPh: "Teklif, mekan veya sanatçı ara", bell: { mode: "link", href: "#/artist/bildirimler" }, profileHref: "#/artist/profil", profileLabel: "Profilim",
    logoutIcon: "logout", navBadge: "filled",
  },
  venue: {
    color: "#FF8A2A", badge: "MEKAN PANELİ", asideLabel: "Mekan paneli", headMode: "breadcrumb", sw: "1.8",
    cta: { key: "olustur", label: "Etkinlik oluştur", href: "#/venue/olustur" },
    nav: [
      ["home", "Ana Sayfa", "#/venue", "homeVenue"],
      ["sanatci", "Sanatçı Bul", "#/venue/sanatci", "search", { sw: "1.8" }],
      ["analitik", "Analitik", "#/venue/analitik", "chart"],
      ["mesaj", "Mesajlar", "#/venue/mesaj", "chatLines"],
      ["profil", "Profil", "#/venue/profil", "userVenue"],
    ],
    searchPh: "Etkinlik, sanatçı ara", kbd: "/", bell: { mode: "popover" }, profileHref: "#/venue/profil", profileLabel: "Mekan profili",
    logoutIcon: "logoutVenue", navBadge: "tint",
  },
  organizer: {
    color: "#FF4FA3", badge: "ORGANİZATÖR PANELİ", asideLabel: "Organizatör paneli menüsü", headMode: "crumb", sw: "2", crumbRole: "ORGANİZATÖR",
    nav: [
      ["home", "Ana Sayfa", "#/organizer", "homeOrg"],
      ["etkinlik", "Etkinlikler", "#/organizer/etkinlik", "calendar", { sw: "2" }],
      ["mekan", "Mekan Seç", "#/organizer/mekan", "building", { sw: "2" }],
      ["ekip", "Ekip", "#/organizer/ekip", "users"],
      ["mesaj", "Mesajlar", "#/organizer/mesaj", "chatSquare"],
      ["profil", "Profil", "#/organizer/profil", "userProfile"],
    ],
    searchPh: "Etkinlik, mekan veya üye ara", bell: { mode: "popover", allHref: "#/organizer/bildirim" }, profileHref: "#/organizer/profil", profileLabel: "Profil",
    logoutIcon: "logoutOrg", navBadge: "tint",
  },
  admin: {
    color: "#A78BFA", badge: "YÖNETİCİ", asideLabel: "Yönetici menüsü", headMode: "crumb", sw: "2", crumbRole: "YÖNETİCİ",
    sections: [
      { label: "ONAYLAR", navLabel: "Yönetici sekmeleri", items: [
        ["onaylar", "Onaylar", "#/admin", "shieldCheck"],
        ["vip", "VIP İstekleri", "#/admin/vip", "sparklesAdmin"],
        ["ad", "Mekan Adı İstekleri", "#/admin/ad", "edit"],
        ["sorun", "Sorun Bildirimleri", "#/admin/sorun", "flag"],
      ] },
      { label: "ÖNİZLEME", items: [["onizleme", "Keşfet ekranı", null, "compassAdmin"]] },
    ],
    searchPh: "Etkinlik, mekan veya üye ara", bell: { mode: "popover" }, profileHref: "#/admin", profileLabel: "Profil",
    logoutIcon: "logoutOrg", navBadge: "tint", fixedTitle: "Yönetici Paneli",
  },
};
export const PANEL_ROLES = ROLES;
const HOME = { artist: "#/artist", venue: "#/venue", organizer: "#/organizer", admin: "#/admin" };
const SITE = "#/kesfet";
// Kabuk rozetlerinin son değerleri (uid|rol|anahtar → n): rota geçişinde kabuk yeniden kurulurken rozet göz kırpmasın.
const _badgeCache = new Map();
const narrowMq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 1023px)") : { matches: false };

// Bildirim türü → ikon/renk (popover satırı; org-admin F4)
const NOTIF_KIND = (n) => {
  const t = String(n.type || "");
  if (/edit|permission|izin/i.test(t)) return { icon: "key", color: "#FF4FA3" };
  if (/accept|approved|onay/i.test(t)) return { icon: "check", color: "#7CE0B0" };
  if (/reject|red|cancel/i.test(t)) return { icon: "trash", color: "#FF5A6E" };
  if (/message|mesaj/i.test(t)) return { icon: "chatSquare", color: "#A78BFA" };
  if (/request|istek|invit|davet|offer|teklif/i.test(t)) return { icon: "building", color: "#FF8A2A" };
  return { icon: "bellPanel", color: "#4ED8FF" };
};

export function panelShell(opts = {}) {
  const role = ROLES[opts.role] ? opts.role : "artist";
  const R = ROLES[role];
  const s = opts.ctx?.session || session;
  const p = s.profile || {};
  const email = p.email || s.user?.email || "";
  const uid = s.user?.uid;
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });
  let active = opts.active ?? "home";
  const siteReady = role !== "admin" && routeReadySync(SITE) === true;

  // ═════════ KENAR ÇUBUĞU ═════════
  const brand = h("div", { class: "dk-ps-brand" },
    h("a", { href: siteReady ? SITE : HOME[role], class: "dk-logo dk-ps-logo", "aria-label": siteReady ? "GigBridge ana sayfa" : "Panel ana sayfası" },
      h("span", { class: "dk-logo-tile", style: { width: "32px", height: "32px" } }, h("img", { src: "/assets/logo-icon.svg", alt: "", width: 32, height: 32, decoding: "async" })),
      h("span", { class: "dk-logo-word" }, "GigBridge")),
    h("span", { class: "dk-ps-rolebadge" }, role === "artist" ? h("span", { class: "dk-ps-rolebadge-dot" }) : null, R.badge));

  const items = new Map();   // anahtar → <a>
  const badges = new Map();  // anahtar → <span>
  const mkItem = ([key, label, href, icon, io = {}]) => {
    const bdg = h("span", { class: cx("dk-ps-count", R.navBadge === "filled" ? "is-filled" : "is-tint"), hidden: true });
    badges.set(key, bdg);
    const ico = svgIcon(icon, { size: 18, sw: io.sw || R.sw, stroke: io.stroke, cls: "dk-ps-ic" });
    const inner = [h("span", { class: "dk-ps-bar", "aria-hidden": "true" }), ico, h("span", { class: "dk-ps-lbl" }, label), bdg];
    let el;
    if (href) el = h("a", { href, class: "dk-ps-item dk-nav", dataset: { key } }, ...inner);
    else {
      el = h("button", { type: "button", class: "dk-ps-item dk-nav", dataset: { key } }, ...inner);
      if (key === "onizleme") el.addEventListener("click", () => opts.onPreview?.());
    }
    items.set(key, el);
    return el;
  };
  const asideKids = [brand];
  let cta = null;
  if (R.cta) {
    cta = h("a", { href: R.cta.href, class: "dk-ps-cta dk-press", dataset: { key: R.cta.key } }, svgIcon("plus", { size: 17, sw: "2.2" }), R.cta.label);
    asideKids.push(cta);
  }
  if (R.sections) {
    R.sections.forEach((sec, i) => {
      asideKids.push(h("span", { class: cx("dk-ps-sec", i && "is-next") }, sec.label));
      const list = sec.items.filter(([k]) => k !== "onizleme" || opts.onPreview).map(mkItem);
      asideKids.push(sec.navLabel ? h("nav", { "aria-label": sec.navLabel, class: "dk-ps-nav" }, ...list) : h("div", { class: "dk-ps-nav" }, ...list));
    });
  } else {
    asideKids.push(h("nav", { "aria-label": "Panel menüsü", class: "dk-ps-nav" }, ...R.nav.map(mkItem)));
  }

  // alt blok: kullanıcı kartı + Siteye dön + Çıkış
  const userCard = (() => {
    let av, l1, l2;
    if (role === "artist") {
      av = dkAvatar({ name: p.displayName, photo: p.photoURL, size: 36, type: "artist" });
      l1 = p.displayName || "Sanatçı"; l2 = email;
    } else if (role === "venue") {
      av = dkAvatar({ name: p.displayName, photo: p.photoURL, size: 38, type: "venue", border: true }); // artboard: 36 + 1px kenar (content-box)
      l1 = email || p.displayName || "Mekan"; l2 = `${p.displayName || "Mekan"} · yetkili`;
    } else if (role === "organizer") {
      av = p.photoURL ? dkAvatar({ photo: p.photoURL, size: 36, type: "organizer" }) : dkAvatar({ size: 36, type: "organizer", icon: "building", iconSize: 17 });
      const isStaff = (p.orgRole || "owner") === "staff"; // legacy organizer.js ile aynı kural
      l1 = p.orgName || p.displayName || "Organizasyonunuz"; l2 = `${isStaff ? "Personel" : "Sahip"}${email ? " · " + email : ""}`;
    } else {
      av = dkAvatar({ size: 36, type: "admin", icon: "shieldCheck", iconSize: 17 });
      l1 = "Yönetici"; l2 = email;
    }
    return h("div", { class: "dk-ps-user" }, av, h("span", { class: "dk-ps-usercol" }, h("span", { class: "dk-ps-u1" }, l1), h("span", { class: "dk-ps-u2" }, l2)));
  })();
  const siteLink = role === "admin"
    ? (opts.onPreview ? h("button", { type: "button", class: "dk-ps-foot dk-nav", onclick: () => opts.onPreview() }, svgIcon("arrowLeft", { size: 17, sw: R.sw }), "Siteye dön") : null)
    : h("a", { href: SITE, class: "dk-ps-foot dk-nav", hidden: !siteReady }, svgIcon("arrowLeft", { size: 17, sw: R.sw }), "Siteye dön");
  const exitBtn = h("button", { type: "button", class: "dk-ps-foot dk-nav" }, svgIcon(R.logoutIcon, { size: 17, sw: R.sw }), "Çıkış");
  exitBtn.addEventListener("click", async () => {
    const ok = await dkConfirm({ title: "Çıkış", body: "Hesabından çıkmak istiyor musun?", confirmLabel: "Çıkış Yap", cancelLabel: "İptal", danger: true, size: 420 });
    if (ok) logout(role === "admin" ? "#/yonetici" : undefined);
  });
  asideKids.push(h("div", { class: "dk-ps-bottom" }, userCard, siteLink, exitBtn));
  const aside = h("aside", { "aria-label": R.asideLabel, class: "dk-ps-aside dk-scroll", id: "dk-ps-aside" }, ...asideKids);

  // ═════════ ÜST BAR ═════════
  const titleEl = h(opts.titleTag || (R.headMode === "breadcrumb" ? "h1" : "span"), { class: "dk-ps-title" }, R.fixedTitle || opts.title || "");
  const subEl = h("span", { class: "dk-ps-sub" });
  const crumbEl = h("span", { class: "dk-ps-crumb" });
  const crumbCur = h("span", {});
  let head;
  if (R.headMode === "subtitle") head = h("div", { class: "dk-ps-head dk-ps-head-sub" }, titleEl, subEl);
  else if (R.headMode === "breadcrumb") {
    head = h("div", { class: "dk-ps-head dk-ps-head-bc" },
      h("nav", { "aria-label": "Konum", class: "dk-ps-bc" }, h("a", { href: "#/venue", class: "dk-link" }, p.displayName || "Mekan"), h("span", { "aria-hidden": "true" }, "/"), crumbCur),
      titleEl);
  } else head = h("div", { class: "dk-ps-head dk-ps-head-crumb" }, crumbEl, titleEl);

  const burger = h("button", { type: "button", class: "dk-ps-burger dk-press", "aria-label": "Menüyü aç", "aria-expanded": "false", "aria-controls": "dk-ps-aside" }, svgIcon("menu", { size: 18 }));
  const right = h("div", { class: "dk-ps-right" }, ...(opts.headerActions || []));
  // arama (≥1024: alan · ≤1023: 40×40 ikon düğmesi → üst barda genişler)
  let search = null;
  let openSearch = () => {};
  if (opts.search !== false) {
    const so = opts.search || {};
    // Varsayılan Enter davranışı (spec önerileri: mekan §0.5 → Sanatçı Bul, org F4 → Etkinlikler; sanatçı → Keşfet); görünüm ezebilir.
    // Hedef görünüm ?q okumalı (ctx.query.get("q")); hedef NOT_READY iken (legacy sekme ?q'yu yok sayar) arama gizlenir.
    const SEARCH_ROUTE = { artist: "#/artist/kesfet", venue: "#/venue/sanatci", organizer: "#/organizer/etkinlik" }[role];
    const usesDefault = !so.onSubmit && !so.onInput;
    const onSubmit = so.onSubmit || (SEARCH_ROUTE ? (q) => { location.hash = SEARCH_ROUTE + (q ? "?q=" + encodeURIComponent(q) : ""); } : undefined);
    const iconName = role === "organizer" || role === "admin" ? "search2" : "search";
    search = dkSearchInput({ placeholder: so.placeholder || R.searchPh, label: "Panelde ara", value: so.value || "", onInput: so.onInput, onSubmit,
      radius: role === "venue" ? 8 : 6, kbd: R.kbd, uaPad: role !== "artist", iconName, iconSw: role === "venue" ? "1.8" : "2", cls: "dk-ps-search" });
    search.id = `dk-ps-search-${role}`;
    const searchBtn = h("button", { type: "button", class: "dk-ps-searchbtn dk-press", "aria-label": "Panelde ara", "aria-expanded": "false", "aria-controls": search.id },
      svgIcon(iconName, { size: 18, sw: role === "venue" ? "1.8" : "2" }));
    const box = h("div", { class: "dk-ps-srch" }, searchBtn, search);
    const setOpen = (on) => {
      node.classList.toggle("is-search-open", on);
      searchBtn.setAttribute("aria-expanded", on ? "true" : "false");
    };
    openSearch = () => { setOpen(true); requestAnimationFrame(() => { try { search.input.focus(); } catch (_) {} }); };
    searchBtn.addEventListener("click", openSearch);
    search.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && narrowMq.matches && node.classList.contains("is-search-open")) { e.preventDefault(); setOpen(false); searchBtn.focus(); }
    });
    search.input.addEventListener("blur", () => { if (!search.input.value) setTimeout(() => { if (alive && document.activeElement !== search.input) setOpen(false); }, 0); });
    right.append(box);
    if (usesDefault && SEARCH_ROUTE) {
      const ready = routeReadySync(SEARCH_ROUTE);
      if (ready !== true) {
        box.hidden = true;
        routeReady(SEARCH_ROUTE).then((ok) => { if (ok && alive) box.hidden = false; });
      }
    }
    // "/" kısayolu: mekan tüm genişliklerde (kbd çipi), diğer roller yalnız ≤1023 (katlanmış arama genişler)
    const onSlash = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || box.hidden) return;
      if (!R.kbd && !narrowMq.matches) return;
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      if (narrowMq.matches) openSearch(); else search.input.focus();
    };
    document.addEventListener("keydown", onSlash);
    unsubs.push(() => document.removeEventListener("keydown", onSlash));
  }
  // zil
  const bellDot = h("span", { class: "dk-ps-belldot", hidden: true });
  const bellIcon = role === "artist" ? svgIcon("bellArtist", { size: 18, sw: "1.9" }) : svgIcon("bellPanel", { size: 18, sw: role === "venue" ? "1.8" : "2" });
  let bell;
  let notifItems = [];
  let pop = null;
  if (R.bell.mode === "link") {
    bell = h("a", { href: R.bell.href, class: "dk-ps-bell dk-press", "aria-label": "Bildirimler" }, bellIcon, bellDot);
  } else {
    bell = h("button", { type: "button", class: "dk-ps-bell dk-press", "aria-label": "Bildirimler", "aria-expanded": "false", "aria-haspopup": "dialog" }, bellIcon, bellDot);
    bell.addEventListener("click", () => {
      if (pop) { pop.close(); return; }
      // artboard (WebOrgPanel/WebAdmin): içerik 380 + 1px kenar ×2 = 382; zil altı (56) → popover üstü (64) = 8
      pop = dkPopover({ anchor: bell, content: notifPanel(), label: "Bildirimler", anim: "pop", width: 382, offset: role === "venue" ? 12 : 8, cls: "dk-ps-notifpop", focus: true,
        onClose: () => { pop = null; bell.classList.remove("is-open"); } });
      bell.classList.add("is-open");
    });
    unsubs.push(() => pop?.close());
  }
  const notifPanel = () => {
    const list = h("div", { class: "dk-ps-nlist dk-scroll" });
    const draw = () => {
      list.replaceChildren();
      const shown = notifItems.slice(0, 8);
      if (!shown.length) { list.append(h("div", { class: "dk-ps-nempty" }, svgIcon("bellPanel", { size: 22, color: "#5E636D" }), h("span", {}, "Bildirim yok"))); return; }
      shown.forEach((n) => {
        const k = n.icon ? { icon: n.icon, color: n.color || "#4ED8FF" } : NOTIF_KIND(n);
        const row = h(n.href ? "a" : "div", { href: n.href || null, class: cx("dk-ps-nrow", n.href && "dk-row") },
          h("span", { class: "dk-ps-ntile", style: { background: rgba(k.color, 0.12) } }, svgIcon(k.icon, { size: 16, color: k.color })),
          h("span", { class: "dk-ps-ncol" },
            h("span", { class: "dk-ps-nt" }, n.title || "Bildirim"),
            n.body ? h("span", { class: "dk-ps-nb" }, n.body) : null,
            h("span", { class: "dk-ps-ntime" }, n.time || timeAgo(n.createdAt, { upper: true }))),
          h("span", { class: "dk-ps-nunread", style: !n.read ? { background: k.color } : { background: "transparent" }, "aria-label": !n.read ? "okunmamış" : null }));
        if (!n.read && n.id && !n.custom) row.addEventListener("click", () => { markNotifRead(n.id); });
        list.append(row);
      });
    };
    draw();
    const closeX = h("button", { type: "button", class: "dk-ps-nclose", "aria-label": "Kapat", onclick: () => pop?.close("x", true) }, svgIcon("x", { size: 16 }));
    return h("div", { class: "dk-ps-npanel" },
      h("div", { class: "dk-ps-nhead" }, h("span", {}, "BİLDİRİMLER"), closeX),
      list,
      R.bell.allHref ? h("a", { href: R.bell.allHref, class: "dk-ps-nall dk-link" }, "Tüm bildirimler", svgIcon("arrowRight", { size: 14 })) : null);
  };
  const setBellState = (unread) => {
    bellDot.hidden = !unread;
    bell.setAttribute("aria-label", unread ? "Bildirimler, okunmamış var" : "Bildirimler");
  };
  // avatar
  const avatarLink = (() => {
    if (role === "artist") return h("a", { href: R.profileHref, class: "dk-ps-av dk-ps-av40", "aria-label": R.profileLabel }, dkAvatar({ name: p.displayName, photo: p.photoURL, size: 40, type: "artist" }));
    if (role === "venue") return h("a", { href: R.profileHref, class: "dk-ps-av", "aria-label": R.profileLabel }, dkAvatar({ name: p.displayName, photo: p.photoURL, size: 38, type: "venue", border: true }));
    if (role === "organizer") return h("a", { href: R.profileHref, class: "dk-ps-av", "aria-label": R.profileLabel }, p.photoURL ? dkAvatar({ photo: p.photoURL, size: 36 }) : dkAvatar({ size: 36, type: "organizer", icon: "building", iconSize: 16 }));
    return h("a", { href: R.profileHref, class: "dk-ps-av", "aria-label": R.profileLabel }, dkAvatar({ size: 36, type: "admin", icon: "shieldCheck", iconSize: 16 }));
  })();
  right.append(bell, avatarLink);
  const topbar = h("header", { class: cx("dk-ps-top", `dk-ps-top-${R.headMode}`) }, burger, head, right);

  // ═════════ İÇERİK ═════════
  const content = h("main", { class: "dk-ps-content", id: "dk-main", tabindex: "-1", style: { gap: (opts.contentGap ?? (role === "artist" ? 24 : role === "venue" ? 28 : 24)) + "px", padding: opts.contentPad || null } });
  const main = h("div", { class: "dk-ps-main" }, topbar, content);
  const scrim = h("div", { class: "dk-ps-scrim", "aria-hidden": "true" });
  const node = h("div", { class: cx("dk", "dk-panel", "dk-ps", `dk-ps-${role}`), dataset: { role, area: "panel" }, style: { "--dk-role": R.color } },
    h("a", { href: "#dk-main", class: "dk-skip", onclick: (e) => { e.preventDefault(); content.focus(); } }, "İçeriğe geç"),
    aside, scrim, main);

  // ── çekmece (769–1023) ──
  const setDrawer = (open) => {
    node.classList.toggle("is-nav-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Menüyü kapat" : "Menüyü aç");
    if (open) requestAnimationFrame(() => aside.querySelector("a,button")?.focus({ preventScroll: true }));
  };
  burger.addEventListener("click", () => setDrawer(!node.classList.contains("is-nav-open")));
  scrim.addEventListener("click", () => setDrawer(false));
  aside.addEventListener("click", (e) => { if (e.target.closest("a")) setDrawer(false); });
  const onEsc = (e) => { if (e.key === "Escape" && node.classList.contains("is-nav-open")) { setDrawer(false); burger.focus(); } };
  document.addEventListener("keydown", onEsc);
  unsubs.push(() => document.removeEventListener("keydown", onEsc));

  // ── API ──
  const setActive = (key) => {
    active = key;
    items.forEach((el, k) => {
      const on = k === key;
      el.classList.toggle("is-on", on);
      if (on) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    if (cta) { const on = key === R.cta.key; cta.classList.toggle("is-on", on); if (on) cta.setAttribute("aria-current", "page"); else cta.removeAttribute("aria-current"); }
  };
  const setBadge = (key, n) => {
    const b = badges.get(key); if (!b) return;
    const v = Number(n) || 0;
    if (uid) _badgeCache.set(`${uid}|${role}|${key}`, v);
    b.hidden = v <= 0;
    b.textContent = v > 99 ? "99+" : String(v);
    if (role === "artist" && key === "home") b.setAttribute("aria-label", `${v} bekleyen teklif`);
    else b.setAttribute("aria-label", `${v} yeni`);
  };
  const setTitle = (t) => { if (!R.fixedTitle) titleEl.textContent = t ?? ""; };
  // İkincil satır (rol başlık düzenine göre tek yer): sanatçı alt satırı · mekan "Ad / {crumb}" · org/admin mono eyebrow
  // ("/" içermiyorsa "ORGANİZATÖR / " | "YÖNETİCİ / " öneki eklenir, TR büyük harf).
  const setSecondary = (c) => {
    if (R.headMode === "breadcrumb") crumbCur.textContent = c ?? "";
    else if (R.headMode === "crumb") crumbEl.textContent = c ? (String(c).includes("/") ? trUpper(c) : `${R.crumbRole} / ${trUpper(c)}`) : "";
    else { subEl.textContent = c ?? ""; subEl.hidden = !c; }
  };
  const setSubtitle = setSecondary;
  const setCrumb = setSecondary;
  const setNotifications = (list) => {
    notifItems = (list || []).map((n) => ({ ...n, custom: true }));
    setBellState(notifItems.some((n) => !n.read));
  };

  // başlangıç değerleri
  setActive(active);
  if (uid) badges.forEach((_, k) => { const c = _badgeCache.get(`${uid}|${role}|${k}`); if (c != null) setBadge(k, c); });
  // "Siteye dön": WebKesfet hazır olunca görünür (ilk panel açılışında bir kez içe aktarılarak öğrenilir, sonra önbellekte)
  if (role !== "admin" && !siteReady) {
    routeReady(SITE).then((ok) => {
      if (!ok || !alive) return;
      siteLink.hidden = false;
      const logo = brand.querySelector(".dk-ps-logo");
      if (logo) { logo.setAttribute("href", SITE); logo.setAttribute("aria-label", "GigBridge ana sayfa"); }
    });
  }
  if (!R.fixedTitle) setTitle(opts.title || "");
  if (R.headMode === "subtitle") setSubtitle(opts.subtitle ?? `Sanatçı Paneli · ${p.displayName || "Sanatçı"}`);
  else if (R.headMode === "breadcrumb") setCrumb(opts.crumb ?? opts.subtitle ?? "Mekan Paneli");
  else setCrumb(opts.crumb ?? (opts.title || ""));

  // canlı okunmamış: zil + Mesajlar rozeti (admin: görünüm setNotifications ile verir)
  if (role !== "admin" && opts.notifications !== "custom" && uid) {
    unsubs.push(subscribeLive(uid, (st) => {
      if (R.bell.mode === "popover") notifItems = st.notifications || [];
      setBellState((st.unreadNotifs || 0) > 0);
      setBadge("mesaj", st.unreadMessages || 0);
    }));
  }

  // Kabuğa ait rozetler (tüm sayfalarda; sanatci §0.1 "always show it on Ana Sayfa when there are pending offers"):
  //   sanatçı → Ana Sayfa = bekleyen teklif sayısı (canlı) · organizatör → Etkinlikler = bekleyen mekan isteği (tek sefer)
  // opts.shellBadges === false → görünüm kendisi yönetir.
  if (uid && opts.shellBadges !== false) {
    if (role === "artist") {
      try { unsubs.push(listenArtistOffers(uid, (list) => setBadge("home", (list || []).length))); } catch (_) {}
    } else if (role === "organizer") {
      let alive = true; unsubs.push(() => { alive = false; });
      organizerRequests(uid).then((l) => { if (alive) setBadge("etkinlik", (l || []).filter((r) => r.status === "pending").length); }).catch(() => {});
    }
  }

  return {
    node, content, main, topbar, aside, search, openSearch,
    setTitle, setSubtitle, setCrumb, setActive, setBadge, setNotifications,
    setBellUnread: (on) => setBellState(!!on),
    get active() { return active; },
    destroy() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
  };
}
