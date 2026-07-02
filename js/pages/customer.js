// Müşteri deneyimi — Keşfet, Harita, Akış, Mesajlar, Profil + etkinlik/sanatçı/mekan detay
// + Takip/Favoriler/Katıldıklarım/Yorumlarım/Bildirimler. App backend'iyle birebir.
import { session, logout, refreshProfile } from "../store.js";
import {
  discoverEvents, eventById, userById, listRealArtists, saveProfile, uploadImage,
  isAttending, attendEvent, unattendEvent, attendedEvents,
  isFollowing, followArtist, unfollowArtist, followingList,
  isFavVenue, favVenue, unfavVenue, favVenues, isFavEvent, favEvent, unfavEvent, favEvents,
  artistReviews, submitArtistReview, getVenueReviews, submitVenueReview, myReviews,
  listenTimeline, createPost, isLiked, toggleLike,
  listenNotifications, markNotifRead, deleteNotif,
} from "../data.js";
import { h, clear, icon, btn, topbar, bottomnav, empty, spinner, toast, avatar, field, card, badge, modal, fmtDate, fmtTL, ROLE } from "../ui.js";
import { messagesView, requestChat } from "./messages.js";

const C = ROLE.customer;
const NAV = [
  { key: "kesfet",   label: "Keşfet",   icon: "compass-outline",     href: "#/kesfet" },
  { key: "harita",   label: "Harita",   icon: "map-outline",         href: "#/harita" },
  { key: "akis",     label: "Akış",     icon: "newspaper-outline",   href: "#/akis" },
  { key: "mesajlar", label: "Mesajlar", icon: "chatbubbles-outline", href: "#/mesajlar" },
  { key: "profil",   label: "Profil",   icon: "person-outline",      href: "#/profil" },
];
const TITLES = { kesfet: "Keşfet", harita: "Harita", akis: "Akış", mesajlar: "Mesajlar", profil: "Profil" };
const uid = () => session.user?.uid;
const myName = () => session.profile?.displayName || session.user?.displayName || "Kullanıcı";

function base() { return (location.hash || "#/kesfet").split("?")[0]; }
function tabFromHash() { return base().replace("#/", "") || "kesfet"; }
function go(hash) { location.hash = hash; }
const seg = (i) => decodeURIComponent(base().split("/")[i] || "");

export function customerPage() {
  const b = base();
  if (b.startsWith("#/etkinlik/")) return detailShell("Etkinlik", eventDetail, seg(2));
  if (b.startsWith("#/sanatci/"))  return detailShell("Sanatçı", artistDetail, seg(2));
  if (b.startsWith("#/mekan/"))    return detailShell("Mekan", venueDetail, seg(2));
  if (b === "#/takip")       return detailShell("Takip Ettiklerim", followingView);
  if (b === "#/favoriler")   return detailShell("Favorilerim", favoritesView);
  if (b === "#/katildiklarim") return detailShell("Katıldıklarım", attendedView);
  if (b === "#/yorumlarim")  return detailShell("Yorumlarım", myReviewsView);
  if (b === "#/bildirimler") return detailShell("Bildirimler", notificationsView);

  const tab = tabFromHash();
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page has-nav", style: { "--role": C } },
    topbar(TITLES[tab] || "GigBridge", { subtitle: myName(), color: C,
      right: h("button", { class: "icon-btn", onclick: () => go("#/bildirimler"), title: "Bildirimler" }, icon("notifications-outline", { size: 20 })) }),
    content,
    bottomnav(NAV, tab, C));
  renderTab(tab, content);
  return page;
}

async function renderTab(tab, root) {
  if (tab === "kesfet")   return renderKesfet(root);
  if (tab === "mesajlar") { clear(root); return messagesView(root, C); }
  if (tab === "profil")   return renderProfil(root);
  if (tab === "harita")   return renderHarita(root);
  if (tab === "akis")     return renderAkis(root);
  clear(root); root.append(empty("construct-outline", "Yakında", "Bu bölüm geliyor."));
}

