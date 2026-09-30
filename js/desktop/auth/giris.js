// WebGiris — masaüstü giriş (≥769 px). İki yüzey, aynı form:
//   1) GİRİŞ MODALI — openLoginModal(): herkese açık sayfalarda (PublicHeader "Giriş yap", dkLoginGate) sayfa değişmeden açılır.
//      Artboard: WebGiris (440 px, prizma çubuğu, karartma rgba(6,7,10,.74) + blur(5px), arka sayfa saturate(.7)).
//   2) TAM SAYFA — girisView(ctx) → #/login (AuthSplit; artboard'da çizilmedi, spec auth §3b'den türetildi).
// Spec: specs/auth.md WebGiris (+ §0 ortak tanımlar). CSS: css/dk-giris.css (modal portalda açıldığı için openLoginModal
// dosyayı kendisi yükler). ≤768 px: legacy login()/loginModal() AYNEN (router bu modülü mobilde yüklemez; openLoginModal
// mobilde çağrılırsa legacy loginModal'a düşer).
//
// Akış legacy auth.js ile birebir: signInWithEmailAndPassword + trError(); "Şifremi unuttum" → reCAPTCHA v3 token +
// sendPasswordReset callable (yedek: Firebase sendPasswordResetEmail); Google → signInWithPopup (iptal sessiz). Başarıda
// yönlendirmeyi router yapar (onAuthStateChanged → homeRouteFor; profil yoksa #/setup).
//
// Bu dosya ayrıca kayit.js + rol-sec.js'in kullandığı ortak auth yardımcılarını dışa aktarır (trError, Google girişi,
// ROLE_META, durum bölgesi, radyo grubu klavyesi). SHARED-CANDIDATE: legacy auth.js bu fonksiyonları dışa aktarmıyor
// (trError/requestPasswordReset/recaptchaToken/googleBtn iç fonksiyon) → burada birebir kopya; foundation isterse
// ortak bir auth-core modülüne taşınabilir.
import { h } from "../../ui.js";
import {
  auth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendPasswordResetEmail, sendPasswordResetMail,
} from "../../firebase.js";
import { isDesktop } from "../../viewport.js";
import { ensureCssAll } from "../css.js";
import { svgIcon, svgRaw, svgPath } from "../shared/icons.js";
import { uid, dkLogo, dkLabel, dkInput, dkPasswordInput, dkButton, dkInlineMessage, dkOrDivider, dkModal } from "../shared/ui.js";
import { authSplit, authTopLink, authHeading, authGoogleButton } from "../shared/auth-shell.js";

// ══════════════════════════════════════════════════════════════════════
// ORTAK AUTH YARDIMCILARI (kayit.js / rol-sec.js de kullanır)
// ══════════════════════════════════════════════════════════════════════

// legacy auth.js trError() — birebir
export function trError(code) {
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

// Google ile giriş (legacy googleBtn akışı): popup; kullanıcı iptali sessiz; hata metinleri legacy ile aynı.
// Dönüş: { ok: true } | { cancelled: true } | { error: "metin" }
const POPUP_CANCEL = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);
export function googleErrorText(code) {
  return code === "auth/unauthorized-domain"
    ? "Bu alan Google girişine yetkili değil. Firebase → Authentication → Settings → Authorized domains'e alan adını ekleyin."
    : code === "auth/popup-blocked"
      ? "Tarayıcı pop-up'ı engelledi. Adres çubuğundaki pop-up iznini verip tekrar deneyin."
      : "Google ile giriş başarısız. Tekrar deneyin.";
}
export async function googleSignIn() {
  // POPUP (legacy notu): özel alan adında signInWithRedirect getRedirectResult'ı null döndürüyordu → popup.
  // Başarılı → onAuthStateChanged router'ı tetikler (yeni kullanıcı → #/setup).
  try { await signInWithPopup(auth, new GoogleAuthProvider()); return { ok: true }; }
  catch (err) {
    const code = err && err.code;
    if (POPUP_CANCEL.has(code)) return { cancelled: true };
    return { error: googleErrorText(code) };
  }
}

// Şifre sıfırlama (legacy requestPasswordReset — birebir): önce özel e-posta (callable sendPasswordReset), yalnız altyapı
// hatasında Firebase'in yerleşik e-postasına düş; kullanıcı hataları + rate-limit fırlatılır (limit baypas edilmesin).
export async function requestPasswordReset(email, recaptchaToken) {
  try {
    await sendPasswordResetMail({ email, recaptchaToken });
  } catch (err) {
    const code = err && err.code;
    if (code === "functions/invalid-argument" || code === "invalid-argument" ||
        code === "functions/resource-exhausted" || code === "resource-exhausted") throw err;
    await sendPasswordResetEmail(auth, email);
  }
}

