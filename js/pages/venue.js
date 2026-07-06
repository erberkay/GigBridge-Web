// Mekan paneli — app VenueHome / FindArtist / Analytics / CreateEvent birebir paritesi
// + korunan akışlar (org istekleri, davet/rezidans, profil, isim değişikliği, sorun bildir).
// Yeni alt görünümler: #/venue/takip (watchedArtists), #/venue/performans/{id}, #/venue/degerlendir.
import { session, logout, refreshProfile } from "../store.js";
import { venueEvents, venueOrgRequests, acceptOrgRequest, setRequestStatus, saveProfile,
  createEvent, listArtists, createInvitation, createResidency, venueStats, uploadImage,
  getVenueReviews, submitReport, requestNameChange, cancelNameChange, clearNameChangeFlag,
  listRealArtists, userById, artistReviews, myReviews,
  venueResidencies, cancelResidencyDoc, updateEvent,
  watchArtist, unwatchArtist, watchedArtists, eventsByArtist,
  venueAcceptedInvitations, findExistingInvitation, listGroups, createGroupInvitation,
  submitVenueArtistReview } from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, photoPicker, modal, fmtDate, fmtTL, ROLE, loadLeaflet } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";

const AMBER = ROLE.venue; // #F59E0B — mekan vurgu rengi
const MIN_STAGE_FEE = 3500;
const GENRES = ["Electronic", "House", "Techno", "Jazz", "Pop", "Rock", "Akustik", "Hip-Hop", "R&B", "Klasik", "Diğer"];

// Mekan özellikleri (app AMENITY_OPTIONS ile birebir). İlk 6 varsayılan.
const AMENITY_OPTIONS = ["Profesyonel Ses Sistemi", "Işık Sistemi", "DJ Booth", "Soyunma Odası", "Parking", "VIP Alan", "Sahne", "Bar", "Klima", "Wi-Fi", "Engelli Erişimi", "Sigara Alanı"];
const DEFAULT_AMENITIES = AMENITY_OPTIONS.slice(0, 6);

// 81 il — şehir alanında aranabilir öneri listesi (app'teki aranabilir konum seçici karşılığı).
const PROVINCES = ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis", "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa", "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak"];

const NAV = [
  { key: "home", label: "Ana Sayfa", icon: "home-outline", href: "#/venue" },
  { key: "sanatci", label: "Sanatçı Bul", icon: "search-outline", href: "#/venue/sanatci" },
  { key: "analitik", label: "Analitik", icon: "bar-chart-outline", href: "#/venue/analitik" },
  { key: "mesaj", label: "Mesajlar", icon: "chatbubbles-outline", href: "#/venue/mesaj" },
  { key: "profil", label: "Profil", icon: "person-outline", href: "#/venue/profil" },
];
const TITLES = { home: "Mekan Paneli", olustur: "Etkinlik Oluştur", sanatci: "Sanatçı Bul", analitik: "Analitik", mesaj: "Mesajlar", profil: "Profil", takip: "Takip Ettiğim Sanatçılar", performans: "Sahne Performansı", degerlendir: "Sanatçı Değerlendir" };
const GENRE_FILTERS = ["Tümü", "Electronic", "Jazz", "Pop", "Rock", "Akustik", "Hip-Hop"];

// App genreColors haritası (VenueHome tür etiketi gradyanları)
const GENRE_GRADS = {
  "Electronic": ["#6C3FC5", "#3B1FA0"], "Jazz": ["#D97706", "#92400E"],
  "Pop Rock": ["#BE185D", "#831843"], "Pop": ["#DB2777", "#9D174D"],
  "Akustik": ["#047857", "#064E3B"], "Hip-Hop": ["#C2410C", "#7C2D12"],
};
const gradFor = (g) => GENRE_GRADS[g] || ["#4A4A6A", "#2A2A4A"];
const DAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const fmtDays = (days) => (Array.isArray(days) ? days : []).map((d) => DAY_SHORT[d] || "").filter(Boolean).join(",");

// Sanatçı değerlendirme kriterleri (app REVIEW_CRITERIA)
const REVIEW_CRITERIA = [
  { key: "performance", icon: "musical-notes-outline", label: "Sahne Performansı", desc: "Sahne hakimiyeti ve performans kalitesi" },
  { key: "punctuality", icon: "time-outline", label: "Dakiklik", desc: "Zamanında geldi ve programa uydu" },
  { key: "communication", icon: "chatbubbles-outline", label: "İletişim", desc: "Organizasyon sürecindeki iletişim" },
  { key: "crowd", icon: "people-outline", label: "Seyirci Etkileşimi", desc: "Kalabalığı yönetme ve seyirciyle etkileşim" },
];

export function venuePage() {
  const tab = tabFromHash();

  // ── Ana Sayfa: amber ambient başlık + gelir bandı (app VenueHomeScreen) ──
  if (tab === "home") {
    const hdr = homeHeader();
    const { page, content } = shellWith(hdr.node, "home");
    renderHome(content, hdr);
    return page;
  }
  // ── Etkinlik Oluştur: ortalanmış başlık + geri (app CreateEventScreen) ──
  if (tab === "olustur") {
    const { page, content } = shellWith(createHeader(), "olustur");
    renderCreate(content);
    return page;
  }
  // ── Büyük başlıklı ekranlar (app 28px başlık + alt yazı) ──
  if (tab === "sanatci") {
    const hd = pageHeader("Sanatçı Bul", "Mekanınız için en uygun sanatçıyı keşfedin", "#/venue");
    const { page, content } = shellWith(hd.node, "sanatci");
    renderArtists(content);
    return page;
  }
  if (tab === "analitik") {
    const hd = pageHeader("Analitik", "Mekanınızın tüm performans verileri", "#/venue");
    const { page, content } = shellWith(hd.node, "analitik");
    renderAnalytics(content);
    return page;
  }
  if (tab === "takip") {
    const hd = pageHeader("Takip Ettiğim Sanatçılar", "Yalnız siz görürsünüz", "#/venue/profil");
    const { page, content } = shellWith(hd.node, "takip");
    renderFollowing(content, hd.subEl);
    return page;
  }
  if (tab === "performans") {
    const hd = pageHeader("Sanatçı", "Sahne Performansı", "#/venue/takip");
    const { page, content } = shellWith(hd.node, "performans");
    renderPerformance(content, hashParts()[3] || "", hd.titleEl);
    return page;
  }
  if (tab === "degerlendir") {
    const hd = pageHeader("Sanatçı Değerlendir", "Etkinliğinizde sahne alan sanatçıları değerlendirin", "#/venue/profil");
    const { page, content } = shellWith(hd.node, "degerlendir");
    renderReview(content);
    return page;
  }

  // ── Mesajlar / Profil: mevcut web kabuğu (üst bar + çıkış) korunur ──
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": AMBER } },
    topbar(TITLES[tab] || "Mekan Paneli", { subtitle: session.profile?.displayName || "", color: AMBER,
      right: h("button", { class: "icon-btn", onclick: logout }, icon("log-out-outline", { size: 20 })) }),
    content,
    bottomnav(NAV, tab, AMBER));
  if (tab === "profil") renderProfile(content);
  else if (tab === "mesaj") { clear(content); messagesView(content, AMBER); }
  else { clear(content); content.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor.")); }
  return page;
}

function hashParts() { return (location.hash || "").split("?")[0].split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } }); }
function tabFromHash() { return hashParts()[2] || "home"; }

function shellWith(headerNode, tab) {
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": AMBER } }, headerNode, content, bottomnav(NAV, tab, AMBER));
  return { page, content };
}

// App VenueHome başlığı: 'MEKAN PANELİ' + mekan adı + amber glow + gelir bandı
function homeHeader() {
  const revenue = h("div", { class: "vx-rev-val" }, "—");
  const confirmed = h("div", { class: "vx-rev-val" }, "—");
  const node = h("header", { class: "topbar vx-head" },
    h("div", { class: "vx-head-glow" }),
    h("div", { class: "vx-head-top" },
      h("div", { class: "grow" },
        h("div", { class: "vx-eyebrow-hd" }, "MEKAN PANELİ"),
        h("div", { class: "vx-vname" }, session.profile?.displayName || "Mekan")),
      h("button", { class: "vx-bell", title: "Çıkış Yap", onclick: logout }, icon("log-out-outline", { size: 20, color: "var(--text-secondary)" }))),
    h("div", { class: "vx-revbar" },
      h("div", { class: "vx-rev-cell" }, h("div", { class: "vx-rev-lbl" }, "Bu Ay Gelir"), revenue),
      h("div", { class: "vx-rev-div" }),
      h("div", { class: "vx-rev-cell" }, h("div", { class: "vx-rev-lbl" }, "Onaylı Etkinlik"), confirmed)));
  return { node, revenue, confirmed };
}

// Büyük başlık (geri + 28px başlık + alt yazı) — FindArtist/Analytics/Takip/Performans/Değerlendir
function pageHeader(title, sub, back) {
  const titleEl = h("h1", { class: "vx-pgtitle" }, title);
  const subEl = h("p", { class: "vx-pgsub" }, sub || "");
  const node = h("header", { class: "topbar vx-pghead" },
    h("div", { class: "grow" },
      h("button", { class: "vx-back", onclick: () => { location.hash = back || "#/venue"; } }, icon("chevron-back", { size: 22, color: "var(--text-secondary)" })),
      titleEl,
      sub != null ? subEl : null));
  return { node, titleEl, subEl };
}

// CreateEvent başlığı: koyu amber gradyan + ortalanmış 18px başlık
function createHeader() {
  return h("header", { class: "topbar vx-crhead" },
    h("button", { class: "vx-back", style: { margin: "0" }, onclick: () => { location.hash = "#/venue"; } }, icon("chevron-back", { size: 24, color: "var(--text)" })),
    h("h1", { class: "vx-crtitle" }, "Etkinlik Oluştur"),
    h("span", { style: { width: "40px", flex: "0 0 auto" } }));
}

// ── Ortak yardımcılar ──
function msOfE(e) {
  const x = e.eventAt ?? e.date ?? e.eventDate;
  try {
    if (x && typeof x.toMillis === "function") return x.toMillis();
    if (typeof x === "number") return x;
    const t = Date.parse(x);
    return isNaN(t) ? null : t;
  } catch { return null; }
}
function shortDate(ev) {
  const ms = msOfE(ev);
  if (ms == null) return typeof ev.date === "string" ? ev.date : "";
  return new Date(ms).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}
