import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFiles} from '../src/cloud-files.mjs';

test('restricted PDF service does not prevent initialization and never creates a bucket on quota errors',async()=>{
 let calls=0,creates=0,downloads=0;
 const client={storage:{getBucket:async()=>{calls++;return {error:{statusCode:'402'}};},createBucket:async()=>{creates++;},from:()=>({download:async()=>{downloads++;}})}};
 const files=await cloudFiles(null,null,{client});assert.equal(calls,0);
 await assert.rejects(files.read('fixture.pdf'),e=>e.status===503);await assert.rejects(files.read('fixture.pdf'),e=>e.status===503);
 assert.equal(calls,1);assert.equal(creates,0);assert.equal(downloads,0);
});

test('public buckets remain blocked and signed links are issued only for validated private storage',async()=>{
 let signed=0;
 const client=publicBucket=>({storage:{getBucket:async()=>({data:{public:publicBucket}}),from:()=>({createSignedUrl:async()=>{signed++;return {data:{signedUrl:'https://example.invalid/private'}};}})}});
 const unsafe=await cloudFiles(null,null,{client:client(true)});await assert.rejects(unsafe.signed('fixture.pdf','fixture.pdf'),/privado/);assert.equal(signed,0);
 const safe=await cloudFiles(null,null,{client:client(false)});assert.equal(await safe.signed('fixture.pdf','fixture.pdf'),'https://example.invalid/private');assert.equal(signed,1);
});
