// WebPanelMesajlar — masaüstü görünümü (≥769 px). Registry anahtarları: artistMesaj, venueMesaj, orgMesaj
// (#/artist/mesaj, #/venue/mesaj, #/organizer/mesaj; rol = ctx.route.role).
// Spec: specs/sanatci.md § WebPanelMesajlar · Artboard: design/WebPanelMesajlar.dc.html (sahibinin CLAUDE CODE notu uygulandı).
// CSS: css/dk-panel-mesajlar.css — tüm seçiciler .dk-panel-mesajlar kökü / .dk-panel-mesajlar-* sınıfları altında.
//
// Kabuk: panelShell (rol rengi, Mesajlar nav öğesi aktif + canlı okunmamış rozeti kabuktan). Üst bar başlığı sayfa h1'i ("Mesajlar").
// Gövde: js/desktop/messages/chat.js createChat({ variant: "panel" }) → 320 / esnek / 280 (≥1280) · 320 / esnek (1024–1279) ·
//        tek bölmeli akış (769–1023). Sanatçı: teklif kartı (Evet/Hayır) + "SON TEKLİF" mekan özeti; mekan: gönderdiği tekliflerin
//        durumu + sanatçı özeti; organizatör: teklif yok (Tümü/Okunmamış). Legacy'de tasarımda olmayan "Yeni mesaj" korunur (kalem düğmesi).
// Legacy messagesView'in bilinen dinleyici sızıntısı (foundation §4.2) bu görünümle kalkar: destroy() tüm dinleyicileri kapatır.
import { panelShell } from "../shared/panel-shell.js";
import { createChat } from "./chat.js";

const HEAD = {
  artist: { subtitle: "Sanatçı Paneli · Mekanlarla teklif konuşmaları", search: { placeholder: "Mekan, etkinlik ara" } },
  venue: { crumb: "Mesajlar" },
  organizer: { crumb: "Mesajlar" },
};

export function panelMesajlarView(ctx) {
  const role = ctx.route?.role || ctx.session?.profile?.userType || "artist";
  const cfg = HEAD[role] || HEAD.artist;
  const shell = panelShell({
    role, active: ctx.route?.nav || "mesaj", title: "Mesajlar", titleTag: "h1", ctx,
    subtitle: cfg.subtitle, crumb: cfg.crumb, ...(cfg.search ? { search: cfg.search } : {}),
    contentGap: 0, contentPad: "0",
  });
  const chat = createChat({ host: shell.content, ns: "dk-panel-mesajlar", variant: "panel", role, ctx });
  return {
    node: shell.node,
    destroy() { chat.destroy(); shell.destroy(); },
    update(query) { chat.update(query); },
    onSession(sess) { return chat.onSession(sess); },
  };
}
