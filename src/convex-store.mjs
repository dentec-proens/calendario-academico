import { isDeepStrictEqual as equal } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { campusNames, initialCatalogue } from './institution.mjs';
import { encodeValue, decodeValue } from './convex-codec.mjs';
import { auditLog } from './audit-log.mjs';

const rootKeys = {
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
};
const arrayFields = new Set([...Object.keys(rootKeys), 'audit']);
const references = Object.fromEntries(
  ['snapshot', 'commit', 'initialize', 'importState'].map((name) => [
    name,
    makeFunctionReference('store:' + name),
  ]),
);

function cleanOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw Error('Opções de consulta inválidas.');
  encodeValue(options);
  return JSON.parse(JSON.stringify(options));
}

function scoped(field, options) {
  return (
    (!options.full &&
      (((options.calendarId || options.campusId) && ['calendars', 'histories'].includes(field)) ||
        (options.calendarId && field === 'reviews'))) ||
    (field === 'users' && (options.userId || options.email)) ||
    (field === 'sessions' && options.sessionHash) ||
    (field === 'audit' && options.appendOnlyAudit)
  );
}

function appendOnly(before, after, message) {
  const previous = Array.isArray(before) ? before : [],
    next = Array.isArray(after) ? after : [];
  if (next.length < previous.length || !equal(previous, next.slice(0, previous.length)))
    throw Error(message);
}

function records(field, value) {
  if (
    !Array.isArray(value) ||
    value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))
  )
    throw Error('Coleção inválida: ' + field);
  return value;
}

function validateScope(field, items, options) {
  if (
    options.calendarId &&
    ((field === 'calendars' && items.some((item) => item.id !== options.calendarId)) ||
      (['histories', 'reviews'].includes(field) &&
        items.some((item) => item.calendarId !== options.calendarId)))
  )
    throw Error('Alteração fora do calendário selecionado.');
  if (
    !options.full &&
    options.campusId &&
    ['calendars', 'histories'].includes(field) &&
    items.some((item) => item.campusId !== options.campusId)
  )
    throw Error('Alteração fora do campus selecionado.');
}

function changesBetween(before, after, keys, options) {
  const changes = [];
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (
      equal(before[field], after[field]) &&
      Object.hasOwn(before, field) === Object.hasOwn(after, field)
    )
      continue;
    if (!Object.hasOwn(after, field)) {
      if (field === 'calendars') throw Error('Os calendários existentes devem ser preservados.');
      if (field === 'audit') throw Error('A auditoria existente não pode ser substituída.');
      if (field === 'reviews')
        throw Error('O histórico de pareceres existente não pode ser substituído.');
      if (scoped(field, options))
        throw Error(
          'A coleção selecionada deve ser preservada. Remova somente os registros selecionados.',
        );
      changes.push({ field, removeRoot: true });
      continue;
    }
    if (!arrayFields.has(field)) {
      changes.push({ field, value: encodeValue(after[field]) });
      continue;
    }
    const previous = Object.hasOwn(before, field) ? records(field, before[field]) : [],
      next = records(field, after[field]),
      identity = rootKeys[field],
      oldKeys = keys[field] || [],
      byId = new Map(
        previous.map((item, index) => [
          identity ? item[identity] : index,
          { item, ...oldKeys[index] },
        ]),
      );
    validateScope(field, next, options);
    if (
      field === 'calendars' &&
      (next.length < previous.length || previous.some((item, index) => next[index]?.id !== item.id))
    )
      throw Error('Os calendários existentes devem ser preservados.');
    if (
      field === 'reviews' &&
      previous.some((item) => !next.some((record) => record.calendarId === item.calendarId))
    )
      throw Error('O histórico de pareceres existente não pode ser substituído.');
    if (field === 'audit')
      appendOnly(previous, next, 'A auditoria existente não pode ser substituída.');
    const retained = new Set(),
      upserts = [];
    for (let index = 0; index < next.length; index++) {
      const item = next[index],
        id = identity ? item[identity] : index;
      if (identity && (id === undefined || id === null))
        throw Error('Identificador ausente: ' + field);
      const old = byId.get(id),
        key =
          old?.key ||
          (identity ? field + '/' + encodeURIComponent(String(id)) : field + '/' + randomUUID()),
        position = scoped(field, options) ? (old?.position ?? null) : index;
      if (retained.has(key)) throw Error('Identificador duplicado: ' + field);
      retained.add(key);
      if (field === 'calendars' && old)
        appendOnly(
          old.item.versions,
          item.versions,
          'O histórico existente não pode ser substituído.',
        );
      if (field === 'reviews' && old)
        appendOnly(
          old.item.history,
          item.history,
          'O histórico de pareceres existente não pode ser substituído.',
        );
      if (!old || !equal(old.item, item) || old.position !== position)
        upserts.push({ key, position, value: encodeValue(item) });
    }
    changes.push({
      field,
      upserts,
      deleteKeys: oldKeys.filter((record) => !retained.has(record.key)).map((record) => record.key),
    });
  }
  return changes;
}

