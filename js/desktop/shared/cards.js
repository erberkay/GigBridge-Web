// KARTLAR — TEK KAYNAK (kanvas notu: "Aynı bileşenler … tek kaynaktan gelsin; sadece yerleşim değişsin").
// Her sayfa etkinlik/sanatçı/mekan kartlarını BURADAN alır; yerel kopya yazma. CSS: css/dk-ui.css (§KARTLAR).
// Girdi: gerçek Firestore kayıtları (events / users). Görsel yoksa tür gradyanı + serif baş harf yer tutucusu (public-a Q6).
//
//   eventCardOverlay(e, o)  — WebKesfet En Yeniler/Bu Hafta/ETKİNLİKLER/arama: h340 r10, tam görsel + alt gradyan
//   eventCardTop10(e, rank) — WebKesfet Top 10: w300, görsel 200 + serif 120 sıra rakamı (1–3 altın)
//   eventCardWide(e, o)     — WebKesfet "Sadece GigBridge'de": h300 r12, soldan koyu gradyan, serif 44 başlık
//   eventCard(e, o)         — tarih karolu standart kart (WebEtkinlikler/Landing/Etkinlik "Benzer"/Sanatçı/Mekan): görsel 184|200|168
//   eventRowMini(e)         — WebAkis sağ ray "BU HAFTA": 44×48 tarih karosu + başlık + mekan·saat + fiyat
//   dateTile(ms, o)         — overlay (52×56, görsel üstü) | small (44×48, düz)
//   artistCard(u, o)        — WebKesfet Popüler Sanatçılar: foto 210 + ad + tür·takipçi + TAKİP ET
//   artistRow(u, o)         — WebKesfet SANATÇILAR sekmesi: 64 avatar + ad + TÜR (pembe mono) + takipçi + TAKİP ET
//   venueCard(v, o)         — WebKesfet MEKANLAR: h300 r12, "MEKAN" rozeti, ad 26, pin + şehir·★·kapasite, 2 tür etiketi
import { h } from "../../ui.js";
import { svgIcon, svgRaw } from "./icons.js";
import { cx, dkEventBadge, dkFollowButton, dkAvatar } from "./ui.js";
import { eventStartMs, fmtTime, fmtDayLabel, isToday, isTomorrow, DAYS_TR_SHORT, MONTHS_TR_SHORT, trUpper, fmtPrice, isFree, fmtRating, shortNumTR, artistGenres, initials } from "./helpers.js";
import { genreColor, genreSoft, genreGrad, genreLabel, primaryGenre } from "./genres.js";

// ── ortak alan okuyucular ──
export const evTitle = (e) => e?.title || "Etkinlik";
export const evSub = (e) => [e?.artistName, e?.venueName].filter(Boolean).join(" · ");
export const evCity = (e) => (e?.city || e?.location?.city || "").trim();
export const evImage = (e) => e?.bannerUrl || e?.imageUrl || e?.coverUrl || null;
export const evHref = (e) => "#/etkinlik/" + encodeURIComponent(e?.id || "");
// "Bugün · 21:00" / "Yarın · 21:00" / "Cmt 3 Eki · 22:00" (WebKesfet DCLogic when)
export function evWhen(e) {
  const s = eventStartMs(e); if (s == null) return e?.date || "";
  return `${fmtDayLabel(s)} · ${fmtTime(s)}`;
}
// "BUGÜN 21:00" / "YARIN 21:00" / "PZT 23:30" (WebEtkinlikler whenUp)
export function evWhenUp(e) {
  const s = eventStartMs(e); if (s == null) return "";
  const d = isToday(s) ? "BUGÜN" : isTomorrow(s) ? "YARIN" : trUpper(DAYS_TR_SHORT[new Date(s).getDay()]);
  return `${d} ${fmtTime(s)}`;
}
const evDay = (e) => { const s = eventStartMs(e); return s == null ? null : new Date(s); };
const PEOPLE = '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"></path>';

