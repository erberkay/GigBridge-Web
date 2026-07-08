// Organizatör paneli — app paritesi: Ana Sayfa (dashboard), Etkinlikler (Aktif/Geçmiş + istek + oluştur),
// Ekip (üyeler + e-posta daveti), Mekan Seç (istek gönder), Mesajlar, Profil. Accent: #F43F5E.
import { session, logout, refreshProfile } from "../store.js";
import {
  organizerEvents, organizerRequests, saveProfile, listVenues, listArtists, createVenueRequest, uploadImage,
  eventById, listenNotifications, markNotifRead, deleteNotif,
  orgMembers, removeOrgMember, orgInvites, createOrgInvite,
  updateEventFields, deleteEventById, sendNotification, createOrgVenueRequest, approveEventEdit, eventStartMs,
} from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, photoPicker, modal, fmtDate, ROLE } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";
import { changeEmailModal, changePasswordModal, deleteAccountModal } from "./auth.js";

const C = ROLE.organizer; // #F43F5E
const NAV = [
  { key: "home", label: "Ana Sayfa", icon: "home-outline", href: "#/organizer" },
  { key: "etkinlik", label: "Etkinlikler", icon: "calendar-outline", href: "#/organizer/etkinlik" },
  { key: "mekan", label: "Mekan Seç", icon: "business-outline", href: "#/organizer/mekan" },
  { key: "mesaj", label: "Mesajlar", icon: "chatbubbles-outline", href: "#/organizer/mesaj" },
  { key: "profil", label: "Profil", icon: "person-outline", href: "#/organizer/profil" },
];
const TITLES = { home: "Ana Sayfa", etkinlik: "Etkinlikler", mekan: "Mekan Seç", mesaj: "Mesajlar", profil: "Profil", ekip: "Ekip", bildirim: "Bildirimler" };
const GRADS = [["#A855F7", "#7C3AED"], ["#F59E0B", "#B45309"], ["#10B981", "#059669"], ["#3B82F6", "#1D4ED8"], ["#F43F5E", "#BE123C"], ["#06B6D4", "#0891B2"]];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRX = { "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u", "â": "a", "î": "i", "û": "u" };
const fold = (s) => String(s || "").replace(/[ıİşŞçÇğĞöÖüÜâîû]/g, (c) => TRX[c] || c).toLowerCase();

// Hızlı erişim / boş durum yönlendirmeleri (hash değişince sekmede modal aç)
let wantInvite = false;
let wantCreate = false;

export function organizerPage() {
  const tab = tabFromHash();
  const p = session.profile || {};
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  let head;
  if (tab === "home") {
    // App OrganizerHome header: gradient + ad + bildirim zili
    head = h("header", { class: "topbar ox-header", style: { "--role": C } },
      h("div", { class: "ox-hname" }, p.displayName || p.orgName || "Organizatör"),
      h("button", { class: "ox-bell", title: "Bildirimler", onclick: () => { location.hash = "#/organizer/bildirim"; } },
        icon("notifications-outline", { size: 22 })));
  } else {
    head = topbar(TITLES[tab] || "Organizatör", { subtitle: p.orgName || p.displayName || "", color: C,
      right: h("button", { class: "icon-btn", title: "Çıkış Yap", onclick: logout }, icon("log-out-outline", { size: 20 })) });
  }
  const page = h("div", { class: "page has-nav", style: { "--role": C } }, head, content, bottomnav(NAV, tab, C));
  renderTab(tab, content);
  return page;
}

function tabFromHash() { const p = (location.hash || "").split("/"); return p[2] || "home"; }

async function renderTab(tab, root) {
  if (tab === "profil") return renderProfile(root);
  if (tab === "home") return renderHome(root);
  if (tab === "etkinlik") return renderEvents(root);
  if (tab === "ekip") return renderTeam(root);
  if (tab === "bildirim") return renderNotifs(root);
  if (tab === "mekan") return renderVenues(root);
  if (tab === "mesaj") { clear(root); return messagesView(root, C); }
  clear(root);
  root.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor."));
}

// ── Ortak yardımcılar ──
function v(sel) { return (document.querySelector(sel)?.value || "").trim(); }
function sect(title, ic, count, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head row-between" },
      h("h2", { class: "sect-title" }, icon(ic, { size: 16 }), " " + title),
      count ? h("span", { class: "count-pill" }, count) : null),
    ...kids);
}
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function evMs(ev) {
  const val = ev.eventAt ?? ev.date;
  try {
    if (val && typeof val.toMillis === "function") return val.toMillis();
    if (typeof val === "string" && val) { const t = Date.parse(`${val}T${ev.startTime || "00:00"}:00`); return isNaN(t) ? null : t; }
    const t = Date.parse(val); return isNaN(t) ? null : t;
  } catch { return null; }
}
function evEnd(ev) {
  try { if (ev.endAt && typeof ev.endAt.toMillis === "function") return ev.endAt.toMillis(); } catch (_) {}
  const s = evMs(ev); return s == null ? null : s + 3 * 3600e3;
}
function isLive(ev) { const s = evMs(ev), e = evEnd(ev); if (s == null) return false; const n = Date.now(); return n >= s && n <= e; }
function isPastEv(ev) {
  if (["completed", "past", "cancelled", "archived"].includes(ev.status)) return true;
  const e = evEnd(ev); return e != null && e < Date.now();
}
function evWhen(ev) {
  const d = typeof ev.date === "string" && ev.date ? fmtDate(ev.date) : fmtDate(ev.eventAt || ev.date);
  return [d, ev.startTime].filter(Boolean).join(" ");
}
function evStatusBadge(ev, dimUpcoming) {
  if (isLive(ev)) return h("span", { class: "ox-status ox-st-live" }, "Canlı");
  if (isPastEv(ev)) return h("span", { class: "ox-status" }, "Geçmiş");
  return h("span", { class: "ox-status" + (dimUpcoming ? "" : " ox-st-up") }, "Yaklaşan");
}
function msgBtn(otherId, otherName) {
  if (!otherId) return null;
  return h("button", { class: "ox-msgbtn", title: "Mesaj", onclick: (e) => {
    e.stopPropagation();
    requestChat({ otherId, otherName: otherName || "Mekan" });
    location.hash = "#/organizer/mesaj";
  } }, icon("chatbubble-ellipses-outline", { size: 18 }));
}
function backBtn() {
  return h("button", { class: "ox-back", onclick: () => { location.hash = "#/organizer"; } }, icon("chevron-back", { size: 14 }), "Ana Sayfa");
}

