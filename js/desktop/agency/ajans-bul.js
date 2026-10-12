// AJANS BUL — mekan (#/venue/ajans), organizatör (#/organizer/ajans), sanatçı (#/artist/ajans) panellerinde (≥769 px).
// Registry anahtarları: venueAjans · orgAjans · artistAjans (rol = ctx.route.role). CSS: css/dk-ajans.css (.dk-ag-*).
// Tasarım tuvalinde ajans ekranı YOK → organizer/mekan-sec.js kart ızgarası + ortak kit (dkChip süzgeçleri, dkDrawer ayrıntısı,
// dkModal fotoğraf görüntüleyici). Onaylı ajanslar (listAgencies: approved≠false, rejected/banned/pendingDeletion değil), ad/şehir araması
// (üst bar araması), şehir seçimi, hizmet çipleri (hazır 3 + verideki özel hizmetler). Kart → ayrıntı çekmecesi (?id=): hakkında,
// hizmetler, telefon, YAYINDAKİ ilanlar (listAgencyItems — active:true sorgusu; kural gereği) + galeri (tıkla → büyük görünüm),
// fiyat metni, "Mesaj gönder" (birebir DM; ilan satırından «İlan» hakkında hazır mesajla).
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { panelShell } from "../shared/panel-shell.js";
import { svgIcon } from "../shared/icons.js";
import { cx, dkButton, dkChip, dkSelect, dkPageHero, dkEmpty, dkSkeleton, dkDrawer, dkAvatar } from "../shared/ui.js";
import { fold, sortTR, writeQuery, roleColor } from "../shared/helpers.js";
import {
  AGENCY_COLOR, SERVICE_PRESETS, listAgencies, getAgency, listAgencyItems, activeItemCounts, priceText, serviceLabel, isPresetService,
} from "../../agency-data.js";
import { serviceTag, serviceIco, openAgencyChat, openPhotoViewer, itemThumb } from "./common.js";

export const NOT_READY = false;

const P = "dk-ag";
const k = (s) => `${P}-${s}`;
const ico = (name, size, o = {}) => svgIcon(name, { size, ...o });
const telHref = (v) => { const d = String(v || "").replace(/[^\d+]/g, ""); return d.length >= 7 ? `tel:${d}` : null; };
const SUB = { artist: "Sanatçı Paneli · Fotoğraf, ışık ve cihaz kiralama ajansları" };

