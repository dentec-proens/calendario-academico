/** Stable activity-to-review relationships; citation wording is presentation only. */
const commonCriteria: Record<string, string> = {
  stage: 'I',
  results: 'IX',
  council: 'XIII',
  'pedagogical-meeting': 'XIII',
  final: 'X',
  diary: 'XI',
  'teaching-plan': 'XII',
  pit: 'XII',
  recognition: 'VI',
  'admission-notice': 'VIII',
  'final-appeal': 'XIV',
  enrolment: 'V',
  adjustment: 'V',
  withdrawal: 'VII',
  'extraordinary-council': 'XV',
  'family-meeting': 'XVI',
  'campus-events': 'XVII',
  'alumni-meeting': 'XVIII',
  'internship-event': 'XIX',
  robotics: 'XX',
  'course-showcase': 'XXI',
  'pedagogical-training': 'XXII',
  'collective-planning': 'XXIII',
  'women-week': 'XXIV',
};

export function activityReviewCriterion(year: number | undefined, id: string): string | undefined {
  if (year !== 2026 && year !== 2027) return undefined;
  const activity = id.split(':')[0].replace(/-[0-4]$/, '');
  if (activity === 'cultural-week') return year === 2027 ? 'XXVI' : 'XXV';
  if (year === 2027) {
    if (activity === 'rit') return 'XII';
    if (activity === 'ethics-week') return 'XXV';
    if (activity === 'regular-admission-notice') return 'admission-regular';
  }
  // New-student registration is local; do not infer a veteran criterion from its name.
  return commonCriteria[activity];
}
