import { observanceRules, observanceEventId } from '../../src/domain/calendar/observances.ts';

export const teacherDayId = observanceEventId(
  observanceRules(2027).find((rule) => rule.key === 'teacher-day')!,
);
export const publicServantDayId = observanceEventId(
  observanceRules(2027).find((rule) => rule.key === 'public-servant-day')!,
);
