// WebKatildiklarim — masaüstü görünümü (≥769 px). Registry anahtarı: katildiklarim (#/katildiklarim).
// Spec: specs/hesap.md WebKatildiklarim + sahibinin CLAUDE CODE notu (design/WebKatildiklarim.dc.html).
// CSS: css/dk-katildiklarim.css — tüm seçiciler .dk-katildiklarim kökü (ve portal içindeki .dk-katildiklarim-* modal sınıfı) altında.
// ≤768: legacy customer.js attendedView() aynen kalır (router bu modülü yüklemez).
//
// Legacy özellikleri (korundu): katıldığın etkinlikler listesi (kart → #/etkinlik/{id}), "{N} etkinliğe katıldınız" alt başlığı,
//   boş durum metni (sahibinin notuyla aynı), hata durumu. İlgili legacy reviewModal() yazımı (submitArtistReview /
//   submitVenueReview — reviews/{uid}_{artistId}, venueReviews/{uid}_{venueId}) Puanla modalında AYNI fonksiyonlarla yapılır.
// Tasarım farkı (sahibi notu): yalnız tarihi GEÇMİŞ etkinlikler listelenir (yaklaşanlar Biletlerim'de). "Geçmiş" = başlangıç + 6 sa ≤ şimdi
//   (Biletlerim/accountCounts "bilet" kuralının tümleyeni → iki sayfa arasında boşluk/çakışma yok). Yorum isteğe bağlı (sahibi notu:
//   "1-5 yıldız zorunlu, yorum en fazla 500 karakter"; legacy'deki ≥10 karakter kuralı tasarımda kaldırıldı).
//
// Veri: attendedEvents(uid) + myReviews(uid) (yazma: submitArtistReview / submitVenueReview / updateMyReview — data.js).
//   Puanlanmış = bu etkinliğin id'siyle (eventId) yazılmış kendi yorumun (sanatçı ya da mekan). Gösterilen puan: mekan yorumu varsa
//   overallRating ?? rating, yoksa sanatçı yorumu.
//   "Aynı etkinlik+hedef için ikinci yorum yerine mevcut yorum düzenlenir": hedefin mevcut yorumu (doküman kimliği ${uid}_${hedef})
//   modalda ön-doldurulur. Aynı etkinliğe aitse updateMyReview (legacy "Yorumu Düzenle" yaması; createdAt korunur); başka bir
//   etkinliğe aitse legacy reviewModal gibi submit* (setDoc) ile bu etkinliğe yeniden bağlanır (kural: hedef başına TEK yorum).
// URL: ?filtre=puanlanmamis (sekme), ?puanla={eventId} (Biletlerim PUANLA / review_prompt bildirimi derin bağlantısı → modal açılır).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { attendedEvents, myReviews, submitArtistReview, submitVenueReview, updateMyReview } from "../../data.js";
import { accountShell } from "../shared/account-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkPageHead, dkSegmented, dkEmpty, dkButton, dkModal, dkToast, dkLoginGate, dkSkeleton, dkTextarea } from "../shared/ui.js";
import { invalidateAccountCounts } from "../shared/live.js";
import { eventStartMs, eventEndMs, fmtTime, fmtInt, trUpper, trLower, initials, MONTHS_TR, MONTHS_TR_SHORT, DAYS_TR_SHORT, queryOf, writeQuery } from "../shared/helpers.js";
import { genreGrad, primaryGenre } from "../shared/genres.js";
import { evTitle, evImage, evHref } from "../shared/cards.js";

// ── Artboard SVG gövdeleri (birebir) ──
const STAR = '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>';
const CAL_CHECK = '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4"></path>';
const LABELS = ["", "KÖTÜ", "FENA DEĞİL", "İYİ", "ÇOK İYİ", "MUHTEŞEM"];
const TAIL_MS = 6 * 3600e3;               // bilet kuralı (live.accountCounts TICKET_TAIL) ile aynı
const OUT_MS = 360;                       // .dk-out (48px / 360ms)

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
const clampStars = (v) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
const ratingOf = (r) => clampStars(r?.overallRating ?? r?.rating);
const myName = (s) => s.profile?.displayName || s.user?.displayName || "Kullanıcı";   // legacy customer.js myName()

