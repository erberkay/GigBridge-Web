// WebBildirimler — masaüstü görünümü (≥769 px). Registry anahtarı: bildirimler (#/bildirimler).
// Spec: specs/hesap.md WebBildirimler + sahibinin CLAUDE CODE notu (design/WebBildirimler.dc.html); ayar anahtarları app
// NotificationsScreen / design/BildirimAyarlari.dc.html ile birebir.
// CSS: css/dk-bildirimler.css — tüm seçiciler .dk-bildirimler kökü (ve portal içindeki .dk-bildirimler-* modal sınıfı) altında.
// ≤768: legacy customer.js notificationsView() aynen kalır (orada açılışta otomatik okundu davranışı sürer).
//
// Legacy özellikleri (korundu): canlı liste (listenNotifications — burada live.subscribeLive ile kabukla PAYLAŞILAN tek dinleyici;
//   destroy'da bırakılır → legacy'deki dinleyici sızıntısı yok), ikon eşlemesi notifIcon(type), başlık + okunmamış noktası, gövde,
//   göreli zaman, × = deleteNotif(id), review_prompt + eventId → etkinlik detayı, boş durum metni.
// Değişen (sahibi notu): açılışta otomatik okundu YOK — vurgu kalır; "Tümünü okundu işaretle" tek writeBatch ile hepsini okur
//   (≤500/parti); tıklanabilir karta tıklamak yalnız o bildirimi okur. artist_new_gig (favori sanatçı yeni etkinlik; sahibinin önerdiği
//   artist_new_event adı da kabul edilir) → etkinlik detayı. Başlıklar kayıttaki metinden (title) gelir.
// Ayarlar: users/{uid}.notificationSettings — app ile AYNI anahtarlar ve AYNI yazım biçimi
//   (setDoc(users/{uid}, { notificationSettings: { ...tüm anahtarlar, pushEnabled } }, { merge: true })). Kutudaki 5 anahtar:
//   pushEnabled (ana), artist_new_gig, event_reminders, event_changes, new_messages. "Tüm bildirim ayarları" → aynı anahtarların tam
//   listesi (app BildirimAyarlari grupları) bir modalda (?ayarlar=tum; artboard'u yok).
// Zili açık sanatçılar: users/{uid}/following (notifyEvents !== false) + users/{uid}/followingGroups (notifyEvents !== false).
import { h } from "../../ui.js";
import { session, refreshProfile } from "../../store.js";
import { markNotifRead, deleteNotif, followingList, getUser } from "../../data.js";
import { db, doc, getDoc, setDoc, collection, getDocs, writeBatch } from "../../firebase.js";
import { accountShell } from "../shared/account-shell.js";
import { svgIcon, svgRaw, svgPath } from "../shared/icons.js";
import { cx, dkPageHead, dkEmpty, dkModal, dkToast, dkSkeleton } from "../shared/ui.js";
import { subscribeLive } from "../shared/live.js";
import { toMs, startOfDay, isToday, isYesterday, timeAgo, trUpper, initials, MONTHS_TR, queryOf, writeQuery, rgba } from "../shared/helpers.js";
import { genreGrad } from "../shared/genres.js";

// ── Artboard SVG gövdeleri (birebir; DCLogic ICON) ──
const P = {
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};
const ARROW = '<path d="M5 12h14M13 6l6 6-6 6"></path>';
// Tür → görünüm. Müşteri hesabında görülen 3 tür tasarımda; diğerleri (savunma) nötr ton + legacy notifIcon eşlemesi, çip yok.
const TONES = { magenta: "#FF4FA3", warn: "#FF8A2A", red: "#FF5A6E", neutral: "#8A8E97" };
const KNOWN = {
  artist_new_gig: { tone: "magenta", path: P.bell, chip: "YENİ ETKİNLİK" },
  artist_new_event: { tone: "magenta", path: P.bell, chip: "YENİ ETKİNLİK" },
  review_prompt: { tone: "warn", path: P.star, chip: "DEĞERLENDİR" },
  event_deleted: { tone: "red", path: P.trash, chip: "İPTAL" },
};
// legacy notifIcon(t) (Ionicons) → masaüstü ikon kaydı karşılıkları
const LEGACY_ICON = {
  event_deleted: "trash", venue_request: "building", venue_request_update: "checkDouble", invitation: "mail", invitation_update: "checkDouble",
  event_invite: "mic", group_invite: "users", residency_offer: "repeat", residency_update: "repeat", edit_request: "key",
  edit_approved: "checkCircle", review_prompt: "star",
};
const typeView = (t) => KNOWN[t] || { tone: "neutral", icon: LEGACY_ICON[t] || "bell", chip: null };

