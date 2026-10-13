// GEÇİCİ — Berkay: gerek kalmayınca kaldırılacak
// (kaldırma: bu dosya + mekan-ekle-util.js + mekan-ekle-ilceler.js + css/dk-admin-mekan-ekle.css + registry.js "adminMekanEkle"
//  satırı + panel-shell.js "mekanEkle" nav satırı; sunucu: GigBridge functions/adminVenues.js)
//
// WebAdmin › YÖNETİM › Mekan Ekle (#/admin/mekan-ekle, ≥769 px). Yönetici, mekanın kayıt + profil bilgilerini tek formda girip
// HAZIR (onaylı) bir mekan hesabı açar; giriş bilgilerini sonuç kartından kopyalayıp mekana iletir.
//   · E-posta mekan adından üretilir: berkayer032+<slug>@gmail.com (düzenlenebilir; doluysa sunucu <slug>2… önerir).
//   · Şifreyi yönetici yazar. Şifre YALNIZ bu görünümün belleğinde durur (sonuç kartı); Firestore'a, localStorage'a,
//     adrese ya da loglara yazılmaz; sayfadan çıkınca / "Yeni mekan" deyince silinir.
//   · Konum: birincil yol KOORDİNAT alanı (Google Haritalar'dan "38.0123, 27.1234" ya da bağlantı yapıştır) + ayrı Enlem/Boylam;
//     harita pini tıkla/sürükle ile eşzamanlı; "Adresten bul" (Nominatim). users.location = {lat, lng, address, city, district}.
//   · ?duzenle=<uid> → mevcut mekanı düzenleme (fotoğraf/konum sonradan eklenebilir) — callable adminUpdateVenue.
//   · Düzenlemede GİRİŞ BİLGİLERİ: giriş e-postasını sahibinin kendi adresine çevir (+ isteğe bağlı yeni şifre) — callable
//     adminSetVenueLogin (emailVerified:true; eski adresle giriş kapanır). "Şifre belirleme bağlantısı gönder" mevcut markalı
//     sendPasswordReset callable'ını kullanır (Resend, gigbridges.com/sifirla.html). Yeni şifre de yalnız sonuç kartında (bellekte).
//   · "Mekan panelini aç" (düzenleme çubuğu): panelini kendisi kullanmak istemeyen mekanın gönderi/etkinlik/profil işlerini
//     yönetici yürütür → yeni sekmede O MEKAN olarak oturum (callable adminVenueSession → özel jeton → postMessage ile yalnız
//     açılan sekmeye; o sekme oturumu yalnız kendinde tutar — js/yonetim.js). Yöneticinin bu sekmedeki oturumu değişmez.
// Yazımlar yalnız sunucuda: adminCreateVenue / adminUpdateVenue / adminSetVenueLogin (functions/adminVenues.js; fotoğraflar base64 → Storage).
import { h, openImageCropper, loadLeaflet } from "../../ui.js";
import { session } from "../../store.js";
import { db, collection, getDocs, getDoc, doc, query, where, functions, httpsCallable, sendPasswordResetMail } from "../../firebase.js";
import { MANAGE_READY, MANAGE_TOKEN, MANAGE_FAIL } from "../../yonetim.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { dkPageHero, dkButton, dkInput, dkTextarea, dkField, dkPasswordInput, dkChip, dkSegmented, dkAvatar, dkToast, dkConfirm, dkSkeleton } from "../shared/ui.js";
import { toMs, MONTHS_TR_SHORT, writeQuery, matchText } from "../shared/helpers.js";
import { ALL_GENRES } from "../shared/genres.js";
import {
  VENUE_TYPES, AMENITY_OPTIONS, EMAIL_RE, venueEmail, parseCoords, checkCoords, fmtCoord, fmtPair,
  CITY_NAMES, canonicalCity, districtsOf, canonicalDistrict, igHandle,
} from "./mekan-ekle-util.js";

const VIOLET = "#A78BFA";
const AMBER = "#FF8A2A";
const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAX_GENRES = 15;
const createFn = httpsCallable(functions, "adminCreateVenue", { timeout: 120000 });
const updateFn = httpsCallable(functions, "adminUpdateVenue", { timeout: 120000 });
const loginFn = httpsCallable(functions, "adminSetVenueLogin", { timeout: 60000 });
const sessionFn = httpsCallable(functions, "adminVenueSession", { timeout: 60000 });
const PIN_SVG = '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>';
const COPY_SVG = '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path>';

const str = (v) => (typeof v === "string" ? v.trim() : "");
const fmtDate = (v) => { const t = toMs(v); if (t == null) return "—"; const d = new Date(t); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`; };
const errText = (e) => (e?.code === "functions/permission-denied" ? "Bu işlem için yönetici yetkisi gerekli."
  : e?.code === "functions/unauthenticated" ? "Oturum süresi dolmuş. Çıkış yapıp tekrar giriş yap." : e?.message || "İşlem başarısız");
/**
 * Mekan panelini YENİ sekmede o mekan olarak aç (js/yonetim.js). Sekme tıklamanın içinde açılır (pop-up engeli yok); jeton
 * sunucudan gelince yalnız o pencereye (aynı köken, kaynak = açılan pencere) postMessage ile verilir, hiçbir yere yazılmaz.
 */
function openVenuePanel(uid, name) {
  const qs = new URLSearchParams(location.search);
  qs.set("yonetim", "1");
  const w = window.open(`${location.pathname}?${qs}#/venue`, "_blank");
  if (!w) { dkToast("Tarayıcı yeni sekmeyi engelledi. Adres çubuğundan pop-up izni verip tekrar dene.", { type: "err" }); return; }
  let token = null, fail = null, ready = false;
  const send = () => {
    if (!ready || (!token && !fail)) return;
    try { w.postMessage(token ? { type: MANAGE_TOKEN, token } : { type: MANAGE_FAIL, message: fail }, location.origin); } catch (_) {}
    token = null;
    stop();
  };
  const onMsg = (ev) => {
    if (ev.origin !== location.origin || ev.source !== w || ev.data?.type !== MANAGE_READY) return;
    ready = true;
    send();
  };
  const timer = setTimeout(() => stop(), 60000);
  function stop() { clearTimeout(timer); window.removeEventListener("message", onMsg); }
  window.addEventListener("message", onMsg);
  sessionFn({ uid }).then((r) => {
    token = r?.data?.token || null;
    if (!token) fail = "Mekan oturumu açılamadı.";
    else dkToast(`${name || "Mekan"} paneli yeni sekmede açıldı`);
    send();
  }).catch((e) => {
    console.error(e);
    fail = errText(e);
    dkToast(fail, { type: "err" });
    send();
  });
}
const blobToB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
// Harita pini küçük kopyası (app uploadPinThumb ile aynı: 144×144 JPEG)
async function makeThumb(blob, size = 144) {
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
  const s = Math.min(bmp.width, bmp.height);
  cv.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = h("textarea", { style: { position: "fixed", opacity: "0" } }); ta.value = t; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove(); return ok;
  }
}
const datalist = (id, items) => h("datalist", { id }, ...items.map((v) => h("option", { value: v })));