// Tarih biçimleri (artboard: "EYLÜL 2026", "CMT", "CMT 19 EYL · 21:00")
const monthKey = (ms) => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth(); };
const monthTitle = (ms) => { const d = new Date(ms); return trUpper(`${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`); };
const dow = (ms) => trUpper(DAYS_TR_SHORT[new Date(ms).getDay()]);
const whenUp = (ms) => { const d = new Date(ms); return `${dow(ms)} ${d.getDate()} ${trUpper(MONTHS_TR_SHORT[d.getMonth()])} · ${fmtTime(ms)}`; };

// Artboard yıldızı (dolu #FF8A2A / boş çizgi #7D818B). SVG öznitelikleri tasarımdaki gibi (fill + stroke + linejoin).
function starSvg(on, size, sw, cls) {
  const s = svgRaw(STAR, { size, sw, color: on ? "#FF8A2A" : "#7D818B", cls });
  s.setAttribute("fill", on ? "#FF8A2A" : "none");
  s.removeAttribute("stroke-linecap");
  return s;
}
function paintStar(svg, on) { svg.setAttribute("fill", on ? "#FF8A2A" : "none"); svg.setAttribute("stroke", on ? "#FF8A2A" : "#7D818B"); }

// Görsel ya da yer tutucu (tür gradyanı + serif baş harf — cards.js ile aynı yaklaşım).
// SHARED-CANDIDATE: cards.js'teki media()/placeholder() dışa aktarılmıyor; burada aynı sınıflarla (dk-ec-img/dk-ec-ph) yerel kopya.
function evMedia(e, initialSize = 40) {
  const ph = () => h("span", { class: "dk-ec-img dk-ec-ph", style: { background: genreGrad(primaryGenre(e), 150) }, "aria-hidden": "true" },
    h("span", { style: { fontSize: initialSize + "px" } }, initials(evTitle(e))));
  const src = evImage(e);
  if (!src) return ph();
  const img = h("img", { src, alt: "", loading: "lazy", decoding: "async", class: "dk-ec-img" });
  img.addEventListener("error", () => img.replaceWith(ph()), { once: true });
  return img;
}

// StarRating (giriş) — radiogroup, 44px düğmeler, ok tuşları (roving tabindex), seçimde gbStarPop (n ≤ seçim, (n−1)·40ms gecikme).
// SHARED-CANDIDATE: WebYorumlarım düzenleme modalı da aynı bileşeni kullanıyor (orada svg 30, pop yok) — ortak ui.js'e dkStarRating önerisi.
function starRating({ value = 0, size = 32, label, aria, pop = true, onChange }) {
  const group = h("div", { role: "radiogroup", "aria-label": label, class: "dk-katildiklarim-stars" });
  const btns = [];
  const set = (n, { animate = false, focus = false } = {}) => {
    value = n;
    btns.forEach((b, i) => {
      const k = i + 1, on = k <= n;
      b.setAttribute("aria-checked", k === n ? "true" : "false");
      b.tabIndex = (n ? k === n : k === 1) ? 0 : -1;
      const svg = b.firstChild;
      paintStar(svg, on);
      if (pop) {
        svg.classList.remove("dk-starpop");
        if (on && animate) { void svg.getBoundingClientRect(); svg.style.animationDelay = (k - 1) * 40 + "ms"; svg.classList.add("dk-starpop"); }
      }
    });
    if (focus) btns[n - 1]?.focus();
  };
  for (let k = 1; k <= 5; k++) {
    const b = h("button", { type: "button", role: "radio", class: "dk-star dk-katildiklarim-starbtn", "aria-label": aria(k) }, starSvg(false, size, "1.5"));
    b.addEventListener("click", () => { set(k, { animate: true }); onChange?.(k); });
    btns.push(b); group.append(b);
  }
  group.addEventListener("keydown", (e) => {
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    let n = null;
    if (e.key in map) n = Math.min(5, Math.max(1, (value || 0) + map[e.key]));
    else if (e.key === "Home") n = 1;
    else if (e.key === "End") n = 5;
    if (n == null) return;
    e.preventDefault();
    set(n, { animate: true, focus: true }); onChange?.(n);
  });
  set(value);
  group.dk = { set, get: () => value, focusTarget: () => btns[(value || 1) - 1] };
  return group;
}

