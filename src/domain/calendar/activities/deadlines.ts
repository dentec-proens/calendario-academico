import type { AssessmentSettings, CalendarPeriod, CalendarActivity } from '../model.ts';
import { parseDate, automaticEventSource } from '../counting/core.ts';
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
  original: string,
  events: CalendarActivity[],
  modality: string,
) {
  parseDate(original);
  const offer = offerFor(state, modality);
  const causes = events.filter(
    (event) =>
      event.deadlineExtensionCause &&
      event.kind === 'exclude' &&
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
    const date = new Date(time).toISOString().slice(0, 10),
      active = scoped.filter((e) => e.start <= date && e.end >= date);
    if (
      periods.some((p) => p.start <= date && p.end >= date) &&
      !active.some((e) => e.kind === 'exclude') &&
      (state.weekdays.includes(new Date(time).getUTCDay()) ||
        active.some((e) => e.kind === 'include'))
    )
      return { date, original, source: 'municipal-extension' as const, evidence };
  }
  return { date: null, original, source: 'municipal-extension' as const, evidence };
}
