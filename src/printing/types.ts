import type {
  CalendarActivity,
  CalendarPeriod,
  AssessmentSettings,
} from '../domain/calendar/model.ts';
import type { countCalendar } from '../domain/calendar/counting/core.ts';
import type { evaluateCalendar } from '../domain/calendar/counting/evaluation.ts';
export type PrintState = AssessmentSettings & {
  year: number;
  campus?: string;
  periods: CalendarPeriod[];
};
export type PrintResult =
  | (ReturnType<typeof countCalendar> & {
      byOffer?: ReturnType<typeof evaluateCalendar>['byOffer'];
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
  | 'start'
  | 'end'
  | 'category'
  | 'offers'
  | 'requirementId'
  | 'recordType'
  | 'publicationStatus'
  | 'admission'
  | 'deadlineAdjustment'
> &
  Partial<Pick<CalendarActivity, 'kind' | 'id' | 'name'>> & {
    institutional?: boolean;
    evidence?: string;
  };
