// WebTakip — "Takip ettiklerim" masaüstü görünümü (≥769 px). Registry anahtarı: takip (#/takip, yalnız dinleyici).
// Spec: specs/hesap.md WebTakip (+ §0 kabuk). Artboard: design/WebTakip.dc.html. CSS: css/dk-takip.css (.dk-takip kökü).
// Legacy karşılığı: js/pages/customer.js followingView() (≤768 aynen kalır).
//
// Legacy özellikleri (korundu): takip listesi (followingList — TÜM kayıtlar: legacy tek listede hepsini gösteriyordu),
// Türkçe aksan duyarsız arama (fold, isim içinde geçen), boş/arama-boş metinleri ("Henüz kimseyi takip etmiyorsunuz." /
// "Kullanıcı bulunamadı."), kart → sanatçı/mekan sayfası, takipten çıkma (following + followers aynası), hata toast'ı
// "İşlem başarısız", başlıkta takip sayısı (→ PageHead paragrafı).
// Yeni (tasarım + sahibi notu): Sanatçılar / Mekanlar sekmeleri (mekan "takibi" = favVenues + app'in genel takibindeki
// targetType:"venue" kayıtları), fotoğraflı kartlar, takipçi sayısı, YAKLAŞAN sayısı + sıradaki etkinlik, "BU GECE" rozeti,
// iyimser takipten çıkma + 4 sn "GERİ AL", "Profili gör".
// App eşliği (FollowingScreen): Sanatçılar sekmesinde sanatçılardan sonra takip edilen GRUPLAR (users/{uid}/followingGroups)
// ve app'in genel takibindeki diğer hedefler (targetType customer/organizer → "Kullanıcı"/"Organizatör"). Webde grup/
// kullanıcı/organizatör profil sayfası yok → bu kartlarda profil bağlantısı yok, yalnız "Takipten çık".
//
// Takipten çıkma: yazım HEMEN yapılır (sayfa yenilense/kapansa/çıkış yapılsa da kaybolmaz; legacy de hemen yazıyordu);
// "GERİ AL" telafi yazımıdır: silinen belgelerin anlık görüntüsü aynen geri yazılır (followArtist ÇAĞRILMAZ → new_follower
// bildirimi tekrar gitmez; onFollowArtist/onUnfollowArtist CF sayaçları -1/+1 dengelenir).
//
// URL: #/takip?sekme=mekan&q=… (replaceState; update(query) geri/ileri'de uygular).
// Veri: followingList, favVenues, followingGroups (yerel okuma), getUser (foto/takipçi/tür/semt), groups/{id} (üye sayısı),
// eventsByArtist + yerel salt-okuma etkinlik sorguları (events where venueId|groupId|organizerId == id — venueEvents()/
// organizerEvents() KULLANILMAZ: bitmiş etkinlik afişlerini silen yazım yan etkisi var). Yeni bileşik sorgu/indeks YOK.
// Yazım: following/{id} + users/{id}/followers/{uid} (data.unfollowArtist ile aynı iki silme) · favorites/{id}
// (data.unfavVenue) · followingGroups/{id} + groups/{id}/followers/{uid} (app unfollowGroup ile aynı).
//
// Bu dosya hesap-a grubunun (Profil/Takip/Favoriler) küçük ortak yardımcılarını da dışa aktarır (favoriler.js kullanır).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { db, collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc } from "../../firebase.js";
import { followingList, favVenues, getUser, eventsByArtist, unfavVenue, unfavEvent, eventStartMs as _startMs, isEventOver as _isOver } from "../../data.js";
import { accountShell } from "../shared/account-shell.js";
import { invalidateAccountCounts } from "../shared/live.js";
import { svgRaw } from "../shared/icons.js";
import { dkPageHead, dkSegmented, dkEmpty, dkButton, dkToast, dkLoginGate, dkSkeleton } from "../shared/ui.js";
import { fold, trUpper, rgba, isToday, isTomorrow, fmtTime, DAYS_TR_SHORT, MONTHS_TR_SHORT, writeQuery } from "../shared/helpers.js";
import { genreFamily, primaryGenre } from "../shared/genres.js";

// ══════════════════════════════════════════════════════════════════════
// Ortak yardımcılar (hesap-a: takip.js / favoriler.js / profil.js)
// ══════════════════════════════════════════════════════════════════════
export const UNDO_MS = 4000; // sahibi notu: "4 sn Geri al" (artboard 3.6 sn)

