// AJANS — Katalog (#/agency/katalog, ≥769 px). Registry anahtarı: agencyKatalog. CSS: css/dk-ajans.css (.dk-ag-*).
// Ajansın hizmet / cihaz ilanları (agencyItems): durum (Tümü · Yayında · Taslak) + kategori (ajansın hizmetleri) süzgeci, ızgara
// kartlar (ilk fotoğraf, başlık, kategori, fiyat satırı, yayın anahtarı), ekle/düzenle modalı (dkModal form), silme (dkConfirm).
// Tasarım tuvalinde ajans ekranı YOK → ortak kit + organizatör/mekan kalıpları (mekan-sec kart ızgarası, org form modalı, kırpıcı).
// URL: ?durum=yayinda|taslak · ?kat=<hizmet> · ?q= (üst bar araması) · ?yeni=1 (ekle modalı) · ?duzenle=<id> (düzenle modalı).
// Yazımlar (js/agency-data.js — kural agencyItems bloğu ile birebir): saveAgencyItem (create: createdAt+updatedAt serverTimestamp ·
// update: createdAt'e dokunmaz) · setAgencyItemActive · deleteAgencyItem (+ Storage fotoğrafları, hata yutulur) ·
// uploadAgencyPhoto → agency_items/{uid}/{Date.now()}_{n}.jpg.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import {
  cx, dkButton, dkIconButton, dkInput, dkTextarea, dkSelect, dkSwitch, dkSegmented, dkChip, dkPageHero, dkEmpty,
  dkSkeleton, dkModal, dkConfirm, dkToast, dkLabel,
} from "../shared/ui.js";
import { fold, writeQuery } from "../shared/helpers.js";
import {
  AGENCY_COLOR, listAgencyItems, saveAgencyItem, setAgencyItemActive, deleteAgencyItem, uploadAgencyPhoto, deleteAgencyPhoto,
  priceText, serviceLabel, normalizeServices, PRICE_UNITS, ITEM_PHOTOS_MAX, ITEM_TITLE_MIN, ITEM_TITLE_MAX, ITEM_DESC_MAX, PRICE_MAX, QTY_MAX,
} from "../../agency-data.js";
import { itemThumb, serviceIco, cropImage, newId } from "./common.js";

export const NOT_READY = false;

const P = "dk-ag";
const k = (s) => `${P}-${s}`;
const ico = (name, size, o = {}) => svgIcon(name, { size, ...o });
const DURUM = { yayinda: "active", taslak: "draft" };
const DURUM_SLUG = { active: "yayinda", draft: "taslak" };

// "1.500" / "1500,50" / "₺ 2 000" → sayı · boş → null · geçersiz → NaN
export function parsePrice(raw) {
  let v = String(raw ?? "").replace(/[₺\s]/g, "").trim();
  if (!v) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");   // TR binlik ayraçlı
  else v = v.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(v)) return NaN;
  return Number(v);
}

