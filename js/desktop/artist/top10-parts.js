// Top 10 ORTAK PARÇALARI — WebSanatciTop10 (#/artist/top10) ve dinleyici Top 10 (#/top10, WebSanatciTop10'dan türetilir).
// Sahibi: artist-b (WebSanatciTop10 uygulayıcısı; specs/foundation.md §3 "top10-parts.js'i sahiplenir").
// Ölçüler/renkler/animasyonlar: design/WebSanatciTop10.dc.html (markup + helmet + DCLogic) — spec sanatci.md §WebSanatciTop10.
// Favori/zil düğmeleri: design/DinleyiciTop10.dc.html (sahibi notu "TOP 10 + FAVORİ + ETKİNLİK BİLDİRİMİ").
//
// CSS: parçaların stilleri css/dk-sanatci-top10.css'te, iki kök altında kapsamlı: :is(.dk-sanatci-top10, .dk-top10) .dk-t10-*.
// #/top10 rotası registry'de yalnız css/dk-top10.css'i yükler → bu modül, içe aktarılırken (top-level await) parça CSS'ini de
// yükler; router görünümü modül çözüldükten SONRA kurduğu için FOUC olmaz (ensureCss hata verse de çözülür → yarı stil > boş ekran).
//
// Veri yardımcıları:
//   loadArtistReviews()      — reviews where targetType=="artist" (fetchArtistRatings ile AYNI sorgu; yeni indeks YOK) + createdAt.
//                              Dönem sekmeleri tek okumadan hesaplanır; 60 sn önbellek.
//   aggregateReviews(r, {since, until}) — since/until yoksa data.js fetchArtistRatings() ile BİREBİR (rating>0, targetId, avg 1 ondalık).
//   rankLegacy(...)          — artist.js renderTop10 BİREBİR: bayesianScore(avg, count, ratingsGlobalMean) + rankSort; yorumsuzlar
//                              listede kalır ama sonda; gruplarda ilk 6 üyenin puanı yorum sayısıyla ağırlıklı.
//   rankCF(...)              — functions/rankings.js + app ListenerTop10Screen computeLocalRankings BİREBİR (öncül 4.5, C 8;
//                              yalnız dönemde yorumu olanlar; grup = gruba doğrudan yorumlar + üyeler) — dinleyici sayfasının yedeği.
import { h } from "../../ui.js";
import { db, collection, getDocs, query, where } from "../../firebase.js";
import { bayesianScore, ratingsGlobalMean } from "../../data.js";
import { ensureCss } from "../css.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkSkeleton } from "../shared/ui.js";
import { toMs, fold, trUpper, sortTR, clamp } from "../shared/helpers.js";

export const PARTS_CSS = "css/dk-sanatci-top10.css";
await ensureCss(PARTS_CSS);

