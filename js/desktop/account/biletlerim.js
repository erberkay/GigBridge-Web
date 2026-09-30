// WebBiletlerim — masaüstü görünümü (≥769 px). Registry anahtarı: biletlerim (#/biletlerim).
// Spec: specs/hesap.md § WebBiletlerim (+ Bilet.dc.html / WebBiletlerim.dc.html sahip notları: QR okutma + koçan yırtılma).
// CSS: css/dk-biletlerim.css — tüm seçiciler .dk-biletlerim kökü altında (e-bilet katmanı portalda, kendi .dk-biletlerim kökünde).
//
// Veri (legacy customer.js ticketsView + app TicketsScreen/ETicket/tickets.ts ile AYNI):
//   • Bilet = events/{eventId}/attendees/{uid}. Liste: collectionGroup('attendees').where('userId','==',uid) (mevcut indeks) +
//     üst etkinlik getDoc. data.js attendedEvents attendee alanlarını (ticketStatus/checkedInAt) taşımadığı için sorgu burada.
//   • Yaklaşan = başlangıç yok ya da başlangıç + 6 sa > şimdi (app TICKET_VALID_TAIL_MS); diğerleri Geçmiş.
//   • Canlı check-in: her yaklaşan biletin attendee dokümanı onSnapshot → ticketStatus 'used' + sunucu checkedInAt.
//   • QR: callable getTicketQrToken({eventId}) (europe-west1; js/firebase.js `functions`), 15 sn zaman aşımı, 25 sn'de bir yenile,
//     hata: geçerli token varsa göster + 5 sn sonra dene, yoksa "YENİDEN DENE". Token dizgesi olduğu gibi QR'a (ECL M, sessiz bölge 0);
//     kodlayıcı (qrcode-generator 1.4.4) bu dosyaya gömülü → kapıdaki QR hiçbir üçüncü taraf ağ isteğine bağlı değil.
//     Fonksiyon erişilemezse (emülatör / deploy yok) sahte QR YOK → kesikli "YENİDEN DENE" kutusu + "QR KODU ŞU AN YÜKLENEMİYOR".
//   • Yırtılma animasyonu yalnız sunucu check-in olayıyla oynar (QR'a tıklama YOK); bilet başına bir kez
//     (localStorage "gb_animated_ticket_ids", app ile aynı anahtar/biçim "{eventId}_{uid}", en çok 200).
//   • Bu sayfa Firestore'a YAZMAZ (okuma + callable).
// Sözleşme: biletlerimView(ctx) → { node, destroy(), update(query), onSession(session) }.
import { h } from "../../ui.js";
import { session as storeSession } from "../../store.js";
import { db, functions, collectionGroup, query, where, getDocs, getDoc, doc, onSnapshot } from "../../firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";
import { accountShell } from "../shared/account-shell.js";
import { cx, dkPageHead, dkSegmented, dkEmpty, dkSkeleton, dkButton, portalRoot, eventStatusKey } from "../shared/ui.js";
import { svgIcon, svgRaw } from "../shared/icons.js";
import {
  eventStartMs, fmtTime, fmtDayLabel, isToday, isTomorrow, DAYS_TR_SHORT, MONTHS_TR_SHORT, trUpper, fmtPrice, isFree,
  haversineKm, fmtKm, writeQuery, initials, toMs,
} from "../shared/helpers.js";
import { genreGrad, primaryGenre } from "../shared/genres.js";
import { dateTile, evImage } from "../shared/cards.js";

const P = "dk-biletlerim-";
const TICKET_VALID_TAIL_MS = 6 * 3600 * 1000;

// ── Artboard ikonları (WebBiletlerim.dc.html gövdeleri birebir) ──
const I_CLOCK = '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>';
const I_PIN = '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"></path><circle cx="12" cy="10" r="2.3"></circle>';
const I_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"></path>';
const I_QR = '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h1M18 14h2"></path>';
const I_STAR = '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>';
const I_X = '<path d="M6 6l12 12M18 6 6 18"></path>';

const pad2 = (n) => String(n).padStart(2, "0");
/** Sunucu check-in zamanı (ms) → yerel "HH:MM" (app formatCheckInClock). */
const clockOf = (ms) => (ms == null || !Number.isFinite(ms) ? "" : `${pad2(new Date(ms).getHours())}:${pad2(new Date(ms).getMinutes())}`);
const monShort = (d) => trUpper(MONTHS_TR_SHORT[d.getMonth()]);

// ── Etkinlik alanları (app TicketsScreen eşlemesi) ──
const tTitle = (e) => e?.title || "Etkinlik";
const tArtist = (e) => e?.artistName ?? e?.artist ?? "";
const tVenue = (e) => e?.venueName ?? e?.venue ?? "";
const tSub = (e) => [tArtist(e), tVenue(e)].filter(Boolean).join(" · ") || "—";
const tPrice = (e) => e?.ticketPrice ?? e?.price;
// Tür etiketi büyük harf — kelime bazında (app src/utils/genreLabel.ts birebir): İngilizce "Electronic" → "ELECTRONIC"
// (tr-TR "ELECTRONİC" yapardı), Türkçe "Akustik" → "AKUSTİK" (en-US "AKUSTIK" yapardı).
// SHARED-CANDIDATE: genres.js genreLabel tüm türleri trUpper ile çeviriyor → "ELECTRONİC"/"MELODİC TECHNO"; app ile aynı
//   kelime bazlı kurala geçmeli (artboard "ELECTRONIC · TREND"). Paylaşılan düzeltme gelene dek yerel.
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_ASCII_WORDS = new Set(["akustik", "klasik", "alternatif", "elektronik", "enstrumantal", "ilahi"]);
const isTurkishWord = (w) => TR_LETTERS.test(w) || TR_ASCII_WORDS.has(w.toLocaleLowerCase("en-US"));
const genreUpper = (g) => (g ? String(g).replace(/[^\s\-/&+.,]+/g, (w) => w.toLocaleUpperCase(isTurkishWord(w) ? "tr-TR" : "en-US")) : "");
// Kart üst satırı: "JAZZ · YENİ" / "ELECTRONIC · TREND" / "POP" (tek kısa etiket; legacy statusBadge önceliği)
const TAGS = { busy: "TREND", popular: "TREND", new: "YENİ", vipEvent: "VIP" };
function kicker(e) {
  const g = genreUpper(primaryGenre(e));
  const tag = TAGS[eventStatusKey(e)] || null;
  return [g || null, tag].filter(Boolean).join(" · ") || "ETKİNLİK";
}
// Başlangıç saati = etkinliğin KENDİ yerel saati (app TicketsScreen `startTime ?? time`, legacy eventWhen, spec timeLabel
// "startTime||—"); yoksa eventStartMs'ten tarayıcı saatiyle. Böylece Türkiye dışı saat dilimindeki tarayıcıda (ör. Bodrum'daki
// turist, Europe/London) bilet "21:00" yerine "19:00" göstermez; kart, rozet ve e-bilet aynı saati söyler.
// SHARED-CANDIDATE: cards.js / helpers fmtTime(eventStartMs) tarayıcı saat dilimiyle biçimliyor; etkinlik saatleri (ve Bugün/Yarın
//   gün sınırları) site genelinde Europe/Istanbul'da biçimlenmeli (Intl timeZone). Gün etiketleri burada hâlâ tarayıcı yerel.
const HHMM = /^(\d{1,2})[:.](\d{2})$/;
function evClock(e, s = eventStartMs(e)) {
  const raw = [e?.startTime, e?.time].find((x) => typeof x === "string" && x.trim())?.trim() || "";
  const m = HHMM.exec(raw);
  if (m && +m[1] < 24 && +m[2] < 60) return `${pad2(+m[1])}:${m[2]}`;
  return s != null ? fmtTime(s) : raw;
}
// "Bugün 21:00" / "Yarın 22:00" / "Paz 4 Eki 20:00"
function whenLong(e) {
  const s = eventStartMs(e);
  if (s == null) return [e?.date, e?.startTime].filter((x) => typeof x === "string" && x).join(" ") || "Tarih yok";
  return `${fmtDayLabel(s)} ${evClock(e, s)}`;
}
// Görsel üstü durum rozeti: BU GECE / YARIN / "PAZ 20:00"
function statusChip(e, s) {
  if (s == null) return null;
  if (isToday(s)) return { label: "BU GECE", fg: "#FF5A6E", bd: "rgba(255,90,110,0.5)" };
  if (isTomorrow(s)) return { label: "YARIN", fg: "#FF4FA3", bd: "rgba(255,79,163,0.5)" };
  return { label: `${trUpper(DAYS_TR_SHORT[new Date(s).getDay()])} ${evClock(e, s)}`, fg: "#A3A7AF", bd: "#2C303A" };
}
// Geçmiş: "CMT 19 EYL · 21:00"
function whenPast(e) {
  const s = eventStartMs(e);
  if (s == null) return trUpper(e?.date || "TARİH YOK");
  const d = new Date(s);
  return `${trUpper(DAYS_TR_SHORT[d.getDay()])} ${d.getDate()} ${monShort(d)} · ${evClock(e, s)}`;
}

