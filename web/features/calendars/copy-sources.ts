import { usePaginatedQuery } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { statusLabels } from '#src/domain/calendar/lifecycle.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import { functions } from '../../shared/convex/client.ts';
import type { CalendarSummary } from '../calendar-list/CalendarIdentityCell.tsx';

/** The calendars of a campus that can lend their dates. A campus has far fewer than one page. */
export function useCopySources(campusId: string | undefined) {
  const pagination = usePaginatedQuery(
    functions.calendars.calendarPage,
    campusId ? { deleted: false, campusId: campusId as Id<'campuses'> } : 'skip',
    { initialNumItems: 100 },
  );
  return {
    sources: pagination.results as readonly CalendarSummary[],
    loading: pagination.status === 'LoadingFirstPage',
  };
}

/** Two calendars of a campus and year may share a name: the offers and status tell them apart. */
export const copySourceLabel = (source: CalendarSummary) =>
  `${source.name} · ${source.offerKinds.map((kind) => modalityLabels[kind]).join(', ')} · ${statusLabels[source.status]}`;
