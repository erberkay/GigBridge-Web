// WebAdminEtkinlikler — Yönetici: tüm etkinlikler + katılımcı listesi (≥769 px). Registry anahtarı: adminEtkinlik (#/admin/etkinlikler).
// Görsel dil WebAdmin ile aynı (css/dk-admin-panel.css: hero / KPI / iki kolon / detay paneli); ek kurallar css/dk-admin-etkinlik.css.
// Veri: events (tümü; kurallar okumayı herkese açıyor) · events/{id}/attendees (giriş yapmış herkes okur) · users/{uid} (ad / e-posta).
// Yalnız okuma — bu sayfa hiçbir kayda yazmaz. Seçili etkinlik adreste ?sec= ile tutulur (paylaşılabilir / yenilemede korunur).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { userById, eventStartMs } from "../../data.js";
import { db, collection, getDocs } from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { dkKpi, dkSegmented, dkTable, dkPageHero, dkSkeleton, dkButton, dkAvatar, dkStatusBadge } from "../shared/ui.js";
import { toMs, MONTHS_TR_SHORT, matchText, writeQuery, revealDetail } from "../shared/helpers.js";

const VIOLET = "#A78BFA";
const GREEN = "#7CE0B0", YELLOW = "#FFD700", RED = "#FF5A6E", GREY = "#8A8E97";
const SEGS = [["up", "Yaklaşan"], ["past", "Geçmiş"], ["all", "Tümü"]];
const TAIL_MS = 6 * 3600e3;                         // bitiş bilgisi yoksa başlangıç + 6 saat (uygulama ile aynı)
const CACHE_TTL = 60e3;

// Modül önbelleği: sekme/rota geçişinde yeniden sorgu yok (WebAdmin ile aynı yaklaşım)
const _cache = { uid: null, at: 0, events: null, loading: null, att: new Map(), users: new Map() };
let _q = "";
let _seg = "up";

