import {PGlite} from '@electric-sql/pglite';
import {openPostgresStore} from '../../src/postgres-store.mjs';
import {createApp} from '../../src/application.mjs';

// PGlite executes the production PostgreSQL schema and SQL locally. Every fixture
// owns a separate database, without connecting to a configured development DB.
export async function createTestDatabase(t,{seed=true}={}) {
 const pg=new PGlite();
 await pg.waitReady;
 t.after(()=>pg.close());
 let queue=Promise.resolve();
 const acquire=async()=>{
  const previous=queue;let release;
  queue=new Promise(resolve=>{release=resolve;});
  await previous;
  return release;
 };
 const query=(text,values=[])=>pg.query(text,values);
 const pool={
  async query(text,values=[]){const release=await acquire();try{return await query(text,values);}finally{release();}},
  async connect(){const release=await acquire();return {query,release};},
 };
 const connection='postgres://isolated-test-database';
 const store=await openPostgresStore(connection,{pool,initialize:true,seed});
 const reopen=()=>openPostgresStore(connection,{pool,initialize:false,seed:false});
 return {pg,pool,store,reopen};
}

export async function createTestApp(t,{store,...options}={}) {
 return createApp({...options,store:store||(await createTestDatabase(t)).store});
}
