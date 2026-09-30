import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutosaver} from '../web/autosave.js';
test('autosave serializes writes and preserves edits made during a request',async()=>{
 let state={value:1},dirty=true,version=1,resolve,calls=0,status;
 const saver=createAutosaver({isDirty:()=>dirty,snapshot:()=>({state,version}),write:sent=>{calls++;assert.equal(sent.state.value,1);return new Promise(r=>resolve=r);},onSaved:(saved,sent)=>{version=saved.version;dirty=JSON.stringify(state)!==JSON.stringify(sent.state);},onStatus:s=>status=s});
 const first=saver.save();await Promise.resolve();state.value=2;const second=saver.save(true);assert.equal(first,second);assert.equal(calls,1);resolve({version:2});await first;assert.equal(version,2);assert(dirty);assert.equal(state.value,2);assert.equal(status,'pending');
});
test('no-change ticks do not write; failures keep edits and conflicts stop retries',async()=>{
 let dirty=false,calls=0,status;const saver=createAutosaver({isDirty:()=>dirty,snapshot:()=>({state:{value:1}}),write:async()=>{calls++;throw Object.assign(Error('New version'),{status:409});},onSaved:()=>assert.fail(),onStatus:s=>status=s});
 await saver.save();assert.equal(calls,0);dirty=true;await saver.save();assert.equal(status,'blocked');await saver.save();assert.equal(calls,1);assert(dirty);
});
test('connection failures retry and a successful save clears pending changes',async()=>{
 let dirty=true,calls=0,status;const saver=createAutosaver({isDirty:()=>dirty,snapshot:()=>({state:{value:1}}),write:async()=>{if(++calls===1)throw Error('Offline');return {version:2};},onSaved:()=>dirty=false,onStatus:s=>status=s});
 await saver.save();assert.equal(status,'error');assert(dirty);await saver.save();assert.equal(status,'saved');assert(!dirty);await saver.save();assert.equal(calls,2);
});
