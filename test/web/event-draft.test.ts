import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { onceLink } from '../helpers/activity-links.ts';
import {
  eventFromValues,
  emptyEvent,
  eventValues,
  activityDraft,
  destinationsByOffer,
  noticeAnswered,
  publicationDeadlineView,
  type EventValues,
} from '../../web/features/calendar-editor/events/event-draft.ts';
import type { CalendarEvent } from '../../web/features/calendar-editor/types.ts';

const saved = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'saved',
  name: 'Registro salvo',
  start: civilDate('2027-05-10'),
  end: civilDate('2027-05-10'),
  effect: 'note',
  offers: ['integrado'],
  ...extra,
});
const edit = (base: CalendarEvent, change: Partial<EventValues> = {}) =>
  eventFromValues({ ...eventValues(base), ...change }, { id: base.id, base });

test('a record without category keeps it absent when its category is left as it was', () => {
  const base = saved({ effect: 'exclude' });
  expect(eventValues(base).category).toBe('recesso');
  const result = edit(base, { name: 'Recesso renomeado' });
  expect(result.category).toBeUndefined();
  expect(result).toMatchObject({ effect: 'exclude', name: 'Recesso renomeado' });
  expect(edit(base, { category: 'feriado' }).category).toBe('feriado');
});

test('the link is not a form value: the date command decides it from the context', () => {
  const base = saved({ activity: onceLink('family-meeting') });
  expect(eventValues(base)).not.toHaveProperty('activity');
  expect(edit(base, { name: 'Encontro revisado' })).not.toHaveProperty('activity');
});

test('a deadline adjustment keeps its date until the form changes it', () => {
  const base = saved({
    activity: onceLink('regular-admission-notice'),
    notice: {
      publication: 'planned',
      admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
    },
    deadlineAdjustment: { date: civilDate('2027-07-01') },
  });
  expect(edit(base, { category: 'evento' }).deadlineAdjustment).toEqual({
    date: civilDate('2027-07-01'),
  });
  expect(edit(base, { adjustedDeadline: '2027-07-02' }).deadlineAdjustment).toEqual({
    date: civilDate('2027-07-02'),
  });
});

test('notice metadata is written only while the free event is answered as a notice', () => {
  const values: EventValues = {
    ...eventValues(saved()),
    eventType: 'notice',
    category: 'prazo',
    admissionType: 'transfer',
    admissionYear: '2027',
    publicationStatus: 'planned',
  };
  expect(eventFromValues(values, { id: 'new' })).toMatchObject({
    notice: { publication: 'planned', admission: { type: 'transfer', year: 2027 } },
  });
  const recess = eventFromValues(
    { ...values, eventType: 'recess', effect: 'exclude', category: 'recesso' },
    { id: 'new' },
  );
  expect(recess.notice).toBeUndefined();
});

const transfer = (destinations: { offerId: string; periodId: string }[]) =>
  saved({
    offers: ['integrado', 'graduacao'],
    notice: {
      publication: 'planned',
      admission: { type: 'transfer', year: 2027, term: 'annual', destinations },
    },
  });

test('the form edits one destination common to every offer of the date', () => {
  const base = transfer([
    { offerId: 'integrado', periodId: 'year' },
    { offerId: 'graduacao', periodId: 'year' },
  ]);
  expect(eventValues(base).admissionPeriodId).toBe('year');
  expect(edit(base).notice).toEqual(base.notice);
  expect(edit(base, { admissionPeriodId: 'other' }).notice?.admission?.destinations).toEqual([
    { offerId: 'integrado', periodId: 'other' },
    { offerId: 'graduacao', periodId: 'other' },
  ]);
  expect(edit(base, { admissionPeriodId: '' }).notice?.admission?.destinations).toEqual([]);
  // A new offer of the date receives the common destination too.
  expect(
    edit(base, { offers: ['integrado', 'graduacao', 'subsequente'] }).notice?.admission
      ?.destinations,
  ).toHaveLength(3);
});

