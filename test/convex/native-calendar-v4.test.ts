import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { DomainState } from '../../convex/validators.ts';
import type { CalendarContentV4, CalendarOffer } from '../../src/domain/calendar/model.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, preserveSubmission, seedCourses } from '../helpers/lifecycle.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { reviewCriteria } from '../../src/domain/reviews/criteria.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { initialCatalogue } from '../../src/domain/institution/catalogue.ts';
import { teacherDayId } from '../fixtures/observances.ts';

async function setup() {
  const fixture = await createNativeFixture();
  const actor = fixture.asClient('campus-a');
  const record = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [
          { kind: 'integrado', organization: 'a-classificar' },
          { kind: 'graduacao', organization: 'a-classificar' },
        ],
      },
    })
    .then(calendarRecordDates);
  await seedCourses(fixture, record.id);
  return { ...fixture, actor, record };
}

test.each(['anual', 'semestral', 'a-classificar'] as const)(
  'creation preserves organization %s and leaves later editor decisions undefined',
  async (organization) => {
    const { asClient, ids } = await createNativeFixture();
    const record = await asClient('campus-a')
      .mutation(api.calendars.createCalendar, {
        body: {
          campusId: ids.campuses.a,
          year: 2027,
          offers: [
            { kind: 'integrado', organization },
            { kind: 'graduacao', organization },
          ],
        },
      })
      .then(calendarRecordDates);
    expect(record.state.offers.map((offer) => offer.organization)).toEqual([
      organization,
      organization,
    ]);
    expect(
      record.state.offers.every(
        (offer) => offer.delivery === 'presencial' && !offer.stages && !offer.scope,
      ),
    ).toBe(true);
    expect(record.state.schemaVersion).toBe(4);
    for (const field of ['offer', 'modalities', 'regime', 'organizationByModality', 'conversion'])
      expect(record.state).not.toHaveProperty(field);
    expect(
      (
        await asClient('campus-a')
          .query(api.calendars.calendar, { id: record.id })
          .then(calendarRecordDates)
      ).state,
    ).toEqual(record.state);
  },
);

test('v4 round-trip preserves independent organization, intake, actual dates and intended admission', async () => {
  const { actor, record, ...fixture } = await setup();
  const state: DomainState = {
    ...record.state,
    offers: record.state.offers.map((offer): DomainState['offers'][number] => ({
      ...offer,
      organization: offer.kind === 'integrado' ? 'anual' : 'semestral',
      intake:
        offer.kind === 'integrado'
          ? { annual: { status: 'unknown' } }
          : { first: { status: 'yes', required: true }, second: { status: 'no' } },
    })),
    periods: [
      {
        id: 'integrated-year',
        name: 'Ciclo anual',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      {
        id: 'undergraduate-first',
        name: 'Primeiro semestre',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-06-30'),
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
      {
        id: 'undergraduate-second',
        name: 'Segundo semestre',
        start: civilDate('2027-08-02'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['graduacao'], term: 'second' },
      },
    ],
    events: [
      {
        id: 'previous-publication',
        name: 'Publicação sintética de 2026',
        start: civilDate('2026-12-10'),
        end: civilDate('2026-12-10'),
        kind: 'note',
        publicationStatus: 'published',
        admission: { type: 'transfer', year: 2027, term: 'first', periodId: 'undergraduate-first' },
        offers: ['graduacao'],
      },
      {
        id: 'future-admission',
        name: 'Previsão sintética para ingresso 2028',
        start: civilDate('2027-12-01'),
        end: civilDate('2027-12-01'),
        kind: 'note',
        recordType: 'event',
        publicationStatus: 'planned',
        admission: { type: 'regular', year: 2028, term: 'annual' },
        deadlineAdjustment: { date: civilDate('2027-12-15'), reviewed: false },
        offers: ['integrado'],
      },
    ],
  };
  const submitted = await preserveSubmission(fixture, record.id);
  const saved = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: { version: record.version, catalogueRevision: record.catalogueRevision, state },
    })
    .then(calendarSaveDates);
  const loaded = await actor
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  expect(loaded.state.events).toEqual(saved.state.events);
  expect(loaded.state.events[0]).toMatchObject({
    start: civilDate('2026-12-10'),
    publicationStatus: 'published',
    admission: { year: 2027, periodId: 'undergraduate-first' },
  });
  expect(loaded.state.events[1]).toMatchObject({
    publicationStatus: 'planned',
    admission: { year: 2028 },
  });
  expect(loaded.state.offers).toEqual(state.offers);
  expect(loaded.state.periods).toEqual(state.periods);
  expect((await submitted()).state).toEqual(record.state);
});

