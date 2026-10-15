// ÖDEME (masaüstü ≥769) — servis katmanı + ortak bileşenler. Uygulamadaki karşılıkları:
//   services/payments.ts + paymentCases.ts · components/payments/PaymentCards.tsx (PaymentCard / EscrowNote / PaymentActions) ·
//   PaytrCheckout.tsx · ServiceTermsView.tsx · Evidence.tsx · EventPaymentsPanel.tsx · screens/common/PayoutAccountScreen,
//   PaymentDisputeScreen · venue/ServiceTermsScreen.
// Sunucu: functions/payments.js (createPayment, setPayoutAccount, getPayoutAccount, adminPayments) + paymentCases.js
// (setVenueServiceTerms, confirmVenueServiceTerms, disputePayment, respondPaymentDispute, getPaymentDispute,
// requestPaymentCancellation, respondPaymentCancellation, payeeCancelPayment). Tutar istemciden GİTMEZ; ödeme yazımları yalnız sunucu.
// İstemci yalnız payments (partyUids), invitations, venueRequests okur ve Storage'a kanıt yükler.
// Görsel dil: ortak kit (dkButton, dkModal, dkDrawer, dkStatusBadge, dkCheckbox …) + css/dk-odeme.css (yalnız yerleşim).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import {
  db, functions, httpsCallable, storage, ref as storageRef, uploadBytes,
  doc, getDoc, getDocs, onSnapshot, collection, query, where, updateDoc, serverTimestamp,
} from "../../firebase.js";
import { svgIcon, svgRaw } from "./icons.js";
import { cx, dkButton, dkCheckbox, dkInput, dkTextarea, dkSelect, dkChip, dkModal, dkDrawer, dkToast, dkConfirm, dkStatusBadge, dkSkeleton, dkInlineMessage } from "./ui.js";
import { ensureCss } from "../css.js";
import { BASE_CSS } from "../registry.js";
import { LEGAL } from "./assets.js";
import * as U from "./pay-util.js";