// ── Ortak yardımcılar ──
function eventWhen(ev) { const d = typeof ev.date === "string" && ev.date ? ev.date : fmtDate(ev.eventAt || ev.date); return [d, ev.startTime].filter(Boolean).join(" · "); }
function msOf(ev) { const v = ev.eventAt ?? ev.date; try { if (v && typeof v.toMillis === "function") return v.toMillis(); const t = Date.parse(v); return isNaN(t) ? null : t; } catch { return null; } }
function isLive(ev) {
  const s = msOf(ev); if (s == null) return false;
  let e = null; try { if (ev.endAt && typeof ev.endAt.toMillis === "function") e = ev.endAt.toMillis(); } catch (_) {}
  if (e == null) e = s + 3 * 3600e3;
  const now = Date.now(); return now >= s && now <= e;
}
function fmtTime(v) { try { const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v); return isNaN(d) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function sect(title, ic, count, ...kids) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head" }, h("h2", { class: "sect-title" }, icon(ic, { size: 15 }), " " + title),
      count ? h("span", { class: "count-pill" }, count) : null), ...kids);
}
function errBox(msg) { return empty("cloud-offline-outline", "Bir sorun oldu", msg || "Bağlantını kontrol edip tekrar dene."); }

function eventCard(ev) {
  const live = isLive(ev);
  return h("div", { class: "ecard", onclick: () => go("#/etkinlik/" + ev.id), style: { cursor: "pointer" } },
    h("div", { class: "ecard-banner", style: ev.bannerUrl ? { backgroundImage: `url(${ev.bannerUrl})` } : null },
      live ? h("span", { class: "vip-badge", style: { background: "#10b981" } }, icon("radio", { size: 10 }), "Şu an") : null,
      ev.vipStatus === "approved" ? h("span", { class: "vip-badge" }, icon("sparkles", { size: 10 }), "VIP") : null),
    h("div", { class: "ecard-body" },
      h("div", { class: "ecard-title" }, ev.title || "Etkinlik"),
      ev.artistName ? h("div", { class: "ecard-meta" }, icon("mic-outline", { size: 12 }), " " + ev.artistName) : null,
      h("div", { class: "ecard-meta" }, icon("business-outline", { size: 12 }), " " + (ev.venueName || "Mekan")),
      h("div", { class: "ecard-meta" }, icon("calendar-outline", { size: 12 }), " " + eventWhen(ev)),
      h("div", { class: "ecard-meta", style: { color: ev.ticketPrice ? "var(--amber)" : "var(--success)", fontWeight: "700" } }, ev.ticketPrice ? fmtTL(ev.ticketPrice) : "Ücretsiz")));
}
function artistCard(a) {
  return h("div", { class: "acard", onclick: () => go("#/sanatci/" + a.id), style: { cursor: "pointer" } },
    a.photoURL ? h("div", { class: "acard-photo", style: { backgroundImage: `url(${a.photoURL})` } }) : avatar(a.displayName, ROLE.artist),
    h("div", { class: "acard-name" }, a.displayName || "Sanatçı"),
    h("div", { class: "acard-sub" }, (Array.isArray(a.genres) ? a.genres[0] : a.genre) || "Müzik"));
}

// ── Keşfet ──
async function renderKesfet(root) {
  try {
    const [events, artists] = await Promise.all([discoverEvents(), listRealArtists()]);
    clear(root);
    const search = h("input", { class: "search-input", type: "search", placeholder: "Etkinlik, mekan veya sanatçı ara…" });
    const grid = h("div", { class: "grid" });
    const draw = () => {
      const q = search.value.trim().toLocaleLowerCase("tr-TR");
      const list = !q ? events : events.filter((e) => [e.title, e.venueName, e.artistName].some((x) => (x || "").toLocaleLowerCase("tr-TR").includes(q)));
      clear(grid);
      if (!list.length) { grid.append(empty("search-outline", "Sonuç yok", "Başka bir arama dene.")); return; }
      list.forEach((e) => grid.append(eventCard(e)));
    };
    search.oninput = draw;
    root.append(h("div", { class: "search-box" }, icon("search-outline", { size: 15, color: "var(--text-muted)" }), search));
    const liveEvents = events.filter(isLive);
    if (liveEvents.length) root.append(sect("Şu an çalıyor", "radio-outline", liveEvents.length, h("div", { class: "grid" }, ...liveEvents.map(eventCard))));
    root.append(sect("Yaklaşan Etkinlikler", "calendar-outline", events.length, grid));
    draw();
    if (artists.length) root.append(sect("Popüler Sanatçılar", "mic-outline", artists.length, h("div", { class: "grid grid-artists" }, ...artists.slice(0, 12).map(artistCard))));
  } catch (e) { clear(root); root.append(errBox("Keşfet yüklenemedi.")); }
}