test('a save cannot silently adopt another ruleset or change history', async () => {
  const { actor, client, record } = await setup();
  for (const rulesetVersion of [undefined, 'forged'])
    await expect(
      actor
        .mutation(api.calendars.saveCalendar, {
          id: record.id,
          body: {
            version: record.version,
            catalogueRevision: record.catalogueRevision,
            state: { ...record.state, rulesetVersion },
          },
        })
        .then(calendarSaveDates),
    ).rejects.toThrow('conjunto de regras');
  expect(
    (await actor.query(api.calendars.calendar, { id: record.id }).then(calendarRecordDates)).state,
  ).toEqual(record.state);
  expect(await client.run((ctx) => ctx.db.query('calendarSubmissions').take(10))).toEqual([]);
});

test('direct backend writes retain temporal and offer-scope validation', async () => {
  const { actor, record } = await setup();
  const event = {
    id: 'forged-history',
    name: 'Fato sintético anterior',
    start: civilDate('2026-12-01'),
    end: civilDate('2026-12-01'),
    kind: 'note' as const,
    offers: ['integrado'],
  };
  for (const forged of [
    { ...event, kind: 'include' as const },
    { ...event, kind: 'exclude' as const },
    { ...event, recordType: 'event' as const, kind: 'include' as const },
    { ...event, hours: 40, requirementId: 'pedagogical-training' },
    {
      ...event,
      admission: { type: 'transfer' as const, year: 2027, term: 'annual' as const },
      publicationStatus: undefined,
    },
  ])
    await expect(
      actor
        .mutation(api.calendars.saveCalendar, {
          id: record.id,
          body: {
            version: record.version,
            catalogueRevision: record.catalogueRevision,
            state: { ...record.state, events: [forged] },
          },
        })
        .then(calendarSaveDates),
    ).rejects.toThrow();
  expect(
    (await actor.query(api.calendars.calendar, { id: record.id }).then(calendarRecordDates))
      .version,
  ).toBe(record.version);
});

test('a direct inclusion must fit every explicitly covered offer period', async () => {
  const { actor, record } = await setup();
  const state: DomainState = {
    ...record.state,
    offers: record.state.offers.map((offer) => ({
      ...offer,
      organization: offer.kind === 'integrado' ? 'anual' : 'semestral',
    })),
    periods: [
      {
        id: 'integrated',
        name: 'Ciclo anual',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      {
        id: 'undergraduate-first',
        name: 'Primeiro semestre',
        start: civilDate('2027-08-02'),
        end: civilDate('2027-08-31'),
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
    ],
  };
  const event = {
    id: 'scoped-inclusion',
    name: 'Inclusão sintética',
    start: civilDate('2027-03-01'),
    end: civilDate('2027-03-01'),
    kind: 'include' as const,
  };
  for (const offers of [['graduacao'], ['integrado', 'graduacao']])
    await expect(
      actor
        .mutation(api.calendars.saveCalendar, {
          id: record.id,
          body: {
            version: record.version,
            catalogueRevision: record.catalogueRevision,
            state: { ...state, events: [{ ...event, offers }] },
          },
        })
        .then(calendarSaveDates),
    ).rejects.toThrow('períodos cadastrados da oferta');
  const saved = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: record.version,
        catalogueRevision: record.catalogueRevision,
        state: { ...state, events: [{ ...event, offers: ['integrado'] }] },
      },
    })
    .then(calendarSaveDates);
  expect(saved.state.events[0].offers).toEqual(['integrado']);
});

