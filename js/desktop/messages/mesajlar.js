// WebMesajlar — masaüstü görünümü (≥769 px). Registry anahtarı: mesajlar (#/mesajlar).
// Spec: specs/hesap.md § WebMesajlar · Artboard: design/WebMesajlar.dc.html (sahibinin CLAUDE CODE notu uygulandı).
// CSS: css/dk-mesajlar.css — tüm seçiciler .dk-mesajlar kökü / .dk-mesajlar-* sınıfları altında.
//
// Kabuk: publicShell (Mesajlar ikonu aktif varyantı + okunmamış rozeti + prizma çubuğu; 100vh, footer YOK).
// Gövde: js/desktop/messages/chat.js createChat({ variant: "listener" }) → 340 / esnek / 300 (≥1280) · 300 / esnek (1024–1279) ·
//        tek bölmeli liste → sohbet → geri akışı (769–1023). Ayrıntılar + korunan legacy davranışları: chat.js başlığı.
// Misafir (anonim oturum): legacy messagesView misafir dalı → "Mesajlaşmak için giriş yap" + "Giriş Yap" (masaüstünde giriş modalı).
// URL: #/mesajlar?c={convId} (replaceState). update(query) → konuşma seçimi; onSession → aynı kimlikte yeniden kurulmaz.
import { h } from "../../ui.js";
import { session } from "../../store.js";
import { publicShell } from "../shared/public-shell.js";
import { svgRaw, svgIcon } from "../shared/icons.js";
import { dkButton } from "../shared/ui.js";
import { openLogin } from "../shared/overlays.js";
import { createChat } from "./chat.js";

export function mesajlarView(ctx) {
  const s = ctx.session || session;
  const guest = !s.user || s.guest;
  const shell = publicShell({ active: null, activeIcon: "mesajlar", fullHeight: true, footer: false, area: "account", role: "customer" });
  const root = h("div", { class: "dk-mesajlar" });
  shell.main.append(root);

  if (guest) {
    root.classList.add("dk-mesajlar-guest");
    root.append(h("div", { class: "dk-mesajlar-gate dk-rise" },
      h("span", { class: "dk-mesajlar-gring", "aria-hidden": "true" },
        svgRaw('<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"></path>', { size: 28, sw: "1.6" })),
      h("h1", { class: "dk-mesajlar-gt" }, "Mesajlaşmak için giriş yap"),
      h("p", { class: "dk-mesajlar-gs" }, "Sohbet başlatmak ve mesajlarını görmek için bir hesapla giriş yapmalısın."),
      dkButton("Giriş Yap", { variant: "primary", size: 44, icon: svgIcon("login", { size: 15 }), href: "#/login",
        onClick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openLogin(); } })));
    return { node: shell.node, destroy() { shell.destroy(); } };
  }

  const chat = createChat({ host: root, ns: "dk-mesajlar", variant: "listener", role: "customer", ctx });
  return {
    node: shell.node,
    destroy() { chat.destroy(); shell.destroy(); },
    update(query) { chat.update(query); },
    onSession(sess) { return chat.onSession(sess); },
  };
}
