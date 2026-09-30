// WebMekanSanatciBul — "Sanatçı Bul" masaüstü görünümü (≥769 px). Registry anahtarı: venueSanatci (#/venue/sanatci, yalnız mekan).
// Spec: specs/mekan.md WebMekanSanatciBul (+ §0 kabuk, §0.7 modal/toast). Artboard: design/WebMekanSanatciBul.dc.html.
// CSS: css/dk-mekan-sanatci-bul.css (.dk-mekan-sanatci-bul kökü = kabuğun içerik bölgesi). ≤768: legacy renderArtists aynen.
//
// Legacy (js/pages/venue.js renderArtists + faCard + inviteModal) özellikleri — KORUNDU:
//   sanatçı + grup havuzu (listArtists / listGroups), TİP (Sanatçılar/Gruplar, tekrar tık temizler), TÜR (7 çip, ilk tür),
//   dinamik ŞEHİR çipleri (mekanın şehri önce), ada/şehre göre arama (tr küçük harf), Puan / Katılım sıralaması, ilk 3 solo
//   madalyası, gizli takip (watchArtist / unwatchArtist, "Gizli takibe alındı" / "Takipten çıkarıldı" / "İşlem başarısız"),
//   kart tıklaması → #/venue/performans/{id} (solo), biyografi (başlık ipucu olarak), takipçi + katılım + ücret bilgisi,
//   boş durum metinleri, davet modalı: Tek Etkinlik / Uzun Dönem; tarih+saat / ücret ≥ ₺3.500 / aynı gün çift teklif kontrolü
//   (findExistingInvitation) / 16:9 kırpıcılı etkinlik fotoğrafı (uploadImage) / createInvitation (+ sohbete teklif mesajı,
//   data.js içinde) · createGroupInvitation (üyelere yayılır) · createResidency; "Davet gönderildi" / "Anlaşma teklifi gönderildi" /
//   "Gönderilemedi".
// Tasarımın ekledikleri: sol filtre paneli (BÜTÇE kaydırıcısı + MİN. PUAN), kart/tablo görünümü, sonuç sayısı + filtre özeti,
//   "Gönderildi ✓" durumu (bekleyen davetlerden de tohumlanır), davetin mevcut sanatçısız etkinliğe bağlanması (ETKİNLİK seçimi).
// App paritesi (FindArtistScreen): solo davet/anlaşma sonrası sanatçıya uygulama içi bildirim (event_invite / residency_offer; aynı
//   metin ve alanlar — sendNotification ile, fromUserId = oturum; grupta YOK: üye başına artistId'li davetler onNewInvitation ile zaten
//   push alır, ek bildirim çift push olurdu), grup için aynı gün çift davet kontrolü, gruba uzun dönem anlaşma YOK (düğme gizli, sekme kapalı).
//
// URL: #/venue/sanatci?q=&tip=artist|group&tur=Jazz&sehir=İzmir&butce=8000&puan=4.5&sira=katilim&gorunum=liste (replaceState;
//   update(query) geri/ileri ve üst bar araması için). Üst bar araması bu sayfada canlı süzer (filtre panelindeki aramayla eşli).
// Okumalar: listArtists, listGroups, watchedArtists + yerel salt-okuma sorgular (tek alan eşitliği, yeni indeks YOK):
//   events where venueId==uid (davet ETKİNLİK seçimi — venueEvents() KULLANILMAZ: afiş temizleme yazım yan etkisi var),
//   invitations where venueId==uid (bekleyen davet → "Gönderildi ✓"; grup çift davet kontrolü — app ile aynı sorgu).
import { h, openImageCropper } from "../../ui.js";
import { session } from "../../store.js";
import { db, collection, query, where, getDocs } from "../../firebase.js";
import {
  listArtists, listGroups, watchedArtists, watchArtist, unwatchArtist,
  createInvitation, createGroupInvitation, createResidency, findExistingInvitation, uploadImage, sendNotification,
} from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkModal, dkDrawer, dkToast, dkSkeleton } from "../shared/ui.js";
import { fold, trUpper, fmtInt, shortNumTR, writeQuery, swapAnim, isoDate, MONTHS_TR, MONTHS_TR_SHORT, DAYS_TR_SHORT, eventStartMs } from "../shared/helpers.js";
import { genreFamily, GENRE_FAMILIES } from "../shared/genres.js";

// ══════════════════════════════════════════════════════════════════════
// Sabitler (artboard DCLogic + legacy)
// ══════════════════════════════════════════════════════════════════════
const MIN_STAGE_FEE = 3500;
const BUDGET_MIN = 3500, BUDGET_MAX = 15000, BUDGET_STEP = 500;
// TÜR çipleri: artboard sırası; renk = genres.js aile rengi (artboard GC ile aynı değerler)
const GENRE_CHIPS = ["Tümü", "Electronic", "Jazz", "Pop", "Rock", "Akustik", "Hip-Hop"];
const CHIP_FAMILY = { Electronic: "electronic", Jazz: "jazz", Pop: "pop", Rock: "rock", Akustik: "akustik", "Hip-Hop": "hiphop" };
const RATINGS = [[0, "Tümü"], [4.5, "4.5+"], [4.8, "4.8+"]];
// Görselsiz kart gradyanları (artboard GRAD = legacy GENRE_GRADS; aileye göre)
const GRAD = { electronic: ["#6C3FC5", "#3B1FA0"], jazz: ["#D97706", "#92400E"], pop: ["#DB2777", "#9D174D"], akustik: ["#047857", "#064E3B"], hiphop: ["#C2410C", "#7C2D12"], rock: ["#BE185D", "#831843"] };
const gradOf = (g) => { const [a, b] = GRAD[genreFamily(g).key] || ["#4A4A6A", "#2A2A4A"]; return `linear-gradient(135deg,${a},${b})`; };
const MEDAL = ["#FFD700", "#C0C0C0", "#CD7F32"];
const DAY_CHIPS = [["Pzt", 1], ["Sal", 2], ["Çar", 3], ["Per", 4], ["Cum", 5], ["Cmt", 6], ["Paz", 0]]; // legacy: Pzt→1 … Paz→0

// Artboard SVG gövdeleri (birebir)
const I = {
  funnel: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"></rect><rect x="13" y="4" width="7" height="7" rx="1"></rect><rect x="4" y="13" width="7" height="7" rx="1"></rect><rect x="13" y="13" width="7" height="7" rx="1"></rect>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"></path><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"></path>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  trend: '<path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path>',
  repeat: '<path d="M17 2l3 3-3 3"></path><path d="M4 11V9a4 4 0 0 1 4-4h12"></path><path d="M7 22l-3-3 3-3"></path><path d="M20 13v2a4 4 0 0 1-4 4H4"></path>',
  chevron: '<path d="m6 9 6 6 6-6"></path>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"></rect><circle cx="8.5" cy="9.5" r="1.8"></circle><path d="m21 16-5-5-9 8.5"></path>',
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>',
};
const ico = (k, size = 16, o = {}) => svgRaw(I[k], { size, sw: o.sw || "1.8", ...o });
const starIco = (size, color = "currentColor") => svgRaw(I.star, { size, fill: true, color });