export * from "./pay-util.js";
export const PAY_CSS = "css/dk-odeme.css";
// Kaskad sırası: modül rota CSS'inden ÖNCE içe aktarılabilir (ilk masaüstü açılışı) → önce taban (dk-base, dk-ui), sonra ödeme CSS'i;
// ensureCss href başına tekildir, rota sonradan aynı dosyaları isterse sıra değişmez.
BASE_CSS.forEach((c) => ensureCss(c));
ensureCss(PAY_CSS);

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_S = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const p2 = (n) => String(n).padStart(2, "0");
/** "12 Ekim 21:30" (uygulama: d MMMM HH:mm) */
export const fmtDT = (ms) => { if (!ms) return "—"; const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** "12 Eki 21:30" (admin) */
export const fmtDTShort = (ms) => { if (!ms) return "—"; const d = new Date(ms); return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** "12 Ekim" */
export const fmtDay = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
/** ISO "2026-10-12" → "12 Ekim 2026" (uygulama isoToTRDate) */
export function isoToTR(iso) {
  const m = typeof iso === "string" ? iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m) return typeof iso === "string" ? iso : "";
  const mi = parseInt(m[2], 10) - 1;
  return mi < 0 || mi > 11 ? iso : `${parseInt(m[3], 10)} ${MONTHS[mi]} ${m[1]}`;
}

const myUid = () => session.user?.uid || "";
export const isDemoUser = () => myUid().startsWith("demo_");
const ic = (name, size = 16, color, sw) => svgIcon(name, { size, color, sw });

// ══════════════════════════════════════════════════════════════════════
// SERVİS
// ══════════════════════════════════════════════════════════════════════
const call = (name, timeout = 30000) => (data) => httpsCallable(functions, name, { timeout })(data ?? {}).then((r) => r.data);
export const payApi = {
  createPayment: (kind, refId) => call("createPayment", 45000)(kind === "artist_booking" ? { kind, invitationId: refId } : { kind, venueRequestId: refId }),
  getPayoutAccount: () => call("getPayoutAccount", 15000)({}),
  setPayoutAccount: (fullName, iban) => call("setPayoutAccount", 20000)({ fullName, iban }),
  saveServiceTerms: call("setVenueServiceTerms"),
  confirmServiceTerms: call("confirmVenueServiceTerms"),
  getPaymentDispute: call("getPaymentDispute", 60000),
  openDispute: call("disputePayment", 60000),
  respondDispute: call("respondPaymentDispute", 60000),
  requestCancellation: call("requestPaymentCancellation"),
  respondCancellation: call("respondPaymentCancellation", 60000),
  payeeCancel: call("payeeCancelPayment", 60000),
  admin: call("adminPayments", 120000),
  // Finans v2 (sözleşme: finance-contract.md)
  getTaxProfile: () => call("getTaxProfile", 20000)({}),
  setTaxProfile: call("setTaxProfile", 30000),
  setGroupPayoutShares: call("setGroupPayoutShares", 30000),
  submitPaymentDocument: call("submitPaymentDocument", 30000),
  getGiderPusulasi: call("getGiderPusulasi", 30000),
  adminEInvoice: call("adminEInvoice", 120000),   // komisyon e-faturası (Trendyol E-Faturam — functions/efatura.js)
};

// ── Oranlar: publicConfig/payments (herkes okur; yoksa pay-util varsayılanları). Oturum başına bir kez, 10 dk önbellek. ──
let _rates = { at: 0, p: null };
export function loadPayRates(force = false) {
  if (!force && _rates.p && Date.now() - _rates.at < 600e3) return _rates.p;
  const p = getDoc(doc(db, "publicConfig", "payments"))
    .then((d) => { const r = U.setPayRates(d.exists() ? d.data() : null); try { window.dispatchEvent(new CustomEvent("gb:pay-rates")); } catch (_) {} return r; })
    .catch(() => U.getPayRates());
  _rates = { at: Date.now(), p };
  return p;
}
loadPayRates();

// ── Vergi profili durumu (banner'lar için kısa önbellek; kaydedince gb:tax-profile olayı) ──
let _tax = { uid: null, at: 0, p: null };
export function taxProfileCached(force = false) {
  const uid = myUid();
  if (!force && _tax.uid === uid && _tax.p && Date.now() - _tax.at < 60e3) return _tax.p;
  const p = payApi.getTaxProfile();
  _tax = { uid, at: Date.now(), p };
  p.catch(() => { if (_tax.p === p) _tax.p = null; });
  return p;
}
export const invalidateTaxProfile = () => { _tax = { uid: null, at: 0, p: null }; };
/** Vergi bilgisi eksik ya da reddedilmiş mi (banner) — hata/demoda false (gürültü yapma). */
export async function taxProfileNeedsAction() {
  if (isDemoUser() || !myUid()) return false;
  try { const r = await taxProfileCached(); return !r?.exists || r.status === "rejected"; } catch (_) { return false; }
}
/** Teklif/rezidans kabulünde vergi bilgisi yoksa (data.js assertTaxProfile → code 'tax-profile-required'): doldur ya da destek. */
export async function taxRequiredPrompt() {
  const ok = await dkConfirm({
    title: "Vergi bilgileri gerekli",
    body: "Profilini kullanmaya devam edebilirsin, ama mekanlarla anlaşmak (teklif kabul etmek) için önce Vergi Bilgilerini doldurmalısın. Ne seçeceğinden emin değilsen Destek'ten bize yaz.",
    confirmLabel: "Vergi Bilgilerini doldur", cancelLabel: "Destek'ten bilgi al",
  });
  location.hash = ok ? "#/artist/profil?tab=vergi" : "#/artist/profil?tab=vergi&destek=vergi";
}
/** "Vergi bilgilerini tamamla" bandı (rol profilindeki Vergi Bilgileri'ne bağlantı). Gerekmiyorsa gizli kalır. */
export function taxBanner({ href = null, text = null } = {}) {
  const role = session.profile?.userType;
  const to = href || (role === "artist" ? "#/artist/profil?tab=vergi" : role === "venue" ? "#/venue/profil?bolum=vergi" : role === "organizer" ? "#/organizer/profil?bolum=vergi" : null);
  const node = h(to ? "a" : "div", { href: to, class: "dk-pay-ibanwarn dk-pay-taxwarn", hidden: true },
    ic("alertCircle", 14, "#FFB347", "2"), h("span", {}, text || "Vergi bilgilerini tamamla · ödemelerin finansal incelemede beklemesin"), to ? ic("chevronRight", 14, "#FFB347", "2") : null);
  let alive = true;
  const check = () => taxProfileNeedsAction().then((need) => { if (alive) node.hidden = !need; });
  check();
  window.addEventListener("gb:tax-profile", check);
  return { node, destroy() { alive = false; window.removeEventListener("gb:tax-profile", check); } };
}

export function listenPayment(oid, cb, onError) {
  return onSnapshot(doc(db, "payments", oid), (d) => cb(d.exists() ? U.toPayment(d.id, d.data()) : null), (e) => onError?.(e));
}
/** Kullanıcının taraf olduğu ödemeler — kural gereği sorgu TAM BU şekilde (partyUids array-contains uid); sıralama istemcide. */
export function listenMyPayments(uid, cb, onError) {
  return onSnapshot(query(collection(db, "payments"), where("partyUids", "array-contains", uid)),
    (snap) => cb(U.filterMyPayments(snap.docs.map((d) => U.toPayment(d.id, d.data())), uid)),
    (e) => onError?.(e));
}

// IBAN var mı (EscrowNote uyarısı) — oturum başına kısa önbellek (her kartta ayrı çağrı olmasın)
let _acct = { uid: null, at: 0, p: null };
export function payoutAccountCached(force = false) {
  const uid = myUid();
  if (!force && _acct.uid === uid && _acct.p && Date.now() - _acct.at < 60e3) return _acct.p;
  const p = payApi.getPayoutAccount();
  _acct = { uid, at: Date.now(), p };
  p.catch(() => { if (_acct.p === p) _acct.p = null; });
  return p;
}
const invalidateAccount = () => { _acct = { uid: null, at: 0, p: null }; };

/** Ödeme bekleyenler (uygulama PaymentsScreen loadDue): venue → kabul edilmiş davetler; organizatör → kabul edilmiş
 *  organizatör davetleri + kabul edilmiş mekan istekleri. [{ key, kind, refId, title, when, amountTL, paymentStatus, paymentId, eventId }] */
export async function loadDueItems(role, uid) {
  const out = [];
  const add = (kind, id, x, amountTL, title) => {
    if (!U.dueEligible(x, amountTL)) return;
    out.push({
      key: `${kind}_${id}`, kind, refId: id, title, amountTL,
      when: [isoToTR(x.eventDate), typeof x.eventTime === "string" ? x.eventTime : ""].filter(Boolean).join(" · "),
      paymentStatus: x.paymentStatus ?? null, paymentId: x.paymentId ?? null, eventId: x.eventId ?? null,
    });
  };
  if (role === "venue") {
    const s = await getDocs(query(collection(db, "invitations"), where("venueId", "==", uid), where("status", "==", "accepted")));
    s.docs.forEach((d) => { const x = d.data(); add("artist_booking", d.id, x, Number(x.fee) || 0, U.bookingTitle(x)); });
  }
  if (role === "organizer") {
    const [inv, vr] = await Promise.all([
      getDocs(query(collection(db, "invitations"), where("organizerUid", "==", uid), where("status", "==", "accepted"))).catch(() => null),
      getDocs(query(collection(db, "venueRequests"), where("createdByUid", "==", uid))).catch(() => null),
    ]);
    inv?.docs.forEach((d) => { const x = d.data(); add("artist_booking", d.id, x, Number(x.fee) || 0, `Sahne ücreti · ${x.artistName || "Sanatçı"}`); });
    vr?.docs.forEach((d) => { const x = d.data(); if (x.status !== "accepted") return; add("venue_rental", d.id, x, Number(x.rentalFee) || 0, U.rentalTitle(x, true)); });
  }
  return out;
}
/** Mekan (alıcı): kabul edilmiş, ödenmemiş, ücretli kiralama istekleri (hizmet kapsamı girilip düzenlenebilsin) */
export async function loadVenueRentals(uid) {
  const s = await getDocs(query(collection(db, "venueRequests"), where("venueId", "==", uid)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.status === "accepted" && U.dueEligible(x, Number(x.rentalFee) || 0))
    .map((x) => ({ key: "vr_" + x.id, refId: x.id, kind: "venue_rental", amountTL: Number(x.rentalFee) || 0, paymentStatus: x.paymentStatus ?? null,
      paymentId: x.paymentId ?? null, title: `${x.title || "Etkinlik"} · ${x.organizerName || "Organizatör"}`,
      when: [isoToTR(x.eventDate), typeof x.eventTime === "string" ? x.eventTime : ""].filter(Boolean).join(" · ") }));
}

// ══════════════════════════════════════════════════════════════════════
// KÜÇÜK PARÇALAR
// ══════════════════════════════════════════════════════════════════════
/** Uygulama Alert karşılığı (tek düğmeli onay penceresi) */
export function alertModal(title, text, { label = "Tamam" } = {}) {
  return new Promise((resolve) => {
    dkModal({ title, sub: text, variant: "confirm", size: 440, actions: [{ label, variant: "primary" }], onClose: () => resolve() });
  });
}
/** Durum rozeti (uygulama PayBadge: nokta + mono büyük harf, r4) */
export function payBadge(status, side, override) {
  const l = override || U.statusLabel(status, side);
  return dkStatusBadge({ label: l.text, color: U.TONE_COLOR[l.tone] || U.TONE_COLOR.muted }, { variant: "box" });
}
const row = (label, value, { strong, color } = {}) => h("div", { class: cx("dk-pay-row", strong && "is-strong") },
  h("span", { class: "dk-pay-rl" }, label), h("span", { class: "dk-pay-rv", style: color ? { color } : null }, value));
const note = (text, color = "#8A8E97", icon = "info") => h("div", { class: "dk-pay-note", style: { color } }, ic(icon, 13, color, "2"), h("span", {}, text));
const sub = (text) => h("span", { class: "dk-pay-sub" }, text);
const textP = (text) => h("p", { class: "dk-pay-text" }, text);

/** Hizmet kapsamı — salt okunur (ödeme kartı, emanet notu, şikayet, admin) */
export function serviceTermsView(t) {
  const line = (l, v) => h("div", { class: "dk-pay-tline" }, h("span", { class: "dk-pay-tl" }, l), h("span", { class: "dk-pay-tv" }, v));
  const block = (l, kids) => h("div", { class: "dk-pay-tblock" }, h("span", { class: "dk-pay-tl" }, l), ...kids);
  const svcs = t.services?.length
    ? t.services.map((s) => h("span", { class: "dk-pay-svc" }, ic("check", 13, "#7CE0B0", "2.4"),
      h("span", {}, s.label || U.serviceLabel(s.key), s.note ? h("span", { class: "dk-pay-muted" }, ` · ${s.note}`) : null)))
    : [h("span", { class: "dk-pay-muted" }, "Hizmet seçilmedi (yalnız mekan kullanımı).")];
  return h("div", { class: "dk-pay-terms" },
    line("KULLANIM SAATİ", `${t.startTime || "—"} – ${t.endTime || "—"}`),
    line("KAPASİTE", t.capacity ? `${Number(t.capacity).toLocaleString("tr-TR")} kişi` : "—"),
    block("DAHİL HİZMETLER", svcs),
    block("DAHİL OLMAYANLAR · EK ÜCRETLER", [h("span", { class: t.excluded ? "dk-pay-body" : "dk-pay-muted" }, t.excluded || "Belirtilmedi.")]),
    block("KURALLAR", [h("span", { class: t.rules ? "dk-pay-body" : "dk-pay-muted" }, t.rules || "Belirtilmedi.")]),
    line("KİRALAMA BEDELİ", U.fmtKurus(Math.round((t.rentalFee || 0) * 100))));
}

// ══════════════════════════════════════════════════════════════════════
// ÖDEME KARTI (ÖDEYEN: mekan / organizatör)
// ══════════════════════════════════════════════════════════════════════
// Durum payments/{paymentId}'den (teklif/istekteki paymentStatus yalnız ilk gösterim). Teklif/istek dokümanı da dinlenir:
// ödeme sonrası sunucunun yazdığı paymentId gelince ödeme kaydına geçilir; kiralamada hizmet kapsamı + onay buradan.
export function paymentCard({ kind, refId, amountTL, paymentStatus = null, paymentId = null, title = "", onPaid, onOpenDispute, compact = false } = {}) {
  const node = h("div", { class: cx("dk-pay-card", compact && "is-compact") });
  const isRental = kind === "venue_rental";
  const st = { p: null, oid: null, pstat: paymentStatus, vr: isRental ? undefined : null, agree: false, busy: false };
  const unsubs = [];
  let unPay = null;
  let alive = true;
  const subPay = (oid) => {
    if (!oid || oid === st.oid) return;
    unPay?.(); st.oid = oid;
    try { unPay = listenPayment(oid, (p) => { st.p = p; draw(); }, () => { /* çalışan: başkasının başlattığı ödemeyi okuyamaz → paymentStatus yedeği */ }); } catch (_) { unPay = null; }
  };
  if (!(Number(amountTL) > 0)) return { node, destroy() {} };
  if (paymentId) subPay(paymentId);
  if (refId && !isDemoUser()) {
    try {
      unsubs.push(onSnapshot(doc(db, isRental ? "venueRequests" : "invitations", refId), (d) => {
        const x = d.data() || {};
        if (x.paymentStatus != null) st.pstat = x.paymentStatus;
        if (typeof x.paymentId === "string" && x.paymentId) subPay(x.paymentId);
        if (isRental) st.vr = { terms: U.toServiceTerms(x.serviceTerms), confirmed: !!x.serviceTermsConfirmedAt, status: String(x.status ?? ""), eventId: typeof x.eventId === "string" && x.eventId ? x.eventId : null };
        draw();
      }, () => { if (isRental) { st.vr = null; draw(); } }));
    } catch (_) { if (isRental) st.vr = null; }
  }

  const termsReady = () => !isRental || (!!st.vr?.terms && (st.vr.confirmed || st.agree));
  let payBtn = null, payerTaxB = null;
  async function pay() {
    if (st.busy) return;
    if (isDemoUser()) { alertModal("Demo Mod", "Demo hesapta ödeme yapılamaz."); return; }
    if (!termsReady()) return;
    st.busy = true; payBtn?.dk.setBusy(true);
    try {
      if (isRental && st.vr?.terms && !st.vr.confirmed) await payApi.confirmServiceTerms({ requestId: refId, version: st.vr.terms.version });
      const r = await payApi.createPayment(kind, refId);
      subPay(r.merchantOid);
      openPaytrCheckout({ iframeUrl: r.iframeUrl, merchantOid: r.merchantOid, amountKurus: r.amountKurus, title, testMode: r.testMode === true, onPaid: () => onPaid?.(r.merchantOid) });
    } catch (e) {
      alertModal("Ödeme başlatılamadı", U.paymentErrorText(e));
    } finally {
      st.busy = false;
      if (payBtn?.isConnected) { payBtn.dk.setBusy(false); payBtn.disabled = !termsReady(); }
    }
  }
  // Ödeme öncesi iptal (kapsam uygun değilse): istek iptal; kabulde oluşan etkinlik de iptal edilir.
  async function cancelRequest() {
    const eventId = st.vr?.eventId ?? null;
    const ok = await dkConfirm({ title: "İsteği iptal et", body: "Mekan isteği ve yayındaki etkinlik iptal edilir. Henüz ödeme yapmadığın için iade gerekmez.", confirmLabel: "İptal et", cancelLabel: "Vazgeç", danger: true });
    if (!ok) return;
    try { await updateDoc(doc(db, "venueRequests", refId), { status: "cancelled", updatedAt: serverTimestamp() }); }
    catch (_) { alertModal("İptal edilemedi", "Bağlantını kontrol edip tekrar dene."); return; }
    if (!eventId) { dkToast("İstek iptal edildi"); return; }
    try { await updateDoc(doc(db, "events", eventId), { status: "cancelled", cancelledAt: serverTimestamp() }); dkToast("İstek iptal edildi"); }
    catch (_) { alertModal("İstek iptal edildi", "Etkinlik hâlâ yayındaysa mekandan ya da organizasyon sahibinden kaldırmasını iste."); }
  }

  function draw() {
    if (!alive) return;
    const p = st.p;
    const paid = p ? U.isPaidStatus(p.status) : st.pstat === "paid";
    const refunded = st.pstat === "refunded" || p?.status === "refunded";
    const label = p ? U.statusLabel(p.status, "payer") : paid ? U.statusLabel("held", "payer") : refunded ? U.statusLabel("refunded", "payer") : U.statusLabel("pending", "payer");
    const amountKurus = p?.grossKurus || Math.round((Number(amountTL) || 0) * 100);
    const kids = [h("div", { class: "dk-pay-head" }, ic("wallet", 16, paid ? "#7CE0B0" : "#FFB347", "1.9"), h("span", { class: "dk-pay-title" }, "Ödeme"), payBadge(null, null, label))];
    if (!paid && !refunded) {
      kids.push(textP("Ödeme PayTR güvencesiyle alınır ve etkinlik sonrasına kadar emanette tutulur. İade yalnız iptal kuralları ya da kanıtlı şikayetle mümkündür."));
      if (isRental) {
        const tb = h("div", { class: "dk-pay-tbox" }, sub("HİZMET KAPSAMI"));
        if (st.vr === undefined) tb.append(dkSkeleton({ w: "100%", h: 90, r: 6 }));
        else if (st.vr === null) tb.append(textP("Hizmet kapsamı yüklenemedi. Bağlantını kontrol et."));
        else if (!st.vr.terms) tb.append(textP("Mekan hizmet kapsamını henüz girmedi. Kapsam girilip onaylanmadan ödeme yapılamaz."));
        else {
          const cb = dkCheckbox({
            label: st.vr.confirmed ? "Hizmet kapsamını onayladın." : "Mekanla hizmet kapsamını konuştum ve onaylıyorum",
            checked: st.vr.confirmed || st.agree, disabled: st.vr.confirmed || st.busy, cls: "dk-pay-agree",
            onChange: (v) => { st.agree = v; if (payBtn) payBtn.disabled = !termsReady() || st.busy; },
          });
          tb.append(serviceTermsView(st.vr.terms),
            dkInlineMessage("info", "Ödemeden önce mekanla yüz yüze ya da telefonla görüşmeni öneririz; ödeme sonrası iade yalnız kanıtlı şikayetle mümkündür."), cb);
        }
        kids.push(tb);
      }
      // varsayılan: ödeyen yalnız brütü öder (komisyon + KDV alıcının payından düşer). Admin "komisyonu ödeyen karşılar"
      // seçtiyse komisyon + KDV brütün üstüne eklenir (tahmin; kesin tutarı createPayment döndürür).
      const est = U.previewSplit(amountKurus / 100, kind, { includeTaxes: false });
      const payerBears = est.commissionBorneBy === "payer";
      const charge = amountKurus + (payerBears ? est.platformTakeKurus : 0);
      kids.push(h("div", { class: "dk-pay-break" },
        row(isRental ? "Mekan ücreti" : "Sahne ücreti", U.fmtKurus(amountKurus)),
        payerBears ? row(`GigBridge ${U.commissionText(kind)}`, `+${U.fmtKurus(est.platformTakeKurus)}`) : null,
        row(payerBears ? "Ödenecek tutar (tahmini)" : "Ödenecek tutar", U.fmtKurus(charge), { strong: true }),
        h("span", { class: "dk-pay-fine" }, payerBears
          ? "Komisyon ve KDV'si ücretin üstüne eklenir. Varsa vergi kesintisi (stopaj) alıcının payından düşülür; senin yasal stopaj sorumluluğun ödeme sonrası finans incelemesinde netleşir."
          : "GigBridge komisyonu (+ KDV) ve varsa vergi kesintisi alıcının payından düşülür; sana ek ücret yansımaz.")));
      payBtn = dkButton(`${isRental ? "Mekan ücretini öde" : "Ödeme yap"} · ${U.fmtKurus(charge)}`, {
        variant: "success", size: 44, icon: "lock", full: true, disabled: !termsReady() || st.busy, busy: st.busy, busyLabel: "Ödeme başlatılıyor…",
        ariaLabel: `Ödeme yap ${U.fmtKurus(charge)}`, onClick: pay,
      });
      kids.push(payBtn);
      if (isRental && st.vr?.status === "accepted") {
        kids.push(dkButton("İsteği iptal et", { variant: "ghost-muted", size: 36, icon: "xCircle", cls: "dk-pay-linkbtn", onClick: cancelRequest, disabled: st.busy }));
      }
    } else {
      payBtn = null;
      kids.push(h("div", { class: "dk-pay-break" },
        row("Ödenen", U.fmtKurus(p?.fv === 2 ? p.chargeKurus : amountKurus), { strong: true }),
        p?.refundedKurus ? row("İade edilen", U.fmtKurus(p.refundedKurus)) : null,
        p?.payerRefundDueKurus > 0 ? row("Sana iade edilecek vergi farkı", U.fmtKurus(p.payerRefundDueKurus), { color: "#7CE0B0" }) : null));
      kids.push(textP(p?.status === "transferred" ? "Etkinlik tamamlandı, ödeme alıcıya aktarıldı."
        : p?.status === "refunded" || (!p && refunded) ? "Ödemenin tamamı iade edildi."
        : U.disputeOpen(p) ? "Şikayetin inceleniyor. Karar verilene kadar ödeme emanette bekler."
        : "Para emanette. Etkinlikten 24 saat sonra, sorun bildirilmezse alıcıya aktarılır."));
      // ödeyenin vergi profili eksikse (mekan / organizatör) finansal inceleme gerekebilir
      if (p && (p.financeReasons || []).some((r) => r === "payer_tax_missing" || r === "payer_tax_unverified")) {
        if (!payerTaxB) { payerTaxB = taxBanner(); unsubs.push(() => payerTaxB.destroy()); }
        kids.push(payerTaxB.node);
      }
      if (p) { const a = paymentActions(p, "payer", { onOpenDispute }); if (a) kids.push(a); }
    }
    // odak korunur: yeniden çizimde odaktaki öğe gidiyorsa kartın kendisine
    const hadFocus = node.contains(document.activeElement);
    node.replaceChildren(...kids);
    if (hadFocus && !node.contains(document.activeElement)) { node.setAttribute("tabindex", "-1"); try { node.focus({ preventScroll: true }); } catch (_) {} }
  }
  draw();
  return { node, destroy() { alive = false; unPay?.(); unsubs.forEach((f) => { try { f(); } catch (_) {} }); } };
}

// ══════════════════════════════════════════════════════════════════════
// EMANET NOTU (ALICI: sanatçı / mekan)
// ══════════════════════════════════════════════════════════════════════
export function escrowNote({ kind, refId = null, amountTL, paymentStatus = null, paymentId = null, accepted = true, ibanHref = null, onOpenDispute } = {}) {
  const node = h("div", { class: "dk-pay-card" });
  if (!accepted || !(Number(amountTL) > 0)) return { node, destroy() {} };
  const isRental = kind === "venue_rental" && !!refId;
  const st = { p: null, oid: null, pstat: paymentStatus, vr: isRental ? undefined : null, hasIban: null };
  const unsubs = [];
  let unPay = null, alive = true;
  const subPay = (oid) => {
    if (!oid || oid === st.oid) return;
    unPay?.(); st.oid = oid;
    try { unPay = listenPayment(oid, (p) => { st.p = p; draw(); }, () => {}); } catch (_) { unPay = null; }
  };
  if (paymentId) subPay(paymentId);
  if (refId && !isDemoUser()) {
    try {
      unsubs.push(onSnapshot(doc(db, kind === "venue_rental" ? "venueRequests" : "invitations", refId), (d) => {
        const x = d.data() || {};
        if (x.paymentStatus != null) st.pstat = x.paymentStatus;
        if (typeof x.paymentId === "string" && x.paymentId) subPay(x.paymentId);
        if (isRental) st.vr = { terms: U.toServiceTerms(x.serviceTerms), confirmed: !!x.serviceTermsConfirmedAt };
        draw();
      }, () => { if (isRental) { st.vr = null; draw(); } }));
    } catch (_) { st.vr = null; }
  }
  const loadIban = () => { if (!isDemoUser() && myUid()) payoutAccountCached().then((a) => { if (!alive) return; st.hasIban = !!a?.exists; draw(); }).catch(() => {}); };
  loadIban();
  // IBAN kaydedilince (Ödeme Bilgileri kartı) uyarı satırı güncellensin
  window.addEventListener("gb:payout-account", loadIban);
  unsubs.push(() => window.removeEventListener("gb:payout-account", loadIban));

  const onRates = () => draw();
  window.addEventListener("gb:pay-rates", onRates);
  unsubs.push(() => window.removeEventListener("gb:pay-rates", onRates));
  const taxB = isDemoUser() ? null : taxBanner();
  if (taxB) unsubs.push(() => taxB.destroy());

  // Döküm: ödeme kaydı yoksa TAHMİN (Finans v2 formülü), fv:2 kaydında komisyon + KDV + her kesinti, eski kayıtta eski satırlar.
  function breakdown(p) {
    const fmtL = (l) => (l.sign < 0 ? `−${U.fmtKurus(l.kurus)}` : U.fmtKurus(l.kurus));
    if (p) {
      const lines = U.payeeBreakdown(p);
      return h("div", { class: "dk-pay-break" }, ...lines.map((l) => (l.strong
        ? row("Size kalan", U.fmtKurus(l.kurus), { strong: true, color: "#7CE0B0" })
        : row(l.label, fmtL(l)))),
      p.fv === 2 && !p.withholdings.length && p.status === "finance_review" ? h("span", { class: "dk-pay-fine" }, "Vergi kesintisi finansal inceleme sonunda kesinleşir.") : null);
    }
    const est = U.previewSplit(amountTL, kind);
    const payeeBears = est.commissionBorneBy === "payee";
    return h("div", { class: "dk-pay-break" },
      row("Ücret", U.fmtKurus(est.grossKurus)),
      payeeBears ? row(`Komisyon (%${Math.round(est.commissionRate * 1000) / 10})`, `−${U.fmtKurus(est.commissionKurus)}`) : null,
      payeeBears ? row(`KDV (%${Math.round(est.commissionVatRate * 1000) / 10})`, `−${U.fmtKurus(est.commissionVatKurus)}`) : null,
      row(`Tahmini stopaj (%${Math.round(est.estimateStopajRate * 1000) / 10})`, `−${U.fmtKurus(est.stopajKurus)}`),
      est.paytrFeeKurus > 0 ? row("PayTR ödeme masrafı", `−${U.fmtKurus(est.paytrFeeKurus)}`) : null,
      row("Sana kalacak (tahmini)", `≈ ${U.fmtApproxKurus(est.payeeKurus)}`, { strong: true, color: "#7CE0B0" }),
      h("span", { class: "dk-pay-fine" }, U.ESTIMATE_NOTE));
  }

  function draw() {
    if (!alive) return;
    const p = st.p;
    const paid = p ? U.isPaidStatus(p.status) : st.pstat === "paid";
    const label = p ? U.statusLabel(p.status, "payee") : paid ? U.statusLabel("held", "payee") : { text: "ÖDEME BEKLENİYOR", tone: "warn" };
    const kids = [
      h("div", { class: "dk-pay-head" }, ic(paid ? "shieldCheck" : "clock", 16, paid ? "#7CE0B0" : "#FFB347", "1.9"), h("span", { class: "dk-pay-title" }, paid ? "Ödeme güvencede" : "Ödeme"), payBadge(null, null, label)),
      textP(p?.status === "transferred" ? "Ödemen hesabına aktarıldı."
        : p?.status === "finance_review" ? "Ödeme güvencede. Vergi durumu netleşene kadar finansal incelemede bekler; inceleme bitince hesabına aktarılır."
        : paid ? "Ödeme güvencede (emanette), etkinlikten sonra hesabına aktarılır."
        : kind === "venue_rental" ? "Organizatör ödemeyi yaptığında burada göreceksin. Para etkinlik sonrasına kadar emanette tutulur."
        : "Ödeyen taraf ödemeyi yaptığında burada göreceksin. Para etkinlik sonrasına kadar emanette tutulur."),
      breakdown(p),
    ];
    if (p?.payoutParts?.length) {
      kids.push(h("div", { class: "dk-pay-break" }, sub("HAK EDİŞ PAYLARI"),
        ...p.payoutParts.map((x) => row(`${x.name || "Üye"} · %${x.percent}`, U.fmtKurus(x.amountKurus)))));
    }
    if (isRental && st.vr && !paid) {
      const tb = h("div", { class: "dk-pay-tbox" }, sub(st.vr.confirmed ? "HİZMET KAPSAMI · ORGANİZATÖR ONAYLADI" : "HİZMET KAPSAMI"));
      tb.append(st.vr.terms ? serviceTermsView(st.vr.terms) : textP("Organizatör, kapsamı okuyup onaylamadan ödeme yapamaz. Kullanım saatini, kapasiteyi ve dahil hizmetleri gir."));
      if (!st.vr.confirmed) tb.append(dkButton(st.vr.terms ? "Kapsamı düzenle" : "Hizmet kapsamını gir", { variant: "outline", size: 36, icon: st.vr.terms ? "edit" : "plus", cls: "dk-pay-amberbtn", onClick: () => openServiceTermsModal(refId) }));
      kids.push(tb);
    }
    if (p && paid) { const a = paymentActions(p, "payee", { onOpenDispute }); if (a) kids.push(a); }
    if (p && paid && p.fv === 2 && p.status !== "refunded") kids.push(paymentDocBlock(p));
    if (taxB) kids.push(taxB.node);
    if (st.hasIban === false) {
      kids.push(h(ibanHref ? "a" : "div", { href: ibanHref, class: "dk-pay-ibanwarn" }, ic("alertCircle", 14, "#FFB347", "2"), h("span", {}, "Ödemeyi alabilmen için IBAN ekle"), ibanHref ? ic("chevronRight", 14, "#FFB347", "2") : null));
    }
    node.replaceChildren(...kids);
  }
  draw();
  return { node, destroy() { alive = false; unPay?.(); unsubs.forEach((f) => { try { f(); } catch (_) {} }); } };
}

// ══════════════════════════════════════════════════════════════════════
// ÖDEME SONRASI EYLEMLER — etkinlik öncesi iptal (talep / yanıt / alıcı iptali) + kanıtlı şikayet
// ══════════════════════════════════════════════════════════════════════
export function paymentActions(p, side, { onOpenDispute } = {}) {
  const { beforeStart, inWindow, held } = U.paymentWindow(p);
  const c = p.cancellation;
  const items = [];
  const btns = [];
  const openDispute = () => (onOpenDispute ? onOpenDispute(p.id) : openDisputeDrawer(p.id));
  const btn = (label, variant, icon, fn) => {
    const b = dkButton(label, { variant, size: 36, icon, onClick: fn });
    btns.push(b);
  };
  const run = async (fn, okTitle, okText) => {
    btns.forEach((b) => { b.disabled = true; });
    try { await fn(); alertModal(okTitle, okText); }
    catch (e) { alertModal("İşlem yapılamadı", U.paymentErrorText(e)); }
    finally { btns.forEach((b) => { if (b.isConnected) b.disabled = false; }); }
  };
  const ask = async (title, body, label, danger, fn) => { if (await dkConfirm({ title, body, confirmLabel: label, cancelLabel: "Vazgeç", danger })) fn(); };

  if (side === "payer") {
    if (c?.status === "requested") items.push(note(beforeStart ? "İptal talebin karşı tarafın yanıtını bekliyor." : "İptal talebin etkinlik başlamadan yanıtlanmadı; iade yapılmaz.", "#FFB347"));
    if (c?.status === "rejected") items.push(note("İptal talebin reddedildi. Etkinlikte sorun olursa kanıtlı şikayet açabilirsin.", "#FFB347"));
    if (c?.status === "accepted") items.push(note("İptal talebin kabul edildi; ödemenin tamamı iade edildi.", "#7CE0B0"));
    if (c?.status === "payee_cancelled") items.push(note("Rezervasyon karşı tarafça iptal edildi; ödemenin tamamı iade edildi.", "#7CE0B0"));
    if (held && beforeStart && !c && !p.dispute) {
      btn("İptal talebi", "outline", "xCircle", () => ask("İptal talebi",
        "Karşı taraf etkinlikten önce kabul ederse ödemenin tamamı iade edilir. Reddederse iade yapılmaz; etkinlikte sorun olursa kanıtlı şikayet açabilirsin.",
        "Talep gönder", false, () => run(() => payApi.requestCancellation({ merchantOid: p.id }), "Talep gönderildi", "Karşı taraf yanıtladığında bildirim alacaksın.")));
    }
    if (p.dispute) btn("Şikayeti gör", "outline", "flag", openDispute);
    else if (held && inWindow) btn("Sorun bildir", "danger-outline", "flag", openDispute);
  } else {
    if (c?.status === "requested" && beforeStart && held) {
      items.push(note(`Ödeyen iptal talep etti${c.reason ? `: ${c.reason}` : ""}. Kabul edersen ödemenin tamamı iade edilir.`, "#FFB347"));
      btn("Kabul et", "success", "check", () => ask("İptali kabul et", "Ödemenin tamamı ödeyene iade edilir.", "Kabul et", false,
        () => run(() => payApi.respondCancellation({ merchantOid: p.id, accept: true }), "İptal kabul edildi", "Ödemenin tamamı ödeyene iade ediliyor.")));
      btn("Reddet", "danger-outline", "x", () => ask("İptali reddet", "İade yapılmaz; rezervasyon geçerli kalır.", "Reddet", true,
        () => run(() => payApi.respondCancellation({ merchantOid: p.id, accept: false }), "İptal reddedildi", "Rezervasyon geçerli.")));
    } else if (held && beforeStart && !p.dispute && c?.status !== "accepted") {
      btn("Rezervasyonu iptal et", "outline", "xCircle", () => ask("Rezervasyonu iptal et",
        "Ödemenin tamamı ödeyene iade edilir ve bu iptal hesabının kayıtlarına işlenir. Bu işlem geri alınamaz.", "İptal et", true,
        () => run(() => payApi.payeeCancel({ merchantOid: p.id }), "Rezervasyon iptal edildi", "Ödemenin tamamı ödeyene iade ediliyor.")));
    }
    if (p.dispute) {
      const open = U.disputeOpen(p);
      items.push(note(open ? "Bu ödeme için şikayet açıldı. Aktarım karar verilene kadar bekler." : "Bu ödemeye ait şikayet sonuçlandı.", open ? "#FFB347" : "#8A8E97"));
      btn(open ? "Şikayeti gör ve yanıtla" : "Şikayeti gör", "outline", "flag", openDispute);
    }
  }
  // Gider pusulası (mekan adına hazırlanır; mekan ve sanatçı indirir — 15 dk'lık imzalı bağlantı)
  if (p.giderPusulasi?.no) {
    btn(`Gider pusulası · ${p.giderPusulasi.no}`, "outline", "fileText", async () => {
      const w = window.open("about:blank", "_blank");
      try { const r = await payApi.getGiderPusulasi({ merchantOid: p.id }); if (w) w.location.href = r.url; else location.href = r.url; }
      catch (e) { if (w) w.close(); alertModal("Belge açılamadı", U.paymentErrorText(e)); }
    });
  }
  if (!items.length && !btns.length) return null;
  return h("div", { class: "dk-pay-acts" }, ...items, btns.length ? h("div", { class: "dk-pay-btns" }, ...btns) : null);
}

// ══════════════════════════════════════════════════════════════════════
// PAYTR iFRAME — dkModal içinde. Kesin sonuç payments/{oid} kaydından (sunucu bildirimi = tek doğru kaynak);
// odeme-sonuc.html (merchant_ok/fail_url) web penceresinde çerçevedeyse postMessage ile haber verir (üst pencereyi taşımaz).
// ══════════════════════════════════════════════════════════════════════
let _resizer = null;
function loadPaytrResizer() {
  if (window.iFrameResize) return Promise.resolve(true);
  if (_resizer) return _resizer;
  _resizer = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://www.paytr.com/js/iframeResizer.min.js";
    s.async = true;
    s.onload = () => resolve(typeof window.iFrameResize === "function");
    s.onerror = () => { _resizer = null; resolve(false); };
    document.head.append(s);
  });
  return _resizer;
}
const PHASE = {
  confirming: { t: "Ödemen onaylanıyor…", b: () => "Bankandan onay bekleniyor. Bu ekranı kapatma.", btn: null },
  slow: { t: "Onay biraz gecikiyor", b: () => "Ödemen onaylandığında bildirim alacaksın. Ekranı kapatabilirsin.", btn: "Tamam" },
  success: { t: "Ödeme alındı", b: (amt) => `${amt} güvencede. Para etkinlik sonrasına kadar emanette tutulur, sonra alıcıya aktarılır.`, btn: "Tamam" },
  failed: { t: "Ödeme tamamlanamadı", b: () => "Kartından para çekilmedi. Bilgileri kontrol edip tekrar deneyebilirsin.", btn: "Kapat" },
};
export function openPaytrCheckout({ iframeUrl, merchantOid, amountKurus, title, testMode = false, onPaid, onClose } = {}) {
  let phase = "paying", paidFired = false, slowT = null, lastStatus = null, closed = false;
  const amt = U.fmtKurus(amountKurus);
  const testEl = h("span", { class: "dk-pay-ck-test" }, ic("alertTriangle", 13, "#FFB347", "2"), "TEST MODU · gerçek para çekilmez");
  const frame = h("iframe", { id: "paytriframe", class: "dk-pay-ck-frame", title: "PayTR güvenli ödeme formu", frameborder: "0", scrolling: "auto", allow: "payment" });
  const frameBox = h("div", { class: "dk-pay-ck-box" }, frame);
  const stateBox = h("div", { class: "dk-pay-ck-state", role: "status", "aria-live": "polite", hidden: true });
  const head = h("div", { class: "dk-pay-ck-top" },
    h("span", { class: "dk-pay-ck-kick" }, "GÜVENLİ ÖDEME · PAYTR"), h("span", { class: "dk-pay-ck-amt" }, amt), testMode ? testEl : null);
  window.__gbPaytrCheckout = merchantOid || true;   // odeme-sonuc.html bunu görürse üst pencereyi taşımaz, postMessage atar
  const m = dkModal({ title: title || "Ödeme", variant: "panel", size: 680, top: 40, body: h("div", { class: "dk-pay-ck" }, head, frameBox, stateBox),
    closeOnBackdrop: false, cls: "dk-pay-ck-mdl", onClose: () => cleanup() });
  const xBtn = m.dialog.querySelector(".dk-mdl-x");

  function render() {
    const P = PHASE[phase];
    frameBox.hidden = phase !== "paying";
    testEl.hidden = phase !== "paying";
    if (xBtn) xBtn.hidden = phase === "confirming";
    if (!P) { stateBox.hidden = true; return; }
    const iconEl = phase === "confirming"
      ? svgRaw('<path d="M21 12a9 9 0 1 1-9-9"></path>', { size: 30, sw: "2.4", color: "#4ED8FF", cls: "dk-spin" })
      : phase === "success" ? ic("checkCircle", 30, "#7CE0B0", "2") : phase === "failed" ? ic("xCircle", 30, "#FF5A6E", "2") : ic("clock", 30, "#FFB347", "2");
    stateBox.replaceChildren(
      h("span", { class: cx("dk-pay-ck-ic", `is-${phase}`) }, iconEl),
      h("span", { class: "dk-pay-ck-st" }, P.t),
      h("span", { class: "dk-pay-ck-sb" }, P.b(amt)),
      ...(P.btn ? [dkButton(P.btn, { variant: phase === "success" ? "success" : "outline", size: 44, onClick: () => m.close("done") })] : []));
    stateBox.hidden = false;
    if (P.btn) requestAnimationFrame(() => { try { stateBox.querySelector("button")?.focus({ preventScroll: true }); } catch (_) {} });
  }
  function setPhase(next) {
    if (closed || next === phase) return;
    phase = next;
    clearTimeout(slowT);
    if (phase === "confirming") slowT = setTimeout(() => { if (phase === "confirming") setPhase("slow"); }, 45000);
    if (phase === "success" && !paidFired) { paidFired = true; try { onPaid?.(); } catch (e) { console.error(e); } }
    render();
  }
  const onResult = (durum) => setPhase(U.checkoutPhase(phase, { status: lastStatus, durum: durum === "fail" ? "fail" : durum === "ok" ? "ok" : "" }));
  let unsub = null;
  if (merchantOid) {
    try {
      unsub = listenPayment(merchantOid, (p) => {
        lastStatus = p?.status || null;
        if (lastStatus) setPhase(U.checkoutPhase(phase, { status: lastStatus }));
      }, () => {});
    } catch (_) { unsub = null; }
  }
  const onMsg = (e) => {
    const d = e.data;
    if (!d || typeof d !== "object" || d.gb !== U.PAYTR_MSG) return;
    if (!U.trustedResultOrigin(e.origin, location.origin)) return;
    onResult(String(d.durum || ""));
  };
  window.addEventListener("message", onMsg);
  // yedek: sonuç sayfası aynı kökenden açıldıysa iframe adresini oku (çapraz kökende erişim hata verir → yok sayılır)
  frame.addEventListener("load", () => {
    try {
      const loc = frame.contentWindow.location;
      if (loc && /\/odeme-sonuc\.html$/.test(loc.pathname)) onResult(new URLSearchParams(loc.search).get("durum") || "");
    } catch (_) {}
  });
  frame.src = iframeUrl;
  if (/^https:\/\/www\.paytr\.com\//.test(String(iframeUrl || ""))) {
    loadPaytrResizer().then((ok) => {
      if (!ok || closed) return;
      try { window.iFrameResize({}, frame); frame.setAttribute("scrolling", "no"); frame.classList.add("is-resized"); } catch (_) {}
    });
  }
  function cleanup() {
    if (closed) return; closed = true;
    clearTimeout(slowT);
    try { unsub?.(); } catch (_) {}
    window.removeEventListener("message", onMsg);
    if (window.__gbPaytrCheckout === (merchantOid || true)) { try { delete window.__gbPaytrCheckout; } catch (_) { window.__gbPaytrCheckout = undefined; } }
    if (phase === "confirming" || phase === "slow") dkToast("Ödemen onaylandığında bildirim alacaksın.", { type: "info" });
    try { onClose?.(phase); } catch (_) {}
  }
  render();
  return { close: () => m.close("api"), get phase() { return phase; }, modal: m };
}

