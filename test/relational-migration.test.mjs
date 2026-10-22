import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {openPostgresStore} from '../src/postgres-store.mjs';

test('committed migration enables the restricted backend and denies public roles without runtime DDL',async t=>{
 const pg=new PGlite();await pg.waitReady;t.after(()=>pg.close());
 await pg.exec('CREATE ROLE dentec_test_app NOLOGIN NOINHERIT NOBYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 const migration=await readFile(new URL('../supabase/migrations/20261022142451_relational_entities.sql',import.meta.url),'utf8');
 await pg.exec(migration);
 await pg.exec('SET ROLE dentec_test_app');
 const query=(text,values=[])=>pg.query(text,values),pool={query,connect:async()=>({query,release(){}})};
 const store=await openPostgresStore('postgres://unused',{pool,initialize:false,seed:false});
 const original={campuses:[{id:'campus',name:'Fixture'}],users:[{id:'u',name:'Test',email:'fixture@ifpr.edu.br',role:'CAMPUS',campusId:'campus',active:true}],calendars:[],audit:[],catalogue:{revision:1,events:[]}};
 await store.importState(original);assert.deepEqual(await store.exportState(),original);
 await store.change(db=>{db.sessions=[{id:'digest',userId:'u',expires:9999999999999}];});
 assert.equal((await store.read({fields:['sessions'],sessionHash:'digest'})).sessions[0].userId,'u');
 await assert.rejects(pg.query('CREATE TABLE dentec.forbidden(id integer)'),/permission denied/);
 await pg.exec('RESET ROLE');
 for(const role of ['anon','authenticated','service_role']){
  await pg.exec('SET ROLE '+role);await assert.rejects(pg.query('SELECT * FROM dentec.users'),/permission denied/);await pg.exec('RESET ROLE');
 }
 const columns=(await pg.query("SELECT column_name FROM information_schema.columns WHERE table_schema='dentec' AND data_type IN ('json','jsonb')")).rows;
 assert.deepEqual(columns,[]);
});