// ── Veri ──
// SHARED-CANDIDATE: data.js attendedEvents() attendee alanlarını (ticketStatus/checkedInAt/verified) taşımıyor (spec §7 "extend");
// data.js'e dokunmamak için aynı sorgu (collectionGroup attendees.userId — mevcut indeks) burada, attendee alanlarıyla birlikte.
async function loadTickets(uid) {
  const snap = await getDocs(query(collectionGroup(db, "attendees"), where("userId", "==", uid)));
  const rows = await Promise.all(snap.docs.map(async (d) => {
    const ref = d.ref.parent?.parent;
    if (!ref) return null;
    try {
      const ev = await getDoc(ref);
      if (!ev.exists()) return null;
      const a = d.data() || {};
      return {
        id: ev.id, ...ev.data(), joinedAt: a.joinedAt,
        att: { ticketStatus: a.ticketStatus || null, checkedInAt: toMs(a.checkedInAt), joinedAt: toMs(a.joinedAt), anonymous: !!a.anonymous, verified: !!a.verified, verifiedVia: a.verifiedVia || null },
      };
    } catch (_) { return null; }
  }));
  return rows.filter(Boolean);
}
const initialState = (e) => (e.att?.ticketStatus === "used" ? { status: "used", checkedInAt: e.att.checkedInAt ?? null } : { status: "valid", checkedInAt: null });

/** events/{eventId}/attendees/{uid} canlı dinleyicisi (app subscribeTicket birebir). */
function subscribeTicket(eventId, uid, cb) {
  return onSnapshot(doc(db, "events", eventId, "attendees", uid), (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const used = data?.ticketStatus === "used";
    cb({ status: used ? "used" : "valid", checkedInAt: used ? toMs(data?.checkedInAt) : null });
  }, () => { /* izin/ağ hatası: mevcut durum korunur (app ile aynı) */ });
}

