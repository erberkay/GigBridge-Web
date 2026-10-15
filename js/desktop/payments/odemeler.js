// Ödemeler / Kazançlarım — sanatçı · mekan · organizatör paneli (≥769 px). Registry: artistOdeme (#/artist/odemeler),
// venueOdeme (#/venue/odemeler), orgOdeme (#/organizer/odemeler). Tasarım tuvalinde ekran YOK → ortak kit + panel kabuğu.
// Uygulama karşılığı: screens/common/PaymentsScreen.tsx + PayoutAccountScreen.tsx (+ PaymentDisputeScreen çekmecede).
//   ÖDEYEN (mekan / organizatör): "ÖDEME BEKLEYENLER" (kabul edilmiş, ödenmemiş teklif / mekan isteği → PayTR) + geçmiş.
//   ALICI (sanatçı / mekan): emanette / aktarılan özeti, kazanç satırları (komisyon + KDV + vergi kesintisi ayrıntılı), Ödeme Bilgileri (IBAN).
//   Finans v2: fv:2 kazanç satırında hizmet belgesi (Belge yükle → submitPaymentDocument + durum); vergi bilgisi eksik/reddedilmişse
//   "Vergi bilgilerini tamamla" bandı (alıcıda Ödeme Bilgileri kartında, organizatörde kenarda).
//   Mekan ayrıca: kabul ettiği ücretli kiralama istekleri (emanet notu + hizmet kapsamı girişi/düzenleme).
// Adres: ?sikayet=<merchantOid> → şikayet çekmecesi · ?bolum=iban → Ödeme Bilgileri kartı (bildirim derin bağlantıları).
// Kayıtlar: payments (partyUids array-contains uid) canlı; bekleyenler tek sefer (Yenile ile yeniden).
// ÖDEYEN özeti (Berkay 13 Eki): "ÖDENEN" = ödeyen tarafta başarıyla ödenmiş tutar (emanette + aktarılan; iadeler düşülür, alt yazıda
//   "İade ₺…"). GEÇMİŞ'te giden ödeme satırı: alıcı (sanatçı / grup / mekan) · etkinlik tarihi · ödeme tarihi + durum (Emanette /
//   Aktarıldı / İade / İptal) + iade tutarı. Mekan hem ödeyen hem alıcı → GEÇMİŞ'te Tümü / Ödediklerim / Gelenler süzgeci.
//   Alıcı (sanatçı) görünümü DEĞİŞMEDİ.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkKpi, dkPageHero, dkButton, dkSkeleton, dkEmpty, dkInlineMessage, dkSegmented } from "../shared/ui.js";
import { writeQuery, ROLE_COLORS } from "../shared/helpers.js";
import {
  listenMyPayments, loadDueItems, loadVenueRentals, paymentCard, escrowNote, paymentActions, payBadge, openDisputeDrawer,
  payoutAccountCard, legalLinks, fmtKurus, earnedSummary, paidSummary, payerHistoryLabel, isOid, isDemoUser, fmtDay,
  payeeBreakdownText, payerWithholdingText, payerInvoiceText, paymentDocBlock, taxBanner, isPaidStatus, commissionText, isResale, isResalePayment,
} from "../shared/payments.js";

const C = "dk-odeme";

