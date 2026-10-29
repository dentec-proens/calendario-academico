import { DomainError } from '../../errors.ts';
export const invalidCalendar = (message: string, status: 400 | 409 = 400): never => {
  throw new DomainError(message, status);
};
