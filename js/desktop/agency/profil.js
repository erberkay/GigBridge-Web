// AJANS — Profil (#/agency/profil, ≥769 px). Registry anahtarı: agencyProfil. CSS: css/dk-ajans.css (.dk-ag-*).
// Tasarım tuvalinde ajans ekranı YOK → WebOrgProfil kalıbı (hero + numaralı bölüm kartları + sağda kimlik kartı ve hesap menüsü).
// Alanlar (ajans-spec users/{uid}): logo (photoURL; Storage profile_photos/{uid}), ajans adı (displayName), şehir (≤100), hizmetler
// (agencyServices 1–10, her biri ≤40), hakkında (bio ≤2000), telefon (≤50).
// Ad değişikliği: diğer rollerin profil sayfalarıyla aynı kural — kural nameChangeOk: ad değişiyorsa displayNameChangedAt =
// serverTimestamp() ve son değişiklikten ≥ 90 gün (ajans = müşteri dışı rol). İstemci de önceden uyarır (sanatçı profili ile aynı).
import { h } from "../../ui.js";
import { session, logout, refreshProfile, scheduleAccountDeletion } from "../../store.js";
import { db, doc, updateDoc, serverTimestamp } from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkButton, dkInput, dkTextarea, dkLabel, dkPageHero, dkToast, dkConfirm, dkAvatar } from "../shared/ui.js";
import { PROVINCES, toMs, trUpper } from "../shared/helpers.js";
import {
  AGENCY_COLOR, uploadAgencyLogo, listAgencyItems, normalizeServices, servicesError, CITY_MAX, PHONE_MAX, BIO_MAX,
} from "../../agency-data.js";
import { servicesEditor, cropImage, newId } from "./common.js";

export const NOT_READY = false;

const P = "dk-ag";
const k = (s) => `${P}-${s}`;
const ico = (name, size, o = {}) => svgIcon(name, { size, ...o });
const NAME_DAYS = 90;   // firestore.rules nameChangeCooldownDays: müşteri dışı roller 90 gün

