// Müşteri deneyimi — Keşfet, Harita, Akış, Mesajlar, Profil + etkinlik/sanatçı/mekan detay
// + Takip/Favoriler/Katıldıklarım/Yorumlarım/Bildirimler. App backend'iyle birebir.
import { session, logout, refreshProfile } from "../store.js";
import {
  discoverEvents, eventById, userById, listRealArtists, listVenues, saveProfile, uploadImage,
  isAttending, attendEvent, unattendEvent, attendedEvents, eventAttendees,
  isFollowing, followArtist, unfollowArtist, followingList, artistFollowerCount, venueTimeline,
  isFavVenue, favVenue, unfavVenue, favVenues, isFavEvent, favEvent, unfavEvent, favEvents,
  artistReviews, submitArtistReview, getVenueReviews, submitVenueReview, myReviews, updateMyReview, deleteMyReview,
  listenTimeline, createPost, isLiked, toggleLike, listenComments, addComment,
  listenNotifications, markNotifRead, deleteNotif, deleteMyAccount, serverTimestamp,
  sendMessage, convIdFor,
} from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, card, badge, modal, lightbox, fmtDate, fmtTL, ROLE, profileTagline, profileResidency, featuredSet, venueChips, featuredReview, availabilityBadge, bookingRequestModal, rateCardBlock, suitabilityBlock, serviceAreaBlock, techRiderBlock, videoReel, languagesBlock, priceBadge, addOnsBlock, termsBlock, trustedBadge } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";
import { loginModal, changeEmailModal, changePasswordModal } from "./auth.js";
// Mobil Keşfet (Kesfet.dc.html) — CSS tembel yükleyici (css.js app.js'te zaten statik). Ortak SAF yardımcılar/ikonlar/tür
// renkleri/canlı sayaç YALNIZ Keşfet açılınca dinamik yüklenir (mkLoadMods).
import { ensureCss } from "../desktop/css.js";

const C = ROLE.customer;
const NAV = [
  { key: "kesfet",   label: "Keşfet",   icon: "compass-outline",     href: "#/kesfet" },
  { key: "harita",   label: "Harita",   icon: "map-outline",         href: "#/harita" },
  { key: "akis",     label: "Akış",     icon: "newspaper-outline",   href: "#/akis" },
  { key: "mesajlar", label: "Mesajlar", icon: "chatbubbles-outline", href: "#/mesajlar" },
  { key: "profil",   label: "Profil",   icon: "person-outline",      href: "#/profil" },
];
const TITLES = { kesfet: "Keşfet", harita: "Harita", akis: "Akış", mesajlar: "Mesajlar", profil: "Profil" };
const uid = () => session.user?.uid;
const myName = () => session.profile?.displayName || session.user?.displayName || "Kullanıcı";
// Gerçek (anonim olmayan) girişli hesap mı? Misafir → anonim oturum.
const authed = () => !!session.user && !session.guest;
// Misafir aksiyon kapısı: girişsizse giriş/kayıt modalı açar, true döner (işlemi durdur).
function loginGate(action) {
  if (authed()) return false;
  modal({
    title: "Giriş Gerekli",
    body: h("p", { class: "muted" }, (action ? action + " için " : "") + "bir hesapla giriş yapman gerekiyor. Kayıt olmak ücretsiz."),
    actions: [
      { label: "Kayıt Ol", variant: "ghost", ic: "person-add-outline", onClick: () => go("#/register") },
      { label: "Giriş Yap", ic: "log-in-outline", onClick: () => loginModal() },
    ],
  });
  return true;
}

function base() { return (location.hash || "#/kesfet").split("?")[0]; }
function tabFromHash() { return base().replace("#/", "") || "kesfet"; }
function go(hash) { location.hash = hash; }
const seg = (i) => decodeURIComponent(base().split("/")[i] || "");

// Detay sayfası sarmalayıcı: masaüstünde müşteri kenar çubuğunu korur (mobilde tam sayfa — app gibi).
function dtlWrap(...children) {
  return h("div", { class: "page has-nav dtl", style: { "--role": C } }, ...children, bottomnav(NAV, "", C));
}

// ── Keşfet (app HomeScreen paritesi) durum + yardımcılar ──
const PROVINCES = ["Adana","Adıyaman","Afyonkarahisar","Ağrı","Aksaray","Amasya","Ankara","Antalya","Ardahan","Artvin","Aydın","Balıkesir","Bartın","Batman","Bayburt","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Düzce","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkâri","Hatay","Iğdır","Isparta","İstanbul","İzmir","Kahramanmaraş","Karabük","Karaman","Kars","Kastamonu","Kayseri","Kilis","Kırıkkale","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Mardin","Mersin","Muğla","Muş","Nevşehir","Niğde","Ordu","Osmaniye","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Şanlıurfa","Şırnak","Tekirdağ","Tokat","Trabzon","Tunceli","Uşak","Van","Yalova","Yozgat","Zonguldak"];
const TRX = { "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u", "â": "a", "î": "i", "û": "u" };
const fold = (s) => String(s || "").replace(/[ıİşŞçÇğĞöÖüÜâîû]/g, (c) => TRX[c] || c).toLowerCase();
let activeCity = localStorage.getItem("gb_city") || "TÜMÜ";
let activeCategory = "TÜMÜ";
let userCoords = null; // "Konumumu Kullan" sonrası {lat,lng} — mesafe rozetleri için
function haversineKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function customerPage() {
  const b = base();
  if (b === "#/etkinlikler")       return detailShell("Etkinlikler", eventsListView);
  if (b.startsWith("#/etkinlik/")) return eventDetailPage(seg(2));
  if (b.startsWith("#/katilimcilar/")) return attendeesPage(seg(2));
  if (b.startsWith("#/sanatci/"))  return artistDetailPage(seg(2));
  if (b.startsWith("#/mekan/"))    return venueDetailPage(seg(2));
  if (b === "#/takip")       return detailShell("Takip Ettiklerim", followingView);
  if (b === "#/favoriler")   return detailShell("Favorilerim", favoritesView);
  if (b === "#/katildiklarim") return detailShell("Katıldıklarım", attendedView);
  if (b === "#/biletlerim")    return detailShell("Biletlerim", ticketsView);
  if (b === "#/yorumlarim")  return detailShell("Yorumlarım", myReviewsView);
  if (b === "#/bildirimler") return detailShell("Bildirimler", notificationsView);

  const tab = tabFromHash();
  if (tab === "kesfet") return kesfetPage(); // app HomeScreen paritesi — özel başlık + bölümler
  const guest = !authed();
  const rightBtn = guest
    ? h("button", { class: "icon-btn login-chip", onclick: () => loginModal(), title: "Giriş Yap" }, icon("log-in-outline", { size: 18 }), h("span", {}, "Giriş"))
    : h("button", { class: "icon-btn", onclick: () => go("#/bildirimler"), title: "Bildirimler" }, icon("notifications-outline", { size: 20 }));
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": C } },
    topbar(TITLES[tab] || "GigBridge", { subtitle: guest ? "Misafir" : myName(), color: C, right: rightBtn }),
    content,
    bottomnav(NAV, tab, C));
  renderTab(tab, content);
  return page;
}

async function renderTab(tab, root) {
  if (tab === "mesajlar") { clear(root); return messagesView(root, C); }
  if (tab === "profil")   return renderProfil(root);
  if (tab === "harita")   return renderHarita(root);
  if (tab === "akis")     return renderAkis(root);
  clear(root); root.append(empty("construct-outline", "Yakında", "Bu bölüm geliyor."));
}

// ── Ortak yardımcılar ──
function eventWhen(ev) { const d = typeof ev.date === "string" && ev.date ? ev.date : fmtDate(ev.eventAt || ev.date); return [d, ev.startTime].filter(Boolean).join(" · "); }
function msOf(ev) { const v = ev.eventAt ?? ev.date; try { if (v && typeof v.toMillis === "function") return v.toMillis(); const t = Date.parse(v); return isNaN(t) ? null : t; } catch { return null; } }
function isLive(ev) {
  const s = msOf(ev); if (s == null) return false;
  let e = null; try { if (ev.endAt && typeof ev.endAt.toMillis === "function") e = ev.endAt.toMillis(); } catch (_) {}
  if (e == null) e = s + 3 * 3600e3;
  const now = Date.now(); return now >= s && now <= e;
}
function fmtTime(v) { try { const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v); return isNaN(d) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function sect(title, ic, count, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head" }, h("h2", { class: "sect-title" }, icon(ic, { size: 15 }), " " + title),
      count ? h("span", { class: "count-pill" }, count) : null), ...kids);
}
function errBox(msg) { return empty("cloud-offline-outline", "Bir sorun oldu", msg || "Bağlantını kontrol edip tekrar dene."); }

