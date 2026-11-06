/** Subjects shown by the step 6 checklist, in display order; each catalogue row declares one. */
export const activityGroups = [
  ['admission', 'Ingresso e vida acadêmica'],
  ['teaching', 'Registros e prazos docentes'],
  ['campus', 'Atividades e semanas do campus'],
  ['other', 'Outros eventos e impedimentos'],
] as const;
export type ActivityGroup = (typeof activityGroups)[number][0];

/**
 * Abbreviations in the names of the art. 11, XII deadlines, with what the rules say about them.
 */
export const activityAbbreviations = {
  PIT: 'Plano Individual de Trabalho, documento que os docentes submetem a cada semestre (Art. 11, XII)',
  RIT: 'Relatório Individual de Trabalho, documento que os docentes submetem a cada semestre (Art. 11, XII)',
} as const;

/** The abbreviation an activity name uses, if any. */
export function abbreviationIn(name: string) {
  return (Object.keys(activityAbbreviations) as (keyof typeof activityAbbreviations)[]).find(
    (abbreviation) => new RegExp(`\\b${abbreviation}\\b`).test(name),
  );
}

/**
 * Which form a requirement needs. Number of hours and stage order stay in their own fields
 * (`minHours`, the stage identifier); the variant only selects the form blocks.
 */
export type ActivityVariant = 'activity' | 'hours' | 'admission-notice' | 'stage';
