// CITY PICKER (public-a §0.8; WebKesfet satır 108–126) — PublicHeader şehir düğmesi + Keşfet hero ŞEHİR segmenti ORTAK.
// Tek doğruluk kaynağı: localStorage "gb_city" (helpers.getActiveCity/setActiveCity; legacy Keşfet ile ortak).
// Seçimde window'a "dk:citychange" (detail: { city }) olayı yayılır → açık görünümler dinleyip yeniden süzebilir.
// "Konumumu kullan": legacy customer.js:179–193 akışı (geolocation + Nominatim ters coğrafi kodlama, aynı toast metinleri).
import { h } from "../../ui.js";
import { svgIcon, svgRaw } from "./icons.js";
import { PROVINCES, ALL_CITIES, getActiveCity, setActiveCity, fold, sortTR } from "./helpers.js";
import { dkPopover, dkToast } from "./overlays.js";

const cx = (...c) => c.flat().filter(Boolean).join(" ");
export const CITY_EVENT = "dk:citychange";
// Son alınan kullanıcı konumu (mesafe hesapları için; legacy userCoords karşılığı)
export let lastCoords = null;

// Liste sırası: TÜMÜ → etkinliği olan şehirler (sayıya göre azalan) → kalan 81 il (tr sıralı)
function orderedCities(counts) {
  const withEv = Object.keys(counts || {}).filter((c) => c !== ALL_CITIES && counts[c] > 0)
    .sort((a, b) => (counts[b] - counts[a]) || sortTR(a, b));
  const seen = new Set(withEv.map(fold));
  return [ALL_CITIES, ...withEv, ...PROVINCES.filter((p) => !seen.has(fold(p)))];
}
const countOf = (counts, c) => {
  if (!counts) return 0;
  if (c === ALL_CITIES) return counts[ALL_CITIES] ?? Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
  const k = Object.keys(counts).find((x) => fold(x) === fold(c));
  return k ? Number(counts[k]) || 0 : 0;
};

export async function locateCity() {
  if (!navigator.geolocation) { dkToast("Konum desteklenmiyor", { type: "err" }); return null; }
  const pos = await new Promise((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 12000, maximumAge: 300000 }));
  if (!pos) { dkToast("Konum alınamadı (izin?)", { type: "err" }); return null; }
  lastCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lastCoords.lat}&lon=${lastCoords.lng}&accept-language=tr`);
    const j = await r.json();
    const prov = j.address?.province || j.address?.state || j.address?.city || "";
    const match = PROVINCES.find((p) => fold(p) === fold(prov));
    if (match) return match;
  } catch (_) {}
  dkToast("Şehir belirlenemedi", { type: "err" });
  return null;
}

// Popover içeriği (320px, pad 12, r10, border #2C303A, bg #0A0B0F, gap 10). Dönüş: { node, setValue, setCounts, input }
export function cityPicker({ value = getActiveCity(), counts = null, onPick, locate = true } = {}) {
  let cur = value, cnt = counts;
  const input = h("input", { type: "search", "aria-label": "Şehir ara", placeholder: "Şehir ara...", class: "dk-cp-q", autocomplete: "off" });
  const list = h("div", { role: "listbox", "aria-label": "Şehirler", class: "dk-cp-list dk-scroll" });
  const draw = () => {
    const q = fold(input.value.trim());
    const names = orderedCities(cnt).filter((c) => !q || fold(c).includes(q));
    list.replaceChildren();
    if (!names.length) { list.append(h("span", { class: "dk-cp-empty" }, "Şehir bulunamadı")); return; }
    names.forEach((c) => {
      const on = fold(c) === fold(cur);
      const n = countOf(cnt, c);
      list.append(h("button", { type: "button", role: "option", "aria-selected": on ? "true" : "false", class: cx("dk-cp-opt", on && "is-on"), onclick: () => pick(c) },
        h("span", {}, c), h("span", { class: "dk-cp-n" }, n ? String(n) : "")));
    });
  };
  const pick = (c) => { cur = c; setActiveCity(c); draw(); window.dispatchEvent(new CustomEvent(CITY_EVENT, { detail: { city: c } })); onPick?.(c); };
  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); list.querySelector("button")?.focus(); }
    if (e.key === "Enter") { e.preventDefault(); const first = list.querySelector("button"); if (first) first.click(); }
  });
  list.addEventListener("keydown", (e) => {
    const opts = [...list.querySelectorAll("button")]; const i = opts.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && i < opts.length - 1) { e.preventDefault(); opts[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? opts[i - 1] : input).focus(); }
  });
  const locBtn = locate ? h("button", { type: "button", class: "dk-cp-loc dk-press" },
    svgRaw('<path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.6 1.6 6.6c.2.8 1.3.9 1.6.1z"></path>', { size: 15, fill: true, color: "#4ED8FF" }), h("span", {}, "Konumumu kullan")) : null;
  if (locBtn) locBtn.addEventListener("click", async () => {
    locBtn.disabled = true;
    try { const c = await locateCity(); if (c) { pick(c); dkToast(c + " olarak ayarlandı"); } } finally { locBtn.disabled = false; }
  });
  const node = h("div", { class: "dk-cp" }, locBtn,
    h("label", { class: "dk-cp-search" }, svgIcon("search", { size: 14, color: "#8A8E97" }), input), list);
  draw();
  return { node, input, setValue(c) { cur = c; draw(); }, setCounts(c) { cnt = c; draw(); } };
}

// Şehir düğmesi + popover (PublicHeader): h40 pad 0 12 r6 border #1F232B bg #0E1014 14/500 gap 8; pin 15 #4ED8FF + ad + chevron 14 #8A8E97.
// Dönüş: { node, setCity(c), setCounts(counts), open(), close(), destroy() }
export function cityButton({ counts = null, onPick, allLabel = "Tüm şehirler", cls } = {}) {
  let cnt = counts, pop = null;
  const label = h("span", { class: "dk-citybtn-l" });
  const btn = h("button", { type: "button", class: cx("dk-citybtn", "dk-press", cls), "aria-haspopup": "dialog", "aria-expanded": "false" },
    svgIcon("pin", { size: 15, color: "#4ED8FF" }), label, svgIcon("chevronDown", { size: 14, color: "#8A8E97", cls: "dk-citybtn-chev" }));
  const setCity = (c) => {
    const v = c || getActiveCity();
    const shown = v === ALL_CITIES ? allLabel : v;
    label.textContent = shown;
    btn.setAttribute("aria-label", `Şehir seç, şu an ${shown}`);
  };
  const close = () => { pop?.close(); pop = null; };
  const open = () => {
    if (pop) return close();
    const cp = cityPicker({ counts: cnt, onPick: (c) => { setCity(c); close(); btn.focus({ preventScroll: true }); onPick?.(c); } });
    pop = dkPopover({ anchor: btn, content: cp.node, label: "Şehir seç", width: 320, offset: 8, cls: "dk-cp-pop", onClose: () => { pop = null; btn.classList.remove("is-open"); } });
    btn.classList.add("is-open");
    requestAnimationFrame(() => cp.input.focus({ preventScroll: true }));
  };
  btn.addEventListener("click", open);
  const onExt = (e) => setCity(e.detail?.city);
  window.addEventListener(CITY_EVENT, onExt);
  setCity();
  return { node: btn, setCity, setCounts(c) { cnt = c; }, open, close, destroy() { close(); window.removeEventListener(CITY_EVENT, onExt); } };
}
