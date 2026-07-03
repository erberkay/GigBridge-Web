// Giriş / kayıt / bekleme / yönetici girişi sayfaları.
import {
  auth, db, doc, setDoc, serverTimestamp,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, sendEmailVerification,
} from "../firebase.js";
import { session, logout, computeIsAdmin, refreshProfile, recheckEmailVerified } from "../store.js";
import { h, icon, btn, field, card, toast, ROLE } from "../ui.js";

const PROVINCES = ["Adana","Adıyaman","Afyonkarahisar","Ağrı","Aksaray","Amasya","Ankara","Antalya","Ardahan","Artvin","Aydın","Balıkesir","Bartın","Batman","Bayburt","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Düzce","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkâri","Hatay","Iğdır","Isparta","İstanbul","İzmir","Kahramanmaraş","Karabük","Karaman","Kars","Kastamonu","Kayseri","Kilis","Kırıkkale","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Mardin","Mersin","Muğla","Muş","Nevşehir","Niğde","Ordu","Osmaniye","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Şanlıurfa","Şırnak","Tekirdağ","Tokat","Trabzon","Tunceli","Uşak","Van","Yalova","Yozgat","Zonguldak"];

function shell(...kids) {
  return h("main", { class: "auth-wrap" },
    h("header", { class: "auth-hero" },
      h("div", { class: "brand" }, h("span", { class: "brand-dot" }), h("span", { class: "brand-name" }, "GigBridge")),
      ...kids.filter((k) => k && k._hero),
    ),
    ...kids.filter((k) => !(k && k._hero)),
    h("footer", { class: "footer" }, h("p", {}, "© GigBridge · Web paneli")),
  );
}
const hero = (title, sub) => { const n = h("div", {}, h("h1", { class: "hero-title" }, title), sub ? h("p", { class: "hero-sub" }, sub) : null); n._hero = true; return n; };

function trError(code) {
  const m = {
    "auth/email-already-in-use": "Bu e-posta zaten kayıtlı. Giriş yapmayı dene.",
    "auth/invalid-email": "Geçersiz e-posta.",
    "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/invalid-credential": "E-posta ya da şifre hatalı.",
    "auth/wrong-password": "Şifre hatalı.",
    "auth/user-not-found": "Böyle bir hesap yok.",
    "auth/too-many-requests": "Çok fazla deneme. Biraz sonra tekrar dene.",
    "auth/network-request-failed": "İnternet bağlantı hatası.",
  };
  return m[code] || "İşlem başarısız. Tekrar dene.";
}

// Google ile devam — yeni kullanıcı ise router #/setup'a (rol seç) götürür.
function googleBtn(msg) {
  const b = h("button", { type: "button", class: "btn btn-google btn-full", onclick: async () => {
    b.disabled = true;
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) {
      b.disabled = false;
      const code = err && err.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      fail(msg, code === "auth/unauthorized-domain"
        ? "Bu alan Google girişine yetkili değil. Firebase → Authentication → Settings → Authorized domains'e alan adını ekleyin."
        : code === "auth/popup-blocked" ? "Tarayıcı açılır pencereyi engelledi. İzin verip tekrar deneyin."
        : "Google ile giriş başarısız. Tekrar deneyin.");
    }
  } }, icon("logo-google", { size: 18 }), h("span", {}, "Google ile devam et"));
  return b;
}
const orSep = () => h("div", { class: "sep" }, "veya");

