// WebMekanProfil — "Mekan profili" masaüstü görünümü (≥769 px). Registry anahtarı: venueProfil (#/venue/profil).
// Spec: specs/mekan.md § WebMekanProfil (+ §0 Venue PanelShell). Artboard: design/WebMekanProfil.dc.html.
// CSS: css/dk-mekan-profil.css (.dk-mekan-profil kökü; portal modalları .dk-mekan-profil-mdl). ≤768 → legacy renderProfile AYNEN.
//
// Legacy (js/pages/venue.js renderProfile + nameChangeModal + reportModal + renderFollowing + renderReview) özellikleri — KORUNDU:
//   profil özeti (Etkinlik / Puan / Katılım / Sanatçılı — venueStats + venueRating), profil fotoğrafı seçici (kare kırpma →
//   kaydette yükle; özet avatarı "Değiştir"), ad değişikliği talebi (reports addDoc + nameChange* bayrakları; onaylanmışsa
//   bayrağı temizle; "Geri çek"), şehir (81 il datalist) / ilçe / adres / telefon / web / kapasite (Number|null), özellikler
//   (12 çip, eksikse ilk 6 varsayılan), Leaflet konum pini (haritaya tık, Konumumu Kullan → zoom 16, Pini kaldır), Kaydet →
//   saveProfile + refreshProfile ("Kaydedilemedi."), takip edilen sanatçılar (Performans → #/venue/performans/:id, takipten
//   çıkar onayı), sanatçı değerlendirme (kabul edilmiş davetler → sanatçı başına son performans; kilitli/yapıldı/değerlendir;
//   4 kriter + yorum → submitVenueArtistReview), E-posta / Şifre değiştir (auth.js changeEmailModal/changePasswordModal akışı
//   birebir: yeniden doğrulama + verifyBeforeUpdateEmail / updatePassword, Google hesabı açıklaması, "E-posta ile sıfırla" —
//   panel modalı olarak; legacy modal ESC/odak tuzağı olmadan mobil görünümde açılıyordu), Sorun Bildir
//   (submitReport reporterType "venue"), "Mekan hesabını yalnızca GigBridge uygulamasından silebilirsin.", e-posta satırı
//   (kabuk kullanıcı kartında), çıkış (kabuk).
// Yeni (tasarım): galeri (users.gallery[] ≤5, 3:2 kırpma; kaldırma BİLEREK eklendi — tasarımda yok), özet kartı (tür/ilçe,
//   puan, takipçi (CF yok → yalnız >0 ise), kapasite), müzik türleri editörü (users.genres), çalışma saatleri
//   (users.workingHours {days:getDay[], open, close}), kirli durum notu + ayrılma onayı (panel bağlantısı + Geri/İleri; kirli form
//   app.js mod geçişini erteler), kayıt ağ adımlarında 15 sn zaman aşımı, satır içi takip/değerlendirme kartları,
//   son müşteri yorumu özeti, pinlenmemiş uyarısı.
// Yazımlar (legacy ile aynı biçim): saveProfile(uid, {city, district|null, address, phone, website, capacity:Number|null,
//   amenities[], location:{lat,lng,city}|null, photoURL?}) + YALNIZ değiştiyse {genres[], workingHours{}, gallery[]}.
//   displayName YAZILMAZ (yalnız yönetici onayıyla). avgRating/reviewCount/followerCount/approved/userType yazılmaz.
// Takma ad rotaları (#/venue/takip, #/venue/degerlendir) registry'de legacy-in-shell'e gidiyor (registry foundation'ın);
//   bu görünüm ?bolum=takip|degerlendir ile ilgili karta kaydırır (SHARED-CANDIDATE: registry'de bu rotaları
//   #/venue/profil?bolum=… 'ya yönlendir).
import { h, openImageCropper, loadLeaflet } from "../../ui.js";
import { session, refreshProfile } from "../../store.js";
import {
  venueStats, getVenueReviews, saveProfile, uploadImage, requestNameChange, cancelNameChange, clearNameChangeFlag,
  watchedArtists, unwatchArtist, venueAcceptedInvitations, myReviews, submitVenueArtistReview, submitReport, userById,
} from "../../data.js";
import {
  auth, EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword, sendPasswordResetMail, sendPasswordResetEmail,
} from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw, svgIcon } from "../shared/icons.js";
import { cx, dkAvatar, dkModal, dkToast, dkConfirm, dkLoginGate } from "../shared/ui.js";
import { PROVINCES, MONTHS_TR, fmtInt, toMs, trUpper, swapAnim, replayAnim, hashBase } from "../shared/helpers.js";

// ── sabitler (legacy venue.js ile aynı listeler) ──
const AMENITY_OPTIONS = ["Profesyonel Ses Sistemi", "Işık Sistemi", "DJ Booth", "Soyunma Odası", "Parking", "VIP Alan", "Sahne", "Bar", "Klima", "Wi-Fi", "Engelli Erişimi", "Sigara Alanı"];
const DEFAULT_AMENITIES = AMENITY_OPTIONS.slice(0, 6);
// Tasarımdaki 8 tür (sahibi açık sorusu 10); profilde bu listede olmayan türler varsa korunur ve seçili çip olarak eklenir.
const GENRE_OPTIONS = ["Electronic", "Pop", "Indie", "Jazz", "Rock", "Akustik", "Hip-Hop", "R&B"];
// Pzt→Paz sırası; değer = Date.getDay() (spec §7 workingHours.days)
const DAYS = [["Pzt", 1], ["Sal", 2], ["Çar", 3], ["Per", 4], ["Cum", 5], ["Cmt", 6], ["Paz", 0]];
const CRITERIA = [
  ["performance", "Sahne Performansı", "Sahne hakimiyeti ve performans kalitesi"],
  ["punctuality", "Dakiklik", "Zamanında geldi ve programa uydu"],
  ["communication", "İletişim", "Organizasyon sürecindeki iletişim"],
  ["crowd", "Seyirci Etkileşimi", "Kalabalığı yönetme ve seyirciyle etkileşim"],
];
const MAX_GALLERY = 5;
const SAVE_TIMEOUT = 15000; // app withTimeout(15000) ile aynı: çevrimdışıyken updateDoc/upload sunucuyu bekler → form kilitli kalmasın
const OSM ="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const NOT_PINNED_HINT = "Haritaya tıklayarak mekanının tam yerini işaretle.";
const ERR_LOAD = "Yüklenemedi. Bağlantıyı kontrol edip yenile.";

// ── artboard SVG gövdeleri (birebir) ──
const P = {
  plus: '<path d="M12 5v14M5 12h14"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  users: '<circle cx="9" cy="8.5" r="3.5"></circle><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"></path><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.3c1.8.7 3 2.3 3.5 4.7"></path>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"></rect><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"></path>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  locate: '<circle cx="12" cy="12" r="3.5"></circle><circle cx="12" cy="12" r="7.5"></circle><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"></path>',
  save: '<path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v5h7V4M8 20v-6h8v6"></path>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  chart: '<path d="M4 20V4"></path><path d="M4 20h16"></path><path d="M8.5 16v-5"></path><path d="M13 16V8"></path><path d="M17.5 16v-3"></path>',
  xCircle: '<circle cx="12" cy="12" r="8.5"></circle><path d="M9 9l6 6M15 9l-6 6"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"></rect><path d="m3.5 7 8.5 6 8.5-6"></path>',
  key: '<circle cx="8" cy="15" r="4"></circle><path d="M11 12l9-9M17 6l3 3M15 8l2 2"></path>',
  flag: '<path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path>',
  chev: '<path d="m9 6 6 6-6 6"></path>',
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>',
  // türetilmiş (tasarımda yok): avatar "Değiştir" kamerası (WebProfil ile aynı), boş galeri görseli
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.8"></circle><path d="m20.5 16-5-5-8 8"></path>',
};
const ico = (body, o = {}) => svgRaw(body, { size: 18, sw: "1.8", ...o });
const starFill = (size, color = "#FF8A2A") => svgRaw(P.star, { size, fill: true, color });
const starEmpty = (size) => svgRaw(P.star, { size, sw: "1.6", color: "#5E636D" });