test('a legacy review without submission cannot certify current rules or export without reevaluating the criteria', async () => {
  const { client, asClient, ids, record } = await setup(),
    admin = asClient('admin');
  await act(admin, record.id, 'submit');
  const prior = {
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
  const id = await client.run((ctx) => ctx.db.insert('reviews', prior));
  const support = await admin.query(api.reviews.review, { id: record.id });
  expect(support.stale).toBe(true);
  expect(support.review?.entries).toEqual(prior.entries);
  await expect(
    admin.query(api.reviews.exportReview, { id: record.id, revision: 1 }),
  ).rejects.toThrow('O parecer está desatualizado. Reabra, confira e salve antes de exportar.');
  expect(support.review).not.toHaveProperty('submissionId');
  const body = {
    revision: 1,
    calendarVersion: record.version,
    catalogueRevision: record.catalogueRevision,
    baseIdentity: support.baseIdentity,
    submissionId: support.submission!.id,
    acknowledgeStale: true,
    entries: prior.entries,
    conclusion: prior.conclusion,
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
  expect((await client.run((ctx) => ctx.db.get(id)))?.entries).toEqual(prior.entries);
});

function oneOffer(
  source: string,
  organization: 'anual' | 'semestral',
  perTerm: number,
): CalendarContentV4 & { year: number; campus: string } {
  const fixture = calendarOffersV4Fixture();
  const old = fixture.offers.find((offer) => offer.id === source)!;
  const offers: CalendarOffer[] = [
    { ...old, id: 'graduacao', kind: 'graduacao', organization, stages: { perTerm } },
  ];
  return {
    ...fixture,
    offers,
    periods: fixture.periods
      .filter(
        (period) =>
          period.association.status === 'defined' && period.association.offers.includes(source),
      )
      .map((period) => ({
        ...period,
        id: period.id.replace(source, 'graduacao'),
        association: { ...period.association, offers: ['graduacao'] },
      })),
    events: fixture.events
      .filter((event) => event.offers?.includes(source))
      .map((event) => ({
        ...event,
        id: event.id.replace(source, 'graduacao'),
        offers: ['graduacao'],
        requirementId: event.requirementId?.replace(`:${source}`, ':graduacao'),
      })),
  };
}

test.each(['annual', 'semester', 'trimester', 'three'] as const)(
  'acceptance: %s undergraduate offers save and reload with independent configuration',
  async (mode) => {
    const fixture = await createNativeFixture({
        catalogue: {
          revision: 1,
          events: [
            {
              id: 'undergraduate',
              name: 'Evento institucional da graduação',
              start: civilDate('2027-05-04'),
              end: civilDate('2027-05-04'),
              kind: 'note',
              category: 'evento',
              evidence: 'Fonte sintética',
              modalities: ['graduacao'],
              active: true,
            },
          ],
        },
      }),
      actor = fixture.asClient('campus-a');
    const reference =
      mode === 'annual'
        ? oneOffer('integrado', 'anual', 4)
        : mode === 'semester'
          ? oneOffer('graduacao-2', 'semestral', 2)
          : mode === 'trimester'
            ? oneOffer('graduacao', 'anual', 3)
            : calendarOffersV4Fixture();
    if (mode === 'three') {
      reference.offers = reference.offers.filter((offer) => offer.kind === 'graduacao');
      reference.periods = reference.periods.filter(
        (period) =>
          period.association.status !== 'defined' ||
          !period.association.offers.includes('integrado'),
      );
      reference.events = reference.events.filter((event) => !event.offers?.includes('integrado'));
    }
    const created = await actor
      .mutation(api.calendars.createCalendar, {
        body: {
          campusId: fixture.ids.campuses.a,
          year: 2027,
          offers: reference.offers.map(({ kind, organization, label }) => ({
            kind,
            organization,
            label,
          })),
        },
      })
      .then(calendarRecordDates);
    const state = { ...reference, campus: created.state.campus } as DomainState;
    const saved = await actor
      .mutation(api.calendars.saveCalendar, {
        id: created.id,
        body: { version: created.version, catalogueRevision: created.catalogueRevision, state },
      })
      .then(calendarSaveDates);
    const loaded = await actor
      .query(api.calendars.calendar, { id: created.id })
      .then(calendarRecordDates);
    expect(loaded.state).toEqual(saved.state);
    expect(loaded.state.offers).toEqual(reference.offers);
    expect(loaded.state.periods).toEqual(reference.periods);
    expect(
      loaded.state.events.map((event) => [event.id, event.requirementId, event.start, event.end]),
    ).toEqual(
      reference.events.map((event) => [event.id, event.requirementId, event.start, event.end]),
    );
    const institutional = loaded.institutionalEvents.find(
      (event) => event.id === 'inst:undergraduate',
    );
    expect(institutional?.offers).toEqual(reference.offers.map((offer) => offer.id));
    expect(loaded.offerKinds).toEqual(['graduacao']);
    if (mode === 'three')
      expect(activityChecklist(loaded.state).some((row) => row.id === 'stage-4:graduacao-2')).toBe(
        true,
      );
  },
);

test('backend rejects a newly moved stage in the wrong semester but preserves unchanged inconsistent migrated evidence', async () => {
  const fixture = await createNativeFixture(),
    actor = fixture.asClient('campus-a');
  const reference = oneOffer('graduacao-2', 'semestral', 2);
  const record = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'graduacao', organization: 'semestral' }],
      },
    })
    .then(calendarRecordDates);
  const saved = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: record.version,
        catalogueRevision: record.catalogueRevision,
        state: { ...reference, campus: record.state.campus } as DomainState,
      },
    })
    .then(calendarSaveDates);
  const bad = {
    ...saved.state,
    events: saved.state.events.map((event) =>
      event.requirementId === 'stage-3:graduacao'
        ? { ...event, start: civilDate('2027-02-01'), end: civilDate('2027-04-16') }
        : event,
    ),
  };
  await expect(
    actor
      .mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: { version: saved.version, catalogueRevision: record.catalogueRevision, state: bad },
      })
      .then(calendarSaveDates),
  ).rejects.toThrow('2º semestre');
  await fixture.client.run(async (ctx) => {
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique())!;
    const { year: _year, campus: _campus, ...state } = bad;
    await ctx.db.patch(content._id, { state });
  });
  const migrated = await actor
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  const unrelated = {
    id: 'note',
    name: 'Ajuste em outra parte',
    start: civilDate('2027-06-01'),
    end: civilDate('2027-06-01'),
    kind: 'note' as const,
    offers: ['graduacao'],
  };
  const kept = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: migrated.version,
        catalogueRevision: migrated.catalogueRevision,
        state: { ...migrated.state, events: [...migrated.state.events, unrelated] },
      },
    })
    .then(calendarSaveDates);
  expect(kept.state.events.find((event) => event.requirementId === 'stage-3:graduacao')).toEqual(
    bad.events.find((event) => event.requirementId === 'stage-3:graduacao'),
  );
  expect(kept.readiness.issues.join(' ')).toContain('2º semestre');
});

