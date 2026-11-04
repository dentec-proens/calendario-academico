import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { cycleLink } from '../helpers/activity-links.ts';
import {
  dateEdited,
  linkKept,
  linksToReview,
  validateLinks,
} from '../../src/domain/calendar/activities/links.ts';
import { cascavelDraft, conflictingLinks } from '../fixtures/pending-links-2027.ts';

const moved = <S extends { events: { id: string }[] }>(
  state: S,
  id: string,
  change: Partial<S['events'][number]>,
): S => ({
  ...state,
  events: state.events.map((event) => (event.id === id ? { ...event, ...change } : event)),
});

test('identity of the link: a date that keeps its link needs no generated activity', () => {
  const state = cascavelDraft();
  const event = state.events[0];
  expect(linkKept(event, { ...event, name: 'Outra descrição' })).toBe(true);
  expect(() => validateLinks(state, state)).not.toThrow();
  expect(() => validateLinks(undefined, state)).toThrow(
    /Vínculo de atividade inválido.*“Data sintética final-1” \(21\/07\/2027\)/,
  );
  const added = { ...state, events: [...state.events, { ...event, id: 'new-final-1' }] };
  expect(() => validateLinks(state, added)).toThrow(/new-final-1|21\/07\/2027/);
  expect(() =>
    validateLinks(state, moved(state, event.id, { activity: cycleLink('diary', 'first') })),
  ).toThrow('não perde nem troca');
  expect(() => validateLinks(state, moved(state, event.id, { activity: undefined }))).toThrow(
    'não perde nem troca',
  );
  expect(() =>
    validateLinks(state, { ...state, events: state.events.filter((item) => item !== event) }),
  ).not.toThrow();
});

test('edited date: every interval and association check applies, against unchanged dates too', () => {
  const state = conflictingLinks();
  const first = state.events.find((event) => event.id === 'stage-first')!;
  expect(dateEdited(first, first)).toBe(false);
  expect(dateEdited(first, { ...first, name: 'Nova descrição' })).toBe(false);
  expect(dateEdited(first, { ...first, end: civilDate('2027-03-30') })).toBe(true);
  expect(
    dateEdited(first, {
      ...first,
      offers: ['integrado', 'subsequente'],
    }),
  ).toBe(true);
  expect(() =>
    validateLinks(state, moved(state, 'stage-first', { end: civilDate('2027-04-10') })),
  ).toThrow('sequência');
  expect(() =>
    validateLinks(state, moved(state, 'stage-first', { start: civilDate('2027-01-25') })),
  ).toThrow('período');
  expect(() =>
    validateLinks(
      state,
      moved(state, 'stage-first', {
        offers: ['integrado', 'subsequente'],
      }),
    ),
  ).toThrow('oferta');
  // Still a duplicate: an edit of one of the two dates does not create a valid stage.
  expect(() =>
    validateLinks(state, moved(state, 'stage-twice-b', { end: civilDate('2027-05-21') })),
  ).toThrow('duplicadas');
  expect(() =>
    validateLinks(state, moved(state, 'stage-twice-b', { name: 'Só a descrição' })),
  ).not.toThrow();
});

test('unchanged date: never refused for a conflict, which becomes a review reason', () => {
  const state = conflictingLinks();
  expect(() => validateLinks(state, state)).not.toThrow();
  const reduced = {
    ...state,
    offers: state.offers.map((offer) =>
      offer.id === 'integrado'
        ? { ...offer, stages: { status: 'defined' as const, perTerm: 3 } }
        : offer,
    ),
    periods: state.periods.map((period) => ({ ...period, end: civilDate('2027-11-30') })),
  };
  expect(() => validateLinks(state, reduced)).not.toThrow();
  expect(Object.fromEntries(linksToReview(reduced))).toEqual({
    'stage-twice-a': 'duplicate-stage',
    'stage-twice-b': 'duplicate-stage',
    'stage-late': 'out-of-cycle',
    'stage-early': 'not-generated',
    'teacher-vacation-january': 'not-generated',
    'transfer-notice': 'not-generated',
  });
});

test('the shared diagnostic reports each reason once and leaves valid links out', () => {
  expect(Object.fromEntries(linksToReview(conflictingLinks()))).toEqual({
    'stage-twice-a': 'duplicate-stage',
    'stage-twice-b': 'duplicate-stage',
    'stage-late': 'stage-sequence',
    'stage-early': 'stage-sequence',
    'teacher-vacation-january': 'not-generated',
    'transfer-notice': 'not-generated',
  });
  expect([...linksToReview(cascavelDraft()).values()]).toEqual(Array(10).fill('not-generated'));
});

test('a generated activity of another offer does not cover the date: classification pending', () => {
  const state = conflictingLinks();
  const result = {
    id: 'annual-result',
    name: 'Resultado final do subsequente',
    activity: cycleLink('final', 'annual'),
    start: civilDate('2027-12-17'),
    end: civilDate('2027-12-17'),
    effect: 'note',
    offers: ['subsequente'],
  };
  const annual = { ...state, events: [result] };
  expect(linksToReview(annual).size).toBe(0);
  const semester = {
    ...annual,
    offers: state.offers.map((offer) =>
      offer.id === 'subsequente'
        ? {
            ...offer,
            organization: 'semestral' as const,
            stages: { status: 'defined' as const, perTerm: 1 },
          }
        : offer,
    ),
  };
  expect(linksToReview(semester).get('annual-result')).toBe('not-generated');
});