// ── veri yardımcıları (legacy nameOf/genreOf/priceOf ile aynı öncelik) ──
const nameOf = (x) => x.displayName || x.name || "Sanatçı";
const genreOf = (x) => (Array.isArray(x.genres) ? x.genres[0] : Array.isArray(x.genre) ? x.genre[0] : x.genre) || "";
const ratingOf = (x) => Number(x.avgRating) || 0;
const attOf = (x) => Number(x.attendanceCount ?? x.totalAttendance) || 0;
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return isFinite(n) && n > 0 ? n : 0; };
function feeRange(x) {
  const lo = num(x.priceMin), hi = num(x.priceMax);
  const single = num(x.price ?? x.stageFee ?? x.fee);
  if (lo && hi && hi !== lo) return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  if (lo || hi) return { min: lo || hi, max: lo || hi };
  if (single) return { min: single, max: single };
  return null;
}
const NF = new Intl.NumberFormat("tr-TR");
function feeLabel(x) {
  const r = feeRange(x);
  if (!r) return "Ücret belirtilmemiş";
  return r.min === r.max ? "₺" + NF.format(r.min) : `₺${NF.format(r.min)} – ${NF.format(r.max)}`;
}
const initialOf = (name) => trUpper(String(name || "?").replace(/^DJ\s+/i, "").trim().charAt(0) || "?");
const membersOf = (g) => (Array.isArray(g.memberIds) ? g.memberIds.length : 0);
const perfHref = (x) => "#/venue/performans/" + encodeURIComponent(x.id);
// app isoToTRDate ("2026-07-15" → "15 Temmuz 2026") + formatTL ("₺2.500") + residencies.formatDays (Pzt öncelikli, ", ")
function isoToTRDate(iso) {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || "");
  const mi = parseInt(m[2], 10) - 1;
  return mi < 0 || mi > 11 ? String(iso) : `${parseInt(m[3], 10)} ${MONTHS_TR[mi]} ${parseInt(m[1], 10)}`;
}
const formatTL = (n) => "₺" + Number(n).toLocaleString("tr-TR");
const formatDays = (days) => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYS_TR_SHORT[d]).join(", ");
const pad2 = (n) => String(n).padStart(2, "0");
let _mid = 0; // davet modalı sekme/panel kimlikleri

