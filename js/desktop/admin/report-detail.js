// WebAdmin · Sorun Bildirimleri — ŞİKÂYET AYRINTISI + DESTEK YAZIŞMASI (admin.js detay paneli / dar ekranda çekmece).
// Rapor alanlarının yazarları (GigBridge deposu): src/services/moderation.ts (type 'content'), src/services/admin.ts +
//   web data.js submitReport (sorun bildirimi), nameChange.ts (name_change), functions/safety.js (block + context, verified*,
//   adminModerate → actions/lastAction/resolution/resolvedBy/originalMessages/bannedUid, onReportAlert → alertStatus),
//   functions/moderation.js (auto_filter / auto_escalation, distinctReporters, escalated, autoHidden, matchedTerms, category),
//   functions/support.js (thread* özet alanları). Uygulamadaki admin moderasyon kartı (AdminPanelScreen ReportRow/BlockCard)
//   neyi gösteriyorsa burada da var (+ tüm bağlam, geçmiş ve yazışma).
// Yazışma: reports/{id}/thread — admin "GigBridge Destek" olarak yazar (kullanıcı yöneticinin adını görmez). Kullanıcı yanıtı
//   e-posta/push GÖNDERMEZ; panelde okunmamış işareti (threadUnreadAdmin, canlı) ile görünür.
// Stil: css/dk-admin-panel.css (.dk-admin-panel-* — mevcut dl / msg / act / dok kalıpları).
import { h } from "../../ui.js";
import { db, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, functions, httpsCallable } from "../../firebase.js";
import { userById } from "../../data.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkConfirm } from "../shared/ui.js";
import { rgba, toMs, MONTHS_TR_SHORT, ROLE_LABELS } from "../shared/helpers.js";

export const SUPPORT_NAME = "GigBridge Destek";
const MAX_TEXT = 2000;
const VIOLET = "#A78BFA", RED = "#FF5A6E", AMBER = "#FFB347", CYAN = "#4ED8FF", GREEN = "#7CE0B0", ORANGE = "#FF8A2A", GREY = "#A3A7AF";

// ══════════ Etiketler (uygulama + sunucu ile aynı anahtarlar) ══════════
const KIND = {
  content: ["ŞİKAYET", AMBER], block: ["ENGELLEME", RED], auto_filter: ["OTOMATİK FİLTRE", CYAN],
  auto_escalation: ["ÇOKLU ŞİKAYET", RED], name_change: ["AD DEĞİŞİKLİĞİ", ORANGE],
};
const TARGET = {
  post: "Gönderi", comment: "Yorum", review: "Değerlendirme", venueReview: "Mekan değerlendirmesi", message: "Mesaj",
  conversation: "Sohbet", user: "Kullanıcı / profil", event: "Etkinlik", group: "Grup", poll: "Grup anketi",
};
// src/services/moderation.ts REPORT_REASONS + functions/safety.js BLOCK_REASONS + sunucu kodları
const REASON = {
  spam: "Spam veya yanıltıcı içerik", harassment: "Taciz, nefret söylemi veya zorbalık", sexual: "Cinsel veya müstehcen içerik",
  violence: "Şiddet veya tehdit", ip: "Telif hakkı ihlali", other: "Diğer", blocked: "Sebep belirtilmedi",
  inappropriate: "Uygunsuz içerik", threat: "Tehdit veya şiddet", annoying: "Rahatsız edici davranış",
  auto_filter: "Uygunsuz ifade (otomatik filtre)", filter_failed: "Otomatik filtre denetleyemedi",
};
const CATEGORY = { kufur: "Küfür", hakaret: "Hakaret", nefret: "Nefret söylemi", cinsel: "Cinsel içerik", tehdit: "Tehdit" };
const RESOLUTION = {
  removed: "İçerik kaldırıldı", masked: "Profil bilgileri temizlendi", restored: "İçerik geri yüklendi", banned: "Kullanıcı yasaklandı",
  unbanned: "Yasak kaldırıldı", no_action: "İşlem gerekmedi", missing: "İçerik zaten silinmiş",
};
const ACTION = { removeContent: "İçerik kaldırıldı", restoreContent: "İçerik geri yüklendi", banUser: "Kullanıcı yasaklandı", unbanUser: "Yasak kaldırıldı" };
const ALERT = { sent: "Gönderildi", rate_limited: "Hız sınırına takıldı (12 saat özetinde)", failed: "Gönderilemedi" };
const SERVER_KINDS = ["block", "auto_filter", "auto_escalation"];

