// WebOrgMekanSec — masaüstü görünümü (≥769 px). Registry anahtarı: orgMekan (#/organizer/mekan).
// Spec: specs/org-admin.md § WebOrgMekanSec (+ F1–F7). Artboard: design/WebOrgMekanSec.dc.html (sahibi notu YOK; kanvas web notu:
// "Harita önizlemesi gerçek harita; seçim pini vurgular ve konumdan rota çizer").
// CSS: css/dk-org-mekan-sec.css — sayfa kökü .dk-org-mekan-sec (kabuğun <main>'i); portal istek modalı .dk-org-mekan-sec-rq.
// ≤768: legacy organizer.js renderVenues / venueRow / requestModal aynen kalır (router bu modülü mobilde yüklemez).
//
// URL (helpers.writeQuery, replaceState): ?q=<metin> · &sehir=<şehir> · &kapasite=s|m|l (≤150 · 151–500 · >500) · &tur=<tür anahtarı>
//   · &sec=<venueId> (haritada seçili mekan). Geri/ileri ya da paylaşılan bağlantıda update(query) yerinde uygular.
//
// Legacy özellikleri — HEPSİ korundu:
//   · listVenues() (users userType == venue, approved !== false) · mekan adı (yedek "Mekan") + şehir (city || location.city)
//   · Mesaj: legacy requestChat({ otherId, otherName }) → #/organizer/mesaj (masaüstü WebPanelMesajlar bekleyen hedefi chat.js'ten
//     okur → ikisine de yazılır; WebOrgEtkinlikler ile aynı yöntem)
//   · İstek modalı: fotoğraf (opsiyonel; openImageCropper 16:9 → uploadImage), Etkinlik adı, Tarih, Saat, Açıklama (opsiyonel);
//     doğrulama "Etkinlik adı gir" → "Tarih ve saat gir"; data.js createVenueRequest(session.profile, venue, { title, date, time,
//     description, bannerUrl }) — legacy ile BİREBİR aynı yazım şekli (createOrgVenueRequest ile aynı şema; spec "aynı yük");
//     başarı "İstek gönderildi", hata "Gönderilemedi". Aynı mekana yeni istek legacy'deki gibi mümkün (bekleyen istekte seçili mekan
//     kartındaki "Yeni istek gönder" bağlantısı — spec Q7 önerisi).
//   · Durumlar: yükleniyor, "Yüklenemedi", "Mekan yok" / "Onaylı mekan bulunmuyor."
// Tasarım ekleri: filtreler (arama, şehir — yüklenen mekanlardan türetilir —, kapasite, tür), foto/puanlı 2 kolon mekan kartları,
//   gerçek Leaflet harita (OSM döşemeleri + koyu CSS filtresi — WebHarita ile aynı sağlayıcı/işlem), pin seçimi + ipucu + haritada
//   kaydırma, seçili mekan kartı, bekleyen istek hapı (organizerRequests → pending venueId), sayaçlar.
// Arka uç bağımlılıkları (yedekli): `venueType` alanı henüz yazılmıyor → hiçbir mekanda yoksa TÜR grubu + ayırıcı gizli, kart etiketi
//   "MEKAN", TÜR karosu "—". Kapasite yoksa kartta " · N kişi" yok, KAPASİTE "—", ipucunda kapasite yok. avgRating/reviewCount
//   (CF türevli) yoksa puan satırı gizli. Yol: ROUTING="none" → çizgi YOK; seçili kartta "Yol tarifi" derin bağlantısı + (konum izni
//   ZATEN verilmişse, istem açmadan) kuş uçuşu mesafe.
import { h, openImageCropper, loadLeaflet } from "../../ui.js";
import { session } from "../../store.js";
import { listVenues, organizerRequests, createVenueRequest, uploadImage } from "../../data.js";
import { requestChat as legacyRequestChat } from "../../pages/messages.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkButton, dkInput, dkTextarea, dkField, dkPageHero, dkModal, dkToast, dkSkeleton, dkLoginGate } from "../shared/ui.js";
import { fold, trUpper, sortTR, fmtRating, latLngOf, haversineKm, fmtKm, directionsUrl, isoDate, writeQuery } from "../shared/helpers.js";

const NS = "dk-org-mekan-sec";
const k = (s) => `${NS}-${s}`;
const CYAN = "#4ED8FF";
// Mekan yedek gradyanları (artboard GR, 4 amber çifti)
const GR = ["linear-gradient(135deg,#FF8A2A,#B45309)", "linear-gradient(135deg,#F59E0B,#FF5A6E)", "linear-gradient(135deg,#FF8A2A,#EC4899)", "linear-gradient(135deg,#FFD700,#FF8A2A)"];
const CAPS = [["", "Tümü"], ["s", "150’ye kadar"], ["m", "150–500"], ["l", "500+"]];
// Tür çipleri (artboard sırası). venueType görüntü değeri saklanır (app HomeScreen `venueType ?? 'Mekan'` okur) → büyük/küçük harf duyarsız eşleşme.
const TYPES = ["Gece kulübü", "Jazz kulübü", "Konser salonu", "Lounge", "Beach club"];
const typeKey = (t) => fold(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const typeTitle = (t) => { const s = String(t || "").trim(); return s ? s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1).toLocaleLowerCase("tr-TR") : ""; };

