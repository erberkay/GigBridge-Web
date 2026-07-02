// Mekan paneli — Ana Sayfa (etkinlikler + organizatör istekleri), Profil. (Faz 2: oluşturma, sanatçı bul, mesaj)
import { session, logout, refreshProfile } from "../store.js";
import { venueEvents, venueOrgRequests, acceptOrgRequest, setRequestStatus, saveProfile } from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, fmtDate, fmtTL, ROLE } from "../ui.js";

const NAV = [
  { key: "home", label: "Ana Sayfa", icon: "home-outline", href: "#/venue" },
  { key: "olustur", label: "Etkinlik", icon: "add-circle-outline", href: "#/venue/olustur" },
  { key: "sanatci", label: "Sanatçı Bul", icon: "search-outline", href: "#/venue/sanatci" },
  { key: "mesaj", label: "Mesajlar", icon: "chatbubbles-outline", href: "#/venue/mesaj" },
  { key: "profil", label: "Profil", icon: "person-outline", href: "#/venue/profil" },
];
const TITLES = { home: "Mekan Paneli", olustur: "Etkinlik Oluştur", sanatci: "Sanatçı Bul", mesaj: "Mesajlar", profil: "Profil" };

export function venuePage() {
  const tab = tabFromHash();
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav" },
    topbar(TITLES[tab] || "Mekan Paneli", { subtitle: session.profile?.displayName || "", color: ROLE.venue,
      right: h("button", { class: "icon-btn", onclick: logout }, icon("log-out-outline", { size: 20 })) }),
    content,
    bottomnav(NAV, tab, ROLE.venue));
  renderTab(tab, content);
  return page;
}

function tabFromHash() { const p = (location.hash || "").split("/"); return p[2] || "home"; }

async function renderTab(tab, root) {
  if (tab === "profil") return renderProfile(root);
  if (tab === "home") return renderHome(root);
  clear(root);
  root.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor. Şimdilik uygulamadan kullanabilirsin."));
}

async function renderHome(root) {
  try {
    const uid = session.user.uid;
    const [events, reqs] = await Promise.all([venueEvents(uid), venueOrgRequests(uid)]);
    clear(root);
    if (reqs.length) {
      root.append(sect("Organizatör İstekleri", "megaphone-outline", reqs.length,
        h("div", { class: "list-card" }, ...reqs.map(reqRow))));
    }
    root.append(sect("Etkinliklerim", "calendar-outline", events.length,
      events.length ? h("div", { class: "grid" }, ...events.map(eventCard))
        : empty("calendar-outline", "Henüz etkinlik yok", "Etkinliklerin burada listelenir.")));
  } catch (e) { clear(root); root.append(errBox()); }
}

function reqRow(req) {
  const venue = session.profile;
  const row = h("div", { class: "lrow" },
    avatar(req.organizerName || req.title, ROLE.organizer),
    h("div", { class: "lrow-info" },
      h("div", { class: "lrow-name" }, req.title || "Etkinlik"),
      h("div", { class: "lrow-meta" }, [req.organizerName, req.eventDate, req.eventTime].filter(Boolean).join(" · "))),
    h("div", { class: "lrow-actions" },
      actBtn("checkmark", "Kabul", "ok", async () => { await acceptOrgRequest(req, venue); row.remove(); toast("Kabul edildi, etkinlik oluşturuldu"); }),
      actBtn("close", "Reddet", "danger", async () => { await setRequestStatus(req.id, "rejected"); row.remove(); toast("Reddedildi"); })));
  return row;
}

function eventCard(ev) {
  const vip = ev.vipStatus === "approved";
  return h("div", { class: "ecard" },
    h("div", { class: "ecard-banner", style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
      vip ? h("span", { class: "vip-badge" }, icon("sparkles", { size: 10 }), "VIP") : null,
      ev.vipStatus === "pending" ? h("span", { class: "pend-badge" }, "VIP onayda") : null),
    h("div", { class: "ecard-body" },
      h("div", { class: "ecard-title" }, ev.title || "Etkinlik"),
      h("div", { class: "ecard-meta" }, icon("calendar-outline", { size: 12 }), " " + (typeof ev.date === "string" ? ev.date : fmtDate(ev.eventAt || ev.date))),
      ev.artistName ? h("div", { class: "ecard-meta" }, icon("mic-outline", { size: 12 }), " " + ev.artistName) : null));
}

async function renderProfile(root) {
  clear(root);
  const p = session.profile || {};
  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    h("div", { class: "profile-head" }, avatar(p.displayName, ROLE.venue),
      h("div", {}, h("div", { class: "ph-name" }, p.displayName || "Mekan"), h("div", { class: "ph-mail" }, p.email || ""))),
    field({ label: "Şehir", id: "pcity", value: p.city || "", placeholder: "Örn. İstanbul" }),
    field({ label: "İlçe", id: "pdistrict", value: p.district || "", placeholder: "Örn. Kadıköy" }),
    field({ label: "Adres", id: "paddress", value: p.address || "", placeholder: "Açık adres", multiline: true }),
    field({ label: "Telefon", id: "pphone", type: "tel", value: p.phone || "", placeholder: "05xx xxx xx xx" }),
    field({ label: "Kapasite", id: "pcap", type: "number", value: p.capacity || "", placeholder: "Örn. 300" }),
    field({ label: "Web Sitesi", id: "pweb", value: p.website || "", placeholder: "https://…" }),
  );
  const saveMsg = h("p", { class: "msg" });
  const save = btn("Kaydet", { ic: "save-outline", full: true, onClick: async () => {
    const patch = {
      city: v("#pcity"), district: v("#pdistrict") || null, address: v("#paddress"),
      phone: v("#pphone"), website: v("#pweb"),
      capacity: v("#pcap") ? Number(v("#pcap")) : null,
    };
    try { await saveProfile(session.user.uid, patch); await refreshProfile(); toast("Profil kaydedildi"); }
    catch (e) { saveMsg.textContent = "Kaydedilemedi."; saveMsg.className = "msg err"; }
  } });
  root.append(sect("Mekan Bilgileri", "business-outline", 0, form), save, saveMsg,
    h("p", { class: "muted small center" }, "Mekan adını değiştirmek 90 günde bir uygulamadan yapılır."));
}

// ── ortak ──
function sect(title, ic, count, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head row-between" },
      h("h2", { class: "sect-title" }, icon(ic, { size: 16 }), " " + title),
      count ? h("span", { class: "count-pill" }, count) : null),
    ...kids);
}
function actBtn(ic, label, kind, onClick) {
  const b = h("button", { class: "act " + kind, onclick: async () => { b.disabled = true; try { await onClick(); } catch (e) { b.disabled = false; toast("İşlem başarısız", "err"); } } },
    icon(ic, { size: 15 }), h("span", {}, label));
  return b;
}
function errBox() { return empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip yenile."); }
function v(sel) { return (document.querySelector(sel)?.value || "").trim(); }
