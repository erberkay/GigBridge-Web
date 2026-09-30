// WebRolSec — "Hesabını tamamla" (≥769 px), rota #/setup. Google ile ilk kez giriş yapan ve users/{uid} profili olmayan
// kullanıcı buraya gelir (router: homeRouteFor(null) = #/setup). Spec: specs/auth.md WebRolSec. Artboard: WebRolSec (1440×900).
// CSS: css/dk-rol-sec.css. ≤768: legacy setup() AYNEN.
//
// Yazım legacy setup() ile BİREBİR aynı şekil (termsAcceptedAt YOK — spec §8 "consent gap" sahibi kararı bekliyor):
//   setDoc(users/{uid}, { displayName, email, userType, photoURL: u.photoURL ?? null, createdAt: serverTimestamp(),
//   venue|organizer → approved:false, organizer → orgName, artist|venue + şehir → city }) → refreshProfile() → router
//   homeRouteFor ile yönlendirir (dinleyici #/kesfet · sanatçı #/artist · mekan/organizatör #/pending). Router yayında hemen
//   yönlendirdiği için artboard'daki yeşil "sonraki adım" düğmesi gösterilmez (spec §6 seçenek a).
import { h } from "../../ui.js";
import { db, doc, setDoc, serverTimestamp } from "../../firebase.js";
import { session, refreshProfile, logout } from "../../store.js";
import { svgRaw } from "../shared/icons.js";
import { uid, dkLabel, dkInput, dkButton } from "../shared/ui.js";
import { authSplit, authTopLink, authHeading } from "../shared/auth-shell.js";
import { AUTH_ASIDE } from "../shared/assets.js";
import { PROVINCES, trUpper, initials } from "../shared/helpers.js";
import { statusRegion, wireRadioGroup, shieldCheckIcon, refocusIfLost, ROLE_KEYS, ROLE_META, roleIcon, roleVars, readPendingRole, clearPendingRole } from "./giris.js";

const GOOGLE_G = '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"></path><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"></path><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"></path><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"></path>';

const isGoogleUser = (u) => !!u?.providerData?.some((p) => p && p.providerId === "google.com");
// Artboard metni Google ile gelen kullanıcı içindir; Google sağlayıcısı olmayan (ör. e-posta ile kayıt olup profili yazılamamış)
// hesapta "Google ile giriş yaptın" yanlış olur → nötr metin (sahibi onayı bekliyor).
const LEAD_GOOGLE = "Google ile giriş yaptın. Rolünü seç ve bilgilerini gir.";
const LEAD_PLAIN = "Rolünü seç ve bilgilerini gir.";

// AccountChip (artboard: 36 yük., r18, 28'lik baş harf avatarı cyan→#0369A1 + e-posta + Google "G" — yalnız google.com sağlayıcısında)
function accountChip(u, google) {
  const email = u?.email || "";
  const ini = initials(u?.displayName || email, 1) || "?";
  const g = google ? svgRaw(GOOGLE_G, { size: 14, label: "Google hesabı", attrs: { fill: null } }) : null;
  if (g) { g.removeAttribute("stroke"); g.removeAttribute("stroke-width"); g.removeAttribute("fill"); }
  return h("span", { class: "dk-rol-sec-chip", title: email || null },
    h("span", { class: "dk-rol-sec-av", "aria-hidden": "true" }, ini),
    h("span", { class: "dk-rol-sec-email" }, email),
    g);
}

