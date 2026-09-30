// seo-events.js — şehir SEO sayfası "Bu hafta" (WebSehir #bu-hafta + hero CityWeekCard satırları).
// assets/seo.js boşta <script type="module"> olarak ekler. Statik HTML veri olmadan eksiksizdir; burada yalnız
// gerçek etkinlikler (Firestore events, status == "upcoming") şehre + 7 güne göre süzülüp çizilir.
// Erişim: events okuma kuralı isSignedIn() → oturum yoksa SPA'daki gibi anonim (misafir) oturum açılır.
// Yazma YOK. Veri yoksa / hata olursa bölüm gizli kalır (sessiz; konsola yalnız bilgi notu).
// TODO(backend): herkese açık, denormalize bir şehir akışı (ör. publicCityFeed/{slug}) gelince anonim oturum + tüm
// yaklaşan etkinlikleri okuma yerine o belge okunmalı (spec seo.md WebSehir §9).
import { auth, onAuthStateChanged, signInAnonymously } from "/js/firebase.js";
import { discoverEvents } from "/js/data.js";
import { fold, isWithinDays, isToday, isTomorrow, DAYS_TR_SHORT, MONTHS_TR_SHORT, trUpper, fmtPrice, fmtTime, eventStartMs, initials } from "/js/desktop/shared/helpers.js";
import { genreColor, genreGrad, primaryGenre } from "/js/desktop/shared/genres.js";

const sec = document.querySelector("[data-gb-events]");
const card = document.querySelector("[data-gb-wk]");
const MAX_GRID = 4, MAX_ROWS = 3;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svgArrow = (size) => {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", "M5 12h14M13 6l6 6-6 6");
  s.append(p);
  return s;
};
const safeImg = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
const whenLabel = (ms) => `${isToday(ms) ? "BUGÜN" : isTomorrow(ms) ? "YARIN" : trUpper(DAYS_TR_SHORT[new Date(ms).getDay()])} ${fmtTime(ms)}`;
const subLine = (e) => [e.artistName, e.venueName].map((x) => String(x || "").trim()).filter(Boolean).join(" · ");

function eventCard(e) {
  const ms = eventStartMs(e);
  const g = primaryGenre(e);
  const a = el("a", "gb-ev gb-card");
  a.href = "/#/etkinlik/" + encodeURIComponent(e.id);
  const media = el("span", "gb-ev-media");
  const src = safeImg(e.bannerUrl);
  const ph = () => { const p = el("span", "gb-ev-ph"); p.style.background = genreGrad(g, 150); p.setAttribute("aria-hidden", "true"); p.append(el("span", null, initials(e.title || "GigBridge"))); return p; };
  if (src) {
    const img = el("img");
    img.src = src; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.width = 400; img.height = 188;
    img.addEventListener("error", () => img.replaceWith(ph()), { once: true });
    media.append(img);
  } else media.append(ph());
  const date = el("span", "gb-ev-date");
  const dt = new Date(ms);
  date.append(el("span", "gb-ev-dd", String(dt.getDate())), el("span", "gb-ev-mm", trUpper(MONTHS_TR_SHORT[dt.getMonth()])));
  media.append(date);
  const body = el("span", "gb-ev-body");
  const meta = el("span", "gb-ev-meta");
  meta.style.setProperty("--c", genreColor(g));
  meta.append(el("span", "gb-dot"), el("span", null, [trUpper(g), whenLabel(ms)].filter(Boolean).join(" · ")));
  const foot = el("span", "gb-ev-foot");
  const more = el("span", "gb-ev-more", "Detay");
  more.append(svgArrow(14));
  foot.append(el("span", "gb-ev-price", fmtPrice(e.ticketPrice)), more);
  body.append(meta, el("span", "gb-ev-title", e.title || "Etkinlik"));
  const sub = subLine(e);
  if (sub) body.append(el("span", "gb-ev-sub", sub));
  body.append(foot);
  a.append(media, body);
  return a;
}

function weekRow(e) {
  const ms = eventStartMs(e);
  const row = el("span", "gb-wk-row");
  const dot = el("span", "gb-wk-dot");
  dot.style.background = genreColor(primaryGenre(e));
  const txt = el("span", "gb-wk-txt");
  txt.append(el("span", "gb-wk-t", e.title || "Etkinlik"));
  const sub = subLine(e);
  if (sub) txt.append(el("span", "gb-wk-s", sub));
  row.append(dot, txt, el("span", "gb-wk-when", whenLabel(ms)));
  return row;
}

async function ensureUser() {
  const u = await new Promise((res) => { const off = onAuthStateChanged(auth, (x) => { off(); res(x); }); });
  if (u) return u;
  return (await signInAnonymously(auth)).user;
}

async function main() {
  const city = sec.dataset.city || "";
  const district = sec.dataset.district || "";
  const want = fold(district || city);
  if (!want) return false;
  await ensureUser();
  const list = (await discoverEvents()).filter((e) => {
    const ms = eventStartMs(e);
    if (ms == null || !isWithinDays(ms, 7)) return false;
    if (district) return fold(e.district || e.location?.district) === want;
    return fold(e.city || e.location?.city) === want;
  });
  if (!list.length) return false;
  const grid = sec.querySelector("[data-gb-ev-grid]");
  grid.replaceChildren(...list.slice(0, MAX_GRID).map(eventCard));
  if (card) {
    const rows = card.querySelector("[data-gb-wk-rows]");
    rows.replaceChildren(...list.slice(0, MAX_ROWS).map(weekRow));
    const badge = card.querySelector("[data-gb-wk-badge]");
    if (badge?.dataset.week) badge.textContent = badge.dataset.week;
  }
  sec.hidden = false;
  window.__gbRenumber?.();
  return true;
}

if (sec) main().catch((err) => { console.info("[seo] Bu hafta etkinlikleri yüklenemedi:", err?.code || err?.message || err); });
