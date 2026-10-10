// Masaüstü tasarım görselleri + sabit bağlantılar. Yollar index.html köküne göre (GitHub Pages: gigbridges.com/).
// Görseller Claude Design artboard'larının _blob/ kaynaklarından kopyalandı (assets/web/). Hepsi TASARIM/DEMO
// görselidir (yapay üretim, sağ-alt köşede küçük "✦" filigranı var; bazılarında görüntü içi yazı — bkz. specs/foundation.md §6/§8).
// SAHİBİ KARARI: yalnız tasarımın DEKORATİF yerlerinde kullanılır — auth yan paneli, Landing kolajı, yönetici yan paneli,
// uygulama tanıtımı, boş durumlar. Gerçek etkinlik/sanatçı/mekan görselleri DAİMA Firestore verisinden gelir (bannerUrl/
// photoURL); yoksa genres.genreGrad() + serif baş harf yer tutucusu — bu dosyadaki görseller asla kayıt görseli yerine geçmez.
// Hepsi yayından önce lisanslı/gerçek fotoğrafla değiştirilecek (sahibine bildirildi).
const W = "assets/web/";

export const IMG = {
  // 1000×545 (sahne/mekân geniş kareler)
  jazzClub:        { src: W + "venue-jazz-club.jpg",        w: 1000, h: 545, alt: "Caz kulübünde canlı müzik gecesi", blob: "3f41f25f42e7b92576faad3070ba7e5c" },
  electronicNight: { src: W + "venue-electronic-night.jpg", w: 1000, h: 545, alt: "Elektronik müzik gecesinde DJ performansı", blob: "226119baf495137a4b856d5dfa82bafc" },
  deepHouseBeach:  { src: W + "event-deephouse-beach.jpg",  w: 1000, h: 545, alt: "Sahilde deep house partisi", blob: "a36342277b7c13ab609fafab1f0dd864" },
  // rockNight (event-rock-night.jpg) KALDIRILDI (sahibi kararı): posterlerde/tişörtlerde gerçek grup ve marka logoları.
  // 720×392 (sanatçı portreleri)
  vocalist:        { src: W + "artist-vocalist-stage.jpg",  w: 720,  h: 392, alt: "Sahnede şarkı söyleyen vokalist", blob: "28563cc53799316543f02f60ff066532" },
  djBooth:         { src: W + "artist-dj-booth.jpg",        w: 720,  h: 392, alt: "DJ kabininde performans", blob: "44b89984d5591b75af55a3368d44a11f" },
  guitarist:       { src: W + "artist-guitarist-studio.jpg", w: 720, h: 392, alt: "Stüdyoda akustik gitarist", blob: "7474a018a219bb2152d48ce3c48af514" },
  pianist:         { src: W + "artist-pianist-studio.jpg",  w: 720,  h: 392, alt: "Stüdyoda piyanist", blob: "cdba0ee980ab590de83dd0120d587a61" },
};

// Auth yan paneli (AuthSplit) görselleri — specs/auth.md §R "Images differ per page"
export const AUTH_ASIDE = {
  login: IMG.jazzClub,          // #/login, WebGiris (modal arkası), WebKayit, WebSifreSifirla
  register: IMG.jazzClub,
  verify: IMG.electronicNight,  // WebDogrula ("club-dj")
  admin: IMG.electronicNight,   // WebAdminGiris (gri tonlu)
  pending: IMG.electronicNight, // WebOnayBekleniyor (artboard "rock-crowd" — marka riski nedeniyle kaldırıldı; sahibi değiştirecek)
  setup: IMG.deepHouseBeach,    // WebRolSec ("beach-dj")
};

// Marka
export const LOGO_ICON = "assets/logo-icon.svg";          // legacy logo dosyası (tasarım: icons.js "logo" köprü SVG'si)
export const LOGO_HORIZONTAL = "assets/logo-horizontal.svg";
export const OG_COVER = "assets/og-cover.png";

// Mağaza bağlantıları (App Store kimliği henüz yok → /indir/ sayfasına düş; indir/index.html cihazı algılar)
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.erberkay.gigbridge";
export const APP_STORE_URL = null;                       // TODO(owner): App Store ID gelince doldur
export const DOWNLOAD_PAGE = "/indir/";
export const appStoreHref = () => APP_STORE_URL || DOWNLOAD_PAGE;
export const playStoreHref = () => PLAY_STORE_URL;

// Statik (SPA dışı) sayfalar — footer "YASAL" + SEO
export const LEGAL = {
  privacy: "gizlilik.html",
  terms: "kullanim-kosullari.html",
  deleteAccount: "hesap-sil.html",
  resetPassword: "sifirla.html",
  distanceContract: "mesafeli-hizmet-sozlesmesi.html",
  refund: "iptal-ve-iade.html",
  delivery: "teslimat-ve-ifa.html",
  about: "hakkimizda.html",
  contact: "iletisim.html",
};
export const PAYMENT_NOTE = "PayTR ile güvenli ödeme · Visa · Mastercard · Troy";
export const SITE_HOST = "gigbridges.com";
