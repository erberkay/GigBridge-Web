// Yönetici paneli — mekan/organizatör onayı, VIP istekleri, sorun bildirimleri.
import { session, logout } from "../store.js";
import {
  listPendingByRole, approveUser, rejectUser,
  listPendingVip, approveVip, rejectVip,
  listReports, resolveReport, approveNameChange, rejectNameChange,
} from "../data.js";
import { h, clear, icon, btn, topbar, empty, spinner, toast, avatar, fmtDate, ROLE } from "../ui.js";
// NOT: kesfetPage'i STATİK import ETME — admin panelini customer.js'e bağlar; önbellek
// uyumsuzluğunda (eski customer.js) import patlar ve panel "Sayfa yüklenemedi" verir.
// Onun yerine butona basınca DİNAMİK import ediyoruz (aşağıda openKesfetPreview).

export function adminPage() {
  const content = h("div", { class: "content" }, h("div", { class: "loading" }, spinner()));
  const page = h("div", { class: "page" },
    topbar("Yönetici Paneli", { subtitle: session.user?.email || "", color: ROLE.admin,
      right: h("div", { class: "tb-actions" },
        h("button", { class: "km-open", onclick: openKesfetPreview, title: "Keşfet ekranını önizle" },
          icon("compass-outline", { size: 18 }), h("span", {}, "Keşfet")),
        iconBtn("log-out-outline", logout)) }),
    content);
  load(content);
  return page;
}

// Yönetici, müşterilerin gördüğü Keşfet ekranını modal önizlemede görür.
// Küçült/büyüt toggle'ı + navigasyon kilidi (admin panelden dışarı atılmasın).
let kmOpen = false;
async function openKesfetPreview() {
  if (kmOpen) return;               // zaten açık
  kmOpen = true;
  const root = document.getElementById("modal-root");

  const minBtn = iconBtn("contract-outline", null);
  minBtn.title = "Küçült";
  const closeBtn = iconBtn("close", () => close());
  closeBtn.title = "Kapat";

  const kmBody = h("div", { class: "km-body" }, h("div", { class: "loading" }, spinner()));
  const frame = h("div", { class: "km-frame" },
    h("div", { class: "km-bar" },
      h("div", { class: "km-title" }, icon("compass", { size: 15, color: "var(--primary)" }), h("span", {}, "Keşfet — Önizleme")),
      h("div", { class: "km-actions" }, minBtn, closeBtn)),
    kmBody);
  const overlay = h("div", { class: "km-overlay" }, frame);

  // Modal içindeki navigasyonları etkisizleştir (kartlar/zil/"TÜMÜ"/alt sekmeler): filtre + arama + kaydırma çalışır.
  frame.addEventListener("click", (e) => {
    const nav = e.target.closest('a[href^="#/"], .hs-bell, .hs-seeall, .login-chip, .ecard, .ecard2, .t10, .hero-slide, .vcard, .hs-artist');
    if (nav) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // Emniyet: yine de bir tık kaçarsa hash'i admin'de tut.
  const onHash = () => { if (kmOpen && !location.hash.startsWith("#/admin")) history.replaceState(null, "", "#/admin"); };
  window.addEventListener("hashchange", onHash);

  // Küçült ↔ büyüt (aynı buton toggle)
  let mini = false;
  minBtn.onclick = () => {
    mini = !mini;
    overlay.classList.toggle("min", mini);
    clear(minBtn); minBtn.append(icon(mini ? "expand-outline" : "contract-outline", { size: 20 }));
    minBtn.title = mini ? "Büyüt" : "Küçült";
  };

  function close() {
    kmOpen = false;
    window.removeEventListener("hashchange", onHash);
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  }
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !mini) close(); }); // backdrop → kapat (yalnız büyükken)

  root.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  // Keşfet ekranını tembel yükle — admin paneli customer.js export'una STATİK bağlı değil,
  // önbellek uyumsuzluğu olsa bile panel açılır; Keşfet gelmezse zarifçe hata gösterir.
  try {
    const { kesfetPage } = await import("./customer.js");
    if (kmOpen) { clear(kmBody); kmBody.append(kesfetPage()); }
  } catch (_) {
    clear(kmBody); kmBody.append(empty("cloud-offline-outline", "Keşfet yüklenemedi", "Sayfayı yenileyip tekrar dene."));
  }
}

