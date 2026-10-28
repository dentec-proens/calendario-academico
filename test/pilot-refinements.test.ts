import type { CalendarActivity } from '../src/domain/calendar/model.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { teacherVacations } from '../src/domain/calendar/activities/teacher-vacations.ts';
import { activityChecklist } from '../src/domain/calendar/activities/checklist.ts';
import { auditLog } from '../src/audit-log.ts';
import { evaluateCalendar } from '../src/domain/calendar/counting/evaluation.ts';

test('teacher vacations count explicit inclusive ranges without sources and reject wrong years or inverted intervals', () => {
  for (const year of [2027, 2028]) {
    const v = teacherVacations(year, {
      firstStart: `${year}-01-02`,
      firstEnd: `${year}-01-31`,
      secondStart: `${year}-07-17`,
      secondEnd: `${year}-07-31`,
    });
    assert.equal(v.total, 45);
    assert(v.events.every((e: CalendarActivity) => e.kind === 'exclude'));
    assert(v.events.every((e: CalendarActivity) => !Object.hasOwn(e, 'evidence')));
  }
  assert.throws(() => teacherVacations(2027, { firstStart: '2026-07-01', firstEnd: '2026-07-15' }));
  assert.throws(() => teacherVacations(2027, { firstStart: '2027-07-15', firstEnd: '2027-07-01' }));
});
test('mixed calendar includes annual and semester obligations plus extraordinary council', () => {
  const rows = activityChecklist({
    regime: 'misto',
    modalities: ['integrado'],
    assessmentStagesByModality: { integrado: 4 },
  });
  for (const id of [
    'final-0',
    'final-1',
    'final-2',
    'diary-0',
    'diary-1',
    'diary-2',
    'extraordinary-council',
    'stage-1:integrado',
  ])
    assert(rows.some((r) => r.id === id));
  assert(!rows.some((r) => r.id.startsWith('stage-start') || r.id.startsWith('stage-end')));
  const state = {
    year: 2027,
    offer: 'subsequente',
    modalities: ['subsequente'],
    regime: 'misto',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      { id: 's1', name: 'S1', start: '2027-02-01', end: '2027-02-05' },
      { id: 's2', name: 'S2', start: '2027-08-02', end: '2027-08-06' },
    ],
  };
  assert.throws(() => evaluateCalendar(state, []), /Organização a conferir/);
  const classified = {
    ...state,
    schemaVersion: 3,
    regime: 'semestral',
    organizationByModality: { subsequente: 'semestral' as const },
    scopeConfirmation: { status: 'covered' as const },
    periods: state.periods.map((p, i) => ({
      ...p,
      association: {
        status: 'defined' as const,
        modalities: ['subsequente'],
        term: i === 0 ? ('first' as const) : ('second' as const),
      },
    })),
  };
  assert.deepEqual(
    evaluateCalendar(classified, []).checks.map((c) => c.expected),
    [200, 100, 100],
  );
});
test('audit log isolates campi and contains canonical names and saved versions without credentials', () => {
  const db = {
    users: [{ id: 'u', name: 'Revisor', hash: 'must-not-appear' }],
    calendars: [
      { id: 'a', campusId: 'A', state: { year: 2027, campus: 'Reitoria' } },
      { id: 'b', campusId: 'B', state: { year: 2027, campus: 'Foz' } },
    ],
    audit: [
      { actor: 'u', id: 'a', action: 'SAVE_CALENDAR', at: '2026-09-21T10:00:00Z', version: 2 },
      { actor: 'u', id: 'b', action: 'SAVE_CALENDAR', at: '2026-09-21T11:00:00Z', version: 3 },
    ],
  };
  const campus = auditLog(db, { role: 'CAMPUS', campusId: 'A' });
  assert.equal(campus.entries.length, 1);
  assert.equal(campus.entries[0].calendar, 'Calendário 2027 - Campus Reitoria');
  assert.equal(campus.entries[0].version, 2);
  assert.equal(auditLog(db, { role: 'ADMIN' }).entries.length, 2);
  assert(!JSON.stringify(campus).includes('must-not-appear'));
});

test('assessment range colors only endpoints and preserves intervening holiday colors', async () => {
  const { proensLayout } = await import('../src/printing/calendar-layout.ts');
  const html = proensLayout(
    { year: 2027, campus: 'Reitoria', modalities: ['integrado'], periods: [] },
    [
      { start: '2027-02-01', end: '2027-04-30', category: 'limite', name: 'Etapa' },
      { start: '2027-03-26', end: '2027-03-26', category: 'feriado', name: 'Feriado' },
    ],
  );
  assert.equal((html.match(/<td class="cat-limite" title=/g) || []).length, 2);
  assert.match(html, /<td class="cat-feriado" title="Etapa; Feriado">26<\/td>/);
});