// users/{uid}/following yalnız SANATÇI takiplerini içermeyebilir (app'in genel takibi: targetType customer/venue/organizer).
// targetType yoksa/boşsa eski (dinleyici→sanatçı) kayıt → sanatçı (app subscribeFollowStates ile aynı kural).
export const isArtistTarget = (d) => typeof d?.targetType !== "string" || d.targetType === "" || d.targetType === "artist";
export const isVenueTarget = (d) => d?.targetType === "venue";
export const followTargetId = (d) => d?.artistId || d?.targetId || d?.id;
// followingList/favVenues/... satırı → belge verisi (anlık görüntü; "GERİ AL" bunu aynen geri yazar)
export const rawOf = (d) => { const { id: _id, ...rest } = d || {}; return rest; };

// Takip edilen gruplar (app followGroup: users/{uid}/followingGroups/{groupId}) — data.js'te okuyucu yok.
// SHARED-CANDIDATE: data.js followingGroupsList(uid) olmalı (app FollowingScreen/FavoritesScreen ile aynı koleksiyon).
export async function followingGroupsList(uid) {
  const s = await getDocs(collection(db, "users", uid, "followingGroups"));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// "8.2K" / "45K" / "120K" / "1.3M" (artboard biçimi; ".0" atılır)
// SHARED-CANDIDATE: helpers.kFmt ".0" bırakıyor; artboard'lar "45K" ister.
export function fmtK(n) {
  const x = Number(n) || 0;
  const f = (v) => v.toFixed(1).replace(/\.0$/, "");
  if (Math.abs(x) >= 1e6) return f(x / 1e6) + "M";
  if (Math.abs(x) >= 1000) return f(x / 1000) + "K";
  return String(Math.round(x));
}
// "Bugün 21:00" / "Yarın 22:00" / "Cmt 3 Eki 22:00"
export function dayTime(ms) {
  if (ms == null) return "";
  const d = new Date(ms);
  const day = isToday(ms) ? "Bugün" : isTomorrow(ms) ? "Yarın" : `${DAYS_TR_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]}`;
  return `${day} ${fmtTime(ms)}`;
}
// Artboard'lardaki "DJ " önekini atlayan baş harf
export const cardInitial = (name) => trUpper(String(name || "?").replace(/^DJ\s+/i, "").trim().charAt(0) || "?");

// Tür adı büyük harf: Latin (İngilizce) tür adları tr-TR ile "MELODİC"/"ELECTRONİC" olmasın (artboard "ELECTRONIC").
// SHARED-CANDIDATE: genres.genreLabel trUpper kullanıyor; aynı kural oraya taşınmalı.
const LATIN_GENRES = new Set(["house", "tech house", "deep house", "techno", "melodic techno", "minimal", "afro house", "organic house",
  "trance", "electronic", "disco", "edm", "drum & bass", "dubstep", "pop", "rock", "jazz", "blues", "soul", "funk", "swing", "hip-hop",
  "hip hop", "hiphop", "rap", "trap", "r&b", "rnb", "reggae", "latin", "metal", "punk", "grunge", "indie", "alternative", "acoustic",
  "instrumental", "classical", "pop rock"]);
export const genreUp = (g) => {
  const s = String(g || "");
  return LATIN_GENRES.has(fold(s).trim()) ? s.toLocaleUpperCase("en-US") : trUpper(s);
};

// ── önbellekli okumalar (oturum boyunca, 5 dk) ──
const TTL = 5 * 60 * 1000;
const _users = new Map();   // id → { at, p }
const _events = new Map();  // kind:id → { at, p }
function cached(map, key, load) {
  const c = map.get(key);
  if (c && Date.now() - c.at < TTL) return c.p;
  const p = load().catch(() => null);
  map.set(key, { at: Date.now(), p });
  return p;
}
export const userInfo = (id) => cached(_users, id, () => getUser(id));
export const groupInfo = (id) => cached(_users, "g:" + id, async () => { const s = await getDoc(doc(db, "groups", id)); return s.exists() ? { id: s.id, ...s.data() } : null; });
async function eventsWhereRO(field, id) { // salt-okuma (data.venueEvents/organizerEvents'in afiş temizleme yazımı YOK)
  const s = await getDocs(query(collection(db, "events"), where(field, "==", id)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
const EV_SRC = { artist: (id) => eventsByArtist(id), venue: (id) => eventsWhereRO("venueId", id), group: (id) => eventsWhereRO("groupId", id), organizer: (id) => eventsWhereRO("organizerId", id) };
// → { upcoming: [...] (başlangıca göre artan), last: son geçmiş etkinlik | null }
export function eventsOf(kind, id) {
  return cached(_events, kind + ":" + id, () => EV_SRC[kind](id).then((list) => {
    const live = list.filter((e) => e.status !== "cancelled");
    const upcoming = live.filter((e) => e.status === "upcoming" && !_isOver(e))
      .sort((a, b) => (_startMs(a) ?? Infinity) - (_startMs(b) ?? Infinity));
    const past = live.filter((e) => _isOver(e)).sort((a, b) => (_startMs(b) ?? 0) - (_startMs(a) ?? 0));
    return { upcoming, last: past[0] || null };
  }));
}

// Kart renk tonu: mekan amber; sanatçı/grup tür ailesi (artboard COLOR haritası; tanınmayan tür → #FF4FA3); kullanıcı nötr
export function toneOf(kind, genre) {
  if (kind === "venue") return "#FF8A2A";
  if (kind === "user") return "#A3A7AF";
  const f = genreFamily(genre);
  return f.key === "other" ? "#FF4FA3" : f.color;
}

// ── Geri alınabilir kaldırma (yazım HEMEN; GERİ AL = anlık görüntüyü geri yaz) ──
// it = { src: "following"|"favorites"|"favoriteEvents"|"groups", docId, raw }
// Silmeler legacy/app yollarıyla aynı: following → data.unfollowArtist (following + users/{id}/followers/{uid} aynası);
// favorites → data.unfavVenue; favoriteEvents → data.unfavEvent; groups → app unfollowGroup (followingGroups + groups/{id}/followers/{uid}).
// Ayna silinmeden önce okunur (geri alınırsa aynen geri yazılır; yoksa geri yazılmaz). Kurallar: users/{uid}/{sub} sahibine,
// users/{id}/followers/{uid} ve groups/{id}/followers/{uid} takipçinin kendisine açık → kural değişikliği YOK.
const SUB = { following: "following", favorites: "favorites", favoriteEvents: "favoriteEvents", groups: "followingGroups" };
export function removeEntry(uid, it) {
  const primary = doc(db, "users", uid, SUB[it.src], it.docId);
  const mirror = it.src === "following" ? doc(db, "users", it.docId, "followers", uid)
    : it.src === "groups" ? doc(db, "groups", it.docId, "followers", uid) : null;
  const data = it.raw ? { ...it.raw } : null;
  let mirrorData = null;
  const done = (async () => {
    if (it.src === "favorites") return unfavVenue(uid, it.docId);
    if (it.src === "favoriteEvents") return unfavEvent(uid, it.docId);
    const mSnap = getDoc(mirror).catch(() => null);   // silmeden ÖNCE okunmaya başlar
    await deleteDoc(primary);
    const ms = await mSnap;
    mirrorData = ms?.exists() ? ms.data() : null;
    try { await deleteDoc(mirror); } catch (_) {}      // legacy: ayna silme hatası yutulur
  })();
  const undo = async () => {
    await done;                                         // sıra: silme bitmeden geri yazma yok
    if (!data) throw new Error("no-snapshot");
    await setDoc(primary, data);
    if (mirror && mirrorData) setDoc(mirror, mirrorData).catch(() => {});
  };
  return { done, undo };
}

// ── "GERİ AL" toast'u: 4 sn, üzerine gelince/odaklanınca durur (WCAG 2.2.1); süre dolarken odak içindeyse focusAfter() ──
// SHARED-CANDIDATE: dkToast'a pauseOnHover/focus seçeneği + GERİ AL için erişilebilir ad eklenmeli; burada dönen düğüm yerel yamalanır.
export function undoToast(text, { onUndo, focusAfter, decorate } = {}) {
  const t = dkToast(text, { type: "neutral", duration: 864e5, action: { label: "GERİ AL", onClick: () => onUndo?.() } });
  const el = t.node;
  const act = el?.querySelector(".dk-tst-act");
  if (!el) return { close: () => t.close(), focusAction() {} };
  el.style.setProperty("--dk-toast-life", UNDO_MS + "ms");
  act?.setAttribute("aria-label", `Geri al: ${text}`);
  decorate?.(el);
  // Süre = dkToastLife animasyonu (0–10 % giriş, 88–100 % çıkış). Duraklatma görünür platoda yapılır: girişteyse giriş
  // bitince, çıkıştaysa platonun sonuna geri alınarak (odak otomatik taşındığında toast opaklık 0'da donmasın).
  const D = UNDO_MS, IN = 0.1 * D, OUT = 0.88 * D;
  let left = D, t0 = 0, timer = 0, holdT = 0, paused = false;
  const anim = () => { try { return el.getAnimations().find((a) => a.animationName === "dkToastLife") || null; } catch (_) { return null; } };
  const expire = () => {
    if (!el.isConnected) return;
    const inside = el.contains(document.activeElement);
    t.close();
    if (inside) focusAfter?.();
  };
  const run = () => { t0 = performance.now(); timer = setTimeout(expire, Math.max(0, left)); };
  const hold = () => el.matches(":hover") || el.contains(document.activeElement);
  const pause = () => {
    if (paused || !el.isConnected) return;
    paused = true; clearTimeout(timer); clearTimeout(holdT);
    const a = anim();
    if (!a) { left -= performance.now() - t0; return; }
    const ct = Number(a.currentTime) || 0;
    if (ct < IN) { left = D - IN; holdT = setTimeout(() => { if (paused) { a.currentTime = IN; a.pause(); } }, IN - ct); }
    else { const at = Math.min(ct, OUT); a.currentTime = at; a.pause(); left = D - at; }
  };
  const resume = () => {
    if (!paused || hold() || !el.isConnected) return;
    paused = false; clearTimeout(holdT);
    const a = anim();
    if (a) { if (a.playState === "paused") a.play(); left = D - (Number(a.currentTime) || 0); }
    run();
  };
  el.addEventListener("pointerenter", pause);
  el.addEventListener("pointerleave", resume);
  el.addEventListener("focusin", pause);
  el.addEventListener("focusout", () => setTimeout(resume, 0));
  // klavye: Esc = kapat, Tab = listeye dön (portal belgenin sonunda; Tab'la sayfanın dışına düşmesin)
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); clearTimeout(timer); clearTimeout(holdT); t.close(); focusAfter?.(); }
    else if (e.key === "Tab" && focusAfter) { e.preventDefault(); focusAfter(); }
  });
  run();
  return { node: el, close: () => { clearTimeout(timer); clearTimeout(holdT); t.close(); }, focusAction: () => { try { act?.focus({ preventScroll: true }); } catch (_) {} } };
}

