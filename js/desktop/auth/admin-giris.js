// WebAdminGiris — "Yönetici girişi" masaüstü görünümü (≥769 px). Registry anahtarı: admingiris (#/yonetici).
// Spec: specs/auth.md WebAdminGiris (+ §0 AuthSplit, admin varyantı). Artboard: design/WebAdminGiris.dc.html.
// CSS: css/dk-admin-giris.css (.dk-admin-giris kökü = AuthColumn). Legacy karşılığı: js/pages/auth.js adminLogin() (≤768 aynen kalır).
//
// Legacy özellikleri (korundu): e-posta + şifre girişi → computeIsAdmin (owner e-postası / adminUids) → yöneticiyse #/admin;
// değilse "Bu hesap yönetici değil."; Google ile giriş (popup) → değilse "Bu Google hesabı yönetici değil."; boş alan "E-posta ve
// şifre gir."; diğer hatalar legacy trError() metinleri; Google popup hataları (yetkisiz alan / pop-up engeli / genel) aynen, iptal sessiz.
// "Geri" bağlantısı (legacy "← Geri").
//
// LEGACY HATA DÜZELTMESİ (spec §6 "important"): legacy kod ana `auth` ile giriş yapıyordu → onAuthStateChanged + router, yönetici
// OLMAYAN kullanıcıyı anında kendi paneline taşıyor, sonra logout() #/kesfet'e atıyordu; hata mesajı görünmeyen düğüme yazılıyordu.
// Router'a (app.js — bu grubun dosyası değil) "adminAttempt" tutucusu eklemek yerine deneme YALITILMIŞ bir Auth örneğinde yapılır:
// ikincil Firebase uygulaması + bellek içi kalıcılık (initializeAuth/inMemoryPersistence; emülatörde aynı emülatöre bağlanır).
// Yönetici doğrulanırsa kullanıcı updateCurrentUser(auth, user) ile ANA oturuma aktarılır (store → isAdmin → router #/admin);
// değilse ikincil oturum kapatılır — ana oturum (misafir) HİÇ değişmez → panel yanıp sönmez, sayfa yerinde kalır, hata görünür.
// adminUids okuması: ana oturum varsa ana db ile (store.computeIsAdmin; kural isSignedIn → misafir anonim oturum yeterli);
// ana oturum YOKSA (anonim giriş kapalı/başarısız) aynı ikincil uygulamaya bağlı Firestore ile, adayın KENDİ kimliğiyle okunur.
// Her iki yolda da yönetici olmayan aday ana oturuma ASLA aktarılmaz: ikincil oturum kapatılır + "Bu hesap yönetici değil.".
// Yalıtılmış Auth görünüm açılırken kurulur: Safari/iOS'ta Firebase popup çözücüsünü kurulumda ısıtır (_shouldInitProactively) →
// ilk Google tıklamasında window.open kullanıcı etkileşimi süresi içinde kalır (pop-up engeli yok).
// SHARED-CANDIDATE: yalıtılmış auth yardımcısı (isolatedAuth/isolatedDb) + trError() → js/firebase.js / ortak auth yardımcısı (giriş/kayıt da kullanır).
//
// Veri: yalnız Firebase Auth + adminUids/{uid} okuması. Firestore yazımı YOK.
import { h } from "../../ui.js";
import { computeIsAdmin, OWNER_EMAIL } from "../../store.js";
import { app, auth, db, doc, getDoc } from "../../firebase.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  initializeAuth, getAuth, inMemoryPersistence, browserPopupRedirectResolver, connectAuthEmulator,
  signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, updateCurrentUser, signOut,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { authSplit, authTopLink, authTag, authHeading, authIconBadge, authGoogleButton, authNote } from "../shared/auth-shell.js";
import { svgIcon } from "../shared/icons.js";
import { dkButton, dkField, dkInput, dkPasswordInput, dkInlineMessage, dkOrDivider } from "../shared/ui.js";

// legacy js/pages/auth.js trError() — birebir (dışa aktarılmıyor). SHARED-CANDIDATE
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
const POPUP_CANCEL = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);
const googleError = (code) => code === "auth/unauthorized-domain"
  ? "Bu alan Google girişine yetkili değil. Firebase → Authentication → Settings → Authorized domains'e alan adını ekleyin."
  : code === "auth/popup-blocked"
    ? "Tarayıcı pop-up'ı engelledi. Adres çubuğundaki pop-up iznini verip tekrar deneyin."
    : "Google ile giriş başarısız. Tekrar deneyin.";