/** Ödeme kartını pencerede aç (liste satırlarındaki "Öde" düğmeleri) */
export function openPayModal(item, { onPaid } = {}) {
  let card = null;
  const m = dkModal({ title: item.title || "Ödeme", sub: item.when || null, variant: "panel", size: 520, cls: "dk-pay-mdl",
    body: h("div", {}), onClose: () => card?.destroy() });
  card = paymentCard({ ...item, onPaid: (oid) => onPaid?.(oid), onOpenDispute: (oid) => { m.close("dispute"); openDisputeDrawer(oid); } });
  m.body.replaceChildren(card.node);
  return m;
}

/** Liste satırı denetimi (mevcut panellerdeki kabul edilmiş teklif / istek satırları):
 *  ödenmemiş → "Öde · ₺X" (ödeme kartı penceresi) · ödendi/iade → durum rozeti (tıklanınca aynı pencere: emanet, iptal, şikayet). */
export function payRowControl({ kind, refId, amountTL, paymentStatus = null, paymentId = null, title = "", when = "", onPaid } = {}) {
  if (!(Number(amountTL) > 0) || !refId) return null;
  const item = { kind, refId, amountTL, paymentStatus, paymentId, title, when };
  const badgeBtn = (st) => {
    const lbl = st === "refunded" ? U.statusLabel("refunded", "payer") : U.statusLabel("held", "payer");
    return h("button", { type: "button", class: "dk-pay-rowbadge dk-press", "aria-label": `${title}: ${lbl.text.toLocaleLowerCase("tr-TR")}, ödeme ayrıntısı`,
      onclick: (e) => { e.stopPropagation(); openPayModal(item); } }, payBadge(null, null, lbl));
  };
  if (paymentStatus === "paid" || paymentStatus === "refunded") return badgeBtn(paymentStatus);
  const amt = U.fmtKurus(Math.round(Number(amountTL) * 100));
  const b = dkButton(`Öde · ${amt}`, { variant: "success", size: 36, icon: "lock", cls: "dk-pay-rowbtn", ariaLabel: `${title} ödemesini yap (${amt})` });
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    openPayModal(item, { onPaid: () => { item.paymentStatus = "paid"; if (b.isConnected) b.replaceWith(badgeBtn("paid")); try { onPaid?.(); } catch (_) {} } });
  });
  return b;
}

