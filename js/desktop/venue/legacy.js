// venue paneli — artboard'u OLMAYAN sekmeler için legacy-in-shell görünümü (adaptör: ../shared/legacy-in-shell.js).
// Sahibi: foundation. PanelShell (adım 2) hazır olunca NOT_READY otomatik false olur (panel-shell.js'ten gelir).
import { NOT_READY as SHELL_NOT_READY } from "../shared/panel-shell.js";
import { legacyPanelView } from "../shared/legacy-in-shell.js";

export const NOT_READY = SHELL_NOT_READY;
export function venueLegacyView(ctx) { return legacyPanelView(ctx, "venue"); }
