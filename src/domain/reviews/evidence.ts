/** What the system found for each review criterion, as data for the interface to present. */
import { termLabels } from '../calendar/config.ts';
import {
  isLocalDate,
  type CalendarEvent,
  type CalendarPeriod,
  type TeachingState,
} from '../calendar/model.ts';
import { calendarOffers, labelFor, offerFor } from '../calendar/offers.ts';
import { automaticEventSource } from '../calendar/counting/core.ts';
import { isInternalDate } from '../calendar/internal-dates.ts';
import { evaluatePlan, type ActivityEvaluation } from '../calendar/activities/plan-evaluation.ts';
import { organizationForOffer, periodsForOffer } from '../calendar/organization/periods.ts';
import type { CalendarPolicy } from '../policies/contract.ts';
import type { evaluateCalendar } from '../calendar/counting/evaluation.ts';
import type { ReviewCriterion } from './parecer-items.ts';

type Applicability = ActivityEvaluation['applicability'];
export type ReviewSuggestion = 'ATENDIDO' | 'NAO_ATENDIDO' | 'NAO_APLICAVEL';

export type ReviewEvidence =
  | {
      kind: 'counts';
      provisional: boolean;
      /** A problem of the count as a whole, such as a semester offer without two semesters. */
      issue?: string;
      rows: {
        offer: string;
        period?: string;
        days: number;
        /** `null`: the norm sets no minimum for this offer, so the row has no result. */
        minimum: number | null;
        met: boolean | null;
      }[];
    }
  | {
      kind: 'dates';
      /** Why the dates were or were not compared with the norm. */
      state: 'compared' | 'not-applied' | 'scope' | 'empty' | 'listed';
      withinWindow?: boolean;
      rows: { label: string; start: string; end: string }[];
    }
  | {
      kind: 'coverage';
      rows: {
        offer: string;
        activity: string;
        applicability: Applicability;
        coverage: ActivityEvaluation['coverage'];
        /** `null`: the activity publishes nothing, so execution does not apply. */
        execution: ActivityEvaluation['execution'] | null;
        issues: string[];
        warnings: string[];
      }[];
    }
  /** The records found by name and category, listed in `candidates`. */
  | { kind: 'search' }
  /** Nothing to compute: the reviewer checks the process. */
  | { kind: 'documental' }
  | { kind: 'unavailable'; reason: string };

/** The date fields a record needs; candidates carry only what the reviewer sees. */
type SearchableEvent = Pick<CalendarEvent, 'id' | 'name' | 'start' | 'end'> &
  Parameters<typeof automaticEventSource>[0] & { category?: string; internal?: true };

const normalize = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const reviewCandidate = (e: SearchableEvent) => ({
  id: e.id,
  name: e.name,
  start: e.start,
  end: e.end,
  evidence: automaticEventSource(e) ?? '',
});

export interface EvidenceContext {
  state: TeachingState;
  policy: CalendarPolicy;
  /** The count, even when provisional; `null` when it could not be made. */
  result: ReturnType<typeof evaluateCalendar> | null;
  provisional: boolean;
  unavailableReason: string;
  sameYear: boolean;
  scopeConfirmed: boolean;
  /** Offers the norm governs, and the regime they share. */
  normativeOfferIds: readonly string[];
  normativeRegime: string | null;
  /** Periods the window of the norm applies to. */
  windowPeriods: readonly CalendarPeriod[];
}

/** What a criterion measured by the system adds to what any criterion has. */
interface Measured {
  evidence: ReviewEvidence;
  suggestion?: ReviewSuggestion;
  finding?: string;
  toCheck?: string[];
}

const countEntries = ({ result }: EvidenceContext) =>
  result ? Object.entries(result.byOffer) : [];

function annual(context: EvidenceContext): Measured {
  const { result, provisional, sameYear, state, policy } = context;
  if (!result) return { evidence: { kind: 'unavailable', reason: context.unavailableReason } };
  const entries = countEntries(context);
  const normative = entries.filter(([id]) => context.normativeOfferIds.includes(id));
  const measured: Measured = {
    evidence: {
      kind: 'counts',
      provisional,
      rows: entries.map(([id, count]) => {
        const minimum = count.checks.find((check) => check.scope === 'annual')?.expected ?? null;
        return {
          offer: labelFor(state, id),
          days: count.total,
          minimum,
          met: minimum === null ? null : count.total >= minimum,
        };
      }),
    },
  };
  if (provisional || !normative.length) return measured;
  const short = normative.some(([, count]) => count.total < policy.review.dayMinimums.annual);
  return {
    ...measured,
    finding: short ? 'CONTAGEM_INSUFICIENTE' : 'CONTAGEM_ALCANCADA',
    ...(short && sameYear ? { suggestion: 'NAO_ATENDIDO' as const } : {}),
  };
}

