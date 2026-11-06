import type { reviews } from '../../shared/convex/reviews.ts';
import { updateConclusion } from '#src/domain/reviews/conclusion.ts';
import { reviewNorm } from '#src/domain/reviews/citation.ts';
import { equivalentRulesets } from '#src/domain/policies/registry.ts';
import { reviewEditable } from '#src/domain/calendar/lifecycle.ts';
export type ReviewSupport = Awaited<ReturnType<typeof reviews.get>>;
export type ReviewEntry = Parameters<typeof reviews.save>[1]['entries'][number];
export type ReviewDocument = Awaited<ReturnType<typeof reviews.export>>;
export type ReviewDraft = ReturnType<typeof initialDraft>;

export function initialDraft(opened: ReviewSupport) {
  const rulesChanged = Boolean(
    opened.rulesetVersion &&
    opened.review &&
    !equivalentRulesets(opened.review.rulesetVersion, opened.rulesetVersion),
  );
  const editable = reviewEditable(opened.status);
  const entries = opened.criteria.map((criterion) => {
    const saved = opened.review?.entries.find((entry) => entry.id === criterion.id);
    // A suggestion saved without an assessment goes back to the reviewer; consulting a parecer
    // that can no longer change shows what was saved, as the export does.
    const kept = saved && !rulesChanged && (saved.reviewed || !editable);
    return {
      id: criterion.id,
      status: kept ? saved.status : ('PENDENTE' as const),
      notes:
        rulesChanged && saved?.notes
          ? `Contexto da revisão anterior (${opened.review?.rulesetVersion ?? 'conjunto legado não identificado'}): ${saved.notes}`
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
