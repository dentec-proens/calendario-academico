import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'vite';
import {createTestApp} from './helpers/database.mjs';

async function fixture(t,options={}){
 const app=await createTestApp(t,{...options});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{
  await new Promise(resolve=>app.server.close(resolve));
 });
 return `http://127.0.0.1:${app.server.address().port}`;
}

test('production portal serves its Vite HTML, JavaScript and CSS with the existing security policy',async t=>{
 const output=await mkdtemp(join(tmpdir(),'dentec-build-'));
 t.after(()=>rm(output,{recursive:true,force:true}));
 await build({configFile:fileURLToPath(new URL('../vite.config.mjs',import.meta.url)),logLevel:'silent',build:{outDir:output}});
 const base=await fixture(t,{portalDirectory:pathToFileURL(output+'/')});
 const page=await fetch(base+'/');
 assert.equal(page.status,200);
 assert.match(page.headers.get('content-type'),/^text\/html/);
 const policy=page.headers.get('content-security-policy');
 assert.match(policy,/script-src 'self'; style-src 'self'/);
 assert(!policy.includes('unsafe-inline'));
 const html=await page.text();
 assert.match(html,/<div id="root"><\/div>/);
 assert(!html.includes('/portal/main.jsx'));
 const resources=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match=>match[1]);
 assert(resources.some(path=>path.endsWith('.js')));
 assert(resources.some(path=>path.endsWith('.css')));
 for(const path of resources){
  const response=await fetch(base+path);
  assert.equal(response.status,200,path);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('content-type'),path.endsWith('.js')?/^text\/javascript/:/^text\/css/);
  assert.equal(await response.text(),await readFile(join(output,path.slice(1)),'utf8'));
 }
 for(const path of ['/assets/missing.js','/.vite/manifest.json','/portal/main.jsx','/portal.js','/documents.js','/review.js','/data/database.json','/assets/%2e%2e%2fportal.html']){
  assert.equal((await fetch(base+path)).status,404,path);
 }
 for(const path of ['/editor','/ativar','/recuperar-senha','/logs'])assert.equal((await fetch(base+path)).status,200,path);
 assert.equal((await fetch(base+'/api/status')).status,200);
});

test('missing portal build gives an actionable error while API and editor remain available',async t=>{
 const output=await mkdtemp(join(tmpdir(),'dentec-no-build-'));
 t.after(()=>rm(output,{recursive:true,force:true}));
 const base=await fixture(t,{portalDirectory:pathToFileURL(output+'/')});
 const page=await fetch(base+'/');
 assert.equal(page.status,503);
 assert.match((await page.json()).error,/pnpm run build.*pnpm start.*pnpm run dev/);
 assert.equal((await fetch(base+'/api/status')).status,200);
 assert.equal((await fetch(base+'/editor')).status,200);
});
