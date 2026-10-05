// WebAdmin — Yönetici Paneli (onay merkezi) masaüstü görünümü (≥769 px). Registry anahtarı: admin (#/admin, #/admin/vip|ad|sorun).
// Spec: specs/org-admin.md § WebAdmin (+ F3–F7). Artboard: design/WebAdmin.dc.html (sahibi notu yok; WebAdminGiris notu: rol rengi #A78BFA).
// CSS: css/dk-admin-panel.css — kök sınıf .dk-admin-panel (kabuğun <main id="dk-main">'ine eklenir); kabuk dışındaki parçalar
//   (üst bar "Keşfet önizleme" düğmesi, portal çekmecesi) .dk-admin-panel-* sınıflarıyla kapsanır.
// ≤768: legacy js/pages/admin.js adminPage() aynen kalır (router bu modülü mobilde yüklemez).
//
// Legacy özellikleri (hepsi korundu): mekan + organizatör onayı (approveUser / rejectUser) · VIP istekleri (approveVip / rejectVip) ·
//   mekan adı istekleri (approveNameChange / rejectNameChange) · sorun bildirimleri (resolveReport; mesaj metni artık detay panelinde) ·
//   Keşfet önizleme modalı (openKesfetPreview — küçült/büyüt, gezinme kilidi; üst bar düğmesi + kenar "Keşfet ekranı" + "Siteye dön") ·
//   çıkış (kabuk "Çıkış" → onay → #/yonetici) · yönetici e-postası (kabuk kullanıcı kartı) · işlem sırasında düğme kilidi, hata toast'ı
//   "İşlem başarısız" · "Yüklenemedi / Bağlantıyı kontrol edip sayfayı yenile." · grup başına boş metinler · "İsimsiz" / "İsimsiz Etkinlik" /
//   "Bildirim" / "Mekan" / "?" / "—" yedekleri.
// Tasarım ekleri: sekme alt rotaları (kenar menüsü + KPI kartları + sekme şeridi eşzamanlı), ?tur= (başvuru türü) + ?sec= (seçili satır),
//   satır seçimi + detay paneli (≥1180; daha darda sağ çekmece), karar verilen satırlar oturum boyunca rozetle YERİNDE kalır + "Geri al"
//   (telafi yazımı; ad değişikliğinde yok — spec §6), "Mesaj gönder" (mailto yedeği, spec §9), türetilmiş zil akışı (spec §9), panel araması
//   (geçerli sekmede istemci süzgeci).
// Sekme değişimi = rota değişimi → router görünümü yeniden kurar; veriler + kararlar modül önbelleğinde (_cache) tutulur, sekme
//   geçişinde yeniden sorgu/animasyon/kaydırma sıçraması olmaz.
import { h, clear, icon, spinner, empty } from "../../ui.js";
import { session } from "../../store.js";
import {
  listPendingByRole, approveUser, rejectUser,
  listPendingVip, approveVip, rejectVip,
  listReports, resolveReport, approveNameChange, rejectNameChange,
  userById,
} from "../../data.js";
import { db, doc, updateDoc } from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { cx, dkKpi, dkUnderlineTabs, dkChip, dkStatusBadge, dkPageHero, dkToast, dkDrawer, dkSkeleton, dkButton, portalRoot } from "../shared/ui.js";
import { rgba, trUpper, toMs, MONTHS_TR_SHORT, matchText, writeQuery, hashBase, fmtTime, eventGenres, ROLE_LABELS } from "../shared/helpers.js";

// ══════════ Sabitler (DCLogic ile birebir) ══════════
const VIOLET = "#A78BFA";
const V = "#FF8A2A", O = "#FF4FA3", C = "#4ED8FF";
// sekme: [anahtar (kabuk nav), rota, etiket, KPI etiketi, KPI alt metni, KPI rengi, ikon]
const TABS = [
  { key: "onaylar", route: "#/admin", label: "Onaylar", kLabel: "BEKLEYEN ONAY", kSub: "Mekan ve organizatör başvurusu", color: VIOLET, icon: "shieldCheck" },
  { key: "vip", route: "#/admin/vip", label: "VIP İstekleri", kLabel: "VIP İSTEĞİ", kSub: "Onay bekleyen etkinlik", color: "#FFD700", icon: "sparklesAdmin" },
  { key: "ad", route: "#/admin/ad", label: "Mekan Adı İstekleri", kLabel: "MEKAN ADI İSTEĞİ", kSub: "Ad değişikliği talebi", color: V, icon: "edit" },
  { key: "sorun", route: "#/admin/sorun", label: "Sorun Bildirimleri", kLabel: "SORUN BİLDİRİMİ", kSub: "Çözülmeyi bekliyor", color: "#FF5A6E", icon: "flag" },
];
const TAB = Object.fromEntries(TABS.map((t) => [t.key, t]));
const HEAD = { onaylar: ["BAŞVURAN", "TÜR · İLETİŞİM"], vip: ["ETKİNLİK", "MEKAN · TARİH"], ad: ["MEVCUT → İSTENEN", "NEDEN"], sorun: ["KONU", "BİLDİREN"] };
const EMPTY = { onaylar: "Bekleyen başvuru yok", vip: "Bekleyen VIP isteği yok", ad: "Bekleyen isim isteği yok", sorun: "Bekleyen bildirim yok" };
const FOOT = {
  onaylar: "Onaylanan mekan ve organizatörler panellerine erişir; reddedilenler giriş yaptığında bilgilendirilir.",
  vip: "VIP onaylanan etkinlik Keşfet’te öne çıkar.",
  ad: "Onaylanınca mekanın adı sitenin her yerinde güncellenir.",
  sorun: "Çözüldü olarak işaretlenen bildirimler listeden kalkar.",
};
const OKL = { venue: "Onayla", org: "Onayla", vip: "VIP Yap", name: "Onayla", report: "Çözüldü" };
const OKT = { venue: "Onaylandı", org: "Onaylandı", vip: "VIP onaylandı", name: "Ad değiştirildi", report: "Çözüldü olarak işaretlendi" };
const OKS = { venue: "approved", org: "approved", vip: "vip", name: "approved", report: "resolved" };
const EYE = { venue: "MEKAN BAŞVURUSU", org: "ORGANİZATÖR BAŞVURUSU", vip: "VIP İSTEĞİ", name: "MEKAN ADI İSTEĞİ", report: "SORUN BİLDİRİMİ" };
const KIND_TAG = { venue: ["MEKAN", V], org: ["ORGANİZATÖR", O] };
const SUBS = [["all", "Tümü", "#A3A7AF", null], ["venue", "Mekan", V, "mekan"], ["org", "Organizatör", O, "organizator"]];
const REPORT_COLOR = { customer: C, artist: O, venue: V, organizer: O };
const SEEN_KEY = "gb.admin.seen";
// yeniden çizimde odak yedeği: data-f son eki → yerine geçen denetimler (satır: ok/no/undo/pick · detay/çekmece: dok/dno/dundo)
const FOCUS_NEXT = { ok: ["undo", "pick"], no: ["undo", "pick"], undo: ["ok", "pick"], dok: ["dundo", "pick"], dno: ["dundo", "pick"], dundo: ["dok", "pick"] };
// ikon gövdeleri (artboard'dan birebir; kayıt defterindeki "info" r8.5/1.8 farklı)
const INFO_SVG = '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>';
const CHECK_SVG = '<path d="m5 12.5 4.5 4.5L19 7.5"></path>';
const X_SVG = '<path d="M6 6l12 12M18 6 6 18"></path>';

