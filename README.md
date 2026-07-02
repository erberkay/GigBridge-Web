# GigBridge — Mekan Üyeliği Sitesi

Mekanların GigBridge'e **web üzerinden kayıt olduğu** statik başvuru sayfası.
Uygulamadan **ayrı** bir projedir ama **aynı Firebase projesini** (`djing-ba986`) kullanır.

## Nasıl çalışır?

1. Mekan bu siteden **e-posta + şifre** ile kayıt olur.
2. Site, uygulamanın mekan kaydıyla **birebir aynı** `users/{uid}` dokümanını oluşturur:
   ```js
   { displayName, email, userType: "venue", photoURL: null,
     createdAt: <serverTimestamp>, approved: false, city?, phone? }
   ```
3. `approved: false` olduğu için hesap **admin onayını bekler** (admin panelindeki
   "Onay Bekleyen Mekanlar" listesinde görünür).
4. Admin onayladıktan sonra mekan **uygulamayı açıp** müşteri giriş ekranından
   **aynı e-posta ve şifreyle** giriş yapar → mekan paneline düşer.

> Giriş HER ZAMAN uygulamadan yapılır; site yalnızca **kayıt** içindir.

## Dosyalar

| Dosya | Görev |
|-------|-------|
| `index.html` | Sayfa yapısı + başvuru formu |
| `style.css` | GigBridge koyu teması |
| `app.js` | Firebase kayıt mantığı (CDN SDK, modül) + 81 il |

## GitHub Pages'e yayınlama

1. Yeni bir GitHub deposu oluştur (örn. `gigbridge-uyelik`).
2. Bu klasörü depoya it:
   ```bash
   cd ~/gigbridge-uyelik
   git init
   git add .
   git commit -m "GigBridge mekan üyelik sitesi"
   git branch -M main
   git remote add origin https://github.com/<KULLANICI>/gigbridge-uyelik.git
   git push -u origin main
   ```
3. GitHub'da: **Settings → Pages → Source: `main` / `root`** seç, kaydet.
4. Birkaç dakika sonra site şurada yayında olur:
   `https://<KULLANICI>.github.io/gigbridge-uyelik/`

## Firebase gereksinimleri (tek seferlik kontrol)

- **Authentication → Sign-in method → E-posta/Şifre** sağlayıcısı **açık** olmalı
  (uygulama zaten kullandığı için büyük olasılıkla açıktır).
- Firestore `users` create kuralı zaten kendi uid'sine yazana izin veriyor
  (`allow create: if isOwner(uid)`), ek kural gerekmez.
- (Opsiyonel) Authentication → Settings → **Authorized domains**'e GitHub Pages
  alan adını (`<KULLANICI>.github.io`) eklemek iyi olur. E-posta/şifre kaydı için
  şart değildir, ileride Google ile giriş eklenirse gerekir.

## Notlar

- `app.js` içindeki Firebase yapılandırma değerleri **public web istemci
  anahtarlarıdır** — gizli değildir, depoya güvenle konur. Güvenlik Firestore/Storage
  **kuralları** ile sağlanır.
- Şehir alanı 81 il ile otomatik tamamlanır; boş bırakılabilir (mekan sonra
  uygulamadaki profilinden doldurabilir).