const str = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const trUp = (s) => String(s).toLocaleUpperCase("tr-TR");
const short = (id) => (id && id.length > 10 ? `${id.slice(0, 6)}…` : id || "");
export const fmtDateTime = (v) => {
  const t = toMs(v); if (t == null) return "";
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Tür etiketi + rengi (sorun bildirimi: type yok / 'report' / 'problem'). */
export function reportKind(r) { const k = KIND[str(r?.type)]; return k ? { label: k[0], color: k[1] } : { label: "SORUN BİLDİRİMİ", color: GREY }; }
/** Başlık: içerik şikâyetinde yapısal alanlardan (eski kayıtlarda subject ham anahtarla yazılmıştı — uygulama ile aynı). */
export function reportTitle(r) {
  if (str(r?.type) === "content" && TARGET[str(r.targetType)]) return `${str(r.targetType) === "user" ? "Kullanıcı" : TARGET[str(r.targetType)]} şikayeti`;
  return str(r?.subject) || "Bildirim";
}
/** firestore.rules thread kuralı supportable() ile aynı: yanıt iletilecek gerçek bir bildiren var mı? */
export function supportable(r) {
  const id = str(r?.reporterId);
  return !!id && id !== "system" && !["guest", "sistem"].includes(str(r?.reporterType));
}
export const unreadOf = (r) => Math.max(0, num(r?.threadUnreadAdmin) || 0);

/** Kayıtta hangi admin müdahaleleri anlamlı? (uygulama AdminPanelScreen moderationActions ile aynı; sunucu yeniden denetler) */
export function moderationActions(r) {
  const type = str(r?.type);
  if (!KIND[type] || type === "name_change") return { remove: false, restore: false, ban: false, unban: false };
  const owner = str(r.targetOwnerId) || (r.targetType === "user" ? str(r.targetId) : "");
  const groupConvNoOwner = r.targetType === "conversation" && !str(r.targetOwnerId);
  const hasTarget = !!(str(r.targetPath) || str(r.convId) || str(r.targetId));
  const last = str(r.lastAction);
  const restorable = type === "auto_filter" || last === "removeContent" || (type === "auto_escalation" && r.autoHidden === true);
  return {
    remove: hasTarget && !groupConvNoOwner && (type !== "block" || !!str(r.convId)) && last !== "removeContent" && (type !== "auto_filter" || last === "restoreContent"),
    restore: restorable && last !== "restoreContent",
    ban: !!owner && owner !== "system" && last !== "banUser",
    unban: last === "banUser",
  };
}
const MOD_TEXT = {
  removeContent: ["İçerik kaldırılsın mı?", "İçerik akıştan kaldırılır ve metni gizlenir. Orijinali bu kayıtta saklanır; gerekirse Geri al ile geri yükleyebilirsin.", "Kaldır", true],
  restoreContent: ["İçerik geri yüklensin mi?", "Kaldırılan ya da otomatik gizlenen içerik akışa geri döner.", "Geri yükle", false],
  banUser: ["Kullanıcı yasaklansın mı?", "Hesap kapatılır, oturumu hemen düşer ve paylaşımları akıştan gizlenir.", "Yasakla", true],
  unbanUser: ["Yasak kaldırılsın mı?", "Hesap yeniden açılır; kullanıcı giriş yapabilir ve yasakla gizlenen içerikleri geri gelir.", "Yasağı kaldır", false],
};
const adminModerateFn = httpsCallable(functions, "adminModerate", { timeout: 30000 });
/** Onay → Cloud Function adminModerate (functions/safety.js). → { ok, message } | null (vazgeçildi). Hata fırlatır. */
export async function runModeration(rid, action, ownerLabel) {
  const [title, body, cta, danger] = MOD_TEXT[action];
  const ok = await dkConfirm({ title: action === "banUser" && ownerLabel ? `${ownerLabel} yasaklansın mı?` : title, body, confirmLabel: cta, cancelLabel: "Vazgeç", danger });
  if (!ok) return null;
  const res = await adminModerateFn({ reportId: rid, action });
  return res.data;
}
/** Callable hata metni: sunucunun Türkçe açıklaması, yoksa bağlantı uyarısı (uygulama fnErrorText ile aynı). */
export function fnErrorText(e) {
  const code = String(e?.code || ""), msg = String(e?.message || "");
  if (!msg || code.endsWith("internal") || code.endsWith("unavailable") || code.endsWith("deadline-exceeded")) return "Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.";
  return msg;
}

// ══════════ Profil özeti (users/{uid}; admin okur) — oturum boyunca önbellek ══════════
const _profiles = new Map();          // uid → undefined (getiriliyor) | null (yok) | data
export function profileOf(uid, onReady) {
  if (!uid || uid === "system" || uid.includes("/")) return null;
  if (!_profiles.has(uid)) {
    _profiles.set(uid, undefined);
    userById(uid).then((u) => _profiles.set(uid, u || null), () => _profiles.set(uid, null)).finally(() => onReady?.());
    return undefined;
  }
  return _profiles.get(uid);
}

// ══════════ Parçalar ══════════
const tag = (label, color) => h("span", { class: "dk-admin-panel-ktag", style: { color, borderColor: rgba(color, 0.5) } }, label);
const copyBtn = (value, label) => {
  const b = h("button", { type: "button", class: "dk-admin-panel-copy dk-link", "aria-label": `${label} kopyala`, title: "Kopyala" }, "Kopyala");
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value).then(() => { b.textContent = "Kopyalandı"; setTimeout(() => { if (b.isConnected) b.textContent = "Kopyala"; }, 1400); }, () => {});
  });
  return b;
};
const mono = (v) => h("span", { class: "dk-admin-panel-mono" }, v);
// dl satırı: değer boşsa satır yazılmaz
function dl(rows) {
  const items = rows.filter(([, v]) => v != null && v !== "" && v !== false);
  if (!items.length) return null;
  return h("dl", { class: "dk-admin-panel-dl is-sec" }, ...items.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, ...(Array.isArray(v) ? v : [v])))));
}
function sec(title, ...children) {
  const body = children.flat().filter(Boolean);
  if (!body.length) return null;
  return h("section", { class: "dk-admin-panel-sec", "aria-label": title }, h("h3", { class: "dk-admin-panel-sech" }, title), ...body);
}
function quote(label, text, { tone, list } = {}) {
  if (list ? !list.length : !str(text)) return null;
  return h("div", { class: cx("dk-admin-panel-msg", tone && `is-${tone}`) }, h("span", {}, label),
    list ? h("ul", { class: "dk-admin-panel-qlist" }, ...list.map((m) => h("li", {}, m))) : h("p", {}, text));
}
const warn = (text) => h("div", { class: "dk-admin-panel-warn", role: "note" }, svgIcon("alertTriangle", { size: 15, color: RED }), h("span", {}, text));
const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