export function rolSecView(/* ctx */) {
  const u = session.user;
  const google = isGoogleUser(u);
  const st = { role: readPendingRole() || "customer" };
  let alive = true, busy = false;
  const R = () => ROLE_META[st.role];

  // ── rol satırları (RoleOption row) ──
  const rows = ROLE_KEYS.map((k) => {
    const M = ROLE_META[k];
    return h("button", { type: "button", role: "radio", "aria-checked": "false", class: "dk-rol-sec-row", style: roleVars(k), onclick: () => pick(k) },
      h("span", { class: "dk-rol-sec-bar", "aria-hidden": "true" }),
      h("span", { class: "dk-rol-sec-ico" }, roleIcon(k, 22)),
      h("span", { class: "dk-rol-sec-txt" },
        h("span", { class: "dk-rol-sec-top" }, h("span", { class: "dk-rol-sec-l" }, M.label), M.approval ? h("span", { class: "dk-rol-sec-tag" }, "YÖNETİCİ ONAYI") : null),
        h("span", { class: "dk-rol-sec-d" }, M.desc)),
      h("span", { class: "dk-rol-sec-ring", "aria-hidden": "true" }, h("span", { class: "dk-rol-sec-dot" })));
  });
  const syncTab = wireRadioGroup(rows, (i) => pick(ROLE_KEYS[i]));

  // ── form ──
  const listId = uid("rs-cities");
  const nameLabel = dkLabel(R().nameLabel, { for: "rs-name" });
  const nameInp = dkInput({ id: "rs-name", autocomplete: "name", placeholder: "Adın", value: u?.displayName || "" }); // Google adıyla önceden dolu
  const cityInp = dkInput({ id: "rs-city", autocomplete: "address-level1", placeholder: "Örn. İstanbul", attrs: { list: listId } });
  const nameFld = h("div", { class: "dk-rol-sec-fld" }, nameLabel, nameInp);
  const cityFld = h("div", { class: "dk-rol-sec-fld" }, dkLabel("Şehir", { for: "rs-city" }), cityInp,
    h("datalist", { id: listId }, ...PROVINCES.map((p) => h("option", { value: p }))));
  const grid = h("div", { class: "dk-rol-sec-grid" }, nameFld);
  const status = statusRegion("dk-rol-sec-status");
  const submitBtn = dkButton("Hesabı tamamla", { variant: "primary", size: 48, full: true, type: "submit", busyLabel: "Kaydediliyor…" });
  let note = null;

  const setNameErr = (on) => { if (on) nameInp.setAttribute("aria-invalid", "true"); else nameInp.removeAttribute("aria-invalid"); };

  function sync() {
    rows.forEach((r, i) => r.setAttribute("aria-checked", ROLE_KEYS[i] === st.role ? "true" : "false"));
    syncTab();
    nameLabel.textContent = trUpper(R().nameLabel);
    // Şehir yalnız sanatçı + mekan (ızgara 1 ↔ 2 kolon); yazılan şehir rol değişiminde korunur
    if (R().city) { if (!cityFld.isConnected) grid.append(cityFld); } else cityFld.remove();
    grid.classList.toggle("is-2", R().city);
    // Onay notu (mekan/organizatör) — artboard sc-if + gbMsg; mekan↔organizatör geçişinde yalnız metin/renk
    if (R().approval) {
      const txt = R().label + " hesapları yönetici onayından sonra açılır. Hesabını tamamlayınca başvurun incelemeye alınır.";
      if (!note) { note = h("div", { class: "dk-rol-sec-note dk-msg" }, shieldCheckIcon(16, R().c), h("span", {}, txt)); grid.after(note); }
      else { note.firstChild.replaceWith(shieldCheckIcon(16, R().c)); note.lastChild.textContent = txt; }
      note.setAttribute("style", `--rc:${R().c};--rc-rgb:${R().rgb}`);
    } else if (note) { note.remove(); note = null; }
  }
  function pick(k) {
    if (busy || st.role === k) return;
    st.role = k;
    status.clear(); setNameErr(false); // artboard pick: err temizlenir
    sync();
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    status.clear(); setNameErr(false);
    const user = session.user;
    if (!user) { status.set("err", "Oturum bulunamadı, tekrar giriş yap."); return; }
    const role = st.role;
    const name = nameInp.value.trim();
    const city = cityInp.value.trim();
    if (!name) { status.set("err", ROLE_META[role].nameErr); setNameErr(true); return; }
    const needsApproval = role === "venue" || role === "organizer";
    busy = true; submitBtn.dk.setBusy(true, "Kaydediliyor…");
    try {
      await setDoc(doc(db, "users", user.uid), {
        displayName: name, email: user.email, userType: role, photoURL: user.photoURL ?? null,
        createdAt: serverTimestamp(),
        ...(needsApproval ? { approved: false } : {}), // müşteri/sanatçı onay gerektirmez
        ...(role === "organizer" ? { orgName: name } : {}),
        ...((role === "venue" || role === "artist") && city ? { city } : {}),
      });
      clearPendingRole();
      await refreshProfile(); // emit → router: homeRouteFor(profile)
    } catch (_) {
      busy = false;
      if (!alive) return;
      submitBtn.dk.setBusy(false);
      status.set("err", "Kaydedilemedi. Tekrar dene.");
      refocusIfLost(form, submitBtn); // meşgul düğme odağı <body>'ye düşürdüyse
    }
  }

  const form = h("form", { class: "dk-rol-sec-form", "aria-label": "Hesap bilgileri", novalidate: true, onsubmit: onSubmit },
    grid, status.node, submitBtn);

  const s = authSplit({
    variant: "default",
    image: AUTH_ASIDE.setup,
    top: {
      left: accountChip(u, google),
      right: authTopLink("Çıkış / farklı hesapla gir", { icon: "logout", href: "#/login", onClick: () => logout("#/login") }),
    },
    width: 460, gap: 18,
    children: [
      authHeading({ eyebrow: "SON BİR ADIM", title: "Hesabını ", em: "tamamla", lead: google ? LEAD_GOOGLE : LEAD_PLAIN, size: 50 }),
      h("div", { class: "dk-rol-sec-list", role: "radiogroup", "aria-label": "Rol" }, ...rows),
      form,
    ],
  });
  s.column.classList.add("dk-rol-sec");
  sync();

  return {
    node: s.node,
    destroy() { alive = false; s.destroy(); },
    update() {},
    onSession: () => true, // aynı kimlikte yayın (ör. token/profil tazeleme): seçim ve yazılanlar korunur
  };
}
