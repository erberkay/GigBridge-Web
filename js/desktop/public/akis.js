// WebAkis — masaüstü "Sahneden notlar" sosyal akışı (≥769 px). Registry anahtarı: akis (#/akis, misafir + girişli).
// Spec: specs/public-a.md §5 · Artboard: design/WebAkis.dc.html (sahibinin CLAUDE CODE notu uygulandı).
// CSS: css/dk-akis.css — tüm seçiciler .dk-akis kökü altında.
// Legacy karşılığı: js/pages/customer.js renderAkis()/postCard()/commentsModal()/postModal() — ≤768'de AYNEN kalır.
//
// Legacy özellikleri (hepsi korundu, yerleşimi tasarıma göre):
//   • Takip / Şehrim kaynak sekmeleri (Takip = authorId === ben || takip ettiklerim; Şehrim = fold(authorCity) === fold(şehrim))
//     + legacy boş durum metinleri ("… şehrinde henüz paylaşım yok.", "Şehir akışı için profilinizde şehir bilgisi olmalı.", tam Takip metni)
//   • Gönderi kartı: tür aksan çizgisi + rozet (review/checkin/discovery/invite, bilinmeyen → discovery), ad-degrade baş harf avatar,
//     "{şehir} · {tarih}", içerik, yıldız, etkinlik/mekan etiketleri (venueId varsa #/mekan/:id), beğeni, yorum sayısı, Paylaş
//   • Beğeni: dkLoginGate("Beğenmek") → toggleLike (likes/{uid} + likeCount ±1), isLiked ile ilk durum
//   • Yorumlar: listenComments CANLI (açıkken; kapatınca/destroy'da kapanır), addComment (≤300, Enter), hata → "Gönderilemedi" + metni geri koy,
//     boş → "Henüz yorum yok. İlk yorumu sen yaz!"  (legacy modal → masaüstünde kartın altında satır içi)
//   • Yeni gönderi: dkLoginGate("Gönderi paylaşmak"), attendedEvents (ilk açılışta, tembel), 500 karakter + sayaç, seçilirse type=review +
//     event/venue/venueId (+ eventId: RN app ile aynı), boş → "Bir şeyler yaz", başarı → "Paylaşıldı", hata → "Gönderilemedi"
//     (legacy modal → masaüstünde satır içi composer)
//   • Paylaş: navigator.share({text,url}) yoksa panoya kopyala — etiket "Panoya kopyalandı" (#7CE0B0). Misafirde dkLoginGate("Paylaşmak")
//     (sahibin notu; legacy misafire açıktı — public-a Q20)
// Tasarımın ekledikleri: 3 kolon, AKIŞA KATIL kartı (misafir), kaynak menüsü + sayaçlar, tür lejantı, etkinlik eki kartı (events/{id}),
//   "Daha eski gönderiler" (sayfalama), önerilen sanatçılar + takip, BU HAFTA listesi, harita tanıtım kartı.
// URL: #/akis?kaynak=takip|sehir (pushState → geri tuşu; update(query) uygular).
//
// Veri: listenTimeline (ilk 50, canlı) · eski sayfalar: timeline where createdAt < imleç orderBy createdAt desc limit 20 (tek alan, bileşik
//   index YOK) · followingList · isLiked · listenComments · attendedEvents · eventById (ek kartı, önbellekli) · listRealArtists ·
//   discoverEvents (bu hafta + şehir, ilk 4) · followArtist/unfollowArtist.
// Yazımlar legacy ile birebir: toggleLike, addComment, followArtist/unfollowArtist; gönderi = legacy createPost şekli + eventId (bkz. createPostDoc).
import { h, fmtDate } from "../../ui.js";
import { session } from "../../store.js";
import {
  listenTimeline, isLiked, toggleLike, listenComments, addComment, attendedEvents, followingList,
  listRealArtists, discoverEvents, eventById, followArtist, unfollowArtist,
} from "../../data.js";
import { db, collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from "../../firebase.js";
import { publicShell } from "../shared/public-shell.js";
import { svgRaw, svgPath } from "../shared/icons.js";
import { cx, dkToast, dkLoginGate, dkFollowButton, dkAvatar, dkSkeleton } from "../shared/ui.js";
import { isRealUser, openLogin } from "../shared/overlays.js";
import { eventRowMini, evImage, evTitle } from "../shared/cards.js";
import {
  ALL_CITIES, getActiveCity, fold, trUpper, initials, eventStartMs, startOfDay, isToday, isTomorrow, fmtTime,
  fmtDateShort, DAYS_TR_SHORT, writeQuery, replayAnim, artistGenres,
} from "../shared/helpers.js";
import { genreGrad, primaryGenre } from "../shared/genres.js";

// ══════════ Artboard sabitleri (DCLogic birebir) ══════════
const IC = {
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M17 12.3a2.3 2.3 0 1 0 0-4.6M15.5 14.6A4.5 4.5 0 0 1 21 19",
};
const SVG = {
  person: '<circle cx="12" cy="9" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  note: '<path d="M9 17V5l10-2v12"></path><circle cx="6.5" cy="17" r="2.5"></circle><circle cx="16.5" cy="15" r="2.5"></circle>',
  chevDown: "m6 9 6 6 6-6",
  chevUp: "m6 15 6-6 6 6",
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.4-7.5 10.4z"></path>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5z"></path>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"></path>',
  map: '<path d="M210 0 C 200 40, 230 80, 214 120 C 206 136, 196 146, 190 150 L 312 150 L 312 0 Z" fill="#0B1824"></path>'
    + '<g fill="none" stroke="#1B2029" stroke-width="2.4" stroke-linecap="round"><path d="M0 70 C 60 78, 120 66, 200 74"></path><path d="M90 0 C 100 50, 96 100, 110 150"></path></g>'
    + '<circle cx="80" cy="60" r="6" fill="#FF8A2A"></circle><circle cx="140" cy="96" r="6" fill="#A78BFA"></circle><circle cx="170" cy="40" r="6" fill="#FF5A6E"></circle><circle cx="112" cy="78" r="5" fill="#4ED8FF"></circle>',
};
// Gönderi türleri (legacy POST_TYPES renkleri + artboard T tablosu); bilinmeyen tür → discovery (legacy)
const TYPES = {
  review: { c: "#F59E0B", rgb: "245,158,11", icon: IC.star, l: "Yorum", d: "Katıldığın etkinliğe puan ver" },
  checkin: { c: "#06B6D4", rgb: "6,182,212", icon: IC.pin, l: "Check-in", d: "Şu an bir mekandasın" },
  discovery: { c: "#A855F7", rgb: "168,85,247", icon: IC.compass, l: "Keşif", d: "Yeni sanatçı ya da mekan" },
  invite: { c: "#10B981", rgb: "16,185,129", icon: IC.people, l: "Davet", d: "Birlikte gidelim çağrısı" },
};
const typeOf = (p) => TYPES[p?.type] || TYPES.discovery;
// Ad-degrade avatar (legacy AV_GRADS / avGrad birebir: karakter kodu toplamı mod 6)
const AV_GRADS = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#06B6D4", "#0891B2"], ["#EC4899", "#BE185D"]];
const avGrad = (name) => { const g = AV_GRADS[[...String(name || "?")].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_GRADS.length]; return `linear-gradient(135deg, ${g[0]}, ${g[1]})`; };
const avInitial = (name) => String(name || "?").charAt(0).toLocaleUpperCase("tr-TR");
const gradAv = (name, cls) => h("span", { class: cx("dk-akis-av", cls), style: { background: avGrad(name) }, "aria-hidden": "true" }, avInitial(name));
const ghostAv = (cls, size) => h("span", { class: cx("dk-akis-ghost", cls), "aria-hidden": "true" }, svgRaw(SVG.person, { size, sw: "1.8" }));

const SOURCES = [
  { k: "takip", label: "Takip", icon: IC.people },
  { k: "sehir", label: "Şehrim", icon: IC.pin },
];
const srcFromQuery = (q) => (q?.get?.("kaynak") === "sehir" ? "sehir" : "takip");

const FIRST_PAGE = 50;   // listenTimeline limit (data.js)
const PAGE = 20;         // "Daha eski gönderiler" sayfası
const WEEK_MS = 7 * 86400e3;

const uidOf = () => session.user?.uid || null;
const myName = () => session.profile?.displayName || session.user?.displayName || "Kullanıcı";
const toMsSafe = (v) => { try { return v?.toMillis ? v.toMillis() : v?.seconds != null ? v.seconds * 1000 : null; } catch { return null; } };
const whenText = (v) => (v == null ? "şimdi" : fmtDate(v));   // bekleyen serverTimestamp (null) → "şimdi"

// Giriş bağlantısı: header "Giriş yap" ile aynı (modal; Ctrl/Cmd/Shift-tık #/login'e gider)
function loginLink(cls, label) {
  const a = h("a", { href: "#/login", class: cls }, label);
  a.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); openLogin(); });
  return a;
}

