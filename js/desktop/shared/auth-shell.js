// AUTH SHELL — AuthSplit (görsel yan panel + form kolonu). Kaynak: WebGiris/WebKayit/WebDogrula/WebOnayBekleniyor/WebRolSec/
// WebAdminGiris (aside 720 + 1px kenar, main pad 36 64 32, üst satır 40, ortalanmış kolon, yasal nav). Spec: auth §0.3 + §R.
// CSS: css/dk-auth-shell.css. Duyarlı: ≥1280 çizildiği gibi (aside %50) · 1024–1279 aside daralır (main ≥ 560, pad 36 48 32,
// aside iç boşlukları 40, beyan clamp(44px,4.44vw,64px)) · 769–1023 aside gizli, main'in başında AuthBrandRow.
//
// authSplit({ variant, image, eyebrow, statement, features, top: { left, right }, width, gap, children, legal, asideLabel })
//   variant: default (pembe "İSTANBUL · CANLI MÜZİK") | business (amber "MEKANLAR VE ORGANİZATÖRLER İÇİN", WebOnayBekleniyor) |
//            admin (mor, gri tonlu görsel + 160° mor gradyan + 48px ızgara, WebAdminGiris)
//   Dönüş: { node, main, column, setColumn(children), destroy() }
import { h } from "../../ui.js";
import { svgIcon, svgRaw } from "./icons.js";
import { cx, dkLogo } from "./ui.js";
import { AUTH_ASIDE, LEGAL } from "./assets.js";

const STATEMENT_DEFAULT = { text: "Sanatçılar, mekanlar ve müzik severler ", em: "bir arada", tail: "." };
const FEATURES_DEFAULT = [
  { icon: "micAuth", color: "#FF4FA3", text: "Sanatçı profilleri ve portföyler" },
  { icon: "buildingAuth", color: "#FF8A2A", text: "Mekanları keşfet ve etkinlikleri takip et" },
  { icon: "pin", color: "#4ED8FF", text: "Yakınındaki etkinlikleri haritada gör", sw: "1.9" },
];
const VARIANTS = {
  default: { eyebrow: "İSTANBUL · CANLI MÜZİK", color: "#FF4FA3", img: AUTH_ASIDE.login, statement: STATEMENT_DEFAULT, features: FEATURES_DEFAULT, label: "GigBridge tanıtım", role: "customer" },
  business: { eyebrow: "MEKANLAR VE ORGANİZATÖRLER İÇİN", color: "#FF8A2A", img: AUTH_ASIDE.pending, statement: STATEMENT_DEFAULT, features: FEATURES_DEFAULT, label: "GigBridge tanıtım", role: "customer" },
  admin: {
    eyebrow: "YÖNETİCİ ALANI", color: "#A78BFA", img: AUTH_ASIDE.admin, label: "Yönetici alanı", role: "admin",
    statement: { text: "Onay ve ", em: "yönetim", tail: " paneli.", emColor: "#A78BFA" },
    features: [
      { icon: "lockAuth", color: "#A78BFA", text: "Yalnızca yetkili yönetici hesapları giriş yapabilir" },
      { icon: "shieldCheck2", color: "#A78BFA", text: "Her girişte yönetici yetkisi ayrıca doğrulanır" },
      { icon: "logout", color: "#A78BFA", text: "Yetkisi olmayan hesabın oturumu hemen kapatılır" },
    ],
  },
};

export function authAside({ variant = "default", image, eyebrow, eyebrowColor, statement, features, asideLabel, logoHref = "#/kesfet" } = {}) {
  const V = VARIANTS[variant] || VARIANTS.default;
  const img = image || V.img;
  const col = eyebrowColor || V.color;
  const st = statement || V.statement;
  const feats = features || V.features;
  const admin = variant === "admin";
  return h("aside", { "aria-label": asideLabel || V.label, class: cx("dk-auth-aside", `dk-auth-aside-${variant}`) },
    h("img", { class: "dk-auth-img dk-kb", src: img.src, alt: "", decoding: "async" }),
    h("span", { class: "dk-auth-grad", "aria-hidden": "true" }),
    admin ? h("span", { class: "dk-auth-gridov", "aria-hidden": "true" }) : null,
    dkLogo({ href: logoHref, cls: "dk-auth-logo" }),
    h("div", { class: "dk-auth-copy" },
      h("span", { class: "dk-auth-eb", style: { color: col } }, h("span", { class: "dk-auth-ebline", style: { background: col } }), eyebrow || V.eyebrow),
      h("p", { class: "dk-auth-stmt" }, st.text || "", st.em ? h("em", { style: { color: st.emColor || (variant === "admin" ? "#A78BFA" : "#FF4FA3") } }, st.em) : null, st.tail || ""),
      h("ul", { class: "dk-auth-feats" }, ...feats.map((f) => h("li", {},
        h("span", { class: "dk-auth-ftile", style: { color: f.color, borderColor: admin ? "rgba(167,139,250,0.3)" : null } }, svgIcon(f.icon, { size: 17, sw: f.sw || "1.9" })),
        f.text)))));
}

