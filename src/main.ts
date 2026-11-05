import './style.css';
export const kinds = ['月間入荷予定', '当日の入荷・稼働', '完売のお知らせ', '入荷遅延'] as const;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header><div><strong>プライズポストメーカー</strong><small>店舗の情報を、わかりやすく。</small></div><button id="theme">表示テーマ切替</button></header><main><nav aria-label="投稿種類"><h2>投稿をつくる</h2>${kinds.map((k,i)=>`<button data-kind="${i}" class="${i===0?'active':''}">${k}</button>`).join('')}<p>投稿は必ず担当者が確認してください。</p></nav><section id="editor"><h1 id="heading">月間入荷予定</h1><div id="workspace"><p>商品を登録して投稿を作成します。</p></div></section><aside><h2>X 投稿プレビュー</h2><div class="post"><strong>あなたのお店</strong><small>@your_store · プレビュー</small><p id="preview">ここに投稿文章が表示されます。</p><div id="imagePreview"></div></div><p id="counter">0 / 280</p><div id="actions"></div></aside></main><div id="status" role="status" aria-live="polite"></div>`;
document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button => button.onclick=()=>{
 document.querySelector('.active')?.classList.remove('active'); button.classList.add('active'); document.querySelector('#heading')!.textContent=kinds[Number(button.dataset.kind)];
});
document.querySelector<HTMLButtonElement>('#theme')!.onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};

// 商品マスター。初期化に失敗した場合は保存操作を開放しない。
import { fields, labels, product, importCSV, exportCSV, type State } from './domain';
import { load, save } from './storage';
let state:State;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const status=(text:string)=>{document.querySelector('#status')!.textContent=text;};
async function persist(){await save(state);}
function master(){
 document.querySelector('#workspace')!.innerHTML=`<div id="composer"></div><details><summary>商品マスター（登録・編集・CSV）</summary><form id="productForm">${fields.map((f,i)=>`<label>${labels[i]}${i===0?'（必須）':''}<input name="${f}" ${f==='arrivalDate'?'type="date"':'maxlength="200"'} ${i===0?'required':''}></label>`).join('')}<input type="hidden" name="id"><button class="primary">商品を保存</button><button type="button" id="resetProduct">新規入力</button></form><div id="masterList"></div><label>CSVインポート<input id="csv" type="file" accept=".csv,text/csv"></label><button id="export">CSVエクスポート</button></details>`;
 renderMaster();
 document.querySelector<HTMLFormElement>('#productForm')!.onsubmit=async e=>{e.preventDefault();try{
 const form=e.currentTarget as HTMLFormElement; const p=product(Object.fromEntries(new FormData(form)));
 const previous=state.products; state.products=state.products.filter(v=>v.id!==p.id).concat(p);
 try{await persist();}catch(e){state.products=previous;throw e;}
 form.reset();renderMaster();status('商品を保存しました'); document.dispatchEvent(new Event('products-changed'));
 }catch(e){status((e as Error).message);}};
 document.querySelector<HTMLButtonElement>('#resetProduct')!.onclick=()=>document.querySelector<HTMLFormElement>('#productForm')!.reset();
 document.querySelector<HTMLInputElement>('#csv')!.onchange=async e=>{const input=e.target as HTMLInputElement;try{
 const file=input.files?.[0]; if(!file)return;if(file.size>5*1024*1024)throw Error('CSVは5MB以下にしてください');
 const rows=importCSV(await file.text());const previous=state.products;state.products=[...state.products,...rows];
 try{await persist();}catch(e){state.products=previous;throw e;}
 renderMaster();document.dispatchEvent(new Event('products-changed'));status(`${rows.length}件を追加しました`);
 }catch(e){status((e as Error).message);}finally{input.value='';}};
 document.querySelector<HTMLButtonElement>('#export')!.onclick=()=>{
 const url=URL.createObjectURL(new Blob([exportCSV(state.products)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='products.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
}
function renderMaster(){
 const list=document.querySelector('#masterList')!;
 list.innerHTML=state.products.map(p=>`<div class="item">${escape(p.name)} <button data-edit="${escape(p.id)}">編集</button> <button data-delete="${escape(p.id)}">削除</button></div>`).join('')||'<p>商品は未登録です。</p>';
 list.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(b=>b.onclick=()=>{
 const p=state.products.find(p=>p.id===b.dataset.edit)!;const f=document.querySelector<HTMLFormElement>('#productForm')!;
 for(const key of [...fields,'id'] as const)(f.elements.namedItem(key) as HTMLInputElement).value=p[key];
 });
 list.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('この商品を削除しますか？'))return;const previous=state.products;state.products=state.products.filter(p=>p.id!==b.dataset.delete);try{await persist();renderMaster();document.dispatchEvent(new Event('products-changed'));}catch(e){state.products=previous;status((e as Error).message);}});
}
export const ready=load().then(s=>{state=s;master();document.dispatchEvent(new Event('app-ready'));}).catch(e=>{status(`読み込み失敗。保存データを保護するため編集を停止しました: ${e.message}`);});
