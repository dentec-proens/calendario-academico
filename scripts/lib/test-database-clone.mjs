import { isDeepStrictEqual } from 'node:util';
import { openPostgresStore } from '../../src/postgres-store.mjs';
import { readRelational } from '../../src/relational-mapper.mjs';
import { relations } from '../../src/relational-schema.mjs';
import { backupImport, stateHash, stateCounts } from '../../src/database-transfer.mjs';

// Explicit administrative tooling: the application never calls this helper.
// JSON is used solely as import transport for the existing typed SQL columns.
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const domainTables = ['root_fields', 'record_properties', ...Object.keys(relations)];
const columnsFor = (table) =>
  table === 'root_fields'
    ? ['name']
    : table === 'record_properties'
      ? ['entity_type', 'record_key', 'path', 'kind', 'text_value', 'number_value', 'boolean_value']
      : [
          '_key',
          '_parent',
          '_position',
          '_fields',
          '_undefined',
          ...Object.keys(relations[table].fields),
        ];
const notify = (onProgress, event) => onProgress?.(event);

export async function prepareTestClone(source, { onProgress } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw Error('A cópia exige um estado completo.');
  const state = structuredClone(source),
    { PGlite } = await import('@electric-sql/pglite'),
    pg = new PGlite();
  await pg.waitReady;
  const pool = {
    query: (sql, values) => pg.query(sql, values),
    connect: async () => ({ query: (sql, values) => pg.query(sql, values), release() {} }),
  };
  try {
    await notify(onProgress, { phase: 'preflight-start' });
    const store = await openPostgresStore('postgres://clone-preflight', {
      pool,
      initialize: true,
      seed: false,
    });
    await store.importState(state);
    if (!isDeepStrictEqual(await store.exportState(), state))
      throw Error('A reconstrução local divergiu da origem.');
    const tables = [];
    for (const name of domainTables) {
      const order =
        name === 'root_fields'
          ? 'name'
          : name === 'record_properties'
            ? 'entity_type,record_key,path'
            : '_order';
      const { rows } = await pg.query(
        `SELECT to_jsonb(row) - '_order' AS value FROM dentec.${name} AS row ORDER BY ${order}`,
      );
      tables.push({ name, columns: columnsFor(name), rows: rows.map((row) => row.value) });
    }
    const result = { state, hash: stateHash(state), counts: stateCounts(state), tables };
    await notify(onProgress, {
      phase: 'preflight-complete',
      counts: result.counts,
      rows: tables.reduce((count, table) => count + table.rows.length, 0),
    });
    return result;
  } finally {
    await pg.close();
  }
}

function validateDestination({
  connectionString,
  targetProjectRef,
  sourceProjectRef,
  expectedRuntimeRole,
  fixture,
}) {
  if (sourceProjectRef === targetProjectRef)
    throw Error('A origem e o destino da cópia devem ser projetos distintos.');
  if (fixture === true) {
    if (
      connectionString !== 'postgres://isolated-test-database' ||
      targetProjectRef !== 'isolated-test-fixture'
    )
      throw Error('Destino da fixture inválido.');
    return;
  }
  if (!/^[a-z]{20}$/.test(targetProjectRef || '') || !/^[a-z]{20}$/.test(sourceProjectRef || ''))
    throw Error('Informe os identificadores explícitos dos projetos de origem e de testes.');
  if (expectedRuntimeRole !== 'dentec_test_app')
    throw Error('A cópia exige a identidade restrita do banco de testes.');
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw Error('A conexão do banco de testes é inválida.');
  }
  const pooler =
    url.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(url.username) === `${expectedRuntimeRole}.${targetProjectRef}`;
  const direct =
    url.hostname === `db.${targetProjectRef}.supabase.co` &&
    decodeURIComponent(url.username) === expectedRuntimeRole;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!pooler && !direct))
    throw Error('A conexão não identifica o projeto de testes e sua role restrita.');
}

function* batches(rows) {
  let batch = [],
    bytes = 2;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (batch.length && (batch.length >= 500 || bytes + size > 2_000_000)) {
      yield batch;
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length) yield batch;
}

