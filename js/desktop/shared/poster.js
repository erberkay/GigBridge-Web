// DİKEY AFİŞ (Instagram ~9:16) — uygulama feat/dikey-afis paritesi: PosterSwipeRow (Keşfet "Bu Hafta"), PosterViewer (EventDetail
// "Afişi gör") + etkinlik oluştur/düzenle yükleyicisi. Masaüstü (≥769) ve legacy mobil (≤768) ORTAK; stiller css/poster.css (.gb-pst-*,
// kendi kendine yüklenir — ensurePosterCss).
// Veri: events/{id}.posterUrl (tam boy, uzun kenar ≤1600 JPEG) + posterThumbUrl (≈540 px genişlik; kartta bu kullanılır) — isteğe bağlı.
// Storage: banner yükleyicisiyle (data.uploadImage) aynı kural/yol ailesi → event_banners/{ownerUid}/{ts}_poster.jpg + _poster_t.jpg
//   (storage.rules: yazan = ownerUid, < 8 MB, image/*). Organizatör isteği (venueRequests) aynı alanları taşır; mekan kabul edince
//   etkinliğe kopyalanır (data.acceptOrgRequest).
import { h } from "../../ui.js";
import { ensureCss } from "../css.js";
import { eventStartMs } from "../../data.js";
import { storage, ref, uploadBytes, getDownloadURL, deleteObject } from "../../firebase.js";

export const POSTER_CSS = "css/poster.css";
export const ensurePosterCss = () => ensureCss(POSTER_CSS);
/** Afiş kartı oranı (genişlik / yükseklik) — uygulama POSTER_RATIO; CSS'te --gb-pst-ratio */
export const POSTER_RATIO = 9 / 16;
const MON = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];
const p2 = (n) => String(n).padStart(2, "0");
const str = (v) => (typeof v === "string" ? v.trim() : "");
const svg = (body, size = 18, sw = "1.9") => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", sw);
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = body;
  return s;
};
const I = {
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"></rect><circle cx="8.5" cy="9.5" r="1.8"></circle><path d="m21 16-5-5-9 8.5"></path>',
  chev: '<path d="m9 6 6 6-6 6"></path>',
  poster: '<rect x="6" y="2.5" width="12" height="19" rx="2"></rect><path d="M9 16h6M9 18.5h4"></path><path d="m6 12 3.5-3.5L13 12l2-2 3 3"></path>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"></path><path d="M4 16v3a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3"></path>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"></path>',
};

