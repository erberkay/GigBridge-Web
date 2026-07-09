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
export function mount(node) {
  const app = document.getElementById("app"); clear(app); app.append(node);
  // Sayfa geçişi: detay sayfaları spinner'la açılıp async içerik dolunca "pat" diye görünüyordu.
  // Spinner gidince (içerik geldi) geçiş animasyonu BİTTİYSE bir kez tekrar oynat (içerik kaysın);
  // hâlâ oynuyorsa dokunma (içerik zaten kayan kabın içinde doğal olarak kayıyor).
  const dp = node.querySelector && node.querySelector(".ed-page, .pd-page, .at-page, .dsh-content");
  if (dp && dp.querySelector(".loading")) {
    let done = false;
    const obs = new MutationObserver(() => {
      if (done || dp.querySelector(".loading")) return;
      done = true; obs.disconnect();
      const anims = dp.getAnimations ? dp.getAnimations() : [];
      if (!anims.some((a) => a.playState === "running")) { dp.style.animation = "none"; void dp.offsetWidth; dp.style.animation = ""; }
    });
    obs.observe(dp, { childList: true });
    setTimeout(() => obs.disconnect(), 3000);
  }
  return node;
}

// Ionicons
export function icon(name, opts = {}) {
  const el = document.createElement("ion-icon");
  el.setAttribute("name", name);
  if (opts.size) el.style.fontSize = typeof opts.size === "number" ? opts.size + "px" : opts.size;
  if (opts.color) el.style.color = opts.color;
  return el;
}

