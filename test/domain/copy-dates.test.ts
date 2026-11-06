import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  applyCopiedDates,
  copiedVacationsId,
  copyList,
  type CopyCandidate,
} from '../../src/domain/calendar/commands/copy-dates.ts';
import type {
  CalendarContent,
  CalendarEvent,
  CalendarOffer,
  OfferKind,
} from '../../src/domain/calendar/model.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import { cycleLink, definedStage, onceLink } from '../helpers/activity-links.ts';

type State = CalendarContent & { year: number; campus: string };

const offer = (kind: OfferKind, organization: 'anual' | 'semestral' = 'anual'): CalendarOffer => ({
  id: kind,
  kind,
  delivery: 'presencial',
  organization,
  scope: { status: 'covered' },
});

const calendar = (offers: CalendarOffer[], changes: Partial<State> = {}): State => ({
  schemaVersion: 6,
  year: 2027,
  campus: 'Exemplo',
  offers,
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [],
  events: [],
  ...changes,
});

const date = (id: string, changes: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  name: id,
  start: civilDate('2027-09-20'),
  end: civilDate('2027-09-20'),
  effect: 'exclude',
  category: 'feriado',
  offers: ['integrado', 'subsequente'],
  ...changes,
});

const secondary = () => [offer('integrado'), offer('subsequente')];
const graduation = (changes: Partial<State> = {}) =>
  calendar([offer('graduacao', 'semestral')], changes);
const list = (source: State, target = graduation()) => copyList(target, source, ['graduacao']);
const candidate = (candidates: CopyCandidate[], id: string) =>
  candidates.find((item) => item.id === id)!;
const ids = (() => {
  let next = 0;
  return () => `copy-${++next}`;
})();

