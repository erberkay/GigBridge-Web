// Görünüm modu (masaüstü ↔ mobil) — TEK KAYNAK.
// ≥769 px → "desktop" (yeni js/desktop/** görünümleri), ≤768 px → "mobile" (legacy arayüz AYNEN).
// JS ve CSS aynı eşiği kullanır: CSS tarafında `@media (min-width: 769px)` ya da
// `html[data-view="desktop"]`. matchMedia kesirli genişliklerde (768.5 px gibi) CSS ile aynı sonucu verir.
//
// Mod KESİNLEŞMİŞ değerdir: matchMedia "change" olayı kısa bir gecikmeyle (SETTLE_MS) değerlendirilir ve yalnız
// mod gerçekten değiştiyse abonelere bildirilir. Chrome, tam sayfa ekran görüntüsü / cihaz metriği değişimi gibi
// durumlarda eşik aşılmadan da "change" üretebiliyor (ölçüldü); bu sahte olaylar sayfayı yeniden kurdurmaz.
export const DESKTOP_MIN = 769;
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN}px)`;
const SETTLE_MS = 120;

const mq = window.matchMedia(DESKTOP_QUERY);
const subs = new Set();
let mode = mq.matches ? "desktop" : "mobile";
let timer = null;

export const isDesktop = () => mode === "desktop";
export function viewMode() { return mode; }

function syncAttr() { document.documentElement.dataset.view = mode; }

// Yalnız eşik geçişinde (kesinleşmiş mod değişiminde) tetiklenir. Dönüş: aboneliği kaldıran fonksiyon.
export function onViewModeChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

const onChange = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const next = mq.matches ? "desktop" : "mobile";
    if (next === mode) return; // sahte/geçici olay → yok say
    mode = next;
    syncAttr();
    subs.forEach((fn) => { try { fn(mode); } catch (e) { console.error(e); } });
  }, SETTLE_MS);
};
if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
else if (typeof mq.addListener === "function") mq.addListener(onChange); // eski Safari

syncAttr(); // <html data-view="desktop|mobile"> → CSS kapsamı
