import type { calendars } from '../../shared/convex/calendars.ts';

export type CalendarRecord = Awaited<ReturnType<typeof calendars.get>>;
export type CalendarState = CalendarRecord['state'];
export type CalendarSave = Awaited<ReturnType<typeof calendars.save>>;
export type CalendarEvent = CalendarState['events'][number];
export type Modality = CalendarState['offer'];
export type History = CalendarRecord['histories'][number];
export type HistoryAnalysis = Awaited<ReturnType<typeof calendars.analyzeHistory>>;
export type EditorEvent = CalendarEvent & {
  institutional?: boolean;
  originalStart?: string;
  originalEnd?: string;
};
