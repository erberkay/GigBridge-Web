// WebAdminFinans — Yönetici: FİNANS (Finans v2). Registry: adminFinans (#/admin/finans). ≥769 px (≤768 düzeni CSS'te).
// Uygulama karşılığı: components/payments/AdminFinanceTab.tsx. Sunucu: functions/payments.js adminPayments yeni action'lar
//   financeList · exportFinance · financeDecide · taxRefund · listRules · saveRule · approveRule · retireRule · listTaxProfiles ·
//   getTaxProfileAdmin · verifyTaxProfile · setDocumentStatus · getDocumentUrl · auditLog (yalnız admin; her işlem adminAudit'e).
// Bölümler (?bolum=): inceleme (kuyruk + karar formu) · tablo (tüm finans satırları + CSV / Excel dışa aktarım) · kurallar (vergi
// kuralları; onay için müşavir adı + referans zorunlu, sürüm geçmişi) · profiller (vergi profilleri doğrulama) · belgeler (hizmet
// belgesi / komisyon faturası durumu) · denetim (audit log). Kenarda: dışa aktarım + uyum kontrol listesi (salt bilgi).
// ?sec=<merchantOid> → karar çekmecesi (Admin › Ödemeler'deki "Finansal inceleme" bağlantısı).
// Görsel dil WebAdmin (dk-admin-panel.css + dk-admin-etkinlik.css) + css/dk-odeme.css (.dk-adm-pay-* satırlar, .dk-fin-*).
import { auditView } from "../shared/audit-view.js";
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkChip, dkPageHero, dkSkeleton, dkButton, dkInput, dkSelect, dkTextarea, dkCheckbox, dkRadioGroup, dkToast, dkConfirm, dkDrawer, dkModal, dkStatusBadge, dkInlineMessage } from "../shared/ui.js";
import { writeQuery } from "../shared/helpers.js";
import {
  payApi, payBadge, fmtKurus, fmtDTShort, paymentErrorText, isOid, statusLabel, TONE_COLOR,
  FINANCE_STATUS_LABEL, financeReasonText, withholdingLine, withholdingTitle, WITHHOLDING_LABEL, docTypeLabel, DOC_STATUS_LABEL, DOC_STATUS_TONE,
} from "../shared/payments.js";
import { taxStatusBadge } from "../shared/tax-form.js";
import { downloadCsv, downloadXls } from "../shared/export.js";

const VIOLET = "#A78BFA";
const P = "dk-adm-pay";
const errText = (e) => (e?.code === "functions/permission-denied" ? "Bu işlem için yönetici yetkisi gerekli."
  : e?.code === "functions/unauthenticated" ? "Oturum süresi dolmuş. Çıkış yapıp tekrar giriş yap." : paymentErrorText(e));
const SECTIONS = [
  { key: "inceleme", label: "İNCELEME KUYRUĞU" },
  { key: "tablo", label: "FİNANS TABLOSU" },
  { key: "kurallar", label: "VERGİ KURALLARI" },
  { key: "profiller", label: "VERGİ PROFİLLERİ" },
  { key: "belgeler", label: "BELGELER" },
  { key: "denetim", label: "DENETİM KAYDI" },
];
let _sec = "inceleme";

// ── biçim ──
/** ms | ISO | Firestore {_seconds} | Timestamp → ms */
const anyMs = (v) => (v == null ? null : typeof v === "number" ? v : typeof v === "string" ? (Date.parse(v) || null)
  : typeof v.toMillis === "function" ? v.toMillis() : typeof v._seconds === "number" ? v._seconds * 1000 : typeof v.seconds === "number" ? v.seconds * 1000 : null);
