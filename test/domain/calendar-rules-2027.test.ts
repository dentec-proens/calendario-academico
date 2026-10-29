import { expect, test } from 'vitest';
import type { ActivityState, CalendarActivity } from '../../src/domain/calendar/model.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
import { applicabilityFor } from '../../src/domain/policies/registry.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import { prorogatedDeadline } from '../../src/domain/calendar/activities/deadlines.ts';

import { normalizeCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import { applyEvent } from '../../src/domain/calendar/commands/events.ts';
import { applyPeriod } from '../../src/domain/calendar/commands/periods.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'annual',
        name: 'Ano técnico',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', offers: ['integrado', 'subsequente'], term: 'annual' },
      },
      {
        id: 'semester-one',
        name: '1º semestre graduação',
        start: '2027-02-01',
        end: '2027-06-30',
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
      {
        id: 'semester-two',
        name: '2º semestre graduação',
        start: '2027-08-02',
        end: '2027-12-17',
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
        stages: { perTerm: 4 },
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
        stages: { perTerm: 1 },
      },
      {
        id: 'subsequente',
        kind: 'subsequente' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 2 },
      },
    ],
  };
}
function notice(extra: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: 'notice',
    name: 'Edital sintético',
    kind: 'note',
    start: '2026-12-10',
    end: '2026-12-10',
    offers: ['integrado'],
    publicationStatus: 'published',
    admission: { type: 'transfer', year: 2027, term: 'annual', periodId: 'annual' },
    requirementId: 'admission-notice-0',
    ...extra,
  };
}
test('2027 requirements use offer and academic cycle while PE/PIT/RIT remain semester requirements', () => {
  const state = calendar(),
    requirements = activityChecklist(state);
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
        start: '2027-01-15',
        end: '2027-01-15',
        recordType: 'event',
        requirementId: 'enrolment-0',
        offers: ['subsequente'],
      }),
      admission: undefined,
      publicationStatus: undefined,
    },
  ];
  const rows = activityCoverage(state).filter((row) => row.requirement.id === 'enrolment-0');
  expect(rows.find((r) => r.offerId === 'subsequente')).toMatchObject({
    applicability: 'required',
    coverage: 'complete',
  });
  expect(rows.find((r) => r.offerId === 'integrado')?.applicability).toBe('optional');
  expect(
    activityCoverage(state).find(
      (r) => r.offerId === 'graduacao' && r.requirement.id === 'enrolment-1',
    ),
  ).toMatchObject({ applicability: 'required', coverage: 'pending' });
  expect(
    activityCoverage(state).find(
      (r) => r.offerId === 'subsequente' && r.requirement.id === 'registration-0',
    )?.applicability,
  ).toBe('optional');
});
test('mixed organizations count disjoint periods separately and keep simultaneous offers valid on roundtrip', () => {
  const state = calendar();
  const normalized = normalizeCalendar({ ...state, ignoredHistory: [] }),
    count = evaluateCalendar(normalized, []);
  expect(normalized.schemaVersion).toBe(4);
  expect(count.byOffer.integrado.byPeriod).toHaveProperty('annual');
  expect(count.byOffer.integrado.byPeriod).not.toHaveProperty('semester-one');
  expect(count.byOffer.graduacao.byPeriod).not.toHaveProperty('annual');
  expect(() =>
    applyPeriod(
      state,
      {
        name: 'Sobreposição graduação',
        start: '2027-03-01',
        end: '2027-04-01',
        days: '',
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
      [],
      () => 'bad',
    ),
  ).toThrow();
});

test('prior publication keeps dates and destination after manual sources are removed from commands and copies', () => {
  const state = calendar(),
    event = notice();
  const applied = applyEvent(state, event, []),
    saved = normalizeCalendar({ ...applied, ignoredHistory: [] });
  const expected = event;
  expect(saved.events[0]).toMatchObject(expected);
  expect(saved.events[0]).not.toHaveProperty('evidence');
  expect(
    activityCoverage(saved).find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'admission-notice-0',
    )?.coverage,
  ).toBe('complete');
  saved.events[0].admission!.periodId = 'deleted-period';
  expect(
    activityCoverage(saved).find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'admission-notice-0',
    ),
  ).toMatchObject({ coverage: 'partial' });
  expect(saved.events[0].admission?.periodId).toBe('deleted-period');
});
test('planned regular publication remains planned and December requires an explicit adjusted deadline', () => {
  const state = calendar();
  state.events = [
    notice({
      start: '2027-12-01',
      end: '2027-12-01',
      recordType: 'event',
      publicationStatus: 'planned',
      admission: { type: 'regular', year: 2028, term: 'annual' },
      requirementId: 'regular-admission-notice',
    }),
  ];
  expect(
    activityCoverage(state).find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'regular-admission-notice',
    ),
  ).toMatchObject({ coverage: 'partial', execution: 'planned' });
  state.events[0].deadlineAdjustment = { date: '2027-12-02', reviewed: true };
  expect(
    activityCoverage(state).find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'regular-admission-notice',
    ),
  ).toMatchObject({ coverage: 'complete', execution: 'planned' });
  expect(state.events[0].start).toBe('2027-12-01');
  expect(state.events[0].publicationStatus).toBe('planned');
});
test('prior/cross-year references are informative even if the received discriminator claims event', () => {
  const state = calendar();
  for (const changes of [
    { kind: 'include' },
    { kind: 'exclude' },
    { hours: 40 },
    { requirementId: 'pedagogical-training' },
    { requirementId: 'stage-1:integrado' },
  ]) {
    const event = notice({ ...changes, recordType: 'event' });
    expect(() => applyEvent(state, event, [])).toThrow();
    expect(() => normalizeCalendar({ ...state, ignoredHistory: [], events: [event] })).toThrow();
  }
  const old = notice({
    start: '1900-01-01',
    end: '2027-01-02',
    requirementId: undefined,
    admission: undefined,
    publicationStatus: undefined,
  });
  expect(normalizeCalendar({ ...state, ignoredHistory: [], events: [old] }).events[0].start).toBe(
    '1900-01-01',
  );
  for (const changes of [
    { start: '2026-02-30' },
    { end: '2026-01-01' },
    { start: '2028-01-01', end: '2028-01-02' },
    { start: '2026-12-01', end: '2028-01-01' },
    { kind: 'include' },
  ])
    expect(() => applyEvent(state, notice(changes), [])).toThrow();
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
  expect(activityCoverage(state).every((r) => r.applicability === 'unconfigured')).toBe(true);
});

