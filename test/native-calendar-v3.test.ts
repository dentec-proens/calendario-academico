import { expect, test } from 'vitest';
import { api } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';
import { inspectCalendar } from '../src/calendar-base/index.ts';
import { reviewCriteria } from '../src/review.ts';

async function setup() {
  const fixture = await createNativeFixture();
  const actor = fixture.asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['integrado', 'graduacao'],
      regime: 'misto',
      courses: 'Ofertas sintéticas',
      purpose: 'test',
    },
  });
  return { ...fixture, actor, record };
}

test('calendar creation preserves the explicitly chosen organization and keeps a mixed choice pending', async () => {
  const { asClient, ids } = await createNativeFixture();
  const actor = asClient('campus-a');
  for (const regime of ['anual', 'semestral', 'misto'] as const) {
    const record = await actor.mutation(api.calendars.createCalendar, {
      body: {
        campusId: ids.campuses.a,
        year: 2027,
        modalities: ['integrado', 'graduacao'],
        regime,
        courses: 'Ofertas sintéticas',
        purpose: 'test',
      },
    });
    const expected = regime === 'misto' ? 'a-classificar' : regime;
    expect(record.state.organizationByModality).toEqual({
      integrado: expected,
      graduacao: expected,
    });
    expect(record.state.regime).toBe(expected);
    expect(record.state.periods).toEqual([]);
    expect(record.state.schemaVersion).toBe(3);
    expect(record.state.conversion).toBeUndefined();
    const reloaded = await actor.query(api.calendars.calendar, { id: record.id });
    expect(reloaded.state.organizationByModality).toEqual(record.state.organizationByModality);
  }
});

test('v3 round-trip preserves independent organization, actual publication dates and intended admission', async () => {
  const { actor, record } = await setup();
  const state = {
    ...record.state,
    organizationByModality: { integrado: 'anual' as const, graduacao: 'semestral' as const },
    intakeByModality: {
      integrado: { annual: { status: 'unknown' as const } },
      graduacao: {
        first: { status: 'yes' as const, required: true },
        second: { status: 'no' as const },
      },
    },
    periods: [
      {
        id: 'integrated-year',
        name: 'Ciclo anual',
        start: '2027-02-01',
        end: '2027-12-17',
        association: {
          status: 'defined' as const,
          modalities: ['integrado' as const],
          term: 'annual' as const,
        },
      },
      {
        id: 'undergraduate-first',
        name: 'Primeiro semestre',
        start: '2027-02-01',
        end: '2027-06-30',
        association: {
          status: 'defined' as const,
          modalities: ['graduacao' as const],
          term: 'first' as const,
        },
      },
      {
        id: 'undergraduate-second',
        name: 'Segundo semestre',
        start: '2027-08-02',
        end: '2027-12-17',
        association: {
          status: 'defined' as const,
          modalities: ['graduacao' as const],
          term: 'second' as const,
        },
      },
    ],
    events: [
      {
        id: 'previous-publication',
        name: 'Publicação sintética de 2026',
        start: '2026-12-10',
        end: '2026-12-10',
        kind: 'note' as const,
        recordType: 'prior-reference' as const,
        publicationStatus: 'published' as const,
        admission: {
          type: 'transfer' as const,
          year: 2027,
          term: 'first' as const,
          periodId: 'undergraduate-first',
        },
        modalities: ['graduacao' as const],
      },
      {
        id: 'future-admission',
        name: 'Previsão sintética para ingresso 2028',
        start: '2027-12-01',
        end: '2027-12-01',
        kind: 'note' as const,
        recordType: 'event' as const,
        publicationStatus: 'planned' as const,
        admission: { type: 'regular' as const, year: 2028, term: 'annual' as const },
        deadlineAdjustment: {
          date: '2027-12-15',
          reviewed: false,
        },
        modalities: ['integrado' as const],
      },
    ],
  };
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: { version: record.version, catalogueRevision: record.catalogueRevision, state },
  });
  expect(saved.state.schemaVersion).toBe(3);
  const loaded = await actor.query(api.calendars.calendar, { id: record.id });
  expect(loaded.state.events).toEqual(saved.state.events);
  expect(loaded.state.events[0]).toMatchObject({
    start: '2026-12-10',
    end: '2026-12-10',
    publicationStatus: 'published',
    admission: { year: 2027, periodId: 'undergraduate-first' },
  });
  expect(loaded.state.events[1]).toMatchObject({
    start: '2027-12-01',
    publicationStatus: 'planned',
    admission: { year: 2028 },
  });
  expect(loaded.state.organizationByModality).toEqual(state.organizationByModality);
  expect(loaded.state.intakeByModality).toEqual(state.intakeByModality);
  expect(loaded.state.periods.map((period) => period.association)).toEqual(
    state.periods.map((period) => period.association),
  );
  const snapshot = await actor.query(api.calendars.calendarVersion, {
    id: record.id,
    version: record.version,
  });
  expect(snapshot.state).toEqual(record.state);
});

