// WebSanatciMekanlar — masaüstü görünümü (≥769 px). Registry anahtarı: artistMekanlar (#/artist/mekanlar · "Mekan Değerlendir").
// Spec: specs/sanatci.md § WebSanatciMekanlar + sahibinin CLAUDE CODE notu (design/WebSanatciMekanlar.dc.html).
// CSS: css/dk-sanatci-mekanlar.css — tüm seçiciler .dk-sanatci-mekanlar kökü / .dk-sanatci-mekanlar-* sınıfları (portal modalı dahil) altında.
// ≤768: legacy artist.js renderVenueReview() (liste + sayfa içi form) aynen kalır.
//
// Legacy özellikleri (korundu): liste = artistAcceptedInvitations mekan bazında gruplanır (anahtar venueId ?? venueName ?? id; temsilci
//   = en güncel etkinlik; herhangi biri başlangıç+30 dk geçmişse puanlanabilir — legacy isRatable/ratableAtLabel birebir) · "Son
//   performans: {tarih}" · verilen puan (artistVenueReviewsGiven → overallRating) "{x} • Değerlendirdim" (satır tıklaması no-op) ·
//   kilitli satır tostu "Mekanı yalnızca etkinlik sonrasında değerlendirebilirsin. Açılış: …" · form: 4 kriter 1–5 yıldız, Genel Puan =
//   ortalama (1 ondalık), yorum (isteğe bağlı), görünürlük everyone/artists/anonymous (varsayılan everyone), eksik kriterde
//   ERR-VREVIEW-004, submitArtistVenueReview (venueReviews/{uid}_{venueId}) → "Teşekkürler! Mekan değerlendirmen gönderildi.",
//   hata ERR-VREVIEW-001 · boş durum "Henüz onaylanmış performansın yok" · yükleme hatası "Yüklenemedi" · Profil'deki "Mekan
//   Değerlendirmeleri" bilgi notu (ax-notice) → sağ kolon.
// Tasarım ekleri: sayaçlar = filtre sekmeleri (?durum=open|done|locked), ad filtresi (+ üst bar "Mekan ara" aynı sorguya bağlı, ?q=),
//   tablo, kriter açıklama kartı, form modal, satır içi doğrulama. Şehir: davette yoksa users/{venueId}.city (önbellekli, N okuma).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { artistAcceptedInvitations, artistVenueReviewsGiven, submitArtistVenueReview, userById } from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw, svgPath } from "../shared/icons.js";
import { cx, dkModal, dkToast, dkSkeleton } from "../shared/ui.js";
import { trUpper, trLower, writeQuery } from "../shared/helpers.js";
import { isoToTR } from "./panel.js";

