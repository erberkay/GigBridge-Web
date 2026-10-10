// PUBLIC SHELL — PublicHeader + PublicFooter (tam) + AccountFooter (kompakt) + publicShell() sarmalayıcı.
// Kaynak: WebKesfet (header/footer, misafir), WebProfil/WebBildirimler (girişli dinleyici header + kompakt footer),
// WebMesajlar (Mesajlar ikonu aktif varyantı). Spec: public-a §0.3/0.4, public-b "PublicHeader", hesap §0.1/0.4.
// CSS: css/dk-public-shell.css. Sahibi: foundation adım 2 — uygulayıcılar değiştirmez (bkz. specs/foundation.md §9).
//
// Oturuma göre 3 varyant (artboard'un sabit hali değil, gerçek oturum):
//   guest    → şehir + "Giriş yap" (giriş modalı) + "Hesap oluştur" (#/register)
//   customer → şehir + Mesajlar + Bildirimler (canlı okunmamış noktaları) + avatar (#/profil)
//   panel    → (masaüstünde herkese açık sayfadaki sanatçı/mekan/organizatör) şehir + "Panelime dön" (homeRouteFor)
// Yapışkan (sticky top 0, z 50, backdrop blur 12). 769–1023: nav hamburger menüsüne geçer (başlık altında açılır panel).
import { h } from "../../ui.js";
import { session, homeRouteFor } from "../../store.js";
import { svgIcon, svgRaw } from "./icons.js";
import { dkLogo, dkAvatar, cx } from "./ui.js";
import { cityButton } from "./city-picker.js";
import { openLogin } from "./overlays.js";
import { subscribeLive } from "./live.js";
import { ROLE_LABELS, roleColor, rgba } from "./helpers.js";
import { LEGAL, DOWNLOAD_PAGE, PAYMENT_NOTE } from "./assets.js";

export const PUBLIC_NAV = [
  ["kesfet", "Keşfet", "#/kesfet"],
  ["etkinlikler", "Etkinlikler", "#/etkinlikler"],
  ["harita", "Harita", "#/harita"],
  ["akis", "Akış", "#/akis"],
  ["top10", "Top 10", "#/top10"],
];

// Oturum → header varyantı
export function headerVariant(s = session) {
  if (!s?.user || s.guest) return "guest";
  if (s.isAdmin) return "panel";
  const home = homeRouteFor(s.profile);
  if (home === "#/kesfet") return "customer";
  if (home === "#/artist" || home === "#/venue" || home === "#/organizer") return "panel";
  return "guest";
}

