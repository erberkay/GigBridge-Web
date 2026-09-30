// MASAÜSTÜ ROTA KAYDI — rota → tembel modül + görünüm fonksiyonu + CSS dosyaları.
// js/app.js yalnız ≥769 px'te (viewport.isDesktop) bu tabloya bakar; eşleşme yoksa legacy görünüm AYNEN çizilir.
// Bir modül `export const NOT_READY = true` verirse router legacy'ye düşer (panel rotalarında önce legacy-in-shell).
//
// Görünüm sözleşmesi (her js/desktop/** modülü):
//   export function <fn>(ctx) → { node: HTMLElement, destroy?(), update?(query: URLSearchParams), onSession?(session): boolean }
//   ctx = { base: "#/etkinlik/abc", seg: ["#","etkinlik","abc"] (URI-çözülmüş), query: URLSearchParams, session, route: <bu kayıt> }
//   - update(query): yalnız ?sorgu değişen hashchange'de çağrılır (remount YOK). Filtre yazarken helpers.writeQuery (replaceState).
//   - onSession(session): oturum yayınında (refreshProfile vb.) kimlik aynıysa çağrılır; true dönerse remount edilmez.
//   - destroy(): rota/mod değişiminde çağrılır → onSnapshot unsub, interval, Leaflet map.remove(), document dinleyicileri.
//
// Dosya sahipliği (hangi uygulayıcı hangi dosyaya dokunur): specs/foundation.md §3.
// Bu dosyaya yalnız foundation dokunur (yeni rota gerekiyorsa foundation'a bildir).

// Her masaüstü görünümünden önce yüklenen ortak CSS (sırası önemli: base → ortak bileşenler)
export const BASE_CSS = ["css/dk-base.css", "css/dk-ui.css"];
// Kabuk CSS'leri (foundation adım 2)
const SH = {
  public: ["css/dk-public-shell.css"],                                  // PublicHeader + PublicFooter
  account: ["css/dk-public-shell.css", "css/dk-account-shell.css"],     // + AccountLayout kenar menüsü
  auth: ["css/dk-auth-shell.css"],                                      // AuthSplit
  panel: ["css/dk-panel-shell.css"],                                    // PanelShell (sanatçı/mekan/org/admin)
};

// ── eşleştiriciler ──
const is = (x) => (b) => b === x;
const sub = (x) => (b) => b.startsWith(x + "/") && b.length > x.length + 1;           // x/:id (id zorunlu)
const pre = (x) => (b) => b === x || b.startsWith(x + "/");                           // x ve x/…
const any = (...fs) => (b) => fs.some((f) => f(b));

// R(anahtar, artboard, eşleştirici, modül, fonksiyon, alan, css[], ek)
const R = (key, artboard, match, mod, fn, area, css, extra = {}) => ({ key, artboard, match, mod, fn, area, css, ...extra });

