// Satır içi çizgi SVG ikonları — artboard'lardan BİREBİR kopya (Lucide benzeri, 24 viewBox).
// Her kayıt: [iç işaretleme (path/circle/rect…), varsayılan stroke-width | null (dolgulu), tür].
// İç işaretleme artboard'daki <svg> gövdesiyle karakter karakter aynıdır (doğrulama: specs/foundation.md §6).
// Artboard'da kullanılan stroke-width/renk/boyut kullanıma göre değişir → svgIcon(name, { size, sw, color }) ile ver.
// Registry'de olmayan nadir bir ikon için artboard'daki gövdeyi svgRaw('<path d="…"></path>', {…}) ile birebir kullan.
// Sahibi: foundation (adım 1). Yeni ikon eklemek serbest (yalnız EKLE; mevcut adları değiştirme).
const SVG_NS = "http://www.w3.org/2000/svg";

export const ICONS = {
  logo: ["<path d=\"M3 17c3-6 6-9 9-9s6 3 9 9\"></path><path d=\"M3 17h18\"></path>", "2.4", "stroke"], // GigBridge köprü logosu (48 artboard)
  search: ["<circle cx=\"11\" cy=\"11\" r=\"6.5\"></circle><path d=\"m20 20-4.2-4.2\"></path>", "2", "stroke"], // arama (public/panel)
  search2: ["<circle cx=\"11\" cy=\"11\" r=\"6.5\"></circle><path d=\"m16 16 4.5 4.5\"></path>", "2", "stroke"], // arama (org/admin)
  bell: ["<path d=\"M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z\"></path><path d=\"M10 20.5a2 2 0 0 0 4 0\"></path>", "1.8", "stroke"], // bildirim (PublicHeader)
  bellPanel: ["<path d=\"M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z\"></path><path d=\"M10 20.5a2 2 0 0 0 4 0\"></path>", "2", "stroke"], // bildirim (PanelShell mekan/org)
  bellArtist: ["<path d=\"M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z\"></path><path d=\"M10 20.5a2 2 0 0 0 4 0\"></path>", "1.9", "stroke"], // bildirim (sanatçı paneli)
  bellOff: ["<path d=\"M6 16v-5a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8\"></path><path d=\"M10 20.5a2 2 0 0 0 4 0\"></path><path d=\"M3 3l18 18\"></path>", "1.6", "stroke"], // bildirim kapalı (Favoriler)
  chat: ["<path d=\"M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5z\"></path>", "1.8", "stroke"], // mesajlar (PublicHeader)
  chatBubble: ["<path d=\"M20 14.5a2 2 0 0 1-2 2H9l-4 3.5V6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2z\"></path>", "1.9", "stroke"], // mesajlar (sanatçı nav)
  chatSquare: ["<path d=\"M4 5h16v11H9l-5 4z\"></path>", "2", "stroke"], // mesajlar (org nav)
  chatLines: ["<path d=\"M4 5h16v11H9l-5 4z\"></path><path d=\"M8 9.5h8M8 12.5h5\"></path>", "1.8", "stroke"], // mesajlar (mekan nav)
  chevronRight: ["<path d=\"m9 6 6 6-6 6\"></path>", "2", "stroke"],
  chevronLeft: ["<path d=\"m15 6-6 6 6 6\"></path>", "2", "stroke"],
  chevronDown: ["<path d=\"m6 9 6 6 6-6\"></path>", "2", "stroke"],
  arrowRight: ["<path d=\"M5 12h14M13 6l6 6-6 6\"></path>", "2.2", "stroke"], // Tümünü gör / CTA
  arrowLeft: ["<path d=\"M19 12H5M11 6l-6 6 6 6\"></path>", "2", "stroke"], // Siteye dön / geri
  arrowUpRight: ["<path d=\"M7 17 17 7M9 7h8v8\"></path>", "2", "stroke"],
  arrowUp: ["<path d=\"M12 19V5M6 11l6-6 6 6\"></path>", "2.4", "stroke"],
  arrowDown: ["<path d=\"M12 5v14M6 13l6 6 6-6\"></path>", "2.4", "stroke"],
  pin: ["<path d=\"M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z\"></path><circle cx=\"12\" cy=\"10\" r=\"2.3\"></circle>", "2", "stroke"], // konum / şehir
  navFilled: ["<path d=\"M20.5 3.5 3.8 10.4c-.8.3-.7 1.4.1 1.6l6.6 1.6 1.6 6.6c.2.8 1.3.9 1.6.1z\"></path>", null, "fill"], // Konumumu kullan (dolu)
  navigation: ["<path d=\"M3 11 21 3l-8 18-2-8z\"></path>", "1.9", "stroke"], // yol tarifi / rota
  calendar: ["<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2\"></rect><path d=\"M3.5 10h17M8 3v4M16 3v4\"></path>", "2", "stroke"], // takvim (org nav)
  calendarCheck: ["<path d=\"M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4\"></path>", "1.8", "stroke"], // katıldıklarım
  clock: ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M12 7.5V12l3 2\"></path>", "1.9", "stroke"], // saat
  heart: ["<path d=\"M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.4-7.5 10.4z\"></path>", "1.8", "stroke"], // favori (dolu için fill:'currentColor')
  star: ["<path d=\"m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z\"></path>", null, "fill"], // puan yıldızı (dolu, 80 kullanım); çizgi hali: svgIcon('star',{stroke:true})
  ticket: ["<path d=\"M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z\"></path><path d=\"M14 7v10\" stroke-dasharray=\"2 2\"></path>", "1.8", "stroke"], // bilet
  user: ["<circle cx=\"12\" cy=\"8.5\" r=\"3.5\"></circle><path d=\"M5.5 19.5a6.5 6.5 0 0 1 13 0\"></path>", "1.8", "stroke"], // kişi
  userCircle: ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><circle cx=\"12\" cy=\"10\" r=\"3\"></circle><path d=\"M6.5 18.2a6.5 6.5 0 0 1 11 0\"></path>", "1.9", "stroke"], // Profilim (sanatçı nav)
  userProfile: ["<circle cx=\"12\" cy=\"8\" r=\"4\"></circle><path d=\"M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5\"></path>", "2", "stroke"], // Profil (org nav)
  userVenue: ["<circle cx=\"12\" cy=\"8\" r=\"4\"></circle><path d=\"M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6\"></path>", "1.8", "stroke"], // Profil (mekan nav)
  userPlus: ["<circle cx=\"9\" cy=\"8\" r=\"3.5\"></circle><path d=\"M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M19 8v6M16 11h6\"></path>", "2", "stroke"], // davet et
  users: ["<circle cx=\"9\" cy=\"8\" r=\"3.5\"></circle><path d=\"M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5\"></path><path d=\"M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2\"></path>", "2", "stroke"], // ekip (org nav)
  users2: ["<path d=\"M9 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3.5 19a5.5 5.5 0 0 1 11 0M17 7.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM15.5 14.6A4.5 4.5 0 0 1 21 19\"></path>", "1.8", "stroke"], // katılımcılar
  home: ["<path d=\"M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z\"></path>", "1.9", "stroke"], // Ana Sayfa (sanatçı nav)
  homeVenue: ["<path d=\"M3 10.5 12 3l9 7.5\"></path><path d=\"M5 9.5V21h14V9.5\"></path><path d=\"M9.5 21v-6h5v6\"></path>", "1.8", "stroke"], // Ana Sayfa (mekan nav)
  homeOrg: ["<path d=\"M3 11.5 12 4l9 7.5\"></path><path d=\"M5 10v10h14V10\"></path>", "2", "stroke"], // Ana Sayfa (org nav)
  compass: ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"m15.5 8.5-2 5-5 2 2-5z\"></path>", "1.9", "stroke"], // Keşfet (sanatçı nav)
  map: ["<path d=\"M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z\"></path><path d=\"M9 4v14M15 6v14\"></path>", "1.9", "stroke"], // harita
  trophy: ["<path d=\"M7 4h10v5a5 5 0 0 1-10 0z\"></path><path d=\"M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5\"></path>", "1.9", "stroke"], // Top 10
  mic: ["<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"></rect><path d=\"M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21\"></path>", "1.9", "stroke"], // sanatçı / mikrofon
  music: ["<path d=\"M9 17V5l10-2v12\"></path><circle cx=\"6.5\" cy=\"17\" r=\"2.5\"></circle><circle cx=\"16.5\" cy=\"15\" r=\"2.5\"></circle>", "2", "stroke"], // müzik notası
  building: ["<path d=\"M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16\"></path><path d=\"M15 9h4a1 1 0 0 1 1 1v11\"></path><path d=\"M3 21h18M8 8h3M8 12h3M8 16h3\"></path>", "2.2", "stroke"], // mekan / bina
  chart: ["<path d=\"M4 20V4\"></path><path d=\"M4 20h16\"></path><path d=\"M8.5 16v-5\"></path><path d=\"M13 16V8\"></path><path d=\"M17.5 16v-3\"></path>", "1.8", "stroke"], // Analitik (mekan nav)
  trendingUp: ["<path d=\"M3 17l6-6 4 4 8-8\"></path><path d=\"M15 7h6v6\"></path>", "1.8", "stroke"],
  logout: ["<path d=\"M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10\"></path>", "1.9", "stroke"], // Çıkış (sanatçı)
  logoutOrg: ["<path d=\"M9 4H5v16h4M14 8l4 4-4 4M18 12H9\"></path>", "2", "stroke"], // Çıkış (org/admin)
  logoutVenue: ["<path d=\"M15 4h4v16h-4\"></path><path d=\"M10 8l-4 4 4 4\"></path><path d=\"M6 12h10\"></path>", "1.8", "stroke"], // Çıkış (mekan)
  login: ["<path d=\"M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3\"></path>", "1.8", "stroke"], // Giriş yap
  plus: ["<path d=\"M12 5v14M5 12h14\"></path>", "2.2", "stroke"],
  plusCircle: ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M12 8.5v7M8.5 12h7\"></path>", "2", "stroke"],
  minus: ["<path d=\"M5 12h14\"></path>", "2", "stroke"],
  x: ["<path d=\"M6 6l12 12M18 6 6 18\"></path>", "2", "stroke"], // kapat
  xCircle: ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M9 9l6 6M15 9l-6 6\"></path>", "1.8", "stroke"],
  check: ["<path d=\"m5 12.5 4.5 4.5L19 7.5\"></path>", "2.4", "stroke"],
  checkCircle: ["<circle cx=\"12\" cy=\"12\" r=\"9\"></circle><path d=\"m8 12 3 3 5-6\"></path>", "2", "stroke"],
  checkDouble: ["<path d=\"M1.5 12.5 5.5 16.5 13.5 7.5\"></path><path d=\"M10.5 15.5 11.5 16.5 19.5 7.5\"></path>", "2", "stroke"], // okundu (mesaj)
  info: ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M12 11v5M12 8v.01\"></path>", "1.8", "stroke"],
  alertCircle: ["<circle cx=\"12\" cy=\"12\" r=\"9\"></circle><path d=\"M12 7.5v5.5M12 16.5v.01\"></path>", "2", "stroke"], // hata
  alertTriangle: ["<path d=\"M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5v4.5M12 17.2v.01\"></path>", "2", "stroke"], // uyarı
  edit: ["<path d=\"M4 20h4L19 9l-4-4L4 16z\"></path><path d=\"m13.5 6.5 4 4\"></path>", "2", "stroke"], // düzenle
  editPen: ["<path d=\"M12 20h8.5\"></path><path d=\"M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z\"></path>", "1.9", "stroke"],
  trash: ["<path d=\"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13\"></path>", "2", "stroke"], // sil
  trash2: ["<path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3\"></path>", "1.9", "stroke"],
  share: ["<path d=\"M12 3v12M7 8l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5\"></path>", "1.9", "stroke"], // paylaş
  upload: ["<path d=\"M12 15V3.5M7.5 8 12 3.5 16.5 8\"></path><path d=\"M5 12v7.5h14V12\"></path>", "1.9", "stroke"], // yükle
  externalLink: ["<path d=\"M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5\"></path>", "1.9", "stroke"],
  link: ["<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1\"></path><path d=\"M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"></path>", "2", "stroke"],
  filter: ["<path d=\"M4 5h16l-6 7.5V19l-4 1.5v-8z\"></path>", "1.8", "stroke"], // filtre
  sliders: ["<path d=\"M4 6h16M7 12h10M10 18h4\"></path>", "1.9", "stroke"], // sıralama/filtre çizgileri
  grid: ["<rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"1\"></rect><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"1\"></rect><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"1\"></rect><rect x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"1\"></rect>", "1.8", "stroke"], // ızgara görünümü
  list: ["<path d=\"M9 6h11M9 12h11M9 18h11\"></path><path d=\"M4.5 6h.01M4.5 12h.01M4.5 18h.01\"></path>", "1.8", "stroke"], // liste görünümü
  eye: ["<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle>", "1.9", "stroke"], // göster
  eyeOff: ["<path d=\"M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.4 3.4M6.6 6.6C4.6 8 3.2 10.1 2.5 12c1 2.5 4.5 7 9.5 7 1.8 0 3.4-.6 4.8-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2\"></path>", "1.8", "stroke"], // gizle
  lock: ["<rect x=\"5\" y=\"11\" width=\"14\" height=\"9.5\" rx=\"2\"></rect><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"></path>", "2", "stroke"], // kilit
  shield: ["<path d=\"M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z\"></path>", "2", "stroke"],
  shieldCheck: ["<path d=\"M12 3 5 6v5.5c0 4.4 3 7.9 7 9.5 4-1.6 7-5.1 7-9.5V6z\"></path><path d=\"m9 12 2 2 4-4\"></path>", "2", "stroke"], // Sahip / doğrulanmış
  key: ["<circle cx=\"8\" cy=\"15\" r=\"4\"></circle><path d=\"m11 12 9-9M17 6l2 2M15 8l2 2\"></path>", "2", "stroke"], // düzenleme izni
  mail: ["<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"></rect><path d=\"m3.5 6.5 8.5 6.5 8.5-6.5\"></path>", "2", "stroke"], // e-posta
  globe: ["<path d=\"M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17\"></path>", "1.9", "stroke"], // web sitesi (WebSanatciProfil DCLogic)
  smartphone: ["<rect x=\"6.5\" y=\"2.5\" width=\"11\" height=\"19\" rx=\"2.5\"></rect><path d=\"M11 18.5h2\"></path>", "1.8", "stroke"], // App Store / telefon
  image: ["<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"></rect><circle cx=\"9\" cy=\"10\" r=\"1.8\"></circle><path d=\"m21 16-5-5-9 8\"></path>", "2", "stroke"], // görsel
  camera: ["<path d=\"M4 8h3l2-2.5h6L17 8h3v11H4z\"></path><circle cx=\"12\" cy=\"13\" r=\"3.5\"></circle>", "2", "stroke"], // fotoğraf değiştir
  qr: ["<rect x=\"4\" y=\"4\" width=\"6\" height=\"6\" rx=\"1\"></rect><rect x=\"14\" y=\"4\" width=\"6\" height=\"6\" rx=\"1\"></rect><rect x=\"4\" y=\"14\" width=\"6\" height=\"6\" rx=\"1\"></rect><path d=\"M14 14h2v2h-2zM18 18h2v2h-2zM14 18h1M18 14h2\"></path>", "2", "stroke"], // QR / check-in
  send: ["<path d=\"M21 3 10 14\"></path><path d=\"M21 3l-7 18-4-7-7-4z\"></path>", "2", "stroke"], // gönder
  refresh: ["<path d=\"M20 11a8 8 0 0 0-14.9-3.9M4 5v4h4M4 13a8 8 0 0 0 14.9 3.9M20 19v-4h-4\"></path>", "1.9", "stroke"], // yenile
  repeat: ["<path d=\"M17 2l3 3-3 3\"></path><path d=\"M4 11V9a4 4 0 0 1 4-4h12\"></path><path d=\"M7 22l-3-3 3-3\"></path><path d=\"M20 13v2a4 4 0 0 1-4 4H4\"></path>", "1.8", "stroke"], // rezidans / tekrar
  sparkles: ["<path d=\"M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z\"></path><path d=\"M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z\"></path>", "2", "stroke"], // yeni / özel
  flag: ["<path d=\"M5 21V4M5 4h11l-2 4 2 4H5\"></path>", "2", "stroke"], // sorun bildir
  headphones: ["<path d=\"M4 15v-3a8 8 0 0 1 16 0v3\"></path><path d=\"M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z\"></path>", "2", "stroke"], // DJ
  award: ["<circle cx=\"12\" cy=\"9\" r=\"5.5\"></circle><path d=\"m8.5 13.5-2 7.5 5.5-3 5.5 3-2-7.5\"></path>", "2", "stroke"], // rozet
  play: ["<path d=\"M5 3.5v17l14-8.5z\"></path>", "1.8", "stroke"], // Google Play (çizgi)
  playFilled: ["<path d=\"M8 5v14l11-7z\"></path>", null, "fill"], // oynat
  pause: ["<rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"></rect><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"></rect>", null, "fill"], // duraklat
  more: ["<circle cx=\"5.5\" cy=\"12\" r=\"1.6\"></circle><circle cx=\"12\" cy=\"12\" r=\"1.6\"></circle><circle cx=\"18.5\" cy=\"12\" r=\"1.6\"></circle>", null, "fill"], // diğer seçenekler
  instagram: ["<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"5\"></rect><circle cx=\"12\" cy=\"12\" r=\"4\"></circle><path d=\"M17.3 6.7h.01\"></path>", "2", "stroke"],
  youtube: ["<rect x=\"2.5\" y=\"5.5\" width=\"19\" height=\"13\" rx=\"4\"></rect><path d=\"m10 9 5 3-5 3z\"></path>", "2", "stroke"],
  spotify: ["<circle cx=\"12\" cy=\"12\" r=\"9\"></circle><path d=\"M7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.2-.4 7.3.8M8.6 15.4c2-.5 4-.3 5.6.6\"></path>", "1.8", "stroke"],
  save: ["<path d=\"M5 4h11l3 3v13H5z\"></path><path d=\"M8 4v5h7V4M8 20v-6h8v6\"></path>", "1.8", "stroke"], // kaydet
  fileText: ["<path d=\"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z\"></path><path d=\"M14 3v5h5M9 13h6M9 17h6\"></path>", "1.8", "stroke"], // belge / sözleşme
  tag: ["<path d=\"M3.5 12.5V4h8.5l8.5 8.5-8 8z\"></path><circle cx=\"8\" cy=\"8.5\" r=\"1.4\"></circle>", "1.8", "stroke"], // fiyat etiketi
  wallet: ["<rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\"></rect><circle cx=\"12\" cy=\"12\" r=\"2.5\"></circle><path d=\"M6.5 9.5v.01M17.5 14.5v.01\"></path>", "1.8", "stroke"], // ücret / nakit
  moon: ["<path d=\"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z\"></path>", "1.8", "stroke"], // gece
  spinner: ["<path d=\"M21 12a9 9 0 1 1-9-9\"></path>", "2.4", "stroke"], // yükleniyor (dk-spin ile)
  apple: ["<path d=\"M16.4 12.7c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.6 2.2-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.6.7 2.8.7 1.2 0 1.9-1.1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4-.1 0-2.3-.9-2.3-3.5zM14.2 6.2c.6-.7 1-1.8.9-2.8-.9 0-2 .6-2.6 1.3-.6.6-1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2z\"></path>", null, "fill"], // App Store (Apple logosu; tasarımda fill #F2F1EE)
  googlePlay: ["<path d=\"M3.6 2.4 13 12 3.6 21.6c-.4-.2-.6-.6-.6-1.1V3.5c0-.5.2-.9.6-1.1z\" fill=\"#4ED8FF\"></path><path d=\"M16.7 8.7 13 12l-9.4-9.6c.2-.1.5-.1.8.1l12.3 6.2z\" fill=\"#FF4FA3\"></path><path d=\"M16.7 15.3 4.4 21.5c-.3.2-.6.2-.8.1L13 12l3.7 3.3z\" fill=\"#FFD700\"></path><path d=\"m16.7 8.7 3.9 2c.6.3.6 1.3 0 1.6l-3.9 2L13 12l3.7-3.3z\" fill=\"#4ED8FF\"></path>", null, "multi"], // Google Play (çok renkli)
  // ── TÜRETİLMİŞ (artboard'larda yok; CONTEXT listesindeki eksikler) ──
  chevronUp: ["<path d=\"m18 15-6-6-6 6\"></path>", "2", "stroke"], // TÜRETİLMİŞ (chevronDown'un aynası; artboard'da yok)
  phone: ["<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"></path>", "1.8", "stroke"], // TÜRETİLMİŞ (Feather 'phone', MIT; artboard'da telefon ahizesi yok)
  settings: ["<circle cx=\"12\" cy=\"12\" r=\"3\"></circle><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z\"></path>", "1.8", "stroke"], // TÜRETİLMİŞ (Feather 'settings', MIT; tasarımda ayar dişlisi yok → önce 'sliders' tercih et)
  // ── adım 2 (kabuklar) eklemeleri ──
  menu: ["<path d=\"M4 7h16M4 12h16M4 17h16\"></path>", "2", "stroke"], // TÜRETİLMİŞ (hamburger; artboard'da yok — kanvas notu 769–1023 hamburger)
  sparklesAdmin: ["<path d=\"M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z\"></path><path d=\"M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z\"></path>", "2", "stroke"], // WebAdmin VIP sekmesi (birebir)
  compassAdmin: ["<circle cx=\"12\" cy=\"12\" r=\"9\"></circle><path d=\"m15.5 8.5-2 5-5 2 2-5z\"></path>", "2", "stroke"], // WebAdmin Keşfet ekranı / önizleme (birebir)
  shieldCheck2: ["<path d=\"M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z\"></path><path d=\"m9 12 2.2 2.2L15.5 10\"></path>", "1.9", "stroke"], // WebAdminGiris rozet/özellik (birebir)
  lockAuth: ["<rect x=\"4.5\" y=\"10.5\" width=\"15\" height=\"10\" rx=\"2\"></rect><path d=\"M8 10.5V7.5a4 4 0 0 1 8 0v3\"></path>", "1.9", "stroke"], // WebAdminGiris kilit (birebir)
  micAuth: ["<path d=\"M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3\"></path>", "1.9", "stroke"], // AuthSplit özellik satırı (birebir)
  buildingAuth: ["<path d=\"M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3\"></path>", "1.9", "stroke"], // AuthSplit özellik satırı (birebir)
};

// Eşanlamlı adlar (aynı ikon)
export const ICON_ALIASES = {"route": "navigation", "message": "chat", "close": "x", "location": "pin", "venue": "building", "trash3": "trash", "calendarAlt": "calendar", "qrCode": "qr", "notifications": "bell", "favorite": "heart", "people": "users", "dots": "more", "loader": "spinner", "back": "arrowLeft", "next": "arrowRight"};

export const hasIcon = (name) => !!(ICONS[name] || ICONS[ICON_ALIASES[name]]);

// SVG öğesi üret (DOM). opts:
//   size (px, varsayılan 18) · sw (stroke-width; varsayılan: ikonun artboard değeri) · color (stroke ya da fill rengi; "currentColor")
//   fill: true → dolgulu çiz (örn. dolu kalp) · stroke: true → dolgulu ikonu çizgi olarak çiz (örn. nav'daki yıldız)
//   cls · style (obje ya da string) · label (verilirse role="img" + aria-label; yoksa aria-hidden) · attrs (ek öznitelikler)
export function svgIcon(name, opts = {}) {
  const def = ICONS[name] || ICONS[ICON_ALIASES[name]];
  if (!def) { console.warn("[dk icons] bilinmeyen ikon:", name); return svgRaw("", opts); }
  const [inner, sw, kind] = def;
  const filled = opts.stroke ? false : (opts.fill === true || kind === "fill");
  return svgRaw(inner, { ...opts, _kind: kind, fill: filled, sw: opts.sw ?? sw ?? "2" });
}

// Ham gövdeden SVG (artboard'dan birebir kopyalanan nadir ikonlar için)
export function svgRaw(inner, opts = {}) {
  const { size = 18, sw = "2", color = "currentColor", fill = false, cls, style, label, attrs, viewBox = "0 0 24 24", _kind } = opts;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(opts.width ?? size));
  svg.setAttribute("height", String(opts.height ?? size));
  svg.setAttribute("viewBox", viewBox);
  if (_kind === "multi") {
    // çok renkli logo: renkler iç path'lerde
  } else if (fill) {
    svg.setAttribute("fill", color);
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", color);
    svg.setAttribute("stroke-width", String(sw));
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  }
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); }
  else svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  if (style) { if (typeof style === "string") svg.setAttribute("style", style); else Object.entries(style).forEach(([k, v]) => { if (v != null) svg.style.setProperty(k.startsWith("--") ? k : k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), String(v)); }); }
  if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v != null && v !== false) svg.setAttribute(k, v === true ? "" : String(v)); });
  svg.innerHTML = inner; // SVG bağlamında ayrıştırılır (path/circle/rect SVG ad alanında oluşur)
  return svg;
}

// Tek path dizgisinden ikon (artboard DCLogic'lerindeki `icon: 'M…'` değerleri için)
export const svgPath = (d, opts = {}) => svgRaw(`<path d="${String(d).replace(/"/g, "&quot;")}"></path>`, opts);

// HTML dizgisi (şablon/innerHTML içinde kullanmak için). Aynı seçenekler.
export function iconHTML(name, opts = {}) { return svgIcon(name, opts).outerHTML; }