describe('copyList', () => {
  test('marks a date of every offer of the source, the likely date of the whole campus', () => {
    const source = calendar(secondary(), { events: [date('Aniversário do município')] });
    const { candidates } = list(source);
    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'Aniversário do município',
        group: 'shared',
        suggested: true,
        effect: 'exclude',
      }),
    ]);
    expect(candidates[0]).not.toHaveProperty('sourceOffers');
  });

  test('leaves unmarked a date of part of the offers and says which', () => {
    const source = calendar(secondary(), {
      events: [date('Recesso do integrado', { offers: ['integrado'] })],
    });
    expect(list(source).candidates[0]).toMatchObject({
      group: 'partial',
      suggested: false,
      sourceOffers: ['Técnico integrado'],
    });
  });

  test('leaves unmarked a linked date, which would count as fulfilment', () => {
    const source = calendar(secondary(), {
      events: [
        date('Semana da Ética', {
          activity: onceLink('ethics-week'),
          start: civilDate('2027-05-03'),
          end: civilDate('2027-05-07'),
          effect: 'note',
          category: 'evento',
        }),
      ],
    });
    expect(list(source).candidates[0]).toMatchObject({
      group: 'activity',
      suggested: false,
      activity: { optional: true },
    });
  });

  test('warns about a notice published in the source', () => {
    const source = calendar(secondary(), {
      events: [
        date('Edital', {
          effect: 'note',
          category: 'prazo',
          notice: { publication: 'published' },
        }),
      ],
    });
    expect(list(source).candidates[0]).toMatchObject({
      group: 'activity',
      suggested: false,
      warning: expect.stringContaining('publicada'),
    });
  });

  test('blocks an added school day outside the periods, until they exist', () => {
    const saturday = date('Sábado letivo', {
      start: civilDate('2027-03-13'),
      end: civilDate('2027-03-13'),
      effect: 'include',
      category: 'sabado',
    });
    const source = calendar(secondary(), { events: [saturday] });
    expect(list(source).candidates[0]).toMatchObject({
      group: 'blocked',
      suggested: false,
      needsPeriods: true,
    });
    const withPeriods = graduation({
      periods: [
        {
          id: 'first',
          name: '1º semestre',
          start: civilDate('2027-02-15'),
          end: civilDate('2027-07-02'),
          association: { status: 'defined', offers: ['graduacao'], term: 'first' },
        },
      ],
    });
    expect(list(source, withPeriods).candidates[0]).toMatchObject({
      group: 'shared',
      suggested: true,
    });
    expect(list(source, withPeriods).candidates[0]).not.toHaveProperty('blockedBy');
  });

  test('blocks an activity this calendar does not generate', () => {
    const source = calendar(secondary(), {
      events: [date('Matrícula anual', { activity: cycleLink('final', 'annual'), effect: 'note' })],
    });
    expect(list(source).candidates[0]).toMatchObject({
      group: 'blocked',
      blockedBy: 'Esta atividade não existe na organização atual deste calendário.',
    });
  });

  test('leaves stage dates out: their position belongs to the offer', () => {
    const source = calendar(secondary(), {
      events: [
        date('1ª etapa', {
          activity: definedStage('stage', 'integrado', 'annual', 1),
          offers: ['integrado'],
        }),
      ],
    });
    expect(list(source)).toEqual({ candidates: [], alreadyPresent: 0, omitted: 1 });
  });

  test('counts instead of listing a date this calendar already has', () => {
    const source = calendar(secondary(), { events: [date('Feriado'), date('Outro feriado')] });
    const target = graduation({
      events: [date(' feriado ', { id: 'mine', offers: ['graduacao'] })],
    });
    const { candidates, alreadyPresent } = list(source, target);
    expect(alreadyPresent).toBe(1);
    expect(candidates.map((item) => item.id)).toEqual(['Outro feriado']);
  });

  test('offers teacher vacations as one choice and warns before replacing others', () => {
    const vacations = {
      firstStart: civilDate('2027-01-03'),
      firstEnd: civilDate('2027-02-01'),
      secondStart: civilDate('2027-07-12'),
      secondEnd: civilDate('2027-07-26'),
    };
    const source = calendar(secondary(), {
      teacherVacations: vacations,
      events: [date('teacher-vacation-january'), date('teacher-vacation-july')],
    });
    const { candidates } = list(source);
    expect(candidates).toHaveLength(1);
    expect(candidate(candidates, copiedVacationsId)).toMatchObject({
      group: 'shared',
      suggested: true,
      periods: [
        { start: '2027-01-03', end: '2027-02-01' },
        { start: '2027-07-12', end: '2027-07-26' },
      ],
    });
    const other = {
      firstStart: civilDate('2027-01-04'),
      firstEnd: civilDate('2027-02-02'),
    };
    const replacing = list(source, graduation({ teacherVacations: other })).candidates[0];
    expect(replacing).toMatchObject({
      suggested: false,
      warning: expect.stringContaining('Substitui'),
    });
    expect(list(source, graduation({ teacherVacations: vacations }))).toEqual({
      candidates: [],
      alreadyPresent: 1,
      omitted: 0,
    });
  });

  test('treats records for different offers that become the same date as one choice', () => {
    const source = calendar(secondary(), {
      events: [
        date('Recesso', { id: 'a', offers: ['integrado'] }),
        date('Recesso', { id: 'b', offers: ['subsequente'] }),
      ],
    });
    const { candidates } = list(source);
    expect(candidates).toEqual([
      expect.objectContaining({ id: 'a', group: 'shared', suggested: true }),
    ]);
    expect(applyCopiedDates(graduation(), source, ['a'], ['graduacao'], ids).events).toHaveLength(
      1,
    );
  });

  test('does not take an ID shared with the source for a date already recorded', () => {
    const source = calendar(secondary(), { events: [date('Novo nome', { id: 'shared-id' })] });
    const target = graduation({
      events: [date('Nome anterior', { id: 'shared-id', offers: ['graduacao'] })],
    });
    expect(list(source, target).candidates[0]).toMatchObject({ group: 'shared', suggested: true });
  });

  test('leaves unmarked a planned notice without a link', () => {
    const source = calendar(secondary(), {
      events: [
        date('Edital', { effect: 'note', category: 'prazo', notice: { publication: 'planned' } }),
      ],
    });
    expect(list(source).candidates[0]).toMatchObject({
      group: 'activity',
      suggested: false,
      warning: expect.stringContaining('edital'),
    });
  });

  test('lists a date this calendar has only for part of the offers chosen', () => {
    const source = calendar(secondary(), { events: [date('Feriado')] });
    const target = calendar([offer('graduacao'), offer('posgraduacao')], {
      events: [date('Feriado', { id: 'mine', offers: ['graduacao'] })],
    });
    expect(copyList(target, source, ['graduacao', 'posgraduacao']).candidates).toHaveLength(1);
    expect(copyList(target, source, ['graduacao'])).toMatchObject({
      candidates: [],
      alreadyPresent: 1,
    });
  });

  test('sorts by date and refuses a calendar of another year', () => {
    const source = calendar(secondary(), {
      events: [
        date('Depois'),
        date('Antes', { start: civilDate('2027-04-01'), end: civilDate('2027-04-01') }),
      ],
    });
    expect(list(source).candidates.map((item) => item.id)).toEqual(['Antes', 'Depois']);
    expect(() => list({ ...source, year: 2028 })).toThrow(/mesmo ano/);
  });
});