function fmtDateTR(iso) {
  if (!iso) return "";
  try {
    const d = new Date(String(iso).length <= 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  } catch { return String(iso); }
}
const nameOf = (x) => x.displayName || x.name || "Sanatçı";
const genreOf = (x) => (Array.isArray(x.genres) ? x.genres[0] : x.genre) || "";
const priceOf = (a) => Number(a.price ?? a.stageFee ?? a.fee) || 0;

// Mekanın ortalama puanı: users dokümanındaki denorm değer, yoksa venueReviews'tan hesap
async function venueRating(uid, p) {
  let avg = Number(p?.avgRating) || 0, count = Number(p?.reviewCount) || 0;
  if (!avg || !count) {
    try {
      const revs = await getVenueReviews(uid);
      const rated = (revs || []).filter((r) => Number(r.overallRating ?? r.rating) > 0);
      if (!count) count = rated.length;
      if (!avg) avg = rated.length ? rated.reduce((a, r) => a + Number(r.overallRating ?? r.rating), 0) / rated.length : 0;
    } catch (_) {}
  }
  return { avg, count };
}

// Bölüm başlığı — amber eyebrow + 18px başlık + sağda opsiyonel eylem (app deseni)
function vxSect(eyebrow, title, action) {
  return h("div", { class: "vx-secthead" },
    h("div", { class: "grow" },
      eyebrow ? h("div", { class: "vx-eyebrow" }, eyebrow) : null,
      h("div", { class: "vx-secttitle" }, title)),
    action ? h("button", { class: "vx-seeall", onclick: action.onClick },
      action.icBefore ? icon(action.icBefore, { size: 14, color: AMBER }) : null,
      h("span", {}, action.label),
      action.chev ? icon("chevron-forward", { size: 14, color: AMBER }) : null) : null);
}
function vxEmpty(ic, title, sub) {
  return h("div", { class: "vx-emptycard" }, icon(ic, { size: 28, color: "var(--text-muted)" }),
    h("div", { class: "vx-e-title" }, title), sub ? h("div", { class: "vx-e-sub" }, sub) : null);
}

// ══════════════ ANA SAYFA (app VenueHomeScreen) ══════════════
async function renderHome(root, hdr) {
  try {
    const uid = session.user.uid;
    const p = session.profile || {};
    const [events, reqs, residencies, allArtists, accInvs] = await Promise.all([
      venueEvents(uid),
      venueOrgRequests(uid),
      venueResidencies(uid).catch(() => []),
      listRealArtists().catch(() => []),
      venueAcceptedInvitations(uid).catch(() => []),
    ]);
    const { avg: avgRating, count: reviewCount } = await venueRating(uid, p);

    const now = Date.now();
    const notCancelled = events.filter((e) => e.status !== "cancelled");
    const confirmedCount = events.filter((e) => ["upcoming", "live", "completed", "confirmed"].includes(e.status)).length;
    const monthlyRevenue = notCancelled
      .filter((e) => { const ms = msOfE(e); return ms != null && ms >= now - 30 * 86400e3 && ms <= now; })
      .reduce((s, e) => s + ((Number(e.ticketPrice) || 0) * (e.attendeeCount || 0)), 0);
    const weekAtt = notCancelled
      .filter((e) => { const ms = msOfE(e); return ms != null && ms >= now - 7 * 86400e3 && ms <= now; })
      .reduce((s, e) => s + (e.attendeeCount || 0), 0);
    const cancelRate = events.length ? Math.round(events.filter((e) => e.status === "cancelled").length / events.length * 100) : 0;

    hdr.revenue.textContent = "₺" + monthlyRevenue.toLocaleString("tr-TR");
    hdr.confirmed.textContent = String(confirmedCount);

    // Kabul edilmiş davetler → etkinlik 'Onaylı' durumu + sanatçı ücreti
    const acc = new Map();
    accInvs.forEach((i) => { if (i.eventId) acc.set(i.eventId, i); });

    clear(root);

    // Yatay analitik kartları
    root.append(h("div", { class: "vx-hscroll" },
      anaCard("people", weekAtt, "Bu Hafta Katılım"),
      anaCard("star", avgRating ? avgRating.toFixed(1) : "—", "Ort. Puan"),
      anaCard("chatbubble", reviewCount, "Yorum Sayısı"),
      anaCard("close-circle", events.length ? "%" + cancelRate : "—", "İptal Oranı", cancelRate > 10)));

    // 4'lü gradyan hızlı aksiyon grid'i
    root.append(h("div", { class: "vx-qgrid" },
      qBtn("add-circle", "Etkinlik Oluştur", "vx-q-amber", "#/venue/olustur"),
      qBtn("search", "Sanatçı Bul", "vx-q-purple", "#/venue/sanatci"),
      qBtn("bar-chart", "Analitik", "vx-q-green", "#/venue/analitik"),
      qBtn("chatbubbles", "Mesajlar", "vx-q-cyan", "#/venue/mesaj")));

    // Organizatör istekleri (koşullu) — kesikli amber kartlar + onay modalı
    if (reqs.length) {
      const box = h("div", {});
      reqs.forEach((req) => box.append(orgReqCard(req)));
      root.append(vxSect("ONAY BEKLİYOR", "Organizatör İstekleri"), box);
    }

    // Uzun dönem anlaşmalar (koşullu)
    if (residencies.length) {
      const box = h("div", {});
      residencies.forEach((r) => box.append(resCard(r, uid)));
      root.append(vxSect("SAHNE PROGRAMI", "Uzun Dönem Anlaşmalar"), box);
    }

    // Yaklaşan etkinlikler — status bar'lı satırlar (VIP rozetleri korunur)
    const upcoming = notCancelled
      .filter((e) => { const ms = msOfE(e); return ms == null || ms >= now - 6 * 3600e3; })
      .sort((a, b) => (msOfE(a) ?? Infinity) - (msOfE(b) ?? Infinity));
    const evBox = h("div", {});
    let showAll = false;
    const drawEvents = () => {
      clear(evBox);
      const list = showAll ? [...events].sort((a, b) => (msOfE(b) ?? 0) - (msOfE(a) ?? 0)) : upcoming.slice(0, 5);
      if (!list.length) { evBox.append(vxEmpty("calendar-outline", "Henüz etkinlik yok", "Sanatçı davet ederek ilk etkinliğinizi oluşturun")); return; }
      list.forEach((e) => evBox.append(evRow(e, acc)));
      if (!showAll && events.length > list.length) evBox.append(h("button", { class: "vx-morebtn", onclick: () => { showAll = true; drawEvents(); } }, `Tüm etkinlikleri gör (${events.length})`));
      else if (showAll) evBox.append(h("button", { class: "vx-morebtn", onclick: () => { showAll = false; drawEvents(); } }, "Yalnız yaklaşanları göster"));
    };
    drawEvents();
    root.append(vxSect("TAKVİM", "Yaklaşan Etkinlikler", { label: "Ekle", icBefore: "add-circle-outline", onClick: () => { location.hash = "#/venue/olustur"; } }), evBox);

    // Önerilen sanatçılar (ilk 3)
    const sugg = allArtists.slice(0, 3);
    const sBox = h("div", {});
    if (!sugg.length) sBox.append(vxEmpty("people-outline", "Henüz sanatçı yok", "Sistemdeki sanatçılar yakında burada görünecek"));
    else sugg.forEach((a) => sBox.append(suggCard(a)));
    root.append(vxSect("SİZE ÖZEL", "Önerilen Sanatçılar", { label: "Tümünü Gör", chev: true, onClick: () => { location.hash = "#/venue/sanatci"; } }), sBox);
  } catch (e) { clear(root); root.append(errBox()); }
}

function anaCard(ic, val, label, negative) {
  return h("div", { class: "vx-acard" },
    h("div", { class: "vx-aicon" + (negative ? " neg" : "") }, icon(ic, { size: 16, color: negative ? "var(--error)" : "var(--success)" })),
    h("div", { class: "vx-aval" }, String(val)),
    h("div", { class: "vx-albl" }, label));
}
function qBtn(ic, label, cls, hash) {
  return h("button", { class: "vx-qbtn " + cls, onclick: () => { location.hash = hash; } },
    icon(ic, { size: 22, color: "#fff" }), h("span", {}, label));
}

// Organizatör isteği kartı (kesikli amber çerçeve) + onay modalı
function orgReqCard(req) {
  const card = h("div", { class: "vx-reqcard" },
    h("div", { class: "vx-req-top" },
      h("div", { class: "grow" },
        h("div", { class: "vx-req-title" }, req.title || "Etkinlik"),
        h("div", { class: "vx-req-meta" }, icon("business-outline", { size: 11, color: "var(--text-secondary)" }), h("span", {}, req.organizerName || "Organizatör")),
        h("div", { class: "vx-req-date" }, [fmtDateTR(req.eventDate), req.eventTime].filter(Boolean).join(" · "))),
      h("button", { class: "vx-req-msg", title: "Mesaj", onclick: () => {
        requestChat({ otherId: req.createdByUid || req.organizerId, otherName: req.organizerName || "Organizatör" });
        location.hash = "#/venue/mesaj";
      } }, icon("chatbubble-ellipses-outline", { size: 20, color: "var(--cyan)" }))),
    h("div", { class: "vx-req-actions" },
      h("button", { class: "vx-req-reject", onclick: async (e) => {
        e.target.disabled = true;
        try { await setRequestStatus(req.id, "rejected"); card.remove(); toast("Reddedildi"); }
        catch (_) { e.target.disabled = false; toast("İşlem başarısız", "err"); }
      } }, "Reddet"),
      h("button", { class: "vx-req-accept", onclick: () => openAcceptModal(req, card) }, "Onayla")));
  return card;
}

function openAcceptModal(req, card) {
  const hasArtist = !!(req.artistId || req.artistName);
  const body = h("div", {},
    h("p", { class: "vx-accept-sub" }, [req.title || "Etkinlik", fmtDateTR(req.eventDate), req.eventTime].filter(Boolean).join(" · ")),
    h("div", { class: "vx-accept-label" }, "Sanatçı"),
    hasArtist
      ? h("div", { class: "vx-accept-row" }, icon("mic", { size: 14, color: AMBER }),
          h("span", { class: "vx-accept-artist" }, (req.artistName || "Sanatçı") + " — organizatörün seçtiği sanatçı"))
      : h("div", { class: "vx-accept-row" }, icon("information-circle-outline", { size: 14, color: "var(--text-muted)" }),
          h("span", { class: "vx-accept-note" }, "Sanatçıyı organizatör belirler — etkinlik organizatöre aittir.")));
  modal({ title: "İsteği Onayla", body, actions: [
    { label: "Onayla ve Yayınla", ic: "checkmark", keepOpen: true, onClick: async (close) => {
      try {
        await acceptOrgRequest(req, session.profile);
        close(); card.remove();
        toast("Onaylandı, etkinlik oluşturuldu");
        if (!(session.profile?.location?.lat != null)) toast("Haritada görünmek için Profil > Mekan Konumu bölümünden konumunu pinle");
      } catch (e) { toast("İşlem başarısız", "err"); }
    } },
  ] });
}

// Uzun dönem anlaşma kartı + iptal onayı
function resCard(r, uid) {
  const active = r.status === "active";
  const period = r.status === "pending" ? "Sanatçı onayı bekleniyor"
    : (r.endDate ? "bitiş " + String(r.endDate).split("-").reverse().join(".") : "devam ediyor");
  const meta = [fmtDays(r.daysOfWeek), r.time, r.fee ? fmtTL(r.fee) + "/gece" : null].filter(Boolean).join(" · ");
  const row = h("div", { class: "vx-rescard" },
    h("div", { class: "vx-res-ic" }, icon("repeat", { size: 18, color: AMBER })),
    h("div", { class: "grow", style: { minWidth: "0" } },
      h("div", { class: "vx-res-name" }, r.artistName || "Sanatçı"),
      h("div", { class: "vx-res-meta" }, meta),
      h("div", { class: "vx-res-period" }, period)),
    h("div", { class: "vx-res-right" },
      h("span", { class: "vx-pill " + (active ? "ok" : "wait") }, active ? "Aktif" : "Bekliyor"),
      h("button", { class: "vx-res-cancel", onclick: () => {
        modal({ title: "Anlaşmayı İptal Et", body: h("p", { class: "muted" }, `${r.artistName || "Sanatçı"} ile uzun dönem anlaşma iptal edilecek. Emin misiniz?`), actions: [
          { label: "Vazgeç", variant: "ghost", onClick: () => {} },
          { label: "İptal Et", variant: "danger", keepOpen: true, onClick: async (close) => {
            try { await cancelResidencyDoc(r.id, uid); row.remove(); close(); toast("Anlaşma iptal edildi"); }
            catch (e) { toast("İptal edilemedi", "err"); }
          } },
        ] });
      } }, "İptal")));
  return row;
}

// Yaklaşan etkinlik satırı — sol status bar + tür etiketi + durum rozeti (+ VIP korunur)
function evRow(ev, acc) {
  const confirmed = !!(ev.organizerId || !ev.artistId || acc.has(ev.id) || ["confirmed", "live", "completed"].includes(ev.status));
  const g = Array.isArray(ev.genre) ? ev.genre[0] : ev.genre;
  const [c1, c2] = gradFor(g);
  const inv = acc.get(ev.id);
  return h("div", { class: "vx-evrow" },
    h("div", { class: "vx-ev-bar" + (confirmed ? "" : " wait") }),
    h("div", { class: "vx-gtag", style: ev.bannerUrl
      ? { backgroundImage: `url(${ev.bannerUrl})`, color: "transparent" }
      : { background: `linear-gradient(135deg, ${c1}, ${c2})` } },
      (g || "GB").slice(0, 2).toLocaleUpperCase("tr-TR")),
    h("div", { class: "grow", style: { minWidth: "0" } },
      h("div", { class: "vx-ev-title" }, ev.title || "Etkinlik",
        ev.vipStatus === "approved" ? h("span", { class: "vx-vippill" }, icon("sparkles", { size: 9, color: AMBER }), "VIP") : null,
        ev.vipStatus === "pending" ? h("span", { class: "vx-vippill" }, "VIP onayda") : null),
      h("div", { class: "vx-ev-meta" }, icon("mic-outline", { size: 11, color: "var(--text-secondary)" }), h("span", {}, ev.artistName || "Sanatçı yok"))),
    h("div", { class: "vx-ev-right" },
      h("div", { class: "vx-ev-date" }, icon("calendar-outline", { size: 11, color: "var(--text-muted)" }), h("span", {}, shortDate(ev))),
      inv?.fee ? h("div", { class: "vx-ev-fee" }, fmtTL(inv.fee)) : null,
      h("span", { class: "vx-ev-badge" + (confirmed ? " ok" : " wait") }, confirmed ? "Onaylı" : "Bekliyor")));
}

// Önerilen sanatçı kartı
function suggCard(a) {
  const name = nameOf(a), g = genreOf(a);
  const [c1, c2] = gradFor(g);
  const rating = Number(a.avgRating) || 0;
  return h("div", { class: "vx-sacard" },
    h("div", { class: "vx-sav", style: a.photoURL ? { backgroundImage: `url(${a.photoURL})`, color: "transparent" } : { background: `linear-gradient(135deg, ${c1}, ${c2})` } },
      name.trim().charAt(0).toLocaleUpperCase("tr-TR")),
    h("div", { class: "grow", style: { minWidth: "0" } },
      h("div", { class: "vx-sa-name" }, name),
      h("div", { class: "vx-sa-genre" }, g || "Müzik"),
      h("div", { class: "vx-sa-metric" }, icon("trending-up", { size: 11, color: "var(--success)" }), h("span", {}, (a.followerCount ?? 0) + " takipçi"))),
    h("div", { class: "vx-sa-right" },
      rating ? h("div", { class: "vx-sa-rating" }, icon("star", { size: 11, color: AMBER }), h("span", {}, rating.toFixed(1))) : null,
      priceOf(a) ? h("div", { class: "vx-sa-price" }, fmtTL(priceOf(a))) : null,
      h("button", { class: "vx-invite", onclick: () => inviteModal(a) }, "Davet Et")));
}

// ══════════════ PROFİL (mevcut akış aynen + sanatçı takibi/değerlendirme girişleri) ══════════════
async function renderProfile(root) {
  clear(root);
  const p = session.profile || {};
  const uid = session.user.uid;

  // İsim değişikliği bayrağı: talep onaylanıp uygulandıysa (displayName == istenen) kendini temizle
  let ncPending = p.nameChangeStatus === "pending";
  if (ncPending && p.nameChangeRequested && (p.displayName || "") === p.nameChangeRequested) { ncPending = false; clearNameChangeFlag(uid); }

  const pic = photoPicker("Mekan / profil fotoğrafı (opsiyonel)", p.photoURL);

  // Profil özeti (app profileStats: etkinlik / puan / katılım / sanatçı)
  const statsBox = h("div", { class: "stat-grid" }, h("div", { class: "loading" }, spinner()));
  (async () => {
    try {
      const [s, reviews] = await Promise.all([venueStats(uid), getVenueReviews(uid).catch(() => [])]);
      const rated = (reviews || []).filter((r) => Number(r.overallRating ?? r.rating) > 0);
      const rating = rated.length ? rated.reduce((a, r) => a + Number(r.overallRating ?? r.rating), 0) / rated.length : 0;
      clear(statsBox);
      statsBox.append(
        statCard("calendar-outline", s.eventCount, "Etkinlik"),
        statCard("star-outline", rating ? rating.toFixed(1) : "—", "Puan"),
        statCard("people-outline", s.totalAttendance, "Katılım"),
        statCard("mic-outline", s.withArtist, "Sanatçılı"));
    } catch (_) {
      clear(statsBox);
      statsBox.append(statCard("calendar-outline", 0, "Etkinlik"), statCard("star-outline", "—", "Puan"), statCard("people-outline", 0, "Katılım"), statCard("mic-outline", 0, "Sanatçılı"));
    }
  })();

  // Aranabilir şehir önerileri (81 il)
  const cityList = h("datalist", { id: "citylist" }, ...PROVINCES.map((c) => h("option", { value: c })));

  // Özellikler — çoklu seçim (app AMENITY_OPTIONS)
  const amenities = new Set(Array.isArray(p.amenities) ? p.amenities : DEFAULT_AMENITIES);
  const amenityRow = h("div", { class: "chip-row wrap" }, ...AMENITY_OPTIONS.map((a) => {
    const c = h("button", { type: "button", class: "chip" + (amenities.has(a) ? " on" : ""), onclick: () => { if (amenities.has(a)) { amenities.delete(a); c.classList.remove("on"); } else { amenities.add(a); c.classList.add("on"); } } }, a);
    return c;
  }));

  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    h("div", { class: "profile-head" },
      p.photoURL ? h("div", { class: "acard-photo big", style: { backgroundImage: `url(${p.photoURL})` } }) : avatar(p.displayName, AMBER),
      h("div", { class: "grow" }, h("div", { class: "ph-name" }, p.displayName || "Mekan"), h("div", { class: "ph-mail" }, p.email || "")),
      btn("Adını Değiştir", { variant: "ghost", ic: "create-outline", onClick: () => nameChangeModal(root, p) })),
    ncPending ? h("div", { class: "nc-banner" }, icon("hourglass-outline", { size: 14, color: AMBER }),
      h("span", { class: "grow" }, `“${p.nameChangeRequested}” adına geçiş talebin yönetici onayında.`),
      h("button", { type: "button", class: "nc-cancel", onclick: async () => { await cancelNameChange(uid); await refreshProfile(); toast("Talep geri çekildi"); renderProfile(root); } }, "Geri çek")) : null,
    cityList,
    field({ label: "Şehir", id: "pcity", value: p.city || "", placeholder: "Ara: İstanbul, Aydın…", list: "citylist" }),
    field({ label: "İlçe", id: "pdistrict", value: p.district || "", placeholder: "Örn. Kadıköy" }),
    field({ label: "Adres", id: "paddress", value: p.address || "", placeholder: "Açık adres", multiline: true }),
    field({ label: "Telefon", id: "pphone", type: "tel", value: p.phone || "", placeholder: "05xx xxx xx xx" }),
    field({ label: "Kapasite", id: "pcap", type: "number", value: p.capacity || "", placeholder: "Örn. 300" }),
    field({ label: "Web Sitesi", id: "pweb", value: p.website || "", placeholder: "https://…" }),
    pic.node,
  );

  // ── Konum pinleme (haritada görünmek için lat/lng gerekir) ──
  let pin = (p.location && p.location.lat != null) ? { lat: p.location.lat, lng: p.location.lng } : null;
  const pinInfo = h("div", { class: "pin-info" }, pin ? ("📍 " + pin.lat.toFixed(5) + ", " + pin.lng.toFixed(5)) : "Haritaya tıklayarak mekanının tam yerini işaretle.");
  const mapEl = h("div", { class: "map-el pin-map" });
  let setPin = () => {};
  const useLoc = btn("Konumumu Kullan", { ic: "locate-outline", variant: "ghost", onClick: () => {
    if (!navigator.geolocation) { toast("Tarayıcı konumu desteklemiyor", "err"); return; }
    navigator.geolocation.getCurrentPosition((pos) => setPin(pos.coords.latitude, pos.coords.longitude, true), () => toast("Konum alınamadı (izin?)", "err"));
  } });
  const clearPin = h("button", { type: "button", class: "pin-clear", onclick: () => { pin = null; pinInfo.textContent = "Haritaya tıklayarak mekanının tam yerini işaretle."; setPin("__clear__"); } }, "Pini kaldır");
  loadLeaflet().then((L) => {
    const map = L.map(mapEl).setView(pin ? [pin.lat, pin.lng] : [39, 35], pin ? 15 : 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    let marker = pin ? L.marker([pin.lat, pin.lng]).addTo(map) : null;
    setPin = (lat, lng, recenter) => {
      if (lat === "__clear__") { if (marker) { map.removeLayer(marker); marker = null; } return; }
      pin = { lat, lng };
      if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng]).addTo(map);
      pinInfo.textContent = "📍 " + lat.toFixed(5) + ", " + lng.toFixed(5);
      if (recenter) map.setView([lat, lng], 16);
    };
    map.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng));
    setTimeout(() => map.invalidateSize(), 300);
  }).catch(() => mapEl.append(h("p", { class: "muted small" }, "Harita yüklenemedi.")));

  const saveMsg = h("p", { class: "msg" });
  const save = btn("Kaydet", { ic: "save-outline", full: true, onClick: async () => {
    const patch = {
      city: v("#pcity"), district: v("#pdistrict") || null, address: v("#paddress"),
      phone: v("#pphone"), website: v("#pweb"),
      capacity: v("#pcap") ? Number(v("#pcap")) : null,
      amenities: [...amenities],
      location: pin ? { lat: pin.lat, lng: pin.lng, city: v("#pcity") || null } : null,
    };
    try { if (pic.getFile()) patch.photoURL = await uploadImage(pic.getFile(), session.user.uid); await saveProfile(session.user.uid, patch); await refreshProfile(); toast("Profil kaydedildi"); }
    catch (e) { saveMsg.textContent = "Kaydedilemedi."; saveMsg.className = "msg err"; }
  } });

  const pMenuRow = (ic, label, hash) => h("div", { class: "menu-row", onclick: () => { location.hash = hash; } },
    icon(ic, { size: 18, color: AMBER }), h("span", { class: "menu-label" }, label), icon("chevron-forward", { size: 15, color: "var(--text-muted)" }));

  root.append(
    sect("Profil Özeti", "stats-chart-outline", 0, statsBox),
    sect("Mekan Bilgileri", "business-outline", 0, form),
    sect("Özellikler", "options-outline", 0,
      h("p", { class: "muted small mb6" }, "Mekanının sunduğu olanakları seç."), amenityRow),
    sect("Mekan Konumu", "location-outline", 0,
      h("p", { class: "muted small mb6" }, "Etkinliklerinin müşteri haritasında görünmesi için mekanının yerini pinle."),
      pinInfo, mapEl, h("div", { class: "pin-actions" }, useLoc, clearPin)),
    save, saveMsg,
    sect("Sanatçılar", "mic-outline", 0,
      h("div", { class: "menu-card" },
        pMenuRow("eye-outline", "Takip Ettiğim Sanatçılar", "#/venue/takip"),
        pMenuRow("star-outline", "Sanatçı Değerlendir", "#/venue/degerlendir"))),
    sect("Destek", "help-buoy-outline", 0,
      h("p", { class: "muted small mb6" }, "Bir sorunun ya da talebin mi var? Yöneticiye ilet."),
      btn("Sorun Bildir", { variant: "ghost", ic: "flag-outline", full: true, onClick: reportModal })));
}