// ── Etkinlik detay (katıl + favori) ──
async function eventDetail(id, root) {
  const [ev, attending, fav] = await Promise.all([eventById(id), isAttending(id, uid()), isFavEvent(uid(), id)]);
  clear(root);
  if (!ev) { root.append(empty("alert-circle-outline", "Etkinlik bulunamadı")); return; }
  let att = attending, favd = fav;
  let count = ev.attendeeCount ?? 0;

  const heart = h("button", { class: "fab-heart", title: "Favori", onclick: async () => {
    try { if (favd) { await unfavEvent(uid(), id); favd = false; } else { await favEvent(uid(), ev); favd = true; } heart.firstChild?.setAttribute("name", favd ? "heart" : "heart-outline"); toast(favd ? "Favorilere eklendi" : "Favoriden çıkarıldı"); } catch (_) { toast("İşlem başarısız", "err"); }
  } }, icon(favd ? "heart" : "heart-outline", { size: 20, color: "#f43f5e" }));

  const countRow = drow("people-outline", "Katılımcı", String(count));
  const joinBtn = btn(att ? "Katılımdan Ayrıl" : "Katıl", { ic: att ? "close-circle-outline" : "checkmark-circle-outline", full: true, color: att ? undefined : C, variant: att ? "ghost" : "primary" });
  joinBtn.onclick = async () => {
    joinBtn.disabled = true;
    try {
      if (att) { await unattendEvent(id, uid()); att = false; count--; }
      else {
        if (ev.capacity && count >= ev.capacity) { toast("Etkinlik dolu", "err"); joinBtn.disabled = false; return; }
        await attendEvent(ev, uid(), myName()); att = true; count++;
      }
      countRow.querySelector(".drow-value").textContent = String(count);
      joinBtn.querySelector("span").textContent = att ? "Katılımdan Ayrıl" : "Katıl";
      joinBtn.className = "btn btn-" + (att ? "ghost" : "primary") + " btn-full";
      toast(att ? "Katıldın! 🎉" : "Katılım iptal edildi");
    } catch (_) { toast("İşlem başarısız", "err"); }
    joinBtn.disabled = false;
  };

  root.append(
    h("div", { class: "detail-hero" },
      ev.bannerUrl ? h("div", { class: "detail-banner", style: { backgroundImage: `url(${ev.bannerUrl})` } }) : h("div", { class: "detail-banner ph" }, icon("musical-notes-outline", { size: 40, color: "#6b6b82" })),
      heart),
    h("h1", { class: "detail-title" }, ev.title || "Etkinlik"),
    h("div", { class: "badge-row" },
      isLive(ev) ? badge("Şu an çalıyor", "#10b981", "radio") : null,
      ev.vipStatus === "approved" ? badge("VIP", C, "sparkles") : null,
      (Array.isArray(ev.genre) ? ev.genre[0] : ev.genre) ? badge(Array.isArray(ev.genre) ? ev.genre[0] : ev.genre, C) : null),
    h("div", { class: "detail-rows" },
      ev.artistName ? drow("mic-outline", "Sanatçı", ev.artistName, ev.artistId ? () => go("#/sanatci/" + ev.artistId) : null) : null,
      drow("business-outline", "Mekan", ev.venueName || "—", ev.venueId ? () => go("#/mekan/" + ev.venueId) : null),
      drow("calendar-outline", "Tarih", eventWhen(ev)),
      ev.endAt ? drow("time-outline", "Bitiş", fmtTime(ev.endAt)) : null,
      drow("pricetag-outline", "Giriş", ev.ticketPrice ? fmtTL(ev.ticketPrice) : "Ücretsiz"),
      (ev.location?.city || ev.city) ? drow("location-outline", "Şehir", ev.location?.city || ev.city) : null,
      countRow),
    ev.description ? card(h("div", { class: "sect-title mb6" }, "Açıklama"), h("p", { class: "muted" }, ev.description)) : null,
    h("div", { class: "sticky-cta" }, joinBtn),
  );
}

