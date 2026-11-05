import { test, expect } from "vitest";
import {
  product,
  importCSV,
  exportCSV,
  initialState,
  validateState,
} from "../src/domain";
const p = {
  id: "a",
  name: '景品,"A"\n限定',
  work: "作品",
  character: "主人公",
  maker: "メーカー",
  arrivalDate: "2026-11-05",
};
test("CSVの日本語・引用符・改行を往復する", () => {
  expect(importCSV(exportCSV([p]))[0]).toMatchObject({
    ...p,
    id: expect.any(String),
  });
});
test("商品名と日付を検証する", () => {
  expect(() => product({ ...p, name: " " })).toThrow();
  expect(() => product({ ...p, arrivalDate: "2026-02-30" })).toThrow();
  expect(product({ ...p, arrivalDate: "" }).arrivalDate).toBe("");
});
test("不正なCSVを部分取込しない", () => {
  expect(() =>
    importCSV("name,work,character,maker,arrivalDate\nA,,,,\nB,,,,bad"),
  ).toThrow("3行目");
  expect(() => importCSV("name\nA")).toThrow("ヘッダー");
});
test("表計算式を無害化する", () => {
  expect(exportCSV([{ ...p, name: "=1+1" }])).toContain("'=1+1");
});
test("保存データを検証する", () => {
  expect(validateState(initialState()).version).toBe(1);
  expect(() => validateState({ version: 99 })).toThrow();
  expect(() => validateState({ ...initialState(), products: [p, p] })).toThrow(
    "重複",
  );
});
import { generate, hashtags, titles, countText } from "../src/domain";
test("4種類の候補と事実に基づく生成", () => {
  for (let kind = 2; kind < 4; kind++) {
    expect(titles(kind).length).toBeGreaterThan(1);
    const text = generate(
      "{title}\n{products}\n{date}\n{note}",
      {
        title: titles(kind)[0],
        date: "",
        products: [
          { ...p, arrivalDate: "", status: kind === 2 ? "完売" : "入荷遅延" },
        ],
        note: "",
        hashtags: "",
      },
      kind,
    );
    expect(text).toContain(p.name.replace(/\n/g, " "));
    expect(text).not.toContain("2026-11-05");
    expect(text).not.toContain("メーカー");
  }
  expect(() =>
    generate(
      "{products}",
      { title: "", date: "", products: [], note: "", hashtags: "" },
      2,
    ),
  ).toThrow("選択");
});
test("変数に入った変数文字列を再解釈しない", () => {
  expect(
    generate(
      "{title}",
      {
        title: "{note}",
        date: "",
        products: [{ ...p, status: "完売" }],
        note: "秘密",
        hashtags: "",
      },
      2,
    ),
  ).toBe("{note}");
});
test("ハッシュタグは重複除去し空白記号を取り除く", () => {
  expect(hashtags([p, p])).toBe("#作品 #主人公 #メーカー");
});
test("Xの日本語・URL・絵文字の重み", () => {
  expect(countText("あ".repeat(140)).valid).toBe(true);
  expect(countText("あ".repeat(141)).valid).toBe(false);
  expect(countText("https://example.com/very-long-path").weighted).toBe(23);
  expect(countText("👨‍👩‍👧‍👦").weighted).toBe(2);
  expect(countText("").valid).toBe(false);
});
test("登録したタグと商品数を選択商品の生成へ反映する", () => {
  const registered = product({ ...p, status: "完売", hashtags: ["店舗タグ"] });
  expect(hashtags([registered])).toContain("#店舗タグ");
  expect(
    generate(
      "{count}商品\n{products}",
      { title: "", date: "", products: [registered], note: "", hashtags: "" },
      2,
    ),
  ).toContain("1商品");
  expect(() => product({ ...p, hashtags: [123] })).toThrow("ハッシュタグ");
});
