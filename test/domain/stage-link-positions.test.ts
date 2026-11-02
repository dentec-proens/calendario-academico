import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { linksToReview, sameLink } from '../../src/domain/calendar/activities/links.ts';
import { compareContents, describeValue, type DiffSide } from '../../src/domain/calendar/diff.ts';
import type { ActivityState, CalendarEvent } from '../../src/domain/calendar/model.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize-v4.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { definedStage, unclassifiedStage } from '../helpers/activity-links.ts';
import { convertedState } from '../helpers/v5-conversion.ts';
import { v4Cases } from '../helpers/v4-fixtures.ts';

/**
 * Stage positions of phase 2, step 9b (plan, sections 5.1 and 10), as fixed after its review: a
 * save never swaps a stored stage position, an unclassified position counts as a stage of the offer
 * only while its organization is not confirmed, and confirming the organization keeps a defined
 * position as stored.
 */
type SaveState = Parameters<typeof prepareOfferCalendarSave>[0];
const byName = (name: string) => v4Cases().find((item) => item.name === name)!;
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
  scope: { offers: ['integrado'], confirmed: true },
});

/** The frozen four-stage annual integrated calendar, converted, as stored in format 5. */
function annualFour() {
  const item = byName('v3 anual integrado, quatro etapas');
  const state = convertedState({
    ...item.content.state,
    year: item.year,
    campus: item.campus,
  }) as unknown as ActivityState & SaveState;
  return normalizeOfferCalendar(state, state) as ActivityState & SaveState;
}
const stageIds = (state: ActivityState) =>
  state.events.filter((event) => event.activity?.activityId === 'stage').map((event) => event.id);

describe('a save never swaps a stored stage position', () => {
  test('defined to unclassified, with the same organization, is refused', () => {
    const previous = annualFour();
    const [first] = stageIds(previous);
    expect(previous.events.find((event) => event.id === first)!.activity).toEqual(
      definedStage('stage', 'integrado', 'annual', 1),
    );
    const proposed = {
      ...previous,
      events: previous.events.map((event) =>
        event.id === first
          ? { ...event, activity: unclassifiedStage('stage', 'integrado', 1) }
          : event,
      ),
    };
    expect(() => prepareOfferCalendarSave(previous, proposed, saveContext(previous))).toThrow(
      'não perde nem troca',
    );
    expect(
      sameLink(
        previous,
        definedStage('stage', 'integrado', 'annual', 1),
        previous,
        unclassifiedStage('stage', 'integrado', 1),
      ),
    ).toBe(false);
  });

  test('unclassified to defined, with the organization still unconfirmed, is refused', () => {
    const item = byName('Quantidade anterior de 2 etapas');
    const previous = convertedState({
      ...item.content.state,
      year: item.year,
      campus: item.campus,
      events: [],
    }) as unknown as ActivityState & SaveState;
    previous.events = [1, 2].map((n) =>
      stageEvent(`old-${n}`, unclassifiedStage('stage', 'integrado', n), n + 2),
    );
    const proposed = {
      ...previous,
      events: previous.events.map((event, index) =>
        index ? event : { ...event, activity: definedStage('stage', 'integrado', 'annual', 1) },
      ),
    };
    expect(() => prepareOfferCalendarSave(previous, proposed, saveContext(previous))).toThrow(
      /não perde nem troca|Vínculo de atividade inválido/,
    );
  });

  test('confirming the organization by a manual save without rewriting the positions is refused', () => {
    const item = byName('Quantidade anterior de 2 etapas');
    const previous = convertedState({
      ...item.content.state,
      year: item.year,
      campus: item.campus,
    }) as unknown as ActivityState & SaveState;
    previous.events = [1, 2].map((n) =>
      stageEvent(`old-${n}`, unclassifiedStage('stage', 'integrado', n), n + 2),
    );
    const proposed = {
      ...previous,
      offers: previous.offers.map((offer) => ({
        ...offer,
        organization: 'anual' as const,
        stages: { status: 'defined' as const, perTerm: 2 },
      })),
      periods: [
        {
          id: 'annual',
          name: 'Ano letivo',
          start: civilDate('2027-02-01'),
          end: civilDate('2027-12-17'),
          association: {
            status: 'defined' as const,
            offers: ['integrado'],
            term: 'annual' as const,
          },
        },
      ],
    };
    expect(() => prepareOfferCalendarSave(previous, proposed, saveContext(previous))).toThrow(
      'Configure',
    );
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
    expect(Object.fromEntries(linksToReview(next))).toEqual({ [fourth]: 'unclassified' });
  });

  test('annual to semester: annual positions are kept, to review, and the new stages are added', () => {
    const { state, next } = reorganize('semestral', '2');
    for (const event of state.events)
      expect(next.events.find((item) => item.id === event.id)?.activity).toEqual(event.activity);
    const review = linksToReview(next);
    for (const id of stageIds(state)) expect(review.get(id)).toBe('unclassified');
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
  test('a reported stage confirmed in its cycle is the same link; another link shows its row name', () => {
    const item = byName('Quantidade anterior de 2 etapas');
    const before = convertedState({
      ...item.content.state,
      year: item.year,
      campus: item.campus,
    }) as unknown as ActivityState;
    before.events = [1, 2].map((n) =>
      stageEvent(`old-${n}`, unclassifiedStage('stage', 'integrado', n), n + 2),
    );
    const draft = offerOrganizationDraft(before, 'integrado');
    draft.organization = 'anual';
    draft.count = '2';
    draft.periods[0] = { sourceId: '', name: 'Ano', start: '2027-02-01', end: '2027-12-17' };
    draft.stages[0] = { id: 'old-1', start: '2027-03-02', end: '2027-03-12' };
    draft.stages[1] = { id: 'old-2', start: '2027-04-02', end: '2027-04-12' };
    const after = applyOfferOrganization(before, 'integrado', draft, () => 'new');
    expect(after.events.map((event) => event.activity)).toEqual([
      definedStage('stage', 'integrado', 'annual', 1),
      definedStage('stage', 'integrado', 'annual', 2),
    ]);
    const side = (value: ActivityState): DiffSide => ({
      state: value,
      institutionalSnapshot: [],
      documentSnapshot: [],
      catalogueRevision: 0,
    });
    const linkFields = (left: ActivityState, right: ActivityState) =>
      compareContents(side(left), side(right)).events.flatMap((change) =>
        change.fields.filter((field) => field.field === 'activity'),
      );
    expect(linkFields(before, after)).toEqual([]);
    // A different link is shown by the names of the generated rows, never by its key.
    const swapped = {
      ...after,
      events: after.events.map((event, index) =>
        index ? event : { ...event, activity: definedStage('stage', 'integrado', 'annual', 2) },
      ),
    };
    const [field] = linkFields(after, swapped);
    expect(field.text).toEqual({
      before: describeValue('activity', field.before, after),
      after: describeValue('activity', field.after, swapped),
    });
    expect(field.text!.before).not.toMatch(/^stage:/);
    expect(field.text!.before).not.toBe(field.text!.after);
  });
});
