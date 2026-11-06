import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarEvent } from '../../src/domain/calendar/model.ts';
import { describe, expect, test } from 'vitest';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { applyDate } from '../helpers/date-commands.ts';
import { applyVacations } from '../../src/domain/calendar/commands/vacations.ts';
import { assessmentDayCounts } from '../../src/domain/calendar/counting/assessment-days.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  offerOrganizationIssues,
  offerOrganizationWarnings,
} from '../../src/domain/calendar/organization/offers.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { teachingDayBreakdown } from '../../src/printing/teaching-day-breakdown.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { compareContents } from '../../src/domain/calendar/diff.ts';
import {
  activityKey,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { cycleLink, definedStage } from '../helpers/activity-links.ts';
import {
  cascavelDraft,
  conflictingLinks,
  ivaiporaDraft,
  type PendingLinksFixture,
} from '../fixtures/pending-links-2027.ts';

const save = (previous: PendingLinksFixture, proposed: PendingLinksFixture) =>
  prepareOfferCalendarSave(previous, proposed, {
    storedContent: offerCalendarContent(previous),
    catalogue: { events: [] },
  });
const links = (state: { events: { id: string; activity?: ActivityRef }[] }) =>
  state.events.map(({ id, activity }) => [id, activity && activityKey(activity)]);
const linksById = (state: { events: { id: string; activity?: ActivityRef }[] }) =>
  Object.fromEntries(links(state));

/** Annual organization of one offer, with its two stages, from the draft's own form. */
function annualDraft(state: PendingLinksFixture, offer: string) {
  const draft = offerOrganizationDraft(state, offer);
  draft.organization = 'anual';
  draft.count = '2';
  draft.periods[0] = { sourceId: '', name: 'Ano', start: '2027-02-01', end: '2027-12-17' };
  draft.stages[0] = { id: '', start: '2027-02-01', end: '2027-06-30' };
  draft.stages[1] = { id: '', start: '2027-07-26', end: '2027-12-17' };
  return draft;
}

test.each([
  ['Ivaiporã', ivaiporaDraft, 11],
  ['Cascavel', cascavelDraft, 10],
] as const)(
  'the %s draft saves unrelated changes and keeps its links to review',
  (_campus, fixture, count) => {
    const state = fixture();
    const proposed = {
      ...state,
      offers: state.offers.map((offer) => ({ ...offer, label: `Oferta ${offer.id}` })),
    };
    const saved = save(state, proposed);
    expect(links(saved.state)).toEqual(links(state));
    expect(saved.state.events).toHaveLength(state.events.length);
    const review = linksToReview(saved.state);
    expect([...review.values()]).toEqual(Array(count).fill('not-generated'));
    expect(saved.state.events.find((event) => event.id.endsWith('-final-appeal-2'))?.hours).toBe(
      fixture === ivaiporaDraft ? 28 : undefined,
    );
    for (const event of saved.state.events.filter(
      (item) => item.activity?.activityId === 'admission-notice',
    )) {
      expect(event.notice).toBeUndefined();
    }
  },
);

test('editing description, dates and offers of a date without generated activity keeps its link', () => {
  const state = ivaiporaDraft();
  const original = state.events.find((event) => event.id === 'ivaipora-final-1')!;
  const edited = {
    ...original,
    name: 'Resultado final — revisado',
    start: civilDate('2027-06-23'),
    end: civilDate('2027-06-24'),
    offers: ['integrado'],
  };
  const applied = applyDate(state, edited, true);
  expect(applied.events.find((event) => event.id === original.id)).toEqual(edited);
  const saved = save(state, applied);
  expect(saved.state.events.find((event) => event.id === original.id)).toMatchObject({
    activity: cycleLink('final', 'first'),
    start: '2027-06-23',
  });
});

test('new, swapped and removed links are still refused by command and save', () => {
  const state = cascavelDraft();
  const event = state.events[0];
  expect(() => applyDate(state, { ...event, id: 'copy' })).toThrow('Atividade inválida');
  expect(() => applyDate(state, { ...event, activity: cycleLink('diary', 'first') }, true)).toThrow(
    'não perde nem troca',
  );
  // An edit without link keeps the saved one: `updateDate` never removes it.
  const { activity: _kept, ...unlinked } = event;
  expect(
    applyDate(state, unlinked, true).events.find((item) => item.id === event.id)?.activity,
  ).toEqual(event.activity);
  const swapped = state.events.map((item) =>
    item.id === event.id ? { ...item, activity: cycleLink('diary', 'first') } : item,
  );
  expect(() => save(state, { ...state, events: swapped })).toThrow('não perde nem troca');
  const removed = state.events.map(({ activity: _link, ...item }) => item);
  expect(() => save(state, { ...state, events: removed })).toThrow('não perde nem troca');
  const added = [...state.events, { ...event, id: 'copy' }];
  expect(() => save(state, { ...state, events: added })).toThrow('Vínculo de atividade inválido');
  expect(() => normalizeOfferCalendar(state)).toThrow(
    /Vínculo.*21 de julho de 2027.*21 de dezembro de 2027/,
  );
  expect(() => normalizeOfferCalendar(state, state)).not.toThrow();
});

test('confirming an offer organization warns about links instead of refusing, and keeps them', () => {
  const state = ivaiporaDraft();
  const draft = annualDraft(state, 'integrado');
  expect(offerOrganizationIssues(state, 'integrado', draft)).toEqual([]);
  expect(offerOrganizationWarnings(state, 'integrado', draft)).toHaveLength(11);
  let sequence = 0;
  const configured = applyOfferOrganization(state, 'integrado', draft, () => `new-${++sequence}`);
  expect(links(configured).slice(0, state.events.length)).toEqual(links(state));
  expect(configured.events.slice(state.events.length).map((event) => event.activity)).toEqual([
    definedStage('stage', 'integrado', 'annual', 1),
    definedStage('stage', 'integrado', 'annual', 2),
  ]);
  const saved = save(state, configured);
  expect([...linksToReview(saved.state).values()]).toEqual(Array(11).fill('not-generated'));
  // A second confirmation updates the recorded stages instead of creating new ones.
  const again = offerOrganizationDraft(saved.state, 'integrado');
  again.stages[1].end = '2027-12-16';
  const reconfirmed = applyOfferOrganization(saved.state, 'integrado', again, () => 'unused');
  expect(reconfirmed.events).toHaveLength(saved.state.events.length);
});

test('reducing stages of an unchanged calendar is saved; positions without a stage are reviewed', () => {
  const state = conflictingLinks();
  // The semester organization of the integrated offer, with its stages at their positions in
  // the two cycles, as confirming the organization records them.
  const positions: Record<string, ActivityRef> = {
    'stage-first': definedStage('stage', 'integrado', 'first', 1),
    'stage-twice-a': definedStage('stage', 'integrado', 'first', 2),
    'stage-late': definedStage('stage', 'integrado', 'second', 1),
    'stage-early': definedStage('stage', 'integrado', 'second', 2),
  };
  const semester: PendingLinksFixture = {
    ...state,
    offers: state.offers.map((offer) =>
      offer.id === 'integrado'
        ? {
            ...offer,
            organization: 'semestral',
            stages: { status: 'defined' as const, perTerm: 2 },
          }
        : offer,
    ),
    periods: [
      {
        id: 'first',
        name: '1º semestre',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-07-09'),
        association: { status: 'defined', offers: ['integrado'], term: 'first' },
      },
      {
        id: 'second',
        name: '2º semestre',
        start: civilDate('2027-07-26'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['integrado'], term: 'second' },
      },
      {
        id: 'year',
        name: 'Ano letivo',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['subsequente'], term: 'annual' },
      },
    ],
    events: state.events
      .filter((event) => event.id !== 'stage-twice-b')
      .map((event) => (positions[event.id] ? { ...event, activity: positions[event.id] } : event)),
  };
  expect(linksToReview(semester).get('stage-twice-a')).toBeUndefined();
  // The organization form only reduces the count per cycle; the second cycle's stage is the one
  // already recorded at that position.
  const draft = offerOrganizationDraft(semester, 'integrado');
  draft.count = '1';
  draft.stages[1] = { ...draft.stages[2] };
  expect(offerOrganizationIssues(semester, 'integrado', draft)).toEqual([]);
  const reduced = applyOfferOrganization(semester, 'integrado', draft, () => 'unused');
  const saved = save(semester, reduced);
  // A confirmed stage keeps its position when the count changes; positions
  // the reduced organization does not have go to review.
  expect(linksById(saved.state)).toMatchObject({
    'stage-first': 'stage:stage:first:1:integrado',
    'stage-twice-a': 'stage:stage:first:2:integrado',
    'stage-late': 'stage:stage:second:1:integrado',
    'stage-early': 'stage:stage:second:2:integrado',
  });
  const dates = (events: readonly CalendarEvent[]) =>
    events
      .map((event) => `${event.id} ${event.start} ${event.end}`)
      .sort((a, b) => a.localeCompare(b));
  expect(dates(saved.state.events)).toEqual(dates(semester.events));
  expect(Object.fromEntries(linksToReview(saved.state))).toEqual({
    'stage-twice-a': 'not-generated',
    'stage-early': 'not-generated',
  });
});

