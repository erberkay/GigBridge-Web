// WebFavoriler — "Favorilerim" masaüstü görünümü (≥769 px). Registry anahtarı: favoriler (#/favoriler, yalnız dinleyici).
// Spec: specs/hesap.md WebFavoriler (+ §0 kabuk). Artboard: design/WebFavoriler.dc.html. CSS: css/dk-favoriler.css (.dk-favoriler kökü).
// Legacy karşılığı: js/pages/customer.js favoritesView() (≤768 aynen kalır).
//
// Legacy özellikleri (korundu): 3 sekme kod sırasıyla (Sanatçılar = followingList, Mekanlar = favVenues, Etkinlikler =
// favEvents), sekme sayaçları + toplam kalp hapı (listelerin toplamı), kalp ile çıkarma (following + ayna / favorites /
// favoriteEvents), boş durum metinleri ("Favori sanatçı/mekan/etkinlik yok." + "Sanatçı, mekan veya etkinlik sayfalarında…"),
// kart → sanatçı/mekan/etkinlik sayfası, etkinlik kartında tür + fiyat ("Ücretsiz").
// Yeni (tasarım + sahibi notu): bildirim bilgi şeridi (ana anahtar KAPALI uyarısı), sanatçı başına ZİL
// (users/{uid}/following/{id}.notifyEvents — app follow.ts setFollowNotify ile birebir; alan yoksa AÇIK sayılır),
// fotoğraflı kartlar (puan/takipçi/semt/kapasite), etkinlik görseli + tarih karosu, iyimser çıkarma + 4 sn "GERİ AL",
// zil sallanma animasyonu + toast'lar.
// App eşliği (spec §7): takip edilen GRUPLAR (users/{uid}/followingGroups) Sanatçılar sekmesinde sanatçılardan sonra;
// grup zili app setGroupFollowNotify ile birebir (followingGroups/{id} + groups/{id}/followers/{uid} aynası); kalp =
// app unfollowGroup. Webde grup sayfası yok → grup kartında profil bağlantısı yok.
//
// Kaldırma yazımı HEMEN yapılır (yenileme/kapatma/çıkışta kaybolmaz); "GERİ AL" silinen belgelerin anlık görüntüsünü aynen
// geri yazar (takip.js removeEntry — followArtist çağrılmaz → new_follower bildirimi tekrar gitmez).
//
// URL: #/favoriler?sekme=mekan|etkinlik (replaceState; update(query) geri/ileri'de uygular).
// Yazımlar: following/favorites/favoriteEvents/followingGroups silme + geri yazma (takip.js removeEntry) ·
//   setFollowNotify (yerel; app ile aynı biçim): updateDoc(users/{uid}/following/{id}, { notifyEvents, notifyUpdatedAt:
//   serverTimestamp() }) + best-effort setDoc(users/{id}/followers/{uid}, { notifyEvents }, { merge: true }) · grup için
//   followingGroups/{id} + groups/{id}/followers/{uid}. Kurallar: users/{uid}/{sub} sahibine açık, followers/{uid} takipçinin
//   kendisine açık → kural/indeks değişikliği YOK.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { db, doc, updateDoc, setDoc, serverTimestamp } from "../../firebase.js";
import { followingList, favVenues, favEvents, eventById, eventStartMs as _startMs, isEventOver as _isOver } from "../../data.js";
import { accountShell } from "../shared/account-shell.js";
import { invalidateAccountCounts } from "../shared/live.js";
import { svgRaw, svgPath } from "../shared/icons.js";
import { dkPageHead, dkSegmented, dkEmpty, dkButton, dkToast, dkLoginGate, dkSkeleton } from "../shared/ui.js";
import { dateTile, evWhenUp } from "../shared/cards.js";
import { fmtRating, fmtPrice, isFree, writeQuery, artistGenres, trUpper } from "../shared/helpers.js";
import { genreColor, primaryGenre, genreFamily } from "../shared/genres.js";
import {
  isArtistTarget, followTargetId, rawOf, followingGroupsList, fmtK, cardInitial, userInfo, groupInfo, eventsOf, dayTime,
  reduceMotion, genreUp, removeEntry, undoToast, keyedGrid,
} from "./takip.js";