// ── Landing — app WelcomeScreen birebir ──
export function landing() {
  const feat = (ic, text) => h("div", { class: "wl-feat" },
    h("span", { class: "wl-featic" }, icon(ic, { size: 17, color: "var(--primary)" })),
    h("span", { class: "wl-feattext" }, text));
  return h("main", { class: "wl-wrap" },
    h("div", { class: "wl-hero" },
      h("div", { class: "brand" }, h("span", { class: "brand-dot" }), h("span", { class: "wl-logo" }, "GigBridge")),
      h("p", { class: "wl-tagline" }, "Sanatçılar, Mekanlar ve", h("br"), "Müzik Severler Bir Arada")),
    h("div", { class: "wl-feats" },
      feat("mic-outline", "Sanatçı profilleri ve portföyler"),
      feat("business-outline", "Mekanları keşfet ve etkinlikleri takip et"),
      feat("map-outline", "Yakınındaki etkinlikleri haritada gör"),
      feat("star-outline", "Sanatçı ve mekanlara puan ver")),
    h("div", { class: "wl-btns" },
      h("button", { class: "wl-login", onclick: () => (location.hash = "#/login") }, "Giriş Yap"),
      h("button", { class: "wl-register", onclick: () => (location.hash = "#/register") }, "Hesap Oluştur"),
      h("a", { class: "admin-link", href: "#/yonetici" }, icon("shield-checkmark-outline", { size: 14 }), h("span", {}, "Yönetici Girişi"))));
}

// ── Giriş ──
export function login() {
  const msg = h("p", { class: "msg" });
  const submit = async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.className = "msg";
    const email = q("#lemail").value.trim(); const pass = q("#lpass").value;
    if (!email || !pass) { fail(msg, "E-posta ve şifre gir."); return; }
    const b = q("#lbtn"); b.disabled = true; b.querySelector("span").textContent = "Giriş yapılıyor…";
    try { await signInWithEmailAndPassword(auth, email, pass); /* router yönlendirir */ }
    catch (err) { fail(msg, trError(err && err.code)); b.disabled = false; b.querySelector("span").textContent = "Giriş Yap"; }
  };
  // Şifremi unuttum — e-posta alanındaki adrese sıfırlama bağlantısı gönderir
  const forgot = h("a", { href: "#", class: "forgot-link", onclick: async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.className = "msg";
    const email = q("#lemail").value.trim();
    if (!email) { fail(msg, "Önce e-posta adresini gir."); q("#lemail").focus(); return; }
    const link = e.currentTarget; const old = link.textContent;
    link.style.pointerEvents = "none"; link.textContent = "Gönderiliyor…";
    try {
      await sendPasswordResetEmail(auth, email);
      msg.textContent = "Şifre sıfırlama bağlantısı e-postana gönderildi."; msg.className = "msg ok";
    } catch (err) { fail(msg, trError(err && err.code)); }
    finally { link.style.pointerEvents = ""; link.textContent = old; }
  } }, "Şifremi unuttum");
  const form = h("form", { onsubmit: submit },
    field({ label: "E-posta", id: "lemail", type: "email", placeholder: "mekan@ornek.com" }),
    field({ label: "Şifre", id: "lpass", type: "password", placeholder: "Şifren" }),
    h("div", { class: "forgot-row" }, forgot),
    (() => { const x = btn("Giriş Yap", { full: true }); x.id = "lbtn"; return x; })(),
    orSep(),
    googleBtn(msg),
    msg,
  );
  return shell(hero("Giriş Yap", "Müşteri, mekan ve organizatör hesapları buradan girer."), card(form,
    h("p", { class: "foot-note" }, "Hesabın yok mu? ", h("a", { href: "#/register" }, "Kayıt ol")),
    h("p", { class: "foot-note" }, h("a", { href: "#/kesfet" }, "← Misafir olarak keşfetmeye dön")),
    h("a", { class: "admin-link", href: "#/yonetici" }, icon("shield-checkmark-outline", { size: 14 }), h("span", {}, "Yönetici Girişi"))));
}

