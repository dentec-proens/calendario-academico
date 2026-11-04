import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type {
  ActivityState,
  ActivityPlanItem,
  ProjectedDate,
} from '../../src/domain/calendar/model.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import {
  generatedActivities,
  generatedActivity,
} from '../../src/domain/calendar/activities/links.ts';
import { activityKey } from '../../src/domain/calendar/activities/activity-ref.ts';
import { diagnoseCalendar, diagnoseTeachingDays } from '../../src/domain/calendar/diagnostics.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { inspect } from '../../src/domain/calendar/base.ts';
import { inheritedEvents, type CatalogueEvent } from '../../src/domain/institution/catalogue.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import {
  calendarOffers,
  offerIds,
  offerLabel,
  offerFor,
} from '../../src/domain/calendar/offers.ts';
import { canonical, formatCases } from '../helpers/catalogue-reference.ts';

/**
 * Static v3 oracle captured before the M2/M3 implementation, from commit 34e35b9.
 * Inputs adapt the scenarios in calendar-rules-2027, academic-diagnostics,
 * calendar-edits, calendar-base and calendar-2027-phase0. The JSON also freezes
 * the institutional catalogue. It must not be regenerated from the v4 code.
 * Activity names are replaced with their stable IDs because M3 changes wording.
 */
function semanticProjection(
  state: ActivityState,
  catalogue: { revision: number; events: CatalogueEvent[] },
) {
  const policy = policyFor(state.year);
  const requirements = activityPlan(state);
  const generated = generatedActivities(state);
  const institutional = inheritedEvents(catalogue, state.year, state.offers);
  const events = [...institutional, ...state.events] as ProjectedDate[];
  const diagnostic = diagnoseCalendar(state, events);
  const baseSnapshot = {
    revision: catalogue.revision,
    events: institutional,
    documents: [],
    rulesetVersion: state.rulesetVersion,
  };
  const base = inspect(baseSnapshot, baseSnapshot, state);
  const label = (message: string) =>
    [...requirements]
      .sort((a, b) => b.name.length - a.name.length)
      .reduce((text, row) => text.replaceAll(row.name, `[${row.id}]`), message);
  const normativeFields = (requirement: ActivityPlanItem) => {
    const {
      name: _editorial,
      activity: _link,
      offerId,
      offerIds: _cycleIdentities,
      term,
      ...fields
    } = requirement;
    // A v4 stage has an explicit cycle and offer identity. The old stage already
    // encoded its identity in modality and its annual ordinal in the stable ID.
    // Applicability below still checks every offer, including cycle restrictions.
    const isStageRow = Boolean(offerId);
    return {
      ...fields,
      ...(offerId ? { modality: offerId } : {}),
      ...(!isStageRow && term !== undefined ? { term } : {}),
      applicabilityByOffer: Object.fromEntries(
        offerIds(state).map((modality) => [
          modality,
          policy.applicability(state, requirement, offerFor(state, modality)!),
        ]),
      ),
    };
  };
  let counting: unknown;
  let teachingDiagnostics: unknown;
  try {
    const result = evaluateCalendar(state, events);
    counting = Object.fromEntries(
      Object.entries(result.byOffer).map(([modality, detail]) => {
        const { ledger, ...summary } = detail;
        return [
          modality,
          {
            ...summary,
            ledgerSha256: createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),
          },
        ];
      }),
    );
    teachingDiagnostics = diagnoseTeachingDays(state, result).map(({ offerId, ...row }) => ({
      ...row,
      modality: offerId,
    }));
  } catch (error) {
    counting = { error: error instanceof Error ? error.message : String(error) };
    teachingDiagnostics = null;
  }
  const readiness = releaseReadiness(
    {
      id: 'oracle-calendar',
      version: 7,
      catalogueRevision: catalogue.revision,
      institutionalSnapshot: institutional,
      state,
    },
    { catalogue, base, reviews: [] },
  );
  return JSON.parse(
    JSON.stringify({
      periods: state.periods.map(({ id, start, end }) => ({ id, start, end })),
      // A link is the generated row it resolves to, whose ID the oracle recorded.
      events: state.events.map(({ id, start, end, activity }) => ({
        id,
        start,
        end,
        requirementId: activity
          ? (generatedActivity(generated, activity)?.id ?? activityKey(activity))
          : undefined,
      })),
      requirements: requirements.map(normativeFields),
      minimums: Object.fromEntries(
        calendarOffers(state).map((offer) => {
          const minimums = policy.countingMinimums(state, offer);
          return [
            offer.id,
            { annual: minimums.annual?.days ?? null, semester: minimums.semester?.days ?? null },
          ];
        }),
      ),
      counting,
      diagnostics: {
        structure: diagnostic.structure.map((row) =>
          'offerId' in row
            ? (({ offerId, ...rest }) => ({ ...rest, modality: offerId }))(row)
            : row,
        ),
        teaching: teachingDiagnostics,
        // Classification and evidence are dimensions of the plan evaluation after the oracle.
        coverage: diagnostic.plan.rows.map(
          ({
            requirement,
            events: linked,
            offerId,
            offer: _offer,
            classification: _classification,
            evidence: _evidence,
            ...row
          }) => ({
            ...row,
            modality: offerId,
            requirementId: requirement.id,
            eventIds: linked.map((event) => event.id),
          }),
        ),
      },
      baseIdentity: base.identity,
      window: policy.window(state),
      readiness: {
        ...readiness,
        issues: readiness.issues.map(label).sort(),
        warnings: readiness.warnings.map(label).sort(),
      },
    }),
  ) as unknown;
}

