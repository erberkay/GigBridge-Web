// Önyükleme + hash router + rol/onay guard'ları.
// ≥769 px (viewport.isDesktop): desktop/registry.js'te kaydı olan rota yeni masaüstü görünümüyle çizilir;
// kaydı olmayan ya da NOT_READY modül → legacy görünüm AYNEN. ≤768 px: legacy yol hiç değişmedi.
import { initAuth, session, onSession, homeRouteFor } from "./store.js";
import { landing, login, register, pending, adminLogin, unsupported, setup, verify } from "./pages/auth.js";
import { customerPage } from "./pages/customer.js";
import { mount, h } from "./ui.js";
import { isDesktop, viewMode, onViewModeChange } from "./viewport.js";
import { desktopRouteFor, legacyPanelRoute, BASE_CSS, DEV_DEMO, loadRouteModule, moduleReady, knownReady } from "./desktop/registry.js";
import { ensureCssAll, ensureDesktopFonts } from "./desktop/css.js";

const bootSpinner = () => h("div", { class: "boot" }, h("div", { class: "spinner" }));

// Rol panelleri tembel-yüklenir: müşteri/misafir bunların kodunu indirmez (hız).
const _lazy = {};
function mountLazy(path, fn) {
  const at = base(location.hash);
  const seq = _seq; // yarış koruması: bu arada başka bir render olduysa (rota/mod/oturum) eski içe aktarım mount etmez
  mountNode(bootSpinner(), "spinner", at);
  (_lazy[path] || (_lazy[path] = import(path))).then((m) => {
    if (base(location.hash) === at && seq === _seq) mountNode(m[fn](), "legacy", at);
  }).catch(() => { _lazy[path] = null; if (seq === _seq) mountNode(h("div", { class: "content" }, h("p", { class: "muted center" }, "Sayfa yüklenemedi. Bağlantını kontrol edip yenile.")), "legacy", at); });
}

const PUBLIC = ["#/", "#/login", "#/register", "#/yonetici"];
// Masaüstünde giriş yapmış sanatçı/mekan/organizatörün de açabildiği salt-okuma herkese açık sayfalar
// (panellerdeki "Siteye dön"; PublicHeader bu durumda "Panelime dön" gösterir). Mobil yönlendirme DEĞİŞMEDİ.
const PUBLIC_READ = ["#/kesfet", "#/etkinlikler", "#/harita", "#/akis", "#/top10"];

function base(hash) { return (hash || "#/").split("?")[0]; }
function matches(b, prefix) { return b === prefix || b.startsWith(prefix + "/"); }
const isPublicRead = (b) => PUBLIC_READ.includes(b) || matches(b, "#/etkinlik") || matches(b, "#/katilimcilar") || matches(b, "#/sanatci") || matches(b, "#/mekan");
const queryOf = (hash) => new URLSearchParams((hash || "").split("?")[1] || "");

// desk=false → legacy (mobil) politika birebir. desk=true → masaüstü ekleri:
//   (1) misafir "#/" → yeni açılış sayfası (WebLanding) — mobilde yine #/kesfet
//   (2) "#/top10" (dinleyici Top 10) misafir + dinleyiciye açık — mobilde #/kesfet'e yönlenir
//   (3) sanatçı/mekan/organizatör PUBLIC_READ sayfalarını görebilir (panelPublic; giriş anında kapalı → panele gider)
function resolve(desk = isDesktop(), panelPublic = desk) {
  const b = base(location.hash);
  const s = session;

  // Geliştirici kataloğu (yalnız yerel emülatör + masaüstü; kayıt registry.DEV_DEMO'ya bağlı) — her oturum türüne açık
  if (DEV_DEMO && desk && b === "#/dk-demo") return b;

  // Yönetici oturumu her şeyin önünde
  if (s.isAdmin) return matches(b, "#/admin") ? b : "#/admin";

  // Misafir (anonim oturum): giriş yapmadan müşteri keşif sayfalarını görür.
  // Kişisel/aksiyon rotaları (mesaj/profil/takip/…) girişe yönlenir.
  if (s.guest) {
    if (b === "#/") return desk ? "#/" : "#/kesfet"; // kök → masaüstü: açılış sayfası, mobil: müşteri anasayfası
    if (b === "#/top10") return desk ? b : "#/kesfet";
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
    if (b === "#/top10") return desk ? b : "#/kesfet";
    const CUST = ["#/kesfet", "#/harita", "#/akis", "#/mesajlar", "#/profil", "#/etkinlikler", "#/takip", "#/favoriler", "#/katildiklarim", "#/biletlerim", "#/yorumlarim", "#/bildirimler"];
    if (CUST.includes(b) || matches(b, "#/etkinlik") || matches(b, "#/sanatci") || matches(b, "#/mekan") || matches(b, "#/katilimcilar")) return b;
    return "#/kesfet";
  }

  // Masaüstü: panel rolleri herkese açık salt-okuma sayfalarını görebilir
  if (desk && panelPublic && (home === "#/artist" || home === "#/venue" || home === "#/organizer") && isPublicRead(b)) return b;

  if (b === "#/pending") return home;                         // onay bittiyse ev, değilse pending
  if (b === "#/unsupported") return home === "#/unsupported" ? b : home;
  if (matches(b, "#/venue")) return home === "#/venue" ? b : home;
  if (matches(b, "#/organizer")) return home === "#/organizer" ? b : home;
  if (matches(b, "#/artist")) return home === "#/artist" ? b : home;
  return home; // public/auth rotaları veya bilinmeyen → ev
}

