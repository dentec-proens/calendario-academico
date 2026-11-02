import type { AssessmentSettings } from '../model.ts';
import { offerFor, stageCount, stagePosition } from '../offers.ts';
import type { StageActivityRef } from './activity-ref.ts';
export function assessmentCount(state: AssessmentSettings, modality: string) {
  const offer = offerFor(state, modality);
  return offer ? stageCount(offer) : 0;
}
/**
 * Link of the offer's `n`-th stage of an activity repeated by stage, at the position the current
 * organization gives it; undefined for an offer outside the calendar.
 */
export function stageActivity(
  state: AssessmentSettings,
  activityId: string,
  offerId: string,
  n: number,
): StageActivityRef | undefined {
  const offer = offerFor(state, offerId);
  return offer
    ? ({ activityId, offerId, position: stagePosition(offer, n) } as StageActivityRef)
    : undefined;
}
