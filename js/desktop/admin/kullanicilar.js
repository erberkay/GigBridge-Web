// WebAdminKullanicilar — Yönetici: tüm kullanıcılar · tek kullanıcıya bildirim · hesabı kalıcı silme (≥769 px).
// Registry anahtarı: adminKullanici (#/admin/kullanicilar). Görsel dil WebAdmin ile aynı (dk-admin-panel.css + dk-admin-etkinlik.css).
// Yazımlar yalnız sunucuda: adminSendNotification (audience 'user') · adminDeleteUser (functions/adminUsers.js — onay metni:
// hesabın adı ya da e-postası; sahip / kendisi silinemez, denetim izi adminAudit). Seçili kullanıcı adreste ?sec=.
// DESTEK MESAJI: yönetici kullanıcıya "GigBridge Destek" adıyla NORMAL sohbet mesajı yazar (adminSendSupportMessage —
// functions/supportDm.js); mesaj kullanıcının uygulama/web MESAJLAR kutusuna düşer, kullanıcı oradan yanıtlar. Yazışma penceresi
// conversations/{destek__uid}/messages'ı canlı okur (firestore.rules: admin + destek katılımcı) ve açıkken okundu yapar
// (yalnız unreadCount[destek] = 0). Okunmamış yanıtlar listede rozet + "Destek" sekmesi (array-contains destek dinleyicisi).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { db, collection, doc, query, where, orderBy, onSnapshot, updateDoc, getDocs, functions, httpsCallable } from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkKpi, dkSegmented, dkTable, dkPageHero, dkSkeleton, dkButton, dkAvatar, dkStatusBadge, dkInput, dkTextarea, dkToast, dkConfirm, dkModal } from "../shared/ui.js";
import { toMs, MONTHS_TR_SHORT, matchText, writeQuery, ROLE_LABELS, revealDetail, trUpper } from "../shared/helpers.js";
import { SUPPORT_UID, SUPPORT_NAME, isSupportUserDoc } from "../../support-account.js";

const VIOLET = "#A78BFA";
const ROLE_COLOR = { customer: "#4ED8FF", artist: "#FF4FA3", venue: "#FF8A2A", organizer: "#FF4FA3", agency: "#FBBF24" };
const SEGS = [["all", "Tümü"], ["customer", "Dinleyici"], ["artist", "Sanatçı"], ["venue", "Mekan"], ["organizer", "Organizatör"], ["agency", "Ajans"], ["support", "Destek"]];
const TITLE_MAX = 40, BODY_MAX = 110;          // functions/notifCatalog.js ile aynı
const CACHE_TTL = 60e3;
const sendFn = httpsCallable(functions, "adminSendNotification", { timeout: 120000 });
const deleteFn = httpsCallable(functions, "adminDeleteUser", { timeout: 120000 });
const supportFn = httpsCallable(functions, "adminSendSupportMessage", { timeout: 60000 });
const SUPPORT_MAX = 2000;                      // functions/supportDm.js + firestore.rules mesaj sınırı
const supConvId = (uid) => [SUPPORT_UID, uid].sort().join("__");   // data.js convIdFor ile aynı
// yeniden denemede aynı kimlik → sunucu çift mesaj yazmaz (adminSendSupportMessage clientId)
const newClientId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

const _cache = { uid: null, at: 0, users: null, loading: null };
let _q = "";
let _seg = "all";

