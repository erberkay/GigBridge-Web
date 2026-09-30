// WebSanatciKesfet — Sanatçı Paneli · Keşfet, masaüstü (≥769 px). Registry anahtarı: artistKesfet (#/artist/kesfet).
// Spec: specs/sanatci.md §WebSanatciKesfet (artboard design/WebSanatciKesfet.dc.html + sahibinin CLAUDE CODE notu).
// CSS: css/dk-sanatci-kesfet.css — tüm seçiciler .dk-sanatci-kesfet kökü altında.
// Legacy karşılığı: js/pages/artist.js renderDiscover() — ≤768'de AYNEN kalır (router bu modülü mobilde yüklemez).
//
// Legacy özellikleri (korundu → yeni yerleri):
//   "Diğer sanatçıları keşfet ve takip et" alt metni · Ara (ad + tür, tr-TR küçük harf "içerir", yazarken canlı) → ARA alanı (+ temizle)
//   · Şehir (81 il, aranabilir seçici, boş = Tümü) → ŞEHİR segmentleri (Tümü + 3 il) + "Diğer ▾" segmenti (aynı 81 il seçici, yerel)
//   · oturumdaki sanatçı listede YOK · satır: foto/baş harf, ad, "tür · şehir" (ikisi de yoksa "Sanatçı"), "★ 4.8 · 64 yorum" / "Yeni"
//   · Takip Et / Takipte (followArtist / unfollowArtist; tost "Takip edildi" / "Takipten çıkıldı"; hata "İşlem başarısız" + geri al;
//   kart başına meşgul koruması) · kart/ad tıklaması → #/artist/sanatci/{id} (legacy-in-shell SanatciDetay; oradan Mesaj)
//   · boş durum "Sanatçı bulunamadı" + "Aramanı değiştirmeyi dene." / "Yakında keşfedilecek sanatçılar burada." · yükleme hatası errBox
//   "Yüklenemedi / Bağlantıyı kontrol edip yenile.".
// Yeni (tasarım): başlık, takip sayacı hapı, kart ızgarası, tür etiketi, sayaç satırı, "Filtreleri temizle", yükleme iskeleti.
//
// URL: #/artist/kesfet?q=…&sehir=… (history.replaceState; update(query) geri/ileri ve paylaşılan linkte uygular). Üst bar araması
//   (panel kabuğu; diğer panel sekmelerinde Enter → #/artist/kesfet?q=…) bu sayfada ARA alanına bağlıdır (spec Q2 varsayılanı).
// Veri (yeni sorgu YOK): listRealArtists() + fetchArtistRatings().catch(() => new Map()) + followingList(uid) (legacy'nin kart başına
//   N adet isFollowing() okuması yerine tek okuma — spec §7 iyileştirmesi; aynı Set takip sayacını da verir).
// Yazma: yalnız takip — data.js followArtist/unfollowArtist (legacy ile aynı şekil: following + followers aynası + new_follower bildirimi).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { listRealArtists, fetchArtistRatings, followingList, followArtist, unfollowArtist } from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkToast, dkPopover, dkLoginGate, dkSkeleton } from "../shared/ui.js";
import { genreColor } from "../shared/genres.js";
import { PROVINCES, fold, trUpper, debounce, swapAnim, writeQuery } from "../shared/helpers.js";

// ── Artboard SVG gövdeleri (birebir) ──
const P = {
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  userPlus: '<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M18 8v6M15 11h6"></path>',
  users: '<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  chevD: '<path d="m6 9 6 6 6-6"></path>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z"></path><path d="m4 4 16 16"></path>',
};
const QUICK = ["İstanbul", "İzmir", "Ankara"];
const TOAST_MS = 2600;   // artboard DCLogic: 2600 ms
const genreOf = (a) => (Array.isArray(a.genres) ? (a.genres[0] || "") : (a.genre || ""));   // legacy genreOf
const nameOf = (a) => a.displayName || "Sanatçı";
const initialOf = (name) => (String(name).replace(/^DJ\s+/i, "").trim().charAt(0) || "?").toLocaleUpperCase("tr-TR");
// ?sehir= değeri → il adı (adın kendisi ya da aksansız/tireli yazımı); tanınmazsa ""
function cityFromParam(v) {
  const s = fold(String(v || "").replace(/-/g, " "));
  if (!s || s === "tumu" || s === "tum") return "";
  return PROVINCES.find((p) => fold(p) === s) || "";
}

