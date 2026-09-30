// WebSanatci — masaüstü sanatçı detayı (≥769 px). Registry anahtarı: sanatci (#/sanatci/:id).
// Spec: specs/public-b.md § WebSanatci (artboard design/WebSanatci.dc.html + sahibinin CLAUDE CODE notu).
// CSS: css/dk-sanatci-detay.css — tüm seçiciler .dk-sanatci-detay kökü (ve portaldaki modallar için .dk-sanatci-detay-*) altında.
// Legacy karşılığı: js/pages/customer.js artistDetail() (≤768 aynen kalır). Sanatçının başka sanatçıyı görmesi: artist.js renderArtistDetail.
//
// Legacy özellikleri (hepsi korundu, artboard düzenine yerleştirildi):
//   kimlik: bannerUrl, photoURL (+ lightbox büyüteç), displayName, genres[0], tagline, trustedBadge, priceBadge (→ yan kart "BAŞLANGIÇ/SABİT
//   FİYAT"), memberChip, membershipText, profileResidency (→ Resident hapı), availabilityBadge, accentColor (kapak tonu + ad vurgusu)
//   istatistik: Puan (yalnız rating>0 ortalaması), Takipçi (artistFollowerCount, yedek users.followerCount), Yorum (= reviews.length)
//   aksiyonlar: Takip Et/Takipte (followArtist/unfollowArtist + toast), Mesaj (chat.js requestChat + ?c= → mesajlar), Teklif İste (bookingRequestModal →
//   sendMessage, aynı metin biçimi), Yorum yap (reviewModal → submitArtistReview, id `${uid}_${artistId}`); misafirde dkLoginGate
//   bölümler: featuredSet (embed), featuredReview, Hakkında (+experienceYears, bio yedeği), rateCardBlock (etkinlik türü segmenti), addOnsBlock
//   (→ "EK HİZMETLER" bilgi kartı), termsBlock, suitabilityBlock, serviceAreaBlock, techRiderBlock, languagesBlock, venueChips (Çaldığı
//   Mekanlar), videoReel (YouTube/Vimeo → iframe büyüteç, en çok 6), Müzik Tarzları (→ Hakkında satırı), socialBlock (→ SOSYAL kartı),
//   Yorumlar (yalnız dinleyici yorumları; boşsa "Henüz yorum yok.")
//   rol davranışı: dinleyici = hepsi; sanatçı (başkası) = Takip + Mesaj (#/artist/mesaj) — legacy renderArtistDetail; kendi sayfası = aksiyon yok;
//   mekan / organizatör (masaüstü politika 3) = Mesaj + Teklif İste (spec; mesaj rotası #/venue/mesaj · #/organizer/mesaj) — takip yok (mekan
//   kendi panelinde gizli "izle" kullanır; public takip sanatçıya "dinleyici" bildirimi yollardı); yönetici = salt okuma.
//   Yalnız users.userType artist (ya da boş) sanatçı sayfası olur: mekan → #/mekan/:id, diğerleri "Sanatçı bulunamadı".
// Yeni (tasarım): kapak + çakışan 200 px avatar, konum satırı, istatistik bandı, bölüm sekmeleri, yaklaşan etkinlikler ızgarası + geçmiş
//   performans tablosu + tıklanabilir mekan çipleri (eventsByArtist — tek alanlı sorgu, yeni index yok), yan özet kartı (sahibinin notu: özet kartı
//   sticky top 96; yan kolonun tamamı sığarsa kolon birlikte yapışır),
//   sosyal liste, sıradaki etkinlik kartı, puan özeti, "Tüm yorumları gör".
// Yazımlar legacy ile birebir (data.js işlevleri): following/followers (+ new_follower bildirimi, fromUserId = auth uid), reviews/{uid}_{id},
//   conversations (+ messages). Arka uç bağımlı parça yok; etkinlik sorgusu başarısızsa Etkinlikler bölümü + sıradaki kartı gizlenir.
import { h, soundEmbedInfo } from "../../ui.js";
import { session } from "../../store.js";
import {
  userById, artistReviews, isFollowing, artistFollowerCount, eventsByArtist, followArtist, unfollowArtist,
  submitArtistReview, updateMyReview, sendMessage, convIdFor,
} from "../../data.js";
import { requestChat as legacyRequestChat } from "../../pages/messages.js";
import { publicShell } from "../shared/public-shell.js";
import { svgRaw } from "../shared/icons.js";
import {
  cx, dkBreadcrumb, dkGenreTag, dkSegmented, dkEmpty, dkSkeleton, dkModal, dkToast, dkLoginGate, dkField, dkInput, dkSelect, dkButton,
} from "../shared/ui.js";
import { isRealUser } from "../shared/overlays.js";
import { eventCard, evTitle, evHref, evImage } from "../shared/cards.js";
import { invalidateAccountCounts } from "../shared/live.js";
import {
  artistGenres, eventStartMs, isEventOver, isLive, toMs, fmtTime, fmtTL, shortNumTR, trUpper, initials, rgba,
  MONTHS_TR_SHORT, DAYS_TR_SHORT, avatarGrad,
} from "../shared/helpers.js";
import { genreColor, genreGrad, primaryGenre } from "../shared/genres.js";

// ── Artboard SVG gövdeleri (birebir kopya) ──
const P = {
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  shieldCheck: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"></path><path d="m9 12 2 2 4-4"></path>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"></path>',
  checkCircle: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path>',
  ribbon: '<circle cx="12" cy="9" r="5"></circle><path d="M9 13.5 7.5 21 12 18.5 16.5 21 15 13.5"></path>',
  userPlus: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M19 8v6M16 11h6"></path>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5z"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  play: '<path d="M8 5v14l11-7z"></path>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"></rect><path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-4h4v4"></path>',
  car: '<path d="M5 16v-5l2-5h10l2 5v5z"></path><path d="M5 16v2M19 16v2M5 11h14"></path><circle cx="8" cy="13.5" r=".6"></circle><circle cx="16" cy="13.5" r=".6"></circle>',
  mic: '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  ext: '<path d="M7 17 17 7M9 7h8v8"></path>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.3" cy="6.7" r=".8" fill="#FF4FA3"></circle>',
  soundcloud: '<path d="M3 14v3M6 12v5M9 10v7M12 8v9"></path><path d="M15 8.5a4 4 0 0 1 5.6 3.6A2.5 2.5 0 0 1 20 17h-5z"></path>',
  spotify: '<circle cx="12" cy="12" r="9"></circle><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.2-.4 7.3.8M8.6 15.4c2-.5 4-.3 5.6.6"></path>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"></rect><path d="m10 9 5 3-5 3z"></path>',
  // artboard'da çizilmeyen (5/10 yıl, sınırlı/dolu) rozetler: registry gövdeleri (award / trophy / clock / lock)
  award: '<circle cx="12" cy="9" r="5.5"></circle><path d="m8.5 13.5-2 7.5 5.5-3 5.5 3-2-7.5"></path>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5"></path>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
};
const ico = (k, size, sw = "2", color) => svgRaw(P[k], { size, sw, color });
const starSvg = (size, fill = "#FFD700", extra) => svgRaw(P.star, { size, fill: fill !== "none", color: fill === "none" ? "#FFD700" : fill, ...(extra || {}) });

const ACCENT = "#FF4FA3";
const ID_PREFIX = "dk-sanatci-detay-";
// Artboard GR paleti (yorum avatarları; ad karakter kodu toplamı % 6) — customer.js AV_GRADS ile aynı
const GR = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#06B6D4", "#0891B2"], ["#EC4899", "#BE185D"]];
const nameGrad = (n) => { const g = GR[[...String(n || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % GR.length]; return `linear-gradient(135deg, ${g[0]}, ${g[1]})`; };

// ── Legacy mantığının birebir kopyaları (customer.js / ui.js'te dışa aktarılmıyor) ──
function yearsSince(v) { const t = toMs(v); if (t == null) return null; return (Date.now() - t) / (365.25 * 86400e3); }
function memberInfo(u) {          // memberChip
  const y = yearsSince(u.createdAt); if (y == null) return null;
  return y >= 10 ? { ic: "trophy", c: "#F59E0B", label: "10 Yıllık Üye" } : y >= 5 ? { ic: "award", c: "#C0C0C8", label: "5 Yıllık Üye" } : y >= 1 ? { ic: "ribbon", c: "#CD7F32", label: "1 Yıllık Üye" } : null;
}
function membershipLabel(u) {     // membershipText → "1 yıldır" / "7 aydır"
  const y = yearsSince(u.createdAt); if (y == null) return null;
  return y >= 1 ? Math.floor(y) + " yıldır" : Math.max(1, Math.floor(y * 12)) + " aydır";
}
function residencyText(p) {       // profileResidency: önce aktif anlaşma (residentVenue/residentDays), yoksa elle girilen
  const rv = String(p.residentVenue || "").trim();
  let when, venue;
  if (rv) { venue = rv; when = String(p.residentDays || "").trim(); }
  else {
    venue = String(p.residencyVenue || "").trim();
    if (!venue) return null;
    const d = p.residencyDay || "";
    when = d ? (d === "Her gün" ? "Her gün" : "Her " + d) : "";
  }
  return [when, venue].filter(Boolean).join(" — ");
}
const residentVenueName = (p) => String(p.residentVenue || p.residencyVenue || "").trim();
const AVAIL = { open: ["Rezervasyona açık", "#7CE0B0", "checkCircle"], limited: ["Sınırlı müsaitlik", "#FF8A2A", "clock"], busy: ["Şu an dolu", "#8A8E97", "lock"] };
const EQ = { yes: "Ekipmanı getiriyor", no: "Ekipman mekandan", partial: "Kısmen getiriyor" };
const CANCEL = { flexible: ["Esnek İptal", "#7CE0B0"], moderate: ["Orta İptal", "#FF8A2A"], strict: ["Katı İptal", "#FF5A6E"] };
const moneyText = (v) => { const s = String(v ?? "").trim(); return s ? (/^[\d.]/.test(s) ? "₺" + s : s) : null; };   // rateCardBlock/addOnsBlock
function socialUrl(key, val) {
  const s = String(val || "").trim(); if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const hn = s.replace(/^@/, "");
  if (key === "instagram") return "https://instagram.com/" + hn;
  if (key === "soundcloud") return "https://soundcloud.com/" + hn;
  if (key === "youtube") return "https://www.youtube.com/results?search_query=" + encodeURIComponent(s);
  return "https://open.spotify.com/search/" + encodeURIComponent(s);
}
function socialHandle(key, val) {
  const s = String(val || "").trim();
  if (/^https?:\/\//i.test(s)) {
    try { const u = new URL(s); return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/+$/, ""); } catch { return s; }
  }
  return key === "instagram" ? "@" + s.replace(/^@/, "") : s;
}
function videoInfo(url) {         // ui.js videoInfo (dışa aktarılmıyor) — aynı regex'ler
  const u = String(url || "").trim(); if (!u) return null; let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/))) return { kind: "YOUTUBE", embed: "https://www.youtube.com/embed/" + m[1] + "?autoplay=1", thumb: "https://img.youtube.com/vi/" + m[1] + "/hqdefault.jpg" };
  if ((m = u.match(/vimeo\.com\/(\d+)/))) return { kind: "VIMEO", embed: "https://player.vimeo.com/video/" + m[1] + "?autoplay=1", thumb: null };
  return null;
}
const parsePrice = (v) => { const s = String(v ?? "").trim(); if (!/^[\d.]+(,\d+)?$/.test(s)) return null; const n = Number(s.replace(/\./g, "").replace(",", ".")); return n > 0 ? n : null; };
function startPrice(a) {          // priceBadge değeri; yoksa paketlerin en küçük sayısal fiyatı
  if (a.priceType && (a.priceMin || a.priceMax)) {
    const v = a.priceMin || a.priceMax;
    const n = parsePrice(v);
    return { fixed: a.priceType === "fixed", text: n ? fmtTL(n) : moneyText(v) };
  }
  const nums = (Array.isArray(a.packages) ? a.packages : []).map((p) => parsePrice(p?.price)).filter((n) => n != null);
  return nums.length ? { fixed: false, text: fmtTL(Math.min(...nums)) } : null;
}
function featuredReviewOf(reviews) {   // ui.js featuredReview seçimi
  const rated = (reviews || []).filter((r) => (r.rating || 0) > 0 && String(r.comment || "").trim().length > 0);
  if (!rated.length) return null;
  rated.sort((a, b) => (b.rating - a.rating) || ((toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0)));
  return rated[0];
}

