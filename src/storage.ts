import { invoke, isTauri } from '@tauri-apps/api/core';
import { initialState, validateState, type State } from './domain';
const key='prize-post-maker-v1';
export async function load():Promise<State> {
 const raw=isTauri()?await invoke<string|null>('load_data'):localStorage.getItem(key);
 return raw===null?initialState():validateState(JSON.parse(raw));
}
let queue:Promise<void>=Promise.resolve();
export function save(state:State):Promise<void> {
 const data=JSON.stringify(validateState(state));
 const next=queue.catch(()=>{}).then(async()=>{
  if(isTauri()) await invoke('save_data',{data}); else localStorage.setItem(key,data);
 });
 queue=next; return next;
}
