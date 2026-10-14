/**
 * Ödeme denetim kaydını (adminAudit kind 'payments' — functions/payments.js audit + finance.js) okunur Türkçe satırlara çevirir.
 * Saf modül (içe aktarma yok). Uygulamadaki eşi: src/services/auditView.ts — ikisi birlikte güncellenir.
 *   auditView(row) → { title, lines: string[], warn: string|null }
 */
const ACTIONS = {
  setConfig: "Ödeme ayarları değiştirildi",
  refund: "İade yapıldı",
  release: "Ödeme elle serbest bırakıldı",
  resolveDispute: "Şikayet karara bağlandı",
  approveCheckinPhotos: "Giriş-çıkış fotoğrafları onaylandı",
  financeDecide: "Finans kararı verildi",
  taxRefund: "Mekana vergi farkı iade edildi",
  saveRule: "Vergi kuralı taslağı kaydedildi",
  approveRule: "Vergi kuralı onaylandı",
  retireRule: "Vergi kuralı emekliye ayrıldı",
  verifyTaxProfile: "Vergi bilgileri incelendi",
  viewTaxProfile: "Vergi bilgileri görüntülendi",
  setDocumentStatus: "Belge durumu güncellendi",
  viewDocument: "Hizmet belgesi açıldı",
  exportFinance: "Finans raporu indirildi",
};
const CFG = {
  artistCommissionRate: ["Sanatçı kiralama komisyonu", "pct"],
  venueCommissionRate: ["Mekan kiralama komisyonu", "pct"],
  commissionVatRate: ["Komisyon KDV oranı", "pct"],
  commissionVatIncluded: ["KDV komisyonun içinde", "yesno"],
  artistCommissionBorneBy: ["Sanatçı kiralamada komisyonu ödeyen", "borne"],
  venueCommissionBorneBy: ["Mekan kiralamada komisyonu ödeyen", "borne"],
  estimateStopajRate: ["Ekrandaki tahmini stopaj", "pct"],
  paytrFeeRate: ["Tahmini PayTR masrafı", "pct"],
  stopajRate: ["Eski sabit stopaj (artık kullanılmıyor)", "pct"],
  vatRate: ["KDV oranı (matrah hesabı)", "pct"],
  stopajBase: ["Eski stopaj matrahı", "raw"],
  autoPayout: ["Otomatik aktarım", "onoff"],
  testMode: ["Test modu", "test"],
};
const DECISION = {
  refund_full: "Tam iade", refund_partial: "Kısmi iade", release: "Sanatçıya / mekana aktar", upheld: "Şikayet haklı (iade)",
  rejected: "Reddedildi", verified: "Doğrulandı",
};
const RESULT = {
  requested: "Aktarım istendi", finance_review: "Finansal incelemeye düştü", awaiting_iban: "Alıcının IBAN'ı bekleniyor",
  release_ready: "Elle aktarım bekliyor", same_day: "Ödeme günü aktarılamaz (ertesi gün)", busy: "Başka işlem sürüyor",
  failed: "Aktarım başarısız", uncertain: "Aktarım sonucu belirsiz (PayTR panelinden kontrol)", state: "Durum uygun değil", zero: "Aktarılacak tutar yok",
};
const STATUS = {
  held: "Emanette", disputed: "Şikayette", release_ready: "Aktarım bekliyor", awaiting_iban: "IBAN bekleniyor", transfer_failed: "Aktarım başarısız",
  refund_pending: "İade bekliyor", partially_refunded: "Kısmen iade", finance_review: "Finansal inceleme", transferred: "Aktarıldı", refunded: "İade edildi",
};
const WH = { serbest_meslek_stopaj: "Serbest meslek stopajı", eticaret_tevkifat: "E-ticaret tevkifatı", no_withholding: "Kesinti yok" };
const RESP = { payer: "ödeyen keser", platform: "GigBridge keser" };
const WHICH = { commissionInvoice: "Komisyon faturası", service: "Hizmet belgesi" };
const DOC_ST = { issued: "Düzenlendi", cancelled: "İptal", verified: "Onaylandı", rejected: "Reddedildi", submitted: "İncelemede" };