// Artboard SVG gövdeleri (birebir)
const P = {
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.4-7.5 10.4z"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  check: "M5 12.5l4.5 4.5L19 7.5",
};
const BELL = "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0";
const BELL_OFF = "M6 16v-5a6 6 0 0 1 9.4-4.9M18 11v5l1.5 2H8M10 20.5a2 2 0 0 0 4 0M4 4l16 16";
const EMPTY = {
  artist: ["Favori sanatçı yok.", "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"],
  venue: ["Favori mekan yok.", "M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M7.5 8h3M7.5 12h3M7.5 16h3"],
  event: ["Favori etkinlik yok.", "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10"],
};
const TABS = [["artist", "Sanatçılar", null], ["venue", "Mekanlar", "mekan"], ["event", "Etkinlikler", "etkinlik"]];
const tabOf = (q) => { const v = q?.get("sekme"); return v === "mekan" ? "venue" : v === "etkinlik" ? "event" : "artist"; };
const heartSvg = (size = 18) => svgRaw(P.heart, { size, fill: true, attrs: { stroke: "currentColor", "stroke-width": "1.9", "stroke-linejoin": "round" } });

// SHARED-CANDIDATE: app src/services/follow.ts setFollowNotify / setGroupFollowNotify'ın web karşılığı (data.js'te yok).
async function setFollowNotify(uid, targetId, on) {
  await updateDoc(doc(db, "users", uid, "following", targetId), { notifyEvents: on, notifyUpdatedAt: serverTimestamp() });
  setDoc(doc(db, "users", targetId, "followers", uid), { notifyEvents: on }, { merge: true }).catch(() => {});
}
async function setGroupFollowNotify(uid, groupId, on) {
  await updateDoc(doc(db, "users", uid, "followingGroups", groupId), { notifyEvents: on, notifyUpdatedAt: serverTimestamp() });
  setDoc(doc(db, "groups", groupId, "followers", uid), { notifyEvents: on }, { merge: true }).catch(() => {});
}

// SHARED-CANDIDATE: dkToast'ta "icon" seçeneği yok ve hesap varyantında "Geri al" varken baştaki daire çizilmiyor;
// WebFavoriler toast'u ikon + GERİ AL birlikte, zil toast'u zil ikonu ister → dönen düğümde yerel yama (stiller dk-ui.css'ten).
function decorate(el, kind) {
  if (!el) return;
  let ic = el.querySelector(".dk-tst-ic");
  if (!ic) { ic = h("span", { class: "dk-tst-ic" }); el.prepend(ic); }
  ic.replaceChildren(svgPath(kind === "bell" ? BELL : kind === "off" ? BELL_OFF : P.check, { size: 13, sw: "2.4" }));
  el.style.padding = "0 8px 0 16px"; el.style.gap = "14px";
  const m = el.querySelector(".dk-tst-m"); if (m) m.style.paddingRight = "8px";
}
const bellToast = (text, kind) => decorate(dkToast(text, { type: kind === "bell" ? "info" : "neutral", duration: 3600 }).node, kind);