// ══════════ ANA SAYFA — app OrganizerHomeScreen paritesi ══════════
async function renderHome(root) {
  try {
    const uid = session.user.uid;
    const p = session.profile || {};
    const orgId = p.orgId || uid;
    const isOwner = (p.orgRole || "owner") !== "staff";
    const [events, members] = await Promise.all([
      organizerEvents(orgId),
      orgMembers(orgId).catch(() => []),
    ]);
    const t0 = startOfToday();
    const upcoming = events
      .filter((e) => e.status !== "cancelled" && (evMs(e) ?? 0) >= t0)
      .sort((a, b) => (evMs(a) ?? 0) - (evMs(b) ?? 0));
    clear(root);
    const refresh = () => renderHome(root);

    // Organizasyon kartı (rol rozeti + üye/etkinlik sayaçları)
    root.append(h("div", { class: "ox-orgcard" },
      h("div", { class: "ox-orgleft" },
        h("div", { class: "ox-orgicon" }, icon("business", { size: 22 })),
        h("div", { class: "grow", style: { minWidth: 0 } },
          h("div", { class: "ox-orgname" }, p.orgName || "Organizasyonunuz"),
          h("span", { class: "ox-rolebadge" },
            icon(isOwner ? "shield-checkmark" : "people", { size: 12, color: C }),
            isOwner ? "Sahip" : "Personel"))),
      h("div", { class: "ox-orgstats" },
        h("div", { class: "ox-stat" }, h("div", { class: "ox-statv" }, String(members.length)), h("div", { class: "ox-statl" }, "Üye")),
        h("div", { class: "ox-stat" }, h("div", { class: "ox-statv" }, String(upcoming.length)), h("div", { class: "ox-statl" }, "Etkinlik")))));

    // Hızlı Erişim 4'lü grid
    const quick = [
      { label: "Ekip", ic: "people-outline", color: "#F43F5E", go: () => { location.hash = "#/organizer/ekip"; } },
      { label: "Etkinlikler", ic: "calendar-outline", color: "#3B82F6", go: () => { location.hash = "#/organizer/etkinlik"; } },
      { label: "Davet Et", ic: "person-add-outline", color: "#10B981", go: () => { wantInvite = true; location.hash = "#/organizer/ekip"; } },
      { label: "Mesajlar", ic: "chatbubbles-outline", color: "#A855F7", go: () => { location.hash = "#/organizer/mesaj"; } },
    ];
    root.append(h("section", { class: "ox-sect" },
      h("div", { class: "ox-secthead" }, h("h2", { class: "ox-secttitle" }, "Hızlı Erişim")),
      h("div", { class: "ox-quickgrid" }, ...quick.map((it) =>
        h("button", { class: "ox-quick", onclick: it.go },
          h("span", { class: "ox-quickic", style: { background: it.color + "20" } }, icon(it.ic, { size: 22, color: it.color })),
          h("span", { class: "ox-quicklabel" }, it.label))))));

    // Yaklaşan Etkinlikler (en fazla 5)
    root.append(h("section", { class: "ox-sect" },
      h("div", { class: "ox-secthead" },
        h("h2", { class: "ox-secttitle" }, "Yaklaşan Etkinlikler"),
        h("button", { class: "ox-link", onclick: () => { location.hash = "#/organizer/etkinlik"; } }, "Tümü")),
      upcoming.length
        ? h("div", {}, ...upcoming.slice(0, 5).map((ev) => homeEventRow(ev, refresh)))
        : h("div", { class: "ox-homeempty" },
            icon("calendar-outline", { size: 32, color: "#555570" }),
            h("div", { class: "ox-emptytext" }, "Henüz etkinlik yok"),
            h("button", { class: "ox-cta", onclick: () => { wantCreate = true; location.hash = "#/organizer/etkinlik"; } }, "Etkinlik Oluştur"))));
  } catch (e) {
    clear(root);
    root.append(empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip yenile."));
  }
}

function homeEventRow(ev, refresh) {
  return h("div", { class: "ox-evrow", onclick: () => openEditEvent(ev, { onDone: refresh }) },
    h("div", { class: "ox-evleft" },
      ev.bannerUrl
        ? h("div", { class: "ox-evthumb", style: { backgroundImage: `url(${ev.bannerUrl})` } })
        : h("div", { class: "ox-evdot" }),
      h("div", { class: "grow", style: { minWidth: 0 } },
        h("div", { class: "ox-evtitle" }, ev.title || "Etkinlik"),
        h("div", { class: "ox-evmeta" }, [(ev.venueName || "—"), evWhen(ev)].filter(Boolean).join(" · ")))),
    evStatusBadge(ev, true));
}

// ══════════ ETKİNLİKLER — app OrgEventsScreen paritesi ══════════
async function renderEvents(root) {
  clear(root);
  const uid = session.user.uid;
  const p = session.profile || {};
  const orgId = p.orgId || uid;
  let tabSel = "upcoming";
  let events = [], reqs = [];

  const body = h("div", {}, h("div", { class: "loading" }, spinner()));
  const btnUp = h("button", { class: "ox-tab on", onclick: () => setTab("upcoming") }, "Aktif");
  const btnPast = h("button", { class: "ox-tab", onclick: () => setTab("past") }, "Geçmiş");
  root.append(
    h("div", { class: "ox-tabs" }, btnUp, btnPast),
    body,
    h("button", { class: "ox-fab", title: "Yeni Etkinlik", onclick: () => openCreateEvent(refresh) }, icon("add", { size: 24 })));

  function setTab(t) {
    tabSel = t;
    btnUp.classList.toggle("on", t === "upcoming");
    btnPast.classList.toggle("on", t === "past");
    paint();
  }
  async function refresh() {
    try { [events, reqs] = await Promise.all([organizerEvents(orgId), organizerRequests(uid)]); paint(); } catch (_) {}
  }
  function paint() {
    clear(body);
    if (tabSel === "upcoming") {
      // Mekan istekleri (bekleyen + reddedilen) — durum rozetleriyle
      const open = reqs.filter((r) => r.status === "pending" || r.status === "rejected");
      if (open.length) {
        body.append(h("div", { class: "ox-reqhead" }, "Mekan İstekleri"));
        open.forEach((r) => body.append(reqCard(r)));
      }
      const list = events.filter((e) => !isPastEv(e));
      if (!list.length) body.append(empty("calendar-outline", "Aktif etkinlik yok", "Mekan onayladığında etkinliklerin burada görünür."));
      else list.forEach((ev) => body.append(evCard(ev, refresh)));
    } else {
      const list = events.filter((e) => isPastEv(e));
      if (!list.length) body.append(empty("calendar-outline", "Geçmiş etkinlik yok", ""));
      else list.forEach((ev) => body.append(evCard(ev, refresh)));
    }
  }

  try { [events, reqs] = await Promise.all([organizerEvents(orgId), organizerRequests(uid)]); }
  catch (_) { clear(body); body.append(empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip yenile.")); return; }
  paint();
  if (wantCreate) { wantCreate = false; openCreateEvent(refresh); }
}

function reqCard(r) {
  const rej = r.status === "rejected";
  return h("div", { class: "ox-reqcard" },
    h("div", { class: "grow", style: { minWidth: 0 } },
      h("div", { class: "ox-evtitle" }, r.title || "Etkinlik"),
      h("div", { class: "ox-evmeta" },
        [r.venueName, [r.eventDate ? fmtDate(r.eventDate) : "", r.eventTime].filter(Boolean).join(" ")].filter(Boolean).join(" · "))),
    h("span", { class: "ox-status " + (rej ? "ox-st-rej" : "ox-st-pend") }, rej ? "Reddedildi" : "Onay Bekliyor"),
    msgBtn(r.venueId, r.venueName));
}

function evCard(ev, refresh) {
  return h("div", { class: "ox-evrow", onclick: () => openEditEvent(ev, { onDone: refresh }) },
    h("div", { class: "ox-evleft" },
      ev.bannerUrl
        ? h("div", { class: "ox-evthumb round", style: { backgroundImage: `url(${ev.bannerUrl})` } })
        : h("div", { class: "ox-evthumb round" }, icon("calendar", { size: 18 })),
      h("div", { class: "grow", style: { minWidth: 0 } },
        h("div", { class: "ox-evtitle" }, ev.title || "Etkinlik"),
        h("div", { class: "ox-evmeta" }, [ev.venueName, evWhen(ev)].filter(Boolean).join(" · ")),
        ev.description ? h("div", { class: "ox-evdesc" }, ev.description) : null)),
    h("div", { class: "ox-evright" },
      evStatusBadge(ev, false),
      msgBtn(ev.venueId, ev.venueName)));
}

// ── Yeni Etkinlik modalı (fotoğraf + mekan seç + sanatçı seç + tarih/saat + açıklama) ──
function openCreateEvent(onDone) {
  const p = session.profile || { id: session.user?.uid };
  let venueSel = null, artistSel = null, busy = false;
  const pic = photoPicker("Kapak fotoğrafı ekle (16:9, opsiyonel)", undefined, { aspect: 16 / 9 });

  const venueLbl = h("span", { class: "grow" }, "Mekan Seç * (istek gönderilir)");
  const venueBtn = h("button", { type: "button", class: "ox-selbtn", onclick: openVenuePick },
    icon("business-outline", { size: 18 }), venueLbl, icon("chevron-down", { size: 16 }));

  const artistLbl = h("span", { class: "grow" }, "Sistemden sanatçı seçin (opsiyonel)");
  const artistBtn = h("button", { type: "button", class: "ox-selbtn", style: { marginBottom: "0" }, onclick: openArtistPick },
    icon("mic-outline", { size: 18 }), artistLbl, icon("chevron-down", { size: 16 }));
  const artistClear = h("button", { type: "button", class: "ox-clearbtn", style: { display: "none" }, onclick: clearArtist },
    icon("close-circle", { size: 16 }), "Kaldır");
  const artistNote = h("div", { class: "ox-selnote", style: { display: "none" } },
    icon("checkmark-circle", { size: 13, color: "#10B981" }), "Kayıtlı sanatçı seçildi — kabul edilince teklif gönderilir");

  const body = h("div", {},
    pic.node,
    field({ label: "Etkinlik Adı *", id: "oxctitle", placeholder: "Örn. Yaz Festivali" }),
    venueBtn,
    h("div", { class: "ox-selrow" }, artistBtn, artistClear),
    artistNote,
    h("div", { class: "frow", style: { marginTop: "13px" } },
      field({ label: "Etkinlik Tarihi *", id: "oxcdate", type: "date" }),
      field({ label: "Saat", id: "oxctime", type: "time" })),
    field({ label: "Açıklama", id: "oxcdesc", placeholder: "Açıklama...", multiline: true }));
  body.querySelector("#oxcdate")?.setAttribute("min", todayISO());

  modal({ title: "Yeni Etkinlik", body, actions: [
    { label: "İptal", variant: "ghost", onClick: () => {} },
    { label: "Oluştur", ic: "add-circle-outline", keepOpen: true, onClick: async (close) => {
      if (busy) return;
      const f = { title: v("#oxctitle"), date: v("#oxcdate"), time: v("#oxctime"), description: v("#oxcdesc") };
      if (!f.title) return toast("Etkinlik adı gir", "err");
      if (!venueSel) return toast("Mekan seç", "err");
      if (!f.date) return toast("Etkinlik tarihi seç", "err");
      busy = true;
      try {
        // Aynı başlık/mekan/tarih/saat için bekleyen ya da kabul edilmiş istek varsa engelle
        const prev = await organizerRequests(session.user.uid);
        const dup = prev.find((r) => ["pending", "accepted"].includes(r.status) && r.venueId === venueSel.id
          && (r.title || "") === f.title && r.eventDate === f.date && (r.eventTime || "") === (f.time || ""));
        if (dup) { busy = false; return toast("Bu istek zaten gönderilmiş", "err"); }
        if (artistSel) { f.artistId = artistSel.id; f.artistName = artistSel.name; }
        try { if (pic.getFile()) f.bannerUrl = await uploadImage(pic.getFile(), session.user.uid); } catch (_) { /* foto olmadan devam */ }
        await createOrgVenueRequest(p, venueSel, f);
        toast("İstek gönderildi — " + (venueSel.displayName || "Mekan"));
        close(); onDone && onDone();
      } catch (e) { toast("İstek gönderilemedi", "err"); }
      busy = false;
    } },
  ] });

  function clearArtist() {
    artistSel = null;
    artistLbl.textContent = "Sistemden sanatçı seçin (opsiyonel)";
    artistBtn.classList.remove("set");
    artistClear.style.display = "none";
    artistNote.style.display = "none";
  }

  function openVenuePick() {
    const list = h("div", { class: "ox-picklist" }, h("div", { class: "loading" }, spinner()));
    const search = h("input", { placeholder: "Mekan ara...", oninput: () => paint() });
    let all = null;
    const m = modal({ title: "Mekan Seç", body: h("div", {}, h("label", { class: "field" }, search), list), actions: [] });
    const paint = () => {
      if (!all) return;
      const q = fold(search.value);
      clear(list);
      const filtered = all.filter((vn) => !q || fold(vn.displayName).includes(q) || fold(vn.city || vn.location?.city).includes(q));
      if (!filtered.length) return list.append(h("div", { class: "ox-pickempty" }, "Kayıtlı mekan bulunamadı."));
      filtered.forEach((vn) => list.append(h("div", { class: "ox-pickrow", onclick: () => {
        venueSel = vn;
        venueLbl.textContent = vn.displayName || "Mekan";
        venueBtn.classList.add("set");
        m.close();
      } },
        h("div", { class: "ox-pickav" }, (vn.displayName || "M").charAt(0).toUpperCase()),
        h("div", { class: "grow" },
          h("div", { class: "ox-pickname" }, vn.displayName || "Mekan"),
          (vn.city || vn.location?.city) ? h("div", { class: "ox-pickcity" }, vn.city || vn.location?.city) : null),
        icon("chevron-forward", { size: 18, color: "#555570" }))));
    };
    listVenues().then((vs) => { all = vs; paint(); })
      .catch(() => { clear(list); list.append(h("div", { class: "ox-pickempty" }, "Mekanlar yüklenemedi.")); });
  }

  function openArtistPick() {
    const list = h("div", { class: "ox-picklist" }, h("div", { class: "loading" }, spinner()));
    const search = h("input", { placeholder: "Sanatçı ara...", oninput: () => paint() });
    let all = null;
    const m = modal({ title: "Sanatçı Seç", body: h("div", {}, h("label", { class: "field" }, search), list), actions: [] });
    const paint = () => {
      if (!all) return;
      const q = fold(search.value);
      clear(list);
      const filtered = all.filter((a) => !q || fold(a.displayName || a.name).includes(q));
      if (!filtered.length) return list.append(h("div", { class: "ox-pickempty" }, "Kayıtlı sanatçı bulunamadı."));
      filtered.forEach((a) => {
        const name = a.displayName || a.name || "Sanatçı";
        const genre = (Array.isArray(a.genres) ? a.genres[0] : a.genre) || "";
        list.append(h("div", { class: "ox-pickrow", onclick: () => {
          artistSel = { id: a.id, name };
          artistLbl.textContent = name;
          artistBtn.classList.add("set");
          artistClear.style.display = "";
          artistNote.style.display = "flex";
          m.close();
        } },
          h("div", { class: "ox-pickav" }, name.charAt(0).toUpperCase()),
          h("div", { class: "grow" },
            h("div", { class: "ox-pickname" }, name),
            (genre || a.city) ? h("div", { class: "ox-pickcity" }, [genre, a.city].filter(Boolean).join(" · ")) : null),
          icon("chevron-forward", { size: 18, color: "#555570" })));
      });
    };
    listArtists().then((as) => {
      all = as.filter((a) => (a.displayName || a.name || "").trim());
      const vc = fold(venueSel?.city || venueSel?.location?.city || "");
      if (vc) all.sort((a, b) => (fold(b.city) === vc ? 1 : 0) - (fold(a.city) === vc ? 1 : 0)); // mekan şehri önce
      paint();
    }).catch(() => { clear(list); list.append(h("div", { class: "ox-pickempty" }, "Sanatçılar yüklenemedi.")); });
  }
}

// ── Etkinliği Düzenle modalı — app OrgEditEventScreen paritesi ──
function openEditEvent(ev, opts = {}) {
  const uid = session.user.uid;
  const p = session.profile || {};
  const isOwner = (p.orgRole || "owner") !== "staff";
  const approvedForMe = Array.isArray(ev.editApprovedFor) && ev.editApprovedFor.includes(uid);
  const canEdit = isOwner || approvedForMe;
  const startedMs = eventStartMs(ev);
  const started = startedMs != null && startedMs <= Date.now();
  const dateLabel = typeof ev.date === "string" && ev.date ? ev.date : fmtDate(ev.eventAt);
  const when = [dateLabel, ev.startTime].filter(Boolean).join(" · ");
  const onDone = opts.onDone || (() => {});

  const fTitle = field({ label: "Etkinlik Adı *", id: "oxetitle", value: ev.title || "", placeholder: "Etkinlik adı" });
  const fVenue = field({ label: "Mekan", id: "oxevenue", value: ev.venueName || "", placeholder: "Mekan adı" });
  const fDesc = field({ label: "Açıklama", id: "oxedesc", value: ev.description || "", placeholder: "Etkinlik hakkında kısa bilgi...", multiline: true });
  if (!canEdit || started) [fTitle, fVenue, fDesc].forEach((f) => { const inp = f.querySelector("input, textarea"); if (inp) inp.disabled = true; });

  let banner = null;
  if (isOwner && opts.approveStaffId) {
    banner = h("div", { class: "ox-banner" },
      icon("key-outline", { size: 18, color: C }),
      h("span", { class: "grow" }, `${opts.approveStaffName || "Personel"}, bu etkinliği düzenlemek için izin istiyor.`),
      h("button", { class: "ox-approve", onclick: async () => {
        try {
          await approveEventEdit(ev.id, opts.approveStaffId);
          try { await sendNotification(opts.approveStaffId, { type: "edit_approved", title: "Düzenleme İzni Verildi",
            body: `"${ev.title || "Etkinlik"}" etkinliğini artık düzenleyebilirsin.`, extra: { eventId: ev.id } }); } catch (_) {}
          toast("İzin verildi"); banner.remove();
        } catch (_) { toast("İzin verilemedi", "err"); }
      } }, "İzin Ver"));
  }

  const body = h("div", {},
    banner,
    !canEdit ? h("div", { class: "ox-banner dim" },
      icon("lock-closed", { size: 16, color: "#555570" }),
      h("span", { class: "grow" }, "Bu etkinliği düzenlemek için organizasyon sahibinin izni gerekir.")) : null,
    started ? h("div", { class: "ox-banner dim" },
      icon("time-outline", { size: 16, color: "#F59E0B" }),
      h("span", { class: "grow" }, "Etkinlik başladı — artık düzenlenemez.")) : null,
    h("div", { class: "ox-lockrow" },
      icon("calendar", { size: 18, color: C }),
      h("div", { class: "grow" },
        h("div", { class: "ox-locklabel" }, "Tarih & Saat (değiştirilemez)"),
        h("div", { class: "ox-lockval" }, when || "—")),
      icon("lock-closed", { size: 15, color: "#555570" })),
    isOwner
      ? h("button", { class: "ox-datelink", onclick: confirmRecreate },
          icon("swap-horizontal", { size: 15, color: "#F59E0B" }), "Tarihi değiştir (iptal et ve yeniden oluştur)")
      : h("div", { class: "ox-hint" }, "Tarih değişikliği ve silme yalnızca organizasyon sahibinde."),
    fTitle, fVenue, fDesc,
    isOwner ? h("button", { class: "ox-delbtn", onclick: confirmDelete }, icon("trash-outline", { size: 16 }), "Etkinliği Sil") : null);

  const m = modal({ title: "Etkinliği Düzenle", body, actions: started ? [
    { label: "Kapat", variant: "ghost", onClick: () => {} },
  ] : (canEdit ? [
    { label: "Kapat", variant: "ghost", onClick: () => {} },
    { label: "Değişiklikleri Kaydet", ic: "save-outline", keepOpen: true, onClick: (close) => confirmSave(close) },
  ] : [
    { label: "Kapat", variant: "ghost", onClick: () => {} },
    { label: "Düzenleme İzni İste", ic: "key-outline", keepOpen: true, onClick: () => requestEditPermission() },
  ]) });

  function confirmSave(closeEdit) {
    const patch = { title: v("#oxetitle"), venueName: v("#oxevenue"), description: v("#oxedesc") };
    if (!patch.title) return toast("Etkinlik adı gir", "err");
    modal({ title: "Emin misiniz?",
      body: h("p", { class: "muted" }, `Etkinlik "${when || "—"}" tarihinde yayınlanacak. Değişiklikleri kaydetmek istiyor musunuz?`),
      actions: [
        { label: "Vazgeç", variant: "ghost", onClick: () => {} },
        { label: "Kaydet ve Yayınla", ic: "checkmark", keepOpen: true, onClick: async (close) => {
          try { await updateEventFields(ev.id, patch); toast("Etkinlik güncellendi"); close(); closeEdit(); onDone(); }
          catch (_) { toast("Kaydedilemedi", "err"); }
        } },
      ] });
  }

  function confirmDelete() {
    modal({ title: "Etkinliği Sil",
      body: h("p", { class: "muted" }, "Bu etkinlik kalıcı olarak silinecek. Emin misiniz?"),
      actions: [
        { label: "Vazgeç", variant: "ghost", onClick: () => {} },
        { label: "Sil", variant: "danger", ic: "trash-outline", keepOpen: true, onClick: async (close) => {
          try {
            if (ev.venueId) {
              try { await sendNotification(ev.venueId, { type: "event_deleted", title: "Etkinlik İptal Edildi",
                body: `${p.orgName || p.displayName || "Organizatör"}, "${ev.title || "Etkinlik"}" etkinliğini sildi.` }); } catch (_) {}
            }
            await deleteEventById(ev.id);
            toast("Etkinlik silindi"); close(); m.close(); onDone();
          } catch (_) { toast("Silinemedi", "err"); }
        } },
      ] });
  }

  function confirmRecreate() {
    modal({ title: "Etkinliği Sil ve Yeniden Oluştur",
      body: h("p", { class: "muted" }, "Tarih doğrudan değiştirilemez. Bu etkinlik KALICI OLARAK SİLİNECEK; ardından Etkinlikler ekranından yeni tarihle yeniden oluşturmanız gerekir."),
      actions: [
        { label: "Vazgeç", variant: "ghost", onClick: () => {} },
        { label: "Sil ve Yeniden Oluştur", variant: "danger", keepOpen: true, onClick: async (close) => {
          try {
            await deleteEventById(ev.id);
            toast("Etkinlik silindi — yeni tarihle oluşturabilirsin");
            close(); m.close();
            wantCreate = true; location.hash = "#/organizer/etkinlik";
            if (tabFromHash() === "etkinlik") onDone(); // aynı sekmedeysek listeyi tazele
          } catch (_) { toast("Silinemedi", "err"); }
        } },
      ] });
  }

  async function requestEditPermission() {
    try {
      const members = await orgMembers(p.orgId || uid).catch(() => []);
      const owner = members.find((mm) => mm.role === "owner");
      const ownerId = owner?.userId || owner?.id;
      if (!ownerId) return toast("Organizasyon sahibi bulunamadı", "err");
      await sendNotification(ownerId, { type: "edit_request", title: "Düzenleme İzni İstendi",
        body: `${p.displayName || p.orgName || "Personel"}, "${ev.title || "Etkinlik"}" etkinliğini düzenlemek istiyor.`,
        extra: { eventId: ev.id, staffId: uid, staffName: p.displayName || "" } });
      toast("Düzenleme izni isteğin organizasyon sahibine iletildi");
    } catch (_) { toast("İstek gönderilemedi", "err"); }
  }
}

// ══════════ EKİP — app TeamScreen paritesi (QR yerine e-posta daveti) ══════════
async function renderTeam(root) {
  clear(root);
  const uid = session.user.uid;
  const p = session.profile || {};
  const orgId = p.orgId || uid;
  const isOwner = (p.orgRole || "owner") !== "staff";
  root.append(h("div", { class: "loading" }, spinner()));

  const [members, invites] = await Promise.all([
    orgMembers(orgId).catch(() => []),
    orgInvites(uid).catch(() => []),
  ]);
  clear(root);
  const refresh = () => renderTeam(root);
  const owners = members.filter((m) => m.role === "owner").length;
  const staffN = members.filter((m) => m.role === "staff").length;

  const statCard = (val, label) => h("div", { class: "ox-scard" },
    h("div", { class: "ox-statv" }, String(val)), h("div", { class: "ox-statl" }, label));

  root.append(
    backBtn(),
    h("div", { class: "ox-stats3" }, statCard(members.length, "Toplam Üye"), statCard(owners, "Sahip"), statCard(staffN, "Personel")),
    members.length
      ? h("div", {}, ...members.map((m, i) => memberCard(m, i, { uid, isOwner, orgId, refresh })))
      : empty("people-outline", "Henüz üye yok", "Personel davet ederek ekibini oluştur."));

  if (invites.length) {
    root.append(h("section", { class: "ox-sect" },
      h("div", { class: "ox-secthead" }, h("h2", { class: "ox-secttitle" }, "Gönderilen Davetler")),
      ...invites.map(inviteRow)));
  }

  if (isOwner) {
    root.append(h("button", { class: "ox-teamfab", onclick: () => openInviteModal(refresh) },
      icon("person-add", { size: 20 }), h("span", {}, "Personel Davet Et")));
    if (wantInvite) { wantInvite = false; openInviteModal(refresh); }
  } else {
    wantInvite = false;
  }
}

function memberCard(m, i, ctx) {
  const grad = GRADS[i % GRADS.length];
  const mid = m.userId || m.id;
  const isMe = mid === ctx.uid;
  const canManage = ctx.isOwner && !isMe && m.role !== "owner";
  const name = m.displayName || m.name || m.email || "Üye";
  const ownerRole = m.role === "owner";
  return h("div", { class: "ox-mcard" },
    h("div", { class: "ox-mavatar", style: { background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})` } }, initials(name)),
    h("div", { class: "grow", style: { minWidth: 0 } },
      h("div", { class: "ox-mnamerow" },
        h("span", { class: "ox-mname" }, name),
        isMe ? h("span", { class: "ox-metag" }, "Sen") : null),
      m.email ? h("div", { class: "ox-memail" }, m.email) : null),
    h("span", { class: "ox-rolepill " + (ownerRole ? "ox-rp-owner" : "ox-rp-staff") },
      icon(ownerRole ? "shield-checkmark" : "people", { size: 11 }), ownerRole ? "Sahip" : "Personel"),
    canManage ? h("button", { class: "ox-mmore", title: "Yönet", onclick: () => confirmRemoveMember(m, ctx) },
      icon("ellipsis-vertical", { size: 16 })) : null);
}

function confirmRemoveMember(m, ctx) {
  const name = m.displayName || m.name || m.email || "Üye";
  modal({ title: name, body: h("p", { class: "muted" }, "Bu üyeyi ekipten çıkarmak istiyor musun?"), actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Ekipten Çıkar", variant: "danger", ic: "person-remove-outline", keepOpen: true, onClick: async (close) => {
      try { await removeOrgMember(ctx.orgId, m.id); toast("Üye ekipten çıkarıldı"); close(); ctx.refresh(); }
      catch (_) { toast("Çıkarılamadı", "err"); }
    } },
  ] });
}

function inviteRow(iv) {
  const st = iv.status === "accepted" ? { label: "Katıldı", cls: " ox-st-live" }
    : iv.status === "pending" ? { label: "Bekliyor", cls: " ox-st-pend" }
    : { label: "Reddedildi", cls: " ox-st-rej" };
  return h("div", { class: "ox-invrow" },
    h("span", { class: "ox-menuicon" }, icon("mail-outline", { size: 16, color: "#9090B0" })),
    h("div", { class: "grow", style: { minWidth: 0 } },
      h("div", { class: "ox-invmail" }, iv.invitedEmail || ""),
      iv.createdAt ? h("div", { class: "ox-invtime" }, fmtDate(iv.createdAt)) : null),
    h("span", { class: "ox-status" + st.cls }, st.label));
}

function openInviteModal(onDone) {
  const p = session.profile || {};
  const body = h("div", {},
    h("p", { class: "muted", style: { fontSize: "13px", lineHeight: "20px", marginBottom: "14px" } },
      "Davet edilen kişi uygulamaya organizatör olarak kaydolduğunda daveti görecek."),
    field({ label: "E-posta", id: "oxinvmail", type: "email", placeholder: "ornek@email.com" }));
  modal({ title: "Personel Davet Et", body, actions: [
    { label: "İptal", variant: "ghost", onClick: () => {} },
    { label: "Davet Gönder", ic: "person-add-outline", keepOpen: true, onClick: async (close) => {
      const email = v("#oxinvmail").toLowerCase();
      if (!EMAIL_RE.test(email)) return toast("Geçerli bir e-posta gir", "err");
      try {
        await createOrgInvite({
          orgId: p.orgId || session.user.uid,
          orgName: p.orgName || p.displayName || "",
          invitedEmail: email,
          invitedByUid: session.user.uid,
          invitedByName: p.displayName || p.orgName || "",
        });
        toast("Davet gönderildi"); close(); onDone && onDone();
      } catch (e) {
        toast(e && e.code === "duplicate-invite" ? "Bu e-postaya bekleyen davet zaten var" : "Davet gönderilemedi", "err");
      }
    } },
  ] });
}

// ══════════ BİLDİRİMLER (zil hedefi; edit_request → onay banner'lı düzenleme) ══════════
function renderNotifs(root) {
  clear(root);
  const uid = session.user.uid;
  const box = h("div", {}, h("div", { class: "loading" }, spinner()));
  root.append(backBtn(), sect("Bildirimler", "notifications-outline", 0, box));
  const un = listenNotifications(uid, (list) => {
    clear(box);
    if (!list.length) return box.append(empty("notifications-outline", "Bildirim yok", "Yeni bildirimler burada görünür."));
    list.forEach((n) => box.append(notifRow(n)));
  });
  const off = () => { try { un(); } catch (_) {} window.removeEventListener("hashchange", off); };
  window.addEventListener("hashchange", off);
}

function notifRow(n) {
  return h("div", { class: "notif" + (n.read ? "" : " unread"), style: { cursor: "pointer" }, onclick: async () => {
    markNotifRead(n.id);
    if ((n.type === "edit_request" || n.type === "edit_approved") && n.eventId) {
      try {
        const ev = await eventById(n.eventId);
        if (!ev) return toast("Etkinlik bulunamadı", "err");
        openEditEvent(ev, n.type === "edit_request" ? { approveStaffId: n.staffId, approveStaffName: n.staffName } : {});
      } catch (_) { toast("Etkinlik açılamadı", "err"); }
    }
  } },
    icon(n.type === "edit_request" ? "key-outline" : n.type === "event_deleted" ? "trash-outline" : "notifications-outline", { size: 18, color: C }),
    h("div", { class: "notif-body" },
      h("div", { class: "notif-title" }, n.title || "Bildirim"),
      n.body ? h("div", { class: "notif-text" }, n.body) : null,
      n.createdAt ? h("div", { class: "notif-time" }, fmtDate(n.createdAt)) : null),
    h("button", { class: "notif-x", title: "Sil", onclick: (e) => { e.stopPropagation(); deleteNotif(n.id); } }, icon("close", { size: 16 })));
}

// ══════════ MEKAN SEÇ + İSTEK GÖNDER (mevcut akış — korunuyor) ══════════
async function renderVenues(root) {
  clear(root);
  const box = h("div", { class: "list-card" }, h("div", { class: "loading" }, spinner()));
  root.append(sect("Mekan Seç", "business-outline", 0, box));
  try {
    const venues = await listVenues();
    clear(box);
    if (!venues.length) { box.append(empty("business-outline", "Mekan yok", "Onaylı mekan bulunmuyor.")); return; }
    venues.forEach((vn) => box.append(venueRow(vn)));
  } catch (e) { clear(box); box.append(empty("cloud-offline-outline", "Yüklenemedi", "")); }
}
function venueRow(vn) {
  const name = vn.displayName || "Mekan";
  return h("div", { class: "lrow" },
    avatar(name, ROLE.venue),
    h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, name), (vn.city || vn.location?.city) ? h("div", { class: "lrow-meta" }, vn.city || vn.location?.city) : null),
    h("div", { class: "lrow-actions" },
      h("button", { class: "act", title: "Mesaj", onclick: () => { requestChat({ otherId: vn.id, otherName: name }); location.hash = "#/organizer/mesaj"; } }, icon("chatbubble-ellipses-outline", { size: 15 })),
      h("button", { class: "act ok", onclick: () => requestModal(vn) }, icon("paper-plane-outline", { size: 15 }), h("span", {}, "İstek"))));
}
function requestModal(vn) {
  const pic = photoPicker("Etkinlik fotoğrafı (opsiyonel)", undefined, { aspect: 16 / 9 });
  const body = h("div", {}, pic.node,
    field({ label: "Etkinlik Adı", id: "rqtitle", placeholder: "Örn. Yaz Festivali" }),
    h("div", { class: "frow" }, field({ label: "Tarih", id: "rqdate", type: "date" }), field({ label: "Saat", id: "rqtime", type: "time" })),
    field({ label: "Açıklama (opsiyonel)", id: "rqdesc", placeholder: "…", multiline: true }));
  modal({ title: `${vn.displayName || "Mekan"} — Etkinlik İsteği`, body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "İstek Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      const f = { title: v("#rqtitle"), date: v("#rqdate"), time: v("#rqtime"), description: v("#rqdesc") };
      if (!f.title) return toast("Etkinlik adı gir", "err");
      if (!f.date || !f.time) return toast("Tarih ve saat gir", "err");
      try { if (pic.getFile()) f.bannerUrl = await uploadImage(pic.getFile(), session.user.uid); await createVenueRequest(session.profile, vn, f); toast("İstek gönderildi"); close(); } catch (e) { toast("Gönderilemedi", "err"); }
    } },
  ] });
}

// ══════════ PROFİL — app ProfileScreen paritesi + mevcut kayıt formu ══════════
async function renderProfile(root) {
  clear(root);
  const p = session.profile || {};
  const isOwner = (p.orgRole || "owner") !== "staff";

  // App parite başlığı: 88px avatar + ad + e-posta + organizasyon rozeti (rol pill'li)
  const roleColor = isOwner ? C : "#3B82F6";
  const hero = h("div", { class: "ox-phero" },
    h("div", { class: "ox-pavatar", style: p.photoURL ? { backgroundImage: `url(${p.photoURL})`, backgroundSize: "cover", backgroundPosition: "center" } : null }, p.photoURL ? null : initials(p.displayName || p.orgName)),
    h("div", { class: "ox-pname" }, p.displayName || p.orgName || "Organizatör"),
    h("div", { class: "ox-pmail" }, p.email || ""),
    h("div", { class: "ox-orgbadge" },
      icon("business", { size: 14, color: C }),
      h("span", { class: "ox-obname" }, p.orgName || "Organizasyonunuz"),
      h("span", { class: "ox-rolebadge", style: { color: roleColor } },
        icon(isOwner ? "shield-checkmark" : "people", { size: 11, color: roleColor }),
        isOwner ? "Sahip" : "Personel")));

  // Mevcut profil kayıt formu (orgName/city/phone/bio + foto) — korunuyor
  const pic = photoPicker("Organizasyon / profil fotoğrafı (opsiyonel)", p.photoURL, { aspect: 1, round: true });
  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    pic.node,
    field({ label: "Organizasyon Adı", id: "porg", value: p.orgName || p.displayName || "", placeholder: "Organizasyon adı" }),
    field({ label: "Şehir", id: "pcity", value: p.city || "", placeholder: "Örn. İstanbul" }),
    field({ label: "Telefon", id: "pphone", type: "tel", value: p.phone || "", placeholder: "05xx xxx xx xx" }),
    field({ label: "Hakkında", id: "pbio", value: p.bio || "", placeholder: "Kısa tanıtım", multiline: true }),
  );
  const saveMsg = h("p", { class: "msg" });
  const save = btn("Kaydet", { ic: "save-outline", full: true, onClick: async () => {
    const patch = { orgName: v("#porg"), displayName: v("#porg"), city: v("#pcity"), phone: v("#pphone"), bio: v("#pbio") };
    try { if (pic.getFile()) patch.photoURL = await uploadImage(pic.getFile(), session.user.uid); await saveProfile(session.user.uid, patch); await refreshProfile(); toast("Profil kaydedildi"); }
    catch (e) { saveMsg.textContent = "Kaydedilemedi."; saveMsg.className = "msg err"; }
  } });

  // App menü satırları (web karşılığı olanlar) + onaylı çıkış
  const menu = h("div", { class: "menu-card" },
    profMenuRow("people-outline", "Ekip", () => { location.hash = "#/organizer/ekip"; }),
    profMenuRow("notifications-outline", "Bildirimler", () => { location.hash = "#/organizer/bildirim"; }),
    profMenuRow("mail-outline", "E-posta Değiştir", () => changeEmailModal()),
    profMenuRow("key-outline", "Şifre Değiştir", () => changePasswordModal()),
    profMenuRow("trash-outline", "Hesabımı Sil", () => deleteAccountModal(), true),
    profMenuRow("log-out-outline", "Çıkış Yap", confirmLogout, true));

  root.append(h("div", { class: "ox-pwrap" }, hero, sect("Organizasyon Bilgileri", "megaphone-outline", 0, form), save, saveMsg, menu));
}

function profMenuRow(ic, label, onclick, danger) {
  return h("div", { class: "menu-row", onclick },
    h("span", { class: "ox-menuicon" + (danger ? " danger" : "") }, icon(ic, { size: 18, color: danger ? "#EF4444" : "#9090B0" })),
    h("span", { class: "menu-label" + (danger ? " ox-danger" : "") }, label),
    danger ? null : icon("chevron-forward", { size: 16, color: "#555570" }));
}

function confirmLogout() {
  modal({ title: "Çıkış Yap", body: h("p", { class: "muted" }, "Hesabınızdan çıkmak istediğinize emin misiniz?"), actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Çıkış Yap", variant: "danger", ic: "log-out-outline", onClick: () => logout() },
  ] });
}
