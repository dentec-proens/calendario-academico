import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { cycleLink, unclassifiedStage } from '../helpers/activity-links.ts';
import type { ActivityRef } from '../../src/domain/calendar/activities/activity-ref.ts';
import { api } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { offerCalendarContent } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { applyEvent } from '../../src/domain/calendar/commands/events.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import {
  cascavelDraft,
  conflictingLinks,
  ivaiporaDraft,
  stageLinksToReview,
  type PendingLinksFixture,
} from '../fixtures/pending-links-2027.ts';

/** A calendar whose stored content is the fixture, as left by earlier versions of the editor. */
async function stored(fixture: PendingLinksFixture) {
  const native = await createNativeFixture();
  const actor = native.asClient('campus-a');
  const created = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: native.ids.campuses.a,
        year: 2027,
        offers: fixture.offers.map(({ kind }) => ({
          kind,
          organization: 'a-classificar' as const,
        })),
      },
    })
    .then(calendarRecordDates);
  await native.client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', created.id))
      .unique();
    if (!content) throw Error('Conteúdo esperado.');
    const state = offerCalendarContent({ ...fixture, rulesetVersion: rulesetVersion(fixture) });
    await ctx.db.patch(content._id, { state: state as typeof content.state });
  });
  const record = await actor
    .query(api.calendars.calendar, { id: created.id })
    .then(calendarRecordDates);
  const save = (state: typeof record.state, version = record.version) =>
    actor
      .mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version,
          catalogueRevision: record.catalogueRevision,
          // Match the HTTP JSON boundary, which omits undefined optional fields.
          state: JSON.parse(JSON.stringify(state)) as typeof state,
        },
      })
      .then(calendarSaveDates);
  const current = () =>
    actor.query(api.calendars.calendar, { id: record.id }).then(calendarRecordDates);
  return { record, save, current };
}

const linkOf = (state: { events: { id: string; activity?: ActivityRef }[] }) =>
  Object.fromEntries(state.events.map(({ id, activity }) => [id, activity]));

test.each([
  ['Ivaiporã', ivaiporaDraft],
  ['Cascavel', cascavelDraft],
] as const)('the %s draft saves an unrelated change, keeping every link', async (_, fixture) => {
  const { record, save } = await stored(fixture());
  const saved = await save({ ...record.state, weekdays: [1, 2, 3, 4] });
  expect(saved.version).toBe(record.version + 1);
  expect(linkOf(saved.state)).toEqual(linkOf(record.state));
  expect(saved.state.events).toHaveLength(record.state.events.length);
});

test('the 21 audited dates are stored with their activity and saved under “Vínculo a conferir”', async () => {
  let audited = 0;
  for (const fixture of [ivaiporaDraft, cascavelDraft]) {
    const { record, save } = await stored(fixture());
    const saved = await save({ ...record.state, weekdays: [1, 2, 3, 4] });
    const linked = saved.state.events.filter((event) => event.activity);
    audited += linked.length;
    for (const event of linked) {
      expect(event.activity).toEqual(
        fixture().events.find((item) => item.id === event.id)?.activity,
      );
    }
    const review = linksToReview({ ...saved.state, year: 2027 });
    expect(linked.map((event) => review.get(event.id))).toEqual(linked.map(() => 'unclassified'));
  }
  expect(audited).toBe(21);
});

test('results and councils by stage without generated stage are saved under review', async () => {
  const { record, save } = await stored(stageLinksToReview());
  const saved = await save({ ...record.state, weekdays: [1, 2, 3, 4] });
  expect(linkOf(saved.state)).toEqual(linkOf(record.state));
  expect(Object.fromEntries(linksToReview({ ...saved.state, year: 2027 }))).toEqual({
    'results-unclassified': 'unclassified',
    'council-unclassified': 'unclassified',
    'results-beyond': 'unclassified',
    'council-beyond': 'unclassified',
  });
  // A new link to a stage the configuration does not generate is still refused.
  const [beyond] = record.state.events.filter((event) => event.id === 'results-beyond');
  await expect(
    save(
      { ...saved.state, events: [...saved.state.events, { ...beyond, id: 'results-new' }] },
      saved.version,
    ),
  ).rejects.toThrow(/Vínculo de atividade inválido/);
});

test('a pending date is edited and saved with its link', async () => {
  const { record, save } = await stored(ivaiporaDraft());
  const pending = record.state.events.find((event) => event.id === 'ivaipora-recognition-2')!;
  const edited = applyEvent(
    record.state,
    {
      ...pending,
      name: 'Reconhecimento revisado',
      start: civilDate('2027-07-21'),
      end: civilDate('2027-07-30'),
      scope: { offers: ['subsequente'], confirmed: true },
    },
    [],
    true,
  );
  const saved = await save(edited);
  expect(saved.state.events.find((event) => event.id === pending.id)).toMatchObject({
    activity: cycleLink('recognition', 'second'),
    name: 'Reconhecimento revisado',
    start: '2027-07-21',
    scope: { offers: ['subsequente'], confirmed: true },
  });
});

