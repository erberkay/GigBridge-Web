// Organizatör paneli — Etkinlikler + gönderilen mekan istekleri, Profil. (Faz 2: mekan seç/istek gönder, mesaj)
import { session, logout, refreshProfile } from "../store.js";
import { organizerEvents, organizerRequests, saveProfile, listVenues, createVenueRequest } from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, badge, modal, fmtDate, ROLE } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";

const NAV = [
  { key: "home", label: "Etkinlikler", icon: "calendar-outline", href: "#/organizer" },
  { key: "mekan", label: "Mekan Seç", icon: "business-outline", href: "#/organizer/mekan" },
  { key: "mesaj", label: "Mesajlar", icon: "chatbubbles-outline", href: "#/organizer/mesaj" },
  { key: "profil", label: "Profil", icon: "person-outline", href: "#/organizer/profil" },
];
const TITLES = { home: "Etkinlikler", mekan: "Mekan Seç", mesaj: "Mesajlar", profil: "Profil" };
const STATUS = {
  pending: { label: "Onay Bekliyor", color: "#F59E0B" },
  accepted: { label: "Onaylandı", color: "#22C55E" },
  rejected: { label: "Reddedildi", color: "#EF4444" },
};

export function organizerPage() {
  const tab = tabFromHash();
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": ROLE.organizer } },
    topbar(TITLES[tab] || "Organizatör", { subtitle: session.profile?.orgName || session.profile?.displayName || "", color: ROLE.organizer,
      right: h("button", { class: "icon-btn", onclick: logout }, icon("log-out-outline", { size: 20 })) }),
    content,
    bottomnav(NAV, tab, ROLE.organizer));
  renderTab(tab, content);
  return page;
}

function tabFromHash() { const p = (location.hash || "").split("/"); return p[2] || "home"; }

async function renderTab(tab, root) {
  if (tab === "profil") return renderProfile(root);
  if (tab === "home") return renderHome(root);
  if (tab === "mekan") return renderVenues(root);
  if (tab === "mesaj") { clear(root); return messagesView(root, ROLE.organizer); }
  clear(root);
  root.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor."));
}

// ── Mekan seç + istek gönder ──
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
  const body = h("div", {},
    field({ label: "Etkinlik Adı", id: "rqtitle", placeholder: "Örn. Yaz Festivali" }),
    h("div", { class: "frow" }, field({ label: "Tarih", id: "rqdate", type: "date" }), field({ label: "Saat", id: "rqtime", type: "time" })),
    field({ label: "Açıklama (opsiyonel)", id: "rqdesc", placeholder: "…", multiline: true }));
  modal({ title: `${vn.displayName || "Mekan"} — Etkinlik İsteği`, body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "İstek Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      const f = { title: v("#rqtitle"), date: v("#rqdate"), time: v("#rqtime"), description: v("#rqdesc") };
      if (!f.title) return toast("Etkinlik adı gir", "err");
      if (!f.date || !f.time) return toast("Tarih ve saat gir", "err");
      try { await createVenueRequest(session.profile, vn, f); toast("İstek gönderildi"); close(); } catch (e) { toast("Gönderilemedi", "err"); }
    } },
  ] });
}

async function renderHome(root) {
  try {
    const uid = session.user.uid;
    const orgId = session.profile?.orgId || uid;
    const [events, reqs] = await Promise.all([organizerEvents(orgId), organizerRequests(uid)]);
    clear(root);
    root.append(sect("Aktif Etkinlikler", "calendar-outline", events.length,
      events.length ? h("div", { class: "grid" }, ...events.map(eventCard))
        : empty("calendar-outline", "Aktif etkinlik yok", "Mekan onayladığında etkinliklerin burada görünür.")));
    root.append(sect("Mekan İstekleri", "paper-plane-outline", reqs.length,
      reqs.length ? h("div", { class: "list-card" }, ...reqs.map(reqRow))
        : empty("paper-plane-outline", "Gönderilen istek yok", "Uygulamadan mekana etkinlik isteği gönderebilirsin.")));
  } catch (e) { clear(root); root.append(empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip yenile.")); }
}

function reqRow(r) {
  const st = STATUS[r.status] || STATUS.pending;
  return h("div", { class: "lrow" },
    avatar(r.venueName || r.title, ROLE.venue),
    h("div", { class: "lrow-info" },
      h("div", { class: "lrow-name" }, r.title || "Etkinlik"),
      h("div", { class: "lrow-meta" }, [r.venueName, r.eventDate, r.eventTime].filter(Boolean).join(" · "))),
    badge(st.label, st.color));
}

function eventCard(ev) {
  return h("div", { class: "ecard" },
    h("div", { class: "ecard-banner", style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
      ev.vipStatus === "approved" ? h("span", { class: "vip-badge" }, icon("sparkles", { size: 10 }), "VIP") : null),
    h("div", { class: "ecard-body" },
      h("div", { class: "ecard-title" }, ev.title || "Etkinlik"),
      h("div", { class: "ecard-meta" }, icon("business-outline", { size: 12 }), " " + (ev.venueName || "—")),
      h("div", { class: "ecard-meta" }, icon("calendar-outline", { size: 12 }), " " + (typeof ev.date === "string" ? ev.date : fmtDate(ev.eventAt || ev.date)))));
}

async function renderProfile(root) {
  clear(root);
  const p = session.profile || {};
  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    h("div", { class: "profile-head" }, avatar(p.orgName || p.displayName, ROLE.organizer),
      h("div", {}, h("div", { class: "ph-name" }, p.orgName || p.displayName || "Organizatör"), h("div", { class: "ph-mail" }, p.email || ""))),
    field({ label: "Organizasyon Adı", id: "porg", value: p.orgName || p.displayName || "", placeholder: "Organizasyon adı" }),
    field({ label: "Şehir", id: "pcity", value: p.city || "", placeholder: "Örn. İstanbul" }),
    field({ label: "Telefon", id: "pphone", type: "tel", value: p.phone || "", placeholder: "05xx xxx xx xx" }),
    field({ label: "Hakkında", id: "pbio", value: p.bio || "", placeholder: "Kısa tanıtım", multiline: true }),
  );
  const saveMsg = h("p", { class: "msg" });
  const save = btn("Kaydet", { ic: "save-outline", full: true, onClick: async () => {
    const patch = { orgName: v("#porg"), displayName: v("#porg"), city: v("#pcity"), phone: v("#pphone"), bio: v("#pbio") };
    try { await saveProfile(session.user.uid, patch); await refreshProfile(); toast("Profil kaydedildi"); }
    catch (e) { saveMsg.textContent = "Kaydedilemedi."; saveMsg.className = "msg err"; }
  } });
  root.append(sect("Organizasyon Bilgileri", "megaphone-outline", 0, form), save, saveMsg);
}

function sect(title, ic, count, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head row-between" },
      h("h2", { class: "sect-title" }, icon(ic, { size: 16 }), " " + title),
      count ? h("span", { class: "count-pill" }, count) : null),
    ...kids);
}
function v(sel) { return (document.querySelector(sel)?.value || "").trim(); }
