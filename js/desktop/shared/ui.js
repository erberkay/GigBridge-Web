// MASAÜSTÜ ORTAK BİLEŞENLER (dk-*) — foundation adım 2. CSS: css/dk-ui.css (BASE_CSS ile her masaüstü görünümünde yüklü).
// Tüm ölçüler artboard'ların inline stillerinden birebir (kaynak artboard her bileşenin üstünde yazılı).
// API başvurusu + örnekler: specs/foundation.md §9. KURAL: bu dosyayı artboard uygulayıcıları DEĞİŞTİRMEZ —
// yerel bir varyant gerekiyorsa kendi modülünde yaz ve "// SHARED-CANDIDATE" yorumuyla işaretle.
//
// Buradan ayrıca şunlar yeniden dışa aktarılır (tek içe aktarma yüzeyi):
//   overlays.js  → dkModal, dkConfirm, dkDrawer, dkToast, dkPopover, dkLoginGate, portalRoot
//   city-picker.js → cityPicker, cityButton
import { h } from "../../ui.js";
import { svgIcon, svgRaw } from "./icons.js";
import { rgba, fmtPrice, isFree, initials, starsText, clamp, trUpper, avatarGrad, avatarInk } from "./helpers.js";
import { genreColor, genreSoft, genreTint, genreGrad, genreLabel } from "./genres.js";

export { dkModal, dkConfirm, dkDrawer, dkToast, dkPopover, dkLoginGate, portalRoot, closeAllOverlays } from "./overlays.js";
export { cityPicker, cityButton } from "./city-picker.js";

// ── küçük yardımcılar ──
export const cx = (...c) => c.flat().filter(Boolean).join(" ");
const kids = (x) => (x == null || x === false ? [] : Array.isArray(x) ? x : [x]);
// ikon: dizge → registry, Node → olduğu gibi
export function ic(name, opts = {}) {
  if (!name) return null;
  if (name instanceof Node) return name;
  return svgIcon(name, opts);
}
let _uid = 0;
export const uid = (p = "dk") => `${p}-${++_uid}`;

// ══════════════════════════════════════════════════════════════════════
// LOGO (48 artboard'da aynı): 32×32 kutu r8 #F2F1EE + köprü SVG 18 (stroke 2.4) + "GigBridge" 20/700/-0.03em
// footer: 30/17 + 19px
// ══════════════════════════════════════════════════════════════════════
export function dkLogo({ href = "#/kesfet", size = 32, label = "GigBridge ana sayfa", wordmark = true, cls } = {}) {
  const small = size <= 30;
  // Uygulama ile aynı marka ikonu (GigBridgeIcon = assets/logo-icon.svg) — Berkay: "mobildeki logo burada da olacak"
  const tile = h("span", { class: "dk-logo-tile", style: { width: size + "px", height: size + "px" } },
    h("img", { src: "/assets/logo-icon.svg", alt: "", width: size, height: size, decoding: "async" }));
  const word = wordmark ? h("span", { class: "dk-logo-word", style: small ? { fontSize: "19px" } : null }, "GigBridge") : null;
  return href
    ? h("a", { href, class: cx("dk-logo", cls), "aria-label": label }, tile, word)
    : h("span", { class: cx("dk-logo", cls) }, tile, word);
}

// ══════════════════════════════════════════════════════════════════════
// BUTTON — primary(magenta) / role / light / outline / ghost / danger / danger-outline / tint / dashed / violet
// Boyutlar 36/40/44/48/52 (yükseklik). Kaynak: hesap §0.5, org-admin F5, auth §0.3, sanatci §0.3.
// ══════════════════════════════════════════════════════════════════════
export function dkButton(label, opts = {}) {
  const { variant = "primary", size = 44, icon, iconRight, href, onClick, disabled, busy, busyLabel, full, color, type = "button",
    cls, style, attrs = {}, iconSize, target, ariaLabel, pressed } = opts;
  const isz = iconSize || (size <= 36 ? 15 : size >= 48 ? 17 : 16);
  const icoL = icon ? ic(icon, { size: isz, ...(opts.iconOpts || {}) }) : null;
  const icoR = iconRight ? ic(iconRight, { size: isz, ...(opts.iconOpts || {}) }) : null;
  const text = h("span", { class: "dk-btn-l" }, label ?? "");
  const st = { ...(style || {}) };
  if (color) st["--dk-btn-c"] = color;
  const common = {
    class: cx("dk-btn", "dk-press", `dk-btn-${variant}`, `dk-btn-${size}`, full && "dk-btn-full", cls),
    style: st, "aria-label": ariaLabel, ...attrs,
  };
  if (pressed != null) common["aria-pressed"] = pressed ? "true" : "false";
  const el = href
    ? h("a", { ...common, href, target, rel: target === "_blank" ? "noopener" : null }, icoL, text, icoR)
    : h("button", { ...common, type, disabled: !!disabled || !!busy, onclick: onClick }, icoL, text, icoR);
  if (href && onClick) el.addEventListener("click", onClick);
  const api = {
    setBusy(on, lbl) {
      el.toggleAttribute("disabled", !!on);
      el.setAttribute("aria-busy", on ? "true" : "false");
      el.classList.toggle("is-busy", !!on);
      const old = el.querySelector(".dk-btn-spin");
      if (on && !old) el.insertBefore(svgRaw('<path d="M21 12a9 9 0 1 1-9-9"></path>', { size: 16, sw: "2.4", cls: "dk-btn-spin dk-spin" }), el.firstChild);
      if (!on && old) old.remove();
      if (icoL) icoL.style.display = on ? "none" : "";
      text.textContent = on ? (lbl || busyLabel || label) : label;
    },
    setLabel(t) { text.textContent = t; },
  };
  if (busy) api.setBusy(true);
  el.dk = api;
  return el;
}

// IconButton: 36/40/44 kare (r6) ya da daire. variant: surface (#0E1014 + #1F232B) | ghost (şeffaf + #1F232B) | outline (#2C303A) | bare | overlay (görsel üstü daire)
export function dkIconButton(icon, opts = {}) {
  const { label, size = 40, variant = "surface", round = false, href, onClick, dot, dotColor, iconSize, cls, style, attrs = {}, pressed } = opts;
  const st = { width: size + "px", height: size + "px", ...(style || {}) };
  const inner = [ic(icon, { size: iconSize || (size <= 32 ? 15 : size <= 36 ? 16 : 18), ...(opts.iconOpts || {}) })];
  if (dot) inner.push(h("span", { class: "dk-ib-dot", style: dotColor ? { background: dotColor } : null }));
  const a = { class: cx("dk-ib", "dk-press", `dk-ib-${variant}`, round && "dk-ib-round", cls), style: st, "aria-label": label, ...attrs };
  if (pressed != null) a["aria-pressed"] = pressed ? "true" : "false";
  return href ? h("a", { ...a, href, onclick: onClick }, ...inner) : h("button", { ...a, type: "button", onclick: onClick }, ...inner);
}

