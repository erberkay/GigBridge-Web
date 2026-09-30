// WebKatilimcilar — masaüstü "Katılımcılar" (≥769 px). Registry anahtarı: katilimcilar (#/katilimcilar/:eventId).
// Spec: specs/public-b.md "WebKatilimcilar" (artboard design/WebKatilimcilar.dc.html; sahibinin CLAUDE CODE notu YOK).
// CSS: css/dk-katilimcilar.css — tüm seçiciler .dk-katilimcilar kökü / .dk-katilimcilar-* sınıfları altında.
//
// Legacy karşılığı: customer.js attendeesPage(id) (≤768'de aynen kalır). Korunan legacy davranışları:
//   · veri: eventById(id) + eventAttendees(id) (events/{id}/attendees), başlık "{title} • {N} kişi" (N = alt koleksiyon boyu; etkinlik yoksa "Etkinlik")
//   · GİZLİLİK (privacySettings.anonymousAttendance): katılım belgesindeki `anonymous === true` (katılırken profilin anonymousAttendance'ından yazılır)
//     → ad DAİMA "Anonim Katılımcı"; gerçek displayName DOM'a, aramaya, aria etiketlerine, mesaj hedef adına GİRMEZ; arama "anonim katılımcı"
//     metniyle eşleşir (legacy birebir). Anonim katılımcının profili/fotoğrafı OKUNMAZ, tür etiketi gösterilmez.
//   · ad yedeği displayName || name || "Kullanıcı"; AVATAR_PALETTES (12 çift) sıraya göre; Türkçe katlamalı (fold) arama
//   · mesaj: dkLoginGate("Mesaj göndermek") → requestChat({ otherId: userId || id, otherName: ad }) → mesajlar (legacy go("#/mesajlar");
//     masaüstünde panel rolleri kendi panel mesaj sekmesine — #/mesajlar onlara kapalı). Masaüstü mesaj görünümü legacy `pending`'i okuyamadığı
//     için (chat.js SHARED-CANDIDATE) hedef hem legacy hem chat.js requestChat'e verilir + `?c={convIdFor(ben, o)}` derin bağlantısı (sanatci.js /
//     mekan-sec.js ile aynı desen) → sohbet TIKLANAN katılımcıyla açılır.
//   · GİZLİLİK: anonim katılımcıda mesaj düğmesi YOK (public-b Q5 yanıtlanana dek). Masaüstü sohbet ?c= ile karşı tarafın profilini çözüp gerçek
//     adını gösteriyor → anonim katılımcıya mesaj başlatmak kimliğini açığa çıkarırdı (legacy mobilde başlık "Anonim Katılımcı" kalıyordu).
//   · legacy geri düğmesi → breadcrumb + "Etkinliğe dön" özet kartı.
// Yeni (tasarım): breadcrumb, etkinlik özet kartı, 3 kolon ızgara, sonuç sayacı, sayfalama (18'er), "SEN" vurgusu (kendi kartında mesaj düğmesi yok),
//   anonim göz-kapalı avatarı, fotoğraflar + sanatçı tür etiketi (anonim OLMAYAN görünür katılımcılar için users/{uid} okuması — isteğe bağlı zenginleştirme;
//   profili sonradan anonymousAttendance=true yapan kişinin fotoğrafı/türü de gösterilmez), sıralama: ben önce, sonra joinedAt azalan.
// URL: #/katilimcilar/:id?ara=… (arama; replaceState, 250 ms) — update(query) geri/ileri'de uygular. Yazma YOK.
// Profil zenginleştirme: yalnız ekrana yaklaşan (IntersectionObserver, 600 px pay), anonim OLMAYAN kartlar; users belgeleri 30'luk
//   `where("__name__","in",…)` toplu okumalarıyla (spec §7; bileşik indeks gerekmez; kural: users okuma isSignedIn → misafir anonim oturum dahil).
import { h } from "../../ui.js";
import { session, homeRouteFor } from "../../store.js";
import { eventById, eventAttendees, convIdFor } from "../../data.js";
import { db, collection, query as fsQuery, where, getDocs } from "../../firebase.js";
import { requestChat } from "../../pages/messages.js";
import { publicShell } from "../shared/public-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { cx, dkBreadcrumb, dkSearchInput, dkLoginGate } from "../shared/ui.js";
import { evTitle, evCity, evImage, evHref } from "../shared/cards.js";
import { fold, trUpper, toMs, eventStartMs, fmtTime, fmtDayLabel, fmtInt, writeQuery, debounce, swapAnim, artistGenres } from "../shared/helpers.js";
import { genreColor, genreGrad, genreLabel, primaryGenre } from "../shared/genres.js";

