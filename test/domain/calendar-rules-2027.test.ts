import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { cycleLink, definedStage, onceLink } from '../helpers/activity-links.ts';
import type { ActivityState, CalendarEvent } from '../../src/domain/calendar/model.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { applicabilityFor } from '../../src/domain/policies/registry.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import { prorogatedDeadline } from '../../src/domain/calendar/activities/deadlines.ts';

import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import { applyDate } from '../helpers/date-commands.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 5 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'annual',
        name: 'Ano técnico',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['integrado', 'subsequente'], term: 'annual' },
      },
      {
        id: 'semester-one',
        name: '1º semestre graduação',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-06-30'),
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
      {
        id: 'semester-two',
        name: '2º semestre graduação',
        start: civilDate('2027-08-02'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['graduacao'], term: 'second' },
      },
    ],
    events: [],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { status: 'defined', perTerm: 4 },
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
        stages: { status: 'defined', perTerm: 1 },
      },
      {
        id: 'subsequente',
        kind: 'subsequente' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { status: 'defined', perTerm: 2 },
      },
    ],
  };
}
function notice(extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'notice',
    name: 'Edital sintético',
    effect: 'note' as const,
    start: civilDate('2026-12-10'),
    end: civilDate('2026-12-10'),
    scope: { offers: ['integrado'], confirmed: true },
    notice: {
      publication: 'published',
      admission: {
        type: 'transfer',
        year: 2027,
        term: 'annual',
        destinations: [{ offerId: 'integrado', periodId: 'annual' }],
      },
    },
    activity: cycleLink('admission-notice', 'annual'),
    ...extra,
  };
}
test('2027 requirements use offer and academic cycle while PE/PIT/RIT remain semester requirements', () => {
  const state = calendar(),
    requirements = activityPlan(state);
  const enrolment = requirements.filter((r) => /^enrolment-/.test(r.id));
  expect(enrolment.find((r) => r.id === 'enrolment-0')?.modalities).toEqual([
    'integrado',
    'subsequente',
  ]);
  expect(
    applicabilityFor(
      state,
      enrolment.find((r) => r.id === 'enrolment-0')!,
      'integrado',
    ),
  ).toBe('optional');
  expect(
    applicabilityFor(
      state,
      enrolment.find((r) => r.id === 'enrolment-0')!,
      'subsequente',
    ),
  ).toBe('required');
  const required = (id: string, modality: string) =>
    applicabilityFor(
      state,
      requirements.find((r) => r.id === id)!,
      modality,
    );
  for (const prefix of ['teaching-plan', 'pit', 'rit'])
    for (const n of [1, 2])
      for (const modality of ['integrado', 'subsequente', 'graduacao'])
        expect(required(`${prefix}-${n}`, modality)).toBe('required');
  expect(required('council-1:graduacao', 'graduacao')).toBe('required');
  for (const modality of ['integrado', 'subsequente', 'graduacao'])
    expect(required('extraordinary-council', modality)).toBe('required');
  const familyMeeting = requirements.find((r) => r.id === 'family-meeting')!;
  expect(familyMeeting.modalities).toEqual(['integrado']);
  expect(applicabilityFor(state, familyMeeting, 'integrado')).toBe('required');
  for (const modality of ['subsequente', 'graduacao'])
    expect(applicabilityFor(state, familyMeeting, modality)).toBe('optional');
  expect(requirements.find((r) => r.id === 'ethics-week')).toMatchObject({
    month: 5,
    basis: 'Art. 11, XXV',
  });
});
test('one event covers only the explicitly declared offers and does not waive veterans for absent intake', () => {
  const state = calendar();
  state.offers = state.offers.map((offer) => ({
    ...offer,
    intake: offer.id === 'subsequente' ? { annual: { status: 'no' } } : undefined,
  }));
  state.events = [
    {
      ...notice({
        id: 'veterans',
        start: civilDate('2027-01-15'),
        end: civilDate('2027-01-15'),
        activity: cycleLink('enrolment', 'annual'),
        scope: { offers: ['subsequente'], confirmed: true },
      }),
      notice: undefined,
    },
  ];
  const rows = evaluatePlan(state).rows.filter((row) => row.requirement.id === 'enrolment-0');
  expect(rows.find((r) => r.offerId === 'subsequente')).toMatchObject({
    applicability: 'required',
    coverage: 'complete',
  });
  expect(rows.find((r) => r.offerId === 'integrado')?.applicability).toBe('optional');
  expect(
    evaluatePlan(state).rows.find(
      (r) => r.offerId === 'graduacao' && r.requirement.id === 'enrolment-1',
    ),
  ).toMatchObject({ applicability: 'required', coverage: 'pending' });
  expect(
    evaluatePlan(state).rows.find(
      (r) => r.offerId === 'subsequente' && r.requirement.id === 'registration-0',
    )?.applicability,
  ).toBe('optional');
});
test('mixed organizations count disjoint periods separately and keep simultaneous offers valid on roundtrip', () => {
  const state = calendar();
  const normalized = normalizeOfferCalendar({ ...state, ignoredHistory: [] }),
    count = evaluateCalendar(normalized, []);
  expect(normalized.schemaVersion).toBe(5);
  expect(count.byOffer.integrado.byPeriod).toHaveProperty('annual');
  expect(count.byOffer.integrado.byPeriod).not.toHaveProperty('semester-one');
  expect(count.byOffer.graduacao.byPeriod).not.toHaveProperty('annual');
  expect(() =>
    normalizeOfferCalendar({
      ...state,
      periods: [
        ...state.periods,
        {
          id: 'bad',
          name: 'Sobreposição graduação',
          start: civilDate('2027-03-01'),
          end: civilDate('2027-04-01'),
          association: { status: 'defined', offers: ['graduacao'], term: 'first' },
        },
      ],
    }),
  ).toThrow();
});

