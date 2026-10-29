import type { ActivityState, CalendarActivity } from '../model.ts';
import { isSaturdayRecord, saturdayEvents } from '../activities/saturdays.ts';
import { recalculateCalendar } from './recalculate.ts';
import { DomainError } from '../../errors.ts';

export function applySaturdays<S extends ActivityState>(
  state: S,
  values: { dates: string[]; name: string; confirmed: boolean },
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!values.confirmed)
    throw new DomainError('Confirme as atividades para a oferta deste calendário.');
  const events = saturdayEvents(state, values.dates, values.name, id);
  return recalculateCalendar({ ...state, events: [...state.events, ...events] }, institutional);
}

export function applySaturdayActivities<S extends ActivityState>(
  state: S,
  activities: { date: string; name: string }[],
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!activities.length) throw new DomainError('Selecione pelo menos um sábado.');
  // Build the entire batch before applying it, so an invalid date cannot partially change state.
  const events: CalendarActivity[] = [];
  for (const activity of activities) {
    try {
      events.push(
        ...saturdayEvents(
          { ...state, events: [...state.events, ...events] },
          [activity.date],
          activity.name,
          id,
        ),
      );
    } catch (error) {
      throw new DomainError(
        `${activity.date.split('-').reverse().join('/')}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return recalculateCalendar({ ...state, events: [...state.events, ...events] }, institutional);
}

export function updateSaturdayActivity<S extends ActivityState>(
  state: S,
  values: { id: string; name: string },
  institutional: CalendarActivity[],
): S {
  const current = state.events.find((event) => event.id === values.id);
  if (!current) throw new DomainError('O sábado não existe mais. Reabra o calendário.');
  if (!isSaturdayRecord(current))
    throw new DomainError('Este registro é editado em Atividades e datas do campus.');
  const name = values.name.trim();
  if (!name) throw new DomainError('Informe a atividade.');
  return recalculateCalendar(
    {
      ...state,
      events: state.events.map((event) => (event.id === values.id ? { ...event, name } : event)),
    },
    institutional,
  );
}
