// WebOrgPanel — masaüstü görünümü (≥769 px). Registry anahtarı: orgPanel (#/organizer).
// Spec: specs/org-admin.md § WebOrgPanel (+ F1–F7). Artboard: design/WebOrgPanel.dc.html (sahibi notu YOK).
// CSS: css/dk-org-panel.css — tüm seçiciler .dk-org-panel kökü (kabuğun main.dk-ps-content'i) altında.
// ≤768: legacy organizer.js organizerPage()/renderHome() aynen kalır (router bu modülü mobilde yüklemez).
//
// Legacy özellikleri (korundu, organizer.js 32–50 + 120–191 + 643–676):
//   · Organizasyon kartı (ad, Sahip/Personel rozeti, Üye + Etkinlik sayaçları) → hero eyebrow + RolePill + "{n} üye · {n} yaklaşan"
//   · Hızlı Erişim 4'lüsü (Ekip · Etkinlikler · Davet Et → ekip sayfasında davet modalı [?davet=1] · Mesajlar)
//   · Yaklaşan Etkinlikler (iptal edilmemiş, bugün 00:00 ve sonrası, en fazla 5, satır tıklaması → düzenle [?duzenle=]) +
//     boş durum "Henüz etkinlik yok" + "Etkinlik Oluştur" (→ ?yeni=1)
//   · Zil → bildirimler: popover (kabuk) + "Tüm bildirimler" → #/organizer/bildirim (legacy tam liste, silme × dahil);
//     edit_request satırı → düzenle çekmecesi + onay bandı (?duzenle=&izin=), tıklanınca okundu
//   · Hata: "Yüklenemedi" / "Bağlantıyı kontrol edip yenile."
// Tasarım ekleri: 4 KPI (yaklaşan · bekleyen mekan isteği · ekip üyesi · geçmiş), Mekan İstekleri kartı (durum sekmeleri + mesaj),
//   Ekip aktivitesi (satır içi "İzin Ver" → approveEventEdit + edit_approved bildirimi + okundu; davet/yanıt türetilmiş satırları).
// Arka uç bağımlı (spec §9): mekan istek yanıtı bildirimi (CF yazmıyor → istek durumundan türetilir, zil + aktivite) ·
//   personelin org isteklerini görmesi (kural: yalnız kendi oluşturduğu) → istek kartı/KPI kişi bazlı · davet kabul zamanı (members.joinedAt).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { organizerEvents, organizerRequests, orgMembers, orgInvites } from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { cx, dkButton, dkKpi, dkPageHero, dkStatusBadge, dkEmpty, dkSkeleton, dkToast } from "../shared/ui.js";
import { rgba, trUpper, toMs, timeAgo } from "../shared/helpers.js";
import {
  ico, orgCtx, evStart, isPastEv, evStatusKey, upcomingEvents, reqMs, fmtDayMon, fmtDayMonYear, evTime,
  openVenueChat, grantEditPermission, attachOrgBell,
} from "./etkinlikler.js";

export const NOT_READY = false;

const P = "dk-org-panel";
// İstek avatar gradyanları (artboard DCLogic GR, index % 5)
const GR = ["linear-gradient(135deg,#A855F7,#7C3AED)", "linear-gradient(135deg,#F59E0B,#B45309)", "linear-gradient(135deg,#10B981,#059669)", "linear-gradient(135deg,#3B82F6,#1D4ED8)", "linear-gradient(135deg,#F43F5E,#BE123C)"];
const REQ_TABS = [["pending", "Beklemede"], ["accepted", "Onaylandı"], ["rejected", "Reddedildi"]];
const MAX_ACT = 5;

// "[ZAMAN]": Az önce · {n} dk önce · {n} sa önce · Dün · {n} gün önce · "20 Eyl 2026" (spec §7)
function orgAgo(v) {
  const t = toMs(v);
  if (t == null) return "";
  if (Date.now() - t >= 7 * 86400e3) return fmtDayMonYear(t);
  return timeAgo(t, { now: "Az önce", yesterday: "short", days: 7 });
}
const monShort = (ms) => new Date(ms).toLocaleDateString("tr-TR", { month: "short" }).toLocaleUpperCase("tr-TR").replace(".", "");

