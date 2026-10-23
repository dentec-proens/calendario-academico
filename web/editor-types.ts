import type { calendars } from './native/client.ts';

export type CalendarRecord = Awaited<ReturnType<typeof calendars.get>> & { proposalCopy?: boolean };
export type CalendarState = CalendarRecord['state'];
export type CalendarEvent = CalendarState['events'][number];
export type Modality = CalendarState['offer'];
export type EditorEvent = CalendarEvent & {
  institutional?: boolean;
  originalStart?: string;
  originalEnd?: string;
};
export type HistoryAnalysis = Awaited<ReturnType<typeof calendars.analyzeHistory>>;
export type History = CalendarRecord['histories'][number];
