export const partialConclusion =
  'Visto que o Calendário Acadêmico e Administrativo proposto atende apenas parcialmente aos requisitos da Resolução Consup/IFPR nº XXX/2026, devolve-se o processo ao campus para os ajustes e a revisão necessários à sua validação.';
export const favorableConclusion =
  'Como o Calendário Acadêmico e Administrativo proposto atende integralmente aos requisitos da Resolução Consup/IFPR nº XXX/2026, manifesta-se parecer favorável à proposta e encaminha-se o processo à Proens para aprovação.';

export function suggestedConclusion(criteria, entries, norm) {
  const active = criteria.map((c) => entries.find((e) => e.id === c.id));
  const title = norm || 'Resolução Consup/IFPR nº XXX/2026',
    withNorm = (text) => text.replace('Resolução Consup/IFPR nº XXX/2026', title);
  if (active.some((e) => e?.reviewed === true && e.status === 'NAO_ATENDIDO'))
    return withNorm(partialConclusion);
  if (
    active.length &&
    active.every((e) => e?.reviewed === true && ['ATENDIDO', 'NAO_APLICAVEL'].includes(e.status)) &&
    active.some((e) => e.status === 'ATENDIDO')
  )
    return withNorm(favorableConclusion);
  return '';
}

export function updateConclusion(text, criteria, entries, norm) {
  let base = String(text || '')
    .replaceAll(partialConclusion, '')
    .replaceAll(favorableConclusion, '');
  if (norm)
    for (const standard of [partialConclusion, favorableConclusion])
      base = base.replaceAll(standard.replace('Resolução Consup/IFPR nº XXX/2026', norm), '');
  return [base.trim(), suggestedConclusion(criteria, entries, norm)].filter(Boolean).join('\n\n');
}