// ══════════════════════════════════════════════════════════════════════
// HİZMET KAPSAMI FORMU (mekan) — setVenueServiceTerms; organizatör onayından sonra kilitli
// ══════════════════════════════════════════════════════════════════════
export function openServiceTermsModal(requestId, { onSaved } = {}) {
  return new Promise((resolve) => {
    let saved = false, req = null, locked = null, tried = false;
    const body = h("div", { class: "dk-pay-stf" }, dkSkeleton({ w: "100%", h: 160, r: 8 }));
    const m = dkModal({ title: "Hizmet kapsamı", variant: "form", size: 640, align: "top", top: 60, body, cls: "dk-pay-stmdl",
      actions: [{ label: "Vazgeç", variant: "outline" }, { label: "Kapsamı kaydet", variant: "role", keepOpen: true, busyLabel: "Kaydediliyor…", onClick: () => save() }],
      onClose: () => resolve(saved) });
    const saveBtn = m.buttons[1];
    if (saveBtn) saveBtn.disabled = true;
    // alanlar
    const startIn = dkInput({ type: "time", size: 44, attrs: { "aria-label": "Başlangıç" } });
    const endIn = dkInput({ type: "time", size: 44, attrs: { "aria-label": "Bitiş" } });
    const capIn = dkInput({ size: 44, inputmode: "numeric", maxlength: 6, placeholder: "Örn. 300", attrs: { "aria-label": "Kapasite" } });
    capIn.addEventListener("input", () => { capIn.value = capIn.value.replace(/[^0-9]/g, "").slice(0, 6); });
    const sel = new Map(); // key → not
    const svcBox = h("div", { class: "dk-pay-svcs" });
    const excl = dkTextarea({ rows: 3, maxlength: 1000, placeholder: "Örn. Ek güvenlik görevlisi ₺3.000, sahne dekoru organizatöre ait" });
    const rules = dkTextarea({ rows: 3, maxlength: 1000, placeholder: "Örn. Ses sınırı 95 dB, en geç 02:00 bitiş, dış yiyecek-içecek yok" });
    const timeErr = h("span", { class: "dk-pay-err", role: "alert" });
    const capErr = h("span", { class: "dk-pay-err", role: "alert" });
    const drawSvcs = () => svcBox.replaceChildren(...U.SERVICE_OPTIONS.map((o) => {
      const on = sel.has(o.key);
      const cb = dkCheckbox({ label: o.label, checked: on, onChange: (v) => { if (v) sel.set(o.key, sel.get(o.key) || ""); else sel.delete(o.key); drawSvcs(); requestAnimationFrame(() => svcBox.querySelector(`[data-name="${o.key}"]`)?.focus()); }, name: o.key });
      const noteIn = on ? dkInput({ size: 40, maxlength: 120, value: sel.get(o.key) || "", placeholder: "Kısa not (isteğe bağlı)", attrs: { "aria-label": `${o.label} notu` }, onInput: (v) => sel.set(o.key, v.slice(0, 120)) }) : null;
      return h("div", { class: cx("dk-pay-svcrow", on && "is-on") }, cb, noteIn);
    }));
    const fld = (label, ...kids) => h("div", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, label), ...kids);
    const validate = () => {
      // saat ve kapasite hataları ayrı ayrı (uygulama ServiceTermsScreen)
      const tMsg = U.validateTermsInput({ startTime: startIn.value, endTime: endIn.value, capacity: 1 });
      const cMsg = U.validateTermsInput({ startTime: "00:00", endTime: "01:00", capacity: Number(capIn.value) });
      timeErr.textContent = tried && tMsg ? tMsg : "";
      capErr.textContent = tried && cMsg ? cMsg : "";
      startIn.toggleAttribute("aria-invalid", !!(tried && tMsg)); endIn.toggleAttribute("aria-invalid", !!(tried && tMsg));
      capIn.toggleAttribute("aria-invalid", !!(tried && cMsg));
      return tMsg || cMsg;
    };
    [startIn, endIn, capIn].forEach((x) => x.addEventListener("input", () => { if (tried) validate(); m.setError(""); }));
    async function save() {
      tried = true;
      if (validate()) return false;
      try {
        await payApi.saveServiceTerms({
          requestId,
          terms: {
            startTime: startIn.value, endTime: endIn.value, capacity: parseInt(capIn.value, 10),
            services: U.SERVICE_OPTIONS.filter((o) => sel.has(o.key)).map((o) => ({ key: o.key, ...(String(sel.get(o.key) || "").trim() ? { note: String(sel.get(o.key)).trim() } : {}) })),
            excluded: excl.input.value.trim(), rules: rules.input.value.trim(),
          },
        });
        saved = true;
        m.close("saved");
        try { onSaved?.(); } catch (_) {}
        alertModal("Hizmet kapsamı kaydedildi", req?.status === "pending"
          ? "Şimdi isteği kabul edebilirsin. Organizatör ödemeden önce kapsamı okuyup onaylayacak."
          : "Organizatör ödemeden önce kapsamı okuyup onaylayacak.");
      } catch (e) {
        alertModal("Kaydedilemedi", U.paymentErrorText(e));
      }
      return false;
    }
    (async () => {
      try {
        const uid = myUid();
        const [r, v] = await Promise.all([getDoc(doc(db, "venueRequests", requestId)), uid ? getDoc(doc(db, "users", uid)).catch(() => null) : null]);
        req = r.data() || {};
        const t = U.toServiceTerms(req.serviceTerms);
        const lead = h("p", { class: "dk-pay-text" }, `${req.title ? `${req.title} · ` : ""}Organizatör ödemeden önce bu kapsamı okuyup onaylar. Şikayet olursa GigBridge bu kapsama göre karar verir; açık ve eksiksiz yaz.`);
        if (req.serviceTermsConfirmedAt && t) {
          locked = t;
          body.replaceChildren(lead, dkInlineMessage("ok", "Organizatör kapsamı onayladı; artık değiştirilemez.", { icon: "lock" }), serviceTermsView(t));
          if (saveBtn) saveBtn.hidden = true;
          return;
        }
        if (t) {
          startIn.value = t.startTime || ""; endIn.value = t.endTime || "";
          capIn.value = t.capacity ? String(t.capacity) : "";
          t.services.forEach((x) => sel.set(x.key, x.note || ""));
          excl.input.value = t.excluded; rules.input.value = t.rules;
          [excl.input, rules.input].forEach((x) => x.dispatchEvent(new Event("input")));
        } else {
          if (typeof req.eventTime === "string" && /^\d{1,2}:\d{2}$/.test(req.eventTime)) startIn.value = req.eventTime.padStart(5, "0");
          const cap = v?.data?.()?.capacity;
          if (Number(cap) > 0) capIn.value = String(Math.round(Number(cap)));
        }
        drawSvcs();
        const fee = Number(req.rentalFee) || 0;
        body.replaceChildren(lead,
          fld("KULLANIM SAATİ", h("div", { class: "dk-pay-two" }, h("label", { class: "dk-pay-sub2" }, "Başlangıç", startIn), h("span", { class: "dk-pay-dash", "aria-hidden": "true" }, "–"), h("label", { class: "dk-pay-sub2" }, "Bitiş", endIn)), timeErr),
          fld("KAPASİTE (KİŞİ)", capIn, capErr),
          fld("DAHİL HİZMETLER", svcBox),
          fld("DAHİL OLMAYANLAR · EK ÜCRETLER", excl),
          fld("KURALLAR", rules),
          fld("KİRALAMA BEDELİ", h("div", { class: "dk-pay-fee" }, h("span", { class: "dk-pay-feev" }, U.fmtKurus(Math.round(fee * 100))),
            h("span", { class: "dk-pay-muted" }, "Organizatörün isteğindeki bedel. Farklı bir bedel için organizatörle görüşüp isteği yeniden göndermesini iste."))));
        if (saveBtn) saveBtn.disabled = false;
      } catch (e) {
        body.replaceChildren(dkInlineMessage("err", "İstek yüklenemedi. Bağlantını kontrol et."));
      }
    })();
  });
}