test('article 3 extends only explicitly classified municipal causes to the first teaching day of the offer', () => {
  const state = calendar();
  const holiday: CalendarActivity = {
    id: 'municipal',
    name: 'Feriado municipal sintético',
    start: '2027-08-31',
    end: '2027-09-02',
    kind: 'exclude',
    offers: ['integrado'],
    deadlineExtensionCause: 'municipal-holiday',
  };
  const otherHoliday: CalendarActivity = {
    ...holiday,
    id: 'following',
    start: '2027-09-03',
    end: '2027-09-03',
    deadlineExtensionCause: undefined,
  };
  expect(
    prorogatedDeadline(state, '2027-08-31', [holiday, otherHoliday], 'integrado'),
  ).toMatchObject({ original: '2027-08-31', date: '2027-09-06', source: 'municipal-extension' });
  expect(
    prorogatedDeadline(state, '2027-08-31', [holiday, otherHoliday], 'graduacao'),
  ).toMatchObject({ date: '2027-08-31', source: 'norm' });
  expect(
    prorogatedDeadline(
      state,
      '2027-08-31',
      [{ ...holiday, deadlineExtensionCause: undefined }],
      'integrado',
    ).date,
  ).toBe('2027-08-31');
  expect(
    prorogatedDeadline({ ...state, weekConfirmed: false }, '2027-08-31', [holiday], 'integrado')
      .date,
  ).toBeNull();
  state.events = [
    holiday,
    {
      id: 'robotics',
      name: 'Robótica sintética',
      start: '2027-09-03',
      end: '2027-09-03',
      kind: 'note',
      offers: ['integrado'],
      requirementId: 'robotics',
    },
  ];
  expect(
    activityCoverage(state).find(
      (r) => r.offerId === 'integrado' && r.requirement.id === 'robotics',
    )?.coverage,
  ).toBe('partial');
  expect(state.events[1].start).toBe('2027-09-03');
});
test('repeating the same command is idempotent and another ID cannot duplicate the same occurrence', () => {
  const state = calendar(),
    event = notice(),
    once = applyEvent(state, event, []);
  expect(applyEvent(once, event, []).events).toHaveLength(1);
  expect(() => applyEvent(once, { ...event, name: 'Mudança silenciosa' }, [])).toThrow(
    'identificador',
  );
  const other = notice({ id: 'different-source' });
  expect(() => applyEvent(once, other, [])).toThrow('mesmas datas');
});