export const ROLE = {
  // Aether prizma paleti: cyan / magenta / amber (organizatör + admin = magenta)
  customer: "#4ED8FF", artist: "#FF4FA3", venue: "#FF8A2A", organizer: "#FF4FA3", admin: "#FF4FA3",
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

// Türkçe-duyarlı arama katlaması (customer.js fold ile aynı: "sisli" → "Şişli" bulur)
const _CITY_TRX = { "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u", "â": "a", "î": "i", "û": "u" };
export const foldTR = (s) => String(s || "").replace(/[ıİşŞçÇğĞöÖüÜâîû]/g, (c) => _CITY_TRX[c] || c).toLowerCase();

// Özel şehir seçici — native <datalist> yerine Keşfet popover'ıyla birebir (global .hs-city-* CSS,
// müşteri tarafıyla aynı görünüm + app SearchablePickerModal paritesi). Dışarı tıklayınca kapanır.
//  cities   : "Tümü" HARİÇ il listesi
//  allLabel : ilk (varsayılan) satır = tüm şehirler; seçilirse onPick("") çağrılır
//  onPick(v): v = seçilen il ("" = tümü). Döner: { el, value (getter, "" = tümü), close }
export function cityPickerField({ cities, value = "Tümü", allLabel = "Tümü", placeholder = "Şehir ara...", onPick } = {}) {
  let current = value || allLabel;
  const names = [allLabel, ...cities];
  const nameEl = h("span", { class: "kx-cityname" }, current);
  const chev = icon("chevron-down", { size: 15, color: "var(--text-muted)" });
  const trigger = h("button", { type: "button", class: "kx-cityfield" + (current === allLabel ? " placeholder" : "") }, nameEl, chev);
  const search = h("input", { placeholder, oninput: () => drawList() });
  const listBox = h("div", { class: "hs-citylist" });
  const drop = h("div", { class: "hs-citydrop", style: { display: "none" } },
    h("div", { class: "hs-citysearch" }, icon("search-outline", { size: 14, color: "var(--text-muted)" }), search),
    listBox);
  const wrap = h("div", { class: "hs-citywrap kx-citywrap" }, trigger, drop);
  let open = false;
  const setOpen = (v) => {
    open = v;
    drop.style.display = v ? "" : "none";
    trigger.classList.toggle("open", v);
    chev.setAttribute("name", v ? "chevron-up" : "chevron-down");
    chev.style.color = v ? "#FF4FA3" : "var(--text-muted)";
    if (v) { search.value = ""; drawList(); setTimeout(() => search.focus(), 0); }
  };
  const pick = (c) => {
    current = c; nameEl.textContent = c;
    trigger.classList.toggle("placeholder", c === allLabel);
    setOpen(false);
    if (onPick) onPick(c === allLabel ? "" : c);
  };
  const drawList = () => {
    clear(listBox);
    const q = foldTR(search.value.trim());
    const list = names.filter((c) => !q || foldTR(c).includes(q));
    if (!list.length) { listBox.append(h("div", { class: "hs-city-empty" }, "Şehir bulunamadı")); return; }
    list.forEach((c) => listBox.append(
      h("button", { type: "button", class: "hs-city-item" + (c === current ? " on" : ""), onclick: (e) => { e.stopPropagation(); pick(c); } }, c)));
  };
  trigger.onclick = (e) => { e.stopPropagation(); setOpen(!open); };
  const onDoc = (e) => {
    if (!open) return;
    if (wrap.contains(e.target)) return;
    if (!wrap.isConnected) { document.removeEventListener("click", onDoc); return; }
    setOpen(false);
  };
  document.addEventListener("click", onDoc);
  drawList();
  return { el: wrap, get value() { return current === allLabel ? "" : current; }, close: () => setOpen(false) };
}

// Görsel kırpma/konumlandırma modalı (app allowsEditing muadili): kullanıcı fotoğrafı
// sürükleyip yakınlaştırarak çerçeveye göre konumlandırır. Promise<Blob|null> döndürür
// (İptal → null). aspect = genişlik/yükseklik (avatar 1, banner 16/9). round → yuvarlak çerçeve.
export function openImageCropper(file, { aspect = 1, round = false } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => {
      const SW = Math.min(340, (window.innerWidth || 360) - 72);
      const SH = Math.round(SW / aspect);
      const cover = Math.max(SW / img.naturalWidth, SH / img.naturalHeight);
      let z = 1, ox = 0, oy = 0;                       // zoom çarpanı + görüntü konumu
      const dw = () => img.naturalWidth * cover * z;
      const dh = () => img.naturalHeight * cover * z;
      ox = (SW - dw()) / 2; oy = (SH - dh()) / 2;

      const imgEl = h("img", { src: url, class: "cr-img", draggable: false });
      const stage = h("div", { class: "cr-stage" + (round ? " round" : "") }, imgEl, h("div", { class: "cr-frame" + (round ? " round" : "") }));
      const zoom = h("input", { type: "range", min: "1", max: "3", step: "0.01", value: "1", class: "cr-zoom" });
      stage.style.width = SW + "px"; stage.style.height = SH + "px";

      const clamp = () => { ox = Math.min(0, Math.max(SW - dw(), ox)); oy = Math.min(0, Math.max(SH - dh(), oy)); };
      const apply = () => { clamp(); imgEl.style.width = dw() + "px"; imgEl.style.height = dh() + "px"; imgEl.style.transform = `translate(${ox}px, ${oy}px)`; };
      apply();

      let drag = null;
      stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; try { stage.setPointerCapture(e.pointerId); } catch (_) {} });
      stage.addEventListener("pointermove", (e) => { if (!drag) return; ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); apply(); });
      const endDrag = () => { drag = null; };
      stage.addEventListener("pointerup", endDrag);
      stage.addEventListener("pointercancel", endDrag);
      zoom.addEventListener("input", () => {
        const nz = parseFloat(zoom.value), cx = SW / 2, cy = SH / 2;
        const pre = cover * z, post = cover * nz;
        const nx = (cx - ox) / pre, ny = (cy - oy) / pre;   // merkezdeki natural nokta sabit
        z = nz; ox = cx - nx * post; oy = cy - ny * post; apply();
      });

      const cleanup = () => { overlay.remove(); URL.revokeObjectURL(url); };
      const cancel = () => { cleanup(); resolve(null); };
      const done = () => {
        const s = cover * z;
        const tW = (aspect === 1) ? 640 : 1280, tH = Math.round(tW / aspect);
        const cv = document.createElement("canvas"); cv.width = tW; cv.height = tH;
        cv.getContext("2d").drawImage(img, -ox / s, -oy / s, SW / s, SH / s, 0, 0, tW, tH);
        cv.toBlob((blob) => { cleanup(); resolve(blob); }, "image/jpeg", 0.9);
      };

      const overlay = h("div", { class: "cr-overlay", onclick: (e) => { if (e.target === overlay) cancel(); } },
        h("div", { class: "cr-panel" },
          h("div", { class: "cr-title" }, "Fotoğrafı Konumlandır"),
          h("div", { class: "cr-hint" }, "Sürükle ve yakınlaştırarak çerçeveyi doldur."),
          stage,
          h("div", { class: "cr-zoomrow" }, icon("remove-outline", { size: 16, color: "#8A8E97" }), zoom, icon("add-outline", { size: 16, color: "#8A8E97" })),
          h("div", { class: "cr-actions" },
            h("button", { class: "btn btn-ghost", type: "button", onclick: cancel }, "İptal"),
            h("button", { class: "btn", type: "button", onclick: done }, "Uygula"),
          ),
        ),
      );
      (document.getElementById("modal-root") || document.body).append(overlay);
    };
    img.src = url;
  });
}

