import { civilDate } from '../../src/domain/civil-date.ts';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { definedStage, unclassifiedStage } from '../helpers/activity-links.ts';
import type { CalendarContent, CalendarOffer } from '../../src/domain/calendar/model.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import { stageCount, stageCycle, stageTerm } from '../../src/domain/calendar/offers.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize.ts';
import { configureOfferMetadata } from '../../src/domain/calendar/commands/organization.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { applyDate } from '../helpers/date-commands.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { readCalendarOfferInput } from '../../src/domain/calendar/normalization/input.ts';
import { legacyIds } from '../helpers/legacy-classification.ts';
import { retiredOfferFields } from '../helpers/retired-fields.ts';

type Count = 2 | 3 | 4;
type StageState = CalendarContent & { year: number; campus: string };
const fixture = (count: Count = 3): StageState => ({
  schemaVersion: 5 as const,
  year: 2027,
  campus: 'A',
  rulesetVersion: 'consup-292-2027-v3',
  offers: [
    {
      id: 'integrado',
      kind: 'integrado',
      delivery: 'a-conferir',
      organization: 'a-classificar',
      stages: { status: 'reported', count },
    } satisfies CalendarOffer,
  ],
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [],
  events: [],
});
const archive = JSON.parse(
  readFileSync(new URL('../fixtures/legacy-stage-count-oracle.json', import.meta.url), 'utf8'),
) as {
  cases: { count: Count; requirements: { id: string; basis?: string }[]; readiness: unknown }[];
};

test.each(archive.cases)(
  'preserves v3 requirements, labels and readiness with $count unclassified stages',
  ({ count, requirements, readiness }) => {
    const state = fixture(count),
      offer = state.offers[0];
    const rows = activityPlan(state).map(
      ({ offerId, offerIds: _ids, activity: _link, ...row }) => ({
        ...row,
        ...(offerId ? { modality: offerId } : {}),
        applicability: policyFor(state.year).applicability(
          state,
          { ...row, activity: _link, offerId },
          offer,
        ),
      }),
    );
    // Step 9d: 2027 no longer generates the rows the capture kept as “Classificação legada”.
    const retired = legacyIds(requirements);
    expect(retired.size).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(rows))).toEqual(
      requirements.filter((row) => !retired.has(row.id)),
    );
    expect(
      releaseReadiness(
        { id: 'legacy-stage', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state },
        { catalogue: { revision: 1 }, reviews: [] },
      ),
    ).toEqual(readiness);
    expect(stageCount(offer)).toBe(count);
    expect(stageCycle(offer)).toBe(
      count === 2 ? 'semestral' : count === 3 ? 'trimestral' : 'bimestral',
    );
    expect(stageTerm(offer, 1)).toBeUndefined();
  },
);

test('normalization and the JSON copy keep the reported total, without inventing a cycle', () => {
  const state = fixture();
  const content = offerCalendarContent(normalizeOfferCalendar(state));
  expect(content.offers[0]).toMatchObject({
    stages: { status: 'reported', count: 3 },
    organization: 'a-classificar',
  });
  for (const field of retiredOfferFields) expect(content.offers[0]).not.toHaveProperty(field);
  // Exporting and importing the copy keeps the reported total.
  expect(
    readCalendarOfferInput(JSON.parse(JSON.stringify({ ...content, year: 2027 }))).offers[0],
  ).toEqual(content.offers[0]);
  for (const malformed of [
    { ...state, offers: [{ ...state.offers[0], stages: { status: 'reported', count: 1 } }] },
    { ...state, offers: [{ ...state.offers[0], organization: 'anual' }] },
    { ...state, offers: [{ ...state.offers[0], stages: { status: 'defined', perTerm: 3 } }] },
  ] as StageState[])
    expect(() => normalizeOfferCalendar(malformed)).toThrow(/etapas|quantidade|organização/i);
  for (const stages of [{ status: 'reported', count: 5 }, { count: 3 }, { perTerm: 3 }])
    expect(() =>
      readCalendarOfferInput({
        ...content,
        year: 2027,
        offers: [{ ...content.offers[0], stages }],
      }),
    ).toThrow(/etapas|quantidade/i);
});

test('metadata and unrelated saves preserve the reported total while direct edits cannot add, change or drop it', () => {
  const state = fixture();
  const changed = configureOfferMetadata(state, 'integrado', {
    delivery: 'ead',
    label: 'Técnico sintético',
    organizationBasis: '',
  });
  const context = {
    storedContent: offerCalendarContent(state),
    catalogue: { events: [] },
    recalculate: false,
  };
  const saved = prepareOfferCalendarSave(state, changed, context);
  expect(saved.content.offers[0]).toMatchObject({
    stages: { status: 'reported', count: 3 },
    delivery: 'ead',
  });
  const without = {
    ...state,
    offers: state.offers.map(({ stages: _stages, ...offer }) => offer),
  };
  expect(() => prepareOfferCalendarSave(state, without, context)).toThrow(/etapas|quantidade/i);
  expect(() =>
    prepareOfferCalendarSave(
      state,
      { ...state, offers: [{ ...state.offers[0], stages: { status: 'reported', count: 2 } }] },
      context,
    ),
  ).toThrow(/etapas|quantidade/i);
  expect(() =>
    prepareOfferCalendarSave(without, state, {
      ...context,
      storedContent: offerCalendarContent(without),
    }),
  ).toThrow(/etapas|quantidade/i);
  const fake = {
    ...without,
    offers: [
      {
        ...without.offers[0],
        organization: 'anual' as const,
        stages: { status: 'defined' as const, perTerm: 2 },
      },
    ],
  };
  expect(() => prepareOfferCalendarSave(state, fake, context)).toThrow(
    /etapas|períodos|nova oferta/i,
  );
});

