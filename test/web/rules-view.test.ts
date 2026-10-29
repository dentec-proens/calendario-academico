import { expect, test } from 'vitest';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { termsFor } from '#src/domain/calendar/organization/periods.ts';
import { expandRequirements } from '#src/domain/calendar/activities/requirement-table.ts';
import { applicabilityFor, documentedYears, policyFor } from '#src/domain/policies/registry.ts';
import { rulesView } from '../../web/features/rules/rules-view.ts';

test('the rules page shows the applicability the editor computes for each offer', () => {
  expect(documentedYears.length).toBeGreaterThan(0);
  for (const year of documentedYears) {
    const view = rulesView(year);
    const offers = view.offers.map((offer) => offer.id);
    const state = {
      year,
      modalities: offers,
      regime: 'anual',
      organizationByModality: Object.fromEntries(offers.map((m) => [m, 'anual' as const])),
      assessmentStagesByModality: Object.fromEntries(offers.map((m) => [m, 2])),
      scopeConfirmation: { status: 'covered' as const },
    };
    const rows = activityChecklist(state);
    const declared = view.sections.flatMap((section) => section.activities);
    expect(declared.length).toBe(policyFor(year).catalogue!.flatMap((s) => s.rows).length);
    for (const activity of declared)
      for (const { offer, status } of activity.byOffer) {
        const row = rows.find(
          (item) =>
            item.id.replace(/-\d(:[a-z]+)?$/, '') === activity.id &&
            (!item.modality || item.modality === offer),
        )!;
        const expected = applicabilityFor(state, row, offer);
        expect(status === 'intake' ? 'optional' : status, `${activity.id} ${offer}`).toBe(expected);
      }
  }
});

test('family meeting is required only on integrated offers in 2027', () => {
  const family = rulesView(2027)
    .sections.flatMap((section) => section.activities)
    .find((activity) => activity.id === 'family-meeting')!;
  expect(Object.fromEntries(family.byOffer.map(({ offer, status }) => [offer, status]))).toEqual({
    integrado: 'required',
    subsequente: 'optional',
    graduacao: 'optional',
    posgraduacao: 'unconfigured',
  });
});

test('applicability per offer does not depend on organisation or stage count', () => {
  // The page shows one table per year; a norm that varies with them needs the page to show it.
  for (const year of documentedYears) {
    const policy = policyFor(year);
    const view = rulesView(year);
    const shown = new Map(
      view.sections.flatMap((section) =>
        section.activities.flatMap((activity) =>
          activity.byOffer.map(({ offer, status }) => [
            `${activity.id} ${offer}`,
            status === 'intake' ? 'optional' : status,
          ]),
        ),
      ),
    );
    const repeat = new Map(
      policy.catalogue!.flatMap((section) => section.rows.map((row) => [row.id, section.repeat])),
    );
    const offers = view.offers.map((offer) => offer.id);
    const organizations = [
      ['anual', 'anual', 'anual', 'anual'],
      ['semestral', 'semestral', 'semestral', 'semestral'],
      ['anual', 'semestral', 'anual', 'semestral'],
    ] as const;
    for (const organization of organizations)
      for (const stages of [2, 3, 4]) {
        const state = {
          year,
          modalities: offers,
          regime: 'misto',
          organizationByModality: Object.fromEntries(offers.map((m, i) => [m, organization[i]])),
          assessmentStagesByModality: Object.fromEntries(offers.map((m) => [m, stages])),
          scopeConfirmation: { status: 'covered' as const },
        };
        const declared = new Set(
          expandRequirements(policy.catalogue!, state).map((item) => item.row.id),
        );
        // Legacy rows keep old IDs optional on purpose; only declared rows carry the table's rules.
        for (const row of activityChecklist(state).filter((item) => declared.has(item.id))) {
          const id = row.id.replace(/-\d(:[a-z]+)?$/, '');
          for (const offer of offers) {
            if (row.modality && row.modality !== offer) continue;
            // A cycle row belongs to the offers organised in that cycle.
            if (repeat.get(id) === 'cycle' && !termsFor(state, offer).includes(row.term!)) continue;
            expect(
              applicabilityFor(state, row, offer),
              `${row.id} ${offer} ${organization.join('/')} ${stages}`,
            ).toBe(shown.get(`${id} ${offer}`));
          }
        }
      }
  }
});

const months = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
test('activity names carry the month and hours the page does not repeat', () => {
  for (const year of documentedYears) {
    const state = { year, modalities: ['integrado'], regime: 'anual' };
    for (const row of activityChecklist(state)) {
      if (row.month)
        expect(row.name.toLocaleLowerCase('pt-BR'), row.id).toContain(months[row.month - 1]);
      if (row.minHours) expect(row.name, row.id).toContain(`${row.minHours} horas`);
    }
  }
});
