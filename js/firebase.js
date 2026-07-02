// Firebase — AYNI proje (djing-ba986). Web istemci anahtarları PUBLIC'tir.
// Güvenlik Firestore/Storage kurallarıyla sağlanır.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

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

// Sayfaların tek yerden alması için Firebase fonksiyonlarını yeniden dışa aktar
export {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, increment, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
