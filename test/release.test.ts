import type { CalendarActivity } from '../src/domain-types.ts';
import { evaluateCalendar } from '../src/evaluation.ts';
import { activityChecklist } from '../src/obligations.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { releaseReadiness } from '../src/release.ts';
import { reviewCriteriaFor } from '../src/review.ts';
import { rulesetVersion } from '../src/calendar-rules/index.ts';
const reviewCriteria = reviewCriteriaFor(2027);
import { inheritedEvents } from '../src/institution.ts';
import { proensLayout } from '../src/printing/calendar-layout.ts';

test('definitive release requires every reviewed criterion, current versions and adequate teaching days', () => {
  const record = {
    id: 'c',
    version: 1,
    catalogueRevision: 1,
    institutionalSnapshot: [],
    state: {
      schemaVersion: 3,
      scopeConfirmation: {
        status: 'covered' as const,
      },
      organizationByModality: { integrado: 'anual' as const },
      assessmentStagesByModality: { integrado: 4 },
      year: 2027,
      offer: 'integrado',
      modalities: ['integrado'],
      regime: 'anual',
      weekdays: [1, 2, 3, 4, 5],
      weekConfirmed: true,
      periods: [
        {
          id: 'year',
          name: 'Ano',
          start: '2027-02-01',
          end: '2027-12-17',
          association: {
            status: 'defined' as const,
            modalities: ['integrado'],
            term: 'annual' as const,
          },
        },
      ],
      events: [] as CalendarActivity[],
    },
  };
  record.state.events = reviewCriteria
    .map((c) => c.title)
    .map((name, i) => ({
      id: 'e' + i,
      name,
      start: '2027-02-01',
      end: '2027-02-01',
      kind: 'note',
      category: 'institucional',
    }));
  record.state.events.push(
    ...activityChecklist(record.state).map((r) => ({
      id: r.id,
      requirementId: r.id,
      modalities: r.modality ? [r.modality] : ['integrado'],
      name: r.name,
      start: '2027-02-01',
      end: '2027-02-01',
      kind: 'note',
    })),
  );
  const db = {
    catalogue: { revision: 1 },
    reviews: [] as {
      calendarId: string;
      calendarVersion: number;
      catalogueRevision: number;
      applicableNorm: string;
      entries: { id: string; reviewed: boolean; status: string; notes: string }[];
    }[],
  };
  assert.equal(releaseReadiness(record, db).ready, false);
  const review = {
    rulesetVersion: rulesetVersion(record.state),
    calendarId: 'c',
    calendarVersion: 1,
    catalogueRevision: 1,
    applicableNorm: 'Synthetic normative reference',
    entries: reviewCriteria.map((c) => ({
      id: c.id,
      reviewed: true,
      status: 'ATENDIDO',
      notes: '',
    })),
  };
  db.reviews = [review];
  assert(releaseReadiness(record, db).issues.some((i) => i.includes('40 horas')));
  for (const r of activityChecklist(record.state)) {
    const event = record.state.events.find((e) => e.requirementId === r.id)!;
    if (r.minHours) event!.hours = r.minHours;
    if (r.month) event!.start = event!.end = `2027-${String(r.month).padStart(2, '0')}-10`;
    if (r.admissionType) {
      event.publicationStatus = 'planned';
      event.admission = {
        type: r.admissionType,
        year: r.admissionType === 'regular' ? 2028 : 2027,
        term: r.term ?? 'annual',
        ...(r.admissionType === 'transfer' ? { periodId: 'year' } : {}),
      };
    }
    if (r.id.startsWith('admission-notice-')) event!.start = event!.end = '2027-01-01';
  }
  assert.deepEqual(releaseReadiness(record, db).issues, []);
  assert(
    !record.state.events.some((e) =>
      /supervisão|segunda chamada|confirmação de matrícula/i.test(e.name),
    ),
  );
  const stage = record.state.events.find((e) => e.requirementId === 'stage-1:integrado')!;
  const results = record.state.events.find((e) => e.requirementId === 'results-1:integrado')!;
  stage!.end = '2027-02-10';
  results!.end = '2027-02-05';
  const before = structuredClone(record.state.events),
    flexible = releaseReadiness(record, db);
  assert.equal(flexible.ready, true);
  assert.deepEqual(flexible.issues, []);
  assert.equal(
    flexible.warnings.filter((w) => w.includes('organização definida pelo campus')).length,
    3,
  );
  assert(flexible.warnings.some((w) => w.includes('definição institucional')));
  assert.deepEqual(record.state.events, before);
  record.state.events = record.state.events.filter((e) => e !== results);
  assert(
    releaseReadiness(record, db).issues.some(
      (i) => i.includes('Prazo de lançamento dos resultados') && i.includes('vincule um evento'),
    ),
  );
  record.state.events.push(results);
  const training = record.state.events.find((e) => e.requirementId === 'pedagogical-training')!;
  training!.hours = 39;
  assert(releaseReadiness(record, db).issues.some((i) => i.includes('40 horas')));
  training!.hours = 40;
  const extraordinary = record.state.events.find(
    (e) => e.requirementId === 'extraordinary-council',
  )!;
  record.state.events = record.state.events.filter((e) => e !== extraordinary);
  assert(releaseReadiness(record, db).issues.some((i) => i.includes('extraordinário')));
  record.state.events.push(extraordinary);
  for (const id of ['IX', 'X', 'XI', 'XII']) {
    const entry = review.entries.find((e) => e.id === id)!;
    entry!.status = 'PENDENTE';
    assert.equal(releaseReadiness(record, db).ready, false);
    entry!.status = 'ATENDIDO';
  }
  review.calendarVersion = 0;
  assert.equal(releaseReadiness(record, db).ready, false);
  review.calendarVersion = 1;
  record.state.periods[0].end = '2027-02-01';
  assert.equal(releaseReadiness(record, db).ready, false);
});

