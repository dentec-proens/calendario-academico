import type { Bootstrap } from '../../shared/convex/types.ts';

type Campus = Bootstrap['campuses'][number];

/** Where the person creates calendars: a campus account reads every campus but writes its own. */
export function creationCampuses(info: Pick<Bootstrap, 'campuses' | 'user'>): readonly Campus[] {
  return info.user.role === 'CAMPUS'
    ? info.campuses.filter((campus) => campus.id === info.user.campusId)
    : info.campuses;
}

/**
 * The campus a new calendar belongs to. Whoever chooses among several campuses starts with none, so
 * a draft is never created in the first campus of the list by default; a single campus needs no
 * choice.
 */
export function chosenCampus(
  campuses: readonly Campus[],
  campusId: string,
  canSelectCampus: boolean,
): Campus | undefined {
  const chosen = campuses.find((item) => item.id === campusId);
  if (chosen || (canSelectCampus && campuses.length > 1)) return chosen;
  return campuses[0];
}
