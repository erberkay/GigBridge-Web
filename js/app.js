// Önyükleme + hash router + rol/onay guard'ları.
import { initAuth, session, onSession, homeRouteFor } from "./store.js";
import { landing, login, register, pending, adminLogin, unsupported, setup, verify } from "./pages/auth.js";
import { customerPage } from "./pages/customer.js";
import { mount, h } from "./ui.js";

// Rol panelleri tembel-yüklenir: müşteri/misafir bunların kodunu indirmez (hız).
const _lazy = {};
function mountLazy(path, fn) {
  const at = base(location.hash);
  mount(h("div", { class: "boot" }, h("div", { class: "spinner" })));
  (_lazy[path] || (_lazy[path] = import(path))).then((m) => {
    if (base(location.hash) === at) mount(m[fn]());
  }).catch(() => { _lazy[path] = null; mount(h("div", { class: "content" }, h("p", { class: "muted center" }, "Sayfa yüklenemedi. Bağlantını kontrol edip yenile."))); });
}

const PUBLIC = ["#/", "#/login", "#/register", "#/yonetici"];

function base(hash) { return (hash || "#/").split("?")[0]; }
function matches(b, prefix) { return b === prefix || b.startsWith(prefix + "/"); }

function resolve() {
  const b = base(location.hash);
  const s = session;

  // Yönetici oturumu her şeyin önünde
  if (s.isAdmin) return matches(b, "#/admin") ? b : "#/admin";

  // Misafir (anonim oturum): giriş yapmadan müşteri keşif sayfalarını görür.
  // Kişisel/aksiyon rotaları (mesaj/profil/takip/…) girişe yönlenir.
  if (s.guest) {
    if (b === "#/") return "#/kesfet"; // kök → müşteri anasayfası
    const GUEST = ["#/kesfet", "#/harita", "#/akis", "#/mesajlar", "#/profil", "#/etkinlikler", "#/login", "#/register", "#/yonetici"];
    if (GUEST.includes(b) || matches(b, "#/etkinlik") || matches(b, "#/sanatci") || matches(b, "#/mekan") || matches(b, "#/katilimcilar")) return b;
    return "#/login"; // takip/favoriler/katıldıklarım/yorumlarım/bildirimler → giriş
  }

  const authed = !!s.user;
  if (!authed) return PUBLIC.includes(b) ? b : "#/"; // anonim kapalıysa fallback (mekan/organizatör girişi)

  // E-posta doğrulanmadıysa doğrulama ekranına kapıla (Google hesapları verified gelir,
  // buraya düşmez). Doğrulanınca aşağıdaki rol/onay mantığı devreye girer.
  if (!s.user.emailVerified) return "#/verify";

  // Girişli (yönetici değil) → rol + onaya göre ev
  const home = homeRouteFor(s.profile); // #/kesfet | #/venue | #/organizer | #/pending | #/unsupported

  // Müşteri: sekmeler (kesfet/harita/akis/mesajlar/profil) + detaylar (etkinlik/sanatci/mekan)
  if (home === "#/kesfet") {
    const CUST = ["#/kesfet", "#/harita", "#/akis", "#/mesajlar", "#/profil", "#/etkinlikler", "#/takip", "#/favoriler", "#/katildiklarim", "#/biletlerim", "#/yorumlarim", "#/bildirimler"];
    if (CUST.includes(b) || matches(b, "#/etkinlik") || matches(b, "#/sanatci") || matches(b, "#/mekan") || matches(b, "#/katilimcilar")) return b;
    return "#/kesfet";
  }

  if (b === "#/pending") return home;                         // onay bittiyse ev, değilse pending
  if (b === "#/unsupported") return home === "#/unsupported" ? b : home;
  if (matches(b, "#/venue")) return home === "#/venue" ? b : home;
  if (matches(b, "#/organizer")) return home === "#/organizer" ? b : home;
  if (matches(b, "#/artist")) return home === "#/artist" ? b : home;
  return home; // public/auth rotaları veya bilinmeyen → ev
}

let _lastRenderedHash = null;
function render() {
  if (!session.ready) return; // boot spinner
  const target = resolve();
  if (target !== base(location.hash)) {
    location.hash = target; // yönlendir → hashchange tekrar render eder
    return;
  }
  const b = base(location.hash);
  // Aynı rotada oturum-verisi (emit → refreshProfile/token yenileme) tetikli tam yeniden
  // kurulum, odaktaki input'u yok edip mobilde klavyeyi kapatmasın: bir metin alanı
  // odaktaysa ve rota DEĞİŞMEDİYSE yeniden çizmeyi atla. (Navigasyon/redirect üstte hallolur.)
  const _ae = document.activeElement;
  if (b === _lastRenderedHash && _ae && (_ae.tagName === "INPUT" || _ae.tagName === "TEXTAREA" || _ae.isContentEditable)) return;
  _lastRenderedHash = b;
  let node;
  if (b === "#/") node = landing();
  else if (b === "#/login") node = login();
  else if (b === "#/register") node = register();
  else if (b === "#/pending") node = pending();
  else if (b === "#/verify") node = verify();
  else if (b === "#/yonetici") node = adminLogin();
  else if (b === "#/setup") node = setup();
  else if (b === "#/unsupported") node = unsupported();
  else if (matches(b, "#/admin")) return mountLazy("./pages/admin.js", "adminPage");
  else if (matches(b, "#/venue")) return mountLazy("./pages/venue.js", "venuePage");
  else if (matches(b, "#/organizer")) return mountLazy("./pages/organizer.js", "organizerPage");
  else if (matches(b, "#/artist")) return mountLazy("./pages/artist.js", "artistPage");
  else if (["#/kesfet", "#/harita", "#/akis", "#/mesajlar", "#/profil", "#/etkinlikler", "#/takip", "#/favoriler", "#/katildiklarim", "#/biletlerim", "#/yorumlarim", "#/bildirimler"].includes(b)
    || matches(b, "#/etkinlik") || matches(b, "#/sanatci") || matches(b, "#/mekan") || matches(b, "#/katilimcilar")) node = customerPage();
  else node = landing();
  mount(node instanceof Node ? node : h("div", {}, "…"));
}

onSession(render);
window.addEventListener("hashchange", render);
initAuth();