// Fotoğraf seçici — { node, getFile }. Seçilen dosya KIRPMA modalından geçer (sürükle+zoom),
// getFile() kırpılmış Blob döndürür. opts: { aspect (gen/yük), round }. currentUrl → mevcut önizleme.
export function photoPicker(label = "Fotoğraf ekle (opsiyonel)", currentUrl, opts = {}) {
  let file = null;
  const setPreview = (bg) => {
    box.style.backgroundImage = `url(${bg})`;
    box.classList.add("has-img"); clear(box);
    box.append(h("span", { class: "photo-edit" }, icon("camera", { size: 13, color: "#fff" }), " Değiştir"));
  };
  const box = h("div", { class: "photo-box" }, icon("image-outline", { size: 26, color: "#6b6b82" }), h("span", { class: "photo-hint" }, label));
  if (currentUrl) setPreview(currentUrl);
  const input = h("input", { type: "file", accept: "image/*", class: "photo-input", onchange: async (e) => {
    const picked = (e.target.files || [])[0] || null;
    e.target.value = "";                              // aynı dosya tekrar seçilebilsin
    if (!picked) return;
    const cropped = await openImageCropper(picked, { aspect: opts.aspect || 1, round: !!opts.round });
    if (!cropped) return;                             // kullanıcı iptal etti
    file = cropped;
    setPreview(URL.createObjectURL(cropped));
  } });
  return { node: h("label", { class: "photo-wrap" }, box, input), getFile: () => file };
}

// Hazır KAPAK (banner) seçici — sanatçı kendi görselini YÜKLEMEZ; bizim statik olarak
// barındırdığımız hazır banner'lardan seçer (GitHub Pages, ücretsiz → yükleme/fatura yok).
// getUrl() seçili banner URL'ini (ya da null) döndürür; kaydederken bannerUrl'e yazılır.
const BANNER_BASE = "https://gigbridges.com/assets/banners/";
export const BANNER_PRESETS = [
  { url: BANNER_BASE + "banner1.jpg", label: "Mor Işık" },
  { url: BANNER_BASE + "banner4.jpg", label: "Galaksi" },
  { url: BANNER_BASE + "banner3.jpg", label: "CD" },
  { url: BANNER_BASE + "banner2.jpg", label: "Neon" },
];
export function bannerPresetPicker(currentUrl) {
  let sel = currentUrl || null;
  const grid = h("div", { class: "bnp-grid" });
  const render = () => {
    clear(grid);
    grid.append(h("button", { type: "button", class: "bnp-cell bnp-none" + (!sel ? " on" : ""), onclick: () => { sel = null; render(); } },
      icon("close-outline", { size: 16 }), h("span", {}, "Yok")));
    BANNER_PRESETS.forEach((b) => {
      const on = sel === b.url;
      grid.append(h("button", { type: "button", class: "bnp-cell" + (on ? " on" : ""), title: b.label,
        style: { backgroundImage: `url(${b.url})` }, onclick: () => { sel = b.url; render(); } },
        on ? icon("checkmark-circle", { size: 22, color: "#fff" }) : null));
    });
  };
  render();
  return { node: h("div", { class: "bnp-wrap" }, grid), getUrl: () => sel };
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
    // Masaüstü kenar çubuğu markası: logo ikonu + "GigBridge" (mobil alt-barda gizli).
    h("div", { class: "bn-brand" },
      h("img", { class: "bn-logo", src: "assets/logo-icon.svg", alt: "GigBridge", width: 30, height: 30 }),
      h("span", {}, "GigBridge")),
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

// Fotoğraf büyüteci — profil/kapak fotoğrafını tam ekran gösterir (tıkla-kapat).
export function lightbox(url) {
  if (!url) return;
  const overlay = h("div", { class: "lb-overlay", onclick: () => close() },
    h("img", { class: "lb-img", src: url, alt: "", onclick: (e) => e.stopPropagation() }),
    h("button", { class: "lb-close", "aria-label": "Kapat", onclick: () => close() }, icon("close", { size: 22 })));
  const close = () => { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 180); };
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
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
