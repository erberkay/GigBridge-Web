// WebOnayBekleniyor — "Onay bekleniyor" masaüstü görünümü (≥769 px). Registry anahtarı: onay (#/pending).
// Spec: specs/auth.md WebOnayBekleniyor (+ §0 AuthSplit, business varyantı). Artboard: design/WebOnayBekleniyor.dc.html.
// CSS: css/dk-onay-bekleniyor.css (.dk-onay-bekleniyor kökü = AuthColumn). Legacy karşılığı: js/pages/auth.js pending() (≤768 aynen kalır).
//
// Legacy özellikleri (korundu): hesap adı + "hesabın oluşturuldu. GigBridge ekibi onayladıktan sonra panel açılır…" metni,
// "Durumu yenile", "Çıkış yap" (logout()).
// Yeni (sahibi notu + tasarım): rol etiketi (MEKAN / ORGANİZATÖR HESABI), 3 adımlı durum göstergesi, destek kartı (mailto, konu
// "Başvuru – <hesap adı>"), "Durumu yenile" artık location.reload() DEĞİL: users/{uid} yeniden okunur (data.getUser) —
//   · onaylandıysa: onaylandı durumu + ~1.4 sn sonra refreshProfile() (emit → router #/venue | #/organizer); "Panele git" hemen yapar,
//   · hâlâ bekliyorsa: session.profile sessizce güncellenir (emit YOK → görünüm yeniden kurulmaz) + bilgi mesajı,
//   · reddedildiyse (rejected === true ya da rejectedReason): kırmızı reddedildi durumu + destek e-postası öne çıkar.
// Ek (spec §6 "optional nice"): açıkken kendi users/{uid} dokümanı canlı dinlenir (onSnapshot) → onay/ret anında ekrana yansır.
// Logo bağlantı DEĞİL (logoHref: null; legacy'de de değildi): router onay bekleyen hesabı #/kesfet'ten #/pending'e geri atar →
// bağlantı ekranı yeniden kurup mesajı silerdi. Klavye odağı: "Durumu yenile" meşgulken disabled yerine aria-disabled (odak kalır);
// ilk eylem düğmesi (yenile → Panele git / Destek ekibine yaz) değişirken odak yeni düğmeye taşınır.
//
// Veri: okuma users/{uid} (getUser + tek doküman dinleyicisi; yeni bileşik sorgu/indeks YOK). Yazım YOK.
// Arka uç bağımlılığı: rejectedReason YENİ alan — admin rejectUser(uid) şu an yalnız rejected:true yazıyor ve kurallar admin'in
// yalnız ['approved','approvedAt','rejected'] değiştirmesine izin veriyor → gerekçe gelene dek genel metin gösterilir.
import { h } from "../../ui.js";
import { session, logout, refreshProfile } from "../../store.js";
import { db, doc, onSnapshot } from "../../firebase.js";
import { getUser } from "../../data.js";
import { authSplit, authTopLink, authTag, authHeading } from "../shared/auth-shell.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import { dkButton, dkInlineMessage } from "../shared/ui.js";

const SUPPORT = "gigbridge.tr@gmail.com";
const APPROVED_ADVANCE_MS = 1400;

// Artboard gövdeleri (birebir)
const SVG_HOURGLASS = '<path d="M6 3h12M6 21h12M7 3v3.5a5 5 0 0 0 2.5 4.33L12 12l2.5-1.17A5 5 0 0 0 17 6.5V3M7 21v-3.5a5 5 0 0 1 2.5-4.33L12 12l2.5 1.17A5 5 0 0 1 17 17.5V21"></path>';
const SVG_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"></path>';
const SVG_X = '<path d="M6 6l12 12M18 6 6 18"></path>';
const SVG_REFRESH = '<path d="M20 11a8 8 0 0 0-14.9-3.9M4 5v4h4M4 13a8 8 0 0 0 14.9 3.9M20 19v-4h-4"></path>';
const SVG_LOGOUT = '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"></path>';
const SVG_CHAT_Q = '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"></path><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16v.01"></path>';
const SVG_MAIL = '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3.5 6.5 8.5 6.5 8.5-6.5"></path>';
const SVG_INFO = '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5.5M12 7.5v.01"></path>'; // artboard: tüm durum mesajlarında (ok dahil)

