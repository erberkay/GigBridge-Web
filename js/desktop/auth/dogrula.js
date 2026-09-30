// WebDogrula — "E-postanı doğrula" masaüstü görünümü (≥769 px). Registry anahtarı: dogrula (#/verify).
// Spec: specs/auth.md WebDogrula (+ §0 AuthSplit). Artboard: design/WebDogrula.dc.html. CSS: css/dk-dogrula.css (.dk-dogrula kökü = AuthColumn).
// Legacy karşılığı: js/pages/auth.js verify() (≤768 aynen kalır).
//
// Legacy özellikleri (korundu): "Doğruladım, devam et" → auth.currentUser.reload() → doğrulandıysa recheckEmailVerified()
// (emit → router rolüne göre: dinleyici #/kesfet, sanatçı #/artist, mekan/organizatör #/pending, profilsiz #/setup);
// değilse legacy hata metni. "Tekrar gönder" → sendEmailVerification (too-many-requests / genel hata / oturum yok metinleri aynen).
// "Çıkış yap" → logout(). Kullanıcının e-postası (session.user.email) → e-posta kartı.
// Yeni (sahibi notu + tasarım): 60 sn geri sayım (localStorage.gb_verify_sent_at — kayıt ve her başarılı gönderimde yazılır),
// sekme tekrar görünür olunca (visibilitychange) sessiz bir kontrol (yalnız başarıda tepki), doğrulandı durumu (yeşil "Devam et";
// ~1.6 sn sonra kendiliğinden devam eder), numaralı adımlar, "GÖNDERİLDİ" rozeti, "Farklı e-postayla kaydol" (önce çıkış → #/register).
// Bilinçli sapma: artboard'daki üst-sol "Keşfet'e dön" GİZLİ — router doğrulanmamış kullanıcıyı her rotadan #/verify'a geri atıyor,
// bağlantı hiçbir şey yapmazdı (spec §6 varsayılanı; sahibi kararı bekleyen açık soru 4). Aynı nedenle logo (kenar görseli ≥1024 /
// marka satırı 769–1023) bağlantı DEĞİL (logoHref: null; legacy'de de marka bağlantı değildi) — yoksa #/kesfet'e gidip geri atılırdı.
// Klavye odağı: meşgul/geri sayım sırasında düğmeler `disabled` yerine aria-disabled olur (odak <body>'ye düşmez; görünüm aynı,
// tıklama korumaları JS'te); doğrulanınca odak yeşil "Devam et"e geçer.
//
// Veri: yalnız Firebase Auth (reload, sendEmailVerification) + store (recheckEmailVerified, logout). Firestore yazımı YOK.
import { h } from "../../ui.js";
import { session, logout, recheckEmailVerified } from "../../store.js";
import { auth, sendEmailVerification } from "../../firebase.js";
import { authSplit, authTopLink, authHeading } from "../shared/auth-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { uid, dkButton, dkInlineMessage } from "../shared/ui.js";
import { AUTH_ASIDE } from "../shared/assets.js";

const RESEND_S = 60;                       // sahibi notu: 60 sn geri sayım
const SENT_KEY = "gb_verify_sent_at";      // ms zaman damgası (WebKayit kayıtta yazar; burada her başarılı gönderimde)
const AUTO_ADVANCE_MS = 1600;              // doğrulandı durumunu gösterip devam et

// Artboard gövdeleri (birebir)
const SVG_CHECK_CIRCLE = '<circle cx="12" cy="12" r="9"></circle><path d="m8 12.5 2.8 2.8L16 10"></path>';
const SVG_AT = '<circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1"></path>';
const SVG_ERR = '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5v5.5M12 16.5v.01"></path>';

const T = {
  notYet: "E-posta henüz doğrulanmamış görünüyor. Gelen kutundaki bağlantıya tıkladıktan sonra tekrar dene.",
  resent: "Doğrulama e-postası tekrar gönderildi.",
  done: "E-postan doğrulandı. Hesabın hazır.",
  tooMany: "Çok sık denedin, biraz bekleyip tekrar dene.",
  sendFail: "Gönderilemedi, tekrar dene.",
  noUser: "Oturum bulunamadı, tekrar giriş yap.",
  hintWait: "Yeni bir e-posta isteyebilmek için süre dolmalı. Gelen kutunda göremiyorsan Spam / Gereksiz klasörüne bak.",
  hintReady: "Gelen kutunda göremiyorsan Spam / Gereksiz klasörüne bak ya da yeniden gönder.",
};
const STEPS = ["Gelen kutunu aç", "GigBridge e-postasındaki doğrulama bağlantısına tıkla", "Bu sayfaya dönüp “Doğruladım, devam et”e bas"];

