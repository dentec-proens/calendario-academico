// Citation only. This module does not change calendar criteria or deadlines.
const calendar2027Citation = 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026';

export function reviewNorm(year: number | string, fallback = '') {
  return Number(year) === 2027 ? calendar2027Citation : fallback;
}

// Only the old generated introduction is changed. Dates, review revisions,
// human notes and internal calendarVersion values remain intact.
export function presentReviewText(text: string | undefined | null, year: number | string) {
  let result = String(text || '').replace(
    /(^|\n)(A análise inicial do Calendário Acadêmico e Administrativo \d{4}, campus [^\r\n]*?), versão \d+(, foi organizada conforme critérios institucionais\.)/g,
    '$1$2$3',
  );
  if (Number(year) === 2027)
    result = result.replace(/Resolução Consup\/IFPR nº XXX\/2026/gi, calendar2027Citation);
  return result;
}