function eventCard(ev) {
  const live = isLive(ev);
  return h("div", { class: "ecard", onclick: () => go("#/etkinlik/" + ev.id), style: { cursor: "pointer" } },
    h("div", { class: "ecard-banner", style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
      live ? h("span", { class: "vip-badge", style: { background: "#10b981" } }, icon("radio", { size: 10 }), "Şu an") : null,
      ev.vipStatus === "approved" ? h("span", { class: "vip-badge" }, icon("sparkles", { size: 10 }), "VIP") : null),
    h("div", { class: "ecard-body" },
      h("div", { class: "ecard-title" }, ev.title || "Etkinlik"),
      ev.artistName ? h("div", { class: "ecard-meta" }, icon("mic-outline", { size: 12 }), " " + ev.artistName) : null,
      h("div", { class: "ecard-meta" }, icon("business-outline", { size: 12 }), " " + (ev.venueName || "Mekan")),
      h("div", { class: "ecard-meta" }, icon("calendar-outline", { size: 12 }), " " + eventWhen(ev)),
      h("div", { class: "ecard-meta", style: { color: ev.ticketPrice ? "var(--amber)" : "var(--success)", fontWeight: "700" } }, ev.ticketPrice ? fmtTL(ev.ticketPrice) : "Ücretsiz")));
}
// ══════════ KEŞFET (mobil ≤768) — uygulamanın Kesfet.dc.html ekranı birebir ══════════
// Görünüm: Kesfet.dc.html (selamlama + şehir başlığı, zil/profil, düz arama çubuğu + tür filtresi, eşit 4 sekme + kayan prizma
// göstergesi, kart dili). Alt sekme çubuğu: legacy bottomnav() — diğer 4 sekmeyle aynı (tasarım çubuğu ui.js'e ortak aday).
// Veri/davranış legacy renderKesfet ile AYNI: şehir listesi (Konumumu kullan + arama + 81 il, gb_city), arama (etkinlik +
// app gibi sanatçı/mekan), türe göre filtre (+ "Sanatçıları Ara"), sekmeler sayfa değişmeden kayar, hero
// karuseli (VIP önce, sonra tarih; ilk 5; 4 sn), GigBridge Top 10 (attendeeCount), Sadece GigBridge'de (+ boş durum), En Yeniler
// (isNew), Bu Hafta (7 gün), Popüler Sanatçılar (takip). Stiller: css/m-kesfet.css — hepsi .mk kökü altında (diğer mobil rotalar
// piksel piksel aynı kalır). export: yönetici paneli bu ekranı modalda önizler (admin.js) — API aynı: kesfetPage() → düğüm.
const MK_CSS = "css/m-kesfet.css";
const MK_CATS = ["TÜMÜ", "ETKİNLİKLER", "MEKANLAR", "SANATÇILAR"];
const MK_CAT_SLUG = { "TÜMÜ": "tumu", "ETKİNLİKLER": "etkinlikler", "MEKANLAR": "mekanlar", "SANATÇILAR": "sanatcilar" };
let _mkSeq = 0;
// Tasarımın altın TOP 10 çipi (Popüler Sanatçılar başlığı → app ListenerTop10). Mobil webde bu rota YOK (app.js ≤768'de
// #/top10 → #/kesfet), çip bu yüzden gizli. Mobil dinleyici Top 10 görünümü gelince "#/top10" yap → çip görünür.
const MK_TOP10_HREF = null;

// Keşfet'e özel ortak modüller (masaüstü paylaşımlı SAF yardımcılar, ikonlar, tür renkleri, canlı sayaç) — YALNIZ Keşfet
// açılınca dinamik yüklenir: customer.js tüm mobil rotalarda statik yüklendiği için diğer rotalar bu ~49 KB'ı ödemesin.
// Yükleme (ve m-kesfet.css) bitene dek sayfa legacy döner simgesini gösterir.
let H = null, famColor = null, svgRaw = null, svgIcon = null, subscribeLive = null, _mkMods = null;
function mkLoadMods() {
  if (!_mkMods) {
    _mkMods = Promise.all([
      import("../desktop/shared/helpers.js"), import("../desktop/shared/genres.js"),
      import("../desktop/shared/icons.js"), import("../desktop/shared/live.js"),
    ]).then(([hp, gn, ic, lv]) => { H = hp; famColor = gn.genreColor; svgRaw = ic.svgRaw; svgIcon = ic.svgIcon; subscribeLive = lv.subscribeLive; });
    _mkMods.catch(() => { _mkMods = null; }); // hata → sonraki açılışta yeniden dene
  }
  return _mkMods;
}

// Kesfet.dc.html ikon gövdeleri — birebir kopya
const MKI = {
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  chev: '<path d="m6 9 6 6 6-6"></path>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path>',
  user: '<circle cx="12" cy="9" r="3.5"></circle><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  sliders: '<path d="M4 7h16M7 12h10M10 17h4"></path>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor"></path><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"></path><path d="M14 7v10" stroke-dasharray="2 2"></path>',
  people: '<circle cx="9" cy="9" r="3"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path><circle cx="17" cy="10" r="2.3"></circle><path d="M15.5 14.6A4.5 4.5 0 0 1 21 19"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  navFill: '<path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.6 1.6 6.6c.2.8 1.3.9 1.6.1z"></path>', // WebKesfet CityPicker
};

// JetBrains Mono 700 YALNIZ bu ekran için, ayrı aile adıyla ("MK Mono"). index.html'in ortak isteği 400/500/600 (mobil birebir
// kuralı); global 'JetBrains Mono' ailesine 700 eklemek diğer mobil rotaların mono+700 metnini değiştirirdi. Başarısızsa
// CSS 'JetBrains Mono' 600 yüzüne düşer (zarif yedek).
let _mkMonoBold = null;
function mkEnsureMonoBold() {
  if (_mkMonoBold) return;
  _mkMonoBold = fetch("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&display=swap")
    .then((r) => (r.ok ? r.text() : ""))
    .then((css) => {
      if (!/@font-face/.test(css)) { _mkMonoBold = null; return; }
      const s = document.createElement("style");
      s.dataset.mk = "font";
      s.textContent = css.replace(/font-family:\s*['"]JetBrains Mono['"]/g, "font-family: 'MK Mono'");
      document.head.append(s);
    })
    .catch(() => { _mkMonoBold = null; });
}

// Legacy sayfaların destroy kancası yok → düğüm DOM'dan çıkınca (rota değişimi / önizleme kapandı) temizlik: belge
// dinleyicileri, karusel aralığı, pencere boyutu dinleyicisi, canlı bildirim aboneliği. Yönlendirici/önizleme döndürülen düğümü
// eşzamanlı ekler → mikro görev/ilk karede bağlı görülür; bağlandıktan sonra ayrılan sayfa ≤1 sn içinde temizlenir. Hiç
// bağlanmayan düğüm için 15 sn emniyet süresi. add(): ölü sayfada kaydedilen temizlik hemen çalışır.
function mkLife(node) {
  const fns = [];
  let seen = false, idle = 0, dead = false;
  const mark = () => { if (node.isConnected) seen = true; };
  const kill = () => {
    if (dead) return;
    dead = true; clearInterval(iv);
    fns.splice(0).forEach((f) => { try { f(); } catch (_) {} });
  };
  const iv = setInterval(() => {
    if (node.isConnected) { seen = true; return; }
    if (!seen && ++idle < 15) return;
    kill();
  }, 1000);
  queueMicrotask(mark);
  requestAnimationFrame(mark);
  return {
    add(f) { if (dead) { try { f(); } catch (_) {} } else fns.push(f); return f; },
    get dead() { return dead; },
  };
}

const mkReduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const mkCityLabel = (c) => (c === "TÜMÜ" ? "Tüm Şehirler" : c);
function mkGreeting(d = new Date()) {
  const x = d.getHours();
  if (x >= 5 && x < 12) return "GÜNAYDIN";
  if (x >= 12 && x < 18) return "İYİ GÜNLER";
  if (x >= 18 && x < 22) return "İYİ AKŞAMLAR";
  return "İYİ GECELER";
}
const mkUp = (s) => String(s || "").toLocaleUpperCase("tr-TR");
// Tür adı büyük harf: İngilizce adlar en-US ("MELODIC TECHNO", "INDIE" — tasarım), Türkçe adlar tr-TR ("AKUSTİK", "TÜRKÜ").
// SHARED-CANDIDATE: genres.js genreLabel() her adı tr-TR ile büyütüyor ("MELODİC") — masaüstü de aynı karara bağlanmalı.
const MK_TR_ASCII = new Set(["akustik", "klasik", "alternatif", "elektronik", "enstrumantal", "arabesk", "damar", "caz", "muzik"]);
const mkGenreUp = (g) => {
  const s = String(g || "").trim();
  if (!s) return "";
  const tr = /[çğıöşüâîûÇĞİÖŞÜ]/.test(s) || s.split(/[\s/&-]+/).some((w) => MK_TR_ASCII.has(fold(w)));
  return s.toLocaleUpperCase(tr ? "tr-TR" : "en-US");
};
const mkGenre = (ev) => mkGenreUp((Array.isArray(ev.genre) ? ev.genre[0] : ev.genre) || "");
const mkPrice = (ev) => (ev.ticketPrice ? fmtTL(ev.ticketPrice) : "Ücretsiz");
const mkHref = (ev) => "#/etkinlik/" + ev.id;
const mkVh = (t) => h("span", { class: "mk-vh" }, t); // yalnız ekran okuyucu
// Durum rozeti — legacy statusBadge önceliği/metni (dolu > VIP > sadece GigBridge'de > yoğun > popüler > yeni), tasarım renkleri
function mkStatus(ev) {
  const att = ev.attendeeCount ?? 0;
  if (ev.capacity && att >= ev.capacity) return { label: "BEKLEME LİSTESİNE KATIL!", color: "#A3A7AF" };
  if (ev.vipStatus === "approved") return { label: "VIP DENEYİM", color: "#FFD700" };
  if (ev.isExclusive) return { label: "SADECE GİGBRİDGE'DE", color: "#FF8A2A" };
  if (att > 400) return { label: "YOĞUN İLGİ", color: "#FF5A6E" };
  if (att > 200) return { label: "ŞİMDİ POPÜLER", color: "#FF4FA3" };
  if (ev.isNew) return { label: "YENİ", color: "#7CE0B0" };
  return null;
}
// "BU GECE" (tasarım) — gerçek veriyle: şu an sürüyor → ŞU AN, bugün 17:00 sonrası → BU GECE, bugün daha erken → BUGÜN
function mkTonight(ev) {
  if (isLive(ev)) return "ŞU AN";
  const ms = msOf(ev);
  if (ms == null || !H.isToday(ms)) return null;
  return new Date(ms).getHours() >= 17 ? "BU GECE" : "BUGÜN";
}
// "BUGÜN · 21:00" / "YARIN · 22:00" / "CUM 2 EKİ · 23:00" (todayTimeOnly: bugünse yalnız saat — rozet zaten "BU GECE" der)
function mkWhen(ev, { todayTimeOnly = false } = {}) {
  const ms = msOf(ev);
  if (ms == null) return mkUp(eventWhen(ev));
  const time = ev.startTime || H.fmtTime(ms);
  if (todayTimeOnly && H.isToday(ms)) return time;
  return [mkUp(H.fmtDayLabel(ms)), time].filter(Boolean).join(" · ");
}
// Mesafe (legacy distPill karşılığı) — "Konumumu kullan" sonrası; ekran okuyucu için " · " ayıracı (görsel boşluk CSS'te)
function mkDist(ev) {
  if (!userCoords || ev.location?.lat == null) return null;
  return h("span", { class: "mk-dist" }, mkVh(" · "), H.fmtKm(haversineKm(userCoords, { lat: ev.location.lat, lng: ev.location.lng })));
}
// Etkinlik görseli; bannerUrl yoksa tür rengiyle koyu gradyan (sahte görsel YOK)
function mkImg(ev, cls, alt, eager) {
  if (ev.bannerUrl) return h("img", { class: cls, src: ev.bannerUrl, alt: alt ?? "", loading: eager ? null : "lazy", decoding: "async" });
  const c = famColor((Array.isArray(ev.genre) ? ev.genre[0] : ev.genre) || "");
  return h("span", { class: cls + " mk-noimg", style: { background: `linear-gradient(150deg, ${H.rgba(c, 0.3)}, #0E1014 78%)` } });
}
function mkEmpty(iconEl, title, sub, cls) {
  return h("div", { class: "mk-empty" + (cls ? " " + cls : "") }, iconEl,
    h("span", { class: "mk-empty-t" }, title), sub ? h("span", { class: "mk-empty-s" }, sub) : null);
}
function mkSection({ title, sub, right, id }, ...kids) {
  const h2 = h("h2", { class: "mk-h2", id: id || null }, title);
  return h("section", { class: "mk-sec", "aria-labelledby": id || null },
    h("div", { class: "mk-sec-head" }, h("div", { class: "mk-sec-titles" }, h2, sub ? h("span", { class: "mk-sub" }, sub) : null), right || null),
    ...kids);
}
const mkMoreLink = (href, label = "TÜMÜNÜ GÖR") => h("a", { class: "mk-more", href }, label);
const mkMoreBtn = (onClick, label = "TÜMÜNÜ GÖR") => h("button", { type: "button", class: "mk-more", onclick: onClick }, label);
const mkRow = (cls, items) => h("div", { class: "mk-hscroll mk-scroll" + (cls ? " " + cls : "") }, ...items);

// ── Kartlar ──
// Hero ("Bu Gece" kartı): 216px, Ken Burns görsel, rozet(ler) + fiyat çipi, tür · saat, başlık, sanatçı · mekan + katılımcı
function mkHeroCard(ev, eager) {
  const now = mkTonight(ev), st = mkStatus(ev), att = Number(ev.attendeeCount) || 0;
  const g = mkGenre(ev);
  return h("a", { class: "mk-hero-card mk-press", href: mkHref(ev) },
    mkImg(ev, "mk-hero-img mk-kb", ev.title || "Etkinlik", eager),
    h("span", { class: "mk-hero-grad" }),
    h("div", { class: "mk-hero-top" },
      h("div", { class: "mk-hero-badges" },
        now ? h("span", { class: "mk-live" }, h("span", { class: "mk-ping", "aria-hidden": "true" }, h("span", { class: "mk-ping-a" }), h("span", {})), now) : null,
        st ? h("span", { class: "mk-hbadge", style: { "--c": st.color, "--cb": H.rgba(st.color, 0.5) } }, st.label) : null),
      h("span", { class: "mk-price-chip" }, mkPrice(ev))),
    h("div", { class: "mk-hero-text" },
      h("span", { class: "mk-hero-eyebrow" }, [g, mkWhen(ev, { todayTimeOnly: !!now })].filter(Boolean).join(" · "), mkDist(ev)),
      h("span", { class: "mk-hero-title" }, ev.title || "Etkinlik"),
      h("div", { class: "mk-hero-row" },
        h("span", { class: "mk-hero-sub" }, [ev.artistName, ev.venueName].filter(Boolean).join(" · ")),
        att ? h("span", { class: "mk-hero-att", title: att + " katılımcı" }, svgRaw(MKI.people, { size: 12, sw: "2" }), String(att), mkVh(" katılımcı")) : null)));
}
// "Yaklaşan Etkinlikler" kartı (232px) — Top 10 / Sadece GigBridge'de / En Yeniler / Bu Hafta; rank → Top 10 sıra numarası
// (masaüstü WebKesfet Top 10 dili: Instrument Serif, −0.04em, ilk 3 altın — 128px görsele ölçekli)
function mkEventCard(ev, { rank } = {}) {
  const st = mkStatus(ev);
  return h("a", { class: "mk-ecard mk-press", href: mkHref(ev) },
    h("div", { class: "mk-ecard-media" },
      mkImg(ev, "mk-ecard-img", ev.title || "Etkinlik"),
      rank ? h("span", { class: "mk-ecard-shade" }) : null,
      st ? h("span", { class: "mk-sbadge", style: { background: st.color } }, st.label) : null,
      rank ? h("span", { class: "mk-rank" + (rank <= 3 ? " gold" : "") }, mkVh("Sıra "), String(rank)) : null),
    h("div", { class: "mk-ecard-body" },
      h("span", { class: "mk-ecard-when" }, mkWhen(ev), mkDist(ev)),
      h("span", { class: "mk-ecard-title" }, ev.title || "Etkinlik"),
      h("div", { class: "mk-ecard-foot" },
        h("span", { class: "mk-ecard-venue" }, [ev.venueName, ev.artistName].filter(Boolean).join(" · ") || "—"),
        h("span", { class: "mk-ecard-price" }, mkPrice(ev)))));
}
// ETKİNLİKLER sekmesi / arama sonucu satırı — 72px görsel, zaman (bugün/yarın pembe), fiyat + katılımcı
function mkEventRow(ev) {
  const ms = msOf(ev), hot = ms != null && (H.isToday(ms) || H.isTomorrow(ms));
  const att = Number(ev.attendeeCount) || 0;
  return h("a", { class: "mk-erow mk-press", href: mkHref(ev) },
    mkImg(ev, "mk-erow-img", ""),
    h("div", { class: "mk-erow-main" },
      h("span", { class: "mk-erow-when" + (hot ? " hot" : "") }, mkWhen(ev), mkDist(ev)),
      h("span", { class: "mk-erow-title" }, ev.title || "Etkinlik"),
      h("span", { class: "mk-erow-sub" }, [ev.venueName, ev.artistName].filter(Boolean).join(" · ") || "—")),
    h("div", { class: "mk-erow-side" },
      h("span", { class: "mk-erow-price" }, mkPrice(ev)),
      h("span", { class: "mk-erow-att", title: att + " katılımcı" }, svgRaw(MKI.people, { size: 12, sw: "2" }), String(att), mkVh(" katılımcı"))));
}
// Mekan meta: "4,7 (128) · 600 kişi · İstanbul" (puan/yorum sayısı Cloud Functions'tan; yoksa atlanır)
function mkVenueMeta(v, { city = true } = {}) {
  const rating = Number(v.avgRating) > 0 ? Number(v.avgRating).toFixed(1) : null;
  const rc = Number(v.reviewCount) || 0;
  return { rating, parts: [rating ? (rc ? `${rating} (${rc})` : rating) : null, v.capacity ? v.capacity + " kişi" : null, city ? v.city || null : null].filter(Boolean) };
}
const mkVenueGenres = (v) => (Array.isArray(v.genres) ? v.genres : v.genre ? [v.genre] : []).filter(Boolean);
// MEKANLAR kartı — 168px; tür rozeti (venueType, yoksa MEKAN — app ile aynı), ★ puan (yorum) · kapasite · şehir, tür etiketleri
function mkVenueCard(v) {
  const gs = mkVenueGenres(v);
  const { rating, parts } = mkVenueMeta(v);
  return h("a", { class: "mk-vcard mk-press", href: "#/mekan/" + v.id },
    v.photoURL ? h("img", { class: "mk-vcard-img", src: v.photoURL, alt: v.displayName || "Mekan", loading: "lazy", decoding: "async" }) : h("span", { class: "mk-vcard-img mk-noimg mk-noimg-venue" }),
    h("span", { class: "mk-vcard-grad" }),
    h("span", { class: "mk-vtype" }, mkUp(v.venueType || "Mekan")),
    h("div", { class: "mk-vcard-body" },
      h("span", { class: "mk-vcard-name" }, v.displayName || "Mekan"),
      h("div", { class: "mk-vcard-row" },
        h("span", { class: "mk-vcard-meta" },
          rating ? svgRaw(MKI.star, { size: 14, fill: true, color: "#FF8A2A", attrs: { stroke: "#FF8A2A", "stroke-width": "1.5", "stroke-linejoin": "round" } })
            : parts.length ? svgRaw(MKI.pin, { size: 14, sw: "2", color: "#C9CACD" }) : null,
          h("span", { class: "mk-vcard-meta-t" }, parts.join(" · "))),
        gs.length ? h("span", { class: "mk-vtags" }, ...gs.slice(0, 2).map((g) => h("span", { class: "mk-vtag" }, mkGenreUp(g)))) : null)));
}
// Arama sonucu mekan satırı (app HomeScreen searchVenues: ad + tür · şehir → mekan detayı) — etkinlik satırı dilinde
function mkVenueRow(v) {
  const { rating, parts } = mkVenueMeta(v, { city: false });
  return h("a", { class: "mk-erow mk-vrow mk-press", href: "#/mekan/" + v.id },
    v.photoURL ? h("img", { class: "mk-erow-img", src: v.photoURL, alt: "", loading: "lazy", decoding: "async" })
      : h("span", { class: "mk-erow-img mk-noimg mk-noimg-venue mk-vrow-ph", "aria-hidden": "true" }, svgIcon("building", { size: 24, sw: "1.6" })),
    h("div", { class: "mk-erow-main" },
      h("span", { class: "mk-erow-when mk-vrow-type" }, [mkUp(v.venueType || "Mekan"), v.city ? mkUp(v.city) : null].filter(Boolean).join(" · ")),
      h("span", { class: "mk-erow-title" }, v.displayName || "Mekan"),
      parts.length ? h("span", { class: "mk-erow-sub mk-vrow-meta" },
        rating ? svgRaw(MKI.star, { size: 12, fill: true, color: "#FF8A2A", attrs: { stroke: "#FF8A2A", "stroke-width": "1.5", "stroke-linejoin": "round" } }) : null,
        h("span", {}, parts.join(" · "))) : null),
    svgIcon("chevronRight", { size: 16, sw: "2", cls: "mk-vrow-chev" }));
}
// Sanatçı yardımcıları
const mkAName = (a) => a.displayName || "Sanatçı";
const mkAGenre = (a) => (Array.isArray(a.genres) ? a.genres[0] : a.genre) || "Müzik";
const mkByPop = (a, b) => ((Number(b.followerCount) || 0) - (Number(a.followerCount) || 0)) || mkAName(a).localeCompare(mkAName(b), "tr");
function mkAvatar(a, cls) {
  const name = mkAName(a);
  return a.photoURL
    ? h("span", { class: cls }, h("img", { src: a.photoURL, alt: "", loading: "lazy", decoding: "async" }))
    : h("span", { class: cls + " ph", "aria-hidden": "true" }, name.charAt(0).toLocaleUpperCase("tr-TR"));
}
// Takip düğmesi — legacy artistRowHome akışı (misafir → giriş kapısı; followArtist/unfollowArtist; hata → toast).
// Erişilebilir ad = görünen metin + gizli sanatçı adı ("TAKİP ET — Mert Arslan"); durum metinle söylenir (aria-pressed yok:
// değişen etiket + pressed çift anlatım olurdu). fx.inert: yönetici önizlemesi — YAZMA YOK (legacy'de .hs-artist korumasıyla
// da etkisizdi; yeni düğme o korumanın dışında kaldığı için burada kapatılır).
function mkFollowBtn(a, fx, cls) {
  let on = fx.followSet.has(a.id);
  const txt = h("span", {});
  const b = h("button", { type: "button", class: cls + " mk-press" }, txt, mkVh(" — " + mkAName(a)));
  if (fx.inert) { b.setAttribute("aria-disabled", "true"); b.title = "Önizlemede devre dışı"; }
  const paint = () => { txt.textContent = on ? "TAKİPTE" : "TAKİP ET"; b.classList.toggle("on", on); };
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (fx.inert || b.closest(".km-frame")) return;
    if (loginGate("Takip etmek")) return;
    if (b.disabled) return;
    b.disabled = true;
    try {
      if (on) { await unfollowArtist(uid(), a.id); fx.followSet.delete(a.id); on = false; }
      else { await followArtist(uid(), a); fx.followSet.add(a.id); on = true; }
      paint();
    } catch (_) { toast("İşlem başarısız", "err"); }
    b.disabled = false;
  });
  paint();
  return b;
}
// Popüler Sanatçılar kartı (138px)
function mkArtistCard(a, fx) {
  return h("div", { class: "mk-acard" },
    h("a", { class: "mk-acard-link", href: "#/sanatci/" + a.id },
      mkAvatar(a, "mk-aphoto"),
      h("span", { class: "mk-acard-name" }, mkAName(a)),
      h("span", { class: "mk-acard-meta" }, mkGenreUp(mkAGenre(a)) + " · " + H.kFmt(a.followerCount ?? 0))),
    mkFollowBtn(a, fx, "mk-follow mk-follow-card"));
}
// SANATÇILAR sekmesi / arama sonucu satırı
function mkArtistRow(a, fx) {
  return h("div", { class: "mk-arow" },
    h("a", { class: "mk-arow-link", href: "#/sanatci/" + a.id },
      mkAvatar(a, "mk-arow-photo"),
      h("span", { class: "mk-arow-text" },
        h("span", { class: "mk-arow-name" }, mkAName(a)),
        h("span", { class: "mk-arow-meta" }, mkGenreUp(mkAGenre(a)) + " · " + H.kFmt(a.followerCount ?? 0) + " TAKİPÇİ"))),
    mkFollowBtn(a, fx, "mk-follow mk-follow-row"));
}

// ?kategori= (masaüstü/paylaşılan bağlantılar) — yalnız #/kesfet rotasındayken okunur/yazılır (yönetici önizlemesinde değil)
function mkReadCatQuery() {
  if (base() !== "#/kesfet") return;
  const q = new URLSearchParams((location.hash.split("?")[1]) || "");
  const k = MK_CATS.find((c) => MK_CAT_SLUG[c] === q.get("kategori"));
  if (k) activeCategory = k;
}
function mkWriteCatQuery() {
  if (base() !== "#/kesfet") return;
  const q = new URLSearchParams((location.hash.split("?")[1]) || "");
  if (activeCategory === "TÜMÜ") q.delete("kategori"); else q.set("kategori", MK_CAT_SLUG[activeCategory]);
  const qs = q.toString();
  try { history.replaceState(history.state, "", location.pathname + location.search + "#/kesfet" + (qs ? "?" + qs : "")); } catch (_) {}
}

// Sayfa: kök + legacy döner simge + legacy alt sekme çubuğu (diğer 4 sekmeyle AYNI çubuk — sekme değişiminde zıplamaz;
// ≥900 yedek yolunda legacy kenar çubuğu). m-kesfet.css + ortak modüller gelince başlık + gövde döner simgenin yerini alır.
export function kesfetPage() {
  const preview = base() !== "#/kesfet"; // yönetici paneli önizlemesi (admin.js) — gezinme/yazma yok
  mkReadCatQuery();
  mkWriteCatQuery(); // URL ↔ etkin sekme eşit kalsın (modül durumu korunmuş sekmeyle #/kesfet'e dönüldüyse)
  const page = h("div", { class: "page has-nav mk", style: { "--role": C } });
  const life = mkLife(page);
  const boot = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  page.append(boot, bottomnav(NAV, "kesfet", C));
  Promise.all([ensureCss(MK_CSS), mkLoadMods()]).then(() => {
    if (life.dead) return;
    mkEnsureMonoBold();
    const ui = mkBuild(page, life, preview);
    boot.replaceWith(ui.head, ui.body);
    renderKesfet(ui);
  }, () => {
    if (life.dead) return;
    clear(boot); boot.append(errBox("Keşfet yüklenemedi."));
  });
  return page;
}

// Başlık (selamlama + şehir · zil + profil/giriş), arama + tür filtresi, kategori sekmeleri, gövde
function mkBuild(page, life, preview) {
  const guest = !authed();
  const sid = "mk" + (++_mkSeq);
  const cityName = h("span", { class: "mk-city-name" }, mkCityLabel(activeCity));
  const cityBtn = h("button", { type: "button", class: "mk-city", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": sid + "-city", "aria-label": "Şehir seç, şu an " + mkCityLabel(activeCity) },
    svgRaw(MKI.pin, { size: 18, sw: "2", color: "#4ED8FF" }), cityName, svgRaw(MKI.chev, { size: 16, sw: "2", color: "#8A8E97", cls: "mk-city-chev" }));
  const cityPop = h("div", { class: "mk-pop mk-citypop", id: sid + "-city", role: "dialog", "aria-label": "Şehir seç", hidden: true });
  let bell;
  if (guest) {
    bell = h("button", { type: "button", class: "mk-bell mk-press", "aria-label": "Bildirimler", onclick: () => loginGate("Bildirimleri görmek") }, svgRaw(MKI.bell, { size: 19, sw: "1.8" }));
  } else {
    const dot = h("span", { class: "mk-bell-dot", hidden: true });
    bell = h("a", { class: "mk-bell mk-press", href: "#/bildirimler", "aria-label": "Bildirimler" }, svgRaw(MKI.bell, { size: 19, sw: "1.8" }), dot);
    // Okunmamış bildirim noktası — ortak canlı sayaç (live.js; aynı uid'de tek dinleyici), düğüm çıkınca abonelik kapanır
    life.add(subscribeLive(uid(), (st) => {
      const n = Number(st.unreadNotifs) || 0;
      dot.hidden = !n;
      bell.setAttribute("aria-label", n ? `Bildirimler, ${n} yeni` : "Bildirimler");
    }, { messages: false }));
  }
  // Misafir: görünür "Giriş" etiketli hap (legacy "Giriş" çipinin karşılığı, spec §1.12) → loginModal; girişli: profil dairesi
  const prof = guest
    ? h("button", { type: "button", class: "mk-login mk-press", onclick: () => loginModal() }, svgRaw(MKI.user, { size: 18, sw: "1.8" }), h("span", {}, "Giriş"))
    : h("a", { class: "mk-prof mk-press", href: "#/profil", "aria-label": "Profil" }, svgRaw(MKI.user, { size: 20, sw: "1.8" }));
  const top = h("div", { class: "mk-top mk-rise" },
    h("div", { class: "mk-hello" }, h("span", { class: "mk-greet" }, mkGreeting()), cityBtn),
    h("div", { class: "mk-actions" }, bell, prof),
    cityPop);

  // Arama + tür filtresi
  const sInput = h("input", { type: "search", class: "mk-sinput", "aria-label": "Etkinlik, mekan veya sanatçı ara", placeholder: "Etkinlik, mekan veya sanatçı ara...", autocomplete: "off", enterkeyhint: "search" });
  const fBtn = h("button", { type: "button", class: "mk-fbtn mk-press", "aria-label": "Türe göre filtrele", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": sid + "-filter" }, svgRaw(MKI.sliders, { size: 18, sw: "1.8" }));
  const filterPop = h("div", { class: "mk-pop mk-filterpop", id: sid + "-filter", role: "dialog", "aria-label": "Türe göre filtrele", hidden: true });
  const search = h("div", { class: "mk-search mk-rise", role: "search" },
    h("div", { class: "mk-sbar" }, svgRaw(MKI.search, { size: 17, sw: "1.8", color: "#8A8E97" }), sInput, h("span", { class: "mk-sdiv", "aria-hidden": "true" }), fBtn),
    filterPop);

  // Kategori sekmeleri — eşit 4 hücre + tek kayan prizma göstergesi (metin genişliğinde)
  const ind = h("span", { class: "mk-ind mk-prism", "aria-hidden": "true" });
  const tabBtns = MK_CATS.map((k, i) => h("button", { type: "button", role: "tab", id: `${sid}-tab${i}`, class: "mk-tab", "aria-controls": sid + "-panel" }, h("span", { class: "mk-tab-t" }, k)));
  const tabs = h("div", { class: "mk-tabs mk-rise", role: "tablist", "aria-label": "Kategoriler" }, ...tabBtns, ind);

  const head = h("header", { class: "mk-head" }, top, search, tabs);
  const body = h("div", { class: "mk-body", id: sid + "-panel", role: "tabpanel" }, h("div", { class: "loading" }, spinner()));
  return { page, life, sid, preview, head, cityBtn, cityName, cityPop, sInput, fBtn, filterPop, tabs, tabBtns, ind, body };
}

async function renderKesfet(ui) {
  const { page, life, head, cityBtn, cityName, cityPop, sInput, fBtn, filterPop, tabs, tabBtns, ind, body } = ui;
  let events = [], artists = [], venues = [], loaded = false;
  let term = "", genreFilter = "", dateKey = "all";
  let heroStop = null; // etkin karusel aralığı — her çizimde öncekini kapatır (kapanışlar birikmez)
  life.add(() => heroStop?.());
  const fx = { followSet: new Set(), inert: ui.preview };

  // ── Sekmeler ──
  const catIdx = () => Math.max(0, MK_CATS.indexOf(activeCategory));
  const moveInd = (animate) => {
    const b = tabBtns[catIdx()], t = b.firstChild;
    if (!b.offsetWidth) return false;
    const w = t.offsetWidth;
    if (!animate) ind.style.transition = "none";
    ind.style.left = (b.offsetLeft + (b.offsetWidth - w) / 2) + "px";
    ind.style.width = w + "px";
    if (!animate) { void ind.offsetWidth; ind.style.transition = ""; }
    return true;
  };
  // Yapışkan başlık yüksekliği → odaklanan içerik öğesi başlığın altında kalmasın (scroll-margin-top, m-kesfet.css)
  const syncHeadH = () => { if (head.offsetHeight) page.style.setProperty("--mk-head-h", head.offsetHeight + "px"); };
  const paintTabs = (animate) => {
    tabBtns.forEach((b, i) => { const on = i === catIdx(); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    body.setAttribute("aria-labelledby", tabBtns[catIdx()].id);
    moveInd(animate);
  };
  const toTop = () => {
    const sc = page.closest(".km-body");
    if (sc) { if (sc.scrollTop > 0) sc.scrollTop = 0; } else if (window.scrollY > 0) window.scrollTo(0, 0);
  };
  const setCategory = (k) => {
    if (k === activeCategory) return;
    activeCategory = k; // ayrı sayfaya gitmeden içerik sola kayarak gelir (app sekme davranışı)
    paintTabs(true); mkWriteCatQuery(); drawBody(true); toTop();
  };
  tabBtns.forEach((b, i) => b.addEventListener("click", () => setCategory(MK_CATS[i])));
  tabs.addEventListener("keydown", (e) => {
    const i = tabBtns.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === "ArrowRight" ? (i + 1) % 4 : e.key === "ArrowLeft" ? (i + 3) % 4 : e.key === "Home" ? 0 : e.key === "End" ? 3 : null;
    if (j == null) return;
    e.preventDefault(); tabBtns[j].focus(); setCategory(MK_CATS[j]);
  });
  paintTabs(false);
  // Gösterge ilk yerleşim: CSS hazır ve düğüm bağlı (bu noktada ikisi de), fontlar gelince ve pencere boyutu değişince
  const place = () => { let n = 0; const tick = () => { syncHeadH(); if (!moveInd(false) && n++ < 40) requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
  place();
  try { document.fonts?.ready?.then(() => { moveInd(false); syncHeadH(); }); } catch (_) {}
  const onResize = () => { moveInd(false); syncHeadH(); };
  window.addEventListener("resize", onResize);
  life.add(() => window.removeEventListener("resize", onResize));

  // ── Açılır paneller (şehir + tür): dış dokunuş / Esc / odak dışarı kapatır ──
  // Dış dokunuş YALNIZ kapatır: ardından gelen tık yutulur → paneli kapatırken alttaki kart/bağlantı açılmaz.
  let pop = null, popTrig = null, swallowOff = null;
  const armSwallow = () => {
    swallowOff?.();
    const eat = (e) => { e.preventDefault(); e.stopPropagation(); off(); };
    const off = () => {
      clearTimeout(t);
      document.removeEventListener("click", eat, true);
      document.removeEventListener("pointercancel", off, true);
      if (swallowOff === off) swallowOff = null;
    };
    const t = setTimeout(off, 800); // kaydırmaya dönen dokunuşta tık gelmez → süre dolunca kaldır
    document.addEventListener("click", eat, true);
    document.addEventListener("pointercancel", off, true);
    swallowOff = off;
  };
  const onDocDown = (e) => {
    if (!pop || pop.contains(e.target) || popTrig.contains(e.target)) return;
    const otherTrig = cityBtn.contains(e.target) || fBtn.contains(e.target); // diğer panelin düğmesi → o panel açılsın
    closePop(false);
    if (!otherTrig) armSwallow();
  };
  const onDocKey = (e) => { if (e.key === "Escape" && pop) { e.preventDefault(); closePop(true); } };
  // Klavye odağı panel + tetikleyici dışına çıkınca kapan (panel sekmeleri/içeriği örtmesin). relatedTarget yoksa (pencere
  // odağı kaybı, devre dışı kalan düğme) açık kalır.
  const onFocusOut = (e) => { const to = e.relatedTarget; if (pop && to && !pop.contains(to) && !popTrig.contains(to)) closePop(false); };
  function closePop(focusBack) {
    if (!pop) return;
    const p = pop, t = popTrig;
    pop = popTrig = null;
    p.hidden = true; t.setAttribute("aria-expanded", "false"); t.classList.remove("open");
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onDocKey, true);
    p.removeEventListener("focusout", onFocusOut); t.removeEventListener("focusout", onFocusOut);
    if (focusBack) t.focus();
  }
  function togglePop(p, t, e) {
    if (pop === p) return closePop(false);
    closePop(false);
    pop = p; popTrig = t;
    p.hidden = false; t.setAttribute("aria-expanded", "true"); t.classList.add("open");
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onDocKey, true);
    p.addEventListener("focusout", onFocusOut); t.addEventListener("focusout", onFocusOut);
    if (e && e.detail === 0) p.querySelector("button, input")?.focus(); // klavyeyle açıldıysa odak panele
  }
  life.add(() => { closePop(false); swallowOff?.(); });

  // ── Şehir paneli (Konumumu kullan + arama + 81 il; gb_city) ──
  let cityNames = ["TÜMÜ", ...PROVINCES];
  let cityCount = new Map();
  const cSearch = h("input", { type: "search", class: "mk-pop-input", "aria-label": "Şehir ara", placeholder: "Şehir ara...", autocomplete: "off", oninput: () => drawCities() });
  const listBox = h("div", { class: "mk-citylist", role: "listbox", "aria-label": "Şehirler" });
  const setCity = (c, focusBack) => {
    activeCity = c;
    try { localStorage.setItem("gb_city", c); } catch (_) {}
    cityName.textContent = mkCityLabel(c);
    cityBtn.setAttribute("aria-label", "Şehir seç, şu an " + mkCityLabel(c));
    closePop(!!focusBack); drawBody(false); drawCities();
  };
  // Liste: tek sekme durağı (seçili şehir, yoksa ilk) + ↑/↓/Home/End; ↑ ilk seçenekte aramaya döner, aramada ↓ listeye iner
  function drawCities() {
    clear(listBox);
    const q = fold(cSearch.value.trim());
    const list = cityNames.filter((c) => !q || fold(c).includes(q) || fold(mkCityLabel(c)).includes(q));
    if (!list.length) { listBox.append(h("div", { class: "mk-city-empty" }, "Şehir bulunamadı")); return; }
    const stop = list.includes(activeCity) ? activeCity : list[0];
    list.forEach((c) => {
      const on = c === activeCity;
      const n = c === "TÜMÜ" ? events.length : (cityCount.get(fold(c)) || 0);
      listBox.append(h("button", { type: "button", role: "option", class: "mk-city-opt", tabindex: c === stop ? "0" : "-1", "aria-selected": on ? "true" : "false", onclick: (e) => setCity(c, e.detail === 0) }, // klavyeyle seçildiyse odak şehir düğmesine döner
        h("span", { class: "mk-city-opt-t" }, mkCityLabel(c)), n ? h("span", { class: "mk-city-n" }, String(n), mkVh(" etkinlik")) : null));
    });
  }
  listBox.addEventListener("keydown", (e) => {
    const opts = [...listBox.querySelectorAll(".mk-city-opt")];
    const i = opts.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === "ArrowDown" ? Math.min(i + 1, opts.length - 1) : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? opts.length - 1 : null;
    if (j == null) return;
    e.preventDefault();
    if (j < 0) { cSearch.focus(); return; }
    opts.forEach((o, k) => { o.tabIndex = k === j ? 0 : -1; });
    opts[j].focus();
  });
  cSearch.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown") return;
    const o = listBox.querySelector('.mk-city-opt[tabindex="0"]') || listBox.querySelector(".mk-city-opt");
    if (o) { e.preventDefault(); o.focus(); }
  });
  const locBtn = h("button", { type: "button", class: "mk-locate mk-press", onclick: (e) => {
    if (!navigator.geolocation) return toast("Tarayıcı konumu desteklemiyor", "err");
    const kb = e.detail === 0; // klavyeyle: sonuçta odak şehir düğmesine (bulunduysa) ya da bu düğmeye döner
    locBtn.disabled = true;
    const refocus = () => { if (kb && pop === cityPop) locBtn.focus(); };
    navigator.geolocation.getCurrentPosition(async (pos) => {
      userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      let match = null;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userCoords.lat}&lon=${userCoords.lng}&accept-language=tr`);
        const j = await r.json();
        const prov = j.address?.province || j.address?.state || j.address?.city || "";
        match = PROVINCES.find((p) => fold(p) === fold(prov)) || null;
      } catch (_) {}
      locBtn.disabled = false;
      if (life.dead) return;
      if (match) { setCity(match, kb); toast(match + " olarak ayarlandı"); }
      else { toast("Şehir belirlenemedi", "err"); drawBody(false); refocus(); }
    }, () => { toast("Konum alınamadı (izin?)", "err"); locBtn.disabled = false; refocus(); });
  } }, svgRaw(MKI.navFill, { size: 15, fill: true, color: "#4ED8FF" }), h("span", {}, "Konumumu kullan"));
  cityPop.append(locBtn, h("label", { class: "mk-pop-search" }, svgRaw(MKI.search, { size: 14, sw: "2", color: "#8A8E97" }), cSearch), listBox);
  cityBtn.addEventListener("click", (e) => togglePop(cityPop, cityBtn, e));
  drawCities();

  // ── Tür filtresi paneli (sürgü düğmesi) ──
  let chips = [];
  const paintFilter = () => {
    chips.forEach(([val, b]) => { const on = genreFilter === val; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    fBtn.classList.toggle("on", !!genreFilter);
    fBtn.setAttribute("aria-label", "Türe göre filtrele" + (genreFilter ? ", seçili: " + genreFilter : ""));
  };
  const drawFilter = (opts) => {
    clear(filterPop);
    const chip = (label, val, dot) => {
      const b = h("button", { type: "button", class: "mk-gchip", onclick: () => { genreFilter = val; paintFilter(); drawBody(false); } },
        h("span", { class: "mk-gdot", style: { background: dot } }), label);
      chips.push([val, b]);
      return b;
    };
    chips = [];
    filterPop.append(
      h("div", { class: "mk-pop-title" }, "TÜRE GÖRE FİLTRELE"),
      h("div", { class: "mk-gchips", role: "group", "aria-label": "Türler" }, chip("Tümü", "", "#F2F1EE"), ...opts.map((g) => chip(g, g, famColor(g)))),
      h("button", { type: "button", class: "mk-fartists mk-press", onclick: () => { closePop(false); setCategory("SANATÇILAR"); } },
        svgIcon("mic", { size: 15 }), h("span", {}, "Sanatçıları Ara")));
    paintFilter();
  };
  fBtn.addEventListener("click", (e) => togglePop(filterPop, fBtn, e));
  drawFilter([]);

  // ── Arama ──
  sInput.addEventListener("input", () => { term = sInput.value; drawBody(false); });
  sInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sInput.value) { e.preventDefault(); sInput.value = ""; term = ""; drawBody(false); }
    else if (e.key === "Enter") sInput.blur();
  });

  // ── Veri (legacy ile aynı 3 okuma + takip listesi) ──
  try {
    [events, artists, venues] = await Promise.all([discoverEvents(), listRealArtists(), listVenues()]);
    if (authed()) { try { fx.followSet = new Set((await followingList(uid())).map((f) => f.artistId || f.id)); } catch (_) {} }
  } catch (e) {
    if (life.dead) return;
    clear(body);
    body.append(h("div", { class: "mk-pad" }, mkEmpty(svgIcon("alertCircle", { size: 30, sw: "1.5" }), "Bir sorun oldu", "Keşfet yüklenemedi.")));
    return;
  }
  if (life.dead) return;
  loaded = true;
  const evCity = (e) => (e.city || e.location?.city || "").trim();
  cityNames = ["TÜMÜ", ...[...new Set([...events.map(evCity).filter(Boolean), ...PROVINCES])]];
  cityCount = new Map();
  events.forEach((e) => { const k = fold(evCity(e)); if (k) cityCount.set(k, (cityCount.get(k) || 0) + 1); });
  drawCities();
  drawFilter([...new Set([...events.flatMap((e) => Array.isArray(e.genre) ? e.genre : (e.genre ? [e.genre] : [])), ...artists.flatMap((a) => Array.isArray(a.genres) ? a.genres : (a.genre ? [a.genre] : []))].map((g) => (g || "").trim()).filter(Boolean))]);

  const inCity = (ev) => activeCity === "TÜMÜ" || fold(evCity(ev)) === fold(activeCity);
  const mg = (item) => { if (!genreFilter) return true; const raw = item.genres ?? item.genre; const gs = Array.isArray(raw) ? raw : (raw ? [raw] : []); return gs.some((g) => fold(g) === fold(genreFilter)); };
  const noEventsTitle = () => (activeCity === "TÜMÜ" ? "Henüz etkinlik yok" : `${activeCity} için etkinlik yok`);
  const NO_EVENTS_SUB = "Yakında canlı müzik etkinlikleri burada görünecek.";

  function drawBody(animate) {
    if (!loaded) return;
    heroStop?.(); heroStop = null;
    clear(body);
    const cityEvents = events.filter(inCity).filter(mg);
    const fArtists = artists.filter(mg).sort(mkByPop);
    const fVenues = venues.filter(mg);
    const q = fold(term.trim());
    let view;
    if (q) view = searchView(cityEvents, fArtists, fVenues, q);
    else if (activeCategory === "MEKANLAR") view = venuesView(fVenues);
    else if (activeCategory === "SANATÇILAR") view = artistsView(fArtists);
    else if (activeCategory === "ETKİNLİKLER") view = eventsView(cityEvents);
    else view = allView(cityEvents, fArtists);
    body.append(view);
    if (animate) view.classList.add("mk-tabanim");
  }

  // Arama (app HomeScreen paritesi): etkinlik (başlık/mekan/sanatçı adı — legacy eşleşmesi, şehir içinde) + sanatçı (ad/tür)
  // + mekan (ad/şehir) — sanatçı/mekan listeleri bellekte (yeni sorgu yok); tür süzgeci üçüne de uygulanır
  function searchView(cityEvents, fArtists, fVenues, q) {
    const evs = cityEvents.filter((e) => [e.title, e.venueName, e.artistName].some((x) => fold(x).includes(q)));
    const ars = fArtists.filter((a) => [a.displayName, ...(Array.isArray(a.genres) ? a.genres : [a.genre])].some((x) => fold(x).includes(q)));
    const vns = fVenues.filter((v) => [v.displayName, v.city].some((x) => fold(x).includes(q)));
    if (!evs.length && !ars.length && !vns.length) return h("div", { class: "mk-pad" }, mkEmpty(svgRaw(MKI.search, { size: 30, sw: "1.5" }), "Sonuç bulunamadı"));
    const grp = (label, n, list) => h("section", { class: "mk-sgroup", "aria-label": label },
      h("div", { class: "mk-slabel", "aria-hidden": "true" }, label, h("span", { class: "mk-slabel-n" }, String(n))), list);
    return h("div", { class: "mk-results" },
      evs.length ? grp("ETKİNLİKLER", evs.length, h("div", { class: "mk-erows" }, ...evs.map(mkEventRow))) : null,
      ars.length ? grp("SANATÇILAR", ars.length, h("div", { class: "mk-alist" }, ...ars.map((a) => mkArtistRow(a, fx)))) : null,
      vns.length ? grp("MEKANLAR", vns.length, h("div", { class: "mk-erows" }, ...vns.map(mkVenueRow))) : null);
  }
  function venuesView(list) {
    if (!list.length) return h("div", { class: "mk-pad" }, mkEmpty(svgIcon("building", { size: 30, sw: "1.5" }), "Henüz mekan yok", "Mekanlar katıldıkça burada listelenecek."));
    return h("div", { class: "mk-vlist", "aria-label": "Mekanlar" }, ...list.map(mkVenueCard));
  }
  function artistsView(list) {
    if (!list.length) return h("div", { class: "mk-pad" }, mkEmpty(svgIcon("mic", { size: 30, sw: "1.5" }), "Henüz sanatçı yok", "Sanatçılar katıldıkça burada görünecek."));
    return h("div", { class: "mk-alist", "aria-label": "Sanatçılar" }, ...list.map((a) => mkArtistRow(a, fx)));
  }
  // ETKİNLİKLER: tarih şeridi (TÜMÜ / BU HAFTA / BU AY + 14 gün; app EventsScreen/HomeScreen ile aynı süzgeç) + satırlar
  function eventsView(cityEvents) {
    const t0 = _startOfDay(Date.now());
    const defs = [{ key: "all", kind: "all", label: "TÜMÜ" }, { key: "week", kind: "week", label: "BU HAFTA" }, { key: "month", kind: "month", label: "BU AY" }];
    for (let i = 0; i < 14; i++) {
      const dayMs = t0 + i * 86400e3, d = new Date(dayMs);
      defs.push({ key: "d" + dayMs, kind: "day", dayMs, label: mkUp(H.DAYS_TR_SHORT[d.getDay()]), sub: String(d.getDate()), aria: `${H.DAYS_TR[d.getDay()]} ${d.getDate()} ${H.MONTHS_TR[d.getMonth()]}` });
    }
    if (!defs.some((d) => d.key === dateKey)) dateKey = "all";
    const sorted = [...cityEvents].sort((a, b) => (msOf(a) ?? 0) - (msOf(b) ?? 0));
    const list = h("div", { class: "mk-erows" });
    const btns = defs.map((d) => h("button", { type: "button", class: "mk-date mk-press" + (d.kind === "day" ? " day" : ""), "aria-label": d.aria || null, onclick: () => { dateKey = d.key; paint(); } },
      h("span", { class: "mk-date-l" }, d.label), d.sub ? h("span", { class: "mk-date-s" }, d.sub) : null));
    const paint = () => {
      btns.forEach((b, i) => b.setAttribute("aria-pressed", defs[i].key === dateKey ? "true" : "false"));
      clear(list);
      const f = defs.find((d) => d.key === dateKey) || defs[0], now = Date.now();
      const rows = sorted.filter((e) => dateMatches(msOf(e), f, now));
      if (!rows.length) {
        list.append(dateKey !== "all"
          ? mkEmpty(svgRaw(MKI.ticket, { size: 30, sw: "1.5" }), "Bu tarihte etkinlik yok")
          : mkEmpty(svgRaw(MKI.ticket, { size: 30, sw: "1.5" }), noEventsTitle(), NO_EVENTS_SUB));
        return;
      }
      rows.forEach((e) => list.append(mkEventRow(e)));
    };
    paint();
    return h("div", { class: "mk-evtab", "aria-label": "Etkinlikler" },
      h("div", { class: "mk-dates mk-scroll", role: "group", "aria-label": "Tarihe göre süz" }, ...btns), list);
  }
  // TÜMÜ — legacy bölümleri aynı sıra/koşullarla, tasarımın kart dilinde
  function allView(cityEvents, fArtists) {
    const wrap = h("div", { class: "mk-all" });
    if (!cityEvents.length) {
      wrap.append(h("div", { class: "mk-pad0" }, mkEmpty(svgIcon("compass", { size: 30, sw: "1.5" }), noEventsTitle(), NO_EVENTS_SUB)));
    } else {
      // Hero: VIP önce, sonra tarih — ilk 5
      const hero = [...cityEvents].sort((a, b) => ((b.vipStatus === "approved") - (a.vipStatus === "approved")) || (msOf(a) ?? 0) - (msOf(b) ?? 0)).slice(0, 5);
      wrap.append(heroSection(hero));
      // Top 10 — katılımcı sayısına göre
      const topList = [...cityEvents].sort((a, b) => (b.attendeeCount ?? 0) - (a.attendeeCount ?? 0)).slice(0, 10);
      wrap.append(mkSection({ title: "GigBridge Top 10", id: ui.sid + "-top10", right: mkMoreLink("#/etkinlikler") },
        mkRow("", topList.map((e, i) => mkEventCard(e, { rank: i + 1 })))));
    }
    // Sadece GigBridge'de — her zaman görünür
    const excl = cityEvents.filter((e) => e.vipStatus === "approved" || e.isExclusive);
    wrap.append(mkSection({ title: "Sadece GigBridge'de", sub: "Özel etkinlikler, VIP deneyimler", right: mkMoreLink("#/etkinlikler") },
      excl.length ? mkRow("", excl.map((e) => mkEventCard(e)))
        : h("div", { class: "mk-excl-empty" }, svgIcon("star", { size: 18, stroke: true, sw: "1.7" }), h("span", {}, "Şu an özel etkinlik yok — VIP deneyimler yakında burada."))));
    // En Yeniler (yalnız varsa)
    const news = cityEvents.filter((e) => e.isNew === true);
    if (news.length) wrap.append(mkSection({ title: "GigBridge'de En Yeniler!", right: mkMoreLink("#/etkinlikler") }, mkRow("", news.map((e) => mkEventCard(e)))));
    // Bu Hafta
    const week = cityEvents.filter((e) => { const ms = msOf(e); return ms != null && ms <= Date.now() + 7 * 86400e3; });
    if (week.length) wrap.append(mkSection({ title: "Bu Hafta", sub: activeCity !== "TÜMÜ" ? activeCity : null, right: mkMoreLink("#/etkinlikler") }, mkRow("", week.map((e) => mkEventCard(e)))));
    // Popüler Sanatçılar (+ altın TOP 10 çipi — yalnız mobil #/top10 rotası varsa; bkz. MK_TOP10_HREF)
    if (fArtists.length) {
      const chip = MK_TOP10_HREF ? h("a", { class: "mk-t10chip mk-press", href: MK_TOP10_HREF }, svgRaw(MKI.trophy, { size: 12, _kind: "multi" }), "TOP 10") : null;
      wrap.append(mkSection({ title: "Popüler Sanatçılar", right: h("div", { class: "mk-sec-right" }, chip, mkMoreBtn(() => setCategory("SANATÇILAR"))) },
        mkRow("mk-hscroll-a", fArtists.slice(0, 5).map((a) => mkArtistCard(a, fx)))));
    }
    return wrap;
  }
  // Öne çıkan karusel (legacy: VIP önce, sonra tarih; ilk 5; 4 sn) — kaydırmalı (scroll-snap), her slayt klavyeyle odaklanır
  // (odaklanan slayt görünür kayar). Noktalar legacy'deki gibi YALNIZ gösterge (dokunma hedefi değil). Başlık: ilk slayt
  // şu an / bu gece ise tasarımın "Bu Gece" başlığı + bugünün tarihi ("SAL · 29 EYL"); değilse görünür başlık yok (legacy).
  // Otomatik ilerleme: üzerine gelme / odak / dokunma / gizli sekme / azaltılmış hareket → durur.
  function heroSection(list) {
    const n = list.length, reduced = mkReduced();
    const slides = list.map((ev, i) => mkHeroCard(ev, i === 0));
    const track = h("div", { class: "mk-hero-track mk-scroll" }, ...slides);
    let idx = 0, hold = 0, hover = false, focusIn = false, touching = false;
    const dotEls = n > 1 ? list.map(() => h("span", { class: "mk-dot" })) : [];
    const paint = (i) => { idx = i; dotEls.forEach((d, j) => d.classList.toggle("on", j === i)); };
    const step = () => (slides[0].offsetWidth || track.clientWidth) + 20;
    const goTo = (i) => { track.scrollTo({ left: i * step(), behavior: reduced ? "auto" : "smooth" }); paint(i); };
    track.addEventListener("scroll", () => { const i = Math.round(track.scrollLeft / step()); if (i !== idx && i >= 0 && i < n) paint(i); }, { passive: true });
    track.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hover = true; });
    track.addEventListener("pointerleave", () => { hover = false; });
    track.addEventListener("touchstart", () => { touching = true; }, { passive: true });
    track.addEventListener("touchend", () => { touching = false; hold = Date.now(); }, { passive: true });
    track.addEventListener("focusin", (e) => { const j = slides.indexOf(e.target); if (j >= 0) paint(j); });
    const dots = dotEls.length ? h("div", { class: "mk-dots", "aria-hidden": "true" }, ...dotEls) : null;
    const t0 = mkTonight(list[0]);
    let sec;
    if (t0 === "ŞU AN" || t0 === "BU GECE") {
      const d = new Date();
      const dateLbl = `${mkUp(H.DAYS_TR_SHORT[d.getDay()])} · ${d.getDate()} ${mkUp(H.MONTHS_TR_SHORT[d.getMonth()])}`;
      sec = mkSection({ title: "Bu Gece", id: ui.sid + "-hero", right: h("span", { class: "mk-sec-date" }, dateLbl) }, track, dots);
    } else {
      sec = h("section", { class: "mk-sec", "aria-label": "Öne çıkan etkinlikler" }, track, dots);
    }
    sec.classList.add("mk-hero-sec");
    sec.addEventListener("focusin", () => { focusIn = true; });
    sec.addEventListener("focusout", (e) => { if (!sec.contains(e.relatedTarget)) focusIn = false; });
    paint(0);
    if (n > 1 && !reduced) {
      const iv = setInterval(() => {
        if (hover || focusIn || touching || document.hidden || Date.now() - hold < 6000) return;
        goTo((idx + 1) % n);
      }, 4000);
      heroStop = () => clearInterval(iv);
    }
    return sec;
  }

  drawBody(true);
}

function hsEmpty(ic, title, sub) {
  return h("div", { class: "hs-empty" }, icon(ic, { size: 44, color: "var(--text-muted)" }),
    h("div", { class: "hs-empty-title" }, title), h("div", { class: "hs-empty-sub" }, sub));
}

// Durum rozeti — app öncelik sırası: dolu > vip > exclusive > yoğun > popüler > yeni
function statusBadge(ev) {
  const att = ev.attendeeCount ?? 0;
  if (ev.capacity && att >= ev.capacity) return h("span", { class: "sbadge sb-soldout" }, "Bekleme Listesine Katıl!");
  if (ev.vipStatus === "approved") return h("span", { class: "sbadge sb-vip" }, icon("sparkles", { size: 9, color: "#F59E0B" }), "VIP DENEYİM");
  if (ev.isExclusive) return h("span", { class: "sbadge sb-excl" }, icon("star", { size: 9, color: "#F59E0B" }), "SADECE GİGBRİDGE'DE");
  if (att > 400) return h("span", { class: "sbadge sb-hot" }, "YOĞUN İLGİ");
  if (att > 200) return h("span", { class: "sbadge sb-trend" }, icon("trending-up", { size: 9, color: "#FF4FA3" }), "ŞİMDİ POPÜLER");
  if (ev.isNew) return h("span", { class: "sbadge sb-new" }, "YENİ");
  return null;
}
function genrePills(ev) {
  const gs = (Array.isArray(ev.genre) ? ev.genre : ev.genre ? [ev.genre] : []).filter(Boolean);
  if (!gs.length) return null;
  const row = h("div", { class: "gpills" }, ...gs.slice(0, 2).map((g) => h("span", { class: "gpill" }, String(g).toLocaleUpperCase("tr-TR"))));
  if (gs.length > 2) row.append(h("span", { class: "gpill gp-more" }, "+" + (gs.length - 2)));
  return row;
}
const priceTxt = (ev) => ev.ticketPrice ? fmtTL(ev.ticketPrice) : "ÜCRETSİZ";
function pricePill(ev) { return h("span", { class: "ppill" + (ev.ticketPrice ? "" : " free") }, priceTxt(ev)); }
function distPill(ev) {
  if (!userCoords || ev.location?.lat == null) return null;
  const km = haversineKm(userCoords, { lat: ev.location.lat, lng: ev.location.lng });
  return h("span", { class: "dpill" }, icon("navigate", { size: 10, color: "var(--primary)" }), (km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km"));
}

// Standart etkinlik kartı — 210×270 görsel zemin (full=true: arama sonucu, tam genişlik)
function ecard2(ev, full) {
  return h("div", { class: "ecard2" + (full ? " full" : ""), onclick: () => go("#/etkinlik/" + ev.id), style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
    h("div", { class: "ecard2-grad" }),
    statusBadge(ev) ? h("div", { class: "ecard2-badge" }, statusBadge(ev)) : null,
    h("div", { class: "ecard2-body" },
      h("div", { class: "ecard2-title" }, ev.title || "Etkinlik"),
      h("div", { class: "ecard2-sub" }, [ev.artistName, ev.venueName].filter(Boolean).join(" · ") || "—"),
      genrePills(ev),
      h("div", { class: "ecard2-foot" },
        h("span", { class: "ecard2-date" }, icon("calendar-outline", { size: 10, color: "rgba(255,255,255,0.6)" }), " " + eventWhen(ev)),
        pricePill(ev))));
}

// ── Etkinlikler listesi (app EventsScreen) — tarih filtreli tam liste ──
// Tarih süzgeci — app EventsScreen birebir: hızlı aralık çipleri (Tümü/Bu Hafta/Bu Ay)
// + 14 günlük TAKVİM şeridi (BUGÜN/YARIN/gün-adı + tarih). Aktif çip: ink hairline + prizma alt-şerit.
const _startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const TR_MONTH_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const TR_DAY_SHORT   = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cte"];
function buildDateFilters() {
  const t0 = _startOfDay(Date.now());
  const list = [
    { key: "all",   label: "Tümü",     sub: "", kind: "all",   dayMs: 0 },
    { key: "week",  label: "Bu Hafta", sub: "", kind: "week",  dayMs: 0 },
    { key: "month", label: "Bu Ay",    sub: "", kind: "month", dayMs: 0 },
  ];
  for (let i = 0; i < 14; i++) {
    const dayMs = t0 + i * 86400e3, d = new Date(dayMs);
    const label = i === 0 ? "BUGÜN" : i === 1 ? "YARIN" : TR_DAY_SHORT[d.getDay()].toLocaleUpperCase("tr-TR");
    list.push({ key: "d" + dayMs, label, sub: `${d.getDate()} ${TR_MONTH_SHORT[d.getMonth()]}`, kind: "day", dayMs });
  }
  return list;
}
function dateMatches(ms, f, now) {
  if (f.kind === "all") return true;
  if (ms == null) return false;               // yılsız/ms'siz kayıt yalnız "Tümü"de görünür
  const today0 = _startOfDay(now);
  if (f.kind === "week")  return ms >= today0 && ms <= now + 7 * 86400e3;
  if (f.kind === "month") return ms >= today0 && ms <= now + 30 * 86400e3;
  return _startOfDay(ms) === f.dayMs;         // kind === "day"
}

async function eventsListView(_id, root) {
  let events = [];
  try { events = await discoverEvents(); } catch (_) { clear(root); root.append(errBox()); return; }
  clear(root);
  const FILTERS = buildDateFilters();
  let df = "all";
  const cal = h("div", { class: "ev-cal" });
  const listBox = h("div", { class: "ev-grid" });
  const draw = () => {
    clear(cal); clear(listBox);
    FILTERS.forEach((f) => {
      const on = f.key === df, isDay = f.kind === "day";
      cal.append(h("button", { class: "ev-cal-cell" + (isDay ? " day" : "") + (on ? " on" : ""), onclick: () => { df = f.key; draw(); } },
        h("span", { class: "ev-cal-lbl" }, f.label),
        isDay ? h("span", { class: "ev-cal-sub" }, f.sub) : null,
        on ? h("span", { class: "ev-cal-prism" }) : null));
    });
    const now = Date.now(), activeF = FILTERS.find((f) => f.key === df);
    const list = events.filter((e) => {
      if (activeCity !== "TÜMÜ" && fold((e.city || e.location?.city || "").trim()) !== fold(activeCity)) return false;
      return dateMatches(msOf(e), activeF, now);
    });
    if (!list.length) { listBox.append(hsEmpty("calendar-outline", "Etkinlik yok", "Bu tarihte etkinlik bulunamadı.")); return; }
    list.forEach((e) => listBox.append(ecard2(e, true)));
  };
  draw();
  root.append(cal, listBox);
}

// ══════════ ETKİNLİK DETAY — app EventDetailScreen birebir ══════════
const GENRE_GRADS = { jazz: ["#F59E0B", "#D97706"], electronic: ["#06B6D4", "#0891B2"], rock: ["#EF4444", "#B91C1C"], pop: ["#EC4899", "#BE185D"], akustik: ["#10B981", "#059669"], "hip-hop": ["#6366F1", "#4F46E5"], "r&b": ["#A855F7", "#7C3AED"], techno: ["#8B5CF6", "#6D28D9"], house: ["#F97316", "#EA580C"], klasik: ["#14B8A6", "#0D9488"] };
const genreGrad = (g) => GENRE_GRADS[fold(g || "")] || ["#A855F7", "#7C3AED"];
const evGenre = (ev) => (Array.isArray(ev.genre) ? ev.genre[0] : ev.genre) || "";

function eventDetailPage(id) {
  const content = h("div", { class: "ed-page" }, h("div", { class: "loading" }, spinner()));
  const page = dtlWrap(content);
  eventDetail(id, content);
  return page;
}

async function eventDetail(id, root) {
  const [ev, attending, fav] = await Promise.all([
    eventById(id),
    authed() ? isAttending(id, uid()) : false,
    authed() ? isFavEvent(uid(), id) : false,
  ]);
  clear(root);
  if (!ev) { root.append(empty("alert-circle-outline", "Etkinlik bulunamadı")); return; }
  let att = attending, favd = fav;
  let count = ev.attendeeCount ?? 0;
  const g = evGenre(ev), [g1, g2] = genreGrad(g);

  // ── Hero: banner + karartma + scrim, geri + kalp üstte ──
  const heart = h("button", { class: "ed-iconbtn", title: "Favori", onclick: async () => {
    if (loginGate("Favorilere eklemek")) return;
    try { if (favd) { await unfavEvent(uid(), id); favd = false; } else { await favEvent(uid(), ev); favd = true; } heart.firstChild?.setAttribute("name", favd ? "heart" : "heart-outline"); heart.firstChild?.style.setProperty("color", favd ? "#EF4444" : "rgba(255,255,255,0.85)"); toast(favd ? "Favorilere eklendi" : "Favoriden çıkarıldı"); } catch (_) { toast("İşlem başarısız", "err"); }
  } }, icon(favd ? "heart" : "heart-outline", { size: 22, color: favd ? "#EF4444" : "rgba(255,255,255,0.85)" }));
  const metaRow = (ic, text, dim) => h("div", { class: "ed-meta" },
    h("span", { class: "ed-meta-ic" }, icon(ic, { size: 14, color: "#fff" })),
    h("span", { class: "ed-meta-tx" + (dim ? " dim" : "") }, text));
  const hero = h("div", { class: "ed-hero", style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
    h("div", { class: "ed-tint" }), h("div", { class: "ed-scrim" }),
    h("div", { class: "ed-hero-top" },
      h("button", { class: "ed-iconbtn", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22, color: "rgba(255,255,255,0.8)" })),
      heart),
    h("div", { class: "ed-hero-body" },
      (ev.vipStatus === "approved" || ev.isVip) ? h("span", { class: "ed-vip" }, icon("sparkles", { size: 12, color: "#fff" }), "VIP DENEYİM") : null,
      g ? h("span", { class: "ed-genre", style: { background: `linear-gradient(90deg, ${g1}, ${g2})` } }, g) : null,
      h("h1", { class: "ed-title" }, ev.title || "Etkinlik"),
      h("div", { class: "ed-metas" },
        ev.artistName ? metaRow("mic", ev.artistName) : metaRow("mic", "Sanatçı henüz açıklanmadı", true),
        g ? metaRow("musical-notes", g) : metaRow("musical-notes", "Tür belirtilmemiş", true),
        metaRow("location", ev.venueName || "—"),
        ev.organizerName ? metaRow("business", ev.organizerName) : null,
        metaRow("time", eventWhen(ev)))));

  // ── 3 istatistik kartı ──
  const hot = count >= 10;
  const statVal = h("div", { class: "ed-stat-val" }, String(count));
  const stats = h("div", { class: "ed-stats" },
    h("div", { class: "ed-stat", style: { background: "linear-gradient(135deg,#1E1040,#2D1B69)" } },
      icon("people", { size: 16, color: "#A78BFA" }), statVal, h("div", { class: "ed-stat-lbl" }, "Katılımcı")),
    h("div", { class: "ed-stat", style: { background: "linear-gradient(135deg,#F59E0BCC,#D97706CC)" } },
      icon("ticket-outline", { size: 16, color: "#fff" }), h("div", { class: "ed-stat-val w" }, ev.ticketPrice ? fmtTL(ev.ticketPrice) : "Ücretsiz"), h("div", { class: "ed-stat-lbl w" }, "Bilet")),
    h("div", { class: "ed-stat", style: { background: hot ? "linear-gradient(135deg,#1A2E1A,#0F3D1F)" : "linear-gradient(135deg,#1E1040,#2D1B69)" } },
      icon(hot ? "flame" : "sparkles", { size: 16, color: hot ? "#10B981" : "#A78BFA" }), h("div", { class: "ed-stat-val", style: hot ? { color: "#10B981" } : null }, hot ? "Sıcak" : "Yeni"), h("div", { class: "ed-stat-lbl" }, "Durum")));

  const sectTitle = (t) => h("h2", { class: "ed-secttitle" }, t);
  const infoCard = (letter, grad, name, sub, onClick) => h("div", { class: "ed-infocard", onclick: onClick },
    h("div", { class: "ed-infoav", style: { background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})` } }, letter),
    h("div", { class: "grow" }, h("div", { class: "ed-infoname" }, name), h("div", { class: "ed-infosub" }, sub)),
    icon("chevron-forward", { size: 18, color: "var(--text-muted)" }));

  // ── Konum doğrulama kartı (yalnız katılıyorsa; QR native — uygulamada) ──
  function verifyCard() {
    const ic = h("span", { class: "ed-ver-ic" }, icon("location-outline", { size: 22, color: "var(--primary)" }));
    const t = h("div", { class: "ed-ver-title" }, "Konum doğrulaması");
    const m = h("div", { class: "ed-ver-sub" }, "Konumun kontrol ediliyor...");
    const set = (iconName, color, title, msg) => { clear(ic); ic.append(icon(iconName, { size: 22, color })); t.textContent = title; m.textContent = msg; };
    const run = () => {
      if (ev.location?.lat == null) return set("location-outline", "var(--primary)", "Etkinliğin konumu yok", "Konum yok — girişini kapıdaki QR ile uygulamadan yapabilirsin.");
      if (!navigator.geolocation) return set("location-outline", "var(--primary)", "Konum izni gerekli", "Tarayıcın konumu desteklemiyor; girişini uygulamadan doğrulayabilirsin.");
      navigator.geolocation.getCurrentPosition((pos) => {
        const dKm = haversineKm({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat: ev.location.lat, lng: ev.location.lng });
        if (dKm <= 0.15) set("time-outline", "var(--amber)", "Etkinlik yerindesin", "Girişini kapıdaki QR kod ile uygulamadan doğrulayabilirsin.");
        else set("navigate-outline", "var(--primary)", "Etkinlik yerinde değilsin", `Etkinliğe ~${dKm < 1 ? Math.round(dKm * 1000) + " m" : dKm.toFixed(1) + " km"} uzaktasın. QR ile girişi uygulama yapar.`);
      }, () => set("location-outline", "var(--primary)", "Konum izni gerekli", "Tarayıcıdan konum iznini açabilir ya da girişini uygulamadan yapabilirsin."));
    };
    const refresh = h("button", { class: "ed-ver-refresh", onclick: run }, icon("refresh", { size: 16, color: "var(--primary)" }));
    run();
    return h("div", { class: "ed-vercard" }, ic, h("div", { class: "grow" }, t, m), refresh);
  }
  const verWrap = h("div", { class: "ed-sect" });
  const drawVer = () => { clear(verWrap); if (att) verWrap.append(verifyCard()); };
  drawVer();

  // ── Katılımcı önizleme ──
  const attHead = h("div", { class: "ed-att", onclick: () => go("#/katilimcilar/" + id) },
    h("div", { class: "ed-att-row" },
      sectTitle(`Katılıyor (${count})`),
      h("span", { class: "ed-att-see" }, "Tümünü Gör", icon("chevron-forward", { size: 14, color: "var(--text-secondary)" }))),
    h("div", { class: "ed-att-hint" }, count > 0 ? "Katılımcıları görmek için dokun →" : "Henüz katılımcı yok"));

  // ── Alt bar: fiyat + Katıl ──
  const joinTxt = h("span", {}, att ? "Katılıyorum" : "Katıl");
  const joinBtn = h("button", { class: "ed-join", style: { background: att ? "linear-gradient(90deg,#10B981,#059669)" : `linear-gradient(90deg, ${g1}, ${g2})` } },
    att ? icon("checkmark-circle", { size: 18, color: "#fff" }) : null, joinTxt);
  joinBtn.onclick = async () => {
    if (loginGate("Etkinliğe katılmak")) return;
    joinBtn.disabled = true; joinTxt.textContent = "Yükleniyor...";
    try {
      if (att) { await unattendEvent(id, uid()); att = false; count--; }
      else {
        if (ev.capacity && count >= ev.capacity) { toast("Kontenjan dolu", "err"); joinBtn.disabled = false; joinTxt.textContent = "Katıl"; return; }
        await attendEvent(ev, uid(), myName(), session.profile?.privacySettings?.anonymousAttendance === true); att = true; count++;
      }
      statVal.textContent = String(count);
      attHead.querySelector(".ed-secttitle").textContent = `Katılıyor (${count})`;
      joinBtn.style.background = att ? "linear-gradient(90deg,#10B981,#059669)" : `linear-gradient(90deg, ${g1}, ${g2})`;
      clear(joinBtn); if (att) joinBtn.append(icon("checkmark-circle", { size: 18, color: "#fff" })); joinBtn.append(joinTxt);
      drawVer();
      toast(att ? "Katıldın! 🎉" : "Katılım iptal edildi");
    } catch (_) { toast("İşlem başarısız", "err"); }
    joinTxt.textContent = att ? "Katılıyorum" : "Katıl";
    joinBtn.disabled = false;
  };
  const footer = h("div", { class: "ed-footer" },
    h("div", { class: "grow" }, h("div", { class: "ed-price-lbl" }, "Bilet Fiyatı"), h("div", { class: "ed-price" }, ev.ticketPrice ? fmtTL(ev.ticketPrice) : "Ücretsiz")),
    joinBtn);

  root.append(hero, stats,
    h("div", { class: "ed-sect" }, sectTitle("Etkinlik Hakkında"),
      ev.description ? h("p", { class: "ed-desc" }, ev.description) : h("p", { class: "ed-desc dim" }, "Açıklama eklenmemiş.")),
    h("div", { class: "ed-sect" }, sectTitle("Mekan"),
      infoCard((ev.venueName || "M").charAt(0).toLocaleUpperCase("tr-TR"), ["#0D3B5E", "#1A5276"], ev.venueName || "Mekan", ev.city || ev.location?.city || "Mekan profilini görüntüle", ev.venueId ? () => go("#/mekan/" + ev.venueId) : null),
      ev.venueId ? btn("Değerlendir", { variant: "ghost", ic: "star-outline", onClick: () => { if (loginGate("Değerlendirme yapmak")) return; reviewModal("venue", { id: ev.venueId, name: ev.venueName }, () => eventDetail(id, root), { id, title: ev.title }); } }) : null),
    ev.artistName ? h("div", { class: "ed-sect" }, sectTitle("Sanatçı"),
      infoCard(ev.artistName.charAt(0).toLocaleUpperCase("tr-TR"), [g1, g2], ev.artistName, g || "Müzik", ev.artistId ? () => go("#/sanatci/" + ev.artistId) : null),
      ev.artistId ? btn("Değerlendir", { variant: "ghost", ic: "star-outline", onClick: () => { if (loginGate("Değerlendirme yapmak")) return; reviewModal("artist", { id: ev.artistId, name: ev.artistName }, () => eventDetail(id, root), { id, title: ev.title }); } }) : null) : null,
    verWrap,
    h("div", { class: "ed-sect" }, attHead),
    h("div", { style: { height: "16px" } }),
    footer);
}

// ── Katılımcılar (app EventAttendeesScreen) ──
const AVATAR_PALETTES = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#EC4899", "#BE185D"], ["#06B6D4", "#0891B2"], ["#F97316", "#EA580C"], ["#6366F1", "#4F46E5"], ["#14B8A6", "#0D9488"], ["#A855F7", "#9333EA"], ["#84CC16", "#65A30D"], ["#FB7185", "#E11D48"]];
function attendeesPage(id) {
  const content = h("div", { class: "at-page" }, h("div", { class: "loading" }, spinner()));
  const page = dtlWrap(content);
  (async () => {
    let ev = null, list = [];
    try { [ev, list] = await Promise.all([eventById(id), eventAttendees(id)]); } catch (_) {}
    clear(content);
    let q = "";
    const sInput = h("input", { placeholder: "Katılımcı ara...", oninput: (e) => { q = e.target.value; draw(); } });
    const listBox = h("div", { class: "at-list" });
    const draw = () => {
      clear(listBox);
      const f = list.filter((a) => { const nm = a.anonymous ? "anonim katılımcı" : (a.displayName || a.name || ""); return !q || fold(nm).includes(fold(q)); });
      if (!f.length) { listBox.append(h("div", { class: "at-empty" }, icon("people-outline", { size: 48, color: "var(--text-muted)" }), h("div", {}, "Eşleşen katılımcı bulunamadı."))); return; }
      f.forEach((a, i) => {
        const name = a.anonymous ? "Anonim Katılımcı" : (a.displayName || a.name || "Kullanıcı");
        const [p1, p2] = AVATAR_PALETTES[i % AVATAR_PALETTES.length];
        listBox.append(h("div", { class: "at-card" },
          h("div", { class: "at-av", style: { background: `linear-gradient(135deg, ${p1}, ${p2})` } }, name.charAt(0).toLocaleUpperCase("tr-TR")),
          h("div", { class: "grow" }, h("div", { class: "at-name" }, name), a.genre ? h("div", { class: "at-genre" }, a.genre) : null),
          h("button", { class: "at-msg", onclick: () => { if (loginGate("Mesaj göndermek")) return; requestChat({ otherId: a.userId || a.id, otherName: name }); go("#/mesajlar"); } }, icon("chatbubble-outline", { size: 16, color: "var(--text-secondary)" }))));
      });
    };
    content.append(
      h("div", { class: "at-head" },
        h("button", { class: "ed-iconbtn dark", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22, color: "var(--text-secondary)" })),
        h("h1", { class: "at-title" }, "Katılımcılar"),
        h("div", { class: "at-sub" }, `${ev?.title || "Etkinlik"} • ${list.length} kişi`)),
      h("div", { class: "at-search" }, icon("search-outline", { size: 16, color: "var(--text-muted)" }), sInput),
      h("div", { class: "at-notice" }, icon("chatbubble-ellipses-outline", { size: 14, color: "var(--amber)" }), h("span", {}, "Katılımcılara dokunarak mesaj gönderebilirsin")),
      listBox);
    draw();
  })();
  return page;
}

function drow(ic, label, value, onClick) {
  return h("div", { class: "drow" + (onClick ? " tappable" : ""), onclick: onClick || null },
    icon(ic, { size: 16, color: "var(--text-muted)" }),
    h("div", { class: "drow-label" }, label),
    h("div", { class: "drow-value" }, value),
    onClick ? icon("chevron-forward", { size: 14, color: "var(--text-muted)" }) : null);
}

// ══════════ SANATÇI DETAY — app ArtistDetailScreen birebir ══════════
function yearsSince(v) { try { const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v); if (isNaN(d)) return null; return (Date.now() - d.getTime()) / (365.25 * 86400e3); } catch { return null; } }
function memberChip(u) {
  const y = yearsSince(u.createdAt); if (y == null) return null;
  const badge = y >= 10 ? ["trophy", "#F59E0B", "10 Yıllık Üye"] : y >= 5 ? ["medal", "#C0C0C8", "5 Yıllık Üye"] : y >= 1 ? ["ribbon", "#CD7F32", "1 Yıllık Üye"] : null;
  if (!badge) return null;
  return h("span", { class: "pd-member" }, icon(badge[0], { size: 12, color: badge[1] }), h("span", { style: { color: badge[1] } }, badge[2]));
}
function membershipText(u) {
  const y = yearsSince(u.createdAt); if (y == null) return null;
  const label = y >= 1 ? Math.floor(y) + " yıldır" : Math.max(1, Math.floor(y * 12)) + " aydır";
  return h("div", { class: "pd-membertext" }, "GigBridge üyesi · " + label);
}
const pdStat = (val, label, star) => h("div", { class: "pd-stat" },
  h("div", { class: "pd-stat-val" }, star ? icon("star", { size: 14, color: "#F59E0B" }) : null, String(val)),
  h("div", { class: "pd-stat-lbl" }, label));
const pdDivider = () => h("div", { class: "pd-div" });
const pdTitle = (t) => h("h2", { class: "ed-secttitle" }, t);
function rvCard(name, rating, comment, createdAt, opts = {}) {
  return h("div", { class: "rv-card" },
    h("div", { class: "rv-top" },
      h("div", { class: "rv-who" },
        h("div", { class: "rv-av" }, opts.anon ? icon("eye-off", { size: 15, color: "#A78BFA" }) : (name || "K").charAt(0).toLocaleUpperCase("tr-TR")),
        h("div", {}, h("div", { class: "rv-name" }, name || "Kullanıcı"), h("div", { class: "rv-date" }, fmtDate(createdAt)))),
      h("span", { class: "stars" }, ...[1, 2, 3, 4, 5].map((i) => icon(i <= (rating || 0) ? "star" : "star-outline", { size: 12, color: "#F59E0B" })))),
    opts.eventTag ? h("div", { class: "rv-eventtag" }, icon("musical-notes-outline", { size: 11, color: "var(--primary)" }), h("span", {}, opts.eventTag)) : null,
    comment ? h("p", { class: "rv-comment" }, comment) : null);
}
function rvEmpty(text) { return h("div", { class: "rv-empty" }, icon("star-outline", { size: 32, color: "var(--text-muted)" }), h("div", {}, text)); }
// Sanatçı sosyal bağlantıları (app socialUrl birebir)
function socialUrl(key, val) {
  const s = String(val || "").trim(); if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const hn = s.replace(/^@/, "");
  if (key === "instagram") return "https://instagram.com/" + hn;
  if (key === "soundcloud") return "https://soundcloud.com/" + hn;
  if (key === "youtube") return "https://www.youtube.com/results?search_query=" + encodeURIComponent(s);
  return "https://open.spotify.com/search/" + encodeURIComponent(s); // spotify
}
function socialBlock(social) {
  if (!social) return null;
  const META = [["instagram", "logo-instagram"], ["soundcloud", "logo-soundcloud"], ["spotify", "musical-notes"], ["youtube", "logo-youtube"]];
  const links = META.map(([k, ic]) => { const u = socialUrl(k, social[k]); return u ? h("a", { class: "pd-social", href: u, target: "_blank", rel: "noopener" }, icon(ic, { size: 20, color: "var(--primary)" })) : null; }).filter(Boolean);
  if (!links.length) return null;
  return h("div", { class: "ed-sect" }, h("h2", { class: "ed-secttitle" }, "Sosyal"), h("div", { class: "pd-socials" }, ...links));
}

function artistDetailPage(id) {
  const content = h("div", { class: "pd-page" }, h("div", { class: "loading" }, spinner()));
  const page = dtlWrap(content);
  artistDetail(id, content);
  return page;
}
async function artistDetail(id, root) {
  const [a, revs, following, follCount] = await Promise.all([
    userById(id), artistReviews(id),
    authed() ? isFollowing(uid(), id) : false,
    artistFollowerCount(id),
  ]);
  clear(root);
  if (!a) { root.append(empty("alert-circle-outline", "Sanatçı bulunamadı")); return; }
  const name = a.displayName || a.name || "Sanatçı";
  const genres = [...new Set((Array.isArray(a.genres) ? a.genres : a.genre ? [a.genre] : []).filter(Boolean))];
  // Ortalama YALNIZ puanlı (rating>0) yorumlardan — Top10/fetchArtistRatings ile TUTARLI.
  // (Eskiden rating=0 kriter-yorumları da bölene giriyordu → detayda 5.0, Top10'da farklı çıkıyordu.)
  const rated = revs.filter((r) => (r.rating || 0) > 0);
  const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : "—";
  const custRevs = revs.filter((r) => (r.authorType ?? "customer") === "customer");
  let foll = following;

  const fIc = () => icon(foll ? "checkmark-circle" : "person-add-outline", { size: 18, color: foll ? "#C084FC" : "#A78BFA" });
  const fTx = h("span", {}, foll ? "Takipte" : "Takip Et");
  const followBtn = h("button", { class: "pd-act" + (foll ? " on" : "") }, fIc(), fTx);
  followBtn.onclick = async () => {
    if (loginGate("Takip etmek")) return;
    followBtn.disabled = true;
    try {
      if (foll) { await unfollowArtist(uid(), id); foll = false; } else { await followArtist(uid(), a); foll = true; }
      followBtn.classList.toggle("on", foll); fTx.textContent = foll ? "Takipte" : "Takip Et";
      followBtn.replaceChild(fIc(), followBtn.firstChild);
      toast(foll ? "Takip ediliyor" : "Takipten çıkıldı");
    } catch (_) { toast("İşlem başarısız", "err"); }
    followBtn.disabled = false;
  };
  const frev = featuredReview(revs);   // ③ öne çıkan yorum (varsa)

  root.append(
    h("div", { class: "pd-hero pd-artist" + (a.bannerUrl ? " has-banner" : ""), style: a.accentColor ? { "--accent": a.accentColor } : null },
      a.bannerUrl ? h("div", { class: "pd-banner", style: { backgroundImage: `url(${a.bannerUrl})` } }) : null,
      h("button", { class: "ed-iconbtn dark", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22, color: "var(--text-secondary)" })),
      h("div", { class: "pd-center" },
        a.photoURL ? h("div", { class: "pd-av round zoomable", style: { backgroundImage: `url(${a.photoURL})` }, title: "Büyüt", onclick: () => lightbox(a.photoURL) }) : h("div", { class: "pd-av round" }, name.charAt(0).toLocaleUpperCase("tr-TR")),
        h("h1", { class: "pd-name" }, name),
        (() => { const tb = trustedBadge(avg, rated.length); const pb = priceBadge(a); return (tb || pb) ? h("div", { class: "badge-row", style: { justifyContent: "center" } }, tb, pb) : null; })(),
        genres[0] ? h("span", { class: "pd-genrepill" }, genres[0]) : null,
        profileTagline(a),
        memberChip(a), membershipText(a),
        profileResidency(a),
        availabilityBadge(a),
        h("div", { class: "pd-stats" },
          pdStat(avg, "Puan", true), pdDivider(),
          pdStat(follCount ?? shortNum(a.followerCount ?? 0), "Takipçi"), pdDivider(),
          pdStat(revs.length, "Yorum")))),
    h("div", { class: "pd-acts" },
      followBtn,
      h("button", { class: "pd-act", onclick: () => { if (loginGate("Mesaj göndermek")) return; requestChat({ otherId: id, otherName: name }); go("#/mesajlar"); } }, icon("chatbubble-ellipses-outline", { size: 18, color: "#A78BFA" }), h("span", {}, "Mesaj")),
      h("button", { class: "pd-act solid", onclick: () => {
        if (loginGate("Teklif göndermek")) return;
        bookingRequestModal({ artistName: name, onSubmit: async (text) => {
          try {
            const me = uid();
            await sendMessage({ fromId: me, fromName: session.profile?.displayName || "Ben", fromType: session.profile?.userType, toId: id, toName: name, text, convId: convIdFor(me, id), isGroup: false });
            toast("Teklif isteğin gönderildi");
            requestChat({ otherId: id, otherName: name }); go("#/mesajlar");
          } catch (_) { toast("Gönderilemedi", "err"); }
        } });
      } }, icon("send", { size: 17, color: "#fff" }), h("span", { style: { color: "#fff" } }, "Teklif İste"))),
    featuredSet(a.featuredSetUrl),                                        // ② Öne Çıkan Set
    frev ? h("div", { class: "ed-sect" }, pdTitle("Öne Çıkan Yorum"), frev) : null,   // ③ öne çıkan yorum
    h("div", { class: "ed-sect" }, pdTitle("Hakkında"),
      h("p", { class: "ed-desc" + (a.bio ? "" : " dim") }, a.bio || "Sanatçı henüz biyografi eklememiş."),
      a.experienceYears ? h("div", { class: "pd-exp" }, icon("time-outline", { size: 14, color: "var(--text-secondary)" }), h("span", {}, a.experienceYears + " yıl deneyim")) : null),
    rateCardBlock(a.packages),                                           // paketler & fiyat (Faz 3: etkinlik-türü segmenti)
    addOnsBlock(a),                                                      // Faz 3: ek hizmetler
    termsBlock(a),                                                       // Faz 3: kapora + iptal politikası
    suitabilityBlock(a),                                                 // ne için uygun
    serviceAreaBlock(a),                                                 // hizmet bölgesi
    techRiderBlock(a),                                                   // kurulum & detaylar
    languagesBlock(a),                                                   // Faz 3: diller + MC
    venueChips(revs),                                                    // ③ çaldığı mekanlar
    videoReel(a.videoUrls),                                              // performans reel
    genres.length ? h("div", { class: "ed-sect" }, pdTitle("Müzik Tarzları"),
      h("div", { class: "pd-tags" }, ...genres.map((g) => h("span", { class: "pd-tag" }, g)))) : null,
    socialBlock(a.social),
    h("div", { class: "ed-sect" },
      h("div", { class: "rv-head" }, pdTitle("Yorumlar"),
        h("button", { class: "rv-add", onclick: () => { if (loginGate("Yorum yapmak")) return; reviewModal("artist", a, () => artistDetail(id, root)); } }, "+ Yorum Yap")),
      custRevs.length ? h("div", {}, ...custRevs.map((r) => rvCard(r.authorName, r.rating, r.comment, r.createdAt))) : rvEmpty("Henüz yorum yok.")),
  );
}

// ══════════ MEKAN DETAY — app VenueDetailScreen birebir ══════════
function venueDetailPage(id) {
  const content = h("div", { class: "pd-page" }, h("div", { class: "loading" }, spinner()));
  const page = dtlWrap(content);
  venueDetail(id, content);
  return page;
}
async function venueDetail(id, root) {
  const [v, revs, fav, evRevs] = await Promise.all([
    userById(id), getVenueReviews(id),
    authed() ? isFavVenue(uid(), id) : false,
    venueTimeline(id).catch(() => []),
  ]);
  clear(root);
  if (!v) { root.append(empty("alert-circle-outline", "Mekan bulunamadı")); return; }
  const name = v.displayName || "Mekan";
  const genres = [...new Set((Array.isArray(v.genres) ? v.genres : v.genre ? [v.genre] : []).filter(Boolean))];
  const custR = revs.filter((r) => (r.authorType ?? "customer") !== "artist");
  const artR = revs.filter((r) => (r.authorType ?? "customer") === "artist")
    .filter((r) => (r.visibility ?? (r.isAnonymous ? "anonymous" : "everyone")) !== "artists")
    .map((r) => { const anon = (r.visibility ?? (r.isAnonymous ? "anonymous" : "everyone")) === "anonymous"; return { ...r, _name: anon ? "Anonim Sanatçı" : (r.authorName ?? r.artistName ?? "Sanatçı"), _anon: anon }; });
  const rated = revs.filter((r) => Number(r.overallRating ?? r.rating) > 0);
  const avg = rated.length ? (rated.reduce((s, r) => s + Number(r.overallRating ?? r.rating), 0) / rated.length).toFixed(1) : "—";
  let favd = fav;

  const svIc = () => icon(favd ? "bookmark" : "bookmark-outline", { size: 16, color: favd ? "#34D399" : "#A78BFA" });
  const svTx = h("span", { style: favd ? { color: "#34D399" } : null }, favd ? "Kaydedildi" : "Kaydet");
  const saveBtn = h("button", { class: "pd-act" + (favd ? " saved" : "") }, svIc(), svTx);
  saveBtn.onclick = async () => {
    if (loginGate("Kaydetmek")) return;
    saveBtn.disabled = true;
    try {
      if (favd) { await unfavVenue(uid(), id); favd = false; } else { await favVenue(uid(), v); favd = true; }
      saveBtn.classList.toggle("saved", favd); svTx.textContent = favd ? "Kaydedildi" : "Kaydet"; svTx.style.color = favd ? "#34D399" : "";
      saveBtn.replaceChild(svIc(), saveBtn.firstChild);
      toast(favd ? "Kaydedildi" : "Kaldırıldı");
    } catch (_) { toast("İşlem başarısız", "err"); }
    saveBtn.disabled = false;
  };

  root.append(
    h("div", { class: "pd-hero pd-venue" },
      h("button", { class: "ed-iconbtn dark", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22, color: "var(--text-secondary)" })),
      h("div", { class: "pd-center" },
        v.photoURL ? h("div", { class: "pd-av sq zoomable", style: { backgroundImage: `url(${v.photoURL})` }, title: "Büyüt", onclick: () => lightbox(v.photoURL) }) : h("div", { class: "pd-av sq" }, name.charAt(0).toLocaleUpperCase("tr-TR")),
        h("h1", { class: "pd-name" }, name),
        h("span", { class: "pd-citypill" }, icon("location-outline", { size: 13, color: "#A78BFA" }), h("span", {}, [v.city, v.district].filter(Boolean).join(" · ") || "Şehir belirtilmemiş")),
        v.address ? h("div", { class: "pd-address" }, icon("navigate-outline", { size: 12, color: "var(--text-muted)" }), h("span", {}, v.address)) : null,
        h("div", { class: "pd-stats" },
          pdStat(avg, "Puan", true), pdDivider(),
          pdStat(v.capacity ?? "—", "Kapasite"), pdDivider(),
          pdStat(custR.length, "Yorum")))),
    h("div", { class: "pd-acts" },
      saveBtn,
      h("button", { class: "pd-act", onclick: () => { if (loginGate("Mesaj göndermek")) return; requestChat({ otherId: id, otherName: name }); go("#/mesajlar"); } }, icon("chatbubble-outline", { size: 16, color: "#A78BFA" }), h("span", {}, "Mesaj")),
      h("button", { class: "pd-act solid", onclick: () => { if (loginGate("Puan vermek")) return; reviewModal("venue", v, () => venueDetail(id, root)); } }, icon("star-outline", { size: 16, color: "#fff" }), h("span", { style: { color: "#fff" } }, "Puan Ver"))),
    (v.location?.lat != null) ? h("div", { class: "ed-sect" },
      h("button", { class: "pd-map", onclick: () => window.open(`https://www.google.com/maps/search/?api=1&query=${v.location.lat},${v.location.lng}`, "_blank") },
        icon("location", { size: 18, color: "#fff" }), h("span", {}, "Haritada Göster / Yol Tarifi"))) : null,
    h("div", { class: "ed-sect" }, pdTitle("Mekan Hakkında"),
      h("p", { class: "ed-desc" + ((v.description || v.bio) ? "" : " dim") }, v.description || v.bio || "Mekan henüz açıklama eklememiş.")),
    h("div", { class: "ed-sect" }, pdTitle("Özellikler"),
      (Array.isArray(v.amenities) && v.amenities.length)
        ? h("div", { class: "pd-feats" }, ...v.amenities.map((am) => h("span", { class: "pd-feat" }, icon("checkmark-circle-outline", { size: 16, color: "var(--text-secondary)" }), h("span", {}, am))))
        : h("p", { class: "ed-desc dim" }, "Olanak belirtilmemiş")),
    genres.length ? h("div", { class: "ed-sect" }, pdTitle("Müzik Türleri"),
      h("div", { class: "pd-tags" }, ...genres.map((g) => h("span", { class: "pd-tag vio" }, g)))) : null,
    h("div", { class: "ed-sect" },
      h("div", { class: "rv-head" }, pdTitle("Müşteri Yorumları"),
        h("button", { class: "rv-add", onclick: () => { if (loginGate("Yorum yapmak")) return; reviewModal("venue", v, () => venueDetail(id, root)); } }, "+ Yorum Yap")),
      custR.length ? h("div", {}, ...custR.map((r) => rvCard(r.authorName, r.overallRating ?? r.rating, r.comment, r.createdAt))) : rvEmpty("Henüz müşteri yorumu yok.")),
    artR.length ? h("div", { class: "ed-sect" },
      h("div", { class: "rv-head" }, pdTitle("Sanatçı Yorumları"),
        h("span", { class: "rv-artistbadge" }, icon("mic", { size: 11, color: "var(--primary)" }), "Sanatçı")),
      h("div", {}, ...artR.map((r) => rvCard(r._name, r.overallRating ?? r.rating, r.comment, r.createdAt, { anon: r._anon })))) : null,
    evRevs.length ? h("div", { class: "ed-sect" }, pdTitle("Etkinlik Yorumları"),
      h("div", {}, ...evRevs.map((r) => rvCard(r.authorName, r.rating, r.content || r.comment, r.createdAt, { eventTag: r.event || null })))) : null,
  );
}