test('each offer may have its own destination, edited one by one', () => {
  const base = transfer([
    { offerId: 'integrado', periodId: 'year' },
    { offerId: 'graduacao', periodId: 'removed' },
  ]);
  expect(eventValues(base).admissionPeriodId).toBe(destinationsByOffer);
  expect(eventValues(base).admissionPeriods).toEqual({ integrado: 'year', graduacao: 'removed' });
  expect(edit(base).notice).toEqual(base.notice);
  // One notice admits to offers whose cycles have their own periods.
  expect(
    edit(base, { admissionPeriods: { integrado: 'year', graduacao: 'first' } }).notice?.admission
      ?.destinations,
  ).toEqual([
    { offerId: 'integrado', periodId: 'year' },
    { offerId: 'graduacao', periodId: 'first' },
  ]);
  // Removing an offer from the date drops only its destination; an offer left blank has none.
  expect(edit(base, { offers: ['graduacao'] }).notice?.admission?.destinations).toEqual([
    { offerId: 'graduacao', periodId: 'removed' },
  ]);
  expect(
    edit(base, { admissionPeriods: { integrado: '', graduacao: 'first' } }).notice?.admission
      ?.destinations,
  ).toEqual([{ offerId: 'graduacao', periodId: 'first' }]);
  expect(edit(base, { admissionPeriodId: 'year' }).notice?.admission?.destinations).toEqual([
    { offerId: 'integrado', periodId: 'year' },
    { offerId: 'graduacao', periodId: 'year' },
  ]);
  // An offer left without destination is not a common destination either.
  expect(
    eventValues(transfer([{ offerId: 'integrado', periodId: 'year' }])).admissionPeriodId,
  ).toBe(destinationsByOffer);
});

test('saving the date form saves the offers chosen in it, as listed', () => {
  const base = saved({
    offers: ['integrado', 'graduacao'],
  });
  // The form starts from the listed offers, never from the current ones.
  expect(eventValues(base).offers).toEqual(['integrado', 'graduacao']);
  expect(edit(base).offers).toEqual(['integrado', 'graduacao']);
  expect(edit(base, { offers: ['graduacao'] }).offers).toEqual(['graduacao']);
  // A new campus date starts with every offer of the calendar.
  expect(
    eventFromValues(
      {
        ...emptyEvent(['integrado', 'graduacao']),
        name: 'Nova data do campus',
        start: '2027-05-11',
        end: '2027-05-11',
        effect: 'note',
      },
      { id: 'new' },
    ).offers,
  ).toEqual(['integrado', 'graduacao']);
});

test('the internal option (art. 18) is a form value: marking and unmarking keep ID, dates and offers', () => {
  const base = saved({ category: 'evento' });
  expect(eventValues(base).internal).toBe(false);
  const marked = edit(base, { internal: true });
  expect(marked).toMatchObject({
    id: base.id,
    start: base.start,
    end: base.end,
    offers: base.offers,
    internal: true,
  });
  const internal = { ...base, internal: true as const };
  expect(eventValues(internal).internal).toBe(true);
  const unmarked = edit(internal, { internal: false });
  expect(unmarked.internal).toBeUndefined();
  expect(unmarked).toMatchObject({ id: base.id, start: base.start, end: base.end });
  expect(emptyEvent(['integrado']).internal).toBe(false);
});

test('the form shows where a regular notice stands against its deadline, as it is typed', () => {
  const state = {
    year: 2027,
    periods: [],
    offers: [],
  } as unknown as Parameters<typeof publicationDeadlineView>[0];
  const requirement = {
    id: 'regular-admission-notice',
    name: 'Edital',
    activity: onceLink('regular-admission-notice'),
    admissionType: 'regular',
    deadline: civilDate('2027-06-15'),
    deadlinePolicy: 'reference',
  } as Parameters<typeof publicationDeadlineView>[1];
  const view = (end: string, adjustedDeadline = '') =>
    publicationDeadlineView(state, requirement, [], {
      end,
      adjustedDeadline,
      offers: ['integrado'],
    });
  expect(view('')).toMatchObject({ standing: 'within', daysLate: 0 });
  expect(view('2027-06-15')).toMatchObject({ standing: 'within', daysLate: 0 });
  expect(view('2027-06-20')).toMatchObject({ standing: 'late', daysLate: 5, limit: '2027-06-15' });
  expect(view('2027-06-20', '2027-06-20')).toMatchObject({ standing: 'adjusted' });
  expect(view('2027-06-20', '2027-06-20')?.issue).toBeUndefined();
  expect(view('2027-06-20', '2026-06-20')?.issue).toContain('posterior a 15 de junho de 2027');
  expect(view('2027-06-20', '2027-06-18')?.issue).toContain('fim da publicação');
  // A year still being typed is not a date yet, even past the deadline as text.
  expect(view('20270-06-10')).toMatchObject({ standing: 'within', daysLate: 0 });
  expect(view('2027-06-20', '20270-06-10')).toMatchObject({ standing: 'late' });
  expect(
    publicationDeadlineView(state, undefined, [], {
      end: '2027-06-20',
      adjustedDeadline: '',
      offers: ['integrado'],
    }),
  ).toBeUndefined();
});