// ══════════════════════════════════════════════════════════════════════
// KANITLAR — seçici (taslak → Storage) + galeri + görüntüleyici
// ══════════════════════════════════════════════════════════════════════
async function compressImage(file) {
  const fallback = () => (file.type?.startsWith("image/") && file.size < U.EVIDENCE_MAX_BYTES ? file : null);
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    URL.revokeObjectURL(url);
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const k = long > 1600 ? 1600 / long : 1;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.78));
    return blob && blob.size < U.EVIDENCE_MAX_BYTES ? blob : fallback();
  } catch (_) { return fallback(); }
}
/** Taslakları küçültüp yükler → sunucuya gidecek liste. Yüklenen taslak yolunu hatırlar (Storage üzerine yazmayı yasaklar). */
export async function uploadEvidence(oid, uid, drafts) {
  const ts = Date.now();
  const out = [];
  for (let i = 0; i < drafts.length; i += 1) {
    const d = drafts[i];
    if (!d.path) {
      const blob = await compressImage(d.file);
      if (!blob) throw new Error("Kanıt görseli geçersiz (en çok 8 MB, yalnız görsel).");
      const path = U.evidencePath(oid, uid, ts, i);
      await uploadBytes(storageRef(storage, path), blob, { contentType: blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg" });
      d.path = path;
    }
    out.push({ path: d.path, type: d.type, caption: String(d.caption || "").trim().slice(0, 140) });
  }
  return out;
}

/** Tam ekran görüntüleyici: items [{ url, label, caption }] */
export function openImageViewer(items, index = 0) {
  let i = Math.max(0, Math.min(index, items.length - 1));
  const img = h("div", { class: "dk-pay-vimg" });
  const cap = h("div", { class: "dk-pay-vcap" });
  const cnt = h("span", { class: "dk-pay-vcnt" });
  const prev = dkButton("", { variant: "outline", size: 40, icon: "chevronLeft", ariaLabel: "Önceki görsel", onClick: () => go(-1) });
  const next = dkButton("", { variant: "outline", size: 40, icon: "chevronRight", ariaLabel: "Sonraki görsel", onClick: () => go(1) });
  const draw = () => {
    const it = items[i] || {};
    img.replaceChildren(it.url ? h("img", { src: it.url, alt: it.label || "Kanıt görseli" }) : h("span", { class: "dk-pay-muted" }, "Görsel yüklenemedi"));
    cap.replaceChildren(...[it.label ? h("span", { class: "dk-pay-tl" }, String(it.label).toLocaleUpperCase("tr-TR")) : null, it.caption ? h("span", { class: "dk-pay-body" }, it.caption) : null].filter(Boolean));
    cnt.textContent = `${i + 1} / ${items.length}`;
    prev.disabled = i <= 0; next.disabled = i >= items.length - 1;
  };
  const go = (d) => { i = Math.max(0, Math.min(items.length - 1, i + d)); draw(); };
  const onKey = (e) => { if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); };
  const m = dkModal({ title: "Kanıt", variant: "panel", size: 880, top: 40, cls: "dk-pay-viewer",
    body: h("div", { class: "dk-pay-vbody" }, img, cap, items.length > 1 ? h("div", { class: "dk-pay-vnav" }, prev, cnt, next) : null),
    onClose: () => document.removeEventListener("keydown", onKey) });
  document.addEventListener("keydown", onKey);
  draw();
  return m;
}
/** Yüklenmiş kanıtlar (getPaymentDispute kısa ömürlü adresleri) */
export function evidenceGallery(items) {
  if (!items?.length) return h("span", { class: "dk-pay-muted" }, "Kanıt eklenmedi.");
  return h("div", { class: "dk-pay-gal" }, ...items.map((e, i) => h("button", { type: "button", class: "dk-pay-cell dk-press", "aria-label": `${U.evidenceTypeLabel(e.type)} ${i + 1}, büyüt`,
    onclick: () => openImageViewer(items.map((x) => ({ url: x.url, label: U.evidenceTypeLabel(x.type), caption: x.caption })), i) },
  e.url ? h("img", { src: e.url, alt: "", loading: "lazy" }) : h("span", { class: "dk-pay-cellx" }, ic("image", 18, "#5E636D")),
  h("span", { class: "dk-pay-ctag" }, U.evidenceTypeLabel(e.type).toLocaleUpperCase("tr-TR")))));
}
/** Kanıt seçici: { node, drafts, setDisabled(b) } — her görsele tür + kısa not */
export function evidencePicker({ onChange } = {}) {
  const drafts = [];
  let disabled = false;
  const list = h("div", { class: "dk-pay-picks" });
  const file = h("input", { type: "file", accept: "image/*", multiple: true, class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
  const addBtn = h("button", { type: "button", class: "dk-pay-add dk-press" });
  addBtn.addEventListener("click", () => { if (!disabled) file.click(); });
  file.addEventListener("change", () => {
    const fs = [...(file.files || [])].filter((f) => f.type?.startsWith("image/")).slice(0, U.EVIDENCE_MAX - drafts.length);
    file.value = "";
    fs.forEach((f) => drafts.push({ file: f, url: URL.createObjectURL(f), type: "photo", caption: "" }));
    draw(); onChange?.(drafts);
  });
  const draw = () => {
    list.replaceChildren(...drafts.map((d, i) => {
      const chips = h("div", { class: "dk-pay-chips", role: "radiogroup", "aria-label": `Kanıt ${i + 1} türü` }, ...U.EVIDENCE_TYPES.map((t) => {
        const c = dkChip({ label: t.label, pressed: d.type === t.key, size: 30, onClick: () => { if (disabled) return; d.type = t.key; draw(); onChange?.(drafts); } });
        c.setAttribute("role", "radio"); c.setAttribute("aria-checked", d.type === t.key ? "true" : "false"); c.removeAttribute("aria-pressed");
        return c;
      }));
      const cap = dkInput({ size: 40, maxlength: 140, value: d.caption, placeholder: "Kısa not (isteğe bağlı)", attrs: { "aria-label": `Kanıt ${i + 1} notu` }, disabled, onInput: (v) => { d.caption = v.slice(0, 140); } });
      const rm = h("button", { type: "button", class: "dk-pay-rm dk-press", "aria-label": `Kanıt ${i + 1} kaldır`, disabled }, ic("x", 16));
      rm.addEventListener("click", () => { if (disabled) return; URL.revokeObjectURL(d.url); drafts.splice(i, 1); draw(); onChange?.(drafts); });
      const th = h("button", { type: "button", class: "dk-pay-pthumb", "aria-label": `Kanıt ${i + 1}, büyüt`,
        onclick: () => openImageViewer(drafts.map((x) => ({ url: x.url, label: U.evidenceTypeLabel(x.type), caption: x.caption })), i) }, h("img", { src: d.url, alt: "" }));
      return h("div", { class: "dk-pay-pick" }, th, h("div", { class: "dk-pay-pbody" }, chips, cap), rm);
    }));
    addBtn.replaceChildren(ic("image", 16, "#F2F1EE", "1.9"), h("span", {}, drafts.length ? "Görsel ekle" : "Görsel seç"), h("span", { class: "dk-pay-addn" }, `${drafts.length}/${U.EVIDENCE_MAX}`));
    addBtn.hidden = drafts.length >= U.EVIDENCE_MAX;
    addBtn.disabled = disabled;
  };
  draw();
  return {
    node: h("div", { class: "dk-pay-picker" }, list, addBtn, file),
    drafts,
    setDisabled(b) { disabled = !!b; draw(); },
    clear() { drafts.splice(0).forEach((d) => URL.revokeObjectURL(d.url)); draw(); },
  };
}

// ══════════════════════════════════════════════════════════════════════
// ŞİKAYET ÇEKMECESİ (uygulama PaymentDisputeScreen): ödeyen açar (kategori + açıklama ≥30 + 1–10 kanıt → özet → gönder),
// karşı taraf 48 saat içinde yanıtlar; iki taraf ayrıntı + karar görür.
// ══════════════════════════════════════════════════════════════════════
export function openDisputeDrawer(oid, { onChanged, onClose } = {}) {
  const uid = myUid();
  const bodyEl = h("div", { class: "dk-pay-dsp" });
  let d = null, step = "form", category = null, sending = false;
  const desc = dkTextarea({ rows: 5, maxlength: 2000, placeholder: "Ne olduğunu saat ve ayrıntılarla anlat" });
  const descCnt = h("span", { class: "dk-pay-cnt", "aria-live": "polite" });
  const updCnt = () => {
    const n = desc.input.value.trim().length;
    descCnt.textContent = n >= U.DISPUTE_DESC_MIN ? `${n} karakter` : `En az ${U.DISPUTE_DESC_MIN} karakter · ${n}/${U.DISPUTE_DESC_MIN}`;
    descCnt.classList.toggle("is-warn", n > 0 && n < U.DISPUTE_DESC_MIN);
  };
  // dkTextarea'nın kendi sayacı (n/2000) yerine uygulamadaki "en az 30" sayacı
  desc.querySelector(".dk-ta-count")?.remove();
  desc.append(descCnt);
  const picker = evidencePicker({ onChange: () => syncForm() });
  const reply = dkTextarea({ rows: 4, maxlength: 2000, placeholder: "Kendi açıklamanı yaz" });
  const replyPicker = evidencePicker();
  let summaryBtn = null, replyBtn = null;
  const syncForm = () => {
    updCnt();
    if (summaryBtn) summaryBtn.disabled = !(category && desc.input.value.trim().length >= U.DISPUTE_DESC_MIN && picker.drafts.length >= 1);
    if (replyBtn) replyBtn.disabled = sending || reply.input.value.trim().length < 10;
  };
  desc.input.addEventListener("input", syncForm);
  reply.input.addEventListener("input", syncForm);

  const drw = dkDrawer({ eyebrow: "ÖDEME ŞİKAYETİ", title: "Sorun bildir", body: bodyEl, width: 640, cls: "dk-pay-drw",
    onClose: (r) => { picker.clear(); replyPicker.clear(); onClose?.(r); } });
  const section = (title, ...kids) => h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, title), h("div", { class: "dk-pay-box" }, ...kids));

  async function load() {
    bodyEl.replaceChildren(dkSkeleton({ w: "60%", h: 16 }), dkSkeleton({ w: "100%", h: 120, r: 8 }));
    if (!U.isOid(oid)) { showErr("Ödeme bulunamadı."); return; }
    try { d = await payApi.getPaymentDispute({ merchantOid: oid }); }
    catch (e) { showErr(U.paymentErrorText(e)); return; }
    draw();
  }
  function showErr(msg) {
    bodyEl.replaceChildren(h("div", { class: "dk-pay-errbox" }, dkInlineMessage("err", msg),
      dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: load })));
  }
  function draw() {
    const pay = d.payment, disp = d.dispute;
    drw.setTitle(pay?.title || "Sorun bildir");
    const kids = [];
    if (pay) kids.push(h("p", { class: "dk-pay-lead" }, `${pay.payerName} → ${pay.payeeName} · ${U.fmtKurus(pay.grossKurus)} · etkinlik ${fmtDT(pay.eventStartMs)}`));
    if (d.attendance) {
      kids.push(section("SAHNE GİRİŞ · ÇIKIŞ KAYDI",
        h("span", { class: "dk-pay-body" }, `Giriş: ${d.attendance.checkIn ? fmtDT(d.attendance.checkIn.at) : "yok"}`),
        h("span", { class: "dk-pay-body" }, `Çıkış: ${d.attendance.checkOut ? fmtDT(d.attendance.checkOut.at) : "yok"}`),
        d.attendance.verified ? h("span", { class: "dk-pay-body", style: { color: "#7CE0B0" } }, "Giriş ve çıkış fotoğraf kaydı doğrulandı.") : null));
    }
    if (!disp && d.role === "payer" && !d.canOpen) kids.push(dkInlineMessage("info", d.blockReason || "Bu ödeme için şikayet açılamaz."));
    if (!disp && d.role !== "payer") kids.push(h("p", { class: "dk-pay-muted" }, "Bu ödeme için açılmış bir şikayet yok."));

    if (!disp && d.canOpen && step === "form") {
      kids.push(dkInlineMessage("info", pay?.kind === "venue_rental"
        ? "İade yalnız kanıtla mümkündür: mekanın kullanılamadığını ya da hizmetin verilmediğini gösteren fotoğraflar ve mekanla yazışmalarınızın ekran görüntülerini ekleyin."
        : "İade yalnız kanıtla mümkündür: sanatçının gelmediğini ya da erken ayrıldığını gösteren fotoğraflar ve sanatçıyla yazışmalarınızın ekran görüntülerini ekleyin.", { icon: "shieldCheck" }));
      const cats = h("div", { class: "dk-pay-cats", role: "radiogroup", "aria-label": "Ne oldu" }, ...(d.categories || []).map((c) => {
        const b = h("button", { type: "button", role: "radio", class: cx("dk-rdo", "dk-row", "dk-pay-cat", category === c.key && "is-on"), "aria-checked": category === c.key ? "true" : "false" },
          h("span", { class: "dk-rdo-ring", "aria-hidden": "true" }, h("span", { class: "dk-rdo-dot" })), h("span", { class: "dk-tg-l" }, c.label));
        b.addEventListener("click", () => { category = c.key; cats.querySelectorAll(".dk-pay-cat").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", on ? "true" : "false"); }); syncForm(); });
        return b;
      }));
      summaryBtn = dkButton("Özeti gör", { variant: "role", size: 44, full: true, onClick: () => { step = "summary"; draw(); } });
      kids.push(
        h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, "NE OLDU"), cats),
        h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, "AÇIKLAMA"), desc),
        h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, "KANITLAR"),
          h("p", { class: "dk-pay-muted" }, "En az 1, en çok 10 görsel. Her görselin türünü seç: Fotoğraf, WhatsApp yazışması ya da Diğer."), picker.node),
        summaryBtn);
      syncForm();
    }
    if (!disp && d.canOpen && step === "summary") {
      const catLabel = d.categories?.find((c) => c.key === category)?.label || "";
      const edit = dkButton("Düzenle", { variant: "outline", size: 44, onClick: () => { step = "form"; draw(); } });
      const send = dkButton("Gönder", { variant: "role", size: 44, icon: "send", busyLabel: "Gönderiliyor…", onClick: async () => {
        if (sending) return;
        sending = true; send.dk.setBusy(true); edit.disabled = true; picker.setDisabled(true);
        try {
          const evidence = await uploadEvidence(oid, uid, picker.drafts);
          await payApi.openDispute({ merchantOid: oid, category, description: desc.input.value.trim(), evidence });
          alertModal("Şikayetin alındı", "Karşı taraf 48 saat içinde yanıt verebilir. GigBridge iki tarafın kanıtlarını inceleyip karar verecek; ödeme bu sürede emanette bekler.");
          step = "form"; picker.clear();
          try { onChanged?.(); } catch (_) {}
          await load();
        } catch (e) {
          alertModal("Gönderilemedi", U.paymentErrorText(e));
        } finally {
          sending = false; picker.setDisabled(false);
          if (send.isConnected) { send.dk.setBusy(false); edit.disabled = false; }
        }
      } });
      kids.push(section("ÖZET",
        h("span", { class: "dk-pay-tl" }, "NEDEN"), h("span", { class: "dk-pay-body" }, catLabel),
        h("span", { class: "dk-pay-tl" }, "AÇIKLAMA"), h("span", { class: "dk-pay-body dk-pay-pre" }, desc.input.value.trim()),
        h("span", { class: "dk-pay-tl" }, "KANITLAR"), h("span", { class: "dk-pay-body" }, U.evidenceSummary(picker.drafts))),
      h("p", { class: "dk-pay-muted" }, "Gönderdikten sonra şikayet değiştirilemez. Karşı taraf 48 saat içinde yanıt verebilir; GigBridge karar verene kadar ödeme emanette bekler."),
      h("div", { class: "dk-pay-btns is-split" }, edit, send));
    }
    if (disp) {
      kids.push(h("div", {}, dkStatusBadge({ label: U.DISPUTE_STATUS_LABEL[disp.status] || disp.status, color: disp.status === "resolved" ? U.TONE_COLOR.ok : U.TONE_COLOR.warn }, { variant: "box" })));
      kids.push(section("ŞİKAYET",
        h("span", { class: "dk-pay-tl" }, `${String(disp.categoryLabel || "").toLocaleUpperCase("tr-TR")} · ${fmtDT(disp.openedAt)}`),
        h("p", { class: "dk-pay-body dk-pay-pre" }, disp.description), evidenceGallery(disp.evidence)));
      let respKids;
      if (disp.response) respKids = [h("span", { class: "dk-pay-tl" }, fmtDT(disp.response.at)), h("p", { class: "dk-pay-body dk-pay-pre" }, disp.response.text), evidenceGallery(disp.response.evidence)];
      else if (d.canRespond) {
        replyBtn = dkButton("Yanıtı gönder", { variant: "role", size: 44, icon: "send", full: true, busyLabel: "Gönderiliyor…", onClick: async () => {
          if (sending) return;
          sending = true; replyBtn.dk.setBusy(true); replyPicker.setDisabled(true);
          try {
            const evidence = await uploadEvidence(oid, uid, replyPicker.drafts);
            await payApi.respondDispute({ merchantOid: oid, text: reply.input.value.trim(), evidence });
            alertModal("Yanıtın alındı", "GigBridge iki tarafın açıklamalarını ve kanıtlarını inceleyip karar verecek.");
            replyPicker.clear(); reply.input.value = "";
            try { onChanged?.(); } catch (_) {}
            await load();
          } catch (e) {
            alertModal("Gönderilemedi", U.paymentErrorText(e));
          } finally {
            sending = false; replyPicker.setDisabled(false);
            if (replyBtn?.isConnected) { replyBtn.dk.setBusy(false); syncForm(); }
          }
        } });
        respKids = [h("p", { class: "dk-pay-muted" }, `Son yanıt: ${fmtDT(disp.responseDeadlineMs)}. Açıklamanı ve varsa kanıtlarını ekle (en çok 10 görsel).`), reply, replyPicker.node, replyBtn];
        syncForm();
      } else respKids = [h("p", { class: "dk-pay-muted" }, disp.status === "awaiting_response" ? `Yanıt bekleniyor (son: ${fmtDT(disp.responseDeadlineMs)}).` : "Süresi içinde yanıt verilmedi.")];
      kids.push(section(d.role === "payee" ? "YANITIN" : "KARŞI TARAFIN YANITI", ...respKids));
      if (disp.resolution) {
        kids.push(section("GIGBRIDGE KARARI",
          h("span", { class: "dk-pay-body is-strong" }, U.decisionText(disp.resolution.decision, disp.resolution.amountKurus)),
          disp.resolution.note ? h("p", { class: "dk-pay-body dk-pay-pre" }, disp.resolution.note) : null,
          h("span", { class: "dk-pay-tl" }, fmtDT(disp.resolution.at))));
      }
    }
    if (d.serviceTerms) kids.push(h("section", { class: "dk-pay-sec" }, h("h3", { class: "dk-pay-h" }, "ONAYLANAN HİZMET KAPSAMI"), serviceTermsView(d.serviceTerms)));
    bodyEl.replaceChildren(...kids);
  }
  load();
  return drw;
}

