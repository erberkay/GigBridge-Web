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
} from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, card, badge, modal, fmtDate, fmtTL, ROLE } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";

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
      { label: "Giriş Yap", ic: "log-in-outline", onClick: () => go("#/login") },
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
    ? h("button", { class: "icon-btn login-chip", onclick: () => go("#/login"), title: "Giriş Yap" }, icon("log-in-outline", { size: 18 }), h("span", {}, "Giriş"))
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
// ══════════ KEŞFET — app HomeScreen ile birebir ══════════
function kesfetPage() {
  const guest = !authed();
  const cityLabel = h("span", { class: "hs-city-label" }, activeCity);
  const chev = icon("chevron-down", { size: 11, color: "#9090B0" });
  const cityDrop = h("div", { class: "hs-citydrop", style: { display: "none" } });
  let dropOpen = false;
  const setDrop = (v) => { dropOpen = v; cityDrop.style.display = v ? "" : "none"; chev.setAttribute("name", v ? "chevron-up" : "chevron-down"); chev.style.color = v ? "#A855F7" : "#9090B0"; };
  const cityChip = h("button", { class: "hs-citychip", onclick: () => setDrop(!dropOpen) },
    icon("location-sharp", { size: 11, color: "var(--primary)" }), cityLabel, chev);
  const bell = guest
    ? h("button", { class: "icon-btn login-chip", onclick: () => go("#/login") }, icon("log-in-outline", { size: 18 }), h("span", {}, "Giriş"))
    : h("button", { class: "hs-bell", onclick: () => go("#/bildirimler"), title: "Bildirimler" }, icon("notifications-outline", { size: 20 }));
  const header = h("header", { class: "topbar hs-topbar", style: { "--role": C } },
    h("div", { class: "hs-logo" }, "GigBridge"), cityChip, bell);
  const content = h("div", { class: "content hs-content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": C } }, header, content, bottomnav(NAV, "kesfet", C));
  renderKesfet(content, { cityDrop, cityLabel, closeDrop: () => setDrop(false) });
  return page;
}

