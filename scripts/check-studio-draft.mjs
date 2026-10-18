import assert from 'node:assert/strict';
import { typescriptLoader } from './lib/load-typescript.mjs';
const values=new Map();
globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
const load=()=>typescriptLoader({}, { sessionStorage: globalThis.sessionStorage })('components/creation/guest-draft.ts');
const draft=load(),brief={title:'Guest scene',prompt:'Private creative direction',category:'cinematic',settings:{aspectRatio:'16:9',duration:'10',visualStyle:'Original',tone:'Storytelling'}};
const files=[{id:'local',kind:'image',file:new File(['test'],'sample.png',{type:'image/png'})}];
let checks=0;const check=value=>{assert.ok(value);checks++};
draft.rememberGuestDraft(brief,files);check(draft.readGuestDraft()?.files[0].file===files[0].file);
const key=[...values.keys()][0],raw=values.get(key);check(!raw.includes('sample.png')&&!raw.includes('storage_key')&&!raw.includes('owner'));
const afterReload=load();check(afterReload.readGuestDraft()?.missingFiles===true);check(afterReload.readGuestDraft()?.brief.prompt===brief.prompt);
for(const value of ['bad JSON','x'.repeat(32001),JSON.stringify({...JSON.parse(raw),expiresAt:Date.now()-1}),JSON.stringify({...JSON.parse(raw),expiresAt:Date.now()+3600000}),JSON.stringify({...JSON.parse(raw),brief:{...brief,owner_user_id:'forged'}}),JSON.stringify({...JSON.parse(raw),brief:{...brief,settings:{...brief.settings,aspectRatio:'invalid'}}}),JSON.stringify({...JSON.parse(raw),brief:{...brief,prompt:'x'.repeat(10001)}})]){
 values.set(key,value);check(load().readGuestDraft()===null);
}
values.set(key,raw);afterReload.clearGuestDraft();check(!values.has(key)&&afterReload.readGuestDraft()===null);
globalThis.sessionStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
const blocked=load();blocked.rememberGuestDraft(brief,files);check(blocked.readGuestDraft()?.brief.title===brief.title);blocked.clearGuestDraft();check(blocked.readGuestDraft()===null);
console.log(JSON.stringify({passed:checks,scope:'Validated guest handoff, expiry, reload file notice, untrusted input, blocked storage'}));