test('regenerated teacher vacations keep the link recorded for the same date ID', () => {
  const state = conflictingLinks();
  const changed = applyVacations(state, {
    firstStart: civilDate('2027-01-05'),
    firstEnd: civilDate('2027-01-30'),
  });
  expect(changed.events.find((event) => event.id === 'teacher-vacation-january')).toMatchObject({
    activity: cycleLink('diary', 'first'),
    start: '2027-01-05',
  });
  const stripped = {
    ...state,
    events: state.events.map(({ activity, ...event }) =>
      event.id === 'teacher-vacation-january' ? event : { ...event, activity },
    ),
  };
  expect(
    normalizeOfferCalendar(stripped, state).events.find(
      (event) => event.id === 'teacher-vacation-january',
    )?.activity,
  ).toEqual(cycleLink('diary', 'first'));
});

test('a preexisting duplicated stage saves, is reviewed and never counts as fulfilment', () => {
  const state = conflictingLinks();
  expect(() => save(state, { ...state, weekdays: [1, 2, 3, 4] })).not.toThrow();
  const coverage = evaluatePlan(state).rows.find(
    (row) => row.requirement.id === 'stage-2:integrado',
  )!;
  expect(coverage.events.map((event) => event.id)).toEqual(['stage-twice-a', 'stage-twice-b']);
  expect(coverage.coverage).toBe('partial');
  expect(coverage.warnings[0]).toMatch(/^Etapa duplicada/);
  const first = evaluatePlan(state).rows.find((row) => row.requirement.id === 'stage-1:integrado')!;
  expect(first.coverage).toBe('complete');
  // Creating another duplicate is refused.
  const extra = { ...state.events[0], id: 'stage-again', name: 'Outra 1ª etapa' };
  expect(() => applyDate(state, extra)).toThrow('duplicadas');
  expect(() => save(state, { ...state, events: [...state.events, extra] })).toThrow('duplicadas');
});

