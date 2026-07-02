// Mekan paneli — Ana Sayfa (etkinlikler + organizatör istekleri), Profil. (Faz 2: oluşturma, sanatçı bul, mesaj)
import { session, logout, refreshProfile } from "../store.js";
import { venueEvents, venueOrgRequests, acceptOrgRequest, setRequestStatus, saveProfile,
  createEvent, listArtists, createInvitation, createResidency, venueStats, uploadImage } from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, photoPicker, modal, fmtDate, fmtTL, ROLE } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";

const GENRES = ["Electronic", "House", "Techno", "Jazz", "Pop", "Rock", "Akustik", "Hip-Hop", "R&B", "Klasik", "Diğer"];

const NAV = [
  { key: "home", label: "Ana Sayfa", icon: "home-outline", href: "#/venue" },
  { key: "sanatci", label: "Sanatçı Bul", icon: "search-outline", href: "#/venue/sanatci" },
  { key: "analitik", label: "Analitik", icon: "bar-chart-outline", href: "#/venue/analitik" },
  { key: "mesaj", label: "Mesajlar", icon: "chatbubbles-outline", href: "#/venue/mesaj" },
  { key: "profil", label: "Profil", icon: "person-outline", href: "#/venue/profil" },
];
const TITLES = { home: "Mekan Paneli", olustur: "Etkinlik Oluştur", sanatci: "Sanatçı Bul", analitik: "Analitik", mesaj: "Mesajlar", profil: "Profil" };
const GENRE_FILTERS = ["Tümü", "Electronic", "House", "Techno", "Jazz", "Pop", "Rock", "Akustik", "Hip-Hop"];

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
  if (tab === "analitik") return renderAnalytics(root);
  if (tab === "mesaj") { clear(root); return messagesView(root, ROLE.venue); }
  clear(root);
  root.append(empty("construct-outline", "Yakında", "Bu bölüm bir sonraki güncellemede web'e geliyor."));
}

async function renderHome(root) {
  try {
    const uid = session.user.uid;
    const [events, reqs] = await Promise.all([venueEvents(uid), venueOrgRequests(uid)]);
    clear(root);
    root.append(h("div", { class: "cta-row" }, btn("Etkinlik Oluştur", { ic: "add-circle-outline", full: true, onClick: () => { location.hash = "#/venue/olustur"; } })));
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
  const pic = photoPicker("Mekan / profil fotoğrafı (opsiyonel)");
  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    h("div", { class: "profile-head" }, avatar(p.displayName, ROLE.venue),
      h("div", {}, h("div", { class: "ph-name" }, p.displayName || "Mekan"), h("div", { class: "ph-mail" }, p.email || ""))),
    pic.node,
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
    try { if (pic.getFile()) patch.photoURL = await uploadImage(pic.getFile(), session.user.uid); await saveProfile(session.user.uid, patch); await refreshProfile(); toast("Profil kaydedildi"); }
    catch (e) { saveMsg.textContent = "Kaydedilemedi."; saveMsg.className = "msg err"; }
  } });
  root.append(sect("Mekan Bilgileri", "business-outline", 0, form), save, saveMsg,
    h("p", { class: "muted small center" }, "Mekan adını değiştirmek 90 günde bir uygulamadan yapılır."));
}

