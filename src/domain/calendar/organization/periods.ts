import type { AssessmentSettings, Organization, CalendarPeriod, AcademicTerm } from '../model.ts';
import { associationOffers, isStructured, offerFor } from '../offers.ts';
export function organizationForModality(state: AssessmentSettings, modality: string): Organization {
  if (state.offers) return offerFor(state, modality)?.organization ?? 'a-classificar';
  if (state.organizationByModality)
    return state.organizationByModality[modality] ?? 'a-classificar';
  if (isStructured(state)) return 'a-classificar';
  return state.regime === 'anual' || state.regime === 'semestral' ? state.regime : 'a-classificar';
}
export function organizationSummary(
  map: Record<string, Organization>,
  modalities: string[],
): 'anual' | 'semestral' | 'misto' | 'a-classificar' {
  const values = modalities.map((m) => map[m]);
  if (values.some((value) => !value || value === 'a-classificar')) return 'a-classificar';
  return new Set(values).size === 1 ? (values[0] ?? 'a-classificar') : 'misto';
}
/** Never pass overlapping offers to the counting core. Unclassified periods have no coverage. */
export function periodsForModality<T extends CalendarPeriod>(
  state: AssessmentSettings & { periods: T[] },
  modality: string,
): T[] {
  if (!state.offers && !state.organizationByModality && !isStructured(state)) return state.periods;
  return state.periods.filter((p) => associationOffers(p.association).includes(modality));
}
export function periodForTerm(
  state: AssessmentSettings & { periods: CalendarPeriod[] },
  modality: string,
  term: AcademicTerm,
) {
  return periodsForModality(state, modality).find(
    (p) => p.association?.status === 'defined' && p.association.term === term,
  );
}
export function samePeriodScope(a: CalendarPeriod, b: CalendarPeriod) {
  if (a.association?.status === 'a-classificar' || b.association?.status === 'a-classificar')
    return false;
  if (!a.association || !b.association) return true;
  return associationOffers(a.association).some((id) =>
    associationOffers(b.association).includes(id),
  );
}

export const organizationForOffer = organizationForModality;
export const periodsForOffer = periodsForModality;
export const termsFor = (state: AssessmentSettings, modality: string): AcademicTerm[] => {
  const organization = organizationForModality(state, modality);
  return organization === 'anual'
    ? ['annual']
    : organization === 'semestral'
      ? ['first', 'second']
      : [];
};
