import { randomBytes, randomUUID, scrypt as scryptCallback, createHash } from 'node:crypto';
import { promisify, isDeepStrictEqual as equal } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { openPostgresStore, createPostgresPool } from '../../src/postgres-store.mjs';
import { relations, rootRelations } from '../../src/relational-schema.mjs';
import { readRelational } from '../../src/relational-mapper.mjs';
import { stateHash } from '../../src/database-transfer.mjs';
import { createApp } from '../../src/application.mjs';
import { updateCampuses } from '../../src/campuses.mjs';

const project = 'uzhrjqjlhfhacbcmzguq',
  role = 'dentec_test_app';
const scrypt = promisify(scryptCallback),
  digest = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

// An explicit account/project guard runs before any network connection.
export function assertQaConnection(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw Error('QA exige a URL PostgreSQL do projeto pessoal de testes.');
  }
  const username = decodeURIComponent(url.username);
  const pooled = url.hostname.endsWith('.pooler.supabase.com') && username === role + '.' + project;
  const direct = url.hostname === 'db.' + project + '.supabase.co' && username === role;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!pooled && !direct))
    throw Error(
      'QA bloqueado: projeto ou usuário PostgreSQL fora do destino de testes autorizado.',
    );
}

export function fixtureSelector(state, manifest) {
  const emails = new Set(manifest.emails),
    campuses = new Set(manifest.campusIds);
  const users = new Set([
    ...manifest.userIds,
    ...(state.users || []).filter((row) => emails.has(row.email)).map((row) => row.id),
  ]);
  const calendars = new Set(
    (state.calendars || []).filter((row) => campuses.has(row.campusId)).map((row) => row.id),
  );
  const loginIds = new Set(manifest.emails.map(digest));
  return (field, row) => {
    if (field === 'users') return users.has(row.id);
    if (field === 'campuses') return campuses.has(row.id);
    if (field === 'calendars') return calendars.has(row.id);
    if (field === 'histories') return calendars.has(row.calendarId) || campuses.has(row.campusId);
    if (field === 'reviews') return calendars.has(row.calendarId);
    if (field === 'sessions' || field === 'invitations' || field === 'passwordResets')
      return users.has(row.userId);
    if (field === 'loginAttempts') return loginIds.has(row.id);
    if (field === 'recoveryAttempts') return loginIds.has(row.key);
    if (field === 'uploads') return users.has(row.owner) || calendars.has(row.calendarId);
    if (field === 'documents') return users.has(row.createdBy);
    if (field === 'audit') return users.has(row.actor);
    return false;
  };
}

// Used for comparison only: never rewrites original business data.
export function withoutQaFixtures(state, manifest, baseline) {
  const owned = fixtureSelector(state, manifest),
    clean = structuredClone(state);
  for (const field of Object.keys(rootRelations))
    if (Array.isArray(clean[field])) {
      clean[field] = clean[field].filter((row) => !owned(field, row));
      if (!Object.hasOwn(baseline, field) && !clean[field].length) delete clean[field];
    }
  return clean;
}

function businessState(state, now) {
  const data = structuredClone(state);
  // Authentication normally prunes expired operational rows. Those deletions are
  // deliberately not undone: a valid/revoked session must never be resurrected.
  for (const [field, expires] of [
    ['sessions', 'expires'],
    ['loginAttempts', 'until'],
    ['recoveryAttempts', 'until'],
    ['passwordResets', 'expires'],
  ]) {
    if (Array.isArray(data[field])) data[field] = data[field].filter((row) => row[expires] > now);
    if (!data[field]?.length) delete data[field];
  }
  return data;
}

