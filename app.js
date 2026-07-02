// GigBridge — Mekan üyeliği başvuru sayfası.
// AYNI Firebase projesine (djing-ba986) yazar; uygulamanın mekan kaydıyla BİREBİR
// aynı users/{uid} şemasını oluşturur → uygulama hesabı tanır, admin onayı bekler.
// Not: Firebase web istemci anahtarları PUBLIC'tir (gizli değildir), güvenle yayınlanır.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB6nrk5SnXMl51Qdpv_ctdFcWPrisiYbCc",
  authDomain: "djing-ba986.firebaseapp.com",
  projectId: "djing-ba986",
  storageBucket: "djing-ba986.firebasestorage.app",
  messagingSenderId: "70897940978",
  appId: "1:70897940978:web:37f6c8f2c36c454d43d36b",
  measurementId: "G-L3JMS6CWN5",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 81 il — şehir alanı için otomatik tamamlama
const PROVINCES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Aksaray","Amasya","Ankara","Antalya","Ardahan","Artvin",
  "Aydın","Balıkesir","Bartın","Batman","Bayburt","Bilecik","Bingöl","Bitlis","Bolu","Burdur",
  "Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Düzce","Edirne","Elazığ","Erzincan",
  "Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkâri","Hatay","Iğdır","Isparta","İstanbul",
  "İzmir","Kahramanmaraş","Karabük","Karaman","Kars","Kastamonu","Kayseri","Kilis","Kırıkkale","Kırklareli",
  "Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Mardin","Mersin","Muğla","Muş",
  "Nevşehir","Niğde","Ordu","Osmaniye","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas",
  "Şanlıurfa","Şırnak","Tekirdağ","Tokat","Trabzon","Tunceli","Uşak","Van","Yalova","Yozgat","Zonguldak",
];

const cityList = document.getElementById("cityList");
PROVINCES.forEach((p) => {
  const opt = document.createElement("option");
  opt.value = p;
  cityList.appendChild(opt);
});

const form = document.getElementById("signupForm");
const submitBtn = document.getElementById("submitBtn");
const msg = document.getElementById("msg");
const formCard = document.getElementById("formCard");
const successBox = document.getElementById("successBox");

function showError(text) {
  msg.textContent = text;
  msg.className = "msg error";
}

// Firebase Auth hata kodlarını Türkçeye çevir
function trError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Bu e-posta zaten kayıtlı. Uygulamadan giriş yapmayı dene.";
    case "auth/invalid-email":
      return "Geçersiz e-posta adresi.";
    case "auth/weak-password":
      return "Şifre çok zayıf. En az 6 karakter kullan.";
    case "auth/network-request-failed":
      return "İnternet bağlantı hatası. Tekrar dene.";
    case "auth/operation-not-allowed":
      return "E-posta/şifre girişi bu projede kapalı. Firebase konsolundan aç.";
    default:
      return "Başvuru gönderilemedi. Lütfen tekrar dene.";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.className = "msg";

  const displayName = document.getElementById("venueName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const city = document.getElementById("city").value.trim();
  const phone = document.getElementById("phone").value.trim();

  if (!displayName) return showError("Mekan adını gir.");
  if (!email) return showError("E-posta gir.");
  if (password.length < 6) return showError("Şifre en az 6 karakter olmalı.");

  submitBtn.disabled = true;
  submitBtn.textContent = "Gönderiliyor…";

  try {
    // 1) Firebase Auth hesabı oluştur
    const { user } = await createUserWithEmailAndPassword(auth, email, password);

    // 2) Auth profiline adı yaz (opsiyonel — asıl kaynak Firestore)
    try { await updateProfile(user, { displayName }); } catch (_) {}

    // 3) users/{uid} dokümanı — UYGULAMANIN MEKAN ŞEMASIYLA BİREBİR.
    //    approved:false → admin onayına düşer (uygulamada "onay bekleniyor" ekranı).
    await setDoc(doc(db, "users", user.uid), {
      displayName,
      email: user.email,
      userType: "venue",
      photoURL: null,
      createdAt: serverTimestamp(),
      approved: false,
      ...(city ? { city } : {}),
      ...(phone ? { phone } : {}),
    });

    // 4) Başarı ekranı
    form.classList.add("hidden");
    formCard.querySelector(".card-title").classList.add("hidden");
    successBox.classList.remove("hidden");
  } catch (err) {
    showError(trError(err && err.code));
    submitBtn.disabled = false;
    submitBtn.textContent = "Başvuruyu Gönder";
  }
});