test('explicit technical modality inherits scoped events and test PDF identifies its purpose', () => {
  const event = {
    id: 'e',
    active: true,
    start: '2027-01-01',
    end: '2027-01-01',
    modalities: ['subsequente'],
  };
  assert.equal(inheritedEvents({ events: [event] }, 2027, 'subsequente').length, 1);
  assert.equal(inheritedEvents({ events: [event] }, 2027, 'graduacao').length, 0);
  const html = proensLayout({ year: 2027, campus: 'Test', periods: [] }, [], null, {
    purpose: 'test',
  });
  assert.match(html, /CALENDÁRIO DE TESTE — SEM VALIDADE PARA ENVIO/);
});

test('combined calendars scope exclusions by modality and do not presume a postgraduate minimum', () => {
  const state = {
    year: 2027,
    offer: 'subsequente',
    modalities: ['subsequente', 'graduacao', 'posgraduacao'],
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [{ id: 'p', name: 'Semana', start: '2027-02-01', end: '2027-02-05' }],
    events: [] as CalendarActivity[],
  };
  const result = evaluateCalendar(state, [
    {
      id: 'e',
      start: '2027-02-02',
      end: '2027-02-02',
      kind: 'exclude',
      modalities: ['graduacao'],
    },
  ]);
  assert.equal(result.byModality.subsequente.total, 5);
  assert.equal(result.byModality.graduacao.total, 4);
  assert.equal(result.byModality.posgraduacao.checks[0].expected, null);
  const catalogue = {
    events: [
      {
        id: 'same',
        active: true,
        start: '2027-01-01',
        end: '2027-01-01',
        modalities: ['subsequente', 'graduacao'],
      },
    ],
  };
  assert.equal(inheritedEvents(catalogue, 2027, ['subsequente', 'graduacao']).length, 1);
});

test('a single linked deadline cannot satisfy every assessment stage or semester', () => {
  const state = {
    modalities: ['integrado'],
    assessmentStagesByModality: { integrado: 4 },
    regime: 'semestral',
  };
  const activities = activityChecklist(state);
  assert.equal(activities.filter((a) => a.id.startsWith('results-')).length, 4);
  assert.equal(activities.filter((a) => a.id.startsWith('diary-')).length, 2);
  assert.equal(activities.filter((a) => a.id.startsWith('teaching-plan-')).length, 2);
  assert.equal(new Set(activities.map((a) => a.id)).size, activities.length);
});

test('2026 reviewed criterion is satisfied by a dated event without manual sources', async () => {
  const name = 'extratos das atas de aprovacao pelo cgpc e codic';
  const criteria = reviewCriteriaFor(2026);
  const target = criteria.find(
    (criterion) => criterion.pattern && new RegExp(criterion.pattern).test(name),
  );
  assert(target);
  const record = {
    id: 'legacy-2026',
    version: 1,
    catalogueRevision: 1,
    institutionalSnapshot: [],
    state: {
      schemaVersion: 3,
      year: 2026,
      offer: 'integrado',
      modalities: ['integrado'],
      regime: 'anual',
      organizationByModality: { integrado: 'anual' as const },
      assessmentStagesByModality: { integrado: 2 },
      weekdays: [1, 2, 3, 4, 5],
      weekConfirmed: true,
      periods: [
        {
          id: 'annual',
          start: '2026-02-02',
          end: '2026-12-18',
          association: {
            status: 'defined' as const,
            modalities: ['integrado'],
            term: 'annual' as const,
          },
        },
      ],
      events: [
        {
          id: 'minutes',
          name,
          start: '2026-02-02',
          end: '2026-02-02',
          kind: 'note',
          modalities: ['integrado'],
        },
      ],
    },
  };
  const db = {
    catalogue: { revision: 1 },
    reviews: [
      {
        calendarId: record.id,
        calendarVersion: 1,
        catalogueRevision: 1,
        applicableNorm: 'Norma sintética 2026',
        entries: criteria.map((criterion) => ({
          id: criterion.id,
          reviewed: true,
          status: criterion.id === target.id ? 'ATENDIDO' : 'NAO_APLICAVEL',
        })),
      },
    ],
  };
  const readiness = releaseReadiness(record, db);
  assert(!readiness.issues.some((issue) => issue.includes(target.title)));
  const missing = releaseReadiness({ ...record, state: { ...record.state, events: [] } }, db);
  assert(missing.issues.some((issue) => issue.includes(target.title)));
});
