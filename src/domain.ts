import Papa from "papaparse";
export interface Product {
  id: string;
  name: string;
  work: string;
  character: string;
  maker: string;
  arrivalDate: string;
}
export interface Template {
  id: string;
  name: string;
  body: string;
}
export interface History {
  id: string;
  createdAt: string;
  kind: string;
  text: string;
}
export interface State {
  version: 1;
  products: Product[];
  templates: Template[];
  history: History[];
  theme: "light" | "dark" | "system";
}
export const fields = [
  "name",
  "work",
  "character",
  "maker",
  "arrivalDate",
] as const;
export const labels = [
  "商品名",
  "作品名",
  "キャラクター名",
  "メーカー名",
  "確認済み入荷日",
];
export const kinds = [
  "月間入荷予定",
  "当日の入荷・稼働",
  "完売のお知らせ",
  "入荷遅延",
] as const;
export function validDate(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function product(input: unknown): Product {
  if (!input || typeof input !== "object") throw Error("商品データが不正です");
  const p = input as Record<string, unknown>;
  for (const f of fields)
    if (typeof p[f] !== "string" || (p[f] as string).length > 200)
      throw Error(`${f}: 200文字以内で入力してください`);
  if (!(p.name as string).trim()) throw Error("商品名を入力してください");
  if (p.arrivalDate && !validDate(p.arrivalDate as string))
    throw Error("入荷日は実在する YYYY-MM-DD で入力してください");
  return {
    id: typeof p.id === "string" && p.id ? p.id : crypto.randomUUID(),
    ...Object.fromEntries(fields.map((f) => [f, (p[f] as string).trim()])),
  } as Product;
}
export function importCSV(text: string): Product[] {
  const result = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    { header: true, delimiter: ",", skipEmptyLines: "greedy" },
  );
  if (result.errors.length)
    throw Error(`CSV解析エラー: ${result.errors[0].message}`);
  if (!fields.every((f) => result.meta.fields?.includes(f)))
    throw Error(`CSVヘッダーは ${fields.join(",")} が必要です`);
  if (result.data.length > 10000)
    throw Error("一度に取り込める商品は10000件までです");
  return result.data.map((p, i) => {
    try {
      return product(p);
    } catch (e) {
      throw Error(`${i + 2}行目: ${(e as Error).message}`);
    }
  });
}
export function exportCSV(products: Product[]): string {
  return (
    "\uFEFF" +
    Papa.unparse(
      products.map((p) => Object.fromEntries(fields.map((f) => [f, p[f]]))),
      { columns: [...fields], escapeFormulae: true },
    )
  );
}
export function initialState(): State {
  return {
    version: 1,
    products: [],
    templates: [
      {
        id: "default",
        name: "標準",
        body: "{title}\n{date}\n\n{products}\n\n{note}\n\n{hashtags}",
      },
      {
        id: "compact",
        name: "コンパクト",
        body: "{title}\n{products}\n{note}\n{hashtags}",
      },
    ],
    history: [],
    theme: "system",
  };
}
export function validateState(input: unknown): State {
  if (!input || typeof input !== "object") throw Error("保存データが不正です");
  const s = input as State;
  if (
    s.version !== 1 ||
    !Array.isArray(s.products) ||
    !Array.isArray(s.templates) ||
    !Array.isArray(s.history) ||
    !["light", "dark", "system"].includes(s.theme)
  )
    throw Error("保存データの形式が不正です");
  const products = s.products.map(product);
  if (new Set(products.map((p) => p.id)).size !== products.length)
    throw Error("商品IDが重複しています");
  for (const t of s.templates)
    if (
      !t ||
      typeof t.id !== "string" ||
      typeof t.name !== "string" ||
      !t.name.trim() ||
      typeof t.body !== "string" ||
      t.body.length > 10000
    )
      throw Error("テンプレートが不正です");
  for (const h of s.history)
    if (
      !h ||
      typeof h.id !== "string" ||
      typeof h.kind !== "string" ||
      typeof h.text !== "string" ||
      typeof h.createdAt !== "string" ||
      isNaN(Date.parse(h.createdAt))
    )
      throw Error("履歴が不正です");
  return { ...s, products };
}

import twitter from "twitter-text";
export function titles(kind: number): string[] {
  return (
    [
      [
        "月間入荷予定のお知らせ",
        "月間プライズ入荷予定",
        "これからの入荷予定をご案内",
      ],
      [
        "本日の入荷・稼働情報",
        "プライズ入荷・稼働のお知らせ",
        "本日のプライズ情報",
      ],
      ["完売のお知らせ", "対象景品の完売のご案内", "プライズ完売情報"],
      ["入荷遅延のお知らせ", "対象景品の入荷予定変更", "入荷遅延のご案内"],
    ][kind] ?? []
  );
}
export function hashtags(products: Product[]): string {
  const tags = products
    .flatMap((p) => [p.work, p.character, p.maker])
    .map((s) => s.normalize("NFKC").replace(/[^\p{L}\p{N}\p{M}_]/gu, ""))
    .filter((s) => s && twitter.extractHashtags("#" + s).includes(s));
  return [...new Set(tags)]
    .slice(0, 12)
    .map((t) => "#" + t)
    .join(" ");
}
export function generate(
  template: string,
  values: {
    title: string;
    date: string;
    products: Product[];
    note: string;
    hashtags: string;
  },
  kind: number,
  status = "入荷",
): string {
  if (!values.products.length) throw Error("商品を1件以上選択してください");
  if (values.date && !validDate(values.date)) throw Error("日付が不正です");
  const details = values.products
    .map((p) => {
      const info = [p.work, p.character, p.maker].filter(Boolean).join(" / ");
      const suffix =
        kind === 0
          ? p.arrivalDate
            ? `入荷予定 ${p.arrivalDate}`
            : "入荷日未確認"
          : kind === 1
            ? status
            : kind === 2
              ? "完売"
              : "入荷遅延（変更後の日程は備考を確認）";
      return `・${p.name}${info ? `（${info}）` : ""}\n  ${suffix}`;
    })
    .join("\n");
  const dict = {
    ...values,
    products: details,
    date: values.date
      ? `${kind === 0 ? "ご案内日" : "対象日"}: ${values.date}`
      : "",
  };
  return template
    .replace(
      /\{(title|date|products|note|hashtags)\}/g,
      (_, key: keyof typeof dict) => dict[key],
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function countText(text: string) {
  const p = twitter.parseTweet(text);
  return { weighted: p.weightedLength, valid: p.valid };
}
