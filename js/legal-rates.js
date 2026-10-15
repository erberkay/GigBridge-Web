// Yasal / bilgi sayfalarındaki oranlar ve örnek tutarlar CANLI ayardan (publicConfig/payments — admin › Ödemeler):
// <span data-rt="AR">%10</span> içeriği güncel değerle değişir; okunamazsa sayfadaki yazılı değer kalır.
// Belirteçler: js/desktop/shared/pay-util.js rateTokens (uygulama src/utils/rateText.ts ile aynı).
import { setPayRates, rateTokens } from "./desktop/shared/pay-util.js";

const URL_ = "https://firestore.googleapis.com/v1/projects/djing-ba986/databases/(default)/documents/publicConfig/payments?key=AIzaSyB6nrk5SnXMl51Qdpv_ctdFcWPrisiYbCc";
const val = (f) => (f == null ? undefined : "doubleValue" in f ? Number(f.doubleValue) : "integerValue" in f ? Number(f.integerValue)
  : "booleanValue" in f ? f.booleanValue : "stringValue" in f ? f.stringValue : undefined);

fetch(URL_).then((r) => (r.ok ? r.json() : null)).then((d) => {
  if (!d || !d.fields) return;
  const raw = Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, val(v)]));
  const t = rateTokens(setPayRates(raw));
  document.querySelectorAll("[data-rt]").forEach((el) => { const v = t[el.dataset.rt]; if (v) el.textContent = v; });
}).catch(() => {});
