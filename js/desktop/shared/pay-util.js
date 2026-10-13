// ÖDEME — saf yardımcılar (içe aktarma YOK → node ile test edilebilir; masaüstü, legacy mobil ve panel kabuğu ortak kullanır).
// Uygulamadaki src/services/payments.ts + paymentCases.ts ile birebir: tutar biçimi, ön hesap (tahmini net), durum etiketleri,
// IBAN biçim/mod-97, hizmet kapsamı, şikayet etiketleri, bildirim → web rotası. Sunucu: functions/payments.js + paymentCases.js.

/** Varsayılan oranlar (config/payments varsayılanı) — yalnız ÖDEME ÖNCESİ tahmini gösterim için. */
export const DEFAULT_RATES = { artist_booking: 0.2, venue_rental: 0.1, stopajRate: 0.01, vatRate: 0.2 };

const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const s = (v) => (typeof v === "string" ? v : "");

/** payments/{oid} → görünüm (uygulama toPayment ile aynı alanlar + partyUids). */
export function toPayment(id, x) {
  return {
    id,
    kind: x?.kind === "venue_rental" ? "venue_rental" : "artist_booking",
    refId: s(x?.refId),
    eventId: typeof x?.eventId === "string" ? x.eventId : null,
    title: s(x?.title),
    status: typeof x?.status === "string" ? x.status : "pending",
    payerUid: x?.payerUid ?? "",
    payerOwnerUid: x?.payerOwnerUid ?? undefined,
    payerName: s(x?.payerName),
    payeeUid: x?.payeeUid ?? "",
    payeeName: s(x?.payeeName),
    grossKurus: num(x?.grossKurus),
    commissionRate: num(x?.commissionRate),
    commissionKurus: num(x?.commissionKurus),
    stopajKurus: num(x?.stopajKurus),
    payeeKurus: num(x?.payeeKurus),
    refundedKurus: num(x?.refundedKurus),
    testMode: x?.testMode === true,
    eventStartMs: typeof x?.eventStartMs === "number" ? x.eventStartMs : null,
    eventEndMs: typeof x?.eventEndMs === "number" ? x.eventEndMs : null,
    releaseAfterMs: typeof x?.releaseAfterMs === "number" ? x.releaseAfterMs : null,
    createdAt: ms(x?.createdAt),
    paidAt: ms(x?.paidAt),
    transferredAt: ms(x?.transferredAt),
    dispute: x?.dispute && typeof x.dispute.status === "string"
      ? { status: x.dispute.status, reason: String(x.dispute.category ?? x.dispute.reason ?? ""), decision: typeof x.dispute.decision === "string" ? x.dispute.decision : null }
      : null,
    cancellation: x?.cancellation && typeof x.cancellation.status === "string"
      ? { status: x.cancellation.status, reason: typeof x.cancellation.reason === "string" ? x.cancellation.reason : "" }
      : null,
    payerType: s(x?.payerType),
    payeeType: s(x?.payeeType),
  };
}

