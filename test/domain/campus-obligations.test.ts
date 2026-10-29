import type { CalendarActivity } from '../../src/domain/calendar/model.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { selectableCampuses } from '../../src/domain/institution/campus-selection.ts';

test('2026 legacy explicit absence of second semester intake waives new-student registration only', () => {
  const base = {
    schemaVersion: 4 as const,
    year: 2026,
    events: [] as CalendarActivity[],
    periods: [],
    weekdays: [],
    weekConfirmed: false,
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
        stages: { perTerm: 1 },
      },
    ],
  };
  for (const legacySecondSemesterIntake of [undefined, true, false]) {
    const state = { ...base, legacySecondSemesterIntake },
      rows = activityChecklist(state);
    assert.equal(
      rows.find((r) => r.id === 'registration-2')!.required === false,
      legacySecondSemesterIntake === false,
    );
    for (const id of ['registration-1', 'enrolment-1', 'enrolment-2', 'admission-notice-2'])
      assert.notEqual(rows.find((r) => r.id === id)!.required, false);
    const issues = releaseReadiness(
      { id: 'test', state, institutionalSnapshot: [], catalogueRevision: 1 },
      { catalogue: { revision: 1 }, reviews: [] },
    ).issues;
    assert.equal(
      issues.some(
        (i) =>
          i.includes('Período destinado à matrícula — 2º semestre') &&
          i.includes('vincule um evento'),
      ),
      legacySecondSemesterIntake !== false,
    );
    assert(
      issues.some(
        (i) =>
          i.includes('Rematrícula dos estudantes — 2º semestre') && i.includes('vincule um evento'),
      ),
    );
  }
  const existing = {
    id: 'registered',
    requirementId: 'registration-2',
    name: 'Matrícula cadastrada',
  };
  const state = { ...base, legacySecondSemesterIntake: false, events: [existing] };
  activityChecklist(state);
  assert.deepEqual(state.events, [existing]);
  assert.equal(
    activityChecklist({ ...state }).find((r) => r.id === 'registration-2')?.required,
    false,
  );
});

test('2026 legacy family meetings and class councils are required only for integrated secondary education', () => {
  const base = {
    year: 2026,
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
        stages: { perTerm: 1 },
      },
    ],
  };
  for (const modalities of [
    ['graduacao'],
    ['subsequente'],
    ['posgraduacao'],
    ['graduacao', 'subsequente'],
  ]) {
    const state = {
      ...base,
      offers: modalities.map((kind) => ({
        id: kind,
        kind: kind as 'integrado' | 'subsequente' | 'graduacao' | 'posgraduacao',
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 2 },
      })),
    };
    const rows = activityChecklist(state);
    const optional = rows.filter((r) => r.required === false);
    assert.equal(optional.length, 2 + modalities.length * 2);
    assert(optional.every((r) => /opcional para esta oferta/.test(r.name)));
    assert(
      rows
        .filter((r) => r.id.startsWith('pedagogical-meeting-'))
        .every((r) => r.required !== false),
    );
    assert(rows.filter((r) => r.id.startsWith('results-')).every((r) => r.required !== false));
  }
  for (const modalities of [
    ['integrado'],
    ['graduacao', 'integrado'],
    ['subsequente', 'integrado'],
  ]) {
    const state = {
      ...base,
      offers: modalities.map((kind) => ({
        id: kind,
        kind: kind as 'integrado' | 'subsequente' | 'graduacao' | 'posgraduacao',
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages:
          Object.fromEntries(modalities.map((m) => [m, 2]))[kind] === undefined
            ? undefined
            : {
                perTerm: Number(Object.fromEntries(modalities.map((m) => [m, 2]))[kind]) / 1,
              },
      })),
    };
    const rows = activityChecklist(state);
    assert(
      rows
        .filter((r) => !r.offerId || r.offerId === 'integrado')
        .every((r) => r.required !== false),
    );
    assert(
      rows
        .filter((r) => r.id.startsWith('council-') && r.offerId !== 'integrado')
        .every((r) => r.required === false),
    );
  }
});

