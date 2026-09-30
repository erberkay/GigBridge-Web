// Dinleyici Top 10 — masaüstü (≥769 px). Registry anahtarı: top10 (#/top10; misafir + dinleyici, masaüstü panel rolleri de okur).
// Artboard YOK → WebSanatciTop10'dan türetildi (spec public-a "Header Top 10 link target" + sanatci §WebSanatciTop10): kürsü 1–3 +
// tablo 4–10, "Senin sıran" kartı YOK; favori (kalp) + etkinlik bildirimi (zil) design/DinleyiciTop10.dc.html'den (sahibi notu
// "TOP 10 + FAVORİ + ETKİNLİK BİLDİRİMİ" = functions/rankings.js başlığındaki n-top10-bildirim).
// CSS: css/dk-top10.css (.dk-top10 kökü) + ortak parçalar css/dk-sanatci-top10.css (.dk-t10-*, top10-parts.js yükler).
// Mobil (≤768): router #/top10'u #/kesfet'e yönlendirir (legacy politika; bu modül yüklenmez).
//
// Veri — app ListenerTop10Screen ile aynı sıra:
//   1) rankings/artists_{week|month|all} (functions/rankings.js saatlik yazar; kural: isSignedIn okur). Üçü de var ve ≤2 sa tazeyse
//      kullanılır (items: id,name,photoURL,genre,isGroup,city,district,avg,count,score,rank,prevRank,memberCount).
//   2) Yoksa/eskiyse/okunamazsa İSTEMCİDE aynı formül (top10-parts.rankCF: öncül 4.5, C 8, yalnız dönemde yorumu olanlar; grup = gruba
//      doğrudan + üye yorumları): reviews (targetType=="artist"; mevcut sorgu) + listRealArtists() + listGroups(). DEĞ. için 24 sa önceki
//      pencereyle aynı hesap (CF'in günlük taban çizgisi karşılığı).
//   İkisi de başarısızsa "Sıralama yüklenemedi." + Yeniden dene.
// Hareket (DEĞ.): prevRank − rank (tür içindeki genel sıra; app ile aynı) · prevRank yoksa nötr çizgi.
// Favori/zil (girişli gerçek kullanıcı; misafirde dkLoginGate("Favoriye almak")):
//   Kalp (sanatçı) = data.js followArtist/unfollowArtist (web'in tek takip yolu: following + followers aynası + new_follower bildirimi).
//   Kalp (grup)    = users/{uid}/followingGroups/{gid} + groups/{gid}/followers/{uid} — app services/follow.ts followGroup/unfollowGroup
//                    ile AYNI şekil (web data.js'te karşılığı yok; yerel yardımcı).
//   Zil            = following(.Groups)/{id}.notifyEvents (app setFollowNotify / setGroupFollowNotify ile aynı: updateDoc + ayna merge;
//                    alan yoksa AÇIK sayılır — CF `notifyEvents !== false`). Yalnız takip ediliyorsa görünür. İyimser UI; hata → geri al + tost.
//   Durum canlı: onSnapshot users/{uid}/following + followingGroups (app subscribeFollowStates ile aynı yorum). İlk anlık görüntü
//   gelene dek o türün kalp/zil düğmeleri PASİF ve FAVORİ hapı gizli (bilinmeyen durumda followArtist'in setDoc'u mevcut takip
//   dokümanını ezmesin: notifyEvents:false kaybı + mükerrer "Yeni takipçi"). Abonelik hata verirse pasif kalır + tost.
// Şehir: gb_city (tek doğruluk kaynağı; header şehir düğmesiyle "dk:citychange" üzerinden senkron). Çipler/“Diğer ▾” gb_city'yi yazar.
// URL: #/top10?tur=gruplar&donem=hafta|ay&sehir=…&ilce=… (history.replaceState; update(query) uygular).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, serverTimestamp } from "../../firebase.js";
import { listRealArtists, listGroups, followArtist, unfollowArtist } from "../../data.js";
import { publicShell } from "../shared/public-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkToast, dkPopover, dkLoginGate } from "../shared/ui.js";
import { isRealUser } from "../shared/overlays.js";
import { cityPicker, CITY_EVENT } from "../shared/city-picker.js";
import { PROVINCES, ALL_CITIES, getActiveCity, setActiveCity, fold, toMs, writeQuery, debounce } from "../shared/helpers.js";
import {
  PERIODS, periodBySlug, kindBySlug, P, placeOf, eyebrowText, districtsIn, inPlace, firstGenre,
  loadArtistReviews, aggregateReviews, windowOf, rankCF,
  kindTabs, filterCard, podium, rankTable, emptyBox, skeletonPodium, skeletonTable, infoCard, legendCard,
} from "../artist/top10-parts.js";