// ── Yalıtılmış Auth (yönetici denemesi ana oturumu etkilemez) ──
const ISO_NAME = "gb-admin-check";
let _iso = null;
function isolatedAuth() {
  if (_iso) return _iso;
  const a2 = getApps().find((x) => x.name === ISO_NAME) || initializeApp(app.options, ISO_NAME);
  try { _iso = initializeAuth(a2, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver }); }
  catch (_) { _iso = getAuth(a2); }
  const emu = auth.emulatorConfig; // yalnız js/firebase.js emülatöre bağladıysa (localhost + ?emu)
  if (emu && !_iso.emulatorConfig) {
    try { connectAuthEmulator(_iso, `${emu.protocol}://${emu.host}${emu.port != null ? ":" + emu.port : ""}`, { disableWarnings: true }); } catch (_) {}
  }
  return _iso;
}
// İkincil uygulamanın Firestore'u (adayın kendi kimliğiyle okur). Emülatör modunda ana db'nin emülatör adresi bilinmiyorsa
// KURULMAZ (null) — yalıtılmış örnek asla üretime bağlanmasın.
let _isoDb;
function isolatedDb() {
  if (_isoDb !== undefined) return _isoDb;
  isolatedAuth();
  const a2 = getApps().find((x) => x.name === ISO_NAME);
  _isoDb = null;
  try {
    if (auth.emulatorConfig) {
      const st = (typeof db.toJSON === "function" ? db.toJSON()?.settings : null) || db._settings || {};
      const m = String(st.host || "").match(/^(.+):(\d+)$/);
      if (!m) return _isoDb;
      const d2 = getFirestore(a2);
      connectFirestoreEmulator(d2, m[1], Number(m[2]));
      _isoDb = d2;
    } else {
      _isoDb = getFirestore(a2);
    }
  } catch (_) { _isoDb = null; }
  return _isoDb;
}
// Yönetici mi? (store.computeIsAdmin ile aynı ölçüt: owner e-postası ya da adminUids/{uid})
async function isAdminCandidate(user) {
  if (auth.currentUser) return computeIsAdmin(user);           // ana oturum (misafir anonim) okuyabilir
  if ((user.email || "").toLowerCase() === OWNER_EMAIL) return true;
  const d2 = isolatedDb();
  if (!d2) return false;
  try { return (await getDoc(doc(d2, "adminUids", user.uid))).exists(); } catch (_) { return false; }
}