function profileHead(u, color, sub) {
  return h("div", { class: "profile-head detail-head" },
    u.photoURL ? h("div", { class: "acard-photo big", style: { backgroundImage: `url(${u.photoURL})` } }) : avatar(u.displayName, color),
    h("div", {}, h("div", { class: "ph-name" }, u.displayName || "—"), h("div", { class: "ph-mail" }, sub)));
}
function statCard(val, label) { return h("div", { class: "stat-card" }, h("div", { class: "stat-val" }, val), h("div", { class: "stat-label" }, label)); }
function shortNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n); }
function msgBtn(u) { return btn("Mesaj", { ic: "chatbubble-ellipses-outline", onClick: () => { if (loginGate("Mesaj göndermek")) return; requestChat({ otherId: u.id, otherName: u.displayName || "Kullanıcı" }); go("#/mesajlar"); } }); }
function stars(n) { return h("span", { class: "stars" }, ...[1, 2, 3, 4, 5].map((i) => icon(i <= (n || 0) ? "star" : "star-outline", { size: 13, color: "var(--amber)" }))); }
function reviewCard(name, rating, comment, createdAt, isArtist) {
  return h("div", { class: "review-card" },
    h("div", { class: "review-top" },
      h("div", { class: "review-who" }, avatar(name, isArtist ? ROLE.artist : C),
        h("div", {}, h("div", { class: "review-name" }, name || "Kullanıcı"), h("div", { class: "review-date" }, fmtDate(createdAt)))),
      stars(rating)),
    comment ? h("p", { class: "review-comment" }, comment) : null);
}
function reviewsBlock(title, cards) {
  return h("section", { class: "sect" }, h("div", { class: "sect-head" }, h("h2", { class: "sect-title" }, title)),
    cards.length ? h("div", {}, ...cards) : empty("chatbox-outline", "Henüz yorum yok"));
}