// ══════════════════════════════════════════════════════════════════════
// FORM — Label / Input / Textarea / Select / Field / PasswordInput / SearchInput
// Input: h48 pad 0 14 r8 border #1F232B bg #0E1014 15px (auth, org, hesap bg #06070A, mekan h44 bg #0A0B0F 14.5px)
// Odak kenarı: kökteki --dk-focus-border (alan kabuğu ayarlar: hesap pembe, mekan amber, org/auth cyan, admin mor)
// ══════════════════════════════════════════════════════════════════════
export function dkLabel(text, { for: htmlFor, required, cls } = {}) {
  return h("label", { class: cx("dk-lbl", cls), for: htmlFor }, trUpper(text), required ? h("span", { class: "dk-lbl-req", "aria-hidden": "true" }, " *") : null);
}
// bg: stratum (#0E1014, varsayılan) | void (#06070A, hesap) | rail (#0A0B0F, mekan) · size: 48 | 44
export function dkInput(opts = {}) {
  const { id, type = "text", value, placeholder, size = 48, bg = "stratum", invalid, name, autocomplete, maxlength, inputmode, cls, style, attrs = {}, onInput, onChange, onEnter, disabled, readonly, fill } = opts;
  const el = h("input", {
    id, type, name, placeholder, autocomplete, maxlength, inputmode, disabled: !!disabled, readonly: !!readonly,
    class: cx("dk-inp", "dk-in", `dk-inp-${size}`, `dk-inp-bg-${bg}`, fill && "dk-inp-fill", cls),
    "aria-invalid": invalid ? "true" : null, style, ...attrs,
  });
  if (value != null) el.value = value;
  if (onInput) el.addEventListener("input", (e) => onInput(el.value, e));
  if (onChange) el.addEventListener("change", (e) => onChange(el.value, e));
  if (onEnter) el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); onEnter(el.value, e); } });
  return el;
}
export function dkTextarea(opts = {}) {
  const { id, value, placeholder, rows = 4, maxlength, counter = !!maxlength, bg = "stratum", invalid, cls, onInput, attrs = {}, minWarn } = opts;
  const ta = h("textarea", { id, rows, maxlength, placeholder, class: cx("dk-ta", "dk-in", `dk-inp-bg-${bg}`, cls), "aria-invalid": invalid ? "true" : null, ...attrs });
  if (value != null) ta.value = value;
  if (!counter) { if (onInput) ta.addEventListener("input", () => onInput(ta.value)); return ta; }
  const cnt = h("span", { class: "dk-ta-count", "aria-live": "polite" });
  const upd = () => {
    const n = ta.value.length;
    cnt.textContent = `${n}/${maxlength}`;
    cnt.classList.toggle("is-warn", !!(minWarn && n > 0 && n < minWarn));
  };
  ta.addEventListener("input", () => { upd(); onInput?.(ta.value); });
  upd();
  const wrap = h("div", { class: "dk-ta-wrap" }, ta, cnt);
  wrap.input = ta;
  return wrap;
}
// options: [{ value, label }] | ["a","b"]
export function dkSelect(opts = {}) {
  const { id, options = [], value, size = 48, bg = "stratum", cls, onChange, attrs = {}, placeholder } = opts;
  const sel = h("select", { id, class: cx("dk-sel", "dk-in", `dk-inp-${size}`, `dk-inp-bg-${bg}`), ...attrs },
    placeholder ? h("option", { value: "", disabled: true, selected: value == null || value === "" }, placeholder) : null,
    ...options.map((o) => { const v = typeof o === "object" ? o.value : o; const l = typeof o === "object" ? o.label : o; return h("option", { value: v, selected: String(v) === String(value ?? "") }, l); }));
  if (onChange) sel.addEventListener("change", () => onChange(sel.value));
  return h("span", { class: cx("dk-sel-wrap", cls) }, sel, svgIcon("chevronDown", { size: 16, color: "#8A8E97", cls: "dk-sel-chev" }));
}
// Field: etiket + kontrol + ipucu/hata. Dönüş: { node, input, setError(msg|null), setHint(msg) }
// gap: verilmezse CSS --dk-fld-gap (varsayılan 8; kapsayıcıda ezilebilir — hesap modalları ad 14 / e-posta-şifre 10 / şehir 12)
export function dkField({ label, input, hint, error, required, id, gap, cls } = {}) {
  const ctl = input instanceof Node ? input : dkInput({ id, ...(input || {}) });
  const target = ctl.matches?.("input,textarea,select") ? ctl : ctl.querySelector?.("input,textarea,select");
  const fid = id || target?.id || uid("fld");
  if (target && !target.id) target.id = fid;
  const msg = h("span", { class: "dk-fld-msg", id: fid + "-msg", role: "status" });
  const node = h("div", { class: cx("dk-fld", cls), style: gap != null ? { gap: gap + "px" } : null }, label ? dkLabel(label, { for: fid, required }) : null, ctl, msg);
  const api = {
    node, input: target,
    setError(m) {
      msg.textContent = m || "";
      msg.classList.toggle("is-err", !!m);
      node.classList.toggle("is-invalid", !!m);
      if (target) { if (m) { target.setAttribute("aria-invalid", "true"); target.setAttribute("aria-describedby", msg.id); } else target.removeAttribute("aria-invalid"); }
    },
    setHint(m) { msg.textContent = m || ""; msg.classList.remove("is-err"); node.classList.remove("is-invalid"); },
  };
  if (error) api.setError(error); else if (hint) api.setHint(hint);
  node.dk = api;
  return api;
}
// PasswordInput (auth §0.3): input pad-right 76 + "Göster/Gizle" düğmesi (88×40, top/right 4)
export function dkPasswordInput(opts = {}) {
  const inp = dkInput({ type: "password", autocomplete: "current-password", ...opts, cls: cx("dk-pw-inp", opts.cls) });
  if (!inp.id) inp.id = uid("pw");
  const lbl = h("span", {}, "Göster");
  const btn = h("button", { type: "button", class: "dk-pw-eye dk-press", "aria-controls": inp.id, "aria-label": "Şifreyi göster" },
    svgIcon("eye", { size: 16, sw: "1.9" }), lbl);
  btn.addEventListener("click", () => {
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    lbl.textContent = show ? "Gizle" : "Göster";
    btn.setAttribute("aria-label", show ? "Şifreyi gizle" : "Şifreyi göster");
  });
  const wrap = h("div", { class: "dk-pw" }, inp, btn);
  wrap.input = inp;
  return wrap;
}
// SearchInput — kabuk araması (320×40 r6/r8) ve sayfa içi arama (h40/h38). kbd: "/" çipi (mekan).
// variant: panel (320×40, bg #0E1014) | field (tam genişlik h40) | compact (h38 pad 0 10, 13.5px)
export function dkSearchInput(opts = {}) {
  // uaPad: artboard input'u padding belirtmiyorsa tarayıcı varsayılanı (1px 2px) — mekan/org/admin üst bar araması
  const { placeholder = "Ara", value = "", onInput, onSubmit, label = "Ara", width, radius = 6, kbd, variant = "panel", iconName = "search", iconSw = "2", debounceMs = 0, cls, id, uaPad = false } = opts;
  const inp = h("input", { type: "search", id, "aria-label": label, placeholder, class: uaPad ? "dk-srch-inp is-uapad" : "dk-srch-inp", autocomplete: "off", spellcheck: "false" });
  inp.value = value;
  let t = null;
  if (onInput) inp.addEventListener("input", () => { clearTimeout(t); if (debounceMs) t = setTimeout(() => onInput(inp.value), debounceMs); else onInput(inp.value); });
  if (onSubmit) inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); onSubmit(inp.value.trim()); } });
  const node = h("label", { class: cx("dk-srch", `dk-srch-${variant}`, cls), style: { width: width != null ? (typeof width === "number" ? width + "px" : width) : null, borderRadius: radius + "px" } },
    svgIcon(iconName, { size: variant === "compact" ? 14 : 16, sw: iconSw, color: "#8A8E97" }), inp,
    kbd ? h("span", { class: "dk-srch-kbd", "aria-hidden": "true" }, kbd) : null);
  node.input = inp;
  return node;
}

