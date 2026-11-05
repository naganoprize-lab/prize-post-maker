import type ExcelJS from "exceljs";
import { excelKey, product, validDate, type Product } from "./domain";

const headers = ["稼働予定日", "品名", "入数", "CS数", "メーカー"] as const;
export const MAX_EXCEL_BYTES = 20 * 1024 * 1024;
export function checkExcelName(name: string) {
  if (!/\.(xlsm|xlsx)$/i.test(name))
    throw Error(".xlsm または .xlsx ファイルを選択してください");
}

/** 展開前のZIP中央ディレクトリを検査。ZIP64・暗号化・分割ZIPは対象外。 */
export function checkArchive(bytes: Uint8Array): void {
  if (bytes.length > MAX_EXCEL_BYTES)
    throw Error("Excelファイルは20MB以下にしてください");
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      d.getUint32(i, true) === 0x06054b50 &&
      i + 22 + d.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0)
    throw Error("Excelファイルの形式が不正です（ZIP形式を確認してください）");
  const entries = d.getUint16(end + 10, true),
    size = d.getUint32(end + 12, true),
    offset = d.getUint32(end + 16, true);
  if (
    d.getUint16(end + 4, true) ||
    d.getUint16(end + 6, true) ||
    entries !== d.getUint16(end + 8, true) ||
    entries === 65535 ||
    entries > 10000 ||
    offset + size > end
  )
    throw Error("このExcel圧縮形式は対応していません");
  let at = offset,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > offset + size || d.getUint32(at, true) !== 0x02014b50)
      throw Error("Excel圧縮データが破損しています");
    const expanded = d.getUint32(at + 24, true);
    if (d.getUint16(at + 8, true) & 1)
      throw Error("パスワード付きExcelには対応していません");
    total += expanded;
    if (expanded > 50 * 1024 * 1024 || total > 100 * 1024 * 1024)
      throw Error("Excelの展開サイズが大きすぎます");
    at +=
      46 +
      d.getUint16(at + 28, true) +
      d.getUint16(at + 30, true) +
      d.getUint16(at + 32, true);
  }
  if (at !== offset + size) throw Error("Excel圧縮データの構造が不正です");
}
function cached(value: ExcelJS.CellValue): unknown {
  if (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  ) {
    if (value.result === undefined || value.result === null)
      throw Error(
        "数式の保存済み値がありません。Excelで再計算して保存したファイルを使用してください",
      );
    return cached(value.result as ExcelJS.CellValue);
  }
  if (value && typeof value === "object" && "error" in value)
    throw Error("セルにExcelエラーがあります");
  if (value && typeof value === "object" && "richText" in value)
    return value.richText.map((r) => r.text).join("");
  if (value && typeof value === "object" && "hyperlink" in value)
    return value.text;
  return value;
}
function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string" && typeof value !== "number")
    throw Error("文字列または数値で入力してください");
  const s = String(value).trim();
  if (s.length > 200) throw Error("200文字以内で入力してください");
  return s;
}
export function excelDate(value: unknown, date1904 = false): string {
  let date: string;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw Error("稼働予定日が不正です");
    date = value.toISOString().slice(0, 10);
  } else if (typeof value === "number" && Number.isFinite(value)) {
    const serial = Math.floor(value);
    if (
      serial < (date1904 ? 0 : 1) ||
      serial > 2958465 ||
      (!date1904 && serial === 60)
    )
      throw Error("稼働予定日のExcel日付が不正です");
    const epoch = Date.UTC(
      date1904 ? 1904 : 1899,
      date1904 ? 0 : 11,
      date1904 ? 1 : 31,
    );
    date = new Date(
      epoch + (serial - (!date1904 && serial > 60 ? 1 : 0)) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  } else if (typeof value === "string") {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim());
    if (!m)
      throw Error(
        "稼働予定日は日付セルまたは YYYY-MM-DD / YYYY/MM/DD で入力してください",
      );
    date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  } else throw Error("稼働予定日が未入力または不正です");
  if (!validDate(date) || date < "1900-01-01" || date > "9999-12-31")
    throw Error("実在しない稼働予定日です");
  return date;
}
function quantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^\d+$/.test(value.trim()))
  )
    throw Error("入数・CS数は0以上の整数で入力してください");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error("入数・CS数は0以上の整数で入力してください");
  return n;
}
export async function readExcel(
  bytes: Uint8Array,
  name: string,
): Promise<Product[]> {
  checkExcelName(name);
  checkArchive(bytes);
  const { default: Excel } = await import("exceljs");
  const book = new Excel.Workbook();
  try {
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw Error(
      "Excelファイルを読み込めません。破損・暗号化・ファイル形式を確認してください",
    );
  }
  const sheet = book.getWorksheet("縦");
  if (!sheet) throw Error("「縦」シートが見つかりません");
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const name = text(cached(cell.value)).normalize("NFKC").trim();
    if (!headers.includes(name as (typeof headers)[number])) return;
    if (columns.has(name)) throw Error(`ヘッダー「${name}」が重複しています`);
    columns.set(name, col);
  });
  for (const h of headers)
    if (!columns.has(h)) throw Error(`1行目にヘッダー「${h}」がありません`);
  if (sheet.rowCount > 10001)
    throw Error("商品行は10000行までです。不要な行を削除してください");
  const found = new Map<string, Product>();
  sheet.eachRow((row, line) => {
    if (line === 1) return;
    try {
      const values = headers.map((h) =>
        cached(row.getCell(columns.get(h)!).value),
      );
      if (values.every((v) => v === null || v === undefined || v === ""))
        return;
      const [date, name, units, cs, maker] = values;
      const originalName = text(name),
        originalMaker = text(maker),
        scheduledDate = excelDate(date, book.properties.date1904);
      const key = excelKey(scheduledDate, originalName, originalMaker, line);
      const p = product({
        name: originalName,
        maker: originalMaker,
        work: "",
        character: "",
        arrivalDate: "",
        status: "予定",
        excel: {
          key,
          rowNumber: line,
          originalName,
          originalMaker,
          scheduledDate,
          units: quantity(units),
          cs: quantity(cs),
        },
      });
      found.set(key, p);
    } catch (e) {
      throw Error(`${line}行目: ${(e as Error).message}`);
    }
  });
  if (!found.size) throw Error("「縦」シートに対象商品がありません");
  return [...found.values()];
}
export function filterSchedule(
  rows: Product[],
  from: string,
  to = from,
): Product[] {
  if (!validDate(from) || !validDate(to))
    throw Error("検索日をカレンダーで指定してください");
  if (from > to) throw Error("開始日は終了日以前にしてください");
  return rows.filter(
    (p) =>
      p.excel && p.excel.scheduledDate >= from && p.excel.scheduledDate <= to,
  );
}
/** 同じ元情報を再取込しても編集した投稿名・状態・補足情報を維持する。 */
export function mergeExcel(
  existing: Product[],
  incoming: Product[],
): Product[] {
  const byKey = new Map(
    existing.filter((p) => p.excel).map((p) => [p.excel!.key, p]),
  );
  const migrated = new Set<string>();
  const replacements = new Map<string, Product>();
  const additions: Product[] = [];
  for (const row of incoming) {
    if (!row.excel) throw Error("Excel商品ではありません");
    let previous = byKey.get(row.excel.key);
    if (!previous) {
      const oldKey = excelKey(
        row.excel.scheduledDate,
        row.excel.originalName,
        row.excel.originalMaker,
      );
      const old = byKey.get(oldKey);
      if (old && !migrated.has(oldKey)) {
        previous = old;
        migrated.add(oldKey);
      }
    }
    const updated = previous ? { ...previous, excel: { ...row.excel } } : row;
    if (previous) replacements.set(previous.id, updated);
    else additions.push(updated);
    byKey.set(row.excel.key, updated);
  }
  return existing.map((p) => replacements.get(p.id) ?? p).concat(additions);
}
