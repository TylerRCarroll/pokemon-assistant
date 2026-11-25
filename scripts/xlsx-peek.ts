// Dev helper: print sheet names, sizes, and the first rows of each sheet in an .xlsx.
// Usage: npx tsx scripts/xlsx-peek.ts <file.xlsx> [rows=8] [sheetFilter]
import { readWorkbook, sheetRows } from './lib/xlsx';

const [file, rowsArg = '8', filter] = process.argv.slice(2);
if (!file) throw new Error('usage: xlsx-peek <file.xlsx> [rows] [sheetFilter]');

const wb = await readWorkbook(file);
for (const ws of wb.worksheets) {
  if (filter && !ws.name.toLowerCase().includes(filter.toLowerCase())) continue;
  console.log(`\n=== ${ws.name} (${ws.rowCount} rows x ${ws.columnCount} cols)`);
  for (const { n, cells } of sheetRows(ws).slice(0, Number(rowsArg))) {
    console.log(`${n}: ${cells.join(' | ')}`);
  }
}
