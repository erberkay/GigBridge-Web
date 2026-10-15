// VERGİ DURUMU AÇIKLAMALARI — Vergi Bilgileri formunda seçilen kategoriye göre gösterilir (sade dil, kanun dayanaklı).
// Uygulama eşi: src/data/taxInfo.ts — metinler birlikte güncellenir. Arızi beyan sürümü sunucuda: functions/finance.js
// ARIZI_NOTICE_VERSION (metin değişirse sürüm de artırılır → kullanıcı yeniden onaylar).
// MODEL "Yol A" (2026-10-16): sanatçı kiralamada GigBridge sahne hizmetini sanatçıdan SATIN ALIR, mekana SATAR.
//   Mekan: teklif bedeli + hizmet bedeli + %20 KDV öder, GigBridge'den ajans ve organizasyon hizmeti faturası (e-Fatura/e-Arşiv) alır; stopaj kesmez,
//   gider pusulası düzenlemez. A sanatçıda gider pusulası ve imzalanacak belge YOK: ödeme etkinlikten 16 gün sonra PayTR'den
//   yapılır (sunucu config payoutDelayDays), PayTR dekontu ödeme kaydıdır.
//   Sanatçıya ödenen bedel = teklif bedeli − GigBridge payı (varsayılan %10). Stopajı (GVK 94/2-b) GigBridge keser, muhtasarla yatırır.
//   PayTR masrafı (%1,99, vergiler dahil; mekanın ödediği toplam üzerinden) sanatçı ödemesinden düşülür.
//   Mekan kiralama (organizatör → mekan) eski aracılık modelinde kalır.
// Dayanak: GVK md. 65, 82, 86, 94/1-2-b, 103 · VUK md. 8, 11, 229, 234, 236 · KDVK md. 1 · 332 No.lu GVGT (2026 arızi istisna 350.000 TL).
// Not: bilgi amaçlıdır; vergi danışmanlığı yerine geçmez.

export const ARIZI_LIMIT_TL = 350000;

