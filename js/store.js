// Oturum durumu — Auth kullanıcısı + Firestore profil dokümanı (users/{uid}).
import { auth, db, doc, getDoc, onAuthStateChanged, signOut } from "./firebase.js";

export const OWNER_EMAIL = "berkayer032@gmail.com";

export const session = {
  user: null,     // Firebase Auth user
  profile: null,  // users/{uid} dokümanı ({ userType, approved, displayName, ... })
  isAdmin: false, // owner e-postası ya da adminUids/{uid}
  ready: false,
};

export async function computeIsAdmin(user) {
  if (!user) return false;
  if ((user.email || "").toLowerCase() === OWNER_EMAIL) return true;
  try { return (await getDoc(doc(db, "adminUids", user.uid))).exists(); } catch { return false; }
}

const listeners = new Set();
export function onSession(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(session)); }

// Auth durumunu dinle; profil dokümanını çek. app.js router'ı buna bağlar.
export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    session.user = user;
    session.profile = null;
    session.isAdmin = false;
    if (user) {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        session.profile = snap.exists() ? { id: user.uid, ...snap.data() } : null;
      } catch (_) { session.profile = null; }
      session.isAdmin = await computeIsAdmin(user);
    }
    session.ready = true;
    emit();
  });
}

export async function refreshProfile() {
  if (!session.user) return;
  const snap = await getDoc(doc(db, "users", session.user.uid));
  session.profile = snap.exists() ? { id: session.user.uid, ...snap.data() } : null;
  emit();
}

// E-posta doğrulama durumunu SUNUCUDAN tazele (kullanıcı bağlantıya tıkladıktan sonra).
// user.reload() emailVerified'ı günceller; sonra router'ı tetiklemek için emit.
export async function recheckEmailVerified() {
  if (auth.currentUser) {
    try { await auth.currentUser.reload(); } catch (_) {}
    session.user = auth.currentUser;
  }
  emit();
}

export async function logout() {
  await signOut(auth);
  location.hash = "#/";
}

// Rol + onay durumundan hedef rota
export function homeRouteFor(profile) {
  if (!profile) return "#/setup"; // Google ile yeni giriş → rol seç + hesabı tamamla
  const t = profile.userType;
  if ((t === "venue" || t === "organizer") && profile.approved === false) return "#/pending";
  if (t === "venue") return "#/venue";
  if (t === "organizer") return "#/organizer";
  return "#/unsupported";
}
