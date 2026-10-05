// WebMekanEtkinlikOlustur — Etkinlik Oluştur / Düzenle, masaüstü görünümü (≥769 px). Registry anahtarı: venueOlustur.
// Rotalar: #/venue/olustur (oluştur) · #/venue/duzenle/:id (YENİ — düzenleme modu; legacy web'de yok, app EditEventScreen paritesi).
// Spec: specs/mekan.md §0 + § WebMekanEtkinlikOlustur · Artboard: design/WebMekanEtkinlikOlustur.dc.html (sahibi notu YOK).
// CSS: css/dk-mekan-etkinlik-olustur.css — .dk-mekan-etkinlik-olustur kökü / .dk-mekan-etkinlik-olustur-* sınıfları.
// ≤768: legacy js/pages/venue.js renderCreate aynen (router bu modülü mobilde yüklemez).
//
// OLUŞTUR — legacy renderCreate ile AYNI yazım yolu (korunan özellikler):
//   · createEvent(profile, f) yükü birebir (title, date, time, genre, price→ticketPrice|null, capacity→(mekan kapasitesi), description,
//     vip→vipStatus "pending"|null, artistId/artistName (grup: yalnız artistName), bannerUrl) · bitiş → updateEvent(id,{endAt}) (gece
//     yarısını geçerse +1 gün) · solo sanatçı: findExistingInvitation → createInvitation(…, {date,time,fee,message:"",photoUrl,eventId})
//   · doğrulama sırası: ad → tarih → mekan konumu pinli (değilse "📍 Mekan Konumunu Ayarla →") → aynı gün aynı ad → bitiş≠başlangıç →
//     solo ücret ≥ 3.500 → solo başlangıç saati · "Fotoğraf yükleniyor…" · "Oluşturulamadı." · kontenjan yer tutucu/ipucu varyantları
//     (mekan kapasitesi bilinmiyorsa "Sınırsız") · sanatçı seçici (sanatçılar + gruplar, TR arama) · seçilince tür otomatik gelir
//   · + uygulama paritesi: solo sanatçıya event_invite bildirimi (data.sendNotification — fromUserId = auth uid)
// DÜZENLE — app EditEventScreen paritesi: saveEventEdits(id, {title, description, artistName, artistId, genre[], ticketPrice, capacity,
//   (+ değiştiyse bannerUrl / vipStatus "pending"|null)}) → lastEditedAt damgası; tarih/saat DEĞİŞTİRİLEMEZ; etkinlik başladıysa ya da
//   son düzenlemeden bu yana 2 gün geçmediyse kilitli ("Tekrar düzenleme: …"); gruplar atanamaz; organizatör etkinliği salt-okunur.
// Tasarımın ekledikleri: iki kolon + canlı Keşfet kartı önizlemesi (cards.eventCard — tek kaynak), yayın kontrol listesi, süre
// göstergesi, Ücretsiz anahtarı, kapak ön ayarları (ui.BANNER_PRESETS — ücretsiz, yüklemesiz) + Yükle (16:9 kırpıcı),
// "Taslak kaydet" (YALNIZ tarayıcı: localStorage "gb:venueDraft:{uid}[:{eventId}]" — Firestore şeması yok), açılışta geri yükleme.
import { h, openImageCropper, BANNER_PRESETS } from "../../ui.js";
import { session } from "../../store.js";
import {
  listArtists, listGroups, venueEvents, eventById, createEvent, updateEvent, saveEventEdits, uploadImage,
  findExistingInvitation, createInvitation, sendNotification,
} from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkModal, dkToast, dkConfirm, dkSkeleton, dkEmpty, dkButton, dkAvatar, dkLoginGate } from "../shared/ui.js";
import { eventCard } from "../shared/cards.js";
import { eventStartMs, fmtTime, isoDate, toMs, trUpper, trLower, fold, initials, MONTHS_TR, MONTHS_TR_SHORT } from "../shared/helpers.js";
import { ALL_GENRES, genreColor, genreGrad, genreFamilyKey } from "../shared/genres.js";

const NS = "dk-mekan-etkinlik-olustur";
const c = (s) => `${NS}-${s}`;
const MIN_STAGE_FEE = 3500;
const EDIT_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000; // app EditEventScreen
const MON = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];
const WD = ["PAZ", "PZT", "SAL", "ÇAR", "PER", "CUM", "CMT"];
// Seçici avatar gradyanları (spec §4 GRAD — legacy GENRE_GRADS + Rock)
const GRAD = {
  Electronic: "linear-gradient(135deg,#6C3FC5,#3B1FA0)", Jazz: "linear-gradient(135deg,#D97706,#92400E)", Akustik: "linear-gradient(135deg,#047857,#064E3B)",
  Rock: "linear-gradient(135deg,#BE185D,#831843)", "Pop Rock": "linear-gradient(135deg,#BE185D,#831843)", Pop: "linear-gradient(135deg,#DB2777,#9D174D)",
  "Hip-Hop": "linear-gradient(135deg,#C2410C,#7C2D12)",
};
const gradOf = (g) => GRAD[g] || "linear-gradient(135deg,#4A4A6A,#2A2A4A)";
// Kapaksız yer tutucu: tür eşlenmişse ortak tür gradyanı; tür boş/eşlenmemişse ("other" ailesi) artboard'un koyu GRAD
// varsayılanı (#4A4A6A→#2A2A4A) — genres.js "other" gradyanı (#A3A7AF→#4A4A6A) boş formda parlak gri blok çiziyordu.
// SHARED-CANDIDATE: genres.js boş/eşlenmemiş tür için koyu varsayılan gradyan verebilir (cards.placeholder da aynı griyi çiziyor).
const phGrad = (g, angle = 150) => (genreFamilyKey(g) === "other" ? `linear-gradient(${angle}deg, #4A4A6A, #2A2A4A)` : genreGrad(g, angle));

// ── artboard SVG gövdeleri (birebir) ──
const I = {
  upload: '<path d="M12 16V4M7 9l5-5 5 5"></path><path d="M4 16v4h16v-4"></path>',
  users: '<circle cx="9" cy="8.5" r="3.5"></circle><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"></path><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.3c1.8.7 3 2.3 3.5 4.7"></path>',
  xCircle: '<circle cx="12" cy="12" r="8.5"></circle><path d="M9 9l6 6M15 9l-6 6"></path>',
  sparkle: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"></path>',
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"></path>',
  save: '<path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v5h7V4M8 20v-6h8v6"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
};
const raw = (k, size, sw = "1.8", o = {}) => svgRaw(I[k], { size, sw, ...o });

const nameOf = (x) => x?.displayName || x?.name || "Sanatçı";
const genreOf = (x) => (Array.isArray(x?.genres) ? x.genres[0] : x?.genre) || "";
const pad2 = (n) => String(n).padStart(2, "0");
// BANNER_PRESETS canonical URL'leri (üretim: https://gigbridges.com/assets/banners/…) Firestore'a AYNEN yazılır; önizlemede aynı
// dosyanın site-göreli yolu gösterilir (üretimde aynı adres; yerelde yerel sunucu).
const presetSrc = (u) => { const m = /\/assets\/banners\/([^/?#]+)$/.exec(u || ""); return m ? "assets/banners/" + m[1] : u; };
// Bilet ücreti — oluştur, düzenle ve önizleme için TEK ayrıştırıcı: "2.500" (nokta binlik, app parseTL) → 2500; aksi hâlde sayı
// (99.5 korunur). Boş / 0 → null (ücretsiz). Negatif ya da sayı değil → NaN (doğrulama hatası: "Bilet ücreti geçersiz.").
const priceValue = (v) => {
  const s = String(v ?? "").trim(); if (!s) return null;
  const n = /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, "")) : Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n > 0 ? n : null;
};
const parsePrice = (v) => { const n = priceValue(v); return Number.isNaN(n) ? null : n; };
// Kontenjan: boş → geçerli (mekan kapasitesi / sınırsız); aksi hâlde ≥1 tam sayı olmalı
const capInvalid = (v) => { const s = String(v ?? "").trim(); if (!s) return false; const n = Number(s); return !Number.isInteger(n) || n < 1; };
// dkConfirm ile aynı görünüm (panel → "confirm" varyantı) ama arka plana tıklayınca KAPANMAZ: "Değişiklikleri kaydet"e çift tık
// ilk tıkla onayı açıp ikinci tık (arka plan) ile hemen kapatıyordu. Esc / Vazgeç / X ile kapanır.
// SHARED-CANDIDATE: dkConfirm'e closeOnBackdrop seçeneği.
function confirmNoBackdrop({ title, body, confirmLabel, cancelLabel = "Vazgeç" }) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (x) => { if (!done) { done = true; resolve(x); } };
    dkModal({ title, size: 420, variant: "confirm", sub: body, closeOnBackdrop: false,
      actions: [{ label: cancelLabel, variant: "outline", onClick: () => fin(false) }, { label: confirmLabel, variant: "primary", onClick: () => fin(true) }],
      onClose: () => fin(false) });
  });
}
const draftKey = (uid, id) => `gb:venueDraft:${uid}${id ? ":" + id : ""}`;
const readDraft = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
const writeDraft = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
const dropDraft = (k) => { try { localStorage.removeItem(k); } catch (_) {} };