// ══════════ Yeni Firestore sorguları / yazımları (yalnız bu modül) ══════════
// Eski gönderi sayfası: tek alanlı eşitsizlik + aynı alanda sıralama → otomatik tek alan index'i yeterli (bileşik index YOK).
// "<=" imleç: imleçle AYNI zaman damgalı gönderiler atlanmaz (çağıran, bilinenleri kimlikle ayıklar ve limiti bilinen eş sayısı kadar artırır).
// SHARED-CANDIDATE: data.js'te timelinePage(cursorDoc) + firebase.js'ten startAfter(docSnapshot) — foundation'a ait dosyalar.
async function timelineOlder(cursor, n = PAGE) {
  const s = await getDocs(query(collection(db, "timeline"), where("createdAt", "<=", cursor), orderBy("createdAt", "desc"), limit(n)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
const sameTs = (a, b) => a != null && b != null && a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
// SHARED-CANDIDATE: data.js createPost'a `eventId: extra.eventId ?? null` eklenmeli (public-a §5.7/5.9). Şekil legacy createPost ile
// BİREBİR + eventId (RN TimelineScreen.tsx aynı alanı yazar; kurallar create'te yalnız authorId'yi denetler).
async function createPostDoc(uid, name, city, content, extra = {}) {
  await addDoc(collection(db, "timeline"), {
    authorId: uid, authorName: name, authorCity: city ?? "",
    type: extra.type || "discovery", content,
    event: extra.event ?? null, venue: extra.venue ?? null, venueId: extra.venueId ?? null,
    eventId: extra.eventId ?? null,
    rating: extra.rating ?? 0,
    likeCount: 0, commentCount: 0, createdAt: serverTimestamp(),
  });
}

// ══════════════════════════════════════════════════════════════════════
export function akisView(ctx) {
  const unsubs = [];
  const shell = publicShell({ active: "akis", footer: "full" });
  const authed = isRealUser();
  const me = uidOf();

  // ── durum ──
  let src = srcFromQuery(ctx.query);
  let live = [];              // ilk sayfa (canlı)
  let older = [];             // yüklenen eski sayfalar
  let loaded = false;
  let hasMore = false, loadingMore = false;
  let followIds = new Set();
  let followsReady = !authed;   // girişliyse followingList bitene kadar Takip iskelette kalır (kısmi akış/sayaç sıçraması yok)
  let destroyed = false;
  const cards = new Map();    // postId → kart
  const likeKnown = new Map(); // postId → bool (isLiked sonucu; yeniden çizimde tekrar okunmaz)
  const eventCache = new Map(); // eventId → Promise<event|null>
  const getEvent = (id) => { if (!eventCache.has(id)) eventCache.set(id, eventById(id).catch(() => null)); return eventCache.get(id); };

  // Şehir: Şehrim + başlık → girişliyse profil şehri (legacy), misafirse gb_city (TÜMÜ değilse; public-a Q19).
  const headerCity = () => (getActiveCity() === ALL_CITIES ? "" : getActiveCity());
  const feedCity = () => (authed ? String(session.profile?.city || "").trim() : headerCity());
  // Sağ ray (BU HAFTA + öneri önceliği): sayfada TEK şehir kaynağı — başlıktaki "AKIŞ · {ŞEHİR}" ile aynı şehir (Q19 kararına dek);
  // Şehrim şehri yoksa (profilde şehir yok / misafir TÜMÜ) header şehri.
  const railCity = () => feedCity() || headerCity();

  // ══════════ Sol ray ══════════
  const join = authed ? null : h("div", { class: "dk-akis-join" },
    h("span", { class: "dk-akis-join-bar dk-prism", "aria-hidden": "true" }),
    h("span", { class: "dk-akis-join-eb" }, "AKIŞA KATIL"),
    h("span", { class: "dk-akis-join-t" }, "Sahnedekileri ", h("em", {}, "takip et")),
    h("p", { class: "dk-akis-join-p" }, "Takip ettiğin sanatçıların ve şehrindeki dinleyicilerin paylaşımlarını gör; katıldığın etkinlikleri yorumla."),
    h("a", { href: "#/register", class: "dk-akis-join-reg dk-press" }, "Hesap oluştur"),
    loginLink("dk-akis-join-login dk-press", "Giriş yap"));

  const navBtns = new Map(), navCounts = new Map();
  const srcNav = h("nav", { class: "dk-akis-src", "aria-label": "Akış kaynağı" },
    h("span", { class: "dk-akis-src-h" }, "AKIŞ"),
    ...SOURCES.map((s) => {
      const cnt = h("span", { class: "dk-akis-src-n" }, "");
      const b = h("button", { type: "button", class: "dk-akis-src-b dk-press", "aria-controls": "dk-akis-feed", onclick: () => setSrc(s.k, true) },
        h("span", { class: "dk-akis-src-bar", "aria-hidden": "true" }),
        svgPath(s.icon, { size: 18, sw: "1.8" }),
        h("span", { class: "dk-akis-src-l" }, s.label), cnt);
      navBtns.set(s.k, b); navCounts.set(s.k, cnt);
      return b;
    }));

  const legend = h("div", { class: "dk-akis-legend" },
    h("span", { class: "dk-akis-legend-h" }, "GÖNDERİ TÜRLERİ"),
    ...Object.values(TYPES).map((t) => h("div", { class: "dk-akis-legend-r" },
      h("span", { class: "dk-akis-legend-ic", style: { background: `rgba(${t.rgb},0.12)`, color: t.c } }, svgPath(t.icon, { size: 15, sw: "1.9" })),
      h("span", { class: "dk-akis-legend-c" }, h("span", { class: "dk-akis-legend-l" }, t.l), h("span", { class: "dk-akis-legend-d" }, t.d)))));

  const left = h("aside", { class: "dk-akis-left", "aria-label": "Akış menüsü" }, join, srcNav, legend);

  // ══════════ Orta: başlık + sekmeler ══════════
  const eyebrow = h("span", { class: "dk-akis-eb" }, "AKIŞ");
  const tabBtns = new Map();
  const tabs = h("div", { class: "dk-akis-tabs", role: "tablist", "aria-label": "Akış kaynağı" },
    ...SOURCES.map((s) => {
      const b = h("button", { type: "button", role: "tab", id: "dk-akis-tab-" + s.k, class: "dk-akis-tab dk-press", "aria-controls": "dk-akis-feed", onclick: () => setSrc(s.k, true) },
        svgPath(s.icon, { size: 14, sw: "1.9" }), s.label);
      tabBtns.set(s.k, b);
      return b;
    }));
  tabs.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const keys = SOURCES.map((s) => s.k); const i = keys.indexOf(src);
    const k = keys[(i + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length];
    setSrc(k, true); tabBtns.get(k).focus();
  });
  const head = h("div", { class: "dk-akis-head" },
    h("div", { class: "dk-akis-head-l" }, eyebrow, h("h1", { class: "dk-akis-h1" }, "Sahneden ", h("em", {}, "notlar"))),
    tabs);

  // ══════════ Composer (yeni gönderi) ══════════
  const composer = buildComposer();

  // ══════════ Akış listesi ══════════
  const feed = h("div", { class: "dk-akis-feed", id: "dk-akis-feed", role: "tabpanel", tabindex: "-1" });
  const moreBtn = h("button", { type: "button", class: "dk-akis-more dk-press", hidden: true, onclick: () => loadOlder() }, "Daha eski gönderiler");
  const joinSlotCenter = h("div", { class: "dk-akis-slot dk-akis-slot-c" });
  const center = h("div", { class: "dk-akis-center" }, head, joinSlotCenter, composer.node, feed, moreBtn);

  // ══════════ Sağ ray ══════════
  const joinSlotRight = h("div", { class: "dk-akis-slot dk-akis-slot-r" });
  const sugList = h("div", { class: "dk-akis-sug-list" }, ...[0, 1, 2, 3].map(() => skelRow()));
  const sug = h("div", { class: "dk-akis-sug" },
    h("div", { class: "dk-akis-card-h" }, h("span", { class: "dk-akis-card-eb" }, "ÖNERİLEN SANATÇILAR"), h("a", { href: "#/top10", class: "dk-akis-card-a dk-link" }, "Top 10")),
    sugList);
  const weekList = h("div", { class: "dk-akis-week-list" }, ...[0, 1, 2, 3].map(() => skelRow(true)));
  const week = h("div", { class: "dk-akis-week" },
    h("div", { class: "dk-akis-card-h" }, h("span", { class: "dk-akis-card-eb" }, "BU HAFTA"), h("a", { href: "#/etkinlikler?tarih=bu-hafta", class: "dk-akis-card-a dk-link" }, "Tümü")),
    weekList);
  const mapTeaser = h("a", { href: "#/harita", class: "dk-akis-map dk-card" },
    svgRaw(SVG.map, { width: 312, height: 150, viewBox: "0 0 312 150", cls: "dk-akis-map-svg" }),
    h("span", { class: "dk-akis-map-t" }, "Yakınındaki sahneler", h("span", { class: "dk-akis-map-go" }, "Haritada aç →")));
  const right = h("aside", { class: "dk-akis-right", "aria-label": "Öneriler" }, joinSlotRight, sug, week, mapTeaser);

  const live_ = h("span", { class: "dk-sr", "aria-live": "polite" });   // "Panoya kopyalandı" duyurusu
  const root = h("div", { class: "dk-akis" }, h("div", { class: "dk-akis-grid" }, left, center, right), live_);
  shell.main.append(root);

  // Harita SVG'si: svgRaw varsayılan fill/stroke özniteliklerini kaldır (artboard <svg>'de yok)
  const mapSvg = mapTeaser.querySelector("svg");
  ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"].forEach((a) => mapSvg.removeAttribute(a));

  // ── AKIŞA KATIL kartının yeri (kanvas/spec 5.10): ≥1280 sol ray · 1024–1279 sağ ray üstü · ≤1023 composer üstü ──
  const mqLt1280 = window.matchMedia("(max-width: 1279px)");
  const mqLt1024 = window.matchMedia("(max-width: 1023px)");
  const placeJoin = () => {
    if (!join) return;
    const target = mqLt1024.matches ? joinSlotCenter : mqLt1280.matches ? joinSlotRight : left;
    if (join.parentNode !== target) { if (target === left) left.prepend(join); else target.append(join); }
  };
  placeJoin();
  [mqLt1280, mqLt1024].forEach((mq) => { mq.addEventListener("change", placeJoin); unsubs.push(() => mq.removeEventListener("change", placeJoin)); });

  // ══════════ Kaynak seçimi ══════════
  function paintSrc() {
    SOURCES.forEach((s) => {
      const on = s.k === src;
      const nb = navBtns.get(s.k); nb.classList.toggle("is-on", on); nb.setAttribute("aria-pressed", on ? "true" : "false");
      const tb = tabBtns.get(s.k); tb.classList.toggle("is-on", on); tb.setAttribute("aria-selected", on ? "true" : "false"); tb.tabIndex = on ? 0 : -1;
    });
    feed.setAttribute("aria-labelledby", "dk-akis-tab-" + src);
  }
  function setSrc(k, writeUrl) {
    if (k !== "takip" && k !== "sehir") k = "takip";
    const changed = k !== src;
    src = k; paintSrc();
    if (writeUrl && changed) writeQuery({ kaynak: k === "takip" ? null : k }, { push: true });
    if (changed) drawFeed();
  }
  function paintHead() {
    const c = feedCity();
    eyebrow.textContent = c ? `AKIŞ · ${trUpper(c)}` : "AKIŞ";
  }

  // ══════════ Liste çizimi (anahtarlı; açık yorumlar / taslaklar / odak korunur) ══════════
  const allPosts = () => {
    const seen = new Set(); const out = [];
    for (const p of live) { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } }
    for (const p of older) { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } }
    return out;
  };
  const isTakip = (p) => (me && p.authorId === me) || followIds.has(p.authorId);
  const isSehir = (p) => { const c = feedCity(); return !!c && fold(p.authorCity) === fold(c); };
  function drawFeed() {
    if (destroyed) return;
    paintHead();
    const posts = allPosts();
    navCounts.get("takip").textContent = loaded && followsReady ? String(posts.filter(isTakip).length) : "";
    navCounts.get("sehir").textContent = loaded ? String(posts.filter(isSehir).length) : "";
    // Takip listesi (followingList) gelmeden Takip akışı çizilmez: önce yalnız kendi gönderilerim, sonra diğerleri → kayma/boş durum parlaması olmasın
    const pending = !loaded || (src === "takip" && !followsReady);
    // Eşleşme imkânsızsa (misafirin Takip'i: takip/kendi gönderisi yok · Şehrim'de şehir yok) "Daha eski" gösterilmez — boş durumun altında
    // hiçbir şey getirmeyecek bir düğme kalmasın. Girişli kullanıcıda Takip boşken eski sayfalarda kendi/takip gönderileri olabilir → kalır.
    const canMatch = src === "takip" ? (authed || followIds.size > 0) : !!feedCity();
    moreBtn.hidden = pending || !hasMore || !canMatch;
    if (pending) {
      if (!feed.querySelector(".dk-akis-skel")) feed.replaceChildren(postSkeleton(), postSkeleton(), postSkeleton());
      return;
    }
    const list = posts.filter(src === "takip" ? isTakip : isSehir);
    const keep = new Set(list.map((p) => p.id));
    // Listede olmayan kartları kapat (yorum dinleyicileri dahil)
    for (const [id, c] of cards) if (!keep.has(id)) { c.destroy(); c.node.remove(); cards.delete(id); }
    // Yer tutucu/boş durum temizliği
    [...feed.children].forEach((n) => { if (!n._akisCard) n.remove(); });
    if (!list.length) { feed.append(emptyState()); return; }
    let prev = null;
    for (const p of list) {
      let c = cards.get(p.id);
      if (!c) { c = postCard(p); cards.set(p.id, c); } else c.update(p);
      const want = prev ? prev.nextSibling : feed.firstChild;
      if (want !== c.node) feed.insertBefore(c.node, want);   // yalnız gerektiğinde taşı (odak korunur)
      prev = c.node;
    }
  }
  function emptyState() {
    const c = feedCity();
    const sub = src === "sehir"
      ? (c ? `${c} şehrinde henüz paylaşım yok.` : authed ? "Şehir akışı için profilinizde şehir bilgisi olmalı." : "Şehir akışı için üstten bir şehir seç.")
      : "Takip ettiğiniz kullanıcılar henüz paylaşım yapmamış. Profil > Takip Ettiklerim bölümünden kullanıcı takip edebilirsiniz.";
    return h("div", { class: "dk-akis-empty" }, h("span", { class: "dk-akis-empty-t" }, "Gönderi yok"), h("span", { class: "dk-akis-empty-s" }, sub));
  }
  function postSkeleton() {
    return h("div", { class: "dk-akis-post dk-akis-skel", "aria-hidden": "true" },
      h("div", { class: "dk-akis-post-body" },
        h("div", { class: "dk-akis-post-head" }, dkSkeleton({ w: 44, h: 44, r: 22 }),
          h("span", { class: "dk-akis-post-who" }, dkSkeleton({ w: 140, h: 14 }), dkSkeleton({ w: 110, h: 11 }))),
        dkSkeleton({ w: "92%", h: 14 }), dkSkeleton({ w: "64%", h: 14 })),
      h("div", { class: "dk-akis-actions" }, dkSkeleton({ w: 56, h: 18 }), dkSkeleton({ w: 44, h: 18 })));
  }

  // ══════════ Eski gönderiler ══════════
  // Etkin kaynağa uyan yeni gönderi gelene dek (en çok MAX_ROUNDS sayfa) devam eder; tıklama "hiçbir şey olmadı" gibi görünmesin.
  // Buton yükleme sırasında `disabled` DEĞİL (odak <body>'ye düşerdi) → aria-disabled + loadingMore koruması.
  const MAX_ROUNDS = 5;
  async function loadOlder() {
    if (loadingMore || !hasMore) return;
    const hadFocus = document.activeElement === moreBtn;
    loadingMore = true; moreBtn.setAttribute("aria-disabled", "true"); moreBtn.setAttribute("aria-busy", "true");
    let firstMatch = null;
    try {
      for (let round = 0; round < MAX_ROUNDS && hasMore && !firstMatch; round++) {
        const posts = allPosts();
        let cursor = null;
        for (let i = posts.length - 1; i >= 0 && !cursor; i--) if (toMsSafe(posts[i].createdAt) != null) cursor = posts[i].createdAt;
        if (!cursor) { hasMore = false; break; }
        const ties = posts.filter((p) => sameTs(p.createdAt, cursor)).length;
        const n = PAGE + ties;
        const page = await timelineOlder(cursor, n);
        if (destroyed) return;
        const known = new Set(allPosts().map((p) => p.id));
        const fresh = page.filter((p) => !known.has(p.id));
        older = older.concat(fresh);
        hasMore = page.length === n && fresh.length > 0;
        firstMatch = fresh.find(src === "takip" ? isTakip : isSehir) || null;
      }
      drawFeed();
      // Odaktaki buton gizlendiyse odağı ilk yeni karta (yoksa akış kabına) taşı
      if (hadFocus && moreBtn.hidden) {
        const target = (firstMatch && cards.get(firstMatch.id)?.node) || feed;
        if (target !== feed) target.setAttribute("tabindex", "-1");
        try { target.focus({ preventScroll: true }); } catch (_) {}
      }
    } catch (_) {
      if (!destroyed) drawFeed();   // hatadan önce gelen sayfalar gösterilsin
      dkToast("Gönderiler yüklenemedi", { type: "err" });
    } finally {
      loadingMore = false; moreBtn.removeAttribute("aria-disabled"); moreBtn.removeAttribute("aria-busy");
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PostCard
  // ══════════════════════════════════════════════════════════════════════
  function postCard(p0) {
    let p = p0;
    const t = typeOf(p);
    const tid = "dk-akis-th-" + p.id;
    let liked = likeKnown.get(p.id) || false;
    let likeCount = Number(p.likeCount) || 0;
    let likeBusy = false;
    let open = false, cUnsub = null, comments = null;
    // "Daha eski" sayfadan gelen gönderiler canlı değil (update() gelmez): kartın bildiği sayıları gönderiye + older dizisine yaz
    // (kart kaynak değişiminde yeniden kurulsa da geri dönmez). Canlı penceredekileri anlık görüntü günceller.
    const syncOlder = (patch) => {
      if (live.some((x) => x.id === p.id)) return;
      p = { ...p, ...patch };
      const i = older.findIndex((x) => x.id === p.id);
      if (i >= 0) older[i] = p;
    };

    // ── başlık ──
    const author = h("span", { class: "dk-akis-post-author" }, p.authorName || "Kullanıcı");
    const meta = h("span", { class: "dk-akis-post-meta" });
    const paintMeta = () => { meta.textContent = [p.authorCity, whenText(p.createdAt)].filter(Boolean).join(" · "); };
    paintMeta();
    const badge = h("span", { class: "dk-akis-badge", style: { borderColor: `rgba(${t.rgb},0.4)`, background: `rgba(${t.rgb},0.12)`, color: t.c } },
      svgPath(t.icon, { size: 11, sw: "2.2" }), t.l);
    const text = h("p", { class: "dk-akis-post-text" }, p.content || "");

    // ── yıldız ──
    const rating = Math.max(0, Math.min(5, Math.round(Number(p.rating) || 0)));
    const stars = rating > 0 ? h("span", { class: "dk-akis-stars", role: "img", "aria-label": `5 üzerinden ${rating} yıldız` },
      ...[1, 2, 3, 4, 5].map((i) => svgRaw(`<path d="${IC.star}"></path>`, { size: 15, sw: "1.4", color: "#F59E0B", attrs: { fill: i <= rating ? "#F59E0B" : "none" } }))) : null;

    // ── etkinlik eki (eventId varsa) / legacy metin etiketi (yoksa) + mekan çipi ──
    const tags = h("div", { class: "dk-akis-tags" });
    const venueChip = p.venue ? (p.venueId
      ? h("a", { href: "#/mekan/" + encodeURIComponent(p.venueId), class: "dk-akis-chip dk-press" }, svgRaw(SVG.pin, { size: 12, color: "#FF4FA3" }), p.venue)
      : h("span", { class: "dk-akis-chip" }, svgRaw(SVG.pin, { size: 12, color: "#FF4FA3" }), p.venue)) : null;
    const eventChip = () => h("span", { class: "dk-akis-chip" }, svgRaw(SVG.note, { size: 12, color: "#FF4FA3" }), p.event);
    let attach = null;
    if (p.eventId) {
      attach = attachment(p, null);
      getEvent(p.eventId).then((ev) => {
        if (destroyed || !attach) return;
        if (ev) { const n = attachment(p, ev); attach.replaceWith(n); attach = n; }
        else { attach.remove(); attach = null; if (p.event) { tags.prepend(eventChip()); ensureTags(); } }
      });
    } else if (p.event) tags.append(eventChip());
    if (venueChip) tags.append(venueChip);

    const body = h("div", { class: "dk-akis-post-body" },
      h("div", { class: "dk-akis-post-head" }, gradAv(p.authorName, "dk-akis-av-44"),
        h("span", { class: "dk-akis-post-who" }, author, meta), badge),
      text, stars, attach, tags.childNodes.length ? tags : null);
    // etiket satırı sonradan dolabilir (ek bulunamadı → metin etiketi)
    const ensureTags = () => { if (tags.childNodes.length && !tags.isConnected) body.append(tags); };

    // ── aksiyonlar ──
    const heartWrap = h("span", { class: "dk-akis-heart" });
    const likeN = h("span", {});
    const likeBtn = h("button", { type: "button", class: "dk-akis-act dk-akis-like dk-press" }, heartWrap, likeN);
    const paintLike = () => {
      likeBtn.classList.toggle("is-on", liked);
      likeBtn.setAttribute("aria-pressed", liked ? "true" : "false");
      likeBtn.setAttribute("aria-label", `${liked ? "Beğeniyi geri al" : "Beğen"}, ${likeCount} beğeni`);
      heartWrap.replaceChildren(svgRaw(SVG.heart, { size: 20, sw: "1.9", attrs: { fill: liked ? "currentColor" : "none" } }));
      likeN.textContent = String(likeCount);
    };
    // İlk durum (isLiked) bilinmeden beğeni yazılmaz: zaten beğenilmiş gönderide erken tık toggleLike(…, false) → setDoc + increment(1)
    // ile likeCount'u çift sayardı (legacy'deki yarış). Tık, isLiked sonucunu bekler.
    let likeReady = null;
    likeBtn.addEventListener("click", async () => {
      if (dkLoginGate("Beğenmek")) return;
      if (likeBusy) return;
      likeBusy = true;
      try {
        if (likeReady && !likeKnown.has(p.id)) await likeReady;
        if (destroyed) return;
        const was = liked;
        liked = !was; likeCount = Math.max(0, likeCount + (liked ? 1 : -1)); likeKnown.set(p.id, liked);
        paintLike();
        if (liked) replayAnim(heartWrap, "dk-like");
        try { await toggleLike(p.id, me, was); syncOlder({ likeCount }); }
        catch (_) { liked = was; likeCount = Math.max(0, likeCount + (was ? 1 : -1)); likeKnown.set(p.id, was); paintLike(); dkToast("İşlem başarısız", { type: "err" }); }
      } finally { likeBusy = false; }
    });
    paintLike();
    if (authed && !likeKnown.has(p.id)) {
      likeReady = isLiked(p.id, me)
        .then((l) => { if (likeKnown.has(p.id)) return; likeKnown.set(p.id, l); if (!destroyed && l !== liked) { liked = l; paintLike(); } })
        .catch(() => { if (!likeKnown.has(p.id)) likeKnown.set(p.id, liked); });
    }

    const cmtN = h("span", {});
    const cmtBtn = h("button", { type: "button", class: "dk-akis-act dk-akis-cmt dk-press", "aria-expanded": "false" },
      svgRaw(SVG.chat, { size: 18, sw: "1.9" }), cmtN);
    const cmtCount = () => (open && comments ? comments.length : Number(p.commentCount) || 0);
    const paintCmt = () => {
      const n = cmtCount();
      cmtN.textContent = String(n);
      cmtBtn.setAttribute("aria-label", `Yorumlar, ${n}`);
      cmtBtn.classList.toggle("is-on", open);
      cmtBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) cmtBtn.setAttribute("aria-controls", tid); else cmtBtn.removeAttribute("aria-controls");
      if (threadEb) threadEb.textContent = `YORUMLAR · ${n}`;
    };

    const shareL = h("span", {}, "Paylaş");
    const shareBtn = h("button", { type: "button", class: "dk-akis-act dk-akis-share dk-press" }, svgRaw(SVG.share, { size: 17, sw: "1.9" }), shareL);
    shareBtn.addEventListener("click", async () => {
      // Sahibin notu: "Misafirde Begen / Yorum yaz / Paylas loginGate ile 'Giris Gerekli' acar" → misafirde giriş kapısı (public-a Q20;
      // legacy misafire açıktı — sahip legacy'yi isterse bu satırı kaldırmak yeterli).
      if (dkLoginGate("Paylaşmak")) return;
      // legacy shareText birebir. navigator.share başarısızsa (masaüstünde desteklenmeyen hedef vb.; kullanıcı iptali HARİÇ) panoya kopyalamaya düşer.
      const txt = `${p.authorName}: ${p.content || ""}`;
      if (navigator.share) {
        try { await navigator.share({ text: txt, url: "https://gigbridges.com" }); return; }
        catch (e) { if (e?.name === "AbortError") return; }
      }
      try {
        await navigator.clipboard.writeText(txt + " — gigbridges.com");
        shareBtn.classList.add("is-copied"); shareL.textContent = "Panoya kopyalandı";
        live_.textContent = ""; requestAnimationFrame(() => { live_.textContent = "Panoya kopyalandı"; });
      } catch (_) {}
    });
    const actions = h("div", { class: "dk-akis-actions" }, likeBtn, cmtBtn, shareBtn);

    // ── satır içi yorumlar ──
    let thread = null, threadEb = null, threadList = null, cInput = null;
    const renderComments = () => {
      if (!threadList) return;
      if (comments == null) { threadList.replaceChildren(h("div", { class: "dk-akis-cm-row" }, dkSkeleton({ w: 32, h: 32, r: 16 }), dkSkeleton({ w: "70%", h: 52, r: 10 }))); return; }
      if (!comments.length) { threadList.replaceChildren(h("p", { class: "dk-akis-cm-none" }, "Henüz yorum yok. İlk yorumu sen yaz!")); return; }
      threadList.replaceChildren(...comments.map((c) => h("div", { class: "dk-akis-cm-row" },
        gradAv(c.authorName, "dk-akis-av-32"),
        h("div", { class: "dk-akis-cm-b" },
          h("span", { class: "dk-akis-cm-top" }, h("span", { class: "dk-akis-cm-a" }, c.authorName || "Kullanıcı"), h("span", { class: "dk-akis-cm-time" }, whenText(c.createdAt))),
          h("span", { class: "dk-akis-cm-x" }, c.text || "")))));
    };
    const send = async () => {
      if (dkLoginGate("Yorum yazmak")) return;
      const v = cInput.value.trim(); if (!v) return;
      cInput.value = "";
      try { await addComment(p.id, me, myName(), v); }
      catch (_) { dkToast("Gönderilemedi", { type: "err" }); cInput.value = v; }
    };
    const buildThread = () => {
      threadEb = h("span", { class: "dk-akis-th-eb" });
      threadList = h("div", { class: "dk-akis-cm-list" });
      cInput = h("input", { type: "text", maxlength: "300", placeholder: "Yorum yaz...", class: "dk-akis-cin-i", autocomplete: "off" });
      cInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } });
      const sendBtn = h("button", { type: "button", class: "dk-akis-send dk-press", "aria-label": "Yorumu gönder", onclick: send }, svgRaw(SVG.arrow, { size: 17, sw: "2.2" }));
      thread = h("div", { class: "dk-akis-thread dk-fa", id: tid },
        threadEb, threadList,
        h("div", { class: "dk-akis-cin" },
          authed ? gradAv(myName(), "dk-akis-av-32") : ghostAv("dk-akis-ghost-32", 15),
          h("label", { class: "dk-akis-cin-l" }, h("span", { class: "dk-sr" }, "Yorum yaz"), cInput),
          sendBtn));
      renderComments();
    };
    const setOpen = (on) => {
      if (on === open) return;
      open = on;
      if (on) {
        if (!thread) buildThread();
        comments = null; renderComments();
        node.append(thread); replayAnim(thread, "dk-fa");
        cUnsub = listenComments(p.id, (list) => { if (!open) return; comments = list; renderComments(); paintCmt(); });
      } else {
        try { cUnsub?.(); } catch (_) {}
        // "Daha eski" sayfadan gelen gönderi canlı değil (update() hiç gelmez): kapanışta bilinen gerçek yorum sayısını koru
        if (comments) syncOlder({ commentCount: comments.length });
        cUnsub = null; comments = null; thread?.remove();
      }
      paintCmt();
    };
    cmtBtn.addEventListener("click", () => setOpen(!open));
    paintCmt();

    const node = h("article", { class: "dk-akis-post", "aria-label": `${p.authorName || "Kullanıcı"} gönderisi, ${t.l}`, dataset: { post: p.id } },
      h("span", { class: "dk-akis-post-accent", style: { background: t.c }, "aria-hidden": "true" }),
      body, actions);
    node._akisCard = true;
    ensureTags();

    return {
      node,
      update(np) {
        p = np;
        author.textContent = p.authorName || "Kullanıcı";
        paintMeta();
        if (text.textContent !== (p.content || "")) text.textContent = p.content || "";
        if (!likeBusy) { const n = Number(p.likeCount) || 0; if (n !== likeCount) { likeCount = n; paintLike(); } }
        paintCmt();
      },
      destroy() { try { cUnsub?.(); } catch (_) {} cUnsub = null; open = false; },
    };
  }

  // Etkinlik eki kartı (ev null → gönderideki metinlerle yer tutucu; ev gelince yenisiyle değiştirilir)
  function attachment(p, ev) {
    const img = ev ? evImage(ev) : null;
    const title = (ev && evTitle(ev)) || p.event || "Etkinlik";
    const ph = () => h("span", { class: "dk-akis-att-ph", style: { background: genreGrad(primaryGenre(ev || {}), 150) } }, h("span", {}, initials(title)));
    let thumbIn;
    if (img) {
      thumbIn = h("img", { src: img, alt: "", loading: "lazy", decoding: "async" });
      thumbIn.addEventListener("error", () => thumbIn.replaceWith(ph()), { once: true });
    } else thumbIn = ev ? ph() : dkSkeleton({ w: "100%", h: "100%", r: 0 });
    const s = ev ? eventStartMs(ev) : null;
    const metaTxt = ev ? [ev.artistName, ev.venueName, s != null ? fmtDateShort(s) : null].filter(Boolean).join(" · ") : (p.venue || "");
    return h("a", { href: "#/etkinlik/" + encodeURIComponent(p.eventId), class: "dk-akis-att dk-card" },
      h("span", { class: "dk-akis-att-th" }, thumbIn),
      h("span", { class: "dk-akis-att-c" },
        h("span", { class: "dk-akis-att-eb" }, svgRaw(SVG.note, { size: 11, sw: "2" }), "ETKİNLİK"),
        h("span", { class: "dk-akis-att-t" }, title),
        h("span", { class: "dk-akis-att-m" }, metaTxt)),
      svgRaw(SVG.arrow, { size: 16, sw: "2", color: "#8A8E97", cls: "dk-akis-att-go" }));
  }

  // ══════════════════════════════════════════════════════════════════════
  // Composer
  // ══════════════════════════════════════════════════════════════════════
  function buildComposer() {
    let expanded = false, listOpen = false, selected = null, events = null, busy = false;
    const pill = h("button", { type: "button", class: "dk-akis-pill dk-press", "aria-expanded": "false", "aria-controls": "dk-akis-new" }, "Katıldığın etkinlik hakkında yorumun...");
    const shareB = h("button", { type: "button", class: "dk-akis-cta dk-press", "aria-expanded": "false", "aria-controls": "dk-akis-new" }, svgRaw(SVG.plus, { size: 15, sw: "2.2" }), "Paylaş");
    const row = h("div", { class: "dk-akis-comp-row" }, authed ? gradAv(myName(), "dk-akis-av-40") : ghostAv("dk-akis-ghost-40", 18), pill, shareB);

    const selL = h("span", { class: "dk-akis-sel-l" }, "Katıldığın etkinliği seç");
    const chev = h("span", { class: "dk-akis-sel-chev" });
    const selBtn = h("button", { type: "button", class: "dk-akis-sel dk-press", "aria-expanded": "false", "aria-controls": "dk-akis-evlist" },
      svgRaw(SVG.note, { size: 16, sw: "1.9", color: "#FF4FA3" }), selL, chev);
    const evList = h("div", { class: "dk-akis-evlist dk-scroll", id: "dk-akis-evlist", role: "radiogroup", "aria-label": "Katıldığın etkinlikler", hidden: true });
    const ta = h("textarea", { rows: "4", maxlength: "500", class: "dk-akis-ta", placeholder: "Katıldığın etkinlik hakkında yorumun..." });
    const counter = h("span", { class: "dk-akis-count", "aria-live": "off" }, "0/500");
    ta.addEventListener("input", () => { counter.textContent = ta.value.length + "/500"; });
    const cancel = h("button", { type: "button", class: "dk-akis-cancel dk-press" }, "İptal");
    const submit = h("button", { type: "button", class: "dk-akis-submit dk-press" }, "Paylaş");
    const panel = h("div", { class: "dk-akis-new dk-fa", id: "dk-akis-new", hidden: true },
      h("span", { class: "dk-akis-new-eb" }, "YENİ GÖNDERİ"),
      selBtn, evList,
      h("label", { class: "dk-akis-ta-l" }, h("span", { class: "dk-sr" }, "Gönderi metni"), ta),
      h("div", { class: "dk-akis-new-f" }, counter, h("div", { class: "dk-akis-new-b" }, cancel, submit)));

    const paintSel = () => {
      selL.textContent = selected ? [selected.title || "Etkinlik", selected.venueName].filter(Boolean).join(" · ") : "Katıldığın etkinliği seç";
      selBtn.classList.toggle("is-set", !!selected);
      chev.replaceChildren(svgPath(listOpen ? SVG.chevUp : SVG.chevDown, { size: 15, sw: "2", color: "#8A8E97" }));
      selBtn.setAttribute("aria-expanded", listOpen ? "true" : "false");
      evList.hidden = !listOpen;
      // Radyo grubu: gezen tabindex (Tab ile gruba TEK durak — seçili, yoksa ilk seçenek)
      const opts = [...evList.querySelectorAll(".dk-akis-ev")];
      const anyOn = opts.some((b) => b._ev === selected);
      opts.forEach((b, i) => {
        const on = b._ev === selected;
        b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = (anyOn ? on : i === 0) ? 0 : -1;
      });
    };
    const drawEvents = () => {
      if (events == null) { evList.replaceChildren(h("div", { class: "dk-akis-ev-msg" }, dkSkeleton({ w: "60%", h: 14 }))); return; }
      if (!events.length) { evList.replaceChildren(h("div", { class: "dk-akis-ev-msg" }, "Katıldığınız etkinlik bulunamadı. Bir etkinliğe katıldığınızda burada görünür.")); return; }
      evList.replaceChildren(...events.map((ev) => {
        const b = h("button", { type: "button", role: "radio", class: "dk-akis-ev dk-row", "aria-checked": "false" },
          h("span", { class: "dk-akis-ev-dot", "aria-hidden": "true" }),
          h("span", { class: "dk-akis-ev-c" }, h("span", { class: "dk-akis-ev-t" }, ev.title || "Etkinlik"), h("span", { class: "dk-akis-ev-v" }, ev.venueName || "")));
        b._ev = ev;
        b.addEventListener("click", () => { selected = ev; listOpen = false; paintSel(); selBtn.focus(); });
        return b;
      }));
      paintSel();
    };
    selBtn.addEventListener("click", async () => {
      listOpen = !listOpen; paintSel();
      if (listOpen && events == null) {
        drawEvents();
        let list = [];
        try { list = await attendedEvents(me); } catch (_) { list = []; }
        if (destroyed) return;
        events = list; drawEvents();
      }
    });
    // WAI-ARIA radio: oklar odağı taşır VE seçer (liste açık kalır, seçim düğmesi etiketi güncellenir); Enter/Boşluk/tık onaylayıp kapatır.
    evList.addEventListener("keydown", (e) => {
      const opts = [...evList.querySelectorAll(".dk-akis-ev")]; const i = opts.indexOf(document.activeElement);
      if (i < 0 || !opts.length) return;
      const last = opts.length - 1;
      const j = e.key === "ArrowDown" || e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
        : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
          : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
      if (j < 0) return;
      e.preventDefault();
      selected = opts[j]._ev; paintSel(); opts[j].focus();
    });

    const reset = () => { selected = null; listOpen = false; ta.value = ""; counter.textContent = "0/500"; paintSel(); };
    const setExpanded = (on, focusBack) => {
      expanded = on;
      panel.hidden = !on;
      pill.setAttribute("aria-expanded", on ? "true" : "false");
      shareB.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) { replayAnim(panel, "dk-fa"); requestAnimationFrame(() => { try { ta.focus({ preventScroll: true }); } catch (_) {} }); }
      else { listOpen = false; paintSel(); if (focusBack) (opener || pill).focus(); }
    };
    let opener = null;   // kapanınca odak, paneli açan düğmeye (hap ya da "+ Paylaş") döner
    const toggle = (e) => {
      if (dkLoginGate("Gönderi paylaşmak")) return;
      if (!expanded) opener = e?.currentTarget || pill;
      setExpanded(!expanded, false);
    };
    pill.addEventListener("click", toggle);
    shareB.addEventListener("click", toggle);
    cancel.addEventListener("click", () => { if (busy) return; reset(); setExpanded(false, true); });
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (listOpen) { listOpen = false; paintSel(); selBtn.focus(); } else setExpanded(false, true);
    });
    submit.addEventListener("click", async () => {
      if (dkLoginGate("Gönderi paylaşmak")) return;
      if (busy) return;
      const v = ta.value.trim();
      if (!v) { dkToast("Bir şeyler yaz", { type: "err" }); ta.focus(); return; }
      // `disabled` değil aria-disabled: odaktaki Paylaş devre dışı kalınca odak <body>'ye düşmesin (hata durumunda yerinde kalır)
      busy = true; [submit, cancel].forEach((b) => b.setAttribute("aria-disabled", "true")); submit.setAttribute("aria-busy", "true");
      try {
        await createPostDoc(me, myName(), session.profile?.city, v, selected
          ? { type: "review", event: selected.title || null, venue: selected.venueName || null, venueId: selected.venueId || null, eventId: selected.id || null }
          : {});
        if (destroyed) return;
        dkToast("Paylaşıldı");
        reset(); setExpanded(false, true);
      } catch (_) { dkToast("Gönderilemedi", { type: "err" }); }
      finally { busy = false; [submit, cancel].forEach((b) => b.removeAttribute("aria-disabled")); submit.removeAttribute("aria-busy"); }
    });
    paintSel();
    return { node: h("section", { class: "dk-akis-comp", "aria-label": "Yeni gönderi" }, row, panel) };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Sağ ray verisi
  // ══════════════════════════════════════════════════════════════════════
  function skelRow(tile) {
    return h("div", { class: "dk-akis-skrow", "aria-hidden": "true" }, dkSkeleton(tile ? { w: 44, h: 48, r: 6 } : { w: 40, h: 40, r: 20 }),
      h("span", { class: "dk-akis-skrow-c" }, dkSkeleton({ w: "70%", h: 13 }), dkSkeleton({ w: "45%", h: 11 })));
  }
  let artists = null, weekEvents = null;
  const followedHere = new Set();   // bu sayfada raydan takip edilenler ("Takipte" olarak yerinde kalır)
  function drawSuggestions() {
    if (artists == null || !followsReady) return;
    const c = railCity();
    const list = artists.filter((a) => a.id !== me && (!followIds.has(a.id) || followedHere.has(a.id)))
      .sort((a, b) => {
        const ca = c && fold(a.city) === fold(c) ? 0 : 1, cb = c && fold(b.city) === fold(c) ? 0 : 1;
        return ca - cb || (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0);
      }).slice(0, 4);
    if (!list.length) { sug.hidden = true; return; }
    sug.hidden = false;
    sugList.replaceChildren(...list.map((a) => {
      const name = a.displayName || "Sanatçı";
      const g = artistGenres(a)[0] || "";
      const sub = [g, a.district || a.city].filter(Boolean).join(" · ");
      const photo = a.photoURL
        ? h("img", { src: a.photoURL, alt: "", loading: "lazy", decoding: "async", class: "dk-akis-sug-img" })
        : dkAvatar({ name, size: 40, genre: g || "Diğer" });
      if (photo.tagName === "IMG") photo.addEventListener("error", () => photo.replaceWith(dkAvatar({ name, size: 40, genre: g || "Diğer" })), { once: true });
      const fb = dkFollowButton({ variant: "rail", name, followed: followIds.has(a.id), onToggle: async (next) => {
        if (dkLoginGate("Takip etmek")) return false;
        try {
          if (next) await followArtist(me, a); else await unfollowArtist(me, a.id);
          if (next) followIds.add(a.id); else followIds.delete(a.id);
          followedHere.add(a.id);
          drawFeed();
          return true;
        } catch (_) { dkToast("İşlem başarısız", { type: "err" }); return false; }
      } });
      return h("div", { class: "dk-akis-sug-r" },
        h("a", { href: "#/sanatci/" + encodeURIComponent(a.id), class: "dk-akis-sug-a" }, photo,
          h("span", { class: "dk-akis-sug-c" }, h("span", { class: "dk-akis-sug-n" }, name), sub ? h("span", { class: "dk-akis-sug-s" }, sub) : null)),
        fb);
    }));
  }
  // "Bu hafta" = WebEtkinlikler tarih=bu-hafta / WebLanding ile aynı pencere: bugün 00:00 ≤ başlangıç ≤ şimdi + 7 gün
  const inWeek = (e, now = Date.now()) => { const s = eventStartMs(e); return s != null && s >= startOfDay(now) && s <= now + WEEK_MS; };
  // SHARED-CANDIDATE: cards.eventRowMini alt satırı artboard'da "{mekan} · Bugün 21:00 | Yarın 22:00 | Sal 20:30" — kart yalnız saati yazıyor;
  // burada gün etiketi eklenerek düzeltiliyor.
  const dayWord = (s) => (isToday(s) ? "Bugün" : isTomorrow(s) ? "Yarın" : DAYS_TR_SHORT[new Date(s).getDay()]);
  function drawWeek() {
    if (weekEvents == null) return;
    const c = railCity();
    const list = weekEvents.filter((e) => inWeek(e) && (!c || fold(e.city || e.location?.city) === fold(c))).slice(0, 4);
    if (!list.length) { week.hidden = true; return; }
    week.hidden = false;
    weekList.replaceChildren(...list.map((e) => {
      const row = eventRowMini(e);
      const s = eventStartMs(e);
      // Gün + saat kendi (küçülmeyen) aralığında: dar rayda yalnız mekan adı kısalır, "Bugün 19:15" hep okunur.
      const subEl = row.querySelector(".dk-erm-s");
      if (subEl && s != null) {
        const when = `${dayWord(s)} ${fmtTime(s)}`;
        subEl.replaceChildren(...(e.venueName
          ? [h("span", { class: "dk-akis-wk-v" }, e.venueName), h("span", { class: "dk-akis-wk-w" }, " · " + when)]
          : [h("span", { class: "dk-akis-wk-w" }, when)]));
      }
      return row;
    }));
  }

  // ══════════ Veri yükleme ══════════
  paintSrc(); paintHead(); drawFeed();
  const unsubTl = listenTimeline((ps) => {
    if (destroyed) return;
    // Eski sayfalar yüklüyken yeni gönderi canlı pencereyi (ilk 50) kaydırır: pencereden kuyruktan düşen gönderi `older`da da yok
    // (older, eski kuyruğun ALTINDAN yüklendi) → akıştan sessizce kaybolurdu. Kuyruktan düşenleri older'ın başına al.
    // Ortadan SİLİNEN gönderi yeni kuyruktan yenidir (ms > tail) → tutulmaz.
    if (older.length && live.length && ps.length) {
      const ids = new Set(ps.map((p) => p.id));
      const tail = toMsSafe(ps[ps.length - 1].createdAt);
      if (tail != null) {
        const known = new Set(older.map((p) => p.id));
        const dropped = live.filter((p) => { const m = toMsSafe(p.createdAt); return !ids.has(p.id) && !known.has(p.id) && m != null && m <= tail; });
        if (dropped.length) older = dropped.concat(older);
      }
    }
    live = ps; loaded = true;
    if (!older.length) hasMore = ps.length >= FIRST_PAGE;
    drawFeed();
  });
  unsubs.push(() => { try { unsubTl(); } catch (_) {} });
  if (authed && me) followingList(me).then((l) => {
    if (destroyed) return;
    followIds = new Set(l.map((f) => f.artistId || f.id));
  }).catch(() => {}).finally(() => { if (destroyed) return; followsReady = true; drawFeed(); drawSuggestions(); });
  listRealArtists().then((l) => { if (destroyed) return; artists = l; drawSuggestions(); }).catch(() => { artists = []; sug.hidden = true; });
  discoverEvents().then((l) => { if (destroyed) return; weekEvents = l; drawWeek(); }).catch(() => { weekEvents = []; week.hidden = true; });

  // Header şehir seçimi (dk:citychange) → misafirde Şehrim + başlık, herkeste BU HAFTA + öneri önceliği
  const onCity = () => { drawFeed(); drawSuggestions(); drawWeek(); };
  window.addEventListener("dk:citychange", onCity);
  unsubs.push(() => window.removeEventListener("dk:citychange", onCity));

  return {
    node: shell.node,
    update(q) { setSrc(srcFromQuery(q), false); },
    onSession() { if (destroyed) return false; drawFeed(); drawSuggestions(); drawWeek(); return true; },
    destroy() {
      destroyed = true;
      cards.forEach((c) => c.destroy()); cards.clear();
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}