function drow(ic, label, value, onClick) {
  return h("div", { class: "drow" + (onClick ? " tappable" : ""), onclick: onClick || null },
    icon(ic, { size: 16, color: "var(--text-muted)" }),
    h("div", { class: "drow-label" }, label),
    h("div", { class: "drow-value" }, value),
    onClick ? icon("chevron-forward", { size: 14, color: "var(--text-muted)" }) : null);
}

// ── Sanatçı detay (takip + yorum) ──
async function artistDetail(id, root) {
  const [a, revs, following] = await Promise.all([userById(id), artistReviews(id), isFollowing(uid(), id)]);
  clear(root);
  if (!a) { root.append(empty("alert-circle-outline", "Sanatçı bulunamadı")); return; }
  let foll = following;
  const followBtn = btn(foll ? "Takiptesin" : "Takip Et", { ic: foll ? "checkmark" : "person-add-outline", color: foll ? undefined : ROLE.artist, variant: foll ? "ghost" : "primary" });
  followBtn.onclick = async () => {
    followBtn.disabled = true;
    try { if (foll) { await unfollowArtist(uid(), id); foll = false; } else { await followArtist(uid(), a); foll = true; } followBtn.querySelector("span").textContent = foll ? "Takiptesin" : "Takip Et"; followBtn.className = "btn btn-" + (foll ? "ghost" : "primary"); toast(foll ? "Takip ediliyor" : "Takipten çıkıldı"); } catch (_) { toast("İşlem başarısız", "err"); }
    followBtn.disabled = false;
  };
  const avg = revs.length ? (revs.reduce((s, r) => s + (r.rating || 0), 0) / revs.length).toFixed(1) : "—";
  root.append(
    profileHead(a, ROLE.artist, (Array.isArray(a.genres) ? a.genres.join(", ") : a.genre) || "Müzik"),
    h("div", { class: "action-row" }, followBtn,
      btn("Puan Ver", { ic: "star-outline", onClick: () => reviewModal("artist", a, () => artistDetail(id, root)) }),
      msgBtn(a)),
    h("div", { class: "stat-grid" },
      statCard(String(a.attendanceCount ?? 0), "Katılım"), statCard(avg, "Puan"),
      statCard(String(revs.length), "Yorum"), statCard(shortNum(a.followerCount ?? 0), "Takipçi")),
    a.bio ? card(h("div", { class: "sect-title mb6" }, "Hakkında"), h("p", { class: "muted" }, a.bio)) : null,
    reviewsBlock("Yorumlar", revs.map((r) => reviewCard(r.authorName, r.rating, r.comment, r.createdAt))),
  );
}

