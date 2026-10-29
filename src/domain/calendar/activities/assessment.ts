import type { AssessmentSettings } from '../model.ts';
import { isStageRequirementId } from './metadata.ts';
import { offerFor, stageCount } from '../offers.ts';
export function assessmentCount(state: AssessmentSettings, modality: string) {
  if (!state.offers) return Number(state.assessmentStagesByModality?.[modality]);
  const offer = offerFor(state, modality);
  return offer ? stageCount(offer) : 0;
}
export const stageRequirement = isStageRequirementId;
export const scopedRequirement = (_state: AssessmentSettings, id: string, modality: string) =>
  `${id}:${modality}`;
