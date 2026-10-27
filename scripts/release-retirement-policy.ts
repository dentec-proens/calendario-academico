import { canonical } from './release-contracts.ts';
import type { Contracts } from './release-contracts.ts';

const removedFunctions = new Set([
  'actions/history.js:uploadHistory',
  'actions/history.js:downloadHistory',
  'actions/history.js:analyzeHistory',
  'actions/history.js:reanalyzeHistory',
  'actions/history.js:restoreHistoryOriginal',
  'histories.js:historyContext',
  'histories.js:analysisVersions',
  'histories.js:attachHistory',
  'histories.js:saveHistoryAnalysis',
  'nativeFiles.js:restoreHistoryOriginal',
]);
const addedFunctions = new Set([
  'releases.js:contractPublished',
  'releases.js:contractValidated',
  'releases.js:contractComplete',
]);

const textField = { optional: false, fieldType: { type: 'string' } };
const fields = Object.fromEntries(
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
  ].map((name) => [name, textField]),
);
const endpoint = (value: Record<string, unknown>) => ({
  kind: 'mutation',
  visibility: 'internal',
  args: { type: 'object', value },
  returns: { type: 'null' },
});
export const expectedContractFunctions: Contracts['functions'] = {
  'releases.js:contractPublished': endpoint({
    ...fields,
    mode: { optional: false, fieldType: { type: 'literal', value: 'contract' } },
    key: { optional: false, fieldType: { type: 'literal', value: 'backend' } },
    phase: {
      optional: false,
      fieldType: {
        type: 'union',
        value: ['published', 'validated', 'complete'].map((value) => ({ type: 'literal', value })),
      },
    },
    changedAt: { optional: false, fieldType: { type: 'number' } },
  }),
  ...Object.fromEntries(
    ['contractValidated', 'contractComplete'].map((name) => [
      `releases.js:${name}`,
      endpoint({ owner: textField, candidateId: textField }),
    ]),
  ),
};

/** Exact contraction policy for this retirement; never a generic compatibility override. */
export function assertHistoryRetirement(before: Contracts, after: Contracts) {
  if (!before.schema.schemaValidation || !after.schema.schemaValidation)
    throw Error('A retirada mantém schemaValidation ativo.');
  const literalField = (value: unknown, key: string, literal: string) => {
    if (!value || typeof value !== 'object') return false;
    const validator = value as {
      type?: string;
      value?: Record<string, { fieldType?: { type?: string; value?: unknown } }>;
    };
    return (
      validator.type === 'object' &&
      validator.value?.[key]?.fieldType?.type === 'literal' &&
      validator.value[key]?.fieldType?.value === literal
    );
  };
  function strip(value: unknown, side: 'before' | 'after'): unknown {
    if (Array.isArray(value))
      return value
        .filter(
          (item) =>
            !literalField(
              item,
              side === 'before' ? 'type' : 'mode',
              side === 'before' ? 'history' : 'contract',
            ),
        )
        .map((item) => strip(item, side));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            side !== 'before' || !['historicalSource', 'ignoredHistory', 'histories'].includes(key),
        )
        .map(([key, item]) => [key, strip(item, side)]),
    );
  }
  const original = structuredClone(before),
    next = structuredClone(after);
  original.schema.tables = original.schema.tables.filter(
    (table) => !['histories', 'historyAnalyses'].includes(table.tableName),
  );
  for (const name of removedFunctions) delete original.functions[name];
  for (const name of addedFunctions) {
    if (canonical(next.functions[name]) !== canonical(expectedContractFunctions[name]))
      throw Error('O contrato interno da etapa de retirada foi alterado.');
    delete next.functions[name];
  }
  const fixture = original.functions['devSetup.js:prepareE2ERestoration']?.returns;
  if (fixture?.type === 'object') {
    const fields = fixture.value as Record<string, unknown>;
    delete fields.calendarId;
    delete fields.historyId;
  }
  for (const table of next.schema.tables)
    if (['releaseProgress', 'releaseReceipts'].includes(table.tableName))
      table.documentType = strip(table.documentType, 'after') as typeof table.documentType;
  if (next.functions['releases.js:installed'])
    next.functions['releases.js:installed']!.returns = strip(
      next.functions['releases.js:installed']!.returns,
      'after',
    ) as NonNullable<(typeof next.functions)[string]>['returns'];
  if (canonical(strip(original, 'before')) !== canonical(next))
    throw Error('A etapa contract contém mudança fora da retirada de calendários anteriores.');
}