// ══════════ Modül önbelleği (sekme = rota; görünüm her sekmede yeniden kurulur) ══════════
const _cache = { uid: null, at: 0, ready: false, loading: null, items: new Map(), order: [], src: {}, emails: new Map() };
let _q = "";                                         // panel araması (sekmeler arası korunur)
let _last = { at: -1e9, scrollY: 0 };                // son yıkım (sekme geçişinde "sıcak" yeniden kurulum)
let _pendingFocus = null;                            // { src: "tab"|"kpi"|"nav", key } → yeni görünümde aynı denetime odak
const CACHE_TTL = 60e3;
const _subs = new Set();                             // mount'lu görünüm(ler): önbellek değişince yeniden çiz
const notify = () => _subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

const fmtDateNum = (v) => {                          // "27 Eyl 2026" (spec I11: sayısal gün)
  const t = toMs(v); if (t == null) return typeof v === "string" && v ? v : "—";
  const d = new Date(t); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};
// boşluksuz uzun değerler (e-posta) dar panelde "@" / "." sonrasında satır kırsın
const wbr = (v) => (typeof v !== "string" || /\s/.test(v) || !/[@.]/.test(v) ? [v] : v.split(/(?<=[@.])/).flatMap((p, i) => (i ? [h("wbr"), p] : [p])));
const ini = (s) => { const c = String(s || "").replace(/^[\s[“"'(]+/, "").charAt(0); return c ? trUpper(c) : "?"; };
const statusLabel = (it) => (it.status === "pending" ? (it.kind === "report" ? "Açık" : "Bekliyor") : ({ approved: "Onaylandı", rejected: "Reddedildi", vip: "VIP onaylandı", resolved: "Çözüldü" })[it.status] || "—");
const statusColor = (it) => (it.status === "pending" ? "#FFD700" : it.status === "rejected" ? "#FF5A6E" : it.status === "vip" ? "#FFD700" : "#7CE0B0");
const tabOfKind = (k) => (k === "venue" || k === "org" ? "onaylar" : k === "vip" ? "vip" : k === "name" ? "ad" : "sorun");
// öğe türü → Firestore kaynağı (loadAll'daki 4 sorgu) · sekme / başvuru türü süzgeci → beslendiği kaynaklar
const SRC_OF = { venue: "venue", org: "org", vip: "vip", name: "rep", report: "rep" };
const TAB_SRCS = { onaylar: ["venue", "org"], vip: ["vip"], ad: ["rep"], sorun: ["rep"] };
const SUB_SRCS = { all: ["venue", "org"], venue: ["venue"], org: ["org"] };
// "Mesaj gönder" adresi: yalnız düz e-posta (?, &, #, boşluk vb. yok → mailto'ya cc/bcc/body eklenemez); href'te ayrıca kodlanır
const EMAIL_RE = /^[^\s@?&#%/\\:;,<>"'()[\]]+@[^\s@?&#%/\\:;,<>"'()[\]]+\.[^\s@?&#%/\\:;,<>"'()[\]]+$/;
const safeEmail = (v) => { const e = typeof v === "string" ? v.trim() : ""; return e.length <= 254 && EMAIL_RE.test(e) ? e : null; };
const mailtoHref = (email, subject) => `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}`;

// ── Firestore kaydı → görünüm öğesi ──
function toItem(kind, r) {
  const createdMs = toMs(r.createdAt) || 0;
  if (kind === "venue" || kind === "org") {
    const title = (kind === "org" ? r.orgName || r.displayName : r.displayName) || "İsimsiz";
    const fields = kind === "venue"
      ? [["ROL", "Mekan"], ["ŞEHİR", r.city || "—"], ["KAPASİTE", Number(r.capacity) > 0 ? `${r.capacity} kişi` : "—"], ["E-POSTA", r.email || "—"], ["BAŞVURU", fmtDateNum(r.createdAt)]]
      : [["ROL", "Organizatör"], ["E-POSTA", r.email || "—"], ["ŞEHİR", r.city || "—"], ["BAŞVURU", fmtDateNum(r.createdAt)]];
    return { kind, id: r.id, title, sub: kind === "venue" ? r.city || "—" : r.email || "—", col2: r.email || "—", color: kind === "venue" ? V : O,
      ini: ini(title), fields, email: r.email || null, emailUid: null, createdMs, raw: r };
  }
  if (kind === "vip") {
    const title = r.title || "İsimsiz Etkinlik";
    const when = r.eventAt ? fmtDateNum(r.eventAt) : r.date || "—";
    const genres = eventGenres(r);
    return { kind, id: r.id, title, sub: r.artistName || genres.join(", ") || "—", col2: [r.venueName, when !== "—" ? when : null].filter(Boolean).join(" · ") || "—",
      color: V, ini: ini(title),
      fields: [["MEKAN", r.venueName || "—"], ["TARİH", when], ["SAAT", r.startTime || (r.eventAt ? fmtTime(r.eventAt) : "") || "—"], ["SANATÇI", r.artistName || "—"], ["TÜR", genres.join(", ") || "—"]],
      email: null, emailUid: null, createdMs, raw: r };
  }
  if (kind === "name") {
    const cur = r.currentName || "Mekan";
    const reason = r.reason || r.message || "—";
    return { kind, id: r.id, title: `${cur}  →  ${r.requestedName || "?"}`, sub: "Mekan adı değişikliği talebi", col2: "Neden: " + reason, color: V,
      ini: ini(r.currentName || r.reporterName || "?"),
      fields: [["MEVCUT AD", cur], ["İSTENEN AD", r.requestedName || "?"], ["BİLDİREN", `${r.reporterName || cur} · Mekan`], ["TARİH", fmtDateNum(r.createdAt)]],
      msgLabel: "NEDEN", msg: reason, email: null, emailAlt: r.reporterEmail || null, emailUid: r.targetUserId || r.reporterId || null, createdMs, raw: r };
  }
  // sorun bildirimi (type: report | content | …)
  const typeLabel = ROLE_LABELS[r.reporterType] || r.reporterType || "";
  const who = [r.reporterName, typeLabel].filter(Boolean).join(" · ") || "—";
  return { kind: "report", id: r.id, title: r.subject || "Bildirim", sub: who, col2: who, color: REPORT_COLOR[r.reporterType] || C,
    ini: ini(r.reporterName || r.subject || "?"),
    fields: [["BİLDİREN", r.reporterName || "—"], ["HESAP TÜRÜ", typeLabel || "—"], ["TARİH", fmtDateNum(r.createdAt)]],
    msgLabel: "MESAJ", msg: r.message || "", email: null, emailAlt: r.reporterEmail || null, emailUid: r.reporterId || null, createdMs, raw: r };
}
const keyOf = (it) => `${it.kind}:${it.id}`;
const KIND_ORDER = { venue: 0, org: 1, vip: 2, name: 3, report: 4 };

// Tüm listeleri yükle (kaynak başına hata: allSettled → _cache.src). Bu oturumda karar verilen öğeler (Firestore'da artık bekleyen değil)
// listede yerinde kalır; yeni bekleyenler eklenir.
function loadAll(uid) {
  if (_cache.loading) return _cache.loading;
  const startedAt = Date.now();
  _cache.loading = Promise.allSettled([listPendingByRole("venue"), listPendingByRole("organizer"), listPendingVip(), listReports()]).then((res) => {
    if (_cache.uid !== uid) return;
    const [ven, org, vip, rep] = res;
    const fresh = [];
    // kaynak başına hata (kısmi hata görünür kalsın: ör. yalnız organizatör sorgusu düşerse "Organizatör · —" + satır üstü uyarı)
    const src = { venue: ven.status === "rejected", org: org.status === "rejected", vip: vip.status === "rejected", rep: rep.status === "rejected" };
    if (ven.status === "fulfilled") ven.value.forEach((r) => fresh.push(toItem("venue", r)));
    if (org.status === "fulfilled") org.value.forEach((r) => fresh.push(toItem("org", r)));
    if (vip.status === "fulfilled") vip.value.forEach((r) => fresh.push(toItem("vip", r)));
    if (rep.status === "fulfilled") rep.value.forEach((r) => fresh.push(toItem(r.type === "name_change" ? "name" : "report", r)));
    [ven, org, vip, rep].forEach((x) => { if (x.status === "rejected") console.error(x.reason); });
    const next = new Map();
    // Yarış koruması: yazımı süren (busy) ya da yenileme başladıktan SONRA karar verilen / geri alınan öğe AYNI nesneyle kalır —
    // decide()/undo() yakaladıkları nesnede biter; yeni nesne konsaydı satır "Bekliyor" + kilitli düğmelerle takılı kalıyordu.
    const keep = (old) => !!old && (!!old.busy || old.decidedAt >= startedAt);
    fresh.forEach((it) => {
      const k = keyOf(it);
      const old = _cache.items.get(k);
      if (keep(old)) { next.set(k, old); return; }
      it.status = "pending"; it.busy = null; it.decidedAt = 0;
      next.set(k, it);
    });
    // Firestore'da artık bekleyen olmayan eski öğeler: bu oturumda karar verilenler yerinde kalır (rozet + "Geri al");
    // kaynağı bu turda yüklenemeyen öğeler (önbellek) kalır; diğer bekleyenler (başka yerde karar verilmiş) düşer.
    _cache.items.forEach((old, k) => {
      if (next.has(k)) return;
      if (keep(old) || old.status !== "pending" || src[SRC_OF[old.kind]]) next.set(k, old);
    });
    _cache.items = next;
    _cache.src = src;
    _cache.order = [...next.keys()].sort((a, b) => {
      const x = next.get(a), y = next.get(b);
      return (KIND_ORDER[x.kind] - KIND_ORDER[y.kind]) || (y.createdMs - x.createdMs) || String(x.id).localeCompare(String(y.id));
    });
    _cache.ready = true;
    _cache.at = Date.now();
  }).finally(() => { _cache.loading = null; });
  return _cache.loading;
}

// ── Yazımlar (legacy data.js fonksiyonları birebir) + "Geri al" telafi yazımları ──
// Geri al (spec §6): kurallar admin'e users {approved, approvedAt, rejected} · events {vipStatus, vipApprovedAt} · reports (tümü) izni veriyor.
// Ad değişikliğinde geri al YOK (displayName'i geri yazmak 90 günlük bekleme damgasını sıfırlar).
// Yeni data.js yardımcıları önerildi (unapproveUser/unrejectUser/resetVip/reopenReport); data.js'e dokunulmadığı için burada yerel.
const undoWrite = {
  // DATA-LOCAL (SHARED-CANDIDATE: spec §7 önerisi data.js'te unapproveUser / unrejectUser / resetVip / reopenReport)
  user: (it) => updateDoc(doc(db, "users", it.id), it.status === "approved" ? { approved: false } : { rejected: false }),
  vip: (it) => updateDoc(doc(db, "events", it.id), { vipStatus: "pending" }),
  report: (it) => updateDoc(doc(db, "reports", it.id), { status: it.raw?.status && it.raw.status !== "resolved" ? it.raw.status : "pending" }),
};
function writeDecision(it, ok) {
  if (it.kind === "venue" || it.kind === "org") return ok ? approveUser(it.id) : rejectUser(it.id);
  if (it.kind === "vip") return ok ? approveVip(it.id) : rejectVip(it.id);
  if (it.kind === "name") return ok ? approveNameChange(it.raw) : rejectNameChange(it.raw);
  return resolveReport(it.id);
}
function writeUndo(it) {
  if (it.kind === "venue" || it.kind === "org") return undoWrite.user(it);
  if (it.kind === "vip") return undoWrite.vip(it);
  if (it.kind === "report") return undoWrite.report(it);
  return Promise.reject(new Error("no-undo"));
}
const canUndo = (it) => it.status !== "pending" && it.kind !== "name";

// ══════════ Keşfet önizleme — legacy js/pages/admin.js openKesfetPreview (26–84) BİREBİR ══════════
// Legacy fonksiyon dışa aktarılmıyor ve legacy dosya bu grubun değil → aynen kopyalandı (spec: "Keep openKesfetPreview() as-is").
// SHARED-CANDIDATE: legacy admin.js'ten `export` edilip buradan içe aktarılabilir (tek kaynak).
// Ek (masaüstü): oturum kimliği / görünüm modu değişince (dk:teardown identity|mode) önizleme kapanır · mobilde açılıp masaüstüne
//   taşınan legacy önizleme varken ikincisi açılmaz (DOM koruması; legacy'nin kendi kmOpen bayrağı ayrı modülde) · diyalog anlamı
//   (role=dialog, büyükken aria-modal) · açılınca odak "Kapat"ta, büyükken Tab çerçevede döner, Esc kapatır, kapanınca odak tetikleyiciye.
let kmOpen = false;
const KM_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
async function openKesfetPreview() {
  if (kmOpen) return;               // zaten açık
  const stray = document.querySelector("#modal-root .km-overlay");
  if (stray) {                      // legacy (mobil) önizleme açık kalmış → yenisini açma; küçültülmüşse büyüt
    if (stray.classList.contains("min")) stray.querySelector(".km-actions .icon-btn")?.click();
    return;
  }
  kmOpen = true;
  const root = document.getElementById("modal-root");
  const trigger = document.activeElement;

  const minBtn = iconBtn("contract-outline", null);
  minBtn.title = "Küçült";
  const closeBtn = iconBtn("close", () => close());
  closeBtn.title = "Kapat";

  const kmBody = h("div", { class: "km-body" }, h("div", { class: "loading" }, spinner()));
  const frame = h("div", { class: "km-frame", role: "dialog", "aria-modal": "true", "aria-label": "Keşfet — Önizleme" },
    h("div", { class: "km-bar" },
      h("div", { class: "km-title" }, icon("compass", { size: 15, color: "var(--primary)" }), h("span", {}, "Keşfet — Önizleme")),
      h("div", { class: "km-actions" }, minBtn, closeBtn)),
    kmBody);
  const overlay = h("div", { class: "km-overlay" }, frame);

  // Modal içindeki navigasyonları etkisizleştir (kartlar/zil/"TÜMÜ"/alt sekmeler): filtre + arama + kaydırma çalışır.
  frame.addEventListener("click", (e) => {
    const nav = e.target.closest('a[href^="#/"], .hs-bell, .hs-seeall, .login-chip, .ecard, .ecard2, .t10, .hero-slide, .vcard, .hs-artist');
    if (nav) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // Emniyet: yine de bir tık kaçarsa hash'i admin'de tut.
  const onHash = () => { if (kmOpen && !location.hash.startsWith("#/admin")) history.replaceState(null, "", "#/admin"); };
  window.addEventListener("hashchange", onHash);
  const onTeardown = (e) => { const r = e.detail?.reason; if (r === "identity" || r === "mode") close(); };
  window.addEventListener("dk:teardown", onTeardown);
  // klavye (yalnız büyükken ve üstünde başka legacy katman yokken): Esc → kapat · Tab → çerçeve içinde döner
  const onKey = (e) => {
    if (mini || !kmOpen || e.defaultPrevented || overlay.nextElementSibling) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...frame.querySelectorAll(KM_FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], ae = document.activeElement, inside = frame.contains(ae);
    if (e.shiftKey && (ae === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (ae === last || !inside)) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey);

  // Küçült ↔ büyüt (aynı buton toggle)
  let mini = false;
  minBtn.onclick = () => {
    mini = !mini;
    overlay.classList.toggle("min", mini);
    frame.setAttribute("aria-modal", mini ? "false" : "true");
    clear(minBtn); minBtn.append(icon(mini ? "expand-outline" : "contract-outline", { size: 20 }));
    minBtn.title = mini ? "Büyüt" : "Küçült";
  };

  function close() {
    if (!kmOpen) return;
    kmOpen = false;
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("dk:teardown", onTeardown);
    document.removeEventListener("keydown", onKey);
    // odak önizlemedeyse (ya da düştüyse) tetikleyiciye dön; sekme geçişinde tetikleyici yenilendiyse güncel "Keşfet önizleme" düğmesine
    const ae = document.activeElement;
    if (!ae || ae === document.body || overlay.contains(ae)) {
      const t = trigger?.isConnected && trigger !== document.body ? trigger : document.querySelector(".dk-admin-panel-kbtn") || document.getElementById("dk-main");
      try { t?.focus({ preventScroll: true }); } catch (_) {}
    }
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  }
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !mini) close(); }); // backdrop → kapat (yalnız büyükken)

  root.append(overlay);
  requestAnimationFrame(() => { overlay.classList.add("show"); if (kmOpen) try { closeBtn.focus({ preventScroll: true }); } catch (_) {} });

  // Keşfet ekranını tembel yükle — admin paneli customer.js export'una STATİK bağlı değil,
  // önbellek uyumsuzluğu olsa bile panel açılır; Keşfet gelmezse zarifçe hata gösterir.
  try {
    const { kesfetPage } = await import("../../pages/customer.js");
    if (kmOpen) { clear(kmBody); kmBody.append(kesfetPage()); }
  } catch (_) {
    clear(kmBody); kmBody.append(empty("cloud-offline-outline", "Keşfet yüklenemedi", "Sayfayı yenileyip tekrar dene."));
  }
}
function iconBtn(ic, onClick) { return h("button", { class: "icon-btn", onclick: onClick }, icon(ic, { size: 20 })); }

// ══════════ GÖRÜNÜM ══════════
export function adminView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || "";
  const unsubs = [];
  let alive = true;
  const warm = performance.now() - _last.at < 2500;  // aynı paneldeki sekme geçişi → giriş animasyonu/kaydırma sıfırlaması yok
  if (_cache.uid !== uid) {                            // kimlik değişti → önbelleği sıfırla
    _cache.uid = uid; _cache.at = 0; _cache.ready = false; _cache.items = new Map(); _cache.order = []; _cache.src = {}; _cache.emails = new Map();
    _q = "";
  }

  const segTab = ctx.seg?.[2] || "";
  const tab = TAB[segTab] ? segTab : "onaylar";
  // bilinmeyen alt rota (#/admin/xyz) → #/admin'e yönlendir (mount SONRASI; kurulum sırasında adres değişirse router görünümü
  // "bayat" sayıp atar). location.replace → geçmişe kayıt bırakmaz; router yeniden kurar (sıcak geçiş).
  if (segTab && !TAB[segTab]) {
    const qs = ctx.query?.toString?.() || "";
    setTimeout(() => { if (alive) location.replace(location.pathname + location.search + "#/admin" + (qs ? "?" + qs : "")); }, 0);
  }
  const T = TAB[tab];
  let sub = "all";
  let selKey = null;          // açık seçim (?sec) — yoksa ilk satır
  let urlSec = null;          // adresteki ?sec (çözülemezse adresten silinir)
  let drawer = null;          // dar ekranda detay çekmecesi
  let lastToast = null;
  const wideMq = window.matchMedia("(min-width: 1180px)");
  const readQ = (q) => {
    const tur = q?.get?.("tur");
    sub = tab === "onaylar" ? (SUBS.find((x) => x[3] && x[3] === tur)?.[0] || "all") : "all";
    const sec = q?.get?.("sec");
    urlSec = sec || null;
    selKey = sec ? findKeyById(sec) : null;
  };
  const findKeyById = (id) => {
    for (const k of _cache.order) { const it = _cache.items.get(k); if (it && it.id === id && tabOfKind(it.kind) === tab) return k; }
    return `?:${id}`;         // veri henüz yok → yüklenince çözülür
  };

  // ── kabuk ──
  const kbtn = h("button", { type: "button", class: "dk-admin-panel-kbtn dk-press", "aria-label": "Keşfet önizleme", title: "Keşfet ekranını önizle" },
    svgIcon("compassAdmin", { size: 16, color: VIOLET }), h("span", { class: "dk-admin-panel-kbtn-l" }, "Keşfet önizleme"));
  // 769–1023: kenar çekmecesindeki "Keşfet ekranı" / "Siteye dön" <button> olduğundan kabuk çekmeceyi kapatmıyor → önizleme
  // çekmece + perde altında açılıyordu. Önce çekmeceyi kapat, odağı hamburgere ver (önizleme kapanınca oraya döner).
  // SHARED-CANDIDATE: panelShell kenar menüsünde <button> tıklanınca da çekmeceyi kapatmalı.
  const openPreview = () => {
    if (shell.node.classList.contains("is-nav-open")) {
      shell.node.querySelector(".dk-ps-scrim")?.click();
      try { shell.topbar.querySelector(".dk-ps-burger")?.focus({ preventScroll: true }); } catch (_) {}
    }
    openKesfetPreview();
  };
  kbtn.addEventListener("click", openPreview);
  const shell = panelShell({
    role: "admin", active: tab, crumb: T.label, ctx, notifications: "custom",
    headerActions: [kbtn], onPreview: openPreview,
    search: { placeholder: "Etkinlik, mekan veya üye ara", value: _q, onInput: (q) => { _q = q || ""; renderList(); }, onSubmit: (q) => { _q = q || ""; renderList(); } },
  });
  const root = shell.content;
  root.classList.add("dk-admin-panel");
  shell.search?.classList.add("dk-admin-panel-search");   // 1024–1279 genişlik düzeltmesi (dk-admin-panel.css)
  if (warm) root.classList.add("is-warm");
  // görünmez duyuru bölgesi ("Geri alındı"): #app DIŞINDA (portal) — çekmece açıkken #app inert, içindeki canlı bölge duyurulmaz.
  // Görünümle birlikte kurulur/kaldırılır; önceden DOM'da olsun diye mount sonrası eklenir.
  const live = h("span", { class: "dk-sr", role: "status", "aria-live": "polite", "aria-atomic": "true",
    style: { position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", border: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } });
  requestAnimationFrame(() => { if (alive) portalRoot().append(live); });
  unsubs.push(() => live.remove());
  const say = (t) => { live.textContent = ""; setTimeout(() => { if (live.isConnected) live.textContent = t; }, 60); };

  // ── 1. hero ──
  const hero = dkPageHero({ eyebrow: "YÖNETİCİ · ONAY MERKEZİ", title: "Bekleyen her şey, ", em: "tek yerde", tail: ".", color: VIOLET, cls: "dk-admin-panel-hero" });
  if (warm) hero.classList.remove("dk-rise");

  // ── 2. KPI kartları (düğme; tıklayınca sekme) ──
  const kpis = new Map();
  const kpiRow = h("section", { class: "dk-admin-panel-kpis", "aria-label": "Bekleyen işler" },
    ...TABS.map((t) => {
      const el = dkKpi({ label: t.kLabel, value: "—", sub: t.kSub, icon: t.icon, color: t.color, onClick: () => go(t.key, "kpi"), active: t.key === tab, cls: "dk-admin-panel-kpi" });
      el.dataset.key = t.key;
      kpis.set(t.key, el);
      return el;
    }));

  // ── 3a. tablo kartı ──
  const tabs = dkUnderlineTabs({
    items: TABS.map((t) => ({ key: t.key, label: t.label, count: "", href: t.route })),
    value: tab, variant: "sans", underline: "role", label: "Yönetici sekmeleri", cls: "dk-admin-panel-tabs",
    onChange: (k) => go(k, "tab"),
  });
  tabs.querySelectorAll(".dk-utab-t").forEach((t, i) => { t.dataset.key = TABS[i].key; });
  const chips = new Map();
  const subRow = tab === "onaylar" ? h("div", { class: "dk-admin-panel-subs", role: "group", "aria-label": "Başvuru türü" },
    ...SUBS.map(([k, label, dot]) => {
      const c = dkChip({ label, dot, pressed: k === sub, size: 32, cls: "dk-admin-panel-chip", onClick: () => setSub(k) });
      chips.set(k, c); return c;
    })) : null;
  const thead = h("div", { role: "row", class: "dk-admin-panel-thead" },
    h("span", { role: "columnheader", class: "dk-admin-panel-c1" }, HEAD[tab][0]),
    h("span", { role: "columnheader", class: "dk-admin-panel-c2" }, HEAD[tab][1]),
    h("span", { role: "columnheader", class: "dk-admin-panel-c3" }, "DURUM"),
    h("span", { role: "columnheader", class: "dk-admin-panel-c4" }, "İŞLEM"));
  const tbody = h("div", { role: "rowgroup", class: "dk-admin-panel-tbody", id: "dk-admin-panel-rows" });
  const table = h("div", { role: "table", class: "dk-admin-panel-tbl", "aria-label": T.label, "aria-busy": "true" }, h("div", { role: "rowgroup" }, thead), tbody);
  const foot = h("div", { class: "dk-admin-panel-foot" }, svgRaw(INFO_SVG, { size: 15, sw: "2" }), h("span", {}, FOOT[tab]));
  const card = h("section", { class: "dk-admin-panel-card", "aria-label": T.label }, tabs, subRow, table, foot);
  const activeTab = tabs.querySelector(`.dk-utab-t[data-key="${tab}"]`);
  activeTab?.setAttribute("aria-controls", "dk-admin-panel-rows");

  // ── 3b. detay paneli ──
  const detail = h("aside", { class: "dk-admin-panel-detail", "aria-label": "Seçili kayıt" });
  const grid = h("div", { class: "dk-admin-panel-grid" }, card, detail);
  root.append(hero, kpiRow, grid);

  // sekme şeridi dar kartta taşarsa kenar solması (kaydırma çubuğu gizli; sıkıştırma CSS container query'de)
  const syncTabs = () => {
    const ovf = tabs.scrollWidth - tabs.clientWidth > 1;
    tabs.classList.toggle("is-ovf-l", ovf && tabs.scrollLeft > 1);
    tabs.classList.toggle("is-ovf-r", ovf && tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1);
  };
  // detay paneli yalnız görüntü alanına sığıyorsa yapışkan (top 96 + alt 24); sığmıyorsa doğal akış — alt kısmı kırpılmasın
  const syncSticky = () => { detail.classList.toggle("is-free", detail.offsetHeight > window.innerHeight - 120); };
  const ro = new ResizeObserver(() => { syncTabs(); syncSticky(); });
  ro.observe(tabs); ro.observe(detail);
  tabs.addEventListener("scroll", syncTabs, { passive: true });
  window.addEventListener("resize", syncSticky);
  unsubs.push(() => { ro.disconnect(); window.removeEventListener("resize", syncSticky); });

  // ══════════ durum yardımcıları ══════════
  const tabItems = (k = tab) => _cache.order.map((x) => _cache.items.get(x)).filter((it) => it && tabOfKind(it.kind) === k);
  const pendingCount = (k) => tabItems(k).filter((it) => it.status === "pending").length;
  const subOk = (it) => sub === "all" || it.kind === sub;
  const visible = () => tabItems().filter((it) => subOk(it) && (!_q || matchText(_q, it.title, it.sub, it.col2, it.email)));
  const currentSel = (list) => {
    if (selKey && selKey.startsWith("?:")) { const k = findKeyById(selKey.slice(2)); if (!k.startsWith("?:")) selKey = k; }
    if (selKey && list.some((it) => keyOf(it) === selKey)) return _cache.items.get(selKey);
    return list[0] || null;
  };
  const asideShown = () => wideMq.matches;
  // kaynak durumu: failed = bu turda yüklenemedi · unknown = yüklenemedi VE önbellekte o kaynaktan öğe yok (sayı bilinmiyor → "—")
  const srcFailed = (sr) => !!_cache.src[sr];
  const srcUnknown = (sr) => srcFailed(sr) && !_cache.order.some((x) => SRC_OF[_cache.items.get(x)?.kind] === sr);
  const failedFeeds = () => (tab === "onaylar" ? SUB_SRCS[sub] : TAB_SRCS[tab]).filter(srcFailed);   // görünen süzgeci besleyen, düşen kaynaklar

  function go(k, src) {
    _pendingFocus = { src, key: k };
    if (k === tab) { _pendingFocus = null; return; }
    const target = TAB[k].route;
    if (location.hash !== target) location.hash = target;
  }
  function setSub(k) {
    if (k === sub) return;
    sub = k; selKey = null; urlSec = null;
    writeQuery({ tur: SUBS.find((x) => x[0] === k)?.[3] || null, sec: null });
    renderList();
  }
  function select(it, { open = true } = {}) {
    selKey = keyOf(it); urlSec = it.id;
    writeQuery({ sec: it.id });
    if (!asideShown() && open) openDrawer();
    renderList();
  }

  // artboard toast'ı (padding 0 16) — ortak açık toast'a yerel sınıf (SHARED-CANDIDATE, bkz. dk-admin-panel.css)
  const toast = (msg, o) => { const t = dkToast(msg, o); t?.node?.classList.add("dk-admin-panel-tst"); return t; };

  // ── karar ──
  async function decide(it, ok) {
    if (it.busy || it.status !== "pending") return;
    it.busy = ok ? "ok" : "no"; notify();
    try {
      await writeDecision(it, ok);
      it.status = ok ? OKS[it.kind] : "rejected"; it.decidedAt = Date.now();
      lastToast = toast(ok ? OKT[it.kind] : "Reddedildi");
    } catch (e) {
      console.error(e);
      toast("İşlem başarısız", { type: "err" });
    } finally {
      it.busy = null;
      notify();
    }
  }
  async function undo(it) {
    if (it.busy || !canUndo(it)) return;
    it.busy = "undo"; notify();
    try {
      await writeUndo(it);
      it.status = "pending"; it.decidedAt = Date.now();
      try { lastToast?.close(); } catch (_) {}
      lastToast = null;
      say("Geri alındı");           // artboard: geri alınca toast yok → yalnız ekran okuyucu duyurusu
    } catch (e) {
      console.error(e);
      toast("İşlem başarısız", { type: "err" });
    } finally {
      it.busy = null;
      notify();
    }
  }

  // ══════════ çizim ══════════
  const avatar = (it, size) => h("span", { class: cx("dk-admin-panel-av", size === 56 && "is-lg"), "aria-hidden": "true",
    style: { background: `linear-gradient(135deg,${it.color},${rgba(it.color, 0.55)})`, borderRadius: it.kind === "report" || it.kind === "org" ? "50%" : "8px" } }, it.ini);
  const kindTag = (it, alt) => {
    const kt = KIND_TAG[it.kind]; if (!kt) return null;
    return h("span", { class: cx("dk-admin-panel-ktag", alt && "is-alt"), style: { color: kt[1], borderColor: rgba(kt[1], 0.5) } }, kt[0]);
  };
  const badge = (it) => dkStatusBadge({ label: statusLabel(it), color: statusColor(it) }, { variant: "pill" });
  // Yazım sürerken düğmeler `disabled` DEĞİL aria-disabled: odaktaki düğme yeniden çizimde odağını korusun (disabled düğme
  // odak alamaz → odak <body>'ye düşüyordu). Tıklamalar decide()/undo() içindeki it.busy korumasıyla yok sayılır.
  const busyAttrs = (it, kind) => ({ "aria-disabled": it.busy ? "true" : null, "aria-busy": it.busy && it.busy === kind ? "true" : null });
  const actBtn = (kind, label, it, onClick) => {
    const b = h("button", { type: "button", class: cx("dk-admin-panel-act", `is-${kind}`, "dk-press"), dataset: { f: `${keyOf(it)}|${kind}` },
      "aria-label": `${label}: ${it.title}`, ...busyAttrs(it, kind) },
    svgRaw(kind === "ok" ? CHECK_SVG : X_SVG, { size: 14, sw: "2.4" }), h("span", {}, label));
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  };
  // f: satırdaki "undo" / detay paneli-çekmecedeki "dundo" (odak geri yüklemesi doğru bölgeyi bulsun)
  const undoBtn = (it, cls = "dk-admin-panel-undo", f = "undo") => {
    const b = h("button", { type: "button", class: cx(cls, "dk-link"), dataset: { f: `${keyOf(it)}|${f}` }, "aria-label": `Geri al: ${it.title}`, ...busyAttrs(it, "undo") }, "Geri al");
    b.addEventListener("click", (e) => { e.stopPropagation(); undo(it); });
    return b;
  };

  function rowEl(it, isSel) {
    const k = keyOf(it);
    const pick = h("button", { type: "button", class: "dk-admin-panel-pick", "aria-label": `${it.title} detayını göster`, "aria-pressed": isSel ? "true" : "false", dataset: { f: `${k}|pick` } },
      avatar(it, 38),
      h("span", { class: "dk-admin-panel-tcol" },
        h("span", { class: "dk-admin-panel-t" }, it.title),
        h("span", { class: "dk-admin-panel-s" }, kindTag(it, true), h("span", { class: "dk-admin-panel-stx" }, it.sub))));
    pick.addEventListener("click", () => select(it));
    const acts = h("div", { role: "cell", class: "dk-admin-panel-c4" });
    if (it.status === "pending") {
      acts.append(actBtn("ok", OKL[it.kind], it, () => decide(it, true)));
      if (it.kind !== "report") acts.append(actBtn("no", "Reddet", it, () => decide(it, false)));
    } else if (canUndo(it)) acts.append(undoBtn(it));
    const row = h("div", { role: "row", class: cx("dk-admin-panel-row", "dk-row", isSel && "is-sel"), dataset: { key: k } },
      h("span", { class: "dk-admin-panel-selbar", "aria-hidden": "true" }),
      h("div", { role: "cell", class: "dk-admin-panel-c1" }, pick),
      h("div", { role: "cell", class: "dk-admin-panel-c2" }, kindTag(it, false), h("span", { class: "dk-admin-panel-c2t" }, it.col2)),
      h("div", { role: "cell", class: "dk-admin-panel-c3" }, badge(it)),
      acts);
    // fareyle satırın boş yerine tık da seçer (klavye: satırdaki "detayını göster" düğmesi)
    row.addEventListener("click", (e) => { if (e.target.closest("button,a")) return; select(it); });
    return row;
  }

  // İletişim adresi: başvuran → users.email · ad isteği / sorun → önce users/{hedef|bildiren}.email (userById), yoksa rapordaki
  // reporterEmail (bildirenin kendi yazdığı alan; yedek). Hepsi safeEmail süzgecinden geçer. Getirme sürerken düğme gizli.
  function contactEmail(it) {
    if (it.kind === "vip") return null;
    if (it.email || !it.emailUid) return safeEmail(it.email) || safeEmail(it.emailAlt);
    if (!_cache.emails.has(it.emailUid)) {
      const id = it.emailUid;
      _cache.emails.set(id, undefined);             // getiriliyor
      userById(id).then((u) => { _cache.emails.set(id, u?.email || null); }, () => { _cache.emails.set(id, null); })
        .finally(notify);                           // görünüm bu arada yeniden kurulmuş olabilir → mount'lu olanı çiz
      return null;
    }
    const v = _cache.emails.get(it.emailUid);
    return v === undefined ? null : safeEmail(v) || safeEmail(it.emailAlt);
  }

  function detailNodes(it, inDrawer) {
    const out = [];
    const st = statusColor(it);
    if (!inDrawer) {
      out.push(h("div", { class: "dk-admin-panel-dhead" },
        h("span", { class: "dk-admin-panel-deb" }, EYE[it.kind]),
        h("div", { class: "dk-admin-panel-drow" }, avatar(it, 56),
          h("div", { class: "dk-admin-panel-dcol" }, h("span", { class: "dk-admin-panel-dt" }, it.title), h("span", {}, badge(it))))));
    } else {
      out.push(h("div", { class: "dk-admin-panel-drow is-drw" }, avatar(it, 56),
        h("div", { class: "dk-admin-panel-dcol" }, h("span", { class: "dk-admin-panel-dsub" }, it.sub), h("span", {}, badge(it)))));
    }
    out.push(h("dl", { class: "dk-admin-panel-dl" }, ...it.fields.map(([kk, v]) => h("div", {}, h("dt", {}, kk), h("dd", {}, ...wbr(v))))));
    if (it.msgLabel && it.msg) out.push(h("div", { class: "dk-admin-panel-msg" }, h("span", {}, it.msgLabel), h("p", {}, it.msg)));
    const acts = h("div", { class: "dk-admin-panel-dact" });
    const k = keyOf(it);
    if (it.status === "pending") {
      const okB = h("button", { type: "button", class: "dk-admin-panel-dok dk-press", dataset: { f: `${k}|dok` }, ...busyAttrs(it, "ok") },
        svgRaw(CHECK_SVG, { size: 16, sw: "2.4" }), h("span", {}, OKL[it.kind]));
      okB.addEventListener("click", () => decide(it, true));
      acts.append(okB);
      if (it.kind !== "report") {
        const noB = h("button", { type: "button", class: "dk-admin-panel-dno dk-press", dataset: { f: `${k}|dno` }, ...busyAttrs(it, "no") },
          svgRaw(X_SVG, { size: 16, sw: "2.4" }), h("span", {}, "Reddet"));
        noB.addEventListener("click", () => decide(it, false));
        acts.append(noB);
      }
    } else {
      acts.append(h("div", { class: "dk-admin-panel-done", style: { background: rgba(st, 0.1), borderColor: rgba(st, 0.4) } },
        h("span", {}, "Karar verildi: " + statusLabel(it)),
        canUndo(it) ? undoBtn(it, "dk-admin-panel-dundo", "dundo") : null));
    }
    // "Mesaj gönder" (VIP hariç): yönetici sohbeti yok → mailto yedeği (spec §9); geçerli e-posta yoksa gizli
    const email = contactEmail(it);
    if (email) {
      acts.append(h("a", { class: "dk-admin-panel-dmsg dk-press", href: mailtoHref(email, "GigBridge – " + it.title) },
        svgIcon("chatSquare", { size: 16, sw: "2" }), "Mesaj gönder"));
    }
    out.push(acts);
    return out;
  }

  function renderDetail() {
    const list = visible();
    const it = !_cache.ready && !_cache.items.size ? undefined : currentSel(list);
    if (it === undefined) {
      detail.replaceChildren(h("div", { class: "dk-admin-panel-dhead" }, dkSkeleton({ w: 120, h: 11 }),
        h("div", { class: "dk-admin-panel-drow" }, dkSkeleton({ w: 56, h: 56, r: 8 }), h("div", { class: "dk-admin-panel-dcol" }, dkSkeleton({ w: 160, h: 18 }), dkSkeleton({ w: 90, h: 22, r: 12 })))),
      h("div", { class: "dk-admin-panel-dl" }, ...[0, 1, 2, 3].map(() => h("div", {}, dkSkeleton({ w: 70, h: 11 }), dkSkeleton({ w: 100, h: 14 })))));
      return;
    }
    if (!it) {
      // liste yüklenemediyse "soldan bir satır seç" demeyelim (seçilecek satır yok)
      const failed = failedFeeds().length > 0;
      detail.replaceChildren(h("div", { class: "dk-admin-panel-dempty" },
        failed ? svgIcon("alertCircle", { size: 28, color: "#5E636D" }) : svgRaw(CHECK_SVG, { size: 28, sw: "2", color: "#5E636D" }),
        h("span", { class: "dk-admin-panel-det" }, "Seçili kayıt yok"),
        h("span", {}, failed ? "Kayıtlar yüklenince detaylar burada görünür." : "Detayları görmek için soldan bir satır seç.")));
    } else detail.replaceChildren(...detailNodes(it, false));
    if (drawer) {
      if (!it) { drawer.close(); drawer = null; } else {
        drawer.setTitle(it.title);
        const eb = drawer.panel.querySelector(".dk-drw-eb"); if (eb) eb.textContent = EYE[it.kind];
        drawer.body.replaceChildren(...detailNodes(it, true));
      }
    }
  }
  function openDrawer() {
    const it = currentSel(visible()); if (!it) return;
    if (drawer) { renderDetail(); return; }
    drawer = dkDrawer({ eyebrow: EYE[it.kind], eyebrowColor: VIOLET, title: it.title, body: detailNodes(it, true), width: 420, cls: "dk-admin-panel-drw",
      onClose: (reason) => {
        drawer = null;
        if (!alive) return;
        renderList();
        if (reason === "route" || reason === "mode" || reason === "identity") return;
        // çekmeceyi açan satır yeniden çizimde değişti (dkDrawer'ın prevFocus'u kopuk) → odak seçili satırın düğmesine
        requestAnimationFrame(() => { if (alive && !drawer && !root.contains(document.activeElement)) focusSel(); });
      } });
  }
  function focusSel() {
    const k = selKey && !selKey.startsWith("?:") ? selKey : null;
    const t = (k && root.querySelector(`[data-f="${CSS.escape(k)}|pick"]`)) || root.querySelector(".dk-admin-panel-pick") || root;
    try { t.focus(); } catch (_) {}
  }

  function renderList() {
    // odak koruma: yeniden çizimde aynı denetime (ya da satırın yerine geçen denetimine) dön
    const ae = document.activeElement;
    const inDrw = !!(drawer && ae && drawer.panel.contains(ae));
    const f = ae && (root.contains(ae) || inDrw) ? ae.dataset?.f : null;
    // adresteki ?sec bu sekmede/süzgeçte yoksa (silinmiş, başka sekmenin kaydı) veri yüklenince adresten kaldır → paylaşılan /
    // yenilenen bağlantı gösterilmeyen kayda işaret etmesin (arama ile gizlenen satır sayılmaz; seçim korunur)
    if (urlSec && _cache.ready && !_cache.loading && !TAB_SRCS[tab].some(srcFailed) && !tabItems().some((it) => subOk(it) && it.id === urlSec)) {
      urlSec = null; selKey = null;
      if (alive && hashBase() === T.route) writeQuery({ sec: null });
    }
    const list = visible();
    const sel = currentSel(list);
    const selK = sel ? keyOf(sel) : null;
    const showSel = asideShown() || !!drawer;
    const failed = failedFeeds();
    table.setAttribute("aria-busy", !_cache.ready && !_cache.items.size ? "true" : "false");
    if (!_cache.ready && !_cache.items.size) {
      tbody.replaceChildren(...[0, 1, 2].map(() => h("div", { class: "dk-admin-panel-row is-skel", "aria-hidden": "true" },
        h("div", { class: "dk-admin-panel-c1 dk-admin-panel-skc1" }, dkSkeleton({ w: 38, h: 38, r: 8 }), h("div", { class: "dk-admin-panel-tcol" }, dkSkeleton({ w: 110, h: 14 }), dkSkeleton({ w: 70, h: 11 }))),
        h("div", { class: "dk-admin-panel-c2" }, dkSkeleton({ w: 90, h: 13 })),
        h("div", { class: "dk-admin-panel-c3" }, dkSkeleton({ w: 84, h: 24, r: 12 })),
        h("div", { class: "dk-admin-panel-c4" }, dkSkeleton({ w: 84, h: 34 }), dkSkeleton({ w: 84, h: 34 })))));
    } else if (failed.length && !list.length) {
      const retry = dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: (e) => retryLoad(e) });
      tbody.replaceChildren(h("div", { role: "row" }, h("div", { role: "cell", class: "dk-admin-panel-err" },
        svgIcon("alertCircle", { size: 28, color: "#5E636D" }),
        h("span", { class: "dk-admin-panel-det", role: "alert" }, "Yüklenemedi"),
        h("span", {}, "Bağlantıyı kontrol edip sayfayı yenile."), retry)));
    } else if (!list.length) {
      tbody.replaceChildren(h("div", { role: "row" }, h("div", { role: "cell", class: "dk-admin-panel-empty" }, _q && tabItems().some(subOk) ? "Aramanla eşleşen kayıt yok" : EMPTY[tab])));
    } else {
      const rows = list.map((it) => rowEl(it, showSel && keyOf(it) === selK));
      if (failed.length) {        // kısmi hata: görünen satırlar eksik olabilir → üstte uyarı + "Tekrar dene"
        const b = h("button", { type: "button", class: "dk-admin-panel-iretry dk-link", dataset: { f: "err|retry" }, "aria-disabled": _cache.loading ? "true" : null }, "Tekrar dene");
        b.addEventListener("click", (e) => retryLoad(e));
        rows.unshift(h("div", { role: "row" }, h("div", { role: "cell", class: "dk-admin-panel-ierr" },
          svgIcon("alertCircle", { size: 16, color: "#FF5A6E" }), h("span", {}, "Bazı kayıtlar yüklenemedi."), b)));
      }
      tbody.replaceChildren(...rows);
    }
    renderDetail();
    if (f) {
      // aynı denetim → yoksa aynı bölgedeki karşılığı (karar → "Geri al", geri al → onay düğmesi) → satırın seçim düğmesi.
      // Çekmecede odak diyalogdan çıkmaz (arka sayfa inert): yalnız çekmece içi, en sonda kapat düğmesi.
      const cut = f.lastIndexOf("|");
      const kk = CSS.escape(f.slice(0, cut)), suf = f.slice(cut + 1);
      const scope = inDrw && drawer ? drawer.panel : root;
      let t = null;
      for (const s of [suf, ...(FOCUS_NEXT[suf] || [])]) { t = scope.querySelector(`[data-f="${kk}|${s}"]`); if (t) break; }
      if (!t && scope !== root) t = scope.querySelector(".dk-mdl-x");
      try { t?.focus({ preventScroll: true }); } catch (_) {}
    }
    renderCounts();
  }

  function renderCounts() {
    const ready = _cache.ready || _cache.items.size > 0;
    // bilinmeyen sayı (kaynağı yüklenemedi, önbellekte de yok) → KPI / sekme / çip "—" (0 değil: "bekleyen yok" sanılmasın)
    TABS.forEach((t) => {
      const n = pendingCount(t.key);
      const unknown = TAB_SRCS[t.key].some(srcUnknown);
      kpis.get(t.key)?.dk.setValue(!ready || unknown ? "—" : String(n));
      tabs.dk.setCount(t.key, !ready ? "" : unknown ? "—" : String(n));
    });
    if (subRow) SUBS.forEach(([k, label]) => {
      const n = tabItems("onaylar").filter((it) => it.status === "pending" && (k === "all" || it.kind === k)).length;
      const c = chips.get(k);
      const l = c.querySelector("span:last-child"); if (l) l.textContent = ready ? `${label} · ${SUB_SRCS[k].some(srcUnknown) ? "—" : n}` : label;
      c.dk.set(k === sub);
    });
    pushShellCounts();
    syncTabs();                      // sayaç genişliği şeridi taşırabilir
  }
  // kabuk: kenar menüsü sayaçları + türetilmiş zil akışı (spec §9)
  function pushShellCounts() {
    if (!_cache.ready) return;
    TABS.forEach((t) => shell.setBadge(t.key, pendingCount(t.key)));
    let seen = 0; try { seen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch (_) {}
    const feed = _cache.order.map((k) => _cache.items.get(k)).filter((it) => it && it.status === "pending" && it.createdMs)
      .sort((a, b) => b.createdMs - a.createdMs).slice(0, 6).map((it) => {
        const t = tabOfKind(it.kind);
        const href = `${TAB[t].route}?sec=${encodeURIComponent(it.id)}`;
        const base = { createdAt: it.createdMs, read: it.createdMs <= seen, href };
        if (it.kind === "venue") return { ...base, title: "Yeni mekan başvurusu", body: `${it.title} onay bekliyor.`, icon: "building", color: V };
        if (it.kind === "org") return { ...base, title: "Yeni organizatör başvurusu", body: `${it.title} onay bekliyor.`, icon: "building", color: V };
        if (it.kind === "vip") return { ...base, title: "VIP isteği", body: `“${it.title}” için VIP isteği geldi.`, icon: "sparklesAdmin", color: "#FFD700" };
        if (it.kind === "name") return { ...base, title: "Mekan adı isteği", body: `${it.raw.currentName || "Mekan"} ad değişikliği istedi.`, icon: "edit", color: V };
        return { ...base, title: "Sorun bildirimi", body: `${it.raw.reporterName || "Bir kullanıcı"} yeni bir bildirim gönderdi.`, icon: "flag", color: "#FF5A6E" };
      });
    shell.setNotifications(feed);
  }
  function renderAll() { renderList(); }

  // "Tekrar dene" (tam / kısmi hata): odak düğmedeyse yükleme sürerken içerik bölgesinde bekler, sonra ilk satıra
  // (hata sürüyorsa yeni "Tekrar dene"ye) geçer — düğme yeniden çizimde kalkınca odak <body>'ye düşmesin.
  async function retryLoad(e) {
    if (_cache.loading) return;
    const btn = e?.currentTarget;
    const hadFocus = !!btn && document.activeElement === btn;
    btn?.setAttribute("aria-disabled", "true");
    if (hadFocus) { try { root.focus({ preventScroll: true }); } catch (_) {} }
    await refresh(true);
    if (!alive || !hadFocus || (document.activeElement !== root && document.activeElement !== document.body)) return;
    const t = root.querySelector(".dk-admin-panel-err .dk-btn, .dk-admin-panel-iretry") || root.querySelector(".dk-admin-panel-pick") || root;
    try { t.focus({ preventScroll: true }); } catch (_) {}
  }

  async function refresh(force = false) {
    if (!uid) return;
    const fresh = _cache.ready && Date.now() - _cache.at < CACHE_TTL;
    if (fresh && !force) return;
    if (force && !_cache.items.size) { _cache.ready = false; renderList(); }
    await loadAll(uid);
    notify();
    // ?sec ile gelindiyse (zil bağlantısı) ve detay paneli görünmüyorsa çekmeceyi aç
    if (alive && openOnReady) { openOnReady = false; if (selKey && !selKey.startsWith("?:") && !asideShown() && !drawer) openDrawer(); }
  }

  // ── zil: popover açılınca "görüldü" (spec §9: localStorage gb.admin.seen) ──
  const bell = shell.topbar.querySelector(".dk-ps-bell");
  if (bell) bell.addEventListener("click", () => {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (_) {}
    queueMicrotask(() => { if (alive) pushShellCounts(); });
  });
  // Zil satırı bağlantısı aynı sekmeye (?sec=) gidiyorsa router yeniden kurmaz → popover açık kalıyordu: satır tıklanınca kapat.
  // SHARED-CANDIDATE: panelShell bildirim satırı (a[href]) tıklanınca popover'ı kendisi kapatmalı.
  // Odak: popover kapanınca (tetikleyici zil) seçilen satıra geçer; başka sekmeye gidiliyorsa yeni görünüm aynısını yapar (_pendingFocus).
  const onNotifLink = (e) => {
    const a = e.target.closest?.(".dk-ps-notifpop a[href]"); if (!a) return;
    const target = TABS.find((t) => t.route === (a.getAttribute("href") || "").split("?")[0]);
    if (target && target.key !== tab) { _pendingFocus = { src: "notif", key: target.key }; return; }
    setTimeout(() => {
      document.querySelector(".dk-ps-notifpop .dk-ps-nclose")?.click();
      requestAnimationFrame(() => { if (alive && !drawer) focusSel(); });
    }, 0);
  };
  document.addEventListener("click", onNotifLink, true);
  unsubs.push(() => document.removeEventListener("click", onNotifLink, true));
  // kenar menüsü sekme bağlantıları → yeni görünümde aynı öğeye odak
  shell.aside.addEventListener("click", (e) => { const a = e.target.closest(".dk-ps-item[data-key]"); if (a && TAB[a.dataset.key]) _pendingFocus = { src: "nav", key: a.dataset.key }; });
  // detay paneli görünür olunca çekmeceyi kapat (genişlik değişimi)
  const onMq = () => { if (wideMq.matches && drawer) { drawer.close(); drawer = null; } if (alive) renderList(); };
  wideMq.addEventListener("change", onMq);
  unsubs.push(() => wideMq.removeEventListener("change", onMq));

  // ── ilk çizim ──
  readQ(ctx.query);
  let openOnReady = !!selKey;
  _subs.add(renderAll);
  unsubs.push(() => _subs.delete(renderAll));
  renderList();
  if (openOnReady && _cache.ready && selKey && !selKey.startsWith("?:") && !asideShown()) { openOnReady = false; queueMicrotask(() => { if (alive && !drawer) openDrawer(); }); }
  if (_cache.ready) pushShellCounts();
  refresh(false);

  // sıcak yeniden kurulum: kaydırma + odak (sekme şeridi / KPI / kenar menüsü)
  if (warm) {
    const y = _last.scrollY;
    requestAnimationFrame(() => {
      if (!alive) return;
      if (y) window.scrollTo(0, y);
      const pf = _pendingFocus; _pendingFocus = null;
      if (pf && pf.key === tab) {
        if (pf.src === "notif") { if (!drawer) focusSel(); return; }
        const t = pf.src === "tab" ? tabs.querySelector(`.dk-utab-t[data-key="${tab}"]`) : pf.src === "kpi" ? kpis.get(tab) : shell.aside.querySelector(`.dk-ps-item[data-key="${tab}"]`);
        try { t?.focus({ preventScroll: true }); } catch (_) {}
      }
    });
  } else _pendingFocus = null;

  return {
    node: shell.node,
    update(q) {                                     // yalnız ?tur / ?sec değişti (geri/ileri, zil bağlantısı)
      readQ(q);
      if (selKey && !asideShown() && !drawer && !selKey.startsWith("?:")) openDrawer();
      renderList();
    },
    onSession(ns) { return !!ns?.user && ns.user.uid === uid && !!ns.isAdmin; },
    destroy() {
      alive = false;
      _last = { at: performance.now(), scrollY: window.scrollY || 0 };
      if (drawer) { try { drawer.close(); } catch (_) {} drawer = null; }
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}
