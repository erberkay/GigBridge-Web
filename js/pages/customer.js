// Müşteri deneyimi — Keşfet, Harita, Akış, Mesajlar, Profil + etkinlik/sanatçı/mekan detay
// + Takip/Favoriler/Katıldıklarım/Yorumlarım/Bildirimler. App backend'iyle birebir.
import { session, logout, refreshProfile } from "../store.js";
import {
  discoverEvents, eventById, userById, listRealArtists, listVenues, saveProfile, uploadImage,
  isAttending, attendEvent, unattendEvent, attendedEvents, eventAttendees,
  isFollowing, followArtist, unfollowArtist, followingList, artistFollowerCount, venueTimeline,
  isFavVenue, favVenue, unfavVenue, favVenues, isFavEvent, favEvent, unfavEvent, favEvents,
  artistReviews, submitArtistReview, getVenueReviews, submitVenueReview, myReviews,
  listenTimeline, createPost, isLiked, toggleLike,
  listenNotifications, markNotifRead, deleteNotif,
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
  const listBox = h("div", { class: "hs-vlist" });
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
  const page = h("div", { class: "page", style: { "--role": C } }, content);
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
        await attendEvent(ev, uid(), myName()); att = true; count++;
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
  const page = h("div", { class: "page", style: { "--role": C } }, content);
  (async () => {
    let ev = null, list = [];
    try { [ev, list] = await Promise.all([eventById(id), eventAttendees(id)]); } catch (_) {}
    clear(content);
    let q = "";
    const sInput = h("input", { placeholder: "Katılımcı ara...", oninput: (e) => { q = e.target.value; draw(); } });
    const listBox = h("div", { class: "at-list" });
    const draw = () => {
      clear(listBox);
      const f = list.filter((a) => !q || fold(a.displayName || a.name).includes(fold(q)));
      if (!f.length) { listBox.append(h("div", { class: "at-empty" }, icon("people-outline", { size: 48, color: "var(--text-muted)" }), h("div", {}, "Eşleşen katılımcı bulunamadı."))); return; }
      f.forEach((a, i) => {
        const name = a.displayName || a.name || "Kullanıcı";
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

function artistDetailPage(id) {
  const content = h("div", { class: "pd-page" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page", style: { "--role": C } }, content);
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
    h("div", { class: "ed-sect" },
      h("div", { class: "rv-head" }, pdTitle("Yorumlar"),
        h("button", { class: "rv-add", onclick: () => { if (loginGate("Yorum yapmak")) return; reviewModal("artist", a, () => artistDetail(id, root)); } }, "+ Yorum Yap")),
      custRevs.length ? h("div", {}, ...custRevs.map((r) => rvCard(r.authorName, r.rating, r.comment, r.createdAt))) : rvEmpty("Henüz yorum yok.")),
  );
}

// ══════════ MEKAN DETAY — app VenueDetailScreen birebir ══════════
function venueDetailPage(id) {
  const content = h("div", { class: "pd-page" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page", style: { "--role": C } }, content);
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

// ── Profil ──
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
  const pic = fileBtn();
  const menu = (ic, label, hash) => h("div", { class: "menu-row", onclick: () => go(hash) }, icon(ic, { size: 18, color: C }), h("span", { class: "menu-label" }, label), icon("chevron-forward", { size: 15, color: "var(--text-muted)" }));
  root.append(
    h("div", { class: "profile-head" },
      p.photoURL ? h("div", { class: "acard-photo big", style: { backgroundImage: `url(${p.photoURL})` } }) : avatar(p.displayName, C),
      h("div", {}, h("div", { class: "ph-name" }, p.displayName || "Müşteri"), h("div", { class: "ph-mail" }, p.email || ""))),
    card(
      pic.node,
      field({ label: "Şehir", id: "ccity", value: p.city || "", placeholder: "Örn. İstanbul" }),
      btn("Kaydet", { ic: "save-outline", full: true, color: C, onClick: async () => {
        try {
          const patch = { city: (document.querySelector("#ccity").value || "").trim() || null };
          if (pic.getFile()) patch.photoURL = await uploadImage(pic.getFile(), uid());
          await saveProfile(uid(), patch); await refreshProfile(); toast("Kaydedildi");
        } catch (_) { toast("Kaydedilemedi", "err"); }
      } })),
    h("div", { class: "menu-card" },
      menu("heart-outline", "Takip Ettiklerim", "#/takip"),
      menu("bookmark-outline", "Favorilerim", "#/favoriler"),
      menu("checkmark-done-outline", "Katıldığım Etkinlikler", "#/katildiklarim"),
      menu("chatbox-ellipses-outline", "Yorumlarım", "#/yorumlarim"),
      menu("notifications-outline", "Bildirimler", "#/bildirimler")),
    btn("Çıkış Yap", { variant: "ghost", ic: "log-out-outline", full: true, onClick: logout }),
  );
}
function fileBtn() {
  let file = null;
  const inp = h("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: (e) => { file = (e.target.files || [])[0] || null; if (file) node.querySelector("span").textContent = "Fotoğraf seçildi ✓"; } });
  const node = h("label", { class: "file-btn" }, icon("camera-outline", { size: 16 }), h("span", {}, "Profil fotoğrafı seç"), inp);
  return { node, getFile: () => file };
}

// ── Akış (timeline) ──
function renderAkis(root) {
  clear(root);
  root.append(h("div", { class: "cta-row" }, btn("Yeni Gönderi", { ic: "add-circle-outline", full: true, color: C, onClick: () => { if (loginGate("Gönderi paylaşmak")) return; postModal(); } })));
  const listWrap = h("div", { class: "feed" }, h("div", { class: "loading" }, spinner()));
  root.append(listWrap);
  const unsub = listenTimeline((posts) => {
    clear(listWrap);
    if (!posts.length) { listWrap.append(empty("newspaper-outline", "Akış boş", "İlk gönderiyi sen paylaş.")); return; }
    posts.forEach((p) => listWrap.append(postCard(p)));
  });
  root._cleanup = unsub; // sekme değişince router yeni node basıyor; leak minimal
}
function postCard(p) {
  const liked = { v: false };
  const likeBtn = h("button", { class: "post-act", onclick: async () => {
    if (loginGate("Beğenmek")) return;
    try { await toggleLike(p.id, uid(), liked.v); liked.v = !liked.v; likeBtn.firstChild.setAttribute("name", liked.v ? "heart" : "heart-outline"); } catch (_) {}
  } }, icon("heart-outline", { size: 16 }), h("span", {}, "Beğen"));
  if (authed()) isLiked(p.id, uid()).then((l) => { liked.v = l; likeBtn.firstChild.setAttribute("name", l ? "heart" : "heart-outline"); });
  return h("div", { class: "post-card" },
    h("div", { class: "post-head" }, avatar(p.authorName, C),
      h("div", {}, h("div", { class: "post-author" }, p.authorName || "Kullanıcı"),
        h("div", { class: "post-meta" }, [p.authorCity, fmtDate(p.createdAt)].filter(Boolean).join(" · ")))),
    p.rating ? stars(p.rating) : null,
    h("p", { class: "post-content" }, p.content || ""),
    p.venue ? h("div", { class: "post-tag" }, icon("business-outline", { size: 12 }), " " + p.venue) : null,
    h("div", { class: "post-actions" }, likeBtn,
      h("span", { class: "post-count" }, icon("heart", { size: 12, color: "var(--text-muted)" }), " " + (p.likeCount ?? 0)),
      h("span", { class: "post-count" }, icon("chatbubble-outline", { size: 12, color: "var(--text-muted)" }), " " + (p.commentCount ?? 0))));
}
function postModal() {
  const ta = h("textarea", { class: "review-ta", rows: 4, maxlength: 500, placeholder: "Ne düşünüyorsun?" });
  modal({ title: "Yeni Gönderi", body: ta, actions: [{ label: "Paylaş", ic: "send", keepOpen: true, onClick: async (close) => {
    const t = ta.value.trim(); if (!t) { toast("Bir şeyler yaz", "err"); return; }
    try { await createPost(uid(), myName(), session.profile?.city, t); toast("Paylaşıldı"); close(); } catch (_) { toast("Gönderilemedi", "err"); }
  } }] });
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
async function renderHarita(root) {
  clear(root);
  const mapEl = h("div", { class: "map-el" });
  root.append(mapEl);
  try {
    const [L, events] = await Promise.all([loadLeaflet(), discoverEvents()]);
    const withLoc = events.filter((e) => e.location?.lat != null && e.location?.lng != null);
    const center = withLoc[0] ? [withLoc[0].location.lat, withLoc[0].location.lng] : [39.0, 35.0];
    const map = L.map(mapEl).setView(center, withLoc.length ? 11 : 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    withLoc.forEach((e) => {
      const color = isLive(e) ? "#10b981" : "#7c3aed";
      const m = L.circleMarker([e.location.lat, e.location.lng], { radius: 9, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
      m.bindPopup(`<b>${(e.title || "Etkinlik").replace(/</g, "&lt;")}</b><br>${(e.venueName || "")}<br><a href="#/etkinlik/${e.id}">Detay →</a>`);
    });
    if (!withLoc.length) root.append(empty("location-outline", "Konumlu etkinlik yok", "Mekanlar konum ekledikçe burada görünür."));
    setTimeout(() => map.invalidateSize(), 200);
  } catch (e) { clear(root); root.append(errBox("Harita yüklenemedi.")); }
}

// ── Alt sayfalar ──
async function followingView(_id, root) {
  clear(root);
  try {
    const list = await followingList(uid());
    if (!list.length) { root.append(empty("heart-outline", "Kimseyi takip etmiyorsun", "Sanatçı profillerinden takip et.")); return; }
    root.append(h("div", { class: "list-card" }, ...list.map((f) => h("div", { class: "lrow", onclick: () => go("#/sanatci/" + (f.artistId || f.id)), style: { cursor: "pointer" } },
      avatar(f.artistName, ROLE.artist),
      h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, f.artistName || "Sanatçı"), h("div", { class: "lrow-meta" }, f.genre || "")),
      icon("chevron-forward", { size: 16, color: "var(--text-muted)" })))));
  } catch (e) { root.append(errBox()); }
}
async function favoritesView(_id, root) {
  clear(root);
  try {
    const [venues, events] = await Promise.all([favVenues(uid()), favEvents(uid())]);
    if (!venues.length && !events.length) { root.append(empty("bookmark-outline", "Favori yok", "Etkinlik ve mekanları kaydet.")); return; }
    if (events.length) root.append(sect("Etkinlikler", "calendar-outline", events.length,
      h("div", { class: "list-card" }, ...events.map((e) => h("div", { class: "lrow", onclick: () => go("#/etkinlik/" + e.id), style: { cursor: "pointer" } },
        avatar(e.title, C), h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, e.title), h("div", { class: "lrow-meta" }, [e.venue, e.date].filter(Boolean).join(" · "))), icon("chevron-forward", { size: 16, color: "var(--text-muted)" }))))));
    if (venues.length) root.append(sect("Mekanlar", "business-outline", venues.length,
      h("div", { class: "list-card" }, ...venues.map((v) => h("div", { class: "lrow", onclick: () => go("#/mekan/" + (v.venueId || v.id)), style: { cursor: "pointer" } },
        avatar(v.venueName, ROLE.venue), h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, v.venueName), h("div", { class: "lrow-meta" }, v.city || "")), icon("chevron-forward", { size: 16, color: "var(--text-muted)" }))))));
  } catch (e) { root.append(errBox()); }
}
async function attendedView(_id, root) {
  clear(root);
  try {
    const list = await attendedEvents(uid());
    if (!list.length) { root.append(empty("checkmark-done-outline", "Henüz etkinliğe katılmadın", "Keşfet'ten etkinliklere katıl.")); return; }
    root.append(h("div", { class: "grid" }, ...list.map(eventCard)));
  } catch (e) { root.append(errBox()); }
}
async function myReviewsView(_id, root) {
  clear(root);
  try {
    const list = await myReviews(uid());
    if (!list.length) { root.append(empty("chatbox-outline", "Henüz yorum yapmadın")); return; }
    root.append(h("div", {}, ...list.map((r) => reviewCard(r.targetName || r.venueName || "—", r.overallRating ?? r.rating, r.comment, r.createdAt))));
  } catch (e) { root.append(errBox()); }
}
function notificationsView(_id, root) {
  clear(root);
  const wrap = h("div", {}, h("div", { class: "loading" }, spinner()));
  root.append(wrap);
  listenNotifications(uid(), (list) => {
    clear(wrap);
    if (!list.length) { wrap.append(empty("notifications-off-outline", "Bildirim yok")); return; }
    list.forEach((n) => { if (n.read === false) markNotifRead(n.id); });
    list.forEach((n) => wrap.append(h("div", { class: "notif" + (n.read === false ? " unread" : "") },
      icon(notifIcon(n.type), { size: 18, color: C }),
      h("div", { class: "notif-body" }, h("div", { class: "notif-title" }, n.title || "Bildirim"), h("div", { class: "notif-text" }, n.body || ""), h("div", { class: "notif-time" }, fmtDate(n.createdAt))),
      h("button", { class: "notif-x", onclick: () => deleteNotif(n.id) }, icon("close", { size: 15 })))));
  });
}
function notifIcon(t) { return ({ event_invite: "mic-outline", event_deleted: "trash-outline", invitation: "mail-outline", group_invite: "people-outline", residency_offer: "calendar-outline" })[t] || "notifications-outline"; }

// Detay ekran sarmalayıcı (geri butonu + async yükleme)
function detailShell(title, loader, id) {
  const content = h("div", { class: "content detail" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page", style: { "--role": C } },
    h("header", { class: "topbar detail-topbar", style: { "--role": C } },
      h("button", { class: "icon-btn", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22 })),
      h("h1", { class: "tb-title" }, title),
      h("span", { style: { width: "34px" } })),
    content);
  loader(id, content);
  return page;
}
