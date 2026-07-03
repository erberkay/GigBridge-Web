// Sanatçı paneli — app ArtistNavigator birebir: Ana Sayfa, Top 10, Mekanlar (değerlendir),
// Mesajlar, Profilim + alt ekranlar: Sahnelerim (takvim), Aldığım Yorumlar, Bildirimler,
// Teklif Detayı (modal). App'in artist ekranlarındaki bölüm sırası/etiketleri korunur.
import { session, logout, refreshProfile } from "../store.js";
import {
  getUser, userById, saveProfile, uploadImage, submitReport,
  artistReviews, listRealArtists, listenNotifications, markNotifRead, deleteNotif,
  listenArtistOffers, listenArtistAccepted, listenArtistResidencies, respondToOffer,
  setResidencyStatus, pushAppNotification, artistAcceptedInvitations,
  artistVenueReviewsGiven, submitArtistVenueReview, fetchArtistRatings, listGroups,
} from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, field, photoPicker, modal, fmtDate, ROLE } from "../ui.js";
import { messagesView } from "./messages.js";

const A = ROLE.artist; // #A855F7
const MIN_STAGE_FEE = 3500;        // iş kuralı: altında sahne alınamaz
const MAX_ARTIST_PRICE = 1000000;  // sanatçı ücreti üst sınırı
const GENRES = ["Electronic", "House", "Techno", "Jazz", "Pop", "Rock", "Akustik", "Hip-Hop", "R&B", "Klasik"];

// 81 il — şehir alanında aranabilir öneri listesi (app SearchablePickerModal karşılığı)
const PROVINCES = ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis", "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa", "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak"];

const NAV = [
  { key: "home",     label: "Ana Sayfa", icon: "home-outline",          href: "#/artist" },
  { key: "top10",    label: "Top 10",    icon: "trophy-outline",        href: "#/artist/top10" },
  { key: "mekanlar", label: "Mekanlar",  icon: "star-outline",          href: "#/artist/mekanlar" },
  { key: "mesaj",    label: "Mesajlar",  icon: "chatbubbles-outline",   href: "#/artist/mesaj" },
  { key: "profil",   label: "Profilim",  icon: "person-circle-outline", href: "#/artist/profil" },
];
const TITLES = {
  home: "Sanatçı Paneli", top10: "Top 10", mekanlar: "Mekan Değerlendir", mesaj: "Mesajlar",
  profil: "Profilim", sahnelerim: "Sahnelerim", yorumlar: "Aldığım Yorumlar", bildirimler: "Bildirimler",
};

// ── tarih / para yardımcıları (app utils birebir) ──
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAY_LABELS_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const WEEK_HEADER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseTL(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}
const tl = (n) => "₺" + Number(n).toLocaleString("tr-TR");

