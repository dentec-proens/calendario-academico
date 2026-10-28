import { canonical } from './release-contracts.ts';
import type { Contracts } from './release-contracts.ts';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function at(root: unknown, path: readonly string[]): ObjectValue {
  let value = root;
  for (const key of path) {
    if (!object(value) || !Object.hasOwn(value, key))
      throw Error('O baseline não corresponde ao contrato de fontes manuais.');
    value = value[key];
  }
  if (!object(value)) throw Error('Validator inesperado na contração.');
  return value;
}
const stringField = { optional: false, fieldType: { type: 'string' } };
const field = (fieldType: unknown, optional = false) => ({ optional, fieldType });
const endpoint = (
  kind: 'query' | 'mutation',
  args: unknown,
  returns: NonNullable<Contracts['functions'][string]['returns']>,
) => ({
  kind,
  visibility: 'internal',
  args: { type: 'object', value: args },
  returns,
});
const nullReturn = { type: 'null' };
const receiptFields = Object.fromEntries(
  [
    'commit',
    'owner',
    'candidateId',
    'functionSpecHash',
    'planDigest',
    'sourceDigest',
    'schemaDigest',
    'rehearsalDigest',
    'verificationDigest',
    'previousBackend',
    'previousFrontend',
  ].map((name) => [name, stringField]),
);
export const expectedContractFunctions: Contracts['functions'] = {
  'releases/contract.js:published': endpoint(
    'mutation',
    {
      ...receiptFields,
      mode: field({ type: 'literal', value: 'contract' }),
      key: field({ type: 'literal', value: 'backend' }),
      phase: field({ type: 'literal', value: 'published' }),
      changedAt: field({ type: 'number' }),
      previousOwner: { ...stringField, optional: true },
    },
    nullReturn,
  ),
  ...Object.fromEntries(
    ['validated', 'complete'].map((name) => [
      `releases/contract.js:${name}`,
      endpoint('mutation', { owner: stringField, candidateId: stringField }, nullReturn),
    ]),
  ),
  'releases/contract.js:state': endpoint(
    'query',
    {},
    {
      type: 'object',
      value: {
        url: field({ type: 'union', value: [{ type: 'string' }, { type: 'null' }] }),
        schemaDigest: stringField,
        paused: field({ type: 'boolean' }),
        commit: field({ type: 'union', value: [{ type: 'string' }, { type: 'null' }] }),
        smoke: field({ type: 'boolean' }),
        drained: field({ type: 'boolean' }),
      },
    },
  ),
};
const states: [string, string[]][] = [
  ...['calendar', 'calendarVersion', 'createCalendar', 'saveCalendar', 'synchronizeBase'].map(
    (name): [string, string[]] => [
      `calendars.js:${name}`,
      ['returns', 'value', 'state', 'fieldType'],
    ],
  ),
  [
    'calendars.js:pdfContext',
    ['returns', 'value', 'record', 'fieldType', 'value', 'state', 'fieldType'],
  ],
  [
    'calendars.js:saveCalendar',
    ['args', 'value', 'body', 'fieldType', 'value', 'state', 'fieldType'],
  ],
];
const removedPaths = [
  ['value', 'weekEvidence'],
  ['value', 'scopeConfirmation', 'fieldType', 'value', 'source'],
  ['value', 'teacherVacations', 'fieldType', 'value', 'evidence'],
  ['value', 'events', 'fieldType', 'value', 'value', 'evidence'],
  [
    'value',
    'events',
    'fieldType',
    'value',
    'value',
    'deadlineAdjustment',
    'fieldType',
    'value',
    'evidence',
  ],
  [
    'value',
    'intakeByModality',
    'fieldType',
    'values',
    'fieldType',
    'values',
    'fieldType',
    'value',
    'source',
  ],
];
const kinds = (values: string[]) =>
  field({ type: 'union', value: values.map((value) => ({ type: 'literal', value })) }, true);
function removeManualFields(state: ObjectValue) {
  for (const path of removedPaths) {
    const parent = at(state, path.slice(0, -1));
    const key = path.at(-1)!;
    const previous = parent[key];
    if (!object(previous) || !object(previous.fieldType) || previous.fieldType.type !== 'string')
      throw Error('Campo de fonte ausente ou diferente no baseline.');
    delete parent[key];
  }
  const event = at(state, ['value', 'events', 'fieldType', 'value', 'value']);
  if (canonical(event.recordType) === canonical(kinds(['event', 'prior-reference'])))
    event.recordType = kinds(['event', 'prior-reference', 'retired-stage']);
  else if (
    canonical(event.recordType) !== canonical(kinds(['event', 'prior-reference', 'retired-stage']))
  )
    throw Error('Classificação de registro inesperada no baseline.');
}
/** Exactly six manual paths; institutional validators, indexes and all other contracts stay identical. */
export function assertManualSourceContraction(before: Contracts, after: Contracts) {
  if (!before.schema.schemaValidation || !after.schema.schemaValidation)
    throw Error('A contração preserva schemaValidation.');
  const expected = structuredClone(before),
    actual = structuredClone(after);
  for (const table of ['calendarContents', 'calendarSnapshots']) {
    const definition = expected.schema.tables.find((item) => item.tableName === table);
    if (!definition) throw Error('Tabela de calendário ausente do baseline.');
    removeManualFields(at(definition.documentType, ['value', 'state', 'fieldType']));
  }
  for (const [name, path] of states) removeManualFields(at(expected.functions[name], path));
  for (const name of [
    'maintenance/manualSources.js:preflight',
    'maintenance/manualSources.js:applyBatch',
  ]) {
    if (!Object.hasOwn(actual.functions, name)) delete expected.functions[name];
  }
  for (const [name, contract] of Object.entries(expectedContractFunctions)) {
    if (canonical(actual.functions[name]) !== canonical(contract))
      throw Error(`Endpoint contract inesperado: ${name}.`);
    delete actual.functions[name];
  }
  if (canonical(expected) !== canonical(actual))
    throw Error(
      'A contração inclui mudanças fora dos seis campos manuais e das funções administrativas declaradas.',
    );
}
export function assertNoManualSources(tables: Record<string, Record<string, unknown>[]>) {
  let states = 0;
  const obj = (value: unknown) => (object(value) ? value : {});
  for (const table of ['calendarContents', 'calendarSnapshots'])
    for (const row of tables[table] ?? []) {
      const state = obj(row.state);
      states++;
      if (
        Object.hasOwn(state, 'weekEvidence') ||
        Object.hasOwn(obj(state.scopeConfirmation), 'source') ||
        Object.hasOwn(obj(state.teacherVacations), 'evidence')
      )
        throw Error('Há campos manuais persistidos; concluir limpeza antes da contração.');
      for (const event of Array.isArray(state.events) ? state.events : [])
        if (
          Object.hasOwn(obj(event), 'evidence') ||
          Object.hasOwn(obj(obj(event).deadlineAdjustment), 'evidence')
        )
          throw Error('Há fontes manuais em eventos persistidos.');
      for (const terms of Object.values(obj(state.intakeByModality)))
        for (const entry of Object.values(obj(terms)))
          if (Object.hasOwn(obj(entry), 'source'))
            throw Error('Há fonte manual de ingresso persistida.');
    }
  return states;
}