// ── Mekan detay (favori + yorum + müşteri/sanatçı yorum ayrımı) ──
async function venueDetail(id, root) {
  const [v, revs, fav] = await Promise.all([userById(id), getVenueReviews(id), isFavVenue(uid(), id)]);
  clear(root);
  if (!v) { root.append(empty("alert-circle-outline", "Mekan bulunamadı")); return; }
  let favd = fav;
  const favBtn = btn(favd ? "Kaydedildi" : "Kaydet", { ic: favd ? "bookmark" : "bookmark-outline", color: favd ? undefined : ROLE.venue, variant: favd ? "ghost" : "primary" });
  favBtn.onclick = async () => {
    favBtn.disabled = true;
    try { if (favd) { await unfavVenue(uid(), id); favd = false; } else { await favVenue(uid(), v); favd = true; } favBtn.querySelector("span").textContent = favd ? "Kaydedildi" : "Kaydet"; favBtn.className = "btn btn-" + (favd ? "ghost" : "primary"); toast(favd ? "Kaydedildi" : "Kaldırıldı"); } catch (_) { toast("İşlem başarısız", "err"); }
    favBtn.disabled = false;
  };
  // Müşteri / sanatçı yorum ayrımı (görünürlük: everyone|anonymous müşteriye görünür, artists gizli)
  const custR = revs.filter((r) => (r.authorType ?? "customer") !== "artist");
  const artR = revs.filter((r) => (r.authorType ?? "customer") === "artist")
    .filter((r) => { const vis = r.visibility ?? (r.isAnonymous ? "anonymous" : "everyone"); return vis !== "artists"; })
    .map((r) => { const anon = (r.visibility ?? (r.isAnonymous ? "anonymous" : "everyone")) === "anonymous"; return { ...r, _name: anon ? "Anonim Sanatçı" : (r.authorName ?? r.artistName ?? "Sanatçı") }; });
  root.append(
    profileHead(v, ROLE.venue, [v.city, v.district].filter(Boolean).join(" · ") || v.address || "Mekan"),
    h("div", { class: "action-row" }, favBtn,
      btn("Puan Ver", { ic: "star-outline", onClick: () => reviewModal("venue", v, () => venueDetail(id, root)) }),
      msgBtn(v)),
    (v.location?.lat != null) ? btn("Haritada Göster", { ic: "navigate-outline", full: true, variant: "ghost", onClick: () => window.open(`https://www.google.com/maps/search/?api=1&query=${v.location.lat},${v.location.lng}`, "_blank") }) : null,
    h("div", { class: "detail-rows" },
      v.address ? drow("location-outline", "Adres", v.address) : null,
      v.capacity ? drow("people-outline", "Kapasite", String(v.capacity)) : null,
      v.phone ? drow("call-outline", "Telefon", v.phone) : null,
      v.website ? drow("globe-outline", "Web", v.website) : null),
    v.bio ? card(h("p", { class: "muted" }, v.bio)) : null,
    reviewsBlock("Müşteri Yorumları", custR.map((r) => reviewCard(r.authorName, r.overallRating ?? r.rating, r.comment, r.createdAt))),
    artR.length ? reviewsBlock("Sanatçı Yorumları", artR.map((r) => reviewCard(r._name, r.overallRating ?? r.rating, r.comment, r.createdAt, true))) : null,
  );
}

function profileHead(u, color, sub) {
  return h("div", { class: "profile-head detail-head" },
    u.photoURL ? h("div", { class: "acard-photo big", style: { backgroundImage: `url(${u.photoURL})` } }) : avatar(u.displayName, color),
    h("div", {}, h("div", { class: "ph-name" }, u.displayName || "—"), h("div", { class: "ph-mail" }, sub)));
}
function statCard(val, label) { return h("div", { class: "stat-card" }, h("div", { class: "stat-val" }, val), h("div", { class: "stat-label" }, label)); }
function shortNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n); }
function msgBtn(u) { return btn("Mesaj", { ic: "chatbubble-ellipses-outline", onClick: () => { requestChat({ otherId: u.id, otherName: u.displayName || "Kullanıcı" }); go("#/mesajlar"); } }); }
function stars(n) { return h("span", { class: "stars" }, ...[1, 2, 3, 4, 5].map((i) => icon(i <= (n || 0) ? "star" : "star-outline", { size: 13, color: "var(--amber)" }))); }
function reviewCard(name, rating, comment, createdAt, isArtist) {
  return h("div", { class: "review-card" },
    h("div", { class: "review-top" },
      h("div", { class: "review-who" }, avatar(name, isArtist ? ROLE.artist : C),
        h("div", {}, h("div", { class: "review-name" }, name || "Kullanıcı"), h("div", { class: "review-date" }, fmtDate(createdAt)))),
      stars(rating)),
    comment ? h("p", { class: "review-comment" }, comment) : null);
}
function reviewsBlock(title, cards) {
  return h("section", { class: "sect" }, h("div", { class: "sect-head" }, h("h2", { class: "sect-title" }, title)),
    cards.length ? h("div", {}, ...cards) : empty("chatbox-outline", "Henüz yorum yok"));
}

