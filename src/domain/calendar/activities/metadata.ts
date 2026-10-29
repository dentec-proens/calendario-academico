import { assessmentStageRequirementPattern } from '../config.ts';

/** Subjects shown by the step 6 checklist, in display order; each catalogue row declares one. */
export const activityGroups = [
  ['admission', 'Ingresso e vida acadêmica'],
  ['teaching', 'Registros e prazos docentes'],
  ['campus', 'Atividades e semanas do campus'],
  ['other', 'Outros eventos e impedimentos'],
] as const;
export type ActivityGroup = (typeof activityGroups)[number][0];

/**
 * Which form a requirement needs. Number of hours and stage order stay in their own fields
 * (`minHours`, the stage identifier); the variant only selects the form blocks.
 */
export type ActivityVariant = 'activity' | 'hours' | 'admission-notice' | 'stage';

export const isStageRequirementId = (id: string | undefined) =>
  assessmentStageRequirementPattern.test(id || '');
