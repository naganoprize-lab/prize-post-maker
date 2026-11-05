import {test,expect} from 'vitest';
import {intentURL,validateImages} from '../src/x';
test('X連携は固定のHTTPS intentへ文章のみ渡す',()=>{const text='日本語 & #タグ\nhttps://example.com';const url=new URL(intentURL(text));expect(url.origin).toBe('https://x.com');expect(url.pathname).toBe('/intent/post');expect(url.searchParams.get('text')).toBe(text);expect(()=>intentURL('あ'.repeat(141))).toThrow();});
test('画像の枚数・形式・容量・GIFの組合せを検証',()=>{const f={name:'a.png',type:'image/png',size:100};expect(()=>validateImages([f,f,f,f])).not.toThrow();expect(()=>validateImages([f,f,f,f,f])).toThrow('4枚');expect(()=>validateImages([{...f,type:'text/html'}])).toThrow('画像');expect(()=>validateImages([{...f,size:6*1024*1024}])).toThrow('5MB');expect(()=>validateImages([{...f,type:'image/gif'},f])).toThrow('単独');});