// ── Anahtarlı ızgara: değişmeyen hücreler yerinde kalır (animasyon yeniden oynamaz), yalnız yeni eklenen hücre yükselir ──
// fresh (ilk çizim / sekme değişimi / boş durumdan dönüş) → tümü kademeli dk-rise (base + step·i ms).
export function keyedGrid({ cls, base, step, build }) {
  const cells = new Map();   // key → hücre
  let grid = null, gridKey = null;
  const cellFor = (it) => {
    let c = cells.get(it.key);
    if (!c) {
      c = build(it);
      c.dataset.key = it.key;
      c.addEventListener("animationend", (e) => { if (e.target === c && e.animationName === "dkRise") c.classList.remove("dk-rise"); });
      cells.set(it.key, c);
    }
    return c;
  };
  const rise = (c, ms) => { c.classList.remove("dk-out-scale", "dk-rise"); c.style.setProperty("--dk-delay", ms + "ms"); void c.offsetWidth; c.classList.add("dk-rise"); };
  return {
    // → ızgara düğümü (fresh ise yeni düğüm; çağıran yerleştirir) | null (mevcut ızgara yerinde güncellendi)
    render(items, key) {
      if (!grid || gridKey !== key || !grid.isConnected) {
        grid = h("div", { class: cls });
        gridKey = key;
        items.forEach((it, i) => { const c = cellFor(it); rise(c, base + i * step); grid.append(c); });
        return grid;
      }
      const want = new Set(items.map((it) => it.key));
      [...grid.children].forEach((c) => { if (!want.has(c.dataset.key)) c.remove(); });
      let ref = grid.firstElementChild;
      items.forEach((it) => {
        const c = cellFor(it);
        if (c === ref) { ref = ref.nextElementSibling; return; }
        if (c.parentNode !== grid) rise(c, 0);
        grid.insertBefore(c, ref);
      });
      return null;
    },
    reset() { grid = null; gridKey = null; },
    get grid() { return grid; },
    cell: (key) => cells.get(key) || null,
  };
}