export function ajansBulView(ctx) {
  const role = ["venue", "organizer", "artist"].includes(ctx.route?.role) ? ctx.route.role : "venue";
  const C = roleColor(role);
  let alive = true;
  const S = { all: [], counts: new Map(), loading: true, error: false, q: "", city: "", svc: "", openId: null };
  let drawer = null, drawerId = null;

  const readQuery = (q) => {
    S.q = q?.get("q") || "";
    S.city = q?.get("sehir") || "";
    S.svc = q?.get("hizmet") || "";
    S.openId = q?.get("id") || null;
  };
  readQuery(ctx.query);

  const shell = panelShell({
    role, active: ctx.route?.nav || "ajans", title: "Ajans Bul", crumb: "Ajans Bul", subtitle: SUB[role], ctx,
    search: { placeholder: "Ajans adı ya da şehir ara", value: S.q, onInput: (q) => { S.q = q; writeQuery({ q: q.trim() || null }); drawGrid(); }, onSubmit: (q) => { S.q = q; drawGrid(); } },
  });
  const root = shell.content;
  root.classList.add(P, k("find"));

  // ═════════ HERO ═════════
  root.append(dkPageHero({
    eyebrow: "AJANS BUL", title: "Etkinliğin için ", em: "ekip", tail: " bul.",
    lead: "Fotoğraf çekimi, sahne ışığı ve cihaz kiralama ajanslarının kataloglarına göz at; fiyatları gör, doğrudan mesaj at.",
    color: C, cls: k("hero"),
  }));

  // ═════════ SÜZGEÇLER ═════════
  const citySelWrap = dkSelect({ options: [{ value: "", label: "Tüm şehirler" }], value: "", size: 40, attrs: { "aria-label": "Şehir" }, cls: k("city"),
    onChange: (v) => { S.city = v; writeQuery({ sehir: v || null }); drawGrid(); } });
  const citySel = citySelWrap.querySelector("select");
  const chips = h("div", { class: k("cats"), role: "group", "aria-label": "Hizmet" });
  const countEl = h("span", { class: k("count"), "aria-live": "polite" });
  root.append(h("div", { class: k("tool") }, chips, citySelWrap, countEl));
  const grid = h("div", { class: k("agrid"), "aria-label": "Ajanslar" });
  root.append(grid);

  // hizmet anahtarı karşılaştırması: hazır anahtar birebir, özel hizmet adı büyük/küçük harf duyarsız
  const svcKey = (x) => (isPresetService(x) ? x : "c:" + fold(x));
  function drawFilters() {
    // şehirler: yüklenen ajanslardan (tekil, TR sıralı) + URL'deki şehir
    const cities = [...new Map(S.all.filter((a) => a.city).map((a) => [fold(a.city), a.city])).values()].sort(sortTR);
    if (S.city && !cities.some((c) => fold(c) === fold(S.city))) cities.push(S.city);
    const want = cities.join("|");
    if (citySel.dataset.opts !== want) {
      citySel.replaceChildren(h("option", { value: "" }, "Tüm şehirler"), ...cities.map((c) => h("option", { value: c }, c)));
      citySel.dataset.opts = want;
    }
    citySel.value = cities.find((c) => fold(c) === fold(S.city)) || "";
    // hizmet çipleri: hazır 3 + verideki özel hizmetler (tekil, en çok 8)
    const custom = new Map();
    S.all.forEach((a) => a.services.forEach((x) => { if (!isPresetService(x) && !custom.has(svcKey(x))) custom.set(svcKey(x), x); }));
    const list = [...SERVICE_PRESETS.map((p) => p.key), ...[...custom.values()].sort(sortTR).slice(0, 8)];
    chips.replaceChildren(
      dkChip({ label: "Tümü", size: 32, pressed: !S.svc, onClick: () => { S.svc = ""; writeQuery({ hizmet: null }); drawGrid(); } }),
      ...list.map((x) => dkChip({ label: serviceLabel(x), icon: serviceIco(x, 13), size: 32, pressed: !!S.svc && svcKey(S.svc) === svcKey(x),
        onClick: () => { S.svc = x; writeQuery({ hizmet: x }); drawGrid(); } })));
  }

  const results = () => {
    const q = fold(S.q.trim());
    return S.all.filter((a) =>
      (!S.city || fold(a.city) === fold(S.city)) &&
      (!S.svc || a.services.some((x) => svcKey(x) === svcKey(S.svc))) &&
      (!q || fold([a.name, a.city, ...a.services.map(serviceLabel)].join(" ")).includes(q)));
  };

  function agencyCard(a) {
    const n = S.counts.get(a.id) || 0;
    const shown = a.services.slice(0, 4);
    return h("button", { type: "button", class: cx(k("acard"), "dk-card"), dataset: { id: a.id }, "aria-label": `${a.name} ajansının ayrıntısı`, onclick: () => openDetail(a.id) },
      h("span", { class: k("ahead") },
        dkAvatar({ name: a.name, photo: a.photoURL, size: 56, type: "agency", radius: 12 }),
        h("span", { class: k("acol") },
          h("span", { class: k("aname") }, a.name),
          h("span", { class: k("ameta") }, ico("pin", 13, { color: "#4ED8FF" }), a.city || "Şehir belirtilmemiş"))),
      h("span", { class: k("tags") }, ...shown.map((x) => serviceTag(x)), a.services.length > shown.length ? h("span", { class: k("more-n") }, `+${a.services.length - shown.length}`) : null),
      h("span", { class: k("afoot") },
        h("span", { class: k("acount") }, ico("grid", 13), n ? `${n} ilan` : "Henüz ilan yok"),
        h("span", { class: k("ago"), style: { color: C } }, "İncele", ico("arrowRight", 14))));
  }

  function drawGrid() {
    drawFilters();
    grid.removeAttribute("aria-busy");
    if (S.loading) {
      grid.setAttribute("aria-busy", "true");
      countEl.textContent = "";
      grid.replaceChildren(...Array.from({ length: 6 }, () => h("div", { class: k("skcard"), "aria-hidden": "true" },
        h("div", { class: k("skbody") }, dkSkeleton({ w: 56, h: 56, r: 12 }), dkSkeleton({ w: "70%", h: 16 }), dkSkeleton({ w: "50%", h: 13 }), dkSkeleton({ h: 24, r: 12 })))));
      return;
    }
    if (S.error) {
      countEl.textContent = "";
      grid.replaceChildren(dkEmpty({ variant: "dashed", icon: ico("alertCircle", 30, { color: "#5E636D" }), title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip yenile.",
        action: dkButton("Tekrar dene", { variant: "outline", size: 40, onClick: () => load() }), cls: k("empty") }));
      return;
    }
    const list = results();
    countEl.textContent = `${list.length} AJANS`;
    if (!S.all.length) {
      grid.replaceChildren(dkEmpty({ variant: "dashed", icon: ico("agency", 34, { color: "#5E636D", sw: "1.5" }), title: "Henüz onaylı ajans yok", sub: "Fotoğraf, ışık ve cihaz kiralama ajansları onaylandıkça burada listelenir.", cls: k("empty") }));
      return;
    }
    if (!list.length) {
      grid.replaceChildren(dkEmpty({ variant: "dashed", icon: ico("search", 30, { color: "#5E636D" }), title: "Eşleşen ajans yok", sub: "Aramayı ya da süzgeçleri değiştir.", cls: k("empty") }));
      return;
    }
    grid.replaceChildren(...list.map(agencyCard));
  }

  // ═════════ AYRINTI ÇEKMECESİ ═════════
  function itemCard(a, it) {
    const gal = it.photos.length
      ? h("div", { class: k("gal") }, ...it.photos.map((u, i) => h("button", { type: "button", class: cx(k("galbtn"), i === 0 && "is-first", "dk-press"),
          "aria-label": `${it.title} — fotoğraf ${i + 1} / ${it.photos.length}, büyüt`, onclick: () => openPhotoViewer(it.photos, i, it.title) },
        h("img", { src: u, alt: "", loading: "lazy", decoding: "async" }))))
      : itemThumb(null, { cls: k("galnone") });
    const ask = `Merhaba, «${it.title}» hakkında bilgi almak istiyorum.`;
    return h("article", { class: k("ditem") },
      gal,
      h("div", { class: k("dibody") },
        h("span", { class: k("dicat") }, serviceIco(it.category, 12), serviceLabel(it.category)),
        h("h4", { class: k("dititle") }, it.title),
        h("span", { class: cx(k("iprice"), it.price == null && "is-ask") }, priceText(it)),
        it.quantity ? h("span", { class: k("imeta") }, `${it.quantity} adet`) : null,
        it.description ? h("p", { class: k("didesc") }, it.description) : null,
        dkButton("Bu ilan için mesaj gönder", { variant: "outline", size: 36, icon: ico("chatSquare", 15), cls: k("diask"),
          onClick: () => { drawer?.close("chat"); openAgencyChat(role, a.id, a.name, ask); } })));
  }

  async function openDetail(id) {
    if (!id) return;
    if (drawer && drawerId === id) return;
    drawer?.close("replace");
    drawerId = id;
    writeQuery({ id });
    const cached = S.all.find((x) => x.id === id) || null;
    const body = h("div", { class: k("det") }, dkSkeleton({ h: 88, r: 12 }), dkSkeleton({ h: 120, r: 12 }), dkSkeleton({ h: 220, r: 12 }));
    const msgBtn = dkButton("Mesaj gönder", { variant: "role", color: C, size: 44, full: true, icon: ico("chatSquare", 16, { color: "#06070A" }), disabled: true });
    const d = dkDrawer({ eyebrow: "AJANS", eyebrowColor: AGENCY_COLOR, title: cached?.name || "Ajans", body, footer: [msgBtn], width: 600, cls: k("drw"),
      onClose: (reason) => { if (drawer === d) { drawer = null; drawerId = null; if (alive && reason !== "replace" && reason !== "route") writeQuery({ id: null }); } } });
    drawer = d;
    let a, items;
    try {
      [a, items] = await Promise.all([cached ? Promise.resolve(cached) : getAgency(id), listAgencyItems(id)]);
    } catch (e) {
      console.warn("[ajans detay]", e);
      if (drawer !== d) return;
      body.replaceChildren(dkEmpty({ variant: "plain", icon: ico("alertCircle", 28, { color: "#5E636D" }), title: "Yüklenemedi", sub: "Bağlantıyı kontrol edip tekrar dene." }));
      return;
    }
    if (drawer !== d) return;
    if (!a) {
      body.replaceChildren(dkEmpty({ variant: "plain", icon: ico("agency", 28, { color: "#5E636D", sw: "1.6" }), title: "Ajans bulunamadı", sub: "Bu ajans artık listelenmiyor olabilir." }));
      return;
    }
    d.setTitle(a.name);
    msgBtn.disabled = false;
    msgBtn.addEventListener("click", () => { d.close("chat"); openAgencyChat(role, a.id, a.name); });
    const tel = telHref(a.phone);
    body.replaceChildren(
      h("div", { class: k("dhead") },
        dkAvatar({ name: a.name, photo: a.photoURL, size: 72, type: "agency", radius: 14 }),
        h("div", { class: k("dcol") },
          h("span", { class: k("ameta") }, ico("pin", 14, { color: "#4ED8FF" }), a.city || "Şehir belirtilmemiş"),
          a.phone ? h("span", { class: k("ameta") }, ico("phone", 14, { color: "#A3A7AF" }), tel ? h("a", { href: tel, class: "dk-link" }, a.phone) : a.phone) : null,
          h("span", { class: k("ameta") }, ico("grid", 14, { color: "#A3A7AF" }), `${items.length} yayında ilan`))),
      a.services.length ? h("div", { class: k("dsec") }, h("span", { class: k("dlbl") }, "HİZMETLER"), h("div", { class: k("tags") }, ...a.services.map((x) => serviceTag(x, { size: "md" })))) : null,
      a.bio ? h("div", { class: k("dsec") }, h("span", { class: k("dlbl") }, "HAKKINDA"), h("p", { class: k("dbio") }, a.bio)) : null,
      h("div", { class: k("dsec") }, h("span", { class: k("dlbl") }, "KATALOG"),
        items.length ? h("div", { class: k("ditems") }, ...items.map((it) => itemCard(a, it)))
          : h("p", { class: k("muted") }, "Bu ajansın yayında ilanı yok. Hizmetleri için mesaj atabilirsin.")));
  }

  // ═════════ VERİ ═════════
  async function load() {
    S.loading = true; S.error = false; drawGrid();
    try {
      const [all, counts] = await Promise.all([listAgencies(), activeItemCounts().catch(() => new Map())]);
      if (!alive) return;
      S.all = all; S.counts = counts; S.loading = false;
      drawGrid();
    } catch (e) {
      console.warn("[ajans bul]", e);
      if (!alive) return;
      S.loading = false; S.error = true; drawGrid();
    }
  }
  drawGrid();
  load();
  if (S.openId) openDetail(S.openId);

  return {
    node: shell.node,
    update(query) {
      const prevQ = S.q;
      readQuery(query);
      if (S.q !== prevQ && shell.search?.input && document.activeElement !== shell.search.input) shell.search.input.value = S.q;
      drawGrid();
      if (S.openId && S.openId !== drawerId) openDetail(S.openId);
      else if (!S.openId && drawer) drawer.close("route");
    },
    onSession: () => true,
    destroy() {
      alive = false;
      try { drawer?.close("route"); } catch (_) {}
      shell.destroy();
    },
  };
}