// ══════════ legacy artist.js yardımcıları (birebir) ══════════
const RATABLE_AFTER_START_MS = 30 * 60 * 1000;
function evStartMs(eventDate, eventTime) {
  if (!eventDate) return null;
  let ms;
  if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const t = eventTime && /^\d{1,2}:\d{2}$/.test(eventTime) ? eventTime : "00:00";
    ms = new Date(`${eventDate}T${t}`).getTime();
  } else ms = new Date(eventDate).getTime();
  return isNaN(ms) ? null : ms;
}
function isRatable(eventDate, eventTime) {
  const start = evStartMs(eventDate, eventTime);
  if (start == null) return true;
  return Date.now() >= start + RATABLE_AFTER_START_MS;
}
function ratableAtLabel(eventDate, eventTime) {
  const start = evStartMs(eventDate, eventTime);
  if (start == null) return "";
  return new Date(start + RATABLE_AFTER_START_MS).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// ══════════ Artboard SVG gövdeleri / içerik (birebir) ══════════
const I = {
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  bldg: '<path d="M4 20V8l8-4 8 4v12"></path><path d="M9 20v-6h6v6M4 20h16"></path>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  alert: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5M12 16v.01"></path>',
};
const CRIT = [
  { key: "payment", label: "Ödeme Güvenilirliği", desc: "Ödeme zamanında yapıldı mı?", icon: "M3.5 7h17v10h-17zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { key: "equipment", label: "Ekipman Kalitesi", desc: "Ses sistemi ve ekipmanlar yeterliydi mi?", icon: "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" },
  { key: "treatment", label: "Sanatçıya Davranış", desc: "Personel saygılı ve yardımsever miydi?", icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6" },
  { key: "communication", label: "İletişim", desc: "Organizasyon süreci iletişimi nasıldı?", icon: "M20 14.5a2 2 0 0 1-2 2H9l-4 3.5V6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2z" },
];
const VIS = [
  { key: "everyone", label: "Herkes görsün", desc: "Müşteriler ve sanatçılar adınla görür", icon: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" },
  { key: "artists", label: "Sadece sanatçılar", desc: "Yalnız diğer sanatçılar adınla görür", icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6" },
  { key: "anonymous", label: "Anonim (isim gizli)", desc: "Herkes görür ama adın gizlenir", icon: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3.1 3.6M6.4 7.6C4.3 9.2 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 3.7-.8" },
];
const TABS = [
  ["all", "TÜM MEKANLAR", "#F2F1EE"],
  ["open", "DEĞERLENDİRİLEBİLİR", "#FF4FA3"],
  ["done", "DEĞERLENDİRDİM", "#7CE0B0"],
  ["locked", "ETKİNLİK SONRASI", "#A3A7AF"],
];
const TAB_KEYS = TABS.map((t) => t[0]);
const CITY_CACHE = new Map();   // venueId → şehir ("" = yok) — N okuma bir kez
const P = "dk-sanatci-mekanlar";
const cls = (s) => s.split(" ").filter(Boolean).map((x) => (x.startsWith("is-") ? x : `${P}-${x}`)).join(" ");
const put = (el, ...k) => el.replaceChildren(...k.filter((x) => x != null && x !== false));
const initialOf = (n) => trUpper(String(n || "M").trim().charAt(0) || "M");

export function artistMekanlarView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid;
  const profileKey = JSON.stringify(s.profile || {});
  const readQ = (q) => ({ tab: TAB_KEYS.includes(q?.get("durum")) ? q.get("durum") : "all", q: q?.get("q") || "" });
  const init = readQ(ctx.query);
  const st = { venues: null, error: false, tab: init.tab, q: init.q, anim: 0 };

  const shell = panelShell({
    role: "artist", active: ctx.route?.nav || "mekanlar", title: "Mekanlar", subtitle: "Sanatçı Paneli · Mekan Değerlendir", ctx,
    search: { placeholder: "Mekan ara", value: st.q, onInput: (v) => setQ(v, "top"), onSubmit: (v) => setQ(v, "top") },
  });
  const root = shell.content;
  root.classList.add(P);
  const unsubs = [];
  let alive = true;

  // ═════════ BAŞLIK ═════════
  const head = h("div", { class: cx(cls("head"), "dk-rise") },
    h("span", { class: cls("eb") }, "MEKAN DEĞERLENDİR"),
    h("h1", { class: cls("h1") }, "Çalıştığın ", h("em", {}, "mekanlar")),
    h("p", { class: cls("sub") }, "Çalıştığın mekanları değerlendir ve diğer sanatçılara yol göster"));

  // ═════════ SEKMELER ═════════
  const tabEls = new Map();
  const tablist = h("div", { role: "tablist", "aria-label": "Durum filtresi", class: cls("tabs") }, ...TABS.map(([k, label, c], i) => {
    const n = h("span", { class: cls("tn"), style: { color: c } }, "—");
    const l = h("span", { class: cls("tl") }, label);
    const b = h("button", { type: "button", role: "tab", id: `dk-sm-tab-${k}`, "aria-controls": "dk-sm-list", class: cx(cls("tab"), "dk-press") }, l, n);
    b.addEventListener("click", () => setTab(k));
    b.addEventListener("keydown", (e) => {
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % TABS.length;
      else if (e.key === "ArrowLeft") j = (i + TABS.length - 1) % TABS.length;
      else if (e.key === "Home") j = 0; else if (e.key === "End") j = TABS.length - 1;
      if (j == null) return;
      e.preventDefault(); setTab(TABS[j][0]); tabEls.get(TABS[j][0]).b.focus();
    });
    tabEls.set(k, { b, n, l, c });
    return b;
  }));

  // ═════════ FİLTRE ═════════
  const qInput = h("input", { type: "search", class: cls("qin"), placeholder: "Mekan adına göre filtrele", "aria-label": "Mekan adına göre filtrele", autocomplete: "off", spellcheck: "false" });
  qInput.value = st.q;
  qInput.addEventListener("input", () => setQ(qInput.value, "field"));
  const filter = h("label", { class: cx(cls("field"), "dk-field") }, svgRaw(I.search, { size: 16, sw: "2", color: "#8A8E97" }), qInput);

  // ═════════ TABLO ═════════
  const tBody = h("div", { class: cls("tbody") });
  const table = h("section", { id: "dk-sm-list", role: "tabpanel", class: cls("table"), "aria-label": "Mekan listesi" },
    h("div", { class: cls("tr th"), "aria-hidden": "true" }, h("span", {}, "MEKAN"), h("span", {}, "SON PERFORMANS"), h("span", { class: cls("thr") }, "DEĞERLENDİRMEN")),
    tBody);

  // ═════════ SAĞ KOLON ═════════
  const aside = h("aside", { class: cls("aside"), "aria-label": "Mekan değerlendirme bilgisi" },
    h("section", { class: cls("notice") },
      svgRaw(I.lock, { size: 24, sw: "1.8", color: "#FF4FA3" }),
      h("span", { class: cls("ncol") },
        h("span", { class: cls("nt") }, "Mekan Değerlendirmeleri"),
        h("span", { class: cls("nb") }, "Çalıştığın mekanları sadece sanatçılar görebilir. Mekanları gizlilik içinde puanlayabilirsin."))),
    h("section", { class: cls("crit") },
      h("span", { class: cls("cl") }, "4 KRİTER ÜZERİNDEN"),
      ...CRIT.map((c) => h("div", { class: cls("ci") },
        h("span", { class: cls("cic"), "aria-hidden": "true" }, svgPath(c.icon, { size: 16, sw: "1.9" })),
        h("span", { class: cls("ccol") }, h("span", { class: cls("ct") }, c.label), h("span", { class: cls("cd") }, c.desc)))),
      h("span", { class: cls("cfoot") }, "Değerlendirme, etkinlik başladıktan 30 dakika sonra açılır.")));

  root.append(head, h("div", { class: cls("grid") }, h("div", { class: cls("left") }, tablist, filter, table), aside));

  // iskelet
  put(tBody, ...Array.from({ length: 4 }, () => h("div", { class: cls("tr row is-skel") },
    h("span", { class: cls("id") }, dkSkeleton({ w: 42, h: 42, r: 10 }), h("span", { class: cls("idcol") }, dkSkeleton({ w: 140, h: 15 }), dkSkeleton({ w: 70, h: 12 }))),
    dkSkeleton({ w: 170, h: 14 }), h("span", { class: cls("act") }, dkSkeleton({ w: 120, h: 40, r: 6 })))));

  // ═════════ DURUM / ÇİZİM ═════════
  const stateOf = (v) => (v.myReview != null ? "done" : v.ratable ? "open" : "locked");
  function drawTabs() {
    const counts = { all: 0, open: 0, done: 0, locked: 0 };
    (st.venues || []).forEach((v) => { counts.all += 1; counts[stateOf(v)] += 1; });
    tabEls.forEach((t, k) => {
      const on = st.tab === k;
      t.b.setAttribute("aria-selected", on ? "true" : "false");
      t.b.tabIndex = on ? 0 : -1;
      t.b.classList.toggle("is-on", on);
      t.b.style.borderColor = on ? t.c : "";
      t.l.style.color = on ? t.c : "";
      t.n.textContent = st.venues ? String(counts[k]) : "—";
    });
    table.setAttribute("aria-labelledby", `dk-sm-tab-${st.tab}`);
    table.removeAttribute("aria-label");
  }
  function rowsFor() {
    const q = trLower(st.q.trim());
    return (st.venues || []).filter((v) => (st.tab === "all" || stateOf(v) === st.tab) && (!q || trLower(v.name).includes(q)));
  }
  // Giriş animasyonu yalnız st.anim değiştiğinde (sekme seçimi / gönderim — artboard `anim + 1`); ad filtresi yazarken satırlar
  // animasyonsuz yeniden çizilir (artboard onQ anim'i artırmaz → titreme yok)
  let lastAnim = -1;
  const rowEls = new Map();   // venue key → satır düğümü (şehir yerinde doldurma + odak)
  function drawRows() {
    drawTabs();
    rowEls.clear();
    tBody.removeAttribute("role");
    if (st.error) {
      put(tBody, h("div", { class: cls("empty") }, svgRaw(I.alert, { size: 30, sw: "1.6" }), h("span", { class: cls("et") }, "Yüklenemedi"), h("span", {}, "Bağlantıyı kontrol edip yenile.")));
      return;
    }
    if (!st.venues) return;
    if (!st.venues.length) {
      put(tBody, h("div", { class: cls("empty") }, svgRaw(I.bldg, { size: 30, sw: "1.6" }),
        h("span", { class: cls("et") }, "Henüz onaylanmış performansın yok"), h("span", {}, "Kabul ettiğin teklifler sonrası mekanlar burada listelenir.")));
      return;
    }
    const rows = rowsFor();
    if (!rows.length) { put(tBody, h("div", { class: cls("empty") }, svgRaw(I.bldg, { size: 30, sw: "1.6" }), "Bu filtrede mekan yok")); return; }
    const anim = st.anim === lastAnim ? null : st.anim % 2 ? "dk-fa" : "dk-fb";
    lastAnim = st.anim;
    tBody.setAttribute("role", "list");
    put(tBody, ...rows.map((v) => {
      const sv = stateOf(v);
      let act;
      if (sv === "done") {
        act = h("span", { class: cls("done") }, svgRaw(I.star, { size: 13, fill: true }), `${Number(v.myReview).toFixed(1)} • Değerlendirdim`);
      } else if (sv === "locked") {
        act = h("button", { type: "button", class: cx(cls("lockbtn"), "dk-press"), "aria-label": `${v.name} etkinlik sonrası açılır` }, svgRaw(I.lock, { size: 13, sw: "2" }), "Etkinlik sonrası");
        act.addEventListener("click", (e) => { e.stopPropagation(); lockedTap(v); });
      } else {
        act = h("button", { type: "button", class: cx(cls("ratebtn"), "dk-press"), "aria-label": `${v.name} mekanını değerlendir` }, "Değerlendir", svgRaw(I.arrow, { size: 13, sw: "2.4" }));
        act.addEventListener("click", (e) => { e.stopPropagation(); openForm(v, act); });
      }
      const row = h("div", { role: "listitem", tabindex: "-1", class: cx(cls("tr row"), "dk-row", anim, sv !== "done" && "is-click") },
        h("span", { class: cls("id") },
          h("span", { class: cls("tile"), "aria-hidden": "true" }, initialOf(v.name)),
          h("span", { class: cls("idcol") }, h("span", { class: cls("vn") }, v.name), v.city ? h("span", { class: cls("vc") }, v.city) : null)),
        h("span", { class: cls("last") }, "Son performans: " + v.lastPerformance),
        h("span", { class: cls("act") }, act));
      // legacy: satırın tamamı tıklanır (değerlendirilmiş satır no-op)
      if (sv !== "done") row.addEventListener("click", () => (sv === "locked" ? lockedTap(v) : openForm(v, act)));
      rowEls.set(v.id, row);
      return row;
    }));
  }
  // Şehir sonradan gelince: satırları yeniden kurmadan (animasyon/odak korunur) ilgili satıra şehir satırını ekle
  function fillCities() {
    (st.venues || []).forEach((v) => {
      const row = rowEls.get(v.id);
      if (!row || !v.city) return;
      const col = row.querySelector("." + P + "-idcol");
      if (!col) return;
      const cur = col.querySelector("." + P + "-vc");
      if (cur) cur.textContent = v.city; else col.append(h("span", { class: cls("vc") }, v.city));
    });
  }
  function lockedTap(v) {
    dkToast(`Mekanı yalnızca etkinlik sonrasında değerlendirebilirsin.${v.ratableLabel ? ` Açılış: ${v.ratableLabel}` : ""}`, { type: "err", duration: 3600 });
  }
  function setTab(k, { url = true } = {}) {
    if (!TAB_KEYS.includes(k)) k = "all";
    if (st.tab === k) return;
    st.tab = k; st.anim += 1;
    if (url) writeQuery({ durum: k === "all" ? null : k });
    drawRows();
  }
  function setQ(v, from, { url = true } = {}) {
    st.q = v || "";
    if (from !== "field" && qInput.value !== st.q) qInput.value = st.q;
    if (from !== "top" && shell.search?.input && shell.search.input.value !== st.q) shell.search.input.value = st.q;
    if (url) writeQuery({ q: st.q.trim() || null });
    drawRows();
  }

  // ═════════ DEĞERLENDİRME MODALI ═════════
  function openForm(v, trigger) {
    if (stateOf(v) !== "open") return;
    const ratings = {};
    let visibility = "everyone";
    let sending = false;
    const errEl = h("span", { class: cls("ferr"), role: "alert" });
    const showErr = (m) => { errEl.textContent = m || ""; };
    const pillVal = h("span", {}, "");
    const pill = h("span", { class: cls("fpill"), hidden: true }, h("span", { class: cls("fpl") }, "GENEL PUAN"), h("span", { class: cls("fpv") }, svgRaw(I.star, { size: 16, fill: true }), pillVal));
    let submitBtn = null;
    const overall = () => { const vals = Object.values(ratings); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; };
    const refresh = () => {
      const o = overall();
      pill.hidden = o == null;
      pillVal.textContent = o == null ? "" : o.toFixed(1);
      if (submitBtn) submitBtn.classList.toggle("is-dim", Object.keys(ratings).length < CRIT.length);
    };
    let firstStar = null;
    const fields = CRIT.map((c) => {
      const val = h("span", { class: cls("sv") });
      const stars = [1, 2, 3, 4, 5].map((n) => {
        const b = h("button", { type: "button", class: cx(cls("star"), "dk-press"), "aria-label": `${c.label}: ${n} yıldız`, "aria-pressed": "false" });
        b.addEventListener("click", () => { ratings[c.key] = n; showErr(""); drawStars(); refresh(); });
        if (!firstStar) firstStar = b;
        return b;
      });
      const fs = h("fieldset", { class: cls("fs") },
        h("legend", { class: cls("lg") }, svgPath(c.icon, { size: 16, sw: "1.9", color: "#FF4FA3" }), c.label),
        h("span", { class: cls("fd") }, c.desc),
        h("span", { class: cls("srow") }, ...stars, val));
      const drawStars = () => {
        const k = ratings[c.key] || 0;
        fs.classList.toggle("is-rated", k > 0);
        stars.forEach((b, i) => {
          const on = i < k;
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.style.color = on ? "#FFD700" : "#5E636D";
          b.replaceChildren(svgRaw(I.star, { size: 26, sw: "1.6", attrs: { fill: on ? "currentColor" : "none" } }));
        });
        val.textContent = k ? `${k}/5` : "";
      };
      drawStars();
      return fs;
    });
    const ta = h("textarea", { class: cls("ta"), rows: "3", placeholder: "Deneyimini paylaş..." });
    const visBtns = VIS.map((o, i) => {
      const ic = h("span", { class: cls("vic") });
      const b = h("button", { type: "button", role: "radio", class: cx(cls("vis"), "dk-press") },
        h("span", { class: cls("vhead") }, ic, h("span", { class: cls("vl") }, o.label), h("span", { class: cls("ring") }, h("span", { class: cls("rdot") }))),
        h("span", { class: cls("vd") }, o.desc));
      b.addEventListener("click", () => { visibility = o.key; drawVis(); });
      b.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % VIS.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i + VIS.length - 1) % VIS.length;
        if (j == null) return;
        e.preventDefault(); visibility = VIS[j].key; drawVis(); visBtns[j].b.focus();
      });
      return { b, ic, o };
    });
    const drawVis = () => visBtns.forEach(({ b, ic, o }) => {
      const on = visibility === o.key;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("is-on", on);
      ic.replaceChildren(svgPath(o.icon, { size: 16, sw: "1.9", color: on ? "#FF4FA3" : "#8A8E97" }));
    });
    drawVis();

    const body = h("div", { class: cls("fbody") },
      h("div", { class: cls("fgrid") }, ...fields),
      h("label", { class: cls("flabel") }, h("span", { class: cls("fl") }, "YORUM (İSTEĞE BAĞLI)"), ta),
      h("div", { role: "radiogroup", "aria-label": "Yorumu kim görsün?", class: cls("fvis") },
        h("span", { class: cls("fl"), "aria-hidden": "true" }, "YORUMU KİM GÖRSÜN?"),
        h("div", { class: cls("vgrid") }, ...visBtns.map((x) => x.b))),
      errEl);

    const m = dkModal({
      variant: "panel", size: 680, align: "top", top: 40, cls: cls("form"), title: v.name,
      sub: [v.city, v.lastPerformance].filter(Boolean).join(" • "),
      body, initialFocus: firstStar,
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Değerlendirmeyi Gönder", variant: "primary", keepOpen: true, onClick: async (close, btn) => {
          if (sending) return false;
          if (Object.keys(ratings).length < CRIT.length) { showErr("Lütfen tüm kriterleri puanla. (ERR-VREVIEW-004)"); return false; }
          const overallRating = parseFloat(overall().toFixed(1));
          sending = true; btn.disabled = true;
          try {
            await submitArtistVenueReview(uid, {
              venueId: v.id, venueName: v.name,
              artistName: s.profile?.displayName || "Sanatçı",
              visibility, ratings: { ...ratings }, overallRating, comment: ta.value,
            });
            v.myReview = overallRating;
            close();
            dkToast("Teşekkürler! Mekan değerlendirmen gönderildi.", { type: "ok", duration: 3600 });
            if (alive) {
              st.anim += 1; drawRows();
              // tetikleyici satır yeniden çizildi → odak aynı mekanın satırına (filtre dışında kaldıysa seçili sekmeye)
              const target = rowEls.get(v.id) || tabEls.get(st.tab)?.b;
              try { target?.focus({ preventScroll: true }); } catch (_) {}
            }
          } catch (_) {
            dkToast("Değerlendirme gönderilemedi. (ERR-VREVIEW-001)", { type: "err", duration: 3600 });
          } finally { sending = false; }
          return false;
        } },
      ],
    });
    // başlık şeridi: 44'lük baş harf karosu + ad/meta + GENEL PUAN hapı + kapat (artboard düzeni)
    const hr = m.dialog.querySelector(".dk-mdl-headrow");
    if (hr) {
      hr.prepend(h("span", { class: cls("ftile"), "aria-hidden": "true" }, initialOf(v.name)));
      const x = hr.querySelector(".dk-mdl-x");
      hr.insertBefore(pill, x);
    }
    submitBtn = m.buttons[1] || null;
    refresh();
  }

  // ═════════ VERİ ═════════
  async function load() {
    try {
      const [invs, given] = await Promise.all([artistAcceptedInvitations(uid), artistVenueReviewsGiven(uid).catch(() => [])]);
      if (!alive) return;
      const reviewed = new Map();
      given.forEach((r) => { if (r.venueId) reviewed.set(r.venueId, r.overallRating ?? 0); });
      const byVenue = new Map();
      invs.forEach((d) => {
        const key = d.venueId ?? d.venueName ?? d.id;
        const evDate = d.eventDate ?? d.date ?? null;
        const evTime = d.eventTime ?? d.startTime ?? null;
        const startMs = evStartMs(evDate, evTime) ?? 0;
        const ratable = isRatable(evDate, evTime);
        const prev = byVenue.get(key);
        if (!prev) byVenue.set(key, { name: d.venueName ?? "Mekan", city: d.city ?? d.venueCity ?? "", venueId: d.venueId ?? null, bestMs: startMs, bestDate: evDate ?? "", bestTime: evTime ?? "", ratable });
        else {
          prev.ratable = prev.ratable || ratable;
          if (startMs > prev.bestMs) { prev.bestMs = startMs; prev.bestDate = evDate ?? ""; prev.bestTime = evTime ?? ""; }
        }
      });
      const venues = [...byVenue.entries()].map(([key, x]) => ({
        id: key, venueId: x.venueId, name: x.name, city: x.city || (x.venueId ? CITY_CACHE.get(x.venueId) || "" : ""),
        lastPerformance: isoToTR(x.bestDate) || "—",
        myReview: reviewed.has(key) ? reviewed.get(key) : null,
        ratable: x.ratable,
        ratableLabel: x.ratable ? "" : ratableAtLabel(x.bestDate, x.bestTime),
        _ms: x.bestMs,
      }));
      // sıra: değerlendirilebilir/değerlendirilmiş (en yeni önce), ardından kilitliler (en yakın açılış önce)
      venues.sort((a, b) => (a.ratable === b.ratable ? (a.ratable ? b._ms - a._ms : a._ms - b._ms) : a.ratable ? -1 : 1));
      // şehir zenginleştirme (davette şehir yoksa users/{venueId}.city; önbellekli). İlk çizimden önce en fazla 700 ms beklenir
      // (satırlar şehir satırıyla birlikte tek seferde gelsin, ad satırı sonradan kaymasın); geç kalanlar yerinde doldurulur.
      const applyCities = () => venues.forEach((v) => { if (!v.city && v.venueId && CITY_CACHE.get(v.venueId)) v.city = CITY_CACHE.get(v.venueId); });
      const need = venues.filter((v) => !v.city && v.venueId && !CITY_CACHE.has(v.venueId));
      const cities = need.length
        ? Promise.all(need.map((v) => userById(v.venueId).then((u) => { CITY_CACHE.set(v.venueId, u?.city || u?.location?.city || ""); }).catch(() => { CITY_CACHE.set(v.venueId, ""); })))
        : null;
      if (cities) await Promise.race([cities, new Promise((r) => setTimeout(r, 700))]);
      if (!alive) return;
      applyCities();
      st.venues = venues;
      drawRows();
      if (cities) {
        await cities;
        if (!alive) return;
        applyCities();
        fillCities();
      }
    } catch (_) {
      if (!alive) return;
      st.error = true;
      drawRows();
    }
  }
  drawTabs();
  if (uid) load(); else { st.error = true; drawRows(); }

  return {
    node: shell.node,
    destroy() {
      alive = false;
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
    // ?durum / ?q değişti (geri/ileri, paylaşılan bağlantı) → yerinde filtrele
    update(query) {
      const n = readQ(query);
      if (n.tab !== st.tab) { st.tab = n.tab; st.anim += 1; }
      if (n.q !== st.q) setQ(n.q, null, { url: false });
      else drawRows();
    },
    // aynı kimlik + aynı profil → yerinde kal; profil değiştiyse (ad/foto) kabuk yeniden kurulsun
    onSession(ns) { return ns?.user?.uid === uid && JSON.stringify(ns.profile || {}) === profileKey; },
  };
}
