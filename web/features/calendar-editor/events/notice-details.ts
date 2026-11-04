import type { ActivityState, AdmissionDestination } from '#src/domain/calendar/model.ts';
import { labelFor } from '#src/domain/calendar/offers.ts';
import {
  noticeDestinationIssues,
  type NoticeDestinationIssue,
} from '#src/domain/calendar/activities/validation.ts';
import type { CalendarEvent } from '../types.ts';

export const publicationLabels = {
  planned: 'Publicação programada',
  published: 'Publicação realizada',
} as const;

const periodName = (state: Pick<ActivityState, 'periods'>, periodId: string) =>
  state.periods.find((period) => period.id === periodId)?.name ?? periodId;

/**
 * Admission destination as read by the campus: one period when every offer shares it, or the
 * period of each offer otherwise. Undefined when the notice has no destination.
 */
export function destinationText(
  state: Pick<ActivityState, 'periods' | 'offers'>,
  destinations: readonly AdmissionDestination[],
) {
  if (!destinations.length) return undefined;
  const periods = new Set(destinations.map((destination) => destination.periodId));
  if (periods.size === 1) return `Destino: ${periodName(state, destinations[0].periodId)}`;
  return `Destinos por oferta: ${destinations
    .map(
      (destination) =>
        `${labelFor(state, destination.offerId)} → ${periodName(state, destination.periodId)}`,
    )
    .join('; ')}`;
}

/** Destination problems of a date, one line per offer. */
export function destinationIssueLines(
  state: Parameters<typeof noticeDestinationIssues>[0],
  event: Pick<CalendarEvent, 'notice' | 'offers'>,
): (NoticeDestinationIssue & { text: string })[] {
  return noticeDestinationIssues(state, event).map((issue) => ({
    ...issue,
    text: `${labelFor(state, issue.offerId)}: ${issue.message}.`,
  }));
}