export function preservationReport(baseline, after, { now = Date.now() } = {}) {
  const fields = new Set([...Object.keys(baseline), ...Object.keys(after)]);
  return {
    exactMatch: equal(baseline, after),
    businessDataMatch: equal(businessState(baseline, now), businessState(after, now)),
    baselineHash: stateHash(baseline),
    afterHash: stateHash(after),
    changedFields: [...fields].filter(
      (field) =>
        !equal(baseline[field], after[field]) ||
        Object.hasOwn(baseline, field) !== Object.hasOwn(after, field),
    ),
    expiredOperationalRowsAreNotRestored: true,
  };
}

// Validate inside the real PostgreSQL transaction, before any SQL delta is
// persisted. This also catches editor autosaves without duplicating HTTP routes
// or consuming/replaying request bodies. Normal expired-auth pruning is allowed.
export function assertQaMutation(before, after, manifest, { now = Date.now() } = {}) {
  const identities = { ...manifest, userIds: [...manifest.userIds] };
  const beforeProtected = businessState(withoutQaFixtures(before, identities, before), now);
  const afterProtected = businessState(withoutQaFixtures(after, identities, before), now);
  if (!equal(beforeProtected, afterProtected))
    throw Object.assign(
      Error(
        'Proteção QA: alterações em dados originais estão bloqueadas. Use somente os registros sintéticos deste teste.',
      ),
      { status: 403, code: 'DENTEC_QA_ORIGINAL_DATA_PROTECTED' },
    );
  // Newly invited fixture accounts must remain in the disposable campus scope.
  const previousIds = new Set((before.users || []).map((user) => user.id));
  for (const user of after.users || [])
    if (
      !previousIds.has(user.id) &&
      !manifest.userIds.includes(user.id) &&
      (!manifest.emails.includes(user.email) ||
        (user.role === 'CAMPUS' && !manifest.campusIds.includes(user.campusId)))
    )
      throw Object.assign(
        Error('Proteção QA: novas contas devem ser sintéticas e vinculadas ao campus de teste.'),
        { status: 403, code: 'DENTEC_QA_ORIGINAL_DATA_PROTECTED' },
      );
}

export function guardedQaStore(store, manifest) {
  return {
    ...store,
    change: (fn, options) =>
      store.change(async (state) => {
        const before = structuredClone(state),
          result = await fn(state);
        assertQaMutation(before, state, manifest);
        return result;
      }, options),
  };
}

async function deleteEntity(client, table, key) {
  for (const [field, [child]] of Object.entries(relations[table].children || {})) {
    const { rows } = await client.query(
      `SELECT _key FROM dentec.${quote(child)} WHERE _parent=$1`,
      [key + ':' + field],
    );
    for (const row of rows) await deleteEntity(client, child, row._key);
  }
  await client.query(
    'DELETE FROM dentec.record_properties WHERE entity_type=$1 AND record_key=$2',
    [table, key],
  );
  await client.query(`DELETE FROM dentec.${quote(table)} WHERE _key=$1`, [key]);
}