// Yasal nav (auth): default "Gizlilik Politikası · Kullanım Koşulları · Hesap Silme" | reset ("© GigBridge · Gizlilik Politikası · Kullanım Koşulları")
export function authLegal(kind = "default") {
  const sep = () => h("span", { "aria-hidden": "true" }, "·");
  const items = kind === "reset"
    ? [h("span", {}, "© GigBridge"), sep(), h("a", { href: LEGAL.privacy, class: "dk-link" }, "Gizlilik Politikası"), sep(), h("a", { href: LEGAL.terms, class: "dk-link" }, "Kullanım Koşulları")]
    : [h("a", { href: LEGAL.privacy, class: "dk-link" }, "Gizlilik Politikası"), sep(), h("a", { href: LEGAL.terms, class: "dk-link" }, "Kullanım Koşulları"), sep(), h("a", { href: LEGAL.deleteAccount, class: "dk-link" }, "Hesap Silme")];
  return h("nav", { "aria-label": "Yasal", class: "dk-auth-legal" }, ...items);
}

export function authSplit(opts = {}) {
  const { variant = "default", top = {}, width = 400, gap = 22, children = [], legal = "default", rise = true, logoHref = "#/kesfet" } = opts;
  const V = VARIANTS[variant] || VARIANTS.default;
  const column = h("div", { class: cx("dk-auth-col", rise && "dk-rise"), style: { width: `min(${width}px, 100%)`, gap: gap + "px" } }, ...[].concat(children).filter(Boolean));
  const main = h("main", { class: "dk-auth-main", id: "dk-main" },
    h("div", { class: "dk-auth-brand" }, dkLogo({ href: logoHref })),
    h("div", { class: "dk-auth-top" }, top.left || h("span"), top.right || h("span")),
    h("div", { class: "dk-auth-center" }, column),
    legal ? authLegal(legal) : null);
  const node = h("div", { class: cx("dk", "dk-auth", `dk-auth-${variant}`), dataset: { role: opts.role || V.role, area: "auth" } },
    authAside({ ...opts, variant, logoHref }), main);
  return {
    node, main, column,
    setColumn(kids) { column.replaceChildren(...[].concat(kids).filter(Boolean)); },
    destroy() {},
  };
}

// ── Auth atomları (6 artboard'da ortak) ──
// Üst satır bağlantısı (.gb-link 14/500 gap 8, ikon 16 stroke 2): chevron-left "Geri"/"Keşfet'e dön" ya da logout "Çıkış yap"
export function authTopLink(label, { href = "#/kesfet", icon = "chevronLeft", onClick } = {}) {
  const ico = icon === "logout" ? svgRaw('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"></path>', { size: 16, sw: "2" }) : svgIcon(icon, { size: 16, sw: "2" });
  const a = h(onClick && !href ? "button" : "a", { href, type: onClick && !href ? "button" : null, class: "dk-auth-toplink dk-link" }, ico, label);
  if (onClick) a.addEventListener("click", (e) => { e.preventDefault(); onClick(e); });
  return a;
}
// Rol etiketi / YÖNETİCİ rozeti (h28 pad 0 10 r4, border c@.45, mono 10.5/700/.14em, ops. kilit 12)
export function authTag(label, { color = "#A78BFA", border, lock = false } = {}) {
  return h("span", { class: "dk-auth-tag", style: { color, borderColor: border || color + "73" } },
    lock ? svgIcon("lockAuth", { size: 12, sw: "2.2" }) : null, label);
}
// Başlık: ops. eyebrow (mono 10.5/.16em) + serif h1 (48–52) + <em> + lead 15.5/1.5 #A3A7AF
export function authHeading({ eyebrow, title, em, tail, emColor, lead, size = 52, gap = 10 } = {}) {
  return h("div", { class: "dk-auth-head", style: { gap: gap + "px" } },
    eyebrow ? h("span", { class: "dk-auth-heb" }, eyebrow) : null,
    h("h1", { class: "dk-display", style: { fontSize: size + "px" } }, title || "", em ? h("em", { style: emColor ? { color: emColor } : null }, em) : null, tail || ""),
    lead ? h("p", { class: "dk-auth-lead" }, lead) : null);
}
// IconBadge (56–64 kare r14 ya da daire; tinted kenar/zemin; ops. tarama efekti — AdminGiris)
export function authIconBadge({ icon = "shieldCheck2", color = "#A78BFA", size = 60, iconSize = 28, round = false, scan = false } = {}) {
  return h("span", { class: "dk-auth-ibadge", style: { width: size + "px", height: size + "px", borderRadius: round ? "50%" : "14px", color, borderColor: color + "73", background: color + "1A" } },
    scan ? h("span", { class: "dk-auth-scan", "aria-hidden": "true" }) : null,
    svgIcon(icon, { size: iconSize, sw: "1.8" }));
}
// Google düğmesi (outline 48, 4 renkli G 18)
export function authGoogleButton(label = "Google ile giriş", onClick) {
  const g = svgRaw('<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"></path><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"></path><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"></path><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"></path>', { size: 18, attrs: { fill: "none", stroke: "none" } });
  g.removeAttribute("stroke");
  return h("button", { type: "button", class: "dk-btn dk-press dk-btn-outline dk-btn-48 dk-btn-full dk-auth-google", onclick: onClick }, g, h("span", { class: "dk-btn-l" }, label));
}
// Not kutusu (AdminGiris): pad 12 14 r8 border #1F232B bg #0A0B0F 13/1.5 #8A8E97 + ikon 16
export function authNote(children, { icon = "lockAuth", color = "#A78BFA" } = {}) {
  return h("div", { class: "dk-auth-note" }, svgIcon(icon, { size: 16, sw: "2", color }), h("span", {}, ...[].concat(children)));
}
