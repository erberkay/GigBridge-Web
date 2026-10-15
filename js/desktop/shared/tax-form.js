// VERGİ BİLGİLERİ (Finans v2) — sanatçı (performer: A/B/C) ve mekan / organizatör (business) vergi profili formu.
// Uygulama karşılığı: screens/common/TaxProfileScreen. Sunucu: setTaxProfile / getTaxProfile (europe-west1; rol sunucuda
// userType'tan). TCKN/VKN checksum'ı sunucu doğrular → HttpsError iletisi (Türkçe) AYNEN gösterilir. Kaydedilince durum
// 'submitted' (İNCELEMEDE); admin doğrulayınca 'verified', reddederse 'rejected' + adminNote.
// Görsel dil: ödeme kartlarıyla aynı (css/dk-odeme.css .dk-pay-acct / .dk-pay-form / .dk-tax-*); payments.js içe aktarılınca CSS gelir.
import { h } from "../../ui.js";
import { cx, dkButton, dkInput, dkTextarea, dkSelect, dkCheckbox, dkRadioGroup, dkStatusBadge, dkSkeleton, dkInlineMessage, dkConfirm } from "./ui.js";
import { LEGAL } from "./assets.js";
import { payApi, alertModal, paymentErrorText, isDemoUser, invalidateTaxProfile, fmtDT, TONE_COLOR, loadPayRates, isResale, resaleCategoryNote } from "./payments.js";