const periodLabel = (period: CalendarPeriod) =>
  period.association.status === 'defined' && period.association.term
    ? termLabels[period.association.term]
    : period.name || period.id;

function semester(context: EvidenceContext): Measured {
  const { result, provisional, sameYear, state, policy, normativeRegime } = context;
  const annualRegime = normativeRegime === 'anual';
  const toCheck = annualRegime
    ? ['Regime anual: confira a aplicabilidade do mínimo semestral.']
    : [];
  const entries = countEntries(context);
  const semestral = (id: string) => organizationForOffer(state, id) === 'semestral';
  const wrongPeriods = entries.filter(
    ([id]) =>
      context.normativeOfferIds.includes(id) &&
      semestral(id) &&
      periodsForOffer(state, id).length !== 2,
  );
  const evidence: ReviewEvidence = result
    ? {
        kind: 'counts',
        provisional,
        ...(wrongPeriods.length
          ? {
              issue: `Oferta semestral sem exatamente dois semestres: ${wrongPeriods
                .map(([id]) => labelFor(state, id))
                .join(', ')}.`,
            }
          : {}),
        rows: entries.flatMap(([id, count]) => {
          const offer = offerFor(state, id);
          const minimum =
            offer && semestral(id)
              ? (policy.countingMinimums(state, offer).semester?.days ?? null)
              : null;
          return periodsForOffer(state, id).map((period) => {
            const days = count.byPeriod[period.id] ?? 0;
            return {
              offer: labelFor(state, id),
              period: periodLabel(period),
              days,
              minimum,
              met: minimum === null ? null : days >= minimum,
            };
          });
        }),
      }
    : { kind: 'unavailable', reason: context.unavailableReason };
  if (annualRegime)
    return {
      evidence,
      toCheck,
      finding: 'APLICABILIDADE',
      ...(sameYear ? { suggestion: 'NAO_APLICAVEL' as const } : {}),
    };
  if (!result || provisional) return { evidence, toCheck };
  const normative = entries.filter(([id]) => context.normativeOfferIds.includes(id));
  const valid =
    normative.length > 0 &&
    normative.every(
      ([id, count]) =>
        !semestral(id) ||
        (periodsForOffer(state, id).length === 2 &&
          periodsForOffer(state, id).every(
            (period) => count.byPeriod[period.id] >= policy.review.dayMinimums.semester,
          )),
    );
  return {
    evidence,
    toCheck,
    finding: valid ? 'CONTAGEM_ALCANCADA' : 'CONTAGEM_INSUFICIENTE',
    ...(sameYear ? { suggestion: valid ? ('ATENDIDO' as const) : ('NAO_ATENDIDO' as const) } : {}),
  };
}

function schoolYear(context: EvidenceContext): Measured {
  const { policy, state, sameYear, scopeConfirmed, windowPeriods } = context;
  const window = policy.window(state);
  const starts = windowPeriods.map((period) => period.start).sort();
  const ends = windowPeriods.map((period) => period.end).sort();
  const first = starts[0];
  const last = ends.at(-1);
  const within =
    first !== undefined &&
    last !== undefined &&
    first >= (window?.start ?? '') &&
    first <= (window?.latestStart ?? '') &&
    last <= (window?.end ?? '');
  // Without a window of its own, a year has nothing to compare and asserts nothing.
  const compared =
    sameYear && scopeConfirmed && !!window && first !== undefined && last !== undefined;
  const evidence: ReviewEvidence = !sameYear
    ? { kind: 'dates', state: 'not-applied', rows: [] }
    : !scopeConfirmed || !window
      ? { kind: 'dates', state: 'scope', rows: [] }
      : first === undefined || last === undefined
        ? { kind: 'dates', state: 'empty', rows: [] }
        : {
            kind: 'dates',
            state: 'compared',
            withinWindow: within,
            rows: [{ label: 'Ano letivo', start: first, end: last }],
          };
  return compared
    ? { evidence, finding: 'DATAS_COMPARADAS', suggestion: within ? 'ATENDIDO' : 'NAO_ATENDIDO' }
    : { evidence };
}

/** Periods of several offers can share a name, so the row says whose period it is. */
const offersOfPeriod = (state: TeachingState, period: CalendarPeriod) =>
  period.association.status === 'defined'
    ? `${period.association.offers.map((id) => labelFor(state, id)).join(', ')} · ${periodLabel(period)}`
    : periodLabel(period);

