// AJANS — masaüstü ortak parçalar (kayıt/rol tamamlama, ajans paneli ve "Ajans Bul" kullanır). CSS: css/dk-ajans.css (.dk-ag-*).
// Tasarım tuvalinde ajans ekranı YOK → yeni görsel dil icat edilmez: ortak kit (dkChip, dkInput, dkButton, dkModal…) + mevcut
// sayfa kalıpları (org kırpıcı sarmalayıcısı, panel sohbet açma) birebir kullanılır.
import { h, openImageCropper } from "../../ui.js";
import { svgPath } from "../shared/icons.js";
import { cx, uid, dkChip, dkInput, dkButton, dkModal, dkIconButton } from "../shared/ui.js";
import { convIdFor } from "../../data.js";
import { session } from "../../store.js";
import {
  AGENCY_COLOR, SERVICE_PRESETS, SERVICES_MAX, SERVICE_NAME_MAX, isPresetService, serviceLabel, serviceIcon, normalizeServices,
} from "../../agency-data.js";

export { AGENCY_COLOR };
// İlan durum rozetleri (dkStatusBadge nesne biçimi)
export const ST_LIVE = { label: "Yayında", color: "#7CE0B0" };
export const ST_DRAFT = { label: "Taslak", color: "#8A8E97" };

// Hizmet ikonu (hazır hizmette kendi ikonu, özel hizmette etiket) — 24px stroke yolu
export const serviceIco = (key, size = 14, o = {}) => svgPath(serviceIcon(key), { size, sw: "2", ...o });

// Salt-okuma hizmet etiketi (kartlar / ayrıntı): h26 hap, ikon + ad
export function serviceTag(key, { size = "sm" } = {}) {
  return h("span", { class: cx("dk-ag-tag", size === "md" && "is-md") }, serviceIco(key, size === "md" ? 14 : 12), h("span", {}, serviceLabel(key)));
}