export const TAX_STATUS = {
  none: { text: "EKSİK", tone: "warn" },
  submitted: { text: "İNCELEMEDE", tone: "info" },
  verified: { text: "DOĞRULANDI", tone: "ok" },
  rejected: { text: "REDDEDİLDİ", tone: "bad" },
};
const PERF_CATS = [
  { value: "A", label: "A · Vergi mükellefi değilim — düzenli veya düzensiz sahne alıyorum, vergi kaydım yok" },
  { value: "B", label: "B · Vergi mükellefiyim (serbest meslek / şahıs şirketi)" },
  { value: "C", label: "C · Şirket, ajans ya da temsilci üzerinden çalışıyorum" },
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
// Yalnız organizatör: vergi kaydı olmayan kişi → ad soyad (title) + TCKN + adres; fatura TCKN'ye e-Arşiv (sunucu cleanBusiness 'bireysel';
// vergi dairesi / usul / müşavir yok, stopajResponsible 'hayir'). App eşi: TaxProfileScreen BIREYSEL_TYPE.
const BIREYSEL = { value: "bireysel", label: "Bireysel (vergi kaydım yok)" };
// Stopaj sorumluluğu KANUNDAN (GVK md. 94; sunucu finance.js cleanBusiness): şirket / kooperatif / dernek / kamu → sorumlu;
// şahıs işletmesinde vergilendirme usulü sorulur (gerçek usul → sorumlu, basit usul → değil).
const TAX_REGIME = [
  { value: "gercek", label: "Gerçek usul (bilanço / işletme defteri tutuyoruz)" },
  { value: "basit", label: "Basit usul (esnaf muafiyeti değil, basit usul mükellefiyiz)" },
  { value: "bilmiyorum", label: "Bilmiyorum" },
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
  // Açıklama iş modeline göre (publicConfig/payments bookingModel — loadPayRates): Yol A'da GigBridge sahneyi alır, satar
  const leadEl = h("p", { class: "dk-pay-text" });
  const leadText = () => (isResale()
    ? (performer
      ? "GigBridge sahneni senden satın alıp mekana satar. Vergi kaydın yoksa ödemen etkinlikten 16 gün sonra PayTR üzerinden hesabına geçer; stopajı GigBridge keser ve yatırır, ayrıca imzalaman gereken bir belge yok. Şahıs şirketin ya da şirketin varsa GigBridge'e makbuz / fatura (+ KDV) kesersin. Bilgiler eksikse ödemen finansal incelemede bekleyebilir."
      : "Sanatçı kiralamada sahneyi GigBridge'den satın alırsın: GigBridge sana sahne bedeli + %20 KDV tutarında tek fatura (ajans ve organizasyon hizmeti, e-Fatura / e-Arşiv) keser (bu bilgilerle). Stopaj kesmez, gider pusulası düzenlemezsin. Bilgiler eksikse sanatçı ödemesi başlatılamaz.")
    : performer
      ? "Ödemelerinde doğru vergi kesintisinin (stopaj) uygulanması ve belgelerin düzenlenmesi için gerekli. Bilgiler eksikse ödemen finansal incelemede bekleyebilir."
      : "Sanatçı ve mekan ödemelerinde stopaj sorumluluğunun ve faturanın doğru belirlenmesi için gerekli. Bilgiler eksikse ödemeler finansal incelemede bekleyebilir.");
  leadEl.textContent = leadText();
  const head = h("div", { class: "dk-pay-acct-head" },
    h("div", { class: "dk-tax-top" }, h("span", { class: "dk-pay-kick" }, "FİNANS · VERGİ"), badgeBox),
    embedded ? null : h("h2", { id: "dk-tax-h", class: "dk-pay-acct-t" }, "Vergi Bilgileri"),
    leadEl);
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
  const KVKK_LBL = "Vergi bilgilerimin ödeme, belge düzenleme ve yasal yükümlülükler için işlenmesini kabul ediyorum (KVKK).";
  // Vergi kaydı olmayan sanatçı (A): vergi bilgisi yok → ad + TCKN, adına fatura / belge kesilebilmesi amacı (app eşi: TaxProfileScreen KVKK_TEXT_A)
  const KVKK_LBL_A = "Bilgilerimin (ad, TCKN) adıma fatura / belge kesilebilmesi, ödemelerin vergi mevzuatına uygun işlenmesi ve yasal saklama yükümlülükleri için işlenmesini kabul ediyorum (KVKK).";
  const kvkkBox = dkCheckbox({ label: KVKK_LBL, checked: false, cls: "dk-pay-agree", onChange: (v) => { kvkk = v; } });
  const kvkkLink = LEGAL?.privacy ? h("a", { href: LEGAL.privacy, target: "_blank", rel: "noopener", class: "dk-link dk-tax-kvkk" }, "KVKK Aydınlatma Metni") : null;

  // performer
  let cat = "A", activity = "arizi", vatReg = false, ariziOk = false;
  // Kabul tik'i: "Vergilendirme bilgisini ve ödeme sistemini kabul ediyorum" + mavi bağlantı → /vergilendirme.html#a|b|c
  // (app eşi: TaxProfileScreen). Sunucu A için ariziAccepted ister.
  const ariziBox = performer ? dkCheckbox({ label: "Vergilendirme bilgisini ve ödeme sistemini kabul ediyorum.", checked: false, cls: "dk-pay-agree", onChange: (v) => { ariziOk = v; } }) : null;
  const infoLink = performer ? h("a", { href: "/vergilendirme.html#a", target: "_blank", rel: "noopener", class: "dk-link dk-tax-kvkk", style: { color: "#5AA9FF", textDecoration: "underline", fontWeight: "600" } }, "Vergilendirme bilgisi") : null;
  const infoBox = performer ? h("div", { class: "dk-tax-kv" }, ariziBox, infoLink) : null;
  // Yol A: seçili kategoride ne olacağı (stopajı kim keser, hangi belge) — aracı modelde gizli
  const catNote = performer ? h("p", { class: "dk-pay-fine", hidden: true }) : null;
  function paintInfo() {
    if (!performer) return;
    catNote.hidden = !isResale();
    if (isResale()) catNote.textContent = resaleCategoryNote(cat);
    infoLink.href = `/vergilendirme.html#${cat.toLowerCase()}`;
    const lbl = kvkkBox.querySelector(".dk-tg-l");
    if (lbl) lbl.textContent = cat === "A" ? KVKK_LBL_A : KVKK_LBL;
  }
  function paintYear() { /* 350.000 TL satırı kaldırıldı; yıl toplamı yalnız admin'de */ }
  const catGroup = performer ? dkRadioGroup({ items: PERF_CATS, value: cat, label: "Vergi durumu", onChange: (v) => { cat = v; paintCat(); paintInfo(); } }) : null;
  const vatBox = performer ? dkCheckbox({ label: "KDV mükellefiyim", checked: false, onChange: (v) => { vatReg = v; } }) : null;
  const docSel = performer ? dkSelect({ size: 44, options: PERF_DOCS, value: "e_smm", attrs: { "aria-label": "Düzenleyeceğin belge" } }) : null;
  const respSel = performer ? dkSelect({ size: 44, options: DOC_RESP, value: "company", attrs: { "aria-label": "Belgeyi kim düzenler" } }) : null;
  // business
  let taxRegime = "gercek";
  const bizSel = !performer ? dkSelect({ size: 44, options: role === "organizer" ? [...BIZ_TYPES, BIREYSEL] : BIZ_TYPES, value: "limited", attrs: { "aria-label": "İşletme türü" }, onChange: () => paintBiz() }) : null;
  const stopajGroup = !performer ? dkRadioGroup({ items: TAX_REGIME, value: taxRegime, label: "Vergilendirme usulü", onChange: (v) => { taxRegime = v; } }) : null;
  const regimeBox = !performer ? h("div") : null;
  const stopajInfo = !performer ? h("p", { class: "dk-pay-fine" }) : null;
  const addr = !performer ? dkTextarea({ rows: 3, maxlength: 300, placeholder: "Fatura adresi (mahalle, cadde, no, ilçe / il)" }) : null;
  // A (kaydı olmayan sanatçı): adres faturada / ödeme kayıtlarında yer alır
  const perfAddr = performer ? dkTextarea({ rows: 2, maxlength: 300, placeholder: "Mahalle, sokak, no, ilçe / il" }) : null;

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
  // GİB e-Fatura kaydı (Trendyol üzerinden): VKN / TCKN girilince unvan boşsa kendiliğinden dolar; bulunamazsa ipucu
  const gibHint = h("span", { class: "dk-pay-fine", hidden: true });
  let gibTimer = null, gibSeq = 0;
  const gibLookup = (id) => {
    clearTimeout(gibTimer);
    gibHint.hidden = true;
    if (!(id.length === 10 || id.length === 11)) return;
    const seq = (gibSeq += 1);
    gibTimer = setTimeout(async () => {
      let r = null;
      try { r = await payApi.lookupTaxpayer({ taxId: id }); } catch (_) { r = null; }
      if (seq !== gibSeq || !r || !r.available) return;
      if (r.found && r.title && !F.title.value.trim()) F.title.value = r.title;
      const differs = r.found && r.title && F.title.value.trim() && F.title.value.trim() !== r.title;
      gibHint.textContent = r.found ? `GİB kaydı: ${r.title || "—"}${r.efatura ? " · e-Fatura mükellefi" : ""}${differs ? " (yazdığın unvan farklı, kontrol et)" : ""}` : "GİB e-Fatura kaydı bulunamadı; unvanı kendin yaz.";
      gibHint.hidden = false;
    }, 600);
  };
  F.vkn.addEventListener("input", () => gibLookup(digits(F.vkn.value)));
  F.tckn.addEventListener("input", () => { if (!performer && !F.vkn.value) gibLookup(digits(F.tckn.value)); });

  // koşullu bloklar
  const rows = {
    fullName: fld("AD SOYAD", F.fullName),
    tckn: fld("T.C. KİMLİK NO", F.tckn),
    vkn: fld("VERGİ KİMLİK NO", F.vkn),
    taxOffice: fld("VERGİ DAİRESİ", F.taxOffice),
    title: fld(performer ? "UNVAN" : "UNVAN / İŞLETME ADI", F.title),
    vat: vatBox,
    doc: performer ? box("DÜZENLEYECEĞİN BELGE", docSel) : null,
    rep: h("div", { class: "dk-tax-grid" }, fld("TEMSİLCİ AD SOYAD", F.repName), fld("TEMSİLCİ T.C. KİMLİK NO", F.repTckn)),
    resp: performer ? box("BELGEYİ KİM DÜZENLER", respSel) : null,
    address: performer ? box("ADRES", perfAddr, "Faturada / ödeme kayıtlarında yer alır.") : null,
    billing: !performer ? fld("FATURA ADRESİ", addr) : null,
  };
  // business: müşavir bloğu + bireysel ipucu (bireyselde müşavir / vergi dairesi / usul gizli)
  const accEls = !performer ? [h("span", { class: "dk-pay-sub" }, "MALİ MÜŞAVİR (OPSİYONEL)"), F.accountantName, h("div", { class: "dk-tax-grid" }, F.accountantPhone, F.accountantEmail)] : [];
  const bireyselHint = !performer ? h("p", { class: "dk-pay-fine", hidden: true }, "Vergi kaydın yoksa faturan TC kimlik numarana e-Arşiv olarak kesilir.") : null;
  function paintCat() {
    if (!performer) return;
    const show = (el, on) => { if (el) el.hidden = !on; };
    show(rows.tckn, cat === "A" || cat === "B");
    show(rows.vkn, cat === "B" || cat === "C");
    show(rows.taxOffice, cat === "B" || cat === "C");
    show(rows.title, cat === "B" || cat === "C");
    show(rows.vat, cat === "B");
    show(rows.doc, cat === "B");
    show(rows.rep, cat === "C");
    show(rows.resp, cat === "C");
    show(rows.address, cat === "A");
    rows.tckn.querySelector(".dk-lbl").textContent = cat === "B" ? "T.C. KİMLİK NO (VKN YOKSA)" : "T.C. KİMLİK NO";
    rows.vkn.querySelector(".dk-lbl").textContent = cat === "B" ? "VERGİ KİMLİK NO (VARSA)" : "VERGİ KİMLİK NO";
  }
  function paintBiz() {
    if (performer) return;
    const bt = selOf(bizSel).value;
    const sahis = bt === "sahis", bireysel = bt === "bireysel";
    rows.tckn.hidden = !(sahis || bireysel);
    regimeBox.hidden = !sahis;
    rows.vkn.hidden = bireysel; rows.taxOffice.hidden = bireysel; stopajInfo.hidden = bireysel; bireyselHint.hidden = !bireysel;
    accEls.forEach((el) => { el.hidden = bireysel; });
    rows.title.querySelector(".dk-lbl").textContent = bireysel ? "AD SOYAD" : "UNVAN / İŞLETME ADI";
    F.title.placeholder = bireysel ? "Kimlikteki ad soyad" : "Ticari unvan ya da işletme adı";
    rows.tckn.querySelector(".dk-lbl").textContent = "T.C. KİMLİK NO";
    rows.billing.querySelector(".dk-lbl").textContent = bireysel ? "ADRES" : "FATURA ADRESİ";
    stopajInfo.textContent = isResale()
      ? (sahis
        ? "Sanatçı kiralamada stopaj kesmezsiniz: sahneyi GigBridge'den satın alırsınız, GigBridge size sahne bedeli + %20 KDV tutarında ajans ve organizasyon hizmeti faturası keser (gider belgeniz budur). Gider pusulası düzenlemezsiniz."
        : "Sanatçı kiralamada stopaj kesmezsiniz, gider pusulası düzenlemezsiniz: sahneyi GigBridge'den satın alırsınız, GigBridge size sahne bedeli + %20 KDV tutarında ajans ve organizasyon hizmeti faturası (e-Fatura / e-Arşiv) keser.")
      : sahis
      ? "Stopaj (GVK md. 94): gerçek usulde sanatçıya yaptığınız ödemeden %20 stopaj kesip muhtasarla yatırırsınız; basit usulde stopaj kesmezsiniz, sanatçı için gider pusulası düzenlersiniz."
      : "Stopaj (GVK md. 94): şirket, kooperatif, dernek ve kamu kurumları kanunen stopaj sorumlusudur. Vergi kaydı olmayan ya da serbest meslek mükellefi sanatçıya yaptığınız ödemeden %20 stopaj kesip muhtasarla yatırırsınız; şirketi olan sanatçıdan stopaj kesilmez.";
    rows.vkn.querySelector(".dk-lbl").textContent = sahis ? "VERGİ KİMLİK NO (VARSA)" : "VERGİ KİMLİK NO";
  }

  const form = performer
    ? h("div", { class: "dk-pay-form" },
      box("VERGİ DURUMUN", catGroup), catNote, infoBox,
      rows.fullName, h("div", { class: "dk-tax-grid" }, rows.tckn, rows.vkn), gibHint, rows.address, h("div", { class: "dk-tax-grid" }, rows.taxOffice, rows.title),
      rows.vat, rows.doc, rows.rep, rows.resp)
    : h("div", { class: "dk-pay-form" },
      box("İŞLETME TÜRÜ", bizSel), rows.title, h("div", { class: "dk-tax-grid" }, rows.vkn, rows.tckn), gibHint, rows.taxOffice,
      rows.billing, bireyselHint,
      (regimeBox.append(box("VERGİLENDİRME USULÜ", stopajGroup)), regimeBox), stopajInfo,
      ...accEls);
  paintCat(); paintBiz(); paintInfo();

  const setVal = (k, v) => { const el = F[k]; if (!el) return; if (masked(v)) { el.value = ""; el.placeholder = `${v} · değiştirmek için yeniden gir`; el.dataset.masked = "1"; } else { el.value = v ?? ""; delete el.dataset.masked; } };
  function fill(pr) {
    if (!pr) return;
    ["fullName", "tckn", "vkn", "taxOffice", "title", "repName", "repTckn", "accountantName", "accountantPhone", "accountantEmail"].forEach((k) => { if (pr[k] != null) setVal(k, String(pr[k])); });
    if (performer) {
      if (["A", "B", "C"].includes(pr.category)) { cat = pr.category; catGroup.dk.set(cat); }
      if (["arizi", "duzenli"].includes(pr.activity)) activity = pr.activity;
      if (pr.address) perfAddr.value = pr.address;
      if (pr.category !== "A" || data?.ariziAccepted) { ariziOk = true; ariziBox.dk.set(true); }
      vatReg = pr.vatRegistered === true; vatBox.dk.set(vatReg);
      if (pr.docType) selOf(docSel).value = pr.docType;
      if (pr.docResponsible) selOf(respSel).value = pr.docResponsible;
      paintCat(); paintInfo();
    } else {
      if (pr.businessType && (pr.businessType !== "bireysel" || role === "organizer")) selOf(bizSel).value = pr.businessType;
      if (pr.billingAddress) addr.input.value = pr.billingAddress;
      const reg = pr.taxRegime || ({ evet: "gercek", hayir: "basit" })[pr.stopajResponsible];
      if (["gercek", "basit", "bilmiyorum"].includes(reg)) { taxRegime = reg; stopajGroup.dk.set(taxRegime); }
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
        const ad = perfAddr.querySelector("textarea") ? perfAddr.querySelector("textarea").value.trim() : (perfAddr.value || "").trim();
        if (ad.length < 10) return { error: "Adresini eksiksiz yaz (faturada / ödeme kayıtlarında yer alır)." };
        out.address = ad;
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
      if (!ariziOk) return { error: "Vergilendirme bilgisini ve ödeme sistemini kabul et." };
      if (!kvkk) return { error: "Devam etmek için KVKK onayını işaretle." };
      return { data: out };
    }
    const businessType = selOf(bizSel).value;
    if (businessType === "bireysel") {
      const out = { businessType, title: v("title"), billingAddress: addr.input.value.trim(), kvkkAccepted: kvkk };
      if (out.title.length < 3) return { error: "Adını soyadını kimlikteki gibi yaz." };
      if (!keepMasked("tckn")) { if (digits(v("tckn")).length !== 11) return { error: "T.C. kimlik numarası 11 haneli olmalı." }; out.tckn = v("tckn"); }
      if (out.billingAddress.length < 10) return { error: "Adresini eksiksiz yaz (faturada yer alır)." };
      if (!kvkk) return { error: "Devam etmek için KVKK onayını işaretle." };
      return { data: out };
    }
    const out = { businessType, title: v("title"), taxOffice: v("taxOffice"), billingAddress: addr.input.value.trim(), ...(businessType === "sahis" ? { taxRegime } : {}), kvkkAccepted: kvkk };
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
        ariziAccepted: !!r?.ariziAcceptedAt, year: r?.year || null, yearGrossKurus: r?.yearGrossKurus || 0, ariziLimitKurus: r?.ariziLimitKurus || 35000000 };
      fill(data.profile);
      paintYear();
    } catch (e) { console.warn("[vergi]", e); err = true; }
    draw();
  }
  load();
  // oranlar / iş modeli gelince açıklamalar güncellensin
  const onRates = () => { if (!alive) return; leadEl.textContent = leadText(); paintBiz(); paintInfo(); };
  loadPayRates().then(onRates).catch(() => {});
  window.addEventListener("gb:pay-rates", onRates);
  return {
    node,
    focus() { try { node.scrollIntoView({ block: "start", behavior: "smooth" }); node.focus({ preventScroll: true }); } catch (_) {} },
    destroy() { alive = false; window.removeEventListener("gb:pay-rates", onRates); },
  };
}