// ── salt-okuma yerel sorgular (tek alan eşitliği; mevcut kurallar/indekslerle) ──
async function venueEventsRO(uid) {
  const s = await getDocs(query(collection(db, "events"), where("venueId", "==", uid)));
  const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.fromCache = s.metadata.fromCache; // bağlantı sinyali (listArtists meta vermez)
  return list;
}
async function venueInvitationsRO(uid) {
  const s = await getDocs(query(collection(db, "invitations"), where("venueId", "==", uid)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── URL durumu ──
const DEFAULTS = { term: "", tip: "", tur: "Tümü", sehir: "", butce: BUDGET_MAX, puan: 0, sira: "puan", gorunum: "kart" };
function readState(q) {
  const s = { ...DEFAULTS };
  if (!q) return s;
  s.term = q.get("q") || "";
  const tip = q.get("tip"); s.tip = tip === "artist" || tip === "group" ? tip : "";
  const tur = q.get("tur"); s.tur = GENRE_CHIPS.includes(tur) ? tur : "Tümü";
  s.sehir = (q.get("sehir") || "").trim();
  const b = Number(q.get("butce")); s.butce = b >= BUDGET_MIN && b < BUDGET_MAX ? Math.round(b / BUDGET_STEP) * BUDGET_STEP : BUDGET_MAX;
  const p = Number(q.get("puan")); s.puan = p === 4.5 || p === 4.8 ? p : 0;
  s.sira = q.get("sira") === "katilim" ? "katilim" : "puan";
  s.gorunum = q.get("gorunum") === "liste" ? "liste" : "kart";
  return s;
}
const toQuery = (s) => ({
  q: s.term.trim() || null, tip: s.tip || null, tur: s.tur !== "Tümü" ? s.tur : null, sehir: s.sehir || null,
  butce: s.butce < BUDGET_MAX ? s.butce : null, puan: s.puan || null, sira: s.sira === "katilim" ? "katilim" : null,
  gorunum: s.gorunum === "liste" ? "liste" : null,
});

// ══════════════════════════════════════════════════════════════════════
// GÖRÜNÜM
// ══════════════════════════════════════════════════════════════════════
export function venueSanatciBulView(ctx) {
  const uid = ctx.session?.user?.uid || session.user?.uid;
  const profile = () => session.profile || ctx.session?.profile || {};
  const myCity = String(profile().city || "").trim();
  const myName = profile().displayName || "Mekan";
  const sigOf = (p) => [p?.displayName || "", p?.photoURL || "", String(p?.city || "").trim()].join("|");
  const sig0 = sigOf(profile());
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });

  let st = readState(ctx.query);
  let artists = [], groups = [], watched = new Set(), sent = new Set(), upcoming = [];
  let loaded = false, failed = false;

  const shell = panelShell({
    role: "venue", active: ctx.route?.nav || "sanatci", title: "Sanatçı Bul", crumb: "Sanatçı bul", ctx,
    search: { value: st.term, onInput: (v) => setTerm(v, "top"), onSubmit: (v) => { setTerm(v, "top"); focusResults(); } },
  });
  const root = shell.content;
  root.classList.add("dk-mekan-sanatci-bul");

  // ── HERO ──
  const hero = h("div", { class: "dk-mekan-sanatci-bul-hero dk-rise" },
    h("div", { class: "dk-mekan-sanatci-bul-herocol" },
      h("span", { class: "dk-mekan-sanatci-bul-eyebrow" }, "SANATÇI BUL"),
      h("h2", { class: "dk-mekan-sanatci-bul-h2" }, "Sahnene uygun ", h("em", {}, "sanatçıyı"), " bul."),
      h("p", { class: "dk-mekan-sanatci-bul-lead" }, "Mekanınız için en uygun sanatçıyı keşfedin — tek etkinlik ya da uzun dönem teklif gönderin.")));

  // ── FİLTRE PANELİ ──
  const chipBtn = (label, { dot, star, onClick, pressed }) => {
    const b = h("button", { type: "button", class: "dk-mekan-sanatci-bul-chip dk-press", "aria-pressed": pressed ? "true" : "false", onclick: onClick },
      dot ? h("span", { class: "dk-mekan-sanatci-bul-chipdot", style: { background: dot } }) : null,
      star ? starIco(11) : null, label);
    return b;
  };
  const setPressed = (b, on) => { b.setAttribute("aria-pressed", on ? "true" : "false"); };
  const group = (label, aria, kids) => h("div", { role: "group", "aria-label": aria, class: "dk-mekan-sanatci-bul-fgroup" },
    h("span", { class: "dk-mekan-sanatci-bul-flabel" }, label), h("div", { class: "dk-mekan-sanatci-bul-chips" }, ...kids));

  const typeChips = [["artist", "Sanatçılar"], ["group", "Gruplar"]].map(([k, l]) => {
    const b = chipBtn(l, { pressed: st.tip === k, onClick: () => bump({ tip: st.tip === k ? "" : k }) });
    b.dataset.k = k; return b;
  });
  const genreChips = GENRE_CHIPS.map((g) => {
    const b = chipBtn(g, { dot: g === "Tümü" ? "#F2F1EE" : GENRE_FAMILIES[CHIP_FAMILY[g]].color, pressed: st.tur === g, onClick: () => bump({ tur: g }) });
    b.dataset.k = g; return b;
  });
  const cityWrap = h("div", { class: "dk-mekan-sanatci-bul-chips" });
  let cityChips = [];
  const ratingChips = RATINGS.map(([k, l]) => {
    const b = chipBtn(l, { star: true, pressed: st.puan === k, onClick: () => bump({ puan: k }) });
    b.dataset.k = String(k); return b;
  });
  const fSearch = h("input", { type: "text", "aria-label": "Sanatçı ara", placeholder: "Sanatçı ara...", class: "dk-mekan-sanatci-bul-finp", autocomplete: "off", spellcheck: "false" });
  fSearch.value = st.term;
  fSearch.addEventListener("input", () => setTerm(fSearch.value, "panel"));
  const budgetVal = h("span", { class: "dk-mekan-sanatci-bul-budgetval" });
  const budget = h("input", { type: "range", min: String(BUDGET_MIN), max: String(BUDGET_MAX), step: String(BUDGET_STEP), "aria-label": "Maksimum sahne ücreti", class: "dk-mekan-sanatci-bul-range" });
  budget.value = String(st.butce);
  // artboard onChange (React) = her sürüklemede; sayı etiketi anında, sonuç listesi aynı karede güncellenir (animasyon yok — bump değil)
  budget.addEventListener("input", () => { st.butce = Number(budget.value); sync(); draw(); });
  const clearBtn = h("button", { type: "button", class: "dk-mekan-sanatci-bul-clear dk-link", onclick: () => reset() }, "Temizle");
  const fhead = h("div", { class: "dk-mekan-sanatci-bul-fhead" },
    h("span", { class: "dk-mekan-sanatci-bul-fhead-t" }, ico("funnel", 16, { color: "#FF8A2A" }), "Filtreler"), clearBtn);
  const filters = h("aside", { "aria-label": "Filtreler", class: "dk-mekan-sanatci-bul-filters" },
    fhead,
    h("label", { class: "dk-mekan-sanatci-bul-fsearch" }, ico("search", 16, { color: "#8A8E97" }), fSearch),
    group("TİP", "Tip", typeChips),
    group("TÜR", "Tür", genreChips),
    h("div", { role: "group", "aria-label": "Şehir", class: "dk-mekan-sanatci-bul-fgroup" }, h("span", { class: "dk-mekan-sanatci-bul-flabel" }, "ŞEHİR"), cityWrap),
    h("div", { class: "dk-mekan-sanatci-bul-fgroup" },
      h("div", { class: "dk-mekan-sanatci-bul-budgethead" }, h("span", { class: "dk-mekan-sanatci-bul-flabel" }, "BÜTÇE · MAKS. ÜCRET"), budgetVal),
      budget,
      h("div", { class: "dk-mekan-sanatci-bul-scale" }, h("span", {}, "₺3.500"), h("span", {}, "₺15.000+"))),
    group("MİN. PUAN", "Minimum puan", ratingChips),
    h("div", { class: "dk-mekan-sanatci-bul-note" }, ico("eye", 16, { color: "#4ED8FF" }),
      h("span", {}, "Göz simgesiyle sanatçıyı ", h("span", { class: "dk-mekan-sanatci-bul-note-hl" }, "gizli takibe"), " alırsın; yalnız sen görürsün.")));
  const filterSlot = h("div", { class: "dk-mekan-sanatci-bul-fslot" }, filters);

  // ── ARAÇ ÇUBUĞU ──
  const countEl = h("span", { class: "dk-mekan-sanatci-bul-count", "aria-live": "polite" }, "");
  const noteEl = h("span", { class: "dk-mekan-sanatci-bul-fnote" }, "");
  const fBadge = h("span", { class: "dk-mekan-sanatci-bul-fbadge", hidden: true });
  const filterBtn = h("button", { type: "button", class: "dk-mekan-sanatci-bul-fbtn dk-press", "aria-haspopup": "dialog", onclick: () => openDrawer() },
    ico("funnel", 16, { color: "#FF8A2A" }), "Filtreler", fBadge);
  const seg = (label, items) => h("div", { role: "radiogroup", "aria-label": label, class: "dk-mekan-sanatci-bul-seg" }, ...items);
  const sortBtns = [["puan", "Puan"], ["katilim", "Katılım"]].map(([k, l]) => {
    const b = h("button", { type: "button", role: "radio", class: "dk-mekan-sanatci-bul-segb dk-press", onclick: () => bump({ sira: k }) }, l);
    b.dataset.k = k; return b;
  });
  const viewBtns = [["kart", "Kart görünümü", "grid"], ["liste", "Tablo görünümü", "list"]].map(([k, l, ic]) => {
    const b = h("button", { type: "button", role: "radio", "aria-label": l, class: "dk-mekan-sanatci-bul-segb is-icon dk-press", onclick: () => bump({ gorunum: k }) }, ico(ic, 15));
    b.dataset.k = k; return b;
  });
  const segKeys = (el) => el.addEventListener("keydown", (e) => { // radiogroup ←/→
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const bs = [...el.querySelectorAll("button")]; const i = bs.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = bs[(i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length]; n.focus(); n.click();
  });
  const sortSeg = seg("Sıralama", sortBtns), viewSeg = seg("Görünüm", viewBtns);
  segKeys(sortSeg); segKeys(viewSeg);
  const toolbar = h("div", { class: "dk-mekan-sanatci-bul-toolbar" },
    filterBtn,
    h("div", { class: "dk-mekan-sanatci-bul-countcol" }, countEl, noteEl),
    h("div", { class: "dk-mekan-sanatci-bul-tright" }, h("span", { class: "dk-mekan-sanatci-bul-sortlbl" }, "Sırala:"), sortSeg, viewSeg));

  // ── SONUÇLAR ──
  let flip = false; // artboard flip: false → gb-fb
  const gridEl = h("div", { class: "dk-mekan-sanatci-bul-grid dk-fb" });
  const listBody = h("div", { role: "rowgroup" });
  const listEl = h("div", { role: "table", "aria-label": "Sanatçı listesi", class: "dk-mekan-sanatci-bul-table dk-fb" },
    h("div", { role: "row", class: "dk-mekan-sanatci-bul-tr dk-mekan-sanatci-bul-thead" },
      ...[["SANATÇI"], ["ŞEHİR", "c-city"], ["PUAN"], ["KATILIM", "c-att"], ["ÜCRET ARALIĞI"], ["İŞLEM", "c-act"]].map(([t, c]) => h("span", { role: "columnheader", class: c || null }, t))),
    listBody);
  const emptyTitle = h("span", { class: "dk-mekan-sanatci-bul-empty-t" });
  const emptySub = h("span", { class: "dk-mekan-sanatci-bul-empty-s" });
  const emptyBtn = h("button", { type: "button", class: "dk-mekan-sanatci-bul-empty-b dk-press", onclick: () => reset() }, "Filtreleri temizle");
  const emptyEl = h("div", { class: "dk-mekan-sanatci-bul-empty" }, ico("search", 36, { sw: "1.5", color: "#8A8E97" }), emptyTitle, emptySub, emptyBtn);
  const skelEl = h("div", { class: "dk-mekan-sanatci-bul-grid", "aria-busy": "true", "aria-label": "Yükleniyor" },
    ...Array.from({ length: 8 }, () => h("div", { class: "dk-mekan-sanatci-bul-skel" }, dkSkeleton({ h: 150, r: 0 }),
      h("div", { class: "dk-mekan-sanatci-bul-skelbody" }, dkSkeleton({ w: "70%", h: 16 }), dkSkeleton({ w: "50%", h: 12 }), dkSkeleton({ w: "85%", h: 12 }), dkSkeleton({ h: 40, r: 6 })))));
  const errEl = h("div", { class: "dk-mekan-sanatci-bul-empty", role: "alert" }, ico("info", 36, { sw: "1.5", color: "#8A8E97" }),
    h("span", { class: "dk-mekan-sanatci-bul-empty-t" }, "Yüklenemedi"),
    h("span", { class: "dk-mekan-sanatci-bul-empty-s" }, "Bağlantıyı kontrol edip yenile."),
    h("button", { type: "button", class: "dk-mekan-sanatci-bul-empty-b dk-press", onclick: () => load() }, "Tekrar dene"));
  const results = h("section", { "aria-label": "Sonuçlar", class: "dk-mekan-sanatci-bul-results", tabindex: "-1" }, toolbar, skelEl);
  const layout = h("div", { class: "dk-mekan-sanatci-bul-layout" }, filterSlot, results);
  root.append(hero, layout);

  // ── durum işlemleri ──
  function sync() { if (alive) writeQuery(toQuery(st)); }
  function bump(patch) { st = { ...st, ...patch }; flip = !flip; sync(); draw(true); }
  function setTerm(v, from) {
    st.term = v;
    if (from !== "panel" && fSearch.value !== v) fSearch.value = v;
    if (from !== "top" && shell.search?.input && shell.search.input.value !== v) shell.search.input.value = v;
    sync(); draw();
  }
  function reset() {
    st = { ...st, term: "", tip: "", tur: "Tümü", sehir: "", butce: BUDGET_MAX, puan: 0, sira: "puan" };
    fSearch.value = ""; if (shell.search?.input) shell.search.input.value = "";
    budget.value = String(BUDGET_MAX);
    flip = !flip; sync(); draw(true);
  }
  function focusResults() { try { results.focus({ preventScroll: false }); } catch (_) {} }

  // ── şehir çipleri (sanatçı + grup şehirleri; mekanın şehri önce — legacy) ──
  function buildCities() {
    const seen = new Map();
    [...artists, ...groups].forEach((x) => { const c = String(x.city || "").trim(); if (c && !seen.has(fold(c))) seen.set(fold(c), c); });
    let list = [...seen.values()].sort((a, b) => a.localeCompare(b, "tr"));
    if (myCity) list.sort((a, b) => (fold(a) === fold(myCity) ? -1 : fold(b) === fold(myCity) ? 1 : 0));
    if (st.sehir && !seen.has(fold(st.sehir))) list.push(st.sehir); // paylaşılan link: veride olmayan şehir de seçili görünsün
    cityChips = [["", "Tüm Şehirler"], ...list.map((c) => [c, c])].map(([k, l]) => {
      const b = chipBtn(l, { pressed: fold(st.sehir) === fold(k), onClick: () => bump({ sehir: k }) });
      b.dataset.k = k; return b;
    });
    cityWrap.replaceChildren(...cityChips);
  }

  // ── süzme + sıralama (tümü istemci tarafı) ──
  function pool() {
    const t = st.term.trim().toLocaleLowerCase("tr-TR");
    const fam = st.tur !== "Tümü" ? CHIP_FAMILY[st.tur] : null;
    const cf = st.sehir ? fold(st.sehir) : null;
    let p = st.tip === "group" ? groups : st.tip === "artist" ? artists : [...artists, ...groups];
    p = p.filter((x) => {
      if (t && !(nameOf(x).toLocaleLowerCase("tr-TR").includes(t) || String(x.city || "").toLocaleLowerCase("tr-TR").includes(t))) return false;
      if (fam && genreFamily(genreOf(x)).key !== fam) return false;
      if (cf && fold(String(x.city || "").trim()) !== cf) return false;
      if (st.butce < BUDGET_MAX) { const r = feeRange(x); if (r && r.min > st.butce) return false; } // ücretsiz/ücreti yok → geçer (spec)
      if (st.puan && ratingOf(x) < st.puan) return false;
      return true;
    });
    return p.slice().sort((a, b) => (st.sira === "puan" ? ratingOf(b) - ratingOf(a) : attOf(b) - attOf(a)));
  }

  // ── kart / satır ──
  function watchBtn(x, variant) {
    const w = watched.has(x.id);
    const b = h("button", { type: "button", class: cx("dk-mekan-sanatci-bul-watch dk-press", variant === "row" && "is-row"), "aria-pressed": w ? "true" : "false",
      "aria-label": (w ? "Gizli takipten çıkar: " : "Gizli takibe al: ") + nameOf(x), title: variant === "card" ? "Gizli takip (yalnız siz görürsünüz)" : null },
    ico("eye", variant === "row" ? 15 : 16));
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleWatch(x, b); });
    return b;
  }
  function paintWatch(b, x, on) {
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", (on ? "Gizli takipten çıkar: " : "Gizli takibe al: ") + nameOf(x));
  }
  async function toggleWatch(x, b) {
    if (b.disabled) return;
    const was = watched.has(x.id);
    // iyimser
    if (was) watched.delete(x.id); else watched.add(x.id);
    paintWatch(b, x, !was); b.disabled = true;
    try {
      if (was) await unwatchArtist(uid, x.id); else await watchArtist(uid, x);
      dkToast(was ? "Takipten çıkarıldı" : "Gizli takibe alındı");
    } catch (_) {
      if (was) watched.add(x.id); else watched.delete(x.id);
      if (b.isConnected) paintWatch(b, x, was);
      dkToast("İşlem başarısız", { type: "err" });
    } finally { b.disabled = false; }
  }
  const sentKey = (x) => (x._group ? "g:" : "a:") + x.id;
  function inviteBtn(x, variant) {
    const isSent = sent.has(sentKey(x));
    // erişilebilir ad sanatçıyı içerir (14 "Davet et" düğmesi ayırt edilebilsin); görünen metin aynı
    const b = h("button", { type: "button", class: cx("dk-mekan-sanatci-bul-inv dk-press", variant === "row" && "is-row", isSent && "is-sent"), dataset: { k: sentKey(x) } },
      isSent ? "Gönderildi ✓" : "Davet et", h("span", { class: "dk-sr" }, isSent ? ` — ${nameOf(x)}, yeniden davet et` : ` — ${nameOf(x)}`));
    b.addEventListener("click", (e) => { e.stopPropagation(); openInvite(x, "single"); });
    return b;
  }
  function longBtn(x, variant) {
    return h("button", { type: "button", class: cx("dk-mekan-sanatci-bul-long dk-press", variant === "row" && "is-row"), "aria-label": "Uzun dönem anlaşma teklif et: " + nameOf(x),
      title: "Uzun Dönem Anlaşma", onclick: (e) => { e.stopPropagation(); openInvite(x, "longterm"); } }, ico("repeat", variant === "row" ? 15 : 16));
  }
  function mediaOf(x, size) {
    const name = nameOf(x), g = genreOf(x);
    if (x.photoURL) {
      const img = h("img", { src: x.photoURL, alt: size === "card" ? name : "", loading: "lazy", decoding: "async", class: size === "card" ? "dk-mekan-sanatci-bul-img" : "dk-mekan-sanatci-bul-rowav" });
      img.addEventListener("error", () => img.replaceWith(initialEl(name, g, size)), { once: true });
      return img;
    }
    return initialEl(name, g, size);
  }
  function initialEl(name, g, size) {
    return h("span", { class: size === "card" ? "dk-mekan-sanatci-bul-ini" : "dk-mekan-sanatci-bul-rowav is-ini", style: { background: gradOf(g) }, "aria-hidden": "true" }, initialOf(name));
  }
  function card(x, rank) {
    const isG = !!x._group, name = nameOf(x), g = genreOf(x), fam = genreFamily(g), r = ratingOf(x);
    const cityLine = isG ? `${membersOf(x)} üye · ${x.city || "—"}` : [x.city, x.district].filter(Boolean).join(" · ");
    const media = h("div", { class: "dk-mekan-sanatci-bul-media" },
      mediaOf(x, "card"),
      h("span", { class: "dk-mekan-sanatci-bul-gtag" }, h("span", { class: "dk-mekan-sanatci-bul-gdot", style: { background: fam.color } }), trUpper(g || "Müzik")),
      rank != null && rank < 3 ? h("span", { class: "dk-mekan-sanatci-bul-medal", style: { color: MEDAL[rank] }, role: "img", "aria-label": `${rank + 1}. sıra` }, ico("trophy", 12),
        // artboard: "#" ve sıra ayrı esnek öğeler (gap 5 → "# 1")
        h("span", { "aria-hidden": "true" }, "#"), h("span", { "aria-hidden": "true" }, String(rank + 1))) : null,
      isG ? null : watchBtn(x, "card"));
    const nameEl = isG
      ? h("span", { class: "dk-mekan-sanatci-bul-name" }, h("span", { class: "dk-mekan-sanatci-bul-nm" }, name), h("span", { class: "dk-mekan-sanatci-bul-grp" }, "Grup"))
      : h("span", { class: "dk-mekan-sanatci-bul-name" }, h("a", { href: perfHref(x), class: "dk-mekan-sanatci-bul-nm", title: x.bio || null }, name));
    const followers = x.followerCount != null || !isG ? h("span", { class: "dk-mekan-sanatci-bul-fol" }, shortNumTR(x.followerCount ?? 0) + " takipçi") : null;
    const att = attOf(x);
    // .dk-card YOK: dk-base'in `.dk-card:hover img { scale(1.05) }` kuralı artboard'da yok (.gb-card yalnız kaldırır + kenar)
    const art = h("article", { class: cx("dk-mekan-sanatci-bul-card", !isG && "is-link") },
      media,
      h("div", { class: "dk-mekan-sanatci-bul-body" },
        h("div", { class: "dk-mekan-sanatci-bul-idcol" }, nameEl,
          cityLine ? h("span", { class: "dk-mekan-sanatci-bul-city" }, ico("pin", 12), cityLine) : null),
        h("div", { class: "dk-mekan-sanatci-bul-stats" },
          h("span", { class: "dk-mekan-sanatci-bul-rating" }, starIco(12, "#FF8A2A"), r ? r.toFixed(1) : "Yeni",
            r && Number(x.reviewCount) ? h("span", { class: "dk-mekan-sanatci-bul-rc" }, `(${x.reviewCount})`) : null),
          followers),
        h("div", { class: "dk-mekan-sanatci-bul-div" },
          h("span", { class: "dk-mekan-sanatci-bul-att" }, ico("trend", 12), att ? fmtInt(att) + " katılım" : "Henüz katılım yok"),
          h("span", { class: "dk-mekan-sanatci-bul-fee" }, feeLabel(x))),
        // gruba uzun dönem anlaşma yok (app paritesi) → tekrar düğmesi yalnız solo
        h("div", { class: "dk-mekan-sanatci-bul-acts" }, isG ? null : longBtn(x, "card"), inviteBtn(x, "card"))));
    if (!isG) art.addEventListener("click", (e) => { if (e.target.closest("button,a")) return; location.hash = perfHref(x); });
    return art;
  }
  function row(x) {
    const isG = !!x._group, name = nameOf(x), g = genreOf(x), fam = genreFamily(g), r = ratingOf(x), att = attOf(x);
    const el = h("div", { role: "row", class: cx("dk-mekan-sanatci-bul-tr dk-mekan-sanatci-bul-row dk-row", !isG && "is-link") },
      h("span", { role: "cell", class: "dk-mekan-sanatci-bul-who" }, mediaOf(x, "row"),
        h("span", { class: "dk-mekan-sanatci-bul-whocol" },
          isG ? h("span", { class: "dk-mekan-sanatci-bul-rn" }, name) : h("a", { href: perfHref(x), class: "dk-mekan-sanatci-bul-rn", title: x.bio || null }, name),
          h("span", { class: "dk-mekan-sanatci-bul-rsub", style: { color: fam.color } }, (isG ? "Grup · " : "") + (g || "Müzik")))),
      h("span", { role: "cell", class: "dk-mekan-sanatci-bul-rcity c-city" }, x.city || "—"),
      h("span", { role: "cell", class: "dk-mekan-sanatci-bul-rrate" }, starIco(12, "#FF8A2A"), r ? r.toFixed(1) : "Yeni"),
      h("span", { role: "cell", class: "dk-mekan-sanatci-bul-ratt c-att" }, att ? fmtInt(att) : "—"),
      h("span", { role: "cell", class: cx("dk-mekan-sanatci-bul-rfee", !feeRange(x) && "is-none"), title: feeRange(x) ? null : feeLabel(x) }, feeLabel(x)),
      h("span", { role: "cell", class: "dk-mekan-sanatci-bul-racts c-act" }, isG ? null : watchBtn(x, "row"), isG ? null : longBtn(x, "row"), inviteBtn(x, "row")));
    if (!isG) el.addEventListener("click", (e) => { if (e.target.closest("button,a")) return; location.hash = perfHref(x); });
    return el;
  }

  // ── çizim ──
  function paintControls() {
    typeChips.forEach((b) => setPressed(b, st.tip === b.dataset.k));
    genreChips.forEach((b) => setPressed(b, st.tur === b.dataset.k));
    cityChips.forEach((b) => setPressed(b, fold(st.sehir) === fold(b.dataset.k)));
    ratingChips.forEach((b) => setPressed(b, String(st.puan) === b.dataset.k));
    sortBtns.forEach((b) => { const on = st.sira === b.dataset.k; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    viewBtns.forEach((b) => { const on = st.gorunum === b.dataset.k; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    budgetVal.textContent = st.butce >= BUDGET_MAX ? "Sınırsız" : "₺" + NF.format(st.butce);
    if (String(budget.value) !== String(st.butce)) budget.value = String(st.butce);
    budget.setAttribute("aria-valuetext", st.butce >= BUDGET_MAX ? "Sınırsız" : "₺" + NF.format(st.butce));
    const n = (st.tip ? 1 : 0) + (st.tur !== "Tümü" ? 1 : 0) + (st.sehir ? 1 : 0) + (st.butce < BUDGET_MAX ? 1 : 0) + (st.puan ? 1 : 0) + (st.term.trim() ? 1 : 0);
    fBadge.hidden = !n; fBadge.textContent = String(n);
    filterBtn.setAttribute("aria-label", n ? `Filtreler, ${n} etkin` : "Filtreler");
  }
  function draw(animate = false) {
    if (!alive) return;
    paintControls();
    if (!loaded) return;
    const list = failed ? [] : pool();
    countEl.textContent = failed ? "" : `${list.length} sonuç`;
    const parts = [];
    if (st.tur !== "Tümü") parts.push(st.tur);
    if (st.sehir) parts.push(st.sehir);
    if (st.butce < BUDGET_MAX) parts.push("≤ ₺" + NF.format(st.butce));
    if (st.puan) parts.push(st.puan + "+ puan");
    noteEl.textContent = failed ? "" : parts.length ? "· " + parts.join(" · ") : myCity ? `· ${myName} şehri önce: ${myCity}` : "";
    let body;
    if (failed) body = errEl;
    else if (!list.length) {
      emptyTitle.textContent = st.tip === "group" ? "Grup bulunamadı" : "Sanatçı bulunamadı";
      emptySub.textContent = st.sehir ? `${st.sehir} şehrinde sonuç yok — filtreyi değiştirmeyi dene.` : "Arama ya da filtreleri değiştirmeyi dene.";
      body = emptyEl;
    } else if (st.gorunum === "liste") {
      listBody.replaceChildren(...list.map(row));
      body = listEl;
    } else {
      let soloRank = 0;
      gridEl.replaceChildren(...list.map((x) => card(x, !x._group && st.sira === "puan" && ratingOf(x) > 0 ? soloRank++ : null)));
      body = gridEl;
    }
    if (results.lastChild !== body) {
      if (results.lastChild !== toolbar) results.lastChild.remove();
      results.append(body);
      if (body === gridEl || body === listEl) { body.classList.remove("dk-fa", "dk-fb"); body.classList.add(flip ? "dk-fa" : "dk-fb"); }
    } else if (animate && (body === gridEl || body === listEl)) {
      swapAnim(body); // artboard: gb-fa ↔ gb-fb takası listeyi yeniden oynatır
    }
  }

  // ── filtre çekmecesi (≤1279: panel toolbar'daki "Filtreler" düğmesiyle soldan açılır) ──
  let drawer = null;
  function openDrawer() {
    if (drawer) return;
    const footBtn = h("button", { type: "button", class: "dk-mekan-sanatci-bul-drwgo dk-press", onclick: () => drawer?.close() }, "Sonuçları göster");
    drawer = dkDrawer({ eyebrow: "SANATÇI BUL", title: "Filtreler", width: 304, cls: "dk-mekan-sanatci-bul-drw", body: filters, footer: footBtn, closeLabel: "Filtreleri kapat",
      onClose: () => { drawer = null; filterSlot.append(filters); } });
  }
  const wideMq = window.matchMedia("(min-width: 1280px)");
  const onMq = () => { if (wideMq.matches && drawer) drawer.close(); };
  wideMq.addEventListener("change", onMq);
  unsubs.push(() => wideMq.removeEventListener("change", onMq));
  unsubs.push(() => { if (drawer) drawer.close(); });

  // ── yapışkan filtre paneli (yalnız ekrana sığıyorsa; spec öneri "sticky top 24" + 72 üst bar) ──
  const fitSticky = () => { filters.classList.toggle("is-sticky", filters.parentNode === filterSlot && filters.offsetHeight + 96 + 24 <= window.innerHeight); };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitSticky) : null;
  ro?.observe(filters);
  window.addEventListener("resize", fitSticky);
  unsubs.push(() => { ro?.disconnect(); window.removeEventListener("resize", fitSticky); });

  // ══════════════════════════════════════════════════════════════════════
  // DAVET MODALI (artboard 560 · padding-top 140; legacy inviteModal akışı + app bildirimi)
  // ══════════════════════════════════════════════════════════════════════
  function openInvite(x, startMode) {
    const isG = !!x._group, name = nameOf(x), g = genreOf(x), r = ratingOf(x);
    let mode = startMode === "longterm" ? "longterm" : "single";
    let months = 3; const days = new Set();
    let photoBlob = null, sending = false;
    const lbl = (t) => h("span", { class: "dk-mekan-sanatci-bul-mlbl" }, t);
    const input = (attrs) => h("input", { class: "dk-mekan-sanatci-bul-in", ...attrs });
    const fieldEl = (label, ctl) => h("label", { class: "dk-mekan-sanatci-bul-mfield" }, lbl(label), ctl);

    // Tek etkinlik
    const today = isoDate(Date.now());
    const evSel = h("select", { class: "dk-mekan-sanatci-bul-in is-select", "aria-label": "Etkinlik" },
      h("option", { value: "new" }, "Yeni tarih (etkinliksiz teklif)"),
      ...upcoming.map((e) => h("option", { value: e.id }, e._label)));
    const iDate = input({ type: "date", min: today });
    const iTime = input({ type: "time" });
    const iFee = input({ type: "number", min: String(MIN_STAGE_FEE), step: "500", placeholder: "En az " + MIN_STAGE_FEE, class: "dk-mekan-sanatci-bul-in is-mono", inputmode: "numeric" });
    const iMsg = h("textarea", { class: "dk-mekan-sanatci-bul-in is-ta", rows: "3", placeholder: "Merhaba, mekanımızda sahne almanızı isteriz…" });
    const applyEvent = () => {
      const ev = upcoming.find((e) => e.id === evSel.value);
      iDate.value = ev ? ev._date : ""; iTime.value = ev ? ev._time : "";
      iDate.readOnly = iTime.readOnly = !!ev; // etkinliğe bağlıyken tarih/saat etkinlikten gelir
      iDate.classList.toggle("is-locked", !!ev); iTime.classList.toggle("is-locked", !!ev);
      clearErr();
    };
    evSel.addEventListener("change", applyEvent);
    const fileInp = h("input", { type: "file", accept: "image/*", class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
    const photoIc = h("span", { class: "dk-mekan-sanatci-bul-photoic" }, ico("image", 16));
    const photoTxt = h("span", {}, "Etkinlik fotoğrafı (opsiyonel)");
    const photoBtn = h("button", { type: "button", class: "dk-mekan-sanatci-bul-photo dk-press", onclick: () => fileInp.click() }, photoIc, photoTxt);
    fileInp.addEventListener("change", async () => {
      const picked = fileInp.files?.[0] || null; fileInp.value = "";
      if (!picked) return;
      const blob = await cropWithKeys(picked);
      if (!blob || !alive) return;
      photoBlob = blob;
      const url = URL.createObjectURL(blob);
      photoIc.replaceChildren(h("img", { src: url, alt: "", class: "dk-mekan-sanatci-bul-photothumb" }));
      photoTxt.textContent = "Etkinlik fotoğrafı eklendi ✓";
    });
    const uid8 = "dk-msb-" + (++_mid);
    const singleBox = h("div", { class: "dk-mekan-sanatci-bul-mbox", role: "tabpanel", id: uid8 + "-ps", "aria-labelledby": uid8 + "-ts" },
      isG ? null : h("label", { class: "dk-mekan-sanatci-bul-mfield" }, lbl("ETKİNLİK"),
        h("span", { class: "dk-mekan-sanatci-bul-selwrap" }, evSel, h("span", { class: "dk-mekan-sanatci-bul-selchev" }, ico("chevron", 16)))),
      h("div", { class: "dk-mekan-sanatci-bul-m2" }, fieldEl("TARİH", iDate), fieldEl("SAAT", iTime)),
      fieldEl("ÜCRET (₺)", iFee),
      fieldEl("MESAJ (OPSİYONEL)", iMsg),
      photoBtn, fileInp);

    // Uzun dönem
    const mChip = (label, on, onClick) => h("button", { type: "button", class: "dk-mekan-sanatci-bul-chip dk-press", "aria-pressed": on ? "true" : "false", onclick: onClick }, label);
    const monthChips = [1, 3, 6].map((m) => { const b = mChip(m + " ay", m === months, () => { months = m; monthChips.forEach((c, i) => setPressed(c, [1, 3, 6][i] === m)); clearErr(); }); return b; });
    const dayChips = DAY_CHIPS.map(([l, d]) => { const b = mChip(l, false, () => { if (days.has(d)) days.delete(d); else days.add(d); setPressed(b, days.has(d)); clearErr(); }); return b; });
    const rTime = input({ type: "time" });
    const rFee = input({ type: "number", min: String(MIN_STAGE_FEE), step: "500", placeholder: "En az " + MIN_STAGE_FEE, class: "dk-mekan-sanatci-bul-in is-mono", inputmode: "numeric" });
    const longBox = h("div", { class: "dk-mekan-sanatci-bul-mbox", role: "tabpanel", id: uid8 + "-pl", "aria-labelledby": uid8 + "-tl" },
      h("div", { role: "group", "aria-label": "Süre", class: "dk-mekan-sanatci-bul-mfield" }, lbl("SÜRE"), h("div", { class: "dk-mekan-sanatci-bul-mchips" }, ...monthChips)),
      h("div", { role: "group", "aria-label": "Sahne günleri", class: "dk-mekan-sanatci-bul-mfield" }, lbl("SAHNE GÜNLERİ"), h("div", { class: "dk-mekan-sanatci-bul-mchips" }, ...dayChips)),
      h("div", { class: "dk-mekan-sanatci-bul-m2" }, fieldEl("SAAT", rTime), fieldEl("GECE BAŞINA ÜCRET (₺)", rFee)));

    // Mod sekmeleri
    const tabs = [["single", "Tek Etkinlik", "s"], ["longterm", "Uzun Dönem", "l"]].map(([k, l, c]) => {
      const b = h("button", { type: "button", role: "tab", id: `${uid8}-t${c}`, "aria-controls": `${uid8}-p${c}`, class: "dk-mekan-sanatci-bul-mtab dk-press", onclick: () => setMode(k) }, l);
      b.dataset.k = k; return b;
    });
    // Gruba uzun dönem anlaşma gönderilemez (app) → sekme devre dışı + açıklama (hata yolu yerine)
    const LONG_GROUP_MSG = "Uzun dönem anlaşma yalnızca bireysel sanatçıya gönderilebilir. Gruba \"Tek Etkinlik\" teklifi gönderebilirsiniz.";
    if (isG) { tabs[1].disabled = true; tabs[1].setAttribute("aria-disabled", "true"); tabs[1].title = LONG_GROUP_MSG; if (mode === "longterm") mode = "single"; }
    const tabList = h("div", { role: "tablist", "aria-label": "Davet türü", class: "dk-mekan-sanatci-bul-mtabs" }, ...tabs);
    tabList.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault(); if (isG) return; const k = mode === "single" ? "longterm" : "single"; setMode(k); tabs.find((t) => t.dataset.k === k).focus();
    });
    const errTxt = h("span", {});
    const alertEl = h("div", { role: "alert", class: "dk-mekan-sanatci-bul-alert", hidden: true }, ico("info", 15), errTxt);
    const showErr = (m) => { errTxt.textContent = m; alertEl.hidden = false; };
    function clearErr() { alertEl.hidden = true; errTxt.textContent = ""; }
    [iDate, iTime, iFee, iMsg, rTime, rFee].forEach((el) => el.addEventListener("input", clearErr));
    function setMode(k) {
      mode = k;
      tabs.forEach((t) => { const on = t.dataset.k === k; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; });
      singleBox.hidden = k !== "single"; longBox.hidden = k !== "longterm";
      clearErr();
    }

    const avatar = x.photoURL
      ? h("img", { src: x.photoURL, alt: "", class: "dk-mekan-sanatci-bul-mav" })
      : h("span", { class: "dk-mekan-sanatci-bul-mav is-ini", style: { background: gradOf(g) }, "aria-hidden": "true" }, initialOf(name));
    const sub = [(isG ? "Grup · " : "") + (g || "Müzik"), x.city || null, r ? "★ " + r.toFixed(1) : null].filter(Boolean).join(" · ");

    const m = dkModal({
      variant: "panel", size: 560, top: 140, cls: "dk-mekan-sanatci-bul-invm", initialFocus: ".dk-mekan-sanatci-bul-mtab[aria-selected=\"true\"]",
      title: "Davet Gönder — " + name, sub,
      body: [tabList, singleBox, longBox, alertEl],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Gönder", variant: "role", icon: ico("send", 16, { sw: "2" }), keepOpen: true, onClick: (close, btn) => send(close, btn) },
      ],
    });
    m.dialog.querySelector(".dk-mdl-headrow")?.prepend(avatar);
    setMode(mode);
    // artboard: ilk uygun (sanatçısız, yaklaşan) etkinlik seçili gelir, tarih/saat ondan dolar; "Yeni tarih" ile serbest teklif
    if (!isG && upcoming.length) { evSel.value = upcoming[0].id; applyEvent(); }

    async function send(close, btn) {
      if (sending) return;
      clearErr();
      if (mode === "single") {
        const f = { date: iDate.value, time: iTime.value, fee: iFee.value, message: iMsg.value.trim() };
        const ev = upcoming.find((e) => e.id === evSel.value);
        if (!f.date || !f.time) return showErr("Tarih ve saat gir");
        if (!(Number(f.fee) >= MIN_STAGE_FEE)) return showErr(`Ücret en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")}`);
        sending = true; btn.disabled = true;
        try {
          if (!isG) {
            const dup = await findExistingInvitation(uid, x.id, f.date).catch(() => null);
            if (dup) { sending = false; btn.disabled = false; return showErr("Bu sanatçıya bu tarih için zaten teklif gönderilmiş"); }
          } else {
            // app: grup + tarih için bekleyen/kabul edilmiş davet (venueId sorgusu, istemcide süz)
            const mine = await venueInvitationsRO(uid).catch(() => []);
            if (mine.some((v) => v.groupId === x.id && v.eventDate === f.date && ["pending", "accepted"].includes(v.status))) {
              sending = false; btn.disabled = false; return showErr("Bu gruba bu tarih için zaten teklif gönderilmiş");
            }
          }
          if (photoBlob) f.photoUrl = await uploadImage(new File([photoBlob], "davet.jpg", { type: photoBlob.type || "image/jpeg" }), uid);
          if (!isG && ev) f.eventId = ev.id;
          const venue = session.profile || profile();
          if (isG) await createGroupInvitation(venue, x, f);
          else await createInvitation(venue, x, f);
          // app FindArtistScreen: solo sanatçıya uygulama içi bildirim (aynı metin/alanlar) — başarısızlık daveti engellemez.
          // Grup: bildirim YAZILMAZ — web createGroupInvitation üye başına artistId'li davet dokümanı yazar, onNewInvitation CF her
          // üyeye zaten push gönderir; ek bildirim (onNotificationCreated) üye başına çift push olurdu (legacy web: üye başına 1 push).
          if (!isG) {
            const body = `${venue.displayName ?? "Bir mekan"} seni ${isoToTRDate(f.date)}${f.time ? " · " + f.time : ""} tarihli sahneye davet etti (${formatTL(Number(f.fee))}).`;
            await sendNotification(x.id, { type: "event_invite", title: "Yeni Sahne Teklifi 🎤", body, fromName: venue.displayName ?? "Mekan",
              extra: { eventId: null, relatedUserId: null } }).catch(() => {});
          }
          close("action");   // önce kapat (odak geri yükleme), sonra yeniden çiz + yeni düğmeye odak
          markSent(x, true);
          dkToast("Davet gönderildi");
        } catch (_) {
          sending = false; if (btn.isConnected) btn.disabled = false;
          showErr("Gönderilemedi");
          dkToast("Gönderilemedi", { type: "err" });
        }
      } else {
        if (isG) return showErr(LONG_GROUP_MSG);
        if (!days.size) return showErr("En az bir gün seç");
        if (!rTime.value) return showErr("Saat gir");
        if (!(Number(rFee.value) >= MIN_STAGE_FEE)) return showErr(`Ücret en az ₺${MIN_STAGE_FEE.toLocaleString("tr-TR")}`);
        sending = true; btn.disabled = true;
        try {
          const venue = session.profile || profile();
          const dayList = [...days];
          await createResidency(venue, x, { months, days: dayList, time: rTime.value, fee: rFee.value });
          await sendNotification(x.id, { type: "residency_offer", title: "Uzun Dönem Sahne Teklifi 🎶",
            body: `${venue.displayName ?? "Bir mekan"}, ${months} aylık sahne anlaşması önerdi (${formatDays(dayList)} · ${rTime.value}).`,
            fromName: venue.displayName ?? "Mekan", extra: { eventId: null, relatedUserId: null } }).catch(() => {});
          close("action");
          markSent(x, true);
          dkToast("Anlaşma teklifi gönderildi");
        } catch (_) {
          sending = false; if (btn.isConnected) btn.disabled = false;
          showErr("Gönderilemedi");
          dkToast("Gönderilemedi", { type: "err" });
        }
      }
    }
  }
  function markSent(x, refocus) {
    sent.add(sentKey(x));
    if (!alive) return;
    draw(); // "Gönderildi ✓" (kart + tablo) — liste animasyonu yeniden oynatılmaz
    // modalın tetikleyicisi yeniden çizimde değişti → odağı aynı sanatçının yeni davet düğmesine taşı (body'ye düşmesin)
    if (refocus) { const nb = results.querySelector(`.dk-mekan-sanatci-bul-inv[data-k="${CSS.escape(sentKey(x))}"]`); try { nb?.focus({ preventScroll: true }); } catch (_) {} }
  }

  // Legacy openImageCropper (#modal-root, z 3000) klavye desteği: davet modalının belge düzeyi ESC/Tab'ı kırpıcıya gitmesin.
  // SHARED-CANDIDATE: dk görünümlü, klavye erişilebilir ortak kırpıcı (profil.js de legacy kırpıcıyı kullanıyor).
  function cropWithKeys(file) {
    const mr = document.getElementById("modal-root");
    const ovl = () => mr?.querySelector(".cr-overlay:last-child");
    const onKey = (e) => {
      const o = ovl(); if (!o) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); o.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
      if (e.key === "Tab") {
        e.stopPropagation();
        const f = [...o.querySelectorAll("button,input")]; if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    const mo = mr ? new MutationObserver(() => { const o = ovl(); if (o) { mo.disconnect(); o.querySelector(".cr-actions button:last-child")?.focus(); } }) : null;
    mo?.observe(mr, { childList: true });
    window.addEventListener("keydown", onKey, true);
    return openImageCropper(file, { aspect: 16 / 9 }).catch(() => null).finally(() => { window.removeEventListener("keydown", onKey, true); mo?.disconnect(); });
  }

  // ══════════════════════════════════════════════════════════════════════
  // YÜKLEME
  // ══════════════════════════════════════════════════════════════════════
  async function load() {
    loaded = false; failed = false;
    if (results.lastChild !== skelEl) { if (results.lastChild !== toolbar) results.lastChild.remove(); results.append(skelEl); }
    countEl.textContent = ""; noteEl.textContent = "";
    const [as, gs, ws, evs, invs] = await Promise.all([
      listArtists().then((v) => ({ ok: true, v })).catch(() => ({ ok: false, v: [] })),
      listGroups().catch(() => []),
      watchedArtists(uid).catch(() => []),
      venueEventsRO(uid).catch(() => []),
      venueInvitationsRO(uid).catch(() => []),
    ]);
    if (!alive) return;
    // çevrimdışı: listArtists boş önbellek sonucu döner → "0 sonuç" yerine hata durumu (Tekrar dene)
    const offline = (evs.fromCache || navigator.onLine === false) && !as.v.length;
    failed = !as.ok || offline;
    artists = as.v;
    groups = gs.map((g) => ({ ...g, _group: true }));
    watched = new Set(ws.map((w) => w.artistId || w.id));
    invs.filter((v) => v.status === "pending").forEach((v) => { if (v.groupId) sent.add("g:" + v.groupId); else if (v.artistId) sent.add("a:" + v.artistId); });
    const now = Date.now();
    upcoming = evs.filter((e) => e.status !== "cancelled" && !e.artistId && !e.organizerId)
      .map((e) => ({ ...e, _ms: eventStartMs(e) }))
      .filter((e) => e._ms != null && e._ms > now)
      .sort((a, b) => a._ms - b._ms)
      .map((e) => {
        const d = new Date(e._ms);
        const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        return { ...e, _date: e.dateKey || isoDate(e._ms), _time: e.startTime || hm,
          _label: `${e.title || "Etkinlik"} · ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${DAYS_TR_SHORT[d.getDay()]} ${e.startTime || hm}` };
      });
    loaded = true;
    buildCities();
    draw();
    fitSticky();
  }

  paintControls();
  if (uid) load(); else { loaded = true; failed = true; draw(); }

  return {
    node: shell.node,
    update(q) {
      const next = readState(q);
      const changed = JSON.stringify(next) !== JSON.stringify(st);
      if (!changed) return;
      st = next;
      fSearch.value = st.term;
      if (shell.search?.input) shell.search.input.value = st.term;
      budget.value = String(st.butce);
      if (loaded) buildCities();
      flip = !flip; draw(true);
    },
    // Aynı hesap + kabukta/görünümde gösterilen alanlar (ad, foto, şehir) aynıysa yeniden kurma (açık modal/filtreler korunur)
    onSession(s) { return s?.user?.uid === uid && sigOf(s?.profile) === sig0; },
    destroy() {
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}
