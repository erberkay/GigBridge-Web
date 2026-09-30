// WebProfil — "Profilim" masaüstü görünümü (≥769 px). Registry anahtarı: profil (#/profil; misafir de açar → giriş CTA'sı).
// Spec: specs/hesap.md WebProfil (+ §0 kabuk). Artboard: design/WebProfil.dc.html. CSS: css/dk-profil.css (.dk-profil kökü).
// Legacy karşılığı: js/pages/customer.js renderProfil() + nameChangeModal() + auth.js changeEmailModal/changePasswordModal
// (≤768 aynen kalır).
//
// Legacy özellikleri (korundu): misafir durumu ("Misafir olarak geziyorsun" + Giriş Yap / Yeni Hesap Oluştur), avatar
// (foto → büyüt; kamera → yükle, uploadImage + saveProfile photoURL), ad/e-posta/"Üye" rozeti, istatistikler (katıldığı /
// takip / yorum / ort. verdiğim puan), üyelik rozeti + "GigBridge üyesi · N yıldır/aydır", şehir seçici (81 il, aranabilir,
// "Konumumu kullan" → Nominatim), ad değiştirme (30 gün kuralı + displayNameChangedAt: serverTimestamp()), e-posta
// değiştirme (yeniden doğrulama + verifyBeforeUpdateEmail; Google hesabı açıklaması), şifre değiştirme (yeniden doğrulama +
// updatePassword; Google hesabı açıklaması; "E-posta ile sıfırla"), katılımlarda adımı gizle (privacySettings.anonymousAttendance,
// satırın tamamı da çevirir, çift tık koruması), Gizlilik / Kullanım Koşulları / Hesap silme bağlantıları, çıkış (kenar menüsü
// "Çıkış yap" → onay modalı). Liste satırları (Biletlerim/Takip/Katıldıklarım/Yorumlarım/Favorilerim/Bildirimler) → kenar menüsü
// + istatistik hücreleri. "Etkinlikleri Keşfet" → header "Etkinlikler".
// DEĞİŞEN (spec §8): legacy müşteri "Hesabımı Sil" doğrudan Auth kullanıcısını SİLİYORDU (deleteMyAccount); burada sanatçı/
// organizatörle aynı 3 ay yumuşak silme (store.scheduleAccountDeletion, auth.deleteAccountModal ile aynı metin/akış).
// Yeni (tasarım): kapak şeridi (sıradaki biletin / son etkinliğin afişi; yoksa gradyan), FAVORİ istatistiği, üyelik rozeti,
// şehir çipi, sıradaki bilet kartı, son aktiviteler (istemci tarafı birleştirme), ilgi alanı türleri (users.favoriteGenres —
// YENİ isteğe bağlı alan; FAVORITE_GENRES=false ile gizlenir), satır içi ayar satırları, cyan anahtar.
//
// Yazımlar (legacy ile aynı biçim): saveProfile(uid, {displayName, displayNameChangedAt: serverTimestamp()}) · {city} ·
// {privacySettings: {...mevcut, anonymousAttendance}} · {photoURL} · YENİ {favoriteGenres: string[]}; Storage uploadImage
// (event_banners/{uid}/…); Auth reauthenticate + verifyBeforeUpdateEmail / updatePassword; yumuşak silme scheduleAccountDeletion.
import { h, openImageCropper } from "../../ui.js";
import { session, refreshProfile, scheduleAccountDeletion, onSession as onSessionChange } from "../../store.js";
import {
  auth, db, collectionGroup, query, where, getDocs, getDoc,
  EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword,
  sendPasswordResetMail, sendPasswordResetEmail,
} from "../../firebase.js";
import { followingList, favVenues, favEvents, myReviews, saveProfile, uploadImage, serverTimestamp } from "../../data.js";
import { accountShell } from "../shared/account-shell.js";
import { svgRaw, svgPath, svgIcon } from "../shared/icons.js";
import { cx, dkPageHead, dkAvatar, dkButton, dkInput, dkLabel, dkSwitch, dkChip, dkModal, dkToast, dkEmpty, dkSkeleton } from "../shared/ui.js";
import { openLogin } from "../shared/overlays.js";
import { locateCity, CITY_EVENT } from "../shared/city-picker.js";
import {
  PROVINCES, fold, trUpper, toMs, isToday, isTomorrow, isYesterday, fmtTime, DAYS_TR_SHORT, MONTHS_TR_SHORT, setActiveCity,
  eventStartMs, rgba,
} from "../shared/helpers.js";
import { GENRE_FAMILIES, FILTER_FAMILIES, genreFamily, genreFamilyKey, primaryGenre } from "../shared/genres.js";

// Sahibi açık sorusu 4: users.favoriteGenres (yeni isteğe bağlı alan; kural değişikliği gerekmez, Keşfet henüz okumaz).
// false → "İlgi alanı türleri" kartı hiç çizilmez (spec §9 yedeği).
const FAVORITE_GENRES = true;
const NAME_DAYS = 30;           // müşteri (kural: nameChangeCooldownDays customer 30)
const TICKET_TAIL = 6 * 3600e3; // bilet geçerlilik kuyruğu (app TICKET_VALID_TAIL_MS)

// ── artboard SVG gövdeleri (birebir) ──
const P = {
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"></path><path d="M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z"></path>',
  medal: '<circle cx="12" cy="9" r="5.5"></circle><path d="m8.5 13.5-2 7.5 5.5-3 5.5 3-2-7.5"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  user: '<circle cx="12" cy="8.5" r="3.5"></circle><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"></path>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4 7 8 6 8-6"></path>',
  key: '<circle cx="8" cy="15" r="4"></circle><path d="m10.8 12.2 8.2-8.2M16 7l2.5 2.5M14 9l2 2"></path>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a8 8 0 0 1-2.2 3.3M6.6 6.6C4.3 8 3 10.5 3 12c0 2 4 7 9 7a9 9 0 0 0 4.4-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h1M18 14h2"></path>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z"></path><path d="m9 12 2 2 4-4"></path>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h6"></path>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>',
  chev: '<path d="m9 6 6 6-6 6"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  nav: '<path d="m3 11 18-8-8 18-2-8z"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
};
// Son aktiviteler ikonları (DCLogic I{})
const AI = {
  ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  heart: "M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.4-7.5 10.4z",
  user: "M9 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3.5 19a5.5 5.5 0 0 1 11 0M16 8v6M13 11h6",
  check: "M1.5 12.5 5.5 16.5 13.5 7.5M10.5 15.5 11.5 16.5 19.5 7.5",
};
const TONE = { ticket: "#FF4FA3", star: "#FF8A2A", check: "#7CE0B0", heart: "#FF4FA3", user: "#4ED8FF" };

