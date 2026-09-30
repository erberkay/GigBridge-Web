// WebYorumlarim — masaüstü görünümü (≥769 px). Registry anahtarı: yorumlarim (#/yorumlarim).
// Spec: specs/hesap.md WebYorumlarim + sahibinin CLAUDE CODE notu (design/WebYorumlarim.dc.html).
// CSS: css/dk-yorumlarim.css — tüm seçiciler .dk-yorumlarim kökü (ve portal içindeki .dk-yorumlarim-* modal/toast sınıfları) altında.
// ≤768: legacy customer.js myReviewsView() aynen kalır.
//
// Legacy özellikleri (korundu): myReviews(uid) listesi (sanatçı = reviews, mekan = venueReviews), "N yorum • Ortalama ★ x.x" (→ KPI satırı),
//   yorum kartı (hedef adı, etkinlik, tarih, yıldızlar, yorum, tür etiketi), Düzenle modalı ("Yorumu Düzenle", hedef adı, "Puanınız",
//   textarea 500, boş → "Yorum boş olamaz", yama venue {comment, rating, overallRating} / artist {comment, rating} — updateMyReview),
//   Sil onayı → deleteMyReview, hata toast'ları "Güncellenemedi" / "Silinemedi", boş durum metni.
// Tasarım ekleri: KPI satırı, filtre sekmeleri (Tümü/Sanatçı/Mekan — _col'a göre), foto avatarlar (users/{id}.photoURL, önbellekli),
//   silmede "GERİ AL" (sahibi notu: 4 sn geri al; yıkıcı yazım toast süresi dolunca yapılır — dkToast onExpire; geri alınırsa yazım yok).
// URL: ?tur=sanatci|mekan (sekme; replaceState, geri/ileri → update()).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { myReviews, updateMyReview, deleteMyReview, getUser } from "../../data.js";
import { accountShell } from "../shared/account-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkPageHead, dkSegmented, dkEmpty, dkButton, dkModal, dkToast, dkSkeleton, dkTextarea } from "../shared/ui.js";
import { invalidateAccountCounts } from "../shared/live.js";
import { toMs, trUpper, initials, MONTHS_TR, writeQuery } from "../shared/helpers.js";

// ── Artboard SVG gövdeleri (birebir) ──
const STAR = '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>';
const NOTE = '<path d="M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"></path>';
const PEN = '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path>';
const TRASH = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>';
const TYPE = {
  venueReviews: { label: "MEKAN", cls: "is-venue" },
  reviews: { label: "SANATÇI", cls: "is-artist" },
};
const TABS = { tumu: null, sanatci: "reviews", mekan: "venueReviews" };
const OUT_MS = 360;

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
const clampStars = (v) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
const ratingOf = (r) => Number(r?.overallRating ?? r?.rating) || 0;
const isVenue = (r) => r._col === "venueReviews";
const targetId = (r) => (isVenue(r) ? r.venueId : r.targetId) || null;
const targetName = (r) => r.targetName || r.venueName || "—";
const hrefOf = (r) => { const id = targetId(r); return id ? (isVenue(r) ? "#/mekan/" : "#/sanatci/") + encodeURIComponent(id) : null; };
// "25 EYLÜL 2026"
const dateUp = (v) => { const t = toMs(v); if (t == null) return ""; const d = new Date(t); return trUpper(`${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`); };

function starSvg(on, size, sw) {
  const s = svgRaw(STAR, { size, sw, color: on ? "#FF8A2A" : "#7D818B" });
  s.setAttribute("fill", on ? "#FF8A2A" : "none");
  s.removeAttribute("stroke-linecap");
  return s;
}
function paintStar(svg, on) { svg.setAttribute("fill", on ? "#FF8A2A" : "none"); svg.setAttribute("stroke", on ? "#FF8A2A" : "#7D818B"); }

