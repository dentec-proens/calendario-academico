import { eventCategory } from './activities/categories.ts';
import { DomainError } from '../errors.ts';

/**
 * Effective categories a date of the campus may have while internal (art. 18; plan, section 4.5).
 * Holidays and recesses, vacations, period limits, school Saturdays, training, councils and the
 * creation of the IFPR always belong to the official calendar.
 */
export const internalCategories: readonly string[] = [
  'comemorativo',
  'evento',
  'institucional',
  'prazo',
];

/** Label of the option in the form of campus dates. */
export const internalDateOption = 'Data interna (art. 18)';

/** What eligibility reads of a date: the projection of the editor or the stored date. */
export interface InternalCandidate {
  effect?: string;
  category?: string;
  activity?: unknown;
  /** Present only in the editor projection of an institutional date. */
  institutional?: boolean;
}

/**
 * Why a date cannot be internal, or undefined when it can. The single eligibility rule of internal
 * dates (plan, section 4.5), used by the form, the date commands, the save boundary and printing:
 * only a date of the campus (no activity, never from the institutional base), without effect on
 * the count of school days (`note`), in an allowed effective category (`eventCategory()`, so a
 * note without category is `institucional`).
 */
export function internalDateIssue(date: InternalCandidate): string | undefined {
  if (date.institutional === true)
    return 'Uma data da base institucional pertence ao calendário oficial e não pode ser interna.';
  if (date.activity !== undefined)
    return 'Uma data vinculada a atividade pertence ao calendário oficial e não pode ser interna.';
  if (date.effect !== 'note')
    return 'Só uma data sem efeito na contagem de dias letivos pode ser interna.';
  if (!internalCategories.includes(eventCategory(date)))
    return 'Só datas comemorativas, eventos, outros eventos institucionais e prazos podem ser internos.';
  return undefined;
}

export const canBeInternal = (date: InternalCandidate) => internalDateIssue(date) === undefined;

/** A date marked internal by the campus; absent means official (plan, section 5). */
export const isInternalDate = (date: object) => (date as { internal?: unknown }).internal === true;

/** Refuses a date marked internal that is not eligible, or a mark other than `true`. */
export function validateInternalDate(date: InternalCandidate & { internal?: unknown }) {
  if (date.internal === undefined) return;
  if (date.internal !== true) throw new DomainError('Visibilidade da data inválida.');
  const issue = internalDateIssue(date);
  if (issue) throw new DomainError(issue);
}