let panelSeq = 0;

const STALE_MS = 2 * 60 * 60 * 1000;   // sunucu dokümanı bundan eskiyse istemcide hesapla (app ile aynı)
const TOAST_MS = 2800;                 // DinleyiciTop10 DCLogic
const cityFromParam = (v) => { const s = fold(String(v || "").replace(/-/g, " ")); return s && s !== "tumu" ? (PROVINCES.find((p) => fold(p) === s) || "") : null; };
const cityFromGlobal = () => { const c = getActiveCity(); return c && c !== ALL_CITIES ? (PROVINCES.find((p) => fold(p) === fold(c)) || c) : ""; };

// ── Sunucu sıralaması (app loadServerRankings) ──
function parseItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && x.id).map((x) => ({
    id: String(x.id), name: String(x.name ?? (x.isGroup ? "Grup" : "Sanatçı")),
    photoURL: typeof x.photoURL === "string" && x.photoURL ? x.photoURL : null, genre: String(x.genre ?? ""), isGroup: !!x.isGroup,
    city: String(x.city ?? ""), district: String(x.district ?? ""), avg: Number(x.avg) || 0, count: Number(x.count) || 0, score: Number(x.score) || 0,
    memberCount: typeof x.memberCount === "number" ? x.memberCount : null, rank: typeof x.rank === "number" ? x.rank : null,
    prevRank: typeof x.prevRank === "number" ? x.prevRank : null,
  }));
}
async function loadServerRankings() {
  try {
    const snaps = await Promise.all(PERIODS.map((p) => getDoc(doc(db, "rankings", `artists_${p.cf}`))));
    const out = {};
    for (let i = 0; i < PERIODS.length; i++) {
      const s = snaps[i];
      if (!s.exists()) return null;
      const d = s.data();
      const at = toMs(d.updatedAt) ?? (typeof d.computedAtMs === "number" ? d.computedAtMs : null);
      if (at == null || Date.now() - at > STALE_MS) return null;
      const items = parseItems(d.items);
      out[PERIODS[i].key] = { artists: items.filter((x) => !x.isGroup), groups: items.filter((x) => x.isGroup) };
    }
    return out;
  } catch (_) { return null; }   // kural/ağ → istemci hesabı
}
// ── İstemci yedeği (functions/rankings.js ile aynı mantık) + 24 sa önceki taban çizgisi ──
async function computeLocalRankings() {
  const [reviews, artists, groups] = await Promise.all([loadArtistReviews(), listRealArtists(), listGroups(null).catch(() => [])]);
  const real = artists.filter((a) => a.pendingDeletion !== true);
  const now = Date.now();
  const out = {};
  PERIODS.forEach((p) => {
    const cur = rankCF({ artists: real, groups, agg: aggregateReviews(reviews, windowOf(p.key, now)) });
    const base = rankCF({ artists: real, groups, agg: aggregateReviews(reviews, windowOf(p.key, now, { baseline: true })) });
    const prevOf = (list) => new Map(list.map((x) => [x.id, x.rank]));
    const pa = prevOf(base.artists), pg = prevOf(base.groups);
    out[p.key] = {
      artists: cur.artists.map((x) => ({ ...x, prevRank: pa.get(x.id) ?? null })),
      groups: cur.groups.map((x) => ({ ...x, prevRank: pg.get(x.id) ?? null })),
    };
  });
  return out;
}

