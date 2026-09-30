// WebSanatciProfil — "Profilim" masaüstü görünümü (≥769 px). Registry anahtarı: artistProfil (#/artist/profil[?tab=…]).
// Spec: specs/sanatci.md § WebSanatciProfil. Artboard: design/WebSanatciProfil.dc.html. CSS: css/dk-sanatci-profil.css
// (kök .dk-sanatci-profil = PanelShell içerik bölgesi). ≤768: legacy artist.js renderProfile (router bu modülü yüklemez).
//
// Legacy (artist.js renderProfile) özellikleri — HEPSİ korundu:
//   • Sanatçı Bilgileri: ad (90 gün kuralı + displayNameChangedAt: serverTimestamp()), şehir (81 il datalist), ilçe, deneyim,
//     hakkında, profil fotoğrafı (openImageCropper aspect 1 / yuvarlak → uploadImage), hazır banner (BANNER_PRESETS + "Yok").
//   • Kimlik & Vitrin: slogan (maxlength 60, patch slice 80), Resident günü (RES_DAYS + "— Yok —") / mekanı (slice 60),
//     aksan rengi (ACCENTS; varsayılan #FF4FA3 — legacy accentPicker gibi her kayıtta yazılır).
//   • Vitrin & Uygunluk: öne çıkan set (slice 400), müsaitlik (AVAIL_OPTS).
//   • Paketler & Booking: ≤4 paket {name≤40, price≤20, includes≤120, eventTypes} (boş satır elenir), EVENT_TYPES, SET_FORMATS,
//     LANGUAGES (+ özel dil — legacy chipMulti allowCustom; slice 8), MC (Hayır/Evet → mcAbility), ≤6 ek hizmet {name≤40,
//     price≤20}, ≤6 video linki (boş elenir). Sınırda legacy toast'ı ("En fazla N …").
//   • Bölge & Kurulum: ek şehirler (≤15; datalist), şehir-dışı ücret (≤120), EQUIP_OPTS, min. süre (≤40), kurulum (≤40).
//   • Müzik Türleri: 40 legacy tür + özel tür (büyük/küçük harf duyarsız tekilleştirme, Enter ekler).
//   • Performans Ücreti: min/max (MIN_STAGE_FEE 3.500, üst sınır 1.000.000, max ≥ min; string yazılır), PRICE_TYPE_OPTS,
//     kapora notu (≤160), CANCELLATION_OPTS.
//   • Sosyal Medya: instagram / soundcloud / spotify / youtube.
//   • Tek "Kaydet" (iki düğme aynı işleyici) → legacy ile AYNI patch şekli → saveProfile → refreshProfile → toast
//     "Profilin güncellendi". Hata: ERR-APROFILE-002. Korumalı alan (avgRating/reviewCount/followerCount/approved/userType) YAZILMAZ.
//   • Açılışta syncResidentDenorm(uid, p) (rezidans denormu; legacy ile aynı).
//   • İstatistikler (Performans/Puan/Yorum/Takipçi — legacy statsBox) → önizleme kartında. Profil tamamlama (ui.profileCompletion,
//     eksik çip → ilgili sekme + ilk alan). Üyelik kıdemi rozeti + "GigBridge üyesi · N yıldır" → önizleme kartında.
//   • Menü: Aldığım Yorumlar, Bildirimler, E-posta Değiştir, Şifre Değiştir, Sorun Bildir; Çıkış Yap (onay), Hesabımı Sil
//     (3 ay yumuşak silme). Profil fotoğrafını büyütme (legacy lightbox) → önizleme avatarı.
//   Bilinçli olarak taşınanlar (spec §8 / Q13): kamusal salt-okunur bloklar (öne çıkan set oynatıcısı, paket kartları, şartlar…)
//   → önizleme kartı + "Herkese açık profil"; "Mekan Değerlendirmeleri" gizlilik notu → WebSanatciMekanlar; "Sanatçı" tip rozeti
//   + e-posta → kenar çubuğu kullanıcı kartı.
// YENİ (tasarım): sekmeli form (?tab=… URL'de), eksik alan noktaları, canlı önizleme (taslak değerlerle), kaydetme çubuğu,
// alınan yorumlar özeti, Gruplarım (groups where memberIds array-contains uid — otomatik tek alan indeksi), "Profilde ara"
// (alan etiketine göre sekmeye atlar).
import { h, openImageCropper, profileCompletion, BANNER_PRESETS, ACCENTS, RES_DAYS, AVAIL_OPTS, EVENT_TYPES, SET_FORMATS, EQUIP_OPTS, LANGUAGES, PRICE_TYPE_OPTS, CANCELLATION_OPTS } from "../../ui.js";
import { session, logout, refreshProfile, scheduleAccountDeletion } from "../../store.js";
import { saveProfile, uploadImage, submitReport, artistReviews, artistAcceptedInvitations, syncResidentDenorm, serverTimestamp } from "../../data.js";
import {
  auth, db, collection, query, where, getDocs,
  EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword,
  sendPasswordResetMail, sendPasswordResetEmail,
} from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { cx, dkAvatar, dkModal, dkConfirm, dkToast, dkLoginGate, dkInput, dkLabel } from "../shared/ui.js";
import { svgRaw, svgPath } from "../shared/icons.js";
import { rgba, fold, matchText, kFmt, fmtTL, writeQuery, swapAnim, PROVINCES, initials } from "../shared/helpers.js";
import { genreGrad } from "../shared/genres.js";