test('stages to review have no days of their own and are not distributed when printing', () => {
  const state = conflictingLinks();
  const days = assessmentDayCounts(state, state.events);
  expect(Object.keys(days)).toEqual(['stage-first']);
  const result = evaluateCalendar(state, state.events);
  const report = teachingDayBreakdown(state, state.events, result, 'integrado');
  expect(report.stages.map((row) => row.available)).toEqual([true, false, false, false]);
  expect(report.stages.slice(1).every((row) => row.start === undefined)).toBe(true);
});

test('a notice whose link has no generated activity is not split; only the reorganized offer destination follows its period', () => {
  const state = conflictingLinks();
  const draft = offerOrganizationDraft(state, 'integrado');
  draft.periods[0].sourceId = 'year';
  let sequence = 0;
  const configured = applyOfferOrganization(state, 'integrado', draft, () => `new-${++sequence}`);
  const before = state.events.find((event) => event.id === 'transfer-notice')!;
  const notices = configured.events.filter((event) => event.name.startsWith('Edital'));
  expect(notices).toHaveLength(1);
  const { notice: _notice, ...rest } = before;
  expect(notices[0]).toMatchObject(rest);
  const destinations = notices[0].notice!.admission!.destinations;
  expect(destinations.find((item) => item.offerId === 'subsequente')?.periodId).toBe('year');
  const moved = destinations.find((item) => item.offerId === 'integrado')!.periodId;
  expect(moved).not.toBe('year');
  expect(configured.periods.find((period) => period.id === moved)?.association).toMatchObject({
    offers: ['integrado'],
  });
});

