import { expect, test } from 'vitest';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { termsFor } from '#src/domain/calendar/organization/periods.ts';
import { expandRequirements } from '#src/domain/calendar/activities/requirement-table.ts';
import { applicabilityFor, documentedYears, policyFor } from '#src/domain/policies/registry.ts';
import { rulesView } from '../../web/features/rules/rules-view.ts';
import { selectableModalities } from '#src/domain/calendar/modalities.ts';
import type { AssessmentSettings } from '#src/domain/calendar/model.ts';

test('the rules page shows the applicability the editor computes for each offer', () => {
  expect(documentedYears.length).toBeGreaterThan(0);
  for (const year of documentedYears) {
    const view = rulesView(year);
    const state: AssessmentSettings = {
      year,
      offers: selectableModalities.map((kind) => ({
        id: kind,
        kind,
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { perTerm: 2 },
        scope: { status: 'covered' },
      })),
    };
    const rows = activityChecklist(state);
    const declared = view.sections.flatMap((section) => section.activities);
    expect(declared.length).toBe(policyFor(year).catalogue!.flatMap((s) => s.rows).length);
    for (const activity of declared)
      for (const { offer, status } of activity.byOffer) {
        const row = rows.find(
          (item) =>
            item.id.replace(/-\d(:[a-z]+)?$/, '') === activity.id &&
            (!item.offerId || item.offerId === offer),
        )!;
        const expected = applicabilityFor(
          state,
          row,
          state.offers.find((item) => item.id === offer)!,
        );
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

test('the rules view explains stages per cycle and exposes the unchanged minima with their sources', () => {
  const view = rulesView(2027);
  expect(view.sections[0].help).toContain('1 ou 2 etapas por semestre');
  expect(view.sections[0].help).toContain('2, 3 ou 4 etapas no ano letivo');
  expect(view.minimums.find((row) => row.offer === 'Graduação')).toMatchObject({
    annual: 200,
    semester: 100,
    annualBasis: expect.stringContaining('Art. 4º'),
    semesterBasis: expect.stringContaining('§ 1º'),
  });
  expect(view.minimumSources).toHaveLength(2);
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
    const organizations = [
      ['anual', 'anual', 'anual', 'anual'],
      ['semestral', 'semestral', 'semestral', 'semestral'],
      ['anual', 'semestral', 'anual', 'semestral'],
    ] as const;
    for (const organization of organizations)
      for (const annualStages of [2, 3, 4])
        for (const semesterStages of [1, 2]) {
          const state: AssessmentSettings = {
            year,
            offers: selectableModalities.map((kind, index) => ({
              id: kind,
              kind,
              delivery: 'a-conferir',
              organization: organization[index],
              stages: {
                perTerm: organization[index] === 'semestral' ? semesterStages : annualStages,
              },
              scope: { status: 'covered' },
            })),
          };
          const declared = new Set(
            expandRequirements(policy.catalogue!, state).map((item) => item.row.id),
          );
          // Legacy rows keep old IDs optional on purpose; only declared rows carry the table's rules.
          for (const row of activityChecklist(state).filter((item) => declared.has(item.id))) {
            const id = row.id.replace(/-\d(:[a-z]+)?$/, '');
            for (const offer of state.offers) {
              if (row.offerId && row.offerId !== offer.id) continue;
              // A cycle row belongs to the offers organised in that cycle.
              if (repeat.get(id) === 'cycle' && !termsFor(state, offer.id).includes(row.term!))
                continue;
              expect(
                applicabilityFor(state, row, offer),
                `${row.id} ${offer.id} ${organization.join('/')} ${annualStages}/${semesterStages}`,
              ).toBe(shown.get(`${id} ${offer.id}`));
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
    const state: AssessmentSettings = {
      year,
      offers: [
        { id: 'integrado', kind: 'integrado', delivery: 'a-conferir', organization: 'anual' },
      ],
    };
    for (const row of activityChecklist(state)) {
      if (row.month)
        expect(row.name.toLocaleLowerCase('pt-BR'), row.id).toContain(months[row.month - 1]);
      if (row.minHours) expect(row.name, row.id).toContain(`${row.minHours} horas`);
    }
  }
});
