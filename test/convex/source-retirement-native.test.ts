import { expect, test } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { calendarOffer } from '../../convex/validators.ts';
import { saveInput } from '../../convex/contracts.ts';
import type { DomainState, historicalState } from '../../convex/validators.ts';
import type { Infer } from 'convex/values';
import { createNativeFixture } from '../helpers/native-database.ts';

const secret = 'Fonte manual que não pertence ao contrato';
const oldSave = makeFunctionReference<
  'mutation',
  { id: Id<'calendars'>; body: Record<string, unknown> },
  unknown
>('calendars:saveCalendar');

function assertSourceFree(state: Infer<typeof historicalState>) {
  expect(state).not.toHaveProperty('weekEvidence');
  expect(state.teacherVacations ?? {}).not.toHaveProperty('evidence');
  for (const offer of state.offers) {
    expect(offer.scope ?? {}).not.toHaveProperty('source');
    for (const entry of Object.values(offer.intake ?? {}))
      expect(entry).not.toHaveProperty('source');
  }
  for (const event of state.events) {
    expect(event).not.toHaveProperty('evidence');
    expect(event.deadlineAdjustment ?? {}).not.toHaveProperty('evidence');
  }
  expect(JSON.stringify(state)).not.toContain('registro:');
}

async function createRecord() {
  const fixture = await createNativeFixture({
    catalogue: {
      revision: 1,
      events: [
        {
          id: 'holiday',
          name: 'Feriado institucional',
          start: '2027-04-21',
          end: '2027-04-21',
          kind: 'exclude',
          category: 'feriado',
          modalities: ['integrado'],
          evidence: 'Referência institucional preservada',
          active: true,
        },
      ],
    },
  });
  const actor = fixture.asClient('campus-a');
  const created = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
      courses: 'Sintético',
      purpose: 'test',
    },
  });
  return { fixture, actor, created };
}

test('canonical records and historical restoration have no manual or generated source slots', async () => {
  const { fixture, actor, created } = await createRecord();
  assertSourceFree(created.state);
  expect(
    created.institutionalSnapshot.some(
      (event) => event.evidence === 'Referência institucional preservada',
    ),
  ).toBe(true);
  const state: DomainState = {
    ...created.state,
    weekConfirmed: true,
    weekdays: [1, 2, 3, 4, 5],
    offers: created.state.offers.map((offer) => ({
      ...offer,
      scope: { status: 'covered' },
      intake: { annual: { status: 'yes', required: true } },
    })),
    teacherVacations: { firstStart: '2027-01-04', firstEnd: '2027-01-15' },
    periods: [
      {
        id: 'annual',
        name: 'Anual',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
    ],
    events: [
      {
        id: 'notice',
        name: 'Edital',
        start: '2027-07-01',
        end: '2027-07-10',
        kind: 'note',
        offers: ['integrado'],
        requirementId: 'regular-admission-notice',
        publicationStatus: 'planned',
        admission: { type: 'regular', year: 2028, term: 'annual' },
        deadlineAdjustment: { date: '2027-07-20', reviewed: false },
      },
      {
        id: 'retired-stage',
        name: 'Etapa excedente',
        start: '2027-03-01',
        end: '2027-03-02',
        kind: 'note',
        offers: ['integrado'],
        recordType: 'retired-stage',
      },
    ],
  };
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: { version: created.version, catalogueRevision: created.currentCatalogueRevision, state },
  });
  assertSourceFree(saved.state);
  expect(saved.state.events.find((event) => event.id === 'retired-stage')?.recordType).toBe(
    'retired-stage',
  );
  const unchanged = await actor.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: saved.version,
      catalogueRevision: created.currentCatalogueRevision,
      state: saved.state,
    },
  });
  expect(unchanged.unchanged).toBe(true);
  expect(unchanged.version).toBe(saved.version);
  const initial = await actor.query(api.calendars.calendarVersion, {
    id: created.id,
    version: created.version,
  });
  assertSourceFree(initial.state);
  await actor.mutation(api.calendars.saveCalendar, {
    id: created.id,
    body: {
      version: saved.version,
      catalogueRevision: created.currentCatalogueRevision,
      state: initial.state,
    },
  });
  const raw = await fixture.client.run(async (ctx) => ({
    contents: await ctx.db.query('calendarContents').take(10),
    snapshots: await ctx.db.query('calendarSnapshots').take(10),
  }));
  for (const row of raw.snapshots) assertSourceFree(row.state);
  expect(JSON.stringify(raw)).not.toContain('registro:');
  expect(raw.contents[0].institutionalSnapshot).toEqual(created.institutionalSnapshot);
});

