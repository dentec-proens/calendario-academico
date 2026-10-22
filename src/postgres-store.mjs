import {readFile} from 'node:fs/promises';
import {rootCertificates} from 'node:tls';
import {isDeepStrictEqual} from 'node:util';
import {initialCatalogue,campusNames} from './institution.mjs';
import {relationalStatements} from './relational-schema.mjs';
import {readRelational,writeRelational,changedLockKeys} from './relational-mapper.mjs';

const schemaError=()=>Object.assign(Error('Esquema PostgreSQL ausente ou incompatível. Execute pnpm run db:migrate antes de iniciar o aplicativo.'),{code:'DENTEC_SCHEMA'});
export async function createPostgresPool(connectionString){
 if(!connectionString)throw Object.assign(Error('Configure POSTGRES_URL ou DATABASE_URL para usar o PostgreSQL.'),{code:'DENTEC_CONFIG'});
 const {Pool}=await import('pg');let ssl;
 const endpoint=new URL(connectionString);
 if(endpoint.hostname.endsWith('.supabase.co')||endpoint.hostname.endsWith('.pooler.supabase.com')){
  for(const key of ['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat','ssl'])endpoint.searchParams.delete(key);
  connectionString=endpoint.toString();ssl={rejectUnauthorized:true,ca:[...rootCertificates,await readFile(new URL('./supabase-ca.crt',import.meta.url),'utf8')]};
 }
 const pool=new Pool({connectionString,ssl,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
 pool.on('error',()=>console.error('DENTEC_POSTGRES_IDLE_CONNECTION_ERROR'));
 return pool;
}
export async function initializeSchema(pool){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('dentec:schema:v1'))");
  for(const sql of relationalStatements)await client.query(sql);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
const seedState=()=>({users:[],campuses:campusNames.map((name,i)=>({id:`campus-${i+1}`,name})),calendars:[],histories:[],audit:[],catalogue:initialCatalogue()});

// No runtime DDL or fallback backend: schema creation and imports are explicit.
// Each transaction reads only its requested domain; persisted deltas touch the
// affected entity rows. Session writes do not lock calendars or their history.
export async function openPostgresStore(connectionString,{pool:providedPool,initialize=false,seed=true}={}){
 const pool=providedPool||await createPostgresPool(connectionString);
 try{
  if(initialize)await initializeSchema(pool);
  const exists=await pool.query("SELECT to_regclass('dentec.schema_migrations') AS state");
  if(!exists.rows[0]?.state)throw schemaError();
  const marker=await pool.query('SELECT version FROM dentec.schema_migrations ORDER BY version DESC LIMIT 1');
  if(marker.rows[0]?.version!==1)throw schemaError();
 }catch(error){if(!providedPool)await pool.end();throw error;}
 const transact=async(fn,{readOnly=false,retries=8}={})=>{
  for(let attempt=0;;attempt++){
   const client=await pool.connect();
   try{
    await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout = '10s'");await client.query("SET LOCAL statement_timeout = '25s'");
    const result=await fn(client);await client.query('COMMIT');return result;
   }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    if(!readOnly&&['40001','40P01'].includes(error.code)&&attempt<retries){await new Promise(resolve=>setTimeout(resolve,Math.min(10*2**attempt,150)));continue;}
    throw error;
   }finally{client.release();}
  }
 };
 const store={
  read:options=>transact(async client=>(await readRelational(client,options)).state,{readOnly:true}),
  exportState:()=>transact(async client=>(await readRelational(client,{full:true})).state,{readOnly:true}),
  async importState(state){
   if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Documento de importação inválido.');
   return transact(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dentec:import'))");
    const before=await readRelational(client,{full:true});
    if(Object.keys(before.state).length)throw Error('A importação exige um banco vazio para preservar os dados existentes.');
    await writeRelational(client,{},state);
    const after=(await readRelational(client,{full:true})).state;
    if(!isDeepStrictEqual(after,state))throw Error('Conferência da importação falhou. Nenhum dado foi substituído.');
    return after;
   });
  },
  change:(fn,options={})=>transact(async client=>{
   const {state:before,keys}=await readRelational(client,options),next=structuredClone(before),result=await fn(next);
   for(const key of changedLockKeys(before,next,options))await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['dentec:'+key]);
   if(options.calendarId&&next.calendars?.some(calendar=>calendar.id!==options.calendarId))throw Error('Alteração fora do calendário selecionado.');
   await writeRelational(client,before,next,keys,options);return result;
  }),
  close:()=>pool.end?.()
 };
 if(initialize&&seed){
  const fields=await pool.query('SELECT name FROM dentec.root_fields LIMIT 1');
  if(!fields.rows.length)await store.importState(seedState());
 }
 return store;
}
