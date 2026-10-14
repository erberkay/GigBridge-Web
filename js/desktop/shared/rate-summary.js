/**
 * ORAN ÖZETİ (admin Ödemeler / Finans) — "hangi ayar neyi değiştirir, kim neyi neden öder" — muhasebecinin okuyacağı dille.
 * 10.000 TL brüt sahne bedeli örneği GÜNCEL (ya da düzenlenmekte olan) ayarlarla hesaplanır; vergi kesintisi satırları
 * Finans › Vergi Kuralları'ndaki ONAYLI kurallarla eşleştirilir (functions/finance.js evaluateRules ile aynı koşul mantığı).
 *   const s = rateSummary(); s.update(cfg, rules)  → s.el
 */
import { h } from "../../ui.js";
import { dkInlineMessage } from "./ui.js";

const G = 1000000; // 10.000 TL (kuruş)
const tl = (k) => `${(Math.round(k) / 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
const pct = (v) => `%${Math.round((Number(v) || 0) * 10000) / 100}`;
const WH = { serbest_meslek_stopaj: "Serbest meslek stopajı", eticaret_tevkifat: "E-ticaret tevkifatı", no_withholding: "Kesinti yok" };
const CAT = { A_arizi: "mükellef değil (ara sıra)", A_duzenli: "mükellef değil (düzenli)", B: "serbest meslek mükellefi", C: "şirket / ajans", isletme: "işletme (mekan kiralama)" };

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
  if (!m.length) return { ok: false, text: "Onaylı kural yok → Finansal İnceleme" };
  const w = m.filter((r) => r.type !== "no_withholding");
  const types = w.map((r) => r.type);
  const pairOk = w.every((a) => w.every((b) => a === b || ((a.combinableWith || []).includes(b.type) && (b.combinableWith || []).includes(a.type))));
  if ((w.length && w.length !== m.length) || new Set(types).size !== types.length || !pairOk) return { ok: false, text: "Kurallar çakışıyor → Finansal İnceleme" };
  return { ok: true, rules: w, text: w.length ? `Onaylı: ${w.map((r) => `${WH[r.type]} ${pct(r.rate)}`).join(" + ")}` : "Onaylı: kesinti yok" };
}

// Araştırma önerisi (müşavir onayı bekler) — sanatçı kiralama, 10.000 TL
const PROPOSAL = [
  { cat: "A_arizi", artist: "Vergi mükellefi değil", payer: "evet", payerTxt: "Stopaj sorumlusu (şirket / işletme)",
    w: [{ type: "serbest_meslek_stopaj", rate: 0.2, base: "gross", responsible: "payer" }], who: "Mekan keser, muhtasarla öder", doc: "Gider pusulası (mekan)", law: "GVK 94/2-b" },
  { cat: "A_arizi", artist: "Vergi mükellefi değil", payer: "hayir", payerTxt: "Stopaj sorumlusu değil",
    w: [], who: "—", doc: "Müşavir belirler", law: "—" },
  { cat: "B", artist: "Serbest meslek mükellefi", payer: "evet", payerTxt: "Stopaj sorumlusu",
    w: [{ type: "serbest_meslek_stopaj", rate: 0.2, base: "gross", responsible: "payer" }], who: "Mekan keser, muhtasarla öder", doc: "e-SMM (sanatçı)", law: "GVK 94/2-b" },
  { cat: "B", artist: "Serbest meslek mükellefi", payer: "hayir", payerTxt: "Stopaj sorumlusu değil",
    w: [{ type: "eticaret_tevkifat", rate: 0.01, base: "gross_excl_vat", responsible: "platform" }], who: "GigBridge keser, muhtasarla öder", doc: "e-SMM (sanatçı)", law: "GVK 94/19 · 330 Sıra No.lu GVGT" },
  { cat: "C", artist: "Şirket / ajans", payer: "evet", payerTxt: "Fark etmez",
    w: [{ type: "eticaret_tevkifat", rate: 0.01, base: "gross_excl_vat", responsible: "platform" }], who: "GigBridge keser, muhtasarla öder", doc: "e-Fatura (şirket)", law: "KVK 15 · 330 Sıra No.lu GVGT" },
];

export function rateSummary() {
  const el = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Oran özeti" });
  const p = (txt, extra = {}) => h("p", { class: "dk-admin-etk-e", style: { margin: "0", lineHeight: "1.55", fontSize: "12.5px", color: "#C9CACD", ...extra } }, txt);
  const head = (n, t) => h("div", { style: { fontFamily: "var(--dk-font-mono)", fontSize: "10.5px", letterSpacing: "0.1em", color: "#A78BFA", margin: "18px 0 8px" } }, `${n} · ${t}`);
  const li = (label, effect) => h("div", { style: { display: "grid", gridTemplateColumns: "minmax(150px, 34%) 1fr", gap: "12px", padding: "7px 0", borderBottom: "1px solid #14171D" } },
    h("span", { style: { fontSize: "12.5px", fontWeight: "600", color: "#F2F1EE" } }, label), p(effect));

  function update(cfg, rules) {
    if (!cfg) return;
    const a = commission(cfg, "artist_booking");
    const v = commission(cfg, "venue_rental");
    const aIncl = cfg.commissionVatIncluded;
    const est = cfg.estimateStopajRate ?? 0.2;
    const estPayee = G - (a.borne === "payee" ? a.take : 0) - Math.round(G * est);
    const settings = [
      li(`Sanatçı komisyonu: ${pct(a.cr)}`, a.cr ? `Sanatçı kiralamada GigBridge'in aracılık bedeli. 10.000 TL'lik işte ${tl(a.c)} (KDV hariç). GigBridge'in geliri budur.` : "Sanatçı kiralamada komisyon alınmaz."),
      li(`Komisyon KDV oranı: ${pct(a.v)}`, a.cr ? `Komisyona eklenen KDV: ${tl(a.vat)}. Bu GigBridge'in geliri değil; komisyon faturasıyla devlete beyan edilir. Toplam kesilen: ${tl(a.take)}.` : "Komisyon olmadığı için KDV de yok."),
      li(`Komisyon KDV dahil: ${aIncl ? "Açık" : "Kapalı"}`, aIncl ? `KDV komisyonun İÇİNDEN ayrılır: toplam ${tl(a.take)} (${tl(a.c)} + ${tl(a.vat)} KDV). Kapatırsan KDV üstüne eklenir ve kesinti büyür.` : `KDV komisyonun ÜSTÜNE eklenir: ${tl(a.c)} + ${tl(a.vat)} = ${tl(a.take)}. Açarsan toplam kesinti ${tl(Math.round(G * a.cr))} olur (KDV içinde).`),
      li(`Komisyonu karşılayan (sanatçı): ${a.borne === "payer" ? "Ödeyen" : "Alıcı"}`, a.borne === "payer" ? `Mekan 10.000 TL + ${tl(a.take)} = ${tl(G + a.take)} öder; sanatçının payından komisyon düşmez.` : `Mekan 10.000 TL öder; ${tl(a.take)} sanatçının payından düşer.`),
      li(`Mekan komisyonu: ${pct(v.cr)}`, v.cr ? `Mekan kiralamada (organizatör mekanı kiralar) ${tl(v.c)} + ${tl(v.vat)} KDV; ${v.borne === "payer" ? "organizatör üstüne öder" : "mekanın payından düşer"}.` : "Mekan kiralamada GigBridge komisyon almaz."),
      li(`Tahmini stopaj: ${pct(est)}`, `YALNIZ ekrandaki tahmin. Sanatçıya teklifte "Sana kalacak ≈ ${tl(estPayee)}" gösterilir (en kötü durum). Gerçek kesintiyi DEĞİŞTİRMEZ; gerçek kesinti aşağıdaki onaylı kurallardan gelir.`),
      li(`PayTR masraf oranı: ${pct(cfg.paytrFeeRate ?? 0)}`, `Yalnız finans raporundaki tahmini kart/PayTR masrafı (10.000 TL'de ${tl(Math.round(G * (cfg.paytrFeeRate || 0)))}). Kimsenin ödediği tutarı değiştirmez.`),
      li(`Test modu: ${cfg.testMode ? "Açık" : "Kapalı"}`, cfg.testMode ? "Kartlardan para ÇEKİLMEZ (deneme)." : "Kartlardan GERÇEK para çekilir."),
      li(`Otomatik aktarım: ${cfg.autoPayout ? "Açık" : "Kapalı"}`, cfg.autoPayout ? "Etkinlik bitişinden 24 saat sonra, şikayet ve vergi kontrolü geçerse para her sabah 08:00'de sanatçının IBAN'ına kendiliğinden gider." : "Para kendiliğinden gitmez; \"Serbest bırakılacak\" listesinde senin onayını bekler."),
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
      : [dkInlineMessage("err", "Onaylı vergi kuralı yok: şu an HİÇBİR ödemede stopaj veya tevkifat kesilmiyor. Vergi durumu belirlenemeyen ödemeler sanatçıya aktarılmadan önce \"Finansal İnceleme\"ye düşer; kararı sen verirsin.")];

    const rows = PROPOSAL.map((s) => {
      const whK = s.w.reduce((t, w) => t + whAmount(w), 0);
      const payerW = s.w.filter((w) => w.responsible === "payer").reduce((t, w) => t + whAmount(w), 0);
      const payee = G - (a.borne === "payee" ? a.take : 0) - whK;
      const charge = G - payerW + (a.borne === "payer" ? a.take : 0);
      const sys = matchRules(rules, { kind: "artist_booking", cat: s.cat, payer: s.payer });
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
        head("2", "VERGİ KESİNTİLERİ — YALNIZ MÜŞAVİR ONAYLI KURALLA"), ...ruleList,
        head("3", "SENARYOLAR — ARAŞTIRMA ÖNERİSİ (MÜŞAVİR TEYİDİ BEKLER)"), table,
        p("\"Sistemde\" sütunu: o senaryo için onaylı kural varsa kesinti otomatik uygulanır; yoksa ödeme Finansal İncelemeye düşer. Kuralları Finans › Vergi Kuralları'ndan müşavirin onayıyla gir.", { marginTop: "10px", color: "#8A8E97" }),
        p("Müşavire sorulacaklar: serbest meslek mükellefinde %20 stopaj ile %1 e-ticaret tevkifatı birlikte kesilir mi? Mükellef olmayan sanatçının arızi kazancında (yıllık 350.000 TL istisna) mekan yine %20 keser mi? PayTR dekontu gider pusulası yerine geçer mi? Komisyon faturası sanatçıya mı mekana mı kesilir?", { marginTop: "6px", color: "#8A8E97" })));
  }
  return { el, update };
}