test('an extended deadline is the strictest of the offers, and open while it cannot be determined', () => {
  const state = {
    year: 2027,
    periods: [
      {
        id: 'annual',
        name: 'Anual',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['integrado', 'graduacao'], term: 'annual' },
      },
    ],
    offers: [
      { id: 'integrado', kind: 'integrado' },
      { id: 'graduacao', kind: 'graduacao' },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
  } as unknown as Parameters<typeof publicationDeadlineView>[0];
  const requirement = {
    admissionType: 'regular',
    deadline: civilDate('2027-06-15'),
    deadlinePolicy: 'reference',
  } as Parameters<typeof publicationDeadlineView>[1];
  const holiday = {
    id: 'holiday',
    name: 'Feriado municipal',
    start: civilDate('2027-06-15'),
    end: civilDate('2027-06-15'),
    effect: 'exclude',
    deadlineExtensionCause: 'municipal-holiday',
    offers: ['integrado'],
  } as unknown as Parameters<typeof publicationDeadlineView>[2][number];
  const values = (offers: string[]) => ({ end: '2027-06-16', adjustedDeadline: '', offers });
  expect(
    publicationDeadlineView(state, requirement, [holiday], values(['integrado'])),
  ).toMatchObject({ limit: '2027-06-16', extended: true, standing: 'within' });
  expect(
    publicationDeadlineView(state, requirement, [holiday], values(['integrado', 'graduacao'])),
  ).toMatchObject({ limit: '2027-06-15', standing: 'late', daysLate: 1 });
  expect(
    publicationDeadlineView({ ...state, weekConfirmed: false }, requirement, [holiday], {
      ...values(['integrado']),
    }),
  ).toMatchObject({ limit: null, extended: true, standing: 'late', daysLate: 0 });
  expect(publicationDeadlineView(state, requirement, [], values([]))).toMatchObject({
    limit: '2027-06-15',
  });
});

test('only the answers the activity already gives are stated instead of asked', () => {
  const answered = {
    admissionType: 'regular',
    admissionYear: '2028',
    admissionTerm: 'annual',
    admissionPeriodId: '',
  } as const;
  expect(noticeAnswered(answered, {}, 2027)).toBe(true);
  for (const change of [
    { admissionType: 'transfer' },
    { admissionYear: '2027' },
    { admissionTerm: 'second' },
    { admissionPeriodId: 'annual-2027' },
  ] as const)
    expect(noticeAnswered({ ...answered, ...change }, {}, 2027)).toBe(false);
});

test('a new transfer notice starts with each offer in its own period of the cycle', () => {
  const offer = (id: 'integrado' | 'graduacao') =>
    ({
      id,
      kind: id,
      delivery: 'presencial',
      organization: 'anual',
      scope: { status: 'covered' },
      stages: { status: 'defined', perTerm: 4 },
    }) as const;
  const period = (id: string, offerId: string) => ({
    id,
    name: `Ano — ${offerId}`,
    start: civilDate('2027-02-01'),
    end: civilDate('2027-12-10'),
    association: { status: 'defined' as const, offers: [offerId], term: 'annual' as const },
  });
  const state = {
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    offers: [offer('integrado'), offer('graduacao')],
    periods: [period('year-integrado', 'integrado'), period('year-graduacao', 'graduacao')],
    events: [],
  } as never;
  const requirement = {
    id: 'admission-notice-0',
    name: 'Edital de transferência',
    activity: { kind: 'cycle', id: 'admission-notice', cycle: 'annual' },
    admissionType: 'transfer',
    term: 'annual',
    variant: 'admission-notice',
  } as never;
  const values = activityDraft(state, requirement);
  // No period is shared by both offers, so each one starts with its own.
  expect(values.admissionPeriodId).toBe(destinationsByOffer);
  expect(values.admissionPeriods).toEqual({
    integrado: 'year-integrado',
    graduacao: 'year-graduacao',
  });
});
