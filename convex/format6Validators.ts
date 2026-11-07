import { v } from 'convex/values';
import { contentState } from './validators';

/**
 * Format 6 of the stored calendar, accepted only until the contraction of the format 7 migration.
 * The same state with `schemaVersion: 6` and the intervals of the teacher vacations.
 */
const vacations = v.object({
  firstStart: v.string(),
  firstEnd: v.string(),
  secondStart: v.optional(v.string()),
  secondEnd: v.optional(v.string()),
  thirdStart: v.optional(v.string()),
  thirdEnd: v.optional(v.string()),
});

export const format6ContentState = v.object({
  ...contentState.fields,
  schemaVersion: v.literal(6),
  teacherVacations: v.optional(vacations),
});
