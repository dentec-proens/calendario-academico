import { expect, test } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize-v4.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';

type Count = 2 | 3 | 4;
const paginationOpts = {
  numItems: 10,
  cursor: null,
  maximumRowsRead: 10,
  maximumBytesRead: 4 * 1024 * 1024,
};

async function setup(count?: Count) {
  const fixture = await createNativeFixture();
  const actor = fixture.asClient('campus-a');
  const created = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'a-classificar' }],
      courses: 'Configuração sintética migrada',
      purpose: 'test',
    },
  });
  if (count !== undefined)
    await fixture.client.run(async (ctx) => {
      const content = await ctx.db
        .query('calendarContents')
        .withIndex('by_calendarId', (q) => q.eq('calendarId', created.id))
        .unique();
      if (!content || content.state.schemaVersion !== 4) throw Error('Conteúdo v4 esperado.');
      const state = structuredClone(content.state);
      Object.assign(state.offers[0], { legacyStageCount: count });
      state.events = Array.from({ length: count }, (_, index) => ({
        id: `old-stage-${index + 1}`,
        requirementId: `stage-${index + 1}:integrado`,
        name: `${index + 1}ª etapa preservada`,
        start: `2027-0${index + 2}-01`,
        end: `2027-0${index + 2}-20`,
        kind: 'note' as const,
        category: 'limite',
        offers: ['integrado'],
      }));
      await ctx.db.patch(content._id, { state });
    });
  const record = await actor.query(api.calendars.calendar, { id: created.id });
  const save = (state: typeof record.state, version = record.version) =>
    actor.mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version,
        catalogueRevision: record.catalogueRevision,
        // Match the HTTP JSON boundary, which omits undefined optional fields.
        state: JSON.parse(JSON.stringify(state)) as typeof state,
      },
    });
  return { ...fixture, actor, record, save };
}

test.each([2, 3, 4] as const)(
  'direct saves and format-4 copy retain %i historical stages while metadata changes',
  async (count) => {
    const { record, save } = await setup(count);
    const state = {
      ...record.state,
      offers: record.state.offers.map((offer) => ({
        ...offer,
        label: 'Identificação conferida',
        delivery: 'presencial' as const,
      })),
    };
    const saved = await save(state);
    expect(saved.state.offers[0]).toMatchObject({
      organization: 'a-classificar',
      legacyStageCount: count,
      label: 'Identificação conferida',
    });
    expect(saved.state.events).toEqual(record.state.events);
    const copy = normalizeOfferCalendar(JSON.parse(JSON.stringify(saved.state)));
    expect(offerCalendarContent(copy)).toEqual(offerCalendarContent(saved.state));
    const unchanged = await save(copy as typeof record.state, saved.version);
    expect(unchanged.state.offers[0]).toMatchObject({ legacyStageCount: count });
    expect(unchanged.version).toBe(saved.version);
  },
);

test('direct payloads cannot introduce, change, omit or partially resolve the historical quantity', async () => {
  const fresh = await setup();
  const introduced = structuredClone(fresh.record.state);
  Object.assign(introduced.offers[0], { legacyStageCount: 3 });
  await expect(fresh.save(introduced)).rejects.toThrow();
  expect((await fresh.actor.query(api.calendars.calendar, { id: fresh.record.id })).version).toBe(
    fresh.record.version,
  );

  const migrated = await setup(3);
  for (const mutate of [
    (state: typeof migrated.record.state) =>
      Object.assign(state.offers[0], { legacyStageCount: 4 }),
    (state: typeof migrated.record.state) =>
      Reflect.deleteProperty(state.offers[0], 'legacyStageCount'),
    (state: typeof migrated.record.state) =>
      Object.assign(state.offers[0], { stages: { perTerm: 3 } }),
    (state: typeof migrated.record.state) => {
      Reflect.deleteProperty(state.offers[0], 'legacyStageCount');
      Object.assign(state.offers[0], { organization: 'anual', stages: { perTerm: 3 } });
    },
  ]) {
    const proposed = structuredClone(migrated.record.state);
    mutate(proposed);
    await expect(migrated.save(proposed)).rejects.toThrow();
    const intact = await migrated.actor.query(api.calendars.calendar, { id: migrated.record.id });
    expect(intact.version).toBe(migrated.record.version);
    expect(intact.state).toEqual(migrated.record.state);
  }
});