export function agencyProfilView(ctx) {
  const s = ctx.session || session;
  let p = s.profile || {};
  const uid = s.user?.uid || p.id;
  let alive = true;
  let saving = false;
  let pendingBlob = null, pendingUrl = null, removePhoto = false;
  let dirty = false;

  const shell = panelShell({ role: "agency", active: ctx.route?.nav || "profil", title: "Profil", crumb: "Profil", ctx });
  const root = shell.content;
  root.classList.add(P, k("prof-page"));

  // ══════════ HERO ══════════
  const saveBtn = (cls) => dkButton("Kaydet", { variant: "role", color: AGENCY_COLOR, size: 44, icon: ico("check", 17, { color: "#06070A", sw: "2.2" }), busyLabel: "Kaydediliyor…", cls, onClick: () => save() });
  const saveTop = saveBtn(k("savetop"));
  root.append(dkPageHero({
    eyebrow: "PROFİL · AJANS", title: "Ajansının ", em: "vitrini", tail: ".",
    lead: "Mekanlar, organizatörler ve sanatçılar Ajans Bul’da bu bilgileri görür: logon, şehrin, hizmetlerin ve iletişim bilgin.",
    color: AGENCY_COLOR, actions: saveTop, cls: k("hero"),
  }));

  // ══════════ 01 AJANS BİLGİLERİ ══════════
  const hInfo = newId(k("hinfo"));
  const logoAv = h("span", { class: k("logo") });
  const fileIn = h("input", { type: "file", accept: "image/*", class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
  const uploadBtn = h("button", { type: "button", class: cx(k("upbtn"), "dk-press") }, ico("upload", 15), "Logo yükle");
  const removeBtn = h("button", { type: "button", class: cx(k("rmbtn"), "dk-press") }, "Kaldır");
  const logoRow = h("div", { class: k("logorow") }, logoAv,
    h("div", { class: k("logocol") },
      h("span", { class: k("logot") }, "Ajans logosu"),
      h("span", { class: k("fhint") }, "Opsiyonel · kare, en az 400×400 önerilir"),
      h("div", { class: k("logobtns") }, uploadBtn, removeBtn)),
    fileIn);

  const fld = (label, input, extra) => {
    const target = input.matches?.("input,textarea,select") ? input : input.querySelector?.("input,textarea,select");
    if (target && !target.id) target.id = newId(k("f"));
    return h("div", { class: k("fld") }, dkLabel(label, { for: target?.id }), input, extra || null);
  };
  const lastNameMs = () => toMs(p.displayNameChangedAt);
  const nameLockedUntil = () => { const t = lastNameMs(); return t != null && Date.now() - t < NAME_DAYS * 86400e3 ? t + NAME_DAYS * 86400e3 : null; };
  const fmtLong = (ms) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const nameIn = dkInput({ value: p.displayName || "", placeholder: "Ajans adı", autocomplete: "organization", maxlength: 120 });
  const nameHint = h("span", { class: k("fhint") });
  const paintNameHint = () => {
    const until = nameLockedUntil();
    nameHint.replaceChildren(ico("lock", 13), until ? `Ajans adını 90 günde bir değiştirebilirsin. Bir sonraki değişiklik: ${fmtLong(until)}.` : "Ajans adını 90 günde bir değiştirebilirsin.");
  };
  paintNameHint();
  const listId = newId(k("cities"));
  const cityIn = dkInput({ value: p.city || "", placeholder: "Örn. İstanbul", autocomplete: "address-level1", maxlength: CITY_MAX, attrs: { list: listId } });
  const phoneIn = dkInput({ type: "tel", value: p.phone || "", placeholder: "05xx xxx xx xx", autocomplete: "tel", maxlength: PHONE_MAX });
  const bioIn = dkTextarea({ rows: 5, value: p.bio || "", maxlength: BIO_MAX, placeholder: "Ajansını, ekipmanlarını ve çalıştığın etkinlik türlerini kısaca anlat." });
  const errEl = h("span", { class: k("err"), role: "alert" });
  const saveForm = saveBtn(k("saveform"));
  const form = h("form", { class: k("pform"), "aria-labelledby": hInfo, novalidate: true },
    logoRow,
    fld("Ajans adı", nameIn, nameHint),
    h("div", { class: k("two") }, fld("Şehir", cityIn, h("datalist", { id: listId }, ...PROVINCES.map((c) => h("option", { value: c })))), fld("Telefon", phoneIn)),
    fld("Hakkında", bioIn, h("span", { class: k("fhint") }, "Ajans Bul ayrıntısında görünür.")));
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.shiftKey || e.target?.tagName !== "INPUT" || e.target.type === "file") return;
    e.preventDefault(); save();
  });
  form.addEventListener("input", () => { dirty = true; setErr(""); });
  const infoCard = h("section", { class: k("card"), "aria-labelledby": hInfo },
    h("div", { class: k("shead") }, h("span", { class: k("num") }, "01"), h("h2", { id: hInfo, class: k("h2") }, "Ajans bilgileri")), form);

  // ══════════ 02 HİZMETLER ══════════
  const hSvc = newId(k("hsvc"));
  const svc = servicesEditor({ value: p.agencyServices || [], labelledBy: hSvc, onChange: () => { dirty = true; svc?.setInvalid(false); setErr(""); } });
  const svcCard = h("section", { class: k("card"), "aria-labelledby": hSvc },
    h("div", { class: k("shead") }, h("span", { class: k("num") }, "02"), h("h2", { id: hSvc, class: k("h2") }, "Hizmetler")),
    h("div", { class: k("svcbody") },
      h("p", { class: k("muted") }, "Hazır hizmetlerden seç ya da kendi hizmetini ekle (en az 1, en çok 10). İlanlarının kategorileri bu listeden gelir."),
      svc.node));

  const foot = h("div", { class: k("pfoot") }, errEl, saveForm);

  // ══════════ KİMLİK + HESAP MENÜSÜ ══════════
  const idAv = h("span", { class: k("idav") });
  const idName = h("span", { class: k("idname") });
  const idMail = h("span", { class: k("idmail") });
  const idCity = h("span", { class: k("idcity") });
  const stat = (label) => { const v = h("span", { class: k("statv") }, "—"); return { v, node: h("div", { class: k("stat") }, v, h("span", { class: k("statl") }, label)) }; };
  const stLive = stat("YAYINDA"), stDraft = stat("TASLAK"), stSvc = stat("HİZMET");
  const identity = h("section", { class: k("id"), "aria-label": "Kimlik" },
    idAv, idName, idMail,
    h("span", { class: k("badge") }, ico("agency", 14, { color: AGENCY_COLOR }), "AJANS", idCity),
    h("div", { class: k("stats") }, stLive.node, stDraft.node, stSvc.node));
  const menuRow = ({ icon, label, href, onClick, danger }) => {
    const inner = [h("span", { class: k("mtile") }, ico(icon, 16, { color: danger ? "#FF5A6E" : "#A3A7AF" })), h("span", { class: k("mlabel") }, label),
      danger ? null : h("span", { class: k("mchev") }, ico("chevronRight", 16))];
    const cls = cx(k("mrow"), danger && "is-danger", "dk-row");
    return href ? h("a", { href, class: cls }, ...inner) : h("button", { type: "button", class: cls, onclick: onClick }, ...inner);
  };
  const menu = h("nav", { class: k("menu"), "aria-label": "Hesap" },
    h("div", { class: k("mhead") }, h("span", {}, "HESAP")),
    menuRow({ icon: "grid", label: "Katalog", href: "#/agency/katalog" }),
    menuRow({ icon: "chatSquare", label: "Mesajlar", href: "#/agency/mesajlar" }),
    menuRow({ icon: "trash", label: "Hesabımı Sil", danger: true, onClick: () => askDelete() }),
    menuRow({ icon: "logoutOrg", label: "Çıkış Yap", danger: true, onClick: () => askLogout() }));
  const aside = h("aside", { class: k("paside") }, identity, menu);

  root.append(h("div", { class: k("cols") }, h("div", { class: k("left") }, infoCard, svcCard, foot), aside));

  // ══════════ ÇİZİM ══════════
  const photoNow = () => (pendingUrl || (removePhoto ? null : p.photoURL) || null);
  function drawLogo() {
    const src = photoNow();
    logoAv.replaceChildren(src ? dkAvatar({ photo: src, size: 88, alt: "Ajans logosu", radius: 16 })
      : dkAvatar({ size: 88, type: "agency", icon: "agency", iconSize: 36, radius: 16 }));
    removeBtn.hidden = !src;
  }
  function drawIdentity() {
    idAv.replaceChildren(p.photoURL ? dkAvatar({ photo: p.photoURL, size: 88, alt: "", radius: 16 }) : dkAvatar({ size: 88, type: "agency", icon: "agency", iconSize: 36, radius: 16 }));
    idName.textContent = p.displayName || "Ajans";
    idMail.textContent = p.email || s.user?.email || "";
    idMail.hidden = !idMail.textContent;
    idCity.textContent = p.city ? ` · ${trUpper(p.city)}` : "";
    stSvc.v.textContent = String(normalizeServices(p.agencyServices).length);
  }
  drawLogo(); drawIdentity();
  (async () => {
    try {
      const items = await listAgencyItems(uid, { ownerView: true });
      if (!alive) return;
      stLive.v.textContent = String(items.filter((x) => x.active).length);
      stDraft.v.textContent = String(items.filter((x) => !x.active).length);
    } catch (_) { /* sayaçlar "—" kalır */ }
  })();

  // ══════════ LOGO ══════════
  uploadBtn.addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = "";
    if (!f) return;
    const blob = await cropImage(f, { aspect: 1, round: false });
    if (!alive) return;
    requestAnimationFrame(() => { if (uploadBtn.isConnected) uploadBtn.focus({ preventScroll: true }); });
    if (!blob) return;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingBlob = blob; pendingUrl = URL.createObjectURL(blob); removePhoto = false; dirty = true;
    drawLogo();
  });
  removeBtn.addEventListener("click", () => {
    if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; pendingBlob = null; }
    else removePhoto = true;   // kayıtta photoURL: null
    dirty = true;
    drawLogo();
    uploadBtn.focus();
  });

  // ══════════ KAYDET ══════════
  function setErr(m) { errEl.textContent = m || ""; }
  function setBusy(on) { saving = on; saveTop.dk.setBusy(on); saveForm.dk.setBusy(on); }
  const fail = (msg, el) => { setErr(msg); dkToast(msg, { type: "err" }); try { el?.focus(); } catch (_) {} };
  async function save() {
    if (saving) return;
    setErr("");
    [nameIn, cityIn, phoneIn].forEach((x) => x.removeAttribute("aria-invalid"));
    svc.setInvalid(false);
    const name = nameIn.value.trim().replace(/\s+/g, " ");
    const city = cityIn.value.trim();
    const phone = phoneIn.value.trim();
    const bio = (bioIn.input || bioIn).value.trim();
    const services = normalizeServices(svc.get());
    if (!name) { nameIn.setAttribute("aria-invalid", "true"); return fail("Ajans adını gir.", nameIn); }
    if (!city) { cityIn.setAttribute("aria-invalid", "true"); return fail("Şehrini gir.", cityIn); }
    if (city.length > CITY_MAX) { cityIn.setAttribute("aria-invalid", "true"); return fail(`Şehir en çok ${CITY_MAX} karakter olmalı.`, cityIn); }
    if (phone.length > PHONE_MAX) { phoneIn.setAttribute("aria-invalid", "true"); return fail(`Telefon en çok ${PHONE_MAX} karakter olmalı.`, phoneIn); }
    if (bio.length > BIO_MAX) return fail(`Hakkında en çok ${BIO_MAX} karakter olmalı.`, bioIn.input || bioIn);
    const se = servicesError(services);
    if (se) { svc.setInvalid(true); return fail(se, null); }
    const nameChanged = name !== (p.displayName || "");
    if (nameChanged) {
      const until = nameLockedUntil();
      if (until) { nameIn.setAttribute("aria-invalid", "true"); return fail(`Ajans adını 90 günde bir değiştirebilirsin. Bir sonraki değişiklik: ${fmtLong(until)}.`, nameIn); }
    }
    const patch = { city, phone, bio, agencyServices: services };
    if (nameChanged) { patch.displayName = name; patch.displayNameChangedAt = serverTimestamp(); }
    setBusy(true);
    try {
      if (pendingBlob) patch.photoURL = await uploadAgencyLogo(uid, pendingBlob);
      else if (removePhoto && p.photoURL) patch.photoURL = null;
      await updateDoc(doc(db, "users", uid), patch);
      if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
      pendingBlob = null; removePhoto = false; dirty = false;
      await refreshProfile();
      if (!alive) return;
      p = session.profile || p;
      drawLogo(); drawIdentity(); paintNameHint(); patchShellIdentity();
      dkToast("Profil kaydedildi");
    } catch (e) {
      console.warn("[agency profil]", e);
      if (alive) setErr(e?.code === "permission-denied" ? "Kaydedilemedi: ad son 90 gün içinde değiştirilmiş olabilir." : "Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
    } finally {
      if (alive) setBusy(false);
    }
  }

  // panelShell kimlik güncelleme API'si yok → kabuğun kendi düğümlerinde yerel yama (org profili ile aynı yöntem)
  function patchShellIdentity() {
    const u1 = shell.aside?.querySelector(".dk-ps-u1");
    if (u1) u1.textContent = p.displayName || "Ajansın";
    const mk = (size, iconSize) => (p.photoURL ? dkAvatar({ photo: p.photoURL, size, type: "agency" }) : dkAvatar({ size, type: "agency", icon: "agency", iconSize }));
    const cardAv = shell.aside?.querySelector(".dk-ps-user > .dk-av");
    if (cardAv) cardAv.replaceWith(mk(36, 17));
    const topAv = shell.topbar?.querySelector(".dk-ps-av");
    if (topAv) topAv.replaceChildren(mk(36, 16));
  }

  // ══════════ HESAP ══════════
  async function askLogout() {
    const ok = await dkConfirm({ title: "Çıkış", body: "Hesabından çıkmak istiyor musun?", confirmLabel: "Çıkış Yap", cancelLabel: "İptal", danger: true });
    if (ok) logout();
  }
  async function askDelete() {
    const ok = await dkConfirm({ title: "Hesabımı Sil",
      body: "Hesabın silme sırasına alınır ve oturumun kapanır. 3 ay içinde tekrar giriş yaparsan silme iptal olur; sonra ajans profilin, kataloğun ve fotoğrafların kalıcı olarak silinir.",
      confirmLabel: "Hesabımı Sil", cancelLabel: "Vazgeç", danger: true, size: 460 });
    if (!ok) return;
    try { await scheduleAccountDeletion(); }
    catch (_) { if (alive) dkToast("İşlem başarısız. Tekrar dene.", { type: "err" }); }
  }

  return {
    node: shell.node,
    update() {},
    // aynı kimlikte oturum yayını (refreshProfile): form yazılanları korunur
    onSession: () => true,
    destroy() {
      alive = false;
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      shell.destroy();
    },
  };
}