// Mekan adı değişikliği → yöneticiye istek (neden zorunlu). App ve web aynı akışı paylaşır.
function nameChangeModal(root, p) {
  const cur = p.displayName || "Mekan";
  const body = h("div", {},
    h("p", { class: "muted small mb6" }, "Mekan adı değişikliği yönetici onayına gönderilir. Nedeni belirtmek zorunludur."),
    h("div", { class: "nc-current" }, "Mevcut ad: ", h("b", {}, cur)),
    field({ label: "Yeni Ad", id: "nc_new", placeholder: "Yeni mekan adı" }),
    field({ label: "Değişiklik Nedeni (zorunlu)", id: "nc_reason", placeholder: "Örn. Marka değişikliği, yazım düzeltmesi…", multiline: true }));
  modal({ title: "Mekan Adını Değiştir", body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Talebi Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      const nn = v("#nc_new"), rs = v("#nc_reason");
      if (!nn) return toast("Yeni ad gir", "err");
      if (nn === cur) return toast("Ad zaten aynı", "err");
      if (rs.length < 5) return toast("Nedeni belirt (en az 5 karakter)", "err");
      try {
        await requestNameChange(session.user.uid, { currentName: cur, requestedName: nn, reason: rs, reporterName: cur });
        await refreshProfile(); toast("Talebin yöneticiye gönderildi"); close(); renderProfile(root);
      } catch (e) { toast("Gönderilemedi", "err"); }
    } },
  ] });
}

