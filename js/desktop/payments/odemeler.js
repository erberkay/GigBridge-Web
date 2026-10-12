// Ödemeler / Kazançlarım — sanatçı · mekan · organizatör paneli (≥769 px). Registry: artistOdeme (#/artist/odemeler),
// venueOdeme (#/venue/odemeler), orgOdeme (#/organizer/odemeler). Tasarım tuvalinde ekran YOK → ortak kit + panel kabuğu.
// Uygulama karşılığı: screens/common/PaymentsScreen.tsx + PayoutAccountScreen.tsx (+ PaymentDisputeScreen çekmecede).
//   ÖDEYEN (mekan / organizatör): "ÖDEME BEKLEYENLER" (kabul edilmiş, ödenmemiş teklif / mekan isteği → PayTR) + geçmiş.
//   ALICI (sanatçı / mekan): emanette / aktarılan özeti, kazanç satırları (komisyon + stopaj ayrıntılı), Ödeme Bilgileri (IBAN).
//   Mekan ayrıca: kabul ettiği ücretli kiralama istekleri (emanet notu + hizmet kapsamı girişi/düzenleme).
// Adres: ?sikayet=<merchantOid> → şikayet çekmecesi · ?bolum=iban → Ödeme Bilgileri kartı (bildirim derin bağlantıları).
// Kayıtlar: payments (partyUids array-contains uid) canlı; bekleyenler tek sefer (Yenile ile yeniden).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkKpi, dkPageHero, dkButton, dkSkeleton, dkEmpty, dkInlineMessage } from "../shared/ui.js";
import { writeQuery, ROLE_COLORS } from "../shared/helpers.js";
import {
  listenMyPayments, loadDueItems, loadVenueRentals, paymentCard, escrowNote, paymentActions, payBadge, openDisputeDrawer,
  payoutAccountCard, legalLinks, fmtKurus, earnedSummary, isOid, isDemoUser, fmtDay, HELD_STATES,
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
      : "Etkinlik ücretlerin emanette tutulur, etkinlikten sonra banka hesabına aktarılır. Komisyon ve stopaj her satırda ayrıntılı.",
    actions: isPayer ? refresh : null,
  });
  const kDue = isPayer ? dkKpi({ label: "ÖDEME BEKLEYENLER", value: "—", sub: "Kabul edilmiş, ödenmemiş", icon: "clock", color: "#FFB347" }) : null;
  const kHeld = dkKpi({ label: "EMANETTE", value: "—", sub: isPayee ? "Etkinlik sonrası hesabına" : "Etkinlik sonrası alıcıya", icon: "shieldCheck", color: "#4ED8FF" });
  const kSent = isPayee ? dkKpi({ label: "AKTARILAN", value: "—", sub: "Banka hesabına geçen", icon: "wallet", color: "#7CE0B0", valueColor: "#7CE0B0" }) : null;
  const kpis = [kDue, kHeld, kSent].filter(Boolean);
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

  // ── kenar: Ödeme Bilgileri (alıcı) + nasıl çalışır + yasal ──
  let acct = null;
  if (isPayee) { acct = payoutAccountCard({ openForm: ctx.query?.get?.("bolum") === "iban" }); aside.append(acct.node); unsubs.push(() => acct.destroy()); }
  aside.append(h("section", { class: `${C}-info` },
    h("span", { class: `${C}-h` }, "NASIL ÇALIŞIR"),
    h("ol", { class: `${C}-steps` },
      h("li", {}, "Teklif ya da mekan isteği kabul edilince ödeyen PayTR ile öder."),
      h("li", {}, "Para etkinlik bitişinden 24 saat sonrasına kadar emanette bekler."),
      h("li", {}, "Sorun bildirilmezse alıcının IBAN'ına aktarılır (komisyon ve %1 stopaj düşülür).")),
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
    const amount = side === "payee" ? p.payeeKurus : p.grossKurus;
    const other = side === "payee" ? p.payerName : p.payeeName;
    const when = p.paidAt ?? p.createdAt;
    const acts = paymentActions(p, side, { onOpenDispute: openDispute });
    return h("article", { class: `${C}-hrow` },
      h("span", { class: cx(`${C}-htile`, side === "payee" && "is-in") }, svgIcon("wallet", { size: 17, sw: "1.9" })),
      h("div", { class: `${C}-hbody` },
        h("span", { class: `${C}-ht` }, p.title || (p.kind === "venue_rental" ? "Mekan kiralama" : "Sahne ücreti")),
        h("span", { class: `${C}-hs` }, [other, when ? fmtDay(when) : ""].filter(Boolean).join(" · ")),
        h("span", { class: `${C}-hf` }, payBadge(p.status, side), p.testMode ? h("span", { class: `${C}-test` }, "TEST") : null),
        side === "payee" ? h("span", { class: `${C}-hb` }, `Ücret ${fmtKurus(p.grossKurus)} · komisyon ${fmtKurus(p.commissionKurus)} · stopaj ${fmtKurus(p.stopajKurus)}`) : null,
        acts),
      h("span", { class: cx(`${C}-hamt`, side === "payee" && "is-in") }, fmtKurus(amount)));
  }
  function drawHist() {
    if (rows === null) { hist.body.replaceChildren(dkSkeleton({ w: "100%", h: 72, r: 8 }), dkSkeleton({ w: "100%", h: 72, r: 8 })); return; }
    if (rows === false) { hist.body.replaceChildren(dkInlineMessage("err", "Ödemeler yüklenemedi. Bağlantını kontrol et.")); return; }
    const list = rows.filter((p) => p.status !== "pending");
    if (!list.length) hist.body.replaceChildren(dkEmpty({ variant: "dashed", icon: "wallet", title: "Henüz ödeme yok.", height: 180, compact: false }));
    else hist.body.replaceChildren(h("div", { class: `${C}-hlist` }, ...list.map(histRow)));
    const e = earnedSummary(rows, uid);
    if (isPayee) { kHeld.dk.setValue(fmtKurus(e.held)); kSent?.dk.setValue(fmtKurus(e.sent)); }
    else {
      // organizatör: ödediği ve emanette bekleyen tutar
      const held = rows.filter((p) => p.payeeUid !== uid && HELD_STATES.includes(p.status)).reduce((a, p) => a + p.grossKurus, 0);
      kHeld.dk.setValue(fmtKurus(held));
    }
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
