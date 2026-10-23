import { getConvexSize } from 'convex/values';
import type { Value } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { equal as same } from '../src/convex-diff.mjs';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { isEntityTable, identityFields } from './model';
import type {
  EntityTable,
  SnapshotOptions,
  SnapshotChange,
  SnapshotKeys,
  EntityRow,
  EntityUpsert,
} from './model';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';

type Context = QueryCtx | MutationCtx;
type Options = SnapshotOptions;
const MAX_ROWS = 1000;
const MAX_VERSIONS = 5000;
const MAX_DOCUMENT = 800_000;
const MAX_SNAPSHOT_BYTES = 7 * 1024 * 1024;
const own = (object: object, key: string) => Object.hasOwn(object, key);
async function bounded<T>(result: Promise<T[]>, limit = MAX_ROWS) {
  const rows = await result;
  if (rows.length > limit)
    throw new Error('Consulta excede o limite permitido. Reduza o escopo ou exporte em lotes.');
  return rows;
}

function checkSize(value: Value) {
  if (getConvexSize(value) > MAX_DOCUMENT)
    throw new Error(
      'Documento excede o tamanho seguro do Convex. PDFs devem usar o armazenamento de arquivos.',
    );
}

async function root(ctx: Context, name: string) {
  return ctx.db
    .query('rootFields')
    .withIndex('by_name', (q) => q.eq('name', name))
    .unique();
}

async function selectedRows(ctx: Context, table: EntityTable, options: Options) {
  const collection = ctx.db.query(table);
  let rows;
  if (
    !options.full &&
    ['calendars', 'histories', 'reviews'].includes(table) &&
    options.calendarId
  ) {
    rows =
      table === 'calendars'
        ? await bounded(
            collection
              .withIndex('by_appId', (q) => q.eq('appId', options.calendarId))
              .take(MAX_ROWS + 1),
          )
        : await bounded(
            collection
              .withIndex('by_calendarId_and_position', (q) =>
                q.eq('calendarId', options.calendarId),
              )
              .take(MAX_ROWS + 1),
          );
  } else if (!options.full && ['calendars', 'histories'].includes(table) && options.campusId) {
    rows = await bounded(
      collection
        .withIndex('by_campusId_and_position', (q) => q.eq('campusId', options.campusId))
        .take(MAX_ROWS + 1),
    );
  } else if (table === 'users' && (options.userId || options.email)) {
    rows = options.userId
      ? await bounded(
          collection.withIndex('by_appId', (q) => q.eq('appId', options.userId)).take(MAX_ROWS + 1),
        )
      : await bounded(
          ctx.db
            .query('users')
            .withIndex('email', (q) => q.eq('email', options.email))
            .take(MAX_ROWS + 1),
        );
  } else rows = await bounded(collection.withIndex('by_position').take(MAX_ROWS + 1));
  if (!options.full && options.campusId && ['calendars', 'histories'].includes(table))
    rows = rows.filter((row) => row.campusId === options.campusId);
  return rows.sort((a, b) => a.position - b.position);
}

async function hydrate(ctx: Context, table: EntityTable, row: EntityRow, options: Options) {
  const item = decodeValue(row.value);
  if (table === 'calendars' && options.summary) {
    delete item.versions;
    delete item.institutionalSnapshot;
    delete item.documentSnapshot;
    if (item.state && typeof item.state === 'object')
      item.state = Object.fromEntries(
        ['year', 'offer', 'modalities', 'campus']
          .filter((key) => own(item.state || {}, key))
          .map((key) => [key, item.state[key]]),
      );
    return item;
  }
  if (table === 'calendars' && own(item, 'versions')) {
    const versions = await bounded(
      ctx.db
        .query('calendarVersions')
        .withIndex('by_ownerId_and_ordinal', (q) => q.eq('ownerId', row.key))
        .take(MAX_VERSIONS + 1),
      MAX_VERSIONS,
    );
    item.versions = await Promise.all(
      versions.map(async (version) => {
        if (!options.full) return decodeValue(version.metadata);
        const snapshot = await ctx.db.get('calendarSnapshots', version.snapshotId);
        if (!snapshot) throw new Error('Snapshot de calendário ausente.');
        return decodeValue(snapshot.value);
      }),
    );
  }
  if (table === 'reviews' && own(item, 'history')) {
    const versions = await bounded(
      ctx.db
        .query('reviewVersions')
        .withIndex('by_ownerId_and_ordinal', (q) => q.eq('ownerId', row.key))
        .take(MAX_VERSIONS + 1),
      MAX_VERSIONS,
    );
    item.history = versions.map((version) => decodeValue(version.value));
  }
  return item;
}