// Görsel ya da yer tutucu (tür gradyanı + serif baş harf). pos: object-position
function media(e, { cls, pos, initialSize = 96, alt } = {}) {
  const src = evImage(e);
  if (src) {
    const img = h("img", { src, alt: alt ?? evTitle(e), loading: "lazy", decoding: "async", class: cx("dk-ec-img", cls), style: pos ? { objectPosition: pos } : null });
    img.addEventListener("error", () => img.replaceWith(placeholder(e, { cls, initialSize })), { once: true });
    return img;
  }
  return placeholder(e, { cls, initialSize });
}
function placeholder(e, { cls, initialSize = 96 } = {}) {
  return h("span", { class: cx("dk-ec-img", "dk-ec-ph", cls), style: { background: genreGrad(primaryGenre(e), 150) }, "aria-hidden": "true" },
    h("span", { style: { fontSize: initialSize + "px" } }, initials(evTitle(e))));
}
function priceEl(e, { size = 13, upper = true, keepColor = false } = {}) {
  const free = isFree(e?.ticketPrice);
  return h("span", { class: "dk-ec-price", style: { fontSize: size + "px", color: free && !keepColor ? "#7CE0B0" : keepColor ? "#C9CACD" : "#F2F1EE" } }, fmtPrice(e?.ticketPrice, { upper }));
}
const cardLink = (e, cls, style, kids, onClick) => {
  const a = h("a", { href: evHref(e), class: cx("dk-ec", "dk-card", cls), style }, ...kids);
  if (onClick) a.addEventListener("click", (ev) => onClick(e, ev));
  return a;
};

// ══════════════════════════════════════════════════════════════════════
// DateTile — overlay: 52×56 r6 bg rgba(6,7,10,.82) kenar rgba(242,241,238,.14); gün 21/600, ay mono 9.5/700/.12em #A3A7AF
//            small  : 44×48 r6 bg #0E1014 kenar #1F232B; gün 17/600, ay mono 9/700/.1em #8A8E97
// ══════════════════════════════════════════════════════════════════════
export function dateTile(ms, { variant = "overlay" } = {}) {
  const d = ms == null ? null : new Date(ms);
  return h("span", { class: cx("dk-dt", `dk-dt-${variant}`) },
    h("span", { class: "dk-dt-d" }, d ? String(d.getDate()) : "—"),
    h("span", { class: "dk-dt-m" }, d ? trUpper(MONTHS_TR_SHORT[d.getMonth()]) : ""));
}

// Overlay kart (340) — o: { height=340, onClick, kesfet=true (dolu rozeti "BEKLEME LİSTESİNE KATIL!") }
export function eventCardOverlay(e, o = {}) {
  const g = primaryGenre(e);
  const badge = dkEventBadge(e, { variant: "card", kesfet: o.kesfet !== false });
  return cardLink(e, "dk-eco", o.height ? { height: o.height + "px" } : null, [
    media(e, { initialSize: 96 }),
    h("span", { class: "dk-eco-grad", "aria-hidden": "true" }),
    badge ? h("span", { class: "dk-eco-badge" }, badge) : null,
    h("div", { class: "dk-eco-body" },
      h("span", { class: "dk-eco-t" }, evTitle(e)),
      evSub(e) ? h("span", { class: "dk-eco-s" }, evSub(e)) : null,
      g ? h("span", { class: "dk-eco-tag", style: { color: genreColor(g), borderColor: genreSoft(g) } }, genreLabel(g)) : null,
      h("span", { class: "dk-eco-foot" }, h("span", {}, evWhen(e)), priceEl(e, { size: 13, upper: true }))),
  ], o.onClick);
}

// Top 10 kartı (w300) — rank: 1..10 (1–3 #FFD700)
export function eventCardTop10(e, rank, o = {}) {
  const badge = dkEventBadge(e, { variant: "card", kesfet: true });
  return cardLink(e, "dk-ect", o.width ? { width: o.width + "px" } : null, [
    h("div", { class: "dk-ect-media" },
      media(e, { initialSize: 72 }),
      h("span", { class: "dk-ect-grad", "aria-hidden": "true" }),
      h("span", { class: "dk-ect-rank", style: { color: rank <= 3 ? "#FFD700" : "#F2F1EE" }, "aria-label": `${rank}. sıra` }, String(rank)),
      badge ? h("span", { class: "dk-ect-badge" }, badge) : null),
    h("div", { class: "dk-ect-body" },
      h("span", { class: "dk-ect-t" }, evTitle(e)),
      h("span", { class: "dk-ect-s" }, evSub(e) || "—"),
      h("span", { class: "dk-ect-w" }, evWhen(e)),
      h("span", { class: "dk-ect-foot" }, priceEl(e, { size: 14, upper: true }),
        h("span", { class: "dk-ect-att" }, svgRaw(PEOPLE, { size: 13, sw: "2" }), String(Number(e?.attendeeCount) || 0)))),
  ], o.onClick);
}