// ══════════════════════════════════════════════════════════════════════
// CHECKBOX / RADIO satırları (WebEtkinlikler FilterSidebar) + SWITCH (WebProfil cyan 48×26, WebBildirimler magenta 44×24)
// ══════════════════════════════════════════════════════════════════════
function toggleRow(kind, { label, checked = false, onChange, dot, count, height, disabled, cls, name } = {}) {
  const box = kind === "checkbox"
    ? h("span", { class: "dk-cbx-box", "aria-hidden": "true" }, svgRaw('<path d="m5 12.5 4.5 4.5L19 7.5"></path>', { size: 10, sw: "4", color: "#06070A", cls: "dk-cbx-tick" }))
    : h("span", { class: "dk-rdo-ring", "aria-hidden": "true" }, h("span", { class: "dk-rdo-dot" }));
  const el = h("button", {
    type: "button", role: kind, class: cx(kind === "checkbox" ? "dk-cbx" : "dk-rdo", "dk-row", cls), disabled: !!disabled,
    style: height ? { height: height + "px" } : null, dataset: name ? { name } : null,
  }, box, dot ? h("span", { class: "dk-tg-dot", style: { background: dot } }) : null,
    h("span", { class: "dk-tg-l" }, label), count != null ? h("span", { class: "dk-tg-n" }, String(count)) : null);
  const set = (v) => { el.setAttribute("aria-checked", v ? "true" : "false"); el.classList.toggle("is-on", !!v); };
  set(checked);
  el.addEventListener("click", () => {
    const next = kind === "radio" ? true : el.getAttribute("aria-checked") !== "true";
    set(next); onChange?.(next);
  });
  el.dk = { set, get: () => el.getAttribute("aria-checked") === "true" };
  return el;
}
export const dkCheckbox = (o) => toggleRow("checkbox", o);
export const dkRadio = (o) => toggleRow("radio", o);
// Radio grubu: items [{value,label,count?,dot?}] → tek seçim
export function dkRadioGroup({ items = [], value, onChange, label, gap = 4, height } = {}) {
  const rows = new Map();
  const node = h("div", { role: "radiogroup", "aria-label": label, class: "dk-rgroup", style: { gap: gap + "px" } });
  const set = (v) => { value = v; rows.forEach((r, k) => r.dk.set(k === v)); };
  items.forEach((it) => {
    const r = dkRadio({ label: it.label, count: it.count, dot: it.dot, height, checked: it.value === value, onChange: () => { set(it.value); onChange?.(it.value); } });
    rows.set(it.value, r); node.append(r);
  });
  node.dk = { set, get: () => value };
  return node;
}
// Switch — variant: cyan (48×26, knob 20, yol 22) | magenta (44×24, knob 18, yol 20). Knob easing cubic-bezier(.3,1.5,.5,1) 340ms.
export function dkSwitch({ checked = false, onChange, variant = "cyan", label, labelledBy, disabled, cls } = {}) {
  const el = h("button", { type: "button", role: "switch", class: cx("dk-sw", `dk-sw-${variant}`, cls), "aria-label": label, "aria-labelledby": labelledBy, disabled: !!disabled },
    h("span", { class: "dk-sw-knob" }));
  const set = (v) => { el.setAttribute("aria-checked", v ? "true" : "false"); };
  set(checked);
  el.addEventListener("click", () => { const next = el.getAttribute("aria-checked") !== "true"; set(next); onChange?.(next, { revert: () => set(!next) }); });
  el.dk = { set, get: () => el.getAttribute("aria-checked") === "true" };
  return el;
}