// Artboard SVG gövdeleri (WebOrgMekanSec inline <svg>'lerinden BİREBİR)
const P = {
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  chat: '<path d="M4 5h16v11H9l-5 4z"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3 14.5 21l-4.5-7-7-4.5z"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"></path><path d="M15 9h4a1 1 0 0 1 1 1v11"></path><path d="M3 21h18M8 8h3M8 12h3M8 16h3"></path>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"></path><path d="M9 4v14M15 6v14"></path>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.8"></circle><path d="m21 16-5-5-9 8"></path>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  nav: '<path d="M3 11 21 3l-8 18-2-8z"></path>',   // yol tarifi (icons.js navigation; tasarımda yok — ROUTING yedeği)
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1 0 9.5z"></path><path d="m4 4 16 16"></path>',
};
const ico = (name, size, { color = "currentColor", sw = "2", cls, fill } = {}) => svgRaw(P[name], { size, color, sw, cls, fill });
const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// leaflet.css bağlantısı yüklenene dek bekle (ui.loadLeaflet yalnız betiği bekler) — WebHarita ile aynı
function leafletCssReady(timeout = 4000) {
  const link = document.querySelector("link[data-leaflet]");
  if (!link || link.sheet) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { clearTimeout(t); link.removeEventListener("load", done); link.removeEventListener("error", done); res(); };
    const t = setTimeout(done, timeout);
    link.addEventListener("load", done); link.addEventListener("error", done);
  });
}

