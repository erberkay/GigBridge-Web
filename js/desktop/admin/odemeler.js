// WebAdminOdemeler — Yönetici: ÖDEMELER (emanet / serbest bırakılacak / IBAN bekleyen / iade-şikayet / aktarılan / iade edilen)
// + ŞİKAYETLER (kanıtlı ödeme şikayetleri) + Ödeme Ayarları (komisyon, komisyon KDV'si, komisyonu karşılayan, tahmini stopaj,
// PayTR masrafı, test modu, otomatik aktarım). ≥769 px. Finans v2 inceleme / vergi kuralları / dışa aktarım: admin/finans.js.
// Registry: adminOdeme (#/admin/odemeler). Uygulama karşılığı: components/payments/AdminPaymentsTab.tsx + AdminDisputeModal.tsx.
// Sunucu: functions/payments.js adminPayments { action: list | listDisputes | get | refund | release | resolveDispute |
//   approveCheckinPhotos | getConfig | setConfig } (yalnız admin; her işlem adminAudit'e yazılır) + paymentCases getPaymentDispute.
// Adres: ?grup=<sikayetler|emanette|serbest|iban|iade|aktarilan|iadeedilen> · ?sec=<merchantOid> (şikayet çekmecesi).
// Görsel dil WebAdmin (dk-admin-panel.css + dk-admin-etkinlik.css) + css/dk-odeme.css.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkChip, dkPageHero, dkSkeleton, dkButton, dkInput, dkSelect, dkTextarea, dkSwitch, dkToast, dkConfirm, dkDrawer, dkStatusBadge, dkInlineMessage } from "../shared/ui.js";
import { rateSummary } from "../shared/rate-summary.js";
import { priceCalculator } from "../shared/price-calculator.js";
import { writeQuery } from "../shared/helpers.js";
import {
  payApi, payBadge, fmtKurus, fmtDTShort, paymentErrorText, serviceTermsView, evidenceGallery, openImageViewer,
  ADMIN_GROUPS, ADMIN_REASON, ADMIN_DISPUTE_STATUS, ADMIN_CANCEL_STATUS, REFUNDABLE, RELEASABLE, releaseResultError, parseTLToKurus,
  DISPUTE_STATUS_LABEL, TONE_COLOR, decisionText, isOid, financeReasonText,
} from "../shared/payments.js";

const VIOLET = "#A78BFA";
const P = "dk-adm-pay";
const errText = (e) => (e?.code === "functions/permission-denied" ? "Bu işlem için yönetici yetkisi gerekli. Sahip hesabıyla (berkayer032@gmail.com) giriş yaptığından emin ol."
  : e?.code === "functions/unauthenticated" ? "Oturum süresi dolmuş. Çıkış yapıp tekrar giriş yap." : paymentErrorText(e));
let _group = "emanette";