const str = (v) => (typeof v === "string" ? v.trim() : "");
const fmtDate = (v) => { const t = toMs(v); if (t == null) return "—"; const d = new Date(t); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`; };
// sunucu hatası → okunur Türkçe metin (HttpsError mesajları zaten Türkçe)
const errText = (e) => (e?.code === "functions/permission-denied" ? "Bu işlem için yönetici yetkisi gerekli. Sahip hesabıyla (berkayer032@gmail.com) giriş yaptığından emin ol."
  : e?.code === "functions/unauthenticated" ? "Oturum süresi dolmuş. Çıkış yapıp tekrar giriş yap." : e?.message || "İşlem başarısız");

function toUser(d) {
  const u = { id: d.id, ...d.data() };
  const role = ["customer", "artist", "venue", "organizer", "agency"].includes(u.userType) ? u.userType : null;
  let state = { label: "Aktif", color: "#7CE0B0" };
  if (u.pendingDeletion === true) state = { label: "Silinmekte", color: "#FF5A6E" };
  else if (u.banned === true) state = { label: "Yasaklı", color: "#FF5A6E" };
  else if ((role === "venue" || role === "organizer" || role === "agency") && u.approved === false && u.rejected !== true) state = { label: "Onay bekliyor", color: "#FFD700" };
  else if (u.rejected === true) state = { label: "Reddedildi", color: "#8A8E97" };
  else if (!role) state = { label: "Yarım kayıt", color: "#8A8E97" };
  return {
    id: u.id, raw: u, role, state,
    name: str(u.displayName) || "İsimsiz", email: str(u.email), photo: u.photoURL || null,
    city: str(u.city), created: toMs(u.createdAt), demo: u.id.startsWith("demo_"),
  };
}
function loadUsers(uid) {
  if (_cache.loading) return _cache.loading;
  _cache.loading = getDocs(collection(db, "users")).then((s) => {
    if (_cache.uid !== uid) return;
    // "GigBridge Destek" sistem hesabı (users/gigbridge-destek) listede yer almaz
    _cache.users = s.docs.filter((d) => !isSupportUserDoc(d.id, d.data())).map(toUser);
    _cache.at = Date.now();
  }).finally(() => { _cache.loading = null; });
  return _cache.loading;
}

// ══════════ DESTEK YAZIŞMASI PENCERESİ (GigBridge Destek ↔ kullanıcı DM'si) ══════════
// Görünüm report-detail.js threadWidget ile aynı sınıflar (dk-admin-panel.css). Mesajlar canlı; pencere açıkken kullanıcı yanıtları
// okundu yapılır (yalnız unreadCount[destek] = 0 — kural). Yanıt adminSendSupportMessage ile (yöneticinin adı kullanıcıya görünmez).
let closeSupportDm = null;
function openSupportDm(u, canSend) {
  closeSupportDm?.();
  const cid = supConvId(u.id);
  const who = u.name || "Kullanıcı";
  let msgs = null, failed = false, sending = false, stick = true, lastTop = 0;
  let pendingId = null, pendingText = "";
  const unsubs = [];

  const log = h("div", { class: "dk-admin-panel-tlog", role: "log", "aria-live": "polite", "aria-label": "Destek yazışması mesajları", tabindex: "0", style: { maxHeight: "46vh", minHeight: "160px" } });
  log.addEventListener("scroll", () => { lastTop = log.scrollTop; stick = log.scrollHeight - log.scrollTop - log.clientHeight < 24; }, { passive: true });
  const ta = h("textarea", { class: "dk-ta dk-in dk-inp-bg-stratum dk-admin-panel-tin", rows: 3, maxlength: SUPPORT_MAX,
    placeholder: `${SUPPORT_NAME} olarak yaz…`, "aria-label": `${SUPPORT_NAME} olarak yaz` });
  const cnt = h("span", { class: "dk-admin-panel-tcnt", "aria-hidden": "true" }, `0/${SUPPORT_MAX}`);
  const sendBtn = h("button", { type: "button", class: "dk-admin-panel-dok dk-press dk-admin-panel-tsend" }, svgIcon("send", { size: 16 }), h("span", {}, "Gönder"));
  const err = h("p", { class: "dk-admin-panel-terr", role: "alert" });
  const sync = () => {
    cnt.textContent = `${ta.value.length}/${SUPPORT_MAX}`;
    sendBtn.setAttribute("aria-disabled", ta.value.trim() && !sending ? "false" : "true");
    sendBtn.setAttribute("aria-busy", sending ? "true" : "false");
  };
  ta.addEventListener("input", () => { err.textContent = ""; sync(); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
  sendBtn.addEventListener("click", () => send());
  async function send() {
    const text = ta.value.trim().slice(0, SUPPORT_MAX);
    if (!text || sending) return;
    if (!pendingId || pendingText !== text) { pendingId = newClientId(); pendingText = text; }
    sending = true; sync();
    try {
      await supportFn({ toUid: u.id, text, clientId: pendingId });
      pendingId = null; pendingText = "";
      ta.value = ""; stick = true;
    } catch (e) {
      console.error(e);
      err.textContent = errText(e) || "Gönderilemedi. Bağlantını kontrol edip tekrar dene.";
    } finally { sending = false; sync(); }
  }
  sync();

  function draw() {
    if (failed) { log.replaceChildren(h("p", { class: "dk-admin-panel-tempty" }, "Yazışma yüklenemedi. Sayfayı yenileyip tekrar dene.")); return; }
    if (!msgs) { log.replaceChildren(h("p", { class: "dk-admin-panel-tempty" }, "Yükleniyor…")); return; }
    if (!msgs.length) {
      log.replaceChildren(h("p", { class: "dk-admin-panel-tempty" }, `Henüz mesaj yok. ${who} kişisine ${SUPPORT_NAME} adıyla yazabilirsin; mesaj uygulamada ve web sitesinde MESAJLAR kutusuna düşer.`));
      return;
    }
    let prevDay = "";
    const nodes = [];
    msgs.forEach((m) => {
      const t = toMs(m.createdAt) || m.clientCreatedAt || Date.now();
      const d = new Date(t);
      const day = `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`;
      if (day !== prevDay) { nodes.push(h("div", { class: "dk-admin-panel-tday" }, h("span", {}, trUpper(day)))); prevDay = day; }
      const mine = m.senderId === SUPPORT_UID;
      nodes.push(h("div", { class: cx("dk-admin-panel-tmsg", mine ? "is-admin" : "is-user") },
        h("span", { class: "dk-admin-panel-tname" }, mine ? SUPPORT_NAME : who),
        h("div", { class: "dk-admin-panel-tb" }, m.hidden === true ? "Bu mesaj moderasyonla gizlendi." : String(m.text ?? "")),
        h("span", { class: "dk-admin-panel-ttime" }, `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)));
    });
    log.replaceChildren(...nodes);
    requestAnimationFrame(() => { if (log.isConnected) log.scrollTop = stick ? log.scrollHeight : lastTop; });
  }
  draw();

  const body = h("section", { class: "dk-admin-panel-thread", "aria-label": "Destek yazışması", style: { borderTop: "0", padding: "0" } },
    log,
    canSend
      ? h("div", { class: "dk-admin-panel-tcomp" }, ta, h("div", { class: "dk-admin-panel-trow" }, cnt, h("span", { class: "dk-admin-panel-thint" }, "⌘/Ctrl + Enter"), sendBtn), err)
      : h("p", { class: "dk-admin-panel-tempty" }, "Bu hesaba artık mesaj gönderilemez (silinmekte ya da yasaklı); yalnız geçmiş gösteriliyor."));

  const modal = dkModal({
    title: who, titleIcon: "shieldCheck", size: 560, variant: "panel", body,
    sub: `Kullanıcı seni “${SUPPORT_NAME}” olarak görür (adın görünmez). Mesaj push bildirimiyle iletilir; yanıtları burada canlı görürsün.`,
    initialFocus: canSend ? ta : log,
    onClose: () => { unsubs.forEach((f) => { try { f(); } catch (_) {} }); if (closeSupportDm === close) closeSupportDm = null; },
  });
  const close = () => modal.close();
  closeSupportDm = close;

  // Mesajlar (canlı) — destek sohbeti henüz yoksa boş liste döner (kural: admin + destek kimlikli sohbet)
  unsubs.push(onSnapshot(query(collection(db, "conversations", cid, "messages"), orderBy("createdAt", "asc")), (snap) => {
    failed = false;
    msgs = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    draw();
  }, (e) => { console.error(e); failed = true; draw(); }));
  // Okundu: pencere açıkken ve sekme görünürken kullanıcı yanıtları okunmuş sayılır (yalnız unreadCount[destek] = 0)
  let marking = false;
  const markRead = (n) => {
    if (n <= 0 || marking || document.visibilityState !== "visible") return;
    marking = true;
    updateDoc(doc(db, "conversations", cid), { [`unreadCount.${SUPPORT_UID}`]: 0 }).catch((e) => console.warn("okundu yazılamadı", e)).finally(() => { marking = false; });
  };
  let lastUnread = 0;
  unsubs.push(onSnapshot(doc(db, "conversations", cid), (s) => {
    lastUnread = s.exists() ? Math.max(0, Number(s.data()?.unreadCount?.[SUPPORT_UID]) || 0) : 0;
    markRead(lastUnread);
  }, (e) => console.warn("destek sohbeti okunamadı", e)));
  const onVis = () => markRead(lastUnread);
  document.addEventListener("visibilitychange", onVis);
  unsubs.push(() => document.removeEventListener("visibilitychange", onVis));
}

