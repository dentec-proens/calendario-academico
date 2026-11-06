import { policyFor } from '../policies/registry.ts';

export const reviewSourceFor = (year: number) => policyFor(year).review.source;
export const reviewCriteriaFor = (year: number) => policyFor(year).review.criteria;
/** The 2026 parecer, base of the review items. */
export const reviewSource = reviewSourceFor(2026);
export const reviewCriteria = reviewCriteriaFor(2026);

export const reviewStatuses = ['PENDENTE', 'ATENDIDO', 'NAO_ATENDIDO', 'NAO_APLICAVEL'];

/** How many entries stand in each status; a suggestion saved without an assessment is pending. */
export const assessmentCounts = (entries: readonly { status: string; reviewed: boolean }[]) =>
  entries.reduce<Record<string, number>>((total, entry) => {
    const status = entry.reviewed ? entry.status : 'PENDENTE';
    total[status] = (total[status] ?? 0) + 1;
    return total;
  }, {});