// Sorun / talep bildir → reports (yönetici görür)
function reportModal() {
  const body = h("div", {},
    field({ label: "Konu", id: "rp_sub", placeholder: "Kısa başlık" }),
    field({ label: "Mesaj", id: "rp_msg", placeholder: "Sorununu ya da talebini yaz…", multiline: true }));
  modal({ title: "Sorun Bildir", body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      const msg = v("#rp_msg");
      if (!msg) return toast("Mesaj yaz", "err");
      try { await submitReport(session.user.uid, { subject: v("#rp_sub"), message: msg, reporterName: session.profile?.displayName || "", reporterType: "venue" }); toast("Bildirimin alındı, teşekkürler"); close(); }
      catch (e) { toast("Gönderilemedi", "err"); }
    } },
  ] });
}

// ══════════════ ETKİNLİK OLUŞTUR (app CreateEventScreen alan sırası/tasarımı) ══════════════
async function renderCreate(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  let artists = [], groups = [], myEvents = [];
  try {
    [artists, groups, myEvents] = await Promise.all([
      listArtists().catch(() => []),
      listGroups().catch(() => []),
      venueEvents(session.user.uid).catch(() => []),
    ]);
  } catch (_) {}
  clear(root);
  const p = session.profile || {};
  const venueCap = Number(p.capacity) || null;
  let artistSel = null, artistKind = null, vip = false, genreSel = "";

  // Kapak fotoğrafı (16:9)
  const pic = photoPicker("Fotoğraf seç ve kaydırarak konumlandır (16:9)");
  const cover = h("div", { class: "vx-cover" },
    h("span", { class: "vx-lbl" }, "Kapak Fotoğrafı"), pic.node);

  // Etkinlik adı
  const titleF = field({ label: "Etkinlik Adı", id: "ctitle", placeholder: "örn: Cumartesi Canlı Müzik" });

  // Sanatçı seçimi (sistemden — modal seçici) + koşullu sahne ücreti
  const artistField = h("div", { class: "vx-selfield ph", onclick: () => openPicker() }, "Sanatçı veya grup seçin");
  const artistHelp = h("span", { class: "vx-help" }, "Sistemdeki kayıtlı sanatçılardan veya gruplardan seçin.");
  const selBtn = h("button", { type: "button", class: "vx-selbtn", onclick: () => openPicker() },
    icon("people", { size: 16, color: AMBER }), h("span", {}, "Seç"));
  const clearBtn = h("button", { type: "button", class: "vx-selclear", style: { display: "none" }, title: "Sanatçıyı kaldır", onclick: () => setArtist(null, null) },
    icon("close-circle", { size: 20, color: "var(--text-muted)" }));
  const feeWrap = h("div", { style: { display: "none" } },
    field({ label: "Sanatçı Sahne Ücreti (₺)", id: "cfee", type: "number", placeholder: `Teklif edilecek ücret (en az ${MIN_STAGE_FEE})`,
      hint: "Bu ücretle sanatçıya teklif gönderilir; sanatçı gelen tekliflerinde görüp kabul/red edebilir." }));

  function setArtist(item, kind) {
    artistSel = item; artistKind = kind;
    if (!item) {
      artistField.textContent = "Sanatçı veya grup seçin"; artistField.classList.add("ph");
      artistHelp.textContent = "Sistemdeki kayıtlı sanatçılardan veya gruplardan seçin."; artistHelp.style.color = "";
      feeWrap.style.display = "none"; clearBtn.style.display = "none"; selBtn.style.display = "";
      return;
    }
    artistField.textContent = nameOf(item); artistField.classList.remove("ph");
    artistHelp.textContent = kind === "group" ? "✓ Grup seçildi" : "✓ Kayıtlı sanatçı seçildi";
    artistHelp.style.color = "var(--success)";
    feeWrap.style.display = kind === "artist" ? "" : "none";
    clearBtn.style.display = ""; selBtn.style.display = "none";
    const g = genreOf(item);
    if (g) { genreSel = g; gInput.value = g; paintG(); }
  }
  function openPicker() { artistPickerModal({ artists, groups, onSelect: setArtist }); }

  // Tarih & Saat (Tarih + Başlangıç, altta Bitiş)
  const dateRow = h("div", { class: "frow" },
    field({ label: "Tarih *", id: "cdate", type: "date" }),
    field({ label: "Başlangıç", id: "ctime", type: "time" }));
  const endRow = h("div", { class: "frow" },
    field({ label: "Bitiş", id: "cend", type: "time",
      hint: "Bitiş saati, etkinlik “şu an çalıyor” olduğunda haritada yeşil pin gösterir." }),
    h("div", { class: "field", style: { visibility: "hidden" } }));

  // Tür — chip'ler + serbest metin
  const gInput = h("input", { id: "cgenre", placeholder: "Tür seçin ya da yazın (örn. House)", oninput: (e) => { genreSel = e.target.value.trim(); paintG(); } });
  const gRow = h("div", { class: "vx-gchips" });
  const paintG = () => { [...gRow.children].forEach((c) => c.classList.toggle("on", c.textContent === genreSel)); };
  GENRES.forEach((g) => gRow.append(h("button", { type: "button", class: "vx-gchip", onclick: () => {
    genreSel = genreSel === g ? "" : g; gInput.value = genreSel; paintG();
  } }, g)));

  // VIP — Standart / VIP İste (iki buton)
  const stdBtn = h("button", { type: "button", class: "vx-vipbtn on", onclick: () => setVip(false) }, h("span", {}, "Standart"));
  const vipBtn = h("button", { type: "button", class: "vx-vipbtn", onclick: () => setVip(true) }, icon("sparkles", { size: 14 }), h("span", {}, "VIP İste"));
  const setVip = (x) => { vip = x; stdBtn.classList.toggle("on", !x); vipBtn.classList.toggle("on", x); };

  const msgEl = h("p", { class: "msg" });
  const submit = h("button", { class: "vx-submit", onclick: doCreate }, "Etkinliği Yayınla");

  async function doCreate() {
    const title = v("#ctitle"), date = v("#cdate"), time = v("#ctime"), end = v("#cend");
    if (!title) return fail(msgEl, "Etkinlik adı gir.");
    if (!date) return fail(msgEl, "Tarih seç.");
    // Mekan konumu pinlenmemişse etkinlik oluşturulamaz (haritada görünürlük şart).
    if (session.profile?.location?.lat == null || session.profile?.location?.lng == null) {
      fail(msgEl, "Etkinliğin haritada görünmesi için önce mekan konumunu ayarla.");
      if (!document.querySelector(".vx-locfix")) {
        msgEl.after(h("button", { type: "button", class: "vx-locfix",
          onclick: () => { location.hash = "#/venue/profil"; },
          style: { display: "block", margin: "10px auto 0", padding: "11px 22px", background: "var(--amber)", color: "#06070A", border: "0", borderRadius: "8px", fontWeight: "700", cursor: "pointer", font: "inherit" } },
          "📍 Mekan Konumunu Ayarla →"));
      }
      return;
    }
    const lcT = title.toLocaleLowerCase("tr-TR");
    if (myEvents.some((e) => e.date === date && (e.title || "").trim().toLocaleLowerCase("tr-TR") === lcT))
      return fail(msgEl, "Aynı gün aynı adla bir etkinlik zaten var.");
    if (time && end && time === end) return fail(msgEl, "Bitiş saati başlangıçla aynı olamaz.");
    const f = { title, date, time, genre: (genreSel || v("#cgenre")).trim(), price: v("#cprice"), capacity: v("#ccap"), description: v("#cdesc"), vip };
    if (artistSel && artistKind === "artist") {
      f.artistId = artistSel.id; f.artistName = nameOf(artistSel);
      if (!(Number(v("#cfee")) >= MIN_STAGE_FEE)) return fail(msgEl, `Sanatçı seçtiysen sahne ücreti en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")} olmalı.`);
      if (!time) return fail(msgEl, "Sanatçıya teklif için başlangıç saati de gir.");
    } else if (artistSel && artistKind === "group") {
      f.artistName = nameOf(artistSel);
    }
    submit.disabled = true;
    try {
      if (pic.getFile()) { msgEl.textContent = "Fotoğraf yükleniyor…"; msgEl.className = "msg"; f.bannerUrl = await uploadImage(pic.getFile(), session.user.uid); }
      const eventId = await createEvent(session.profile, f);
      if (end) { // Bitiş saati → endAt (canlı pin için); gece devrilirse ertesi güne taşır
        const startAt = new Date(`${date}T${time || "00:00"}:00`);
        const endAt = new Date(`${date}T${end}:00`);
        if (!isNaN(endAt) && !isNaN(startAt)) { if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1); await updateEvent(eventId, { endAt }).catch(() => {}); }
      }
      if (artistSel && artistKind === "artist") {
        const dup = await findExistingInvitation(session.user.uid, artistSel.id, date).catch(() => null);
        if (!dup) await createInvitation(session.profile, artistSel, { date, time, fee: v("#cfee"), message: "", photoUrl: f.bannerUrl ?? null, eventId });
      }
      toast(vip ? "Yayınlandı — VIP onayına düştü" : (artistSel && artistKind === "artist") ? "Yayınlandı — sanatçıya teklif gönderildi" : "Etkinlik yayınlandı");
      location.hash = "#/venue";
    } catch (e) { fail(msgEl, "Oluşturulamadı."); submit.disabled = false; }
  }

  root.append(h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    cover,
    titleF,
    h("span", { class: "vx-lbl" }, "Sanatçı"),
    h("div", { class: "vx-selrow" }, artistField, selBtn, clearBtn),
    artistHelp,
    feeWrap,
    dateRow,
    endRow,
    h("span", { class: "vx-lbl" }, "Tür"),
    gRow,
    h("label", { class: "field" }, gInput,
      h("span", { class: "fhint" }, "Listeden seçebilir ya da kendi türünüzü yazabilirsiniz. Sanatçı seçtiğinizde türü otomatik gelir.")),
    field({ label: "Giriş / Bilet Ücreti (₺)", id: "cprice", type: "number", placeholder: "Boş bırakırsanız 'Ücretsiz' görünür" }),
    field({ label: "Kontenjan", id: "ccap", type: "number",
      placeholder: venueCap ? `${venueCap} (mekan kapasitesi)` : "Sınırsız",
      hint: venueCap ? `Boş bırakırsanız mekan kapasitesi (${venueCap} kişi) uygulanır.` : "Boş bırakırsanız sınırsız sayılır. Mekan kapasitenizi Profil > Kapasite bölümünden girebilirsiniz." }),
    field({ label: "Açıklama", id: "cdesc", placeholder: "Etkinlik hakkında kısa bilgi...", multiline: true }),
    h("span", { class: "vx-lbl" }, "VIP Etkinlik"),
    h("div", { class: "vx-vipseg" }, stdBtn, vipBtn),
    h("span", { class: "vx-help" }, "VIP etkinlikler onaylanınca müşteride en üstteki kayan alanda en önde + “VIP DENEYİM” rozetiyle gösterilir. İsteğin GigBridge ekibinin onayına düşer."),
  ), submit, msgEl);
}

