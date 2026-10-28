import { expect, test } from 'vitest';
import schema from '../convex/schema.ts';
import * as calendars from '../convex/calendars.ts';
import * as contract from '../convex/releases/contract.ts';
import type { Contracts } from '../scripts/release-contracts.ts';
import { assertManualSourceContraction } from '../scripts/release-manual-source-policy.ts';
type Obj = Record<string, unknown>;
const objectAt = (root: unknown, path: string[]): Obj =>
  path.reduce<unknown>((value, key) => (value as Obj)[key], root) as Obj;
const str = (optional: boolean) => ({ fieldType: { type: 'string' }, optional });
const paths: [string, string[], boolean][] = [
  ...['calendar', 'calendarVersion', 'createCalendar', 'saveCalendar', 'synchronizeBase'].map(
    (name): [string, string[], boolean] => [
      `calendars.js:${name}`,
      ['returns', 'value', 'state', 'fieldType'],
      true,
    ],
  ),
  [
    'calendars.js:pdfContext',
    ['returns', 'value', 'record', 'fieldType', 'value', 'state', 'fieldType'],
    false,
  ],
  [
    'calendars.js:saveCalendar',
    ['args', 'value', 'body', 'fieldType', 'value', 'state', 'fieldType'],
    false,
  ],
];
function fixture() {
  const functions: Contracts['functions'] = {};
  for (const [prefix, module] of [
    ['calendars', calendars],
    ['releases/contract', contract],
  ] as const)
    for (const [name, value] of Object.entries(module)) {
      if (typeof value !== 'function' || !('exportArgs' in value)) continue;
      const fn = value as unknown as {
        exportArgs(): string;
        exportReturns(): string;
        isQuery?: boolean;
      };
      functions[`${prefix}.js:${name}`] = {
        kind: fn.isQuery ? 'query' : 'mutation',
        visibility: prefix === 'releases/contract' || name === 'pdfContext' ? 'internal' : 'public',
        args: JSON.parse(fn.exportArgs()),
        returns: JSON.parse(fn.exportReturns()),
      };
    }
  const after: Contracts = {
    schema: JSON.parse((schema as unknown as { export(): string }).export()),
    functions,
  };
  const before = structuredClone(after);
  for (const name of Object.keys(before.functions))
    if (name.startsWith('releases/contract.')) delete before.functions[name];
  const add = (state: Obj, legacy: boolean) => {
    objectAt(state, ['value']).weekEvidence = str(!legacy);
    objectAt(state, ['value', 'scopeConfirmation', 'fieldType', 'value']).source = str(!legacy);
    objectAt(state, ['value', 'teacherVacations', 'fieldType', 'value']).evidence = str(!legacy);
    const event = objectAt(state, ['value', 'events', 'fieldType', 'value', 'value']);
    event.evidence = str(!legacy);
    objectAt(event, ['deadlineAdjustment', 'fieldType', 'value']).evidence = str(!legacy);
    objectAt(state, [
      'value',
      'intakeByModality',
      'fieldType',
      'values',
      'fieldType',
      'values',
      'fieldType',
      'value',
    ]).source = str(true);
    if (legacy)
      event.recordType = {
        optional: true,
        fieldType: {
          type: 'union',
          value: ['event', 'prior-reference'].map((value) => ({ type: 'literal', value })),
        },
      };
  };
  for (const [name, path, legacy] of paths) add(objectAt(before.functions[name], path), legacy);
  for (const name of ['calendarContents', 'calendarSnapshots'])
    add(
      objectAt(before.schema.tables.find((table) => table.tableName === name)!.documentType, [
        'value',
        'state',
        'fieldType',
      ]),
      false,
    );
  return { before, after };
}
test('only the six manual fields and declared receipt endpoints may change', () => {
  const { before, after } = fixture();
  expect(() => assertManualSourceContraction(before, after)).not.toThrow();
  const extra = structuredClone(after);
  extra.functions['calendars.js:calendar'].kind = 'mutation';
  expect(() => assertManualSourceContraction(before, extra)).toThrow('fora dos seis');
});
test('institutional evidence, authentication schema and indexes remain outside the exception', () => {
  const { before, after } = fixture();
  const institutional = structuredClone(after);
  const content = institutional.schema.tables.find(
    (table) => table.tableName === 'calendarContents',
  )!;
  delete objectAt(content.documentType, [
    'value',
    'institutionalSnapshot',
    'fieldType',
    'value',
    'value',
  ]).evidence;
  expect(() => assertManualSourceContraction(before, institutional)).toThrow('fora dos seis');
  const auth = structuredClone(after);
  auth.schema.tables.find((table) => table.tableName === 'users')!.indexes = [];
  expect(() => assertManualSourceContraction(before, auth)).toThrow('fora dos seis');
});
test('administrative endpoints cannot be broadened by the contract mode', () => {
  const { before, after } = fixture();
  after.functions['releases/contract.js:state'].visibility = 'public';
  expect(() => assertManualSourceContraction(before, after)).toThrow(
    'Endpoint contract inesperado',
  );
});
