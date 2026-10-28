/** Planning state shown on one checklist card, summarised from its per-offer coverage. */
export type ActivityStatus = 'pending' | 'partial' | 'complete' | 'optional' | 'unconfigured';

export const activityStatusLabels: Record<ActivityStatus, string> = {
  pending: 'Planejamento pendente',
  partial: 'Planejamento parcial',
  complete: 'Planejamento completo',
  optional: 'Opcional',
  unconfigured: 'Aplicação a confirmar',
};

interface OfferCoverage {
  applicability: 'required' | 'optional' | 'unconfigured';
  coverage: 'pending' | 'partial' | 'complete';
  issues: readonly string[];
  warnings: readonly string[];
}

/**
 * Required offers decide the status; an activity with no required offer is optional or awaits
 * confirmation. `toConfirm` counts offers whose application is still open next to required ones.
 * Completion means dates were planned, never that compliance or execution was proven.
 */
export function activityStatus(rows: readonly OfferCoverage[]) {
  const required = rows.filter((row) => row.applicability === 'required');
  const unconfigured = rows.filter((row) => row.applicability === 'unconfigured').length;
  const status: ActivityStatus = required.length
    ? required.every((row) => row.coverage === 'complete')
      ? 'complete'
      : required.every((row) => row.coverage === 'pending')
        ? 'pending'
        : 'partial'
    : unconfigured
      ? 'unconfigured'
      : 'optional';
  return {
    status,
    toConfirm: required.length ? unconfigured : 0,
    diverges: new Set(rows.map((row) => `${row.applicability}:${row.coverage}`)).size > 1,
    problems: rows.some((row) => row.issues.length > 0 || row.warnings.length > 0),
  };
}