// ══════════════════════════════════════════════════════════════════════
// SEGMENTED (hesap SegmentedTabs h38 pad4 · Etkinlikler/Etkinlik Segmented h34/36 pad3) + UNDERLINE TABS
// ══════════════════════════════════════════════════════════════════════
// items: [{ key, label, count?, icon? }]; size: 38 | 36 | 34; countStyle: text | pill; countColor: aktif sayı rengi
export function dkSegmented({ items = [], value, onChange, size = 38, role = "tablist", label, stretch = false, countStyle = "text", countColor = "#8A8E97", itemPad, cls } = {}) {
  const node = h("div", { role, "aria-label": label, class: cx("dk-seg", `dk-seg-${size}`, stretch && "dk-seg-stretch", cls) });
  const btns = new Map();
  const set = (k) => {
    value = k;
    btns.forEach((b, key) => {
      const on = key === k;
      b.classList.toggle("is-on", on);
      b.setAttribute(role === "tablist" ? "aria-selected" : "aria-checked", on ? "true" : "false");
      if (role === "tablist") b.tabIndex = on ? 0 : -1;
      const n = b.querySelector(".dk-seg-n");
      if (n && countStyle === "text") n.style.color = on ? countColor : "#8A8E97";
    });
  };
  items.forEach((it) => {
    const b = h("button", { type: "button", role: role === "tablist" ? "tab" : "radio", class: cx("dk-seg-b", "dk-press", countStyle === "pill" && "dk-seg-pillmode"),
      style: itemPad != null ? { padding: `0 ${itemPad}px` } : null, onclick: () => { set(it.key); onChange?.(it.key); } },
    it.icon ? ic(it.icon, { size: 15 }) : null, h("span", {}, it.label),
    it.count != null ? h("span", { class: cx("dk-seg-n", countStyle === "pill" && "dk-seg-pill") }, String(it.count)) : null);
    btns.set(it.key, b); node.append(b);
  });
  if (role === "tablist") node.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const keys = [...btns.keys()]; let i = keys.indexOf(value);
    i = (i + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
    set(keys[i]); btns.get(keys[i]).focus(); onChange?.(keys[i]);
  });
  set(value ?? items[0]?.key);
  node.dk = { set, get: () => value, setCount(k, n) { const b = btns.get(k); const el = b?.querySelector(".dk-seg-n"); if (el) el.textContent = String(n); } };
  return node;
}
// UnderlineTabs — variant:
//   mono  (Keşfet kategori: mono 12/700/.14em, h64, gap 32, düz #FF4FA3 alt çizgi, ikon 15)
//   anchor(Sanatçı/Mekan AnchorTabs: 15/500, h60, gap 36, prizma alt çizgi)
//   sans  (WebAdmin sekmeleri: 14/600, h56, pad 0 12, gap 4, --dk-role renkli çizgi left/right 8, mono sayaç)
// items: [{ key, label, icon?, count?, href? }]; underline: "solid" | "prism" | "role"
export function dkUnderlineTabs({ items = [], value, onChange, variant = "mono", underline, label, cls } = {}) {
  const ul = underline || (variant === "anchor" ? "prism" : variant === "sans" ? "role" : "solid");
  const node = h("div", { role: "tablist", "aria-label": label, class: cx("dk-utab", `dk-utab-${variant}`, cls) });
  const tabs = new Map();
  const set = (k) => {
    value = k;
    tabs.forEach((t, key) => { const on = key === k; t.classList.toggle("is-on", on); t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; });
  };
  items.forEach((it) => {
    const bar = h("span", { class: cx("dk-utab-bar", ul === "prism" && "dk-prism", `dk-utab-bar-${ul}`) });
    const inner = [it.icon ? ic(it.icon, { size: 15, sw: "1.9" }) : null, h("span", {}, it.label), it.count != null ? h("span", { class: "dk-utab-n" }, String(it.count)) : null, bar];
    const t = it.href
      ? h("a", { href: it.href, role: "tab", class: "dk-utab-t dk-tab" }, ...inner)
      : h("button", { type: "button", role: "tab", class: "dk-utab-t dk-tab" }, ...inner);
    t.addEventListener("click", (e) => { if (!it.href) e.preventDefault(); set(it.key); onChange?.(it.key); });
    tabs.set(it.key, t); node.append(t);
  });
  node.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const keys = [...tabs.keys()]; let i = keys.indexOf(value);
    i = (i + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
    set(keys[i]); tabs.get(keys[i]).focus(); onChange?.(keys[i]);
  });
  set(value ?? items[0]?.key);
  node.dk = { set, get: () => value, setCount(k, n) { const el = tabs.get(k)?.querySelector(".dk-utab-n"); if (el) el.textContent = String(n); } };
  return node;
}

// ══════════════════════════════════════════════════════════════════════
// CHIP / GENRE CHIP / GENRE TAG / ACTIVE FILTER CHIP
// ══════════════════════════════════════════════════════════════════════
// Chip (seçilebilir, aria-pressed): size 36 (h36 r18 13.5, Profil ilgi alanları) | 32 (Keşfet tür, h32 r16 13px dot7) | 30 (Harita h30 r15 12.5 dot6)
export function dkChip({ label, dot, pressed, onClick, size = 32, icon, cls, href } = {}) {
  const inner = [dot ? h("span", { class: "dk-chip-dot", style: { background: dot } }) : null, icon ? ic(icon, { size: 13 }) : null, h("span", {}, label)];
  const a = { class: cx("dk-chip", `dk-chip-${size}`, "dk-press", cls) };
  const el = href ? h("a", { ...a, href }, ...inner) : h("button", { ...a, type: "button" }, ...inner);
  const set = (v) => { if (pressed === undefined) return; el.setAttribute("aria-pressed", v ? "true" : "false"); el.classList.toggle("is-on", !!v); };
  if (pressed !== undefined) set(pressed);
  if (onClick) el.addEventListener("click", (e) => onClick(e, el));
  el.dk = { set };
  return el;
}
// GenreChip: tür rengi noktası (Tümü: #F2F1EE)
export function dkGenreChip(genre, opts = {}) {
  const all = !genre || opts.all;
  return dkChip({ label: opts.label || (all ? "Tümü" : genre), dot: all ? "#F2F1EE" : genreColor(genre), ...opts });
}
// GenreTag (salt-okuma etiket), variant:
//   card  (kart üstü: h20 pad 0 7 r3, border tür@.5, mono 9.5/700/.12em, TR büyük harf)
//   table (tablo: h20 pad 0 7 r10, border tür@.45, 11.5/500)
//   hero  (Etkinlik hero: h26 pad 0 10 r4 bg rgba(6,7,10,.7) border tür@.55, mono 10.5/700/.14em)
//   pill  (Sanatçı kimlik: h24 pad 0 10 r12, border @.45 bg @.10, mono 10/700/.12em + nokta 6)
//   neutral (VenueCard: border #2C303A, #C9CACD, mono 9.5)
export function dkGenreTag(genre, { variant = "card", text } = {}) {
  const c = genreColor(genre);
  const st = { "--dk-g": c, "--dk-g-soft": genreSoft(genre, variant === "table" ? 0.45 : variant === "hero" ? 0.55 : variant === "pill" ? 0.45 : 0.5), "--dk-g-tint": genreTint(genre, 0.1) };
  const lbl = text ?? (variant === "table" ? genre : genreLabel(genre));
  return h("span", { class: cx("dk-gtag", `dk-gtag-${variant}`), style: st }, variant === "pill" ? h("span", { class: "dk-gtag-dot" }) : null, lbl);
}
// ActiveFilterChip (Etkinlikler araç çubuğu): h30 r15, × 12
export function dkFilterChip(label, onRemove) {
  return h("button", { type: "button", class: "dk-fchip dk-press", "aria-label": `${label} filtresini kaldır`, onclick: onRemove },
    h("span", {}, label), svgIcon("x", { size: 12, sw: "2.2" }));
}