// reCAPTCHA v3 (legacy ile aynı PUBLIC site anahtarı; yalnız gerektiğinde yüklenir). Token alınamazsa null → backend
// rate-limit'e güvenir (meşru kullanıcı engellenmez). EK: 8 sn zaman aşımı (betik takılırsa "Gönderiliyor…" asılı
// kalmasın) + yerel emülatörde hiç yüklenmez — üretim site anahtarı localhost'ta geçersiz. Emülatör tespiti DOM ile
// taklit edilemeyen auth.emulatorConfig'ten (yalnız connectAuthEmulator sonrası dolu) + yerel ana makineden; global
// window.__gbEmu'ya bakılmaz (id="__gbEmu" öğesiyle DOM clobbering → üretimde reCAPTCHA atlanmasın).
const isLocalEmulator = () => {
  const host = location.hostname;
  return (host === "127.0.0.1" || host === "localhost") && !!(auth && auth.emulatorConfig);
};
const RECAPTCHA_SITE_KEY = "6LeW9kctAAAAAIDWQ9SCMngGL7OcHMqIl_H90db5";
let _grecaptcha = null;
function loadRecaptcha() {
  if (_grecaptcha) return _grecaptcha;
  _grecaptcha = new Promise((resolve, reject) => {
    if (window.grecaptcha && window.grecaptcha.execute) return resolve(window.grecaptcha);
    const s = document.createElement("script");
    s.src = "https://www.google.com/recaptcha/api.js?render=" + RECAPTCHA_SITE_KEY;
    s.async = true; s.defer = true;
    s.onload = () => resolve(window.grecaptcha);
    s.onerror = (e) => { _grecaptcha = null; reject(e); };
    document.head.append(s);
  });
  return _grecaptcha;
}
export async function recaptchaToken(action, { timeout = 8000 } = {}) {
  if (isLocalEmulator()) return null;
  const run = (async () => {
    const g = await loadRecaptcha();
    await new Promise((r) => g.ready(r));
    return await g.execute(RECAPTCHA_SITE_KEY, { action });
  })();
  let t;
  try { return await Promise.race([run, new Promise((r) => { t = setTimeout(() => r(null), timeout); })]); }
  catch { return null; }
  finally { clearTimeout(t); }
}