/**
 * The capture used the first matching activity name as its token. Distinct v3
 * offers could share that name; v4 names now distinguish their cycles. Resolve
 * only this lexical ambiguity from the readiness message's own offer prefix,
 * on both sides. Requirements and applicability remain compared in full.
 */
function readinessTokens(projection: unknown, state: ActivityState) {
  const value = structuredClone(projection) as {
    readiness: { issues: string[]; warnings: string[] };
  };
  const canonical = (message: string) => {
    const offer = calendarOffers(state).find((item) =>
      message.startsWith(`${offerLabel(item)} — `),
    );
    return offer
      ? message.replace(
          /\[((?:stage|results|council|pedagogical-meeting)-[1-4]):[a-z][a-z0-9-]*\]/g,
          `[$1:${offer.id}]`,
        )
      : message;
  };
  value.readiness.issues = value.readiness.issues.map(canonical).sort();
  value.readiness.warnings = value.readiness.warnings.map(canonical).sort();
  return value;
}

// The v3 oracle has no update mode: it is checked by hash, and changing it requires the pre-v4
// source. Only the catalogue paths follow the rules, through their own fixture (see below).
const oracle = JSON.parse(
  readFileSync(new URL('../fixtures/offers-v3-oracle.json', import.meta.url), 'utf8'),
) as {
  sourceCommit: string;
  catalogue: { revision: number; events: CatalogueEvent[] };
  cases: { name: string; input: ActivityState; expected: unknown }[];
};

// Converted once by the validated release A converter before its deletion. All
// 18 cases passed against this oracle before and after the release B cleanup.
// The input fixture records the converter hashes; expected values stay frozen.
// The inputs and the catalogue were converted again to format 5 by the format 5
// migration converter before its removal in the contraction. The cases of an offer without
// organization left the inputs when every offer came to have one; their capture stays in the
// frozen oracle, which also keeps semester requirements the organization of an offer cannot have.
const inputs = JSON.parse(
  readFileSync(new URL('../fixtures/offers-oracle-inputs.json', import.meta.url), 'utf8'),
) as {
  oracleSha256: string;
  cases: { name: string; input: ActivityState }[];
  catalogueEvents: typeof oracle.catalogue.events;
};

const withoutOrganization = [
  'v3 organização a classificar',
  'v3 mapa de organização ausente não herda regime',
  'v2 organização ambígua pendente',
];

