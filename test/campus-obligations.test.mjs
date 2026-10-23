import test from 'node:test';
import assert from 'node:assert/strict';
import { activityChecklist } from '../src/obligations.mjs';
import { releaseReadiness } from '../src/release.mjs';
import { selectableCampuses } from '../src/campus-selection.mjs';

test('explicit absence of second semester intake waives new-student registration only', () => {
  const base = {
    year: 2027,
    offer: 'graduacao',
    regime: 'semestral',
    assessmentStages: 2,
    events: [],
    periods: [],
    weekdays: [],
    weekConfirmed: false,
  };
  for (const secondSemesterIntake of [undefined, true, false]) {
    const state = { ...base, secondSemesterIntake },
      rows = activityChecklist(state);
    assert.equal(
      rows.find((r) => r.id === 'registration-2').required === false,
      secondSemesterIntake === false,
    );
    for (const id of ['registration-1', 'enrolment-1', 'enrolment-2', 'admission-notice-2'])
      assert.notEqual(rows.find((r) => r.id === id).required, false);
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
      secondSemesterIntake !== false,
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
  const state = { ...base, secondSemesterIntake: false, events: [existing] };
  activityChecklist(state);
  assert.deepEqual(state.events, [existing]);
  assert(!activityChecklist({ ...state, regime: 'anual' }).some((r) => r.id === 'registration-2'));
});

test('family meetings and class councils are required only for integrated secondary education', () => {
  const base = { year: 2027, offer: 'graduacao', regime: 'semestral', assessmentStages: 2 };
  for (const modalities of [
    ['graduacao'],
    ['subsequente'],
    ['posgraduacao'],
    ['graduacao', 'subsequente'],
  ])
    for (const scoped of [false, true]) {
      const state = {
        ...base,
        offer: modalities[0],
        modalities,
        ...(scoped
          ? { assessmentStagesByModality: Object.fromEntries(modalities.map((m) => [m, 2])) }
          : {}),
      };
      const rows = activityChecklist(state);
      const optional = rows.filter((r) => r.required === false);
      assert.equal(optional.length, 2 + (scoped ? modalities.length * 2 : 2));
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
      modalities,
      assessmentStagesByModality: Object.fromEntries(modalities.map((m) => [m, 2])),
    };
    const rows = activityChecklist(state);
    assert(
      rows
        .filter((r) => !r.modality || r.modality === 'integrado')
        .every((r) => r.required !== false),
    );
    assert(
      rows
        .filter((r) => r.id.startsWith('council-') && r.modality !== 'integrado')
        .every((r) => r.required === false),
    );
  }
});

test('release checks omit optional missing activities without deleting existing links', () => {
  const state = {
    year: 2027,
    offer: 'graduacao',
    modalities: ['graduacao'],
    regime: 'anual',
    assessmentStages: 2,
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [],
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
  const mixed = { ...state, modalities: ['graduacao', 'integrado'] };
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
  ]) {
    const rows = activityChecklist({ year: 2026, regime, assessmentStages: 4 });
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
    assert.equal(rows.find((r) => r.id === 'robotics').deadline, '2026-08-31');
    assert.equal(rows.find((r) => r.id === 'course-showcase').deadline, '2026-09-30');
    assert.equal(rows.find((r) => r.id === 'pedagogical-training').minHours, 40);
    assert.equal(rows.find((r) => r.id === 'collective-planning').minHours, 20);
  }
  assert.equal(
    activityChecklist({ year: 2027, regime: 'anual' }).find((r) => r.id === 'robotics').deadline,
    undefined,
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
    selectableCampuses(campuses).map((campus) => campus.id),
    ['arapongas', 'reitoria', 'toledo'],
  );
  assert.deepEqual(campuses, before);
});