const periods = ({ state }: EvidenceContext): Measured => ({
  evidence: state.periods.length
    ? {
        kind: 'dates',
        state: 'listed',
        rows: state.periods.map((period) => ({
          label: offersOfPeriod(state, period),
          start: period.start,
          end: period.end,
        })),
      }
    : { kind: 'dates', state: 'empty', rows: [] },
});

/**
 * The criteria the system measures, by the identifiers every review policy declares. Those
 * identifiers are already stable: saved reviews and activity rules refer to them.
 */
export const measuredCriteria: Readonly<Record<string, (context: EvidenceContext) => Measured>> = {
  annual,
  semester,
  window: schoolYear,
  I: periods,
};

const coverageRow = (state: TeachingState, row: ActivityEvaluation) => ({
  offer: labelFor(state, row.offerId),
  activity: row.requirement.name,
  applicability: row.applicability,
  coverage: row.coverage,
  execution:
    row.execution !== 'unclassified'
      ? row.execution
      : row.requirement.admissionType
        ? row.execution
        : null,
  issues: row.issues,
  warnings: row.warnings,
});

/**
 * What the human review confirms, once. A note that holds for only some offers says which: without
 * them, a deadline moved for one offer would read as moved for all.
 */
function reviewNotesOf(state: TeachingState, linked: readonly ActivityEvaluation[]) {
  const offersOf = new Map<string, Set<string>>();
  for (const row of linked)
    for (const note of row.reviewNotes)
      offersOf.set(note, (offersOf.get(note) ?? new Set()).add(row.offerId));
  const all = new Set(linked.map((row) => row.offerId));
  return [...offersOf].map(([note, offers]) =>
    offers.size === all.size
      ? note
      : `${[...offers].map((id) => labelFor(state, id)).join(', ')}: ${note}`,
  );
}

/** Everything the reviewer sees about one criterion, apart from the assessment itself. */
export function criterionSupport(
  criterion: ReviewCriterion,
  context: EvidenceContext,
  events: readonly SearchableEvent[],
  coverage: readonly ActivityEvaluation[],
) {
  const { policy, state } = context;
  const matches = criterion.pattern
    ? events.filter(
        (event) =>
          new RegExp(criterion.pattern!).test(
            normalize(event.name + ' ' + (event.category || '')),
          ) && !policy.review.excludeFromSearch?.(criterion.id, event),
      )
    : [];
  // Internal dates (art. 18) are never evidence: listed apart, for consultation only.
  const internalDates = matches.filter(isInternalDate).map(reviewCandidate);
  const found = matches.filter((event) => !isInternalDate(event)).map(reviewCandidate);
  const measured = measuredCriteria[criterion.id]?.(context);
  let evidence: ReviewEvidence =
    measured?.evidence ?? (criterion.pattern ? { kind: 'search' } : { kind: 'documental' });
  const linked = coverage.filter((row) => row.requirement.reviewCriterionId === criterion.id);
  if (linked.length)
    evidence = { kind: 'coverage', rows: linked.map((row) => coverageRow(state, row)) };
  // Dates under “Vínculo a conferir” are never presented as evidence.
  const linkedRecords = [
    ...new Map(
      linked
        .flatMap((row) => row.evidence.map(reviewCandidate))
        .map((record) => [record.id, record]),
    ).values(),
  ];
  // A name is only a hint: a record found by it stays apart from the dates linked to the activity.
  const candidates = found.filter(
    (record) => !linkedRecords.some((linkedRecord) => linkedRecord.id === record.id),
  );
  const notes = (policy.review.notes?.[criterion.id] ?? [])
    .filter(
      (note) =>
        !note.whenAllOffers ||
        calendarOffers(state).every((offer) => note.whenAllOffers!.includes(offer.kind)),
    )
    .map((note) => note.text);
  const finding =
    measured?.finding ??
    (linkedRecords.length || candidates.length
      ? 'REGISTROS_LOCALIZADOS'
      : criterion.pattern
        ? 'NAO_LOCALIZADO'
        : 'CONFERENCIA_NECESSARIA');
  return {
    evidence,
    linkedRecords,
    candidates,
    internalDates,
    toCheck: [
      ...new Set([...notes, ...(measured?.toCheck ?? []), ...reviewNotesOf(state, linked)]),
    ],
    suggestion: context.scopeConfirmed ? (measured?.suggestion ?? null) : null,
    finding,
  };
}

/** The dated rows of the plan the coverage evidence reads, when the policy links them. */
export const coverageRows = (
  state: TeachingState,
  policy: CalendarPolicy,
  projected: Parameters<typeof evaluatePlan>[1],
) =>
  policy.review.evidence === 'coverage'
    ? evaluatePlan({ ...state, events: projected!.filter(isLocalDate) }, projected).rows
    : [];