test('retains the immutable pre-v4 oracle and all independently captured v4 inputs', () => {
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('../fixtures/offers-v3-oracle.json', import.meta.url)))
      .digest('hex'),
  ).toBe('eff78c9cb6b7e88f6061bb4a2b40c99a2cce22c2e054cc2490b569dd9e77e75c');
  expect(inputs.oracleSha256).toBe(
    'eff78c9cb6b7e88f6061bb4a2b40c99a2cce22c2e054cc2490b569dd9e77e75c',
  );
  expect(inputs.cases.map(({ name }) => name)).toEqual(
    oracle.cases.map(({ name }) => name).filter((name) => !withoutOrganization.includes(name)),
  );
});

interface Projection {
  requirements: object[];
  diagnostics: { structure: unknown; teaching: unknown; coverage: object[] };
  readiness: { issues: string[]; warnings: string[] };
}

/** A readiness message that names an activity of the catalogue as `[id]`. */
const namesActivity = (message: string) => /\[[a-z0-9][a-z0-9:-]*\]/.test(message);

/**
 * The paths that follow the catalogue: the expanded rows, the plan coverage and the readiness
 * messages that cite an activity. They change when the rules do, so they are expected from
 * `test/fixtures/offers-catalogue-expected.json`, which `UPDATE_CATALOGUE_EXPECTED=1` rewrites
 * from the current code (see `catalogue-expected.test.ts` for the regime).
 */
const catalogueOf = (projection: Projection) => ({
  requirements: projection.requirements,
  coverage: projection.diagnostics.coverage,
  issues: projection.readiness.issues.filter(namesActivity),
  warnings: projection.readiness.warnings.filter(namesActivity),
});

/**
 * The paths the v3 oracle keeps frozen: periods, dates, minimums, counting, base identity, window,
 * the structural and teaching diagnostics, and the readiness that does not cite an activity.
 */
const frozenOf = (projection: Projection) => {
  const { requirements: _requirements, diagnostics, readiness, ...rest } = projection;
  return {
    ...rest,
    diagnostics: { structure: diagnostics.structure, teaching: diagnostics.teaching },
    readiness: {
      ...readiness,
      issues: readiness.issues.filter((message) => !namesActivity(message)),
      warnings: readiness.warnings.filter((message) => !namesActivity(message)),
    },
  };
};

// The oracle's catalogue was captured before format 5; the inputs file keeps it in format 5.
const catalogue = { ...oracle.catalogue, events: inputs.catalogueEvents };

const cases = inputs.cases.filter(({ input }) => input.year > 2026);
const projections = new Map<string, Projection>();
function projectionOf(name: string, stored: ActivityState) {
  if (!projections.has(name)) {
    const input = structuredClone(stored);
    const before = structuredClone(input);
    projections.set(
      name,
      readinessTokens(semanticProjection(input, catalogue), input) as Projection,
    );
    // The domain functions read the state and never write to it.
    expect(input).toEqual(before);
  }
  return projections.get(name)!;
}

const catalogueFile = new URL('../fixtures/offers-catalogue-expected.json', import.meta.url);
if (process.env.UPDATE_CATALOGUE_EXPECTED === '1')
  writeFileSync(
    catalogueFile,
    formatCases(
      Object.fromEntries(
        cases.map(({ name, input }) => [
          name,
          canonical(catalogueOf(projectionOf(name, input))) as Record<string, unknown[]>,
        ]),
      ),
    ),
  );
const expectedCatalogue = JSON.parse(readFileSync(catalogueFile, 'utf8')) as Record<
  string,
  ReturnType<typeof catalogueOf>
>;

test('the catalogue fixture covers every case, in order', () => {
  expect(Object.keys(expectedCatalogue)).toEqual(cases.map(({ name }) => name));
});

test.each(cases)('keeps the frozen semantics of the v3 oracle in format 5: $name', (item) => {
  const frozen = oracle.cases.find((entry) => entry.name === item.name)!.expected as Projection;
  expect(frozenOf(projectionOf(item.name, item.input))).toEqual(
    frozenOf(readinessTokens(frozen, item.input) as Projection),
  );
});

test.each(cases)('the catalogue paths follow the expected fixture: $name', (item) => {
  expect(catalogueOf(projectionOf(item.name, item.input))).toEqual(expectedCatalogue[item.name]);
});