// StarRating (giriş) — radiogroup "Puanınız", 44px düğmeler (svg 30), hover ölçek (.dk-star), ok tuşları.
// SHARED-CANDIDATE: WebKatildiklarim RateModal'ı da aynı bileşeni kullanıyor (svg 32 + gbStarPop) — ortak dkStarRating önerisi.
function starRating({ value = 0, label, onChange }) {
  const group = h("div", { role: "radiogroup", "aria-label": label, class: "dk-yorumlarim-stars" });
  const btns = [];
  const set = (n, focus = false) => {
    value = n;
    btns.forEach((b, i) => {
      const k = i + 1;
      b.setAttribute("aria-checked", k === n ? "true" : "false");
      b.tabIndex = (n ? k === n : k === 1) ? 0 : -1;
      paintStar(b.firstChild, k <= n);
    });
    if (focus) btns[n - 1]?.focus();
  };
  for (let k = 1; k <= 5; k++) {
    const b = h("button", { type: "button", role: "radio", class: "dk-star dk-yorumlarim-starbtn", "aria-label": `${k} yıldız` }, starSvg(false, 30, "1.5"));
    b.addEventListener("click", () => { set(k); onChange?.(k); });
    btns.push(b); group.append(b);
  }
  group.addEventListener("keydown", (e) => {
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    let n = null;
    if (e.key in map) n = Math.min(5, Math.max(1, (value || 0) + map[e.key]));
    else if (e.key === "Home") n = 1;
    else if (e.key === "End") n = 5;
    if (n == null) return;
    e.preventDefault(); set(n, true); onChange?.(n);
  });
  set(value);
  group.dk = { set, get: () => value };
  return group;
}