test('prior publication keeps dates and destination after manual sources are removed from commands and copies', () => {
  const state = calendar(),
    event = notice();
  const applied = applyDate(state, event, []),
    saved = normalizeOfferCalendar({ ...applied, ignoredHistory: [] });
  const expected = event;
  expect(saved.events[0]).toMatchObject(expected);
  expect(saved.events[0]).not.toHaveProperty('evidence');
  expect(
    evaluatePlan(saved).rows.find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'admission-notice-0',
    )?.coverage,
  ).toBe('complete');
  saved.events[0].notice!.admission!.destinations[0].periodId = 'deleted-period';
  expect(
    evaluatePlan(saved).rows.find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'admission-notice-0',
    ),
  ).toMatchObject({ coverage: 'partial' });
  expect(saved.events[0].notice?.admission?.destinations).toEqual([
    { offerId: 'integrado', periodId: 'deleted-period' },
  ]);
});
test('planned regular publication remains planned and December requires an explicit adjusted deadline', () => {
  const state = calendar();
  state.events = [
    notice({
      start: civilDate('2027-12-01'),
      end: civilDate('2027-12-01'),
      notice: {
        publication: 'planned',
        admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
      },
      activity: onceLink('regular-admission-notice'),
    }),
  ];
  expect(
    evaluatePlan(state).rows.find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'regular-admission-notice',
    ),
  ).toMatchObject({ coverage: 'partial', execution: 'planned' });
  state.events[0].deadlineAdjustment = { date: civilDate('2027-12-02'), reviewed: true };
  expect(
    evaluatePlan(state).rows.find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'regular-admission-notice',
    ),
  ).toMatchObject({ coverage: 'complete', execution: 'planned' });
  expect(state.events[0].start).toBe('2027-12-01');
  expect(state.events[0].notice?.publication).toBe('planned');
});
test('prior/cross-year references are informative even if the received discriminator claims event', () => {
  const state = calendar();
  for (const changes of [
    { effect: 'include' as const },
    { effect: 'exclude' as const },
    { hours: 40 },
    { activity: onceLink('pedagogical-training') },
    { activity: definedStage('stage', 'integrado', 'annual', 1) },
  ]) {
    const event = notice(changes);
    expect(() => applyDate(state, event, [])).toThrow();
    expect(() =>
      normalizeOfferCalendar({ ...state, ignoredHistory: [], events: [event] }),
    ).toThrow();
  }
  const old = notice({
    start: civilDate('1900-01-01'),
    end: civilDate('2027-01-02'),
    activity: undefined,
    notice: undefined,
  });
  expect(
    normalizeOfferCalendar({ ...state, ignoredHistory: [], events: [old] }).events[0].start,
  ).toBe('1900-01-01');
  expect(() =>
    normalizeOfferCalendar({ ...state, events: [{ ...old, start: '2026-02-30' }] }),
  ).toThrow();
  for (const changes of [
    { end: civilDate('2026-01-01') },
    { start: civilDate('2028-01-01'), end: civilDate('2028-01-02') },
    { start: civilDate('2026-12-01'), end: civilDate('2028-01-01') },
    { effect: 'include' as const },
  ])
    expect(() => applyDate(state, notice(changes), [])).toThrow();
});
test('postgraduate and other years are not implicitly certified by 2027', () => {
  expect(
    rulesetVersion({
      year: 2027,
      offers: [
        {
          id: 'posgraduacao',
          kind: 'posgraduacao' as const,
          delivery: 'a-conferir' as const,
          organization: 'anual' as const,
        },
      ],
    }),
  ).toBe('unconfigured:2027');
  expect(
    rulesetVersion({
      year: 2028,
      offers: [
        {
          id: 'integrado',
          kind: 'integrado' as const,
          delivery: 'a-conferir' as const,
          organization: 'anual' as const,
        },
      ],
    }),
  ).toBe('unconfigured:2028');
  const state = {
    ...calendar(),
    offers: [
      {
        id: 'posgraduacao',
        kind: 'posgraduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  };
  expect(evaluatePlan(state).rows.every((r) => r.applicability === 'unconfigured')).toBe(true);
});

test('article 3 extends only explicitly classified municipal causes to the first teaching day of the offer', () => {
  const state = calendar();
  const holiday: CalendarEvent = {
    id: 'municipal',
    name: 'Feriado municipal sintético',
    start: civilDate('2027-08-31'),
    end: civilDate('2027-09-02'),
    effect: 'exclude' as const,
    scope: { offers: ['integrado'], confirmed: true },
    deadlineExtensionCause: 'municipal-holiday',
  };
  const otherHoliday: CalendarEvent = {
    ...holiday,
    id: 'following',
    start: civilDate('2027-09-03'),
    end: civilDate('2027-09-03'),
    deadlineExtensionCause: undefined,
  };
  expect(
    prorogatedDeadline(state, civilDate('2027-08-31'), [holiday, otherHoliday], 'integrado'),
  ).toMatchObject({
    original: '2027-08-31',
    date: civilDate('2027-09-06'),
    source: 'municipal-extension',
  });
  expect(
    prorogatedDeadline(state, civilDate('2027-08-31'), [holiday, otherHoliday], 'graduacao'),
  ).toMatchObject({ date: civilDate('2027-08-31'), source: 'norm' });
  expect(
    prorogatedDeadline(
      state,
      civilDate('2027-08-31'),
      [{ ...holiday, deadlineExtensionCause: undefined }],
      'integrado',
    ).date,
  ).toBe('2027-08-31');
  expect(
    prorogatedDeadline(
      { ...state, weekConfirmed: false },
      civilDate('2027-08-31'),
      [holiday],
      'integrado',
    ).date,
  ).toBeNull();
  state.events = [
    holiday,
    {
      id: 'robotics',
      name: 'Robótica sintética',
      start: civilDate('2027-09-03'),
      end: civilDate('2027-09-03'),
      effect: 'note' as const,
      scope: { offers: ['integrado'], confirmed: true },
      activity: onceLink('robotics'),
    },
  ];
  expect(
    evaluatePlan(state).rows.find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'robotics',
    )?.coverage,
  ).toBe('partial');
  expect(state.events[1].start).toBe('2027-09-03');
});
test('repeating the same command is idempotent and another ID cannot duplicate the same occurrence', () => {
  const state = calendar(),
    event = notice(),
    once = applyDate(state, event, []);
  expect(applyDate(once, event, []).events).toHaveLength(1);
  expect(() => applyDate(once, { ...event, name: 'Mudança silenciosa' }, [])).toThrow(
    'identificador',
  );
  const other = notice({ id: 'different-source' });
  expect(() => applyDate(once, other, [])).toThrow('mesmas datas');
});

test('an unconfirmed scope remains visible but never covers its offers in 2027', () => {
  const state = calendar();
  state.events = [
    {
      ...notice({
        start: civilDate('2027-02-01'),
        end: civilDate('2027-02-01'),
        activity: onceLink('campus-events'),
        scope: { offers: state.offers.map((offer) => offer.id), confirmed: false },
      }),
      notice: undefined,
    },
  ];
  const rows = evaluatePlan(state).rows.filter((row) => row.requirement.id === 'campus-events');
  expect(rows.every((row) => row.coverage === 'partial' && row.events.length === 1)).toBe(true);
  expect(rows.every((row) => row.issues.some((issue) => issue.includes('ofertas')))).toBe(true);
});

test('commands and direct import reject teaching inclusion outside the selected offer periods', () => {
  const state = calendar();
  const event: CalendarEvent = {
    id: 'outside-undergraduate',
    name: 'Inclusão sintética',
    start: civilDate('2027-07-20'),
    end: civilDate('2027-07-20'),
    effect: 'include' as const,
    scope: { offers: ['graduacao'], confirmed: true },
  };
  expect(() => applyDate(state, event, [])).toThrow('períodos');
  expect(() => normalizeOfferCalendar({ ...state, ignoredHistory: [], events: [event] })).toThrow(
    'períodos',
  );
  const integrated = { ...event, scope: { offers: ['integrado'], confirmed: true } };
  expect(
    normalizeOfferCalendar({ ...state, ignoredHistory: [], events: [integrated] }).events,
  ).toHaveLength(1);
});

test('preserved duplicate occurrences remain editable after PDF provenance is retired', () => {
  const first = notice({ id: 'preserved-first' });
  const second = notice({ id: 'preserved-second' });
  const third = notice({ id: 'third', name: 'Outra ocorrência' });
  const state = { ...calendar(), events: [first, second, third] };
  const edited = applyDate(state, { ...first, name: 'Publicação corrigida' }, [], true);
  expect(edited.events.map((item) => item.id)).toEqual(state.events.map((item) => item.id));
  expect(edited.events[0].name).toBe('Publicação corrigida');
  expect(edited.events[0]).not.toHaveProperty('evidence');
  const expectedSecond = second;
  expect(edited.events[1]).toEqual(expectedSecond);
  const cleaned = applyDate(state, first, []);
  expect(cleaned.events.map((item) => item.id)).toEqual(state.events.map((item) => item.id));
  expect(cleaned.events.every((item) => !Object.hasOwn(item, 'evidence'))).toBe(true);
  expect(applyDate(cleaned, cleaned.events[0], [])).toBe(cleaned);
  expect(() => applyDate(state, { ...first, id: 'new-duplicate' }, [])).toThrow('mesmas datas');
  expect(() => applyDate(state, { ...third, name: first.name }, [], true)).toThrow('mesmas datas');
});
