import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { ActivityState, ActivityRequirement } from '../../src/domain/calendar/model.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { diagnoseCalendar, diagnoseTeachingDays } from '../../src/domain/calendar/diagnostics.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { inspect } from '../../src/domain/calendar/base.ts';
import { convertCalendarV2 } from '../../src/domain/calendar/normalization/conversion.ts';
import { convertCalendarV3 } from '../../src/domain/calendar/normalization/conversion-v4.ts';
import { inheritedEvents, type CatalogueEvent } from '../../src/domain/institution/catalogue.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import { calendarOffers, offerIds, offerLabel } from '../../src/domain/calendar/offers.ts';

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
  const requirements = activityChecklist(state);
  const institutional = inheritedEvents(
    catalogue,
    state.year,
    state.offers ?? state.modalities ?? [],
    state,
  );
  const events = [...institutional, ...state.events];
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
  const normativeFields = (requirement: ActivityRequirement) => {
    const { name: _editorial, offerId, offerIds: _cycleIdentities, term, ...fields } = requirement;
    // A v4 stage has an explicit cycle and offer identity. The old stage already
    // encoded its identity in modality and its annual ordinal in the stable ID.
    // Applicability below still checks every offer, including cycle restrictions.
    const isStageRow = Boolean(offerId ?? requirement.modality);
    return {
      ...fields,
      ...(offerId ? { modality: offerId } : {}),
      ...(!isStageRow && term !== undefined ? { term } : {}),
      applicabilityByOffer: Object.fromEntries(
        offerIds(state).map((modality) => [
          modality,
          policy.applicability(state, requirement, modality),
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
    teachingDiagnostics = diagnoseTeachingDays(state, result).map(
      ({ offerId: _id, ...row }) => row,
    );
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
      events: state.events.map(({ id, start, end, requirementId }) => ({
        id,
        start,
        end,
        requirementId,
      })),
      requirements: requirements.map(normativeFields),
      minimums: Object.fromEntries(
        offerIds(state).map((modality) => [modality, policy.countingMinimums(state, modality)]),
      ),
      counting,
      diagnostics: {
        structure: diagnostic.structure.map((row) =>
          'offerId' in row ? (({ offerId: _id, ...rest }) => rest)(row) : row,
        ),
        teaching: teachingDiagnostics,
        coverage: diagnostic.coverage.map(
          ({ requirement, events: linked, offerId: _id, offer: _offer, ...row }) => ({
            ...row,
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

// Oracle test: no update mode. Changes to the expected JSON require the pre-v4 source.
const oracle = JSON.parse(
  readFileSync(new URL('../fixtures/offers-v3-oracle.json', import.meta.url), 'utf8'),
) as {
  sourceCommit: string;
  catalogue: { revision: number; events: CatalogueEvent[] };
  cases: { name: string; input: ActivityState; expected: unknown }[];
};

test.each(oracle.cases)('preserves the captured v3 boundary: $name', ({ input, expected }) => {
  const before = structuredClone(input);
  const state = convertCalendarV2(input);
  expect(readinessTokens(semanticProjection(state, oracle.catalogue), state)).toEqual(
    readinessTokens(expected, state),
  );
  expect(input).toEqual(before);
});

test.each(oracle.cases)(
  'preserves the captured semantics after v4 migration: $name',
  ({ input, expected }) => {
    const before = structuredClone(input);
    const state = {
      ...convertCalendarV3(input, { year: input.year, modalities: input.modalities ?? [] }),
      year: input.year,
      campus: input.campus,
    };
    expect(readinessTokens(semanticProjection(state, oracle.catalogue), state)).toEqual(
      readinessTokens(expected, state),
    );
    expect(input).toEqual(before);
  },
);
