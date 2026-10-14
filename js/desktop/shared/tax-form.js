// VERGİ BİLGİLERİ (Finans v2) — sanatçı (performer: A/B/C) ve mekan / organizatör (business) vergi profili formu.
// Uygulama karşılığı: screens/common/TaxProfileScreen. Sunucu: setTaxProfile / getTaxProfile (europe-west1; rol sunucuda
// userType'tan). TCKN/VKN checksum'ı sunucu doğrular → HttpsError iletisi (Türkçe) AYNEN gösterilir. Kaydedilince durum
// 'submitted' (İNCELEMEDE); admin doğrulayınca 'verified', reddederse 'rejected' + adminNote.
// Görsel dil: ödeme kartlarıyla aynı (css/dk-odeme.css .dk-pay-acct / .dk-pay-form / .dk-tax-*); payments.js içe aktarılınca CSS gelir.
import { h } from "../../ui.js";
import { cx, dkButton, dkInput, dkTextarea, dkSelect, dkCheckbox, dkRadioGroup, dkStatusBadge, dkSkeleton, dkInlineMessage, dkConfirm } from "./ui.js";
import { LEGAL } from "./assets.js";
import { TAX_INFO, ARIZI_DECLARATION, ARIZI_LIMIT_TL, TAX_INFO_NOTE } from "./tax-info.js";
import { payApi, alertModal, paymentErrorText, isDemoUser, invalidateTaxProfile, fmtDT, TONE_COLOR } from "./payments.js";

export const TAX_STATUS = {
  none: { text: "EKSİK", tone: "warn" },
  submitted: { text: "İNCELEMEDE", tone: "info" },
  verified: { text: "DOĞRULANDI", tone: "ok" },
  rejected: { text: "REDDEDİLDİ", tone: "bad" },
};
const PERF_CATS = [
  { value: "A", label: "A · Vergi mükellefi değilim (bireysel sanatçı)" },
  { value: "B", label: "B · Vergi mükellefiyim (serbest meslek / şahıs şirketi)" },
  { value: "C", label: "C · Şirket, ajans ya da temsilci üzerinden çalışıyorum" },
];
const ACTIVITY = [
  { value: "arizi", label: "Arızi · ara sıra sahne alıyorum" },
  { value: "duzenli", label: "Düzenli · sürekli sahne alıyorum" },
];
const PERF_DOCS = [{ value: "e_smm", label: "e-Serbest Meslek Makbuzu" }, { value: "e_fatura", label: "e-Fatura" }, { value: "e_arsiv", label: "e-Arşiv Fatura" }];
const DOC_RESP = [
  { value: "artist", label: "Ben (sanatçı)" },
  { value: "company", label: "Şirket" },
  { value: "representative", label: "Temsilci / menajer" },
];
const BIZ_TYPES = [
  { value: "sahis", label: "Şahıs işletmesi" }, { value: "limited", label: "Limited şirket" }, { value: "anonim", label: "Anonim şirket" },
  { value: "kooperatif", label: "Kooperatif" }, { value: "dernek", label: "Dernek / vakıf" }, { value: "kamu", label: "Kamu kurumu" }, { value: "diger", label: "Diğer" },
];
const STOPAJ_RESP = [
  { value: "evet", label: "Evet · stopajı kendimiz kesip muhtasar beyannameyle bildiriyoruz" },
  { value: "hayir", label: "Hayır · stopaj sorumlusu değiliz" },
  { value: "bilmiyorum", label: "Bilmiyorum · mali müşavirimize soracağız" },
];
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const masked = (v) => typeof v === "string" && v.includes("*");

/** Vergi durumu rozeti */
export function taxStatusBadge(status) {
  const l = TAX_STATUS[status] || TAX_STATUS.none;
  return dkStatusBadge({ label: l.text, color: TONE_COLOR[l.tone] }, { variant: "box" });
}

/**
 * Vergi Bilgileri kartı. role: "artist" → performer formu; "venue" | "organizer" → business formu.
 * Dönüş: { node, focus(), destroy() }
 */