// firestore.rules posterFieldOk ile BİREBİR (uygulama src/utils/posters.ts POSTER_URL_RE; data.js posterFields kopyası): Firebase Storage
// indirme URL'i, yalnız event_banners/{uid}/… klasörü, ≤2000 karakter (yerel emülatör adresi geliştirme için). Kural değişirse üçü birlikte.
export const POSTER_URL_RE = /^(https:\/\/firebasestorage\.googleapis\.com|http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2):[0-9]+)\/v0\/b\/[^/]+\/o\/event_banners%2F[^/?%]+%2F[^/?]+\?.*$/;
export const okPosterUrl = (v) => (typeof v === "string" && v.length <= 2000 && POSTER_URL_RE.test(v) ? v : null);
/** İndirme URL'inden Storage sahibi: …/o/event_banners%2F{uid}%2F… → uid (uygulama posterOwnerUid) */
export function posterOwnerUid(url) {
  if (!url) return null;
  try { const m = decodeURIComponent(url).match(/\/o\/event_banners\/([^/?]+)\//); return m ? m[1] : null; } catch (_) { return null; }
}
/** Afiş dosyalarını sil (best-effort; Storage kuralı yalnız kendi klasörüne izin verir → başkasınınki hiç denenmez) */
export async function deletePosterFiles(urls, selfUid) {
  const list = [...new Set((urls || []).filter(Boolean))].filter((u) => !selfUid || posterOwnerUid(u) === selfUid);
  await Promise.all(list.map((u) => deleteObject(ref(storage, u)).catch(() => {})));
}

// ── Form metinleri (Berkay 13 Eki: iki ayrı tasarım — yatay kapak "Bu Gece"/etkinlik sayfası, dikey afiş "Bu Hafta") ──
export const COVER_LABEL = "YATAY KAPAK (16:9)";
export const COVER_SUB = "Bu Gece ve etkinlik sayfasında görünür.";
export const POSTER_LABEL = "DİKEY AFİŞ (9:16, INSTAGRAM)";
export const POSTER_SUB = "Bu Hafta'da görünür. Kırpılmaz — Instagram için hazırladığın afişi olduğu gibi yükle.";
export const DUAL_HINT = "En iyi görünüm için iki ayrı tasarım yükle; yalnız birini yüklersen diğer yerde otomatik uyarlanır.";

/** YATAY YUVA GERİ DÖNÜŞÜ (hero / karusel / etkinlik başlığı / etkinlik kartı): bannerUrl YOK ama dikey afiş VARSA afiş cover ile
 *  zoomlanmaz — bulanık + karartılmış afiş zemini, ortada TAM afiş (contain). Afiş yoksa null (çağıran kendi yer tutucusunu çizer).
 *  Grid yığını + satır içi stiller: CSS dosyası beklemez; konum/boyut çağıranın sınıfından (cls) gelir (ör. "dk-ec-img").
 *  full: tam boy afiş (detay başlığı / büyük hero) · aksi hâlde küçük kopya. onError: ön plan görseli yüklenemezse. */
export function posterBackdrop(e, { cls = "", full = false, alt = "", onError } = {}) {
  const big = okPosterUrl(e?.posterUrl), small = big ? okPosterUrl(e?.posterThumbUrl) : null;
  const fg = full ? big : (small || big);
  if (!fg) return null;
  const st = (o) => ({ gridArea: "1 / 1", position: "relative", top: "auto", left: "auto", width: "100%", height: "100%", minWidth: "0", minHeight: "0", display: "block", ...o });
  const bg = h("img", { src: small || fg, alt: "", decoding: "async", loading: "lazy", "aria-hidden": "true",
    style: st({ objectFit: "cover", filter: "blur(22px) saturate(1.1)", transform: "scale(1.25)" }) });
  const dim = h("span", { "aria-hidden": "true", style: st({ background: "rgba(6,7,10,0.5)" }) });
  const img = h("img", { src: fg, alt, decoding: "async", style: st({ objectFit: "contain", transform: "none", animation: "none" }) });
  if (onError) img.addEventListener("error", onError, { once: true });
  return h("span", { class: ["gb-pst-fb", cls].filter(Boolean).join(" "), "aria-hidden": alt ? null : "true",
    style: { display: "grid", overflow: "hidden", background: "#06070A", animation: "none" } }, bg, dim, img);
}
/** Yatay yuvada gösterilecek görsel: bannerUrl (aynen) — yoksa yukarıdaki afiş geri dönüşü çağrılmalı */
export const hasBanner = (e) => !!(e && !e.bannerCleaned && str(e.bannerUrl));

/** Afiş alanları var mı (posterUrl zorunlu; thumb isteğe bağlı) */
export const hasPoster = (e) => !!str(e?.posterUrl);
const isToday = (ms, now = Date.now()) => { const a = new Date(ms), b = new Date(now); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };

/** "13 EKİ · 23:00" (uygulama posterDateChip) — saat startTime'dan; yoksa başlangıç anından (00:00 = saatsiz kayıt → yazılmaz) */
export function posterDateChip(e) {
  const ms = eventStartMs(e);
  let time = /^\d{1,2}:\d{2}/.test(str(e?.startTime)) ? str(e.startTime).slice(0, 5) : "";
  if (!time && ms != null) { const d = new Date(ms); const t = `${p2(d.getHours())}:${p2(d.getMinutes())}`; if (t !== "00:00") time = t; }
  if (ms == null) return [str(e?.date).toLocaleUpperCase("tr-TR"), time].filter(Boolean).join(" · ");
  const d = new Date(ms);
  return [`${d.getDate()} ${MON[d.getMonth()]}`, time].filter(Boolean).join(" · ");
}

/** Bu Hafta seçimi: "Bu Gece / öne çıkan" alanında zaten görünen BU GECEKİ etkinlikler satırdan çıkar — ama geriye 2'den az kalacaksa
 *  çıkarılmaz (satır boş/tek kartlı görünmesin). week: tarih sırasıyla bu haftanın etkinlikleri · featured: öne çıkan alanın listesi. */
export function pickWeekPosters(week, featured = [], { now = Date.now(), max = 10 } = {}) {
  const fid = new Set((featured || []).map((e) => e?.id).filter(Boolean));
  const dup = (e) => { const ms = eventStartMs(e); return fid.has(e.id) && ms != null && isToday(ms, now); };
  const rest = week.filter((e) => !dup(e));
  return (rest.length >= 2 ? rest : week).slice(0, max);
}

// ══════════════════════════════════════════════════════════════════════
// KART + SATIR (uygulama PosterSwipeRow)
// ══════════════════════════════════════════════════════════════════════
/** Dikey afiş kartı. posterThumbUrl/posterUrl → kapla (cover). Yoksa bulanık + karartılmış banner zemini, ortada kırpılmamış 16:9
 *  banner; o da yoksa koyu gradyan. Altta gradyan + "13 EKİ · 23:00" çipi + başlık + "Mekan · İlçe". */
export function posterCard(e, { href } = {}) {
  ensurePosterCss();
  const title = str(e?.title) || "Etkinlik";
  const chip = posterDateChip(e);
  const sub = [str(e?.venueName), str(e?.district) || str(e?.city)].filter(Boolean).join(" · ");
  const banner = e?.bannerCleaned ? "" : str(e?.bannerUrl);
  const media = h("span", { class: "gb-pst-media", "aria-hidden": "true" });
  const fallback = () => {
    if (!banner) { media.replaceChildren(h("span", { class: "gb-pst-grad" })); return; }
    const bg = h("img", { class: "gb-pst-blur", src: banner, alt: "", loading: "lazy", decoding: "async" });
    const mid = h("img", { class: "gb-pst-mid", src: banner, alt: "", loading: "lazy", decoding: "async" });
    mid.addEventListener("error", () => media.replaceChildren(h("span", { class: "gb-pst-grad" })), { once: true });
    media.replaceChildren(bg, h("span", { class: "gb-pst-dim" }), mid);
  };
  const pu = str(e?.posterThumbUrl) || str(e?.posterUrl);
  if (pu) {
    const img = h("img", { class: "gb-pst-img", src: pu, alt: "", loading: "lazy", decoding: "async" });
    // küçük görsel düşerse tam boy afiş, o da düşerse banner geri dönüşü
    img.addEventListener("error", () => {
      const full = str(e?.posterUrl);
      if (full && img.src !== full && !img.dataset.retried) { img.dataset.retried = "1"; img.src = full; return; }
      fallback();
    });
    media.append(img);
  } else fallback();
  return h("a", { class: "gb-pst-card", href: href || null, "aria-label": [title, chip, sub].filter(Boolean).join(", ") },
    media,
    h("span", { class: "gb-pst-shade", "aria-hidden": "true" }),
    h("span", { class: "gb-pst-meta", "aria-hidden": "true" },
      chip ? h("span", { class: "gb-pst-chip" }, chip) : null,
      h("span", { class: "gb-pst-title" }, title),
      sub ? h("span", { class: "gb-pst-sub" }, sub) : null));
}

/** Yatay kaydırmalı afiş satırı (scroll-snap; sonraki kartın kenarı görünür). Gerçek etkinlik 3'ten azsa uygulamadaki gibi yer tutucu
 *  kartlar eklenir (YAKINDA + TÜM ETKİNLİKLER). Dönüş: { node, track, page(dir), onState(cb) } — masaüstü ok düğmeleri page()/onState kullanır. */
export function posterRow(events, { hrefOf = (e) => "#/etkinlik/" + encodeURIComponent(e.id), seeAllHref = null, onSeeAll = null, label = "Bu haftanın afişleri", cls = "", dots = false } = {}) {
  ensurePosterCss();
  const items = events.map((e) => posterCard(e, { href: hrefOf(e) }));
  if (items.length < 3) {
    if (items.length < 2) items.push(h("div", { class: "gb-pst-card is-filler", role: "img", "aria-label": "Yakında yeni afişler" },
      h("span", { class: "gb-pst-fill-ic" }, svg(I.image, 20, "1.8")),
      h("span", { class: "gb-pst-meta" }, h("span", { class: "gb-pst-chip is-ghost" }, "YAKINDA"),
        h("span", { class: "gb-pst-title" }, "Yeni afişler yolda"), h("span", { class: "gb-pst-sub is-wrap" }, "Mekanlar bu haftanın gecelerini ekliyor"))));
    const allKids = [h("span", { class: "gb-pst-all-c" }, svg(I.chev, 20, "2")), h("span", { class: "gb-pst-all-t" }, "TÜM ETKİNLİKLER"), h("span", { class: "gb-pst-all-s" }, "Yaklaşan tüm geceler")];
    items.push(seeAllHref ? h("a", { class: "gb-pst-card is-filler is-all", href: seeAllHref }, ...allKids)
      : h("button", { type: "button", class: "gb-pst-card is-filler is-all", onclick: () => onSeeAll?.() }, ...allKids));
  }
  const track = h("ul", { class: ["gb-pst-track", cls].filter(Boolean).join(" "), "aria-label": label }, ...items.map((el) => h("li", { class: "gb-pst-li" }, el)));
  const subs = [];
  // Sayfa noktaları (uygulama PosterSwipeRow): sayfa = gerçekte ulaşılabilen yapışma konumu (son kartlar ekrana birlikte sığar →
  // son konum kırpılır); etkin nokta uzun + pembe. Yalnız mobil (dots: true); tek sayfada gizli.
  const dotsEl = dots ? h("div", { class: "gb-pst-dots", role: "img" }) : null;
  let dotN = -1, dotI = -1;
  const paintDots = () => {
    if (!dotsEl) return;
    const li = track.querySelector(".gb-pst-li");
    const gap = parseFloat(getComputedStyle(track).columnGap) || 12;
    const step = li ? li.getBoundingClientRect().width + gap : 0;
    const maxX = Math.max(0, track.scrollWidth - track.clientWidth);
    const offs = [];
    if (step > 0) for (let i = 0; i < track.children.length; i++) { const x = Math.min(i * step, maxX); if (!offs.length || x - offs[offs.length - 1] > 1) offs.push(x); }
    let best = 0;
    offs.forEach((x, i) => { if (Math.abs(x - track.scrollLeft) < Math.abs(offs[best] - track.scrollLeft)) best = i; });
    if (offs.length !== dotN) { dotN = offs.length; dotsEl.replaceChildren(...offs.map(() => h("span", { class: "gb-pst-dot" }))); dotI = -1; }
    dotsEl.hidden = offs.length < 2;
    if (best !== dotI) { dotI = best; [...dotsEl.children].forEach((d, i) => d.classList.toggle("is-on", i === best)); dotsEl.setAttribute("aria-label", `Sayfa ${best + 1} / ${offs.length}`); }
  };
  const state = () => {
    const max = track.scrollWidth - track.clientWidth;
    subs.forEach((f) => f(track.scrollLeft <= 2, track.scrollLeft >= max - 2));
    paintDots();
  };
  let raf = 0;
  track.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; state(); }); }, { passive: true });
  if (typeof ResizeObserver === "function") new ResizeObserver(state).observe(track);
  const reduce = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
  if (dotsEl) requestAnimationFrame(state);
  return {
    node: dotsEl ? h("div", { class: "gb-pst-wrap" }, track, dotsEl) : track, track,
    page(dir) {
      const card = track.querySelector(".gb-pst-li");
      const step = card ? card.getBoundingClientRect().width + 16 : 240;
      const n = Math.max(1, Math.floor((track.clientWidth + 16) / step) - 1);   // bir sonraki sayfa: görünür kartlar − 1 (bağlam kalsın)
      track.scrollBy({ left: dir * n * step, behavior: reduce() ? "auto" : "smooth" });
    },
    onState(cb) { subs.push(cb); requestAnimationFrame(state); },
  };
}

