import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';
import type { LegacyUsageArgs, LegacyUsagePage } from '../../convex/legacy';
import type { ContentState } from '../../convex/validators';

const modules = {
  '../../convex/_generated/server.js': () => import('../../convex/_generated/server.js'),
  '../../convex/legacy.ts': () => import('../../convex/legacy'),
};
const fixture = () => convexTest(schema, modules);
type Fixture = ReturnType<typeof fixture>;
const paginationOpts = {
  numItems: 10,
  cursor: null,
  maximumRowsRead: 10,
  maximumBytesRead: 4 * 1024 * 1024,
};
const state4 = (): ContentState => ({
  schemaVersion: 4,
  offers: [{ id: 'integrado', kind: 'integrado', delivery: 'a-conferir', organization: 'anual' }],
  weekdays: [],
  weekConfirmed: false,
  periods: [],
  events: [],
});
async function seed(
  t: Fixture,
  campusId: Id<'campuses'>,
  state: ContentState = state4(),
  options: { year?: number; trash?: boolean; withoutContent?: boolean } = {},
) {
  return t.run(async (ctx) => {
    const kinds: Array<'integrado'> = ['integrado'];
    const calendarId = await ctx.db.insert('calendars', {
      campusId,
      year: options.year ?? 2027,
      offerKinds: kinds,
      purpose: 'test',
      courses: 'Nome privado sintético',
      classes: 'Turma privada',
      shifts: 'Diurno',
      version: 1,
      updatedAt: 123,
      ...(options.trash ? { deletedAt: 456 } : {}),
    });
    const contentId = options.withoutContent
      ? undefined
      : await ctx.db.insert('calendarContents', {
          calendarId,
          state,
          catalogueRevision: 1,
          institutionalSnapshot: [],
          documentSnapshot: [],
        });
    return { calendarId, contentId };
  });
}
async function pages(t: Fixture, phase: LegacyUsageArgs['phase']) {
  const result: LegacyUsagePage[] = [];
  let cursor: string | null = null;
  for (let calls = 0; calls < 100; calls++) {
    const page: LegacyUsagePage = await t.query(internal.legacy.usage, {
      phase,
      paginationOpts: { ...paginationOpts, cursor },
    });
    result.push(page);
    if (page.isDone) return result;
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error('Synthetic inventory did not terminate.');
}
const count = (result: LegacyUsagePage[], key: keyof LegacyUsagePage['counts']) =>
  result.reduce((total, page) => total + page.counts[key], 0);

test('all contents are paginated in batches of ten, including trash, without private output', async () => {
  const t = fixture();
  const campusId = await t.run((ctx) =>
    ctx.db.insert('campuses', { name: 'Campus sintético', archived: false }),
  );
  for (let n = 0; n < 23; n++) await seed(t, campusId, state4(), { trash: n === 0 });
  const result = await pages(t, 'contents');
  expect(result).toHaveLength(3);
  expect(result.every((page) => page.scanned <= 10)).toBe(true);
  expect(count(result, 'contents')).toBe(23);
  expect(count(result, 'schemaV4')).toBe(23);
  expect(count(result, 'trashedContents')).toBe(1);
  expect(count(result, 'contentsWithoutStages')).toBe(23);
  expect(count(result, 'liveLegacySemesterThreeContents')).toBe(0);
  expect(JSON.stringify(result)).not.toMatch(/Nome privado|Turma privada|Campus sintético/);
  expect((await t.run((ctx) => ctx.db.query('calendarContents').take(30))).length).toBe(23);
});

test('post-migration inventory records only v4 and reports undefined offer stages without guessing the old count', async () => {
  const t = fixture();
  const campusId = await t.run((ctx) =>
    ctx.db.insert('campuses', { name: 'Campus sintético', archived: false }),
  );
  const convertedUnknown = state4();
  convertedUnknown.offers[0].organization = 'semestral';
  await seed(t, campusId, convertedUnknown);
  const result = await pages(t, 'contents');
  expect(count(result, 'schemaV2')).toBe(0);
  expect(count(result, 'schemaV3')).toBe(0);
  expect(count(result, 'schemaV4')).toBe(1);
  expect(count(result, 'orphanKeys')).toBe(0);
  expect(count(result, 'contentsWithOrphanKeys')).toBe(0);
  expect(count(result, 'contentsWithoutStages')).toBe(1);
  expect(count(result, 'offersWithoutStages')).toBe(1);
  expect(count(result, 'liveLegacySemesterThreeContents')).toBe(0);
  expect(count(result, 'liveLegacySemesterThreeOffers')).toBe(0);
});

test('historical quantities are counted separately from absent quantities, including trash and orphan contents', async () => {
  const t = fixture();
  const campusId = await t.run((ctx) =>
    ctx.db.insert('campuses', { name: 'Campus sintético', archived: false }),
  );
  for (let index = 0; index < 23; index++) {
    const state = state4();
    state.offers[0] = {
      ...state.offers[0],
      organization: 'a-classificar',
      legacyStageCount: ([2, 3, 4] as const)[index % 3],
    };
    const record = await seed(t, campusId, state, { trash: index === 0 });
    if (index === 22) await t.run((ctx) => ctx.db.delete(record.calendarId));
  }
  await seed(t, campusId);
  const configured = state4();
  configured.offers[0].stages = { perTerm: 2 };
  await seed(t, campusId, configured);
  const result = await pages(t, 'contents');
  expect(result).toHaveLength(3);
  expect(count(result, 'legacyStageCountContents')).toBe(23);
  expect(count(result, 'legacyStageCountOffers')).toBe(23);
  expect(count(result, 'legacyStageCount2Offers')).toBe(8);
  expect(count(result, 'legacyStageCount3Offers')).toBe(8);
  expect(count(result, 'legacyStageCount4Offers')).toBe(7);
  expect(count(result, 'offersWithPendingStageCycle')).toBe(24);
  expect(count(result, 'offersWithoutStages')).toBe(1);
  expect(count(result, 'contentsWithoutStages')).toBe(1);
  expect(count(result, 'orphanContents')).toBe(1);
  expect(count(result, 'trashedContents')).toBe(1);
  expect(count(result, 'historicalLegacyStageCountOffers')).toBe(0);
});

test('historical-only non-event records, retained intake and old-year metadata remain visible after live data is clear', async () => {
  const t = fixture();
  await t.run(async (ctx) => {
    for (const [index, year] of [2025, 2026, 2027].entries()) {
      const state = state4();
      if (index < 2) state.legacySecondSemesterIntake = index === 0;
      state.events = [
        {
          id: 'ordinary',
          name: 'Nome histórico privado',
          kind: 'note',
          start: `${year}-02-01`,
          end: `${year}-02-01`,
          recordType: 'event',
        },
        ...(index < 2
          ? [
              {
                id: 'prior',
                name: 'Referência privada',
                kind: 'note' as const,
                start: `${year}-01-10`,
                end: `${year}-01-10`,
                recordType: 'prior-reference' as const,
              },
            ]
          : []),
        ...(index === 0
          ? [
              {
                id: 'retired',
                name: 'Etapa privada',
                kind: 'note' as const,
                start: `${year}-02-01`,
                end: `${year}-02-01`,
                recordType: 'retired-stage' as const,
              },
            ]
          : []),
      ];
      await ctx.db.insert('calendarSnapshots', {
        state: { ...state, year, campus: 'Campus privado histórico' },
        at: index,
        catalogueRevision: 1,
        institutionalEvents: [],
        documentSnapshot: [],
      });
    }
  });
  const live = await pages(t, 'contents');
  expect(count(live, 'nonEventRecords')).toBe(0);
  expect(count(live, 'legacySecondSemesterIntakeContents')).toBe(0);
  const historical = await pages(t, 'historicalSnapshots');
  expect(count(historical, 'historicalLegacyStageCountOffers')).toBe(0);
  expect(count(historical, 'historicalNonEventRecords')).toBe(3);
  expect(count(historical, 'historicalPriorReferenceRecords')).toBe(2);
  expect(count(historical, 'historicalRetiredStageRecords')).toBe(1);
  expect(count(historical, 'historicalLegacySecondSemesterIntakeContents')).toBe(2);
  expect(count(historical, 'historicalYearThrough2026Snapshots')).toBe(2);
  expect(JSON.stringify(historical)).not.toMatch(
    /Nome histórico|Referência privada|Campus privado/,
  );
});

test('historical snapshots keep a separate paginated inventory after every live marker has been resolved', async () => {
  const t = fixture();
  await t.run(async (ctx) => {
    for (let index = 0; index < 23; index++) {
      const state = state4();
      state.offers[0] = {
        ...state.offers[0],
        organization: 'a-classificar',
        legacyStageCount: ([2, 3, 4] as const)[index % 3],
      };
      await ctx.db.insert('calendarSnapshots', {
        state: { ...state, year: 2027, campus: 'Campus privado sintético' },
        at: index,
        catalogueRevision: 1,
        institutionalEvents: [],
        documentSnapshot: [],
      });
    }
  });
  const live = await pages(t, 'contents');
  expect(count(live, 'legacyStageCountOffers')).toBe(0);
  const historical = await pages(t, 'historicalSnapshots');
  expect(historical).toHaveLength(3);
  expect(historical.every((page) => page.scanned <= 10)).toBe(true);
  expect(count(historical, 'historicalLegacyStageCountContents')).toBe(23);
  expect(count(historical, 'historicalLegacyStageCountOffers')).toBe(23);
  expect(count(historical, 'historicalLegacyStageCount2Offers')).toBe(8);
  expect(count(historical, 'historicalLegacyStageCount3Offers')).toBe(8);
  expect(count(historical, 'historicalLegacyStageCount4Offers')).toBe(7);
  expect(count(historical, 'legacyStageCountOffers')).toBe(0);
  expect(JSON.stringify(historical)).not.toContain('Campus privado sintético');
});

test('counts retained intake decisions, non-event records and actual legacy requirement IDs in 2027', async () => {
  const t = fixture();
  const campusId = await t.run((ctx) =>
    ctx.db.insert('campuses', { name: 'Campus sintético', archived: false }),
  );
  for (const decision of [true, false]) {
    const state = state4();
    state.legacySecondSemesterIntake = decision;
    state.events = [
      {
        id: 'prior',
        name: 'Evento privado',
        kind: 'note',
        start: '2026-12-01',
        end: '2026-12-01',
        recordType: 'prior-reference',
        requirementId: 'teaching-plan-0',
      },
      {
        id: 'retired',
        name: 'Etapa privada',
        kind: 'note',
        start: '2027-02-01',
        end: '2027-02-01',
        recordType: 'retired-stage',
      },
      {
        id: 'modern',
        name: 'Evento normal',
        kind: 'note',
        start: '2027-02-01',
        end: '2027-02-01',
        recordType: 'event',
        requirementId: 'family-meeting',
      },
    ];
    await seed(t, campusId, state);
  }
  const oldYear = state4();
  oldYear.events = [
    {
      id: 'old',
      name: 'Evento antigo',
      kind: 'note',
      start: '2026-02-01',
      end: '2026-02-01',
      requirementId: 'teaching-plan-0',
    },
  ];
  await seed(t, campusId, oldYear, { year: 2026 });
  const result = await pages(t, 'contents');
  expect(count(result, 'legacySecondSemesterIntakeContents')).toBe(2);
  expect(count(result, 'legacySecondSemesterIntakeTrue')).toBe(1);
  expect(count(result, 'legacySecondSemesterIntakeFalse')).toBe(1);
  expect(count(result, 'nonEventRecords')).toBe(4);
  expect(count(result, 'priorReferenceRecords')).toBe(2);
  expect(count(result, 'retiredStageRecords')).toBe(2);
  expect(count(result, 'legacyRequirementEvents2027')).toBe(2);
  expect(result.flatMap((page) => page.legacyRequirementIds2027)).toEqual([
    { id: 'teaching-plan-0', events: 2 },
  ]);
  expect(JSON.stringify(result)).not.toContain('Evento privado');
});

test('cross-checks orphan calendars and contents; groups <=2026 by native campus ID including trash', async () => {
  const t = fixture();
  const campusId = await t.run((ctx) =>
    ctx.db.insert('campuses', { name: 'Campus sintético', archived: false }),
  );
  await seed(t, campusId, state4(), { year: 2026, trash: true });
  await seed(t, campusId, state4(), { year: 2025, withoutContent: true });
  const orphan = await seed(t, campusId);
  await t.run((ctx) => ctx.db.delete('calendars', orphan.calendarId));
  expect(count(await pages(t, 'contents'), 'orphanContents')).toBe(1);
  const result = await pages(t, 'calendars');
  expect(count(result, 'calendars')).toBe(2);
  expect(count(result, 'calendarsWithoutContent')).toBe(1);
  expect(count(result, 'calendarsThrough2026')).toBe(2);
  expect(result.flatMap((page) => page.calendarsThrough2026ByCampus)).toEqual([
    { campusId, calendars: 2 },
  ]);
});

test('release residues require prefix plus year 8700 and every linked user guards the campus', async () => {
  const t = fixture();
  const ids = await t.run(async (ctx) => {
    const guarded = await ctx.db.insert('campuses', {
      name: 'Operação de publicação release-sintética',
      archived: false,
    });
    const empty = await ctx.db.insert('campuses', {
      name: 'Operação de publicação release-vazia',
      archived: true,
    });
    const ordinary = await ctx.db.insert('campuses', { name: 'Campus comum', archived: false });
    await ctx.db.insert('users', {
      campusId: guarded,
      name: 'Operação de publicação',
      email: 'private@example.invalid',
      role: 'CAMPUS',
      active: false,
      removedAt: 1,
      loginMethod: 'local',
    });
    return { guarded, empty, ordinary };
  });
  const residue = await seed(t, ids.guarded, state4(), { year: 8700, trash: true });
  await seed(t, ids.ordinary, state4(), { year: 8700 });
  await seed(t, ids.empty, state4(), { year: 2027 });
  const campuses = (await pages(t, 'campuses')).flatMap((page) => page.releaseResidueCampuses);
  expect(campuses).toEqual([
    { campusId: ids.guarded, hasAnyUsers: true },
    { campusId: ids.empty, hasAnyUsers: false },
  ]);
  const calendars = (await pages(t, 'calendars')).flatMap((page) => page.year8700Calendars);
  expect(
    calendars.filter((item) => campuses.some((campus) => campus.campusId === item.campusId)),
  ).toEqual([
    { calendarId: residue.calendarId, campusId: ids.guarded, hasContent: true, trashed: true },
  ]);
  expect(JSON.stringify(campuses)).not.toMatch(/private@example|publicação/);
  expect((await t.run((ctx) => ctx.db.query('users').take(2))).length).toBe(1);
});

test('migration receipts remain separate from live counts and never guess lost semester-three settings', async () => {
  const t = fixture();
  await t.run(async (ctx) => {
    await ctx.db.insert('migrationResults', {
      key: 'offers-v4',
      reference: 'content:synthetic',
      outcome: 'converted',
      pending: true,
      orphanKeys: 3,
      sourceSchemaVersion: 2,
    });
    await ctx.db.insert('migrationResults', {
      key: 'offers-v4',
      reference: 'content:orphan',
      outcome: 'orphan-content',
      pending: false,
      orphanKeys: 0,
      sourceSchemaVersion: 3,
    });
    await ctx.db.insert('migrationResults', {
      key: 'offers-v4',
      reference: 'calendar:orphan',
      outcome: 'orphan-calendar',
      pending: false,
      orphanKeys: 0,
    });
    await ctx.db.insert('migrationResults', {
      key: 'offers-v4',
      reference: 'content:failed',
      outcome: 'failed',
      pending: false,
      orphanKeys: 0,
      error: 'Private source detail',
    });
  });
  const result = await pages(t, 'receipts');
  expect(count(result, 'migrationReceipts')).toBe(4);
  expect(count(result, 'receiptOrphanKeys')).toBe(3);
  expect(count(result, 'receiptOrphanContents')).toBe(1);
  expect(count(result, 'receiptOrphanCalendars')).toBe(1);
  expect(count(result, 'receiptFailures')).toBe(1);
  expect(count(result, 'receiptConvertedFromV2')).toBe(1);
  expect(count(result, 'orphanKeys')).toBe(0);
  expect(count(result, 'liveLegacySemesterThreeContents')).toBe(0);
  expect(JSON.stringify(result)).not.toMatch(/Private source|content:synthetic/);
});

test('oversized and unbudgeted native pagination is rejected before scanning', async () => {
  const t = fixture();
  for (const options of [
    { ...paginationOpts, numItems: 11 },
    { ...paginationOpts, numItems: 0 },
    { ...paginationOpts, numItems: 1.5 },
    { ...paginationOpts, maximumRowsRead: 11 },
    { ...paginationOpts, maximumBytesRead: 4 * 1024 * 1024 + 1 },
    { numItems: 10, cursor: null },
  ])
    await expect(
      t.query(internal.legacy.usage, { phase: 'contents', paginationOpts: options }),
    ).rejects.toThrow(/páginas de até 10/);
});