// Rol tablosu (WebKayit/WebRolSec DCLogic ROLES — birebir). rgb: rgba() tonları için.
export const ROLE_KEYS = ["customer", "artist", "venue", "organizer"];
export const ROLE_META = {
  customer: { key: "customer", label: "Dinleyici", desc: "Etkinlikleri keşfet, sanatçıları takip et", c: "#4ED8FF", rgb: "78,216,255", approval: false, city: false,
    nameLabel: "Ad Soyad", namePh: "Adın ve soyadın", nameErr: "Adını gir.", next: "#/kesfet", nextText: "Keşfetmeye başla",
    icon: "M4 15v-3a8 8 0 0 1 16 0v3M4 15.5A1.5 1.5 0 0 1 5.5 14h1A1.5 1.5 0 0 1 8 15.5v3A1.5 1.5 0 0 1 6.5 20h-1A1.5 1.5 0 0 1 4 18.5zM16 15.5a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5z" },
  artist: { key: "artist", label: "Sanatçı", desc: "Profilini oluştur, mekanlardan teklif al", c: "#FF4FA3", rgb: "255,79,163", approval: false, city: true,
    nameLabel: "Sanatçı adı", namePh: "Sahne adın", nameErr: "Sanatçı adını gir.", next: "#/artist", nextText: "Sanatçı Paneline git",
    icon: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" },
  venue: { key: "venue", label: "Mekan", desc: "Sanatçıları bul, etkinlik planla", c: "#FF8A2A", rgb: "255,138,42", approval: true, city: true,
    nameLabel: "Mekan adı", namePh: "Örn. Babylon Club", nameErr: "Mekan adını gir.", next: "#/pending", nextText: "Başvuru durumunu gör",
    icon: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3" },
  organizer: { key: "organizer", label: "Organizatör", desc: "Ekip kur, etkinlik yönet, mekanlarla çalış", c: "#FF4FA3", rgb: "255,79,163", approval: true, city: false,
    nameLabel: "Organizasyon adı", namePh: "Organizasyonunun adı", nameErr: "Organizasyon adını gir.", next: "#/pending", nextText: "Başvuru durumunu gör",
    icon: "M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V6.5A1.5 1.5 0 0 1 5 5zM3.5 10h17M8 3v4M16 3v4" },
};
export const roleIcon = (key, size = 20, sw = "1.9") => svgPath(ROLE_META[key].icon, { size, sw });
// Rol tonları CSS değişkeni olarak (öğe başına): --rc (düz renk), --rc-rgb ("r,g,b" → rgba(var(--rc-rgb), a))
export const roleVars = (key) => ({ "--rc": ROLE_META[key].c, "--rc-rgb": ROLE_META[key].rgb });
// Kayıttan Google ile devam edilirse seçilen rol WebRolSec'e taşınır (spec auth WebKayit §6). sessionStorage değeri
// JSON { r: rol, t: ms } — bayat kalmasın diye: iptal/hata ve giriş formundaki Google akışı temizler, 30 dk sonra yok sayılır.
export const PENDING_ROLE_KEY = "gb_pending_role";
const PENDING_ROLE_TTL = 30 * 60 * 1000;
export function setPendingRole(role) {
  try { sessionStorage.setItem(PENDING_ROLE_KEY, JSON.stringify({ r: role, t: Date.now() })); } catch (_) {}
}
export function clearPendingRole() {
  try { sessionStorage.removeItem(PENDING_ROLE_KEY); } catch (_) {}
}
export function readPendingRole() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PENDING_ROLE_KEY) || "null");
    const fresh = v && typeof v.t === "number" && Math.abs(Date.now() - v.t) < PENDING_ROLE_TTL;
    if (fresh && ROLE_KEYS.includes(v.r)) return v.r;
    if (v) clearPendingRole();
  } catch (_) { clearPendingRole(); }
  return null;
}

// Sunucu hatası sonrası odak: meşgul düğme `disabled` olunca odak <body>'ye düşer (legacy'de de). Odak hâlâ formdaysa
// dokunma (Enter ile alandan gönderim); düşmüşse ilgili alana/düğmeye geri ver.
export function refocusIfLost(scope, target) {
  const a = document.activeElement;
  if (!target || !target.isConnected || (a && a !== document.body && scope.contains(a))) return;
  try { target.focus(); } catch (_) {}
}

// Yönetici onayı notu kalkanı (WebKayit/WebRolSec: shield + check, 16, stroke 2)
export const shieldCheckIcon = (size = 16, color) => svgRaw('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"></path><path d="m9 12 2.2 2.2L15.5 10"></path>', { size, sw: "2", color });

// Her zaman DOM'da duran canlı durum bölgesi (artboard: boşken de bir flex boşluğu kaplar) + InlineMessage
export function statusRegion(cls) {
  const node = h("div", { class: cls, role: "status", "aria-live": "polite" });
  let kind = null;
  return {
    node,
    get kind() { return kind; },
    set(k, text, opts) { kind = k; node.replaceChildren(dkInlineMessage(k, text, opts)); },
    clear() { kind = null; node.replaceChildren(); },
  };
}

// role="radiogroup" klavyesi (WAI-ARIA radio deseni): gezici tabindex, ←/↑ önceki, →/↓ sonraki, Home/End; seçim odakla birlikte.
export function wireRadioGroup(buttons, onPick) {
  const sync = () => {
    const i = buttons.findIndex((b) => b.getAttribute("aria-checked") === "true");
    buttons.forEach((b, j) => b.setAttribute("tabindex", j === (i < 0 ? 0 : i) ? "0" : "-1"));
  };
  buttons.forEach((b, i) => b.addEventListener("keydown", (e) => {
    const n = buttons.length;
    let to = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (i - 1 + n) % n;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = n - 1;
    if (to == null) return;
    e.preventDefault();
    onPick(to);
    buttons[to].focus();
  }));
  sync();
  return sync;
}

// ══════════════════════════════════════════════════════════════════════
// GİRİŞ FORMU (modal + #/login aynı içerik) — artboard WebGiris form bloğu
// ══════════════════════════════════════════════════════════════════════
function recaptchaNote() {
  const a = (href, t) => h("a", { href, target: "_blank", rel: "noopener", class: "dk-giris-rc-a" }, t);
  return h("p", { class: "dk-giris-rc" }, "Bu site reCAPTCHA ile korunur; Google ",
    a("https://policies.google.com/privacy", "Gizlilik"), " ve ", a("https://policies.google.com/terms", "Şartlar"), " geçerlidir.");
}