// ══════════════════════════════════════════════════════════════════════
// STATUS BADGE — iki aile:
//  (1) ETKİNLİK rozeti (Keşfet/Etkinlikler): öncelik dolu > VIP > sadece GigBridge'de > yoğun ilgi (>400) > şimdi popüler (>200) > yeni
//      variant: card (h22) | hero (h26) | wide (h24, zeminsiz)
//  (2) ST haritası (org/admin/sanatçı/mekan tabloları): pill (h24 r12 + nokta) | box (h24 r4 + nokta, sanatçı) | plain (h22 r4, "AKTİF")
// ══════════════════════════════════════════════════════════════════════
export const ST = {
  live:      { label: "Canlı", color: "#7CE0B0" },
  up:        { label: "Yaklaşan", color: "#4ED8FF" },
  past:      { label: "Geçmiş", color: "#8A8E97" },
  pending:   { label: "Onay Bekliyor", color: "#FFD700" },
  waiting:   { label: "Bekliyor", color: "#FFD700" },
  open:      { label: "Açık", color: "#FFD700" },
  accepted:  { label: "Onaylandı", color: "#7CE0B0" },
  approved:  { label: "Onaylandı", color: "#7CE0B0" },
  rejected:  { label: "Reddedildi", color: "#FF5A6E" },
  cancelled: { label: "İptal edildi", color: "#8A8E97" },
  resolved:  { label: "Çözüldü", color: "#7CE0B0" },
  invited:   { label: "Bekliyor", color: "#FFD700" },
  joined:    { label: "Katıldı", color: "#7CE0B0" },
  active:    { label: "Aktif", color: "#7CE0B0" },
  // etkinlik rozetleri (Keşfet/Etkinlikler)
  full:      { label: "BEKLEME LİSTESİ", labelKesfet: "BEKLEME LİSTESİNE KATIL!", color: "#A3A7AF" },
  vipEvent:  { label: "VIP DENEYİM", color: "#FFD700" },
  exclusive: { label: "SADECE GİGBRİDGE'DE", color: "#FF8A2A" },
  busy:      { label: "YOĞUN İLGİ", color: "#FF5A6E" },
  popular:   { label: "ŞİMDİ POPÜLER", color: "#FF4FA3" },
  new:       { label: "YENİ", color: "#7CE0B0" },
  // sanatçı teklif durumları (sanatci §0.3)
  offerPending:  { label: "BEKLİYOR", color: "#FFD700" },
  offerAccepted: { label: "KABUL EDİLDİ", color: "#7CE0B0" },
  offerRejected: { label: "REDDEDİLDİ", color: "#FF5A6E" },
};
// Etkinlik → rozet anahtarı (legacy statusBadge önceliği) ya da null
export function eventStatusKey(e) {
  const att = Number(e?.attendeeCount) || 0;
  if (e?.capacity && att >= e.capacity) return "full";
  if (e?.vipStatus === "approved") return "vipEvent";
  if (e?.isExclusive) return "exclusive";
  if (att > 400) return "busy";
  if (att > 200) return "popular";
  if (e?.isNew) return "new";
  return null;
}
// dkStatusBadge("pending") | dkStatusBadge({label,color}) | dkStatusBadge("full", {variant:"card", kesfet:true})
export function dkStatusBadge(key, { variant = "pill", label, color, kesfet = false, dot } = {}) {
  const def = typeof key === "object" && key ? key : ST[key] || { label: String(key || ""), color: "#8A8E97" };
  const c = color || def.color;
  const txt = label || (kesfet && def.labelKesfet) || def.label;
  const evFamily = variant === "card" || variant === "hero" || variant === "wide";
  const showDot = dot ?? (variant === "pill" || variant === "box");
  return h("span", { class: cx("dk-st", `dk-st-${variant}`), style: { "--dk-st": c, "--dk-st-bd": rgba(c, evFamily ? 1 : variant === "plain" ? 0.4 : 0.4), "--dk-st-bg": rgba(c, variant === "box" ? 0.08 : 0.1) } },
    showDot ? h("span", { class: "dk-st-dot" }) : null, txt);
}
export function dkEventBadge(e, { variant = "card", kesfet = false } = {}) {
  const k = eventStatusKey(e);
  return k ? dkStatusBadge(k, { variant, kesfet }) : null;
}

// ══════════════════════════════════════════════════════════════════════
// FİYAT — mono metin (kartlar) + PricePill (hero tarih/fiyat hapı stili)
// ══════════════════════════════════════════════════════════════════════
export function dkPrice(n, { upper = false, size = 15, weight = 600, freeColor = "#7CE0B0", color = "#F2F1EE", keepColor = false } = {}) {
  const free = isFree(n);
  return h("span", { class: "dk-price", style: { fontSize: size + "px", fontWeight: String(weight), color: free && !keepColor ? freeColor : color } }, fmtPrice(n, { upper }));
}
export function dkPricePill(n, { upper = true } = {}) {
  const free = isFree(n);
  return h("span", { class: cx("dk-ppill", free && "is-free") }, fmtPrice(n, { upper }));
}

// ══════════════════════════════════════════════════════════════════════
// SECTION HEAD (public-a §0.5, public-b "Benzer") · PAGE HEAD (hesap §0.3) · PAGE HERO (org-admin F5) · ACCENT TITLE
// title: dizi → [düz, <em>, düz] ya da { text, em, tail }
// ══════════════════════════════════════════════════════════════════════
function titleParts(title, em, tail, emColor) {
  const emEl = em ? h("em", { style: emColor ? { color: emColor } : null }, em) : null;
  return [title || "", emEl, tail || ""];
}
export function dkSectionHead({ eyebrow, eyebrowColor, eyebrowIcon, title, em, tail, emColor, size = 48, gap = 10, right, link, id, tag = "h2", cls } = {}) {
  const eb = eyebrow ? h("span", { class: "dk-sh-eb dk-eyebrow", style: eyebrowColor ? { color: eyebrowColor } : null }, eyebrowIcon ? ic(eyebrowIcon, { size: 14 }) : null, eyebrow) : null;
  const t = h(tag, { id, class: "dk-display", style: { fontSize: size + "px" } }, ...titleParts(title, em, tail, emColor));
  let r = right || null;
  if (!r && link) {
    r = link.variant === "sans"
      ? h("a", { href: link.href, class: "dk-sh-link-sans dk-link", onclick: link.onClick }, link.label || "Tümünü gör", svgIcon("arrowRight", { size: 15, sw: "2.2" }))
      : h(link.href ? "a" : "button", { href: link.href, type: link.href ? null : "button", class: "dk-sh-link dk-link", onclick: link.onClick }, link.label || "TÜMÜ", svgIcon("chevronRight", { size: 13, sw: "2.2" }));
  }
  return h("div", { class: cx("dk-sh", cls) }, h("div", { class: "dk-sh-l", style: { gap: gap + "px" } }, eb, t), r);
}
// PageHead (Hesabım): eyebrow "HESABIM" + serif 56 + <em> pembe + lead (max 560, 15.5/1.55 #A3A7AF). right → satır düzeni
export function dkPageHead({ eyebrow = "HESABIM", title, em, tail, lead, right, size = 56, rise = true, cls } = {}) {
  const col = h("div", { class: "dk-ph-col" },
    h("span", { class: "dk-eyebrow" }, eyebrow),
    h("h1", { class: "dk-display", style: { fontSize: size + "px" } }, ...titleParts(title, em, tail)),
    lead ? h("p", { class: "dk-ph-lead" }, lead) : null);
  return right
    ? h("div", { class: cx("dk-ph dk-ph-row", rise && "dk-rise", cls) }, col, right)
    : h("div", { class: cx("dk-ph", rise && "dk-rise", cls) }, ...col.childNodes);
}
// PageHero (org/admin/sanatçı panel sayfaları): eyebrow rol renginde, serif 52, lede 15/1.5 max 620, sağda aksiyonlar
export function dkPageHero({ eyebrow, title, em, tail, lead, actions, size = 52, color, leadMax = 620, cls } = {}) {
  return h("section", { class: cx("dk-hero", "dk-rise", cls), style: color ? { "--dk-accent": color } : null },
    h("div", { class: "dk-hero-l" },
      eyebrow ? h("span", { class: "dk-hero-eb" }, eyebrow) : null,
      h("h1", { class: "dk-display", style: { fontSize: size + "px" } }, ...titleParts(title, em, tail)),
      lead ? h("p", { class: "dk-hero-lead", style: { maxWidth: leadMax + "px" } }, lead) : null),
    actions ? h("div", { class: "dk-hero-r" }, ...kids(actions)) : null);
}
// AccentTitle (sanatçı paneli): 3×18 çubuk + h2 18/600
export function dkAccentTitle(text, { tag = "h2", color } = {}) {
  return h("div", { class: "dk-acc-title", style: color ? { "--dk-accent": color } : null }, h("span", { class: "dk-acc-bar" }), h(tag, {}, text));
}
// MonoLabel ("PROFİL TAMAMLAMA"): mono 11/700/.16em #A3A7AF
export const dkMonoLabel = (text, { tag = "span" } = {}) => h(tag, { class: "dk-monolabel" }, text);

