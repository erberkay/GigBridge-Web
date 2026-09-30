// WebSanatciTop10 — Sanatçı Paneli · Top 10, masaüstü (≥769 px). Registry anahtarı: artistTop10 (#/artist/top10).
// Spec: specs/sanatci.md §WebSanatciTop10 (artboard design/WebSanatciTop10.dc.html + sahibinin CLAUDE CODE notu).
// CSS: css/dk-sanatci-top10.css — .dk-sanatci-top10 kökü + ortak kürsü/tablo parçaları (.dk-t10-*, js/desktop/artist/top10-parts.js).
// Legacy karşılığı: js/pages/artist.js renderTop10() + rankCard() — ≤768'de AYNEN kalır.
//
// Legacy özellikleri (korundu → yeni yerleri):
//   "Bölgendeki en çok puan ve yorum alanlar" · Sanatçılar / Gruplar sekmeleri → "Liste türü" sekmeleri · Şehir (81 il, aranabilir, boş =
//   Tümü; şehir seçilince ilçe sıfırlanır) → ŞEHİR çipleri (Tümü + 3 il) + "Diğer ▾" (aynı 81 il seçici) · İlçe (şehir seçilmeden pasif;
//   YALNIZ sanatçının ilçesi VARSA uygulanır; gruplarda yok) → İLÇE çipleri (seçili şehrin sanatçılarından türetilir; >12 ise 10 çip +
//   serbest metin) · puanlar CANLI reviews'tan (fetchArtistRatings ile aynı toplama; okunamazsa boş harita — legacy .catch(() => new Map()))
//   · sıralama bayesianScore(avg, count, ratingsGlobalMean) + legacy rankSort; yorumsuzlar listede ama sonda; ilk 10 · gruplar
//   listGroups: ilk 6 üyenin puanı yorum sayısıyla ağırlıklı, "{n} üye · {tür}" · madalya renkleri · satır tıklaması: sanatçı →
//   #/artist/sanatci/{id}, kendisi → #/artist/profil, grup → gezinme yok · boş durum "Sıralama yok" + "{şehir / ilçe} için henüz
//   sıralama yok." / "Henüz sıralanacak kayıt yok." · yükleme hatası errBox "Yüklenemedi".
// Yeni (tasarım): dönem sekmeleri (BU HAFTA / BU AY / TÜM ZAMANLAR → reviews.createdAt son 7 / 30 gün; tek okumadan), kürsü, DEĞ.
//   sütunu, skor çubuğu, SEN vurgusu, "Senin sıran" kartı, bilgi + DEĞİŞİM kartları, üst bar araması (ada göre süzer, spec Q2).
// DEĞ. (hareket): 24 saat önceki sıralamayla kıyas — aynı formül, aynı süzgeç, pencere 24 sa geri kaydırılmış (CF "günlük taban
//   çizgisi" semantiği; rankings/* dokümanları FARKLI formül kullandığı için karıştırılmaz — spec Q10). 24 sa önce yorumu olmayan kayıt →
//   nötr çizgi ("Değişim verisi yok").
// URL: #/artist/top10?tur=gruplar&donem=hafta|ay&sehir=…&ilce=…&q=… (history.replaceState; update(query) uygular).
// Veri (yeni indeks YOK): listRealArtists() · listGroups() (bir kez; şehir süzgeci istemcide = legacy where("city","==")) ·
//   reviews where targetType=="artist" (top10-parts.loadArtistReviews; fetchArtistRatings'in sorgusu + createdAt). Yazma YOK.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { listRealArtists, listGroups } from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { PROVINCES, fold, writeQuery, debounce } from "../shared/helpers.js";
import { panelCityPicker } from "./kesfet.js";
import {
  PERIODS, periodBySlug, kindBySlug, P, fmt1, placeOf, eyebrowText, districtsIn, initialOf, firstGenre,
  loadArtistReviews, aggregateReviews, windowOf, rankLegacy,
  kindTabs, filterCard, podium, rankTable, emptyBox, noticeBar, skeletonPodium, skeletonTable, infoCard, legendCard,
} from "./top10-parts.js";

let panelSeq = 0;
const cityFromParam = (v) => { const s = fold(String(v || "").replace(/-/g, " ")); return s && s !== "tumu" ? (PROVINCES.find((p) => fold(p) === s) || "") : ""; };