// ── QR token (app src/services/tickets.ts fetchTicketQrToken birebir) ──
const CALL_TIMEOUT_MS = 15000;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
let _getTokenCall = null;
async function fetchTicketQrToken(eventId) {
  if (!_getTokenCall) _getTokenCall = httpsCallable(functions, "getTicketQrToken");
  const res = await withTimeout(_getTokenCall({ eventId }), CALL_TIMEOUT_MS);
  const d = res?.data ?? {};
  return {
    token: typeof d.token === "string" ? d.token : null,
    expiresAt: typeof d.expiresAt === "number" ? d.expiresAt : 0,
    used: d.used === true,
    checkedInAt: typeof d.checkedInAt === "number" ? d.checkedInAt : null,
  };
}
// Hata → ipucu metni. Sunucu (functions/tickets.js getTicketQrToken) yalnız şu kodlarla Türkçe cümle döner; SDK altyapı
// hataları (internal "Response is not valid JSON object." / unavailable / deadline-exceeded / fonksiyon yok → "not-found" tek kelime /
// zaman aşımı) kullanıcıya İngilizce gösterilmez → genel metin.
const SERVER_MSG_CODES = new Set(["invalid-argument", "not-found", "unauthenticated", "failed-precondition", "permission-denied"]);
const QR_FAIL_HINT = "QR KODU ŞU AN YÜKLENEMİYOR";
function tokenErrorHint(e) {
  const code = String(e?.code ?? "").replace(/^functions\//, "");
  const msg = String(e?.message ?? "").trim();
  const bare = !msg || /^[A-Za-z_-]+$/.test(msg);
  if (!SERVER_MSG_CODES.has(code) || bare) return QR_FAIL_HINT;
  return trUpper(msg);
}

// ── QR kodlayıcı: qrcode-generator 1.4.4 — GÖMÜLÜ (vendored) ──
// Kapıdaki giriş QR'ı üçüncü taraf bir ağ isteğine bağlı kalmasın (cdnjs reklam engelleyici / kurum filtresi / erişim sorunu
// ile engellenirse bilet okutulamazdı). Aşağıdaki satır cdnjs dosyasının BİREBİR, değiştirilmemiş kopyasıdır:
//   https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js
//   sha512-ZDSPMa/JM1D+7kdg2x3BsruQ6T/JpJo3jWDWkCZsP+5yVyp1KfESqLI+7RqB5k24F7p2cV7i2YHh/890y6P6Sw== (20 387 bayt)
// İlk bilet açılışında bir kez değerlendirilir. UMD kuyruğu (define/exports) parametrelerle gölgelenir → global'e dokunmaz.
// SHARED-CANDIDATE: başka görünümler (ör. görevli tarayıcısı) de QR üretecekse js/vendor/qrcode.min.js olarak ayrılmalı.
//---------------------------------------------------------------------
// QR Code Generator for JavaScript
// Copyright (c) 2009 Kazuhiko Arase
// URL: http://www.d-project.com/
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
// The word 'QR Code' is registered trademark of DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//---------------------------------------------------------------------
let _qrcode = null;
function qrLib() {
  if (_qrcode) return _qrcode;
  // eslint-disable-next-line
  _qrcode = (function (define, exports, module) {
var qrcode=function(){function i(t,r){function a(t,r){g=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(l=4*u+17),e(0,0),e(l-7,0),e(0,l-7),i(),o(),v(t,r),7<=u&&h(t),null==n&&(n=w(u,f,c)),d(n,r)}var u=t,f=y[r],g=null,l=0,n=null,c=[],s={},e=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||l<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||l<=r+n||(g[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},o=function(){for(var t=8;t<l-8;t+=1)null==g[t][6]&&(g[t][6]=t%2==0);for(var r=8;r<l-8;r+=1)null==g[6][r]&&(g[6][r]=r%2==0)},i=function(){for(var t=B.getPatternPosition(u),r=0;r<t.length;r+=1)for(var e=0;e<t.length;e+=1){var n=t[r],o=t[e];if(null==g[n][o])for(var i=-2;i<=2;i+=1)for(var a=-2;a<=2;a+=1)g[n+i][o+a]=-2==i||2==i||-2==a||2==a||0==i&&0==a}},h=function(t){for(var r=B.getBCHTypeNumber(u),e=0;e<18;e+=1){var n=!t&&1==(r>>e&1);g[Math.floor(e/3)][e%3+l-8-3]=n}for(e=0;e<18;e+=1){n=!t&&1==(r>>e&1);g[e%3+l-8-3][Math.floor(e/3)]=n}},v=function(t,r){for(var e=f<<3|r,n=B.getBCHTypeInfo(e),o=0;o<15;o+=1){var i=!t&&1==(n>>o&1);o<6?g[o][8]=i:o<8?g[o+1][8]=i:g[l-15+o][8]=i}for(o=0;o<15;o+=1){i=!t&&1==(n>>o&1);o<8?g[8][l-o-1]=i:o<9?g[8][15-o-1+1]=i:g[8][15-o-1]=i}g[l-8][8]=!t},d=function(t,r){for(var e=-1,n=l-1,o=7,i=0,a=B.getMaskFunction(r),u=l-1;0<u;u-=2)for(6==u&&(u-=1);;){for(var f=0;f<2;f+=1)if(null==g[n][u-f]){var c=!1;i<t.length&&(c=1==(t[i]>>>o&1)),a(n,u-f)&&(c=!c),g[n][u-f]=c,-1==(o-=1)&&(i+=1,o=7)}if((n+=e)<0||l<=n){n-=e,e=-e;break}}},w=function(t,r,e){for(var n=b.getRSBlocks(t,r),o=M(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=C(i[u],l.getLength()-1).mod(l);a[u]=new Array(l.getLength()-1);for(g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=0<=s?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};s.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=x(t);break;case"Alphanumeric":e=m(t);break;case"Byte":e=L(t);break;case"Kanji":e=D(t);break;default:throw"mode:"+r}c.push(e),n=null},s.isDark=function(t,r){if(t<0||l<=t||r<0||l<=r)throw t+","+r;return g[t][r]},s.getModuleCount=function(){return l},s.make=function(){if(u<1){for(var t=1;t<40;t++){for(var r=b.getRSBlocks(t,f),e=M(),n=0;n<c.length;n++){var o=c[n];e.put(o.getMode(),4),e.put(o.getLength(),B.getLengthInBits(o.getMode(),t)),o.write(e)}var i=0;for(n=0;n<r.length;n++)i+=r[n].dataCount;if(e.getLengthInBits()<=8*i)break}u=t}a(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){a(!0,e);var n=B.getLostPoint(s);(0==e||n<t)&&(t=n,r=e)}return r}())},s.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<s.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<s.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=s.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},s.createSvgTag=function(t,r,e,n){var o={};"object"==typeof t&&(t=(o=t).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,f,c=s.getModuleCount()*t+2*r,g="";for(f="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",g+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',g+=o.scalable?"":' width="'+c+'px" height="'+c+'px"',g+=' viewBox="0 0 '+c+" "+c+'" ',g+=' preserveAspectRatio="xMinYMin meet"',g+=n.text||e.text?' role="img" aria-labelledby="'+p([n.id,e.id].join(" ").trim())+'"':"",g+=">",g+=n.text?'<title id="'+p(n.id)+'">'+p(n.text)+"</title>":"",g+=e.text?'<description id="'+p(e.id)+'">'+p(e.text)+"</description>":"",g+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',g+='<path d="',a=0;a<s.getModuleCount();a+=1)for(u=a*t+r,i=0;i<s.getModuleCount();i+=1)s.isDark(a,i)&&(g+="M"+(i*t+r)+","+u+f);return g+='" stroke="transparent" fill="black"/>',g+="</svg>"},s.createDataURL=function(o,t){o=o||2,t=void 0===t?4*o:t;var r=s.getModuleCount()*o+2*t,i=t,a=r-t;return I(r,r,function(t,r){if(i<=t&&t<a&&i<=r&&r<a){var e=Math.floor((t-i)/o),n=Math.floor((r-i)/o);return s.isDark(n,e)?0:1}return 1})},s.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=s.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=s.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=p(e),o+='"'),o+="/>"};var p=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return s.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*s.getModuleCount()+2*t,u=t,f=a-t,c={"██":"█","█ ":"▀"," █":"▄","  ":" "},g={"██":"▀","█ ":"▀"," █":" ","  ":" "},l="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<f&&u<=r&&r<f&&s.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<f&&u<=r+1&&r+1<f&&s.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",l+=t<1&&f<=r+1?g[i]:c[i];l+="\n"}return a%2&&0<t?l.substring(0,l.length-a-1)+Array(1+a).join("▀"):l.substring(0,l.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=s.getModuleCount()*t+2*r,u=r,f=a-r,c=Array(t+1).join("██"),g=Array(t+1).join("  "),l="",h="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),h="",n=0;n<a;n+=1)i=1,u<=n&&n<f&&u<=e&&e<f&&s.isDark(o,Math.floor((n-u)/t))&&(i=0),h+=i?c:g;for(o=0;o<t;o+=1)l+=h+"\n"}return l.substring(0,l.length-1)},s.renderTo2dContext=function(t,r){r=r||2;for(var e=s.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=s.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r)},s}i.stringToBytes=(i.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,i.createStringToBytes=function(u,f){var i=function(){function t(){var t=r.read();if(-1==t)throw"eof";return t}for(var r=S(u),e=0,n={};;){var o=r.read();if(-1==o)break;var i=t(),a=t()<<8|t();n[String.fromCharCode(o<<8|i)]=a,e+=1}if(e!=f)throw e+" != "+f;return n}(),a="?".charCodeAt(0);return function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);if(n<128)r.push(n);else{var o=i[t.charAt(e)];"number"==typeof o?(255&o)==o?r.push(o):(r.push(o>>>8),r.push(255&o)):r.push(a)}}return r}};var r,t,a=1,u=2,o=4,f=8,y={L:1,M:0,Q:3,H:2},e=0,n=1,c=2,g=3,l=4,h=5,s=6,v=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],(t={}).getBCHTypeInfo=function(t){for(var r=t<<10;0<=d(r)-d(1335);)r^=1335<<d(r)-d(1335);return 21522^(t<<10|r)},t.getBCHTypeNumber=function(t){for(var r=t<<12;0<=d(r)-d(7973);)r^=7973<<d(r)-d(7973);return t<<12|r},t.getPatternPosition=function(t){return r[t-1]},t.getMaskFunction=function(t){switch(t){case e:return function(t,r){return(t+r)%2==0};case n:return function(t,r){return t%2==0};case c:return function(t,r){return r%3==0};case g:return function(t,r){return(t+r)%3==0};case l:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case h:return function(t,r){return t*r%2+t*r%3==0};case s:return function(t,r){return(t*r%2+t*r%3)%2==0};case v:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},t.getErrorCorrectPolynomial=function(t){for(var r=C([1],0),e=0;e<t;e+=1)r=r.multiply(C([1,w.gexp(e)],0));return r},t.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case o:case f:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case o:return 16;case f:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case o:return 16;case f:return 12;default:throw"mode:"+t}}},t.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);5<i&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},t);function d(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r}var w=function(){for(var r=new Array(256),e=new Array(256),t=0;t<8;t+=1)r[t]=1<<t;for(t=8;t<256;t+=1)r[t]=r[t-4]^r[t-5]^r[t-6]^r[t-8];for(t=0;t<255;t+=1)e[r[t]]=t;var n={glog:function(t){if(t<1)throw"glog("+t+")";return e[t]},gexp:function(t){for(;t<0;)t+=255;for(;256<=t;)t-=255;return r[t]}};return n}();function C(n,o){if(void 0===n.length)throw n.length+"/"+o;var r=function(){for(var t=0;t<n.length&&0==n[t];)t+=1;for(var r=new Array(n.length-t+o),e=0;e<n.length-t;e+=1)r[e]=n[e+t];return r}(),i={getAt:function(t){return r[t]},getLength:function(){return r.length},multiply:function(t){for(var r=new Array(i.getLength()+t.getLength()-1),e=0;e<i.getLength();e+=1)for(var n=0;n<t.getLength();n+=1)r[e+n]^=w.gexp(w.glog(i.getAt(e))+w.glog(t.getAt(n)));return C(r,0)},mod:function(t){if(i.getLength()-t.getLength()<0)return i;for(var r=w.glog(i.getAt(0))-w.glog(t.getAt(0)),e=new Array(i.getLength()),n=0;n<i.getLength();n+=1)e[n]=i.getAt(n);for(n=0;n<t.getLength();n+=1)e[n]^=w.gexp(w.glog(t.getAt(n))+r);return C(e,0).mod(t)}};return i}function p(){var e=[],o={writeByte:function(t){e.push(255&t)},writeShort:function(t){o.writeByte(t),o.writeByte(t>>>8)},writeBytes:function(t,r,e){r=r||0,e=e||t.length;for(var n=0;n<e;n+=1)o.writeByte(t[n+r])},writeString:function(t){for(var r=0;r<t.length;r+=1)o.writeByte(t.charCodeAt(r))},toByteArray:function(){return e},toString:function(){var t="";t+="[";for(var r=0;r<e.length;r+=1)0<r&&(t+=","),t+=e[r];return t+="]"}};return o}var k,A,b=(k=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],(A={}).getRSBlocks=function(t,r){var e=function(t,r){switch(r){case y.L:return k[4*(t-1)+0];case y.M:return k[4*(t-1)+1];case y.Q:return k[4*(t-1)+2];case y.H:return k[4*(t-1)+3];default:return}}(t,r);if(void 0===e)throw"bad rs block @ typeNumber:"+t+"/errorCorrectionLevel:"+r;for(var n,o,i=e.length/3,a=[],u=0;u<i;u+=1)for(var f=e[3*u+0],c=e[3*u+1],g=e[3*u+2],l=0;l<f;l+=1)a.push((n=g,o=void 0,(o={}).totalCount=c,o.dataCount=n,o));return a},A),M=function(){var e=[],n=0,o={getBuffer:function(){return e},getAt:function(t){var r=Math.floor(t/8);return 1==(e[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e+=1)o.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return n},putBit:function(t){var r=Math.floor(n/8);e.length<=r&&e.push(0),t&&(e[r]|=128>>>n%8),n+=1}};return o},x=function(t){var r=a,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+2<r.length;)t.put(o(r.substring(e,e+3)),10),e+=3;e<r.length&&(r.length-e==1?t.put(o(r.substring(e,e+1)),4):r.length-e==2&&t.put(o(r.substring(e,e+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return e},m=function(t){var r=u,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+1<r.length;)t.put(45*o(r.charAt(e))+o(r.charAt(e+1)),11),e+=2;e<r.length&&t.put(o(r.charAt(e)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return e},L=function(t){var r=o,e=i.stringToBytes(t),n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=0;r<e.length;r+=1)t.put(e[r],8)}};return n},D=function(t){var r=f,e=i.stringToBytesFuncs.SJIS;if(!e)throw"sjis not supported.";!function(){var t=e("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=e(t),n={getMode:function(){return r},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return n},S=function(t){var e=t,n=0,o=0,i=0,r={read:function(){for(;i<8;){if(n>=e.length){if(0==i)return-1;throw"unexpected end of file./"+i}var t=e.charAt(n);if(n+=1,"="==t)return i=0,-1;t.match(/^\s$/)||(o=o<<6|a(t.charCodeAt(0)),i+=6)}var r=o>>>i-8&255;return i-=8,r}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return r},I=function(t,r,e){for(var n=function(t,r){var n=t,o=r,l=new Array(t*r),e={setPixel:function(t,r,e){l[r*n+t]=e},write:function(t){t.writeString("GIF87a"),t.writeShort(n),t.writeShort(o),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(n),t.writeShort(o),t.writeByte(0);var r=i(2);t.writeByte(2);for(var e=0;255<r.length-e;)t.writeByte(255),t.writeBytes(r,e,255),e+=255;t.writeByte(r.length-e),t.writeBytes(r,e,r.length-e),t.writeByte(0),t.writeString(";")}},i=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,o=h(),i=0;i<r;i+=1)o.add(String.fromCharCode(i));o.add(String.fromCharCode(r)),o.add(String.fromCharCode(e));var a=p(),u=function(t){var e=t,n=0,o=0,r={write:function(t,r){if(t>>>r!=0)throw"length over";for(;8<=n+r;)e.writeByte(255&(t<<n|o)),r-=8-n,t>>>=8-n,n=o=0;o|=t<<n,n+=r},flush:function(){0<n&&e.writeByte(o)}};return r}(a);u.write(r,n);var f=0,c=String.fromCharCode(l[f]);for(f+=1;f<l.length;){var g=String.fromCharCode(l[f]);f+=1,o.contains(c+g)?c+=g:(u.write(o.indexOf(c),n),o.size()<4095&&(o.size()==1<<n&&(n+=1),o.add(c+g)),c=g)}return u.write(o.indexOf(c),n),u.write(e,n),u.flush(),a.toByteArray()},h=function(){var r={},e=0,n={add:function(t){if(n.contains(t))throw"dup key:"+t;r[t]=e,e+=1},size:function(){return e},indexOf:function(t){return r[t]},contains:function(t){return void 0!==r[t]}};return n};return e}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=p();n.write(a);for(var u=function(){function e(t){a+=String.fromCharCode(r(63&t))}var n=0,o=0,i=0,a="",t={},r=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return t.writeByte=function(t){for(n=n<<8|255&t,o+=8,i+=1;6<=o;)e(n>>>o-6),o-=6},t.flush=function(){if(0<o&&(e(n<<6-o),o=n=0),i%3!=0)for(var t=3-i%3,r=0;r<t;r+=1)a+="="},t.toString=function(){return a},t}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return i}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||57344<=n?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)},function(t){"function"==typeof define&&define.amd?define([],t):"object"==typeof exports&&(module.exports=t())}(function(){return qrcode});
    return qrcode;
  })();
  return _qrcode;
}
// Metin → SVG (125×125, crispEdges, #111214, sessiz bölge 0, ECL M) — yatay koşular tek path (artboard QR path biçimi)
function qrSvg(text) {
  const qr = qrLib()(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      const s0 = c;
      while (c < n && qr.isDark(r, c)) c++;
      d += `M${s0} ${r}h${c - s0}v1h-${c - s0}z`;
    }
  }
  return svgRaw(`<path d="${d}" fill="#111214"></path>`, { size: 125, viewBox: `0 0 ${n} ${n}`, fill: true, color: "#111214", attrs: { "shape-rendering": "crispEdges" } });
}