// ── Görünüm durumu ──
let _lastRenderedHash = null;
let _lastMode = null;
let _sessKey = null;   // oturum kimliği (giriş/çıkış/rol değişimi tespiti)
let _view = null;      // yalnız masaüstü görünümleri: { key, route, node, destroy?, update?, onSession? }
let _seq = 0;          // her render'da artar → bekleyen (eski) tembel mount'lar iptal
let _mounted = { kind: null, base: null }; // #app'teki son içerik: "legacy" | "desktop" | "spinner" + rota
let _modeHeld = false; // ≤768↔≥769 geçişi, odakta metin alanı / yazılmış form yüzünden ERTELENDİ
let _dirty = false;    // son mount'tan beri görünümde kullanıcı girdisi oldu (input olayı)

// Tüm #app yerleştirmeleri buradan: son içeriğin türünü bilir (mod geçişinde aynı legacy görünüm korunur) ve
// "kirli form" bayrağını sıfırlar (DOM değişti → yazılan veri zaten gitti).
function mountNode(node, kind, b) {
  mount(node);
  _mounted = { kind, base: b };
  _dirty = false;
}

// ── Mod geçişi ertelemesi (sahibi kararı): metin alanı odaktaysa ya da görünümde yazılmış (kirli) form varsa
// ≤768↔≥769 geçişindeki yeniden çizim, odak bırakılana (kirli değilse) ya da bir sonraki gezintiye dek ertelenir.
// Görünüm bu sırada kullanılabilir kalır; yazılan veri kaybolmaz.
const TEXTY = /^(text|email|password|search|tel|url|number|date|time|datetime-local|month|week)$/i;
function isTextField(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && TEXTY.test(el.type || "text");
}
const inView = (el) => !!el && el.nodeType === 1 && (!!document.getElementById("app")?.contains(el) || !!el.closest(".dk-portal"));
const formBusy = () => { const ae = document.activeElement; return _dirty || (isTextField(ae) && inView(ae)); };
document.addEventListener("input", (e) => { if (inView(e.target)) _dirty = true; }, true);
document.addEventListener("focusout", () => {
  if (!_modeHeld) return;
  setTimeout(() => { if (_modeHeld && !formBusy()) render("mode"); }, 0);
});
const focusInApp = () => { const ae = document.activeElement; return !!ae && ae !== document.body && !!document.getElementById("app")?.contains(ae); };

function sessionKey(s) {
  return [s.user?.uid || "", s.guest ? 1 : 0, s.isAdmin ? 1 : 0, s.user?.emailVerified ? 1 : 0,
    s.profile?.userType || "", s.profile?.approved === false ? 0 : 1, s.profile?.orgRole || ""].join("|");
}
// reason: "hash" | "session" | "mode" | "identity" → overlays.js "dk:teardown" olayını dinler:
// mod geçişi / kimlik değişimi → açık dk modal/çekmece/popover/toast kapanır + kaydırma kilidi kalkar; diğerleri → popover'lar
// (tetikleyicileri görünümle birlikte gidiyor). Mobilde dinleyici yok (desktop kodu yüklenmez).
function destroyView(reason = "hash") {
  const v = _view; _view = null;
  if (v && typeof v.destroy === "function") { try { v.destroy(); } catch (e) { console.error(e); } }
  try { window.dispatchEvent(new CustomEvent("dk:teardown", { detail: { reason } })); } catch (_) {}
}
// <html data-dk> : bir masaüstü görünümü mount'lu (dk-base.css sayfa geneli kurallarını açar)
function setDkFlag(on) {
  const el = document.documentElement;
  if (on) el.dataset.dk = "1"; else if (el.dataset.dk) delete el.dataset.dk;
}