export function adminKullanicilarView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || "";
  let alive = true;
  if (_cache.uid !== uid) { _cache.uid = uid; _cache.at = 0; _cache.users = null; _q = ""; }
  let selId = ctx.query?.get?.("sec") || null;

  const shell = panelShell({
    role: "admin", active: "kullanici", crumb: "Kullanıcılar", ctx, notifications: "custom",
    search: { placeholder: "Ad, e-posta veya şehir ara", value: _q, onInput: (q) => { _q = q || ""; renderList(); }, onSubmit: (q) => { _q = q || ""; renderList(); } },
  });
  const root = shell.content;
  root.classList.add("dk-admin-panel", "dk-admin-etk");
  const toast = (m, o) => dkToast(m, o);

  const hero = dkPageHero({ eyebrow: "YÖNETİCİ · KULLANICILAR", title: "Tüm hesaplar, ", em: "tek listede", tail: ".", color: VIOLET, cls: "dk-admin-panel-hero" });
  const kAll = dkKpi({ label: "TOPLAM HESAP", value: "—", sub: "Rolü olan kayıtlar", icon: "users", color: VIOLET, cls: "dk-admin-panel-kpi" });
  const kArt = dkKpi({ label: "SANATÇI", value: "—", sub: "Kayıtlı sanatçı", icon: "mic", color: "#FF4FA3", cls: "dk-admin-panel-kpi", onClick: () => setSeg("artist") });
  const kCus = dkKpi({ label: "DİNLEYİCİ", value: "—", sub: "Kayıtlı dinleyici", icon: "headphones", color: "#4ED8FF", cls: "dk-admin-panel-kpi", onClick: () => setSeg("customer") });
  const kpiRow = h("section", { class: "dk-admin-panel-kpis", "aria-label": "Özet" }, kAll, kArt, kCus);

  const seg = dkSegmented({ items: SEGS.map(([k, l]) => ({ key: k, label: l, count: "" })), value: _seg, size: 34, label: "Rol", onChange: (k) => setSeg(k) });
  const table = dkTable({
    label: "Kullanıcılar", empty: "Kullanıcı yok", rowMinHeight: 60,
    columns: [
      { key: "n", label: "KULLANICI", width: "minmax(0,1.6fr)", render: (u) => h("span", { class: "dk-admin-etk-urow" },
        dkAvatar({ name: u.name, photo: u.photo, size: 32, type: u.role || "customer" }),
        h("span", { class: "dk-admin-etk-tc" }, h("span", { class: "dk-admin-etk-nrow" }, h("span", { class: "dk-admin-panel-t" }, u.name), supBadge(u.id)), h("span", { class: "dk-admin-panel-s" }, u.email || "e-posta yok"))) },
      { key: "r", label: "ROL", width: "110px", render: (u) => h("span", { class: "dk-admin-etk-mono", style: { color: ROLE_COLOR[u.role] || "#8A8E97" } }, u.role ? (ROLE_LABELS[u.role] || u.role).toLocaleUpperCase("tr-TR") : "—") },
      { key: "c", label: "KAYIT", width: "120px", render: (u) => h("span", { class: "dk-admin-etk-mono" }, fmtDate(u.raw.createdAt)) },
      { key: "s", label: "DURUM", width: "124px", render: (u) => dkStatusBadge({ label: u.state.label, color: u.state.color }, { variant: "pill" }) },
    ],
    onRowClick: (u) => select(u),
  });
  const card = h("section", { class: "dk-admin-panel-card", "aria-label": "Kullanıcı listesi" }, h("div", { class: "dk-admin-etk-bar" }, seg), table);
  const detail = h("aside", { class: "dk-admin-panel-detail dk-admin-etk-detail", "aria-label": "Seçili kullanıcı" });
  root.append(hero, kpiRow, h("div", { class: "dk-admin-panel-grid" }, card, detail));

  // ── Destek DM'leri (canlı): kullanıcı → { unread, last, at, fromUser } · okunmamış yanıt rozeti + "Destek" sekmesi
  let sup = new Map();
  let fillSupSec = null;   // seçili kullanıcının destek bölümünü (canlı sayaçla) yeniden doldurur (renderDetail kurar)
  const supUnread = (id) => sup.get(id)?.unread || 0;
  function supBadge(id) {
    const n = supUnread(id);
    return n > 0 ? h("span", { class: "dk-admin-etk-sdm", title: `${n} okunmamış destek yanıtı` }, svgIcon("chat", { size: 11 }), String(n)) : null;
  }
  const unsubSup = onSnapshot(query(collection(db, "conversations"), where("participants", "array-contains", SUPPORT_UID)), (snap) => {
    const m = new Map();
    snap.docs.forEach((d) => {
      const x = d.data() || {};
      const other = (Array.isArray(x.participants) ? x.participants : []).find((p) => p !== SUPPORT_UID);
      if (!other) return;
      m.set(other, { unread: Math.max(0, Number(x.unreadCount?.[SUPPORT_UID]) || 0), last: str(x.lastMessage), at: toMs(x.lastMessageTime), fromUser: x.lastSender?.id === other });
    });
    sup = m;
    if (!alive || !_cache.users) return;
    // yalnız tablo + destek bölümü tazelenir (bildirim formuna yazılan metin kaybolmasın)
    table.dk.setRows(visible()); table.dk.select(selId);
    seg.dk.setCount("support", sup.size);
    fillSupSec?.();
  }, (e) => console.error("destek sohbetleri okunamadı", e));

  const visible = () => (_cache.users || [])
    .filter((u) => (_seg === "all" || (_seg === "support" ? sup.has(u.id) : u.role === _seg)) && (!_q || matchText(_q, u.name, u.email, u.city)))
    .sort((a, b) => (_seg === "support"
      ? (supUnread(b.id) - supUnread(a.id)) || ((sup.get(b.id)?.at || 0) - (sup.get(a.id)?.at || 0))
      : (b.created || 0) - (a.created || 0)));
  function setSeg(k) { if (k === _seg) return; _seg = k; seg.dk.set(k); renderList(); }
  function select(u) {
    if (selId !== u.id) { selId = u.id; writeQuery({ sec: u.id }); table.dk.select(u.id); renderDetail(); }
    revealDetail(detail);   // yığılmış düzende (<1180, telefon) detay listenin altında → görünüme getir
  }

  function renderList() {
    if (!_cache.users) {
      table.querySelector(".dk-tbl-body")?.replaceChildren(...[0, 1, 2, 3].map(() => h("div", { class: "dk-tbl-row", style: { padding: "12px 20px", minHeight: "60px" } }, dkSkeleton({ w: 240, h: 14 }))));
      return;
    }
    const list = visible();
    table.dk.setRows(list);
    if (!selId && list[0]) selId = list[0].id;
    table.dk.select(selId);
    const all = _cache.users.filter((u) => u.role);
    kAll.dk.setValue(String(all.length));
    kArt.dk.setValue(String(all.filter((u) => u.role === "artist").length));
    kCus.dk.setValue(String(all.filter((u) => u.role === "customer").length));
    SEGS.forEach(([k]) => seg.dk.setCount(k, k === "all" ? _cache.users.length : k === "support" ? sup.size : _cache.users.filter((u) => u.role === k).length));
    renderDetail();
  }

  function renderDetail() {
    const u = (_cache.users || []).find((x) => x.id === selId) || null;
    fillSupSec = null;
    if (!u) {
      detail.replaceChildren(h("div", { class: "dk-admin-panel-dempty" }, svgIcon("users", { size: 28, color: "#5E636D" }),
        h("span", { class: "dk-admin-panel-det" }, "Seçili kullanıcı yok"), h("span", {}, "Detayları görmek için soldan bir kullanıcı seç.")));
      return;
    }
    const isMe = u.id === uid;
    const head = h("div", { class: "dk-admin-panel-dhead" },
      h("span", { class: "dk-admin-panel-deb" }, "KULLANICI"),
      h("div", { class: "dk-admin-panel-drow" }, dkAvatar({ name: u.name, photo: u.photo, size: 56, type: u.role || "customer" }),
        h("div", { class: "dk-admin-panel-dcol" }, h("span", { class: "dk-admin-panel-dt" }, u.name), h("span", {}, dkStatusBadge({ label: u.state.label, color: u.state.color }, { variant: "pill" })))));
    const dl = h("dl", { class: "dk-admin-panel-dl" },
      ...[["ROL", u.role ? ROLE_LABELS[u.role] || u.role : "—"], ["E-POSTA", u.email || "—"], ["ŞEHİR", u.city || "—"], ["KAYIT", fmtDate(u.raw.createdAt)], ["KİMLİK", u.id]]
        .map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))));

    // ── tek kullanıcıya bildirim ──
    const title = dkInput({ placeholder: "Başlık", maxlength: TITLE_MAX, size: 40 });
    const body = dkTextarea({ placeholder: "Bildirim metni", rows: 3, maxlength: BODY_MAX });
    const send = dkButton("Bildirim gönder", { variant: "violet", size: 40, icon: "send", full: true });
    send.addEventListener("click", async () => {
      const t = title.value.trim(), b = body.input.value.trim();
      if (!t || !b) { toast("Başlık ve metin gerekli", { type: "err" }); return; }
      if (!(await dkConfirm({ title: "Bildirim gönderilsin mi?", body: `"${t}" bildirimi ${u.name} kullanıcısına gidecek.`, confirmLabel: "Gönder" }))) return;
      send.setAttribute("aria-busy", "true"); send.disabled = true;
      try {
        await sendFn({ audience: "user", uid: u.id, title: t, body: b, route: "none" });
        title.value = ""; body.input.value = ""; body.input.dispatchEvent(new Event("input"));
        toast("Bildirim gönderildi");
      } catch (e) { console.error(e); toast(errText(e), { type: "err" }); }
      finally { send.removeAttribute("aria-busy"); send.disabled = false; }
    });
    const notif = h("div", { class: "dk-admin-etk-att" },
      h("span", { class: "dk-admin-panel-deb" }, "BİLDİRİM GÖNDER"),
      u.role && !u.demo && u.state.label !== "Silinmekte" && u.state.label !== "Yasaklı"
        ? h("div", { class: "dk-admin-etk-form" }, title, body, send)
        : h("span", { class: "dk-admin-etk-sum" }, "Bu hesaba bildirim gönderilemez (rolü yok, silinmekte ya da yasaklı)."));

    // ── destek mesajı (GigBridge Destek DM'si) ──
    const canDm = !!u.role && !u.demo && u.state.label !== "Silinmekte" && u.state.label !== "Yasaklı";
    const supSec = h("div", { class: "dk-admin-etk-att" });
    fillSupSec = () => {
      const info = sup.get(u.id) || null;
      const n = info?.unread || 0;
      const sum = info
        ? `${n > 0 ? `${n} okunmamış yanıt · ` : ""}Son mesaj (${info.fromUser ? "kullanıcı" : SUPPORT_NAME}): ${info.last.length > 90 ? info.last.slice(0, 90) + "…" : info.last || "—"}`
        : canDm ? `Mesaj kullanıcının MESAJLAR kutusuna “${SUPPORT_NAME}” adıyla düşer; push bildirimi gider, kullanıcı oradan yanıtlar.`
          : "Bu hesaba destek mesajı gönderilemez (rolü yok, silinmekte ya da yasaklı).";
      const kids = [h("span", { class: "dk-admin-panel-deb" }, "DESTEK MESAJI"), h("span", { class: "dk-admin-etk-sum" }, sum)];
      if (canDm || info) {
        kids.push(dkButton(info ? (n > 0 ? "Yanıtları oku ve yanıtla" : "Destek yazışmasını aç") : "Destek mesajı gönder",
          { variant: "violet", size: 40, icon: info ? "chat" : "send", full: true, onClick: () => openSupportDm(u, canDm) }));
      }
      supSec.replaceChildren(...kids);
    };
    fillSupSec();

    // ── hesabı kalıcı sil ──
    const del = h("div", { class: "dk-admin-etk-att dk-admin-etk-danger" },
      h("span", { class: "dk-admin-panel-deb", style: { color: "#FF5A6E" } }, "HESABI SİL"),
      h("span", { class: "dk-admin-etk-sum" }, isMe ? "Kendi hesabını buradan silemezsin."
        : "Hesap ve giriş kaydı hemen, kalıcı olarak silinir. Takip, yorum ve favori gibi bağlı veriler de temizlenir. Mekansa etkinlikleri de silinir. Geri alınamaz."));
    if (!isMe) {
      const btn = dkButton("Hesabı kalıcı sil", { variant: "danger", size: 40, icon: "trash", full: true });
      btn.addEventListener("click", async () => {
        const inp = dkInput({ placeholder: u.name, size: 40 });
        const ok = await dkConfirm({ title: "Hesap kalıcı olarak silinsin mi?", danger: true, confirmLabel: "Kalıcı sil",
          body: h("div", { class: "dk-admin-etk-cbody" },
            h("p", { class: "dk-mdl-p" }, `${u.name} (${u.email || "e-posta yok"}) silinecek. Bu işlem geri alınamaz.`),
            h("p", { class: "dk-mdl-p" }, "Onaylamak için hesabın adını ya da e-postasını yaz:"), inp) });
        if (!ok) return;
        btn.disabled = true; btn.setAttribute("aria-busy", "true");
        try {
          const r = await deleteFn({ uid: u.id, confirm: inp.value });
          _cache.users = (_cache.users || []).filter((x) => x.id !== u.id);
          selId = null; writeQuery({ sec: null });
          toast(r?.data?.deletedEvents ? `Hesap silindi (${r.data.deletedEvents} etkinlik ile)` : "Hesap silindi");
          renderList();
        } catch (e) { console.error(e); toast(errText(e), { type: "err" }); btn.disabled = false; btn.removeAttribute("aria-busy"); }
      });
      del.append(btn);
    }
    detail.replaceChildren(head, dl, supSec, notif, del);
  }

  async function refresh(force = false) {
    if (!uid) return;
    if (!force && _cache.users && Date.now() - _cache.at < CACHE_TTL) return;
    try { await loadUsers(uid); } catch (e) {
      console.error(e);
      if (!alive) return;
      table.querySelector(".dk-tbl-body")?.replaceChildren(h("div", { class: "dk-admin-panel-err" }, svgIcon("alertCircle", { size: 28, color: "#5E636D" }),
        h("span", { class: "dk-admin-panel-det", role: "alert" }, "Yüklenemedi"),
        dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: () => refresh(true) })));
      return;
    }
    if (alive) renderList();
  }
  renderList();
  refresh(false);

  return {
    node: shell.node,
    update(q) { const sec = q?.get?.("sec") || null; if (sec && sec !== selId) { selId = sec; table.dk.select(sec); renderDetail(); } },
    onSession(ns) { return !!ns?.user && ns.user.uid === uid && !!ns.isAdmin; },
    destroy() { alive = false; try { unsubSup(); } catch (_) {} closeSupportDm?.(); shell.destroy(); },
  };
}
