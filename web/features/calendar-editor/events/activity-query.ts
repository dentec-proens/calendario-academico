import { useSearch } from '@tanstack/react-router';
import { applicationSearch } from '../../../app/search.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
export { activityGroups } from '#src/domain/calendar/activities/metadata.ts';
export const civilDate = (date: string) => date.split('-').reverse().join('/');

/**
 * Step 6 query state. The router keeps keys its validation dropped with their raw values, so an
 * invalid filter in the URL is validated again here instead of emptying the list.
 */
export function useActivitySearch() {
  const search = applicationSearch(useSearch({ from: '__root__' }));
  const { state } = useCalendarEditor();
  return {
    ...search,
    atividadeOferta: state.offers.some((offer) => offer.id === search.atividadeOferta)
      ? search.atividadeOferta
      : undefined,
  };
}