// ── Etkinlik oluştur (sanatçı seçme + teklif dahil) ──
async function renderCreate(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  let artists = [];
  try { artists = await listArtists(); } catch (_) {}
  clear(root);
  let vip = false;
  const pic = photoPicker("Etkinlik kapağı ekle (opsiyonel)");
  const artOpts = [{ value: "", label: "Sanatçı seçme (opsiyonel)" }, ...artists.map((a) => ({ value: a.id, label: a.displayName || a.name || "Sanatçı" }))];
  const form = h("form", { class: "form-card", onsubmit: (e) => e.preventDefault() },
    pic.node,
    field({ label: "Etkinlik Adı", id: "ctitle", placeholder: "Örn. Cumartesi Gecesi" }),
    h("div", { class: "frow" }, field({ label: "Tarih", id: "cdate", type: "date" }), field({ label: "Saat", id: "ctime", type: "time" })),
    field({ label: "Tür", id: "cgenre", options: [{ value: "", label: "Tür seç" }, ...GENRES.map((g) => ({ value: g, label: g }))] }),
    h("div", { class: "frow" }, field({ label: "Bilet Ücreti (₺)", id: "cprice", type: "number", placeholder: "Boşsa ücretsiz" }), field({ label: "Kontenjan", id: "ccap", type: "number", placeholder: "Boşsa sınırsız" })),
    field({ label: "Sanatçı", id: "cartist", options: artOpts }),
    field({ label: "Sanatçı Sahne Ücreti (₺)", id: "cfee", type: "number", placeholder: "Sanatçı seçtiysen en az 3500", hint: "Sanatçı seçersen bu ücretle ona teklif gönderilir; kabul ederse etkinliğe bağlanır." }),
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
    const aid = v("#cartist");
    const artist = aid ? artists.find((x) => x.id === aid) : null;
    if (artist) {
      f.artistId = artist.id; f.artistName = artist.displayName || artist.name || "";
      if (!(Number(v("#cfee")) >= 3500)) return fail(msg, "Sanatçı seçtiysen sahne ücreti en az ₺3.500 olmalı.");
      if (!v("#ctime")) return fail(msg, "Sanatçıya teklif için saat de gir.");
    }
    try {
      if (pic.getFile()) { msg.textContent = "Fotoğraf yükleniyor…"; msg.className = "msg"; f.bannerUrl = await uploadImage(pic.getFile(), session.user.uid); }
      const eventId = await createEvent(session.profile, f);
      if (artist) await createInvitation(session.profile, artist, { date: f.date, time: f.time, fee: v("#cfee"), eventId });
      toast(vip ? "Yayınlandı — VIP onayına düştü" : artist ? "Yayınlandı — sanatçıya teklif gönderildi" : "Etkinlik yayınlandı");
      location.hash = "#/venue";
    } catch (e) { fail(msg, "Oluşturulamadı."); }
  } });
  root.append(sect("Yeni Etkinlik", "add-circle-outline", 0, form), submit, msg);
}

// ── Analitik ──
async function renderAnalytics(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  try {
    const s = await venueStats(session.user.uid);
    clear(root);
    root.append(sect("Analitik", "bar-chart-outline", 0,
      h("div", { class: "stat-grid" },
        statCard("calendar-outline", s.eventCount, "Toplam Etkinlik"),
        statCard("time-outline", s.upcoming, "Yaklaşan"),
        statCard("people-outline", s.totalAttendance, "Toplam Katılım"),
        statCard("trending-up-outline", s.avgAttendance, "Ort. Katılım"),
        statCard("mic-outline", s.withArtist, "Sanatçılı"),
        statCard("sparkles-outline", s.vip, "VIP Etkinlik"))));
  } catch (e) { clear(root); root.append(errBox()); }
}
function statCard(ic, val, label) {
  return h("div", { class: "stat-card" }, icon(ic, { size: 22, color: ROLE.venue }),
    h("div", { class: "stat-val" }, String(val)), h("div", { class: "stat-label" }, label));
}

