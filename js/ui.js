// UI yardımcıları — hyperscript h() + ortak bileşenler (app tasarımına uygun).

// h('div', {class:'x', onclick:fn, html:'<b>', dataset:{id:1}}, child, [child2], 'text')
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith("--")) el.style.setProperty(sk, sv);  // CSS değişkenleri Object.assign ile atanmaz
        else el.style[sk] = sv;
      }
    }
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function mount(node) { const app = document.getElementById("app"); clear(app); app.append(node); return node; }

// Ionicons
export function icon(name, opts = {}) {
  const el = document.createElement("ion-icon");
  el.setAttribute("name", name);
  if (opts.size) el.style.fontSize = typeof opts.size === "number" ? opts.size + "px" : opts.size;
  if (opts.color) el.style.color = opts.color;
  return el;
}

export const ROLE = {
  customer: "#06B6D4", artist: "#A855F7", venue: "#F59E0B", organizer: "#F43F5E", admin: "#A855F7",
};

// ── Bileşenler ──
export function spinner() { return h("div", { class: "spinner" }); }

export function avatar(name = "?", color = ROLE.venue) {
  return h("div", { class: "avatar", style: { background: `linear-gradient(135deg, ${color}, ${shade(color)})` } },
    (name || "?").trim().charAt(0).toUpperCase());
}

export function badge(label, color = ROLE.venue, ic) {
  return h("span", { class: "badge", style: { color, borderColor: color + "66", background: color + "1f" } },
    ic ? icon(ic, { size: 11, color }) : null, label);
}

export function btn(label, { variant = "primary", onClick, ic, disabled, full, color } = {}) {
  const b = h("button", { class: `btn btn-${variant}${full ? " btn-full" : ""}`, disabled: !!disabled,
    onclick: onClick, style: color ? { background: color } : null },
    ic ? icon(ic, { size: 16 }) : null, h("span", {}, label));
  return b;
}

export function field({ label, id, type = "text", placeholder, value = "", hint, list, options, multiline }) {
  const input = multiline
    ? h("textarea", { id, placeholder, rows: 3 }, value)
    : options
      ? h("select", { id }, ...options.map((o) => h("option", { value: o.value, selected: o.value === value ? true : null }, o.label)))
      : h("input", { id, type, placeholder, value, list });
  return h("label", { class: "field" },
    label ? h("span", { class: "flabel" }, label) : null,
    input,
    hint ? h("span", { class: "fhint" }, hint) : null,
  );
}

// Fotoğraf seçici — { node, getFile }. Seçilen dosya submit'te uploadImage ile yüklenir.
// currentUrl verilirse mevcut fotoğraf önizleme olarak gösterilir (profil fotoğrafı düzenleme).
export function photoPicker(label = "Fotoğraf ekle (opsiyonel)", currentUrl) {
  let file = null;
  const box = h("div", { class: "photo-box" }, icon("image-outline", { size: 26, color: "#6b6b82" }), h("span", { class: "photo-hint" }, label));
  if (currentUrl) {
    box.style.backgroundImage = `url(${currentUrl})`;
    box.classList.add("has-img"); clear(box);
    box.append(h("span", { class: "photo-edit" }, icon("camera", { size: 13, color: "#fff" }), " Değiştir"));
  }
  const input = h("input", { type: "file", accept: "image/*", class: "photo-input", onchange: (e) => {
    file = (e.target.files || [])[0] || null;
    if (file) {
      box.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
      box.classList.add("has-img"); clear(box);
      box.append(h("span", { class: "photo-edit" }, icon("camera", { size: 13, color: "#fff" }), " Değiştir"));
    }
  } });
  return { node: h("label", { class: "photo-wrap" }, box, input), getFile: () => file };
}

export function card(...kids) { return h("div", { class: "card" }, ...kids); }

export function section(title, subtitle, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head" },
      h("h2", { class: "sect-title" }, title),
      subtitle ? h("p", { class: "sect-sub" }, subtitle) : null,
    ),
    ...kids,
  );
}

export function empty(ic, title, sub) {
  return h("div", { class: "empty" }, icon(ic, { size: 40, color: "#6b6b82" }),
    h("p", { class: "empty-title" }, title), sub ? h("p", { class: "empty-sub" }, sub) : null);
}

export function row(...kids) { return h("div", { class: "hrow" }, ...kids); }

// Üst bar + geri
export function topbar(title, { subtitle, right, color = ROLE.venue } = {}) {
  return h("header", { class: "topbar", style: { "--role": color } },
    h("div", {},
      h("div", { class: "tb-brand" }, h("span", { class: "brand-dot" }), h("span", {}, "GigBridge")),
      h("h1", { class: "tb-title" }, title),
      subtitle ? h("p", { class: "tb-sub" }, subtitle) : null,
    ),
    right || null,
  );
}

// Alt sekme çubuğu (app gibi)
export function bottomnav(items, active, color = ROLE.venue) {
  return h("nav", { class: "bottomnav", style: { "--role": color } },
    ...items.map((it) => h("a", { class: "bn-item" + (it.key === active ? " active" : ""), href: it.href },
      icon(it.key === active ? it.icon.replace("-outline", "") : it.icon, { size: 22 }),
      h("span", {}, it.label))));
}

// Toast
export function toast(msg, type = "ok") {
  const t = h("div", { class: `toast ${type}` }, icon(type === "err" ? "alert-circle" : "checkmark-circle", { size: 16 }), h("span", {}, msg));
  document.getElementById("toasts").append(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, 3200);
}

// Modal
export function modal({ title, body, actions = [], onClose }) {
  const root = document.getElementById("modal-root");
  const close = () => { overlay.remove(); onClose && onClose(); };
  const overlay = h("div", { class: "modal-overlay", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "modal" },
      h("div", { class: "modal-head" }, h("h3", {}, title),
        h("button", { class: "modal-x", onclick: close }, icon("close", { size: 20 }))),
      h("div", { class: "modal-body" }, body),
      actions.length ? h("div", { class: "modal-actions" },
        ...actions.map((a) => btn(a.label, { variant: a.variant || "primary", ic: a.ic,
          onClick: async () => { if (a.keepOpen) { await a.onClick(close); } else { await a.onClick(close); close(); } } }))) : null,
    ));
  root.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  return { close };
}

function shade(hex) {
  try { const n = parseInt(hex.slice(1), 16); const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); } catch { return hex; }
}

// Tarih yardımcıları
export function fmtDate(v) {
  try { if (!v) return ""; const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    if (isNaN(d)) return typeof v === "string" ? v : ""; return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; }
}
export function fmtTL(n) { const x = Number(n); return isFinite(x) && x > 0 ? "₺" + x.toLocaleString("tr-TR") : "—"; }

// Leaflet haritasını tek sefer dinamik yükle → window.L (harita + konum pin)
let _leaflet = null;
export function loadLeaflet() {
  if (_leaflet) return _leaflet;
  _leaflet = new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (!document.querySelector("link[data-leaflet]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      css.setAttribute("data-leaflet", "1"); document.head.append(css);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve(window.L); s.onerror = reject; document.head.append(s);
  });
  return _leaflet;
}


/* Native append(): null/false cocuklari atla — venue detay 'null' fix (Claude) */
const _origAppend = Element.prototype.append;
Element.prototype.append = function(...kids){ return _origAppend.apply(this, kids.filter(x => x != null && x !== false)); };
