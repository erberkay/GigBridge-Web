// Grup sayfası — mobil (≤768) + sanatçı paneli (legacy / masaüstü legacy-in-shell). Masaüstü karşılığı: js/desktop/public/sanatci.js (G).
// Rota ayrı değil: #/sanatci/<grupId> (dinleyici/misafir: customer.js artistDetail) ve #/artist/sanatci/<grupId> (sanatçı:
// artist.js renderArtistDetail) kimliği users'ta bulamayınca groups/{id}'yi çizer (data.pickPerformer). Görsel yapı müşteri sanatçı
// detayıyla aynı (pd-* / ed-* / rv-* sınıfları, ui.js ortak bloklar) + GRUP rozeti, Üyeler, Yaklaşan Etkinlikler.
// Veri: reviews targetId == grupId (targetType "artist"), takip users/{uid}/followingGroups + groups/{gid}/followers,
// etkinlikler artistId|groupId == grupId; Mesaj / Teklif İste grubun iletişim kişisine (data.groupContactId) mesaj olarak gider.
import { session } from "../store.js";
import {
  groupReviews, submitGroupReview, isFollowingGroup, followGroup, unfollowGroup, groupFollowerCount, groupMembers, eventsByGroup,
  groupContactId, sendMessage, convIdFor, isEventOver, eventStartMs,
} from "../data.js";
import {
  h, clear, icon, toast, modal, lightbox, fmtDate, profileTagline, profileResidency, featuredSet, venueChips, featuredReview,
  availabilityBadge, bookingRequestModal, rateCardBlock, suitabilityBlock, serviceAreaBlock, techRiderBlock, videoReel, languagesBlock,
  priceBadge, addOnsBlock, termsBlock, trustedBadge,
} from "../ui.js";
import { requestChat } from "./messages.js";
import { loginModal } from "./auth.js";

const go = (hash) => { location.hash = hash; };
const authed = () => !!session.user && !session.guest;
const myName = () => session.profile?.displayName || session.user?.displayName || "Kullanıcı";
// customer.js loginGate ile aynı (misafir → giriş/kayıt modalı)
function loginGate(action) {
  if (authed()) return false;
  modal({
    title: "Giriş Gerekli",
    body: h("p", { class: "muted" }, (action ? action + " için " : "") + "bir hesapla giriş yapman gerekiyor. Kayıt olmak ücretsiz."),
    actions: [
      { label: "Kayıt Ol", variant: "ghost", ic: "person-add-outline", onClick: () => go("#/register") },
      { label: "Giriş Yap", ic: "log-in-outline", onClick: () => loginModal() },
    ],
  });
  return true;
}

// ── customer.js sanatçı detayındaki küçük parçalarla aynı ──
const pdStat = (val, label, star) => h("div", { class: "pd-stat" },
  h("div", { class: "pd-stat-val" }, star ? icon("star", { size: 14, color: "#F59E0B" }) : null, String(val)),
  h("div", { class: "pd-stat-lbl" }, label));
