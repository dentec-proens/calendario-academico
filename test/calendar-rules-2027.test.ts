import { expect, test } from 'vitest';
import type { ActivityState, CalendarActivity } from '../src/domain-types.ts';
import { activityChecklist } from '../src/obligations.ts';
import {
  activityCoverage,
  applicabilityFor,
  rulesetVersion,
  prorogatedDeadline,
} from '../src/calendar-rules/index.ts';
import { convertCalendarV2 } from '../src/calendar-rules/conversion.ts';
import { normalizeCalendar } from '../src/calendar-normalize.ts';
import { applyEvent, applyPeriod } from '../src/calendar-edits/commands.ts';
import { evaluateCalendar } from '../src/evaluation.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 3,
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado', 'graduacao', 'subsequente'],
    regime: 'misto',
    organizationByModality: { integrado: 'anual', graduacao: 'semestral', subsequente: 'anual' },
    assessmentStagesByModality: { integrado: 4, graduacao: 2, subsequente: 2 },
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata sintética',
    periods: [
      {
        id: 'annual',
        name: 'Ano técnico',
        start: '2027-02-01',
        end: '2027-12-17',
        association: {
          status: 'defined',
          modalities: ['integrado', 'subsequente'],
          term: 'annual',
        },
      },
      {
        id: 'semester-one',
        name: '1º semestre graduação',
        start: '2027-02-01',
        end: '2027-06-30',
        association: { status: 'defined', modalities: ['graduacao'], term: 'first' },
      },
      {
        id: 'semester-two',
        name: '2º semestre graduação',
        start: '2027-08-02',
        end: '2027-12-17',
        association: { status: 'defined', modalities: ['graduacao'], term: 'second' },
      },
    ],
    events: [],
  };
}
function notice(extra: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: 'notice',
    name: 'Edital sintético',
    kind: 'note',
    evidence: 'Publicação sintética',
    start: '2026-12-10',
    end: '2026-12-10',
    modalities: ['integrado'],
    recordType: 'prior-reference',
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
  for (const prefix of ['teaching-plan', 'pit', 'rit'])
    for (const n of [1, 2])
      expect(requirements.find((r) => r.id === `${prefix}-${n}`)?.required).toBe(true);
  for (const id of ['council-1:graduacao', 'family-meeting', 'extraordinary-council'])
    expect(requirements.find((r) => r.id === id)?.required).toBe(true);
  expect(requirements.find((r) => r.id === 'ethics-week')).toMatchObject({
    month: 5,
    basis: 'Art. 11, XXV',
  });
});
test('one event covers only the explicitly declared offers and does not waive veterans for absent intake', () => {
  const state = calendar();
  state.intakeByModality = {
    subsequente: { annual: { status: 'no', source: 'Regra local sintética' } },
  };
  state.events = [
    {
      ...notice({
        id: 'veterans',
        start: '2027-01-15',
        end: '2027-01-15',
        recordType: 'event',
        requirementId: 'enrolment-0',
        modalities: ['subsequente'],
      }),
      admission: undefined,
      publicationStatus: undefined,
    },
  ];
  const rows = activityCoverage(state).filter((row) => row.requirement.id === 'enrolment-0');
  expect(rows.find((r) => r.modality === 'subsequente')).toMatchObject({
    applicability: 'required',
    coverage: 'complete',
  });
  expect(rows.find((r) => r.modality === 'integrado')?.applicability).toBe('optional');
  expect(
    activityCoverage(state).find(
      (r) => r.modality === 'graduacao' && r.requirement.id === 'enrolment-1',
    ),
  ).toMatchObject({ applicability: 'required', coverage: 'pending' });
  expect(
    activityCoverage(state).find(
      (r) => r.modality === 'subsequente' && r.requirement.id === 'registration-0',
    )?.applicability,
  ).toBe('optional');
});
test('mixed organizations count disjoint periods separately and keep simultaneous offers valid on roundtrip', () => {
  const state = calendar();
  const normalized = normalizeCalendar({ ...state, ignoredHistory: [] }),
    count = evaluateCalendar(normalized, []);
  expect(normalized.schemaVersion).toBe(3);
  expect(count.byModality.integrado.byPeriod).toHaveProperty('annual');
  expect(count.byModality.integrado.byPeriod).not.toHaveProperty('semester-one');
  expect(count.byModality.graduacao.byPeriod).not.toHaveProperty('annual');
  expect(() =>
    applyPeriod(
      state,
      {
        name: 'Sobreposição graduação',
        start: '2027-03-01',
        end: '2027-04-01',
        days: '',
        association: { status: 'defined', modalities: ['graduacao'], term: 'first' },
      },
      [],
      () => 'bad',
    ),
  ).toThrow();
});
test('ambiguous v2 mixed organization preserves dates/ids without inventing scoped periods', () => {
  const state = calendar();
  delete state.organizationByModality;
  state.schemaVersion = 2;
  state.periods = state.periods.slice(1).map(({ association: _association, ...period }) => period);
  const original = structuredClone(state),
    converted = convertCalendarV2(state);
  expect(converted.conversion?.organization).toBe('pending');
  expect(converted.periods.map((p) => [p.id, p.start, p.end])).toEqual(
    state.periods.map((p) => [p.id, p.start, p.end]),
  );
  expect(converted.periods.every((p) => p.association?.status === 'a-classificar')).toBe(true);
  expect(() => evaluateCalendar(converted, [])).toThrow('Organização a conferir');
  expect(state).toEqual(original);
});
test('prior publication keeps dates and destination after manual sources are removed from commands and copies', () => {
  const state = calendar(),
    event = notice();
  const applied = applyEvent(state, event, []),
    saved = normalizeCalendar({ ...applied, ignoredHistory: [] });
  const { evidence: _manualSource, ...expected } = event;
  expect(saved.events[0]).toMatchObject(expected);
  expect(saved.events[0]).not.toHaveProperty('evidence');
  expect(
    activityCoverage(saved).find(
      (r) => r.modality === 'integrado' && r.requirement.id === 'admission-notice-0',
    )?.coverage,
  ).toBe('complete');
  saved.events[0].admission!.periodId = 'deleted-period';
  expect(
    activityCoverage(saved).find(
      (r) => r.modality === 'integrado' && r.requirement.id === 'admission-notice-0',
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
      (r) => r.modality === 'integrado' && r.requirement.id === 'regular-admission-notice',
    ),
  ).toMatchObject({ coverage: 'partial', execution: 'planned' });
  state.events[0].deadlineAdjustment = {
    date: '2027-12-02',
    evidence: 'Cronograma ajustado sintético para conferência',
    reviewed: true,
  };
  expect(
    activityCoverage(state).find(
      (r) => r.modality === 'integrado' && r.requirement.id === 'regular-admission-notice',
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
test('2026 is preserved, postgraduate and other years are not implicitly certified by 2027', () => {
  expect(rulesetVersion({ year: 2026, modalities: ['integrado'] })).toBe('legacy-2026-v1');
  expect(rulesetVersion({ year: 2027, modalities: ['posgraduacao'] })).toBe('unconfigured:2027');
  expect(rulesetVersion({ year: 2028, modalities: ['integrado'] })).toBe('unconfigured:2028');
  const state = { ...calendar(), modalities: ['posgraduacao'], offer: 'posgraduacao' };
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
    evidence: 'Lei municipal sintética',
    modalities: ['integrado'],
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
      evidence: 'Plano sintético',
      modalities: ['integrado'],
      requirementId: 'robotics',
    },
  ];
  expect(
    activityCoverage(state).find(
      (r) => r.modality === 'integrado' && r.requirement.id === 'robotics',
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
  const other = notice({
    id: 'different-source',
  });
  expect(() => applyEvent(once, other, [])).toThrow('mesmas datas');
});

test('v2 semester classification requires semantic identity instead of sorted position', () => {
  const state = {
    ...calendar(),
    schemaVersion: 2,
    regime: 'semestral',
    modalities: ['graduacao'],
    organizationByModality: undefined,
    periods: [
      { id: 'early', name: 'Período A', start: '2027-02-01', end: '2027-06-30' },
      { id: 'late', name: 'Período B', start: '2027-08-01', end: '2027-12-17' },
    ],
  };
  expect(convertCalendarV2(state).conversion?.organization).toBe('pending');
  const named = {
    ...state,
    periods: [
      { ...state.periods[1], name: '2º semestre' },
      { ...state.periods[0], name: '1º semestre' },
    ],
  };
  expect(
    convertCalendarV2(named).periods.map((p) => ('association' in p ? p.association : undefined)),
  ).toEqual([
    { status: 'defined', modalities: ['graduacao'], term: 'second' },
    { status: 'defined', modalities: ['graduacao'], term: 'first' },
  ]);
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
        modalities: undefined,
      }),
      admission: undefined,
      publicationStatus: undefined,
    },
  ];
  const rows = activityCoverage(state).filter((row) => row.requirement.id === 'campus-events');
  expect(rows.every((row) => row.coverage === 'partial' && row.events.length === 1)).toBe(true);
  expect(rows.every((row) => row.issues.some((issue) => issue.includes('ofertas')))).toBe(true);
});

