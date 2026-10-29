import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { CalendarContentV4, CalendarOffer } from '../../src/domain/calendar/model.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';
import { stageCount, stageCycle, stageTerm } from '../../src/domain/calendar/offers.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize-v4.ts';
import {
  configureOfferMetadata,
  configureOrganization,
} from '../../src/domain/calendar/commands/organization.ts';
import { applyPeriod } from '../../src/domain/calendar/commands/periods.ts';
import { applyEvent } from '../../src/domain/calendar/commands/events.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';

type Count = 2 | 3 | 4;
type LegacyOffer = CalendarOffer & { legacyStageCount?: Count };
type StageState = CalendarContentV4 & { year: number; campus: string };
const fixture = (count: Count = 3): StageState => ({
  schemaVersion: 4 as const,
  year: 2027,
  campus: 'A',
  rulesetVersion: 'consup-292-2027-v3',
  offers: [
    {
      id: 'integrado',
      kind: 'integrado',
      delivery: 'a-conferir',
      organization: 'a-classificar',
      legacyStageCount: count,
    } satisfies LegacyOffer,
  ],
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [],
  events: [],
});
const archive = JSON.parse(
  readFileSync(new URL('../fixtures/legacy-stage-count-oracle.json', import.meta.url), 'utf8'),
) as {
  cases: { count: Count; requirements: unknown; readiness: unknown }[];
};

