import type { HistoricalDates } from './history-dates.ts';
type HistoryCandidate = {
  key?: string;
  page: number;
  excerpt?: string;
  name: string;
  dates?: HistoricalDates | null;
};
import type { CalendarActivity, AssessmentSettings } from './domain-types.ts';
import { originalDates } from './history-dates.ts';
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

/** Resolve an occurrence once, with the context retained by its selected analysis. */
export function historicalOccurrence(
  history: { year: number },
  analysis: { documentYear?: number; extractorVersion?: number } | undefined,
  candidate: Parameters<typeof originalDates>[0] & Pick<CalendarActivity, 'admission'>,
) {
  return {
    candidate,
    dates: originalDates(candidate, {
      documentYear: analysis?.documentYear ?? history.year,
      analysisVersion: analysis?.extractorVersion,
    }),
  };
}

export function existingHistoryEvent<
  T extends Pick<
    CalendarActivity,
    'name' | 'start' | 'end' | 'requirementId' | 'modalities' | 'admission'
  >,
>(
  events: T[],
  occurrence: ReturnType<typeof historicalOccurrence>,
  state: AssessmentSettings & { year: number },
) {
  const { candidate, dates } = occurrence;
  const name = normalized(candidate.name);
  const matches = events.filter(
    (e) =>
      e.start &&
      e.end &&
      name &&
      normalized(e.name) === name &&
      JSON.stringify(e.admission) === JSON.stringify(candidate.admission) &&
      dates.start &&
      e.start === dates.start &&
      e.end === dates.end,
  );
  // Do not hide a suggestion needed by another offer in a combined calendar.
  return matches.length &&
    calendarModalities(state).every((m) => matches.some((e) => appliesTo(e, m)))
    ? matches[0]
    : null;
}

export const historyCandidateKey = (c: Pick<HistoryCandidate, 'page' | 'excerpt' | 'key'>) =>
  c.key ?? JSON.stringify([c.page, c.excerpt]);

export function includedHistoryCandidate(
  events: Pick<CalendarActivity, 'name' | 'historicalSource' | 'recordType' | 'modalities'>[],
  historyId: string,
  candidate: HistoryCandidate & { name: string },
  _candidates: (HistoryCandidate & { name: string })[],
  context?: {
    analysisId?: string;
    originalAnalysisId?: string;
    recordType?: CalendarActivity['recordType'];
    modalities?: string[];
  },
) {
  const key = historyCandidateKey(candidate);
  const matches = events.filter((e) => {
    const source = e.historicalSource;
    if (!source || source.historyId !== historyId || source.page !== candidate.page) return false;
    if (
      context?.analysisId &&
      (source.analysisId ?? context.originalAnalysisId) !== context.analysisId
    )
      return false;
    if (context?.recordType && (e.recordType ?? 'event') !== context.recordType) return false;
    return source.candidateKey === key;
  });
  return (
    !!matches.length &&
    (!context?.modalities?.length ||
      context.modalities.every((m) => matches.some((e) => appliesTo(e, m))))
  );
}
