import { expect, test } from 'vitest';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
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