// ══════════════════════════════════════════════════════════════════════
// BREADCRUMB — 3 stil:
//   text        (Etkinlik/Katılımcılar/Etkinlikler: 13px, "/" #5E636D, son öğe #F2F1EE)
//   mono-overlay(Sanatçı: görsel üstünde; geri 40×40 border rgba(242,241,238,.18) bg rgba(6,7,10,.6); mono 11/700/.16em #C9CACD, "/" #5E636D)
//   mono        (Mekan: sayfa zemininde; geri bg #0E1014 border #1F232B; mono #8A8E97, "/" #3A3F4A)
// items: [{ label, href? }] — son öğe mevcut sayfa
// ══════════════════════════════════════════════════════════════════════
export function dkBreadcrumb({ items = [], variant = "text", back, backLabel = "Geri", cls, style } = {}) {
  const mono = variant !== "text";
  const sepColor = variant === "mono" ? "#3A3F4A" : "#5E636D";
  const parts = [];
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    const txt = mono ? trUpper(it.label) : it.label;
    if (i) parts.push(h("span", { class: "dk-bc-sep", style: { color: sepColor }, "aria-hidden": "true" }, "/"));
    if (last) parts.push(h("span", { class: "dk-bc-cur", "aria-current": "page" }, txt));
    else if (it.href) parts.push(h("a", { href: it.href, class: mono ? "dk-bc-a" : "dk-bc-a dk-link" }, txt));
    else parts.push(h("span", {}, txt));
  });
  const backBtn = back ? h(typeof back === "string" ? "a" : "button", {
    href: typeof back === "string" ? back : null, type: typeof back === "string" ? null : "button",
    class: "dk-bc-back dk-press", "aria-label": backLabel, onclick: typeof back === "function" ? back : null,
  }, svgIcon("chevronLeft", { size: 18 })) : null;
  return h("nav", { "aria-label": "Konum", class: cx("dk-bc", `dk-bc-${variant}`, cls), style },
    backBtn, mono ? h("span", { class: "dk-bc-trail" }, ...parts) : parts);
}

// ══════════════════════════════════════════════════════════════════════
// AVATAR — fotoğraf ya da baş harf; gradyan türe (customer/artist/venue/organizer/admin) ya da türe-müzik (genre) göre.
// shape: circle | rounded (r = size*.2, admin tablosu 8) · ring: kenar rengi · icon: baş harf yerine ikon (org/admin kullanıcı kartı)
// ══════════════════════════════════════════════════════════════════════
export function dkAvatar({ name = "", photo, size = 40, type = "customer", genre, shape = "circle", border, ring, icon, iconSize, grad, ink, radius, fontSize, alt, position, cls, serif } = {}) {
  const r = radius != null ? radius + "px" : shape === "circle" ? "50%" : Math.round(size * 0.2) + "px";
  const st = { width: size + "px", height: size + "px", borderRadius: r };
  if (border) st.border = border === true ? "1px solid #2C303A" : border;
  if (ring) st.boxShadow = `0 0 0 2px ${ring}`;
  if (photo) {
    const img = h("img", { src: photo, alt: alt ?? "", loading: "lazy", decoding: "async", class: cx("dk-av", "dk-av-img", cls), style: { ...st, objectPosition: position || "center" } });
    img.addEventListener("error", () => { img.replaceWith(dkAvatar({ name, size, type, genre, shape, border, ring, icon, iconSize, grad, ink, radius, fontSize, cls, serif })); }, { once: true });
    return img;
  }
  st.background = grad || (genre ? genreGrad(genre) : avatarGrad(type));
  st.color = ink || (genre ? "#06070A" : avatarInk(type));
  st.fontSize = (fontSize || Math.round(size * 0.4)) + "px";
  if (serif) st.fontFamily = "var(--dk-font-serif)";
  return h("span", { class: cx("dk-av", "dk-av-ini", cls), style: st, "aria-hidden": alt ? null : "true", role: alt ? "img" : null, "aria-label": alt || null },
    icon ? ic(icon, { size: iconSize || Math.round(size * 0.46), color: st.color, sw: "2.2" }) : initials(name));
}

// ══════════════════════════════════════════════════════════════════════
// STARS — text (★ tekrarı, #FFD700 / #3A3E48, letter-spacing 2px — sanatçı paneli) | svg (5 yıldız, public-b)
// ══════════════════════════════════════════════════════════════════════
export function dkStars(n, { variant = "svg", size = 14, gap = 2, empty = "none", emptyStroke = "#5E636D" } = {}) {
  const k = clamp(Math.round(Number(n) || 0), 0, 5);
  const aria = `${k} / 5 yıldız`;
  if (variant === "text") {
    const s = starsText(k);
    return h("span", { class: "dk-stars-t", role: "img", "aria-label": aria, style: { fontSize: size + "px" } }, h("span", { class: "dk-stars-on" }, s.full), h("span", { class: "dk-stars-off" }, s.empty));
  }
  const row = h("span", { class: "dk-stars", role: "img", "aria-label": aria, style: { gap: gap + "px" } });
  for (let i = 1; i <= 5; i++) {
    const on = i <= k;
    row.append(svgRaw('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
      { size, sw: "1.8", color: on ? "#FFD700" : emptyStroke, attrs: { fill: on ? "#FFD700" : empty } }));
  }
  return row;
}

