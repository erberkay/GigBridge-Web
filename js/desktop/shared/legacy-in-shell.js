// LEGACY-IN-SHELL — tasarımı (artboard'u) olmayan panel sekmelerini masaüstünde YENİ PanelShell içinde çizer.
// Legacy içerik (artist/venue/organizer renderTab & render* fonksiyonları — yalnız "export" eklendi) kabuğun
// içerik alanında bir uyumluluk sarmalayıcısına yazılır:
//     .dk-legacy > .page.has-nav[--role] > .content   ← legacy render(root) buraya
// .dk-legacy alt ağacı dk-base.css nötrlemesinden muaftır; .page.has-nav legacy "TEK STANDART" kurallarını
// korur, ızgara/kenar çubuğu davranışı dk-base.css §11'de kapatılır. Böylece bir masaüstü paneli asla eski ve
// yeni krom arasında gidip gelmez.
//
// Router akışı (js/app.js mountDesktop): tasarımlı panel görünümü NOT_READY ise önce bu adaptör denenir
// (registry.legacyPanelRoute(rol)); PanelShell de NOT_READY ise tamamen legacy görünüme düşülür.
// Sahibi: foundation (adım 1). Kabuk görünümü: panel-shell.js (adım 2).
import { h, clear, spinner, empty, ROLE } from "../../ui.js";
import { panelShell } from "./panel-shell.js";

const noopSetter = { set() {}, box: null };
// Kabuğun başlığına bağlanan sahte öğe: legacy kod titleEl.textContent = … yazınca kabuk başlığı güncellenir.
const textProxy = (fn) => ({ set textContent(v) { fn(v); }, get textContent() { return ""; } });

// Rol başına: legacy modül, renk, sekme → { nav anahtarı, başlık, alt başlık } ve çizim.
export const LEGACY_PANELS = {
  artist: {
    mod: "../../pages/artist.js",
    color: ROLE.artist,
    // sahnelerim/yorumlar/bildirimler/teklif → Ana Sayfa; sanatci → Keşfet (legacy navKeyFor + teklif)
    nav: (tab) => (["sahnelerim", "yorumlar", "bildirimler", "teklif"].includes(tab) ? "home" : tab === "sanatci" ? "kesfet" : tab),
    titles: { home: "Ana Sayfa", kesfet: "Keşfet", top10: "Top 10", mekanlar: "Mekan Değerlendir", mesaj: "Mesajlar", profil: "Profilim", sahnelerim: "Sahnelerim", yorumlar: "Aldığım Yorumlar", bildirimler: "Bildirimler", sanatci: "Sanatçı Profili" },
    head: (tab, s) => ({ subtitle: `Sanatçı Paneli · ${s.profile?.displayName || "Sanatçı"}` }),
    render(m, tab, root, seg) {
      if (tab === "home") return m.renderHome(root, { month: noopSetter, rating: noopSetter, earn: noopSetter, foll: noopSetter });
      if (tab === "sanatci") return m.renderArtistDetail(seg[3] || "", root);
      return m.renderTab(tab, root);
    },
  },
  venue: {
    mod: "../../pages/venue.js",
    color: ROLE.venue,
    // takip/degerlendir → Profil; performans → Analitik; olustur/duzenle → "olustur" (kenar çubuğu CTA'sı aktif)
    nav: (tab) => (["takip", "degerlendir"].includes(tab) ? "profil" : tab === "performans" ? "analitik" : tab === "duzenle" ? "olustur" : tab),
    titles: { home: "Ana Sayfa", olustur: "Etkinlik Oluştur", duzenle: "Etkinlik Düzenle", sanatci: "Sanatçı Bul", analitik: "Analitik", mesaj: "Mesajlar", profil: "Profil", takip: "Takip Ettiğim Sanatçılar", performans: "Sahne Performansı", degerlendir: "Sanatçı Değerlendir" },
    subs: { takip: "Yalnız siz görürsünüz", performans: "Sahne performansı", degerlendir: "Sanatçı değerlendir" },
    // Mekan üst barı: "{mekan adı} / {crumb}" + h1 (mekan §0.5). Ad kabuk tarafından eklenir; burada yalnız crumb.
    crumbs: { home: "Mekan Paneli", olustur: "Etkinlik oluştur / düzenle", duzenle: "Etkinlik oluştur / düzenle", sanatci: "Sanatçı bul", analitik: "Analitik", mesaj: "Mesajlar", profil: "Mekan profili" },
    head: (tab) => ({ crumb: LEGACY_PANELS.venue.crumbs[tab] || LEGACY_PANELS.venue.subs[tab] || "Mekan Paneli" }),
    async render(m, tab, root, seg, shell) {
      if (tab === "home") return m.renderHome(root, { revenue: h("div"), confirmed: h("div") });
      if (tab === "olustur") return m.renderCreate(root);
      if (tab === "sanatci") return m.renderArtists(root);
      if (tab === "analitik") return m.renderAnalytics(root);
      if (tab === "profil") return m.renderProfile(root);
      if (tab === "takip") return m.renderFollowing(root, textProxy((v) => shell.setSubtitle?.(v)));
      if (tab === "performans") return m.renderPerformance(root, seg[3] || "", textProxy((v) => shell.setTitle?.(v)));
      if (tab === "degerlendir") return m.renderReview(root);
      if (tab === "mesaj") { const { messagesView } = await import("../../pages/messages.js"); clear(root); return messagesView(root, ROLE.venue); }
      clear(root);
      root.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor."));
    },
  },
  organizer: {
    mod: "../../pages/organizer.js",
    color: ROLE.organizer,
    nav: (tab) => (tab === "bildirim" ? "home" : tab),
    titles: { home: "Ana Sayfa", etkinlik: "Etkinlikler", mekan: "Mekan Seç", ekip: "Ekip", mesaj: "Mesajlar", profil: "Profil", bildirim: "Bildirimler" },
    head: (tab, s, title) => ({ crumb: `ORGANİZATÖR / ${title.toLocaleUpperCase("tr-TR")}` }),
    render(m, tab, root) { return m.renderTab(tab, root); },
  },
};

