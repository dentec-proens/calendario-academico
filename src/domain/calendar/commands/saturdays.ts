import { longDate } from '../../date-labels.ts';
import { civilDate } from '../../civil-date.ts';
import type { ActivityState, CalendarEvent } from '../model.ts';
import { isSaturdayRecord, saturdayEvents } from '../activities/saturdays.ts';
import { DomainError } from '../../errors.ts';

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

export function updateSaturdayActivity<S extends ActivityState>(
  state: S,
  values: { id: string; name: string },
): S {
  const current = state.events.find((event) => event.id === values.id);
  if (!current) throw new DomainError('O sábado não existe mais. Reabra o calendário.');
  if (!isSaturdayRecord(current)) throw new DomainError('Edite esta data na etapa Atividades.');
  const name = values.name.trim();
  if (!name) throw new DomainError('Informe a atividade.');
  return {
    ...state,
    events: state.events.map((event) => (event.id === values.id ? { ...event, name } : event)),
  };
}
