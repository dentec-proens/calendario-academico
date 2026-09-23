import test from 'node:test';import assert from 'node:assert/strict';import {retryingResource} from '../src/retrying-resource.mjs';
test('temporary startup failure recovers after cooldown with one shared initializer',async()=>{
 let attempts=0,time=0;const resource={ready:true};const get=retryingResource(async()=>{attempts++;if(attempts===1)throw Error('timeout');return resource;},{now:()=>time,cooldown:5000});
 const a=get(),b=get();assert.equal(a,b);await assert.rejects(a,/timeout/);await assert.rejects(get(),/timeout/);assert.equal(attempts,1);time=5000;
 assert.equal(await get(),resource);assert.equal(await get(),resource);assert.equal(attempts,2);
});
