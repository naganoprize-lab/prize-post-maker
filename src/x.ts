import { countText } from "./domain";
export function intentURL(text: string): string {
  if (!countText(text).valid)
    throw Error("投稿文章が空欄、不正、または280文字を超えています");
  return (
    "https://x.com/intent/post?" + new URLSearchParams({ text }).toString()
  );
}
export function validateImages(
  files: Pick<File, "name" | "size" | "type">[],
): void {
  if (files.length > 4) throw Error("画像は4枚までです");
  if (
    files.some(
      (f) =>
        !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
          f.type,
        ),
    )
  )
    throw Error("JPEG・PNG・GIF・WebP画像を選択してください");
  if (files.some((f) => f.size > 5 * 1024 * 1024 || f.size === 0))
    throw Error("画像は1枚あたり0バイト超〜5MB以下にしてください");
  if (files.some((f) => f.type === "image/gif") && files.length > 1)
    throw Error("GIFは単独で選択してください");
}
