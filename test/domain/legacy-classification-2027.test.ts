import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  activityKey,
  activityRef,
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
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  activityBases,
  pairsOf,
  released2027,
  releasedGlobal,
  releasedOperational,
} from '../helpers/released-activities.ts';
import { legacyBasis } from '../helpers/legacy-classification.ts';
import { storedCases, type StoredCase } from '../helpers/stored-fixtures.ts';

/**
 * The 2027 policy generates only its own declarations. Format 4 kept every operational ID
 * resolvable in 2027 as an optional row of “Classificação legada”; those links are now dates under
 * “Vínculo a conferir”, never rebound. Years without a policy keep the operational catalogue as
 * their explicit behaviour.
 */
const stored = (item: StoredCase) =>
  ({
    ...item.content.state,
    year: item.year,
    campus: item.campus,
  }) as unknown as ActivityState;

const frozen2027 = storedCases().filter((item) => item.year === 2027);
const states2027: [string, ActivityState][] = [
  ...frozen2027.map((item) => [item.name, stored(item)] as [string, ActivityState]),
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

  test('the 2027 policy does not read the operational catalogue', async () => {
    const folder = resolve(import.meta.dirname, '../../src/domain/policies/consup-292-2027');
    for (const file of await readdir(folder))
      expect(await readFile(resolve(folder, file), 'utf8'), file).not.toMatch(
        /operational-checklist|operationalRules|operationalChecklist/,
      );
  });
});

describe('links of the operational catalogue stay to review in 2027', () => {
  test('a cycle teaching plan and a semester enrolment are reviewed, without fallback', () => {
    const state = legacyOperationalLinks() as ActivityState;
    const generated = generatedActivities(state);
    for (const event of state.events)
      expect(generatedActivity(generated, event.activity)).toBeUndefined();
    expect(Object.fromEntries(linksToReview(state))).toEqual({
      'legacy-teaching-plan': 'not-generated',
      'legacy-enrolment': 'not-generated',
    });
    // The policy declares the same activities with its own bases; none of them is fulfilled.
    expect(generated.has('teaching-plan:semester:first')).toBe(true);
    expect(generated.has('enrolment:cycle:annual')).toBe(true);
    for (const row of evaluatePlan(state).rows) expect(row.events).toEqual([]);
  });

  test('every frozen 2027 date linked to a retired row is reviewed with its link kept', () => {
    // The stored dates once linked to a row of “Classificação legada”.
    const retired = ['forms-notice-published', 'forms-teaching-plan-annual', 'legacy-enrolment'];
    const reviewed: string[] = [];
    for (const item of frozen2027) {
      const state = stored(item);
      const review = linksToReview(state);
      for (const event of state.events.filter((event) => retired.includes(event.id))) {
        expect(event.activity, event.id).toBeDefined();
        expect(review.get(event.id), event.id).toBe('not-generated');
        reviewed.push(event.id);
      }
    }
    expect(reviewed.sort()).toEqual(retired);
  });
});

/** A link of the shape its repetition base takes, for a date of the synthetic calendar. */
const linkOf = (id: string, base: ActivityBase): ActivityRef =>
  activityRef(
    {
      once: { activityId: id },
      cycle: { activityId: id, term: 'annual' },
      semester: { activityId: id, semester: 'first' },
      stage: {
        activityId: id,
        offerId: 'integrado',
        position: { status: 'defined', term: 'annual', number: 1 },
      },
    }[base],
  );

/**
 * A link is readable when any catalogue declares its pair; whether the configuration generates it
 * is a classification. A readable link the policy does not generate falls under “Vínculo a
 * conferir” (`not-generated`), and neither reading nor evaluating the plan throws.
 */
describe.each([
  [2027, 'a pair only the operational catalogue declares'],
  [2028, 'a pair only the 2027 policy declares'],
])('in %i, %s', (year, _what) => {
  const state = (): ActivityState => {
    const base = legacyOperationalLinks() as ActivityState;
    const pairs = activityBases.flatMap((kind) => releasedGlobal[kind].map((id) => ({ id, kind })));
    return {
      ...base,
      year,
      events: pairs.map(({ id, kind }) => ({
        id: `${id}/${kind}`,
        name: `Data sintética ${id}/${kind}`,
        start: civilDate(`${year}-02-19`),
        end: civilDate(`${year}-02-19`),
        effect: 'note',
        category: 'prazo',
        activity: linkOf(id, kind),
        offers: ['integrado'],
      })),
    } as ActivityState;
  };
  const declaredByTheOther = year === 2027 ? releasedOperational : released2027;
  const own = year === 2027 ? released2027 : releasedOperational;
  const missing = activityBases.flatMap((kind) =>
    declaredByTheOther[kind].filter((id) => !own[kind].includes(id)).map((id) => `${id}/${kind}`),
  );

  test('every released pair is readable, and what the catalogue lacks is reviewed, not an error', () => {
    const current = state();
    expect(current.events.length).toBe(pairsOf(releasedGlobal).length);
    const review = linksToReview(current);
    expect(missing.length).toBeGreaterThan(0);
    for (const pair of missing) expect(review.get(pair), pair).toBe('not-generated');
    const generated = generatedActivities(current);
    for (const event of current.events)
      if (!generatedActivity(generated, event.activity))
        expect(review.get(event.id), event.id).toBe('not-generated');
    expect(() => evaluatePlan(current)).not.toThrow();
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
