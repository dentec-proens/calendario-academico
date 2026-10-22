import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { rootKeys } from './relational-schema.mjs';

const collections = new Set([
  'users',
  'campuses',
  'calendars',
  'histories',
  'documents',
  'uploads',
  'reviews',
  'sessions',
  'loginAttempts',
  'invitations',
  'passwordResets',
  'recoveryAttempts',
]);
const hasSnapshotState = (version) =>
  typeof version?.state === 'object' && version.state !== null && !Array.isArray(version.state);

export function stateHash(state) {
  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, ordered(value[key])]),
      );
    return value;
  }

  return createHash('sha256')
    .update(JSON.stringify(ordered(state)))
    .digest('hex');
}

export function stateCounts(state) {
  return Object.fromEntries(
    Object.entries(state)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, value.length]),
  );
}

export async function readJsonImport(path) {
  const state = JSON.parse(await readFile(path, 'utf8'));
  if (!state || Array.isArray(state) || typeof state !== 'object')
    throw Error('A importação exige um objeto de dados completo.');
  return state;
}

export async function writeJsonExport(path, state) {
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return resolve(path);
}

export async function backupImport(directory, name, state) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const safeName = name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80);
  const path = join(directory, `${safeName}-${stateHash(state)}.json`);
  try {
    return await writeJsonExport(path, state);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!isDeepStrictEqual(await readJsonImport(path), state))
    throw Error('O backup existente diverge da origem. A migração foi interrompida.');
  return resolve(path);
}

// Only migration/import code reads the former JSONB document. Runtime queries
// use the relational schema. The original document and archive remain intact.
export async function readLegacyPostgres(pool) {
  const { rows: exists } = await pool.query(
    "SELECT to_regclass('dentec_private.app_state') AS state, to_regclass('dentec_private.calendar_versions') AS versions",
  );
  if (!exists[0]?.state) return null;
  const { rows } = await pool.query('SELECT payload FROM dentec_private.app_state WHERE id=1');
  if (!rows.length) return null;
  const state = structuredClone(rows[0].payload);
  const versions = exists[0].versions
    ? (
        await pool.query(
          'SELECT calendar_id, ordinal, snapshot, metadata FROM dentec_private.calendar_versions ORDER BY calendar_id, ordinal',
        )
      ).rows
    : [];
  if (
    versions.some(
      (row) => !(state.calendars || []).some((calendar) => calendar.id === row.calendar_id),
    )
  )
    throw Error(
      'O histórico legado contém calendário ausente na origem. Nenhum dado foi importado.',
    );
  const archived = new Map(versions.map((row) => [`${row.calendar_id}:${row.ordinal}`, row]));
  if (
    archived.size !== versions.length ||
    versions.some((row) => !Number.isInteger(row.ordinal) || row.ordinal < 1)
  )
    throw Error('As posições do histórico legado estão inconsistentes. Nenhum dado foi importado.');
  for (const calendar of state.calendars || []) {
    if (
      !Object.hasOwn(calendar, 'versions') &&
      !versions.some((row) => row.calendar_id === calendar.id)
    )
      continue;
    if (!Array.isArray(calendar.versions))
      throw Error('Histórico legado inválido. Nenhum dado foi importado.');
    calendar.versions = calendar.versions.map((version, index) => {
      const saved = archived.get(`${calendar.id}:${index + 1}`);
      if (!saved) {
        if (!hasSnapshotState(version))
          throw Error(
            'Histórico legado sem snapshot arquivado nem estado integral. Nenhum dado foi importado.',
          );
        return version;
      }
      if (!hasSnapshotState(saved.snapshot))
        throw Error(
          'Histórico legado com snapshot arquivado incompleto. Nenhum dado foi importado.',
        );
      if (
        !isDeepStrictEqual(version, saved.metadata) &&
        !isDeepStrictEqual(version, saved.snapshot)
      )
        throw Error('Histórico legado divergente. Nenhum dado foi importado.');
      return structuredClone(saved.snapshot);
    });
    const expected = versions.filter((row) => row.calendar_id === calendar.id);
    if (expected.some((row) => row.ordinal > calendar.versions.length))
      throw Error(
        'O arquivo de versões contém posições ausentes no estado legado. Confira a origem antes de migrar.',
      );
  }
  return state;
}

export function mergeImportSources(sources) {
  if (!sources.length) throw Error('Nenhuma origem de importação informada.');

  function merge(left, right, path = []) {
    if (isDeepStrictEqual(left, right)) return structuredClone(left);
    if (left === undefined) return structuredClone(right);
    if (right === undefined) return structuredClone(left);
    if (Array.isArray(left) && Array.isArray(right)) {
      if (!left.length) return structuredClone(right);
      if (!right.length) return structuredClone(left);
      if (
        (path.length === 1 && collections.has(path[0])) ||
        path.join('.') === 'catalogue.events'
      ) {
        const result = structuredClone(left);
        for (const row of right) {
          const key = path.length === 1 ? rootKeys[path[0]] : 'id';
          if (!key || typeof row?.[key] !== 'string')
            throw Error(
              `Registros sem identificador em ${path.join('.')}; escolha uma origem explicitamente.`,
            );
          const index = result.findIndex((item) => item?.[key] === row[key]);
          if (index < 0) result.push(structuredClone(row));
          else result[index] = merge(result[index], row, [...path, '[registro]']);
        }
        return result;
      }
      if (path.length === 1 && path[0] === 'audit')
        return [...structuredClone(left), ...structuredClone(right)];
      throw Error(
        `Origens divergentes em ${path.join('.')}. A migração não escolhe dados para sobrescrever.`,
      );
    }
    if (
      left &&
      right &&
      typeof left === 'object' &&
      typeof right === 'object' &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      return Object.fromEntries(
        [...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => [
          key,
          merge(
            Object.hasOwn(left, key) ? left[key] : undefined,
            Object.hasOwn(right, key) ? right[key] : undefined,
            [...path, key],
          ),
        ]),
      );
    }
    throw Error(`Origens divergentes em ${path.join('.')}. Nenhuma origem foi descartada.`);
  }

  return sources.reduce((state, source) => merge(state, source.state), {});
}

export const importHistorySql = `CREATE TABLE IF NOT EXISTS dentec.import_history (
 source_hash text PRIMARY KEY,
 source_name text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON dentec.import_history FROM PUBLIC;
ALTER TABLE dentec.import_history ENABLE ROW LEVEL SECURITY;`;

export async function importVerified(store, pool, state, sourceName, backupDirectory) {
  const hash = stateHash(state);
  const previous = await pool.query(
    'SELECT source_hash FROM dentec.import_history WHERE source_hash=$1',
    [hash],
  );
  if (previous.rows.length) return { alreadyImported: true, hash, counts: stateCounts(state) };
  const backup = await backupImport(backupDirectory, sourceName, state);
  const current = await store.exportState();
  if (!isDeepStrictEqual(current, state)) await store.importState(state);
  const restored = await store.exportState();
  if (!isDeepStrictEqual(restored, state))
    throw Error(
      'A conferência integral após importação falhou. O backup e a origem foram preservados.',
    );
  await pool.query(
    'INSERT INTO dentec.import_history(source_hash,source_name) VALUES($1,$2) ON CONFLICT(source_hash) DO NOTHING',
    [hash, sourceName],
  );
  return { alreadyImported: false, hash, backup, counts: stateCounts(state) };
}
