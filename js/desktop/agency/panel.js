// AJANS — Ana Sayfa (#/agency, ≥769 px). Registry anahtarı: agencyPanel (bilinmeyen #/agency/… alt rotaları da buraya düşer).
// Tasarım tuvalinde ajans ekranı YOK → organizatör Ana Sayfası kalıbı (hero + 4 KPI + numaralı bölüm kartları) ortak kitle kurulur.
// CSS: css/dk-ajans.css (.dk-ag / .dk-ag-*). Veri: js/agency-data.js listAgencyItems(uid, { ownerView: true }) + canlı okunmamış mesaj.
// ≤768: mobil web bilgi ekranı (pages/auth.js agencyMobile) — router bu modülü mobilde yüklemez.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkButton, dkKpi, dkPageHero, dkStatusBadge, dkEmpty, dkSkeleton } from "../shared/ui.js";
import { trUpper } from "../shared/helpers.js";
import { subscribeLive } from "../shared/live.js";
import { AGENCY_COLOR, listAgencyItems, priceText, serviceLabel, normalizeServices } from "../../agency-data.js";
import { itemThumb, serviceTag, ST_LIVE, ST_DRAFT } from "./common.js";

export const NOT_READY = false;

const P = "dk-ag";
const k = (s) => `${P}-${s}`;
const ico = (name, size, o = {}) => svgIcon(name, { size, ...o });