// ══════════════════════════════════════════════════════════════════════
// Sabitler
// ══════════════════════════════════════════════════════════════════════
export const DAY_MS = 86400e3;
// key: iç anahtar · slug: URL (?donem=) · cf: rankings/artists_{cf}
export const PERIODS = [
  { key: "w", slug: "hafta", cf: "week", label: "BU HAFTA", span: 7 * DAY_MS },
  { key: "m", slug: "ay", cf: "month", label: "BU AY", span: 30 * DAY_MS },
  { key: "a", slug: "tum", cf: "all", label: "TÜM ZAMANLAR", span: null },
];
export const periodBySlug = (s) => PERIODS.find((p) => p.slug === s || p.key === s) || PERIODS[2];
export const KINDS = [
  { key: "artists", slug: "sanatcilar", label: "Sanatçılar", icon: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" },
  { key: "groups", slug: "gruplar", label: "Gruplar", icon: "M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M17 12.3a2.3 2.3 0 1 0 0-4.6M15.5 14.6A4.5 4.5 0 0 1 21 19" },
];
export const kindBySlug = (s) => (s === "gruplar" || s === "groups" ? "groups" : "artists");
export const QUICK_CITIES = ["İstanbul", "İzmir", "Ankara"];   // artboard: Tümü + 3 il; tam liste "Diğer ▾" (81 il seçici)
export const MEDALS = ["#FFD700", "#C0C0C0", "#CD7F32"];          // legacy MEDAL_COLORS ile aynı

// Artboard SVG gövdeleri (birebir)
export const P = {
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"></path>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"></path>',
  same: '<path d="M6 12h12"></path>',
  chevR: '<path d="m9 6 6 6-6 6"></path>',
  chevD: '<path d="m6 9 6 6 6-6"></path>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5"></path>',
  info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8h.01"></path>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.4-7.5 10.4z"></path>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"></path>',
  bellOff: '<path d="M6 16v-5a6 6 0 0 1 9.4-4.9M18 11v5l1.5 2H8M10 20.5a2 2 0 0 0 4 0M4 4l16 16"></path>',
};

// ══════════════════════════════════════════════════════════════════════
// Küçük yardımcılar
// ══════════════════════════════════════════════════════════════════════
export const initialOf = (name) => (String(name || "").replace(/^DJ\s+/i, "").trim().charAt(0) || "?").toLocaleUpperCase("tr-TR");
export function firstGenre(x) {
  if (Array.isArray(x?.genres) && x.genres.length) return String(x.genres[0] ?? "");
  if (Array.isArray(x?.genre) && x.genre.length) return String(x.genre[0] ?? "");
  return typeof x?.genre === "string" ? x.genre : "";
}
// "Tüm Türkiye" | "İstanbul" | "İstanbul / Beşiktaş" (legacy boş durum metniyle aynı biçim)
export const placeOf = (city, district) => (city ? (district ? `${city} / ${district}` : city) : "Tüm Türkiye");
export const fmt1 = (n) => (Number(n) > 0 ? (Math.round(Number(n) * 10) / 10).toFixed(1) : "—");
// Skor çubuğu: clamp(8, (skor − 4) × 100, 100) % (artboard DCLogic)
export const barPct = (score) => Math.round(clamp((Number(score) - 4) * 100, 8, 100));
// Kaydın şehri/ilçesi süzgeçte (ilçe YALNIZ kaydın ilçesi varsa uygulanır — legacy + app kuralı)
export function inPlace(it, city, district, { useDistrict = true } = {}) {
  if (!city) return true;
  if (fold(it.city) !== fold(city)) return false;
  if (useDistrict && district && it.district && fold(it.district) !== fold(district)) return false;
  return true;
}
// Seçili şehrin ilçeleri (kayıtlardan türetilir; tr sıralı)
export function districtsIn(list, city) {
  if (!city) return [];
  const seen = new Map();
  list.forEach((it) => { const d = String(it.district || "").trim(); if (d && fold(it.city) === fold(city) && !seen.has(fold(d))) seen.set(fold(d), d); });
  return [...seen.values()].sort(sortTR);
}

// ══════════════════════════════════════════════════════════════════════
// Veri
// ══════════════════════════════════════════════════════════════════════
let _rev = null;   // { at, p }
// reviews (targetType=="artist") → [{ target, rating, ms }]. fetchArtistRatings ile aynı sorgu; kural reddederse REJECT (çağıran karar verir).
export function loadArtistReviews({ force = false, maxAge = 60000 } = {}) {
  if (!force && _rev && Date.now() - _rev.at < maxAge) return _rev.p;
  const p = getDocs(query(collection(db, "reviews"), where("targetType", "==", "artist"))).then((snap) => {
    const out = [];
    snap.docs.forEach((d) => {
      const x = d.data();
      out.push({ target: x.targetId ? String(x.targetId) : "", rating: x.rating ?? 0, ms: toMs(x.createdAt) });
    });
    return out;
  });
  _rev = { at: Date.now(), p };
  p.catch(() => { if (_rev?.p === p) _rev = null; });
  return p;
}
// Map id → { avg (1 ondalık), count, sum }. Pencere: since ≤ ms < until. since/until null → fetchArtistRatings ile birebir.
// Dönem penceresinde createdAt'i olmayan yorum SAYILMAZ (CF ile aynı); "tüm zamanlar"da sayılır.
export function aggregateReviews(reviews, { since = null, until = null } = {}) {
  const sums = new Map();
  (reviews || []).forEach((r) => {
    const rating = r.rating ?? 0;
    if (!r.target || !(rating > 0)) return;
    if (since != null && (r.ms == null || r.ms < since)) return;
    if (until != null && r.ms != null && r.ms >= until) return;
    const cur = sums.get(r.target) ?? { sum: 0, count: 0 };
    cur.sum += rating; cur.count += 1;
    sums.set(r.target, cur);
  });
  const out = new Map();
  sums.forEach((v, k) => out.set(k, { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count, sum: v.sum }));
  return out;
}
// Dönem penceresi: now − span … now (tüm zamanlar: sınırsız). baseline=true → 24 sa önceki sıralamanın penceresi.
export function windowOf(per, now = Date.now(), { baseline = false } = {}) {
  const p = PERIODS.find((x) => x.key === per) || PERIODS[2];
  const end = baseline ? now - DAY_MS : null;
  const ref = end ?? now;
  return { since: p.span == null ? null : ref - p.span, until: end };
}

// legacy rankSort (artist.js:606)
const rankSort = (a, b) => { const sa = a.score ?? a.rating, sb = b.score ?? b.rating; return sb !== sa ? sb - sa : b.reviewCount - a.reviewCount; };

// artist.js renderTop10 BİREBİR (tam sıralı liste döner; çağıran slice(0, 10) yapar ve "Senin sıran" için tamamını kullanır).
//   artists: listRealArtists() · groups: listGroups() · ratings: aggregateReviews(...) · city/district: legacy süzgeci
export function rankLegacy({ kind, artists = [], groups = [], ratings, city = "", district = "" }) {
  const gm = ratingsGlobalMean(ratings);   // Bayesian öncül (küresel ortalama)
  if (kind === "artists") {
    return artists
      // İlçe filtresi YALNIZ sanatçının ilçesi VARSA uygulanır (legacy)
      .filter((a) => (!city || a.city === city) && (!city || !district || !a.district || a.district === district))
      .map((a) => {
        const agg = ratings.get(a.id);
        const avg = agg?.avg ?? 0, count = agg?.count ?? 0;
        const genre = Array.isArray(a.genres) ? (a.genres[0] ?? "") : (a.genre ?? "");
        return {
          id: a.id, name: a.displayName ?? "Sanatçı", photoURL: a.photoURL || null, genre, city: a.city || "", district: a.district || "",
          sub: [genre || "Müzik", a.district || a.city].filter(Boolean).join(" · "),
          rating: avg, reviewCount: count, score: count > 0 ? bayesianScore(avg, count, gm) : 0, isGroup: false,
        };
      })
      .sort(rankSort);
  }
  return groups
    .filter((g) => !city || g.city === city)   // legacy listGroups(city) = where("city", "==", city)
    .map((g) => {
      const memberIds = (g.memberIds ?? []).slice(0, 6);
      const aggs = memberIds.map((id) => ratings.get(id)).filter(Boolean);
      const totalCount = aggs.reduce((s, a) => s + a.count, 0);
      const wAvg = totalCount ? aggs.reduce((s, a) => s + a.avg * a.count, 0) / totalCount : 0;
      return {
        id: g.id, name: g.name ?? "Grup", photoURL: g.photoURL || null, genre: g.genre || "", city: g.city || "", district: g.district || "",
        sub: `${(g.memberIds ?? []).length} üye${g.genre ? ` · ${g.genre}` : ""}`,
        rating: Math.round(wAvg * 10) / 10, reviewCount: totalCount,
        score: totalCount > 0 ? bayesianScore(wAvg, totalCount, gm) : 0, isGroup: true,
      };
    })
    .sort(rankSort);
}

// functions/rankings.js buildItems + app computeLocalRankings BİREBİR. Dönüş: { artists: [...], groups: [...] } (rank = tür içi sıra)
const CF_PRIOR = 4.5, CF_C = 8;
const cfScore = (avg, count) => (avg * count + CF_PRIOR * CF_C) / (count + CF_C);
const cfCompare = (a, b) => (b.score - a.score) || (b.count - a.count) || String(a.name).localeCompare(String(b.name), "tr");
export function rankCF({ artists = [], groups = [], agg }) {
  const round1 = (n) => Math.round(n * 10) / 10;
  const ai = [];
  artists.forEach((a) => {
    const g = agg.get(a.id);
    if (!g || !g.count) return;
    const avg = g.sum / g.count;
    ai.push({ id: a.id, name: String(a.displayName ?? a.name ?? "Sanatçı"), photoURL: a.photoURL || null, genre: firstGenre(a), isGroup: false,
      city: String(a.city ?? a.location?.city ?? ""), district: String(a.district ?? a.location?.district ?? ""),
      avg: round1(avg), count: g.count, score: cfScore(avg, g.count), prevRank: null });
  });
  const gi = [];
  groups.forEach((gr) => {
    const memberIds = Array.isArray(gr.memberIds) ? [...new Set(gr.memberIds.filter(Boolean).map(String))] : [];
    const name = String(gr.name ?? "").trim();
    if (!name || !memberIds.length) return;
    let sum = 0, count = 0;
    [gr.id, ...memberIds].forEach((id) => { const g = agg.get(id); if (g) { sum += g.sum; count += g.count; } });
    if (!count) return;
    const avg = sum / count;
    gi.push({ id: gr.id, name, photoURL: gr.photoURL || null, genre: typeof gr.genre === "string" ? gr.genre : "", isGroup: true,
      city: String(gr.city ?? ""), district: String(gr.district ?? ""), memberCount: memberIds.length,
      avg: round1(avg), count, score: cfScore(avg, count), prevRank: null });
  });
  const withRank = (l) => l.sort(cfCompare).slice(0, 100).map((it, i) => ({ ...it, rank: i + 1 }));
  return { artists: withRank(ai), groups: withRank(gi) };
}

// ══════════════════════════════════════════════════════════════════════
// UI parçaları (sınıflar .dk-t10-*; stiller css/dk-sanatci-top10.css)
// ══════════════════════════════════════════════════════════════════════
const star = (size) => svgRaw(P.star, { size, fill: true, color: "#FFD700" });

// Liste türü sekmeleri (Sanatçılar / Gruplar) — pembe aktif varyant, ←/→ klavye
//   controls: yönettiği sonuç panelinin id'si (aria-controls; panel role="tabpanel")
export function kindTabs({ value = "artists", onChange, controls = null } = {}) {
  const node = h("div", { role: "tablist", "aria-label": "Liste türü", class: "dk-t10-kind" });
  const btns = KINDS.map((k) => h("button", { type: "button", role: "tab", class: "dk-t10-kindb dk-press", dataset: { key: k.key }, "aria-controls": controls },
    svgRaw(`<path d="${k.icon}"></path>`, { size: 16, sw: "1.9" }), k.label));
  const set = (v) => { value = v; btns.forEach((b) => { const on = b.dataset.key === v; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; }); };
  btns.forEach((b) => b.addEventListener("click", () => { if (b.dataset.key !== value) { set(b.dataset.key); onChange?.(b.dataset.key); } }));
  node.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = btns.findIndex((b) => b.dataset.key === value);
    const n = btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
    n.focus(); n.click();
  });
  node.append(...btns);
  set(value);
  node.dk = { set };
  return node;
}

