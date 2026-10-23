import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { encodeValue } from '../../src/convex-codec.mjs';
import { canonicalJson } from '../../src/migration-canonical.mjs';

export const sourceProject = 'heqytxslokehuyrlxsza';
export const targetDeployment = 'oceanic-gazelle-652';
export const targetUrl = `https://${targetDeployment}.convex.cloud`;
const identities = {
  users: 'id',
  campuses: 'id',
  calendars: 'id',
  histories: 'id',
  sessions: 'id',
  loginAttempts: 'id',
  invitations: 'tokenHash',
  passwordResets: 'hash',
  recoveryAttempts: 'key',
  uploads: 'id',
  documents: 'id',
  reviews: 'calendarId',
  audit: null,
};
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const invalid = () => {
  throw Error('Exportação de origem inválida ou inconsistente.');
};

const fingerprint = (value) => createHash('sha256').update(canonicalJson(value)).digest('hex');

function batches(items, wrap, maximumBytes = 90_000, maximumItems = 25) {
  const result = [];
  let current = [];
  for (const item of items) {
    if (bytes(wrap([item])) > maximumBytes) throw Error('Registro excede o limite seguro do lote.');
    if (
      current.length &&
      (current.length >= maximumItems || bytes(wrap([...current, item])) > maximumBytes)
    ) {
      result.push(wrap(current));
      current = [];
    }
    current.push(item);
  }
  if (current.length) result.push(wrap(current));
  return result;
}