function loginForm({ prefix, onSuccess }) {
  const ids = { email: uid(prefix + "-email"), pass: uid(prefix + "-pass") };
  let alive = true, busy = false, sending = false, gBusy = false;
  const emailInp = dkInput({ id: ids.email, type: "email", autocomplete: "email", placeholder: "ornek@email.com" });
  const pw = dkPasswordInput({ id: ids.pass, autocomplete: "current-password", placeholder: "Şifrenizi girin" });
  const passInp = pw.input;
  const status = statusRegion("dk-giris-status");
  const forgotBtn = h("button", { type: "button", class: "dk-giris-forgot dk-press" }, "Şifremi unuttum");
  const submitBtn = dkButton("Giriş yap", { variant: "primary", size: 48, full: true, type: "submit", busyLabel: "Giriş yapılıyor…" });
  const gBtn = authGoogleButton("Google ile devam et", () => onGoogle());

  // Hata varken İKİ alan da kırmızı kenar (artboard inBd); e-posta aria-invalid (artboard emailInvalid)
  const setMsg = (kind, text, opts) => {
    if (!alive) return;
    if (kind) status.set(kind, text, opts); else status.clear();
    const bad = kind === "err";
    if (bad) emailInp.setAttribute("aria-invalid", "true"); else emailInp.removeAttribute("aria-invalid");
    passInp.classList.toggle("dk-giris-bad", bad);
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    const email = emailInp.value.trim();
    const pass = passInp.value;
    if (!email || !pass) { setMsg("err", "E-posta ve şifre gir."); return; }
    busy = true; submitBtn.dk.setBusy(true, "Giriş yapılıyor…");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      onSuccess?.(); // router yönlendirir (onAuthStateChanged)
    } catch (err) {
      busy = false;
      if (!alive) return;
      submitBtn.dk.setBusy(false);
      const code = err && err.code;
      setMsg("err", trError(code));
      refocusIfLost(form, code === "auth/wrong-password" ? passInp : emailInp);
    }
  }

  // Şifremi unuttum — e-posta alanındaki adrese sıfırlama bağlantısı
  async function onForgot() {
    if (sending) return;
    setMsg(null);
    const email = emailInp.value.trim();
    if (!email) { setMsg("err", "Önce e-posta adresini gir."); emailInp.focus(); return; }
    sending = true;
    forgotBtn.textContent = "Gönderiliyor…";
    forgotBtn.setAttribute("aria-disabled", "true");
    try {
      const rc = await recaptchaToken("password_reset");
      await requestPasswordReset(email, rc);
      setMsg("ok", "Şifre sıfırlama bağlantısı e-postana gönderildi.", { icon: "mail" });
    } catch (err) {
      setMsg("err", trError(err && err.code));
    } finally {
      sending = false;
      if (alive) { forgotBtn.textContent = "Şifremi unuttum"; forgotBtn.removeAttribute("aria-disabled"); }
    }
  }
  forgotBtn.addEventListener("click", onForgot);

  async function onGoogle() {
    if (gBusy) return;
    gBusy = true; gBtn.disabled = true;
    setMsg(null);
    clearPendingRole(); // kayıt akışından kalmış rol, girişten açılan yeni Google hesabına taşınmasın
    const r = await googleSignIn();
    gBusy = false;
    if (!alive) return;
    if (r.ok) { onSuccess?.(); return; }
    gBtn.disabled = false;
    if (r.error) setMsg("err", r.error);
    refocusIfLost(form, gBtn);
  }

  const form = h("form", { class: "dk-giris-form", "aria-label": "Giriş formu", novalidate: true, onsubmit: onSubmit },
    h("div", { class: "dk-giris-fld" }, dkLabel("E-posta", { for: ids.email }), emailInp),
    h("div", { class: "dk-giris-fld" },
      h("div", { class: "dk-giris-lrow" }, dkLabel("Şifre", { for: ids.pass }), forgotBtn),
      pw),
    status.node,
    submitBtn,
    dkOrDivider(),
    gBtn);
  return { form, emailInp, destroy() { alive = false; } };
}

