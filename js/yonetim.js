// MEKAN YÖNETİMİ sekmesi — yönetici (Admin › Mekan Ekle › "Mekan panelini aç") mekanın panelini bu sekmede O MEKAN olarak
// kullanır: gönderi, etkinlik, profil… Panelini kendisi kullanmak istemeyen mekanların işini yönetici yürütür (Berkay).
// Oturum yalnız bu sekmede yaşar (js/firebase.js MANAGE_MODE → sessionStorage); yöneticinin kendi oturumu değişmez.
// Jeton: açan sekme (js/desktop/admin/mekan-ekle.js) adminVenueSession callable'ından alır ve postMessage ile YALNIZ bu
// pencereye (aynı köken, kaynak = opener) yollar; URL'ye / depolamaya yazılmaz. Bu sekme önce READY der, jetonu bekler
// (20 sn), signInWithCustomToken. Sekme yenilenince oturum sessionStorage'dan sürer (jeton gerekmez), en çok 8 saat.
// Jeton alınınca window.opener koparılır (ters sekme ele geçirme).
// Altta sabit şerit: kimin adına işlem yapıldığı + "Bitir" (oturumu kapatır, sekmeyi kapatır). Bağımlılık: yalnız firebase.js
// (store.js de bunu içe aktarır → ui.js/store.js'e dönüş yok, DOM elle kurulur).
import { auth, MANAGE_MODE, signInWithCustomToken, signOut, onAuthStateChanged } from "./firebase.js";

export const MANAGE_READY = "gb-yonetim-hazir";
export const MANAGE_TOKEN = "gb-yonetim-jeton";
export const MANAGE_FAIL = "gb-yonetim-hata";
const VIOLET = "#A855F7";

// Yönetim oturumunun ömrü: sekme kapatılmadan unutulsa da (ya da tarayıcı "kapatılan sekmeyi yeniden aç" ile sessionStorage'ı
// geri getirse de) en çok bu kadar sürer → sonra oturum kapanır, yöneticiden yeniden açması istenir.
const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const T_KEY = "gb_yonetim_t";

let bar = null, overlay = null, ending = false;