const ROLE = {
  venue: { tag: "MEKAN HESABI", color: "#FF8A2A", border: "rgba(255,138,42,0.45)", panel: "Mekan Paneli", route: "#/venue" },
  organizer: { tag: "ORGANİZATÖR HESABI", color: "#FF4FA3", border: "rgba(255,79,163,0.45)", panel: "Organizatör Paneli", route: "#/organizer" },
};

const accountName = (p) => (p?.userType === "organizer" ? (p.orgName || p.displayName) : p?.displayName) || "";
const isRejected = (p) => !!p && p.approved === false && (p.rejected === true || (typeof p.rejectedReason === "string" && p.rejectedReason.trim() !== ""));
const stateOf = (p) => (!p ? "pending" : p.approved !== false ? "approved" : isRejected(p) ? "rejected" : "pending");

export function onayBekleniyorView(ctx) {
  const uidv = session.user?.uid;
  let profile = session.profile || ctx.session?.profile || null;
  const R = ROLE[profile?.userType] || ROLE.venue;
  let state = stateOf(profile);
  let busy = false;
  let destroyed = false;
  let advanceT = null;
  let unsub = null;

  const name = () => accountName(profile);
  const mailto = () => `mailto:${SUPPORT}?subject=${encodeURIComponent(name() ? `Başvuru – ${name()}` : "Başvuru")}`;

  // ── durum bölgesi (her zaman DOM'da) ──
  const status = h("div", { class: "dk-onay-bekleniyor-status", role: "status", "aria-live": "polite" });
  // Artboard her durum mesajında bilgi dairesi çizer (ok + info). Reddedildi (err, artboard'da yok) uyarı ikonunu korur.
  const say = (kind, text) => { if (!destroyed) status.replaceChildren(...(kind ? [dkInlineMessage(kind, text, kind === "err" ? {} : { icon: SVG_INFO })] : [])); };

  // ── parçalar ──
  const badgeSlot = h("span", { class: "dk-onay-bekleniyor-badge" });
  let heading = h("div");
  const card = h("div", { class: "dk-onay-bekleniyor-card" },
    h("span", { class: "dk-onay-bekleniyor-eb" }, "BAŞVURU DURUMU"));
  let stepsEl = h("ol");
  card.append(stepsEl);

  const refreshIcon = svgRaw(SVG_REFRESH, { size: 17, sw: "2" });
  const refreshBtn = dkButton("Durumu yenile", { variant: "light", size: 48, full: true, icon: refreshIcon, cls: "dk-onay-bekleniyor-refresh", onClick: () => refresh() });
  const panelBtn = dkButton("Panele git", { variant: "role", color: "#FF8A2A", size: 48, full: true, iconRight: "arrowRight", iconSize: 16, href: R.route, onClick: (e) => { e.preventDefault(); goPanel(); } });
  const supportBtn = dkButton("Destek ekibine yaz", { variant: "light", size: 48, full: true, icon: svgRaw(SVG_MAIL, { size: 17, sw: "2" }), href: mailto() });
  const logoutBtn = dkButton("Çıkış yap", { variant: "outline", size: 48, full: true, icon: svgRaw(SVG_LOGOUT, { size: 17, sw: "2" }), onClick: () => logout() });
  const actions = h("div", { class: "dk-onay-bekleniyor-actions" }, refreshBtn, logoutBtn);

  const supportMail = h("a", { class: "dk-onay-bekleniyor-mailbtn dk-press", href: mailto() }, svgRaw(SVG_MAIL, { size: 15, sw: "2" }), SUPPORT);
  const support = h("div", { class: "dk-onay-bekleniyor-support" },
    h("span", { class: "dk-onay-bekleniyor-sicon" }, svgRaw(SVG_CHAT_Q, { size: 19, sw: "1.9" })),
    h("span", { class: "dk-onay-bekleniyor-stext" },
      h("span", { class: "dk-onay-bekleniyor-stitle" }, "Başvurunla ilgili sorun mu var?"),
      h("span", { class: "dk-onay-bekleniyor-ssub" }, "Destek ekibine yaz, hesap adını belirt.")),
    supportMail);

  function badgeFor(st) {
    if (st === "approved") return [svgRaw(SVG_CHECK, { size: 28, sw: "2.2" })];
    if (st === "rejected") return [svgRaw(SVG_X, { size: 28, sw: "2.2" })];
    return [svgRaw(SVG_HOURGLASS, { size: 28, sw: "1.8", cls: "dk-onay-bekleniyor-flip" })];
  }
  function leadFor(st) {
    const n = name();
    const strong = n ? [h("span", { class: "dk-onay-bekleniyor-name" }, n), " "] : [];
    const body = st === "approved"
      ? `hesabın aktif. ${R.panel}’ne geçebilir, uygulamadan aynı hesapla giriş yapabilirsin.`
      : st === "rejected"
        ? "hesabının başvurusu onaylanmadı. Nedenini öğrenmek ya da itiraz etmek için destek ekibine yazabilirsin."
        : "hesabın oluşturuldu. GigBridge ekibi onayladıktan sonra panel açılır ve uygulamadan aynı hesapla giriş yapabilirsin.";
    return h("p", { class: "dk-auth-lead" }, ...strong, n ? body : body.charAt(0).toLocaleUpperCase("tr-TR") + body.slice(1));
  }
  function stepsFor(st) {
    const S = [
      { n: "1", label: "Başvuru alındı", sub: "Hesabın oluşturuldu, e-postan doğrulandı.", s: "done" },
      st === "rejected"
        ? { n: "2", label: "İncelendi", sub: "GigBridge ekibi başvurunu inceledi.", s: "done" }
        : { n: "2", label: "İnceleniyor", sub: "GigBridge ekibi bilgilerini inceliyor.", s: st === "approved" ? "done" : "active" },
      st === "rejected"
        ? { n: "3", label: "Onaylanmadı", sub: "Ayrıntı için destek ekibine yaz.", s: "rejected" }
        : { n: "3", label: "Onay", sub: `Onaylanınca ${R.panel} açılır.`, s: st === "approved" ? "done" : "todo" },
    ];
    const SR = { done: "tamamlandı", active: "devam ediyor", todo: "bekliyor", rejected: "onaylanmadı" };
    return h("ol", { class: "dk-onay-bekleniyor-steps", "aria-label": "Başvuru adımları" }, ...S.map((x, i) => {
      const next = S[i + 1];
      const mark = x.s === "done" ? svgRaw(SVG_CHECK, { size: 14, sw: "3" })
        : x.s === "rejected" ? svgRaw(SVG_X, { size: 14, sw: "3" })
          : x.s === "active" ? h("span", { class: "dk-onay-bekleniyor-pdot" }, h("span", { class: "dk-onay-bekleniyor-pdot-p dk-ping" }), h("span", { class: "dk-onay-bekleniyor-pdot-c" }))
            : x.n;
      let line = null;
      if (next) {
        const cls = next.s === "rejected" ? "is-bad" : next.s !== "todo" ? "is-done" : x.s === "active" ? "is-flow" : "is-todo";
        line = h("span", { class: `dk-onay-bekleniyor-line ${cls}` });
      }
      return h("li", { class: `is-${x.s}`, "aria-current": x.s === "active" ? "step" : null },
        h("span", { class: "dk-onay-bekleniyor-row" }, h("span", { class: "dk-onay-bekleniyor-circle", "aria-hidden": "true" }, mark), line),
        h("span", { class: "dk-onay-bekleniyor-label" }, x.label, h("span", { class: "dk-sr" }, ` (${SR[x.s]})`)),
        h("span", { class: "dk-onay-bekleniyor-sub" }, x.sub));
    }));
  }
  function rejectText() {
    const r = typeof profile?.rejectedReason === "string" ? profile.rejectedReason.trim() : "";
    return `Başvurun onaylanmadı. ${r ? `Gerekçe: ${/[.!?…]$/.test(r) ? r : r + "."} ` : ""}Ayrıntı ve itiraz için destek ekibine yaz.`;
  }

  // Durumu çiz (yerinde; kabuk ve kolon yeniden kurulmaz)
  function paint(st, { message = true } = {}) {
    state = st;
    badgeSlot.className = `dk-onay-bekleniyor-badge is-${st}`;
    badgeSlot.replaceChildren(...badgeFor(st));
    const title = st === "approved" ? ["Başvurun ", "onaylandı"] : st === "rejected" ? ["Başvurun ", "reddedildi"] : ["Onay ", "bekleniyor"];
    const nh = authHeading({ title: title[0], em: title[1], size: 52, gap: 12 });
    nh.append(leadFor(st));
    heading.replaceWith(nh); heading = nh;
    const ns = stepsFor(st);
    stepsEl.replaceWith(ns); stepsEl = ns;
    supportMail.setAttribute("href", mailto());
    supportBtn.setAttribute("href", mailto());
    const first = st === "approved" ? panelBtn : st === "rejected" ? supportBtn : refreshBtn;
    if (actions.firstChild !== first) {
      const hadFocus = actions.firstChild.contains(document.activeElement);
      actions.replaceChild(first, actions.firstChild);
      if (hadFocus) { try { first.focus({ preventScroll: true }); } catch (_) {} }
    }
    if (message) {
      if (st === "approved") say("ok", "Başvurun onaylandı. Panelin artık açık.");
      else if (st === "rejected") say("err", rejectText());
    }
  }

  function setBusy(on) {
    busy = on;
    // disabled değil: odaktaki düğme odağı bırakmasın (tıklama koruması `busy`)
    if (on) refreshBtn.setAttribute("aria-disabled", "true"); else refreshBtn.removeAttribute("aria-disabled");
    refreshBtn.setAttribute("aria-busy", on ? "true" : "false");
    refreshIcon.classList.toggle("dk-spin", on);
    refreshBtn.dk.setLabel(on ? "Kontrol ediliyor…" : "Durumu yenile");
  }

  // Yeni profil verisi (Durumu yenile ya da canlı dinleyici). fromUser: kullanıcı istedi → bekliyorsa bilgi mesajı.
  function apply(p, fromUser) {
    if (destroyed) return;
    if (!p) { refreshProfile().catch(() => {}); return; } // doküman yok → router #/setup'a karar versin
    profile = p;
    const st = stateOf(p);
    if (st === "approved") {
      session.profile = p;                       // emit yok; refreshProfile() emit'i router'ı panele taşır
      if (state !== "approved") {
        paint("approved");
        clearTimeout(advanceT);
        advanceT = setTimeout(goPanel, APPROVED_ADVANCE_MS);
      }
      return;
    }
    session.profile = p;                         // sessiz güncelleme — render() yeniden kurulumu mesajı silmesin
    if (st !== state) { paint(st); if (st === "pending") say(null); }
    else if (st === "rejected" && status.textContent !== rejectText()) say("err", rejectText()); // gerekçe sonradan eklenmiş olabilir
    if (st === "pending" && fromUser) say("info", `Başvurun hâlâ inceleniyor. Onaylandığında bu ekran yerine ${R.panel} açılır.`);
  }

  async function refresh() {
    if (busy || destroyed || !uidv) return;
    say(null);
    setBusy(true);
    let p; let failed = false;
    try { p = await getUser(uidv); } catch (_) { failed = true; }
    if (destroyed) return;
    setBusy(false);
    if (failed) { say("err", "Durum alınamadı. Bağlantını kontrol edip tekrar dene."); return; }
    apply(p, true);
  }

  async function goPanel() {
    clearTimeout(advanceT);
    if (destroyed) return;
    try { await refreshProfile(); } catch (_) { location.hash = R.route; }
  }

  // Canlı: kendi kullanıcı dokümanı (onay/ret anında yansır)
  if (uidv) {
    try {
      unsub = onSnapshot(doc(db, "users", uidv), (snap) => {
        const p = snap.exists() ? { id: uidv, ...snap.data() } : null;
        if (snap.metadata?.fromCache && !snap.exists()) return; // önbellekte yoksa sunucuyu bekle
        apply(p, false);
      }, () => {});
    } catch (_) { unsub = null; }
  }

  const s = authSplit({
    variant: "business",
    logoHref: null, // bağlantısız logo (bkz. başlık notu)
    top: {
      left: authTag(R.tag, { color: R.color, border: R.border }),
      right: authTopLink("Çıkış yap", { icon: "logout", href: null, onClick: () => logout() }),
    },
    width: 440, gap: 22,
    children: [badgeSlot, heading, card, status, actions, support],
  });
  s.column.classList.add("dk-onay-bekleniyor");
  paint(state, { message: true });

  return {
    node: s.node,
    // Aynı kimlikle gelen oturum yayını (refreshProfile/token): durumu yerinde güncelle, yeniden kurma.
    onSession(sess) {
      if (sess?.profile) apply(sess.profile, false);
      return true;
    },
    destroy() {
      destroyed = true;
      clearTimeout(advanceT);
      try { unsub?.(); } catch (_) {}
      s.destroy();
    },
  };
}
