import { normalizeCalendar } from '../src/calendar-normalize.ts';
import type { CalendarState } from './editor-types.ts';

export function validateImport(value: unknown): CalendarState {
  return normalizeCalendar(value) as CalendarState;
}