export function taxProfileCard({ role = "artist", embedded = false } = {}) {
  const performer = role === "artist";
  const node = h(embedded ? "div" : "section", { class: cx("dk-pay-acct", "dk-tax", embedded && "is-embedded"), id: "vergi-bilgileri", "aria-labelledby": embedded ? null : "dk-tax-h", tabindex: "-1" });
  let alive = true, data = null, err = false, saving = false;
  const badgeBox = h("span", { class: "dk-tax-badge" });
  // embedded: profil sekmesinin içinde (bölüm başlığı zaten "Vergi Bilgileri") → yalnız rozet + açıklama
  const head = h("div", { class: "dk-pay-acct-head" },
    h("div", { class: "dk-tax-top" }, h("span", { class: "dk-pay-kick" }, "FİNANS · VERGİ"), badgeBox),
    embedded ? null : h("h2", { id: "dk-tax-h", class: "dk-pay-acct-t" }, "Vergi Bilgileri"),
    h("p", { class: "dk-pay-text" }, performer
      ? "Ödemelerinde doğru vergi kesintisinin (stopaj) uygulanması ve belgelerin düzenlenmesi için gerekli. Bilgiler eksikse ödemen finansal incelemede bekleyebilir."
      : "Sanatçı ve mekan ödemelerinde stopaj sorumluluğunun ve faturanın doğru belirlenmesi için gerekli. Bilgiler eksikse ödemeler finansal incelemede bekleyebilir."));
  const body = h("div", { class: "dk-pay-acct-body" });
  node.append(head, body);

  // ── alanlar ──
  const F = {};
  const inp = (key, o = {}) => (F[key] = dkInput({ size: 44, autocomplete: "off", ...o, attrs: { spellcheck: "false", ...(o.attrs || {}) } }));
  const fld = (label, ctl, hint) => h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, label), ctl, hint ? h("span", { class: "dk-pay-fine" }, hint) : null);
  const box = (label, ctl, hint) => h("div", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, label), ctl, hint ? h("span", { class: "dk-pay-fine" }, hint) : null);
  const selOf = (wrap) => wrap.querySelector("select");
  const errEl = h("span", { class: "dk-pay-err", role: "alert" });
  let kvkk = false;
  const kvkkBox = dkCheckbox({ label: "Vergi bilgilerimin ödeme, belge düzenleme ve yasal yükümlülükler için işlenmesini kabul ediyorum (KVKK).", checked: false, cls: "dk-pay-agree", onChange: (v) => { kvkk = v; } });
  const kvkkLink = LEGAL?.privacy ? h("a", { href: LEGAL.privacy, target: "_blank", rel: "noopener", class: "dk-link dk-tax-kvkk" }, "KVKK Aydınlatma Metni") : null;

  // performer
  let cat = "A", activity = "arizi", vatReg = false, ariziOk = false;
  // Seçilen vergi durumunun sade anlatımı (tax-info.js) + A için zorunlu beyan + bu yılki toplam (350.000 TL sınırı)
  const infoBox = performer ? h("div", { class: "dk-pay-tbox", style: { display: "grid", gap: "6px" } }) : null;
  const yearBox = performer ? h("div") : null;
  const ariziBox = performer ? dkCheckbox({ label: ARIZI_DECLARATION, checked: false, cls: "dk-pay-agree", onChange: (v) => { ariziOk = v; } }) : null;
  function paintInfo() {
    if (!performer) return;
    const t = TAX_INFO[cat];
    infoBox.replaceChildren(
      h("strong", { style: { fontSize: "13.5px" } }, t.title),
      h("ul", { style: { margin: "0", paddingLeft: "18px", display: "grid", gap: "4px", fontSize: "13px", lineHeight: "1.5" } }, ...t.points.map((x) => h("li", {}, x))),
      h("span", { class: "dk-pay-fine" }, `Örnek: ${t.example}`),
      h("span", { class: "dk-pay-fine" }, TAX_INFO_NOTE));
    ariziBox.hidden = cat !== "A";
    yearBox.hidden = cat !== "A";
  }
  function paintYear() {
    if (!performer || !data) return;
    const used = Math.round((data.yearGrossKurus || 0) / 100);
    const lim = Math.round((data.ariziLimitKurus || ARIZI_LIMIT_TL * 100) / 100);
    const fmt = (n) => `${n.toLocaleString("tr-TR")} TL`;
    const kind = used > lim ? "err" : used >= lim * 0.8 ? "warn" : "info";
    const msg = used > lim
      ? `${data.year || ""} yılında GigBridge üzerinden aldığın ödemeler ${fmt(used)} ile ${fmt(lim)} sınırını aştı. Yıllık beyanname vermen ve vergi kaydı (şahıs şirketi) açman gerekebilir; ödemelerin finans incelemesinden geçer.`
      : `${data.year || ""} yılında GigBridge üzerinden aldığın ödemeler: ${fmt(used)} / ${fmt(lim)} (GigBridge dışındaki işlerin bu sayıya dahil değil).`;
    yearBox.replaceChildren(dkInlineMessage(kind === "warn" ? "info" : kind, msg));
  }
  const catGroup = performer ? dkRadioGroup({ items: PERF_CATS, value: cat, label: "Vergi durumu", onChange: (v) => { cat = v; paintCat(); paintInfo(); } }) : null;
  const actGroup = performer ? dkRadioGroup({ items: ACTIVITY, value: activity, label: "Faaliyet sıklığı", onChange: (v) => { activity = v; } }) : null;
  const vatBox = performer ? dkCheckbox({ label: "KDV mükellefiyim", checked: false, onChange: (v) => { vatReg = v; } }) : null;
  const docSel = performer ? dkSelect({ size: 44, options: PERF_DOCS, value: "e_smm", attrs: { "aria-label": "Düzenleyeceğin belge" } }) : null;
  const respSel = performer ? dkSelect({ size: 44, options: DOC_RESP, value: "company", attrs: { "aria-label": "Belgeyi kim düzenler" } }) : null;
  // business
  let stopajResp = "bilmiyorum";
  const bizSel = !performer ? dkSelect({ size: 44, options: BIZ_TYPES, value: "limited", attrs: { "aria-label": "İşletme türü" }, onChange: () => paintBiz() }) : null;
  const stopajGroup = !performer ? dkRadioGroup({ items: STOPAJ_RESP, value: stopajResp, label: "Stopaj sorumluluğu", onChange: (v) => { stopajResp = v; } }) : null;
  const addr = !performer ? dkTextarea({ rows: 3, maxlength: 300, placeholder: "Fatura adresi (mahalle, cadde, no, ilçe / il)" }) : null;

  inp("fullName", { maxlength: 80, placeholder: "Kimlikteki ad soyad", autocomplete: "name" });
  inp("tckn", { maxlength: 11, inputmode: "numeric", placeholder: "11 haneli T.C. kimlik no", cls: "dk-pay-mono" });
  inp("vkn", { maxlength: 10, inputmode: "numeric", placeholder: "10 haneli vergi kimlik no", cls: "dk-pay-mono" });
  inp("taxOffice", { maxlength: 60, placeholder: "örn. Beşiktaş" });
  inp("title", { maxlength: 120, placeholder: performer ? "Şirket / ticari unvan" : "Ticari unvan ya da işletme adı" });
  inp("repName", { maxlength: 80, placeholder: "Temsilcinin adı soyadı" });
  inp("repTckn", { maxlength: 11, inputmode: "numeric", placeholder: "Temsilcinin T.C. kimlik no", cls: "dk-pay-mono" });
  inp("accountantName", { maxlength: 80, placeholder: "Mali müşavir adı (opsiyonel)" });
  inp("accountantPhone", { maxlength: 20, inputmode: "tel", placeholder: "Telefon (opsiyonel)" });
  inp("accountantEmail", { maxlength: 100, inputmode: "email", placeholder: "E-posta (opsiyonel)" });
  ["tckn", "vkn", "repTckn"].forEach((k) => F[k].addEventListener("input", () => { F[k].value = digits(F[k].value).slice(0, k === "vkn" ? 10 : 11); }));

  // koşullu bloklar
  const rows = {
    fullName: fld("AD SOYAD", F.fullName),
    tckn: fld("T.C. KİMLİK NO", F.tckn),
    vkn: fld("VERGİ KİMLİK NO", F.vkn),
    taxOffice: fld("VERGİ DAİRESİ", F.taxOffice),
    title: fld(performer ? "UNVAN" : "UNVAN / İŞLETME ADI", F.title),
    activity: performer ? box("FAALİYET SIKLIĞI", actGroup) : null,
    vat: vatBox,
    doc: performer ? box("DÜZENLEYECEĞİN BELGE", docSel) : null,
    rep: h("div", { class: "dk-tax-grid" }, fld("TEMSİLCİ AD SOYAD", F.repName), fld("TEMSİLCİ T.C. KİMLİK NO", F.repTckn)),
    resp: performer ? box("BELGEYİ KİM DÜZENLER", respSel) : null,
  };
  function paintCat() {
    if (!performer) return;
    const show = (el, on) => { if (el) el.hidden = !on; };
    show(rows.tckn, cat === "A" || cat === "B");
    show(rows.activity, cat === "A");
    show(rows.vkn, cat === "B" || cat === "C");
    show(rows.taxOffice, cat === "B" || cat === "C");
    show(rows.title, cat === "B" || cat === "C");
    show(rows.vat, cat === "B");
    show(rows.doc, cat === "B");
    show(rows.rep, cat === "C");
    show(rows.resp, cat === "C");
    rows.tckn.querySelector(".dk-lbl").textContent = cat === "B" ? "T.C. KİMLİK NO (VKN YOKSA)" : "T.C. KİMLİK NO";
    rows.vkn.querySelector(".dk-lbl").textContent = cat === "B" ? "VERGİ KİMLİK NO (VARSA)" : "VERGİ KİMLİK NO";
  }
  function paintBiz() {
    if (performer) return;
    const sahis = selOf(bizSel).value === "sahis";
    rows.tckn.hidden = !sahis;
    rows.vkn.querySelector(".dk-lbl").textContent = sahis ? "VERGİ KİMLİK NO (VARSA)" : "VERGİ KİMLİK NO";
  }

  const form = performer
    ? h("div", { class: "dk-pay-form" },
      box("VERGİ DURUMUN", catGroup), infoBox,
      rows.fullName, rows.activity, h("div", { class: "dk-tax-grid" }, rows.tckn, rows.vkn), h("div", { class: "dk-tax-grid" }, rows.taxOffice, rows.title),
      rows.vat, rows.doc, rows.rep, rows.resp, yearBox, ariziBox)
    : h("div", { class: "dk-pay-form" },
      box("İŞLETME TÜRÜ", bizSel), rows.title, h("div", { class: "dk-tax-grid" }, rows.vkn, rows.tckn), rows.taxOffice,
      fld("FATURA ADRESİ", addr),
      box("STOPAJ SORUMLUSU MUSUNUZ?", stopajGroup, "Sanatçıya yapılan ödemelerde stopajı siz mi kesiyorsunuz? Emin değilseniz \"Bilmiyorum\" seçin; finans ekibi netleştirir."),
      h("span", { class: "dk-pay-sub" }, "MALİ MÜŞAVİR (OPSİYONEL)"),
      F.accountantName, h("div", { class: "dk-tax-grid" }, F.accountantPhone, F.accountantEmail));
  paintCat(); paintBiz(); paintInfo();

  const setVal = (k, v) => { const el = F[k]; if (!el) return; if (masked(v)) { el.value = ""; el.placeholder = `${v} · değiştirmek için yeniden gir`; el.dataset.masked = "1"; } else { el.value = v ?? ""; delete el.dataset.masked; } };
  function fill(pr) {
    if (!pr) return;
    ["fullName", "tckn", "vkn", "taxOffice", "title", "repName", "repTckn", "accountantName", "accountantPhone", "accountantEmail"].forEach((k) => { if (pr[k] != null) setVal(k, String(pr[k])); });
    if (performer) {
      if (["A", "B", "C"].includes(pr.category)) { cat = pr.category; catGroup.dk.set(cat); }
      if (["arizi", "duzenli"].includes(pr.activity)) { activity = pr.activity; actGroup.dk.set(activity); }
      if (pr.category === "A" && data?.ariziAccepted) { ariziOk = true; ariziBox.dk.set(true); }
      vatReg = pr.vatRegistered === true; vatBox.dk.set(vatReg);
      if (pr.docType) selOf(docSel).value = pr.docType;
      if (pr.docResponsible) selOf(respSel).value = pr.docResponsible;
      paintCat(); paintInfo();
    } else {
      if (pr.businessType) selOf(bizSel).value = pr.businessType;
      if (pr.billingAddress) addr.input.value = pr.billingAddress;
      if (["evet", "hayir", "bilmiyorum"].includes(pr.stopajResponsible)) { stopajResp = pr.stopajResponsible; stopajGroup.dk.set(stopajResp); }
      paintBiz();
    }
    if (pr.kvkkAccepted === true) { kvkk = true; kvkkBox.dk.set(true); }
  }

  // ── istemci ön denetimi (biçim; checksum sunucuda) → hata | null ──
  const v = (k) => F[k].value.trim();
  const keepMasked = (k) => F[k].dataset.masked === "1" && !v(k);
  function collect() {
    if (performer) {
      const out = { category: cat, fullName: v("fullName"), kvkkAccepted: kvkk };
      if (out.fullName.length < 3) return { error: "Ad soyadını gir." };
      if (cat === "A") {
        out.activity = activity;
        if (!keepMasked("tckn")) { if (digits(v("tckn")).length !== 11) return { error: "T.C. kimlik numarası 11 haneli olmalı." }; out.tckn = v("tckn"); }
        if (!ariziOk) return { error: "Vergi kaydı olmayan sanatçı beyanını okuyup onay kutusunu işaretle." };
        out.ariziAccepted = true;
      } else if (cat === "B") {
        if (v("vkn")) { if (v("vkn").length !== 10) return { error: "Vergi kimlik numarası 10 haneli olmalı." }; out.vkn = v("vkn"); }
        if (v("tckn")) { if (v("tckn").length !== 11) return { error: "T.C. kimlik numarası 11 haneli olmalı." }; out.tckn = v("tckn"); }
        if (!out.vkn && !out.tckn && !keepMasked("vkn") && !keepMasked("tckn")) return { error: "Vergi kimlik numarası ya da T.C. kimlik numarası gir." };
        if (v("taxOffice").length < 2) return { error: "Vergi dairesini gir." };
        out.taxOffice = v("taxOffice"); if (v("title")) out.title = v("title");
        out.vatRegistered = vatReg; out.docType = selOf(docSel).value;
      } else {
        if (v("title").length < 2) return { error: "Şirket unvanını gir." };
        if (!keepMasked("vkn")) { if (v("vkn").length !== 10) return { error: "Şirketin vergi kimlik numarası 10 haneli olmalı." }; out.vkn = v("vkn"); }
        if (v("taxOffice").length < 2) return { error: "Vergi dairesini gir." };
        if (v("repName").length < 3) return { error: "Temsilcinin adını gir." };
        if (!keepMasked("repTckn")) { if (v("repTckn").length !== 11) return { error: "Temsilcinin T.C. kimlik numarası 11 haneli olmalı." }; out.repTckn = v("repTckn"); }
        out.title = v("title"); out.taxOffice = v("taxOffice"); out.repName = v("repName"); out.docResponsible = selOf(respSel).value;
      }
      if (!kvkk) return { error: "Devam etmek için KVKK onayını işaretle." };
      return { data: out };
    }
    const businessType = selOf(bizSel).value;
    const out = { businessType, title: v("title"), taxOffice: v("taxOffice"), billingAddress: addr.input.value.trim(), stopajResponsible: stopajResp, kvkkAccepted: kvkk };
    if (out.title.length < 2) return { error: "Unvanı ya da işletme adını gir." };
    if (businessType === "sahis") {
      if (v("vkn")) { if (v("vkn").length !== 10) return { error: "Vergi kimlik numarası 10 haneli olmalı." }; out.vkn = v("vkn"); }
      else if (!keepMasked("tckn") && !keepMasked("vkn")) { if (v("tckn").length !== 11) return { error: "Şahıs işletmesinde VKN ya da 11 haneli T.C. kimlik numarası gir." }; out.tckn = v("tckn"); }
    } else if (!keepMasked("vkn")) { if (v("vkn").length !== 10) return { error: "Vergi kimlik numarası 10 haneli olmalı." }; out.vkn = v("vkn"); }
    if (out.taxOffice.length < 2) return { error: "Vergi dairesini gir." };
    if (out.billingAddress.length < 10) return { error: "Fatura adresini gir." };
    if (v("accountantName")) out.accountantName = v("accountantName");
    if (v("accountantPhone")) out.accountantPhone = v("accountantPhone");
    if (v("accountantEmail")) out.accountantEmail = v("accountantEmail");
    if (!kvkk) return { error: "Devam etmek için KVKK onayını işaretle." };
    return { data: out };
  }

  const saveBtn = dkButton("Vergi bilgilerini kaydet", { variant: "role", size: 44, icon: "check", busyLabel: "Kaydediliyor…", onClick: () => save() });
  async function save() {
    if (saving) return;
    if (isDemoUser()) { alertModal("Demo Mod", "Demo hesapta vergi bilgisi kaydedilemez."); return; }
    const c = collect();
    errEl.textContent = c.error || "";
    if (c.error) return;
    if (data?.status === "verified" && !(await dkConfirm({ title: "Vergi bilgilerini değiştir", body: "Doğrulanmış bilgilerin değişirse yeniden incelenir. Bu sürede ödemelerin finansal incelemede bekleyebilir.", confirmLabel: "Kaydet" }))) return;
    saving = true; saveBtn.dk.setBusy(true);
    try {
      const r = await payApi.setTaxProfile(c.data);
      invalidateTaxProfile();
      try { window.dispatchEvent(new CustomEvent("gb:tax-profile")); } catch (_) {}
      data = { ...(data || {}), exists: true, status: r?.status || "submitted", adminNote: "", updatedAt: Date.now(), profile: { ...(data?.profile || {}), ...c.data } };
      alertModal("Kaydedildi", "Vergi bilgilerin GigBridge finans ekibine iletildi. Doğrulanınca ödemelerin buna göre işlenir.");
      draw();
    } catch (e) {
      errEl.textContent = paymentErrorText(e);
    } finally { saving = false; if (saveBtn.isConnected) saveBtn.dk.setBusy(false); }
  }

  function draw() {
    if (!alive) return;
    if (err) { body.replaceChildren(dkInlineMessage("err", "Vergi bilgilerin yüklenemedi. Bağlantını kontrol et."), dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: load })); return; }
    if (!data) { body.replaceChildren(dkSkeleton({ w: "100%", h: 160, r: 8 })); return; }
    const st = data.exists ? data.status : "none";
    badgeBox.replaceChildren(taxStatusBadge(st));
    const kids = [];
    if (st === "rejected") kids.push(dkInlineMessage("err", `Vergi bilgilerin reddedildi${data.adminNote ? `: ${data.adminNote}` : "."} Düzeltip yeniden gönder.`));
    else if (st === "submitted") kids.push(dkInlineMessage("info", "Bilgilerin finans ekibince inceleniyor."));
    else if (st === "verified") kids.push(dkInlineMessage("ok", `Vergi bilgilerin doğrulandı${data.updatedAt ? ` · ${fmtDT(data.updatedAt)}` : ""}.`));
    else kids.push(dkInlineMessage("info", "Vergi bilgilerini henüz girmedin. Ödemelerin gecikmeden aktarılması için tamamla."));
    kids.push(form, h("div", { class: "dk-tax-kv" }, kvkkBox, kvkkLink), errEl, h("div", { class: "dk-pay-btns" }, saveBtn),
      h("p", { class: "dk-pay-fine" }, "Kimlik ve vergi numaraların yalnız GigBridge finans ekibi ve yasal yükümlülükler için kullanılır; profilinde görünmez."));
    body.replaceChildren(...kids);
  }
  async function load() {
    err = false; data = null; draw();
    if (isDemoUser()) { data = { exists: false }; draw(); return; }
    try {
      const r = await payApi.getTaxProfile();
      if (!alive) return;
      data = { exists: !!r?.exists, status: r?.status || null, adminNote: r?.adminNote || "", updatedAt: typeof r?.updatedAt === "number" ? r.updatedAt : r?.updatedAt?._seconds ? r.updatedAt._seconds * 1000 : null, profile: r?.profile || null,
        ariziAccepted: !!r?.ariziAcceptedAt, year: r?.year || null, yearGrossKurus: r?.yearGrossKurus || 0, ariziLimitKurus: r?.ariziLimitKurus || ARIZI_LIMIT_TL * 100 };
      fill(data.profile);
      paintYear();
    } catch (e) { console.warn("[vergi]", e); err = true; }
    draw();
  }
  load();
  return {
    node,
    focus() { try { node.scrollIntoView({ block: "start", behavior: "smooth" }); node.focus({ preventScroll: true }); } catch (_) {} },
    destroy() { alive = false; },
  };
}
