// VERGİ DURUMU AÇIKLAMALARI — Vergi Bilgileri formunda seçilen kategoriye göre gösterilir (sade dil, kanun dayanaklı).
// Uygulama eşi: src/data/taxInfo.ts — metinler birlikte güncellenir. Arızi beyan sürümü sunucuda: functions/finance.js
// ARIZI_NOTICE_VERSION (metin değişirse sürüm de artırılır → kullanıcı yeniden onaylar).
// Dayanak: GVK md. 65, 82, 86, 94/1-2-b, 103 · VUK md. 8, 11, 234, 236 · 332 No.lu GVGT (2026 arızi istisna 350.000 TL).
// Not: bilgi amaçlıdır; kesin durum mali müşavir onayına bağlıdır (raporda "Muhtemel" işaretli noktalar).

export const ARIZI_LIMIT_TL = 350000;

export const TAX_INFO = {
  A: {
    title: "Vergi kaydın yoksa (ara sıra sahne alan sanatçı)",
    points: [
      "Ara sıra sahne alıp ücret alıyorsan bu gelir kanunda \"arızi serbest meslek kazancı\" sayılır (Gelir Vergisi Kanunu md. 82). Vergi dairesine kayıt olmadan çalışabilirsin.",
      "Ücretinden %20 gelir vergisi stopajı kesilir (GVK md. 94). Mekan şirket ya da gerçek usul işletmeyse stopajı mekan keser ve senin adına vergi dairesine yatırır.",
      "Vergi kaydın olmadığı için ücrete KDV eklenmez. Fatura ya da makbuz kesmezsin; mekan senin adına gider pusulası düzenler, sen imzalarsın (VUK md. 234).",
      "2026 yılında bütün arızi kazançlarının toplamı 350.000 TL'ye kadar yıllık beyannameye girmez (GVK md. 82, 332 No.lu Tebliğ). Bu sınır GigBridge dışındaki işlerini de kapsar.",
      "Yıl içinde 350.000 TL'yi aşarsan yıllık gelir vergisi beyannamesi vermen gerekir. Sahneyi sürekli ve düzenli iş olarak yapıyorsan artık \"arızi\" sayılmazsın: vergi dairesine kayıt olup şahıs şirketi (serbest meslek mükellefiyeti) açman gerekir.",
      "Bir mekanda sabit günlerde, mekanın talimatıyla düzenli çalışıyorsan (resident DJ gibi) bu ilişki ücretli çalışma sayılabilir; mekanın seni sigortalı göstermesi gerekebilir.",
    ],
    example: "10.000 TL'lik işte: %20 stopaj 2.000 TL (mekan yatırır) · GigBridge komisyonu %10 + KDV 1.200 TL → sana yaklaşık 6.800 TL kalır.",
  },
  B: {
    title: "Şahıs şirketin varsa (serbest meslek mükellefi)",
    points: [
      "Her iş için e-Serbest Meslek Makbuzu (e-SMM) düzenlersin (VUK md. 236). KDV mükellefiysen makbuza %20 KDV eklenir; KDV'yi sen beyan edip ödersin.",
      "Mekan şirket ya da gerçek usul işletmeyse ücretinden %20 stopaj keser (GVK md. 94). Kesilen bu tutar yıllık beyannamende ödeyeceğin vergiden düşülür.",
      "Her yıl gelir vergisi beyannamesi verirsin; vergi kazancına göre artan oranlıdır (%15–%40, GVK md. 103). Giderlerini düşebilirsin.",
      "Bağ-Kur (SGK 4/b) primi ödersin. 350.000 TL sınırı ve \"arızi\" kuralı sana uygulanmaz.",
    ],
    example: "10.000 TL + 2.000 TL KDV'li makbuzda: mekan 2.000 TL stopaj keser, sana 10.000 TL ödenir (2.000 TL'si KDV, devlete ödersin) · GigBridge komisyonu %10 + KDV 1.200 TL.",
  },
  C: {
    title: "Limited / anonim şirketin ya da ajansın varsa",
    points: [
      "Şirketin mekana e-Fatura ya da e-Arşiv fatura keser (%20 KDV).",
      "Şirkete yapılan ödemeden %20 serbest meslek stopajı kesilmez; şirket kazancı üzerinden kurumlar vergisi öder.",
      "Platform üzerinden yapılan ödemelerde %1 e-ticaret vergi kesintisi uygulanabilir (GVK md. 94/19); uygulanırsa ödeme dökümünde gösterilir.",
    ],
    example: "10.000 TL + 2.000 TL KDV'li faturada: stopaj yok · GigBridge komisyonu %10 + KDV 1.200 TL.",
  },
};

/** Vergi kaydı olmayan sanatçının kabul ettiği beyan (sunucu ariziAccepted ister). */
export const ARIZI_DECLARATION =
  "Vergi kaydım olmadığını beyan ederim. Yukarıdaki bilgileri okudum. Bir takvim yılında arızi kazançlarımın toplamı 350.000 TL'yi aşarsa "
  + "yıllık beyanname vermek, sahne işini düzenli yapmaya başlarsam vergi dairesine kayıt olup şahıs şirketi açmak benim sorumluluğumdadır. "
  + "Bu yükümlülükleri yerine getirmememden ya da beyanımın yanlış olmasından doğacak vergi, ceza ve faizlerden GigBridge sorumlu değildir. "
  + "GigBridge'in ve mekanın kanundan doğan vergi kesintisi ve bildirim yükümlülükleri bu beyandan etkilenmez.";

export const TAX_INFO_NOTE = "Bilgi amaçlıdır; kendi durumun için mali müşavirine danış.";