test('readings of a kept link without activity do not fail; review blocks the conclusion', () => {
  const state = ivaiporaDraft();
  const record = { id: 'c', name: 'Ivaiporã', version: 1, catalogueRevision: 1, state };
  const readiness = releaseReadiness(
    { ...record, institutionalSnapshot: [] },
    { catalogue: { revision: 1 } },
  );
  // The link can be corrected (`changeActivity`), so a date to review blocks the conclusion.
  const blocking = readiness.issues.filter((issue) => issue.startsWith('Vínculo a conferir'));
  expect(blocking).toHaveLength(11);
  expect(readiness.warnings.some((warning) => warning.startsWith('Vínculo a conferir'))).toBe(
    false,
  );
  expect(() => reviewSupport(record, state.events)).not.toThrow();
  const side = { state, institutionalSnapshot: [], catalogueRevision: 1 };
  const edited = structuredClone(side);
  edited.state.events[0].name = 'Outra descrição';
  expect(compareContents(side, edited).campusChanges).toBe(1);
});

describe('links kept without generated activity', () => {
  test('a stage kept without generated activity can still have its dates edited', () => {
    const state = conflictingLinks();
    const reduced = {
      ...state,
      offers: state.offers.map((offer) =>
        offer.id === 'integrado'
          ? { ...offer, stages: { status: 'defined' as const, perTerm: 3 } }
          : offer,
      ),
    };
    const early = reduced.events.find((event) => event.id === 'stage-early')!;
    const moved = { ...early, end: civilDate('2027-09-29') };
    expect(() => applyDate(reduced, moved, true)).not.toThrow();
    const edited = {
      ...reduced,
      events: reduced.events.map((e) => (e.id === early.id ? moved : e)),
    };
    expect(() => normalizeOfferCalendar(edited, reduced)).not.toThrow();
  });

  test('dates to review block the conclusion once each, with their reason', () => {
    const state = conflictingLinks();
    const readiness = releaseReadiness(
      { id: 'c', version: 1, catalogueRevision: 1, state, institutionalSnapshot: [] },
      { catalogue: { revision: 1 } },
    );
    const blocking = readiness.issues.filter((issue) => issue.startsWith('Vínculo a conferir'));
    expect(blocking).toHaveLength(linksToReview(state).size);
    expect(blocking.some((issue) => issue.includes('Etapa duplicada'))).toBe(true);
    expect(blocking.some((issue) => issue.includes('Etapas fora de sequência'))).toBe(true);
  });

  test('the organization form reports the refusal its command would raise', () => {
    const state = conflictingLinks();
    const draft = offerOrganizationDraft(state, 'integrado');
    draft.stages[1] = { ...draft.stages[1], start: '2027-04-01', end: '2027-05-30' };
    expect(offerOrganizationIssues(state, 'integrado', draft).map((i) => i.message)).toContainEqual(
      expect.stringContaining('duplicadas'),
    );
  });

  test('an unchanged recorded stage never blocks a period change in the organization form', () => {
    const state = conflictingLinks();
    const draft = offerOrganizationDraft(state, 'integrado');
    draft.periods[0] = { ...draft.periods[0], start: '2027-02-15' };
    expect(
      offerOrganizationIssues(state, 'integrado', draft).filter((i) => i.path === 'stages[0]'),
    ).toEqual([]);
  });

  test('an edited link must cover one of the date offers', () => {
    const state = conflictingLinks();
    const semester = {
      ...state,
      offers: state.offers.map((offer) =>
        offer.id === 'subsequente'
          ? {
              ...offer,
              organization: 'semestral' as const,
              stages: { status: 'defined' as const, perTerm: 1 },
            }
          : offer,
      ),
      periods: [],
      events: [] as CalendarEvent[],
    };
    const event: CalendarEvent = {
      id: 'new-final',
      name: 'Resultado do semestre',
      activity: cycleLink('final', 'first'),
      start: civilDate('2027-06-30'),
      end: civilDate('2027-06-30'),
      effect: 'note',
      offers: ['integrado'],
    };
    expect(() => applyDate(semester, event)).toThrow(/oferta/);
    expect(() => normalizeOfferCalendar({ ...semester, events: [event] }, semester)).toThrow(
      /oferta/,
    );
  });
});