// reason: "hash" | "session" | "mode"
function render(reason) {
  if (!session.ready) return; // boot spinner
  // Çıkış sonrası anonim (misafir) oturum kuruluyor: landing/giriş ekranını YAKALATMA, kısa spinner göster.
  if (session.reauthing && !session.user) {
    _seq++; destroyView("identity"); setDkFlag(false);
    mountNode(bootSpinner(), "spinner", null);
    return;
  }
  const mode = viewMode();
  // Giriş/çıkış/rol değişimi anında panel rolleri herkese açık sayfada BIRAKILMAZ (ör. Keşfet'te giriş yapan
  // sanatçı paneline gider — legacy ile aynı); panel rollerinin herkese açık sayfa izni yalnız bilinçli gezintide.
  const sKey = sessionKey(session);
  const identityChanged = _sessKey !== null && sKey !== _sessKey;
  _sessKey = sKey;
  const desk = mode === "desktop";
  const b0 = base(location.hash);
  const modeSwitch = _lastMode !== null && mode !== _lastMode;
  const sameRoute = b0 === _lastRenderedHash;
  if (reason === "mode" && !modeSwitch) { _modeHeld = false; return; } // ertelenmişken eski moda geri dönüldü → yapacak iş yok
  // Mod geçişi + odakta metin alanı / kirli form → ertele (gezinti ya da odak bırakılınca yapılır). Giriş/çıkış bunu aşar.
  if (modeSwitch && sameRoute && reason !== "hash" && !identityChanged && formBusy()) { _modeHeld = true; return; }
  _modeHeld = false;
  const target = resolve(desk, desk && !(reason === "session" && identityChanged));
  if (target !== b0) {
    // Masaüstü eklerinden doğan yönlendirmeler (mobilde #/top10 / #/dk-demo, mod geçişinde yalnız-masaüstü rota) geçmişe kayıt
    // BIRAKMAZ (geri tuşu tuzağı olmasın). Legacy politika yönlendirmeleri eskisi gibi location.hash (mobil davranış aynı).
    if ((modeSwitch && sameRoute) || b0 === "#/top10" || b0 === "#/dk-demo") location.replace(location.pathname + location.search + target);
    else location.hash = target; // yönlendir → hashchange tekrar render eder
    return;
  }
  const b = b0;
  // Masaüstü görünümü yerinde güncellenebiliyorsa remount etme:
  //   yalnız ?sorgu değişti → view.update(query) · kimliği aynı oturum yayını → view.onSession(session) true dönerse
  if (_view && _view.key === b && b === _lastRenderedHash && mode === _lastMode && !identityChanged) {
    if (reason === "hash" && typeof _view.update === "function") {
      try { _view.update(queryOf(location.hash)); } catch (e) { console.error(e); }
      return;
    }
    if (reason === "session" && typeof _view.onSession === "function") {
      let handled = false;
      try { handled = _view.onSession(session) === true; } catch (e) { console.error(e); }
      if (handled) return;
    }
  }
  // Aynı rotada oturum-verisi (emit → refreshProfile/token yenileme) tetikli tam yeniden
  // kurulum, odaktaki input'u yok edip mobilde klavyeyi kapatmasın: bir metin alanı
  // odaktaysa ve rota + görünüm modu DEĞİŞMEDİYSE yeniden çizmeyi atla. (Navigasyon/redirect üstte hallolur.)
  // Masaüstünde giriş/çıkış (kimlik değişimi) bu korumayı aşar: giriş modalındaki odak misafir arayüzünü dondurmasın.
  const _ae = document.activeElement;
  if (b === _lastRenderedHash && mode === _lastMode && !(desk && identityChanged) && _ae && (_ae.tagName === "INPUT" || _ae.tagName === "TEXTAREA" || _ae.isContentEditable)) return;
  // Mod geçişinde içerik iki modda da AYNI legacy görünümse (masaüstü görünümü yok / NOT_READY) DOM'a dokunma:
  // yazılmış form verisi, kaydırma ve odak korunur (ör. #/login 1440→700, iPad döndürme, %200 yakınlaştırma).
  const keepLegacy = modeSwitch && sameRoute && _mounted.kind === "legacy" && _mounted.base === b;
  const hadFocus = focusInApp();
  _lastRenderedHash = b;
  _lastMode = mode;
  const seq = ++_seq;
  destroyView(modeSwitch ? "mode" : identityChanged ? "identity" : reason);
  if (mode === "desktop") {
    const r = desktopRouteFor(b);
    if (r) { mountDesktop(r, b, seq, { keepLegacy, hadFocus }); return; }
  }
  if (keepLegacy) { setDkFlag(false); return; }
  renderLegacy(b);
}