export function odemelerView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || "";
  const role = ["artist", "venue", "organizer"].includes(ctx.route?.panel) ? ctx.route.panel : "artist";
  const isPayer = role === "venue" || role === "organizer";
  const isPayee = role === "artist" || role === "venue";
  const title = role === "artist" ? "Kazançlarım" : "Ödemeler";
  const demo = isDemoUser();
  let alive = true;
  const unsubs = [];

  const shell = panelShell({ role, active: "odeme", title, crumb: title, ctx, ...(role === "organizer" ? { notifications: "custom" } : {}) });
  const root = shell.content;
  root.classList.add(C);
  if (role === "organizer") {
    import("../organizer/etkinlikler.js").then((m) => { if (!alive) return; const b = m.attachOrgBell(shell, { uid }); unsubs.push(() => b.destroy()); }).catch(() => {});
  }

  // ═════════ HERO + KPI ═════════
  const refresh = dkButton("Yenile", { variant: "outline", size: 40, icon: "refresh", onClick: () => loadDue(true) });
  const hero = dkPageHero({
    eyebrow: "EMANETLİ ÖDEME · PAYTR", title, cls: `${C}-hero`, color: ROLE_COLORS[role],
    lead: isPayer
      ? "Kabul edilen tekliflerin ödemesini buradan yaparsın. Para etkinlikten 24 saat sonrasına kadar emanette tutulur. Etkinlikten önce iptal talep edebilir, sonra kanıtlı şikayet açabilirsin."
      : "Etkinlik ücretlerin emanette tutulur, etkinlikten sonra banka hesabına aktarılır. Komisyon, KDV ve vergi kesintisi her satırda ayrıntılı.",
    actions: isPayer ? refresh : null,
  });
  const kDue = isPayer ? dkKpi({ label: "ÖDEME BEKLEYENLER", value: "—", sub: "Kabul edilmiş, ödenmemiş", icon: "clock", color: "#FFB347" }) : null;
  // ÖDENEN (ödeyen): emanette + aktarılan, iadeler hariç — iade varsa alt yazıda ayrıca
  const PAID_SUB = role === "venue" ? "Sanatçılara ödediğin · emanet + aktarılan" : "Ödediğin · emanet + aktarılan";
  const kPaid = isPayer ? dkKpi({ label: "ÖDENEN", value: "—", sub: PAID_SUB, icon: "checkCircle", color: "#A78BFA" }) : null;
  // mekan hem ödeyen hem alıcı: EMANETTE / AKTARILAN gelen (kiralama) ödemeleri içindir → alt yazı bunu söyler
  const both = isPayer && isPayee;
  const kHeld = dkKpi({ label: "EMANETTE", value: "—", sub: both ? "Gelen ödemeler · etkinlik sonrası hesabına" : isPayee ? "Etkinlik sonrası hesabına" : "Etkinlik sonrası alıcıya", icon: "shieldCheck", color: "#4ED8FF" });
  const kSent = isPayee ? dkKpi({ label: "AKTARILAN", value: "—", sub: both ? "Gelen ödemeler · banka hesabına geçen" : "Banka hesabına geçen", icon: "wallet", color: "#7CE0B0", valueColor: "#7CE0B0" }) : null;
  const kpis = [kDue, kPaid, kHeld, kSent].filter(Boolean);
  const kpiRow = h("section", { class: `${C}-kpis`, style: { "--n": String(kpis.length) }, "aria-label": "Özet" }, ...kpis);

  // ═════════ SÜTUNLAR ═════════
  const main = h("div", { class: `${C}-main` });
  const aside = h("aside", { class: `${C}-aside`, "aria-label": isPayee ? "Ödeme bilgileri" : "Bilgi" });
  root.append(hero, kpiRow, h("div", { class: cx(`${C}-grid`, !isPayee && "is-wide") }, main, aside));

  const sec = (label, id) => {
    const body = h("div", { class: `${C}-sbody` });
    const el = h("section", { class: `${C}-sec`, "aria-labelledby": id }, h("h2", { id, class: `${C}-h` }, label), body);
    return { el, body };
  };
  const due = isPayer ? sec("ÖDEME BEKLEYENLER", `${C}-h-due`) : null;
  const rentals = role === "venue" ? sec("KİRALAMA ÖDEMESİ BEKLENENLER", `${C}-h-vr`) : null;
  const hist = sec(isPayee && !isPayer ? "KAZANÇLAR" : "GEÇMİŞ", `${C}-h-hist`);
  if (due) main.append(due.el);
  if (rentals) { rentals.el.hidden = true; main.append(rentals.el); }
  main.append(hist.el);
  // Mekan: GEÇMİŞ süzgeci (giden = ödediklerim / gelen = kiralama ödemeleri) — yalnız iki yönde de kayıt varsa görünür
  let histFilter = "all";
  const histSeg = both ? dkSegmented({ size: 36, role: "radiogroup", label: "Geçmiş süzgeci", value: "all",
    items: [{ key: "all", label: "Tümü", count: 0 }, { key: "out", label: "Ödediklerim", count: 0 }, { key: "in", label: "Gelenler", count: 0 }],
    onChange: (k) => { histFilter = k; drawHist(); } }) : null;
  if (histSeg) { histSeg.hidden = true; hist.el.insertBefore(histSeg, hist.body); }

  // ── kenar: Ödeme Bilgileri (alıcı) + nasıl çalışır + yasal ──
  let acct = null;
  if (isPayee) { acct = payoutAccountCard({ openForm: ctx.query?.get?.("bolum") === "iban" }); aside.append(acct.node); unsubs.push(() => acct.destroy()); }
  else if (!demo) { const tb = taxBanner(); aside.append(tb.node); unsubs.push(() => tb.destroy()); }   // organizatör: vergi bilgisi bandı
  // 3. adım iş modeline göre (Yol A: GigBridge sahneyi alır, satar) — oranlar gelince güncellenir
  const stepPay = h("li", {});
  const stepResale = h("li", { hidden: true });
  const paintSteps = () => {
    const resale = isResale("artist_booking");
    stepPay.textContent = resale && role === "artist"
      ? `Sorun bildirilmezse IBAN'ına aktarılır: GigBridge sahneni satın alır; ${commissionText()} ve varsa stopaj (GigBridge yatırır) düşülür.`
      : `Sorun bildirilmezse alıcının IBAN'ına aktarılır (${commissionText(resale ? "venue_rental" : "artist_booking")} ve varsa mevzuata göre vergi kesintisi düşülür).`;
    stepResale.hidden = !(resale && isPayer);
    stepResale.textContent = "Sanatçı kiralamada sahneyi GigBridge'den satın alırsınız: sahne bedeli + %20 KDV ödersiniz, ajans ve organizasyon hizmeti faturanız (e-Fatura / e-Arşiv) GigBridge'den gelir. Stopaj kesmez, gider pusulası düzenlemezsiniz.";
  };
  paintSteps();
  window.addEventListener("gb:pay-rates", paintSteps);
  unsubs.push(() => window.removeEventListener("gb:pay-rates", paintSteps));
  aside.append(h("section", { class: `${C}-info` },
    h("span", { class: `${C}-h` }, "NASIL ÇALIŞIR"),
    h("ol", { class: `${C}-steps` },
      h("li", {}, "Teklif ya da mekan isteği kabul edilince ödeyen PayTR ile öder."),
      h("li", {}, "Para etkinlik bitişinden 24 saat sonrasına kadar emanette bekler."),
      stepPay, stepResale,
      h("li", {}, "Vergi durumu belirsiz ödemeler finansal incelemeden sonra aktarılır.")),
    legalLinks()));

  // ═════════ ÖDEME BEKLEYENLER ═════════
  let dueParts = [];
  let dueCount = null;
  const skel = () => [0, 1].map(() => h("div", { class: `${C}-skel` }, dkSkeleton({ w: "40%", h: 14 }), dkSkeleton({ w: "100%", h: 120, r: 8 })));
  async function loadDue(force = false) {
    if (!isPayer && role !== "venue") return;
    if (demo || !uid) { drawDue([]); drawRentals([]); return; }
    if (force) refresh.dk.setBusy(true, "Yenileniyor…");
    if (due && (force || !dueParts.length)) due.body.replaceChildren(...skel());
    try {
      const [items, vrs] = await Promise.all([
        isPayer ? loadDueItems(role, uid).catch((e) => { console.warn("[ödemeler] bekleyenler", e); return null; }) : [],
        role === "venue" ? loadVenueRentals(uid).catch(() => []) : [],
      ]);
      if (!alive) return;
      drawDue(items);
      drawRentals(vrs);
    } finally { if (force && refresh.isConnected) refresh.dk.setBusy(false); }
  }
  function drawDue(items) {
    if (!due) return;
    dueParts.forEach((p) => p.destroy()); dueParts = [];
    if (items == null) {
      due.body.replaceChildren(dkInlineMessage("err", "Ödeme bekleyenler yüklenemedi. Bağlantını kontrol edip Yenile'ye bas."));
      dueCount = null; kDue?.dk.setValue("—");
      return;
    }
    dueCount = items.length;
    kDue?.dk.setValue(String(items.length));
    if (!items.length) { due.body.replaceChildren(h("p", { class: `${C}-empty` }, "Ödenmemiş kabul edilmiş teklif yok.")); return; }
    due.body.replaceChildren(h("div", { class: `${C}-cards` }, ...items.map((d) => {
      const card = paymentCard({ ...d, onPaid: () => setTimeout(() => { if (alive) loadDue(); }, 1500), onOpenDispute: openDispute });
      dueParts.push(card);
      return h("article", { class: `${C}-due` },
        h("div", { class: `${C}-duehead` }, h("span", { class: `${C}-duet` }, d.title), d.when ? h("span", { class: `${C}-duew` }, d.when) : null),
        card.node);
    })));
  }
  let vrParts = [];
  function drawRentals(list) {
    if (!rentals) return;
    vrParts.forEach((p) => p.destroy()); vrParts = [];
    rentals.el.hidden = !list?.length;
    if (!list?.length) { rentals.body.replaceChildren(); return; }
    rentals.body.replaceChildren(h("div", { class: `${C}-cards` }, ...list.map((d) => {
      const note = escrowNote({ kind: "venue_rental", refId: d.refId, amountTL: d.amountTL, paymentStatus: d.paymentStatus, paymentId: d.paymentId, accepted: true, ibanHref: "#/venue/odemeler?bolum=iban", onOpenDispute: openDispute });
      vrParts.push(note);
      return h("article", { class: `${C}-due` },
        h("div", { class: `${C}-duehead` }, h("span", { class: `${C}-duet` }, d.title), d.when ? h("span", { class: `${C}-duew` }, d.when) : null),
        note.node);
    })));
  }
  unsubs.push(() => { dueParts.forEach((p) => p.destroy()); vrParts.forEach((p) => p.destroy()); });

  // ═════════ GEÇMİŞ / KAZANÇLAR (canlı) ═════════
  let rows = null;
  function histRow(p) {
    const side = p.payeeUid === uid ? "payee" : "payer";
    const amount = side === "payee" ? p.payeeKurus : p.chargeKurus || p.grossKurus;
    const other = side === "payee" ? p.payerName : p.payeeName;
    const when = p.paidAt ?? p.createdAt;
    const acts = paymentActions(p, side, { onOpenDispute: openDispute });
    // giden ödeme: alıcı · etkinlik tarihi · ödeme tarihi (+ iade tutarı); gelen (alıcı) satırı eskisi gibi
    const sub = side === "payee" ? [other, when ? fmtDay(when) : ""]
      : [other, p.eventStartMs ? "Etkinlik " + fmtDay(p.eventStartMs) : "", p.paidAt ? "Ödeme " + fmtDay(p.paidAt) : when ? fmtDay(when) : ""];
    // Yol A: ödeyenden çekilen = sahne bedeli + KDV (iade de bu tutar üzerinden)
    const paidK = isResalePayment(p) ? p.chargeKurus : p.grossKurus;
    const refunded = side === "payer" ? (p.status === "refunded" ? paidK : Math.min(paidK, p.refundedKurus || 0)) : 0;
    return h("article", { class: `${C}-hrow` },
      h("span", { class: cx(`${C}-htile`, side === "payee" && "is-in") }, svgIcon("wallet", { size: 17, sw: "1.9" })),
      h("div", { class: `${C}-hbody` },
        h("span", { class: `${C}-ht` }, p.title || (p.kind === "venue_rental" ? "Mekan kiralama" : "Sahne ücreti")),
        h("span", { class: `${C}-hs` }, sub.filter(Boolean).join(" · ")),
        h("span", { class: `${C}-hf` }, side === "payer" ? payBadge(p.status, side, payerHistoryLabel(p)) : payBadge(p.status, side), p.testMode ? h("span", { class: `${C}-test` }, "TEST") : null),
        side === "payee" ? h("span", { class: `${C}-hb` }, payeeBreakdownText(p)) : null,
        side === "payer" && payerWithholdingText(p) ? h("span", { class: `${C}-hb`, style: { color: "#FFB347" } }, payerWithholdingText(p)) : null,
        side === "payer" && payerInvoiceText(p) ? h("span", { class: `${C}-hb` }, payerInvoiceText(p)) : null,
        side === "payer" && p.payerRefundDueKurus > 0 ? h("span", { class: `${C}-hb`, style: { color: "#7CE0B0" } }, `Vergi farkı iadesi ${fmtKurus(p.payerRefundDueKurus)}`) : null,
        refunded > 0 ? h("span", { class: `${C}-hb` }, refunded >= paidK ? `${fmtKurus(refunded)} iade edildi` : `İade ${fmtKurus(refunded)} · ödenen net ${fmtKurus(paidK - refunded)}`) : null,
        acts,
        // Finans v2: alıcı hizmet belgesi (yalnız ödenmiş, iade edilmemiş fv:2 kayıtlar)
        side === "payee" && p.fv === 2 && isPaidStatus(p.status) && p.status !== "refunded" && !demo ? paymentDocBlock(p) : null),
      h("span", { class: cx(`${C}-hamt`, side === "payee" && "is-in") }, fmtKurus(amount)));
  }
  function drawHist() {
    if (rows === null) { hist.body.replaceChildren(dkSkeleton({ w: "100%", h: 72, r: 8 }), dkSkeleton({ w: "100%", h: 72, r: 8 })); return; }
    if (rows === false) { hist.body.replaceChildren(dkInlineMessage("err", "Ödemeler yüklenemedi. Bağlantını kontrol et.")); return; }
    const all = rows.filter((p) => p.status !== "pending");
    const isIn = (p) => p.payeeUid === uid;
    const nIn = all.filter(isIn).length, nOut = all.length - nIn;
    if (histSeg) {
      histSeg.hidden = !(nIn && nOut);
      if (histSeg.hidden) histFilter = "all";
      histSeg.dk.setCount("all", all.length); histSeg.dk.setCount("out", nOut); histSeg.dk.setCount("in", nIn);
    }
    const list = histFilter === "out" ? all.filter((p) => !isIn(p)) : histFilter === "in" ? all.filter(isIn) : all;
    if (!list.length) hist.body.replaceChildren(dkEmpty({ variant: "dashed", icon: "wallet", title: histFilter === "out" ? "Henüz yaptığın ödeme yok." : histFilter === "in" ? "Henüz gelen ödeme yok." : "Henüz ödeme yok.", height: 180, compact: false }));
    else hist.body.replaceChildren(h("div", { class: `${C}-hlist` }, ...list.map(histRow)));
    const e = earnedSummary(rows, uid);
    const ps = isPayer ? paidSummary(rows, uid) : null;
    if (kPaid) {
      kPaid.dk.setValue(fmtKurus(ps.paid));
      kPaid.dk.setSub(ps.refunded > 0 ? `${PAID_SUB} · İade ${fmtKurus(ps.refunded)}` : PAID_SUB);
    }
    if (isPayee) { kHeld.dk.setValue(fmtKurus(e.held)); kSent?.dk.setValue(fmtKurus(e.sent)); }
    else kHeld.dk.setValue(fmtKurus(ps.held));   // organizatör: ödediği ve emanette bekleyen tutar (iade düşülmüş)
  }
  if (uid && !demo) {
    try { unsubs.push(listenMyPayments(uid, (r) => { if (!alive) return; rows = r; drawHist(); }, (e) => { console.warn("[ödemeler]", e); if (alive) { rows = false; drawHist(); } })); }
    catch (_) { rows = false; }
  } else rows = [];
  drawHist();
  loadDue();

  // ═════════ ŞİKAYET ÇEKMECESİ (?sikayet=) + IBAN (?bolum=iban) ═════════
  let drawer = null, drawerOid = null;
  function openDispute(oid) {
    if (!isOid(oid)) return;
    if (drawer && drawerOid === oid) return;
    drawer?.close("switch");
    drawerOid = oid;
    writeQuery({ sikayet: oid });
    drawer = openDisputeDrawer(oid, {
      onChanged: () => { if (alive) loadDue(); },
      onClose: (r) => { if (drawerOid === oid) { drawer = null; drawerOid = null; if (r !== "route" && r !== "switch" && alive) writeQuery({ sikayet: null }); } },
    });
  }
  function apply(q) {
    const sk = q?.get?.("sikayet");
    if (sk && isOid(sk)) openDispute(sk);
    else if (!sk && drawer) drawer.close("query");
    if (q?.get?.("bolum") === "iban" && acct) requestAnimationFrame(() => acct.focus());
  }
  apply(ctx.query);

  return {
    node: shell.node,
    update(q) { apply(q); },
    onSession(ns) { return !!ns?.user && ns.user.uid === uid; },
    destroy() { alive = false; unsubs.forEach((f) => { try { f(); } catch (_) {} }); shell.destroy(); },
  };
}