// Filtre kartı: DÖNEM sekmeleri · ŞEHİR çipleri (Tümü + 3 il + "Diğer ▾") · sayaç · İLÇE satırı.
//   opts: { per, city, district, kind, onPer(k), onCity(c|""), onOther(anchorBtn), onDistrict(d|""), controls (sonuç paneli id'si) }
//   dönüş.update({ per, city, district, kind, districts: [...], count: "10 SANATÇI" })
export function filterCard(opts = {}) {
  let st = { per: opts.per || "a", city: opts.city || "", district: opts.district || "", kind: opts.kind || "artists", districts: [], count: "" };
  // dönem
  const perBtns = PERIODS.map((p) => h("button", { type: "button", role: "tab", class: "dk-t10-per dk-press", dataset: { key: p.key }, "aria-controls": opts.controls || null }, p.label));
  const perList = h("div", { role: "tablist", "aria-label": "Dönem", class: "dk-t10-pers" }, ...perBtns);
  perBtns.forEach((b) => b.addEventListener("click", () => { if (b.dataset.key !== st.per) opts.onPer?.(b.dataset.key); }));
  perList.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = perBtns.findIndex((b) => b.dataset.key === st.per);
    const n = perBtns[(i + (e.key === "ArrowRight" ? 1 : -1) + perBtns.length) % perBtns.length];
    n.focus(); n.click();
  });
  // şehir
  const chip = (label, key) => h("button", { type: "button", class: "dk-t10-chip dk-press", dataset: { key } }, label);
  const cityBtns = [chip("Tümü", ""), ...QUICK_CITIES.map((c) => chip(c, c))];
  const otherLbl = h("span", {}, "Diğer");
  const otherBtn = h("button", { type: "button", class: "dk-t10-chip dk-t10-chip-other dk-press", "aria-haspopup": "dialog", "aria-expanded": "false" },
    otherLbl, svgRaw(P.chevD, { size: 13, sw: "2", cls: "dk-t10-chev" }));
  cityBtns.forEach((b) => b.addEventListener("click", () => opts.onCity?.(b.dataset.key)));
  otherBtn.addEventListener("click", () => opts.onOther?.(otherBtn));
  const cityGroup = h("div", { role: "group", "aria-label": "Şehir", class: "dk-t10-chips" }, ...cityBtns, otherBtn);
  // Sayaç iki yerde: ≥1440 ilk satırın sağında (artboard) · ≤1439 İLÇE satırının sağında (dar kartta ilk satırdan tek başına
  // alt satıra düşmesin). Görünmeyen (display:none) erişilebilirlik ağacında yok → tek duyuru.
  const countEl = h("span", { class: "dk-t10-count", "aria-live": "polite" });
  const countEl2 = h("span", { class: "dk-t10-count dk-t10-count-d", "aria-live": "polite" });
  // ilçe
  const distHint = h("span", { class: "dk-t10-dhint" }, "Tüm İlçeler — ilçe seçmek için önce şehir seç");
  const distGroup = h("div", { role: "group", "aria-label": "İlçe", class: "dk-t10-chips dk-t10-dchips" });
  const distRow = h("div", { class: "dk-t10-drow" }, h("span", { class: "dk-label" }, "İLÇE"), distHint, distGroup, countEl2);
  let distKey = "";
  const drawDistricts = () => {
    const enabled = !!st.city && st.kind === "artists";
    distRow.classList.toggle("is-off", !enabled);
    distHint.hidden = enabled;
    distGroup.hidden = !enabled;
    if (!enabled) { distGroup.replaceChildren(); distKey = ""; return; }
    let list = st.districts.slice();
    if (st.district && !list.some((d) => fold(d) === fold(st.district))) list.push(st.district);
    // Çok ilçe varsa ilk 10 + serbest metin (spec: >12 → 10 çip + "Diğer…")
    const many = list.length > 12;
    const shown = many ? list.slice(0, 10) : list;
    if (many && st.district && !shown.some((d) => fold(d) === fold(st.district))) shown.push(st.district);
    const key = st.city + "|" + shown.join("|") + "|" + many;
    if (key !== distKey) {
      distKey = key;
      const kids = [chip("Tüm İlçeler", ""), ...shown.map((d) => chip(d, d))];
      kids.forEach((b) => b.addEventListener("click", () => opts.onDistrict?.(b.dataset.key)));
      if (many) {
        const inp = h("input", { type: "text", class: "dk-t10-dinput", placeholder: "Diğer ilçe…", "aria-label": "İlçe yaz", autocomplete: "off" });
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); opts.onDistrict?.(inp.value.trim()); } });
        inp.addEventListener("change", () => opts.onDistrict?.(inp.value.trim()));
        kids.push(inp);
      }
      distGroup.replaceChildren(...kids);
    }
    distGroup.querySelectorAll(".dk-t10-chip").forEach((b) => {
      const on = fold(b.dataset.key) === fold(st.district);
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  };
  const node = h("section", { "aria-label": "Filtreler", class: "dk-t10-filters" },
    h("div", { class: "dk-t10-frow" },
      h("div", { class: "dk-t10-fgrp" }, h("span", { class: "dk-label" }, "DÖNEM"), perList),
      h("span", { class: "dk-t10-div", "aria-hidden": "true" }),
      h("div", { class: "dk-t10-fgrp" }, h("span", { class: "dk-label" }, "ŞEHİR"), cityGroup),
      countEl),
    distRow);
  const update = (patch = {}) => {
    st = { ...st, ...patch };
    perBtns.forEach((b) => { const on = b.dataset.key === st.per; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    const quick = !st.city || QUICK_CITIES.some((c) => c === st.city);
    cityBtns.forEach((b) => { const on = b.dataset.key === (st.city || ""); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    const otherOn = !quick;
    otherBtn.classList.toggle("is-on", otherOn);
    otherBtn.setAttribute("aria-pressed", otherOn ? "true" : "false");
    otherLbl.textContent = otherOn ? st.city : "Diğer";
    otherBtn.setAttribute("aria-label", otherOn ? `Şehir: ${st.city} — başka il seç` : "Diğer iller");
    countEl.textContent = countEl2.textContent = st.count || "";
    drawDistricts();
  };
  update();
  return { node, update, otherBtn };
}

// Hareket göstergesi (DEĞ.): delta > 0 yükseldi · < 0 düştü · 0 değişmedi · null → veri yok (nötr çizgi)
export function moveCell(delta, { cls = "dk-t10-mv" } = {}) {
  const d = delta == null ? null : Number(delta) || 0;
  const kind = d == null || d === 0 ? "same" : d > 0 ? "up" : "down";
  const aria = d == null ? "Değişim verisi yok" : d > 0 ? `${d} sıra yükseldi` : d < 0 ? `${Math.abs(d)} sıra düştü` : "Değişmedi";
  return h("span", { class: cx(cls, `is-${kind}`), role: "img", "aria-label": aria },
    svgRaw(P[kind], { size: 13, sw: "2.4" }), kind === "same" ? null : String(Math.abs(d)));
}

// SEN rozeti (podyum 20 · satır 18)
const selfBadge = (small) => h("span", { class: cx("dk-t10-sen", small && "is-sm"), "aria-label": "Sen" }, "SEN");

// Avatar: foto ya da baş harf (gradyan)
function avatarEl(it, cls) {
  const ph = () => h("span", { class: cx(cls, "is-ph"), "aria-hidden": "true" }, initialOf(it.name));
  if (!it.photoURL) return ph();
  const img = h("img", { src: it.photoURL, alt: "", decoding: "async", class: cls });
  img.addEventListener("error", () => img.replaceWith(ph()), { once: true });
  return img;
}

// KÜRSÜ (ilk üç; sıra 2 · 1 · 3). items[0..2] = { id, name, photoURL, sub, avg, count, isMe, href }
//   o: { anim: "dk-fa"|"dk-fb", actions(it) → Node|null (dinleyici: kalp/zil) }
export function podium(items, o = {}) {
  // halka 112/92/84 · kürsü 150/112/84 (sıra 1/2/3) — ölçüler CSS'te .is-r{n} ile (dar kapta küçülür)
  const node = h("section", { "aria-label": "İlk üç", class: cx("dk-t10-pod", o.anim) });
  [1, 0, 2].forEach((i, j) => {
    const it = items[i];
    if (!it) return;
    const medal = MEDALS[i];
    const ring = h("span", { class: "dk-t10-ring", style: { borderColor: medal } },
      avatarEl(it, "dk-t10-ringimg"),
      h("span", { class: "dk-t10-coin", style: { background: medal }, "aria-hidden": "true" }, String(i + 1)));
    const ident = [
      ring,
      h("span", { class: "dk-t10-pname" }, h("span", { class: "dk-t10-ptext" }, it.name), it.isMe ? selfBadge(false) : null),
      h("span", { class: "dk-t10-psub" }, it.sub || ""),
      h("span", { class: "dk-t10-prate" }, star(14), fmt1(it.avg), h("span", { class: "dk-t10-pcnt" }, `· ${it.count} yorum`)),
    ];
    const ped = h("span", { class: cx("dk-t10-ped", "dk-grow", i === 0 && "is-first"), style: { "--dk-delay": (100 + j * 90) + "ms" }, "aria-hidden": "true" },
      h("span", { class: "dk-t10-pnum", style: { color: medal } }, String(i + 1)));
    // Erişilebilir ad: içeriğin yerine geçtiği için sıra + ad + alt satır + puan + yorum sayısının TAMAMI
    const aria = [`${i + 1}. sıra: ${it.name}${it.isMe ? " (sen)" : ""}`, it.sub || null,
      Number(it.avg) > 0 ? `${fmt1(it.avg)} puan` : "puan yok", `${it.count} yorum`].filter(Boolean).join(", ");
    const acts = o.actions ? o.actions(it) : null;
    let col;
    if (acts) {
      const link = it.href ? h("a", { href: it.href, class: "dk-t10-plink", "aria-label": aria }, ...ident) : h("div", { class: "dk-t10-plink", role: "group", "aria-label": aria }, ...ident);
      col = h("div", { class: cx("dk-t10-pcol", `is-r${i + 1}`) }, link, h("div", { class: "dk-t10-pacts" }, acts), ped);
    } else {
      col = it.href
        ? h("a", { href: it.href, class: cx("dk-t10-pcol", "dk-t10-plink", `is-r${i + 1}`), "aria-label": aria }, ...ident, ped)
        : h("div", { class: cx("dk-t10-pcol", `is-r${i + 1}`), role: "group", "aria-label": aria }, ...ident, ped);
    }
    node.append(col);
  });
  return node;
}

// SIRALAMA TABLOSU. rows = [{ id, name, photoURL, sub, avg, count, score, isMe, href, rank, delta }]
//   o: { colName: "SANATÇI"|"GRUP", anim, actions(it) → Node|null, still }
//   still: true → giriş (dk-fa/fb) ve skor çubuğu (dk-bar) animasyonu YOK (üst bar aramasında her tuşta yeniden çizim titremesin)
export function rankTable(rows, o = {}) {
  const acts = !!o.actions;
  const anim = o.still ? null : o.anim;
  const head = h("div", { class: "dk-t10-thead", "aria-hidden": "true" },
    h("span", {}, "SIRA"), h("span", { class: "dk-t10-c-mv" }, "DEĞ."), h("span", {}, o.colName || "SANATÇI"),
    h("span", { class: "dk-t10-c-bar" }, "SKOR"), h("span", {}, "PUAN"), h("span", { class: "dk-t10-c-cnt" }, "YORUM"), h("span", {}));
  const node = h("section", { "aria-label": "Sıralama listesi", class: cx("dk-t10-table", acts && "has-acts") }, head);
  rows.forEach((it, j) => {
    const delay = (80 + j * 45) + "ms";
    const name = h("span", { class: "dk-t10-nm" }, h("span", { class: "dk-t10-nmt" }, it.name), it.isMe ? selfBadge(true) : null);
    const idCol = h("span", { class: "dk-t10-idcol" }, name, h("span", { class: "dk-t10-sub" }, it.sub || ""));
    const cells = [
      h("span", { class: "dk-t10-rk" }, String(it.rank), moveCell(it.delta, { cls: "dk-t10-mv dk-t10-mv-in" })),
      h("span", { class: "dk-t10-c-mv" }, moveCell(it.delta)),
      null,
      // score/count null = puanlar okunamadı → boş çubuk + "—"
      h("span", { class: "dk-t10-track dk-t10-c-bar", "aria-hidden": "true" },
        it.score == null ? null : h("span", { class: cx("dk-t10-fill", !o.still && "dk-bar", it.isMe && "is-me"), style: { width: barPct(it.score) + "%", "--dk-delay": delay } })),
      h("span", { class: "dk-t10-pt" }, star(13), h("span", {}, fmt1(it.avg)), h("span", { class: "dk-sr" }, " puan")),
      h("span", { class: "dk-t10-cnt dk-t10-c-cnt" }, it.count == null ? "—" : `${it.count} yorum`),
    ];
    let row;
    if (acts) {
      // Satır bir <div>; kimlik bağlantısı satırın tamamını kaplar (::after), düğmeler üstte (z-index) — iç içe etkileşimli öğe yok
      const link = it.href ? h("a", { href: it.href, class: "dk-t10-idlink" }, idCol) : idCol;
      cells[2] = h("span", { class: "dk-t10-id" }, avatarEl(it, "dk-t10-av"), link);
      row = h("div", { class: cx("dk-t10-row", it.href && "dk-row", anim, it.isMe && "is-me", it.href && "has-link"), style: { "--dk-delay": delay } },
        ...cells, h("span", { class: "dk-t10-acts" }, o.actions(it)));
    } else {
      cells[2] = h("span", { class: "dk-t10-id" }, avatarEl(it, "dk-t10-av"), idCol);
      const chev = it.href ? svgRaw(P.chevR, { size: 14, sw: "2", color: "#8A8E97", cls: "dk-t10-chevr" }) : h("span", {});
      row = it.href
        ? h("a", { href: it.href, class: cx("dk-t10-row", "dk-row", anim, it.isMe && "is-me"), style: { "--dk-delay": delay } }, ...cells, chev)
        : h("div", { class: cx("dk-t10-row", anim, it.isMe && "is-me"), style: { "--dk-delay": delay } }, ...cells, chev);
    }
    node.append(row);
  });
  return node;
}

// Boş durum (Keşfet stili: 320, kesikli) — kupa 40
export function emptyBox({ title = "Sıralama yok", sub, action, anim } = {}) {
  return h("div", { class: cx("dk-t10-empty", anim) },
    svgRaw(P.trophy, { size: 40, sw: "1.5" }),
    h("span", { class: "dk-t10-empty-t" }, title),
    sub ? h("span", { class: "dk-t10-empty-s" }, sub) : null,
    action || null);
}

// Satır içi uyarı (tasarımda yok): puanlar okunamadığında sıralamanın geçici olduğunu söyler (+ isteğe bağlı eylem)
export function noticeBar({ text, action } = {}) {
  return h("div", { class: "dk-t10-note", role: "status" },
    svgRaw(P.info, { size: 17, sw: "1.9", color: "#FF8A2A", cls: "dk-t10-note-ic" }),
    h("span", { class: "dk-t10-note-t" }, text), action || null);
}

// Yükleniyor iskeletleri (tasarımda yok): kürsü + 7 satır
export function skeletonPodium() {
  const SIZE = [92, 112, 84], PED = [112, 150, 84];
  return h("section", { class: "dk-t10-pod is-skel", "aria-hidden": "true" },
    ...[0, 1, 2].map((j) => h("div", { class: "dk-t10-pcol" },
      dkSkeleton({ w: SIZE[j], h: SIZE[j], r: SIZE[j] / 2 }), dkSkeleton({ w: "60%", h: 16 }), dkSkeleton({ w: "45%", h: 12 }),
      dkSkeleton({ w: "100%", h: PED[j], r: 8, style: { marginTop: "6px", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } }))));
}
export function skeletonTable(n = 7) {
  return h("section", { class: "dk-t10-table is-skel", "aria-hidden": "true" },
    h("div", { class: "dk-t10-thead" }),
    ...Array.from({ length: n }, () => h("div", { class: "dk-t10-row dk-t10-skrow" },
      dkSkeleton({ w: 18, h: 16 }), dkSkeleton({ w: 40, h: 40, r: 20 }),
      h("span", { class: "dk-t10-skcol" }, dkSkeleton({ w: "50%", h: 14 }), dkSkeleton({ w: "35%", h: 11 })),
      dkSkeleton({ w: 120, h: 6, r: 3 }))));
}

// Bilgi kartı (ikon + başlık + metin) ve DEĞİŞİM göstergesi kartı
export function infoCard({ title, body, icon = P.info, color = "#4ED8FF" } = {}) {
  return h("section", { class: "dk-t10-info" },
    svgRaw(icon, { size: 20, sw: "1.9", color, cls: "dk-t10-info-ic" }),
    h("span", { class: "dk-t10-info-col" }, h("span", { class: "dk-t10-info-t" }, title), h("span", { class: "dk-t10-info-b" }, body)));
}
export function legendCard() {
  return h("section", { class: "dk-t10-legend" },
    h("span", { class: "dk-t10-legend-l" }, "DEĞİŞİM"),
    h("span", { class: "dk-t10-legend-r" }, svgRaw(P.up, { size: 14, sw: "2.4", color: "#7CE0B0" }), "Önceki döneme göre yükseldi"),
    h("span", { class: "dk-t10-legend-r" }, svgRaw(P.down, { size: 14, sw: "2.4", color: "#FF5A6E" }), "Önceki döneme göre düştü"));
}

// Eyebrow metni: "SIRALAMA · TÜM TÜRKİYE" / "SIRALAMA · İSTANBUL / BEŞİKTAŞ"
export const eyebrowText = (city, district) => "SIRALAMA · " + trUpper(placeOf(city, district));