// ══════════════════════════════════════════════════════════════════════
// HİZMET BELGESİ (Finans v2 · alıcı) — fv:2 ödemede "Belge yükle": tür (6) + belge no + tarih + dosya (PDF/JPG/PNG < 10 MB)
// → Storage payment_docs/{uid}/{oid}_{ts}.{ext} (yalnız sahibi yazar/okur) → submitPaymentDocument. Durum documents.service'ten.
// ══════════════════════════════════════════════════════════════════════
export function paymentDocBlock(p) {
  const svc = p.documents?.service || null;
  const st = svc?.status || null;
  const tone = U.TONE_COLOR[U.DOC_STATUS_TONE[st] || "muted"];
  const needed = (p.financeReasons || []).includes("document_missing");
  const kids = [h("div", { class: "dk-pay-head" }, ic("fileText", 15, "#A3A7AF", "1.9"), h("span", { class: "dk-pay-title" }, "Hizmet belgesi"),
    st ? dkStatusBadge({ label: U.DOC_STATUS_LABEL[st] || st, color: tone }, { variant: "box" }) : null)];
  if (svc) {
    kids.push(h("span", { class: "dk-pay-body" }, `${U.docTypeLabel(svc.docType)} · No ${svc.docNo || "—"} · ${isoToTR(svc.docDate) || "—"}`));
    if (st === "rejected" && svc.note) kids.push(note(`Red gerekçesi: ${svc.note}`, "#FF5A6E", "alertCircle"));
  } else {
    kids.push(textP(needed
      ? "Aktarım için bu ödemeye ait faturanı / serbest meslek makbuzunu yüklemen gerekiyor."
      : "Bu ödeme için düzenlediğin fatura ya da makbuzu yükleyebilirsin (mali kayıt için)."));
  }
  if (!svc || st === "rejected") {
    kids.push(dkButton(svc ? "Yeni belge yükle" : "Belge yükle", { variant: needed || st === "rejected" ? "role" : "outline", size: 36, icon: "upload", onClick: () => openPaymentDocModal(p) }));
  }
  return h("div", { class: cx("dk-pay-tbox", "dk-pay-doc") }, ...kids);
}