const p2 = (n) => String(n).padStart(2, "0");
const isoDT = (v) => { const ms = anyMs(v); if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const tl = (k) => Math.round(Number(k) || 0) / 100;                      // dışa aktarım: TL sayı
const pctTxt = (r) => (typeof r === "number" ? `%${Math.round(r * 1000) / 10}` : "");
const kindText = (k) => (k === "venue_rental" ? "Mekan kiralama" : "Sanatçı kiralama");
const borneText = (b) => (b === "payer" ? "Ödeyen" : "Alıcı");
const RESP_TEXT = { payer: "Ödeyen keser", platform: "GigBridge keser" };
const BASE_TEXT = { gross: "Brüt", gross_excl_vat: "KDV hariç brüt" };
const W_TYPES = [{ value: "serbest_meslek_stopaj", label: WITHHOLDING_LABEL.serbest_meslek_stopaj }, { value: "eticaret_tevkifat", label: WITHHOLDING_LABEL.eticaret_tevkifat }];
const RULE_TYPES = [...W_TYPES, { value: "no_withholding", label: "Kesinti yok (bu senaryoda)" }];
const CATS = [["A_arizi", "A · arızi"], ["A_duzenli", "A · düzenli"], ["B", "B · mükellef"], ["C", "C · şirket/temsilci"], ["isletme", "İşletme (mekan kiralama)"]];
const catText = (k) => CATS.find((x) => x[0] === k)?.[1] || k;
const TAX_ST_TEXT = { submitted: "incelemede", verified: "doğrulandı", rejected: "reddedildi", missing: "yok", none: "yok" };
const RULE_STATUS = { draft: { text: "TASLAK", tone: "warn" }, approved: { text: "ONAYLI", tone: "ok" }, retired: { text: "EMEKLİ", tone: "muted" } };
const badge = (text, tone) => dkStatusBadge({ label: text, color: TONE_COLOR[tone] || TONE_COLOR.muted }, { variant: "box" });

// Finans satırının kesinti parçaları (stopaj / e-ticaret ayrı sütunlar)
function splitW(r) {
  const ws = Array.isArray(r.withholdings) ? r.withholdings : [];
  const st = ws.filter((w) => w.type === "serbest_meslek_stopaj");
  const et = ws.filter((w) => w.type === "eticaret_tevkifat");
  const sum = (a, k) => a.reduce((n, w) => n + (Number(w[k]) || 0), 0);
  const etK = typeof r.eticaretKurus === "number" ? r.eticaretKurus : sum(et, "amountKurus");
  const stK = st.length ? sum(st, "amountKurus") : Math.max(0, (r.stopajKurus || 0) - etK);
  return {
    stType: st.map((w) => `${withholdingTitle(w)}${w.responsible ? ` (${RESP_TEXT[w.responsible] || w.responsible})` : ""}`).join("; ") || (stK ? "Stopaj" : "—"),
    stRate: st.map((w) => pctTxt(w.rate)).filter(Boolean).join("; "),
    stBase: sum(st, "baseKurus"), stK, etK,
  };
}
const docState = (r) => {
  const d = r.documents || {};
  const s = d.service ? `Hizmet: ${docTypeLabel(d.service.docType)} ${DOC_STATUS_LABEL[d.service.status] || d.service.status || ""}`.trim() : "Hizmet: yok";
  const c = d.commissionInvoice ? `Komisyon faturası: ${DOC_STATUS_LABEL[d.commissionInvoice.status] || d.commissionInvoice.status || ""} ${d.commissionInvoice.docNo || ""}`.trim() : "Komisyon faturası: yok";
  return `${s} · ${c}`;
};
const finState = (r) => [FINANCE_STATUS_LABEL[r.financeStatus] || r.financeStatus || "—", ...(r.financeReasons || []).map(financeReasonText)].join(" · ");

// Sütunlar: dışa aktarım (csv/xls) ve ekrandaki tablo AYNI tanımdan. x(r) → dışa aktarım değeri; v(r) → ekran metni (yoksa x).
const COLS = [
  { h: "Ödeme No", x: (r) => r.merchantOid, mono: true },
  { h: "Tür", x: (r) => kindText(r.kind) },
  { h: "Durum", x: (r) => statusLabel(r.status, "payee").text },
  { h: "Başlık", x: (r) => r.title || "" },
  { h: "Ödeyen", x: (r) => r.payerName || "" },
  { h: "Alıcı", x: (r) => r.payeeName || "" },
  { h: "Ödeme Tarihi", x: (r) => isoDT(r.paidAt || r.createdAt) },
  { h: "Etkinlik Tarihi", x: (r) => isoDT(r.eventStartMs) },
  { h: "Brüt", x: (r) => tl(r.grossKurus), v: (r) => fmtKurus(r.grossKurus), num: true },
  { h: "Tahsil Edilen", x: (r) => tl(r.chargeKurus ?? r.grossKurus), v: (r) => fmtKurus(r.chargeKurus ?? r.grossKurus), num: true },
  { h: "Komisyon Oranı", x: (r) => pctTxt(r.commissionRate) },
  { h: "Komisyon Matrahı", x: (r) => tl(r.grossKurus), v: (r) => fmtKurus(r.grossKurus), num: true },
  { h: "Komisyon", x: (r) => tl(r.commissionKurus), v: (r) => fmtKurus(r.commissionKurus), num: true },
  { h: "Komisyon KDV", x: (r) => tl(r.commissionVatKurus), v: (r) => fmtKurus(r.commissionVatKurus), num: true },
  { h: "Komisyonu Karşılayan", x: (r) => borneText(r.commissionBorneBy) },
  { h: "Stopaj Türü", x: (r) => splitW(r).stType },
  { h: "Stopaj Oranı", x: (r) => splitW(r).stRate },
  { h: "Stopaj Matrahı", x: (r) => tl(splitW(r).stBase), v: (r) => fmtKurus(splitW(r).stBase), num: true },
  { h: "Stopaj", x: (r) => tl(splitW(r).stK), v: (r) => fmtKurus(splitW(r).stK), num: true },
  { h: "E-Ticaret Tevkifatı", x: (r) => tl(splitW(r).etK), v: (r) => fmtKurus(splitW(r).etK), num: true },
  { h: "Tahmini PayTR Masrafı", x: (r) => tl(r.paytrFeeKurus), v: (r) => fmtKurus(r.paytrFeeKurus), num: true },
  { h: "Sanatçı/Alıcı Net", x: (r) => tl(r.payeeKurus), v: (r) => fmtKurus(r.payeeKurus), num: true },
  { h: "GigBridge Geliri", x: (r) => tl(r.platformRevenueKurus), v: (r) => fmtKurus(r.platformRevenueKurus), num: true },
  { h: "Vergi Yükümlülüğü", x: (r) => tl(r.taxLiabilityKurus), v: (r) => fmtKurus(r.taxLiabilityKurus), num: true },
  { h: "İade", x: (r) => tl(r.refundedKurus), v: (r) => fmtKurus(r.refundedKurus), num: true },
  { h: "Belge Durumu", x: docState },
  { h: "Finans Durumu", x: finState },
  { h: "Test", x: (r) => (r.testMode ? "Evet" : "Hayır") },
];

export function adminFinansView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || "";
  let alive = true;
  const toast = (m, o) => dkToast(m, o);
  const q0 = ctx.query;
  if (SECTIONS.some((x) => x.key === q0?.get?.("bolum"))) _sec = q0.get("bolum");

  const shell = panelShell({ role: "admin", active: "finans", crumb: "Finans", ctx, notifications: "custom" });
  const root = shell.content;
  root.classList.add("dk-admin-panel", "dk-admin-etk", P, "dk-fin");
  const hero = dkPageHero({ eyebrow: "YÖNETİCİ · FİNANS", title: "Vergi, belge ve inceleme ", em: "tek yerde", tail: ".", color: VIOLET, cls: "dk-admin-panel-hero",
    lead: "Vergi durumu belirsiz ödemeler burada karara bağlanır. Stopaj ve e-ticaret tevkifatı yalnız mali müşavir onaylı kurallarla uygulanır." });

  // ══════════ ana kart + bölüm çipleri ══════════
  const chipsBox = h("div", { class: "dk-admin-etk-chips", role: "group", "aria-label": "Finans bölümleri" });
  const body = h("div", { class: `${P}-list dk-fin-body`, "aria-live": "polite" });
  const tools = h("div", { class: "dk-admin-etk-tools" });
  const mainCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Finans" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "FİNANS"), tools),
    h("div", { class: `${P}-chips` }, chipsBox), body);
  let reviewCount = 0, loadSeq = 0;
  function drawChips() {
    chipsBox.replaceChildren(...SECTIONS.map((x) => dkChip({ label: x.key === "inceleme" && reviewCount ? `${x.label} · ${reviewCount}` : x.label, pressed: x.key === _sec, size: 32,
      onClick: () => { if (_sec === x.key) return; _sec = x.key; writeQuery({ bolum: x.key }); drawChips(); loadSection(); } })));
    shell.setBadge("finans", reviewCount);
  }
  const skel = () => body.replaceChildren(...[0, 1, 2].map(() => h("div", { class: `${P}-row` }, dkSkeleton({ w: 260, h: 14 }), dkSkeleton({ w: "80%", h: 12 }), dkSkeleton({ w: "60%", h: 12 }))));
  const errBox = (e, retry) => h("div", { class: "dk-admin-panel-err" }, svgIcon("alertCircle", { size: 28, color: "#5E636D" }), h("span", { class: "dk-admin-panel-det", role: "alert" }, errText(e)),
    dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: retry }));
  const empty = (t) => h("div", { class: "dk-admin-panel-empty" }, t);
  const meta = (t, color) => h("span", { class: `${P}-meta`, style: color ? { color } : null }, t);
  const reload = () => loadSection();
  const reloadBtn = () => dkButton("Yenile", { variant: "outline", size: 36, icon: "refresh", onClick: reload });

  async function loadSection() {
    const seq = ++loadSeq;
    const guard = () => alive && seq === loadSeq;
    tools.replaceChildren(reloadBtn());
    skel();
    try {
      if (_sec === "inceleme") await secReview(guard);
      else if (_sec === "tablo") await secTable(guard);
      else if (_sec === "kurallar") await secRules(guard);
      else if (_sec === "profiller") await secProfiles(guard);
      else if (_sec === "belgeler") await secDocs(guard);
      else await secAudit(guard);
    } catch (e) {
      console.error(e);
      if (guard()) body.replaceChildren(errBox(e, reload));
    }
  }

  // ══════════ 1 · İNCELEME KUYRUĞU ══════════
  let reviewRows = [];
  async function secReview(guard) {
    const r = await payApi.admin({ action: "financeList", financeStatus: "review", limit: 200 });
    if (!guard()) return;
    reviewRows = r.rows || [];
    reviewCount = reviewRows.length; drawChips();
    if (!reviewRows.length) { body.replaceChildren(empty("İnceleme bekleyen ödeme yok")); return; }
    body.replaceChildren(...reviewRows.map(reviewRow));
  }
  function moneyLine(r) {
    const w = splitW(r);
    return `Brüt ${fmtKurus(r.grossKurus)} · tahsil ${fmtKurus(r.chargeKurus ?? r.grossKurus)} · komisyon ${fmtKurus(r.commissionKurus)} + KDV ${fmtKurus(r.commissionVatKurus)} (${borneText(r.commissionBorneBy).toLocaleLowerCase("tr-TR")}) · stopaj ${fmtKurus(w.stK)} · e-ticaret ${fmtKurus(w.etK)} · alıcıya ${fmtKurus(r.payeeKurus)}`;
  }
  function reviewRow(r) {
    const btns = [
      dkButton("Karar ver", { variant: "violet", size: 36, icon: "check", onClick: () => openDecide(r.merchantOid) }),
      r.payerRefundDueKurus > 0 ? dkButton(`Vergi iadesi · ${fmtKurus(r.payerRefundDueKurus)}`, { variant: "outline", size: 36, icon: "refresh", onClick: () => onTaxRefund(r) }) : null,
      r.documents?.service?.storagePath ? dkButton("Belgeyi aç", { variant: "outline", size: 36, icon: "fileText", onClick: () => openDoc(r.merchantOid) }) : null,
      dkButton("Denetim", { variant: "ghost", size: 36, icon: "list", onClick: () => { _sec = "denetim"; auditOid = r.merchantOid; writeQuery({ bolum: "denetim" }); drawChips(); loadSection(); } }),
    ].filter(Boolean);
    return h("article", { class: `${P}-row` },
      h("div", { class: `${P}-top` }, h("span", { class: `${P}-t` }, r.title || r.merchantOid), payBadge(r.status, "payee")),
      meta(`${r.payerName || "—"} → ${r.payeeName || "—"} · ${kindText(r.kind)}${r.testMode ? " · TEST" : ""}`),
      meta(moneyLine(r)),
      meta(`Ödeme ${fmtDTShort(anyMs(r.paidAt))} · etkinlik ${fmtDTShort(anyMs(r.eventStartMs))}`),
      (r.financeReasons || []).length ? meta((r.financeReasons || []).map(financeReasonText).join(" · "), "#FFB347") : null,
      r.payerRefundDueKurus > 0 ? meta(`Ödeyene iade edilecek vergi farkı: ${fmtKurus(r.payerRefundDueKurus)}`, "#7CE0B0") : null,
      meta(docState(r)),
      h("span", { class: `${P}-oid` }, r.merchantOid),
      h("div", { class: `${P}-acts` }, ...btns));
  }
  async function onTaxRefund(r) {
    if (!(await dkConfirm({ title: "Vergi farkı iadesi", body: `${fmtKurus(r.payerRefundDueKurus)} ödeyene (${r.payerName || "—"}) iade edilecek (ödeyenin kendisinin keseceği stopaj). Bu işlem geri alınamaz.`, confirmLabel: "İade et", danger: true }))) return;
    try { await payApi.admin({ action: "taxRefund", merchantOid: r.merchantOid }); toast("Vergi farkı iade edildi"); loadSection(); }
    catch (e) { toast(errText(e), { type: "err" }); }
  }
  async function openDoc(oid) {
    // açılır pencere engellenmesin: önce boş sekme, sonra imzalı adres
    const w = window.open("", "_blank");
    try {
      const r = await payApi.admin({ action: "getDocumentUrl", merchantOid: oid });
      if (!r?.url) throw new Error("Belge bulunamadı.");
      if (w) { try { w.opener = null; } catch (_) {} w.location.href = r.url; } else window.open(r.url, "_blank", "noopener");
    } catch (e) { try { w?.close(); } catch (_) {} toast(errText(e), { type: "err" }); }
  }

  // Gider pusulası (functions/giderPusulasi.js): imzalı bağlantı; regenerate → aynı numarayla yeniden düzenler (mail: tarafları yeniden e-postalar)
  async function openPusula(oid, { regenerate = false, mail = false } = {}) {
    const w = regenerate ? null : window.open("", "_blank");
    try {
      const r = await payApi.getGiderPusulasi({ merchantOid: oid, ...(regenerate ? { regenerate: true, mail } : {}) });
      if (!r?.url) throw new Error("Belge bulunamadı.");
      if (regenerate) { toast(`Gider pusulası ${r.no} ${mail ? "yeniden düzenlendi ve e-postalandı" : "yeniden düzenlendi"}`); return; }
      if (w) { try { w.opener = null; } catch (_) {} w.location.href = r.url; } else window.open(r.url, "_blank", "noopener");
    } catch (e) { try { w?.close(); } catch (_) {} toast(errText(e), { type: "err" }); }
  }

  // ── karar çekmecesi (financeDecide) ──
  let drawer = null, drawerOid = null, rulesCache = null;
  async function findRow(oid) {
    const hit = reviewRows.find((x) => x.merchantOid === oid) || tableRows?.find((x) => x.merchantOid === oid);
    if (hit) return hit;
    const r = await payApi.admin({ action: "financeList", limit: 500 });
    return (r.rows || []).find((x) => x.merchantOid === oid) || null;
  }
  function openDecide(oid) {
    if (!isOid(oid)) return;
    if (drawer && drawerOid === oid) return;
    drawer?.close("switch");
    drawerOid = oid;
    writeQuery({ sec: oid });
    const dbody = h("div", { class: "dk-pay-dsp dk-fin-dec" }, dkSkeleton({ w: "60%", h: 16 }), dkSkeleton({ w: "100%", h: 140, r: 8 }));
    const d0 = dkDrawer({ eyebrow: "FİNANSAL İNCELEME · KARAR", title: "Karar", body: dbody, width: 720, cls: "dk-pay-drw",
      onClose: (rsn) => { if (drawerOid === oid) { drawer = null; drawerOid = null; if (rsn !== "route" && rsn !== "switch" && alive) writeQuery({ sec: null }); } } });
    drawer = d0;
    (async () => {
      let row = null;
      try {
        [row, rulesCache] = await Promise.all([findRow(oid), rulesCache ? Promise.resolve(rulesCache) : payApi.admin({ action: "listRules" }).then((r) => r.rules || [])]);
      } catch (e) { if (alive) dbody.replaceChildren(dkInlineMessage("err", errText(e))); return; }
      if (!alive || drawerOid !== oid) return;
      if (!row) { dbody.replaceChildren(dkInlineMessage("err", "Ödeme finans listesinde bulunamadı.")); return; }
      d0.setTitle(row.title || oid);
      drawDecide(dbody, row);
    })();
  }
  function drawDecide(dbody, row) {
    const sec = (title, ...kids) => h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, title), h("div", { class: "dk-pay-box" }, ...kids));
    const kv = (l, v) => h("div", { class: "dk-pay-tline" }, h("span", { class: "dk-pay-tl" }, l), h("span", { class: "dk-pay-tv is-sans" }, v));
    const w = splitW(row);
    const info = sec("ÖDEME",
      kv("TARAFLAR", `${row.payerName || "—"} → ${row.payeeName || "—"}${row.payeeType ? ` (${row.payeeType})` : ""}`),
      kv("TÜR", kindText(row.kind)),
      kv("BRÜT / TAHSİL", `${fmtKurus(row.grossKurus)} / ${fmtKurus(row.chargeKurus ?? row.grossKurus)}`),
      kv("KOMİSYON", `${fmtKurus(row.commissionKurus)} (${pctTxt(row.commissionRate)}) + KDV ${fmtKurus(row.commissionVatKurus)} · ${borneText(row.commissionBorneBy)}`),
      kv("MEVCUT KESİNTİLER", (row.withholdings || []).length ? row.withholdings.map((x) => `${withholdingLine(x)} ${fmtKurus(x.amountKurus)}`).join(" · ") : "—"),
      kv("STOPAJ / E-TİCARET", `${fmtKurus(w.stK)} / ${fmtKurus(w.etK)}`),
      kv("ALICIYA", fmtKurus(row.payeeKurus)),
      kv("NEDENLER", (row.financeReasons || []).map(financeReasonText).join(" · ") || "—"),
      kv("BELGELER", docState(row)),
      (row.payoutParts || []).length ? kv("HAK EDİŞ PAYLARI", row.payoutParts.map((x) => `${x.name || x.uid} %${x.percent} ${fmtKurus(x.amountKurus)}`).join(" · ")) : null);
    // Vergi anlık görüntüsü (ödeme anındaki taraf vergi durumları) + önceki karar
    const ts = row.taxSnapshot || null, td = row.taxDecision || null;
    const tsTxt = (v) => (v == null || v === "" ? "—" : TAX_ST_TEXT[v] || String(v));
    const snap = ts ? sec("VERGİ ANLIK GÖRÜNTÜSÜ",
      kv("ALICI KATEGORİSİ", ts.payeeCategory ? catText(ts.payeeCategory) : "—"),
      kv("ALICI VERGİ DURUMU", tsTxt(ts.payeeTaxStatus)),
      kv("ÖDEYEN STOPAJ SORUMLUSU", tsTxt(ts.payerStopajResponsible)),
      kv("ÖDEYEN VERGİ DURUMU", tsTxt(ts.payerTaxStatus)),
      kv("GRUP ALICI", ts.groupPayee === true ? "Evet" : ts.groupPayee === false ? "Hayır" : "—")) : null;
    const prev = td ? sec("ÖNCEKİ KARAR",
      kv("YÖNTEM", td.mode === "manual" ? "Elle" : td.mode === "rules" ? "Onaylı kurallar" : String(td.mode || "—")),
      kv("KURALLAR", Array.isArray(td.ruleRefs) && td.ruleRefs.length ? td.ruleRefs.map((x) => (typeof x === "object" ? `${x.title || x.ruleKey || x.id || ""}${x.version ? ` v${x.version}` : ""}` : String(x))).join(" · ") : "—"),
      kv("NOT", td.note || "—"),
      kv("KARAR VEREN", `${td.byEmail || "—"} · ${fmtDTShort(anyMs(td.at))}`)) : null;

    let mode = "rules";
    const picked = new Set();
    const approved = (rulesCache || []).filter((r) => r.status === "approved");
    const rulesBox = h("div", { class: "dk-fin-rules" }, ...(approved.length ? approved.map((r) => {
      const fit = !r.conditions?.kinds?.length || r.conditions.kinds.includes(row.kind);
      return dkCheckbox({ label: `${r.title || withholdingTitle(r)} · ${pctTxt(r.rate)} · ${BASE_TEXT[r.base] || r.base || "—"} · ${RESP_TEXT[r.responsible] || r.responsible || "—"} · v${r.version}${fit ? "" : " (tür uymuyor)"}`,
        checked: false, onChange: (on) => { if (on) picked.add(r.id); else picked.delete(r.id); } });
    }) : [dkInlineMessage("info", "Onaylı vergi kuralı yok. Elle karar ver ya da Vergi Kuralları'ndan kural onayla.")]));
    // elle kesinti satırları (0 satır = kesinti yok)
    const manual = [];
    const manualBox = h("div", { class: "dk-fin-wlist" });
    const addW = (x = {}) => {
      const type = dkSelect({ size: 40, options: W_TYPES, value: x.type || "serbest_meslek_stopaj", attrs: { "aria-label": "Kesinti türü" } });
      const rate = dkInput({ size: 40, inputmode: "decimal", maxlength: 5, value: x.rate != null ? String(Math.round(x.rate * 1000) / 10) : "20", cls: `${P}-pct`, attrs: { "aria-label": "Oran (%)" } });
      const base = dkSelect({ size: 40, options: [{ value: "gross", label: "Brüt" }, { value: "gross_excl_vat", label: "KDV hariç brüt" }], value: x.base || "gross", attrs: { "aria-label": "Matrah" } });
      const resp = dkSelect({ size: 40, options: [{ value: "payer", label: "Ödeyen keser" }, { value: "platform", label: "GigBridge keser" }], value: x.responsible || "platform", attrs: { "aria-label": "Kesen" } });
      const title = dkInput({ size: 40, maxlength: 80, placeholder: "Başlık (opsiyonel)", value: x.title || "", attrs: { "aria-label": "Başlık" } });
      const it = { type, rate, base, resp, title };
      const rm = dkButton("Kaldır", { variant: "ghost", size: 36, icon: "x", onClick: () => { manual.splice(manual.indexOf(it), 1); rowEl.remove(); } });
      const rowEl = h("div", { class: "dk-fin-wrow" }, type, rate, h("span", { class: "dk-pay-muted" }, "%"), base, resp, title, rm);
      manual.push(it); manualBox.append(rowEl);
    };
    const manualWrap = h("div", { class: "dk-pay-tbox", hidden: true }, manualBox,
      dkButton("Kesinti ekle", { variant: "outline", size: 36, icon: "plus", onClick: () => addW() }),
      h("span", { class: "dk-pay-fine" }, "Hiç satır eklemezsen \"kesinti yok\" kararı verilir."));
    const modeGroup = dkRadioGroup({ value: mode, label: "Karar yöntemi", items: [{ value: "rules", label: "Onaylı kurallara göre" }, { value: "manual", label: "Elle (gerekçeli)" }],
      onChange: (v) => { mode = v; rulesBox.hidden = v !== "rules"; manualWrap.hidden = v !== "manual"; } });
    const note = dkTextarea({ rows: 3, maxlength: 600, placeholder: "Karar notu (en az 5 karakter; denetim kaydına yazılır)" });
    const err = h("span", { class: "dk-pay-err", role: "alert" });
    const result = h("div");
    let busy = false;
    const submit = dkButton("Kararı kaydet", { variant: "violet", size: 40, icon: "check", busyLabel: "Kaydediliyor…", onClick: async () => {
      if (busy) return;
      const n = note.input.value.trim();
      err.textContent = "";
      if (n.length < 5) { err.textContent = "Karar için en az 5 karakterlik not yaz."; return; }
      const payload = { action: "financeDecide", merchantOid: row.merchantOid, mode, note: n };
      if (mode === "rules") {
        if (!picked.size) { err.textContent = "En az bir onaylı kural seç."; return; }
        payload.ruleIds = [...picked];
      } else {
        const ws = [];
        for (const it of manual) {
          const rate = parseFloat(it.rate.value.replace(",", "."));
          if (!(rate >= 0 && rate <= 50)) { err.textContent = "Kesinti oranı %0 ile %50 arasında olmalı."; return; }
          const type = it.type.querySelector("select").value;
          ws.push({ type, rate: rate / 100, base: it.base.querySelector("select").value, responsible: it.resp.querySelector("select").value, title: it.title.value.trim() || WITHHOLDING_LABEL[type] });
        }
        payload.withholdings = ws;
      }
      if (!(await dkConfirm({ title: "Finans kararı", body: "Kesintiler bu karara göre yeniden hesaplanır ve ödeme incelemeden çıkar. Karar denetim kaydına yazılır.", confirmLabel: "Kaydet" }))) return;
      busy = true; submit.dk.setBusy(true);
      try {
        const r = await payApi.admin(payload);
        result.replaceChildren(dkInlineMessage("ok", `Karar kaydedildi · alıcıya ${fmtKurus(r?.payeeKurus)}${r?.payerRefundDueKurus > 0 ? ` · ödeyene vergi farkı iadesi ${fmtKurus(r.payerRefundDueKurus)} (Vergi iadesi düğmesiyle)` : ""}.`));
        toast("Finans kararı kaydedildi");
        if (_sec === "inceleme" || _sec === "tablo") loadSection();
      } catch (e) { err.textContent = errText(e); }
      finally { busy = false; if (submit.isConnected) submit.dk.setBusy(false); }
    } });
    dbody.replaceChildren(...[info, snap, prev].filter(Boolean),
      sec("KARAR", modeGroup, rulesBox, manualWrap, note, err, h("div", { class: "dk-pay-btns" }, submit), result,
        row.payerRefundDueKurus > 0 ? dkButton(`Vergi iadesi · ${fmtKurus(row.payerRefundDueKurus)}`, { variant: "outline", size: 36, icon: "refresh", onClick: () => onTaxRefund(row) }) : null,
        row.documents?.service?.storagePath ? dkButton("Hizmet belgesini aç", { variant: "outline", size: 36, icon: "fileText", onClick: () => openDoc(row.merchantOid) }) : null,
        row.giderPusulasi?.no ? dkButton(`Gider pusulası · ${row.giderPusulasi.no}`, { variant: "outline", size: 36, icon: "fileText", onClick: () => openPusula(row.merchantOid) }) : null,
        // Komisyon e-faturası (Trendyol): aktarılmış ödemede kes; kesilmişse PDF
        row.status === "transferred" && row.documents?.commissionInvoice?.status !== "issued"
          ? dkButton("Komisyon e-faturası kes", { variant: "outline", size: 36, icon: "fileText", onClick: async () => {
            if (!(await dkConfirm({ title: "Komisyon e-faturası", body: "Komisyon + KDV için Trendyol E-Faturam'da fatura kesilir (alıcı e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv). Bir kontör harcanır.", confirmLabel: "Kes" }))) return;
            try { const r = await payApi.adminEInvoice({ action: "issue", merchantOid: row.merchantOid }); toast(r.ok ? `Fatura kesildi${r.docNo ? ` · ${r.docNo}` : ""}` : `Kesilmedi: ${r.skipped}${r.problem?.title ? ` · ${r.problem.title}` : ""}`, { type: r.ok ? "ok" : "err" }); loadSection(); }
            catch (e) { toast(errText(e), { type: "err" }); } } }) : null,
        row.documents?.commissionInvoice?.provider === "trendyol" && row.documents.commissionInvoice.status === "issued"
          ? dkButton(`E-fatura PDF${row.documents.commissionInvoice.docNo ? ` · ${row.documents.commissionInvoice.docNo}` : ""}`, { variant: "outline", size: 36, icon: "fileText", onClick: async () => {
            const w = window.open("", "_blank");
            try { const r = await payApi.adminEInvoice({ action: "pdf", merchantOid: row.merchantOid }); if (w) { try { w.opener = null; } catch (_) {} w.location.href = r.url; } }
            catch (e) { try { w?.close(); } catch (_) {} toast(errText(e), { type: "err" }); } } }) : null,
        row.kind === "artist_booking" ? dkButton(row.giderPusulasi?.no ? "Pusulayı yeniden düzenle + e-postala" : "Gider pusulası düzenle + e-postala", { variant: "outline", size: 36, icon: "refresh",
          onClick: async () => { if (await dkConfirm({ title: "Gider pusulası", body: "Mekanın ve sanatçının güncel vergi bilgileriyle pusula (aynı numarayla) yeniden hazırlanır ve iki tarafa e-postalanır.", confirmLabel: "Düzenle" })) openPusula(row.merchantOid, { regenerate: true, mail: true }); } }) : null));
  }

  // ══════════ 2 · FİNANS TABLOSU ══════════
  let tableRows = null, tableFilter = "";
  async function secTable(guard) {
    const filt = h("div", { class: "dk-admin-etk-chips" }, ...[["", "Tümü"], ["review", "İnceleme"], ["auto", "Otomatik"], ["cleared", "Onaylandı"]].map(([k, l]) =>
      dkChip({ label: l, pressed: tableFilter === k, size: 32, onClick: () => { if (tableFilter === k) return; tableFilter = k; loadSection(); } })));
    const r = await payApi.admin({ action: "financeList", ...(tableFilter ? { financeStatus: tableFilter } : {}), limit: 300 });
    if (!guard()) return;
    tableRows = r.rows || [];
    body.replaceChildren(filt, tableRows.length ? finTable(tableRows) : empty("Kayıt yok"));
  }
  function finTable(rows) {
    return h("div", { class: "dk-fin-tblwrap", tabindex: "0", role: "region", "aria-label": "Finans tablosu (yatay kaydırılır)" },
      h("table", { class: "dk-fin-tbl" },
        h("thead", {}, h("tr", {}, ...COLS.map((c) => h("th", { scope: "col", class: c.num ? "is-num" : null }, c.h)))),
        h("tbody", {}, ...rows.map((r) => h("tr", { class: r.financeStatus === "review" ? "is-review" : null, onclick: () => openDecide(r.merchantOid) },
          ...COLS.map((c) => h("td", { class: cx(c.num && "is-num", c.mono && "is-mono") }, String((c.v || c.x)(r) ?? ""))))))));
  }

  // ── dışa aktarım kartı (kenar) ──
  const today = new Date();
  const isoDay = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const fromIn = dkInput({ size: 40, type: "date", value: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), attrs: { "aria-label": "Başlangıç tarihi" } });
  const toIn = dkInput({ size: 40, type: "date", value: isoDay(today), attrs: { "aria-label": "Bitiş tarihi" } });
  const expErr = h("span", { class: "dk-pay-err", role: "alert" });
  async function doExport(kind, btn) {
    expErr.textContent = "";
    const f = fromIn.value ? new Date(fromIn.value + "T00:00:00").getTime() : null;
    const t = toIn.value ? new Date(toIn.value + "T23:59:59.999").getTime() : null;
    if (f && t && f > t) { expErr.textContent = "Başlangıç tarihi bitişten sonra olamaz."; return; }
    btn.dk.setBusy(true);
    try {
      const r = await payApi.admin({ action: "exportFinance", ...(f ? { fromMs: f } : {}), ...(t ? { toMs: t } : {}) });
      const rows = r.rows || [];
      if (!rows.length) { toast("Bu aralıkta kayıt yok", { type: "info" }); return; }
      const name = `gigbridge-finans-${fromIn.value || "baslangic"}_${toIn.value || "bugun"}`;
      const data = rows.map((x) => COLS.map((c) => c.x(x)));
      if (kind === "xls") downloadXls(name, COLS.map((c) => c.h), data, { sheet: "Finans" });
      else downloadCsv(name, COLS.map((c) => c.h), data);
      if (rows.length >= 1000) toast("İlk 1000 kayıt indirildi; aralığı daraltıp tekrar indir.", { type: "info" });
    } catch (e) { expErr.textContent = errText(e); }
    finally { if (btn.isConnected) btn.dk.setBusy(false); }
  }
  const csvBtn = dkButton("CSV indir", { variant: "outline", size: 40, icon: "fileText", busyLabel: "Hazırlanıyor…", onClick: () => doExport("csv", csvBtn) });
  const xlsBtn = dkButton("Excel indir", { variant: "violet", size: 40, icon: "fileText", busyLabel: "Hazırlanıyor…", onClick: () => doExport("xls", xlsBtn) });
  // Dar kenar kartında etiket üstte, alan tam genişlikte (yan yana dizilimde etiket harf harf kırılıyordu)
  const line = (label, subTxt, ctl) => h("div", { style: { display: "grid", gap: "6px", minWidth: "0" } },
    h("span", { class: "dk-admin-etk-n" }, label), ctl, subTxt ? h("span", { class: "dk-admin-etk-e" }, subTxt) : null);
  const exportCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Dışa aktarım" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "DIŞA AKTARIM")),
    h("div", { class: "dk-admin-etk-form" },
      line("Başlangıç", null, fromIn), line("Bitiş", "Ödeme tarihine göre (en çok 1000 kayıt)", toIn),
      h("div", { class: "dk-admin-etk-tools" }, csvBtn, xlsBtn), expErr,
      h("span", { class: "dk-admin-etk-sum" }, "Tutarlar TL; sütunlar mali müşavir dökümüne uygun (komisyon matrahı, KDV, stopaj, e-ticaret tevkifatı, net, gelir).")));

  // ══════════ 3 · VERGİ KURALLARI ══════════
  async function secRules(guard) {
    const r = await payApi.admin({ action: "listRules" });
    if (!guard()) return;
    rulesCache = r.rules || [];
    tools.replaceChildren(dkButton("Yeni kural", { variant: "violet", size: 36, icon: "plus", onClick: () => openRuleForm(null) }), reloadBtn());
    if (!rulesCache.length) { body.replaceChildren(empty("Henüz vergi kuralı yok"), h("div", { class: `${P}-row` }, dkInlineMessage("info", "Kural yokken her ödeme \"onaylı kural yok\" nedeniyle finansal incelemeye düşer. Mali müşavirinle kuralları belirleyip buraya gir ve onayla."))); return; }
    const byKey = new Map();
    rulesCache.forEach((x) => { const k = x.ruleKey || x.id; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(x); });
    const groups = [...byKey.values()].map((l) => l.sort((a, b) => (b.version || 0) - (a.version || 0)));
    groups.sort((a, b) => String(a[0].title || "").localeCompare(String(b[0].title || ""), "tr"));
    body.replaceChildren(...groups.map(ruleGroup));
  }
  const condText = (c = {}) => [
    c.kinds?.length ? c.kinds.map(kindText).join(" / ") : "Tüm türler",
    c.payeeCategories?.length ? `Alıcı: ${c.payeeCategories.map(catText).join(", ")}` : "Tüm alıcı kategorileri",
    c.payerStopajResponsible ? `Ödeyen stopaj sorumlusu: ${c.payerStopajResponsible}` : null,
    c.groupPayee === true ? "Yalnız grup" : c.groupPayee === false ? "Grup değil" : null,
  ].filter(Boolean).join(" · ");
  function ruleGroup(list) {
    const cur = list.find((x) => x.status === "approved") || list[0];
    const st = RULE_STATUS[cur.status] || { text: cur.status, tone: "muted" };
    const btns = [
      dkButton("Yeni sürüm", { variant: "outline", size: 36, icon: "edit", onClick: () => openRuleForm(cur) }),
      ...list.filter((x) => x.status === "draft").map((x) => dkButton(`v${x.version} onayla`, { variant: "success", size: 36, icon: "check", onClick: () => openApprove(x) })),
      ...list.filter((x) => x.status !== "retired").map((x) => dkButton(`v${x.version} emekliye ayır`, { variant: "danger-outline", size: 36, icon: "x", onClick: () => onRetire(x) })),
    ];
    const hist = h("details", { class: "dk-fin-hist" }, h("summary", {}, `Sürüm geçmişi (${list.length})`),
      ...list.map((x) => h("div", { class: "dk-fin-hrow" },
        badge((RULE_STATUS[x.status] || { text: x.status }).text, (RULE_STATUS[x.status] || { tone: "muted" }).tone),
        h("span", {}, `v${x.version} · ${pctTxt(x.rate)} · ${BASE_TEXT[x.base] || x.base || "—"} · ${x.validFrom || "—"} → ${x.validTo || "süresiz"}`),
        h("span", { class: "dk-pay-muted" }, x.approvedByName ? `Onay: ${x.approvedByName} · ${x.approvalRef || "—"} · ${fmtDTShort(anyMs(x.approvedAt))}` : `Oluşturma ${fmtDTShort(anyMs(x.createdAt))}`))));
    return h("article", { class: `${P}-row` },
      h("div", { class: `${P}-top` }, h("span", { class: `${P}-t` }, `${cur.title || withholdingTitle(cur)} · v${cur.version}`), badge(st.text, st.tone)),
      meta(`${RULE_TYPES.find((x) => x.value === cur.type)?.label || cur.type} · ${pctTxt(cur.rate)} · matrah ${BASE_TEXT[cur.base] || cur.base || "—"} · ${RESP_TEXT[cur.responsible] || cur.responsible || "—"}`),
      meta(condText(cur.conditions)),
      meta(`Geçerlilik ${cur.validFrom || "—"} → ${cur.validTo || "süresiz"}${cur.requiresDocBeforePayout ? " · aktarım öncesi belge şart" : ""}${cur.acceptsPaytrReceipt ? " · PayTR kaydı belge sayılır" : ""}${cur.combinableWith?.length ? ` · birlikte: ${cur.combinableWith.map((t) => WITHHOLDING_LABEL[t] || t).join(", ")}` : ""}`),
      cur.notes ? meta(cur.notes) : null,
      h("span", { class: `${P}-oid` }, cur.ruleKey || cur.id),
      hist,
      h("div", { class: `${P}-acts` }, ...btns));
  }
  function openRuleForm(base) {
    const b = base || {};
    const c = b.conditions || {};
    const fld = (label, ctl, hint) => h("div", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, label), ctl, hint ? h("span", { class: "dk-pay-fine" }, hint) : null);
    const type = dkSelect({ size: 40, options: RULE_TYPES, value: b.type || "serbest_meslek_stopaj", attrs: { "aria-label": "Tür" } });
    const title = dkInput({ size: 40, maxlength: 100, value: b.title || "", placeholder: "örn. Bireysel sanatçı serbest meslek stopajı" });
    const rate = dkInput({ size: 40, inputmode: "decimal", maxlength: 5, value: b.rate != null ? String(Math.round(b.rate * 1000) / 10) : "", placeholder: "20", cls: `${P}-pct` });
    const baseSel = dkSelect({ size: 40, options: [{ value: "gross", label: "Brüt" }, { value: "gross_excl_vat", label: "KDV hariç brüt" }], value: b.base || "gross" });
    const resp = dkSelect({ size: 40, options: [{ value: "payer", label: "Ödeyen keser (mekan / organizatör)" }, { value: "platform", label: "GigBridge keser" }], value: b.responsible || "platform" });
    const kinds = new Set(c.kinds || []), cats = new Set(c.payeeCategories || []), comb = new Set(b.combinableWith || []);
    const cbs = (items, set) => h("div", { class: "dk-fin-cbs" }, ...items.map(([v, l]) => dkCheckbox({ label: l, checked: set.has(v), onChange: (on) => { if (on) set.add(v); else set.delete(v); } })));
    const payerResp = dkSelect({ size: 40, options: [{ value: "", label: "Fark etmez" }, { value: "evet", label: "Evet" }, { value: "hayir", label: "Hayır" }, { value: "bilmiyorum", label: "Bilmiyor" }], value: c.payerStopajResponsible || "" });
    const grp = dkSelect({ size: 40, options: [{ value: "", label: "Fark etmez" }, { value: "true", label: "Yalnız grup" }, { value: "false", label: "Grup değil" }], value: c.groupPayee == null ? "" : String(c.groupPayee) });
    const from = dkInput({ size: 40, type: "date", value: b.validFrom || isoDay(new Date()) });
    const to = dkInput({ size: 40, type: "date", value: b.validTo || "" });
    let reqDoc = b.requiresDocBeforePayout === true, paytr = b.acceptsPaytrReceipt === true;
    const notes = dkTextarea({ rows: 3, maxlength: 1000, value: b.notes || "", placeholder: "Dayanak (mevzuat maddesi, müşavir görüşü) ve açıklama" });
    const err = h("span", { class: "dk-pay-err", role: "alert" });
    const sel = (w) => w.querySelector("select").value;
    const formBody = h("div", { class: "dk-pay-form" },
      base ? dkInlineMessage("info", `"${b.title || b.ruleKey}" kuralının yeni TASLAK sürümü (v${(b.version || 0) + 1}) oluşturulur; onaylanana kadar uygulanmaz.`) : dkInlineMessage("info", "Yeni kural TASLAK olarak kaydedilir; müşavir onayı girilene kadar uygulanmaz."),
      fld("TÜR", type), fld("BAŞLIK", title),
      h("div", { class: "dk-tax-grid" }, fld("ORAN (%)", rate, "Kesinti yok türünde 0"), fld("MATRAH", baseSel)),
      fld("KESEN", resp),
      fld("ÖDEME TÜRÜ", cbs([["artist_booking", "Sanatçı kiralama"], ["venue_rental", "Mekan kiralama"]], kinds), "Hiçbiri seçilmezse tüm türler"),
      fld("ALICI KATEGORİSİ", cbs(CATS, cats), "Hiçbiri seçilmezse tümü"),
      h("div", { class: "dk-tax-grid" }, fld("ÖDEYEN STOPAJ SORUMLUSU", payerResp), fld("GRUP ALICI", grp)),
      fld("BİRLİKTE UYGULANABİLİR", cbs(W_TYPES.map((x) => [x.value, x.label]), comb)),
      h("div", { class: "dk-tax-grid" }, fld("GEÇERLİLİK BAŞLANGICI", from), fld("BİTİŞ (OPSİYONEL)", to)),
      dkCheckbox({ label: "Aktarım öncesi hizmet belgesi şart", checked: reqDoc, onChange: (v) => { reqDoc = v; } }),
      dkCheckbox({ label: "PayTR işlem kaydı belge olarak kabul edilir", checked: paytr, onChange: (v) => { paytr = v; } }),
      fld("NOTLAR", notes), err);
    dkModal({ title: base ? "Kuralın yeni sürümü" : "Yeni vergi kuralı", body: formBody, size: 640, variant: "form", actions: [
      { label: "Vazgeç", variant: "outline" },
      { label: "Taslak kaydet", variant: "violet", busyLabel: "Kaydediliyor…", onClick: async () => {
        err.textContent = "";
        const t = sel(type);
        const rv = t === "no_withholding" ? 0 : parseFloat(rate.value.replace(",", "."));
        if (title.value.trim().length < 3) { err.textContent = "Başlık gir."; return false; }
        if (!(rv >= 0 && rv <= 50)) { err.textContent = "Oran %0 ile %50 arasında olmalı."; return false; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from.value)) { err.textContent = "Geçerlilik başlangıcını seç."; return false; }
        if (to.value && to.value < from.value) { err.textContent = "Bitiş başlangıçtan önce olamaz."; return false; }
        const rule = {
          ...(base?.ruleKey ? { ruleKey: base.ruleKey } : {}),
          type: t, title: title.value.trim(), rate: rv / 100, base: sel(baseSel), responsible: sel(resp),
          conditions: { kinds: [...kinds], payeeCategories: [...cats], payerStopajResponsible: sel(payerResp) || null, groupPayee: sel(grp) === "" ? null : sel(grp) === "true" },
          combinableWith: [...comb], validFrom: from.value, validTo: to.value || null,
          requiresDocBeforePayout: reqDoc, acceptsPaytrReceipt: paytr, notes: notes.input.value.trim(),
        };
        try { await payApi.admin({ action: "saveRule", rule }); toast("Taslak kural kaydedildi"); rulesCache = null; if (_sec === "kurallar") loadSection(); return true; }
        catch (e) { err.textContent = errText(e); return false; }
      } },
    ] });
  }
  function openApprove(rule) {
    const name = dkInput({ size: 40, maxlength: 80, placeholder: "Mali müşavirin adı soyadı", attrs: { "aria-label": "Müşavir adı" } });
    const ref = dkInput({ size: 40, maxlength: 120, placeholder: "Yazı / e-posta tarihi ve konusu", attrs: { "aria-label": "Onay referansı" } });
    const err = h("span", { class: "dk-pay-err", role: "alert" });
    dkModal({ title: `Kuralı onayla · v${rule.version}`, size: 520, variant: "form",
      sub: `${rule.title || withholdingTitle(rule)} · ${pctTxt(rule.rate)}. Onaylanınca aynı kuralın eski onaylı sürümü emekliye ayrılır ve yeni ödemelere uygulanır.`,
      body: h("div", { class: "dk-pay-form" },
        h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "MALİ MÜŞAVİR ADI"), name),
        h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "ONAY REFERANSI"), ref), err),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Onayla", variant: "success", busyLabel: "Onaylanıyor…", onClick: async () => {
          err.textContent = "";
          if (name.value.trim().length < 3) { err.textContent = "Müşavir adını gir."; return false; }
          if (ref.value.trim().length < 3) { err.textContent = "Onay yazısı / e-posta referansını gir."; return false; }
          try { await payApi.admin({ action: "approveRule", ruleId: rule.id, approvedByName: name.value.trim(), approvalRef: ref.value.trim() }); toast("Kural onaylandı"); rulesCache = null; loadSection(); return true; }
          catch (e) { err.textContent = errText(e); return false; }
        } },
      ] });
  }
  async function onRetire(rule) {
    if (!(await dkConfirm({ title: "Emekliye ayır", body: `v${rule.version} artık yeni ödemelere uygulanmaz. Geçmiş kararlar etkilenmez.`, confirmLabel: "Emekliye ayır", danger: true }))) return;
    try { await payApi.admin({ action: "retireRule", ruleId: rule.id }); toast("Kural emekliye ayrıldı"); rulesCache = null; loadSection(); }
    catch (e) { toast(errText(e), { type: "err" }); }
  }

  // ══════════ 4 · VERGİ PROFİLLERİ ══════════
  let profFilter = "submitted";
  async function secProfiles(guard) {
    const filt = h("div", { class: "dk-admin-etk-chips" }, ...[["submitted", "İncelemede"], ["rejected", "Reddedilen"], ["verified", "Doğrulanan"], ["", "Tümü"]].map(([k, l]) =>
      dkChip({ label: l, pressed: profFilter === k, size: 32, onClick: () => { if (profFilter === k) return; profFilter = k; loadSection(); } })));
    const r = await payApi.admin({ action: "listTaxProfiles", ...(profFilter ? { status: profFilter } : {}) });
    if (!guard()) return;
    const rows = r.rows || [];
    body.replaceChildren(filt, ...(rows.length ? rows.map((x) => h("article", { class: `${P}-row` },
      h("div", { class: `${P}-top` }, h("span", { class: `${P}-t` }, x.displayName || x.title || x.uid), taxStatusBadge(x.status)),
      meta([x.userType === "artist" ? "Sanatçı" : x.userType === "venue" ? "Mekan" : x.userType === "organizer" ? "Organizatör" : x.userType, x.role === "performer" ? "performer" : x.role,
        x.category ? `Kategori ${x.category}` : null, x.businessType || null, x.title || null, x.idMasked || null,
        x.stopajResponsible ? `stopaj sorumlusu: ${x.stopajResponsible}` : null].filter(Boolean).join(" · ")),
      meta(`Güncelleme ${fmtDTShort(anyMs(x.updatedAt))}`),
      h("span", { class: `${P}-oid` }, x.uid),
      h("div", { class: `${P}-acts` }, dkButton("İncele", { variant: "violet", size: 36, icon: "eye", onClick: () => openProfile(x) })))) : [empty("Kayıt yok")]));
  }
  const PROFILE_LABEL = {
    category: "Kategori", activity: "Faaliyet", fullName: "Ad soyad", tckn: "T.C. kimlik no", vkn: "Vergi kimlik no", taxOffice: "Vergi dairesi", title: "Unvan",
    vatRegistered: "KDV mükellefi", docType: "Belge türü", repName: "Temsilci", repTckn: "Temsilci T.C. no", docResponsible: "Belgeyi düzenleyen",
    businessType: "İşletme türü", billingAddress: "Fatura adresi", stopajResponsible: "Stopaj sorumlusu", accountantName: "Mali müşavir",
    accountantPhone: "Müşavir telefonu", accountantEmail: "Müşavir e-postası", kvkkAccepted: "KVKK onayı",
  };
  function openProfile(x) {
    const pbody = h("div", { class: "dk-pay-dsp" }, dkSkeleton({ w: "100%", h: 160, r: 8 }));
    const d = dkDrawer({ eyebrow: "VERGİ PROFİLİ · YÖNETİCİ", title: x.displayName || x.uid, body: pbody, width: 600, cls: "dk-pay-drw" });
    (async () => {
      let r;
      try { r = await payApi.admin({ action: "getTaxProfileAdmin", uid: x.uid }); }
      catch (e) { pbody.replaceChildren(dkInlineMessage("err", errText(e))); return; }
      const pr = r?.profile || {};
      const kv = Object.keys(pr).filter((k) => !["updatedAt", "createdAt", "status", "adminNote", "uid"].includes(k)).map((k) => {
        const v = pr[k];
        return h("div", { class: "dk-pay-tline" }, h("span", { class: "dk-pay-tl" }, (PROFILE_LABEL[k] || k).toLocaleUpperCase("tr-TR")),
          h("span", { class: "dk-pay-tv is-sans" }, typeof v === "boolean" ? (v ? "Evet" : "Hayır") : typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")));
      });
      const note = dkTextarea({ rows: 3, maxlength: 400, placeholder: "Not (reddederken zorunlu; kullanıcı görür)" });
      const err = h("span", { class: "dk-pay-err", role: "alert" });
      const decide = async (decision) => {
        err.textContent = "";
        const n = note.input.value.trim();
        if (decision === "rejected" && n.length < 5) { err.textContent = "Ret gerekçesini yaz (en az 5 karakter)."; return; }
        try {
          await payApi.admin({ action: "verifyTaxProfile", uid: x.uid, decision, ...(n ? { note: n } : {}) });
          toast(decision === "verified" ? "Vergi profili doğrulandı" : "Vergi profili reddedildi");
          d.close("done"); if (_sec === "profiller") loadSection();
        } catch (e) { err.textContent = errText(e); }
      };
      pbody.replaceChildren(
        h("div", {}, taxStatusBadge(r?.status)),
        ...(r?.adminNote ? [dkInlineMessage("info", `Önceki not: ${r.adminNote}`)] : []),
        h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, "BİLGİLER"), h("div", { class: "dk-pay-box" }, ...(kv.length ? kv : [h("span", { class: "dk-pay-muted" }, "Profil boş.")]))),
        h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, "KARAR"), h("div", { class: "dk-pay-box" }, note, err,
          h("div", { class: "dk-pay-btns" },
            dkButton("Doğrula", { variant: "success", size: 40, icon: "check", onClick: () => decide("verified") }),
            dkButton("Reddet", { variant: "danger-outline", size: 40, icon: "x", onClick: () => decide("rejected") })),
          h("span", { class: "dk-pay-fine" }, "TCKN/VKN biçimi sunucuda doğrulandı; unvan ve vergi dairesini GİB / e-Devlet üzerinden kontrol et."))));
    })();
  }

  // ══════════ 5 · BELGELER ══════════
  let docFilter = "service";
  async function secDocs(guard) {
    const filt = h("div", { class: "dk-admin-etk-chips" }, ...[["service", "Hizmet belgeleri"], ["invoice", "Komisyon faturası bekleyen"]].map(([k, l]) =>
      dkChip({ label: l, pressed: docFilter === k, size: 32, onClick: () => { if (docFilter === k) return; docFilter = k; loadSection(); } })));
    const r = await payApi.admin({ action: "financeList", limit: 500 });
    if (!guard()) return;
    const all = r.rows || [];
    const PAID_OUT = ["pending", "init_failed", "failed", "refunded"];
    const rows = docFilter === "service"
      ? all.filter((x) => x.documents?.service).sort((a, b) => (a.documents.service.status === "submitted" ? -1 : 0) - (b.documents.service.status === "submitted" ? -1 : 0))
      : all.filter((x) => !PAID_OUT.includes(x.status) && x.documents?.commissionInvoice?.status !== "issued");
    body.replaceChildren(filt, ...(rows.length ? rows.map(docRow) : [empty(docFilter === "service" ? "Yüklenmiş hizmet belgesi yok" : "Komisyon faturası bekleyen ödeme yok")]));
  }
  function docRow(r) {
    const sv = r.documents?.service, ci = r.documents?.commissionInvoice;
    const btns = [];
    if (sv?.storagePath) btns.push(dkButton("Belgeyi aç", { variant: "outline", size: 36, icon: "externalLink", onClick: () => openDoc(r.merchantOid) }));
    if (sv && sv.status !== "verified") btns.push(dkButton("Onayla", { variant: "success", size: 36, icon: "check", onClick: () => setDoc(r, "service", "verified") }));
    if (sv && sv.status !== "rejected") btns.push(dkButton("Reddet", { variant: "danger-outline", size: 36, icon: "x", onClick: () => setDoc(r, "service", "rejected") }));
    btns.push(dkButton(ci?.status === "issued" ? "Komisyon faturasını düzenle" : "Komisyon faturası gir", { variant: "outline", size: 36, icon: "fileText", onClick: () => openInvoice(r) }));
    if (ci?.status === "issued") btns.push(dkButton("Faturayı iptal et", { variant: "ghost", size: 36, onClick: () => setDoc(r, "commissionInvoice", "cancelled") }));
    return h("article", { class: `${P}-row` },
      h("div", { class: `${P}-top` }, h("span", { class: `${P}-t` }, r.title || r.merchantOid),
        sv ? badge(DOC_STATUS_LABEL[sv.status] || sv.status, DOC_STATUS_TONE[sv.status] || "muted") : null),
      meta(`${r.payerName || "—"} → ${r.payeeName || "—"} · brüt ${fmtKurus(r.grossKurus)} · komisyon ${fmtKurus(r.commissionKurus)} + KDV ${fmtKurus(r.commissionVatKurus)}`),
      sv ? meta(`Hizmet belgesi: ${docTypeLabel(sv.docType)} · No ${sv.docNo || "—"} · ${sv.docDate || "—"}${sv.note ? ` · Not: ${sv.note}` : ""}`) : meta("Hizmet belgesi yüklenmedi"),
      meta(ci ? `Komisyon faturası: ${docTypeLabel(ci.docType)} · No ${ci.docNo || "—"} · ${ci.docDate || "—"} · ${DOC_STATUS_LABEL[ci.status] || ci.status}` : "Komisyon faturası girilmedi", ci?.status === "issued" ? null : "#FFB347"),
      h("span", { class: `${P}-oid` }, r.merchantOid),
      h("div", { class: `${P}-acts` }, ...btns));
  }
  async function setDoc(r, which, status) {
    let note = "";
    if (status === "rejected") {
      const ta = dkTextarea({ rows: 3, maxlength: 300, placeholder: "Ret gerekçesi (alıcı görür)" });
      const ok = await new Promise((res) => dkModal({ title: "Belgeyi reddet", body: ta, size: 480, variant: "form", onClose: () => res(false),
        actions: [{ label: "Vazgeç", variant: "outline", onClick: () => res(false) }, { label: "Reddet", variant: "danger", onClick: () => { if (ta.input.value.trim().length < 5) return false; note = ta.input.value.trim(); res(true); } }] }));
      if (!ok) return;
    } else if (!(await dkConfirm({ title: status === "cancelled" ? "Faturayı iptal et" : "Belgeyi onayla", body: status === "cancelled" ? "Komisyon faturası iptal olarak işaretlenir." : "Hizmet belgesi doğrulandı olarak işaretlenir.", confirmLabel: "Onayla", danger: status === "cancelled" }))) return;
    try { await payApi.admin({ action: "setDocumentStatus", merchantOid: r.merchantOid, which, status, ...(note ? { note } : {}) }); toast("Belge durumu güncellendi"); loadSection(); }
    catch (e) { toast(errText(e), { type: "err" }); }
  }
  function openInvoice(r) {
    const ci = r.documents?.commissionInvoice || {};
    const type = dkSelect({ size: 40, options: [{ value: "e_fatura", label: "e-Fatura" }, { value: "e_arsiv", label: "e-Arşiv Fatura" }], value: ci.docType || "e_arsiv" });
    const no = dkInput({ size: 40, maxlength: 40, value: ci.docNo || "", placeholder: "Fatura no" });
    const date = dkInput({ size: 40, type: "date", value: ci.docDate || isoDay(new Date()) });
    const err = h("span", { class: "dk-pay-err", role: "alert" });
    dkModal({ title: "Komisyon faturası", size: 480, variant: "form", sub: `${r.title || r.merchantOid} · komisyon ${fmtKurus(r.commissionKurus)} + KDV ${fmtKurus(r.commissionVatKurus)}`,
      body: h("div", { class: "dk-pay-form" },
        h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "TÜR"), type),
        h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "FATURA NO"), no),
        h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "TARİH"), date), err),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Kaydet", variant: "violet", busyLabel: "Kaydediliyor…", onClick: async () => {
          err.textContent = "";
          if (no.value.trim().length < 3) { err.textContent = "Fatura numarasını gir."; return false; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { err.textContent = "Tarihi seç."; return false; }
          try {
            await payApi.admin({ action: "setDocumentStatus", merchantOid: r.merchantOid, which: "commissionInvoice", status: "issued", docType: type.querySelector("select").value, docNo: no.value.trim(), docDate: date.value });
            toast("Komisyon faturası kaydedildi"); loadSection(); return true;
          } catch (e) { err.textContent = errText(e); return false; }
        } },
      ] });
  }

  // ══════════ 6 · DENETİM KAYDI ══════════
  let auditOid = "";
  async function secAudit(guard) {
    const oidIn = dkInput({ size: 36, value: auditOid, placeholder: "Ödeme no ile süz (boş = son kayıtlar)", cls: `${P}-pin`, attrs: { "aria-label": "Ödeme no", spellcheck: "false" },
      onEnter: (v) => { auditOid = v.trim(); loadSection(); } });
    tools.replaceChildren(oidIn, dkButton("Süz", { variant: "outline", size: 36, icon: "filter", onClick: () => { auditOid = oidIn.value.trim(); loadSection(); } }), reloadBtn());
    if (auditOid && !isOid(auditOid)) { body.replaceChildren(dkInlineMessage("err", "Ödeme no geçersiz.")); return; }
    const r = await payApi.admin({ action: "auditLog", ...(auditOid ? { merchantOid: auditOid } : {}) });
    if (!guard()) return;
    const rows = r.rows || [];
    if (!rows.length) { body.replaceChildren(empty("Kayıt yok")); return; }
    // Okunur Türkçe satırlar (audit-view.js): "Sanatçı kiralama komisyonu: %20 → %10" — ham JSON gösterilmez
    body.replaceChildren(...rows.map((x) => {
      const v = auditView(x);
      return h("article", { class: `${P}-row` },
        h("div", { class: `${P}-top` }, h("span", { class: `${P}-t` }, v.title), h("span", { class: `${P}-meta` }, fmtDTShort(anyMs(x.at)))),
        meta(x.byEmail || x.by || "—"),
        ...(v.warn ? [dkInlineMessage("err", v.warn)] : []),
        ...v.lines.map((l) => h("span", { class: `${P}-meta` }, l)));
    }));
  }

  // ══════════ kenar: uyum kontrol listesi (salt bilgi) ══════════
  const CHECK = [
    ["6563 / ETBİS kaydı", "Elektronik ticaret bilgi sistemi kaydı güncel olmalı."],
    ["6493 ödeme hizmeti değerlendirmesi", "Emanet + dağıtım modelinin ödeme hizmeti sayılıp sayılmadığı avukatla değerlendirilmeli."],
    ["KVKK aydınlatma", "Vergi kimlik / TCKN işleme için aydınlatma metni ve açık rıza metinleri."],
    ["Sanatçı & mekan sözleşmeleri", "Kullanım koşulları ve mesafeli hizmet sözleşmesi güncel sürümle kabul ediliyor."],
    ["Vergi / belge sorumlulukları", "Stopaj, e-ticaret tevkifatı ve belge düzenleme sorumlulukları müşavirle yazılı netleşmeli."],
    ["SGK / çalışma ilişkisi riski", "Düzenli sahne alan sanatçılarda çalışma ilişkisi riski müşavir / avukatla değerlendirilmeli."],
    ["İptal / iade / uyuşmazlık", "Kısmi iade ve vergi farkı iadesi süreçleri yazılı."],
    ["PayTR yazılı teyidi", "Platform Transfer bekletme, çoklu IBAN dağıtımı ve kısmi iade için PayTR'den yazılı onay."],
  ];
  const checkCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Uyum kontrol listesi" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "UYUM KONTROL LİSTESİ")),
    h("div", { class: "dk-admin-etk-form" },
      h("ul", { class: "dk-fin-check" }, ...CHECK.map(([t, d]) => h("li", {}, svgIcon("shieldCheck", { size: 14, color: "#8A8E97" }), h("span", {}, h("strong", {}, t), h("span", { class: "dk-pay-muted" }, ` · ${d}`))))),
      h("span", { class: "dk-admin-etk-sum" }, "Salt bilgi kartı; işaretleme tutulmaz. Hukuki / mali onay yerine geçmez.")));

  root.append(hero, h("div", { class: cx("dk-admin-panel-grid", "dk-admin-etk-g2") }, mainCard, h("div", { class: "dk-admin-etk-col" }, exportCard, checkCard)));

  // ══════════ başlangıç ══════════
  drawChips();
  if (uid) {
    loadSection();
    // rozet: inceleme kuyruğu sayısı (bölüm inceleme değilse ayrıca)
    if (_sec !== "inceleme") payApi.admin({ action: "financeList", financeStatus: "review", limit: 200 }).then((r) => { if (alive) { reviewRows = r.rows || []; reviewCount = reviewRows.length; drawChips(); } }).catch(() => {});
  } else body.replaceChildren(empty("Giriş gerekli"));
  const sec0 = q0?.get?.("sec");
  if (sec0 && isOid(sec0)) openDecide(sec0);

  return {
    node: shell.node,
    update(q) {
      const b = q?.get?.("bolum");
      if (b && b !== _sec && SECTIONS.some((x) => x.key === b)) { _sec = b; drawChips(); loadSection(); }
      const sc = q?.get?.("sec");
      if (sc && isOid(sc)) openDecide(sc); else if (!sc && drawer) drawer.close("query");
    },
    onSession(ns) { return !!ns?.user && ns.user.uid === uid && !!ns.isAdmin; },
    destroy() { alive = false; drawer?.close("route"); shell.destroy(); },
  };
}