test('2026 legacy release checks omit optional missing activities without deleting existing links', () => {
  const state = {
    schemaVersion: 4 as const,
    year: 2026,
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [] as CalendarActivity[],
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 2 },
      },
    ],
  };
  const record = { id: 'test', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state };
  const db = { catalogue: { revision: 1 }, reviews: [] };
  const issues = releaseReadiness(record, db).issues;
  assert(
    !issues.some(
      (i) => i.includes('vincule um evento') && /Conselho|Reunião com familiares/.test(i),
    ),
  );
  assert(issues.some((i) => i.includes('Reunião pedagógica') && i.includes('vincule um evento')));
  const existing = {
    id: 'kept',
    requirementId: 'council-1',
    name: 'Conselho cadastrado',
    start: '2027-05-01',
    end: '2027-05-01',
    kind: 'note',
    evidence: 'Ata',
  };
  state.events.push(existing);
  const before = structuredClone(state.events);
  activityChecklist(state);
  releaseReadiness(record, db);
  assert.deepEqual(state.events, before);
  const mixed = {
    ...state,
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  };
  assert(
    releaseReadiness({ ...record, state: mixed }, db).issues.some(
      (i) => i.includes('Reunião com familiares') && i.includes('vincule um evento'),
    ),
  );
});
test('mandatory checklist includes annual and semester notices, stage results, hours and year-specific deadlines', () => {
  for (const [regime, count] of [
    ['anual', 1],
    ['semestral', 2],
    ['misto', 3],
  ] as const) {
    const rows = activityChecklist({
      year: 2026,
      offers: [
        {
          id: 'integrado',
          kind: 'integrado',
          delivery: 'a-conferir',
          organization: regime === 'misto' ? 'anual' : regime,
          stages: { perTerm: regime === 'semestral' ? 2 : 4 },
        },
        ...(regime === 'misto'
          ? [
              {
                id: 'graduacao',
                kind: 'graduacao' as const,
                delivery: 'a-conferir' as const,
                organization: 'semestral' as const,
              },
            ]
          : []),
      ],
    });
    assert.equal(rows.filter((r) => r.id.startsWith('admission-notice-')).length, count);
    assert.equal(rows.filter((r) => r.id.startsWith('registration-')).length, count);
    assert.equal(rows.filter((r) => r.id.startsWith('results-')).length, 4);
    assert.equal(rows.filter((r) => r.id.startsWith('pedagogical-meeting-')).length, 4);
    for (const id of [
      'family-meeting',
      'campus-events',
      'alumni-meeting',
      'internship-event',
      'women-week',
      'cultural-week',
    ])
      assert(rows.some((r) => r.id === id));
    assert.equal(rows.find((r) => r.id === 'robotics')!.deadline, '2026-08-31');
    assert.equal(rows.find((r) => r.id === 'course-showcase')!.deadline, '2026-09-30');
    assert.equal(rows.find((r) => r.id === 'pedagogical-training')!.minHours, 40);
    assert.equal(rows.find((r) => r.id === 'collective-planning')!.minHours, 20);
  }
  assert.equal(
    activityChecklist({
      year: 2027,
      offers: [
        { id: 'integrado', kind: 'integrado', delivery: 'a-conferir', organization: 'anual' },
      ],
    }).find((r) => r.id === 'robotics')!.deadline,
    '2027-08-31',
  );
});

test('campus selection excludes archived units without changing IDs or historical order', () => {
  const campuses = [
    { id: 'toledo', name: 'Toledo' },
    { id: 'archived', name: 'Campus antigo', archived: true },
    { id: 'arapongas', name: 'Arapongas' },
    { id: 'reitoria', name: 'Reitoria', archived: false },
  ];
  const before = structuredClone(campuses);
  assert.deepEqual(
    selectableCampuses(campuses).map((campus: { id: string }) => campus.id),
    ['arapongas', 'reitoria', 'toledo'],
  );
  assert.deepEqual(campuses, before);
});
