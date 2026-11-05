// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { initialState } from '../src/domain';
test('商品選択・投稿生成・編集・種類切替・テーマ保存',async()=>{
 const state=initialState();state.products=[{id:'1',name:'登録景品',work:'作品',character:'キャラ',maker:'メーカー',arrivalDate:''}];
 localStorage.setItem('prize-post-maker-v1',JSON.stringify(state));document.body.innerHTML='<div id="app"></div>';
 const {ready}=await import('../src/main');await ready;
 const checkbox=document.querySelector<HTMLInputElement>('[data-product]')!;checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));
 expect(document.querySelector('#preview')?.textContent).toContain('登録景品');expect(document.querySelector('#preview')?.textContent).toContain('入荷日未確認');
 (document.querySelector('[data-kind="2"]') as HTMLButtonElement).click();
 expect(document.querySelector('#heading')?.textContent).toBe('完売のお知らせ');expect(document.querySelector('#preview')?.textContent).toContain('完売');
 const confirmed=document.querySelector<HTMLInputElement>('#confirmed')!;confirmed.checked=true;confirmed.dispatchEvent(new Event('change'));expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(false);
 const text=document.querySelector<HTMLTextAreaElement>('#text')!;text.value='編集した文章';text.dispatchEvent(new Event('input'));expect(document.querySelector('#preview')?.textContent).toBe('編集した文章');expect(confirmed.checked).toBe(false);expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(true);
 (document.querySelector('#theme') as HTMLButtonElement).click();
 await expect.poll(()=>document.documentElement.dataset.theme).toBe('dark');
});