// ── Kayıt (mekan / organizatör) ──
export function register() {
  let role = "customer";
  const msg = h("p", { class: "msg" });
  const cityWrap = field({ label: "Şehir", id: "rcity", placeholder: "Örn. İstanbul", list: "cityList" });
  cityWrap.style.display = "none"; // yalnız mekan rolünde görünür
  const dl = h("datalist", { id: "cityList" }, ...PROVINCES.map((p) => h("option", { value: p })));
  const nameField = field({ label: "Ad Soyad", id: "rname", placeholder: "Adın soyadın" });

  const labelFor = (k) => k === "venue" ? "Mekan Adı" : k === "organizer" ? "Organizasyon Adı" : k === "artist" ? "Sanatçı Adı" : "Ad Soyad";
  const submitLabel = (k) => (k === "customer" || k === "artist") ? "Kayıt Ol" : "Başvuruyu Gönder";
  const roleBtn = (key, label, ic) => h("button", { type: "button", class: "seg" + (role === key ? " on" : ""), dataset: { role: key },
    onclick: () => { role = key; [...seg.children].forEach((c) => c.classList.toggle("on", c.dataset.role === key));
      nameField.querySelector(".flabel").textContent = labelFor(key);
      cityWrap.style.display = (key === "venue" || key === "artist") ? "" : "none";
      const rb = q("#rbtn"); if (rb) rb.querySelector("span").textContent = submitLabel(key); } },
    icon(ic, { size: 15 }), h("span", {}, label));
  const seg = h("div", { class: "segrow wrap4" },
    roleBtn("customer", "Müşteri", "person-outline"),
    roleBtn("artist", "Sanatçı", "mic-outline"),
    roleBtn("venue", "Mekan", "business-outline"),
    roleBtn("organizer", "Organizatör", "megaphone-outline"));

  const submit = async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.className = "msg";
    const name = q("#rname").value.trim(); const email = q("#remail").value.trim();
    const pass = q("#rpass").value; const city = q("#rcity").value.trim();
    if (!name) return fail(msg, role === "customer" ? "Adını gir." : (role === "venue" ? "Mekan" : "Organizasyon") + " adını gir.");
    if (!email) return fail(msg, "E-posta gir.");
    if (pass.length < 6) return fail(msg, "Şifre en az 6 karakter olmalı.");
    const b = q("#rbtn"); b.disabled = true; b.querySelector("span").textContent = "Gönderiliyor…";
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, pass);
      try { await updateProfile(user, { displayName: name }); } catch (_) {}
      await setDoc(doc(db, "users", user.uid), {
        displayName: name, email: user.email, userType: role, photoURL: null,
        createdAt: serverTimestamp(),
        ...(role === "venue" || role === "organizer" ? { approved: false } : {}), // müşteri/sanatçı onay gerektirmez
        ...(role === "organizer" ? { orgName: name } : {}),
        ...((role === "venue" || role === "artist") && city ? { city } : {}),
      });
      try { await sendEmailVerification(user); } catch (_) {} // doğrulama bağlantısı
      location.hash = "#/verify"; // önce e-posta doğrulama
    } catch (err) { fail(msg, trError(err && err.code)); b.disabled = false; b.querySelector("span").textContent = submitLabel(role); }
  };

  const form = h("form", { onsubmit: submit }, seg, nameField, dl,
    field({ label: "E-posta", id: "remail", type: "email", placeholder: "ornek@email.com" }),
    field({ label: "Şifre", id: "rpass", type: "password", placeholder: "En az 6 karakter", hint: "Uygulamadan giriş yaparken de bu şifreyi kullanacaksın." }),
    cityWrap,
    (() => { const x = btn(submitLabel(role), { full: true }); x.id = "rbtn"; return x; })(),
    orSep(),
    googleBtn(msg),
    msg,
  );
  return shell(hero("Yeni Hesap", "Hesap oluştur — müşteri, mekan ya da organizatör."),
    card(form, h("p", { class: "foot-note" }, "Zaten üye misin? ", h("a", { href: "#/login" }, "Giriş yap"))));
}