export const DESKTOP_ROUTES = [
  // ════ Herkese açık (misafir + dinleyici; masaüstünde panel rolleri de salt-okuma görür) ════
  R("landing", "WebLanding", is("#/"), "public/landing.js", "landingView", "public", [...SH.public, "css/dk-landing.css"], { role: "customer", spec: "public-a.md §2" }),
  R("kesfet", "WebKesfet", is("#/kesfet"), "public/kesfet.js", "kesfetView", "public", [...SH.public, "css/dk-kesfet.css"], { role: "customer", spec: "public-a.md §1" }),
  R("etkinlikler", "WebEtkinlikler", is("#/etkinlikler"), "public/etkinlikler.js", "etkinliklerView", "public", [...SH.public, "css/dk-etkinlikler.css"], { role: "customer", spec: "public-a.md §3" }),
  R("etkinlik", "WebEtkinlik", sub("#/etkinlik"), "public/etkinlik.js", "etkinlikView", "public", [...SH.public, "css/dk-etkinlik.css"], { role: "customer", spec: "public-b.md WebEtkinlik" }),
  R("katilimcilar", "WebKatilimcilar", sub("#/katilimcilar"), "public/katilimcilar.js", "katilimcilarView", "public", [...SH.public, "css/dk-katilimcilar.css"], { role: "customer", spec: "public-b.md WebKatilimcilar" }),
  R("sanatci", "WebSanatci", sub("#/sanatci"), "public/sanatci.js", "sanatciView", "public", [...SH.public, "css/dk-sanatci-detay.css"], { role: "customer", spec: "public-b.md WebSanatci" }),
  R("mekan", "WebMekan", sub("#/mekan"), "public/mekan.js", "mekanView", "public", [...SH.public, "css/dk-mekan-detay.css"], { role: "customer", spec: "public-b.md WebMekan" }),
  R("harita", "WebHarita", is("#/harita"), "public/harita.js", "haritaView", "public", [...SH.public, "css/dk-harita.css"], { role: "customer", spec: "public-a.md §4" }),
  R("akis", "WebAkis", is("#/akis"), "public/akis.js", "akisView", "public", [...SH.public, "css/dk-akis.css"], { role: "customer", spec: "public-a.md §5" }),
  R("top10", "(WebSanatciTop10'dan türetilir — dinleyici Top 10 artboard'u yok)", is("#/top10"), "public/top10.js", "top10View", "public", [...SH.public, "css/dk-top10.css"], { role: "customer", spec: "public-a.md 'Header Top 10 link target' + sanatci.md WebSanatciTop10" }),

  // ════ Hesabım (dinleyici; #/profil ve #/mesajlar misafire de açık → giriş CTA'sı) ════
  R("profil", "WebProfil", is("#/profil"), "account/profil.js", "profilView", "account", [...SH.account, "css/dk-profil.css"], { role: "customer", spec: "hesap.md WebProfil" }),
  R("biletlerim", "WebBiletlerim", is("#/biletlerim"), "account/biletlerim.js", "biletlerimView", "account", [...SH.account, "css/dk-biletlerim.css"], { role: "customer", spec: "hesap.md WebBiletlerim" }),
  R("takip", "WebTakip", is("#/takip"), "account/takip.js", "takipView", "account", [...SH.account, "css/dk-takip.css"], { role: "customer", spec: "hesap.md WebTakip" }),
  R("favoriler", "WebFavoriler", is("#/favoriler"), "account/favoriler.js", "favorilerView", "account", [...SH.account, "css/dk-favoriler.css"], { role: "customer", spec: "hesap.md WebFavoriler" }),
  R("katildiklarim", "WebKatildiklarim", is("#/katildiklarim"), "account/katildiklarim.js", "katildiklarimView", "account", [...SH.account, "css/dk-katildiklarim.css"], { role: "customer", spec: "hesap.md WebKatildiklarim" }),
  R("yorumlarim", "WebYorumlarim", is("#/yorumlarim"), "account/yorumlarim.js", "yorumlarimView", "account", [...SH.account, "css/dk-yorumlarim.css"], { role: "customer", spec: "hesap.md WebYorumlarim" }),
  R("bildirimler", "WebBildirimler", is("#/bildirimler"), "account/bildirimler.js", "bildirimlerView", "account", [...SH.account, "css/dk-bildirimler.css"], { role: "customer", spec: "hesap.md WebBildirimler" }),
  R("mesajlar", "WebMesajlar", is("#/mesajlar"), "messages/mesajlar.js", "mesajlarView", "account", [...SH.public, "css/dk-mesajlar.css"], { role: "customer", spec: "hesap.md WebMesajlar" }),

  // ════ Giriş / kayıt akışı ════
  R("giris", "WebGiris", is("#/login"), "auth/giris.js", "girisView", "auth", [...SH.auth, "css/dk-giris.css"], { spec: "auth.md WebGiris (modal + #/login tam sayfa)" }),
  R("kayit", "WebKayit", is("#/register"), "auth/kayit.js", "kayitView", "auth", [...SH.auth, "css/dk-kayit.css"], { spec: "auth.md WebKayit" }),
  R("dogrula", "WebDogrula", is("#/verify"), "auth/dogrula.js", "dogrulaView", "auth", [...SH.auth, "css/dk-dogrula.css"], { spec: "auth.md WebDogrula" }),
  R("onay", "WebOnayBekleniyor", is("#/pending"), "auth/onay-bekleniyor.js", "onayBekleniyorView", "auth", [...SH.auth, "css/dk-onay-bekleniyor.css"], { spec: "auth.md WebOnayBekleniyor" }),
  R("rolsec", "WebRolSec", is("#/setup"), "auth/rol-sec.js", "rolSecView", "auth", [...SH.auth, "css/dk-rol-sec.css"], { spec: "auth.md WebRolSec" }),
  R("admingiris", "WebAdminGiris", is("#/yonetici"), "auth/admin-giris.js", "adminGirisView", "auth", [...SH.auth, "css/dk-admin-giris.css"], { spec: "auth.md WebAdminGiris" }),

  // ════ Sanatçı paneli ════
  R("artistPanel", "WebSanatciPanel", is("#/artist"), "artist/panel.js", "artistPanelView", "panel", [...SH.panel, "css/dk-sanatci-panel.css"], { role: "artist", panel: "artist", nav: "home", spec: "sanatci.md WebSanatciPanel" }),
  R("artistTeklif", "WebSanatciTeklif", sub("#/artist/teklif"), "artist/teklif.js", "artistTeklifView", "panel", [...SH.panel, "css/dk-sanatci-teklif.css"], { role: "artist", panel: "artist", nav: "home", spec: "sanatci.md WebSanatciTeklif" }),
  R("artistKesfet", "WebSanatciKesfet", is("#/artist/kesfet"), "artist/kesfet.js", "artistKesfetView", "panel", [...SH.panel, "css/dk-sanatci-kesfet.css"], { role: "artist", panel: "artist", nav: "kesfet", spec: "sanatci.md WebSanatciKesfet" }),
  R("artistTop10", "WebSanatciTop10", is("#/artist/top10"), "artist/top10.js", "artistTop10View", "panel", [...SH.panel, "css/dk-sanatci-top10.css"], { role: "artist", panel: "artist", nav: "top10", spec: "sanatci.md WebSanatciTop10" }),
  R("artistMekanlar", "WebSanatciMekanlar", is("#/artist/mekanlar"), "artist/mekanlar.js", "artistMekanlarView", "panel", [...SH.panel, "css/dk-sanatci-mekanlar.css"], { role: "artist", panel: "artist", nav: "mekanlar", spec: "sanatci.md WebSanatciMekanlar" }),
  R("artistMesaj", "WebPanelMesajlar", is("#/artist/mesaj"), "messages/panel-mesajlar.js", "panelMesajlarView", "panel", [...SH.panel, "css/dk-panel-mesajlar.css"], { role: "artist", panel: "artist", nav: "mesaj", spec: "sanatci.md WebPanelMesajlar" }),
  R("artistProfil", "WebSanatciProfil", is("#/artist/profil"), "artist/profil.js", "artistProfilView", "panel", [...SH.panel, "css/dk-sanatci-profil.css"], { role: "artist", panel: "artist", nav: "profil", spec: "sanatci.md WebSanatciProfil" }),
  // artboard'u olmayan sanatçı sekmeleri: sahnelerim, yorumlar, bildirimler, sanatci/:id (+ bilinmeyenler) → legacy-in-shell
  R("artistLegacy", "— (legacy-in-shell)", pre("#/artist"), "artist/legacy.js", "artistLegacyView", "panel", [...SH.panel], { role: "artist", panel: "artist", legacyShell: true, spec: "foundation.md §4" }),

  // ════ Mekan paneli ════
  R("venuePanel", "WebMekanPanel", is("#/venue"), "venue/panel.js", "venuePanelView", "panel", [...SH.panel, "css/dk-mekan-panel.css"], { role: "venue", panel: "venue", nav: "home", spec: "mekan.md WebMekanPanel" }),
  R("venueOlustur", "WebMekanEtkinlikOlustur", any(is("#/venue/olustur"), sub("#/venue/duzenle")), "venue/etkinlik-olustur.js", "venueEtkinlikOlusturView", "panel", [...SH.panel, "css/dk-mekan-etkinlik-olustur.css"], { role: "venue", panel: "venue", nav: "olustur", spec: "mekan.md WebMekanEtkinlikOlustur (#/venue/duzenle/:id = düzenleme modu, YENİ rota)" }),
  R("venueSanatci", "WebMekanSanatciBul", is("#/venue/sanatci"), "venue/sanatci-bul.js", "venueSanatciBulView", "panel", [...SH.panel, "css/dk-mekan-sanatci-bul.css"], { role: "venue", panel: "venue", nav: "sanatci", spec: "mekan.md WebMekanSanatciBul" }),
  R("venueAnalitik", "WebMekanAnalitik", is("#/venue/analitik"), "venue/analitik.js", "venueAnalitikView", "panel", [...SH.panel, "css/dk-mekan-analitik.css"], { role: "venue", panel: "venue", nav: "analitik", spec: "mekan.md WebMekanAnalitik" }),
  R("venueProfil", "WebMekanProfil", is("#/venue/profil"), "venue/profil.js", "venueProfilView", "panel", [...SH.panel, "css/dk-mekan-profil.css"], { role: "venue", panel: "venue", nav: "profil", spec: "mekan.md WebMekanProfil" }),
  R("venueMesaj", "WebPanelMesajlar", is("#/venue/mesaj"), "messages/panel-mesajlar.js", "panelMesajlarView", "panel", [...SH.panel, "css/dk-panel-mesajlar.css"], { role: "venue", panel: "venue", nav: "mesaj", spec: "sanatci.md WebPanelMesajlar" }),
  // takip, performans/:id, degerlendir (+ bilinmeyenler) → legacy-in-shell
  R("venueLegacy", "— (legacy-in-shell)", pre("#/venue"), "venue/legacy.js", "venueLegacyView", "panel", [...SH.panel], { role: "venue", panel: "venue", legacyShell: true, spec: "foundation.md §4" }),

  // ════ Organizatör paneli ════
  R("orgPanel", "WebOrgPanel", is("#/organizer"), "organizer/panel.js", "orgPanelView", "panel", [...SH.panel, "css/dk-org-panel.css"], { role: "organizer", panel: "organizer", nav: "home", spec: "org-admin.md WebOrgPanel" }),
  R("orgEtkinlik", "WebOrgEtkinlikler", is("#/organizer/etkinlik"), "organizer/etkinlikler.js", "orgEtkinliklerView", "panel", [...SH.panel, "css/dk-org-etkinlikler.css"], { role: "organizer", panel: "organizer", nav: "etkinlik", spec: "org-admin.md WebOrgEtkinlikler" }),
  R("orgMekan", "WebOrgMekanSec", is("#/organizer/mekan"), "organizer/mekan-sec.js", "orgMekanSecView", "panel", [...SH.panel, "css/dk-org-mekan-sec.css"], { role: "organizer", panel: "organizer", nav: "mekan", spec: "org-admin.md WebOrgMekanSec" }),
  R("orgEkip", "WebOrgEkip", is("#/organizer/ekip"), "organizer/ekip.js", "orgEkipView", "panel", [...SH.panel, "css/dk-org-ekip.css"], { role: "organizer", panel: "organizer", nav: "ekip", spec: "org-admin.md WebOrgEkip" }),
  R("orgProfil", "WebOrgProfil", is("#/organizer/profil"), "organizer/profil.js", "orgProfilView", "panel", [...SH.panel, "css/dk-org-profil.css"], { role: "organizer", panel: "organizer", nav: "profil", spec: "org-admin.md WebOrgProfil" }),
  R("orgMesaj", "WebPanelMesajlar", is("#/organizer/mesaj"), "messages/panel-mesajlar.js", "panelMesajlarView", "panel", [...SH.panel, "css/dk-panel-mesajlar.css"], { role: "organizer", panel: "organizer", nav: "mesaj", spec: "sanatci.md WebPanelMesajlar" }),
  // bildirim (+ bilinmeyenler) → legacy-in-shell
  R("orgLegacy", "— (legacy-in-shell)", pre("#/organizer"), "organizer/legacy.js", "orgLegacyView", "panel", [...SH.panel], { role: "organizer", panel: "organizer", legacyShell: true, spec: "foundation.md §4" }),

  // ════ Yönetici (#/admin + sekme alt rotaları #/admin/vip|ad|sorun) ════
  R("admin", "WebAdmin", pre("#/admin"), "admin/admin.js", "adminView", "panel", [...SH.panel, "css/dk-admin-panel.css"], { role: "admin", spec: "org-admin.md WebAdmin" }),
];

