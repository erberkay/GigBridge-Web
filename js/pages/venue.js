// Mekan paneli — Ana Sayfa (etkinlikler + organizatör istekleri), Profil. (Faz 2: oluşturma, sanatçı bul, mesaj)
import { session, logout, refreshProfile } from "../store.js";
import { venueEvents, venueOrgRequests, acceptOrgRequest, setRequestStatus, saveProfile,
  createEvent, listArtists, createInvitation } from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, modal, fmtDate, fmtTL, ROLE } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";

const GENRES = ["Electronic", "House", "Techno", "Jazz", "Pop", "Rock", "Akustik", "Hip-Hop", "R&B", "Klasik", "Diğer"];

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
  const page = h("div", { class: "page has-nav", style: { "--role": ROLE.venue } },
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
  if (tab === "olustur") return renderCreate(root);
  if (tab === "sanatci") return renderArtists(root);
  if (tab === "mesaj") { clear(root); return messagesView(root, ROLE.venue); }
  clear(root);
  root.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor."));
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
      h("button", { class: "act", title: "Mesaj", onclick: () => { requestChat({ otherId: req.createdByUid || req.organizerId, otherName: req.organizerName || "Organizatör" }); location.hash = "#/venue/mesaj"; } }, icon("chatbubble-ellipses-outline", { size: 15 })),
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

// ── Etkinlik oluştur ──
async function renderCreate(root) {
  clear(root);
  let vip = false;
  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    field({ label: "Etkinlik Adı", id: "ctitle", placeholder: "Örn. Cumartesi Gecesi" }),
    h("div", { class: "frow" }, field({ label: "Tarih", id: "cdate", type: "date" }), field({ label: "Saat", id: "ctime", type: "time" })),
    field({ label: "Tür", id: "cgenre", options: [{ value: "", label: "Tür seç" }, ...GENRES.map((g) => ({ value: g, label: g }))] }),
    h("div", { class: "frow" }, field({ label: "Bilet Ücreti (₺)", id: "cprice", type: "number", placeholder: "Boşsa ücretsiz" }), field({ label: "Kontenjan", id: "ccap", type: "number", placeholder: "Boşsa sınırsız" })),
    field({ label: "Açıklama", id: "cdesc", placeholder: "Kısa bilgi", multiline: true }),
    h("label", { class: "switch-row" },
      h("span", {}, icon("sparkles", { size: 15, color: ROLE.venue }), " VIP Etkinlik iste (yönetici onayı)"),
      h("input", { type: "checkbox", onchange: (e) => { vip = e.target.checked; } })),
  );
  const msg = h("p", { class: "msg" });
  const submit = btn("Etkinliği Yayınla", { ic: "cloud-upload-outline", full: true, onClick: async () => {
    const f = { title: v("#ctitle"), date: v("#cdate"), time: v("#ctime"), genre: v("#cgenre"), price: v("#cprice"), capacity: v("#ccap"), description: v("#cdesc"), vip };
    if (!f.title) return fail(msg, "Etkinlik adı gir.");
    if (!f.date) return fail(msg, "Tarih seç.");
    try { await createEvent(session.profile, f); toast(vip ? "Yayınlandı — VIP onayına düştü" : "Etkinlik yayınlandı"); location.hash = "#/venue"; }
    catch (e) { fail(msg, "Oluşturulamadı."); }
  } });
  root.append(sect("Yeni Etkinlik", "add-circle-outline", 0, form), submit, msg);
}

// ── Sanatçı bul + davet ──
async function renderArtists(root) {
  clear(root);
  const box = h("div", { class: "list-card" }, h("div", { class: "loading" }, spinner()));
  root.append(sect("Sanatçı Bul", "search-outline", 0, box));
  try {
    const artists = await listArtists();
    clear(box);
    if (!artists.length) { box.append(empty("people-outline", "Sanatçı yok", "Henüz kayıtlı sanatçı bulunmuyor.")); return; }
    artists.forEach((a) => box.append(artistRow(a)));
  } catch (e) { clear(box); box.append(empty("cloud-offline-outline", "Yüklenemedi", "")); }
}
function artistRow(a) {
  const name = a.displayName || a.name || "Sanatçı";
  const genre = Array.isArray(a.genres) ? (a.genres[0] || "") : (a.genre || "");
  return h("div", { class: "lrow" },
    avatar(name, ROLE.artist),
    h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, name), genre ? h("div", { class: "lrow-meta" }, genre) : null),
    h("div", { class: "lrow-actions" },
      h("button", { class: "act ok", onclick: () => inviteModal(a) }, icon("mail-outline", { size: 15 }), h("span", {}, "Davet"))));
}
function inviteModal(a) {
  const name = a.displayName || a.name || "Sanatçı";
  const body = h("div", {},
    h("div", { class: "frow" }, field({ label: "Tarih", id: "idate", type: "date" }), field({ label: "Saat", id: "itime", type: "time" })),
    field({ label: "Ücret (₺)", id: "ifee", type: "number", placeholder: "En az 3500" }),
    field({ label: "Mesaj (opsiyonel)", id: "imsg", placeholder: "…", multiline: true }));
  modal({ title: `${name} — Davet`, body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Davet Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      const f = { date: v("#idate"), time: v("#itime"), fee: v("#ifee"), message: v("#imsg") };
      if (!f.date || !f.time) return toast("Tarih ve saat gir", "err");
      if (!(Number(f.fee) >= 3500)) return toast("Ücret en az ₺3.500", "err");
      try { await createInvitation(session.profile, a, f); toast("Davet gönderildi"); close(); } catch (e) { toast("Gönderilemedi", "err"); }
    } },
  ] });
}
function fail(msg, text) { msg.textContent = text; msg.className = "msg err"; }

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
