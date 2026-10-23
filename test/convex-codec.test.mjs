import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';

test('the Convex codec preserves undefined own properties through a JSON wire round trip', () => {
  const original = {
    ordinary: 'readable',
    absentValue: undefined,
    nested: [{ name: undefined }, undefined, null],
    _internal: { $schema: 'value', '~key': undefined, '': 1 },
  };
  const encoded = encodeValue(original);
  assert.equal(encoded.data.ordinary, 'readable');
  assert.equal(Object.hasOwn(encoded.data, '_internal'), false);
  assert.deepEqual(encoded.undefinedPaths, [
    ['absentValue'],
    ['nested', '0', 'name'],
    ['nested', '1'],
    ['_internal', '~key'],
  ]);
  const restored = decodeValue(JSON.parse(JSON.stringify(encoded)));
  assert.deepEqual(restored, original);
  assert.equal(Object.hasOwn(restored, 'absentValue'), true);
  assert.equal(Object.hasOwn(restored.nested, '1'), true);
  assert.equal(Object.hasOwn(restored, 'missing'), false);
  assert.equal(decodeValue(encodeValue(undefined)), undefined);
});

test('the codec preserves arbitrary reserved names without prototype mutations', () => {
  const original = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":"own","$":"dollar","~":"tilde","":"empty","%":"percent"}',
  );
  const restored = decodeValue(JSON.parse(JSON.stringify(encodeValue(original))));
  assert.deepEqual(restored, original);
  assert.equal(Object.getPrototypeOf(restored), Object.prototype);
  assert.equal(Object.hasOwn(restored, '__proto__'), true);
  assert.equal({}.polluted, undefined);
});

test('the codec rejects values that cannot be faithfully stored as finite JSON', () => {
  const circular = {};
  circular.self = circular;
  for (const value of [
    NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol('x'),
    () => {},
    new Date(),
    new Map(),
    circular,
  ])
    assert.throws(() => encodeValue({ nested: value }), /Valor de dados inválido/);
  const extraProperty = [];
  extraProperty.extra = true;
  assert.throws(() => encodeValue(extraProperty), /Valor de dados inválido/);
  assert.deepEqual(decodeValue(encodeValue({ first: { value: 1 }, second: { value: 1 } })), {
    first: { value: 1 },
    second: { value: 1 },
  });
});

test('decode validates placeholders and paths instead of inventing properties', () => {
  for (const encoded of [
    {},
    { data: undefined, undefinedPaths: [] },
    { data: NaN, undefinedPaths: [] },
    { data: { present: 1 }, undefinedPaths: [['present']] },
    { data: {}, undefinedPaths: [['missing']] },
    { data: {}, undefinedPaths: [['__proto__', 'polluted']] },
    { data: { _unescaped: null }, undefinedPaths: [] },
    { data: { '~ordinary': null }, undefinedPaths: [] },
    { data: { '~%': null }, undefinedPaths: [] },
    { data: { item: null }, undefinedPaths: [['item'], ['item']] },
    { data: null, undefinedPaths: [[], []] },
  ])
    assert.throws(() => decodeValue(encoded), /Valor de dados inválido/);
  assert.equal({}.polluted, undefined);
});
