import type { ActivityState, CalendarActivity, AssessmentSettings } from '../model.ts';
import { datesBetween, parseDate } from '../counting/core.ts';
import { periodsForModality } from '../organization/periods.ts';
import { offerIds } from '../offers.ts';
import { DomainError } from '../../errors.ts';

export function monthSaturdays(year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return datesBetween(prefix + '-01', prefix + '-' + last).filter(
    (d) => new Date(parseDate(d)).getUTCDay() === 6,
  );
}

export function saturdayEvents(
  state: Pick<ActivityState, 'year' | 'periods' | 'events'> & AssessmentSettings,
  dates: string[],
  name: string,
  id: () => string,
) {
  if (!dates.length) throw new DomainError('Selecione pelo menos um sábado.');
  if (!name.trim()) throw new DomainError('Informe a atividade.');
  const selected = [...new Set(dates)];
  for (const date of selected) {
    if (new Date(parseDate(date)).getUTCDay() !== 6 || Number(date.slice(0, 4)) !== state.year)
      throw new DomainError('Selecione sábados do ano do calendário.');
    if (
      !offerIds(state).every((modality) =>
        periodsForModality(state, modality).some((p) => p.start <= date && date <= p.end),
      )
    )
      throw new DomainError(
        'O sábado ' +
          date.split('-').reverse().join('/') +
          ' está fora dos períodos letivos. Cadastre ou ajuste o início e o término na etapa Períodos letivos e tente adicionar novamente.',
      );
  }
  return selected
    .filter(
      (date) => !state.events.some((e) => e.kind === 'include' && e.start <= date && date <= e.end),
    )
    .map((date) => ({
      id: id(),
      name: name.trim(),
      kind: 'include' as const,
      category: 'sabado',
      start: date,
      end: date,
    }));
}

const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export interface YearDay {
  date: string;
  day: number;
  weekday: number;
  inPeriod: boolean;
  impediments: string[];
}

export type SaturdayStatus = 'available' | 'registered' | 'outside';

export interface YearSaturday extends YearDay {
  status: SaturdayStatus;
  registration?: CalendarActivity;
  editable: boolean;
}

export interface YearMonth {
  month: number;
  name: string;
  leadingBlanks: number;
  days: Array<YearDay | YearSaturday>;
  registered: number;
}

/** A single-day Saturday activity, the only kind of inclusion the Saturdays step edits. */
export function isSaturdayRecord(event: Pick<CalendarActivity, 'category' | 'start' | 'end'>) {
  return event.category === 'sabado' && event.start === event.end;
}

export function isYearSaturday(day: YearDay | YearSaturday): day is YearSaturday {
  return 'status' in day;
}

// A registered Saturday stays reachable even when its period was later adjusted away,
// so it can still be removed: registered takes precedence over outside.
export function saturdayYear(
  state: Pick<ActivityState, 'year' | 'periods' | 'events'> & AssessmentSettings,
  events: Pick<CalendarActivity, 'kind' | 'start' | 'end' | 'name'>[],
): YearMonth[] {
  return monthNames.map((name, index) => {
    const month = index + 1;
    const prefix = `${state.year}-${String(month).padStart(2, '0')}`;
    const last = new Date(Date.UTC(state.year, month, 0)).getUTCDate();
    const days = datesBetween(`${prefix}-01`, `${prefix}-${last}`).map(
      (date): YearDay | YearSaturday => {
        const weekday = new Date(parseDate(date)).getUTCDay();
        const day: YearDay = {
          date,
          day: Number(date.slice(8)),
          weekday,
          inPeriod: offerIds(state).every((modality) =>
            periodsForModality(state, modality).some((p) => p.start <= date && date <= p.end),
          ),
          impediments: events
            .filter((e) => e.kind === 'exclude' && e.start <= date && date <= e.end)
            .map((e) => e.name),
        };
        if (weekday !== 6) return day;
        const covering = state.events.filter(
          (e) => e.kind === 'include' && e.start <= date && date <= e.end,
        );
        // A Saturday's own record wins over a wider inclusion, so it stays editable here.
        const registration = covering.find(isSaturdayRecord) ?? covering[0];
        const status: SaturdayStatus = registration
          ? 'registered'
          : day.inPeriod
            ? 'available'
            : 'outside';
        return {
          ...day,
          status,
          ...(registration && { registration }),
          editable: registration ? isSaturdayRecord(registration) : false,
        };
      },
    );
    return {
      month,
      name,
      leadingBlanks: days[0]!.weekday,
      days,
      registered: days.filter((d) => isYearSaturday(d) && d.status === 'registered').length,
    };
  });
}

// Preview only: counts selected Saturdays that are open and have no impediment.
export function saturdayGain(months: YearMonth[], dates: string[]): number {
  const selected = new Set(dates);
  return months
    .flatMap((month) => month.days)
    .filter(
      (day) =>
        selected.has(day.date) &&
        isYearSaturday(day) &&
        day.status === 'available' &&
        !day.impediments.length,
    ).length;
}
