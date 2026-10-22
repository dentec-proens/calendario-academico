import {recoveryMailer} from './src/recovery-mail.mjs';
import {retryingResource} from './src/retrying-resource.mjs';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {createApp} from './src/application.mjs';
import {googleConfiguration,createGoogleAuth} from './src/google-auth.mjs';
import {runtimeConfiguration} from './src/database-config.mjs';
import {openPostgresStore} from './src/postgres-store.mjs';

try{process.loadEnvFile(fileURLToPath(new URL('./.env',import.meta.url)));}catch(e){if(e.code!=='ENOENT')throw e;}
const production=process.env.VERCEL==='1'||process.env.NODE_ENV==='production';
const port=Number(process.env.PORT||4173);
let startupStage='config',readyApp;

async function prepare(){
 startupStage='config';
 const config=runtimeConfiguration();
 startupStage='database';
 const endpoint=new URL(config.connectionString);
 console.info('DENTEC_DB_TRANSPORT',endpoint.hostname.includes('pooler')?'POOLER':'DIRECT',endpoint.port||'5432');
 const store=await openPostgresStore(config.connectionString);
 try{
  let options={store,publicOrigin:config.publicOrigin,googleAuth:createGoogleAuth(config.hosted?null:googleConfiguration()),setupCode:config.setupCode,setupEmail:config.setupEmail};
  if(config.storage){
   startupStage='files';
   const {cloudFiles}=await import('./src/cloud-files.mjs');
   options.files=await cloudFiles(config.storage.url,config.storage.key);
  }
  if(config.production){const {cloudPdf}=await import('./src/cloud-pdf.mjs');options.pdfRenderer=cloudPdf;}
  startupStage='application';
  readyApp=await createApp({...options,recoveryMail:recoveryMailer()});
  return readyApp;
 }catch(error){await store.close().catch(()=>{});throw error;}
}

const getApp=retryingResource(prepare,{onError:error=>{
 const message=String(error.message||'');
 const category=/timeout|timed out/i.test(message)?'TIMEOUT':/tenant|user not found/i.test(message)?'TENANT':/password|authentication/i.test(message)?'AUTH':/certificate|ssl/i.test(message)?'TLS':/terminated/i.test(message)?'TERMINATED':/invalid.*url/i.test(message)?'URL':/connection/i.test(message)?'CONNECTION':'OTHER';
 console.error('DENTEC_STARTUP',startupStage,/^[A-Z0-9_]{2,60}$/.test(String(error.code))?error.code:category);
 if(['DENTEC_CONFIG','DENTEC_SCHEMA'].includes(error.code))console.error(message);
 else if(!production)console.error('Não foi possível iniciar. Confira a conexão PostgreSQL e execute npm run db:migrate com a credencial de migração. Nenhum arquivo JSON será usado como banco.');
}});

// Fail before listening locally. Hosted requests retain the retry mechanism for
// temporary database outages without revealing credentials to HTTP clients.
let start=true;
if(production)getApp().catch(()=>{});
else try{await getApp();}catch{process.exitCode=1;start=false;}

if(start){
 const server=http.createServer(async(req,res)=>{
  try{const app=await getApp();await app.handle(req,res);}catch{
   res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
   res.end(JSON.stringify({error:'Sistema em configuração. Contate a administração.'}));
  }
 });
 server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'A porta está ocupada. Encerre a versão anterior com Ctrl+C.':'Não foi possível iniciar o servidor.');process.exitCode=1;readyApp?.store.close().catch(()=>{});});
 server.listen(port,production?'0.0.0.0':'127.0.0.1',async()=>{
  if(!production){
   readyApp.localPort=port;
   console.log('DENTEC/PROENS — PostgreSQL — abra http://127.0.0.1:'+port);
   if(!(await readyApp.store.read({fields:['users']})).users.length)console.log('Código para criar a primeira conta ADMIN (uso local): '+readyApp.setupCode);
  }
 });
 const stop=()=>{server.close(async()=>{await readyApp?.store.close();});};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
