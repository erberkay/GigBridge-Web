// Önyükleme + hash router + rol/onay guard'ları.
import { initAuth, session, onSession, homeRouteFor } from "./store.js";
import { landing, login, register, pending, adminLogin, unsupported, setup } from "./pages/auth.js";
import { adminPage } from "./pages/admin.js";
import { venuePage } from "./pages/venue.js";
import { organizerPage } from "./pages/organizer.js";
import { mount, h } from "./ui.js";

const PUBLIC = ["#/", "#/login", "#/register", "#/yonetici"];

function base(hash) { return (hash || "#/").split("?")[0]; }
function matches(b, prefix) { return b === prefix || b.startsWith(prefix + "/"); }

function resolve() {
  const b = base(location.hash);
  const s = session;

  // Yönetici oturumu her şeyin önünde
  if (s.isAdmin) return matches(b, "#/admin") ? b : "#/admin";

  const authed = !!s.user;
  if (!authed) return PUBLIC.includes(b) ? b : "#/";

  // Girişli (yönetici değil) → rol + onaya göre ev
  const home = homeRouteFor(s.profile); // #/venue | #/organizer | #/pending | #/unsupported
  if (b === "#/pending") return home;                         // onay bittiyse ev, değilse pending
  if (b === "#/unsupported") return home === "#/unsupported" ? b : home;
  if (matches(b, "#/venue")) return home === "#/venue" ? b : home;
  if (matches(b, "#/organizer")) return home === "#/organizer" ? b : home;
  return home; // public/auth rotaları veya bilinmeyen → ev
}

function render() {
  if (!session.ready) return; // boot spinner
  const target = resolve();
  if (target !== base(location.hash)) {
    location.hash = target; // yönlendir → hashchange tekrar render eder
    return;
  }
  const b = base(location.hash);
  let node;
  if (b === "#/") node = landing();
  else if (b === "#/login") node = login();
  else if (b === "#/register") node = register();
  else if (b === "#/pending") node = pending();
  else if (b === "#/yonetici") node = adminLogin();
  else if (b === "#/setup") node = setup();
  else if (b === "#/unsupported") node = unsupported();
  else if (matches(b, "#/admin")) node = adminPage();
  else if (matches(b, "#/venue")) node = venuePage();
  else if (matches(b, "#/organizer")) node = organizerPage();
  else node = landing();
  mount(node instanceof Node ? node : h("div", {}, "…"));
}

onSession(render);
window.addEventListener("hashchange", render);
initAuth();