// Geniş kart (h300) — exclusive / VIP
export function eventCardWide(e, o = {}) {
  const badge = dkEventBadge(e, { variant: "wide", kesfet: true });
  return cardLink(e, "dk-ecw", null, [
    media(e, { initialSize: 120 }),
    h("span", { class: "dk-ecw-grad", "aria-hidden": "true" }),
    h("div", { class: "dk-ecw-body" },
      badge,
      h("span", { class: "dk-ecw-t" }, evTitle(e)),
      evSub(e) ? h("span", { class: "dk-ecw-s" }, evSub(e)) : null,
      h("span", { class: "dk-ecw-w" }, evWhen(e), priceEl(e, { size: 14, upper: true }))),
  ], o.onClick);
}

// Standart (tarih karolu) kart — WebEtkinlikler 3.4 / public-b EventCard
//   o.media: 184 (varsayılan) | 200 (Landing) | 168 (Sanatçı/Mekan) · o.kicker: "genre-when" (varsayılan, "JAZZ · BUGÜN 21:00") |
//   "when" ("SAL 20:30", Sanatçı sayfası) | "genre-day" (tür + göreli gün, Mekan) · o.city (", Şehir" meta sonuna; Etkinlikler: true) ·
//   o.footer: "attendees" ("{n} katılımcı") | "cta" ("Bilet al →") · o.corner: { label, color } (RESIDENT #FF4FA3 / BU GECE #FF5A6E) ·
//   o.titleSize: 19 (18 Sanatçı/Mekan) · o.badge: false → durum rozeti gizli
export function eventCard(e, o = {}) {
  const g = primaryGenre(e);
  const c = g ? genreColor(g) : "#A3A7AF";
  const s = eventStartMs(e);
  const kickerTxt = o.kicker === "when" ? evWhenUp(e) : o.kicker === "genre-day" ? `${genreLabel(g)} · ${trUpper(fmtDayLabel(s))}` : [genreLabel(g), evWhenUp(e)].filter(Boolean).join(" · ");
  const badge = o.badge === false ? null : dkEventBadge(e, { variant: "card", kesfet: false });
  const corner = o.corner ? h("span", { class: "dk-ecd-corner", style: { color: o.corner.color, borderColor: o.corner.color } }, o.corner.label) : null;
  const meta = [evSub(e), o.city && evCity(e) ? evCity(e) : null].filter(Boolean);
  return cardLink(e, "dk-ecd", null, [
    h("div", { class: "dk-ecd-media", style: { height: (o.media || 184) + "px" } },
      media(e, { initialSize: 72 }),
      dateTile(s, { variant: "overlay" }),
      corner || (badge ? h("span", { class: "dk-ecd-badge" }, badge) : null)),
    h("div", { class: "dk-ecd-body" },
      h("span", { class: "dk-ecd-k", style: { color: c } }, o.kicker === "when" ? null : h("span", { class: "dk-ecd-dot", style: { background: c } }), kickerTxt),
      h("span", { class: "dk-ecd-t", style: o.titleSize ? { fontSize: o.titleSize + "px" } : null }, evTitle(e)),
      meta.length ? h("span", { class: "dk-ecd-s" }, meta.length === 2 ? `${meta[0]}, ${meta[1]}` : meta[0]) : null,
      h("div", { class: "dk-ecd-foot" },
        priceEl(e, { size: 15, upper: false }),
        o.footer === "cta"
          ? h("span", { class: "dk-ecd-cta" }, "Bilet al", svgIcon("arrowRight", { size: 14 }))
          : h("span", { class: "dk-ecd-att" }, o.footer === "attendees-plain" ? null : svgRaw(PEOPLE, { size: 13, sw: "2" }), `${Number(e?.attendeeCount) || 0} katılımcı`))),
  ], o.onClick);
}

// Satır (WebAkis BU HAFTA / Harita listesi temel) — o: { priceColor (#C9CACD sabit), showDot }
export function eventRowMini(e, o = {}) {
  const g = primaryGenre(e);
  const s = eventStartMs(e);
  const a = h("a", { href: evHref(e), class: cx("dk-erm", "dk-row") },
    dateTile(s, { variant: "small" }),
    h("span", { class: "dk-erm-col" },
      h("span", { class: "dk-erm-t" }, o.showDot === false ? null : h("span", { class: "dk-erm-dot", style: { background: genreColor(g) } }), h("span", { class: "dk-truncate" }, evTitle(e))),
      h("span", { class: "dk-erm-s" }, [e?.venueName, s != null ? fmtTime(s) : null].filter(Boolean).join(" · "))),
    priceEl(e, { size: 12, upper: false, keepColor: true }));
  if (o.onClick) a.addEventListener("click", (ev) => o.onClick(e, ev));
  return a;
}