// ══════════ sabitler (legacy artist.js ile aynı) ══════════
const MIN_STAGE_FEE = 3500;        // iş kuralı: altında sahne alınamaz
const MAX_ARTIST_PRICE = 1000000;  // sanatçı ücreti üst sınırı
const NAME_DAYS = 90;              // sanatçı adı değişikliği aralığı (kural: nameChangeCooldownDays artist = 90)
// Kapsamlı tür listesi — legacy artist.js GENRES (dışa aktarılmıyor) ile birebir, artboard DCLogic ile aynı sıra.
const GENRES = [
  "House", "Tech House", "Deep House", "Techno", "Melodic Techno", "Minimal", "Afro House", "Organic House", "Trance", "Electronic", "Disco",
  "Türkçe Pop", "Türkçe Rock", "Türkçe Rap", "Arabesk", "Fasıl", "Türk Halk Müziği", "Türk Sanat Müziği", "Türkü", "Oyun Havası", "Roman Havası", "Anadolu Rock", "Özgün Müzik", "Slow", "Damar",
  "Pop", "Rock", "Jazz", "Blues", "Klasik", "Hip-Hop", "Rap", "R&B", "Reggae", "Funk", "Soul", "Latin", "Akustik", "Alternatif", "Metal",
];
// [anahtar, sekme etiketi, bölüm başlığı, alt başlık] — artboard TABS
const TABS = [
  ["bilgiler", "Bilgiler", "Sanatçı Bilgileri", "Adın, konumun ve kendini tanıttığın alan."],
  ["kimlik", "Kimlik", "Kimlik & Vitrin", "Slogan, Resident bilgisi ve profil aksan rengin."],
  ["vitrin", "Vitrin", "Vitrin & Uygunluk", "Öne çıkan setin ve güncel müsaitlik durumun."],
  ["booking", "Booking", "Paketler & Booking", "Mekanların teklif verirken gördüğü paketler ve detaylar."],
  ["bolge", "Bölge", "Bölge & Kurulum", "Hizmet verdiğin şehirler ve teknik ihtiyaçlar."],
  ["turler", "Türler", "Müzik Türleri", "Çaldığın türleri seç; istersen kendi türünü ekle."],
  ["ucret", "Ücret", "Performans Ücreti", "Ücret aralığın, fiyat tipi ve şartların."],
  ["sosyal", "Sosyal", "Sosyal Medya", "Profilinde bağlantı olarak görünür."],
];
const TAB_KEYS = TABS.map((t) => t[0]);
// Önizleme rozetleri (artboard AV) + legacy üyelik kıdemi (memberBadgeFor)
const AV = { open: ["Rezervasyona açık", "#7CE0B0"], limited: ["Sınırlı müsaitlik", "#FF8A2A"], busy: ["Şu an dolu", "#8A8E97"] };
const BADGE_TIERS = [{ tier: 10, label: "10 Yıllık Üye", color: "#F5C518" }, { tier: 5, label: "5 Yıllık Üye", color: "#C0C4CC" }, { tier: 1, label: "1 Yıllık Üye", color: "#CD7F32" }];
const RES_SHORT = { Paz: "Pazar", Pzt: "Pazartesi", Sal: "Salı", "Çar": "Çarşamba", Per: "Perşembe", Cum: "Cuma", Cmt: "Cumartesi" };
// Sosyal (artboard DCLogic SOC — ikon yolları birebir)
const SOC = [
  { key: "instagram", label: "Instagram", ph: "kullanıcı adı ya da bağlantı", icon: "M7.5 3.5h9a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17 7h.01" },
  { key: "soundcloud", label: "SoundCloud", ph: "kullanıcı adı ya da bağlantı", icon: "M3 15v2M6 12v5M9 10v7M12 8v9h6a3 3 0 0 0 0-6 5 5 0 0 0-6-3" },
  { key: "spotify", label: "Spotify", ph: "sanatçı adı ya da bağlantı", icon: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.2-.4 7.3.8M8.6 15.4c1.9-.4 3.9-.2 5.4.6" },
  { key: "youtube", label: "YouTube", ph: "kanal ya da bağlantı", icon: "M3.5 8.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3zM10.5 9.5v5l4-2.5z" },
];
// Artboard <svg> gövdeleri (birebir)
const P = {
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  save: '<path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v5h7V4M8 20v-6h8v6"></path>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"></path><circle cx="12" cy="13" r="3.2"></circle>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  chev: '<path d="m9 6 6 6-6 6"></path>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"></path>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"></path>',
  plusCircle: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 8.5v7M8.5 12h7"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>',
};
const MENU = [
  { label: "Aldığım Yorumlar", href: "#/artist/yorumlar", icon: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" },
  { label: "Bildirimler", href: "#/artist/bildirimler", icon: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" },
  { label: "E-posta Değiştir", act: "email", icon: "M3.5 6h17v12h-17zM3.5 6l8.5 7 8.5-7" },
  { label: "Şifre Değiştir", act: "password", icon: "M8 14a4 4 0 1 1 3.9-5H21v3h-2v2h-3v-2h-4.1A4 4 0 0 1 8 14z" },
  { label: "Sorun Bildir", act: "report", icon: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8v5M12 16h.01" },
];

// ══════════ küçük yardımcılar ══════════
const NS = "dk-sanatci-profil";
const k = (...names) => names.filter(Boolean).map((n) => `${NS}-${n}`).join(" ");
const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
// legacy artist.js parseTL / toMs birebir (sayı saniye olabilir: < 1e12 → ×1000)
function parseTL(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}
function legacyMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") { const t = Date.parse(v); return isNaN(t) ? null : t; }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return null;
}
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const membershipYears = (c) => { const ms = legacyMs(c); return ms == null ? 0 : Math.max(0, Math.floor((Date.now() - ms) / MS_PER_YEAR)); };
const membershipMonths = (c) => { const ms = legacyMs(c); return ms == null ? 0 : Math.max(0, Math.floor((Date.now() - ms) / (MS_PER_YEAR / 12))); };
const memberBadgeFor = (c) => { const y = membershipYears(c); return BADGE_TIERS.find((t) => y >= t.tier) ?? null; };
function membershipLabel(c) {
  if (legacyMs(c) == null) return "GigBridge üyesi";
  const y = membershipYears(c);
  if (y >= 1) return `GigBridge üyesi · ${y} yıldır`;
  const m = membershipMonths(c);
  return m >= 1 ? `GigBridge üyesi · ${m} aydır` : "GigBridge üyesi · yeni";
}
// Hazır banner eşleşmesi: kayıtlı URL preset ile aynı ya da aynı /assets/banners/<dosya> (emülatör tohumu yerel kopya kullanıyor)
const bannerFile = (u) => { const m = String(u || "").match(/\/assets\/banners\/([^/?#]+)$/); return m ? m[1] : null; };
const sameBanner = (a, b) => !!a && !!b && (a === b || (bannerFile(a) && bannerFile(a) === bannerFile(b)));
// Gösterim: preset'in AYNI dosyası göreli yoldan (üretimde gigbridges.com'un kendisi; yerelde çalışan sunucu). Yazılan değer
// her zaman legacy BANNER_PRESETS URL'idir (değişmedi).
const bannerSrc = (u) => (bannerFile(u) && /^https:\/\/gigbridges\.com\//.test(u) ? `assets/banners/${bannerFile(u)}` : u);

// ── şifre sıfırlama + hata metinleri (auth.js'teki özel yardımcılar dışa aktarılmıyor) ──
// SHARED-CANDIDATE: js/pages/auth.js requestPasswordReset / recaptchaToken / trError dışa aktarılmalı (WebProfil de kopyalıyor).
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
    await sendPasswordResetEmail(auth, email);   // Functions yoksa (emülatör / bölge hatası) Firebase'in kendi e-postası
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

// Gruplarım — app Gruplar ekranının karşılığı. data.js'te üye sorgusu yok (listGroups şehre göre) → yerel sorgu.
// array-contains → Firestore'un otomatik tek alan indeksi (yeni bileşik indeks YOK); kural: groups okuma = girişli kullanıcı.
async function myGroups(uid) {
  const snap = await getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ══════════════════════════════════════════════════════════════════════
export function artistProfilView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid;
  let prof = s.profile || {};
  let alive = true;
  const cleanups = [];

  const shell = panelShell({
    role: "artist", active: ctx.route?.nav || "profil", ctx,
    title: "Profilim", subtitle: "Sanatçı Paneli · Profil ve booking vitrini",
    search: { placeholder: "Profilde ara", onSubmit: (q) => searchJump(q) },
  });
  const root = shell.content;
  root.classList.add(NS);

  // ── taslak (form durumu tek nesnede → gizli sekmelerdeki alanlar da kayda girer) ──
  const arr = (x) => (Array.isArray(x) ? x.filter((v) => v != null && v !== "") : []);
  const D = {
    name: prof.displayName || "",
    city: prof.city || "", district: prof.district || "",
    exp: prof.experienceYears != null ? String(prof.experienceYears) : "",
    bio: prof.bio || "",
    bannerUrl: prof.bannerUrl || null,
    tagline: prof.tagline || "", resDay: prof.residencyDay || "", resVenue: prof.residencyVenue || "",
    accent: prof.accentColor || "#FF4FA3",
    setUrl: prof.featuredSetUrl || "", avail: prof.availabilityStatus || "",
    packages: (Array.isArray(prof.packages) ? prof.packages : []).filter(Boolean).map((r) => ({
      name: r.name || "", price: r.price || "", includes: r.includes || "", eventTypes: Array.isArray(r.eventTypes) ? [...r.eventTypes] : [] })),
    eventTypes: [...new Set(arr(prof.eventTypes))], setFormats: [...new Set(arr(prof.setFormats))], languages: [...new Set(arr(prof.languages))],
    mc: prof.mcAbility ? "1" : "",
    addOns: (Array.isArray(prof.addOns) ? prof.addOns : []).filter(Boolean).map((a) => ({ name: a.name || "", price: a.price || "" })),
    videos: arr(prof.videoUrls).map(String),
    serviceCities: [...new Set(arr(prof.serviceCities))],
    travel: prof.travelFee || "", equip: prof.equipmentBrings || "", minDur: prof.minDuration || "", setup: prof.setupTime || "",
    genres: [...new Set(arr(prof.genres))],
    priceMin: prof.priceMin != null && prof.priceMin !== "" ? String(prof.priceMin) : "",
    priceMax: prof.priceMax != null && prof.priceMax !== "" ? String(prof.priceMax) : "",
    priceType: prof.priceType || "", deposit: prof.depositNote || "", cancel: prof.cancellationPolicy || "",
    social: { instagram: prof.social?.instagram || "", soundcloud: prof.social?.soundcloud || "", spotify: prof.social?.spotify || "", youtube: prof.social?.youtube || "" },
  };
  let photoFile = null, photoObjUrl = null;
  let RES = { residentVenue: prof.residentVenue || "", residentDays: prof.residentDays || "" };
  const refs = {};          // alan anahtarı → odaklanacak öğe
  let tab = TAB_KEYS.includes(ctx.query?.get("tab")) ? ctx.query.get("tab") : "bilgiler";

  // ══════════ ALAN ATOMLARI ══════════
  const lbl = (text, id) => h("span", { class: k("lbl"), id }, text);
  const hint = (text) => h("span", { class: k("hint") }, text);
  // <label> sarmalayıcı (artboard): etiket + kontrol + ipucu; q = "Profilde ara" dizini
  const field = (text, control, { hintEl, max, q } = {}) => h("label", { class: k("fld"), style: max ? { maxWidth: max + "px" } : null, dataset: { q: q || text } }, lbl(text), control, hintEl || null);
  function input(key, { ph, type = "text", maxlength, size = 44, mono, list, get, set, aria } = {}) {
    const el = h("input", { type, placeholder: ph, maxlength, list, "aria-label": aria, class: k(size === 40 ? "in40" : "in", mono && "mono"), spellcheck: "false", autocomplete: list ? "off" : null });
    el.value = get ? get() : (D[key] ?? "");
    el.addEventListener("input", () => { if (set) set(el.value); else D[key] = el.value; changed(key); });
    if (key && !refs[key]) refs[key] = el;
    return el;
  }
  function select(key, options, { size = 44, fs14 } = {}) {
    const el = h("select", { class: k(size === 40 ? "sel40" : "sel", fs14 && "fs14") },
      ...options.map((o) => h("option", { value: o.value }, o.label)));
    const stored = D[key] ?? "";
    el.value = stored;
    // Kayıtlı değer listede yoksa (app/web seçenek listeleri ayrışırsa) görünür ek seçenek olarak eklenir → ekranda görünen
    // ile kaydedilen değer hep aynı, uygulamanın yazdığı değer sessizce ezilmez.
    if (el.selectedIndex < 0 && stored) { el.append(h("option", { value: stored }, String(stored))); el.value = stored; }
    if (el.selectedIndex < 0) { el.selectedIndex = 0; D[key] = el.value; }
    el.addEventListener("change", () => { D[key] = el.value; changed(key); });
    refs[key] = el;
    return el;
  }
  // Çip (aria-pressed) — h32 r16 13/500 (paket içi: h28 r14 12/500)
  function chip(label, on, onToggle, { small } = {}) {
    const b = h("button", { type: "button", class: cx(k(small ? "tchip" : "chip"), "dk-press"), "aria-pressed": on ? "true" : "false" }, label);
    b.addEventListener("click", () => { const next = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", next ? "true" : "false"); onToggle(next); });
    return b;
  }
  const toggleIn = (list, v, on) => { const i = list.indexOf(v); if (on && i < 0) list.push(v); if (!on && i >= 0) list.splice(i, 1); };
  const xBtn = (label, onClick) => h("button", { type: "button", class: cx(k("x"), "dk-press"), "aria-label": label, onclick: onClick }, svgRaw(P.x, { size: 15, sw: "2" }));
  const dashBtn = (label, onClick) => h("button", { type: "button", class: cx(k("dash"), "dk-press"), onclick: onClick }, label);
  const cityList = h("datalist", { id: `${NS}-cities` }, ...PROVINCES.map((c) => h("option", { value: c })));

  // ══════════ SEKME PANELLERİ ══════════
  const panels = {};

  // ── Bilgiler ──
  const photoBox = h("span", { class: k("photoimg") });
  const fileIn = h("input", { type: "file", accept: "image/*", class: k("file"), "aria-label": "Profil fotoğrafı seç" });
  const photoLabel = h("label", { class: k("photo") }, photoBox,
    h("span", { class: k("photoov"), "aria-hidden": "true" }, svgRaw(P.camera, { size: 12, sw: "2" }), "Değiştir"), fileIn);
  refs.photo = fileIn;
  fileIn.addEventListener("change", async (e) => {
    const picked = (e.target.files || [])[0] || null;
    e.target.value = "";                               // aynı dosya tekrar seçilebilsin
    if (!picked) return;
    const cropped = await cropImage(picked);   // legacy photoPicker akışı (openImageCropper aspect 1 / yuvarlak)
    if (!cropped || !alive) return;
    photoFile = cropped;
    if (photoObjUrl) URL.revokeObjectURL(photoObjUrl);
    photoObjUrl = URL.createObjectURL(cropped);
    paintPhotos();
    changed("photo");
  });
  // Legacy openImageCropper'a masaüstü katman davranışı: dialog rolü + başlık, ilk odak (yakınlaştırma), Esc = İptal, Tab
  // döngüsü, açıkken #app inert, kapanınca odak fotoğraf seçiciye; rota değişince (destroy) iptal edilir → sonraki sayfada kalmaz.
  // SHARED-CANDIDATE: dkImageCropper (openImageCropper'ın masaüstü sarmalayıcısı) — WebProfil / WebMekanProfil de kullanabilir.
  let cropLayer = null;
  function cropImage(file) {
    const host = document.getElementById("modal-root") || document.body;
    const app = document.getElementById("app");
    const before = new Set(host.querySelectorAll(":scope > .cr-overlay"));
    let ov = null, prevInert = false, cancelBtn = null;
    const focusables = () => (ov ? [...ov.querySelectorAll("button, input")].filter((el) => !el.disabled) : []);
    const onKey = (e) => {
      if (!ov) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelBtn?.click(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (i < 0) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
      else if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    const enhance = (node) => {
      if (ov || !node) return;
      ov = node;
      cancelBtn = ov.querySelector(".cr-actions .btn-ghost");
      if (!alive) { cancelBtn?.click(); return; }     // görünüm kapandıktan sonra yüklendiyse hiç gösterme
      const title = ov.querySelector(".cr-title");
      if (title) { title.id = `${NS}-crt`; ov.setAttribute("aria-labelledby", title.id); } else ov.setAttribute("aria-label", "Fotoğrafı Konumlandır");
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");
      const zoom = ov.querySelector(".cr-zoom");
      if (zoom) zoom.setAttribute("aria-label", "Yakınlaştır");
      if (app) { prevInert = app.hasAttribute("inert"); app.setAttribute("inert", ""); }
      document.addEventListener("keydown", onKey, true);
      (zoom || cancelBtn)?.focus();
      cropLayer = { cancel: () => cancelBtn?.click() };
    };
    const mo = new MutationObserver(() => { enhance([...host.querySelectorAll(":scope > .cr-overlay")].find((n) => !before.has(n))); });
    mo.observe(host, { childList: true });
    const done = () => {
      mo.disconnect();
      document.removeEventListener("keydown", onKey, true);
      if (ov && app && !prevInert) app.removeAttribute("inert");
      if (ov) { cropLayer = null; if (alive) { try { fileIn.focus({ preventScroll: true }); } catch (_) {} } }
      ov = null;
    };
    const p = openImageCropper(file, { aspect: 1, round: true });
    p.then(done, done);
    return p;
  }
  const bannerCells = [];
  const bannerGroup = h("div", { role: "radiogroup", "aria-label": "Kapak görseli", class: k("banners") });
  const bannerOpts = [{ url: null, label: "Yok" }, ...BANNER_PRESETS.map((b) => ({ url: b.url, label: b.label }))];
  bannerOpts.forEach((o, i) => {
    const check = h("span", { class: k("bcheck"), "aria-hidden": "true" }, svgRaw(P.check, { size: 11, sw: "3" }));
    const cell = h("button", { type: "button", role: "radio", "aria-label": o.url ? o.label : "Kapak yok", class: cx(k("bcell", !o.url && "bnone"), "dk-press") },
      o.url ? h("img", { src: bannerSrc(o.url), alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: k("bnonel") }, svgRaw(P.x, { size: 14, sw: "2" }), "Yok"),
      check);
    cell.addEventListener("click", () => { pickBanner(i); });
    bannerCells.push({ cell, o });
    bannerGroup.append(cell);
  });
  const pickBanner = (i) => { D.bannerUrl = bannerOpts[i].url; paintBanners(); changed("banner"); };
  radioKeys(bannerGroup, () => bannerCells.map((b) => b.cell), (i) => pickBanner(i));
  function paintBanners() {
    let any = false;
    bannerCells.forEach(({ cell, o }) => {
      const on = o.url ? sameBanner(D.bannerUrl, o.url) : !D.bannerUrl;
      if (on) any = true;
      cell.setAttribute("aria-checked", on ? "true" : "false");
      cell.classList.toggle("is-on", on);
    });
    // kayıtlı özel (preset dışı) URL → hiçbiri seçili değil; odak sırası ilk hücreden başlasın
    bannerCells.forEach(({ cell }, i) => { cell.tabIndex = cell.getAttribute("aria-checked") === "true" || (!any && i === 0) ? 0 : -1; });
  }
  const nameIn = input("name", { ph: "Sahne adın" });
  panels.bilgiler = h("div", { class: k("panel") },
    h("div", { class: k("prow") }, photoLabel,
      h("div", { class: k("bblock"), dataset: { q: "KAPAK (BANNER) — HAZIR SEÇ" } }, lbl("KAPAK (BANNER) — HAZIR SEÇ"), bannerGroup, hint("Kapak yüklenmez; hazır görsellerden seçilir."))),
    field("SANATÇI ADI", nameIn, { hintEl: hint("Profilinde, tekliflerde ve etkinliklerde bu ad görünür. 90 günde bir değiştirilebilir.") }),
    h("div", { class: k("row3") },
      field("ŞEHİR", input("city", { ph: "Ara: İstanbul, Aydın…", list: cityList.id })),
      field("İLÇE", input("district", { ph: "Örn. Kadıköy" })),
      field("DENEYİM (YIL)", input("exp", { ph: "0", type: "number" }))),
    field("HAKKINDA", (() => {
      const ta = h("textarea", { class: k("ta"), rows: "4", placeholder: "Kendini tanıt…" });
      ta.value = D.bio;
      ta.addEventListener("input", () => { D.bio = ta.value; changed("bio"); });
      refs.bio = ta;
      return ta;
    })()),
    cityList);

  // ── Kimlik ──
  const tagCount = h("span", {});
  const accentBtns = [];
  const accentGroup = h("div", { role: "radiogroup", "aria-label": "Aksan rengi", class: k("accents") });
  ACCENTS.forEach(([c, label], i) => {
    const b = h("button", { type: "button", role: "radio", "aria-label": label, class: cx(k("acc"), "dk-press"), style: { "--sp-sw": c } },
      h("span", { class: k("sw"), "aria-hidden": "true" }), label);
    b.addEventListener("click", () => pickAccent(i));
    accentBtns.push(b);
    accentGroup.append(b);
  });
  const pickAccent = (i) => { D.accent = ACCENTS[i][0]; paintAccents(); changed("accent"); };
  radioKeys(accentGroup, () => accentBtns, (i) => pickAccent(i));
  function paintAccents() {
    const idx = ACCENTS.findIndex(([c]) => c === D.accent);
    accentBtns.forEach((b, i) => { const on = i === idx; b.setAttribute("aria-checked", on ? "true" : "false"); b.classList.toggle("is-on", on); b.tabIndex = on || (idx < 0 && i === 0) ? 0 : -1; });
    root.style.setProperty("--sp-accent", D.accent || "#FF4FA3");
  }
  refs.accent = accentBtns[0];
  panels.kimlik = h("div", { class: k("panel") },
    field("SLOGAN (OPSİYONEL)", input("tagline", { ph: "örn. İstanbul gecelerinin melodic techno sesi", maxlength: 60 }),
      { hintEl: h("span", { class: k("hint") }, "Adının altında görünür — kısa tut (en çok 60 karakter). ", tagCount) }),
    h("div", { class: k("row2") },
      field("RESIDENT GÜNÜ", select("resDay", [{ value: "", label: "— Yok —" }, ...RES_DAYS.map((d) => ({ value: d, label: d }))])),
      field("RESIDENT MEKANI", input("resVenue", { ph: "örn. Klein, İstanbul" }))),
    h("p", { class: k("info") }, "Bir mekanla anlaştığında profilinde otomatik “RESIDENT · Mekan” çıkar. Elle de girebilirsin (mekanla anlaşman sistemde yoksa)."),
    h("div", { class: k("blk10"), dataset: { q: "AKSAN RENGİ" } }, lbl("AKSAN RENGİ"), accentGroup));

  // ── Vitrin ──
  panels.vitrin = h("div", { class: k("panel") },
    field("ÖNE ÇIKAN SET (LİNK)", input("setUrl", { ph: "SoundCloud / YouTube / Mixcloud / Spotify bağlantısı" }),
      { hintEl: hint("Profilinde gömülü oynatıcı olur — dosya yükleme yok, sadece linki yapıştır.") }),
    field("MÜSAİTLİK DURUMU", select("avail", AVAIL_OPTS), { max: 360 }));

  // ── Booking ──
  const pkgList = h("div", { class: k("pkglist") });
  const addPkgBtn = dashBtn("+ Paket Ekle", () => {
    if (D.packages.length >= 4) { dkToast("En fazla 4 paket ekleyebilirsin.", { type: "err" }); return; }
    D.packages.push({ name: "", price: "", includes: "", eventTypes: [] });
    drawPkgs(); changed("packages");
    pkgList.lastElementChild?.querySelector("input")?.focus();
  });
  function drawPkgs() {
    pkgList.replaceChildren(...D.packages.map((row, i) => {
      const mk = (f, ph, aria) => { const el = h("input", { class: k("in40", "inalt"), placeholder: ph, "aria-label": aria, spellcheck: "false" }); el.value = row[f] || ""; el.addEventListener("input", () => { row[f] = el.value; changed("packages"); }); return el; };
      const lab = h("span", { class: k("tlabel") }, "Etkinlik türü:");
      const paintLab = () => lab.classList.toggle("is-miss", !row.eventTypes.length);
      paintLab();
      return h("div", { class: k("pkg") },
        h("div", { class: k("pkgrow") },
          mk("name", "Paket adı", "Paket adı"), mk("price", "Fiyat", "Fiyat"), mk("includes", "Neler dahil?", "Neler dahil"),
          xBtn("Paketi sil", () => { D.packages.splice(i, 1); drawPkgs(); changed("packages"); (pkgList.querySelector(`.${NS}-x`) || addPkgBtn).focus(); })),
        h("div", { class: k("tchips"), role: "group", "aria-label": `Paket ${i + 1} etkinlik türleri` }, lab,
          ...EVENT_TYPES.map((t) => chip(t, row.eventTypes.includes(t), (on) => { toggleIn(row.eventTypes, t, on); paintLab(); changed("packages"); }, { small: true }))));
    }));
    addPkgBtn.hidden = D.packages.length >= 4;
  }
  drawPkgs();
  refs.packages = addPkgBtn;
  // Çoklu çip grubu (legacy chipMulti): options + (özel girişe izin varsa) seçili özel değerler
  function chipGroup(listKey, options, { custom, labelledby } = {}) {
    const wrap = h("div", { role: "group", "aria-labelledby": labelledby, class: k("chips") });
    const draw = () => {
      const all = custom ? [...new Set([...options, ...D[listKey]])] : options;
      wrap.replaceChildren(...all.map((o) => chip(o, D[listKey].includes(o), (on) => {
        toggleIn(D[listKey], o, on); changed(listKey);
        if (custom && !on && !options.includes(o)) draw();   // özel değer seçimden çıkınca kaybolur (legacy)
      })));
    };
    draw();
    wrap.redraw = draw;
    return wrap;
  }
  const evChips = chipGroup("eventTypes", EVENT_TYPES, { labelledby: `${NS}-l-ev` });
  const sfChips = chipGroup("setFormats", SET_FORMATS, { labelledby: `${NS}-l-sf` });
  const langChips = chipGroup("languages", LANGUAGES, { custom: true, labelledby: `${NS}-l-lang` });
  refs.eventTypes = () => evChips.querySelector("button");
  refs.setFormats = () => sfChips.querySelector("button");
  refs.languages = () => langChips.querySelector("button");
  // Özel dil (legacy chipMulti allowCustom: "Dil ekle" + "+ Ekle"; birebir aynı tekilleştirme)
  const langIn = h("input", { class: k("inline"), placeholder: "Dil ekle", "aria-label": "Dil ekle", spellcheck: "false" });
  const addLang = () => { const val = langIn.value.trim(); langIn.value = ""; if (val && !D.languages.includes(val)) { D.languages.push(val); langChips.redraw(); changed("languages"); } };
  langIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addLang(); } });
  const addOnList = h("div", { class: k("rows") });
  function drawAddOns() {
    addOnList.replaceChildren(...D.addOns.map((row, i) => {
      const mk = (f, ph, aria) => { const el = h("input", { class: k("in40"), placeholder: ph, "aria-label": aria, spellcheck: "false" }); el.value = row[f] || ""; el.addEventListener("input", () => { row[f] = el.value; changed("addOns"); }); return el; };
      return h("div", { class: k("addrow") }, mk("name", "Ek hizmet (ör. +1 saat)", "Ek hizmet"), mk("price", "Fiyat", "Ek hizmet fiyatı"),
        xBtn("Ek hizmeti sil", () => { D.addOns.splice(i, 1); drawAddOns(); changed("addOns"); }));
    }));
    addOnList.hidden = !D.addOns.length;
  }
  drawAddOns();
  const videoList = h("div", { class: k("rows") });
  function drawVideos() {
    videoList.replaceChildren(...D.videos.map((u, i) => {
      const el = h("input", { class: k("in40"), placeholder: "YouTube / Vimeo bağlantısı", "aria-label": "Video bağlantısı", spellcheck: "false" });
      el.value = u || "";
      el.addEventListener("input", () => { D.videos[i] = el.value; changed("videos"); });
      return h("div", { class: k("vrow") }, el, xBtn("Videoyu sil", () => { D.videos.splice(i, 1); drawVideos(); changed("videos"); }));
    }));
    videoList.hidden = !D.videos.length;
  }
  drawVideos();
  panels.booking = h("div", { class: k("panel", "panel18") },
    h("div", { class: k("blk10"), dataset: { q: "PAKETLER & FİYAT paket" } }, lbl("PAKETLER & FİYAT · EN ÇOK 4"), pkgList, addPkgBtn),
    h("div", { class: k("grid2") },
      h("div", { class: k("blk10"), dataset: { q: "ETKİNLİK TÜRLERİ" } }, lbl("ETKİNLİK TÜRLERİ", `${NS}-l-ev`), evChips),
      h("div", { class: k("blk10"), dataset: { q: "SET FORMATI" } }, lbl("SET FORMATI", `${NS}-l-sf`), sfChips),
      h("div", { class: k("blk10"), dataset: { q: "DİLLER dil" } }, lbl("DİLLER", `${NS}-l-lang`), langChips,
        h("div", { class: k("inlinerow") }, langIn, h("button", { type: "button", class: cx(k("pill"), "dk-press"), onclick: addLang }, "+ Ekle"))),
      h("label", { class: k("fld", "fld10"), dataset: { q: "MC / MİKROFON SUNUMU" } }, lbl("MC / MİKROFON SUNUMU YAPABİLİR MİSİN?"),
        select("mc", [{ value: "", label: "Hayır" }, { value: "1", label: "Evet" }], { size: 40 }))),
    h("div", { class: k("grid2") },
      h("div", { class: k("blk8"), dataset: { q: "EK HİZMETLER" } }, lbl("EK HİZMETLER · EN ÇOK 6"), hint("Ek saat, MC, ışık/efekt gibi ekstralar."), addOnList,
        dashBtn("+ Ek Hizmet", () => {
          if (D.addOns.length >= 6) { dkToast("En fazla 6 ekleyebilirsin.", { type: "err" }); return; }
          D.addOns.push({ name: "", price: "" }); drawAddOns(); changed("addOns"); addOnList.lastElementChild?.querySelector("input")?.focus();
        })),
      h("div", { class: k("blk8"), dataset: { q: "PERFORMANS REEL (VİDEO) video" } }, lbl("PERFORMANS REEL (VİDEO) · EN ÇOK 6"), hint("YouTube/Vimeo bağlantısı — video bizde barınmaz, sadece link."), videoList,
        dashBtn("+ Video Ekle", () => {
          if (D.videos.length >= 6) { dkToast("En fazla 6 ekleyebilirsin.", { type: "err" }); return; }
          D.videos.push(""); drawVideos(); changed("videos"); videoList.lastElementChild?.querySelector("input")?.focus();
        }))));

  // ── Bölge ──
  const cityChips = h("div", { class: k("cities") });
  const cityIn = h("input", { class: k("inline"), placeholder: "Ek şehir ekle", "aria-label": "Ek şehir ekle", list: cityList.id, autocomplete: "off", spellcheck: "false" });
  const cityAdd = h("button", { type: "button", class: cx(k("pill"), "dk-press") }, "+ Ekle");
  function drawCities() {
    cityChips.replaceChildren(...D.serviceCities.map((c, i) => h("span", { class: k("cchip") }, c,
      h("button", { type: "button", class: k("cx"), "aria-label": `${c} şehrini kaldır`, onclick: () => {
        D.serviceCities.splice(i, 1); drawCities(); changed("serviceCities");
        (cityChips.querySelectorAll(`.${NS}-cx`)[Math.min(i, D.serviceCities.length - 1)] || cityIn).focus();
      } }, svgRaw(P.x, { size: 12, sw: "2.4" })))), cityIn, cityAdd);
  }
  const addCity = () => {
    const c = cityIn.value.trim(); cityIn.value = "";
    if (!c || D.serviceCities.includes(c)) return;
    if (D.serviceCities.length >= 15) { dkToast("En fazla 15 şehir ekleyebilirsin.", { type: "err" }); return; }
    D.serviceCities.push(c); drawCities(); changed("serviceCities"); cityIn.focus();
  };
  cityAdd.addEventListener("click", addCity);
  cityIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addCity(); } });
  drawCities();
  refs.serviceCities = cityIn;
  panels.bolge = h("div", { class: k("panel") },
    h("div", { class: k("blk10"), dataset: { q: "HİZMET VERDİĞİN EK ŞEHİRLER" } }, lbl("HİZMET VERDİĞİN EK ŞEHİRLER"), cityChips),
    field("ŞEHİR-DIŞI EK ÜCRET / NOT", input("travel", { ph: "örn. İstanbul dışı +2.000₺ / km başına 15₺" })),
    h("div", { class: k("row3") },
      field("EKİPMAN", select("equip", EQUIP_OPTS, { fs14: true })),
      field("MİN. SÜRE", input("minDur", { ph: "örn. 2 saat" })),
      field("KURULUM SÜRESİ", input("setup", { ph: "örn. 45 dk" }))));

  // ── Türler ──
  const genreWrap = h("div", { role: "group", "aria-label": "Müzik türleri", class: k("chips") });
  const genreCount = h("span", { class: k("gcount"), "aria-live": "polite" });
  function drawGenres() {
    const all = [...new Set([...GENRES, ...D.genres])];
    genreWrap.replaceChildren(...all.map((g) => chip(g, D.genres.includes(g), (on) => {
      toggleIn(D.genres, g, on); changed("genres");
      if (!on && !GENRES.includes(g)) drawGenres();
    })));
  }
  drawGenres();
  refs.genres = () => genreWrap.querySelector("button");
  const genreIn = h("input", { class: k("in40", "grow"), placeholder: "Başka tür ekle…", "aria-label": "Başka tür ekle", spellcheck: "false" });
  const addGenre = () => {
    const g = genreIn.value.trim(); genreIn.value = "";
    if (!g) return;
    if (!D.genres.some((x) => x.toLowerCase() === g.toLowerCase())) { D.genres.push(g); drawGenres(); changed("genres"); }
  };
  genreIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addGenre(); } });
  panels.turler = h("div", { class: k("panel", "panel14") },
    genreWrap,
    h("div", { class: k("addgenre"), dataset: { q: "Başka tür ekle müzik türü" } }, genreIn, h("button", { type: "button", class: cx(k("obtn"), "dk-press"), onclick: addGenre }, "+ Ekle")),
    genreCount);

  // ── Ücret ──
  const priceAlert = h("span", { class: k("alert"), role: "alert", hidden: true });
  const minIn = input("priceMin", { ph: "En az 3.500", type: "number", mono: true });
  const maxIn = input("priceMax", { ph: "Örn. 10.000", type: "number", mono: true });
  panels.ucret = h("div", { class: k("panel") },
    h("div", { class: k("row3") },
      field("MİNİMUM ÜCRET (₺)", minIn), field("MAKSİMUM ÜCRET (₺)", maxIn),
      field("FİYAT TİPİ", select("priceType", PRICE_TYPE_OPTS, { fs14: true }))),
    priceAlert,
    h("p", { class: k("callout") }, "Sanatçılar en az ₺3.500 ücretle sahne alabilir. Fiyat tipi profilinde “Başlangıç ₺…” veya “Sabit ₺…” rozeti olarak gösterilir."),
    field("KAPORA NOTU (OPSİYONEL)", input("deposit", { ph: "örn. %30 kapora rezervasyonu kesinleştirir", maxlength: 160 }), { hintEl: hint("En çok 160 karakter.") }),
    field("İPTAL POLİTİKASI", select("cancel", CANCELLATION_OPTS, { fs14: true }), { max: 360 }));

  // ── Sosyal ──
  panels.sosyal = h("div", { class: k("panel", "panel12") },
    ...SOC.map((m) => h("label", { class: k("soc"), dataset: { q: m.label + " sosyal medya" } },
      h("span", { class: k("soctile"), "aria-hidden": "true" }, svgPath(m.icon, { size: 20, sw: "1.8" })),
      h("span", { class: k("soclbl") }, m.label),
      input("soc_" + m.key, { ph: m.ph, get: () => D.social[m.key], set: (v) => { D.social[m.key] = v; } }))));

  // ══════════ SEKMELER + BÖLÜM KARTI ══════════
  const tabBtns = new Map();
  const tablist = h("div", { role: "tablist", "aria-label": "Profil bölümleri", class: k("tabs") });
  TABS.forEach(([key, label]) => {
    const dot = h("span", { class: k("tabdot"), "aria-hidden": "true", hidden: true });
    const sr = h("span", { class: "dk-sr", hidden: true }, " (eksik alan var)");
    const b = h("button", { type: "button", role: "tab", id: `${NS}-tab-${key}`, "aria-controls": `${NS}-sec`, class: cx(k("tab"), "dk-press") }, label, dot, sr);
    b.addEventListener("click", () => setTab(key, { user: true }));
    tabBtns.set(key, { b, dot, sr });
    tablist.append(b);
  });
  tablist.addEventListener("keydown", (e) => {
    const i = TAB_KEYS.indexOf(tab);
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % TAB_KEYS.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + TAB_KEYS.length) % TAB_KEYS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = TAB_KEYS.length - 1;
    if (j == null) return;
    e.preventDefault();
    setTab(TAB_KEYS[j], { user: true });
    tabBtns.get(TAB_KEYS[j]).b.focus();
  });
  const secTitle = h("h2", { id: `${NS}-h-sec`, class: k("sectitle") });
  const secSub = h("span", { class: k("secsub") });
  const section = h("section", { id: `${NS}-sec`, role: "tabpanel", "aria-labelledby": `${NS}-h-sec`, class: cx(k("sec"), "dk-fb") },
    h("div", { class: k("sechead") }, secTitle, secSub),
    ...TAB_KEYS.map((key) => { panels[key].dataset.tab = key; return panels[key]; }));

  // 769–1023'te kaydet çubuğu yapışkan: odaklanan alanı (ör. metin alanının imleç dışı kısmı) örtüyorsa sayfayı kaydır.
  // Birincil çözüm CSS scroll-margin-bottom; bu, tarayıcının kaydırmadığı durumların yedeği (WCAG 2.4.11).
  const onSecFocus = (e) => {
    const t = e.target;
    if (!(t instanceof Element) || getComputedStyle(saveBar).position !== "sticky") return;
    requestAnimationFrame(() => {
      if (!alive || document.activeElement !== t) return;
      const a = t.getBoundingClientRect(), b = saveBar.getBoundingClientRect();
      if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0) {
        const dy = Math.min(a.bottom - b.top + 16, a.top - 72);   // alanın altı çubuğun 16px üstüne; üstü ekranın dışına taşmaz
        if (dy > 0) (document.scrollingElement || document.documentElement).scrollBy({ top: dy, behavior: "auto" });
      }
    });
  };
  section.addEventListener("focusin", onSecFocus);
  cleanups.push(() => section.removeEventListener("focusin", onSecFocus));

  function setTab(key, { user = false, focus = null } = {}) {
    if (!TAB_KEYS.includes(key)) key = "bilgiler";
    const changedTab = key !== tab;
    tab = key;
    const def = TABS.find((t) => t[0] === key);
    secTitle.textContent = def[2];
    secSub.textContent = def[3];
    tabBtns.forEach(({ b }, kk) => {
      const on = kk === key;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("is-on", on);
    });
    section.setAttribute("aria-labelledby", `${NS}-h-sec`);
    TAB_KEYS.forEach((kk) => { panels[kk].hidden = kk !== key; });
    if (changedTab) swapAnim(section);
    if (user) writeQuery({ tab: key === "bilgiler" ? null : key });
    if (focus) {
      const el = typeof focus === "function" ? focus() : focus;
      if (el) requestAnimationFrame(() => { try { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); } catch (_) {} });
    }
  }

  // ══════════ KAYDET ÇUBUĞU + HESAP ══════════
  const saveMsg = h("span", { class: k("savemsg"), role: "status", "aria-live": "polite" }, "Değişiklikler tek seferde kaydedilir.");
  let saveState = "idle";
  const setSaveMsg = (text, kind) => {
    saveMsg.textContent = text;
    saveMsg.dataset.kind = kind || "";
    saveState = kind || "idle";
  };
  const saveBtns = [];
  const mkSave = (cls) => {
    const b = h("button", { type: "button", class: cx(k("btnp", cls), "dk-press") }, svgRaw(P.save, { size: 16, sw: "2" }), h("span", {}, "Kaydet"));
    b.addEventListener("click", () => save());
    saveBtns.push(b);
    return b;
  };
  const saveBar = h("div", { class: k("savebar") }, saveMsg, mkSave("btnp22"));

  const menuAct = { email: () => openEmail(), password: () => openPass(), report: () => openReport() };
  const hesap = h("section", { "aria-labelledby": `${NS}-h-acc`, class: k("hesap") },
    h("h2", { id: `${NS}-h-acc`, class: k("hh2") }, "HESAP"),
    h("div", { class: k("menu") }, ...MENU.map((m) => {
      const inner = [svgPath(m.icon, { size: 18, sw: "1.9", color: "#A3A7AF" }), h("span", { class: k("mlbl") }, m.label), svgRaw(P.chev, { size: 14, sw: "2", color: "#8A8E97" })];
      return m.href
        ? h("a", { href: m.href, class: cx(k("mrow"), "dk-row") }, ...inner)
        : h("button", { type: "button", class: cx(k("mrow"), "dk-row"), onclick: menuAct[m.act] }, ...inner);
    })),
    h("div", { class: k("hfoot") },
      h("button", { type: "button", class: cx(k("out"), "dk-press"), onclick: async () => {
        const ok = await dkConfirm({ title: "Çıkış", body: "Hesabından çıkmak istiyor musun?", confirmLabel: "Çıkış Yap", cancelLabel: "İptal", danger: true, size: 420 });
        if (ok) logout();
      } }, svgRaw(P.logout, { size: 16, sw: "1.9" }), "Çıkış Yap"),
      h("button", { type: "button", class: cx(k("del"), "dk-press"), onclick: () => openDelete() }, svgRaw(P.trash, { size: 16, sw: "1.9" }), "Hesabımı Sil")));

  // ══════════ SAĞ SÜTUN — ÖNİZLEME ══════════
  const pvBannerImg = h("img", { alt: "", class: k("pvimg"), decoding: "async" });
  const pvBanner = h("div", { class: k("pvban") }, pvBannerImg,
    h("span", { class: k("pvov"), "aria-hidden": "true" }), h("span", { class: k("pvline"), "aria-hidden": "true" }),
    h("span", { class: k("pvtag") }, "ÖNİZLEME"));
  const pvAvatarBtn = h("button", { type: "button", class: k("pvavbtn"), "aria-label": "Profil fotoğrafını büyüt" });
  const pvAvatarWrap = h("span", { class: k("pvavwrap") });
  const pvName = h("span", { class: k("pvname") });
  const pvTag = h("span", { class: k("pvtl") });
  const pvPlace = h("span", { class: k("pvplace") });
  const pvMember = h("span", { class: k("pvmember") });
  const pvBadges = h("div", { class: k("pvbadges") });
  const pvResText = h("span", {});
  const pvRes = h("span", { class: k("pvres") }, h("span", { class: k("pvreslbl") }, "RESIDENT"), pvResText);
  const stat = (label) => { const v = h("span", { class: k("pvsv") }, "—"); return { v, node: h("span", { class: k("pvstat") }, v, h("span", { class: k("pvsl") }, label)) }; };
  const stPerf = stat("Performans"), stRate = stat("Puan"), stCount = stat("Yorum"), stFol = stat("Takipçi");
  const pvGenres = h("div", { class: k("pvgenres") });
  const preview = h("section", { "aria-label": "Herkese açık profil önizlemesi", class: k("pv") },
    pvBanner,
    h("div", { class: k("pvbody") }, pvAvatarWrap, pvName, pvTag, pvPlace, pvMember, pvBadges, pvRes,
      h("div", { class: k("pvstats") }, stPerf.node, stRate.node, stCount.node, stFol.node),
      pvGenres));
  pvAvatarBtn.addEventListener("click", () => openPhoto());

  // ── Profil tamamlama ──
  const compPct = h("span", { class: k("pct") });
  const compFill = h("span", { class: k("barfill") });
  const compBar = h("div", { role: "progressbar", "aria-label": "Profil tamamlama", "aria-valuemin": "0", "aria-valuemax": "100", class: k("bar") }, compFill);
  const compDone = h("span", { class: k("done"), hidden: true }, "Profil eksiksiz");
  const compMiss = h("div", { class: k("miss") });
  const completion = h("section", { "aria-labelledby": `${NS}-h-comp`, class: k("card", "card12") },
    h("div", { class: k("chead") }, h("h2", { id: `${NS}-h-comp`, class: k("ch2") }, "PROFİL TAMAMLAMA"), compPct),
    compBar, compDone, compMiss);

  // ── Alınan yorumlar ──
  const rvSum = h("span", { class: k("rvsum") });
  const rvList = h("div", { class: k("rvlist") }, skeletonLines(3));
  const reviews = h("section", { id: `${NS}-yorumlar`, "aria-labelledby": `${NS}-h-revs`, class: k("card", "card14") },
    h("div", { class: k("chead") }, h("h2", { id: `${NS}-h-revs`, class: k("ch2") }, "ALDIĞIM YORUMLAR"), rvSum),
    rvList,
    h("a", { href: "#/artist/yorumlar", class: k("rvlink") }, "Tüm yorumları gör", svgRaw(P.arrow, { size: 14, sw: "2.2" })));

  // ── Gruplarım ──
  const grList = h("div", { class: k("grlist") }, skeletonLines(2));
  // Web'de grup sayfası yok (spec Q14): satırlar gezinmesiz; "Tüm gruplar" → Top 10 Gruplar sekmesi (notun işaret ettiği yer).
  const groups = h("section", { "aria-labelledby": `${NS}-h-grp`, class: k("card", "card12") },
    h("div", { class: k("chead") }, h("h2", { id: `${NS}-h-grp`, class: k("ch2") }, "GRUPLARIM"),
      h("a", { href: "#/artist/top10?tur=gruplar", class: cx(k("grlink"), "dk-link") }, "Tüm gruplar →")),
    grList,
    h("p", { class: k("grnote") }, "Grup puanı, üyelerin aldığı yorumların ağırlıklı ortalamasıdır ve Top 10'da Gruplar sekmesinde yer alır."));

  // ══════════ SAYFA ══════════
  const head = h("div", { class: cx(k("head"), "dk-rise") },
    h("div", { class: k("hcol") },
      h("span", { class: k("eyebrow") }, "PROFİLİM"),
      h("h1", { class: k("h1") }, "Sahne ", h("em", {}, "vitrinin")),
      h("p", { class: k("lead") }, "Mekanların tekliflerde gördüğü profil. Değişiklikler sağdaki önizlemede anında görünür.")),
    h("div", { class: k("acts") },
      h("a", { href: uid ? `#/artist/sanatci/${encodeURIComponent(uid)}` : "#/artist", class: cx(k("btno"), "dk-press") }, svgRaw(P.eye, { size: 16, sw: "1.9" }), "Herkese açık profil"),
      mkSave()));
  const left = h("div", { class: k("left") }, tablist, section, saveBar, hesap);
  const aside = h("aside", { "aria-label": "Önizleme ve özet", class: k("aside") }, preview, completion, reviews, groups);
  root.append(head, h("div", { class: k("grid") }, left, aside));

  // ══════════ BOYAMA ══════════
  let paintQueued = false;
  function changed(key) {
    if (saveState !== "idle" && saveState !== "busy") setSaveMsg("Değişiklikler tek seferde kaydedilir.", "");
    if (key === "priceMin" || key === "priceMax") livePrice();
    if (key === "tagline") tagCount.textContent = `${D.tagline.length}/60`;
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => { paintQueued = false; if (alive) paint(); });
  }
  const cleanPackages = () => D.packages
    .filter((r) => String(r.name || "").trim() || String(r.price || "").trim() || String(r.includes || "").trim())
    .map((r) => ({ name: r.name || "", price: r.price || "", includes: r.includes || "", eventTypes: (r.eventTypes || []).filter(Boolean) }));
  const draftProfile = () => ({
    bio: D.bio, priceType: D.priceType, priceMin: D.priceMin, priceMax: D.priceMax, genres: D.genres,
    photoURL: photoFile ? "yerel" : (prof.photoURL || ""), featuredSetUrl: D.setUrl, packages: cleanPackages(),
    city: D.city, tagline: D.tagline, languages: D.languages,
  });
  // eksik madde → odaklanacak alan
  const MISS_FOCUS = {
    "Biyografi ekle": () => refs.bio, "Fiyat belirt": () => refs.priceMin, "Müzik türü seç": () => refs.genres(),
    "Profil fotoğrafı ekle": () => refs.photo, "Öne çıkan set ekle": () => refs.setUrl, "Paket ekle": () => refs.packages,
    "Pakete etkinlik türü ata": () => pkgList.querySelector(`.${NS}-tchip`) || refs.packages, "Şehir belirt": () => refs.city,
    "Slogan ekle": () => refs.tagline, "Dil ekle": () => refs.languages(),
  };
  let lastMissSig = null;
  function paintCompletion() {
    const { pct, missing } = profileCompletion(draftProfile());
    const done = pct >= 100;
    compPct.textContent = `%${pct}`;
    completion.style.setProperty("--sp-pct", done ? "#7CE0B0" : "#FF4FA3");
    compFill.style.width = pct + "%";
    compBar.setAttribute("aria-valuenow", String(pct));
    compDone.hidden = !done;
    const sig = missing.map((m) => m.label).join("|");
    if (sig !== lastMissSig) {
      lastMissSig = sig;
      compMiss.replaceChildren(...missing.map((m) => h("button", { type: "button", class: cx(k("mchip"), "dk-press"), onclick: () => setTab(m.anchor, { user: true, focus: MISS_FOCUS[m.label] }) },
        svgRaw(P.plusCircle, { size: 13, sw: "2" }), m.label)));
      compMiss.hidden = !missing.length;
    }
    const missTabs = new Set(missing.map((m) => m.anchor));
    tabBtns.forEach(({ dot, sr }, key) => { const miss = missTabs.has(key); dot.hidden = !miss; sr.hidden = !miss; });
  }
  const priceNums = () => ({
    min: D.priceMin.trim() ? Math.min(Math.max(parseTL(D.priceMin.trim()) ?? 0, 0), MAX_ARTIST_PRICE) : null,
    max: D.priceMax.trim() ? Math.min(Math.max(parseTL(D.priceMax.trim()) ?? 0, 0), MAX_ARTIST_PRICE) : null,
  });
  // legacy sırası: min < 3.500 → max < 3.500 → max < min
  function priceError() {
    const { min, max } = priceNums();
    if (min != null && min < MIN_STAGE_FEE) return { msg: `Sanatçılar en az ${fmtTL(MIN_STAGE_FEE)} ücretle sahne alabilir — minimum ücretin bunun altında olamaz.`, field: "priceMin" };
    if (max != null && max < MIN_STAGE_FEE) return { msg: `Maksimum ücret de en az ${fmtTL(MIN_STAGE_FEE)} olmalıdır.`, field: "priceMax" };
    if (min != null && max != null && max < min) return { msg: "Maksimum ücret, minimum ücretten küçük olamaz.", field: "priceMax" };
    return null;
  }
  function livePrice() {
    const e = priceError();
    priceAlert.hidden = !e;
    priceAlert.textContent = e ? e.msg : "";
    [["priceMin", minIn], ["priceMax", maxIn]].forEach(([f, el]) => {
      const bad = !!e && e.field === f;
      el.classList.toggle("is-invalid", bad);
      if (bad) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    });
  }
  function paintPhotos() {
    const src = photoObjUrl || prof.photoURL || null;
    const nm = D.name.trim() || prof.displayName || "Sanatçı";
    photoBox.replaceChildren(src ? h("img", { src, alt: "Profil fotoğrafı", decoding: "async" }) : dkAvatar({ name: nm, size: 112, type: "artist", fontSize: 40 }));
    pvAvatarWrap.replaceChildren();
    if (src) { pvAvatarBtn.replaceChildren(h("img", { src, alt: "", class: k("pvav") })); pvAvatarWrap.append(pvAvatarBtn); }
    else pvAvatarWrap.append(h("span", { class: k("pvav", "pvavph"), "aria-hidden": "true" }, initials(nm)));
  }
  function residentText() {
    const rv = String(RES.residentVenue || "").trim();
    if (rv) {
      const days = String(RES.residentDays || "").trim();
      const long = RES_SHORT[days] ? `Her ${RES_SHORT[days]}` : days;   // tek gün → "Her Cuma"; çoklu → "Pzt, Cum"
      return [rv, long].filter(Boolean).join(" · ");
    }
    const v = D.resVenue.trim();
    if (!v) return "";
    return v + (D.resDay ? " · " + (D.resDay === "Her gün" ? "Her gün" : "Her " + D.resDay) : "");
  }
  function paint() {
    // önizleme (taslak değerler)
    const accent = D.accent || "#FF4FA3";
    root.style.setProperty("--sp-accent", accent);
    const bsrc = D.bannerUrl ? bannerSrc(D.bannerUrl) : null;
    if (bsrc) { if (pvBannerImg.getAttribute("src") !== bsrc) pvBannerImg.src = bsrc; pvBannerImg.hidden = false; pvBanner.style.background = ""; }
    else { pvBannerImg.hidden = true; pvBannerImg.removeAttribute("src"); pvBanner.style.background = genreGrad(D.genres[0] || ""); }
    pvName.textContent = D.name.trim() || "Sanatçı";
    pvTag.textContent = D.tagline.trim();
    pvTag.hidden = !D.tagline.trim();
    const place = [D.genres[0], [D.city.trim(), D.district.trim()].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
    pvPlace.textContent = place; pvPlace.hidden = !place;
    pvMember.textContent = membershipLabel(prof.createdAt);
    const badges = [];
    if (AV[D.avail]) badges.push({ label: AV[D.avail][0], c: AV[D.avail][1] });
    const { min, max } = priceNums();
    if (D.priceType && (min || max)) badges.push({ label: (D.priceType === "start" ? "Başlangıç " : D.priceType === "fixed" ? "Sabit " : "") + fmtTL(min || max), c: "#FFD700" });
    const mb = memberBadgeFor(prof.createdAt);
    if (mb) badges.push({ label: mb.label, c: mb.color });
    pvBadges.replaceChildren(...badges.map((b) => h("span", { class: k("pvbadge"), style: { color: b.c, borderColor: rgba(b.c, 0.45), background: rgba(b.c, 0.1) } }, b.label)));
    pvBadges.hidden = !badges.length;
    const rt = residentText();
    pvResText.textContent = rt; pvRes.hidden = !rt;
    const g = D.genres;
    const gp = g.slice(0, 5).map((x) => h("span", { class: k("pvg") }, x));
    if (g.length > 5) gp.push(h("span", { class: k("pvg") }, `+${g.length - 5}`));
    pvGenres.replaceChildren(...gp);   // replaceChildren null'ı atlamaz (ui.js yaması yalnız append)
    pvGenres.hidden = !g.length;
    stFol.v.textContent = kFmt(prof.followerCount ?? 0);
    genreCount.textContent = `${D.genres.length} TÜR SEÇİLİ`;
    if (!photoObjUrl && !prof.photoURL) paintPhotos();   // baş harf yer tutucusu adı izler
    paintCompletion();
  }

  // ── yardımcı: iskelet satırlar ──
  function skeletonLines(n) {
    return h("div", { class: k("skel"), "aria-hidden": "true" }, ...Array.from({ length: n }, (_, i) => h("span", { class: k("skl"), style: { width: `${[88, 64, 76][i % 3]}%` } })));
  }

  // ══════════ VERİ ══════════
  const paintStats = (st) => {
    stPerf.v.textContent = st.perf == null ? "—" : String(st.perf);
    stRate.v.textContent = st.avg == null ? "—" : `★ ${st.avg}`;
    stRate.v.classList.toggle("is-gold", st.avg != null);
    stCount.v.textContent = st.count == null ? "—" : String(st.count);
  };
  function reviewCard(r, i) {
    const t = r.authorType;
    const typ = t === "venue" ? { label: "Mekan", c: "#FF8A2A" } : t === "customer" ? { label: "Dinleyici", c: "#4ED8FF" } : { label: "Değerlendiren", c: "#A3A7AF" };
    const grad = t === "venue" ? "linear-gradient(135deg, #FF8A2A, #D97706)" : t === "customer" ? "linear-gradient(135deg, #4ED8FF, #0891B2)" : "linear-gradient(135deg, #5E636D, #2C303A)";
    const name = r.authorName ?? "Değerlendiren";
    const n = Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)));
    return h("article", { class: k("rv", i && "rvnext") },
      h("div", { class: k("rvtop") },
        h("span", { class: k("rvav"), style: { background: grad }, "aria-hidden": "true" }, initials(name)),
        h("span", { class: k("rvname") }, name),
        h("span", { class: k("rvtype"), style: { color: typ.c, background: rgba(typ.c, 0.12) } }, typ.label)),
      h("span", { class: k("rvstars"), role: "img", "aria-label": `${n} / 5 yıldız` }, "★".repeat(n), h("span", { class: k("rvoff") }, "★".repeat(5 - n))),
      r.comment ? h("p", { class: k("rvtext") }, r.comment) : null);
  }
  (async () => {
    if (!uid) return;
    const [invs, revs] = await Promise.all([
      artistAcceptedInvitations(uid).catch(() => null),
      artistReviews(uid).catch(() => null),
    ]);
    if (!alive) return;
    // Profil istatistikleri (legacy statsBox): puan/yorum = rating > 0 olan yorumlar — sunucunun avgRating/reviewCount
    // hesabıyla (functions recomputeArtistRating) aynı kural. Özet başlığı da AYNI sayıları kullanır: aynı sayfada iki
    // farklı ortalama/sayı görünmesin (legacy renderReceivedReviews puansız yorumu 0 sayıyordu; ayrı sayfadaydı).
    const rs = revs ? revs.map((r) => r.rating).filter((x) => typeof x === "number" && x > 0) : null;
    const avgRated = rs && rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : null;
    paintStats({ perf: invs ? invs.length : null, avg: avgRated, count: rs ? rs.length : null });
    // Aldığım yorumlar (legacy renderReceivedReviews: tüm yorumlar, en yeni önce)
    if (!revs) {
      rvSum.textContent = "";
      rvList.replaceChildren(h("p", { class: k("muted") }, "Yorumlar yüklenemedi. Bağlantıyı kontrol edip yenile."));
      return;
    }
    if (avgRated != null) rvSum.replaceChildren(`${rs.length} yorum • Ortalama `, h("span", { class: k("gold") }, `★ ${avgRated}`));
    else rvSum.textContent = revs.length ? "Henüz puan yok" : "0 yorum";
    if (!revs.length) {
      rvList.replaceChildren(h("div", { class: k("rvempty") }, h("span", { class: k("rvet") }, "Henüz yorum almadın"),
        h("span", { class: k("muted") }, "Mekanlar ve dinleyiciler sahne aldıktan sonra değerlendirmeleri burada görünür.")));
      return;
    }
    rvList.replaceChildren(...revs.slice(0, 2).map(reviewCard));
  })();
  (async () => {
    if (!uid) return;
    let list = null;
    try { list = await myGroups(uid); } catch (_) { list = null; }
    if (!alive) return;
    if (!list) { grList.replaceChildren(h("p", { class: k("muted") }, "Gruplar yüklenemedi.")); return; }
    if (!list.length) { grList.replaceChildren(h("p", { class: k("muted") }, "Henüz bir gruba üye değilsin.")); return; }
    list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr"));
    grList.replaceChildren(...list.map((g) => {
      const n = Array.isArray(g.memberIds) ? g.memberIds.length : 0;
      const meta = [`${n} üye`, g.genre, g.city].filter(Boolean).join(" · ");
      const tile = h("span", { class: k("grtile"), "aria-hidden": "true" }, g.photoURL ? h("img", { src: g.photoURL, alt: "", loading: "lazy" }) : initials(g.name || "G"));
      const img = tile.querySelector("img");
      if (img) img.addEventListener("error", () => { tile.replaceChildren(initials(g.name || "G")); }, { once: true });
      return h("div", { class: k("gr") }, tile,
        h("span", { class: k("grcol") }, h("span", { class: k("grname") }, g.name || "Grup"), h("span", { class: k("grmeta") }, meta)));
    }));
  })();
  // Rezidans denormu (legacy renderProfile açılışı): aktif anlaşma → users/{uid}.residentVenue/residentDays (yalnız farklıysa yazar)
  if (uid) {
    // legacy gibi sonucu oturum profiline geri yazar (p === session.profile) → aynı oturumda tekrar ziyaret yeniden yazmaz.
    const p0 = prof;
    syncResidentDenorm(uid, p0).then((rr) => {
      if (!rr) return;
      new Set([p0, session.profile]).forEach((o) => { if (o && (o === p0 || o.id === uid)) { o.residentVenue = rr.residentVenue; o.residentDays = rr.residentDays; } });
      if (!alive) return;
      RES = { residentVenue: rr.residentVenue || "", residentDays: rr.residentDays || "" };
      paint();
    }).catch(() => {});
  }

  // ══════════ KAYDET (legacy handleSave birebir) ══════════
  let saving = false;
  const markInvalid = (el, on) => { if (!el) return; el.classList.toggle("is-invalid", !!on); if (on) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid"); };
  const setBusy = (on) => {
    saving = on;
    saveBtns.forEach((b) => { b.disabled = on; b.setAttribute("aria-busy", on ? "true" : "false"); });
  };
  // Kaydet çubuğu ≥1024'te statik: başlıktaki "Kaydet"ten gelen sonuç ekranın altında kalabilir → hata metni toast ile de duyurulur
  // (başarı zaten toast'lı; ikisi simetrik). Çubuk görünüyorsa da tekrar zararsız (toast canlı bölgeden okunur).
  const saveBarInView = () => { const r = saveMsg.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight); };
  const fail = (text) => { setSaveMsg(text, "err"); dkToast(text, { type: "err" }); };
  async function save() {
    if (saving) return;
    if (dkLoginGate("Profilini kaydetmek")) return;
    markInvalid(nameIn, false);
    const dn = D.name.trim();
    if (!dn) { fail("Sanatçı adını gir."); markInvalid(nameIn, true); setTab("bilgiler", { user: true, focus: nameIn }); return; }
    const perr = priceError();
    if (perr) { livePrice(); fail(perr.msg); setTab("ucret", { user: true, focus: perr.field === "priceMin" ? minIn : maxIn }); return; }
    const { min: minNum, max: maxNum } = priceNums();
    // Sanatçı adı değişikliği: 90 günde bir (displayNameChangedAt damgası; kural sunucuda da zorlar)
    const nameChanged = dn !== (prof.displayName || "");
    if (nameChanged) {
      const lastMs = legacyMs(prof.displayNameChangedAt);
      const canChange = lastMs == null || (Date.now() - lastMs) >= NAME_DAYS * 86400000;
      if (!canChange) {
        const nextDate = new Date(lastMs + NAME_DAYS * 86400000).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
        fail(`Sanatçı adını 90 günde bir değiştirebilirsin. Bir sonraki değişiklik: ${nextDate}.`);
        markInvalid(nameIn, true);
        setTab("bilgiler", { user: true, focus: nameIn });
        return;
      }
    }
    const t = (x) => String(x ?? "").trim();
    // patch — legacy renderProfile ile AYNI alanlar / dilimler / tipler
    const patch = {
      displayName: dn,
      bio: t(D.bio),
      priceMin: minNum != null ? String(minNum) : "",
      priceMax: maxNum != null ? String(maxNum) : "",
      genres: [...D.genres],
      social: { instagram: t(D.social.instagram), soundcloud: t(D.social.soundcloud), spotify: t(D.social.spotify), youtube: t(D.social.youtube) },
      city: t(D.city), district: t(D.district),
      experienceYears: t(D.exp) ? Number(t(D.exp).replace(/[^0-9]/g, "")) : null,
      tagline: t(D.tagline).slice(0, 80),
      residencyDay: D.resDay || "",
      residencyVenue: t(D.resVenue).slice(0, 60),
      accentColor: D.accent || "#FF4FA3",
      featuredSetUrl: t(D.setUrl).slice(0, 400),
      availabilityStatus: D.avail || "",
      packages: cleanPackages().slice(0, 4).map((r) => ({ name: (r.name || "").slice(0, 40), price: (r.price || "").slice(0, 20), includes: (r.includes || "").slice(0, 120), eventTypes: (r.eventTypes || []).filter(Boolean) })),
      eventTypes: [...D.eventTypes],
      setFormats: [...D.setFormats],
      serviceCities: [...D.serviceCities].slice(0, 15),
      travelFee: t(D.travel).slice(0, 120),
      equipmentBrings: D.equip || "",
      minDuration: t(D.minDur).slice(0, 40),
      setupTime: t(D.setup).slice(0, 40),
      videoUrls: D.videos.map((u) => String(u || "").trim()).filter(Boolean).slice(0, 6),
      languages: D.languages.map((l) => String(l).trim()).filter(Boolean).slice(0, 8),
      mcAbility: D.mc === "1",
      priceType: D.priceType || "",
      addOns: D.addOns.filter((a) => String(a.name || "").trim() || String(a.price || "").trim()).slice(0, 6).map((a) => ({ name: (a.name || "").slice(0, 40), price: (a.price || "").slice(0, 20) })),
      depositNote: t(D.deposit).slice(0, 160),
      cancellationPolicy: D.cancel || "",
    };
    if (nameChanged) patch.displayNameChangedAt = serverTimestamp();
    setBusy(true);
    let upToast = null;
    try {
      if (photoFile) {
        setSaveMsg("Fotoğraf yükleniyor…", "busy");
        if (!saveBarInView()) upToast = dkToast("Fotoğraf yükleniyor…", { type: "info", duration: 60000 });
        patch.photoURL = await uploadImage(photoFile, uid);
      }
      patch.bannerUrl = D.bannerUrl || null;   // hazır banner URL'i (yükleme yok)
      await saveProfile(uid, patch);
      photoFile = null;
      await refreshProfile();
      if (!alive) return;
      if (photoObjUrl && !photoFile) { URL.revokeObjectURL(photoObjUrl); photoObjUrl = null; paintPhotos(); }   // artık kayıtlı photoURL
      dkToast("Profilin güncellendi", { duration: 3200 });
      setSaveMsg("Tüm değişiklikler kaydedildi.", "ok");
    } catch (_) {
      if (alive) fail("Profil güncellenemedi. İnternet bağlantını kontrol et. (ERR-APROFILE-002)");
    } finally {
      try { upToast?.close(); } catch (_) {}   // sonuç toast'ı zaten değiştirdiyse etkisiz; sayfadan çıkıldıysa asılı kalmasın
      if (alive) setBusy(false);
    }
  }

  // ══════════ "Profilde ara" — alan etiketine göre sekmeye atla (spec Q2) ══════════
  function searchJump(q) {
    const qq = String(q || "").trim();
    if (!qq) return;
    for (const [key, label, title, sub] of TABS) {
      if (matchText(qq, label, title, sub)) { setTab(key, { user: true, focus: () => panels[key].querySelector("input,select,textarea,button") }); return; }
    }
    for (const key of TAB_KEYS) {
      const hit = [...panels[key].querySelectorAll("[data-q]")].find((el) => matchText(qq, el.dataset.q));
      if (hit) { setTab(key, { user: true, focus: () => hit.querySelector("input,select,textarea,button") || hit }); return; }
    }
    // tür / etkinlik türü gibi seçenek adları
    for (const key of TAB_KEYS) {
      const hit = [...panels[key].querySelectorAll("button,option")].find((el) => fold(el.textContent).includes(fold(qq)));
      if (hit) { setTab(key, { user: true, focus: () => (hit.tagName === "OPTION" ? hit.parentElement : hit) }); return; }
    }
    dkToast(`“${qq}” için eşleşen alan yok`, { type: "info" });
  }

  // ══════════ MODALLAR ══════════
  const mdlCls = cx(NS, k("mdl"));
  const statusLine = () => h("span", { class: k("mst"), role: "status", "aria-live": "polite" });
  const setStatus = (el, text, kind) => { el.textContent = text || ""; el.dataset.kind = kind || ""; };
  // Sorun Bildir (legacy reportModal → reports; reporterType 'artist')
  function openReport() {
    const sub = dkInput({ id: `${NS}-rp-sub`, placeholder: "Kısa başlık", size: 44, bg: "rail" });
    const msg = h("textarea", { id: `${NS}-rp-msg`, class: "dk-ta dk-in dk-inp-bg-rail", rows: "4", placeholder: "Sorununu ayrıntılı olarak yaz…" });
    const m = dkModal({
      title: "Sorun Bildir", variant: "panel", size: 480, cls: mdlCls,
      body: h("div", { class: k("mb") },
        h("p", { class: "dk-mdl-p" }, "Yaşadığın sorunu bize ilet; en kısa sürede inceleyeceğiz."),
        h("div", { class: k("mf") }, dkLabel("Konu", { for: sub.id }), sub),
        h("div", { class: k("mf") }, dkLabel("Mesaj", { for: msg.id }), msg)),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Gönder", variant: "primary", icon: svgRaw(P.send, { size: 16, sw: "2" }), busyLabel: "Gönderiliyor…", onClick: async () => {
          m.setError("");
          const s1 = sub.value.trim(), s2 = msg.value.trim();
          if (!s1 || !s2) { m.setError("Lütfen konu ve mesaj alanlarını doldur"); (s1 ? msg : sub).focus(); return false; }
          try {
            await submitReport(uid, { subject: s1, message: s2, reporterName: prof.displayName || "", reporterType: "artist" });
            dkToast("Teşekkürler — bildirimin alındı");
            return true;
          } catch (_) { m.setError("Bildirimin gönderilemedi"); return false; }
        } },
      ],
    });
  }
  // E-posta Değiştir (legacy auth.changeEmailModal akışı + metinleri)
  function openEmail() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) {
      dkModal({ title: "E-posta Değiştir", variant: "panel", size: 480, cls: mdlCls,
        body: h("p", { class: "dk-mdl-p" }, "Google ile giriş yaptığın için e-posta adresin Google hesabına bağlıdır ve buradan değiştirilemez. E-postanı Google hesap ayarlarından güncelleyebilirsin."),
        actions: [{ label: "Kapat", variant: "outline" }] });
      return;
    }
    const cur = dkInput({ id: `${NS}-ce1`, type: "password", placeholder: "Şifreni gir", size: 44, bg: "rail", autocomplete: "current-password" });
    const nw = dkInput({ id: `${NS}-ce2`, type: "email", placeholder: "yeni@email.com", size: 44, bg: "rail", autocomplete: "email" });
    const st = statusLine();
    let sent = false;
    const m = dkModal({
      title: "E-posta Değiştir", variant: "panel", size: 480, cls: mdlCls,
      body: h("div", { class: k("mb") },
        h("p", { class: "dk-mdl-p" }, "Güvenlik için mevcut şifreni iste. Yeni adresine bir doğrulama bağlantısı göndereceğiz."),
        h("div", { class: k("mf") }, dkLabel("Mevcut Şifre", { for: cur.id }), cur),
        h("div", { class: k("mf") }, dkLabel("Yeni E-posta", { for: nw.id }), nw),
        st),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Bağlantı Gönder", variant: "primary", busyLabel: "Gönderiliyor…", keepOpen: true, onClick: async (_c, btn) => {
          if (sent) return;
          setStatus(st, "", "");
          const pw = cur.value, em = nw.value.trim();
          if (!pw) { setStatus(st, "Mevcut şifreni gir.", "err"); cur.focus(); return; }
          if (!em) { setStatus(st, "Yeni e-posta gir.", "err"); nw.focus(); return; }
          if (em.toLowerCase() === (user?.email || "").toLowerCase()) { setStatus(st, "Yeni e-posta mevcut adresinle aynı.", "err"); nw.focus(); return; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
            await verifyBeforeUpdateEmail(user, em);
            sent = true;
            setStatus(st, "Doğrulama bağlantısı yeni e-postana gönderildi. Bağlantıya tıklayıp onayladıktan sonra yeni e-postanla giriş yapabilirsin.", "ok");
            setTimeout(() => { if (btn.isConnected) { btn.disabled = true; btn.querySelector(".dk-btn-l").textContent = "Gönderildi ✓"; } }, 0);
          } catch (err) { setStatus(st, trError(err && err.code), "err"); }
        } },
      ],
    });
    [cur, nw].forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } }));
  }
  // Şifre Değiştir (legacy auth.changePasswordModal akışı + "E-posta ile sıfırla")
  function openPass() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) {
      dkModal({ title: "Şifre Değiştir", variant: "panel", size: 480, cls: mdlCls,
        body: h("p", { class: "dk-mdl-p" }, "Google ile giriş yaptığın için hesabında parola yok; şifren Google hesabına bağlıdır ve buradan değiştirilemez. Şifreni Google hesap ayarlarından güncelleyebilirsin."),
        actions: [{ label: "Kapat", variant: "outline" }] });
      return;
    }
    const cur = dkInput({ id: `${NS}-cp1`, type: "password", placeholder: "Şu anki şifren", size: 44, bg: "rail", autocomplete: "current-password" });
    const nw = dkInput({ id: `${NS}-cp2`, type: "password", placeholder: "En az 6 karakter", size: 44, bg: "rail", autocomplete: "new-password" });
    const nw2 = dkInput({ id: `${NS}-cp3`, type: "password", placeholder: "Yeni şifreni tekrar gir", size: 44, bg: "rail", autocomplete: "new-password" });
    const st = statusLine();
    let done = false;
    const reset = h("button", { type: "button", class: k("reset") }, "E-posta ile sıfırla");
    reset.addEventListener("click", async () => {
      reset.disabled = true; const old = reset.textContent; reset.textContent = "Gönderiliyor…";
      setStatus(st, "", "");
      try {
        const rc = await recaptchaToken("password_reset");
        await requestPasswordReset(user.email, rc);
        setStatus(st, "Sıfırlama bağlantısı e-postana gönderildi. E-postandaki bağlantıdan yeni şifre belirle.", "ok");
      } catch (err) { setStatus(st, trError(err && err.code), "err"); }
      finally { reset.disabled = false; reset.textContent = old; }
    });
    const m = dkModal({
      title: "Şifre Değiştir", variant: "panel", size: 480, cls: mdlCls,
      body: h("div", { class: k("mb") },
        h("p", { class: "dk-mdl-p" }, "Güvenlik için önce mevcut şifreni gir, sonra yeni şifreni belirle."),
        h("div", { class: k("mf") }, dkLabel("Mevcut Şifre", { for: cur.id }), cur),
        h("div", { class: k("mf") }, dkLabel("Yeni Şifre", { for: nw.id }), nw),
        h("div", { class: k("mf") }, dkLabel("Yeni Şifre (Tekrar)", { for: nw2.id }), nw2),
        st,
        h("p", { class: k("mfoot") }, "Mevcut şifreni bilmiyor musun? ", reset)),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Şifreyi Güncelle", variant: "primary", busyLabel: "Güncelleniyor…", keepOpen: true, onClick: async (_c, btn) => {
          if (done) return;
          setStatus(st, "", "");
          if (!cur.value) { setStatus(st, "Mevcut şifreni gir.", "err"); cur.focus(); return; }
          if (nw.value.length < 6) { setStatus(st, "Yeni şifre en az 6 karakter olmalı.", "err"); nw.focus(); return; }
          if (nw.value !== nw2.value) { setStatus(st, "Yeni şifreler uyuşmuyor.", "err"); nw2.focus(); return; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur.value));
            await updatePassword(user, nw.value);
            done = true;
            setStatus(st, "Şifren güncellendi. Bir dahaki girişte yeni şifreni kullan.", "ok");
            setTimeout(() => { if (btn.isConnected) { btn.disabled = true; btn.querySelector(".dk-btn-l").textContent = "Güncellendi ✓"; } }, 0);
          } catch (err) { setStatus(st, trError(err && err.code), "err"); }
        } },
      ],
    });
    [cur, nw, nw2].forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } }));
  }
  // Hesabımı Sil (legacy auth.deleteAccountModal: 3 ay yumuşak silme — aynı metin + akış)
  function openDelete() {
    dkModal({
      title: "Hesabımı Sil", variant: "panel", size: 480, cls: mdlCls,
      body: h("div", { class: k("mb") },
        h("p", { class: "dk-mdl-p" }, "Hesabın silinmek üzere işaretlenecek. 3 ay boyunca profilin ve içeriklerin görünür kalır."),
        h("p", { class: "dk-mdl-p" }, "Bu süre içinde tekrar giriş yaparsan silme talebin otomatik iptal edilir. 3 ay boyunca hiç giriş yapmazsan hesabın ve tüm verilerin kalıcı olarak silinir.")),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Hesabımı Sil", variant: "danger", icon: svgRaw(P.trash, { size: 16, sw: "1.9" }), busyLabel: "İşleniyor…", onClick: async () => {
          try {
            await scheduleAccountDeletion();
            location.hash = "#/";
            dkToast("Hesabın silinmek üzere işaretlendi. 3 ay içinde giriş yaparsan geri alınır.");
            return true;
          } catch (_) {
            dkToast("İşlem başarısız. İnternetini kontrol edip tekrar dene.", { type: "err" });
            return false;
          }
        } },
      ],
    });
  }
  // Profil fotoğrafını büyüt (legacy cover avatarı → lightbox)
  // SHARED-CANDIDATE: tam ekran görsel lightbox'ı (WebMekan da yerel kopya tutuyor) — ui.js'e dkLightbox.
  function openPhoto() {
    const src = photoObjUrl || prof.photoURL;
    if (!src) return;
    dkModal({ title: "Profil fotoğrafı", variant: "panel", align: "center", size: 560, cls: mdlCls, initialFocus: ".dk-mdl-x",
      body: h("img", { src, alt: "Profil fotoğrafı", class: k("lbimg") }) });
  }

  // ══════════ kabuk kimliği (ad/foto kaydedilince) ══════════
  // SHARED-CANDIDATE: panelShell'de kimlik güncelleme API'si yok (setIdentity) — yeniden kurmak taslağı/kaydırmayı sıfırlar →
  // kabuğun kendi düğümlerinde yerel yama (kullanıcı kartı avatarı + adı, üst bar avatarı).
  function patchShellIdentity() {
    const nm = prof.displayName || "Sanatçı";
    const cardAv = shell.aside?.querySelector(".dk-ps-user > .dk-av");
    if (cardAv) cardAv.replaceWith(dkAvatar({ name: nm, photo: prof.photoURL, size: 36, type: "artist" }));
    const u1 = shell.aside?.querySelector(".dk-ps-u1"); if (u1) u1.textContent = nm;
    const topAv = shell.topbar?.querySelector(".dk-ps-av40");
    if (topAv) topAv.replaceChildren(dkAvatar({ name: nm, photo: prof.photoURL, size: 40, type: "artist" }));
  }

  // ══════════ ilk durum ══════════
  function radioKeys(group, items, pick) {
    group.addEventListener("keydown", (e) => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % list.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + list.length) % list.length;
      if (j == null) return;
      e.preventDefault();
      pick(j);
      list[j].focus();
    });
  }
  tagCount.textContent = `${D.tagline.length}/60`;
  paintBanners();
  paintAccents();
  paintPhotos();
  livePrice();
  setTab(tab);
  paint();

  return {
    node: shell.node,
    update(q) {
      const t = q?.get?.("tab");
      const key = TAB_KEYS.includes(t) ? t : "bilgiler";
      if (key !== tab) setTab(key);
    },
    // Aynı kimlikle oturum yayını (kaydet → refreshProfile): taslak korunur, kabuk kimliği + önizleme güncellenir.
    onSession(sess) {
      if (!alive || !sess?.user || sess.guest || sess.user.uid !== uid) return false;
      const np = sess.profile || {};
      if (np.userType && np.userType !== "artist") return false;
      const idChanged = (np.displayName || "") !== (prof.displayName || "") || (np.photoURL || "") !== (prof.photoURL || "");
      prof = np;
      if (idChanged) patchShellIdentity();
      paintPhotos();
      paint();
      return true;
    },
    destroy() {
      alive = false;
      try { cropLayer?.cancel(); } catch (_) {}   // açık kırpıcı → İptal (sonraki sayfanın üstünde kalmasın)
      cleanups.forEach((f) => { try { f(); } catch (_) {} });
      if (photoObjUrl) { try { URL.revokeObjectURL(photoObjUrl); } catch (_) {} photoObjUrl = null; }
      shell.destroy();
    },
  };
}