// ══════════ saf yardımcılar ══════════
const yearsSince = (v) => { const t = toMs(v); return t == null ? null : (Date.now() - t) / (365.25 * 86400e3); };
function memberBadge(createdAt) {  // legacy memberChip
  const y = yearsSince(createdAt); if (y == null) return null;
  return y >= 10 ? { label: "10 Yıllık Üye", c: "#F59E0B", rgb: "245,158,11" }
    : y >= 5 ? { label: "5 Yıllık Üye", c: "#C0C0C8", rgb: "192,192,200" }
      : y >= 1 ? { label: "1 Yıllık Üye", c: "#CD7F32", rgb: "205,127,50" } : null;
}
function membershipText(createdAt) {  // legacy membershipText
  const y = yearsSince(createdAt); if (y == null) return null;
  return "GigBridge üyesi · " + (y >= 1 ? Math.floor(y) + " yıldır" : Math.max(1, Math.floor(y * 12)) + " aydır");
}
const fmtLongDate = (ms) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
function nameLock(p) {  // → null | { until: ms }
  const last = toMs(p?.displayNameChangedAt);
  const days = p?.userType === "customer" || !p?.userType ? NAME_DAYS : 90;
  if (last == null) return null;
  const until = last + days * 86400e3;
  return until > Date.now() ? { until } : null;
}
// Türkçe ek (ünlü uyumu, özel adda kesme işareti): dat → "Babylon Club’a", acc → "Kolsch’u". Sayı/simgeyle bitende eksiz.
// thing=true (etkinlik/mekan adı): çok kelimeli ve son kelimesi iyelik ekli tamlama ("Jazz Buluşması", "Halk Müziği",
// "Caz Günleri") → kaynaştırma "n" ("Buluşması’nı", "Buluşması’na"); kişi adlarında uygulanmaz ("Sezen Aksu’yu").
const VOW = "aıoueiöüâîû";
const isPossessiveCompound = (low) => /\s/.test(low) && /(s[ıiuü]|ğ[ıiuü]|l[ae]r[ıi])$/.test(low);
function withSuffix(name, kind, thing = false) {
  const w = String(name || "").trim();
  if (!w || !/[a-zçğıöşüâîû]$/i.test(w)) return w;
  const low = w.toLocaleLowerCase("tr-TR");
  let v = "e";
  for (let i = low.length - 1; i >= 0; i--) if (VOW.includes(low[i])) { v = low[i]; break; }
  const back = "aıouâû".includes(v), round = "ouöüû".includes(v);
  let s = kind === "dat" ? (back ? "a" : "e") : back ? (round ? "u" : "ı") : (round ? "ü" : "i");
  if (VOW.includes(low[low.length - 1])) s = (thing && isPossessiveCompound(low) ? "n" : "y") + s;
  return w + "’" + s;
}
// Aktivite zamanı: "25 DK ÖNCE" / "2 SA ÖNCE" / "DÜN" / "19 EYL" (başka yıl: "19 EYL 2025")
function actTime(ms) {
  const diff = Date.now() - ms;
  if (diff < 3600e3) return `${Math.max(1, Math.floor(diff / 60000))} DK ÖNCE`;
  if (diff < 86400e3 && !isYesterday(ms)) return `${Math.floor(diff / 3600e3)} SA ÖNCE`;
  if (isYesterday(ms)) return "DÜN";
  const d = new Date(ms);
  return trUpper(`${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`) + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}
function dayLabel(ms) { // "Bugün" / "Yarın" / "Cmt 3 Eki"
  const d = new Date(ms);
  return isToday(ms) ? "Bugün" : isTomorrow(ms) ? "Yarın" : `${DAYS_TR_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`;
}

// Kendi katılım kayıtları + etkinlik (data.attendedEvents ile aynı sorgu; bilet alanları da döner: ticketStatus/checkedInAt).
// SHARED-CANDIDATE: spec (WebBiletlerim §7) attendedEvents'in `att` alanlarını da döndürmesini öneriyor — data.js'e taşınmalı.
async function myAttendance(uid) {
  const snap = await getDocs(query(collectionGroup(db, "attendees"), where("userId", "==", uid)));
  const out = await Promise.all(snap.docs.map(async (d) => {
    try { const ev = await getDoc(d.ref.parent.parent); return ev.exists() ? { id: ev.id, ...ev.data(), _att: d.data() } : null; } catch (_) { return null; }
  }));
  return out.filter(Boolean);
}

// ── şifre sıfırlama (auth.js'teki özel yardımcılar dışa aktarılmıyor) ──
// SHARED-CANDIDATE: js/pages/auth.js requestPasswordReset / recaptchaToken / trError dışa aktarılmalı; aşağıdakiler birebir kopya.
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
    await sendPasswordResetEmail(auth, email);
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

// Çıkış yapan akışlarda onay toast'u. Çıkış iki kimlik yıkımı üretir (kullanıcı → null "reauthing" → anonim misafir); her
// biri "dk:teardown identity" ile açık toast'u kapatır. Toast bu yüzden oturum misafire OTURDUKTAN sonra (router'ın aynı
// yayındaki çizimi bittikten sonra) gösterilir; oturum yayını gelmezse 6 sn yedek.
// Dönüş: fire() — akış başarıyla bitti; fire.cancel() — vazgeç.
function armLogoutToast(msg) {
  const settled = () => session.ready && !session.reauthing && (!session.user || session.guest);
  let off = null, fallback = 0, done = false;
  const stop = () => { done = true; off?.(); off = null; clearTimeout(fallback); };
  const show = () => { if (done) return; stop(); setTimeout(() => dkToast(msg, { duration: 6000 }), 60); };
  const fire = () => {
    if (done) return;
    if (settled()) { show(); return; }
    off = onSessionChange(() => { if (settled()) show(); });   // router dinleyicisinden SONRA eklendi → onun çiziminden sonra çalışır
    fallback = setTimeout(show, 6000);
  };
  fire.cancel = stop;
  return fire;
}

// Legacy kırpıcı (ui.openImageCropper) katmanına diyalog semantiği: role=dialog + aria-modal + başlık, odak "Uygula"ya,
// Tab tuzağı, Esc = İptal, arka plan (#app) inert; kapanınca odak kamera girdisine döner.
// SHARED-CANDIDATE: openImageCropper'ın kendisi (ya da dkModal içinde bir kırpıcı) bunu sağlamalı.
function cropperA11y(returnTo) {
  const app = document.getElementById("app");
  const host = document.getElementById("modal-root") || document.body;
  let ov = null, onKey = null, prevInert = false, released = false;
  const apply = (node) => {
    ov = node;
    const panel = node.querySelector(".cr-panel") || node;
    const title = node.querySelector(".cr-title");
    if (title) { title.id = "dk-profil-crop-t"; panel.setAttribute("aria-labelledby", title.id); }
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    node.querySelector(".cr-zoom")?.setAttribute("aria-label", "Yakınlaştır");
    if (app) { prevInert = !!app.inert; app.inert = true; }
    const btns = [...node.querySelectorAll(".cr-actions button")];
    const cancel = btns[0], ok = btns[btns.length - 1];
    onKey = (e) => {
      if (!ov?.isConnected) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel?.click(); return; }
      if (e.key !== "Tab") return;
      const f = [...panel.querySelectorAll("input, button")].filter((x) => !x.disabled);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const nx = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
      e.preventDefault(); f[nx].focus();
    };
    document.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => { try { ok?.focus({ preventScroll: true }); } catch (_) {} });
  };
  const obs = new MutationObserver(() => { if (ov) return; const n = host.querySelector(":scope > .cr-overlay"); if (n) apply(n); });
  obs.observe(host, { childList: true });
  return () => {
    if (released) return; released = true;
    obs.disconnect();
    if (onKey) document.removeEventListener("keydown", onKey, true);
    if (ov && app) app.inert = prevInert;
    if (ov) { try { returnTo?.focus({ preventScroll: true }); } catch (_) {} }
  };
}