// ── Hesabı tamamla (Google ile yeni giriş → profil yok) ──
export function setup() {
  const u = session.user;
  let role = "venue";
  const msg = h("p", { class: "msg" });
  const cityWrap = field({ label: "Şehir", id: "scity", placeholder: "Örn. İstanbul", list: "cityList" });
  const dl = h("datalist", { id: "cityList" }, ...PROVINCES.map((p) => h("option", { value: p })));
  const nameField = field({ label: "Mekan Adı", id: "sname", value: u?.displayName || "", placeholder: "Örn. Babylon Club" });
  const roleBtn = (key, label, ic) => h("button", { type: "button", class: "seg" + (role === key ? " on" : ""), dataset: { role: key },
    onclick: () => { role = key; [...seg.children].forEach((c) => c.classList.toggle("on", c.dataset.role === key));
      nameField.querySelector(".flabel").textContent = key === "venue" ? "Mekan Adı" : "Organizasyon Adı";
      cityWrap.style.display = key === "venue" ? "" : "none"; } }, icon(ic, { size: 15 }), h("span", {}, label));
  const seg = h("div", { class: "segrow" }, roleBtn("venue", "Mekan", "business-outline"), roleBtn("organizer", "Organizatör", "megaphone-outline"));
  const submit = async (e) => {
    e && e.preventDefault();
    msg.textContent = ""; msg.className = "msg";
    if (!u) return fail(msg, "Oturum bulunamadı, tekrar giriş yap.");
    const name = q("#sname").value.trim(); const city = q("#scity").value.trim();
    if (!name) return fail(msg, (role === "venue" ? "Mekan" : "Organizasyon") + " adını gir.");
    const b = q("#sbtn"); b.disabled = true; b.querySelector("span").textContent = "Kaydediliyor…";
    try {
      await setDoc(doc(db, "users", u.uid), {
        displayName: name, email: u.email, userType: role, photoURL: u.photoURL ?? null,
        createdAt: serverTimestamp(), approved: false,
        ...(role === "organizer" ? { orgName: name } : {}),
        ...(role === "venue" && city ? { city } : {}),
      });
      await refreshProfile(); // → router #/pending'e götürür
    } catch (err) { fail(msg, "Kaydedilemedi. Tekrar dene."); b.disabled = false; b.querySelector("span").textContent = "Hesabı Tamamla"; }
  };
  const form = h("form", { onsubmit: submit }, seg, nameField, dl, cityWrap,
    (() => { const x = btn("Hesabı Tamamla", { full: true }); x.id = "sbtn"; return x; })(), msg);
  return shell(hero("Hesabını Tamamla", "Google ile giriş yaptın. Rolünü seç ve bilgilerini gir."),
    card(form, h("p", { class: "foot-note" }, h("a", { href: "#/", onclick: (e) => { e.preventDefault(); logout(); } }, "Çıkış / farklı hesapla gir"))));
}

// ── Onay bekleme ──
export function pending() {
  const name = session.profile?.displayName || "";
  return shell(hero("Onay Bekleniyor", null),
    card(
      h("div", { class: "pending-icon" }, icon("hourglass-outline", { size: 34, color: "#fff" })),
      h("h3", { class: "center" }, "Başvurun inceleniyor"),
      h("p", { class: "center muted" }, (name ? name + " " : "") + "hesabın oluşturuldu. GigBridge ekibi onayladıktan sonra panel açılır ve uygulamadan aynı hesapla giriş yapabilirsin."),
      btn("Durumu Yenile", { variant: "ghost", ic: "refresh-outline", full: true, onClick: () => location.reload() }),
      btn("Çıkış Yap", { variant: "ghost", ic: "log-out-outline", full: true, onClick: logout }),
    ));
}

