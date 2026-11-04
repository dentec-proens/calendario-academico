import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { stageActivity } from '../../src/domain/calendar/activities/assessment.ts';
import { compareContents, describeValue, type DiffSide } from '../../src/domain/calendar/diff.ts';
import type { ActivityState, CalendarEvent } from '../../src/domain/calendar/model.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { stageOrdinal, stagePosition } from '../../src/domain/calendar/offers.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { definedStage } from '../helpers/activity-links.ts';
import { storedCases } from '../helpers/stored-fixtures.ts';

/**
 * Stage positions of a link: a save never swaps a stored position, an offer without stages has no
 * position, so its links wait under “Vínculo a conferir” until the stages are informed, and
 * reorganizing the offer keeps every position as stored.
 */
type SaveState = Parameters<typeof prepareOfferCalendarSave>[0];
const byName = (name: string) => storedCases().find((item) => item.name === name)!;
const saveContext = (state: SaveState) => ({
  storedContent: offerCalendarContent(state),
  catalogue: { events: [] },
  recalculate: false,
});
const stageEvent = (id: string, activity: CalendarEvent['activity'], month: number) => ({
  id,
  name: `${id} preservada`,
  start: civilDate(`2027-${String(month).padStart(2, '0')}-02`),
  end: civilDate(`2027-${String(month).padStart(2, '0')}-12`),
  effect: 'note' as const,
  category: 'limite',
  activity,
  offers: ['integrado'],
});

/** A stored annual integrated calendar whose number of stages the campus has not informed. */
function uncounted() {
  const item = byName('Quantidade anterior de 2 etapas');
  return {
    ...item.content.state,
    year: item.year,
    campus: item.campus,
    events: [],
    offers: item.content.state.offers.map(({ stages: _stages, ...offer }) => offer),
  } as unknown as ActivityState;
}

/** The frozen four-stage annual integrated calendar, as stored in format 5. */
function annualFour() {
  const item = byName('v3 anual integrado, quatro etapas');
  const state = {
    ...item.content.state,
    year: item.year,
    campus: item.campus,
  } as unknown as ActivityState & SaveState;
  return normalizeOfferCalendar(state, state) as ActivityState & SaveState;
}
const stageIds = (state: ActivityState) =>
  state.events.filter((event) => event.activity?.activityId === 'stage').map((event) => event.id);

describe('an offer without stages has no position, and its links wait for the stages', () => {
  const withLinks = () => {
    const state = uncounted() as ActivityState & SaveState;
    state.events = [1, 2].map((n) =>
      stageEvent(`old-${n}`, definedStage('stage', 'integrado', 'annual', n), n + 2),
    );
    return state;
  };

  test('no ordinal has a position, no position has an ordinal, and no link is generated', () => {
    const state = withLinks();
    const offer = state.offers.find((item) => item.id === 'integrado')!;
    expect(stagePosition(offer, 1)).toBeUndefined();
    expect(stageOrdinal(offer, { status: 'defined', term: 'annual', number: 1 })).toBeUndefined();
    expect(stageActivity(state, 'stage', 'integrado', 1)).toBeUndefined();
    expect(Object.fromEntries(linksToReview(state))).toEqual({
      'old-1': 'not-generated',
      'old-2': 'not-generated',
    });
  });

  test('the date is saved as recorded and still edited, but a new date cannot take a position', () => {
    const previous = withLinks();
    const edited = {
      ...previous,
      events: previous.events.map((event) =>
        event.id === 'old-1' ? { ...event, end: civilDate('2027-03-20') } : event,
      ),
    };
    const saved = prepareOfferCalendarSave(previous, edited, saveContext(previous)).state;
    expect(saved.events.map((event) => event.activity)).toEqual(
      previous.events.map((event) => event.activity),
    );
    expect(linksToReview({ ...saved, year: previous.year }).get('old-1')).toBe('not-generated');
    const added = {
      ...previous,
      events: [
        ...previous.events,
        stageEvent('new', definedStage('stage', 'integrado', 'annual', 3), 6),
      ],
    };
    expect(() => prepareOfferCalendarSave(previous, added, saveContext(previous))).toThrow(
      'Vínculo de atividade inválido',
    );
  });

  test('informing the stages makes the same positions count, as recorded', () => {
    const state = withLinks();
    const draft = offerOrganizationDraft(state, 'integrado');
    draft.organization = 'anual';
    draft.count = '2';
    draft.periods[0] = { sourceId: '', name: 'Ano', start: '2027-02-01', end: '2027-12-17' };
    draft.stages[0] = { id: 'old-1', start: '2027-03-02', end: '2027-03-12' };
    draft.stages[1] = { id: 'old-2', start: '2027-04-02', end: '2027-04-12' };
    const next = applyOfferOrganization(state, 'integrado', draft, () => 'unused');
    expect(next.events.map((event) => event.activity)).toEqual(
      state.events.map((event) => event.activity),
    );
    expect(next.events).toHaveLength(state.events.length);
    expect(linksToReview(next).size).toBe(0);
  });
});

