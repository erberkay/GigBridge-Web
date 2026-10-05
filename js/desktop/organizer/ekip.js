// WebOrgEkip — masaüstü görünümü (≥769 px). Registry anahtarı: orgEkip (#/organizer/ekip[?davet=1]).
// Spec: specs/org-admin.md § WebOrgEkip (+ F1–F7). Artboard: design/WebOrgEkip.dc.html (sahibi notu YOK).
// CSS: css/dk-org-ekip.css — sayfa kökü .dk-org-ekip (kabuğun <main>'i); portal diyalogları .dk-org-ekip-inv / .dk-org-ekip-rm.
// ≤768: legacy organizer.js renderTeam aynen kalır (router bu modülü mobilde yüklemez).
//
// Legacy özellikleri (organizer.js renderTeam / memberCard / confirmRemoveMember / inviteRow / openInviteModal) — HEPSİ korundu:
//   · orgId = p.orgId || uid · isOwner = (orgRole || "owner") !== "staff" (sahip tam, personel salt-okunur)
//   · Üyeler: orgMembers(orgId) (joinedAt sırası), ad yedeği displayName → name → email → "Üye", "SEN" etiketi ((userId||id) === uid),
//     rol hapı Sahip/Personel, e-posta, GRADS[i%6] baş harf avatarı, yönet (kebab) yalnız isOwner && !isMe && role !== "owner"
//   · Üyeyi çıkar: onay ("Bu üyeyi ekipten çıkarmak istiyor musun?") → removeOrgMember(orgId, m.id) → "Üye ekipten çıkarıldı" / "Çıkarılamadı"
//   · Sayaçlar: Toplam üye / Sahip / Personel (+ tasarım: Bekleyen davet)
//   · Gönderilen davetler: orgInvites(uid) (KURAL: invitedByUid == uid; createdAt azalan), Bekliyor / Katıldı / Reddedildi + tarih
//   · Personel davet et (yalnız sahip; legacy FAB → hero düğmesi; legacy wantInvite bayrağı → ?davet=1): EMAIL_RE (kırpılmış + küçük harf),
//     createOrgInvite({ orgId, orgName: orgName||displayName, invitedEmail, invitedByUid: uid, invitedByName: displayName||orgName })
//     — data.js'in yinelenen davet sorgusu (invitedByUid + invitedEmail + status==pending; mevcut indeks) → "Bu e-postaya bekleyen davet
//     zaten var"; diğer hata "Davet gönderilemedi"; başarı "Davet gönderildi" + yenile. Bilgi metni ("Davet edilen kişi uygulamaya
//     organizatör olarak kaydolduğunda daveti görecek." — web'de QR yerine e-posta daveti) korunur.
//   · Boş üyeler: "Henüz üye yok" / "Personel davet ederek ekibini oluştur." · Legacy "Ana Sayfa" geri düğmesi → kenar çubuğu.
// Tasarım ekleri: KPI şeridi, tablo düzeni (e-posta + durum sütunları), Yetkiler kartı, kurallar bilgi kutusu, davet modalında rol kutusu,
//   üst bar araması bu sayfada üyeleri/davetleri yerinde süzer (spec F4 önerisi).
// Arka uç notları: personel sahibin davetlerini okuyamaz (kural) → personelde "02" bölümü açıklama satırı gösterir, BEKLEYEN DAVET "—".
//   Üye çıkarmak yalnız members dokümanını siler (users/{uid}.orgId/orgRole CF olmadan temizlenemez — mevcut açık, UI değişmez).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { orgMembers, orgInvites, createOrgInvite, removeOrgMember } from "../../data.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgRaw } from "../shared/icons.js";
import { cx, dkButton, dkInput, dkField, dkPageHero, dkKpi, dkStatusBadge, dkModal, dkToast, dkSkeleton, dkEmpty, dkLoginGate } from "../shared/ui.js";
import { rgba, matchText, initials, trUpper, toMs, writeQuery, MONTHS_TR_SHORT } from "../shared/helpers.js";