// Puan & Yorum modalı — app bottom-sheet tasarımı (36px yıldız, min 10 karakter)
function reviewModal(kind, target, onDone, ev) {
  let rating = 0;
  const starRow = h("div", { class: "rv-starpick" });
  const paint = () => { clear(starRow); [1, 2, 3, 4, 5].forEach((i) => starRow.append(h("button", { class: "star-btn", onclick: () => { rating = i; paint(); } }, icon(i <= rating ? "star" : "star-outline", { size: 36, color: i <= rating ? "#F59E0B" : "var(--text-muted)" })))); };
  paint();
  const ta = h("textarea", { class: "rv-input", rows: 4, maxlength: 500, placeholder: "Yorumunuzu yazın... (en az 10 karakter)" });
  modal({
    title: "Puan & Yorum",
    body: h("div", {}, h("p", { class: "rv-modalsub" }, target.displayName || target.name || ""), starRow, ta),
    actions: [
      { label: "İptal", variant: "ghost", onClick: () => {} },
      { label: "Gönder", keepOpen: true, onClick: async (close) => {
        if (rating < 1) { toast("Puan seç", "err"); return; }
        if (ta.value.trim().length < 10) { toast("Yorum en az 10 karakter olmalı", "err"); return; }
        try {
          if (kind === "artist") await submitArtistReview(uid(), myName(), target, rating, ta.value.trim(), ev);
          else await submitVenueReview(uid(), myName(), target, rating, ta.value.trim(), ev);
          toast("Yorumun gönderildi"); close(); onDone && onDone();
        } catch (_) { toast("Gönderilemedi", "err"); }
      } }],
  });
}

