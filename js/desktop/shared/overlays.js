// ÜST KATMANLAR — Modal / Confirm / Drawer / Toast / Popover / LoginGate. CSS: css/dk-ui.css (§ÜST KATMANLAR).
// Hepsi body düzeyindeki TEK portal kökünde (div.dk.dk-portal) çizilir → .dk nötrlemesi + token'lar geçerli,
// legacy #modal-root/#toasts'a dokunulmaz. Portal, açılışta mount'lu görünümün data-role/data-area'sını kopyalar
// (rol rengi, odak kenarı, toast konumu kabuğa göre).
// Erişilebilirlik: aria-modal, odak tuzağı + ESC (belge düzeyinde, en üstteki katmana — odak diyalog dışına/gövdeye düşse de
// çalışır), modal/çekmece açıkken #app `inert` (arka sayfa odaklanamaz), kapanınca odağı tetikleyiciye geri verme, arka plan
// kaydırma kilidi, toast metni kalıcı canlı bölgelerden (polite/assertive) duyurulur.
// Rota (base) değişince açık modal/çekmece/popover kendiliğinden kapanır (toast'lar kalır). Router'ın "dk:teardown" olayı:
// mod geçişi (≤768↔≥769) / kimlik değişimi → hepsi (+ toast) kapanır ve kaydırma kilidi kalkar; diğer yeniden kurulumlar →
// popover'lar kapanır (tetikleyicileri eski görünümle gitti).
import { h } from "../../ui.js";
import { svgIcon, svgRaw } from "./icons.js";
import { session } from "../../store.js";

const cx = (...c) => c.flat().filter(Boolean).join(" ");
const baseOf = (hash = location.hash) => (hash || "#/").split("?")[0];

