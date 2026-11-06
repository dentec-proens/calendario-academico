import { longDate } from '../../date-labels.ts';
import { civilDate } from '../../civil-date.ts';
import type { ActivityState, CalendarEvent } from '../model.ts';
import { isSaturdayRecord, saturdayEvents, saturdayOfferOptions } from '../activities/saturdays.ts';
import { DomainError } from '../../errors.ts';
import { labelFor, offerNames } from '../offers.ts';
import { updateDate, type DateInput } from './events.ts';

export function applySaturdays<S extends ActivityState>(
  state: S,
  values: { dates: string[]; name: string; confirmed: boolean },
  id: () => string,
): S {
  if (!values.confirmed)
    throw new DomainError('Confirme as atividades para a oferta deste calendário.');
  const events = saturdayEvents(state, values.dates.map(civilDate), values.name, id);
  return { ...state, events: [...state.events, ...events] };
}

export function applySaturdayActivities<S extends ActivityState>(
  state: S,
  activities: { date: string; name: string }[],
  id: () => string,
  marked?: readonly string[],
): S {
  if (!activities.length) throw new DomainError('Selecione pelo menos um sábado.');
  // Build the entire batch before applying it, so an invalid date cannot partially change state.
  const events: CalendarEvent[] = [];
  for (const activity of activities) {
    try {
      events.push(
        ...saturdayEvents(
          { ...state, events: [...state.events, ...events] },
          [civilDate(activity.date)],
          activity.name,
          id,
          marked,
        ),
      );
    } catch (error) {
      throw new DomainError(
        `${longDate(activity.date)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { ...state, events: [...state.events, ...events] };
}

const sameOffers = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((offer) => b.includes(offer));

/**
 * Renames a registered Saturday and, when `offers` differs from what it lists, changes the offers
 * it reaches, with the checks of any edited date. Renaming alone stays possible on a record whose
 * period was adjusted away, which only its offers or its removal can correct.
 */
export function updateSaturdayActivity<S extends ActivityState>(
  state: S,
  values: { id: string; name: string; offers?: readonly string[] },
): S {
  const current = state.events.find((event) => event.id === values.id);
  if (!current) throw new DomainError('O sábado não existe mais. Reabra o calendário.');
  if (!isSaturdayRecord(current)) throw new DomainError('Edite esta data no passo Atividades.');
  const name = values.name.trim();
  if (!name) throw new DomainError('Informe a atividade.');
  const offers = values.offers;
  if (!offers || sameOffers(offers, current.offers))
    return {
      ...state,
      events: state.events.map((event) => (event.id === values.id ? { ...event, name } : event)),
    };
  if (!offers.length) throw new DomainError('Marque ao menos uma oferta.');
  const options = saturdayOfferOptions(state, current).filter((item) => offers.includes(item.id));
  const outOfPeriod = options.filter((item) => !item.inPeriod).map((item) => item.id);
  if (outOfPeriod.length)
    throw new DomainError(
      `${offerNames(state, outOfPeriod)}: sem período letivo nesta data. Desmarque ou ajuste o período no passo Organização por oferta.`,
    );
  // A date counts once per offer: a second record would add nothing and hide behind the first.
  const taken = options.find((item) => item.coveredBy && !current.offers.includes(item.id));
  if (taken)
    throw new DomainError(
      `${labelFor(state, taken.id)} já tem “${taken.coveredBy}” nesta data. Desmarque esta oferta ou altere aquele registro.`,
    );
  return updateDate(state, { ...current, name, offers: [...offers] } as DateInput<S>);
}