// Legacy dispatch — DEĞİŞMEDİ (yalnız fonksiyona alındı).
function renderLegacy(b) {
  setDkFlag(false);
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
  mountNode(node instanceof Node ? node : h("div", {}, "…"), "legacy", b);
}

// ── Masaüstü görünümleri ──
const stale = (seq, b) => seq !== _seq || base(location.hash) !== b || viewMode() !== "desktop";
const decodeSeg = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const ctxFor = (b, r) => ({ base: b, seg: b.split("/").map(decodeSeg), query: queryOf(location.hash), session, route: r });

// Rota değişiminde odak #app içindeydiyse (tıklanan/klavyeyle seçilen gezinme öğesi yeniden kurulumla gitti) yeni görünümün
// içerik bölgesine (#dk-main, tabindex=-1) taşı → sonraki Tab atlama bağlantısına dönmez, ekran okuyucu yeni içerikte kalır.
function restoreFocus(node) {
  const ae = document.activeElement;
  if (ae && ae !== document.body && node.contains(ae)) return;
  const t = node.querySelector("#dk-main");
  try { t?.focus({ preventScroll: true }); } catch (_) {}
}

// → "ok" | "stale" | "notready" | "error"
async function tryMountDesktop(r, b, seq, hadFocus = false) {
  const css = [...BASE_CSS, ...(r.css || [])];
  // Hazır olduğu biliniyorsa CSS modülle paralel yüklenir; bilinmiyorsa önce modül (NOT_READY yedeği boşuna stil indirmesin).
  let cssReady = knownReady(r) === true ? ensureCssAll(css) : null;
  let m;
  try { m = await loadRouteModule(r); } catch (e) { console.error(e); return "error"; }
  if (stale(seq, b)) return "stale";
  if (!moduleReady(r, m)) return "notready";
  if (!cssReady) cssReady = ensureCssAll(css);
  await cssReady;                                                  // FOUC yok: CSS yüklenmeden mount etme
  if (stale(seq, b)) return "stale";
  let v;
  try { v = m[r.fn](ctxFor(b, r)); } catch (e) { console.error(e); return "error"; }
  if (!v || !(v.node instanceof Node)) return "error";
  if (stale(seq, b)) { try { v.destroy?.(); } catch (_) {} return "stale"; }
  _view = { ...v, key: b, route: r };
  setDkFlag(true);
  mountNode(v.node, "desktop", b);
  if (hadFocus) restoreFocus(v.node);
  return "ok";
}

// keepLegacy: mod geçişinde #app'te bu rotanın legacy görünümü duruyor → hazır masaüstü görünümü yoksa ona dokunma
// (spinner da gösterme). hadFocus: render öncesi odak #app içindeydi (→ restoreFocus).
async function mountDesktop(r, b, seq, { keepLegacy = false, hadFocus = false } = {}) {
  ensureDesktopFonts();
  if (!keepLegacy) mountNode(bootSpinner(), "spinner", b);
  let st = await tryMountDesktop(r, b, seq, hadFocus);
  if (st === "ok" || st === "stale") return;
  // Panel rotası hazır değilse: legacy içerik YENİ kabukta (legacy-in-shell; kabuk da hazır değilse atlanır)
  if (r.panel && !r.legacyShell) {
    const lr = legacyPanelRoute(r.panel);
    if (lr) {
      st = await tryMountDesktop(lr, b, seq, hadFocus);
      if (st === "ok" || st === "stale") return;
    }
  }
  if (stale(seq, b)) return;
  // Legacy'ye düş. Legacy politika başka rota istiyorsa (misafir "#/" → "#/kesfet", sanatçı "#/kesfet" → "#/artist",
  // "#/top10" → "#/kesfet") oraya git — masaüstü görünümü hazır olana dek davranış legacy ile birebir.
  const lt = resolve(false);
  if (lt !== b) { location.replace(location.pathname + location.search + lt); return; }
  if (keepLegacy && _mounted.kind === "legacy" && _mounted.base === b) { setDkFlag(false); return; }
  renderLegacy(b);
}

onSession(() => render("session"));
window.addEventListener("hashchange", () => render("hash"));
// ≤768 ↔ ≥769 geçişi: aynı rotayı diğer modda baştan çiz (masaüstü ekleri mobilde geçersizse yönlendirir).
// İki modda da aynı legacy görünüm çiziliyorsa DOM korunur; metin alanı odakta / form kirliyse geçiş ertelenir (render).
onViewModeChange(() => render("mode"));
initAuth();
