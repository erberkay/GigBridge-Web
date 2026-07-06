// Firebase — AYNI proje (djing-ba986). NOT: apiKey bir SIR DEĞİLDİR; Firebase web
// istemci anahtarları tasarım gereği PUBLIC'tir (her web istemcisinde görünür).
// Veriye erişimi ANAHTAR değil, Firestore/Storage KURALLARI belirler. GitHub'ın
// "secret leak" uyarısı Firebase config için bilinen yanlış-pozitiftir. Sertleştirme:
// Google Cloud Console'da anahtarı HTTP-referrer ile kendi alan adına kısıtla.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

const firebaseConfig = {
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
// Özel şifre sıfırlama e-postası (Cloud Function: sendPasswordReset, europe-west1)
export const sendPasswordResetMail = httpsCallable(functions, "sendPasswordReset");

export {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// Sayfaların tek yerden alması için Firebase fonksiyonlarını yeniden dışa aktar
export {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously,
  signOut, onAuthStateChanged, updateProfile, deleteUser,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendPasswordResetEmail, sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

export {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, increment, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
