// WebKayit — masaüstü kayıt (≥769 px), rota #/register (?rol=customer|artist|venue|organizer ön seçim).
// Spec: specs/auth.md WebKayit (+ §0). Artboard: WebKayit (1440×1040). CSS: css/dk-kayit.css. ≤768: legacy register()/registerModal().
//
// 2 adım aynı ekranda (owner notu): 1) hesap tipi (kart seçilir, "… olarak devam et" ilerler) 2) bilgiler.
// Doğrulama sırası legacy ile aynı: ad → e-posta → şifre ≥ 6 → şifreler aynı → (YENİ) KVKK/Kullanım Koşulları onayı.
// Kayıt (legacy register() ile AYNI yazım + YENİ termsAcceptedAt): createUserWithEmailAndPassword → updateProfile(displayName)
// → setDoc(users/{uid}) (venue/organizer → approved:false, organizer → orgName, artist/venue + şehir → city) →
// sendEmailVerification → #/verify. Router, Auth kullanıcısı oluşur oluşmaz (doğrulanmamış) #/verify'a geçer; akış kapanışta
// sürer (legacy ile aynı). Tasarımdaki "Hesabın oluşturuldu" paneli bu yüzden gösterilmez (owner notu: başarı → #/verify).
import { h } from "../../ui.js";
import {
  auth, db, doc, setDoc, serverTimestamp,
  createUserWithEmailAndPassword, updateProfile, sendEmailVerification,
} from "../../firebase.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { uid, dkLabel, dkInput, dkButton, dkOrDivider } from "../shared/ui.js";
import { authSplit, authTopLink, authGoogleButton } from "../shared/auth-shell.js";
import { PROVINCES, trUpper, writeQuery } from "../shared/helpers.js";
import { LEGAL } from "../shared/assets.js";
import {
  trError, googleSignIn, statusRegion, wireRadioGroup, shieldCheckIcon, refocusIfLost,
  ROLE_KEYS, ROLE_META, roleIcon, roleVars, setPendingRole, clearPendingRole,
} from "./giris.js";

const INFO_ICON = '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5.5M12 7.5v.01"></path>';
const KVKK_HREF = LEGAL.privacy + "#kvkk"; // "Gizlilik Politikası ve Aydınlatma Metni" (ayrı KVKK sayfası yok — foundation §8.15)
const validRole = (r) => (ROLE_KEYS.includes(r) ? r : null);

// WebDogrula 60 sn geri sayımı (localStorage gb_verify_sent_at). Router, Auth kullanıcısı oluşur oluşmaz #/verify'a geçip
// WebDogrula'yı bağlar ve süreyi YALNIZ bağlanırken okur → zaman damgası createUser'dan ÖNCE yazılır (geri sayım görünür);
// gönderim olmazsa geri alınır: hesap hiç oluşmadıysa (createUser hatası) önceki değere dönülür; hesap oluştu ama e-posta
// gitmediyse (setDoc/sendEmailVerification hatası) anahtar silinir → WebDogrula'nın saniyelik yenilemesi bunu okur ve
// "Tekrar gönder" hemen açılır.
const VERIFY_SENT_KEY = "gb_verify_sent_at";
function armVerifyCountdown() {
  let prev = null;
  try { prev = localStorage.getItem(VERIFY_SENT_KEY); localStorage.setItem(VERIFY_SENT_KEY, String(Date.now())); } catch (_) {}
  return function disarm({ accountCreated = false } = {}) {
    try {
      if (accountCreated || prev == null) localStorage.removeItem(VERIFY_SENT_KEY);
      else localStorage.setItem(VERIFY_SENT_KEY, prev);
    } catch (_) {}
  };
}

