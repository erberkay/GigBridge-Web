// ACCOUNT SHELL — Hesabım düzeni: PublicHeader + AccountLayout (264px yapışkan kenar menüsü + içerik) + kompakt footer.
// Kaynak: WebProfil 86–124 (7 artboard'da birebir aynı; yalnız aktif öğe/sayaç değişir). Spec: hesap §0.2/0.3.
// CSS: css/dk-public-shell.css + css/dk-account-shell.css. 769–1023: kenar menüsü yatay kaydırmalı sekme şeridine döner (AccountTabs).
//
// accountShell({ active, ctx, contentGap }) → { node, content, header, setCount(key, n), refreshCounts(force), destroy() }
//   active: profil | biletlerim | takip | favoriler | katildiklarim | yorumlarim | bildirimler | mesajlar
//   Sayaçlar: live.accountCounts(uid) (önbellekli) + canlı okunmamış bildirim (pembe hap) / mesaj.
//   Görünüm yazdıktan sonra: invalidateAccountCounts(uid) + shell.refreshCounts(true) ya da shell.setCount(key, n).
import { h } from "../../ui.js";
import { session, logout } from "../../store.js";
import { svgIcon } from "./icons.js";
import { cx, dkAvatar, dkPageHead, dkConfirm } from "./ui.js";
import { publicHeader, accountFooter } from "./public-shell.js";
import { accountCounts, subscribeLive } from "./live.js";

export { dkPageHead as pageHead } from "./ui.js";

// [anahtar, etiket, rota, ikon, ikon ayarı, sayaç anahtarı]
export const ACCOUNT_NAV = [
  ["profil", "Profil", "#/profil", "user", {}, null],
  ["biletlerim", "Biletlerim", "#/biletlerim", "ticket", {}, "tickets"],
  ["takip", "Takip ettiklerim", "#/takip", "users2", {}, "following"],
  ["favoriler", "Favorilerim", "#/favoriler", "heart", {}, "favorites"],
  ["katildiklarim", "Katıldıklarım", "#/katildiklarim", "calendarCheck", {}, "attended"],
  ["yorumlarim", "Yorumlarım", "#/yorumlarim", "star", { stroke: true, sw: "1.8" }, "reviews"],
  ["bildirimler", "Bildirimler", "#/bildirimler", "bell", {}, "unreadNotifs"],
  ["mesajlar", "Mesajlar", "#/mesajlar", "chat", {}, "unreadMessages"],
];
const ALERT = new Set(["unreadNotifs", "unreadMessages"]); // pembe "uyarı" hap varyantı; 0 → gizli

export function accountShell(opts = {}) {
  const { active = "profil", contentGap = 28 } = opts;
  const s = opts.session || session;
  const guest = !s.user || s.guest;
  const p = s.profile || {};
  const name = guest ? "Misafir" : p.displayName || s.user?.displayName || "Hesabım";
  const unsubs = [];

  // Header'da aktif ikon varyantı YALNIZ Mesajlar'da (WebMesajlar). WebBildirimler dahil diğer hesap sayfalarında zil normal
  // (#1F232B/#0E1014, nokta 7/8); tek aktif gösterge kenar menüsü öğesi.
  const header = publicHeader({ ...opts, active: null, activeIcon: active === "mesajlar" ? "mesajlar" : null });
  unsubs.push(() => header.destroy());

  // ── kimlik bloğu ──
  const ident = h("div", { class: "dk-acc-id" },
    dkAvatar({ name, photo: guest ? null : p.photoURL, size: 56, type: "customer", border: true, alt: guest ? "" : name }),
    h("div", { class: "dk-acc-idcol" },
      h("span", { class: "dk-acc-name" }, name),
      h("span", { class: "dk-acc-chip" }, guest ? "MİSAFİR" : "DİNLEYİCİ")));

  // ── menü ──
  const pills = new Map();
  const items = ACCOUNT_NAV.map(([key, label, href, icon, io, ck]) => {
    const on = key === active;
    const pill = ck && !guest ? h("span", { class: cx("dk-acc-pill", ALERT.has(ck) && "is-alert"), hidden: true }) : null;
    if (pill) pills.set(ck, pill);
    return h("a", { href, class: cx("dk-acc-item", "dk-side", on && "is-on"), "aria-current": on ? "page" : null, dataset: { key } },
      on ? h("span", { class: "dk-acc-bar", "aria-hidden": "true" }) : null,
      svgIcon(icon, { size: 18, sw: "1.8", ...io, color: on ? "#4ED8FF" : "currentColor" }),
      h("span", { class: "dk-acc-lbl" }, label), pill);
  });
  const exit = guest
    ? h("a", { href: "#/login", class: "dk-acc-item dk-side" }, svgIcon("login", { size: 18, color: "#4ED8FF" }), h("span", { class: "dk-acc-lbl" }, "Giriş yap"))
    : h("button", { type: "button", class: "dk-acc-item dk-side dk-acc-exit" }, svgIcon("login", { size: 18, color: "#FF5A6E" }), h("span", { class: "dk-acc-lbl" }, "Çıkış yap"));
  if (!guest) exit.addEventListener("click", async () => {
    const ok = await dkConfirm({ title: "Çıkış", body: "Hesabınızdan çıkmak istediğinize emin misiniz?", confirmLabel: "Çıkış Yap", danger: true });
    if (ok) logout();
  });
  const nav = h("nav", { "aria-label": "Hesabım", class: "dk-acc-nav" }, ...items, h("span", { class: "dk-acc-div", "aria-hidden": "true" }), exit);
  const aside = h("aside", { "aria-label": "Hesap menüsü", class: "dk-acc-side" }, ident, nav);

  // "İçeriğe geç" ve router'ın odak taşıması (#dk-main) içerik kolonuna gider → kenar menüsü atlanır
  const content = h("div", { class: "dk-acc-content", id: "dk-main", tabindex: "-1", style: { gap: contentGap + "px" } });
  const main = h("main", { class: "dk-acc-main" }, aside, content);
  const node = h("div", { class: "dk dk-pub dk-acc", dataset: { role: "customer", area: "account" } },
    h("a", { href: "#dk-main", class: "dk-skip", onclick: (e) => { e.preventDefault(); content.focus(); } }, "İçeriğe geç"),
    header.node, main, accountFooter(opts));

  // ── sayaçlar ──
  const setCount = (key, n) => {
    const pill = pills.get(key);
    if (!pill) return;
    const v = Number(n) || 0;
    pill.textContent = v > 99 ? "99+" : String(v);
    pill.hidden = ALERT.has(key) ? v <= 0 : n == null;
  };
  const uid = guest ? null : s.user?.uid;
  let alive = true;
  const refreshCounts = (force = false) => {
    if (!uid) return Promise.resolve(null);
    return accountCounts(uid, { force }).then((c) => {
      if (!alive || !c) return c;
      ["tickets", "following", "favorites", "attended", "reviews"].forEach((k) => setCount(k, c[k]));
      return c;
    }).catch(() => null);
  };
  refreshCounts();
  if (uid) unsubs.push(subscribeLive(uid, (st) => { setCount("unreadNotifs", st.unreadNotifs); setCount("unreadMessages", st.unreadMessages); }));

  // aktif öğeyi yatay şeritte görünür tut (769–1023)
  requestAnimationFrame(() => { const a = nav.querySelector(".is-on"); if (a && nav.scrollWidth > nav.clientWidth) a.scrollIntoView({ block: "nearest", inline: "center" }); });

  return {
    node, content, header, aside, setCount, refreshCounts,
    destroy() { alive = false; unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
  };
}