// Modal içi durum satırı (role=status)
const statusLine = (cls) => h("span", { class: cx("dk-profil-mst", cls), role: "status", "aria-live": "polite" });
const setStatus = (el, text, kind) => { el.textContent = text || ""; el.dataset.kind = kind || ""; };

// ══════════════════════════════════════════════════════════════════════
export function profilView(ctx) {
  const s = ctx.session || session;
  const guest = !s.user || s.guest;
  const shell = accountShell({ active: "profil", ctx, contentGap: 24 });
  const root = shell.content;
  root.classList.add("dk-profil");
  const head = dkPageHead({ title: "Profil", em: "im", lead: "Kişisel bilgilerin, şehrin ve GigBridge'deki hareketlerin tek yerde." });
  root.append(head);

  // ── misafir (legacy renderProfil misafir dalı) ──
  if (guest) {
    root.append(dkEmpty({
      ring: true, cls: "dk-rise dk-profil-guest", icon: svgRaw(P.user, { size: 28, sw: "1.6" }),
      title: "Misafir olarak geziyorsun",
      sub: "Etkinliklere katılmak, favorilere eklemek, takip etmek ve profil oluşturmak için giriş yap.",
      action: h("div", { class: "dk-profil-gacts" },
        dkButton("Giriş Yap", { variant: "primary", size: 44, icon: svgIcon("login", { size: 15 }), onClick: () => openLogin() }),
        dkButton("Yeni Hesap Oluştur", { variant: "outline", size: 44, icon: svgIcon("userPlus", { size: 15 }), href: "#/register" })),
    }));
    return { node: shell.node, destroy() { shell.destroy(); } };
  }

  const uid = s.user.uid;
  let alive = true;
  const prof = () => session.profile || s.profile || {};
  const nameOf = (p = prof()) => p.displayName || s.user?.displayName || "Müşteri";
  const emailOf = () => session.user?.email || prof().email || "";
  let lastName = nameOf(), lastPhoto = prof().photoURL || null;

  // ════════ 1) Profil özeti ════════
  const cover = h("div", { class: "dk-profil-cover" },
    h("span", { class: "dk-profil-coverph", "aria-hidden": "true" }),
    h("span", { class: "dk-profil-covershade", "aria-hidden": "true" }),
    h("span", { class: "dk-profil-coverline dk-prism", "aria-hidden": "true" }));
  const setCover = (url) => {
    cover.querySelector(".dk-profil-coverimg")?.remove();
    if (!url) return;
    const img = h("img", { class: "dk-profil-coverimg dk-kb", src: url, alt: "", decoding: "async" });
    img.addEventListener("error", () => img.remove(), { once: true });
    cover.querySelector(".dk-profil-coverph").after(img);
  };

  const avWrap = h("div", { class: "dk-profil-av" });
  const fileInp = h("input", { type: "file", accept: "image/*", class: "dk-profil-file", "aria-label": "Profil fotoğrafını değiştir" });
  const camera = h("label", { class: "dk-profil-cam dk-press", "aria-label": "Profil fotoğrafını değiştir", title: "Profil fotoğrafını değiştir" },
    svgRaw(P.camera, { size: 16, sw: "2" }), fileInp);
  const drawAvatar = () => {
    const p = prof(), name = nameOf(p);
    const av = dkAvatar({ name, photo: p.photoURL, size: 112, type: "customer", alt: p.photoURL ? `${name} profil fotoğrafı` : "", cls: "dk-profil-avimg" });
    const el = p.photoURL
      ? h("button", { type: "button", class: "dk-profil-avbtn", "aria-label": "Profil fotoğrafını büyüt", onclick: () => photoLightbox(p.photoURL, name) }, av)
      : av;
    avWrap.replaceChildren(el, camera);
  };

  const nameEl = h("span", { class: "dk-profil-name" });
  const metaEl = h("span", { class: "dk-profil-meta" });
  const cityChip = h("span", { class: "dk-profil-chip is-city" }, svgRaw(P.pin, { size: 13, sw: "2", color: "#4ED8FF" }), h("span", {}));
  const memberChip = h("span", { class: "dk-profil-chip is-member" }, svgRaw(P.medal, { size: 13, sw: "2" }), h("span", {}));
  const chips = h("span", { class: "dk-profil-chips" },
    h("span", { class: "dk-profil-chip is-role" }, svgRaw(P.headphones, { size: 13, sw: "2" }), "Üye"), memberChip, cityChip);
  const editBtn = h("button", { type: "button", class: "dk-profil-edit dk-press" }, svgRaw(P.pen, { size: 16, sw: "1.9" }), "Profili düzenle");
  editBtn.addEventListener("click", () => openName());

  const stat = (label, href) => {
    const v = h("span", { class: "dk-profil-statv" }, dkSkeleton({ w: 36, h: 32, r: 6 }));
    const a = h("a", { href, class: "dk-profil-stat" }, v, h("span", { class: "dk-profil-statl" }, label));
    return { a, v };
  };
  const stAtt = stat("KATILDIĞI ETKİNLİK", "#/katildiklarim");
  const stFol = stat("TAKİP", "#/takip");
  const stFav = stat("FAVORİ", "#/favoriler");
  const stRev = stat("YORUM", "#/yorumlarim");
  const avgEl = h("span", { class: "dk-profil-avg", hidden: true }, svgRaw(P.star, { size: 12, fill: true }), h("span", {}));
  stRev.v.classList.add("has-avg");

  const summary = h("section", { class: "dk-profil-sum dk-rise", "aria-label": "Profil özeti", style: { "--dk-delay": "60ms" } },
    cover,
    h("div", { class: "dk-profil-id" },
      avWrap,
      h("div", { class: "dk-profil-idtx" }, nameEl, metaEl, chips),
      editBtn),
    h("div", { class: "dk-profil-stats" }, stAtt.a, stFol.a, stFav.a, stRev.a));

  // ════════ 2) Kişisel bilgiler ════════
  const rowBtn = (label, aria, onClick) => {
    const b = h("button", { type: "button", class: "dk-profil-chg dk-press", "aria-label": aria }, label);
    b.addEventListener("click", onClick);
    return b;
  };
  const settingRow = ({ icon, iconColor, label, labelId, value, valueCls, hint, right, cls }) =>
    h("div", { class: cx("dk-profil-row dk-row", cls) },
      h("span", { class: "dk-profil-tile", style: iconColor ? { color: iconColor } : null, "aria-hidden": "true" }, svgRaw(icon, { size: 17, sw: "1.8" })),
      h("span", { class: "dk-profil-rowtx" },
        label ? h("span", { class: "dk-profil-rowl", id: labelId || null }, label) : null,
        value, hint || null),
      right);

  const nameVal = h("span", { class: "dk-profil-rowv" });
  const nameHint = h("span", { class: "dk-profil-rowh" });
  const nameBtn = rowBtn("Değiştir", "Görünen adı değiştir", () => openName());
  const emailVal = h("span", { class: "dk-profil-rowv" });
  const cityVal = h("span", { class: "dk-profil-rowv" });
  const hideHint = h("span", { class: "dk-profil-rowh" });
  const hideLblId = "dk-profil-hide-l";
  let savingAnon = false;
  const hideSw = dkSwitch({ variant: "cyan", labelledBy: hideLblId, onChange: (next, { revert }) => applyAnon(next, revert) });
  hideSw.setAttribute("aria-describedby", "dk-profil-hide-h");
  hideHint.id = "dk-profil-hide-h";
  const hideRow = settingRow({
    icon: P.eyeOff, value: h("span", { class: "dk-profil-rowv", id: hideLblId }, "Katılımlarda adımı gizle"), hint: hideHint, right: hideSw, cls: "is-toggle",
  });
  hideRow.addEventListener("click", (e) => { if (e.target.closest(".dk-sw")) return; hideSw.click(); });

  const personal = h("section", { class: "dk-profil-card dk-rise", "aria-labelledby": "dk-profil-h-kisisel", style: { "--dk-delay": "120ms" } },
    h("div", { class: "dk-profil-chead" }, h("h2", { id: "dk-profil-h-kisisel", class: "dk-profil-h2" }, "Kişisel bilgiler"), h("span", { class: "dk-profil-tag" }, "01 · HESAP")),
    settingRow({ icon: P.user, label: "GÖRÜNEN AD", value: nameVal, hint: nameHint, right: nameBtn }),
    settingRow({ icon: P.mail, label: "E-POSTA", value: emailVal, right: rowBtn("Değiştir", "E-posta adresini değiştir", () => openEmail()) }),
    settingRow({ icon: P.key, label: "ŞİFRE", value: h("span", { class: "dk-profil-rowv is-dots", "aria-label": "Şifre gizli" }, "••••••••"), right: rowBtn("Değiştir", "Şifreyi değiştir", () => openPass()) }),
    settingRow({ icon: P.pin, iconColor: "#4ED8FF", label: "ŞEHRİM", value: cityVal, hint: h("span", { class: "dk-profil-rowh" }, "Keşfet ve Harita bu şehre göre açılır."), right: rowBtn("Değiştir", "Şehrini değiştir", () => openCity()) }),
    hideRow);

  // ════════ 3) İlgi alanı türleri ════════
  const genreTag = h("span", { class: "dk-profil-tag" });
  const genreChips = new Map();
  const genreGroup = h("div", { class: "dk-profil-genres", role: "group", "aria-label": "İlgi alanı türleri" });
  FILTER_FAMILIES.forEach((k) => {
    const f = GENRE_FAMILIES[k];
    const c = dkChip({ label: f.label, dot: f.color, size: 36, pressed: false, onClick: () => toggleGenre(k) });
    genreChips.set(k, c); genreGroup.append(c);
  });
  const genresCard = FAVORITE_GENRES ? h("section", { class: "dk-profil-card dk-profil-gcard dk-rise", "aria-labelledby": "dk-profil-h-ilgi", style: { "--dk-delay": "160ms" } },
    h("div", { class: "dk-profil-ghead" }, h("h2", { id: "dk-profil-h-ilgi", class: "dk-profil-h2" }, "İlgi alanı türleri"), genreTag),
    h("p", { class: "dk-profil-gp" }, "Keşfet'te bu türlerdeki etkinlikleri öne çıkarırız."),
    genreGroup) : null;

  // ════════ 4) Son aktiviteler ════════
  const actList = h("ol", { class: "dk-profil-acts" },
    ...[0, 1, 2].map(() => h("li", { class: "dk-profil-actli" }, h("span", { class: "dk-profil-act is-skel" },
      dkSkeleton({ w: 36, h: 36, r: 18 }), dkSkeleton({ w: "55%", h: 14 })))));
  const activity = h("section", { class: "dk-profil-card dk-rise", "aria-labelledby": "dk-profil-h-akt", style: { "--dk-delay": "200ms" } },
    h("div", { class: "dk-profil-chead" }, h("h2", { id: "dk-profil-h-akt", class: "dk-profil-h2" }, "Son aktiviteler"), h("span", { class: "dk-profil-tag" }, "02 · AKTİVİTE")),
    actList);

  // ════════ 5) Sıradaki bilet ════════
  const ticketBox = h("div", { class: "dk-profil-tkwrap dk-rise", style: { "--dk-delay": "140ms" } },
    h("div", { class: "dk-profil-tk is-skel" }, dkSkeleton({ h: 132, r: 0 }),
      h("span", { class: "dk-profil-tkb" }, dkSkeleton({ w: "50%", h: 11 }), dkSkeleton({ w: "85%", h: 18 }), dkSkeleton({ w: "60%", h: 13 }), dkSkeleton({ h: 40, r: 6 }))));

  // ════════ 6) Hesap ayarları ════════
  const setRow = (icon, label, href, danger) => {
    const inner = [svgRaw(icon, { size: 18, sw: "1.8", color: danger ? "currentColor" : "#A3A7AF" }), h("span", { class: "dk-profil-setl" }, label),
      svgRaw(P.chev, { size: 15, sw: "2", color: danger ? "currentColor" : "#8A8E97" })];
    return href
      ? h("a", { href, class: cx("dk-profil-set dk-row", danger && "is-danger") }, ...inner)
      : h("button", { type: "button", class: cx("dk-profil-set dk-row", danger && "is-danger") }, ...inner);
  };
  const delRow = setRow(P.trash, "Hesabı sil", null, true);
  delRow.setAttribute("aria-haspopup", "dialog");
  delRow.addEventListener("click", () => openDelete());
  const settings = h("section", { class: "dk-profil-card dk-profil-sets", "aria-labelledby": "dk-profil-h-ayar" },
    h("h2", { id: "dk-profil-h-ayar", class: "dk-profil-seth" }, "HESAP AYARLARI"),
    setRow(P.bell, "Bildirim ayarları", "#/bildirimler"),
    setRow(P.shield, "Gizlilik", "gizlilik.html"),
    setRow(P.file, "Kullanım koşulları", "kullanim-kosullari.html"),
    delRow);
  const setWrap = h("div", { class: "dk-profil-setwrap dk-rise", style: { "--dk-delay": "180ms" } }, settings,
    h("p", { class: "dk-profil-note" }, "Hesabını silersen takiplerin, favorilerin, yorumların ve paylaşımların kalıcı olarak silinir."));

  // Gövde: DOM sırası artboard ile aynı (sol → sağ; klavye/ekran okuyucu sırası). Yerleşim CSS grid'de açık: ≥1280 sol 624 +
  // sağ 320; ≤1279 sağ kolon (bilet + ayarlar) grid-row 1 ile özet kartının hemen altına 2 kolonlu satır olarak taşınır.
  const right = h("div", { class: "dk-profil-r" }, ticketBox, setWrap);
  const left = h("div", { class: "dk-profil-l" }, personal, genresCard, activity);
  root.append(summary, h("div", { class: "dk-profil-body" }, left, right));

  // ══════════ profil alanlarını çiz (oturumdan) ══════════
  function paintProfile() {
    const p = prof(), name = nameOf(p);
    nameEl.textContent = name;
    nameVal.textContent = name;
    const email = emailOf();
    emailVal.textContent = email || "—";
    metaEl.textContent = [email, membershipText(p.createdAt)].filter(Boolean).join(" · ");
    const mb = memberBadge(p.createdAt);
    memberChip.hidden = !mb;
    if (mb) {
      memberChip.lastChild.textContent = mb.label;
      memberChip.style.setProperty("--mc", mb.c); memberChip.style.setProperty("--mc-rgb", mb.rgb);
    }
    const city = p.city || "";
    cityChip.hidden = !city;
    cityChip.lastChild.textContent = city;
    cityVal.textContent = city || "Seçilmedi";
    cityVal.classList.toggle("is-muted", !city);
    const lock = nameLock(p);
    nameHint.textContent = lock ? `Adını ${fmtLongDate(lock.until)} tarihinde tekrar değiştirebilirsin.` : "Adını 30 günde bir değiştirebilirsin.";
    nameHint.classList.toggle("is-warn", !!lock);
    nameBtn.classList.toggle("is-locked", !!lock);
    if (lock) nameBtn.setAttribute("aria-disabled", "true"); else nameBtn.removeAttribute("aria-disabled");
    const hide = p.privacySettings?.anonymousAttendance === true;
    if (!savingAnon) hideSw.dk.set(hide);
    hideHint.textContent = hideSw.dk.get() ? "Katılımcı listelerinde \"Gizli üye\" olarak görünürsün" : "Katılımcı listelerinde adın görünür";
    if (FAVORITE_GENRES) paintGenres();
    drawAvatar();
  }
  const pickedFamilies = () => new Set((Array.isArray(prof().favoriteGenres) ? prof().favoriteGenres : []).map(genreFamilyKey).filter((k) => FILTER_FAMILIES.includes(k)));
  function paintGenres() {
    const on = pickedFamilies();
    genreChips.forEach((c, k) => c.dk.set(on.has(k)));
    genreTag.textContent = `${on.size} SEÇİLİ`;
  }

  // ══════════ veri: istatistikler, sıradaki bilet, aktiviteler ══════════
  async function loadData() {
    const safe = (p) => p.catch(() => null);
    const [att, fol, fv, fe, rv] = await Promise.all([safe(myAttendance(uid)), safe(followingList(uid)), safe(favVenues(uid)), safe(favEvents(uid)), safe(myReviews(uid))]);
    if (!alive) return;
    const n = (x) => (Array.isArray(x) ? x.length : null);
    const put = (st, v) => st.v.replaceChildren(v == null ? "—" : String(v));
    put(stAtt, n(att)); put(stFol, n(fol));
    put(stFav, fol || fv || fe ? (n(fol) || 0) + (n(fv) || 0) + (n(fe) || 0) : null);
    stRev.v.replaceChildren(h("span", {}, n(rv) == null ? "—" : String(n(rv))), avgEl);
    const rr = (rv || []).map((r) => Number(r.overallRating ?? r.rating)).filter((x) => x > 0);
    avgEl.hidden = !rr.length;
    if (rr.length) avgEl.lastChild.textContent = `${(rr.reduce((a, b) => a + b, 0) / rr.length).toFixed(1)} ort.`;
    stRev.a.setAttribute("aria-label", `${n(rv) ?? 0} yorum${rr.length ? ", ortalama " + avgEl.lastChild.textContent.replace(" ort.", "") + " puan" : ""}`);

    // sıradaki bilet: yaklaşan (başlangıç + 6 sa > şimdi) ve okutulmamış; başlangıca göre artan (tarihsiz sonda)
    const now = Date.now();
    const upcoming = (att || []).filter((e) => { const st = eventStartMs(e); return e._att?.ticketStatus !== "used" && (st == null || st + TICKET_TAIL > now); })
      .sort((a, b) => (eventStartMs(a) ?? Infinity) - (eventStartMs(b) ?? Infinity));
    const next = upcoming[0] || null;
    ticketBox.replaceChildren(ticketCard(next));
    // kapak: sıradaki biletin afişi → en son etkinliğin afişi → gradyan (spec §7 önerisi)
    const withBanner = (att || []).filter((e) => e.bannerUrl).sort((a, b) => (eventStartMs(b) ?? 0) - (eventStartMs(a) ?? 0));
    setCover(next?.bannerUrl || withBanner[0]?.bannerUrl || null);

    // son aktiviteler (istemci tarafı birleştirme; gelecekteki zaman damgaları yok sayılır)
    const acts = [];
    const add = (ms, kind, text, href) => { if (ms != null && ms <= now + 60000) acts.push({ ms, kind, text, href }); };
    (att || []).forEach((e) => {
      const title = e.title || "Etkinlik";
      add(toMs(e._att?.joinedAt), "ticket", `${[title, e.venueName].filter(Boolean).join(" · ")} için bilet aldın`, "#/biletlerim");
      if (e._att?.ticketStatus === "used" || e._att?.checkedInAt) add(toMs(e._att?.checkedInAt), "check", `${title} etkinliğine katıldın`, "#/katildiklarim");
    });
    (rv || []).forEach((r) => {
      const target = r.targetName || r.venueName || r.artistName || "";
      const stars = Math.round(Number(r.overallRating ?? r.rating) || 0);
      if (target && stars) add(toMs(r.createdAt), "star", `${withSuffix(target, "dat", r._col === "venueReviews")} ${stars} yıldız verdin`, "#/yorumlarim");
    });
    (fe || []).forEach((f) => add(toMs(f.savedAt), "heart", `${withSuffix(f.title || "Etkinlik", "acc", true)} favorilere ekledin`, "#/favoriler?sekme=etkinlik"));
    (fv || []).forEach((f) => add(toMs(f.addedAt), "heart", `${withSuffix(f.venueName || "Mekan", "acc", true)} favorilere ekledin`, "#/favoriler?sekme=mekan"));
    (fol || []).forEach((f) => add(toMs(f.followedAt), "user", `${withSuffix(f.artistName || f.targetName || "Sanatçı", "acc")} takip etmeye başladın`, "#/takip"));
    acts.sort((a, b) => b.ms - a.ms);
    const top = acts.slice(0, 5);
    actList.replaceChildren(...(top.length ? top.map((a) => {
      const c = TONE[a.kind];
      return h("li", { class: "dk-profil-actli" },
        h("a", { href: a.href, class: "dk-profil-act dk-row" },
          h("span", { class: "dk-profil-actic", style: { color: c, borderColor: rgba(c, 0.35), background: rgba(c, 0.1) }, "aria-hidden": "true" }, svgPath(AI[a.kind], { size: 16, sw: "1.9" })),
          h("span", { class: "dk-profil-acttx" }, a.text),
          h("time", { class: "dk-profil-actt", datetime: new Date(a.ms).toISOString() }, actTime(a.ms))));
    }) : [h("li", { class: "dk-profil-actli" }, h("span", { class: "dk-profil-act is-empty" },
      att == null && fol == null && rv == null ? "Aktiviteler yüklenemedi." : "Henüz bir hareketin yok. Etkinliklere katıldıkça burada görünür."))]));
  }

  function ticketCard(e) {
    if (!e) {
      return h("div", { class: "dk-profil-tk is-empty" },
        h("span", { class: "dk-profil-tkb" },
          h("span", { class: "dk-profil-tkeb" }, "SIRADAKİ BİLETİN"),
          h("span", { class: "dk-profil-tkt" }, "Yaklaşan biletin yok"),
          h("span", { class: "dk-profil-tks" }, "Bir etkinliğe katıldığında biletin burada görünür."),
          dkButton("Etkinlikleri keşfet", { variant: "outline", size: 40, href: "#/etkinlikler", cls: "dk-profil-tkcta2" })));
    }
    const ms = eventStartMs(e);
    const today = ms != null && isToday(ms);
    const chipTx = ms == null ? "TARİH YAKINDA"
      : today ? `${new Date(ms).getHours() >= 17 ? "BU GECE" : "BUGÜN"} · ${fmtTime(ms)}`
        : `${trUpper(dayLabel(ms))} · ${fmtTime(ms)}`;
    const g = primaryGenre(e), fam = genreFamily(g);
    const media = e.bannerUrl
      ? h("img", { class: "dk-profil-tkimg", src: e.bannerUrl, alt: "", loading: "lazy", decoding: "async" })
      : h("span", { class: "dk-profil-tkimg is-ph", style: { background: `linear-gradient(150deg, ${fam.color}, ${fam.dark})` } });
    if (media.tagName === "IMG") media.addEventListener("error", () => media.replaceWith(h("span", { class: "dk-profil-tkimg is-ph", style: { background: `linear-gradient(150deg, ${fam.color}, ${fam.dark})` } })), { once: true });
    const title = [e.title || "Etkinlik", ms != null ? `${dayLabel(ms)} ${fmtTime(ms)}` : null].filter(Boolean).join(" · ");
    return h("a", { href: "#/biletlerim?bilet=" + encodeURIComponent(e.id), class: "dk-profil-tk dk-card", "aria-label": `Sıradaki biletin: ${title}. Bileti aç` },
      h("span", { class: "dk-profil-tkmedia" }, media, h("span", { class: cx("dk-profil-tkchip", !today && "is-later") }, chipTx)),
      h("span", { class: "dk-profil-tkb" },
        h("span", { class: "dk-profil-tkeb" }, "SIRADAKİ BİLETİN"),
        h("span", { class: "dk-profil-tkt" }, title),
        h("span", { class: "dk-profil-tks" }, [e.venueName || e.venue, "Kapıda QR göster"].filter(Boolean).join(" · ")),
        h("span", { class: "dk-profil-tkcta" }, svgRaw(P.qr, { size: 15, sw: "2" }), "Bileti aç")));
  }

  // ══════════ etkileşimler ══════════
  // Katılımlarda adımı gizle (legacy applyAnon: çift tık koruması, hata → geri al + "Kaydedilemedi")
  async function applyAnon(next, revert) {
    if (savingAnon) { revert(); return; }
    savingAnon = true;
    hideHint.textContent = next ? "Katılımcı listelerinde \"Gizli üye\" olarak görünürsün" : "Katılımcı listelerinde adın görünür";
    try {
      const ps = { ...(prof().privacySettings || {}), anonymousAttendance: next };
      await saveProfile(uid, { privacySettings: ps });
      if (session.profile) session.profile.privacySettings = ps;
      dkToast(next ? "Katılımlarda adın gizlenecek" : "Katılımlarda adın görünecek");
    } catch (_) {
      if (alive) { revert(); hideHint.textContent = !next ? "Katılımcı listelerinde \"Gizli üye\" olarak görünürsün" : "Katılımcı listelerinde adın görünür"; }
      dkToast("Kaydedilemedi", { type: "err" });
    } finally { savingAnon = false; }
  }

  // İlgi alanı türleri (YENİ users.favoriteGenres; iyimser, hata → geri al)
  let savingGenres = Promise.resolve();
  function toggleGenre(k) {
    const cur = Array.isArray(prof().favoriteGenres) ? prof().favoriteGenres.slice() : [];
    const on = pickedFamilies().has(k);
    const next = on ? cur.filter((g) => genreFamilyKey(g) !== k) : [...cur, GENRE_FAMILIES[k].label];
    const prev = cur;
    if (session.profile) session.profile.favoriteGenres = next;
    paintGenres();
    savingGenres = savingGenres.then(() => saveProfile(uid, { favoriteGenres: next })).catch(() => {
      if (session.profile) session.profile.favoriteGenres = prev;
      if (alive) paintGenres();
      dkToast("Kaydedilemedi", { type: "err" });
    });
  }

  // Fotoğraf: kırp (openImageCropper, yuvarlak) → Storage → photoURL
  let releaseCropper = null;
  fileInp.addEventListener("change", async () => {
    const picked = fileInp.files?.[0] || null;
    fileInp.value = "";
    if (!picked) return;
    if (picked.type && !picked.type.startsWith("image/")) { dkToast("Yüklenemedi", { type: "err" }); return; }
    releaseCropper = cropperA11y(fileInp);
    const blob = await openImageCropper(picked, { aspect: 1, round: true }).catch(() => null);
    releaseCropper?.(); releaseCropper = null;
    if (!blob || !alive) return;
    camera.classList.add("is-busy"); camera.setAttribute("aria-busy", "true");
    try {
      const file = new File([blob], "profil.jpg", { type: blob.type || "image/jpeg" });
      const url = await uploadImage(file, uid);
      await saveProfile(uid, { photoURL: url });
      await refreshProfile();
      dkToast("Fotoğraf güncellendi");
    } catch (_) { dkToast("Yüklenemedi", { type: "err" }); }
    finally { camera.classList.remove("is-busy"); camera.removeAttribute("aria-busy"); }
  });
  function photoLightbox(url, name) {
    dkModal({ title: "Profil fotoğrafı", size: 520, cls: "dk-profil dk-profil-mdl",
      body: h("img", { class: "dk-profil-lbimg", src: url, alt: `${name} profil fotoğrafı` }) });
  }

  // ── Ad ──
  function openName() {
    const p = prof(), cur = nameOf(p);
    const lock = nameLock(p);
    if (lock) { dkToast(`${fmtLongDate(lock.until)} tarihinde değiştirebilirsin`, { type: "err" }); return; }
    const inp = dkInput({ id: "dk-profil-name-in", value: cur, maxlength: 40, placeholder: "Yeni adın", bg: "void", autocomplete: "name" });
    const st = statusLine();
    inp.setAttribute("aria-describedby", "dk-profil-name-st"); st.id = "dk-profil-name-st";
    let edited = false;
    const validate = () => {
      const v = inp.value.trim();
      const err = !v ? "Yeni ad gir" : v === cur ? "Ad zaten aynı" : "";
      setStatus(st, err || "Bu ad yorumlarında ve katılımlarında görünür.", err ? "err" : "");
      inp.style.borderColor = err && edited ? "rgba(255,90,110,0.6)" : "";
      if (m.buttons[1]) m.buttons[1].setAttribute("aria-disabled", err ? "true" : "false");
      return !err;
    };
    const m = dkModal({
      title: "Adımı Değiştir", size: 460, cls: "dk-profil dk-profil-mdl",
      body: h("div", { class: "dk-profil-mb", style: { gap: "14px" } },
        h("p", { class: "dk-profil-mp" }, "Adını 30 günde bir değiştirebilirsin."),
        h("span", { class: "dk-profil-mcur" }, "Mevcut ad: ", h("b", {}, cur)),
        dkLabel("YENİ AD", { for: inp.id }), inp, st),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Kaydet", variant: "primary", icon: svgRaw(P.check, { size: 15, sw: "2.4" }), onClick: async (close, btn) => save(close, btn) },
      ],
    });
    inp.addEventListener("input", () => { edited = true; validate(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } });
    validate();
    async function save(close, btn) {
      edited = true;
      if (!validate()) { inp.focus(); return false; }
      const nn = inp.value.trim();
      const lk = nameLock(prof());   // legacy: kaydetmeden önce cooldown tekrar kontrol
      if (lk) { setStatus(st, `${fmtLongDate(lk.until)} tarihinde değiştirebilirsin`, "err"); return false; }
      btn.disabled = true;
      try {
        await saveProfile(uid, { displayName: nn, displayNameChangedAt: serverTimestamp() });
        await refreshProfile();
        dkToast("Adın güncellendi");
        return true;
      } catch (err) {
        btn.disabled = false;
        // Kural reddi: ad başka cihazda değişmiş olabilir (yerel profil bayat) → profili tazele, GERÇEK damgadan tarih hesapla.
        // Damga yoksa (başka bir kural nedeni) tarih uydurulmaz → "Kaydedilemedi".
        const denied = String(err?.code || "").includes("permission-denied");
        if (denied) { try { await refreshProfile(); } catch (_) {} }
        const lk2 = denied ? nameLock(prof()) : null;
        setStatus(st, lk2 ? `${fmtLongDate(lk2.until)} tarihinde değiştirebilirsin` : "Kaydedilemedi", "err");
        return false;
      }
    }
  }

  // ── E-posta (auth.changeEmailModal akışı) ──
  function openEmail() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) {
      dkModal({ title: "E-posta Değiştir", size: 460, cls: "dk-profil dk-profil-mdl",
        body: h("p", { class: "dk-profil-mp" }, "Google ile giriş yaptığın için e-posta adresin Google hesabına bağlıdır ve buradan değiştirilemez. E-postanı Google hesap ayarlarından güncelleyebilirsin."),
        actions: [{ label: "Kapat", variant: "outline" }] });
      return;
    }
    const cur = dkInput({ id: "dk-profil-ce1", type: "password", placeholder: "••••••••", bg: "void", autocomplete: "current-password" });
    const nw = dkInput({ id: "dk-profil-ce2", type: "email", placeholder: "ornek@eposta.com", bg: "void", autocomplete: "email" });
    const st = statusLine("is-empty-hide");
    const m = dkModal({
      title: "E-posta Değiştir", size: 460, cls: "dk-profil dk-profil-mdl",
      body: h("div", { class: "dk-profil-mb", style: { gap: "10px" } },
        h("p", { class: "dk-profil-mp", style: { margin: "0 0 4px" } }, "Yeni adresine bir doğrulama bağlantısı gönderilir; onaylayınca e-postan değişir."),
        dkLabel("MEVCUT ŞİFRE", { for: cur.id }), cur,
        dkLabel("YENİ E-POSTA", { for: nw.id, cls: "dk-profil-lbl2" }), nw, st),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Kaydet", variant: "primary", icon: svgRaw(P.check, { size: 15, sw: "2.4" }), busyLabel: "Gönderiliyor…", onClick: async () => {
          setStatus(st, "", "");
          const pw = cur.value, em = nw.value.trim();
          if (!pw) { setStatus(st, "Mevcut şifreni gir.", "err"); cur.focus(); return false; }
          if (!em) { setStatus(st, "Yeni e-posta gir.", "err"); nw.focus(); return false; }
          if (em.toLowerCase() === (user?.email || "").toLowerCase()) { setStatus(st, "Yeni e-posta mevcut adresinle aynı.", "err"); nw.focus(); return false; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
            await verifyBeforeUpdateEmail(user, em);
            dkToast("Doğrulama bağlantısı yeni adresine gönderildi");
            return true;
          } catch (err) { setStatus(st, trError(err && err.code), "err"); return false; }
        } },
      ],
    });
    [cur, nw].forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } }));
  }

  // ── Şifre (auth.changePasswordModal akışı + "E-posta ile sıfırla") ──
  function openPass() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) {
      dkModal({ title: "Şifre Değiştir", size: 460, cls: "dk-profil dk-profil-mdl",
        body: h("p", { class: "dk-profil-mp" }, "Google ile giriş yaptığın için hesabında parola yok; şifren Google hesabına bağlıdır ve buradan değiştirilemez. Şifreni Google hesap ayarlarından güncelleyebilirsin."),
        actions: [{ label: "Kapat", variant: "outline" }] });
      return;
    }
    const cur = dkInput({ id: "dk-profil-cp1", type: "password", bg: "void", autocomplete: "current-password" });
    const nw = dkInput({ id: "dk-profil-cp2", type: "password", placeholder: "En az 6 karakter", bg: "void", autocomplete: "new-password" });
    const nw2 = dkInput({ id: "dk-profil-cp3", type: "password", bg: "void", autocomplete: "new-password" });
    const st = statusLine("is-empty-hide");
    const reset = h("button", { type: "button", class: "dk-profil-reset" }, "E-posta ile sıfırla");
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
      title: "Şifre Değiştir", size: 460, cls: "dk-profil dk-profil-mdl",
      body: h("div", { class: "dk-profil-mb", style: { gap: "10px" } },
        dkLabel("MEVCUT ŞİFRE", { for: cur.id }), cur,
        dkLabel("YENİ ŞİFRE", { for: nw.id, cls: "dk-profil-lbl2" }), nw,
        dkLabel("YENİ ŞİFRE (TEKRAR)", { for: nw2.id, cls: "dk-profil-lbl2" }), nw2,
        st,
        h("p", { class: "dk-profil-mfoot" }, "Mevcut şifreni bilmiyor musun? ", reset)),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Kaydet", variant: "primary", icon: svgRaw(P.check, { size: 15, sw: "2.4" }), busyLabel: "Güncelleniyor…", onClick: async () => {
          setStatus(st, "", "");
          if (!cur.value) { setStatus(st, "Mevcut şifreni gir.", "err"); cur.focus(); return false; }
          if (nw.value.length < 6) { setStatus(st, "Yeni şifre en az 6 karakter olmalı.", "err"); nw.focus(); return false; }
          if (nw.value !== nw2.value) { setStatus(st, "Yeni şifreler uyuşmuyor.", "err"); nw2.focus(); return false; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur.value));
            await updatePassword(user, nw.value);
            dkToast("Şifren güncellendi");
            return true;
          } catch (err) { setStatus(st, trError(err && err.code), "err"); return false; }
        } },
      ],
    });
    [cur, nw, nw2].forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } }));
  }

  // ── Şehir (81 il + Konumumu kullan) ──
  function openCity() {
    const curCity = prof().city || "";
    const q = h("input", { type: "search", class: "dk-profil-cq", "aria-label": "İl ara", placeholder: "İl ara (örn. Aydın)...", autocomplete: "off", spellcheck: "false" });
    const list = h("div", { class: "dk-profil-clist dk-scroll", role: "group", "aria-label": "İller" });
    const none = h("span", { class: "dk-profil-cnone", hidden: true }, "Eşleşen il yok.");
    let busy = false;
    const draw = () => {
      const f = fold(q.value.trim());
      const names = PROVINCES.filter((c) => !f || fold(c).includes(f));
      list.replaceChildren(...names.map((c) => {
        const on = fold(c) === fold(curCity);
        const b = h("button", { type: "button", class: cx("dk-profil-city dk-press", on && "is-on"), "aria-pressed": on ? "true" : "false" }, c);
        b.addEventListener("click", () => pick(c));
        return b;
      }));
      list.hidden = !names.length;
      none.hidden = !!names.length;
    };
    const loc = h("button", { type: "button", class: "dk-profil-loc dk-press" }, svgRaw(P.nav, { size: 16, sw: "2" }), "Konumumu kullan");
    loc.addEventListener("click", async () => {
      if (busy) return;
      loc.disabled = true;
      try { const c = await locateCity(); if (c) await pick(c); } finally { if (loc.isConnected) loc.disabled = false; }
    });
    const m = dkModal({
      title: "Şehir Seç", size: 460, cls: "dk-profil dk-profil-mdl",
      body: h("div", { class: "dk-profil-mb", style: { gap: "12px" } },
        loc,
        h("label", { class: "dk-profil-csearch" }, svgRaw(P.search, { size: 15, sw: "2", color: "#8A8E97" }), q),
        list, none),
      initialFocus: q,
    });
    q.addEventListener("input", draw);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); list.querySelector("button")?.click(); } });
    draw();
    const sel = list.querySelector(".is-on");   // mevcut il görünür olsun (liste 232 px'te kayar)
    if (sel) list.scrollTop = Math.max(0, sel.offsetTop - list.offsetTop - 96);
    async function pick(c) {
      if (busy) return;
      busy = true;
      try {
        await saveProfile(uid, { city: c });
        // "Keşfet ve Harita bu şehre göre açılır": header şehir seçicisinin kaynağı (gb_city) da güncellenir
        setActiveCity(c);
        window.dispatchEvent(new CustomEvent(CITY_EVENT, { detail: { city: c } }));
        await refreshProfile();
        dkToast(c + " kaydedildi");
        m.close();
      } catch (_) { dkToast("Kaydedilemedi", { type: "err" }); }
      finally { busy = false; }
    }
  }

  // ── Hesabı sil (3 ay yumuşak silme; auth.deleteAccountModal ile aynı metin + akış) ──
  function openDelete() {
    dkModal({
      title: "Hesabımı Sil", size: 460, cls: "dk-profil dk-profil-mdl",
      body: h("div", { class: "dk-profil-mb", style: { gap: "10px" } },
        h("p", { class: "dk-profil-mp" }, "Hesabın silinmek üzere işaretlenecek. 3 ay boyunca profilin ve içeriklerin görünür kalır."),
        h("p", { class: "dk-profil-mp" }, "Bu süre içinde tekrar giriş yaparsan silme talebin otomatik iptal edilir. 3 ay boyunca hiç giriş yapmazsan hesabın ve tüm verilerin kalıcı olarak silinir."),
        h("a", { href: "hesap-sil.html", class: "dk-profil-mlink" }, "Hesap silme hakkında ayrıntılar")),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Hesabımı Sil", variant: "danger", icon: svgRaw(P.trash, { size: 16, sw: "1.9" }), busyLabel: "İşleniyor…", onClick: async () => {
          // scheduleAccountDeletion çıkış yapar → router kimlik değişiminde "dk:teardown identity" ile açık toast'u kapatır.
          // Onay toast'u bu yüzden kimlik yıkımından SONRA (yeni görünüm kurulurken) gösterilir; yıkım gelmezse 5 sn yedek.
          // SHARED-CANDIDATE: dkToast'a kimlik yıkımından sağ çıkan (persist) seçenek eklenmeli.
          const confirmAfterLogout = armLogoutToast("Hesabın silinmek üzere işaretlendi. 3 ay içinde giriş yaparsan geri alınır.");
          try {
            await scheduleAccountDeletion();
            location.hash = "#/";
            confirmAfterLogout();
            return true;
          } catch (_) {
            confirmAfterLogout.cancel();
            dkToast("İşlem başarısız. İnternetini kontrol edip tekrar dene.", { type: "err" });
            return false;
          }
        } },
      ],
    });
  }

  // SHARED-CANDIDATE: accountShell/publicHeader'da kimlik (ad + foto) güncelleme API'si yok (setIdentity). Ad/foto değişince
  // yeniden kurmak kaydırmayı sıfırlıyor → kabuğun kendi düğümlerinde yerel yama.
  function patchShellIdentity() {
    const p = prof(), name = nameOf(p);
    const idAv = shell.aside?.querySelector(".dk-acc-id > .dk-av");
    if (idAv) idAv.replaceWith(dkAvatar({ name, photo: p.photoURL, size: 56, type: "customer", border: true, alt: name }));
    const nm = shell.aside?.querySelector(".dk-acc-name"); if (nm) nm.textContent = name;
    const hav = shell.header?.node?.querySelector(".dk-hd-av");
    if (hav) { hav.setAttribute("aria-label", `Hesabım: ${name}`); hav.replaceChildren(dkAvatar({ name, photo: p.photoURL, size: 40, type: "customer", border: false })); }
  }

  paintProfile();
  loadData();

  return {
    node: shell.node,
    onSession(sess) {
      if (!alive || !sess?.user || sess.guest || sess.user.uid !== uid) return false;
      const p = sess.profile || {};
      const nm = p.displayName || sess.user.displayName || "Müşteri", ph = p.photoURL || null;
      if (nm !== lastName || ph !== lastPhoto) { lastName = nm; lastPhoto = ph; patchShellIdentity(); }
      paintProfile();
      return true;
    },
    destroy() {
      alive = false;
      releaseCropper?.(); releaseCropper = null;
      shell.destroy();
    },
  };
}
