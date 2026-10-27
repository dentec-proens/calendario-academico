import type { reviews } from '../../shared/convex/reviews.ts';
import { updateConclusion } from '../../../src/review-conclusion.ts';
import { reviewNorm } from '../../../src/review-presentation.ts';
export type ReviewSupport = Awaited<ReturnType<typeof reviews.get>>;
export type ReviewEntry = Parameters<typeof reviews.save>[1]['entries'][number];
export type ReviewDocument = Awaited<ReturnType<typeof reviews.export>>;
export type ReviewDraft = ReturnType<typeof initialDraft>;

export function initialDraft(opened: ReviewSupport) {
  const rulesChanged = Boolean(
    opened.rulesetVersion &&
    opened.review &&
    opened.review.rulesetVersion !== opened.rulesetVersion,
  );
  const entries = opened.criteria.map((criterion) => {
    const saved = opened.review?.entries.find((entry) => entry.id === criterion.id);
    const prior = rulesChanged ? criterion.initial : saved || criterion.initial;
    return {
      id: criterion.id,
      status: rulesChanged ? ('PENDENTE' as const) : prior.status,
      notes:
        rulesChanged && saved?.notes
          ? `Contexto da revisão anterior (${opened.review?.rulesetVersion ?? 'conjunto legado não identificado'}): ${saved.notes}`
          : saved?.reviewed === false && 'finding' in saved && saved.finding
            ? ''
            : saved?.notes || '',
      reviewed: !rulesChanged && saved?.reviewed === true && saved.status !== 'PENDENTE',
    };
  });
  const previousConclusion = rulesChanged
    ? opened.initialConclusion
    : opened.review?.conclusion || opened.initialConclusion;
  const conclusion =
    opened.review && !rulesChanged
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
    dirty: conclusion !== previousConclusion,
  };
}