const PAGE = 18;                 // artboard LIMIT 18 → "Daha fazla göster" (+18)
// AVATAR_PALETTES (customer.js:650) — sıraya göre döner (artboard DCLogic notu)
const PAL = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#EC4899", "#BE185D"], ["#06B6D4", "#0891B2"], ["#F97316", "#EA580C"], ["#6366F1", "#4F46E5"], ["#14B8A6", "#0D9488"], ["#A855F7", "#9333EA"], ["#84CC16", "#65A30D"], ["#FB7185", "#E11D48"]];
// Artboard SVG gövdeleri (birebir)
const P = {
  chatDots: '<path d="M4 5.5h16v10H9l-5 4z"></path><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"></path>',
  chat: '<path d="M4 5.5h16v10H9l-5 4z"></path>',
  people: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"></path>',
  chevronDown: '<path d="m6 9 6 6 6-6"></path>',
  alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5.5M12 16.5v.01"></path>',
};
const ANON = "Anonim Katılımcı";

// Mesaj hedefi: dinleyici #/mesajlar; masaüstünde herkese açık sayfadaki panel rolleri kendi panel mesaj sekmesi; yönetici → yok
function messagesRoute() {
  if (session.isAdmin && !session.profile?.userType) return null;
  const home = homeRouteFor(session.profile);
  if (home === "#/artist" || home === "#/venue" || home === "#/organizer") return home + "/mesaj";
  if (home === "#/pending" || home === "#/unsupported") return null;
  return "#/mesajlar";
}

