import {readFile} from 'node:fs/promises';
import {rootCertificates} from 'node:tls';
import {initialCatalogue,campusNames} from './institution.mjs';
import {selectState,statePatches,patchState} from './postgres-projection.mjs';

// Transitional storage: retain the versioned local document structure, but
// serialize writes in PostgreSQL so independent server instances cannot lose updates.
export async function openPostgresStore(connectionString,{pool:providedPool}={}){
 const {Pool}=providedPool?{}:await import('pg');
 let ssl;
 if(!providedPool){const endpoint=new URL(connectionString);if(endpoint.hostname.endsWith('.supabase.co')||endpoint.hostname.endsWith('.pooler.supabase.com')){for(const key of ['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat','ssl'])endpoint.searchParams.delete(key);connectionString=endpoint.toString();ssl={rejectUnauthorized:true,ca:[...rootCertificates,await readFile(new URL('./supabase-ca.crt',import.meta.url),'utf8')]};}}
 const pool=providedPool||new Pool({connectionString,ssl,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
 try{
  await pool.query('CREATE SCHEMA IF NOT EXISTS dentec_private');
  await pool.query('REVOKE ALL ON SCHEMA dentec_private FROM PUBLIC');
  await pool.query('CREATE TABLE IF NOT EXISTS dentec_private.app_state (id integer PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL)');
  await pool.query('REVOKE ALL ON dentec_private.app_state FROM PUBLIC');
  await pool.query('ALTER TABLE dentec_private.app_state ENABLE ROW LEVEL SECURITY');
  const initial={users:[],campuses:campusNames.map((name,i)=>({id:`campus-${i+1}`,name})),calendars:[],histories:[],audit:[],catalogue:initialCatalogue()};
  await pool.query('INSERT INTO dentec_private.app_state (id,payload) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(initial)]);
 }catch(e){if(!providedPool)await pool.end();throw e;}
 return {
  async read(options){const query=selectState(options);const {rows}=await pool.query(query.text,query.values);if(!rows.length)throw Error('Base indisponível.');return rows[0].payload;},
  async change(fn,{fields,calendarId}={}){const client=await pool.connect();try{
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '10s'");
   const query=selectState({lock:true,fields,calendarId});const {rows}=await client.query(query.text,query.values);if(!rows.length)throw Error('Base indisponível.');
   const before=rows[0].payload,next=structuredClone(before),result=await fn(next);
   // Existing snapshots remain in PostgreSQL. Reject structural replacement of
   // calendars rather than accidentally writing projected history over full data.
   if(before.calendars&&(next.calendars?.length<before.calendars.length||before.calendars.some((c,i)=>next.calendars?.[i]?.id!==c.id)))throw Error('Os calendários existentes devem ser preservados.');
   const patches=statePatches(before,next);
   if(calendarId)for(const patch of patches)if(patch.path[0]==='calendars'){
    if(patch.path.length<2||rows[0].calendar_positions[Number(patch.path[1])]===undefined)throw Error('Alteração fora do calendário selecionado.');
    patch.path[1]=String(rows[0].calendar_positions[Number(patch.path[1])]);
   }
   for(let i=0;i<patches.length;i+=30){const patch=patchState(patches.slice(i,i+30));await client.query(patch.text,patch.values);}
   await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}},
  close:()=>pool.end()
 };
}
