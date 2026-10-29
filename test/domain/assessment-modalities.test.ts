import { expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { assessmentCount } from '../../src/domain/calendar/activities/assessment.ts';
import { assessmentDayCounts } from '../../src/domain/calendar/counting/assessment-days.ts';
import { recalculateCalendar } from '../../src/domain/calendar/commands/recalculate.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';

const state: ActivityState = {
  schemaVersion: 4 as const,
  year: 2027,
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [
    {
      id: 'p',
      start: '2027-03-01',
      end: '2027-03-26',
      association: {
        status: 'defined' as const,
        offers: ['integrado', 'graduacao'],
        term: 'annual' as const,
      },
    },
  ],
  events: ['integrado', 'graduacao'].flatMap((modality) =>
    [0, 1].map((index) => ({
      id: `${modality}-${index}`,
      name: `${index + 1}ª etapa`,
      requirementId: `stage-${index + 1}:${modality}`,
      offers: [modality],
      kind: 'note',
      start: index ? '2027-03-15' : '2027-03-01',
      end: index ? '2027-03-26' : '2027-03-12',
    })),
  ),
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
      organization: 'anual' as const,
      stages: { perTerm: 2 },
    },
  ],
};

test('cleared offer does not inherit the old shared count or affect another offer', () => {
  const cleared = {
    ...state,
    offers: state.offers.map((offer) => ({
      ...offer,
      stages:
        { graduacao: 2 }[offer.id] === undefined
          ? undefined
          : {
              perTerm:
                Number({ graduacao: 2 }[offer.id]) / (offer.organization === 'semestral' ? 2 : 1),
            },
    })),
  };
  assert.equal(assessmentCount(cleared, 'integrado'), 0);
  assert.equal(assessmentCount(cleared, 'graduacao'), 2);
  const stages = activityChecklist(cleared).filter((r) => r.id.startsWith('stage-'));
  assert.equal(stages.length, 2);
  assert(stages.every((r) => r.offerId === 'graduacao'));
  assert.equal(
    activityChecklist({
      ...cleared,
      offers: cleared.offers.map((offer) => ({
        ...offer,
        stages:
          {}[offer.id] === undefined
            ? undefined
            : { perTerm: Number({}[offer.id]) / (offer.organization === 'semestral' ? 2 : 1) },
      })),
    }).filter((r) => r.id.startsWith('stage-')).length,
    0,
  );
});

test('holidays and inclusions update per-offer counts without moving any assessment boundaries', () => {
  const events = [
    ...state.events,
    {
      id: 'h',
      name: 'Feriado',
      kind: 'exclude',
      start: '2027-03-05',
      end: '2027-03-05',
      offers: ['integrado'],
    },
    {
      id: 'sat',
      name: 'Sábado',
      kind: 'include',
      start: '2027-03-06',
      end: '2027-03-06',
      offers: ['integrado'],
    },
  ];
  const current = { ...state, events };
  const before = structuredClone(current);
  const next = recalculateCalendar(current, []);
  expect(next.events).toEqual(before.events);
  expect(assessmentDayCounts(next, next.events)['integrado-0']).toEqual([
    { offerId: 'integrado', days: 10, saturdays: 1, excluded: 1 },
  ]);
  expect(assessmentDayCounts(next, next.events)['graduacao-0']).toEqual([
    { offerId: 'graduacao', days: 10, saturdays: 0, excluded: 0 },
  ]);
});

test('different quantities of manual assessment stages coexist by offer', () => {
  const configuration = {
    ...state,
    offers: state.offers.map((offer) => ({
      ...offer,
      stages:
        { integrado: 3, graduacao: 2 }[offer.id] === undefined
          ? undefined
          : {
              perTerm:
                Number({ integrado: 3, graduacao: 2 }[offer.id]) /
                (offer.organization === 'semestral' ? 2 : 1),
            },
    })),
  };
  expect(activityChecklist(configuration).filter((r) => r.id.startsWith('stage-'))).toHaveLength(5);
  expect(
    activityChecklist(configuration).find((r) => r.id === 'stage-3:graduacao'),
  ).toBeUndefined();
});