// ── Animasyon bir kez oynasın (app ile aynı anahtar) ──
const ANIMATED_KEY = "gb_animated_ticket_ids";
const ANIMATED_MAX = 200;
function readAnimated() {
  try { const a = JSON.parse(localStorage.getItem(ANIMATED_KEY) || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch (_) { return []; }
}
const hasAnimatedTicket = (key) => readAnimated().includes(key);
function markTicketAnimated(key) {
  try {
    const ids = readAnimated().filter((x) => x !== key);
    ids.push(key);
    localStorage.setItem(ANIMATED_KEY, JSON.stringify(ids.length > ANIMATED_MAX ? ids.slice(ids.length - ANIMATED_MAX) : ids));
  } catch (_) {}
}

// ── Görsel / yer tutucu ──
function mediaEl(e, cls) {
  const src = evImage(e);
  const ph = () => h("span", { class: cx(P + "ph", cls), style: { background: genreGrad(primaryGenre(e), 150) }, "aria-hidden": "true" },
    h("span", {}, initials(tTitle(e))));
  if (!src) return ph();
  const img = h("img", { src, alt: "", loading: "lazy", decoding: "async", class: cls });
  img.addEventListener("error", () => img.replaceWith(ph()), { once: true });
  return img;
}

// ══════════════════════════════════════════════════════════════════════
// TicketCard (yaklaşan) — WebBiletlerim 205–256
// ══════════════════════════════════════════════════════════════════════
// SHARED-CANDIDATE: TicketCard / PastTicketCard (EventCard varyantları, spec "new") cards.js'te yok → yerel.
let _cardSeq = 0;
function ticketCard(e, st, { index, onOpen }) {
  const s = eventStartMs(e);
  const chip = statusChip(e, s);
  const img = mediaEl(e, P + "img");
  // aria-label (spec "{başlık} biletini aç") görünür metnin yerini aldığı için sanatçı·mekan, zaman/mesafe ve fiyat ya da
  // "GİRİŞ YAPILDI · HH:MM" durumu aria-describedby ile okunur (setState'te fiyat ↔ giriş kimliği değişir).
  const uidp = `dk-bl-c${++_cardSeq}-`;
  const distTxt = h("span", {});
  const dist = h("span", { class: P + "mi", hidden: true }, svgRaw(I_PIN, { size: 14, sw: "1.8", color: "#4ED8FF" }), distTxt);
  const price = h("span", { id: uidp + "p", class: cx(P + "price", isFree(tPrice(e)) && "is-free") }, fmtPrice(tPrice(e)));
  // "GİRİŞ YAPILDI · HH:MM" — parçalı: dar kartta (kap sorgusu) saat ikinci satıra iner, " · " yalnız görsel olarak gizlenir
  // (aria-describedby metni her düzende "GİRİŞ YAPILDI · HH:MM" kalır).
  const usedSep = h("span", { class: P + "used-sep" }, " · ");
  const usedAt = h("span", { class: P + "used-at" });
  const used = h("span", { id: uidp + "u", class: P + "used" }, svgRaw(I_CHECK, { size: 14, sw: "2.4" }),
    h("span", { class: P + "used-t" }, h("span", {}, "GİRİŞ YAPILDI"), usedSep, usedAt));
  const dt = dateTile(s, { variant: "overlay" });
  dt.classList.add(P + "dt");
  const btn = h("button", { type: "button", class: P + "card", "aria-label": `${tTitle(e)} biletini aç` },
    h("span", { class: P + "media" }, img, h("span", { class: P + "shade" }), dt,
      chip ? h("span", { class: P + "chip", style: { color: chip.fg, borderColor: chip.bd } }, chip.label) : null),
    h("span", { class: P + "body" },
      h("span", { class: P + "kick" }, kicker(e)),
      h("span", { class: P + "title" }, tTitle(e)),
      h("span", { id: uidp + "s", class: P + "sub" }, tSub(e)),
      h("span", { id: uidp + "m", class: P + "meta" }, h("span", { class: P + "mi" }, svgRaw(I_CLOCK, { size: 14, sw: "1.8" }), whenLong(e)), dist)),
    h("span", { class: P + "perf", "aria-hidden": "true" }, h("span", { class: P + "notch is-l" }), h("span", { class: P + "notch is-r" })),
    h("span", { class: P + "foot" }, price, used,
      h("span", { class: P + "cta" }, svgRaw(I_QR, { size: 14, sw: "2" }), h("span", { class: P + "cta-t" }, "BİLETİ GÖR"))));
  btn.addEventListener("click", () => onOpen(e, btn));
  const node = h("div", { class: cx(P + "cw", "dk-rise"), style: { "--dk-delay": 140 + 80 * Math.min(index, 8) + "ms" } }, btn);
  const setState = (x) => {
    const isUsed = x.status === "used";
    btn.classList.toggle("is-used", isUsed);
    price.hidden = isUsed;
    used.hidden = !isUsed;
    const at = clockOf(x.checkedInAt);
    usedAt.textContent = at;
    usedAt.hidden = !at;
    usedSep.hidden = !at;
    btn.setAttribute("aria-describedby", [uidp + "s", uidp + "m", uidp + (isUsed ? "u" : "p")].join(" "));
  };
  const setDist = (txt) => { distTxt.textContent = txt || ""; dist.hidden = !txt; };
  setState(st);
  return { node, btn, setState, setDist };
}

// PastTicketCard — WebBiletlerim 258–276
function pastCard(e, st, { index }) {
  const isUsed = st.status === "used";
  return h("div", { class: cx(P + "past", "dk-rise"), style: { "--dk-delay": 100 + 60 * Math.min(index, 8) + "ms" } },
    mediaEl(e, P + "pimg"),
    h("div", { class: P + "pbody" },
      h("span", { class: P + "pwhen" }, whenPast(e)),
      h("span", { class: P + "ptitle" }, tTitle(e)),
      h("span", { class: P + "psub" }, tSub(e))),
    h("div", { class: P + "pfoot" },
      // Süresi dolmuş ama hiç okutulmamış bilet "KULLANILDI" değildir (spec açık soru 3) → "SÜRESİ DOLDU"
      h("span", { class: P + "plbl" }, isUsed ? "KULLANILDI" : "SÜRESİ DOLDU"),
      h("a", { href: "#/katildiklarim?puanla=" + encodeURIComponent(e.id), class: cx(P + "rate", "dk-press"), "aria-label": `${tTitle(e)} etkinliğini puanla` },
        svgRaw(I_STAR, { size: 13, fill: true, attrs: { stroke: "currentColor", "stroke-width": "1.5", "stroke-linejoin": "round" } }), "PUANLA")));
}

// Yükleniyor iskeleti (tasarımda yok): 3 bilet kartı biçiminde
function skeletonCard() {
  return h("div", { class: P + "skel", "aria-hidden": "true" },
    dkSkeleton({ h: 168, r: 0 }),
    h("div", { class: P + "skelbody" }, dkSkeleton({ w: "46%", h: 11, r: 4 }), dkSkeleton({ w: "78%", h: 20, r: 5 }), dkSkeleton({ w: "62%", h: 14, r: 4 }), dkSkeleton({ w: "54%", h: 13, r: 4 })),
    h("span", { class: P + "perf" }),
    h("div", { class: P + "skelfoot" }, dkSkeleton({ w: 56, h: 16, r: 4 }), dkSkeleton({ w: 116, h: 34, r: 4 })));
}

// ══════════════════════════════════════════════════════════════════════
// E-BİLET MODALI — WebBiletlerim 309–416 (Bilet.dc.html ile aynı bileşen; app ETicket.tsx durum makinesi birebir)
//   idle → scanning(0) → confirmed(950) → tearing(1550) → used(3250). Tetik: sunucu check-in (attendee onSnapshot / token used).
// SHARED-CANDIDATE: overlays.js özel (şablonsuz) tam ekran katman kaydı dışa açmıyor (dkModal başlık/kutu şablonlu) → ESC, odak
//   tuzağı, #app inert, kaydırma kilidi, odağı geri verme, "dk:teardown" kapanışı burada yerel.
// ══════════════════════════════════════════════════════════════════════
const T_CONFIRM = 950;
const T_TEAR = 1550;
const T_END = 3250;
const ENTER_MS = 620;
const QR_REFRESH_MS = 25000;
const QR_RETRY_MS = 5000;
const BITS = [
  { x: 24, y: 317, s: 3, d: 140, k: "b" },
  { x: 41, y: 319, s: 2, d: 190, k: "a" },
  { x: 238, y: 318, s: 2.5, d: 470, k: "c" },
  { x: 254, y: 316, s: 3.5, d: 500, k: "a" },
  { x: 266, y: 320, s: 2, d: 530, k: "b" },
  { x: 275, y: 317, s: 3, d: 545, k: "c" },
];
const IDLE_HINT = "GİRİŞTE GÖREVLİYE OKUT";
const USED_HINT = "BU BİLET KULLANILDI";
const FOCUSABLE = 'a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"]),[tabindex]:not([tabindex="-1"])';

function openETicket({ e, uid, initial, onClose }) {
  const eventId = e.id;
  const ticketKey = `${eventId}_${uid}`;
  const openedAt = performance.now();
  const prevFocus = document.activeElement;
  const rmq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduce = !!rmq?.matches;
  let phase = "idle";
  let usedAt = "";
  let usedKnown = false;
  let triggered = false;
  let alive = true;
  let qr = { token: null, error: false, hint: null };
  let qrExp = 0;
  let refreshT = null;
  let wake = null;
  let unsub = () => {};
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); };
  const clearTimers = () => { timers.forEach((id) => clearTimeout(id)); timers.clear(); };
  const stopRefresh = () => { if (refreshT) { clearTimeout(refreshT); refreshT = null; } };

  // ── Gövde (bilgi) ──
  const s = eventStartMs(e);
  const d = s == null ? null : new Date(s);
  const info = {
    genre: kicker(e),
    title: tTitle(e),
    artist: tArtist(e),
    date: d ? `${d.getDate()} ${monShort(d)}` : "—",
    time: evClock(e, s) || "—", // spec timeLabel: startTime || "—" (app ETicket)
    venue: tVenue(e) || "—",
  };
  const sumId = "dk-bl-sum-" + Math.random().toString(36).slice(2, 8);
  const summary = h("span", { id: sumId, class: "dk-sr" },
    [`E-bilet. ${info.title}`, info.artist, `Tarih ${info.date}`, `saat ${info.time}`, `mekan ${info.venue}`].filter(Boolean).join(", "));
  const announcer = h("span", { class: "dk-sr", role: "status", "aria-live": "polite" });

  const heroImg = evImage(e)
    ? h("img", { src: evImage(e), alt: "", decoding: "async" })
    : null;
  const heroFallback = () => h("span", { class: P + "herofb", style: { background: genreGrad(primaryGenre(e), 135) } }, svgIcon("music", { size: 40, color: "rgba(255,255,255,0.85)" }));
  if (heroImg) heroImg.addEventListener("error", () => heroImg.replaceWith(heroFallback()), { once: true });
  const titleEl = h("span", { class: P + "etitle" }, info.title);
  const stamp = h("span", { class: P + "stamp" }, h("span", { class: P + "stamp-t" }, "GİRİŞ YAPILDI"), h("span", { class: P + "stamp-h" }));
  const sheenMain = h("span", { class: P + "sheen", style: { top: "-20px" } });
  const cutMain = h("div", { class: P + "cut-main" },
    h("span", { class: P + "holo", style: { top: "0" } }),
    h("div", { class: P + "paper-main" },
      h("div", { class: P + "hero" }, heroImg || heroFallback(), h("span", { class: P + "badge" }, "GIGBRIDGE · E-BİLET")),
      h("div", { class: P + "head" },
        h("span", { class: P + "egenre" }, info.genre),
        titleEl,
        h("span", { class: P + "eartist" }, info.artist)),
      h("div", { class: P + "info" },
        ...[["TARİH", info.date], ["SAAT", info.time], ["MEKAN", info.venue]].map(([l, v], i) =>
          h("div", { class: P + "icol" }, h("span", { class: P + "ilbl" }, l), h("span", { class: cx(P + "ival", i === 2 && "is-2") }, v))))),
    sheenMain);
  const main = h("div", { class: P + "main" }, cutMain);

  // ── Koçan (QR) ──
  const qrBox = h("div", { class: P + "qr" });
  const qrLabel = h("span", { class: P + "qrlbl" }, "GİRİŞTE OKUT");
  const stub = h("div", { class: P + "stub" },
    h("div", { class: P + "cut-stub" },
      h("span", { class: P + "holo", style: { top: "-314px" } }),
      h("div", { class: P + "paper-stub" }, qrBox, qrLabel),
      h("span", { class: P + "sheen", style: { top: "-334px" } })));
  const perf = h("span", { class: P + "perfline", "aria-hidden": "true" });
  const done = h("div", { class: P + "done", role: "status", "aria-live": "polite" },
    h("span", { class: P + "done-ic" }, svgRaw(I_CHECK, { size: 18, sw: "2.4" })),
    h("span", { class: P + "done-t" }, "GİRİŞ ONAYLANDI"),
    h("span", { class: P + "done-s" }));
  const bitsWrap = BITS.map((b) => h("span", { class: cx(P + "bit", P + "bit-" + b.k), style: { top: b.y + "px", left: b.x + "px", width: b.s + "px", height: b.s + "px", animationDelay: b.d + "ms" } }));
  const float = h("div", { class: P + "float" }, stub, main, perf);
  const fit = h("div", { class: P + "fit" }, h("div", { class: P + "tin" }, float));

  const hint = h("span", { class: P + "hint" }, IDLE_HINT);
  const closeBtn = h("button", { type: "button", class: cx(P + "close", "dk-press"), "aria-label": "E-bileti kapat" }, svgRaw(I_X, { size: 16, sw: "2" }), "KAPAT");
  const bg = h("button", { type: "button", class: P + "bg", "aria-label": "Bileti kapat", tabindex: "-1" });
  const ovl = h("div", { class: cx("dk-biletlerim", P + "ovl"), role: "dialog", "aria-modal": "true", "aria-label": "E-bilet", "aria-describedby": sumId, tabindex: "-1" },
    bg, summary, announcer, fit, h("div", { class: P + "below" }, hint, closeBtn));

  // ── QR alanı içeriği ──
  let qrContent = null;
  const lock = h("span", { class: P + "lock" }, ...["tl", "tr", "bl", "br"].map((k) => h("span", { class: cx(P + "corner", "is-" + k) })));
  const beam = h("span", { class: P + "beam" }, h("span", { class: P + "trail" }));
  const ring = h("span", { class: P + "ring" });
  const pop = h("span", { class: P + "pop" }, svgRaw(I_CHECK, { size: 26, sw: "2.6" }));
  // QR kutusu ile ipucu TEK kaynaktan türetilir: qrFailed() = token alınamadı (qr.error) YA DA kodlama başarısız (encodeFailed).
  // Böylece yenilenen bir token ipucunu "GİRİŞTE GÖREVLİYE OKUT"a döndürürken kutuda "YENİDEN DENE" kalması gibi çelişki olmaz.
  let encodeFailed = false;
  let qrValue = null; // kutuda çizili değer (aynı değer yeniden kodlanmaz)
  const qrFailed = () => !!qr.error || encodeFailed;
  function setQrContent(node) {
    if (qrContent === node) return;
    // odaklı içerik ("YENİDEN DENE") değişirse odak diyalog içinde kalsın (KAPAT) — ör. hata sırasında check-in gelirse
    const hadFocus = !!qrContent?.contains(document.activeElement);
    if (qrContent) qrContent.remove();
    qrContent = node;
    if (node) qrBox.prepend(node);
    if (hadFocus && alive) closeBtn.focus({ preventScroll: true });
  }
  function renderQr() {
    const value = qr.token ?? (usedKnown ? `gigbridge:bilet:kullanildi:${eventId}` : null);
    if (value) {
      if (value === qrValue && qrContent?.classList.contains(P + "qrimg")) { encodeFailed = false; syncWake(); return; }
      let svg = null;
      try { svg = qrSvg(value); } catch (err) { console.warn("[biletlerim] QR kodlanamadı", err?.message || err); }
      if (svg) {
        encodeFailed = false;
        qrValue = value;
        const decorative = !qr.token;
        setQrContent(h("div", decorative
          ? { class: P + "qrimg", "aria-hidden": "true" }
          : { class: P + "qrimg", role: "img", "aria-label": "Giriş QR kodu. Girişte görevliye okut." }, svg));
        syncWake();
        return;
      }
      encodeFailed = true;
    }
    qrValue = null;
    if (qrFailed() && !usedKnown) {
      setQrContent(h("button", { type: "button", class: P + "qrretry", "aria-label": "QR kodu yüklenemedi. Yeniden dene", onclick: retry },
        svgIcon("refresh", { size: 22, color: "#3A3D44" }), h("span", {}, "YENİDEN DENE")));
    } else setQrContent(skeleton());
  }
  const skeleton = () => h("div", { class: P + "qrskel", role: "img", "aria-label": "QR kodu yükleniyor" }, h("span", { class: P + "spin" }));
  function retry() {
    encodeFailed = false;
    qr = { ...qr, error: false, hint: null };
    setQrContent(skeleton()); // odaklı "YENİDEN DENE" çıkar → setQrContent odağı KAPAT'a taşır
    if (!ovl.contains(document.activeElement)) closeBtn.focus({ preventScroll: true });
    render();
    loadToken();
  }

  // ── Durum → DOM (ETicket.tsx bayrakları) ──
  function render() {
    const stubOn = phase !== "used";
    const lockOn = phase === "scanning" || phase === "confirmed" || phase === "tearing";
    const okOn = phase === "confirmed" || phase === "tearing";
    const stampOn = phase === "tearing" || phase === "used";
    const tearing = phase === "tearing";
    if (stubOn && stub.parentNode !== float) float.prepend(stub);
    if (!stubOn && stub.parentNode) stub.remove();
    stub.classList.toggle(P + "tearoff", tearing);
    main.classList.toggle(P + "recoil", tearing);
    if (lockOn && !lock.parentNode) qrBox.append(lock); else if (!lockOn && lock.parentNode) lock.remove();
    if (phase === "scanning" && !beam.parentNode) qrBox.append(beam); else if (phase !== "scanning" && beam.parentNode) beam.remove();
    if (okOn && !ring.parentNode) qrBox.append(ring, pop); else if (!okOn && ring.parentNode) { ring.remove(); pop.remove(); }
    qrBox.classList.toggle("is-ok", okOn);
    qrLabel.textContent = phase === "idle" ? "GİRİŞTE OKUT" : phase === "scanning" ? "OKUNUYOR…" : "OKUNDU";
    qrLabel.classList.toggle("is-strong", okOn);
    perf.style.opacity = stubOn && !tearing ? "1" : "0";
    stamp.lastChild.textContent = usedAt;
    if (stampOn && !stamp.parentNode) cutMain.insertBefore(stamp, sheenMain);
    stamp.classList.toggle(P + "stamp-in", tearing);
    // yeniden ekleme animasyonu baştan başlatır → yalnız bağlı değilse ekle
    if (tearing && !bitsWrap[0].parentNode) float.append(...bitsWrap); else if (!tearing) bitsWrap.forEach((b) => b.remove());
    done.lastChild.textContent = usedAt ? `${usedAt} · İyi eğlenceler!` : "İyi eğlenceler!";
    if (stampOn && !done.parentNode) float.append(done);
    done.classList.toggle("dk-rise", tearing);
    done.classList.toggle(P + "done-in", tearing);
    // artboard: "BU BİLET KULLANILDI" okundu anından (950 ms) itibaren; açılışta zaten kullanılmışsa hemen (okutma oynamayacaksa)
    const showUsed = okOn || phase === "used" || (usedKnown && phase === "idle" && triggered && !timers.size);
    const failed = !usedKnown && phase !== "used" && qrFailed();
    hint.textContent = showUsed ? USED_HINT : failed ? (qr.error && qr.hint) || QR_FAIL_HINT : IDLE_HINT;
    hint.classList.toggle("is-err", failed);
    syncWake();
  }
  const setPhase = (p) => { phase = p; render(); };
  const announce = (t) => { announcer.textContent = ""; setTimeout(() => { if (alive) announcer.textContent = t; }, 60); };

  function goFinal() { clearTimers(); setPhase("used"); }
  function play() {
    clearTimers();
    setPhase("scanning");
    later(T_CONFIRM, () => { setPhase("confirmed"); announce("Giriş onaylandı"); });
    later(T_TEAR, () => setPhase("tearing"));
    later(T_END, () => { setPhase("used"); markTicketAnimated(ticketKey); });
  }
  /** Canlı durum / token yanıtı → 'used' ise BİR KEZ tetikle (tekrar gelen olay yok sayılır). */
  function handleLive(st) {
    if (!alive || st.status !== "used") return;
    if (st.checkedInAt != null) usedAt = clockOf(st.checkedInAt);
    const first = !usedKnown;
    usedKnown = true;
    stopRefresh();
    if (first && !qr.token) renderQr();
    if (triggered) { render(); return; }
    triggered = true;
    if (hasAnimatedTicket(ticketKey)) { goFinal(); return; }
    const start = () => {
      if (reduce) { goFinal(); announce("Giriş onaylandı"); markTicketAnimated(ticketKey); return; }
      play();
    };
    // Açılır açılmaz 'used' geldiyse okutma, bilet gbTicketIn (620 ms) ile yerine oturduktan sonra başlar
    const wait = reduce ? 0 : Math.max(0, ENTER_MS - (performance.now() - openedAt));
    render();
    if (wait > 0) later(wait, start); else start();
  }

  // ── Token yaşam döngüsü ──
  // Tek döngü: her çağrı sıra numarası alır; yalnız EN SON çağrının yanıtı işlenir ve yenileme zamanlayıcısı kurulmadan önce
  // eskisi temizlenir → görünürlük olayı çağrı sürerken gelse de iki paralel 25 sn döngüsü oluşmaz.
  let tokenSeq = 0;
  let tokenInFlight = false;
  const scheduleToken = (ms) => { stopRefresh(); if (alive && !usedKnown) refreshT = setTimeout(loadToken, ms); };
  async function loadToken() {
    stopRefresh();
    if (usedKnown || !alive) return;
    const seq = ++tokenSeq;
    tokenInFlight = true;
    try {
      const r = await fetchTicketQrToken(eventId);
      if (!alive || seq !== tokenSeq) return;
      if (r.used) { handleLive({ status: "used", checkedInAt: r.checkedInAt }); return; }
      if (usedKnown) return; // çağrı sürerken canlı check-in geldi → bu token artık gösterilmez
      qrExp = r.expiresAt;
      qr = { token: r.token, error: r.token == null, hint: r.token == null ? QR_FAIL_HINT : null };
      renderQr();
      render();
      scheduleToken(QR_REFRESH_MS);
    } catch (err) {
      if (!alive || seq !== tokenSeq || usedKnown) return;
      const stale = Date.now() > qrExp;
      if (stale || !qr.token) { qr = { token: null, error: true, hint: tokenErrorHint(err) }; renderQr(); render(); }
      else scheduleToken(QR_RETRY_MS);
    } finally {
      if (seq === tokenSeq) tokenInFlight = false;
    }
  }

  // ── Ekranı açık tut (app'teki parlaklık artırımının web karşılığı): QR gerçekten görünürken ──
  function syncWake() {
    const want = alive && phase === "idle" && !usedKnown && !!qr.token && document.visibilityState === "visible";
    if (want && !wake && navigator.wakeLock?.request) {
      wake = navigator.wakeLock.request("screen").then((w) => { if (!alive || !wake) { w.release().catch(() => {}); return null; } return w; }).catch(() => null);
    } else if (!want && wake) {
      const p = wake; wake = null;
      p.then((w) => w?.release().catch(() => {}));
    }
  }

  // ── Katman: ESC / odak tuzağı / inert / kaydırma kilidi ──
  const app = document.getElementById("app");
  const appWasInert = app?.hasAttribute("inert");
  const de = document.documentElement;
  const sbw = window.innerWidth - de.clientWidth;
  const saved = { o: de.style.overflow, p: document.body.style.paddingRight };
  function onKey(ev) {
    if (ev.defaultPrevented) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close("esc"); return; }
    if (ev.key !== "Tab") return;
    const f = [...ovl.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!f.length) { ev.preventDefault(); ovl.focus({ preventScroll: true }); return; }
    const first = f[0], last = f[f.length - 1];
    const ae = document.activeElement;
    const inside = ovl.contains(ae) && ae !== ovl;
    if (ev.shiftKey && (ae === first || !inside)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (ae === last || !inside)) { ev.preventDefault(); first.focus(); }
  }
  const onVis = () => {
    // sekme geri geldi → token'ı tazele (çağrı zaten sürüyorsa onun yanıtı yeterince taze)
    if (document.visibilityState === "visible" && !usedKnown && !tokenInFlight) loadToken();
    wake = null; // sekme gizlenince tarayıcı kilidi zaten bırakır
    syncWake();
  };
  const onMotion = (ev) => {
    reduce = !!ev.matches;
    if (reduce && (phase === "scanning" || phase === "confirmed" || phase === "tearing")) {
      if (phase === "scanning") announce("Giriş onaylandı");
      goFinal();
      markTicketAnimated(ticketKey);
    }
  };
  const onResize = () => {
    // küçük ekranda bileti sığdır (app `fit`): (yükseklik − 32 − 22 − 44) / 540, [0.6, 1]
    const raw = (window.innerHeight - 32 - 22 - 44) / 540;
    const f = Math.min(1, Math.max(0.6, raw));
    ovl.style.setProperty("--dk-biletlerim-fit", String(f));
    // 0.6 da sığmıyorsa (≈ < 422 px yükseklik; yatay telefon / küçük pencere) katman üstten başlar ve kayar → KAPAT erişilebilir
    ovl.classList.toggle(P + "scroll", raw < 0.6);
  };
  const onTeardown = (ev) => { const r = ev.detail?.reason; if (r === "mode" || r === "identity") close("teardown"); };

  let closed = false;
  function close(reason = "close") {
    if (closed) return;
    closed = true;
    alive = false;
    clearTimers();
    stopRefresh();
    try { unsub(); } catch (_) {}
    syncWake();
    if (wake) { const p = wake; wake = null; p.then((w) => w?.release().catch(() => {})); }
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("dk:teardown", onTeardown);
    try { rmq?.removeEventListener?.("change", onMotion); } catch (_) {}
    if (app && !appWasInert) app.removeAttribute("inert");
    de.style.overflow = saved.o; document.body.style.paddingRight = saved.p;
    ovl.remove();
    try { if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === "function") prevFocus.focus({ preventScroll: true }); } catch (_) {}
    onClose?.(reason);
  }
  // Çift tık / çift dokunuş: kartı açan ilk tıktan hemen sonra gelen ikinci tık artık zemine düşer → açılıştan sonraki
  // kısa pencerede zemin tıkı yok sayılır (ESC / KAPAT her zaman çalışır).
  const BG_GUARD_MS = 500;
  bg.addEventListener("click", (ev) => {
    if (performance.now() - openedAt < BG_GUARD_MS) { ev.preventDefault(); return; }
    close("backdrop");
  });
  closeBtn.addEventListener("click", (ev) => {
    // aynı çift tıkın ikinci tıkı KAPAT'ın üstüne denk gelebilir (işaretçi tıkı: detail > 0; klavye Enter/Space: 0)
    if (ev.detail > 0 && performance.now() - openedAt < BG_GUARD_MS) return;
    close("x");
  });

  // ── Aç ──
  onResize();
  render();
  renderQr();
  portalRoot().append(ovl);
  if (app) app.setAttribute("inert", "");
  de.style.overflow = "hidden";
  if (sbw > 0) document.body.style.paddingRight = sbw + "px";
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("resize", onResize);
  window.addEventListener("dk:teardown", onTeardown);
  try { rmq?.addEventListener?.("change", onMotion); } catch (_) {}
  requestAnimationFrame(() => { if (alive) closeBtn.focus({ preventScroll: true }); });
  // Başlık tek satır, sığmazsa küçülür (app adjustsFontSizeToFit, minimumFontScale 0.7)
  const fitTitle = () => {
    if (!alive) return;
    let size = 27;
    titleEl.style.fontSize = "";
    while (titleEl.scrollWidth > titleEl.clientWidth + 0.5 && size > 27 * 0.7) { size -= 0.5; titleEl.style.fontSize = size + "px"; }
  };
  requestAnimationFrame(fitTitle);
  document.fonts?.ready?.then(fitTitle).catch(() => {});

  // Canlı bilet durumu (görevli okuttuğu an ticketStatus:'used')
  if (initial?.status === "used") handleLive(initial);
  unsub = subscribeTicket(eventId, uid, handleLive);
  loadToken();

  return { close, eventId };
}

