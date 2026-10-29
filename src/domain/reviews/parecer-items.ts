/** Items of the technical-pedagogical parecer (SEI 3959640), shared base of the review policies. */
export interface ReviewCriterion {
  id: string;
  title: string;
  page: number;
  item: string;
  /** Name/category search used as a weak signal; never proof of compliance. */
  pattern: string | null;
}
export interface ReviewSource {
  id: string;
  year: number;
  title: string;
  norm: string;
}
/** Review data is module state shared by every request in a Convex isolate; keep it immutable. */
export const frozenCriteria = (criteria: ReviewCriterion[]): readonly ReviewCriterion[] =>
  Object.freeze(criteria.map((criterion) => Object.freeze(criterion)));
/** The parecer itself remains the review reference for years without a configured norm. */
export const parecerSource: ReviewSource = Object.freeze({
  id: 'SEI 3959640',
  year: 2026,
  title: 'Parecer técnico-pedagógico de calendário acadêmico e administrativo',
  norm: 'Resolução Consup/IFPR 259, de 27/11/2025',
});
/** Day thresholds compared by the parecer's review findings. */
export const parecerDayMinimums = Object.freeze({ annual: 200, semester: 100 } as const);
const rows: [string, string, number, string, string | null][] = [
  [
    'annual',
    'Mínimo de 200 dias letivos anuais e carga horária do PPC',
    1,
    'Análise técnico-pedagógica',
    null,
  ],
  [
    'semester',
    '100 dias por semestre para oferta semestral',
    1,
    'Análise técnico-pedagógica',
    null,
  ],
  [
    'window',
    'Janela do ano letivo: 04/02 a 18/12/2026; início até 28/02/2026',
    1,
    'Análise técnico-pedagógica',
    null,
  ],
  [
    'minutes',
    'Extratos das atas de aprovação pelo CGPC e Codic',
    1,
    'Instrução processual',
    'cgpc|codic|ata',
  ],
  [
    'I',
    'Início e término de cada período: bimestre/trimestre, semestre e ano',
    1,
    'Art. 7º, I',
    null,
  ],
  ['II', 'Feriados e recessos acadêmicos e administrativos', 1, 'Art. 7º, II', 'feriado|recesso'],
  ['III', 'Períodos de férias escolares', 1, 'Art. 7º, III', 'ferias'],
  [
    'IV',
    'Férias docentes: 45 dias, preferencialmente coincidentes com férias escolares',
    1,
    'Art. 7º, IV',
    'ferias.*docent|docent.*ferias',
  ],
  [
    'V',
    'Matrícula e ajustes de veteranos dos cursos subsequentes e de graduação',
    1,
    'Art. 7º, V',
    'matricula',
  ],
  [
    'VI',
    'Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio: uma vez no anual; duas no semestral',
    1,
    'Art. 7º, VI',
    'aproveitamento|certificacao|equivalencia',
  ],
  [
    'VII',
    'Trancamento de curso e cancelamento de componente: subsequentes e graduação',
    1,
    'Art. 7º, VII',
    'trancamento|cancelamento',
  ],
  [
    'VIII',
    'Editais de transferência, reingresso e portadores de diploma antes do período: uma vez no anual; duas no semestral',
    2,
    'Art. 7º, VIII',
    'transferencia|reingresso|diploma',
  ],
  [
    'IX',
    'Lançamento dos resultados e frequência de cada etapa',
    2,
    'Art. 7º, IX',
    'resultado|rendimento|frequencia',
  ],
  [
    'X',
    'Lançamento dos resultados finais e frequência',
    2,
    'Art. 7º, X',
    'resultado.*fina|fina.*resultado',
  ],
  ['XI', 'Fechamento e entrega dos diários de classe', 2, 'Art. 7º, XI', 'diario'],
  [
    'XII',
    'Submissão do PIT e do Plano de Ensino à direção',
    2,
    'Art. 7º, XII',
    '\\bpit\\b|plano.*ensino|plano individual',
  ],
  [
    'XIII',
    'Conselhos/coletivos e reuniões pedagógicas após resultados parciais',
    2,
    'Art. 7º, XIII',
    'conselho|coletivo|reuniao pedagogica',
  ],
  [
    'XIV',
    'Prazo para estudantes solicitarem revisão de resultados finais',
    2,
    'Art. 7º, XIV',
    'revisao.*resultado',
  ],
  [
    'XV',
    'Conselhos/coletivos extraordinários para revisão de resultados',
    2,
    'Art. 7º, XV',
    'extraordinario',
  ],
  [
    'XVI',
    'Reuniões com familiares, responsáveis e comunidade',
    2,
    'Art. 7º, XVI',
    'familia|responsave|comunidade',
  ],
  [
    'XVII',
    'Eventos de ensino, pesquisa, extensão e inovação do campus',
    2,
    'Art. 7º, XVII',
    'ensino|pesquisa|extensao|inovacao',
  ],
  ['XVIII', 'Encontro dos egressos', 2, 'Art. 7º, XVIII', 'egresso'],
  ['XIX', 'Evento sobre estágios', 2, 'Art. 7º, XIX', 'estagio'],
  [
    'XX',
    'Fase local da Olimpíada Brasileira de Robótica até 31/08/2026',
    2,
    'Art. 7º, XX',
    'robotica|\\bobr\\b',
  ],
  ['XXI', 'Mostra de Cursos até 30/09/2026', 2, 'Art. 7º, XXI', 'mostra.*curso'],
  ['XXII', 'Formação pedagógica: mínimo de 40 horas anuais', 2, 'Art. 7º, XXII', 'formacao'],
  [
    'XXIII',
    'Planejamento/replanejamento coletivo: mínimo de 20 horas anuais',
    2,
    'Art. 7º, XXIII',
    'planejamento',
  ],
  [
    'XXIV',
    'Semana de Valorização de Mulheres que Fizeram História em março: obrigatória nos técnicos e facultativa na graduação',
    2,
    'Art. 7º, XXIV',
    'mulher',
  ],
  [
    'XXV',
    'Semana Cultural Interescolar em outubro: obrigatória nos técnicos e facultativa na graduação',
    2,
    'Art. 7º, XXV',
    'cultural|interescolar',
  ],
];
export const parecerItems = frozenCriteria(
  rows.map(([id, title, page, item, pattern]) => ({ id, title, page, item, pattern })),
);