describe('applyCopiedDates', () => {
  const source = calendar(secondary(), {
    events: [
      date('Feriado', { hours: 8 }),
      date('Ignorado'),
      date('Edital', {
        effect: 'note',
        category: 'prazo',
        notice: {
          publication: 'published',
          admission: {
            type: 'regular',
            year: 2028,
            term: 'annual',
            destinations: [{ offerId: 'integrado', periodId: 'p1' }],
          },
        },
      }),
    ],
  });

  test('copies only the chosen dates, with new IDs, this calendar offers and no destinations', () => {
    const next = applyCopiedDates(graduation(), source, ['Feriado', 'Edital'], ['graduacao'], ids);
    expect(next.events.map((event) => event.name)).toEqual(['Feriado', 'Edital']);
    for (const event of next.events) {
      expect(event.id).toMatch(/^copy-/);
      expect(event.offers).toEqual(['graduacao']);
    }
    expect(next.events[0].hours).toBe(8);
    expect(next.events[1].notice).toEqual({
      publication: 'published',
      admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
    });
    expect(() => normalizeOfferCalendar(next, graduation())).not.toThrow();
  });

  test('does not touch the source: the two calendars are independent from here on', () => {
    const before = structuredClone(source);
    const next = applyCopiedDates(graduation(), source, ['Feriado'], ['graduacao'], ids);
    expect(source).toEqual(before);
    expect(next.events[0]).not.toBe(source.events[0]);
    expect(copyList(next, source, ['graduacao']).alreadyPresent).toBe(1);
    const corrected = {
      ...source,
      events: [date('Feriado', { start: civilDate('2027-09-21'), end: civilDate('2027-09-21') })],
    };
    expect(copyList(next, corrected, ['graduacao']).candidates).toHaveLength(1);
  });

  test('copies teacher vacations through their command, reaching every offer', () => {
    const vacations = {
      firstStart: civilDate('2027-01-03'),
      firstEnd: civilDate('2027-02-01'),
    };
    const next = applyCopiedDates(
      graduation(),
      calendar(secondary(), { teacherVacations: vacations }),
      [copiedVacationsId],
      ['graduacao'],
      ids,
    );
    expect(next.teacherVacations).toEqual(vacations);
    expect(next.events).toEqual([
      expect.objectContaining({ id: 'teacher-vacation-january', offers: ['graduacao'] }),
    ]);
  });

  test('applies all or none, naming the date refused', () => {
    const blocked = calendar(secondary(), {
      events: [
        date('Feriado'),
        date('Sábado', {
          start: civilDate('2027-03-13'),
          end: civilDate('2027-03-13'),
          effect: 'include',
          category: 'sabado',
        }),
      ],
    });
    const target = graduation();
    expect(() =>
      applyCopiedDates(target, blocked, ['Feriado', 'Sábado'], ['graduacao'], ids),
    ).toThrow(/^Sábado: /);
    expect(target.events).toEqual([]);
  });

  test('adds only the offers missing from a date this calendar already has', () => {
    const target = calendar([offer('graduacao'), offer('posgraduacao')], {
      events: [date('Feriado', { id: 'mine', offers: ['graduacao'] })],
    });
    const next = applyCopiedDates(target, source, ['Feriado'], ['graduacao', 'posgraduacao'], ids);
    expect(next.events.map((event) => event.offers)).toEqual([['graduacao'], ['posgraduacao']]);
  });

  test('says so when the copy goes over the limit of dates', () => {
    const full = graduation({
      events: Array.from({ length: 1000 }, (_, index) =>
        date(`Data ${index}`, { offers: ['graduacao'] }),
      ),
    });
    expect(() => applyCopiedDates(full, source, ['Feriado'], ['graduacao'], ids)).toThrow(
      /até 1000 datas/,
    );
  });

  test('refuses a calendar of another year', () => {
    expect(() =>
      applyCopiedDates(graduation(), { ...source, year: 2028 }, [], ['graduacao'], ids),
    ).toThrow(/mesmo ano/);
  });
});

