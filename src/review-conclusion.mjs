export const partialConclusion='Visto que o Calendário Acadêmico e Administrativo proposto atende apenas parcialmente aos requisitos da Resolução Consup/IFPR nº XXX/2026, devolve-se o processo ao campus para os ajustes e a revisão necessários à sua validação.';
export const favorableConclusion='Como o Calendário Acadêmico e Administrativo proposto atende integralmente aos requisitos da Resolução Consup/IFPR nº XXX/2026, manifesta-se parecer favorável à proposta e encaminha-se o processo à Proens para aprovação.';
export function suggestedConclusion(criteria,entries){
 const active=criteria.map(c=>entries.find(e=>e.id===c.id));
 if(active.some(e=>e?.reviewed===true&&e.status==='NAO_ATENDIDO'))return partialConclusion;
 if(active.length&&active.every(e=>e?.reviewed===true&&['ATENDIDO','NAO_APLICAVEL'].includes(e.status))&&active.some(e=>e.status==='ATENDIDO'))return favorableConclusion;
 return '';
}
export function updateConclusion(text,criteria,entries){
 const base=String(text||'').replaceAll(partialConclusion,'').replaceAll(favorableConclusion,'').trim();
 return [base,suggestedConclusion(criteria,entries)].filter(Boolean).join('\n\n');
}