/** "₺1.234,50" (tam lirada kuruş yok) */
export function fmtKurus(k) {
  const n = Math.round(Number(k) || 0);
  const tl = n / 100;
  return `₺${tl.toLocaleString("tr-TR", { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Sunucudaki computeSplit ile aynı formül (varsayılan matrah: brüt / (1 + KDV)) — ödeme öncesi tahmini net için. */
export function previewSplit(grossTL, kind) {
  const gross = Math.round((Number(grossTL) || 0) * 100);
  const rate = DEFAULT_RATES[kind] ?? DEFAULT_RATES.artist_booking;
  const commissionKurus = Math.round(gross * rate);
  const stopajKurus = Math.round(Math.round(gross / (1 + DEFAULT_RATES.vatRate)) * DEFAULT_RATES.stopajRate);
  return { grossKurus: gross, commissionRate: rate, commissionKurus, stopajKurus, payeeKurus: Math.max(0, gross - commissionKurus - stopajKurus) };
}

// Ton renkleri (uygulama PaymentCards TONE): warn #FFB347 · ok #7CE0B0 · info #4ED8FF · bad #FF5A6E · muted vapor
export const TONE_COLOR = { warn: "#FFB347", ok: "#7CE0B0", info: "#4ED8FF", bad: "#FF5A6E", muted: "#8A8E97" };

/** Ödeyen / alıcı için kısa durum etiketi + ton */
export function statusLabel(st, side) {
  switch (st) {
    case "pending": return { text: "ÖDEME BEKLİYOR", tone: "warn" };
    case "init_failed":
    case "failed": return { text: "ÖDEME TAMAMLANAMADI", tone: "bad" };
    case "held":
    case "release_ready": return { text: "ÖDENDİ · EMANETTE", tone: "ok" };
    case "disputed": return { text: "ŞİKAYET İNCELENİYOR", tone: "warn" };
    case "awaiting_iban": return { text: side === "payee" ? "IBAN BEKLENİYOR" : "ÖDENDİ · EMANETTE", tone: side === "payee" ? "warn" : "ok" };
    case "transfer_requested": return { text: "AKTARILIYOR", tone: "info" };
    case "transfer_failed": return { text: side === "payee" ? "AKTARIM BEKLİYOR" : "ÖDENDİ · EMANETTE", tone: side === "payee" ? "warn" : "ok" };
    case "transferred": return { text: side === "payee" ? "HESABINA AKTARILDI" : "TAMAMLANDI", tone: "ok" };
    case "refund_pending":
    case "refund_in_progress": return { text: "İADE İNCELENİYOR", tone: "warn" };
    case "refunded": return { text: "İADE EDİLDİ", tone: "muted" };
    case "partially_refunded": return { text: "KISMEN İADE", tone: "muted" };
    default: return { text: String(st || "").toLocaleUpperCase("tr-TR"), tone: "muted" };
  }
}

/** Para emanette mi (ödeyen için "ödendi") */
export const isPaidStatus = (st) => !["pending", "init_failed", "failed"].includes(st);
/** Ödeyen şikayeti hâlâ karar bekliyor mu (aktarım durur). */
export const disputeOpen = (p) => !!p?.dispute && !["resolved", "upheld", "rejected"].includes(p.dispute.status);
/** Alıcı özetinde "EMANETTE" sayılan durumlar */
export const HELD_STATES = ["held", "disputed", "awaiting_iban", "release_ready", "transfer_requested", "transfer_failed"];

/** Kullanıcının payments listesi (uygulama listenMyPayments filtresi + sıralaması) */
export function filterMyPayments(rows, uid) {
  const out = rows.filter((p) => p.status !== "init_failed" && !(p.status === "pending" && p.payeeUid === uid));
  out.sort((a, b) => (b.paidAt ?? b.createdAt ?? 0) - (a.paidAt ?? a.createdAt ?? 0));
  return out;
}
/** Alıcı özeti: { held, sent } kuruş */
export function earnedSummary(rows, uid) {
  let held = 0, sent = 0;
  (rows || []).filter((p) => p.payeeUid === uid).forEach((p) => {
    if (p.status === "transferred") sent += p.payeeKurus;
    else if (HELD_STATES.includes(p.status)) held += p.payeeKurus;
  });
  return { held, sent };
}

/** Ödeyen özeti (mekan / organizatör — Berkay 13 Eki "ÖDENEN"): kullanıcının ÖDEYEN tarafta olduğu (alıcısı olmadığı), ödemesi
 *  başarıyla alınmış kayıtlar. paid = brüt − iade (emanette + aktarılan + iade incelemesindekiler); refunded = iade edilen toplam;
 *  held / sent = paid'in emanette bekleyen / alıcıya aktarılmış kısmı; count = net tutarı > 0 olan ödeme sayısı. (kuruş) */
export function paidSummary(rows, uid) {
  let paid = 0, refunded = 0, held = 0, sent = 0, count = 0;
  (rows || []).filter((p) => p.payeeUid !== uid && p.status !== "pending" && isPaidStatus(p.status)).forEach((p) => {
    const gross = Math.max(0, p.grossKurus || 0);
    const ref = p.status === "refunded" ? gross : Math.min(gross, Math.max(0, p.refundedKurus || 0));
    const net = gross - ref;
    refunded += ref; paid += net;
    if (net > 0) { count += 1; if (p.status === "transferred") sent += net; else held += net; }
  });
  return { paid, refunded, held, sent, count };
}
/** Ödeyen GEÇMİŞ satırı durumu: Emanette / Aktarıldı / İade / İptal (genel statusLabel'dan yalnız ödeyen geçmişi için ayrışır). */
export function payerHistoryLabel(p) {
  const c = p?.cancellation?.status;
  switch (p?.status) {
    case "transferred": return { text: "ALICIYA AKTARILDI", tone: "ok" };
    case "refunded": return c === "accepted" || c === "payee_cancelled" ? { text: "İPTAL · İADE EDİLDİ", tone: "muted" } : { text: "İADE EDİLDİ", tone: "muted" };
    case "partially_refunded": return { text: "KISMEN İADE · EMANETTE", tone: "muted" };
    default: return statusLabel(p?.status, "payer");
  }
}

/** Etkinlik öncesi / şikayet penceresi (istemci saati — sunucu yeniden denetler) */
export function paymentWindow(p, now = Date.now()) {
  const beforeStart = p.eventStartMs != null && now < p.eventStartMs;
  const inWindow = p.eventStartMs != null && p.releaseAfterMs != null && now >= p.eventStartMs && now <= p.releaseAfterMs;
  return { beforeStart, inWindow, held: p.status === "held" };
}

// ── Ödeme bekleyenler (uygulama PaymentsScreen loadDue) ──
const isoYesterday = (now) => new Date(now - 24 * 3600 * 1000).toISOString().slice(0, 10);
/** kayıt uygun mu: tutar > 0, ödenmemiş/iade edilmemiş, ISO tarihi dünden önce değil */
export function dueEligible(x, amountTL, now = Date.now()) {
  if (!(amountTL > 0) || x?.paymentStatus === "paid" || x?.paymentStatus === "refunded") return false;
  const iso = typeof x?.eventDate === "string" ? x.eventDate : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso < isoYesterday(now)) return false;
  return true;
}
export const bookingTitle = (x) => `Sahne ücreti · ${x?.groupName || x?.artistName || "Sanatçı"}`;
export const rentalTitle = (x, withTitle = false) => `Mekan kiralama · ${x?.venueName || "Mekan"}${withTitle && x?.title ? ` · ${x.title}` : ""}`;

// ── IBAN (sunucu ayrıca mod-97 doğrular) ──
export const normalizeIbanInput = (raw) => String(raw || "").replace(/[\s-]+/g, "").toUpperCase();
export function isValidTrIban(raw) {
  const v = normalizeIbanInput(raw);
  if (!/^TR\d{24}$/.test(v)) return false;
  const re = v.slice(4) + v.slice(0, 4);
  const digits = re.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (let i = 0; i < digits.length; i += 7) r = Number(String(r) + digits.slice(i, i + 7)) % 97;
  return r === 1;
}
/** "TR33 0006 1005 ..." */
export const formatIbanInput = (raw) => normalizeIbanInput(raw).slice(0, 26).replace(/(.{4})/g, "$1 ").trim();

// ── Hizmet kapsamı (mekan kiralama) ──
export const SERVICE_OPTIONS = [
  { key: "sound", label: "Ses sistemi" },
  { key: "light", label: "Işık sistemi" },
  { key: "stage", label: "Sahne / DJ booth" },
  { key: "tech_staff", label: "Teknik personel" },
  { key: "security", label: "Güvenlik" },
  { key: "cleaning", label: "Temizlik" },
  { key: "bar_staff", label: "Bar / servis personeli" },
  { key: "catering", label: "İkram" },
  { key: "parking", label: "Otopark" },
  { key: "backstage", label: "Kulis / soyunma odası" },
  { key: "setup_time", label: "Kurulum / söküm süresi" },
];
export const serviceLabel = (k) => SERVICE_OPTIONS.find((o) => o.key === k)?.label ?? k;
/** venueRequests/{id}.serviceTerms → görünüm (eksik/bozuk alanlar güvenli varsayılan). */
export function toServiceTerms(x) {
  if (!x || typeof x !== "object") return null;
  return {
    startTime: s(x.startTime),
    endTime: s(x.endTime),
    capacity: Number(x.capacity) || 0,
    services: (Array.isArray(x.services) ? x.services : [])
      .filter((v) => v && typeof v.key === "string")
      .map((v) => ({ key: v.key, ...(typeof v.note === "string" && v.note ? { note: v.note } : {}) })),
    excluded: s(x.excluded),
    rules: s(x.rules),
    rentalFee: Number(x.rentalFee) || 0,
    version: Number(x.version) || 0,
  };
}
/** Mekan kabul sayfası tek satır özet: "{start}–{end} · {cap} kişi · {n} dahil hizmet|yalnız mekan" */
export function termsSummary(t) {
  if (!t) return "";
  const n = t.services?.length || 0;
  return `${t.startTime || "—"}–${t.endTime || "—"} · ${t.capacity ? `${Number(t.capacity).toLocaleString("tr-TR")} kişi` : "—"} · ${n ? `${n} dahil hizmet` : "yalnız mekan"}`;
}
/** Mekan isteği kabulünden önce kapsam gerekli mi (uygulama venue/HomeScreen needsTerms) */
export const needsTerms = (req) => (Number(req?.rentalFee) || 0) > 0 && !req?.serviceTerms;
/** Hizmet kapsamı formu doğrulaması (sunucu validateTerms ile aynı sıra) → hata metni | null */
export function validateTermsInput(t) {
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hm.test(t.startTime || "") || !hm.test(t.endTime || "")) return "Başlangıç ve bitiş saatini seç (aynı olamaz).";
  if (t.startTime === t.endTime) return "Başlangıç ve bitiş saatini seç (aynı olamaz).";
  const cap = Number(t.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100000) return "Kapasiteyi kişi sayısı olarak gir.";
  return null;
}

// ── Şikayet ──
export const EVIDENCE_TYPES = [
  { key: "photo", label: "Fotoğraf" },
  { key: "chat_screenshot", label: "WhatsApp yazışması" },
  { key: "other", label: "Diğer" },
];
export const evidenceTypeLabel = (t) => EVIDENCE_TYPES.find((e) => e.key === t)?.label ?? "Diğer";
export const DISPUTE_DESC_MIN = 30;
export const EVIDENCE_MAX = 10;
export const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;
export const DISPUTE_STATUS_LABEL = {
  awaiting_response: "KARŞI TARAFIN YANITI BEKLENİYOR",
  under_review: "GIGBRIDGE İNCELİYOR",
  resolved: "SONUÇLANDI",
};
export function decisionText(d, amountKurus) {
  if (d === "release") return "Ödeme alıcıya aktarılacak";
  if (d === "refund_full") return "Ödemenin tamamı iade edildi";
  return `${fmtKurus(amountKurus ?? 0)} kısmi iade edildi, kalan tutar alıcıya aktarılacak`;
}
/** Kanıt özeti: "3 görsel · 2 fotoğraf, 1 whatsapp yazışması" */
export function evidenceSummary(drafts) {
  const parts = ["photo", "chat_screenshot", "other"]
    .map((t) => [t, drafts.filter((x) => x.type === t).length])
    .filter(([, n]) => n > 0).map(([t, n]) => `${n} ${evidenceTypeLabel(t).toLocaleLowerCase("tr-TR")}`);
  return `${drafts.length} görsel · ${parts.join(", ")}`;
}
/** Storage kanıt yolu (storage.rules: dispute_evidence/{oid}/{uid}/{ts}_{n}.jpg — ts ≤16 hane, n ≤2 hane) */
export const evidencePath = (oid, uid, ts, i) => `dispute_evidence/${oid}/${uid}/${ts}_${i}.jpg`;
export const isOid = (v) => typeof v === "string" && /^[A-Za-z0-9]{1,64}$/.test(v);

// ── Admin ──
export const ADMIN_GROUPS = [
  { key: "sikayetler", label: "ŞİKAYETLER", statuses: [] },
  { key: "emanette", label: "EMANETTE", statuses: ["held", "partially_refunded"] },
  { key: "serbest", label: "SERBEST BIRAKILACAK", statuses: ["release_ready", "transfer_failed"] },
  { key: "iban", label: "IBAN BEKLEYEN", statuses: ["awaiting_iban"] },
  { key: "iade", label: "İADE · ŞİKAYET", statuses: ["refund_pending", "disputed", "refund_in_progress"] },
  { key: "aktarilan", label: "AKTARILAN", statuses: ["transfer_requested", "transferred"] },
  { key: "iadeedilen", label: "İADE EDİLEN", statuses: ["refunded"] },
];
export const ADMIN_REASON = {
  complaint_no_photos: "Fotoğraf eksik + şikayet", complaint_upheld: "Şikayet onaylandı", event_cancelled: "Etkinlik iptal",
  duplicate: "Çift ödeme", amount_mismatch: "Tutar uyuşmazlığı", admin_refund: "Admin kararı", complaint_open: "Açık şikayet",
  photos_ok: "Fotoğraflar tam", no_complaint: "Şikayet yok", complaint_rejected: "Şikayet reddedildi", admin_release: "Admin kararı",
  attendance_verified: "Giriş-çıkış kaydı tam (iade yok)", dispute_released: "Şikayet: alıcıya aktar",
};
export const ADMIN_DISPUTE_STATUS = {
  awaiting_response: "yanıt bekleniyor", under_review: "incelemede", resolved: "sonuçlandı", open: "açık", upheld: "onaylandı", rejected: "reddedildi",
};
export const ADMIN_CANCEL_STATUS = {
  requested: "İptal talebi bekliyor", accepted: "İptal kabul edildi", rejected: "İptal talebi reddedildi", payee_cancelled: "Alıcı iptal etti",
};
export const REFUNDABLE = ["held", "disputed", "release_ready", "awaiting_iban", "transfer_failed", "refund_pending", "partially_refunded"];
export const RELEASABLE = ["held", "release_ready", "awaiting_iban", "transfer_failed", "partially_refunded", "disputed", "refund_pending"];
/** elle serbest bırakma sonucu → hata metni (null = başarılı "Aktarım istendi") */
export function releaseResultError(result) {
  if (result === "awaiting_iban") return "Alıcının IBAN bilgisi yok; bildirim gönderildi.";
  if (result === "same_day") return "Ödeme bugün alındı; aktarım yarın sabah otomatik yapılacak.";
  if (result === "failed" || result === "uncertain") return "PayTR transfer isteği başarısız. Ayrıntı satırda.";
  return null;
}
/** "12,5" → 1250 kuruş (geçersiz → NaN) */
export const parseTLToKurus = (v) => Math.round(parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")) * 100);

// ── Callable hata iletisi (sunucu Türkçe ileti döndürür) ──
export function paymentErrorText(e) {
  const msg = e?.message;
  const code = String(e?.code ?? "");
  if (code.endsWith("unavailable") || code.endsWith("deadline-exceeded") || code.endsWith("internal")) {
    return typeof msg === "string" && msg && !/^internal$/i.test(msg) ? msg : "Bağlantı kurulamadı. Biraz sonra tekrar dene.";
  }
  return typeof msg === "string" && msg ? msg : "İşlem tamamlanamadı. Tekrar dene.";
}

// ── Rotalar ──
export const PAY_ROLES = ["artist", "venue", "organizer"];
export const paymentsHref = (role, q = "") => (PAY_ROLES.includes(role) ? `#/${role}/odemeler${q ? "?" + q : ""}` : null);
export const PAYMENT_NOTIF_TYPES = ["booking_paid", "payment_received", "payout_transferred", "payout_iban_needed", "payment_refunded",
  "dispute_opened", "dispute_resolved", "cancellation_requested", "cancellation_update", "booking_cancelled"];
/** Ödeme bildirimi → web rotası (uygulama notificationRoutes.ts 278-296 karşılığı) | null (ödeme bildirimi değil) */
export function paymentNotifHref(n, role) {
  const t = String(n?.type || "");
  if (!PAY_ROLES.includes(role)) return null;
  if (t === "invitation_update" && role === "organizer" && (n.outcome === "accepted" || n.status === "accepted")) return paymentsHref(role);
  if (!PAYMENT_NOTIF_TYPES.includes(t)) return null;
  if (t === "payout_iban_needed") return role === "organizer" ? paymentsHref(role) : paymentsHref(role, "bolum=iban");
  if ((t === "dispute_opened" || t === "dispute_resolved") && isOid(n.paymentId)) return paymentsHref(role, "sikayet=" + n.paymentId);
  return paymentsHref(role);
}

// ── PayTR sonuç sayfası mesajı (odeme-sonuc.html → web ödeme penceresi) ──
export const PAYTR_MSG = "paytr";
export const PAYTR_ORIGINS = ["https://gigbridges.com", "https://www.gigbridges.com"];
/** postMessage kaynağı güvenilir mi: aynı köken, gigbridges.com ya da yerel geliştirme (127.0.0.1 / localhost) */
export function trustedResultOrigin(origin, selfOrigin) {
  if (!origin) return false;
  if (origin === selfOrigin) return true;
  if (PAYTR_ORIGINS.includes(origin)) return true;
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin) && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(selfOrigin || "");
}
/** Ödeme penceresi aşaması: ödeme kaydı + sonuç sayfası durumundan (uygulama PaytrCheckout ile aynı kurallar) */
export function checkoutPhase(prev, { status, durum } = {}) {
  if (status && isPaidStatus(status)) return "success";
  if (status === "failed" && prev !== "paying") return "failed";
  if (durum === "fail") return "failed";
  if (durum === "ok" || durum === "") return prev === "success" ? prev : "confirming";
  return prev;
}
