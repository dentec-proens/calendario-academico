import { assessmentStageRequirementPattern } from './calendar-config.ts';
import type { ActivityRequirement, CalendarActivity } from './domain-types.ts';

/** Subjects shown by the step 6 checklist, in display order. */
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

export const isAssessmentStageRecord = (
  event: Pick<CalendarActivity, 'requirementId' | 'recordType'>,
) => isStageRequirementId(event.requirementId) || event.recordType === 'retired-stage';

function group(id: string): ActivityGroup {
  if (
    /^(registration|admission-notice|regular-admission|enrolment|adjustment|withdrawal|recognition|final-appeal)-/.test(
      id,
    )
  )
    return 'admission';
  if (/^(final|diary|teaching-plan|pit|rit|results|stage|council|pedagogical-meeting)-/.test(id))
    return 'teaching';
  if (/week|training|planning|campus|meeting|event|robotics|showcase|council/.test(id))
    return 'campus';
  return 'other';
}

function variant(row: Pick<ActivityRequirement, 'id' | 'minHours' | 'admissionType'>) {
  if (isStageRequirementId(row.id)) return 'stage';
  if (
    row.admissionType ||
    row.id.startsWith('admission-notice-') ||
    row.id === 'regular-admission-notice'
  )
    return 'admission-notice';
  return row.minHours ? 'hours' : 'activity';
}

function defaultCategory(id: string) {
  if (id.includes('council')) return 'conselho';
  if (isStageRequirementId(id)) return 'limite';
  return id === 'cultural-week' ? 'evento' : 'prazo';
}

/** The one place that derives display and form metadata from a catalogue identifier. */
export function withActivityMetadata<Row extends ActivityRequirement>(row: Row): Row {
  return {
    ...row,
    group: group(row.id),
    defaultCategory: defaultCategory(row.id),
    variant: variant(row),
  };
}
