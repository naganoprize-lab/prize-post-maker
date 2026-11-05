// @vitest-environment jsdom
import {test,expect} from 'vitest';
import {load,save} from '../src/storage';
import {initialState} from '../src/domain';
test('ローカル保存と破損データの検出',async()=>{localStorage.clear();expect((await load()).products).toEqual([]);const s=initialState();s.theme='dark';await save(s);expect((await load()).theme).toBe('dark');localStorage.setItem('prize-post-maker-v1','bad');await expect(load()).rejects.toThrow();});
