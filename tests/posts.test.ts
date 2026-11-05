import { test, expect } from "vitest";
import {
  monthlyPost,
  monthlyNotice,
  dailyIntro,
  productLine,
  countText,
  product,
  type Product,
} from "../src/domain";
import { composePosts, splitProductPosts } from "../src/posts";
const p: Product = {
  id: "a",
  name: "クロミ [PtZ]fuwa&hugブランケット",
  maker: "セガ",
  work: "作品",
  character: "",
  arrivalDate: "2026-11-06",
};
test("月間は全12か月で月以外を変更せず商品もタグも挿入しない", () => {
  for (let month = 1; month <= 12; month++) {
    const posts = composePosts(
      0,
      {
        title: "任意",
        date: "",
        month,
        products: [p],
        note: "備考",
        hashtags: "#タグ",
      },
      "{products}",
    );
    expect(posts).toEqual([
      `✨万代書店長野店プライズコーナー✨${month}月入荷予定表✨\n\n${monthlyNotice}`,
    ]);
    expect(posts[0]).not.toContain(p.name);
    expect(countText(posts[0]).valid).toBe(true);
  }
  for (const m of [0, 13, 1.5, NaN]) expect(() => monthlyPost(m)).toThrow();
});
test("日別案内は年を表示せず日付だけを変える", () => {
  expect(dailyIntro("2026-10-30")).toBe(
    "🆕万代書店長野店プライズ入荷情報🆕\n\n10月30日の入荷のお知らせです！詳細はツリーにて⬇️",
  );
  expect(dailyIntro("2027-01-02")).toContain("1月2日の入荷");
  expect(dailyIntro("2027-01-02")).not.toContain("2027");
  expect(() => dailyIntro("2026-02-30")).toThrow("日付");
});
test("商品は一行・メーカーや日付を含めず手動指定状態のみ出力", () => {
  const states = {
    稼働中: "稼働中です。",
    入荷済み: "入荷しました。",
    準備中: "準備中です。",
    完売: "完売しました。",
    入荷遅延: "入荷が遅れています。",
  } as const;
  for (const [status, message] of Object.entries(states)) {
    const text = productLine({ ...p, status: status as Product["status"] });
    expect(text).toBe(`・${p.name} / ${message}`);
    expect(text).not.toContain(p.maker);
    expect(text).not.toContain("2026");
    expect(text).not.toContain("\n");
  }
  expect(productLine(p)).toContain("状態未確認");
  expect(productLine(p)).not.toContain("稼働中です。");
  expect(product({ ...p, status: "遅延" }).status).toBe("入荷遅延");
});
test("投稿名を手動編集しても元データは変更しない", () => {
  const copy = { ...p, name: "投稿用の短縮名" };
  expect(productLine(copy)).toContain("投稿用の短縮名");
  expect(p.name).toContain("クロミ");
});
test("ツリーの先頭は案内、後続は商品行を280文字以内で分割し順序を保持", () => {
  const products = Array.from({ length: 15 }, (_, i) => ({
    ...p,
    id: String(i),
    name: `商品${i} ` + "あ".repeat(30),
    status: "稼働中" as const,
  }));
  const posts = composePosts(
    1,
    { title: "", date: "2026-11-06", products, note: "", hashtags: "" },
    "",
  );
  expect(posts[0]).toBe(dailyIntro("2026-11-06"));
  expect(posts.length).toBeGreaterThan(2);
  posts.forEach((text) => expect(countText(text).valid).toBe(true));
  expect(posts.slice(1).join("\n\n")).toBe(
    products.map(productLine).join("\n\n"),
  );
});
test("境界280・URL・絵文字をXの重みで扱い商品名の途中で切らない", () => {
  expect(splitProductPosts(["あ".repeat(140)])).toEqual(["あ".repeat(140)]);
  expect(() => splitProductPosts(["あ".repeat(141)])).toThrow("切り詰め");
  const lines = [
    "・" + "👨‍👩‍👧‍👦".repeat(50),
    "・https://example.com/very-long-path",
  ];
  const result = splitProductPosts(lines);
  result.forEach((text) => expect(countText(text).valid).toBe(true));
  expect(result.join("\n\n")).toBe(lines.join("\n\n"));
});
test("過長商品をスキップ・切詰めず警告し、空の商品紹介は生成しない", () => {
  expect(() =>
    composePosts(
      1,
      {
        title: "",
        date: "2026-11-06",
        products: [{ ...p, name: "あ".repeat(200) }],
        note: "",
        hashtags: "",
      },
      "",
    ),
  ).toThrow("1商品");
  expect(
    composePosts(
      1,
      { title: "", date: "2026-11-06", products: [], note: "", hashtags: "" },
      "",
    ),
  ).toEqual([dailyIntro("2026-11-06")]);
  expect(splitProductPosts([])).toEqual([]);
});
