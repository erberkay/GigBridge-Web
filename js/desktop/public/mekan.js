// WebMekan — masaüstü mekan detayı (≥769 px). Registry anahtarı: mekan (#/mekan/:id).
// Spec: specs/public-b.md "WebMekan" (+ sahibinin CLAUDE CODE notu, design/WebMekan.dc.html). CSS: css/dk-mekan-detay.css
// (tüm seçiciler .dk-mekan-detay kökü / .dk-mekan-detay-* adları altında; portal katmanları da bu önekle).
// Legacy karşılığı: js/pages/customer.js venueDetail() — ≤768 px'te aynen kalır (router bu modülü yüklemez).
//
// Legacy özellikleri (hepsi korundu, tasarımdaki yerine taşındı):
//   geri düğmesi (history.back / #/kesfet) → breadcrumb geri · kare foto + büyüt (lightbox) → galeri mozaiği + lightbox ·
//   ad · "şehir · ilçe" hapı ("Şehir belirtilmemiş") · adres · Puan/Kapasite/Yorum istatistikleri (aynı hesap) ·
//   Kaydet (favVenue/unfavVenue, "Kaydedildi" yeşil, toast "Kaydedildi"/"Kaldırıldı"/"İşlem başarısız") · Mesaj (requestChat →
//   mesajlar) · Puan Ver + "+ Yorum Yap" (Puan & Yorum modalı: 5 yıldız, en az 10 / en çok 500 karakter, submitVenueReview) ·
//   "Haritada Göster / Yol Tarifi" (yalnız location varsa, Google Maps search URL) · Mekan Hakkında (+ "Mekan henüz açıklama
//   eklememiş.") · Özellikler (+ "Olanak belirtilmemiş") · Müzik Türleri (→ kimlik çipleri + bilgi satırı) · Müşteri /
//   Sanatçı (görünürlük süzgeci, "Anonim Sanatçı") / Etkinlik (venueTimeline, etkinlik etiketi) yorumları (→ kaynak sekmeleri) ·
//   misafirde her aksiyon giriş kapısı ("Kaydetmek", "Mesaj göndermek", "Puan vermek", "Yorum yapmak") · "Mekan bulunamadı".
// Yeni (tasarım): breadcrumb, galeri (gallery[] ≤5 → yoksa tek photoURL), istatistik bandı + BU GECE/SIRADAKİ çipi, bölüm
//   sekmeleri (IntersectionObserver), yaklaşan etkinlikler (3 kolonda 3, 2 kolonda 2×2; "Tümünü gör" yerinde genişletir) +
//   sahne alan sanatçılar (events where venueId == id), puan özeti, mini Leaflet haritası, telefon/web sitesi bilgi satırları,
//   "Sanatçılar için" CTA (misafir → #/register?rol=artist; dinleyici → onaylı çıkış + sanatçı kaydı).
// Puan & Yorum modalı mevcut yorumu (varsa) önceden doldurur (belge kimliği `${uid}_${venueId}` → yazım üzerine yazar; legacy ile aynı).
//
// Veri: userById · getVenueReviews · isFavVenue · venueTimeline (data.js, mevcut) + eventsAtVenue (bu modülde; salt-okuma,
// tek alanlı sorgu, cleanupEventBanners YAN ETKİSİ YOK) + sanatçı belgeleri (userById, en çok 12). Yazımlar: favVenue/unfavVenue,
// submitVenueReview (legacy ile birebir). Yeni alan/indeks/Cloud Function YOK.
// Panel rolleri (masaüstü politika 3): sanatçı → Mesaj (#/artist/mesaj) + Puan Ver (#/artist/mekanlar = kendi değerlendirme akışı);
// mekan/organizatör → yalnız Mesaj; mekanın kendi sayfası → "Profili düzenle"; yönetici → aksiyon yok.
import { h, loadLeaflet } from "../../ui.js";
import { session, logout } from "../../store.js";
import { db, collection, getDocs, query, where } from "../../firebase.js";
import { userById, getVenueReviews, isFavVenue, favVenue, unfavVenue, venueTimeline, submitVenueReview, updateMyReview, convIdFor } from "../../data.js";
import { requestChat as legacyRequestChat } from "../../pages/messages.js";
import { publicShell } from "../shared/public-shell.js";
import { svgIcon, svgRaw, svgPath } from "../shared/icons.js";
import { cx, uid as mkId, dkBreadcrumb, dkSectionHead, dkSegmented, dkEmpty, dkSkeleton, dkModal, dkConfirm, dkToast, dkLoginGate } from "../shared/ui.js";
import { isRealUser } from "../shared/overlays.js";
import { eventCard } from "../shared/cards.js";
import { invalidateAccountCounts } from "../shared/live.js";
import {
  eventStartMs, isEventOver, isToday, fmtTime, fmtInt, trLower, trUpper, fold, toMs, latLngOf, rgba,
  MONTHS_TR_SHORT, DAYS_TR_SHORT, initials,
} from "../shared/helpers.js";
import { genreColor, primaryGenre, genreLabel } from "../shared/genres.js";

// ── Artboard SVG gövdeleri (WebMekan.dc.html, birebir) ──
const P = {
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  nav: '<path d="M3 11 21 3l-8 18-2-8z"></path>',
  bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"></path>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5z"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
  check: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  eyeOff: '<path d="M3 3l18 18"></path><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.1 6.1C3.9 7.6 2.5 9.8 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>',
  mic: '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4"></path>',
  note: '<path d="M9 17V5l10-2v12"></path><circle cx="6.5" cy="17" r="2.5"></circle><circle cx="16.5" cy="15" r="2.5"></circle>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path>',
};
// DCLogic ICON haritası (MEKAN BİLGİLERİ satırları)
const FACT_ICON = {
  cap: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M17 12.3a2.3 2.3 0 1 0 0-4.6M15.5 14.6A4.5 4.5 0 0 1 21 19",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  web: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  note: "M9 17V5l10-2v12M9 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
};
const raw = (k, size, o = {}) => svgRaw(P[k], { size, ...o });

