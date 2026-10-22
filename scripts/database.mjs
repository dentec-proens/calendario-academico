import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {openPostgresStore, createPostgresPool} from '../src/postgres-store.mjs';
import {databaseConnectionString} from '../src/database-config.mjs';
import {initialCatalogue, campusNames} from '../src/institution.mjs';
import {configureRuntimeAccess, restrictApiRolesSql} from '../src/database-access.mjs';
import {readJsonImport, writeJsonExport, readLegacyPostgres, mergeImportSources, importVerified, importHistorySql, stateCounts, stateHash} from '../src/database-transfer.mjs';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const [command, ...args] = process.argv.slice(2);
const argument = name => args.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const filename = args.find(value => !value.startsWith('--'));
const backupDirectory = resolve(argument('--backup-dir') || 'data/migration-backups');
let pool;
try {
  if (!['migrate','import','export'].includes(command)) throw Error('Use db:migrate, db:import -- arquivo.json ou db:export -- arquivo.json.');
  const connection = databaseConnectionString(command === 'migrate' && process.env.DENTEC_MIGRATION_DATABASE_URL
    ? {...process.env, POSTGRES_URL: process.env.DENTEC_MIGRATION_DATABASE_URL} : process.env);
  pool = await createPostgresPool(connection);
  const sources = [];
  if (command === 'migrate' || args.includes('--legacy')) {
    const legacy = await readLegacyPostgres(pool);
    if (legacy) sources.push({name: 'legacy-postgres', state: legacy});
  }
  const store = await openPostgresStore(connection, {pool, initialize: command === 'migrate', seed: false});
  if (command === 'migrate') {
    await pool.query(importHistorySql);
    await pool.query(restrictApiRolesSql);
    await configureRuntimeAccess(pool, process.env.DENTEC_DATABASE_ROLE);
  }
  if (command === 'export') {
    if (!filename) throw Error('Informe o arquivo de exportação. Arquivos existentes não serão sobrescritos.');
    const state = await store.exportState();
    console.log(JSON.stringify({exported: await writeJsonExport(resolve(filename), state), hash: stateHash(state), counts: stateCounts(state)}));
  } else {
    const jsonPath = command === 'import' ? filename : argument('--import-json');
    if (jsonPath) sources.push({name: 'json-import', state: await readJsonImport(resolve(jsonPath))});
    if (!sources.length && command === 'import') throw Error('Informe o arquivo de importação ou --legacy.');
    if (!sources.length) {
      const current = await store.exportState();
      if (Object.keys(current).length) console.log(JSON.stringify({migrated: true, initialized: true, counts: stateCounts(current)}));
      else {
        const initial = {users: [], campuses: campusNames.map((name,i) => ({id:`campus-${i+1}`,name})), calendars: [], histories: [], audit: [], catalogue: initialCatalogue()};
        console.log(JSON.stringify(await importVerified(store, pool, initial, 'institutional-defaults', backupDirectory)));
      }
    } else {
      const combined = mergeImportSources(sources);
      console.log(JSON.stringify(await importVerified(store, pool, combined, sources.map(source => source.name).join('+'), backupDirectory)));
    }
  }
} catch (error) {
  // Configuration and driver errors can carry connection details; never print
  // URLs, passwords or the full driver object.
  const safe = /Origens|origem|import|backup|Informe|PostgreSQL|POSTGRES|DATABASE|Use db|schema|migra|Histórico|arquivo|conferência/i.test(error.message || '')
    && !/postgres(?:ql)?:\/\//i.test(error.message);
  console.error(safe ? error.message : `Operação de banco interrompida (${error.code || 'erro de conexão/permissão'}). Confira a configuração e as migrações.`);
  process.exitCode = 1;
} finally { await pool?.end(); }
