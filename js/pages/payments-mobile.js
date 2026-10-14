// Ödemeler — ≤768 px (legacy mobil) en sade görünüm: kullanıcının taraf olduğu ödemelerin salt-okuma listesi.
// Ödeme yapma (PayTR), şikayet, iptal ve IBAN işlemleri masaüstü web panelinde (≥769) ya da GigBridge uygulamasında.
// Sorgu kural gereği: payments where partyUids array-contains uid (tek sefer; legacy sayfaların kapatma kancası yok → dinleyici yok).
import { h, clear, empty, spinner } from "../ui.js";
import { session } from "../store.js";
import { db, collection, query, where, getDocs } from "../firebase.js";
import { toPayment, filterMyPayments, statusLabel, TONE_COLOR, fmtKurus, earnedSummary, paidSummary, payerHistoryLabel, payeeBreakdownText } from "../desktop/shared/pay-util.js";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const day = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export async function renderPaymentsMobile(root, role) {
  clear(root);
  const uid = session.user?.uid || "";
  const isPayee = role === "artist" || role === "venue";
  const isPayer = role === "venue" || role === "organizer";
  const box = h("div", {}, h("div", { class: "loading" }, spinner()));
  root.append(
    h("p", { class: "muted", style: { margin: "4px 0 14px", fontSize: "14px", lineHeight: "1.55" } },
      "Ödeme yapmak, iptal talebi, şikayet ve IBAN işlemleri için GigBridge uygulamasını ya da bilgisayardan gigbridges.com'u kullan. Burada ödemelerinin durumunu görürsün."),
    box);
  if (!uid || uid.startsWith("demo_")) { clear(box); box.append(empty("wallet-outline", "Henüz ödeme yok.", "")); return; }
  let rows;
  try {
    const snap = await getDocs(query(collection(db, "payments"), where("partyUids", "array-contains", uid)));
    rows = filterMyPayments(snap.docs.map((d) => toPayment(d.id, d.data())), uid).filter((p) => p.status !== "pending");
  } catch (_) {
    clear(box); box.append(empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip yenile."));
    return;
  }
  if (!root.isConnected) return;
  clear(box);
  if (isPayee || isPayer) {
    // ödeyen (mekan / organizatör): ÖDENEN = emanette + aktarılan, iadeler hariç (masaüstü Ödemeler ile aynı paidSummary)
    const e = earnedSummary(rows, uid), ps = isPayer ? paidSummary(rows, uid) : null;
    const cards = [
      isPayer ? ["ÖDENEN", fmtKurus(ps.paid), "var(--text)", ps.refunded ? `İade ${fmtKurus(ps.refunded)}` : ""] : null,
      isPayee ? ["EMANETTE", fmtKurus(e.held), "var(--text)"] : ["EMANETTE", fmtKurus(ps.held), "var(--text)"],
      isPayee ? ["AKTARILAN", fmtKurus(e.sent), "#7CE0B0"] : null,
    ].filter(Boolean);
    box.append(h("div", { style: { display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" } },
      ...cards.map(([l, v, c, sub]) =>
        h("div", { class: "card", style: { flex: "1", padding: "12px 14px", boxShadow: "none" } },
          h("div", { class: "muted", style: { fontSize: "11px", fontWeight: "700", letterSpacing: "0.12em" } }, l),
          h("div", { style: { fontSize: "18px", fontWeight: "600", color: c, marginTop: "4px" } }, v),
          sub ? h("div", { class: "muted", style: { fontSize: "11.5px", marginTop: "2px" } }, sub) : null))));
  }
  if (!rows.length) { box.append(empty("wallet-outline", "Henüz ödeme yok.", "")); return; }
  rows.forEach((p) => {
    const side = p.payeeUid === uid ? "payee" : "payer";
    const l = side === "payer" ? payerHistoryLabel(p) : statusLabel(p.status, side);
    const c = TONE_COLOR[l.tone] || TONE_COLOR.muted;
    box.append(h("div", { class: "card", style: { padding: "14px", marginBottom: "10px", boxShadow: "none", display: "flex", gap: "12px", alignItems: "flex-start" } },
      h("div", { style: { flex: "1", minWidth: "0" } },
        h("div", { style: { fontWeight: "600", fontSize: "14.5px" } }, p.title || (p.kind === "venue_rental" ? "Mekan kiralama" : "Sahne ücreti")),
        h("div", { class: "muted", style: { fontSize: "12.5px", marginTop: "3px" } }, (side === "payee" ? [p.payerName, day(p.paidAt ?? p.createdAt)]
          : [p.payeeName, p.eventStartMs ? "Etkinlik " + day(p.eventStartMs) : "", p.paidAt ? "Ödeme " + day(p.paidAt) : day(p.createdAt)]).filter(Boolean).join(" · ")),
        h("div", { style: { marginTop: "6px", fontSize: "10.5px", fontWeight: "700", letterSpacing: "0.1em", color: c } }, l.text + (p.testMode ? " · TEST" : "")),
        side === "payee" ? h("div", { class: "muted", style: { fontSize: "11.5px", marginTop: "4px" } }, payeeBreakdownText(p)) : null,
        side === "payee" && p.status === "finance_review" ? h("div", { class: "muted", style: { fontSize: "11.5px", marginTop: "4px" } }, "Vergi durumu netleşince aktarılır. Vergi bilgilerini ve hizmet belgesini uygulamadan ya da bilgisayardan gigbridges.com'dan tamamlayabilirsin.") : null),
      h("div", { style: { fontWeight: "600", fontSize: "14px", color: side === "payee" ? "#7CE0B0" : "inherit", whiteSpace: "nowrap" } }, fmtKurus(side === "payee" ? p.payeeKurus : p.chargeKurus || p.grossKurus))));
  });
}