const pdDivider = () => h("div", { class: "pd-div" });
const pdTitle = (t) => h("h2", { class: "ed-secttitle" }, t);
const shortNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n));
function rvCard(name, rating, comment, createdAt) {
  return h("div", { class: "rv-card" },
    h("div", { class: "rv-top" },
      h("div", { class: "rv-who" },
        h("div", { class: "rv-av" }, (name || "K").charAt(0).toLocaleUpperCase("tr-TR")),
        h("div", {}, h("div", { class: "rv-name" }, name || "Kullanıcı"), h("div", { class: "rv-date" }, fmtDate(createdAt)))),
      h("span", { class: "stars" }, ...[1, 2, 3, 4, 5].map((i) => icon(i <= (rating || 0) ? "star" : "star-outline", { size: 12, color: "#F59E0B" })))),
    comment ? h("p", { class: "rv-comment" }, comment) : null);
}
const rvEmpty = (text) => h("div", { class: "rv-empty" }, icon("star-outline", { size: 32, color: "var(--text-muted)" }), h("div", {}, text));
function socialUrl(key, val) {
  const s = String(val || "").trim(); if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const hn = s.replace(/^@/, "");
  if (key === "instagram") return "https://instagram.com/" + hn;
  if (key === "soundcloud") return "https://soundcloud.com/" + hn;
  if (key === "youtube") return "https://www.youtube.com/results?search_query=" + encodeURIComponent(s);
  return "https://open.spotify.com/search/" + encodeURIComponent(s);
}
function socialBlock(social) {
  if (!social) return null;
  const META = [["instagram", "logo-instagram"], ["soundcloud", "logo-soundcloud"], ["spotify", "musical-notes"], ["youtube", "logo-youtube"]];
  const links = META.map(([k, ic]) => { const u = socialUrl(k, social[k]); return u ? h("a", { class: "pd-social", href: u, target: "_blank", rel: "noopener" }, icon(ic, { size: 20, color: "var(--primary)" })) : null; }).filter(Boolean);
  if (!links.length) return null;
  return h("div", { class: "ed-sect" }, pdTitle("Sosyal"), h("div", { class: "pd-socials" }, ...links));
}
// Tür-gradyan avatar (customer.js gAv paleti) — foto varsa arka plan görseli
const GRADS = [["#8B5CF6", "#6D28D9"], ["#EF4444", "#B91C1C"], ["#10B981", "#059669"], ["#F59E0B", "#D97706"], ["#06B6D4", "#0891B2"], ["#EC4899", "#BE185D"]];
function slAv(name, photo, size) {
  const g = GRADS[[...String(name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length];
  const style = { width: size + "px", height: size + "px", borderRadius: (size / 2) + "px", fontSize: Math.round(size * 0.4) + "px",
    background: photo ? `center / cover no-repeat url("${photo}")` : `linear-gradient(135deg, ${g[0]}, ${g[1]})` };
  return h("div", { class: "sl-av", style, "aria-hidden": "true" }, photo ? null : (name || "?").charAt(0).toLocaleUpperCase("tr-TR"));
}
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
function evWhen(ev) {
  const t = eventStartMs(ev); if (t == null) return ev.date || "";
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const UNPUBLISHED = new Set(["cancelled", "canceled", "draft", "deleted", "pending", "rejected", "archived", "completed", "past"]);

// Puan & Yorum (customer.js reviewModal ile aynı form; yazım targetType "artist")
function groupReviewModal(g, onDone) {
  let rating = 0;
  const starRow = h("div", { class: "rv-starpick" });
  const paint = () => { clear(starRow); [1, 2, 3, 4, 5].forEach((i) => starRow.append(h("button", { class: "star-btn", "aria-label": `${i} yıldız`, onclick: () => { rating = i; paint(); } }, icon(i <= rating ? "star" : "star-outline", { size: 36, color: i <= rating ? "#F59E0B" : "var(--text-muted)" })))); };
  paint();
  const ta = h("textarea", { class: "rv-input", rows: 4, maxlength: 500, placeholder: "Yorumunuzu yazın... (en az 10 karakter)" });
  modal({
    title: "Puan & Yorum",
    body: h("div", {}, h("p", { class: "rv-modalsub" }, g.displayName || g.name || ""), starRow, ta),
    actions: [
      { label: "İptal", variant: "ghost", onClick: () => {} },
      { label: "Gönder", keepOpen: true, onClick: async (close) => {
        if (rating < 1) { toast("Puan seç", "err"); return; }
        if (ta.value.trim().length < 10) { toast("Yorum en az 10 karakter olmalı", "err"); return; }
        try {
          await submitGroupReview(session.user.uid, myName(), g, rating, ta.value.trim());
          toast("Yorumun gönderildi"); close(); onDone && onDone();
        } catch (_) { toast("Gönderilemedi", "err"); }
      } }],
  });
}

// viewer: "customer" (misafir/dinleyici — #/sanatci, #/etkinlik, #/mesajlar) | "artist" (sanatçı paneli — #/artist/sanatci, #/artist/mesaj;
// etkinlik detayı sanatçı rotasında yok → etkinlik satırları gezinmez, teklif/yorum yok)
export async function renderGroupDetail(g, root, { viewer = "customer" } = {}) {
  const id = g.id;
  const me = session.user?.uid || null;
  const isArtistView = viewer === "artist";
  const [revs, following, follCount, members, events] = await Promise.all([
    groupReviews(id).catch(() => []),
    authed() && me ? isFollowingGroup(me, id) : false,
    groupFollowerCount(g).catch(() => Number(g.followerCount) || 0),
    groupMembers(g).catch(() => []),
    eventsByGroup(id).catch(() => []),
  ]);
  clear(root);
  const name = g.displayName || g.name || "Grup";
  const genres = [...new Set((g.genres || []).filter(Boolean))];
  const rated = revs.filter((r) => (r.rating || 0) > 0);
  const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : "—";
  const custRevs = revs.filter((r) => (r.authorType ?? "customer") === "customer");
  const memberCount = g.memberIds.length;
  const isMember = !!me && g.memberIds.includes(me);
  const contactId = groupContactId(g);
  const contactName = members.find((m) => m.id === contactId)?.name || "Grup yöneticisi";
  // Mekan sosyal takip yapmaz (gizli izleme; data.followGroup da reddeder) → düğme yok
  const canFollow = !isMember && session.profile?.userType !== "venue";
  const canMsg = !isMember && !!contactId && contactId !== me;
  const canOffer = !isArtistView && canMsg;
  const canReview = !isArtistView && !isMember;
  const msgRoute = isArtistView ? "#/artist/mesaj" : "#/mesajlar";
  const memberHref = (mid) => (isArtistView ? "#/artist/sanatci/" : "#/sanatci/") + encodeURIComponent(mid);
  const refresh = () => renderGroupDetail(g, root, { viewer });

  // ── takip (grup favorisi) ──
  let foll = !!following;
  let fCount = follCount ?? 0;
  const fIc = () => icon(foll ? "checkmark-circle" : "person-add-outline", { size: 18, color: foll ? "#C084FC" : "#A78BFA" });
  const fTx = h("span", {}, foll ? "Takipte" : "Takip Et");
  const followBtn = h("button", { class: "pd-act" + (foll ? " on" : "") }, fIc(), fTx);
  const follStat = pdStat(shortNum(fCount), "Takipçi");
  followBtn.onclick = async () => {
    if (loginGate("Takip etmek")) return;
    followBtn.disabled = true;
    try {
      if (foll) { await unfollowGroup(me, id); foll = false; fCount = Math.max(0, fCount - 1); }
      else { await followGroup(me, g); foll = true; fCount += 1; }
      followBtn.classList.toggle("on", foll); fTx.textContent = foll ? "Takipte" : "Takip Et";
      followBtn.replaceChild(fIc(), followBtn.firstChild);
      follStat.querySelector(".pd-stat-val").textContent = shortNum(fCount);
      toast(foll ? "Takip ediliyor" : "Takipten çıkıldı");
    } catch (_) { toast("İşlem başarısız", "err"); }
    followBtn.disabled = false;
  };
  const openChat = () => { requestChat({ otherId: contactId, otherName: contactName }); go(msgRoute); };
  const acts = [];
  if (canFollow) acts.push(followBtn);
  if (canMsg) acts.push(h("button", { class: "pd-act", "aria-label": `Mesaj — grup yöneticisi ${contactName}`, onclick: () => { if (loginGate("Mesaj göndermek")) return; openChat(); } },
    icon("chatbubble-ellipses-outline", { size: 18, color: "#A78BFA" }), h("span", {}, "Mesaj")));
  if (canOffer) acts.push(h("button", { class: "pd-act solid", onclick: () => {
    if (loginGate("Teklif göndermek")) return;
    bookingRequestModal({
      artistName: name,
      sub: `${name} için teklif isteğin grup yöneticisine (${contactName}) mesaj olarak iletilir; iletişim GigBridge içinde kalır.`,
      lines: ["• Grup: " + name],
      onSubmit: async (text) => {
        try {
          await sendMessage({ fromId: me, fromName: session.profile?.displayName || "Ben", fromType: session.profile?.userType, toId: contactId, toName: contactName, text, convId: convIdFor(me, contactId), isGroup: false });
          toast("Teklif isteğin gönderildi");
          openChat();
        } catch (_) { toast("Gönderilemedi", "err"); }
      },
    });
  } }, icon("send", { size: 17, color: "#fff" }), h("span", { style: { color: "#fff" } }, "Teklif İste")));

  // ── üyeler ──
  const ROLE_TXT = { founder: "Kurucu", admin: "Yönetici" };
  const membersSect = h("div", { class: "ed-sect" }, pdTitle(`Üyeler (${memberCount})`),
    members.length ? h("div", { class: "sl-list" }, ...members.map((m) => {
      const ug = Array.isArray(m.user?.genres) ? m.user.genres[0] : m.user?.genre;
      return h("a", { class: "sl-card", href: memberHref(m.id), style: { textDecoration: "none" } },
        slAv(m.name, m.photoURL, 48),
        h("div", { class: "grow" }, h("div", { class: "sl-name" }, m.name),
          h("div", { class: "sl-sub" }, [ROLE_TXT[m.role], ug].filter(Boolean).join(" · ") || "Sanatçı")),
        icon("chevron-forward", { size: 14, color: "var(--text-muted)" }));
    })) : h("p", { class: "ed-desc dim" }, "Üye bilgisi yüklenemedi."));

  // ── yaklaşan etkinlikler (yayında, bitmemiş) ──
  const upcoming = (events || []).filter((e) => {
    const st = String(e.status || "").toLowerCase();
    return !UNPUBLISHED.has(st) && !/^cancel/.test(st) && e.isDraft !== true && e.cancelled !== true && eventStartMs(e) != null && !isEventOver(e);
  }).sort((x, y) => eventStartMs(x) - eventStartMs(y)).slice(0, 6);
  const eventsSect = upcoming.length ? h("div", { class: "ed-sect" }, pdTitle("Yaklaşan Etkinlikler"),
    h("div", { class: "sl-list" }, ...upcoming.map((e) => {
      const inner = [
        h("div", { class: "sl-av", style: { width: "48px", height: "48px", borderRadius: "12px", background: "linear-gradient(135deg, #A855F7, #7C3AED)", fontSize: "13px", flexDirection: "column", lineHeight: "1.1" }, "aria-hidden": "true" },
          h("span", {}, String(new Date(eventStartMs(e)).getDate())), h("span", { style: { fontSize: "10px", fontWeight: "700" } }, MONTHS[new Date(eventStartMs(e)).getMonth()].toLocaleUpperCase("tr-TR"))),
        h("div", { class: "grow" }, h("div", { class: "sl-name" }, e.title || "Etkinlik"),
          h("div", { class: "sl-sub" }, [e.venueName, evWhen(e)].filter(Boolean).join(" · "))),
      ];
      return isArtistView
        ? h("div", { class: "sl-card", style: { cursor: "default" } }, ...inner)
        : h("a", { class: "sl-card", href: "#/etkinlik/" + encodeURIComponent(e.id), style: { textDecoration: "none" } }, ...inner, icon("chevron-forward", { size: 14, color: "var(--text-muted)" }));
    }))) : null;

  const createdMs = (() => { const v = g.createdAt; try { return typeof v?.toMillis === "function" ? v.toMillis() : v ? new Date(v).getTime() : null; } catch { return null; } })();
  const founded = createdMs && !isNaN(createdMs) ? `Kuruluş · ${MONTHS[new Date(createdMs).getMonth()]} ${new Date(createdMs).getFullYear()}` : null;
  const frev = featuredReview(revs);

  root.append(
    h("div", { class: "pd-hero pd-artist" + (g.bannerUrl ? " has-banner" : ""), style: g.accentColor ? { "--accent": g.accentColor } : null },
      g.bannerUrl ? h("div", { class: "pd-banner", style: { backgroundImage: `url(${g.bannerUrl})` } }) : null,
      h("button", { class: "ed-iconbtn dark", "aria-label": "Geri", onclick: () => history.length > 1 ? history.back() : go(isArtistView ? "#/artist/kesfet" : "#/kesfet") }, icon("chevron-back", { size: 22, color: "var(--text-secondary)" })),
      h("div", { class: "pd-center" },
        g.photoURL ? h("div", { class: "pd-av round zoomable", style: { backgroundImage: `url(${g.photoURL})` }, title: "Büyüt", onclick: () => lightbox(g.photoURL) }) : h("div", { class: "pd-av round" }, name.charAt(0).toLocaleUpperCase("tr-TR")),
        h("h1", { class: "pd-name" }, name),
        h("span", { class: "pd-member" }, icon("people", { size: 12, color: "#C4B5FD" }), h("span", { style: { color: "#C4B5FD" } }, `GRUP · ${memberCount} üye`)),
        (() => { const tb = trustedBadge(avg, rated.length); const pb = priceBadge(g); return (tb || pb) ? h("div", { class: "badge-row", style: { justifyContent: "center" } }, tb, pb) : null; })(),
        genres[0] ? h("span", { class: "pd-genrepill" }, genres[0]) : null,
        profileTagline(g),
        founded ? h("div", { class: "pd-membertext" }, founded) : null,
        profileResidency(g),
        availabilityBadge(g),
        h("div", { class: "pd-stats" },
          pdStat(avg, "Puan", true), pdDivider(),
          follStat, pdDivider(),
          pdStat(revs.length, "Yorum"), pdDivider(),
          pdStat(memberCount, "Üye")))),
    acts.length ? h("div", { class: "pd-acts" }, ...acts) : null,
    featuredSet(g.featuredSetUrl),
    frev ? h("div", { class: "ed-sect" }, pdTitle("Öne Çıkan Yorum"), frev) : null,
    h("div", { class: "ed-sect" }, pdTitle("Hakkında"),
      h("p", { class: "ed-desc" + (g.bio ? "" : " dim") }, g.bio || "Grup henüz tanıtım eklememiş."),
      g.experienceYears ? h("div", { class: "pd-exp" }, icon("time-outline", { size: 14, color: "var(--text-secondary)" }), h("span", {}, g.experienceYears + " yıl deneyim")) : null),
    membersSect,
    eventsSect,
    rateCardBlock(g.packages),
    addOnsBlock(g),
    termsBlock(g),
    suitabilityBlock(g),
    serviceAreaBlock(g),
    techRiderBlock(g),
    languagesBlock(g),
    venueChips(revs),
    videoReel(g.videoUrls),
    genres.length ? h("div", { class: "ed-sect" }, pdTitle("Müzik Tarzları"),
      h("div", { class: "pd-tags" }, ...genres.map((x) => h("span", { class: "pd-tag" }, x)))) : null,
    socialBlock(g.social),
    h("div", { class: "ed-sect" },
      h("div", { class: "rv-head" }, pdTitle("Yorumlar"),
        canReview ? h("button", { class: "rv-add", onclick: () => { if (loginGate("Yorum yapmak")) return; groupReviewModal(g, refresh); } }, "+ Yorum Yap") : null),
      custRevs.length ? h("div", {}, ...custRevs.map((r) => rvCard(r.authorName, r.rating, r.comment, r.createdAt))) : rvEmpty("Henüz yorum yok.")),
  );
}
