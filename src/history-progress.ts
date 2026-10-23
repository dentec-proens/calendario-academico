import type { HistoricalDates } from './history-dates.ts';
type HistoryCandidate = {
  page: number;
  excerpt?: string;
  name: string;
  dates?: HistoricalDates | null;
};
import type { CalendarActivity, AssessmentSettings } from './domain-types.ts';
import { proposedDates } from './history-dates.ts';
import { calendarModalities, appliesTo } from './modalities.ts';

const normalized = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function historicalRequirement(name: string) {
  const t = normalized(name);
  if (/conselho/.test(t) && /extraordinario/.test(t)) return 'extraordinary-council';
  const term = t.match(/\b([12])\s*(?:o|a)?\s*semestre\b/);
  if (term) {
    const n = term[1];
    if (/\bpit\b|plano individual de trabalho/.test(t)) return `pit-${n}`;
    if (/rematricula/.test(t)) return `enrolment-${n}`;
    if (/ajuste.*matricula/.test(t) && /veterano/.test(t)) return `adjustment-${n}`;
  }
  return null;
}

export function existingHistoryEvent<
  T extends Pick<CalendarActivity, 'name' | 'start' | 'end' | 'requirementId' | 'modalities'>,
>(
  events: T[],
  candidate: Parameters<typeof proposedDates>[0],
  state: AssessmentSettings & { year: number },
) {
  const requirement = historicalRequirement(candidate.name),
    dates = proposedDates(candidate, state.year),
    name = normalized(candidate.name);
  const matches = events.filter(
    (e) =>
      e.start &&
      e.end &&
      (requirement
        ? e.requirementId === requirement
        : name &&
          normalized(e.name) === name &&
          dates.start &&
          e.start === dates.start &&
          e.end === dates.end),
  );
  // Do not hide a suggestion needed by another offer in a combined calendar.
  return matches.length &&
    calendarModalities(state).every((m) => matches.some((e) => appliesTo(e, m)))
    ? matches[0]
    : null;
}

export const historyCandidateKey = (c: Pick<HistoryCandidate, 'page' | 'excerpt'>) =>
  JSON.stringify([c.page, c.excerpt]);

export function includedHistoryCandidate(
  events: Pick<CalendarActivity, 'name' | 'historicalSource'>[],
  historyId: string,
  candidate: HistoryCandidate & { name: string },
  _candidates: (HistoryCandidate & { name: string })[],
) {
  const key = historyCandidateKey(candidate);
  return events.some((e) => {
    const source = e.historicalSource;
    if (!source || source.historyId !== historyId || source.page !== candidate.page) return false;
    return source.candidateKey === key;
  });
}