/** Kişi satırları: rapordaki ad/tür/e-posta + profil dokümanı (e-posta, hesap açılışı, yasak, onay). */
function personRows(prefix, { name, type, email, uid, ctx }, prof) {
  const p = prof || {};
  const typeLabel = ROLE_LABELS[type] || (type === "guest" ? "Misafir (anonim)" : type === "sistem" ? "Sistem (otomatik)" : type || "");
  const created = toMs(p.createdAt) || ctx?.createdAtMs || null;
  const banned = p.banned === true || ctx?.banned === true;
  return [
    [`${prefix}AD`, name || p.displayName || "—"],
    ["HESAP TÜRÜ", typeLabel || ROLE_LABELS[p.userType] || "—"],
    ["E-POSTA", str(p.email) || email || ctx?.email || (prof === undefined ? "…" : "—")],
    ["HESAP AÇILIŞI", created ? fmtDateTime(created) : ""],
    ["UID", uid ? [mono(uid), copyBtn(uid, "UID")] : ""],
    ["DURUM", banned ? tag("YASAKLI", RED) : prof === null && uid && uid !== "system" ? "Hesap bulunamadı (silinmiş olabilir)" : ""],
  ];
}

/**
 * Raporun tüm bağlamı → düğümler (başlık ve karar düğmeleri admin.js'te).
 * @param {object} r  rapor dokümanı (id dahil)
 * @param {{ me: string, redraw: () => void }} o
 */
