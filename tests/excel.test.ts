import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  readExcel,
  excelDate,
  filterSchedule,
  mergeExcel,
  checkArchive,
} from "../src/excel";
import { generate, hashtags, initialState, validateState } from "../src/domain";
const headers = ["稼働予定日", "品名", "入数", "CS数", "メーカー"];
async function fixture(
  rows: unknown[][],
  options: {
    headers?: string[];
    sheet?: string;
    date1904?: boolean;
    xlsm?: boolean;
  } = {},
) {
  const b = new ExcelJS.Workbook();
  b.properties.date1904 = options.date1904 ?? false;
  const s = b.addWorksheet(options.sheet ?? "縦");
  s.addRow(options.headers ?? headers);
  rows.forEach((r) => s.addRow(r));
  let data: Uint8Array = new Uint8Array(await b.xlsx.writeBuffer());
  if (options.xlsm) {
    const zip = await JSZip.loadAsync(data);
    const xml = await zip.file("[Content_Types].xml")!.async("string");
    zip.file(
      "[Content_Types].xml",
      xml.replace(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
      ),
    );
    zip.file("xl/vbaProject.bin", new Uint8Array([1, 2, 3, 4]));
    zip.file(
      "xl/externalLinks/externalLink1.xml",
      '<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><externalBook/></externalLink>',
    );
    data = await zip.generateAsync({ type: "uint8array" });
  }
  return data;
}
test("xlsx日付セル・数量・メーカーを取り込み、予定と実際の日を分離する", async () => {
  const bytes = await fixture([
    [new Date("2026-11-05T00:00:00Z"), "景品A", 24, 2, "メーカーA"],
  ]);
  const before = bytes.slice();
  const [p] = await readExcel(bytes, "予定.xlsx");
  expect(bytes).toEqual(before);
  expect(p).toMatchObject({
    name: "景品A",
    maker: "メーカーA",
    arrivalDate: "",
    status: "予定",
    excel: {
      scheduledDate: "2026-11-05",
      units: 24,
      cs: 2,
      originalName: "景品A",
    },
  });
  expect(hashtags([p])).toBe("#メーカーA");
  const text = generate(
    "{products}",
    { title: "", date: "", products: [p], note: "", hashtags: "" },
    1,
    "稼働中",
  );
  expect(text).toContain("予定日・稼働確定日ではありません");
  expect(text).not.toContain("/ 稼働中");
  expect(() =>
    generate(
      "{products}",
      { title: "", date: "", products: [p], note: "", hashtags: "" },
      2,
    ),
  ).toThrow("状態");
});
test("xlsmはVBA・外部リンクを含んでも保存済み値だけを読む", async () => {
  const data = await fixture(
    [
      [
        "2026/11/5",
        { formula: '"保存済み品名"', result: "保存済み品名" },
        { formula: "10*2", result: 20 },
        1,
        "会社",
      ],
    ],
    { xlsm: true },
  );
  const [p] = await readExcel(data, "入替指示書_マクロ版(3).xlsm");
  expect(p.name).toBe("保存済み品名");
  expect(p.excel!.units).toBe(20);
});
test("列順変更・全角CS表記・余分な列に対応する", async () => {
  const rows = await readExcel(
    await fixture([["会社", 2, "景品", "2026-11-06", 12, "無関係"]], {
      headers: ["メーカー", "ＣＳ数", "品名", " 稼働予定日 ", "入数", "備考"],
    }),
    "a.xlsx",
  );
  expect(rows[0]).toMatchObject({
    maker: "会社",
    excel: { cs: 2, units: 12, scheduledDate: "2026-11-06" },
  });
});
test("1900/1904方式・シリアル・日付文字列を正しく扱う", async () => {
  expect(excelDate(1)).toBe("1900-01-01");
  expect(excelDate(61)).toBe("1900-03-01");
  expect(excelDate(0, true)).toBe("1904-01-01");
  expect(excelDate(46222)).toBe("2026-07-19");
  expect(excelDate("2024/2/29")).toBe("2024-02-29");
  const b = await fixture(
    [[new Date("2026-11-05T00:00:00Z"), "景品", 0, 0, ""]],
    { date1904: true },
  );
  expect((await readExcel(b, "a.xlsx"))[0].excel!.scheduledDate).toBe(
    "2026-11-05",
  );
  for (const bad of [60, -1, NaN, "2026/2/30", "2026-13-01", "11/5", null])
    expect(() => excelDate(bad)).toThrow();
});
test("保存済みの日付数式結果を解析する", async () => {
  const p = (
    await readExcel(
      await fixture([
        [{ formula: "DATE(2026,11,5)", result: 46331 }, "景品", 1, 1, "会社"],
      ]),
      "a.xlsx",
    )
  )[0];
  expect(p.excel!.scheduledDate).toBe("2026-11-05");
});
test("日付単日・期間の両端を含み、0件と逆転・不正検索を扱う", async () => {
  const rows = await readExcel(
    await fixture([
      ["2026-11-05", "A", 1, 1, ""],
      ["2026-11-06", "B", 1, 1, ""],
      ["2026-11-07", "C", 1, 1, ""],
    ]),
    "a.xlsx",
  );
  expect(filterSchedule(rows, "2026-11-05").map((p) => p.name)).toEqual(["A"]);
  expect(filterSchedule(rows, "2026-11-05", "2026-11-06")).toHaveLength(2);
  expect(filterSchedule(rows, "2026-12-01")).toEqual([]);
  expect(() => filterSchedule(rows, "2026-11-07", "2026-11-05")).toThrow(
    "開始日",
  );
  expect(() => filterSchedule(rows, "bad")).toThrow("カレンダー");
});
test("再読込は重複を防ぎ投稿名・状態・IDを保持し数量を更新する", async () => {
  const a = await readExcel(
    await fixture([["2026-11-05", "元の品名", 12, 1, "会社"]]),
    "a.xlsx",
  );
  a[0].name = "投稿用の短い名前";
  a[0].status = "稼働中";
  a[0].work = "作品";
  const b = await readExcel(
    await fixture([["2026-11-05", "元の品名", 24, 2, "会社"]]),
    "別名.xlsm",
  );
  const merged = mergeExcel(a, b);
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({
    id: a[0].id,
    name: "投稿用の短い名前",
    status: "稼働中",
    work: "作品",
    excel: { units: 24, cs: 2 },
  });
  expect(mergeExcel(merged, b)).toEqual(merged);
  const s = {
    ...initialState(),
    products: merged,
    excelSource: { name: "a.xlsx", path: "C:\\表\\a.xlsx", rows: merged },
  };
  expect(validateState(JSON.parse(JSON.stringify(s)))).toEqual(s);
});
test("同じ行はまとめ、数量の異なる同一キーは黙って統合しない", async () => {
  expect(
    await readExcel(
      await fixture([
        ["2026-11-05", "A", 1, 1, ""],
        ["2026-11-05", "A", 1, 1, ""],
      ]),
      "a.xlsx",
    ),
  ).toHaveLength(1);
  await expect(
    readExcel(
      await fixture([
        ["2026-11-05", "A", 1, 1, ""],
        ["2026-11-05", "A", 2, 1, ""],
      ]),
      "a.xlsx",
    ),
  ).rejects.toThrow("数量が異なる");
});
test("シート欠落・ヘッダー欠落・重複・空表は日本語エラー", async () => {
  await expect(
    readExcel(await fixture([], { sheet: "横" }), "a.xlsx"),
  ).rejects.toThrow("「縦」");
  await expect(
    readExcel(await fixture([], { headers: ["品名"] }), "a.xlsx"),
  ).rejects.toThrow("ヘッダー");
  await expect(
    readExcel(await fixture([], { headers: [...headers, "品名"] }), "a.xlsx"),
  ).rejects.toThrow("重複");
  await expect(readExcel(await fixture([]), "a.xlsx")).rejects.toThrow(
    "対象商品がありません",
  );
});
test("不正な日付・商品名・数量・キャッシュなしは行番号付きで拒否", async () => {
  for (const row of [
    ["2026-02-30", "A", 1, 1, ""],
    ["2026-11-05", "", 1, 1, ""],
    ["2026-11-05", "A", -1, 1, ""],
    ["2026-11-05", { formula: "1+1" }, 1, 1, ""],
  ])
    await expect(readExcel(await fixture([row]), "a.xlsx")).rejects.toThrow(
      "2行目",
    );
});
test("破損・対象外拡張子・巨大ZIPを拒否する", async () => {
  await expect(readExcel(new Uint8Array([0, 1]), "a.xlsx")).rejects.toThrow(
    "形式",
  );
  await expect(readExcel(new Uint8Array([]), "a.xls")).rejects.toThrow(".xlsx");
  const data = await fixture([["2026-11-05", "A", 1, 1, ""]]);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < data.length - 46; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 150 * 1024 * 1024, true);
      break;
    }
  expect(() => checkArchive(data)).toThrow("展開サイズ");
});