// ── Sanatçı bul + davet + rezidans ──
async function renderArtists(root) {
  clear(root);
  root.append(h("div", { class: "loading" }, spinner()));
  let artists = [];
  try { artists = await listArtists(); } catch (_) {}
  clear(root);
  let genre = "Tümü", term = "";
  const box = h("div", { class: "list-card" });
  const draw = () => {
    clear(box);
    const g = genre === "Tümü" ? null : genre;
    const t = term.trim().toLocaleLowerCase("tr-TR");
    const filtered = artists.filter((a) => {
      const ag = Array.isArray(a.genres) ? a.genres[0] : a.genre;
      const name = (a.displayName || a.name || "").toLocaleLowerCase("tr-TR");
      return (!g || ag === g) && (!t || name.includes(t));
    });
    if (!filtered.length) { box.append(empty("people-outline", "Sanatçı yok", "Filtreyi değiştirmeyi dene.")); return; }
    filtered.forEach((a) => box.append(artistRow(a)));
  };
  const search = h("input", { placeholder: "Sanatçı ara…", oninput: (e) => { term = e.target.value; draw(); } });
  const chips = h("div", { class: "chip-row" }, ...GENRE_FILTERS.map((g) => {
    const c = h("button", { class: "chip" + (g === genre ? " on" : ""), onclick: () => { genre = g; [...chips.children].forEach((x) => x.classList.remove("on")); c.classList.add("on"); draw(); } }, g);
    return c;
  }));
  root.append(sect("Sanatçı Bul", "search-outline", 0, h("div", { class: "filter-wrap" }, search, chips), box));
  draw();
}
function artistRow(a) {
  const name = a.displayName || a.name || "Sanatçı";
  const genre = Array.isArray(a.genres) ? (a.genres[0] || "") : (a.genre || "");
  return h("div", { class: "lrow" },
    avatar(name, ROLE.artist),
    h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, name), genre ? h("div", { class: "lrow-meta" }, genre) : null),
    h("div", { class: "lrow-actions" },
      h("button", { class: "act", title: "Uzun Dönem", onclick: () => residencyModal(a) }, icon("repeat-outline", { size: 15 })),
      h("button", { class: "act ok", onclick: () => inviteModal(a) }, icon("mail-outline", { size: 15 }), h("span", {}, "Davet"))));
}
function residencyModal(a) {
  const name = a.displayName || a.name || "Sanatçı";
  let months = 3; const days = new Set();
  const monthRow = h("div", { class: "chip-row" }, ...[1, 3, 6].map((m) => {
    const c = h("button", { class: "chip" + (m === 3 ? " on" : ""), onclick: () => { months = m; [...monthRow.children].forEach((x) => x.classList.remove("on")); c.classList.add("on"); } }, m + " ay"); return c;
  }));
  const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const dayRow = h("div", { class: "chip-row" }, ...DAYS.map((d, i) => {
    const idx = i === 6 ? 0 : i + 1;
    const c = h("button", { class: "chip", onclick: () => { if (days.has(idx)) { days.delete(idx); c.classList.remove("on"); } else { days.add(idx); c.classList.add("on"); } } }, d); return c;
  }));
  const body = h("div", {},
    h("span", { class: "flabel" }, "Süre"), monthRow,
    h("span", { class: "flabel" }, "Sahne Günleri"), dayRow,
    field({ label: "Saat", id: "rtime", type: "time" }),
    field({ label: "Gece Başına Ücret (₺)", id: "rfee", type: "number", placeholder: "En az 3500" }));
  modal({ title: `${name} — Uzun Dönem`, body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Teklif Et", ic: "send", keepOpen: true, onClick: async (close) => {
      if (!days.size) return toast("En az bir gün seç", "err");
      if (!v("#rtime")) return toast("Saat gir", "err");
      if (!(Number(v("#rfee")) >= 3500)) return toast("Ücret en az ₺3.500", "err");
      try { await createResidency(session.profile, a, { months, days: [...days], time: v("#rtime"), fee: v("#rfee") }); toast("Anlaşma teklifi gönderildi"); close(); } catch (e) { toast("Gönderilemedi", "err"); }
    } },
  ] });
}
function inviteModal(a) {
  const name = a.displayName || a.name || "Sanatçı";
  const pic = photoPicker("Etkinlik fotoğrafı (opsiyonel)");
  const body = h("div", {}, pic.node,
    h("div", { class: "frow" }, field({ label: "Tarih", id: "idate", type: "date" }), field({ label: "Saat", id: "itime", type: "time" })),
    field({ label: "Ücret (₺)", id: "ifee", type: "number", placeholder: "En az 3500" }),
    field({ label: "Mesaj (opsiyonel)", id: "imsg", placeholder: "…", multiline: true }));
  modal({ title: `${name} — Davet`, body, actions: [
    { label: "Vazgeç", variant: "ghost", onClick: () => {} },
    { label: "Davet Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      const f = { date: v("#idate"), time: v("#itime"), fee: v("#ifee"), message: v("#imsg") };
      if (!f.date || !f.time) return toast("Tarih ve saat gir", "err");
      if (!(Number(f.fee) >= 3500)) return toast("Ücret en az ₺3.500", "err");
      try { if (pic.getFile()) f.photoUrl = await uploadImage(pic.getFile(), session.user.uid); await createInvitation(session.profile, a, f); toast("Davet gönderildi"); close(); } catch (e) { toast("Gönderilemedi", "err"); }
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