// ════ Geliştirici kataloğu (#/dk-demo) — YALNIZ yerel emülatör oturumunda (localhost/127.0.0.1 + sessionStorage gb_emu="1") ════
// Tüm kabukları ve ortak bileşenleri örnek veriyle çizer (foundation adım 2). Üretimde kayıt EKLENMEZ → rota yok.
export const DEV_DEMO = (() => {
  try { return (location.hostname === "127.0.0.1" || location.hostname === "localhost") && sessionStorage.getItem("gb_emu") === "1"; } catch { return false; }
})();
if (DEV_DEMO) {
  DESKTOP_ROUTES.unshift(R("dkDemo", "(geliştirici kataloğu)", is("#/dk-demo"), "dev/demo.js", "dkDemoView", "dev",
    [...SH.public, ...SH.account, ...SH.auth, ...SH.panel, "css/dk-demo.css"], { role: "customer", dev: true, spec: "foundation.md §9" }));
}

// Panel rolü → legacy-in-shell kaydı (tasarımlı panel görünümü NOT_READY iken router önce bunu dener)
const LEGACY_SHELL = Object.fromEntries(DESKTOP_ROUTES.filter((r) => r.legacyShell).map((r) => [r.panel, r]));
export const legacyPanelRoute = (role) => LEGACY_SHELL[role] || null;