export function openPaymentDocModal(p, { onDone } = {}) {
  const uid = myUid();
  if (isDemoUser() || !uid) { alertModal("Demo Mod", "Demo hesapta belge yüklenemez."); return; }
  const typeSel = dkSelect({ size: 44, options: U.DOC_TYPES.map((d) => ({ value: d.key, label: d.label })), placeholder: "Belge türünü seç", attrs: { "aria-label": "Belge türü" } });
  const sel = typeSel.querySelector("select");
  const noIn = dkInput({ size: 44, maxlength: 40, placeholder: "örn. GIB2026000000123", autocomplete: "off", attrs: { "aria-label": "Belge numarası", spellcheck: "false" } });
  const dateIn = dkInput({ size: 44, type: "date", attrs: { "aria-label": "Belge tarihi", max: new Date().toISOString().slice(0, 10) } });
  const fileIn = h("input", { type: "file", accept: "application/pdf,image/jpeg,image/png", class: "dk-pay-file", "aria-label": "Belge dosyası" });
  const fileInfo = h("span", { class: "dk-pay-fine" }, "PDF, JPG ya da PNG · en çok 10 MB");
  const err = h("span", { class: "dk-pay-err", role: "alert" });
  let file = null, busy = false;
  fileIn.addEventListener("change", () => {
    file = fileIn.files?.[0] || null;
    err.textContent = "";
    if (file && !U.DOC_MIME[file.type]) { err.textContent = "Yalnız PDF, JPG ya da PNG yükleyebilirsin."; file = null; }
    else if (file && file.size >= U.DOC_MAX_BYTES) { err.textContent = "Dosya 10 MB'tan küçük olmalı."; file = null; }
    fileInfo.textContent = file ? `${file.name} · ${(file.size / 1048576).toFixed(1).replace(".", ",")} MB` : "PDF, JPG ya da PNG · en çok 10 MB";
  });
  const fld = (label, ctl) => h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, label), ctl);
  const body = h("div", { class: "dk-pay-form" },
    h("p", { class: "dk-pay-text" }, `${p.title || "Ödeme"} · ${U.fmtKurus(p.grossKurus)}`),
    fld("BELGE TÜRÜ", typeSel), fld("BELGE NO", noIn), fld("BELGE TARİHİ", dateIn),
    h("div", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "DOSYA"), fileIn, fileInfo),
    err,
    h("p", { class: "dk-pay-fine" }, "Belgen yalnız sana ve GigBridge finans ekibine görünür; mali kayıt ve vergi kesintisi doğrulaması için kullanılır."));
  const m = dkModal({ title: "Hizmet belgesi yükle", body, size: 500, variant: "panel", actions: [
    { label: "Vazgeç", variant: "outline" },
    { label: "Yükle", variant: "role", icon: "upload", busyLabel: "Yükleniyor…", onClick: async () => {
      if (busy) return false;
      const docType = sel.value, docNo = noIn.value.trim(), docDate = dateIn.value;
      if (!docType) { err.textContent = "Belge türünü seç."; return false; }
      if (docNo.length < 3) { err.textContent = "Belge numarasını gir."; return false; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) { err.textContent = "Belge tarihini seç."; return false; }
      if (!file) { err.textContent = "Belge dosyasını seç (PDF, JPG ya da PNG, en çok 10 MB)."; return false; }
      busy = true; err.textContent = "";
      try {
        const path = U.paymentDocPath(uid, p.id, Date.now(), U.DOC_MIME[file.type]);
        await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
        await payApi.submitPaymentDocument({ merchantOid: p.id, docType, docNo, docDate, storagePath: path });
        dkToast("Belge gönderildi · finans ekibi inceleyecek");
        try { onDone?.(); } catch (_) {}
        return true;
      } catch (e) {
        err.textContent = U.paymentErrorText(e);
        return false;
      } finally { busy = false; }
    } },
  ] });
  return m;
}

