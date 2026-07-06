# GigBridge — Web Paneli

**gigbridges.com** — GigBridge'in web sürümü. Mobil uygulamadan **ayrı** bir projedir ama
**aynı Firebase projesini** (`djing-ba986`) kullanır: hesaplar, veriler ve akışlar ortaktır.
Derleme/paket adımı yoktur — saf statik **ES-module SPA** (Firebase 10.11 CDN), GitHub Pages'te yayınlanır.

> Mobil uygulama için ayrı repo: [`GigBridge`](https://github.com/erberkay/GigBridge) (React Native / Expo).

---

## Öne çıkanlar

- **Tam app paritesi** — dört rol (müşteri, sanatçı, mekan, organizatör) + yönetici paneli, mobil app'le
  birebir aynı özellik ve akışlar. Mobil-öncelikli CSS + `@media(min-width:900px)` masaüstü uyarlaması
  (alt sekme çubuğu → sol kenar çubuğu).
- **Aether editorial-dark tema** — `aether.css`, `style.css` üzerine binen bir katman: void #06070A zemin,
  prizma aksan (cyan→magenta→amber), Space Grotesk + Instrument Serif + JetBrains Mono, dar köşeler,
  gölgesiz/hairline kartlar. Rol renkleri prizma paletine eşlenir (müşteri cyan, sanatçı/organizatör magenta, mekan amber).
- **Misafir modu** — girişsiz ziyaretçi anonim oturumla (Firebase Anonymous Auth) müşteri keşif sayfalarını
  gezebilir; yazma/kişisel aksiyonlar giriş modalına yönlendirir.
- **Yerinde giriş/kayıt** — "Giriş" ve "Kayıt Ol" ayrı sayfaya atmadan modalda açılır.
- **Özel şifre sıfırlama e-postası** — markalı HTML (aşağıda) + rate-limit + görünmez reCAPTCHA v3.
- **Holografik bilet** — Biletlerim'de perforasyonlu, holografik kart (korunan tasarım).
- **Service worker** — stale-while-revalidate önbellek (hızlı açılış + otomatik güncelleme).

---

## Roller ve akış

| Rol | Giriş | Akış |
|-----|-------|------|
| 🎧 **Müşteri** | e-posta/şifre veya Google | Keşfet, harita, akış, mesajlar, biletler, takip/favori, profil |
| 🎤 **Sanatçı** | e-posta/şifre veya Google | Ana sayfa (teklifler kabul/ret), Top 10, mekanlar, mesajlar, profil |
| 🏢 **Mekan** | e-posta/şifre veya Google → **yönetici onayı** | Etkinlikler, sanatçı bul + davet, analitik, mesajlar, profil |
| 🗓 **Organizatör** | e-posta/şifre veya Google → **yönetici onayı** | Etkinlikler (mekana istek), ekip, mesajlar, profil |
| 🛡 **Yönetici** | `#/yonetici` (owner e-postası / `adminUids`) | Mekan/organizatör onayı, VIP istekleri, mekan-adı istekleri, sorun bildirimleri |

Müşteri/sanatçı onaysız anında aktif; mekan/organizatör `approved:false` yazılıp yönetici onayını bekler.
Web'de Google ile ilk kez girip profili olmayan kullanıcı rol-seçim ekranına (`#/setup`) düşer.

---

## Sayfalar (hash router)

| Rota | İçerik |
|------|--------|
| `#/kesfet` | Misafir/müşteri keşif ana sayfası (Top 10, hero, kategoriler, şehir filtresi) |
| `#/etkinlikler` | Tarih filtreli tam etkinlik listesi |
| `#/login` · `#/register` | Giriş · kayıt (modal olarak da açılır) |
| `#/yonetici` → `#/admin` | Yönetici girişi → onay paneli |
| `#/customer` · `#/artist` · `#/venue` · `#/organizer` | Rol panelleri (giriş sonrası) |
| `#/biletlerim` · `#/takip` · `#/favoriler` · `#/katildiklarim` · `#/yorumlarim` · `#/bildirimler` | Müşteri alt sayfaları |
| `#/mesajlar` | Mesajlaşma (app'in `conversations`/`messages` şemasıyla birebir) |

---

## Şifre sıfırlama e-postası

"Şifremi unuttum" akışı, Firebase'in düz metin şablonu yerine **markalı HTML e-posta** gönderir:

- **Backend** — `sendPasswordReset` Cloud Function (app repo, `functions/index.js`): `generatePasswordResetLink`
  + nodemailer (Gmail SMTP `gigbridge.tr@gmail.com`), Aether tasarımlı HTML (prizma şerit + GigBridge marka).
- **Fallback** — fonksiyon deploy edilmemişse / SMTP hatasında Firebase'in yerleşik e-postasına düşer
  (kullanıcı her hâlükârda çalışan bir sıfırlama bağlantısı alır).
- **Abuse/fatura koruması** — e-posta başına 3/saat (+min 60 sn), IP başına 15/saat rate-limit +
  `maxInstances` tavanı; olmayan hesaba sessizce başarı döner (enumeration sızmaz).
- **Bot koruması** — görünmez **reCAPTCHA v3** (rozet gizli, Google ToS atıf notu gösterilir);
  düşük skor → e-posta gönderilmez. Site anahtarı public'tir; gizli anahtar Secret Manager'dadır.

---

## Yapı

```
index.html            SPA kabuğu (Ionicons + service worker kaydı + font preconnect)
style.css             App paritesi koyu tema (mobil + ≥900px masaüstü katmanı)
aether.css            Aether editorial-dark overlay (style.css'ten SONRA yüklenir)
sw.js                 Service worker (stale-while-revalidate, yalnız same-origin GET)
gizlilik.html · kullanim-kosullari.html · hesap-sil.html   Yasal sayfalar (KVKK/GDPR)
CNAME                 gigbridges.com

js/firebase.js        Firebase init + fonksiyon/functions yeniden-dışa-aktarımı
js/store.js           Oturum (auth + profil + isAdmin + misafir) + rol/onay yönlendirme
js/app.js             Önyükleme + hash router + guard'lar (misafir/onay/rol)
js/ui.js              h() hyperscript + ortak bileşenler (rol renkleri, modal, toast)
js/data.js            Firestore sorguları (app şemasıyla birebir)
js/pages/
  ├── customer.js     Keşfet, harita, akış, biletler, takip/favori, profil
  ├── artist.js       Ana sayfa, Top 10, mekanlar, aldığım yorumlar, profil
  ├── venue.js        Panel, sanatçı bul + davet, analitik, create/edit, profil
  ├── organizer.js    Etkinlikler (mekana istek), ekip, profil
  ├── admin.js        Onay paneli (mekan/organizatör/VIP/ad isteği/sorun bildirimi)
  ├── auth.js         Giriş/kayıt sayfaları + modalları, Google, şifre sıfırlama, reCAPTCHA
  └── messages.js     Mesajlaşma + teklif kabul/ret balonları
```

---

## GitHub Pages'e yayınlama

Depo `erberkay/GigBridge-Web`, özel alan adı **`gigbridges.com`** (CNAME + `.nojekyll`).
Deploy = **`git push origin main`** → Pages otomatik build. Build "building"de takılırsa keychain
token'ıyla `POST api.github.com/repos/erberkay/GigBridge-Web/pages/builds` (rebuild nudge) → ~20 sn'de yayınlanır.

- **Settings → Pages → Source: `main` / `/root`** + Custom domain `gigbridges.com` + "Enforce HTTPS".
- CSS/JS güncellemesi: `index.html`'deki `?v=YYYYMMDDx` sürümünü bump et (ES-module cache kırma) +
  `sw.js`'deki `CACHE` sürümünü bump et.
- Deploy sonrası ilk açılış SW önbelleğinden gelebilir (hızlı, eski olabilir); bir sonraki açılış günceldir.

---

## Firebase gereksinimleri

- **Authentication:** E-posta/Şifre + Google + **Anonymous** (misafir modu) sağlayıcıları açık olmalı.
- **Authorized domains:** Authentication → Settings → `gigbridges.com` (+ yedek `erberkay.github.io`).
  Yerelde `localhost` zaten yetkilidir. Native uygulama bu listeyi kullanmaz; web popup'ı ister.
- **Şifre sıfırlama için** (opsiyonel — yoksa Firebase düz e-postasına düşer): app repo'da
  `firebase functions:secrets:set GMAIL_PASS` + `RECAPTCHA_SECRET` → `firebase deploy --only functions`.
- Aynı Auth: uygulamada giren hesap web'de de aynı hesaptır. Firebase web istemci anahtarları **public**'tir;
  güvenlik Firestore/Storage **kurallarıyla** sağlanır (bkz. app repo).

---

## Notlar

- **Bilet (.tkx) ve Keşfet arama (#poda)** tasarımları Aether katmanından hariç tutulur (korunur).
- Mobil görünüm app piksel-spec'iyle birebir; masaüstü yalnız `@media(min-width:900px)` ile uyarlanır.
- Değişiklik sonrası kural: web `git push` + (app tarafını etkiliyorsa) `eas update` — çift platform.