export const desktopRouteFor = (b) => DESKTOP_ROUTES.find((r) => r.match(b)) || null;
export const routeByKey = (key) => DESKTOP_ROUTES.find((r) => r.key === key) || null;

// ── Modül yükleme + hazır olma durumu (tek önbellek; router ve kabuklar paylaşır) ──
// loadRouteModule(r) → Promise<module> (hata olursa önbellekten düşer, sonra yeniden denenir).
// moduleReady(r, m) — modül NOT_READY değil ve görünüm fonksiyonunu dışa aktarıyor.
// routeReady("#/kesfet") → Promise<boolean>: o rotanın masaüstü görünümü hazır mı (modülü içe aktararak öğrenir).
// routeReadySync(b) → true | false | undefined (henüz bilinmiyor). PanelShell "Siteye dön" + üst bar araması bunu kullanır:
// hedef görünüm NOT_READY iken bağlantı çıkmaz (legacy politika panel rollerini herkese açık sayfadan panele geri atar).
const _mods = new Map();   // r.mod → Promise<module>
const _ready = new Map();  // r.mod → boolean
export function loadRouteModule(r) {
  if (!_mods.has(r.mod)) {
    const p = import("./" + r.mod).then((m) => { _ready.set(r.mod, moduleReady(r, m)); return m; });
    p.catch(() => _mods.delete(r.mod));
    _mods.set(r.mod, p);
  }
  return _mods.get(r.mod);
}
export const moduleReady = (r, m) => !!m && !m.NOT_READY && typeof m[r.fn] === "function";
export const knownReady = (r) => _ready.get(r.mod);           // true | false | undefined
export function routeReadySync(b) { const r = desktopRouteFor(b); return r ? _ready.get(r.mod) : false; }
export function routeReady(b) {
  const r = desktopRouteFor(b);
  if (!r) return Promise.resolve(false);
  return loadRouteModule(r).then((m) => moduleReady(r, m), () => false);
}

// Statik (SPA DIŞI) artboard'lar — router'a GİRMEZ; ilgili HTML dosyaları düzenlenir (specs/seo.md).
export const STATIC_ARTBOARDS = {
  WebSehir: "canli-muzik/<şehir>/index.html",
  WebIlce: "canli-muzik/<şehir>/<ilçe>/index.html",
  WebRehber: "rehber/<konu>/index.html",
  WebIndir: "indir/index.html",
  WebYasal: "gizlilik.html + kullanim-kosullari.html",
  WebHesapSil: "hesap-sil.html",
  WebSifreSifirla: "sifirla.html",
};
