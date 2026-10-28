import type { AssessmentSettings, Organization, CalendarPeriod, AcademicTerm } from '../model.ts';
export function organizationForModality(state: AssessmentSettings, modality: string): Organization {
  if (state.organizationByModality)
    return state.organizationByModality[modality] ?? 'a-classificar';
  if (state.schemaVersion === 3) return 'a-classificar';
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
  if (!state.organizationByModality && state.schemaVersion !== 3) return state.periods;
  return state.periods.filter(
    (p) => p.association?.status === 'defined' && p.association.modalities.includes(modality),
  );
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
  return a.association.modalities.some(
    (m) => b.association?.status === 'defined' && b.association.modalities.includes(m),
  );
}
export const termsFor = (state: AssessmentSettings, modality: string): AcademicTerm[] => {
  const organization = organizationForModality(state, modality);
  return organization === 'anual'
    ? ['annual']
    : organization === 'semestral'
      ? ['first', 'second']
      : [];
};
