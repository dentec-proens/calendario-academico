import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {databaseConnectionString,runtimeConfiguration} from '../src/database-config.mjs';

const database='postgresql://dentec_app:fixture@localhost:5432/dentec_test';
const deployed={DATABASE_URL:database,VERCEL:'1',VERCEL_URL:'calendar.example.test',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'server-fixture',DENTEC_SETUP_CODE:'x'.repeat(32),DENTEC_SETUP_EMAIL:'Admin@IFPR.edu.br'};

test('PostgreSQL is required in development and production without JSON fallback',()=>{
 for(const env of [{},{VERCEL:'1'},{NODE_ENV:'production'}])assert.throws(()=>runtimeConfiguration(env),error=>error.code==='DENTEC_CONFIG'&&/POSTGRES_URL.*DATABASE_URL/.test(error.message));
 const local=runtimeConfiguration({DATABASE_URL:database});
 assert.equal(local.connectionString,database);
 assert.equal(local.publicOrigin,'http://127.0.0.1:4173');
 assert.equal(local.storage,null);
 assert.equal(local.setupCode,undefined);
 assert.equal(local.setupEmail,undefined);
});

test('server refuses to start without PostgreSQL and explains the missing setting',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,POSTGRES_URL:'',DATABASE_URL:'',VERCEL:'0',NODE_ENV:'development'},encoding:'utf8',timeout:15000});
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/DENTEC_CONFIG/);
 assert.match(result.stderr,/PostgreSQL é obrigatório/);
 assert.doesNotMatch(result.stdout,/abra http/);
});

test('database URL precedence and validation never disclose credentials',()=>{
 assert.equal(databaseConnectionString({POSTGRES_URL:database,DATABASE_URL:'postgresql://other@localhost/other'}),database);
 for(const value of ['https://user:sensitive-password@example.test/private','invalid-sensitive-password']){
  assert.throws(()=>databaseConnectionString({POSTGRES_URL:value}),error=>error.code==='DENTEC_CONFIG'&&!error.message.includes('sensitive-password'));
 }
});

test('hosted and permanent production use PostgreSQL and require private storage and installation identity',()=>{
 const config=runtimeConfiguration(deployed);
 assert.equal(config.connectionString,database);
 assert.equal(config.publicOrigin,'https://calendar.example.test');
 assert.deepEqual(config.storage,{url:'https://fixture.supabase.co',key:'server-fixture'});
 assert.equal(config.setupEmail,'admin@ifpr.edu.br');
 for(const field of ['SUPABASE_URL','SUPABASE_SECRET_KEY','DENTEC_SETUP_EMAIL','DENTEC_SETUP_CODE'])assert.throws(()=>runtimeConfiguration({...deployed,[field]:''}),{code:'DENTEC_CONFIG'});
 assert.throws(()=>runtimeConfiguration({...deployed,VERCEL:'',NODE_ENV:'production'}),/DENTEC_PUBLIC_URL/);
 const permanent=runtimeConfiguration({...deployed,VERCEL:'',NODE_ENV:'production',DENTEC_PUBLIC_URL:'https://calendar.example.test'});
 assert.equal(permanent.production,true);
 assert.equal(permanent.hosted,false);
});

test('local Storage is explicit and requires a complete pair of server settings',()=>{
 const local={DATABASE_URL:database};
 assert.throws(()=>runtimeConfiguration({...local,SUPABASE_SECRET_KEY:'fixture'}),/SUPABASE_URL/);
 assert.throws(()=>runtimeConfiguration({...local,SUPABASE_URL:'https://fixture.supabase.co'}),/SUPABASE_SECRET_KEY/);
 assert.deepEqual(runtimeConfiguration({...local,NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'}).storage,{url:'https://fixture.supabase.co',key:'fixture'});
});

test('origins reject embedded credentials, paths and insecure remote addresses',()=>{
 for(const value of ['http://calendar.example.test','https://calendar.example.test/path','https://sensitive-password@calendar.example.test'])assert.throws(()=>runtimeConfiguration({DATABASE_URL:database,DENTEC_PUBLIC_URL:value}),error=>error.code==='DENTEC_CONFIG'&&!error.message.includes('sensitive-password'));
 assert.equal(runtimeConfiguration({DATABASE_URL:database,PORT:'4180'}).publicOrigin,'http://127.0.0.1:4180');
 assert.throws(()=>runtimeConfiguration({...deployed,DENTEC_PUBLIC_URL:'http://localhost:4173'}),/DENTEC_PUBLIC_URL/);
 assert.throws(()=>runtimeConfiguration({DATABASE_URL:database,PORT:'0'}),/PORT/);
});