export function venueEtkinlikOlusturView(ctx) {
  const isEdit = ctx.seg?.[2] === "duzenle";
  const eventId = isEdit ? String(ctx.seg?.[3] || "") : null;
  const uid = ctx.session?.user?.uid || session.user?.uid;
  const prof = () => session.profile || ctx.session?.profile || {};
  const venueCap = Number(prof().capacity) || null;
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });

  // ── form durumu ──
  const blank = () => ({ title: "", desc: "", artist: null, fee: "", date: "", start: "", end: "", genre: "", price: "", free: false, cap: "", vip: false, cover: { kind: "none" } });
  let st = blank();
  let orig = null;       // düzenleme: yüklenen etkinliğin form karşılığı (değişiklik tespiti)
  let ev = null;         // düzenleme: etkinlik kaydı
  let lock = null;       // düzenleme kilidi: { kind: "started"|"cooldown"|"org", next? }
  let dirty = false;
  let busy = false;
  const DKEY = draftKey(uid, eventId);

  // sanatçı / grup listeleri (seçici) + mekanın etkinlikleri (aynı gün aynı ad kontrolü)
  const artistsP = listArtists().catch(() => []);
  const groupsP = isEdit ? Promise.resolve([]) : listGroups().catch(() => []);
  const myEventsP = isEdit ? Promise.resolve([]) : venueEvents(uid).catch(() => []);

  // Vazgeç / mod değiştir / arama: kirli formda onay → "Çık" formu GERÇEKTEN atar (taslak da silinir — aksi hâlde otomatik
  // kaydedilen taslak her girişte geri gelirdi). Kenar çubuğu / Geri ile onaysız ayrılışta destroy() taslağı saklar.
  const guardNav = async (href) => {
    if (dirty && !busy) {
      const ok = await dkConfirm({ title: "Kaydedilmemiş değişiklikler", body: "Formdaki değişiklikler kaybolacak. Çıkmak istiyor musun?", confirmLabel: "Çık", cancelLabel: "Kal", danger: true });
      if (!ok) return;
      dropDraft(DKEY);
    }
    dirty = false;
    location.hash = href;
  };

  const shell = panelShell({
    role: "venue", active: ctx.route?.nav || "olustur", title: isEdit ? "Etkinliği Düzenle" : "Etkinlik Oluştur", crumb: "Etkinlik oluştur / düzenle", ctx,
    search: { onSubmit: (q) => guardNav("#/venue/sanatci" + (q ? "?q=" + encodeURIComponent(q) : "")) },
  });
  const root = h("div", { class: NS });
  shell.content.append(root);

  // ═════════ mod satırı ═════════
  // Segmentler sekme değil gezinme: etkin segment etkileşimsiz (aria-current), düzenlemede "Yeni etkinlik" → #/venue/olustur
  const modeTabs = h("div", { role: "group", "aria-label": "Form modu", class: c("seg") });
  const modeNew = isEdit
    ? h("button", { type: "button", class: cx(c("segb"), "dk-press") }, "Yeni etkinlik")
    : h("span", { class: cx(c("segb"), "is-on"), "aria-current": "page" }, "Yeni etkinlik");
  if (isEdit) modeNew.addEventListener("click", () => guardNav("#/venue/olustur"));
  modeTabs.append(modeNew);
  let modeEdit = null;
  if (isEdit) {
    modeEdit = h("span", { class: cx(c("segb"), "is-on"), "aria-current": "page" }, "Düzenle");
    modeTabs.append(modeEdit);
  }
  const modeRow = h("div", { class: c("moderow") }, modeTabs,
    h("span", { class: c("note") }, isEdit ? "* ile işaretli alanlar zorunlu · Tarih ve saat düzenlenemez" : "* ile işaretli alanlar zorunlu · Sanatçı seçersen teklif otomatik gönderilir"));

  // ═════════ form yardımcıları ═════════
  const section = (num, title, right, ...kids) => {
    const id = `dk-meo-s${num}`;
    return h("section", { "aria-labelledby": id, class: c("sec") },
      h("div", { class: c("sechead") }, h("span", { class: c("num") }, num), h("h3", { id, class: c("sect") }, title),
        h("span", { class: c("secr") }, right ? h("span", { class: c("secrt") }, right) : null)),
      ...kids);
  };
  const labelWrap = (text, ctl, help) => h("label", { class: c("fld") }, h("span", { class: c("lbl") }, text), ctl, help || null);
  const helpEl = (t) => h("span", { class: c("help") }, t);
  const input = (attrs = {}, mono = false) => h("input", { class: cx(c("in"), mono && c("mono")), ...attrs });
  const allInputs = [];
  const track = (el, key, { trim = false } = {}) => {
    allInputs.push(el);
    el.addEventListener("input", () => { st[key] = trim ? el.value.trim() : el.value; changed(); });
    return el;
  };

  // ── 01 Kapak ──
  const coverBox = h("div", { class: c("cover") });
  const coverTag = h("span", { class: c("covertag") }, "16:9 · KAYDIRARAK KONUMLANDIR");
  const tiles = h("div", { role: "radiogroup", "aria-label": "Kapak seçenekleri", class: c("tiles") });
  const tileBtns = BANNER_PRESETS.map((b) => {
    const btn = h("button", { type: "button", role: "radio", class: cx(c("tile"), "dk-press"), "aria-label": b.label, "aria-checked": "false" },
      h("img", { src: presetSrc(b.url), alt: "", loading: "lazy", decoding: "async" }));
    btn.addEventListener("click", () => {
      if (locked()) return;
      st.cover = st.cover.kind === "preset" && st.cover.url === b.url ? { kind: "none" } : { kind: "preset", url: b.url };
      changed({ cover: true });
    });
    btn.preset = b; tiles.append(btn); allInputs.push(btn);
    return btn;
  });
  tiles.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const i = tileBtns.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = tileBtns[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + tileBtns.length) % tileBtns.length]; n.focus(); n.click();
  });
  const fileIn = h("input", { type: "file", accept: "image/*", class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
  const uploadLbl = h("span", {}, "Yükle");
  const uploadBtn = h("button", { type: "button", class: cx(c("upload"), "dk-press") }, raw("upload", 16), uploadLbl);
  uploadBtn.addEventListener("click", () => { if (!locked()) fileIn.click(); });
  allInputs.push(uploadBtn);
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files?.[0]; fileIn.value = "";
    if (!f) return;
    const blob = await openImageCropper(f, { aspect: 16 / 9 });
    if (!blob || !alive) return;
    if (st.cover.kind === "upload" && st.cover.url) URL.revokeObjectURL(st.cover.url);
    st.cover = { kind: "upload", file: blob, url: URL.createObjectURL(blob) };
    changed({ cover: true });
  });
  tiles.append(uploadBtn);
  const s01 = section("01", "Kapak Fotoğrafı", "OPSİYONEL",
    h("div", { class: c("covergrid") }, coverBox,
      h("div", { class: c("covercol") }, helpEl("Fotoğraf seç ve kaydırarak konumlandır (16:9). Kapak, etkinlik kartında ve haritada görünür."), tiles, fileIn)));

  // ── 02 Bilgiler ──
  const titleIn = track(input({ placeholder: "örn: Cumartesi Canlı Müzik", maxlength: "120", autocomplete: "off" }), "title");
  const descIn = track(h("textarea", { class: c("in"), rows: 3, placeholder: "Etkinlik hakkında kısa bilgi..." }), "desc");
  const s02 = section("02", "Etkinlik Bilgileri", null,
    h("div", { class: c("g2") }, labelWrap("ETKİNLİK ADI *", titleIn), labelWrap("AÇIKLAMA", descIn)));

  // ── 03 Sanatçı ──
  const artistName = h("span", { class: c("selname"), id: "dk-meo-art-n" }, "Sanatçı veya grup seçin");
  const artistAvSlot = h("span", { class: c("selav"), hidden: true });
  const selBtn = h("button", { type: "button", class: cx(c("sel"), "dk-press"), "aria-haspopup": "dialog" }, artistAvSlot, artistName);
  const pickBtn = h("button", { type: "button", class: cx(c("pick"), "dk-press"), "aria-haspopup": "dialog" }, raw("users", 16), "Seç");
  const clearBtn = h("button", { type: "button", class: cx(c("clear"), "dk-press"), "aria-label": "Sanatçıyı kaldır", hidden: true }, raw("xCircle", 18));
  [selBtn, pickBtn].forEach((b) => b.addEventListener("click", () => { if (!locked()) openPicker(); }));
  clearBtn.addEventListener("click", () => { if (locked()) return; st.artist = null; st.fee = ""; feeIn.value = ""; changed(); selBtn.focus(); });
  allInputs.push(selBtn, pickBtn, clearBtn);
  const artistHelp = h("span", { class: cx(c("help"), c("helpn")) }, "Sistemdeki kayıtlı sanatçılardan veya gruplardan seçin."); // artboard: line-height yok (normal)
  const feeIn = track(input({ type: "number", min: String(MIN_STAGE_FEE), step: "500", placeholder: `Teklif edilecek ücret (en az ${MIN_STAGE_FEE})`, inputmode: "numeric" }, true), "fee");
  const feeWrap = labelWrap("SANATÇI SAHNE ÜCRETİ (₺)", feeIn, helpEl("Bu ücretle sanatçıya teklif gönderilir; sanatçı gelen tekliflerinde görüp kabul/red edebilir."));
  feeWrap.hidden = true;
  const s03 = section("03", "Sanatçı", null,
    h("div", { class: c("fld") }, h("span", { class: c("lbl"), id: "dk-meo-art-l" }, "SANATÇI VEYA GRUP"),
      h("div", { class: c("selrow") }, selBtn, pickBtn, clearBtn), artistHelp),
    feeWrap);
  selBtn.setAttribute("aria-labelledby", "dk-meo-art-l dk-meo-art-n"); // ad = etiket + seçili sanatçı (ya da "seçin")

  // ── 04 Tarih & Saat ──
  const dateIn = track(input({ type: "date" }), "date");
  if (!isEdit) dateIn.min = isoDate(Date.now()); // app CreateEventScreen: minimumDate = bugün
  const startIn = track(input({ type: "time" }), "start");
  const endIn = track(input({ type: "time" }), "end");
  const durEl = h("span", { class: c("dur"), "aria-live": "polite" });
  const dateHelp = helpEl(isEdit ? "Tarih değiştirilemez — etkinliği silip yeniden oluştur." : "Bitiş saati, etkinlik “şu an çalıyor” olduğunda haritada yeşil pin gösterir. Gece yarısını geçerse ertesi güne taşınır.");
  const s04 = section("04", "Tarih & Saat", null,
    h("div", { class: c("g2t") }, labelWrap("TARİH *", dateIn), labelWrap("BAŞLANGIÇ", startIn), labelWrap("BİTİŞ", endIn), h("div", { class: c("durcell") }, durEl)),
    dateHelp);

  // ── 05 Tür ──
  const chips = h("div", { role: "group", "aria-label": "Tür seç", class: c("chips") });
  const chipBtns = ALL_GENRES.map((g) => {
    const b = h("button", { type: "button", class: cx(c("chip"), "dk-press"), "aria-pressed": "false" }, g);
    b.addEventListener("click", () => { if (locked()) return; st.genre = fold(st.genre) === fold(g) ? "" : g; genreIn.value = st.genre; changed({ genre: true }); });
    b.g = g; chips.append(b); allInputs.push(b);
    return b;
  });
  const genreIn = input({ placeholder: "Tür seçin ya da yazın (örn. House)", autocomplete: "off", class: cx(c("in"), c("genrein")) });
  allInputs.push(genreIn);
  genreIn.addEventListener("input", () => { st.genre = genreIn.value; changed({ genre: true }); });
  const s05 = section("05", "Tür", `${ALL_GENRES.length} TÜR`, chips,
    labelWrap("TÜR (SERBEST)", genreIn, helpEl("Listeden seçebilir ya da kendi türünüzü yazabilirsiniz. Sanatçı seçtiğinizde türü otomatik gelir.")));

  // ── 06 Bilet & Kontenjan ──
  const priceIn = track(input({ type: "number", min: "0", "aria-label": "Bilet ücreti", inputmode: "numeric", placeholder: "Boş bırakırsanız 'Ücretsiz' görünür" }, true), "price");
  const freeSw = h("button", { type: "button", role: "switch", "aria-checked": "false", class: cx(c("free"), "dk-press") },
    h("span", { class: c("track") }, h("span", { class: c("knob") })), "Ücretsiz");
  freeSw.addEventListener("click", () => { if (locked()) return; st.free = !st.free; changed(); });
  allInputs.push(freeSw);
  const capIn = track(input({ type: "number", min: "1", inputmode: "numeric", placeholder: venueCap ? `${venueCap} (mekan kapasitesi)` : "Sınırsız" }, true), "cap");
  const s06 = section("06", "Bilet & Kontenjan", null,
    h("div", { class: c("fld") }, h("span", { class: c("lbl") }, "GİRİŞ / BİLET ÜCRETİ (₺)"), h("div", { class: c("pricerow") }, priceIn, freeSw),
      helpEl("Boş bırakırsanız etkinlik “Ücretsiz” görünür.")),
    labelWrap("KONTENJAN", capIn, helpEl(venueCap ? `Boş bırakırsanız mekan kapasitesi (${venueCap} kişi) uygulanır.` : "Boş bırakırsanız sınırsız sayılır. Mekan kapasitenizi Profil > Kapasite bölümünden girebilirsiniz.")));

  // ── 07 VIP ──
  const stdBtn = h("button", { type: "button", role: "radio", class: cx(c("vipb"), "dk-press") }, "Standart");
  const vipBtn = h("button", { type: "button", role: "radio", class: cx(c("vipb"), "is-vip", "dk-press") }, raw("sparkle", 15), "VIP İste");
  stdBtn.addEventListener("click", () => { if (!locked() && !vipLocked()) { st.vip = false; changed(); } });
  vipBtn.addEventListener("click", () => { if (!locked() && !vipLocked()) { st.vip = true; changed(); } });
  const vipGroup = h("div", { role: "radiogroup", "aria-label": "VIP seçimi", class: c("vipg") }, stdBtn, vipBtn);
  vipGroup.addEventListener("keydown", (e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); (st.vip ? stdBtn : vipBtn).click(); (st.vip ? vipBtn : stdBtn).focus(); } });
  allInputs.push(stdBtn, vipBtn);
  const vipHelp = helpEl("VIP etkinlikler onaylanınca müşteride en üstteki kayan alanda en önde + “VIP DENEYİM” rozetiyle gösterilir. İsteğin GigBridge ekibinin onayına düşer.");
  const s07 = section("07", "VIP Etkinlik", null, vipGroup, vipHelp);

  // ── hata + eylem çubuğu ──
  const errBox = h("div", { role: "alert", class: c("err"), hidden: true });
  const lockNote = h("div", { class: c("lock"), hidden: true });
  const cancelLink = h("a", { href: "#/venue", class: cx(c("cancel"), "dk-link") }, raw("back", 16), "Vazgeç");
  cancelLink.addEventListener("click", (e) => { e.preventDefault(); guardNav("#/venue"); });
  const draftBtn = h("button", { type: "button", class: cx(c("draft"), "dk-press") }, raw("save", 16), "Taslak kaydet");
  const pubLbl = h("span", {}, isEdit ? "Değişiklikleri kaydet" : "Etkinliği Yayınla");
  const pubBtn = h("button", { type: "button", class: cx(c("pub"), "dk-press") }, raw("send", 16, "2"), pubLbl);
  pubBtn.addEventListener("click", () => publish());
  draftBtn.addEventListener("click", saveDraft);
  const actions = h("div", { class: c("actions") }, cancelLink, h("div", { class: c("actr") }, draftBtn, pubBtn));

  const form = h("form", { "aria-label": "Etkinlik formu", class: c("form"), novalidate: true },
    s01, s02, h("div", { class: c("pair") }, s03, s04), s05, h("div", { class: c("pair") }, s06, s07), errBox, actions);
  form.addEventListener("submit", (e) => e.preventDefault()); // Enter yanlışlıkla yayınlamasın (legacy ile aynı: yalnız düğme)

  // ═════════ önizleme (aside) ═════════
  const cardSlot = h("div", { class: c("cardslot") });
  const checks = h("div", { class: c("checks") });
  const locNote = h("span", {});
  const aside = h("aside", { "aria-label": "Canlı önizleme", class: c("aside") },
    h("div", { class: c("pvhead") }, h("span", { class: c("pvl") }, "CANLI ÖNİZLEME"), h("span", { class: c("pvr") }, h("span", { class: c("pvdot") }), "Keşfet kartı")),
    cardSlot,
    h("div", { class: c("checkcard") }, h("span", { class: c("lbl") }, "YAYIN KONTROLÜ"), checks),
    h("div", { class: c("locnote") }, raw("pin", 16, "1.8", { color: "#4ED8FF" }), locNote));
  const grid = h("div", { class: c("grid") }, form, aside);

  // Duyarlı yerleşim: ≤1279 önizleme eylem çubuğunun ÜSTÜNE (07'den sonra) iki kolonlu blok olarak taşınır (spec §10)
  const narrow = window.matchMedia("(max-width: 1279px)");
  const place = () => {
    if (narrow.matches) { if (aside.parentNode !== form) form.insertBefore(aside, errBox); }
    else if (aside.parentNode !== grid) grid.append(aside);
  };
  narrow.addEventListener("change", place);
  unsubs.push(() => narrow.removeEventListener("change", place));
  // Yapışkan önizleme (≥1280): sütun görünür alana sığıyorsa üstte (96 = 72 üst çubuk + 24); sığmıyorsa (ör. 1366×768 düzenleme)
  // ALTTAN hizalanır (negatif top) → YAYIN KONTROLÜ ve konum notu kaydırırken görünür kalır.
  const stickTop = () => {
    if (narrow.matches || !aside.isConnected) { aside.style.top = ""; return; }
    aside.style.top = Math.min(96, window.innerHeight - aside.offsetHeight - 16) + "px";
  };
  const asideRO = typeof ResizeObserver === "function" ? new ResizeObserver(stickTop) : null;
  asideRO?.observe(aside);
  window.addEventListener("resize", stickTop);
  narrow.addEventListener("change", stickTop);
  unsubs.push(() => { asideRO?.disconnect(); window.removeEventListener("resize", stickTop); narrow.removeEventListener("change", stickTop); });

  // beforeunload: kirli form (sekme kapatma / yenileme)
  const onBeforeUnload = (e) => { if (dirty && !busy) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", onBeforeUnload);
  unsubs.push(() => window.removeEventListener("beforeunload", onBeforeUnload));
  unsubs.push(() => { if (st.cover.kind === "upload" && st.cover.url) URL.revokeObjectURL(st.cover.url); });

  // ══════════════════════════════════════════════════════════════════════
  // durum → arayüz
  // ══════════════════════════════════════════════════════════════════════
  const locked = () => !!lock;
  const vipLocked = () => isEdit && ev?.vipStatus === "approved";
  const isSolo = () => st.artist?.kind === "artist";
  function changed(o = {}) {
    dirty = true;
    hideErr();
    refresh(o);
  }
  function durationText() {
    if (!st.start || !st.end) return "";
    if (st.start === st.end) return "Bitiş başlangıçla aynı olamaz";
    const [a1, a2] = st.start.split(":").map(Number), [b1, b2] = st.end.split(":").map(Number);
    let m = (b1 * 60 + b2) - (a1 * 60 + a2);
    const wraps = m <= 0; if (wraps) m += 1440;
    return `${Math.floor(m / 60)} sa${m % 60 ? " " + (m % 60) + " dk" : ""}${wraps ? " · ertesi gün biter" : ""}`;
  }
  const dateObj = () => { const d = st.date ? new Date(st.date + "T00:00:00") : null; return d && !isNaN(d) ? d : null; };
  function coverUrl() {
    if (st.cover.kind === "preset") return presetSrc(st.cover.url);
    if (st.cover.kind === "upload" || st.cover.kind === "existing") return st.cover.url;
    return null;
  }
  function coverMedia(cls) {
    const url = coverUrl();
    if (url) {
      const img = h("img", { src: url, alt: "Seçili kapak fotoğrafı", class: cls, decoding: "async" });
      img.addEventListener("error", () => img.replaceWith(coverPh(cls)), { once: true });
      return img;
    }
    return coverPh(cls);
  }
  // Kapak yok: tür gradyanı + serif baş harf (Keşfet kartlarının görselsiz yer tutucusu ile aynı dil); ad boşsa yalnız gradyan
  const coverPh = (cls) => h("span", { class: cx(cls, c("ph")), style: { background: phGrad(st.genre.trim(), 150) }, role: "img", "aria-label": "Kapak seçilmedi" },
    h("span", {}, st.title.trim() ? initials(st.title.trim()) : ""));
  let coverAnimA = true;
  function refresh(o = {}) {
    const g = st.genre.trim();
    // kapak kutusu + döşemeler
    if (o.cover || o.init || (o.genre && !coverUrl()) || !coverBox.firstChild || (!coverUrl() && o.title !== false)) {
      const media = coverMedia(cx(c("coverimg"), o.cover ? (coverAnimA ? "dk-fa" : "dk-fb") : null));
      if (o.cover) coverAnimA = !coverAnimA;
      coverBox.replaceChildren(media, coverTag);
    }
    tileBtns.forEach((b) => { const on = st.cover.kind === "preset" && st.cover.url === b.preset.url; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on || (st.cover.kind !== "preset" && b === tileBtns[0]) ? 0 : -1; });
    uploadBtn.classList.toggle("is-on", st.cover.kind === "upload");
    uploadLbl.textContent = st.cover.kind === "upload" ? "Değiştir" : "Yükle";
    uploadBtn.setAttribute("aria-label", st.cover.kind === "upload" ? "Yüklenen kapağı değiştir" : "Kapak fotoğrafı yükle");
    // sanatçı
    const a = st.artist;
    selBtn.classList.toggle("is-set", !!a);
    artistName.textContent = a ? a.name + (a.kind === "group" ? " · Grup" : "") : "Sanatçı veya grup seçin";
    artistAvSlot.replaceChildren();
    if (a?.photo) { artistAvSlot.append(h("img", { src: a.photo, alt: "", class: c("selimg") })); artistAvSlot.hidden = false; } else artistAvSlot.hidden = true;
    pickBtn.hidden = !!a; clearBtn.hidden = !a;
    artistHelp.textContent = a ? (a.kind === "group" ? "✓ Grup seçildi" : a.kind === "artist" ? "✓ Kayıtlı sanatçı seçildi" : "Sanatçı adı (kayıtlı profil değil)") : (isEdit ? "Sistemdeki kayıtlı sanatçılardan seçin." : "Sistemdeki kayıtlı sanatçılardan veya gruplardan seçin.");
    artistHelp.classList.toggle("is-ok", !!a && a.kind !== "text");
    feeWrap.hidden = !(isSolo() && !isEdit);
    // süre
    durEl.textContent = durationText();
    durEl.classList.toggle("is-err", !!st.start && st.start === st.end);
    // tür çipleri
    chipBtns.forEach((b) => { const on = !!g && fold(b.g) === fold(g); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    // bilet
    priceIn.disabled = st.free || locked();
    priceIn.placeholder = st.free ? "Ücretsiz" : "Boş bırakırsanız 'Ücretsiz' görünür";
    if (st.free) priceIn.value = ""; else if (priceIn.value !== st.price) priceIn.value = st.price;
    priceIn.classList.toggle("is-off", st.free);
    freeSw.setAttribute("aria-checked", st.free ? "true" : "false");
    freeSw.classList.toggle("is-on", st.free);
    // VIP
    stdBtn.classList.toggle("is-on", !st.vip); stdBtn.setAttribute("aria-checked", st.vip ? "false" : "true"); stdBtn.tabIndex = st.vip ? -1 : 0;
    vipBtn.classList.toggle("is-on", st.vip); vipBtn.setAttribute("aria-checked", st.vip ? "true" : "false"); vipBtn.tabIndex = st.vip ? 0 : -1;
    if (vipLocked()) vipHelp.textContent = "VIP onaylandı — etkinlik “VIP DENEYİM” rozetiyle yayında. Onaylı VIP düzenlemede değiştirilemez.";
    drawPreview(o);
    drawChecks();
    if (isEdit) syncPub();
  }

  // ── önizleme kartı (cards.eventCard — Keşfet kartıyla aynı bileşen) ──
  let card = null;
  function drawPreview(o = {}) {
    const g = st.genre.trim();
    const d = dateObj();
    const venueName = prof().displayName || "Mekan";
    const fake = {
      id: "", title: st.title.trim() || "Etkinlik adı", artistName: st.artist?.name || "Sanatçı yok", venueName,
      genre: g ? [g] : [], ticketPrice: st.free ? null : parsePrice(st.price),
      dateKey: st.date || "", startTime: st.start || "", bannerUrl: coverUrl(), attendeeCount: 0,
    };
    const rebuild = !card || o.cover || o.init || o.genre || (!coverUrl() && o.title !== false);
    if (rebuild) {
      const next = eventCard(fake, { media: 214, titleSize: 20, footer: "cta", badge: false });
      next.removeAttribute("href");
      next.classList.add(c("card"));
      const img = next.querySelector(".dk-ecd-media > img");
      if (img && o.cover) img.classList.add(coverAnimA ? "dk-fb" : "dk-fa");
      const ph = next.querySelector(".dk-ecd-media > .dk-ec-ph");
      if (ph) { ph.style.background = phGrad(g, 150); const t = ph.querySelector(":scope > span"); if (t) t.textContent = st.title.trim() ? initials(st.title.trim()) : ""; }
      if (card) card.replaceWith(next); else cardSlot.append(next);
      card = next;
    }
    // metin alanları (yer tutucular: — / TARİH / GÜN / TÜR / Etkinlik adı / Sanatçı yok)
    const k = card.querySelector(".dk-ecd-k");
    if (k) {
      const col = g ? genreColor(g) : "#FF8A2A";
      k.style.color = col;
      k.replaceChildren(h("span", { class: "dk-ecd-dot", style: { background: col } }), `${g ? trUpper(g) : "TÜR"} · ${d ? WD[d.getDay()] : "GÜN"}${st.start ? " " + st.start : ""}`);
    }
    const t = card.querySelector(".dk-ecd-t"); if (t) { t.textContent = st.title.trim() || "Etkinlik adı"; t.classList.toggle(c("phtext"), !st.title.trim()); }
    const s = card.querySelector(".dk-ecd-s"); if (s) s.textContent = `${st.artist?.name || "Sanatçı yok"} · ${venueName}`;
    const dd = card.querySelector(".dk-dt-d"), mm = card.querySelector(".dk-dt-m");
    if (dd) dd.textContent = d ? String(d.getDate()) : "—";
    if (mm) mm.textContent = d ? MON[d.getMonth()] : "TARİH";
    const pr = card.querySelector(".dk-ec-price");
    // Keşfet kartı (cards.eventCard) "Ücretsiz"i yeşil çizer (sistem geneli: WebEtkinlikler/WebLanding priceC) → önizleme aynı
    if (pr) { const pv = st.free ? null : parsePrice(st.price); pr.textContent = pv ? "₺" + pv.toLocaleString("tr-TR") : "Ücretsiz"; pr.style.color = pv ? "#F2F1EE" : "#7CE0B0"; }
    const media = card.querySelector(".dk-ecd-media");
    let vip = media?.querySelector("." + c("vipbadge"));
    if (st.vip && media && !vip) media.append(h("span", { class: c("vipbadge") }, raw("sparkle", 11, "2"), "VIP DENEYİM"));
    if (!st.vip && vip) vip.remove();
  }

  // ── yayın kontrolü ──
  function drawChecks() {
    const p = prof();
    const pinned = p?.location?.lat != null && p?.location?.lng != null;
    const d = dateObj();
    const cap = st.cap ? Number(st.cap) : null;
    const rows = [
      [pinned, pinned ? `Mekan konumu pinlendi · ${p.displayName || "Mekan"}` : "Mekan konumu pinlenmedi — Profil'den pinle"],
      [!!st.title.trim(), st.title.trim() ? "Etkinlik adı: " + st.title.trim() : "Etkinlik adı girilmedi"],
      [!!d, d ? `Tarih: ${d.getDate()} ${MON[d.getMonth()]}${st.start ? " · " + st.start : ""}` : "Tarih seçilmedi"],
      st.artist
        ? (isEdit ? [true, `Sanatçı: ${st.artist.name}${st.artist.kind === "group" ? " (grup)" : ""}`]
          : isSolo() ? [Number(st.fee) >= MIN_STAGE_FEE, `Sanatçıya ₺${(Number(st.fee) || 0).toLocaleString("tr-TR")} teklif gönderilecek`]
          : [true, `${st.artist.name} (grup) etkinliğe eklenecek`])
        : [true, "Sanatçısız etkinlik"],
      [true, cap ? `Kontenjan: ${cap.toLocaleString("tr-TR")} kişi` : venueCap ? `Kontenjan: ${venueCap} (mekan kapasitesi) kişi` : "Kontenjan: sınırsız"],
      [!st.vip || vipLocked(), vipLocked() ? "VIP onaylandı" : st.vip ? "VIP isteği GigBridge ekibinin onayına düşer" : "Standart yayın", " (onay bekler)"],
    ];
    // sarı satırın ekran okuyucu eki: eksik alan "(eksik)", isteğe bağlı VIP isteği "(onay bekler)"
    checks.replaceChildren(...rows.map(([ok, text, srWarn = " (eksik)"]) => h("div", { class: cx(c("chk"), ok ? "is-ok" : "is-warn") },
      h("span", { class: c("chkic"), "aria-hidden": "true" }, raw("check", 12, "2.6")), h("span", {}, text),
      ok ? null : h("span", { class: "dk-sr" }, srWarn))));
    const where = [p.district || p.location?.district, p.city || p.location?.city].filter(Boolean).join(", ");
    locNote.textContent = `Etkinlik, mekan konumun${where ? ` (${where})` : ""} üzerinden müşteri haritasında görünür. Konum pinlenmemişse yayınlanamaz.`;
  }

  // ── hata kutusu ──
  function showErr(text, { locFix = false } = {}) {
    // replaceChildren null'u "null" metnine çevirir → yalnız gerçek düğümler
    errBox.replaceChildren(...[raw("info", 16), h("span", { class: c("errt") }, text),
      locFix && h("a", { href: "#/venue/profil", class: cx(c("locfix"), "dk-press") }, "📍 Mekan Konumunu Ayarla →")].filter(Boolean));
    errBox.hidden = false;
    errBox.classList.remove("dk-pop"); void errBox.offsetWidth; errBox.classList.add("dk-pop");
    errBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function hideErr() { if (!errBox.hidden) errBox.hidden = true; }

  // ── sanatçı seçici modalı ──
  async function openPicker() {
    const P = (s) => `${NS}-pk-${s}`;
    const q = h("input", { "aria-label": "Sanatçı ara", placeholder: "Sanatçı ara…", class: P("in"), autocomplete: "off" });
    const list = h("div", { class: P("list"), role: "group", "aria-label": "Sanatçılar ve gruplar" }, h("div", { class: P("empty"), role: "status" }, "Yükleniyor…"));
    const m = dkModal({
      variant: "panel", size: 520, top: 160, title: "Sanatçı veya Grup Seç", cls: P("modal"),
      body: [h("label", { class: P("search") }, raw("search", 16, "1.8", { color: "#8A8E97" }), q), list],
    });
    const [artists, groups] = await Promise.all([artistsP, groupsP]);
    if (!alive) { m.close(); return; }
    const city = fold(prof().city || "");
    const rowsAll = [
      ...[...artists].sort((a, b) => ((city && fold(b.city) === city) - (city && fold(a.city) === city)) || nameOf(a).localeCompare(nameOf(b), "tr")).map((x) => ({ x, kind: "artist" })),
      ...[...groups].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "tr")).map((x) => ({ x, kind: "group" })),
    ];
    const draw = () => {
      const t = trLower(q.value.trim());
      const rows = rowsAll.filter(({ x }) => !t || trLower(nameOf(x)).includes(t));
      list.replaceChildren();
      if (!rows.length) { list.append(h("div", { class: P("empty"), role: "status" }, "Sonuç bulunamadı")); return; }
      rows.forEach(({ x, kind }) => {
        const g = genreOf(x);
        const on = st.artist && st.artist.kind === kind && st.artist.id === x.id;
        const av = x.photoURL
          ? h("img", { src: x.photoURL, alt: "", class: P("av"), loading: "lazy" })
          : h("span", { class: cx(P("av"), P("avi")), style: { background: gradOf(g) }, "aria-hidden": "true" }, trUpper(nameOf(x).trim().charAt(0) || "?"));
        const b = h("button", { type: "button", "aria-pressed": on ? "true" : "false", class: cx(P("row"), "dk-row") }, av,
          h("span", { class: P("col") }, h("span", { class: P("name") }, nameOf(x)), h("span", { class: P("meta") }, kind === "group" ? `Grup${g ? " · " + g : ""}` : (g || "Sanatçı"))),
          on ? h("span", { class: P("on") }, raw("check", 18, "2.4")) : null);
        b.addEventListener("click", () => {
          st.artist = { kind, id: x.id, name: nameOf(x), photo: x.photoURL || null, genre: g, obj: x };
          if (g) { st.genre = g; genreIn.value = g; }
          m.close();
          changed({ genre: true });
          selBtn.focus();
        });
        list.append(b);
      });
    };
    q.addEventListener("input", draw);
    draw();
  }

  // ── taslak ──
  function snapshot() {
    return {
      v: 1, title: st.title, desc: st.desc, fee: st.fee, date: st.date, start: st.start, end: st.end, genre: st.genre, price: st.price, free: st.free, cap: st.cap, vip: st.vip,
      artist: st.artist ? { kind: st.artist.kind, id: st.artist.id || null, name: st.artist.name, photo: st.artist.photo || null, genre: st.artist.genre || "" } : null,
      cover: st.cover.kind === "preset" || st.cover.kind === "existing" ? { kind: st.cover.kind, url: st.cover.url } : st.cover.kind === "none" ? { kind: "none" } : null,
      savedAt: Date.now(),
    };
  }
  function saveDraft() {
    if (locked()) return;
    const snap = snapshot();
    if (!writeDraft(DKEY, snap)) { dkToast("Taslak kaydedilemedi", { type: "err" }); return; }
    dkToast(st.cover.kind === "upload" ? "Taslak kaydedildi (yüklenen fotoğraf hariç)" : "Taslak kaydedildi");
  }
  async function applyDraft(d) {
    if (!d || d.v !== 1) return false;
    Object.assign(st, { title: d.title || "", desc: d.desc || "", fee: d.fee || "", genre: d.genre || "", price: d.price || "", free: !!d.free, cap: d.cap || "", vip: !!d.vip });
    if (!isEdit) Object.assign(st, { date: d.date || "", start: d.start || "", end: d.end || "" });
    if (d.cover && d.cover.kind) st.cover = d.cover.kind === "none" ? { kind: "none" } : { kind: d.cover.kind, url: d.cover.url };
    st.artist = null;
    if (d.artist) {
      st.artist = { ...d.artist };
      if (d.artist.id && d.artist.kind !== "text") {
        const pool = d.artist.kind === "group" ? await groupsP : await artistsP;
        const obj = pool.find((x) => x.id === d.artist.id);
        if (obj) st.artist.obj = obj; else if (d.artist.kind === "artist" || d.artist.kind === "group") st.artist = null; // silinmiş profil
      }
    }
    return true;
  }
  // Geri yükleme bildirimi + "Taslağı sil": taslağı atar, formu boş (oluştur) ya da yüklenen etkinlik (düzenle) hâline döndürür
  function restoredToast() {
    dkToast("Taslak geri yüklendi", { type: "info", duration: 6000, action: { label: "Taslağı sil", onClick: discardDraft } });
  }
  function discardDraft() {
    if (!alive || busy) return;
    dropDraft(DKEY);
    if (st.cover.kind === "upload" && st.cover.url) URL.revokeObjectURL(st.cover.url);
    st = orig ? { ...orig, cover: { ...orig.cover } } : blank();
    fillInputs();
    hideErr();
    refresh({ init: true, cover: true });
    dirty = false;
    dkToast("Taslak silindi");
  }
  function fillInputs() {
    titleIn.value = st.title; descIn.value = st.desc; feeIn.value = st.fee; dateIn.value = st.date; startIn.value = st.start; endIn.value = st.end;
    genreIn.value = st.genre; priceIn.value = st.free ? "" : st.price; capIn.value = st.cap;
  }

  // ── yayınla / kaydet ──
  // Yeniden giriş koruması İLK await'ten önce (çift tık: aynı-gün kontrolü venueEvents'i beklerken ikinci tık da geçiyordu).
  // createNew/saveEdit başarıda true döner (sayfa #/venue'ya gider); doğrulama hatası / vazgeç / hata → düğmeler geri açılır.
  async function publish() {
    if (busy) return;
    if (dkLoginGate(isEdit ? "Etkinliği düzenlemek" : "Etkinlik oluşturmak")) return;
    busy = true; pubBtn.disabled = true; draftBtn.disabled = true;
    let done = false;
    try { done = await (isEdit ? saveEdit() : createNew()); }
    finally { if (!done && alive) setBusy(false); }
  }
  async function createNew() {
    const title = st.title.trim(), date = st.date, time = st.start, end = st.end;
    const p = session.profile || prof();
    if (!title) return showErr("Etkinlik adı gir.");
    if (!date) return showErr("Tarih seç.");
    if (date < isoDate(Date.now())) return showErr("Geçmiş bir tarih seçilemez.");
    if (p?.location?.lat == null || p?.location?.lng == null) return showErr("Etkinliğin haritada görünmesi için önce mekan konumunu ayarla.", { locFix: true });
    const myEvents = await myEventsP;
    if (!alive) return false;
    const lcT = title.toLocaleLowerCase("tr-TR");
    const sameDay = (e) => e.date === date || e.dateKey === date || (eventStartMs(e) != null && isoDate(eventStartMs(e)) === date);
    if (myEvents.some((e) => sameDay(e) && (e.title || "").trim().toLocaleLowerCase("tr-TR") === lcT)) return showErr("Aynı gün aynı adla bir etkinlik zaten var.");
    if (time && end && time === end) return showErr("Bitiş saati başlangıçla aynı olamaz.");
    if (!st.free && Number.isNaN(priceValue(st.price))) return showErr("Bilet ücreti geçersiz.");
    if (capInvalid(st.cap)) return showErr("Kontenjan en az 1 kişi olmalı.");
    const pv = st.free ? null : parsePrice(st.price); // "2.500" → 2500 (düzenleme ile aynı ayrıştırıcı)
    const f = { title, date, time, genre: st.genre.trim(), price: pv ? String(pv) : "", capacity: String(st.cap || "").trim(), description: st.desc.trim(), vip: st.vip };
    if (isSolo()) {
      f.artistId = st.artist.id; f.artistName = st.artist.name;
      if (!(Number(st.fee) >= MIN_STAGE_FEE)) return showErr(`Sanatçı seçtiysen sahne ücreti en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")} olmalı.`);
      if (!time) return showErr("Sanatçıya teklif için başlangıç saati de gir.");
    } else if (st.artist?.kind === "group") {
      f.artistName = st.artist.name;
    }
    setBusy(true, st.cover.kind === "upload" ? "Fotoğraf yükleniyor…" : "Yayınlanıyor…");
    try {
      if (st.cover.kind === "upload" && st.cover.file) f.bannerUrl = await uploadImage(st.cover.file, uid);
      else if (st.cover.kind === "preset") f.bannerUrl = st.cover.url;
      setBusy(true, "Yayınlanıyor…");
      const newId = await createEvent(p, f);
      if (end) { // bitiş → endAt (canlı pin); gece devrilirse ertesi güne taşır (legacy birebir)
        const startAt = new Date(`${date}T${time || "00:00"}:00`);
        const endAt = new Date(`${date}T${end}:00`);
        if (!isNaN(endAt) && !isNaN(startAt)) { if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1); await updateEvent(newId, { endAt }).catch(() => {}); }
      }
      let offerSent = false;
      if (isSolo()) {
        const dup = await findExistingInvitation(uid, st.artist.id, date).catch(() => null);
        if (!dup) {
          offerSent = true;
          await createInvitation(p, st.artist.obj || { id: st.artist.id, displayName: st.artist.name, genre: st.artist.genre }, { date, time, fee: st.fee, message: "", photoUrl: f.bannerUrl ?? null, eventId: newId });
          const d = dateObj();
          sendNotification(st.artist.id, { type: "event_invite", title: "Yeni Sahne Teklifi 🎤", fromName: p.displayName ?? "Mekan",
            body: `${p.displayName ?? "Bir mekan"} sizi "${title}" etkinliğine davet etti (${d ? `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}` : date}${time ? " · " + time : ""} · ₺${Number(st.fee).toLocaleString("tr-TR")}).`,
            extra: { eventId: newId, relatedUserId: null } }).catch(() => {});
        }
      }
      dropDraft(DKEY);
      dirty = false;
      // aynı tarihe zaten teklif varsa yeni teklif yazılmaz → "teklif gönderildi" denmez
      dkToast(st.vip ? "Yayınlandı — VIP onayına düştü" : offerSent ? "Yayınlandı — sanatçıya teklif gönderildi" : "Etkinlik yayınlandı");
      location.hash = "#/venue";
      return true;
    } catch (e) {
      console.warn("[venue create]", e);
      setBusy(false);
      showErr("Oluşturulamadı.");
      return false;
    }
  }
  async function saveEdit() {
    if (lock) return false;
    const title = st.title.trim();
    if (!title) return showErr("Etkinlik adı gir.");
    // değişiklik yok → yazım yok (lastEditedAt damgası 2 günlük kilit başlatırdı); düğme artboard'daki gibi etkin kalır
    if (!editChanged()) { dkToast("Değişiklik yok", { type: "info" }); return false; }
    const priceTouched0 = st.free !== orig.free || (!st.free && String(st.price ?? "").trim() !== String(orig.price ?? "").trim());
    if (priceTouched0 && !st.free && Number.isNaN(priceValue(st.price))) return showErr("Bilet ücreti geçersiz.");
    if (String(st.cap ?? "").trim() !== String(orig.cap ?? "").trim() && capInvalid(st.cap)) return showErr("Kontenjan en az 1 kişi olmalı.");
    // kilit yeniden denetimi (sayfa açıkken süre dolmuş olabilir)
    const s = eventStartMs(ev);
    if (s != null && s <= Date.now()) { setLock({ kind: "started" }); return showErr("Etkinlik başladı, düzenlenemez."); }
    const g = st.genre.trim();
    // Yazım şekli app EditEventScreen ile aynı (ticketPrice + capacity her kayıtta gönderilir), ama DOKUNULMAYAN alan
    // yüklenen değeriyle aynen geri yazılır: eski kod ondalığı siliyordu (99.5 → 995) ve boş kontenjanı mekan kapasitesine çeviriyordu.
    const priceTouched = priceTouched0;
    // Tür: form yalnız ilk türü gösterir → DEĞİŞMEDİYSE yüklenen dizi aynen geri yazılır (["Jazz","Blues"] korunur);
    // değiştiyse app EditEventScreen gibi [g].
    const genreTouched = g !== String(orig.genre ?? "").trim();
    const capTouched = String(st.cap ?? "").trim() !== String(orig.cap ?? "").trim();
    const capDigits = String(st.cap || (venueCap ?? "")).replace(/[^0-9]/g, "");
    const patch = {
      title,
      artistName: (st.artist?.name || "").trim(),
      artistId: st.artist?.kind === "artist" ? st.artist.id : null,
      genre: genreTouched ? (g ? [g] : []) : (ev.genre ?? []),
      ticketPrice: priceTouched ? (st.free ? null : parsePrice(st.price)) : (ev.ticketPrice ?? null),
      capacity: capTouched ? (capDigits ? parseInt(capDigits, 10) : null) : (ev.capacity ?? null),
      description: st.desc.trim(),
    };
    // app handleSave onayı ("Emin misiniz?" → "Kaydet ve Yayınla") + web notu: kayıt 2 günlük düzenleme kilidi başlatır
    const dd = s != null ? new Date(s) : null;
    const when = dd ? `${dd.getDate()} ${MONTHS_TR[dd.getMonth()]} ${dd.getFullYear()}${st.start ? " " + st.start : ""}` : (st.date || "—");
    const ok = await confirmNoBackdrop({ title: "Emin misiniz?", confirmLabel: "Kaydet ve Yayınla", cancelLabel: "Vazgeç",
      body: `Etkinlik "${when}" tarihinde yayınlanacak. Değişiklikleri kaydetmek istiyor musunuz? Kaydettikten sonra 2 gün boyunca yeniden düzenleyemezsin.` });
    if (!ok || !alive) return false;
    setBusy(true, st.cover.kind === "upload" ? "Fotoğraf yükleniyor…" : "Kaydediliyor…");
    try {
      const origCover = orig.cover.kind === "none" ? null : orig.cover.url;
      if (st.cover.kind === "upload" && st.cover.file) patch.bannerUrl = await uploadImage(st.cover.file, uid);
      else {
        const cur = st.cover.kind === "none" ? null : st.cover.url;
        if (cur !== origCover) patch.bannerUrl = cur;
      }
      if (!vipLocked()) {
        const nextVip = st.vip ? "pending" : null;
        const was = ev.vipStatus === "pending" ? "pending" : null;
        if (nextVip !== was && !(nextVip === null && ev.vipStatus === "rejected")) patch.vipStatus = nextVip;
      }
      setBusy(true, "Kaydediliyor…");
      await saveEventEdits(eventId, patch);
      dropDraft(DKEY);
      dirty = false;
      dkToast("Etkinlik güncellendi");
      location.hash = "#/venue";
      return true;
    } catch (e) {
      console.warn("[venue edit]", e);
      setBusy(false);
      showErr("Etkinlik güncellenemedi.");
      return false;
    }
  }
  // Düzenleme: form yüklenen etkinlikle aynıysa "Değişiklikleri kaydet" kapalı
  const formKey = (x) => JSON.stringify([x.title.trim(), x.desc.trim(), x.artist ? [x.artist.kind, x.artist.id || null, x.artist.name] : null, x.genre.trim(),
    x.free ? "" : String(x.price ?? "").trim(), !!x.free, String(x.cap ?? "").trim(), !!x.vip, x.cover.kind === "none" ? null : x.cover.kind + ":" + x.cover.url]);
  const editChanged = () => !!orig && formKey(st) !== formKey(orig);
  function syncPub() {
    pubBtn.disabled = busy || locked(); draftBtn.disabled = busy || locked();
  }
  function setBusy(on, label) {
    busy = on;
    syncPub();
    pubBtn.classList.toggle("is-busy", on);
    pubBtn.setAttribute("aria-busy", on ? "true" : "false");
    pubLbl.textContent = on ? (label || "…") : (isEdit ? "Değişiklikleri kaydet" : "Etkinliği Yayınla");
  }
  function setLock(l) {
    lock = l;
    const off = !!l;
    [...allInputs].forEach((el) => { el.disabled = off; });
    [dateIn, startIn, endIn].forEach((el) => { el.disabled = true; });
    if (!off) [dateIn, startIn, endIn].forEach((el) => { el.disabled = isEdit; });
    priceIn.disabled = off || st.free;
    if (vipLocked()) { stdBtn.disabled = true; vipBtn.disabled = true; }
    syncPub();
    form.classList.toggle("is-locked", off);
    lockNote.hidden = !off;
    if (off) {
      const next = l.next ? `Tekrar düzenleme: ${l.next.getDate()} ${MONTHS_TR[l.next.getMonth()]} ${l.next.getFullYear()}, ${pad2(l.next.getHours())}:${pad2(l.next.getMinutes())}` : null;
      const text = l.kind === "started" ? "Etkinlik başladı, düzenlenemez."
        : l.kind === "org" ? "Bu etkinlik bir organizatöre ait — düzenlemeyi organizatör yapar."
        : "Bir etkinlikte 2 günde bir değişiklik yapabilirsiniz.";
      lockNote.replaceChildren(raw("lock", 16), h("span", { class: c("lockcol") }, h("span", {}, text), next ? h("span", { class: c("locknext") }, next) : null));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // açılış
  // ══════════════════════════════════════════════════════════════════════
  async function init() {
    if (!isEdit) {
      root.append(modeRow, grid);
      place();
      const d = readDraft(DKEY);
      if (d && await applyDraft(d)) { if (!alive) return; fillInputs(); refresh({ init: true }); dirty = true; restoredToast(); }
      else refresh({ init: true });
      return;
    }
    // düzenleme: yükleniyor iskeleti
    const skel = h("div", { class: c("loading"), "aria-busy": "true", "aria-label": "Yükleniyor" },
      dkSkeleton({ w: 300, h: 44, r: 8 }), h("div", { class: c("skgrid") }, h("div", { class: c("skcol") }, ...[220, 160, 220].map((hh) => dkSkeleton({ h: hh, r: 12 }))), dkSkeleton({ h: 420, r: 10 })));
    root.append(skel);
    let e = null, err = false;
    try { e = await eventById(eventId); } catch (_) { err = true; }
    if (!alive) return;
    skel.remove();
    if (err || !e || e.venueId !== uid) {
      root.append(dkEmpty({ icon: "alertCircle", title: err ? "Yüklenemedi" : "Etkinlik bulunamadı.", sub: err ? "Bağlantıyı kontrol edip yenile." : "Etkinlik silinmiş ya da bu mekana ait değil.",
        action: dkButton("Panele dön", { variant: "outline", size: 40, href: "#/venue", icon: "arrowLeft" }), cls: c("notfound") }));
      return;
    }
    ev = e;
    const s = eventStartMs(e);
    const g0 = Array.isArray(e.genre) ? (e.genre[0] || "") : (e.genre || "");
    const artists = await artistsP;
    if (!alive) return;
    const aObj = e.artistId ? artists.find((x) => x.id === e.artistId) : null;
    const endMs = toMs(e.endAt);
    const banner = e.bannerUrl || null;
    const presetHit = banner && BANNER_PRESETS.find((b) => b.url === banner);
    Object.assign(st, {
      title: e.title || "", desc: e.description || "",
      artist: e.artistId ? { kind: "artist", id: e.artistId, name: e.artistName || nameOf(aObj), photo: aObj?.photoURL || null, genre: genreOf(aObj), obj: aObj }
        : e.artistName ? { kind: "text", id: null, name: e.artistName } : null,
      date: e.dateKey || (s != null ? isoDate(s) : ""), start: e.startTime || (s != null ? fmtTime(s) : ""),
      end: e.endTime || (endMs != null ? fmtTime(endMs) : ""),
      genre: g0, price: Number(e.ticketPrice) > 0 ? String(e.ticketPrice) : "", free: !(Number(e.ticketPrice) > 0),
      cap: e.capacity != null ? String(e.capacity) : "", vip: e.vipStatus === "pending" || e.vipStatus === "approved",
      cover: presetHit ? { kind: "preset", url: banner } : banner ? { kind: "existing", url: banner } : { kind: "none" },
    });
    orig = { ...st, cover: { ...st.cover } };
    const dd = s != null ? new Date(s) : null;
    modeEdit.textContent = `Düzenle · ${e.title || "Etkinlik"}${dd ? ` ${dd.getDate()} ${MONTHS_TR_SHORT[dd.getMonth()]}` : ""}`;
    root.append(modeRow, lockNote, grid); // kilit notu formun üstünde: kullanıcı alanlara geçmeden görür
    place();
    // kilitler (app EditEventScreen): başladı → kilitli · son düzenlemeden 2 gün geçmedi → kilitli · organizatör etkinliği → salt-okunur
    const last = toMs(e.lastEditedAt);
    if (s != null && s <= Date.now()) setLock({ kind: "started" });
    else if (e.organizerId) setLock({ kind: "org" });
    else if (last != null && Date.now() - last < EDIT_COOLDOWN_MS) setLock({ kind: "cooldown", next: new Date(last + EDIT_COOLDOWN_MS) });
    else setLock(null);
    if (!lock) {
      const d = readDraft(DKEY);
      if (d && await applyDraft(d)) { if (!alive) return; dirty = true; restoredToast(); }
    }
    fillInputs();
    refresh({ init: true });
  }
  init();

  return {
    node: shell.node,
    destroy() {
      // Kenar çubuğu bağlantısı / tarayıcı Geri ile ayrılış onay sormaz → kaydedilmemiş form taslağa yazılır, dönüşte geri yüklenir
      // (Vazgeç → "Çık" onayı ve başarılı yayın dirty=false yapar → taslak yazılmaz).
      if (dirty && !busy && !lock) { try { writeDraft(DKEY, snapshot()); } catch (_) {} }
      unsubs.forEach((f) => { try { f(); } catch (_) {} }); shell.destroy();
    },
    // Profil tazelense de (aynı kullanıcı) formu koru — yeniden kurulum yazılanları silerdi.
    onSession(s) { return !!s?.user && s.user.uid === uid; },
  };
}