// ══════════════════════════════════════════════════════════════════════
// ÖDEME BİLGİLERİ (IBAN) — setPayoutAccount / getPayoutAccount (yalnız sanatçı ve mekan; sunucu maskeyle döner)
// ══════════════════════════════════════════════════════════════════════
export function payoutAccountCard({ openForm = false } = {}) {
  const node = h("section", { class: "dk-pay-acct", id: "odeme-bilgileri", "aria-labelledby": "dk-pay-acct-h", tabindex: "-1" });
  let acct = null, err = false, editing = !!openForm, tried = false, alive = true;
  const nameIn = dkInput({ size: 44, maxlength: 70, placeholder: "Hesap sahibinin adı", autocomplete: "name", attrs: { "aria-label": "Ad soyad / ünvan" } });
  const ibanIn = dkInput({ size: 44, value: "TR", placeholder: "TR00 0000 0000 0000 0000 0000 00", autocomplete: "off", inputmode: "text", maxlength: 32, cls: "dk-pay-mono", attrs: { "aria-label": "IBAN", spellcheck: "false" } });
  const nameErr = h("span", { class: "dk-pay-err", role: "alert" });
  const ibanErr = h("span", { class: "dk-pay-err", role: "alert" });
  ibanIn.addEventListener("input", () => {
    const pos = ibanIn.selectionStart, before = ibanIn.value.length;
    ibanIn.value = U.formatIbanInput(ibanIn.value);
    try { const np = Math.max(0, (pos ?? ibanIn.value.length) + (ibanIn.value.length - before)); ibanIn.setSelectionRange(np, np); } catch (_) {}
    if (tried) validate();
  });
  nameIn.addEventListener("input", () => { if (tried) validate(); });
  const validate = () => {
    const n = nameIn.value.trim();
    const nOk = n.length >= 3 && n.length <= 70;
    const iOk = U.isValidTrIban(ibanIn.value);
    nameErr.textContent = nOk ? "" : "Ad soyad ya da ünvan 3–70 karakter olmalı.";
    ibanErr.textContent = iOk ? "" : "IBAN geçersiz. TR ile başlayan 26 karakterlik IBAN gir.";
    nameIn.toggleAttribute("aria-invalid", !nOk); ibanIn.toggleAttribute("aria-invalid", !iOk);
    return nOk && iOk;
  };
  const saveBtn = dkButton("Kaydet", { variant: "role", size: 44, icon: "check", busyLabel: "Kaydediliyor…", onClick: async () => {
    if (isDemoUser()) { alertModal("Demo Mod", "Demo hesapta ödeme bilgisi eklenemez."); return; }
    tried = true;
    if (!validate()) return;
    saveBtn.dk.setBusy(true);
    try {
      const r = await payApi.setPayoutAccount(nameIn.value.trim(), U.normalizeIbanInput(ibanIn.value));
      acct = { exists: true, fullName: r.fullName, ibanMasked: r.ibanMasked };
      invalidateAccount();
      try { window.dispatchEvent(new CustomEvent("gb:payout-account")); } catch (_) {}
      editing = false; tried = false;
      alertModal("Kaydedildi", "Emanetteki ödemelerin bu hesaba aktarılacak.");
      draw();
    } catch (e) {
      alertModal("Kaydedilemedi", U.paymentErrorText(e));
    } finally { if (saveBtn.isConnected) saveBtn.dk.setBusy(false); }
  } });
  const cancelBtn = dkButton("Vazgeç", { variant: "outline", size: 44, onClick: () => { editing = false; tried = false; draw(); } });
  const head = h("div", { class: "dk-pay-acct-head" },
    h("span", { class: "dk-pay-kick" }, "ÖDEME ALMA"),
    h("h2", { id: "dk-pay-acct-h", class: "dk-pay-acct-t" }, "Ödeme Bilgileri"),
    h("p", { class: "dk-pay-text" }, "Etkinlik ücretleri PayTR güvencesiyle emanette tutulur; etkinlikten sonra bu hesaba aktarılır. Hesap sahibinin adı IBAN'daki adla aynı olmalı (şirket hesabında ticari ünvan)."));
  const foot = h("p", { class: "dk-pay-fine" }, "IBAN'ın yalnız ödeme aktarımı için PayTR'a iletilir; kimseyle paylaşılmaz. Aktarılan tutardan GigBridge komisyonu (+ KDV) ve varsa mevzuata göre vergi kesintisi düşülür.");
  const taxB = taxBanner();
  const bodyBox = h("div", { class: "dk-pay-acct-body" });
  function draw() {
    if (!alive) return;
    if (err) { bodyBox.replaceChildren(dkInlineMessage("err", "Kayıtlı bilgiler yüklenemedi. Bağlantını kontrol et."), dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: load })); return; }
    if (!acct) { bodyBox.replaceChildren(dkSkeleton({ w: "100%", h: 88, r: 8 })); return; }
    const kids = [];
    if (acct.exists && !editing) {
      kids.push(h("div", { class: "dk-pay-saved" },
        h("span", { class: "dk-pay-sub" }, "Kayıtlı hesap"),
        h("div", { class: "dk-pay-tline" }, h("span", { class: "dk-pay-tl" }, "AD SOYAD / ÜNVAN"), h("span", { class: "dk-pay-tv is-sans" }, acct.fullName || "—")),
        h("div", { class: "dk-pay-tline" }, h("span", { class: "dk-pay-tl" }, "IBAN"), h("span", { class: "dk-pay-tv" }, acct.ibanMasked || "—")),
        dkButton("Hesabı değiştir", { variant: "outline", size: 40, icon: "edit", onClick: () => { editing = true; nameIn.value = acct.fullName || ""; ibanIn.value = "TR"; draw(); requestAnimationFrame(() => nameIn.focus()); } })));
    } else {
      kids.push(h("div", { class: "dk-pay-form" },
        h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "AD SOYAD / ÜNVAN"), nameIn, nameErr),
        h("label", { class: "dk-pay-fld" }, h("span", { class: "dk-lbl" }, "IBAN"), ibanIn, ibanErr),
        h("div", { class: "dk-pay-btns" }, acct.exists ? cancelBtn : null, saveBtn)));
    }
    bodyBox.replaceChildren(...kids);
  }
  async function load() {
    err = false; acct = null; draw();
    try { acct = await payoutAccountCached(true); if (!acct?.exists) editing = true; }
    catch (_) { err = true; }
    draw();
  }
  node.append(head, taxB.node, bodyBox, foot);
  if (isDemoUser()) { acct = { exists: false }; editing = true; draw(); } else load();
  return {
    node,
    focus() { try { node.scrollIntoView({ block: "start", behavior: "smooth" }); node.focus({ preventScroll: true }); } catch (_) {} if (acct && !acct.exists) requestAnimationFrame(() => nameIn.focus()); },
    destroy() { alive = false; taxB.destroy(); },
  };
}

// ══════════════════════════════════════════════════════════════════════
// ETKİNLİK ÖDEMELERİ (uygulama EventPaymentsPanel) — etkinlik düzenleme ekranlarında
//   venue: invitations(venueId, eventId) → ödeme kartı · venueRequests(venueId, eventId) → emanet notu (alıcı)
//   organizer: invitations(organizerUid, eventId) + venueRequests(createdByUid, eventId) → ödeme kartı
// Kayıt yoksa hiçbir şey çizmez (node boş + gizli).
// ══════════════════════════════════════════════════════════════════════
export function eventPaymentsPanel({ role, uid, eventId, ibanHref = null }) {
  const node = h("section", { class: "dk-pay-evp", hidden: true, "aria-label": "Ödemeler" });
  const parts = [];
  let alive = true;
  if (!uid || !eventId || isDemoUser()) return { node, destroy() {} };
  (async () => {
    try {
      const [inv, vr] = await Promise.all([
        getDocs(query(collection(db, "invitations"), where(role === "venue" ? "venueId" : "organizerUid", "==", uid), where("eventId", "==", eventId))).catch(() => null),
        getDocs(query(collection(db, "venueRequests"), where(role === "venue" ? "venueId" : "createdByUid", "==", uid), where("eventId", "==", eventId))).catch(() => null),
      ]);
      if (!alive) return;
      const items = [];
      inv?.docs.forEach((d) => { const x = d.data(); if (x.status === "accepted" && Number(x.fee) > 0) items.push({ t: `Sahne ücreti · ${x.groupName || x.artistName || "Sanatçı"}`, payer: true, kind: "artist_booking", id: d.id, x, amt: Number(x.fee) }); });
      vr?.docs.forEach((d) => { const x = d.data(); if (x.status === "accepted" && Number(x.rentalFee) > 0) items.push({ t: `Mekan kiralama · ${x.venueName || "Mekan"}`, payer: role !== "venue", kind: "venue_rental", id: d.id, x, amt: Number(x.rentalFee) }); });
      if (!items.length) return;
      node.replaceChildren(h("h3", { class: "dk-pay-h" }, "ÖDEMELER"), ...items.map((it) => {
        const c = it.payer
          ? paymentCard({ kind: it.kind, refId: it.id, amountTL: it.amt, paymentStatus: it.x.paymentStatus ?? null, paymentId: it.x.paymentId ?? null, title: it.t, compact: true })
          : escrowNote({ kind: it.kind, refId: it.id, amountTL: it.amt, paymentStatus: it.x.paymentStatus ?? null, paymentId: it.x.paymentId ?? null, accepted: true, ibanHref });
        parts.push(c);
        return h("div", { class: "dk-pay-evi" }, h("span", { class: "dk-pay-evt" }, it.t), c.node);
      }));
      node.hidden = false;
    } catch (_) { /* sessiz: panel yalnız ek bilgi */ }
  })();
  return { node, destroy() { alive = false; parts.forEach((p) => p.destroy()); } };
}

// ══════════════════════════════════════════════════════════════════════
// YASAL bağlantılar (ödeme sayfası kenar kartı) — web'deki mevcut yasal sayfalar
// ══════════════════════════════════════════════════════════════════════
export function legalLinks() {
  const links = [[LEGAL?.distanceContract, "Mesafeli Hizmet Sözleşmesi"], [LEGAL?.refund, "İptal ve İade"], [LEGAL?.delivery, "Teslimat ve İfa"]].filter(([u]) => u);
  if (!links.length) return null;
  return h("div", { class: "dk-pay-legal" }, ...links.map(([u, l]) => h("a", { href: u, target: "_blank", rel: "noopener", class: "dk-link" }, l, ic("externalLink", 13))));
}
