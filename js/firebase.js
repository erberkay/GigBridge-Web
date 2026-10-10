// Firebase — AYNI proje (djing-ba986). NOT: apiKey bir SIR DEĞİLDİR; Firebase web
// istemci anahtarları tasarım gereği PUBLIC'tir (her web istemcisinde görünür).
// Veriye erişimi ANAHTAR değil, Firestore/Storage KURALLARI belirler. GitHub'ın
// "secret leak" uyarısı Firebase config için bilinen yanlış-pozitiftir. Sertleştirme:
// Google Cloud Console'da anahtarı HTTP-referrer ile kendi alan adına kısıtla.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword as _emuSignIn, signOut as _emuSignOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

// YEREL TEST (emülatör) MODU — yalnız localhost/127.0.0.1'de ve ?emu ile (ya da aynı sekmede
// daha önce ?emu ile açılmışsa: sessionStorage gb_emu=1) devreye girer. Üretimde (gigbridges.com)
// hostname kontrolü ilk koşul olduğu için hiçbir ek iş yapılmaz; config ve davranış aynen kalır.
const EMU = (() => {
  const host = location.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") return false;
  let on = false;
  try { on = new URLSearchParams(location.search).has("emu") || sessionStorage.getItem("gb_emu") === "1"; } catch (_) { on = false; }
  if (on) { try { sessionStorage.setItem("gb_emu", "1"); } catch (_) {} }
  return on;
})();

const firebaseConfig = EMU ? {
  projectId: "demo-gigbridge",
  apiKey: "demo-key",
  authDomain: "demo-gigbridge.firebaseapp.com",
  storageBucket: "demo-gigbridge.appspot.com",
  appId: "1:0:web:0",
} : {
  apiKey: "AIzaSyB6nrk5SnXMl51Qdpv_ctdFcWPrisiYbCc",
  authDomain: "djing-ba986.firebaseapp.com",
  projectId: "djing-ba986",
  storageBucket: "djing-ba986.firebasestorage.app",
  messagingSenderId: "70897940978",
  appId: "1:70897940978:web:37f6c8f2c36c454d43d36b",
  measurementId: "G-L3JMS6CWN5",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// europe-west1: fonksiyonlar Avrupa'ya taşındı (eur3 Firestore collocation). Bölge EŞLEŞMELİ.
export const functions = getFunctions(app, "europe-west1");

if (EMU) {
  connectAuthEmulator(auth, "http://127.0.0.1:9186", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8186);
  connectStorageEmulator(storage, "127.0.0.1", 9286);
  connectFunctionsEmulator(functions, "127.0.0.1", 5186);
  // Ekran görüntüsü/test betikleri için (yalnız emülatör modunda var).
  window.__gbEmu = {
    signIn: (e, p) => _emuSignIn(auth, e, p),
    signOut: () => _emuSignOut(auth),
  };
}
// Özel şifre sıfırlama e-postası (Cloud Function: sendPasswordReset, europe-west1)
export const sendPasswordResetMail = httpsCallable(functions, "sendPasswordReset");
// Diğer callable'lar (WebAdmin adminModerate — js/desktop/admin/report-detail.js)
export { httpsCallable };

export {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// Sayfaların tek yerden alması için Firebase fonksiyonlarını yeniden dışa aktar
export {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously,
  signOut, onAuthStateChanged, updateProfile, deleteUser,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendPasswordResetEmail, sendEmailVerification,
  EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, updatePassword,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

export {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, increment, Timestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
