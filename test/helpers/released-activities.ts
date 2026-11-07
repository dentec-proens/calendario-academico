import type { ActivityBase } from '../../src/domain/calendar/activities/activity-ref.ts';

/**
 * Activity declarations released by each catalogue, as pairs of ID and repetition base. A saved
 * date links to a pair, and the link is readable while some catalogue declares it
 * (`activityIds()`), so a released pair is never retired. The same ID may repeat by another base
 * in another catalogue (the teaching plan is per reference semester in 2027 and per cycle in the
 * operational catalogue; enrolment, adjustment, withdrawal and component cancellation the other
 * way round), and each catalogue protects its own pairs: dropping `enrolment` by cycle from the
 * 2027 policy must fail even though the operational catalogue still declares enrolment.
 */
export type ReleasedActivities = Record<ActivityBase, readonly string[]>;

/** Declarations of the consup-292-2027 policy. */
export const released2027: ReleasedActivities = {
  once: [
    'school-vacation',
    'teacher-vacation',
    'extraordinary-council',
    'family-meeting',
    'campus-events',
    'alumni-meeting',
    'internship-event',
    'regular-admission-notice',
    'robotics',
    'course-showcase',
    'pedagogical-training',
    'collective-planning',
    'women-week',
    'ethics-week',
    'cultural-week',
  ],
  cycle: [
    'final',
    'diary',
    'recognition',
    'final-appeal',
    'admission-notice',
    'enrolment',
    'adjustment',
    'withdrawal',
    'component-cancellation',
    'registration',
  ],
  semester: ['pit', 'rit', 'teaching-plan'],
  stage: ['stage', 'results', 'council', 'pedagogical-meeting'],
};

/** Declarations of the operational catalogue, used by the years without a norm. */
export const releasedOperational: ReleasedActivities = {
  once: [
    'school-vacation',
    'teacher-vacation',
    'extraordinary-council',
    'family-meeting',
    'campus-events',
    'alumni-meeting',
    'internship-event',
    'robotics',
    'course-showcase',
    'pedagogical-training',
    'collective-planning',
    'women-week',
    'cultural-week',
  ],
  cycle: [
    'final',
    'diary',
    'recognition',
    'final-appeal',
    'admission-notice',
    'registration',
    'teaching-plan',
  ],
  semester: ['pit', 'enrolment', 'adjustment', 'withdrawal', 'component-cancellation'],
  stage: ['stage', 'results', 'council', 'pedagogical-meeting'],
};

/**
 * The global set, the pairs `activityIds()` must read: what makes a saved link readable. It is
 * written out instead of derived from the catalogues, so retiring a pair takes two deliberate
 * edits, here and in the catalogue's list, and a new catalogue or pair is registered in both.
 */
export const releasedGlobal: ReleasedActivities = {
  once: [
    'school-vacation',
    'teacher-vacation',
    'extraordinary-council',
    'family-meeting',
    'campus-events',
    'alumni-meeting',
    'internship-event',
    'regular-admission-notice',
    'robotics',
    'course-showcase',
    'pedagogical-training',
    'collective-planning',
    'women-week',
    'ethics-week',
    'cultural-week',
  ],
  cycle: [
    'final',
    'diary',
    'recognition',
    'final-appeal',
    'admission-notice',
    'enrolment',
    'adjustment',
    'withdrawal',
    'component-cancellation',
    'registration',
    'teaching-plan',
  ],
  semester: [
    'pit',
    'rit',
    'teaching-plan',
    'enrolment',
    'adjustment',
    'withdrawal',
    'component-cancellation',
  ],
  stage: ['stage', 'results', 'council', 'pedagogical-meeting'],
};

export const activityBases = ['once', 'cycle', 'semester', 'stage'] as const;

/** Pairs as `id/base`, sorted, for comparison and messages. */
export const pairsOf = (declared: ReleasedActivities) =>
  activityBases.flatMap((base) => declared[base].map((id) => `${id}/${base}`)).sort();