// ══════════════════════════════════════════════════════════════════════
// Görünüm
// ══════════════════════════════════════════════════════════════════════
export function biletlerimView(ctx) {
  const sess = ctx?.session || storeSession;
  const uid = sess.user && !sess.guest ? sess.user.uid : null;
  const sessKey = (x) => `${x?.user?.uid || ""}|${x?.guest ? 1 : 0}|${x?.user?.emailVerified ? 1 : 0}|${JSON.stringify(x?.profile || null)}`;
  const openedWith = sessKey(sess);
  const shell = accountShell({ active: "biletlerim", contentGap: 32, session: sess });
  const content = shell.content;
  content.classList.add("dk-biletlerim");
  const countsReady = Promise.resolve(shell.refreshCounts()).catch(() => null);

  let alive = true;
  let tab = ctx?.query?.get("sekme") === "gecmis" ? "past" : "up";
  let wantTicket = ctx?.query?.get("bilet") || null;
  let tickets = null; // null = yükleniyor
  let upcoming = [];
  let past = [];
  const live = new Map(); // eventId → { status, checkedInAt }
  const cards = new Map(); // eventId → ticketCard
  let liveUnsubs = [];
  let coords = null;
  let modal = null;

  // ── Başlık + sayaç ──
  const countTxt = h("span", {});
  const count = h("span", { class: P + "count", "aria-live": "polite" }, h("span", { class: P + "dot", "aria-hidden": "true" }), countTxt);
  const head = dkPageHead({ title: "Bilet", em: "lerim", lead: "Katıldığın etkinliklerin e-biletleri. Girişte bileti aç, QR kodu görevliye okut.", right: count });

  // ── Sekmeler ──
  const seg = dkSegmented({
    label: "Bilet listesi", value: tab, countColor: "#8A8E97",
    items: [{ key: "up", label: "Yaklaşan", count: "" }, { key: "past", label: "Geçmiş", count: "" }],
    onChange: (k) => setTab(k, true),
  });
  const tabIds = { up: "dk-bl-tab-up", past: "dk-bl-tab-past" };
  const panelId = "dk-bl-panel";
  seg.querySelectorAll('[role="tab"]').forEach((b, i) => { b.id = i === 0 ? tabIds.up : tabIds.past; b.setAttribute("aria-controls", panelId); });
  const tabsRow = h("div", { class: cx(P + "tabs", "dk-rise"), style: { "--dk-delay": "80ms" } },
    seg, h("span", { class: P + "note" }, "Bilet, etkinlik başlangıcından 6 saat sonrasına kadar geçerlidir."));
  const panel = h("div", { id: panelId, role: "tabpanel", class: P + "panel" });

  // ── Girişte nasıl kullanılır ──
  const STEPS = [
    ["01", "Bileti aç", "Kapıda bilet kartına tıkla; e-bilet tam ekran açılır."],
    ["02", "QR'ı okut", "Mekan görevlisi koçandaki QR kodu okutur."],
    ["03", "Koçan yırtılır", "Giriş onaylanır, bilet \"Giriş yapıldı\" damgasıyla kalır."],
  ];
  const how = h("section", { class: cx(P + "how", "dk-rise"), style: { "--dk-delay": "200ms" }, "aria-labelledby": "dk-bl-how" },
    h("h2", { id: "dk-bl-how", class: P + "how-h" }, "GİRİŞTE NASIL KULLANILIR"),
    h("ol", { class: P + "steps" }, ...STEPS.map(([n, t, b]) => h("li", { class: P + "step" },
      h("span", { class: P + "step-n" }, n),
      h("span", { class: P + "step-c" }, h("span", { class: P + "step-t" }, t), h("span", { class: P + "step-b" }, b))))));

  content.append(head, tabsRow, panel, how);

  // ── Durum ──
  const stateOf = (e) => live.get(e.id) || initialState(e);
  const activeCount = () => upcoming.filter((e) => stateOf(e).status !== "used").length;
  function syncCounts() {
    if (!Array.isArray(tickets)) { // yükleniyor / hata: sayı yok
      count.style.visibility = "hidden";
      seg.dk.setCount("up", ""); seg.dk.setCount("past", "");
      return;
    }
    count.style.visibility = "";
    countTxt.textContent = `${activeCount()} AKTİF BİLET`;
    seg.dk.setCount("up", upcoming.length);
    seg.dk.setCount("past", past.length);
    // Kenar menüsü "Biletlerim" hapı = aktif (okutulmamış) yaklaşan bilet (spec §3). Kabuğun önbellekli sayacı (kurulumda
    // istenen aynı promise) çözüldükten SONRA yazılır → üzerine yazılmaz.
    // SHARED-CANDIDATE: live.accountCounts().tickets okutulmuş (used) biletleri de sayıyor; spec aktif = ticketStatus !== 'used'.
    countsReady.then(() => { if (alive && Array.isArray(tickets)) shell.setCount("tickets", activeCount()); });
  }
  function distOf(e) {
    const lat = e?.location?.lat, lng = e?.location?.lng;
    if (!coords || lat == null || lng == null) return "";
    const km = haversineKm(coords, { lat: Number(lat), lng: Number(lng) });
    return Number.isFinite(km) ? fmtKm(km) : "";
  }

  function renderPanel() {
    cards.clear();
    panel.setAttribute("aria-labelledby", tabIds[tab]);
    if (tickets == null) {
      panel.replaceChildren(h("div", { class: P + "grid-up", "aria-busy": "true" }, skeletonCard(), skeletonCard(), skeletonCard()));
      return;
    }
    if (tickets === false) {
      panel.replaceChildren(dkEmpty({
        icon: "alertCircle", ring: true, title: "Bir sorun oldu", sub: "Bağlantını kontrol edip tekrar dene.",
        action: dkButton("Tekrar dene", { variant: "light", size: 42, onClick: () => load({ refocus: true }) }),
      }));
      return;
    }
    if (tab === "up") {
      if (!upcoming.length) {
        panel.replaceChildren(dkEmpty({
          icon: "ticket", ring: true, title: "Aktif biletin yok.", sub: "Keşfet'ten bir etkinliğe \"Katıl\" dediğinde bileti burada görünür.",
          action: dkButton("Keşfet'e git", { variant: "light", size: 42, href: "#/kesfet" }),
        }));
        return;
      }
      const grid = h("div", { class: P + "grid-up" });
      upcoming.forEach((e, i) => {
        const c = ticketCard(e, stateOf(e), { index: i, onOpen: (ev) => openTicket(ev) });
        c.setDist(distOf(e));
        cards.set(e.id, c);
        grid.append(c.node);
      });
      panel.replaceChildren(grid);
    } else {
      if (!past.length) {
        panel.replaceChildren(dkEmpty({ icon: "clock", ring: true, title: "Geçmiş biletin yok.", sub: "Katıldığın etkinlikler bittiğinde burada puanlayabilirsin." }));
        return;
      }
      panel.replaceChildren(h("div", { class: P + "grid-past" }, ...past.map((e, i) => pastCard(e, stateOf(e), { index: i }))));
    }
  }

  function setTab(k, fromUser) {
    if (k !== "up" && k !== "past") k = "up";
    const changed = k !== tab;
    tab = k;
    if (seg.dk.get() !== k) seg.dk.set(k);
    if (fromUser) writeQuery({ sekme: k === "past" ? "gecmis" : null });
    if (changed) renderPanel();
  }

  // ── Canlı check-in dinleyicileri (yaklaşan biletler; app TicketsScreen) ──
  function subscribeUpcoming() {
    liveUnsubs.forEach((f) => { try { f(); } catch (_) {} });
    liveUnsubs = [];
    if (!uid) return;
    upcoming.forEach((e) => {
      liveUnsubs.push(subscribeTicket(e.id, uid, (st) => {
        if (!alive) return;
        const cur = live.get(e.id) || initialState(e);
        if (cur.status === st.status && cur.checkedInAt === st.checkedInAt) return;
        live.set(e.id, st);
        cards.get(e.id)?.setState(st);
        syncCounts();
      }));
    });
  }

  // ── Bilet modalı ──
  function openTicket(e) {
    if (!uid || !alive) return;
    if (modal) modal.close("replace");
    modal = openETicket({
      e, uid, initial: stateOf(e),
      onClose: () => {
        modal = null;
        wantTicket = null;
        if (alive && readBilet() === e.id) writeQuery({ bilet: null });
      },
    });
    wantTicket = e.id;
    writeQuery({ bilet: e.id });
  }
  const readBilet = () => new URLSearchParams((location.hash.split("?")[1]) || "").get("bilet");
  function syncTicketFromQuery() {
    if (tickets == null || tickets === false) return;
    if (!wantTicket) { if (modal) modal.close("query"); return; }
    if (modal?.eventId === wantTicket) return;
    const e = upcoming.find((x) => x.id === wantTicket);
    if (e) openTicket(e);
    else { wantTicket = null; writeQuery({ bilet: null }); }
  }

  // ── Yükleme ──
  // "Tekrar dene" iskelet çizilirken DOM'dan çıkar → odak <body>'ye düşmesin: yeniden çizimden sonra panelin ilk
  // odaklanabilir öğesine (ilk bilet / yeni "Tekrar dene" / "Keşfet'e git"), yoksa panelin kendisine taşınır.
  function focusPanel() {
    if (!alive || (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) return;
    let t = panel.querySelector('button:not([disabled]), a[href]');
    if (!t) { panel.setAttribute("tabindex", "-1"); t = panel; }
    t.focus({ preventScroll: true });
  }
  async function load({ refocus = false } = {}) {
    tickets = null;
    syncCounts();
    renderPanel();
    if (!uid) { tickets = []; upcoming = []; past = []; syncCounts(); renderPanel(); if (refocus) focusPanel(); return; }
    let list;
    try { list = await loadTickets(uid); } catch (err) {
      if (!alive) return;
      console.warn("[biletlerim] biletler yüklenemedi", err?.code || err?.message || err);
      tickets = false; syncCounts(); renderPanel(); if (refocus) focusPanel(); return;
    }
    if (!alive) return;
    const now = Date.now();
    const up = [], pa = [];
    for (const e of list) {
      const st = eventStartMs(e);
      if (st == null || st + TICKET_VALID_TAIL_MS > now) up.push(e); else pa.push(e);
    }
    // Yaklaşan: en yakın önce (tarihsizler sona; eşitlikte en yeni katılım); geçmiş: en yeni önce
    up.sort((a, b) => ((eventStartMs(a) ?? Infinity) - (eventStartMs(b) ?? Infinity)) || ((b.att?.joinedAt || 0) - (a.att?.joinedAt || 0)));
    pa.sort((a, b) => (eventStartMs(b) ?? 0) - (eventStartMs(a) ?? 0));
    tickets = list; upcoming = up; past = pa;
    live.clear();
    syncCounts();
    renderPanel();
    subscribeUpcoming();
    if (refocus) focusPanel();
    syncTicketFromQuery();
  }

  // Mesafe için konum (legacy ticketsView gibi sayfa açılışında bir kez, 8 sn); izin yoksa rozet gizli kalır
  if (navigator.geolocation) {
    try {
      navigator.geolocation.getCurrentPosition((pos) => {
        if (!alive) return;
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        upcoming.forEach((e) => cards.get(e.id)?.setDist(distOf(e)));
      }, () => {}, { timeout: 8000, maximumAge: 5 * 60 * 1000 });
    } catch (_) {}
  }

  load();

  return {
    node: shell.node,
    update(q) {
      const k = q?.get("sekme") === "gecmis" ? "past" : "up";
      setTab(k, false);
      wantTicket = q?.get("bilet") || null;
      syncTicketFromQuery();
    },
    onSession(s) { return sessKey(s) === openedWith; },
    destroy() {
      alive = false;
      if (modal) { try { modal.close("destroy"); } catch (_) {} modal = null; }
      liveUnsubs.forEach((f) => { try { f(); } catch (_) {} });
      liveUnsubs = [];
      shell.destroy();
    },
  };
}