export function orgPanelView(ctx) {
  const O = orgCtx(ctx.session || session);
  const { uid, orgId, isOwner } = O;
  const unsubs = [];
  let alive = true;

  const shell = panelShell({ role: "organizer", active: ctx.route?.nav || "home", title: "Ana Sayfa", crumb: "Ana Sayfa", ctx, notifications: "custom", shellBadges: false }); // Etkinlikler rozeti aşağıdaki organizerRequests'ten (çift sorgu yok)
  const root = shell.content;
  root.classList.add(P);
  const bell = attachOrgBell(shell, { uid });
  unsubs.push(() => bell.destroy());

  const S = { events: [], members: [], reqs: [], invites: [], loaded: false, error: false, reqTab: "pending", granted: new Set(), busy: new Set() };

  // ═════════ HERO ═════════
  const rolePill = h("span", { class: cx(`${P}-role`, !isOwner && "is-staff") },
    isOwner ? ico("shield", 13, { color: "#FF4FA3" }) : ico("people", 13, { color: "#4ED8FF" }), isOwner ? "Sahip" : "Personel");
  const metaTxt = h("span", {}, "");
  const actions = [
    isOwner ? dkButton("Personel davet et", { variant: "outline", size: 44, href: "#/organizer/ekip?davet=1", icon: ico("userPlus", 17) }) : null,
    dkButton("Etkinlik oluştur", { variant: "primary", size: 44, href: "#/organizer/etkinlik?yeni=1", icon: ico("plus", 17, { color: "#06070A", sw: "2.2" }) }),
  ].filter(Boolean);
  const hero = dkPageHero({ eyebrow: `${trUpper(O.orgName)} · ORGANİZATÖR`, title: "Bu hafta ", em: "sahnede", tail: " neler var?", actions, cls: `${P}-hero` });
  hero.setAttribute("aria-label", "Organizasyon");
  hero.querySelector("h1").style.fontSize = ""; // boyut CSS'te (52 → ≤1023'te 40)
  hero.querySelector(".dk-hero-l").append(h("div", { class: `${P}-meta` }, rolePill, metaTxt));
  root.append(hero);

  // ═════════ KPI ═════════
  const kpi = {
    up: dkKpi({ label: "YAKLAŞAN ETKİNLİK", value: "", sub: "Bugünden itibaren, iptal edilmemiş", icon: ico("calendar", 16, { color: "#FF4FA3" }), color: "#FF4FA3" }),
    pend: dkKpi({ label: "BEKLEYEN MEKAN İSTEĞİ", value: "", sub: "Mekan onayı bekleniyor", icon: ico("clock", 16, { color: "#FFD700" }), color: "#FFD700" }),
    team: dkKpi({ label: "EKİP ÜYESİ", value: "", sub: "\u00a0", icon: ico("people", 16, { color: "#4ED8FF" }), color: "#4ED8FF" }),
    past: dkKpi({ label: "GEÇMİŞ ETKİNLİK", value: "", sub: "Tamamlanan etkinlikler", icon: ico("check", 16, { color: "#A3A7AF" }), color: "#A3A7AF" }),
  };
  const kpiRow = h("section", { "aria-label": "Özet", class: `${P}-kpis` }, kpi.up, kpi.pend, kpi.team, kpi.past);
  root.append(kpiRow);

  // ═════════ ORTAK PARÇALAR ═════════
  const head = (num, title, id, link) => h("div", { class: `${P}-head` },
    h("div", { class: `${P}-hl` }, h("span", { class: `${P}-num` }, num), h("h2", { id, class: `${P}-h2` }, title)),
    link ? h("a", { href: link.href, class: `${P}-more dk-link` }, link.label, ico("arrow", 14)) : null);
  const skelRows = (n, hgt) => Array.from({ length: n }, () => h("div", { class: `${P}-skrow`, style: { height: hgt + "px" }, "aria-hidden": "true" },
    dkSkeleton({ w: 40, h: 40, r: 8 }), h("div", { class: `${P}-skcol` }, dkSkeleton({ w: "55%", h: 14 }), dkSkeleton({ w: "35%", h: 11 }))));

  // ═════════ 01 · YAKLAŞAN ETKİNLİKLER ═════════
  const upBody = h("div", { class: `${P}-evlist` }, ...skelRows(4, 76));
  const upCard = h("section", { "aria-labelledby": `${P}-h-up`, class: `${P}-card` },
    head("01", "Yaklaşan Etkinlikler", `${P}-h-up`, { href: "#/organizer/etkinlik", label: "Tümü" }),
    upBody,
    h("div", { class: `${P}-note` }, ico("info", 15), "En yakın 5 etkinlik gösterilir. Etkinlikler, mekan isteği onaylandığında burada görünür."));

  const evThumb = (url) => {
    const box = h("span", { class: `${P}-evthumb` });
    const fb = () => { box.replaceChildren(ico("calendar", 20, { color: "#5E636D" })); box.classList.add("is-empty"); };
    if (url) { const img = h("img", { src: url, alt: "", loading: "lazy", decoding: "async" }); img.addEventListener("error", fb, { once: true }); box.append(img); } else fb();
    return box;
  };
  function drawUpcoming() {
    const list = upcomingEvents(S.events).slice(0, 5);
    if (!list.length) {
      upBody.replaceChildren(dkEmpty({ variant: "plain", icon: ico("calendar", 30, { color: "#5E636D" }), title: "Henüz etkinlik yok",
        action: dkButton("Etkinlik Oluştur", { variant: "primary", size: 40, href: "#/organizer/etkinlik?yeni=1", icon: ico("plus", 15, { color: "#06070A", sw: "2.2" }) }) }));
      return;
    }
    upBody.replaceChildren(...list.map((e) => {
      const ms = evStart(e);
      const d = ms != null ? new Date(ms) : null;
      // artboard: mekan · saat · sanatçı ayrı flex öğeleri (gap 6) → "·" iki yanı 6px; tek kesilen (ellipsis) satırda ayraç span'ı
      const parts = [e.venueName || "", evTime(e), e.artistName || ""].filter(Boolean);
      const meta = parts.flatMap((t, i) => (i ? [h("span", { class: `${P}-sep` }, "·"), t] : [t]));
      return h("a", { href: `#/organizer/etkinlik?duzenle=${encodeURIComponent(e.id)}`, class: `${P}-ev dk-row`, "aria-label": `${e.title || "Etkinlik"} etkinliğini düzenle` },
        evThumb(e.bannerUrl),
        h("span", { class: `${P}-date`, "aria-hidden": "true" }, h("span", { class: `${P}-dd` }, d ? String(d.getDate()) : "—"), h("span", { class: `${P}-mm` }, d ? monShort(ms) : "")),
        h("span", { class: `${P}-info` },
          h("span", { class: `${P}-evt` }, e.title || "Etkinlik"),
          h("span", { class: `${P}-evm` }, ico("pin", 13, { color: "#FF8A2A" }), h("span", { class: "dk-truncate" }, ...(meta.length ? meta : ["—"])))),
        dkStatusBadge(evStatusKey(e), { variant: "pill" }),
        h("span", { class: `${P}-chev` }, ico("chevR", 18)));
    }));
  }

  // ═════════ 02 · MEKAN İSTEKLERİ ═════════
  const tabBtns = new Map();
  const reqListId = `${P}-reqlist`;
  const seg = h("div", { role: "tablist", "aria-label": "İstek durumu", class: `${P}-seg` });
  REQ_TABS.forEach(([k, label]) => {
    const n = h("span", { class: `${P}-segn` }, "0");
    const b = h("button", { type: "button", role: "tab", id: `${P}-tab-${k}`, "aria-selected": "false", "aria-controls": reqListId, tabindex: "-1", class: `${P}-segb dk-press` }, label, n);
    b.addEventListener("click", () => { S.reqTab = k; drawReqs(); });
    tabBtns.set(k, { b, n });
    seg.append(b);
  });
  seg.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const keys = REQ_TABS.map(([k]) => k);
    let i = keys.indexOf(S.reqTab);
    if (e.key === "ArrowLeft") i = (i - 1 + keys.length) % keys.length;
    else if (e.key === "ArrowRight") i = (i + 1) % keys.length;
    else i = e.key === "Home" ? 0 : keys.length - 1;
    S.reqTab = keys[i]; drawReqs(); tabBtns.get(keys[i]).b.focus();
  });
  const reqList = h("div", { id: reqListId, role: "tabpanel", class: `${P}-reqlist` }, ...skelRows(2, 100));
  const reqCard = h("section", { "aria-labelledby": `${P}-h-req`, class: `${P}-card is-col` },
    head("02", "Mekan İstekleri", `${P}-h-req`, { href: "#/organizer/mekan", label: "Mekan seç" }),
    seg, reqList,
    h("div", { class: `${P}-reqfoot` }, "Reddedilen istekler için mekanla mesajlaşabilir veya başka bir mekan seçebilirsin."));

  function drawReqs() {
    // artboard sırası: bekleyen → onaylanan → reddedilen (her grup tarihe göre) — avatar gradyanı bu sıradaki index % 5
    const rank = (r) => ({ pending: 0, accepted: 1, rejected: 2 }[r.status] ?? 3);
    const all = [...S.reqs].sort((a, b) => rank(a) - rank(b) || (reqMs(a) ?? 0) - (reqMs(b) ?? 0));
    tabBtns.forEach(({ b, n }, k) => {
      const on = k === S.reqTab;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      n.textContent = S.loaded ? String(all.filter((r) => r.status === k).length) : "–";
      if (on) reqList.setAttribute("aria-labelledby", b.id);
    });
    if (!S.loaded) return;
    const rows = all.map((r, i) => ({ r, i })).filter(({ r }) => r.status === S.reqTab);
    if (!rows.length) { reqList.replaceChildren(h("div", { class: `${P}-reqempty` }, "Bu durumda istek yok.")); return; }
    reqList.replaceChildren(...rows.map(({ r, i }) => {
      const ms = reqMs(r);
      const venue = r.venueName || "Mekan";
      const meta = [venue, ms != null ? fmtDayMon(ms) : "", r.eventTime || ""].filter(Boolean).join(" · ");
      return h("div", { class: `${P}-req dk-row` },
        h("span", { class: `${P}-rav`, style: { background: GR[i % GR.length] }, "aria-hidden": "true" }, venue.charAt(0).toLocaleUpperCase("tr-TR")),
        h("div", { class: `${P}-rcol` },
          h("span", { class: `${P}-rt` }, r.title || "Etkinlik"),
          h("span", { class: `${P}-rm` }, meta),
          h("span", { class: `${P}-rb` }, dkStatusBadge(r.status === "accepted" ? "accepted" : r.status === "rejected" ? "rejected" : "pending", { variant: "pill" }))),
        r.venueId ? h("button", { type: "button", class: `${P}-rmsg dk-press`, "aria-label": `${venue} ile mesajlaş`, onclick: () => openVenueChat(r.venueId, r.venueName) }, ico("chat", 17)) : null);
    }));
  }

  root.append(h("div", { class: `${P}-row` }, upCard, reqCard));

  // ═════════ 03 · EKİP AKTİVİTESİ ═════════
  const actBody = h("div", { class: `${P}-actlist` }, ...skelRows(3, 72));
  const actCard = h("section", { id: "aktivite", "aria-labelledby": `${P}-h-act`, class: `${P}-card` },
    head("03", "Ekip aktivitesi", `${P}-h-act`, { href: "#/organizer/ekip", label: "Ekibe git" }), actBody);
  let lastNotifs = [];

  function activityItems() {
    const out = [];
    const evById = new Map(S.events.map((e) => [e.id, e]));
    // (1) sahip: düzenleme izni istekleri (okunmamış / verilmemiş / bu oturumda verilen) — İzin Ver
    if (isOwner) {
      const seen = new Set();
      lastNotifs.filter((n) => n.type === "edit_request" && n.eventId).forEach((n) => {
        const staffId = n.staffId || n.relatedUserId;
        const ev = evById.get(n.eventId);
        if (!staffId || !ev) return;               // silinmiş / başka org etkinliği → izin verilemez
        const key = `${n.eventId}|${staffId}`;
        if (seen.has(key)) return; seen.add(key);
        const granted = Array.isArray(ev.editApprovedFor) && ev.editApprovedFor.includes(staffId);
        if (granted && n.read && !S.granted.has(key)) return;
        const who = n.staffName || n.fromName || "Personel";
        out.push({ kind: "perm", key, n, ev, staffId, granted, t: "Düzenleme İzni İstendi",
          b: `${who}, “${ev.title || "Etkinlik"}” etkinliğini düzenlemek istiyor.`, ms: toMs(n.createdAt) ?? 0 });
      });
    } else {
      // personel: sahibin verdiği izinler
      lastNotifs.filter((n) => n.type === "edit_approved").forEach((n) => {
        out.push({ kind: "row", icon: "check", c: "#7CE0B0", t: n.title || "Düzenleme İzni Verildi", b: n.body || "", ms: toMs(n.createdAt) ?? 0, time: n.createdAt });
      });
    }
    // (2) davetler (sahip; orgInvites yalnız gönderenin davetleri)
    S.invites.forEach((iv) => {
      const email = iv.invitedEmail || "";
      if (iv.status === "accepted") {
        const m = S.members.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
        const tm = m?.joinedAt || iv.createdAt;
        out.push({ kind: "row", icon: "check", c: "#7CE0B0", t: "Davet kabul edildi", b: `${email} ekibe personel olarak katıldı.`, ms: toMs(tm) ?? 0, time: tm });
      } else if (iv.status === "pending") {
        out.push({ kind: "row", icon: "mail", c: "#4ED8FF", t: "Personel daveti gönderildi", b: `${email} adresine davet gönderildi · Bekliyor`, ms: toMs(iv.createdAt) ?? 0, time: iv.createdAt });
      }
    });
    // (3) reddedilen mekan istekleri
    S.reqs.filter((r) => r.status === "rejected").forEach((r) => {
      const tm = r.updatedAt || r.createdAt;
      out.push({ kind: "row", icon: "x", c: "#FF5A6E", t: "Mekan isteği reddedildi", b: `${r.venueName || "Mekan"}, “${r.title || "Etkinlik"}” isteğini reddetti.`, ms: toMs(tm) ?? 0, time: tm });
    });
    const perms = out.filter((x) => x.kind === "perm").sort((a, b) => b.ms - a.ms);
    const rest = out.filter((x) => x.kind !== "perm").sort((a, b) => b.ms - a.ms);
    return [...perms, ...rest].slice(0, Math.max(MAX_ACT, perms.length));
  }
  const okChip = () => h("span", { class: `${P}-okchip` }, ico("check", 13, { color: "#7CE0B0", sw: "2.4" }), "İzin verildi");
  function drawActivity() {
    if (!S.loaded) return;
    const items = activityItems();
    if (!items.length) {
      actBody.replaceChildren(h("div", { class: `${P}-actempty` }, ico("people", 22, { color: "#5E636D" }),
        h("span", { class: `${P}-actet` }, "Henüz ekip aktivitesi yok"),
        h("span", {}, isOwner ? "Personel davetleri, düzenleme izni istekleri ve mekan yanıtları burada görünür." : "Düzenleme izinleri ve mekan yanıtları burada görünür.")));
      return;
    }
    actBody.replaceChildren(...items.map((it) => {
      if (it.kind === "perm") {
        const done = it.granted || S.granted.has(it.key);
        let ctl;
        if (done) ctl = okChip();
        else {
          ctl = dkButton("İzin Ver", { variant: "primary", size: 40, icon: ico("check", 15, { color: "#06070A", sw: "2.4" }), cls: `${P}-grant`, busy: S.busy.has(it.key) });
          ctl.addEventListener("click", () => grant(it, ctl));
        }
        return h("div", { class: `${P}-act is-perm` },
          h("span", { class: `${P}-atile`, style: { background: "rgba(255,79,163,0.12)" } }, ico("key", 17, { color: "#FF4FA3" })),
          h("div", { class: `${P}-acol` }, h("span", { class: `${P}-at` }, it.t), h("span", { class: `${P}-ab` }, it.b)),
          ctl);
      }
      return h("div", { class: `${P}-act` },
        h("span", { class: `${P}-atile`, style: { background: rgba(it.c, 0.12), color: it.c } }, ico(it.icon, 17)),
        h("div", { class: `${P}-acol` }, h("span", { class: `${P}-at` }, it.t), h("span", { class: `${P}-ab` }, it.b)),
        h("span", { class: `${P}-atime` }, orgAgo(it.time)));
    }));
  }
  async function grant(it, btn) {
    if (S.busy.has(it.key)) return;
    S.busy.add(it.key); btn.dk.setBusy(true);
    try {
      await grantEditPermission({ eventId: it.ev.id, eventTitle: it.ev.title, staffId: it.staffId,
        notifIds: lastNotifs.filter((n) => n.type === "edit_request" && n.eventId === it.ev.id && (n.staffId || n.relatedUserId) === it.staffId && !n.read).map((n) => n.id) });
      if (!alive) return;
      it.ev.editApprovedFor = [...(Array.isArray(it.ev.editApprovedFor) ? it.ev.editApprovedFor : []), it.staffId];
      S.granted.add(it.key);
      dkToast("İzin verildi");
    } catch (e) {
      console.warn("[org grant]", e);
      if (alive) dkToast("İzin verilemedi", { type: "err" });
    } finally {
      S.busy.delete(it.key);
      if (alive) drawActivity();
    }
  }
  unsubs.push(bell.onNotifs((list) => { lastNotifs = list || []; drawActivity(); }));

  // ═════════ 04 · HIZLI ERİŞİM ═════════
  const tile = (href, c, icon, label, sub) => h("a", { href, class: `${P}-tile dk-card` },
    h("span", { class: `${P}-ttile`, style: { background: rgba(c, 0.12) } }, ico(icon, 18, { color: c })),
    h("span", { class: `${P}-tcol` }, h("span", { class: `${P}-tl` }, label), h("span", { class: `${P}-ts` }, sub)));
  const quick = h("section", { "aria-labelledby": `${P}-h-quick`, class: `${P}-quick` },
    h("div", { class: `${P}-hl` }, h("span", { class: `${P}-num` }, "04"), h("h2", { id: `${P}-h-quick`, class: `${P}-h2` }, "Hızlı erişim")),
    h("div", { class: `${P}-tiles` },
      tile("#/organizer/ekip", "#FF4FA3", "people", "Ekip", "Üyeler ve yetkiler"),
      tile("#/organizer/etkinlik", "#4ED8FF", "calendar", "Etkinlikler", "Aktif ve geçmiş"),
      isOwner ? tile("#/organizer/ekip?davet=1", "#7CE0B0", "userPlus", "Davet Et", "E-posta ile personel") : null,
      tile("#/organizer/mesaj", "#A78BFA", "chat", "Mesajlar", "Mekanlarla yazış")));
  const rowB = h("div", { class: `${P}-row` }, actCard, quick);
  root.append(rowB);

  // ═════════ VERİ ═════════
  function drawAll() {
    if (S.error) return;
    const up = upcomingEvents(S.events);
    const owners = S.members.filter((m) => m.role === "owner").length;
    const staff = S.members.filter((m) => m.role === "staff").length;
    kpi.up.dk.setValue(String(up.length));
    kpi.pend.dk.setValue(String(S.reqs.filter((r) => r.status === "pending").length));
    kpi.team.dk.setValue(String(S.members.length));
    kpi.team.dk.setSub(`${owners} sahip · ${staff} personel`);
    kpi.past.dk.setValue(String(S.events.filter(isPastEv).length));
    metaTxt.textContent = `${S.members.length} üye · ${up.length} yaklaşan etkinlik`;
    drawUpcoming();
    drawReqs();
    drawActivity();
  }
  // yükleme iskeleti: KPI değerleri
  Object.values(kpi).forEach((k) => { const v = k.querySelector(".dk-kpi-vt"); v.replaceChildren(dkSkeleton({ w: 36, h: 28, r: 6 })); });
  drawReqs();

  (async () => {
    if (!uid) { fail(); return; }
    try {
      const [events, members, reqs, invites] = await Promise.all([
        organizerEvents(orgId),
        orgMembers(orgId).catch(() => []),
        organizerRequests(uid).catch(() => []),
        isOwner ? orgInvites(uid).catch(() => []) : Promise.resolve([]),
      ]);
      if (!alive) return;
      Object.assign(S, { events: events || [], members: members || [], reqs: reqs || [], invites: invites || [], loaded: true });
      shell.setBadge("etkinlik", S.reqs.filter((r) => r.status === "pending").length);
      bell.setRequests(S.reqs);
      drawAll();
    } catch (e) {
      console.warn("[org panel]", e);
      if (alive) fail();
    }
  })();
  function fail() {
    S.error = true;
    kpiRow.remove();
    root.querySelectorAll(`.${P}-row`).forEach((x) => x.remove());
    metaTxt.textContent = "";
    root.append(dkEmpty({ variant: "dashed", icon: ico("alert", 30, { color: "#5E636D" }), title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile.", height: 280 }));
  }

  return {
    node: shell.node,
    update() {},
    onSession(s) {
      const a = s?.profile || {};
      return a.orgName === O.p.orgName && a.orgRole === O.p.orgRole && a.photoURL === O.p.photoURL && a.displayName === O.p.displayName && a.orgId === O.p.orgId;
    },
    destroy() {
      alive = false;
      unsubs.forEach((f) => { try { f(); } catch (_) {} });
      shell.destroy();
    },
  };
}