// ── Müşteri isim değiştirme cooldown (30 gün) — mekan/sanatçı desenindeki displayNameChangedAt damgasıyla, admin onayı YOK ──
function nameStampMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") { const t = Date.parse(v); return isNaN(t) ? null : t; }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return null;
}
function nameChangeModal(root, p) {
  const cur = p.displayName || "Müşteri";
  const body = h("div", {},
    h("p", { class: "muted small mb6" }, "Adını 30 günde bir değiştirebilirsin."),
    h("div", { class: "nc-current" }, "Mevcut ad: ", h("b", {}, cur)),
    field({ label: "Yeni Ad", id: "cnc_new", value: cur, placeholder: "Yeni adın" }));
  modal({ title: "Adımı Değiştir", body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Kaydet", ic: "checkmark", keepOpen: true, onClick: async (close) => {
      const nn = (document.querySelector("#cnc_new")?.value || "").trim();
      if (!nn) return toast("Yeni ad gir", "err");
      if (nn === cur) return toast("Ad zaten aynı", "err");
      // Ad değiştiyse cooldown kontrol — müşteri 30 gün
      const roleDays = (session.profile?.userType === "customer") ? 30 : 90;
      const lastMs = nameStampMs(session.profile?.displayNameChangedAt);
      const canChange = lastMs == null || (Date.now() - lastMs) >= roleDays * 86400000;
      if (!canChange) {
        const nextDate = new Date(lastMs + roleDays * 86400000).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
        return toast(`${nextDate} tarihinde değiştirebilirsin`, "err");
      }
      try {
        await saveProfile(uid(), { displayName: nn, displayNameChangedAt: serverTimestamp() });
        await refreshProfile();
        toast("Adın güncellendi");
        close();
        renderProfil(root);
      } catch (_) { toast("Kaydedilemedi", "err"); }
    } },
  ] });
}