export async function readSnapshot(ctx: Context, options: Options) {
  const roots = await bounded(ctx.db.query('rootFields').withIndex('by_name').take(129), 128);
  const selected: string[] = options.fields || roots.map((entry) => entry.name);
  const state: Record<string, unknown> = {},
    keys: SnapshotKeys = {};
  for (const field of selected) {
    if (!roots.some((entry) => entry.name === field)) continue;
    let value;
    if (isEntityTable(field)) {
      const rows =
        field === 'audit' && options.appendOnlyAudit ? [] : await selectedRows(ctx, field, options);
      value = await Promise.all(rows.map((row) => hydrate(ctx, field, row, options)));
      keys[field] = rows.map((row) => ({ key: row.key, position: row.position }));
    } else value = decodeValue(roots.find((entry) => entry.name === field)!.value);
    Object.defineProperty(state, field, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const result = { state: encodeValue(state), keys };
  if (getConvexSize(result) > MAX_SNAPSHOT_BYTES)
    throw new Error(
      'O volume desta consulta excede o limite seguro de 7 MiB. Selecione um calendário ou consulte as coleções em páginas menores.',
    );
  return result;
}

function validateScope(
  field: string,
  item: { id?: unknown; calendarId?: unknown; campusId?: unknown },
  options: Options,
) {
  if (options.full) return;
  if (options.calendarId && ['calendars', 'histories', 'reviews'].includes(field)) {
    const id = field === 'calendars' ? item.id : item.calendarId;
    if (id !== options.calendarId) throw new Error('Alteração fora do calendário selecionado.');
  }
  if (
    options.campusId &&
    ['calendars', 'histories'].includes(field) &&
    item.campusId !== options.campusId
  )
    throw new Error('Alteração fora do campus selecionado.');
}

async function upsertEntity(
  ctx: MutationCtx,
  field: EntityTable,
  entry: EntityUpsert,
  options: Options,
) {
  const prior = await ctx.db
    .query(field)
    .withIndex('by_key', (q) => q.eq('key', entry.key))
    .unique();
  const item = decodeValue(entry.value);
  if (!item || typeof item !== 'object' || Array.isArray(item))
    throw new Error('Registro inválido.');
  const identity = identityFields[field];
  if (identity && (typeof item[identity] !== 'string' || !item[identity]))
    throw new Error('Identificador ausente ou inválido: ' + field);
  validateScope(field, item, options);
  const old = prior ? decodeValue(prior.value) : null;
  if (old) {
    validateScope(field, old, options);
  }
  let position = entry.position;
  if (position === null) {
    const last = await ctx.db.query(field).withIndex('by_position').order('desc').first();
    position = (last?.position ?? -1) + 1;
  }
  if (prior && field === 'audit' && (!same(old, item) || prior.position !== position))
    throw new Error('A auditoria existente não pode ser substituída.');
  if (prior && field === 'calendars' && prior.position !== position)
    throw new Error('Os calendários existentes devem ser preservados.');
  const calendarId = field === 'calendars' ? item.id : item.calendarId;
  const year = item.state?.year ?? item.year;
  const row: Omit<Doc<'calendars'>, '_id' | '_creationTime'> = {
    key: entry.key,
    position,
    value: entry.value,
    ...(typeof item.id === 'string' ? { appId: item.id } : {}),
    ...(typeof item.campusId === 'string' ? { campusId: item.campusId } : {}),
    ...(typeof calendarId === 'string' ? { calendarId } : {}),
    ...(typeof item.email === 'string' ? { email: item.email } : {}),
    ...(typeof year === 'number' ? { year } : {}),
  };
  if (field === 'audit') {
    // Audit targets may be a calendar or a historical PDF. Persist the scope
    // once so campus log pages use an index instead of scanning every entry.
    let calendar = item.id
      ? await ctx.db
          .query('calendars')
          .withIndex('by_appId', (q) => q.eq('appId', item.id))
          .first()
      : null;
    if (!calendar && item.id) {
      const history = await ctx.db
        .query('histories')
        .withIndex('by_appId', (q) => q.eq('appId', item.id))
        .first();
      if (history?.calendarId)
        calendar = await ctx.db
          .query('calendars')
          .withIndex('by_appId', (q) => q.eq('appId', history.calendarId))
          .first();
    }
    delete row.campusId;
    delete row.calendarId;
    if (calendar) {
      row.calendarId = calendar.appId;
      row.campusId = calendar.campusId;
    }
  }
  if (field === 'calendars' && (own(item, 'versions') || prior?.versionCount !== undefined)) {
    if (Array.isArray(item.versions) && item.versions.length > MAX_VERSIONS)
      throw new Error('Limite de versões permitido excedido. Nenhuma alteração foi salva.');
    if (!Array.isArray(item.versions) || item.versions.length < (prior?.versionCount || 0))
      throw new Error('O histórico existente não pode ser substituído.');
    const count = prior?.versionCount || 0;
    const metadata = await bounded(
      ctx.db
        .query('calendarVersions')
        .withIndex('by_ownerId_and_ordinal', (q) => q.eq('ownerId', entry.key))
        .take(MAX_VERSIONS + 1),
      MAX_VERSIONS,
    );
    for (let i = 0; i < count; i++) {
      const supplied = item.versions[i],
        saved = metadata[i];
      if (!saved) throw new Error('Snapshot de calendário ausente.');
      if (!same(supplied, decodeValue(saved.metadata))) {
        const snapshot = await ctx.db.get('calendarSnapshots', saved.snapshotId);
        if (!snapshot || !same(supplied, decodeValue(snapshot.value)))
          throw new Error('O histórico existente não pode ser substituído.');
      }
    }
    for (let i = count; i < item.versions.length; i++) {
      const value = encodeValue(item.versions[i]);
      checkSize(value);
      const snapshotId = await ctx.db.insert('calendarSnapshots', { value });
      const meta = Object.fromEntries(
        ['version', 'at', 'catalogueRevision']
          .filter((key) => own(item.versions[i], key))
          .map((key) => [key, item.versions[i][key]]),
      );
      await ctx.db.insert('calendarVersions', {
        ownerId: entry.key,
        ordinal: i,
        metadata: encodeValue(meta),
        snapshotId,
      });
    }
    row.versionCount = item.versions.length;
    item.versions = [];
  }
  if (field === 'reviews' && (own(item, 'history') || prior?.historyCount !== undefined)) {
    if (Array.isArray(item.history) && item.history.length > MAX_VERSIONS)
      throw new Error('Limite de revisões permitido excedido. Nenhuma alteração foi salva.');
    if (!Array.isArray(item.history) || item.history.length < (prior?.historyCount || 0))
      throw new Error('O histórico de pareceres existente não pode ser substituído.');
    const count = prior?.historyCount || 0;
    const history = await bounded(
      ctx.db
        .query('reviewVersions')
        .withIndex('by_ownerId_and_ordinal', (q) => q.eq('ownerId', entry.key))
        .take(MAX_VERSIONS + 1),
      MAX_VERSIONS,
    );
    for (let i = 0; i < count; i++)
      if (!same(item.history[i], decodeValue(history[i].value)))
        throw new Error('O histórico de pareceres existente não pode ser substituído.');
    for (let i = count; i < item.history.length; i++) {
      const value = encodeValue(item.history[i]);
      checkSize(value);
      await ctx.db.insert('reviewVersions', { ownerId: entry.key, ordinal: i, value });
    }
    row.historyCount = item.history.length;
    item.history = [];
  }
  row.value = encodeValue(item);
  checkSize(row);
  if (prior) await ctx.db.replace(prior._id, row);
  else await ctx.db.insert(field, row);
  return !prior;
}

export async function applyChanges(ctx: MutationCtx, changes: SnapshotChange[], options: Options) {
  // Targets created in this transaction must exist before audit scope is
  // indexed. Root-field ordering is otherwise unrelated to domain ordering.
  const ordered = [...changes].sort(
    (a, b) => Number(a.field === 'audit') - Number(b.field === 'audit'),
  );
  for (const change of ordered) {
    const { field } = change,
      priorRoot = await root(ctx, field);
    if (options.fields && !options.fields.includes(field))
      throw new Error('Alteração fora da coleção selecionada.');
    if (change.removeRoot) {
      if (['calendars', 'audit', 'reviews'].includes(field))
        throw new Error('O histórico existente deve ser preservado.');
      if (isEntityTable(field)) {
        const rows = await selectedRows(ctx, field, {});
        for (const row of rows) {
          validateScope(field, decodeValue(row.value), options);
          await ctx.db.delete(row._id);
        }
      }
      if (priorRoot) await ctx.db.delete(priorRoot._id);
      continue;
    }
    if (!priorRoot) {
      const rootCount = await ctx.db.query('rootFields').take(128);
      if (rootCount.length >= 128) throw new Error('Limite de coleções permitido excedido.');
      await ctx.db.insert('rootFields', {
        name: field,
        ...(change.value ? { value: change.value } : {}),
      });
    }
    if (!isEntityTable(field)) {
      if (!change.value) throw new Error('Valor de coleção ausente.');
      checkSize(change.value);
      if (priorRoot) await ctx.db.patch(priorRoot._id, { value: change.value });
      continue;
    }
    let count = priorRoot?.count;
    if (count === undefined)
      count = (
        await bounded(
          ctx.db
            .query(field)
            .withIndex('by_position')
            .take(MAX_ROWS + 1),
        )
      ).length;
    for (const key of change.deleteKeys || []) {
      if (['calendars', 'audit', 'reviews'].includes(field))
        throw new Error('O histórico existente deve ser preservado.');
      const row = await ctx.db
        .query(field)
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique();
      if (!row) continue;
      const value = decodeValue(row.value);
      validateScope(field, value, options);
      await ctx.db.delete(row._id);
      count--;
    }
    for (const entry of change.upserts || []) {
      if (await upsertEntity(ctx, field, entry, options)) count++;
      if (field !== 'audit' && count > MAX_ROWS)
        throw new Error('Limite de registros permitido excedido. Nenhuma alteração foi salva.');
    }
    const storedRoot = await root(ctx, field);
    if (storedRoot && storedRoot.count !== count) await ctx.db.patch(storedRoot._id, { count });
  }
}
