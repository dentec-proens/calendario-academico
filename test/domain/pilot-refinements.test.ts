import { civilDate } from '../../src/domain/civil-date.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { auditLog } from '../../src/app/audit-log.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

test('mixed calendar includes annual and semester obligations plus extraordinary council', () => {
  const rows = activityPlan({
    offers: [
      {
        id: 'integrado',
        kind: 'integrado',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { status: 'defined', perTerm: 4 },
      },
      { id: 'graduacao', kind: 'graduacao', delivery: 'a-conferir', organization: 'semestral' },
    ],
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
    schemaVersion: 7 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 's1',
        name: 'S1',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-02-05'),
        association: {
          status: 'defined' as const,
          offers: ['subsequente'],
          term: 'annual' as const,
        },
      },
      {
        id: 's2',
        name: 'S2',
        start: civilDate('2027-08-02'),
        end: civilDate('2027-08-06'),
        association: {
          status: 'defined' as const,
          offers: ['subsequente'],
          term: 'annual' as const,
        },
      },
    ],
    offers: [
      {
        id: 'subsequente',
        kind: 'subsequente' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
      },
    ],
  };
  const classified = {
    ...state,
    schemaVersion: 7 as const,
    periods: state.periods.map((p, i) => ({
      ...p,
      association: {
        status: 'defined' as const,
        offers: ['subsequente'],
        term: i === 0 ? ('first' as const) : ('second' as const),
      },
    })),
    offers: state.offers.map((offer) => ({
      ...offer,
      scope: { status: 'covered' as const },
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
  const { proensLayout } = await import('../../src/printing/calendar-layout.ts');
  const html = proensLayout(
    {
      year: 2027,
      campus: 'Reitoria',
      periods: [],
      offers: [
        {
          id: 'integrado',
          kind: 'integrado' as const,
          delivery: 'a-conferir' as const,
          organization: 'anual' as const,
        },
      ],
    },
    [
      {
        start: civilDate('2027-02-01'),
        end: civilDate('2027-04-30'),
        category: 'limite',
        name: 'Etapa',
        offers: ['integrado'],
      },
      {
        start: civilDate('2027-03-26'),
        end: civilDate('2027-03-26'),
        category: 'feriado',
        name: 'Feriado',
        offers: ['integrado'],
      },
    ],
  );
  assert.equal((html.match(/<td class="cat-limite" title=/g) || []).length, 2);
  assert.match(html, /<td class="cat-feriado" title="Etapa; Feriado">26<\/td>/);
});