function isoToTR(iso) {
  if (typeof iso !== "string") return "";
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const mi = parseInt(m[2], 10) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${parseInt(m[3], 10)} ${MONTHS_TR[mi]} ${parseInt(m[1], 10)}`;
}
function parseTRDate(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})$/);
  if (!m) return null;
  const mi = MONTHS_TR.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (mi < 0) return null;
  return new Date(parseInt(m[3], 10), mi, parseInt(m[1], 10)).getTime();
}
// ISO ya da TR tarihi "YYYY-MM-DD" anahtarına normalize et (takvim işaretleri)
function toISOKey(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  const ms = parseTRDate(input);
  return ms != null ? toISODate(new Date(ms)) : null;
}
// Davet dokümanından karşılaştırılabilir millis (eventAt → ISO/TR string → null)
function resolveMs(x) {
  const at = x?.eventAt;
  if (at?.toMillis) return at.toMillis();
  const d = x?.eventDate ?? x?.date;
  if (typeof d === "string") {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getTime();
    const tr = parseTRDate(d);
    if (tr != null) return tr;
  }
  return null;
}
const dotISO = (iso) => (iso || "").split("-").reverse().join(".");
function formatDays(days) {
  return [...(days || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_LABELS_TR[d]).join(", ");
}
// Rezidansın ay penceresine düşen tekrarları (ISO listesi) — app expandOccurrences birebir
function expandOccurrences(r, windowStart, windowEnd) {
  const out = [];
  const start = new Date(`${r.startDate}T00:00`);
  const end = new Date(`${r.endDate}T23:59`);
  const from = start > windowStart ? start : windowStart;
  const to = end < windowEnd ? end : windowEnd;
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  while (cur <= to) {
    if ((r.daysOfWeek || []).includes(cur.getDay())) out.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
// Puanlama etkinlikten ~30 dk sonra açılır (app eventTiming birebir)
const RATABLE_AFTER_START_MS = 30 * 60 * 1000;
function eventStartMs(eventDate, eventTime) {
  if (!eventDate) return null;
  let ms;
  if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const t = eventTime && /^\d{1,2}:\d{2}$/.test(eventTime) ? eventTime : "00:00";
    ms = new Date(`${eventDate}T${t}`).getTime();
  } else ms = new Date(eventDate).getTime();
  return isNaN(ms) ? null : ms;
}
function isRatable(eventDate, eventTime) {
  const start = eventStartMs(eventDate, eventTime);
  if (start == null) return true;
  return Date.now() >= start + RATABLE_AFTER_START_MS;
}
function ratableAtLabel(eventDate, eventTime) {
  const start = eventStartMs(eventDate, eventTime);
  if (start == null) return "";
  return new Date(start + RATABLE_AFTER_START_MS).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
// Üyelik kıdemi rozetleri (app utils/memberBadge birebir)
function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") { const t = Date.parse(v); return isNaN(t) ? null : t; }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return null;
}
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
function membershipYears(createdAt) { const ms = toMs(createdAt); return ms == null ? 0 : Math.max(0, Math.floor((Date.now() - ms) / MS_PER_YEAR)); }
function membershipMonths(createdAt) { const ms = toMs(createdAt); return ms == null ? 0 : Math.max(0, Math.floor((Date.now() - ms) / (MS_PER_YEAR / 12))); }
const BADGE_TIERS = [
  { tier: 10, label: "10 Yıllık Üye", icon: "trophy", color: "#F5C518" },
  { tier: 5, label: "5 Yıllık Üye", icon: "medal", color: "#C0C4CC" },
  { tier: 1, label: "1 Yıllık Üye", icon: "ribbon", color: "#CD7F32" },
];
function memberBadgeFor(createdAt) { const y = membershipYears(createdAt); return BADGE_TIERS.find((t) => y >= t.tier) ?? null; }
function membershipLabel(createdAt) {
  if (toMs(createdAt) == null) return "GigBridge üyesi";
  const y = membershipYears(createdAt);
  if (y >= 1) return `GigBridge üyesi · ${y} yıldır`;
  const m = membershipMonths(createdAt);
  return m >= 1 ? `GigBridge üyesi · ${m} aydır` : "GigBridge üyesi · yeni";
}

// ── ortak küçük yardımcılar ──
const go = (hash) => { location.hash = hash; };
const v = (sel) => (document.querySelector(sel)?.value || "").trim();
const me = () => ({ uid: session.user.uid, name: session.profile?.displayName || "Sanatçı" });
const kFmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

// App bölüm başlığı (mor accent bar) — customer'daki hs-secthead sınıfları yeniden kullanılır
function secthead(title, right) {
  // App sectionHeader: başlık + rozet/bağlantı yan yana (gap 8), sola hizalı
  return h("div", { class: "hs-secthead ax-sect" },
    h("div", { class: "hs-accent" }),
    h("div", { class: "hs-secttitle" }, title),
    right || null);
}
function sect(title, ic, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head" }, h("h2", { class: "sect-title" }, icon(ic, { size: 15 }), " " + title)),
    ...kids);
}
function emptyRow(ic, text) {
  return h("div", { class: "ax-emptyrow" }, icon(ic, { size: 20, color: "var(--text-muted)" }), h("span", {}, text));
}
function errBox() { return empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip yenile."); }

function tabFromHash() { const p = (location.hash || "").split("?")[0].split("/"); return p[2] || "home"; }
const navKeyFor = (t) => (["sahnelerim", "yorumlar", "bildirimler"].includes(t) ? "home" : t);

// ══════════════ SAYFA ══════════════
export function artistPage() {
  const tab = tabFromHash();
  if (tab === "home") return homePage();
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": A } },
    topbar(TITLES[tab] || "Sanatçı Paneli", { subtitle: session.profile?.displayName || "", color: A,
      right: h("button", { class: "icon-btn", onclick: logout, title: "Çıkış" }, icon("log-out-outline", { size: 20 })) }),
    content,
    bottomnav(NAV, navKeyFor(tab), A));
  renderTab(tab, content);
  return page;
}

async function renderTab(tab, root) {
  if (tab === "top10") return renderTop10(root);
  if (tab === "mekanlar") return renderVenueReview(root);
  if (tab === "mesaj") { clear(root); return messagesView(root, A); }
  if (tab === "profil") return renderProfile(root);
  if (tab === "sahnelerim") return renderStages(root);
  if (tab === "yorumlar") return renderReceivedReviews(root);
  if (tab === "bildirimler") return renderNotifs(root);
  clear(root);
  root.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor."));
}

// ══════════════ ANA SAYFA (app Artist HomeScreen birebir) ══════════════
function statBox(value, sub, color) {
  const val = h("div", { class: "ax-stat-val", style: { color } }, value);
  return { box: h("div", { class: "ax-stat" }, val, h("div", { class: "ax-stat-sub" }, sub)), set: (x) => { val.textContent = x; } };
}

function homePage() {
  const p = session.profile || {};
  const name = p.displayName || "Sanatçı";
  const st = {
    month: statBox("0", "Performans", A),
    rating: statBox("—", "★", "var(--amber)"),
    earn: statBox("—", "Toplam", "var(--success)"),
    foll: statBox("—", "Kişi", "var(--cyan)"),
  };
  const header = h("header", { class: "topbar ax-header", style: { "--role": A } },
    h("div", { class: "ax-glow" }),
    h("div", { class: "ax-htop" },
      h("div", {},
        h("div", { class: "ax-greet" }, "MERHABA"),
        h("div", { class: "ax-name" }, name)),
      h("div", { class: "ax-hactions" },
        h("button", { class: "ax-notif", title: "Bildirimler", onclick: () => go("#/artist/bildirimler") }, icon("notifications-outline", { size: 20 })),
        h("button", { class: "ax-avatarbtn", title: "Profilim", onclick: () => go("#/artist/profil") },
          p.photoURL
            ? h("div", { class: "ax-avatarimg", style: { backgroundImage: `url(${p.photoURL})` } })
            : h("div", { class: "ax-avatar" }, name.trim().charAt(0).toUpperCase() || "?")))),
    h("div", { class: "ax-stats" }, st.month.box, st.rating.box, st.earn.box, st.foll.box));
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": A } }, header, content, bottomnav(NAV, "home", A));
  renderHome(content, st);
  return page;
}

async function renderHome(root, st) {
  const uid = session.user.uid;
  clear(root);

  // Bölüm kutuları — app sırası: Sahnelerim → Gelen Teklifler → Yaklaşan Performanslar → Aldığınız Puanlar
  const stagesBox = h("div", {}, h("div", { class: "loading" }, spinner()));
  const offersBox = h("div", {}, h("div", { class: "loading" }, spinner()));
  const gigsBox = h("div", {}, emptyRow("calendar-outline", "Onaylı performans yok"));
  const countBadge = h("span", { class: "ax-countbadge", style: { display: "none" } }, "0");
  const rateText = h("span", {}, "—");
  const rateBox = h("div", { class: "ax-ratecard", onclick: () => go("#/artist/yorumlar") },
    h("div", { class: "ax-ratehead" },
      h("div", { class: "ax-ratestars" }, icon("star", { size: 16, color: "var(--amber)" }), rateText),
      icon("chevron-forward", { size: 16, color: "var(--text-muted)" })),
    h("div", { class: "ax-ratecomment" }, "Sana yapılan tüm değerlendirme ve yorumları (mekanlar ve dinleyiciler) görmek için dokun."));

  root.append(
    secthead("Sahnelerim", h("button", { class: "ax-callink", onclick: () => go("#/artist/sahnelerim") },
      icon("calendar", { size: 14, color: A }), h("span", {}, "Takvim"))),
    stagesBox,
    secthead("Gelen Teklifler", countBadge),
    offersBox,
    secthead("Yaklaşan Performanslar"),
    gigsBox,
    secthead("Aldığınız Puanlar"),
    rateBox,
  );

  // Takipçi sayısı (users dokümanındaki denorm alan)
  getUser(uid).then((u) => st.foll.set(kFmt(u?.followerCount ?? 0))).catch(() => {});

  // Puan + değerlendirme sayısı CANLI reviews'tan (targetId==uid, targetType artist)
  artistReviews(uid).then((list) => {
    const rs = list.map((r) => r.rating ?? 0).filter((x) => x > 0);
    const avg = rs.length ? (rs.reduce((s, x) => s + x, 0) / rs.length).toFixed(1) : "—";
    st.rating.set(avg);
    rateText.textContent = `${avg}${rs.length ? ` · ${rs.length} değerlendirme` : ""}`;
  }).catch(() => {});

  // Sahnelerim — rezidanslar (pending çip + aktif kartlar, ilk 2)
  const unsubRes = listenArtistResidencies(uid, (residencies) => {
    if (!root.isConnected) { try { unsubRes(); } catch (_) {} return; }
    clear(stagesBox);
    const pending = residencies.filter((r) => r.status === "pending");
    const active = residencies.filter((r) => r.status === "active");
    if (pending.length) {
      stagesBox.append(h("div", { class: "ax-chip-pending", onclick: () => go("#/artist/sahnelerim") },
        icon("time-outline", { size: 14, color: "var(--amber)" }),
        h("span", { class: "grow" }, `${pending.length} yeni sahne anlaşması teklifi — incele`),
        icon("chevron-forward", { size: 14, color: "var(--amber)" })));
    }
    if (!active.length && !pending.length) {
      stagesBox.append(emptyRow("mic-outline", "Aktif sahne anlaşman yok"));
    } else {
      active.slice(0, 2).forEach((r) => stagesBox.append(
        h("div", { class: "ax-stagecard", onclick: () => go("#/artist/sahnelerim") },
          h("div", { class: "ax-stageicon" }, icon("business", { size: 18, color: A })),
          h("div", { class: "grow" },
            h("div", { class: "ax-stagevenue" }, r.venueName),
            h("div", { class: "ax-stagemeta" }, `${formatDays(r.daysOfWeek)} · ${r.time} · bitiş ${dotISO(r.endDate)}`)),
          h("span", { class: "ax-pill-ok" }, "Aktif"))));
    }
  });

  // Gelen Teklifler — canlı
  const unsubOff = listenArtistOffers(uid, (offers) => {
    if (!root.isConnected) { try { unsubOff(); } catch (_) {} return; }
    clear(offersBox);
    countBadge.style.display = offers.length ? "" : "none";
    countBadge.textContent = String(offers.length);
    if (!offers.length) { offersBox.append(emptyRow("mail-open-outline", "Bekleyen teklif yok")); return; }
    offers.forEach((off) => offersBox.append(offerCard(off)));
  });

  // Yaklaşan performanslar + toplam kazanç + aylık performans (kabul edilmiş davetler)
  const unsubAcc = listenArtistAccepted(uid, (docs) => {
    if (!root.isConnected) { try { unsubAcc(); } catch (_) {} return; }
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const gigs = docs.map((d) => ({
      venue: d.venueName ?? "—",
      date: isoToTR(d.eventDate ?? d.date) || "—",
      time: d.eventTime ?? d.time ?? "",
      fee: d.fee != null ? tl(parseTL(d.fee) ?? 0) : "Belirtilmemiş",
      _ms: resolveMs(d),
    })).filter((g) => g._ms == null || g._ms >= todayStart.getTime());
    clear(gigsBox);
    if (!gigs.length) gigsBox.append(emptyRow("calendar-outline", "Onaylı performans yok"));
    else gigs.forEach((g) => gigsBox.append(h("div", { class: "ax-gig" },
      h("div", { class: "ax-dot" }),
      h("div", { class: "grow" },
        h("div", { class: "ax-offer-venue", style: { fontWeight: "600" } }, g.venue),
        h("div", { class: "ax-daterow", style: { marginBottom: "0" } }, icon("calendar-outline", { size: 12, color: "var(--text-secondary)" }), h("span", {}, `${g.date} • ${g.time}`))),
      h("span", { class: "ax-gig-fee" }, g.fee))));

    const total = docs.reduce((s, d) => s + (parseTL(d.fee) ?? 0), 0);
    st.earn.set(total >= 1000 ? `₺${(total / 1000).toFixed(1)}K` : total > 0 ? tl(total) : "₺0");

    // Bu ay onaylanan performans sayısı (updatedAt >= ay başı)
    const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
    st.month.set(String(docs.filter((d) => (d.updatedAt?.toMillis?.() ?? 0) >= som.getTime()).length));
  });
}

// Teklif kartı — sol: mekan/tarih/mesaj/tür; sağ: ücret + Kabul/Reddet (app offerCard birebir)
function offerCard(off) {
  return h("div", { class: "ax-offer", onclick: () => offerDetailModal(off) },
    h("div", { class: "ax-offer-left" },
      h("div", { class: "ax-offer-venue" }, off.venue),
      h("div", { class: "ax-daterow" }, icon("calendar-outline", { size: 12, color: "var(--text-secondary)" }), h("span", {}, `${off.date} • ${off.time}`)),
      off.message ? h("div", { class: "ax-offer-msg" }, off.message) : null,
      h("span", { class: "ax-genre" }, off.genre)),
    h("div", { class: "ax-offer-right" },
      h("span", { class: "ax-fee" }, off.fee),
      h("div", { class: "ax-offer-actions" },
        h("button", { class: "ax-btn-accept", onclick: (e) => { e.stopPropagation(); confirmOffer(off, "accept"); } }, "Kabul"),
        h("button", { class: "ax-btn-reject", onclick: (e) => { e.stopPropagation(); confirmOffer(off, "reject"); } }, "Reddet"))));
}

// Kabul/Ret onayı (app Alert.alert onayı karşılığı) — kabul app'teki gibi etkinlik bağlar/yaratır
function confirmOffer(off, action) {
  const label = action === "accept" ? "Kabul" : "Reddet";
  modal({
    title: `Teklifi ${label}`,
    body: h("p", { class: "muted" }, `${off.venue} teklifini ${action === "accept" ? "kabul edeceksin" : "reddedeceksin"}. Emin misin?`),
    actions: [
      { label: "İptal", variant: "ghost", onClick: () => {} },
      { label, variant: action === "reject" ? "danger" : "primary", keepOpen: true, onClick: async (close) => {
        try {
          await respondToOffer(off, action, me());
          close();
          toast(action === "accept"
            ? `${off.venue} teklifini kabul ettin — performans takvime eklendi`
            : `${off.venue} teklifi reddedildi`);
        } catch (_) { toast("İşlem gerçekleştirilemedi. (ERR-AHOME-001)", "err"); }
      } },
    ],
  });
}

// ── Teklif Detayı (app OfferDetailScreen — modal olarak) ──
function offerDetailModal(off) {
  const mapSlot = h("div", {});
  const body = h("div", {},
    h("div", { class: "ax-hero" },
      icon("business", { size: 32, color: "#fff" }),
      h("div", { class: "ax-hero-venue" }, off.venue),
      h("div", { class: "ax-hero-genre" }, off.genre)),
    mapSlot,
    h("div", { class: "ax-drows" },
      drow("calendar-outline", "Tarih", off.date),
      drow("time-outline", "Saat", off.time),
      drow("cash-outline", "Ücret", off.fee, true)),
    h("div", { class: "ax-drows" },
      h("div", {},
        h("div", { class: "ax-msglabel" }, "Mekan Mesajı"),
        h("div", { class: "ax-msgbody" }, off.message || "Mekan herhangi bir mesaj eklememiş."))));

  // Mekanın pinlediği konum varsa "Haritada Göster" (web: harita bağlantısı)
  if (off.venueId) {
    userById(off.venueId).then((u) => {
      const loc = u?.location;
      if (loc && loc.lat != null && mapSlot.isConnected) {
        mapSlot.append(h("a", { class: "ax-mapbtn", target: "_blank", rel: "noopener",
          href: `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` },
          icon("location", { size: 16, color: A }), h("span", {}, "Mekan Konumu — Haritada Göster")));
      }
    }).catch(() => {});
  }

  modal({ title: "Teklif Detayı", body, actions: [
    { label: "Reddet", variant: "danger", ic: "close-circle", keepOpen: true, onClick: (close) => act("reject", close) },
    { label: "Kabul Et", ic: "checkmark-circle", keepOpen: true, onClick: (close) => act("accept", close) },
  ] });

  async function act(action, close) {
    try {
      await respondToOffer(off, action, me());
      close();
      toast(action === "accept"
        ? `${off.venue} teklifini kabul ettin — performans takvime eklendi`
        : `${off.venue} teklifi reddedildi`);
    } catch (_) { toast("İşlem tamamlanamadı. İnternet bağlantını kontrol et. (ERR-OFFERDETAIL-001)", "err"); }
  }
}
function drow(ic, label, value, hl) {
  return h("div", { class: "ax-drow" }, icon(ic, { size: 18, color: "var(--text-muted)" }),
    h("span", { class: "ax-drow-label" }, label), h("span", { class: "ax-drow-val" + (hl ? " hl" : "") }, value));
}

// ══════════════ SAHNELERİM (app StagesScreen birebir) ══════════════
async function renderStages(root) {
  clear(root);
  const uid = session.user.uid;
  const name = session.profile?.displayName || "Sanatçı";

  let residencies = [], gigs = [], processing = false;
  let monthDate = new Date(); monthDate.setDate(1); monthDate.setHours(0, 0, 0, 0);
  let selectedISO = toISODate(new Date());

  const pendWrap = h("div", {});
  const activeBox = h("div", {}, h("div", { class: "loading" }, spinner()));
  const calBox = h("div", {});
  const dayBox = h("div", { class: "ax-daydetail" });

  root.append(
    h("p", { class: "muted small mb6" }, "Uzun dönem anlaşmaların ve sahne takvimin"),
    pendWrap,
    sect("Aktif Anlaşmalar", "mic-outline", activeBox),
    sect("Sahne Takvimi", "calendar-outline", calBox, dayBox),
  );

  const todayISO = toISODate(new Date());

  function entriesByDay() {
    const map = new Map();
    const push = (iso, e) => { const l = map.get(iso) ?? []; l.push(e); map.set(iso, l); };
    const monthEnd = new Date(monthDate); monthEnd.setMonth(monthEnd.getMonth() + 1); monthEnd.setDate(0); monthEnd.setHours(23, 59, 59, 999);
    residencies.filter((r) => r.status === "active").forEach((r) => {
      expandOccurrences(r, monthDate, monthEnd).forEach((iso) => push(iso, { venue: r.venueName, time: r.time, type: "residency" }));
    });
    gigs.forEach((g) => {
      const d = new Date(`${g.dateISO}T00:00`);
      if (d >= monthDate && d <= monthEnd) push(g.dateISO, { venue: g.venue, time: g.time, type: "gig" });
    });
    return map;
  }

  function drawCal() {
    const entries = entriesByDay();
    clear(calBox);
    const monthEnd = new Date(monthDate); monthEnd.setMonth(monthEnd.getMonth() + 1); monthEnd.setDate(0);
    const firstDow = (monthDate.getDay() + 6) % 7; // Pzt=0
    const cells = Array(firstDow).fill(null);
    for (let d = 1; d <= monthEnd.getDate(); d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const grid = h("div", { class: "ax-cal-grid" }, ...cells.map((day, i) => {
      if (day == null) return h("div", { class: "ax-cal-cell", key: i });
      const dd = new Date(monthDate); dd.setDate(day);
      const iso = toISODate(dd);
      const cls = "ax-cal-day" + (iso === selectedISO ? " sel" : iso === todayISO ? " today" : "");
      return h("div", { class: "ax-cal-cell" },
        h("button", { class: cls, onclick: () => { selectedISO = iso; drawCal(); } },
          String(day), entries.has(iso) ? h("span", { class: "ax-cal-dot" }) : null));
    }));
    calBox.append(h("div", { class: "ax-cal" },
      h("div", { class: "ax-cal-head" },
        h("button", { class: "ax-cal-nav", onclick: () => shift(-1) }, icon("chevron-back", { size: 20 })),
        h("div", { class: "ax-cal-month" }, `${MONTHS_TR[monthDate.getMonth()]} ${monthDate.getFullYear()}`),
        h("button", { class: "ax-cal-nav", onclick: () => shift(1) }, icon("chevron-forward", { size: 20 }))),
      h("div", { class: "ax-cal-week" }, ...WEEK_HEADER.map((w) => h("span", {}, w))),
      grid));

    // Seçili gün detayı
    clear(dayBox);
    dayBox.append(h("div", { class: "ax-daytitle" }, dotISO(selectedISO)));
    const list = entries.get(selectedISO) ?? [];
    if (!list.length) dayBox.append(h("div", { class: "ax-dayempty" }, "Bu gün için planlanmış sahne yok."));
    else list.forEach((e) => dayBox.append(h("div", { class: "ax-dayentry" },
      icon(e.type === "residency" ? "repeat" : "musical-notes", { size: 14, color: e.type === "residency" ? A : "var(--amber)" }),
      h("span", {}, `${e.venue}${e.time ? ` · ${e.time}` : ""} · ${e.type === "residency" ? "Uzun dönem" : "Etkinlik"}`))));
  }
  function shift(delta) { const d = new Date(monthDate); d.setMonth(d.getMonth() + delta); monthDate = d; drawCal(); }

  function drawLists() {
    const pending = residencies.filter((r) => r.status === "pending");
    const active = residencies.filter((r) => r.status === "active");

    clear(pendWrap);
    if (pending.length) {
      pendWrap.append(sect("Bekleyen Anlaşma Teklifleri", "time-outline",
        ...pending.map((r) => h("div", { class: "ax-pend" },
          h("div", { class: "ax-cardtop" },
            h("div", { class: "ax-stageicon amber" }, icon("business", { size: 18, color: "var(--amber)" })),
            h("div", { class: "grow" },
              h("div", { class: "ax-stagevenue" }, r.venueName),
              h("div", { class: "ax-stagemeta" }, `${formatDays(r.daysOfWeek)} · ${r.time}${r.fee ? ` · ${tl(r.fee)}/gece` : ""}`),
              h("div", { class: "ax-period" }, `${dotISO(r.startDate)} – ${dotISO(r.endDate)}`))),
          h("div", { class: "ax-cardactions" },
            h("button", { class: "ax-rejbtn", disabled: processing, onclick: () => respond(r, "rejected") }, "Reddet"),
            h("button", { class: "ax-accbtn", disabled: processing, onclick: () => respond(r, "active") }, "Kabul Et"))))));
    }

    clear(activeBox);
    if (!active.length) {
      activeBox.append(empty("mic-outline", "Aktif sahne anlaşman yok", "Mekanlar uzun dönem teklif gönderdiğinde burada görünür."));
    } else {
      active.forEach((r) => activeBox.append(h("div", { class: "ax-stagecard", style: { cursor: "default" } },
        h("div", { class: "ax-stageicon" }, icon("business", { size: 18, color: A })),
        h("div", { class: "grow" },
          h("div", { class: "ax-stagevenue" }, r.venueName),
          h("div", { class: "ax-stagemeta" }, `${formatDays(r.daysOfWeek)} · ${r.time}${r.fee ? ` · ${tl(r.fee)}/gece` : ""}`),
          h("div", { class: "ax-period" }, `bitiş ${dotISO(r.endDate)}`)),
        h("button", { class: "ax-cancelbtn", disabled: processing, onclick: () => cancelRes(r) }, "İptal"))));
    }
  }

  // Kabul/Ret — setResidencyStatus + mekana bildirim (best-effort, app respond birebir)
  async function respond(r, action) {
    processing = true; drawLists();
    try {
      await setResidencyStatus(r.id, action, uid);
      pushAppNotification({
        toUserId: r.venueId, fromUserId: uid, fromName: name, type: "residency_update",
        title: action === "active" ? "Anlaşma Kabul Edildi 🎉" : "Anlaşma Reddedildi",
        body: action === "active"
          ? `${name}, uzun dönem sahne anlaşmanızı kabul etti (${formatDays(r.daysOfWeek)} · ${r.time}).`
          : `${name}, uzun dönem sahne anlaşma teklifinizi reddetti.`,
      }).catch(() => {});
      if (action === "active") toast("Anlaşma aktif — sahne takvimine eklendi");
      else toast("Teklif reddedildi");
    } catch (_) { toast("İşlem tamamlanamadı. İnternet bağlantını kontrol et.", "err"); }
    finally { processing = false; drawLists(); }
  }

  function cancelRes(r) {
    modal({
      title: "Anlaşmayı İptal Et",
      body: h("p", { class: "muted" }, `${r.venueName} ile uzun dönem anlaşman iptal edilecek. Emin misin?`),
      actions: [
        { label: "Vazgeç", variant: "ghost", onClick: () => {} },
        { label: "İptal Et", variant: "danger", keepOpen: true, onClick: async (close) => {
          try {
            await setResidencyStatus(r.id, "cancelled", uid);
            pushAppNotification({
              toUserId: r.venueId, fromUserId: uid, fromName: name, type: "residency_update",
              title: "Anlaşma İptal Edildi",
              body: `${name}, uzun dönem sahne anlaşmasını iptal etti (${formatDays(r.daysOfWeek)} · ${r.time}).`,
            }).catch(() => {});
            close(); toast("Anlaşma iptal edildi");
          } catch (_) { toast("İptal edilemedi. İnternet bağlantını kontrol et.", "err"); }
        } },
      ],
    });
  }

  const unsub1 = listenArtistResidencies(uid, (list) => {
    if (!root.isConnected) { try { unsub1(); } catch (_) {} return; }
    residencies = list; drawLists(); drawCal();
  });
  const unsub2 = listenArtistAccepted(uid, (docs) => {
    if (!root.isConnected) { try { unsub2(); } catch (_) {} return; }
    gigs = docs
      .map((d) => ({ dateISO: toISOKey(d.eventDate), venue: d.venueName ?? "Mekan", time: d.eventTime ?? "" }))
      .filter((g) => g.dateISO != null);
    drawCal();
  });
}

// ══════════════ TOP 10 (app Top10Screen birebir) ══════════════
const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];
const MEDAL_ICONS = ["trophy", "medal", "medal"];
const rankSort = (a, b) => (b.rating !== a.rating ? b.rating - a.rating : b.reviewCount - a.reviewCount);

async function renderTop10(root) {
  clear(root);
  let tab = "artists", city = "", district = "";

  const dl = h("datalist", { id: "ax-t10-cities" }, ...PROVINCES.map((c) => h("option", { value: c })));
  const cityIn = h("input", { placeholder: "Tüm Şehirler", list: "ax-t10-cities", onchange: () => { city = cityIn.value.trim(); district = ""; distIn.value = ""; distIn.disabled = !city; load(); } });
  const distIn = h("input", { placeholder: "Tüm İlçeler", disabled: true, onchange: () => { district = distIn.value.trim(); load(); } });

  const tabsRow = h("div", { class: "chip-row", style: { marginTop: "0", marginBottom: "12px" } });
  const drawTabs = () => {
    clear(tabsRow);
    [["artists", "Sanatçılar"], ["groups", "Gruplar"]].forEach(([k, label]) =>
      tabsRow.append(h("button", { class: "chip" + (tab === k ? " on" : ""), onclick: () => { tab = k; drawTabs(); load(); } }, label)));
  };
  drawTabs();

  const listBox = h("div", {}, h("div", { class: "loading" }, spinner()));
  root.append(
    h("p", { class: "muted small mb6" }, "Bölgendeki en çok puan ve yorum alanlar"),
    dl,
    h("div", { class: "ax-filterrow" },
      h("label", { class: "field" }, h("span", { class: "flabel" }, "Şehir"), cityIn),
      h("label", { class: "field" }, h("span", { class: "flabel" }, "İlçe"), distIn)),
    tabsRow, listBox);

  async function load() {
    clear(listBox); listBox.append(h("div", { class: "loading" }, spinner()));
    try {
      // Puanlar CANLI reviews'tan; sanatçı okuyamazsa boş harita ile devam (app birebir)
      const ratings = await fetchArtistRatings().catch(() => new Map());
      let items = [];
      if (tab === "artists") {
        const artists = await listRealArtists();
        items = artists
          .filter((a) => (!city || a.city === city) && (!city || !district || a.district === district))
          .map((a) => {
            const agg = ratings.get(a.id);
            return {
              id: a.id, name: a.displayName ?? "Sanatçı",
              sub: Array.isArray(a.genres) ? (a.genres[0] ?? "Müzik") : (a.genre ?? "Müzik"),
              rating: agg?.avg ?? 0, reviewCount: agg?.count ?? 0, isGroup: false,
            };
          })
          .sort(rankSort).slice(0, 10);
      } else {
        const groups = await listGroups(city || null);
        items = groups.map((g) => {
          const memberIds = (g.memberIds ?? []).slice(0, 6);
          const aggs = memberIds.map((id) => ratings.get(id)).filter(Boolean);
          return {
            id: g.id, name: g.name ?? "Grup",
            sub: `${(g.memberIds ?? []).length} üye${g.genre ? ` · ${g.genre}` : ""}`,
            rating: aggs.length ? aggs.reduce((s, a) => s + a.avg, 0) / aggs.length : 0,
            reviewCount: aggs.reduce((s, a) => s + a.count, 0), isGroup: true,
          };
        }).sort(rankSort).slice(0, 10);
      }
      clear(listBox);
      if (!items.length) {
        listBox.append(empty("trophy-outline", "Sıralama yok",
          city ? `${district ? `${city} / ${district}` : city} için henüz sıralama yok.` : "Henüz sıralanacak kayıt yok."));
        return;
      }
      items.forEach((it, i) => listBox.append(rankCard(it, i)));
    } catch (_) { clear(listBox); listBox.append(errBox()); }
  }
  load();
}

function rankCard(it, i) {
  return h("div", { class: "ax-rank" + (i < 3 ? " top" : ""), onclick: () => { if (!it.isGroup) artistInfoModal(it); } },
    i < 3
      ? h("div", { class: "ax-rankmedal" }, icon(MEDAL_ICONS[i], { size: 22, color: MEDAL_COLORS[i] }))
      : h("div", { class: "ax-rankno" }, String(i + 1)),
    h("div", { class: "ax-rankavatar" }, icon(it.isGroup ? "people" : "mic", { size: 18, color: "#fff" })),
    h("div", { class: "grow" },
      h("div", { class: "ax-rankname" }, it.name),
      h("div", { class: "ax-ranksub" }, it.sub)),
    h("div", { class: "ax-score" },
      h("div", { class: "ax-scorerate" }, icon("star", { size: 12, color: "var(--amber)" }), h("span", {}, it.rating > 0 ? it.rating.toFixed(1) : "—")),
      h("div", { class: "ax-scorecnt" }, `${it.reviewCount} yorum`)));
}

// Sıralamadaki sanatçının kısa profili (app ArtistDetail'in web karşılığı — özet modal)
function artistInfoModal(it) {
  const body = h("div", {}, h("div", { class: "loading" }, spinner()));
  modal({ title: it.name, body, actions: [] });
  userById(it.id).then((u) => {
    clear(body);
    body.append(
      h("div", { class: "ax-drows" },
        drow("mic-outline", "Tür", Array.isArray(u?.genres) ? (u.genres.join(", ") || it.sub) : (u?.genre || it.sub)),
        drow("location-outline", "Konum", u?.city ? `${u.city}${u.district ? ` / ${u.district}` : ""}` : "—"),
        drow("star-outline", "Puan", it.rating > 0 ? `${it.rating.toFixed(1)} · ${it.reviewCount} yorum` : "Henüz puan yok"),
        u?.experienceYears ? drow("time-outline", "Deneyim", `${u.experienceYears} yıl`) : null),
      u?.bio ? h("div", { class: "ax-drows" }, h("div", {},
        h("div", { class: "ax-msglabel" }, "Hakkında"),
        h("div", { class: "ax-msgbody" }, u.bio))) : null);
  }).catch(() => { clear(body); body.append(errBox()); });
}

// ══════════════ MEKANLAR — Mekan Değerlendir (app VenueReviewScreen birebir) ══════════════
const REVIEW_CRITERIA = [
  { key: "payment", ic: "cash-outline", label: "Ödeme Güvenilirliği", desc: "Ödeme zamanında yapıldı mı?" },
  { key: "equipment", ic: "musical-notes-outline", label: "Ekipman Kalitesi", desc: "Ses sistemi ve ekipmanlar yeterliydi mi?" },
  { key: "treatment", ic: "people-outline", label: "Sanatçıya Davranış", desc: "Personel saygılı ve yardımsever miydi?" },
  { key: "communication", ic: "chatbubble-outline", label: "İletişim", desc: "Organizasyon süreci iletişimi nasıldı?" },
];

async function renderVenueReview(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  const uid = session.user.uid;
  try {
    const [invs, given] = await Promise.all([artistAcceptedInvitations(uid), artistVenueReviewsGiven(uid).catch(() => [])]);
    const reviewedMap = new Map();
    given.forEach((r) => { if (r.venueId) reviewedMap.set(r.venueId, r.overallRating ?? 0); });

    // Mekan bazında grupla: en güncel etkinlik temsilci; herhangi biri geçmişse puanlanabilir
    const byVenue = new Map();
    invs.forEach((d) => {
      const key = d.venueId ?? d.venueName ?? d.id;
      const evDate = d.eventDate ?? d.date ?? null;
      const evTime = d.eventTime ?? d.startTime ?? null;
      const startMs = eventStartMs(evDate, evTime) ?? 0;
      const ratable = isRatable(evDate, evTime);
      const prev = byVenue.get(key);
      if (!prev) byVenue.set(key, { name: d.venueName ?? "Mekan", city: d.city ?? d.venueCity ?? "", bestMs: startMs, bestDate: evDate ?? "", bestTime: evTime ?? "", ratable });
      else {
        prev.ratable = prev.ratable || ratable;
        if (startMs > prev.bestMs) { prev.bestMs = startMs; prev.bestDate = evDate ?? ""; prev.bestTime = evTime ?? ""; }
      }
    });
    const venues = Array.from(byVenue.entries()).map(([key, x]) => ({
      id: key, name: x.name, city: x.city,
      lastPerformance: isoToTR(x.bestDate) || "—",
      myReview: reviewedMap.has(key) ? reviewedMap.get(key) : null,
      ratable: x.ratable,
      ratableLabel: x.ratable ? "" : ratableAtLabel(x.bestDate, x.bestTime),
    }));

    drawList();

    function drawList() {
      clear(root);
      root.append(h("p", { class: "muted small mb6" }, "Çalıştığın mekanları değerlendir ve diğer sanatçılara yol göster"));
      if (!venues.length) { root.append(empty("business-outline", "Henüz onaylanmış performansın yok", "Kabul ettiğin teklifler sonrası mekanlar burada listelenir.")); return; }
      venues.forEach((it) => root.append(h("div", { class: "ax-vrow", onclick: () => {
        if (it.myReview != null) return;
        if (!it.ratable) { toast(`Mekanı yalnızca etkinlik sonrasında değerlendirebilirsin.${it.ratableLabel ? ` Açılış: ${it.ratableLabel}` : ""}`, "err"); return; }
        drawForm(it);
      } },
        h("div", { class: "ax-vleft" },
          h("div", { class: "ax-vcardav" }, it.name.charAt(0).toUpperCase()),
          h("div", { class: "grow" },
            h("div", { class: "ax-vname" }, it.name),
            it.city ? h("div", { class: "ax-vcity" }, it.city) : null,
            h("div", { class: "ax-vdate" }, "Son performans: " + it.lastPerformance))),
        it.myReview != null
          ? h("span", { class: "ax-badge-reviewed" }, icon("star", { size: 12, color: "var(--success)" }), h("span", {}, `${it.myReview} • Değerlendirdim`))
          : !it.ratable
            ? h("span", { class: "ax-badge-locked" }, icon("lock-closed", { size: 12 }), h("span", {}, "Etkinlik sonrası"))
            : h("button", { class: "ax-reviewnow" }, h("span", {}, "Değerlendir"), icon("arrow-forward", { size: 12, color: "#fff" })))));
    }

    // ── Değerlendirme formu (kriterler + yorum + görünürlük) ──
    function drawForm(it) {
      clear(root);
      const ratings = {};
      let visibility = "everyone";
      const overallVal = h("span", {}, "—");
      const overall = h("div", { class: "ax-overall", style: { display: "none" } },
        h("span", { class: "ax-overall-label" }, "Genel Puan"),
        h("span", { class: "ax-overall-val" }, icon("star", { size: 18, color: A }), overallVal));
      const updOverall = () => {
        const vals = Object.values(ratings);
        overall.style.display = vals.length ? "" : "none";
        if (vals.length) overallVal.textContent = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
      };

      const critCards = REVIEW_CRITERIA.map((c) => {
        const starRow = h("div", { class: "ax-starrow" });
        const draw = () => {
          clear(starRow);
          for (let s = 1; s <= 5; s++) {
            const onIt = s <= (ratings[c.key] ?? 0);
            starRow.append(h("button", { class: "ax-starbtn", onclick: () => { ratings[c.key] = s; draw(); updOverall(); } },
              icon(onIt ? "star" : "star-outline", { size: 28, color: onIt ? "var(--amber)" : "var(--text-muted)" })));
          }
          if (ratings[c.key]) starRow.append(h("span", { class: "ax-starlabel" }, `${ratings[c.key]}/5`));
        };
        draw();
        return h("div", { class: "ax-crit" },
          h("div", { class: "ax-crithead" }, icon(c.ic, { size: 16, color: A }), h("span", {}, c.label)),
          h("div", { class: "ax-critdesc" }, c.desc),
          starRow);
      });

      const commentTa = h("textarea", { class: "review-ta", rows: 4, placeholder: "Deneyimini paylaş..." });

      const VIS = [
        { key: "everyone", ic: "globe-outline", label: "Herkes görsün", desc: "Müşteriler ve sanatçılar adınla görür" },
        { key: "artists", ic: "people-outline", label: "Sadece sanatçılar", desc: "Yalnız diğer sanatçılar adınla görür" },
        { key: "anonymous", ic: "eye-off-outline", label: "Anonim (isim gizli)", desc: "Herkes görür ama adın gizlenir" },
      ];
      const visBox = h("div", {});
      const drawVis = () => {
        clear(visBox);
        VIS.forEach((o) => {
          const on = visibility === o.key;
          visBox.append(h("div", { class: "ax-visrow" + (on ? " on" : ""), onclick: () => { visibility = o.key; drawVis(); } },
            icon(o.ic, { size: 18, color: on ? A : "var(--text-muted)" }),
            h("div", { class: "grow" }, h("div", { class: "ax-vislabel" }, o.label), h("div", { class: "ax-visdesc" }, o.desc)),
            h("div", { class: "ax-radio" }, on ? h("div", { class: "ax-radiodot" }) : null)));
        });
      };
      drawVis();

      const submit = btn("Değerlendirmeyi Gönder", { full: true, onClick: async () => {
        if (Object.keys(ratings).length < REVIEW_CRITERIA.length) return toast("Lütfen tüm kriterleri puanla. (ERR-VREVIEW-004)", "err");
        const vals = Object.values(ratings);
        const overallRating = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
        submit.disabled = true;
        try {
          await submitArtistVenueReview(uid, {
            venueId: it.id, venueName: it.name,
            artistName: session.profile?.displayName || "Sanatçı",
            visibility, ratings, overallRating, comment: commentTa.value,
          });
          it.myReview = overallRating;
          toast("Teşekkürler! Mekan değerlendirmen gönderildi.");
          drawList();
        } catch (_) { submit.disabled = false; toast("Değerlendirme gönderilemedi. (ERR-VREVIEW-001)", "err"); }
      } });

      root.append(
        h("button", { class: "icon-btn", style: { marginBottom: "12px" }, onclick: drawList }, icon("chevron-back", { size: 20 })),
        h("div", { class: "ax-vleft", style: { marginBottom: "14px" } },
          h("div", { class: "ax-vcardav sm" }, it.name.charAt(0).toUpperCase()),
          h("div", {},
            h("div", { class: "ax-vname" }, it.name),
            h("div", { class: "ax-vcity" }, [it.city, it.lastPerformance].filter(Boolean).join(" • ")))),
        overall,
        ...critCards,
        sect("Yorum (isteğe bağlı)", "chatbubble-outline", commentTa),
        sect("Yorumu kim görsün?", "eye-outline", visBox),
        submit);
    }
  } catch (_) { clear(root); root.append(errBox()); }
}

// ══════════════ ALDIĞIM YORUMLAR (app ReceivedReviewsScreen birebir) ══════════════
const AVATAR_COLORS = [["#F59E0B", "#D97706"], ["#8B5CF6", "#6D28D9"], ["#EC4899", "#BE185D"], ["#06B6D4", "#0891B2"]];
const avatarGrad = (name) => AVATAR_COLORS[((name || "A").charCodeAt(0) || 65) % AVATAR_COLORS.length];
function authorBadge(type) {
  if (type === "venue") return { label: "Mekan", ic: "business-outline", color: "var(--amber)" };
  if (type === "customer") return { label: "Dinleyici", ic: "person-outline", color: "var(--cyan)" };
  return { label: "Değerlendiren", ic: "star-outline", color: "var(--text-secondary)" };
}

async function renderReceivedReviews(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  try {
    // targetId==uid (kural yalnız hedef sanatçıya açar); targetType filtresi istemcide
    const list = (await artistReviews(session.user.uid)).map((r) => ({
      id: r.id,
      authorName: r.authorName ?? "Değerlendiren",
      authorType: r.authorType,
      rating: r.rating ?? 0,
      comment: r.comment ?? "",
      date: r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("tr-TR") : "Yakın zamanda",
      _ms: r.createdAt?.toMillis?.() ?? 0,
    })).sort((a, b) => b._ms - a._ms);

    const avg = list.length ? (list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(1) : "—";
    clear(root);
    root.append(h("p", { class: "muted small mb6" }, `${list.length} yorum • Ortalama ★ ${avg}`));
    if (!list.length) {
      root.append(empty("star-outline", "Henüz yorum almadın", "Mekanlar ve dinleyiciler sahne aldıktan sonra değerlendirmeleri burada görünür."));
      return;
    }
    list.forEach((r) => {
      const [c1, c2] = avatarGrad(r.authorName);
      const b = authorBadge(r.authorType);
      root.append(h("div", { class: "ax-review" },
        h("div", { class: "ax-revtop" },
          h("div", { class: "ax-revavatar", style: { background: `linear-gradient(135deg, ${c1}, ${c2})` } }, r.authorName.charAt(0).toUpperCase()),
          h("div", { class: "grow" },
            h("div", { class: "ax-revname" }, r.authorName),
            h("div", { class: "ax-revdate" }, r.date)),
          h("span", { class: "ax-revbadge", style: { color: b.color, background: "color-mix(in srgb, currentColor 13%, transparent)" } },
            icon(b.ic, { size: 10, color: b.color }), h("span", {}, b.label))),
        h("div", { class: "ax-revstars" }, ...[1, 2, 3, 4, 5].map((s) =>
          icon(s <= r.rating ? "star" : "star-outline", { size: 14, color: s <= r.rating ? "var(--amber)" : "var(--text-muted)" }))),
        r.comment ? h("div", { class: "ax-revcomment" }, r.comment) : null));
    });
  } catch (_) { clear(root); root.append(errBox()); }
}

// ══════════════ PROFİLİM (app ArtistProfileScreen birebir) ══════════════
async function renderProfile(root) {
  clear(root);
  const p = session.profile || {};
  const uid = session.user.uid;
  const name = p.displayName || "Sanatçı";
  const badge = memberBadgeFor(p.createdAt);

  // Kapak + avatar + tip rozeti + üyelik kıdemi
  const cover = h("div", { class: "ax-cover" },
    h("div", { class: "ax-bigavatar" },
      p.photoURL ? h("div", { class: "img", style: { backgroundImage: `url(${p.photoURL})` } }) : h("div", { class: "ph" }, name.trim().charAt(0).toUpperCase() || "?")),
    h("div", { class: "ax-pname" }, name),
    h("div", { class: "ax-pmail" }, p.email || ""),
    h("div", {}, h("span", { class: "ax-typebadge" }, icon("mic-outline", { size: 13, color: A }), h("span", {}, "Sanatçı"))),
    badge ? h("div", {}, h("span", { class: "ax-memberchip", style: { color: badge.color, borderColor: badge.color + "55", background: badge.color + "18" } },
      icon(badge.icon, { size: 13, color: badge.color }), h("span", {}, badge.label))) : null,
    h("div", { class: "ax-membertext" }, membershipLabel(p.createdAt)));

  // İstatistikler: Performans / Puan / Yorum / Takipçi
  const statsBox = h("div", { class: "stat-grid" }, h("div", { class: "loading" }, spinner()));
  (async () => {
    try {
      const [invs, reviews] = await Promise.all([
        artistAcceptedInvitations(uid).catch(() => []),
        artistReviews(uid).catch(() => []),
      ]);
      const rs = reviews.map((r) => r.rating ?? 0).filter((x) => x > 0);
      clear(statsBox);
      statsBox.append(
        statCard("musical-notes-outline", invs.length, "Performans"),
        statCard("star-outline", rs.length ? (rs.reduce((s, x) => s + x, 0) / rs.length).toFixed(1) : "—", "Puan"),
        statCard("chatbubble-outline", rs.length, "Yorum"),
        statCard("people-outline", kFmt(p.followerCount ?? 0), "Takipçi"));
    } catch (_) {
      clear(statsBox);
      statsBox.append(statCard("musical-notes-outline", 0, "Performans"), statCard("star-outline", "—", "Puan"), statCard("chatbubble-outline", 0, "Yorum"), statCard("people-outline", 0, "Takipçi"));
    }
  })();

  const pic = photoPicker("Profil fotoğrafı (opsiyonel)");
  const cityList = h("datalist", { id: "ax-citylist" }, ...PROVINCES.map((c) => h("option", { value: c })));

  // Müzik türleri — çoklu seçim (öneri çipleri + özel tür ekleme)
  const genres = new Set(Array.isArray(p.genres) ? p.genres : []);
  const genreRow = h("div", { class: "chip-row wrap" });
  const drawGenres = () => {
    clear(genreRow);
    const all = [...new Set([...GENRES, ...genres])];
    all.forEach((g) => {
      const c = h("button", { type: "button", class: "chip" + (genres.has(g) ? " on" : ""),
        onclick: () => { if (genres.has(g)) genres.delete(g); else genres.add(g); drawGenres(); } }, g);
      genreRow.append(c);
    });
  };
  drawGenres();
  const genreIn = h("input", { placeholder: "Başka tür ekle…" });
  const addGenre = () => {
    const g = genreIn.value.trim(); genreIn.value = "";
    if (!g) return;
    if (![...genres].some((x) => x.toLowerCase() === g.toLowerCase())) genres.add(g);
    drawGenres();
  };
  const genreAdd = h("div", { class: "ax-genre-add" }, genreIn,
    h("button", { type: "button", onclick: addGenre }, "+ Ekle"));
  genreIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addGenre(); } });

  // Sanatçı adı — app'te displayName kilidi YOK, doğrudan düzenlenir
  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    cityList,
    field({ label: "Sanatçı Adı", id: "aname", value: p.displayName || "", placeholder: "Sahne adın", hint: "Profilinde, tekliflerde ve etkinliklerde bu ad görünür." }),
    h("div", { class: "frow" },
      field({ label: "Şehir", id: "acity", value: p.city || "", placeholder: "Ara: İstanbul, Aydın…", list: "ax-citylist" }),
      field({ label: "İlçe", id: "adistrict", value: p.district || "", placeholder: "Örn. Kadıköy" })),
    field({ label: "Deneyim (yıl)", id: "aexp", type: "number", value: p.experienceYears != null ? String(p.experienceYears) : "", placeholder: "0" }),
    field({ label: "Hakkında", id: "abio", value: p.bio || "", placeholder: "Kendini tanıt…", multiline: true }),
    pic.node);

  // Performans ücreti (min 3.500 iş kuralı)
  const priceForm = h("div", { class: "form-card" },
    h("div", { class: "frow" },
      field({ label: "Minimum Ücret (₺)", id: "apmin", type: "number", value: p.priceMin || "", placeholder: "En az 3.500" }),
      field({ label: "Maksimum Ücret (₺)", id: "apmax", type: "number", value: p.priceMax || "", placeholder: "Örn. 10.000" })),
    h("p", { class: "fhint" }, `Sanatçılar en az ${tl(MIN_STAGE_FEE)} ücretle sahne alabilir.`));

  // Sosyal medya
  const SOCIAL_META = [
    { key: "instagram", ic: "logo-instagram", label: "Instagram", ph: "kullanıcı adı ya da bağlantı" },
    { key: "soundcloud", ic: "logo-soundcloud", label: "SoundCloud", ph: "kullanıcı adı ya da bağlantı" },
    { key: "spotify", ic: "musical-notes-outline", label: "Spotify", ph: "sanatçı adı ya da bağlantı" },
    { key: "youtube", ic: "logo-youtube", label: "YouTube", ph: "kanal ya da bağlantı" },
  ];
  const socialForm = h("div", { class: "form-card" },
    ...SOCIAL_META.map((m) => h("div", { class: "ax-socialrow" },
      icon(m.ic, { size: 20, color: A }),
      field({ label: m.label, id: "asoc_" + m.key, value: p.social?.[m.key] || "", placeholder: m.ph }))));

  const saveMsg = h("p", { class: "msg" });
  const save = btn("Kaydet", { ic: "save-outline", full: true, onClick: async () => {
    const dn = v("#aname");
    if (!dn) return fail(saveMsg, "Sanatçı adını gir.");
    // Ücret doğrulaması (app handleSave birebir): taban 3.500, tavan 1.000.000, max >= min
    const minNum = v("#apmin") ? Math.min(Math.max(parseTL(v("#apmin")) ?? 0, 0), MAX_ARTIST_PRICE) : null;
    const maxNum = v("#apmax") ? Math.min(Math.max(parseTL(v("#apmax")) ?? 0, 0), MAX_ARTIST_PRICE) : null;
    if (minNum != null && minNum < MIN_STAGE_FEE) return fail(saveMsg, `Sanatçılar en az ${tl(MIN_STAGE_FEE)} ücretle sahne alabilir — minimum ücretin bunun altında olamaz.`);
    if (maxNum != null && maxNum < MIN_STAGE_FEE) return fail(saveMsg, `Maksimum ücret de en az ${tl(MIN_STAGE_FEE)} olmalıdır.`);
    if (minNum != null && maxNum != null && maxNum < minNum) return fail(saveMsg, "Maksimum ücret, minimum ücretten küçük olamaz.");
    const patch = {
      displayName: dn,
      bio: v("#abio"),
      priceMin: minNum != null ? String(minNum) : "",
      priceMax: maxNum != null ? String(maxNum) : "",
      genres: [...genres],
      social: { instagram: v("#asoc_instagram"), soundcloud: v("#asoc_soundcloud"), spotify: v("#asoc_spotify"), youtube: v("#asoc_youtube") },
      city: v("#acity"), district: v("#adistrict"),
      experienceYears: v("#aexp") ? Number(v("#aexp").replace(/[^0-9]/g, "")) : null,
    };
    try {
      if (pic.getFile()) { saveMsg.textContent = "Fotoğraf yükleniyor…"; saveMsg.className = "msg"; patch.photoURL = await uploadImage(pic.getFile(), uid); }
      await saveProfile(uid, patch);
      await refreshProfile();
      toast("Profilin güncellendi");
      renderProfile(root);
    } catch (_) { fail(saveMsg, "Profil güncellenemedi. İnternet bağlantını kontrol et. (ERR-APROFILE-002)"); }
  } });

  // Mekan değerlendirme gizlilik notu (app noticeCard)
  const notice = h("div", { class: "ax-notice" },
    icon("lock-closed-outline", { size: 24, color: A }),
    h("div", { class: "grow" },
      h("div", { class: "ax-notice-title" }, "Mekan Değerlendirmeleri"),
      h("div", { class: "ax-notice-text" }, "Çalıştığın mekanları sadece sanatçılar görebilir. Mekanları gizlilik içinde puanlayabilirsin.")));

  // Menü: Aldığım Yorumlar / Bildirimler / Sorun Bildir
  const menu = h("div", { class: "menu-card" },
    menuRow("star-outline", "Aldığım Yorumlar", () => go("#/artist/yorumlar")),
    menuRow("notifications-outline", "Bildirimler", () => go("#/artist/bildirimler")),
    menuRow("alert-circle-outline", "Sorun Bildir", reportModal));

  root.append(
    cover,
    sect("Profil Özeti", "stats-chart-outline", statsBox),
    sect("Sanatçı Bilgileri", "person-outline", form),
    sect("Müzik Türleri", "musical-notes-outline",
      h("p", { class: "muted small mb6" }, "Çaldığın türleri seç; istersen kendi türünü ekle."), genreRow, genreAdd),
    sect("Performans Ücreti", "cash-outline", priceForm),
    sect("Sosyal Medya", "share-social-outline", socialForm),
    save, saveMsg,
    notice, menu,
    btn("Çıkış Yap", { variant: "danger", ic: "log-out-outline", full: true, onClick: () => {
      modal({ title: "Çıkış", body: h("p", { class: "muted" }, "Hesabından çıkmak istiyor musun?"), actions: [
        { label: "İptal", variant: "ghost", onClick: () => {} },
        { label: "Çıkış Yap", variant: "danger", onClick: () => logout() },
      ] });
    } }));
}

function statCard(ic, val, label) {
  return h("div", { class: "stat-card" }, icon(ic, { size: 22, color: A }),
    h("div", { class: "stat-val" }, String(val)), h("div", { class: "stat-label" }, label));
}
function menuRow(ic, label, onClick) {
  return h("div", { class: "menu-row", onclick: onClick },
    icon(ic, { size: 20, color: "var(--text-secondary)" }),
    h("span", { class: "menu-label" }, label),
    icon("chevron-forward", { size: 18, color: "var(--text-muted)" }));
}
function fail(msg, text) { msg.textContent = text; msg.className = "msg err"; }

// Sorun / talep bildir → reports (reporterType 'artist')
function reportModal() {
  const body = h("div", {},
    h("p", { class: "muted small mb6" }, "Yaşadığın sorunu bize ilet; en kısa sürede inceleyeceğiz."),
    field({ label: "Konu", id: "arp_sub", placeholder: "Kısa başlık" }),
    field({ label: "Mesaj", id: "arp_msg", placeholder: "Sorununu ayrıntılı olarak yaz…", multiline: true }));
  modal({ title: "Sorun Bildir", body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      const sub = v("#arp_sub"), msg = v("#arp_msg");
      if (!sub || !msg) return toast("Lütfen konu ve mesaj alanlarını doldur", "err");
      try {
        await submitReport(session.user.uid, { subject: sub, message: msg,
          reporterName: session.profile?.displayName || "", reporterType: "artist" });
        toast("Teşekkürler — bildirimin alındı"); close();
      } catch (_) { toast("Bildirimin gönderilemedi", "err"); }
    } },
  ] });
}

// ══════════════ BİLDİRİMLER (app NotificationsFeed karşılığı) ══════════════
function renderNotifs(root) {
  clear(root);
  const box = h("div", {}, h("div", { class: "loading" }, spinner()));
  root.append(box);
  const unsub = listenNotifications(session.user.uid, (list) => {
    if (!root.isConnected) { try { unsub(); } catch (_) {} return; }
    clear(box);
    if (!list.length) { box.append(empty("notifications-off-outline", "Bildirim yok", "Teklifler ve anlaşmalarla ilgili bildirimler burada görünür.")); return; }
    list.forEach((n) => box.append(h("div", { class: "notif" + (n.read ? "" : " unread"), onclick: () => { if (!n.read) markNotifRead(n.id); } },
      h("div", { class: "notif-body" },
        h("div", { class: "notif-title" }, n.title || "Bildirim"),
        h("div", { class: "notif-text" }, n.body || ""),
        h("div", { class: "notif-time" }, fmtDate(n.createdAt))),
      h("button", { class: "notif-x", title: "Sil", onclick: (e) => { e.stopPropagation(); deleteNotif(n.id); } }, icon("close", { size: 16 })))));
  });
}
