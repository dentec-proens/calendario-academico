import type { RulesetChange } from '../contract.ts';

export const citation = 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026';
// Append a version for every catalogue change; `ruleset-history.test.ts` guards the catalogue.
export const rulesetChanges: readonly RulesetChange[] = [
  {
    version: 'consup-292-2027-v1',
    date: '2026-10-26',
    effect: 'establishes',
    source: citation,
    summary: 'Requisitos estruturados para as ofertas técnicas e de graduação.',
  },
  {
    version: 'consup-292-2027-v2',
    date: '2026-10-29',
    effect: 'relaxes',
    criteria: ['XVI'],
    source: 'Decisão da gestão do sistema após retorno de campus',
    summary:
      'Reunião com familiares, responsáveis e comunidade passa a ser exigida apenas no técnico integrado.',
  },
  {
    version: 'consup-292-2027-v3',
    date: '2026-10-29',
    effect: 'editorial',
    source: 'Decisão da gestão do sistema após retorno de campus',
    summary:
      'Atividades aplicadas por oferta; etapas de avaliação numeradas por ciclo da organização. Sem mudança de obrigações.',
  },
  {
    version: 'consup-292-2027-v4',
    date: '2026-10-30',
    effect: 'relaxes',
    source: 'Decisão da gestão do sistema em 30/10/2026',
    summary:
      'Dia do Servidor Público pode ser observado em 28 ou 29/10; preservadas as opções do Dia do Professor.',
  },
];
export const rulesetVersion = rulesetChanges.at(-1)!.version;