function el(tag, css, ...kids) {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
function btn(label, onClick, primary) {
  const b = el("button", `font:600 13px/1 system-ui,-apple-system,sans-serif;padding:9px 14px;border-radius:999px;cursor:pointer;
    border:1px solid ${primary ? VIOLET : "rgba(255,255,255,.22)"};background:${primary ? VIOLET : "transparent"};color:#fff`, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function showOverlay(title, body, { closable = false } = {}) {
  hideOverlay();
  overlay = el("div", `position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:16px;
    background:rgba(8,6,14,.94);color:#fff;font:14px/1.5 system-ui,-apple-system,sans-serif`,
    el("div", "max-width:380px;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center",
      closable ? null : el("div", `width:28px;height:28px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:${VIOLET};
        animation:gbYnSpin .8s linear infinite`),
      el("div", "font-weight:700;font-size:17px", title),
      body ? el("div", "color:rgba(255,255,255,.72)", body) : null,
      closable ? btn("Sekmeyi kapat", closeTab, true) : null));
  if (!document.getElementById("gbYnKf")) {
    const st = document.createElement("style");
    st.id = "gbYnKf";
    st.textContent = "@keyframes gbYnSpin{to{transform:rotate(360deg)}}";
    document.head.append(st);
  }
  document.body.append(overlay);
}
function hideOverlay() { overlay?.remove(); overlay = null; }

function clearFlags() { try { sessionStorage.removeItem("gb_yonetim"); sessionStorage.removeItem(T_KEY); } catch (_) {} }
// Ters sekme ele geçirme (reverse tabnabbing): bu sekme dış bir siteye giderse o site window.opener ile yöneticinin
// sekmesini başka adrese yönlendirebilirdi → jeton alınınca bağ koparılır.
function dropOpener() { try { window.opener = null; } catch (_) {} }
function closeTab() {
  clearFlags();
  window.close();
  // Tarayıcı kapatmaya izin vermezse normal siteye dön (bu sekme artık yöneticinin kendi oturumunu kullanır)
  setTimeout(() => location.replace(location.pathname), 400);
}
async function finish() {
  ending = true;
  try { await signOut(auth); } catch (_) {}
  closeTab();
}

function placeBar() {
  if (!bar) return;
  const mobile = window.matchMedia("(max-width: 768px)").matches;   // ≤768: alt sekme çubuğunun üstünde dur
  bar.style.bottom = mobile ? "calc(env(safe-area-inset-bottom, 0px) + 78px)" : "16px";
}
function showBar(name) {
  bar?.remove();
  bar = el("div", `position:fixed;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;
    max-width:calc(100vw - 32px);box-sizing:border-box;padding:6px 6px 6px 14px;border-radius:999px;border:1px solid ${VIOLET};
    background:rgba(17,10,30,.94);color:#fff;font:13px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45)`,
    el("span", `width:8px;height:8px;border-radius:50%;background:${VIOLET};flex:none`),
    el("span", "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
      "Yönetim modu · ", el("b", "", name || "Mekan"), " olarak işlem yapıyorsun"),
    btn("Bitir", finish, false));
  bar.setAttribute("role", "status");
  document.body.append(bar);
  placeBar();
}

/** Açan sekmeden jetonu bekle (yalnız aynı köken + kaynak = opener). */
function waitToken(ms = 20000) {
  return new Promise((resolve, reject) => {
    const op = window.opener;
    if (!op) { reject(new Error("no-opener")); return; }
    const done = () => { clearTimeout(t); window.removeEventListener("message", onMsg); };
    const t = setTimeout(() => { done(); reject(new Error("timeout")); }, ms);
    function onMsg(ev) {
      if (ev.origin !== location.origin || ev.source !== op) return;
      const d = ev.data || {};
      if (d.type === MANAGE_TOKEN && typeof d.token === "string") { done(); resolve(d.token); }
      else if (d.type === MANAGE_FAIL) { done(); reject(new Error(typeof d.message === "string" && d.message ? d.message : "fail")); }
    }
    window.addEventListener("message", onMsg);
    try { op.postMessage({ type: MANAGE_READY }, location.origin); } catch (e) { done(); reject(e); }
  });
}

/**
 * app.js initAuth()'tan ÖNCE çağırır. Yönetim sekmesi değilse hemen true. Mekan oturumu kurulamazsa false (initAuth çağrılmaz:
 * bu sekmede misafir/anonim oturum açılmasın; ekranda hata + "Sekmeyi kapat" kalır).
 */
export async function manageBoot() {
  if (!MANAGE_MODE) return true;
  await auth.authStateReady();
  let u = auth.currentUser;
  let t0 = 0;
  try { t0 = Number(sessionStorage.getItem(T_KEY)) || 0; } catch (_) { t0 = 0; }
  if (u && !u.isAnonymous && !(t0 && Date.now() - t0 < MAX_AGE_MS)) {
    // süresi dolmuş (ya da başlangıcı bilinmeyen) yönetim oturumu → kapat
    try { await signOut(auth); } catch (_) {}
    dropOpener();
    clearFlags();
    showOverlay("Yönetim oturumunun süresi doldu", "Mekan paneline yeniden girmek için Yönetim › Mekan Ekle'den tekrar aç.", { closable: true });
    return false;
  }
  if (!u || u.isAnonymous) {
    showOverlay("Mekan paneli açılıyor…", "Yönetici oturumu hazırlanıyor.");
    try {
      const token = await waitToken();
      dropOpener();
      u = (await signInWithCustomToken(auth, token)).user;
      try { sessionStorage.setItem(T_KEY, String(Date.now())); } catch (_) {}
    } catch (e) {
      dropOpener();
      const m = e?.message;
      showOverlay("Mekan paneli açılamadı",
        m === "no-opener" || m === "timeout" || m === "fail" || !m
          ? "Bu sekmeyi kapatıp Yönetim › Mekan Ekle'de mekanı seçerek “Mekan panelini aç”a tekrar bas."
          : m,
        { closable: true });
      clearFlags();
      return false;
    }
    hideOverlay();
  }
  dropOpener();
  showBar(u.displayName);
  window.addEventListener("resize", placeBar);
  onAuthStateChanged(auth, (x) => { if (x && !x.isAnonymous && bar) showBar(x.displayName); });
  return true;
}

/** store.js: yönetim sekmesinde oturum kapandı (panelde "Çıkış" ya da süre doldu) → misafire düşme, kapatma ekranı göster. */
export function manageSignedOut() {
  bar?.remove(); bar = null;
  if (ending) return;
  showOverlay("Yönetim oturumu kapandı", "Mekan paneline yeniden girmek için Yönetim › Mekan Ekle'den tekrar aç.", { closable: true });
  clearFlags();
}
