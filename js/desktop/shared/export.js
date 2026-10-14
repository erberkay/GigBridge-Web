// DIŞA AKTARMA — tarayıcıda dosya indirme (sunucu yok): CSV (Excel Türkçe için ; ayraç + UTF-8 BOM) ve Excel 2003
// SpreadsheetML (.xls; Excel / LibreOffice / Numbers açar, UTF-8, XML kaçışlı). Kullananlar: admin/etkinlikler.js (katılımcı
// listesi), admin/finans.js (finans dışa aktarımı). Hücre değeri: string | number | boolean | null (sayı → Number hücresi).
import { h } from "../../ui.js";

/** Dosya adı güvenli parça: harf/rakam dışı → "-" (en çok 60) */
export const safeFileName = (s, fallback = "dosya") => String(s ?? "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;

function saveBlob(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** CSV — alanlar tırnaklı, içteki tırnak ikilenir; ; ayraç + BOM (Excel tr-TR doğrudan açar). */
export function downloadCsv(name, headers, rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(q).join(";"), ...rows.map((r) => r.map(q).join(";"))];
  saveBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), /\.csv$/i.test(name) ? name : `${name}.csv`);
}

// XML 1.0'da geçersiz kontrol karakterleri atılır; & < > " ' kaçışlanır.
const xmlEsc = (v) => String(v ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function xmlCell(v, style) {
  const st = style ? ` ss:StyleID="${style}"` : "";
  if (typeof v === "number" && Number.isFinite(v)) return `<Cell${st}><Data ss:Type="Number">${v}</Data></Cell>`;
  if (typeof v === "boolean") return `<Cell${st}><Data ss:Type="String">${v ? "Evet" : "Hayır"}</Data></Cell>`;
  return `<Cell${st}><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
}

/** Excel 2003 XML (SpreadsheetML) — .xls, application/vnd.ms-excel. Başlık satırı kalın; sayılar sayı hücresi. */
export function downloadXls(name, headers, rows, { sheet = "Sayfa1" } = {}) {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">',
    '<Styles><Style ss:ID="hd"><Font ss:Bold="1"/><Interior ss:Color="#EDEDED" ss:Pattern="Solid"/></Style></Styles>',
    `<Worksheet ss:Name="${xmlEsc(String(sheet).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sayfa1")}"><Table>`,
    `<Row>${headers.map((x) => xmlCell(String(x), "hd")).join("")}</Row>`,
    ...rows.map((r) => `<Row>${r.map((v) => xmlCell(v)).join("")}</Row>`),
    "</Table>",
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions>',
    "</Worksheet></Workbook>",
  ].join("\n");
  saveBlob(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }), /\.xls$/i.test(name) ? name : `${name}.xls`);
}