export async function cloneTestDatabase({
  pool,
  connectionString,
  targetProjectRef,
  sourceProjectRef,
  expectedRuntimeRole = 'dentec_test_app',
  expectedTargetHash,
  backupDirectory,
  prepared,
  fixture = false,
  onProgress,
}) {
  validateDestination({
    connectionString,
    targetProjectRef,
    sourceProjectRef,
    expectedRuntimeRole,
    fixture,
  });
  if (!/^[a-f0-9]{64}$/.test(expectedTargetHash || ''))
    throw Error('Informe o hash esperado do destino antes da cópia.');
  if (!backupDirectory) throw Error('Informe o diretório privado de backup do destino.');
  if (
    !prepared ||
    prepared.hash !== stateHash(prepared.state) ||
    prepared.tables?.length !== domainTables.length ||
    prepared.tables.some(
      (table, index) =>
        table.name !== domainTables[index] ||
        !isDeepStrictEqual(table.columns, columnsFor(table.name)),
    )
  )
    throw Error('A cópia exige um preflight relacional íntegro.');
  const identity = (
    await pool.query(
      'SELECT current_user AS role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
    )
  ).rows[0];
  if (
    !fixture &&
    (identity?.role !== expectedRuntimeRole ||
      identity.rolsuper ||
      identity.rolbypassrls ||
      identity.rolcreatedb ||
      identity.rolcreaterole)
  )
    throw Error('A identidade do destino não é a role restrita esperada.');
  const priorClient = await pool.connect();
  let before;
  try {
    await priorClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    before = (await readRelational(priorClient, { full: true })).state;
    await priorClient.query('COMMIT');
  } catch (error) {
    await priorClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    priorClient.release();
  }
  if (stateHash(before) !== expectedTargetHash)
    throw Error('O destino mudou desde a conferência. Nenhum dado foi substituído.');
  const backup = await backupImport(
    backupDirectory,
    `test-before-clone-${targetProjectRef}`,
    before,
  );
  await notify(onProgress, { phase: 'target-backed-up', backup, hash: expectedTargetHash });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    // Lock writes before the first data query acquires a transaction snapshot.
    await client.query(
      'LOCK TABLE ' +
        domainTables.map((table) => 'dentec.' + table).join(',') +
        ' IN SHARE ROW EXCLUSIVE MODE',
    );
    const current = (await readRelational(client, { full: true })).state;
    if (stateHash(current) !== expectedTargetHash)
      throw Error('O destino mudou após o backup. Nenhum dado foi substituído.');
    for (const table of domainTables) await client.query(`DELETE FROM dentec.${table}`);
    for (const table of prepared.tables) {
      const columns = table.columns.map(quote).join(',');
      for (const batch of batches(table.rows))
        await client.query(
          `INSERT INTO dentec.${table.name} (${columns}) SELECT ${table.columns.map((column) => 'incoming.' + quote(column)).join(',')} FROM jsonb_populate_recordset(NULL::dentec.${table.name},$1::jsonb) WITH ORDINALITY AS incoming ORDER BY incoming.ordinality`,
          [JSON.stringify(batch)],
        );
      await notify(onProgress, {
        phase: 'table-imported',
        table: table.name,
        rows: table.rows.length,
      });
    }
    const after = (await readRelational(client, { full: true })).state;
    if (!isDeepStrictEqual(after, prepared.state))
      throw Error('A conferência integral da cópia falhou. O destino anterior foi preservado.');
    await client.query(
      'INSERT INTO dentec.import_history(source_hash,source_name) VALUES($1,$2) ON CONFLICT(source_hash) DO NOTHING',
      [prepared.hash, `clone:${sourceProjectRef}:to:${targetProjectRef}`],
    );
    // Force deferred referential checks before reporting success.
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('COMMIT');
    const result = {
      hash: prepared.hash,
      previousHash: expectedTargetHash,
      counts: prepared.counts,
      backup,
    };
    await notify(onProgress, { phase: 'clone-complete', ...result });
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