describe('Saturdays reach the offers with a period on the day', () => {
  const saturday = date('Reposição', {
    start: civilDate('2027-03-06'),
    end: civilDate('2027-03-06'),
    effect: 'include',
    category: 'sabado',
  });
  const period = (offerId: string, start: string, end: string) => ({
    id: `period-${offerId}`,
    name: offerId,
    start: civilDate(start),
    end: civilDate(end),
    association: { status: 'defined' as const, offers: [offerId], term: 'annual' as const },
  });
  const source = calendar(secondary(), {
    periods: [
      period('integrado', '2027-02-01', '2027-12-17'),
      period('subsequente', '2027-02-01', '2027-12-17'),
    ],
    events: [saturday],
  });
  const chosen = ['integrado', 'subsequente'];

  test('an offer without a period stays out instead of blocking the date', () => {
    const target = calendar(secondary(), {
      periods: [period('integrado', '2027-02-01', '2027-12-17')],
    });
    const item = candidate(copyList(target, source, chosen).candidates, 'Reposição');
    expect(item.group).toBe('activity');
    expect(item.suggested).toBe(false);
    expect(item.blockedBy).toBeUndefined();
    expect(item.warning).toContain('Valerá só para Técnico integrado');
    const copied = applyCopiedDates(target, source, ['Reposição'], chosen, ids);
    expect(copied.events.map((event) => event.offers)).toEqual([['integrado']]);
  });

  test('no offer in period blocks the date and names the offers', () => {
    const target = calendar(secondary());
    const item = candidate(copyList(target, source, chosen).candidates, 'Reposição');
    expect(item.needsPeriods).toBe(true);
    expect(item.blockedBy).toContain('Fora dos períodos');
    expect(item.blockedBy).toContain('Técnico integrado e Técnico subsequente');
    expect(() => applyCopiedDates(target, source, ['Reposição'], chosen, ids)).toThrow(
      /Reposição: Fora dos períodos/,
    );
  });

  test('a Saturday recorded for one offer reaches only what is still missing', () => {
    const target = calendar(secondary(), {
      periods: source.periods,
      events: [{ ...saturday, id: 'own', offers: ['integrado'] }],
    });
    const copied = applyCopiedDates(target, source, ['Reposição'], chosen, ids);
    expect(copied.events.map((event) => event.offers)).toEqual([['integrado'], ['subsequente']]);
  });

  test('other inclusions still need a period for every offer', () => {
    const week = date('Semana', {
      start: civilDate('2027-03-01'),
      end: civilDate('2027-03-05'),
      effect: 'include',
      category: 'institucional',
    });
    const target = calendar(secondary(), {
      periods: [period('integrado', '2027-02-01', '2027-12-17')],
    });
    const item = candidate(
      copyList(target, { ...source, events: [week] }, chosen).candidates,
      'Semana',
    );
    expect(item.needsPeriods).toBe(true);
  });
});