export function agencyPanelView(ctx) {
  const s = ctx.session || session;
  const p = s.profile || {};
  const uid = s.user?.uid;
  const unsubs = [];
  let alive = true;

  const shell = panelShell({ role: "agency", active: ctx.route?.nav || "home", title: "Ana Sayfa", crumb: "Ana Sayfa", ctx });
  const root = shell.content;
  root.classList.add(P, k("home"));

  // ═════════ HERO ═════════
  const name = p.displayName || "Ajansın";
  const hero = dkPageHero({
    eyebrow: `${trUpper(name)} · AJANS`, title: "Kataloğun ", em: "vitrinde", tail: ".",
    lead: "Mekanlar, organizatörler ve sanatçılar ilanlarını Ajans Bul’da görür ve sana doğrudan mesaj atar.",
    color: AGENCY_COLOR, cls: k("hero"),
    actions: [
      dkButton("Profili düzenle", { variant: "outline", size: 44, href: "#/agency/profil", icon: ico("userProfile", 17) }),
      dkButton("İlan ekle", { variant: "role", color: AGENCY_COLOR, size: 44, href: "#/agency/katalog?yeni=1", icon: ico("plus", 17, { color: "#06070A", sw: "2.2" }) }),
    ],
  });
  root.append(hero);

  // ═════════ KPI ═════════
  const services = normalizeServices(p.agencyServices);
  const kpi = {
    live: dkKpi({ label: "YAYINDAKİ İLAN", value: "", sub: "Ajans Bul’da görünür", icon: ico("eye", 16, { color: "#7CE0B0" }), color: "#7CE0B0", href: "#/agency/katalog?durum=yayinda" }),
    draft: dkKpi({ label: "TASLAK", value: "", sub: "Yalnız sen görürsün", icon: ico("edit", 16, { color: "#A3A7AF" }), color: "#A3A7AF", href: "#/agency/katalog?durum=taslak" }),
    svc: dkKpi({ label: "HİZMET", value: String(services.length), sub: services.length ? services.map(serviceLabel).join(" · ") : "Profilinden hizmet ekle", icon: ico("agency", 16, { color: AGENCY_COLOR }), color: AGENCY_COLOR, href: "#/agency/profil" }),
    msg: dkKpi({ label: "OKUNMAMIŞ MESAJ", value: "", sub: "Mekan, organizatör ve sanatçılardan", icon: ico("chatSquare", 16, { color: "#A78BFA" }), color: "#A78BFA", href: "#/agency/mesajlar" }),
  };
  [kpi.live, kpi.draft, kpi.msg].forEach((x) => x.querySelector(".dk-kpi-vt").replaceChildren(dkSkeleton({ w: 36, h: 28, r: 6 })));
  root.append(h("section", { "aria-label": "Özet", class: k("kpis") }, kpi.live, kpi.draft, kpi.svc, kpi.msg));
  if (uid) unsubs.push(subscribeLive(uid, (st) => { if (alive && st.ready?.c) kpi.msg.dk.setValue(String(st.unreadMessages || 0)); }, { notifications: false, messages: true }));

  // ═════════ ORTAK PARÇALAR (org paneli bölüm kartı) ═════════
  const head = (num, title, id, link) => h("div", { class: k("head") },
    h("div", { class: k("hl") }, h("span", { class: k("num") }, num), h("h2", { id, class: k("h2") }, title)),
    link ? h("a", { href: link.href, class: cx(k("more"), "dk-link") }, link.label, ico("arrowRight", 14)) : null);

  // ═════════ 01 · SON İLANLAR ═════════
  const recentBody = h("div", { class: k("rlist") }, ...Array.from({ length: 3 }, () => h("div", { class: k("skrow"), "aria-hidden": "true" },
    dkSkeleton({ w: 56, h: 56, r: 8 }), h("div", { class: k("skcol") }, dkSkeleton({ w: "55%", h: 14 }), dkSkeleton({ w: "35%", h: 11 })))));
  const recentCard = h("section", { "aria-labelledby": k("h-recent"), class: k("card") },
    head("01", "Son ilanlar", k("h-recent"), { href: "#/agency/katalog", label: "Katalog" }), recentBody,
    h("div", { class: k("note") }, ico("info", 15), "Taslak ilanlar yalnız sana görünür; yayına aldığında Ajans Bul’da listelenir."));

  function drawRecent(items) {
    const list = items.slice(0, 5);
    if (!list.length) {
      recentBody.replaceChildren(dkEmpty({ variant: "plain", icon: ico("agency", 30, { color: "#5E636D", sw: "1.6" }), title: "Henüz ilan yok",
        sub: "Hizmetini ya da kiraladığın cihazı fotoğraflarıyla ekle.",
        action: dkButton("İlk ilanını ekle", { variant: "role", color: AGENCY_COLOR, size: 40, href: "#/agency/katalog?yeni=1", icon: ico("plus", 15, { color: "#06070A", sw: "2.2" }) }) }));
      return;
    }
    recentBody.replaceChildren(...list.map((it) => h("a", { href: `#/agency/katalog?duzenle=${encodeURIComponent(it.id)}`, class: cx(k("ritem"), "dk-row") },
      itemThumb(it.photos[0], { cls: k("rthumb") }),
      h("span", { class: k("rinfo") },
        h("span", { class: k("rt") }, it.title || "İlan"),
        h("span", { class: k("rm") }, [serviceLabel(it.category), priceText(it)].filter(Boolean).join(" · "))),
      dkStatusBadge(it.active ? ST_LIVE : ST_DRAFT, { variant: "pill" }),
      h("span", { class: k("chev"), "aria-hidden": "true" }, ico("chevronRight", 18)),
      h("span", { class: "dk-sr" }, " — düzenle"))));
  }

  // ═════════ 02 · HİZMETLER + PROFİL ═════════
  const checks = [
    ["Logo", !!p.photoURL],
    ["Şehir", !!(p.city && String(p.city).trim())],
    ["Telefon", !!(p.phone && String(p.phone).trim())],
    ["Hakkında", !!(p.bio && String(p.bio).trim())],
    ["En az bir hizmet", services.length > 0],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const svcCard = h("section", { "aria-labelledby": k("h-svc"), class: cx(k("card"), "is-col") },
    head("02", "Hizmetlerin", k("h-svc"), { href: "#/agency/profil", label: "Düzenle" }),
    h("div", { class: k("svcwrap") },
      services.length ? h("div", { class: k("tags") }, ...services.map((x) => serviceTag(x, { size: "md" })))
        : h("p", { class: k("muted") }, "Henüz hizmet eklemedin. Ajans Bul’da hizmetlerine göre filtrelenirsin."),
      h("div", { class: k("prof") },
        h("div", { class: k("profhead") }, h("span", { class: k("proft") }, "PROFİL TAMAMLAMA"), h("span", { class: k("profn") }, `${done}/${checks.length}`)),
        h("div", { class: k("bar"), role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(checks.length), "aria-valuenow": String(done), "aria-label": "Profil tamamlama" },
          h("span", { style: { width: `${Math.round((done / checks.length) * 100)}%` } })),
        h("ul", { class: k("checks") }, ...checks.map(([label, ok]) => h("li", { class: ok ? "is-ok" : null },
          ok ? ico("check", 14, { color: "#7CE0B0", sw: "2.4" }) : h("span", { class: k("dot"), "aria-hidden": "true" }),
          h("span", {}, label), h("span", { class: "dk-sr" }, ok ? " (tamam)" : " (eksik)")))))));

  root.append(h("div", { class: k("row") }, recentCard, svcCard));

  // ═════════ VERİ ═════════
  (async () => {
    if (!uid) return;
    try {
      const items = await listAgencyItems(uid, { ownerView: true });
      if (!alive) return;
      kpi.live.dk.setValue(String(items.filter((x) => x.active).length));
      kpi.draft.dk.setValue(String(items.filter((x) => !x.active).length));
      drawRecent(items);
    } catch (e) {
      console.warn("[agency panel]", e);
      if (!alive) return;
      kpi.live.dk.setValue("—"); kpi.draft.dk.setValue("—");
      recentBody.replaceChildren(dkEmpty({ variant: "plain", icon: ico("alertCircle", 28, { color: "#5E636D" }), title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile." }));
    }
  })();

  return {
    node: shell.node,
    update() {},
    onSession(sess) {
      const a = sess?.profile || {};
      return a.displayName === p.displayName && a.photoURL === p.photoURL && JSON.stringify(a.agencyServices || []) === JSON.stringify(p.agencyServices || [])
        && a.city === p.city && a.phone === p.phone && a.bio === p.bio;
    },
    destroy() {
      alive = false;
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}

