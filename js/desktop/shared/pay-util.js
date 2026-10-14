// ÖDEME — saf yardımcılar (içe aktarma YOK → node ile test edilebilir; masaüstü, legacy mobil ve panel kabuğu ortak kullanır).
// Uygulamadaki src/services/payments.ts + paymentCases.ts ile birebir: tutar biçimi, ön hesap (tahmini net), durum etiketleri,
// IBAN biçim/mod-97, hizmet kapsamı, şikayet etiketleri, bildirim → web rotası. Sunucu: functions/payments.js + paymentCases.js.

/** Varsayılan oranlar (publicConfig/payments yoksa — sunucu varsayılanıyla aynı) — yalnız ÖDEME ÖNCESİ tahmini gösterim için.
 *  Finans v2: komisyon KDV hariç (+ %20 KDV), tahmini stopaj %20 (kesin oran mali müşavir onaylı kurala göre sunucuda). */
export const DEFAULT_RATES = Object.freeze({
  artistCommissionRate: 0.1, venueCommissionRate: 0.1, commissionVatRate: 0.2, commissionVatIncluded: false,
  artistCommissionBorneBy: "payee", venueCommissionBorneBy: "payee", estimateStopajRate: 0.2,
  paytrFeeRate: 0, paytrFeeBorneBy: "payee",
});
let RATES = { ...DEFAULT_RATES };
const rate01 = (v, max, d) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : d);
const borne = (v, d) => (v === "payer" || v === "payee" ? v : d);
/** publicConfig/payments → önbellek (payments.js loadPayRates çağırır; bozuk alan varsayılana düşer). */
export function setPayRates(r) {
  const x = r && typeof r === "object" ? r : {};
  RATES = {
    artistCommissionRate: rate01(x.artistCommissionRate, 0.5, DEFAULT_RATES.artistCommissionRate),
    venueCommissionRate: rate01(x.venueCommissionRate, 0.5, DEFAULT_RATES.venueCommissionRate),
    commissionVatRate: rate01(x.commissionVatRate, 0.5, DEFAULT_RATES.commissionVatRate),
    commissionVatIncluded: x.commissionVatIncluded === true,
    artistCommissionBorneBy: borne(x.artistCommissionBorneBy, DEFAULT_RATES.artistCommissionBorneBy),
    venueCommissionBorneBy: borne(x.venueCommissionBorneBy, DEFAULT_RATES.venueCommissionBorneBy),
    estimateStopajRate: rate01(x.estimateStopajRate, 0.5, DEFAULT_RATES.estimateStopajRate),
    paytrFeeRate: rate01(x.paytrFeeRate, 0.1, DEFAULT_RATES.paytrFeeRate),
    paytrFeeBorneBy: x.paytrFeeBorneBy === "platform" ? "platform" : "payee",
  };
  return RATES;
}
export const getPayRates = () => RATES;

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
    // ── Finans v2 (fv:2; eski kayıtta yok → güvenli varsayılan) ──
    fv: x?.fv === 2 ? 2 : 1,
    chargeKurus: num(x?.chargeKurus) || num(x?.grossKurus),
    commissionVatRate: num(x?.commissionVatRate),
    commissionVatKurus: num(x?.commissionVatKurus),
    commissionVatIncluded: x?.commissionVatIncluded === true,
    platformTakeKurus: num(x?.platformTakeKurus),
    commissionBorneBy: x?.commissionBorneBy === "payer" ? "payer" : "payee",
    paytrFeeKurus: num(x?.paytrFeeKurus),
    paytrFeeBorneBy: x?.paytrFeeBorneBy === "platform" ? "platform" : "payee",
    withholdings: Array.isArray(x?.withholdings) ? x.withholdings.filter((w) => w && typeof w === "object").map((w) => ({
      type: s(w.type), title: s(w.title), rate: typeof w.rate === "number" ? w.rate : null, base: s(w.base),
      baseKurus: num(w.baseKurus), amountKurus: num(w.amountKurus), responsible: s(w.responsible),
    })) : [],
    financeStatus: typeof x?.financeStatus === "string" ? x.financeStatus : null,
    financeReasons: Array.isArray(x?.financeReasons) ? x.financeReasons.filter((r) => typeof r === "string") : [],
    payerRefundDueKurus: num(x?.payerRefundDueKurus),
    documents: x?.documents && typeof x.documents === "object" ? {
      commissionInvoice: x.documents.commissionInvoice && typeof x.documents.commissionInvoice === "object" ? { ...x.documents.commissionInvoice } : null,
      service: x.documents.service && typeof x.documents.service === "object" ? { ...x.documents.service } : null,
    } : { commissionInvoice: null, service: null },
    payoutParts: Array.isArray(x?.payoutParts) ? x.payoutParts.filter((v) => v && typeof v === "object").map((v) => ({
      uid: s(v.uid), name: s(v.name), percent: num(v.percent), amountKurus: num(v.amountKurus), status: s(v.status) })) : [],
  };
}