test('a v3 global regime never substitutes for absent per-offer classification', () => {
  const state = { ...calendar(), organizationByModality: undefined, periods: [] };
  expect(convertCalendarV2(state).regime).toBe('a-classificar');
  const normalized = normalizeCalendar({ ...state, ignoredHistory: [] });
  expect(normalized.regime).toBe('a-classificar');
  expect(() => evaluateCalendar(normalized, [])).toThrow('Organização a conferir');
});

test('commands and direct import reject teaching inclusion outside the selected offer periods', () => {
  const state = calendar();
  const event: CalendarActivity = {
    id: 'outside-undergraduate',
    name: 'Inclusão sintética',
    start: '2027-07-20',
    end: '2027-07-20',
    kind: 'include',
    evidence: 'Ata sintética',
    modalities: ['graduacao'],
  };
  expect(() => applyEvent(state, event, [])).toThrow('períodos');
  expect(() => normalizeCalendar({ ...state, ignoredHistory: [], events: [event] })).toThrow(
    'períodos',
  );
  const integrated = { ...event, modalities: ['integrado'] };
  expect(
    normalizeCalendar({ ...state, ignoredHistory: [], events: [integrated] }).events,
  ).toHaveLength(1);
});

test('preserved duplicate occurrences remain editable after PDF provenance is retired', () => {
  const first = notice({ id: 'preserved-first', evidence: 'Ata A' });
  const second = notice({ id: 'preserved-second', evidence: 'Ata B' });
  const third = notice({ id: 'third', name: 'Outra ocorrência' });
  const state = { ...calendar(), events: [first, second, third] };
  const edited = applyEvent(state, { ...first, name: 'Publicação corrigida' }, [], true);
  expect(edited.events.map((item) => item.id)).toEqual(state.events.map((item) => item.id));
  expect(edited.events[0].name).toBe('Publicação corrigida');
  expect(edited.events[0]).not.toHaveProperty('evidence');
  const { evidence: _secondSource, ...expectedSecond } = second;
  expect(edited.events[1]).toEqual(expectedSecond);
  const cleaned = applyEvent(state, first, []);
  expect(cleaned.events.map((item) => item.id)).toEqual(state.events.map((item) => item.id));
  expect(cleaned.events.every((item) => !Object.hasOwn(item, 'evidence'))).toBe(true);
  expect(applyEvent(cleaned, cleaned.events[0], [])).toBe(cleaned);
  expect(() => applyEvent(state, { ...first, id: 'new-duplicate' }, [])).toThrow('mesmas datas');
  expect(() => applyEvent(state, { ...third, name: first.name }, [], true)).toThrow('mesmas datas');
});
