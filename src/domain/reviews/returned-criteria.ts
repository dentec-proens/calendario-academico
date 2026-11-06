import { equivalentRulesets } from '../policies/registry.ts';

/**
 * What a return tells the campus about one unmet criterion. It is a copy because the campus cannot
 * read the parecer: only the name and the observation, never who assessed it or in which revision.
 */
export interface ReturnedCriterion {
  criterionId: string;
  title: string;
  note?: string;
}

interface SavedReview {
  entries: readonly { id: string; status: string; notes: string; reviewed: boolean }[];
  rulesetVersion?: string;
  submissionId?: string;
}

/**
 * The criteria of the saved parecer that a return carries. A review of another submission or of
 * rules that reopened it says nothing about this round, and a suggestion saved without an
 * assessment is not the reviewer's finding: the form shows neither as "Não atendido".
 */
export function criteriaToReturn(
  criteria: readonly { id: string; title: string }[],
  review: SavedReview | null | undefined,
  current: { submissionId: string | undefined; rulesetVersion: string | undefined },
): ReturnedCriterion[] {
  if (!review || !current.submissionId || review.submissionId !== current.submissionId) return [];
  if (current.rulesetVersion && !equivalentRulesets(review.rulesetVersion, current.rulesetVersion))
    return [];
  return criteria.flatMap(({ id, title }) => {
    const entry = review.entries.find((item) => item.id === id);
    if (!entry?.reviewed || entry.status !== 'NAO_ATENDIDO') return [];
    const note = entry.notes.trim();
    return [{ criterionId: id, title, ...(note ? { note } : {}) }];
  });
}

const noteLine = ({ title, note }: ReturnedCriterion) =>
  note ? `- ${title}: ${note}` : `- ${title}`;
const heading = 'Critérios não atendidos:';

/**
 * Adds the criteria to the note being written, never replacing it: what was typed stays first and a
 * criterion already in the note is not repeated. Only whole criteria go in, so a note at its limit
 * never ends in a cut-off observation; `left` names the ones that did not fit.
 */
export function fillReturnNote(
  current: string,
  criteria: readonly ReturnedCriterion[],
  maximumLength: number,
) {
  const missing = criteria.filter((criterion) => !current.includes(noteLine(criterion)));
  let note = current;
  const left: string[] = [];
  let added = 0;
  for (const criterion of missing) {
    const start = !added
      ? `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${current.includes(heading) ? '' : `${heading}\n`}`
      : `${note}\n`;
    const next = `${start}${noteLine(criterion)}`;
    if (next.length > maximumLength) {
      left.push(criterion.title);
      continue;
    }
    note = next;
    added++;
  }
  return { note, added, left };
}