// Bildirim ayarları — app NotificationsScreen (INITIAL_SETTINGS + gruplar) ile birebir anahtar/varsayılan.
const APP_GROUPS = [
  { title: "ETKİNLİKLER", items: [
    ["event_reminders", "Etkinlik Hatırlatıcıları", "Katıldığınız etkinliklerden önce bildirim alın", true],
    ["new_events", "Yeni Etkinlikler", "Beğendiğiniz türlerde yeni etkinlik eklenince bildirim", true],
    ["event_changes", "Etkinlik Değişiklikleri", "İptal veya saat değişikliği bildirimi", true]] },
  { title: "SANATÇILAR", items: [
    ["artist_new_gig", "Yeni Performans", "Takip ettiğiniz sanatçı sahne aldığında bildirim", true],
    ["artist_updates", "Profil Güncellemeleri", "Takip ettiğiniz sanatçıların paylaşımları", false]] },
  { title: "MESAJLAR", items: [
    ["new_messages", "Yeni Mesajlar", "Mesaj aldığınızda bildirim", true],
    ["message_requests", "Mesaj İstekleri", "Yeni mesaj isteği geldiğinde bildirim", true]] },
  { title: "SOSYAL", items: [
    ["timeline_likes", "Beğeniler", "Paylaşımlarınız beğenildiğinde bildirim", false],
    ["timeline_comments", "Yorumlar", "Paylaşımlarınıza yorum yapıldığında bildirim", true],
    ["new_followers", "Yeni Takipçi", "Birisi sizi takip ettiğinde bildirim", true]] },
  { title: "TEKLİFLER & İŞ", items: [
    ["new_offers", "Gelen Teklifler", "Yeni teklif veya davet aldığınızda bildirim", true],
    ["offer_updates", "Teklif Güncellemeleri", "Teklif kabul/red bildirimleri", true]] },
];
const DEFAULTS = {};
APP_GROUPS.forEach((g) => g.items.forEach(([k, , , d]) => { DEFAULTS[k] = d; }));
// Kutudaki hızlı ayarlar (artboard ITEMS sırası ve metinleri)
const QUICK = [
  ["pushEnabled", "Tüm bildirimler", "Ana anahtar; kapalıyken hiçbir bildirim gönderilmez"],
  ["artist_new_gig", "Favori sanatçı etkinlikleri", "Zili açık favori sanatçıların yeni etkinlik açınca"],
  ["event_reminders", "Etkinlik hatırlatıcıları", "Katıldığın etkinliklerden önce"],
  ["event_changes", "Etkinlik değişiklikleri", "İptal veya saat değişikliği"],
  ["new_messages", "Yeni mesajlar", "Mesaj aldığında"],
];

const OUT_MS = 320;       // .dk-out Bildirimler: 64px / 320ms
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
const pad2 = (n) => String(n).padStart(2, "0");
const DAY = 86400e3;

// Gün grupları: BUGÜN / DÜN / BU HAFTA (son 7 gün) / "EYLÜL 2026"
function groupOf(ms) {
  if (ms == null) return { key: "none", title: "DAHA ESKİ" };
  if (isToday(ms)) return { key: "today", title: "BUGÜN" };
  if (isYesterday(ms)) return { key: "yday", title: "DÜN" };
  if (ms >= startOfDay() - 6 * DAY) return { key: "week", title: "BU HAFTA" };
  const d = new Date(ms);
  return { key: `m${d.getFullYear()}-${d.getMonth()}`, title: trUpper(`${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`) };
}

// SHARED-CANDIDATE: satır-anahtar (tüm satır role=switch; görsel anahtar içeride) — dkSwitch ayrı bir <button> olduğu için satıra gömülemiyor.
function switchRow({ label, desc, on, disabled, strong, hl, onToggle }) {
  const knob = h("span", { class: "dk-bildirimler-knob" });
  const sw = h("span", { class: "dk-bildirimler-sw", "aria-hidden": "true" }, knob);
  const lbl = h("span", { class: cx("dk-bildirimler-rl", strong && "is-strong") }, label);
  const row = h("button", { type: "button", role: "switch", class: cx("dk-bildirimler-row", "dk-row", hl && "is-hl") },
    h("span", { class: "dk-bildirimler-rtext" }, lbl, h("span", { class: "dk-bildirimler-rd" }, desc)), sw);
  const set = (v, dis) => {
    row.setAttribute("aria-checked", v ? "true" : "false");
    row.classList.toggle("is-on", !!v);
    row.setAttribute("aria-disabled", dis ? "true" : "false");
    row.classList.toggle("is-disabled", !!dis);
  };
  set(on, disabled);
  row.addEventListener("click", () => { if (row.getAttribute("aria-disabled") === "true") return; onToggle?.(); });
  row.dk = { set };
  return row;
}