export function favorilerView(ctx) {
  const s = ctx.session || session;
  const guest = !s.user || s.guest;
  const uid = guest ? null : s.user.uid;
  const shell = accountShell({ active: "favoriler", ctx, contentGap: 28 });
  const root = shell.content;
  root.classList.add("dk-favoriler");
  let alive = true;
  let undoT = null;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };

  let tab = tabOf(ctx.query);
  const lists = { artist: null, venue: null, event: null };  // null = yükleniyor (artist = sanatçılar + gruplar)
  let loadErr = false;

  // ── başlık + toplam hapı ──
  const totalN = h("span", {}, "—");
  const total = h("span", { class: "dk-favoriler-total" }, svgRaw(P.heart, { size: 13, fill: true }), totalN, h("span", { class: "dk-sr" }, " favori"));
  const head = dkPageHead({ title: "Favori", em: "lerim", lead: "Kalp bastığın sanatçılar, mekanlar ve etkinlikler. Zil açık sanatçılar yeni etkinlik açınca haber verir.", right: total });

  // ── bilgi şeridi ──
  const infoT = h("span", { class: "dk-favoriler-infot" }, "Etkinlik bildirimleri");
  const infoS = h("span", { class: "dk-favoriler-infos" }, "Favoriye aldığın sanatçılar yeni etkinlik açtığında bildirim alırsın; zil ile sanatçı bazında kapatabilirsin.");
  const info = h("div", { class: "dk-favoriler-info dk-rise", style: { "--dk-delay": "60ms" } },
    h("span", { class: "dk-favoriler-infoic", "aria-hidden": "true" }, svgPath(BELL, { size: 18, sw: "1.9" })),
    h("span", { class: "dk-favoriler-infotx" }, infoT, infoS),
    h("a", { href: "#/bildirimler", class: "dk-favoriler-infoa dk-press" }, "Bildirim ayarları", svgRaw(P.arrow, { size: 14, sw: "2" })),
    h("span", { class: "dk-favoriler-infobar dk-prism", "aria-hidden": "true" }));
  const masterOn = () => { const n = (session.profile || s.profile)?.notificationSettings || {}; return n.pushEnabled !== false && n.artist_new_gig !== false; };
  const setInfo = () => {
    const on = (lists.artist || []).filter((a) => a.notify).length;
    const master = masterOn();
    infoT.textContent = `${on} sanatçıda etkinlik bildirimi açık · Favori sanatçı etkinlikleri: ${master ? "AÇIK" : "KAPALI"}`;
    info.classList.toggle("is-off", !master);
    infoS.textContent = master
      ? "Favoriye aldığın sanatçılar yeni etkinlik açtığında bildirim alırsın; zil ile sanatçı bazında kapatabilirsin."
      : "Favori sanatçı etkinlikleri kapalı: zil açık olsa da bildirim gönderilmez.";
  };

  // ── sekmeler ──
  const body = h("div", { class: "dk-favoriler-body" });
  const seg = dkSegmented({
    label: "Favori türü", value: tab, countStyle: "pill",
    items: TABS.map(([key, label]) => ({ key, label, count: "—" })),
    onChange: (k) => { tab = k; writeQuery({ sekme: TABS.find((t) => t[0] === k)[2] }); syncPanel(); draw(); },
  });
  seg.classList.add("dk-favoriler-tabs", "dk-rise");
  seg.style.setProperty("--dk-delay", "100ms");
  [...seg.querySelectorAll('[role="tab"]')].forEach((b, i) => { b.id = "dk-favoriler-tab-" + TABS[i][0]; b.setAttribute("aria-controls", "dk-favoriler-panel"); });
  const syncPanel = () => { if (!guest) body.setAttribute("aria-labelledby", "dk-favoriler-tab-" + tab); };

  root.append(head, info, seg, body);

  if (guest) {
    info.hidden = true; seg.hidden = true; total.hidden = true;
    body.append(dkEmpty({ ring: true, icon: svgRaw(P.heart, { size: 28, sw: "1.6" }), title: "Giriş gerekli", sub: "Favorilerini görmek için bir hesapla giriş yap.",
      action: dkButton("Giriş yap", { variant: "light", size: 42, onClick: () => dkLoginGate("Favorilerini görmek") }) }));
    return { node: shell.node, destroy() { alive = false; shell.destroy(); } };
  }
  body.id = "dk-favoriler-panel";
  body.setAttribute("role", "tabpanel");
  syncPanel();

  const setCounts = () => {
    TABS.forEach(([k]) => seg.dk.setCount(k, lists[k] == null ? "—" : lists[k].length));
    const n = TABS.reduce((a, [k]) => a + (lists[k]?.length || 0), 0);
    totalN.textContent = lists.artist == null ? "—" : String(n);
    setInfo();
  };
  const countsChanged = () => { invalidateAccountCounts(uid); if (alive) shell.refreshCounts(true); };

  // ── veri ──
  async function load() {
    const [fol, fv, fe, fg] = await Promise.all([followingList(uid).catch(() => null), favVenues(uid).catch(() => null), favEvents(uid).catch(() => null), followingGroupsList(uid).catch(() => null)]);
    if (!alive) return;
    loadErr = fol == null && fv == null && fe == null;
    lists.artist = [
      ...(fol || []).filter(isArtistTarget).map((d) => ({
        kind: "artist", key: "a:" + d.id, docId: d.id, src: "following", id: followTargetId(d), name: d.artistName || d.targetName || "Sanatçı",
        genres: d.genre ? [d.genre] : [], photo: d.photoURL || null, notify: d.notifyEvents !== false, raw: rawOf(d),
      })),
      ...(fg || []).map((d) => ({
        kind: "group", key: "g:" + d.id, docId: d.id, src: "groups", id: d.groupId || d.id, name: d.groupName || "Grup",
        genres: d.genre ? [d.genre] : [], photo: d.photoURL || null, notify: d.notifyEvents !== false, raw: rawOf(d),
      })),
    ];
    lists.venue = (fv || []).map((d) => ({ kind: "venue", key: "v:" + d.id, docId: d.id, src: "favorites", id: d.venueId || d.id, name: d.venueName || "Mekan", city: d.city || "", raw: rawOf(d) }));
    lists.event = (fe || []).sort((a, b) => (b.savedAt?.toMillis?.() || 0) - (a.savedAt?.toMillis?.() || 0))
      .map((d) => ({ kind: "event", key: "e:" + d.id, docId: d.id, src: "favoriteEvents", id: d.id, name: d.title || "Etkinlik", fav: d, raw: rawOf(d) }));
    setCounts();
    draw();
  }

  // ── kart parçaları ──
  const heartBtn = (label) => h("button", { type: "button", class: "dk-favoriler-heart dk-press", "aria-pressed": "true", "aria-label": `${label} favorilerden çıkar` }, heartSvg(18));
  function mediaWith(media, it, photo, ph) {
    const old = media.querySelector(".dk-favoriler-img, .dk-favoriler-ph");
    let el;
    if (photo) {
      el = h("img", { class: "dk-favoriler-img", src: photo, alt: "", loading: "lazy", decoding: "async", style: it.kind === "artist" || it.kind === "group" ? { objectPosition: "center 25%" } : null });
      el.addEventListener("error", () => el.replaceWith(ph()), { once: true });
    } else el = ph();
    if (old) old.replaceWith(el); else media.prepend(el);
  }
  const chipText = (genres, sep) => genres.slice(0, 2).map(genreUp).join(sep);

  // Sanatçı + grup kartı (FavArtistCard)
  function artistCard(it) {
    const isGroup = it.kind === "group";
    const href = isGroup ? null : "#/sanatci/" + encodeURIComponent(it.id);
    const ph = () => h("span", { class: "dk-favoriler-ph is-artist" }, cardInitial(it.name));
    const gchip = h("span", { class: "dk-favoriler-gchip" });
    const bchip = h("span", { class: "dk-favoriler-bchip" }, svgPath(BELL, { size: 11, sw: "2.2" }), "BİLDİRİM AÇIK");
    const media = href ? h("a", { href, class: "dk-favoriler-media", "aria-label": `${it.name} profili` }, gchip, bchip)
      : h("div", { class: "dk-favoriler-media" }, gchip, bchip);
    mediaWith(media, it, it.photo, ph);
    const setGenres = () => { gchip.textContent = it.genres.length ? chipText(it.genres, " · ") : isGroup ? "GRUP" : "SANATÇI"; };
    setGenres();
    // artboard: flex gap 6 içinde ayrı metin parçaları ("★ 4.8 · 8.2K takipçi" — her parça arasında 6px)
    const star = svgRaw(P.star, { size: 12, fill: true, color: "#FF8A2A" });
    const rateEl = h("span", {}), dotEl = h("span", { "aria-hidden": "true" }, "·"), folEl = h("span", {}, "—"), folLbl = h("span", {}, "takipçi");
    const setRate = (r) => { [star, rateEl, dotEl].forEach((x) => { x.style.display = r ? "" : "none"; }); rateEl.textContent = r || ""; };
    setRate(null);
    const meta = isGroup ? h("span", { class: "dk-favoriler-meta" }, h("span", {}, "Grup"))
      : h("span", { class: "dk-favoriler-meta is-artist" }, star, rateEl, dotEl, folEl, folLbl);
    const heart = heartBtn(it.name);
    const bell = h("button", { type: "button", class: "dk-favoriler-bell dk-press" });
    const setBell = (ring) => {
      const on = it.notify;
      bell.classList.toggle("is-on", on);
      bell.setAttribute("aria-pressed", on ? "true" : "false");
      bell.setAttribute("aria-label", (on ? "Etkinlik bildirimlerini kapat: " : "Etkinlik bildirimlerini aç: ") + it.name);
      bell.replaceChildren(svgPath(on ? BELL : BELL_OFF, { size: 18, sw: "1.9", cls: on && ring ? "dk-bell" : null }));
      bchip.hidden = !on;
    };
    setBell(false);
    const article = h("article", { class: "dk-favoriler-card dk-card" },
      media,
      h("div", { class: "dk-favoriler-foot" },
        h("span", { class: "dk-favoriler-txt" }, h(href ? "a" : "span", { href, class: "dk-favoriler-name" }, it.name), meta),
        heart, bell));
    const cell = h("div", { class: "dk-favoriler-cell" }, article);
    heart.addEventListener("click", (e) => remove(it, cell, e.detail === 0));
    bell.addEventListener("click", () => toggleBell(it, setBell));
    if (isGroup) {
      groupInfo(it.id).then((g) => {
        if (!alive || !g) return;
        if (g.photoURL && g.photoURL !== it.photo) { it.photo = g.photoURL; mediaWith(media, it, g.photoURL, ph); }
        if (!it.genres.length && g.genre) { it.genres = [g.genre]; setGenres(); }
        const n = Array.isArray(g.memberIds) ? g.memberIds.length : 0;
        if (n) meta.firstChild.textContent = `Grup · ${n} üye`;
      });
    } else {
      userInfo(it.id).then((u) => {
        if (!alive || !u) return;
        if (u.photoURL && u.photoURL !== it.photo) { it.photo = u.photoURL; mediaWith(media, it, u.photoURL, ph); }
        const g = artistGenres(u); if (g.length) { it.genres = g; setGenres(); }
        setRate(fmtRating(u.avgRating ?? u.rating));
        folEl.textContent = fmtK(u.followerCount);
      });
    }
    return cell;
  }

  function venueCard(it) {
    const href = "#/mekan/" + encodeURIComponent(it.id);
    const ph = () => h("span", { class: "dk-favoriler-ph is-venue" }, cardInitial(it.name));
    const gchip = h("span", { class: "dk-favoriler-gchip is-venue", hidden: true });
    const media = h("a", { href, class: "dk-favoriler-media", "aria-label": `${it.name} mekan sayfası` }, gchip);
    mediaWith(media, it, null, ph);
    const metaTx = h("span", {}, it.city || "—");
    const heart = heartBtn(it.name);
    const article = h("article", { class: "dk-favoriler-card dk-card" },
      media,
      h("div", { class: "dk-favoriler-foot" },
        h("span", { class: "dk-favoriler-txt" },
          h("a", { href, class: "dk-favoriler-name" }, it.name),
          h("span", { class: "dk-favoriler-meta" }, svgRaw(P.pin, { size: 12, sw: "2", color: "#4ED8FF" }), metaTx)),
        heart));
    const cell = h("div", { class: "dk-favoriler-cell" }, article);
    heart.addEventListener("click", (e) => remove(it, cell, e.detail === 0));
    userInfo(it.id).then(async (u) => {
      if (!alive || !u) return;
      if (u.photoURL) mediaWith(media, it, u.photoURL, ph);
      const g = artistGenres(u);
      if (g.length) { gchip.hidden = false; gchip.textContent = chipText(g, ", "); }
      const area = u.district || u.city || it.city || "";
      const r = fmtRating(u.avgRating ?? u.rating);
      if (r) metaTx.textContent = [area, "★ " + r, Number(u.capacity) > 0 ? `${u.capacity} kişi` : null].filter(Boolean).join(" · ");
      else {
        metaTx.textContent = area || "—";
        const ev = await eventsOf("venue", it.id);
        const next = ev?.upcoming?.[0];
        if (alive && next) metaTx.textContent = [area, `Sıradaki: ${next.title || "Etkinlik"}, ${dayTime(_startMs(next)).replace(/ \d\d:\d\d$/, "")}`].filter(Boolean).join(" · ");
      }
    });
    return cell;
  }

  function eventCard(it) {
    const href = "#/etkinlik/" + encodeURIComponent(it.id);
    const f = it.fav || {};
    const media = h("a", { href, class: "dk-favoriler-media is-event", "aria-label": `${it.name} etkinlik sayfası` });
    const line = h("span", { class: "dk-favoriler-eline" });
    const titleA = h("a", { href, class: "dk-favoriler-etitle" }, it.name);
    const sub = h("span", { class: "dk-favoriler-esub" });
    const price = h("span", { class: "dk-favoriler-price" });
    const heart = heartBtn(it.name);
    const fill = (e) => {
      const g = (e ? primaryGenre(e) : null) || f.genre || "";
      const fam = genreFamily(g);
      const ph = () => h("span", { class: "dk-favoriler-ph is-event", style: { background: `linear-gradient(150deg, ${fam.color}, ${fam.dark})` } }, cardInitial(it.name));
      mediaWith(media, { kind: "event" }, e?.bannerUrl || e?.imageUrl || null, ph);
      media.querySelector(".dk-dt")?.remove();
      const ms = e ? _startMs(e) : null;
      if (ms != null) media.append(dateTile(ms));
      const over = e ? _isOver(e) : false;
      const when = e ? (over ? "GEÇTİ" : evWhenUp(e)) : trUpper(f.date || "");
      line.textContent = [g ? genreUp(g) : "ETKİNLİK", when].filter(Boolean).join(" · ");
      line.style.color = genreColor(g);
      if (e?.title) { titleA.textContent = e.title; it.name = e.title; }
      sub.textContent = [e?.artistName || e?.artist || f.artist, e?.venueName || e?.venue || f.venue].filter(Boolean).join(" · ") || "—";
      const p = e ? (e.ticketPrice ?? e.price) : f.price;
      price.textContent = fmtPrice(p);
      price.classList.toggle("is-free", isFree(p));
    };
    fill(null);
    const article = h("article", { class: "dk-favoriler-card dk-card" },
      media,
      h("div", { class: "dk-favoriler-ebody" }, line, titleA, sub),
      h("div", { class: "dk-favoriler-efoot" }, price, heart));
    const cell = h("div", { class: "dk-favoriler-cell" }, article);
    heart.addEventListener("click", (e) => remove(it, cell, e.detail === 0));
    eventCached(it.id).then((e) => { if (alive && e) { fill(e); heart.setAttribute("aria-label", `${it.name} favorilerden çıkar`); } });
    return cell;
  }
  const _evs = new Map();
  const eventCached = (id) => { if (!_evs.has(id)) _evs.set(id, eventById(id).catch(() => null)); return _evs.get(id); };

  // ── liste (anahtarlı ızgara: çıkarma/geri almada değişmeyen kartlar yerinde kalır) ──
  const kg = keyedGrid({ cls: "dk-favoriler-grid", base: 120, step: 60,
    build: (it) => (it.kind === "venue" ? venueCard(it) : it.kind === "event" ? eventCard(it) : artistCard(it)) });
  const tabKey = (it) => (it.kind === "group" ? "artist" : it.kind);
  function draw() {
    if (!alive) return;
    const list = lists[tab];
    if (list == null) {
      body.setAttribute("aria-busy", "true");
      body.replaceChildren(h("div", { class: "dk-favoriler-grid" },
        ...[0, 1, 2].map(() => h("div", { class: "dk-favoriler-skel" }, dkSkeleton({ h: 188, r: 0 }),
          h("div", { class: "dk-favoriler-skelb" }, dkSkeleton({ w: "60%", h: 18 }), dkSkeleton({ w: "40%", h: 13 }))))));
      return;
    }
    body.removeAttribute("aria-busy");
    if (!list.length) {
      kg.reset();
      const [title, icon] = EMPTY[tab];
      body.replaceChildren(dkEmpty({
        ring: true, cls: "dk-rise dk-favoriler-empty", icon: svgPath(icon, { size: 28, sw: "1.6" }),
        title: loadErr ? "Favoriler yüklenemedi." : title,
        sub: loadErr ? "Bağlantını kontrol edip sayfayı yenile." : "Sanatçı, mekan veya etkinlik sayfalarında kalp simgesine basarak ekleyebilirsiniz.",
        action: loadErr ? null : dkButton("Keşfet'e git", { variant: "light", size: 42, href: "#/kesfet" }),
      }));
      return;
    }
    const fresh = kg.render(list, tab);
    if (fresh) body.replaceChildren(fresh);
  }
  function focusNear(at, preventScroll = false) {
    if (!alive) return;
    const cells = kg.grid && kg.grid.isConnected ? [...kg.grid.children] : [];
    const c = cells.length ? cells[Math.min(at, cells.length - 1)] : null;
    const t = c?.querySelector(".dk-favoriler-heart") || body.querySelector(".dk-empty a[href], .dk-empty button") || seg.querySelector('[aria-selected="true"]');
    try { t?.focus({ preventScroll }); } catch (_) {}
  }

  // ── zil ──
  const bellBusy = new Set();
  async function toggleBell(it, setBell) {
    if (bellBusy.has(it.key) || it.op) return;
    bellBusy.add(it.key);
    const next = !it.notify;
    it.notify = next; setBell(next); setInfo();
    bellToast(next ? `${it.name} için etkinlik bildirimleri açık` : `${it.name} için bildirimler kapatıldı`, next ? "bell" : "off");
    try {
      await (it.kind === "group" ? setGroupFollowNotify(uid, it.docId, next) : setFollowNotify(uid, it.docId, next));
      if (it.raw) it.raw.notifyEvents = next;   // "GERİ AL" anlık görüntüsü güncel kalsın
    } catch (_) {
      it.notify = !next;
      if (alive) { setBell(false); setInfo(); dkToast("İşlem başarısız", { type: "err" }); }
    } finally { bellBusy.delete(it.key); }
  }

  // ── çıkar: yazım hemen → çıkış animasyonu → kart kalkar → 4 sn "GERİ AL" (telafi yazımı) ──
  function remove(it, cell, viaKeyboard = false) {
    if (it.op || bellBusy.has(it.key)) return;
    const arr = lists[tabKey(it)];
    if (!arr || !arr.includes(it)) return;
    const hadFocus = cell.contains(document.activeElement);
    const op = removeEntry(uid, it);
    it.op = op;
    countsChanged();
    cell.classList.remove("dk-rise");
    cell.classList.add("dk-out-scale");
    let failed = false, toast = null;
    op.done.then(countsChanged, () => {
      failed = true; it.op = null;
      toast?.close();
      countsChanged();
      if (!alive) return;
      cell.classList.remove("dk-out-scale");
      if (!arr.includes(it)) arr.splice(Math.min(it.at ?? 0, arr.length), 0, it);
      setCounts(); draw();
      dkToast("İşlem başarısız", { type: "err" });
    });
    later(() => {
      if (failed) return;
      const at = arr.indexOf(it);
      if (at < 0) return;
      it.at = at;
      arr.splice(at, 1);
      setCounts();
      draw();
      toast = undoToast(`${it.name} favorilerden kaldırıldı`, {
        onUndo: () => restore(it, at, op),
        focusAfter: () => focusNear(at),
        decorate: (el) => decorate(el, "rm"),
      });
      undoT = toast;
      // klavye: odak GERİ AL'a (odaktayken süre durur; Tab/Esc listeye döner). İşaretçi: odak body'ye düşmesin → sıradaki kart.
      if (hadFocus) { if (viaKeyboard) toast.focusAction(); else focusNear(at, true); }
    }, reduceMotion() ? 0 : 360);
  }
  function restore(it, at, op) {
    it.op = null;
    const arr = lists[tabKey(it)];
    if (alive) {
      if (!arr.includes(it)) arr.splice(Math.min(at, arr.length), 0, it);
      setCounts();
      draw();
      const btn = kg.cell(it.key)?.querySelector(".dk-favoriler-heart");
      if (btn && (document.activeElement === document.body || document.activeElement?.closest?.(".dk-tst"))) { try { btn.focus({ preventScroll: true }); } catch (_) {} }
    }
    op.undo().then(countsChanged, () => {
      countsChanged();
      dkToast("İşlem başarısız", { type: "err" });
      if (!alive) return;
      const i = arr.indexOf(it);
      if (i >= 0) { arr.splice(i, 1); setCounts(); draw(); }
    });
  }

  setCounts();
  draw();
  load();

  return {
    node: shell.node,
    update(query) {
      const nt = tabOf(query);
      if (nt !== tab) { tab = nt; seg.dk.set(tab); syncPanel(); draw(); }
    },
    onSession(sess) {
      // bildirim ana anahtarları (notificationSettings) değişmiş olabilir → şeridi güncelle; kimlik aynıysa yeniden kurma
      if (!sess?.user || sess.guest || sess.user.uid !== uid) return false;
      setInfo();
      return true;
    },
    destroy() {
      alive = false;
      timers.forEach(clearTimeout); timers.clear();
      try { undoT?.close(); } catch (_) {}   // yazım zaten yapıldı; geri alma penceresi bu sayfayla biter
      undoT = null;
      shell.destroy();
    },
  };
}
