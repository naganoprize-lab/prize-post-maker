import './style.css';
export const kinds = ['月間入荷予定', '当日の入荷・稼働', '完売のお知らせ', '入荷遅延'] as const;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header><div><strong>プライズポストメーカー</strong><small>店舗の情報を、わかりやすく。</small></div><button id="theme">表示テーマ切替</button></header><main><nav aria-label="投稿種類"><h2>投稿をつくる</h2>${kinds.map((k,i)=>`<button data-kind="${i}" class="${i===0?'active':''}">${k}</button>`).join('')}<p>投稿は必ず担当者が確認してください。</p></nav><section id="editor"><h1 id="heading">月間入荷予定</h1><div id="workspace"><p>商品を登録して投稿を作成します。</p></div></section><aside><h2>X 投稿プレビュー</h2><div class="post"><strong>あなたのお店</strong><small>@your_store · プレビュー</small><p id="preview">ここに投稿文章が表示されます。</p><div id="imagePreview"></div></div><p id="counter">0 / 280</p><div id="actions"></div></aside></main><div id="status" role="status" aria-live="polite"></div>`;
document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button => button.onclick=()=>{
 document.querySelector('.active')?.classList.remove('active'); button.classList.add('active'); document.querySelector('#heading')!.textContent=kinds[Number(button.dataset.kind)];
});
document.querySelector<HTMLButtonElement>('#theme')!.onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