export function agencyKatalogView(ctx) {
  const s = ctx.session || session;
  const p = s.profile || {};
  const uid = s.user?.uid;
  let alive = true;
  const S = { items: [], loading: true, error: false, status: "all", cat: "", q: "", openId: null, wantNew: false };
  let editor = null;   // açık modal

  const readQuery = (q) => {
    S.status = DURUM[q?.get("durum")] || "all";
    S.cat = q?.get("kat") || "";
    S.q = q?.get("q") || "";
    S.wantNew = q?.get("yeni") === "1";
    S.openId = q?.get("duzenle") || null;
  };
  readQuery(ctx.query);

  const shell = panelShell({
    role: "agency", active: ctx.route?.nav || "katalog", title: "Katalog", crumb: "Katalog", ctx,
    search: { placeholder: "Katalogda ara", value: S.q, onInput: (q) => { S.q = q; writeQuery({ q: q.trim() || null }); draw(); }, onSubmit: (q) => { S.q = q; draw(); } },
  });
  const root = shell.content;
  root.classList.add(P, k("kat"));

  // ═════════ HERO ═════════
  const addBtn = dkButton("İlan ekle", { variant: "role", color: AGENCY_COLOR, size: 44, icon: ico("plus", 17, { color: "#06070A", sw: "2.2" }), onClick: () => openEditor(null) });
  root.append(dkPageHero({
    eyebrow: "AJANS · KATALOG", title: "Hizmet ve ", em: "cihazların", tail: ".",
    lead: "Her ilan bir hizmet ya da kiralık cihaz: fotoğraflarını ekle, fiyatını yaz (boş bırakırsan “Fiyat için sor”), yayına al.",
    color: AGENCY_COLOR, actions: addBtn, cls: k("hero"),
  }));

  // ═════════ SÜZGEÇLER ═════════
  const seg = dkSegmented({
    items: [{ key: "all", label: "Tümü", count: "" }, { key: "active", label: "Yayında", count: "" }, { key: "draft", label: "Taslak", count: "" }],
    value: S.status, size: 36, role: "radiogroup", label: "İlan durumu", countColor: AGENCY_COLOR,
    onChange: (v) => { S.status = v; writeQuery({ durum: DURUM_SLUG[v] || null }); draw(); },
  });
  const catBox = h("div", { class: k("cats"), role: "group", "aria-label": "Kategori" });
  const countEl = h("span", { class: k("count"), "aria-live": "polite" });
  root.append(h("div", { class: k("tool") }, seg, catBox, countEl));

  const grid = h("div", { class: k("grid"), "aria-label": "İlanlar" });
  root.append(grid);

  // Ajansın hizmetleri + ilanlarda geçen (artık profilde olmayan) kategoriler
  const services = () => normalizeServices(session.profile?.agencyServices || p.agencyServices);
  const categories = () => {
    const list = [...services()];
    S.items.forEach((it) => { if (it.category && !list.includes(it.category)) list.push(it.category); });
    return list;
  };

  function drawCats() {
    const cats = categories();
    if (S.cat && !cats.includes(S.cat) && !S.loading) { S.cat = ""; writeQuery({ kat: null }); }
    catBox.replaceChildren(
      dkChip({ label: "Tümü", size: 32, pressed: !S.cat, onClick: () => { S.cat = ""; writeQuery({ kat: null }); draw(); } }),
      ...cats.map((c) => dkChip({ label: serviceLabel(c), icon: serviceIco(c, 13), size: 32, pressed: S.cat === c, onClick: () => { S.cat = c; writeQuery({ kat: c }); draw(); } })));
  }

  const visible = () => {
    const q = fold(S.q.trim());
    return S.items.filter((it) =>
      (S.status === "all" || (S.status === "active" ? it.active : !it.active)) &&
      (!S.cat || it.category === S.cat) &&
      (!q || fold([it.title, serviceLabel(it.category), it.description].join(" ")).includes(q)));
  };

  function card(it) {
    const media = h("button", { type: "button", class: k("imedia"), "aria-label": `${it.title} ilanını düzenle`, onclick: () => openEditor(it) },
      itemThumb(it.photos[0], { cls: k("iimg") }),
      h("span", { class: k("icat") }, serviceIco(it.category, 12), serviceLabel(it.category) || "Kategori yok"),
      it.photos.length > 1 ? h("span", { class: k("iphn") }, ico("image", 12), String(it.photos.length)) : null);
    const sw = dkSwitch({
      checked: it.active, label: `${it.title} yayında`, cls: k("sw"),
      onChange: async (next, { revert }) => {
        swText.textContent = next ? "Yayında" : "Taslak";
        try {
          await setAgencyItemActive(it.id, next);
          it.active = next;
          if (alive) { drawCounts(); dkToast(next ? "İlan yayına alındı" : "İlan taslağa alındı"); if (S.status !== "all") draw(); }
        } catch (e) {
          console.warn("[agency active]", e);
          revert(); swText.textContent = it.active ? "Yayında" : "Taslak";
          if (alive) dkToast("Değiştirilemedi", { type: "err" });
        }
      },
    });
    const swText = h("span", { class: k("swt") }, it.active ? "Yayında" : "Taslak");
    return h("article", { class: cx(k("icard"), "dk-card", !it.active && "is-draft"), dataset: { id: it.id } },
      media,
      h("div", { class: k("ibody") },
        h("h3", { class: k("ititle") }, it.title || "İlan"),
        h("span", { class: cx(k("iprice"), it.price == null && "is-ask") }, priceText(it)),
        it.quantity ? h("span", { class: k("imeta") }, `${it.quantity} adet`) : null),
      h("div", { class: k("ifoot") },
        h("label", { class: k("swrow") }, sw, swText),
        dkIconButton("edit", { label: `${it.title} ilanını düzenle`, size: 36, variant: "ghost", onClick: () => openEditor(it) }),
        dkIconButton("trash", { label: `${it.title} ilanını sil`, size: 36, variant: "ghost", cls: k("del"), onClick: () => askDelete(it) })));
  }

  function drawCounts() {
    seg.dk.setCount("all", S.loading || S.error ? "" : S.items.length);
    seg.dk.setCount("active", S.loading || S.error ? "" : S.items.filter((x) => x.active).length);
    seg.dk.setCount("draft", S.loading || S.error ? "" : S.items.filter((x) => !x.active).length);
  }
  function draw() {
    drawCounts();
    drawCats();
    seg.dk.set(S.status);
    grid.removeAttribute("aria-busy");
    if (S.loading) {
      grid.setAttribute("aria-busy", "true");
      grid.replaceChildren(...Array.from({ length: 6 }, () => h("div", { class: k("skcard"), "aria-hidden": "true" },
        dkSkeleton({ h: 168, r: 0 }), h("div", { class: k("skbody") }, dkSkeleton({ w: "70%", h: 16 }), dkSkeleton({ w: "40%", h: 13 })))));
      countEl.textContent = "";
      return;
    }
    if (S.error) {
      countEl.textContent = "";
      grid.replaceChildren(dkEmpty({ variant: "dashed", icon: ico("alertCircle", 30, { color: "#5E636D" }), title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile.",
        action: dkButton("Tekrar dene", { variant: "outline", size: 40, onClick: () => load() }), cls: k("empty") }));
      return;
    }
    const list = visible();
    countEl.textContent = `${list.length} İLAN`;
    if (!S.items.length) {
      grid.replaceChildren(dkEmpty({ variant: "dashed", icon: ico("agency", 34, { color: "#5E636D", sw: "1.5" }), title: "Kataloğun boş",
        sub: "Fotoğraf çekimi paketi, ışık seti ya da kiralık cihaz… İlk ilanını ekle; yayına aldığında Ajans Bul’da görünür.",
        action: dkButton("İlan ekle", { variant: "role", color: AGENCY_COLOR, size: 40, icon: ico("plus", 15, { color: "#06070A", sw: "2.2" }), onClick: () => openEditor(null) }), cls: k("empty") }));
      return;
    }
    if (!list.length) {
      grid.replaceChildren(dkEmpty({ variant: "dashed", icon: ico("search", 30, { color: "#5E636D" }), title: "Eşleşen ilan yok", sub: "Süzgeçleri değiştir ya da aramayı temizle.", cls: k("empty") }));
      return;
    }
    grid.replaceChildren(...list.map(card));
  }

  async function load() {
    S.loading = true; S.error = false; draw();
    try {
      const items = await listAgencyItems(uid, { ownerView: true });
      if (!alive) return;
      S.items = items; S.loading = false;
      draw();
      // derin bağlantılar: ?duzenle=<id> / ?yeni=1
      if (S.openId) { const it = S.items.find((x) => x.id === S.openId); S.openId = null; if (it) openEditor(it); else writeQuery({ duzenle: null }); }
      else if (S.wantNew) { S.wantNew = false; openEditor(null); }
    } catch (e) {
      console.warn("[agency katalog]", e);
      if (!alive) return;
      S.loading = false; S.error = true; draw();
    }
  }

  // ═════════ SİL ═════════
  async function askDelete(it, fromEditor) {
    const ok = await dkConfirm({ title: "İlanı sil", body: `“${it.title}” ilanı ve fotoğrafları kalıcı olarak silinecek.`, confirmLabel: "Sil", cancelLabel: "Vazgeç", danger: true });
    if (!ok) return false;
    try {
      await deleteAgencyItem(it);
      if (!alive) return true;
      S.items = S.items.filter((x) => x.id !== it.id);
      fromEditor?.close("deleted");
      draw();
      dkToast("İlan silindi");
      return true;
    } catch (e) {
      console.warn("[agency delete]", e);
      if (alive) dkToast("Silinemedi", { type: "err" });
      return false;
    }
  }

  // ═════════ EKLE / DÜZENLE MODALI ═════════
  function openEditor(it) {
    if (editor) return;
    const isNew = !it;
    writeQuery(isNew ? { yeni: "1", duzenle: null } : { duzenle: it.id, yeni: null });
    const svcList = services();
    const cats = [...svcList];
    if (it?.category && !cats.includes(it.category)) cats.push(it.category);   // profilden kaldırılmış eski kategori düzenlemede kalsın
    // fotoğraflar: { url } (kayıtlı) | { blob, objUrl } (yeni, kayıtta yüklenir)
    let photos = (it?.photos || []).map((url) => ({ url }));
    const fid = (x) => newId(`${P}-f-${x}`);

    const tIn = dkInput({ id: fid("t"), value: it?.title || "", placeholder: "Örn. Moving head ışık seti (4 adet)", maxlength: ITEM_TITLE_MAX, autocomplete: "off" });
    const catSel = dkSelect({ id: fid("c"), options: cats.map((c) => ({ value: c, label: serviceLabel(c) })), value: it?.category || (cats.length === 1 ? cats[0] : ""), placeholder: cats.length ? "Kategori seç" : "Önce profilinden hizmet ekle" });
    const dIn = dkTextarea({ id: fid("d"), rows: 4, value: it?.description || "", maxlength: ITEM_DESC_MAX, placeholder: "Neler dahil? Süre, adet, teknik özellikler, ulaşım…" });
    const pIn = dkInput({ id: fid("p"), value: it?.price != null ? String(it.price).replace(".", ",") : "", placeholder: "Boş = Fiyat için sor", inputmode: "decimal", autocomplete: "off" });
    const uSel = dkSelect({ id: fid("u"), options: PRICE_UNITS.map((u) => ({ value: u.key, label: `/ ${u.label}` })), value: it?.priceUnit || "gun" });
    const qIn = dkInput({ id: fid("q"), value: it?.quantity != null ? String(it.quantity) : "", placeholder: "Opsiyonel", inputmode: "numeric", autocomplete: "off" });
    const activeSw = dkSwitch({ checked: it ? it.active : true, label: "Yayında", cls: k("sw") });
    const pricePreview = h("span", { class: k("fhint") });
    const updPreview = () => {
      const pr = parsePrice(pIn.value);
      pricePreview.textContent = Number.isNaN(pr) ? "Geçerli bir tutar yaz (örn. 1.500)." : `Görünüm: ${priceText({ price: pr, priceUnit: uSel.querySelector("select").value })}`;
      pricePreview.classList.toggle("is-err", Number.isNaN(pr));
    };
    pIn.addEventListener("input", updPreview);
    uSel.querySelector("select").addEventListener("change", updPreview);
    updPreview();

    // fotoğraf ızgarası (≤ 6; ilki kapak)
    const fileIn = h("input", { type: "file", accept: "image/*", class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
    const phGrid = h("div", { class: k("phgrid"), role: "list", "aria-label": "Fotoğraflar" });
    const phNote = h("span", { class: k("fhint") });
    const addTile = h("button", { type: "button", class: cx(k("phadd"), "dk-press") }, ico("plus", 20), h("span", {}, "Fotoğraf ekle"));
    addTile.addEventListener("click", () => fileIn.click());
    function drawPhotos() {
      const tiles = photos.map((ph, i) => h("div", { class: k("phtile"), role: "listitem" },
        h("img", { src: ph.url || ph.objUrl, alt: `Fotoğraf ${i + 1}`, loading: "lazy", decoding: "async" }),
        i === 0 ? h("span", { class: k("phcover") }, "KAPAK") : null,
        h("button", { type: "button", class: cx(k("phx"), "dk-press"), "aria-label": `Fotoğraf ${i + 1}'i kaldır`, onclick: () => removePhoto(i) }, ico("x", 14, { sw: "2.4" })),
        i > 0 ? h("button", { type: "button", class: cx(k("phfirst"), "dk-press"), "aria-label": `Fotoğraf ${i + 1}'i kapak yap`, onclick: () => makeCover(i) }, "Kapak yap") : null));
      phGrid.replaceChildren(...tiles, photos.length < ITEM_PHOTOS_MAX ? addTile : null);
      phNote.textContent = `${photos.length}/${ITEM_PHOTOS_MAX} fotoğraf · ilk fotoğraf kapak olur`;
    }
    function removePhoto(i) {
      const [ph] = photos.splice(i, 1);
      if (ph?.objUrl) URL.revokeObjectURL(ph.objUrl);
      drawPhotos();
      (phGrid.querySelectorAll(`.${k("phx")}`)[Math.min(i, photos.length - 1)] || addTile).focus();
    }
    function makeCover(i) {
      const [ph] = photos.splice(i, 1);
      photos.unshift(ph);
      drawPhotos();
      phGrid.querySelector(`.${k("phx")}`)?.focus();
    }
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files && fileIn.files[0];
      fileIn.value = "";
      if (!f || photos.length >= ITEM_PHOTOS_MAX) return;
      if (!/^image\//.test(f.type || "")) { m.setError("Yalnız görsel dosyası seçebilirsin."); return; }
      const blob = await cropImage(f, { aspect: 4 / 3 });
      if (!addTile.isConnected && !phGrid.isConnected) return;
      requestAnimationFrame(() => { (addTile.isConnected ? addTile : phGrid.querySelector("button"))?.focus({ preventScroll: true }); });
      if (!blob) return;
      if (blob.size >= 8 * 1024 * 1024) { m.setError("Fotoğraf 8 MB'den küçük olmalı."); return; }
      photos.push({ blob, objUrl: URL.createObjectURL(blob) });
      m.setError("");
      drawPhotos();
    });
    drawPhotos();

    const fld = (label, control, extra, opts = {}) => {
      const target = control.matches?.("input,select,textarea") ? control : control.querySelector?.("input,select,textarea");
      return h("div", { class: cx(k("fld"), opts.cls) }, dkLabel(label, { for: target?.id, required: opts.required }), control, extra || null);
    };
    const body = h("div", { class: k("form") },
      fld("Başlık", tIn, null, { required: true }),
      h("div", { class: k("two") },
        fld("Kategori", catSel, svcList.length ? null : h("a", { href: "#/agency/profil", class: cx(k("fhint"), "dk-link") }, "Profilinde hizmet ekle →"), { required: true }),
        fld("Adet", qIn, h("span", { class: k("fhint") }, "Kiralık cihazlarda stok adedi"))),
      h("div", { class: k("two") },
        fld("Fiyat (₺)", pIn, pricePreview),
        fld("Birim", uSel)),
      fld("Açıklama", dIn),
      h("div", { class: k("fld") }, h("span", { class: "dk-lbl" }, "FOTOĞRAFLAR"), phGrid, phNote, fileIn),
      h("label", { class: k("swline") }, activeSw, h("span", { class: k("swcol") },
        h("span", { class: k("swt") }, "Yayında"),
        h("span", { class: k("fhint") }, "Kapalıysa taslak olarak kalır; yalnız sen görürsün."))));

    let busy = false;
    const save = async (close, btn) => {
      if (busy) return false;
      m.setError("");
      const title = tIn.value.trim();
      const category = catSel.querySelector("select").value;
      const price = parsePrice(pIn.value);
      const qRaw = qIn.value.trim();
      const quantity = qRaw ? (/^\d+$/.test(qRaw) ? Number(qRaw) : NaN) : null;
      const description = dIn.input ? dIn.input.value : dIn.value;
      const bad = (msg, el) => { m.setError(msg); el?.focus(); el?.setAttribute?.("aria-invalid", "true"); return false; };
      [tIn, pIn, qIn, catSel.querySelector("select")].forEach((x) => x.removeAttribute("aria-invalid"));
      if (title.length < ITEM_TITLE_MIN) return bad(`Başlık en az ${ITEM_TITLE_MIN} karakter olmalı.`, tIn);
      if (title.length > ITEM_TITLE_MAX) return bad(`Başlık en çok ${ITEM_TITLE_MAX} karakter olmalı.`, tIn);
      if (!category) return bad(cats.length ? "Kategori seç." : "Önce profilinden en az bir hizmet ekle.", catSel.querySelector("select"));
      if (Number.isNaN(price) || (price != null && (price < 0 || price > PRICE_MAX))) return bad(`Fiyat 0 ile ${PRICE_MAX.toLocaleString("tr-TR")} arasında olmalı (boş = Fiyat için sor).`, pIn);
      if (quantity != null && (Number.isNaN(quantity) || quantity < 1 || quantity > QTY_MAX)) return bad(`Adet 1 ile ${QTY_MAX} arasında tam sayı olmalı.`, qIn);
      if (description.length > ITEM_DESC_MAX) return bad(`Açıklama en çok ${ITEM_DESC_MAX} karakter olmalı.`, dIn.input || dIn);
      busy = true;
      const label = btn?.querySelector(".dk-btn-l");
      const uploaded = [];
      try {
        // yeni fotoğrafları sırayla yükle (agency_items/{uid}/{ts}_{n}.jpg)
        for (let i = 0; i < photos.length; i++) {
          const ph = photos[i];
          if (ph.url) continue;
          if (label) label.textContent = `Fotoğraf yükleniyor (${uploaded.length + 1})…`;
          ph.url = await uploadAgencyPhoto(uid, ph.blob, i);
          uploaded.push(ph.url);
        }
        if (label) label.textContent = "Kaydediliyor…";
        const urls = photos.map((x) => x.url).filter(Boolean);
        const id = await saveAgencyItem(uid, { title, category, description, photos: urls, price, priceUnit: uSel.querySelector("select").value, quantity, active: activeSw.dk.get() }, it?.id);
        // düzenlemede kaldırılan eski fotoğraflar Storage'dan da silinir (hata yutulur)
        (it?.photos || []).filter((u) => !urls.includes(u)).forEach((u) => deleteAgencyPhoto(u));
        photos.forEach((x) => { if (x.objUrl) URL.revokeObjectURL(x.objUrl); });
        dkToast(isNew ? "İlan eklendi" : "İlan kaydedildi");
        close("saved");
        if (alive) {
          S.openId = null;
          await load();
          requestAnimationFrame(() => grid.querySelector(`[data-id="${CSS.escape(id)}"] .${k("imedia")}`)?.focus({ preventScroll: false }));
        }
        return true;
      } catch (e) {
        console.warn("[agency save]", e);
        // yarıda kalan yüklemeler yetim kalmasın
        uploaded.forEach((u) => deleteAgencyPhoto(u));
        photos.forEach((x) => { if (x.blob && uploaded.includes(x.url)) x.url = null; });
        const code = e?.code || "";
        m.setError(code === "permission-denied" || code === "storage/unauthorized"
          ? "Kaydetme izni yok. Ajans hesabın onaylı olmalı."
          : "Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
        return false;
      } finally {
        busy = false;
        if (label && label.isConnected) label.textContent = "Kaydet";
      }
    };

    const delBtn = !isNew ? dkButton("İlanı sil", { variant: "danger-outline", size: 44, icon: ico("trash", 15), cls: k("mdel"), onClick: () => askDelete(it, m) }) : null;
    const m = dkModal({
      title: isNew ? "Yeni ilan" : "İlanı düzenle", variant: "form", size: 640, cls: k("mdl"), body,
      footerStart: delBtn,
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Kaydet", variant: "role", color: AGENCY_COLOR, onClick: save },
      ],
      onClose: () => {
        editor = null;
        photos.forEach((x) => { if (x.objUrl && !x.url) URL.revokeObjectURL(x.objUrl); });
        if (alive) writeQuery({ yeni: null, duzenle: null });
      },
      initialFocus: tIn,
    });
    editor = m;
    // Enter (tek satırlı alanlarda) = Kaydet
    body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing || e.shiftKey || e.target?.tagName !== "INPUT" || e.target.type === "file") return;
      e.preventDefault();
      m.buttons[m.buttons.length - 1]?.click();
    });
  }

  draw();
  load();

  return {
    node: shell.node,
    update(query) {
      const prevQ = S.q;
      readQuery(query);
      if (S.q !== prevQ && shell.search?.input && document.activeElement !== shell.search.input) shell.search.input.value = S.q;
      if (!S.loading) {
        if (S.wantNew && !editor) { S.wantNew = false; openEditor(null); }
        else if (S.openId && !editor) { const it = S.items.find((x) => x.id === S.openId); S.openId = null; if (it) openEditor(it); }
      }
      draw();
    },
    onSession(sess) {
      // hizmetler değişirse kategori çipleri yeniden çizilir (kabuk kimliği aynı)
      if (JSON.stringify(sess?.profile?.agencyServices || []) !== JSON.stringify(p.agencyServices || [])) { p.agencyServices = sess?.profile?.agencyServices || []; draw(); }
      return sess?.profile?.displayName === p.displayName && sess?.profile?.photoURL === p.photoURL;
    },
    destroy() {
      alive = false;
      try { editor?.close("route"); } catch (_) {}
      shell.destroy();
    },
  };
}