// Sistemden sanatçı/grup seçici (app ArtistPickerModal karşılığı)
function artistPickerModal({ artists, groups, onSelect }) {
  const listBox = h("div", {});
  const search = h("input", { placeholder: "Sanatçı ara…", oninput: () => draw() });
  const m = modal({ title: "Sanatçı veya Grup Seç",
    body: h("div", {}, h("div", { class: "vx-fa-search", style: { marginBottom: "10px" } }, icon("search-outline", { size: 16, color: "var(--text-muted)" }), search), listBox) });
  const lc = (s) => (s || "").toLocaleLowerCase("tr-TR");
  function draw() {
    clear(listBox);
    const t = lc(search.value.trim());
    const rows = [
      ...artists.filter((a) => !t || lc(nameOf(a)).includes(t)).map((a) => ({ item: a, kind: "artist" })),
      ...groups.filter((g) => !t || lc(nameOf(g)).includes(t)).map((g) => ({ item: g, kind: "group" })),
    ];
    if (!rows.length) { listBox.append(h("div", { class: "lrow-empty" }, "Sonuç bulunamadı")); return; }
    rows.forEach(({ item, kind }) => listBox.append(h("div", { class: "lrow clickable", onclick: () => { onSelect(item, kind); m.close(); } },
      avatar(nameOf(item), kind === "group" ? ROLE.organizer : ROLE.artist),
      h("div", { class: "lrow-info" },
        h("div", { class: "lrow-name" }, nameOf(item)),
        h("div", { class: "lrow-meta" }, kind === "group" ? "Grup" : (genreOf(item) || "Sanatçı"))))));
  }
  draw();
}