// Mekan listesi önbelleği (yönetici başına)
const _cache = { uid: null, list: null, at: 0 };
let _seg = "admin";

export function adminMekanEkleView(ctx) {
  const s = ctx.session || session;
  const myUid = s.user?.uid || "";
  let alive = true;
  const cleanups = [];
  if (_cache.uid !== myUid) { _cache.uid = myUid; _cache.list = null; }

  // ── durum ──
  let editId = null, editDoc = null;
  let pin = null;                       // { lat, lng }
  let genres = new Set(), amenities = new Set();
  let photo = null, cover = null;        // { blob, url }
  let photoRemoved = false, coverRemoved = false;
  let emailTouched = false, emailSeq = 0, emailTimer = null;
  let result = null;                     // { uid, name, email, password } — YALNIZ bellek
  let busy = false;
  let q = "";

  const shell = panelShell({ role: "admin", active: "mekanEkle", crumb: "Mekan Ekle", ctx, notifications: "custom", search: false });
  const root = shell.content;
  root.classList.add("dk-admin-panel", "dk-admin-etk", "dk-ame");

  const hero = dkPageHero({
    eyebrow: "YÖNETİCİ · MEKAN EKLE · GEÇİCİ", title: "Mekan hesabını ", em: "sen aç", tail: ".", color: VIOLET, cls: "dk-admin-panel-hero",
    lead: "Mekanın bilgilerini gir; hesap onaylı açılır. E-posta ve şifreyi sonuç kartından kopyalayıp mekana ilet.",
  });

  // ── 1) HESAP ──
  const nameF = dkField({ label: "Mekan adı", required: true, input: { placeholder: "Örn. Platform Kuşadası", maxlength: 80, autocomplete: "off" } });
  const emailF = dkField({ label: "E-posta (giriş)", required: true, input: { type: "email", placeholder: "berkayer032+mekanadi@gmail.com", maxlength: 254, autocomplete: "off", attrs: { spellcheck: "false" } } });
  const emailNote = h("div", { class: "dk-ame-enote", "aria-live": "polite" });
  const pwInput = dkPasswordInput({ placeholder: "En az 6 karakter", autocomplete: "new-password", maxlength: 128, attrs: { spellcheck: "false" } });
  const pwF = dkField({ label: "Şifre", required: true, input: pwInput, hint: "Mekana sen ileteceksin; hiçbir yerde saklanmaz." });
  const credRow = h("div", { class: "dk-ame-g2" }, h("div", { class: "dk-ame-col" }, emailF.node, emailNote), pwF.node);
  // düzenleme modu: giriş e-postası / yeni şifre / şifre belirleme bağlantısı (formun Kaydet'inden BAĞIMSIZ, anında uygulanır)
  const loginEmailF = dkField({ label: "Giriş e-postası", input: { type: "email", placeholder: "sahibin@ornek.com", maxlength: 254, autocomplete: "off", attrs: { spellcheck: "false" } } });
  const loginPw = dkPasswordInput({ placeholder: "Boş bırakılırsa şifre değişmez", autocomplete: "new-password", maxlength: 128, attrs: { spellcheck: "false" } });
  const loginPwF = dkField({ label: "Yeni şifre (isteğe bağlı)", input: loginPw });
  const loginBtn = dkButton("E-postayı değiştir", { variant: "violet", size: 40, icon: "mail" });
  const linkBtn = dkButton("Şifre belirleme bağlantısı gönder", { variant: "outline", size: 40, icon: "send" });
  const loginCur = h("span", { class: "dk-ame-rov" });
  const loginBox = h("div", { class: "dk-ame-login", hidden: true },
    h("div", { class: "dk-ame-lhead" }, h("span", { class: "dk-admin-etk-lbl" }, "ŞU ANKİ GİRİŞ"), loginCur),
    h("div", { class: "dk-ame-g2" }, loginEmailF.node, loginPwF.node),
    h("span", { class: "dk-admin-etk-sum" }, "Mekan sahibinin kendi e-postasını yaz. Değişince eski adresle giriş kapanır, yenisi doğrulanmış sayılır (doğrulama ekranı çıkmaz). Şifreyi sen belirleyebilir ya da sahibine bağlantı gönderip kendisinin belirlemesini sağlayabilirsin."),
    h("div", { class: "dk-ame-lbtns" }, loginBtn, linkBtn));
  const secAccount = section("HESAP", "Giriş bilgileri", [nameF.node, credRow, loginBox]);

  // ── 2) MEKAN ──
  const typeF = dkField({ label: "Mekan türü", input: { placeholder: "Listeden seç ya da yaz", maxlength: 40, autocomplete: "off", attrs: { list: "dk-ame-types" } } });
  const capF = dkField({ label: "Kapasite", input: { placeholder: "Örn. 450", inputmode: "numeric", maxlength: 6, autocomplete: "off" } });
  const phoneF = dkField({ label: "Telefon", input: { type: "tel", placeholder: "0256 000 00 00", maxlength: 30, autocomplete: "off" } });
  const webF = dkField({ label: "Web sitesi", input: { placeholder: "ornek.com", maxlength: 200, autocomplete: "off", attrs: { spellcheck: "false" } } });
  const igF = dkField({ label: "Instagram", input: { placeholder: "@mekanadi", maxlength: 80, autocomplete: "off", attrs: { spellcheck: "false" } }, hint: "Web sitesi yoksa mekan sayfasında Instagram bağlantısı gösterilir." });
  const bio = dkTextarea({ placeholder: "Mekanı birkaç cümleyle anlat (sahne, atmosfer, müzik).", rows: 4, maxlength: 1000 });
  const bioF = dkField({ label: "Tanıtım", input: bio });
  const secVenue = section("MEKAN", "Profil", [h("div", { class: "dk-ame-g2" }, typeF.node, capF.node), h("div", { class: "dk-ame-g2" }, phoneF.node, webF.node), igF.node, bioF.node,
    datalist("dk-ame-types", VENUE_TYPES)]);

  // ── 3) KONUM ──
  const cityF = dkField({ label: "Şehir", required: true, input: { placeholder: "Örn. Aydın", maxlength: 40, autocomplete: "off", attrs: { list: "dk-ame-cities" } } });
  const distF = dkField({ label: "İlçe", input: { placeholder: "Örn. Kuşadası", maxlength: 60, autocomplete: "off", attrs: { list: "dk-ame-dists" } } });
  const distList = h("datalist", { id: "dk-ame-dists" });
  const addrF = dkField({ label: "Adres", input: { placeholder: "Mahalle, sokak, no", maxlength: 200, autocomplete: "off" } });
  const findBtn = dkButton("Adresten bul", { variant: "outline", size: 40, icon: "search" });
  const coordF = dkField({ label: "Koordinat", input: { placeholder: "38.0123, 27.1234  ·  ya da Google Haritalar bağlantısı", maxlength: 2000, autocomplete: "off", attrs: { spellcheck: "false" } },
    hint: "Google Haritalar'da mekana sağ tıkla → en üstteki koordinata tıkla (kopyalanır) → buraya yapıştır." });
  const latF = dkField({ label: "Enlem", input: { placeholder: "38.0123", inputmode: "decimal", maxlength: 20, autocomplete: "off", size: 44 } });
  const lngF = dkField({ label: "Boylam", input: { placeholder: "27.1234", inputmode: "decimal", maxlength: 20, autocomplete: "off", size: 44 } });
  const coordWarn = h("div", { class: "dk-ame-warn", role: "status", hidden: true });
  const mapEl = h("div", { class: "dk-ame-map", tabindex: "0", "aria-label": "Mekan konumu haritası. Tıkla ya da pini sürükle." });
  const mapMsg = h("div", { class: "dk-ame-mapmsg", hidden: true }, "Harita yüklenemedi; koordinat alanı yine çalışır.");
  const pinInfo = h("span", { class: "dk-ame-pininfo" });
  const clearPinBtn = dkButton("Pini kaldır", { variant: "ghost", size: 36, icon: "x" });
  const secLoc = section("KONUM", "Şehir, adres ve harita", [
    h("div", { class: "dk-ame-g2" }, cityF.node, distF.node),
    h("div", { class: "dk-ame-addr" }, addrF.node, findBtn),
    coordF.node,
    h("div", { class: "dk-ame-g2" }, latF.node, lngF.node),
    coordWarn,
    h("div", { class: "dk-ame-mapbox" }, mapEl, mapMsg),
    h("div", { class: "dk-ame-pinrow" }, h("span", { class: "dk-ame-pinic" }, svgRaw(PIN_SVG, { size: 16, sw: "1.8", color: AMBER })), pinInfo, clearPinBtn),
    datalist("dk-ame-cities", CITY_NAMES), distList,
  ]);

  // ── 4) MÜZİK TÜRLERİ + OLANAKLAR ──
  const genreCount = h("span", { class: "dk-ame-cnt" });
  const genreWrap = h("div", { class: "dk-ame-chips", role: "group", "aria-label": "Müzik türleri" });
  const amenWrap = h("div", { class: "dk-ame-chips", role: "group", "aria-label": "Olanaklar" });
  const secTags = section("İÇERİK", "Müzik türleri ve olanaklar", [
    h("div", { class: "dk-ame-sub" }, h("span", { class: "dk-admin-etk-lbl" }, "MÜZİK TÜRLERİ"), genreCount), genreWrap,
    h("div", { class: "dk-ame-sub" }, h("span", { class: "dk-admin-etk-lbl" }, "OLANAKLAR")), amenWrap,
  ]);

  // ── 5) FOTOĞRAFLAR ──
  const photoTile = imageTile({ label: "PROFİL FOTOĞRAFI", sub: "Kare · haritada pin olarak da görünür", aspect: 1, round: true,
    get: () => photo || (!photoRemoved && editDoc?.photoURL ? { url: editDoc.photoURL, remote: true } : null),
    set: (v) => { photo = v; if (v) photoRemoved = false; }, remove: () => { photo = null; photoRemoved = true; } });
  const coverTile = imageTile({ label: "KAPAK FOTOĞRAFI", sub: "16:9 · mekan sayfasının üst görseli", aspect: 16 / 9,
    get: () => cover || (!coverRemoved && editDoc?.coverPhotoURL ? { url: editDoc.coverPhotoURL, remote: true } : null),
    set: (v) => { cover = v; if (v) coverRemoved = false; }, remove: () => { cover = null; coverRemoved = true; } });
  const secPhotos = section("FOTOĞRAFLAR", "Profil ve kapak", [h("div", { class: "dk-ame-photos" }, photoTile.node, coverTile.node)]);

  // ── gönder ──
  const submitBtn = dkButton("Mekanı oluştur", { variant: "violet", size: 48, icon: "plus" });
  const resetBtn = dkButton("Formu temizle", { variant: "ghost", size: 48 });
  const formErr = h("div", { class: "dk-ame-ferr", role: "alert" });
  const modeBar = h("div", { class: "dk-ame-mode", hidden: true });
  const form = h("section", { class: "dk-admin-panel-card dk-ame-form", "aria-label": "Mekan formu" },
    modeBar, secAccount, secVenue, secLoc, secTags, secPhotos,
    h("div", { class: "dk-ame-actions" }, formErr, h("div", { class: "dk-ame-btns" }, resetBtn, submitBtn)));

  // ── sağ kolon: sonuç kartı + mekan listesi ──
  const resultBox = h("div", { class: "dk-ame-result", hidden: true, "aria-live": "polite" });
  const seg = dkSegmented({ items: [{ key: "admin", label: "Admin ile açılan", count: "" }, { key: "all", label: "Tüm mekanlar", count: "" }], value: _seg, size: 32, label: "Mekan listesi",
    onChange: (k) => { _seg = k; renderList(); } });
  const listQ = h("input", { type: "search", class: "dk-admin-etk-q", placeholder: "Mekan ara", "aria-label": "Mekan ara", oninput: (e) => { q = e.target.value; renderList(); } });
  const listEl = h("ul", { class: "dk-admin-etk-list dk-ame-list" });
  const listCard = h("div", { class: "dk-admin-etk-att dk-ame-listcard" },
    h("span", { class: "dk-admin-panel-deb" }, "MEKANLAR"),
    h("span", { class: "dk-admin-etk-sum" }, "Bir mekana tıkla → fotoğraf, konum ve profil bilgilerini sonradan düzenle."),
    seg, h("div", { class: "dk-admin-etk-tools" }, listQ), listEl);
  const aside = h("aside", { class: "dk-admin-panel-detail dk-ame-aside", "aria-label": "Sonuç ve mekanlar" }, resultBox, listCard);
  root.append(hero, h("div", { class: "dk-admin-panel-grid dk-ame-grid" }, form, aside));

  // ════════════════ yardımcı bileşenler ════════════════
  function section(eyebrow, title, kids) {
    return h("div", { class: "dk-ame-sec" }, h("div", { class: "dk-ame-sech" }, h("span", { class: "dk-admin-panel-deb" }, eyebrow), h("span", { class: "dk-ame-sect" }, title)), ...kids);
  }
  function imageTile({ label, sub, aspect, round, get, set, remove }) {
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    const prev = h("div", { class: `dk-ame-prev${aspect === 1 ? " is-sq" : " is-wide"}` });
    const pick = dkButton("Seç", { variant: "outline", size: 36, icon: "image" });
    const del = dkButton("Kaldır", { variant: "ghost", size: 36, icon: "trash" });
    const node = h("div", { class: "dk-ame-tile" }, h("span", { class: "dk-admin-etk-lbl" }, label), prev, h("span", { class: "dk-admin-etk-sum" }, sub), h("div", { class: "dk-ame-tbtns" }, pick, del), file);
    const draw = () => {
      const v = get();
      prev.replaceChildren(v ? h("img", { src: v.url, alt: label.toLocaleLowerCase("tr-TR") }) : h("span", { class: "dk-ame-ph" }, svgIcon("image", { size: 26, color: "#5E636D" })));
      pick.dk.setLabel(v ? "Değiştir" : "Seç");
      del.hidden = !v;
    };
    pick.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      const blob = await openImageCropper(f, { aspect, round: !!round });
      if (!blob || !alive) return;
      const old = get(); if (old && !old.remote && old.url) URL.revokeObjectURL(old.url);
      set({ blob, url: URL.createObjectURL(blob) });
      draw();
    });
    del.addEventListener("click", () => { const old = get(); if (old && !old.remote && old.url) URL.revokeObjectURL(old.url); remove(); draw(); });
    draw();
    return { node, draw };
  }

  // ════════════════ e-posta (addan üretim + doluluk denetimi) ════════════════
  function setEmailNote(kind, text, suggestion) {
    emailNote.className = `dk-ame-enote is-${kind}`;
    emailNote.replaceChildren(text ? h("span", {}, text) : "",
      suggestion ? dkButton(`${suggestion} kullan`, { variant: "outline", size: 36, cls: "dk-ame-sugg", onClick: () => { emailF.input.value = suggestion; emailTouched = true; emailF.setError(null); checkEmailSoon(0); } }) : "");
  }
  function checkEmailSoon(ms = 650) {
    clearTimeout(emailTimer);
    if (editId) return;
    const email = emailF.input.value.trim().toLowerCase();
    if (!email) { setEmailNote("idle", ""); return; }
    if (!EMAIL_RE.test(email)) { setEmailNote("err", "E-posta biçimi geçersiz."); return; }
    setEmailNote("idle", "Kontrol ediliyor…");
    emailTimer = setTimeout(async () => {
      const seq = ++emailSeq;
      try {
        const r = await createFn({ checkEmail: email });
        if (!alive || seq !== emailSeq) return;
        if (r.data.available) setEmailNote("ok", "Kullanılabilir.");
        else setEmailNote("err", "Bu e-posta zaten kayıtlı.", r.data.suggestion);
      } catch (e) { if (alive && seq === emailSeq) setEmailNote("err", errText(e)); }
    }, ms);
  }
  nameF.input.addEventListener("input", () => {
    nameF.setError(null);
    if (!editId && !emailTouched) { emailF.input.value = venueEmail(nameF.input.value); emailF.setError(null); checkEmailSoon(); }
  });
  emailF.input.addEventListener("input", () => { emailTouched = emailF.input.value.trim() !== "" && emailF.input.value.trim() !== venueEmail(nameF.input.value); emailF.setError(null); checkEmailSoon(); });
  pwInput.input.addEventListener("input", () => pwF.setError(null));

  // ════════════════ şehir / ilçe ════════════════
  function fillDistricts() {
    distList.replaceChildren(...districtsOf(cityF.input.value).map((d) => h("option", { value: d })));
  }
  cityF.input.addEventListener("input", () => { cityF.setError(null); fillDistricts(); });
  cityF.input.addEventListener("change", () => { const c = canonicalCity(cityF.input.value); if (c) cityF.input.value = c; fillDistricts(); });
  distF.input.addEventListener("change", () => { distF.input.value = canonicalDistrict(cityF.input.value, distF.input.value); });

  // ════════════════ konum: koordinat ⇄ enlem/boylam ⇄ harita ════════════════
  let Lf = null, map = null, marker = null;
  const pinIcon = () => Lf.divIcon({ className: "dk-ame-pin", iconSize: [36, 40], iconAnchor: [18, 34],
    html: `<svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,138,42,0.25)" stroke="${AMBER}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PIN_SVG}</svg>` });
  function showCoordState(c) {
    const st = checkCoords(c);
    coordF.setError(st.error || null);
    if (!st.error) coordF.setHint(c ? "" : "Google Haritalar'da mekana sağ tıkla → en üstteki koordinata tıkla (kopyalanır) → buraya yapıştır.");
    coordWarn.hidden = !st.warn; coordWarn.textContent = st.warn || "";
    return st;
  }
  function drawPin({ recenter = false } = {}) {
    pinInfo.textContent = pin ? `Pinli · ${fmtPair(pin)}` : "Konum yok — koordinat yapıştır, haritaya tıkla ya da adresten bul.";
    pinInfo.classList.toggle("is-on", !!pin);
    clearPinBtn.disabled = !pin;
    if (!map || !Lf) return;
    if (pin) {
      if (marker) marker.setLatLng([pin.lat, pin.lng]);
      else {
        marker = Lf.marker([pin.lat, pin.lng], { icon: pinIcon(), draggable: true, keyboard: false, autoPan: true }).addTo(map);
        marker.on("dragend", () => { const ll = marker.getLatLng(); setPin({ lat: ll.lat, lng: ll.lng }, { from: "map" }); });
      }
      if (recenter) map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 16));
    } else if (marker) { map.removeLayer(marker); marker = null; }
  }
  // from: "coord" (koordinat alanı yazıldı) | "ll" (enlem/boylam) | "map" | "geo" | "load"
  function setPin(c, { from } = {}) {
    pin = c ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
    if (from !== "coord") coordF.input.value = pin ? fmtPair(pin) : "";
    if (from !== "ll") { latF.input.value = pin ? fmtCoord(pin.lat) : ""; lngF.input.value = pin ? fmtCoord(pin.lng) : ""; }
    latF.setError(null); lngF.setError(null);
    showCoordState(pin);
    drawPin({ recenter: from !== "map" });
  }
  // strict=false (yazarken): geçerli değer pini hemen taşır, yarım/çözülemeyen metin hata göstermez (yazmaya devam ediliyor);
  // strict=true (yapıştır / Enter / alandan çıkış): çözülemeyen metin hata olarak gösterilir ve kaydı engeller.
  function onCoordText(strict) {
    const r = parseCoords(coordF.input.value);
    if (!r) { setPin(null, { from: "coord" }); return; }
    if (r.error) {
      if (strict) { coordF.setError(r.error); coordWarn.hidden = true; } else coordF.setError(null);
      return;
    }
    const st = checkCoords(r);
    if (st.error) { showCoordState(r); return; }   // geçersiz aralık: pin taşınmaz
    setPin(r, { from: "coord" });
  }
  coordF.input.addEventListener("input", () => onCoordText(false));
  coordF.input.addEventListener("paste", () => setTimeout(() => { onCoordText(true); if (pin && !coordF.node.classList.contains("is-invalid")) coordF.input.value = fmtPair(pin); }, 0));
  coordF.input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onCoordText(true); } });
  coordF.input.addEventListener("blur", () => {
    onCoordText(true);
    if (pin && !coordF.node.classList.contains("is-invalid")) coordF.input.value = fmtPair(pin);
  });
  function onLatLng() {
    const a = latF.input.value.trim().replace(",", "."), b = lngF.input.value.trim().replace(",", ".");
    if (!a && !b) { setPin(null, { from: "ll" }); return; }
    if (!a || !b) return;   // ikincisi yazılıyor
    const c = { lat: Number(a), lng: Number(b) };
    if (!Number.isFinite(c.lat)) { latF.setError("Sayı olmalı (ondalık nokta)."); return; }
    if (!Number.isFinite(c.lng)) { lngF.setError("Sayı olmalı (ondalık nokta)."); return; }
    const st = checkCoords(c);
    if (st.error) { (/Enlem/.test(st.error) ? latF : lngF).setError(st.error); return; }
    setPin(c, { from: "ll" });
  }
  latF.input.addEventListener("input", onLatLng);
  lngF.input.addEventListener("input", onLatLng);
  clearPinBtn.addEventListener("click", () => setPin(null, { from: "clear" }));
  findBtn.addEventListener("click", async () => {
    const parts = [addrF.input.value, distF.input.value, cityF.input.value].map(str).filter(Boolean);
    if (!parts.length) { dkToast("Önce adres, ilçe ya da şehir yaz", { type: "err" }); return; }
    findBtn.dk.setBusy(true, "Aranıyor…");
    try {
      const tries = [parts.join(", "), parts.slice(1).join(", ")].filter(Boolean);
      let hit = null;
      for (const qq of [...new Set(tries)]) {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=1&accept-language=tr&q=${encodeURIComponent(qq)}`);
        const j = r.ok ? await r.json() : [];
        if (Array.isArray(j) && j[0]) { hit = { c: { lat: Number(j[0].lat), lng: Number(j[0].lon) }, exact: qq === tries[0] }; break; }
      }
      if (!alive) return;
      if (!hit) { dkToast("Adres bulunamadı — koordinatı Google Haritalar'dan yapıştır", { type: "err" }); return; }
      setPin(hit.c, { from: "geo" });
      dkToast(hit.exact ? "Konum bulundu — pini gerekirse sürükleyerek düzelt" : "Tam adres bulunamadı; ilçe/şehir merkezine pinlendi — düzelt", { type: hit.exact ? "ok" : "info" });
    } catch (e) { console.error(e); if (alive) dkToast("Adres araması başarısız", { type: "err" }); }
    finally { findBtn.dk.setBusy(false); }
  });
  loadLeaflet().then((L) => {
    if (!alive || !L) return;
    Lf = L;
    map = L.map(mapEl, { zoomControl: false, scrollWheelZoom: false, attributionControl: true, fadeAnimation: false }).setView(pin ? [pin.lat, pin.lng] : [39, 35], pin ? 16 : 6);
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "bottomright", zoomInTitle: "Yakınlaştır", zoomOutTitle: "Uzaklaştır" }).addTo(map);
    L.tileLayer(OSM, { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    map.on("click", (e) => setPin({ lat: e.latlng.lat, lng: e.latlng.lng }, { from: "map" }));
    // uzun formda kaydırma tuzağı olmasın: tekerle yakınlaştırma yalnız harita odaktayken (tıklanınca)
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    drawPin({ recenter: !!pin });
    const t = setTimeout(() => { try { map?.invalidateSize(); } catch (_) {} }, 300);
    cleanups.push(() => clearTimeout(t));
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => { try { map?.invalidateSize(); } catch (_) {} });
      ro.observe(mapEl); cleanups.push(() => ro.disconnect());
    }
  }).catch(() => { if (alive) mapMsg.hidden = false; });

  // ════════════════ çipler ════════════════
  function drawChips() {
    const extraG = [...genres].filter((g) => !ALL_GENRES.includes(g));
    genreWrap.replaceChildren(...[...ALL_GENRES, ...extraG].map((g) => dkChip({ label: g, size: 30, pressed: genres.has(g), onClick: (_, el) => {
      if (genres.has(g)) genres.delete(g);
      else { if (genres.size >= MAX_GENRES) { dkToast(`En fazla ${MAX_GENRES} tür`, { type: "err" }); return; } genres.add(g); }
      el.dk.set(genres.has(g)); genreCount.textContent = `${genres.size}/${MAX_GENRES}`;
    } })));
    genreCount.textContent = `${genres.size}/${MAX_GENRES}`;
    const extraA = [...amenities].filter((a) => !AMENITY_OPTIONS.includes(a));
    amenWrap.replaceChildren(...[...AMENITY_OPTIONS, ...extraA].map((a) => dkChip({ label: a, size: 30, pressed: amenities.has(a), onClick: (_, el) => {
      if (amenities.has(a)) amenities.delete(a); else amenities.add(a);
      el.dk.set(amenities.has(a));
    } })));
  }

  // ════════════════ form doldur / temizle ════════════════
  function fillForm(d) {
    nameF.input.value = str(d?.displayName);
    typeF.input.value = str(d?.venueType);
    capF.input.value = d?.capacity != null && d.capacity !== "" ? String(d.capacity) : "";
    phoneF.input.value = str(d?.phone);
    const ig = str(d?.social?.instagram);
    const web = str(d?.website);
    igF.input.value = ig ? `@${ig}` : "";
    webF.input.value = ig && web === `https://instagram.com/${ig}` ? "" : web;
    bio.input.value = str(d?.description) || str(d?.bio); bio.input.dispatchEvent(new Event("input"));
    cityF.input.value = str(d?.city) || str(d?.location?.city);
    distF.input.value = str(d?.district) || str(d?.location?.district);
    addrF.input.value = str(d?.address) || str(d?.location?.address);
    fillDistricts();
    genres = new Set((Array.isArray(d?.genres) ? d.genres : []).filter((x) => typeof x === "string" && x));
    amenities = new Set((Array.isArray(d?.amenities) ? d.amenities : []).filter((x) => typeof x === "string" && x));
    drawChips();
    const lat = Number(d?.location?.lat ?? d?.location?.latitude), lng = Number(d?.location?.lng ?? d?.location?.longitude);
    setPin(d?.location && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null, { from: "load" });
    for (const f of [nameF, emailF, pwF, typeF, capF, phoneF, webF, igF, cityF, distF, addrF, latF, lngF]) f.setError(null);
    formErr.textContent = "";
  }
  function revokeLocal() { for (const v of [photo, cover]) if (v && v.url) URL.revokeObjectURL(v.url); }
  function resetCreate() {
    editId = null; editDoc = null; revokeLocal(); photo = null; cover = null; photoRemoved = false; coverRemoved = false;
    emailTouched = false; emailSeq++; clearTimeout(emailTimer);
    fillForm(null);
    emailF.input.value = ""; pwInput.input.value = ""; setEmailNote("idle", "");
    credRow.hidden = false; loginBox.hidden = true; loginPw.input.value = "";
    modeBar.hidden = true;
    submitBtn.dk.setLabel("Mekanı oluştur");
    resetBtn.dk.setLabel("Formu temizle");
    photoTile.draw(); coverTile.draw();
  }
  async function openEdit(uid) {
    if (busy) return;
    clearTimeout(emailTimer); emailSeq++;
    editId = uid; editDoc = null;
    modeBar.hidden = false;
    modeBar.replaceChildren(dkSkeleton({ w: 260, h: 14 }));
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!alive || editId !== uid) return;
      if (!snap.exists() || snap.data().userType !== "venue") { dkToast("Mekan bulunamadı", { type: "err" }); writeQuery({ duzenle: null }); resetCreate(); return; }
      editDoc = { id: uid, ...snap.data() };
    } catch (e) { console.error(e); if (alive) { dkToast("Mekan yüklenemedi", { type: "err" }); resetCreate(); } return; }
    revokeLocal(); photo = null; cover = null; photoRemoved = false; coverRemoved = false;
    fillForm(editDoc);
    credRow.hidden = true; pwInput.input.value = ""; setEmailNote("idle", "");
    fillLogin();
    modeBar.replaceChildren(svgIcon("edit", { size: 16, color: VIOLET }),
      h("span", {}, "Düzenleniyor: ", h("b", {}, str(editDoc.displayName) || "Mekan")),
      editDoc.createdByAdmin ? h("span", { class: "dk-admin-etk-tag" }, "ADMİN İLE AÇILDI") : h("span", { class: "dk-admin-etk-tag dk-ame-tagself" }, "KENDİ KAYDOLDU"),
      dkButton("Mekan panelini aç", { variant: "outline", size: 36, icon: "externalLink", onClick: () => openVenuePanel(uid, str(editDoc?.displayName)) }),
      dkButton("Yeni mekan ekle", { variant: "ghost", size: 36, icon: "plus", onClick: () => { writeQuery({ duzenle: null }); resetCreate(); } }));
    submitBtn.dk.setLabel("Değişiklikleri kaydet");
    resetBtn.dk.setLabel("Düzenlemeyi bırak");
    photoTile.draw(); coverTile.draw();
    renderList();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  resetBtn.addEventListener("click", async () => {
    if (editId) { writeQuery({ duzenle: null }); resetCreate(); renderList(); return; }
    if (nameF.input.value || pwInput.input.value || pin) { if (!(await dkConfirm({ title: "Form temizlensin mi?", body: "Yazdıkların silinecek.", confirmLabel: "Temizle" }))) return; }
    resetCreate();
  });

  // ════════════════ doğrula + gönder ════════════════
  function collect() {
    const errs = [];
    const need = (f, msg) => { f.setError(msg); errs.push(f); };
    const name = nameF.input.value.trim();
    if (name.length < 2) need(nameF, "Mekan adı en az 2 karakter olmalı.");
    const cityRaw = cityF.input.value.trim();
    const city = canonicalCity(cityRaw) || cityRaw;
    if (!city) need(cityF, "Şehir seç.");
    const capRaw = capF.input.value.trim().replace(/[.\s]/g, "");
    const cap = capRaw ? Number(capRaw) : null;
    if (capRaw && (!Number.isInteger(cap) || cap < 1 || cap > 100000)) need(capF, "1 ile 100.000 arasında bir tam sayı yaz.");
    const ig = igHandle(igF.input.value);
    if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) need(igF, "Geçerli bir Instagram kullanıcı adı yaz.");
    const phone = phoneF.input.value.trim();
    if (phone && !/^[0-9+()\-\s]{4,30}$/.test(phone)) need(phoneF, "Yalnız rakam, boşluk, + ( ) - kullan.");
    const web = webF.input.value.trim();
    if (web && /\s/.test(web)) need(webF, "Adres boşluk içeremez.");
    for (const f of [coordF, latF, lngF]) if (f.node.classList.contains("is-invalid")) errs.push(f);
    const p = {
      displayName: name, venueType: typeF.input.value.trim(), city, district: canonicalDistrict(city, distF.input.value), address: addrF.input.value.trim(),
      capacity: cap, phone, website: web, instagram: ig, bio: bio.input.value.trim(), genres: [...genres], amenities: [...amenities],
    };
    if (pin) { p.lat = pin.lat; p.lng = pin.lng; }
    if (!editId) {
      const email = emailF.input.value.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) need(emailF, "Geçerli bir e-posta gir.");
      const pw = pwInput.input.value;
      if (pw.length < 6) need(pwF, "Şifre en az 6 karakter olmalı.");
      p.email = email; p.password = pw;
    }
    return { p, errs };
  }
  submitBtn.addEventListener("click", async () => {
    if (busy) return;
    formErr.textContent = "";
    const { p, errs } = collect();
    if (errs.length) {
      formErr.textContent = "Eksik ya da hatalı alanları düzelt.";
      const first = errs[0]; first.node?.scrollIntoView({ behavior: "smooth", block: "center" }); first.input?.focus({ preventScroll: true });
      return;
    }
    busy = true; submitBtn.dk.setBusy(true, editId ? "Kaydediliyor…" : "Oluşturuluyor…");
    try {
      if (photo) p.photo = { data: await blobToB64(photo.blob), thumb: await blobToB64(await makeThumb(photo.blob)) };
      if (cover) p.cover = { data: await blobToB64(cover.blob) };
      if (editId) {
        if (!pin && editDoc?.location) p.clearLocation = true;
        if (photoRemoved && !photo) p.removePhoto = true;
        if (coverRemoved && !cover) p.removeCover = true;
        await updateFn({ uid: editId, ...p });
        if (!alive) return;
        dkToast("Mekan güncellendi");
        _cache.list = null; await loadList(true);
        await openEdit(editId);
      } else {
        const pw = p.password;
        const r = await createFn(p);
        p.password = ""; // gönderildi → kopyayı bırak
        if (!alive) return;
        result = { uid: r.data.uid, email: r.data.email, password: pw, name: p.displayName };
        renderResult();
        resetCreate();
        dkToast("Mekan hesabı açıldı");
        _cache.list = null; loadList(true);
      }
    } catch (e) {
      console.error(e?.code || e);
      if (!alive) return;
      if (e?.code === "functions/already-exists" && e.details?.suggestion) {
        emailF.input.value = e.details.suggestion; emailTouched = true;
        emailF.setError(null);
        setEmailNote("err", "Bu e-posta doluydu; boş olan öneri yazıldı. Kontrol edip tekrar Oluştur'a bas.");
        emailF.node.scrollIntoView({ behavior: "smooth", block: "center" });
        formErr.textContent = "E-posta zaten kayıtlı.";
      } else {
        formErr.textContent = errText(e);
        dkToast(errText(e), { type: "err" });
      }
    } finally { busy = false; submitBtn.dk.setBusy(false); }
  });

  // ════════════════ giriş bilgileri (düzenleme modu) ════════════════
  let loginBusy = false, linkBusy = false;
  function fillLogin() {
    const cur = str(editDoc?.email);
    loginCur.textContent = cur || "—";
    loginEmailF.input.value = cur; loginPw.input.value = "";
    loginEmailF.setError(null); loginPwF.setError(null);
    loginBox.hidden = false;
    loginLabel();
  }
  function loginLabel() {
    const cur = str(editDoc?.email).toLowerCase(), em = loginEmailF.input.value.trim().toLowerCase(), pw = loginPw.input.value;
    const ch = !!em && em !== cur;
    loginBtn.dk.setLabel(ch && pw ? "E-postayı ve şifreyi değiştir" : !ch && pw ? "Şifreyi değiştir" : "E-postayı değiştir");
    return { cur, em, pw, ch };
  }
  loginEmailF.input.addEventListener("input", () => { loginEmailF.setError(null); loginLabel(); });
  loginPw.input.addEventListener("input", () => { loginPwF.setError(null); loginLabel(); });
  loginBtn.addEventListener("click", async () => {
    if (!editId || !editDoc || loginBusy) return;
    const { cur, em, pw, ch } = loginLabel();
    if (!EMAIL_RE.test(em)) { loginEmailF.setError("Geçerli bir e-posta gir."); loginEmailF.input.focus(); return; }
    if (pw && pw.length < 6) { loginPwF.setError("Şifre en az 6 karakter olmalı."); loginPw.input.focus(); return; }
    if (!ch && !pw) { loginEmailF.setError("Yeni bir e-posta ya da yeni şifre gir."); loginEmailF.input.focus(); return; }
    const body = h("div", { class: "dk-admin-etk-cbody" },
      ch ? h("p", { class: "dk-mdl-p" }, `Giriş e-postası ${cur || "—"} → ${em} olarak değişecek. Eski adresle giriş kapanır.`) : null,
      pw ? h("p", { class: "dk-mdl-p" }, "Şifre de değişecek; mekanın açık oturumları kapanır.") : null);
    if (!(await dkConfirm({ title: "Giriş bilgileri değişsin mi?", body, confirmLabel: "Değiştir" }))) return;
    loginBusy = true; loginBtn.dk.setBusy(true, "Değiştiriliyor…");
    try {
      const r = await loginFn({ uid: editId, email: em, ...(pw ? { password: pw } : {}) });
      if (!alive) return;
      editDoc.email = r.data.email;
      result = { kind: "login", uid: editId, name: str(editDoc.displayName) || "Mekan", email: r.data.email, password: pw || null, previousEmail: r.data.previousEmail };
      renderResult();
      fillLogin();
      dkToast(r.data.emailChanged ? "Giriş e-postası değişti — eski adresle giriş kapandı" : "Şifre değişti");
      _cache.list = null; loadList(true);
      resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      console.error(e?.code || e);
      if (!alive) return;
      if (e?.code === "functions/already-exists" || /e-posta|adres/i.test(e?.message || "")) loginEmailF.setError(errText(e));
      else if (/Şifre/.test(e?.message || "")) loginPwF.setError(errText(e));
      dkToast(errText(e), { type: "err" });
    } finally { loginBusy = false; loginBtn.dk.setBusy(false); loginLabel(); }
  });
  linkBtn.addEventListener("click", async () => {
    if (!editDoc || linkBusy) return;
    const cur = str(editDoc.email).toLowerCase();
    const typed = loginEmailF.input.value.trim().toLowerCase();
    if (!EMAIL_RE.test(cur)) { dkToast("Mekanın kayıtlı bir giriş e-postası yok", { type: "err" }); return; }
    if (typed && typed !== cur) { loginEmailF.setError("Önce “E-postayı değiştir” ile yeni adresi kaydet; bağlantı kayıtlı adrese gider."); return; }
    const body = h("div", { class: "dk-admin-etk-cbody" },
      h("p", { class: "dk-mdl-p" }, `${cur} adresine GigBridge şifre belirleme e-postası gönderilecek. Sahibi bağlantıdan kendi şifresini belirler; mevcut şifre, yenisi belirlenene kadar çalışmaya devam eder.`),
      /^berkayer032\+/.test(cur) ? h("p", { class: "dk-mdl-p" }, "Not: bu adres hâlâ senin (berkayer032+…) gelen kutuna düşer — önce sahibinin e-postasını kaydet.") : null);
    if (!(await dkConfirm({ title: "Şifre belirleme bağlantısı gönderilsin mi?", body, confirmLabel: "Gönder" }))) return;
    linkBusy = true; linkBtn.dk.setBusy(true, "Gönderiliyor…");
    try {
      await sendPasswordResetMail({ email: cur });
      if (alive) dkToast(`Bağlantı gönderildi: ${cur}`);
    } catch (e) { console.error(e?.code || e); if (alive) dkToast(errText(e), { type: "err" }); }
    finally { linkBusy = false; linkBtn.dk.setBusy(false); }
  });

  // ════════════════ sonuç kartı (şifre yalnız burada, bellekte) ════════════════
  function renderResult() {
    if (!result) { resultBox.hidden = true; resultBox.replaceChildren(); return; }
    const r = result;
    const row = (k, v) => {
      const btn = dkButton("Kopyala", { variant: "outline", size: 36, cls: "dk-ame-copy", onClick: async () => { const ok = await copyText(v); btn.dk.setLabel(ok ? "Kopyalandı" : "Kopyalanamadı"); setTimeout(() => btn.dk?.setLabel("Kopyala"), 1600); } });
      btn.prepend(svgRaw(COPY_SVG, { size: 15, sw: "1.9" }));
      return h("div", { class: "dk-ame-rrow" }, h("span", { class: "dk-admin-etk-lbl" }, k), h("div", { class: "dk-ame-rval" }, h("code", { class: "dk-ame-code" }, v), btn));
    };
    const login = r.kind === "login";
    const msg = [
      login ? "GigBridge mekan hesabınızın giriş bilgileri güncellendi." : "GigBridge mekan hesabınız hazır.",
      `Mekan: ${r.name}`, "Giriş: gigbridges.com ya da GigBridge uygulaması", `E-posta: ${r.email}`,
      r.password ? `Şifre: ${r.password}` : "Şifre: mevcut şifreniz (ya da e-postanıza gelen şifre belirleme bağlantısıyla kendiniz belirleyin)",
      r.password ? "Girişten sonra şifrenizi Profil › Şifre değiştir bölümünden yenilemenizi öneririz." : "",
    ].filter(Boolean).join("\n");
    const allBtn = dkButton("Mesajı kopyala (tümü)", { variant: "violet", size: 40, full: true, onClick: async () => { const ok = await copyText(msg); dkToast(ok ? "Mesaj kopyalandı — mekana ilet" : "Kopyalanamadı", { type: ok ? "ok" : "err" }); } });
    allBtn.prepend(svgRaw(COPY_SVG, { size: 16, sw: "1.9" }));
    resultBox.hidden = false;
    resultBox.replaceChildren(
      h("div", { class: "dk-ame-rhead" }, svgIcon("checkCircle", { size: 20, color: "#7CE0B0" }), h("span", {}, login ? "Giriş bilgileri güncellendi · Mekana iletin" : "Hesap açıldı · Mekana iletin")),
      h("span", { class: "dk-ame-rname" }, r.name),
      login && r.previousEmail && r.previousEmail !== r.email ? h("span", { class: "dk-admin-etk-sum" }, `Eski giriş adresi (artık çalışmaz): ${r.previousEmail}`) : null,
      row("E-POSTA", r.email), r.password ? row("ŞİFRE", r.password) : null,
      allBtn,
      h("span", { class: "dk-admin-etk-sum" }, r.password ? "Şifre hiçbir yerde saklanmadı; yalnız bu ekranda görünür. Sayfadan çıkınca kaybolur."
        : "Şifre değişmedi. Sahibi kendi şifresini belirlesin istersen “Şifre belirleme bağlantısı gönder”i kullan."),
      h("div", { class: "dk-ame-rbtns" },
        login ? null : dkButton("Fotoğraf / konum düzenle", { variant: "outline", size: 36, icon: "edit", onClick: () => { writeQuery({ duzenle: r.uid }); openEdit(r.uid); } }),
        dkButton("Kartı kapat", { variant: "ghost", size: 36, onClick: () => { result = null; renderResult(); } })),
    );
  }

  // ════════════════ mekan listesi ════════════════
  async function loadList(force = false) {
    if (_cache.list && !force) { renderList(); return; }
    listEl.replaceChildren(...[0, 1, 2].map(() => h("li", { class: "dk-admin-etk-row" }, dkSkeleton({ w: 220, h: 14 }))));
    try {
      const snap = await getDocs(query(collection(db, "users"), where("userType", "==", "venue")));
      if (!alive) return;
      _cache.list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      _cache.at = Date.now();
    } catch (e) {
      console.error(e);
      if (alive) listEl.replaceChildren(h("li", { class: "dk-admin-etk-none" }, "Mekanlar yüklenemedi."));
      return;
    }
    renderList();
  }
  function renderList() {
    if (!_cache.list) return;
    const all = _cache.list;
    const mine = all.filter((v) => v.createdByAdmin);
    seg.dk.setCount("admin", mine.length); seg.dk.setCount("all", all.length);
    const rows = (_seg === "admin" ? mine : all)
      .filter((v) => !q || matchText(q, v.displayName, v.email, v.city, v.district))
      .sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
    if (!rows.length) { listEl.replaceChildren(h("li", { class: "dk-admin-etk-none" }, _seg === "admin" ? "Henüz admin ile açılan mekan yok." : "Mekan yok.")); return; }
    listEl.replaceChildren(...rows.map((v) => {
      const tags = [];
      if (!v.location || !Number.isFinite(Number(v.location.lat))) tags.push("KONUM YOK");
      if (!v.photoURL) tags.push("FOTO YOK");
      if (v.approved === false) tags.push("ONAY BEKLİYOR");
      return h("li", {}, h("button", { type: "button", class: `dk-admin-etk-row dk-ame-vrow${v.id === editId ? " is-sel" : ""}`, onclick: () => { writeQuery({ duzenle: v.id }); openEdit(v.id); } },
        dkAvatar({ name: str(v.displayName) || "Mekan", photo: v.photoURL || null, size: 36, type: "venue" }),
        h("span", { class: "dk-admin-etk-who" },
          h("span", { class: "dk-admin-etk-n" }, str(v.displayName) || "İsimsiz", v.createdByAdmin ? h("span", { class: "dk-admin-etk-tag dk-ame-tagadm" }, "ADMİN") : null),
          h("span", { class: "dk-admin-etk-e" }, [str(v.email), [v.district, v.city].map(str).filter(Boolean).join(" / ")].filter(Boolean).join(" · ") || "—"),
          tags.length ? h("span", { class: "dk-ame-vtags" }, ...tags.map((t) => h("span", { class: "dk-admin-etk-tag dk-ame-tagwarn" }, t))) : null),
        h("span", { class: "dk-admin-etk-time" }, fmtDate(v.createdAt))));
    }));
  }

  // ── başlat ──
  drawChips();
  resetCreate();
  loadList(false);
  const startEdit = ctx.query?.get?.("duzenle");
  if (startEdit) openEdit(startEdit);

  return {
    node: shell.node,
    update(qs) {
      const id = qs?.get?.("duzenle") || null;
      if (id && id !== editId) openEdit(id);
      else if (!id && editId) { resetCreate(); renderList(); }
    },
    onSession(ns) { return !!ns?.user && ns.user.uid === myUid && !!ns.isAdmin; },
    destroy() {
      alive = false;
      result = null;                         // şifre bellekte kalmasın
      try { pwInput.input.value = ""; loginPw.input.value = ""; } catch (_) {}
      clearTimeout(emailTimer);
      revokeLocal();
      cleanups.forEach((fn) => { try { fn(); } catch (_) {} });
      try { map?.remove(); } catch (_) {}
      shell.destroy();
    },
  };
}
