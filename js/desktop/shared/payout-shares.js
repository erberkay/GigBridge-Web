// GRUP HAK EDİŞ PAYLARI (Finans v2) — grup yöneticisi üyelerin ödeme paylarını (tam sayı %, toplam 100) belirler.
// Uygulama karşılığı: GroupPayoutSharesScreen. Sunucu: setGroupPayoutShares({ groupId, shares:[{uid, percent}] }) — yalnız
// grup yöneticisi, yalnız üyeler, ≤ 20 kişi; shares: [] → paylar kaldırılır (ödeme tek IBAN'a gider ve finansal incelemeye düşer).
// Grup dokümanında `payoutShares` olarak okunur. Her üyenin kendi IBAN'ı ve vergi bilgisi olmalı (yoksa ödeme incelemede bekler).
import { h } from "../../ui.js";
import { groupMembers } from "../../data.js";
import { dkButton, dkInput, dkModal, dkToast, dkSkeleton, dkInlineMessage, dkConfirm } from "./ui.js";
import { payApi, paymentErrorText, isDemoUser, alertModal } from "./payments.js";

const MAX_SHARE_MEMBERS = 20;

/** Satır yanı küçük düğme → modal */
export function groupSharesButton(g, { onSaved } = {}) {
  return dkButton("Hak ediş payları", { variant: "outline", size: 36, icon: "wallet", cls: "dk-shares-btn", ariaLabel: `${g.name || "Grup"} hak ediş payları`,
    onClick: (e) => { e?.preventDefault?.(); openGroupSharesModal(g, { onSaved }); } });
}

export function openGroupSharesModal(g, { onSaved } = {}) {
  if (isDemoUser()) { alertModal("Demo Mod", "Demo hesapta hak ediş payı değiştirilemez."); return null; }
  const existing = new Map((Array.isArray(g.payoutShares) ? g.payoutShares : []).filter((x) => x && typeof x.uid === "string").map((x) => [x.uid, Number(x.percent) || 0]));
  const list = h("div", { class: "dk-shares-list" }, dkSkeleton({ w: "100%", h: 44, r: 6 }), dkSkeleton({ w: "100%", h: 44, r: 6 }));
  const total = h("span", { class: "dk-shares-total", "aria-live": "polite" });
  const err = h("span", { class: "dk-pay-err", role: "alert" });
  const inputs = new Map();
  const sum = () => [...inputs.values()].reduce((n, el) => n + (parseInt(el.value, 10) || 0), 0);
  const paint = () => {
    const t = sum();
    total.textContent = `Toplam %${t}`;
    total.classList.toggle("is-ok", t === 100);
    total.classList.toggle("is-bad", t !== 100);
  };
  const body = h("div", { class: "dk-pay-form" },
    h("p", { class: "dk-pay-text" }, "Grup ödemesi etkinlik sonrası her üyenin kendi IBAN'ına bu oranlarla bölünerek aktarılır. Oranlar tam sayı olmalı, toplamı %100 etmeli."),
    list,
    h("div", { class: "dk-shares-foot" }, total, dkButton("Eşit böl", { variant: "ghost", size: 36, onClick: () => {
      const ids = [...inputs.keys()]; if (!ids.length) return;
      const base = Math.floor(100 / ids.length); let rest = 100 - base * ids.length;
      ids.forEach((id) => { inputs.get(id).value = String(base + (rest-- > 0 ? 1 : 0)); });
      paint();
    } })),
    err,
    dkInlineMessage("info", "Her üyenin Ödeme Bilgileri'nde IBAN'ı ve Vergi Bilgileri'nin tamam olması gerekir; eksikse ödeme finansal incelemede bekler."));

  (async () => {
    let members = null;
    try { members = await groupMembers(g); } catch (_) { members = null; }
    if (!members) { list.replaceChildren(dkInlineMessage("err", "Üyeler yüklenemedi.")); return; }
    if (members.length > MAX_SHARE_MEMBERS) { list.replaceChildren(dkInlineMessage("err", `Hak ediş payı en çok ${MAX_SHARE_MEMBERS} üyeye tanımlanabilir.`)); return; }
    const hasAny = existing.size > 0;
    list.replaceChildren(...members.map((m, i) => {
      const inp = dkInput({ size: 40, inputmode: "numeric", maxlength: 3, value: String(hasAny ? existing.get(m.id) ?? 0 : (i === 0 ? 100 : 0)),
        cls: "dk-shares-in", attrs: { "aria-label": `${m.name} payı (%)` } });
      inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 3); paint(); });
      inputs.set(m.id, inp);
      return h("label", { class: "dk-shares-row2" },
        h("span", { class: "dk-shares-name" }, m.name, m.role === "founder" ? h("span", { class: "dk-pay-muted" }, " · kurucu") : m.role === "admin" ? h("span", { class: "dk-pay-muted" }, " · yönetici") : null),
        h("span", { class: "dk-shares-pct" }, "%", inp));
    }));
    paint();
  })();

  const save = async (shares) => {
    err.textContent = "";
    try {
      await payApi.setGroupPayoutShares({ groupId: g.id, shares });
      g.payoutShares = shares;
      dkToast(shares.length ? "Hak ediş payları kaydedildi" : "Hak ediş payları kaldırıldı");
      try { onSaved?.(shares); } catch (_) {}
      return true;
    } catch (e) { err.textContent = paymentErrorText(e); return false; }
  };
  const m = dkModal({ title: `Hak ediş payları · ${g.name || "Grup"}`, body, size: 520, variant: "panel",
    footerStart: existing.size ? dkButton("Payları kaldır", { variant: "danger-outline", size: 44, onClick: async () => {
      if (!(await dkConfirm({ title: "Payları kaldır", body: "Grup ödemeleri tek IBAN'a gider ve her ödeme finansal incelemeye düşer. Emin misin?", confirmLabel: "Kaldır", danger: true }))) return;
      if (await save([])) m.close("done");
    } }) : null,
    actions: [
      { label: "Vazgeç", variant: "outline" },
      { label: "Kaydet", variant: "role", icon: "check", busyLabel: "Kaydediliyor…", onClick: async () => {
        if (!inputs.size) return false;
        const shares = [...inputs.entries()].map(([uid, el]) => ({ uid, percent: parseInt(el.value, 10) || 0 })).filter((x) => x.percent > 0);
        if (sum() !== 100) { err.textContent = "Payların toplamı %100 olmalı."; return false; }
        return save(shares);
      } },
    ] });
  return m;
}