// ── Hizmet seçici (kayıt / rol tamamlama / profil) ──
// Hazır 3 hizmet: basılı çipler (aria-pressed) · özel hizmetler: "＋ Hizmet ekle" → satır içi alan (≤ 40 karakter) → kaldırılabilir çip.
// En çok 10. Dönüş: { node, get() → string[], set(list), focus(), setInvalid(on) }
export function servicesEditor({ value = [], onChange, labelledBy, size = 36 } = {}) {
  let list = normalizeServices(value).slice(0, SERVICES_MAX);
  const chips = h("div", { class: "dk-ag-svc-list" });
  const group = h("div", { class: "dk-ag-svc", role: "group", "aria-labelledby": labelledBy || null });
  const count = h("span", { class: "dk-ag-svc-n", "aria-live": "polite" });
  const nameIn = dkInput({ size: 44, maxlength: SERVICE_NAME_MAX, placeholder: "Örn. Drone Çekimi", autocomplete: "off", attrs: { "aria-label": "Yeni hizmet adı" } });
  const addOk = dkButton("Ekle", { variant: "outline", size: 44 });
  const addCancel = dkButton("Vazgeç", { variant: "ghost", size: 44 });
  const newRow = h("div", { class: "dk-ag-svc-new", hidden: true }, nameIn, addOk, addCancel);
  const err = h("span", { class: "dk-ag-svc-err", role: "alert" });
  group.append(chips, newRow, h("div", { class: "dk-ag-svc-foot" }, count, err));

  const emit = () => { try { onChange?.([...list]); } catch (_) {} };
  const has = (v) => list.some((x) => x.toLocaleLowerCase("tr-TR") === String(v).trim().toLocaleLowerCase("tr-TR"));
  function toggle(key) {
    if (list.includes(key)) list = list.filter((x) => x !== key);
    else {
      if (list.length >= SERVICES_MAX) { err.textContent = `En çok ${SERVICES_MAX} hizmet ekleyebilirsin.`; return; }
      list = [...list, key];
    }
    err.textContent = "";
    draw(); emit();
    chips.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
  }
  function removeCustom(v, idx) {
    list = list.filter((x) => x !== v);
    err.textContent = "";
    draw(); emit();
    // odak: bir sonraki özel hizmetin kaldırma düğmesi ya da "Hizmet ekle"
    const xs = [...chips.querySelectorAll(".dk-ag-svc-x")];
    (xs[Math.min(idx, xs.length - 1)] || addBtn).focus();
  }
  function openNew() {
    if (list.length >= SERVICES_MAX) { err.textContent = `En çok ${SERVICES_MAX} hizmet ekleyebilirsin.`; return; }
    newRow.hidden = false; addBtn.hidden = true;
    nameIn.value = ""; err.textContent = "";
    nameIn.focus(); // eşzamanlı: gizlenen "Hizmet ekle" düğmesinden odak gövdeye düşmesin
  }
  function closeNew(focusAdd = true) {
    newRow.hidden = true; addBtn.hidden = false;
    if (focusAdd) addBtn.focus();
  }
  function commitNew() {
    const v = nameIn.value.trim().replace(/\s+/g, " ");
    if (!v) { err.textContent = "Hizmet adını yaz."; nameIn.focus(); return; }
    if (v.length > SERVICE_NAME_MAX) { err.textContent = `Hizmet adı en çok ${SERVICE_NAME_MAX} karakter olmalı.`; nameIn.focus(); return; }
    // hazır hizmetin adı yazılırsa o hazır hizmet seçilir (anahtar yazılır)
    const preset = SERVICE_PRESETS.find((p) => p.label.toLocaleLowerCase("tr-TR") === v.toLocaleLowerCase("tr-TR"));
    const val = preset ? preset.key : v;
    if (has(val)) { err.textContent = "Bu hizmet zaten listede."; nameIn.focus(); return; }
    if (list.length >= SERVICES_MAX) { err.textContent = `En çok ${SERVICES_MAX} hizmet ekleyebilirsin.`; return; }
    list = [...list, val];
    err.textContent = "";
    draw(); emit();
    closeNew();
  }
  nameIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); commitNew(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeNew(); }
  });
  addOk.addEventListener("click", commitNew);
  addCancel.addEventListener("click", () => closeNew());

  const addBtn = h("button", { type: "button", class: cx("dk-chip", `dk-chip-${size}`, "dk-press", "dk-ag-svc-add") }, h("span", {}, "＋ Hizmet ekle"));
  addBtn.addEventListener("click", openNew);

  function draw() {
    const presets = SERVICE_PRESETS.map((p) => {
      const c = dkChip({ label: p.label, size, pressed: list.includes(p.key), icon: serviceIco(p.key, 14), onClick: () => toggle(p.key) });
      c.dataset.key = p.key;
      c.title = p.desc;
      return c;
    });
    const customs = list.filter((x) => !isPresetService(x)).map((v, i) =>
      h("span", { class: cx("dk-chip", `dk-chip-${size}`, "is-on", "dk-ag-svc-cu") },
        serviceIco(v, 14), h("span", {}, v),
        h("button", { type: "button", class: "dk-ag-svc-x dk-press", "aria-label": `${v} hizmetini kaldır`, onclick: () => removeCustom(v, i) },
          svgPath("M6 6l12 12M18 6 6 18", { size: 13, sw: "2.4" }))));
    chips.replaceChildren(...presets, ...customs, addBtn);
    count.textContent = `${list.length}/${SERVICES_MAX} hizmet · en az 1`;
  }
  draw();
  return {
    node: group,
    get: () => [...list],
    set(v) { list = normalizeServices(v).slice(0, SERVICES_MAX); err.textContent = ""; draw(); },
    focus() { (chips.querySelector("button") || addBtn).focus(); },
    setInvalid(on) { group.classList.toggle("is-invalid", !!on); if (on) group.setAttribute("aria-invalid", "true"); else group.removeAttribute("aria-invalid"); },
  };
}