async function load(root) {
  try {
    const [venues, orgs, vip, reports] = await Promise.all([
      listPendingByRole("venue"), listPendingByRole("organizer"), listPendingVip(), listReports(),
    ]);
    const nameReqs = reports.filter((r) => r.type === "name_change");
    const otherReports = reports.filter((r) => r.type !== "name_change");
    clear(root);
    root.append(
      groupSection("Onay Bekleyen Mekanlar", "business-outline", venues.length,
        venues.length ? venues.map((v) => approvalRow(v, ROLE.venue, v.city)) : [emptyRow("Bekleyen mekan yok")]),
      groupSection("Onay Bekleyen Organizatörler", "megaphone-outline", orgs.length,
        orgs.length ? orgs.map((o) => approvalRow(o, ROLE.organizer, o.email)) : [emptyRow("Bekleyen organizatör yok")]),
      groupSection("VIP İstekleri", "sparkles-outline", vip.length,
        vip.length ? vip.map(vipRow) : [emptyRow("Bekleyen VIP isteği yok")]),
      groupSection("Mekan Adı İstekleri", "create-outline", nameReqs.length,
        nameReqs.length ? nameReqs.map(nameReqRow) : [emptyRow("Bekleyen isim isteği yok")]),
      groupSection("Sorun Bildirimleri", "flag-outline", otherReports.length,
        otherReports.length ? otherReports.map(reportRow) : [emptyRow("Bekleyen bildirim yok")]),
    );
  } catch (e) {
    clear(root);
    root.append(empty("cloud-offline-outline", "Yüklenemedi", "Bağlantıyı kontrol edip sayfayı yenile."));
  }
}

function groupSection(title, ic, count, rows) {
  return h("section", { class: "sect" },
    h("div", { class: "sect-head row-between" },
      h("h2", { class: "sect-title" }, icon(ic, { size: 16 }), " " + title),
      count ? h("span", { class: "count-pill" }, count) : null),
    h("div", { class: "list-card" }, ...rows));
}

function approvalRow(u, color, meta) {
  const row = h("div", { class: "lrow" },
    avatar(u.displayName, color),
    h("div", { class: "lrow-info" },
      h("div", { class: "lrow-name" }, u.displayName || "İsimsiz"),
      meta ? h("div", { class: "lrow-meta" }, meta) : null),
    h("div", { class: "lrow-actions" },
      actBtn("checkmark", "Onayla", "ok", async () => { await approveUser(u.id); row.remove(); toast("Onaylandı"); }),
      actBtn("close", "Reddet", "danger", async () => { await rejectUser(u.id); row.remove(); toast("Reddedildi"); })));
  return row;
}

function vipRow(ev) {
  const row = h("div", { class: "lrow" },
    avatar(ev.title, ROLE.venue),
    h("div", { class: "lrow-info" },
      h("div", { class: "lrow-name" }, ev.title || "İsimsiz Etkinlik"),
      h("div", { class: "lrow-meta" }, [ev.venueName, typeof ev.date === "string" ? ev.date : fmtDate(ev.date)].filter(Boolean).join(" · "))),
    h("div", { class: "lrow-actions" },
      actBtn("sparkles", "VIP Yap", "ok", async () => { await approveVip(ev.id); row.remove(); toast("VIP onaylandı"); }),
      actBtn("close", "Reddet", "danger", async () => { await rejectVip(ev.id); row.remove(); toast("Reddedildi"); })));
  return row;
}

function reportRow(r) {
  const row = h("div", { class: "lrow" },
    avatar(r.reporterName || r.subject || "?", ROLE.customer),
    h("div", { class: "lrow-info" },
      h("div", { class: "lrow-name" }, r.subject || "Bildirim"),
      h("div", { class: "lrow-meta" }, [r.reporterName, r.reporterType].filter(Boolean).join(" · ")),
      r.message ? h("div", { class: "lrow-msg" }, r.message) : null),
    h("div", { class: "lrow-actions" },
      actBtn("checkmark-done", "Çözüldü", "ok", async () => { await resolveReport(r.id); row.remove(); toast("Çözüldü olarak işaretlendi"); })));
  return row;
}

function nameReqRow(r) {
  const row = h("div", { class: "lrow" },
    avatar(r.currentName || r.reporterName || "?", ROLE.venue),
    h("div", { class: "lrow-info" },
      h("div", { class: "lrow-name" }, (r.currentName || "Mekan") + "  →  " + (r.requestedName || "?")),
      h("div", { class: "lrow-meta" }, "Neden: " + (r.reason || r.message || "—"))),
    h("div", { class: "lrow-actions" },
      actBtn("checkmark", "Onayla", "ok", async () => { await approveNameChange(r); row.remove(); toast("Ad değiştirildi"); }),
      actBtn("close", "Reddet", "danger", async () => { await rejectNameChange(r); row.remove(); toast("Reddedildi"); })));
  return row;
}

function actBtn(ic, label, kind, onClick) {
  const b = h("button", { class: "act " + kind, onclick: async () => { b.disabled = true; try { await onClick(); } catch (e) { b.disabled = false; toast("İşlem başarısız", "err"); } } },
    icon(ic, { size: 15 }), h("span", {}, label));
  return b;
}
function emptyRow(text) { return h("div", { class: "lrow-empty" }, text); }
function iconBtn(ic, onClick) { return h("button", { class: "icon-btn", onclick: onClick }, icon(ic, { size: 20 })); }