export function reportSections(r, { me, redraw }) {
  const type = str(r.type);
  const kind = reportKind(r);
  const serverKind = SERVER_KINDS.includes(type);
  const guest = str(r.reporterType) === "guest";
  const out = [];

  // ── etiketler
  const people = num(r.distinctReporters) ?? num(r.reportCount);
  const ctx = type === "block" && r.context && typeof r.context === "object" ? r.context : null;
  out.push(h("div", { class: "dk-admin-panel-tags" },
    tag(TARGET[str(r.targetType)] ? `${kind.label} · ${trUp(TARGET[str(r.targetType)])}` : kind.label, kind.color),
    ctx ? tag(ctx.severity === "high" ? "YÜKSEK ÖNCELİK" : "NORMAL", ctx.severity === "high" ? RED : GREY) : null,
    people > 1 ? tag(`${people} KİŞİ`, RED) : null,
    r.autoHidden === true ? tag("OTOMATİK GİZLENDİ", CYAN) : null,
    r.escalated === true ? tag("ÇOKLU ŞİKAYETE YÜKSELDİ", RED) : null,
    r.ownerMismatch === true ? tag("HEDEF UYUŞMAZLIĞI", RED) : null));

  // ── bildiren
  const repId = str(r.reporterId);
  const repProf = repId && repId !== "system" && !guest ? profileOf(repId, redraw) : null;
  out.push(sec(type === "block" ? "ENGELLEYEN" : "BİLDİREN",
    dl(personRows("", {
      name: str(r.reporterName) || (guest ? "Misafir kullanıcı" : ""), type: str(r.reporterType), email: str(r.reporterEmail),
      uid: repId, ctx: ctx?.reporter,
    }, repProf))));

  // ── hedef (sunucu doğrulamalı alanlar önde; bildirenin yazdığı ad/alıntı İDDİA olarak işaretli)
  const vOwner = str(r.verifiedOwnerId) || (serverKind ? str(r.targetOwnerId) : "") || (r.targetType === "user" && !str(r.targetId).includes("/") ? str(r.targetId) : "");
  const vName = str(r.verifiedOwnerName) || (serverKind ? str(r.targetOwnerName) : "");
  const claim = !serverKind && str(r.targetOwnerName) && str(r.targetOwnerName) !== vName ? str(r.targetOwnerName) : "";
  const tProf = vOwner ? profileOf(vOwner, redraw) : null;
  if (type !== "name_change" && (str(r.targetType) || str(r.targetId) || str(r.targetPath) || vOwner || str(r.convId))) {
    out.push(sec(type === "block" ? "ENGELLENEN" : "HEDEF",
      r.ownerMismatch === true ? warn("Şikâyetteki hedef kullanıcı içerik sahibiyle uyuşmuyor; işlem içerik sahibine (doğrulanmış) uygulanır.") : null,
      dl([
        ["TÜR", TARGET[str(r.targetType)] || str(r.targetType)],
        ["SAHİBİ (DOĞRULANMIŞ)", vName || (vOwner ? (tProf?.displayName || "…") : "")],
        ["BİLDİRENİN BELİRTTİĞİ", claim ? `${claim} (doğrulanmadı)` : ""],
        ["HESAP TÜRÜ", tProf ? (ROLE_LABELS[tProf.userType] || "") : (ctx?.target?.type ? ROLE_LABELS[ctx.target.type] || ctx.target.type : "")],
        ["E-POSTA", str(tProf?.email) || str(ctx?.target?.email)],
        ["HESAP AÇILIŞI", toMs(tProf?.createdAt) || ctx?.target?.createdAtMs ? fmtDateTime(toMs(tProf?.createdAt) || ctx.target.createdAtMs) : ""],
        ["UID", vOwner ? [mono(vOwner), copyBtn(vOwner, "Hedef UID")] : (str(r.targetOwnerId) ? [mono(str(r.targetOwnerId)), " (iddia)"] : "")],
        ["DURUM", tProf?.banned === true || ctx?.target?.banned === true ? tag("YASAKLI", RED) : ""],
        ["KİMLİK", str(r.targetId) && str(r.targetId) !== vOwner ? mono(str(r.targetId)) : ""],
        ["KONUM", str(r.targetPath) ? mono(str(r.targetPath)) : ""],
        ["SOHBET", str(r.convId) ? mono(`conversations/${str(r.convId)}`) : ""],
      ])));
  }

  // ── engelleme bağlamı (sunucu: functions/safety.js buildBlockContext)
  if (type === "block") {
    const blocks = num(ctx?.priorBlocksOnTarget), reps = num(ctx?.priorReportsOnTarget), count = num(ctx?.messageCount);
    out.push(sec("ENGELLEME",
      dl([
        ["SEBEP", str(r.reasonLabel) || REASON[str(r.reason)] || "Sebep belirtilmedi"],
        ["ÖNEM", ctx ? (ctx.severity === "high" ? tag("YÜKSEK", RED) : "Normal") : ""],
        ["GEÇMİŞ", blocks != null || reps != null ? [blocks != null ? (blocks === 0 ? "Daha önce engellenmedi" : `${blocks} kez engellendi`) : "", reps != null ? ` · ${reps} şikayet` : ""].join("") : ""],
        ["SOHBET", count != null ? `${count >= 500 ? "500+" : count} mesaj` : str(r.convId) ? "" : "Birebir sohbet yok (profil, akış ya da grup)"],
      ]),
      quote("ENGELLEYENİN SON MESAJLARI", null, { list: strs(ctx?.blockerMessages) }),
      quote("ENGELLENENİN SON MESAJLARI", null, { list: strs(ctx?.targetMessages) }),
      !ctx && str(r.excerpt) ? quote("ENGELLENENİN SON MESAJLARI", str(r.excerpt)) : null));
  }

  // ── ad değişikliği
  if (type === "name_change") {
    out.push(sec("TALEP", dl([
      ["MEVCUT AD", str(r.currentName) || "—"], ["İSTENEN AD", str(r.requestedName) || "?"],
      ["KARAR", r.decision === "approved" ? "Onaylandı" : r.decision === "rejected" ? "Reddedildi" : "Bekliyor"],
    ]), quote("NEDEN", str(r.reason) || str(r.message))));
  }

  // ── içerik
  const orig = r.originalFields && typeof r.originalFields === "object" ? Object.entries(r.originalFields).filter(([, v]) => typeof v === "string" && v) : [];
  const origMsgs = r.originalMessages && typeof r.originalMessages === "object" ? Object.values(r.originalMessages).filter((v) => typeof v === "string" && v) : [];
  if (type !== "name_change") {
    out.push(sec("İÇERİK",
      quote("DOĞRULANAN İÇERİK (SUNUCU)", str(r.verifiedExcerpt), { tone: "ok" }),
      type !== "block" ? quote(serverKind ? "ALINTI" : "BİLDİRENİN ALINTISI (DOĞRULANMADI)", str(r.excerpt)) : null,
      orig.length ? quote("ORİJİNAL METİN (KALDIRILAN / MASKELENEN)", null, { list: orig.map(([k, v]) => `${k}: ${v}`) }) : null,
      origMsgs.length ? quote(`KALDIRILAN MESAJLAR (${origMsgs.length})`, null, { list: origMsgs.slice(0, 20) }) : null,
      type === "auto_filter" ? dl([
        ["KATEGORİ", CATEGORY[str(r.category)] || str(r.category)],
        ["EŞLEŞEN İFADELER", strs(r.matchedTerms).join(", ")],
        ["OTOMATİK İŞLEM", r.action === "hidden" ? "Gizlendi" : r.action === "masked" ? "Maskelendi" : ""],
      ]) : null,
      dl([["SEBEP", type !== "block" ? (REASON[str(r.reason)] || str(r.reason)) : ""]])));
    out.push(sec(serverKind ? "SİSTEM NOTU" : "BİLDİRENİN İFADESİ",
      quote(str(r.subject) && str(r.subject) !== reportTitle(r) ? str(r.subject).toLocaleUpperCase("tr-TR") : "MESAJ", str(r.message))));
  }

  // ── moderasyon durumu
  const actions = Array.isArray(r.actions) ? r.actions.filter((a) => a && typeof a === "object") : [];
  const byLabel = (uid) => {
    if (!uid) return "";
    if (uid === me) return "Sen";
    const a = actions.find((x) => x.by === uid && x.byEmail);
    return a ? a.byEmail : short(uid);
  };
  out.push(sec("MODERASYON", dl([
    ["DURUM", str(r.status) === "resolved" ? tag("ÇÖZÜLDÜ", GREEN) : tag("AÇIK", AMBER)],
    ["FARKLI BİLDİREN", people != null ? String(people) : ""],
    ["OTOMATİK GİZLENDİ", r.autoHidden === true ? "Evet" : ""],
    ["SON İŞLEM", str(r.lastAction) ? `${ACTION[str(r.lastAction)] || str(r.lastAction)}${r.lastActionAt ? ` · ${fmtDateTime(r.lastActionAt)}` : ""}` : ""],
    ["SONUÇ", RESOLUTION[str(r.resolution)] || str(r.resolution)],
    ["ÇÖZEN", byLabel(str(r.resolvedBy))],
    ["ÇÖZÜLME", fmtDateTime(r.resolvedAt)],
    ["YASAKLANAN", str(r.bannedUid) ? mono(str(r.bannedUid)) : ""],
    ["E-POSTA UYARISI", ALERT[str(r.alertStatus)] || ""],
    ["KAYIT", mono(`reports/${r.id}`)],
  ])));

  // ── geçmiş (zaman çizelgesi)
  const ev = [];
  const add = (t, text, color) => { const m = toMs(t); if (m) ev.push({ m, text, color }); };
  add(r.createdAt, type === "block" ? "Engelleme bildirildi" : "Bildirim oluşturuldu", GREY);
  add(r.alertSentAt, "Geliştiriciye e-posta gönderildi", GREY);
  actions.forEach((a) => add(a.atMs, `${ACTION[a.action] || a.action}${a.byEmail ? ` · ${a.byEmail}` : ""}`, a.action === "banUser" || a.action === "removeContent" ? RED : GREEN));
  add(r.threadUserLastAt, "Kullanıcı son yanıtı", VIOLET);
  add(r.threadAdminLastAt, `${SUPPORT_NAME} son yanıtı`, VIOLET);
  add(r.threadUserReadAt, "Kullanıcı yanıtı okudu", VIOLET);
  if (!actions.length || str(r.resolution) === "no_action") add(r.resolvedAt, `Çözüldü${str(r.resolution) === "no_action" ? " (işlem gerekmedi)" : ""}`, GREEN);
  ev.sort((a, b) => a.m - b.m);
  if (ev.length) {
    out.push(sec("GEÇMİŞ", h("ol", { class: "dk-admin-panel-tl" }, ...ev.map((e) =>
      h("li", {}, h("span", { class: "dk-admin-panel-tldot", style: { background: e.color } }),
        h("span", { class: "dk-admin-panel-tlt" }, e.text), h("span", { class: "dk-admin-panel-tld" }, fmtDateTime(e.m)))))));
  }
  return out.filter(Boolean);
}
// ══════════ DESTEK YAZIŞMASI ══════════
/**
 * Canlı yazışma bileşeni (rapor başına bir örnek; admin.js seçim değişene kadar AYNI düğümü yeniden kullanır → yazılan metin,
 * odak ve kaydırma yeniden çizimde korunur).
 * @param {{ rid: string, me: string, report: object, onError?: (msg: string) => void, onSent?: () => void }} o
 */