describe('confirming the organization keeps defined positions as stored', () => {
  const reorganize = (organization: 'anual' | 'semestral', count: string) => {
    const stored = annualFour();
    // A local intake requirement blocks changing between annual and semester; none is kept here.
    const state = {
      ...stored,
      offers: stored.offers.map((offer) => {
        const { intake, ...rest } = offer;
        return intake ? rest : offer;
      }),
    };
    const draft = offerOrganizationDraft(state, 'integrado');
    draft.organization = organization;
    draft.count = count;
    if (organization === 'semestral') {
      draft.periods[0] = { sourceId: '', name: '', start: '2027-02-01', end: '2027-07-09' };
      draft.periods[1] = { sourceId: '', name: '', start: '2027-07-26', end: '2027-12-17' };
      draft.stages[0] = { ...draft.stages[0], start: '2027-02-01', end: '2027-04-30' };
      draft.stages[1] = { ...draft.stages[1], start: '2027-05-03', end: '2027-07-09' };
      draft.stages[2] = { ...draft.stages[2], start: '2027-07-26', end: '2027-09-30' };
      draft.stages[3] = { ...draft.stages[3], start: '2027-10-01', end: '2027-12-17' };
    }
    let sequence = 0;
    const next = applyOfferOrganization(state, 'integrado', draft, () => `new-${++sequence}`);
    return { state, next };
  };

  test('four to three annual stages: the fourth keeps its position and goes to review', () => {
    const { state, next } = reorganize('anual', '3');
    for (const event of state.events)
      expect(next.events.find((item) => item.id === event.id)?.activity).toEqual(event.activity);
    const [, , , fourth] = stageIds(state);
    expect(Object.fromEntries(linksToReview(next))).toEqual({ [fourth]: 'not-generated' });
  });

  test('annual to semester: annual positions are kept, to review, and the new stages are added', () => {
    const { state, next } = reorganize('semestral', '2');
    for (const event of state.events)
      expect(next.events.find((item) => item.id === event.id)?.activity).toEqual(event.activity);
    const review = linksToReview(next);
    for (const id of stageIds(state)) expect(review.get(id)).toBe('not-generated');
    expect(
      next.events.filter((event) => event.id.startsWith('new-')).map((event) => event.activity),
    ).toEqual([
      definedStage('stage', 'integrado', 'first', 1),
      definedStage('stage', 'integrado', 'first', 2),
      definedStage('stage', 'integrado', 'second', 1),
      definedStage('stage', 'integrado', 'second', 2),
    ]);
  });

  test('the submission comparison shows no link change for dates whose stage was kept', () => {
    const { state, next } = reorganize('anual', '3');
    const side = (value: ActivityState): DiffSide => ({
      state: value,
      institutionalSnapshot: [],
      documentSnapshot: [],
      catalogueRevision: 0,
    });
    const diff = compareContents(side(state), side(next));
    expect(
      diff.events.flatMap((change) => change.fields.filter((field) => field.field === 'activity')),
    ).toEqual([]);
  });
});

describe('the comparison names linked activities', () => {
  test('another link is shown by the names of the generated rows, never by its key', () => {
    const before = annualFour();
    const [first] = stageIds(before);
    const swapped = {
      ...before,
      events: before.events.map((event) =>
        event.id === first
          ? { ...event, activity: definedStage('stage', 'integrado', 'annual', 2) }
          : event,
      ),
    };
    const side = (value: ActivityState): DiffSide => ({
      state: value,
      institutionalSnapshot: [],
      documentSnapshot: [],
      catalogueRevision: 0,
    });
    const [field] = compareContents(side(before), side(swapped)).events.flatMap((change) =>
      change.fields.filter((item) => item.field === 'activity'),
    );
    expect(field.text).toEqual({
      before: describeValue('activity', field.before, before),
      after: describeValue('activity', field.after, swapped),
    });
    expect(field.text!.before).not.toMatch(/^stage:/);
    expect(field.text!.before).not.toBe(field.text!.after);
  });
});
