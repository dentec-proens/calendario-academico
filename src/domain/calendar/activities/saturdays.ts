import { longDate } from '../../date-labels.ts';
import { type CivilDate } from '../../civil-date.ts';
import type { ActivityState, CalendarEvent, AssessmentSettings } from '../model.ts';
import { datesBetween } from '../counting/core.ts';
import { parseDate } from '../../civil-date.ts';
import { hasPeriodOn } from '../organization/periods.ts';
import { offerIds, offerNames, partialOfferNames } from '../offers.ts';
import { DomainError } from '../../errors.ts';

type SaturdayState = Pick<ActivityState, 'year' | 'periods' | 'events'> & AssessmentSettings;

export function monthSaturdays(year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return datesBetween(prefix + '-01', prefix + '-' + last).filter(
    (d) => new Date(parseDate(d)).getUTCDay() === 6,
  );
}

/** The offers of the calendar with a teaching period on the date: the ones a Saturday can reach. */
export function offersInPeriod(state: SaturdayState, date: string) {
  return offerIds(state).filter((offer) => hasPeriodOn(state, offer, date));
}

const includesDate = (event: CalendarEvent, date: string) =>
  event.effect === 'include' && event.start <= date && date <= event.end;

/**
 * One record per free date, listing the marked offers that have a period on it. Each date reaches
 * only those, so a record never lists an offer outside its periods; a date that would reach no
 * offer refuses the whole batch instead of being dropped without notice. `marked` defaults to every
 * offer, which means every offer with a period on the date.
 */
export function saturdayEvents(
  state: SaturdayState,
  dates: CivilDate[],
  name: string,
  id: () => string,
  marked: readonly string[] = offerIds(state),
) {
  if (!dates.length) throw new DomainError('Selecione pelo menos um sábado.');
  if (!name.trim()) throw new DomainError('Informe a atividade.');
  if (!marked.length) throw new DomainError('Marque ao menos uma oferta.');
  const selected = [...new Set(dates)];
  const events: CalendarEvent[] = [];
  for (const date of selected) {
    if (new Date(parseDate(date)).getUTCDay() !== 6 || Number(date.slice(0, 4)) !== state.year)
      throw new DomainError('Selecione sábados do ano do calendário.');
    const possible = offersInPeriod(state, date);
    if (!possible.length)
      throw new DomainError(
        `O sábado ${longDate(date)} está fora dos períodos letivos: ${offerNames(state, offerIds(state))} sem período nesta data. Cadastre ou ajuste o início e o término no passo Organização por oferta e tente adicionar novamente.`,
      );
    if (state.events.some((event) => includesDate(event, date))) continue;
    const offers = possible.filter((offer) => marked.includes(offer));
    if (!offers.length)
      throw new DomainError(
        `O sábado ${longDate(date)} não vale para nenhuma oferta marcada. Com período letivo nesta data: ${offerNames(state, possible)}. Marque outra oferta ou retire a data da seleção.`,
      );
    events.push({
      id: id(),
      name: name.trim(),
      effect: 'include',
      category: 'sabado',
      start: date,
      end: date,
      offers,
    });
  }
  return events;
}

export interface SaturdayOfferReach {
  id: string;
  /** Selected dates on which the offer has a period. */
  reached: CivilDate[];
  /** Selected dates left out for the offer, for lack of a period. */
  outOfPeriod: CivilDate[];
}

/** What a selection of dates would do, for the panel to say before anything is applied. */
export function saturdaySelection(
  state: SaturdayState,
  dates: readonly CivilDate[],
  marked: readonly string[],
) {
  const offers = offerIds(state).map((id): SaturdayOfferReach => {
    const reached = dates.filter((date) => hasPeriodOn(state, id, date));
    return { id, reached, outOfPeriod: dates.filter((date) => !reached.includes(date)) };
  });
  return {
    offers,
    /** Dates that no marked offer reaches: `saturdayEvents` refuses them. */
    unreached: dates.filter(
      (date) => !offers.some((offer) => marked.includes(offer.id) && offer.reached.includes(date)),
    ),
  };
}

export interface SaturdayOfferOption {
  id: string;
  inPeriod: boolean;
  /** Another inclusion that already makes the date a school day for this offer. */
  coveredBy?: string;
}

/**
 * The offers a registered Saturday could list. Offers it lists stay among them, even one no longer
 * in the calendar or in period, so that a stored list can be corrected.
 */
export function saturdayOfferOptions(
  state: SaturdayState,
  event: Pick<CalendarEvent, 'id' | 'start' | 'offers'>,
): SaturdayOfferOption[] {
  const known = offerIds(state);
  return [...known, ...event.offers.filter((id) => !known.includes(id))].map((id) => {
    const other = state.events.find(
      (item) => item.id !== event.id && includesDate(item, event.start) && item.offers.includes(id),
    );
    return {
      id,
      inPeriod: hasPeriodOn(state, id, event.start),
      ...(other && { coveredBy: other.name }),
    };
  });
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
  date: CivilDate;
  day: number;
  weekday: number;
  impediments: string[];
}

export type SaturdayStatus = 'available' | 'registered' | 'outside';

export interface YearSaturday extends YearDay {
  status: SaturdayStatus;
  registration?: CalendarEvent;
  editable: boolean;
  /** Offers without a teaching period on this date, named when saying what it cannot reach. */
  offersOutOfPeriod: string[];
}

export interface YearMonth {
  month: number;
  name: string;
  leadingBlanks: number;
  days: Array<YearDay | YearSaturday>;
  registered: number;
}

/** A single-day Saturday activity, the only kind of inclusion the Saturdays step edits. */
export function isSaturdayRecord(event: Pick<CalendarEvent, 'category' | 'start' | 'end'>) {
  return event.category === 'sabado' && event.start === event.end;
}

export function isYearSaturday(day: YearDay | YearSaturday): day is YearSaturday {
  return 'status' in day;
}

// A registered Saturday stays reachable even when its period was later adjusted away,
// so it can still be removed: registered takes precedence over outside. A date is available while
// at least one offer has a period on it; only a date no offer can reach is outside.
export function saturdayYear(
  state: SaturdayState,
  events: Pick<CalendarEvent, 'effect' | 'start' | 'end' | 'name' | 'offers'>[],
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
          impediments: events
            .filter((e) => e.effect === 'exclude' && e.start <= date && date <= e.end)
            .map((e) => {
              // An exclusion of part of the offers says so: the others still count the day.
              const reached = partialOfferNames(state, e.offers);
              return reached ? `${e.name} (${reached})` : e.name;
            }),
        };
        if (weekday !== 6) return day;
        const covering = state.events.filter(
          (e) => e.effect === 'include' && e.start <= date && date <= e.end,
        );
        // A Saturday's own record wins over a wider inclusion, so it stays editable here.
        const registration = covering.find(isSaturdayRecord) ?? covering[0];
        const possible = offersInPeriod(state, date);
        const status: SaturdayStatus = registration
          ? 'registered'
          : possible.length
            ? 'available'
            : 'outside';
        return {
          ...day,
          status,
          ...(registration && { registration }),
          editable: registration ? isSaturdayRecord(registration) : false,
          offersOutOfPeriod: offerIds(state).filter((offer) => !possible.includes(offer)),
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
