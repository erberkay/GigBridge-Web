// Görünüm iskeletleri için ortak yer tutucu (NOT_READY modüller). Router NOT_READY modülü ÇAĞIRMAZ;
// bu yalnız bir uygulayıcı modülünü erken açıp (NOT_READY=false) kabuğu/rotayı denemek isterse işe yarar.
import { h } from "../../ui.js";

export function stubView(artboard, ctx) {
  const node = h("div", { class: "dk", dataset: { stub: artboard } },
    h("div", { class: "dk-container", style: { padding: "64px var(--dk-gutter)" } },
      h("div", { class: "dk-eyebrow" }, "MASAÜSTÜ GÖRÜNÜM · YAPIM AŞAMASINDA"),
      h("h1", { class: "dk-display dk-t48", style: { marginTop: "12px" } }, artboard),
      h("p", { style: { color: "#8A8E97", marginTop: "12px" } }, (ctx && ctx.base) || "")));
  return { node };
}
