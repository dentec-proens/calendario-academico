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

/**
 * Builds a policy's activity-to-criterion lookup from the shared parecer items and the
 * policy's own renumbering. New-student registration is local and never inherits a criterion.
 */
export function reviewCriterionLookup(overrides: Readonly<Record<string, string>> = {}) {
  return (activityId: string): string | undefined => {
    const activity = activityId.split(':')[0].replace(/-[0-4]$/, '');
    return overrides[activity] ?? commonCriteria[activity];
  };
}
