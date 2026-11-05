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

import { titles, hashtags, generate, countText } from './domain';
let kind=0;
const selected=new Set<string>();
let dirty=false;
function composer(){
 document.querySelector('#composer')!.innerHTML=`<div class="card"><h2>1. 商品を選択</h2><label>商品を検索<input id="search" placeholder="商品名・作品・キャラクター・メーカー"></label><label>月間予定の対象月（任意）<input id="month" type="month"></label><div class="row"><button id="selectVisible">表示商品をすべて選択</button><button id="clearSelected">選択解除</button></div><p id="selectionCount" class="hint"></p><div id="products"></div></div><div class="card"><h2>2. 投稿を設定</h2><label>タイトル候補<select id="titles"></select></label><label>タイトル<input id="title" maxlength="200"></label><label>対象日／ご案内日（任意）<input id="date" type="date"></label><label id="operationLabel">当日の状態<select id="operation"><option>入荷</option><option>稼働中</option><option>入荷・稼働中</option></select></label><label>備考（確認済みの情報のみ）<textarea id="note" maxlength="2000" placeholder="遅延後の日程が未定の場合は「変更後の日程は未定です」など、確認できた事実を入力"></textarea></label><label>テンプレート<select id="templates"></select></label><label>テンプレート本文<textarea id="templateBody" maxlength="10000"></textarea></label><p class="hint">利用できる変数: {title} {date} {products} {note} {hashtags}</p><div class="row"><input id="templateName" maxlength="100" placeholder="テンプレート名" aria-label="テンプレート名"><button id="saveTemplate">新規保存</button><button id="updateTemplate">上書き保存</button><button id="deleteTemplate">削除</button></div><label>ハッシュタグ（編集可能）<textarea id="tags" maxlength="2000"></textarea></label><button id="autoTags">選択商品のタグを再生成</button></div><div class="card"><h2>3. 最終文章を確認</h2><label>投稿文章（直接編集できます）<textarea id="text" maxlength="10000" rows="9"></textarea></label><p class="hint">設定変更で生成文に戻ります。手動編集済みの場合は確認します。</p><button id="regenerate">設定から文章を再生成</button></div><details><summary>作成履歴（投稿済みを意味しません・直近200件）</summary><div id="history"></div></details>`;
 const value=(id:string)=>(document.getElementById(id) as HTMLInputElement).value;
 function regenerate(force=false){
  if(dirty&&!force&&!confirm('手動編集した文章を設定から再生成してよいですか？'))return;
  dirty=false;
  try{(document.querySelector('#text') as HTMLTextAreaElement).value=generate(value('templateBody'),{title:value('title'),date:value('date'),products:state.products.filter(p=>selected.has(p.id)),note:value('note'),hashtags:value('tags')},kind,value('operation'));}catch{(document.querySelector('#text') as HTMLTextAreaElement).value='';}
  updatePreview();
 }
 function populateTemplates(){
  (document.querySelector('#templates') as HTMLSelectElement).innerHTML=state.templates.map(t=>`<option value="${escape(t.id)}">${escape(t.name)}</option>`).join('');
  setTemplate();
 }
 function setTemplate(){const t=state.templates.find(t=>t.id===value('templates'));(document.querySelector('#templateBody') as HTMLTextAreaElement).value=t?.body??'';(document.querySelector('#templateName') as HTMLInputElement).value=t?.name??'';regenerate();}
 function showProducts(){
  const query=value('search').toLocaleLowerCase();const month=value('month');
  const visible=state.products.filter(p=>fields.some(f=>p[f].toLocaleLowerCase().includes(query))&&(!month||kind!==0||p.arrivalDate.startsWith(month)));
  document.querySelector('#selectionCount')!.textContent=`${selected.size}件選択 / ${visible.length}件表示`;
  document.querySelector('#products')!.innerHTML=visible.map(p=>`<div class="item"><label><input type="checkbox" data-product="${escape(p.id)}" ${selected.has(p.id)?'checked':''}>${escape(p.name)}<small>${escape([p.work,p.character,p.maker,p.arrivalDate||'入荷日未確認'].filter(Boolean).join(' / '))}</small></label></div>`).join('')||'<p class="hint">該当商品がありません。下の商品マスターから登録してください。</p>';
  document.querySelectorAll<HTMLInputElement>('[data-product]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.product!):selected.delete(c.dataset.product!);refreshTags();showProducts();});
  document.querySelector<HTMLButtonElement>('#selectVisible')!.onclick=()=>{visible.forEach(p=>selected.add(p.id));refreshTags();showProducts();};
 }
 function refreshTags(){(document.querySelector('#tags') as HTMLTextAreaElement).value=hashtags(state.products.filter(p=>selected.has(p.id)));regenerate();}
 function setKind(){
  (document.querySelector('#titles') as HTMLSelectElement).innerHTML=titles(kind).map(t=>`<option>${escape(t)}</option>`).join('');
  (document.querySelector('#title') as HTMLInputElement).value=titles(kind)[0];
  (document.querySelector('#operationLabel') as HTMLElement).hidden=kind!==1;
  (document.querySelector('#month')!.parentElement as HTMLElement).hidden=kind!==0;
  showProducts();regenerate();
 }
 document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b=>b.addEventListener('click',()=>{kind=Number(b.dataset.kind);setKind();}));
 document.querySelector('#titles')!.addEventListener('change',()=>{(document.querySelector('#title') as HTMLInputElement).value=value('titles');regenerate();});
 ['title','date','operation','note','templateBody','tags'].forEach(id=>document.getElementById(id)!.addEventListener('input',()=>regenerate()));
 document.querySelector('#text')!.addEventListener('input',()=>{dirty=true;updatePreview();});
 document.querySelector('#regenerate')!.addEventListener('click',()=>{if(!dirty||confirm('手動編集した文章を置き換えますか？'))regenerate(true);});
 document.querySelector('#search')!.addEventListener('input',showProducts);
 document.querySelector('#month')!.addEventListener('change',()=>{selected.clear();showProducts();refreshTags();});
 document.querySelector('#clearSelected')!.addEventListener('click',()=>{selected.clear();showProducts();refreshTags();});
 document.querySelector('#autoTags')!.addEventListener('click',refreshTags);
 document.querySelector('#templates')!.addEventListener('change',setTemplate);
 async function storeTemplate(update:boolean){try{
 const name=value('templateName').trim(),body=value('templateBody');if(!name||!body.trim())throw Error('テンプレート名と本文を入力してください');
 const previous=state.templates;const id=update?value('templates'):crypto.randomUUID();if(!id)throw Error('上書きするテンプレートを選択してください');
 state.templates=state.templates.filter(t=>t.id!==id).concat({id,name,body});try{await persist();}catch(e){state.templates=previous;throw e;}
 populateTemplates();(document.querySelector('#templates') as HTMLSelectElement).value=id;setTemplate();status('テンプレートを保存しました');
 }catch(e){status((e as Error).message);}}
 document.querySelector('#saveTemplate')!.addEventListener('click',()=>void storeTemplate(false));
 document.querySelector('#updateTemplate')!.addEventListener('click',()=>void storeTemplate(true));
 document.querySelector('#deleteTemplate')!.addEventListener('click',async()=>{if(!value('templates')||!confirm('テンプレートを削除しますか？'))return;const previous=state.templates;state.templates=state.templates.filter(t=>t.id!==value('templates'));try{await persist();populateTemplates();}catch(e){state.templates=previous;status((e as Error).message);}});
 document.addEventListener('products-changed',()=>{for(const id of selected)if(!state.products.some(p=>p.id===id))selected.delete(id);showProducts();refreshTags();});
 document.addEventListener('history-changed',renderHistory);
 function renderHistory(){document.querySelector('#history')!.innerHTML=state.history.map(h=>`<div class="item"><small>${escape(new Date(h.createdAt).toLocaleString('ja-JP'))} · ${escape(h.kind)}</small><p style="white-space:pre-wrap">${escape(h.text)}</p><button data-history="${escape(h.id)}">文章を再利用</button><button data-remove-history="${escape(h.id)}">削除</button></div>`).join('')||'<p>履歴はありません。</p>';
 document.querySelectorAll<HTMLButtonElement>('[data-history]').forEach(b=>b.onclick=()=>{const h=state.history.find(h=>h.id===b.dataset.history)!;if(dirty&&!confirm('編集中の文章を履歴で置き換えますか？'))return;(document.querySelector('#text') as HTMLTextAreaElement).value=h.text;dirty=true;updatePreview();});
 document.querySelectorAll<HTMLButtonElement>('[data-remove-history]').forEach(b=>b.onclick=async()=>{if(!confirm('この履歴を削除しますか？'))return;const previous=state.history;state.history=state.history.filter(h=>h.id!==b.dataset.removeHistory);try{await persist();renderHistory();}catch(e){state.history=previous;status((e as Error).message);}});
 }
 populateTemplates();setKind();renderHistory();
}
function updatePreview(){
 const text=(document.querySelector('#text') as HTMLTextAreaElement)?.value??'';
 document.querySelector('#preview')!.textContent=text||'商品を選択すると文章が表示されます。';
 const count=countText(text);document.querySelector('#counter')!.textContent=`${count.weighted} / 280（Xの重み付き文字数）${count.valid?'':' · 投稿内容を確認してください'}`;
 document.querySelector('#counter')!.classList.toggle('danger',!count.valid);
 document.dispatchEvent(new Event('post-changed'));
}
function startup(){composer();document.documentElement.dataset.theme=state.theme;document.querySelector<HTMLButtonElement>('#theme')!.onclick=async()=>{const previous=state.theme;state.theme=state.theme==='system'?'dark':state.theme==='dark'?'light':'system';try{await persist();document.documentElement.dataset.theme=state.theme;status(`表示テーマ: ${state.theme==='system'?'OS設定':state.theme==='dark'?'ダーク':'ライト'}`);}catch(e){state.theme=previous;status((e as Error).message);}};}
document.addEventListener('app-ready',startup,{once:true});
