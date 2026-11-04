import type { AssessmentSettings, Organization, CalendarPeriod, AcademicTerm } from '../model.ts';
import { associationOffers, offerFor } from '../offers.ts';
export function organizationForOffer(
  state: AssessmentSettings,
  id: string,
): Organization | undefined {
  return offerFor(state, id)?.organization;
}
/** Never pass overlapping offers to the counting core. */
export function periodsForOffer<T extends CalendarPeriod>(
  state: AssessmentSettings & { periods: T[] },
  id: string,
): T[] {
  return state.periods.filter((period) => associationOffers(period.association).includes(id));
}
export function periodForTerm(
  state: AssessmentSettings & { periods: CalendarPeriod[] },
  id: string,
  term: AcademicTerm,
) {
  return periodsForOffer(state, id).find((period) => period.association.term === term);
}
export function samePeriodScope(a: CalendarPeriod, b: CalendarPeriod) {
  return associationOffers(a.association).some((id) =>
    associationOffers(b.association).includes(id),
  );
}
export const termsFor = (state: AssessmentSettings, id: string): AcademicTerm[] => {
  const organization = organizationForOffer(state, id);
  return organization === 'anual'
    ? ['annual']
    : organization === 'semestral'
      ? ['first', 'second']
      : [];
};
