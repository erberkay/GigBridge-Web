// WebAdminBildirim — Yönetici: özel / toplu bildirim + otomatik bildirim ayarları (≥769 px). Registry: adminBildirim (#/admin/bildirim).
// Uygulamadaki admin paneli › BİLDİRİM sekmesinin web karşılığı; sunucu tarafı aynı: functions/adminNotify.js
//   adminSendNotification { audience 'all'|'roles'|'user', roles?, email?, title ≤40, body ≤110, route, dryRun? }
//   adminNotificationConfig { action 'get'|'set'|'reset', type, enabled?, title?, body? }
// Son gönderimler: adminBroadcasts (kural: okuma isAdmin). Görsel dil WebAdmin (dk-admin-panel.css + dk-admin-etkinlik.css).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { db, collection, getDocs, query, orderBy, limit, functions, httpsCallable } from "../../firebase.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkChip, dkPageHero, dkSkeleton, dkButton, dkInput, dkTextarea, dkSelect, dkSwitch, dkToast, dkConfirm } from "../shared/ui.js";
import { toMs, MONTHS_TR_SHORT } from "../shared/helpers.js";

const VIOLET = "#A78BFA";
const TITLE_MAX = 40, BODY_MAX = 110;            // functions/notifCatalog.js
const ROLES = [["customer", "Dinleyiciler", "#4ED8FF"], ["artist", "Sanatçılar", "#FF4FA3"], ["venue", "Mekanlar", "#FF8A2A"], ["organizer", "Organizatörler", "#FF4FA3"], ["agency", "Ajanslar", "#FBBF24"]];
const ROLE_LABEL = Object.fromEntries(ROLES.map(([k, l]) => [k, l]));
const ROUTES = [{ value: "none", label: "Yok (yalnız bildirim)" }, { value: "ListenerSetup", label: "Dinleyici hesabı kurulumu" }, { value: "NotificationSettings", label: "Bildirim ayarları" }, { value: "Profile", label: "Profil" }];
const AUD_LABEL = { all: "Herkes", user: "Tek kullanıcı", customer: "Dinleyiciler", artist: "Sanatçılar", venue: "Mekanlar", organizer: "Organizatörler", agency: "Ajanslar" };
const TEMPLATE = { audience: "roles", roles: ["artist"], route: "ListenerSetup", title: "Dinleyici hesabı açabilirsin",
  body: "Aynı hesapla, istediğin isimle dinleyici olarak etkinliklere katıl. Profil > Dinleyici hesabına geç." };
const sendFn = httpsCallable(functions, "adminSendNotification", { timeout: 540000 });
const cfgFn = httpsCallable(functions, "adminNotificationConfig", { timeout: 30000 });