async function renderKesfet(root, hdr) {
  let events = [], artists = [], venues = [], followSet = new Set();
  try {
    [events, artists, venues] = await Promise.all([discoverEvents(), listRealArtists(), listVenues()]);
    if (authed()) { try { followSet = new Set((await followingList(uid())).map((f) => f.artistId || f.id)); } catch (_) {} }
  } catch (e) { clear(root); root.append(errBox("Keşfet yüklenemedi.")); return; }
  clear(root);

  // ── Şehir açılır listesi (Konumumu Kullan + arama + 81 il) ──
  const cityNames = ["TÜMÜ", ...[...new Set([...events.map((e) => (e.city || e.location?.city || "").trim()).filter(Boolean), ...PROVINCES])]];
  const listBox = h("div", { class: "hs-citylist" });
  const cSearch = h("input", { placeholder: "Şehir ara...", oninput: () => drawCities() });
  const setCity = (c) => { activeCity = c; try { localStorage.setItem("gb_city", c); } catch (_) {} hdr.cityLabel.textContent = c; hdr.closeDrop(); drawBody(); drawCities(); };
  const drawCities = () => {
    clear(listBox);
    const q = fold(cSearch.value.trim());
    const list = cityNames.filter((c) => !q || fold(c).includes(q));
    if (!list.length) { listBox.append(h("div", { class: "hs-city-empty" }, "Şehir bulunamadı")); return; }
    list.forEach((c) => listBox.append(h("button", { class: "hs-city-item" + (c === activeCity ? " on" : ""), onclick: () => setCity(c) }, c)));
  };
  const locBtn = h("button", { class: "hs-locate", onclick: () => {
    if (!navigator.geolocation) return toast("Tarayıcı konumu desteklemiyor", "err");
    locBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userCoords.lat}&lon=${userCoords.lng}&accept-language=tr`);
        const j = await r.json();
        const prov = j.address?.province || j.address?.state || j.address?.city || "";
        const match = PROVINCES.find((p) => fold(p) === fold(prov));
        if (match) { setCity(match); toast(match + " olarak ayarlandı"); } else toast("Şehir belirlenemedi", "err");
      } catch (_) { toast("Şehir belirlenemedi", "err"); }
      locBtn.disabled = false; drawBody();
    }, () => { toast("Konum alınamadı (izin?)", "err"); locBtn.disabled = false; });
  } }, icon("navigate", { size: 14, color: "var(--primary)" }), h("span", {}, "Konumumu Kullan"));
  hdr.cityDrop.append(locBtn,
    h("div", { class: "hs-citysearch" }, icon("search-outline", { size: 14, color: "var(--text-muted)" }), cSearch),
    listBox);
  drawCities();

  // ── Arama + kategori sekmeleri ──
  let term = "";
  const sInput = h("input", { placeholder: "Etkinlik, mekan veya sanatçı ara...", oninput: (e) => { term = e.target.value; drawBody(); } });
  const searchBar = h("div", { class: "hs-search" }, icon("search-outline", { size: 16, color: "var(--text-muted)" }), sInput);
  const CATS = [["TÜMÜ", "grid-outline"], ["ETKİNLİKLER", "ticket-outline"], ["MEKANLAR", "business-outline"], ["SANATÇILAR", "mic-outline"]];
  const tabsRow = h("div", { class: "hs-tabs" });
  const drawTabs = () => {
    clear(tabsRow);
    CATS.forEach(([k, ic]) => tabsRow.append(h("button", { class: "hs-tab" + (k === activeCategory ? " on" : ""), onclick: () => {
      if (k === "ETKİNLİKLER") return go("#/etkinlikler");
      activeCategory = k; drawTabs(); drawBody();
    } }, icon(ic, { size: 13 }), h("span", {}, k))));
  };
  drawTabs();

  const body = h("div", { class: "hs-body" });
  root.append(hdr.cityDrop, searchBar, tabsRow, body);

  const inCity = (ev) => activeCity === "TÜMÜ" || fold((ev.city || ev.location?.city || "").trim()) === fold(activeCity);

  function drawBody() {
    clear(body);
    const cityEvents = events.filter(inCity);
    const q = fold(term.trim());

    if (q) { // arama sonuçları
      const list = cityEvents.filter((e) => [e.title, e.venueName, e.artistName].some((x) => fold(x).includes(q)));
      if (!list.length) { body.append(h("div", { class: "hs-empty" }, icon("search-outline", { size: 32, color: "var(--text-muted)" }), h("div", { class: "hs-empty-sub" }, "Sonuç bulunamadı"))); return; }
      body.append(h("div", { class: "hs-vlist" }, ...list.map((e) => ecard2(e, true))));
      return;
    }

    if (activeCategory === "MEKANLAR") {
      if (!venues.length) { body.append(hsEmpty("business-outline", "Henüz mekan yok", "Mekanlar katıldıkça burada listelenecek.")); return; }
      body.append(h("div", { class: "hs-vlist" }, ...venues.map(venueCardBig)));
      return;
    }
    if (activeCategory === "SANATÇILAR") {
      if (!artists.length) { body.append(hsEmpty("mic-outline", "Henüz sanatçı yok", "Sanatçılar katıldıkça burada görünecek.")); return; }
      body.append(h("div", { class: "hs-alist" }, ...artists.map((a) => artistRowHome(a, followSet))));
      return;
    }

    // TÜMÜ
    if (!cityEvents.length) {
      body.append(hsEmpty("compass-outline", activeCity === "TÜMÜ" ? "Henüz etkinlik yok" : `${activeCity} için etkinlik yok`, "Yakında canlı müzik etkinlikleri burada görünecek."));
    } else {
      // Hero: VIP önce, sonra tarihe göre — ilk 5
      const hero = [...cityEvents].sort((a, b) => ((b.vipStatus === "approved") - (a.vipStatus === "approved")) || (msOf(a) ?? 0) - (msOf(b) ?? 0)).slice(0, 5);
      body.append(heroCarousel(hero));
      // Top 10 — katılımcı sayısına göre
      const top = [...cityEvents].sort((a, b) => (b.attendeeCount ?? 0) - (a.attendeeCount ?? 0)).slice(0, 10);
      body.append(hsSect("GigBridge Top 10", null, () => go("#/etkinlikler")),
        h("div", { class: "hs-hscroll" }, ...top.map((e, i) => top10Card(e, i + 1))));
    }
    // Sadece GigBridge'de — her zaman görünür
    const excl = cityEvents.filter((e) => e.vipStatus === "approved" || e.isExclusive);
    body.append(hsSect("Sadece GigBridge'de", "Özel etkinlikler, VIP deneyimler", () => go("#/etkinlikler")));
    if (excl.length) body.append(h("div", { class: "hs-hscroll" }, ...excl.map((e) => ecard2(e))));
    else body.append(h("div", { class: "hs-excl-empty" }, icon("sparkles-outline", { size: 18, color: "var(--text-muted)" }), h("span", {}, "Şu an özel etkinlik yok — VIP deneyimler yakında burada.")));
    // En Yeniler (yalnız varsa)
    const news = cityEvents.filter((e) => e.isNew === true);
    if (news.length) body.append(hsSect("GigBridge'de En Yeniler!", null, () => go("#/etkinlikler")),
      h("div", { class: "hs-hscroll" }, ...news.map((e) => ecard2(e))));
    // Bu Hafta
    const week = cityEvents.filter((e) => { const ms = msOf(e); return ms != null && ms <= Date.now() + 7 * 86400e3; });
    if (week.length) body.append(hsSect("Bu Hafta", activeCity !== "TÜMÜ" ? activeCity : null, () => go("#/etkinlikler")),
      h("div", { class: "hs-hscroll" }, ...week.map((e) => ecard2(e))));
    // Popüler Sanatçılar
    if (artists.length) body.append(hsSect("Popüler Sanatçılar", null, () => { activeCategory = "SANATÇILAR"; drawTabs(); drawBody(); }),
      h("div", { class: "hs-alist" }, ...artists.slice(0, 5).map((a) => artistRowHome(a, followSet))));
  }
  drawBody();
}

// Bölüm başlığı — mor vurgu çubuğu + başlık + TÜMÜ
function hsSect(title, sub, onSeeAll) {
  return h("div", { class: "hs-secthead" },
    h("div", { class: "hs-accent" }),
    h("div", { class: "grow" }, h("div", { class: "hs-secttitle" }, title), sub ? h("div", { class: "hs-sectsub" }, sub) : null),
    onSeeAll ? h("button", { class: "hs-seeall", onclick: onSeeAll }, h("span", {}, "TÜMÜ"), icon("chevron-forward", { size: 12, color: "var(--primary)" })) : null);
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
  if (att > 200) return h("span", { class: "sbadge sb-trend" }, icon("trending-up", { size: 9, color: "#A855F7" }), "ŞİMDİ POPÜLER");
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

// Hero carousel — 4sn otomatik + noktalar
function heroCarousel(list) {
  const slides = list.map((ev) => h("div", { class: "hero-slide", onclick: () => go("#/etkinlik/" + ev.id), style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
    h("div", { class: "hero-grad" }),
    h("div", { class: "hero-body" },
      statusBadge(ev),
      h("div", { class: "hero-title" }, ev.title || "Etkinlik"),
      h("div", { class: "hero-sub" }, ev.artistName ? [icon("mic", { size: 12, color: "rgba(255,255,255,0.85)" }), " " + ev.artistName + " · " + (ev.venueName || "")] : (ev.venueName || "")),
      h("div", { class: "hero-meta" },
        h("span", { class: "hero-pill" }, icon("calendar-outline", { size: 11, color: "#9090B0" }), eventWhen(ev)),
        distPill(ev)),
      genrePills(ev),
      h("div", { class: "hero-foot" }, h("span", { class: "hero-price" + (ev.ticketPrice ? "" : " free") }, priceTxt(ev))))));
  const slider = h("div", { class: "hero-slider" }, ...slides);
  const dots = h("div", { class: "hero-dots" }, ...list.map((_, i) => h("span", { class: "hdot" + (i === 0 ? " on" : "") })));
  const setDot = (i) => [...dots.children].forEach((d, j) => d.classList.toggle("on", j === i));
  let idx = 0;
  slider.addEventListener("scroll", () => { const i = Math.round(slider.scrollLeft / slider.clientWidth); if (i !== idx) { idx = i; setDot(i); } });
  if (list.length > 1) {
    const iv = setInterval(() => {
      if (!slider.isConnected) return clearInterval(iv);
      idx = (idx + 1) % list.length;
      slider.scrollTo({ left: idx * slider.clientWidth, behavior: "smooth" });
      setDot(idx);
    }, 4000);
  }
  return h("div", { class: "hero-wrap" }, slider, dots);
}

// Top 10 kartı — 270px, sıra rozeti
function top10Card(ev, rank) {
  return h("div", { class: "t10", onclick: () => go("#/etkinlik/" + ev.id), style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
    h("div", { class: "t10-grad" }),
    h("div", { class: "t10-rank" }, String(rank)),
    h("div", { class: "t10-body" },
      statusBadge(ev),
      h("div", { class: "t10-title" }, ev.title || "Etkinlik"),
      h("div", { class: "t10-sub" }, [ev.artistName, ev.venueName].filter(Boolean).join(" · ")),
      h("div", { class: "hero-meta" }, h("span", { class: "hero-pill" }, icon("calendar-outline", { size: 10, color: "var(--text-muted)" }), eventWhen(ev)), distPill(ev)),
      genrePills(ev),
      h("div", { class: "t10-foot" }, h("span", { class: "t10-price" + (ev.ticketPrice ? "" : " free") }, priceTxt(ev)))));
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

// Mekan kartı — 160px görsel zemin
function venueCardBig(v) {
  const gs = (Array.isArray(v.genres) ? v.genres : v.genre ? [v.genre] : []).filter(Boolean);
  return h("div", { class: "vcard", onclick: () => go("#/mekan/" + v.id), style: v.photoURL ? { backgroundImage: `url(${v.photoURL})` } : null },
    h("div", { class: "vcard-grad" }),
    h("div", { class: "vcard-body" },
      h("span", { class: "vcard-type" }, "MEKAN"),
      h("div", { class: "vcard-name" }, v.displayName || "Mekan"),
      h("div", { class: "vcard-meta" },
        icon("location-outline", { size: 11, color: "rgba(255,255,255,0.6)" }), h("span", {}, v.city || "—"),
        v.avgRating ? [h("span", { class: "vdot" }, "·"), icon("star", { size: 10, color: "#F59E0B" }), h("span", { class: "vrate" }, Number(v.avgRating).toFixed(1))] : null,
        v.capacity ? [h("span", { class: "vdot" }, "·"), h("span", { class: "vcap" }, v.capacity + " kişi")] : null),
      gs.length ? h("div", { class: "gpills" }, ...gs.slice(0, 2).map((g) => h("span", { class: "gpill gp-purple" }, String(g).toLocaleUpperCase("tr-TR")))) : null));
}

// Sanatçı satırı — 52px foto, takip butonu (app tasarımı)
function artistRowHome(a, followSet) {
  const name = a.displayName || "Sanatçı";
  let on = followSet.has(a.id);
  const fBtn = h("button", { class: "hs-follow" + (on ? " on" : ""), onclick: async (e) => {
    e.stopPropagation();
    if (loginGate("Takip etmek")) return;
    fBtn.disabled = true;
    try {
      if (on) { await unfollowArtist(uid(), a.id); followSet.delete(a.id); on = false; }
      else { await followArtist(uid(), a); followSet.add(a.id); on = true; }
      fBtn.classList.toggle("on", on); fBtn.textContent = on ? "TAKİP" : "TAKİP ET";
    } catch (_) { toast("İşlem başarısız", "err"); }
    fBtn.disabled = false;
  } }, on ? "TAKİP" : "TAKİP ET");
  return h("div", { class: "hs-artist", onclick: () => go("#/sanatci/" + a.id) },
    a.photoURL ? h("div", { class: "hs-aphoto", style: { backgroundImage: `url(${a.photoURL})` } }) : h("div", { class: "hs-aphoto ph" }, name.charAt(0).toLocaleUpperCase("tr-TR")),
    h("div", { class: "grow" },
      h("div", { class: "hs-aname" }, name),
      h("div", { class: "hs-agenre" }, (Array.isArray(a.genres) ? a.genres[0] : a.genre) || "Müzik"),
      h("div", { class: "hs-afoll" }, (a.followerCount ?? 0) + " takipçi")),
    fBtn);
}

// ── Etkinlikler listesi (app EventsScreen) — tarih filtreli tam liste ──
async function eventsListView(_id, root) {
  let events = [];
  try { events = await discoverEvents(); } catch (_) { clear(root); root.append(errBox()); return; }
  clear(root);
  const FILTERS = ["Tümü", "Bugün", "Yarın", "Bu Hafta", "Bu Ay"];
  let df = "Tümü";
  const chipRow = h("div", { class: "chip-row" });
  const listBox = h("div", { class: "ev-grid" });
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const draw = () => {
    clear(chipRow); clear(listBox);
    FILTERS.forEach((f) => chipRow.append(h("button", { class: "chip" + (f === df ? " on" : ""), onclick: () => { df = f; draw(); } }, f)));
    const now = Date.now(), today0 = startOfDay(now);
    const list = events.filter((e) => {
      if (activeCity !== "TÜMÜ" && fold((e.city || e.location?.city || "").trim()) !== fold(activeCity)) return false;
      const ms = msOf(e); if (ms == null) return df === "Tümü";
      if (df === "Bugün") return startOfDay(ms) === today0;
      if (df === "Yarın") return startOfDay(ms) === today0 + 86400e3;
      if (df === "Bu Hafta") return ms <= now + 7 * 86400e3;
      if (df === "Bu Ay") return ms <= now + 30 * 86400e3;
      return true;
    });
    if (!list.length) { listBox.append(hsEmpty("calendar-outline", "Etkinlik yok", "Bu filtrede etkinlik bulunamadı.")); return; }
    list.forEach((e) => listBox.append(ecard2(e, true)));
  };
  draw();
  root.append(chipRow, listBox);
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
      infoCard((ev.venueName || "M").charAt(0).toLocaleUpperCase("tr-TR"), ["#0D3B5E", "#1A5276"], ev.venueName || "Mekan", ev.city || ev.location?.city || "Mekan profilini görüntüle", ev.venueId ? () => go("#/mekan/" + ev.venueId) : null)),
    ev.artistName ? h("div", { class: "ed-sect" }, sectTitle("Sanatçı"),
      infoCard(ev.artistName.charAt(0).toLocaleUpperCase("tr-TR"), [g1, g2], ev.artistName, g || "Müzik", ev.artistId ? () => go("#/sanatci/" + ev.artistId) : null)) : null,
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
  const avg = revs.length ? (revs.reduce((s, r) => s + (r.rating || 0), 0) / revs.length).toFixed(1) : "—";
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

  root.append(
    h("div", { class: "pd-hero pd-artist" },
      h("button", { class: "ed-iconbtn dark", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22, color: "var(--text-secondary)" })),
      h("div", { class: "pd-center" },
        a.photoURL ? h("div", { class: "pd-av round", style: { backgroundImage: `url(${a.photoURL})` } }) : h("div", { class: "pd-av round" }, name.charAt(0).toLocaleUpperCase("tr-TR")),
        h("h1", { class: "pd-name" }, name),
        genres[0] ? h("span", { class: "pd-genrepill" }, genres[0]) : null,
        memberChip(a), membershipText(a),
        h("div", { class: "pd-stats" },
          pdStat(avg, "Puan", true), pdDivider(),
          pdStat(follCount ?? shortNum(a.followerCount ?? 0), "Takipçi"), pdDivider(),
          pdStat(revs.length, "Yorum")))),
    h("div", { class: "pd-acts" },
      followBtn,
      h("button", { class: "pd-act", onclick: () => { if (loginGate("Mesaj göndermek")) return; requestChat({ otherId: id, otherName: name }); go("#/mesajlar"); } }, icon("chatbubble-ellipses-outline", { size: 18, color: "#A78BFA" }), h("span", {}, "Mesaj")),
      h("button", { class: "pd-act solid", onclick: () => { if (loginGate("Puan vermek")) return; reviewModal("artist", a, () => artistDetail(id, root)); } }, icon("star", { size: 18, color: "#fff" }), h("span", { style: { color: "#fff" } }, "Puan Ver"))),
    h("div", { class: "ed-sect" }, pdTitle("Hakkında"),
      h("p", { class: "ed-desc" + (a.bio ? "" : " dim") }, a.bio || "Sanatçı henüz biyografi eklememiş."),
      a.experienceYears ? h("div", { class: "pd-exp" }, icon("time-outline", { size: 14, color: "var(--text-secondary)" }), h("span", {}, a.experienceYears + " yıl deneyim")) : null),
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
        v.photoURL ? h("div", { class: "pd-av sq", style: { backgroundImage: `url(${v.photoURL})` } }) : h("div", { class: "pd-av sq" }, name.charAt(0).toLocaleUpperCase("tr-TR")),
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
function reviewModal(kind, target, onDone) {
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
          if (kind === "artist") await submitArtistReview(uid(), myName(), target, rating, ta.value.trim());
          else await submitVenueReview(uid(), myName(), target, rating, ta.value.trim());
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
      h("div", { class: "cta-row" }, btn("Giriş Yap", { ic: "log-in-outline", full: true, color: C, onClick: () => go("#/login") })),
      h("div", { class: "cta-row" }, btn("Yeni Hesap Oluştur", { variant: "ghost", ic: "person-add-outline", full: true, onClick: () => go("#/register") })),
    );
    return;
  }
  const p = session.profile || {};
  const name = p.displayName || "Müşteri";

  // Avatar (gradyan halka + kamera düzenleme)
  const avInner = p.photoURL
    ? h("div", { class: "cp-av", style: { backgroundImage: `url(${p.photoURL})` } })
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
  const card = h("div", { class: "tk-card" },
    h("div", { class: "tk-bg" }),
    h("div", { class: "tk-header" }, (e.title || "BİLET").toLocaleUpperCase("tr-TR")),
    h("div", { class: "tk-body" },
      h("div", { class: "tk-line" }, icon("mic", { size: 13 }), h("span", {}, e.artistName || "Sanatçı")),
      h("div", { class: "tk-line" }, icon("business", { size: 13 }), h("span", {}, e.venueName || "Mekan")),
      h("div", { class: "tk-line" }, icon("calendar", { size: 13 }), h("span", {}, eventWhen(e))),
      h("div", { class: "tk-line" }, icon("navigate", { size: 13 }), h("span", {}, distTxt))),
    h("div", { class: "tk-footer" },
      h("div", { class: "tk-number" }, "BİLET ", h("span", { class: "bold" }, num)),
      h("div", { class: "tk-barcode" })));
  overlay.append(card, h("button", { class: "tk-close", onclick: () => overlay.remove() }, icon("close", { size: 18 }), h("span", {}, "Kapat")));
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
      const card = h("div", { class: "nf-card" + (n.read === false ? " unread" : "") },
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
