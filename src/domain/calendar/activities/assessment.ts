import type { AssessmentSettings } from '../model.ts';
import { isStageRequirementId } from './metadata.ts';
export const assessmentCount = (state: AssessmentSettings, modality: string) =>
  Number(state.assessmentStagesByModality?.[modality]);
export const stageRequirement = isStageRequirementId;
export const scopedRequirement = (_state: AssessmentSettings, id: string, modality: string) =>
  `${id}:${modality}`;