export const TAX_INFO = {
  A: {
    title: "Vergi kaydın yoksa (düzenli ya da ara sıra sahne alan sanatçı)",
    points: [
      "Sanatçı kiralamada sahne hizmetini GigBridge senden satın alır ve mekana satar. Sana ödenen bedel, teklif bedelinden GigBridge payı (%10) düşülerek bulunur.",
      "Vergi kaydın yoksa aldığın ücret kanunda \"arızi serbest meslek kazancı\" sayılır (Gelir Vergisi Kanunu md. 82). Vergi dairesine kayıt olmadan çalışabilirsin.",
      "Ücretinden %20 gelir vergisi stopajını GigBridge keser ve senin adına vergi dairesine yatırır (GVK md. 94/2-b). Mekan senden stopaj kesmez.",
      "Vergi kaydın olmadığı için ücretine KDV eklenmez. Fatura ya da makbuz kesmezsin. Ödemen etkinlikten 16 gün sonra PayTR üzerinden hesabına geçer; stopajı GigBridge keser ve yatırır. Ayrıca imzalaman gereken bir belge yok.",
      "2026 yılında bütün arızi kazançlarının toplamı 350.000 TL'ye kadar yıllık beyannameye girmez (GVK md. 82, 332 No.lu Tebliğ). Bu sınır GigBridge dışındaki işlerini de kapsar.",
      "Yıl içinde 350.000 TL'yi aşarsan yıllık gelir vergisi beyannamesi vermen gerekir. Sahneyi sürekli ve düzenli iş olarak yapıyorsan artık \"arızi\" sayılmazsın: vergi dairesine kayıt olup şahıs şirketi (serbest meslek mükellefiyeti) açman gerekir. Kendi vergi kaydın ve beyanların senin sorumluluğundadır; GigBridge bunlardan sorumlu değildir.",
      "GigBridge işverenin değildir: bağımsız çalışırsın, teklifleri serbestçe seçer ya da reddedersin, fiyatını kendin belirlersin, başka yerlerde de çalışabilirsin. Aranızda iş ilişkisi ve SGK sigortalılığı doğmaz.",
    ],
    example: "Teklif ücreti 10.000 TL (mekan üstüne hizmet bedeli + KDV öder). Senin bedelin 9.000 TL (GigBridge payı %10) · %20 stopaj 1.800 TL (GigBridge yatırır) · PayTR masrafı %1,99 = 238,80 TL → sana 6.961,20 TL ödenir.",
  },
  B: {
    title: "Şahıs şirketin varsa (serbest meslek mükellefi)",
    points: [
      "Sanatçı kiralamada sahne hizmetini GigBridge senden satın alır ve mekana satar. Sana ödenen bedel, teklif bedelinden GigBridge payı (%10) düşülerek bulunur.",
      "Her iş için GigBridge adına e-Serbest Meslek Makbuzu (e-SMM) düzenlersin (VUK md. 236). Serbest meslek mükellefi her durumda KDV mükellefidir: makbuza %20 KDV eklenir; KDV'yi sen beyan edip ödersin.",
      "GigBridge ücretinden (KDV hariç tutardan) %20 stopaj keser ve vergi dairesine yatırır (GVK md. 94/2-b). Kesilen bu tutar yıllık beyannamende ödeyeceğin vergiden düşülür. Mekan senden stopaj kesmez.",
      "Her yıl gelir vergisi beyannamesi verirsin; vergi kazancına göre artan oranlıdır (%15–%40, GVK md. 103). Giderlerini düşebilirsin.",
      "Bağ-Kur (SGK 4/b) primini kendin ödersin. 350.000 TL sınırı ve \"arızi\" kuralı sana uygulanmaz. GigBridge işverenin değildir; bağımsız çalışırsın.",
    ],
    example: "Teklif ücreti 10.000 TL (mekan üstüne hizmet bedeli + KDV öder). GigBridge'e 9.000 TL + 1.800 TL KDV'li e-SMM düzenlersin · GigBridge 1.800 TL stopaj keser · PayTR masrafı 238,80 TL → sana 8.761,20 TL ödenir (1.800 TL'si KDV, devlete ödersin).",
  },
  C: {
    title: "Limited / anonim şirketin ya da ajansın varsa",
    points: [
      "Sanatçı kiralamada sahne hizmetini GigBridge şirketinden satın alır ve mekana satar. Şirketine ödenen bedel, teklif bedelinden GigBridge payı (%10) düşülerek bulunur.",
      "Şirketin GigBridge adına e-Fatura ya da e-Arşiv fatura keser (%20 KDV). KDV'yi şirketin beyan edip öder.",
      "Şirkete yapılan ödemeden stopaj kesilmez; şirket kazancı üzerinden kurumlar vergisi öder.",
    ],
    example: "Teklif ücreti 10.000 TL (mekan üstüne hizmet bedeli + KDV öder). Şirketin GigBridge'e 9.000 TL + 1.800 TL KDV'li fatura keser · stopaj yok · PayTR masrafı 238,80 TL → şirketine 10.561,20 TL ödenir (1.800 TL'si KDV).",
  },
};

/** Vergi kaydı olmayan sanatçının kabul ettiği beyan (sunucu ariziAccepted ister). */
export const ARIZI_DECLARATION =
  "Vergi kaydım olmadığını beyan ederim. Yukarıdaki bilgileri okudum. GigBridge'in sahne hizmetimi satın aldığını, ödememden %20 gelir vergisi "
  + "stopajını keserek benim adıma vergi dairesine yatıracağını, ödememin etkinlikten 16 gün sonra PayTR üzerinden "
  + "hesabıma geçeceğini ve ayrıca imzalamam gereken bir belge olmadığını biliyorum. "
  + "Bir takvim yılında arızi kazançlarımın toplamı 350.000 TL'yi aşarsa yıllık beyanname vermek, sahne işini sürekli ve düzenli yapıyorsam "
  + "vergi dairesine kayıt olup şahıs şirketi açmak benim sorumluluğumdadır; GigBridge kendi vergi kaydım ve beyanlarımdan sorumlu değildir. "
  + "Bu yükümlülükleri yerine getirmememden ya da beyanımın yanlış olmasından doğacak vergi, ceza ve faizlerden GigBridge sorumlu değildir. "
  + "GigBridge'in işverenim olmadığını; teklifleri serbestçe kabul ya da reddedebildiğimi, fiyatımı kendim belirlediğimi, başka yerlerde de "
  + "çalışabildiğimi ve aramızda iş ilişkisi ya da SGK sigortalılığı doğmadığını kabul ederim. "
  + "GigBridge'in kanundan doğan vergi kesintisi ve bildirim yükümlülükleri bu beyandan etkilenmez.";

export const TAX_INFO_NOTE = "Bilgi amaçlıdır, vergi danışmanlığı yerine geçmez; kendi durumun için mali müşavirine danış.";
