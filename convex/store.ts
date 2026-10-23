import { v, getConvexSize } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { requireBridge } from './bridge';
import { encodedValue } from './schema';
import { isEntityTable, identityFields, scopeKey, affectedScopes } from './model';
import type { EntityTable } from './model';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';

type Context = QueryCtx | MutationCtx;
type Options = Record<string, any>;
const MAX_ROWS = 1000;
const MAX_VERSIONS = 5000;
const MAX_DOCUMENT = 800_000;
const own = (object: any, key: string) => Object.hasOwn(object, key);
function same(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => own(b, key) && same(a[key], b[key]))
  );
}
const tokenValidator = v.object({ key: v.string(), revision: v.number() });
const optionsValidator = v.object({
  fields: v.optional(v.array(v.string())),
  calendarId: v.optional(v.string()),
  campusId: v.optional(v.string()),
  userId: v.optional(v.string()),
  email: v.optional(v.string()),
  sessionHash: v.optional(v.string()),
  full: v.optional(v.boolean()),
  summary: v.optional(v.boolean()),
  appendOnlyAudit: v.optional(v.boolean()),
});
const changeValidator = v.object({
  field: v.string(),
  removeRoot: v.optional(v.boolean()),
  value: v.optional(encodedValue),
  upserts: v.optional(
    v.array(
      v.object({ key: v.string(), position: v.union(v.number(), v.null()), value: encodedValue }),
    ),
  ),
  deleteKeys: v.optional(v.array(v.string())),
});

async function bounded(result: Promise<any[]>, limit = MAX_ROWS) {
  const rows = await result;
  if (rows.length > limit)
    throw new Error(
      'Consulta excede o limite do experimento. Reduza o escopo ou exporte em lotes.',
    );
  return rows;
}

function checkSize(value: any) {
  if (getConvexSize(value) > MAX_DOCUMENT)
    throw new Error(
      'Documento excede o tamanho seguro do experimento Convex. PDFs devem usar o armazenamento de arquivos.',
    );
}

async function root(ctx: Context, name: string) {
  return ctx.db
    .query('rootFields')
    .withIndex('by_name', (q: any) => q.eq('name', name))
    .unique();
}

async function revision(ctx: Context, key: string) {
  return (
    (
      await ctx.db
        .query('scopeVersions')
        .withIndex('by_key', (q: any) => q.eq('key', key))
        .unique()
    )?.revision || 0
  );
}

async function bump(ctx: MutationCtx, key: string) {
  const prior = await ctx.db
    .query('scopeVersions')
    .withIndex('by_key', (q: any) => q.eq('key', key))
    .unique();
  if (prior) await ctx.db.patch(prior._id, { revision: prior.revision + 1 });
  else await ctx.db.insert('scopeVersions', { key, revision: 1 });
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
              .withIndex('by_appId', (q: any) => q.eq('appId', options.calendarId))
              .take(MAX_ROWS + 1),
          )
        : await bounded(
            collection
              .withIndex('by_calendarId_and_position', (q: any) =>
                q.eq('calendarId', options.calendarId),
              )
              .take(MAX_ROWS + 1),
          );
  } else if (!options.full && ['calendars', 'histories'].includes(table) && options.campusId) {
    rows = await bounded(
      collection
        .withIndex('by_campusId_and_position', (q: any) => q.eq('campusId', options.campusId))
        .take(MAX_ROWS + 1),
    );
  } else if (table === 'sessions' && options.sessionHash) {
    rows = await bounded(
      collection
        .withIndex('by_appId', (q: any) => q.eq('appId', options.sessionHash))
        .take(MAX_ROWS + 1),
    );
  } else if (table === 'users' && (options.userId || options.email)) {
    rows = options.userId
      ? await bounded(
          collection
            .withIndex('by_appId', (q: any) => q.eq('appId', options.userId))
            .take(MAX_ROWS + 1),
        )
      : await bounded(
          collection
            .withIndex('by_email', (q: any) => q.eq('email', options.email))
            .take(MAX_ROWS + 1),
        );
  } else rows = await bounded(collection.withIndex('by_position').take(MAX_ROWS + 1));
  if (!options.full && options.campusId && ['calendars', 'histories'].includes(table))
    rows = rows.filter((row: any) => row.campusId === options.campusId);
  return rows.sort((a: any, b: any) => a.position - b.position);
}

async function hydrate(ctx: Context, table: EntityTable, row: any, options: Options) {
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
        .withIndex('by_ownerId_and_ordinal', (q: any) => q.eq('ownerId', row.key))
        .take(MAX_VERSIONS + 1),
      MAX_VERSIONS,
    );
    item.versions = await Promise.all(
      versions.map(async (version: any) => {
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
        .withIndex('by_ownerId_and_ordinal', (q: any) => q.eq('ownerId', row.key))
        .take(MAX_VERSIONS + 1),
      MAX_VERSIONS,
    );
    item.history = versions.map((version: any) => decodeValue(version.value));
  }
  return item;
}