// ══════════ PROFİL — app müşteri ProfileScreen birebir ══════════
async function renderProfil(root) {
  clear(root);
  if (!authed()) {
    root.append(
      empty("person-circle-outline", "Misafir olarak geziyorsun", "Etkinliklere katılmak, favorilere eklemek, takip etmek ve profil oluşturmak için giriş yap."),
      h("div", { class: "cta-row" }, btn("Giriş Yap", { ic: "log-in-outline", full: true, color: C, onClick: () => loginModal() })),
      h("div", { class: "cta-row" }, btn("Yeni Hesap Oluştur", { variant: "ghost", ic: "person-add-outline", full: true, onClick: () => go("#/register") })),
    );
    return;
  }
  const p = session.profile || {};
  const name = p.displayName || "Müşteri";

  // Avatar (gradyan halka + kamera düzenleme)
  const avInner = p.photoURL
    // Fotoğrafa tıkla → BÜYÜT (düzenleme kamera rozetinde). preventDefault: label'ın
    // dosya seçiciyi tetiklemesini engeller; sadece kamera rozeti düzenleme açar.
    ? h("div", { class: "cp-av zoomable", title: "Büyüt", style: { backgroundImage: `url(${p.photoURL})` },
        onclick: (e) => { e.preventDefault(); lightbox(p.photoURL); } })
    : h("div", { class: "cp-av grad" }, name.charAt(0).toLocaleUpperCase("tr-TR"));
  const fileInp = h("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: async (e) => {
    const f = (e.target.files || [])[0]; if (!f) return;
    try { const url = await uploadImage(f, uid()); await saveProfile(uid(), { photoURL: url }); await refreshProfile(); toast("Fotoğraf güncellendi"); renderProfil(root); }
    catch (_) { toast("Yüklenemedi", "err"); }
  } });
  const avatarBox = h("label", { class: "cp-avring" }, avInner,
    h("span", { class: "cp-avedit" }, icon("camera", { size: 13, color: "var(--text)" })), fileInp);

  // İstatistikler (Etkinlik / Takip / Yorum / Ort. Verdiğim)
  const stVal = { ev: h("div", { class: "cp-stat-val" }, "…"), fo: h("div", { class: "cp-stat-val" }, "…"), rv: h("div", { class: "cp-stat-val" }, "…"), avg: h("div", { class: "cp-stat-val" }, "…") };
  const badges = { takip: h("span", { class: "cp-badge", style: { display: "none" } }), kat: h("span", { class: "cp-badge", style: { display: "none" } }), yorum: h("span", { class: "cp-badge", style: { display: "none" } }), fav: h("span", { class: "cp-badge", style: { display: "none" } }) };
  (async () => {
    try {
      const [att, fol, revs, favV, favE] = await Promise.all([
        attendedEvents(uid()).catch(() => []), followingList(uid()).catch(() => []),
        myReviews(uid()).catch(() => []), favVenues(uid()).catch(() => []), favEvents(uid()).catch(() => []),
      ]);
      stVal.ev.textContent = String(att.length); stVal.fo.textContent = String(fol.length); stVal.rv.textContent = String(revs.length);
      const rr = revs.map((r) => Number(r.overallRating ?? r.rating)).filter((x) => x > 0);
      stVal.avg.textContent = rr.length ? (rr.reduce((a, b) => a + b, 0) / rr.length).toFixed(1) : "—";
      const setB = (el, n) => { if (n > 0) { el.textContent = String(n); el.style.display = ""; } };
      setB(badges.takip, fol.length); setB(badges.kat, att.length); setB(badges.yorum, revs.length); setB(badges.fav, fol.length + favV.length + favE.length);
    } catch (_) {}
  })();
  const stat = (ic, valEl, label, hash, amber) => h("div", { class: "cp-stat" + (hash ? " tap" : ""), onclick: hash ? () => go(hash) : null },
    icon(ic, { size: 15, color: amber ? "#F59E0B" : "var(--primary)" }), valEl, h("div", { class: "cp-stat-lbl" }, label));

  // Şehir seçici (aranabilir 81 il + Konumumu Kullan)
  function cityPicker() {
    let unsubClose = null;
    const listBox = h("div", { class: "hs-citylist", style: { maxHeight: "260px" } });
    const sInp = h("input", { placeholder: "İl ara (örn. Aydın)...", oninput: () => drawList() });
    const pick = async (c) => { try { await saveProfile(uid(), { city: c }); await refreshProfile(); toast(c + " kaydedildi"); m.close(); renderProfil(root); } catch (_) { toast("Kaydedilemedi", "err"); } };
    const drawList = () => {
      clear(listBox);
      const q = fold(sInp.value.trim());
      PROVINCES.filter((c) => !q || fold(c).includes(q)).forEach((c) =>
        listBox.append(h("button", { class: "hs-city-item" + (c === p.city ? " on" : ""), onclick: () => pick(c) }, c)));
    };
    const locBtn = h("button", { class: "hs-locate", onclick: () => {
      if (!navigator.geolocation) return toast("Konum desteklenmiyor", "err");
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&accept-language=tr`);
          const j = await r.json();
          const prov = j.address?.province || j.address?.state || j.address?.city || "";
          const match = PROVINCES.find((x) => fold(x) === fold(prov));
          if (match) pick(match); else toast("Şehir belirlenemedi", "err");
        } catch (_) { toast("Şehir belirlenemedi", "err"); }
      }, () => toast("Konum alınamadı (izin?)", "err"));
    } }, icon("navigate", { size: 14, color: "var(--primary)" }), h("span", {}, "Konumumu Kullan"));
    const m = modal({ title: "Şehir Seç", body: h("div", { class: "hs-citydrop", style: { margin: 0 } }, locBtn,
      h("div", { class: "hs-citysearch" }, icon("search-outline", { size: 14, color: "var(--text-muted)" }), sInp), listBox), actions: [] });
    drawList();
  }

  const menuRow = (ic, label, onClick, right, last, highlight) => h("div", { class: "cp-menurow" + (last ? " last" : ""), onclick: onClick },
    h("span", { class: "cp-menuic" }, icon(ic, { size: 18, color: highlight ? "#F59E0B" : "var(--text-secondary)" })),
    h("span", { class: "cp-menulbl" + (highlight ? " hl" : "") }, label),
    right || null, icon("chevron-forward", { size: 18, color: "var(--text-muted)" }));

  // Anonim katılım toggle'ı — checkbox tabanlı (.toggle-wrapper) yeni tasarım
  const anonCheckbox = h("input", { type: "checkbox", class: "toggle-checkbox" });
  anonCheckbox.checked = p.privacySettings?.anonymousAttendance === true;
  const anonToggle = h("label", { class: "toggle-wrapper", onclick: (e) => e.stopPropagation() },
    anonCheckbox,
    h("div", { class: "toggle-container" },
      h("div", { class: "toggle-button" },
        h("div", { class: "toggle-button-circles-container" },
          ...Array.from({ length: 12 }, () => h("div", { class: "toggle-button-circle" }))))));

  let savingAnon = false;
  const applyAnon = async (next) => {
    if (savingAnon) return;
    savingAnon = true;
    try {
      await saveProfile(uid(), { privacySettings: { ...(session.profile?.privacySettings || {}), anonymousAttendance: next } });
      p.privacySettings = { ...(p.privacySettings || {}), anonymousAttendance: next };
      if (session.profile) session.profile.privacySettings = { ...(session.profile.privacySettings || {}), anonymousAttendance: next };
      anonCheckbox.checked = next;
      toast(next ? "Katılımlarda adın gizlenecek" : "Katılımlarda adın görünecek");
    } catch (_) {
      anonCheckbox.checked = !next; // hata: eski duruma geri al
      toast("Kaydedilemedi", "err");
    } finally { savingAnon = false; }
  };
  anonCheckbox.addEventListener("change", () => applyAnon(anonCheckbox.checked));
  // Satırın herhangi bir yerine tıklanınca da toggle'ı çevir (checkbox stopPropagation yapar)
  const toggleAnon = () => { anonCheckbox.checked = !anonCheckbox.checked; applyAnon(anonCheckbox.checked); };

  root.append(
    h("div", { class: "cp-hero" },
      avatarBox,
      h("div", { class: "cp-name" }, name),
      h("div", { class: "cp-mail" }, p.email || ""),
      h("span", { class: "cp-typebadge" }, icon("headset-outline", { size: 13, color: "var(--primary)" }), "Üye")),
    h("div", { class: "cp-stats" },
      stat("calendar-outline", stVal.ev, "Etkinlik", "#/katildiklarim"), h("div", { class: "pd-div tall" }),
      stat("people-outline", stVal.fo, "Takip", "#/takip"), h("div", { class: "pd-div tall" }),
      stat("chatbubble-outline", stVal.rv, "Yorum"), h("div", { class: "pd-div tall" }),
      stat("star", stVal.avg, "Ort. Verdiğim", null, true)),
    h("div", { class: "cp-menu" },
      menuRow("location-outline", "Şehrim", cityPicker, h("span", { class: "cp-cityval" }, p.city || "Seç")),
      menuRow("create-outline", "Adımı Değiştir", () => nameChangeModal(root, p)),
      menuRow("mail-outline", "E-posta Değiştir", () => changeEmailModal()),
      menuRow("key-outline", "Şifre Değiştir", () => changePasswordModal()),
      menuRow("ticket-outline", "Biletlerim", () => go("#/biletlerim"), null, false, true),
      menuRow("heart-outline", "Takip Ettiklerim", () => go("#/takip"), badges.takip),
      menuRow("checkmark-done-outline", "Katıldığım Etkinlikler", () => go("#/katildiklarim"), badges.kat),
      menuRow("compass-outline", "Etkinlikleri Keşfet", () => go("#/etkinlikler")),
      menuRow("chatbox-ellipses-outline", "Yorumlarım", () => go("#/yorumlarim"), badges.yorum),
      menuRow("bookmark-outline", "Favorilerim", () => go("#/favoriler"), badges.fav),
      menuRow("notifications-outline", "Bildirimler", () => go("#/bildirimler")),
      menuRow("eye-off-outline", "Katılımlarda adımı gizle", toggleAnon, anonToggle),
      h("a", { class: "cp-menurow", href: "gizlilik.html" }, h("span", { class: "cp-menuic" }, icon("shield-checkmark-outline", { size: 18, color: "var(--text-secondary)" })), h("span", { class: "cp-menulbl" }, "Gizlilik Politikası"), icon("open-outline", { size: 15, color: "var(--text-muted)" })),
      h("a", { class: "cp-menurow", href: "kullanim-kosullari.html" }, h("span", { class: "cp-menuic" }, icon("document-text-outline", { size: 18, color: "var(--text-secondary)" })), h("span", { class: "cp-menulbl" }, "Kullanım Koşulları"), icon("open-outline", { size: 15, color: "var(--text-muted)" })),
      h("a", { class: "cp-menurow last", href: "hesap-sil.html" }, h("span", { class: "cp-menuic" }, icon("trash-outline", { size: 18, color: "#EF4444" })), h("span", { class: "cp-menulbl" }, "Hesap Silme"), icon("open-outline", { size: 15, color: "var(--text-muted)" }))),
    h("button", { class: "cp-logout", onclick: () => {
      modal({ title: "Çıkış", body: h("p", { class: "muted" }, "Hesabınızdan çıkmak istediğinize emin misiniz?"),
        actions: [{ label: "Vazgeç", variant: "ghost", onClick: () => {} }, { label: "Çıkış Yap", variant: "danger", onClick: () => logout() }] });
    } }, icon("log-out-outline", { size: 17, color: "#F87171" }), h("span", {}, "Çıkış Yap")),
    h("button", { class: "cp-delete", onclick: () => {
      modal({ title: "Hesabımı Sil", body: h("p", { class: "muted" }, "Hesabınız ve tüm verileriniz (takipler, favoriler, yorumlar, paylaşımlar) kalıcı olarak silinecek. Bu işlem geri alınamaz."),
        actions: [{ label: "Vazgeç", variant: "ghost", onClick: () => {} }, { label: "Hesabımı Sil", variant: "danger", keepOpen: true, onClick: async (close) => {
          try { await deleteMyAccount(); close(); toast("Hesabın silindi"); location.hash = "#/"; }
          catch (e) { toast((e && e.code) === "auth/requires-recent-login" ? "Güvenlik için yeniden giriş yapıp tekrar dene" : "Silinemedi", "err"); }
        } }] });
    } }, "Hesabımı Sil"),
  );
}

// ══════════ AKIŞ — app TimelineScreen birebir ══════════
const AV_GRADS = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#06B6D4", "#0891B2"], ["#EC4899", "#BE185D"]];
const avGrad = (name) => AV_GRADS[[...String(name || "?")].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_GRADS.length];
const gradAv = (name, size) => { const [a, b] = avGrad(name); return h("div", { class: "tl-av", style: { width: size + "px", height: size + "px", borderRadius: (size / 2) + "px", background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: Math.round(size * 0.38) + "px" } }, (name || "?").charAt(0).toLocaleUpperCase("tr-TR")); };
const POST_TYPES = { review: { c: "#F59E0B", ic: "star-outline", l: "Yorum" }, checkin: { c: "#06B6D4", ic: "location-outline", l: "Check-in" }, discovery: { c: "#A855F7", ic: "compass-outline", l: "Keşif" }, invite: { c: "#10B981", ic: "people-outline", l: "Davet" } };
let feedSrc = "takip";

function renderAkis(root) {
  clear(root);
  const shareBtn = h("button", { class: "tl-sharebtn", onclick: () => { if (loginGate("Gönderi paylaşmak")) return; postModal(); } }, icon("add", { size: 15, color: "#fff" }), h("span", {}, "Paylaş"));
  const tabTakip = h("button", { class: "tl-srctab" }, icon("people-outline", { size: 14 }), h("span", {}, "Takip"));
  const tabSehir = h("button", { class: "tl-srctab" }, icon("location-outline", { size: 14 }), h("span", {}, "Şehrim"));
  const paintTabs = () => { tabTakip.classList.toggle("on", feedSrc === "takip"); tabSehir.classList.toggle("on", feedSrc === "sehir"); };
  const listWrap = h("div", { class: "tl-feed" }, h("div", { class: "loading" }, spinner()));
  let posts = [], followIds = new Set(), loaded = false;
  const myCity = () => (session.profile?.city || "").trim();

  const drawFeed = () => {
    if (!loaded) return;
    clear(listWrap);
    let list = posts;
    if (feedSrc === "takip") list = posts.filter((p) => p.authorId === uid() || followIds.has(p.authorId));
    else list = posts.filter((p) => myCity() && fold(p.authorCity) === fold(myCity()));
    if (!list.length) {
      listWrap.append(h("div", { class: "tl-empty" },
        h("div", { class: "tl-empty-ic" }, icon("newspaper-outline", { size: 32, color: "var(--primary)" })),
        h("div", { class: "tl-empty-title" }, "Gönderi yok"),
        h("div", { class: "tl-empty-sub" }, feedSrc === "sehir"
          ? (myCity() ? `${myCity()} şehrinde henüz paylaşım yok.` : "Şehir akışı için profilinizde şehir bilgisi olmalı.")
          : "Takip ettiğiniz kullanıcılar henüz paylaşım yapmamış. Profil > Takip Ettiklerim bölümünden kullanıcı takip edebilirsiniz.")));
      return;
    }
    list.forEach((p) => listWrap.append(postCard(p)));
  };
  tabTakip.onclick = () => { feedSrc = "takip"; paintTabs(); drawFeed(); };
  tabSehir.onclick = () => { feedSrc = "sehir"; paintTabs(); drawFeed(); };
  paintTabs();

  root.append(
    h("div", { class: "tl-headrow" }, h("div", { class: "grow" }), shareBtn),
    h("div", { class: "tl-sep" }),
    h("div", { class: "tl-srctabs" }, tabTakip, tabSehir),
    listWrap);

  if (authed()) followingList(uid()).then((l) => { followIds = new Set(l.map((f) => f.artistId || f.id)); drawFeed(); }).catch(() => {});
  const unsub = listenTimeline((ps) => { posts = ps; loaded = true; drawFeed(); });
  root._cleanup = unsub;
}

function postCard(p) {
  const tc = POST_TYPES[p.type] || POST_TYPES.discovery;
  let liked = false, likeCount = p.likeCount ?? 0;
  const likeIc = () => icon(liked ? "heart" : "heart-outline", { size: 22, color: liked ? "#EF4444" : "var(--text-secondary)" });
  const likeCnt = h("span", { class: "tl-actcount" }, String(likeCount));
  const likeBtn = h("button", { class: "tl-act tl-like" }, likeIc(), likeCnt);
  likeBtn.onclick = async () => {
    if (loginGate("Beğenmek")) return;
    try {
      await toggleLike(p.id, uid(), liked);
      liked = !liked; likeCount += liked ? 1 : -1;
      likeBtn.replaceChild(likeIc(), likeBtn.firstChild);
      likeBtn.classList.toggle("liked", liked);   // beğenilince ripple animasyonu aktif kalır
      likeCnt.textContent = String(likeCount); likeCnt.style.color = liked ? "#EF4444" : "";
    } catch (_) {}
  };
  if (authed()) isLiked(p.id, uid()).then((l) => { liked = l; likeBtn.replaceChild(likeIc(), likeBtn.firstChild); likeBtn.classList.toggle("liked", l); likeCnt.style.color = l ? "#EF4444" : ""; });
  const cmtCnt = h("span", { class: "tl-actcount" }, String(p.commentCount ?? 0));
  const shareText = async () => {
    const text = `${p.authorName}: ${p.content || ""}`;
    try { if (navigator.share) await navigator.share({ text, url: "https://gigbridges.com" }); else { await navigator.clipboard.writeText(text + " — gigbridges.com"); toast("Panoya kopyalandı"); } } catch (_) {}
  };
  return h("div", { class: "tl-card" },
    h("div", { class: "tl-accent", style: { background: tc.c } }),
    h("div", { class: "tl-inner" },
      h("div", { class: "tl-phead" },
        gradAv(p.authorName, 40),
        h("div", { class: "grow" },
          h("div", { class: "tl-author" }, p.authorName || "Kullanıcı"),
          h("div", { class: "tl-time" }, [p.authorCity, fmtDate(p.createdAt)].filter(Boolean).join(" · "))),
        h("span", { class: "tl-typebadge", style: { color: tc.c, borderColor: tc.c + "55", background: tc.c + "22" } }, icon(tc.ic, { size: 10, color: tc.c }), tc.l)),
      h("p", { class: "tl-content" }, p.content || ""),
      p.rating ? h("div", { class: "tl-rating" }, ...[1, 2, 3, 4, 5].map((i) => icon(i <= p.rating ? "star" : "star-outline", { size: 13, color: "#F59E0B" }))) : null,
      (p.event || p.venue) ? h("div", { class: "tl-tags" },
        p.event ? h("span", { class: "tl-tag" }, icon("musical-notes-outline", { size: 11, color: "var(--primary)" }), h("span", {}, p.event)) : null,
        p.venue ? h("span", { class: "tl-tag", style: p.venueId ? { cursor: "pointer" } : null, onclick: p.venueId ? () => go("#/mekan/" + p.venueId) : null }, icon("location-outline", { size: 11, color: "var(--primary)" }), h("span", {}, p.venue)) : null) : null,
      h("div", { class: "tl-actions" },
        likeBtn,
        h("button", { class: "tl-act", onclick: () => commentsModal(p, cmtCnt) }, icon("chatbubble-outline", { size: 17, color: "var(--text-secondary)" }), cmtCnt),
        h("button", { class: "tl-act", onclick: shareText }, icon("share-outline", { size: 17, color: "var(--text-secondary)" }), h("span", { class: "tl-actcount" }, "Paylaş")))));
}

// Yorumlar modalı — canlı liste + yorum yaz
function commentsModal(p, cntEl) {
  let unsub = null;
  const listBox = h("div", { class: "tl-cmtlist" }, h("div", { class: "loading" }, spinner()));
  const input = h("input", { class: "tl-cmtinput", placeholder: "Yorum yaz...", maxlength: 300, onkeydown: (e) => { if (e.key === "Enter") send(); } });
  const send = async () => {
    if (loginGate("Yorum yazmak")) return;
    const t = input.value.trim(); if (!t) return;
    input.value = "";
    try { await addComment(p.id, uid(), myName(), t); cntEl.textContent = String(Number(cntEl.textContent || 0) + 1); } catch (_) { toast("Gönderilemedi", "err"); input.value = t; }
  };
  const m = modal({
    title: "Yorumlar",
    body: h("div", {}, listBox,
      h("div", { class: "tl-cmtrow" }, gradAv(myName(), 32), input,
        h("button", { class: "tl-cmtsend", onclick: send }, icon("arrow-forward", { size: 18, color: "#fff" })))),
    actions: [],
    onClose: () => { if (unsub) unsub(); },
  });
  unsub = listenComments(p.id, (list) => {
    clear(listBox);
    if (!list.length) { listBox.append(h("div", { class: "tl-nocmt" }, "Henüz yorum yok. İlk yorumu sen yaz!")); return; }
    list.forEach((c) => listBox.append(h("div", { class: "tl-cmt" },
      gradAv(c.authorName, 32),
      h("div", { class: "tl-cmtbody" },
        h("div", { class: "tl-cmttop" }, h("span", { class: "tl-cmtauthor" }, c.authorName || "Kullanıcı"), h("span", { class: "tl-cmttime" }, fmtDate(c.createdAt))),
        h("div", { class: "tl-cmttext" }, c.text || "")))));
    listBox.scrollTop = listBox.scrollHeight;
  });
  return m;
}

// Yeni Gönderi — katıldığın etkinliği seç + 500 karakter
function postModal() {
  let selected = null, eventsLoaded = false, myEvents = [], listOpen = false;
  const ta = h("textarea", { class: "rv-input", rows: 5, maxlength: 500, placeholder: "Katıldığın etkinlik hakkında yorumun..." });
  const counter = h("div", { class: "tl-charcount" }, "0/500");
  ta.addEventListener("input", () => { counter.textContent = ta.value.length + "/500"; });
  const selTx = h("span", { class: "tl-evseltxt ph" }, "Katıldığın etkinliği seç");
  const chev = icon("chevron-down", { size: 16, color: "var(--text-muted)" });
  const evList = h("div", { class: "tl-evlist", style: { display: "none" } });
  const selBtn = h("button", { class: "tl-evsel", onclick: async () => {
    listOpen = !listOpen; evList.style.display = listOpen ? "" : "none"; chev.setAttribute("name", listOpen ? "chevron-up" : "chevron-down");
    if (!eventsLoaded) {
      eventsLoaded = true;
      try { myEvents = await attendedEvents(uid()); } catch (_) { myEvents = []; }
      clear(evList);
      if (!myEvents.length) { evList.append(h("div", { class: "tl-evempty" }, "Katıldığınız etkinlik bulunamadı. Bir etkinliğe katıldığınızda burada görünür.")); return; }
      myEvents.forEach((ev) => evList.append(h("button", { class: "tl-evitem", onclick: () => {
        selected = ev; selTx.textContent = ev.title || "Etkinlik"; selTx.classList.remove("ph");
        listOpen = false; evList.style.display = "none"; chev.setAttribute("name", "chevron-down");
        [...evList.children].forEach((x) => x.classList.toggle("on", x._ev === ev));
      }, _ev: ev },
        icon("radio-button-off", { size: 15, color: "var(--primary)" }),
        h("div", { class: "grow" }, h("div", { class: "tl-evtitle" }, ev.title || "Etkinlik"), h("div", { class: "tl-evvenue" }, ev.venueName || "")))));
    }
  } }, icon("musical-notes-outline", { size: 16, color: "var(--primary)" }), selTx, chev);
  evList.prepend();
  modal({
    title: "Yeni Gönderi",
    body: h("div", {},
      h("div", { class: "tl-modalauthor" }, gradAv(myName(), 36), h("span", {}, myName())),
      selBtn, evList, ta, counter),
    actions: [
      { label: "İptal", variant: "ghost", onClick: () => {} },
      { label: "Paylaş", keepOpen: true, onClick: async (close) => {
        const t = ta.value.trim(); if (!t) { toast("Bir şeyler yaz", "err"); return; }
        try {
          await createPost(uid(), myName(), session.profile?.city, t, selected
            ? { type: "review", event: selected.title || null, venue: selected.venueName || null, venueId: selected.venueId || null }
            : {});
          toast("Paylaşıldı"); close();
        } catch (_) { toast("Gönderilemedi", "err"); }
      } }],
  });
}

// ── Harita (Leaflet) ──
let _leaflet = null;
function loadLeaflet() {
  if (_leaflet) return _leaflet;
  _leaflet = new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = h("link", { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" });
    document.head.append(css);
    const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve(window.L); s.onerror = reject; document.head.append(s);
  });
  return _leaflet;
}
// ══════════ HARİTA — app MapScreen (canlı/yaklaşan + alt etkinlik kartı) ══════════
async function renderHarita(root) {
  clear(root);
  const wrap = h("div", { class: "mp-wrap" });
  const mapEl = h("div", { class: "mp-map" });
  wrap.append(mapEl);
  root.append(wrap);
  try {
    const [L, events] = await Promise.all([loadLeaflet(), discoverEvents()]);
    const withLoc = events.filter((e) => e.location?.lat != null && e.location?.lng != null);
    const noLoc = events.length - withLoc.length;
    const center = withLoc[0] ? [withLoc[0].location.lat, withLoc[0].location.lng] : [39.0, 35.0];
    const map = L.map(mapEl, { zoomControl: false }).setView(center, withLoc.length ? 11 : 6);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);

    // Üst başlık kartı (başlık + sayı + açıklama)
    wrap.append(h("div", { class: "mp-head" },
      h("div", { class: "grow" },
        h("div", { class: "mp-title" }, "Yakınındaki Etkinlikler"),
        h("div", { class: "mp-count" }, withLoc.length + " etkinlik"),
        h("div", { class: "mp-legend" },
          h("span", { class: "mp-dot", style: { background: "#10B981" } }), h("span", {}, "Şu an çalıyor"),
          h("span", { class: "mp-dot", style: { background: "#4F46E5", marginLeft: "10px" } }), h("span", {}, "Yaklaşan")))));
    if (noLoc > 0) {
      const noBanner = h("div", { class: "mp-nobanner" },
        icon("information-circle-outline", { size: 16, color: "var(--amber)" }),
        h("span", {}, `${noLoc} etkinlik haritada gösterilemiyor — mekanları henüz konum eklememiş.`),
        h("button", { class: "mp-nobanner-close", "aria-label": "Kapat", onclick: () => noBanner.remove() },
          icon("close", { size: 14, color: "var(--amber)" })));
      wrap.append(noBanner);
    }

    // Alt etkinlik kartı (marker'a tıklayınca)
    const cardBox = h("div", { class: "mp-card", style: { display: "none" } });
    wrap.append(cardBox);
    const showCard = (e) => {
      const g = evGenre(e);
      clear(cardBox);
      cardBox.append(
        h("div", { class: "mp-card-top" },
          g ? h("span", { class: "mp-genre" }, g) : h("span", {}),
          h("button", { class: "mp-close", onclick: () => { cardBox.style.display = "none"; } }, icon("close", { size: 14, color: "var(--text-muted)" }))),
        h("div", { class: "mp-card-body" },
          h("div", { class: "grow" },
            h("div", { class: "mp-card-title" }, e.title || "Etkinlik"),
            h("div", { class: "mp-card-meta" }, icon("business-outline", { size: 13, color: "var(--text-secondary)" }), " " + (e.venueName || "Mekan")),
            h("div", { class: "mp-card-meta" }, icon("calendar-outline", { size: 13, color: "var(--text-secondary)" }), " " + eventWhen(e))),
          h("div", { class: "mp-card-right" },
            h("div", { class: "mp-time" }, e.ticketPrice ? fmtTL(e.ticketPrice) : "Ücretsiz"),
            h("button", { class: "mp-detay", onclick: () => go("#/etkinlik/" + e.id) }, "Detay"))));
      cardBox.style.display = "";
    };
    // Boş yere tıklayınca kartı kapat + önceki (uzaktan) görünüme geri dön
    let prevView = null;
    map.on("click", () => {
      cardBox.style.display = "none";
      if (prevView) { map.setView(prevView.center, prevView.zoom, { animate: true }); prevView = null; }
    });

    withLoc.forEach((e) => {
      const live = isLive(e); const color = live ? "#10B981" : "#4F46E5";
      const m = L.marker([e.location.lat, e.location.lng], {
        icon: L.divIcon({ className: "", html: `<div class="mp-pin${live ? " live" : ""}" style="--pin:${color}"></div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).addTo(map);
      m.on("click", () => {
        // Etkinliğin TAM konumuna zoom (müşteri yeri net görsün); ilk zoom öncesi
        // bakılan görünümü sakla → boşluğa tıklayınca oraya geri dönülür.
        if (!prevView) prevView = { center: map.getCenter(), zoom: map.getZoom() };
        map.setView([e.location.lat, e.location.lng], Math.max(map.getZoom(), 16), { animate: true });
        showCard(e);
      });
    });
    if (!withLoc.length) wrap.append(h("div", { class: "mp-empty" }, empty("location-outline", "Konumlu etkinlik yok", "Mekanlar konum ekledikçe burada görünür.")));
    setTimeout(() => map.invalidateSize(), 200);
  } catch (e) { clear(root); root.append(errBox("Harita yüklenemedi.")); }
}