test.each(archive.cases)(
  'preserves v3 requirements, labels and readiness with $count unclassified stages',
  ({ count, requirements, readiness }) => {
    const state = fixture(count),
      offer = state.offers[0];
    const rows = activityChecklist(state).map(({ offerId, offerIds: _ids, ...row }) => ({
      ...row,
      ...(offerId ? { modality: offerId } : {}),
      applicability: policyFor(state.year).applicability(state, { ...row, offerId }, offer),
    }));
    expect(JSON.parse(JSON.stringify(rows))).toEqual(requirements);
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

test('normalization and v4 copy keep known historical quantity, without inventing a cycle', () => {
  const state = fixture();
  expect(offerCalendarContent(normalizeOfferCalendar(state)).offers[0]).toMatchObject({
    legacyStageCount: 3,
    organization: 'a-classificar',
  });
  for (const malformed of [
    { ...state, offers: [{ ...state.offers[0], legacyStageCount: 1 }] },
    { ...state, offers: [{ ...state.offers[0], organization: 'anual' }] },
    { ...state, offers: [{ ...state.offers[0], stages: { perTerm: 3 } }] },
  ])
    expect(() => normalizeOfferCalendar(malformed)).toThrow(/etapas|quantidade|organização/i);
});

test('metadata and unrelated saves preserve the marker while direct edits cannot add, change or drop it', () => {
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
  expect(saved.content.offers[0]).toMatchObject({ legacyStageCount: 3, delivery: 'ead' });
  const without = {
    ...state,
    offers: state.offers.map(({ legacyStageCount: _count, ...offer }) => offer),
  };
  expect(() => prepareOfferCalendarSave(state, without, context)).toThrow(/etapas|quantidade/i);
  expect(() =>
    prepareOfferCalendarSave(
      state,
      { ...state, offers: [{ ...state.offers[0], legacyStageCount: 2 }] },
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
    offers: [{ ...without.offers[0], organization: 'anual' as const, stages: { perTerm: 2 } }],
  };
  expect(() => prepareOfferCalendarSave(state, fake, context)).toThrow(
    /etapas|períodos|nova oferta/i,
  );
});

test('period and organization shortcuts refuse classification before the complete stage configuration', () => {
  const state = fixture();
  expect(() => configureOrganization(state, { integrado: 'anual' }, [])).toThrow(
    /etapas|quantidade/i,
  );
  expect(() =>
    applyPeriod(
      state,
      {
        name: 'Ano',
        start: '2027-02-01',
        end: '2027-12-17',
        days: '',
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      [],
      () => 'period',
    ),
  ).toThrow(/etapas|quantidade/i);
});

test('new and changed assessment dates remain blocked until the organization defines their cycle', () => {
  const state: StageState = {
    ...fixture(),
    events: [
      {
        id: 'old',
        name: 'Etapa antiga',
        start: '2027-03-01',
        end: '2027-03-12',
        kind: 'note',
        requirementId: 'stage-1:integrado',
        offers: ['integrado'],
      },
    ],
  };
  expect(() => applyEvent(state, { ...state.events[0], id: 'new' }, [])).toThrow(
    /organização|etapa/i,
  );
  expect(() => applyEvent(state, { ...state.events[0], end: '2027-03-15' }, [], true)).toThrow(
    /organização|etapa/i,
  );
  // The global save boundary preserves the existing evidence while other sections change.
  expect(
    prepareOfferCalendarSave(
      state,
      { ...state, campus: 'A' },
      { storedContent: offerCalendarContent(state), catalogue: { events: [] }, recalculate: false },
    ).content.offers[0],
  ).toMatchObject({ legacyStageCount: 3 });
});

test('complete explicit configuration clears the marker and retains surplus stage dates as notes', () => {
  const state: StageState = {
    ...fixture(),
    events: [1, 2, 3].map((n) => ({
      id: `old-${n}`,
      name: `Etapa ${n}`,
      start: `2027-0${n + 1}-01`,
      end: `2027-0${n + 1}-12`,
      kind: 'note',
      requirementId: `stage-${n}:integrado`,
      offers: ['integrado'],
    })),
  };
  const draft = offerOrganizationDraft(state, 'integrado');
  expect(draft.count).toBe('');
  draft.organization = 'anual';
  draft.count = '2';
  draft.periods[0] = { sourceId: '', name: 'Ano', start: '2027-02-01', end: '2027-12-17' };
  draft.stages[0] = { id: 'old-1', start: '2027-02-01', end: '2027-07-09' };
  draft.stages[1] = { id: 'old-2', start: '2027-07-26', end: '2027-12-17' };
  let seq = 0;
  const configured = applyOfferOrganization(state, 'integrado', draft, () => `generated-${++seq}`);
  expect(configured.offers[0]).not.toHaveProperty('legacyStageCount');
  expect(configured.offers[0]).toMatchObject({ organization: 'anual', stages: { perTerm: 2 } });
  expect(configured.events.find((e) => e.id === 'old-3')).toMatchObject({
    start: '2027-04-01',
    end: '2027-04-12',
    kind: 'note',
  });
  const saved = prepareOfferCalendarSave(state, configured, {
    storedContent: offerCalendarContent(state),
    catalogue: { events: [] },
    recalculate: false,
  });
  expect(saved.content.offers[0]).not.toHaveProperty('legacyStageCount');
});

test('unclassified historical stage evidence retains its original interval finding without blocking preservation', () => {
  const state: StageState = {
    ...fixture(),
    events: [
      {
        id: 'old-stage',
        name: 'Etapa anterior',
        start: '2027-03-01',
        end: '2027-03-12',
        kind: 'note',
        requirementId: 'stage-1:integrado',
        offers: ['integrado'],
      },
    ],
  };
  const coverage = activityCoverage(state).find(
    (row) => row.requirement.id === 'stage-1:integrado',
  )!;
  expect(coverage.issues).toEqual([
    'A etapa de avaliação deve estar inteiramente dentro de um período letivo da oferta.',
  ]);
  expect(coverage.coverage).toBe('partial');
  expect(() => normalizeOfferCalendar(state)).not.toThrow();
  expect(
    prepareOfferCalendarSave(state, state, {
      storedContent: offerCalendarContent(state),
      catalogue: { events: [] },
      recalculate: false,
    }).content.events[0],
  ).toMatchObject({ start: '2027-03-01', end: '2027-03-12' });
});

test('complete classification keeps linked results, councils and meetings and detaches only surplus ordinals', () => {
  const state: StageState = {
    ...fixture(),
    events: ['results', 'council', 'pedagogical-meeting'].flatMap((family) =>
      [1, 3].map((n) => ({
        id: `${family}-${n}`,
        name: `${family} ${n}`,
        start: '2027-05-28',
        end: '2027-05-28',
        kind: 'note',
        requirementId: `${family}-${n}:integrado`,
        offers: ['integrado'],
      })),
    ),
  };
  const draft = offerOrganizationDraft(state, 'integrado');
  draft.organization = 'anual';
  draft.count = '2';
  draft.periods[0] = { sourceId: '', name: 'Ano', start: '2027-02-01', end: '2027-12-17' };
  draft.stages[0] = { id: '', start: '2027-02-01', end: '2027-07-09' };
  draft.stages[1] = { id: '', start: '2027-07-26', end: '2027-12-17' };
  let seq = 0;
  const configured = applyOfferOrganization(state, 'integrado', draft, () => `configured-${++seq}`);
  for (const family of ['results', 'council', 'pedagogical-meeting']) {
    expect(configured.events.find((event) => event.id === `${family}-1`)?.requirementId).toBe(
      `${family}-1:integrado`,
    );
    const excess = configured.events.find((event) => event.id === `${family}-3`)!;
    expect(excess.requirementId).toBeUndefined();
    expect(excess).toMatchObject({ start: '2027-05-28', end: '2027-05-28' });
  }
});