// Sekme adı (legacy tabFromHash ile aynı; ?sorgu ve URI kodlaması temizlenmiş seg'den)
export const legacyTabOf = (seg) => seg[2] || "home";
export const panelNavKey = (role, tab) => LEGACY_PANELS[role]?.nav(tab) ?? tab;

// Oturum yayınında (refreshProfile, e-posta doğrulama yoklaması, token) profil İÇERİĞİ değişmediyse kabuğu yeniden kurma
// (kaydırma/popover/dinleyiciler korunur). İçerik değiştiyse legacy'deki gibi baştan çiz (legacy sayfalar profilden okur).
const profileFingerprint = (s) => { try { return JSON.stringify([s.user?.uid, s.user?.emailVerified, s.profile || null]); } catch { return null; } };

// Legacy render çağrısı SENKRON kısmında window'a eklenen "hashchange" dinleyicilerini yakala (ör. organizer renderNotifs
// listenNotifications'ı yalnız hashchange'de kapatıyor). destroy()'da bunlar sahte bir olayla çağrılır → gezinti dışı yeniden
// kurulumda (oturum yayını, mod geçişi) dinleyici birikmez. Global olay yayınlanmaz; yalnız yakalananlar çağrılır.
function captureHashListeners(fn) {
  const captured = [];
  const orig = window.addEventListener;
  window.addEventListener = function (type, listener, o) {
    if (type === "hashchange" && typeof listener === "function") captured.push(listener);
    return orig.call(this, type, listener, o);
  };
  let ret;
  try { ret = fn(); } finally { window.addEventListener = orig; }
  return { ret, captured };
}

// Görünüm: registry'deki <rol>/legacy.js modülleri bunu çağırır.
export function legacyPanelView(ctx, role) {
  const cfg = LEGACY_PANELS[role];
  const tab = legacyTabOf(ctx.seg);
  const title = cfg.titles[tab] || cfg.titles.home;
  const head = cfg.head(tab, ctx.session, title);
  // titleTag h1: tasarımsız sekmelerde içerikte sayfa başlığı yok → üst bar başlığı sayfanın h1'i (erişilebilirlik)
  const shell = panelShell({ role, active: cfg.nav(tab), title, subtitle: head.subtitle ?? cfg.subs?.[tab] ?? "", crumb: head.crumb ?? "", ctx, titleTag: "h1" });
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": cfg.color } }, content);
  shell.content.append(h("div", { class: "dk-legacy", dataset: { legacyRole: role, legacyTab: tab } }, page));
  let alive = true;
  let hashListeners = [];
  const fp = profileFingerprint(ctx.session);
  import(cfg.mod)
    .then((m) => {
      if (!alive) return;
      const { ret, captured } = captureHashListeners(() => cfg.render(m, tab, content, ctx.seg, shell));
      hashListeners = captured;
      return ret;
    })
    .catch((e) => {
      console.error(e);
      if (!alive) return;
      clear(content);
      content.append(empty("cloud-offline-outline", "Sayfa yüklenemedi", "Bağlantını kontrol edip yenile."));
    });
  return {
    node: shell.node,
    onSession(s) { return fp !== null && profileFingerprint(s) === fp; },
    destroy() {
      alive = false;
      // Legacy dinleyici temizliği (legacy davranışıyla aynı sınırlar):
      //  - artist renderHome/renderNotifs vb.: onSnapshot geri çağrısında root.isConnected yoksa kendini kapatır;
      //  - organizer renderNotifs: hashchange'de kapatır → yakalanan dinleyiciler burada çağrılır (gezinti dışı kurulumlarda da);
      //  - messagesView (tüm rollerin "mesaj" sekmesi): listenConversations yalnız liste↔sohbet geçişinde kapanıyor → legacy'de de
      //    sızıyor (legacy dosyasına dokunulmaz; WebPanelMesajlar görünümü hazır olunca ortadan kalkar).
      hashListeners.forEach((l) => { try { l.call(window, new HashChangeEvent("hashchange")); } catch (_) {} });
      hashListeners = [];
      try { shell.destroy?.(); } catch (e) { console.error(e); }
    },
  };
}