export function threadWidget({ rid, me, report, onError, onSent }) {
  let r = report;
  let msgs = null;
  let failed = false;
  let sending = false;
  let stick = true;               // en altta mı (yeni mesajda aşağı kaydır)
  let lastTop = 0;
  const ok = supportable(r);
  const who = () => str(r.reporterName) || "Kullanıcı";

  const log = h("div", { class: "dk-admin-panel-tlog", role: "log", "aria-live": "polite", "aria-label": "Yazışma mesajları", tabindex: "0" });
  log.addEventListener("scroll", () => { lastTop = log.scrollTop; stick = log.scrollHeight - log.scrollTop - log.clientHeight < 24; }, { passive: true });
  const ta = h("textarea", {
    class: "dk-ta dk-in dk-inp-bg-stratum dk-admin-panel-tin", rows: 3, maxlength: MAX_TEXT,
    placeholder: `${SUPPORT_NAME} olarak yanıt yaz…`, "aria-label": `${SUPPORT_NAME} olarak yanıt yaz`, dataset: { f: `thread:${rid}|reply` },
  });
  const cnt = h("span", { class: "dk-admin-panel-tcnt", "aria-hidden": "true" }, `0/${MAX_TEXT}`);
  const sendBtn = h("button", { type: "button", class: "dk-admin-panel-dok dk-press dk-admin-panel-tsend", dataset: { f: `thread:${rid}|send` } },
    svgIcon("send", { size: 16 }), h("span", {}, "Gönder"));
  const err = h("p", { class: "dk-admin-panel-terr", role: "alert" });
  const sync = () => {
    const n = ta.value.length; cnt.textContent = `${n}/${MAX_TEXT}`;
    const can = !!ta.value.trim() && !sending;
    sendBtn.setAttribute("aria-disabled", can ? "false" : "true");
    sendBtn.setAttribute("aria-busy", sending ? "true" : "false");
  };
  ta.addEventListener("input", () => { err.textContent = ""; sync(); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
  sendBtn.addEventListener("click", (e) => { e.stopPropagation(); send(); });
  async function send() {
    const text = ta.value.trim().slice(0, MAX_TEXT);
    if (!text || sending) return;
    sending = true; sync();
    try {
      // Kural: from 'admin' + isAdmin(), authorUid == auth.uid, createdAt sunucu zamanı, 1..2000 (functions/support.js bildirimi atar)
      await addDoc(collection(db, "reports", rid, "thread"), { from: "admin", text, createdAt: serverTimestamp(), authorUid: me });
      ta.value = ""; stick = true;
      onSent?.();
    } catch (e) {
      console.error(e);
      err.textContent = "Gönderilemedi. Bağlantını kontrol edip tekrar dene.";
      onError?.("Mesaj gönderilemedi");
    } finally { sending = false; sync(); }
  }
  sync();

  const head = h("div", { class: "dk-admin-panel-thead2" },
    h("h3", { class: "dk-admin-panel-sech" }, "DESTEK YAZIŞMASI"),
    h("span", { class: "dk-admin-panel-tsub" }, ok ? `Kullanıcı seni “${SUPPORT_NAME}” olarak görür; yanıtın push bildirimiyle iletilir.` : ""));
  const compose = ok ? h("div", { class: "dk-admin-panel-tcomp" }, ta, h("div", { class: "dk-admin-panel-trow" }, cnt, h("span", { class: "dk-admin-panel-thint" }, "⌘/Ctrl + Enter"), sendBtn), err) : null;
  const node = h("section", { class: "dk-admin-panel-thread", "aria-label": "Destek yazışması" }, head, log, compose);

  function draw() {
    if (!ok) {
      log.replaceChildren(h("p", { class: "dk-admin-panel-tempty" },
        str(r.reporterType) === "guest"
          ? "Misafir (anonim) bildirimi: kalıcı bir hesap olmadığı için yanıt iletilemez."
          : "Sistem kaydı (otomatik moderasyon): yazışılacak bir bildiren yok."));
      return;
    }
    if (failed) { log.replaceChildren(h("p", { class: "dk-admin-panel-tempty" }, "Yazışma yüklenemedi. Sayfayı yenileyip tekrar dene.")); return; }
    if (!msgs) { log.replaceChildren(h("p", { class: "dk-admin-panel-tempty" }, "Yükleniyor…")); return; }
    if (!msgs.length) {
      log.replaceChildren(h("p", { class: "dk-admin-panel-tempty" }, `Henüz mesaj yok. ${who()} kişisine ${SUPPORT_NAME} adıyla yazabilirsin; kullanıcı uygulamada Profil › Destek Yazışmalarım'dan yanıtlar.`));
      return;
    }
    let prevDay = "";
    const nodes = [];
    msgs.forEach((m) => {
      const t = toMs(m.createdAt) || Date.now();
      const d = new Date(t);
      const day = `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`;
      if (day !== prevDay) { nodes.push(h("div", { class: "dk-admin-panel-tday" }, h("span", {}, trUp(day)))); prevDay = day; }
      const admin = m.from === "admin";
      const name = admin ? `${SUPPORT_NAME}${m.authorUid === me ? " · sen" : ""}` : who();
      nodes.push(h("div", { class: cx("dk-admin-panel-tmsg", admin ? "is-admin" : "is-user") },
        h("span", { class: "dk-admin-panel-tname" }, name),
        h("div", { class: "dk-admin-panel-tb" }, m.text),
        h("span", { class: "dk-admin-panel-ttime" }, m.pending ? "Gönderiliyor…" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)));
    });
    log.replaceChildren(...nodes);
    restore();
  }
  function restore() {
    requestAnimationFrame(() => { if (!log.isConnected) return; log.scrollTop = stick ? log.scrollHeight : lastTop; });
  }

  let unsub = null;
  if (ok) {
    unsub = onSnapshot(query(collection(db, "reports", rid, "thread"), orderBy("createdAt", "asc")), { includeMetadataChanges: true }, (snap) => {
      failed = false;
      msgs = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }), pending: d.metadata.hasPendingWrites }));
      draw();
    }, (e) => { console.error(e); failed = true; draw(); });
  }
  draw();
  return {
    node, rid,
    setReport(next) { r = next || r; },
    /** admin.js yeniden çizimden sonra çağırır (düğüm DOM'da yer değiştirince kaydırma sıfırlanır) */
    restore,
    destroy() { try { unsub?.(); } catch (_) {} unsub = null; },
  };
}
