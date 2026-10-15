/**
 * ORAN ÖZETİ (admin Ödemeler / Finans) — "hangi ayar neyi değiştirir, kim neyi neden öder" — muhasebecinin okuyacağı dille.
 * 10.000 TL brüt sahne bedeli örneği GÜNCEL (ya da düzenlenmekte olan) ayarlarla hesaplanır. Vergi kesintisi: önce Finans ›
 * Vergi Kuralları'nda onaylı kural, yoksa KANUNİ kural (functions/finance.js STATUTORY_RULES — GVK md. 94) — sunucuyla aynı mantık.
 *   const s = rateSummary(); s.update(cfg, rules)  → s.el
 * Yol A (cfg.bookingModel 'resale'): sanatçı kiralamada GigBridge sahneyi alır, satar — vergi kuralı tablosu kullanılmaz,
 *   kesinti sanatçının kategorisinden (finance.js computeResaleSplit = pay-util resaleSplit). Sanatçıyı tutan (mekan / organizatör)
 *   teklif ücretinin üstüne hizmet bedeli (venueBuyerFeeRate / organizerBuyerFeeRate) + KDV öder. Mekan kiralama aracı modelde kalır.
 */
import { h } from "../../ui.js";
import { dkInlineMessage } from "./ui.js";
import { resaleSplit } from "./pay-util.js";