// ── Alt sayfalar ──
// Tür-gradyan avatar (app Following/Favorites kartları)
function gAv(name, genre, size) { const [a, b] = genreGrad(genre); return h("div", { class: "sl-av", style: { width: size + "px", height: size + "px", borderRadius: (size / 2) + "px", background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: Math.round(size * 0.4) + "px" } }, (name || "?").charAt(0).toLocaleUpperCase("tr-TR")); }

async function followingView(_id, root, subEl) {
  clear(root);
  let list = [];
  try { list = await followingList(uid()); } catch (_) { root.append(errBox()); return; }
  if (subEl) subEl.textContent = list.length + " kullanıcı takip ediyorsunuz";
  let term = "";
  const box = h("div", { class: "sl-list" });
  const draw = () => {
    clear(box);
    const f = list.filter((x) => !term || fold(x.artistName).includes(fold(term)));
    if (!f.length) { box.append(empty(term ? "search-outline" : "musical-notes-outline", term ? "Kullanıcı bulunamadı." : "Henüz kimseyi takip etmiyorsunuz.", term ? "İsmin baş harflerini kontrol edip tekrar deneyin." : "Sanatçı profillerinden takip et.")); return; }
    f.forEach((x) => {
      const aid = x.artistId || x.id;
      const heart = h("button", { class: "sl-heart", onclick: async (e) => { e.stopPropagation(); try { await unfollowArtist(uid(), aid); list = list.filter((y) => (y.artistId || y.id) !== aid); draw(); toast("Takipten çıkıldı"); } catch (_) { toast("İşlem başarısız", "err"); } } }, icon("heart", { size: 20, color: "#EF4444" }));
      box.append(h("div", { class: "sl-card", onclick: () => go("#/sanatci/" + aid) },
        gAv(x.artistName, x.genre, 56),
        h("div", { class: "grow" }, h("div", { class: "sl-name" }, x.artistName || "Sanatçı"),
          x.genre ? h("span", { class: "sl-genre" }, x.genre) : null),
        h("div", { class: "sl-right" }, heart, icon("chevron-forward", { size: 14, color: "var(--border)" }))));
    });
  };
  const search = h("div", { class: "hs-search" }, icon("search-outline", { size: 16, color: "var(--text-muted)" }),
    h("input", { placeholder: "Kullanıcı ara (sanatçı, mekan...)", oninput: (e) => { term = e.target.value; draw(); } }));
  root.append(search, box);
  draw();
}

