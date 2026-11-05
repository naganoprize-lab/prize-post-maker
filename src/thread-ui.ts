import { countText } from "./domain";
import { intentURL, openXComposer } from "./x";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function renderThread(
  host: HTMLElement,
  posts: string[],
  active: number,
  select: (i: number) => void,
  move: (i: number, d: -1 | 1) => void,
  notify: (s: string) => void,
) {
  host.innerHTML = posts.length
    ? `<details ${posts.length > 1 ? "open" : ""}><summary>投稿ごとの確認・コピー（${posts.length}投稿）</summary><p class="hint">Xで先頭を投稿した後、各商品紹介を手動で返信してください。自動ツリー投稿はしません。文章・順番の変更時には再確認が必要です。</p>${posts.map((text, i) => `<article class="thread-post" data-thread="${i}"><strong>${i + 1}投稿目 ${active === i ? "（表示中）" : ""}</strong><pre>${esc(text)}</pre><small>${countText(text).weighted} / 280</small><div class="row"><button data-post-select="${i}">この文章を編集・表示</button><button data-post-move="${i}" data-direction="-1" ${i === 0 ? "disabled" : ""} aria-label="${i + 1}投稿目を上へ">上へ</button><button data-post-move="${i}" data-direction="1" ${i === posts.length - 1 ? "disabled" : ""} aria-label="${i + 1}投稿目を下へ">下へ</button></div><label><input type="checkbox" data-post-confirm="${i}">${i + 1}投稿目の内容・画像・順番を担当者が確認しました</label><div class="row"><button data-post-copy="${i}" disabled>${i + 1}投稿目をコピー</button><button data-post-open="${i}" disabled>${i + 1}投稿目をXで開く</button></div></article>`).join("")}</details>`
    : "";
  host
    .querySelectorAll<HTMLButtonElement>("[data-post-select]")
    .forEach((b) => (b.onclick = () => select(Number(b.dataset.postSelect))));
  host
    .querySelectorAll<HTMLButtonElement>("[data-post-move]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          move(
            Number(b.dataset.postMove),
            Number(b.dataset.direction) as -1 | 1,
          )),
    );
  host.querySelectorAll<HTMLInputElement>("[data-post-confirm]").forEach(
    (c) =>
      (c.onchange = () => {
        const i = Number(c.dataset.postConfirm),
          valid = c.checked && countText(posts[i]).valid;
        for (const id of ["copy", "open"])
          (
            host.querySelector(`[data-post-${id}="${i}"]`) as HTMLButtonElement
          ).disabled = !valid;
      }),
  );
  for (const action of ["copy", "open"])
    host.querySelectorAll<HTMLButtonElement>(`[data-post-${action}]`).forEach(
      (b) =>
        (b.onclick = async () => {
          const i = Number(
            action === "copy" ? b.dataset.postCopy : b.dataset.postOpen,
          );
          try {
            if (
              !host.querySelector<HTMLInputElement>(
                `[data-post-confirm="${i}"]`,
              )?.checked
            )
              throw Error("最終確認が必要です");
            intentURL(posts[i]);
            if (action === "copy")
              await navigator.clipboard.writeText(posts[i]);
            else await openXComposer(posts[i]);
            notify(
              `${i + 1}投稿目を${action === "copy" ? "コピーしました" : "Xの投稿画面へ渡しました"}。実際の投稿・返信操作は担当者が行ってください`,
            );
          } catch (e) {
            notify((e as Error).message);
          }
        }),
    );
}