test('creation enforces labels and the twelve-offer limit before creating any record', async () => {
  const fixture = await createNativeFixture(),
    actor = fixture.asClient('campus-a');
  const repeated = Array.from({ length: 13 }, (_, index) => ({
    kind: 'graduacao' as const,
    organization: 'anual' as const,
    label: `Curso ${index + 1}`,
  }));
  for (const offers of [
    [],
    [
      { kind: 'graduacao' as const, organization: 'anual' as const },
      { kind: 'graduacao' as const, organization: 'semestral' as const },
    ],
    [
      { kind: 'graduacao' as const, organization: 'anual' as const, label: 'Mesmo nome' },
      { kind: 'integrado' as const, organization: 'anual' as const, label: 'Mesmo nome' },
    ],
    repeated,
  ])
    await expect(
      actor
        .mutation(api.calendars.createCalendar, {
          body: { campusId: fixture.ids.campuses.a, year: 2027, offers },
        })
        .then(calendarRecordDates),
    ).rejects.toThrow();
  expect(await fixture.client.run((ctx) => ctx.db.query('calendars').take(20))).toHaveLength(0);
  const created = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: repeated.slice(0, 12),
      },
    })
    .then(calendarRecordDates);
  expect(created.state.offers.map((offer) => offer.id)).toEqual([
    'graduacao',
    ...Array.from({ length: 11 }, (_, index) => `graduacao-${index + 2}`),
  ]);
});