async function favoritesView(_id, root, subEl) {
  clear(root);
  let arts = [], venues = [], events = [];
  try { [arts, venues, events] = await Promise.all([followingList(uid()), favVenues(uid()), favEvents(uid())]); } catch (_) { root.append(errBox()); return; }
  let tab = "sanatci";
  const tabsRow = h("div", { class: "fav-tabs" });
  const box = h("div", { class: "sl-list" });
  const favEmpty = (ic, t) => h("div", { class: "hs-empty" }, icon(ic, { size: 48, color: "var(--text-muted)" }),
    h("div", { class: "hs-empty-title" }, t),
    h("div", { class: "hs-empty-sub" }, "Sanatçı, mekan veya etkinlik sayfalarında kalp simgesine basarak ekleyebilirsiniz."));
  const drawTabs = () => {
    if (subEl) { clear(subEl); subEl.append(h("span", { class: "fav-total" }, icon("heart", { size: 12, color: "#EF4444" }), String(arts.length + venues.length + events.length))); }
    clear(tabsRow);
    [["sanatci", "Sanatçılar", arts.length], ["mekan", "Mekanlar", venues.length], ["etkinlik", "Etkinlikler", events.length]].forEach(([k, l, n]) =>
      tabsRow.append(h("button", { class: "fav-tab" + (k === tab ? " on" : ""), onclick: () => { tab = k; drawTabs(); draw(); } }, h("span", {}, l), h("span", { class: "fav-count" }, String(n)))));
  };
  const draw = () => {
    clear(box);
    if (tab === "sanatci") {
      if (!arts.length) { box.append(favEmpty("mic-outline", "Favori sanatçı yok.")); return; }
      arts.forEach((x) => { const aid = x.artistId || x.id;
        box.append(h("div", { class: "sl-card", onclick: () => go("#/sanatci/" + aid) }, gAv(x.artistName, x.genre, 52),
          h("div", { class: "grow" }, h("div", { class: "sl-name" }, x.artistName || "Sanatçı"), x.genre ? h("div", { class: "sl-sub" }, x.genre) : null),
          h("button", { class: "sl-heart", onclick: async (e) => { e.stopPropagation(); try { await unfollowArtist(uid(), aid); arts = arts.filter((y) => (y.artistId || y.id) !== aid); drawTabs(); draw(); } catch (_) {} } }, icon("heart", { size: 22, color: "#EF4444" })))); });
    } else if (tab === "mekan") {
      if (!venues.length) { box.append(favEmpty("business-outline", "Favori mekan yok.")); return; }
      venues.forEach((v) => { const vid = v.venueId || v.id;
        const sq = gAv(v.venueName, null, 52); sq.style.borderRadius = "14px";
        box.append(h("div", { class: "sl-card", onclick: () => go("#/mekan/" + vid) }, sq,
          h("div", { class: "grow", style: { minWidth: 0 } },
            h("div", { class: "sl-name" }, v.venueName || "Mekan"),
            v.city ? h("div", { class: "sl-meta" }, icon("location-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, v.city)) : null),
          h("button", { class: "sl-heart", onclick: async (e) => { e.stopPropagation(); try { await unfavVenue(uid(), vid); venues = venues.filter((y) => (y.venueId || y.id) !== vid); drawTabs(); draw(); } catch (_) {} } }, icon("heart", { size: 22, color: "#EF4444" })))); });
    } else {
      if (!events.length) { box.append(favEmpty("ticket-outline", "Favori etkinlik yok.")); return; }
      events.forEach((e) => {
        const g = Array.isArray(e.genre) ? e.genre[0] : e.genre;
        const [g1, g2] = genreGrad(g);
        box.append(h("div", { class: "fv-ecard", onclick: () => go("#/etkinlik/" + e.id) },
          h("div", { class: "fv-banner", style: { background: `linear-gradient(135deg, ${g1}, ${g2})` } }, (e.title || "E").charAt(0).toLocaleUpperCase("tr-TR")),
          h("div", { class: "fv-info" },
            h("div", { class: "sl-name" }, e.title || "Etkinlik"),
            e.artist ? h("div", { class: "sl-meta" }, icon("mic-outline", { size: 11, color: "var(--text-secondary)" }), h("span", {}, e.artist)) : null,
            e.venue ? h("div", { class: "sl-meta" }, icon("location-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, e.venue)) : null,
            e.date ? h("div", { class: "sl-meta" }, icon("time-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, e.date)) : null),
          h("div", { class: "fv-right" },
            g ? h("span", { class: "fv-genre", style: { color: g1, borderColor: g1 + "55", background: g1 + "18" } }, String(g).toLocaleUpperCase("tr-TR")) : h("span", {}),
            h("span", { class: "fv-price" + (e.price ? "" : " free") }, e.price ? fmtTL(e.price) : "Ücretsiz"),
            h("button", { class: "sl-heart", onclick: async (ev) => { ev.stopPropagation(); try { await unfavEvent(uid(), e.id); events = events.filter((y) => y.id !== e.id); drawTabs(); draw(); } catch (_) {} } }, icon("heart", { size: 20, color: "#EF4444" })))));
      });
    }
  };
  root.append(tabsRow, box); drawTabs(); draw();
}
// Katıldıklarım — app AttendedEvents birebir
async function attendedView(_id, root, subEl) {
  clear(root);
  let list = [];
  try { list = await attendedEvents(uid()); } catch (e) { root.append(errBox()); return; }
  if (subEl) subEl.textContent = list.length + " etkinliğe katıldınız";
  if (!list.length) {
    root.append(h("div", { class: "hs-empty" }, icon("ticket-outline", { size: 48, color: "var(--text-muted)" }),
      h("div", { class: "hs-empty-title" }, "Henüz bir etkinliğe katılmadınız."),
      h("div", { class: "hs-empty-sub" }, "Keşfet sekmesinden etkinlik bulup \"Katıl\" diyebilirsiniz.")));
    return;
  }
  const box = h("div", { class: "sl-list" });
  list.forEach((e) => {
    const [g1, g2] = genreGrad(evGenre(e));
    box.append(h("div", { class: "sl-card", onclick: () => go("#/etkinlik/" + e.id) },
      h("div", { class: "at-evav", style: { background: `linear-gradient(135deg, ${g1}, ${g2})` } }, icon("musical-notes", { size: 22, color: "#fff" })),
      h("div", { class: "grow", style: { minWidth: 0 } },
        h("div", { class: "sl-name" }, e.title || "Etkinlik"),
        h("div", { class: "sl-meta" }, icon("location-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, e.venueName || "—")),
        h("div", { class: "sl-meta" }, icon("time-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, eventWhen(e)))),
      icon("chevron-forward", { size: 16, color: "var(--border)" })));
  });
  root.append(box);
}

// ── Biletlerim — katıldığın, henüz BİTMEMİŞ etkinlikler; "Bileti Gör" → holografik kart ──
function ticketEventMs(e) {
  const v = e.eventAt;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (e.dateKey) { const t = new Date(e.dateKey).getTime(); if (!isNaN(t)) return t; }
  if (typeof v === "string") { const t = new Date(v).getTime(); if (!isNaN(t)) return t; }
  return 0;
}
async function ticketsView(_id, root, subEl) {
  clear(root);
  let list = [];
  try { list = await attendedEvents(uid()); } catch (e) { root.append(errBox()); return; }
  const now = Date.now();
  // Bilet, etkinlik başlangıcından ~6 saat sonrasına kadar geçerli (etkinlik bitene kadar durur)
  const tickets = list.filter((e) => { const ms = ticketEventMs(e); return ms === 0 || ms + 6 * 3600 * 1000 > now; });
  if (subEl) subEl.textContent = tickets.length + " aktif bilet";

  // Mesafe için konum yoksa bir kez dene (izin verilirse yeniden çizilir)
  if (!userCoords && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (location.hash === "#/biletlerim") go("#/biletlerim");
    }, () => {}, { timeout: 8000 });
  }

  if (!tickets.length) {
    root.append(h("div", { class: "hs-empty" }, icon("ticket-outline", { size: 48, color: "var(--text-muted)" }),
      h("div", { class: "hs-empty-title" }, "Aktif biletin yok."),
      h("div", { class: "hs-empty-sub" }, "Keşfet'ten bir etkinliğe \"Katıl\" dediğinde bileti burada görünür.")));
    return;
  }
  const boxEl = h("div", { class: "sl-list" });
  tickets.forEach((e) => {
    const [g1, g2] = genreGrad(evGenre(e));
    boxEl.append(h("div", { class: "tk-row" },
      h("div", { class: "at-evav", style: { background: `linear-gradient(135deg, ${g1}, ${g2})` } }, icon("ticket", { size: 20, color: "#fff" })),
      h("div", { class: "grow", style: { minWidth: 0 } },
        h("div", { class: "sl-name" }, e.title || "Etkinlik"),
        h("div", { class: "sl-meta" }, icon("mic-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, e.artistName || "Sanatçı")),
        h("div", { class: "sl-meta" }, icon("business-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, e.venueName || "—")),
        h("div", { class: "tk-rowbot" },
          h("span", { class: "sl-meta" }, icon("time-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, eventWhen(e))),
          distPill(e) || null)),
      h("button", { class: "tk-see", onclick: () => showTicketCard(e) }, icon("qr-code-outline", { size: 14 }), h("span", {}, "Bileti Gör"))));
  });
  root.append(boxEl);
}
function showTicketCard(e) {
  let distTxt = "—";
  if (userCoords && e.location?.lat != null) {
    const km = haversineKm(userCoords, { lat: e.location.lat, lng: e.location.lng });
    distTxt = km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
  }
  const num = String(e.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase().padStart(8, "0");
  const overlay = h("div", { class: "tk-overlay", onclick: (ev) => { if (ev.target === overlay) overlay.remove(); } });
  // Kağıt doku bump'ı için gizli inline SVG filtresi (yoksa filter no-op olur, sorun değil)
  const svgFilter = h("div", { html: '<svg width="0" height="0" style="position:absolute"><filter id="bump"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.15" numOctaves="2" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter></svg>' });
  const card = h("div", { class: "card" },
    h("div", { class: "bg holographic" }),
    h("div", { class: "notes" }, "♪"),
    h("div", { class: "notes" }, "♪"),
    h("div", { class: "notes" }, "♪"),
    h("div", { class: "symbol" }, "♪"),
    h("div", { class: "header" }, (e.title || "BİLET").toLocaleUpperCase("tr-TR")),
    h("div", { class: "body" },
      h("div", { class: "tk-line" }, icon("mic", { size: 13 }), h("span", {}, e.artistName || "Sanatçı")),
      h("div", { class: "tk-line" }, icon("business", { size: 13 }), h("span", {}, e.venueName || "Mekan")),
      h("div", { class: "tk-line" }, icon("calendar", { size: 13 }), h("span", {}, eventWhen(e))),
      h("div", { class: "tk-line" }, icon("navigate", { size: 13 }), h("span", {}, distTxt))),
    h("div", { class: "footer" },
      h("div", { class: "number" }, "BİLET ", h("span", { class: "bold" }, num)),
      h("div", { class: "barcode" })));
  const wrap = h("div", { class: "tkx" }, svgFilter, card);
  overlay.append(wrap, h("button", { class: "tk-close", onclick: () => overlay.remove() }, icon("close", { size: 18 }), h("span", {}, "Kapat")));
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
}

// Yorumlarım — app MyReviews birebir (düzenle/sil + ortalama)
async function myReviewsView(_id, root, subEl) {
  clear(root);
  let list = [];
  try { list = await myReviews(uid()); } catch (e) { root.append(errBox()); return; }
  const draw = () => {
    clear(root);
    const rr = list.map((r) => Number(r.overallRating ?? r.rating)).filter((x) => x > 0);
    const avg = rr.length ? (rr.reduce((a, b) => a + b, 0) / rr.length).toFixed(1) : "—";
    if (subEl) { clear(subEl); subEl.append(`${list.length} yorum • Ortalama `, icon("star", { size: 12, color: "#F59E0B" }), " " + avg); }
    if (!list.length) {
      root.append(h("div", { class: "hs-empty" }, icon("star-outline", { size: 48, color: "var(--text-muted)" }),
        h("div", { class: "hs-empty-title" }, "Henüz yorum yazmadınız."),
        h("div", { class: "hs-empty-sub" }, "Etkinliklere katıldıktan sonra sanatçı ve mekan yorumu yazabilirsiniz.")));
      return;
    }
    list.forEach((r) => {
      const isArtist = r._col === "reviews";
      const name = r.targetName || r.venueName || "—";
      const rating = r.overallRating ?? r.rating ?? 0;
      const [a1, a2] = avGrad(name);
      root.append(h("div", { class: "rv-card" },
        h("div", { class: "mr-top" },
          h("div", { class: "mr-av", style: { background: `linear-gradient(135deg, ${a1}, ${a2})`, borderRadius: isArtist ? "22px" : "12px" } }, name.charAt(0).toLocaleUpperCase("tr-TR")),
          h("div", { class: "grow", style: { minWidth: 0 } },
            h("div", { class: "mr-name" }, name),
            r.event ? h("div", { class: "mr-event" }, icon("musical-notes-outline", { size: 11, color: "var(--primary)" }), h("span", {}, r.event)) : null,
            h("div", { class: "mr-date" }, fmtDate(r.createdAt))),
          h("div", { class: "mr-acts" },
            h("button", { class: "mr-act", onclick: () => editReview(r) }, icon("create-outline", { size: 18, color: "var(--text-secondary)" })),
            h("button", { class: "mr-act", onclick: () => delReview(r) }, icon("trash-outline", { size: 18, color: "#EF4444" })))),
        h("div", { class: "mr-stars" },
          ...[1, 2, 3, 4, 5].map((i) => icon(i <= rating ? "star" : "star-outline", { size: 14, color: i <= rating ? "#F59E0B" : "var(--text-muted)" })),
          isArtist
            ? h("span", { class: "mr-type art" }, icon("mic-outline", { size: 10, color: "var(--primary)" }), "Sanatçı")
            : h("span", { class: "mr-type ven" }, icon("business-outline", { size: 10, color: "#F59E0B" }), "Mekan")),
        r.comment ? h("p", { class: "rv-comment" }, r.comment) : null));
    });
  };
  const editReview = (r) => {
    let rating = r.overallRating ?? r.rating ?? 0;
    const starRow = h("div", { class: "mr-editstars" });
    const paint = () => { clear(starRow); [1, 2, 3, 4, 5].forEach((i) => starRow.append(h("button", { class: "star-btn", onclick: () => { rating = i; paint(); } }, icon(i <= rating ? "star" : "star-outline", { size: 28, color: i <= rating ? "#F59E0B" : "var(--text-muted)" })))); };
    paint();
    const ta = h("textarea", { class: "rv-input", rows: 4, maxlength: 500, placeholder: "Yorumunuzu yazın..." }, r.comment || "");
    modal({
      title: "Yorumu Düzenle",
      body: h("div", {}, h("p", { class: "rv-modalsub" }, r.targetName || r.venueName || ""),
        h("div", { class: "mr-editlbl" }, "Puanınız"), starRow, ta),
      actions: [
        { label: "İptal", variant: "ghost", onClick: () => {} },
        { label: "Kaydet", keepOpen: true, onClick: async (close) => {
          const t = ta.value.trim();
          if (!t) { toast("Yorum boş olamaz", "err"); return; }
          try {
            const patch = r._col === "venueReviews" ? { comment: t, rating, overallRating: rating } : { comment: t, rating };
            await updateMyReview(r._col, r.id, patch);
            Object.assign(r, patch); toast("Yorum güncellendi"); close(); draw();
          } catch (_) { toast("Güncellenemedi", "err"); }
        } }],
    });
  };
  const delReview = (r) => {
    modal({ title: "Yorumu Sil", body: h("p", { class: "muted" }, "Bu yorum kalıcı olarak silinecek. Emin misiniz?"),
      actions: [
        { label: "Vazgeç", variant: "ghost", onClick: () => {} },
        { label: "Sil", variant: "danger", keepOpen: true, onClick: async (close) => {
          try { await deleteMyReview(r._col, r.id); list = list.filter((x) => x !== r); toast("Yorum silindi"); close(); draw(); }
          catch (_) { toast("Silinemedi", "err"); }
        } }] });
  };
  draw();
}
// Bildirimler — app NotificationsFeedScreen birebir
function timeAgo(v) {
  try {
    const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    if (isNaN(d)) return "";
    const m = Math.floor((Date.now() - d.getTime()) / 60000);
    if (m < 1) return "şimdi";
    if (m < 60) return m + " dk önce";
    if (m < 1440) return Math.floor(m / 60) + " sa önce";
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  } catch { return ""; }
}
function notificationsView(_id, root) {
  clear(root);
  const wrap = h("div", { class: "nf-list" }, h("div", { class: "loading" }, spinner()));
  root.append(wrap);
  listenNotifications(uid(), (list) => {
    clear(wrap);
    if (!list.length) { wrap.append(h("div", { class: "nf-empty" }, icon("notifications-off-outline", { size: 52, color: "var(--text-muted)" }), h("div", { class: "nf-empty-title" }, "Henüz bildiriminiz yok"), h("div", { class: "nf-empty-sub" }, "Yeni teklif, davet ve güncellemeler burada görünecek."))); return; }
    list.forEach((n) => { if (n.read === false) markNotifRead(n.id); });
    list.forEach((n) => {
      const canGo = n.type === "review_prompt" && n.eventId;
      const card = h("div", { class: "nf-card" + (n.read === false ? " unread" : "") + (canGo ? " clickable" : ""), onclick: canGo ? () => go("#/etkinlik/" + n.eventId) : null },
        h("span", { class: "nf-ic" }, icon(notifIcon(n.type), { size: 20, color: "var(--primary)" })),
        h("div", { class: "grow" },
          h("div", { class: "nf-title" }, n.read === false ? h("span", { class: "nf-dot" }) : null, n.title || "Bildirim"),
          h("div", { class: "nf-body" }, n.body || ""),
          h("div", { class: "nf-time" }, timeAgo(n.createdAt))),
        h("button", { class: "nf-x", title: "Bildirimi sil", onclick: (e) => { e.stopPropagation(); deleteNotif(n.id); card.remove(); } }, icon("close", { size: 15, color: "var(--text-muted)" })));
      wrap.append(card);
    });
  });
}
function notifIcon(t) {
  return ({
    event_deleted: "trash-outline", venue_request: "business-outline", venue_request_update: "checkmark-done-outline",
    invitation: "mail-outline", invitation_update: "checkmark-done-outline", event_invite: "mic-outline",
    group_invite: "people-outline", residency_offer: "repeat-outline", residency_update: "repeat-outline",
    edit_request: "key-outline", edit_approved: "checkmark-circle-outline",
    review_prompt: "star-outline",
  })[t] || "notifications-outline";
}

// Detay ekran sarmalayıcı — app alt ekran başlığı (gradyan zemin + geri + 28px başlık + alt yazı)
function detailShell(title, loader, id) {
  const subEl = h("div", { class: "dsh-sub" });
  const content = h("div", { class: "content detail dsh-content" }, h("div", { class: "loading" }, spinner()));
  const page = dtlWrap(
    h("div", { class: "dsh-wrap" },
      h("div", { class: "dsh-head" },
        h("button", { class: "ed-iconbtn dark", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22, color: "rgba(255,255,255,0.8)" })),
        h("h1", { class: "dsh-title" }, title),
        subEl),
      content));
  loader(id, content, subEl);
  return page;
}