// ══════════════ ANALİTİK (app VenueAnalyticsScreen) ══════════════
async function renderAnalytics(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  try {
    const uid = session.user.uid;
    const p = session.profile || {};
    const [events, s] = await Promise.all([venueEvents(uid), venueStats(uid)]);
    const { avg: avgRating, count: reviewCount } = await venueRating(uid, p);
    clear(root);

    const PERIODS = [["Bu Hafta", 7], ["Bu Ay", 30], ["3 Ay", 90], ["1 Yıl", 365]];
    let period = 30;
    const chipRow = h("div", { class: "vx-periodrow" });
    const body = h("div", {});
    const drawChips = () => {
      clear(chipRow);
      PERIODS.forEach(([l, d]) => chipRow.append(h("button", { class: "vx-pchip" + (d === period ? " on" : ""), onclick: () => { period = d; drawChips(); draw(); } }, l)));
    };

    const chartHead = (ic, title) => h("div", { class: "vx-charthead" }, icon(ic, { size: 16, color: AMBER }), h("span", {}, title));
    const chartEmpty = (ic, text) => h("div", { class: "vx-chart-empty" }, icon(ic, { size: 20, color: "var(--text-muted)" }), h("span", {}, text));

    function draw() {
      clear(body);
      const now = Date.now(), since = now - period * 86400e3;
      const inRange = events.filter((e) => { const ms = msOfE(e); return ms != null && ms >= since && ms <= now; });
      const ok = inRange.filter((e) => e.status !== "cancelled");
      const totalAttendance = ok.reduce((sm, e) => sm + (e.attendeeCount || 0), 0);
      const avgNight = ok.length ? Math.round(totalAttendance / ok.length) : 0;
      const totalRevenue = ok.reduce((sm, e) => sm + ((Number(e.ticketPrice) || 0) * (e.attendeeCount || 0)), 0);
      const cancelRate = inRange.length ? Math.round(inRange.filter((e) => e.status === "cancelled").length / inRange.length * 100) : 0;
      const uniqueArtists = new Set(ok.map((e) => e.artistId || e.artistName).filter(Boolean)).size;
      const priced = ok.filter((e) => Number(e.ticketPrice) > 0);
      const avgTicket = priced.length ? Math.round(priced.reduce((sm, e) => sm + Number(e.ticketPrice), 0) / priced.length) : 0;

      // 2x2 birincil metrikler
      body.append(h("div", { class: "vx-mgrid" },
        mCard("people-outline", totalAttendance, "Toplam Katılım", "#A855F7"),
        mCard("moon-outline", avgNight, "Ort. Gece Katılımı", "#06B6D4"),
        mCard("cash-outline", totalRevenue ? fmtTL(totalRevenue) : "—", "Toplam Gelir", "#10B981"),
        mCard("star-outline", avgRating ? avgRating.toFixed(1) : "—", "Ort. Puan", AMBER)));

      // İkincil metrikler (yatay)
      body.append(h("div", { class: "vx-smrow" },
        smCard("ticket-outline", inRange.length, "Etkinlik Sayısı"),
        smCard("close-circle-outline", inRange.length ? "%" + cancelRate : "—", "İptal Oranı", cancelRate > 10 ? "var(--error)" : null),
        smCard("mic-outline", uniqueArtists, "Farklı Sanatçı"),
        smCard("pricetag-outline", avgTicket ? fmtTL(avgTicket) : "—", "Ort. Bilet"),
        smCard("chatbubble-outline", reviewCount, "Yorum Sayısı")));

      // Günlük doluluk trendi (bar grafik, Pzt→Paz)
      body.append(chartHead("bar-chart-outline", "Günlük Doluluk Trendi"));
      const byDay = [0, 0, 0, 0, 0, 0, 0];
      ok.forEach((e) => { const ms = msOfE(e); if (ms == null) return; byDay[new Date(ms).getDay()] += (e.attendeeCount || 0); });
      const order = [1, 2, 3, 4, 5, 6, 0], dLabels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
      const dMax = Math.max(...order.map((i) => byDay[i]), 0);
      if (!dMax) body.append(chartEmpty("bar-chart-outline", "Bu dönem için etkinlik verisi yok"));
      else body.append(h("div", { class: "vx-chartcard vx-bars" }, ...order.map((di, j) =>
        h("div", { class: "vx-barcol" },
          h("div", { class: "vx-barval" }, String(byDay[di] || "")),
          h("div", { class: "vx-barwrap" }, h("div", { class: "vx-bar", style: { height: Math.max(2, Math.round(byDay[di] / dMax * 100)) + "%" } })),
          h("div", { class: "vx-barlbl" }, dLabels[j])))));

      // Yoğun saatler (yatay bar)
      body.append(chartHead("time-outline", "Yoğun Saatler"));
      const byHour = {};
      ok.forEach((e) => { const hh = parseInt(String(e.startTime || e.time || "").split(":")[0], 10); if (isNaN(hh) || hh < 0 || hh > 23) return; byHour[hh] = (byHour[hh] || 0) + (e.attendeeCount || 0); });
      const hours = Object.keys(byHour).map(Number).sort((a, b) => a - b);
      const hMax = Math.max(...hours.map((x) => byHour[x]), 0);
      if (!hours.length) body.append(chartEmpty("time-outline", "Saat bilgisi olan etkinlik yok"));
      else body.append(h("div", { class: "vx-chartcard" }, ...hours.map((hh) => {
        const pct = hMax ? Math.round(byHour[hh] / hMax * 100) : 0;
        const col = pct >= 90 ? "var(--success)" : pct >= 60 ? AMBER : "var(--primary)";
        return h("div", { class: "vx-hbrow" },
          h("span", { class: "vx-hb-lbl" }, String(hh).padStart(2, "0") + ":00"),
          h("div", { class: "vx-hb-track" }, h("div", { class: "vx-hb-fill", style: { width: pct + "%", background: col } })),
          h("span", { class: "vx-hb-val" }, String(byHour[hh])));
      })));

      // Müzik türü dağılımı (ilk 5)
      body.append(chartHead("musical-notes-outline", "Müzik Türü Dağılımı"));
      const byGenre = {};
      ok.forEach((e) => { const g = Array.isArray(e.genre) ? e.genre[0] : e.genre; if (!g) return; byGenre[g] = (byGenre[g] || 0) + ((e.attendeeCount || 0) || 1); });
      const gTop = Object.entries(byGenre).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const gTotal = gTop.reduce((sm, [, c]) => sm + c, 0);
      const PALETTE = ["#A855F7", "#06B6D4", "#F59E0B", "#10B981", "#EF4444"];
      if (!gTop.length) body.append(chartEmpty("musical-notes-outline", "Tür bilgisi olan etkinlik yok"));
      else body.append(h("div", { class: "vx-chartcard" }, ...gTop.map(([g, c], i) => {
        const pct = gTotal ? Math.round(c / gTotal * 100) : 0;
        return h("div", { class: "vx-hbrow" },
          h("span", { class: "vx-hb-lbl g" }, g),
          h("div", { class: "vx-hb-track g8" }, h("div", { class: "vx-hb-fill g8", style: { width: pct + "%", background: PALETTE[i % PALETTE.length] } })),
          h("span", { class: "vx-hb-val", style: { color: PALETTE[i % PALETTE.length], fontWeight: "700" } }, "%" + pct));
      })));

      // Sanatçı performansları (ilk 5)
      body.append(chartHead("mic-outline", "Sanatçı Performansları"));
      const byArtist = {};
      ok.forEach((e) => {
        const k = e.artistId || e.artistName; if (!k) return;
        const o = byArtist[k] || (byArtist[k] = { name: e.artistName || "Sanatçı", genre: (Array.isArray(e.genre) ? e.genre[0] : e.genre) || "", att: 0, rev: 0, count: 0 });
        o.att += (e.attendeeCount || 0); o.rev += ((Number(e.ticketPrice) || 0) * (e.attendeeCount || 0)); o.count++;
      });
      const aTop = Object.values(byArtist).sort((a, b) => b.att - a.att).slice(0, 5);
      if (!aTop.length) body.append(chartEmpty("mic-outline", "Bu dönem için sanatçı verisi yok"));
      else aTop.forEach((a, i) => {
        const [c1, c2] = gradFor(a.genre);
        body.append(h("div", { class: "vx-rankrow" },
          h("div", { class: "vx-rankbadge" }, "#" + (i + 1)),
          h("div", { class: "vx-rank-av", style: { background: `linear-gradient(135deg, ${c1}, ${c2})` } }, (a.name || "?").charAt(0).toLocaleUpperCase("tr-TR")),
          h("div", { class: "grow", style: { minWidth: "0" } },
            h("div", { class: "vx-sa-name" }, a.name),
            a.genre ? h("div", { class: "vx-sa-genre" }, a.genre) : null,
            h("div", { class: "vx-ev-meta" }, icon("people-outline", { size: 11, color: "var(--text-secondary)" }), h("span", {}, " " + a.att + " katılımcı"))),
          h("div", { class: "vx-sa-right" },
            h("span", { class: "vx-rank-ev" }, a.count + " etkinlik"),
            a.rev ? h("span", { class: "vx-sa-price" }, fmtTL(a.rev)) : null)));
      });

      // Yorum & puanlama (kör değerlendirme notu)
      body.append(chartHead("star-outline", "Yorum & Puanlama"));
      body.append(h("div", { class: "vx-reviewbox" },
        h("div", { class: "vx-scorebox" },
          h("div", { class: "vx-scoreval" }, avgRating ? avgRating.toFixed(1) : "—"),
          h("div", { class: "vx-scorelbl" }, "Ortalama Puan"),
          h("div", { class: "vx-scorestars" }, ...[1, 2, 3, 4, 5].map((i) => icon(i <= Math.round(avgRating) ? "star" : "star-outline", { size: 10, color: AMBER }))),
          h("div", { class: "vx-scorelbl" }, reviewCount + " değerlendirme")),
        h("div", { class: "vx-blindnote" }, icon("lock-closed-outline", { size: 16, color: "var(--text-muted)" }),
          h("span", {}, "Yorum metinleri ve puan dağılımı gizlidir; yalnızca ortalama puanınız gösterilir. Bu, sanatçı ve mekanların birbirine baskı yapmasını önler."))));

      // Genel özet (tüm zamanlar) — mevcut web istatistikleri korunur (venueStats)
      body.append(sect("Genel Özet (Tüm Zamanlar)", "bar-chart-outline", 0,
        h("div", { class: "stat-grid" },
          statCard("calendar-outline", s.eventCount, "Toplam Etkinlik"),
          statCard("time-outline", s.upcoming, "Yaklaşan"),
          statCard("people-outline", s.totalAttendance, "Toplam Katılım"),
          statCard("trending-up-outline", s.avgAttendance, "Ort. Katılım"),
          statCard("mic-outline", s.withArtist, "Sanatçılı"),
          statCard("sparkles-outline", s.vip, "VIP Etkinlik"))));
    }
    drawChips(); draw();
    root.append(chipRow, body);
  } catch (e) { clear(root); root.append(errBox()); }
}
function mCard(ic, val, label, color) {
  return h("div", { class: "vx-mcard", style: { borderColor: color + "44", background: `linear-gradient(160deg, ${color}1a, transparent 70%)` } },
    icon(ic, { size: 22, color }),
    h("div", { class: "vx-mval", style: { color } }, String(val)),
    h("div", { class: "vx-mlbl" }, label));
}
function smCard(ic, val, label, valColor) {
  return h("div", { class: "vx-smcard" },
    icon(ic, { size: 18, color: AMBER }),
    h("div", { class: "vx-smval", style: valColor ? { color: valColor } : null }, String(val)),
    h("div", { class: "vx-smlbl" }, label));
}
function statCard(ic, val, label) {
  return h("div", { class: "stat-card" }, icon(ic, { size: 22, color: AMBER }),
    h("div", { class: "stat-val" }, String(val)), h("div", { class: "stat-label" }, label));
}

