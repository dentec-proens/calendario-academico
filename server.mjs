import {recoveryMailer} from './src/recovery-mail.mjs';
import {retryingResource} from './src/retrying-resource.mjs';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {createApp} from './src/application.mjs';
import {googleConfiguration,createGoogleAuth} from './src/google-auth.mjs';
try{process.loadEnvFile(fileURLToPath(new URL('./.env',import.meta.url)));}catch(e){if(e.code!=='ENOENT')throw e;}
const hosted=process.env.VERCEL==='1';
const port=Number(process.env.PORT||4173);
let startupStage='origin';
async function prepare(){
 const defaultUrl=hosted?'https://'+(process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL):'http://127.0.0.1:'+port;
 const publicUrl=new URL(process.env.DENTEC_PUBLIC_URL||defaultUrl);
 if(publicUrl.username||publicUrl.password||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash||(publicUrl.protocol!=='https:'&&!(publicUrl.protocol==='http:'&&['127.0.0.1','localhost'].includes(publicUrl.hostname))))throw Error('Endereço público inválido.');
 let options={publicOrigin:publicUrl.origin,googleAuth:createGoogleAuth(hosted?null:googleConfiguration()),directory:fileURLToPath(new URL('./data',import.meta.url))};
 if(hosted){
  const database=process.env.POSTGRES_URL,storageUrl=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,setupCode=process.env.DENTEC_SETUP_CODE,setupEmail=process.env.DENTEC_SETUP_EMAIL?.trim().toLowerCase();
  const missing=[!database&&'POSTGRES_URL',!storageUrl&&'SUPABASE_URL',!key&&'SUPABASE_KEY',(!setupCode||setupCode.length<32)&&'DENTEC_SETUP_CODE_MIN_32',(!setupEmail||!/^[^\s@]+@ifpr\.edu\.br$/.test(setupEmail))&&'DENTEC_SETUP_EMAIL'].filter(Boolean);
  if(missing.length){startupStage='config:'+missing.join(',');throw Error('Configuração de hospedagem incompleta.');}
  startupStage='dependencies';
  const {openPostgresStore}=await import('./src/postgres-store.mjs'),{cloudFiles}=await import('./src/cloud-files.mjs'),{cloudPdf}=await import('./src/cloud-pdf.mjs');
  startupStage='database';const endpoint=new URL(database);console.info('DENTEC_DB_TRANSPORT',endpoint.hostname.includes('pooler')?'POOLER':'DIRECT',endpoint.port||'5432');const store=await openPostgresStore(database);startupStage='files';const files=await cloudFiles(storageUrl,key);
  options={...options,store,files,pdfRenderer:cloudPdf,setupCode,setupEmail};
 }
 startupStage='application';return createApp({...options,recoveryMail:recoveryMailer()});
}
const getApp=retryingResource(prepare,{onError:e=>{const m=String(e.message||'');const category=/timeout|timed out/i.test(m)?'TIMEOUT':/tenant|user not found/i.test(m)?'TENANT':/password|authentication/i.test(m)?'AUTH':/certificate|ssl/i.test(m)?'TLS':/terminated/i.test(m)?'TERMINATED':/invalid.*url/i.test(m)?'URL':/connection/i.test(m)?'CONNECTION':'OTHER';console.error('DENTEC_STARTUP',startupStage,/^[A-Z0-9_]{2,60}$/.test(String(e.code))?e.code:category);}});
getApp().catch(()=>{});
const server=http.createServer(async(req,res)=>{try{const app=await getApp();await app.handle(req,res);}catch{res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Sistema em configuração. Contate a administração.'}));}});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'A porta está ocupada. Encerre a versão anterior com Ctrl+C.':'Não foi possível iniciar o servidor.');process.exitCode=1;});
server.listen(port,hosted?'0.0.0.0':'127.0.0.1',async()=>{if(!hosted){const app=await getApp();app.localPort=port;console.log('DENTEC/PROENS — abra http://127.0.0.1:'+port);if(!(await app.store.read()).users.length)console.log('Código para criar a primeira conta ADMIN (uso local): '+app.setupCode);}});