// SHARED-CANDIDATE: shared/city-picker.js cityPicker() her seçimde gb_city'yi (herkese açık Keşfet'in şehri) yazar ve
// "dk:citychange" yayar. Sanatçı panelinin şehir süzgeci legacy'de YEREL (cityPickerField, gb_city'ye dokunmaz) → aynı görünümde
// (dk-ui.css .dk-cp sınıfları) kalıcı OLMAYAN yerel bir seçici. Öneri: cityPicker({ persist: false, allLabel: "Tümü" }).
// Dönüş: dkPopover kaydı ({ close }). WebSanatciTop10 da kullanır.
// Odak: seçimden sonra tetikleyiciye döner (dkPopover'ın döndürdüğü close(r) refocus argümanını iletmiyor → burada elle;
// SHARED-CANDIDATE: overlays.js dkPopover dönüşü close: (r, refocus) => close(r, refocus) olmalı). Shift+Tab (arama alanından)
// → kapanır + tetikleyici; odak başka yoldan popover dışına çıkarsa → kapanır (açık kalıp sahipsiz durmasın).
export function panelCityPicker({ anchor, value = "", allLabel = "Tümü", onPick, onClose }) {
  const input = h("input", { type: "search", "aria-label": "Şehir ara", placeholder: "Şehir ara...", class: "dk-cp-q", autocomplete: "off" });
  const list = h("div", { role: "listbox", "aria-label": "Şehirler", class: "dk-cp-list dk-scroll" });
  let pop = null;
  const refocus = () => { try { anchor?.focus({ preventScroll: true }); } catch (_) {} };
  const draw = () => {
    const q = fold(input.value.trim());
    const names = [allLabel, ...PROVINCES].filter((c) => !q || fold(c).includes(q));
    list.replaceChildren();
    if (!names.length) { list.append(h("span", { class: "dk-cp-empty" }, "Şehir bulunamadı")); return; }
    names.forEach((c) => {
      const key = c === allLabel ? "" : c;
      const on = key === (value || "");
      list.append(h("button", { type: "button", role: "option", "aria-selected": on ? "true" : "false", class: cx("dk-cp-opt", on && "is-on"),
        onclick: () => { pop?.close("pick"); refocus(); onPick?.(key); } }, h("span", {}, c)));
    });
  };
  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); list.querySelector("button")?.focus(); }
    if (e.key === "Enter") { e.preventDefault(); list.querySelector("button")?.click(); }
    if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); pop?.close("tab"); refocus(); }
  });
  list.addEventListener("keydown", (e) => {
    const opts = [...list.querySelectorAll("button")]; const i = opts.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && i < opts.length - 1) { e.preventDefault(); opts[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? opts[i - 1] : input).focus(); }
  });
  draw();
  const node = h("div", { class: "dk-cp" }, h("label", { class: "dk-cp-search" }, svgRaw(P.search, { size: 14, sw: "2", color: "#8A8E97" }), input), list);
  pop = dkPopover({ anchor, content: node, label: "Şehir seç", width: 320, offset: 8, placement: "bottom-end", cls: "dk-cp-pop", onClose });
  pop.node.addEventListener("focusout", (e) => { const t = e.relatedTarget; if (t && t !== anchor && !pop.node.contains(t)) pop.close("blur"); });
  requestAnimationFrame(() => { try { input.focus({ preventScroll: true }); } catch (_) {} });
  return pop;
}