// ── Grup favorisi + zil (app services/follow.ts ile aynı şekil) ──
async function followGroup(uid, g) {
  await setDoc(doc(db, "users", uid, "followingGroups", g.id), {
    groupId: g.id, groupName: g.name, targetType: "group", genre: g.genre ?? "", photoURL: g.photoURL ?? null, notifyEvents: true, followedAt: serverTimestamp(),
  });
  setDoc(doc(db, "groups", g.id, "followers", uid), { followedAt: serverTimestamp(), notifyEvents: true }).catch(() => {});
}
async function unfollowGroup(uid, gid) {
  await deleteDoc(doc(db, "users", uid, "followingGroups", gid));
  deleteDoc(doc(db, "groups", gid, "followers", uid)).catch(() => {});
}
// SHARED-CANDIDATE: account/favoriler.js da aynı zil yazımını yerel tutuyor (data.js'te setFollowNotify yok) → data.js'e taşınmalı.
async function setFollowNotify(uid, targetId, on) {
  await updateDoc(doc(db, "users", uid, "following", targetId), { notifyEvents: on, notifyUpdatedAt: serverTimestamp() });
  setDoc(doc(db, "users", targetId, "followers", uid), { notifyEvents: on }, { merge: true }).catch(() => {});
}
async function setGroupFollowNotify(uid, gid, on) {
  await updateDoc(doc(db, "users", uid, "followingGroups", gid), { notifyEvents: on, notifyUpdatedAt: serverTimestamp() });
  setDoc(doc(db, "groups", gid, "followers", uid), { notifyEvents: on }, { merge: true }).catch(() => {});
}