/** "₺1.234,50" (tam lirada kuruş yok) */
export function fmtKurus(k) {
  const n = Math.round(Number(k) || 0);
  const tl = n / 100;
  return `₺${tl.toLocaleString("tr-TR", { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
/** Tahmini tutar: tam liraya yuvarlanmış "≈" gösterimi (kuruş hassasiyeti yanıltıcı). */
export const fmtApproxKurus = (k) => fmtKurus(Math.round((Number(k) || 0) / 100) * 100);

/**
 * Ödeme öncesi TAHMİN (Finans v2 sözleşmesi; kuruş tamsayı, her adım Math.round — uygulama previewSplit ile aynı):
 *   komisyon (KDV hariç) + komisyon KDV'si (KDV dahil ayarında içinden ayrılır) + includeTaxes ise tahmini stopaj (brüt × oran).
 *   Komisyonu alıcı karşılıyorsa (varsayılan) alıcının payından düşer. Kesin kesinti sunucuda onaylı kurala göre hesaplanır.
 */
export function previewSplit(grossTL, kind, { includeTaxes = true } = {}) {
  const g = Math.max(0, Math.round((Number(grossTL) || 0) * 100));
  const R = RATES;
  const cr = kind === "venue_rental" ? R.venueCommissionRate : R.artistCommissionRate;
  const v = R.commissionVatRate;
  let commission, vat;
  if (!R.commissionVatIncluded) { commission = Math.round(g * cr); vat = Math.round(commission * v); }
  else { const take0 = Math.round(g * cr); vat = Math.round((take0 * v) / (1 + v)); commission = take0 - vat; }
  const take = commission + vat;
  const borneBy = kind === "venue_rental" ? R.venueCommissionBorneBy : R.artistCommissionBorneBy;
  const stopajEst = includeTaxes ? Math.round(g * R.estimateStopajRate) : 0;
  // PayTR masrafı tahsilat üzerinden; 'payee' → alıcının payından düşer (sunucu finance.js computeSplitV2 ile aynı)
  const charge = g + (borneBy === "payer" ? take : 0);
  const fee = R.paytrFeeBorneBy !== "platform" ? Math.round(charge * (R.paytrFeeRate || 0)) : 0;
  return {
    grossKurus: g, commissionRate: cr, commissionKurus: commission, commissionVatRate: v, commissionVatKurus: vat,
    platformTakeKurus: take, commissionBorneBy: borneBy, stopajKurus: stopajEst, estimateStopajRate: R.estimateStopajRate,
    chargeKurus: charge, paytrFeeKurus: fee,
    payeeKurus: Math.max(0, g - (borneBy === "payee" ? take : 0) - stopajEst - fee),
  };
}
/** "%10 komisyon + KDV" — oran metni (güncel publicConfig'e göre). */
export const commissionText = (kind = "artist_booking") =>
  `%${Math.round((kind === "venue_rental" ? RATES.venueCommissionRate : RATES.artistCommissionRate) * 1000) / 10} komisyon + KDV`
  + (RATES.paytrFeeRate > 0 && RATES.paytrFeeBorneBy !== "platform" ? ` + %${Math.round(RATES.paytrFeeRate * 10000) / 100} PayTR masrafı` : "");
/** Tahmin altındaki kısa not (uygulamayla aynı metin). */
export const ESTIMATE_NOTE = "Vergi kesintisi (stopaj) mali müşavir onaylı kurala göre kesinleşir.";

// ── Finans v2 ödeme kaydı yardımcıları ──
export const WITHHOLDING_LABEL = { serbest_meslek_stopaj: "Serbest meslek stopajı", eticaret_tevkifat: "E-ticaret vergi tevkifatı", no_withholding: "Kesinti yok" };
export const withholdingTitle = (w) => (w?.title && String(w.title)) || WITHHOLDING_LABEL[w?.type] || "Vergi kesintisi";
/** Kesinti satırı etiketi: "Serbest meslek stopajı (%20)" */
export const withholdingLine = (w) => `${withholdingTitle(w)}${typeof w?.rate === "number" ? ` (%${Math.round(w.rate * 1000) / 10})` : ""}`;
/** Hizmet belgesi türleri (submitPaymentDocument docType) */
export const DOC_TYPES = [
  { key: "e_fatura", label: "e-Fatura" },
  { key: "e_arsiv", label: "e-Arşiv Fatura" },
  { key: "e_smm", label: "e-Serbest Meslek Makbuzu" },
  { key: "gider_pusulasi", label: "Gider Pusulası" },
  { key: "banka_belgesi", label: "Banka/Ödeme Kuruluşu Belgesi" },
  { key: "paytr_kaydi", label: "PayTR İşlem Kaydı" },
];
export const docTypeLabel = (k) => DOC_TYPES.find((d) => d.key === k)?.label ?? (k || "—");
export const DOC_STATUS_LABEL = { submitted: "İNCELEMEDE", verified: "ONAYLANDI", rejected: "REDDEDİLDİ", issued: "DÜZENLENDİ", cancelled: "İPTAL" };
export const DOC_STATUS_TONE = { submitted: "warn", verified: "ok", rejected: "bad", issued: "ok", cancelled: "muted" };
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_MIME = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
/** Storage hizmet belgesi yolu (storage.rules: payment_docs/{uid}/{dosya}) */
export const paymentDocPath = (uid, oid, ts, ext) => `payment_docs/${uid}/${oid}_${ts}.${ext}`;
export const FINANCE_STATUS_LABEL = { auto: "Otomatik", review: "İnceleme", cleared: "Onaylandı" };
export const FINANCE_REASON_LABEL = {
  payee_tax_missing: "Alıcının vergi bilgisi yok", payee_tax_unverified: "Alıcının vergi bilgisi doğrulanmadı",
  payer_tax_missing: "Ödeyenin vergi bilgisi yok", payer_tax_unverified: "Ödeyenin vergi bilgisi doğrulanmadı",
  no_approved_rule: "Onaylı vergi kuralı yok", rules_conflict: "Kurallar çakışıyor", rules_changed: "Kurallar değişti",
  group_single_iban: "Grup tek IBAN'a (pay dağılımı yok)", group_member_tax: "Grup üyesinin vergi bilgisi eksik",
  group_member_iban: "Grup üyesinin IBAN'ı eksik", document_missing: "Hizmet belgesi eksik", payer_refund_due: "Ödeyene vergi iadesi gerekli",
};
export const financeReasonText = (r) => FINANCE_REASON_LABEL[r] ?? r;
/**
 * Ödeme kaydı → alıcı dökümü satırları [{ label, kurus, sign: -1|0|1, strong? }]. fv:2 → komisyon, komisyon KDV'si, her kesinti,
 * "Size kalan"; eski kayıt (fv yok) → eski üç satır (komisyon + stopaj) aynen.
 */
export function payeeBreakdown(p) {
  if (!p) return [];
  const gross = p.grossKurus || 0;
  if (p.fv !== 2) {
    return [
      { label: "Ücret", kurus: gross, sign: 0 },
      { label: `GigBridge komisyonu (%${Math.round((p.commissionRate || 0) * 100)})`, kurus: p.commissionKurus || 0, sign: -1 },
      { label: "Stopaj", kurus: p.stopajKurus || 0, sign: -1 },
      { label: "Size kalan", kurus: p.payeeKurus || 0, sign: 0, strong: true },
    ];
  }
  const out = [{ label: "Ücret", kurus: gross, sign: 0 }];
  const payeeBears = p.commissionBorneBy !== "payer";
  out.push({ label: `Komisyon (%${Math.round((p.commissionRate || 0) * 1000) / 10})${payeeBears ? "" : " · ödeyen karşılar"}`, kurus: p.commissionKurus || 0, sign: payeeBears ? -1 : 0 });
  out.push({ label: `Komisyon KDV (%${Math.round((p.commissionVatRate || 0) * 1000) / 10})${payeeBears ? "" : " · ödeyen karşılar"}`, kurus: p.commissionVatKurus || 0, sign: payeeBears ? -1 : 0 });
  (p.withholdings || []).filter((w) => (w.amountKurus || 0) > 0).forEach((w) => out.push({ label: withholdingLine(w), kurus: w.amountKurus, sign: -1 }));
  if ((p.paytrFeeKurus || 0) > 0 && p.paytrFeeBorneBy !== "platform") out.push({ label: "PayTR ödeme masrafı", kurus: p.paytrFeeKurus, sign: -1 });
  out.push({ label: "Size kalan", kurus: p.payeeKurus || 0, sign: 0, strong: true });
  return out;
}
/** Tek satırlık özet (geçmiş listesi): "Ücret ₺X · komisyon ₺Y · KDV ₺Z · vergi kesintisi ₺W" (eski kayıt: "… · stopaj ₺W") */
export function payeeBreakdownText(p) {
  if (p?.fv !== 2) return `Ücret ${fmtKurus(p.grossKurus)} · komisyon ${fmtKurus(p.commissionKurus)} · stopaj ${fmtKurus(p.stopajKurus)}`;
  const parts = [`Ücret ${fmtKurus(p.grossKurus)}`];
  if (p.commissionBorneBy !== "payer") parts.push(`komisyon ${fmtKurus(p.commissionKurus)}`, `KDV ${fmtKurus(p.commissionVatKurus)}`);
  if (p.stopajKurus > 0) parts.push(`vergi kesintisi ${fmtKurus(p.stopajKurus)}`);
  return parts.join(" · ");
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
    case "finance_review": return { text: side === "payee" ? "FİNANSAL İNCELEME BEKLİYOR" : "ÖDENDİ · EMANETTE", tone: side === "payee" ? "warn" : "ok" };
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
export const HELD_STATES = ["held", "disputed", "awaiting_iban", "release_ready", "transfer_requested", "transfer_failed", "finance_review"];
/** Durum metni (tam cümle; uygulama STATUS_TEXT) */
export const FINANCE_REVIEW_LABEL = "Finansal İnceleme Bekliyor";

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
    const gross = Math.max(0, p.chargeKurus || p.grossKurus || 0);   // fv:2: ödeyenden çekilen (komisyonu ödeyen karşılıyorsa brüt + komisyon)
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
  { key: "emanette", label: "EMANETTE", statuses: ["held", "partially_refunded", "finance_review"] },
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
export const REFUNDABLE = ["held", "disputed", "release_ready", "awaiting_iban", "transfer_failed", "refund_pending", "partially_refunded", "finance_review"];
export const RELEASABLE = ["held", "release_ready", "awaiting_iban", "transfer_failed", "partially_refunded", "disputed", "refund_pending", "finance_review"];
/** elle serbest bırakma sonucu → hata metni (null = başarılı "Aktarım istendi") */
export function releaseResultError(result) {
  if (result === "awaiting_iban") return "Alıcının IBAN bilgisi yok; bildirim gönderildi.";
  if (result === "same_day") return "Ödeme bugün alındı; aktarım yarın sabah otomatik yapılacak.";
  if (result === "failed" || result === "uncertain") return "PayTR transfer isteği başarısız. Ayrıntı satırda.";
  if (result === "finance_review") return "Ödeme finansal incelemeye alındı (vergi/belge koşulu karşılanmadı). Admin › Finans'tan karar ver.";
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

/**
 * NET → BRÜT (uygulama services/payments.ts grossForNet ile AYNI): sanatçının cebine girmesini istediği tutardan mekanın
 * göreceği fiyat (tam TL'ye yukarı). includeTaxes true → komisyon + KDV + tahmini stopaj üstüne; false → yalnız komisyon + KDV.
 * Başlangıç: net / faktör (ör. 1 − 0,10 − 0,02 − 0,20 = 0,68) yukarı yuvarlanır; sonra kuruş yuvarlamasına karşı düzeltme döngüsü
 * (tahmini net hedefi tam karşılayan EN KÜÇÜK tam TL). 15.000 → ✓ 22.059 · ☐ 17.046.
 */
export function grossForNet(netTL, includeTaxes = true) {
  const net = Math.max(0, Number(netTL) || 0);
  if (!net) return 0;
  const target = Math.round(net * 100);
  const got = (x) => previewSplit(x, "artist_booking", { includeTaxes }).payeeKurus;
  const R = RATES;
  const vatF = R.commissionVatIncluded ? 1 : 1 + R.commissionVatRate;
  const takeF = R.artistCommissionBorneBy === "payee" ? R.artistCommissionRate * vatF : 0;
  const feeF = R.paytrFeeBorneBy !== "platform" ? (R.paytrFeeRate || 0) * (1 + (R.artistCommissionBorneBy === "payer" ? R.artistCommissionRate * vatF : 0)) : 0;
  const factor = Math.max(0.05, 1 - takeF - feeF - (includeTaxes ? R.estimateStopajRate : 0));
  let g = Math.ceil(net / factor);
  for (let i = 0; i < 1000 && got(g) < target; i++) g += 1;
  for (let i = 0; i < 1000 && g > 1 && got(g - 1) >= target; i++) g -= 1;
  return g;
}
/** BRÜT → NET (tam TL'ye aşağı; tahmini). 10.000 ✓ → 6.800. */
export function netFromGross(grossTL, includeTaxes = true) {
  const g = Math.max(0, Number(grossTL) || 0);
  if (!g) return 0;
  return Math.floor(previewSplit(g, "artist_booking", { includeTaxes }).payeeKurus / 100);
}