const NS = "dk-org-ekip";
const k = (s) => `${NS}-${s}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Satır avatar gradyanları (legacy organizer.js GRADS = artboard GR)
const GRADS = [["#A855F7", "#7C3AED"], ["#F59E0B", "#B45309"], ["#10B981", "#059669"], ["#3B82F6", "#1D4ED8"], ["#F43F5E", "#BE123C"], ["#06B6D4", "#0891B2"]];
const PINK = "#FF4FA3", CYAN = "#4ED8FF";

// Artboard SVG gövdeleri (WebOrgEkip inline <svg>'lerinden BİREBİR)
const P = {
  people: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"></path><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"></path>',
  shield: '<path d="M12 3 5 6v5.5c0 4.4 3 7.9 7 9.5 4-1.6 7-5.1 7-9.5V6z"></path><path d="m9 12 2 2 4-4"></path>',
  person: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3.5 6.5 8.5 7 8.5-7"></path>',
  userPlus: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M19 8v6M16 11h6"></path>',
  kebab: '<path d="M12 5h.01M12 12h.01M12 19h.01" stroke-width="3.2"></path>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
  x: '<path d="M6 6l12 12M18 6 6 18"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
  send: '<path d="M21 3 10 14"></path><path d="M21 3 14.5 21l-4.5-7-7-4.5z"></path>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path>',
};
const ico = (name, size, { color = "currentColor", sw = "2", cls } = {}) => svgRaw(P[name], { size, color, sw, cls });

// Yetkiler kartı metinleri (artboard, birebir)
const PERMS = {
  owner: [
    [1, "Tüm etkinlikleri düzenler ve kaydeder"],
    [1, "Etkinlik silme ve tarih değişikliği (iptal et, yeniden oluştur)"],
    [1, "Personel davet eder ve ekipten çıkarır"],
    [1, "Organizasyon adını değiştirir"],
    [1, "Personelin düzenleme iznini onaylar"],
  ],
  staff: [
    [1, "Etkinlikleri, mekan isteklerini ve mesajları görür"],
    [1, "Sahipten “Düzenleme İzni” isteyebilir; onaylanınca o etkinliği düzenler"],
    [0, "Etkinlik silemez, tarih değiştiremez"],
    [0, "Davet gönderemez, organizasyon adını değiştiremez"],
  ],
};
const INV_ST = { pending: "invited", accepted: "joined", rejected: "rejected" };

let _ids = 0;
const uidOf = (p) => `${NS}-${p}-${++_ids}`;
// "26 Eyl 2026" (spec §7: sayısal gün + kısa ay + yıl)
function fmtDMY(v) {
  const t = toMs(v); if (t == null) return "—";
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
const memberName = (m) => m.displayName || m.name || m.email || "Üye";

// Rol hapı (RolePill): h26 r13, border c@.45, bg c@.08, 12.5/600, ikon 12
function rolePill(owner, { iconColor } = {}) {
  const c = owner ? PINK : CYAN;
  return h("span", { class: k("role"), style: { color: c, borderColor: rgba(c, 0.45), background: rgba(c, 0.08) } },
    ico(owner ? "shield" : "people", 12, { color: iconColor || "currentColor" }), owner ? "Sahip" : "Personel");
}

export function orgEkipView(ctx) {
  const s = ctx.session || session;
  const p = s.profile || {};
  const uid = s.user?.uid || p.id;
  const orgId = p.orgId || uid;
  const isOwner = (p.orgRole || "owner") !== "staff";
  const orgName = p.orgName || p.displayName || "";
  let alive = true;
  let seq = 0;
  let inviteModal = null;
  const st = { loading: true, error: false, members: [], invites: [], q: "" };

  const shell = panelShell({
    role: "organizer", active: ctx.route?.nav || "ekip", title: "Ekip", crumb: "Ekip", ctx,
    // Spec F4: Ekip sayfasında üst bar araması üyeleri/davetleri yerinde süzer
    search: { placeholder: "Etkinlik, mekan veya üye ara", onInput: (q) => { st.q = q || ""; drawTables(); }, onSubmit: (q) => { st.q = q || ""; drawTables(); } },
  });
  const root = shell.content;
  root.classList.add(NS);

  // ══════════ HERO ══════════
  const inviteBtn = isOwner
    ? dkButton("Personel Davet Et", { variant: "primary", size: 44, icon: ico("userPlus", 17, { color: "#06070A", sw: "2.2" }), onClick: () => openInvite(true) })
    : null;
  const hero = dkPageHero({
    eyebrow: `EKİP · ${trUpper(orgName || "Organizasyonunuz")}`,
    title: "Ekibin, ", em: "yetkileriyle", tail: ".",
    lead: "Personeli e-posta ile davet et. Davet edilen kişi organizatör olarak kaydolduğunda daveti görür ve ekibe katılır.",
    actions: inviteBtn, cls: k("hero"),
  });

  // ══════════ KPI ══════════
  const kpi = {
    total: dkKpi({ label: "TOPLAM ÜYE", value: "—", sub: "Organizasyondaki herkes", icon: ico("people", 16), color: PINK }),
    owner: dkKpi({ label: "SAHİP", value: "—", sub: "Tam yetkili", icon: ico("shield", 16), color: PINK }),
    staff: dkKpi({ label: "PERSONEL", value: "—", sub: "Sınırlı yetkili", icon: ico("person", 16), color: CYAN }),
    pending: dkKpi({ label: "BEKLEYEN DAVET", value: "—", sub: "Kabul bekleniyor", icon: ico("mail", 16), color: "#FFD700" }),
  };
  const kpiRow = h("section", { class: k("kpis"), "aria-label": "Ekip özeti" }, kpi.total, kpi.owner, kpi.staff, kpi.pending);

  // ══════════ 01 ÜYELER ══════════
  const hMem = uidOf("hmem");
  const memBody = h("div", { role: "rowgroup", class: k("tbody") });
  const memTable = h("div", { role: "table", "aria-labelledby": hMem, class: cx(k("tbl"), k("mtbl")) },
    h("div", { role: "row", class: cx(k("thead"), k("mgrid")) },
      h("span", { role: "columnheader" }, "AD"), h("span", { role: "columnheader" }, "ROL / YETKİ"),
      h("span", { role: "columnheader", class: k("c-mail") }, "E-POSTA"), h("span", { role: "columnheader" }, "DURUM"),
      h("span", { role: "columnheader", class: k("c-act") }, h("span", { class: "dk-sr" }, "İşlem"))),
    memBody);
  const memExtra = h("div", { class: k("mextra") });   // boş / hata durumu (tablo dışı)
  const staffNote = !isOwner
    ? h("div", { class: k("note") }, ico("lock", 15), "Personel davet etme ve ekipten çıkarma yalnızca organizasyon sahibinde.")
    : null;
  const memCard = h("section", { class: k("card"), "aria-labelledby": hMem },
    h("div", { class: k("shead") }, h("span", { class: k("snum") }, "01"), h("h2", { id: hMem, tabindex: "-1" }, "Üyeler")),
    memTable, memExtra, staffNote);

  // ══════════ 02 GÖNDERİLEN DAVETLER ══════════
  const hInv = uidOf("hinv");
  const invBody = h("div", { role: "rowgroup", class: k("tbody") });
  const invTable = h("div", { role: "table", "aria-labelledby": hInv, class: cx(k("tbl"), k("itbl")) },
    h("div", { role: "row", class: cx(k("thead"), k("igrid")) },
      h("span", { role: "columnheader" }, "E-POSTA"), h("span", { role: "columnheader" }, "GÖNDERİLDİ"), h("span", { role: "columnheader" }, "DURUM")),
    invBody);
  const invExtra = h("div", { class: k("iextra") });
  const invCard = h("section", { class: k("card"), "aria-labelledby": hInv },
    h("div", { class: k("shead") }, h("span", { class: k("snum") }, "02"), h("h2", { id: hInv }, "Gönderilen Davetler")),
    invTable, invExtra);

  // ══════════ 03 YETKİLER + bilgi kutusu ══════════
  const hPerm = uidOf("hperm");
  const permList = (items) => h("ul", { class: k("plist") }, ...items.map(([ok, t]) => h("li", { class: ok ? "is-ok" : "is-no" },
    ok ? ico("check", 15, { color: "#7CE0B0", sw: "2.4" }) : ico("x", 15, { color: "#5E636D", sw: "2.2" }), h("span", {}, t))));
  const permCard = h("section", { class: k("perm") },
    h("div", { class: k("phead") }, h("span", { class: k("snum") }, "03"), h("h2", { id: hPerm }, "Yetkiler")),
    h("div", { class: cx(k("pblock"), k("pblock-owner")) }, rolePill(true, { iconColor: PINK }), permList(PERMS.owner)),
    h("div", { class: k("pblock") }, rolePill(false, { iconColor: CYAN }), permList(PERMS.staff)));
  const callout = h("section", { class: k("callout"), "aria-label": "Kurallar" },
    ico("info", 18, { color: CYAN }),
    h("span", {}, "Aynı e-postaya bekleyen bir davet varsa yeni davet gönderilmez. Başlangıç tarihi geçen etkinlikler kimse tarafından düzenlenemez."));
  const aside = h("aside", { class: k("aside"), "aria-labelledby": hPerm }, permCard, callout);

  root.append(hero, kpiRow,
    h("div", { class: k("cols") }, h("div", { class: k("left") }, memCard, invCard), aside));

  // ══════════ ÇİZİM ══════════
  function skelRows(n, kind) {
    return Array.from({ length: n }, () => h("div", { class: cx(k("row"), kind === "m" ? k("mgrid") : k("igrid"), k("skrow")), "aria-hidden": "true" },
      kind === "m"
        ? h("span", { class: k("who") }, dkSkeleton({ w: 36, h: 36, r: 18 }), dkSkeleton({ w: "60%", h: 14 }))
        : h("span", { class: k("imail") }, dkSkeleton({ w: 32, h: 32, r: 8 }), dkSkeleton({ w: "55%", h: 14 })),
      dkSkeleton({ w: kind === "m" ? 84 : 90, h: kind === "m" ? 24 : 12, r: 12 }),
      kind === "m" ? h("span", { class: k("c-mail") }, dkSkeleton({ w: "70%", h: 12 })) : dkSkeleton({ w: 70, h: 22, r: 11 }),
      kind === "m" ? dkSkeleton({ w: 60, h: 22, r: 11 }) : null,
      kind === "m" ? h("span", { class: k("c-act") }) : null));
  }

  function memberRow(m, i) {
    const mid = m.userId || m.id;
    const isMe = mid === uid;
    const owner = m.role === "owner";
    const canManage = isOwner && !isMe && !owner;
    const name = memberName(m);
    const [g0, g1] = GRADS[i % GRADS.length];
    const statusKey = !m.status || m.status === "active" ? "active" : m.status;
    const kebab = canManage
      ? h("button", { type: "button", class: cx(k("kebab"), "dk-press"), "aria-label": `${name} üyesini yönet`, onclick: () => confirmRemove(m) }, ico("kebab", 16))
      : null;
    return h("div", { role: "row", class: cx(k("row"), k("mgrid"), "dk-row") },
      h("span", { role: "cell", class: k("who") },
        h("span", { class: k("av"), style: { background: `linear-gradient(135deg,${g0},${g1})` }, "aria-hidden": "true" }, initials(name, 2)),
        h("span", { class: k("wcol") },
          // dar sütunlarda üç noktayla kısalır → tam değer title ile okunur
          h("span", { class: k("nrow") }, h("span", { class: k("name"), title: name }, name), isMe ? h("span", { class: k("me") }, "SEN") : null),
          m.email ? h("span", { class: k("msub"), title: m.email }, m.email) : null)),
      h("span", { role: "cell", class: k("c-role") }, rolePill(owner)),
      h("span", { role: "cell", class: cx(k("mail"), k("c-mail")), title: m.email || null }, m.email || "—"),
      h("span", { role: "cell", class: k("c-st") }, dkStatusBadge(statusKey, { variant: "pill" })),
      h("span", { role: "cell", class: k("c-act") }, kebab));
  }

  function inviteRow(iv) {
    const key = INV_ST[iv.status] || "rejected";
    const date = iv.createdAt ? fmtDMY(iv.createdAt) : "—";
    return h("div", { role: "row", class: cx(k("row"), k("irow"), k("igrid"), "dk-row") },
      h("span", { role: "cell", class: k("imail") },
        h("span", { class: k("itile") }, ico("mail", 15)),
        // ≤860: GÖNDERİLDİ sütunu yerine tarih e-postanın altında (herhangi bir genişlikte ikisinden yalnız biri görünür)
        h("span", { class: k("icol") }, h("span", { class: k("iemail"), title: iv.invitedEmail || null }, iv.invitedEmail || ""), h("span", { class: k("isub") }, date))),
      h("span", { role: "cell", class: k("idate") }, date),
      h("span", { role: "cell" }, dkStatusBadge(key, { variant: "pill" })));
  }

  function drawKpis() {
    if (st.loading || st.error) { Object.values(kpi).forEach((el) => el.dk.setValue("—")); return; }
    kpi.total.dk.setValue(String(st.members.length));
    kpi.owner.dk.setValue(String(st.members.filter((m) => m.role === "owner").length));
    kpi.staff.dk.setValue(String(st.members.filter((m) => m.role === "staff").length));
    // Personel sahibin davetlerini okuyamaz (kural) → bilinmeyen sayı "—"
    kpi.pending.dk.setValue(isOwner ? String(st.invites.filter((iv) => iv.status === "pending").length) : "—");
  }

  function drawTables() {
    memExtra.replaceChildren(); invExtra.replaceChildren();
    if (st.loading) {
      memBody.replaceChildren(...skelRows(3, "m"));
      invBody.replaceChildren(...skelRows(2, "i"));
      memTable.setAttribute("aria-busy", "true"); invTable.setAttribute("aria-busy", "true");
      return;
    }
    memTable.removeAttribute("aria-busy"); invTable.removeAttribute("aria-busy");
    if (st.error) {
      memBody.replaceChildren(); invBody.replaceChildren();
      memExtra.append(dkEmpty({ variant: "plain", icon: ico("people", 30, { sw: "2" }), title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile.",
        action: dkButton("Tekrar dene", { variant: "outline", size: 40, onClick: () => load() }) }));
      invCard.hidden = true;
      return;
    }
    invCard.hidden = false;
    const q = st.q.trim();
    // üyeler (sıra korunur → avatar gradyanı süzmede değişmesin)
    const mem = st.members.map((m, i) => ({ m, i })).filter(({ m }) => !q || matchText(q, memberName(m), m.email));
    memBody.replaceChildren(...mem.map(({ m, i }) => memberRow(m, i)));
    memTable.hidden = !st.members.length;
    if (!st.members.length) {
      memExtra.append(dkEmpty({ variant: "plain", icon: ico("people", 30), title: "Henüz üye yok", sub: "Personel davet ederek ekibini oluştur." }));
    } else if (!mem.length) {
      memExtra.append(h("p", { class: k("empty") }, "Aramanla eşleşen üye yok."));
    }
    // davetler
    if (!isOwner) {
      // SHARED-CANDIDATE yok — kural gereği (invitedByUid == uid) personel sahibin davetlerini göremez (spec §9, Q9 önerisi)
      invBody.replaceChildren();
      invTable.hidden = true;
      invExtra.append(h("div", { class: k("note") }, ico("lock", 15), "Davetleri yalnızca organizasyon sahibi görür."));
      return;
    }
    const inv = st.invites.filter((iv) => !q || matchText(q, iv.invitedEmail));
    invBody.replaceChildren(...inv.map(inviteRow));
    invTable.hidden = !st.invites.length;
    if (!st.invites.length) invExtra.append(h("p", { class: k("empty") }, "Henüz davet gönderilmedi."));
    else if (!inv.length) invExtra.append(h("p", { class: k("empty") }, "Aramanla eşleşen davet yok."));
  }

  let refocus = false;   // üye çıkarıldıktan sonra: tetikleyici kebab yeniden çizimle gider → odak "01 Üyeler" başlığına
  async function load() {
    const my = ++seq;
    st.loading = true; st.error = false;
    drawKpis(); drawTables();
    try {
      // legacy: orgInvites hatası boş listeye düşer; personel için sorgu yine kendi (boş) davetlerini döndürür
      const [members, invites] = await Promise.all([orgMembers(orgId), isOwner ? orgInvites(uid).catch(() => []) : Promise.resolve([])]);
      if (!alive || my !== seq) return;
      st.members = members || []; st.invites = invites || [];
    } catch (_) {
      if (!alive || my !== seq) return;
      st.error = true;
    }
    st.loading = false;
    drawKpis(); drawTables();
    if (refocus) {
      refocus = false;
      const hEl = document.getElementById(hMem);
      // onay diyaloğu (portal) kapanırken odağı hâlâ tutuyor olabilir → sayfa içeriğinde değilse başlığa
      requestAnimationFrame(() => { const a = document.activeElement; if (alive && hEl?.isConnected && (!a || !root.contains(a))) hEl.focus({ preventScroll: true }); });
    }
  }

  // ══════════ DAVET MODALI (sahip) ══════════
  function openInvite(user) {
    if (!isOwner || inviteModal) return;
    if (dkLoginGate("Personel davet etmek")) return;
    if (user) writeQuery({ davet: 1 });
    const inp = dkInput({ id: uidOf("mail"), type: "email", placeholder: "ornek@email.com", autocomplete: "off", attrs: { spellcheck: "false" } });
    const fld = dkField({ label: "E-POSTA", input: inp });
    // artboard: flex gap 10 → metin parçaları ayrı esnek öğeler ("Rol:" · "Personel" · "— sahip…")
    const roleBox = h("div", { class: k("rolebox") }, ico("people", 16, { color: CYAN }), "Rol: ", h("strong", {}, "Personel"), " — sahip yetkileri verilmez.");
    let busy = false;
    const send = async (_close, btn) => {
      if (busy) return false;
      const email = inp.value.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { m.setError("Geçerli bir e-posta gir"); inp.focus(); return false; }
      busy = true;
      try {
        await createOrgInvite({
          orgId, orgName: p.orgName || p.displayName || "", invitedEmail: email,
          invitedByUid: uid, invitedByName: p.displayName || p.orgName || "",
        });
        if (!alive) return false;
        dkToast("Davet gönderildi");
        m.close("sent");
        load();
      } catch (e) {
        if (btn?.isConnected) m.setError(e && e.code === "duplicate-invite" ? "Bu e-postaya bekleyen davet zaten var" : "Davet gönderilemedi");
      } finally { busy = false; }
      return false;
    };
    const m = dkModal({
      variant: "form", size: 482, align: "top", top: 180, cls: k("inv"),   // artboard: width 480 + 1px kenar (content-box)
      title: "Personel Davet Et", titleIcon: ico("userPlus", 20, { color: PINK }),
      sub: "Davet edilen kişi uygulamaya organizatör olarak kaydolduğunda daveti görecek.",
      body: [fld.node, roleBox],
      actions: [
        { label: "İptal", variant: "outline" },
        { label: "Davet Gönder", variant: "primary", icon: ico("send", 17, { color: "#06070A", sw: "2.2" }), keepOpen: true, busyLabel: "Gönderiliyor…", onClick: send },
      ],
      onClose: () => { inviteModal = null; if (alive && onRoute()) writeQuery({ davet: null }); },
    });
    inviteModal = m;
    inp.addEventListener("input", () => m.setError(""));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); m.buttons[1]?.click(); } });
  }
  const onRoute = () => (location.hash || "").split("?")[0] === "#/organizer/ekip";

  // ══════════ ÜYEYİ ÇIKAR (onay) ══════════
  function confirmRemove(mem) {
    if (!isOwner) return;
    if (dkLoginGate("Üyeyi ekipten çıkarmak")) return;
    dkModal({
      variant: "confirm", size: 420, cls: k("rm"), title: memberName(mem),
      sub: "Bu üyeyi ekipten çıkarmak istiyor musun?",
      actions: [
        { label: "Vazgeç", variant: "outline" },
        { label: "Ekipten Çıkar", variant: "danger", icon: ico("trash", 15, { color: "#06070A", sw: "2.2" }), busyLabel: "Çıkarılıyor…", onClick: async () => {
          try {
            await removeOrgMember(orgId, mem.id);
            if (alive) { dkToast("Üye ekipten çıkarıldı"); refocus = true; load(); }
            return true;
          } catch (_) {
            // legacy confirmRemoveMember (keepOpen): hata → diyalog açık kalır, sahip tekrar deneyebilir
            dkToast("Çıkarılamadı", { type: "err" });
            return false;
          }
        } },
      ],
    });
  }

  // ══════════ ilk durum ══════════
  load();
  // ?davet=1 → davet modalı (yalnız sahip; personelde yok sayılır — legacy wantInvite sıfırlanır)
  if (ctx.query?.get("davet")) {
    if (isOwner) requestAnimationFrame(() => { if (alive) openInvite(false); });
    else writeQuery({ davet: null });
  }

  return {
    node: shell.node,
    destroy() {
      alive = false;
      try { inviteModal?.close("route"); } catch (_) {}
      shell.destroy();
    },
    update(query) {
      const want = !!query?.get("davet");
      if (want && isOwner && !inviteModal) openInvite(false);
      else if (!want && inviteModal) inviteModal.close("query");
      else if (want && !isOwner) writeQuery({ davet: null });
    },
    // Aynı kimlik + aynı organizasyon/rol → yerinde kal (tablolar/modal korunur); değiştiyse yeniden kur
    onSession(ns) {
      const np = ns?.profile || {};
      return ns?.user?.uid === uid && (np.orgId || uid) === orgId && ((np.orgRole || "owner") !== "staff") === isOwner && (np.orgName || np.displayName || "") === orgName;
    },
  };
}
