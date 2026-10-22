import {build} from 'vite';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
let backend,watcher,stopping=false,built=false;

async function stop(code=0){
 if(stopping)return;
 stopping=true;
 backend?.kill();
 await watcher?.close();
 process.exitCode=code;
}
process.once('SIGINT',()=>stop());
process.once('SIGTERM',()=>stop());

try{
 watcher=await build({configFile:fileURLToPath(new URL('../vite.config.mjs',import.meta.url)),build:{watch:{}}});
 if(stopping)await watcher.close();
 watcher.on('event',event=>{
  if(event.code==='START')built=false;
  if(event.code==='BUNDLE_END')built=true;
  if(event.code==='ERROR')console.error('Falha ao compilar o portal:',event.error.message);
  if(event.code==='END'&&built&&!backend&&!stopping){
   backend=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:'inherit',env:process.env});
   backend.once('error',error=>{console.error('Não foi possível iniciar o servidor:',error.message);stop(1);});
   backend.once('exit',(code,signal)=>stop(signal?0:code??1));
   console.log('Portal React: alterações são recompiladas; recarregue o navegador para vê-las.');
  }
 });
}catch(error){
 console.error('Não foi possível compilar o portal:',error.message);
 await stop(1);
}