export function artistTop10View(ctx) {
  const s = ctx.session || session;
  const myUid = s.user?.uid || null;
  const prof = s.profile || {};
  const profSnap = JSON.stringify(prof);
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });

  // ── durum (URL'den) ──
  const qp = ctx.query || new URLSearchParams();
  let kind = kindBySlug(qp.get("tur"));
  let per = periodBySlug(qp.get("donem") || "tum").key;
  let city = cityFromParam(qp.get("sehir"));
  let district = (qp.get("ilce") || "").trim();
  let q = qp.get("q") || "";
  let data = null;        // { artists, groups, reviews, reviewsOk } — null = yükleniyor
  let failed = false;
  let anim = 0;
  const cache = new Map(); // per|baseline → ratings Map

  const shell = panelShell({
    role: "artist", active: ctx.route?.nav || "top10", title: "Top 10", subtitle: "Sanatçı Paneli · Sıralama", ctx,
    search: { placeholder: "Sanatçı veya grup ara", value: q, onInput: (v) => setQ(v), onSubmit: (v) => setQ(v) },
  });
  unsubs.push(() => shell.destroy());

  // ── başlık ──
  const panelId = `dk-st10-panel-${++panelSeq}`;   // sonuç paneli: iki sekme listesi (tür + dönem) bunu yönetir (aria-controls)
  const eyebrow = h("span", { class: "dk-eyebrow dk-sanatci-top10-eyebrow" });
  const tabs = kindTabs({ value: kind, controls: panelId, onChange: (k) => { kind = k; go(); } });
  const head = h("div", { class: "dk-sanatci-top10-head dk-rise" },
    h("div", { class: "dk-sanatci-top10-hl" },
      eyebrow,
      h("h1", { class: "dk-display dk-t52" }, "Bölgenin ", h("em", {}, "Top 10"), "'u"),
      h("p", { class: "dk-sanatci-top10-sub" }, "Bölgendeki en çok puan ve yorum alanlar")),
    tabs);

  // ── filtre kartı ──
  let pop = null;
  const fc = filterCard({
    per, city, district, kind, controls: panelId,
    onPer: (k) => { per = k; go(); },
    onCity: (c) => { if (c === city && !district) return; city = c; district = ""; go(); },
    onDistrict: (d) => { district = d || ""; go(); },
    onOther: (btn) => {
      if (pop) { pop.close("toggle", true); return; }
      btn.classList.add("is-open");
      pop = panelCityPicker({ anchor: btn, value: city, onPick: (c) => { if (c === city && !district) return; city = c; district = ""; go(); }, onClose: () => { pop = null; btn.classList.remove("is-open"); } });
    },
  });
  unsubs.push(() => pop?.close("destroy"));

  // ── ana ızgara ──
  const left = h("div", { class: "dk-t10-left", id: panelId, role: "tabpanel", "aria-label": "Sıralama", tabindex: "-1" });
  // Kendini DOM'dan kaldıran düğmeler (Yeniden dene) → odak kalıcı panele (body'ye düşmesin)
  const retry = () => { try { left.focus({ preventScroll: true }); } catch (_) {} load(true); };
  const myCard = h("section", { class: "dk-sanatci-top10-me", "aria-labelledby": "dk-st10-me-l" });
  const aside = h("aside", { "aria-label": "Senin durumun", class: "dk-sanatci-top10-aside" },
    myCard,
    infoCard({ title: "Sıralama nasıl hesaplanır?", body: "Sıralama puan ve yorum sayısına göre ağırlıklı hesaplanır; az yorumlu 5.0 puanlar tepeye zıplamaz. Yorumu olmayanlar listede kalır ama sona düşer. Gruplarda üyelerin puanları yorum sayısına göre birleştirilir." }),
    legendCard());
  const main = h("div", { class: "dk-sanatci-top10-grid" }, left, aside);
  const root = h("div", { class: "dk-sanatci-top10" }, head, fc.node, main);
  shell.content.append(root);

  // ── hesap ──
  const ratingsFor = (baseline) => {
    const key = per + (baseline ? "|b" : "");
    if (!cache.has(key)) cache.set(key, data.reviewsOk ? aggregateReviews(data.reviews, windowOf(per, Date.now(), { baseline })) : new Map());
    return cache.get(key);
  };
  const hrefOf = (it) => (it.isGroup ? null : it.id === myUid ? "#/artist/profil" : "#/artist/sanatci/" + encodeURIComponent(it.id));
  const rank = (baseline = false) => rankLegacy({ kind, artists: data.artists, groups: data.groups, ratings: ratingsFor(baseline), city, district });

  function drawMe(full, ratingsOff = false) {
    const genre = firstGenre(prof);
    const photo = prof.photoURL;
    const av = photo
      ? h("img", { src: photo, alt: "", class: "dk-sanatci-top10-meav" })
      : h("span", { class: "dk-sanatci-top10-meav is-ph", "aria-hidden": "true" }, initialOf(prof.displayName || "S"));
    if (photo) av.addEventListener("error", () => av.replaceWith(h("span", { class: "dk-sanatci-top10-meav is-ph", "aria-hidden": "true" }, initialOf(prof.displayName || "S"))), { once: true });
    const place = placeOf(city, district);
    let rk = "—", txt = "Bu filtrede listede değilsin", rating = "—", count = "—";
    if (kind === "groups") txt = "Grup sıralamasında kişisel sıra gösterilmez";
    else if (full && ratingsOff) txt = "Puanlar şu an alınamıyor — sıran puanlar yüklenince görünür";
    else if (full) {
      const i = full.findIndex((x) => x.id === myUid);
      if (i >= 0) {
        const me = full[i];
        rk = "#" + (i + 1);
        txt = `${place} · Top 10 ${i < 10 ? "içinde" : "dışında"}`;
        rating = me.reviewCount > 0 ? "★ " + fmt1(me.rating) : "—";
        count = String(me.reviewCount);
      }
    } else { txt = ""; }
    myCard.replaceChildren(
      h("span", { class: "dk-sanatci-top10-mel", id: "dk-st10-me-l" }, "SENİN SIRAN"),
      h("div", { class: "dk-sanatci-top10-mewho" }, av,
        h("span", { class: "dk-sanatci-top10-mecol" },
          h("span", { class: "dk-sanatci-top10-mename" }, prof.displayName || "Sanatçı"),
          h("span", { class: "dk-sanatci-top10-memeta" }, [genre, prof.district || prof.city].filter(Boolean).join(" · ") || "Sanatçı"))),
      h("div", { class: "dk-sanatci-top10-merank" }, h("span", { class: "dk-sanatci-top10-menum" }, full || kind === "groups" ? rk : "…"), h("span", { class: "dk-sanatci-top10-metxt" }, txt)),
      h("div", { class: "dk-sanatci-top10-tiles" },
        h("div", { class: "dk-sanatci-top10-tile" }, h("span", { class: "dk-sanatci-top10-tl" }, "PUAN"), h("span", { class: "dk-sanatci-top10-tv" }, rating)),
        h("div", { class: "dk-sanatci-top10-tile" }, h("span", { class: "dk-sanatci-top10-tl" }, "YORUM"), h("span", { class: "dk-sanatci-top10-tv" }, count))),
      h("a", { href: "#/artist/profil", class: "dk-sanatci-top10-cta dk-press" }, "Profilimi güçlendir", svgRaw(P.arrowR, { size: 15, sw: "2.2" })));
  }

  // still: true → giriş animasyonu YOK (üst bar aramasında her tuşta yeniden çizim; artboard yalnız ayrık filtre değişiminde oynatır)
  function draw({ still = false } = {}) {
    // ?ilce= / serbest metin → seçili şehrin kayıtlarındaki yazıma (rankLegacy legacy gibi BİREBİR karşılaştırır: "besiktas" → "Beşiktaş")
    const districts = data && kind === "artists" ? districtsIn(data.artists, city) : [];
    if (district && districts.length) {
      const cd = districts.find((d) => fold(d) === fold(district));
      if (cd && cd !== district) { district = cd; syncUrl(); }
    }
    const place = placeOf(city, district);
    eyebrow.textContent = eyebrowText(city, kind === "artists" ? district : "");
    tabs.dk.set(kind);
    const animCls = still ? null : anim % 2 ? "dk-fa" : "dk-fb";
    if (failed || (data && kind === "groups" && !data.groupsOk)) {
      fc.update({ per, city, district, kind, districts: [], count: "" });
      left.removeAttribute("aria-busy");
      left.replaceChildren(emptyBox({ title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile.",
        action: h("button", { type: "button", class: "dk-t10-retry dk-press", onclick: retry }, "Yeniden dene") }));
      drawMe(null);
      return;
    }
    if (!data) {
      fc.update({ per, city, district, kind, districts: [], count: "" });
      left.replaceChildren(skeletonPodium(), skeletonTable());
      left.setAttribute("aria-busy", "true");
      drawMe(null);
      return;
    }
    left.removeAttribute("aria-busy");
    // Puanlar okunamadı (kural/ağ; legacy .catch(() => new Map()) → liste legacy sırasıyla kalır) — kürsü/madalya/sıra İDDİASI YOK
    const ratingsOff = !data.reviewsOk;
    const full = rank(false);
    let items = full.slice(0, 10);
    // hareket: 24 sa önceki aynı süzgeçli sıralama (yalnız o anda yorumu olan kayıtlar)
    const prev = new Map();
    if (!ratingsOff) rank(true).forEach((x, i) => { if (x.reviewCount > 0) prev.set(x.id, i + 1); });
    const norm = (x, rk) => ({
      id: x.id, name: x.name, photoURL: x.photoURL, sub: x.sub,
      avg: ratingsOff ? null : x.rating, count: ratingsOff ? null : x.reviewCount, score: ratingsOff ? null : x.score,
      isMe: !x.isGroup && x.id === myUid, href: hrefOf(x), rank: rk,
      delta: x.reviewCount > 0 && prev.has(x.id) ? prev.get(x.id) - rk : null,
    });
    const ql = q.trim().toLocaleLowerCase("tr-TR");
    const noun = kind === "groups" ? "GRUP" : "SANATÇI";
    fc.update({ per, city, district, kind, districts, count: `${ql ? full.filter((x) => x.name.toLocaleLowerCase("tr-TR").includes(ql)).slice(0, 10).length : items.length} ${noun}` });
    drawMe(full, ratingsOff);

    const kids = [];
    if (ratingsOff) kids.push(noticeBar({ text: "Puanlar şu an alınamıyor; liste geçici ve puan sırasını yansıtmıyor.",
      action: h("button", { type: "button", class: "dk-t10-retry dk-press", onclick: retry }, "Yeniden dene") }));
    const colName = kind === "groups" ? "GRUP" : "SANATÇI";
    if (ql) {
      // üst bar araması: tam sıralı listeden ada göre eşleşenler (gerçek sıra numarasıyla), kürsüsüz tablo
      const matches = full.map((x, i) => [x, i + 1]).filter(([x]) => x.name.toLocaleLowerCase("tr-TR").includes(ql)).slice(0, 10);
      kids.push(matches.length
        ? rankTable(matches.map(([x, rk]) => norm(x, rk)), { colName, anim: animCls, still })
        : emptyBox({ title: "Sonuç yok", sub: `"${q.trim()}" ile eşleşen ${kind === "groups" ? "grup" : "sanatçı"} yok.`, anim: animCls }));
      left.replaceChildren(...kids);
      return;
    }
    if (!items.length) {
      kids.push(emptyBox({ sub: city ? `${place} için henüz sıralama yok.` : "Henüz sıralanacak kayıt yok.", anim: animCls }));
      left.replaceChildren(...kids);
      return;
    }
    const rows = items.map((x, i) => norm(x, i + 1));
    const showPodium = !ratingsOff && rows.length >= 3;
    if (showPodium) kids.push(podium(rows.slice(0, 3), { anim: animCls }));
    const rest = showPodium ? rows.slice(3) : rows;
    if (rest.length) kids.push(rankTable(rest, { colName, anim: animCls, still }));
    left.replaceChildren(...kids);
  }

  const syncUrl = debounce(() => {
    if (!alive) return;
    writeQuery({
      tur: kind === "groups" ? "gruplar" : null,
      donem: per === "a" ? null : PERIODS.find((p) => p.key === per)?.slug,
      sehir: city || null, ilce: city && kind === "artists" && district ? district : null, q: q.trim() || null,
    });
  }, 250);
  unsubs.push(() => syncUrl.cancel());
  // ayrık filtre değişimi → giriş animasyonlarını yeniden oynat (artboard gb-fa/gb-fb takası)
  function go() { anim++; syncUrl.flush(); draw(); }
  function setQ(v) { v = String(v ?? ""); if (v === q) return; q = v; syncUrl(); draw({ still: true }); }

  async function load(force = false) {
    failed = false; data = null; cache.clear();
    draw();
    try {
      const [artists, gr, rv] = await Promise.all([
        listRealArtists(),
        listGroups(null).then((g) => ({ ok: true, g }), () => ({ ok: false, g: [] })),   // grup okuması sanatçı sekmesini düşürmesin
        loadArtistReviews({ force }).then((r) => ({ ok: true, r }), () => ({ ok: false, r: [] })),
      ]);
      if (!alive) return;
      if (!rv.ok) console.warn("[Top 10] reviews okunamadı (kural) — puanlar boş haritayla (legacy davranışı).");
      data = { artists, groups: gr.g, groupsOk: gr.ok, reviews: rv.r, reviewsOk: rv.ok };
    } catch (_) {
      if (!alive) return;
      failed = true;
    }
    draw();
  }
  load();

  return {
    node: shell.node,
    destroy() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
    update(query) {
      const nk = kindBySlug(query?.get("tur"));
      const np = periodBySlug(query?.get("donem") || "tum").key;
      const nc = cityFromParam(query?.get("sehir"));
      const nd = (query?.get("ilce") || "").trim();
      const nq = query?.get("q") || "";
      if (nk === kind && np === per && nc === city && nd === district && nq === q) return;
      if (nq !== q && shell.search?.input) shell.search.input.value = nq;
      kind = nk; per = np; city = nc; district = nd; q = nq; anim++;
      draw();
    },
    onSession(ns) {
      return (ns?.user?.uid || null) === myUid && JSON.stringify(ns?.profile || {}) === profSnap;
    },
  };
}
