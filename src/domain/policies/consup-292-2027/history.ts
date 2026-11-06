import { civilDate } from '../../civil-date.ts';
import type { RulesetChange } from '../contract.ts';

export const citation = 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026';
// Append a version for every catalogue change; `ruleset-history.test.ts` guards the catalogue.
export const rulesetChanges: readonly RulesetChange[] = [
  {
    version: 'consup-292-2027-v1',
    date: civilDate('2026-10-26'),
    effect: 'establishes',
    source: citation,
    summary: 'Requisitos estruturados para as ofertas técnicas e de graduação.',
  },
  {
    version: 'consup-292-2027-v2',
    date: civilDate('2026-10-29'),
    effect: 'relaxes',
    criteria: ['XVI'],
    source: 'Decisão da gestão do sistema após retorno de campus',
    summary:
      'Reunião com familiares, responsáveis e comunidade passa a ser exigida apenas no técnico integrado.',
  },
  {
    version: 'consup-292-2027-v3',
    date: civilDate('2026-10-29'),
    effect: 'editorial',
    source: 'Decisão da gestão do sistema após retorno de campus',
    summary:
      'Atividades aplicadas por oferta; etapas de avaliação numeradas por ciclo da organização. Sem mudança de obrigações.',
  },
  {
    version: 'consup-292-2027-v4',
    date: civilDate('2026-10-30'),
    effect: 'relaxes',
    source: 'Decisão da gestão do sistema em 30/10/2026',
    summary:
      'Dia do Servidor Público pode ser observado em 28 ou 29/10; preservadas as opções do Dia do Professor.',
  },
  {
    version: 'consup-292-2027-v5',
    date: civilDate('2026-11-03'),
    effect: 'tightens',
    source:
      'Art. 5º, parágrafo único, da Resolução 292 e decisão da gestão do sistema em 03/11/2026',
    summary:
      'Conselhos, reuniões, formação pedagógica, planejamento coletivo, encontro de egressos, prazos e marcos não constituem dia letivo e não acrescentam dias à contagem; a fase local da OBR pode constituir.',
  },
  {
    version: 'consup-292-2027-v6',
    date: civilDate('2026-11-03'),
    effect: 'editorial',
    source: 'Decisão da gestão do sistema em 03/11/2026',
    summary:
      'Novas datas de formação pedagógica, planejamento, eventos, semanas e reuniões começam na categoria da legenda PROENS, não em prazo. Sem mudança de obrigações.',
  },
  {
    version: 'consup-292-2027-v7',
    date: civilDate('2026-11-04'),
    effect: 'tightens',
    criteria: ['VII'],
    source: 'Art. 11, VII, da Resolução 292 e levantamento dos campi de outubro de 2026',
    summary:
      'Trancamento de curso e cancelamento de matrícula em componente passam a ser atividades distintas, cada uma com suas datas; datas já vinculadas ao prazo conjunto valem como trancamento de curso.',
  },
  {
    version: 'consup-292-2027-v8',
    date: civilDate('2026-11-04'),
    effect: 'relaxes',
    criteria: ['VIII'],
    source: 'Decisão da gestão do sistema em 04/11/2026',
    summary:
      'Publicação dos editais de transferência, reingresso e portadores de diploma passa a ser opcional para todas as ofertas; o cadastro continua disponível.',
  },
  {
    version: 'consup-292-2027-v9',
    date: civilDate('2026-11-06'),
    effect: 'editorial',
    source: 'Textos validados pela PROENS',
    summary:
      'Critérios da revisão passam a trazer nome curto, exigência completa e fonte; o critério das atas deixa de usar busca por nome. Sem mudança de obrigações.',
  },
];
export const rulesetVersion = rulesetChanges.at(-1)!.version;
