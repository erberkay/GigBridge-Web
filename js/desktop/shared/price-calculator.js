/**
 * FİYAT HESAPLAYICI (admin Ödemeler) — bir sahne ücreti için mekanın ödeyeceği tutarı ve kalem kalem dökümü GÜNCEL (ya da
 * düzenlenmekte olan) ödeme ayarlarıyla gösterir. Hesap sunucudaki functions/finance.js computeSplitV2 ile aynı:
 *   komisyon (KDV hariç) + komisyon KDV'si · stopaj (GVK md. 94: sanatçı kayıtsız / serbest meslek VE mekan şirket ya da gerçek
 *   usul ise %20, mekan keser → mekan PayTR'den o kadar az öder) · PayTR masrafı = tahsilat × oran.
 *   const c = priceCalculator(); c.update(cfg) → c.el
 * Yol A (cfg.bookingModel 'resale'): finance.js computeResaleSplit ile aynı (pay-util resaleSplit) — tutar = teklif ücreti F (KDV hariç);
 *   sanatçıyı tutan (mekan / organizatör seçimi) F + hizmet bedeli (F × venueBuyerFeeRate | organizerBuyerFeeRate) + KDV (toplam üzerinden)
 *   öder, stopaj kesmez; GigBridge payı (marj) = sanatçı komisyon oranı; stopajı (A/B) GigBridge keser; sanatçının PayTR masrafı yalnız
 *   F + KDV üzerinden. GigBridge geliri = marj + hizmet bedeli. Mekan türü seçimi bu modelde gerekmez.
 */
import { h } from "../../ui.js";
import { dkInput, dkSelect } from "./ui.js";
import { resaleSplit } from "./pay-util.js";

const STOPAJ = 0.2;
const tl = (k) => `${(Math.round(k) / 100).toLocaleString("tr-TR", { minimumFractionDigits: k % 100 ? 2 : 0, maximumFractionDigits: 2 })} TL`;
const pct = (v) => `%${Math.round((Number(v) || 0) * 10000) / 100}`;

/** Brüt (kuruş) → döküm. artist: 'A' | 'B' | 'C' · venue: 'sorumlu' | 'basit' */
function split(cfg, grossK, artist, venue) {
  const cr = cfg.artistCommissionRate || 0, v = cfg.commissionVatRate ?? 0.2;
  let c, vat;
  if (cfg.commissionVatIncluded) { const t0 = Math.round(grossK * cr); vat = Math.round((t0 * v) / (1 + v)); c = t0 - vat; }
  else { c = Math.round(grossK * cr); vat = Math.round(c * v); }
  const take = c + vat;
  const payerBears = cfg.artistCommissionBorneBy === "payer";
  const stopaj = artist !== "C" && venue === "sorumlu" ? Math.round(grossK * STOPAJ) : 0;
  const charge = grossK - stopaj + (payerBears ? take : 0);
  const fee = Math.round(charge * (cfg.paytrFeeRate || 0));
  const feeOnPayee = cfg.paytrFeeBorneBy === "platform" ? 0 : fee;
  const payee = Math.max(0, grossK - stopaj - (payerBears ? 0 : take) - feeOnPayee);
  return { grossK, c, vat, take, payerBears, stopaj, charge, fee, feeOnPayee, payee, cr, v };
}
/** Sanatçının cebine girecek net → gereken brüt (tam TL, en küçük) */
function grossForNet(cfg, netK, artist, venue) {
  let lo = Math.ceil(netK / 100), g = lo;
  const f = (x) => split(cfg, x * 100, artist, venue).payee;
  const r = f(1000000) / 100000000 || 0.5;          // yaklaşık oran → başlangıç
  g = Math.max(1, Math.ceil(netK / 100 / Math.max(0.05, r)));
  for (let i = 0; i < 5000 && f(g) < netK; i++) g += 1;
  for (let i = 0; i < 5000 && g > 1 && f(g - 1) >= netK; i++) g -= 1;
  return g * 100;
}

