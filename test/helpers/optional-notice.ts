import { modalityIds } from '../../src/domain/calendar/config.ts';

/**
 * consup-292-2027-v8 (relaxes) makes the transfer notice (art. 11, VIII) optional for every
 * offer. Frozen captures predate it: tests compare them through these helpers, which declare the
 * decision on the captured row and turn its required applicability into optional.
 */
const note = 'Edital opcional por decisão institucional; cadastro permitido.';
const decision = 'opcional para todas as ofertas (consup-292-2027-v8)';
const isNotice = (id: string) => /^admission-notice-\d+$/.test(id);
const relax = (value: unknown) => (value === 'required' ? 'optional' : value);

type Row = {
  id: string;
  basis?: string;
  applicability?: string;
  applicabilityByOffer?: Record<string, string>;
  byModality?: Record<string, { applicability: string; note: string | null }>;
};

/**
 * Captured 2027 rows with the optional notice; every other field is kept. `optionalFor` is left
 * out of captures that hide it, as the catalogue fingerprint does.
 */
export const withOptionalNotice = <T extends Row>(
  rows: readonly T[],
  { optionalFor = true } = {},
): T[] =>
  rows.map((row) => {
    if (!isNotice(row.id) || row.basis === 'Classificação legada') return row;
    return {
      ...row,
      decision,
      ...(optionalFor
        ? { optionalFor: Object.fromEntries(modalityIds.map((m) => [m, note])) }
        : {}),
      ...(row.applicability ? { applicability: relax(row.applicability) } : {}),
      ...(row.applicabilityByOffer
        ? {
            applicabilityByOffer: Object.fromEntries(
              Object.entries(row.applicabilityByOffer).map(([k, v]) => [k, relax(v)]),
            ),
          }
        : {}),
      ...(row.byModality
        ? {
            byModality: Object.fromEntries(
              Object.entries(row.byModality).map(([k, v]) => [
                k,
                { ...v, applicability: relax(v.applicability), note },
              ]),
            ),
          }
        : {}),
    };
  });

/** Captured coverage rows: the notice no longer requires a date. */
export const withOptionalNoticeCoverage = <
  T extends { requirementId: string; applicability: string },
>(
  rows: readonly T[],
): T[] =>
  rows.map((row) =>
    isNotice(row.requirementId) ? { ...row, applicability: relax(row.applicability) } : row,
  );

/** Captured readiness messages: a notice without dates is no longer an issue. */
export const withOptionalNoticeReadiness = (messages: readonly string[]): string[] =>
  messages.filter(
    (message) => !/\[admission-notice-\d+\]: vincule um evento com datas/.test(message),
  );
