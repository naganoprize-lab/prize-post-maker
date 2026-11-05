import { test, expect } from "vitest";
import { checkedProducts, appendUnique, moveProduct } from "../src/selection";
import { excelKey, type Product } from "../src/domain";
function p(name: string, row: number): Product {
  return {
    id: String(row),
    name,
    maker: "メーカー",
    work: "作品",
    character: "",
    arrivalDate: "",
    status: "予定",
    excel: {
      key: excelKey("2026-11-05", name, "メーカー", row),
      originalName: name,
      originalMaker: "メーカー",
      rowNumber: row,
      scheduledDate: "2026-11-05",
      units: 1,
      cs: 1,
    },
  };
}
test("チェック済み・表示中の商品以外は絶対に返さずExcel順を維持", () => {
  const rows = [p("日本語A", 2), p("日本語B", 3), p("日本語C", 4)];
  expect(checkedProducts(rows, new Set())).toEqual([]);
  const checked = new Set([
    rows[2].excel!.key,
    rows[0].excel!.key,
    "表示されない行",
  ]);
  expect(checkedProducts(rows, checked).map((p) => p.name)).toEqual([
    "日本語A",
    "日本語C",
  ]);
  expect(checkedProducts([], checked)).toEqual([]);
});
test("再追加は既存順を維持し重複させない", () => {
  expect(appendUnique(["b", "a"], ["a", "c", "b"])).toEqual(["b", "a", "c"]);
});
test("追加済み商品の順序変更と境界", () => {
  expect(moveProduct(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
  expect(moveProduct(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  expect(moveProduct(["a", "b"], "a", 1)).toEqual(["b", "a"]);
  expect(moveProduct(["a"], "unknown", 1)).toEqual(["a"]);
});
