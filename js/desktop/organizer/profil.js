// WebOrgProfil — masaüstü görünümü (≥769 px). Registry anahtarı: orgProfil (#/organizer/profil).
// Spec: specs/org-admin.md § WebOrgProfil (+ F1–F7). Artboard: design/WebOrgProfil.dc.html (sahibi notu YOK).
// CSS: css/dk-org-profil.css — sayfa kökü .dk-org-profil (kabuğun <main>'i); portal diyalogları .dk-org-profil-mdl.
// ≤768: legacy organizer.js renderProfile aynen kalır (router bu modülü mobilde yüklemez).
//
// Legacy özellikleri (organizer.js renderProfile / profMenuRow / confirmLogout) — HEPSİ korundu:
//   · Form: Organizasyon adı (önden doldurma orgName || displayName; personelde kilitli + "yalnızca sahip" ipucu), Şehir, Telefon,
//     Hakkında, profil/organizasyon fotoğrafı (openImageCropper aspect 1 + yuvarlak → uploadImage)
//   · Kaydet: sahipte boş ad → "Organizasyon adı gir"; patch { city, phone, bio, ...(isOwner ? { orgName } : {}) } (+ photoURL);
//     org = isOwner && p.orgId && orgName !== p.orgName ? { orgId, name } : null → data.js saveOrganizerProfile (TEK batch:
//     users/{uid} + organizations/{orgId}.name). displayName ASLA yazılmaz (nameChangeOk / 90 gün kilidi). → refreshProfile →
//     "Profil kaydedildi"; hata → satır içi "Kaydedilemedi."
//   · Kimlik başlığı: avatar (photoURL), kişi adı (displayName), e-posta, organizasyon rozeti (orgName || "Organizasyonunuz") + rol hapı
//   · Menü: Ekip → #/organizer/ekip · Bildirimler → #/organizer/bildirim (legacy tam liste; spec Q4/I12) · E-posta Değiştir ·
//     Şifre Değiştir (+ "E-posta ile sıfırla") · Hesabımı Sil (3 ay yumuşak silme) · Çıkış Yap (onay → logout())
// Tasarım ekleri: hero + üstte ikinci "Kaydet", 2 kolon, logo "Kaldır" (photoURL:null), sosyal bağlantılar (YENİ alanlar:
//   users.social.{instagram,youtube,spotify} + users.website — yalnız değişen anahtar yazılır, nokta yolu → mevcut social
//   haritası korunur), geçmiş etkinlikler (organizerEvents; isPastEv, en yeni 2), kimlik sayaçları (üye / yaklaşan / geçmiş).
// Bilinçli sapmalar: sosyal kartın "YENİ ALAN · SİTEDE HENÜZ YOK" rozeti tasarımcı notu → gösterilmez (spec Q10 önerisi).
//   E-posta/Şifre/Hesabımı Sil legacy auth.js modallarıyla AYNI akış + metin, org form modalı (F5) görünümünde (auth.js'in
//   yardımcıları dışa aktarılmıyor → yerel kopya; SHARED-CANDIDATE, WebSanatciProfil/WebProfil de kopyalıyor).
import { h, openImageCropper } from "../../ui.js";
import { session, logout, refreshProfile, scheduleAccountDeletion } from "../../store.js";
import { saveOrganizerProfile, uploadImage, organizerEvents, orgMembers } from "../../data.js";
import {
  auth, EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword,
  sendPasswordResetMail, sendPasswordResetEmail,
} from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkButton, dkInput, dkTextarea, dkField, dkLabel, dkPageHero, dkStatusBadge, dkModal, dkToast, dkSkeleton, dkAvatar, dkLoginGate, dkInlineMessage } from "../shared/ui.js";
import { eventStartMs, eventEndMs, toMs, MONTHS_TR_SHORT } from "../shared/helpers.js";

const NS = "dk-org-profil";
const k = (s) => `${NS}-${s}`;
const PINK = "#FF4FA3", CYAN = "#4ED8FF";

// Artboard SVG gövdeleri (WebOrgProfil inline <svg>'lerinden BİREBİR)
const P = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"></path><path d="M15 9h4a1 1 0 0 1 1 1v11"></path><path d="M3 21h18M8 8h3M8 12h3M8 16h3"></path>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"></path>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><path d="M17.3 6.7h.01"></path>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"></rect><path d="m10 9 5 3-5 3z"></path>',
  music: '<path d="M9 18V5l11-2v13"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="17.5" cy="16" r="2.5"></circle>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
  person: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5"></path>',
  people: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"></path><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"></path>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3.5 6.5 8.5 7 8.5-7"></path>',
  key: '<circle cx="8" cy="15" r="4"></circle><path d="m11 12 9-9M17 6l2 2M15 8l2 2"></path>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path>',
  logout: '<path d="M9 4H5v16h4M14 8l4 4-4 4M18 12H9"></path>',
  chevR: '<path d="m9 6 6 6-6 6"></path>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
};
const ico = (name, size, { color = "currentColor", sw = "2", cls } = {}) => svgRaw(P[name], { size, color, sw, cls });