export function katildiklarimView(ctx) {
  const s = ctx.session || session;
  const uid = s.user && !s.guest ? s.user.uid : null;
  const shell = accountShell({ active: "katildiklarim", contentGap: 28, ctx });
  let dead = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); return t; };

  // ── durum ──
  let all = [];          // tüm katılımlar (derin bağlantı için)
  let past = [];         // geçmiş etkinlikler (başlangıç azalan)
  let reviews = [];      // myReviews(uid) — _col: reviews (sanatçı) | venueReviews (mekan)
  let loaded = false;
  let tab = (ctx.query?.get("filtre") === "puanlanmamis") ? "puanlanmamis" : "tumu";
  let openId = null;     // modalı açık etkinlik (kart kenarı turuncu)
  let modal = null;
  const leaving = new Set();

  const byEvent = () => {
    const m = new Map();
    reviews.forEach((r) => {
      if (!r.eventId) return;
      const x = m.get(r.eventId) || {};
      if (r._col === "venueReviews") x.venue = r; else x.artist = r;
      m.set(r.eventId, x);
    });
    return m;
  };
  const ratedStars = (x) => (x ? ratingOf(x.venue || x.artist) : 0);

  // ── iskelet: PageHead + kontroller + zaman çizelgesi ──
  const LEAD_TAIL = "Gittiğin geceleri puanla; sanatçılar ve mekanlar Top 10'da bu puanlarla yükselir.";
  const head = dkPageHead({ title: "Katıldık", em: "larım", lead: LEAD_TAIL });
  const leadEl = head.querySelector(".dk-ph-lead");

  const seg = dkSegmented({
    items: [{ key: "tumu", label: "Tümü", count: 0 }, { key: "puanlanmamis", label: "Puanlanmamış", count: 0 }],
    value: tab, label: "Filtre", countColor: "#FF8A2A",
    onChange: (k) => { if (k === tab) return; tab = k; writeQuery({ filtre: k === "puanlanmamis" ? "puanlanmamis" : null }); drawList(true); },
  });
  const progFill = h("span", { class: "dk-katildiklarim-progfill" });
  const progLbl = h("span", { class: "dk-katildiklarim-proglbl" });
  // role=progressbar: değer/metin ekran okuyucuya aria-valuetext ile (görünür etiket "3/6 PUANLANDI" ile aynı bilgi)
  const prog = h("span", { class: "dk-katildiklarim-prog", role: "progressbar", "aria-label": "Puanlama ilerlemesi", "aria-valuemin": "0" },
    h("span", { class: "dk-katildiklarim-progtrack", "aria-hidden": "true" }, progFill), progLbl);
  const ctl = h("div", { class: "dk-katildiklarim-ctl dk-rise", style: { "--dk-delay": "60ms" } }, seg, prog);
  const listWrap = h("div", { class: "dk-katildiklarim-body", "aria-busy": "true" });
  const root = h("div", { class: "dk-katildiklarim" }, head, ctl, listWrap);
  shell.content.append(root);
  ctl.hidden = true;

  // yükleniyor iskeleti (tasarımda yok; dk-skel)
  const skeleton = () => h("div", { class: "dk-katildiklarim-skel", "aria-hidden": "true" },
    ...[0, 1, 2].map(() => h("div", { class: "dk-katildiklarim-skelrow" },
      h("span", { class: "dk-katildiklarim-skelday" }, dkSkeleton({ w: 30, h: 26 }), dkSkeleton({ w: 26, h: 10 })),
      h("div", { class: "dk-katildiklarim-skelcard" }, dkSkeleton({ w: 132, h: 84, r: 6, cls: "dk-katildiklarim-skelthumb" }),
        h("div", { class: "dk-katildiklarim-skelcol" }, dkSkeleton({ w: "46%", h: 17 }), dkSkeleton({ w: "32%", h: 13 }), dkSkeleton({ w: "40%", h: 11 }))))));
  listWrap.append(skeleton());

  // ── sayaçlar ──
  function syncCounts() {
    const map = byEvent();
    const rated = past.filter((e) => map.has(e.id)).length;
    const total = past.length;
    seg.dk.setCount("tumu", total);
    seg.dk.setCount("puanlanmamis", total - rated);
    progFill.style.width = (total ? Math.round((rated / total) * 100) : 0) + "%";
    progLbl.textContent = `${rated}/${total} PUANLANDI`;
    prog.setAttribute("aria-valuemax", String(total));
    prog.setAttribute("aria-valuenow", String(rated));
    prog.setAttribute("aria-valuetext", `${total} etkinlikten ${rated} tanesi puanlandı`);
    // Katıldığı etkinliklerin hepsi henüz yaklaşan → "0 etkinliğe katıldınız" çelişkili olur (kenar hapı tümünü sayar); sayıyı gösterme
    leadEl.textContent = !total && all.length ? LEAD_TAIL : `${total} etkinliğe katıldınız. ${LEAD_TAIL}`;
  }

  // ── satır ──
  function rightBlock(e, x) {
    const n = ratedStars(x);
    if (x) {
      const stars = h("span", { class: "dk-katildiklarim-ministars", role: "img", "aria-label": `${n} / 5 yıldız` });
      for (let k = 1; k <= 5; k++) stars.append(starSvg(k <= n, 15, "1.6"));
      return h("span", { class: "dk-katildiklarim-rated" }, stars,
        h("a", { href: "#/yorumlarim", class: "dk-katildiklarim-golink" }, "PUANLADIN · YORUMA GİT"));
    }
    const star = svgRaw(STAR, { size: 14, sw: "1.5", fill: true });
    star.setAttribute("stroke", "currentColor"); star.setAttribute("stroke-width", "1.5"); star.setAttribute("stroke-linejoin", "round");
    return h("button", { type: "button", class: "dk-katildiklarim-rate dk-press", "aria-label": `${evTitle(e)} etkinliğini puanla`, onclick: () => openRate(e) },
      star, "Puanla");
  }
  function row(e, idx, map) {
    const ms = eventStartMs(e);
    const d = new Date(ms);
    const title = evTitle(e);
    const sub = [e.artistName, e.venueName].filter(Boolean).join(" · ");
    const card = h("div", { class: cx("dk-katildiklarim-card", openId === e.id && "is-open") },
      h("a", { href: evHref(e), class: "dk-katildiklarim-thumb", "aria-label": `${title} etkinlik sayfası` }, evMedia(e)),
      h("span", { class: "dk-katildiklarim-info" },
        h("a", { href: evHref(e), class: "dk-katildiklarim-title" }, title),
        sub ? h("span", { class: "dk-katildiklarim-sub" }, sub) : null,
        h("span", { class: "dk-katildiklarim-meta" }, h("span", {}, whenUp(ms)), h("span", {}, `${fmtInt(e.attendeeCount || 0)} KATILIMCI`))),
      rightBlock(e, map.get(e.id)));
    const art = h("article", { class: cx("dk-katildiklarim-row", leaving.has(e.id) ? "dk-out" : "dk-rise"), style: { "--dk-delay": leaving.has(e.id) ? "0ms" : 120 + idx * 60 + "ms" }, dataset: { id: e.id } },
      h("span", { class: "dk-katildiklarim-day" },
        h("span", { class: "dk-katildiklarim-dd" }, String(d.getDate())),
        h("span", { class: "dk-katildiklarim-dow" }, dow(ms))),
      card);
    art._card = card;
    return art;
  }

  // ── liste (sekmeye göre) ──
  let timeline = null;
  const rows = new Map();   // eventId → article
  function drawList(anim = false) {
    if (!loaded) return;
    const map = byEvent();
    syncCounts();
    listWrap.replaceChildren();
    listWrap.removeAttribute("aria-busy");
    rows.clear();
    if (!past.length) {
      ctl.hidden = true;
      // Katılım var ama hepsi yaklaşan (başlangıç + 6 sa > şimdi) → "katılmadınız" demek yanlış; Biletlerim'e yönlendir.
      const upcoming = all.length;
      listWrap.append(dkEmpty({
        icon: svgRaw(CAL_CHECK, { size: 28, sw: "1.6" }), ring: true,
        title: upcoming ? "Henüz tamamlanan bir etkinliğin yok." : "Henüz bir etkinliğe katılmadınız.",
        sub: upcoming
          ? `Katıldığın ${fmtInt(upcoming)} etkinlik henüz gerçekleşmedi. Etkinlik bitince burada puanlayabilirsin; biletlerin Biletlerim'de.`
          : "Keşfet sekmesinden etkinlik bulup \"Katıl\" diyebilirsiniz.",
        action: upcoming
          ? dkButton("Biletlerime git", { variant: "light", size: 42, href: "#/biletlerim" })
          : dkButton("Etkinlikleri keşfet", { variant: "light", size: 42, href: "#/kesfet" }),
        cls: "dk-rise",
      }));
      return;
    }
    ctl.hidden = false;
    const list = past.filter((e) => tab === "tumu" || !map.has(e.id) || leaving.has(e.id));
    timeline = h("div", { class: "dk-katildiklarim-tl" }, h("span", { class: "dk-katildiklarim-rail", "aria-hidden": "true" }));
    let idx = 0, cur = null, curKey = null, sec = null;
    list.forEach((e) => {
      const ms = eventStartMs(e);
      const k = monthKey(ms);
      if (k !== curKey) {
        curKey = k;
        const hid = `dk-katil-m-${k}`;
        cur = h("span", { class: "dk-katildiklarim-mcount" });
        sec = h("section", { class: "dk-katildiklarim-month", "aria-labelledby": hid },
          h("div", { class: "dk-katildiklarim-mhead" },
            h("span", { class: "dk-katildiklarim-nodecol", "aria-hidden": "true" }, h("span", { class: "dk-katildiklarim-node" })),
            h("h2", { id: hid, class: "dk-katildiklarim-mtitle" }, monthTitle(ms)), cur));
        sec._n = 0; sec._count = cur;
        timeline.append(sec);
      }
      const r = row(e, idx++, map);
      rows.set(e.id, r);
      sec.append(r);
      sec._n++;
      sec._count.textContent = `· ${sec._n} ETKİNLİK`;
    });
    if (!list.length) {
      // Puanlanmamış sekmesi boş → "hepsi puanlandı" kutusu (margin-left 86); ray tasarımdaki gibi kutunun solunda görünür kalır
      timeline.append(h("div", { class: "dk-katildiklarim-alldone dk-rise" },
        h("span", { class: "dk-katildiklarim-alldone-t" }, "Puanlanmamış etkinlik kalmadı"),
        h("span", { class: "dk-katildiklarim-alldone-s" }, "Tüm katılımlarını değerlendirdin. Teşekkürler!")));
    }
    listWrap.append(timeline);
    if (!anim) timeline.querySelectorAll(".dk-rise").forEach((el) => el.classList.remove("dk-rise"));
  }

  // ── odak yönetimi: puanlanan satırın düğmesi değişince / satır kaldırılınca odak <body>'ye düşmesin ──
  const focusLost = (scope) => { const a = document.activeElement; return !a || a === document.body || !a.isConnected || !!(scope && scope.contains(a)); };
  const focusEl = (el) => { try { el?.focus({ preventScroll: true }); } catch (_) {} };
  const rowTarget = (id) => { const r = rows.get(id); return r ? (r.querySelector(".dk-katildiklarim-rate") || r.querySelector(".dk-katildiklarim-golink")) : null; };
  const activeTab = () => seg.querySelector('[role="tab"][aria-selected="true"]');

  // Bir satırın sağ bloğunu (Puanla ↔ yıldızlar) yerinde yeniden kur
  function refreshRow(id, map) {
    const r = rows.get(id);
    const ev = r && past.find((x) => x.id === id);
    if (!ev) return null;
    const nu = rightBlock(ev, map.get(id));
    r._card.lastChild.replaceWith(nu);
    return nu;
  }

  // Puanlama sonrası: Tümü'nde satırın sağ bloğunu yerinde güncelle; Puanlanmamış'ta satırı kaydırarak çıkar.
  // prevId: kaydetme, BAŞKA bir etkinliğe bağlı yorumu (hedef başına tek yorum) bu etkinliğe taşıdıysa o etkinlik — satırı da güncellenir.
  function afterRated(e, prevId) {
    const map = byEvent();
    const r = rows.get(e.id);
    if (tab === "puanlanmamis") {
      if (!r) { if (prevId) drawList(false); else syncCounts(); if (focusLost()) focusEl(activeTab()); return; }
      // odak: sıradaki (yoksa önceki) puanlanmamış satırın Puanla düğmesi; hiç kalmadıysa etkin sekme
      const lost = focusLost(r);
      const order = [...rows.keys()];
      const at = order.indexOf(e.id);
      const alive = (id) => id !== e.id && !leaving.has(id);
      const nextId = order.slice(at + 1).find(alive) || order.slice(0, at).reverse().find(alive) || null;
      leaving.add(e.id);
      r.classList.remove("dk-rise"); r.style.setProperty("--dk-delay", "0ms"); r.classList.add("dk-out");
      syncCounts();
      if (lost) focusEl(nextId ? rowTarget(nextId) : activeTab());
      later(() => {
        leaving.delete(e.id);
        const refocus = focusLost();   // odak eski satır düğmesindeyse (drawList onu siler) yeniden kurulan karşılığına taşı
        drawList(false);
        if (refocus || focusLost()) focusEl((nextId && rowTarget(nextId)) || activeTab());
      }, reduced() ? 0 : OUT_MS);
      return;
    }
    const lost = focusLost(r ? r._card.lastChild : null);
    const nu = refreshRow(e.id, map);
    if (prevId && prevId !== e.id) refreshRow(prevId, map);
    syncCounts();
    if (lost) focusEl(nu ? (nu.matches("a,button") ? nu : nu.querySelector("a,button")) : shell.content);
  }
  const markOpen = () => rows.forEach((r, id) => r._card.classList.toggle("is-open", id === openId));

  // ── Puanla modalı (RateModal) ──
  function openRate(e) {
    if (dkLoginGate("Puanlamak")) return;
    if (!uid) return;
    try { modal?.close("replace"); } catch (_) {}
    openId = e.id; markOpen();
    const T = {
      artist: { key: "artist", kind: "SANATÇI", id: e.artistId || null, name: e.artistName || "Sanatçı", col: "reviews" },
      venue: { key: "venue", kind: "MEKAN", id: e.venueId || null, name: e.venueName || "Mekan", col: "venueReviews" },
    };
    const existing = (t) => t.id ? reviews.find((r) => r._col === t.col && (r.id === `${uid}_${t.id}` || (t.key === "artist" ? r.targetId : r.venueId) === t.id)) : null;
    const drafts = {};
    Object.values(T).forEach((t) => { const ex = existing(t); drafts[t.key] = { stars: ex ? ratingOf(ex) : 0, text: ex?.comment || "", ex }; });
    // Varsayılan hedef mekan (tasarım). Mekanın yorumu BAŞKA bir etkinliğe bağlıysa (kaydetmek onu bu etkinliğe taşır) ve sanatçı
    // serbestse sanatçı seçilir → kullanıcı yanlışlıkla eski yorumunu taşımaz. Kimliği olmayan hedef seçilemez.
    const free = (k) => T[k].id && (!drafts[k].ex || drafts[k].ex.eventId === e.id);
    let target = free("venue") ? "venue" : free("artist") ? "artist" : T.venue.id ? "venue" : "artist";

    // hedef seçimi (radio kartları)
    const tBtns = {};
    const tGroup = h("div", { role: "radiogroup", "aria-label": "Neyi puanlıyorsun", class: "dk-katildiklarim-targets" });
    ["artist", "venue"].forEach((k) => {
      const t = T[k];
      const b = h("button", { type: "button", role: "radio", class: cx("dk-katildiklarim-target", "dk-press", `is-${k}`), disabled: !t.id,
        title: t.id ? null : (k === "artist" ? "Bu etkinlikte sanatçı bilgisi yok" : "Bu etkinlikte mekan bilgisi yok") },
      h("span", { class: "dk-katildiklarim-tkind" }, t.kind), h("span", { class: "dk-katildiklarim-tname" }, t.id ? t.name : "—"));
      b.addEventListener("click", () => pickTarget(k));
      tBtns[k] = b; tGroup.append(b);
    });
    tGroup.addEventListener("keydown", (ev) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(ev.key)) return;
      const other = target === "artist" ? "venue" : "artist";
      if (!T[other].id) return;
      ev.preventDefault(); pickTarget(other); tBtns[other].focus();
    });
    const note = h("p", { class: "dk-katildiklarim-rmnote", hidden: true });

    const starLbl = h("span", { class: "dk-katildiklarim-starlbl" });
    const stars = starRating({
      label: "Yıldız puanı", aria: (n) => `${n} yıldız · ${trLower(LABELS[n])}`,
      onChange: (n) => { drafts[target].stars = n; syncSend(); },
    });
    const starsBlock = h("div", { class: "dk-katildiklarim-rmfield dk-katildiklarim-rmstars" },
      h("span", { class: "dk-katildiklarim-rmlbl" }, "PUANIN"),
      h("div", { class: "dk-katildiklarim-starrow" }, stars, starLbl));

    const ta = dkTextarea({ id: "dk-katil-rv", rows: 4, maxlength: 500, counter: false, bg: "void", placeholder: "Yorumunuzu yazın..." });
    // sayaç her tuşta duyurulmasın (aria-live yok); textarea'nın açıklaması olarak odakta okunur
    const cnt = h("span", { class: "dk-katildiklarim-rmcount", id: "dk-katil-rvcount" });
    ta.setAttribute("aria-describedby", "dk-katil-rvcount");
    ta.addEventListener("input", () => { drafts[target].text = ta.value; cnt.textContent = `${ta.value.length}/500`; });
    const comment = h("div", { class: "dk-katildiklarim-rmfield" },
      h("label", { for: "dk-katil-rv", class: "dk-katildiklarim-rmlbl" }, "YORUMUN (İSTEĞE BAĞLI)"), ta, cnt);

    function syncSend() {
      const n = drafts[target].stars;
      starLbl.textContent = n ? `${n}/5 · ${LABELS[n]}` : "YILDIZ SEÇ";
      starLbl.classList.toggle("is-on", !!n);
      const send = m?.buttons?.[1];
      if (send) send.setAttribute("aria-disabled", n ? "false" : "true");
    }
    function pickTarget(k) {
      if (!T[k].id) return;
      target = k;
      Object.entries(tBtns).forEach(([kk, b]) => { const on = kk === k; b.setAttribute("aria-checked", on ? "true" : "false"); b.classList.toggle("is-on", on); b.tabIndex = on ? 0 : -1; });
      const d = drafts[k];
      stars.dk.set(d.stars);
      ta.value = d.text; cnt.textContent = `${ta.value.length}/500`;
      // mevcut yorum başka bir etkinliğe aitse kullanıcıya söyle (hedef başına tek yorum kuralı)
      if (d.ex && d.ex.eventId !== e.id) {
        note.textContent = `Bu ${k === "artist" ? "sanatçı" : "mekan"} için ${d.ex.event ? `“${d.ex.event}” etkinliğindeki ` : "önceki "}değerlendirmen bu etkinlikle güncellenecek.`;
        note.hidden = false;
      } else if (d.ex) {
        note.textContent = "Bu etkinlik için değerlendirmen var; kaydedince güncellenir.";
        note.hidden = false;
      } else note.hidden = true;
      syncSend();
    }

    async function submit(close) {
      const t = T[target];
      const d = drafts[target];
      if (!d.stars || !t.id) return false;
      const text = (ta.value || "").trim();
      const ex = d.ex;
      const prevId = ex && ex.eventId && ex.eventId !== e.id ? ex.eventId : null;
      try {
        if (ex && ex.eventId === e.id) {
          // Aynı etkinlik + hedef → legacy "Yorumu Düzenle" yaması (myReviewsView.editReview); createdAt korunur
          const patch = t.col === "venueReviews" ? { comment: text, rating: d.stars, overallRating: d.stars } : { comment: text, rating: d.stars };
          await updateMyReview(t.col, ex.id, patch);
          Object.assign(ex, patch);
        } else {
          // Yeni ya da başka etkinliğe bağlı yorum → legacy reviewModal yazımı (aynı data.js fonksiyonları, aynı alanlar;
          // doküman kimliği ${uid}_${hedef} → hedef başına tek yorum, bu etkinliğe yeniden bağlanır)
          const tgt = { id: t.id, displayName: (t.key === "artist" ? e.artistName : e.venueName) || "" };
          if (t.key === "artist") await submitArtistReview(uid, myName(s), tgt, d.stars, text, e);
          else await submitVenueReview(uid, myName(s), tgt, d.stars, text, e);
          const id = `${uid}_${t.id}`;
          const doc = t.key === "artist"
            ? { id, _col: "reviews", authorId: uid, targetId: t.id, targetName: tgt.displayName, targetType: "artist", rating: d.stars, comment: text, eventId: e.id, event: e.title || "", createdAt: new Date() }
            : { id, _col: "venueReviews", authorId: uid, venueId: t.id, venueName: tgt.displayName, rating: d.stars, overallRating: d.stars, comment: text, eventId: e.id, event: e.title || "", createdAt: new Date() };
          reviews = reviews.filter((r) => !(r._col === doc._col && r.id === id)).concat(doc);
          d.ex = doc;
        }
      } catch (_) {
        dkToast("Gönderilemedi", { type: "err" });
        return false;
      }
      invalidateAccountCounts(uid);
      shell.refreshCounts(true);
      close("action");
      dkToast(`Değerlendirmen kaydedildi · ${t.name}`);
      afterRated(e, prevId);
      return true;
    }

    // Medya başlığı (112px görsel + gradyan + kapat + tarih/başlık)
    const ms = eventStartMs(e);
    const caption = h("span", { class: "dk-katildiklarim-rmcap" },
      h("span", { class: "dk-katildiklarim-rmwhen" }, ms != null ? whenUp(ms) : ""),
      h("span", { class: "dk-katildiklarim-rmtitle" }, evTitle(e)));

    let m = null;
    m = dkModal({
      title: "Nasıldı?", size: 520, top: 160, cls: "dk-katildiklarim-rm",
      body: [tGroup, note, starsBlock, comment],
      initialFocus: ".dk-katildiklarim-stars [tabindex='0']",
      actions: [
        { label: "İptal", variant: "outline" },
        { label: "Değerlendirmeyi gönder", variant: "primary", keepOpen: true, busyLabel: "Gönderiliyor…", onClick: (close) => submit(close) },
      ],
      onClose: () => {
        if (modal === m) modal = null;
        if (dead) return;
        if (openId === e.id) { openId = null; markOpen(); }
        if (queryOf().get("puanla")) writeQuery({ puanla: null });
      },
    });
    modal = m;
    // dkModal (hesap varyantı) yapısını RateModal düzenine çevir: [medya başlığı (kapat düğmesi içinde)] + [iç gövde: h2, gövde, eylemler]
    const dlg = m.dialog;
    const titleEl = dlg.querySelector(".dk-mdl-t");
    const xBtn = dlg.querySelector(".dk-mdl-x");
    const errEl = dlg.querySelector(".dk-mdl-err");
    const acts = dlg.querySelector(".dk-mdl-acts");
    const media = h("div", { class: "dk-katildiklarim-rmmedia" }, evMedia(e, 56), h("span", { class: "dk-katildiklarim-rmshade", "aria-hidden": "true" }), caption, xBtn);
    const inner = h("div", { class: "dk-katildiklarim-rmin" }, titleEl, m.body, errEl, acts);
    dlg.replaceChildren(media, inner);
    pickTarget(target);
    syncSend();
  }

  // ── veri ──
  function applyQuery(q) {
    const f = q?.get("filtre") === "puanlanmamis" ? "puanlanmamis" : "tumu";
    if (f !== tab) { tab = f; seg.dk.set(f); drawList(true); }
    const pid = q?.get("puanla");
    if (pid && loaded && openId !== pid) {
      const now = Date.now();
      // derin bağlantı: listedeki (geçmiş) etkinlik ya da BİTMİŞ (eventEndMs < şimdi) katıldığın etkinlik — review_prompt bildirimi
      // endAt geçince gönderilir (functions sendReviewPrompts), bu an başlangıç + 6 sa'ten önce olabilir. Süren/yaklaşan → yok say.
      const e = past.find((x) => x.id === pid) || all.find((x) => x.id === pid && (eventEndMs(x) ?? Infinity) < now);
      if (e) openRate(e);
      else writeQuery({ puanla: null });
    }
  }
  async function load() {
    listWrap.setAttribute("aria-busy", "true");
    if (!uid) {
      listWrap.replaceChildren(dkEmpty({ icon: svgRaw(CAL_CHECK, { size: 28, sw: "1.6" }), ring: true, title: "Giriş gerekli", sub: "Katıldığın etkinlikleri görmek için giriş yap.",
        action: dkButton("Giriş yap", { variant: "light", size: 42, href: "#/login" }) }));
      return;
    }
    try {
      const [att, rv] = await Promise.all([attendedEvents(uid), myReviews(uid)]);
      if (dead) return;
      const now = Date.now();
      all = Array.isArray(att) ? att : [];
      reviews = Array.isArray(rv) ? rv : [];
      past = all.filter((e) => { const st = eventStartMs(e); return st != null && st + TAIL_MS <= now; })
        .sort((a, b) => eventStartMs(b) - eventStartMs(a));
      loaded = true;
      drawList(true);
      applyQuery(ctx.query);
    } catch (err) {
      if (dead) return;
      console.warn("[dk]", err);
      listWrap.removeAttribute("aria-busy");
      const retry = dkButton("Tekrar dene", { variant: "light", size: 42, onClick: () => { listWrap.replaceChildren(skeleton()); load(); } });
      listWrap.replaceChildren(dkEmpty({ icon: "alertCircle", ring: true, title: "Katıldıkların yüklenemedi.", sub: "Bağlantını kontrol edip tekrar dene.", action: retry }));
    }
  }
  load();

  return {
    node: shell.node,
    update(query) { applyQuery(query); },
    onSession() { return true; },   // içerik kimliğe bağlı; kimlik değişimini router yeniden kurar
    destroy() {
      dead = true;
      timers.forEach(clearTimeout); timers.clear();
      try { modal?.close("route"); } catch (_) {}
      shell.destroy();
    },
  };
}
