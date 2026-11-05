import {test,expect} from 'vitest';
import {product,importCSV,exportCSV,initialState,validateState} from '../src/domain';
const p={id:'a',name:'景品,"A"\n限定',work:'作品',character:'主人公',maker:'メーカー',arrivalDate:'2026-11-05'};
test('CSVの日本語・引用符・改行を往復する',()=>{expect(importCSV(exportCSV([p]))[0]).toMatchObject({...p,id:expect.any(String)});});
test('商品名と日付を検証する',()=>{expect(()=>product({...p,name:' '})).toThrow();expect(()=>product({...p,arrivalDate:'2026-02-30'})).toThrow();expect(product({...p,arrivalDate:''}).arrivalDate).toBe('');});
test('不正なCSVを部分取込しない',()=>{expect(()=>importCSV('name,work,character,maker,arrivalDate\nA,,,,\nB,,,,bad')).toThrow('3行目');expect(()=>importCSV('name\nA')).toThrow('ヘッダー');});
test('表計算式を無害化する',()=>{expect(exportCSV([{...p,name:'=1+1'}])).toContain("'=1+1");});
test('保存データを検証する',()=>{expect(validateState(initialState()).version).toBe(1);expect(()=>validateState({version:99})).toThrow();expect(()=>validateState({...initialState(),products:[p,p]})).toThrow('重複');});
