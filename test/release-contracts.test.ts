import { test, expect } from 'vitest';
import {
  assertExpansion,
  assertRemoteFunctions,
  fingerprint,
} from '../scripts/release-contracts.ts';
import type { Contracts } from '../scripts/release-contracts.ts';
import type { ReleasePlan } from '../convex/releases/plan.ts';
const object = (value: Record<string, unknown>) => ({ type: 'object', value });
const field = (optional = false) => ({ fieldType: { type: 'string' }, optional });
const plan: ReleasePlan = {
  version: 1,
  baseline: 'a'.repeat(40),
  strategy: 'expand',
  guarantees: { oldClients: true, oldWriters: true, scheduledFunctions: true, sessions: true },
  rationale: 'Expansão aditiva que mantém clientes antigos, dados existentes e sessões válidas.',
  tests: ['test/release-contracts.test.ts'],
  migrations: [],
};
const contracts: Contracts = {
  schema: {
    schemaValidation: true,
    tables: [
      {
        tableName: 'campuses',
        documentType: object({ name: field() }),
        indexes: [],
        searchIndexes: [],
        vectorIndexes: [],
      },
    ],
  },
  functions: {
    'calendar.js:save': {
      kind: 'mutation',
      visibility: 'public',
      args: object({ name: field() }),
      returns: { type: 'string' },
    },
    'files.js:expire': {
      kind: 'mutation',
      visibility: 'internal',
      args: object({ id: field() }),
      returns: null,
    },
  },
};
test('expansions retain old inputs and permit optional fields, unions, tables and new endpoints', () => {
  const after = structuredClone(contracts);
  (after.schema.tables[0]!.documentType.value as Record<string, unknown>).releaseLabel =
    field(true);
  after.functions['calendar.js:save']!.args = object({
    name: {
      fieldType: { type: 'union', value: [{ type: 'string' }, { type: 'number' }] },
      optional: true,
    },
    extra: field(true),
  });
  assertExpansion(contracts, after, {
    ...plan,
    migrations: [
      {
        id: 'fill-label',
        table: 'campuses',
        field: 'releaseLabel',
        source: { kind: 'copy', field: 'name' },
      },
    ],
  });
});
test.each([
  'remove-table',
  'required-field',
  'required-prototype-field',
  'remove-index',
  'remove-public',
  'remove-internal',
  'return-change',
  'visibility-change',
  'narrow-args',
  'schema-off',
])('rejects incompatible %s', (kind) => {
  const before = structuredClone(contracts),
    after = structuredClone(contracts);
  if (kind === 'remove-table') after.schema.tables = [];
  if (kind === 'required-field')
    (after.schema.tables[0]!.documentType.value as Record<string, unknown>).newField = field();
  if (kind === 'required-prototype-field')
    Object.defineProperty(after.schema.tables[0]!.documentType.value, 'constructor', {
      value: field(),
      enumerable: true,
    });
  if (kind === 'remove-index')
    before.schema.tables[0]!.indexes = [{ indexDescriptor: 'by_name', fields: ['name'] }];
  if (kind === 'remove-public') delete after.functions['calendar.js:save'];
  if (kind === 'remove-internal') delete after.functions['files.js:expire'];
  if (kind === 'return-change') after.functions['calendar.js:save']!.returns = { type: 'number' };
  if (kind === 'visibility-change') after.functions['calendar.js:save']!.visibility = 'internal';
  if (kind === 'narrow-args')
    after.functions['calendar.js:save']!.args = object({
      name: { fieldType: { type: 'number' }, optional: false },
    });
  if (kind === 'schema-off') after.schema.schemaValidation = false;
  expect(() => assertExpansion(before, after, plan)).toThrow(/incompatível/);
});
test('auth schema is frozen and a migration can only fill a newly added optional field', () => {
  const before = structuredClone(contracts),
    after = structuredClone(contracts);
  before.schema.tables[0]!.tableName = 'authSessions';
  after.schema.tables[0]!.tableName = 'authSessions';
  (after.schema.tables[0]!.documentType.value as Record<string, unknown>).extra = field(true);
  expect(() => assertExpansion(before, after, plan)).toThrow(/autenticação/);
  expect(() =>
    assertExpansion(contracts, contracts, {
      ...plan,
      migrations: [
        {
          id: 'overwrite-name',
          table: 'campuses',
          field: 'name',
          source: { kind: 'literal', value: 'Changed' },
        },
      ],
    }),
  ).toThrow(/novo e opcional/);
});
test('remote metadata drift and changes to scheduled callbacks are detected', () => {
  const functions = Object.entries(contracts.functions).map(([identifier, value]) => ({
    identifier,
    functionType: 'Mutation',
    visibility: { kind: value.visibility },
    args: value.args,
    returns: value.returns,
  }));
  assertRemoteFunctions({ url: 'https://expected', functions }, contracts, 'https://expected');
  expect(() =>
    assertRemoteFunctions({ url: 'https://other', functions }, contracts, 'https://expected'),
  ).toThrow();
  expect(() =>
    assertRemoteFunctions(
      { url: 'https://expected', functions: functions.slice(1) },
      contracts,
      'https://expected',
    ),
  ).toThrow();
});
test('fingerprints do not depend on object insertion order', () =>
  expect(fingerprint({ b: 1, a: 2 })).toBe(fingerprint({ a: 2, b: 1 })));