export function planSourceMigration(source, { deferFiles = false } = {}) {
  if (
    source?.source_project !== sourceProject ||
    !Array.isArray(source.app_state) ||
    source.app_state.length !== 1 ||
    !Array.isArray(source.calendar_versions) ||
    !Array.isArray(source.storage_objects)
  )
    invalid();
  const state = structuredClone(source.app_state[0].payload);
  if (
    !state ||
    typeof state !== 'object' ||
    Array.isArray(state) ||
    !Array.isArray(state.calendars)
  )
    invalid();
  const calendarById = new Map();
  for (const calendar of state.calendars) {
    if (!calendar.id || calendarById.has(calendar.id) || !Array.isArray(calendar.versions))
      invalid();
    calendarById.set(calendar.id, calendar);
  }
  const archiveByCalendar = new Map();
  for (const entry of source.calendar_versions) {
    const calendar = calendarById.get(entry.calendar_id);
    if (
      !calendar ||
      !Number.isSafeInteger(entry.ordinal) ||
      entry.ordinal < 1 ||
      !entry.snapshot ||
      !isDeepStrictEqual(calendar.versions[entry.ordinal - 1], entry.metadata)
    )
      invalid();
    const versions = archiveByCalendar.get(calendar.id) || new Map();
    if (versions.has(entry.ordinal)) invalid();
    versions.set(entry.ordinal, entry);
    archiveByCalendar.set(calendar.id, versions);
  }
  const archives = [];
  for (const calendar of state.calendars) {
    const versions = archiveByCalendar.get(calendar.id) || new Map();
    if (calendar.versions.length !== versions.size) invalid();
    for (let index = 0; index < calendar.versions.length; index++) {
      const entry = versions.get(index + 1);
      if (!entry) invalid();
      archives.push({
        calendarId: calendar.id,
        ordinal: index,
        metadata: encodeValue(entry.metadata),
        snapshot: encodeValue(entry.snapshot),
      });
    }
    calendar.versions = [];
  }
  const fields = Object.keys(state);
  if (fields.includes('_convexSourceMigration')) invalid();
  const order = [
    'users',
    'campuses',
    'calendars',
    'histories',
    'reviews',
    ...fields.filter(
      (f) => !['users', 'campuses', 'calendars', 'histories', 'reviews', 'audit'].includes(f),
    ),
    'audit',
  ];
  const baseBatches = [];
  const counts = Object.fromEntries(Object.keys(identities).map((field) => [field, 0]));
  const contentChecks = [];
  for (const field of order) {
    if (!Object.hasOwn(state, field)) continue;
    const value = state[field];
    if (!Object.hasOwn(identities, field)) {
      const change = { field, value: encodeValue(value) };
      if (bytes(change) > 90_000) throw Error('Coleção excede o limite seguro de documento.');
      baseBatches.push([change]);
      contentChecks.push({ kind: 'root', field, hash: fingerprint(change.value) });
      continue;
    }
    if (!Array.isArray(value) || value.length > 1000) invalid();
    counts[field] = value.length;
    const seen = new Set();
    const upserts = value.map((item, position) => {
      const identity = identities[field];
      const id = identity ? item?.[identity] : position;
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        (identity && (typeof id !== 'string' || !id)) ||
        seen.has(id)
      )
        invalid();
      seen.add(id);
      contentChecks.push({
        kind: 'entity',
        field,
        key: `${field}:${id}`,
        position,
        hash: fingerprint(encodeValue(item)),
      });
      return { key: `${field}:${id}`, position, value: encodeValue(item) };
    });
    if (!upserts.length) baseBatches.push([{ field, upserts: [] }]);
    else baseBatches.push(...batches(upserts, (items) => [{ field, upserts: items }]));
  }
  const names = new Set();
  const files = source.storage_objects.map((item) => {
    if (
      typeof item.name !== 'string' ||
      !item.name ||
      item.name.startsWith('/') ||
      item.name.split('/').some((part) => !part || part === '.' || part === '..') ||
      names.has(item.name)
    )
      invalid();
    names.add(item.name);
    const size = item.metadata?.size;
    if (!Number.isSafeInteger(size) || size < 5 || size > 8_000_000) invalid();
    return {
      path: item.name,
      size,
      etag: typeof item.metadata.eTag === 'string' ? item.metadata.eTag.replaceAll('"', '') : null,
    };
  });
  for (const item of [...(state.histories || []), ...(state.documents || [])])
    if (item.objectKey && !names.has(item.objectKey)) invalid();
  const expectedAccounts = (state.users || []).filter(
    (u) =>
      u.active &&
      !u.removedAt &&
      ['ADMIN', 'CAMPUS'].includes(u.role) &&
      /^[^\s@]+@ifpr\.edu\.br$/.test(u.email) &&
      u.loginMethod !== 'google' &&
      u.hash &&
      u.salt,
  ).length;
  for (const version of archives)
    contentChecks.push({
      kind: 'archive',
      calendarId: version.calendarId,
      ordinal: version.ordinal,
      metadataHash: fingerprint(version.metadata),
      snapshotHash: fingerprint(version.snapshot),
    });
  const archiveBatches = batches(archives, (items) => items, 90_000, 15);
  const contentBatches = batches(contentChecks, (items) => items, 90_000, 50);
  const authChecks = (state.users || []).map((user) => {
    const clean = { ...user };
    delete clean.hash;
    delete clean.salt;
    const eligible =
      user.active &&
      !user.removedAt &&
      ['ADMIN', 'CAMPUS'].includes(user.role) &&
      /^[^\s@]+@ifpr\.edu\.br$/.test(user.email) &&
      user.loginMethod !== 'google' &&
      user.hash &&
      user.salt;
    return {
      appId: user.id,
      hash: fingerprint(encodeValue(clean)),
      secretHash: eligible ? fingerprint(`dentec-scrypt-v1$${user.salt}$${user.hash}`) : null,
    };
  });
  const authBatches = batches(authChecks, (items) => items, 90_000, 50);
  return {
    baseBatches,
    archiveBatches,
    contentBatches,
    authBatches,
    files,
    manifest: {
      counts,
      rootNames: fields,
      baseBatches: baseBatches.length,
      archiveBatches: archiveBatches.length,
      contentBatches: contentBatches.length,
      authBatches: authBatches.length,
      contentRecords: contentChecks.length,
      calendarVersions: archives.length,
      reviewVersions: (state.reviews || []).reduce(
        (n, r) => n + (Array.isArray(r.history) ? r.history.length : 0),
        0,
      ),
      expectedAccounts,
      sourceFiles: files.length,
      files: deferFiles ? 0 : files.length,
      deferredFiles: deferFiles ? files.length : 0,
      fileManifest: deferFiles ? [] : files,
      pendingFiles: deferFiles ? files : [],
      sourceProject,
    },
  };
}