const fmtDT = (v) => { const t = toMs(v); if (t == null) return "—"; const d = new Date(t); return `${d.getDate()} ${MONTHS_TR_SHORT[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const errText = (e) => (e?.code === "functions/permission-denied" ? "Bu işlem için yönetici yetkisi gerekli. Sahip hesabıyla (berkayer032@gmail.com) giriş yaptığından emin ol."
  : e?.code === "functions/unauthenticated" ? "Oturum süresi dolmuş. Çıkış yapıp tekrar giriş yap." : e?.message || "İşlem başarısız");

// gönderim taslağı sekmeler arası korunur
const _draft = { audience: "all", roles: [], email: "", title: "", body: "", route: "none" };

export function adminBildirimView(ctx) {
  const s = ctx.session || session;
  const uid = s.user?.uid || "";
  let alive = true;
  const toast = (m, o) => dkToast(m, o);
  const shell = panelShell({ role: "admin", active: "bildirim", crumb: "Bildirimler", ctx, notifications: "custom" });
  const root = shell.content;
  root.classList.add("dk-admin-panel", "dk-admin-etk");
  const hero = dkPageHero({ eyebrow: "YÖNETİCİ · BİLDİRİMLER", title: "Kime ne gideceğini ", em: "sen seç", tail: ".", color: VIOLET, cls: "dk-admin-panel-hero",
    lead: "Rol seçerek ya da tek kişiye özel bildirim gönder. Otomatik bildirimleri buradan aç, kapat ve metinlerini değiştir." });

  // ══════════ 1. Gönderim formu ══════════
  const audBox = h("div", { class: "dk-admin-etk-chips", role: "group", "aria-label": "Hedef" });
  const roleBox = h("div", { class: "dk-admin-etk-chips", role: "group", "aria-label": "Roller" });
  const email = dkInput({ placeholder: "kullanici@ornek.com", size: 40, value: _draft.email, onInput: (v) => { _draft.email = v; count.textContent = ""; } });
  const emailRow = h("div", { class: "dk-admin-etk-fld" }, h("span", { class: "dk-admin-etk-lbl" }, "KULLANICI E-POSTASI"), email);
  const title = dkInput({ placeholder: "Başlık", maxlength: TITLE_MAX, size: 40, value: _draft.title, onInput: (v) => { _draft.title = v; drawPreview(); } });
  const titleCnt = h("span", { class: "dk-admin-etk-cnt" });
  const body = dkTextarea({ placeholder: "Bildirim metni", rows: 3, maxlength: BODY_MAX, value: _draft.body, onInput: (v) => { _draft.body = v; drawPreview(); } });
  const route = dkSelect({ options: ROUTES, value: _draft.route, size: 40, onChange: (v) => { _draft.route = v; } });
  const count = h("span", { class: "dk-admin-etk-sum", "aria-live": "polite" });
  const preview = h("div", { class: "dk-admin-etk-prev", "aria-label": "Önizleme" });
  const checkB = dkButton("Alıcı sayısını gör", { variant: "outline", size: 40, icon: "users" });
  const sendB = dkButton("Gönder", { variant: "violet", size: 40, icon: "send" });
  const tplB = dkButton("Hazır şablon: sanatçılara dinleyici hesabı duyurusu", { variant: "ghost", size: 36, icon: "sparkles" });
  tplB.classList.add("dk-admin-etk-tpl");   // dar ekranda uzun etiket satır kırar (dk-admin-etkinlik.css)

  function drawAudience() {
    audBox.replaceChildren(...[["all", "Herkes"], ["roles", "Rol seç"], ["user", "Tek kullanıcı"]].map(([k, l]) =>
      dkChip({ label: l, pressed: _draft.audience === k, size: 32, onClick: () => { _draft.audience = k; count.textContent = ""; drawAudience(); } })));
    roleBox.replaceChildren(...ROLES.map(([k, l, c]) => dkChip({ label: l, dot: c, pressed: _draft.roles.includes(k), size: 32,
      onClick: () => { _draft.roles = _draft.roles.includes(k) ? _draft.roles.filter((x) => x !== k) : [..._draft.roles, k]; count.textContent = ""; drawAudience(); } })));
    roleBox.hidden = _draft.audience !== "roles";
    emailRow.hidden = _draft.audience !== "user";
  }
  function drawPreview() {
    titleCnt.textContent = `${(_draft.title || "").length}/${TITLE_MAX}`;
    preview.replaceChildren(
      h("span", { class: "dk-admin-etk-prev-app" }, svgIcon("bell", { size: 13 }), "GIGBRIDGE · şimdi"),
      h("span", { class: "dk-admin-etk-prev-t" }, _draft.title.trim() || "Başlık"),
      h("span", { class: "dk-admin-etk-prev-b" }, _draft.body.trim() || "Bildirim metni burada görünür."));
  }
  const payload = (dryRun) => {
    const p = { audience: _draft.audience, title: _draft.title.trim(), body: _draft.body.trim(), route: _draft.route, dryRun };
    if (_draft.audience === "roles") {
      // tek rol seçildiyse sunucunun tek rollü kitlesi (kayıtta rol adı görünür)
      if (_draft.roles.length === 1) p.audience = _draft.roles[0]; else p.roles = _draft.roles;
    }
    if (_draft.audience === "user") p.email = _draft.email.trim();
    return p;
  };
  const validate = () => {
    if (_draft.audience === "roles" && !_draft.roles.length) return "En az bir rol seç.";
    if (_draft.audience === "user" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(_draft.email.trim())) return "Geçerli bir e-posta gir.";
    if (!_draft.title.trim() || !_draft.body.trim()) return "Başlık ve metin gerekli.";
    return null;
  };
  async function check() {
    const err = validate(); if (err) { toast(err, { type: "err" }); return null; }
    checkB.disabled = true; count.textContent = "Hesaplanıyor…";
    try {
      const r = await sendFn(payload(true));
      const n = r?.data?.recipients ?? 0;
      count.textContent = `${n} kişiye gidecek`;
      return n;
    } catch (e) { console.error(e); count.textContent = ""; toast(errText(e), { type: "err" }); return null; }
    finally { checkB.disabled = false; }
  }
  checkB.addEventListener("click", check);
  sendB.addEventListener("click", async () => {
    const n = await check(); if (n == null) return;
    if (!n) { toast("Bu hedefte bildirim gönderilecek kullanıcı yok", { type: "err" }); return; }
    const who = _draft.audience === "roles" ? _draft.roles.map((r) => ROLE_LABEL[r]).join(", ") : AUD_LABEL[_draft.audience];
    if (!(await dkConfirm({ title: "Bildirim gönderilsin mi?", body: `"${_draft.title.trim()}" bildirimi ${who} hedefinde ${n} kişiye gidecek. Gönderim geri alınamaz.`, confirmLabel: `${n} kişiye gönder` }))) return;
    sendB.disabled = true; sendB.setAttribute("aria-busy", "true");
    try {
      const r = await sendFn(payload(false));
      toast(`Gönderildi: ${r?.data?.sent ?? n} kişi`);
      Object.assign(_draft, { title: "", body: "" }); title.value = ""; body.input.value = ""; body.input.dispatchEvent(new Event("input"));
      count.textContent = ""; drawPreview(); loadHistory();
    } catch (e) { console.error(e); toast(errText(e), { type: "err" }); }
    finally { sendB.disabled = false; sendB.removeAttribute("aria-busy"); }
  });
  tplB.addEventListener("click", () => {
    Object.assign(_draft, { ...TEMPLATE, roles: [...TEMPLATE.roles] });
    title.value = _draft.title; body.input.value = _draft.body; body.input.dispatchEvent(new Event("input"));
    route.querySelector("select").value = _draft.route; count.textContent = "";
    drawAudience(); drawPreview();
  });

  const form = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Bildirim gönder" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "YENİ BİLDİRİM"), tplB),
    h("div", { class: "dk-admin-etk-form" },
      h("div", { class: "dk-admin-etk-fld" }, h("span", { class: "dk-admin-etk-lbl" }, "HEDEF"), audBox, roleBox),
      emailRow,
      h("div", { class: "dk-admin-etk-fld" }, h("span", { class: "dk-admin-etk-lbl" }, "BAŞLIK ", titleCnt), title),
      h("div", { class: "dk-admin-etk-fld" }, h("span", { class: "dk-admin-etk-lbl" }, "METİN"), body),
      h("div", { class: "dk-admin-etk-fld" }, h("span", { class: "dk-admin-etk-lbl" }, "DOKUNUNCA AÇILACAK EKRAN"), route),
      preview,
      h("div", { class: "dk-admin-etk-tools" }, checkB, sendB, count)));

  // ══════════ 2. Son gönderimler ══════════
  const history = h("div", { class: "dk-admin-etk-hist" });
  async function loadHistory() {
    history.replaceChildren(dkSkeleton({ w: 200, h: 14 }));
    try {
      const snap = await getDocs(query(collection(db, "adminBroadcasts"), orderBy("createdAt", "desc"), limit(20)));
      if (!alive) return;
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      history.replaceChildren(...(rows.length ? rows.map((b) => h("div", { class: "dk-admin-etk-row" },
        h("span", { class: "dk-admin-etk-who" }, h("span", { class: "dk-admin-etk-n" }, b.title || "—"), h("span", { class: "dk-admin-etk-e" }, b.body || "")),
        h("span", { class: "dk-admin-etk-st" },
          h("span", { class: "dk-admin-etk-time" }, (Array.isArray(b.roles) && b.roles.length ? b.roles.map((r) => ROLE_LABEL[r] || r).join(", ") : AUD_LABEL[b.audience] || b.audience || "—").toLocaleUpperCase("tr-TR")),
          h("span", { class: "dk-admin-etk-time" }, `${b.sent ?? 0}/${b.recipients ?? 0} · ${fmtDT(b.createdAt)}`))))
        : [h("span", { class: "dk-admin-etk-sum" }, "Henüz gönderim yok.")]));
    } catch (e) { console.error(e); if (alive) history.replaceChildren(h("span", { class: "dk-admin-etk-sum" }, "Gönderimler yüklenemedi.")); }
  }
  const histCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Son gönderimler" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "SON GÖNDERİMLER")), h("div", { class: "dk-admin-etk-form" }, history));

  // ══════════ 3. Otomatik bildirimler ══════════
  const cfgBox = h("div", { class: "dk-admin-etk-form" });
  let openType = null;
  function drawCfg(view) {
    const groups = view.groups || [];
    const byG = groups.map((g) => [g, view.types.filter((t) => t.group === g)]).filter(([, l]) => l.length);
    cfgBox.replaceChildren(...byG.flatMap(([g, list]) => [h("span", { class: "dk-admin-etk-lbl dk-admin-etk-glbl" }, g.toLocaleUpperCase("tr-TR")),
      ...list.map((t) => cfgRow(t))]));
  }
  function cfgRow(t) {
    const sw = dkSwitch({ checked: t.enabled, disabled: t.locked, variant: "cyan", label: `${t.label} açık/kapalı`,
      onChange: async (on, { revert }) => {
        try { _cfg = (await cfgFn({ action: "set", type: t.type, enabled: on })).data; drawCfg(_cfg); toast(on ? "Açıldı" : "Kapatıldı"); }
        catch (e) { revert(); toast(errText(e), { type: "err" }); }
      } });
    const head = h("div", { class: "dk-admin-etk-row dk-admin-etk-cfgrow" },
      h("span", { class: "dk-admin-etk-who" },
        h("span", { class: "dk-admin-etk-n" }, t.label, t.locked ? h("span", { class: "dk-admin-etk-tag" }, "ZORUNLU") : null, (t.title || t.body) ? h("span", { class: "dk-admin-etk-tag" }, "DÜZENLENDİ") : null),
        h("span", { class: "dk-admin-etk-e" }, t.description)),
      t.text !== "none" ? h("button", { type: "button", class: "dk-link dk-admin-etk-edit", onclick: () => { openType = openType === t.type ? null : t.type; drawCfg(_cfg); } }, openType === t.type ? "Kapat" : "Metni düzenle") : null,
      sw);
    if (openType !== t.type) return head;
    const ti = dkInput({ size: 40, maxlength: TITLE_MAX, value: t.title || "", placeholder: t.defaultTitle });
    const bi = t.text === "both" ? dkTextarea({ rows: 2, maxlength: BODY_MAX, value: t.body || "", placeholder: t.defaultBody }) : null;
    const save = dkButton("Kaydet", { variant: "violet", size: 36 });
    const reset = dkButton("Varsayılana dön", { variant: "outline", size: 36 });
    save.addEventListener("click", async () => {
      try { _cfg = (await cfgFn({ action: "set", type: t.type, title: ti.value.trim() || null, ...(bi ? { body: bi.input.value.trim() || null } : {}) })).data; openType = null; drawCfg(_cfg); toast("Kaydedildi"); }
      catch (e) { toast(errText(e), { type: "err" }); }
    });
    reset.addEventListener("click", async () => {
      try { _cfg = (await cfgFn({ action: "reset", type: t.type })).data; openType = null; drawCfg(_cfg); toast("Varsayılana döndü"); }
      catch (e) { toast(errText(e), { type: "err" }); }
    });
    return h("div", { class: "dk-admin-etk-cfgopen" }, head,
      h("div", { class: "dk-admin-etk-fld" }, h("span", { class: "dk-admin-etk-lbl" }, "BAŞLIK"), ti),
      bi ? h("div", { class: "dk-admin-etk-fld" }, h("span", { class: "dk-admin-etk-lbl" }, "METİN"), bi) : null,
      h("span", { class: "dk-admin-etk-sum" }, "Boş bırakırsan varsayılan metin kullanılır. {ad} gibi yer tutucular otomatik doldurulur."),
      h("div", { class: "dk-admin-etk-tools" }, save, reset));
  }
  let _cfg = null;
  async function loadCfg() {
    cfgBox.replaceChildren(dkSkeleton({ w: 240, h: 14 }), dkSkeleton({ w: 200, h: 14 }));
    try { _cfg = (await cfgFn({ action: "get" })).data; if (alive) drawCfg(_cfg); }
    catch (e) {
      console.error(e);
      if (!alive) return;
      cfgBox.replaceChildren(h("span", { class: "dk-admin-etk-sum", role: "alert" }, errText(e)),
        dkButton("Tekrar dene", { variant: "outline", size: 36, icon: "refresh", onClick: loadCfg }));
    }
  }
  const cfgCard = h("section", { class: "dk-admin-panel-card dk-admin-etk-card", "aria-label": "Otomatik bildirimler" },
    h("div", { class: "dk-admin-etk-ch" }, h("span", { class: "dk-admin-panel-deb" }, "OTOMATİK BİLDİRİMLER")),
    h("span", { class: "dk-admin-etk-sum dk-admin-etk-pad" }, "Uygulamanın kendiliğinden gönderdiği bildirimler. Kapatırsan o tür hiç gönderilmez; zorunlu olanlar kapatılamaz."),
    cfgBox);

  root.append(hero, h("div", { class: cx("dk-admin-panel-grid", "dk-admin-etk-g2") }, h("div", { class: "dk-admin-etk-col" }, form, cfgCard), histCard));
  drawAudience(); drawPreview();
  if (uid) { loadHistory(); loadCfg(); }

  return {
    node: shell.node,
    onSession(ns) { return !!ns?.user && ns.user.uid === uid && !!ns.isAdmin; },
    destroy() { alive = false; shell.destroy(); },
  };
}
