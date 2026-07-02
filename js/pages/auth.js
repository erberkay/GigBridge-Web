// Giriş / kayıt / bekleme / yönetici girişi sayfaları.
import {
  auth, db, doc, setDoc, serverTimestamp,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
} from "../firebase.js";
import { session, logout, computeIsAdmin } from "../store.js";
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

// ── Landing ──
export function landing() {
  return shell(
    hero("Mekan & Organizatör Paneli", "GigBridge'e mekan ya da organizatör olarak katıl; giriş yap, etkinliklerini yönet. Yeni hesaplar yönetici onayından sonra aktifleşir."),
    card(
      btn("Giriş Yap", { ic: "log-in-outline", full: true, onClick: () => (location.hash = "#/login") }),
      h("div", { class: "sep" }, "veya"),
      btn("Yeni Hesap Oluştur", { variant: "ghost", ic: "person-add-outline", full: true, onClick: () => (location.hash = "#/register") }),
      h("a", { class: "admin-link", href: "#/yonetici" }, icon("shield-checkmark-outline", { size: 14 }), h("span", {}, "Yönetici Girişi")),
    ),
  );
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
  const form = h("form", { onsubmit: submit },
    field({ label: "E-posta", id: "lemail", type: "email", placeholder: "mekan@ornek.com" }),
    field({ label: "Şifre", id: "lpass", type: "password", placeholder: "Şifren" }),
    (() => { const x = btn("Giriş Yap", { full: true }); x.id = "lbtn"; return x; })(),
    msg,
  );
  return shell(hero("Giriş Yap", "Mekan ve organizatör hesapları buradan girer."), card(form,
    h("p", { class: "foot-note" }, "Hesabın yok mu? ", h("a", { href: "#/register" }, "Kayıt ol"))));
}

// ── Kayıt (mekan / organizatör) ──
export function register() {
  let role = "venue";
  const msg = h("p", { class: "msg" });
  const cityWrap = field({ label: "Şehir", id: "rcity", placeholder: "Örn. İstanbul", list: "cityList" });
  const dl = h("datalist", { id: "cityList" }, ...PROVINCES.map((p) => h("option", { value: p })));
  const nameField = field({ label: "Mekan Adı", id: "rname", placeholder: "Örn. Babylon Club" });

  const roleBtn = (key, label, ic) => h("button", { type: "button", class: "seg" + (role === key ? " on" : ""), dataset: { role: key },
    onclick: (e) => { role = key; [...seg.children].forEach((c) => c.classList.toggle("on", c.dataset.role === key));
      nameField.querySelector(".flabel").textContent = key === "venue" ? "Mekan Adı" : "Organizasyon Adı";
      cityWrap.style.display = key === "venue" ? "" : "none"; } }, icon(ic, { size: 15 }), h("span", {}, label));
  const seg = h("div", { class: "segrow" }, roleBtn("venue", "Mekan", "business-outline"), roleBtn("organizer", "Organizatör", "megaphone-outline"));

  const submit = async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.className = "msg";
    const name = q("#rname").value.trim(); const email = q("#remail").value.trim();
    const pass = q("#rpass").value; const city = q("#rcity").value.trim();
    if (!name) return fail(msg, (role === "venue" ? "Mekan" : "Organizasyon") + " adını gir.");
    if (!email) return fail(msg, "E-posta gir.");
    if (pass.length < 6) return fail(msg, "Şifre en az 6 karakter olmalı.");
    const b = q("#rbtn"); b.disabled = true; b.querySelector("span").textContent = "Gönderiliyor…";
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, pass);
      try { await updateProfile(user, { displayName: name }); } catch (_) {}
      await setDoc(doc(db, "users", user.uid), {
        displayName: name, email: user.email, userType: role, photoURL: null,
        createdAt: serverTimestamp(), approved: false,
        ...(role === "organizer" ? { orgName: name } : {}),
        ...(role === "venue" && city ? { city } : {}),
      });
      location.hash = "#/pending"; // router bekleme ekranına götürür
    } catch (err) { fail(msg, trError(err && err.code)); b.disabled = false; b.querySelector("span").textContent = "Başvuruyu Gönder"; }
  };

  const form = h("form", { onsubmit: submit }, seg, nameField, dl,
    field({ label: "E-posta", id: "remail", type: "email", placeholder: "mekan@ornek.com" }),
    field({ label: "Şifre", id: "rpass", type: "password", placeholder: "En az 6 karakter", hint: "Uygulamadan giriş yaparken de bu şifreyi kullanacaksın." }),
    cityWrap,
    (() => { const x = btn("Başvuruyu Gönder", { full: true }); x.id = "rbtn"; return x; })(),
    msg,
  );
  return shell(hero("Yeni Hesap", "Mekan ya da organizatör hesabı oluştur. Başvurun yönetici onayından sonra aktifleşir."),
    card(form, h("p", { class: "foot-note" }, "Zaten üye misin? ", h("a", { href: "#/login" }, "Giriş yap"))));
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