// ══════════════════════════════════════════════════════════════════════
// TAM EKRAN GÖRÜNTÜLEYİCİ (uygulama PosterViewer): koyu zemin, afiş sığdırılır (kırpılmaz), sağ üstte kapat; ESC / zemine tık kapatır
// ══════════════════════════════════════════════════════════════════════
let _viewer = null;
export function openPosterViewer({ url, title = "", restore = null } = {}) {
  const src = str(url);
  if (!src) return null;
  ensurePosterCss();
  _viewer?.close();
  const back = restore || document.activeElement;   // kapanınca odak tetikleyiciye döner
  const closeBtn = h("button", { type: "button", class: "gb-pst-vclose", "aria-label": "Afişi kapat" }, svg(I.x, 18, "2"));
  const img = h("img", { class: "gb-pst-vimg", src, alt: title ? `${title} afişi` : "Etkinlik afişi", decoding: "async" });
  const kicker = h("span", { class: "gb-pst-vkick" }, title ? `AFİŞ · ${title.toLocaleUpperCase("tr-TR")}` : "AFİŞ");
  const box = h("div", { class: "gb-pst-vbox" }, img);
  const node = h("div", { class: "gb-pst-viewer", role: "dialog", "aria-modal": "true", "aria-label": title ? `${title} afişi` : "Etkinlik afişi" },
    h("div", { class: "gb-pst-vbar" }, kicker, closeBtn), box);
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); closeBtn.focus(); }   // tek odaklanabilir öğe
  };
  const onHash = () => close();
  function close() {
    if (!node.isConnected) return;
    node.remove(); _viewer = null;
    document.documentElement.style.overflow = prevOverflow;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("hashchange", onHash);
    try { back?.focus?.({ preventScroll: true }); } catch (_) {}
  }
  closeBtn.addEventListener("click", close);
  node.addEventListener("click", (e) => { if (e.target === node || e.target === box) close(); });
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("hashchange", onHash);
  document.body.append(node);
  requestAnimationFrame(() => { try { closeBtn.focus({ preventScroll: true }); } catch (_) {} });
  _viewer = { node, close };
  return _viewer;
}
/** "Afişi gör" düğmesi (etkinlik detayı) — afiş yoksa null */
export function posterSeeButton(e, { cls = "" } = {}) {
  if (!hasPoster(e)) return null;
  ensurePosterCss();
  const b = h("button", { type: "button", class: ["gb-pst-see", cls].filter(Boolean).join(" "), "aria-haspopup": "dialog" },
    svg(I.poster, 15, "1.9"), h("span", {}, "Afişi gör"));
  b.addEventListener("click", () => openPosterViewer({ url: e.posterUrl, title: str(e.title), restore: b }));
  return b;
}

