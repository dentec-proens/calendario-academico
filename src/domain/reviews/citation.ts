// Citation only. This module does not change calendar criteria or deadlines.
const calendar2027Citation = 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026';

export function reviewNorm(year: number | string, fallback = '') {
  return Number(year) === 2027 ? calendar2027Citation : fallback;
}