export function top10View(ctx) {
  const s = ctx.session || session;
  const myUid = s.user?.uid || null;
  const real = isRealUser();
  const guestSnap = !!s.guest;
  const profSnap = JSON.stringify(s.profile || {});
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });

  // ── durum ──
  const qp = ctx.query || new URLSearchParams();
  let kind = kindBySlug(qp.get("tur"));
  let per = periodBySlug(qp.get("donem") || "tum").key;
  const urlCity = cityFromParam(qp.get("sehir"));
  let city = urlCity != null ? urlCity : cityFromGlobal();
  let district = (qp.get("ilce") || "").trim();
  let data = null, failed = false, anim = 0;
  // takip durumu: canlı harita (id → notify) + iyimser geçersiz kılmalar (tür:id → { followed, notify })
  let artistFollows = {}, groupFollows = {};
  // ilk anlık görüntü geldi mi (a: following · g: followingGroups). Misafir/girişsiz: yazma yok (kapı modalı) → hazır sayılır.
  const followLoaded = { a: !(myUid && real), g: !(myUid && real) };
  let followErr = false;
  const kindKey = (it) => (it.isGroup ? "g" : "a");
  const overrides = new Map();
  const inflight = new Set();

  const shell = publicShell({ active: "top10", footer: "full" });
  unsubs.push(() => shell.destroy());
  if (urlCity != null) shell.header?.setCity?.(city || ALL_CITIES);

  // ── başlık ──
  const panelId = `dk-t10-panel-${++panelSeq}`;   // sonuç paneli (tür + dönem sekmeleri aria-controls)
  const eyebrow = h("span", { class: "dk-eyebrow dk-top10-eyebrow" });
  const favText = h("span", {});
  const favPill = h("span", { class: "dk-top10-fav", hidden: true }, svgRaw(P.heart, { size: 13, fill: true }), favText);
  const tabs = kindTabs({ value: kind, controls: panelId, onChange: (k) => { kind = k; go(); } });
  const head = h("div", { class: "dk-top10-head dk-rise" },
    h("div", { class: "dk-top10-hl" },
      eyebrow,
      h("h1", { class: "dk-display dk-t52" }, "Bölgenin ", h("em", {}, "Top 10"), "'u"),
      h("p", { class: "dk-top10-sub" }, "Bölgendeki en çok puan ve yorum alanlar. Favoriye al, yeni etkinliklerinden haberin olsun.")),
    h("div", { class: "dk-top10-hr" }, favPill, tabs));

  // ── filtre kartı ──
  let pop = null;
  const pickCity = (c) => {
    // tek doğruluk kaynağı gb_city: yaz + yay (header şehir düğmesi ve bu sayfa "dk:citychange" ile güncellenir)
    setActiveCity(c || ALL_CITIES);
    window.dispatchEvent(new CustomEvent(CITY_EVENT, { detail: { city: c || ALL_CITIES } }));
  };
  const fc = filterCard({
    per, city, district, kind, controls: panelId,
    onPer: (k) => { per = k; go(); },
    // aktif şehir çipine tekrar tık: yalnız ilçeyi sıfırlar (gb_city'ye yazmaz; dk:citychange aynı şehirde yok sayılır)
    onCity: (c) => { if (c === city) { if (district) { district = ""; go(); } return; } pickCity(c); },
    onDistrict: (d) => { district = d || ""; go(); },
    onOther: (btn) => {
      if (pop) { pop.close("toggle", true); return; }
      // Odak: seçim/Shift+Tab sonrası tetikleyiciye elle döner (dkPopover dönüşü close(r) refocus'u iletmiyor — SHARED-CANDIDATE);
      // odak başka yoldan dışarı çıkarsa popover kapanır.
      const refocus = () => { try { btn.focus({ preventScroll: true }); } catch (_) {} };
      const cp = cityPicker({ value: city || ALL_CITIES, onPick: () => { pop?.close("pick"); refocus(); } });
      btn.classList.add("is-open");
      pop = dkPopover({ anchor: btn, content: cp.node, label: "Şehir seç", width: 320, offset: 8, cls: "dk-cp-pop", onClose: () => { pop = null; btn.classList.remove("is-open"); } });
      const pn = pop.node;
      pn.addEventListener("keydown", (e) => {
        if (e.key !== "Tab" || !e.shiftKey) return;
        if (document.activeElement === pn.querySelector("button, input")) { e.preventDefault(); pop?.close("tab"); refocus(); }
      });
      pn.addEventListener("focusout", (e) => { const t = e.relatedTarget; if (t && t !== btn && !pn.contains(t)) pop?.close("blur"); });
      requestAnimationFrame(() => { try { cp.input.focus({ preventScroll: true }); } catch (_) {} });
    },
  });
  unsubs.push(() => pop?.close("destroy"));
  const onCityEvent = (e) => {
    const raw = e.detail?.city;
    const c = !raw || raw === ALL_CITIES ? "" : (PROVINCES.find((p) => fold(p) === fold(raw)) || raw);
    if (c === city) return;
    city = c; district = "";
    go();
  };
  window.addEventListener(CITY_EVENT, onCityEvent);
  unsubs.push(() => window.removeEventListener(CITY_EVENT, onCityEvent));

  // ── ana ızgara ──
  const left = h("div", { class: "dk-t10-left", id: panelId, role: "tabpanel", "aria-label": "Sıralama", tabindex: "-1" });
  const aside = h("aside", { "aria-label": "Sıralama hakkında", class: "dk-top10-aside" },
    infoCard({ title: "Favori ve etkinlik bildirimi", icon: P.bell, body: "Favoriye aldığın sanatçılar yeni etkinlik açtığında bildirim alırsın; zil ile sanatçı bazında kapatabilirsin." }),
    infoCard({ title: "Sıralama nasıl hesaplanır?", body: "Sıralama puan ve yorum sayısına göre ağırlıklı hesaplanır; az yorumlu 5.0 puanlar tepeye zıplamaz. Yalnız seçilen dönemde yorum alanlar listelenir. Gruplarda grubun ve üyelerinin aldığı yorumlar birlikte sayılır." }),
    legendCard());
  const root = h("div", { class: "dk-top10" }, head, fc.node, h("div", { class: "dk-top10-grid" }, left, aside));
  shell.main.append(root);

  // ── favori / zil ──
  const keyOf = (it) => (it.isGroup ? "g:" : "a:") + it.id;
  const followOf = (it) => {
    const o = overrides.get(keyOf(it));
    if (o) return o;
    const map = it.isGroup ? groupFollows : artistFollows;
    return it.id in map ? { followed: true, notify: map[it.id] } : { followed: false, notify: false };
  };
  const paintFav = () => {
    if (!real || !followLoaded.a || !followLoaded.g) { favPill.hidden = true; return; }
    const set = new Set([...Object.keys(artistFollows).map((k) => "a:" + k), ...Object.keys(groupFollows).map((k) => "g:" + k)]);
    overrides.forEach((o, k) => { if (o.followed) set.add(k); else set.delete(k); });
    favText.textContent = `${set.size} FAVORİ`;   // görünen metin okunur (rolsüz span'e aria-label konmaz)
    favPill.hidden = false;
  };
  const showToast = (text, type = "ok") => { if (alive) dkToast(text, { type, duration: TOAST_MS }); };

  async function toggleFav(it) {
    if (dkLoginGate("Favoriye almak")) return;
    if (!myUid || !followLoaded[kindKey(it)]) return;   // takip durumu bilinmeden yazma yok
    const key = keyOf(it);
    if (inflight.has(key)) return;
    const next = !followOf(it).followed;
    inflight.add(key);
    overrides.set(key, { followed: next, notify: next });
    repaintActs();
    showToast(next ? `${it.name} favorilerde · yeni etkinliklerinde bildirim alacaksın` : `${it.name} favorilerden çıkarıldı`, next ? "ok" : "neutral");
    try {
      const target = { id: it.id, name: it.name, genre: it.genre, photoURL: it.photoURL };
      if (it.isGroup) await (next ? followGroup(myUid, target) : unfollowGroup(myUid, it.id));
      else await (next ? followArtist(myUid, target) : unfollowArtist(myUid, it.id));
      // anlık görüntü gelmeden önce iyimser durumu gerçeğe taşı (onSnapshot yerel yazımı da getirir)
      const map = it.isGroup ? groupFollows : artistFollows;
      if (next) map[it.id] = true; else delete map[it.id];
    } catch (_) {
      showToast(`${it.name} için işlem kaydedilemedi, geri alındı`, "err");
    } finally {
      overrides.delete(key); inflight.delete(key);
      if (alive) repaintActs();
    }
  }
  async function toggleBell(it) {
    if (!myUid || !real || !followLoaded[kindKey(it)]) return;
    const key = keyOf(it);
    if (inflight.has(key)) return;
    const cur = followOf(it);
    if (!cur.followed) return;
    const next = !cur.notify;
    inflight.add(key);
    overrides.set(key, { followed: true, notify: next });
    repaintActs();
    showToast(next ? `${it.name} için etkinlik bildirimleri açık` : `${it.name} için bildirimler kapatıldı`, next ? "info" : "neutral");
    try {
      await (it.isGroup ? setGroupFollowNotify(myUid, it.id, next) : setFollowNotify(myUid, it.id, next));
      const map = it.isGroup ? groupFollows : artistFollows;
      if (it.id in map) map[it.id] = next;
    } catch (_) {
      showToast(`${it.name} için bildirim ayarı kaydedilemedi, geri alındı`, "err");
    } finally {
      overrides.delete(key); inflight.delete(key);
      if (alive) repaintActs();
    }
  }
  // Düğmeler (DinleyiciTop10: 44×40, r6; kalp pembe · zil camgöbeği; zil yalnız favorideyken)
  const actRefs = new Set();
  function actions(it) {
    if (!it.isGroup && it.id === myUid) return h("span", { class: "dk-top10-noact", "aria-hidden": "true" });   // kendini favoriye alamaz
    const heart = h("button", { type: "button", class: "dk-top10-heart dk-press" });
    const bell = h("button", { type: "button", class: "dk-top10-bell dk-press" });
    const spacer = h("span", { class: "dk-top10-spacer", "aria-hidden": "true" });
    heart.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggleFav(it); });
    bell.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggleBell(it); });
    // Sabit ad + aria-pressed (durum tek kanaldan; ikon düğmeler — görünen metin yok)
    heart.setAttribute("aria-label", `Favori: ${it.name}`);
    bell.setAttribute("aria-label", `Etkinlik bildirimi: ${it.name}`);
    const paint = () => {
      const st = followOf(it);
      const ready = followLoaded[kindKey(it)];
      heart.disabled = !ready; bell.disabled = !ready;
      heart.classList.toggle("is-on", st.followed);
      heart.setAttribute("aria-pressed", st.followed ? "true" : "false");
      heart.replaceChildren(svgRaw(P.heart, { size: 18, sw: "1.9", attrs: { fill: st.followed ? "currentColor" : "none" } }));
      bell.hidden = !st.followed; spacer.hidden = st.followed;
      bell.classList.toggle("is-on", st.notify);
      bell.setAttribute("aria-pressed", st.notify ? "true" : "false");
      bell.replaceChildren(svgRaw(st.notify ? P.bell : P.bellOff, { size: 18, sw: "1.9" }));
    };
    paint();
    const wrap = h("span", { class: "dk-top10-acts" }, heart, bell, spacer);
    wrap._paint = paint;
    actRefs.add(wrap);
    return wrap;
  }
  function repaintActs() {
    actRefs.forEach((w) => { if (w.isConnected) w._paint(); else actRefs.delete(w); });
    paintFav();
  }

  // ── çizim ──
  const noun = () => (kind === "groups" ? "GRUP" : "SANATÇI");
  function draw() {
    // ilçe yazımını kayıtlardakine eşle (görünen başlık/çip "besiktas" değil "Beşiktaş"; süzgeç zaten fold ile karşılaştırır)
    let districts = [];
    if (data && kind === "artists") {
      const all = new Map();
      PERIODS.forEach((p) => (data[p.key]?.artists || []).forEach((x) => { if (!all.has(x.id)) all.set(x.id, x); }));
      districts = districtsIn([...all.values()], city);
      const cd = district ? districts.find((d) => fold(d) === fold(district)) : null;
      if (cd && cd !== district) { district = cd; syncUrl(); }
    }
    eyebrow.textContent = eyebrowText(city, kind === "artists" ? district : "");
    tabs.dk.set(kind);
    const animCls = anim % 2 ? "dk-fa" : "dk-fb";
    actRefs.clear();
    if (failed) {
      fc.update({ per, city, district, kind, districts: [], count: "" });
      left.removeAttribute("aria-busy");
      left.replaceChildren(emptyBox({ title: "Yüklenemedi", sub: "Sıralama yüklenemedi. Bağlantıyı kontrol edip yeniden dene.",
        action: h("button", { type: "button", class: "dk-t10-retry dk-press", onclick: () => { try { left.focus({ preventScroll: true }); } catch (_) {} load(); } }, "Yeniden dene") }));
      return;
    }
    if (!data) {
      fc.update({ per, city, district, kind, districts: [], count: "" });
      left.setAttribute("aria-busy", "true");
      left.replaceChildren(skeletonPodium(), skeletonTable());
      return;
    }
    left.removeAttribute("aria-busy");
    const src = data[per]?.[kind] || [];
    // ilçe seçenekleri (yukarıda): sanatçıların tüm dönemlerdeki kayıtlarından (app: sıralamada gerçekten kaydı olan ilçeler)
    const visible = src.filter((x) => inPlace(x, city, district, { useDistrict: kind === "artists" })).slice(0, 10);
    fc.update({ per, city, district, kind, districts, count: `${visible.length} ${noun()}` });
    if (!visible.length) {
      const place = city ? placeOf(city, kind === "artists" ? district : "") : "";
      const sub = place ? `${place} için henüz sıralama yok.` : per === "a" ? "Henüz sıralanacak kayıt yok." : `${per === "w" ? "Bu hafta" : "Bu ay"} henüz değerlendirme yok.`;
      left.replaceChildren(emptyBox({ sub, anim: animCls }));
      return;
    }
    const rows = visible.map((x, i) => ({
      ...x, sub: x.isGroup ? `${x.memberCount ?? 0} üye${x.genre ? ` · ${x.genre}` : ""}` : [x.genre, x.district || x.city].filter(Boolean).join(" · "),
      isMe: !x.isGroup && x.id === myUid, rank: i + 1,
      href: x.isGroup ? null : "#/sanatci/" + encodeURIComponent(x.id),   // web'de grup sayfası yok → grup satırı gezinmez
      delta: x.prevRank != null && x.rank != null ? x.prevRank - x.rank : null,
    }));
    const kids = [];
    const showPodium = rows.length >= 3;
    if (showPodium) kids.push(podium(rows.slice(0, 3), { anim: animCls, actions }));
    const rest = showPodium ? rows.slice(3) : rows;
    if (rest.length) kids.push(rankTable(rest, { colName: kind === "groups" ? "GRUP" : "SANATÇI", anim: animCls, actions }));
    left.replaceChildren(...kids);
    paintFav();
  }

  const syncUrl = debounce(() => {
    if (!alive) return;
    writeQuery({ tur: kind === "groups" ? "gruplar" : null, donem: per === "a" ? null : PERIODS.find((p) => p.key === per)?.slug,
      sehir: city || null, ilce: city && kind === "artists" && district ? district : null });
  }, 150);
  unsubs.push(() => syncUrl.cancel());
  function go() { anim++; syncUrl.flush(); draw(); }

  async function load() {
    failed = false; data = null;
    draw();
    try {
      const server = await loadServerRankings();
      if (!alive) return;
      data = server || await computeLocalRankings();
    } catch (_) {
      failed = true;
    }
    if (alive) draw();
  }
  load();

  // takip durumları (canlı; yalnız gerçek kullanıcı — misafirin alt koleksiyon okuma izni yok)
  if (myUid && real) {
    const sub = (name, isGroup) => onSnapshot(collection(db, "users", myUid, name), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const x = d.data();
        if (!isGroup && typeof x.targetType === "string" && x.targetType !== "" && x.targetType !== "artist") return;
        const id = (isGroup ? x.groupId : x.artistId) ?? d.id;
        map[String(id)] = x.notifyEvents !== false;
      });
      if (isGroup) groupFollows = map; else artistFollows = map;
      followLoaded[isGroup ? "g" : "a"] = true;
      if (alive) repaintActs();
    }, () => {
      // okunamadı → o türün düğmeleri pasif kalır (bilinmeyen durumda yazma yok) + bir kez tost
      if (!alive || followErr) return;
      followErr = true;
      showToast("Favoriler yüklenemedi", "err");
    });
    unsubs.push(sub("following", false), sub("followingGroups", true));
  }
  paintFav();

  return {
    node: shell.node,
    destroy() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
    update(query) {
      const nk = kindBySlug(query?.get("tur"));
      const np = periodBySlug(query?.get("donem") || "tum").key;
      const uc = cityFromParam(query?.get("sehir"));
      const nc = uc != null ? uc : city;
      const nd = (query?.get("ilce") || "").trim();
      if (nk === kind && np === per && nc === city && nd === district) return;
      if (nc !== city) shell.header?.setCity?.(nc || ALL_CITIES);
      kind = nk; per = np; city = nc; district = nd; anim++;
      draw();
    },
    onSession(ns) {
      return (ns?.user?.uid || null) === myUid && !!ns?.guest === guestSnap && JSON.stringify(ns?.profile || {}) === profSnap;
    },
  };
}
