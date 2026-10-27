import { test, expect } from 'vitest';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../convex/schema.ts';
import { convexModules } from './helpers/convex-modules.ts';
import {
  assertHistoryRetirement,
  expectedContractFunctions,
} from '../scripts/release-retirement-policy.ts';
import { assertRetirementReceipt, recoverExpiredFiles } from '../scripts/release-retirement.ts';
import { createHistoryRetirementPlan } from '../migration/retire-previous-calendars.ts';
import type { Contracts } from '../scripts/release-contracts.ts';

const field = (type: string, value?: unknown) => ({
  optional: false,
  fieldType: { type, ...(value === undefined ? {} : { value }) },
});
const object = (value: Record<string, unknown>) => ({ type: 'object', value });
const fn = (args = object({}), returns = object({})) => ({
  kind: 'mutation',
  visibility: 'public',
  args,
  returns,
});
function contracts() {
  const before: Contracts = {
    schema: {
      schemaValidation: true,
      tables: [
        {
          tableName: 'calendars',
          documentType: object({ name: field('string') }),
          indexes: [],
          searchIndexes: [],
          vectorIndexes: [],
        },
        {
          tableName: 'histories',
          documentType: object({}),
          indexes: [],
          searchIndexes: [],
          vectorIndexes: [],
        },
        {
          tableName: 'historyAnalyses',
          documentType: object({}),
          indexes: [],
          searchIndexes: [],
          vectorIndexes: [],
        },
      ],
    },
    functions: {
      'calendars.js:saveCalendar': fn(
        object({
          state: field('object', {
            events: field(
              'array',
              object({ id: field('string'), historicalSource: field('string') }),
            ),
            ignoredHistory: field('array', { type: 'string' }),
          }),
        }),
      ),
      'actions/history.js:uploadHistory': fn(),
    },
  };
  const after = structuredClone(before);
  after.schema.tables = after.schema.tables.filter((table) => table.tableName === 'calendars');
  delete after.functions['actions/history.js:uploadHistory'];
  Object.assign(after.functions, structuredClone(expectedContractFunctions));
  after.functions['calendars.js:saveCalendar'] = fn(
    object({ state: field('object', { events: field('array', object({ id: field('string') })) }) }),
  );
  return { before, after };
}
test('the retirement policy admits only the exact removed resource and rejects unrelated contractions or auth changes', () => {
  const { before, after } = contracts();
  expect(() => assertHistoryRetirement(before, after)).not.toThrow();
  for (const mutate of [
    (next: Contracts) => {
      next.schema.tables = [];
    },
    (next: Contracts) => {
      next.schema.schemaValidation = false;
    },
    (next: Contracts) => {
      delete next.functions['calendars.js:saveCalendar'];
    },
    (next: Contracts) => {
      next.functions['calendars.js:saveCalendar']!.visibility = 'internal';
    },
    (next: Contracts) => {
      next.functions['auth.js:signIn'] = fn();
    },
    (next: Contracts) => {
      next.functions['calendars.js:saveCalendar']!.returns = {
        type: 'union',
        value: [{ type: 'string' }, object({ mode: field('literal', 'contract') })],
      };
    },
  ]) {
    const changed = structuredClone(after);
    mutate(changed);
    expect(() => assertHistoryRetirement(before, changed)).toThrow();
  }
});
test('a verified rehearsal must belong to the exact retirement plan, source, schema and local target', () => {
  const plan = createHistoryRetirementPlan({ _tables: [], _storage: [] }, 'a'.repeat(64));
  const receipt = {
    result: 'verified',
    verificationMode: 'live_export',
    planDigest: plan.digest,
    sourceDigest: plan.sourceDigest,
    schemaDigest: 'b'.repeat(64),
    deployment: 'local',
  };
  expect(() => assertRetirementReceipt(plan, receipt, 'b'.repeat(64))).not.toThrow();
  for (const key of [
    'result',
    'verificationMode',
    'planDigest',
    'sourceDigest',
    'schemaDigest',
    'deployment',
  ])
    expect(() =>
      assertRetirementReceipt(plan, { ...receipt, [key]: 'wrong' }, 'b'.repeat(64)),
    ).toThrow();
});
const ref = (name: string) => makeFunctionReference<'mutation'>(`releases:${name}`);
test('contract receipts require a drained exclusive maintenance window and cannot be completed through fast mode', async () => {
  const t = convexTest(schema, convexModules);
  const commit = 'a'.repeat(40),
    previousBackend = 'b'.repeat(40),
    owner = 'c'.repeat(40);
  await t.run((ctx) =>
    ctx.db.insert('releaseProgress', {
      key: 'backend',
      mode: 'fast',
      commit: previousBackend,
      previousBackend: 'd'.repeat(40),
      previousFrontend: 'dpl_previous',
      owner: 'e'.repeat(40),
      candidateId: 'dpl_old',
      functionSpecHash: 'f'.repeat(64),
      skippedValidations: { check: true, smoke: true, compatibility: true, backup: true },
      phase: 'complete',
      changedAt: 1,
    }),
  );
  const args = {
    mode: 'contract',
    key: 'backend',
    commit,
    previousBackend,
    previousFrontend: 'dpl_old',
    owner,
    candidateId: 'dpl_new',
    phase: 'published',
    changedAt: 1,
    ...Object.fromEntries(
      [
        'functionSpecHash',
        'planDigest',
        'sourceDigest',
        'schemaDigest',
        'rehearsalDigest',
        'verificationDigest',
      ].map((key) => [key, 'f'.repeat(64)]),
    ),
  };
  await expect(t.mutation(ref('contractPublished'), args)).rejects.toThrow('manutenção');
  const control = await t.run((ctx) =>
    ctx.db.insert('operationalControl', { key: 'release', paused: true, commit, changedAt: 1 }),
  );
  const lease = await t.run((ctx) =>
    ctx.db.insert('operationalLeases', { operation: 'PDF', startedAt: 1 }),
  );
  await expect(t.mutation(ref('contractPublished'), args)).rejects.toThrow('drenagem');
  await t.run((ctx) => ctx.db.delete(lease));
  await t.mutation(ref('contractPublished'), args);
  await expect(
    t.mutation(ref('contractComplete'), { owner, candidateId: 'dpl_new' }),
  ).rejects.toThrow('validado');
  await t.run((ctx) => ctx.db.patch(control, { paused: false }));
  await expect(t.mutation(ref('fastComplete'), { owner, candidateId: 'dpl_new' })).rejects.toThrow(
    'fast',
  );
  await t.run((ctx) => ctx.db.patch(control, { paused: true }));
  await expect(
    t.mutation(ref('contractValidated'), { owner: 'wrong', candidateId: 'dpl_new' }),
  ).rejects.toThrow();
  await t.mutation(ref('contractValidated'), { owner, candidateId: 'dpl_new' });
  await t.mutation(ref('contractComplete'), { owner, candidateId: 'dpl_new' });
  await t.mutation(ref('contractComplete'), { owner, candidateId: 'dpl_new' });
  expect((await t.run((ctx) => ctx.db.query('releaseReceipts').take(10))).length).toBe(1);
});

test('contract policy rejects broad or public control endpoints', () => {
  const { before, after } = contracts();
  for (const property of ['visibility', 'args', 'returns'] as const) {
    const changed = structuredClone(after);
    Object.assign(changed.functions['releases.js:contractPublished']!, {
      [property]: property === 'visibility' ? 'public' : { type: 'any' },
    });
    expect(() => assertHistoryRetirement(before, changed)).toThrow('contrato interno');
  }
});
test('expired temporary files are reconciled across all bounded batches before maintenance can end', async () => {
  let calls = 0;
  await recoverExpiredFiles(() => ({ uploads: 100, tickets: 0, continued: ++calls < 3 }));
  expect(calls).toBe(3);
  await expect(recoverExpiredFiles(() => null)).rejects.toThrow('checkpoint');
  await expect(
    recoverExpiredFiles(() => ({ uploads: 100, tickets: 100, continued: true })),
  ).rejects.toThrow('não concluiu');
});