const G = 1000000; // 10.000 TL (kuruş)
const tl = (k) => `${(Math.round(k) / 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
const pct = (v) => `%${Math.round((Number(v) || 0) * 10000) / 100}`;
const WH = { serbest_meslek_stopaj: "Serbest meslek stopajı", eticaret_tevkifat: "E-ticaret tevkifatı", no_withholding: "Kesinti yok" };
const CAT = { A_arizi: "mükellef değil (ara sıra)", A_duzenli: "mükellef değil (düzenli)", B: "serbest meslek mükellefi", C: "şirket (ticari şahıs, Ltd, AŞ) / ajans", isletme: "işletme (mekan kiralama)" };

function commission(cfg, kind) {
  const cr = kind === "venue_rental" ? cfg.venueCommissionRate : cfg.artistCommissionRate;
  const v = cfg.commissionVatRate ?? 0.2;
  let c, vat;
  if (cfg.commissionVatIncluded) { const t0 = Math.round(G * cr); vat = Math.round((t0 * v) / (1 + v)); c = t0 - vat; }
  else { c = Math.round(G * cr); vat = Math.round(c * v); }
  const borne = (kind === "venue_rental" ? cfg.venueCommissionBorneBy : cfg.artistCommissionBorneBy) === "payer" ? "payer" : "payee";
  return { cr, v, c, vat, take: c + vat, borne };
}
const whAmount = (w) => Math.round((w.base === "gross_excl_vat" ? Math.round(G / 1.2) : G) * w.rate);

// Onaylı kural eşleşmesi (finance.js ruleMatches + evaluateRules özeti)
function matchRules(rules, sc) {
  const today = new Date().toISOString().slice(0, 10);
  const m = (rules || []).filter((r) => r.status === "approved" && (!r.validFrom || r.validFrom <= today) && (!r.validTo || r.validTo >= today)).filter((r) => {
    const c = r.conditions || {};
    if (c.kinds?.length && !c.kinds.includes(sc.kind)) return false;
    if (c.payeeCategories?.length && !c.payeeCategories.includes(sc.cat)) return false;
    if (c.payerStopajResponsible && c.payerStopajResponsible !== sc.payer) return false;
    if (c.groupPayee === true) return false;
    return true;
  });
  if (!m.length) {
    // Kanuni kural (finance.js STATUTORY_RULES): A/B sanatçı + stopaj sorumlusu mekan → %20 mekan keser; aksi halde kesinti yok
    if (!sc.statutory) return { ok: false, text: "Kural yok → Finansal İnceleme" };
    if (sc.cat === "C" || sc.payer === "hayir") return { ok: true, rules: [], text: "Kanun: kesinti yok" };
    if (sc.payer === "evet") return { ok: true, rules: [{ type: "serbest_meslek_stopaj", rate: 0.2 }], text: "Kanun: GVK 94 · %20 stopaj" };
    return { ok: false, text: "Mekanın durumu belirsiz → Finansal İnceleme" };
  }
  const w = m.filter((r) => r.type !== "no_withholding");
  const types = w.map((r) => r.type);
  const pairOk = w.every((a) => w.every((b) => a === b || ((a.combinableWith || []).includes(b.type) && (b.combinableWith || []).includes(a.type))));
  if ((w.length && w.length !== m.length) || new Set(types).size !== types.length || !pairOk) return { ok: false, text: "Kurallar çakışıyor → Finansal İnceleme" };
  return { ok: true, rules: w, text: w.length ? `Onaylı: ${w.map((r) => `${WH[r.type]} ${pct(r.rate)}`).join(" + ")}` : "Onaylı: kesinti yok" };
}

// Kanuni senaryolar (GVK md. 94/2-b; basit usul mekan stopaj sorumlusu değil — GVK 94 son fıkra, şirkete (ticari şahıs şirketi, Ltd/AŞ) ödeme stopaja tabi değil)
const SCENARIOS = [
  { cat: "A_arizi", artist: "Vergi kaydı yok", payer: "evet", payerTxt: "Şirket / gerçek usul",
    w: [{ type: "serbest_meslek_stopaj", rate: 0.2, base: "gross", responsible: "payer" }], who: "Mekan keser, muhtasarla öder", doc: "Gider pusulası (mekan)", law: "GVK 94/2-b" },
  { cat: "A_arizi", artist: "Vergi kaydı yok", payer: "hayir", payerTxt: "Basit usul esnaf",
    w: [], who: "—", doc: "Gider pusulası (mekan)", law: "GVK 94" },
  { cat: "B", artist: "Serbest meslek mükellefi", payer: "evet", payerTxt: "Şirket / gerçek usul",
    w: [{ type: "serbest_meslek_stopaj", rate: 0.2, base: "gross", responsible: "payer" }], who: "Mekan keser, muhtasarla öder", doc: "e-SMM (sanatçı)", law: "GVK 94/2-b" },
  { cat: "B", artist: "Serbest meslek mükellefi", payer: "hayir", payerTxt: "Basit usul esnaf",
    w: [], who: "—", doc: "e-SMM (sanatçı)", law: "GVK 94" },
  { cat: "C", artist: "Şirket (ticari şahıs, Ltd, AŞ)", payer: "evet", payerTxt: "Fark etmez",
    w: [], who: "—", doc: "e-Fatura / e-Arşiv (şirket)", law: "Ticari kazanç — stopaj yok" },
];

export function rateSummary() {
  const el = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Oran özeti" });
  const p = (txt, extra = {}) => h("p", { class: "dk-admin-etk-e", style: { margin: "0", lineHeight: "1.55", fontSize: "12.5px", color: "#C9CACD", ...extra } }, txt);
  const head = (n, t) => h("div", { style: { fontFamily: "var(--dk-font-mono)", fontSize: "10.5px", letterSpacing: "0.1em", color: "#A78BFA", margin: "18px 0 8px" } }, `${n} · ${t}`);
  const li = (label, effect) => h("div", { style: { display: "grid", gridTemplateColumns: "minmax(150px, 34%) 1fr", gap: "12px", padding: "7px 0", borderBottom: "1px solid #14171D" } },
    h("span", { style: { fontSize: "12.5px", fontWeight: "600", color: "#F2F1EE" } }, label), p(effect));

  // ── Yol A görünümü ──
  function updateResale(cfg) {
    const v = commission(cfg, "venue_rental");
    const sA = resaleSplit(G, "A", cfg), sB = resaleSplit(G, "B", cfg), sC = resaleSplit(G, "C", cfg);
    const oA = resaleSplit(G, "A", cfg, "organizer");
    const feeOnPayee = cfg.paytrFeeBorneBy !== "platform";
    const settings = [
      li("İş modeli: Yol A — GigBridge alır, satar", `Sanatçı kiralamada GigBridge sahne performansını sanatçıdan SATIN ALIR ve sanatçıyı tutana (mekan ya da organizatör) SATAR. Teklif ücreti 10.000 TL (KDV hariç); tutan taraf bunun üstüne hizmet bedeli ve toplam üzerinden ${pct(sA.saleVatRate)} KDV öder: mekan ${tl(G)} + ${tl(sA.buyerFeeKurus)} + ${tl(sA.saleVatKurus)} KDV = ${tl(sA.chargeKurus)}. Stopaj kesmez, gider pusulası düzenlemez. Etkinlik sonrası GigBridge tek satış faturası keser: ajans ve organizasyon hizmeti faturası (e-Fatura / e-Arşiv).`),
      li(`Hizmet bedeli: mekan ${pct(sA.buyerFeeRate)} · organizatör ${pct(oA.buyerFeeRate)}`, `Sanatçıyı tutan taraf teklif ücretinin üstüne öder (sanatçının payından düşmez). 10.000 TL'de mekan ${tl(sA.buyerFeeKurus)} → toplam ${tl(sA.chargeKurus)}; organizatör ${tl(oA.buyerFeeKurus)} → toplam ${tl(oA.chargeKurus)} (KDV dahil). Hizmet bedelinin PayTR masrafını GigBridge karşılar.`),
      li(`GigBridge payı (marj): ${pct(sA.marginRate)}`, `Sanatçı komisyon oranı marj olarak sanatçının teklif ücretinden düşülür: ${tl(sA.marginKurus)}. GigBridge'in alış bedeli (sanatçının hizmet bedeli) ${tl(sA.purchaseKurus)}. GigBridge'in geliri marj + hizmet bedelidir: mekanda ${tl(sA.marginKurus + sA.buyerFeeKurus)}, organizatörde ${tl(oA.marginKurus + oA.buyerFeeKurus)}.`),
      li(`Satış KDV'si: ${pct(sA.saleVatRate)} (yasal)`, `Satış faturasında (sahne ücreti + hizmet bedeli) ${tl(sA.saleKurus)} üzerinden ${tl(sA.saleVatKurus)} KDV. Serbest meslek / şirket sanatçıdan alışta ${tl(sB.purchaseVatKurus)} alış KDV'si indirilir; devlete net KDV ödenir.`),
      li(`Stopaj: ${pct(sA.resaleStopajRate)} · GigBridge keser`, `Vergi kaydı olmayan ve serbest meslek mükellefi sanatçıda hizmet bedelinden ${tl(sA.stopajKurus)} stopajı GigBridge keser, muhtasarla yatırır (GVK 94/2-b). Vergi kaydı olmayan sanatçıda gider pusulası düzenlenmez: ödeme etkinlikten 16 gün sonra PayTR üzerinden yapılır, PayTR dekontu ödeme kaydıdır. Ltd / AŞ sanatçıda stopaj yok. Vergi kuralları tablosu sanatçı kiralamada kullanılmaz.`),
      li(`PayTR masrafı: ${pct(cfg.paytrFeeRate ?? 0)} · ${feeOnPayee ? "sanatçının payından" : "GigBridge karşılar"}`, !(cfg.paytrFeeRate > 0)
        ? "Oran girilmedi (%0): PayTR masrafı hesaba katılmıyor."
        : `Sanatçının payına düşen masraf yalnız sahne ücreti + KDV (${tl(G + Math.round(G * sA.saleVatRate))}) üzerinden: ${tl(sA.paytrFeeKurus)}; ${feeOnPayee ? "sanatçının payından düşülür" : "GigBridge'in marjından ödenir"}. Hizmet bedelinin masrafını (${tl(sA.paytrFeeTotalKurus - sA.paytrFeeKurus)}) GigBridge karşılar.`),
      li(`Mekan kiralama: ${pct(v.cr)} komisyon`, v.cr ? `Mekan kiralamada (organizatör mekanı kiralar) model değişmez: ${tl(v.c)} + ${tl(v.vat)} KDV; ${v.borne === "payer" ? "organizatör üstüne öder" : "mekanın payından düşer"}.` : "Mekan kiralamada GigBridge komisyon almaz."),
      li(`Test modu: ${cfg.testMode ? "Açık" : "Kapalı"}`, cfg.testMode ? "Kartlardan para ÇEKİLMEZ (deneme)." : "Kartlardan GERÇEK para çekilir."),
      li(`Otomatik aktarım: ${cfg.autoPayout ? "Açık" : "Kapalı"}`, cfg.autoPayout ? "Etkinlik bitişinden 16 gün sonra (şikayet süresi bitişten 24 saat sonra kapanır), şikayet ve vergi kontrolü geçerse para o sabah 08:00'deki aktarımla sanatçının IBAN'ına kendiliğinden gider." : "Para kendiliğinden gitmez; \"Serbest bırakılacak\" listesinde senin onayını bekler."),
    ];
    const SC = [
      { s: sA, artist: "Vergi kaydı yok (A)", doc: "Belge yok: PayTR dekontu ödeme kaydıdır", law: "GVK 94/2-b" },
      { s: sB, artist: "Serbest meslek (B)", doc: "e-SMM (sanatçı → GigBridge)", law: "GVK 94/2-b" },
      { s: sC, artist: "Şirket: ticari şahıs şirketi, Ltd, AŞ (C)", doc: "e-Fatura / e-Arşiv (şirket → GigBridge)", law: "Ticari kazanç — stopaj yok" },
    ];
    const rows = SC.map(({ s, artist, doc, law }) => h("tr", { style: { cursor: "default" } },
      h("td", {}, artist), h("td", { class: "is-num" }, tl(s.chargeKurus)), h("td", { class: "is-num" }, tl(s.marginKurus)),
      h("td", { class: "is-num" }, s.purchaseVatKurus ? `+${tl(s.purchaseVatKurus)}` : "—"), h("td", { class: "is-num" }, s.stopajKurus ? tl(s.stopajKurus) : "—"),
      h("td", { class: "is-num" }, s.paytrFeeKurus ? tl(s.paytrFeeKurus) : "—"),
      h("td", { class: "is-num", style: { color: "#7CE0B0", fontWeight: "700" } }, tl(s.payeeKurus)), h("td", {}, doc), h("td", {}, law)));
    const table = h("div", { class: "dk-fin-tblwrap", style: { margin: "0" }, tabindex: "0", role: "region", "aria-label": "Senaryo tablosu (yatay kaydırılır)" },
      h("table", { class: "dk-fin-tbl" },
        h("thead", {}, h("tr", {}, ...["SANATÇI", "MEKAN ÖDER (F + HİZMET B. + KDV)", "GIGBRIDGE PAYI", "ALIŞ KDV'Sİ", "STOPAJ (GIGBRIDGE)", "PAYTR", "SANATÇIYA", "SANATÇININ BELGESİ", "DAYANAK"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, ...rows)));
    el.replaceChildren(
      h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "ORAN ÖZETİ · KİM, NEYİ, NEDEN ÖDER · YOL A")),
      h("div", { class: "dk-admin-etk-form", style: { gap: "0" } },
        p("Muhasebeci / mali müşavir için özet. Örnek: 10.000 TL teklif ücreti (KDV hariç), sağdaki ayarlarla; tutan taraf üstüne hizmet bedeli + KDV öder."),
        head("1", "HER AYAR NEYİ DEĞİŞTİRİR"), ...settings,
        head("2", "SENARYOLAR — 10.000 TL, GÜNCEL AYARLARLA"), table,
        p(`Mekan her senaryoda aynı tutarı (${tl(sA.chargeKurus)}), organizatör ${tl(oA.chargeKurus)} öder ve GigBridge'den tek fatura alır.`
          + " Sanatçının vergi bilgisi doğrulanmadan ya da kategorisi ödemeden sonra değiştiyse ödeme aktarım öncesi Finansal İncelemeye düşer.", { marginTop: "10px", color: "#8A8E97" })));
  }

  function update(cfg, rules) {
    if (!cfg) return;
    if (cfg.bookingModel === "resale") { updateResale(cfg); return; }
    const statutory = cfg.useStatutoryRules !== false;
    const a = commission(cfg, "artist_booking");
    const v = commission(cfg, "venue_rental");
    const aIncl = cfg.commissionVatIncluded;
    const est = cfg.estimateStopajRate ?? 0.2;
    const charge0 = G + (a.borne === "payer" ? a.take : 0);
    const fee = Math.round(charge0 * (cfg.paytrFeeRate || 0));
    const feeOnPayee = cfg.paytrFeeBorneBy === "platform" ? 0 : fee;
    const estPayee = G - (a.borne === "payee" ? a.take : 0) - Math.round(G * est) - feeOnPayee;
    const settings = [
      li(`Sanatçı komisyonu: ${pct(a.cr)}`, a.cr ? `Sanatçı kiralamada GigBridge'in aracılık bedeli. 10.000 TL'lik işte ${tl(a.c)} (KDV hariç). GigBridge'in geliri budur.` : "Sanatçı kiralamada komisyon alınmaz."),
      li(`Komisyon KDV oranı: ${pct(a.v)} (yasal)`, a.cr ? `Komisyona eklenen KDV: ${tl(a.vat)}. Bu GigBridge'in geliri değil; komisyon faturasıyla devlete beyan edilir. Toplam kesilen: ${tl(a.take)}.` : "Komisyon olmadığı için KDV de yok."),
      li(`Komisyon KDV dahil: ${aIncl ? "Açık" : "Kapalı"}`, aIncl ? `KDV komisyonun İÇİNDEN ayrılır: toplam ${tl(a.take)} (${tl(a.c)} + ${tl(a.vat)} KDV). Kapatırsan KDV üstüne eklenir ve kesinti büyür.` : `KDV komisyonun ÜSTÜNE eklenir: ${tl(a.c)} + ${tl(a.vat)} = ${tl(a.take)}. Açarsan toplam kesinti ${tl(Math.round(G * a.cr))} olur (KDV içinde).`),
      li(`Komisyonu karşılayan (sanatçı): ${a.borne === "payer" ? "Ödeyen" : "Alıcı"}`, a.borne === "payer" ? `Mekan 10.000 TL + ${tl(a.take)} = ${tl(G + a.take)} öder; sanatçının payından komisyon düşmez.` : `Mekan 10.000 TL öder; ${tl(a.take)} sanatçının payından düşer.`),
      li(`Mekan kiralama: ${pct(v.cr)} komisyon`, v.cr ? `Mekan kiralamada (organizatör mekanı kiralar) ${tl(v.c)} + ${tl(v.vat)} KDV; ${v.borne === "payer" ? "organizatör üstüne öder" : "mekanın payından düşer"}.` : "Mekan kiralamada GigBridge komisyon almaz."),
      li(`Tahmini stopaj: ${pct(est)}`, `YALNIZ ekrandaki tahmin. Sanatçıya teklifte "Sana kalacak ≈ ${tl(estPayee)}" gösterilir (en kötü durum). Gerçek kesintiyi DEĞİŞTİRMEZ; gerçek kesinti kanuna göre (aşağıda) belirlenir.`),
      li(`PayTR masrafı: ${pct(cfg.paytrFeeRate ?? 0)} · ${cfg.paytrFeeBorneBy === "platform" ? "GigBridge karşılar" : "sanatçının payından"}`, !(cfg.paytrFeeRate > 0)
        ? "Oran girilmedi (%0): PayTR masrafı hesaba katılmıyor. PayTR sözleşmesindeki oranı gir."
        : cfg.paytrFeeBorneBy === "platform"
          ? `PayTR tahsilattan ${tl(fee)} keser; GigBridge'in ${tl(a.take)} payından ödenir, sanatçıya etkisi yok.`
          : `PayTR tahsilattan ${tl(fee)} keser; sanatçının payından düşülür. Sanatçı fiyatı "cebime girecek" diye girerse bu masraf fiyata eklenir, sanatçının istediği tutar değişmez.`),
      li(`Test modu: ${cfg.testMode ? "Açık" : "Kapalı"}`, cfg.testMode ? "Kartlardan para ÇEKİLMEZ (deneme)." : "Kartlardan GERÇEK para çekilir."),
      li(`Otomatik aktarım: ${cfg.autoPayout ? "Açık" : "Kapalı"}`, cfg.autoPayout ? "Etkinlik bitişinden 16 gün sonra (şikayet süresi bitişten 24 saat sonra kapanır), şikayet ve vergi kontrolü geçerse para o sabah 08:00'deki aktarımla sanatçının IBAN'ına kendiliğinden gider." : "Para kendiliğinden gitmez; \"Serbest bırakılacak\" listesinde senin onayını bekler."),
    ];

    const approved = (rules || []).filter((r) => r.status === "approved");
    const resp = (r) => (r.responsible === "payer" ? "ödeyen (mekan) keser ve muhtasarla öder; mekan o kadar az öder" : "GigBridge keser ve muhtasarla öder; gelir sayılmaz");
    const cond = (r) => {
      const c = r.conditions || {};
      const parts = [];
      if (c.kinds?.length) parts.push(c.kinds.map((k) => (k === "venue_rental" ? "mekan kiralama" : "sanatçı kiralama")).join(" / "));
      if (c.payeeCategories?.length) parts.push(`alıcı: ${c.payeeCategories.map((k) => CAT[k] || k).join(" / ")}`);
      if (c.payerStopajResponsible) parts.push(c.payerStopajResponsible === "evet" ? "ödeyen stopaj sorumlusu" : "ödeyen stopaj sorumlusu değil");
      if (c.groupPayee === true) parts.push("grup"); else if (c.groupPayee === false) parts.push("grup değil");
      return parts.length ? parts.join(" + ") : "tüm ödemeler";
    };
    const ruleList = approved.length
      ? approved.map((r) => li(`Eğer ${cond(r)}`, `${WH[r.type]}${r.type === "no_withholding" ? "" : ` ${pct(r.rate)} (matrah: ${r.base === "gross_excl_vat" ? "KDV hariç brüt" : "brüt"}) → ${resp(r)}`}. Onay: ${r.approvedByName || "—"} · ${r.approvalRef || "—"} · v${r.version || 1}`))
      : [statutory
        ? li("Kanuni kurallar (GVK md. 94)", "Vergi kaydı olmayan ya da serbest meslek mükellefi sanatçıya, şirket ya da gerçek usul mekan ödeme yaparsa %20 stopajı MEKAN keser: mekan PayTR'den o kadar az öder, stopajı muhtasarla kendisi yatırır. Basit usul mekan ve şirketi (ticari şahıs şirketi, Ltd, AŞ) olan sanatçıda kesinti yok. Vergi bilgisi eksik ya da mekanın durumu belirsizse ödeme aktarılmadan önce Finansal İncelemeye düşer.")
        : dkInlineMessage("err", "Kanuni kurallar kapalı ve kayıtlı kural yok: vergi durumu belirlenemeyen ödemeler Finansal İncelemeye düşer.")];

    const rows = SCENARIOS.map((s) => {
      const whK = s.w.reduce((t, w) => t + whAmount(w), 0);
      const payerW = s.w.filter((w) => w.responsible === "payer").reduce((t, w) => t + whAmount(w), 0);
      const charge = G - payerW + (a.borne === "payer" ? a.take : 0);
      const payee = G - (a.borne === "payee" ? a.take : 0) - whK - (cfg.paytrFeeBorneBy === "platform" ? 0 : Math.round(charge * (cfg.paytrFeeRate || 0)));
      const sys = matchRules(rules, { kind: "artist_booking", cat: s.cat, payer: s.payer, statutory });
      return h("tr", { style: { cursor: "default" } },
        h("td", {}, s.artist), h("td", {}, s.payerTxt),
        h("td", {}, s.w.length ? s.w.map((w) => `${WH[w.type]} ${pct(w.rate)} = ${tl(whAmount(w))}`).join(" + ") : "Kesinti yok"),
        h("td", { class: "is-num", style: { color: "#7CE0B0", fontWeight: "700" } }, tl(payee)), h("td", { class: "is-num" }, tl(charge)),
        h("td", { style: { color: sys.ok ? "#7CE0B0" : "#F5B754" } }, sys.text),
        h("td", {}, s.who), h("td", {}, s.doc), h("td", {}, s.law));
    });
    const table = h("div", { class: "dk-fin-tblwrap", style: { margin: "0" }, tabindex: "0", role: "region", "aria-label": "Senaryo tablosu (yatay kaydırılır)" },
      h("table", { class: "dk-fin-tbl" },
        h("thead", {}, h("tr", {}, ...["SANATÇI", "MEKAN", "KESİNTİ (10.000 TL)", "SANATÇIYA KALAN", "MEKAN ÖDER", "SİSTEMDE", "KESEN / BEYAN", "BELGE", "DAYANAK"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, ...rows)));

    el.replaceChildren(
      h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "ORAN ÖZETİ · KİM, NEYİ, NEDEN ÖDER")),
      h("div", { class: "dk-admin-etk-form", style: { gap: "0" } },
        p("Muhasebeci / mali müşavir için özet. Örnek: 10.000 TL brüt sahne bedeli, sağdaki ayarlarla (değiştirdikçe burası anında güncellenir)."),
        head("1", "HER AYAR NEYİ DEĞİŞTİRİR"), ...settings,
        head("2", "VERGİ KESİNTİLERİ — KANUNA GÖRE"), ...ruleList,
        head("3", "SENARYOLAR — 10.000 TL, GÜNCEL AYARLARLA"), table,
        p("\"Sistemde\" sütunu: ödeme anında sistemin uygulayacağı kesinti. Finans › Vergi Kuralları'na kayıtlı bir kural varsa o kanuni kuralın önüne geçer.", { marginTop: "10px", color: "#8A8E97" })));
  }
  return { el, update };
}