export function katilimcilarView(ctx) {
  let dead = false;
  const unsubs = [];
  const id = ctx.seg[2] || "";
  let ev = null, list = [], loadState = "loading";
  let q = ctx.query.get("ara") || "";
  let limit = PAGE;
  const profiles = new Map();          // uid → users belgesi (yalnız anonim OLMAYAN, görünür katılımcılar)
  const cards = new Map();             // uid → { li, av, sub } (yerinde güncelleme)
  const myUid = session.user && !session.user.isAnonymous ? session.user.uid : null;

  const shell = publicShell({ active: "etkinlikler", footer: "full" });
  const root = h("div", { class: "dk-katilimcilar" });
  shell.main.append(root);

  // ── breadcrumb (64) ──
  const bcBox = h("div", { class: "dk-katilimcilar-bcw" });
  const renderCrumb = () => bcBox.replaceChildren(dkBreadcrumb({
    cls: "dk-katilimcilar-bc",
    items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Etkinlikler", href: "#/etkinlikler" },
      ...(ev ? [{ label: evTitle(ev), href: evHref(ev) }] : []), { label: "Katılımcılar" }],
  }));

  // ── etkinlik özet kartı (a.gb-person) ──
  const evBox = h("div", { class: "dk-katilimcilar-evw" });
  function renderEventCard() {
    if (!ev) { evBox.replaceChildren(); evBox.hidden = loadState !== "loading"; if (loadState === "loading") evBox.append(h("span", { class: "dk-katilimcilar-evsk", "aria-hidden": "true" })); return; }
    evBox.hidden = false;
    const g = primaryGenre(ev), s = eventStartMs(ev);
    const when = s == null ? "" : `${trUpper(fmtDayLabel(s))} ${fmtTime(s)}`;
    const src = evImage(ev);
    const thumb = src ? h("img", { src, alt: "", class: "dk-katilimcilar-thumb", loading: "lazy", decoding: "async" })
      : h("span", { class: "dk-katilimcilar-thumb dk-katilimcilar-thph", style: { background: genreGrad(g, 150) }, "aria-hidden": "true" });
    if (src) thumb.addEventListener("error", () => thumb.replaceWith(h("span", { class: "dk-katilimcilar-thumb dk-katilimcilar-thph", style: { background: genreGrad(g, 150) }, "aria-hidden": "true" })), { once: true });
    // "{artist} · {venue}, {city}" (artboard)
    const meta = [[ev.artistName, ev.venueName].filter(Boolean).join(" · "), evCity(ev)].filter(Boolean).join(", ");
    evBox.replaceChildren(h("a", { href: evHref(ev), class: "dk-katilimcilar-ev" },
      thumb,
      h("span", { class: "dk-katilimcilar-evt" },
        h("span", { class: "dk-katilimcilar-evk", style: { color: g ? genreColor(g) : "#A3A7AF" } }, [g ? genreLabel(g) : null, when || null].filter(Boolean).join(" · ")),
        h("span", { class: "dk-katilimcilar-evn" }, evTitle(ev)),
        meta ? h("span", { class: "dk-katilimcilar-evs" }, meta) : null),
      h("span", { class: "dk-katilimcilar-back" }, svgIcon("arrowLeft", { size: 15, sw: "2" }), "Etkinliğe dön")));
  }

  // ── ana bölüm ──
  const sub = h("span", { class: "dk-katilimcilar-sub" });
  const search = dkSearchInput({ variant: "field", label: "Katılımcı ara", placeholder: "Katılımcı ara...", value: q, radius: 8, cls: "dk-katilimcilar-q" });
  const syncUrl = debounce(() => { if (!dead) writeQuery({ ara: q.trim() || null }); }, 250);
  search.input.addEventListener("input", () => { q = search.input.value; syncUrl(); renderList(true); });
  unsubs.push(() => syncUrl.cancel());
  const resultLabel = h("span", { class: "dk-katilimcilar-rl", role: "status" });
  // Bilgi notu yalnız mesaj gönderilebilecek en az bir katılımcı varken (boş/eksik etkinlik/hata/yalnız anonim ya da ben → gizli)
  const note = h("span", { class: "dk-katilimcilar-note" }, svgRaw(P.chatDots, { size: 15, sw: "1.9", color: "#FF8A2A" }), "Katılımcılara tıklayarak mesaj gönderebilirsin");
  const info = h("div", { class: "dk-katilimcilar-info" }, note, resultLabel);
  const emptyBox = h("div", { class: "dk-katilimcilar-empty", hidden: true });
  const grid = h("ul", { class: "dk-katilimcilar-grid", "aria-label": "Katılımcı listesi" });
  const more = h("div", { class: "dk-katilimcilar-more", hidden: true });
  const main = h("section", { class: "dk-katilimcilar-main", "aria-labelledby": "dk-kat-h" },
    h("div", { class: "dk-katilimcilar-head" },
      h("div", { class: "dk-katilimcilar-headl" },
        h("h1", { id: "dk-kat-h", class: "dk-display dk-katilimcilar-h1" }, "Katılımcılar"), sub),
      search),
    info,
    emptyBox, grid, more);
  root.append(bcBox, evBox, main);

  // ── kişi modeli ──
  const nameOf = (a) => (a.anonymous === true ? ANON : (a.displayName || a.name || "Kullanıcı"));
  const uidOf = (a) => a.userId || a.id;
  // list sırası load()'da: ben önce, sonra joinedAt azalan (palet indeksi TAM listeye göre sabit — aramada renk değişmez)
  function visible() {
    const fq = fold(q.trim());
    const all = list;
    const filtered = fq ? all.filter((p) => fold(p.name).includes(fq)) : all;
    return { all, filtered, shown: fq ? filtered : filtered.slice(0, limit) };
  }

  function avatarEl(p) {
    if (p.anon) return h("span", { class: "dk-katilimcilar-av dk-katilimcilar-anon", "aria-hidden": "true" }, svgIcon("eyeOff", { size: 20, sw: "1.8" }));
    const u = profiles.get(p.uid);
    const photo = u && !u.privacySettings?.anonymousAttendance ? u.photoURL : null;
    if (photo) {
      const img = h("img", { src: photo, alt: "", class: "dk-katilimcilar-av", loading: "lazy", decoding: "async" });
      img.addEventListener("error", () => img.replaceWith(initialAv(p)), { once: true });
      return img;
    }
    return initialAv(p);
  }
  const initialAv = (p) => h("span", { class: "dk-katilimcilar-av dk-katilimcilar-ini", style: { background: `linear-gradient(135deg, ${p.pal[0]}, ${p.pal[1]})` }, "aria-hidden": "true" },
    p.name.charAt(0).toLocaleUpperCase("tr-TR"));
  function subOf(p) {
    if (p.me) return { text: "SEN", cls: "is-me" };
    if (p.anon) return null;
    const u = profiles.get(p.uid);
    if (u?.privacySettings?.anonymousAttendance) return null;
    const g = p.genre || (u?.userType === "artist" ? artistGenres(u)[0] : "");
    return g ? { text: trUpper(g), cls: "is-genre" } : null;
  }
  const subEl = (p) => { const s = subOf(p); return s ? h("span", { class: cx("dk-katilimcilar-ps", s.cls) }, s.text) : null; };

  const msgRoute = messagesRoute();
  const canMessage = (p) => !p.me && !p.anon && !!msgRoute && !!p.uid;
  // Legacy bekleyen sohbet (mobil/legacy görünüm) + masaüstü chat.js bekleyen hedefi + ?c= derin bağlantısı (içe aktarma başarısız olsa da açılır)
  function openChat(p) {
    const t = { otherId: p.uid, otherName: p.name };
    try { requestChat(t); } catch (_) {}
    const me = session.user?.uid;
    const url = msgRoute + (me ? "?c=" + encodeURIComponent(convIdFor(me, p.uid)) : "");
    import("../messages/chat.js").then((m) => { try { m.requestChat?.(t); } catch (_) {} }).catch(() => {})
      .finally(() => { if (!dead) location.hash = url; });
  }
  function personCard(p) {
    const av = avatarEl(p);
    const col = h("span", { class: "dk-katilimcilar-pt" }, h("span", { class: cx("dk-katilimcilar-pn", p.anon && "is-anon") }, p.name), subEl(p));
    let msg = null;
    if (canMessage(p)) {
      msg = h("button", { type: "button", class: "dk-katilimcilar-msg", "aria-label": `${p.name} kişisine mesaj gönder` }, svgRaw(P.chat, { size: 17, sw: "1.8" }));
      msg.addEventListener("click", () => {
        if (dkLoginGate("Mesaj göndermek")) return;
        openChat(p);
      });
    }
    const li = h("li", { class: cx("dk-katilimcilar-p", p.me && "is-me") }, av, col, msg);
    cards.set(p.key, { li, av, col, p });
    observe(li, p);
    return li;
  }

  function renderHead() {
    const n = list.length;
    // hata: sayı bilinmiyor → "• 0 kişi" yazma (yanıltıcı)
    sub.textContent = loadState === "loading" ? "" : loadState === "error" ? (ev ? evTitle(ev) : "Etkinlik") : `${ev ? evTitle(ev) : "Etkinlik"} • ${fmtInt(n)} kişi`;
  }
  function renderList(anim) {
    more.hidden = true;
    note.hidden = loadState !== "loading" && !list.some(canMessage);
    // katılımcı yok / etkinlik yok / hata: arama ve "0 KİŞİ" satırı anlamsız (alt başlık "… • 0 kişi" zaten söylüyor)
    info.hidden = search.hidden = loadState === "error" || (loadState === "ready" && !list.length);
    if (loadState === "loading") {
      emptyBox.hidden = true; grid.hidden = false; grid.setAttribute("aria-busy", "true");
      grid.replaceChildren(...Array.from({ length: 6 }, () => h("li", { class: "dk-katilimcilar-sk", "aria-hidden": "true" })));
      resultLabel.textContent = "";
      return;
    }
    grid.removeAttribute("aria-busy");
    if (loadState === "error") {
      grid.hidden = true; grid.replaceChildren();
      const retry = h("button", { type: "button", class: "dk-katilimcilar-retry dk-press" }, "Tekrar dene");
      retry.addEventListener("click", () => load());
      emptyBox.replaceChildren(svgRaw(P.alert, { size: 44, sw: "1.4" }), h("span", {}, "Bir sorun oldu. Bağlantını kontrol edip tekrar dene."), retry);
      emptyBox.setAttribute("role", "alert"); emptyBox.hidden = false;
      resultLabel.textContent = "";
      return;
    }
    emptyBox.removeAttribute("role");
    const { all, filtered, shown } = visible();
    const fq = fold(q.trim());
    resultLabel.textContent = fq ? `${fmtInt(filtered.length)} SONUÇ` : `${fmtInt(all.length)} KİŞİ`;
    cards.clear(); unobserveAll();
    if (!filtered.length) {
      grid.hidden = true; grid.replaceChildren();
      if (!ev && !all.length) {
        // etkinlik yok (silinmiş/yanlış bağlantı) ve katılımcı da yok → "bulunamadı" + etkinliklere dönüş (legacy alt başlığı "Etkinlik • 0 kişi" korunur)
        emptyBox.replaceChildren(svgRaw(P.alert, { size: 44, sw: "1.4" }), h("span", {}, "Etkinlik bulunamadı."),
          h("a", { href: "#/etkinlikler", class: "dk-katilimcilar-retry dk-press" }, "Etkinliklere göz at"));
      } else {
        emptyBox.replaceChildren(svgRaw(P.people, { size: 44, sw: "1.4" }), h("span", {}, fq || all.length ? "Eşleşen katılımcı bulunamadı." : "Henüz katılımcı yok."));
      }
      emptyBox.hidden = false;
      if (anim) swapAnim(emptyBox);
      return;
    }
    emptyBox.hidden = true; emptyBox.replaceChildren();
    grid.hidden = false;
    grid.replaceChildren(...shown.map(personCard));
    if (anim) swapAnim(grid);
    renderMore(all.length, shown.length, !!fq);
  }
  function renderMore(total, shown, searching) {
    more.hidden = searching || shown >= total;
    if (more.hidden) { more.replaceChildren(); return; }
    const btn = h("button", { type: "button", class: "dk-katilimcilar-morebtn dk-press" }, "Daha fazla göster", svgRaw(P.chevronDown, { size: 15, sw: "2" }));
    btn.addEventListener("click", () => {
      const before = Math.min(limit, list.length);
      limit += PAGE;
      const added = list.slice(before, Math.min(limit, list.length)).map(personCard);
      grid.append(...added);
      renderMore(list.length, Math.min(limit, list.length), false);
      // odak (tıklanan düğme yeniden çizildi) ilk YENİ karta: mesaj düğmesi varsa o, yoksa (anonim / ben) kartın kendisi (tabindex −1)
      // → odak <body>'ye düşmez; sonraki Tab yeni kartlardan devam eder
      const first = added[0];
      if (first) {
        const target = first.querySelector("button") || first;
        if (target === first) first.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    });
    more.replaceChildren(h("span", { class: "dk-katilimcilar-morecap" }, `${fmtInt(total)} kişiden ${fmtInt(shown)} tanesi gösteriliyor`), btn);
  }

  // Fotoğraf + sanatçı türü: yalnız ekrana yaklaşan, anonim OLMAYAN katılımcılar (önbellekli; hata → baş harf yedeği).
  // users/{uid} okumaları 30'luk toplu `in` sorgusuyla (spec §7) — arama tüm eşleşmeleri çizse de yalnız görünenler okunur.
  const asked = new Set();
  let queue = new Set(), flushT = 0;
  const watched = new Map();           // li → p
  const io = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (!e.isIntersecting) return; const p = watched.get(e.target); io.unobserve(e.target); watched.delete(e.target); if (p) want(p); });
    }, { rootMargin: "600px 0px" })
    : null;
  unsubs.push(() => { io?.disconnect(); clearTimeout(flushT); });
  function observe(li, p) {
    if (p.anon || !p.uid || asked.has(p.uid)) return;
    if (!io) { want(p); return; }
    watched.set(li, p); io.observe(li);
  }
  function unobserveAll() { if (io) { watched.forEach((_, li) => io.unobserve(li)); } watched.clear(); }
  function want(p) {
    if (p.anon || !p.uid || asked.has(p.uid)) return;
    asked.add(p.uid); queue.add(p.uid);
    clearTimeout(flushT); flushT = setTimeout(flush, 40);
  }
  function flush() {
    if (dead) return;
    const ids = [...queue]; queue = new Set();
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      getDocs(fsQuery(collection(db, "users"), where("__name__", "in", chunk)))
        .then((snap) => {
          if (dead) return;
          snap.docs.forEach((d) => profiles.set(d.id, { id: d.id, ...d.data() }));
          chunk.forEach(applyProfile);
        })
        .catch((err) => { console.warn("[katilimcilar] users:", err?.code || err); });
    }
  }
  function applyProfile(u) {
    if (!profiles.has(u)) return;
    cards.forEach((c) => {
      if (c.p.uid !== u || !c.li.isConnected) return;
      const nAv = avatarEl(c.p);
      c.av.replaceWith(nAv); c.av = nAv;
      const old = c.col.querySelector(".dk-katilimcilar-ps"); const ns = subEl(c.p);
      if (old && ns) old.replaceWith(ns); else if (!old && ns) c.col.append(ns); else if (old && !ns) old.remove();
    });
  }

  function render(anim = false) {
    if (dead) return;
    renderCrumb(); renderEventCard(); renderHead(); renderList(anim);
  }

  async function load() {
    loadState = "loading"; render();
    const [e, att] = await Promise.all([
      eventById(id).catch((err) => { console.warn("[katilimcilar] eventById:", err?.code || err); return null; }),
      eventAttendees(id).then((x) => ({ ok: x }), (err) => ({ err })),
    ]);
    if (dead) return;
    ev = e;
    if (att.err) { console.warn("[katilimcilar] eventAttendees:", att.err?.code || att.err); loadState = "error"; list = []; render(); return; }
    const raw = att.ok.map((a) => {
      const uid = uidOf(a);
      return { key: a.id, uid, anon: a.anonymous === true, name: nameOf(a), me: !!myUid && (uid === myUid || a.id === myUid),
        genre: a.anonymous === true ? "" : (a.genre || ""), joined: toMs(a.joinedAt) || 0 };
    });
    raw.sort((x, y) => (y.me - x.me) || (y.joined - x.joined));
    list = raw.map((p, i) => ({ ...p, pal: PAL[i % PAL.length] }));
    loadState = "ready";
    render(true);
  }

  render();
  load();

  return {
    node: shell.node,
    update(query) {
      const nq = query.get("ara") || "";
      if (nq === q) return;
      q = nq; search.input.value = nq;
      renderList(true);
    },
    onSession() { return true; },
    destroy() { dead = true; unsubs.forEach((f) => { try { f(); } catch (_) {} }); shell.destroy(); },
  };
}
