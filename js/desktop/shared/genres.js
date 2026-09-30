// Tür (genre) → aile → renk/gradyan. Masaüstü TEK renk haritası (kart rozetleri, çipler, harita pinleri, noktalar).
// Aileler tasarımdan (artboard'lar: WebKesfet/WebHarita/WebSanatci*/WebTakip…); gerçek veride 41 tür var
// (app src/data/genres.ts = venue.js/artist.js GENRES). Karşılaştırma fold() ile (büyük/küçük harf + Türkçe aksan duyarsız).
import { fold, trUpper, rgba } from "./helpers.js";

// Aile tanımları: color = düz renk (tasarım), dark = gradyan koyu ucu, label = filtre çipi etiketi
export const GENRE_FAMILIES = {
  jazz:         { key: "jazz",         label: "Jazz",         color: "#FF8A2A", dark: "#B45309" },
  electronic:   { key: "electronic",   label: "Electronic",   color: "#A78BFA", dark: "#6D28D9" },
  rock:         { key: "rock",         label: "Rock",         color: "#FF5A6E", dark: "#BE123C" },
  pop:          { key: "pop",          label: "Pop",          color: "#EC4899", dark: "#BE185D" },
  akustik:      { key: "akustik",      label: "Akustik",      color: "#7CE0B0", dark: "#047857" },
  hiphop:       { key: "hiphop",       label: "Hip-Hop",      color: "#F97316", dark: "#C2410C" },
  rnb:          { key: "rnb",          label: "R&B",          color: "#4ED8FF", dark: "#0891B2" },   // R&B + Indie
  enstrumantal: { key: "enstrumantal", label: "Enstrümantal", color: "#FFD700", dark: "#B45309" },
  other:        { key: "other",        label: "Diğer",        color: "#A3A7AF", dark: "#4A4A6A" },   // yedek
};
// Filtre çiplerinin sırası (tasarımdaki 7 aile; "Enstrümantal" yalnız sanatçı tarafında görünür)
export const FILTER_FAMILIES = ["jazz", "electronic", "rock", "pop", "akustik", "hiphop", "rnb"];

// Uygulamadaki tüm tür adları (app GENRES + "Diğer") — form seçicileri için tek liste
export const ALL_GENRES = [
  "House", "Tech House", "Deep House", "Techno", "Melodic Techno", "Minimal", "Afro House", "Organic House", "Trance", "Electronic", "Disco",
  "Türkçe Pop", "Türkçe Rock", "Türkçe Rap", "Arabesk", "Fasıl", "Türk Halk Müziği", "Türk Sanat Müziği", "Türkü", "Oyun Havası", "Roman Havası", "Anadolu Rock", "Özgün Müzik", "Slow", "Damar",
  "Pop", "Rock", "Jazz", "Blues", "Klasik", "Hip-Hop", "Rap", "R&B", "Reggae", "Funk", "Soul", "Latin", "Akustik", "Alternatif", "Metal", "Diğer",
];

// Tür adı → aile. Kodda geçen TÜM tür dizgileri (app GENRES, venue GENRE_FILTERS/GENRE_GRADS "Pop Rock",
// customer GENRE_GRADS anahtarları, tasarımdaki "Indie"/"Enstrümantal"/"EDM"). Anahtarlar fold() biçiminde.
const FAMILY_OF = {};
const put = (fam, names) => names.forEach((n) => { FAMILY_OF[fold(n)] = fam; });
put("electronic", ["Electronic", "Elektronik", "House", "Tech House", "Deep House", "Techno", "Melodic Techno", "Minimal", "Afro House", "Organic House", "Trance", "Disco", "EDM", "Drum & Bass", "Dubstep"]);
put("jazz", ["Jazz", "Caz", "Blues", "Soul", "Funk", "Swing"]);
put("rock", ["Rock", "Türkçe Rock", "Anadolu Rock", "Alternatif", "Alternative", "Metal", "Pop Rock", "Punk", "Grunge"]);
put("pop", ["Pop", "Türkçe Pop", "Slow", "Latin"]);
put("akustik", ["Akustik", "Acoustic", "Türkü", "Türk Halk Müziği", "Türk Sanat Müziği", "Fasıl", "Özgün Müzik"]);
put("hiphop", ["Hip-Hop", "Hip Hop", "HipHop", "Rap", "Türkçe Rap", "Reggae", "Trap"]);
put("rnb", ["R&B", "RnB", "R and B", "Indie"]);
put("enstrumantal", ["Enstrümantal", "Instrumental", "Klasik", "Classical"]);
// Bilinçli olarak "other": Arabesk, Damar, Oyun Havası, Roman Havası, Diğer (+ bilinmeyen her şey)
put("other", ["Arabesk", "Damar", "Oyun Havası", "Roman Havası", "Diğer"]);

export function genreFamily(g) {
  const k = fold(g);
  if (!k) return GENRE_FAMILIES.other;
  return GENRE_FAMILIES[FAMILY_OF[k] || "other"];
}
export const genreFamilyKey = (g) => genreFamily(g).key;
export const genreColor = (g) => genreFamily(g).color;
// Yumuşak kenar (tasarım: 0.5 alfa) / zemin tonu (0.08–0.12)
export const genreSoft = (g, a = 0.5) => rgba(genreColor(g), a);
export const genreTint = (g, a = 0.1) => rgba(genreColor(g), a);
// Görselsiz kartlar için gradyan (135°, düz → koyu)
export function genreGrad(g, angle = 135) { const f = genreFamily(g); return `linear-gradient(${angle}deg, ${f.color}, ${f.dark})`; }
// Kartta gösterilen etiket = GERÇEK ilk tür, TR büyük harf ("TÜRKÇE POP"); renk ailesinden
export const genreLabel = (g) => trUpper(g || "");
// Etkinlik/sanatçı → ilk tür
export const primaryGenre = (x) => {
  const g = Array.isArray(x?.genre) ? x.genre[0] : x?.genre ?? (Array.isArray(x?.genres) ? x.genres[0] : x?.genres);
  return g || "";
};
// Aile filtresi: seçili aile anahtarlarından biri etkinliğin türlerinden biriyle eşleşiyor mu
export function matchesFamilies(genres, famKeys) {
  if (!famKeys || !famKeys.length) return true;
  const list = Array.isArray(genres) ? genres : genres ? [genres] : [];
  return list.some((g) => famKeys.includes(genreFamilyKey(g)));
}