let _ids = 0;
const uidOf = (p) => `${NS}-${p}-${++_ids}`;
const dmy = (ms) => { if (ms == null) return ""; const d = new Date(ms); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`; };
// Legacy isPastEv (organizer.js) — bitiş masaüstü tek tanımıyla (data.js eventEndMs: endAt → endTime → +6 sa)
function isPastEv(e) {
  if (["completed", "past", "cancelled", "archived"].includes(e?.status)) return true;
  const end = eventEndMs(e);
  return end != null && end < Date.now();
}
// Legacy renderHome "yaklaşan" kuralı: iptal edilmemiş ve başlangıcı bugün 00:00 ve sonrası
function upcomingCount(events) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return (events || []).filter((e) => e.status !== "cancelled" && (eventStartMs(e) ?? 0) >= d.getTime()).length;
}

// ── legacy auth.js yardımcıları (dışa aktarılmıyor) — SHARED-CANDIDATE: auth.js requestPasswordReset / recaptchaToken / trError ──
const RECAPTCHA_SITE_KEY = "6LeW9kctAAAAAIDWQ9SCMngGL7OcHMqIl_H90db5";
let _grc = null;
function loadRecaptcha() {
  if (_grc) return _grc;
  _grc = new Promise((resolve, reject) => {
    if (window.grecaptcha && window.grecaptcha.execute) return resolve(window.grecaptcha);
    const sc = document.createElement("script");
    sc.src = "https://www.google.com/recaptcha/api.js?render=" + RECAPTCHA_SITE_KEY;
    sc.async = true; sc.defer = true; sc.onload = () => resolve(window.grecaptcha); sc.onerror = reject;
    document.head.append(sc);
  });
  return _grc;
}
async function recaptchaToken(action) {
  try { const g = await loadRecaptcha(); await new Promise((r) => g.ready(r)); return await g.execute(RECAPTCHA_SITE_KEY, { action }); } catch { return null; }
}
async function requestPasswordReset(email, rc) {
  try { await sendPasswordResetMail({ email, recaptchaToken: rc }); }
  catch (err) {
    const code = err && err.code;
    if (code === "functions/invalid-argument" || code === "invalid-argument" || code === "functions/resource-exhausted" || code === "resource-exhausted") throw err;
    await sendPasswordResetEmail(auth, email);   // Functions yoksa (emülatör / dağıtılmamış) Firebase'in kendi e-postası — legacy ile aynı
  }
}
function trError(code) {
  const m = {
    "auth/email-already-in-use": "Bu e-posta zaten kayıtlı. Giriş yapmayı dene.",
    "auth/invalid-email": "Geçersiz e-posta.",
    "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/invalid-credential": "E-posta ya da şifre hatalı.",
    "auth/wrong-password": "Şifre hatalı.",
    "auth/requires-recent-login": "Güvenlik için tekrar giriş yapman gerekiyor. Çıkış yapıp yeniden giriş yap.",
    "auth/operation-not-allowed": "E-posta değiştirme için yeni adresini doğrulaman gerekiyor.",
    "auth/user-not-found": "Böyle bir hesap yok.",
    "auth/too-many-requests": "Çok fazla deneme. Biraz sonra tekrar dene.",
    "auth/network-request-failed": "İnternet bağlantı hatası.",
    "functions/resource-exhausted": "Çok fazla şifre sıfırlama isteği. Lütfen birkaç dakika sonra tekrar dene.",
    "resource-exhausted": "Çok fazla şifre sıfırlama isteği. Lütfen birkaç dakika sonra tekrar dene.",
  };
  return m[code] || "İşlem başarısız. Tekrar dene.";
}
const isGoogleOnly = (user) => !!(user && user.providerData && user.providerData.some((x) => x.providerId === "google.com"))
  && !(user?.providerData || []).some((x) => x.providerId === "password");

// Legacy kırpıcı (#modal-root, z 3000) açıkken pencere düzeyinde (dk katmanlarının belge düzeyi ESC/Tab'ından önce) ESC → İptal,
// Tab → kırpıcı içinde döngü (WebOrgEtkinlikler ile aynı yöntem).
function cropImage(file, opts) {
  const ov = () => document.querySelector("#modal-root .cr-overlay");
  const onKey = (e) => {
    const o = ov(); if (!o) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); o.querySelector(".btn-ghost")?.click(); return; }
    if (e.key === "Tab") {
      const f = [...o.querySelectorAll("button,input")].filter((x) => !x.disabled);
      if (!f.length) return;
      e.preventDefault(); e.stopPropagation();
      const i = f.indexOf(document.activeElement);
      f[i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  window.addEventListener("keydown", onKey, true);
  let tries = 0;
  const focusIt = () => { const o = ov(); if (o) { o.querySelector(".cr-actions .btn:not(.btn-ghost)")?.focus(); return; } if (++tries < 90) requestAnimationFrame(focusIt); };
  requestAnimationFrame(focusIt);
  return openImageCropper(file, opts).catch(() => null).finally(() => window.removeEventListener("keydown", onKey, true));
}

export function orgProfilView(ctx) {
  const s = ctx.session || session;
  let p = s.profile || {};
  const uid = s.user?.uid || p.id;
  const orgId = p.orgId || uid;
  const isOwner = (p.orgRole || "owner") !== "staff";
  let alive = true;
  let saving = false;
  let pendingBlob = null, pendingUrl = null, removePhoto = false;

  const shell = panelShell({ role: "organizer", active: ctx.route?.nav || "profil", title: "Profil", crumb: "Profil", ctx });
  const root = shell.content;
  root.classList.add(NS);

  // ══════════ HERO ══════════
  const saveBtn = (cls) => dkButton("Kaydet", { variant: "primary", size: 44, icon: ico("check", 17, { color: "#06070A", sw: "2.2" }), busyLabel: "Kaydediliyor…", cls, onClick: () => save() });
  const saveTop = saveBtn(k("savetop"));
  const hero = dkPageHero({
    eyebrow: "PROFİL · ORGANİZASYON", title: "Organizasyonun ", em: "vitrini", tail: ".",
    lead: "Mekanlar istek aldığında bu bilgileri görür. Güncel tutmak onay şansını artırır.",
    actions: saveTop, cls: k("hero"),
  });

  // ══════════ 01 ORGANİZASYON BİLGİLERİ ══════════
  const hInfo = uidOf("hinfo");
  const logoAv = h("span", { class: k("logo") });
  const fileIn = h("input", { type: "file", accept: "image/*", class: "dk-sr", tabindex: "-1", "aria-hidden": "true" });
  const uploadBtn = h("button", { type: "button", class: cx(k("upbtn"), "dk-press") }, ico("upload", 15), "Logo yükle");
  const removeBtn = h("button", { type: "button", class: cx(k("rmbtn"), "dk-press") }, "Kaldır");
  const logoRow = h("div", { class: k("logorow") }, logoAv,
    h("div", { class: k("logocol") },
      h("span", { class: k("logot") }, "Organizasyon / profil fotoğrafı"),
      h("span", { class: k("logos") }, "Opsiyonel · kare, en az 400×400 önerilir"),
      h("div", { class: k("logobtns") }, uploadBtn, removeBtn)),
    fileIn);

  const fld = (label, input, extra) => {
    if (!input.id) input.id = uidOf("f");
    return h("div", { class: k("fld") }, dkLabel(label, { for: input.id }), input, extra || null);
  };
  const orgIn = dkInput({ id: uidOf("org"), value: p.orgName || p.displayName || "", placeholder: "Organizasyon adı", disabled: !isOwner, autocomplete: "organization" });
  const orgHint = !isOwner ? h("span", { class: k("hint") }, ico("lock", 13), "Organizasyon adını yalnızca sahip değiştirebilir.") : null;
  const cityIn = dkInput({ id: uidOf("city"), value: p.city || "", placeholder: "Örn. İstanbul", autocomplete: "address-level2" });
  const phoneIn = dkInput({ id: uidOf("phone"), type: "tel", value: p.phone || "", placeholder: "05xx xxx xx xx", autocomplete: "tel" });
  const bioIn = dkTextarea({ id: uidOf("bio"), rows: 4, value: p.bio || "", placeholder: "Kısa tanıtım" });
  const errEl = h("span", { class: k("err"), role: "alert" });
  const saveForm = saveBtn(k("saveform"));
  const form = h("form", { class: k("form"), "aria-labelledby": hInfo, novalidate: true },
    logoRow,
    fld("Organizasyon adı", orgIn, orgHint),
    h("div", { class: k("two") }, fld("Şehir", cityIn), fld("Telefon", phoneIn)),
    fld("Hakkında", bioIn, h("span", { class: k("help") }, "Organizasyonunu, düzenlediğin etkinlik türlerini ve çalıştığın sahneleri kısaca anlat.")),
    h("div", { class: k("foot") }, errEl, saveForm));
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  const infoCard = h("section", { class: k("card"), "aria-labelledby": hInfo },
    h("div", { class: k("shead") }, h("span", { class: k("snum") }, "01"), h("h2", { id: hInfo }, "Organizasyon Bilgileri")),
    form);

  // ══════════ 02 SOSYAL BAĞLANTILAR (yeni alanlar) ══════════
  const hSoc = uidOf("hsoc");
  const soc = p.social || {};
  const socIn = (key, label, icon, color, ph, value) => {
    const inp = dkInput({ id: uidOf(key), value: value || "", placeholder: ph, cls: k("socin"), attrs: { spellcheck: "false", autocapitalize: "off" } });
    return { key, inp, node: h("div", { class: k("fld") }, dkLabel(label, { for: inp.id }), h("div", { class: k("iconin") }, h("span", { class: k("inico") }, ico(icon, 18, { color })), inp)) };
  };
  const S = {
    // etiketler BÜYÜK harfle verilir (dkLabel trUpper: "Spotify" → "SPOTİFY" olurdu; artboard "SPOTIFY")
    instagram: socIn("instagram", "INSTAGRAM", "instagram", "#EC4899", "kullanıcı adı ya da bağlantı", soc.instagram),
    website: socIn("website", "WEB SİTESİ", "link", CYAN, "https://…", p.website),
    youtube: socIn("youtube", "YOUTUBE", "youtube", "#FF5A6E", "kanal bağlantısı", soc.youtube),
    spotify: socIn("spotify", "SPOTIFY", "music", "#7CE0B0", "çalma listesi ya da bağlantı", soc.spotify),
  };
  const socialCard = h("section", { class: k("card"), "aria-labelledby": hSoc },
    h("div", { class: k("shead") }, h("span", { class: k("snum") }, "02"), h("h2", { id: hSoc }, "Sosyal bağlantılar")),
    h("div", { class: k("socgrid") }, S.instagram.node, S.website.node, S.youtube.node, S.spotify.node));

  // ══════════ 03 GEÇMİŞ ETKİNLİKLER ══════════
  const hPast = uidOf("hpast");
  const PAST_HREF = "#/organizer/etkinlik?durum=gecmis";
  const pastGrid = h("div", { class: k("pastgrid") });
  const pastSec = h("section", { class: k("past"), "aria-labelledby": hPast },
    h("div", { class: k("phead") },
      h("div", { class: k("phl") }, h("span", { class: k("snum") }, "03"), h("h2", { id: hPast }, "Geçmiş etkinlikler")),
      h("a", { href: PAST_HREF, class: cx(k("all"), "dk-link") }, "Tümü", ico("arrow", 14))),
    pastGrid);

  // ══════════ KİMLİK + HESAP MENÜSÜ ══════════
  const idAv = h("span", { class: k("idav") });
  const idName = h("span", { class: k("idname") });
  const idMail = h("span", { class: k("idmail") });
  const idOrg = h("span", { class: k("orgname") });
  const idRole = h("span", { class: k("rolepill") });
  const stat = (label) => { const v = h("span", { class: k("statv") }, "—"); return { v, node: h("div", { class: k("stat") }, v, h("span", { class: k("statl") }, label)) }; };
  const stU = stat("ÜYE"), stUp = stat("YAKLAŞAN"), stPast = stat("GEÇMİŞ");
  const identity = h("section", { class: k("id"), "aria-label": "Kimlik" },
    idAv, idName, idMail,
    h("span", { class: k("orgbadge") }, ico("building", 14, { color: PINK }), idOrg, idRole),
    h("div", { class: k("stats") }, stU.node, stUp.node, stPast.node));

  const menuRow = ({ icon, label, href, onClick, danger }) => {
    const inner = [h("span", { class: k("mtile") }, ico(icon, 16, { color: danger ? "#FF5A6E" : "#A3A7AF" })), h("span", { class: k("mlabel") }, label),
      danger ? null : h("span", { class: k("mchev") }, ico("chevR", 16))];
    const cls = cx(k("mrow"), danger && "is-danger", "dk-row");
    return href ? h("a", { href, class: cls }, ...inner) : h("button", { type: "button", class: cls, onclick: onClick }, ...inner);
  };
  const menu = h("nav", { class: k("menu"), "aria-label": "Hesap" },
    h("div", { class: k("mhead") }, h("span", {}, "HESAP")),
    menuRow({ icon: "people", label: "Ekip", href: "#/organizer/ekip" }),
    menuRow({ icon: "bell", label: "Bildirimler", href: "#/organizer/bildirim" }),
    menuRow({ icon: "mail", label: "E-posta Değiştir", onClick: () => openEmail() }),
    menuRow({ icon: "key", label: "Şifre Değiştir", onClick: () => openPass() }),
    menuRow({ icon: "trash", label: "Hesabımı Sil", danger: true, onClick: () => openDelete() }),
    menuRow({ icon: "logout", label: "Çıkış Yap", danger: true, onClick: () => askLogout() }));
  const aside = h("aside", { class: k("aside") }, identity, menu);

  root.append(hero, h("div", { class: k("cols") }, h("div", { class: k("left") }, infoCard, socialCard, pastSec), aside));

  // ══════════ ÇİZİM ══════════
  const photoNow = () => (pendingUrl || (removePhoto ? null : p.photoURL) || null);
  function drawLogo() {
    const src = photoNow();
    logoAv.replaceChildren(src
      ? dkAvatar({ photo: src, size: 88, alt: "Organizasyon fotoğrafı", cls: k("logoimg") })
      : h("span", { class: k("logofb"), "aria-hidden": "true" }, ico("building", 34, { color: "#06070A", sw: "1.8" })));
    removeBtn.hidden = !src;
  }
  function drawIdentity() {
    idAv.replaceChildren(p.photoURL
      ? dkAvatar({ photo: p.photoURL, size: 88, alt: "" })
      : h("span", { class: k("idfb"), "aria-hidden": "true" }, ico("person", 36, { color: "#F2F1EE", sw: "1.8" })));
    idName.textContent = p.displayName || "Organizatör";
    idMail.textContent = p.email || s.user?.email || "";
    idMail.hidden = !idMail.textContent;
    idOrg.textContent = p.orgName || "Organizasyonunuz";
    const own = (p.orgRole || "owner") !== "staff";
    idRole.textContent = own ? "Sahip" : "Personel";
    idRole.classList.toggle("is-staff", !own);
  }
  function posterCard(e) {
    const img = e.bannerUrl
      ? h("img", { src: e.bannerUrl, alt: "", loading: "lazy", decoding: "async", class: k("pimg") })
      : h("span", { class: k("pfb"), "aria-hidden": "true" }, ico("calendar", 28, { color: "#5E636D", sw: "1.8" }));
    if (e.bannerUrl) img.addEventListener("error", () => img.replaceWith(h("span", { class: k("pfb"), "aria-hidden": "true" }, ico("calendar", 28, { color: "#5E636D", sw: "1.8" }))), { once: true });
    const when = dmy(eventStartMs(e) ?? toMs(e.date));
    return h("a", { href: PAST_HREF, class: cx(k("pcard"), "dk-card") },
      img, h("span", { class: k("pscrim") }),
      h("span", { class: k("pbadge") }, dkStatusBadge("past", { variant: "pill" })),
      h("span", { class: k("ptext") },
        h("span", { class: k("ptitle") }, e.title || "Etkinlik"),
        h("span", { class: k("pmeta") }, [e.venueName, when].filter(Boolean).join(" · ") || "—")));
  }
  function drawPast(state, list) {
    if (state === "loading") { pastGrid.replaceChildren(dkSkeleton({ h: 180, r: 12 }), dkSkeleton({ h: 180, r: 12 })); pastGrid.setAttribute("aria-busy", "true"); return; }
    pastGrid.removeAttribute("aria-busy");
    if (state === "error") { pastGrid.replaceChildren(h("p", { class: k("pempty") }, "Geçmiş etkinlikler yüklenemedi.")); return; }
    if (!list.length) { pastGrid.replaceChildren(h("p", { class: k("pempty") }, ico("calendar", 18, { color: "#5E636D" }), "Henüz geçmiş etkinlik yok.")); return; }
    pastGrid.replaceChildren(...list.map(posterCard));
  }

  async function loadStats() {
    drawPast("loading");
    const [ev, mem] = await Promise.allSettled([organizerEvents(orgId), orgMembers(orgId)]);
    if (!alive) return;
    if (mem.status === "fulfilled") stU.v.textContent = String((mem.value || []).length);
    if (ev.status === "fulfilled") {
      const events = ev.value || [];
      const past = events.filter(isPastEv).sort((a, b) => (eventStartMs(b) ?? 0) - (eventStartMs(a) ?? 0));
      stUp.v.textContent = String(upcomingCount(events));
      stPast.v.textContent = String(past.length);
      drawPast("ok", past.slice(0, 2));
    } else drawPast("error");
  }

  // ══════════ FOTOĞRAF ══════════
  uploadBtn.addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = "";
    if (!f) return;
    const blob = await cropImage(f, { aspect: 1, round: true });
    if (!alive) return;
    // kırpıcı (#modal-root) kapanınca odak gövdeye düşer → "Logo yükle"ye geri
    requestAnimationFrame(() => { if (uploadBtn.isConnected) uploadBtn.focus({ preventScroll: true }); });
    if (!blob) return;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingBlob = blob; pendingUrl = URL.createObjectURL(blob); removePhoto = false;
    drawLogo();
  });
  removeBtn.addEventListener("click", () => {
    if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; pendingBlob = null; }
    else removePhoto = true;   // kayıtta photoURL: null
    drawLogo();
    uploadBtn.focus();
  });

  // ══════════ KAYDET ══════════
  const setErr = (m) => { errEl.textContent = m || ""; };
  [orgIn, cityIn, phoneIn, bioIn, ...Object.values(S).map((x) => x.inp)].forEach((x) => x.addEventListener("input", () => setErr("")));
  // Sosyal/web değerleri: kullanıcı adı ya da http(s) bağlantısı (sanatçı social + mekan website ile aynı sözleşme; okuyucular
  // şemasız değeri kendisi https://… yapar). Başka şema (javascript:, data: …) kaydedilmez — "alan.com:8080" gibi port geçer.
  const badScheme = (v) => /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(v) && !/^https?:\/\//i.test(v);
  function setBusy(on) { saving = on; saveTop.dk.setBusy(on); saveForm.dk.setBusy(on); }
  async function save() {
    if (saving) return;
    if (dkLoginGate("Profili kaydetmek")) return;
    setErr("");
    const orgName = orgIn.value.trim();
    if (isOwner && !orgName) { setErr("Organizasyon adı gir"); orgIn.focus(); return; }
    // legacy patch şekli + (değiştiyse) yeni sosyal alanlar; displayName YAZILMAZ
    const patch = { city: cityIn.value.trim(), phone: phoneIn.value.trim(), bio: bioIn.value.trim(), ...(isOwner ? { orgName } : {}) };
    const bad = ["instagram", "website", "youtube", "spotify"].find((key) => badScheme(S[key].inp.value.trim()));
    if (bad) { setErr("Bağlantı http:// ya da https:// ile başlamalı."); S[bad].inp.focus(); return; }
    const curSoc = p.social || {};
    ["instagram", "youtube", "spotify"].forEach((key) => { const v = S[key].inp.value.trim(); if ((curSoc[key] || "") !== v) patch[`social.${key}`] = v; });
    const web = S.website.inp.value.trim();
    if ((p.website || "") !== web) patch.website = web;
    const org = isOwner && p.orgId && orgName !== p.orgName ? { orgId: p.orgId, name: orgName } : null;
    setBusy(true);
    try {
      if (pendingBlob) patch.photoURL = await uploadImage(pendingBlob, uid);
      else if (removePhoto && p.photoURL) patch.photoURL = null;
      await saveOrganizerProfile(uid, patch, org);
      if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
      pendingBlob = null; removePhoto = false;
      await refreshProfile();
      if (!alive) return;
      p = session.profile || p;
      drawLogo(); drawIdentity(); patchShellIdentity();
      dkToast("Profil kaydedildi");
    } catch (_) {
      if (alive) setErr("Kaydedilemedi.");
    } finally {
      if (alive) setBusy(false);
    }
  }

  // SHARED-CANDIDATE: panelShell'de kimlik güncelleme API'si yok (setIdentity) — yeniden kurmak formu/kaydırmayı sıfırlar →
  // kabuğun kendi düğümlerinde yerel yama (kullanıcı kartı adı + avatarı, üst bar avatarı).
  function patchShellIdentity() {
    const u1 = shell.aside?.querySelector(".dk-ps-u1");
    if (u1) u1.textContent = p.orgName || p.displayName || "Organizasyonunuz";
    const mk = (size, iconSize) => (p.photoURL ? dkAvatar({ photo: p.photoURL, size, type: "organizer" }) : dkAvatar({ size, type: "organizer", icon: "building", iconSize }));
    const cardAv = shell.aside?.querySelector(".dk-ps-user > .dk-av");
    if (cardAv) cardAv.replaceWith(mk(36, 17));
    const topAv = shell.topbar?.querySelector(".dk-ps-av");
    if (topAv) topAv.replaceChildren(mk(36, 16));
  }

  // ══════════ HESAP MODALLARI (legacy auth.js akışı + metinleri; org form modalı F5) ══════════
  const mdlCls = k("mdl");
  const okLine = () => { const el = h("div", { class: k("ok") }); el.hidden = true; return el; };
  const setOk = (el, text) => { el.replaceChildren(dkInlineMessage("ok", text)); el.hidden = false; };
  function googleOnlyModal(title, text) {
    dkModal({ variant: "form", size: 482, align: "top", top: 180, cls: mdlCls, title, sub: text, actions: [{ label: "Kapat", variant: "outline" }] });
  }
  function openEmail() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) return googleOnlyModal("E-posta Değiştir", "Google ile giriş yaptığın için e-posta adresin Google hesabına bağlıdır ve buradan değiştirilemez. E-postanı Google hesap ayarlarından güncelleyebilirsin.");
    const cur = dkInput({ id: uidOf("ce1"), type: "password", placeholder: "Şifreni gir", autocomplete: "current-password" });
    const nw = dkInput({ id: uidOf("ce2"), type: "email", placeholder: "yeni@email.com", autocomplete: "email" });
    const ok = okLine();
    let sent = false;
    const m = dkModal({
      variant: "form", size: 482, align: "top", top: 180, cls: mdlCls, title: "E-posta Değiştir", titleIcon: ico("mail", 20, { color: PINK }),
      sub: "Güvenlik için mevcut şifreni iste. Yeni adresine bir doğrulama bağlantısı göndereceğiz.",
      body: [dkField({ label: "Mevcut şifre", input: cur }).node, dkField({ label: "Yeni e-posta", input: nw }).node, ok],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Bağlantı Gönder", variant: "primary", busyLabel: "Gönderiliyor…", keepOpen: true, onClick: async (_c, btn) => {
          if (sent) return false;
          m.setError("");
          const pw = cur.value, em = nw.value.trim();
          if (!pw) { m.setError("Mevcut şifreni gir."); cur.focus(); return false; }
          if (!em) { m.setError("Yeni e-posta gir."); nw.focus(); return false; }
          if (em.toLowerCase() === (user?.email || "").toLowerCase()) { m.setError("Yeni e-posta mevcut adresinle aynı."); nw.focus(); return false; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
            await verifyBeforeUpdateEmail(user, em);
            sent = true;
            setOk(ok, "Doğrulama bağlantısı yeni e-postana gönderildi. Bağlantıya tıklayıp onayladıktan sonra yeni e-postanla giriş yapabilirsin.");
            setTimeout(() => { if (btn.isConnected) { btn.disabled = true; btn.querySelector(".dk-btn-l").textContent = "Gönderildi ✓"; } }, 0);
          } catch (err) { m.setError(trError(err && err.code)); }
          return false;
        } },
      ],
    });
    [cur, nw].forEach((x) => { x.addEventListener("input", () => m.setError("")); x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } }); });
  }
  function openPass() {
    const user = auth.currentUser;
    if (isGoogleOnly(user)) return googleOnlyModal("Şifre Değiştir", "Google ile giriş yaptığın için hesabında parola yok; şifren Google hesabına bağlıdır ve buradan değiştirilemez. Şifreni Google hesap ayarlarından güncelleyebilirsin.");
    const cur = dkInput({ id: uidOf("cp1"), type: "password", placeholder: "Şu anki şifren", autocomplete: "current-password" });
    const nw = dkInput({ id: uidOf("cp2"), type: "password", placeholder: "En az 6 karakter", autocomplete: "new-password" });
    const nw2 = dkInput({ id: uidOf("cp3"), type: "password", placeholder: "Yeni şifreni tekrar gir", autocomplete: "new-password" });
    const ok = okLine();
    let done = false;
    const reset = h("button", { type: "button", class: cx(k("reset"), "dk-link") }, "E-posta ile sıfırla");
    reset.addEventListener("click", async () => {
      reset.disabled = true; const old = reset.textContent; reset.textContent = "Gönderiliyor…";
      m.setError(""); ok.hidden = true;
      try {
        const rc = await recaptchaToken("password_reset");
        await requestPasswordReset(user.email, rc);
        setOk(ok, "Sıfırlama bağlantısı e-postana gönderildi. E-postandaki bağlantıdan yeni şifre belirle.");
      } catch (err) { m.setError(trError(err && err.code)); }
      finally { if (reset.isConnected) { reset.disabled = false; reset.textContent = old; } }
    });
    const m = dkModal({
      variant: "form", size: 482, align: "top", top: 160, cls: mdlCls, title: "Şifre Değiştir", titleIcon: ico("key", 20, { color: PINK }),
      sub: "Güvenlik için önce mevcut şifreni gir, sonra yeni şifreni belirle.",
      body: [dkField({ label: "Mevcut şifre", input: cur }).node, dkField({ label: "Yeni şifre", input: nw }).node, dkField({ label: "Yeni şifre (tekrar)", input: nw2 }).node,
        ok, h("p", { class: k("mnote") }, "Mevcut şifreni bilmiyor musun? ", reset)],
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Şifreyi Güncelle", variant: "primary", busyLabel: "Güncelleniyor…", keepOpen: true, onClick: async (_c, btn) => {
          if (done) return false;
          m.setError("");
          if (!cur.value) { m.setError("Mevcut şifreni gir."); cur.focus(); return false; }
          if (nw.value.length < 6) { m.setError("Yeni şifre en az 6 karakter olmalı."); nw.focus(); return false; }
          if (nw.value !== nw2.value) { m.setError("Yeni şifreler uyuşmuyor."); nw2.focus(); return false; }
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur.value));
            await updatePassword(user, nw.value);
            done = true;
            setOk(ok, "Şifren güncellendi. Bir dahaki girişte yeni şifreni kullan.");
            setTimeout(() => { if (btn.isConnected) { btn.disabled = true; btn.querySelector(".dk-btn-l").textContent = "Güncellendi ✓"; } }, 0);
          } catch (err) { m.setError(trError(err && err.code)); }
          return false;
        } },
      ],
    });
    [cur, nw, nw2].forEach((x) => { x.addEventListener("input", () => m.setError("")); x.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } }); });
  }
  function openDelete() {
    dkModal({
      variant: "confirm", size: 420, cls: cx(mdlCls, k("cfm")), title: "Hesabımı Sil",
      body: h("div", { class: k("cbody") },
        h("p", { class: "dk-mdl-p" }, "Hesabın silinmek üzere işaretlenecek. 3 ay boyunca profilin ve içeriklerin görünür kalır."),
        h("p", { class: "dk-mdl-p" }, "Bu süre içinde tekrar giriş yaparsan silme talebin otomatik iptal edilir. 3 ay boyunca hiç giriş yapmazsan hesabın ve tüm verilerin kalıcı olarak silinir.")),
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Hesabımı Sil", variant: "danger", icon: ico("trash", 15, { color: "#06070A", sw: "2.2" }), busyLabel: "İşleniyor…", onClick: async () => {
          try {
            await scheduleAccountDeletion();
            location.hash = "#/";
            dkToast("Hesabın silinmek üzere işaretlendi. 3 ay içinde giriş yaparsan geri alınır.");
            return true;
          } catch (_) {
            dkToast("İşlem başarısız. İnternetini kontrol edip tekrar dene.", { type: "err" });
            return false;
          }
        } },
      ],
    });
  }
  function askLogout() {
    dkModal({
      variant: "confirm", size: 420, cls: cx(mdlCls, k("cfm")), title: "Çıkış Yap",
      sub: "Hesabınızdan çıkmak istediğinize emin misiniz?",
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Çıkış Yap", variant: "danger", icon: ico("logout", 15, { color: "#06070A", sw: "2.2" }), onClick: () => { logout(); return true; } },
      ],
    });
  }

  // ══════════ ilk durum ══════════
  drawLogo(); drawIdentity();
  loadStats();

  return {
    node: shell.node,
    destroy() {
      alive = false;
      if (pendingUrl) { try { URL.revokeObjectURL(pendingUrl); } catch (_) {} }
      shell.destroy();
    },
    // Aynı kimlik ve aynı organizasyon rolü → yerinde kal (form taslağı/kaydırma korunur; kimlik kartı + kabuk güncellenir);
    // organizasyon ya da rol değiştiyse (kilit durumu değişir) yeniden kur.
    onSession(ns) {
      if (ns?.user?.uid !== uid) return false;
      const np = ns.profile || {};
      if ((np.orgId || uid) !== orgId || ((np.orgRole || "owner") !== "staff") !== isOwner) return false;
      p = np;
      drawIdentity(); drawLogo(); patchShellIdentity();
      return true;
    },
  };
}