// ── E-posta doğrulama (parola hesapları; Google zaten doğrulanmış gelir) ──
export function verify() {
  const u = session.user;
  const msg = h("p", { class: "msg" });

  const contBtn = (() => { const x = btn("Doğruladım, Devam Et", { ic: "checkmark-circle-outline", full: true }); x.id = "vcont"; return x; })();
  contBtn.onclick = async () => {
    msg.textContent = ""; msg.className = "msg";
    contBtn.disabled = true; contBtn.querySelector("span").textContent = "Kontrol ediliyor…";
    try { await auth.currentUser?.reload(); } catch (_) {}   // sunucudan taze durum
    if (auth.currentUser && auth.currentUser.emailVerified) {
      await recheckEmailVerified();   // emit → router bir sonraki ekrana (pending) taşır
    } else {
      fail(msg, "E-posta henüz doğrulanmamış görünüyor. Gelen kutundaki bağlantıya tıkladıktan sonra tekrar dene.");
      contBtn.disabled = false; contBtn.querySelector("span").textContent = "Doğruladım, Devam Et";
    }
  };

  const resendBtn = (() => { const x = btn("Doğrulama e-postasını tekrar gönder", { variant: "ghost", ic: "mail-outline", full: true }); x.id = "vresend"; return x; })();
  resendBtn.onclick = async () => {
    msg.textContent = ""; msg.className = "msg";
    if (!auth.currentUser) return fail(msg, "Oturum bulunamadı, tekrar giriş yap.");
    resendBtn.disabled = true;
    try { await sendEmailVerification(auth.currentUser); msg.textContent = "Doğrulama e-postası tekrar gönderildi."; msg.className = "msg ok"; }
    catch (err) { fail(msg, (err && err.code) === "auth/too-many-requests" ? "Çok sık denedin, biraz bekleyip tekrar dene." : "Gönderilemedi, tekrar dene."); }
    finally { resendBtn.disabled = false; }
  };

  return shell(hero("E-postanı Doğrula", null),
    card(
      h("div", { class: "pending-icon" }, icon("mail-unread-outline", { size: 34, color: "#fff" })),
      h("h3", { class: "center" }, "Doğrulama bağlantısı gönderildi"),
      h("p", { class: "center muted" }, (u && u.email ? u.email : "E-posta adresine") + " adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıklayıp bu sayfaya dönerek \"Doğruladım\"a bas."),
      contBtn, resendBtn,
      btn("Çıkış Yap", { variant: "ghost", ic: "log-out-outline", full: true, onClick: logout }),
      msg,
    ));
}

// ── Yönetici girişi ──
export function adminLogin() {
  const msg = h("p", { class: "msg" });
  const submit = async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.className = "msg";
    const email = q("#aemail").value.trim(); const pass = q("#apass").value;
    if (!email || !pass) return fail(msg, "E-posta ve şifre gir.");
    const b = q("#abtn"); b.disabled = true; b.querySelector("span").textContent = "Doğrulanıyor…";
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, pass);
      const ok = await computeIsAdmin(user);
      if (!ok) { await logout(); fail(msg, "Bu hesap yönetici değil."); b.disabled = false; b.querySelector("span").textContent = "Giriş Yap"; return; }
      // router isAdmin görünce #/admin'e götürür (bir sonraki emit)
      location.hash = "#/admin";
    } catch (err) { fail(msg, trError(err && err.code)); b.disabled = false; b.querySelector("span").textContent = "Giriş Yap"; }
  };
  const form = h("form", { onsubmit: submit },
    field({ label: "Yönetici E-posta", id: "aemail", type: "email", placeholder: "yonetici@ornek.com" }),
    field({ label: "Şifre", id: "apass", type: "password" }),
    (() => { const x = btn("Giriş Yap", { full: true, ic: "shield-checkmark-outline" }); x.id = "abtn"; return x; })(),
    msg,
  );
  return shell(hero("Yönetici Girişi", "Onay ve yönetim paneli."),
    card(form, h("p", { class: "foot-note" }, h("a", { href: "#/" }, "← Geri"))));
}

// ── Desteklenmeyen rol ──
export function unsupported() {
  return shell(hero("Bu panel için değil", null),
    card(h("p", { class: "center muted" }, "Bu web paneli yalnızca mekan, organizatör ve yönetici hesapları içindir. Müşteri/sanatçı hesabıyla uygulamayı kullan."),
      btn("Çıkış Yap", { variant: "ghost", ic: "log-out-outline", full: true, onClick: logout })));
}

function q(sel) { return document.querySelector(sel); }
function fail(msg, text) { msg.textContent = text; msg.className = "msg err"; }
