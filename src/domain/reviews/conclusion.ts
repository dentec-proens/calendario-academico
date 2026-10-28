import type { reviewSupport } from './support.ts';
import { reviewNorm } from './citation.ts';
import type { ReviewEntry } from '../calendar/model.ts';
export const partialConclusion =
  'Visto que o Calendário Acadêmico e Administrativo proposto atende apenas parcialmente aos requisitos da Resolução Consup/IFPR nº XXX/2026, devolve-se o processo ao campus para os ajustes e a revisão necessários à sua validação.';
export const favorableConclusion =
  'Como o Calendário Acadêmico e Administrativo proposto atende integralmente aos requisitos da Resolução Consup/IFPR nº XXX/2026, manifesta-se parecer favorável à proposta e encaminha-se o processo à Proens para aprovação.';

export function suggestedConclusion(
  criteria: { id: string }[],
  entries: ReviewEntry[],
  norm?: string,
) {
  const active = criteria.map((c) => entries.find((e) => e.id === c.id));
  const title = norm || 'Resolução Consup/IFPR nº XXX/2026',
    withNorm = (text: string) => text.replace('Resolução Consup/IFPR nº XXX/2026', title);
  if (active.some((e) => e?.reviewed === true && e.status === 'NAO_ATENDIDO'))
    return withNorm(partialConclusion);
  if (
    active.length &&
    active.every((e) => e?.reviewed === true && ['ATENDIDO', 'NAO_APLICAVEL'].includes(e.status)) &&
    active.some((e) => e?.status === 'ATENDIDO')
  )
    return withNorm(favorableConclusion);
  return '';
}

export function updateConclusion(
  text: string | undefined | null,
  criteria: { id: string }[],
  entries: ReviewEntry[],
  norm?: string,
) {
  let base = String(text || '')
    .replaceAll(partialConclusion, '')
    .replaceAll(favorableConclusion, '');
  if (norm)
    for (const standard of [partialConclusion, favorableConclusion])
      base = base.replaceAll(standard.replace('Resolução Consup/IFPR nº XXX/2026', norm), '');
  return [base.trim(), suggestedConclusion(criteria, entries, norm)].filter(Boolean).join('\n\n');
}

export function initialConclusion(support: ReturnType<typeof reviewSupport>) {
  const missing = support.criteria.filter((c) => c.initial.finding === 'NAO_LOCALIZADO').length,
    norm = reviewNorm(support.calendar.year, support.sameYear ? support.source.norm : '');
  return `A análise inicial do Calendário Acadêmico e Administrativo ${support.calendar.year}, campus ${support.calendar.campus}, foi organizada conforme critérios institucionais${norm ? ', observada a ' + norm : ''}. Foram examinados ${support.criteria.length} critérios com os dados cadastrados. ${missing} critério(s) não tiveram registros localizados pela busca de nomes/categorias e necessitam conferência documental. ${support.countError || 'A contagem e os conflitos identificados estão registrados na análise técnica.'} Esta é uma minuta de apoio, sujeita à revisão e à conclusão do parecerista. Não constitui aprovação oficial.`;
}