const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (ms) => { if (ms == null) return "—"; const d = new Date(ms); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDateTime = (ms) => { if (ms == null) return "—"; const d = new Date(ms); return `${fmtDate(ms)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const str = (v) => (typeof v === "string" ? v.trim() : "");

function toEvent(d) {
  const e = { id: d.id, ...d.data() };
  const start = eventStartMs(e);
  const end = toMs(e.endAt) ?? (start != null ? start + TAIL_MS : null);
  const st = String(e.status || "").toLowerCase();
  return {
    id: e.id, raw: e, start, end,
    title: str(e.title) || "Etkinlik",
    venue: str(e.venueName) || str(e.venue) || "—",
    artist: e.artistPending === true ? "" : (str(e.artistName) || str(e.artist)),
    count: Number(e.attendeeCount) > 0 ? Number(e.attendeeCount) : 0,
    capacity: Number(e.capacity) > 0 ? Number(e.capacity) : null,
    cancelled: st === "cancelled" || st === "canceled" || e.cancelled === true,
  };
}
const isPast = (ev, now) => ev.end != null && ev.end < now;
function statusOf(ev, now) {
  if (ev.cancelled) return { label: "İptal", color: RED };
  if (ev.start != null && now >= ev.start && !isPast(ev, now)) return { label: "Şu an", color: GREEN };
  if (isPast(ev, now)) return { label: "Bitti", color: GREY };
  return { label: "Yaklaşan", color: YELLOW };
}

function loadEvents(uid) {
  if (_cache.loading) return _cache.loading;
  _cache.loading = getDocs(collection(db, "events")).then((s) => {
    if (_cache.uid !== uid) return;
    _cache.events = s.docs.map(toEvent);
    _cache.at = Date.now();
  }).finally(() => { _cache.loading = null; });
  return _cache.loading;
}
// Katılımcılar + her birinin kullanıcı kaydı (ad / e-posta / foto). Kullanıcı kaydı okunamazsa bilet kaydındaki adla devam.
async function loadAttendees(evId) {
  const s = await getDocs(collection(db, "events", evId, "attendees"));
  const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  await Promise.all(list.map(async (a) => {
    const uid = a.userId || a.id;
    if (!_cache.users.has(uid)) {
      try { _cache.users.set(uid, await userById(uid)); } catch (_) { _cache.users.set(uid, null); }
    }
  }));
  return list.map((a) => {
    const uid = a.userId || a.id;
    const u = _cache.users.get(uid) || null;
    const used = a.ticketStatus === "used" || a.checkedInAt != null;
    return {
      uid, name: str(u?.displayName) || str(a.displayName) || "İsimsiz",
      email: str(u?.email), photo: u?.photoURL || null, type: u?.userType || "customer",
      joined: toMs(a.joinedAt), checkedIn: toMs(a.checkedInAt), used, anonymous: a.anonymous === true,
      deleted: !u,
    };
  }).sort((x, y) => (Number(y.used) - Number(x.used)) || ((x.joined || 0) - (y.joined || 0)));
}

// CSV (Excel Türkçe için ; ayraç + BOM). Alanlar tırnaklı, içteki tırnak ikilenir.
function downloadCsv(ev, rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Ad", "E-posta", "Bilet", "Giriş", "Katılma", "Anonim"].map(q).join(";"),
    ...rows.map((r) => [r.name, r.email, r.used ? "Kullanıldı" : "Geçerli", r.checkedIn ? fmtDateTime(r.checkedIn) : "", r.joined ? fmtDateTime(r.joined) : "", r.anonymous ? "Evet" : ""].map(q).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `${ev.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "etkinlik"}-katilimcilar.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function adminEtkinliklerView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || "";
  let alive = true;
  if (_cache.uid !== uid) { _cache.uid = uid; _cache.at = 0; _cache.events = null; _cache.att = new Map(); _cache.users = new Map(); _q = ""; }
  let selId = ctx.query?.get?.("sec") || null;
  let attQ = "";
  let attToken = 0;

  const shell = panelShell({
    role: "admin", active: "etkinlik", crumb: "Etkinlikler", ctx, notifications: "custom",
    search: { placeholder: "Etkinlik, mekan veya sanatçı ara", value: _q, onInput: (q) => { _q = q || ""; renderList(); }, onSubmit: (q) => { _q = q || ""; renderList(); } },
  });
  const root = shell.content;
  root.classList.add("dk-admin-panel", "dk-admin-etk");

  const hero = dkPageHero({ eyebrow: "YÖNETİCİ · ETKİNLİKLER", title: "Etkinlikler ve ", em: "katılımcılar", tail: ".", color: VIOLET, cls: "dk-admin-panel-hero" });
  const kUp = dkKpi({ label: "YAKLAŞAN ETKİNLİK", value: "—", sub: "Henüz başlamamış", icon: "calendar", color: VIOLET, cls: "dk-admin-panel-kpi", onClick: () => setSeg("up"), active: _seg === "up" });
  const kTk = dkKpi({ label: "YAKLAŞAN BİLET", value: "—", sub: "Yaklaşan etkinliklerde", icon: "ticket", color: "#4ED8FF", cls: "dk-admin-panel-kpi" });
  const kPast = dkKpi({ label: "GEÇMİŞ ETKİNLİK", value: "—", sub: "Biten etkinlikler", icon: "calendarCheck", color: GREEN, cls: "dk-admin-panel-kpi", onClick: () => setSeg("past"), active: _seg === "past" });
  const kpiRow = h("section", { class: "dk-admin-panel-kpis", "aria-label": "Özet" }, kUp, kTk, kPast);

  const seg = dkSegmented({ items: SEGS.map(([k, l]) => ({ key: k, label: l, count: "" })), value: _seg, size: 34, label: "Etkinlik dönemi", onChange: (k) => setSeg(k), cls: "dk-admin-etk-seg" });
  const table = dkTable({
    label: "Etkinlikler", empty: "Etkinlik yok", rowMinHeight: 64,
    columns: [
      { key: "t", label: "ETKİNLİK", width: "minmax(0,1.6fr)", render: (ev) => h("span", { class: "dk-admin-etk-tc" },
        h("span", { class: "dk-admin-panel-t" }, ev.title),
        h("span", { class: "dk-admin-panel-s" }, [ev.venue, ev.artist].filter((x) => x && x !== "—").join(" · ") || "—")) },
      { key: "d", label: "TARİH", width: "minmax(0,0.9fr)", render: (ev) => h("span", { class: "dk-admin-etk-mono" }, fmtDateTime(ev.start)) },
      { key: "c", label: "KATILIMCI", width: "110px", align: "right", render: (ev) => h("span", { class: "dk-admin-etk-mono" }, ev.capacity ? `${ev.count} / ${ev.capacity}` : String(ev.count)) },
      { key: "s", label: "DURUM", width: "104px", render: (ev) => { const st = statusOf(ev, Date.now()); return dkStatusBadge({ label: st.label, color: st.color }, { variant: "pill" }); } },
    ],
    onRowClick: (ev) => select(ev),
  });
  const card = h("section", { class: "dk-admin-panel-card", "aria-label": "Etkinlik listesi" }, h("div", { class: "dk-admin-etk-bar" }, seg), table);
  const detail = h("aside", { class: "dk-admin-panel-detail dk-admin-etk-detail", "aria-label": "Katılımcılar" });
  root.append(hero, kpiRow, h("div", { class: "dk-admin-panel-grid" }, card, detail));

  const visible = () => {
    const now = Date.now();
    const list = (_cache.events || []).filter((ev) => (_seg === "all" || (_seg === "past" ? isPast(ev, now) : !isPast(ev, now)))
      && (!_q || matchText(_q, ev.title, ev.venue, ev.artist)));
    // yaklaşan: en yakın önce · geçmiş/tümü: en yeni önce (tarihsiz en sonda)
    const asc = _seg === "up";
    return list.sort((a, b) => (a.start == null) - (b.start == null) || (asc ? a.start - b.start : b.start - a.start));
  };
  function setSeg(k) {
    if (k === _seg) return;
    _seg = k; seg.dk.set(k);
    kUp.dk.setActive(k === "up"); kPast.dk.setActive(k === "past");
    renderList();
  }
  function select(ev) {
    revealDetail(detail);   // yığılmış düzende (<1180, telefon) detay listenin altında → görünüme getir
    if (selId === ev.id) return;
    selId = ev.id; attQ = "";
    writeQuery({ sec: ev.id });
    table.dk.select(ev.id);
    renderDetail();
  }

  function renderCounts() {
    if (!_cache.events) return;
    const now = Date.now();
    const up = _cache.events.filter((e) => !isPast(e, now) && !e.cancelled);
    kUp.dk.setValue(String(up.length));
    kTk.dk.setValue(String(up.reduce((n, e) => n + e.count, 0)));
    kPast.dk.setValue(String(_cache.events.filter((e) => isPast(e, now)).length));
    seg.dk.setCount("up", _cache.events.filter((e) => !isPast(e, now)).length);
    seg.dk.setCount("past", _cache.events.filter((e) => isPast(e, now)).length);
    seg.dk.setCount("all", _cache.events.length);
  }
  function renderList() {
    if (!_cache.events) {
      table.dk.setRows([]);
      table.querySelector(".dk-tbl-body")?.replaceChildren(...[0, 1, 2].map(() => h("div", { class: "dk-tbl-row", style: { padding: "12px 20px", minHeight: "64px" } }, dkSkeleton({ w: 220, h: 14 }))));
      return;
    }
    const list = visible();
    table.dk.setRows(list);
    if (!selId && list[0]) selId = list[0].id;
    table.dk.select(selId);
    renderCounts();
    renderDetail();
  }

  const selected = () => (_cache.events || []).find((e) => e.id === selId) || null;
  function renderDetail() {
    const ev = selected();
    if (!_cache.events) { detail.replaceChildren(h("div", { class: "dk-admin-panel-dhead" }, dkSkeleton({ w: 140, h: 12 }), dkSkeleton({ w: 200, h: 18 }))); return; }
    if (!ev) {
      detail.replaceChildren(h("div", { class: "dk-admin-panel-dempty" }, svgIcon("calendar", { size: 28, color: "#5E636D" }),
        h("span", { class: "dk-admin-panel-det" }, "Seçili etkinlik yok"), h("span", {}, "Katılımcıları görmek için soldan bir etkinlik seç.")));
      return;
    }
    const st = statusOf(ev, Date.now());
    const head = h("div", { class: "dk-admin-panel-dhead" },
      h("span", { class: "dk-admin-panel-deb" }, "ETKİNLİK"),
      h("div", { class: "dk-admin-panel-dcol" }, h("span", { class: "dk-admin-panel-dt" }, ev.title),
        h("span", {}, dkStatusBadge({ label: st.label, color: st.color }, { variant: "pill" }))));
    const dl = h("dl", { class: "dk-admin-panel-dl" },
      ...[["MEKAN", ev.venue], ["SANATÇI", ev.artist || "—"], ["TARİH", fmtDateTime(ev.start)], ["KATILIMCI", ev.capacity ? `${ev.count} / ${ev.capacity}` : String(ev.count)]]
        .map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))));
    const body = h("div", { class: "dk-admin-etk-att" });
    detail.replaceChildren(head, dl, body);
    drawAttendees(ev, body);
  }

  async function drawAttendees(ev, body) {
    const token = ++attToken;
    const cached = _cache.att.get(ev.id);
    const paint = (rows) => {
      if (!alive || token !== attToken) return;
      const used = rows.filter((r) => r.used).length;
      const search = h("input", { type: "search", class: "dk-admin-etk-q", placeholder: "Katılımcı ara", value: attQ, "aria-label": "Katılımcı ara" });
      const listEl = h("ul", { class: "dk-admin-etk-list", "aria-label": "Katılımcı listesi" });
      const drawRows = () => {
        const shown = rows.filter((r) => !attQ || matchText(attQ, r.name, r.email));
        if (!shown.length) { listEl.replaceChildren(h("li", { class: "dk-admin-etk-none" }, rows.length ? "Aramanla eşleşen katılımcı yok" : "Bu etkinliğe henüz katılan yok")); return; }
        listEl.replaceChildren(...shown.map((r) => h("li", { class: "dk-admin-etk-row" },
          dkAvatar({ name: r.name, photo: r.photo, size: 36, type: r.type }),
          h("span", { class: "dk-admin-etk-who" },
            h("span", { class: "dk-admin-etk-n" }, r.name, r.anonymous ? h("span", { class: "dk-admin-etk-tag" }, "ANONİM") : null, r.deleted ? h("span", { class: "dk-admin-etk-tag" }, "SİLİNMİŞ") : null),
            h("span", { class: "dk-admin-etk-e" }, r.email || "e-posta yok")),
          h("span", { class: "dk-admin-etk-st" },
            dkStatusBadge({ label: r.used ? "Giriş yaptı" : "Bilet geçerli", color: r.used ? GREEN : YELLOW }, { variant: "pill" }),
            h("span", { class: "dk-admin-etk-time" }, r.used && r.checkedIn ? fmtDateTime(r.checkedIn) : r.joined ? "Katıldı " + fmtDate(r.joined) : "")))));
      };
      search.addEventListener("input", () => { attQ = search.value; drawRows(); });
      const csv = dkButton("CSV indir", { variant: "outline", size: 36, icon: "fileText", onClick: () => downloadCsv(ev, rows) });
      body.replaceChildren(
        h("div", { class: "dk-admin-etk-ahead" },
          h("span", { class: "dk-admin-panel-deb" }, `KATILIMCILAR · ${rows.length}`),
          h("span", { class: "dk-admin-etk-sum" }, `${used} giriş yaptı · ${rows.length - used} bekliyor`)),
        h("div", { class: "dk-admin-etk-tools" }, search, rows.length ? csv : null),
        listEl);
      drawRows();
    };
    if (cached) { paint(cached); return; }
    body.replaceChildren(h("div", { class: "dk-admin-etk-ahead" }, dkSkeleton({ w: 140, h: 12 })), ...[0, 1, 2].map(() => h("div", { class: "dk-admin-etk-row" }, dkSkeleton({ w: 36, h: 36, r: 18 }), dkSkeleton({ w: 160, h: 14 }))));
    try {
      const rows = await loadAttendees(ev.id);
      _cache.att.set(ev.id, rows);
      paint(rows);
    } catch (e) {
      console.error(e);
      if (!alive || token !== attToken) return;
      body.replaceChildren(h("div", { class: "dk-admin-panel-dempty" }, svgIcon("alertCircle", { size: 24, color: "#5E636D" }),
        h("span", { class: "dk-admin-panel-det", role: "alert" }, "Katılımcılar yüklenemedi"),
        dkButton("Tekrar dene", { variant: "outline", size: 36, icon: "refresh", onClick: () => { _cache.att.delete(ev.id); drawAttendees(ev, body); } })));
    }
  }

  async function refresh(force = false) {
    if (!uid) return;
    if (!force && _cache.events && Date.now() - _cache.at < CACHE_TTL) return;
    try { await loadEvents(uid); } catch (e) {
      console.error(e);
      if (!alive) return;
      table.querySelector(".dk-tbl-body")?.replaceChildren(h("div", { class: "dk-admin-panel-err" }, svgIcon("alertCircle", { size: 28, color: "#5E636D" }),
        h("span", { class: "dk-admin-panel-det", role: "alert" }, "Yüklenemedi"), h("span", {}, "Bağlantıyı kontrol edip sayfayı yenile."),
        dkButton("Tekrar dene", { variant: "outline", size: 40, icon: "refresh", onClick: () => refresh(true) })));
      return;
    }
    if (alive) renderList();
  }

  renderList();
  refresh(false);

  return {
    node: shell.node,
    update(q) { const sec = q?.get?.("sec") || null; if (sec && sec !== selId) { selId = sec; attQ = ""; table.dk.select(sec); renderDetail(); } },
    onSession(ns) { return !!ns?.user && ns.user.uid === uid && !!ns.isAdmin; },
    destroy() { alive = false; shell.destroy(); },
  };
}