test('the transport accepts only literal historical counts 2, 3 or 4', async () => {
  const { record, save } = await setup();
  for (const count of [0, 1, 5, 2.5]) {
    const proposed = structuredClone(record.state);
    Object.assign(proposed.offers[0], { legacyStageCount: count });
    await expect(save(proposed)).rejects.toThrow();
  }
});

test('new or changed stage dates require a real cycle even when the historical total is known', async () => {
  const { record, save } = await setup(3);
  for (const state of [
    {
      ...record.state,
      events: record.state.events.map((event, index) =>
        index === 0 ? { ...event, end: '2027-02-21' } : event,
      ),
    },
    {
      ...record.state,
      events: [...record.state.events, { ...record.state.events[0], id: 'new-stage' }],
    },
  ])
    await expect(save(state)).rejects.toThrow();
});

test('direct complete classification cannot erase a previous required second-semester intake', async () => {
  const { client, actor, record, save } = await setup(3);
  const draft = offerOrganizationDraft(record.state, 'integrado');
  draft.organization = 'anual';
  draft.count = '2';
  draft.periods[0] = {
    sourceId: '',
    name: 'Ano explícito',
    start: '2027-02-01',
    end: '2027-12-17',
  };
  draft.stages[0].start = '2027-02-01';
  draft.stages[0].end = '2027-07-09';
  draft.stages[1].start = '2027-07-26';
  draft.stages[1].end = '2027-12-17';
  let sequence = 0;
  const configured = applyOfferOrganization(
    record.state,
    'integrado',
    draft,
    () => `configured-${++sequence}`,
  );
  const previous = structuredClone(record.state);
  previous.offers[0].intake = { second: { status: 'yes', required: true } };
  await client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique();
    if (!content || content.state.schemaVersion !== 4) throw Error('Conteúdo v4 esperado.');
    const state = structuredClone(content.state);
    state.offers[0].intake = previous.offers[0].intake;
    await ctx.db.patch(content._id, { state });
  });
  await expect(save(configured)).rejects.toThrow(/matrícula/i);
  const intact = await actor.query(api.calendars.calendar, { id: record.id });
  expect(intact.version).toBe(record.version);
  expect(intact.state).toEqual(previous);
});

test('complete explicit configuration retires surplus bindings and retains the marker in historical inventory', async () => {
  const { client, actor, record, save } = await setup(3);
  const draft = offerOrganizationDraft(record.state, 'integrado');
  draft.organization = 'anual';
  draft.count = '2';
  draft.periods[0] = {
    sourceId: '',
    name: 'Ano explícito',
    start: '2027-02-01',
    end: '2027-12-17',
  };
  draft.stages[0].start = '2027-02-01';
  draft.stages[0].end = '2027-07-09';
  draft.stages[1].start = '2027-07-26';
  draft.stages[1].end = '2027-12-17';
  const oldExcess = record.state.events[2];
  let sequence = 0;
  const configured = applyOfferOrganization(
    record.state,
    'integrado',
    draft,
    () => `configured-${++sequence}`,
  );
  const saved = await save(configured);
  expect(saved.state.offers[0]).not.toHaveProperty('legacyStageCount');
  expect(saved.state.offers[0]).toMatchObject({ organization: 'anual', stages: { perTerm: 2 } });
  expect(saved.state.events.find((event) => event.id === oldExcess.id)).toMatchObject({
    start: oldExcess.start,
    end: oldExcess.end,
    recordType: 'retired-stage',
  });
  expect(
    saved.state.events.find((event) => event.id === oldExcess.id)?.requirementId,
  ).toBeUndefined();
  const archived = await actor.query(api.calendars.calendarVersion, {
    id: record.id,
    version: record.version,
  });
  expect(archived.state).toMatchObject({ offers: [{ legacyStageCount: 3 }] });
  const live = await client.query(internal.legacy.usage, { phase: 'contents', paginationOpts });
  const historical = await client.query(internal.legacy.usage, {
    phase: 'historicalSnapshots',
    paginationOpts,
  });
  expect(live.counts.legacyStageCountOffers).toBe(0);
  expect(historical.counts.historicalLegacyStageCountContents).toBe(1);
  expect(historical.counts.historicalLegacyStageCountOffers).toBe(1);
  expect(historical.counts.historicalLegacyStageCount3Offers).toBe(1);
});