// ── portal ──
let _portal = null;
const _live = { polite: null, assertive: null };
let _liveT = null;
function announce(text, assertive = false) {
  portalRoot();
  const el = assertive ? _live.assertive : _live.polite;
  if (!el) return;
  el.textContent = "";
  clearTimeout(_liveT);
  _liveT = setTimeout(() => { el.textContent = String(text || ""); }, 60); // boşalt → yaz: aynı metin tekrar duyurulsun
}
export function portalRoot() {
  if (!_portal || !_portal.isConnected) {
    // satır içi stil: dk-ui.css yüklenmemiş olsa bile (.dk'nin min-height:100vh / zemin kuralları) sayfaya blok eklemesin
    _portal = h("div", { class: "dk dk-portal", style: { position: "static", minHeight: "0", background: "none" } });
    // Toast duyuruları: kalıcı (DOM'a baştan eklenmiş) canlı bölgeler — sonradan eklenen role=status öğeleri çoğu ekran
    // okuyucuda duyurulmuyor. Görsel toast'lar rol taşımaz; metin buraya yazılır.
    // satır içi görsel gizleme: dk-base.css (.dk-sr) yüklenmemiş olsa da görünmesin
    const SR = { position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", border: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
    _live.polite = h("span", { class: "dk-sr", role: "status", "aria-live": "polite", "aria-atomic": "true", style: SR });
    _live.assertive = h("span", { class: "dk-sr", role: "alert", "aria-live": "assertive", "aria-atomic": "true", style: SR });
    _portal.append(_live.polite, _live.assertive);
    document.body.append(_portal);
  }
  const root = document.querySelector("#app > .dk");
  if (root) {
    if (root.dataset.role) _portal.dataset.role = root.dataset.role; else delete _portal.dataset.role;
    if (root.dataset.area) _portal.dataset.area = root.dataset.area; else delete _portal.dataset.area;
  }
  return _portal;
}

// ── kaydırma kilidi (iç içe sayaçlı) ──
let _lock = 0, _saved = null;
function lockScroll() {
  if (_lock++ > 0) return;
  const de = document.documentElement;
  const sbw = window.innerWidth - de.clientWidth;
  _saved = { o: de.style.overflow, p: document.body.style.paddingRight };
  de.style.overflow = "hidden";
  if (sbw > 0) document.body.style.paddingRight = sbw + "px";
}
function unlockScroll() {
  if (--_lock > 0) return;
  _lock = 0;
  const de = document.documentElement;
  if (_saved) { de.style.overflow = _saved.o; document.body.style.paddingRight = _saved.p; }
  _saved = null;
}
// Emniyet: hiçbir modal/çekmece açık değilse kilit sayacını sıfırla ve kaydırmayı geri ver.
function forceUnlockScroll() {
  if ([..._open].some((o) => o.kind === "modal" || o.kind === "drawer")) return;
  if (_lock > 0) { _lock = 1; unlockScroll(); }
}

// ── odak tuzağı ──
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function focusables(root) { return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement); }
function trap(e, root) {
  if (e.key !== "Tab") return;
  const f = focusables(root);
  if (!f.length) { e.preventDefault(); try { root.focus({ preventScroll: true }); } catch (_) {} return; }
  const first = f[0], last = f[f.length - 1];
  const ae = document.activeElement;
  const inside = root.contains(ae) && ae !== root;
  if (e.shiftKey && (ae === first || !inside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (ae === last || !inside)) { e.preventDefault(); first.focus(); }
}

// ── açık katman kaydı (açılış sırasıyla → sonuncusu en üstte): rota değişince kapat ──
// rec = { kind: "modal"|"drawer"|"popover", close(reason), esc(), trapRoot?, node?, base, persist }
const _open = new Set();
export function closeAllOverlays() { [..._open].forEach((o) => o.close("route")); }
window.addEventListener("hashchange", () => {
  const b = baseOf();
  [..._open].forEach((o) => { if (o.base !== b && !o.persist) o.close("route"); });
});
const topOverlay = () => { let t = null; _open.forEach((o) => { t = o; }); return t; };
const topTrap = () => { let t = null; _open.forEach((o) => { if (o.trapRoot) t = o; }); return t; };
// Belge düzeyi (yakalama evresi) klavye: ESC en üstteki katmanı kapatır; Tab en üstteki modal/çekmecede tutulur —
// odak diyalogdaki odaklanamaz bir metne tıklanıp gövdeye düşse bile.
document.addEventListener("keydown", (e) => {
  if (!_open.size || e.defaultPrevented) return;
  if (e.key === "Escape") {
    const t = topOverlay(); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    t.esc();
    return;
  }
  if (e.key === "Tab") {
    const t = topTrap(); if (!t) return;
    const top = topOverlay();
    // üstte bir popover açıksa ve odak onun içindeyse doğal Tab akışı (popover kendi içeriğinde)
    if (top && top !== t && top.node?.contains(document.activeElement)) return;
    trap(e, t.trapRoot);
  }
}, true);
// Modal/çekmece açıkken arka sayfa (#app) etkileşimsiz + odaklanamaz. Legacy #modal-root/#toasts etkilenmez.
function syncInert() {
  const app = document.getElementById("app");
  if (!app) return;
  const on = [..._open].some((o) => o.kind === "modal" || o.kind === "drawer");
  if (on) app.setAttribute("inert", ""); else app.removeAttribute("inert");
}
function register(rec) { _open.add(rec); syncInert(); }
function unregister(rec) { _open.delete(rec); syncInert(); }
// Router teardown (js/app.js destroyView): mod geçişi / kimlik değişimi → her şey; diğer yeniden kurulumlar → popover'lar.
window.addEventListener("dk:teardown", (e) => {
  const reason = e.detail?.reason;
  if (reason === "mode" || reason === "identity") {
    [..._open].forEach((o) => o.close(reason));
    try { _toast?.close(); } catch (_) {}
    forceUnlockScroll();
  } else {
    [..._open].forEach((o) => { if (o.kind === "popover") o.close("teardown"); });
  }
});

const closeBtn = (onClick, { size = 40, icon = 16, cls } = {}) =>
  h("button", { type: "button", class: cx("dk-mdl-x", "dk-press", cls), "aria-label": "Kapat", style: { width: size + "px", height: size + "px" }, onclick: onClick }, svgIcon("x", { size: icon }));

// Aksiyon düğmesi (modal/drawer altı) — dkButton'a bağımlılık döngüsü olmasın diye yerel küçük üretici
function actionBtn(a, closeFn) {
  const variant = a.variant || "primary";
  const b = h("button", { type: a.type || "button", class: cx("dk-btn", "dk-press", `dk-btn-${variant}`, `dk-btn-${a.size || 44}`), disabled: !!a.disabled, style: a.color ? { "--dk-btn-c": a.color } : null },
    a.icon ? (a.icon instanceof Node ? a.icon : svgIcon(a.icon, { size: 16 })) : null, h("span", { class: "dk-btn-l" }, a.label));
  b.addEventListener("click", async () => {
    if (!a.onClick) { closeFn("action"); return; }
    if (a.busyLabel) { b.disabled = true; b.querySelector(".dk-btn-l").textContent = a.busyLabel; }
    try {
      const r = await a.onClick(closeFn, b);
      if (!a.keepOpen && r !== false) closeFn("action");
    } finally {
      if (b.isConnected) { b.disabled = !!a.disabled; if (a.busyLabel) b.querySelector(".dk-btn-l").textContent = a.label; }
    }
  });
  return b;
}

// ══════════════════════════════════════════════════════════════════════
// MODAL
//  variant:
//   account (varsayılan; hesap §0.5): overlay rgba(6,7,10,.78)+blur(10px), üste hizalı (padding-top 180), kutu pad 28 r12
//            border #1F232B bg #0E1014 gap 18, başlık 22/600/-0.02em, kapat 40×40 #1F232B, giriş gbModal 320ms
//   panel   (mekan §0.7 / public-b ReviewModal): overlay .72 (blur yok), padding-top min(200px,12vh), kutu pad 28 r14
//            border #2C303A bg #0E1014 gap 18, başlık 20/600, kapat 36×36 #2C303A, gbPop
//   form    (org-admin F5): kutu r14 border #1F232B bg #0A0B0F; başlık şeridi 72 (pad 0 24, alt çizgi), gövde pad 20 24 gap 16,
//            alt şerit pad 16 24 (satır içi hata + düğmeler), kapat 40×40 x18
//   confirm (org ConfirmDialog): overlay .7 ortalı, kutu 440 r12 #0A0B0F pad 24 gap 14, h3 19/600 + p 14/1.55
//  align: "top" | "center"; size: genişlik px (420/440/460/480/540/560…)
//  actions: [{ label, variant, icon, onClick(close, btn) → false ise kapanmaz, keepOpen, busyLabel, disabled }]
//  Dönüş: { node, dialog, body, close(), setError(msg), setTitle(t), buttons }
// ══════════════════════════════════════════════════════════════════════
export function dkModal(opts = {}) {
  const { title = "", titleIcon, sub, body, actions = [], size = 460, variant = "account", align = variant === "account" || variant === "panel" ? "top" : "center",
    top, onClose, closeOnBackdrop = true, role = variant === "confirm" ? "alertdialog" : "dialog", initialFocus, persist = false, serifTitle = false, cls, footerStart } = opts;
  const tid = "dk-mt-" + Math.random().toString(36).slice(2, 8);
  const prevFocus = document.activeElement;
  let closed = false;
  const errEl = h("span", { class: "dk-mdl-err", role: "alert" });
  const close = (reason = "close") => {
    if (closed) return; closed = true;
    unregister(rec);           // önce inert kalksın, sonra odak tetikleyiciye dönebilsin
    ovl.classList.add("is-closing");
    unlockScroll();
    setTimeout(() => ovl.remove(), 140);
    try { if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === "function") prevFocus.focus({ preventScroll: true }); } catch (_) {}
    onClose?.(reason);
  };
  const titleEl = h(variant === "confirm" ? "h3" : "h2", { id: tid, class: cx("dk-mdl-t", serifTitle && "dk-mdl-t-serif") }, titleIcon ? (titleIcon instanceof Node ? titleIcon : svgIcon(titleIcon, { size: 20, color: "var(--dk-role)" })) : null, h("span", {}, title));
  const bodyEl = h("div", { class: "dk-mdl-body" }, body || null);
  const buttons = actions.map((a) => actionBtn(a, close));
  const acts = buttons.length ? h("div", { class: "dk-mdl-acts" }, variant === "form" ? errEl : null, footerStart || null, ...buttons) : null;

  let dialog;
  if (variant === "form") {
    dialog = h("div", { class: cx("dk-mdl", "dk-mdl-form", "dk-pop", cls), role, "aria-modal": "true", "aria-labelledby": tid, style: { width: size + "px" } },
      h("div", { class: "dk-mdl-head" }, titleEl, closeBtn(() => close("x"), { size: 40, icon: 18 })),
      h("div", { class: "dk-mdl-fbody" }, sub ? h("p", { class: "dk-mdl-sub" }, sub) : null, bodyEl),
      acts ? h("div", { class: "dk-mdl-foot" }, ...acts.childNodes) : null);
  } else if (variant === "confirm") {
    dialog = h("div", { class: cx("dk-mdl", "dk-mdl-confirm", "dk-pop", cls), role, "aria-modal": "true", "aria-labelledby": tid, style: { width: size + "px" } },
      titleEl, sub ? h("p", { class: "dk-mdl-p" }, sub) : null, body ? bodyEl : null, acts);
  } else {
    const head = h("div", { class: "dk-mdl-headrow" },
      h("div", { class: "dk-mdl-tcol" }, titleEl, sub ? h("p", { class: "dk-mdl-sub" }, sub) : null),
      closeBtn(() => close("x"), variant === "panel" ? { size: 36, icon: 16, cls: "dk-mdl-x-strong" } : { size: 40, icon: 16 }));
    dialog = h("div", { class: cx("dk-mdl", `dk-mdl-${variant}`, variant === "account" ? "dk-modal" : "dk-pop", cls), role, "aria-modal": "true", "aria-labelledby": tid, style: { width: size + "px" } },
      head, bodyEl, errEl, acts);
  }
  const ovl = h("div", { class: cx("dk-ovl", `dk-ovl-${variant}`, `dk-ovl-${align}`, "dk-fade") },
    h("button", { type: "button", class: "dk-ovl-bg", tabindex: "-1", "aria-label": "Kapat", onclick: () => { if (closeOnBackdrop) close("backdrop"); } }),
    dialog);
  if (top != null) ovl.style.setProperty("--dk-mdl-top", typeof top === "number" ? top + "px" : top);
  // tabindex=-1: diyalogdaki odaklanamaz metne tıklanınca odak gövdeye değil diyaloğa gelir (ESC/Tab tuzağı sürer)
  dialog.setAttribute("tabindex", "-1");
  const rec = { kind: "modal", close, esc: () => close("esc"), trapRoot: dialog, node: ovl, base: baseOf(), persist };
  portalRoot().append(ovl);
  register(rec);
  lockScroll();
  requestAnimationFrame(() => {
    const target = (typeof initialFocus === "string" ? dialog.querySelector(initialFocus) : initialFocus) ||
      dialog.querySelector("[autofocus]") || dialog.querySelector("input,textarea,select") || focusables(dialog).find((el) => !el.classList.contains("dk-mdl-x")) || dialog.querySelector(".dk-mdl-x");
    try { target?.focus({ preventScroll: true }); } catch (_) {}
  });
  return {
    node: ovl, dialog, body: bodyEl, buttons, close,
    setError(m) { errEl.textContent = m || ""; errEl.classList.toggle("is-on", !!m); },
    setTitle(t) { titleEl.lastChild.textContent = t; },
  };
}