test('confirming the organization of a draft offer is saved and keeps the links to review', async () => {
  const { record, save } = await stored(cascavelDraft());
  const draft = offerOrganizationDraft(record.state, 'graduacao');
  draft.organization = 'semestral';
  draft.count = '1';
  draft.periods[0] = { sourceId: '', name: '', start: '2027-02-01', end: '2027-07-09' };
  draft.periods[1] = { sourceId: '', name: '', start: '2027-07-26', end: '2027-12-17' };
  draft.stages[0] = { id: '', start: '2027-02-01', end: '2027-07-09' };
  draft.stages[1] = { id: '', start: '2027-07-26', end: '2027-12-17' };
  let sequence = 0;
  const configured = applyOfferOrganization(
    record.state,
    'graduacao',
    draft,
    () => `graduacao-${++sequence}`,
  );
  const saved = await save(configured);
  expect(saved.state.offers.find((offer) => offer.id === 'graduacao')).toMatchObject({
    organization: 'semestral',
    stages: { status: 'defined', perTerm: 1 },
  });
  for (const event of record.state.events)
    expect(saved.state.events.find((item) => item.id === event.id)?.activity).toEqual(
      event.activity,
    );
  // Every semester link now has its activity for the graduation offer: none is left to review.
  expect(linksToReview({ ...record.state, year: 2027 }).size).toBe(10);
  expect(linksToReview({ ...saved.state, year: 2027 }).size).toBe(0);
});

test('new, swapped and removed links are refused and the stored calendar stays intact', async () => {
  const { record, save, current } = await stored(cascavelDraft());
  const [first] = record.state.events;
  for (const events of [
    [...record.state.events, { ...first, id: 'another-final' }],
    record.state.events.map((event) =>
      event.id === first.id ? { ...event, activity: cycleLink('diary', 'first') } : event,
    ),
    record.state.events.map(({ activity, ...event }) =>
      event.id === first.id ? event : { ...event, activity },
    ),
  ])
    await expect(save({ ...record.state, events })).rejects.toThrow(
      /Vínculo de atividade inválido|não perde nem troca/,
    );
  expect((await current()).state).toEqual(record.state);
});

test('a stage position is never swapped for another of the same ordinal by a save', async () => {
  const { record, save, current } = await stored(conflictingLinks());
  // With the organization unchanged, the reported ordinal of the stored stage is another link.
  await expect(
    save({
      ...record.state,
      events: record.state.events.map((event) =>
        event.id === 'stage-first'
          ? { ...event, activity: unclassifiedStage('stage', 'integrado', 1) }
          : event,
      ),
    }),
  ).rejects.toThrow('não perde nem troca');
  expect((await current()).state).toEqual(record.state);
});

test('a reported total is not withdrawn by a save that leaves its stages unclassified', async () => {
  const fixture = ivaiporaDraft();
  const integrado = fixture.offers.find((offer) => offer.id === 'integrado')!;
  integrado.stages = { status: 'reported', count: 2 };
  fixture.events.push(
    ...[1, 2].map((n) => ({
      id: `old-${n}`,
      name: `${n}ª etapa preservada`,
      start: civilDate(`2027-0${n + 2}-02`),
      end: civilDate(`2027-0${n + 2}-12`),
      effect: 'note' as const,
      category: 'limite',
      activity: unclassifiedStage('stage', 'integrado', n),
      scope: { offers: ['integrado'], confirmed: true },
    })),
  );
  const { record, save, current } = await stored(fixture);
  await expect(
    save({
      ...record.state,
      offers: record.state.offers.map((offer) =>
        offer.id === 'integrado'
          ? { ...offer, organization: 'anual', stages: { status: 'defined', perTerm: 2 } }
          : offer,
      ),
      periods: [
        ...record.state.periods,
        {
          id: 'integrado-annual',
          name: 'Ano letivo',
          start: civilDate('2027-02-01'),
          end: civilDate('2027-12-17'),
          association: { status: 'defined', offers: ['integrado'], term: 'annual' },
        },
      ],
    }),
  ).rejects.toThrow('Configure');
  expect((await current()).state).toEqual(record.state);
});

test('preexisting conflicts save; edits that create one are refused', async () => {
  const { record, save } = await stored(conflictingLinks());
  const saved = await save({
    ...record.state,
    offers: record.state.offers.map((offer) =>
      offer.id === 'integrado' ? { ...offer, label: 'Integrado sintético' } : offer,
    ),
  });
  expect(linkOf(saved.state)).toEqual(linkOf(record.state));
  expect(Object.fromEntries(linksToReview({ ...saved.state, year: 2027 }))).toMatchObject({
    'stage-twice-a': 'duplicate-stage',
    'stage-late': 'stage-sequence',
    'teacher-vacation-january': 'unclassified',
  });
  const vacations = await save(
    {
      ...saved.state,
      teacherVacations: {
        firstStart: civilDate('2027-01-05'),
        firstEnd: civilDate('2027-01-30'),
      },
    },
    saved.version,
  );
  expect(
    vacations.state.events.find((event) => event.id === 'teacher-vacation-january'),
  ).toMatchObject({ activity: cycleLink('diary', 'first'), start: '2027-01-05' });
  await expect(
    save(
      {
        ...vacations.state,
        events: vacations.state.events.map((event) =>
          event.id === 'stage-first' ? { ...event, end: civilDate('2027-04-02') } : event,
        ),
      },
      vacations.version,
    ),
  ).rejects.toThrow(/sequência/);
  // Reducing the stages of the offer is a configuration change: never refused by its dates.
  const reduced = await save(
    {
      ...vacations.state,
      offers: vacations.state.offers.map((offer) =>
        offer.id === 'integrado' ? { ...offer, stages: { status: 'defined', perTerm: 3 } } : offer,
      ),
    },
    vacations.version,
  );
  expect(linksToReview({ ...reduced.state, year: 2027 }).get('stage-early')).toBe('unclassified');
});
