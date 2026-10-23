import { encodeValue } from './convex-codec.mjs';

export function equal(a, b) {
  if (Object.is(a, b)) return true;
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]))
  );
}

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

export function changesBetween(
  before,
  after,
  keys,
  options,
  newKey = () => String(crypto.randomUUID()),
) {
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
          (identity ? field + '/' + encodeURIComponent(String(id)) : field + '/' + newKey()),
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