// Onay diyaloğu → Promise<boolean>. danger: kırmızı eylem düğmesi.
export function dkConfirm({ title = "Emin misin?", body, confirmLabel = "Onayla", cancelLabel = "Vazgeç", danger = false, size = 420, variant } = {}) {
  // varsayılan görünüm kabuğa göre: hesap/public → account modalı, panel → org ConfirmDialog
  const v = variant || (document.querySelector("#app > .dk")?.dataset.area === "panel" ? "confirm" : "account");
  return new Promise((resolve) => {
    let done = false;
    const fin = (x) => { if (!done) { done = true; resolve(x); } };
    const textBody = typeof body === "string";
    dkModal({
      title, size, variant: v,
      sub: v === "confirm" && textBody ? body : undefined,
      body: body instanceof Node ? body : v !== "confirm" && textBody ? h("p", { class: "dk-mdl-p" }, body) : undefined,
      actions: [
        { label: cancelLabel, variant: "outline", onClick: () => fin(false) },
        { label: confirmLabel, variant: danger ? "danger" : "primary", onClick: () => fin(true) },
      ],
      onClose: () => fin(false),
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// DRAWER (WebOrgEtkinlikler): sağdan 540px, bg #0A0B0F, border-left #1F232B; başlık şeridi 80 (eyebrow mono 10.5 rol rengi +
// h2 22/600) · gövde kaydırılır pad 24 28 gap 18 · alt şerit min-h 80 pad 16 28. Overlay rgba(6,7,10,.62). Giriş gbDrawer 360ms.
// ══════════════════════════════════════════════════════════════════════
export function dkDrawer(opts = {}) {
  const { eyebrow, title = "", body, footer, width = 540, onClose, closeLabel = "Paneli kapat", persist = false, cls, eyebrowColor } = opts;
  const tid = "dk-dt-" + Math.random().toString(36).slice(2, 8);
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (reason = "close") => {
    if (closed) return; closed = true;
    unregister(rec);
    wrap.classList.add("is-closing");
    unlockScroll();
    setTimeout(() => wrap.remove(), 160);
    try { prevFocus?.isConnected && prevFocus.focus?.({ preventScroll: true }); } catch (_) {}
    onClose?.(reason);
  };
  const bodyEl = h("div", { class: "dk-drw-body dk-scroll" }, body || null);
  const footEl = footer ? h("div", { class: "dk-drw-foot" }, ...(Array.isArray(footer) ? footer : [footer])) : null;
  const panel = h("aside", { class: cx("dk-drw", "dk-drawer", cls), role: "dialog", "aria-modal": "true", "aria-labelledby": tid, style: { width: `min(${width}px, 100vw)` } },
    h("div", { class: "dk-drw-head" },
      h("div", { class: "dk-drw-tcol" }, eyebrow ? h("span", { class: "dk-drw-eb", style: eyebrowColor ? { color: eyebrowColor } : null }, eyebrow) : null, h("h2", { id: tid }, title)),
      h("button", { type: "button", class: "dk-mdl-x dk-press", "aria-label": closeLabel, style: { width: "40px", height: "40px", color: "#F2F1EE" }, onclick: () => close("x") }, svgIcon("x", { size: 18 }))),
    bodyEl, footEl);
  const wrap = h("div", { class: "dk-drw-wrap" }, h("div", { class: "dk-drw-ovl dk-fade", onclick: () => close("backdrop") }), panel);
  panel.setAttribute("tabindex", "-1");
  const rec = { kind: "drawer", close, esc: () => close("esc"), trapRoot: panel, node: wrap, base: baseOf(), persist };
  portalRoot().append(wrap);
  register(rec);
  lockScroll();
  requestAnimationFrame(() => { const t = panel.querySelector("[autofocus]") || panel.querySelector("input,textarea,select") || panel.querySelector(".dk-mdl-x"); try { t?.focus({ preventScroll: true }); } catch (_) {} });
  return { node: wrap, panel, body: bodyEl, footer: footEl, close, setTitle(t) { panel.querySelector("#" + tid).textContent = t; } };
}

// ══════════════════════════════════════════════════════════════════════
// TOAST — tek seferde bir tane (yenisi eskisini değiştirir). Konum/görünüm mount'lu kabuğa göre otomatik:
//   account  (public/hesap, hesap §0.5): sağ-üst top 96 / right = kenar boşluğu; h52 r8 bg #14171D, 24px daire ikon; 2.8 sn (Geri al: 3.6 sn)
//   artist   (sanatci §0.1): top 88 right 40; bg #0E1014, 8px renkli nokta; 3.4 sn
//   venue    (mekan §0.7): top 88 right 40; min-h 48 r10, 24px yeşil daire tik; 2.6 sn
//   light    (org/admin F4): sağ-alt 32/40; bg #F2F1EE koyu metin 600, 24px daire, kapat düğmesi; 3.2 sn
// dkToast(msg, { type: "ok"|"err"|"info"|"neutral", action: { label: "GERİ AL", onClick }, duration, variant })
// Dönüş: { close() }. action tıklanırsa onClick çağrılır ve toast kapanır; süre dolunca opts.onExpire() (geri alma deseni).
// ══════════════════════════════════════════════════════════════════════
let _toast = null;
// sayfa kapanırken bekleyen "Geri al" toast'ını işle (ertelenen yazım kaybolmasın)
window.addEventListener("pagehide", () => { try { _toast?.close(); } catch (_) {} });
function autoToastVariant() {
  const root = document.querySelector("#app > .dk");
  const area = root?.dataset.area, role = root?.dataset.role;
  if (area === "panel") return role === "artist" ? "artist" : role === "venue" ? "venue" : "light";
  return "account";
}
export function dkToast(msg, opts = {}) {
  const { type = "ok", action, variant = autoToastVariant(), onExpire } = opts;
  const dur = opts.duration ?? (variant === "account" ? (action ? 3600 : 2800) : variant === "artist" ? 3400 : variant === "venue" ? 2600 : 3200);
  if (_toast) _toast.close();
  const iconPath = type === "err" ? (variant === "account" ? "M12 7v6M12 17h.01" : "M12 7.5v6M12 16.5h.01") : type === "info" ? "M12 11v5M12 8v.01" : "M5 12.5l4.5 4.5L19 7.5";
  let lead = null;
  if (variant === "artist") lead = h("span", { class: "dk-tst-dot" });
  else if (!(variant === "account" && action)) lead = h("span", { class: "dk-tst-ic" }, svgRaw(`<path d="${iconPath}"></path>`, { size: variant === "account" ? 13 : 14, sw: variant === "light" ? "2.6" : variant === "account" ? "3" : "2.4" }));
  const act = action ? h("button", { type: "button", class: "dk-tst-act dk-press" }, action.label || "GERİ AL") : null;
  const x = variant === "light" ? h("button", { type: "button", class: "dk-tst-x", "aria-label": "Bildirimi kapat" }, svgIcon("x", { size: 15, color: "#06070A" })) : null;
  const el = h("div", { class: cx("dk-tst", `dk-tst-${variant}`, `is-${type}`, action && "has-act", variant === "account" ? "dk-toastlife" : variant === "light" || variant === "venue" ? "dk-pop" : "dk-toast"),
    style: variant === "account" ? { "--dk-toast-life": dur + "ms" } : null },
  lead, h("span", { class: "dk-tst-m" }, msg), act, x);
  let timer = null, closed = false;
  // kapanış: "action" (Geri al tıklandı) dışındaki her kapanışta onExpire çağrılır → ertelenen yıkıcı yazım işlenir
  // (süre doldu, × tıklandı, yeni toast geldi, sayfadan ayrıldı).
  const close = (reason = "expire") => {
    if (closed) return; closed = true;
    clearTimeout(timer);
    if (_toast === api) _toast = null;
    el.classList.add("is-out");
    setTimeout(() => el.remove(), variant === "account" ? 0 : 180);
    if (reason !== "action") { try { onExpire?.(); } catch (e) { console.error(e); } }
  };
  const api = { close: () => close("api"), node: el };
  if (act) act.addEventListener("click", () => { try { action.onClick?.(); } finally { close("action"); } });
  if (x) x.addEventListener("click", () => close("x"));
  timer = setTimeout(() => close("expire"), dur);
  portalRoot().append(el);
  announce(typeof msg === "string" ? msg : el.querySelector(".dk-tst-m")?.textContent, type === "err");
  _toast = api;
  return api;
}

// ══════════════════════════════════════════════════════════════════════
// POPOVER — tetikleyiciye sabitlenir (position:fixed, kaydırma/yeniden boyutlanmada izler). Dışarı tık / ESC kapatır,
// odak tetikleyiciye döner. placement: bottom-end (varsayılan) | bottom-start. offset: px. anim: popin (gbDrop 200ms) | pop
// Dönüş: { node, close(), reposition() }
// ══════════════════════════════════════════════════════════════════════
export function dkPopover({ anchor, content, placement = "bottom-end", offset = 8, cls, role = "dialog", label, onClose, anim = "popin", width, focus = true, dx = 0 } = {}) {
  const node = h("div", { class: cx("dk-popv", anim === "pop" ? "dk-pop" : "dk-popin", cls), role, "aria-label": label, style: width ? { width: width + "px" } : null }, content);
  let closed = false;
  const place = () => {
    if (!anchor?.isConnected) return close("detached");
    const r = anchor.getBoundingClientRect();
    node.style.top = Math.round(r.bottom + offset) + "px";
    if (placement === "bottom-start") { node.style.left = Math.round(r.left + dx) + "px"; node.style.right = "auto"; }
    else { node.style.right = Math.round(document.documentElement.clientWidth - r.right - dx) + "px"; node.style.left = "auto"; }
  };
  const onDown = (e) => { if (!node.contains(e.target) && !anchor.contains(e.target)) close("outside"); };
  const onScroll = () => place();
  function close(reason, refocus = false) {
    if (closed) return; closed = true;
    unregister(rec);
    document.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
    node.remove();
    anchor?.setAttribute?.("aria-expanded", "false");
    if (refocus) try { anchor?.focus?.({ preventScroll: true }); } catch (_) {}
    onClose?.(reason);
  }
  // ESC: belge düzeyi işleyici (en üstteki katman) → close("esc", true) — odak tetikleyiciye döner
  const rec = { kind: "popover", close: (r) => close(r), esc: () => close("esc", true), node, base: baseOf(), persist: false };
  portalRoot().append(node);
  register(rec);
  place();
  anchor?.setAttribute?.("aria-expanded", "true");
  document.addEventListener("pointerdown", onDown, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);
  if (focus) requestAnimationFrame(() => { const t = node.querySelector("[autofocus]") || node.querySelector("input,button,a[href]"); try { t?.focus({ preventScroll: true }); } catch (_) {} });
  return { node, close: (r = "api") => close(r), reposition: place };
}

// ══════════════════════════════════════════════════════════════════════
// LOGIN GATE — misafir aksiyon kapısı (legacy customer.loginGate'in masaüstü karşılığı). Girişliyse false döner (devam et);
// misafirse "Giriş Gerekli" modalı açar ve true döner (işlemi durdur).
// "Giriş yap": desktop/auth/giris.js hazırsa onun openLoginModal()'ı, değilse legacy auth.loginModal() (aynı akış).
// ══════════════════════════════════════════════════════════════════════
export const isRealUser = () => !!session.user && !session.guest;
export async function openLogin() {
  try {
    const m = await import("../auth/giris.js");
    if (!m.NOT_READY && typeof m.openLoginModal === "function") return m.openLoginModal();
  } catch (_) {}
  const { loginModal } = await import("../../pages/auth.js");
  return loginModal();
}
export function dkLoginGate(action, { register = "#/register" } = {}) {
  if (isRealUser()) return false;
  const m = dkModal({
    title: "Giriş gerekli", size: 440,
    body: h("p", { class: "dk-mdl-p" }, (action ? action + " için " : "") + "bir hesapla giriş yapman gerekiyor. Kayıt olmak ücretsiz."),
    actions: [
      { label: "Kayıt ol", variant: "outline", icon: "userPlus", onClick: () => { location.hash = register; } },
      { label: "Giriş yap", variant: "primary", icon: "login", onClick: () => { setTimeout(openLogin, 0); } },
    ],
  });
  return !!m;
}
