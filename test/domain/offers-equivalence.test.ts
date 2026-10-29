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
import { inheritedEvents, type CatalogueEvent } from '../../src/domain/institution/catalogue.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';

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
  const institutional = inheritedEvents(catalogue, state.year, state.modalities ?? [], state);
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
    const { name: _editorial, ...fields } = requirement;
    return {
      ...fields,
      applicabilityByOffer: Object.fromEntries(
        (state.modalities ?? []).map((modality) => [
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
      Object.entries(result.byModality).map(([modality, detail]) => {
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
    teachingDiagnostics = diagnoseTeachingDays(state, result);
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
        (state.modalities ?? []).map((modality) => [
          modality,
          policy.countingMinimums(state, modality),
        ]),
      ),
      counting,
      diagnostics: {
        structure: diagnostic.structure,
        teaching: teachingDiagnostics,
        coverage: diagnostic.coverage.map(({ requirement, events: linked, ...row }) => ({
          ...row,
          requirementId: requirement.id,
          eventIds: linked.map((event) => event.id),
        })),
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

// Oracle test: no update mode. Changes to the expected JSON require the pre-v4 source.
const oracle = JSON.parse(
  readFileSync(new URL('../fixtures/offers-v3-oracle.json', import.meta.url), 'utf8'),
) as {
  sourceCommit: string;
  catalogue: { revision: number; events: CatalogueEvent[] };
  cases: { name: string; input: ActivityState; expected: unknown }[];
};

test.each(oracle.cases)('preserves the captured v3 semantics: $name', ({ input, expected }) => {
  const before = structuredClone(input);
  const state = convertCalendarV2(input);
  expect(semanticProjection(state, oracle.catalogue)).toEqual(expected);
  expect(input).toEqual(before);
});