function readSentAt() {
  try { const v = Number(localStorage.getItem(SENT_KEY)); return Number.isFinite(v) ? v : 0; } catch (_) { return 0; }
}
function markSent() {
  try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch (_) {}
}
// kalan saniye (0 = gönderilebilir); saat kayması → en çok 60
function remaining() {
  const at = readSentAt();
  if (!at) return 0;
  const left = Math.ceil(RESEND_S - (Date.now() - at) / 1000);
  return Math.max(0, Math.min(RESEND_S, left));
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function dogrulaView(ctx) {
  let destroyed = false;
  let verified = false;
  let userChecking = false;
  let sending = false;
  let going = false;
  let tick = null;
  let advanceT = null;
  let reloading = null;   // tek uçuşta reload (tık + visibilitychange aynı anda)

  const email = auth.currentUser?.email || session.user?.email || "";
  const hintId = uid("dg-resend");

  // ── durum bölgesi (her zaman DOM'da; boşken de bir kolon boşluğu kaplar — artboard ölçüsü) ──
  const status = h("div", { class: "dk-dogrula-status", role: "status", "aria-live": "polite" });
  // disabled yerine aria-disabled: odak düğmede kalır (disabled odaktaki düğmeyi bırakır → odak <body>'ye düşer)
  const softDisable = (el, on) => { el.removeAttribute("disabled"); if (on) el.setAttribute("aria-disabled", "true"); else el.removeAttribute("aria-disabled"); };
  const say = (kind, text) => {
    if (destroyed) return;
    status.replaceChildren(...(kind ? [dkInlineMessage(kind, text, kind === "err" ? { icon: SVG_ERR } : {})] : []));
  };

  // ── düğmeler ──
  const checkBtn = dkButton("Doğruladım, devam et", {
    variant: "primary", size: 48, full: true, busyLabel: "Kontrol ediliyor…",
    icon: svgRaw(SVG_CHECK_CIRCLE, { size: 17, sw: "2.2" }),
    onClick: () => check(false),
  });
  const contBtn = dkButton("Devam et", { variant: "success", size: 48, full: true, iconRight: "arrowRight", iconSize: 16, onClick: () => goOn() });
  const chip = h("span", { class: "dk-dogrula-chip" });
  const resendBtn = h("button", { type: "button", class: "dk-dogrula-resend dk-press", "aria-describedby": hintId, onclick: () => resend() },
    svgIcon("refresh", { size: 17, sw: "1.9" }), "Tekrar gönder", chip);
  const hint = h("span", { id: hintId, class: "dk-dogrula-hint" });

  function paintResend() {
    if (destroyed) return;
    const left = remaining();
    const counting = left > 0;
    softDisable(resendBtn, counting || sending);
    resendBtn.classList.toggle("is-counting", counting);
    chip.hidden = !counting;
    chip.textContent = mmss(left);
    const ht = counting ? T.hintWait : T.hintReady;
    if (hint.textContent !== ht) hint.textContent = ht;
    // yalnız sayaç + ipucu güncellenir (görünüm yeniden çizilmez)
    if (counting && !tick) tick = setInterval(paintResend, 1000);
    if (!counting && tick) { clearInterval(tick); tick = null; }
  }

  function reloadUser() {
    if (!reloading) {
      reloading = (async () => { try { await auth.currentUser?.reload(); } catch (_) {} })()
        .finally(() => { reloading = null; });
    }
    return reloading;
  }

  // Kontrol: silent = visibilitychange (yalnız başarıda tepki; hata mesajı yok)
  async function check(silent) {
    if (verified || destroyed || (silent && userChecking)) return;
    if (!auth.currentUser) { if (!silent) say("err", T.noUser); return; }
    if (!silent) {
      if (userChecking) return;
      userChecking = true;
      say(null);
      checkBtn.dk.setBusy(true, "Kontrol ediliyor…");
      softDisable(checkBtn, true);
    }
    await reloadUser();
    if (destroyed || verified) return;
    if (auth.currentUser && auth.currentUser.emailVerified) { onVerified(); return; }
    if (!silent) {
      userChecking = false;
      checkBtn.dk.setBusy(false);
      softDisable(checkBtn, false);
      say("err", T.notYet);
    }
  }

  function onVerified() {
    verified = true;
    userChecking = false;
    const hadFocus = checkBtn.contains(document.activeElement); // aria-disabled sayesinde kontrol sırasında da odak düğmede
    say("ok", T.done);
    checkBtn.replaceWith(contBtn);
    if (hadFocus) { try { contBtn.focus({ preventScroll: true }); } catch (_) {} }
    advanceT = setTimeout(goOn, AUTO_ADVANCE_MS);
  }

  // recheckEmailVerified(): reload + profil tazele + emit → router homeRouteFor(profile) rotasına taşır (bu görünüm kapanır)
  async function goOn() {
    if (going || destroyed) return;
    going = true;
    clearTimeout(advanceT);
    try { await recheckEmailVerified(); } finally { going = false; }
  }

  async function resend() {
    if (sending || destroyed || remaining() > 0) return;
    say(null);
    const u = auth.currentUser;
    if (!u) { say("err", T.noUser); return; }
    sending = true;
    paintResend();
    try {
      await sendEmailVerification(u);
      markSent();
      say("ok", T.resent);
    } catch (err) {
      if ((err && err.code) === "auth/too-many-requests") { markSent(); say("err", T.tooMany); }
      else say("err", T.sendFail);
    } finally {
      sending = false;
      paintResend();
    }
  }

  const onVis = () => { if (document.visibilityState === "visible") check(true); };
  document.addEventListener("visibilitychange", onVis);

  // ── kolon içeriği (artboard sırası) ──
  const badge = h("span", { class: "dk-dogrula-badge" },
    svgIcon("mail", { size: 28, sw: "1.8" }),
    h("span", { class: "dk-dogrula-dot", "aria-hidden": "true" }, h("span", { class: "dk-dogrula-ping dk-ping" }), h("span", { class: "dk-dogrula-dotc" })));
  const heading = authHeading({
    eyebrow: "SON ADIM · E-POSTA DOĞRULAMA", title: "E-postanı ", em: "doğrula", size: 52, gap: 12,
    lead: "Adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıklayıp bu sayfaya dönerek “Doğruladım”a bas.",
  });
  const mailCard = h("div", { class: "dk-dogrula-mail" },
    svgRaw(SVG_AT, { size: 18, sw: "1.9", color: "#8A8E97" }),
    h("span", { class: "dk-dogrula-addr", title: email || null }, email),
    h("span", { class: "dk-dogrula-sent" }, "GÖNDERİLDİ"));
  const steps = h("ol", { class: "dk-dogrula-steps" },
    ...STEPS.map((t, i) => h("li", {}, h("span", { class: "dk-dogrula-n", "aria-hidden": "true" }, String(i + 1)), t)));
  const btns = h("div", { class: "dk-dogrula-btns" }, checkBtn, resendBtn, hint);
  const foot = h("div", { class: "dk-dogrula-foot" }, "Yanlış e-posta mı?",
    h("a", { href: "#/register", onclick: (e) => { e.preventDefault(); logout("#/register"); } }, "Farklı e-postayla kaydol"));

  const s = authSplit({
    variant: "default",
    image: AUTH_ASIDE.verify,
    logoHref: null, // bağlantısız logo (bkz. başlık notu)
    // sol: "Keşfet'e dön" gizli (bkz. başlık notu) · sağ: Çıkış yap
    top: { left: h("span"), right: authTopLink("Çıkış yap", { icon: "logout", href: null, onClick: () => logout() }) },
    width: 400, gap: 20,
    children: [badge, heading, mailCard, steps, status, btns, foot],
  });
  s.column.classList.add("dk-dogrula");
  paintResend();

  return {
    node: s.node,
    // Aynı kimlikle gelen oturum yayınında (token/profil tazeleme) yerinde kal → sayaç/mesaj korunur.
    onSession() { return true; },
    destroy() {
      destroyed = true;
      if (tick) clearInterval(tick);
      clearTimeout(advanceT);
      document.removeEventListener("visibilitychange", onVis);
      s.destroy();
    },
  };
}