const pct = (v) => (typeof v === "number" ? `%${Math.round(v * 10000) / 100}` : "—");
const tl = (k) => (typeof k === "number" ? `₺${(Math.round(k) / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}` : "—");
const day = (ms) => (typeof ms === "number" && ms > 0 ? new Date(ms).toLocaleDateString("tr-TR") : "—");
function fmtCfg(kind, v) {
  if (v === undefined || v === null) return "—";
  switch (kind) {
    case "pct": return pct(v);
    case "yesno": return v ? "Evet" : "Hayır";
    case "onoff": return v ? "Açık" : "Kapalı";
    case "test": return v ? "Açık (test ödemesi)" : "Kapalı (GERÇEK ödeme)";
    case "borne": return v === "payer" ? "Ödeyen (üstüne eklenir)" : "Alıcı (hakedişten düşer)";
    default: return String(v);
  }
}
const whText = (w) => `${(w && (w.title || WH[w.type])) || "Kesinti"} ${pct(w && w.rate)}${w && RESP[w.responsible] ? ` (${RESP[w.responsible]})` : ""}`;

export function auditView(row) {
  const x = row || {};
  const title = ACTIONS[x.action] || String(x.action || "İşlem");
  const lines = [];
  let warn = null;
  if (x.action === "setConfig") {
    const after = x.after || {};
    const before = x.before || {};
    for (const k of Object.keys(after)) {
      const [label, kind] = CFG[k] || [k, "raw"];
      lines.push(`${label}: ${fmtCfg(kind, before[k])} → ${fmtCfg(kind, after[k])}`);
    }
    if (after.testMode === false) warn = "Test modu kapatıldı: ödemeler gerçek karttan çekilir.";
    if (after.testMode === true) warn = "Test modu açıldı: ödemeler test ödemesidir.";
    return { title, lines, warn };
  }
  const add = (label, v) => { if (v !== undefined && v !== null && v !== "") lines.push(`${label}: ${v}`); };
  add("Ödeme", x.merchantOid);
  if (x.decision) add("Karar", DECISION[x.decision] || x.decision);
  if (x.mode) add("Yöntem", x.mode === "manual" ? "Elle" : "Onaylı kurallara göre");
  if (Array.isArray(x.withholdings)) add("Kesintiler", x.withholdings.length ? x.withholdings.map(whText).join(", ") : "Kesinti yok");
  if (Array.isArray(x.ruleRefs) && x.ruleRefs.length) add("Uygulanan kurallar", x.ruleRefs.map((r) => `${WH[r.type] || r.type} v${r.version || 1}`).join(", "));
  if (typeof x.amountKurus === "number") add("Tutar", tl(x.amountKurus));
  if (x.full === true) add("Kapsam", "Tam iade");
  if (typeof x.prevPayeeKurus === "number") add("Önceki alıcı payı", tl(x.prevPayeeKurus));
  if (typeof x.payeeKurus === "number") add("Yeni alıcı payı", tl(x.payeeKurus));
  if (typeof x.payerRefundDueKurus === "number" && x.payerRefundDueKurus > 0) add("Mekana iade edilecek", tl(x.payerRefundDueKurus));
  if (x.prevStatus) add("Önceki durum", STATUS[x.prevStatus] || x.prevStatus);
  if (x.result) add("Sonuç", RESULT[x.result] || x.result);
  if (x.rule) add("Kural", `${x.rule.title || WH[x.rule.type] || ""} · ${WH[x.rule.type] || x.rule.type} ${pct(x.rule.rate)}${RESP[x.rule.responsible] ? ` (${RESP[x.rule.responsible]})` : ""}`);
  if (x.version) add("Sürüm", `v${x.version}`);
  add("Onaylayan müşavir", x.approvedByName);
  add("Onay referansı", x.approvalRef);
  if (x.which) add("Belge", WHICH[x.which] || x.which);
  if (x.status) add("Durum", DOC_ST[x.status] || x.status);
  add("Belge no", x.docNo);
  if (x.uid) add("Kullanıcı", x.uid);
  if (x.fromMs || x.toMs) add("Tarih aralığı", `${day(x.fromMs)} – ${day(x.toMs)}`);
  if (typeof x.n === "number") add("Kayıt sayısı", x.n);
  add("Gerekçe", x.reason);
  add("Not", x.note);
  return { title, lines, warn };
}