// Puan/yorum modal
function reviewModal(kind, target, onDone) {
  let rating = 0;
  const starRow = h("div", { class: "star-pick" });
  const paint = () => { clear(starRow); [1, 2, 3, 4, 5].forEach((i) => starRow.append(h("button", { class: "star-btn", onclick: () => { rating = i; paint(); } }, icon(i <= rating ? "star" : "star-outline", { size: 30, color: "var(--amber)" })))); };
  paint();
  const ta = h("textarea", { class: "review-ta", rows: 4, placeholder: "Deneyimini paylaş (opsiyonel)…" });
  modal({
    title: (kind === "artist" ? target.displayName : target.displayName) + " — Puan Ver",
    body: h("div", {}, starRow, ta),
    actions: [{ label: "Gönder", ic: "send", keepOpen: true, onClick: async (close) => {
      if (rating < 1) { toast("Puan seç", "err"); return; }
      try {
        if (kind === "artist") await submitArtistReview(uid(), myName(), target, rating, ta.value.trim());
        else await submitVenueReview(uid(), myName(), target, rating, ta.value.trim());
        toast("Yorumun gönderildi"); close(); onDone && onDone();
      } catch (_) { toast("Gönderilemedi", "err"); }
    } }],
  });
}

// ── Profil ──
async function renderProfil(root) {
  clear(root);
  const p = session.profile || {};
  const pic = fileBtn();
  const menu = (ic, label, hash) => h("div", { class: "menu-row", onclick: () => go(hash) }, icon(ic, { size: 18, color: C }), h("span", { class: "menu-label" }, label), icon("chevron-forward", { size: 15, color: "var(--text-muted)" }));
  root.append(
    h("div", { class: "profile-head" },
      p.photoURL ? h("div", { class: "acard-photo big", style: { backgroundImage: `url(${p.photoURL})` } }) : avatar(p.displayName, C),
      h("div", {}, h("div", { class: "ph-name" }, p.displayName || "Müşteri"), h("div", { class: "ph-mail" }, p.email || ""))),
    card(
      pic.node,
      field({ label: "Şehir", id: "ccity", value: p.city || "", placeholder: "Örn. İstanbul" }),
      btn("Kaydet", { ic: "save-outline", full: true, color: C, onClick: async () => {
        try {
          const patch = { city: (document.querySelector("#ccity").value || "").trim() || null };
          if (pic.getFile()) patch.photoURL = await uploadImage(pic.getFile(), uid());
          await saveProfile(uid(), patch); await refreshProfile(); toast("Kaydedildi");
        } catch (_) { toast("Kaydedilemedi", "err"); }
      } })),
    h("div", { class: "menu-card" },
      menu("heart-outline", "Takip Ettiklerim", "#/takip"),
      menu("bookmark-outline", "Favorilerim", "#/favoriler"),
      menu("checkmark-done-outline", "Katıldığım Etkinlikler", "#/katildiklarim"),
      menu("chatbox-ellipses-outline", "Yorumlarım", "#/yorumlarim"),
      menu("notifications-outline", "Bildirimler", "#/bildirimler")),
    btn("Çıkış Yap", { variant: "ghost", ic: "log-out-outline", full: true, onClick: logout }),
  );
}
function fileBtn() {
  let file = null;
  const inp = h("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: (e) => { file = (e.target.files || [])[0] || null; if (file) node.querySelector("span").textContent = "Fotoğraf seçildi ✓"; } });
  const node = h("label", { class: "file-btn" }, icon("camera-outline", { size: 16 }), h("span", {}, "Profil fotoğrafı seç"), inp);
  return { node, getFile: () => file };
}

// ── Akış (timeline) ──
function renderAkis(root) {
  clear(root);
  root.append(h("div", { class: "cta-row" }, btn("Yeni Gönderi", { ic: "add-circle-outline", full: true, color: C, onClick: postModal })));
  const listWrap = h("div", { class: "feed" }, h("div", { class: "loading" }, spinner()));
  root.append(listWrap);
  const unsub = listenTimeline((posts) => {
    clear(listWrap);
    if (!posts.length) { listWrap.append(empty("newspaper-outline", "Akış boş", "İlk gönderiyi sen paylaş.")); return; }
    posts.forEach((p) => listWrap.append(postCard(p)));
  });
  root._cleanup = unsub; // sekme değişince router yeni node basıyor; leak minimal
}
function postCard(p) {
  const liked = { v: false };
  const likeBtn = h("button", { class: "post-act", onclick: async () => {
    try { await toggleLike(p.id, uid(), liked.v); liked.v = !liked.v; likeBtn.firstChild.setAttribute("name", liked.v ? "heart" : "heart-outline"); } catch (_) {}
  } }, icon("heart-outline", { size: 16 }), h("span", {}, "Beğen"));
  isLiked(p.id, uid()).then((l) => { liked.v = l; likeBtn.firstChild.setAttribute("name", l ? "heart" : "heart-outline"); });
  return h("div", { class: "post-card" },
    h("div", { class: "post-head" }, avatar(p.authorName, C),
      h("div", {}, h("div", { class: "post-author" }, p.authorName || "Kullanıcı"),
        h("div", { class: "post-meta" }, [p.authorCity, fmtDate(p.createdAt)].filter(Boolean).join(" · ")))),
    p.rating ? stars(p.rating) : null,
    h("p", { class: "post-content" }, p.content || ""),
    p.venue ? h("div", { class: "post-tag" }, icon("business-outline", { size: 12 }), " " + p.venue) : null,
    h("div", { class: "post-actions" }, likeBtn,
      h("span", { class: "post-count" }, icon("heart", { size: 12, color: "var(--text-muted)" }), " " + (p.likeCount ?? 0)),
      h("span", { class: "post-count" }, icon("chatbubble-outline", { size: 12, color: "var(--text-muted)" }), " " + (p.commentCount ?? 0))));
}
function postModal() {
  const ta = h("textarea", { class: "review-ta", rows: 4, maxlength: 500, placeholder: "Ne düşünüyorsun?" });
  modal({ title: "Yeni Gönderi", body: ta, actions: [{ label: "Paylaş", ic: "send", keepOpen: true, onClick: async (close) => {
    const t = ta.value.trim(); if (!t) { toast("Bir şeyler yaz", "err"); return; }
    try { await createPost(uid(), myName(), session.profile?.city, t); toast("Paylaşıldı"); close(); } catch (_) { toast("Gönderilemedi", "err"); }
  } }] });
}

// ── Harita (Leaflet) ──
let _leaflet = null;
function loadLeaflet() {
  if (_leaflet) return _leaflet;
  _leaflet = new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = h("link", { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" });
    document.head.append(css);
    const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve(window.L); s.onerror = reject; document.head.append(s);
  });
  return _leaflet;
}
async function renderHarita(root) {
  clear(root);
  const mapEl = h("div", { class: "map-el" });
  root.append(mapEl);
  try {
    const [L, events] = await Promise.all([loadLeaflet(), discoverEvents()]);
    const withLoc = events.filter((e) => e.location?.lat != null && e.location?.lng != null);
    const center = withLoc[0] ? [withLoc[0].location.lat, withLoc[0].location.lng] : [39.0, 35.0];
    const map = L.map(mapEl).setView(center, withLoc.length ? 11 : 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    withLoc.forEach((e) => {
      const color = isLive(e) ? "#10b981" : "#7c3aed";
      const m = L.circleMarker([e.location.lat, e.location.lng], { radius: 9, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
      m.bindPopup(`<b>${(e.title || "Etkinlik").replace(/</g, "&lt;")}</b><br>${(e.venueName || "")}<br><a href="#/etkinlik/${e.id}">Detay →</a>`);
    });
    if (!withLoc.length) root.append(empty("location-outline", "Konumlu etkinlik yok", "Mekanlar konum ekledikçe burada görünür."));
    setTimeout(() => map.invalidateSize(), 200);
  } catch (e) { clear(root); root.append(errBox("Harita yüklenemedi.")); }
}

// ── Alt sayfalar ──
async function followingView(_id, root) {
  clear(root);
  try {
    const list = await followingList(uid());
    if (!list.length) { root.append(empty("heart-outline", "Kimseyi takip etmiyorsun", "Sanatçı profillerinden takip et.")); return; }
    root.append(h("div", { class: "list-card" }, ...list.map((f) => h("div", { class: "lrow", onclick: () => go("#/sanatci/" + (f.artistId || f.id)), style: { cursor: "pointer" } },
      avatar(f.artistName, ROLE.artist),
      h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, f.artistName || "Sanatçı"), h("div", { class: "lrow-meta" }, f.genre || "")),
      icon("chevron-forward", { size: 16, color: "var(--text-muted)" })))));
  } catch (e) { root.append(errBox()); }
}
async function favoritesView(_id, root) {
  clear(root);
  try {
    const [venues, events] = await Promise.all([favVenues(uid()), favEvents(uid())]);
    if (!venues.length && !events.length) { root.append(empty("bookmark-outline", "Favori yok", "Etkinlik ve mekanları kaydet.")); return; }
    if (events.length) root.append(sect("Etkinlikler", "calendar-outline", events.length,
      h("div", { class: "list-card" }, ...events.map((e) => h("div", { class: "lrow", onclick: () => go("#/etkinlik/" + e.id), style: { cursor: "pointer" } },
        avatar(e.title, C), h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, e.title), h("div", { class: "lrow-meta" }, [e.venue, e.date].filter(Boolean).join(" · "))), icon("chevron-forward", { size: 16, color: "var(--text-muted)" }))))));
    if (venues.length) root.append(sect("Mekanlar", "business-outline", venues.length,
      h("div", { class: "list-card" }, ...venues.map((v) => h("div", { class: "lrow", onclick: () => go("#/mekan/" + (v.venueId || v.id)), style: { cursor: "pointer" } },
        avatar(v.venueName, ROLE.venue), h("div", { class: "lrow-info" }, h("div", { class: "lrow-name" }, v.venueName), h("div", { class: "lrow-meta" }, v.city || "")), icon("chevron-forward", { size: 16, color: "var(--text-muted)" }))))));
  } catch (e) { root.append(errBox()); }
}
async function attendedView(_id, root) {
  clear(root);
  try {
    const list = await attendedEvents(uid());
    if (!list.length) { root.append(empty("checkmark-done-outline", "Henüz etkinliğe katılmadın", "Keşfet'ten etkinliklere katıl.")); return; }
    root.append(h("div", { class: "grid" }, ...list.map(eventCard)));
  } catch (e) { root.append(errBox()); }
}
async function myReviewsView(_id, root) {
  clear(root);
  try {
    const list = await myReviews(uid());
    if (!list.length) { root.append(empty("chatbox-outline", "Henüz yorum yapmadın")); return; }
    root.append(h("div", {}, ...list.map((r) => reviewCard(r.targetName || r.venueName || "—", r.overallRating ?? r.rating, r.comment, r.createdAt))));
  } catch (e) { root.append(errBox()); }
}
function notificationsView(_id, root) {
  clear(root);
  const wrap = h("div", {}, h("div", { class: "loading" }, spinner()));
  root.append(wrap);
  listenNotifications(uid(), (list) => {
    clear(wrap);
    if (!list.length) { wrap.append(empty("notifications-off-outline", "Bildirim yok")); return; }
    list.forEach((n) => { if (n.read === false) markNotifRead(n.id); });
    list.forEach((n) => wrap.append(h("div", { class: "notif" + (n.read === false ? " unread" : "") },
      icon(notifIcon(n.type), { size: 18, color: C }),
      h("div", { class: "notif-body" }, h("div", { class: "notif-title" }, n.title || "Bildirim"), h("div", { class: "notif-text" }, n.body || ""), h("div", { class: "notif-time" }, fmtDate(n.createdAt))),
      h("button", { class: "notif-x", onclick: () => deleteNotif(n.id) }, icon("close", { size: 15 })))));
  });
}
function notifIcon(t) { return ({ event_invite: "mic-outline", event_deleted: "trash-outline", invitation: "mail-outline", group_invite: "people-outline", residency_offer: "calendar-outline" })[t] || "notifications-outline"; }

// Detay ekran sarmalayıcı (geri butonu + async yükleme)
function detailShell(title, loader, id) {
  const content = h("div", { class: "content detail" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page", style: { "--role": C } },
    h("header", { class: "topbar detail-topbar", style: { "--role": C } },
      h("button", { class: "icon-btn", onclick: () => history.length > 1 ? history.back() : go("#/kesfet") }, icon("chevron-back", { size: 22 })),
      h("h1", { class: "tb-title" }, title),
      h("span", { style: { width: "34px" } })),
    content);
  loader(id, content);
  return page;
}
