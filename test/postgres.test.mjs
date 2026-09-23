import test from 'node:test';
import assert from 'node:assert/strict';
import {openPostgresStore} from '../src/postgres-store.mjs';
import {persistentSessions,consumeLoginAttempt} from '../src/session-store.mjs';

// This variable must point only to a disposable test database, never production.
test('PostgreSQL serializes independent writers, rolls back failures and shares sessions', {skip:!process.env.DENTEC_TEST_POSTGRES_URL},async t=>{
 const first=await openPostgresStore(process.env.DENTEC_TEST_POSTGRES_URL),second=await openPostgresStore(process.env.DENTEC_TEST_POSTGRES_URL);
 t.after(async()=>{await first.close();await second.close();});
 await first.change(db=>{db.testCounter=0;});
 await Promise.all(Array.from({length:12},(_,i)=>(i%2?first:second).change(async db=>{const value=db.testCounter;await new Promise(r=>setTimeout(r,5));db.testCounter=value+1;})));
 assert.equal((await second.read()).testCounter,12);
 await assert.rejects(first.change(db=>{db.testCounter=999;throw Error('rollback fixture');}));assert.equal((await second.read()).testCounter,12);
 const token='b'.repeat(64);await persistentSessions(first).set(token,{userId:'synthetic',expires:Date.now()+60000});
 assert.equal((await persistentSessions(second).get(token)).userId,'synthetic');await persistentSessions(second).delete(token);assert.equal(await persistentSessions(first).get(token),undefined);
 const key='synthetic-'+Date.now();const allowed=await Promise.all(Array.from({length:20},(_,i)=>consumeLoginAttempt(i%2?first:second,key)));assert.equal(allowed.filter(Boolean).length,15);
 const {Pool}=await import('pg'),pool=new Pool({connectionString:process.env.DENTEC_TEST_POSTGRES_URL});
 try{const {rows}=await pool.query("SELECT EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a WHERE n.nspname='dentec_private' AND a.grantee=0 AND a.privilege_type='USAGE') AS exposed");assert.equal(rows[0].exposed,false);}finally{await pool.end();}
});
