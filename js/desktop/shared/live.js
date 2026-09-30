// CANLI SAYAÇLAR — okunmamış bildirim/mesaj (tek onSnapshot çifti, kullanıcı başına, referans sayımlı) +
// Hesabım kenar menüsü sayaçları (accountCounts: tek önbellekli yükleyici). Sahibi: foundation adım 2.
// Kabuklar (PublicHeader, AccountLayout, PanelShell) aynı uid için aynı dinleyiciyi paylaşır; son abone ayrıldıktan
// 2 sn sonra dinleyiciler kapanır (rota geçişlerinde kapat/aç dalgalanması olmasın).
import { listenNotifications, listenConversations, attendedEvents, followingList, favVenues, favEvents, myReviews, eventStartMs } from "../../data.js";

const GRACE_MS = 2000;
const stores = new Map(); // uid → { subs:Set, state, unN, unC, timer }

function emit(st) { st.subs.forEach((fn) => { try { fn(st.state); } catch (e) { console.error(e); } }); }

// fn(state) → state = { notifications:[], unreadNotifs:n, conversations:[], unreadMessages:n, ready:{n,c} }
// Dönüş: aboneliği kaldıran fonksiyon. uid yoksa (misafir) hiçbir şey dinlenmez.
export function subscribeLive(uid, fn, { notifications = true, messages = true } = {}) {
  if (!uid) return () => {};
  let st = stores.get(uid);
  if (!st) {
    st = { subs: new Set(), state: { notifications: [], unreadNotifs: 0, conversations: [], unreadMessages: 0, ready: { n: false, c: false } }, unN: null, unC: null, timer: null, wantN: false, wantC: false };
    stores.set(uid, st);
  }
  clearTimeout(st.timer); st.timer = null;
  if (notifications && !st.unN) {
    st.unN = listenNotifications(uid, (list) => {
      st.state = { ...st.state, notifications: list, unreadNotifs: list.filter((x) => !x.read).length, ready: { ...st.state.ready, n: true } };
      emit(st);
    });
  }
  if (messages && !st.unC) {
    st.unC = listenConversations(uid, (list) => {
      st.state = { ...st.state, conversations: list, unreadMessages: list.reduce((a, c) => a + (Number(c.unread) || 0), 0), ready: { ...st.state.ready, c: true } };
      emit(st);
    });
  }
  st.subs.add(fn);
  try { fn(st.state); } catch (e) { console.error(e); }
  return () => {
    st.subs.delete(fn);
    if (st.subs.size) return;
    clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      if (st.subs.size) return;
      try { st.unN?.(); } catch (_) {}
      try { st.unC?.(); } catch (_) {}
      stores.delete(uid);
    }, GRACE_MS);
  };
}
// Son bilinen durum (abonelik açmaz)
export const liveState = (uid) => stores.get(uid)?.state || null;

// ── Hesabım sayaçları ──
// { tickets: yaklaşan/aktif bilet (başlangıç + 6 sa > şimdi), attended: katıldığı tüm etkinlikler (legacy Katıldıklarım ve Profil
//   "KATILDIĞI" ile aynı), following: takip, favorites: takip + favori mekan + favori etkinlik (Profil notu), reviews: yorum }
// Tek önbellek (uid başına, 60 sn). Yazan sayfalar invalidateAccountCounts(uid) çağırır.
const TICKET_TAIL = 6 * 3600e3;
const _cache = new Map(); // uid → { at, promise }
export function accountCounts(uid, { force = false, maxAge = 60000 } = {}) {
  if (!uid) return Promise.resolve({ tickets: 0, attended: 0, following: 0, favorites: 0, reviews: 0 });
  const c = _cache.get(uid);
  if (!force && c && Date.now() - c.at < maxAge) return c.promise;
  const safe = (p) => p.catch(() => null);
  const promise = Promise.all([safe(attendedEvents(uid)), safe(followingList(uid)), safe(favVenues(uid)), safe(favEvents(uid)), safe(myReviews(uid))])
    .then(([att, fol, fv, fe, rv]) => {
      const now = Date.now();
      const len = (x) => (Array.isArray(x) ? x.length : 0);
      const tickets = Array.isArray(att) ? att.filter((e) => { const s = eventStartMs(e); return s == null || s + TICKET_TAIL > now; }).length : 0;
      return { tickets, attended: len(att), following: len(fol), favorites: len(fol) + len(fv) + len(fe), reviews: len(rv) };
    });
  _cache.set(uid, { at: Date.now(), promise });
  promise.catch(() => _cache.delete(uid));
  return promise;
}
export function invalidateAccountCounts(uid) { if (uid) _cache.delete(uid); else _cache.clear(); }
