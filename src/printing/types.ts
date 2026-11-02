import type { CalendarStatus } from '../domain/calendar/lifecycle.ts';
import type {
  CalendarEvent,
  CalendarPeriod,
  AssessmentSettings,
  InstitutionalEventSnapshot,
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
  status?: CalendarStatus;
  seiProcess?: string;
  supersededByName?: string;
  version?: number;
  currentCatalogueRevision?: number;
}
export type PrintEvent = Pick<
  CalendarEvent,
  'start' | 'end' | 'category' | 'offers' | 'requirementId' | 'notice' | 'deadlineAdjustment'
> &
  Partial<Pick<CalendarEvent, 'effect' | 'id' | 'name'>> &
  Pick<InstitutionalEventSnapshot, 'institutional' | 'evidence'>;