test('direct backend writes cannot downgrade v3 or bypass the active rules and temporal policy', async () => {
  const { actor, record } = await setup();
  for (const forged of [
    { ...record.state, schemaVersion: 2 as const },
    { ...record.state, rulesetVersion: undefined },
    { ...record.state, rulesetVersion: 'legacy-2026-v1' },
    { ...record.state, rulesetVersion: 'forged' },
  ])
    await expect(
      actor.mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version: record.version,
          catalogueRevision: record.catalogueRevision,
          state: forged,
        },
      }),
    ).rejects.toThrow(/formato v3|conjunto de regras/);
  const event = {
    id: 'forged-history',
    name: 'Fato sintético anterior',
    start: '2026-12-01',
    end: '2026-12-01',
    kind: 'note' as const,
    recordType: 'prior-reference' as const,
    modalities: ['integrado' as const],
  };
  for (const forged of [
    { ...event, kind: 'include' as const },
    { ...event, kind: 'exclude' as const },
    { ...event, recordType: 'event' as const, kind: 'include' as const },
    { ...event, hours: 40, requirementId: 'pedagogical-training' },
    {
      ...event,
      admission: { type: 'transfer' as const, year: 2027, term: 'annual' as const },
      publicationStatus: 'planned' as const,
    },
  ])
    await expect(
      actor.mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version: record.version,
          catalogueRevision: record.catalogueRevision,
          state: { ...record.state, events: [forged] },
        },
      }),
    ).rejects.toThrow();
  const intact = await actor.query(api.calendars.calendar, { id: record.id });
  expect(intact.version).toBe(record.version);
  expect(intact.state.events).toEqual([]);
});

test('a direct inclusion must fall inside the periods of every explicitly covered offer', async () => {
  const { actor, record } = await setup();
  const state = {
    ...record.state,
    organizationByModality: { integrado: 'anual' as const, graduacao: 'semestral' as const },
    periods: [
      {
        id: 'integrated',
        name: 'Ciclo anual',
        start: '2027-02-01',
        end: '2027-12-17',
        association: {
          status: 'defined' as const,
          modalities: ['integrado' as const],
          term: 'annual' as const,
        },
      },
      {
        id: 'undergraduate-first',
        name: 'Primeiro semestre',
        start: '2027-08-02',
        end: '2027-08-31',
        association: {
          status: 'defined' as const,
          modalities: ['graduacao' as const],
          term: 'first' as const,
        },
      },
    ],
  };
  const event = {
    id: 'scoped-inclusion',
    name: 'Inclusão sintética',
    start: '2027-03-01',
    end: '2027-03-01',
    kind: 'include' as const,
    modalities: ['graduacao' as const],
  };
  for (const modalities of [['graduacao' as const], ['integrado' as const, 'graduacao' as const]])
    await expect(
      actor.mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version: record.version,
          catalogueRevision: record.catalogueRevision,
          state: { ...state, events: [{ ...event, modalities }] },
        },
      }),
    ).rejects.toThrow('períodos cadastrados da oferta');
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: record.version,
      catalogueRevision: record.catalogueRevision,
      state: { ...state, events: [{ ...event, modalities: ['integrado'] }] },
    },
  });
  expect(saved.state.events[0].modalities).toEqual(['integrado']);
});