test('removing the observance choice restores the institutional date', async () => {
  const catalogue = initialCatalogue();
  const fixture = await createNativeFixture({
      catalogue: { ...catalogue, events: catalogue.events.map((event) => ({ ...event })) },
    }),
    actor = fixture.asClient('campus-a');
  const record = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  const saved = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: record.version,
        catalogueRevision: record.catalogueRevision,
        state: { ...record.state, observanceDates: { 'teacher-day': civilDate('2027-10-16') } },
      },
    })
    .then(calendarSaveDates);
  expect(saved.base.events.find((event) => event.id === teacherDayId)?.start).toBe('2027-10-16');
  const cleared = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: saved.version,
        catalogueRevision: record.catalogueRevision,
        state: { ...saved.state, observanceDates: undefined },
      },
    })
    .then(calendarSaveDates);
  expect(cleared.state).not.toHaveProperty('observanceDates');
  expect(cleared.base.events.find((event) => event.id === teacherDayId)?.start).toBe('2027-10-15');
  const content = await fixture.client.run((ctx) =>
    ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique(),
  );
  expect(content?.state).not.toHaveProperty('observanceDates');
});

test('saving an impossible civil date returns the public validation error and leaves the record intact', async () => {
  const { actor, record } = await setup();
  const proposed = {
    ...record.state,
    periods: [
      {
        id: 'invalid-date',
        name: 'Período inválido',
        start: '2027-02-30',
        end: '2027-03-01',
        association: { status: 'a-classificar' as const },
      },
    ],
  };
  await expect(
    actor.mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: record.version,
        catalogueRevision: record.catalogueRevision,
        state: proposed,
      },
    }),
  ).rejects.toThrow('Data civil do calendário inválida.');
  const unchanged = await actor.query(api.calendars.calendar, { id: record.id });
  expect(unchanged.version).toBe(record.version);
  expect(unchanged.state).toEqual(record.state);
});

test('a calendar saved with empty optional vacation fields still opens, reviews and saves', async () => {
  const { actor, record, client, asClient } = await setup();
  const vacations = {
    firstStart: '2027-01-02',
    firstEnd: '2027-01-31',
    secondStart: '',
    secondEnd: '',
    thirdStart: '',
    thirdEnd: '',
  };
  await client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique();
    if (!content) throw new Error('Conteúdo esperado.');
    await ctx.db.patch(content._id, { state: { ...content.state, teacherVacations: vacations } });
  });
  const loaded = await actor.query(api.calendars.calendar, { id: record.id });
  expect(loaded.state.teacherVacations).toEqual({
    firstStart: '2027-01-02',
    firstEnd: '2027-01-31',
  });
  const reviewer = await asClient('admin').query(api.reviews.review, { id: record.id });
  expect(reviewer.calendar.version).toBe(record.version);
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: loaded.version,
      catalogueRevision: loaded.catalogueRevision,
      state: { ...loaded.state, teacherVacations: vacations },
    },
  });
  const expected = { firstStart: '2027-01-02', firstEnd: '2027-01-31' };
  expect(saved.state.teacherVacations).toEqual(expected);
  const stored = await client.run((ctx) =>
    ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique(),
  );
  expect(stored?.state.teacherVacations).toEqual(expected);
});