export function adminOdemelerView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || "";
  let alive = true;
  const toast = (m, o) => dkToast(m, o);
  const q0 = ctx.query;
  if (ADMIN_GROUPS.some((g) => g.key === q0?.get?.("grup"))) _group = q0.get("grup");

  const shell = panelShell({ role: "admin", active: "odeme", crumb: "Ödemeler", ctx, notifications: "custom" });
  const root = shell.content;
  root.classList.add("dk-admin-panel", "dk-admin-etk", P);
  const hero = dkPageHero({ eyebrow: "YÖNETİCİ · ÖDEMELER", title: "Emanet, iade ve şikayetler ", em: "tek yerde", tail: ".", color: VIOLET, cls: "dk-admin-panel-hero",
    lead: "Emanetteki ödemeleri izle; iade et, elle serbest bırak, kanıtlı şikayetlere karar ver. Komisyon, KDV, test modu ve otomatik aktarım ayarları sağda. Vergi incelemesi ve dışa aktarım Finans'ta." });

  // ══════════ liste ══════════
  const chipsBox = h("div", { class: "dk-admin-etk-chips", role: "group", "aria-label": "Ödeme grupları" });
  const list = h("div", { class: `${P}-list`, "aria-live": "polite" });
  const reload = dkButton("Yenile", { variant: "outline", size: 36, icon: "refresh", onClick: () => load() });
  const listCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Ödemeler" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "ÖDEMELER"), reload),
    h("div", { class: `${P}-chips` }, chipsBox), list);
  let counts = {}, openDisputes = 0, rows = null, busy = null, loadSeq = 0;
  const groupCount = (g) => (g.key === "sikayetler" ? openDisputes : g.statuses.reduce((n, st) => n + (counts[st] || 0), 0));
  function drawChips() {
    chipsBox.replaceChildren(...ADMIN_GROUPS.map((g) => {
      const n = groupCount(g);
      return dkChip({ label: n ? `${g.label} · ${n}` : g.label, pressed: g.key === _group, size: 32, onClick: () => { if (_group === g.key) return; _group = g.key; writeQuery({ grup: g.key }); drawChips(); load(); } });
    }));
    shell.setBadge("odeme", openDisputes);
  }
  async function load() {
    const seq = ++loadSeq;
    const g = ADMIN_GROUPS.find((x) => x.key === _group) || ADMIN_GROUPS[1];
    rows = null; drawList();
    try {
      if (g.key === "sikayetler") {
        const r = await payApi.admin({ action: "listDisputes" });
        if (!alive || seq !== loadSeq) return;
        rows = r.rows || []; openDisputes = r.openCount || 0;
      } else {
        const r = await payApi.admin({ action: "list", statuses: g.statuses, limit: 100 });
        if (!alive || seq !== loadSeq) return;
        rows = r.rows || []; counts = r.counts || {};
      }
    } catch (e) {
      console.error(e);
      if (!alive || seq !== loadSeq) return;
      rows = []; drawList(errText(e));
      return;
    }
    drawChips(); drawList();
  }
  // açık şikayet sayısı (rozet) — ilk açılışta bir kez
  async function loadDisputeCount() {
    try { const r = await payApi.admin({ action: "listDisputes" }); if (alive) { openDisputes = r.openCount || 0; drawChips(); } } catch (_) {}
  }
  function drawList(err) {
    const g = ADMIN_GROUPS.find((x) => x.key === _group) || ADMIN_GROUPS[1];
    if (err) { list.replaceChildren(h("div", { class: "dk-admin-panel-err" }, svgIcon("alertCircle", { size: 28, color: "#5E636D" }), h("span", { class: "dk-admin-panel-det", role: "alert" }, err), dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: () => load() }))); return; }
    if (rows === null) { list.replaceChildren(...[0, 1, 2].map(() => h("div", { class: `${P}-row` }, dkSkeleton({ w: 260, h: 14 }), dkSkeleton({ w: "80%", h: 12 }), dkSkeleton({ w: "60%", h: 12 })))); return; }
    if (!rows.length) { list.replaceChildren(h("div", { class: "dk-admin-panel-empty" }, `${g.label.toLocaleLowerCase("tr-TR")} ödeme yok`)); return; }
    list.replaceChildren(...rows.map(payRow));
  }
  const meta = (t, color) => h("span", { class: `${P}-meta`, style: color ? { color } : null }, t);
  function payRow(r) {
    const refundable = REFUNDABLE.includes(r.status);
    const releasable = RELEASABLE.includes(r.status);
    const remaining = r.grossKurus - (r.refundedKurus || 0);
    const isBusy = busy === r.merchantOid;
    const btns = [];
    const B = (label, variant, icon, fn, disabled) => { const b = dkButton(label, { variant, size: 36, icon, onClick: fn, disabled: isBusy || disabled }); btns.push(b); return b; };
    if (r.dispute?.disputeId) B("Şikayeti incele", "outline", "flag", () => openDispute(r.merchantOid));
    if (r.dispute?.status === "open" && !r.dispute.disputeId) {
      B("Şikayeti onayla", "danger-outline", "check", () => run(r, () => payApi.admin({ action: "resolveDispute", merchantOid: r.merchantOid, decision: "upheld" }), "Şikayet onaylandı · iade bekliyor"));
      B("Şikayeti reddet", "outline", "x", () => run(r, () => payApi.admin({ action: "resolveDispute", merchantOid: r.merchantOid, decision: "rejected" }), "Şikayet reddedildi · ödeme serbest bırakılacak"));
    }
    if (releasable) B("Elle serbest bırak", "success", "send", () => onRelease(r));
    if (refundable) B(`İade et · ${fmtKurus(remaining)}`, "danger-outline", "refresh", () => onRefund(r, null));
    let partial = null;
    if (refundable) {
      const inp = dkInput({ size: 36, placeholder: "Kısmi iade (₺)", inputmode: "decimal", maxlength: 10, cls: `${P}-pin`, attrs: { "aria-label": "Kısmi iade tutarı" } });
      const pb = dkButton("Kısmi iade", { variant: "outline", size: 36, disabled: true, onClick: () => onRefund(r, parseTLToKurus(inp.value)) });
      inp.addEventListener("input", () => { inp.value = inp.value.replace(/[^0-9.,]/g, "").slice(0, 10); pb.disabled = isBusy || !(parseTLToKurus(inp.value) > 0); });
      partial = h("div", { class: `${P}-partial` }, inp, pb);
    }
    const reasons = [...(r.flags || []), r.decisionReason].filter(Boolean).map((x) => ADMIN_REASON[x] ?? x);
    return h("article", { class: cx(`${P}-row`, isBusy && "is-busy") },
      h("div", { class: `${P}-top` }, h("span", { class: `${P}-t` }, r.title || r.merchantOid), payBadge(r.status, "payee")),
      meta(`${r.payerName || r.payerUid} → ${r.payeeName || r.payeeUid}${r.testMode ? " · TEST" : ""}`),
      meta(r.fv === 2 || r.commissionVatKurus != null
        ? `Brüt ${fmtKurus(r.grossKurus)} · komisyon ${fmtKurus(r.commissionKurus)} (%${Math.round((r.commissionRate || 0) * 1000) / 10}) + KDV ${fmtKurus(r.commissionVatKurus || 0)}${r.commissionBorneBy === "payer" ? " (ödeyen)" : ""} · vergi kesintisi ${fmtKurus(r.stopajKurus)} · alıcıya ${fmtKurus(r.payoutKurus ?? r.payeeKurus)}`
        : `Brüt ${fmtKurus(r.grossKurus)} · komisyon ${fmtKurus(r.commissionKurus)} (%${Math.round((r.commissionRate || 0) * 100)}) · stopaj ${fmtKurus(r.stopajKurus)} · alıcıya ${fmtKurus(r.payoutKurus ?? r.payeeKurus)}`),
      r.status === "finance_review" || r.financeStatus === "review"
        ? h("a", { href: `#/admin/finans?sec=${encodeURIComponent(r.merchantOid)}`, class: `${P}-meta dk-link`, style: { color: "#FFB347" } },
          `Finansal inceleme: ${(r.financeReasons || []).map(financeReasonText).join(" · ") || "karar bekliyor"} →`)
        : null,
      meta(`Ödeme ${fmtDTShort(r.paidAt)} · etkinlik ${fmtDTShort(r.eventStartMs)} · serbest ${fmtDTShort(r.releaseAfterMs)}`),
      r.refundedKurus > 0 ? meta(`İade edilen ${fmtKurus(r.refundedKurus)}`) : null,
      reasons.length ? meta(reasons.join(" · "), "#FFB347") : null,
      r.dispute ? meta(`Şikayet (${ADMIN_DISPUTE_STATUS[r.dispute.status] ?? r.dispute.status}): ${r.dispute.reason}${r.dispute.text ? ` — ${r.dispute.text}` : ""}`, "#FFB347") : null,
      r.cancellation ? meta(ADMIN_CANCEL_STATUS[r.cancellation.status] ?? r.cancellation.status, "#FFB347") : null,
      r.lastError ? meta(`${r.transferUncertain ? "Belirsiz sonuç (PayTR panelinden kontrol et): " : ""}${r.lastError}`, "#FF5A6E") : null,
      h("span", { class: `${P}-oid` }, r.merchantOid),
      btns.length ? h("div", { class: `${P}-acts` }, ...btns) : null,
      partial);
  }
  async function run(r, fn, okMsg) {
    if (busy) return;
    busy = r.merchantOid; drawList();
    try { await fn(); toast(okMsg); busy = null; await load(); }
    catch (e) { console.error(e); toast(errText(e), { type: "err" }); busy = null; drawList(); }
  }
  async function onRefund(r, amountKurus) {
    const amt = amountKurus ?? (r.grossKurus - (r.refundedKurus || 0));
    if (!(amt > 0)) return;
    if (!(await dkConfirm({ title: "İade et", body: `${fmtKurus(amt)} ödeyene (${r.payerName}) iade edilecek. Bu işlem geri alınamaz.`, confirmLabel: "İade et", danger: true }))) return;
    run(r, () => payApi.admin({ action: "refund", merchantOid: r.merchantOid, ...(amountKurus != null ? { amountKurus } : {}), reason: "admin" }), "İade yapıldı");
  }
  async function onRelease(r) {
    if (!(await dkConfirm({ title: "Elle serbest bırak", body: `${fmtKurus(r.payeeKurus)} ${r.payeeName} hesabına aktarılacak (ödeme gününde aktarım yapılmaz; ertesi gün otomatik).`, confirmLabel: "Serbest bırak" }))) return;
    let review = false;
    run(r, async () => {
      const res = await payApi.admin({ action: "release", merchantOid: r.merchantOid });
      // Finans v2: vergi/belge koşulu karşılanmadıysa sonuç 'finance_review' (hata değil) → bilgi
      if (res?.result === "finance_review") { review = true; return; }
      const m = releaseResultError(res?.result);
      if (m) throw new Error(m);
    }, "Aktarım istendi").then(() => { if (review) toast(releaseResultError("finance_review"), { type: "info" }); });
  }

  // ══════════ ayarlar ══════════
  const cfgBox = h("div", { class: "dk-admin-etk-form" });
  let cfg = null, savingCfg = false, taxRules = [];
  // Oran özeti: her ayarın 10.000 TL örnekte neyi değiştirdiği + onaylı vergi kuralları + senaryolar (muhasebeci dili)
  const summary = rateSummary();
  const calc = priceCalculator();
  const pct = (v) => String(Math.round((Number(v) || 0) * 1000) / 10);
  async function saveCfg(patch) {
    savingCfg = true; drawCfg();
    try { cfg = (await payApi.admin({ action: "setConfig", config: patch })).config; toast("Ödeme ayarları kaydedildi"); }
    catch (e) { toast(errText(e), { type: "err" }); }
    finally { savingCfg = false; if (alive) drawCfg(); }
  }
  function drawCfg() {
    if (!cfg) return;
    const a = dkInput({ size: 40, value: pct(cfg.artistCommissionRate), inputmode: "decimal", maxlength: 5, cls: `${P}-pct`, attrs: { "aria-label": "Sanatçı komisyonu (%)" } });
    const v = dkInput({ size: 40, value: pct(cfg.venueCommissionRate), inputmode: "decimal", maxlength: 5, cls: `${P}-pct`, attrs: { "aria-label": "Mekan komisyonu (%)" } });
    // Finans v2: komisyon KDV'si (oran + dahil/hariç), komisyonu karşılayan (tür başına), tahmini stopaj (yalnız ödeme öncesi tahmin)
    // ve tahmini PayTR masrafı (finans tablosu). Kesin stopaj oranı burada DEĞİL — Finans › Vergi Kuralları (müşavir onaylı).
    const vat = dkInput({ size: 40, value: pct(cfg.commissionVatRate ?? 0.2), inputmode: "decimal", maxlength: 5, cls: `${P}-pct`, attrs: { "aria-label": "Komisyon KDV oranı (%)" } });
    const est = dkInput({ size: 40, value: pct(cfg.estimateStopajRate ?? 0.2), inputmode: "decimal", maxlength: 5, cls: `${P}-pct`, attrs: { "aria-label": "Tahmini stopaj (%)" } });
    const fee = dkInput({ size: 40, value: pct(cfg.paytrFeeRate ?? 0), inputmode: "decimal", maxlength: 5, cls: `${P}-pct`, attrs: { "aria-label": "PayTR masraf oranı (%)" } });
    let vatIncl = cfg.commissionVatIncluded === true;
    const vatSw = dkSwitch({ checked: vatIncl, disabled: savingCfg, variant: "cyan", label: "Komisyon KDV dahil", onChange: (on) => { vatIncl = on; } });
    const borneSel = (key, label) => {
      const wrap = dkSelect({ size: 40, value: cfg[key] === "payer" ? "payer" : "payee", options: [{ value: "payee", label: "Alıcı" }, { value: "payer", label: "Ödeyen" }], attrs: { "aria-label": label } });
      wrap.style.width = "140px";
      return wrap;
    };
    const feeBorne = dkSelect({ size: 40, value: cfg.paytrFeeBorneBy === "platform" ? "platform" : "payee",
      options: [{ value: "payee", label: "Alıcı (fiyata eklenir)" }, { value: "platform", label: "GigBridge" }], attrs: { "aria-label": "PayTR masrafını karşılayan" } });
    feeBorne.style.width = "190px";
    const aBorne = borneSel("artistCommissionBorneBy", "Sanatçı kiralamada komisyonu karşılayan");
    const vBorne = borneSel("venueCommissionBorneBy", "Mekan kiralamada komisyonu karşılayan");
    const num = (el) => parseFloat(el.value.replace(",", "."));
    const saveRates = dkButton("Oranları kaydet", { variant: "violet", size: 40, disabled: savingCfg, onClick: async () => {
      const av = num(a), vv = num(v), kv = num(vat), ev = num(est), fv = num(fee);
      if (!(av >= 0 && av <= 50) || !(vv >= 0 && vv <= 50)) { toast("Komisyon oranları %0 ile %50 arasında olmalı", { type: "err" }); return; }
      if (!(kv >= 0 && kv <= 50)) { toast("KDV oranı %0 ile %50 arasında olmalı", { type: "err" }); return; }
      if (!(ev >= 0 && ev <= 50)) { toast("Tahmini stopaj %0 ile %50 arasında olmalı", { type: "err" }); return; }
      if (!(fv >= 0 && fv <= 10)) { toast("PayTR masraf oranı %0 ile %10 arasında olmalı", { type: "err" }); return; }
      const ab = aBorne.querySelector("select").value, vb = vBorne.querySelector("select").value, fb = feeBorne.querySelector("select").value;
      const who = (x) => (x === "payer" ? "ödeyen" : "alıcı");
      if (await dkConfirm({ title: "Ödeme oranları",
        body: `Sanatçı %${av} · Mekan %${vv} komisyon + %${kv} KDV (${vatIncl ? "dahil" : "hariç"}). Komisyonu karşılayan: sanatçı kiralamada ${who(ab)}, mekan kiralamada ${who(vb)}. Tahmini stopaj %${ev} · PayTR masrafı %${fv} (${fb === "platform" ? "GigBridge karşılar" : "alıcının payından, fiyata eklenir"}). Yalnız yeni ödemelere uygulanır.`,
        confirmLabel: "Kaydet" })) {
        saveCfg({ artistCommissionRate: av / 100, venueCommissionRate: vv / 100, commissionVatRate: kv / 100, commissionVatIncluded: vatIncl,
          artistCommissionBorneBy: ab, venueCommissionBorneBy: vb, estimateStopajRate: ev / 100, paytrFeeRate: fv / 100, paytrFeeBorneBy: fb });
      }
    } });
    const test = dkSwitch({ checked: !!cfg.testMode, disabled: savingCfg, variant: "cyan", label: "Test modu", onChange: async (on, { revert }) => {
      const ok = await dkConfirm(on ? { title: "Test moduna geç", body: "Yeni ödemeler test modunda alınır.", confirmLabel: "Onayla" }
        : { title: "Canlı moda geç", body: "Yeni ödemelerde kartlardan GERÇEK para çekilir.", confirmLabel: "Onayla", danger: true });
      if (!ok) { revert(); return; }
      saveCfg({ testMode: on });
    } });
    const auto = dkSwitch({ checked: !!cfg.autoPayout, disabled: savingCfg, variant: "cyan", label: "Otomatik aktarım", onChange: (on) => saveCfg({ autoPayout: on }) });
    // Kaydetmeden önce de: alanlar değiştikçe özet taslak değerlerle yeniden hesaplanır
    const draft = () => {
      const n = (el, def) => { const x = num(el); return x >= 0 && x <= 50 ? x / 100 : def; };
      return { ...cfg, artistCommissionRate: n(a, cfg.artistCommissionRate), venueCommissionRate: n(v, cfg.venueCommissionRate),
        commissionVatRate: n(vat, cfg.commissionVatRate), commissionVatIncluded: vatIncl, estimateStopajRate: n(est, cfg.estimateStopajRate),
        paytrFeeRate: n(fee, cfg.paytrFeeRate), artistCommissionBorneBy: aBorne.querySelector("select").value, venueCommissionBorneBy: vBorne.querySelector("select").value,
        paytrFeeBorneBy: feeBorne.querySelector("select").value };
    };
    const live = () => { summary.update(draft(), taxRules); calc.update(draft()); };
    [a, v, vat, est, fee].forEach((el) => el.addEventListener("input", live));
    [aBorne, vBorne, feeBorne].forEach((el) => el.addEventListener("change", live));
    vatSw.addEventListener("click", () => setTimeout(live, 0));
    summary.update(cfg, taxRules);
    calc.update(cfg);
    const line = (label, subTxt, ctl) => h("div", { class: "dk-admin-etk-row" }, h("span", { class: "dk-admin-etk-who" }, h("span", { class: "dk-admin-etk-n" }, label), subTxt ? h("span", { class: "dk-admin-etk-e" }, subTxt) : null), ctl);
    cfgBox.replaceChildren(
      line("Sanatçı komisyonu (%)", null, a),
      line("Mekan komisyonu (%)", null, v),
      line("Komisyon KDV oranı (%)", "Komisyon faturasına eklenen KDV", vat),
      line("Komisyon KDV dahil", "Açıkken KDV komisyon tutarının içinden ayrılır; kapalıyken üstüne eklenir", vatSw),
      line("Komisyonu karşılayan · sanatçı kiralama", "Alıcı: payından düşer · Ödeyen: brütün üstüne eklenir", aBorne),
      line("Komisyonu karşılayan · mekan kiralama", null, vBorne),
      line("Tahmini stopaj (%)", "Yalnız ödeme öncesi ekrandaki tahmin; gerçek kesinti kanuna göre (GVK md. 94)", est),
      line("PayTR masraf oranı (%)", "PayTR'nin tahsilattan aldığı oran (sözleşmedeki)", fee),
      line("PayTR masrafını karşılayan", "Alıcı: sanatçının payından düşer, \"cebine girecek\" fiyat girişinde fiyata eklenir · GigBridge: komisyondan karşılanır", feeBorne),
      h("div", { class: "dk-admin-etk-tools" }, saveRates),
      line("Test modu", "Açıkken PayTR gerçek para çekmez (test_mode=1)", test),
      line("Otomatik aktarım", "Kapalıyken uygun ödemeler \"serbest bırakılacak\" listesinde bekler", auto),
      h("a", { href: "#/admin/finans", class: "dk-admin-etk-sum dk-link" }, "Vergi kuralları, finansal inceleme ve dışa aktarım → Finans"),
      cfg.testMode ? dkInlineMessage("info", "Test modu açık: yeni ödemelerde kartlardan para çekilmez.") : dkInlineMessage("err", "Canlı mod: yeni ödemelerde kartlardan gerçek para çekilir."));
  }
  async function loadCfg() {
    cfgBox.replaceChildren(dkSkeleton({ w: 240, h: 14 }), dkSkeleton({ w: 200, h: 14 }));
    try {
      const [c, r] = await Promise.all([payApi.admin({ action: "getConfig" }), payApi.admin({ action: "listRules" }).catch(() => ({ rules: [] }))]);
      cfg = c.config; taxRules = r.rules || [];
      if (alive) drawCfg();
    }
    catch (e) {
      console.error(e);
      if (!alive) return;
      cfgBox.replaceChildren(h("span", { class: "dk-admin-etk-sum", role: "alert" }, errText(e)), dkButton("Tekrar dene", { variant: "outline", size: 36, icon: "refresh", onClick: loadCfg }));
    }
  }
  const cfgCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Ödeme ayarları" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "ÖDEME AYARLARI")), cfgBox);
  const noteCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Aktarım notu" },
    h("div", { class: "dk-admin-etk-form" }, h("div", { class: `${P}-note` }, svgIcon("info", { size: 14, color: "#8A8E97" }),
      h("span", {}, "Aktarımlar her gün 08:00'de yapılır (PayTR: ödeme günü aktarım yok, 10:00 sonrası istekler ertesi gün işlenir). Belirsiz sonuçlu aktarımları PayTR mağaza panelinden kontrol etmeden yeniden serbest bırakma."))));

  root.append(hero, h("div", { class: cx("dk-admin-panel-grid", "dk-admin-etk-g2") }, h("div", { class: "dk-admin-etk-col" }, listCard, calc.el, summary.el), h("div", { class: "dk-admin-etk-col" }, cfgCard, noteCard)));

  // ══════════ şikayet çekmecesi (AdminDisputeModal) ══════════
  let drawer = null, drawerOid = null;
  function openDispute(oid) {
    if (!isOid(oid)) return;
    if (drawer && drawerOid === oid) return;
    drawer?.close("switch");
    drawerOid = oid;
    writeQuery({ sec: oid });
    const body = h("div", { class: "dk-pay-dsp" });
    let d = null, dbusy = false;
    const d0 = dkDrawer({ eyebrow: "ÖDEME ŞİKAYETİ · YÖNETİCİ", title: "Şikayet", body, width: 680, cls: "dk-pay-drw",
      onClose: (r) => { if (drawerOid === oid) { drawer = null; drawerOid = null; if (r !== "route" && r !== "switch" && alive) writeQuery({ sec: null }); } } });
    drawer = d0;
    const section = (title, ...kids) => h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, title), h("div", { class: "dk-pay-box" }, ...kids));
    const note = dkTextarea({ rows: 3, maxlength: 500, placeholder: "Karar notu (iki taraf görür)" });
    const partialIn = dkInput({ size: 40, placeholder: "Kısmi iade (₺)", inputmode: "decimal", maxlength: 10, attrs: { "aria-label": "Kısmi iade tutarı" } });
    async function dload() {
      body.replaceChildren(dkSkeleton({ w: "60%", h: 16 }), dkSkeleton({ w: "100%", h: 140, r: 8 }));
      try { d = await payApi.getPaymentDispute({ merchantOid: oid }); }
      catch (e) { body.replaceChildren(dkInlineMessage("err", errText(e)), dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: dload })); return; }
      if (alive) draw();
    }
    function decide(decision) {
      const pay = d.payment;
      const remaining = pay.grossKurus - (pay.refundedKurus || 0);
      const partialK = parseTLToKurus(partialIn.value);
      const text = decision === "refund_full" ? `${fmtKurus(remaining)} ödeyene (${pay.payerName}) iade edilecek.`
        : decision === "refund_partial" ? `${fmtKurus(partialK)} ödeyene iade edilecek; kalan ${fmtKurus(remaining - partialK)} üzerinden komisyon ve stopaj yeniden hesaplanıp ${pay.payeeName} hesabına aktarılacak.`
        : `${pay.payeeName} hesabına aktarım başlatılacak (ödeme gününde aktarım yapılmaz).`;
      return dkConfirm({ title: "Kararı onayla", body: `${text} Bu işlem geri alınamaz; iki tarafa bildirim gider.`, confirmLabel: "Onayla", danger: decision !== "release" }).then(async (ok) => {
        if (!ok || dbusy) return;
        dbusy = true; draw();
        try {
          await payApi.admin({ action: "resolveDispute", merchantOid: oid, decision, note: note.input.value.trim(), ...(decision === "refund_partial" ? { amountKurus: partialK } : {}) });
          toast("Karar kaydedildi");
          load(); loadDisputeCount();
          dbusy = false; await dload();
        } catch (e) { toast(errText(e), { type: "err" }); dbusy = false; draw(); }
      });
    }
    async function approvePhotos() {
      if (dbusy) return;
      dbusy = true; draw();
      try {
        const r = await payApi.admin({ action: "approveCheckinPhotos", merchantOid: oid });
        toast(r?.released ? "Fotoğraflar onaylandı · şikayet kapandı (iade yok)" : "Fotoğraflar onaylandı");
        load(); dbusy = false; await dload();
      } catch (e) { toast(errText(e), { type: "err" }); dbusy = false; draw(); }
    }
    function draw() {
      const pay = d.payment, disp = d.dispute, att = d.attendance;
      d0.setTitle(pay?.title || "Şikayet");
      const kids = [];
      if (pay) {
        kids.push(h("p", { class: "dk-pay-lead" }, `${pay.payerName} → ${pay.payeeName} · ${pay.kind === "venue_rental" ? "Mekan kiralama" : "Sanatçı kiralama"}`),
          h("p", { class: "dk-pay-lead" }, `Brüt ${fmtKurus(pay.grossKurus)} · iade edilen ${fmtKurus(pay.refundedKurus)} · etkinlik ${fmtDTShort(pay.eventStartMs)}`));
      }
      if (disp) kids.push(h("div", {}, dkStatusBadge({ label: DISPUTE_STATUS_LABEL[disp.status] || disp.status, color: disp.status === "resolved" ? TONE_COLOR.ok : TONE_COLOR.warn }, { variant: "box" })));
      if (disp) {
        kids.push(section(`ÖDEYEN · ${String(disp.categoryLabel || "").toLocaleUpperCase("tr-TR")}`,
          h("span", { class: "dk-pay-tl" }, fmtDTShort(disp.openedAt)), h("p", { class: "dk-pay-body dk-pay-pre" }, disp.description), evidenceGallery(disp.evidence)));
        kids.push(section("KARŞI TARAF", ...(disp.response
          ? [h("span", { class: "dk-pay-tl" }, fmtDTShort(disp.response.at)), h("p", { class: "dk-pay-body dk-pay-pre" }, disp.response.text), evidenceGallery(disp.response.evidence)]
          : [h("span", { class: "dk-pay-muted" }, `Yanıt yok (süre: ${fmtDTShort(disp.responseDeadlineMs)})`)])));
      } else kids.push(h("p", { class: "dk-pay-muted" }, "Bu ödeme için kanıtlı şikayet yok."));
      if (att) {
        const face = (x) => (x.faceOk === true ? "doğrulandı" : x.faceOk === false ? "yok" : "kontrol edilemedi");
        const photos = att.photos ? [{ url: att.photos.in, label: `Giriş · ${fmtDTShort(att.checkIn?.at)}` }, { url: att.photos.out, label: `Çıkış · ${fmtDTShort(att.checkOut?.at)}` }].filter((x) => x.url) : [];
        const canApprove = !att.verified && att.checkIn && att.checkOut && att.checkIn.faceOk !== false && att.checkOut.faceOk !== false && !att.photosApproved;
        kids.push(section("SAHNE KAYDI (GİG)",
          h("span", { class: "dk-pay-body" }, `Giriş: ${att.checkIn ? `${fmtDTShort(att.checkIn.at)} · yüz ${face(att.checkIn)}` : "yok"}`),
          h("span", { class: "dk-pay-body" }, `Çıkış: ${att.checkOut ? `${fmtDTShort(att.checkOut.at)} · yüz ${face(att.checkOut)}` : "yok"}`),
          h("span", { class: "dk-pay-body", style: { color: att.verified ? "#7CE0B0" : "#FFB347" } }, att.verified ? "Kayıt doğrulanmış: iade yapılamaz." : "Kayıt doğrulanmamış: kanıtlara göre karar ver."),
          photos.length ? h("div", { class: "dk-pay-gal" }, ...photos.map((ph, i) => h("button", { type: "button", class: "dk-pay-cell dk-press", "aria-label": `${ph.label}, büyüt`, onclick: () => openImageViewer(photos, i) },
            h("img", { src: ph.url, alt: "" }), h("span", { class: "dk-pay-ctag" }, ph.label)))) : null,
          canApprove ? dkButton("Fotoğrafları onayla", { variant: "success", size: 36, icon: "check", disabled: dbusy, onClick: approvePhotos }) : null));
      }
      if (d.serviceTerms) kids.push(h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, "ONAYLANAN HİZMET KAPSAMI"), serviceTermsView(d.serviceTerms)));
      if (disp?.resolution) {
        kids.push(section("KARAR", h("span", { class: "dk-pay-body is-strong" }, decisionText(disp.resolution.decision, disp.resolution.amountKurus)),
          disp.resolution.note ? h("p", { class: "dk-pay-body dk-pay-pre" }, disp.resolution.note) : null, h("span", { class: "dk-pay-tl" }, fmtDTShort(disp.resolution.at))));
      } else if (disp && pay) {
        const remaining = pay.grossKurus - (pay.refundedKurus || 0);
        const verified = !!att?.verified;
        const hint = h("span", { class: "dk-pay-muted" });
        const full = dkButton(`Tam iade · ${fmtKurus(remaining)}`, { variant: "danger-outline", size: 36, onClick: () => decide("refund_full") });
        const rel = dkButton("Alıcıya aktar", { variant: "success", size: 36, onClick: () => decide("release") });
        const part = dkButton("Kısmi iade", { variant: "outline", size: 36, onClick: () => decide("refund_partial") });
        const sync = () => {
          const ok = note.input.value.trim().length >= 5;
          const pk = parseTLToKurus(partialIn.value);
          full.disabled = dbusy || !ok || verified;
          rel.disabled = dbusy || !ok;
          part.disabled = dbusy || !ok || verified || !(pk >= 1 && pk < remaining);
          hint.textContent = ok ? "" : "Karar için en az 5 karakterlik not yaz.";
        };
        note.input.oninput = sync;
        partialIn.oninput = () => { partialIn.value = partialIn.value.replace(/[^0-9.,]/g, "").slice(0, 10); sync(); };
        sync();
        kids.push(section("KARAR VER", note, h("div", { class: "dk-pay-btns" }, full, rel), h("div", { class: "dk-pay-btns" }, partialIn, part), hint));
      }
      body.replaceChildren(...kids);
    }
    dload();
  }

  // ══════════ başlangıç ══════════
  drawChips(); drawList();
  if (uid) { load(); loadCfg(); if (_group !== "sikayetler") loadDisputeCount(); }
  const sec0 = q0?.get?.("sec");
  if (sec0 && isOid(sec0)) openDispute(sec0);

  return {
    node: shell.node,
    update(q) {
      const g = q?.get?.("grup");
      if (g && g !== _group && ADMIN_GROUPS.some((x) => x.key === g)) { _group = g; drawChips(); load(); }
      const sc = q?.get?.("sec");
      if (sc && isOid(sc)) openDispute(sc); else if (!sc && drawer) drawer.close("query");
    },
    onSession(ns) { return !!ns?.user && ns.user.uid === uid && !!ns.isAdmin; },
    destroy() { alive = false; shell.destroy(); },
  };
}
