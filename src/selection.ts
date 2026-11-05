import type { Product } from "./domain";
/** 表示中かつチェック済みの行だけをExcel順に返す。隠れた選択は採用しない。 */
export function checkedProducts(
  shown: Product[],
  checked: ReadonlySet<string>,
): Product[] {
  return shown.filter((p) => p.excel && checked.has(p.excel.key));
}
export function appendUnique(current: string[], added: string[]): string[] {
  return [...new Set([...current, ...added])];
}
export function moveProduct(
  ids: string[],
  id: string,
  direction: -1 | 1,
): string[] {
  const next = [...ids],
    at = next.indexOf(id),
    target = at + direction;
  if (at < 0 || target < 0 || target >= next.length) return next;
  [next[at], next[target]] = [next[target], next[at]];
  return next;
}
