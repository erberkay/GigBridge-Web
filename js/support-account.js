// "GigBridge Destek" SİSTEM HESABI — uygulama src/utils/supportAccount.ts ve sunucu functions/supportAccount.js ile AYNI kimlik.
// Yönetici (Admin › Kullanıcılar › "Destek mesajı gönder") bu hesap adına normal sohbet mesajı yazar (adminSendSupportMessage);
// kullanıcı Mesajlar'da görür ve yanıtlar. Bu hesapla giriş yapılamaz; istemci bu kimlikle yazamaz / sohbet açamaz (firestore.rules).
export const SUPPORT_UID = "gigbridge-destek";
export const SUPPORT_NAME = "GigBridge Destek";
export const isSupportUid = (uid) => uid === SUPPORT_UID;
// users dokümanı destek/sistem hesabı mı (listelerden elemek için)
export const isSupportUserDoc = (id, data) => id === SUPPORT_UID || data?.userType === "support" || data?.systemAccount === true;