// ══════════════════════════════════════════════════════════════════════
// YÜKLEME: kırpmasız, tarayıcıda yeniden boyutlandır (uzun kenar ≤1600 JPEG + ≈540 px küçük) → Storage
// ══════════════════════════════════════════════════════════════════════
const FULL_LONG = 1600, THUMB_W = 540, Q = 0.86;
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async"; img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}
function toJpeg(src, w, hgt) {
  const c = document.createElement("canvas");
  c.width = w; c.height = hgt;
  const x = c.getContext("2d");
  x.fillStyle = "#06070A"; x.fillRect(0, 0, w, hgt);   // saydam PNG → koyu zemin (JPEG siyah/beyaz bant olmasın)
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, w, hgt);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", Q));
}
/** Dosya → { full, thumb, w, h } (JPEG Blob'lar). Kırpma YOK; yalnız ölçek. */
export async function resizePoster(file) {
  if (!file || !/^image\//.test(file.type || "")) throw new Error("type");
  const src = await decode(file);
  const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
  if (!W || !H) throw new Error("decode");
  const k = Math.min(1, FULL_LONG / Math.max(W, H));
  const fw = Math.round(W * k), fh = Math.round(H * k);
  const kt = Math.min(1, THUMB_W / W);
  const tw = Math.round(W * kt), th = Math.round(H * kt);
  const [full, thumb] = await Promise.all([toJpeg(src, fw, fh), toJpeg(src, tw, th)]);
  try { src.close?.(); } catch (_) {}
  return { full, thumb, w: fw, h: fh };
}
/** Storage'a yükle (banner ile aynı aile: event_banners/{ownerUid}/…) → { posterUrl, posterThumbUrl } */
export async function uploadPoster({ full, thumb }, ownerUid) {
  if (!ownerUid) throw new Error("uid");
  const ts = Date.now();
  const put = async (blob, name) => {
    const r = ref(storage, `event_banners/${ownerUid}/${ts}_${name}.jpg`);
    await uploadBytes(r, blob, { contentType: "image/jpeg" });
    return getDownloadURL(r);
  };
  // uygulama services/eventPoster.ts ile aynı adlar ({ts}_poster.jpg + {ts}_poster_t.jpg); küçük yüklenemezse kart tam boyu kullanır
  const rawUrl = await put(full, "poster");
  const rawThumb = await put(thumb, "poster_t").catch(() => null);
  // Kuralın kabul edeceği biçim değilse (POSTER_URL_RE) dosyalar silinir ve afiş yazılmaz — tüm etkinlik yazımı reddedilmesin
  const posterUrl = okPosterUrl(rawUrl);
  const posterThumbUrl = okPosterUrl(rawThumb);
  if (!posterUrl) { deletePosterFiles([rawUrl, rawThumb]); throw new Error("poster-url"); }
  if (rawThumb && !posterThumbUrl) deletePosterFiles([rawThumb]);
  return { posterUrl, posterThumbUrl: posterThumbUrl || posterUrl };
}

/** "Dikey afiş (Instagram)" alanı — oluştur/düzenle formları (masaüstü + mobil). İsteğe bağlı; kırpılmaz.
 *  Dönüş: { node, changed(), hasNew(), commit(ownerUid) → yazılacak alanlar ({} değişmediyse · {posterUrl:null,…} kaldırıldıysa),
 *    afterSave(selfUid) → yazım BAŞARILI: değiştirilen/kaldırılan ESKİ dosyalar silinir (yalnız kendi klasöründeyse — uygulama
 *    preparePosterPatch.stale), afterFail() → yazım BAŞARISIZ: yeni yüklenen dosyalar silinir (öksüz kalmasın), setDisabled(b) }
 *  opts: { url, thumb } mevcut afiş · variant "dk" (masaüstü) | "m" (mobil) · onChange() (form "kirli" bayrağı için) */
export function posterField({ url = "", thumb = "", variant = "dk", onChange, label = POSTER_LABEL, hint = true } = {}) {
  ensurePosterCss();
  const orig = str(url);
  const origThumb = str(thumb);
  let st = orig ? { kind: "existing", url: orig, thumb: origThumb || orig } : { kind: "none" };
  let uploaded = null;   // bu formda yüklenen (henüz kalıcı olmayan) dosyalar
  let busy = false, disabled = false;
  const prev = h("span", { class: "gb-pst-fprev", "aria-hidden": "true" });
  const fileIn = h("input", { type: "file", accept: "image/*", class: "gb-pst-sr", tabindex: "-1", "aria-hidden": "true" });
  const pickLbl = h("span", {}, "Afiş yükle");
  const pickBtn = h("button", { type: "button", class: "gb-pst-fbtn" }, svg(I.upload, 15, "1.9"), pickLbl);
  const delBtn = h("button", { type: "button", class: "gb-pst-fbtn is-del" }, svg(I.trash, 15, "1.9"), h("span", {}, "Kaldır"));
  const err = h("span", { class: "gb-pst-ferr", role: "alert" });
  const help = h("span", { class: "gb-pst-fhelp" }, POSTER_SUB);
  const hintEl = hint ? h("span", { class: "gb-pst-fhint" }, svg('<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>', 14, "1.9"), h("span", {}, DUAL_HINT)) : null;
  const paint = () => {
    const src = st.kind === "new" ? st.preview : st.kind === "existing" ? st.thumb : "";
    prev.replaceChildren(src ? h("img", { src, alt: "" }) : svg(I.poster, 22, "1.6"));
    prev.classList.toggle("is-empty", !src);
    pickLbl.textContent = src ? "Değiştir" : "Afiş yükle";
    delBtn.hidden = !src;
    pickBtn.disabled = delBtn.disabled = busy || disabled;
    node.classList.toggle("is-busy", busy);
  };
  pickBtn.addEventListener("click", () => { if (!busy && !disabled) fileIn.click(); });
  delBtn.addEventListener("click", () => {
    if (busy || disabled) return;
    if (st.kind === "new" && st.preview) URL.revokeObjectURL(st.preview);
    st = { kind: "none" }; err.textContent = ""; paint(); onChange?.();
    try { pickBtn.focus({ preventScroll: true }); } catch (_) {}
  });
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files?.[0]; fileIn.value = "";
    if (!f) return;
    err.textContent = "";
    if (!/^image\//.test(f.type || "")) { err.textContent = "Görsel dosyası seç (JPG / PNG)."; return; }
    if (f.size > 30 * 1024 * 1024) { err.textContent = "Görsel çok büyük (en çok 30 MB)."; return; }
    busy = true; pickLbl.textContent = "Hazırlanıyor…"; paint();
    try {
      const out = await resizePoster(f);
      if (st.kind === "new" && st.preview) URL.revokeObjectURL(st.preview);
      st = { kind: "new", ...out, preview: URL.createObjectURL(out.thumb) };
      if (out.w > out.h) err.textContent = "Not: yatay görsel — afiş satırında dikey kart içinde küçük görünür.";
      onChange?.();
    } catch (_) { err.textContent = "Görsel okunamadı — başka bir dosya dene."; }
    finally { busy = false; paint(); }
  });
  const node = h("div", { class: ["gb-pst-field", variant === "m" ? "is-m" : "is-dk"].join(" ") },
    prev,
    h("div", { class: "gb-pst-fcol" },
      h("span", { class: "gb-pst-flbl" }, label, h("span", { class: "gb-pst-fopt" }, " · İSTEĞE BAĞLI")),
      help,
      h("div", { class: "gb-pst-fbtns" }, pickBtn, delBtn),
      err, hintEl),
    fileIn);
  paint();
  return {
    node,
    changed: () => (st.kind === "new") || (st.kind === "none" && !!orig),
    hasNew: () => st.kind === "new",
    async commit(ownerUid) {
      if (st.kind === "new") { uploaded = await uploadPoster(st, ownerUid); return { ...uploaded }; }
      if (st.kind === "none" && orig) return { posterUrl: null, posterThumbUrl: null };
      return {};
    },
    afterSave(selfUid) {
      const stale = orig && (st.kind === "new" || st.kind === "none") ? [orig, origThumb] : [];
      uploaded = null;
      if (stale.length && selfUid) deletePosterFiles(stale, selfUid).catch(() => {});
    },
    afterFail() {
      if (uploaded) deletePosterFiles([uploaded.posterUrl, uploaded.posterThumbUrl]).catch(() => {});
      uploaded = null;
    },
    setDisabled(b) { disabled = !!b; paint(); },
  };
}