// ── Kırpıcı: legacy openImageCropper (#modal-root, z 3000) dk modalının üstünde açılır; modalın belge düzeyi ESC/Tab tuzağı onu
// kapatmasın diye kırpıcı açıkken pencere düzeyinde ESC → İptal, Tab → kırpıcı içinde döngü (organizer/mekan-sec.js ile aynı yöntem).
export function cropImage(file, opts) {
  const ov = () => document.querySelector("#modal-root .cr-overlay");
  const onKey = (e) => {
    const o = ov(); if (!o) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); o.querySelector(".btn-ghost")?.click(); return; }
    if (e.key === "Tab") {
      const f = [...o.querySelectorAll("button,input")].filter((x) => !x.disabled);
      if (!f.length) return;
      e.preventDefault(); e.stopPropagation();
      const i = f.indexOf(document.activeElement);
      f[i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  window.addEventListener("keydown", onKey, true);
  let tries = 0;
  const focusIt = () => { const o = ov(); if (o) { o.querySelector(".cr-actions .btn:not(.btn-ghost)")?.focus(); return; } if (++tries < 90) requestAnimationFrame(focusIt); };
  requestAnimationFrame(focusIt);
  return openImageCropper(file, opts).catch(() => null).finally(() => window.removeEventListener("keydown", onKey, true));
}

// ── Sohbet aç: izleyenin panel mesaj sekmesi + masaüstü sohbetin bekleyen hedefi (chat.js requestChat; isteğe bağlı hazır metin).
// chat.js yüklenemezse `?c={convIdFor(ben, ajans)}` derin bağlantısı (taslak konuşma) — mekan-sec.js openVenueChat ile aynı kalıp.
export const MSG_ROUTE = { venue: "#/venue/mesaj", organizer: "#/organizer/mesaj", artist: "#/artist/mesaj", agency: "#/agency/mesajlar", customer: "#/mesajlar" };
export function openAgencyChat(viewerRole, otherId, otherName, text) {
  if (!otherId) return;
  const route = MSG_ROUTE[viewerRole] || "#/mesajlar";
  const t = { otherId, otherName: otherName || "Ajans", ...(text ? { text } : {}) };
  const me = session.user?.uid;
  const fallback = () => { location.hash = route + (me ? "?c=" + encodeURIComponent(convIdFor(me, otherId)) : ""); };
  import("../messages/chat.js")
    .then((m) => { if (typeof m.requestChat === "function") { m.requestChat(t); location.hash = route; } else fallback(); })
    .catch(fallback);
}

// ── Fotoğraf görüntüleyici (ilan galerisi → büyük görünüm; ←/→ ve düğmelerle gezinme) ──
export function openPhotoViewer(photos, start = 0, title = "") {
  const list = (photos || []).filter(Boolean);
  if (!list.length) return null;
  let i = Math.max(0, Math.min(start, list.length - 1));
  const img = h("img", { class: "dk-ag-pv-img", alt: "", decoding: "async" });
  const counter = h("span", { class: "dk-ag-pv-n", "aria-live": "polite" });
  const prev = dkIconButton("chevronLeft", { label: "Önceki fotoğraf", size: 40, variant: "ghost", round: true, onClick: () => go(-1) });
  const next = dkIconButton("chevronRight", { label: "Sonraki fotoğraf", size: 40, variant: "ghost", round: true, onClick: () => go(1) });
  const go = (d) => { i = (i + d + list.length) % list.length; paint(); };
  const paint = () => {
    img.src = list[i];
    img.alt = title ? `${title} — fotoğraf ${i + 1}` : `Fotoğraf ${i + 1}`;
    counter.textContent = `${i + 1} / ${list.length}`;
    prev.hidden = next.hidden = list.length < 2;
  };
  paint();
  const body = h("div", { class: "dk-ag-pv" },
    h("div", { class: "dk-ag-pv-stage" }, img),
    h("div", { class: "dk-ag-pv-bar" }, prev, counter, next));
  body.addEventListener("keydown", (e) => {
    if (list.length < 2) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  });
  return dkModal({ title: title || "Fotoğraf", body, size: 880, variant: "panel", align: "center", cls: "dk-ag-pv-mdl", initialFocus: list.length > 1 ? ".dk-ag-pv-bar button:last-child" : null });
}

// Küçük görsel (ilk fotoğraf ya da yer tutucu ikon) — kartlar
export function itemThumb(url, { cls, icon = "M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 19 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17zM11 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" } = {}) {
  const box = h("span", { class: cx("dk-ag-thumb", cls) });
  const fb = () => { box.classList.add("is-empty"); box.replaceChildren(svgPath(icon, { size: 26, sw: "1.6", color: "#5E636D" })); };
  if (url) {
    const im = h("img", { src: url, alt: "", loading: "lazy", decoding: "async" });
    im.addEventListener("error", fb, { once: true });
    box.append(im);
  } else fb();
  return box;
}

export const newId = (p) => uid(p);