// ══════════════ SANATÇI BUL (app FindArtistScreen) ══════════════
async function renderArtists(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  const uid = session.user.uid;
  let artists = [], groups = [], watched = new Set();
  try {
    const [as, gs, ws] = await Promise.all([
      listArtists().catch(() => []),
      listGroups().catch(() => []),
      watchedArtists(uid).catch(() => []),
    ]);
    artists = as; groups = gs.map((g) => ({ ...g, _group: true }));
    watched = new Set(ws.map((w) => w.artistId || w.id));
  } catch (_) {}
  clear(root);

  const lc = (s) => (s || "").toLocaleLowerCase("tr-TR");
  const myCity = (session.profile?.city || "").trim();
  let term = "", sortKey = "rating", typeF = null, genre = "Tümü", cityFilter = null;

  // Sanatçısı olan şehirler (mekanın şehri önce)
  const cities = [...new Set(artists.map((a) => (a.city || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
  if (myCity) cities.sort((a, b) => (lc(a) === lc(myCity) ? -1 : lc(b) === lc(myCity) ? 1 : 0));

  const listBox = h("div", {});
  const ratingOf = (a) => Number(a.avgRating) || 0;
  const attOf = (a) => Number(a.attendanceCount ?? a.totalAttendance) || 0;

  const draw = () => {
    clear(listBox);
    const t = lc(term.trim());
    const g = genre === "Tümü" ? null : genre;
    const cf = cityFilter ? lc(cityFilter) : null;
    let pool = typeF === "group" ? groups : typeF === "artist" ? artists : [...artists, ...groups];
    pool = pool.filter((x) => {
      const matchT = !t || lc(nameOf(x)).includes(t) || lc(x.city).includes(t);
      const matchG = !g || genreOf(x) === g;
      const matchC = !cf || lc((x.city || "").trim()) === cf;
      return matchT && matchG && matchC;
    });
    pool.sort((a, b) => sortKey === "rating" ? ratingOf(b) - ratingOf(a) : attOf(b) - attOf(a));
    if (!pool.length) {
      listBox.append(h("div", { class: "hs-empty" }, icon("search-outline", { size: 40, color: "var(--text-muted)" }),
        h("div", { class: "hs-empty-title" }, typeF === "group" ? "Grup bulunamadı" : "Sanatçı bulunamadı"),
        h("div", { class: "hs-empty-sub" }, cityFilter ? `${cityFilter} şehrinde sonuç yok — filtreyi değiştirmeyi dene.` : "Arama ya da filtreleri değiştirmeyi dene.")));
      return;
    }
    pool.forEach((x, i) => listBox.append(faCard(x, sortKey === "rating" && !x._group ? i : null)));
  };

  // Arama
  const sInput = h("input", { placeholder: "Sanatçı ara...", oninput: (e) => { term = e.target.value; draw(); } });
  const searchBar = h("div", { class: "vx-fa-search" }, icon("search-outline", { size: 16, color: "var(--text-muted)" }), sInput);

  // Sırala: Puan / Katılım
  const sortChips = [];
  const mkSort = (label, ic, key) => {
    const c = h("button", { class: "vx-chip" + (sortKey === key ? " on" : ""), onclick: () => {
      sortKey = key; sortChips.forEach((x) => x.el.classList.toggle("on", x.key === key)); draw();
    } }, icon(ic, { size: 13 }), h("span", {}, label));
    sortChips.push({ key, el: c });
    return c;
  };
  const sortRow = h("div", { class: "vx-sortrow" }, h("span", { class: "vx-sortlbl" }, "Sırala:"),
    mkSort("Puan", "star-outline", "rating"), mkSort("Katılım", "people-outline", "attendance"));

  // Tip + tür chip'leri (tek yatay ray)
  const typeChips = [];
  const mkType = (label, ic, key) => {
    const c = h("button", { class: "vx-chip soft", onclick: () => {
      typeF = typeF === key ? null : key;
      typeChips.forEach((x) => x.el.classList.toggle("on2", typeF === x.key));
      draw();
    } }, icon(ic, { size: 12 }), h("span", {}, label));
    typeChips.push({ key, el: c });
    return c;
  };
  const genreChips = [];
  const mkGenre = (gl) => {
    const c = h("button", { class: "vx-chip soft" + (gl === genre ? " on2" : ""), onclick: () => {
      genre = gl; genreChips.forEach((x) => x.el.classList.toggle("on2", x.g === gl)); draw();
    } }, gl);
    genreChips.push({ g: gl, el: c });
    return c;
  };
  const chipRow = h("div", { class: "vx-chiprow" },
    mkType("Sanatçılar", "mic", "artist"), mkType("Gruplar", "people", "group"),
    h("span", { class: "vx-chipdiv" }),
    ...GENRE_FILTERS.map(mkGenre));

  // Şehir chip'leri (koşullu)
  const cityChips = [];
  const mkCity = (label, val, ic) => {
    const c = h("button", { class: "vx-chip" + ((cityFilter || "") === (val || "") ? " on" : ""), onclick: () => {
      cityFilter = val; cityChips.forEach((x) => x.el.classList.toggle("on", (cityFilter || "") === (x.val || ""))); draw();
    } }, ic ? icon(ic, { size: 11 }) : null, h("span", {}, label));
    cityChips.push({ val, el: c });
    return c;
  };
  const cityRow = cities.length
    ? h("div", { class: "vx-chiprow" }, mkCity("Tüm Şehirler", null), ...cities.map((c) => mkCity(c, c, "location-outline")))
    : null;

  root.append(searchBar, sortRow, chipRow, cityRow, listBox);
  draw();

  // Sanatçı / grup kartı
  function faCard(x, rank) {
    const isG = !!x._group;
    const name = nameOf(x), g = genreOf(x);
    const [c1, c2] = gradFor(g);
    const rating = ratingOf(x);
    const medalColor = rank != null && rank < 3 && rating > 0 ? ["#FFD700", "#C0C0C0", "#CD7F32"][rank] : null;
    const isW = watched.has(x.id);
    const wBtn = isG ? null : h("button", { class: "vx-iconbtn" + (isW ? " on" : ""), title: "Gizli takip (yalnız siz görürsünüz)", onclick: async (e) => {
      e.stopPropagation(); wBtn.disabled = true;
      try {
        if (watched.has(x.id)) { await unwatchArtist(uid, x.id); watched.delete(x.id); wBtn.classList.remove("on"); wBtn.firstChild.setAttribute("name", "eye-outline"); toast("Takipten çıkarıldı"); }
        else { await watchArtist(uid, x); watched.add(x.id); wBtn.classList.add("on"); wBtn.firstChild.setAttribute("name", "eye"); toast("Gizli takibe alındı"); }
      } catch (_) { toast("İşlem başarısız", "err"); }
      wBtn.disabled = false;
    } }, icon(isW ? "eye" : "eye-outline", { size: 15 }));
    return h("div", { class: "vx-facard", style: isG ? null : { cursor: "pointer" },
      onclick: isG ? null : () => { location.hash = "#/venue/performans/" + x.id; } },
      h("div", { class: "vx-fa-left" },
        h("div", { class: "vx-fa-av", style: x.photoURL ? { backgroundImage: `url(${x.photoURL})`, color: "transparent" } : { background: `linear-gradient(135deg, ${c1}, ${c2})` } },
          name.trim().charAt(0).toLocaleUpperCase("tr-TR")),
        h("div", { class: "grow", style: { minWidth: "0" } },
          h("div", { class: "vx-fa-namerow" },
            h("span", { class: "vx-fa-name" }, name),
            isG ? h("span", { class: "vx-grpbadge" }, "Grup") : null),
          h("div", { class: "vx-fa-genre" }, g || "Müzik"),
          x.bio ? h("div", { class: "vx-fa-bio" }, x.bio) : null,
          h("div", { class: "vx-fa-metrics" },
            attOf(x) ? h("span", { class: "vx-fa-m ok" }, icon("trending-up", { size: 10, color: "var(--success)" }), " " + attOf(x) + " katılım") : null,
            h("span", { class: "vx-fa-m" }, icon("people-outline", { size: 10, color: "var(--text-secondary)" }), " " + (x.followerCount ?? 0) + " takipçi")))),
      h("div", { class: "vx-fa-right" },
        (!isG && rating > 0) ? h("div", { class: "vx-sa-rating" },
          medalColor ? icon(rank === 0 ? "trophy" : "medal", { size: 12, color: medalColor }) : null,
          icon("star", { size: 11, color: AMBER }), h("span", {}, rating.toFixed(1))) : null,
        priceOf(x) ? h("div", { class: "vx-sa-price" }, fmtTL(priceOf(x))) : null,
        h("div", { class: "vx-fa-btns" },
          wBtn,
          h("button", { class: "vx-iconbtn", title: "Uzun Dönem Anlaşma", onclick: (e) => { e.stopPropagation(); inviteModal(x, { mode: "longterm" }); } }, icon("repeat-outline", { size: 15 })),
          h("button", { class: "vx-invite", onclick: (e) => { e.stopPropagation(); inviteModal(x); } }, "Davet Et"))));
  }
}

// Davet modalı — Tek Etkinlik / Uzun Dönem geçişli (app invite modal; createInvitation + createResidency korunur)
function inviteModal(x, opts = {}) {
  const isG = !!x._group;
  const name = nameOf(x);
  let mode = opts.mode || "single";
  let months = 3; const days = new Set();
  const pic = photoPicker("Etkinlik fotoğrafı (opsiyonel)");

  const singleBox = h("div", {}, pic.node,
    h("div", { class: "frow" }, field({ label: "Tarih", id: "idate", type: "date" }), field({ label: "Saat", id: "itime", type: "time" })),
    field({ label: "Ücret (₺)", id: "ifee", type: "number", placeholder: "En az " + MIN_STAGE_FEE }),
    field({ label: "Mesaj (opsiyonel)", id: "imsg", placeholder: "…", multiline: true }));

  const monthRow = h("div", { class: "chip-row" }, ...[1, 3, 6].map((m) => {
    const c = h("button", { type: "button", class: "chip" + (m === 3 ? " on" : ""), onclick: () => { months = m; [...monthRow.children].forEach((z) => z.classList.remove("on")); c.classList.add("on"); } }, m + " ay");
    return c;
  }));
  const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const dayRow = h("div", { class: "chip-row" }, ...DAYS.map((d, i) => {
    const idx = i === 6 ? 0 : i + 1;
    const c = h("button", { type: "button", class: "chip", onclick: () => { if (days.has(idx)) { days.delete(idx); c.classList.remove("on"); } else { days.add(idx); c.classList.add("on"); } } }, d);
    return c;
  }));
  const longBox = h("div", { style: { display: "none" } },
    h("span", { class: "flabel" }, "Süre"), monthRow,
    h("span", { class: "flabel" }, "Sahne Günleri"), dayRow,
    field({ label: "Saat", id: "rtime", type: "time" }),
    field({ label: "Gece Başına Ücret (₺)", id: "rfee", type: "number", placeholder: "En az " + MIN_STAGE_FEE }));

  const singleT = h("button", { type: "button", class: "vx-vipbtn", onclick: () => setMode("single") }, h("span", {}, "Tek Etkinlik"));
  const longT = h("button", { type: "button", class: "vx-vipbtn", onclick: () => setMode("longterm") }, h("span", {}, "Uzun Dönem"));
  const setMode = (m2) => {
    mode = m2;
    singleT.classList.toggle("on", m2 === "single"); longT.classList.toggle("on", m2 === "longterm");
    singleBox.style.display = m2 === "single" ? "" : "none"; longBox.style.display = m2 === "longterm" ? "" : "none";
  };
  setMode(mode);

  modal({ title: "Davet Gönder — " + name,
    body: h("div", {}, h("div", { class: "vx-vipseg", style: { marginBottom: "12px" } }, singleT, longT), singleBox, longBox),
    actions: [
      { label: "Vazgeç", variant: "ghost", onClick: () => {} },
      { label: "Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
        if (mode === "single") {
          const f = { date: v("#idate"), time: v("#itime"), fee: v("#ifee"), message: v("#imsg") };
          if (!f.date || !f.time) return toast("Tarih ve saat gir", "err");
          if (!(Number(f.fee) >= MIN_STAGE_FEE)) return toast(`Ücret en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")}`, "err");
          try {
            if (!isG) {
              const dup = await findExistingInvitation(session.user.uid, x.id, f.date).catch(() => null);
              if (dup) return toast("Bu sanatçıya bu tarih için zaten teklif gönderilmiş", "err");
            }
            if (pic.getFile()) f.photoUrl = await uploadImage(pic.getFile(), session.user.uid);
            if (isG) await createGroupInvitation(session.profile, x, f);
            else await createInvitation(session.profile, x, f);
            toast("Davet gönderildi"); close();
          } catch (e) { toast("Gönderilemedi", "err"); }
        } else {
          if (!days.size) return toast("En az bir gün seç", "err");
          if (!v("#rtime")) return toast("Saat gir", "err");
          if (!(Number(v("#rfee")) >= MIN_STAGE_FEE)) return toast(`Ücret en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")}`, "err");
          try { await createResidency(session.profile, x, { months, days: [...days], time: v("#rtime"), fee: v("#rfee") }); toast("Anlaşma teklifi gönderildi"); close(); }
          catch (e) { toast("Gönderilemedi", "err"); }
        }
      } },
    ] });
}

// ══════════════ TAKİP ETTİĞİM SANATÇILAR (app VenueFollowingScreen — watchedArtists) ══════════════
async function renderFollowing(root, subEl) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  const uid = session.user.uid;
  let list = [];
  try { list = await watchedArtists(uid); } catch (e) { clear(root); root.append(errBox()); return; }
  clear(root);
  let count = list.length;
  const setSub = () => { if (subEl) subEl.textContent = `Yalnız siz görürsünüz · ${count} sanatçı`; };
  setSub();
  if (!list.length) {
    root.append(h("div", { class: "hs-empty" }, icon("people-outline", { size: 44, color: "var(--text-muted)" }),
      h("div", { class: "hs-empty-title" }, "Henüz sanatçı takip etmiyorsunuz."),
      h("div", { class: "hs-empty-sub" }, "Sanatçı Bul'da bir sanatçının kartındaki göz simgesine dokunarak takip edebilirsiniz. Takibiniz gizli kalır.")));
    return;
  }
  list.forEach((w) => root.append(wRow(w)));

  function wRow(w) {
    const name = w.artistName || "Sanatçı";
    const id = w.artistId || w.id;
    const row = h("div", { class: "vx-wrow", onclick: () => { location.hash = "#/venue/performans/" + id; } },
      h("div", { class: "vx-wrow-av" }, name.trim().charAt(0).toLocaleUpperCase("tr-TR")),
      h("div", { class: "grow", style: { minWidth: "0" } },
        h("div", { class: "vx-wname" }, name),
        w.genre ? h("div", { class: "vx-wsub" }, w.genre) : null),
      h("span", { class: "vx-perf" }, icon("stats-chart", { size: 14, color: AMBER }), h("span", {}, "Performans")),
      h("button", { class: "vx-x", title: "Takipten çıkar", onclick: (e) => {
        e.stopPropagation();
        modal({ title: "Takipten çıkarılsın mı?", body: h("p", { class: "muted" }, `${name} takip listenizden kaldırılacak.`), actions: [
          { label: "Vazgeç", variant: "ghost", onClick: () => {} },
          { label: "Takipten Çıkar", variant: "danger", keepOpen: true, onClick: async (close) => {
            try { await unwatchArtist(uid, id); row.remove(); count--; setSub(); close(); toast("Takipten çıkarıldı"); }
            catch (er) { toast("Takipten çıkarılamadı. Lütfen tekrar deneyin.", "err"); }
          } },
        ] });
      } }, icon("close-circle-outline", { size: 20, color: "var(--text-muted)" })));
    return row;
  }
}

// ══════════════ SAHNE PERFORMANSI (app ArtistPerformanceScreen) ══════════════
async function renderPerformance(root, artistId, titleEl) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  if (!artistId) { clear(root); root.append(empty("alert-circle-outline", "Sanatçı bulunamadı")); return; }
  try {
    const [u, evs, revs] = await Promise.all([
      userById(artistId).catch(() => null),
      eventsByArtist(artistId),
      artistReviews(artistId).catch(() => []),
    ]);
    if (titleEl && (u?.displayName || u?.name)) titleEl.textContent = u.displayName || u.name;
    const now = Date.now();
    const past = evs.map((e) => ({ ...e, _ms: msOfE(e) })).filter((e) => e._ms != null && e._ms <= now).sort((a, b) => b._ms - a._ms);
    const totalAtt = past.reduce((s, e) => s + (e.attendeeCount || 0), 0);
    const rated = revs.filter((r) => Number(r.rating) > 0);
    const avg = rated.length ? (rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(1) : null;
    clear(root);
    root.append(h("div", { class: "vx-pstats" },
      h("div", { class: "vx-pstat" }, h("div", { class: "vx-pstat-val" }, String(past.length)), h("div", { class: "vx-pstat-lbl" }, "Geçmiş Etkinlik")),
      h("div", { class: "vx-pstat mid" }, h("div", { class: "vx-pstat-val" }, totalAtt.toLocaleString("tr-TR")), h("div", { class: "vx-pstat-lbl" }, "Toplam Katılım")),
      h("div", { class: "vx-pstat" }, h("div", { class: "vx-pstat-val", style: { color: AMBER } }, avg ?? "—"),
        h("div", { class: "vx-pstat-lbl" }, "Ort. Puan" + (rated.length ? ` (${rated.length})` : "")))));
    if (!past.length) {
      root.append(h("div", { class: "hs-empty" }, icon("calendar-outline", { size: 44, color: "var(--text-muted)" }),
        h("div", { class: "hs-empty-title" }, "Bu sanatçının geçmiş etkinliği yok."),
        h("div", { class: "hs-empty-sub" }, "Sahne aldıkça katılım ve puanları burada görünür.")));
      return;
    }
    past.forEach((e) => root.append(h("div", { class: "vx-perow" },
      h("div", { class: "grow", style: { minWidth: "0" } },
        h("div", { class: "vx-pe-title" }, e.title || "Etkinlik"),
        h("div", { class: "vx-wsub" }, icon("business-outline", { size: 12, color: "var(--text-muted)" }),
          h("span", {}, " " + (e.venueName || "—") + (typeof e.date === "string" && e.date ? " · " + e.date : (e._ms ? " · " + fmtDate(e._ms) : ""))))),
      h("div", { class: "vx-pe-right" },
        icon("people", { size: 14, color: AMBER }),
        h("div", { class: "vx-pe-val" }, String(e.attendeeCount || 0)),
        h("div", { class: "vx-pe-lbl" }, "kişi")))));
  } catch (e) { clear(root); root.append(errBox()); }
}

// ══════════════ SANATÇI DEĞERLENDİR (app ArtistReviewScreen — reviews {uid}_{artistId}) ══════════════
async function renderReview(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  const uid = session.user.uid;
  let invs = [], mine = [];
  try {
    [invs, mine] = await Promise.all([venueAcceptedInvitations(uid), myReviews(uid).catch(() => [])]);
  } catch (e) { clear(root); root.append(errBox()); return; }

  const myMap = new Map(mine.filter((r) => r._col === "reviews" && (r.targetType ?? "artist") === "artist").map((r) => [r.targetId, Number(r.rating) || 0]));
  const now = Date.now();
  const byArtist = new Map();
  invs.forEach((i) => {
    if (!i.artistId) return; // serbest metin sanatçılar atlanır (app ile aynı)
    const ms = Date.parse(`${i.eventDate}T${i.eventTime || "00:00"}:00`);
    const cur = byArtist.get(i.artistId);
    if (!cur || ((isNaN(ms) ? 0 : ms) > (cur.lastMs || 0))) {
      byArtist.set(i.artistId, {
        artistId: i.artistId, artistName: i.artistName || "Sanatçı", genre: i.genre || "",
        lastMs: isNaN(ms) ? null : ms,
        lastLabel: [fmtDateTR(i.eventDate), i.eventTime].filter(Boolean).join(" · "),
      });
    }
  });
  const artists = [...byArtist.values()].map((a) => ({ ...a, myReview: myMap.get(a.artistId) ?? null, ratable: a.lastMs != null && a.lastMs <= now }));

  showList();

  function showList() {
    clear(root);
    if (!artists.length) {
      root.append(h("div", { class: "hs-empty" }, icon("mic-outline", { size: 44, color: "var(--text-muted)" }),
        h("div", { class: "hs-empty-sub" }, "Değerlendirilecek sanatçı yok. Kabul edilmiş bir etkinlik sonrası burada görünür.")));
      return;
    }
    artists.forEach((a) => root.append(wCard(a)));
  }

  function wCard(a) {
    let badgeEl;
    if (a.myReview != null) badgeEl = h("span", { class: "vx-wbadge done" }, icon("star", { size: 12, color: "var(--success)" }), h("span", {}, `${a.myReview} • Değerlendirdim`));
    else if (!a.ratable) badgeEl = h("span", { class: "vx-wbadge lock" }, icon("lock-closed", { size: 12, color: "var(--text-muted)" }), h("span", {}, "Etkinlik sonrası"));
    else badgeEl = h("span", { class: "vx-wbadge go" }, h("span", {}, "Değerlendir"), icon("arrow-forward", { size: 12, color: "#fff" }));
    return h("div", { class: "vx-wcard", onclick: () => {
      if (a.myReview != null) return;
      if (!a.ratable) { toast("Etkinlik tamamlandıktan sonra değerlendirebilirsin", "err"); return; }
      showForm(a);
    } },
      h("div", { class: "vx-fa-left" },
        h("div", { class: "vx-wav" }, (a.artistName || "?").trim().charAt(0).toLocaleUpperCase("tr-TR")),
        h("div", { class: "grow", style: { minWidth: "0" } },
          h("div", { class: "vx-wname" }, a.artistName),
          a.genre ? h("div", { class: "vx-wsub" }, a.genre) : null,
          a.lastLabel ? h("div", { class: "vx-wlast" }, "Son performans: " + a.lastLabel) : null)),
      badgeEl);
  }

  function showForm(a) {
    clear(root);
    const ratings = {};
    const overallVal = h("span", { class: "vx-overall-val" }, "—");
    const calc = () => {
      const vals = Object.values(ratings);
      overallVal.textContent = vals.length === REVIEW_CRITERIA.length ? (vals.reduce((s, x) => s + x, 0) / vals.length).toFixed(1) : "—";
    };
    const ta = h("textarea", { class: "review-ta", rows: 4, placeholder: "Deneyiminizi paylaşın..." });
    const submitB = h("button", { class: "vx-submit", onclick: async () => {
      if (Object.keys(ratings).length < REVIEW_CRITERIA.length) return toast("Tüm kriterleri puanla", "err");
      submitB.disabled = true; submitB.textContent = "Gönderiliyor...";
      try {
        const avg = Math.round(Object.values(ratings).reduce((s, x) => s + x, 0) / REVIEW_CRITERIA.length * 10) / 10;
        await submitVenueArtistReview(uid, session.profile?.displayName || "", { id: a.artistId, artistName: a.artistName },
          { rating: avg, ratings, comment: ta.value.trim() });
        a.myReview = avg;
        toast("Değerlendirmen kaydedildi, teşekkürler");
        showList();
      } catch (e) {
        toast("Gönderilemedi", "err");
        submitB.disabled = false; submitB.textContent = "Değerlendirmeyi Gönder";
      }
    } }, "Değerlendirmeyi Gönder");

    function critCard(c) {
      const starRow = h("div", { class: "vx-starrow" });
      const paint = () => {
        clear(starRow);
        [1, 2, 3, 4, 5].forEach((i) => starRow.append(h("button", { class: "vx-starbtn", onclick: () => { ratings[c.key] = i; paint(); calc(); } },
          icon(i <= (ratings[c.key] || 0) ? "star" : "star-outline", { size: 28, color: i <= (ratings[c.key] || 0) ? AMBER : "var(--text-muted)" }))));
        if (ratings[c.key]) starRow.append(h("span", { class: "vx-ratelbl" }, `${ratings[c.key]}/5`));
      };
      paint();
      return h("div", { class: "vx-critcard" },
        h("div", { class: "vx-crit-head" }, icon(c.icon, { size: 16, color: AMBER }), h("span", { class: "vx-wname" }, c.label)),
        h("div", { class: "vx-crit-desc" }, c.desc),
        starRow);
    }

    root.append(
      h("button", { class: "vx-back", onclick: showList }, icon("chevron-back", { size: 22, color: "var(--text-secondary)" })),
      h("div", { class: "vx-fa-left", style: { margin: "4px 0 16px" } },
        h("div", { class: "vx-wav", style: { width: "48px", height: "48px", fontSize: "18px" } }, (a.artistName || "?").trim().charAt(0).toLocaleUpperCase("tr-TR")),
        h("div", {},
          h("div", { style: { fontSize: "18px", fontWeight: "700" } }, a.artistName),
          h("div", { class: "vx-wsub" }, [a.genre, a.lastLabel].filter(Boolean).join(" • ")))),
      h("div", { class: "vx-overall" },
        h("span", { class: "vx-wname" }, "Genel Puan"),
        h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, icon("star", { size: 18, color: AMBER }), overallVal)),
      ...REVIEW_CRITERIA.map(critCard),
      h("div", { class: "vx-wname", style: { margin: "4px 0 8px" } }, "Yorum (isteğe bağlı)"),
      ta, submitB);
  }
}

// ── ortak ──
function sect(title, ic, count, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head row-between" },
      h("h2", { class: "sect-title" }, icon(ic, { size: 16 }), " " + title),
      count ? h("span", { class: "count-pill" }, count) : null),
    ...kids);
}
function fail(msg, text) { msg.textContent = text; msg.className = "msg err"; }
function errBox() { return empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip yenile."); }
function v(sel) { return (document.querySelector(sel)?.value || "").trim(); }