const event = { id: 'note', name: 'Nota', start: '2027-03-01', end: '2027-03-01', kind: 'note' };
const legacyFields: Array<[string, (state: DomainState) => Record<string, unknown>]> = [
  ['weekEvidence', (state) => ({ ...state, weekEvidence: secret })],
  ['events.evidence', (state) => ({ ...state, events: [{ ...event, evidence: secret }] })],
  [
    'deadlineAdjustment.evidence',
    (state) => ({
      ...state,
      events: [
        { ...event, deadlineAdjustment: { date: '2027-03-02', reviewed: false, evidence: secret } },
      ],
    }),
  ],
  [
    'teacherVacations.evidence',
    (state) => ({
      ...state,
      teacherVacations: { firstStart: '2027-01-04', firstEnd: '2027-01-15', evidence: secret },
    }),
  ],
  [
    'offers.scope.source',
    (state) => ({
      ...state,
      offers: state.offers.map((offer) => ({
        ...offer,
        scope: { status: 'covered', source: secret },
      })),
    }),
  ],
];

test.each(legacyFields)(
  'the canonical API refuses the retired field %s before saving',
  async (_name, legacyState) => {
    const { fixture, actor, created } = await createRecord();
    await expect(
      actor.mutation(oldSave, {
        id: created.id,
        body: {
          version: created.version,
          catalogueRevision: created.currentCatalogueRevision,
          state: legacyState(created.state),
        },
      }),
    ).rejects.toThrow(/Unexpected field|Expected/);
    const raw = await fixture.client.run(async (ctx) => ({
      calendar: await ctx.db.get(created.id),
      snapshots: await ctx.db.query('calendarSnapshots').take(10),
    }));
    expect(raw.calendar?.version).toBe(created.version);
    expect(raw.snapshots).toHaveLength(0);
    assertSourceFree((await actor.query(api.calendars.calendar, { id: created.id })).state);
  },
);

// convex-test 0.0.64 does not recurse through v.record validators. Inspect the
// real published validator instead of changing production code for that mock gap.
test('nested intake records have no source slot in storage or public input', () => {
  const stored = calendarOffer.fields.intake.value.fields;
  const submitted = saveInput.fields.state.fields.offers.element.fields.intake.value.fields;
  expect(Object.keys(stored)).toEqual(['status', 'required']);
  expect(Object.keys(submitted)).toEqual(['status', 'required']);
});

test('current contents and historical storage refuse retired manual fields', async () => {
  const { fixture, created } = await createRecord();
  await expect(
    fixture.client.run(async (ctx) => {
      const row = (await ctx.db
        .query('calendarContents')
        .withIndex('by_calendarId', (q) => q.eq('calendarId', created.id))
        .unique())!;
      const invalid = { ...row.state, weekEvidence: secret };
      await ctx.db.patch(row._id, { state: invalid });
    }),
  ).rejects.toThrow(/Unexpected field|Expected/);
  await expect(
    fixture.client.run(async (ctx) => {
      const invalid = {
        ...created.state,
        events: [
          {
            id: 'note',
            name: 'Nota',
            start: '2027-03-01',
            end: '2027-03-01',
            kind: 'note' as const,
            evidence: secret,
          },
        ],
      };
      await ctx.db.insert('calendarSnapshots', {
        state: invalid,
        at: Date.now(),
        catalogueRevision: created.catalogueRevision,
        institutionalEvents: created.institutionalSnapshot,
        documentSnapshot: [],
      });
    }),
  ).rejects.toThrow(/Unexpected field|Expected/);
});