// 6'lı ad-karma gradyan paleti (DCLogic GR = legacy customer.js AV_GRADS) — yorum avatarları + sanatçı karoları
const GR = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#06B6D4", "#0891B2"], ["#EC4899", "#BE185D"]];
const gradOf = (name) => { const g = GR[[...String(name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % GR.length]; return `linear-gradient(135deg, ${g[0]}, ${g[1]})`; };

// ── metin yardımcıları ──
// "25 Eyl 2026" (yorum tarihi; artboard gün sıfırsız)
function dayMonYear(v) { const t = toMs(v); if (t == null) return ""; const d = new Date(t); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`; }
// "CUM 2 EKİ" (SIRADAKİ çipi)
function dayLabelUp(ms) { const d = new Date(ms); return trUpper(`${DAYS_TR_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`); }
// Türkçe tamlayan eki: Beyoğlu → Beyoğlu’nun, Kadıköy → Kadıköy’ün, Çankaya → Çankaya’nın, İzmir → İzmir’in (spec §9)
export function trGenitive(word) {
  const w = String(word || "").trim(); if (!w) return "";
  const low = trLower(w), V = "aeıioöuüâîû";
  let last = null;
  for (let i = low.length - 1; i >= 0; i--) if (V.includes(low[i])) { last = low[i]; break; }
  const suf = !last ? "in" : "aıâ".includes(last) ? "ın" : "eiî".includes(last) ? "in" : "ouû".includes(last) ? "un" : "ün";
  return w + "’" + (V.includes(low[low.length - 1]) ? "n" : "") + suf;
}
// Web sitesi: yalnız http(s) bağlantı olur; şemasız değer https:// ile; başka şema (javascript: vb.) → düz metin
function websiteOf(val) {
  const s = String(val || "").trim(); if (!s) return null;
  if (/^https?:\/\//i.test(s)) return { href: s, text: s.replace(/^https?:\/\//i, "").replace(/\/$/, "") };
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return { href: null, text: s };
  return { href: "https://" + s, text: s.replace(/\/$/, "") };
}
const telOf = (val) => { const d = String(val || "").replace(/[^\d+]/g, ""); return d.length >= 5 ? "tel:" + d : null; };
const mapsHref = (loc) => `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;   // legacy + sahibi notu

// ── veri: mekandaki etkinlikler (salt-okuma; venueEvents()'in banner temizleme yazımı YOK) ──
async function eventsAtVenue(venueId) {
  const snap = await getDocs(query(collection(db, "events"), where("venueId", "==", venueId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// İzleyici rolü → aksiyon kümesi
function viewerKind(venueId) {
  if (!isRealUser()) return "guest";
  if (session.isAdmin) return "admin";
  const p = session.profile || {};
  if (session.user?.uid === venueId) return "own";
  const t = p.userType;
  return t === "artist" || t === "venue" || t === "organizer" ? t : "customer";
}
const myName = () => session.profile?.displayName || session.user?.displayName || "Kullanıcı";

// ══════════════════════════════════════════════════════════════════════
export function mekanView(ctx) {
  const id = ctx.seg[2] || "";
  const shell = publicShell({ active: null, footer: "full" });
  const root = h("div", { class: "dk-mekan-detay" });
  shell.main.append(root);

  const dyn = [];          // her render'da yenilenen kaynaklar (IntersectionObserver, ResizeObserver)
  let dead = false;
  let map = null;
  let renderedKind = null;   // son çizimdeki izleyici türü (onSession'da profil geç yüklenirse aksiyonlar yenilenir)
  let reqSeq = 0;

  // ── iskelet (yükleniyor) ──
  function renderSkeleton() {
    teardownDynamic();
    root.replaceChildren(
      h("div", { class: "dk-mekan-detay-bc" }, dkBreadcrumb({ items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Mekanlar", href: "#/kesfet?kategori=mekanlar" }, { label: "…" }], variant: "mono", back: goBack })),
      h("div", { class: "dk-mekan-detay-gal is-skel", "aria-hidden": "true" },
        dkSkeleton({ h: "100%", r: 0 }), dkSkeleton({ h: "100%", r: 0 }), dkSkeleton({ h: "100%", r: 0 })),
      h("div", { class: "dk-mekan-detay-skid", "aria-hidden": "true" },
        dkSkeleton({ w: 160, h: 26, r: 13 }), dkSkeleton({ w: "46%", h: 76, r: 8 }), dkSkeleton({ w: "32%", h: 16 }), dkSkeleton({ w: 180, h: 30, r: 15 })),
      h("p", { class: "dk-sr", role: "status" }, "Mekan yükleniyor"),
    );
  }
  function goBack() { if (history.length > 1) history.back(); else location.hash = "#/kesfet"; }

  function renderMessage(kind) {
    teardownDynamic();
    root.replaceChildren(
      h("div", { class: "dk-mekan-detay-bc" }, dkBreadcrumb({ items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Mekanlar", href: "#/kesfet?kategori=mekanlar" }], variant: "mono", back: goBack })),
      h("div", { class: "dk-mekan-detay-msg" },
        kind === "notfound"
          ? dkEmpty({ icon: "alertCircle", title: "Mekan bulunamadı", sub: "Bağlantı eski olabilir ya da mekan kaldırılmış.", action: h("a", { href: "#/kesfet", class: "dk-mekan-detay-act dk-press" }, "Keşfet’e dön") })
          : dkEmpty({ icon: "alertCircle", title: "Mekan yüklenemedi", sub: "Bağlantını kontrol edip tekrar dene.", action: h("button", { type: "button", class: "dk-mekan-detay-act dk-press", onclick: () => load() }, "Tekrar dene") })));
  }

  // ── yükle ──
  // quiet: yazım sonrası yenileme — iskelet yok (kaydırma korunur), odak aynı aksiyona geri verilir
  let refocus = null;
  async function load({ quiet = false } = {}) {
    const seq = ++reqSeq;
    if (!quiet) renderSkeleton();
    const me = session.user?.uid;
    const [v, revs, fav, tl, evs] = await Promise.all([
      userById(id).catch(() => undefined),
      getVenueReviews(id).catch(() => []),
      isRealUser() && me ? isFavVenue(me, id) : false,
      venueTimeline(id).catch(() => []),
      eventsAtVenue(id).catch(() => null),
    ]);
    if (dead || seq !== reqSeq) return;
    if (v === undefined) { if (!quiet) renderMessage("error"); return; }
    // Mekan olmayan profil (dinleyici/sanatçı/organizatör uid'i) mekan gibi çizilmez: telefonu herkese açık bir mekan sayfasında
    // göstermez, Puan Ver ile mekan-olmayana venueReviews yazdırmaz. userType'ı olmayan eski mekan belgeleri geçer.
    if (!v || (v.userType && v.userType !== "venue")) return renderMessage("notfound");

    // etkinlikler: iptaller hariç; yaklaşan = bitmemiş (canlı dahil) artan; geçmiş = bitmiş azalan
    const live = (evs || []).filter((e) => e.status !== "cancelled" && eventStartMs(e) != null);
    const upcoming = live.filter((e) => !isEventOver(e)).sort((a, b) => eventStartMs(a) - eventStartMs(b));
    const past = live.filter((e) => isEventOver(e)).sort((a, b) => eventStartMs(b) - eventStartMs(a));
    // sahne alan sanatçılar: geçmiş etkinliklerin tekil artistId'leri (en yeni önce, en çok 6); artistId yoksa ad ile
    const played = [];
    const seen = new Set();
    for (const e of past) {
      const key = e.artistId ? "id:" + e.artistId : e.artistName ? "n:" + fold(e.artistName) : null;
      if (!key || seen.has(key)) continue;
      seen.add(key); played.push({ artistId: e.artistId || null, artistName: e.artistName || "", ev: e });
      if (played.length >= 6) break;
    }
    // sanatçı belgeleri (RESIDENT sezgisi + karolar)
    const ids = [...new Set([...played.map((p) => p.artistId), ...upcoming.map((e) => e.artistId)].filter(Boolean))].slice(0, 12);
    const docs = await Promise.all(ids.map((a) => userById(a).catch(() => null)));
    if (dead || seq !== reqSeq) return;
    const artists = new Map(ids.map((a, i) => [a, docs[i]]));
    root.classList.toggle("is-static", quiet);   // sessiz yenilemede giriş animasyonları yeniden oynamasın
    render({ v, revs, fav, tl, evsOk: evs != null, upcoming, played, artists });
    if (refocus) {
      const want = refocus; refocus = null;
      const ae = document.activeElement;
      if (!ae || ae === document.body || !ae.isConnected) root.querySelector(`[data-act="${want}"]`)?.focus({ preventScroll: true });
    }
  }

  // ── çiz ──
  function render(d) {
    const { v } = d;
    teardownDynamic();
    const name = v.displayName || "Mekan";
    const kind = viewerKind(id);
    renderedKind = kind;
    const genres = [...new Set((Array.isArray(v.genres) ? v.genres : v.genre ? [v.genre] : []).filter(Boolean))];
    // yorum kaynakları (legacy customer.js 853–858 birebir)
    const visOf = (r) => r.visibility ?? (r.isAnonymous ? "anonymous" : "everyone");
    const custR = d.revs.filter((r) => (r.authorType ?? "customer") !== "artist");
    const artR = d.revs.filter((r) => (r.authorType ?? "customer") === "artist").filter((r) => visOf(r) !== "artists")
      .map((r) => { const anon = visOf(r) === "anonymous"; return { ...r, _name: anon ? "Anonim Sanatçı" : (r.authorName ?? r.artistName ?? "Sanatçı"), _anon: anon }; });
    const rated = d.revs.filter((r) => Number(r.overallRating ?? r.rating) > 0);
    const avgNum = rated.length ? rated.reduce((s, r) => s + Number(r.overallRating ?? r.rating), 0) / rated.length : null;
    const avg = avgNum != null ? avgNum.toFixed(1) : "—";
    const mine = d.revs.find((r) => r.authorId && r.authorId === session.user?.uid && (r.authorType ?? "customer") !== "artist") || null;
    const loc = v.location ? latLngOf(v.location) : null;   // legacy: harita yalnız location varsa
    // galeri: users/{id}.gallery[] (≤5, yeni isteğe bağlı alan) → yoksa tek photoURL (sahibi notu)
    const okSrc = (s) => typeof s === "string" && s.trim() !== "";
    const galList = Array.isArray(v.gallery) ? [...new Set(v.gallery.filter(okSrc))] : [];
    const gallerySrc = galList.length ? galList.slice(0, 5) : okSrc(v.photoURL) ? [v.photoURL] : [];

    // ── aksiyonlar ──
    const openReview = (act) => reviewModal(v, mine, () => { refocus = act; load({ quiet: true }); });
    const msgRoute = kind === "artist" ? "#/artist/mesaj" : kind === "venue" ? "#/venue/mesaj" : kind === "organizer" ? "#/organizer/mesaj" : "#/mesajlar";
    // Legacy bekleyen sohbet (mobil/legacy mesaj görünümü okur) + masaüstü chat.js requestChat + `?c={convIdFor(me, mekan)}` derin
    // bağlantısı: masaüstü mesaj görünümü legacy `pending`'i okuyamaz (chat.js SHARED-CANDIDATE) → ?c= olmadan son konuşmayı açardı.
    const doMessage = () => {
      if (dkLoginGate("Mesaj göndermek")) return;
      const t = { otherId: id, otherName: name };
      try { legacyRequestChat(t); } catch (_) {}
      const me = session.user?.uid;
      const go = () => { if (!dead) location.hash = msgRoute + (me ? "?c=" + encodeURIComponent(convIdFor(me, id)) : ""); };
      import("../messages/chat.js").then((m) => { try { m.requestChat?.(t); } catch (_) {} }).catch(() => {}).finally(go);
    };
    // sanatçı → kendi "Mekan Değerlendir" akışı (kriterler + görünürlük + uygunluk; submitArtistVenueReview)
    const reviewAction = (gateLabel, act) => () => {
      if (dkLoginGate(gateLabel)) return;
      if (kind === "artist") { location.hash = "#/artist/mekanlar"; return; }
      openReview(act);
    };
    const doReview = reviewAction("Puan vermek", "review");
    const doReviewWrite = reviewAction("Yorum yapmak", "write");
    const canSave = kind === "guest" || kind === "customer";
    const canMessage = kind === "guest" || kind === "customer" || kind === "artist" || kind === "venue" || kind === "organizer";
    const canReview = kind === "guest" || kind === "customer" || kind === "artist";

    // ── 1. breadcrumb ──
    const bc = h("div", { class: "dk-mekan-detay-bc" }, dkBreadcrumb({
      items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Mekanlar", href: "#/kesfet?kategori=mekanlar" }, { label: name }], variant: "mono", back: goBack,
    }));

    // ── 2. galeri ──
    const gal = gallery(gallerySrc, name, v.venueType);

    // ── 3. kimlik ──
    const h1id = mkId("dkmk-h1");
    const parts = name.trim().split(/\s+/);
    const lastW = parts.length > 1 ? parts.pop() : null;
    const cityLine = [v.city, v.district].filter(Boolean).join(" · ");
    // "{adres}, {ilçe} / {şehir}" (artboard); adres yoksa satır yok (legacy). Adres zaten şehri içeriyorsa tekrar eklenmez
    // (gerçek veride adresler "…, Kadıköy, İstanbul" biçiminde).
    const addrLine = (() => {
      const a = String(v.address || "").trim();
      if (!a) return "";
      const dc = [v.district, v.city].filter(Boolean).join(" / ");
      return v.city && fold(a).includes(fold(v.city)) ? a : [a, dc].filter(Boolean).join(", ");
    })();
    const saveBtn = canSave ? saveButton(v, d.fav) : null;
    const actions = [];
    if (kind === "own") actions.push(h("a", { href: "#/venue/profil", class: "dk-mekan-detay-act dk-press" }, raw("edit", 16, { sw: "1.9" }), "Profili düzenle"));
    if (saveBtn) actions.push(saveBtn);
    if (canMessage) actions.push(h("button", { type: "button", class: "dk-mekan-detay-act dk-press", onclick: doMessage }, raw("chat", 17, { sw: "1.9" }), "Mesaj"));
    if (canReview) actions.push(h("button", { type: "button", class: "dk-mekan-detay-act is-primary dk-press", "data-act": "review", onclick: doReview }, svgRaw(P.star, { size: 16, sw: "2" }), "Puan Ver"));
    const ident = h("section", { class: "dk-mekan-detay-id", "aria-labelledby": h1id },
      h("div", { class: "dk-mekan-detay-idl dk-rise", style: { "--dk-delay": "80ms" } },
        h("div", { class: "dk-mekan-detay-eyrow" },
          h("span", { class: "dk-mekan-detay-eb" }, "MEKAN"),
          h("span", { class: "dk-mekan-detay-loc" }, raw("pin", 13, { color: "#A78BFA" }), cityLine || "Şehir belirtilmemiş")),
        h("h1", { id: h1id, class: "dk-display dk-mekan-detay-h1" }, parts.join(" ") + (lastW ? " " : ""), lastW ? h("em", {}, lastW) : null),
        addrLine ? h("span", { class: "dk-mekan-detay-addr" }, raw("nav", 14, { sw: "1.9" }), h("span", {}, addrLine)) : null,
        genres.length ? h("div", { class: "dk-mekan-detay-chips" }, ...genres.map((g) => genreChip(g))) : null),
      actions.length ? h("div", { class: "dk-mekan-detay-acts dk-rise", style: { "--dk-delay": "140ms" } }, ...actions) : null);

    // ── 4. istatistik bandı ──
    const cap = v.capacity != null && v.capacity !== "" ? (Number.isFinite(Number(v.capacity)) ? fmtInt(v.capacity) : String(v.capacity)) : "—";
    const stats = h("section", { class: "dk-mekan-detay-stats", "aria-label": "İstatistikler" },
      stat(h("span", { class: "dk-mekan-detay-stv" }, svgRaw(P.star, { size: 22, fill: true, color: "#FFD700" }), avg), "PUAN", "is-first"),
      h("span", { class: "dk-mekan-detay-stdiv", "aria-hidden": "true" }),
      stat(h("span", { class: "dk-mekan-detay-stv" }, cap), "KAPASİTE"),
      h("span", { class: "dk-mekan-detay-stdiv", "aria-hidden": "true" }),
      stat(h("span", { class: "dk-mekan-detay-stv" }, String(custR.length)), "YORUM"),
      d.evsOk ? tonightChip(d.upcoming) : null);

    // ── bölümler ──
    const sections = [];
    let n = 0;
    const num = () => String(++n).padStart(2, "0");

    // 01 Hakkında
    const place = v.district || v.city;
    const aboutId = mkId("dkmk-h");
    const desc = v.description || v.bio;
    const am = Array.isArray(v.amenities) ? v.amenities.filter(Boolean) : [];
    const about = h("section", { class: "dk-mekan-detay-sec", "aria-labelledby": aboutId },
      dkSectionHead({ eyebrow: `${num()} · MEKAN HAKKINDA`, title: place ? trGenitive(place) + " " : "Mekan ", em: place ? "sahnesi" : "hakkında", emColor: "#FF4FA3", size: 48, gap: 12, id: aboutId }),
      h("p", { class: cx("dk-mekan-detay-bio", !desc && "is-dim") }, desc || "Mekan henüz açıklama eklememiş."),
      h("div", { class: "dk-mekan-detay-feat" },
        h("span", { class: "dk-mekan-detay-lbl" }, "ÖZELLİKLER"),
        am.length
          ? h("ul", { class: "dk-mekan-detay-ul" }, ...am.map((a) => h("li", {}, svgRaw(P.check, { size: 16, sw: "1.9", color: "#7CE0B0" }), h("span", {}, a))))
          : h("p", { class: "dk-mekan-detay-bio is-dim is-sm" }, "Olanak belirtilmemiş")));
    sections.push({ key: "hakkinda", label: "Hakkında", node: about });

    // 02 Etkinlikler (sorgu başarısızsa bölüm gizli)
    if (d.evsOk) sections.push({ key: "etkinlikler", label: "Etkinlikler", node: eventsSection(num(), d.upcoming, d.artists, name) });

    // 03 Sanatçılar (geçmiş etkinlik yoksa gizli)
    if (d.played.length) sections.push({ key: "sanatcilar", label: "Sanatçılar", node: artistsSection(num(), d.played, d.artists) });

    // 04 Yorumlar
    sections.push({ key: "yorumlar", label: "Yorumlar", node: reviewsSection(num(), { avg, avgNum, custR, artR, evRevs: d.tl, canReview, onWrite: doReviewWrite }) });

    // ── bölüm sekmeleri ──
    const tabs = anchorTabs(sections);

    // ── kenar sütunu ──
    const aside = h("aside", { class: "dk-mekan-detay-aside", "aria-label": "Mekan bilgileri" },
      mapCard(v, name, loc, addrLine),
      factsCard(v, cap, cityLine, genres),
      kind === "guest" || kind === "customer" ? ctaCard(kind) : null);

    const grid = h("div", { class: "dk-mekan-detay-grid" },
      h("div", { class: "dk-mekan-detay-col" }, ...sections.map((s) => s.node)),
      aside);

    root.replaceChildren(bc, gal, ident, stats, tabs.node, grid);
    tabs.observe();
    initMap(loc, name);
  }

  // ════════════ parçalar ════════════
  function stat(valEl, label, cls) {
    return h("div", { class: cx("dk-mekan-detay-st", cls) }, valEl, h("span", { class: "dk-mekan-detay-stl" }, label));
  }

  // GenreChip "dot-30" (h30 r15 pad 0 12 gap 7 13px, 6px nokta; kenar @.45, zemin @.08) — salt-okuma span.
  // SHARED-CANDIDATE: dkGenreChip size 30 düğme (12.5px, basılabilir); salt-okuma "tag" varyantı ui.js'e eklenebilir.
  function genreChip(g) {
    const c = genreColor(g);
    return h("span", { class: "dk-mekan-detay-chip", style: { color: c, borderColor: rgba(c, 0.45), background: rgba(c, 0.08) } },
      h("span", { class: "dk-mekan-detay-chipdot", style: { background: c } }), g);
  }

  // Kaydet (favVenue) — kaydedilince yeşil "Kaydedildi"; misafirde giriş kapısı (görsel geçiş yok)
  function saveButton(v, initial) {
    let saved = !!initial && isRealUser();
    const label = h("span", {}, "");
    const b = h("button", { type: "button", class: "dk-mekan-detay-act dk-mekan-detay-save dk-press" });
    const paint = () => {
      b.classList.toggle("is-on", saved);
      b.setAttribute("aria-pressed", saved ? "true" : "false");
      label.textContent = saved ? "Kaydedildi" : "Kaydet";
      b.replaceChildren(svgRaw(P.bookmark, { size: 16, sw: "1.9", attrs: { fill: saved ? "currentColor" : "none" } }), label);
    };
    paint();
    b.addEventListener("click", async () => {
      if (dkLoginGate("Kaydetmek")) return;
      const me = session.user?.uid; if (!me) return;
      b.disabled = true;
      try {
        if (saved) { await unfavVenue(me, id); saved = false; } else { await favVenue(me, v); saved = true; }
        invalidateAccountCounts(me);
        if (!dead) { paint(); dkToast(saved ? "Kaydedildi" : "Kaldırıldı"); }
      } catch (_) { if (!dead) dkToast("İşlem başarısız", { type: "err" }); }
      b.disabled = false;
    });
    return b;
  }

  // TonightChip: bugün başlayan (ya da süren) ilk etkinlik → "BU GECE · HH:MM"; yoksa sıradaki → "SIRADAKİ · CUM 2 EKİ · HH:MM"
  function tonightChip(upcoming) {
    const e = upcoming[0]; if (!e) return null;
    const s = eventStartMs(e);
    const tonight = isToday(s) || s <= Date.now();
    const txt = [e.title || "Etkinlik", e.artistName].filter(Boolean).join(" · ");
    return h("a", { href: "#/etkinlik/" + encodeURIComponent(e.id), class: cx("dk-mekan-detay-tonight", "dk-press", !tonight && "is-next") },
      h("span", { class: "dk-mekan-detay-tnb" },
        tonight ? h("span", { class: "dk-mekan-detay-pingw", "aria-hidden": "true" }, h("span", { class: "dk-ping" }), h("span", {})) : null,
        tonight ? `BU GECE · ${fmtTime(s)}` : `SIRADAKİ · ${dayLabelUp(s)} · ${fmtTime(s)}`),
      h("span", { class: "dk-mekan-detay-tnt" }, txt),
      svgRaw(P.arrow, { size: 15, sw: "2", color: "#8A8E97" }));
  }

  // Bölüm sekmeleri (AnchorTabs): düğme + scrollIntoView; etkin bölüm IntersectionObserver ile. Hash DEĞİŞMEZ.
  // dkUnderlineTabs'in "anchor" görünümünü (sınıfları) kullanır ama role=tablist DEĞİL (bölüm bağlantıları; aria-current).
  // SHARED-CANDIDATE: WebSanatci aynı AnchorTabs + StatsBand'i kullanıyor (spec "Build them once") → ui.js dkAnchorTabs/dkStatsBand.
  function anchorTabs(sections) {
    const btns = new Map();
    let lockUntil = 0;
    const set = (k) => btns.forEach((b, key) => { const on = key === k; b.classList.toggle("is-on", on); if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    const node = h("nav", { class: "dk-utab dk-utab-anchor dk-mekan-detay-tabs", "aria-label": "Sayfa bölümleri" },
      ...sections.map((s) => {
        const b = h("button", { type: "button", class: "dk-utab-t dk-tab" }, s.label, h("span", { class: "dk-utab-bar dk-prism dk-utab-bar-prism", "aria-hidden": "true" }));
        b.addEventListener("click", () => {
          set(s.key); lockUntil = Date.now() + 900;
          const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
          s.node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
          // odak bölüm başlığına (klavye kullanıcıları için) — kaydırmayı bozmadan
          const hd = s.node.querySelector("h2");
          if (hd) { hd.setAttribute("tabindex", "-1"); setTimeout(() => { try { hd.focus({ preventScroll: true }); } catch (_) {} }, reduce ? 0 : 450); }
        });
        btns.set(s.key, b);
        return b;
      }));
    set(sections[0]?.key);
    return {
      node,
      observe() {
        if (!("IntersectionObserver" in window)) return;
        const vis = new Map();
        const io = new IntersectionObserver((entries) => {
          entries.forEach((en) => vis.set(en.target, en.isIntersecting));
          if (Date.now() < lockUntil) return;
          const first = sections.find((s) => vis.get(s.node));
          if (first) set(first.key);
        }, { rootMargin: "-96px 0px -60% 0px" });
        sections.forEach((s) => io.observe(s.node));
        dyn.push(() => io.disconnect());
      },
    };
  }

  // 02 · Yaklaşan etkinlikler (3; "Tümünü gör" yerinde genişletir)
  function eventsSection(no, upcoming, artists, venueName) {
    const hid = mkId("dkmk-h");
    const grid = h("div", { class: "dk-mekan-detay-evgrid" });
    let open = false;
    // kapalıyken 4 kart çizilir: ≥1280 (3 kolon) CSS 4.'yü gizler, ≤1279 (2 kolon) 2×2 gösterir → tek başına kalan kart olmaz.
    // Tam 4 etkinlik varsa "Tümünü gör" yalnız 3 kolonda anlamlı (CSS .is-n4 ile ≤1279'da gizli).
    const more = upcoming.length > 3
      ? h("button", { type: "button", class: cx("dk-sh-link-sans dk-link dk-mekan-detay-more", upcoming.length === 4 && "is-n4"), "aria-expanded": "false" }, h("span", {}, "Tümünü gör"), svgRaw(P.arrow, { size: 15, sw: "2" }))
      : null;
    const draw = () => {
      grid.classList.toggle("is-open", open);
      const list = open ? upcoming : upcoming.slice(0, 4);
      grid.replaceChildren(...list.map((e) => evCard(e, artists, venueName)));
      if (more) { more.setAttribute("aria-expanded", open ? "true" : "false"); more.firstChild.textContent = open ? "Daha az göster" : "Tümünü gör"; }
    };
    if (more) more.addEventListener("click", () => { open = !open; draw(); });
    const body = upcoming.length ? grid : dkEmpty({ icon: "calendar", title: "Yaklaşan etkinlik yok", sub: "Bu mekanın takviminde şu an planlanmış bir etkinlik görünmüyor.", compact: true, cls: "dk-mekan-detay-empty" });
    if (upcoming.length) draw();
    return h("section", { class: "dk-mekan-detay-sec", "aria-labelledby": hid },
      dkSectionHead({ eyebrow: `${no} · ETKİNLİKLER`, title: "Yaklaşan etkinlikler", size: 48, gap: 12, id: hid, right: more }),
      body);
  }
  // EventCard (mekan varyantı): görsel 168, başlık 18, alt satır = sanatçı, "Bilet al →"; köşe rozeti BU GECE / RESIDENT (dolu) ya da HİÇ
  // rozet yok (artboard 3. kart) → ortak durum rozeti (YENİ/POPÜLER…) her zaman kapalı. Ortak o.corner kenarlı çizer (artboard dolu) → yerel.
  function evCard(e, artists, venueName) {
    const s = eventStartMs(e);
    const a = e.artistId ? artists.get(e.artistId) : null;
    const resVenue = a ? (a.residentVenue || a.residencyVenue || "") : "";
    const corner = isToday(s) || s <= Date.now() ? { label: "BU GECE", color: "#FF5A6E" }
      : resVenue && fold(resVenue) === fold(venueName) ? { label: "RESIDENT", color: "#FF4FA3" } : null;
    const card = eventCard({ ...e, venueName: null }, { media: 168, titleSize: 18, footer: "cta", badge: false });
    if (corner) card.querySelector(".dk-ecd-media")?.append(h("span", { class: "dk-mekan-detay-corner", style: { background: corner.color } }, corner.label));
    return card;
  }

  // 03 · Bu sahnede çalanlar (ArtistTile)
  function artistsSection(no, played, artists) {
    const hid = mkId("dkmk-h");
    return h("section", { class: "dk-mekan-detay-sec", "aria-labelledby": hid },
      dkSectionHead({ eyebrow: `${no} · SANATÇILAR`, title: "Bu sahnede ", em: "çalanlar", emColor: "#FF4FA3", size: 48, gap: 12, id: hid }),
      h("div", { class: "dk-mekan-detay-artgrid" }, ...played.map((p) => {
        const u = p.artistId ? artists.get(p.artistId) : null;
        const nm = u?.displayName || p.artistName || "Sanatçı";
        const g = (Array.isArray(u?.genres) ? u.genres[0] : u?.genre) || primaryGenre(p.ev) || "";
        const av = u?.photoURL
          ? h("img", { src: u.photoURL, alt: "", decoding: "async", class: "dk-mekan-detay-artav" })
          : h("span", { class: "dk-mekan-detay-artav is-ini", style: { background: gradOf(nm) }, "aria-hidden": "true" }, initials(nm.replace(/^DJ\s+/i, "")));
        if (av.tagName === "IMG") av.addEventListener("error", () => av.replaceWith(h("span", { class: "dk-mekan-detay-artav is-ini", style: { background: gradOf(nm) }, "aria-hidden": "true" }, initials(nm.replace(/^DJ\s+/i, "")))), { once: true });
        const kids = [av, h("span", { class: "dk-mekan-detay-artnm" }, nm), g ? h("span", { class: "dk-mekan-detay-artg", style: { color: genreColor(g) } }, genreLabel(g)) : null];
        return u && p.artistId
          ? h("a", { href: "#/sanatci/" + encodeURIComponent(p.artistId), class: "dk-mekan-detay-art dk-card" }, ...kids)
          : h("div", { class: "dk-mekan-detay-art" }, ...kids);
      })));
  }

  // 04 · Değerlendirmeler — puan özeti + kaynak sekmeleri (Müşteri / Sanatçı / Etkinlik) + 2×2 ızgara, "Tüm … gör" yerinde
  function reviewsSection(no, { avg, avgNum, custR, artR, evRevs, canReview, onWrite }) {
    const hid = mkId("dkmk-h");
    const SRC = [
      { key: "musteri", label: `Müşteri (${custR.length})`, list: custR.map((r) => ({ name: r.authorName, rating: r.overallRating ?? r.rating, text: r.comment, at: r.createdAt })), more: `Tüm müşteri yorumlarını gör (${custR.length})`, empty: "Henüz müşteri yorumu yok." },
      { key: "sanatci", label: "Sanatçı", list: artR.map((r) => ({ name: r._name, rating: r.overallRating ?? r.rating, text: r.comment, at: r.createdAt, anon: r._anon, artist: true })), more: "Tüm sanatçı yorumlarını gör", empty: "Henüz sanatçı yorumu yok." },
      { key: "etkinlik", label: "Etkinlik", list: evRevs.map((r) => ({ name: r.authorName, rating: r.rating, text: r.content || r.comment, at: r.createdAt, tag: r.event || null })), more: "Tüm etkinlik yorumlarını gör", empty: "Henüz etkinlik yorumu yok." },
    ].filter((s) => s.key === "musteri" || s.list.length);   // Sanatçı/Etkinlik boşsa sekme yok (legacy bölümü gizliyordu)
    let cur = SRC[0], open = false;
    const grid = h("div", { class: "dk-mekan-detay-rvgrid dk-fb" });
    const moreBtn = h("button", { type: "button", class: "dk-link dk-mekan-detay-more dk-mekan-detay-rvmore", "aria-expanded": "false" }, h("span", {}), svgRaw(P.arrow, { size: 15, sw: "2" }));
    const draw = (anim) => {
      const list = open ? cur.list : cur.list.slice(0, 4);
      grid.replaceChildren(...(list.length ? list.map(reviewCard) : [dkEmpty({ icon: "star", title: cur.empty, compact: true, cls: "dk-mekan-detay-empty is-rv" })]));
      grid.classList.toggle("is-empty", !list.length);
      moreBtn.hidden = cur.list.length <= 4;
      moreBtn.firstChild.textContent = open ? "Daha az göster" : cur.more;
      moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (anim) { grid.classList.toggle("dk-fa"); grid.classList.toggle("dk-fb"); }
    };
    moreBtn.addEventListener("click", () => { open = !open; draw(false); });
    const seg = SRC.length > 1 ? dkSegmented({ items: SRC.map((s) => ({ key: s.key, label: s.label })), value: cur.key, size: 38, itemPad: 14, label: "Yorum kaynağı", cls: "dk-mekan-detay-rtabs",
      onChange: (k) => { cur = SRC.find((s) => s.key === k) || SRC[0]; open = false; draw(true); linkPanel(); } }) : null;
    // sekme ↔ panel bağı (APG tabs): sekmelere id + aria-controls, ızgara role=tabpanel + aria-labelledby (etkin sekme); kartlarda odak
    // alınacak öğe olmadığından panel tabindex=0
    const tabBtns = seg ? [...seg.querySelectorAll('[role="tab"]')] : [];
    const panelId = mkId("dkmk-rvp");
    function linkPanel() {
      if (!seg) return;
      const i = SRC.indexOf(cur);
      if (tabBtns[i]) grid.setAttribute("aria-labelledby", tabBtns[i].id);
    }
    if (seg) {
      tabBtns.forEach((b) => { b.id = mkId("dkmk-rvt"); b.setAttribute("aria-controls", panelId); });
      grid.id = panelId; grid.setAttribute("role", "tabpanel"); grid.tabIndex = 0;
      linkPanel();
    }
    // özet yıldızları: ⌊ort⌋ dolu, kesir ≥ .25 → yarı saydam dolu (DCLogic fiveMain 0.45α), kalan boş
    const full = avgNum != null ? Math.floor(avgNum + 1e-9) : 0;
    const part = avgNum != null && avgNum - full >= 0.25 ? full + 1 : 0;
    const stars = h("span", { class: "dk-mekan-detay-sumstars", role: "img", "aria-label": avgNum != null ? `5 üzerinden ${avg} yıldız` : "Henüz puan yok" },
      ...[1, 2, 3, 4, 5].map((i) => svgRaw(P.star, { size: 20, sw: "1.4", color: "#FFD700", attrs: { fill: i <= full ? "#FFD700" : i === part ? "rgba(255,215,0,0.45)" : "none" } })));
    draw(false);
    const writeBtn = canReview ? h("button", { type: "button", class: "dk-mekan-detay-act is-sm dk-press", "data-act": "write", onclick: onWrite }, svgRaw(P.plus, { size: 15, sw: "2" }), "Yorum yap") : null;
    return h("section", { class: "dk-mekan-detay-sec", "aria-labelledby": hid },
      dkSectionHead({ eyebrow: `${no} · YORUMLAR`, title: "Değerlendirmeler", size: 48, gap: 12, id: hid, right: writeBtn }),
      h("div", { class: "dk-mekan-detay-sum" },
        h("div", { class: "dk-mekan-detay-suml" },
          h("span", { class: "dk-mekan-detay-sumn" }, avg),
          h("div", { class: "dk-mekan-detay-sumc" }, stars, h("span", { class: "dk-mekan-detay-sumt" }, `${custR.length} müşteri yorumu`))),
        seg),
      grid, moreBtn);
  }
  function reviewCard(r) {
    const nm = r.name || "Kullanıcı";
    const k = Math.round(Number(r.rating) || 0);
    const av = r.anon
      ? h("span", { class: "dk-mekan-detay-rvav is-anon", "aria-hidden": "true" }, svgRaw(P.eyeOff, { size: 16, sw: "1.9", color: "#A78BFA" }))
      : h("span", { class: "dk-mekan-detay-rvav", style: { background: gradOf(nm) }, "aria-hidden": "true" }, nm.charAt(0).toLocaleUpperCase("tr-TR"));
    return h("article", { class: "dk-mekan-detay-rv" },
      h("div", { class: "dk-mekan-detay-rvtop" },
        h("div", { class: "dk-mekan-detay-rvwho" }, av,
          h("span", { class: "dk-mekan-detay-rvcol" },
            h("span", { class: "dk-mekan-detay-rvnm" }, h("span", {}, nm),
              r.artist ? h("span", { class: "dk-mekan-detay-rvbadge" }, svgRaw(P.mic, { size: 10, sw: "2.2" }), "SANATÇI") : null),
            h("span", { class: "dk-mekan-detay-rvdt" }, dayMonYear(r.at)))),
        k > 0 ? h("span", { class: "dk-mekan-detay-rvstars", role: "img", "aria-label": `5 üzerinden ${k} yıldız` },
          ...[1, 2, 3, 4, 5].map((i) => svgRaw(P.star, { size: 14, sw: "1.4", color: "#FFD700", attrs: { fill: i <= k ? "#FFD700" : "none" } }))) : null),
      r.tag ? h("span", { class: "dk-mekan-detay-rvtag" }, svgRaw(P.note, { size: 11, sw: "2" }), h("span", {}, r.tag)) : null,
      r.text ? h("p", { class: "dk-mekan-detay-rvtx" }, r.text) : null);
  }

  // ── galeri mozaiği (1 → tek tam genişlik; 2 → 2fr 1fr, 2. karo iki satır; ≥3 → mozaik + "Tüm fotoğraflar (N)") ──
  function gallery(photos, name, venueType) {
    const n = photos.length;
    const sec = h("section", { class: cx("dk-mekan-detay-gal", "dk-rise", `is-n${Math.min(n, 3)}`), "aria-label": "Fotoğraflar" });
    if (!n) {
      sec.append(h("div", { class: "dk-mekan-detay-gph", role: "img", "aria-label": `${name} — fotoğraf yok` }, h("span", {}, initials(name))));
      return sec;
    }
    const fallback = (img) => img.replaceWith(h("span", { class: "dk-mekan-detay-gph is-in", "aria-hidden": "true" }, h("span", {}, initials(name))));
    photos.slice(0, 3).forEach((src, i) => {
      const img = h("img", { src, alt: "", decoding: "async", loading: i ? "lazy" : "eager", class: cx("dk-mekan-detay-gimg", i === 0 && "dk-kb") });
      img.addEventListener("error", () => fallback(img), { once: true });
      const tile = h("button", { type: "button", class: "dk-mekan-detay-gt", "aria-label": `Fotoğraf ${i + 1}, büyüt`, onclick: () => openLightbox(photos, i) },
        img,
        i === 0 ? h("span", { class: "dk-mekan-detay-gscrim", "aria-hidden": "true" }) : null,
        i === 0 && typeof venueType === "string" && venueType.trim() ? h("span", { class: "dk-mekan-detay-gtype" }, trUpper(venueType.trim())) : null);
      if (i === 2 && n >= 3) {
        sec.append(h("div", { class: "dk-mekan-detay-gcell" }, tile,
          h("button", { type: "button", class: "dk-mekan-detay-gall dk-press", onclick: () => openLightbox(photos, 0) }, svgRaw(P.grid, { size: 15, sw: "1.9" }), `Tüm fotoğraflar (${n})`)));
      } else sec.append(tile);
    });
    return sec;
  }

  // Lightbox (dkModal üstünde: ESC/odak tuzağı/#app inert/kaydırma kilidi/rota-mod kapanışı ortak katmandan)
  // SHARED-CANDIDATE: tam ekran görsel lightbox'ı (WebSanatci avatar, WebEtkinlik afiş de kullanabilir) — ui.js'e dkLightbox olarak.
  function openLightbox(photos, start = 0) {
    let i = start;
    const n = photos.length;
    const img = h("img", { class: "dk-mekan-detay-lbimg", alt: "Büyütülmüş mekan fotoğrafı", src: photos[i] });
    const counter = n > 1 ? h("span", { class: "dk-mekan-detay-lbn", "aria-live": "polite" }) : null;
    const go = (d) => { i = (i + d + n) % n; img.src = photos[i]; if (counter) counter.textContent = `${i + 1} / ${n}`; };
    const nav = (d, lbl, icon) => h("button", { type: "button", class: cx("dk-mekan-detay-lbnav", d < 0 ? "is-prev" : "is-next", "dk-press"), "aria-label": lbl, onclick: () => go(d) }, svgIcon(icon, { size: 18 }));
    const body = h("div", { class: "dk-mekan-detay-lbbody" },
      h("figure", { class: "dk-mekan-detay-lbfig" }, img),
      n > 1 ? nav(-1, "Önceki fotoğraf", "chevronLeft") : null,
      n > 1 ? nav(1, "Sonraki fotoğraf", "chevronRight") : null,
      counter);
    if (counter) counter.textContent = `${i + 1} / ${n}`;
    const m = dkModal({ title: "Fotoğraf", body, variant: "panel", align: "center", size: 1100, cls: "dk-mekan-detay-lb", initialFocus: ".dk-mdl-x" });
    m.node.classList.add("dk-mekan-detay-lbovl");
    m.dialog.addEventListener("keydown", (e) => {
      if (n < 2) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    });
  }

  // Puan & Yorum modalı (WebEtkinlik ReviewModal stili, hedef seçimi YOK) — legacy reviewModal('venue') ile aynı doğrulama.
  // Yazım: yorum yoksa legacy reviewModal yazımı (submitVenueReview, `${uid}_${venueId}`); kendi yorumu varsa modal onu ön-doldurur ve
  // legacy "Yorumu Düzenle" yamasıyla günceller (updateMyReview {comment, rating, overallRating}) → eventId/event/createdAt korunur.
  // SHARED-CANDIDATE: WebEtkinlik/WebSanatci aynı modalı kullanacak (hedef anahtarı + submit fonksiyonu parametreli) — ui.js'e dkReviewModal.
  function reviewModal(v, existing, onDone) {
    const editing = !!(existing && existing.id);
    let rating = Math.round(Number(existing?.overallRating ?? existing?.rating) || 0);
    const starBtns = [];
    const picker = h("div", { class: "dk-mekan-detay-rvpick", role: "radiogroup", "aria-label": "Puan" });
    const paint = () => starBtns.forEach((b, j) => {
      const on = j + 1 <= rating;
      b.setAttribute("aria-checked", rating === j + 1 ? "true" : "false");
      b.tabIndex = (rating ? rating === j + 1 : j === 0) ? 0 : -1;
      const s = b.firstChild; s.setAttribute("fill", on ? "#FFD700" : "none"); s.setAttribute("stroke", on ? "#FFD700" : "#5E636D");
    });
    for (let s = 1; s <= 5; s++) {
      const b = h("button", { type: "button", role: "radio", class: "dk-mekan-detay-rvstar", "aria-label": `${s} yıldız`, onclick: () => { rating = s; paint(); validate(); } },
        svgRaw(P.star, { size: 36, sw: "1.5", color: "#5E636D" }));
      starBtns.push(b); picker.append(b);
    }
    picker.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      rating = Math.min(5, Math.max(1, (rating || 0) + (e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1)));
      paint(); validate(); starBtns[rating - 1].focus();
    });
    const taId = mkId("dkmk-ta");
    const ta = h("textarea", { id: taId, class: "dk-mekan-detay-rvta", rows: 4, maxlength: 500, placeholder: "Yorumunuzu yazın... (en az 10 karakter)" });
    ta.value = existing?.comment || "";
    // sayaç canlı bölge DEĞİL (her tuşta okunmasın); textarea'ya aria-describedby ile bağlı, doğrulama hatası modalın role=alert alanında
    const cntId = mkId("dkmk-cnt");
    const counter = h("span", { id: cntId, class: "dk-mekan-detay-rvcnt" });
    ta.setAttribute("aria-describedby", cntId);
    const len = () => ta.value.trim().length;
    const validate = () => {
      const L = ta.value.length;
      counter.textContent = `${L}/500` + (len() < 10 ? " · en az 10 karakter" : "");
      counter.classList.toggle("is-warn", L > 0 && len() < 10);
      const ok = rating >= 1 && len() >= 10;
      const send = m?.buttons?.[1];
      if (send) send.setAttribute("aria-disabled", ok ? "false" : "true");
      if (ok) m?.setError("");
      return ok;
    };
    ta.addEventListener("input", validate);
    paint();
    const body = h("div", { class: "dk-mekan-detay-rvbody" },
      picker,
      h("div", { class: "dk-mekan-detay-rvfld" }, h("label", { for: taId, class: "dk-label" }, "YORUMUN"), ta, counter));
    const m = dkModal({
      title: editing ? "Yorumunu güncelle" : "Puan & Yorum", sub: v.displayName || "", body, variant: "panel", size: 480, serifTitle: true, cls: "dk-mekan-detay-rvm",
      initialFocus: starBtns[Math.max(0, rating - 1)],
      actions: [
        { label: "İptal", variant: "outline" },
        { label: editing ? "Güncelle" : "Gönder", variant: "primary", keepOpen: true, onClick: async (close, btn) => {
          if (rating < 1) { m.setError("Puan seç"); return false; }
          if (len() < 10) { m.setError("Yorum en az 10 karakter olmalı"); return false; }
          btn.disabled = true;
          try {
            const text = ta.value.trim();
            if (editing) await updateMyReview("venueReviews", existing.id, { comment: text, rating, overallRating: rating });
            else await submitVenueReview(session.user.uid, myName(), v, rating, text);
            invalidateAccountCounts(session.user.uid);
            dkToast(editing ? "Yorum güncellendi" : "Yorumun gönderildi");
            close("action");
            onDone && onDone();
          } catch (_) { dkToast(editing ? "Güncellenemedi" : "Gönderilemedi", { type: "err" }); }
          if (btn.isConnected) btn.disabled = false;
          return false;
        } },
      ],
    });
    validate();
  }

  // ── kenar: harita kartı (Leaflet, location varsa) ──
  function mapCard(v, name, loc, addrLine) {
    if (!loc && !addrLine) return null;
    const mapBox = loc ? h("div", { class: "dk-mekan-detay-mapwrap" },
      h("div", { class: "dk-mekan-detay-map", role: "img", "aria-label": `${name} konumu haritası` },
        h("div", { class: "dk-mekan-detay-leaf", "aria-hidden": "true" }),
        h("span", { class: "dk-mekan-detay-pin", "aria-hidden": "true" }, h("span", { class: "dk-ping" }), h("span", {}),
          h("span", { class: "dk-mekan-detay-pinlbl" }, name))),
      h("a", { class: "dk-mekan-detay-osm", href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener" }, "© OpenStreetMap")) : null;
    return h("div", { class: cx("dk-mekan-detay-card", "dk-mekan-detay-mapcard", !loc && "is-nomap") },
      mapBox,
      h("div", { class: "dk-mekan-detay-mapbody" },
        addrLine ? h("span", { class: "dk-mekan-detay-adr" }, h("span", { class: "dk-mekan-detay-lbl" }, "ADRES"), h("span", { class: "dk-mekan-detay-adrt" }, addrLine)) : null,
        loc ? h("a", { href: mapsHref(loc), target: "_blank", rel: "noopener", class: "dk-mekan-detay-dir dk-press" }, raw("nav", 16, { sw: "2" }), "Haritada Göster / Yol Tarifi") : null));
  }
  async function initMap(loc, name) {
    if (!loc) return;
    const box = root.querySelector(".dk-mekan-detay-leaf");
    const area = root.querySelector(".dk-mekan-detay-map");
    if (!box || !area) return;
    let L;
    try { L = await loadLeaflet(); } catch (_) { return; }
    if (dead || !box.isConnected) return;
    const m = L.map(box, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, tap: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, inertia: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
    map = m;
    // Konum, artboard'daki pinin yerine (sol 138 / üst 106) gelsin → pin + etiket HTML'de sabit, harita kaydırılır
    const place = () => {
      if (!map) return;
      map.invalidateSize({ pan: false });
      const W = area.clientWidth, H = area.clientHeight;
      const px = W >= 378 ? 138 : Math.round(W * 0.365), py = Math.min(106, Math.round(H * 0.48));
      map.setView([loc.lat, loc.lng], 15, { animate: false });
      map.panBy([W / 2 - px, H / 2 - py], { animate: false });
      area.style.setProperty("--dk-pin-x", px + "px");
      area.style.setProperty("--dk-pin-y", py + "px");
    };
    place();
    if ("ResizeObserver" in window) {
      let raf = 0;
      const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); });
      ro.observe(area);
      dyn.push(() => { cancelAnimationFrame(raf); ro.disconnect(); });
    }
  }

  // ── kenar: MEKAN BİLGİLERİ ──
  function factsCard(v, cap, cityLine, genres) {
    const rows = [];
    const row = (icon, k, val) => rows.push(h("div", { class: "dk-mekan-detay-fact" },
      svgPath(FACT_ICON[icon], { size: 16, sw: "1.9", color: "#8A8E97" }), h("span", { class: "dk-mekan-detay-fk" }, k), h("span", { class: "dk-mekan-detay-fv" }, val)));
    if (v.capacity != null && v.capacity !== "") row("cap", "Kapasite", `${cap} kişi`);
    if (cityLine) row("pin", "Şehir · İlçe", cityLine);
    if (v.phone) { const t = telOf(v.phone); row("phone", "Telefon", t ? h("a", { href: t, class: "dk-mekan-detay-flink" }, String(v.phone)) : String(v.phone)); }
    const w = websiteOf(v.website);
    if (w) row("web", "Web sitesi", w.href ? h("a", { href: w.href, target: "_blank", rel: "noopener", class: "dk-mekan-detay-flink" }, w.text) : w.text);
    if (genres.length) row("note", "Müzik türleri", genres.join(" · "));
    if (!rows.length) return null;
    return h("div", { class: "dk-mekan-detay-card dk-mekan-detay-facts" }, h("span", { class: "dk-mekan-detay-lbl is-head" }, "MEKAN BİLGİLERİ"), ...rows);
  }

  // ── kenar: "Sanatçılar için" CTA (misafir + dinleyici) ──
  // Misafir → #/register?rol=artist. Dinleyici hesabı sanatçıya dönüşmez (userType değişmez; router girişliyken #/register'ı
  // Keşfet'e atar) → onaydan sonra oturum kapatılıp sanatçı kaydına gidilir (logout(target)).
  function ctaCard(kind) {
    const onClick = kind === "customer" ? async (e) => {
      e.preventDefault();
      const ok = await dkConfirm({ title: "Sanatçı olarak katıl", body: "Sanatçı profili ayrı bir hesapla oluşturulur. Oturumunu kapatıp sanatçı kaydına geçmek ister misin?", confirmLabel: "Çıkış yap ve devam et", cancelLabel: "Vazgeç" });
      if (ok) logout("#/register?rol=artist");
    } : null;
    return h("div", { class: "dk-mekan-detay-cta" },
      h("span", { class: "dk-mekan-detay-ctabar", "aria-hidden": "true" }),
      h("span", { class: "dk-mekan-detay-ctaeb" }, "SANATÇILAR İÇİN"),
      h("span", { class: "dk-mekan-detay-ctat" }, "Bu sahnede ", h("em", {}, "çalmak"), " ister misin?"),
      h("p", { class: "dk-mekan-detay-ctap" }, "Sanatçı profilini oluştur; mekanlardan doğrudan teklif al."),
      h("a", { href: "#/register?rol=artist", class: "dk-mekan-detay-ctab dk-press", onclick: onClick }, "Sanatçı olarak katıl", svgRaw(P.arrow, { size: 15, sw: "2.2" })));
  }

  // ── dinamik kaynaklar (her render'da yenilenir) ──
  function teardownDynamic() {
    dyn.splice(0).forEach((f) => { try { f(); } catch (_) {} });
    if (map) { try { map.remove(); } catch (_) {} map = null; }
  }

  load();

  return {
    node: shell.node,
    update() { /* sorgu kullanılmıyor (bölüm sekmeleri hash'i değiştirmez) → yerinde, yeniden kurulum yok */ },
    // aynı kimlik: yeniden kurulum yok; profil geç geldiyse ve izleyici türü değiştiyse yalnız içerik sessizce yenilenir
    onSession() { if (renderedKind && viewerKind(id) !== renderedKind) load({ quiet: true }); return true; },
    destroy() {
      dead = true;
      teardownDynamic();
      shell.destroy();
    },
  };
}
