import { civilDate, type CivilDate } from '../../civil-date.ts';
import type {
  ActivityPlanItem,
  AssessmentSettings,
  CalendarEvent,
  CalendarPeriod,
  ProjectedDate,
} from '../model.ts';
import { longDate } from '../../date-labels.ts';
import { automaticEventSource } from '../counting/core.ts';
import { parseDate } from '../../civil-date.ts';
import { appliesTo } from '../modalities.ts';
import { offerFor } from '../offers.ts';
import { periodsForOffer } from '../organization/periods.ts';
/** Article 3 §2. Only an explicitly classified municipal cause extends the deadline. */
export function prorogatedDeadline(
  state: AssessmentSettings & {
    year: number;
    periods: CalendarPeriod[];
    weekdays?: number[];
    weekConfirmed?: boolean;
  },
  original: CivilDate,
  /** Local dates, or the editor projection (`projectDates`) when the base is included. */
  events: readonly ProjectedDate[],
  modality: string,
) {
  parseDate(original);
  const offer = offerFor(state, modality);
  const causes = events.filter(
    (event) =>
      event.deadlineExtensionCause &&
      event.effect === 'exclude' &&
      appliesTo(event, offer ?? modality) &&
      event.start <= original &&
      event.end >= original,
  );
  if (!causes.length)
    return { date: original, original, source: 'norm' as const, evidence: [] as string[] };
  const evidence = causes.flatMap((event) => {
    const source = automaticEventSource(event);
    return source ? [source] : [];
  });
  if (!state.weekConfirmed || !state.weekdays?.length)
    return { date: null, original, source: 'municipal-extension' as const, evidence };
  const periods = periodsForOffer(state, modality),
    scoped = events.filter((e) => appliesTo(e, offer ?? modality));
  for (
    let time = parseDate(original) + 86400000;
    time <= parseDate(`${state.year}-12-31`);
    time += 86400000
  ) {
    const date = civilDate(new Date(time).toISOString().slice(0, 10)),
      active = scoped.filter((e) => e.start <= date && e.end >= date);
    if (
      periods.some((p) => p.start <= date && p.end >= date) &&
      !active.some((e) => e.effect === 'exclude') &&
      (state.weekdays.includes(new Date(time).getUTCDay()) ||
        active.some((e) => e.effect === 'include'))
    )
      return { date, original, source: 'municipal-extension' as const, evidence };
  }
  return { date: null, original, source: 'municipal-extension' as const, evidence };
}

type DeadlineState = Parameters<typeof prorogatedDeadline>[0];

/** The deadline of one requirement for one offer, with its municipal extension when it applies. */
export function requirementDeadline(
  state: DeadlineState,
  requirement: Pick<ActivityPlanItem, 'deadline' | 'deadlinePolicy'>,
  events: readonly ProjectedDate[],
  modality: string,
) {
  if (!requirement.deadline) return null;
  return requirement.deadlinePolicy === 'reference'
    ? prorogatedDeadline(state, requirement.deadline, events, modality)
    : {
        date: requirement.deadline,
        original: requirement.deadline,
        source: 'norm' as const,
        evidence: [] as string[],
      };
}

export type DeadlineStanding = 'within' | 'adjusted' | 'late';

/**
 * Where a date stands against a deadline. An undetermined extension counts as late, and only a
 * regular admission notice may declare an adjusted deadline (Art. 10, parágrafo único).
 */
export function deadlineStanding(
  requirement: Pick<ActivityPlanItem, 'admissionType'>,
  deadline: ReturnType<typeof requirementDeadline>,
  event: Pick<CalendarEvent, 'end' | 'deadlineAdjustment'>,
): DeadlineStanding {
  if (!deadline || (deadline.date && event.end <= deadline.date)) return 'within';
  const adjustment = event.deadlineAdjustment;
  return requirement.admissionType === 'regular' && adjustment && event.end <= adjustment.date
    ? 'adjusted'
    : 'late';
}

/** How every refusal of a declared deadline starts, so the form can recognise one of its own. */
export const deadlineAdjustmentRefusal = 'O novo prazo precisa ser';

/** What is wrong with a declared deadline, checked when it or the date changes, never on saved data. */
export function deadlineAdjustmentIssue(
  requirement: Pick<ActivityPlanItem, 'deadline'>,
  event: Pick<CalendarEvent, 'end' | 'deadlineAdjustment'>,
) {
  const adjustment = event.deadlineAdjustment?.date;
  if (!requirement.deadline || !adjustment) return undefined;
  if (adjustment <= requirement.deadline)
    return `${deadlineAdjustmentRefusal} posterior a ${longDate(requirement.deadline)}.`;
  if (adjustment < event.end)
    return `${deadlineAdjustmentRefusal} igual ou posterior ao fim da publicação (${longDate(event.end)}).`;
  return undefined;
}
