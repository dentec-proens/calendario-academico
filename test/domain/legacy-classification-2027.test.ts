import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  activityKey,
  type ActivityBase,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import {
  generatedActivities,
  generatedActivity,
  linksToReview,
} from '../../src/domain/calendar/activities/links.ts';
import { operationalChecklist } from '../../src/domain/calendar/activities/operational-checklist.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { rules as policyRules } from '../../src/domain/policies/consup-292-2027/requirements.ts';
import {
  cascavelDraft,
  conflictingLinks,
  ivaiporaDraft,
  legacyOperationalLinks,
  stageLinksToReview,
} from '../fixtures/pending-links-2027.ts';
import {
  datesLinkedToLegacyRows,
  legacyBasis,
  legacyIds,
} from '../helpers/legacy-classification.ts';
import { readOracle, v4Cases, type V4Case } from '../helpers/v4-fixtures.ts';
import { convertedContent } from '../helpers/v5-conversion.ts';

/**
 * Phase 2, step 9d of `docs/plans/2026-11-02-atividades-e-datas.md`: the 2027 policy generates
 * only its own declarations. v4 kept every operational ID resolvable in 2027 as an optional row of
 * “Classificação legada”; those links are now dates under “Vínculo a conferir”, never rebound.
 * Years without a policy keep the operational catalogue as their explicit behaviour.
 */
const oracle = readOracle<{
  cases: { name: string; activities: { id: string; basis?: string }[] }[];
}>();

const converted = (item: V4Case) =>
  ({
    ...convertedContent(item).state,
    year: item.year,
    campus: item.campus,
  }) as unknown as ActivityState;

const frozen2027 = v4Cases().filter((item) => item.year === 2027);
const states2027: [string, ActivityState][] = [
  ...frozen2027.map((item) => [item.name, converted(item)] as [string, ActivityState]),
  ...[
    ivaiporaDraft,
    cascavelDraft,
    conflictingLinks,
    stageLinksToReview,
    legacyOperationalLinks,
  ].map((fixture) => [fixture.name, fixture() as ActivityState] as [string, ActivityState]),
];

const baseOf = (ref: ActivityRef): ActivityBase =>
  'position' in ref ? 'stage' : 'term' in ref ? 'cycle' : 'semester' in ref ? 'semester' : 'once';

describe('2027 generates only the declarations of its policy', () => {
  test.each(states2027)('%s has no row of “Classificação legada”', (_name, state) => {
    const rows = activityPlan(state);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.basis === legacyBasis)).toEqual([]);
    // Every row is a declaration of the policy, with the policy's repetition base.
    for (const row of rows)
      expect(
        policyRules.some(
          (rule) => rule.id === row.activity.activityId && rule.repeat === baseOf(row.activity),
        ),
        activityKey(row.activity),
      ).toBe(true);
  });

  test('the frozen oracle had such rows in most 2027 documents, now retired', () => {
    const recorded = frozen2027.map(
      (item) => legacyIds(oracle.cases.find((entry) => entry.name === item.name)!.activities).size,
    );
    expect(recorded.filter((size) => size > 0).length).toBeGreaterThan(10);
  });

  test('the 2027 policy does not read the operational catalogue', async () => {
    const folder = resolve(import.meta.dirname, '../../src/domain/policies/consup-292-2027');
    for (const file of await readdir(folder))
      expect(await readFile(resolve(folder, file), 'utf8'), file).not.toMatch(
        /operational-checklist|operationalRules|operationalChecklist/,
      );
  });
});

describe('links v4 resolved through the operational catalogue stay to review', () => {
  test('a cycle teaching plan and a semester enrolment are reviewed, without fallback', () => {
    const state = legacyOperationalLinks() as ActivityState;
    const generated = generatedActivities(state);
    for (const event of state.events)
      expect(generatedActivity(generated, event.activity)).toBeUndefined();
    expect(Object.fromEntries(linksToReview(state))).toEqual({
      'legacy-teaching-plan': 'unclassified',
      'legacy-enrolment': 'unclassified',
    });
    // The policy declares the same activities with its own bases; none of them is fulfilled.
    expect(generated.has('teaching-plan:semester:first')).toBe(true);
    expect(generated.has('enrolment:cycle:annual')).toBe(true);
    for (const row of evaluatePlan(state).rows) expect(row.events).toEqual([]);
  });

  test('every frozen 2027 date linked to a retired row is reviewed with its link kept', () => {
    const reviewed: string[] = [];
    for (const item of frozen2027) {
      const ids = legacyIds(oracle.cases.find((entry) => entry.name === item.name)!.activities);
      const state = converted(item);
      const review = linksToReview(state);
      for (const id of datesLinkedToLegacyRows(item.content.state.events, ids)) {
        expect(state.events.find((event) => event.id === id)?.activity, id).toBeDefined();
        expect(review.get(id), id).toBe('unclassified');
        reviewed.push(id);
      }
    }
    expect(reviewed.sort()).toEqual([
      'forms-notice-published',
      'forms-teaching-plan-annual',
      'legacy-enrolment',
    ]);
  });
});

test('a year without a policy keeps the operational catalogue, where those links are generated', () => {
  const state = { ...legacyOperationalLinks(), year: 2028 } as ActivityState;
  expect(activityPlan(state).map((row) => activityKey(row.activity))).toEqual(
    operationalChecklist(state).map((row) => activityKey(row.activity)),
  );
  expect(activityPlan(state).every((row) => row.applicability === 'unconfigured')).toBe(true);
  expect(linksToReview(state).size).toBe(0);
});