// ══════════════════════════════════════════════════════════════════════
// 1) MODAL — openLoginModal() (PublicHeader "Giriş yap" + dkLoginGate → overlays.openLogin)
// dkModal üzerine kurulu (belge düzeyi ESC + odak tuzağı, #app inert, kaydırma kilidi, odağı tetikleyiciye geri verme,
// rota/mod değişiminde kapanma); görünüm WebGiris artboard'u (440, prizma, logo satırı + kapat, 48'lik serif başlık).
// ══════════════════════════════════════════════════════════════════════
let _modal = null;
export async function openLoginModal() {
  if (!isDesktop()) {
    const { loginModal } = await import("../../pages/auth.js");
    return loginModal();
  }
  if (_modal) { try { _modal.focus(); } catch (_) {} return _modal.api; }
  await ensureCssAll(["css/dk-base.css", "css/dk-ui.css", "css/dk-giris.css"]);
  if (_modal) return _modal.api;

  const tId = uid("gm-title"), sId = uid("gm-sub");
  let m = null;
  const close = (reason) => m && m.close(reason);
  const lf = loginForm({ prefix: "gm", onSuccess: () => close("success") });
  const xBtn = h("button", { type: "button", class: "dk-giris-x dk-press", "aria-label": "Kapat", onclick: () => close("x") }, svgIcon("x", { size: 18, sw: "2" }));
  const toRegister = h("a", { href: "#/register", class: "dk-giris-mfoot-a", onclick: (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // yeni sekme: modal açık kalsın
    close("register"); // kapat → hash değişimi #/register (WebKayit sayfası; masaüstünde kayıt modalı yok)
  } }, "Hesap oluştur");
  const body = h("div", { class: "dk-giris-mb" },
    h("div", { class: "dk-giris-mhead" }, dkLogo({ href: null, cls: "dk-giris-mlogo" }), xBtn),
    h("div", { class: "dk-giris-mtitle" },
      h("h1", { id: tId, class: "dk-display dk-t48" }, "Hoş ", h("em", {}, "geldin")),
      h("p", { id: sId, class: "dk-giris-msub" }, "Biletlerine, takip ettiklerine ve mesajlarına ulaşmak için hesabına giriş yap.")),
    lf.form,
    recaptchaNote(),
    h("div", { class: "dk-giris-mfoot" }, "Hesabın yok mu?", toRegister));

  m = dkModal({
    variant: "confirm", role: "dialog", title: "", size: 440, cls: "dk-giris-modal", body,
    initialFocus: lf.emailInp,
    onClose: () => { lf.destroy(); if (_modal && _modal.api === m) _modal = null; },
  });
  // dkModal'ın boş başlığı yerine artboard başlığı (h1#gm-title) + açıklama (p#gm-sub)
  m.dialog.querySelector(":scope > .dk-mdl-t")?.remove();
  m.dialog.setAttribute("aria-labelledby", tId);
  m.dialog.setAttribute("aria-describedby", sId);
  m.dialog.prepend(h("span", { class: "dk-giris-prism dk-prism", "aria-hidden": "true" }));
  m.node.classList.add("dk-giris-ovl");
  _modal = { api: m, focus: () => lf.emailInp.focus() };
  return m;
}

// ══════════════════════════════════════════════════════════════════════
// 2) TAM SAYFA — #/login (AuthSplit; spec auth §3b: aside varsayılan/caz görseli, üst satır "Keşfet'e dön" +
// "Hesabın yok mu? Hesap oluştur", kolon 400 / boşluk 20: başlık + form + reCAPTCHA notu; modal logo satırı ve alt satırı yok)
// ══════════════════════════════════════════════════════════════════════
export function girisView(/* ctx */) {
  const lf = loginForm({ prefix: "gl" });
  const right = h("span", { class: "dk-giris-topr" }, "Hesabın yok mu? ", h("a", { href: "#/register", class: "dk-giris-topr-a" }, "Hesap oluştur"));
  const s = authSplit({
    variant: "default",
    top: { left: authTopLink("Keşfet'e dön", { href: "#/kesfet" }), right },
    width: 400, gap: 20,
    children: [
      authHeading({ title: "Hoş ", em: "geldin", lead: "Biletlerine, takip ettiklerine ve mesajlarına ulaşmak için hesabına giriş yap." }),
      lf.form,
      recaptchaNote(),
    ],
  });
  s.column.classList.add("dk-giris");
  return {
    node: s.node,
    destroy() { lf.destroy(); s.destroy(); },
    update() {},              // sorgu yok — ?… değişiminde yeniden kurma (yazılan değerler kalsın)
    onSession: () => true,    // aynı kimlikte oturum yayını: formu koru
  };
}
