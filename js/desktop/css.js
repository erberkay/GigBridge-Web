// Masaüstü alan CSS'lerini tembel yükler (FOUC'suz: görünüm, CSS'i yüklenmeden mount edilmez).
// Her dosya bir kez eklenir; <link> head'in SONUNA gider → style.css + aether.css'ten sonra (kaskadda en son).
// CSS_VER: index.html'deki ?v= deseniyle aynı mantık — dk-*.css değişince artır (GitHub Pages ~10 dk HTTP önbelleği).
export const CSS_VER = "20260929c";

const _css = new Map();

export function ensureCss(href) {
  if (_css.has(href)) return _css.get(href);
  const p = new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = `${href}?v=${CSS_VER}`;
    l.dataset.dk = "1";
    // Hata olsa da çöz: yarı stilli sayfa > boş ekran. (onerror'da önbellekten düş ki sonra tekrar denensin.)
    l.onload = () => resolve(true);
    l.onerror = () => { _css.delete(href); resolve(false); };
    document.head.append(l);
  });
  _css.set(href, p);
  return p;
}

// Birden çok dosyayı paralel yükle (sıra korunur: dizideki sırayla head'e eklenir).
export function ensureCssAll(list) {
  return Promise.all((list || []).map(ensureCss));
}

// JetBrains Mono 700 — YALNIZ masaüstü görünümleri için (index.html'deki ortak font isteği 400/500/600; mobil ≤768 legacy
// arayüzü piksel piksel aynı kalsın diye 700 oraya eklenmedi). İlk masaüstü mount denemesinde bir kez eklenir.
// media="(min-width: 769px)": sayfa sonradan mobile geçerse (döndürme/yeniden boyutlandırma) @font-face kuralı devre dışı
// kalır → mobilde mono+700 metin eskisi gibi (sentetik kalın) çizilir.
export const DESKTOP_FONT_HREF = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&display=swap";
let _font = null;
export function ensureDesktopFonts() {
  if (_font) return _font;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = DESKTOP_FONT_HREF;
  l.media = "(min-width: 769px)";
  l.dataset.dk = "font";
  document.head.append(l);
  _font = l;
  return l;
}