export const snapshot = query({
  args: { secret: v.string(), options: optionsValidator },
  returns: v.object({ state: encodedValue, keys: v.any(), tokens: v.array(tokenValidator) }),
  handler: async (ctx, { secret, options }) => {
    requireBridge(secret);
    const roots = await bounded(ctx.db.query('rootFields').withIndex('by_name').take(129), 128);
    const selected: string[] = options.fields || roots.map((entry: any) => entry.name);
    const state: Record<string, any> = {},
      keys: Record<string, any> = {},
      tokens = [];
    if (!options.fields)
      tokens.push({ key: 'roots:index', revision: await revision(ctx, 'roots:index') });
    for (const field of selected) {
      const presence = `${field}:presence`;
      tokens.push({ key: presence, revision: await revision(ctx, presence) });
      if (!roots.some((entry: any) => entry.name === field)) continue;
      if (!(field === 'audit' && options.appendOnlyAudit)) {
        const key = scopeKey(field, options);
        tokens.push({ key, revision: await revision(ctx, key) });
      }
      let value;
      if (isEntityTable(field)) {
        const rows =
          field === 'audit' && options.appendOnlyAudit
            ? []
            : await selectedRows(ctx, field, options);
        value = await Promise.all(rows.map((row: any) => hydrate(ctx, field, row, options)));
        keys[field] = rows.map((row: any) => ({ key: row.key, position: row.position }));
      } else value = decodeValue(roots.find((entry: any) => entry.name === field)!.value);
      Object.defineProperty(state, field, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    const result = { state: encodeValue(state), keys, tokens };
    if (getConvexSize(result) > 12_000_000)
      throw new Error('Leitura muito grande; selecione um calendário ou coleção.');
    return result;
  },
});

function validateScope(field: string, item: any, options: Options) {
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
  entry: any,
  options: Options,
  scopes: Set<string>,
) {
  const prior = await ctx.db
    .query(field)
    .withIndex('by_key', (q: any) => q.eq('key', entry.key))
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
    affectedScopes(field, old).forEach((key) => scopes.add(key));
  }
  affectedScopes(field, item).forEach((key) => scopes.add(key));
  let position = entry.position;
  if (position === null) {
    const last = await ctx.db.query(field).withIndex('by_position').order('desc').first();
    position = (last?.position ?? -1) + 1;
  }
  if (prior && field === 'audit' && (!same(old, item) || prior.position !== position))
    throw new Error('A auditoria existente não pode ser substituída.');
  if (prior && field === 'calendars' && prior.position !== position)
    throw new Error('Os calendários existentes devem ser preservados.');
  const row: any = { key: entry.key, position };
  for (const [column, value] of Object.entries({
    appId: item.id,
    campusId: item.campusId,
    calendarId: field === 'calendars' ? item.id : item.calendarId,
    email: item.email,
    year: item.state?.year ?? item.year,
  }))
    if (typeof value === (column === 'year' ? 'number' : 'string')) row[column] = value;
  if (field === 'audit') {
    // Audit targets may be a calendar or a historical PDF. Persist the scope
    // once so campus log pages use an index instead of scanning every entry.
    let calendar = item.id
      ? await ctx.db
          .query('calendars')
          .withIndex('by_appId', (q: any) => q.eq('appId', item.id))
          .first()
      : null;
    if (!calendar && item.id) {
      const history = await ctx.db
        .query('histories')
        .withIndex('by_appId', (q: any) => q.eq('appId', item.id))
        .first();
      if (history?.calendarId)
        calendar = await ctx.db
          .query('calendars')
          .withIndex('by_appId', (q: any) => q.eq('appId', history.calendarId))
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
      throw new Error('Limite de versões do experimento excedido. Nenhuma alteração foi salva.');
    if (!Array.isArray(item.versions) || item.versions.length < (prior?.versionCount || 0))
      throw new Error('O histórico existente não pode ser substituído.');
    const count = prior?.versionCount || 0;
    const metadata = await bounded(
      ctx.db
        .query('calendarVersions')
        .withIndex('by_ownerId_and_ordinal', (q: any) => q.eq('ownerId', entry.key))
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
      throw new Error('Limite de revisões do experimento excedido. Nenhuma alteração foi salva.');
    if (!Array.isArray(item.history) || item.history.length < (prior?.historyCount || 0))
      throw new Error('O histórico de pareceres existente não pode ser substituído.');
    const count = prior?.historyCount || 0;
    const history = await bounded(
      ctx.db
        .query('reviewVersions')
        .withIndex('by_ownerId_and_ordinal', (q: any) => q.eq('ownerId', entry.key))
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

async function applyChanges(ctx: MutationCtx, changes: any[], options: Options) {
  const scopes = new Set<string>();
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
          affectedScopes(field, decodeValue(row.value)).forEach((key) => scopes.add(key));
          await ctx.db.delete(row._id);
        }
      }
      if (priorRoot) await ctx.db.delete(priorRoot._id);
      scopes.add('roots:index');
      scopes.add(`${field}:presence`);
      scopes.add(`${field}:all`);
      continue;
    }
    if (!priorRoot) {
      const rootCount = await ctx.db.query('rootFields').take(128);
      if (rootCount.length >= 128) throw new Error('Limite de coleções do experimento excedido.');
      await ctx.db.insert('rootFields', {
        name: field,
        ...(change.value ? { value: change.value } : {}),
      });
      scopes.add('roots:index');
      scopes.add(`${field}:presence`);
    }
    if (!isEntityTable(field)) {
      if (!change.value) throw new Error('Valor de coleção ausente.');
      checkSize(change.value);
      if (priorRoot) await ctx.db.patch(priorRoot._id, { value: change.value });
      scopes.add(`${field}:all`);
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
        .withIndex('by_key', (q: any) => q.eq('key', key))
        .unique();
      if (!row) continue;
      const value = decodeValue(row.value);
      validateScope(field, value, options);
      affectedScopes(field, value).forEach((scope) => scopes.add(scope));
      await ctx.db.delete(row._id);
      count--;
    }
    for (const entry of change.upserts || []) {
      if (await upsertEntity(ctx, field, entry, options, scopes)) count++;
      if (field !== 'audit' && count > MAX_ROWS)
        throw new Error(
          'Limite de registros do experimento excedido. Nenhuma alteração foi salva.',
        );
    }
    const storedRoot = await root(ctx, field);
    if (storedRoot && storedRoot.count !== count) await ctx.db.patch(storedRoot._id, { count });
  }
  for (const key of scopes) await bump(ctx, key);
}

export const commit = mutation({
  args: {
    secret: v.string(),
    tokens: v.array(tokenValidator),
    options: optionsValidator,
    changes: v.array(changeValidator),
  },
  returns: v.object({ committed: v.boolean() }),
  handler: async (ctx, { secret, tokens, options, changes }) => {
    requireBridge(secret);
    for (const token of tokens)
      if ((await revision(ctx, token.key)) !== token.revision) return { committed: false };
    await applyChanges(ctx, changes, options);
    return { committed: true };
  },
});

async function importEmpty(ctx: MutationCtx, encoded: any, seed: boolean) {
  const present = await ctx.db.query('rootFields').first();
  if (present) {
    if (seed) return;
    throw new Error('A importação exige um banco vazio para preservar os dados existentes.');
  }
  const state = decodeValue(encoded);
  if (!state || typeof state !== 'object' || Array.isArray(state))
    throw new Error('Documento de importação inválido.');
  if (Object.keys(state).length > 128)
    throw new Error('Limite de coleções do experimento excedido.');
  const changes = Object.entries(state).map(([field, value]) => {
    if (!isEntityTable(field)) return { field, value: encodeValue(value) };
    if (!Array.isArray(value)) throw new Error('Coleção inválida: ' + field);
    if (value.length > MAX_ROWS)
      throw new Error('A importação exige lotes de até 1000 registros por coleção.');
    const identities = new Set();
    const identity = identityFields[field];
    return {
      field,
      upserts: value.map((item: any, position: number) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          throw new Error('Registro inválido: ' + field);
        const id = identity && item[identity];
        if (identity && (typeof id !== 'string' || !id))
          throw new Error('Identificador ausente ou inválido: ' + field);
        if (id !== undefined && identities.has(id))
          throw new Error('Identificador duplicado na importação: ' + field);
        if (id !== undefined) identities.add(id);
        return { key: `${field}:${id ?? position}`, position, value: encodeValue(item) };
      }),
    };
  });
  await applyChanges(ctx, changes, { full: true });
}

export const initialize = mutation({
  args: { secret: v.string(), state: encodedValue },
  returns: v.null(),
  handler: async (ctx, { secret, state }) => {
    requireBridge(secret);
    await importEmpty(ctx, state, true);
    return null;
  },
});

export const importState = mutation({
  args: { secret: v.string(), state: encodedValue },
  returns: v.null(),
  handler: async (ctx, { secret, state }) => {
    requireBridge(secret);
    await importEmpty(ctx, state, false);
    return null;
  },
});