export function yorumlarimView(ctx) {
  const s = ctx.session || session;
  const uid = s.user && !s.guest ? s.user.uid : null;
  const shell = accountShell({ active: "yorumlarim", contentGap: 28, ctx });
  let dead = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); return t; };

  let list = [];            // görünen (silinmemiş) yorumlar — createdAt azalan (data.js sıralaması)
  let loaded = false;
  const tabOf = (q) => { const t = q?.get("tur"); return t === "sanatci" || t === "mekan" ? t : "tumu"; };
  let tab = tabOf(ctx.query);
  const photos = new Map();  // hedef id → photoURL | null (önbellek)
  let modal = null;
  // Onaylanmış ama henüz GERİ AL toast'una devredilmemiş silmeler (çıkış animasyonu sırasında). Görünüm bu arada yok edilirse
  // (rota değişimi) ya da sayfa kapanırsa silme kaybolmasın diye destroy()/pagehide'da hemen işlenir.
  const pendingDel = new Map();   // keyOf(r) → r
  const commitPending = () => {
    if (!pendingDel.size) return;
    const items = [...pendingDel.values()];
    pendingDel.clear();
    items.forEach((r) => { deleteMyReview(r._col, r.id).catch(() => {}); });
    if (uid) invalidateAccountCounts(uid);
  };
  window.addEventListener("pagehide", commitPending);
  // Odak yönetimi: kart değişince/kaldırılınca odak <body>'ye düşmesin
  const focusLost = (scope) => { const a = document.activeElement; return !a || a === document.body || !a.isConnected || !!(scope && scope.contains(a)); };
  const focusEl = (el) => { try { el?.focus({ preventScroll: true }); } catch (_) {} };
  const focusNear = (idx) => {
    const els = [...listEl.querySelectorAll(".dk-yorumlarim-rv")];
    const c = els[Math.max(0, Math.min(idx, els.length - 1))];
    focusEl(c ? c.querySelector(".dk-yorumlarim-ib") : (listEl.querySelector("a[href],button") || seg.querySelector('[role="tab"][aria-selected="true"]')));
  };

  // ── iskelet ──
  const head = dkPageHead({ title: "Yorum", em: "larım", lead: "Sanatçılara ve mekanlara yazdığın değerlendirmeler. Dilediğin zaman düzenleyebilir veya silebilirsin." });
  const kTotal = h("span", { class: "dk-yorumlarim-kv" }, "—");
  const kAvg = h("span", { class: "dk-yorumlarim-kvt" }, "—");
  const kArt = h("b", {}, "—"), kVen = h("b", {}, "—");   // yüklenene dek "—" (0 gerçek veri gibi görünmesin)
  const kpis = h("div", { class: "dk-yorumlarim-kpis dk-rise", style: { "--dk-delay": "60ms" } },
    h("div", { class: "dk-yorumlarim-kpi" }, h("span", { class: "dk-yorumlarim-kl" }, "TOPLAM YORUM"), kTotal),
    h("div", { class: "dk-yorumlarim-kpi" }, h("span", { class: "dk-yorumlarim-kl" }, "ORTALAMA PUANIN"),
      h("span", { class: "dk-yorumlarim-kv dk-yorumlarim-kavg" }, svgRaw(STAR, { size: 22, fill: true, color: "#FF8A2A" }), kAvg)),
    h("div", { class: "dk-yorumlarim-kpi" }, h("span", { class: "dk-yorumlarim-kl" }, "DAĞILIM"),
      h("span", { class: "dk-yorumlarim-dist" },
        h("span", { class: "dk-yorumlarim-dart" }, kArt, " sanatçı"),
        h("span", { class: "dk-yorumlarim-dven" }, kVen, " mekan"))));
  const seg = dkSegmented({
    items: [{ key: "tumu", label: "Tümü", count: 0 }, { key: "sanatci", label: "Sanatçı", count: 0 }, { key: "mekan", label: "Mekan", count: 0 }],
    value: tab, label: "Yorum filtresi", countColor: "#4ED8FF",
    onChange: (k) => { if (k === tab) return; tab = k; writeQuery({ tur: k === "tumu" ? null : k }); drawList(true); },
  });
  seg.classList.add("dk-rise", "dk-yorumlarim-seg");
  seg.style.setProperty("--dk-delay", "100ms");
  // Yüklenirken sekme sayaçları görünmez (yer tutar → kayma yok); hata durumunda KPI satırı ve sekmeler gizlenir (Katıldıklarım gibi).
  const segCounts = (on) => seg.querySelectorAll(".dk-seg-n").forEach((n) => { n.style.visibility = on ? "" : "hidden"; });
  const showControls = (on) => { kpis.hidden = !on; seg.hidden = !on; };
  segCounts(false);
  const listEl = h("div", { class: "dk-yorumlarim-list", "aria-busy": "true" });
  const root = h("div", { class: "dk-yorumlarim" }, head, kpis, seg, listEl);
  shell.content.append(root);

  const skeleton = () => h("div", { class: "dk-yorumlarim-skel", "aria-hidden": "true" },
    ...[0, 1, 2].map(() => h("div", { class: "dk-yorumlarim-card" },
      h("div", { class: "dk-yorumlarim-top" }, dkSkeleton({ w: 52, h: 52, r: 26 }),
        h("span", { class: "dk-yorumlarim-tcol" }, dkSkeleton({ w: "34%", h: 17 }), dkSkeleton({ w: "24%", h: 12 }))),
      h("div", { class: "dk-yorumlarim-body" }, dkSkeleton({ w: 96, h: 16 }), dkSkeleton({ w: "62%", h: 15 })))));
  listEl.append(skeleton());

  // ── KPI + sekme sayaçları ──
  function syncKpis() {
    const nArt = list.filter((r) => !isVenue(r)).length;
    const nVen = list.length - nArt;
    const rr = list.map(ratingOf).filter((x) => x > 0);
    kTotal.textContent = String(list.length);
    kAvg.textContent = rr.length ? (rr.reduce((a, b) => a + b, 0) / rr.length).toFixed(1) : "—";   // legacy: toFixed(1), "—"
    kArt.textContent = String(nArt); kVen.textContent = String(nVen);
    seg.dk.setCount("tumu", list.length); seg.dk.setCount("sanatci", nArt); seg.dk.setCount("mekan", nVen);
    segCounts(true);
  }

  // ── kart ──
  function avatar(r) {
    const name = targetName(r);
    const photo = photos.get(targetId(r));
    const inner = photo
      ? h("img", { src: photo, alt: "", loading: "lazy", decoding: "async", class: "dk-yorumlarim-avimg" })
      : h("span", { class: cx("dk-yorumlarim-avini", isVenue(r) && "is-venue") }, initials(name));
    if (photo) inner.addEventListener("error", () => inner.replaceWith(h("span", { class: cx("dk-yorumlarim-avini", isVenue(r) && "is-venue") }, initials(name))), { once: true });
    const href = hrefOf(r);
    return h(href ? "a" : "span", { href, class: cx("dk-yorumlarim-av", isVenue(r) && "is-venue"), "aria-label": href ? name : null }, inner);
  }
  function card(r, i, anim) {
    const name = targetName(r);
    const T = TYPE[r._col] || TYPE.reviews;
    const n = clampStars(ratingOf(r));
    const stars = h("span", { class: "dk-yorumlarim-rstars", role: "img", "aria-label": `${n} / 5 yıldız` });
    for (let k = 1; k <= 5; k++) stars.append(starSvg(k <= n, 16, "1.6"));
    const href = hrefOf(r);
    const el = h("article", { class: cx("dk-yorumlarim-card", "dk-yorumlarim-rv", anim && "dk-rise"), style: anim ? { "--dk-delay": 140 + i * 60 + "ms" } : null, dataset: { id: r.id } },
      h("div", { class: "dk-yorumlarim-top" },
        avatar(r),
        h("span", { class: "dk-yorumlarim-tcol" },
          h("span", { class: "dk-yorumlarim-namerow" },
            h(href ? "a" : "span", { href, class: "dk-yorumlarim-name" }, name),
            h("span", { class: cx("dk-yorumlarim-chip", T.cls) }, T.label)),
          h("span", { class: "dk-yorumlarim-meta" },
            r.event ? h("span", { class: "dk-yorumlarim-ev" }, svgRaw(NOTE, { size: 13, sw: "1.9", color: "#FF4FA3" }), h("span", { class: "dk-yorumlarim-evt" }, r.event)) : null,
            h("span", { class: "dk-yorumlarim-date" }, dateUp(r.createdAt)))),
        h("button", { type: "button", class: "dk-yorumlarim-ib", "aria-label": `${name} yorumunu düzenle`, onclick: () => editReview(r) }, svgRaw(PEN, { size: 17, sw: "1.9" })),
        h("button", { type: "button", class: "dk-yorumlarim-ib is-del", "aria-label": `${name} yorumunu sil`, onclick: () => delReview(r) }, svgRaw(TRASH, { size: 17, sw: "1.9" }))),
      h("div", { class: "dk-yorumlarim-body" }, stars, r.comment ? h("p", { class: "dk-yorumlarim-comment" }, r.comment) : null));
    return el;
  }

  const cards = new Map();   // review key → article
  const keyOf = (r) => r._col + "/" + r.id;
  function emptyState() {
    const sub = "Etkinliklere katıldıktan sonra sanatçı ve mekan yorumu yazabilirsiniz.";
    const title = tab === "sanatci" && list.length ? "Henüz sanatçı yorumu yazmadınız." : tab === "mekan" && list.length ? "Henüz mekan yorumu yazmadınız." : "Henüz yorum yazmadınız.";
    const icon = svgRaw(STAR, { size: 40, sw: "1.5", color: "#8A8E97" });
    icon.removeAttribute("stroke-linecap");
    return dkEmpty({ icon, title, sub, height: 320, cls: "dk-rise dk-yorumlarim-empty",
      action: dkButton("Katıldıklarımı puanla", { variant: "light", size: 42, href: "#/katildiklarim" }) });
  }
  function drawList(anim = false) {
    if (!loaded) return;
    syncKpis();
    listEl.removeAttribute("aria-busy");
    listEl.replaceChildren();
    cards.clear();
    const col = TABS[tab];
    const shown = list.filter((r) => !col || r._col === col);
    if (!shown.length) { listEl.append(emptyState()); return; }
    shown.forEach((r, i) => { const c = card(r, i, anim); cards.set(keyOf(r), c); listEl.append(c); });
  }

  // ── Düzenle ──
  function editReview(r) {
    const name = targetName(r);
    let rating = clampStars(ratingOf(r));
    let touched = false;
    // "Yorum boş olamaz" (sahibi notu) mevcut yorumu silmeye karşı; Katıldıklarım'da yalnız yıldızla (yorumsuz) verilen puanın
    // yıldızı burada metin yazmadan değiştirilebilsin (aksi hâlde çıkmaz). Yorum isteğe bağlılığı: açık soru (legacy/app ≥10 karakter).
    const needText = !!String(r.comment || "").trim();
    const stars = starRating({ value: rating, label: "Puanınız", onChange: (n) => { rating = n; } });
    const ta = dkTextarea({ id: "dk-yorum-ed", rows: 4, maxlength: 500, counter: false, bg: "void", placeholder: "Yorumunuzu yazın...", value: r.comment || "" });
    const err = h("span", { class: "dk-yorumlarim-err", role: "status" });
    const cnt = h("span", { class: "dk-yorumlarim-count" });
    const sync = () => {
      const empty = !ta.value.trim();
      const bad = touched && empty && needText;
      err.textContent = bad ? "Yorum boş olamaz" : "";
      if (bad) { ta.setAttribute("aria-invalid", "true"); ta.setAttribute("aria-describedby", "dk-yorum-ederr"); }
      else { ta.removeAttribute("aria-invalid"); ta.removeAttribute("aria-describedby"); }
      cnt.textContent = `${ta.value.length}/500`;
    };
    err.id = "dk-yorum-ederr";
    ta.addEventListener("input", sync);
    sync();
    const body = [
      h("div", { class: "dk-yorumlarim-fld" }, h("span", { class: "dk-yorumlarim-lbl" }, "PUANINIZ"), stars),
      h("div", { class: "dk-yorumlarim-fld" }, h("label", { for: "dk-yorum-ed", class: "dk-yorumlarim-lbl" }, "YORUMUNUZ"), ta, h("span", { class: "dk-yorumlarim-row2" }, err, cnt)),
    ];
    const m = dkModal({
      title: "Yorumu Düzenle", sub: name, size: 500, top: 180, cls: "dk-yorumlarim-ed", body,
      actions: [
        { label: "İptal", variant: "outline" },
        { label: "Kaydet", variant: "primary", keepOpen: true, busyLabel: "Kaydediliyor…", onClick: async (close) => {
          const t = ta.value.trim();
          if (!t && needText) { touched = true; sync(); ta.focus(); return false; }
          const patch = isVenue(r) ? { comment: t, rating, overallRating: rating } : { comment: t, rating };
          try { await updateMyReview(r._col, r.id, patch); }
          catch (_) { dkToast("Güncellenemedi", { type: "err", duration: 3600 }); return false; }
          Object.assign(r, patch);
          close("action");
          if (dead) return true;
          const old = cards.get(keyOf(r));
          if (old) {
            const lost = focusLost(old);   // kapanan modal odağı eski kartın Düzenle düğmesine verdi; kart değişince yenisine taşı
            const idx = [...listEl.children].indexOf(old); const nu = card(r, idx, false); old.replaceWith(nu); cards.set(keyOf(r), nu);
            if (lost) focusEl(nu.querySelector(".dk-yorumlarim-ib"));
          }
          syncKpis();
          dkToast("Yorum güncellendi", { duration: 3600 });   // spec: bu sayfanın toast'ları 3.6 sn
          return true;
        } },
      ],
      onClose: () => { if (modal === m) modal = null; },
    });
    modal = m;
  }

  // ── Sil (onay → çıkış animasyonu → GERİ AL toast'u → süre dolunca deleteMyReview) ──
  function delReview(r) {
    if (pendingDel.has(keyOf(r))) return;   // çıkış animasyonundaki kart (odaklı düğmesi hâlâ klavyeyle tetiklenebilir)
    const name = targetName(r);
    const icon = h("span", { class: "dk-yorumlarim-delic", "aria-hidden": "true" }, svgRaw(TRASH, { size: 20, sw: "1.9" }));
    const m = dkModal({
      title: "Yorumu Sil", size: 420, top: 220, role: "alertdialog", cls: "dk-yorumlarim-del",
      body: h("p", { class: "dk-yorumlarim-delp", id: "dk-yorum-delp" }, `${name} için yazdığın yorum kalıcı olarak silinecek. Emin misiniz?`),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Sil", variant: "danger", onClick: () => { pendingDel.set(keyOf(r), r); later(() => removeWithUndo(r), 0); } },
      ],
      initialFocus: ".dk-btn-outline",
      onClose: () => { if (modal === m) modal = null; },
    });
    m.dialog.prepend(icon);
    m.dialog.setAttribute("aria-describedby", "dk-yorum-delp");
    // Artboard: overlay padding-top 220. dkModal hesap varyantı üstü min(top, 20vh) ile sınırlıyor (900 px yükseklikte 180) →
    // bu onay kutusu (~240 px) sığdığı sürece 220'de kalsın. SHARED-CANDIDATE: dkModal clamp'i "sığıyorsa istenen top" olmalı.
    m.node.classList.add("dk-yorumlarim-delovl");
    modal = m;
  }
  function removeWithUndo(r) {
    const key = keyOf(r);
    pendingDel.set(key, r);
    const el = cards.get(key);
    const pos = list.indexOf(r);
    const idx = el ? [...listEl.children].indexOf(el) : 0;
    const finish = () => {
      if (!pendingDel.has(key)) return;   // bu arada destroy/pagehide işledi
      pendingDel.delete(key);
      const lost = focusLost(el);          // onay kapanınca odak silinen kartın düğmesine döndü → kart gidince kaybolur
      list = list.filter((x) => x !== r);
      drawList(false);
      let undone = false;
      const t = dkToast("Yorum silindi", {
        type: "neutral",
        action: { label: "GERİ AL", onClick: () => {
          undone = true;
          if (dead) return;
          list.splice(Math.min(pos, list.length), 0, r);
          drawList(false);
          const c = cards.get(key);
          if (c) { c.classList.add("dk-rise"); c.style.setProperty("--dk-delay", "0ms"); }
          // toast kapanınca odak geri gelen kartın Sil düğmesinde
          if (t.node.contains(document.activeElement) || focusLost()) focusEl(c?.querySelector(".dk-yorumlarim-ib.is-del") || null);
        } },
        onExpire: async () => {
          if (undone) return;
          // odak toast'taysa (GERİ AL) toast kalkmadan listeye dön: silinen kartın yerindeki kart
          if (!dead && t.node.contains(document.activeElement)) focusNear(idx);
          try {
            await deleteMyReview(r._col, r.id);
            if (uid) { invalidateAccountCounts(uid); if (!dead) shell.refreshCounts(true); }
          } catch (_) {
            dkToast("Silinemedi", { type: "err", duration: 3600 });
            if (dead) return;
            list.splice(Math.min(pos, list.length), 0, r);
            drawList(false);
          }
        },
      });
      // Klavye/ekran okuyucu: kart kaldırıldı → odak 3.6 sn'lik GERİ AL düğmesine (aksi hâlde portal toast'ına Tab ile ulaşılamıyor)
      if (lost) focusEl(t.node.querySelector(".dk-tst-act"));
      // Tasarım: geri al toast'unda da nötr 24px ikon dairesi var (dkToast hesap varyantı eylemli toast'ta ikonu çizmiyor).
      // SHARED-CANDIDATE: dkToast({ action }) hesap varyantına öncü ikon seçeneği.
      try {
        t.node.classList.add("dk-yorumlarim-tst");
        t.node.prepend(h("span", { class: "dk-tst-ic", "aria-hidden": "true" }, svgRaw('<path d="M5 12.5l4.5 4.5L19 7.5"></path>', { size: 13, sw: "3" })));
      } catch (_) {}
    };
    if (el && !reduced()) {
      el.classList.remove("dk-rise"); el.classList.add("dk-out");
      later(finish, OUT_MS);
    } else finish();
  }

  // ── veri ──
  async function loadPhotos() {
    const ids = [...new Set(list.map(targetId).filter((id) => id && !photos.has(id)))];
    if (!ids.length) return;
    const res = await Promise.all(ids.map((id) => getUser(id).then((u) => [id, u?.photoURL || null]).catch(() => [id, null])));
    if (dead) return;
    let changed = false;
    res.forEach(([id, p]) => { photos.set(id, p); if (p) changed = true; });
    if (!changed) return;
    // yalnız avatarları yerinde değiştir (kartları yeniden animasyonla kurma)
    cards.forEach((c, key) => {
      const r = list.find((x) => keyOf(x) === key);
      if (r && photos.get(targetId(r))) c.querySelector(".dk-yorumlarim-av")?.replaceWith(avatar(r));
    });
  }
  async function load() {
    if (!uid) {
      listEl.removeAttribute("aria-busy");
      listEl.replaceChildren(dkEmpty({ icon: "star", title: "Giriş gerekli", sub: "Yorumlarını görmek için giriş yap.", height: 320,
        action: dkButton("Giriş yap", { variant: "light", size: 42, href: "#/login" }) }));
      return;
    }
    try {
      const rv = await myReviews(uid);
      if (dead) return;
      list = Array.isArray(rv) ? rv : [];
      loaded = true;
      showControls(true);
      drawList(true);
      loadPhotos();
    } catch (err) {
      if (dead) return;
      console.warn("[dk]", err);
      showControls(false);   // "0 sanatçı 0 mekan" / "Tümü 0" gerçek veri gibi görünmesin
      listEl.removeAttribute("aria-busy");
      listEl.replaceChildren(dkEmpty({ icon: "alertCircle", title: "Yorumların yüklenemedi.", sub: "Bağlantını kontrol edip tekrar dene.", height: 320,
        action: dkButton("Tekrar dene", { variant: "light", size: 42, onClick: () => { listEl.replaceChildren(skeleton()); showControls(true); load(); } }) }));
    }
  }
  load();

  return {
    node: shell.node,
    update(query) {
      const t = tabOf(query);
      if (t !== tab) { tab = t; seg.dk.set(t); drawList(true); }
    },
    onSession() { return true; },
    destroy() {
      dead = true;
      timers.forEach(clearTimeout); timers.clear();
      commitPending();   // çıkış animasyonu sırasında ayrıldıysa onaylanmış silme işlenir
      window.removeEventListener("pagehide", commitPending);
      try { modal?.close("route"); } catch (_) {}
      shell.destroy();
    },
  };
}