// ══════════════════════════════════════════════════════════════════════
// KPI STAT — variant:
//   panel (org-admin F5: r12 border #14171D bg #0E1014 pad 20 20 18 gap 14; etiket + 30 ikon karo; değer 32/600; alt 13 #A3A7AF)
//   card  (public-b Etkinlik: pad 18 20 r10 border #1F232B gap 6; değer 30/600)
// onClick → <button class="dk-card"> (WebAdmin), active → kenar role@.5
// ══════════════════════════════════════════════════════════════════════
export function dkKpi({ label, value, sub, icon, color = "#FF4FA3", variant = "panel", onClick, active, valueColor, valueIcon, href, cls } = {}) {
  const tile = icon ? h("span", { class: "dk-kpi-ic", style: { background: rgba(color, 0.12), color } }, ic(icon, { size: 16 })) : null;
  const valEl = h("span", { class: "dk-kpi-v", style: valueColor ? { color: valueColor } : null }, valueIcon ? ic(valueIcon, { size: 22, sw: "1.9" }) : null, h("span", { class: "dk-kpi-vt" }, value ?? "—"));
  const inner = variant === "panel"
    ? [h("span", { class: "dk-kpi-top" }, h("span", { class: "dk-kpi-l" }, label), tile), valEl, sub ? h("span", { class: "dk-kpi-s" }, sub) : null]
    : [h("span", { class: "dk-kpi-l" }, label), valEl, sub ? h("span", { class: "dk-kpi-s" }, sub) : null];
  const a = { class: cx("dk-kpi", `dk-kpi-${variant}`, (onClick || href) && "dk-card", active && "is-active", cls), style: { "--dk-kpi-c": color } };
  const el = href ? h("a", { ...a, href }, ...inner) : onClick ? h("button", { ...a, type: "button", onclick: onClick, "aria-pressed": active ? "true" : "false" }, ...inner) : h("div", a, ...inner);
  el.dk = {
    setValue(v) { el.querySelector(".dk-kpi-vt").textContent = v ?? "—"; },
    setSub(s) { const x = el.querySelector(".dk-kpi-s"); if (x) x.textContent = s ?? ""; },
    setActive(on) { el.classList.toggle("is-active", !!on); if (onClick) el.setAttribute("aria-pressed", on ? "true" : "false"); },
  };
  return el;
}

// ══════════════════════════════════════════════════════════════════════
// DATA TABLE (WebAdmin / WebOrgEtkinlikler temel): ızgara tabanlı (role=table), başlık 40px mono, satır .dk-row min-h 68 pad 12 20.
// columns: [{ key, label, width: "minmax(0,1.5fr)"|"140px", align: "left"|"right", render(row) → Node|string }]
// ══════════════════════════════════════════════════════════════════════
export function dkTable({ columns = [], rows = [], rowKey = (r) => r.id, onRowClick, selected, empty = "Kayıt yok", label, gap = 16, pad = 20, rowMinHeight = 68, cls } = {}) {
  const tpl = columns.map((c) => c.width || "minmax(0,1fr)").join(" ");
  const head = h("div", { role: "row", class: "dk-tbl-head", style: { gridTemplateColumns: tpl, gap: gap + "px", padding: `0 ${pad}px` } },
    ...columns.map((c) => h("span", { role: "columnheader", class: "dk-tbl-th", style: { textAlign: c.align || "left" } }, c.label || "")));
  const body = h("div", { role: "rowgroup", class: "dk-tbl-body" });
  const node = h("div", { role: "table", "aria-label": label, class: cx("dk-tbl", cls) }, head, body);
  let sel = selected;
  const draw = (list) => {
    body.replaceChildren();
    if (!list.length) { body.append(h("div", { class: "dk-tbl-empty" }, empty)); return; }
    list.forEach((r) => {
      const k = rowKey(r);
      const row = h("div", { role: "row", class: cx("dk-tbl-row", "dk-row", k === sel && "is-sel"), dataset: { key: String(k) },
        style: { gridTemplateColumns: tpl, gap: gap + "px", padding: `12px ${pad}px`, minHeight: rowMinHeight + "px" } },
      ...columns.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h("div", { role: "cell", class: "dk-tbl-td", style: { justifyContent: c.align === "right" ? "flex-end" : null, textAlign: c.align || null } }, v instanceof Node ? v : v ?? ""); }));
      if (onRowClick) row.addEventListener("click", (e) => { if (e.target.closest("button,a,input,select,textarea") && e.target.closest(".dk-tbl-td") !== e.target.closest(".dk-tbl-td:first-child")) return; onRowClick(r, row); });
      body.append(row);
    });
  };
  draw(rows);
  node.dk = { setRows: (l) => draw(l), select(k) { sel = k; body.querySelectorAll(".dk-tbl-row").forEach((r) => r.classList.toggle("is-sel", r.dataset.key === String(k))); } };
  return node;
}

