// @vitest-environment jsdom
import { test, expect } from 'vitest';
test('投稿種類の切替とテーマ操作',async()=>{
 document.body.innerHTML='<div id="app"></div>';
 await import('../src/main');
 (document.querySelector('[data-kind="2"]') as HTMLButtonElement).click();
 expect(document.querySelector('#heading')?.textContent).toBe('完売のお知らせ');
 (document.querySelector('#theme') as HTMLButtonElement).click();
 expect(document.documentElement.dataset.theme).toBe('dark');
});
