export type LegacyValue =
  null | boolean | number | string | undefined | LegacyValue[] | { [key: string]: LegacyValue };
type LegacyObject = { [key: string]: LegacyValue };
export interface EncodedValue {
  data: LegacyValue;
  undefinedPaths: string[][];
}
const record = (value: object) => value as Record<string, unknown>;
const child = (value: LegacyValue[] | LegacyObject, key: string): LegacyValue =>
  Array.isArray(value) ? value[Number(key)] : value[key];
const invalid = () => Error('Valor de dados inválido: use objetos JSON e números finitos.');

function define(object: object, key: string, value: LegacyValue) {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

const escapedKey = (key: string) =>
  /^[_$~]/.test(key) || key === '' ? '~' + encodeURIComponent(key) : key;

function restoredKey(key: string) {
  let restored = key;
  if (key.startsWith('~')) {
    try {
      restored = decodeURIComponent(key.slice(1));
    } catch {
      throw invalid();
    }
  }
  if (escapedKey(restored) !== key) throw invalid();
  return restored;
}

// Convex values cannot contain undefined. Keep its paths separately so domain
// objects retain the distinction between an absent property and an own property.
export function encodeValue(value: unknown): EncodedValue {
  const undefinedPaths: string[][] = [],
    ancestors = new Set<object>();

  function encode(item: unknown, path: string[]): LegacyValue {
    if (item === undefined) {
      undefinedPaths.push(path);
      return null;
    }
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw invalid();
      return item;
    }
    if (typeof item !== 'object' || ancestors.has(item)) throw invalid();
    const array = Array.isArray(item);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw invalid();
    if (Object.getOwnPropertySymbols(item).length) throw invalid();
    ancestors.add(item);
    let result: LegacyValue[] | LegacyObject;
    if (array) {
      result = Array.from({ length: item.length }, (_, index) =>
        encode(item[index], [...path, String(index)]),
      );
      if (
        Object.keys(item).some(
          (key: string) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length,
        )
      )
        throw invalid();
    } else {
      result = {};
      for (const [key, nested] of Object.entries(item))
        define(result, escapedKey(key), encode(nested, [...path, key]));
    }
    ancestors.delete(item);
    return result;
  }

  return { data: encode(value, []), undefinedPaths };
}

export function decodeValue(value: unknown): LegacyValue {
  if (!value || typeof value !== 'object') throw invalid();
  const encoded = record(value);
  if (
    !encoded ||
    typeof encoded !== 'object' ||
    Array.isArray(encoded) ||
    !Object.hasOwn(encoded, 'data') ||
    !Array.isArray(encoded.undefinedPaths)
  )
    throw invalid();
  // Validation must not encode keys again: the wire representation has already
  // escaped names reserved by Convex, while undefinedPaths uses original names.
  const ancestors = new Set<object>();

  function decode(item: unknown): LegacyValue {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw invalid();
      return item;
    }
    if (!item || typeof item !== 'object' || ancestors.has(item)) throw invalid();
    const array = Array.isArray(item);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw invalid();
    if (Object.getOwnPropertySymbols(item).length) throw invalid();
    ancestors.add(item);
    let result: LegacyValue[] | LegacyObject;
    if (array) {
      result = item.map(decode);
      if (
        Object.keys(item).length !== item.length ||
        Object.keys(item).some(
          (key: string) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length,
        )
      )
        throw invalid();
    } else {
      result = {};
      for (const [key, nested] of Object.entries(item))
        define(result, restoredKey(key), decode(nested));
    }
    ancestors.delete(item);
    return result;
  }

  let result = decode(encoded.data);
  const seen = new Set<string>();
  for (const path of encoded.undefinedPaths) {
    if (!Array.isArray(path) || path.some((key: string) => typeof key !== 'string'))
      throw invalid();
    const serialized = JSON.stringify(path);
    if (seen.has(serialized)) throw invalid();
    seen.add(serialized);
    if (!path.length) {
      if (result !== null || encoded.undefinedPaths.length !== 1) throw invalid();
      result = undefined;
      continue;
    }
    let parent: LegacyValue = result;
    for (const key of path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw invalid();
      parent = child(parent, key);
    }
    const key = path.at(-1)!;
    if (
      !parent ||
      typeof parent !== 'object' ||
      !Object.hasOwn(parent, key) ||
      child(parent, key) !== null ||
      (Array.isArray(parent) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= parent.length))
    )
      throw invalid();
    define(parent, key, undefined);
  }
  return result;
}
