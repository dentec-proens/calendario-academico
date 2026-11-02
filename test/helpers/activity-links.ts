import {
  activityRef,
  sameActivity,
  type ActivityRef,
  type ReferenceSemester,
  type StagePosition,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import type { AcademicTerm, AssessmentSettings } from '../../src/domain/calendar/model.ts';

/** Links (`ActivityRef`, plan section 5.1) for test data, validated as the domain does. */
export const onceLink = (activityId: string): ActivityRef => activityRef({ activityId });
export const cycleLink = (activityId: string, term: AcademicTerm): ActivityRef =>
  activityRef({ activityId, term });
export const semesterLink = (activityId: string, semester: ReferenceSemester): ActivityRef =>
  activityRef({ activityId, semester });
export const stageLink = (
  activityId: string,
  offerId: string,
  position: StagePosition,
): ActivityRef => activityRef({ activityId, offerId, position });
/** A stage link by its reported ordinal, as under an unclassified organization. */
export const unclassifiedStage = (activityId: string, offerId: string, ordinal: number) =>
  stageLink(activityId, offerId, { status: 'unclassified', reportedOrdinal: ordinal });
export const definedStage = (
  activityId: string,
  offerId: string,
  term: AcademicTerm,
  number: number,
) => stageLink(activityId, offerId, { status: 'defined', term, number });

/** Link of the row the configuration generates with this plan row ID (`ActivityPlanItem.id`). */
export function rowLink(state: AssessmentSettings, rowId: string): ActivityRef {
  const row = activityPlan(state).find((item) => item.id === rowId);
  if (!row) throw new Error(`Linha ${rowId} não gerada pela configuração.`);
  return row.activity;
}

/** The date is linked to the generated row with this plan row ID. */
export const linkedToRow =
  (state: AssessmentSettings, rowId: string) =>
  (event: { activity?: ActivityRef }): boolean =>
    sameActivity(event.activity, rowLink(state, rowId));