export async function cleanupQaFixtures(pool, manifest, baseline) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='60s'");
    const { state, keys } = await readRelational(client, { full: true });
    const owned = fixtureSelector(state, manifest),
      expected = withoutQaFixtures(state, manifest, baseline),
      removed = {};
    // Deferred FKs allow roots to be removed in any order, but children and typed
    // extension rows are always explicitly removed with their owning roots.
    for (const [field, table] of Object.entries(rootRelations)) {
      if (!Array.isArray(state[field])) continue;
      for (let index = 0; index < state[field].length; index++)
        if (owned(field, state[field][index])) {
          await deleteEntity(client, table, keys.get(field)[index].key);
          removed[field] = (removed[field] || 0) + 1;
        }
      if (!Object.hasOwn(expected, field) && Object.hasOwn(state, field))
        await client.query('DELETE FROM dentec.root_fields WHERE name=$1', [field]);
    }
    const after = (await readRelational(client, { full: true })).state;
    if (!equal(expected, after))
      throw Error(
        'A limpeza não corresponde exclusivamente aos registros sintéticos; transação revertida.',
      );
    await client.query('COMMIT');
    return { ...preservationReport(baseline, after), removed };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function startPortalQa({
  connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL,
  directory,
} = {}) {
  assertQaConnection(connectionString);
  const pool = await createPostgresPool(connectionString);
  const identity = await pool.query('SELECT current_user AS role');
  if (identity.rows[0].role !== role) {
    await pool.end();
    throw Error('QA bloqueado: identidade efetiva do banco inesperada.');
  }
  const store = await openPostgresStore(connectionString, { pool, initialize: false, seed: false });
  const baseline = await store.exportState();
  const normal = structuredClone(baseline);
  updateCampuses(normal);
  if (!equal(normal.campuses, baseline.campuses)) {
    await store.close();
    throw Error(
      'QA bloqueado: o arranque normal alteraria campi originais. Revise a normalização antes de executar.',
    );
  }
  const runId = randomUUID(),
    marker = 'QA React ' + runId.slice(0, 8);
  const output = resolve(directory || 'data/migration-backups/portal-qa-' + runId);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const baselineFile = resolve(output, 'baseline.json');
  await writeFile(baselineFile, JSON.stringify(baseline), { mode: 0o600, flag: 'wx' });
  const campusIds = [randomUUID(), randomUUID()],
    userIds = [randomUUID(), randomUUID(), randomUUID()];
  const activeCalendars = (baseline.calendars || []).filter((calendar) => !calendar.deletedAt);
  const scopes = (baseline.campuses || [])
    .map((campus) => ({
      ...campus,
      count: activeCalendars.filter((calendar) => calendar.campusId === campus.id).length,
    }))
    .filter((campus) => campus.count);
  const campusScope =
    scopes.find((campus) => campus.name === 'Cascavel') ||
    scopes.sort((a, b) => b.count - a.count)[0];
  const emails = ['admin', 'campus', 'other', 'invited'].map(
    (label) => 'qa.react.' + runId.slice(0, 8) + '.' + label + '@ifpr.edu.br',
  );
  if ((baseline.users || []).some((row) => emails.includes(row.email)))
    throw Error('Identidade sintética já existe.');
  const manifest = {
    runId,
    marker,
    campusIds,
    userIds,
    emails,
    createdAt: new Date().toISOString(),
    baselineFile,
  };
  const accounts = await Promise.all(
    ['ADMIN', 'CAMPUS', 'CAMPUS'].map(async (profile, index) => {
      const password = 'Qa!' + randomBytes(18).toString('base64url'),
        salt = randomBytes(16).toString('hex');
      return {
        id: userIds[index],
        name: marker + ' ' + (index === 0 ? 'Admin' : index === 1 ? 'Campus' : 'Outro'),
        email: emails[index],
        role: profile,
        campusId: index === 1 ? campusScope?.id || campusIds[0] : index === 2 ? campusIds[1] : null,
        active: true,
        loginMethod: 'local',
        password,
        salt,
        hash: (await scrypt(password, salt, 64)).toString('hex'),
      };
    }),
  );
  const campuses = campusIds.map((id, index) => ({
    id,
    name: marker + (index ? ' Outro campus' : ' Campus'),
  }));
  let app, context;
  const requests = [];
  const requestsFile = resolve(output, 'requests.json');
  const snapshot = async () => {
    const durations = requests.map((request) => request.durationMs).sort((a, b) => a - b);
    const routes = {};
    for (const request of requests) {
      const key = request.method + ' ' + request.path + ' ' + request.status;
      routes[key] = (routes[key] || 0) + 1;
    }
    const statistics = {
      count: requests.length,
      p50Ms: durations[Math.max(0, Math.ceil(durations.length * 0.5) - 1)] || 0,
      p95Ms: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] || 0,
      maxMs: durations.at(-1) || 0,
      routes,
    };
    await writeFile(requestsFile, JSON.stringify({ statistics, requests }, null, 2) + '\n', {
      mode: 0o600,
    });
    return { requestsFile, ...statistics };
  };
  const cleanup = async () => {
    if (app?.server.listening) {
      app.server.closeIdleConnections();
      await new Promise((resolve, reject) =>
        app.server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    const report = {
      ...(await cleanupQaFixtures(pool, manifest, baseline)),
      requests: await snapshot(),
    };
    await writeFile(
      resolve(output, 'cleanup-report.json'),
      JSON.stringify(report, null, 2) + '\n',
      { mode: 0o600 },
    );
    await store.close();
    return report;
  };
  try {
    await store.change(
      (db) => {
        db.campuses.push(...campuses);
        db.users.push(...accounts.map(({ password, ...user }) => user));
      },
      { fields: ['campuses', 'users'] },
    );
    app = await createApp({
      store: guardedQaStore(store, manifest),
      files: null,
      googleAuth: undefined,
      recoveryMail: null,
    });
    if (!equal(withoutQaFixtures(await store.exportState(), manifest, baseline), baseline))
      throw Error('O arranque alterou dados originais; QA interrompido.');
    app.server.on('request', (request, response) => {
      const started = process.hrtime.bigint();
      response.once('finish', () => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname.replace(
          /\/[0-9a-f]{8}-[0-9a-f-]{27,}/g,
          '/:id',
        );
        requests.push({
          method: request.method,
          path,
          status: response.statusCode,
          durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        });
      });
    });
    await new Promise((resolve, reject) => {
      app.server.once('error', reject);
      app.server.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + app.server.address().port;
    context = {
      ...manifest,
      origin,
      campuses,
      accounts: accounts.map(({ salt, hash, ...account }) => account),
      invitedEmail: emails[3],
      output,
      requestsFile,
      campusUserScopeId: campusScope?.id || campusIds[0],
      campusUserScopeName: campusScope?.name || campuses[0].name,
      baselineVisibleCalendarCount: campusScope?.count || 0,
      crossCampusCalendarId:
        activeCalendars.find((calendar) => calendar.campusId !== campusScope?.id)?.id || null,
      fixtureCalendarCampusIds: campusIds,
      existingCalendarSamples: activeCalendars.slice(0, 3).map((calendar) => ({
        id: calendar.id,
        campusId: calendar.campusId,
        year: calendar.state?.year,
        version: calendar.version,
      })),
      activeReviewCalendarIds: (baseline.reviews || [])
        .filter((review) => activeCalendars.some((calendar) => calendar.id === review.calendarId))
        .map((review) => review.calendarId),
    };
    const contextFile = resolve(output, 'context.json');
    await writeFile(contextFile, JSON.stringify(context, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    return { origin, contextFile, output, cleanup, snapshot };
  } catch (error) {
    await cleanup().catch(() => {});
    throw error;
  }
}

async function main() {
  const options = process.argv.slice(2),
    directory = options
      .find((value) => value.startsWith('--directory='))
      ?.slice('--directory='.length);
  const qa = await startPortalQa({ directory });
  process.stdout.write(
    JSON.stringify({
      ready: true,
      origin: qa.origin,
      contextFile: qa.contextFile,
      output: qa.output,
    }) + '\n',
  );
  const input = createInterface({ input: process.stdin });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    input.close();
    try {
      process.stdout.write(JSON.stringify({ cleaned: true, ...(await qa.cleanup()) }) + '\n');
      process.exitCode = 0;
    } catch (error) {
      console.error('QA_CLEANUP_FAILED', error.code || error.message);
      process.exitCode = 1;
    }
  };
  input.on('line', (line) => {
    if (line.trim() === 'cleanup') void stop();
    else if (line.trim() === 'stats')
      void qa
        .snapshot()
        .then((statistics) => process.stdout.write(JSON.stringify({ statistics }) + '\n'));
  });
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error('QA_START_FAILED', error.code || error.message);
    process.exitCode = 1;
  });
