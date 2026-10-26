export const activityGroups = [
  ['admission', 'Ingresso e vida acadêmica'],
  ['teaching', 'Registros e prazos docentes'],
  ['campus', 'Atividades e semanas do campus'],
  ['other', 'Outros eventos e impedimentos'],
] as const;
export function activityGroup(id: string) {
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
export const civilDate = (date: string) => date.split('-').reverse().join('/');