/** Yol A: sanatçının cebine girecek net → gereken satış fiyatı F (tam TL, en küçük) */
function resaleGrossForNet(cfg, netK, artist, payer) {
  const f = (x) => resaleSplit(x * 100, artist, cfg, payer).payeeKurus;
  const r = f(1000000) / 100000000 || 0.5;
  let g = Math.max(1, Math.ceil(netK / 100 / Math.max(0.05, r)));
  for (let i = 0; i < 5000 && f(g) < netK; i++) g += 1;
  for (let i = 0; i < 5000 && g > 1 && f(g - 1) >= netK; i++) g -= 1;
  return g * 100;
}

export function priceCalculator() {
  const el = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Fiyat hesaplayıcı" });
  let cfg = null;
  const amount = dkInput({ size: 40, value: "15000", inputmode: "numeric", maxlength: 9, attrs: { "aria-label": "Tutar (TL)" } });
  amount.style.width = "140px";
  const mode = dkSelect({ size: 40, value: "gross", options: [{ value: "gross", label: "Mekanın teklif ettiği ücret" }, { value: "net", label: "Sanatçının cebine girecek" }], attrs: { "aria-label": "Tutar türü" } });
  const artist = dkSelect({ size: 40, value: "A", options: [{ value: "A", label: "Sanatçı: vergi kaydı yok" }, { value: "B", label: "Sanatçı: serbest meslek mükellefi" }, { value: "C", label: "Sanatçı: şirket (ticari şahıs şirketi, Ltd, AŞ)" }], attrs: { "aria-label": "Sanatçı vergi durumu" } });
  const venue = dkSelect({ size: 40, value: "sorumlu", options: [{ value: "sorumlu", label: "Mekan: şirket / gerçek usul" }, { value: "basit", label: "Mekan: basit usul esnaf" }], attrs: { "aria-label": "Mekan türü" } });
  const payer = dkSelect({ size: 40, value: "venue", options: [{ value: "venue", label: "Sanatçıyı tutan: Mekan" }, { value: "organizer", label: "Sanatçıyı tutan: Organizatör" }], attrs: { "aria-label": "Sanatçıyı tutan" } });
  const out = h("div", { style: { display: "grid", gap: "2px", marginTop: "12px" } });
  const sel = (w) => w.querySelector("select").value;
  const row = (label, value, o = {}) => h("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", padding: "6px 0", borderBottom: "1px solid #14171D", fontSize: o.big ? "14px" : "12.5px" } },
    h("span", { style: { color: o.strong ? "#F2F1EE" : "#9AA0A8", fontWeight: o.strong ? "700" : "400" } }, label),
    h("span", { style: { color: o.color || (o.strong ? "#F2F1EE" : "#C9CACD"), fontWeight: o.strong ? "700" : "500", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, value));
  const note = (t) => h("p", { style: { margin: "8px 0 0", fontSize: "12px", lineHeight: "1.5", color: "#8A8E97" } }, t);

  const modeLbl = mode.querySelector("select").options[0];
  const RESALE_NOTE = {
    A: "Vergi kaydı olmayan sanatçı: alış KDV'si yok; %20 stopajı GigBridge keser, muhtasarla yatırır; ödeme etkinlikten 16 gün sonra PayTR üzerinden yapılır, sanatçının imzalaması gereken bir belge yoktur.",
    B: "Serbest meslek mükellefi: sanatçı GigBridge'e kendi bedeli + %20 KDV ile e-SMM keser (KDV'yi kendisi beyan eder); %20 stopajı GigBridge keser ve yatırır.",
    C: "Şirket (fatura kesen şahıs şirketi, Ltd, AŞ): GigBridge'e kendi bedeli + %20 KDV ile e-Fatura / e-Arşiv keser; stopaj yok.",
  };
  // Vurgulu sonuç kutusu (ödeyen / sanatçı): başlık + büyük tutar + kalem satırları
  const box = (title, total, color, lines) => h("div", { style: { border: `1px solid ${color}55`, background: `${color}0F`, borderRadius: "10px", padding: "12px 14px", display: "grid", gap: "2px" } },
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", marginBottom: "4px" } },
      h("span", { style: { fontFamily: "var(--dk-font-mono)", fontSize: "11px", letterSpacing: "0.1em", color } }, title),
      h("span", { style: { fontSize: "20px", fontWeight: "800", color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, tl(total))),
    ...lines.filter(Boolean));
  function drawResale(n, a) {
    const who = sel(payer) === "organizer" ? "organizer" : "venue";
    const g = sel(mode) === "net" ? resaleGrossForNet(cfg, n, a, who) : n;
    const s = resaleSplit(g, a, cfg, who);
    const feeOnPayee = s.paytrFeeBorneBy !== "platform";
    const whoTxt = who === "organizer" ? "ORGANİZATÖRÜN" : "MEKANIN";
    // PayTR: sanatçı kendi ücreti + KDV'si üzerinden öder; hizmet bedelinin masrafını GigBridge karşılar
    const feeTotal = s.paytrFeeTotalKurus || s.paytrFeeKurus;
    const feeGb = feeTotal - (feeOnPayee ? s.paytrFeeKurus : 0);
    const netGb = s.marginKurus + s.buyerFeeKurus - feeGb;
    const vatGb = s.saleVatKurus - s.purchaseVatKurus;
    const whoName = who === "organizer" ? "Organizatör" : "Mekan";
    const sub = (t) => h("div", { style: { fontSize: "11.5px", color: "#8A8E97", padding: "2px 0 0" } }, t);
    out.replaceChildren(...[
      box(`1 · ${whoTxt} ÖDEYECEĞİ`, s.chargeKurus, "#FFB347", [
        row("Sahne ücreti (teklif)", tl(s.grossKurus)),
        row(`GigBridge hizmet bedeli ${pct(s.buyerFeeRate)} · ${whoName.toLocaleLowerCase("tr-TR")}dan`, `+${tl(s.buyerFeeKurus)}`),
        row(`KDV ${pct(s.saleVatRate)}`, `+${tl(s.saleVatKurus)}`),
        sub(`Tek fatura GigBridge'den gelir; ${whoName.toLocaleLowerCase("tr-TR")} stopaj kesmez, gider pusulası düzenlemez.`),
      ]),
      h("div", { style: { height: "10px" } }),
      box("2 · SANATÇIYA AKTARILACAK", s.payeeKurus, "#7CE0B0", [
        row("Sahne ücreti (teklif)", tl(s.grossKurus)),
        row(`GigBridge payı ${pct(s.marginRate)} · sanatçıdan`, `−${tl(s.marginKurus)}`),
        row("Sanatçının bedeli (KDV hariç)", tl(s.purchaseKurus), { strong: true }),
        s.purchaseVatKurus ? row(`+ KDV ${pct(s.purchaseVatRate)} · sanatçının ${a === "B" ? "e-SMM'sinde" : "faturasında"}`, `+${tl(s.purchaseVatKurus)}`) : null,
        s.stopajKurus ? row(`Stopaj ${pct(s.resaleStopajRate)} · devlete (GigBridge yatırır)`, `−${tl(s.stopajKurus)}`) : row("Stopaj", "Yok (şirket)"),
        s.paytrFeeKurus && feeOnPayee ? row(`PayTR masrafı ${pct(s.paytrFeeRate)}`, `−${tl(s.paytrFeeKurus)}`) : null,
      ]),
      h("div", { style: { height: "10px" } }),
      box("3 · GIGBRIDGE'İN KAZANCI", netGb, "#A78BFA", [
        row(`Sanatçıdan pay ${pct(s.marginRate)}`, `+${tl(s.marginKurus)}`),
        row(`${whoName}dan hizmet bedeli ${pct(s.buyerFeeRate)}`, `+${tl(s.buyerFeeKurus)}`),
        feeGb ? row("PayTR masrafı (GigBridge'in payına düşen)", `−${tl(feeGb)}`) : null,
        sub("Vergi öncesi net kazanç; yıllık gelir vergisi bu tutar üzerinden hesaplanır."),
      ]),
      h("div", { style: { height: "10px" } }),
      box("4 · DEVLETE GİDEN", vatGb + s.stopajKurus, "#8A8E97", [
        row(s.purchaseVatKurus ? `KDV farkı · mekana kesilen ${tl(s.saleVatKurus)} − sanatçıdan alınan ${tl(s.purchaseVatKurus)}` : `KDV · mekana kesilen faturanın KDV'si (sanatçıdan indirilecek KDV yok)`, tl(vatGb)),
        s.stopajKurus ? row("Sanatçının stopajı · GigBridge muhtasarla yatırır", tl(s.stopajKurus)) : null,
        sub("Bu tutarlar GigBridge'in geliri değildir; tahsil edilip vergi dairesine aktarılır."),
      ]),
      h("div", { style: { height: "8px" } }),
      sub(`Kontrol: ${tl(s.chargeKurus)} = sanatçı ${tl(s.payeeKurus)} + PayTR ${tl(feeTotal)} + devlet ${tl(vatGb + s.stopajKurus)} + GigBridge ${tl(netGb)}`),
      note(RESALE_NOTE[a] || RESALE_NOTE.A),
    ].filter(Boolean));
  }
  function draw() {
    if (!cfg) return;
    const n = Math.round((parseFloat(String(amount.value).replace(/\./g, "").replace(",", ".")) || 0) * 100);
    const resale = cfg.bookingModel === "resale";
    venue.style.display = resale ? "none" : "";   // Yol A: mekan stopaj kesmez → mekan türü önemsiz
    payer.style.display = resale ? "" : "none";
    modeLbl.textContent = resale ? "Teklif ücreti (KDV hariç)" : "Mekanın teklif ettiği ücret";
    if (!(n > 0)) { out.replaceChildren(note("Bir tutar gir.")); return; }
    if (resale) { drawResale(n, sel(artist)); return; }
    const a = sel(artist), ve = sel(venue);
    const g = sel(mode) === "net" ? grossForNet(cfg, n, a, ve) : n;
    const s = split(cfg, g, a, ve);
    out.replaceChildren(...[
      row("Sahne ücreti (brüt)", tl(s.grossK), { strong: true }),
      s.stopaj ? row(`Stopaj ${pct(STOPAJ)} · mekan keser, vergi dairesine yatırır`, `−${tl(s.stopaj)}`) : row("Stopaj", a === "C" ? "Yok (şirkete ödeme)" : "Yok (basit usul mekan)"),
      s.payerBears ? row(`GigBridge komisyonu ${pct(s.cr)} + KDV · mekan öder`, `+${tl(s.take)}`) : null,
      row("MEKANIN PAYTR İLE ÖDEYECEĞİ", tl(s.charge), { strong: true, big: true, color: "#FFB347" }),
      s.stopaj ? row("Mekanın toplam maliyeti (PayTR + stopaj)", tl(s.charge + s.stopaj)) : null,
      h("div", { style: { height: "8px" } }),
      !s.payerBears ? row(`GigBridge komisyonu (${pct(s.cr)})`, `−${tl(s.c)}`) : null,
      !s.payerBears ? row(`KDV (${pct(s.v)})`, `−${tl(s.vat)}`) : null,
      s.fee ? row(`PayTR masrafı (${pct(cfg.paytrFeeRate)})${s.feeOnPayee ? "" : " · GigBridge karşılar"}`, s.feeOnPayee ? `−${tl(s.fee)}` : tl(s.fee)) : null,
      row("SANATÇIYA AKTARILACAK", tl(s.payee), { strong: true, big: true, color: "#7CE0B0" }),
      row(s.feeOnPayee ? "GigBridge'de kalan (komisyon + KDV; PayTR sanatçıdan)" : "GigBridge'de kalan (komisyon + KDV − PayTR)", tl(s.take - (s.feeOnPayee ? 0 : s.fee))),
      note(a === "B" || a === "C"
        ? "Serbest meslek mükellefi ya da şirketi olan sanatçı makbuz / faturasına her durumda %20 KDV ekler; bu KDV şu an ödemeye dahil edilmiyor."
        : "Vergi kaydı olmayan sanatçının ücretine KDV eklenmez; mekan gider pusulası düzenler."),
    ].filter(Boolean));
  }
  [amount].forEach((x) => x.addEventListener("input", draw));
  [mode, artist, venue, payer].forEach((x) => x.addEventListener("change", draw));
  el.append(
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "FİYAT HESAPLAYICI · ÖDEYENE ÇIKACAK TUTAR")),
    h("div", { class: "dk-admin-etk-form", style: { gap: "8px" } },
      h("p", { style: { margin: "0", fontSize: "12.5px", color: "#9AA0A8" } }, "Sağdaki ayarlarla (kaydetmeden önce de) hesaplanır."),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" } }, amount, mode, payer),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } }, artist, venue),
      out));
  return { el, update(c) { cfg = c; draw(); } };
}
