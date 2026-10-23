/** Editor-facing domain contracts with native calendar IDs and modalities. */
import { calendarModalities as modalities, modalityLabels as labels } from '../src/modalities.ts';
import { campusInstitutionalEvents as campusEvents } from '../src/teacher-day.ts';
import { teacherVacations as vacations } from '../src/teacher-vacations.ts';
import {
  suggestStages as stages,
  recalculateAssessmentStages as recalculate,
} from '../src/stage-suggestions.ts';
import { saturdayEvents as saturdays } from '../src/saturdays.ts';
import type {
  CalendarEvent,
  CalendarRecord,
  CalendarState,
  EditorEvent,
  Modality,
} from './editor-types.ts';

export const modalityLabels: Record<string, string> = labels;
export const calendarModalities: (state: CalendarState) => Modality[] = modalities;
export const campusInstitutionalEvents: (
  events: CalendarRecord['institutionalEvents'],
  state: CalendarState,
) => EditorEvent[] = campusEvents;
export const recalculateAssessmentStages: (
  state: CalendarState,
  events: EditorEvent[],
) => CalendarEvent[] = recalculate;
export function saturdayEvents(
  state: CalendarState,
  dates: string[],
  name: string,
  evidence: string,
  id: () => string,
): CalendarEvent[] {
  return saturdays(state, dates, name, evidence, id).map((event) => ({
    ...event,
    kind: 'include',
  }));
}
export const teacherVacations: (
  year: number,
  values: Omit<NonNullable<CalendarState['teacherVacations']>, 'evidence'>,
  evidence: string,
) => { events: CalendarEvent[]; total: number } = vacations;
export const suggestStages: (
  state: CalendarState,
  events: EditorEvent[],
  start: string,
) => {
  stages: { requirementId: string; name: string; start: string; end: string; days: number }[];
  total: number;
  byPeriod: boolean;
} = stages;

export function isModality(value: string): value is Modality {
  return Object.hasOwn(labels, value);
}