export function kayitView(ctx) {
  // ── görünüm durumu (adım değişiminde yazılanlar korunur — DCLogic ile aynı) ──
  const st = { step: 1, role: validRole(ctx.query?.get("rol")) || "customer", name: "", email: "", pass: "", pass2: "", city: "", kvkk: false };
  let alive = true, busy = false, gBusy = false;
  const R = () => ROLE_META[st.role];

  // ── adım başlığı (iki adımda da kalıcı; geri düğmesi yalnız 2. adımda) ──
  const backBtn = h("button", { type: "button", class: "dk-kayit-back dk-press", "aria-label": "Hesap tipine geri dön", onclick: () => goStep(1) },
    svgIcon("chevronLeft", { size: 18, sw: "2" }));
  const stepLabel = h("span", { class: "dk-kayit-stepl" });
  const bar2 = h("span", { class: "dk-kayit-bar" });
  const steps = h("div", { class: "dk-kayit-steps" }, backBtn, stepLabel,
    h("span", { class: "dk-kayit-bars", "aria-hidden": "true" }, h("span", { class: "dk-kayit-bar is-on" }), bar2));
  const body = h("div", { class: "dk-kayit-body" });

  // ══ 1. adım: hesap tipi ══
  let s1 = null;
  function buildStep1() {
    const tiles = ROLE_KEYS.map((k) => {
      const M = ROLE_META[k];
      return h("button", { type: "button", role: "radio", "aria-checked": "false", class: "dk-kayit-tile", style: roleVars(k), onclick: () => pick(k) },
        h("span", { class: "dk-kayit-tico" }, roleIcon(k, 20)),
        h("span", { class: "dk-kayit-ring", "aria-hidden": "true" }, h("span", { class: "dk-kayit-dot" })),
        h("span", { class: "dk-kayit-tl" }, M.label),
        h("span", { class: "dk-kayit-td" }, M.desc),
        M.approval ? h("span", { class: "dk-kayit-pill" }, svgRaw('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"></path>', { size: 11, sw: "2.2" }), "YÖNETİCİ ONAYI GEREKİR") : null);
    });
    const next = dkButton("", { variant: "primary", size: 48, full: true, iconRight: "arrowRight", iconSize: 16, onClick: () => goStep(2) });
    const node = h("div", { class: "dk-kayit-s1 dk-rise" },
      h("div", { class: "dk-kayit-head" },
        h("h1", { class: "dk-display dk-t52" }, "Hesap tipini ", h("em", {}, "seç")),
        h("p", { class: "dk-kayit-lead" }, "Platforma nasıl katılmak istiyorsun? Rolün, sana açılacak paneli belirler.")),
      h("div", { class: "dk-kayit-grid", role: "radiogroup", "aria-label": "Hesap tipi" }, ...tiles),
      next);
    const syncTab = wireRadioGroup(tiles, (i) => pick(ROLE_KEYS[i]));
    // onay bilgisi (yalnız mekan/organizatör) — artboard sc-if: yokken DOM'da değil (flex boşluğu kaplamaz), her
    // görünüşte gbMsg animasyonu; mekan↔organizatör geçişinde yalnız metin/renk güncellenir (React uzlaştırması gibi)
    let info = null;
    const infoIco = () => svgRaw(INFO_ICON, { size: 18, sw: "2", color: R().c });
    const infoText = () => R().label + " hesapları GigBridge ekibinin onayından sonra açılır. Kayıttan sonra başvurun incelenir; onaylanınca panelin ve uygulama girişin aktif olur.";
    const sync = () => {
      tiles.forEach((t, i) => t.setAttribute("aria-checked", ROLE_KEYS[i] === st.role ? "true" : "false"));
      syncTab();
      next.dk.setLabel(R().label + " olarak devam et");
      if (R().approval) {
        if (!info) { info = h("div", { class: "dk-kayit-info dk-msg" }, infoIco(), h("span", {}, infoText())); next.before(info); }
        else { info.firstChild.replaceWith(infoIco()); info.lastChild.textContent = infoText(); }
      } else if (info) { info.remove(); info = null; }
    };
    return { node, sync, focusFirst: () => (tiles.find((t) => t.getAttribute("aria-checked") === "true") || tiles[0]).focus() };
  }

  // ══ 2. adım: bilgiler ══
  let s2 = null;
  function buildStep2() {
    const M = R();
    const status = statusRegion("dk-kayit-status");
    const inp = (id, o) => dkInput({ id, size: 48, ...o });
    const name = inp("rk-name", { autocomplete: "name", placeholder: M.namePh, value: st.name, onInput: (v) => { st.name = v; } });
    const email = inp("rk-email", { type: "email", autocomplete: "email", placeholder: "ornek@email.com", value: st.email, onInput: (v) => { st.email = v; } });
    const pass = inp("rk-pass", { type: "password", autocomplete: "new-password", placeholder: "En az 6 karakter", value: st.pass, onInput: (v) => { st.pass = v; }, attrs: { "aria-describedby": "rk-passhint" } });
    const pass2 = inp("rk-pass2", { type: "password", autocomplete: "new-password", placeholder: "Tekrar gir", value: st.pass2, onInput: (v) => { st.pass2 = v; } });
    const fld = (label, id, control) => h("div", { class: "dk-kayit-fld" }, dkLabel(label, { for: id }), control);

    let city = null, cityBlock = null;
    if (M.city) {
      const listId = uid("rk-cities");
      city = inp("rk-city", { autocomplete: "address-level1", placeholder: "Örn. İstanbul", value: st.city, cls: "dk-kayit-cityinp", attrs: { list: listId }, onInput: (v) => { st.city = v; } });
      cityBlock = fld("Şehir", "rk-city", h("div", { class: "dk-kayit-city" },
        city,
        svgIcon("pin", { size: 16, sw: "2", color: "#4ED8FF", cls: "dk-kayit-city-pin" }),
        svgIcon("chevronDown", { size: 16, sw: "2", color: "#8A8E97", cls: "dk-kayit-city-chev" }),
        h("datalist", { id: listId }, ...PROVINCES.map((p) => h("option", { value: p })))));
    }

    const kvkk = h("input", { type: "checkbox", class: "dk-kayit-chk", onchange: (e) => { st.kvkk = e.target.checked; } });
    kvkk.checked = st.kvkk;
    const legalLink = (href, t) => h("a", { href, target: "_blank", rel: "noopener", class: "dk-kayit-consent-a" }, t);
    const consent = h("label", { class: "dk-kayit-consent" }, kvkk,
      h("span", {}, legalLink(LEGAL.terms, "Kullanım Koşulları"), "'nı ve ", legalLink(KVKK_HREF, "KVKK Aydınlatma Metni"), "'ni okudum, kabul ediyorum."));

    const submit = dkButton("Kayıt ol", { variant: "primary", size: 48, full: true, type: "submit", busyLabel: "Gönderiliyor…" });
    const gBtn = authGoogleButton("Google ile kayıt ol", () => onGoogle());
    const fields = { name, email, pass, pass2 };

    const markErr = (f) => {
      Object.entries(fields).forEach(([k, el]) => { if (k === f) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid"); });
      if (f === "kvkk") kvkk.setAttribute("aria-invalid", "true"); else kvkk.removeAttribute("aria-invalid");
    };
    // hata: durum bölgesi (role=status) duyurur + ilgili alan aria-invalid/kırmızı kenar (artboard: odak taşınmaz)
    const showErr = (f, text) => { status.set("err", text); markErr(f); };
    const clearErr = () => { status.clear(); markErr(null); };

    async function onSubmit(e) {
      e.preventDefault();
      if (busy) return;
      clearErr();
      const role = st.role;
      const nm = name.value.trim(), em = email.value.trim(), pw = pass.value, pw2 = pass2.value, ct = (city?.value || "").trim();
      if (!nm) return showErr("name", ROLE_META[role].nameErr);
      if (!em) return showErr("email", "E-posta gir.");
      if (pw.length < 6) return showErr("pass", "Şifre en az 6 karakter olmalı.");
      if (pw !== pw2) return showErr("pass2", "Şifreler uyuşmuyor.");
      if (!kvkk.checked) return showErr("kvkk", "Devam etmek için Kullanım Koşulları ve KVKK Aydınlatma Metni’ni onayla.");
      busy = true; submit.dk.setBusy(true, "Gönderiliyor…");
      const disarm = armVerifyCountdown();
      let created = false;
      try {
        const { user } = await createUserWithEmailAndPassword(auth, em, pw);
        created = true;
        try { await updateProfile(user, { displayName: nm }); } catch (_) {}
        await setDoc(doc(db, "users", user.uid), {
          displayName: nm, email: user.email, userType: role, photoURL: null,
          createdAt: serverTimestamp(),
          termsAcceptedAt: serverTimestamp(), // YENİ: KVKK / Kullanım Koşulları onay zamanı (owner notu)
          ...(role === "venue" || role === "organizer" ? { approved: false } : {}), // müşteri/sanatçı onay gerektirmez
          ...(role === "organizer" ? { orgName: nm } : {}),
          ...((role === "venue" || role === "artist") && ct ? { city: ct } : {}),
        });
        try { await sendEmailVerification(user); } catch (_) { disarm({ accountCreated: true }); } // doğrulama bağlantısı (gönderilemezse geri sayım yok)
        location.hash = "#/verify"; // önce e-posta doğrulama (router zaten oraya geçmiş olabilir)
      } catch (err) {
        disarm({ accountCreated: created });
        busy = false;
        if (!alive) return;
        submit.dk.setBusy(false);
        const code = err && err.code;
        status.set("err", trError(code));
        let target = submit;
        if (code === "auth/email-already-in-use" || code === "auth/invalid-email") { markErr("email"); target = email; }
        else if (code === "auth/weak-password") { markErr("pass"); target = pass; }
        refocusIfLost(form, target); // meşgul düğme odağı <body>'ye düşürdüyse
      }
    }

    async function onGoogle() {
      if (gBusy) return;
      gBusy = true; gBtn.disabled = true;
      clearErr();
      setPendingRole(st.role); // WebRolSec bu rolü ön seçer
      const r = await googleSignIn();
      gBusy = false;
      if (r.ok) return; // router: profil yoksa #/setup, varsa ev
      clearPendingRole(); // iptal/hata: bayat rol sonraki bir Google hesabına taşınmasın
      if (!alive) return;
      gBtn.disabled = false;
      if (r.error) status.set("err", r.error);
      refocusIfLost(form, gBtn);
    }

    const form = h("form", { class: "dk-kayit-form", "aria-label": "Kayıt formu", novalidate: true, onsubmit: onSubmit },
      fld(trUpper(M.nameLabel), "rk-name", name),
      fld("E-posta", "rk-email", email),
      h("div", { class: "dk-kayit-pwgrid" }, fld("Şifre", "rk-pass", pass), fld("Şifre tekrar", "rk-pass2", pass2)),
      h("span", { id: "rk-passhint", class: "dk-kayit-hint" }, "Uygulamadan giriş yaparken de bu şifreyi kullanacaksın."),
      cityBlock,
      M.approval ? h("div", { class: "dk-kayit-note", style: roleVars(M.key) }, shieldCheckIcon(16, M.c),
        h("span", {}, "Bu hesap tipi yönetici onayı gerektirir. E-postanı doğruladıktan sonra başvurun incelemeye alınır.")) : null,
      consent,
      status.node,
      submit,
      dkOrDivider(),
      gBtn);
    const node = h("div", { class: "dk-kayit-s2 dk-rise" },
      h("div", { class: "dk-kayit-head2" },
        h("h1", { class: "dk-display dk-t52" }, "Bilgilerini ", h("em", {}, "gir")),
        h("div", { class: "dk-kayit-rolerow" },
          h("span", { class: "dk-kayit-rpill", style: roleVars(M.key) }, roleIcon(M.key, 14, "2"), M.label),
          h("button", { type: "button", class: "dk-kayit-change", onclick: () => goStep(1) }, "Değiştir"))),
      form);
    return { node, focusFirst: () => name.focus() };
  }

  function renderHeader() {
    const two = st.step === 2;
    backBtn.hidden = !two;
    stepLabel.textContent = two ? "ADIM 2 / 2 · BİLGİLER" : "ADIM 1 / 2 · HESAP TİPİ";
    bar2.classList.toggle("is-on", two);
  }
  function goStep(n, { focus = true } = {}) {
    if (busy) return;
    st.step = n;
    renderHeader();
    if (n === 1) { s2 = null; s1 = buildStep1(); s1.sync(); body.replaceChildren(s1.node); if (focus) s1.focusFirst(); }
    else { s1 = null; s2 = buildStep2(); body.replaceChildren(s2.node); if (focus) s2.focusFirst(); }
  }
  function pick(k) {
    if (st.role === k) return;
    st.role = k;
    s1?.sync();
    try { writeQuery({ rol: k }); } catch (_) {} // paylaşılabilir ?rol= (replaceState → yeniden kurulum yok)
  }

  const right = h("span", { class: "dk-kayit-topr" }, "Zaten üye misin? ", h("a", { href: "#/login", class: "dk-kayit-topr-a" }, "Giriş yap"));
  const s = authSplit({
    variant: "default",
    top: { left: authTopLink("Keşfet'e dön", { href: "#/kesfet" }), right },
    width: 400, gap: 22, rise: false, // artboard: kolon değil adım blokları yükselir (gb-rise)
    children: [steps, body],
  });
  s.column.classList.add("dk-kayit");
  goStep(1, { focus: false });

  return {
    node: s.node,
    destroy() { alive = false; s.destroy(); }, // bekleyen kayıt akışı kapanışta sürer (legacy ile aynı)
    // ?rol= (paylaşılan bağlantı / geri-ileri): rolü uygula; 2. adımdaysa etiketler role göre yeniden kurulur
    update(query) {
      const r = validRole(query?.get("rol"));
      if (!r || r === st.role || busy) return;
      st.role = r;
      if (st.step === 1) s1?.sync(); else goStep(2, { focus: false });
    },
    onSession: () => true, // aynı kimlikte oturum yayını: yazılanları koru
  };
}