// ══════════════════════════════════════════════════════════════════════
// PublicHeader
//   opts: { active: "kesfet"|"etkinlikler"|"harita"|"akis"|"top10"|null, activeIcon: "mesajlar"|"bildirimler"|null,
//           logoHref ("#/kesfet"; Landing "#/"), cityCounts ({ "İstanbul": 12, … }), onCity(city), session }
//   Dönüş: { node, setActive(key), setCity(c), setCityCounts(map), destroy() }
// ══════════════════════════════════════════════════════════════════════
export function publicHeader(opts = {}) {
  const s = opts.session || session;
  const variant = opts.variant || headerVariant(s);
  const unsubs = [];
  let setUnread = () => {};

  // ── nav ──
  const links = new Map();
  const mkNav = (inMenu) => h("nav", { "aria-label": inMenu ? "Ana menü (mobil)" : "Ana menü", class: inMenu ? "dk-hd-mnav" : "dk-hd-nav" },
    ...PUBLIC_NAV.map(([k, label, href]) => {
      const a = h("a", { href, class: inMenu ? "dk-hd-mlink" : "dk-hd-link dk-link", dataset: { key: k } }, label,
        inMenu ? null : h("span", { class: "dk-hd-bar dk-prism", "aria-hidden": "true" }));
      if (!inMenu) links.set(k, a); else links.set(k + ":m", a);
      return a;
    }));
  const nav = mkNav(false);
  const setActive = (key) => {
    links.forEach((a, k) => {
      const on = k.split(":")[0] === key;
      a.classList.toggle("is-on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  };

  // ── hamburger (769–1023) ──
  const menuPanel = h("div", { class: "dk-hd-menu", hidden: true, id: "dk-hd-menu" }, mkNav(true));
  const burger = h("button", { type: "button", class: "dk-hd-burger dk-press", "aria-label": "Menüyü aç", "aria-expanded": "false", "aria-controls": "dk-hd-menu" }, svgIcon("menu", { size: 18 }));
  const setMenu = (open) => {
    menuPanel.hidden = !open;
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Menüyü kapat" : "Menüyü aç");
    burger.replaceChildren(svgIcon(open ? "x" : "menu", { size: 18 }));
  };
  burger.addEventListener("click", () => setMenu(menuPanel.hidden));
  menuPanel.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  const onDocKey = (e) => { if (e.key === "Escape" && !menuPanel.hidden) { setMenu(false); burger.focus(); } };
  document.addEventListener("keydown", onDocKey);
  unsubs.push(() => document.removeEventListener("keydown", onDocKey));

  // ── sağ küme ──
  const city = cityButton({ counts: opts.cityCounts || null, onPick: opts.onCity });
  unsubs.push(() => city.destroy());
  const right = h("div", { class: "dk-hd-right" }, city.node);

  if (variant === "guest") {
    const login = h("a", { href: "#/login", class: "dk-hd-login dk-press" }, "Giriş yap");
    login.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openLogin(); });
    right.append(login, h("a", { href: "#/register", class: "dk-hd-reg dk-press" }, "Hesap oluştur"));
  } else if (variant === "customer") {
    const p = s.profile || {};
    const name = p.displayName || s.user?.displayName || "Hesabım";
    const msgActive = opts.activeIcon === "mesajlar";
    const msgBadge = h("span", { class: "dk-hd-badge", hidden: true });
    const msgDot = h("span", { class: "dk-hd-dot", hidden: true });
    const msg = h("a", { href: "#/mesajlar", class: cx("dk-hd-ic", "dk-press", msgActive && "is-active"), "aria-label": "Mesajlar", "aria-current": msgActive ? "page" : null },
      msgActive
        ? svgRaw('<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"></path>', { size: 19, sw: "1.9" })
        : svgIcon("chat", { size: 18, sw: "1.8" }),
      msgActive ? msgBadge : msgDot,
      msgActive ? h("span", { class: "dk-hd-icbar dk-prism", "aria-hidden": "true" }) : null);
    const bellActive = opts.activeIcon === "bildirimler";
    const bellDot = h("span", { class: "dk-hd-dot", hidden: true });
    const bell = h("a", { href: "#/bildirimler", class: cx("dk-hd-ic", "dk-press", bellActive && "is-active", msgActive && "is-muted"), "aria-label": "Bildirimler", "aria-current": bellActive ? "page" : null },
      msgActive ? svgIcon("bellArtist", { size: 19, sw: "1.9" }) : svgIcon("bell", { size: 18, sw: "1.8" }), bellDot,
      bellActive ? h("span", { class: "dk-hd-icbar dk-prism", "aria-hidden": "true" }) : null);
    const av = h("a", { href: "#/profil", class: "dk-hd-av dk-press", "aria-label": `Hesabım: ${name}` },
      dkAvatar({ name, photo: p.photoURL, size: 40, type: "customer", border: false }));
    right.append(msg, bell, av);
    setUnread = ({ notifs = 0, messages = 0 } = {}) => {
      bellDot.hidden = !notifs;
      bell.setAttribute("aria-label", notifs ? `Bildirimler, ${notifs} okunmamış` : "Bildirimler");
      if (msgActive) { msgBadge.hidden = !messages; msgBadge.textContent = messages > 99 ? "99+" : String(messages); }
      else msgDot.hidden = !messages;
      msg.setAttribute("aria-label", messages ? `Mesajlar, ${messages} okunmamış` : "Mesajlar");
    };
    const uid = s.user?.uid;
    unsubs.push(subscribeLive(uid, (st) => setUnread({ notifs: st.unreadNotifs || 0, messages: st.unreadMessages || 0 })));
  } else {
    // panel rolü: "Panelime dön"
    const t = s.profile?.userType || (s.isAdmin ? "admin" : "artist");
    const href = s.isAdmin ? "#/admin" : homeRouteFor(s.profile);
    const c = roleColor(t);
    right.append(h("a", { href, class: "dk-hd-back dk-press", style: { "--dk-hd-role": c, "--dk-hd-role-bd": rgba(c, 0.5), "--dk-hd-role-bg": rgba(c, 0.08) },
      "aria-label": `Panelime dön (${ROLE_LABELS[t] || "Panel"})` },
    svgIcon("arrowLeft", { size: 16, color: c }), h("span", {}, "Panelime dön")));
  }

  const node = h("header", { class: cx("dk-hd", `dk-hd-v-${variant}`), dataset: { variant } },
    h("div", { class: "dk-hd-in" },
      dkLogo({ href: opts.logoHref || "#/kesfet" }),
      burger, nav, right),
    menuPanel);
  setActive(opts.active || null);
  return {
    node, variant, setActive,
    setUnread: (o) => setUnread(o),   // { notifs, messages } — canlı dinleyici zaten çağırır; test/demo için de açık
    setCity: (c) => city.setCity(c),
    setCityCounts: (m) => city.setCounts(m),
    destroy() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
  };
}

// ══════════════════════════════════════════════════════════════════════
// PublicFooter (tam; WebKesfet 511–547) — KEŞFET / KATIL / YASAL kolonları + SEO iç bağlantıları (/indir/, /rehber/canli-muzik/)
// ══════════════════════════════════════════════════════════════════════
export function publicFooter({ seo = true } = {}) {
  const col = (title, aria, items) => h("nav", { "aria-label": aria, class: "dk-ft-col" },
    h("span", { class: "dk-ft-h" }, title),
    ...items.map(([label, href]) => h("a", { href, class: "dk-link" }, label)));
  const year = new Date().getFullYear();
  return h("footer", { class: "dk-ft" },
    h("div", { class: "dk-ft-in" },
      h("div", { class: "dk-ft-grid" },
        h("div", { class: "dk-ft-brand" },
          dkLogo({ href: null, size: 30 }),
          h("p", {}, "Dinleyicileri, sanatçıları ve mekanları canlı müzikte buluşturan platform.")),
        col("KEŞFET", "Keşfet", [["Etkinlikler", "#/etkinlikler"], ["Mekanlar", "#/kesfet?kategori=mekanlar"], ["Sanatçılar", "#/kesfet?kategori=sanatcilar"], ["Harita", "#/harita"],
          ...(seo ? [["Canlı müzik rehberi", "rehber/canli-muzik/"]] : [])]),
        col("KATIL", "Katıl", [["Sanatçı ol", "#/register?rol=artist"], ["Mekan ekle", "#/register?rol=venue"], ["Organizatör ol", "#/register?rol=organizer"], ["Giriş yap", "#/login"],
          ...(seo ? [["Uygulamayı indir", DOWNLOAD_PAGE.replace(/^\//, "")]] : [])]),
        col("YASAL", "Yasal", [["Gizlilik Politikası", LEGAL.privacy], ["Kullanım Koşulları", LEGAL.terms], ["Mesafeli Hizmet Sözleşmesi", LEGAL.distanceContract],
          ["İptal ve İade", LEGAL.refund], ["Teslimat ve İfa", LEGAL.delivery], ["Hesap Silme", LEGAL.deleteAccount], ["Hakkımızda", LEGAL.about], ["İletişim", LEGAL.contact]])),
      h("div", { class: "dk-ft-bottom" }, h("span", {}, `© ${year} GigBridge`), h("span", {}, PAYMENT_NOTE), h("span", {}, "gigbridges.com"))));
}

// AccountFooter (kompakt; WebProfil 319–327): h64, "© yıl GigBridge" + Yasal nav (Gizlilik · Kullanım koşulları · KVKK) + gigbridges.com
// KVKK aydınlatma metninin ayrı sayfası yok → gizlilik.html#kvkk (açık konu). SEO: /indir/ + /rehber/canli-muzik/ eklendi.
export function accountFooter({ seo = true } = {}) {
  const year = new Date().getFullYear();
  return h("footer", { class: "dk-aft" },
    h("div", { class: "dk-aft-in" },
      h("span", {}, `© ${year} GigBridge`),
      h("nav", { "aria-label": "Yasal", class: "dk-aft-nav" },
        h("a", { href: LEGAL.privacy, class: "dk-link" }, "Gizlilik"),
        h("a", { href: LEGAL.terms, class: "dk-link" }, "Kullanım koşulları"),
        h("a", { href: LEGAL.privacy + "#kvkk", class: "dk-link" }, "KVKK aydınlatma metni"),
        h("a", { href: LEGAL.distanceContract, class: "dk-link" }, "Mesafeli hizmet sözleşmesi"),
        h("a", { href: LEGAL.refund, class: "dk-link" }, "İptal ve iade"),
        h("a", { href: LEGAL.delivery, class: "dk-link" }, "Teslimat ve ifa"),
        h("a", { href: LEGAL.about, class: "dk-link" }, "Hakkımızda"),
        h("a", { href: LEGAL.contact, class: "dk-link" }, "İletişim"),
        seo ? h("a", { href: "rehber/canli-muzik/", class: "dk-link" }, "Canlı müzik rehberi") : null,
        seo ? h("a", { href: DOWNLOAD_PAGE.replace(/^\//, ""), class: "dk-link" }, "Uygulamayı indir") : null,
        h("span", {}, PAYMENT_NOTE),
        h("span", {}, "gigbridges.com"))));
}

// ══════════════════════════════════════════════════════════════════════
// publicShell — .dk kökü + header + <main> + footer. Görünümler içeriği `main`'e ekler.
//   opts: header opts + { footer: "full" | "compact" | false, mainClass, role = "customer", area = "public", fullHeight }
//   Dönüş: { node, main, header, destroy() }
// ══════════════════════════════════════════════════════════════════════
export function publicShell(opts = {}) {
  const header = publicHeader(opts);
  const main = h("main", { class: cx("dk-pub-main", opts.mainClass), id: "dk-main", tabindex: "-1" });
  const footer = opts.footer === false ? null : opts.footer === "compact" ? accountFooter(opts) : publicFooter(opts);
  const node = h("div", { class: cx("dk", "dk-pub", opts.fullHeight && "dk-pub-full"), dataset: { role: opts.role || "customer", area: opts.area || "public" } },
    h("a", { href: "#dk-main", class: "dk-skip", onclick: (e) => { e.preventDefault(); main.focus(); } }, "İçeriğe geç"),
    header.node, main, footer);
  return { node, main, header, destroy() { header.destroy(); } };
}