// Artboard SVG gövdeleri (birebir)
const P = {
  userMinus: '<path d="M9 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3.5 19a5.5 5.5 0 0 1 11 0M16 11h6"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  emptySearch: '<path d="M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM20 20l-4.2-4.2"></path>',
  emptyMusic: '<path d="M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"></path>',
};
const ROLE_LABEL = { artist: "Sanatçı", venue: "Mekan", group: "Grup", organizer: "Organizatör", customer: "Kullanıcı" };
const roleOf = (it) => (it.kind === "user" ? (it.role === "organizer" ? "organizer" : "customer") : it.kind);
const hrefOf = (it) => (it.kind === "artist" ? "#/sanatci/" + encodeURIComponent(it.id) : it.kind === "venue" ? "#/mekan/" + encodeURIComponent(it.id) : null);
const evKindOf = (it) => (it.kind === "user" ? (it.role === "organizer" ? "organizer" : null) : it.kind);

// ══════════════════════════════════════════════════════════════════════
// Görünüm
// ══════════════════════════════════════════════════════════════════════
const TAB_OF = (q) => (q?.get("sekme") === "mekan" ? "venue" : "artist");

export function takipView(ctx) {
  const s = ctx.session || session;
  const guest = !s.user || s.guest;
  const uid = guest ? null : s.user.uid;
  const shell = accountShell({ active: "takip", ctx, contentGap: 28 });
  const root = shell.content;
  root.classList.add("dk-takip");
  let alive = true;
  let undoT = null;            // açık "GERİ AL" toast'u
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };

  let tab = TAB_OF(ctx.query);
  let q = ctx.query?.get("q") || "";
  let artists = null, venues = null;  // null = yükleniyor (artists = Sanatçılar sekmesi: sanatçı + grup + diğer takipler)
  let loadErr = false;

  // ── başlık ──
  const lead = h("p", { class: "dk-ph-lead" });
  const head = dkPageHead({ title: "Takip ", em: "ettiklerim" });
  head.append(lead);
  const setLead = () => {
    const n = (artists?.length || 0) + (venues?.length || 0);
    lead.textContent = artists == null ? "Takip ettiğin sanatçı ve mekanlar yükleniyor…"
      : `${n} kullanıcı takip ediyorsunuz. Yeni etkinlikleri Keşfet ve bildirimlerinde öne çıkar.`;
  };

  // ── sekmeler + arama ──
  const listBox = h("div", { class: "dk-takip-body" });
  const seg = dkSegmented({
    label: "Takip türü", value: tab, countColor: "#4ED8FF",
    items: [{ key: "artist", label: "Sanatçılar", count: "—" }, { key: "venue", label: "Mekanlar", count: "—" }],
    onChange: (k) => { tab = k; writeQuery({ sekme: k === "venue" ? "mekan" : null }); syncPanel(); draw(); },
  });
  // sekme ↔ panel ilişkisi (tek panel, iki sekme)
  const tabBtns = [...seg.querySelectorAll('[role="tab"]')];
  tabBtns.forEach((b, i) => { b.id = "dk-takip-tab-" + (i ? "venue" : "artist"); b.setAttribute("aria-controls", "dk-takip-panel"); });
  const syncPanel = () => { if (!guest) listBox.setAttribute("aria-labelledby", "dk-takip-tab-" + tab); };
  const input = h("input", { type: "search", class: "dk-takip-q", "aria-label": "Takip ettiklerinde ara", placeholder: "Kullanıcı ara (sanatçı, mekan...)", autocomplete: "off", spellcheck: "false" });
  input.value = q;
  input.addEventListener("input", () => { q = input.value; writeQuery({ q: q.trim() || null }); draw(); });
  const search = h("label", { class: "dk-takip-search" }, svgRaw(P.search, { size: 16, sw: "2", color: "#8A8E97" }), input);
  const controls = h("div", { class: "dk-takip-ctl dk-rise", style: { "--dk-delay": "60ms" } }, seg, search);

  root.append(head, controls, listBox);
  setLead();

  if (guest) {
    controls.hidden = true;
    lead.textContent = "Sanatçı ve mekanları takip etmek için giriş yap.";
    listBox.append(dkEmpty({ ring: true, icon: svgRaw(P.emptyMusic, { size: 28, sw: "1.6" }), title: "Giriş gerekli",
      sub: "Takip ettiklerini görmek için bir hesapla giriş yap.",
      action: dkButton("Giriş yap", { variant: "light", size: 42, onClick: () => dkLoginGate("Takip ettiklerini görmek") }) }));
    return { node: shell.node, destroy() { alive = false; shell.destroy(); } };
  }
  listBox.id = "dk-takip-panel";
  listBox.setAttribute("role", "tabpanel");
  syncPanel();

  // ── veri ──
  const setCounts = () => {
    seg.dk.setCount("artist", artists == null ? "—" : artists.length);
    seg.dk.setCount("venue", venues == null ? "—" : venues.length);
    setLead();
  };
  const countsChanged = () => { invalidateAccountCounts(uid); if (alive) shell.refreshCounts(true); };
  async function load() {
    const [fol, fv, fg] = await Promise.all([followingList(uid).catch(() => null), favVenues(uid).catch(() => null), followingGroupsList(uid).catch(() => null)]);
    if (!alive) return;
    if (fol == null && fv == null) { loadErr = true; artists = []; venues = []; setCounts(); draw(); return; }
    const A = [], G = [], O = [];
    (fol || []).forEach((d) => {
      if (isVenueTarget(d)) return;
      const base = { tab: "artist", key: "f:" + d.id, docId: d.id, src: "following", id: followTargetId(d), photo: d.photoURL || null, raw: rawOf(d) };
      if (isArtistTarget(d)) A.push({ ...base, kind: "artist", name: d.artistName || d.targetName || "Sanatçı", genre: d.genre || "" });
      else O.push({ ...base, kind: "user", role: d.targetType, name: d.targetName || d.artistName || "Kullanıcı" });
    });
    (fg || []).forEach((d) => G.push({ tab: "artist", kind: "group", key: "g:" + d.id, docId: d.id, src: "groups", id: d.groupId || d.id,
      name: d.groupName || "Grup", genre: d.genre || "", photo: d.photoURL || null, raw: rawOf(d) }));
    artists = [...A, ...G, ...O];
    const seen = new Set();
    venues = [];
    (fv || []).forEach((d) => {
      const id = d.venueId || d.id; if (seen.has(id)) return; seen.add(id);
      venues.push({ tab: "venue", kind: "venue", key: "v:" + d.id, docId: d.id, src: "favorites", id, name: d.venueName || "Mekan", city: d.city || "", raw: rawOf(d) });
    });
    (fol || []).filter(isVenueTarget).forEach((d) => {
      const id = followTargetId(d); if (seen.has(id)) return; seen.add(id);
      venues.push({ tab: "venue", kind: "venue", key: "f:" + d.id, docId: d.id, src: "following", id, name: d.targetName || d.artistName || "Mekan", city: "", photo: d.photoURL || null, raw: rawOf(d) });
    });
    setCounts();
    draw();
  }

  // ── kart ──
  function card(it) {
    const tone = () => toneOf(it.kind, it.genre);
    const href = hrefOf(it);
    const media = href ? h("a", { href, class: "dk-takip-media", "aria-label": `${it.name} profili` }) : h("div", { class: "dk-takip-media" });
    const shade = h("span", { class: "dk-takip-shade", "aria-hidden": "true" });
    const chipTxt = h("span", {});
    const chip = h("span", { class: "dk-takip-chip" }, h("span", { class: "dk-takip-dot", "aria-hidden": "true" }), chipTxt);
    const live = h("span", { class: "dk-takip-chip is-live", hidden: true },
      h("span", { class: "dk-takip-ping", "aria-hidden": "true" }, h("span", { class: "dk-takip-dot dk-ping" }), h("span", { class: "dk-takip-dot" })), "BU GECE");
    const ph = () => h("span", { class: "dk-takip-ph", style: { background: `linear-gradient(160deg, ${rgba(tone(), 0.22)}, rgba(78,216,255,0.06))` } }, cardInitial(it.name));
    const setMedia = (photo) => {
      const old = media.querySelector(".dk-takip-img, .dk-takip-ph");
      let el;
      if (photo) {
        el = h("img", { class: "dk-takip-img", src: photo, alt: "", loading: "lazy", decoding: "async", style: { objectPosition: it.kind === "venue" ? "50% 50%" : "center 25%" } });
        el.addEventListener("error", () => el.replaceWith(ph()), { once: true });
      } else el = ph();
      if (old) old.replaceWith(el); else media.prepend(el);
    };
    const setChip = () => {
      const c = tone();
      chip.style.setProperty("--c", c); chip.style.setProperty("--c-bd", rgba(c, 0.5));
      chipTxt.textContent = it.kind === "venue" ? "MEKAN" + (it.area ? " · " + trUpper(it.area) : "")
        : it.kind === "user" ? trUpper(ROLE_LABEL[roleOf(it)])
          : it.genre ? genreUp(it.genre) : trUpper(ROLE_LABEL[it.kind]);
      const phEl = media.querySelector(".dk-takip-ph");
      if (phEl) phEl.style.background = `linear-gradient(160deg, ${rgba(c, 0.22)}, rgba(78,216,255,0.06))`;
    };
    media.append(shade, chip, live);
    setMedia(it.photo);
    setChip();

    const nameA = h(href ? "a" : "span", { href, class: "dk-takip-name" }, it.name);
    const roleTx = h("span", {}, ROLE_LABEL[roleOf(it)]);
    const fol = h("span", {}, it.kind === "artist" ? " · — takipçi" : "");
    const meta = h("span", { class: "dk-takip-meta" }, roleTx, fol);
    const evKind = evKindOf(it);
    let up = null;
    const upN = h("span", { class: "dk-takip-upn" }, dkSkeleton({ w: 18, h: 22, r: 4 }));
    const nxL = h("span", { class: "dk-takip-nxl" }, "SIRADAKİ");
    const nxT = h("span", { class: "dk-takip-nxt" }, dkSkeleton({ w: "80%", h: 13, r: 4 }));
    if (evKind) {
      up = h("div", { class: "dk-takip-up" },
        h("span", { class: "dk-takip-upc" }, upN, h("span", { class: "dk-takip-upl" }, "YAKLAŞAN")),
        h("span", { class: "dk-takip-updiv", "aria-hidden": "true" }),
        h("span", { class: "dk-takip-nx" }, nxL, nxT));
    }
    const unf = h("button", { type: "button", class: "dk-takip-unf dk-press", "aria-label": `${it.name} takibini bırak` },
      svgRaw(P.userMinus, { size: 14, sw: "2" }), "Takipten çık");
    const article = h("article", { class: "dk-takip-card dk-card" },
      media,
      h("div", { class: "dk-takip-nm" }, nameA, meta),
      up,
      h("div", { class: "dk-takip-acts" + (href ? "" : " is-single") }, href ? h("a", { href, class: "dk-takip-see dk-press" }, "Profili gör") : null, unf));
    const cell = h("div", { class: "dk-takip-cell" }, article);
    unf.addEventListener("click", (e) => unfollow(it, cell, e.detail === 0));   // detail 0 = klavye (Enter/Boşluk)

    // zenginleştirme (kademeli): profil/grup + etkinlikler
    const folText = (n) => (n > 0 || it.kind === "artist" ? ` · ${fmtK(n)} takipçi` : "");
    if (it.kind === "group") {
      groupInfo(it.id).then((g) => {
        if (!alive || !g) return;
        if (g.photoURL && g.photoURL !== it.photo) { it.photo = g.photoURL; setMedia(g.photoURL); }
        if (!it.genre && g.genre) it.genre = g.genre;
        setChip();
        const n = Array.isArray(g.memberIds) ? g.memberIds.length : 0;
        fol.textContent = n ? ` · ${n} üye` : "";
      });
    } else {
      userInfo(it.id).then((u) => {
        if (!alive || !u) return;
        if (u.photoURL && u.photoURL !== it.photo) { it.photo = u.photoURL; setMedia(u.photoURL); }
        if (it.kind === "artist") { const g = primaryGenre(u) || it.genre; if (g) it.genre = g; }
        else if (it.kind === "venue") it.area = u.district || u.city || it.city || "";
        else if (it.kind === "user" && u.userType) { it.role = u.userType; roleTx.textContent = ROLE_LABEL[roleOf(it)]; }
        setChip();
        // mekan/kullanıcı: takipçi sayacı yalnız varsa (mekan favorileri followerCount'a yansımıyor → "0 takipçi" yanıltıcı)
        fol.textContent = folText(Number(u.followerCount) || 0);
      });
    }
    if (it.kind === "venue" && it.city) { it.area = it.city; setChip(); }
    if (evKind) {
      // organizatör etkinlikleri organizasyona bağlı (events.organizerId = users/{id}.orgId; yoksa kullanıcı kimliği)
      const evs = evKind === "organizer" ? userInfo(it.id).then((u) => eventsOf("organizer", u?.orgId || it.id)) : eventsOf(evKind, it.id);
      evs.then((ev) => {
        if (!alive) return;
        const list = ev?.upcoming || [];
        const next = list[0] || null;
        upN.replaceChildren(String(ev ? list.length : "—"));
        upN.classList.toggle("is-zero", !list.length);
        if (next) {
          nxL.textContent = "SIRADAKİ";
          const parts = [next.title || "Etkinlik"];
          if (it.kind !== "venue" && next.venueName) parts.push(next.venueName);
          const ms = _startMs(next);
          if (ms != null) parts.push(dayTime(ms));
          nxT.textContent = parts.join(" · ");
          live.hidden = !(ms != null && isToday(ms));
          media.classList.toggle("has-live", !live.hidden);
        } else {
          nxL.textContent = "YAKLAŞAN ETKİNLİK YOK";
          const last = ev?.last;
          nxT.textContent = last ? "Son: " + [last.title || "Etkinlik", it.kind === "venue" ? last.artistName : last.venueName].filter(Boolean).join(" · ") : "—";
          live.hidden = true;
        }
        nxT.title = nxT.textContent;
      });
    }
    return cell;
  }

  // ── liste (anahtarlı ızgara: arama/çıkarma/geri almada değişmeyen kartlar yerinde kalır) ──
  const kg = keyedGrid({ cls: "dk-takip-grid", base: 100, step: 60, build: card });
  const listOf = (it) => (it.tab === "venue" ? venues : artists);
  function draw() {
    if (!alive) return;
    if (artists == null) {
      listBox.setAttribute("aria-busy", "true");
      listBox.replaceChildren(h("div", { class: "dk-takip-grid" },
        ...[0, 1, 2].map(() => h("div", { class: "dk-takip-skel" }, dkSkeleton({ h: 176, r: 0 }),
          h("div", { class: "dk-takip-skelb" }, dkSkeleton({ w: "60%", h: 18 }), dkSkeleton({ w: "40%", h: 13 }), dkSkeleton({ h: 58, r: 8 }), dkSkeleton({ h: 40, r: 6 }))))));
      return;
    }
    listBox.removeAttribute("aria-busy");
    const base = tab === "venue" ? venues : artists;
    const fq = fold(q.trim());
    const items = fq ? base.filter((x) => fold(x.name).includes(fq)) : base;
    if (!items.length) {
      kg.reset();
      const searching = !!fq && base.length > 0;
      const venueTab = tab === "venue";
      listBox.replaceChildren(dkEmpty({
        ring: true, cls: "dk-rise",
        icon: svgRaw(searching ? P.emptySearch : P.emptyMusic, { size: 28, sw: "1.6" }),
        title: loadErr ? "Liste yüklenemedi." : searching ? "Kullanıcı bulunamadı." : "Henüz kimseyi takip etmiyorsunuz.",
        sub: loadErr ? "Bağlantını kontrol edip sayfayı yenile." : searching ? "İsmin baş harflerini kontrol edip tekrar deneyin."
          : venueTab ? "Mekan sayfalarında kalp simgesine basarak takip et." : "Sanatçı profillerinden takip et.",
        action: loadErr ? null : venueTab && !searching
          ? dkButton("Keşfet'e git", { variant: "light", size: 42, href: "#/kesfet" })
          : dkButton("Top 10 sanatçıları keşfet", { variant: "light", size: 42, href: "#/top10" }),
      }));
      return;
    }
    const fresh = kg.render(items, tab);
    if (fresh) listBox.replaceChildren(fresh);
  }
  // süre dolarken odak toast'taysa: aynı sıradaki kartın aksiyonuna (yoksa öncekine / boş durum düğmesine / sekmeye)
  function focusNear(at, preventScroll = false) {
    if (!alive) return;
    const cells = kg.grid && kg.grid.isConnected ? [...kg.grid.children] : [];
    const c = cells.length ? cells[Math.min(at, cells.length - 1)] : null;
    const t = c?.querySelector(".dk-takip-unf") || listBox.querySelector(".dk-empty a[href], .dk-empty button") || seg.querySelector('[aria-selected="true"]');
    try { t?.focus({ preventScroll }); } catch (_) {}
  }

  // ── takipten çık: yazım hemen → çıkış animasyonu → kart kalkar → 4 sn "GERİ AL" (telafi yazımı) ──
  function unfollow(it, cell, viaKeyboard = false) {
    if (it.op) return;
    const arr = listOf(it);
    if (!arr.includes(it)) return;
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
      toast = undoToast(`${it.name} takipten çıkarıldı`, {
        onUndo: () => restore(it, at, op),
        focusAfter: () => focusNear(at),
      });
      undoT = toast;
      // klavye: odak GERİ AL'a (odaktayken süre durur; Tab/Esc listeye döner). İşaretçi: odak body'ye düşmesin → sıradaki kart.
      if (hadFocus) { if (viaKeyboard) toast.focusAction(); else focusNear(at, true); }
    }, reduceMotion() ? 0 : 360);
  }
  function restore(it, at, op) {
    it.op = null;
    const arr = listOf(it);
    if (alive) {
      if (!arr.includes(it)) arr.splice(Math.min(at, arr.length), 0, it);
      setCounts();
      draw();
      const btn = kg.cell(it.key)?.querySelector(".dk-takip-unf");
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

  draw();
  load();

  return {
    node: shell.node,
    update(query) {
      const nt = TAB_OF(query), nq = query?.get("q") || "";
      if (nt !== tab) { tab = nt; seg.dk.set(tab); syncPanel(); }
      if (nq !== q) { q = nq; input.value = q; }
      draw();
    },
    // aynı kullanıcının oturum yayını (refreshProfile vb.) → yeniden kurma (açık "Geri al" korunur)
    onSession(sess) { return !!(sess?.user && !sess.guest && sess.user.uid === uid); },
    destroy() {
      alive = false;
      timers.forEach(clearTimeout); timers.clear();
      try { undoT?.close(); } catch (_) {}   // yazım zaten yapıldı; geri alma penceresi bu sayfayla biter
      undoT = null;
      shell.destroy();
    },
  };
}
export const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