// Legacy kırpıcı (#modal-root, z 3000) modalın üstünde açılır; modalın belge düzeyi ESC/Tab tuzağı onu kapatmasın diye kırpıcı
// açıkken pencere düzeyinde (önce çalışır) ESC → İptal, Tab → kırpıcı içinde döngü (WebOrgEtkinlikler ile aynı yöntem).
function cropImage(file, opts) {
  const ov = () => document.querySelector("#modal-root .cr-overlay");
  const onKey = (e) => {
    const o = ov(); if (!o) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); o.querySelector(".btn-ghost")?.click(); return; }
    if (e.key === "Tab") {
      const f = [...o.querySelectorAll("button,input")].filter((x) => !x.disabled);
      if (!f.length) return;
      e.preventDefault(); e.stopPropagation();
      const i = f.indexOf(document.activeElement);
      f[i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  window.addEventListener("keydown", onKey, true);
  let tries = 0;
  const focusIt = () => { const o = ov(); if (o) { o.querySelector(".cr-actions .btn:not(.btn-ghost)")?.focus(); return; } if (++tries < 90) requestAnimationFrame(focusIt); };
  requestAnimationFrame(focusIt);
  return openImageCropper(file, opts).catch(() => null).finally(() => window.removeEventListener("keydown", onKey, true));
}

// Mekanla mesajlaş — legacy msgBtn: requestChat + #/organizer/mesaj. Bu görünüm yalnız masaüstünde (≥769) → hedef masaüstü sohbetin
// (chat.js) bekleyen hedefine yazılır; legacy messages.js `pending`'i yalnız chat.js yüklenemezse yedek olarak yazılır (masaüstü onu
// tüketemediği için her seferinde yazmak ≤768'e geçişte bayat bir sohbet açardı).
function openVenueChat(otherId, otherName) {
  if (!otherId) return;
  const t = { otherId, otherName: otherName || "Mekan" };
  const legacy = () => { try { legacyRequestChat(t); } catch (_) {} };
  import("../messages/chat.js").then((m) => { if (typeof m.requestChat === "function") m.requestChat(t); else legacy(); }).catch(legacy)
    .finally(() => { location.hash = "#/organizer/mesaj"; });
}

// Firestore mekan dokümanı → görünüm modeli
function toVM(v, i) {
  const name = v.displayName || "Mekan";
  const capN = Number(v.capacity);
  const avg = fmtRating(v.avgRating);
  const rc = Number(v.reviewCount) || 0;
  const type = typeof v.venueType === "string" && v.venueType.trim() ? v.venueType.trim() : null;
  return {
    id: v.id, raw: v, name,
    city: v.city || v.location?.city || "",
    district: v.district || v.location?.district || "",
    cap: isFinite(capN) && capN > 0 ? Math.round(capN) : null,
    rating: avg ? (rc ? `${avg} (${rc})` : avg) : null,
    photo: v.photoURL || null,
    ll: latLngOf(v),
    type, typeKey: type ? typeKey(type) : null,
    grad: GR[i % GR.length],
    ini: trUpper(name.trim().charAt(0) || "M"),
  };
}

export function orgMekanSecView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || s.profile?.id;
  const rm = reducedMotion();
  let alive = true;
  const unsubs = [];
  const st = {
    loading: true, error: false, all: [], pending: new Set(), pendingReqs: [],
    q: "", city: "", cap: "", type: "", sel: null, results: [],
  };
  let me = null;           // kullanıcı konumu (yalnız izin ZATEN verilmişse)
  let rqModal = null;

  const shell = panelShell({ role: "organizer", active: ctx.route?.nav || "mekan", title: "Mekan Seç", crumb: "Mekan Seç", ctx });
  const root = shell.content;
  root.classList.add(NS);

  // ══════════ HERO ══════════
  const hero = dkPageHero({
    eyebrow: "MEKAN SEÇ · ONAYLI MEKANLAR", title: "Etkinliğin için ", em: "doğru sahne", tail: ".",
    lead: "Onaylı mekanlara göz at, haritada konumlarını gör ve tek tıkla etkinlik isteği gönder. Mekan onaylayınca etkinlik aktif olur.",
    leadMax: 640, cls: k("hero"),
  });

  // ══════════ FİLTRELER ══════════
  const qIn = h("input", { type: "search", "aria-label": "Mekan ara", placeholder: "Mekan ara...", class: k("qin"), autocomplete: "off", spellcheck: "false" });
  const searchBox = h("label", { class: k("search") }, ico("search", 16), qIn);
  const citySel = h("select", { "aria-label": "Şehir", class: k("city") }, h("option", { value: "" }, "Tüm şehirler"));
  const cityBox = h("label", { class: k("citybox") }, ico("pin", 16, { color: CYAN }), h("span", { class: k("flabel") }, "ŞEHİR"), citySel);
  const countEl = h("span", { class: k("count"), "aria-live": "polite" });
  const resetBtn = h("button", { type: "button", class: cx(k("reset"), "dk-link") }, "Sıfırla");
  const chip = (label, key, onClick) => h("button", { type: "button", class: cx(k("chip"), "dk-press"), "aria-pressed": "false", dataset: { key }, onclick: onClick }, label);
  // çipler bir kez kurulur, seçim yerinde güncellenir (tıklanan çip odağını korur)
  const capChips = CAPS.map(([key, label]) => chip(label, key, () => { st.cap = key; apply(true); }));
  const capGroup = h("div", { role: "group", "aria-label": "Kapasite", class: k("group") }, h("span", { class: k("glabel") }, "KAPASİTE"), ...capChips);
  let typeSig = null;
  const typeGroup = h("div", { role: "group", "aria-label": "Mekan türü", class: k("group") });
  const typeDiv = h("span", { class: k("divider"), "aria-hidden": "true" });
  const frow2 = h("div", { class: k("frow2") }, capGroup, typeDiv, typeGroup);
  const filters = h("section", { class: k("filters"), "aria-label": "Filtreler" },
    h("div", { class: k("frow1") }, searchBox, cityBox, countEl, resetBtn),
    frow2);

  // ══════════ İKİ KOLON: kartlar | harita ══════════
  const grid = h("section", { class: k("grid"), "aria-label": "Mekanlar" });
  const mapTitle = h("span", {}, "Harita önizleme · Türkiye");
  const pinCount = h("span", { class: k("pins") });
  const mapEl = h("div", { class: k("map"), role: "region", "aria-label": "Mekanların Türkiye haritasındaki konumları" });
  const mapNote = h("div", { class: k("mapnote"), hidden: true });
  const mapCard = h("div", { class: k("mapcard") },
    h("div", { class: k("maphead") }, h("span", { class: k("maptitle") }, ico("map", 16, { color: CYAN }), mapTitle), pinCount),
    h("div", { class: k("mapbody") }, mapEl, mapNote));
  const selCard = h("div", { class: k("sel"), hidden: true, "aria-live": "polite" });
  const aside = h("aside", { class: k("aside"), "aria-label": "Harita önizlemesi" }, mapCard, selCard);
  root.append(hero, filters, h("div", { class: k("cols") }, grid, aside));

  // ══════════ FİLTRE DURUMU ══════════
  function readQuery(q) {
    st.q = q?.get("q") || "";
    st.city = q?.get("sehir") || "";
    const c = q?.get("kapasite") || "";
    st.cap = ["s", "m", "l"].includes(c) ? c : "";
    st.type = q?.get("tur") || "";
    const sec = q?.get("sec") || "";
    if (sec) st.sel = sec;
  }
  const writeFilters = () => writeQuery({ q: st.q.trim() || null, sehir: st.city || null, kapasite: st.cap || null, tur: st.type || null, sec: st.sel || null });
  // verideki tür anahtarları (TÜR çip grubu bunlardan kurulur); URL'deki bilinmeyen/bayat `tur` süzmez
  const typeKeys = () => { const ks = new Set(TYPES.map(typeKey)); let any = false; st.all.forEach((v) => { if (v.typeKey) { ks.add(v.typeKey); any = true; } }); return any ? ks : new Set(); };
  const capOk = (v) => !st.cap || (v.cap != null && ((st.cap === "s" && v.cap <= 150) || (st.cap === "m" && v.cap > 150 && v.cap <= 500) || (st.cap === "l" && v.cap > 500)));
  function compute() {
    const q = fold(st.q.trim());
    // TÜR grubu gizliyse (hiçbir mekanda venueType yok) ya da değer çiplerde yoksa: süzme yok + URL'den temizle (yüklendikten sonra)
    if (st.type && !st.loading && !st.error && !typeKeys().has(st.type)) { st.type = ""; writeQuery({ tur: null }); }
    st.results = st.all.filter((v) =>
      (!st.city || fold(v.city) === fold(st.city)) &&
      (!st.type || v.typeKey === st.type) &&
      capOk(v) &&
      (!q || fold([v.name, v.district, v.city].join(" ")).includes(q)));
  }
  const selVenue = () => st.all.find((v) => v.id === st.sel) || null;
  function ensureSel() {
    if (st.sel && selVenue()) return;
    const first = st.results.find((v) => v.ll) || st.results[0] || null;
    st.sel = first ? first.id : null;
  }
  const mapCity = () => {
    if (st.city) return st.city;
    const cs = [...new Set(st.results.map((v) => v.city).filter(Boolean))];
    return cs.length === 1 ? cs[0] : "Türkiye";
  };

  // ══════════ ÇİZİM ══════════
  function drawFilters() {
    if (document.activeElement !== qIn && qIn.value !== st.q) qIn.value = st.q;
    // şehir seçenekleri: yüklenen mekanlardan (city || location.city), tekil, TR sıralı; URL'deki şehir listede yoksa da gösterilir
    const cities = [...new Map(st.all.filter((v) => v.city).map((v) => [fold(v.city), v.city])).values()].sort(sortTR);
    if (st.city && !cities.some((c) => fold(c) === fold(st.city))) cities.push(st.city);
    const want = ["", ...cities].join("|");
    if (citySel.dataset.opts !== want) {
      citySel.replaceChildren(h("option", { value: "" }, "Tüm şehirler"), ...cities.map((c) => h("option", { value: c }, c)));
      citySel.dataset.opts = want;
    }
    const cur = cities.find((c) => fold(c) === fold(st.city)) || "";
    if (citySel.value !== cur) citySel.value = cur;
    capChips.forEach((b) => b.setAttribute("aria-pressed", b.dataset.key === st.cap ? "true" : "false"));
    // tür çipleri: sabit liste + verideki ek türler; hiçbir mekanda venueType yoksa grup gizli (spec §9)
    const present = new Map();
    st.all.forEach((v) => { if (v.type && !present.has(v.typeKey)) present.set(v.typeKey, typeTitle(v.type)); });
    const hasTypes = present.size > 0;
    typeGroup.hidden = !hasTypes; typeDiv.hidden = !hasTypes;
    const list = hasTypes ? TYPES.map((t) => [typeKey(t), t]) : [];
    present.forEach((label, key) => { if (!list.some(([kk]) => kk === key)) list.push([key, label]); });
    const sig = list.map(([kk]) => kk).join("|");
    if (sig !== typeSig) {
      typeSig = sig;
      typeGroup.replaceChildren(h("span", { class: k("glabel") }, "TÜR"),
        chip("Tümü", "", () => { st.type = ""; apply(true); }),
        ...list.map(([key, label]) => chip(label, key, () => { st.type = key; apply(true); })));
    }
    typeGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", (b.dataset.key || "") === st.type ? "true" : "false"));
    frow2.classList.toggle("has-extra", list.length > TYPES.length);
    countEl.textContent = st.loading ? "" : `${st.results.length} MEKAN`;
  }

  function pendingPill(size) {
    // artboard: ikon + düz metin (anonim esnek öğe) — dar kartta (292 px) metin sola hizalı iki satıra kendiliğinden kırılır
    return h("span", { class: cx(k("pill"), size === 44 && k("pill44")) }, ico("clock", 15, { color: "#FFD700" }), "İstek gönderildi · Onay bekliyor");
  }
  function msgLink(v) {
    return h("a", { href: "#/organizer/mesaj", class: cx(k("msg"), "dk-press"), "aria-label": `${v.name} ile mesajlaş`,
      onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; e.preventDefault(); openVenueChat(v.id, v.name); } }, ico("chat", 16));
  }
  function venueCard(v) {
    const on = v.id === st.sel;
    const media = h("button", { type: "button", class: k("media"), style: { background: v.grad }, "aria-label": `${v.name} mekanını haritada göster`, "aria-pressed": on ? "true" : "false",
      onclick: () => select(v.id, { pan: true }) },
    v.photo ? h("img", { src: v.photo, alt: "", loading: "lazy", decoding: "async", class: k("img") }) : h("span", { class: k("ini"), "aria-hidden": "true" }, v.ini),
    h("span", { class: k("scrim") }),
    h("span", { class: k("tag") }, v.type ? trUpper(v.type) : "MEKAN"),
    on ? h("span", { class: k("ontag") }, ico("pin", 11, { color: "#06070A", sw: "2.4" }), "HARİTADA") : null);
    const img = media.querySelector("img");
    if (img) img.addEventListener("error", () => img.replaceWith(h("span", { class: k("ini"), "aria-hidden": "true" }, v.ini)), { once: true });
    // artboard: şehir ve kapasite ayrı öğeler (gap 6 → "·" iki yanında 6 px); eksik olan atlanır
    const metaParts = [v.city ? h("span", {}, v.city) : null, v.cap != null ? h("span", {}, `${v.cap} kişi`) : null].filter(Boolean);
    const meta = metaParts.length === 2 ? [metaParts[0], " · ", metaParts[1]] : metaParts.length ? metaParts : ["—"];
    const pending = st.pending.has(v.id);
    return h("article", { class: cx(k("card"), "dk-card", on && "is-on"), dataset: { id: v.id } },
      media,
      h("div", { class: k("body") },
        h("div", { class: k("info") },
          h("h3", {}, v.name),
          h("span", { class: k("meta") }, ico("pin", 13, { color: CYAN }), ...meta),
          v.rating ? h("span", { class: k("meta") }, ico("star", 13, { color: "#FF8A2A", fill: true }), v.rating) : null),
        h("div", { class: k("acts") },
          msgLink(v),
          pending ? pendingPill(40)
            : h("button", { type: "button", class: cx(k("req"), "dk-press"), onclick: () => openRequest(v) }, ico("send", 15, { color: "#06070A", sw: "2.2" }), "İstek gönder"))));
  }
  function drawGrid() {
    grid.removeAttribute("aria-busy");
    if (st.loading) {
      grid.setAttribute("aria-busy", "true");
      grid.replaceChildren(...Array.from({ length: 6 }, () => h("div", { class: k("skcard"), "aria-hidden": "true" },
        dkSkeleton({ h: 132, r: 0 }), h("div", { class: k("skbody") }, dkSkeleton({ w: "65%", h: 17 }), dkSkeleton({ w: "45%", h: 13 }), dkSkeleton({ h: 40, r: 6 })))));
      return;
    }
    if (st.error) {
      grid.replaceChildren(h("div", { class: k("empty") }, ico("cloud", 30, { color: "#5E636D" }), h("span", { class: k("et") }, "Yüklenemedi"),
        h("span", { class: k("es") }, "Bağlantıyı kontrol edip yenile."),
        dkButton("Tekrar dene", { variant: "outline", size: 40, onClick: () => load() })));
      return;
    }
    if (!st.all.length) {
      grid.replaceChildren(h("div", { class: k("empty") }, ico("building", 30, { color: "#5E636D" }), h("span", { class: k("et") }, "Mekan yok"), h("span", { class: k("es") }, "Onaylı mekan bulunmuyor.")));
      return;
    }
    if (!st.results.length) {
      grid.replaceChildren(h("div", { class: k("empty") }, ico("building", 30, { color: "#5E636D" }), h("span", { class: k("et") }, "Kayıtlı mekan bulunamadı."), h("span", { class: k("es") }, "Filtreleri değiştir veya sıfırla.")));
      return;
    }
    grid.replaceChildren(...st.results.map(venueCard));
  }
  function statTile(label, value) { return h("div", { class: k("stile") }, h("span", { class: k("sl") }, label), h("span", { class: k("sv") }, value)); }
  function drawSel() {
    const v = selVenue();
    selCard.hidden = st.loading || st.error || !v;
    if (selCard.hidden) { selCard.replaceChildren(); return; }
    const pending = st.pending.has(v.id);
    const avatar = v.photo
      ? h("img", { src: v.photo, alt: "", class: cx(k("sav"), k("savimg")) })
      : h("span", { class: k("sav"), style: { background: v.grad }, "aria-hidden": "true" }, v.ini);
    const dist = v.ll && me ? haversineKm(me, v.ll) : null;
    const dirHref = v.ll ? directionsUrl(v.ll) : null;
    selCard.replaceChildren(...[
      h("div", { class: k("shead") }, avatar,
        h("div", { class: k("scol") }, h("span", { class: k("seb") }, "SEÇİLİ MEKAN"), h("span", { class: k("sname") }, v.name))),
      h("div", { class: k("stats") },
        statTile("TÜR", v.type ? typeTitle(v.type) : "—"),
        statTile("KAPASİTE", v.cap != null ? `${v.cap} kişi` : "—"),
        statTile("ŞEHİR", v.city || "—")),
      // ROUTING = "none": yol çizgisi yok → dış "Yol tarifi" bağlantısı + (izin zaten verilmişse) kuş uçuşu mesafe
      dirHref ? h("div", { class: k("route") },
        h("a", { href: dirHref, target: "_blank", rel: "noopener", class: cx(k("dir"), "dk-link") }, ico("nav", 14), "Yol tarifi"),
        dist != null ? h("span", { class: k("dist") }, `Kuş uçuşu ${fmtKm(dist)}`) : null) : null,
      pending
        ? h("div", { class: k("pend") }, pendingPill(44),
          h("button", { type: "button", class: cx(k("again"), "dk-link"), onclick: () => openRequest(v) }, "Yeni istek gönder"))
        : dkButton("Bu mekana istek gönder", { variant: "primary", size: 44, cls: k("cta"), icon: ico("send", 17, { color: "#06070A", sw: "2.2" }), onClick: () => openRequest(v) }),
      !v.ll ? h("span", { class: k("nopin") }, "Bu mekan henüz haritada konum pinlemedi.") : null,
    ].filter(Boolean));   // replaceChildren null'ı "null" metni olarak ekler (ui.js yalnız append'i yamalar)
  }
  function drawHead() {
    const city = mapCity();
    mapTitle.textContent = `Harita önizleme · ${city}`;
    mapEl.setAttribute("aria-label", `Mekanların ${city} haritasındaki konumları`);
    pinCount.textContent = st.loading || st.error ? "" : `${st.results.filter((v) => v.ll).length} PİN`;
  }
  function drawAll({ fit = false } = {}) {
    drawFilters(); drawGrid(); drawSel(); drawHead(); drawPins({ fit });
  }
  function apply(user) {
    compute();
    ensureSel();
    if (user) writeFilters();
    drawAll({ fit: true });
  }
  function select(id, { pan = false } = {}) {
    if (!id || id === st.sel) {
      if (pan) panTo(selVenue());
      return;
    }
    st.sel = id;
    writeQuery({ sec: id });
    // kartları yeniden kurmadan seçim durumunu güncelle (odak korunur)
    grid.querySelectorAll(`.${k("card")}`).forEach((c) => {
      const on = c.dataset.id === id;
      c.classList.toggle("is-on", on);
      const media = c.querySelector(`.${k("media")}`);
      media?.setAttribute("aria-pressed", on ? "true" : "false");
      const old = media?.querySelector(`.${k("ontag")}`);
      if (on && !old) media.append(h("span", { class: k("ontag") }, ico("pin", 11, { color: "#06070A", sw: "2.4" }), "HARİTADA"));
      if (!on && old) old.remove();
    });
    drawSel();
    drawPins({ fit: false });
    if (pan) panTo(selVenue());
  }

  // ══════════ HARİTA (Leaflet) ══════════
  let L = null, map = null, tipMk = null, ro = null;
  const markers = new Map();   // id → marker
  let mapReady = false;
  async function initMap() {
    try { L = await loadLeaflet(); await leafletCssReady(); }
    catch (_) { if (alive) { mapNote.hidden = false; mapNote.textContent = "Harita yüklenemedi."; } return; }
    if (!alive) return;
    // fadeAnimation kapalı: Leaflet karo solmasını Date ile hesaplar (sabit saatli ortamda karolar görünmez kalıyor) — WebHarita ile aynı
    map = L.map(mapEl, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, minZoom: 3, maxZoom: 18, zoomSnap: 0.5, center: [39.1, 35.2], zoom: 5,
      fadeAnimation: false, zoomAnimation: !rm, markerZoomAnimation: !rm, inertia: !rm });
    map.attributionControl.setPrefix(false);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    // Kırılım değişimi (ör. 480×560 yan kolon → ≤1023 tam genişlik 280 px şerit) haritayı büyükçe yeniden boyutlar → boyut belirgin
    // değişince (debounce) sonuçlar yeniden sığdırılır; küçük değişimlerde yalnız invalidateSize (kullanıcının kaydırması korunur).
    let last = null, fitT = null;
    ro = new ResizeObserver(() => {
      try { map?.invalidateSize({ pan: false }); } catch (_) {}
      const w = mapEl.clientWidth, hh = mapEl.clientHeight;
      if (!w || !hh) return;
      const big = last && (Math.abs(w - last.w) > 40 || Math.abs(hh - last.h) > 40);
      last = { w, h: hh };
      if (!big) return;
      clearTimeout(fitT);
      fitT = setTimeout(() => { if (alive && map) fitPins(st.loading || st.error ? [] : st.results.filter((v) => v.ll), false); }, 160);
    });
    ro.observe(mapEl);
    unsubs.push(() => clearTimeout(fitT));
    mapReady = true;
    drawPins({ fit: true, animate: false });
  }
  function pinEl(on) {
    return h("span", { class: cx(k("pin"), on && "is-on") }, ico("building", 11, { color: "#06070A", sw: "2.4" }));
  }
  function drawPins({ fit = false, animate = true } = {}) {
    if (!mapReady || !map) return;
    const list = st.loading || st.error ? [] : st.results.filter((v) => v.ll);
    const keep = new Set(list.map((v) => v.id));
    markers.forEach((m, id) => { if (!keep.has(id)) { m.remove(); markers.delete(id); } });
    list.forEach((v) => {
      const on = v.id === st.sel;
      let m = markers.get(v.id);
      if (!m) {
        m = L.marker([v.ll.lat, v.ll.lng], {
          icon: L.divIcon({ className: k("mk"), html: pinEl(on), iconSize: [44, 44], iconAnchor: [22, 22] }),
          keyboard: true, riseOnHover: true,
        }).addTo(map);
        m.on("click", () => select(v.id, { pan: true }));
        // Leaflet `keyboard:true` pini odaklanabilir + role=button yapar ama Enter/Space'te "click" üretmez (yalnız bağlı popup açar) →
        // etkinleştirme + ok tuşlarıyla pinler arasında gezinme (dolaşan tabindex: sekme sırasında tek durak) burada.
        m.getElement()?.addEventListener("keydown", (e) => onPinKey(e, v.id));
        markers.set(v.id, m);
      }
      const el = m.getElement();
      if (el) {
        el.setAttribute("aria-label", v.cap != null ? `${v.name}, ${v.cap} kişi` : v.name);
        el.setAttribute("aria-pressed", on ? "true" : "false");
        el.querySelector(`.${k("pin")}`)?.classList.toggle("is-on", on);
      }
      m.setZIndexOffset(on ? 1000 : 0);
    });
    pinOrder = list.map((v) => v.id);
    // dolaşan tabindex: seçili pin (yoksa ilk pin) sekme durağı; odaktaki pin durağını korur
    const focusedId = [...markers.entries()].find(([, mm]) => mm.getElement() === document.activeElement)?.[0];
    const stopId = focusedId || (keep.has(st.sel) ? st.sel : pinOrder[0]);
    markers.forEach((mm, id) => { const el = mm.getElement(); if (el) el.tabIndex = id === stopId ? 0 : -1; });
    // seçili pin ipucu (artboard: pinin +18 px sağında, −16 px üstünde; 32 px yüksek)
    tipMk?.remove(); tipMk = null;
    const sv = selVenue();
    if (sv && sv.ll && keep.has(sv.id)) {
      const tip = h("span", { class: cx(k("tip"), "dk-pop") }, sv.name, sv.cap != null ? h("span", { class: k("tipcap") }, `${sv.cap} KİŞİ`) : null);
      tipMk = L.marker([sv.ll.lat, sv.ll.lng], { icon: L.divIcon({ className: k("tipmk"), html: tip, iconSize: [0, 0], iconAnchor: [-18, 16] }), interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(map);
      tipMk.getElement()?.setAttribute("aria-hidden", "true");
    }
    if (fit) fitPins(list, animate && !rm);
  }
  let pinOrder = [];
  function onPinKey(e, id) {
    const i = pinOrder.indexOf(id);
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault(); e.stopPropagation();
      select(id, { pan: true });
      return;
    }
    const nav = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" }[e.key];
    if (nav == null || i < 0 || !pinOrder.length) return;
    e.preventDefault(); e.stopPropagation();
    const j = nav === "first" ? 0 : nav === "last" ? pinOrder.length - 1 : (i + nav + pinOrder.length) % pinOrder.length;
    const next = markers.get(pinOrder[j])?.getElement();
    if (!next) return;
    markers.forEach((mm) => { const el = mm.getElement(); if (el) el.tabIndex = -1; });
    next.tabIndex = 0;
    next.focus({ preventScroll: true });
  }
  function fitPins(list, animate) {
    if (!map) return;
    try {
      if (!list.length) { map.setView([39.1, 35.2], 5, { animate: false }); return; }
      if (list.length === 1) { map.setView([list[0].ll.lat, list[0].ll.lng], 13, { animate }); return; }
      map.fitBounds(L.latLngBounds(list.map((v) => [v.ll.lat, v.ll.lng])), { padding: [48, 48], maxZoom: 14, animate });
    } catch (_) {}
  }
  function panTo(v) {
    if (!map || !v?.ll) return;
    try { map.panTo([v.ll.lat, v.ll.lng], { animate: !rm, duration: 0.6 }); } catch (_) {}
  }

  // ══════════ İSTEK MODALI ══════════
  function openRequest(v) {
    if (dkLoginGate("Mekana istek göndermek")) return;
    if (rqModal) return;
    // gönderimden sonra kartlar yeniden kurulur → tetikleyici kaybolur; odak aynı yerdeki kalıcı öğeye taşınır
    const fromSel = selCard.contains(document.activeElement);
    if (v.id !== st.sel) select(v.id, { pan: true });
    let blob = null, blobUrl = null;
    const preview = h("span", { class: k("ppv"), hidden: true });
    const pickLabel = h("span", { class: k("plabel") }, ico("image", 22, { color: "#8A8E97" }), "Etkinlik fotoğrafı (opsiyonel)");
    const fileIn = h("input", { type: "file", accept: "image/*", class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
    const pick = h("button", { type: "button", class: cx(k("pick"), "dk-press") }, preview, pickLabel);
    const unpick = h("button", { type: "button", class: cx(k("unpick"), "dk-press"), "aria-label": "Fotoğrafı kaldır", hidden: true }, ico("x", 16));
    const drawPhoto = () => {
      preview.hidden = !blobUrl; unpick.hidden = !blobUrl; pick.classList.toggle("has-img", !!blobUrl);
      preview.replaceChildren(blobUrl ? h("img", { src: blobUrl, alt: "Seçilen etkinlik fotoğrafı" }) : "");
      pick.setAttribute("aria-label", blobUrl ? "Etkinlik fotoğrafını değiştir" : "Etkinlik fotoğrafı ekle (opsiyonel)");
    };
    pick.addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files && fileIn.files[0]; fileIn.value = "";
      if (!f) return;
      const b = await cropImage(f, { aspect: 16 / 9 });
      if (!pick.isConnected) return;
      if (b) { if (blobUrl) URL.revokeObjectURL(blobUrl); blob = b; blobUrl = URL.createObjectURL(b); drawPhoto(); }
      // kırpıcı (#modal-root) kapanınca odak gövdeye düşer → modal içindeki seçiciye geri
      requestAnimationFrame(() => { if (pick.isConnected) pick.focus({ preventScroll: true }); });
    });
    unpick.addEventListener("click", () => { if (blobUrl) URL.revokeObjectURL(blobUrl); blob = null; blobUrl = null; drawPhoto(); pick.focus(); });
    drawPhoto();
    const tIn = dkInput({ placeholder: "Örn. Yaz Festivali", autocomplete: "off" });
    const dIn = dkInput({ type: "date", attrs: { min: isoDate(Date.now()) } });
    const hIn = dkInput({ type: "time" });
    const xIn = dkTextarea({ rows: 3, placeholder: "…" });
    let busy = false;
    const send = async () => {
      if (busy) return false;
      const f = { title: tIn.value.trim(), date: dIn.value.trim(), time: hIn.value.trim(), description: xIn.value.trim() };
      if (!f.title) { m.setError("Etkinlik adı gir"); tIn.focus(); return false; }
      if (!f.date || !f.time) { m.setError("Tarih ve saat gir"); (f.date ? hIn : dIn).focus(); return false; }
      busy = true;
      try {
        if (blob) f.bannerUrl = await uploadImage(blob, uid);
        await createVenueRequest(session.profile || s.profile, v.raw, f);
        dkToast("İstek gönderildi");
        st.pending.add(v.id);
        st.pendingReqs.push({ venueId: v.id, status: "pending" });
        shell.setBadge("etkinlik", st.pendingReqs.filter((r) => r.status === "pending").length);
        m.close("sent");
        if (alive) {
          drawGrid(); drawSel();
          // tetikleyici ("İstek gönder" / seçili kart CTA'sı) yeniden kurulumla gitti → seçili kartın "Yeni istek gönder"i ya da aynı kartın görseli
          const card = [...grid.querySelectorAll(`.${k("card")}`)].find((c) => c.dataset.id === v.id);
          const target = (fromSel && selCard.querySelector(`.${k("again")}`)) || card?.querySelector(`.${k("media")}`) || selCard.querySelector(`.${k("again")}`);
          try { target?.focus(); } catch (_) {}
        }
      } catch (_) {
        dkToast("Gönderilemedi", { type: "err" });
      } finally { busy = false; }
      return false;
    };
    const m = dkModal({
      variant: "form", size: 562, align: "top", top: 120, cls: k("rq"),   // artboard: width 560 + 1px kenar (content-box)
      title: `${v.name} — Etkinlik İsteği`,
      body: [
        h("div", { class: k("photo") }, pick, unpick, fileIn),
        dkField({ label: "ETKİNLİK ADI", input: tIn }).node,
        h("div", { class: k("two") }, dkField({ label: "TARİH", input: dIn }).node, dkField({ label: "SAAT", input: hIn }).node),
        // artboard: <textarea> blok kap içinde inline-block → satır kutusu altında ~5 px; aynı ölçü için sarmalayıcı
        dkField({ label: "AÇIKLAMA (OPSİYONEL)", input: h("div", { class: k("tawrap") }, xIn) }).node,
      ],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "İstek Gönder", variant: "primary", icon: ico("send", 17, { color: "#06070A", sw: "2.2" }), keepOpen: true, busyLabel: "Gönderiliyor…", onClick: send },
      ],
      initialFocus: tIn,
      onClose: () => { rqModal = null; if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} } },
    });
    rqModal = m;
    // SHARED-CANDIDATE: dkModal "form" başlığına eyebrow seçeneği yok → artboard başlık şeridi (76 px: "ETKİNLİK İSTEĞİ" + h2) yerel yama
    const head = m.dialog.querySelector(".dk-mdl-head");
    const t = head?.querySelector(".dk-mdl-t");
    if (head && t) { const col = h("div", { class: k("mhcol") }, h("span", { class: k("meb") }, "ETKİNLİK İSTEĞİ")); head.insertBefore(col, t); col.append(t); }
    [tIn, dIn, hIn].forEach((x) => { x.addEventListener("input", () => m.setError("")); x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } }); });
    xIn.addEventListener("input", () => m.setError(""));
  }

  // ══════════ OLAYLAR ══════════
  let qT = null;
  qIn.addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => { st.q = qIn.value; apply(true); }, 160); });
  qIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); clearTimeout(qT); st.q = qIn.value; apply(true); } });
  unsubs.push(() => clearTimeout(qT));
  citySel.addEventListener("change", () => { st.city = citySel.value; apply(true); });
  resetBtn.addEventListener("click", () => { st.q = ""; st.city = ""; st.cap = ""; st.type = ""; qIn.value = ""; apply(true); });

  // ══════════ VERİ ══════════
  async function load() {
    st.loading = true; st.error = false;
    drawAll();
    try {
      const [venues, reqs] = await Promise.all([listVenues(), organizerRequests(uid).catch(() => [])]);
      if (!alive) return;
      st.all = (venues || []).map(toVM);
      st.pendingReqs = (reqs || []).map((r) => ({ venueId: r.venueId, status: r.status }));
      st.pending = new Set(st.pendingReqs.filter((r) => r.status === "pending").map((r) => r.venueId));
    } catch (_) {
      if (!alive) return;
      st.error = true;
    }
    st.loading = false;
    compute(); ensureSel();
    drawAll({ fit: true });
  }

  // konum yalnız izin ZATEN verilmişse (istem açılmaz) → seçili kartta kuş uçuşu mesafe
  try {
    navigator.permissions?.query({ name: "geolocation" }).then((p) => {
      if (!alive || p.state !== "granted") return;
      navigator.geolocation.getCurrentPosition((pos) => { if (!alive) return; me = { lat: pos.coords.latitude, lng: pos.coords.longitude }; drawSel(); }, () => {}, { maximumAge: 600000, timeout: 8000 });
    }).catch(() => {});
  } catch (_) {}

  readQuery(ctx.query);
  load();
  initMap();

  return {
    node: shell.node,
    destroy() {
      alive = false;
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      try { rqModal?.close("route"); } catch (_) {}
      try { ro?.disconnect(); } catch (_) {}
      try { map?.remove(); } catch (_) {}
      map = null; markers.clear();
      shell.destroy();
    },
    update(query) {
      st.sel = null;
      readQuery(query);
      apply(false);
    },
    // Aynı kimlik → yerinde kal (harita/filtreler korunur)
    onSession(ns) { return ns?.user?.uid === uid; },
  };
}
