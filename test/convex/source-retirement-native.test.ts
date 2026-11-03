import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { onceLink } from '../helpers/activity-links.ts';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { calendarOffer } from '../../convex/validators.ts';
import { saveInput } from '../../convex/contracts.ts';
import type { DomainState, domainState } from '../../convex/validators.ts';
import type { Infer } from 'convex/values';
import { preserveSubmission } from '../helpers/lifecycle.ts';
import { createNativeFixture } from '../helpers/native-database.ts';

const secret = 'Fonte manual que não pertence ao contrato';
const oldSave = makeFunctionReference<
  'mutation',
  { id: Id<'calendars'>; body: Record<string, unknown> },
  unknown
>('calendars:saveCalendar');

function assertSourceFree(state: Infer<typeof domainState>) {
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
          start: civilDate('2027-04-21'),
          end: civilDate('2027-04-21'),
          effect: 'exclude',
          category: 'feriado',
          modalities: ['integrado'],
          evidence: 'Referência institucional preservada',
          active: true,
        },
      ],
    },
  });
  const actor = fixture.asClient('campus-a');
  const created = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  return { fixture, actor, created };
}

test('canonical records and historical restoration have no manual or generated source slots', async () => {
  const { fixture, actor, created } = await createRecord();
  assertSourceFree(created.state);
  const submitted = await preserveSubmission(fixture, created.id);
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
    teacherVacations: { firstStart: civilDate('2027-01-04'), firstEnd: civilDate('2027-01-15') },
    periods: [
      {
        id: 'annual',
        name: 'Anual',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
    ],
    events: [
      {
        id: 'notice',
        name: 'Edital',
        start: civilDate('2027-07-01'),
        end: civilDate('2027-07-10'),
        effect: 'note',
        scope: { offers: ['integrado'], confirmed: true },
        activity: onceLink('regular-admission-notice'),
        notice: {
          publication: 'planned',
          admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
        },
        deadlineAdjustment: { date: civilDate('2027-07-20'), reviewed: false },
      },
      {
        id: 'detached-stage',
        name: 'Etapa excedente',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-02'),
        effect: 'note',
        scope: { offers: ['integrado'], confirmed: true },
      },
    ],
  };
  const saved = await actor
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: created.version,
        catalogueRevision: created.currentCatalogueRevision,
        state,
      },
    })
    .then(calendarSaveDates);
  assertSourceFree(saved.state);
  expect(saved.state.events.find((event) => event.id === 'detached-stage')).toMatchObject({
    effect: 'note',
    start: civilDate('2027-03-01'),
    end: civilDate('2027-03-02'),
  });
  const unchanged = await actor
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: saved.version,
        catalogueRevision: created.currentCatalogueRevision,
        state: saved.state,
      },
    })
    .then(calendarSaveDates);
  expect(unchanged.unchanged).toBe(true);
  expect(unchanged.version).toBe(saved.version);
  const initial = await submitted();
  assertSourceFree(initial.state);
  await actor
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: saved.version,
        catalogueRevision: created.currentCatalogueRevision,
        state: initial.state,
      },
    })
    .then(calendarSaveDates);
  const raw = await fixture.client.run(async (ctx) => ({
    contents: await ctx.db.query('calendarContents').take(10),
    submissions: await ctx.db.query('calendarSubmissions').take(10),
  }));
  for (const row of raw.submissions) assertSourceFree({ ...row.state, year: 2027, campus: 'A' });
  expect(JSON.stringify(raw)).not.toContain('registro:');
  expect(raw.contents[0].institutionalSnapshot).toEqual(created.institutionalSnapshot);
});

const event = {
  id: 'note',
  name: 'Nota',
  start: civilDate('2027-03-01'),
  end: civilDate('2027-03-01'),
  effect: 'note',
  scope: { offers: ['integrado'], confirmed: true },
};
const legacyFields: Array<[string, (state: DomainState) => Record<string, unknown>]> = [
  ['weekEvidence', (state) => ({ ...state, weekEvidence: secret })],
  ['events.evidence', (state) => ({ ...state, events: [{ ...event, evidence: secret }] })],
  [
    'deadlineAdjustment.evidence',
    (state) => ({
      ...state,
      events: [
        {
          ...event,
          deadlineAdjustment: { date: civilDate('2027-03-02'), reviewed: false, evidence: secret },
        },
      ],
    }),
  ],
  [
    'teacherVacations.evidence',
    (state) => ({
      ...state,
      teacherVacations: {
        firstStart: civilDate('2027-01-04'),
        firstEnd: civilDate('2027-01-15'),
        evidence: secret,
      },
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
      submissions: await ctx.db.query('calendarSubmissions').take(10),
    }));
    expect(raw.calendar?.version).toBe(created.version);
    expect(raw.submissions).toHaveLength(0);
    assertSourceFree(
      (await actor.query(api.calendars.calendar, { id: created.id }).then(calendarRecordDates))
        .state,
    );
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

test('current contents and submission copies refuse retired manual fields', async () => {
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
      const { year: _year, campus: _campus, ...content } = created.state;
      const invalid = {
        ...content,
        events: [
          {
            id: 'note',
            name: 'Nota',
            start: civilDate('2027-03-01'),
            end: civilDate('2027-03-01'),
            effect: 'note' as const,
            scope: { offers: ['integrado'], confirmed: true },
            evidence: secret,
          },
        ],
      };
      const user = (await ctx.db.query('users').first())!;
      await ctx.db.insert('calendarSubmissions', {
        calendarId: created.id,
        sequence: 1,
        submittedAt: Date.now(),
        submittedBy: { id: user._id, name: user.name },
        submittedFrom: 'rascunho',
        contentVersion: created.version,
        contentHash: '0'.repeat(64),
        state: invalid,
        catalogueRevision: created.catalogueRevision,
        institutionalSnapshot: created.institutionalSnapshot,
        documentSnapshot: [],
        offerKinds: created.offerKinds,
        campusName: 'A',
        decisions: [],
      });
    }),
  ).rejects.toThrow(/Unexpected field|Expected/);
});