// ── küçük biçimleyiciler ──
const pad2 = (n) => String(n).padStart(2, "0");
function fmtDateTR(iso) { // legacy venue.js fmtDateTR ("28 Ağustos 2026")
  if (!iso) return "";
  try {
    const d = new Date(String(iso).length <= 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  } catch { return String(iso); }
}
const fmtDay = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`; };
const fmtScore = (n) => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1);
const fmtFollowers = (n) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString().replace(".", ",").replace(/,0$/, "")} B` : fmtInt(n)); // "31 B"
const shortName = (s) => { // "Elif Yılmaz" → "Elif Y." (tasarımdaki biçim)
  const parts = String(s || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Müşteri";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${trUpper(parts[parts.length - 1][0])}.`;
};
const artistNameOf = (w) => w.artistName || w.displayName || w.name || "Sanatçı";

// Mekanın puanı (legacy venueRating): users dokümanındaki denorm değer (CF), yoksa venueReviews'tan hesap
function venueRatingFrom(p, revs) {
  let avg = Number(p?.avgRating) || 0, count = Number(p?.reviewCount) || 0;
  if ((!avg || !count) && Array.isArray(revs)) {
    const rated = revs.filter((r) => Number(r.overallRating ?? r.rating) > 0);
    if (!count) count = rated.length;
    if (!avg) avg = rated.length ? rated.reduce((a, r) => a + Number(r.overallRating ?? r.rating), 0) / rated.length : 0;
  }
  return { avg, count };
}

// ── şifre sıfırlama / hata metinleri (js/pages/auth.js'teki özel yardımcılar dışa aktarılmıyor) ──
// SHARED-CANDIDATE: auth.js requestPasswordReset / recaptchaToken / trError dışa aktarılmalı (account/profil.js de kopyalıyor).
const RECAPTCHA_SITE_KEY = "6LeW9kctAAAAAIDWQ9SCMngGL7OcHMqIl_H90db5";
let _grc = null;
function loadRecaptcha() {
  if (_grc) return _grc;
  _grc = new Promise((resolve, reject) => {
    if (window.grecaptcha && window.grecaptcha.execute) return resolve(window.grecaptcha);
    const sc = document.createElement("script");
    sc.src = "https://www.google.com/recaptcha/api.js?render=" + RECAPTCHA_SITE_KEY;
    sc.async = true; sc.defer = true; sc.onload = () => resolve(window.grecaptcha); sc.onerror = reject;
    document.head.append(sc);
  });
  return _grc;
}
async function recaptchaToken(action) {
  try { const g = await loadRecaptcha(); await new Promise((r) => g.ready(r)); return await g.execute(RECAPTCHA_SITE_KEY, { action }); } catch { return null; }
}
async function requestPasswordReset(email, rc) {
  try { await sendPasswordResetMail({ email, recaptchaToken: rc }); }
  catch (err) {
    const code = err && err.code;
    if (code === "functions/invalid-argument" || code === "invalid-argument" || code === "functions/resource-exhausted" || code === "resource-exhausted") throw err;
    await sendPasswordResetEmail(auth, email); // callable yoksa (emülatör/deploy yok) Firebase yerleşik e-postası — legacy ile aynı
  }
}
function trError(code) {
  const m = {
    "auth/email-already-in-use": "Bu e-posta zaten kayıtlı. Giriş yapmayı dene.",
    "auth/invalid-email": "Geçersiz e-posta.",
    "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/invalid-credential": "E-posta ya da şifre hatalı.",
    "auth/wrong-password": "Şifre hatalı.",
    "auth/requires-recent-login": "Güvenlik için tekrar giriş yapman gerekiyor. Çıkış yapıp yeniden giriş yap.",
    "auth/operation-not-allowed": "E-posta değiştirme için yeni adresini doğrulaman gerekiyor.",
    "auth/user-not-found": "Böyle bir hesap yok.",
    "auth/too-many-requests": "Çok fazla deneme. Biraz sonra tekrar dene.",
    "auth/network-request-failed": "İnternet bağlantı hatası.",
    "functions/resource-exhausted": "Çok fazla şifre sıfırlama isteği. Lütfen birkaç dakika sonra tekrar dene.",
    "resource-exhausted": "Çok fazla şifre sıfırlama isteği. Lütfen birkaç dakika sonra tekrar dene.",
  };
  return m[code] || "İşlem başarısız. Tekrar dene.";
}
const isGoogleOnly = (user) => !!(user && user.providerData && user.providerData.some((p) => p.providerId === "google.com"))
  && !(user?.providerData || []).some((p) => p.providerId === "password");

function withTimeout(p, ms = SAVE_TIMEOUT) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms); })])
    .finally(() => clearTimeout(t));
}
// Görseli önce yükleyip çöz, sonra çağır (yüklenirken baş harf/eski görsel yerinde kalır → boş daire yok). Hata → hiçbir şey.
function whenImageReady(url, fn) {
  const im = new Image();
  im.decoding = "async";
  im.src = url;
  (typeof im.decode === "function" ? im.decode() : new Promise((res, rej) => { im.onload = res; im.onerror = rej; })).then(fn, () => {});
}