export function bildirimlerView(ctx) {
  const s = ctx.session || session;
  const uid = s.user && !s.guest ? s.user.uid : null;
  const shell = accountShell({ active: "bildirimler", contentGap: 28, ctx });
  const unsubs = [() => shell.destroy()];
  let dead = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); return t; };

  // ── durum ──
  let notifs = [];              // canlı liste (createdAt azalan)
  let ready = false;
  const leaving = new Set();    // silinirken çıkış animasyonundaki kimlikler
  const readLocal = new Set();  // iyimser "okundu" (yazım onaylanana dek)
  let sweeping = false;
  let settings = null;          // { ...DEFAULTS, ...kayıtlı, pushEnabled }
  let saving = Promise.resolve();
  let fullModal = null;
  // okunmamış = read alanı doğru değil (kabuk sayacı live.subscribeLive ile aynı tanım → "N OKUNMAMIŞ" = kenar menüsü hapı)
  const isUnread = (n) => !n.read && !readLocal.has(n.id);

  // ── üst satır: PageHead + durum + "Tümünü okundu işaretle" ──
  const pingWrap = h("span", { class: "dk-bildirimler-pingw", "aria-hidden": "true" }, h("span", { class: "dk-bildirimler-pingdot dk-ping" }), h("span", { class: "dk-bildirimler-pingdot" }));
  const statusTxt = h("span", {});
  const status = h("span", { class: "dk-bildirimler-status", role: "status" }, pingWrap, statusTxt);
  const markBtn = h("button", { type: "button", class: "dk-bildirimler-mark dk-press" },
    svgIcon("checkDouble", { size: 16, sw: "2" }), h("span", {}, "Tümünü okundu işaretle"));
  markBtn.addEventListener("click", () => markAll());
  const right = h("div", { class: "dk-bildirimler-hr" }, status, markBtn);
  const head = dkPageHead({ title: "Bildirim", em: "ler", lead: "Favori sanatçılarının yeni etkinlikleri, iptaller ve değerlendirme hatırlatmaları.", right });

  const listCol = h("div", { class: "dk-bildirimler-list", "aria-busy": "true" },
    ...[0, 1, 2].map(() => h("div", { class: "dk-bildirimler-skel", "aria-hidden": "true" }, dkSkeleton({ w: 44, h: 44, r: 8 }),
      h("span", { class: "dk-bildirimler-skelcol" }, dkSkeleton({ w: "52%", h: 16 }), dkSkeleton({ w: "78%", h: 13 }), dkSkeleton({ w: 72, h: 10 })))));

  // ── ayarlar kutusu ──
  const setCount = h("span", { class: "dk-bildirimler-scount" }, "—");
  const setFill = h("div", { class: "dk-bildirimler-sfill dk-prism" });
  const quickRows = {};
  const setBox = h("section", { class: "dk-bildirimler-set dk-rise", style: { "--dk-delay": "120ms" }, "aria-labelledby": "dk-bld-hns" },
    h("div", { class: "dk-bildirimler-shead" },
      h("div", { class: "dk-bildirimler-shrow" }, h("h2", { id: "dk-bld-hns", class: "dk-bildirimler-sh2" }, "Bildirim ayarları"), setCount),
      h("div", { class: "dk-bildirimler-strack", "aria-hidden": "true" }, setFill)));
  QUICK.forEach(([k, label, desc]) => {
    const r = switchRow({ label, desc, on: true, strong: k === "pushEnabled" || k === "artist_new_gig", onToggle: () => toggle(k) });
    quickRows[k] = r; setBox.append(r);
  });
  const allLink = h("a", { href: "#/bildirimler?ayarlar=tum", class: "dk-bildirimler-all dk-row" }, "Tüm bildirim ayarları", svgRaw(ARROW, { size: 14, sw: "2" }));
  allLink.addEventListener("click", (e) => { e.preventDefault(); writeQuery({ ayarlar: "tum" }); openFull(); });
  setBox.append(allLink);

  // ── zili açık sanatçılar ──
  const bellCount = h("span", { class: "dk-bildirimler-bcount" }, "");
  const chips = h("div", { class: "dk-bildirimler-chips" });
  const hint = h("span", { class: "dk-bildirimler-hint" });
  const bellBox = h("section", { class: "dk-bildirimler-bell dk-rise", style: { "--dk-delay": "180ms" }, "aria-labelledby": "dk-bld-hzil" },
    h("div", { class: "dk-bildirimler-shrow" }, h("h2", { id: "dk-bld-hzil", class: "dk-bildirimler-bh2" }, "ZİLİ AÇIK SANATÇILAR"), bellCount),
    chips, hint,
    h("a", { href: "#/favoriler", class: "dk-bildirimler-manage" }, "Favorilerde yönet", svgRaw(ARROW, { size: 14, sw: "2" })));
  let bellItems = null;   // null = yükleniyor

  const side = h("div", { class: "dk-bildirimler-side" }, setBox, bellBox);
  const grid = h("div", { class: "dk-bildirimler-grid" }, listCol, side);
  const root = h("div", { class: "dk-bildirimler" }, head, grid);
  shell.content.append(root);

  // ── başlık durumu ──
  function syncHead() {
    const n = notifs.filter((x) => isUnread(x) && !leaving.has(x.id)).length;
    statusTxt.textContent = n > 0 ? `${n} OKUNMAMIŞ` : "HEPSİ OKUNDU";
    status.classList.toggle("is-unread", n > 0);
    pingWrap.hidden = !(n > 0);
    markBtn.classList.toggle("is-on", n > 0);
    markBtn.setAttribute("aria-disabled", n > 0 ? "false" : "true");
  }

  // ── kart (anahtarlı; canlı güncellemede yeniden kurulmaz → okundu geçişi animasyonlu) ──
  const cards = new Map();   // id → { el, sig }
  function navOf(n) {
    const t = n.type;
    const ev = n.eventId ? encodeURIComponent(n.eventId) : null;
    if ((t === "artist_new_gig" || t === "artist_new_event") && ev) return { href: "#/etkinlik/" + ev };
    if (t === "review_prompt" && ev) return { href: "#/etkinlik/" + ev, cta: { href: "#/katildiklarim?puanla=" + ev, label: "Değerlendir" } };
    return null;
  }
  // Ekran okuyucu için ayırt edici ad: aynı başlıklı kartlar ("Etkinlik nasıldı?") etkinlik adıyla ayrışır (yoksa gövde).
  const labelOf = (n, title) => {
    const extra = String(n.eventTitle || n.body || "").trim();
    return extra && extra !== title ? `${title} (${extra.length > 80 ? extra.slice(0, 79) + "…" : extra})` : title;
  };
  function buildCard(n) {
    const tv = typeView(n.type);
    const c = TONES[tv.tone];
    const title = n.title || "Bildirim";
    const body = n.body || "";
    const nav = navOf(n);
    const name = labelOf(n, title);
    let el = null;
    // tıklamada GÜNCEL kaydı kullan (kart yalnız read değişince yeniden kurulmaz → kapanıştaki n eskir) → gereksiz markNotifRead yok
    const markIfUnread = () => { const cur = el?._n || n; if (isUnread(cur)) markNotifRead(cur.id); };
    const tile = h("span", { class: "dk-bildirimler-tile", style: { color: c, background: rgba(c, 0.10), borderColor: rgba(c, 0.35) } },
      tv.path ? svgPath(tv.path, { size: 20, sw: "1.8" }) : svgIcon(tv.icon, { size: 20, sw: "1.8" }));
    const titleEl = h("span", { class: "dk-bildirimler-ttl" }, h("span", { class: "dk-sr dk-bildirimler-srun" }, "Okunmamış: "), title);
    const text = h("span", { class: "dk-bildirimler-text" },
      h("span", { class: "dk-bildirimler-trow" }, h("span", { class: "dk-bildirimler-dot", "aria-hidden": "true" }), titleEl,
        tv.chip ? h("span", { class: "dk-bildirimler-chip" }, tv.chip) : null),
      body ? h("span", { class: "dk-bildirimler-bd" }, body) : null,
      h("span", { class: "dk-bildirimler-time" }, timeAgo(n.createdAt, { yesterday: "time", upper: true })));
    const main = nav
      ? h("a", { href: nav.href, class: "dk-bildirimler-main is-nav" }, tile, text)
      : h("div", { class: "dk-bildirimler-main" }, tile, text);
    if (nav) main.addEventListener("click", markIfUnread);
    const cta = nav?.cta ? h("a", { href: nav.cta.href, class: "dk-bildirimler-cta dk-press", "aria-label": `${nav.cta.label}: ${n.eventTitle || name}` }, nav.cta.label) : null;
    if (cta) { main.classList.add("has-cta"); cta.addEventListener("click", markIfUnread); }
    const x = h("button", { type: "button", class: "dk-bildirimler-x dk-press", "aria-label": `${name} bildirimini sil` }, svgIcon("x", { size: 15, sw: "2" }));
    x.addEventListener("click", () => remove(n.id));
    el = h("div", { class: "dk-bildirimler-nf", dataset: { id: n.id } }, h("span", { class: "dk-bildirimler-bar", "aria-hidden": "true" }), main, cta, x);
    el._main = main; el._title = title; el._body = body; el._time = text.querySelector(".dk-bildirimler-time"); el._n = n;
    el._srun = titleEl.querySelector(".dk-bildirimler-srun");
    return el;
  }
  function paintRead(el, n, delay) {
    const un = isUnread(n);
    if (un) el.style.setProperty("--nf-d", delay + "ms");
    el.classList.toggle("is-unread", un);
    // bağlantı: tasarımdaki aria-label ("Okunmamış: {başlık}. {gövde}"); tıklanamaz kart: görünmez "Okunmamış:" öneki
    if (el._main.tagName === "A") el._main.setAttribute("aria-label", (un ? "Okunmamış: " : "") + el._title + (el._body ? ". " + el._body : ""));
    el._srun.hidden = !un;
  }

  // Anahtarlı uzlaştırma: kartlar ve gün bölümleri yeniden KULLANILIR ve yalnız sıra değiştiğinde taşınır — DOM'dan çıkarılıp
  // yeniden eklenen öğe animasyonunu baştan oynatır ve CSS geçişi (okundu kademesi) çalışmaz.
  const sections = new Map();   // grup anahtarı → { el, count }
  let emptyEl = null;
  let firstDraw = true;
  const riseOnce = (el, delay) => {
    el.classList.add("dk-rise"); el.style.setProperty("--dk-delay", delay + "ms");
    el.addEventListener("animationend", (e) => { if (e.target === el) el.classList.remove("dk-rise"); }, { once: true });
  };
  // Önce artık listede olmayan çocuklar çıkarılır, SONRA sıra düzeltilir: kalan öğeler (odaklı × düğmesini taşıyan kart dahil)
  // gereksiz yere yeniden eklenmez — insertBefore ile taşınan öğe odağını kaybeder (odak <body>'ye düşerdi).
  function place(parent, kids, offset = 0) {
    const keep = new Set(kids);
    [...parent.children].slice(offset).forEach((c) => { if (!keep.has(c)) c.remove(); });
    kids.forEach((k, j) => { const at = parent.children[j + offset]; if (at !== k) parent.insertBefore(k, at || null); });
  }
  function draw() {
    if (!ready) return;
    listCol.removeAttribute("aria-busy");
    const shown = notifs.filter((n) => !leaving.has(n.id) || cards.has(n.id));
    syncHead();
    if (!shown.length) {
      cards.clear(); sections.clear();
      if (!emptyEl || !emptyEl.isConnected) {
        emptyEl = dkEmpty({ icon: "bellOff", ring: true, ringSize: 72, height: 320, cls: "dk-bildirimler-empty",
          title: "Henüz bildiriminiz yok", sub: "Yeni teklif, davet ve güncellemeler burada görünecek." });
        riseOnce(emptyEl, 0);
        listCol.replaceChildren(emptyEl);
      }
      firstDraw = false;
      return;
    }
    emptyEl = null;
    // gruplar (createdAt azalan sırada ardışık)
    const groups = [];
    let cur = null;
    shown.forEach((n) => {
      const g = groupOf(toMs(n.createdAt));
      if (!cur || cur.key !== g.key) { cur = { ...g, items: [] }; groups.push(cur); }
      cur.items.push(n);
    });
    const alive = new Set(shown.map((n) => n.id));
    [...cards.keys()].forEach((id) => { if (!alive.has(id)) cards.delete(id); });
    const keys = new Set(groups.map((g) => g.key));
    [...sections.keys()].forEach((k) => { if (!keys.has(k)) sections.delete(k); });
    let i = 0, u = 0;
    const secEls = groups.map((g) => {
      let sec = sections.get(g.key);
      if (!sec) {
        const hid = `dk-bld-g-${g.key}`;
        const count = h("span", { class: "dk-bildirimler-gcount" });
        const el = h("section", { class: "dk-bildirimler-grp", "aria-labelledby": hid },
          h("div", { class: "dk-bildirimler-ghead" },
            h("h2", { id: hid, class: "dk-bildirimler-gh2" }, g.title),
            h("span", { class: "dk-bildirimler-rule", "aria-hidden": "true" }), count));
        sec = { el, count }; sections.set(g.key, sec);
      }
      sec.count.textContent = pad2(g.items.length);
      const cardEls = g.items.map((n) => {
        i += 1;
        let rec = cards.get(n.id);
        const sig = [n.title, n.body, n.type, n.eventId].join("|");
        if (!rec || rec.sig !== sig) {
          const el = buildCard(n);
          riseOnce(el, firstDraw ? 100 + i * 55 : 0);
          if (rec?.el?.isConnected) rec.el.replaceWith(el);
          rec = { el, sig }; cards.set(n.id, rec);
        } else {
          rec.el._n = n;
          rec.el._time.textContent = timeAgo(n.createdAt, { yesterday: "time", upper: true });
        }
        paintRead(rec.el, n, isUnread(n) ? (u++) * 90 : 0);
        return rec.el;
      });
      place(sec.el, cardEls, 1);   // 0. çocuk = gün başlığı
      return sec.el;
    });
    place(listCol, secEls);
    firstDraw = false;
  }

  // ── eylemler ──
  async function markAll() {
    if (markBtn.getAttribute("aria-disabled") === "true") return;
    const ids = notifs.filter((n) => isUnread(n) && !leaving.has(n.id)).map((n) => n.id);
    if (!ids.length) return;
    ids.forEach((id) => readLocal.add(id));
    // tarama çubuğu (900ms; 950ms sonra kaldır)
    if (!sweeping) {
      sweeping = true;
      const bar = h("span", { class: "dk-bildirimler-sweep dk-sweep dk-prism", "aria-hidden": "true" });
      markBtn.append(bar);
      later(() => { bar.remove(); sweeping = false; }, 950);
    }
    draw();
    try {
      for (let k = 0; k < ids.length; k += 450) {
        const b = writeBatch(db);
        ids.slice(k, k + 450).forEach((id) => b.update(doc(db, "notifications", id), { read: true }));
        await b.commit();
      }
      dkToast("Tüm bildirimler okundu olarak işaretlendi");
    } catch (err) {
      console.warn("[dk]", err);
      ids.forEach((id) => readLocal.delete(id));
      if (!dead) draw();
      dkToast("Bildirimler işaretlenemedi", { type: "err" });
    }
  }
  // Odak silinen kartın içindeyse (×) sıradaki — yoksa önceki — kartın × düğmesine taşı; kart kalmadıysa içerik kolonuna (#dk-main).
  // Aksi hâlde kart kaldırılınca odak <body>'ye düşer.
  function moveFocusFrom(el) {
    const a = document.activeElement;
    if (!(a && el.contains(a))) return;
    const order = [...listCol.querySelectorAll(".dk-bildirimler-nf")];
    const at = order.indexOf(el);
    const ok = (x) => x !== el && !leaving.has(x.dataset.id);
    const next = order.slice(at + 1).find(ok) || order.slice(0, Math.max(0, at)).reverse().find(ok);
    try { (next ? next.querySelector(".dk-bildirimler-x") : shell.content)?.focus({ preventScroll: true }); } catch (_) {}
  }
  // Çıkış animasyonu sürerken (320 ms) görünüm yok edilir ya da sayfa kapanırsa onaylanmış silme kaybolmasın:
  // destroy()/pagehide bekleyenleri hemen deleteNotif ile işler (Yorumlarım commitPending ile aynı desen).
  const pendingDel = new Set();
  const flushPending = () => {
    if (!pendingDel.size) return;
    const ids = [...pendingDel];
    pendingDel.clear();
    ids.forEach((id) => { deleteNotif(id).catch(() => {}); });
  };
  window.addEventListener("pagehide", flushPending);
  unsubs.push(() => window.removeEventListener("pagehide", flushPending));
  function remove(id) {
    if (leaving.has(id)) return;
    const rec = cards.get(id);
    if (rec) moveFocusFrom(rec.el);
    leaving.add(id);
    syncHead();
    const go = async () => {
      if (!pendingDel.delete(id)) return;   // destroy/pagehide zaten işledi
      await deleteNotif(id);   // hata yutulur (data.js); başarısızsa canlı liste kartı geri getirir
      leaving.delete(id);
      if (!dead) { cards.delete(id); draw(); }
    };
    pendingDel.add(id);
    if (rec && !reduced()) {
      rec.el.classList.remove("dk-rise"); rec.el.classList.add("dk-out");
      later(() => { rec.el.style.visibility = "hidden"; go(); }, OUT_MS);
    } else go();
  }

  // ── ayarlar ──
  const push = () => settings?.pushEnabled !== false;
  function syncSettings() {
    if (!settings) return;
    const p = push();
    let on = 0;
    QUICK.forEach(([k]) => {
      const master = k === "pushEnabled";
      const v = master ? p : !!settings[k] && p;
      if (!master && v) on++;
      quickRows[k].dk.set(v, !master && !p);
      if (k === "artist_new_gig") quickRows[k].classList.toggle("is-hl", v);
    });
    setCount.textContent = `${on}/${QUICK.length - 1}`;
    setFill.style.width = Math.round((on / (QUICK.length - 1)) * 100) + "%";
    syncHint();
    fullModal?.sync();
  }
  // İyimser değiştir → sıralı yazım. Her yazım, çalıştığı andaki GÜNCEL ayarları yazar (app NotificationsScreen.handleSave ile aynı
  // biçim: setDoc(users/{uid}, { notificationSettings: { ...settings, pushEnabled } }, { merge: true })).
  function toggle(k) {
    if (!settings || !uid) return;
    if (k !== "pushEnabled" && !push()) return;
    const prevVal = k === "pushEnabled" ? push() : !!settings[k];
    settings = { ...settings, [k]: !prevVal };
    syncSettings();
    saving = saving.then(async () => {
      if (dead) return;
      try {
        const { pushEnabled, ...rest } = settings;
        await setDoc(doc(db, "users", uid), { notificationSettings: { ...rest, pushEnabled: pushEnabled !== false } }, { merge: true });
        dkToast("Bildirim ayarların kaydedildi");
        refreshProfile().catch(() => {});
      } catch (err) {
        console.warn("[dk]", err);
        if (dead) return;
        settings = { ...settings, [k]: prevVal };
        syncSettings();
        dkToast("Ayarlar kaydedilemedi", { type: "err" });
      }
    });
  }
  async function loadSettings() {
    let ns = s.profile?.notificationSettings || null;
    if (uid) { try { const snap = await getDoc(doc(db, "users", uid)); ns = snap.exists() ? snap.data()?.notificationSettings || null : ns; } catch (_) {} }
    if (dead) return;
    const { pushEnabled, ...rest } = ns || {};
    settings = { ...DEFAULTS, ...rest, pushEnabled: pushEnabled !== false };
    syncSettings();
    if (queryOf().get("ayarlar") === "tum") openFull();
  }

  // Tüm bildirim ayarları (artboard'u yok → hesap modalı; gruplar/metinler app BildirimAyarlari ile aynı, anında kaydeder)
  function openFull() {
    if (fullModal || !settings) return;
    const rows = {};
    const master = switchRow({ label: "Tüm bildirimler", desc: "Ana anahtar; kapalıyken hiçbir bildirim gönderilmez", on: push(), strong: true, onToggle: () => toggle("pushEnabled") });
    const body = [h("div", { class: "dk-bildirimler-fmaster" }, master)];
    APP_GROUPS.forEach((g) => {
      const box = h("div", { class: "dk-bildirimler-fbox" });
      g.items.forEach(([k, label, desc]) => {
        const r = switchRow({ label, desc, on: !!settings[k] && push(), disabled: !push(), onToggle: () => toggle(k) });
        rows[k] = r; box.append(r);
      });
      body.push(h("div", { class: "dk-bildirimler-fgroup" }, h("span", { class: "dk-bildirimler-fgt" }, g.title), box));
    });
    const m = dkModal({
      title: "Bildirim ayarları", sub: "Hangi bildirimleri almak istediğini seç. Değişiklikler anında kaydedilir.", size: 520, top: 120,
      cls: "dk-bildirimler-full", body,
      actions: [{ label: "Kapat", variant: "outline" }],
      onClose: () => { fullModal = null; if (!dead && queryOf().get("ayarlar")) writeQuery({ ayarlar: null }); },
    });
    fullModal = {
      m,
      sync() {
        const p = push();
        master.dk.set(p, false);
        Object.entries(rows).forEach(([k, r]) => r.dk.set(!!settings[k] && p, !p));
      },
      close() { m.close("route"); },
    };
  }

  // ── zili açık sanatçılar ──
  function syncHint() {
    const favOn = push() && settings?.artist_new_gig !== false;
    hint.classList.toggle("is-warn", !favOn);
    if (!favOn) hint.textContent = "Favori sanatçı etkinlikleri kapalı: zil açık olsa da bildirim gönderilmez.";
    else if (bellItems && !bellItems.length) hint.textContent = "Henüz zili açık sanatçın yok. Favorilerindeki sanatçıların zilini açınca yeni etkinliklerinden anında haber alırsın.";
    else hint.textContent = "Bu sanatçılar yeni etkinlik açtığında anında haber verilir.";
  }
  function drawBell() {
    chips.replaceChildren();
    if (!bellItems) { chips.append(dkSkeleton({ w: 120, h: 30, r: 15 }), dkSkeleton({ w: 96, h: 30, r: 15 })); bellCount.textContent = ""; return; }
    bellCount.textContent = String(bellItems.length);
    chips.hidden = !bellItems.length;
    bellItems.forEach((it) => {
      const av = it.photo
        ? h("img", { src: it.photo, alt: "", loading: "lazy", decoding: "async", class: "dk-bildirimler-cav" })
        : h("span", { class: "dk-bildirimler-cav is-ini", style: { background: genreGrad(it.genre, 135) } }, initials(it.name));
      if (it.photo) av.addEventListener("error", () => av.replaceWith(h("span", { class: "dk-bildirimler-cav is-ini", style: { background: genreGrad(it.genre, 135) } }, initials(it.name))), { once: true });
      chips.append(h(it.href ? "a" : "span", { href: it.href, class: "dk-bildirimler-bchip" }, av, h("span", { class: "dk-bildirimler-bname" }, it.name)));
    });
    syncHint();
  }
  async function loadBell() {
    drawBell();
    if (!uid) { bellItems = []; drawBell(); return; }
    try {
      const [fol, grp] = await Promise.all([
        followingList(uid).catch(() => []),
        getDocs(collection(db, "users", uid, "followingGroups")).then((q) => q.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
      ]);
      if (dead) return;
      const artists = fol.filter((f) => f.notifyEvents !== false && (f.targetType == null || f.targetType === "artist"));
      const items = artists.map((f) => ({ id: f.artistId || f.id, name: f.artistName || f.targetName || "Sanatçı", genre: f.genre || "", href: "#/sanatci/" + encodeURIComponent(f.artistId || f.id), photo: null }))
        .concat(grp.filter((g) => g.notifyEvents !== false).map((g) => ({ id: g.groupId || g.id, name: g.groupName || "Grup", genre: g.genre || "", href: null, photo: g.photoURL || null, group: true })));
      bellItems = items;
      drawBell();
      // sanatçı fotoğrafları (users/{id}.photoURL) — yerinde güncelle
      const res = await Promise.all(items.filter((x) => !x.group).map((x) => getUser(x.id).then((u) => [x, u?.photoURL || null]).catch(() => [x, null])));
      if (dead) return;
      let changed = false;
      res.forEach(([x, p]) => { if (p) { x.photo = p; changed = true; } });
      if (changed) drawBell();
    } catch (err) {
      console.warn("[dk]", err);
      if (dead) return;
      bellItems = []; drawBell();
    }
  }

  // ── canlı liste (kabukla paylaşılan tek dinleyici) ──
  if (uid) {
    unsubs.push(subscribeLive(uid, (st) => {
      if (dead) return;
      if (!st.ready?.n) return;
      notifs = Array.isArray(st.notifications) ? st.notifications : [];
      // onaylanan iyimser okundu kayıtlarını bırak
      notifs.forEach((n) => { if (n.read !== false) readLocal.delete(n.id); });
      ready = true;
      draw();
    }, { messages: false }));
  } else {
    ready = true;
    draw();
  }
  // göreli zamanları dakikada bir tazele ("12 DK ÖNCE")
  const tick = setInterval(() => { if (!dead && ready) cards.forEach((rec) => { rec.el._time.textContent = timeAgo(rec.el._n.createdAt, { yesterday: "time", upper: true }); }); }, 60000);
  unsubs.push(() => clearInterval(tick));

  loadSettings();
  loadBell();

  return {
    node: shell.node,
    update(query) {
      if (query?.get("ayarlar") === "tum") openFull();
      else if (fullModal) fullModal.close();
    },
    onSession() { return true; },   // refreshProfile sonrası kabuk/ayar durumu yerinde (iyimser) güncel
    destroy() {
      dead = true;
      timers.forEach(clearTimeout); timers.clear();
      flushPending();   // çıkış animasyonu sırasında ayrıldıysa onaylanmış silme işlenir
      try { fullModal?.close(); } catch (_) {}
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
    },
  };
}
