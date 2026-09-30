// WebSanatciTeklif — masaüstü görünümü (≥769 px). Registry anahtarı: artistTeklif (#/artist/teklif/{invitationId}, YENİ rota).
// Spec: specs/sanatci.md § WebSanatciTeklif + sahibinin CLAUDE CODE notu (design/WebSanatciTeklif.dc.html).
// CSS: css/dk-sanatci-teklif.css — tüm seçiciler .dk-sanatci-teklif kökü / .dk-sanatci-teklif-* sınıfları altında.
// ≤768: legacy (mobil ana sayfadaki offerDetailModal) aynen kalır; router bu modülü mobilde yüklemez.
//
// Legacy offerDetailModal özellikleri (korundu): mekan adı + tür, Tarih / Saat / Ücret (vurgulu, "Belirtilmemiş"), "Mekan Mesajı"
//   (boşsa "Mekan herhangi bir mesaj eklememiş."), "Mekan Konumu — Haritada Göster" YALNIZ users/{venueId}.location varsa (Google Maps
//   search, legacy URL birebir), Reddet / Kabul Et → respondToOffer(off, action, me()) → toast / ERR-OFFERDETAIL-001.
// Tasarım ekleri: tam sayfa + durum rozeti + sonuç kutusu, satır içi onay (legacy modal onaysız davranıyordu; sahibi notu: önce onay),
//   hafta ajandası (rezidans tekrarları + kabul edilmiş etkinlikler), mekan bilgisi (puan/kapasite), diğer bekleyen teklifler,
//   "Mekana mesaj yaz" (#/artist/mesaj?c={convId} derin bağlantısı).
// Veri: invitations/{id} tek doküman dinleyicisi (yeni; indeks gerekmez; kural artistId == uid) — Panel'den gelinirse önbellekteki
//   teklif anında çizilir. "Geri al" YOK (arka uçta geri alma yok, spec Q5). "Mekan profilini gör" → #/mekan/{id} (WebMekan hazırsa).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { db, doc, onSnapshot } from "../../firebase.js";
import { userById, getVenueReviews, listenArtistOffers, listenArtistAccepted, listenArtistResidencies, respondToOffer, convIdFor } from "../../data.js";
import { isDesktop } from "../../viewport.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkToast, dkSkeleton, dkEmpty } from "../shared/ui.js";
import { rgba, trUpper, initials } from "../shared/helpers.js";
import { genreColor } from "../shared/genres.js";
import { routeReady } from "../registry.js";
import {
  STATUS, DOW_UP, DOW_LONG, isoToTR, toISOKey, toISODate, expandOccurrences, offerFromDoc, offerWhen, offerSortKey, meOf,
  rememberDecision, cachedOffer, cacheOffers,
} from "./panel.js";

// ══════════ Artboard SVG gövdeleri (birebir) ══════════
const I = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  clock: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
  note: '<path d="M9 18V6l11-2v12"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle>',
  cash: '<rect x="3.5" y="7" width="17" height="10" rx="1.5"></rect><circle cx="12" cy="12" r="2.5"></circle>',
  chat: '<path d="M20 14.5a2 2 0 0 1-2 2H9l-4 3.5V6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2z"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  okC: '<circle cx="12" cy="12" r="8.5"></circle><path d="m8.5 12.2 2.4 2.4 4.8-5"></path>',
  xC: '<circle cx="12" cy="12" r="8.5"></circle><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  x: '<path d="m7 7 10 10M17 7 7 17"></path>',
  chev: '<path d="m9 6 6 6-6 6"></path>',
};
const P = "dk-sanatci-teklif";
const cls = (s) => s.split(" ").filter(Boolean).map((x) => (x.startsWith("is-") ? x : `${P}-${x}`)).join(" ");
// replaceChildren null/false çocukları ATLAMAZ ("null" metni yazar) → süz
const put = (el, ...k) => el.replaceChildren(...k.filter((x) => x != null && x !== false));
// Tür göz atma satırı rengi: tür renginin açık tonu (artboard Electronic: nokta #A78BFA, metin #C4B5FD ≈ %35 beyaz karışım)
function lighten(hex, t = 0.35) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  if (!isFinite(n)) return hex;
  const mix = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}
