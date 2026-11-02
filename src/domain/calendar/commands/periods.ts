import type { ActivityState, InstitutionalEventSnapshot } from '../model.ts';
import { recalculateCalendar } from './recalculate.ts';
import { DomainError } from '../../errors.ts';

export function applyWeek<S extends ActivityState>(
  state: S,
  values: { weekdays: number[]; weekConfirmed: boolean },
  institutional: InstitutionalEventSnapshot[],
): S {
  if (
    !values.weekdays.length ||
    values.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 5)
  )
    throw new DomainError('Selecione pelo menos um dia regular.');
  if (!values.weekConfirmed) throw new DomainError('Confirme a organização da semana letiva.');
  return recalculateCalendar(
    {
      ...state,
      ...values,
      weekdays: [...new Set(values.weekdays)],
    },
    institutional,
  );
}