// ══════════════════════════════════════════════════════════════════════
// EMPTY STATE — dashed (hesap/public: border 1px dashed #2C303A r12; ikon çemberi opsiyonel) | plain (org tablo içi, ikon #5E636D)
// ══════════════════════════════════════════════════════════════════════
// ring: kesikli halka içinde ikon (hesap: WebTakip 64/ikon 28, WebBildirimler 72/ikon 30 → ringSize: 72). Halkalıda varsayılan
// yükseklik 340 (WebTakip; WebBildirimler/WebYorumlarım 320 → height: 320), alt metin en çok 360. Hesap alanında başlık 17 (CSS).
export function dkEmpty({ icon = "info", title, sub, action, height, variant = "dashed", ring = false, ringSize = 64, iconSize, cls, compact } = {}) {
  const icoEl = ic(icon, { size: iconSize || (variant === "plain" ? 30 : ring ? (ringSize >= 72 ? 30 : 28) : 40), sw: variant === "plain" ? "1.6" : ring ? "1.6" : "1.4" });
  const minH = height ?? (ring && variant === "dashed" && !compact ? 340 : null);
  return h("div", { class: cx("dk-empty", `dk-empty-${variant}`, ring && "has-ring", compact && "dk-empty-compact", cls), style: minH ? { minHeight: minH + "px" } : null },
    ring ? h("span", { class: cx("dk-empty-ring", ringSize >= 72 && "is-72") }, icoEl) : icoEl,
    title ? h("span", { class: "dk-empty-t" }, title) : null,
    sub ? h("span", { class: "dk-empty-s" }, sub) : null,
    action || null);
}
// Satır içi durum mesajı (auth InlineMessage): kind err | ok | info | neutral
export function dkInlineMessage(kind, text, { icon } = {}) {
  const icons = { err: "alertCircle", ok: "check", info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5.5M12 7.5v.01"></path>', neutral: "info" };
  const i = icon || icons[kind] || "info";
  const icoEl = i.startsWith("<") ? svgRaw(i, { size: 17, sw: "2" }) : ic(i, { size: 17, sw: "2" });
  icoEl.classList.add("dk-imsg-ic");
  return h("div", { class: cx("dk-imsg", `dk-imsg-${kind}`, "dk-msg") }, icoEl, h("span", {}, text));
}
// VEYA ayırıcı (auth)
export const dkOrDivider = (text = "VEYA") => h("div", { class: "dk-or", "aria-hidden": "true" }, h("span", { class: "dk-or-line" }), h("span", { class: "dk-or-t" }, text), h("span", { class: "dk-or-line" }));

// ══════════════════════════════════════════════════════════════════════
// SKELETON — tasarımda yok; nötr #0E1014→#14171D nabız (reduced-motion'da sabit)
// ══════════════════════════════════════════════════════════════════════
export function dkSkeleton({ w = "100%", h: hh = 16, r = 6, cls, style } = {}) {
  return h("span", { class: cx("dk-skel", cls), "aria-hidden": "true", style: { width: typeof w === "number" ? w + "px" : w, height: typeof hh === "number" ? hh + "px" : hh, borderRadius: r + "px", ...(style || {}) } });
}
// Kart iskeleti: variant overlay (340) | date (184 + gövde) | row (64)
export function dkSkeletonCard(variant = "date") {
  if (variant === "overlay") return h("div", { class: "dk-skel-card dk-skel-card-ov" }, dkSkeleton({ h: 340, r: 10 }));
  if (variant === "row") return h("div", { class: "dk-skel-row" }, dkSkeleton({ w: 44, h: 48, r: 6 }), h("div", { class: "dk-skel-col" }, dkSkeleton({ w: "70%", h: 14 }), dkSkeleton({ w: "45%", h: 12 })));
  return h("div", { class: "dk-skel-card" }, dkSkeleton({ h: 184, r: 0 }), h("div", { class: "dk-skel-body" }, dkSkeleton({ w: "50%", h: 11 }), dkSkeleton({ w: "85%", h: 18 }), dkSkeleton({ w: "60%", h: 13 })));
}

// ══════════════════════════════════════════════════════════════════════
// CAROUSEL İLKELLERİ — Keşfet HeroCarousel (noktalar + oklar) ve Top 10 izi (translateX kaydırma)
// ══════════════════════════════════════════════════════════════════════
// Noktalar: role=tablist, h6 r3, aktif 24 #F2F1EE / pasif 8 rgba(242,241,238,.3), gap 6; "{i} / {n}" etiketi
export function dkCarouselDots({ count = 0, index = 0, onPick, titles = [], showLabel = true, label = "Slaytlar" } = {}) {
  const dots = h("div", { role: "tablist", "aria-label": label, class: "dk-car-dots" });
  const lab = showLabel ? h("span", { class: "dk-car-lbl" }) : null;
  const btns = [];
  for (let i = 0; i < count; i++) {
    const b = h("button", { type: "button", role: "tab", class: "dk-car-dot", "aria-label": `Slayt ${i + 1} / ${count}${titles[i] ? ": " + titles[i] : ""}`, onclick: () => onPick?.(i) });
    btns.push(b); dots.append(b);
  }
  dots.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); onPick?.((index + 1) % count); btns[(index) % count]?.focus(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); onPick?.((index - 1 + count) % count); btns[index]?.focus(); }
  });
  const set = (i) => { index = i; btns.forEach((b, j) => { const on = j === i; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; }); if (lab) lab.textContent = `${i + 1} / ${count}`; };
  set(index);
  const node = h("div", { class: "dk-car-dotsrow" }, dots, lab);
  node.dk = { set };
  return node;
}
// Oklar: variant overlay (hero: 40 daire border rgba(242,241,238,.22) bg rgba(6,7,10,.6)) | outline (Top 10: 40 daire border #2C303A şeffaf)
export function dkCarouselArrows({ onPrev, onNext, variant = "overlay", labels = ["Önceki", "Sonraki"] } = {}) {
  const mk = (dir, fn, lbl) => h("button", { type: "button", class: cx("dk-car-arrow", `dk-car-arrow-${variant}`, "dk-press"), "aria-label": lbl, onclick: fn }, svgIcon(dir, { size: 16 }));
  const prev = mk("chevronLeft", onPrev, labels[0]);
  const next = mk("chevronRight", onNext, labels[1]);
  const node = h("div", { class: "dk-car-arrows" }, prev, next);
  node.dk = { setDisabled(p, n) { prev.disabled = !!p; next.disabled = !!n; }, prev, next };
  return node;
}
// İz (track): overflow hidden + iç flex; set(offset) → translateX(-offset*step) 480ms
export function dkTrack({ step = 320, gap = 20, cls } = {}) {
  const inner = h("div", { class: "dk-track-in", style: { gap: gap + "px" } });
  const node = h("div", { class: cx("dk-track", cls) }, inner);
  node.dk = { inner, set(off) { inner.style.transform = `translateX(${-off * step}px)`; } };
  return node;
}

// ══════════════════════════════════════════════════════════════════════
// FOLLOW BUTTON (public-a notu 8): variant card (tam genişlik h36 mono) | row (h38 pad 0 16 mono) | rail (h32 cümle "Takip et"/"Takipte")
// ══════════════════════════════════════════════════════════════════════
export function dkFollowButton({ followed = false, onToggle, variant = "card", name = "", labels } = {}) {
  const L = labels || (variant === "rail" ? ["Takip et", "Takipte"] : ["TAKİP ET", "TAKİP"]);
  const b = h("button", { type: "button", class: cx("dk-fol", `dk-fol-${variant}`, "dk-press") });
  const set = (on) => {
    followed = !!on;
    b.classList.toggle("is-on", followed);
    b.setAttribute("aria-pressed", followed ? "true" : "false");
    b.textContent = followed ? L[1] : L[0];
    if (name) b.setAttribute("aria-label", followed ? `${name} takip ediliyor` : `${name} takip et`);
  };
  set(followed);
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!onToggle) { set(!followed); return; }
    const prev = followed; set(!prev); b.disabled = true;
    try { const r = await onToggle(!prev); if (r === false) set(prev); } catch (_) { set(prev); } finally { b.disabled = false; }
  });
  b.dk = { set, get: () => followed };
  return b;
}