// Tür etiketi büyük harf: İngilizce tür adları İngilizce kuralla ("ELECTRONIC", "INDIE", "HIP-HOP" — artboard), Türkçe adlar
// trUpper ile ("AKUSTİK", "TÜRK HALK MÜZİĞİ"). Liste = genres.js ALL_GENRES / FAMILY_OF içindeki İngilizce adlar.
const EN_GENRES = new Set([
  "house", "tech house", "deep house", "techno", "melodic techno", "minimal", "afro house", "organic house", "trance", "electronic", "disco",
  "edm", "drum & bass", "dubstep", "pop", "rock", "pop rock", "punk", "grunge", "metal", "alternative", "jazz", "blues", "soul", "funk", "swing",
  "hip-hop", "hip hop", "hiphop", "rap", "trap", "r&b", "rnb", "r and b", "reggae", "latin", "indie", "acoustic", "instrumental", "classical",
]);
const genreUpper = (g) => (EN_GENRES.has(String(g || "").trim().toLowerCase()) ? String(g).toUpperCase() : trUpper(g));

export function artistTeklifView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid;
  const profileKey = JSON.stringify(s.profile || {});
  const id = ctx.seg?.[3] || "";
  const shell = panelShell({ role: "artist", active: ctx.route?.nav || "home", title: "Teklif Detayı", subtitle: "Ana Sayfa / Gelen Teklifler", ctx, contentGap: 20, shellBadges: false });
  const root = shell.content;
  root.classList.add(P);
  const unsubs = [];
  let alive = true;
  const cached = id ? cachedOffer(id) : null;
  const st = {
    offer: cached, status: cached?.status || null, ask: null, busy: false, notFound: false,
    venue: undefined, venueFor: null, rating: null, residencies: null, accepted: null, offers: null, mekanReady: false,
  };

  // ═════════ İSKELET ═════════
  const back = h("a", { href: "#/artist", class: cx(cls("back"), "dk-link") }, svgRaw(I.back, { size: 16, sw: "2" }), "Gelen tekliflere dön");
  const hero = h("section", { class: cx(cls("hero"), "dk-rise"), "aria-label": "Mekan" });
  const det = h("section", { class: cls("card det"), "aria-labelledby": "dk-st-h-det" });
  const msg = h("section", { class: cls("card pad msg"), "aria-labelledby": "dk-st-h-msg" });
  const week = h("section", { class: cls("card pad week"), "aria-labelledby": "dk-st-h-week" });
  const ven = h("section", { class: cls("card pad ven"), "aria-labelledby": "dk-st-h-ven" });
  const respState = h("div", { class: cls("state") });
  const respHead = h("div", { class: cls("resphead") });
  const resp = h("section", { class: cx(cls("resp"), "dk-rise"), style: { "--dk-delay": "80ms" }, "aria-labelledby": "dk-st-h-fee" },
    h("span", { class: cx(cls("prism"), "dk-prism"), "aria-hidden": "true" }),
    h("span", { id: "dk-st-h-fee", class: cls("lbl") }, "TEKLİF EDİLEN ÜCRET"),
    respHead,
    h("span", { class: cls("div"), "aria-hidden": "true" }),
    respState);
  const others = h("section", { class: cls("card others"), "aria-labelledby": "dk-st-h-other", hidden: true });
  const barFee = h("span", { class: cls("barfee") });
  const barAcc = h("button", { type: "button", class: cx(cls("bbtn is-primary"), "dk-press") }, "Kabul Et");
  const barRej = h("button", { type: "button", class: cx(cls("bbtn is-danger"), "dk-press") }, "Reddet");
  const bar = h("div", { class: cls("bar"), hidden: true, role: "region", "aria-label": "Hızlı yanıt" }, barFee, h("span", { class: cls("barbtns") }, barRej, barAcc));
  const left = h("div", { class: cls("left") }, hero,
    h("div", { class: cls("rowa") }, det, msg),
    h("div", { class: cls("rowb") }, week, ven));
  const right = h("aside", { class: cls("right"), "aria-label": "Teklif yanıtı" }, resp, others);
  const grid = h("div", { class: cls("grid") }, left, right);
  root.append(back, grid, bar);
  // <1400 tek kolonda yanıt kartı hero'nun hemen altında görünür → DOM sırası da öyle olmalı (CSS `order` sekme sırasını
  // görsel sıradan koparıyordu, WCAG 2.4.3). ≥1400 iki kolonda aside ızgaranın 2. çocuğu. Dinleyici destroy'da bırakılır.
  const mqOne = window.matchMedia("(max-width: 1399px)");
  const placeAside = () => {
    const want = mqOne.matches ? left : grid;
    if (right.parentNode === want) return;
    const ae = document.activeElement;
    const refocus = ae && right.contains(ae) ? ae : null;
    if (mqOne.matches) hero.after(right); else grid.append(right);
    if (refocus) { try { refocus.focus({ preventScroll: true }); } catch (_) {} }
  };
  placeAside();
  if (typeof mqOne.addEventListener === "function") { mqOne.addEventListener("change", placeAside); unsubs.push(() => mqOne.removeEventListener("change", placeAside)); }
  else if (typeof mqOne.addListener === "function") { mqOne.addListener(placeAside); unsubs.push(() => mqOne.removeListener(placeAside)); }

  // iskelet içerik (veri gelene dek)
  hero.append(h("span", { class: cls("ph") }));
  det.append(h("h2", { id: "dk-st-h-det", class: cls("ml pad-h") }, "ETKİNLİK DETAYLARI"), dkSkeleton({ h: 200, r: 0 }));
  msg.append(h("h2", { id: "dk-st-h-msg", class: cls("ml") }, "MEKAN MESAJI"), dkSkeleton({ h: 90, r: 10 }));
  week.append(h("h2", { id: "dk-st-h-week", class: cls("ml") }, "TAKVİMİNDE O HAFTA"), dkSkeleton({ h: 48, r: 8 }));
  ven.append(h("h2", { id: "dk-st-h-ven", class: cls("ml") }, "MEKAN BİLGİSİ"), dkSkeleton({ h: 56, r: 10 }));
  respHead.append(dkSkeleton({ w: 180, h: 40 }));
  respState.append(dkSkeleton({ h: 48 }), dkSkeleton({ h: 48 }));

  // ═════════ ÇİZİMLER ═════════
  const statusOf = () => st.status || "pending";
  const S = () => STATUS[statusOf()] || { label: trUpper(statusOf()), c: "#8A8E97" };

  function drawHero() {
    const o = st.offer; const v = st.venue || null;
    const img = o.photoUrl || v?.bannerUrl || v?.photoURL || null;
    const words = String(o.venue || "").trim().split(/\s+/);
    const title = words.length > 1 ? [words.slice(0, -1).join(" ") + " ", h("em", {}, words[words.length - 1])] : [h("em", {}, o.venue)];
    const gc = o.genre && o.genre !== "—" ? genreColor(o.genre) : null;
    const eb = [o.genre && o.genre !== "—" ? genreUpper(o.genre) : null, v?.venueType ? trUpper(v.venueType) : null].filter(Boolean).join(" · ");
    const loc = v?.location;
    const map = loc && loc.lat != null
      ? h("a", { href: `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`, target: "_blank", rel: "noopener", class: cx(cls("map"), "dk-press") },
        svgRaw(I.pin, { size: 16, sw: "2", color: "#FF4FA3" }), "Mekan Konumu — Haritada Göster")
      : null;
    const sc = S();
    // aynı görsel yeniden çizimde korunur (anlık görüntü/mekan yüklemesinde titreme olmasın)
    const prev = hero.querySelector("img." + P + "-img");
    const media = img && prev && prev.getAttribute("src") === img ? prev
      : img ? h("img", { src: img, alt: `${o.venue} sahnesi`, class: cls("img"), decoding: "async" }) : h("span", { class: cls("ph") });
    put(hero, 
      media,
      h("span", { class: cls("scrim"), "aria-hidden": "true" }),
      h("span", { class: cls("hbadge"), style: { color: sc.c, borderColor: rgba(sc.c, 0.4) } }, h("span", { class: cls("hdot"), style: { background: sc.c } }), `TEKLİF · ${sc.label}`),
      h("div", { class: cls("hbot") },
        h("div", { class: cls("hcol") },
          eb ? h("span", { class: cls("heb"), style: { color: gc ? lighten(gc) : "#C9CACD" } }, gc ? h("span", { class: cls("hebdot"), style: { background: gc } }) : null, eb) : null,
          h("h1", { class: cls("h1") }, ...title)),
        map));
    if (media !== prev && media.tagName === "IMG") media.addEventListener("error", () => { media.replaceWith(h("span", { class: cls("ph") })); }, { once: true });
  }

  function drawDet() {
    const o = st.offer;
    const d = o.dateISO ? new Date(`${o.dateISO}T00:00`) : null;
    const dateTxt = o.dateISO ? `${isoToTR(o.dateISO)}${d && !isNaN(d) ? ` · ${DOW_LONG[d.getDay()]}` : ""}` : (o.date || "—");
    const row = (icon, label, val, hl) => h("div", { class: cx(cls("dr"), hl && "is-hl") },
      svgRaw(icon, { size: 18, sw: "1.9", color: hl ? "#7CE0B0" : "#8A8E97" }),
      h("dt", {}, label), h("dd", {}, val));
    put(det, 
      h("h2", { id: "dk-st-h-det", class: cls("ml pad-h") }, "ETKİNLİK DETAYLARI"),
      h("dl", { class: cls("dl") },
        row(I.cal, "Tarih", dateTxt),
        row(I.clock, "Saat", o.time || "—"),
        row(I.note, "Tür", o.genre || "—"),
        row(I.cash, "Ücret", o.fee, true)));
  }

  function drawMsg() {
    const o = st.offer;
    // ?c={convId} derin bağlantısı: masaüstü chat.js konuşmayı seçer (yoksa taslak açıp mekan adını çeker). Legacy
    // messages.requestChat ÇAĞRILMAZ — masaüstünde tüketilmiyor, bayat hedef sonra mobil Mesajlar'ı yanlış sohbete açıyordu.
    const chat = o.venueId && uid
      ? h("a", { href: `#/artist/mesaj?c=${encodeURIComponent(convIdFor(uid, o.venueId))}`, class: cx(cls("obtn"), "dk-press") }, svgRaw(I.chat, { size: 16, sw: "1.9", color: "#FF4FA3" }), "Mekana mesaj yaz")
      : null;
    put(msg,
      h("h2", { id: "dk-st-h-msg", class: cls("ml") }, "MEKAN MESAJI"),
      h("div", { class: cls("mrow") },
        h("span", { class: cls("mav"), "aria-hidden": "true" }, initials(o.venue)),
        h("blockquote", { class: cx(cls("quote"), !o.message && "is-empty") }, o.message || "Mekan herhangi bir mesaj eklememiş.")),
      chat);
  }

  function weekEntries() {
    const o = st.offer;
    if (!o?.dateISO) return null;
    const d0 = new Date(`${o.dateISO}T00:00`);
    if (isNaN(d0)) return null;
    const ws = new Date(d0); ws.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
    const we = new Date(ws); we.setDate(ws.getDate() + 6); we.setHours(23, 59, 59, 999);
    const list = [];
    (st.residencies || []).filter((r) => r.status === "active").forEach((r) => {
      expandOccurrences(r, ws, we).forEach((iso) => list.push({ iso, t: r.time || "", text: `${r.venueName || "Mekan"}${r.time ? ` · ${r.time}` : ""}`, kind: "Uzun dönem", c: "#FF4FA3" }));
    });
    (st.accepted || []).forEach((d) => {
      if (d.id === o.id) return;
      const iso = toISOKey(d.eventDate);
      if (!iso) return;
      const dd = new Date(`${iso}T00:00`);
      if (dd >= ws && dd <= we) list.push({ iso, t: d.eventTime || "", text: `${d.venueName ?? "Mekan"}${d.eventTime ? ` · ${d.eventTime}` : ""}`, kind: "Etkinlik", c: "#FFD700" });
    });
    const tm = o.time && o.time !== "—" ? o.time : "";
    const k = statusOf();
    list.push(k === "accepted"
      ? { iso: o.dateISO, t: tm, text: `${o.venue}${tm ? ` · ${tm}` : ""}`, kind: "Etkinlik", c: "#FFD700", mine: true }
      : k === "rejected"
        // reddedilen teklif takvimde değil: soluk + üstü çizili "Reddedildi" satırı (haftanın diğer işleri görünmeye devam eder)
        ? { iso: o.dateISO, t: tm, text: `Bu teklif · ${o.venue}${tm ? ` ${tm}` : ""}`, kind: "Reddedildi", c: "#FF5A6E", rej: true }
        : { iso: o.dateISO, t: tm, text: `Bu teklif · ${o.venue}${tm ? ` ${tm}` : ""}`, kind: "Teklif", c: "#8A8E97", mine: true });
    return list.sort((a, b) => `${a.iso} ${a.t}`.localeCompare(`${b.iso} ${b.t}`));
  }
  function drawWeek() {
    const list = weekEntries();
    const headEl = h("h2", { id: "dk-st-h-week", class: cls("ml") }, "TAKVİMİNDE O HAFTA");
    if (!list) { put(week, headEl, h("p", { class: cls("wempty") }, "Bu hafta başka sahnen yok.")); return; }
    put(week, headEl,
      h("ul", { class: cls("wl") }, ...list.map((w) => {
        const d = new Date(`${w.iso}T00:00`);
        return h("li", { class: cx(cls("wi"), w.mine && "is-mine", w.rej && "is-rej") },
          h("span", { class: cls("wd") }, `${DOW_UP[d.getDay()]} ${d.getDate()}`),
          h("span", { class: cls("wdot"), style: { background: w.c }, "aria-hidden": "true" }),
          h("span", { class: cls("wt"), title: w.text }, w.text),
          h("span", { class: cls("wk") }, w.kind));
      })),
      list.length === 1 && st.residencies != null && st.accepted != null ? h("p", { class: cls("wempty") }, "Bu hafta başka sahnen yok.") : null);
  }

  function drawVen() {
    const o = st.offer; const v = st.venue;
    const headEl = h("h2", { id: "dk-st-h-ven", class: cls("ml") }, "MEKAN BİLGİSİ");
    if (v === undefined) { put(ven, headEl, dkSkeleton({ h: 56, r: 10 }), dkSkeleton({ h: 64, r: 8 })); return; }
    const name = v?.displayName || o.venue;
    const photo = v?.photoURL || v?.bannerUrl || null;
    const meta = [v?.venueType || null, v?.city || v?.location?.city || null].filter(Boolean).join(" · ");
    const avg = Number(st.rating?.avg) > 0 ? Number(st.rating.avg).toFixed(1) : null;
    const cap = Number(v?.capacity) > 0 ? Number(v.capacity) : null;
    const thumb = photo ? h("img", { src: photo, alt: "", class: cls("vimg"), loading: "lazy", decoding: "async" }) : h("span", { class: cls("vimg is-ini"), "aria-hidden": "true" }, initials(name));
    if (photo) thumb.addEventListener("error", () => thumb.replaceWith(h("span", { class: cls("vimg is-ini"), "aria-hidden": "true" }, initials(name))), { once: true });
    const tiles = [
      h("div", { class: cls("tile") }, h("span", { class: cls("tl") }, "PUAN"),
        h("span", { class: cls("tv") }, svgRaw(I.star, { size: 14, fill: true, color: "#FF8A2A" }), avg ?? "—",
          avg && st.rating?.count ? h("span", { class: cls("tc") }, ` (${st.rating.count})`) : null)),
      cap ? h("div", { class: cls("tile") }, h("span", { class: cls("tl") }, "KAPASİTE"), h("span", { class: cls("tv") }, `${cap.toLocaleString("tr-TR")} kişi`)) : null,
    ].filter(Boolean);
    const link = st.mekanReady && o.venueId ? h("a", { href: `#/mekan/${encodeURIComponent(o.venueId)}`, class: cls("vlink") }, "Mekan profilini gör", svgRaw(I.arrow, { size: 14, sw: "2.2" })) : null;
    put(ven, headEl,
      h("div", { class: cls("vrow") }, thumb, h("span", { class: cls("vcol") }, h("span", { class: cls("vn") }, name), meta ? h("span", { class: cls("vm") }, meta) : null)),
      h("div", { class: cx(cls("tiles"), tiles.length === 1 && "is-one") }, ...tiles),
      link);
  }

  let respKey = "";
  function drawResp() {
    const o = st.offer; const k = statusOf(); const sc = S();
    // aynı durum yeniden çizilmez (anlık görüntü güncellemesi odağı/onay kutusunu sıfırlamasın)
    // ask/busy yalnız bekleyen durumda anlamlı (karar anlık görüntüsü yanıt bitmeden gelirse sonuç kutusu iki kez açılmasın)
    const key = [k, k === "pending" ? st.ask : "", k === "pending" ? st.busy : "", o.fee, o.venue, offerWhen(o)].join("|");
    if (key === respKey) return;
    respKey = key;
    const feeNum = /\d/.test(o.fee || "");
    put(respHead, 
      h("div", { class: cls("feerow") },
        h("span", { class: cx(cls("fee"), !feeNum && "is-none") }, o.fee),
        h("span", { class: cls("sbadge"), style: { color: sc.c, borderColor: rgba(sc.c, 0.4), background: rgba(sc.c, 0.08) } }, sc.label)),
      h("span", { class: cls("line") }, `${offerWhen(o)} · ${o.venue}`));
    const pending = k === "pending";
    bar.hidden = !(pending && !st.ask);
    barFee.textContent = o.fee;
    if (pending && !st.ask) {
      const acc = h("button", { type: "button", class: cx(cls("rbtn is-primary"), "dk-press"), disabled: st.busy }, svgRaw(I.okC, { size: 18, sw: "2.2" }), "Kabul Et");
      const rej = h("button", { type: "button", class: cx(cls("rbtn is-danger"), "dk-press"), disabled: st.busy }, svgRaw(I.xC, { size: 18, sw: "2.2" }), "Reddet");
      acc.addEventListener("click", () => ask("accept"));
      rej.addEventListener("click", () => ask("reject"));
      put(respState, h("div", { class: cx(cls("acts"), "dk-fade") }, acc, rej,
        h("p", { class: cls("note") }, "Kabul ettiğinde performans takvimine eklenir ve teklif listeden düşer.")));
    } else if (pending && st.ask) {
      const isAcc = st.ask === "accept";
      const cancel = h("button", { type: "button", class: cx(cls("cbtn is-outline"), "dk-press"), disabled: st.busy }, "İptal");
      const ok = h("button", { type: "button", class: cx(cls("cbtn"), isAcc ? "is-primary" : "is-dangersolid", "dk-press"), disabled: st.busy }, isAcc ? "Kabul Et" : "Reddet");
      cancel.addEventListener("click", () => { st.ask = null; drawResp(); focusAct(isAcc ? 0 : 1); });
      ok.addEventListener("click", () => confirm(st.ask));
      const box = h("div", { role: "alertdialog", "aria-labelledby": "dk-st-h-cf", "aria-describedby": "dk-st-cf-b", class: cx(cls("confirm"), isAcc ? "is-acc" : "is-rej", "dk-pop") },
        h("span", { id: "dk-st-h-cf", class: cls("cft") }, isAcc ? "Teklifi Kabul" : "Teklifi Reddet"),
        h("span", { id: "dk-st-cf-b", class: cls("cfb") }, `${o.venue} teklifini ${isAcc ? "kabul edeceksin" : "reddedeceksin"}. Emin misin?`),
        h("div", { class: cls("cfacts") }, cancel, ok));
      box.addEventListener("keydown", (e) => { if (e.key === "Escape" && !st.busy) { e.preventDefault(); st.ask = null; drawResp(); focusAct(isAcc ? 0 : 1); } });
      put(respState, box);
      requestAnimationFrame(() => { try { cancel.focus({ preventScroll: true }); } catch (_) {} });
    } else if (k === "accepted" || k === "rejected") {
      const isAcc = k === "accepted";
      put(respState, h("div", { class: cx(cls("result"), "dk-pop"), role: "status", style: { borderColor: rgba(sc.c, 0.4), background: rgba(sc.c, 0.08) } },
        h("span", { class: cls("rt"), style: { color: sc.c } }, svgRaw(isAcc ? I.check : I.x, { size: 18, sw: "2.2" }), isAcc ? "Teklifi kabul ettin" : "Teklifi reddettin"),
        h("span", { class: cls("rb") }, isAcc ? `Performans ${offerWhen(o)} olarak takvimine eklendi.` : `${o.venue} teklifi reddedildi. Mekan yeni bir teklif gönderebilir.`),
        h("div", { class: cls("racts") }, h("a", { href: "#/artist", class: cx(cls("lbtn"), "dk-press") }, "Ana sayfaya dön"))));
    } else {
      put(respState, h("div", { class: cls("racts") }, h("a", { href: "#/artist", class: cx(cls("lbtn"), "dk-press") }, "Ana sayfaya dön")));
    }
  }
  const focusAct = (i) => requestAnimationFrame(() => { try { respState.querySelectorAll("button")[i]?.focus({ preventScroll: true }); } catch (_) {} });
  function ask(action) {
    if (st.busy || statusOf() !== "pending") return;
    st.ask = action;
    drawResp();
  }
  async function confirm(action) {
    if (st.busy || !st.offer) return;
    const o = st.offer;
    const isAcc = action === "accept";
    st.busy = true; drawResp();
    try {
      await respondToOffer(o, action, meOf(s));
      rememberDecision(uid, o, isAcc ? "accepted" : "rejected");
      st.status = isAcc ? "accepted" : "rejected";
      dkToast(isAcc ? `${o.venue} teklifini kabul ettin — performans takvime eklendi` : `${o.venue} teklifi reddedildi`, { type: isAcc ? "ok" : "err" });
    } catch (_) {
      dkToast("İşlem tamamlanamadı. İnternet bağlantını kontrol et. (ERR-OFFERDETAIL-001)", { type: "err" });
    } finally {
      st.busy = false; st.ask = null;
      if (alive) {
        drawResp(); drawHero(); drawWeek();
        if (statusOf() === "pending") focusAct(isAcc ? 0 : 1);
        else requestAnimationFrame(() => { try { respState.querySelector("a")?.focus({ preventScroll: true }); } catch (_) {} });
      }
    }
  }
  const barAsk = (a) => {
    ask(a);
    try { resp.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); } catch (_) {}
  };
  barAcc.addEventListener("click", () => barAsk("accept"));
  barRej.addEventListener("click", () => barAsk("reject"));
  // hızlı yanıt çubuğu yalnız yanıt kartı görünür alanın dışındayken (aynı düğmeler iki kez görünmesin)
  if (typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((ents) => { ents.forEach((e) => bar.classList.toggle("is-off", e.isIntersecting)); }, { threshold: 0.35 });
    io.observe(resp);
    unsubs.push(() => io.disconnect());
  }

  function drawOthers() {
    const list = (st.offers || []).filter((o) => o.id !== id).sort((a, b) => offerSortKey(a).localeCompare(offerSortKey(b))).slice(0, 5);
    others.hidden = !list.length;
    put(others, 
      h("h2", { id: "dk-st-h-other", class: cls("ml others-h") }, "DİĞER BEKLEYEN TEKLİFLER"),
      ...list.map((o) => h("a", { href: `#/artist/teklif/${encodeURIComponent(o.id)}`, class: cx(cls("orow"), "dk-row") },
        h("span", { class: cls("ocol") }, h("span", { class: cls("ov") }, o.venue), h("span", { class: cls("ow") }, offerWhen(o))),
        h("span", { class: cls("ofee") }, o.fee),
        svgRaw(I.chev, { size: 14, sw: "2", color: "#8A8E97" }))));
  }

  function drawAll() {
    if (!st.offer) return;
    shell.setSubtitle(`Ana Sayfa / Gelen Teklifler / ${st.offer.venue}`);
    drawHero(); drawDet(); drawMsg(); drawWeek(); drawVen(); drawResp();
    if (st.offers) drawOthers();
  }
  // Bulunamadı durumu kalıcı değil: sonradan doküman gelirse (ör. önbellek → sunucu) ızgara geri takılır
  let emptyEl = null;
  function showNotFound() {
    if (st.notFound) return;
    st.notFound = true;
    bar.hidden = true;
    shell.setSubtitle("Ana Sayfa / Gelen Teklifler");
    // üstteki "Gelen tekliflere dön" bağlantısı sayfada kalır (legacy empty("alert-circle-outline", …) tonu); sayfa başlığı h1
    emptyEl = dkEmpty({ icon: "alertCircle", title: "Teklif bulunamadı", sub: "Bu teklif kaldırılmış olabilir.", ring: true, height: 320 });
    const t = emptyEl.querySelector(".dk-empty-t");
    if (t) { const h1 = h("h1", { class: t.className }, t.textContent); t.replaceWith(h1); }
    grid.replaceWith(emptyEl);
  }
  function restoreGrid() {
    if (!st.notFound) return;
    st.notFound = false;
    if (emptyEl?.isConnected) emptyEl.replaceWith(grid);
    emptyEl = null;
  }

  function loadVenue(venueId) {
    if (!venueId || st.venueFor === venueId) return;
    st.venueFor = venueId;
    userById(venueId).then((v) => {
      if (!alive) return;
      st.venue = v || null;
      if (v && Number(v.avgRating) > 0) st.rating = { avg: Number(v.avgRating), count: Number(v.reviewCount) || 0 };
      drawHero(); drawVen();
      if (!st.rating) {
        // denormalize puan yoksa: venue.js venueRating() ile aynı (overallRating ?? rating ortalaması)
        getVenueReviews(venueId).then((list) => {
          if (!alive) return;
          const rs = (list || []).map((r) => Number(r.overallRating ?? r.rating) || 0).filter((x) => x > 0);
          if (rs.length) { st.rating = { avg: rs.reduce((a, b) => a + b, 0) / rs.length, count: rs.length }; drawVen(); }
        }).catch(() => {});
      }
    }).catch(() => { if (!alive) return; st.venue = null; drawHero(); drawVen(); });
  }

  // ═════════ VERİ ═════════
  if (st.offer) drawAll();
  if (!id || !uid) showNotFound();
  else {
    try {
      unsubs.push(onSnapshot(doc(db, "invitations", id), (snap) => {
        if (!alive) return;
        if (!snap.exists()) {
          // önbellekten gelen "yok" kesin değil (çevrimdışı açılış / önbellek ıskası): iskelet ya da Panel'den gelen teklif kalır,
          // sunucu yanıtı beklenir. Yalnız sunucu "yok" derse bulunamadı.
          if (snap.metadata?.fromCache) return;
          showNotFound(); return;
        }
        restoreGrid();
        const x = snap.data() || {};
        st.offer = offerFromDoc(snap.id, x);
        // yerel karar anlık görüntüden önce gelebilir (yazım gecikmesi) → kararı koru
        if (!(st.status && st.status !== "pending" && (x.status ?? "pending") === "pending")) st.status = x.status ?? "pending";
        if (st.ask && st.status !== "pending") st.ask = null;
        drawAll();
        loadVenue(st.offer.venueId);
      }, () => { if (alive && !st.offer) showNotFound(); else if (alive && st.offer && !st.notFound) { drawAll(); } }));
    } catch (_) { showNotFound(); }
    if (st.offer?.venueId) loadVenue(st.offer.venueId);
    unsubs.push(listenArtistOffers(uid, (list) => {
      if (!alive) return;
      st.offers = list || [];
      cacheOffers(st.offers);
      shell.setBadge("home", st.offers.length);
      if (!st.notFound) drawOthers();
    }));
    unsubs.push(listenArtistResidencies(uid, (list) => { if (!alive) return; st.residencies = list || []; if (st.offer && !st.notFound) drawWeek(); }));
    unsubs.push(listenArtistAccepted(uid, (docs) => { if (!alive) return; st.accepted = docs || []; if (st.offer && !st.notFound) drawWeek(); }));
    routeReady("#/mekan/x").then((ok) => { if (!alive) return; st.mekanReady = !!ok; if (st.offer && !st.notFound && st.venue !== undefined) drawVen(); }).catch(() => {});
  }

  return {
    node: shell.node,
    destroy() {
      alive = false;
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
      // ≤768'e geçiş (tablet döndürme / pencere daraltma) bu sayfadayken: legacy mobilde #/artist/teklif/{id} rotası yok ("Yakında")
      // → legacy teklif listesine (#/artist, offerDetailModal oradan açılır) yönlendir. Doğrudan ≤768 açılış legacy artist.js işi.
      // SHARED-CANDIDATE: js/pages/artist.js renderTab'a 'teklif' dalı (spec §10: modal içeriği tam ekran ya da #/artist + modal).
      try {
        if (!isDesktop() && String(location.hash).split("?")[0] === ctx.base) {
          const at = ctx.base;
          setTimeout(() => { if (!isDesktop() && String(location.hash).split("?")[0] === at) location.replace("#/artist"); }, 0);
        }
      } catch (_) {}
    },
    // aynı kimlik + aynı profil → yerinde kal; profil değiştiyse (ad/foto) kabuk yeniden kurulsun
    onSession(ns) { return ns?.user?.uid === uid && JSON.stringify(ns.profile || {}) === profileKey; },
  };
}
