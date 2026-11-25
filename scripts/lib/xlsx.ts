import ExcelJS from 'exceljs';

export async function readWorkbook(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

/** Rows of a sheet as plain strings (1-based row numbers preserved) */
export function sheetRows(ws: ExcelJS.Worksheet): { n: number; cells: string[] }[] {
  const out: { n: number; cells: string[] }[] = [];
  // Array.from (not .map) so sparse rows give '' for empty cells instead of holes
  ws.eachRow((row, n) => out.push({ n, cells: Array.from((row.values as unknown[]).slice(1), cellText) }));
  return out;
}

export function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
    return '';
  }
  return String(v).trim();
}
