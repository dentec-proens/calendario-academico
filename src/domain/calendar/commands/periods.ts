import type { ActivityState } from '../model.ts';
import { DomainError } from '../../errors.ts';

export function applyWeek<S extends ActivityState>(
  state: S,
  values: { weekdays: number[]; weekConfirmed: boolean },
): S {
  if (
    !values.weekdays.length ||
    values.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 5)
  )
    throw new DomainError('Selecione pelo menos um dia regular.');
  if (!values.weekConfirmed) throw new DomainError('Confirme a organização da semana letiva.');
  return {
    ...state,
    ...values,
    weekdays: [...new Set(values.weekdays)],
  };
}