test('new and changed assessment dates remain blocked until the organization defines their cycle', () => {
  const state: StageState = {
    ...fixture(),
    events: [
      {
        id: 'old',
        name: 'Etapa antiga',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-12'),
        effect: 'note',
        activity: unclassifiedStage('stage', 'integrado', 1),
        scope: { offers: ['integrado'], confirmed: true },
      },
    ],
  };
  expect(() => applyDate(state, { ...state.events[0], id: 'new' }, [])).toThrow(
    /organização|etapa/i,
  );
  expect(() =>
    applyDate(state, { ...state.events[0], end: civilDate('2027-03-15') }, [], true),
  ).toThrow(/organização|etapa/i);
  // The global save boundary preserves the existing evidence while other sections change.
  expect(
    prepareOfferCalendarSave(
      state,
      { ...state, campus: 'A' },
      { storedContent: offerCalendarContent(state), catalogue: { events: [] }, recalculate: false },
    ).content.offers[0],
  ).toMatchObject({ stages: { status: 'reported', count: 3 } });
});

test('complete explicit configuration resolves the reported total and keeps surplus stage dates with their link', () => {
  const state: StageState = {
    ...fixture(),
    events: [1, 2, 3].map((n) => ({
      id: `old-${n}`,
      name: `Etapa ${n}`,
      start: civilDate(`2027-0${n + 1}-01`),
      end: civilDate(`2027-0${n + 1}-12`),
      effect: 'note',
      activity: unclassifiedStage('stage', 'integrado', n),
      scope: { offers: ['integrado'], confirmed: true },
    })),
  };
  const draft = offerOrganizationDraft(state, 'integrado');
  expect(draft.count).toBe('');
  draft.organization = 'anual';
  draft.count = '2';
  draft.periods[0] = {
    sourceId: '',
    name: 'Ano',
    start: civilDate('2027-02-01'),
    end: civilDate('2027-12-17'),
  };
  draft.stages[0] = { id: 'old-1', start: civilDate('2027-02-01'), end: civilDate('2027-07-09') };
  draft.stages[1] = { id: 'old-2', start: civilDate('2027-07-26'), end: civilDate('2027-12-17') };
  let seq = 0;
  const configured = applyOfferOrganization(state, 'integrado', draft, () => `generated-${++seq}`);
  expect(configured.offers[0]).toMatchObject({
    organization: 'anual',
    stages: { status: 'defined', perTerm: 2 },
  });
  expect(configured.events.find((e) => e.id === 'old-3')).toEqual(state.events[2]);
  expect(linksToReview(configured).get('old-3')).toBe('unclassified');
  const saved = prepareOfferCalendarSave(state, configured, {
    storedContent: offerCalendarContent(state),
    catalogue: { events: [] },
    recalculate: false,
  });
  expect(saved.content.offers[0].stages).toEqual({ status: 'defined', perTerm: 2 });
});

test('unclassified historical stage evidence retains its original interval finding without blocking preservation', () => {
  const state: StageState = {
    ...fixture(),
    events: [
      {
        id: 'old-stage',
        name: 'Etapa anterior',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-12'),
        effect: 'note',
        activity: unclassifiedStage('stage', 'integrado', 1),
        scope: { offers: ['integrado'], confirmed: true },
      },
    ],
  };
  const coverage = evaluatePlan(state).rows.find(
    (row) => row.requirement.id === 'stage-1:integrado',
  )!;
  expect(coverage.issues).toEqual([
    'A etapa de avaliação deve estar inteiramente dentro de um período letivo da oferta.',
  ]);
  expect(coverage.coverage).toBe('partial');
  expect(() => normalizeOfferCalendar(state, state)).not.toThrow();
  expect(
    prepareOfferCalendarSave(state, state, {
      storedContent: offerCalendarContent(state),
      catalogue: { events: [] },
      recalculate: false,
    }).content.events[0],
  ).toMatchObject({ start: civilDate('2027-03-01'), end: civilDate('2027-03-12') });
});

test('complete classification keeps every linked result, council and meeting, surplus ordinals to review', () => {
  const state: StageState = {
    ...fixture(),
    events: ['results', 'council', 'pedagogical-meeting'].flatMap((family) =>
      [1, 3].map((n) => ({
        id: `${family}-${n}`,
        name: `${family} ${n}`,
        start: civilDate('2027-05-28'),
        end: civilDate('2027-05-28'),
        effect: 'note',
        activity: unclassifiedStage(family, 'integrado', n),
        scope: { offers: ['integrado'], confirmed: true },
      })),
    ),
  };
  const draft = offerOrganizationDraft(state, 'integrado');
  draft.organization = 'anual';
  draft.count = '2';
  draft.periods[0] = {
    sourceId: '',
    name: 'Ano',
    start: civilDate('2027-02-01'),
    end: civilDate('2027-12-17'),
  };
  draft.stages[0] = { id: '', start: civilDate('2027-02-01'), end: civilDate('2027-07-09') };
  draft.stages[1] = { id: '', start: civilDate('2027-07-26'), end: civilDate('2027-12-17') };
  let seq = 0;
  const configured = applyOfferOrganization(state, 'integrado', draft, () => `configured-${++seq}`);
  for (const family of ['results', 'council', 'pedagogical-meeting']) {
    // The confirmed ordinal takes its position in the annual cycle, as the format 4 `results-1` did.
    expect(configured.events.find((event) => event.id === `${family}-1`)?.activity).toEqual(
      definedStage(family, 'integrado', 'annual', 1),
    );
    const excess = configured.events.find((event) => event.id === `${family}-3`)!;
    expect(excess).toEqual(state.events.find((event) => event.id === `${family}-3`));
    expect(linksToReview(configured).get(excess.id)).toBe('unclassified');
  }
});
