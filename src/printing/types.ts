import type { CalendarActivity, CalendarPeriod, AssessmentSettings } from '../domain-types.ts';
import type { countCalendar } from '../calendar.ts';
import type { evaluateCalendar } from '../evaluation.ts';
export type PrintState = AssessmentSettings & {
  year: number;
  campus?: string;
  periods: CalendarPeriod[];
};
export type PrintResult =
  | (ReturnType<typeof countCalendar> & {
      byModality?: ReturnType<typeof evaluateCalendar>['byModality'];
    })
  | null;
export interface DistributionRow {
  label: string;
  start?: string;
  end?: string;
  available: boolean;
  total: number | null;
  byWeekday: number[] | null;
}
export interface PrintRecord {
  name?: string;
  courses?: string;
  classes?: string;
  shifts?: string;
  purpose?: string;
  proposalCopy?: boolean;
  readiness?: { ready: boolean };
  version?: number;
  currentCatalogueRevision?: number;
}
export type PrintEvent = Pick<
  CalendarActivity,
  'start' | 'end' | 'category' | 'modalities' | 'requirementId'
> &
  Partial<Pick<CalendarActivity, 'kind' | 'id' | 'name'>> & { institutional?: boolean };