test('a legacy event without declared offers remains visible but never covers all offers implicitly', () => {
  const state = calendar();
  state.events = [
    {
      ...notice({
        start: '2027-02-01',
        end: '2027-02-01',
        recordType: 'event',
        requirementId: 'campus-events',
        offers: undefined,
      }),
      admission: undefined,
      publicationStatus: undefined,
    },
  ];
  const rows = activityCoverage(state).filter((row) => row.requirement.id === 'campus-events');
  expect(rows.every((row) => row.coverage === 'partial' && row.events.length === 1)).toBe(true);
  expect(rows.every((row) => row.issues.some((issue) => issue.includes('ofertas')))).toBe(true);
});

test('commands and direct import reject teaching inclusion outside the selected offer periods', () => {
  const state = calendar();
  const event: CalendarActivity = {
    id: 'outside-undergraduate',
    name: 'Inclusão sintética',
    start: '2027-07-20',
    end: '2027-07-20',
    kind: 'include',
    offers: ['graduacao'],
  };
  expect(() => applyEvent(state, event, [])).toThrow('períodos');
  expect(() => normalizeCalendar({ ...state, ignoredHistory: [], events: [event] })).toThrow(
    'períodos',
  );
  const integrated = { ...event, offers: ['integrado'] };
  expect(
    normalizeCalendar({ ...state, ignoredHistory: [], events: [integrated] }).events,
  ).toHaveLength(1);
});

test('preserved duplicate occurrences remain editable after PDF provenance is retired', () => {
  const first = notice({ id: 'preserved-first' });
  const second = notice({ id: 'preserved-second' });
  const third = notice({ id: 'third', name: 'Outra ocorrência' });
  const state = { ...calendar(), events: [first, second, third] };
  const edited = applyEvent(state, { ...first, name: 'Publicação corrigida' }, [], true);
  expect(edited.events.map((item) => item.id)).toEqual(state.events.map((item) => item.id));
  expect(edited.events[0].name).toBe('Publicação corrigida');
  expect(edited.events[0]).not.toHaveProperty('evidence');
  const expectedSecond = second;
  expect(edited.events[1]).toEqual(expectedSecond);
  const cleaned = applyEvent(state, first, []);
  expect(cleaned.events.map((item) => item.id)).toEqual(state.events.map((item) => item.id));
  expect(cleaned.events.every((item) => !Object.hasOwn(item, 'evidence'))).toBe(true);
  expect(applyEvent(cleaned, cleaned.events[0], [])).toBe(cleaned);
  expect(() => applyEvent(state, { ...first, id: 'new-duplicate' }, [])).toThrow('mesmas datas');
  expect(() => applyEvent(state, { ...third, name: first.name }, [], true)).toThrow('mesmas datas');
});
