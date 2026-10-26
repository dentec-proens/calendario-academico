import type { reviews } from '../../shared/convex/reviews.ts';
import { updateConclusion } from '../../../src/review-conclusion.ts';
import { reviewNorm } from '../../../src/review-presentation.ts';
export type ReviewSupport = Awaited<ReturnType<typeof reviews.get>>;
export type ReviewEntry = Parameters<typeof reviews.save>[1]['entries'][number];
export type ReviewDocument = Awaited<ReturnType<typeof reviews.export>>;
export type ReviewDraft = ReturnType<typeof initialDraft>;

export function initialDraft(opened: ReviewSupport) {
  const entries = opened.criteria.map((criterion) => {
    const saved = opened.review?.entries.find((entry) => entry.id === criterion.id);
    const prior = saved || criterion.initial;
    return {
      id: criterion.id,
      status: prior.status,
      notes:
        saved?.reviewed === false && 'finding' in saved && saved.finding ? '' : saved?.notes || '',
      reviewed: saved?.reviewed === true && saved.status !== 'PENDENTE',
    };
  });
  const previousConclusion = opened.review?.conclusion || opened.initialConclusion;
  const conclusion = opened.review
    ? previousConclusion
    : updateConclusion(
        previousConclusion,
        opened.criteria,
        entries,
        reviewNorm(opened.calendar.year, opened.sameYear ? opened.source.norm : ''),
      );
  return {
    opened,
    entries,
    conclusion,
    processNumber: opened.review?.processNumber || '',
    applicableNorm:
      opened.review?.applicableNorm ||
      reviewNorm(opened.calendar.year, opened.sameYear ? opened.source.norm : ''),
    acknowledgeStale: false,
    changed: {} as Record<string, boolean>,
    conclusionEditable: false,
    dirty: conclusion !== previousConclusion,
  };
}