export function adminGirisView(ctx) {
  let destroyed = false;
  let busy = false;
  // Görünüm açılırken kur (Safari/iOS popup çözücüsü burada ısınır; bkz. başlık notu). Hata → ilk tıklamada yeniden denenir.
  try { isolatedAuth(); } catch (_) { _iso = null; }

  const emailIn = dkInput({ id: "ag-email", type: "email", placeholder: "yonetici@ornek.com", autocomplete: "email" });
  const pw = dkPasswordInput({ id: "ag-pass", autocomplete: "current-password" });
  const passIn = pw.input;
  const status = h("div", { class: "dk-admin-giris-status", role: "status", "aria-live": "polite" });
  const say = (text) => { if (!destroyed) status.replaceChildren(...(text ? [dkInlineMessage("err", text)] : [])); };
  const markInvalid = (on) => {
    for (const el of [emailIn, passIn]) { if (on) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid"); }
  };

  const submitBtn = dkButton("Giriş yap", { variant: "violet", size: 48, full: true, type: "submit", busyLabel: "Doğrulanıyor…", icon: svgIcon("shieldCheck2", { size: 17, sw: "2" }) });
  const googleBtn = authGoogleButton("Google ile giriş", () => google());

  function setBusy(on) {
    busy = on;
    submitBtn.dk.setBusy(on, "Doğrulanıyor…");
    // Google düğmesi meşgulken devre dışı bırakılmaz → tam opak kalır (artboard); çift gönderimi submit()/google() içindeki `busy` korur.
    if (!on) googleBtn.removeAttribute("aria-busy");
    if (!on && document.activeElement === document.body) { try { submitBtn.focus({ preventScroll: true }); } catch (_) {} }
  }

  // Doğrulanmış kimliği yönet: yöneticiyse ana oturuma aktar, değilse ikincil oturumu kapat + hata (ana oturum hiç değişmez)
  async function finish(iso, user, notAdminMsg) {
    let ok = false;
    try { ok = await isAdminCandidate(user); } catch (_) { ok = false; }
    if (!ok) {
      try { await signOut(iso); } catch (_) {}
      return notAdminMsg;
    }
    if (destroyed) { try { await signOut(iso); } catch (_) {} return null; }
    // yönetici: ana oturuma aktar → onAuthStateChanged → store isAdmin → router #/admin
    await updateCurrentUser(auth, user);
    try { await signOut(iso); } catch (_) {}
    return null;
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (busy || destroyed) return;
    const email = emailIn.value.trim();
    const pass = passIn.value;
    say(null);
    markInvalid(false);
    if (!email || !pass) { say("E-posta ve şifre gir."); markInvalid(true); return; }
    setBusy(true);
    const iso = isolatedAuth();
    try {
      const { user } = await signInWithEmailAndPassword(iso, email, pass);
      const err = await finish(iso, user, "Bu hesap yönetici değil.");
      if (destroyed) return;
      if (err) { setBusy(false); say(err); markInvalid(true); }
      // başarı: meşgul kalır; router #/admin'e taşıyınca görünüm kapanır
    } catch (err) {
      if (destroyed) return;
      setBusy(false);
      say(trError(err && err.code));
      markInvalid(true);
    }
  }

  async function google() {
    if (busy || destroyed) return;
    say(null);
    markInvalid(false);
    const iso = isolatedAuth();
    busy = true;
    googleBtn.setAttribute("aria-busy", "true");
    try {
      const { user } = await signInWithPopup(iso, new GoogleAuthProvider());
      submitBtn.dk.setBusy(true, "Doğrulanıyor…");
      const err = await finish(iso, user, "Bu Google hesabı yönetici değil.");
      if (destroyed) return;
      if (err) { setBusy(false); say(err); } // Google "yönetici değil" → alanlar kırmızı DEĞİL (spec §4)
    } catch (err) {
      if (destroyed) return;
      setBusy(false);
      const code = err && err.code;
      if (POPUP_CANCEL.has(code)) return; // kullanıcı iptal etti → sessiz
      say(googleError(code));
    }
  }

  const form = h("form", { "aria-label": "Yönetici giriş formu", class: "dk-admin-giris-form", novalidate: true, onsubmit: submit },
    dkField({ label: "Yönetici e-posta", id: "ag-email", input: emailIn }).node,
    dkField({ label: "Şifre", id: "ag-pass", input: pw }).node,
    status,
    submitBtn,
    dkOrDivider(),
    googleBtn);

  const s = authSplit({
    variant: "admin",
    top: { left: authTopLink("Geri", { href: "#/kesfet" }), right: authTag("YÖNETİCİ", { color: "#A78BFA", lock: true }) },
    width: 400, gap: 22,
    children: [
      authIconBadge({ scan: true }),
      authHeading({ title: "Yönetici ", em: "girişi", emColor: "#A78BFA", lead: "Onay ve yönetim paneli.", size: 52, gap: 10 }),
      form,
      authNote(["Bu alan yalnızca GigBridge yöneticileri içindir. Mekan, organizatör veya sanatçıysan ", h("a", { href: "#/login" }, "normal girişi"), " kullan."]),
    ],
  });
  s.column.classList.add("dk-admin-giris");

  // noindex (hash rotası ayrı dizinlenmez; yine de bu ekrandayken işaretle, çıkışta geri al)
  let robots = document.head.querySelector('meta[name="robots"]');
  const prevRobots = robots ? robots.getAttribute("content") : null;
  if (!robots) { robots = h("meta", { name: "robots" }); document.head.append(robots); }
  robots.setAttribute("content", "noindex");

  return {
    node: s.node,
    onSession() { return true; }, // aynı kimlikle yayın → formu (yazılmış değer/hata) koru
    destroy() {
      destroyed = true;
      if (prevRobots == null) robots.remove(); else robots.setAttribute("content", prevRobots);
      s.destroy();
    },
  };
}