const seedState = () => ({
  users: [],
  campuses: campusNames.map((name, index) => ({ id: `campus-${index + 1}`, name })),
  calendars: [],
  histories: [],
  audit: [],
  catalogue: initialCatalogue(),
});

export async function openConvexStore(
  url,
  { secret, client: providedClient, seed = true, retries = 32 } = {},
) {
  if (!secret || typeof secret !== 'string') throw Error('Configure DENTEC_CONVEX_BRIDGE_SECRET.');
  if (!Number.isInteger(retries) || retries < 0) throw Error('Número de tentativas inválido.');
  const client = providedClient || new ConvexHttpClient(url);
  const snapshot = async (options) => {
    const result = await client.query(references.snapshot, { secret, options });
    const state = decodeValue(result.state);
    if (!state || typeof state !== 'object' || Array.isArray(state))
      throw Error('Estado inválido retornado pelo Convex.');
    return { ...result, state };
  };
  const store = {
    async read(options) {
      return (await snapshot(cleanOptions(options))).state;
    },
    async auditPage(user, offset = 0) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 8_000)
        throw Object.assign(
          Error(
            'O experimento permite consultar logs até o offset 8.000. Exporte a auditoria em lotes.',
          ),
          { status: 400 },
        );
      const result = await client.query(makeFunctionReference('audit:page'), {
        secret,
        role: user.role,
        campusId: user.campusId || null,
        offset,
      });
      return {
        entries: auditLog(decodeValue(result.state), user).entries,
        nextOffset: result.hasMore ? offset + 100 : null,
      };
    },
    exportState: () => store.read({ full: true }),
    async importState(state) {
      if (!state || typeof state !== 'object' || Array.isArray(state))
        throw Error('Documento de importação inválido.');
      await client.mutation(references.importState, { secret, state: encodeValue(state) });
      return store.exportState();
    },
    async change(fn, requested = {}) {
      const options = cleanOptions(requested);
      for (let attempt = 0; attempt <= retries; attempt++) {
        const { state: before, keys, tokens } = await snapshot(options),
          next = structuredClone(before),
          result = await fn(next),
          changes = changesBetween(before, next, keys || {}, options);
        if (!changes.length) return result;
        const committed = await client.mutation(references.commit, {
          secret,
          options,
          tokens,
          changes,
        });
        if (committed.committed) return result;
        if (attempt < retries)
          await new Promise((resolve) => setTimeout(resolve, 2 + Math.floor(Math.random() * 12)));
      }
      throw Object.assign(Error('Os dados foram alterados em outra sessão. Tente novamente.'), {
        code: 'DENTEC_CONFLICT',
        status: 409,
      });
    },
    close: async () => {},
  };
  if (seed)
    await client.mutation(references.initialize, { secret, state: encodeValue(seedState()) });
  return store;
}