// ══════════════════════════════════════════════════════════════════════
// SANATÇI / MEKAN
// ══════════════════════════════════════════════════════════════════════
const artistName = (u) => u?.displayName || u?.name || "Sanatçı";
const artistInitial = (u) => initials(String(artistName(u)).replace(/^DJ\s+/i, ""));
const followers = (u) => shortNumTR(u?.followerCount ?? u?.followersCount ?? 0);

// o: { followed, onFollow(next) → Promise<bool|void> (false → geri al), href, pos }
export function artistCard(u, o = {}) {
  const href = o.href || "#/sanatci/" + encodeURIComponent(u?.id || "");
  const g = artistGenres(u)[0] || "";
  const photo = u?.photoURL
    ? h("img", { src: u.photoURL, alt: artistName(u), loading: "lazy", decoding: "async", class: "dk-arc-img", style: { objectPosition: o.pos || "center 25%" } })
    : h("span", { class: "dk-arc-ph", "aria-hidden": "true" }, artistInitial(u));
  return h("div", { class: cx("dk-arc", "dk-card") },
    h("a", { href, class: "dk-arc-media", tabindex: "-1", "aria-hidden": "true" }, photo),
    h("div", { class: "dk-arc-body" },
      h("div", { class: "dk-arc-col" },
        h("a", { href, class: "dk-arc-name" }, artistName(u)),
        h("span", { class: "dk-arc-meta" }, [g, `${followers(u)} takipçi`].filter(Boolean).join(" · "))),
      dkFollowButton({ followed: !!o.followed, onToggle: o.onFollow, variant: "card", name: artistName(u) })));
}
export function artistRow(u, o = {}) {
  const href = o.href || "#/sanatci/" + encodeURIComponent(u?.id || "");
  const g = artistGenres(u)[0] || "";
  const av = u?.photoURL
    ? h("img", { src: u.photoURL, alt: "", loading: "lazy", class: "dk-arr-av", style: { objectPosition: o.pos || "center" } })
    : h("span", { class: "dk-arr-av dk-arr-ph", "aria-hidden": "true" }, artistInitial(u));
  return h("div", { class: "dk-arr" }, av,
    h("div", { class: "dk-arr-col" },
      h("a", { href, class: "dk-arr-name" }, artistName(u)),
      g ? h("span", { class: "dk-arr-g" }, genreLabel(g)) : null,
      h("span", { class: "dk-arr-f" }, `${followers(u)} takipçi`)),
    o.onFollow === false ? null : dkFollowButton({ followed: !!o.followed, onToggle: o.onFollow, variant: "row", name: artistName(u) }));
}
// o: { onClick }
export function venueCard(v, o = {}) {
  const name = v?.displayName || v?.name || "Mekan";
  const gs = artistGenres(v).slice(0, 2);
  const rating = fmtRating(v?.avgRating);
  const meta = [v?.city || null, rating ? `★ ${rating}` : null, v?.capacity ? `${v.capacity} kişi` : null].filter(Boolean).join(" · ");
  const a = h("a", { href: "#/mekan/" + encodeURIComponent(v?.id || ""), class: cx("dk-ec", "dk-vc", "dk-card") },
    v?.photoURL
      ? h("img", { src: v.photoURL, alt: name, loading: "lazy", decoding: "async", class: "dk-ec-img" })
      : h("span", { class: "dk-vc-ph", "aria-hidden": "true" }, initials(name)),
    h("span", { class: "dk-vc-grad", "aria-hidden": "true" }),
    h("span", { class: "dk-vc-badge" }, "MEKAN"),
    h("div", { class: "dk-vc-body" },
      h("span", { class: "dk-vc-name" }, name),
      meta ? h("span", { class: "dk-vc-meta" }, svgIcon("pin", { size: 14 }), meta) : null,
      gs.length ? h("span", { class: "dk-vc-tags" }, ...gs.map((t) => h("span", { class: "dk-vc-tag" }, genreLabel(t)))) : null));
  if (o.onClick) a.addEventListener("click", (ev) => o.onClick(v, ev));
  return a;
}

// Avatar kısayolu (kişi listeleri) — rol gradyanı; sanatçı kartlarında tür gradyanı kullan
export const personAvatar = (u, size = 40) => dkAvatar({ name: u?.displayName || "", photo: u?.photoURL, size, type: u?.userType || "customer" });
