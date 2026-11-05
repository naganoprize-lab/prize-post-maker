import {
  countText,
  dailyIntro,
  generate,
  monthlyPost,
  productLine,
  type PostValues,
} from "./domain";
/** 商品行を丸ごと扱い、途中で切断・省略しない。 */
export function splitProductPosts(lines: string[]): string[] {
  const posts: string[] = [];
  let current = "";
  for (const line of lines) {
    if (!countText(line).valid)
      throw Error(
        `1商品（またはタグ）が280文字以内に収まりません。自動で切り詰めず停止しました: ${line}`,
      );
    const next = current ? `${current}\n\n${line}` : line;
    if (countText(next).valid) current = next;
    else {
      posts.push(current);
      current = line;
    }
  }
  if (current) posts.push(current);
  return posts;
}
export function composePosts(
  kind: number,
  values: PostValues,
  template: string,
  includeTags = false,
): string[] {
  if (kind === 0) return [monthlyPost(values.month!)];
  if (kind === 1) {
    const lines = values.products.map(productLine);
    if (includeTags && values.hashtags.trim())
      lines.push(values.hashtags.trim());
    return [dailyIntro(values.date), ...splitProductPosts(lines)];
  }
  return [generate(template, values, kind)];
}
export function todayTokyo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
