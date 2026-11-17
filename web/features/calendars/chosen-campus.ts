import type { Bootstrap } from '../../shared/convex/types.ts';

type Campus = Bootstrap['campuses'][number];

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
