import { normalizeCalendar } from '../src/calendar-normalize.mjs';
import { teacherVacations } from '../src/teacher-vacations.mjs';
import { calendarModalities } from './editor-domain.ts';
import type { CalendarState } from './editor-types.ts';

export function validateImport(value: unknown): CalendarState {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1
  ) {
    throw new Error('Formato de rascunho incompatível.');
  }
  // The domain normalizer validates untrusted JSON. Upgrade legacy optional fields
  // to the current editor contract before migrating assessment event links.
  const normalized = normalizeCalendar(value) as CalendarState;
  const vacations = normalized.teacherVacations;
  if (vacations && 'julyStart' in vacations && typeof vacations.julyStart === 'string') {
    const legacy = teacherVacations(normalized.year, vacations.julyStart, vacations.evidence);
    normalized.teacherVacations = {
      firstStart: legacy.januaryStart,
      firstEnd: legacy.januaryEnd,
      secondStart: legacy.julyStart,
      secondEnd: legacy.julyEnd,
      evidence: vacations.evidence,
    };
  }
  const stageCount = normalized.assessmentStages;
  normalized.assessmentStagesByModality ??= Object.fromEntries(
    stageCount ? calendarModalities(normalized).map((modality) => [modality, stageCount]) : [],
  );
  return normalizeCalendar(normalized) as CalendarState;
}
