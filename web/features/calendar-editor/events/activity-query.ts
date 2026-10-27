import { useSearch } from '@tanstack/react-router';
import { applicationSearch } from '../../../app/search.ts';
export { activityGroups } from '../../../../src/activity-metadata.ts';
export const civilDate = (date: string) => date.split('-').reverse().join('/');

/**
 * Step 6 query state. The router keeps keys its validation dropped with their raw values, so an
 * invalid filter in the URL is validated again here instead of emptying the list.
 */
export function useActivitySearch() {
  return applicationSearch(useSearch({ from: '__root__' }));
}
