# GigBridge — Web Paneli

Mekan, organizatör ve yöneticiler için **web paneli**. Uygulamadan **ayrı** bir projedir
ama **aynı Firebase projesini** (`djing-ba986`) kullanır — hesaplar ve veriler ortaktır.
Kurulum/derleme gerektirmez (saf statik ES-module SPA), GitHub Pages'te yayınlanır.

## Roller ve akış

- **Mekan / Organizatör**: siteden kayıt olur (e-posta+şifre) → `approved:false` ile
  **yönetici onayını** bekler → onaylanınca panelde ve uygulamada aynı hesapla giriş.
- **Yönetici**: kendi Firebase hesabıyla `#/yonetici` üzerinden girer (owner e-postası ya
  da `adminUids`) → onay panelinde mekan/organizatör başvurularını, VIP isteklerini ve
  sorun bildirimlerini yönetir. App'teki admin paneliyle **aynı Firestore verisi**.

## Sayfalar (hash router)

| Rota | İçerik |
|------|--------|
| `#/` | Karşılama + giriş/kayıt/yönetici |
| `#/login` · `#/register` · `#/pending` | Giriş · kayıt (mekan/organizatör) · onay bekleme |
| `#/yonetici` → `#/admin` | Yönetici girişi → onay paneli |
| `#/venue` | Mekan paneli: etkinlikler + organizatör istekleri (kabul/ret) + profil |
| `#/organizer` | Organizatör paneli: etkinlikler + gönderilen istekler + profil |

## Yapı

```
index.html            SPA kabuğu (Ionicons + js/app.js)
style.css             Tasarım sistemi (app'in koyu teması + rol renkleri)
js/firebase.js        Firebase init + fonksiyon yeniden-dışa-aktarımı
js/store.js           Oturum (auth + profil + isAdmin) + rol/onay yönlendirme
js/app.js             Önyükleme + hash router + guard'lar
js/ui.js              h() hyperscript + ortak bileşenler
js/data.js            Firestore sorguları (app şemasıyla birebir)
js/pages/*.js         auth · admin · venue · organizer
```

## Kapsam

**Mevcut:** tüm giriş/kayıt/onay akışları · tam yönetici onay paneli (mekan + organizatör +
VIP + sorun bildirimi) · **mekan paneli** (etkinlikler · organizatör istekleri onay/ret ·
**etkinlik oluşturma** (VIP dahil) · **sanatçı bul + davet** · **mesajlaşma** · profil) ·
**organizatör paneli** (etkinlikler · **mekan seç + istek gönder** · **mesajlaşma** · profil).
Mesajlaşma app'in `conversations`/`messages` şemasıyla birebir; kartlardaki 💬 ile sohbet başlar.

**Yol haritası:** analitik · rezidans (uzun dönem) yönetimi · etkinliğe kapak fotoğrafı yükleme.

## GitHub Pages'e yayınlama

Depo `erberkay/GigBridge-Web`. **Settings → Pages → Source: `main` / `/root`** seçilince:
`https://erberkay.github.io/GigBridge-Web/`

## Firebase gereksinimleri

- **Authentication → E-posta/Şifre** sağlayıcısı açık olmalı (uygulama kullandığı için açıktır).
- **Google ile giriş için:** Authentication → Sign-in method → **Google** sağlayıcısını aç;
  ayrıca Authentication → Settings → **Authorized domains**'e GitHub Pages alan adını
  (**`erberkay.github.io`**) ekle. (E-posta/şifreden farklı olarak Google OAuth bunu ister;
  yerelde `localhost` zaten yetkilidir.) Google ile ilk kez girenler rol seçme ekranına
  düşer, hesabı tamamlar ve yine yönetici onayını bekler.
- `users` create kuralı kendi uid'sine yazana izin verir; admin onayı
  `isAdmin() && onlyChanged(['approved','approvedAt','rejected'])` ile korunur (mevcut).
- Firebase web istemci anahtarları **public**'tir; güvenlik Firestore kurallarıyla sağlanır.