test('legacy v2 reads never rewrite content and concurrent conversion preserves the original snapshot', async () => {
  const { client, actor, record } = await setup();
  const original = await client.run(async (ctx) => {
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique())!;
    const legacy = {
      regime: 'misto' as const,
      weekdays: [],
      weekConfirmed: false,

      assessmentStagesByModality: {},
      secondSemesterIntake: false,
      periods: [
        { id: 'legacy-first', name: 'Período legado', start: '2027-02-01', end: '2027-06-30' },
      ],
      events: [
        {
          id: 'legacy-notice',
          name: 'Edital legado sem classificação',
          start: '2027-01-15',
          end: '2027-01-15',
          kind: 'note' as const,
        },
      ],
    };
    await ctx.db.patch(content._id, { state: legacy });
    return { contentId: content._id, legacy };
  });
  const read = await actor.query(api.calendars.calendar, { id: record.id });
  expect(read.state.schemaVersion).toBe(2);
  expect(read.state.events[0].publicationStatus).toBeUndefined();
  expect((await client.run((ctx) => ctx.db.get(original.contentId)))?.state).toEqual(
    original.legacy,
  );
  const body = {
    version: read.version,
    catalogueRevision: read.currentCatalogueRevision,
    baseAcceptance: inspectCalendar(read, read).identity,
    state: read.state,
  };
  const results = await Promise.allSettled([
    actor.mutation(api.calendars.saveCalendar, { id: record.id, body }),
    actor.mutation(api.calendars.saveCalendar, { id: record.id, body }),
  ]);
  expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
  const saved = await actor.query(api.calendars.calendar, { id: record.id });
  expect(saved.state.schemaVersion).toBe(3);
  expect(saved.state.regime).toBe('a-classificar');
  expect(saved.state.organizationByModality).toEqual({
    integrado: 'a-classificar',
    graduacao: 'a-classificar',
  });
  expect(saved.state.periods[0]).toMatchObject({
    id: 'legacy-first',
    start: '2027-02-01',
    end: '2027-06-30',
    association: { status: 'a-classificar' },
  });
  expect(saved.state.events[0]).toMatchObject(original.legacy.events[0]);
  expect(saved.state.events[0].admission).toBeUndefined();
  expect(saved.state.conversion?.legacySecondSemesterIntake).toBe(false);
  const historical = await actor.query(api.calendars.calendarVersion, {
    id: record.id,
    version: read.version,
  });
  expect(historical.state).toEqual(read.state);
  expect(historical.state.schemaVersion).toBe(2);
});

test('a legacy review cannot certify the 2027 rules or export without reevaluating the new criteria', async () => {
  const { client, asClient, ids, record } = await setup();
  const admin = asClient('admin');
  const legacy = {
    calendarId: record.id,
    calendarVersion: record.version,
    catalogueRevision: record.catalogueRevision,
    revision: 1,
    source: 'SEI 3959640',
    documentSnapshot: [],
    entries: reviewCriteria.map((criterion) => ({
      id: criterion.id,
      status: 'ATENDIDO' as const,
      reviewed: true,
      notes: 'Conferência antiga preservada',
    })),
    conclusion: 'Conclusão antiga preservada',
    processNumber: '',
    applicableNorm: 'Norma anterior',
    reviewer: { id: ids.users.admin, name: 'Admin' },
    updatedAt: 1,
  };
  const reviewId = await client.run((ctx) => ctx.db.insert('reviews', legacy));
  const support = await admin.query(api.reviews.review, { id: record.id });
  expect(support.stale).toBe(true);
  expect(support.review?.entries).toEqual(legacy.entries);
  expect((await client.run((ctx) => ctx.db.get(reviewId)))?.entries).toEqual(legacy.entries);
  await expect(
    admin.query(api.reviews.exportReview, { id: record.id, revision: 1 }),
  ).rejects.toThrow('desatualizada');
  const body = {
    revision: 1,
    calendarVersion: record.version,
    catalogueRevision: record.catalogueRevision,
    baseIdentity: support.baseIdentity,
    acknowledgeStale: true,
    entries: legacy.entries,
    conclusion: legacy.conclusion,
  };
  await expect(admin.mutation(api.reviews.saveReview, { id: record.id, body })).rejects.toThrow(
    'conjunto de regras',
  );
  await expect(
    admin.mutation(api.reviews.saveReview, {
      id: record.id,
      body: { ...body, rulesetVersion: support.rulesetVersion },
    }),
  ).rejects.toThrow('todos os critérios');
  for (const baseIdentity of [undefined, 'forged'])
    await expect(
      admin.mutation(api.reviews.saveReview, {
        id: record.id,
        body: { ...body, rulesetVersion: support.rulesetVersion, baseIdentity },
      }),
    ).rejects.toThrow('identidade da base');
  expect((await client.run((ctx) => ctx.db.get(reviewId)))?.entries).toEqual(legacy.entries);
});

