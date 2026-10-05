// GELİŞTİRİCİ KATALOĞU — #/dk-demo (yalnız yerel emülatör oturumu; registry.DEV_DEMO). Tüm kabuklar + ortak bileşenler örnek veriyle.
// Yazma YOK, Firestore okuması YOK (sahte oturum nesneleri; canlı dinleyiciler uid olmadığı için açılmaz).
//   #/dk-demo                       → bileşen kataloğu (PublicHeader girişli varyantıyla)
//   #/dk-demo?shell=public[&v=guest|customer|panel][&active=kesfet]  → PublicHeader + boş gövde + PublicFooter (WebKesfet ile kıyas)
//   #/dk-demo?shell=account         → AccountLayout + PageHead (WebProfil ile kıyas)
//   #/dk-demo?shell=auth[&v=admin|default|business]  → AuthSplit (WebAdminGiris ile kıyas)
//   #/dk-demo?shell=panel&role=artist|venue|organizer|admin[&open=notif]  → PanelShell (WebSanatciPanel/WebMekanPanel/WebOrgPanel/WebAdmin)
//   &open=modal|modal-panel|modal-form|confirm|drawer|toast|toast-undo|city → üst katmanı açık çiz (ekran görüntüsü için)
import { h } from "../../ui.js";
import {
  dkButton, dkIconButton, dkLabel, dkInput, dkTextarea, dkSelect, dkField, dkPasswordInput, dkSearchInput, dkCheckbox, dkRadioGroup, dkSwitch,
  dkSegmented, dkUnderlineTabs, dkChip, dkGenreChip, dkGenreTag, dkFilterChip, dkStatusBadge, ST, dkPrice, dkPricePill, dkSectionHead, dkPageHead,
  dkPageHero, dkAccentTitle, dkMonoLabel, dkBreadcrumb, dkAvatar, dkStars, dkKpi, dkTable, dkEmpty, dkInlineMessage, dkOrDivider, dkSkeleton, dkSkeletonCard,
  dkCarouselDots, dkCarouselArrows, dkTrack, dkFollowButton, dkModal, dkConfirm, dkDrawer, dkToast, cityPicker, dkLogo,
} from "../shared/ui.js";
import { eventCardOverlay, eventCardTop10, eventCardWide, eventCard, eventRowMini, artistCard, artistRow, venueCard, dateTile } from "../shared/cards.js";
import { publicShell, publicHeader, publicFooter, accountFooter } from "../shared/public-shell.js";
import { accountShell } from "../shared/account-shell.js";
import { authSplit, authTopLink, authTag, authHeading, authIconBadge, authGoogleButton, authNote } from "../shared/auth-shell.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon, ICONS } from "../shared/icons.js";
import { IMG } from "../shared/assets.js";

// ── örnek veri ──
const DAY = 86400e3;
const at = (days, hh = 21, mm = 0) => { const d = new Date(Date.now() + days * DAY); d.setHours(hh, mm, 0, 0); const ms = d.getTime(); return { toMillis: () => ms }; }; // Firestore Timestamp benzeri
export const SAMPLE_EVENTS = [
  { id: "demo1", title: "Jazz Gecesi", artistName: "Elif Yıldız Quartet", venueName: "Babylon Club", city: "İstanbul", bannerUrl: IMG.jazzClub.src, genre: ["Jazz"], ticketPrice: 350, attendeeCount: 128, capacity: 300, eventAt: at(0, 21), vipStatus: "approved" },
  { id: "demo2", title: "Electronic Night", artistName: "DJ Berkay", venueName: "Zorlu PSM", city: "İstanbul", bannerUrl: IMG.electronicNight.src, genre: ["Techno"], ticketPrice: 0, attendeeCount: 412, eventAt: at(1, 23, 30) },
  { id: "demo3", title: "Deep House Set", artistName: "Kolsch", venueName: "Kuşadası Beach", city: "Aydın", bannerUrl: IMG.deepHouseBeach.src, genre: ["Deep House"], ticketPrice: 250, attendeeCount: 236, eventAt: at(3, 22), isExclusive: true },
  { id: "demo4", title: "Rock Partisi", artistName: "Gece Yolcuları", venueName: "Nardis Jazz", city: "Ankara", bannerUrl: null, genre: ["Türkçe Rock"], ticketPrice: 180, attendeeCount: 40, eventAt: at(5, 20, 30), isNew: true },
  { id: "demo5", title: "Akustik Akşam", artistName: "Deniz Arslan", venueName: "Salon İKSV", city: "İzmir", bannerUrl: null, genre: ["Akustik"], ticketPrice: 0, attendeeCount: 18, capacity: 18, eventAt: at(6, 20) },
];
const SAMPLE_ARTISTS = [
  { id: "a1", displayName: "DJ Berkay", photoURL: IMG.djBooth.src, genres: ["Techno"], followerCount: 12400 },
  { id: "a2", displayName: "Elif Yıldız", photoURL: IMG.vocalist.src, genres: ["Jazz"], followerCount: 3100 },
  { id: "a3", displayName: "Deniz Arslan", photoURL: IMG.guitarist.src, genres: ["Akustik"], followerCount: 860 },
  { id: "a4", displayName: "Kerem Aydın", photoURL: IMG.pianist.src, genres: ["Klasik"], followerCount: 1500 },
  { id: "a5", displayName: "DJ Mira", photoURL: null, genres: ["House"], followerCount: 540 },
];
const SAMPLE_VENUES = [
  { id: "v1", displayName: "Babylon Club", photoURL: IMG.jazzClub.src, city: "İstanbul", avgRating: 4.8, capacity: 450, genres: ["Jazz", "Electronic"] },
  { id: "v2", displayName: "Nardis Jazz", photoURL: null, city: "İstanbul", avgRating: 4.6, capacity: 120, genres: ["Jazz"] },
];
// sahte oturumlar (uid yok → canlı dinleyici açılmaz)
const SESS = {
  guest: { user: null, guest: true, profile: null },
  customer: { user: { email: "elif@ornek.com" }, guest: false, profile: { userType: "customer", displayName: "Elif Yıldız", photoURL: IMG.vocalist.src } },
  artist: { user: { email: "djberkay@ornek.com" }, guest: false, profile: { userType: "artist", displayName: "DJ Berkay", photoURL: IMG.djBooth.src } },
  venue: { user: { email: "yetkili@babylon.com" }, guest: false, profile: { userType: "venue", displayName: "Babylon Club", photoURL: IMG.electronicNight.src } },
  organizer: { user: { email: "ekip@ornek.com" }, guest: false, profile: { userType: "organizer", orgName: "Gece Kolektif", displayName: "Gece Kolektif" } },
  admin: { user: { email: "yonetici@gigbridges.com" }, guest: false, isAdmin: true, profile: null },
};