export function artistKesfetView(ctx) {
  const s = ctx.session || session;
  const myUid = s.user?.uid || null;
  const unsubs = [];
  let alive = true;
  unsubs.push(() => { alive = false; });

  // ── durum ──
  let q = ctx.query?.get("q") || "";
  let city = cityFromParam(ctx.query?.get("sehir"));
  let artists = null;            // null = yükleniyor
  let ratings = new Map();
  let failed = false;
  const following = new Set();   // takip edilen sanatçı kimlikleri (artistId || doc id)
  const busy = new Set();
  let followReady = false;
  const profSnap = JSON.stringify(s.profile || {});   // onSession karşılaştırması (session nesnesi yerinde güncellenir)

  const shell = panelShell({
    role: "artist", active: ctx.route?.nav || "kesfet", title: "Keşfet", subtitle: "Sanatçı Paneli · Diğer sanatçılar", ctx,
    search: { placeholder: "Teklif, mekan veya sanatçı ara", value: q, onInput: (v) => setQuery(v, "top"), onSubmit: (v) => setQuery(v, "top") },
  });
  unsubs.push(() => shell.destroy());

  // ── başlık ──
  const pillText = h("span", {});
  const pill = h("span", { class: "dk-sanatci-kesfet-pill", "aria-live": "polite", hidden: true }, svgRaw(P.userPlus, { size: 15, sw: "2" }), pillText);
  const head = h("div", { class: "dk-sanatci-kesfet-head dk-rise" },
    h("div", { class: "dk-sanatci-kesfet-hl" },
      h("span", { class: "dk-eyebrow" }, "KEŞFET"),
      h("h1", { class: "dk-display dk-t52" }, "Sahnedeki ", h("em", {}, "diğer sesler")),
      h("p", { class: "dk-sanatci-kesfet-sub" }, "Diğer sanatçıları keşfet ve takip et")),
    pill);

  // ── filtreler ──
  const qInput = h("input", { type: "search", class: "dk-sanatci-kesfet-q", placeholder: "Sanatçı veya tür ara…", autocomplete: "off", spellcheck: "false", "aria-label": "Sanatçı veya tür ara" });
  qInput.value = q;
  const clearBtn = h("button", { type: "button", class: "dk-sanatci-kesfet-clear", "aria-label": "Aramayı temizle", hidden: !q }, svgRaw(P.x, { size: 13, sw: "2.4" }));
  const field = h("span", { class: "dk-sanatci-kesfet-field dk-field" }, svgRaw(P.search, { size: 17, sw: "2", color: "#8A8E97" }), qInput, clearBtn);
  const araLabel = h("label", { class: "dk-sanatci-kesfet-fcol" }, h("span", { class: "dk-label" }, "ARA"), field);

  const segBtns = [["", "Tümü"], ...QUICK.map((c) => [c, c])].map(([key, label]) =>
    h("button", { type: "button", class: "dk-sanatci-kesfet-segb dk-press", dataset: { key } }, svgRaw(P.pin, { size: 13, sw: "2.2", color: "#FF4FA3", cls: "dk-sanatci-kesfet-pin" }), h("span", {}, label)));
  const otherLbl = h("span", {}, "Diğer");
  const otherBtn = h("button", { type: "button", class: "dk-sanatci-kesfet-segb dk-sanatci-kesfet-other dk-press", "aria-haspopup": "dialog", "aria-expanded": "false" },
    svgRaw(P.pin, { size: 13, sw: "2.2", color: "#FF4FA3", cls: "dk-sanatci-kesfet-pin" }), otherLbl, svgRaw(P.chevD, { size: 13, sw: "2", cls: "dk-sanatci-kesfet-chev" }));
  const cityLblId = "dk-sk-city-l";
  const seg = h("div", { role: "group", "aria-labelledby": cityLblId, class: "dk-sanatci-kesfet-seg" }, ...segBtns, otherBtn);
  const cityCol = h("div", { class: "dk-sanatci-kesfet-fcol" }, h("span", { class: "dk-label", id: cityLblId }, "ŞEHİR"), seg);
  const filters = h("section", { "aria-label": "Filtreler", class: "dk-sanatci-kesfet-filters" }, araLabel, cityCol);

  // ── sayaç + ızgara ──
  const countEl = h("span", { class: "dk-sanatci-kesfet-n", "aria-live": "polite" });
  const countRow = h("div", { class: "dk-sanatci-kesfet-count" }, countEl, h("span", { class: "dk-sanatci-kesfet-hint" }, "Karta tıkla → tam profil"));
  const grid = h("div", { class: "dk-sanatci-kesfet-grid dk-fb" });
  // tabindex=-1: "Yenile" kendini DOM'dan kaldırır → odak bu kalıcı kaba döner (body'ye düşmez)
  const body = h("div", { class: "dk-sanatci-kesfet-body", tabindex: "-1", "aria-label": "Sanatçılar", role: "region" }, grid);

  const root = h("div", { class: "dk-sanatci-kesfet" }, head, filters, countRow, body);
  shell.content.append(root);

  // ── yardımcılar ──
  const artistHref = (a) => "#/artist/sanatci/" + encodeURIComponent(a.id);
  const paintPill = () => {
    pill.hidden = !followReady;
    pillText.textContent = `${following.size} sanatçıyı takip ediyorsun`;
  };
  const paintCity = () => {
    segBtns.forEach((b) => { const on = b.dataset.key === city; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    const other = !!city && !QUICK.includes(city);
    otherBtn.classList.toggle("is-on", other);
    otherBtn.setAttribute("aria-pressed", other ? "true" : "false");
    otherLbl.textContent = other ? city : "Diğer";
    otherBtn.setAttribute("aria-label", other ? `Şehir: ${city} — başka il seç` : "Diğer iller");
  };
  const syncUrl = debounce(() => { if (alive) writeQuery({ q: q.trim() || null, sehir: city || null }); }, 250);
  unsubs.push(() => syncUrl.cancel());

  function followBtn(a) {
    const name = nameOf(a);
    const b = h("button", { type: "button", class: "dk-sanatci-kesfet-fol dk-press" });
    const paint = () => {
      const on = following.has(a.id);
      b.classList.toggle("is-on", on);
      // Durum TEK kanaldan: görünen metni içeren değişen ad (aria-pressed yok → çift/çelişkili duyuru olmaz; WCAG 2.5.3 ad-içinde-etiket)
      b.setAttribute("aria-label", on ? `Takipte: ${name} — takipten çık` : `Takip Et: ${name}`);
      b.replaceChildren(svgRaw(on ? P.check : P.plus, { size: 14, sw: "2.2" }), h("span", {}, on ? "Takipte" : "Takip Et"));
      b.disabled = !followReady;
    };
    b.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (dkLoginGate("Takip etmek")) return;
      if (!myUid || busy.has(a.id) || !followReady) return;
      busy.add(a.id);
      const was = following.has(a.id);
      if (was) following.delete(a.id); else following.add(a.id);
      paint(); paintPill();
      try {
        if (was) await unfollowArtist(myUid, a.id);
        else await followArtist(myUid, { id: a.id, name, genre: genreOf(a) });
        if (alive) dkToast(was ? "Takipten çıkıldı" : "Takip edildi", { duration: TOAST_MS });
      } catch (_) {
        if (was) following.add(a.id); else following.delete(a.id);
        if (alive) dkToast("İşlem başarısız", { type: "err", duration: TOAST_MS });
      } finally {
        busy.delete(a.id);
        if (alive) { paint(); paintPill(); }
      }
    });
    b._paint = paint;
    paint();
    return b;
  }

  function card(a) {
    const name = nameOf(a);
    const genre = genreOf(a);
    const agg = ratings.get(a.id);
    const count = agg?.count ?? 0;
    const href = artistHref(a);
    const ph = () => h("span", { class: "dk-sanatci-kesfet-ph", "aria-hidden": "true" }, initialOf(name));
    let media;
    if (a.photoURL) {
      media = h("img", { src: a.photoURL, alt: "", loading: "lazy", decoding: "async", class: "dk-sanatci-kesfet-img" });
      media.addEventListener("error", () => media.replaceWith(ph()), { once: true });
    } else media = ph();
    return h("article", { class: "dk-sanatci-kesfet-card dk-card" },
      h("a", { href, class: "dk-sanatci-kesfet-media", "aria-label": `${name} profilini aç` }, media,
        genre ? h("span", { class: "dk-sanatci-kesfet-tag" }, h("span", { class: "dk-sanatci-kesfet-dot", style: { background: genreColor(genre) } }), trUpper(genre)) : null),
      h("div", { class: "dk-sanatci-kesfet-cbody" },
        h("div", { class: "dk-sanatci-kesfet-info" },
          h("a", { href, class: "dk-sanatci-kesfet-name", tabindex: "-1" }, name),
          h("span", { class: "dk-sanatci-kesfet-meta" }, [genre, a.city].filter(Boolean).join(" · ") || "Sanatçı"),
          count > 0
            ? h("span", { class: "dk-sanatci-kesfet-rate" }, `★ ${agg.avg.toFixed(1)} · ${count} yorum`)
            : h("span", { class: "dk-sanatci-kesfet-rate is-new" }, "Yeni")),
        followBtn(a)));
  }

  function skeleton() {
    return Array.from({ length: 10 }, () => h("div", { class: "dk-sanatci-kesfet-card is-skel", "aria-hidden": "true" },
      dkSkeleton({ h: 196, r: 0 }),
      h("div", { class: "dk-sanatci-kesfet-cbody" },
        h("div", { class: "dk-sanatci-kesfet-info" }, dkSkeleton({ w: "70%", h: 16 }), dkSkeleton({ w: "55%", h: 12 }), dkSkeleton({ w: "45%", h: 12 })),
        dkSkeleton({ h: 40, r: 6, style: { marginTop: "auto" } }))));
  }

  function emptyBox(title, sub, action) {
    return h("div", { class: "dk-sanatci-kesfet-empty dk-fb" },
      svgRaw(P.users, { size: 38, sw: "1.5" }),
      h("span", { class: "dk-sanatci-kesfet-empty-t" }, title),
      h("span", { class: "dk-sanatci-kesfet-empty-s" }, sub),
      action);
  }

  let lastKey = null;
  function draw({ anim = false } = {}) {
    paintCity();
    clearBtn.hidden = !q;
    if (failed) {
      countEl.textContent = "";
      body.replaceChildren(emptyBox("Yüklenemedi", "Bağlantıyı kontrol edip yenile.",
        h("button", { type: "button", class: "dk-sanatci-kesfet-reset dk-press", onclick: () => { try { body.focus({ preventScroll: true }); } catch (_) {} load(); } }, "Yenile")));
      return;
    }
    if (!artists) {
      countEl.textContent = "";
      grid.setAttribute("aria-busy", "true");
      grid.replaceChildren(...skeleton());
      if (grid.parentNode !== body) body.replaceChildren(grid);
      return;
    }
    grid.removeAttribute("aria-busy");
    const ql = q.trim().toLocaleLowerCase("tr-TR");
    const list = artists.filter((a) =>
      (!city || (a.city || "") === city) &&
      (!ql || `${a.displayName || ""} ${genreOf(a)}`.toLocaleLowerCase("tr-TR").includes(ql)));
    countEl.textContent = `${list.length} SANATÇI` + (city ? ` · ${trUpper(city)}` : "");
    const key = ql + "|" + city;
    const changed = key !== lastKey;
    lastKey = key;
    if (!list.length) {
      // "Filtreleri temizle" kendini kaldırır → odak ARA alanına
      const reset = h("button", { type: "button", class: "dk-sanatci-kesfet-reset dk-press", onclick: () => { setQuery("", "reset"); setCity(""); try { qInput.focus({ preventScroll: true }); } catch (_) {} } }, "Filtreleri temizle");
      body.replaceChildren(emptyBox("Sanatçı bulunamadı", q ? "Aramanı değiştirmeyi dene." : "Yakında keşfedilecek sanatçılar burada.", reset));
      return;
    }
    grid.replaceChildren(...list.map(card));
    if (grid.parentNode !== body) body.replaceChildren(grid);
    if (anim && changed) swapAnim(grid);
  }

  function setQuery(v, from) {
    v = String(v ?? "");
    if (v === q) return;
    q = v;
    if (from !== "field" && qInput.value !== v) qInput.value = v;
    if (from !== "top" && shell.search?.input && shell.search.input.value !== v) shell.search.input.value = v;
    syncUrl();
    draw({ anim: from === "reset" || from === "clear" || from === "url" });
  }
  function setCity(c) {
    c = c || "";
    if (c === city) return;
    city = c;
    syncUrl.flush();
    draw({ anim: true });
  }

  qInput.addEventListener("input", () => setQuery(qInput.value, "field"));
  qInput.addEventListener("keydown", (e) => { if (e.key === "Escape" && qInput.value) { e.preventDefault(); setQuery("", "clear"); } });
  clearBtn.addEventListener("click", () => { setQuery("", "clear"); qInput.focus(); });
  segBtns.forEach((b) => b.addEventListener("click", () => setCity(b.dataset.key)));
  let pop = null;
  otherBtn.addEventListener("click", () => {
    if (pop) { pop.close("toggle", true); return; }
    otherBtn.classList.add("is-open");
    pop = panelCityPicker({ anchor: otherBtn, value: city, onPick: (c) => setCity(c), onClose: () => { pop = null; otherBtn.classList.remove("is-open"); } });
  });
  unsubs.push(() => pop?.close("destroy"));

  // ── veri ──
  async function load() {
    failed = false; artists = null;
    draw();
    try {
      const [list, rt] = await Promise.all([listRealArtists(), fetchArtistRatings().catch(() => new Map())]);
      if (!alive) return;
      artists = list.filter((a) => a.id !== myUid);   // kendini gösterme (legacy)
      ratings = rt;
    } catch (_) {
      if (!alive) return;
      failed = true;
    }
    draw();
  }
  async function loadFollowing() {
    if (!myUid || s.guest) { followReady = true; paintPill(); pill.hidden = true; return; }
    try {
      const list = await followingList(myUid);
      if (!alive) return;
      following.clear();
      // users/{uid}/following genel takibi de tutar (app followUser: targetType) → yalnız sanatçı hedefler sayılır
      list.forEach((f) => { if (!f.targetType || f.targetType === "artist") following.add(f.artistId || f.id); });
    } catch (_) { /* okunamazsa hepsi "Takip Et" (legacy isFollowing hata → false) */ }
    if (!alive) return;
    followReady = true;
    paintPill();
    grid.querySelectorAll(".dk-sanatci-kesfet-fol").forEach((b) => b._paint?.());
  }
  load();
  loadFollowing();

  return {
    node: shell.node,
    destroy() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); },
    // Yalnız ?sorgu değişti (geri/ileri, paylaşılan link, üst bar Enter'ı başka sekmeden)
    update(query) {
      const nq = query?.get("q") || "";
      const nc = cityFromParam(query?.get("sehir"));
      let ch = false;
      if (nq !== q) { q = nq; qInput.value = nq; if (shell.search?.input) shell.search.input.value = nq; ch = true; }
      if (nc !== city) { city = nc; ch = true; }
      if (ch) draw({ anim: true });
    },
    // Aynı kimlik + aynı profil → yerinde kal (kabuk ve veri korunur)
    onSession(ns) {
      return (ns?.user?.uid || null) === myUid && JSON.stringify(ns?.profile || {}) === profSnap;
    },
  };
}