test('backend rejects an assessment stage outside its offer period without saving any part of the change', async () => {
  const { actor, record } = await setup();
  const valid = {
    ...record.state,
    regime: 'anual' as const,
    organizationByModality: { integrado: 'anual' as const, graduacao: 'anual' as const },
    assessmentStagesByModality: { integrado: 2 as const },
    periods: [
      {
        id: 'integrated-year',
        name: 'Ano integrado',
        start: '2027-03-01',
        end: '2027-03-26',
        association: {
          status: 'defined' as const,
          modalities: ['integrado' as const],
          term: 'annual' as const,
        },
      },
    ],
    events: [
      {
        id: 'integrated-stage-1',
        name: '1ª etapa',
        requirementId: 'stage-1:integrado',
        modalities: ['integrado' as const],
        start: '2027-03-01',
        end: '2027-03-12',
        kind: 'note' as const,
        category: 'limite',
      },
      {
        id: 'integrated-stage-2',
        name: '2ª etapa',
        requirementId: 'stage-2:integrado',
        modalities: ['integrado' as const],
        start: '2027-03-15',
        end: '2027-03-26',
        kind: 'note' as const,
        category: 'limite',
      },
    ],
  };
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: { version: record.version, catalogueRevision: record.catalogueRevision, state: valid },
  });
  for (const changed of [
    {
      ...saved.state,
      periods: saved.state.periods.map((period) => ({ ...period, start: '2027-03-08' })),
    },
    {
      ...saved.state,
      periods: saved.state.periods.map((period) => ({ ...period, end: '2027-03-20' })),
    },
    {
      ...saved.state,
      periods: saved.state.periods.map((period) => ({
        ...period,
        association: {
          status: 'defined' as const,
          modalities: ['graduacao' as const],
          term: 'annual' as const,
        },
      })),
    },
    {
      ...saved.state,
      weekConfirmed: true,
      weekdays: [1, 2, 3, 4, 5],
      periods: saved.state.periods.map((period) => ({ ...period, targetDays: 2 })),
    },
  ]) {
    await expect(
      actor.mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version: saved.version,
          catalogueRevision: record.catalogueRevision,
          state: changed,
        },
      }),
    ).rejects.toThrow(/etapa.*período/i);
    const intact = await actor.query(api.calendars.calendar, { id: record.id });
    expect(intact.version).toBe(saved.version);
    expect(intact.state.periods).toEqual(saved.state.periods);
    expect(intact.state.events).toEqual(saved.state.events);
  }
  const next = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: saved.version,
      catalogueRevision: record.catalogueRevision,
      state: {
        ...saved.state,
        periods: saved.state.periods.map((period) => ({ ...period, start: '2027-03-08' })),
        events: saved.state.events.map((event) =>
          event.id === 'integrated-stage-1' ? { ...event, start: '2027-03-08' } : event,
        ),
      },
    },
  });
  expect(next.version).toBe(saved.version + 1);
  expect(next.state.periods[0].start).toBe('2027-03-08');
  expect(next.state.events[0].start).toBe('2027-03-08');
});