export function venueProfilView(ctx) {
  const P0 = () => session.profile || {};
  const uid = session.user?.uid;
  let alive = true;
  const cleanups = [];
  const previews = new Set(); // URL.createObjectURL → destroy'da revoke

  const shell = panelShell({ role: "venue", active: ctx.route?.nav || "profil", title: "Profil", crumb: "Mekan profili", ctx });

  // ═════════ durum ═════════
  const init = P0();
  let dirty = false, saving = false;
  let stats = null, statsErr = false;
  let rating = { avg: Number(init.avgRating) || 0, count: Number(init.reviewCount) || 0 };
  let reviewsState = { loading: true, err: false, latest: null };
  const photoCache = new Map(); // artistId → Promise<user|null>
  const artistUser = (id) => { if (!photoCache.has(id)) photoCache.set(id, userById(id).catch(() => null)); return photoCache.get(id); };

  // form durumu
  const amenities = new Set(Array.isArray(init.amenities) ? init.amenities : DEFAULT_AMENITIES);
  const initGenres = Array.isArray(init.genres) ? init.genres.filter((g) => typeof g === "string" && g) : [];
  const genres = new Set(initGenres);
  const genreList = [...GENRE_OPTIONS, ...initGenres.filter((g) => !GENRE_OPTIONS.includes(g))];
  const wh = init.workingHours && typeof init.workingHours === "object" ? init.workingHours : {};
  const days = new Set((Array.isArray(wh.days) ? wh.days : []).map(Number).filter((d) => d >= 0 && d <= 6));
  let pin = init.location && init.location.lat != null && init.location.lng != null ? { lat: Number(init.location.lat), lng: Number(init.location.lng) } : null;
  const gal = { items: [], i: 0, key0: "" }; // items: { url?, blob?, preview?, implicit? } — implicit = galeri boşken gösterilen photoURL
  let photo = null; // { blob, preview } — kaydette yüklenir (legacy photoPicker akışı)

  const keyGenres = () => [...genres].sort().join("|");
  const keyHours = () => [...days].sort().join(",") + "|" + openIn.value + "|" + closeIn.value;
  const keyGallery = () => gal.items.map((x) => x.url || x.preview).join("|");
  let genres0 = keyGenres(), hours0 = "";
  let genresSaved = [...initGenres]; // kayıtlı sıra (kaydetten sonra yeni kayıtlı sıra)

  function initGallery(p) {
    gal.items.forEach((x) => { if (x.preview) { URL.revokeObjectURL(x.preview); previews.delete(x.preview); } });
    const list = Array.isArray(p.gallery) ? [...new Set(p.gallery.filter((u) => typeof u === "string" && u))].slice(0, MAX_GALLERY) : [];
    if (list.length) gal.items = list.map((url) => ({ url }));
    else if (p.photoURL) gal.items = [{ url: p.photoURL, implicit: true }];
    else gal.items = [];
    gal.i = Math.min(gal.i, Math.max(0, gal.items.length - 1));
    gal.key0 = keyGallery();
  }
  initGallery(init);

  // ═════════ kök ═════════
  const root = h("div", { class: "dk-mekan-profil" });
  shell.content.append(root);
  const fileGal = h("input", { type: "file", accept: "image/*", class: "dk-mekan-profil-file", tabindex: "-1", "aria-hidden": "true" });
  const filePhoto = h("input", { type: "file", accept: "image/*", class: "dk-mekan-profil-file", tabindex: "-1", "aria-hidden": "true" });
  root.append(fileGal, filePhoto);

  // SHARED-CANDIDATE: js/ui.js openImageCropper odak yönetimi yapmıyor (#modal-root'a eklenen .cr-overlay: odak içeri
  // taşınmaz, Tab tuzağı / Esc yok). Yerel sarmalayıcı: overlay eklenince dialog rolü + "Uygula"ya odak, Tab tuzağı, Esc = İptal,
  // kapanınca odak tetikleyiciye (gizlendiyse fallback()'e) döner. Kırpıcının kendisi (ve legacy mobil) değişmez.
  function cropImage(file, opts, trigger, fallback) {
    const host = document.getElementById("modal-root") || document.body;
    let ovl = null, onKey = null, finished = false;
    const setup = (o) => {
      ovl = o;
      o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true");
      const t = o.querySelector(".cr-title");
      if (t) { t.id = "dk-mekan-profil-crt"; o.setAttribute("aria-labelledby", t.id); }
      const btns = [...o.querySelectorAll(".cr-actions button")];
      const cancelB = btns[0], applyB = btns[btns.length - 1];
      applyB?.focus({ preventScroll: true });
      onKey = (e) => {
        if (!ovl?.isConnected) return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelB?.click(); return; }
        if (e.key !== "Tab") return;
        const f = [...ovl.querySelectorAll("button, input")].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === f.length - 1)) {
          e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus();
        }
      };
      document.addEventListener("keydown", onKey, true);
    };
    const mo = new MutationObserver(() => {
      if (ovl) return;
      const o = [...host.children].reverse().find((n) => n.classList?.contains("cr-overlay"));
      if (o) setup(o);
    });
    mo.observe(host, { childList: true });
    const finish = () => {
      if (finished) return; finished = true;
      mo.disconnect();
      if (onKey) document.removeEventListener("keydown", onKey, true);
    };
    cleanups.push(finish);
    return openImageCropper(file, opts).finally(() => {
      finish();
      if (!alive) return;
      requestAnimationFrame(() => {
        if (!alive) return;
        const el = trigger && trigger.isConnected && !trigger.hidden ? trigger : fallback?.();
        el?.focus({ preventScroll: true });
      });
    });
  }

  // ═════════ 1 · ÜST SATIR: galeri + özet ═════════
  const gImg = h("img", { class: "dk-mekan-profil-gimg dk-fb", alt: "", decoding: "async" });
  const gEmpty = h("span", { class: "dk-mekan-profil-gempty", "aria-hidden": "true" }, ico(P.image, { size: 34, sw: "1.4" }));
  const gCount = h("span", { class: "dk-mekan-profil-gcount" });
  const gCap = h("span", { class: "dk-mekan-profil-gcap" });
  const gThumbs = h("div", { class: "dk-mekan-profil-thumbs", role: "radiogroup", "aria-label": "Galeri fotoğrafları" });
  const gAdd = h("button", { type: "button", class: "dk-mekan-profil-gadd dk-press", "aria-label": "Fotoğraf ekle" }, ico(P.plus, { size: 18 }));
  const gDel = h("button", { type: "button", class: "dk-mekan-profil-gdel dk-press", "aria-label": "Bu fotoğrafı galeriden kaldır", title: "Galeriden kaldır" }, svgIcon("trash", { size: 15 }));
  const galSec = h("section", { class: "dk-mekan-profil-gal", "aria-label": "Mekan galerisi" },
    gImg, gEmpty, h("span", { class: "dk-mekan-profil-gshade", "aria-hidden": "true" }), gCount, gDel,
    h("div", { class: "dk-mekan-profil-gbar" }, gCap, h("div", { class: "dk-mekan-profil-gright" }, gThumbs, gAdd)));

  const capOf = (i) => {
    const it = gal.items[i];
    if (!it) return "Fotoğraf ekle";
    if (it.blob && !it.url) return "Yeni fotoğraf · kaydedilmedi";
    return i === 0 ? "Kapak fotoğrafı" : `Fotoğraf ${i + 1}`;
  };
  function drawGallery(anim) {
    const n = gal.items.length;
    if (gal.i >= n) gal.i = Math.max(0, n - 1);
    const cur = gal.items[gal.i];
    const name = P0().displayName || "Mekan";
    if (cur) {
      const src = cur.preview || cur.url;
      if (gImg.getAttribute("src") !== src) gImg.src = src;
      gImg.alt = `${name} · ${capOf(gal.i)}`;
      gImg.hidden = false; gEmpty.hidden = true;
      if (anim) swapAnim(gImg);
    } else { gImg.hidden = true; gImg.removeAttribute("src"); gEmpty.hidden = false; }
    gCount.hidden = !n;
    gCount.textContent = n ? `GALERİ · ${gal.i + 1}/${n}` : "";
    gCap.textContent = capOf(gal.i);
    gAdd.hidden = n >= MAX_GALLERY;
    gDel.hidden = !cur || !!cur.implicit;
    gThumbs.hidden = !n;
    const hadFocus = gThumbs.contains(document.activeElement);
    gThumbs.replaceChildren(...gal.items.map((it, i) => {
      const on = i === gal.i;
      const b = h("button", { type: "button", role: "radio", class: "dk-mekan-profil-thumb dk-press", "aria-checked": on ? "true" : "false",
        "aria-label": capOf(i), tabindex: on ? "0" : "-1", dataset: { i: String(i) } },
      h("img", { src: it.preview || it.url, alt: "", loading: "lazy", decoding: "async" }));
      b.addEventListener("click", () => pickGal(i, false));
      return b;
    }));
    if (hadFocus) gThumbs.querySelector(`[data-i="${gal.i}"]`)?.focus({ preventScroll: true });
  }
  function pickGal(i, focus) {
    const n = gal.items.length; if (!n) return;
    const next = (i + n) % n;
    const changed = next !== gal.i;
    gal.i = next;
    drawGallery(changed);
    if (focus) gThumbs.querySelector(`[data-i="${next}"]`)?.focus({ preventScroll: true });
  }
  gThumbs.addEventListener("keydown", (e) => {
    const k = e.key;
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(k)) return;
    e.preventDefault();
    if (k === "Home") pickGal(0, true);
    else if (k === "End") pickGal(gal.items.length - 1, true);
    else pickGal(gal.i + (k === "ArrowRight" || k === "ArrowDown" ? 1 : -1), true);
  });
  gAdd.addEventListener("click", () => { if (dkLoginGate("Fotoğraf eklemek")) return; fileGal.value = ""; fileGal.click(); });
  fileGal.addEventListener("change", async () => {
    const f = fileGal.files && fileGal.files[0];
    if (!f || gal.items.length >= MAX_GALLERY) return;
    const blob = await cropImage(f, { aspect: 3 / 2 }, gAdd, () => gThumbs.querySelector(`[data-i="${gal.i}"]`)).catch(() => null);
    if (!blob || !alive) return;
    const preview = URL.createObjectURL(blob); previews.add(preview);
    gal.items.push({ blob, preview });
    gal.i = gal.items.length - 1;
    markDirty();
    drawGallery(true);
  });
  gDel.addEventListener("click", () => {
    const cur = gal.items[gal.i]; if (!cur || cur.implicit) return;
    if (cur.preview) { URL.revokeObjectURL(cur.preview); previews.delete(cur.preview); }
    gal.items.splice(gal.i, 1);
    gal.i = Math.max(0, gal.i - 1);
    markDirty();
    drawGallery(true);
    (gal.items.length ? gThumbs.querySelector(`[data-i="${gal.i}"]`) : gAdd)?.focus();
  });

  // özet kartı
  const avBtn = h("button", { type: "button", class: "dk-mekan-profil-av", "aria-label": "Profil fotoğrafını değiştir", title: "Mekan / profil fotoğrafı (opsiyonel)" });
  const nameEl = h("h2", { class: "dk-mekan-profil-name" });
  const typeEl = h("span", { class: "dk-mekan-profil-type" });
  const metaEl = h("div", { class: "dk-mekan-profil-meta" });
  const statVals = {};
  const statCell = (key, body, label) => {
    statVals[key] = h("span", { class: "dk-mekan-profil-statv" }, "—");
    return h("span", { class: "dk-mekan-profil-stat" },
      h("span", { class: "dk-mekan-profil-static" }, ico(body, { size: 17 })),
      h("span", { class: "dk-mekan-profil-statcol" }, statVals[key], h("span", { class: "dk-mekan-profil-statl" }, label)));
  };
  const sumSec = h("section", { class: "dk-mekan-profil-sum", "aria-label": "Profil özeti" },
    h("div", { class: "dk-mekan-profil-sumhead" }, avBtn, h("div", { class: "dk-mekan-profil-sumcol" }, nameEl, typeEl)),
    metaEl,
    h("div", { class: "dk-mekan-profil-stats" },
      statCell("events", P.cal, "Etkinlik"), statCell("rating", P.star, "Puan"), statCell("att", P.users, "Katılım"), statCell("artist", P.mic, "Sanatçılı")));
  avBtn.addEventListener("click", () => { if (dkLoginGate("Fotoğraf değiştirmek")) return; filePhoto.value = ""; filePhoto.click(); });
  filePhoto.addEventListener("change", async () => {
    const f = filePhoto.files && filePhoto.files[0]; if (!f) return;
    const blob = await cropImage(f, { aspect: 1, round: true }, avBtn).catch(() => null);
    if (!blob || !alive) return;
    if (photo?.preview) { URL.revokeObjectURL(photo.preview); previews.delete(photo.preview); }
    const preview = URL.createObjectURL(blob); previews.add(preview);
    photo = { blob, preview };
    markDirty();
    drawSummary();
  });

  function drawSummary() {
    const p = P0();
    const name = p.displayName || "Mekan";
    nameEl.textContent = name;
    const place = String(p.district || p.city || "").trim();
    const type = typeof p.venueType === "string" && p.venueType.trim() ? p.venueType.trim() : "Mekan";
    typeEl.textContent = trUpper(type) + (place ? " · " + trUpper(place) : "");
    const src = photo?.preview || p.photoURL || null;
    avBtn.replaceChildren(
      dkAvatar({ name, photo: src, size: 58, type: "venue", border: true, alt: src ? `${name} profil fotoğrafı` : "" }),
      h("span", { class: "dk-mekan-profil-avov", "aria-hidden": "true" }, ico(P.camera, { size: 16 }), h("span", {}, "Değiştir")));
    // meta: ★ puan (sayı) · N takipçi · kapasite kişi
    const parts = [];
    parts.push(h("span", { class: "dk-mekan-profil-rt" }, starFill(13), rating.count ? fmtScore(rating.avg) : "—"));
    if (rating.count) parts.push(h("span", {}, `(${fmtInt(rating.count)})`));
    const tail = [];
    // Mekan takipçisi: CF yok (spec §9) → yalnız alan gerçekten doluysa (>0) göster
    const fc = Number(p.followerCount);
    if (fc > 0) tail.push(`${fmtFollowers(fc)} takipçi`);
    const cap = Number(p.capacity);
    if (cap > 0) tail.push(`${fmtInt(cap)} kişi`);
    tail.forEach((t) => parts.push(h("span", { "aria-hidden": "true" }, "·"), h("span", {}, t)));
    metaEl.replaceChildren(...parts);
    // istatistikler
    statVals.events.textContent = stats ? fmtInt(stats.eventCount) : statsErr ? "0" : "—";
    statVals.rating.textContent = rating.count ? fmtScore(rating.avg) : "—";
    statVals.att.textContent = stats ? fmtInt(stats.totalAttendance) : statsErr ? "0" : "—";
    statVals.artist.textContent = stats ? fmtInt(stats.withArtist) : statsErr ? "0" : "—";
  }

  root.append(h("div", { class: "dk-mekan-profil-top" }, galSec, sumSec));

  // ═════════ 2 · ANA SATIR: form + sağ kolon ═════════
  const secHead = (eyebrow, title, id, right) => h("div", { class: "dk-mekan-profil-sh" },
    h("div", { class: "dk-mekan-profil-shcol" }, h("span", { class: "dk-mekan-profil-eb" }, eyebrow), h("h3", { class: "dk-mekan-profil-h3" }, h("span", { id }, title))),
    right || null);
  const lbl = (text) => h("span", { class: "dk-mekan-profil-lbl" }, text);
  const fld = (text, control, cls) => h("label", { class: cx("dk-mekan-profil-fld", cls) }, lbl(text), control);
  const inp = (attrs, value) => { const el = h("input", { class: "dk-mekan-profil-in", ...attrs }); if (value != null) el.value = value; return el; };

  // ── 01 · BİLGİLER ──
  const nameBox = h("span", { class: "dk-mekan-profil-nmtext" });
  const nameBtn = h("button", { type: "button", class: "dk-mekan-profil-nmbtn dk-press" }, ico(P.pen, { size: 15 }), "Adını Değiştir");
  const ncBanner = h("div", { class: "dk-mekan-profil-nc dk-pop", role: "status", hidden: true });
  const cityIn = inp({ list: "dk-mekan-profil-il", placeholder: "Ara: İstanbul, Aydın…", autocomplete: "address-level1" }, init.city || "");
  const distIn = inp({ placeholder: "Örn. Kadıköy", autocomplete: "address-level2" }, init.district || "");
  const addrIn = h("textarea", { class: "dk-mekan-profil-in", rows: "2", placeholder: "Açık adres", autocomplete: "street-address" }); addrIn.value = init.address || "";
  const phoneIn = inp({ type: "tel", placeholder: "05xx xxx xx xx", autocomplete: "tel" }, init.phone || "");
  const webIn = inp({ type: "url", placeholder: "https://…", autocomplete: "url" }, init.website || "");
  const capIn = inp({ type: "number", min: "1", placeholder: "Örn. 300", inputmode: "numeric", class: "dk-mekan-profil-in dk-mekan-profil-mono" }, init.capacity || "");
  const infoSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-fcard dk-mekan-profil-info", "aria-labelledby": "dk-mekan-profil-h-info" },
    secHead("01 · BİLGİLER", "Mekan bilgileri", "dk-mekan-profil-h-info"),
    h("div", { class: "dk-mekan-profil-nm", role: "group", "aria-labelledby": "dk-mekan-profil-l-name" },
      h("span", { class: "dk-mekan-profil-lbl", id: "dk-mekan-profil-l-name" }, "MEKAN ADI"),
      h("div", { class: "dk-mekan-profil-nmrow" },
        h("div", { class: "dk-mekan-profil-nmbox" }, nameBox,
          h("span", { class: "dk-mekan-profil-nmlock" }, ico(P.lock, { size: 13 }), "Yönetici onaylı")),
        nameBtn)),
    ncBanner,
    h("div", { class: "dk-mekan-profil-grid2" },
      fld("ŞEHİR", cityIn),
      fld("İLÇE", distIn),
      fld("ADRES", addrIn, "is-span2"),
      fld("TELEFON", phoneIn),
      fld("WEB SİTESİ", webIn),
      fld("KAPASİTE", capIn),
      h("div", { class: "dk-mekan-profil-help2" }, h("span", { class: "dk-mekan-profil-help" }, "Kapasite, etkinlik kontenjanı boş bırakıldığında varsayılan olarak kullanılır."))),
    h("datalist", { id: "dk-mekan-profil-il" }, ...PROVINCES.map((c) => h("option", { value: c }))));
  nameBtn.addEventListener("click", () => openNameModal());

  function drawNameBlock() {
    const p = P0();
    nameBox.textContent = p.displayName || "Mekan";
    let pending = p.nameChangeStatus === "pending" && !!p.nameChangeRequested;
    // Talep onaylanıp uygulandıysa (displayName == istenen) bayrağı temizle (legacy)
    if (pending && (p.displayName || "") === p.nameChangeRequested) { pending = false; if (uid) clearNameChangeFlag(uid); }
    ncBanner.hidden = !pending;
    if (pending) {
      const cancel = h("button", { type: "button", class: "dk-mekan-profil-ncbtn dk-press" }, "Geri çek");
      cancel.addEventListener("click", async () => {
        if (dkLoginGate("Talebi geri çekmek")) return;
        cancel.disabled = true;
        try {
          await cancelNameChange(uid); await refreshProfile();
          if (alive) {
            drawNameBlock(); dkToast("Talep geri çekildi");
            // banner gizlendi → odak body'ye düşmesin: ad değiştirme düğmesine
            if (!ncBanner.hidden) cancel.focus({ preventScroll: true }); else nameBtn.focus({ preventScroll: true });
          }
        } catch (_) { cancel.disabled = false; if (alive) cancel.focus({ preventScroll: true }); dkToast("Gönderilemedi", { type: "err" }); }
      });
      ncBanner.replaceChildren(ico(P.hourglass, { size: 15, color: "#FF8A2A" }),
        h("span", { class: "dk-mekan-profil-nctext" }, `“${p.nameChangeRequested}” adına geçiş talebin yönetici onayında.`), cancel);
      replayAnim(ncBanner, "dk-pop");
    }
  }

  // ── 02 · TÜRLER ──
  const chip = (label, on, onToggle) => {
    const b = h("button", { type: "button", class: "dk-mekan-profil-chip dk-press", "aria-pressed": on ? "true" : "false" }, label);
    b.addEventListener("click", () => { const next = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", next ? "true" : "false"); onToggle(next); markDirty(); });
    return b;
  };
  const tagsSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-fcard", "aria-labelledby": "dk-mekan-profil-h-tags" },
    secHead("02 · TÜRLER", "Türler & özellikler", "dk-mekan-profil-h-tags"),
    h("div", { class: "dk-mekan-profil-chips", role: "group", "aria-label": "Müzik türleri" },
      ...genreList.map((g) => chip(g, genres.has(g), (on) => { if (on) genres.add(g); else genres.delete(g); }))),
    h("span", { class: "dk-mekan-profil-div", "aria-hidden": "true" }),
    h("span", { class: "dk-mekan-profil-help" }, "Mekanının sunduğu olanakları seç."),
    h("div", { class: "dk-mekan-profil-chips", role: "group", "aria-label": "Özellikler" },
      ...AMENITY_OPTIONS.map((a) => chip(a, amenities.has(a), (on) => { if (on) amenities.add(a); else amenities.delete(a); }))));

  // ── 03 · SAATLER ──
  const openCount = h("span", { class: "dk-mekan-profil-open" });
  const hoursNote = h("span", { class: "dk-mekan-profil-help", "aria-live": "polite" });
  const openIn = inp({ type: "time", "aria-label": "Açılış saati" }, typeof wh.open === "string" ? wh.open : "");
  const closeIn = inp({ type: "time", "aria-label": "Kapanış saati" }, typeof wh.close === "string" ? wh.close : "");
  hours0 = keyHours();
  const dayBtns = DAYS.map(([label, d]) => {
    const st = h("span", { class: "dk-mekan-profil-daystate" });
    const b = h("button", { type: "button", class: "dk-mekan-profil-day dk-press" }, label, st);
    const paint = () => { const on = days.has(d); b.setAttribute("aria-pressed", on ? "true" : "false"); st.textContent = on ? "AÇIK" : "KAPALI"; };
    paint();
    b.addEventListener("click", () => { if (days.has(d)) days.delete(d); else days.add(d); paint(); drawHours(); markDirty(); });
    return b;
  });
  function drawHours() {
    const open = DAYS.filter(([, d]) => days.has(d)).map(([l]) => l);
    openCount.textContent = `${open.length} GÜN AÇIK`;
    openCount.classList.toggle("is-zero", !open.length);
    hoursNote.textContent = open.length
      ? open.join(", ") + (openIn.value && closeIn.value ? ` · ${openIn.value} – ${closeIn.value}` : " · saat girilmedi")
      : "Tüm günler kapalı görünür.";
  }
  [openIn, closeIn].forEach((x) => x.addEventListener("input", drawHours));
  const hoursSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-fcard dk-mekan-profil-hours", "aria-labelledby": "dk-mekan-profil-h-hours" },
    secHead("03 · SAATLER", "Çalışma saatleri", "dk-mekan-profil-h-hours", openCount),
    h("div", { class: "dk-mekan-profil-hgrid" },
      h("div", { class: "dk-mekan-profil-days", role: "group", "aria-label": "Açık günler" }, ...dayBtns),
      h("div", { class: "dk-mekan-profil-times" }, fld("AÇILIŞ", openIn), fld("KAPANIŞ", closeIn))),
    hoursNote);
  drawHours();

  // ── 04 · KONUM ──
  // role'süz div'de aria-label güvenilir okunmaz (ARIA: generic adlandırılamaz); klavyeyle pinlenen harita widget'ı → application
  const mapEl = h("div", { class: "dk-mekan-profil-leaf", role: "application", "aria-roledescription": "harita" });
  const mapMsg = h("span", { class: "dk-mekan-profil-mapmsg", hidden: true }, "Harita yüklenemedi.");
  const notPinned = h("span", { class: "dk-mekan-profil-nopin" }, "Konum pinlenmedi — etkinliklerin haritada görünmez ve yeni etkinlik yayınlanamaz.");
  const mapBox = h("div", { class: "dk-mekan-profil-map" }, mapEl, mapMsg, notPinned);
  const pinInfo = h("span", { class: "dk-mekan-profil-pininfo", "aria-live": "polite" });
  const useLocBtn = h("button", { type: "button", class: "dk-mekan-profil-locbtn dk-press" }, ico(P.locate, { size: 16, color: "#4ED8FF" }), "Konumumu Kullan");
  const clearPinBtn = h("button", { type: "button", class: "dk-mekan-profil-clrpin dk-link" }, "Pini kaldır");
  const locSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-loc", "aria-labelledby": "dk-mekan-profil-h-loc" },
    h("div", { class: "dk-mekan-profil-locin" },
      mapBox,
      h("div", { class: "dk-mekan-profil-locside" },
        secHead("04 · KONUM", "Mekan konumu", "dk-mekan-profil-h-loc"),
        h("span", { class: "dk-mekan-profil-help" }, "Etkinliklerinin müşteri haritasında görünmesi için mekanının yerini pinle. Haritaya tıklayarak tam yeri işaretle."),
        pinInfo, useLocBtn, clearPinBtn)));
  let map = null, marker = null, Lf = null;
  const mapAria = () => (pin ? `Mekan konumu ${P0().district || P0().city || "haritada"} üzerinde pinli` : "Mekan konumu pinlenmedi");
  function drawPin() {
    pinInfo.textContent = pin ? `Pinli · ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : NOT_PINNED_HINT;
    pinInfo.classList.toggle("is-on", !!pin);
    notPinned.hidden = !!pin;
    clearPinBtn.disabled = !pin;
    mapEl.setAttribute("aria-label", mapAria() + ". Haritaya tıkla ya da Enter ile harita merkezini pinle.");
    if (!map || !Lf) return;
    if (pin) {
      if (marker) marker.setLatLng([pin.lat, pin.lng]);
      else marker = Lf.marker([pin.lat, pin.lng], { icon: pinIcon(), keyboard: false, interactive: false }).addTo(map);
      const el = marker.getElement?.()?.querySelector(".dk-mekan-profil-pinsvg");
      if (el) replayAnim(el, "dk-pop");
    } else if (marker) { map.removeLayer(marker); marker = null; }
  }
  const pinIcon = () => Lf.divIcon({
    className: "dk-mekan-profil-pinic", iconSize: [36, 46], iconAnchor: [18, 32],
    html: `<span class="dk-mekan-profil-pinsvg dk-pop"><svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,138,42,0.22)" stroke="#FF8A2A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P.pin}</svg></span><span class="dk-mekan-profil-pindot"><span class="dk-ping"></span></span>`,
  });
  function setPin(lat, lng, recenter) {
    pin = { lat, lng };
    if (map && recenter) map.setView([lat, lng], 16);
    drawPin();
    markDirty();
  }
  useLocBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { dkToast("Tarayıcı konumu desteklemiyor", { type: "err" }); return; }
    useLocBtn.disabled = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      useLocBtn.disabled = false;
      if (!alive) return;
      setPin(pos.coords.latitude, pos.coords.longitude, true);
      dkToast("Konum güncellendi");
    }, () => { useLocBtn.disabled = false; if (alive) dkToast("Konum alınamadı (izin?)", { type: "err" }); }, { enableHighAccuracy: true, timeout: 15000 });
  });
  clearPinBtn.addEventListener("click", () => { if (!pin) return; pin = null; drawPin(); markDirty(); });
  drawPin();
  loadLeaflet().then((L) => {
    if (!alive || !L) return;
    Lf = L;
    map = L.map(mapEl, { zoomControl: false, scrollWheelZoom: false, attributionControl: true, fadeAnimation: false }).setView(pin ? [pin.lat, pin.lng] : [39, 35], pin ? 15 : 6);
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "bottomright", zoomInTitle: "Yakınlaştır", zoomOutTitle: "Uzaklaştır" }).addTo(map);
    L.tileLayer(OSM, { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    map.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng, false));
    // klavye: harita odaktayken Enter/Space → harita merkezini pinle (fareyle tıklamanın karşılığı)
    mapEl.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === mapEl) {
        e.preventDefault();
        const c = map.getCenter();
        // merkez zaten pinin üstündeyse (≤2 px) yeniden pinleme → yuvarlama kayması + gereksiz "kaydedilmemiş" olmasın
        if (pin && map.latLngToContainerPoint([pin.lat, pin.lng]).distanceTo(map.latLngToContainerPoint(c)) <= 2) return;
        setPin(c.lat, c.lng, false);
      }
    });
    drawPin();
    const t = setTimeout(() => { try { map?.invalidateSize(); } catch (_) {} }, 300);
    cleanups.push(() => clearTimeout(t));
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => { try { map?.invalidateSize(); } catch (_) {} });
      ro.observe(mapBox);
      cleanups.push(() => ro.disconnect());
    }
  }).catch(() => { if (alive) mapMsg.hidden = false; });

  // ── Kaydet satırı ──
  const dirtyNote = h("span", { class: "dk-mekan-profil-dirty", "aria-live": "polite" });
  const saveBtn = h("button", { type: "button", class: "dk-mekan-profil-save dk-press" }, ico(P.save, { size: 16 }), h("span", {}, "Kaydet"));
  const saveRow = h("div", { class: "dk-mekan-profil-saverow" }, dirtyNote, saveBtn);
  function markDirty() {
    // Çip / gün / pin / galeri / avatar 'input' olayı üretmiyor → app.js'in kirli-form bayrağı (≤768↔≥769 mod geçişini erteleyen)
    // bunları görmüyordu. İlk kirlenmede köke kabarcıklı bir 'input' olayı yayınla (form dinleyicisi köke inmez; döngü yok).
    const first = !dirty;
    dirty = true; drawDirty();
    if (first) root.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function drawDirty(err) {
    dirtyNote.classList.toggle("is-err", !!err);
    dirtyNote.setAttribute("role", err ? "alert" : "status");
    dirtyNote.textContent = err || (dirty ? "Kaydedilmemiş değişiklikler var" : "");
  }
  saveBtn.addEventListener("click", () => save());

  const form = h("form", { class: "dk-mekan-profil-form", "aria-label": "Mekan profili", novalidate: true },
    infoSec, h("div", { class: "dk-mekan-profil-stack" }, tagsSec, hoursSec), locSec, saveRow);
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("input", (e) => { if (e.target.matches?.(".dk-mekan-profil-in")) markDirty(); });

  async function save() {
    if (saving) return;
    if (dkLoginGate("Profili kaydetmek")) return;
    saving = true;
    // kayıt sürerken düzenleme yok (yüklenen/yazılan durum = ekrandaki durum); odak kaydet düğmesine geri döner
    const lockEls = [galSec, sumSec, infoSec, tagsSec, hoursSec, locSec];
    lockEls.forEach((el) => { el.inert = true; });
    root.setAttribute("aria-busy", "true");
    saveBtn.disabled = true; saveBtn.classList.add("is-busy"); saveBtn.lastChild.textContent = "Kaydediliyor…";
    drawDirty();
    const city = cityIn.value.trim();
    const patch = {
      city, district: distIn.value.trim() || null, address: addrIn.value.trim(),
      phone: phoneIn.value.trim(), website: webIn.value.trim(),
      capacity: capIn.value.trim() ? Number(capIn.value.trim()) : null,
      amenities: [...amenities],
      location: pin ? { lat: pin.lat, lng: pin.lng, city: city || null } : null,
    };
    // mevcut sıra korunur (genres[0] herkese açık sayfada / app VenueDetail'de öne çıkıyor), yeni seçimler sona eklenir
    if (keyGenres() !== genres0) patch.genres = [...genresSaved.filter((g) => genres.has(g)), ...genreList.filter((g) => genres.has(g) && !genresSaved.includes(g))];
    if (keyHours() !== hours0) {
      patch.workingHours = { days: DAYS.map(([, d]) => d).filter((d) => days.has(d)), open: openIn.value || "", close: closeIn.value || "" };
    }
    let uploadFailed = false;
    try {
      // her ağ adımı SAVE_TIMEOUT ile yarışır: çevrimdışıyken updateDoc/upload sunucuyu sonsuza dek bekliyordu (form kilitli,
      // "Kaydedilemedi." hiç görünmüyordu). Zaman aşımı → kayıt başarısız, form kirli kalır (sırada bekleyen yazım sonra inebilir).
      // Yüklenen URL'ler öğede saklanır → yeniden denemede aynı dosya tekrar yüklenmez.
      if (photo?.blob) { if (!photo.url) photo.url = await withTimeout(uploadImage(photo.blob, uid)); patch.photoURL = photo.url; }
      if (keyGallery() !== gal.key0) {
        // yeni fotoğraflar sırayla yüklenir; yüklenemeyen kayda girmez (spec §9) — zaman aşımı ise tüm kayıt durur (fotoğraf kaybolmasın)
        for (const it of [...gal.items]) {
          if (!it.blob || it.url) continue;
          try { it.url = await withTimeout(uploadImage(it.blob, uid)); }
          catch (err) {
            if (err?.code === "timeout") throw err;
            uploadFailed = true; gal.items.splice(gal.items.indexOf(it), 1); if (it.preview) { URL.revokeObjectURL(it.preview); previews.delete(it.preview); }
          }
        }
        patch.gallery = gal.items.map((x) => x.url).filter(Boolean).slice(0, MAX_GALLERY);
      }
      await withTimeout(saveProfile(uid, patch));
      const refreshed = await withTimeout(refreshProfile()).then(() => true, () => false);
      if (!alive) return;
      // kaydedilen durum = yeni başlangıç
      if (photo?.preview) { URL.revokeObjectURL(photo.preview); previews.delete(photo.preview); }
      photo = null;
      gal.items.forEach((x) => { if (x.preview) { URL.revokeObjectURL(x.preview); previews.delete(x.preview); } delete x.preview; delete x.blob; });
      if (patch.gallery) gal.items.forEach((x) => { delete x.implicit; });
      // refreshProfile'ın yayını saving=true iken geldi (onSession galeriyi atladı) → kayıtlı profilden yeniden kur
      // (galeri boşsa gösterilen örtük kapak = YENİ photoURL); yenileme olmadıysa çalışma kopyası = kayıtlı durum
      if (refreshed) initGallery(P0()); else gal.key0 = keyGallery();
      if (patch.genres) genresSaved = [...patch.genres];
      genres0 = keyGenres(); hours0 = keyHours();
      dirty = false;
      drawDirty(); drawGallery(false); drawSummary(); drawPin(); patchShellIdentity();
      dkToast(uploadFailed ? "Gönderilemedi" : "Profil kaydedildi", uploadFailed ? { type: "err" } : undefined);
    } catch (_) {
      if (alive) { drawDirty("Kaydedilemedi."); drawGallery(false); }
    } finally {
      saving = false;
      lockEls.forEach((el) => { el.inert = false; });
      root.removeAttribute("aria-busy");
      if (alive) {
        saveBtn.disabled = false; saveBtn.classList.remove("is-busy"); saveBtn.lastChild.textContent = "Kaydet";
        if (document.activeElement === document.body) saveBtn.focus({ preventScroll: true });
      }
    }
  }

  // ═════════ sağ kolon ═════════
  // Takip ettiğim sanatçılar
  const folCount = h("span", {});
  const folList = h("div", { class: "dk-mekan-profil-rows" });
  const folSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-scard", id: "dk-mekan-profil-takip", "aria-labelledby": "dk-mekan-profil-h-follow" },
    secHead("SANATÇILAR", "Takip ettiğim sanatçılar", "dk-mekan-profil-h-follow",
      h("a", { href: "#/venue/sanatci", class: "dk-mekan-profil-add" }, "Ekle", svgRaw(P.plus, { size: 14, sw: "2.2" }))),
    h("span", { class: "dk-mekan-profil-sub" }, ico(P.eye, { size: 14, color: "#4ED8FF" }), h("span", {}, "Yalnız siz görürsünüz · ", folCount, " sanatçı")),
    folList);
  let follows = null;
  const skelRows = (n) => Array.from({ length: n }, () => h("div", { class: "dk-mekan-profil-skel", "aria-hidden": "true" }));
  folList.replaceChildren(...skelRows(2));
  folCount.textContent = "…";
  const emptyBox = (text) => h("div", { class: "dk-mekan-profil-empty" }, text);
  const avatarFor = (id, name, genre, size) => {
    const o = { name, size, genre: genre || "Diğer", ink: "#F2F1EE", fontSize: size >= 48 ? 18 : 15 };
    const wrap = h("span", { class: "dk-mekan-profil-avwrap", style: { width: size + "px", height: size + "px" } }, dkAvatar(o));
    // fotoğraf önce yüklenip çözülür, sonra baş harfin yerine geçer (lazy <img> ekranın altında boş daire bırakıyordu)
    if (id) artistUser(id).then((u) => {
      const url = u?.photoURL;
      if (!url || !alive) return;
      whenImageReady(url, () => {
        if (!alive) return;
        const img = dkAvatar({ ...o, photo: url });
        img.loading = "eager";
        wrap.replaceChildren(img);
      });
    });
    return wrap;
  };
  function drawFollows() {
    if (follows == null) return;
    folCount.textContent = String(follows.length);
    if (!follows.length) { folList.replaceChildren(emptyBox("Henüz sanatçı takip etmiyorsunuz. Sanatçı Bul'da kartındaki göz simgesine dokunarak takip edebilirsiniz.")); return; }
    folList.replaceChildren(...follows.map((w) => {
      const id = w.artistId || w.id;
      const name = artistNameOf(w);
      const rm = h("button", { type: "button", class: "dk-mekan-profil-rm dk-press", "aria-label": `Takipten çıkar: ${name}` }, ico(P.xCircle, { size: 18 }));
      rm.addEventListener("click", () => openUnfollow(w));
      return h("div", { class: "dk-mekan-profil-frow" },
        avatarFor(id, name, w.genre, 38),
        h("span", { class: "dk-mekan-profil-fcol" }, h("span", { class: "dk-mekan-profil-fname" }, name), w.genre ? h("span", { class: "dk-mekan-profil-fgenre" }, w.genre) : null),
        h("a", { href: `#/venue/performans/${encodeURIComponent(id)}`, class: "dk-mekan-profil-perf dk-press", "aria-label": `Performans: ${name}` }, ico(P.chart, { size: 13 }), "Performans"),
        rm);
    }));
  }

  // Yorum özeti
  const revBody = h("div", { class: "dk-mekan-profil-revbody" });
  const revSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-scard is-rev", "aria-labelledby": "dk-mekan-profil-h-rev" },
    secHead("YORUMLAR", "Yorum özeti", "dk-mekan-profil-h-rev", h("a", { href: "#/venue/analitik", class: "dk-mekan-profil-alink dk-link" }, "Analitik →")),
    revBody,
    h("span", { class: "dk-mekan-profil-note" }, "Yalnız müşteri yorumları görünür; sanatçı ↔ mekan karşılıklı puanları gizli kalır."));
  const starsRow = (n, size, gap) => {
    const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return h("span", { class: "dk-mekan-profil-stars", role: "img", "aria-label": `${k} / 5 yıldız`, style: { gap: gap + "px" } },
      ...[1, 2, 3, 4, 5].map((i) => (i <= k ? starFill(size) : starEmpty(size))));
  };
  function drawReviews() {
    if (reviewsState.loading) { revBody.replaceChildren(...skelRows(1)); return; }
    const score = h("div", { class: "dk-mekan-profil-score" },
      h("span", { class: "dk-mekan-profil-big" }, rating.count ? fmtScore(rating.avg) : "—"),
      h("span", { class: "dk-mekan-profil-scol" }, starsRow(rating.count ? rating.avg : 0, 13, 2),
        h("span", { class: "dk-mekan-profil-scount" }, rating.count ? `${fmtInt(rating.count)} değerlendirme` : "Henüz değerlendirme yok")));
    const r = reviewsState.latest;
    let box;
    if (reviewsState.err) box = emptyBox(ERR_LOAD);
    else if (!r) box = emptyBox("Henüz müşteri yorumu yok.");
    else {
      const ms = toMs(r.createdAt);
      const meta = [r.event || r.eventTitle, ms ? fmtDay(ms) : ""].filter(Boolean).join(" · ");
      box = h("div", { class: "dk-mekan-profil-rbox" },
        h("div", { class: "dk-mekan-profil-rhead" }, h("span", { class: "dk-mekan-profil-rname" }, shortName(r.authorName)), starsRow(r.overallRating ?? r.rating, 10, 1)),
        h("p", { class: "dk-mekan-profil-rtext" }, String(r.comment || "").trim()),
        meta ? h("span", { class: "dk-mekan-profil-rmeta" }, meta) : null);
    }
    revBody.replaceChildren(score, box);
  }
  drawReviews();

  // Sanatçı değerlendir
  const rateList = h("div", { class: "dk-mekan-profil-rows" }, ...skelRows(2));
  const rateSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-scard", id: "dk-mekan-profil-degerlendir", "aria-labelledby": "dk-mekan-profil-h-rate" },
    secHead("DEĞERLENDİR", "Sanatçı değerlendir", "dk-mekan-profil-h-rate"),
    h("span", { class: "dk-mekan-profil-sub" }, "Etkinliğinizde sahne alan sanatçıları değerlendirin."),
    rateList);
  let rateItems = null;
  function drawRate() {
    if (rateItems == null) return;
    if (!rateItems.length) { rateList.replaceChildren(emptyBox("Değerlendirilecek sanatçı yok. Kabul edilmiş bir etkinlik sonrası burada görünür.")); return; }
    rateList.replaceChildren(...rateItems.map((a) => {
      let pill;
      if (a.myReview != null) {
        pill = h("span", { class: "dk-mekan-profil-pill is-done", tabindex: "-1" }, starFill(11, "#7CE0B0"), `${a.myReview} · Değerlendirdim`);
      } else if (!a.ratable) {
        pill = h("button", { type: "button", class: "dk-mekan-profil-pill is-lock", title: "Etkinlik tamamlandıktan sonra değerlendirebilirsin" }, ico(P.lock, { size: 12 }), "Etkinlik sonrası");
        pill.addEventListener("click", () => dkToast("Etkinlik tamamlandıktan sonra değerlendirebilirsin", { type: "err" }));
      } else {
        pill = h("button", { type: "button", class: "dk-mekan-profil-pill is-go dk-press", "aria-label": `Değerlendir: ${a.artistName}` }, "Değerlendir", svgRaw(P.arrow, { size: 12, sw: "2.4" }));
        pill.addEventListener("click", () => openRate(a));
      }
      return h("div", { class: "dk-mekan-profil-rrow", dataset: { aid: String(a.artistId) } },
        avatarFor(a.artistId, a.artistName, a.genre, 38),
        h("span", { class: "dk-mekan-profil-fcol" }, h("span", { class: "dk-mekan-profil-rrname" }, a.artistName),
          h("span", { class: "dk-mekan-profil-rrlast" }, a.lastLabel ? "Son performans: " + a.lastLabel : a.genre || "")),
        pill);
    }));
  }

  // Hesap & destek
  const menuRow = (body, label, onClick) => {
    const b = h("button", { type: "button", class: "dk-mekan-profil-mrow dk-row" }, ico(body, { size: 17, color: "#FF8A2A" }), h("span", { class: "dk-mekan-profil-mlabel" }, label),
      h("span", { class: "dk-mekan-profil-mchev" }, ico(P.chev, { size: 15 })));
    b.addEventListener("click", onClick);
    return b;
  };
  const accSec = h("section", { class: "dk-mekan-profil-card dk-mekan-profil-acc", "aria-labelledby": "dk-mekan-profil-h-acc" },
    h("h3", { id: "dk-mekan-profil-h-acc", class: "dk-mekan-profil-acch" }, "HESAP & DESTEK"),
    menuRow(P.mail, "E-posta Değiştir", () => openEmail()),
    menuRow(P.key, "Şifre Değiştir", () => openPass()),
    menuRow(P.flag, "Sorun Bildir", () => openReport()),
    h("p", { class: "dk-mekan-profil-accnote" }, "Mekan hesabını yalnızca GigBridge uygulamasından silebilirsin."));

  root.append(h("div", { class: "dk-mekan-profil-main" }, form, h("div", { class: "dk-mekan-profil-side" }, folSec, revSec, rateSec, accSec)));

  // ═════════ modallar (portal; mekan §0.7 panel varyantı) ═════════
  const alertEl = () => h("div", { class: "dk-mekan-profil-alert", role: "alert", hidden: true });
  const setAlert = (el, msg) => { el.hidden = !msg; el.replaceChildren(...(msg ? [ico(P.info, { size: 15 }), h("span", {}, msg)] : [])); };
  const mInp = (attrs) => h("input", { class: "dk-mekan-profil-in", ...attrs });
  const mTa = (attrs) => h("textarea", { class: "dk-mekan-profil-in", ...attrs });
  const enterSubmits = (m, ...els) => els.forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[m.buttons.length - 1]?.click(); } }));

  function openNameModal() {
    if (dkLoginGate("Ad değişikliği istemek")) return;
    const cur = P0().displayName || "Mekan";
    const nn = mInp({ placeholder: "Yeni mekan adı", maxlength: "80" });
    const rs = mTa({ rows: "3", placeholder: "Örn. Marka değişikliği, yazım düzeltmesi…", maxlength: "500" });
    const al = alertEl();
    [nn, rs].forEach((x) => x.addEventListener("input", () => setAlert(al, "")));
    const m = dkModal({
      title: "Mekan Adını Değiştir", variant: "panel", size: 480, cls: "dk-mekan-profil-mdl",
      body: [
        h("p", { class: "dk-mekan-profil-mp" }, "Mekan adı değişikliği yönetici onayına gönderilir. Nedeni belirtmek zorunludur."),
        h("div", { class: "dk-mekan-profil-cur" }, "Mevcut ad: ", h("span", {}, cur)),
        fld("YENİ AD", nn), fld("DEĞİŞİKLİK NEDENİ (ZORUNLU)", rs), al,
      ],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Talebi Gönder", variant: "role", icon: svgRaw(P.send, { size: 15, sw: "2" }), busyLabel: "Gönderiliyor…", onClick: async () => {
          const n = nn.value.trim(), r = rs.value.trim();
          if (!n) { setAlert(al, "Yeni ad gir"); nn.focus(); return false; }
          if (n === cur) { setAlert(al, "Ad zaten aynı"); nn.focus(); return false; }
          if (r.length < 5) { setAlert(al, "Nedeni belirt (en az 5 karakter)"); rs.focus(); return false; }
          try {
            await requestNameChange(uid, { currentName: cur, requestedName: n, reason: r, reporterName: cur });
            await refreshProfile();
            if (alive) drawNameBlock();
            dkToast("Talebin yöneticiye gönderildi");
            return true;
          } catch (_) { setAlert(al, "Gönderilemedi"); return false; }
        } },
      ],
    });
    enterSubmits(m, nn);
  }

  function openUnfollow(w) {
    if (dkLoginGate("Takipten çıkarmak")) return;
    const id = w.artistId || w.id;
    const name = artistNameOf(w);
    dkModal({
      title: "Takipten çıkarılsın mı?", variant: "panel", size: 420, cls: "dk-mekan-profil-mdl dk-mekan-profil-mdl-nox",
      body: h("p", { class: "dk-mdl-p" }, `${name} takip listenizden kaldırılacak.`),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Takipten Çıkar", variant: "danger", busyLabel: "Takipten Çıkar", onClick: async () => {
          try {
            await unwatchArtist(uid, id);
            if (!alive) return true;
            follows = (follows || []).filter((x) => (x.artistId || x.id) !== id);
            drawFollows();
            dkToast("Takipten çıkarıldı");
            requestAnimationFrame(() => (folSec.querySelector(".dk-mekan-profil-rm") || folSec.querySelector(".dk-mekan-profil-add"))?.focus({ preventScroll: true }));
            return true;
          } catch (_) { dkToast("Takipten çıkarılamadı. Lütfen tekrar deneyin.", { type: "err" }); return false; }
        } },
      ],
    });
  }

  function openRate(a) {
    if (dkLoginGate("Değerlendirmek")) return;
    const vals = {};
    const overall = h("span", { class: "dk-mekan-profil-ovv" }, "—");
    const al = alertEl();
    const comment = mTa({ rows: "3", placeholder: "Deneyiminizi paylaşın...", maxlength: "1000" });
    const calc = () => {
      const v = CRITERIA.map(([k]) => vals[k]).filter(Boolean);
      overall.textContent = v.length === CRITERIA.length ? fmtScore(v.reduce((s, x) => s + x, 0) / CRITERIA.length) : "—";
    };
    let firstStar = null;
    const critRow = ([k, label, desc]) => {
      const valEl = h("span", { class: "dk-mekan-profil-cval" });
      const group = h("span", { class: "dk-mekan-profil-starin", role: "radiogroup", "aria-label": label });
      const btns = [1, 2, 3, 4, 5].map((i) => {
        const b = h("button", { type: "button", role: "radio", class: "dk-mekan-profil-sbtn dk-press", "aria-label": `${label}: ${i} yıldız`, dataset: { v: String(i) } });
        b.addEventListener("click", () => set(i, false));
        return b;
      });
      const paint = () => {
        const v = vals[k] || 0;
        btns.forEach((b, j) => {
          const i = j + 1;
          b.setAttribute("aria-checked", v === i ? "true" : "false");
          b.tabIndex = (v ? v === i : i === 1) ? 0 : -1;
          b.style.color = i <= v ? "#FF8A2A" : "#5E636D";
          b.replaceChildren(svgRaw(P.star, { size: 22, sw: "1.6", color: "currentColor", attrs: { fill: i <= v ? "#FF8A2A" : "none" } }));
        });
        valEl.textContent = v ? `${v}/5` : "";
      };
      const set = (i, focus) => { vals[k] = Math.max(1, Math.min(5, i)); paint(); calc(); setAlert(al, ""); if (focus) btns[vals[k] - 1].focus(); };
      group.addEventListener("keydown", (e) => {
        const v = vals[k] || 0;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(v + 1, true); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(Math.max(1, v - 1), true); }
        else if (e.key === "Home") { e.preventDefault(); set(1, true); }
        else if (e.key === "End") { e.preventDefault(); set(5, true); }
      });
      group.append(...btns);
      paint();
      if (!firstStar) firstStar = btns[0];
      return h("div", { class: "dk-mekan-profil-crit" },
        h("span", { class: "dk-mekan-profil-ccol" }, h("span", { class: "dk-mekan-profil-clabel" }, label), h("span", { class: "dk-mekan-profil-cdesc" }, desc)),
        h("span", { class: "dk-mekan-profil-cright" }, group, valEl));
    };
    const crits = CRITERIA.map(critRow);
    dkModal({
      title: "Sanatçı Değerlendir", variant: "panel", size: 560, top: 110, cls: "dk-mekan-profil-mdl", initialFocus: firstStar,
      body: [
        h("div", { class: "dk-mekan-profil-rmhead" },
          avatarFor(a.artistId, a.artistName, a.genre, 48),
          h("span", { class: "dk-mekan-profil-rmcol" }, h("span", { class: "dk-mekan-profil-rmname" }, a.artistName),
            h("span", { class: "dk-mekan-profil-rmsub" }, [a.genre, a.lastLabel].filter(Boolean).join(" • "))),
          h("span", { class: "dk-mekan-profil-ov" }, "Genel Puan", starFill(15), overall)),
        h("div", { class: "dk-mekan-profil-crits" }, ...crits),
        fld("YORUM (İSTEĞE BAĞLI)", comment),
        al,
      ],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Değerlendirmeyi Gönder", variant: "role", busyLabel: "Gönderiliyor...", onClick: async () => {
          const v = CRITERIA.map(([k]) => vals[k]);
          if (v.some((x) => !x)) { setAlert(al, "Tüm kriterleri puanla"); return false; }
          const avg = Math.round(v.reduce((s, x) => s + x, 0) / CRITERIA.length * 10) / 10;
          const ratings = {}; CRITERIA.forEach(([k]) => { ratings[k] = vals[k]; });
          try {
            await submitVenueArtistReview(uid, P0().displayName || "", { id: a.artistId, artistName: a.artistName }, { rating: avg, ratings, comment: comment.value.trim() });
            a.myReview = avg;
            if (alive) {
              drawRate();
              // tetikleyici "Değerlendir" hapı yeniden çizimle gitti → modal kapanınca odak body'ye düşmesin: yeni "Değerlendirdim" hapına
              requestAnimationFrame(() => {
                if (!alive) return;
                const row = [...rateList.querySelectorAll(".dk-mekan-profil-rrow")].find((r) => r.dataset.aid === String(a.artistId));
                row?.querySelector(".dk-mekan-profil-pill")?.focus({ preventScroll: true });
              });
            }
            dkToast("Değerlendirmen kaydedildi, teşekkürler");
            return true;
          } catch (_) { setAlert(al, "Gönderilemedi"); return false; }
        } },
      ],
    });
  }

  function openReport() {
    if (dkLoginGate("Sorun bildirmek")) return;
    const sub = mInp({ placeholder: "Kısa başlık", maxlength: "120" });
    const msg = mTa({ rows: "4", placeholder: "Sorununu ya da talebini yaz…", maxlength: "2000" });
    const al = alertEl();
    msg.addEventListener("input", () => setAlert(al, ""));
    const m = dkModal({
      title: "Sorun Bildir", variant: "panel", size: 480, cls: "dk-mekan-profil-mdl",
      body: [
        h("p", { class: "dk-mekan-profil-mp" }, "Bir sorunun ya da talebin mi var? Yöneticiye ilet."),
        fld("KONU", sub), fld("MESAJ", msg), al,
      ],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Gönder", variant: "role", icon: svgRaw(P.send, { size: 15, sw: "2" }), busyLabel: "Gönderiliyor…", onClick: async () => {
          const text = msg.value.trim();
          if (!text) { setAlert(al, "Mesaj yaz"); msg.focus(); return false; }
          try {
            await submitReport(uid, { subject: sub.value.trim(), message: text, reporterName: P0().displayName || "", reporterType: "venue" });
            dkToast("Bildirimin alındı, teşekkürler");
            return true;
          } catch (_) { setAlert(al, "Gönderilemedi"); return false; }
        } },
      ],
    });
    enterSubmits(m, sub);
  }

  // ── E-posta / Şifre (legacy auth.js changeEmailModal / changePasswordModal akışı, panel modalı) ──
  function okLine() { return h("div", { class: "dk-mekan-profil-alert is-ok", role: "status", hidden: true }); }
  const setOk = (el, msg) => { el.hidden = !msg; el.replaceChildren(...(msg ? [svgRaw('<path d="m5 12.5 4.5 4.5L19 7.5"></path>', { size: 15, sw: "2.2" }), h("span", {}, msg)] : [])); };
  function googleOnlyInfo(title, text) {
    dkModal({ title, variant: "panel", size: 480, cls: "dk-mekan-profil-mdl", body: h("p", { class: "dk-mdl-p" }, text), actions: [{ label: "Kapat", variant: "outline" }] });
  }
  function openEmail() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) { googleOnlyInfo("E-posta Değiştir", "Google ile giriş yaptığın için e-posta adresin Google hesabına bağlıdır ve buradan değiştirilemez. E-postanı Google hesap ayarlarından güncelleyebilirsin."); return; }
    const cur = mInp({ type: "password", placeholder: "Şifreni gir", autocomplete: "current-password" });
    const nw = mInp({ type: "email", placeholder: "yeni@email.com", autocomplete: "email" });
    const al = alertEl(), ok = okLine();
    const m = dkModal({
      title: "E-posta Değiştir", variant: "panel", size: 480, cls: "dk-mekan-profil-mdl",
      body: [h("p", { class: "dk-mekan-profil-mp" }, "Güvenlik için mevcut şifreni iste. Yeni adresine bir doğrulama bağlantısı göndereceğiz."),
        fld("MEVCUT ŞİFRE", cur), fld("YENİ E-POSTA", nw), al, ok],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Bağlantı Gönder", variant: "role", icon: svgRaw(P.send, { size: 15, sw: "2" }), busyLabel: "Gönderiliyor…", onClick: async (_c, b) => {
          setAlert(al, ""); setOk(ok, "");
          const pw = cur.value, em = nw.value.trim();
          if (!pw) { setAlert(al, "Mevcut şifreni gir."); cur.focus(); return false; }
          if (!em) { setAlert(al, "Yeni e-posta gir."); nw.focus(); return false; }
          if (em.toLowerCase() === (user?.email || "").toLowerCase()) { setAlert(al, "Yeni e-posta mevcut adresinle aynı."); nw.focus(); return false; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
            await verifyBeforeUpdateEmail(user, em);
            setOk(ok, "Doğrulama bağlantısı yeni e-postana gönderildi. Bağlantıya tıklayıp onayladıktan sonra yeni e-postanla giriş yapabilirsin.");
            setTimeout(() => { if (b.isConnected) { b.disabled = true; b.querySelector(".dk-btn-l").textContent = "Gönderildi ✓"; } }, 0);
            return false;
          } catch (err) { setAlert(al, trError(err && err.code)); return false; }
        } },
      ],
    });
    enterSubmits(m, cur, nw);
  }
  function openPass() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) { googleOnlyInfo("Şifre Değiştir", "Google ile giriş yaptığın için hesabında parola yok; şifren Google hesabına bağlıdır ve buradan değiştirilemez. Şifreni Google hesap ayarlarından güncelleyebilirsin."); return; }
    const cur = mInp({ type: "password", placeholder: "Şu anki şifren", autocomplete: "current-password" });
    const nw = mInp({ type: "password", placeholder: "En az 6 karakter", autocomplete: "new-password" });
    const nw2 = mInp({ type: "password", placeholder: "Yeni şifreni tekrar gir", autocomplete: "new-password" });
    const al = alertEl(), ok = okLine();
    const reset = h("button", { type: "button", class: "dk-mekan-profil-reset" }, "E-posta ile sıfırla");
    reset.addEventListener("click", async () => {
      reset.disabled = true; const old = reset.textContent; reset.textContent = "Gönderiliyor…";
      setAlert(al, ""); setOk(ok, "");
      try {
        const rc = await recaptchaToken("password_reset");
        await requestPasswordReset(user.email, rc);
        setOk(ok, "Sıfırlama bağlantısı e-postana gönderildi. E-postandaki bağlantıdan yeni şifre belirle.");
      } catch (err) { setAlert(al, trError(err && err.code)); }
      finally { reset.disabled = false; reset.textContent = old; }
    });
    const m = dkModal({
      title: "Şifre Değiştir", variant: "panel", size: 480, cls: "dk-mekan-profil-mdl",
      body: [h("p", { class: "dk-mekan-profil-mp" }, "Güvenlik için önce mevcut şifreni gir, sonra yeni şifreni belirle."),
        fld("MEVCUT ŞİFRE", cur), fld("YENİ ŞİFRE", nw), fld("YENİ ŞİFRE (TEKRAR)", nw2), al, ok,
        h("p", { class: "dk-mekan-profil-mp" }, "Mevcut şifreni bilmiyor musun? ", reset)],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Şifreyi Güncelle", variant: "role", busyLabel: "Güncelleniyor…", onClick: async (_c, b) => {
          setAlert(al, ""); setOk(ok, "");
          if (!cur.value) { setAlert(al, "Mevcut şifreni gir."); cur.focus(); return false; }
          if (nw.value.length < 6) { setAlert(al, "Yeni şifre en az 6 karakter olmalı."); nw.focus(); return false; }
          if (nw.value !== nw2.value) { setAlert(al, "Yeni şifreler uyuşmuyor."); nw2.focus(); return false; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur.value));
            await updatePassword(user, nw.value);
            setOk(ok, "Şifren güncellendi. Bir dahaki girişte yeni şifreni kullan.");
            setTimeout(() => { if (b.isConnected) { b.disabled = true; b.querySelector(".dk-btn-l").textContent = "Güncellendi ✓"; } }, 0);
            return false;
          } catch (err) { setAlert(al, trError(err && err.code)); return false; }
        } },
      ],
    });
    enterSubmits(m, cur, nw, nw2);
  }

  // SHARED-CANDIDATE: panelShell'de kimlik güncelleme API'si yok (organizer/profil.js patchShellIdentity ile aynı yol). onSession
  // true döndüğü için kabuk yeniden kurulmuyor → yeni profil fotoğrafı / onaylanan ad kabuğun kendi düğümlerine yerel yama ile
  // yansır (kullanıcı kartı avatarı + iki satır, üst bar avatarı, üst bar kırıntısındaki mekan adı). Değişmediyse dokunulmaz;
  // yeni fotoğraf önce yüklenir, sonra değiştirilir (boş daire yok).
  const shellKey = (p) => [p.photoURL || "", p.displayName || "", p.email || session.user?.email || ""].join("|");
  let shellKey0 = shellKey(init);
  function patchShellIdentity() {
    const p = P0();
    const k = shellKey(p);
    if (k === shellKey0) return;
    const prevPhoto = shellKey0.split("|")[0];
    shellKey0 = k;
    const name = p.displayName || "Mekan";
    const email = p.email || session.user?.email || "";
    const card = shell.aside?.querySelector(".dk-ps-user");
    const u1 = card?.querySelector(".dk-ps-u1"), u2 = card?.querySelector(".dk-ps-u2");
    if (u1) u1.textContent = email || name;
    if (u2) u2.textContent = `${name} · yetkili`;
    const bc = shell.topbar?.querySelector(".dk-ps-bc > a");
    if (bc) bc.textContent = name;
    const swap = () => {
      if (!alive) return;
      const cardAv = shell.aside?.querySelector(".dk-ps-user > .dk-av");
      if (cardAv) cardAv.replaceWith(dkAvatar({ name: p.displayName, photo: p.photoURL, size: 38, type: "venue", border: true }));
      const topAv = shell.topbar?.querySelector(".dk-ps-av");
      if (topAv) topAv.replaceChildren(dkAvatar({ name: p.displayName, photo: p.photoURL, size: 38, type: "venue", border: true }));
    };
    if ((p.photoURL || "") === prevPhoto && p.photoURL) return; // yalnız ad/e-posta değişti; fotoğraflı avatarda baş harf yok
    if (p.photoURL) whenImageReady(p.photoURL, swap); else swap();
  }

  // ═════════ veri ═════════
  drawSummary(); drawNameBlock(); drawGallery(false);
  if (uid) {
    venueStats(uid).then((s) => { stats = s; }).catch(() => { statsErr = true; }).finally(() => { if (alive) drawSummary(); });
    getVenueReviews(uid).then((revs) => {
      rating = venueRatingFrom(P0(), revs);
      const cust = (revs || []).filter((r) => (r.authorType ?? "customer") === "customer" && String(r.comment || "").trim())
        .sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
      reviewsState = { loading: false, err: false, latest: cust[0] || null };
    }).catch(() => {
      rating = venueRatingFrom(P0(), null);
      reviewsState = { loading: false, err: true, latest: null };
    }).finally(() => { if (alive) { drawSummary(); drawReviews(); } });
    watchedArtists(uid).then((list) => { follows = list || []; if (alive) { drawFollows(); scrollToSection(); } })
      .catch(() => { if (alive) { folCount.textContent = "0"; folList.replaceChildren(emptyBox(ERR_LOAD)); } });
    Promise.all([venueAcceptedInvitations(uid), myReviews(uid).catch(() => [])]).then(([invs, mine]) => {
      // legacy renderReview: sanatçı başına en son performans; kendi yorumum (reviews, targetType artist)
      const myMap = new Map((mine || []).filter((r) => r._col === "reviews" && (r.targetType ?? "artist") === "artist").map((r) => [r.targetId, Number(r.rating) || 0]));
      const now = Date.now();
      const byArtist = new Map();
      (invs || []).forEach((i) => {
        if (!i.artistId) return; // serbest metin sanatçılar atlanır (app ile aynı)
        const ms = Date.parse(`${i.eventDate}T${i.eventTime || "00:00"}:00`);
        const cur = byArtist.get(i.artistId);
        if (!cur || ((isNaN(ms) ? 0 : ms) > (cur.lastMs || 0))) {
          byArtist.set(i.artistId, {
            artistId: i.artistId, artistName: i.artistName || "Sanatçı", genre: i.genre || "",
            lastMs: isNaN(ms) ? null : ms,
            lastLabel: [fmtDateTR(i.eventDate), i.eventTime].filter(Boolean).join(" · "),
          });
        }
      });
      rateItems = [...byArtist.values()].map((x) => ({ ...x, myReview: myMap.get(x.artistId) ?? null, ratable: x.lastMs != null && x.lastMs <= now }));
      if (alive) { drawRate(); scrollToSection(); }
    }).catch(() => { if (alive) rateList.replaceChildren(emptyBox(ERR_LOAD)); });
  }

  // ?bolum=takip|degerlendir → ilgili karta kaydır (legacy #/venue/takip, #/venue/degerlendir karşılığı)
  let wantSection = ctx.query?.get?.("bolum") || null;
  function scrollToSection() {
    if (!wantSection) return;
    const el = wantSection === "takip" ? folSec : wantSection === "degerlendir" ? rateSec : null;
    if (!el) { wantSection = null; return; }
    requestAnimationFrame(() => { if (!alive) return; el.scrollIntoView({ block: "start", behavior: "smooth" }); });
  }
  if (wantSection) setTimeout(scrollToSection, 60);

  // ── kaydedilmemiş değişiklik koruması: sayfadan ayrılma / panel içi gezinme / geri tuşu ──
  let leaveAsk = null; // aynı anda tek onay
  const askLeave = () => leaveAsk || (leaveAsk = dkConfirm({ title: "Değişiklikler kaydedilmedi", body: "Kaydedilmemiş değişiklikler var. Sayfadan ayrılırsan kaybolacak.", confirmLabel: "Ayrıl", cancelLabel: "Sayfada kal", danger: true })
    .finally(() => { leaveAsk = null; }));
  const onBeforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", onBeforeUnload);
  cleanups.push(() => window.removeEventListener("beforeunload", onBeforeUnload));
  const onNavClick = (e) => {
    if (!dirty || saving || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || a.target === "_blank") return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("#/") || hashBase(href) === hashBase(ctx.base || "#/venue/profil")) return;
    e.preventDefault(); e.stopPropagation();
    askLeave().then((ok) => { if (ok && alive) { dirty = false; location.hash = href; } });
  };
  document.addEventListener("click", onNavClick, true);
  cleanups.push(() => document.removeEventListener("click", onNavClick, true));
  // Geri/İleri (tarayıcı geçmişi): bağlantı tıklaması değil → Navigation API 'navigate' (traverse, aynı belge, iptal edilebilir)
  // ile aynı onay. Yalnız traverse: yönlendirici/çıkış/arama 'push' gezintileri etkilenmez. API yoksa ya da tarayıcı iptale izin
  // vermiyorsa (cancelable=false) koruma sessizce devre dışı — sayfa yenileme/kapatma beforeunload ile korunuyor.
  const navApi = window.navigation;
  if (navApi && typeof navApi.addEventListener === "function") {
    const onNavigate = (e) => {
      if (!dirty || saving || !alive || e.navigationType !== "traverse" || !e.cancelable || !e.hashChange) return;
      const url = e.destination?.url || "";
      const hash = url.includes("#") ? url.slice(url.indexOf("#")) : "#/";
      if (hashBase(hash) === hashBase(ctx.base || "#/venue/profil")) return;
      const key = e.destination.key;
      e.preventDefault();
      askLeave().then((ok) => {
        if (!ok || !alive) return;
        dirty = false;
        try { navApi.traverseTo(key).finished?.catch(() => {}); } catch (_) { location.hash = hash; }
      });
    };
    navApi.addEventListener("navigate", onNavigate);
    cleanups.push(() => navApi.removeEventListener("navigate", onNavigate));
  }

  return {
    node: shell.node,
    update(query) { wantSection = query?.get?.("bolum") || null; scrollToSection(); },
    onSession() {
      // oturum yayını (refreshProfile vb.): form kullanıcının çalışma kopyasıdır → yalnız özet/ad bloğu güncellenir
      if (!alive) return true;
      drawSummary(); drawNameBlock(); patchShellIdentity();
      if (!dirty && !saving && gal.items.every((x) => !x.blob)) { initGallery(P0()); drawGallery(false); }
      return true;
    },
    destroy() {
      alive = false;
      cleanups.forEach((f) => { try { f(); } catch (_) {} });
      try { map?.remove(); } catch (_) {}
      map = null; marker = null;
      previews.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
      previews.clear();
      shell.destroy();
    },
  };
}