// ── Tarih biçimleri (artboard: gün sıfırsız, ay TR kısa) ──
const dmy = (v) => { const t = toMs(v); if (t == null) return ""; const d = new Date(t); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`; };  // "25 Eyl 2026"
// Başlamış ama bitmemiş etkinlik "SIRADAKİ" değil: "ŞU AN SAHNEDE" (masaüstü canlı penceresi helpers.isLive)
const nextKicker = (ms, live) => { const d = new Date(ms); return `${live ? "ŞU AN SAHNEDE" : "SIRADAKİ"} · ${trUpper(DAYS_TR_SHORT[d.getDay()])} ${d.getDate()} ${trUpper(MONTHS_TR_SHORT[d.getMonth()])} · ${fmtTime(ms)}`; };
// Yayında olmayan etkinlik durumları (functions/rankings.js NON_PUBLISHED ile aynı küme; legacy public listeler yalnız "upcoming" gösterir).
// "completed"/"past" yalnız yaklaşanlardan düşer (geçmiş performanslarda kalır).
const UNPUBLISHED = new Set(["cancelled", "canceled", "draft", "deleted", "pending", "rejected", "archived"]);
const DONE_STATUS = new Set(["completed", "past"]);
const evStatus = (e) => String(e?.status || "").toLowerCase();
const isPublishedEv = (e) => !!e && !UNPUBLISHED.has(evStatus(e)) && !/^cancel/.test(evStatus(e)) && e.isDraft !== true && e.cancelled !== true;
const fmtAvg = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1);
const reduceMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// Mesaj rotası role göre (panel rolleri #/mesajlar'ı açamaz)
const MSG_ROUTE = { customer: "#/mesajlar", artist: "#/artist/mesaj", venue: "#/venue/mesaj", organizer: "#/organizer/mesaj" };

// ── Küçük parçalar ──
const monoLabel = (text, cls) => h("span", { class: cx("dk-sanatci-detay-lbl", cls) }, text);
function pillChip(label, color, icon, { bdA = 0.45, bgA = 0.1 } = {}) {   // kimlik rozeti: 28px, r14, 12.5/600, ikon 13
  return h("span", { class: "dk-sanatci-detay-pill", style: { color, borderColor: rgba(color, bdA), background: rgba(color, bgA) } },
    icon ? ico(icon, 13) : null, label);
}
const infoChip = (label, color, icon, bdA = 0.4, bgA = 0.08) => h("span", { class: "dk-sanatci-detay-ichip", style: { color, borderColor: rgba(color, bdA), background: rgba(color, bgA) } }, icon ? ico(icon, 12) : null, label);
function starRow(n, size, { gap = 3, stroke = false, label } = {}) {
  const k = Math.max(0, Math.min(5, Number(n) || 0));
  const row = h("span", { class: "dk-sanatci-detay-stars", style: { gap: gap + "px" }, role: label ? "img" : null, "aria-label": label || null, "aria-hidden": label ? null : "true" });
  for (let i = 1; i <= 5; i++) {
    const on = i <= k;
    row.append(stroke
      ? svgRaw(P.star, { size, sw: "1.4", color: "#FFD700", attrs: { fill: on ? "#FFD700" : "none", "stroke-linecap": null } })
      : svgRaw(P.star, { size, fill: true, color: on ? "#FFD700" : "#2C303A" }));
  }
  if (stroke) row.querySelectorAll("svg").forEach((s) => s.removeAttribute("stroke-linecap"));
  return row;
}

// SHARED-CANDIDATE: cards.eventCard'ın Sanatçı/Mekan profil varyantı — `kicker:"when"` noktasız, alt satır "sanatçı · mekan" ve köşe
// rozeti çerçeveli çiziliyor; artboard (WebSanatci 245–266) noktalı "CUM 23:00", yalnız mekan adı ve DOLU pembe RESIDENT rozeti istiyor.
// Burada kart yine cards.js'ten alınıp üç fark yerel olarak uygulanıyor (CSS: .dk-sanatci-detay .dk-ecd-corner). eventCard'a
// `sub: "venue"` + `kickerDot` + `corner.solid` seçenekleri eklenirse bu yama kalkar (WebMekan'ın "BU GECE" rozeti de aynı).
// Artboard profil kartında durum rozetleri (YOĞUN İLGİ / VIP / ŞİMDİ POPÜLER / YENİ) yok → `badge: false`; yalnız RESIDENT köşesi.
function profileEventCard(e, { artistGenre, resident }) {
  const card = eventCard(e, { media: 168, kicker: "when", footer: "cta", titleSize: 18, badge: false, corner: resident ? { label: "RESIDENT", color: ACCENT } : null });
  const g = primaryGenre(e) || artistGenre;
  const c = g ? genreColor(g) : "#A3A7AF";
  const k = card.querySelector(".dk-ecd-k");
  if (k) { k.style.color = c; k.prepend(h("span", { class: "dk-ecd-dot", style: { background: c } })); }
  const s = card.querySelector(".dk-ecd-s");
  if (s) { if (e.venueName) s.textContent = e.venueName; else s.remove(); }
  if (resident) card.querySelector(".dk-ecd-corner")?.classList.add("dk-sanatci-detay-corner");
  return card;
}

// SHARED-CANDIDATE: ReviewModal (public-b WebEtkinlik §4 "Modal (review)") — Sanatçı/Mekan/Etkinlik ortak; burada hedef seçimi yok.
// Mevcut yorum (reviews/{uid}_{artistId}) varsa önceden doldurulur ve yalnız rating + comment güncellenir (updateMyReview — app
// MyReviewsScreen yolu): eventId/event (geçmiş performans satırının puanı) ve createdAt korunur. WebMekan reviewModal ile aynı akış.
// Gönder her zaman tıklanabilir (aria-disabled yalnız görsel/AT ipucu); eksikte legacy iletileri modalın role=alert alanında.
function reviewModal(a, existing, onDone) {
  const editing = !!(existing && existing.id);
  let busy = false;
  let rating =Math.max(0, Math.min(5, Math.round(Number(existing?.rating) || 0)));
  const stars = [];
  const group = h("div", { role: "radiogroup", "aria-label": "Puan", class: "dk-sanatci-detay-rvm-stars" });
  const paint = () => stars.forEach((b, i) => {
    const on = i + 1 <= rating;
    b.setAttribute("aria-checked", i + 1 === rating ? "true" : "false");
    b.tabIndex = (rating ? i + 1 === rating : i === 0) ? 0 : -1;
    const svg = b.firstChild; svg.setAttribute("fill", on ? "#FFD700" : "none"); svg.setAttribute("stroke", on ? "#FFD700" : "#5E636D");
  });
  for (let i = 1; i <= 5; i++) {
    const b = h("button", { type: "button", role: "radio", class: "dk-sanatci-detay-rvm-star", "aria-label": `${i} yıldız` },
      svgRaw(P.star, { size: 36, sw: "1.5", color: "#5E636D" }));
    b.addEventListener("click", () => { rating = i; paint(); validate(); });
    stars.push(b); group.append(b);
  }
  group.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    rating = Math.max(1, Math.min(5, (rating || 0) + (e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1)));
    paint(); validate(); stars[rating - 1].focus();
  });
  const taId = "dk-sanatci-detay-rvm-ta", cntId = "dk-sanatci-detay-rvm-cnt";
  const ta = h("textarea", { id: taId, rows: 4, maxlength: 500, class: "dk-ta dk-in dk-inp-bg-stratum dk-sanatci-detay-rvm-ta", placeholder: "Yorumunuzu yazın... (en az 10 karakter)", "aria-describedby": cntId });
  ta.value = existing?.comment || "";
  // sayaç canlı bölge değil (her tuşta okunmasın) — textarea'ya aria-describedby ile bağlı; doğrulama hatası modalın role=alert alanında
  const cnt = h("span", { id: cntId, class: "dk-sanatci-detay-rvm-cnt" });
  const m = dkModal({
    title: editing ? "Yorumunu güncelle" : "Puan & Yorum", sub: a.displayName || a.name || "", variant: "panel", size: 480, serifTitle: true, cls: "dk-sanatci-detay-mdl",
    body: [group, h("label", { for: taId, class: "dk-lbl" }, "YORUMUN"), h("div", { class: "dk-sanatci-detay-rvm-tawrap" }, ta, cnt)],
    initialFocus: stars[Math.max(0, rating - 1)],
    actions: [
      { label: "İptal", variant: "outline" },
      { label: editing ? "Güncelle" : "Gönder", variant: "primary", keepOpen: true, onClick: async (close, btn) => {
        if (busy) return false;
        const text = ta.value.trim();
        if (rating < 1) { m.setError("Puan seç"); return false; }
        if (text.length < 10) { m.setError("Yorum en az 10 karakter olmalı"); return false; }
        m.setError("");
        // disabled YOK: odaktaki düğme devre dışı kalınca Chrome odağı <body>'ye atar (klavye kullanıcısı modalda yerini kaybeder)
        busy = true; btn.setAttribute("aria-busy", "true"); btn.setAttribute("aria-disabled", "true");
        try {
          const me = session.user?.uid;
          if (editing) await updateMyReview("reviews", existing.id, { rating, comment: text });
          else {
            const myName = session.profile?.displayName || session.user?.displayName || "Kullanıcı";
            await submitArtistReview(me, myName, a, rating, text);
          }
          invalidateAccountCounts(me);
          dkToast(editing ? "Yorum güncellendi" : "Yorumun gönderildi");
          close("done");
          onDone?.();
        } catch (_) { dkToast(editing ? "Güncellenemedi" : "Gönderilemedi", { type: "err" }); }
        finally { busy = false; btn.removeAttribute("aria-busy"); validate(); }
        return false;
      } },
    ],
  });
  function validate() {
    const n = ta.value.trim().length;
    cnt.textContent = `${ta.value.length}/500` + (n < 10 ? " · en az 10 karakter" : "");
    cnt.classList.toggle("is-warn", n > 0 && n < 10);
    const ok = rating >= 1 && n >= 10;
    const send = m?.buttons?.[1];
    if (send) send.setAttribute("aria-disabled", ok && !busy ? "false" : "true");
    if (ok) m?.setError("");
  }
  ta.addEventListener("input", validate);
  paint(); validate();
  return m;
}

// Legacy bookingRequestModal (ui.js) — aynı alanlar, seçenekler, doğrulama ve mesaj metni; yeni modal görünümü.
function bookingModal(artistName, onSubmit) {
  const date = dkInput({ type: "date", size: 44 });
  const typeSel = dkSelect({ size: 44, options: ["Düğün", "Kurumsal Etkinlik", "Kulüp / Gece", "Özel Parti", "Festival", "Diğer"], value: "Düğün" });
  const type = typeSel.querySelector("select");
  const city = dkInput({ size: 44, placeholder: "Şehir / mekan" });
  const dur = dkInput({ size: 44, placeholder: "örn. 3 saat" });
  const budget = dkInput({ size: 44, placeholder: "örn. 8.000 ₺ (opsiyonel)" });
  const note = h("textarea", { rows: 3, class: "dk-ta dk-in dk-inp-bg-stratum", placeholder: "Ek not (opsiyonel)" });
  const f = (label, input) => dkField({ label, input }).node;
  let busy = false;
  const m = dkModal({
    title: "Teklif İste", variant: "panel", size: 520, serifTitle: true, cls: "dk-sanatci-detay-mdl dk-sanatci-detay-bkm",
    sub: (artistName || "Sanatçı") + " için teklif isteğin mesaj olarak iletilir; iletişim GigBridge içinde kalır.",
    body: [
      h("div", { class: "dk-sanatci-detay-bkm-row" }, f("Tarih", date), f("Etkinlik Türü", typeSel)),
      h("div", { class: "dk-sanatci-detay-bkm-row" }, f("Şehir / Mekan", city), f("Süre", dur)),
      f("Bütçe", budget), f("Not", note),
    ],
    initialFocus: date,
    actions: [
      { label: "İptal", variant: "outline" },
      { label: "Gönder", variant: "primary", icon: svgRaw(P.send, { size: 16, sw: "2.1" }), keepOpen: true, onClick: async (close, btn) => {
        if (busy) return false;
        if (!date.value && !city.value.trim() && !note.value.trim()) { m.setError("En az tarih ya da not gir."); return false; }
        m.setError("");
        const lines = ["🎫 Teklif İsteği"];
        if (date.value) lines.push("• Tarih: " + date.value);
        lines.push("• Etkinlik: " + type.value);
        if (city.value.trim()) lines.push("• Yer: " + city.value.trim());
        if (dur.value.trim()) lines.push("• Süre: " + dur.value.trim());
        if (budget.value.trim()) lines.push("• Bütçe: " + budget.value.trim());
        if (note.value.trim()) lines.push("• Not: " + note.value.trim());
        // disabled YOK (odak <body>'ye düşmesin); gönderim sürerken ikinci tık yok sayılır
        busy = true; btn.setAttribute("aria-busy", "true"); btn.setAttribute("aria-disabled", "true");
        let ok = false;
        try { ok = await onSubmit(lines.join("\n")); }
        finally { busy = false; btn.removeAttribute("aria-busy"); btn.setAttribute("aria-disabled", "false"); }
        if (ok) close("done");
        return false;
      } },
    ],
  });
  return m;
}

// Büyüteç (fotoğraf / video) — legacy lightbox + lightboxIframe karşılığı; dkModal: ESC, odak tuzağı, rota değişiminde kapanır.
function lightboxModal({ title, img, iframe }) {
  const media = img
    ? h("img", { src: img, alt: title, class: "dk-sanatci-detay-lb-img" })
    : h("div", { class: "dk-sanatci-detay-lb-video" }, h("iframe", { src: iframe, title, allow: "autoplay; fullscreen; encrypted-media", allowfullscreen: true, frameborder: "0" }));
  return dkModal({ title, variant: "panel", size: 960, align: "center", cls: "dk-sanatci-detay-lb", body: media });
}

// ══════════════════════════════════════════════════════════════════════
export function sanatciView(ctx) {
  const id = ctx.seg[2] || "";
  const unsubs = [];
  let dead = false;
  const shell = publicShell({ active: null });
  unsubs.push(() => shell.destroy());
  const root = h("div", { class: "dk-sanatci-detay" });
  shell.main.append(root);

  // Görünüm-başı durum
  let S = null;             // { a, revs, following, follCount, events }
  let tabPause = false, tabPauseT = 0;   // sekme tıklamasından sonra yumuşak kaydırma bitene dek otomatik izleme durur
  unsubs.push(() => clearTimeout(tabPauseT));
  const destroyPaint = [];  // her boyamada yenilenen dinleyiciler

  const cleanupPaint = () => { destroyPaint.splice(0).forEach((f) => { try { f(); } catch (_) {} }); };
  unsubs.push(cleanupPaint);
  let refocus = null;       // yenileme boyamasından sonra odaklanacak seçici (ör. yorum gönderildikten sonra "Yorum yap")

  // Sekme başlığı: "{ad} · GigBridge" (WCAG 2.4.2); görünüm kapanınca önceki başlık geri gelir
  const prevTitle = document.title;
  const setTitle = (n) => { if (!dead) document.title = `${n} · GigBridge`; };
  unsubs.push(() => { document.title = prevTitle; });

  // ── yükleme iskeleti ──
  function paintSkeleton() {
    root.replaceChildren(
      h("div", { class: "dk-sanatci-detay-skel", "aria-busy": "true", "aria-label": "Sanatçı yükleniyor" },
        h("div", { class: "dk-sanatci-detay-skel-cover" }),
        h("div", { class: "dk-container dk-sanatci-detay-skel-id" },
          dkSkeleton({ w: 200, h: 200, r: 100, cls: "dk-sanatci-detay-skel-av" }),
          h("div", { class: "dk-sanatci-detay-skel-col" }, dkSkeleton({ w: 180, h: 12 }), dkSkeleton({ w: 420, h: 64, r: 8 }), dkSkeleton({ w: 360, h: 16 }))),
        h("div", { class: "dk-container" }, h("div", { class: "dk-sanatci-detay-skel-band" }))));
  }
  function paintError(notFound) {
    cleanupPaint();
    root.replaceChildren(h("div", { class: "dk-container dk-sanatci-detay-state" },
      dkEmpty({ icon: "alertCircle", title: notFound ? "Sanatçı bulunamadı" : "Sanatçı yüklenemedi",
        sub: notFound ? "Bu sanatçı kaldırılmış olabilir." : "Bağlantını kontrol edip yeniden dene.",
        action: notFound
          ? dkButton("Keşfet'e dön", { variant: "outline", size: 44, href: "#/kesfet" })
          : dkButton("Tekrar dene", { variant: "outline", size: 44, onClick: () => load() }) })));
  }

  async function load({ refresh = false } = {}) {
    if (!id) { paintError(true); return; }   // "#/sanatci/" (boş kimlik): userById('') geçersiz belge yolu atar
    if (!refresh) paintSkeleton();
    const real = isRealUser();
    const me = session.user?.uid;
    let a;
    try {
      const [u, revs, following, follCount, events] = await Promise.all([
        userById(id),
        artistReviews(id).catch(() => []),
        real && me && me !== id ? isFollowing(me, id) : false,
        artistFollowerCount(id),
        eventsByArtist(id).catch(() => null),   // başarısızsa Etkinlikler bölümü + sıradaki kartı gizli
      ]);
      a = u;
      if (dead) return;
      // Yalnız sanatçı profilleri (legacy her users/{id}'yi sanatçı gibi çiziyordu → mekana "Takip Et" = yanlış new_follower bildirimi).
      // Mekan → kendi detay sayfası; dinleyici/organizatör/yönetici → bulunamadı. userType'ı olmayan eski kayıtlar sanatçı sayılır.
      if (a && a.userType && a.userType !== "artist") {
        if (a.userType === "venue") { location.replace("#/mekan/" + encodeURIComponent(id)); return; }
        a = null;
      }
      if (!a) { paintError(true); return; }
      S = { a, revs: revs || [], following: !!following, follCount, events };
    } catch (_) {
      if (!dead) paintError(false);
      return;
    }
    paint(refresh);
    setTitle(S.a.displayName || S.a.name || "Sanatçı");
    if (refocus) {
      const sel = refocus; refocus = null;
      const el = root.querySelector(sel);
      if (el) { try { el.focus({ preventScroll: true }); } catch (_) {} }
    }
  }

  // ════════════════════ BOYAMA ════════════════════
  function paint(refresh) {
    cleanupPaint();
    const { a, revs, events } = S;
    const me = session.user?.uid;
    const real = isRealUser();
    const role = !real ? "guest" : session.isAdmin ? "admin" : (session.profile?.userType || "customer");
    const self = real && me === id;
    const canFollow = !self && (role === "guest" || role === "customer" || role === "artist");
    const canMsg = !self && role !== "admin";
    // Teklif İste = serbest metinli teklif isteği mesajı (legacy bookingRequestModal → sendMessage). Spec + artboard: dinleyici, misafir (giriş
    // kapısı) ve sanatçı arayan panel rolleri (mekan / organizatör); sanatçı başka sanatçıya teklif istemez (legacy renderArtistDetail).
    const canOffer = !self && (role === "guest" || role === "customer" || role === "venue" || role === "organizer");
    const canReview = role === "guest" || role === "customer";

    const name = a.displayName || a.name || "Sanatçı";
    const genres = artistGenres(a);
    const g0 = genres[0] || "";
    const rated = revs.filter((r) => (r.rating || 0) > 0);
    const avgNum = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null;
    const avg = avgNum != null ? fmtAvg(avgNum) : "—";
    const custRevs = revs.filter((r) => (r.authorType ?? "customer") === "customer");
    const accent = /^#[0-9a-f]{6}$/i.test(a.accentColor || "") ? a.accentColor : ACCENT;
    const resText = residencyText(a);
    const resVenue = residentVenueName(a);
    let follCount = S.follCount != null ? S.follCount : Number(a.followerCount) || 0;
    const followerTextEls = [];
    const setFollowerText = () => followerTextEls.forEach((el) => { el.textContent = shortNumTR(Math.max(0, follCount)); });

    root.classList.toggle("is-refresh", !!refresh);
    root.style.setProperty("--dk-sanatci-detay-acc", accent);
    root.style.setProperty("--dk-sanatci-detay-acc-tint", rgba(accent, 0.2));

    // ── aksiyonlar ──
    // Masaüstü chat.js requestChat (dinamik içe aktarma — kardeş görünümlerle aynı) + `?c=` derin bağlantısı (konuşma yoksa taslak açar).
    // Legacy `pending` (js/pages/messages.js) yalnız chat.js yüklenemezse doldurulur: o durumda yönlendirici de legacy mesaj görünümüne düşer.
    // Aksi halde masaüstünün hiç okumadığı bayat hedef kalır ve sonra mobilde / başka oturumda o sohbeti açardı.
    const goMessages = () => {
      const t = { otherId: id, otherName: name };
      const my = session.user?.uid;
      const url = (MSG_ROUTE[role] || "#/mesajlar") + (my ? "?c=" + encodeURIComponent(convIdFor(my, id)) : "");
      import("../messages/chat.js")
        .then((m) => { if (typeof m.requestChat !== "function") throw new Error("no requestChat"); m.requestChat(t); })
        .catch(() => { try { legacyRequestChat(t); } catch (_) {} })
        .finally(() => { if (!dead) location.hash = url; });
    };
    const onMsg = () => { if (dkLoginGate("Mesaj göndermek")) return; goMessages(); };
    const onOffer = () => {
      if (dkLoginGate("Teklif göndermek")) return;
      bookingModal(name, async (text) => {
        try {
          const uidMe = session.user.uid;
          await sendMessage({ fromId: uidMe, fromName: session.profile?.displayName || "Ben", fromType: session.profile?.userType, toId: id, toName: name, text, convId: convIdFor(uidMe, id), isGroup: false });
          dkToast("Teklif isteğin gönderildi");
          goMessages();
          return true;
        } catch (_) { dkToast("Gönderilemedi", { type: "err" }); return false; }
      });
    };
    // Kendi mevcut yorumu (doc id `${uid}_${artistId}`) → modal önceden dolu "Yorumunu güncelle"
    const mine = real && me ? revs.find((r) => r.id === `${me}_${id}` && r.authorId === me) || null : null;
    const onReview = () => {
      if (dkLoginGate("Yorum yapmak")) return;
      // yenileme kimlik satırını yeniden kurar → odak yeni "Yorum yap" düğmesine (aksi halde <body>'ye düşer)
      reviewModal(a, mine, () => { refocus = ".dk-sanatci-detay-act.is-rv"; load({ refresh: true }); });
    };

    let following = S.following;
    let followBusy = false;
    const followBtns = [];
    const paintFollow = () => followBtns.forEach((b) => {
      b.classList.toggle("is-on", following);
      b.setAttribute("aria-pressed", following ? "true" : "false");
      b.replaceChildren(ico(following ? "checkCircle" : "userPlus", 17), h("span", {}, following ? "Takipte" : "Takip Et"));
    });
    const onFollow = async () => {
      if (dkLoginGate("Takip etmek")) return;
      if (followBusy) return;   // yazım sürerken ikinci tık yok sayılır (disabled DEĞİL: odaktaki düğme devre dışı kalınca odak <body>'ye düşer)
      const next = !following;
      following = next; follCount += next ? 1 : -1; S.following = next; S.follCount = follCount;
      paintFollow(); setFollowerText();
      followBusy = true;
      followBtns.forEach((b) => b.setAttribute("aria-busy", "true"));   // kimlik satırı + yan kart düğmesi (sanatçı görünümü) birlikte
      try {
        if (next) await followArtist(me, a); else await unfollowArtist(me, id);
        invalidateAccountCounts(me);   // hesap kabuğunun "Takip" sayacı
        dkToast(next ? "Takip ediliyor" : "Takipten çıkıldı");
      } catch (_) {
        following = !next; follCount += next ? -1 : 1; S.following = following; S.follCount = follCount;
        paintFollow(); setFollowerText();
        dkToast("İşlem başarısız", { type: "err" });
      } finally { followBusy = false; followBtns.forEach((b) => b.removeAttribute("aria-busy")); }
    };
    const followButton = () => {
      const b = h("button", { type: "button", class: "dk-sanatci-detay-act dk-sanatci-detay-follow dk-press", "aria-label": null });
      b.addEventListener("click", onFollow);
      followBtns.push(b);
      return b;
    };

    // ════════ 1. KAPAK ════════
    const cover = h("section", { class: "dk-sanatci-detay-cover", "aria-label": "Kapak" },
      a.bannerUrl ? (() => {
        const img = h("img", { class: "dk-sanatci-detay-cover-img dk-kb", src: a.bannerUrl, alt: "", decoding: "async" });
        img.addEventListener("error", () => img.remove(), { once: true });
        return img;
      })() : null,
      h("span", { class: "dk-sanatci-detay-cover-tint", "aria-hidden": "true" }),
      h("span", { class: "dk-sanatci-detay-cover-scrim", "aria-hidden": "true" }),
      h("div", { class: "dk-container dk-sanatci-detay-cover-in" },
        dkBreadcrumb({ variant: "mono-overlay", back: () => { if (history.length > 1) history.back(); else location.hash = "#/kesfet"; },
          items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Sanatçılar" }, { label: name }] })));

    // ════════ 2. KİMLİK ════════
    const avatarInner = a.photoURL
      ? (() => {
        const img = h("img", { src: a.photoURL, alt: `${name} portresi`, class: "dk-sanatci-detay-av-img", decoding: "async" });
        img.addEventListener("error", () => img.replaceWith(avatarInitial(name, g0, 200)), { once: true });
        return img;
      })()
      : avatarInitial(name, g0, 200);
    const avatar = a.photoURL
      ? h("button", { type: "button", class: "dk-sanatci-detay-av", title: "Büyüt", "aria-label": `${name} fotoğrafını büyüt`, onclick: () => lightboxModal({ title: `${name} fotoğrafı`, img: a.photoURL }) }, avatarInner)
      : h("div", { class: "dk-sanatci-detay-av" }, avatarInner);
    const loc = [a.city, a.district].filter(Boolean).join(" · ");
    const nameParts = name.trim().split(/\s+/);
    const h1 = h("h1", { id: "dk-sanatci-detay-h-name", class: "dk-sanatci-detay-h1" },
      nameParts.length > 1 ? [nameParts.slice(0, -1).join(" ") + " ", h("em", {}, nameParts[nameParts.length - 1])] : name);
    const trusted = avgNum != null && avgNum >= 4.5 && rated.length >= 5;
    const av = AVAIL[a.availabilityStatus];
    const mem = memberInfo(a);
    const memText = membershipLabel(a);
    const badges = [
      trusted ? pillChip("Güvenilir Sanatçı", "#7CE0B0", "shieldCheck") : null,
      av ? pillChip(av[0], av[1], av[2], { bdA: 0.4, bgA: 0.08 }) : null,
      mem ? pillChip(mem.label, mem.c, mem.ic) : null,
      memText ? h("span", { class: "dk-sanatci-detay-memtext" }, "GigBridge üyesi · " + memText) : null,
    ].filter(Boolean);
    const actions = [];
    if (canFollow) actions.push(followButton());
    if (canMsg) actions.push(h("button", { type: "button", class: "dk-sanatci-detay-act dk-press", onclick: onMsg }, ico("chat", 17, "1.9"), h("span", {}, "Mesaj")));
    if (canOffer) actions.push(h("button", { type: "button", class: "dk-sanatci-detay-act is-pink dk-press", onclick: onOffer }, ico("send", 16, "2.1"), h("span", {}, "Teklif İste")));
    const identity = h("section", { class: "dk-container dk-sanatci-detay-id", "aria-labelledby": "dk-sanatci-detay-h-name" },
      h("div", { class: "dk-sanatci-detay-avwrap dk-rise" }, avatar,
        a.availabilityStatus === "open" ? h("span", { class: "dk-sanatci-detay-avdot", "aria-hidden": "true" }) : null),
      h("div", { class: "dk-sanatci-detay-info dk-rise", style: { "--dk-delay": "80ms" } },
        h("div", { class: "dk-sanatci-detay-eb" },
          h("span", { class: "dk-sanatci-detay-eb-role" }, "SANATÇI"),
          g0 ? dkGenreTag(g0, { variant: "pill" }) : null,
          loc ? h("span", { class: "dk-sanatci-detay-loc" }, ico("pin", 14, "2", "#4ED8FF"), loc) : null),
        h1,
        a.tagline ? h("p", { class: "dk-sanatci-detay-tagline" }, a.tagline) : null,
        badges.length ? h("div", { class: "dk-sanatci-detay-badges" }, ...badges) : null),
      actions.length ? h("div", { class: "dk-sanatci-detay-acts dk-rise", style: { "--dk-delay": "140ms" } }, ...actions) : null);

    // ════════ 3. İSTATİSTİK BANDI ════════
    const follStat = h("span", { class: "dk-sanatci-detay-stat-v" }, "");
    followerTextEls.push(follStat);
    const stats = h("div", { class: "dk-container" },
      h("section", { class: "dk-sanatci-detay-stats", "aria-label": "İstatistikler" },
        h("div", { class: "dk-sanatci-detay-stat is-first" },
          h("span", { class: "dk-sanatci-detay-stat-v" }, starSvg(22), avg),
          h("span", { class: "dk-sanatci-detay-stat-l" }, "PUAN")),
        h("span", { class: "dk-sanatci-detay-stat-div", "aria-hidden": "true" }),
        h("div", { class: "dk-sanatci-detay-stat" }, follStat, h("span", { class: "dk-sanatci-detay-stat-l" }, "TAKİPÇİ")),
        h("span", { class: "dk-sanatci-detay-stat-div", "aria-hidden": "true" }),
        h("div", { class: "dk-sanatci-detay-stat" }, h("span", { class: "dk-sanatci-detay-stat-v" }, String(revs.length)), h("span", { class: "dk-sanatci-detay-stat-l" }, "YORUM")),
        resText ? h("div", { class: "dk-sanatci-detay-res" }, h("span", { class: "dk-sanatci-detay-res-tag" }, "RESIDENT"), h("span", { class: "dk-sanatci-detay-res-t" }, resText)) : null));

    // ════════ 4. BÖLÜMLER (sol kolon) ════════
    const sections = [];   // { key, label, eyebrow, node, h2 }
    const secHead = (key, eyebrowLabel, titleNodes, right) => {
      const eb = h("span", { class: "dk-sanatci-detay-sh-eb" });
      const h2 = h("h2", { id: ID_PREFIX + "h-" + key, class: "dk-sanatci-detay-h2", tabindex: "-1" }, ...titleNodes);
      const col = h("div", { class: "dk-sanatci-detay-sh" }, eb, h2);
      return { head: right ? h("div", { class: "dk-sanatci-detay-shrow" }, col, right) : col, eb, h2, label: eyebrowLabel };
    };
    const addSection = (key, tabLabel, head, ...kids) => {
      const node = h("section", { id: ID_PREFIX + key, class: cx("dk-sanatci-detay-sec"), "aria-labelledby": head.h2.id }, head.head, ...kids);
      sections.push({ key, tabLabel, node, eb: head.eb, label: head.label, h2: head.h2 });
      return node;
    };

    // Çaldığı mekanlar (legacy venueChips): mekan yorumları (authorId = mekan uid) — etkinlik sorgusundan bağımsız; geçmiş etkinlikler
    // yüklenirse onların (venueId, venueName) çiftleri önce gelir (02 bölümünde birleştirilir).
    const reviewVenues = new Map();
    revs.forEach((r) => { if (r.authorType !== "venue") return; const n = String(r.authorName || r.venueName || "").trim(); if (n && !reviewVenues.get(n)) reviewVenues.set(n, r.authorId || null); });
    const venueChipList = (list) => h("div", { class: "dk-sanatci-detay-vchips" }, ...list.map(([n, vid]) => {
      const inner = [ico("building", 13, "1.9", "#FF8A2A"), h("span", {}, n)];
      return vid ? h("a", { href: "#/mekan/" + encodeURIComponent(vid), class: "dk-sanatci-detay-vchip dk-press" }, ...inner) : h("span", { class: "dk-sanatci-detay-vchip" }, ...inner);
    }));

    // ── 01 HAKKINDA ──
    {
      const head = secHead("hakkinda", "HAKKINDA", ["Sahnenin arkasındaki ", h("em", {}, "isim")]);
      const meta = [];
      if (a.experienceYears) meta.push(h("span", { class: "dk-sanatci-detay-exp" }, ico("clock", 15, "1.9"), a.experienceYears + " yıl deneyim"));
      if (a.experienceYears && genres.length) meta.push(h("span", { class: "dk-sanatci-detay-vdiv", "aria-hidden": "true" }));
      if (genres.length) meta.push(monoLabel("MÜZİK TARZLARI"), h("div", { class: "dk-sanatci-detay-chips" }, ...genres.map((g) => h("span", { class: "dk-sanatci-detay-gchip" }, g))));
      addSection("hakkinda", "Hakkında", head,
        h("p", { class: cx("dk-sanatci-detay-bio", !a.bio && "is-dim") }, a.bio || "Sanatçı henüz biyografi eklememiş."),
        meta.length ? h("div", { class: "dk-sanatci-detay-meta" }, ...meta) : null,
        // etkinlik sorgusu başarısızsa (02 gizli) mekan çipleri burada kalır — legacy özelliği kaybolmasın
        !Array.isArray(events) && reviewVenues.size ? h("div", { class: "dk-sanatci-detay-vblock" }, monoLabel("ÇALDIĞI MEKANLAR", "is-14"), venueChipList([...reviewVenues.entries()].slice(0, 10))) : null,
        featuredSetCard(a.featuredSetUrl),
        featuredReviewFigure(featuredReviewOf(revs)));
    }

    // ── 02 ETKİNLİKLER ──
    let upcoming = [];
    if (Array.isArray(events)) {
      const valid = events.filter((e) => isPublishedEv(e) && eventStartMs(e) != null);
      upcoming = valid.filter((e) => !isEventOver(e) && !DONE_STATUS.has(evStatus(e))).sort((x, y) => eventStartMs(x) - eventStartMs(y));
      const past = valid.filter((e) => isEventOver(e) || DONE_STATUS.has(evStatus(e))).sort((x, y) => eventStartMs(y) - eventStartMs(x));
      // Çaldığı mekanlar: geçmiş etkinliklerin (venueId, venueName) + mekan yorumları (legacy venueChips; authorId = mekan uid)
      const venues = new Map();
      past.forEach((e) => { const n = String(e.venueName || "").trim(); if (n && !venues.has(n)) venues.set(n, e.venueId || null); });
      reviewVenues.forEach((vid, n) => { if (!venues.has(n)) venues.set(n, vid); else if (!venues.get(n) && vid) venues.set(n, vid); });
      const venueList = [...venues.entries()].slice(0, 10);
      if (upcoming.length || past.length || venueList.length) {
        // İlk görünüm: bir sıra (3 kolon ≥1280) / iki sıra (2 kolon ≤1279) — yetim kart bırakmasın
        const mqCols = window.matchMedia("(max-width: 1279px)");
        const limit = () => (mqCols.matches ? 4 : 3);
        let showAll = false;
        const grid = h("div", { class: "dk-sanatci-detay-evgrid", id: ID_PREFIX + "evgrid" });
        const moreLbl = h("span", {}, "Tümünü gör");
        const more = upcoming.length > 3
          ? h("button", { type: "button", class: "dk-sanatci-detay-more dk-link", "aria-controls": grid.id, "aria-expanded": "false" }, moreLbl, ico("arrow", 15, "2"))
          : null;
        const cards = upcoming.map((e) => profileEventCard(e, { artistGenre: g0, resident: !!resVenue && String(e.venueName || "").trim() === resVenue }));
        const drawGrid = () => {
          const n = limit();
          grid.replaceChildren(...(showAll ? cards : cards.slice(0, n)));
          if (more) {
            more.hidden = cards.length <= n;
            moreLbl.textContent = showAll ? "Daha az göster" : "Tümünü gör";
            more.setAttribute("aria-expanded", showAll ? "true" : "false");
          }
        };
        if (more) more.addEventListener("click", () => { showAll = !showAll; drawGrid(); });
        mqCols.addEventListener("change", drawGrid);
        destroyPaint.push(() => mqCols.removeEventListener("change", drawGrid));
        drawGrid();
        const head = secHead("etkinlikler", "ETKİNLİKLER", ["Yaklaşan etkinlikler"], more);
        const pastRating = (ev) => {
          const rs = revs.filter((r) => r.eventId === ev.id && (r.rating || 0) > 0);
          return rs.length ? fmtAvg(rs.reduce((s, r) => s + r.rating, 0) / rs.length) : null;
        };
        const pastBlock = (past.length || venueList.length) ? h("div", { class: "dk-sanatci-detay-past" },
          h("div", { class: "dk-sanatci-detay-past-head" },
            h("h3", { class: "dk-sanatci-detay-h3" }, "Geçmiş performanslar"),
            venueList.length ? h("span", { class: "dk-sanatci-detay-lbl is-14" }, "ÇALDIĞI MEKANLAR") : null),
          venueList.length ? venueChipList(venueList) : null,
          past.length ? h("ul", { class: "dk-sanatci-detay-rows", "aria-label": "Geçmiş performanslar" }, ...past.slice(0, 5).map((e) => {
            const r = pastRating(e);
            return h("li", { class: "dk-sanatci-detay-row dk-row" },
              h("span", { class: "dk-sanatci-detay-row-d" }, trUpper(dmy(eventStartMs(e)))),
              h("span", { class: "dk-sanatci-detay-row-t" }, h("span", { class: "dk-sanatci-detay-row-tt" }, evTitle(e)), e.venueName ? h("span", { class: "dk-sanatci-detay-row-tv" }, e.venueName) : null),
              h("span", { class: "dk-sanatci-detay-row-v" }, e.venueName || ""),
              h("span", { class: "dk-sanatci-detay-row-r" }, r ? [starSvg(13), r] : null, r ? null : h("span", { class: "dk-sr" }, "Puan yok")));
          })) : null) : null;
        addSection("etkinlikler", "Etkinlikler", head,
          upcoming.length ? grid : h("div", { class: "dk-sanatci-detay-noev" }, "Planlanmış yaklaşan etkinlik yok."),
          pastBlock);
      }
    }

    // ── 03 BOOKING (paketler + bilgi kartları + reel) ──
    {
      const pkgs = (Array.isArray(a.packages) ? a.packages : []).filter((p) => p && (p.name || p.price));
      const pkgTypes = pkgs.map((p) => (Array.isArray(p.eventTypes) ? p.eventTypes.filter(Boolean) : []));
      const union = [...new Set(pkgTypes.flat())];
      let pkgBlock = null, segEl = null;
      if (pkgs.length) {
        const cards = pkgs.map((p, i) => h("div", { class: "dk-sanatci-detay-pkg" },
          h("div", { class: "dk-sanatci-detay-pkg-top" },
            h("span", { class: "dk-sanatci-detay-pkg-n" }, p.name || "Paket"),
            moneyText(p.price) ? h("span", { class: "dk-sanatci-detay-pkg-p" }, moneyText(p.price)) : null),
          (p.includes || pkgTypes[i].length) ? h("div", { class: "dk-sanatci-detay-pkg-chips" },
            ...String(p.includes || "").split(/[,;]/).map((t) => t.trim()).filter(Boolean).map((t) => h("span", { class: "dk-sanatci-detay-pkg-inc" }, t)),
            ...pkgTypes[i].map((t) => h("span", { class: "dk-sanatci-detay-pkg-type" }, t))) : null,
          p.desc ? h("p", { class: "dk-sanatci-detay-pkg-d" }, p.desc) : null));
        const grid = h("div", { class: "dk-sanatci-detay-pkgs", id: ID_PREFIX + "pkgs" }, ...cards);
        if (union.length >= 2) {
          segEl = dkSegmented({ size: 36, label: "Etkinlik türü", cls: "dk-sanatci-detay-seg", value: "",
            items: [{ key: "", label: "Tümü" }, ...union.map((t) => ({ key: t, label: t }))],
            onChange: (k) => cards.forEach((c, i) => c.classList.toggle("is-dim", !!k && !pkgTypes[i].includes(k))) });
          segEl.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute("aria-controls", grid.id));
        }
        pkgBlock = grid;
      }
      const info = [];
      const et = (a.eventTypes || []).filter(Boolean), sf = (a.setFormats || []).filter(Boolean);
      if (et.length || sf.length) info.push(infoCard("NE İÇİN UYGUN", h("div", { class: "dk-sanatci-detay-ichips" },
        ...et.map((t) => infoChip(t, "#FF8A2A")), ...sf.map((t) => infoChip(t, "#4ED8FF")))));
      const svc = (a.serviceCities || []).filter(Boolean), travel = String(a.travelFee || "").trim();
      if (svc.length || travel) {
        const all = [...new Set([a.city, ...svc].filter(Boolean))];
        info.push(infoCard("HİZMET BÖLGESİ",
          all.length ? h("div", { class: "dk-sanatci-detay-ichips" }, ...all.map((c) => infoChip(c, "#4ED8FF"))) : null,
          travel ? h("span", { class: "dk-sanatci-detay-travel" }, ico("car", 15, "1.9"), travel) : null));
      }
      const rider = [];
      if (a.equipmentBrings && EQ[a.equipmentBrings]) rider.push(["Ekipman", EQ[a.equipmentBrings]]);
      if (String(a.minDuration || "").trim()) rider.push(["Min. Süre", a.minDuration]);
      if (String(a.setupTime || "").trim()) rider.push(["Kurulum Süresi", a.setupTime]);
      if (rider.length) info.push(infoCard("KURULUM & DETAYLAR", ...rider.map(([k, v]) => kvRow(k, v)), { kv: true }));
      const langs = (Array.isArray(a.languages) ? a.languages : []).filter(Boolean);
      const mc = !!a.mcAbility;
      const dep = String(a.depositNote || "").trim();
      const cancel = CANCEL[a.cancellationPolicy];
      if (langs.length || mc || dep || cancel) {
        const lbl = (langs.length || mc) && (dep || cancel) ? "DİLLER & ŞARTLAR" : (langs.length || mc) ? "DİLLER" : "ŞARTLAR";
        info.push(infoCard(lbl,
          (langs.length || mc) ? h("div", { class: "dk-sanatci-detay-ichips" }, ...langs.map((l) => infoChip(l, "#4ED8FF")), mc ? infoChip("MC yapabilir", "#FFD700", "mic", 0.4, 0.06) : null) : null,
          dep ? h("div", { class: "dk-sanatci-detay-kapora" }, h("span", { class: "dk-sanatci-detay-kv-k" }, "Kapora"), h("span", { class: "dk-sanatci-detay-kv-v" }, dep)) : null,
          cancel ? h("span", { class: "dk-sanatci-detay-cancel" }, infoChip(cancel[0], cancel[1], "shield", 0.45, 0.08)) : null));
      }
      const addOns = (Array.isArray(a.addOns) ? a.addOns : []).filter((x) => x && (x.name || x.price));
      if (addOns.length) info.push(infoCard("EK HİZMETLER", ...addOns.map((x) => kvRow(x.name || "Ek hizmet", moneyText(x.price) || "")), { kv: true }));

      const vids = (a.videoUrls || []).map(videoInfo).filter(Boolean).slice(0, 6);
      const reel = vids.length ? h("div", { class: "dk-sanatci-detay-reel" },
        monoLabel("PERFORMANS REEL"),
        h("div", { class: "dk-sanatci-detay-reelgrid" }, ...vids.map((v, i) => {
          const lbl = `${String(i + 1).padStart(2, "0")} · ${v.kind}`;
          const thumb = v.thumb ? h("img", { src: v.thumb, alt: "", loading: "lazy", decoding: "async" }) : null;
          if (thumb) thumb.addEventListener("error", () => thumb.remove(), { once: true });
          return h("button", { type: "button", class: "dk-sanatci-detay-reelcard dk-card", "aria-label": `${i + 1}. performans videosunu oynat (${v.kind === "YOUTUBE" ? "YouTube" : "Vimeo"})`,
            onclick: () => lightboxModal({ title: `${name} · performans videosu ${i + 1}`, iframe: v.embed }) },
          thumb,
          h("span", { class: "dk-sanatci-detay-reel-dim", "aria-hidden": "true" }),
          h("span", { class: "dk-sanatci-detay-reel-play", "aria-hidden": "true" }, svgRaw(P.play, { size: 18, fill: true })),
          h("span", { class: "dk-sanatci-detay-reel-cap", "aria-hidden": "true" }, lbl));
        }))) : null;

      if (pkgBlock || info.length || reel) {
        const head = secHead("paketler", "BOOKING", pkgs.length ? ["Paketler & ", h("em", {}, "fiyat")] : ["Booking & ", h("em", {}, "detaylar")]);
        addSection("paketler", pkgs.length ? "Paketler" : "Booking", head,
          segEl, pkgBlock,
          info.length ? h("div", { class: "dk-sanatci-detay-infogrid" }, ...info) : null,
          reel);
      }
    }

    // ── 04 YORUMLAR ──
    {
      const reviewBtn = canReview
        ? h("button", { type: "button", class: "dk-sanatci-detay-act is-rv dk-press", onclick: onReview }, ico("plus", 15, "2"), h("span", {}, mine ? "Yorumunu güncelle" : "Yorum yap"))
        : null;
      const head = secHead("yorumlar", "YORUMLAR", ["Dinleyiciler ne ", h("em", {}, "diyor")], reviewBtn);
      // Artboard metni birebir; {N} = reviews.length (sahibinin notu "Yorum = reviews.length"). Liste legacy gibi yalnız dinleyici yorumları
      // (mekan yorumları puana/sayıya girer, listede yok) — "Tüm yorumları gör (n)" ile fark sahibine açık soru olarak raporlandı.
      const rsumCaption = () => `${revs.length} yorum · ortalama yalnız puanlı yorumlardan hesaplanır`;
      const summary = revs.length ? h("div", { class: "dk-sanatci-detay-rsum" },
        h("span", { class: "dk-sanatci-detay-rsum-n" }, avg),
        h("div", { class: "dk-sanatci-detay-rsum-col" },
          starRow(avgNum != null ? Math.round(avgNum) : 0, 20, { gap: 4, label: avgNum != null ? `5 üzerinden ${avg} yıldız` : "Henüz puan yok" }),
          h("span", { class: "dk-sanatci-detay-rsum-t" }, rsumCaption()))) : null;
      const LIMIT = 4;
      let showAll = false;
      const grid = h("div", { class: "dk-sanatci-detay-rvgrid", id: ID_PREFIX + "rvgrid" });
      const moreLbl = h("span", {}, "");
      const more = custRevs.length > LIMIT
        ? h("button", { type: "button", class: "dk-sanatci-detay-more dk-link", "aria-controls": grid.id, "aria-expanded": "false" }, moreLbl, ico("arrow", 15, "2"))
        : null;
      const drawRevs = () => {
        grid.replaceChildren(...(showAll ? custRevs : custRevs.slice(0, LIMIT)).map(reviewCard));
        if (more) { moreLbl.textContent = showAll ? "Daha az göster" : `Tüm yorumları gör (${custRevs.length})`; more.setAttribute("aria-expanded", showAll ? "true" : "false"); }
      };
      if (more) more.addEventListener("click", () => { showAll = !showAll; drawRevs(); });
      drawRevs();
      addSection("yorumlar", "Yorumlar", head,
        summary,
        custRevs.length ? grid : dkEmpty({ icon: "star", title: "Henüz yorum yok.", compact: true, cls: "dk-sanatci-detay-rvempty" }),
        more);
    }

    // numaralandırma (gizli bölüm boşluk bırakmaz)
    sections.forEach((s, i) => { s.eb.textContent = `${String(i + 1).padStart(2, "0")} · ${s.label}`; });

    // ════════ 5. BÖLÜM SEKMELERİ ════════
    const tabBtns = new Map();
    const setActiveTab = (key) => tabBtns.forEach((b, k) => {
      const on = k === key;
      b.classList.toggle("is-on", on);
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    const tabsNav = h("nav", { class: "dk-sanatci-detay-tabs dk-utab dk-utab-anchor", "aria-label": "Sayfa bölümleri" },
      ...sections.map((s) => {
        const b = h("button", { type: "button", class: "dk-utab-t dk-tab", "aria-controls": s.node.id }, h("span", {}, s.tabLabel), h("span", { class: "dk-utab-bar dk-prism dk-utab-bar-prism", "aria-hidden": "true" }));
        b.addEventListener("click", () => {
          setActiveTab(s.key);
          tabPause = true; clearTimeout(tabPauseT); tabPauseT = setTimeout(() => { tabPause = false; }, 900);
          s.node.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
          try { s.h2.focus({ preventScroll: true }); } catch (_) {}
        });
        tabBtns.set(s.key, b);
        return b;
      }));
    if (sections.length) setActiveTab(sections[0].key);

    // ════════ 6. YAN KOLON ════════
    const sp = startPrice(a);
    const facts = [
      ["Puan", avgNum != null ? `${avg} · ${revs.length} yorum` : revs.length ? `— · ${revs.length} yorum` : "—"],
      ["Takipçi", (() => { const s = h("span", {}); followerTextEls.push(s); return s; })()],
      resText ? ["Resident", resText] : null,
      (Array.isArray(a.languages) && a.languages.filter(Boolean).length) ? ["Diller", a.languages.filter(Boolean).join(", ")] : null,
      memText ? ["Üyelik", memText] : null,
    ].filter(Boolean);
    const ctas = [];
    if (canOffer) ctas.push(h("button", { type: "button", class: "dk-sanatci-detay-cta is-pink dk-press", onclick: onOffer }, ico("send", 16, "2.1"), h("span", {}, "Teklif İste")));
    if (canMsg) ctas.push(h("button", { type: "button", class: "dk-sanatci-detay-cta dk-press", onclick: onMsg }, ico("chat", 16, "1.9"), h("span", {}, "Mesaj gönder")));
    if (canFollow && !canOffer) ctas.unshift((() => { const b = followButton(); b.classList.add("is-cta"); return b; })());
    const summaryCard = h("div", { class: "dk-sanatci-detay-sum" },
      h("span", { class: "dk-sanatci-detay-sum-bar dk-prism", "aria-hidden": "true" }),
      h("div", { class: "dk-sanatci-detay-sum-id" },
        a.photoURL ? (() => { const i = h("img", { src: a.photoURL, alt: "", class: "dk-sanatci-detay-sum-av", loading: "lazy" }); i.addEventListener("error", () => i.replaceWith(avatarInitial(name, g0, 52)), { once: true }); return i; })() : avatarInitial(name, g0, 52),
        h("span", { class: "dk-sanatci-detay-sum-col" },
          h("span", { class: "dk-sanatci-detay-sum-n" }, name),
          [g0, a.district || a.city].filter(Boolean).length ? h("span", { class: "dk-sanatci-detay-sum-s" }, [g0, a.district || a.city].filter(Boolean).join(" · ")) : null)),
      sp ? h("div", { class: "dk-sanatci-detay-price" },
        monoLabel(sp.fixed ? "SABİT FİYAT" : "BAŞLANGIÇ FİYATI"),
        h("span", { class: "dk-sanatci-detay-price-v" }, sp.text)) : null,
      h("div", { class: "dk-sanatci-detay-facts" }, ...facts.map(([k, v]) => h("div", { class: "dk-sanatci-detay-fact" },
        h("span", { class: "dk-sanatci-detay-fact-k" }, k), h("span", { class: "dk-sanatci-detay-fact-v" }, v)))),
      ctas.length ? h("div", { class: "dk-sanatci-detay-ctas" }, ...ctas) : null,
      canOffer ? h("p", { class: "dk-sanatci-detay-foot" }, "Teklif isteğin mesaj olarak iletilir; iletişim GigBridge içinde kalır.") : null);

    const SOC = [["instagram", "Instagram"], ["soundcloud", "SoundCloud"], ["spotify", "Spotify"], ["youtube", "YouTube"]];
    const socRows = SOC.map(([k, label]) => {
      const url = socialUrl(k, a.social?.[k]);
      if (!url) return null;
      return h("a", { href: url, target: "_blank", rel: "noopener", class: "dk-sanatci-detay-soc dk-row", "aria-label": `${label}: ${socialHandle(k, a.social[k])} (yeni sekmede açılır)` },
        svgRaw(P[k], { size: 20, sw: "1.8", color: "#FF4FA3" }),
        h("span", { class: "dk-sanatci-detay-soc-n" }, label),
        h("span", { class: "dk-sanatci-detay-soc-h" }, socialHandle(k, a.social[k])),
        ico("ext", 14, "2", "#8A8E97"));
    }).filter(Boolean);
    const socialCard = socRows.length ? h("div", { class: "dk-sanatci-detay-social" }, monoLabel("SOSYAL", "is-mb8"), ...socRows) : null;

    const nx = upcoming[0];
    const nxLive = !!nx && isLive(nx);
    const nextCard = nx ? h("a", { href: evHref(nx), class: "dk-sanatci-detay-next dk-card", "aria-label": `${nxLive ? "Şu an sahnede" : "Sıradaki etkinlik"}: ${evTitle(nx)}` },
      evImage(nx)
        ? (() => { const i = h("img", { src: evImage(nx), alt: "", loading: "lazy", decoding: "async" }); i.addEventListener("error", () => i.replaceWith(h("span", { class: "dk-sanatci-detay-next-ph", style: { background: genreGrad(primaryGenre(nx) || g0, 150) } })), { once: true }); return i; })()
        : h("span", { class: "dk-sanatci-detay-next-ph", style: { background: genreGrad(primaryGenre(nx) || g0, 150) } }),
      h("span", { class: "dk-sanatci-detay-next-grad", "aria-hidden": "true" }),
      h("span", { class: "dk-sanatci-detay-next-body" },
        h("span", { class: "dk-sanatci-detay-next-k" }, nextKicker(eventStartMs(nx), nxLive)),
        h("span", { class: "dk-sanatci-detay-next-t" }, evTitle(nx)),
        h("span", { class: "dk-sanatci-detay-next-row" }, h("span", { class: "dk-sanatci-detay-next-v" }, nx.venueName || ""), h("span", { class: "dk-sanatci-detay-next-cta" }, "Bilet al →")))) : null;

    const aside = h("aside", { class: "dk-sanatci-detay-aside", "aria-label": "Sanatçı özeti" }, summaryCard, socialCard, nextCard);
    const main = h("div", { class: "dk-sanatci-detay-left" }, ...sections.map((s) => s.node));
    const body = h("div", { class: "dk-container dk-sanatci-detay-grid" }, main, aside);

    root.replaceChildren(cover, identity, stats, h("div", { class: "dk-container" }, tabsNav), body);
    // ≤1023 tek kolon: yan kolon sekmelerin hemen altında (spec) — DOM sırası da görsel sırayla aynı olsun (odak/okuma sırası)
    const mqOne = window.matchMedia("(max-width: 1023px)");
    const placeAside = () => { if (mqOne.matches) { if (body.firstChild !== aside) body.prepend(aside); } else if (body.lastChild !== aside) body.append(aside); };
    placeAside();
    mqOne.addEventListener("change", placeAside);
    destroyPaint.push(() => mqOne.removeEventListener("change", placeAside));

    // Yapışkan özet kartı (≥1024) — sahibinin notu "sağ kolon özet kartı position: sticky; top: 96px" (CSS .dk-sanatci-detay-sum).
    // Yan kolon ızgara satırına gerilir (align-self: stretch) → kart sol kolon boyunca 96'da kalır; sosyal + sıradaki kartları normal
    // akışta opak kartın altından geçer (spec çapraz notu: opak zemin, z-index 2). Mod sınıfları (yalnız ≥1024 CSS'inde etkili):
    //   is-stick-all : kolonun tamamı innerHeight − 120'ye sığıyorsa kolon birlikte 96'da yapışır (hiçbir kart örtülmez; spec alternatifi)
    //   is-nostick   : özet kartı tek başına sığmıyorsa (alçak pencere) yapışma yok — fiyat/CTA hiçbir zaman kesilmez
    //   is-released  : klavye odağı sosyal/sıradaki kartındayken kartın altındaki bantta yer yoksa kart geçici olarak akışa döner
    const STICK_TOP = 96, ASIDE_GAP = 20;
    const fitAside = () => {
      if (!aside.isConnected) return;
      const kids = [...aside.children];
      const contentH = kids.reduce((sum, k) => sum + k.offsetHeight, 0) + ASIDE_GAP * Math.max(0, kids.length - 1);
      const avail = window.innerHeight - STICK_TOP - 24;
      aside.classList.toggle("is-stick-all", contentH <= avail);
      aside.classList.toggle("is-nostick", contentH > avail && summaryCard.offsetHeight > avail);
    };
    fitAside();
    window.addEventListener("resize", fitAside);
    let ro = null;
    try { ro = new ResizeObserver(fitAside); [...aside.children].forEach((k) => ro.observe(k)); } catch (_) {}

    // Klavye odağı görünür kalsın (WCAG 2.4.11): Chrome odaktaki öğeyi yalnız pencere dışındaysa kaydırır — yapışkan başlığın (76) ya da
    // yapışkan özet kartının altında kalan öğeyi görmez (Shift+Tab ile yukarı dönüşte öğe top 0'a hizalanır). Yalnız klavye odağında
    // (:focus-visible) düzeltilir; fare tıklaması ve sekme düğmesinin programatik h2 odağı (tabPause) sayfayı oynatmaz.
    // SHARED-CANDIDATE: dk-base'e html{scroll-padding-top:96px} (başlık payı tüm masaüstü sayfalarında) — burada yerel çözüm.
    let focusRaf = 0;
    const headerEl = shell.header?.node || null;
    const scrollByY = (dy) => { if (Math.abs(dy) >= 1) window.scrollBy({ top: dy, left: 0, behavior: "instant" }); };
    const onFocusIn = (e) => {
      const t = e.target;
      if (!(t instanceof Element) || tabPause) return;
      cancelAnimationFrame(focusRaf);
      focusRaf = requestAnimationFrame(() => {
        if (dead || document.activeElement !== t || !root.contains(t)) return;
        let kb = false; try { kb = t.matches(":focus-visible"); } catch (_) {}
        if (!kb) return;
        const vh = window.innerHeight;
        const hb = Math.max(0, headerEl ? headerEl.getBoundingClientRect().bottom : 76);
        let r = t.getBoundingClientRect();
        // 1) pencere kenarları: yapışkan başlık altı / alt kenar
        if (r.top < hb + 4) { scrollByY(r.top - (hb + 20)); r = t.getBoundingClientRect(); }
        else if (r.bottom > vh) { scrollByY(Math.min(r.top - (hb + 20), r.bottom - vh + 16)); r = t.getBoundingClientRect(); }
        // 2) sabit özet kartının altında kalan sosyal / sıradaki kartı öğesi
        if (!aside.contains(t) || summaryCard.contains(t) || aside.classList.contains("is-released")) return;
        if (getComputedStyle(summaryCard).position !== "sticky") return;
        const sb = summaryCard.getBoundingClientRect();
        if (!(r.top < sb.bottom + 8 && r.bottom > sb.top)) return;
        const target = sb.bottom + ASIDE_GAP;
        if (target + r.height <= vh - 16) { scrollByY(r.top - target); return; }   // kartın hemen altına (kart sabit kalır)
        aside.classList.add("is-released");                                        // yer yok → kart akışa döner, öğe yerinde kalır
        r = t.getBoundingClientRect();
        if (r.top < hb + 4) scrollByY(r.top - (hb + 20));
      });
    };
    const onFocusOut = (e) => {
      if (!aside.classList.contains("is-released")) return;
      const nt = e.relatedTarget;
      if (!(nt instanceof Node && aside.contains(nt) && !summaryCard.contains(nt))) aside.classList.remove("is-released");
    };
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    destroyPaint.push(() => {
      window.removeEventListener("resize", fitAside); if (ro) ro.disconnect(); cancelAnimationFrame(focusRaf);
      root.removeEventListener("focusin", onFocusIn); root.removeEventListener("focusout", onFocusOut);
    });
    paintFollow();
    setFollowerText();

    // Aktif sekme izleme — kaydırma konumundan (rAF ile seyreltilmiş): üst %40'a girmiş son bölüm; hiçbiri yoksa ilki; sayfa sonunda sonuncusu.
    // (Spec IntersectionObserver öneriyordu; sayfa başındayken hiçbir bölüm gözlem bandında olmadığından yanlış sekme kalıyordu.)
    if (sections.length) {
      let raf = 0;
      const compute = () => {
        raf = 0;
        if (tabPause || !root.isConnected) return;
        const line = window.innerHeight * 0.4;
        let cur = sections[0];
        sections.forEach((s) => { if (s.node.getBoundingClientRect().top <= line) cur = s; });
        const de = document.documentElement;
        if (window.scrollY > 0 && window.scrollY + window.innerHeight >= de.scrollHeight - 2) cur = sections[sections.length - 1];
        setActiveTab(cur.key);
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      destroyPaint.push(() => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); });
    }
  }

  // ── bölüm yardımcıları (paint'e bağlı olmayanlar) ──
  function avatarInitial(name, genre, size) {
    return h("span", { class: "dk-sanatci-detay-avini", style: { width: size + "px", height: size + "px", fontSize: Math.round(size * 0.4) + "px", background: genre ? genreGrad(genre) : avatarGrad("artist") }, "aria-hidden": "true" }, initials(name));
  }
  function infoCard(label, ...kids) {
    const opts = kids.length && kids[kids.length - 1] && !(kids[kids.length - 1] instanceof Node) ? kids.pop() : {};
    return h("div", { class: cx("dk-sanatci-detay-icard", opts.kv && "is-kv") }, monoLabel(label), ...kids);
  }
  function kvRow(k, v) {
    return h("div", { class: "dk-sanatci-detay-kv" }, h("span", { class: "dk-sanatci-detay-kv-k" }, k), h("span", { class: "dk-sanatci-detay-kv-v" }, v));
  }
  function reviewCard(r) {
    const nm = r.authorName || "Kullanıcı";
    const rt = Number(r.rating) || 0;
    return h("article", { class: "dk-sanatci-detay-rv" },
      h("div", { class: "dk-sanatci-detay-rv-top" },
        h("div", { class: "dk-sanatci-detay-rv-who" },
          h("span", { class: "dk-sanatci-detay-rv-av", style: { background: nameGrad(nm) }, "aria-hidden": "true" }, nm.charAt(0).toLocaleUpperCase("tr-TR")),
          h("span", { class: "dk-sanatci-detay-rv-col" }, h("span", { class: "dk-sanatci-detay-rv-n" }, nm), h("span", { class: "dk-sanatci-detay-rv-d" }, dmy(r.createdAt)))),
        starRow(rt, 14, { gap: 2, stroke: true, label: `5 üzerinden ${rt} yıldız` })),
      r.comment ? h("p", { class: "dk-sanatci-detay-rv-t" }, r.comment) : null);
  }
  function featuredReviewFigure(r) {
    if (!r) return null;
    const c = String(r.comment).trim();
    return h("figure", { class: "dk-sanatci-detay-quote" },
      monoLabel("ÖNE ÇIKAN YORUM"),
      starRow(r.rating, 16, { gap: 3, label: `5 üzerinden ${r.rating} yıldız` }),
      h("blockquote", { class: "dk-sanatci-detay-quote-q" }, "“" + (c.length > 200 ? c.slice(0, 198) + "…" : c) + "”"),
      h("figcaption", { class: "dk-sanatci-detay-quote-c" }, [r.authorName || "Değerlendiren", dmy(r.createdAt)].filter(Boolean).join(" · ")));
  }
  // Öne çıkan set: dalga formu dekoratif (bekleme); oynat → gerçek embed (legacy featuredSet), duraklat → embed kaldırılır.
  function featuredSetCard(url) {
    const info = soundEmbedInfo(url);
    if (!info) return null;
    let playing = false;
    const btn = h("button", { type: "button", class: "dk-sanatci-detay-play dk-press" });
    const txt = h("span", { class: "dk-sanatci-detay-set-t" });
    const wave = h("div", { class: "dk-sanatci-detay-wave", "aria-hidden": "true" });
    for (let i = 0; i < 72; i++) {
      const hh = Math.min(44, Math.round(10 + Math.abs(Math.sin(i * 0.55) * 22 + Math.sin(i * 1.7) * 10)));
      wave.append(h("span", { style: { height: hh + "px", animationDelay: (i % 6) * 90 + "ms" } }));
    }
    const holder = h("div", { class: "dk-sanatci-detay-set-embed", style: { height: info.h + "px" } });
    const col = h("div", { class: "dk-sanatci-detay-set-col" },
      h("div", { class: "dk-sanatci-detay-set-top" },
        h("span", { class: "dk-sanatci-detay-set-l" }, h("span", { class: "dk-sanatci-detay-set-eb" }, "ÖNE ÇIKAN SET"), txt),
        h("span", { class: "dk-sanatci-detay-set-kind" }, info.kind.toUpperCase())),
      wave);
    const set = (on) => {
      playing = on;
      btn.setAttribute("aria-label", on ? "Öne çıkan seti duraklat" : "Öne çıkan seti oynat");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.replaceChildren(on ? svgRaw(P.pause, { size: 22, fill: true }) : svgRaw(P.play, { size: 24, fill: true }));
      txt.textContent = on ? `Çalıyor · ${info.kind} oynatıcısı` : `${info.kind} — dinlemek için dokun`;
      if (on) {
        // Kullanıcı jesti sonrası otomatik oynatma (SoundCloud/YouTube destekler); legacy src'si auto_play=false idi
        const src = info.src.replace("auto_play=false", "auto_play=true") + (info.kind === "YouTube" ? "?autoplay=1" : "");
        holder.replaceChildren(h("iframe", { src, loading: "lazy", allow: "autoplay; encrypted-media; fullscreen", allowfullscreen: true, frameborder: "0", title: "Öne çıkan set" }));
        wave.replaceWith(holder);
      } else if (holder.isConnected) { holder.replaceChildren(); holder.replaceWith(wave); }
      card.classList.toggle("is-playing", on);
    };
    btn.addEventListener("click", () => set(!playing));
    const card = h("div", { class: "dk-sanatci-detay-set" }, btn, col);
    set(false);
    return card;
  }

  load();

  return {
    node: shell.node,
    destroy() { dead = true; unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
    // Aynı kimlikte profil yenilemesi: sayfa verisi etkilenmez → yeniden kurma yok
    onSession() { return true; },
  };
}