// ── yerleşim yardımcıları ──
const sec = (id, title, source, ...kids) => h("section", { class: "dkd-sec", id }, h("div", { class: "dkd-sec-h" }, h("h2", {}, title), source ? h("span", {}, source) : null), ...kids);
const row = (...kids) => h("div", { class: "dkd-row" }, ...kids);
const col = (...kids) => h("div", { class: "dkd-col" }, ...kids);
const lab = (t) => h("span", { class: "dkd-lab" }, t);
const cell = (t, ...kids) => h("div", { class: "dkd-cell" }, lab(t), ...kids);

function catalog() {
  const q = h("div", { class: "dkd-toc" }, ...[
    ["#dkd-shells", "Kabuklar"], ["#dkd-btn", "Düğmeler"], ["#dkd-form", "Form"], ["#dkd-tabs", "Sekmeler"], ["#dkd-chips", "Çip / Rozet"],
    ["#dkd-heads", "Başlıklar"], ["#dkd-misc", "Avatar / Yıldız / KPI"], ["#dkd-table", "Tablo"], ["#dkd-empty", "Boş durum"], ["#dkd-car", "Karusel"],
    ["#dkd-cards", "Kartlar"], ["#dkd-overlays", "Üst katmanlar"], ["#dkd-icons", "İkonlar"],
  ].map(([href, t]) => h("a", { href: "javascript:void 0", class: "dk-link", onclick: () => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" }) }, t)));

  const shells = sec("dkd-shells", "Kabuklar", "tek başına kıyas için ?shell=…",
    row(...[
      ["public&v=guest&active=kesfet", "PublicHeader · misafir (WebKesfet)"], ["public&v=customer", "PublicHeader · dinleyici (WebProfil)"], ["public&v=panel", "PublicHeader · Panelime dön"],
      ["account", "AccountLayout (WebProfil)"], ["auth&v=admin", "AuthSplit · admin (WebAdminGiris)"], ["auth&v=default", "AuthSplit · varsayılan (WebKayit)"], ["auth&v=business", "AuthSplit · business (WebOnayBekleniyor)"],
      ["panel&role=artist", "PanelShell · sanatçı"], ["panel&role=venue", "PanelShell · mekan"], ["panel&role=organizer&open=notif", "PanelShell · organizatör"], ["panel&role=admin", "PanelShell · yönetici"],
    ].map(([qs, t]) => dkButton(t, { variant: "outline", size: 36, href: "#/dk-demo?shell=" + qs }))));

  let busyBtn;
  const btns = sec("dkd-btn", "Button / IconButton", "hesap §0.5 · org-admin F5 · auth §0.3",
    row(...["primary", "role", "light", "outline", "ghost", "danger", "danger-outline", "tint", "dashed", "violet", "success"].map((v) => cell(v, dkButton(v === "primary" ? "Kaydet" : v, { variant: v, icon: v === "primary" ? "check" : null })))),
    row(...[36, 40, 44, 48, 52].map((s) => cell("h" + s, dkButton("Etkinlik oluştur", { size: s, icon: "plus" })))),
    row(cell("disabled", dkButton("Kaydet", { disabled: true })), cell("busy", (busyBtn = dkButton("Giriş yap", { size: 48, busyLabel: "Doğrulanıyor…", onClick: () => { busyBtn.dk.setBusy(true); setTimeout(() => busyBtn.dk.setBusy(false), 1500); } }))), cell("full 48", h("div", { style: { width: "320px" } }, dkButton("Google ile giriş", { variant: "outline", size: 48, full: true })))),
    row(cell("surface 40", dkIconButton("bell", { label: "Bildirimler", dot: true })), cell("ghost 40", dkIconButton("x", { label: "Kapat", variant: "ghost" })), cell("outline 36", dkIconButton("edit", { label: "Düzenle", variant: "outline", size: 36 })), cell("overlay round 44", dkIconButton("heart", { label: "Favori", variant: "overlay", size: 44, round: true })), cell("pressed", dkIconButton("heart", { label: "Favori", pressed: true, iconOpts: { fill: true } }))));

  const f1 = dkField({ label: "Yönetici e-posta", input: { type: "email", placeholder: "yonetici@ornek.com" } });
  const f2 = dkField({ label: "Yeni ad", input: { value: "Elif", bg: "void" }, error: "Ad zaten aynı" });
  const form = sec("dkd-form", "Form", "auth §0.3 · hesap §0.5 · Etkinlikler FilterSidebar",
    row(col(f1.node, dkField({ label: "Şifre", input: dkPasswordInput({ id: "dkd-pw" }) }).node, f2.node),
      col(dkField({ label: "Açıklama", input: dkTextarea({ maxlength: 500, placeholder: "Birkaç cümle…", minWarn: 10 }) }).node,
        dkField({ label: "Tür", input: dkSelect({ options: ["Jazz", "Electronic", "Rock"], value: "Rock", placeholder: "Seç" }) }).node,
        dkField({ label: "Tarih (mekan h44 rail)", input: { type: "date", size: 44, bg: "rail" } }).node),
      col(lab("SearchInput · panel"), dkSearchInput({ placeholder: "Teklif, mekan veya sanatçı ara" }), lab("SearchInput · mekan (kbd /)"), dkSearchInput({ placeholder: "Etkinlik, sanatçı ara", radius: 8, kbd: "/", iconSw: "1.8" }), lab("compact"), dkSearchInput({ placeholder: "Şehir ara...", variant: "compact" }))),
    row(col(lab("CheckboxRow"), dkCheckbox({ label: "Jazz", dot: "#FF8A2A", count: 4, checked: true }), dkCheckbox({ label: "Electronic", dot: "#A78BFA", count: 7 }), dkCheckbox({ label: "Rock", dot: "#FF5A6E", count: 0 })),
      col(lab("RadioGroup"), dkRadioGroup({ label: "Tarih", value: "all", items: [{ value: "all", label: "Tüm tarihler" }, { value: "week", label: "Bu hafta" }, { value: "weekend", label: "Hafta sonu" }] })),
      col(lab("Switch cyan 48×26"), row(dkSwitch({ label: "Gizle", checked: true }), dkSwitch({ label: "Gizle" })), lab("Switch magenta 44×24"), row(dkSwitch({ variant: "magenta", checked: true, label: "Bildirim" }), dkSwitch({ variant: "magenta", label: "Bildirim" }))),
      col(lab("InlineMessage"), dkInlineMessage("err", "Bu hesap yönetici değil."), dkInlineMessage("ok", "Şifre sıfırlama bağlantısı gönderildi."), dkInlineMessage("info", "Doğrulama e-postası yeniden gönderildi."), dkOrDivider())));

  const tabs = sec("dkd-tabs", "Segmented / UnderlineTabs", "hesap SegmentedTabs · Keşfet kategori · AnchorTabs · WebAdmin",
    row(cell("Segmented h38 (Takip)", dkSegmented({ items: [{ key: "a", label: "Sanatçılar", count: 9 }, { key: "v", label: "Mekanlar", count: 3 }], value: "a", countColor: "#4ED8FF" })),
      cell("pill sayaç (Favoriler)", dkSegmented({ items: [{ key: "a", label: "Sanatçılar", count: 5 }, { key: "v", label: "Mekanlar", count: 4 }, { key: "e", label: "Etkinlikler", count: 3 }], value: "a", countStyle: "pill" })),
      cell("h34 radiogroup (Fiyat)", h("div", { style: { width: "240px" } }, dkSegmented({ items: [{ key: "all", label: "Tümü" }, { key: "free", label: "Ücretsiz" }, { key: "paid", label: "Ücretli" }], value: "all", size: 34, role: "radiogroup", stretch: true, label: "Fiyat" })))),
    cell("mono (Keşfet kategori, düz pembe)", h("div", { class: "dkd-bar" }, dkUnderlineTabs({ label: "Kategori", value: "all", items: [{ key: "all", label: "TÜMÜ", icon: "grid" }, { key: "ev", label: "ETKİNLİKLER", icon: "ticket" }, { key: "ven", label: "MEKANLAR", icon: "building" }, { key: "art", label: "SANATÇILAR", icon: "mic" }] }))),
    cell("anchor (prizma)", dkUnderlineTabs({ variant: "anchor", value: "h", items: [{ key: "h", label: "Hakkında" }, { key: "e", label: "Etkinlikler" }, { key: "r", label: "Yorumlar" }, { key: "m", label: "Medya" }] })),
    cell("sans (WebAdmin, rol rengi)", h("div", { class: "dkd-roleadmin" }, dkUnderlineTabs({ variant: "sans", value: "a", items: [{ key: "a", label: "Onaylar", count: 3 }, { key: "n", label: "Mekan Adı İstekleri", count: 1 }, { key: "s", label: "Sorun Bildirimleri", count: 4 }] }))));

  const chips = sec("dkd-chips", "Chip / GenreChip / GenreTag / StatusBadge / Fiyat", "public-a §0.6–0.7 · org-admin F5 ST",
    row(dkGenreChip(null, { pressed: true }), ...["Jazz", "Techno", "Rock", "Pop", "Akustik", "Hip-Hop", "R&B"].map((g) => dkGenreChip(g, { pressed: false, onClick: (e, el) => el.dk.set(el.getAttribute("aria-pressed") !== "true") }))),
    row(dkChip({ label: "Jazz", dot: "#FF8A2A", size: 36, pressed: true }), dkChip({ label: "Rock", dot: "#FF5A6E", size: 30, pressed: false }), dkFilterChip("Bu hafta", () => {}), dkFilterChip("Jazz", () => {})),
    row(...["Jazz", "Deep House", "Türkçe Rock", "Türkçe Pop", "Türkü", "Türkçe Rap", "Indie", "Klasik", "Arabesk"].map((g) => dkGenreTag(g))),
    row(dkGenreTag("Jazz", { variant: "table" }), dkGenreTag("Electronic", { variant: "hero" }), dkGenreTag("Electronic", { variant: "pill" }), dkGenreTag("Jazz", { variant: "neutral" })),
    row(...["full", "vipEvent", "exclusive", "busy", "popular", "new"].map((k) => dkStatusBadge(k, { variant: "card", kesfet: k === "full" })), dkStatusBadge("vipEvent", { variant: "hero" }), dkStatusBadge("exclusive", { variant: "wide" })),
    row(...["live", "up", "past", "pending", "accepted", "rejected", "cancelled", "resolved", "invited", "joined", "active"].map((k) => dkStatusBadge(k))),
    row(dkStatusBadge("offerPending", { variant: "box" }), dkStatusBadge("offerAccepted", { variant: "box" }), dkStatusBadge("offerRejected", { variant: "box" }), dkStatusBadge({ label: "AKTİF", color: "#7CE0B0" }, { variant: "plain" }),
      dkPrice(350), dkPrice(0, { upper: true }), dkPrice(0), dkPricePill(250), dkPricePill(0)));

  const heads = sec("dkd-heads", "SectionHead / PageHead / PageHero / Breadcrumb", "public-a §0.5 · hesap §0.3 · org-admin F5 · public-b",
    dkSectionHead({ eyebrow: "02 · ÖZEL ETKİNLİKLER, VIP DENEYİMLER", title: "Sadece ", em: "GigBridge'de", link: { href: "#/etkinlikler" } }),
    dkSectionHead({ eyebrow: "GIGBRIDGE TOP 10", eyebrowColor: "#FFD700", eyebrowIcon: "trophy", title: "GigBridge ", em: "Top 10", emColor: "#FFD700", right: dkCarouselArrows({ variant: "outline" }) }),
    dkSectionHead({ eyebrow: "BU HAFTA", title: "Bu hafta ", em: "sahnede.", size: 52, gap: 12, link: { variant: "sans", href: "#/etkinlikler" } }),
    dkPageHead({ title: "Profil", em: "im", lead: "Kişisel bilgilerin, şehrin ve GigBridge'deki hareketlerin tek yerde.", rise: false }),
    h("div", { class: "dkd-roleorg" }, dkPageHero({ eyebrow: "GECE KOLEKTİF · ORGANİZATÖR", title: "Bu hafta ", em: "sahnede", tail: " neler var?", lead: "Mekan isteklerini takip et, ekibini yönet.", actions: [dkButton("Mekan seç", { variant: "outline", icon: "building" }), dkButton("Etkinlik oluştur", { variant: "role", icon: "plus" })] })),
    row(dkAccentTitle("Gelen teklifler"), dkMonoLabel("PROFİL TAMAMLAMA")),
    dkBreadcrumb({ items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Etkinlikler", href: "#/etkinlikler" }, { label: "Jazz Gecesi" }] }),
    h("div", { class: "dkd-cover" }, dkBreadcrumb({ variant: "mono-overlay", back: "#/kesfet", items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Sanatçılar" }, { label: "DJ Berkay" }] })),
    dkBreadcrumb({ variant: "mono", back: "#/kesfet", items: [{ label: "Keşfet", href: "#/kesfet" }, { label: "Mekanlar" }, { label: "Babylon Club" }] }));

  const misc = sec("dkd-misc", "Avatar / Stars / KPI", "sanatci §0.3 · org-admin F5 · public-b",
    row(dkAvatar({ name: "Elif Yıldız", photo: IMG.vocalist.src, size: 56, border: true }), ...["customer", "artist", "venue", "organizer", "admin"].map((t) => dkAvatar({ name: "Gece Kolektif", type: t, size: 44 })),
      dkAvatar({ name: "Jazz", genre: "Jazz", size: 52 }), dkAvatar({ name: "Babylon", type: "venue", size: 38, shape: "rounded", radius: 8 }), dkAvatar({ size: 36, type: "organizer", icon: "building", iconSize: 17 }), dkAvatar({ size: 36, type: "admin", icon: "shieldCheck", iconSize: 17 })),
    row(dkStars(4), dkStars(3, { size: 20 }), dkStars(5, { variant: "text", size: 13 }), dkStars(2, { variant: "text", size: 13 })),
    h("div", { class: "dkd-grid4" },
      dkKpi({ label: "BEKLEYEN ONAY", value: "3", sub: "Mekan ve organizatör başvurusu", icon: "shieldCheck", color: "#A78BFA" }),
      dkKpi({ label: "MEKAN ADI İSTEĞİ", value: "1", sub: "Ad değişikliği talebi", icon: "edit", color: "#FF8A2A", onClick: () => {} }),
      dkKpi({ label: "KATILIMCI", value: "128", icon: "users", color: "#4ED8FF", variant: "card" }),
      dkKpi({ label: "DURUM", value: "Satışta", variant: "card", valueColor: "#7CE0B0", valueIcon: "trendingUp" })));

  const table = sec("dkd-table", "DataTable", "WebAdmin §4",
    h("div", { class: "dkd-tablecard dkd-roleadmin" }, dkTable({
      label: "Onaylar", selected: "r1", onRowClick: (r, el) => el.closest(".dk-tbl")?.dk?.select(r.id),
      columns: [
        { key: "t", label: "BAŞVURAN", width: "minmax(0,1.5fr)", render: (r) => h("span", { class: "dkd-tt" }, dkAvatar({ name: r.t, type: r.k, size: 38, shape: "rounded", radius: 8 }), h("span", { class: "dkd-ttc" }, h("b", {}, r.t), h("span", {}, r.s))) },
        { key: "c", label: "TÜR · İLETİŞİM", width: "minmax(0,1.2fr)" },
        { key: "st", label: "DURUM", width: "140px", render: (r) => dkStatusBadge(r.st, { label: r.st === "pending" ? "Bekliyor" : undefined }) },
        { key: "a", label: "İŞLEM", width: "200px", align: "right", render: () => dkButton("Onayla", { variant: "outline", size: 36, icon: "check" }) },
      ],
      rows: [{ id: "r1", t: "Soho House", s: "İstanbul", k: "venue", c: "yetkili@soho.com", st: "pending" }, { id: "r2", t: "Gece Kolektif", s: "ekip@ornek.com", k: "organizer", c: "ekip@ornek.com", st: "accepted" }],
    })));

  const empty = sec("dkd-empty", "EmptyState / Skeleton", "hesap §0.5 · Keşfet · org-admin F5",
    row(h("div", { style: { flex: "1" } }, dkEmpty({ icon: "ticket", title: "Henüz etkinlik yok", sub: "Yakında canlı müzik etkinlikleri burada görünecek.", action: dkButton("Filtreleri temizle", { variant: "outline", size: 40 }) })),
      h("div", { style: { flex: "1" } }, dkEmpty({ icon: "heart", ring: true, title: "Favorin yok", sub: "Beğendiğin sanatçı ve mekanları kalple kaydet.", action: dkButton("Keşfet'e git", { variant: "light", size: 40 }) }))),
    dkEmpty({ variant: "dashed", compact: true, icon: "star", iconSize: 18, sub: "Şu an özel etkinlik yok — VIP deneyimler yakında burada." }),
    h("div", { class: "dkd-tablecard" }, dkEmpty({ variant: "plain", icon: "calendar", title: "Etkinlik yok", sub: "Bu filtrede gösterilecek etkinlik bulunamadı." })),
    h("div", { class: "dkd-grid4" }, dkSkeletonCard("date"), dkSkeletonCard("overlay"), col(dkSkeletonCard("row"), dkSkeletonCard("row")), col(dkSkeleton({ h: 32, w: 120 }), dkSkeleton({ h: 14 }), dkSkeleton({ h: 14, w: "60%" }))));

  const dots = dkCarouselDots({ count: 5, index: 1, onPick: (i) => dots.dk.set(i), titles: SAMPLE_EVENTS.map((e) => e.title) });
  const track = dkTrack({ step: 320, gap: 20 });
  SAMPLE_EVENTS.forEach((e, i) => track.dk.inner.append(eventCardTop10(e, i + 1)));
  let off = 0;
  const arrows = dkCarouselArrows({ variant: "outline", onPrev: () => { off = Math.max(0, off - 2); track.dk.set(off); arrows.dk.setDisabled(off === 0, off >= 3); }, onNext: () => { off = Math.min(3, off + 2); track.dk.set(off); arrows.dk.setDisabled(off === 0, off >= 3); } });
  arrows.dk.setDisabled(true, false);
  const car = sec("dkd-car", "Carousel ilkelleri + Top 10 izi", "WebKesfet HeroCarousel / Top 10",
    h("div", { class: "dkd-herodots" }, dots, dkCarouselArrows({ variant: "overlay" })), row(arrows), track);

  const cards = sec("dkd-cards", "Kartlar (shared/cards.js — tek kaynak)", "WebKesfet · WebEtkinlikler · WebAkis",
    lab("eventCardOverlay (h340)"), h("div", { class: "dkd-grid4" }, ...SAMPLE_EVENTS.slice(0, 4).map((e) => eventCardOverlay(e))),
    lab("eventCardWide (h300)"), h("div", { class: "dkd-grid2" }, eventCardWide(SAMPLE_EVENTS[2]), eventCardWide(SAMPLE_EVENTS[0])),
    lab("eventCard tarih karolu (184) · Landing 200 + cta · Sanatçı 168 + kicker when + RESIDENT"), h("div", { class: "dkd-grid3" }, eventCard(SAMPLE_EVENTS[0], { city: true }), eventCard(SAMPLE_EVENTS[4], { city: true }), eventCard(SAMPLE_EVENTS[1], { media: 168, kicker: "when", titleSize: 18, corner: { label: "RESIDENT", color: "#FF4FA3" } })),
    row(col(lab("eventRowMini (Akış BU HAFTA)"), h("div", { class: "dkd-rail" }, ...SAMPLE_EVENTS.slice(0, 4).map((e) => eventRowMini(e)))), col(lab("dateTile"), row(dateTile(SAMPLE_EVENTS[0].eventAt.toMillis()), dateTile(SAMPLE_EVENTS[3].eventAt.toMillis(), { variant: "small" })), lab("FollowButton"), row(dkFollowButton({ variant: "row" }), dkFollowButton({ variant: "row", followed: true }), dkFollowButton({ variant: "rail", name: "Kolsch" }), dkFollowButton({ variant: "rail", followed: true })))),
    lab("artistCard (Popüler Sanatçılar, 5 kolon)"), h("div", { class: "dkd-grid5" }, ...SAMPLE_ARTISTS.map((a, i) => artistCard(a, { followed: i === 1 }))),
    lab("artistRow (SANATÇILAR sekmesi)"), h("div", { class: "dkd-grid2" }, artistRow(SAMPLE_ARTISTS[0]), artistRow(SAMPLE_ARTISTS[4], { followed: true })),
    lab("venueCard (MEKANLAR)"), h("div", { class: "dkd-grid3" }, ...SAMPLE_VENUES.map((v) => venueCard(v)), venueCard({ ...SAMPLE_VENUES[0], id: "v3", displayName: "Salon İKSV", photoURL: null, avgRating: null })));

  const cp = cityPicker({ counts: { "İstanbul": 12, "Ankara": 4, "İzmir": 3 } });
  const overlays = sec("dkd-overlays", "Üst katmanlar", "dkModal · dkConfirm · dkDrawer · dkToast · dkPopover/CityPicker · dkLoginGate",
    row(dkButton("Modal (account)", { variant: "outline", size: 40, onClick: () => openDemo("modal") }),
      dkButton("Modal (panel)", { variant: "outline", size: 40, onClick: () => openDemo("modal-panel") }),
      dkButton("Modal (form)", { variant: "outline", size: 40, onClick: () => openDemo("modal-form") }),
      dkButton("Confirm", { variant: "outline", size: 40, onClick: () => openDemo("confirm") }),
      dkButton("Drawer", { variant: "outline", size: 40, onClick: () => openDemo("drawer") }),
      dkButton("Toast ok", { variant: "outline", size: 40, onClick: () => dkToast("Adın güncellendi") }),
      dkButton("Toast err", { variant: "outline", size: 40, onClick: () => dkToast("Adını 30 gün sonra tekrar değiştirebilirsin", { type: "err" }) }),
      dkButton("Toast Geri al", { variant: "outline", size: 40, onClick: () => openDemo("toast-undo") })),
    row(cell("CityPicker (popover içeriği)", h("div", { style: { width: "320px" } }, cp.node)), cell("Logo", dkLogo({ href: null }), dkLogo({ href: null, size: 30 }))));

  const icons = sec("dkd-icons", "İkon kaydı (shared/icons.js)", Object.keys(ICONS).length + " ikon",
    h("div", { class: "dkd-icons" }, ...Object.keys(ICONS).map((k) => h("span", { class: "dkd-ic", title: k }, svgIcon(k, { size: 20 }), h("span", {}, k)))));

  return h("div", { class: "dkd-wrap" },
    h("div", { class: "dkd-intro" }, h("span", { class: "dk-eyebrow" }, "FOUNDATION ADIM 2 · GELİŞTİRİCİ KATALOĞU"), h("h1", { class: "dk-display dk-t56" }, "Masaüstü ", h("em", {}, "bileşenleri")),
      h("p", {}, "Tüm kabuklar ve ortak bileşenler örnek veriyle. API: specs/foundation.md §9. Yalnız yerel emülatör oturumunda kayıtlı."), q),
    shells, btns, form, tabs, chips, heads, misc, table, empty, car, cards, overlays, icons);
}

// Üst katmanları açık çiz (ekran görüntüsü / elle kontrol)
function openDemo(kind) {
  if (kind === "modal") {
    const inp = dkField({ label: "Yeni ad", input: { value: "Elif Yıldız", bg: "void", maxlength: 40 } });
    inp.setHint("Bu ad yorumlarında ve katılımlarında görünür.");
    return dkModal({ title: "Adımı Değiştir", body: [h("p", { class: "dk-mdl-p" }, "Adını 30 günde bir değiştirebilirsin."), inp.node],
      actions: [{ label: "Vazgeç", variant: "outline" }, { label: "Kaydet", icon: "check", onClick: () => { dkToast("Adın güncellendi"); } }] });
  }
  if (kind === "modal-panel") return dkModal({ variant: "panel", title: "Puan & Yorum", serifTitle: true, sub: "DJ Berkay · Electronic Night", size: 480,
    body: [dkSegmented({ items: [{ key: "a", label: "Sanatçı" }, { key: "v", label: "Mekan" }], value: "a", size: 36, stretch: true, role: "radiogroup" }), dkTextarea({ maxlength: 500, minWarn: 10, placeholder: "Deneyimini anlat…" })],
    actions: [{ label: "İptal", variant: "outline" }, { label: "Gönder", keepOpen: true, onClick: (close, b) => { close(); } }] });
  if (kind === "modal-form") {
    let m;
    m = dkModal({ variant: "form", title: "Personel Davet Et", titleIcon: "userPlus", size: 480, sub: "Davet edilen kişi uygulamaya organizatör olarak kaydolduğunda daveti görecek.",
      body: dkField({ label: "E-posta", input: { type: "email", placeholder: "ornek@eposta.com" } }).node,
      actions: [{ label: "Vazgeç", variant: "outline" }, { label: "Davet gönder", variant: "role", icon: "send", keepOpen: true, onClick: () => m.setError("Geçerli bir e-posta gir.") }] });
    return m;
  }
  if (kind === "confirm") return dkConfirm({ variant: "confirm", title: "Etkinliği sil", body: "“Rock Partisi” kalıcı olarak silinecek. Bu işlem geri alınamaz.", confirmLabel: "Sil", danger: true, size: 440 });
  if (kind === "drawer") return dkDrawer({ eyebrow: "YENİ ETKİNLİK", title: "Etkinlik oluştur",
    body: [dkField({ label: "Etkinlik adı", input: { placeholder: "Örn. Jazz Gecesi" } }).node, dkField({ label: "Açıklama", input: dkTextarea({ maxlength: 500 }) }).node],
    footer: [h("span", { style: { flexGrow: "1" } }), dkButton("Vazgeç", { variant: "outline" }), dkButton("Kaydet", { variant: "role", icon: "check" })] });
  if (kind === "toast") return dkToast("Adın güncellendi", { duration: 60000 });
  if (kind === "toast-undo") return dkToast("Kolsch takipten çıkarıldı", { action: { label: "GERİ AL", onClick: () => dkToast("Geri alındı", { type: "info" }) } });
}

// ── tek kabuk sahneleri ──
const filler = (label, hgt = 520) => h("div", { class: "dkd-fill", style: { height: hgt + "px" } }, h("span", {}, label));

function publicScene(q) {
  const v = q.get("v") || "guest";
  const shell = publicShell({ session: SESS[v === "panel" ? "artist" : v] || SESS.guest, variant: v === "panel" ? "panel" : v, active: q.get("active") || null, footer: q.get("footer") || "full", activeIcon: q.get("icon") || null, seo: q.get("seo") !== "0" });
  shell.header.setCity("İstanbul");
  if (v === "customer") shell.header.setUnread({ notifs: 3, messages: q.get("icon") === "mesajlar" ? 2 : 0 });
  shell.main.append(filler("İçerik alanı (publicShell.main)", 640));
  return shell;
}
function accountScene(q) {
  const shell = accountShell({ session: SESS.customer, active: q.get("active") || "profil", contentGap: 24, seo: q.get("seo") !== "0" });
  shell.header.setCity("İstanbul");
  shell.header.setUnread({ notifs: 3 });
  [["tickets", 3], ["following", 9], ["favorites", 12], ["attended", 6], ["reviews", 4], ["unreadNotifs", 3], ["unreadMessages", 0]].forEach(([k, n]) => shell.setCount(k, n));
  shell.content.append(dkPageHead({ title: "Profil", em: "im", lead: "Kişisel bilgilerin, şehrin ve GigBridge'deki hareketlerin tek yerde." }), filler("İçerik kolonu (accountShell.content)", 1200));
  return shell;
}
function authScene(q) {
  const v = q.get("v") || "admin";
  if (v === "admin") {
    return authSplit({
      variant: "admin",
      top: { left: authTopLink("Geri", { href: "#/kesfet" }), right: authTag("YÖNETİCİ", { color: "#A78BFA", lock: true }) },
      width: 400, gap: 22,
      children: [
        authIconBadge({ scan: true }),
        authHeading({ title: "Yönetici ", em: "girişi", emColor: "#A78BFA", lead: "Onay ve yönetim paneli." }),
        h("form", { "aria-label": "Yönetici giriş formu", style: { gap: "16px" }, onsubmit: (e) => e.preventDefault() },
          dkField({ label: "Yönetici e-posta", id: "ag-email", input: { type: "email", placeholder: "yonetici@ornek.com", autocomplete: "email" } }).node,
          dkField({ label: "Şifre", id: "ag-pass", input: dkPasswordInput({ id: "ag-pass", autocomplete: "current-password" }) }).node,
          h("div", { role: "status", "aria-live": "polite", style: { display: "flex", flexDirection: "column" } }),
          dkButton("Giriş yap", { variant: "violet", size: 48, full: true, icon: "shieldCheck2", iconSize: 17 }),
          dkOrDivider(),
          authGoogleButton("Google ile giriş")),
        authNote(["Bu alan yalnızca GigBridge yöneticileri içindir. Mekan, organizatör veya sanatçıysan ", h("a", { href: "#/login" }, "normal girişi"), " kullan."]),
      ],
    });
  }
  return authSplit({
    variant: v,
    top: v === "business"
      ? { left: authTag("MEKAN", { color: "#FF8A2A" }), right: authTopLink("Çıkış yap", { icon: "logout", href: "#/kesfet" }) }
      : { left: authTopLink("Keşfet'e dön"), right: h("span", { class: "dkd-auth-r" }, "Zaten üye misin? ", h("a", { href: "#/login", style: { fontWeight: "600" } }, "Giriş yap")) },
    width: v === "business" ? 440 : 400,
    children: [authHeading({ eyebrow: "ADIM 1 / 2", title: "Hesap ", em: "oluştur", lead: "GigBridge'e nasıl katılmak istiyorsun?" }), filler("AuthColumn içeriği", 380)],
  });
}
function panelScene(q) {
  const role = q.get("role") || "artist";
  const cfg = {
    artist: { title: "Ana Sayfa", subtitle: "Sanatçı Paneli · DJ Berkay", active: "home" },
    venue: { title: "Ana Sayfa", crumb: "Mekan Paneli", active: "home" },
    organizer: { title: "Ana Sayfa", crumb: "ORGANİZATÖR / ANA SAYFA", active: "home" },
    admin: { title: "Yönetici Paneli", crumb: "YÖNETİCİ / ONAYLAR", active: "onaylar" },
  }[role] || {};
  const shell = panelShell({
    role, ...cfg, ctx: { session: SESS[role] }, notifications: "custom",
    // demo: kendi onSubmit'i → arama her zaman görünür (varsayılan rota hedefi NOT_READY iken kabuk aramayı gizler)
    search: { onSubmit: (q) => dkToast(q ? `Aranıyor: ${q}` : "Arama") },
    onPreview: role === "admin" ? () => dkToast("Keşfet önizleme (legacy modal)") : undefined,
    headerActions: role === "admin" ? [dkButton("Keşfet önizleme", { variant: "outline", size: 40, icon: "compassAdmin", iconOpts: { color: "#A78BFA" }, cls: "dkd-prevbtn" })] : [],
  });
  if (role === "artist") shell.setBadge("home", 3);
  if (role === "organizer") shell.setBadge("etkinlik", 2);
  if (role === "admin") { shell.setBadge("onaylar", 3); shell.setBadge("ad", 1); shell.setBadge("sorun", 4); }
  shell.setNotifications(role === "admin"
    ? [{ title: "Yeni mekan başvurusu", body: "Soho House onay bekliyor.", icon: "building", color: "#FF8A2A", time: "2 DK ÖNCE" }, { title: "Mekan adı isteği", body: "Babylon Club ad değişikliği istedi.", icon: "edit", color: "#FF8A2A", time: "1 SA ÖNCE" }, { title: "Sorun bildirimi", body: "DJ Berkay yeni bir bildirim gönderdi.", icon: "flag", color: "#FF5A6E", time: "DÜN", read: true }]
    : [{ title: "Düzenleme İzni İstendi", body: "Ayşe, “Rock Partisi” etkinliğini düzenlemek istiyor.", icon: "key", color: "#FF4FA3", time: "5 DK ÖNCE" }, { title: "Mekan isteği onaylandı", body: "Zorlu PSM, “Electronic Night” isteğini onayladı.", icon: "check", color: "#7CE0B0", time: "2 SA ÖNCE" }, { title: "İstek reddedildi", body: "Nardis Jazz, “Akustik Akşam” isteğini reddetti.", icon: "trash", color: "#FF5A6E", time: "DÜN", read: true }]);
  shell.content.append(filler("İçerik alanı (panelShell.content)", 1100));
  return shell;
}

export function dkDemoView(ctx) {
  let current = null;
  const build = (q) => {
    try { current?.destroy?.(); } catch (_) {}
    const shell = q.get("shell");
    if (shell === "public") current = publicScene(q);
    else if (shell === "account") current = accountScene(q);
    else if (shell === "auth") current = authScene(q);
    else if (shell === "panel") current = panelScene(q);
    else {
      current = publicShell({ session: SESS.customer, variant: "customer", active: null, footer: "full" });
      current.header.setCity("İstanbul");
      current.header.setUnread({ notifs: 3, messages: 1 });
      current.main.append(catalog());
    }
    const open = q.get("open");
    if (open) setTimeout(() => {
      const n = current.node;
      if (open === "notif") n.querySelector(".dk-ps-bell")?.click();
      else if (open === "city") n.querySelector(".dk-citybtn")?.click();
      else openDemo(open);
    }, 350);
    return current.node; // kabuğun .dk kökü doğrudan mount edilir (overlay portalı #app > .dk'dan rol/alan okur)
  };
  let mounted = build(ctx.query);
  return {
    node: mounted,
    update(q) { const n = build(q); mounted.replaceWith(n); mounted = n; window.scrollTo(0, 0); },
    destroy() { try { current?.destroy?.(); } catch (_) {} },
  };
}
