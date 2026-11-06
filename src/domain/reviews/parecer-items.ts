/** Items of the technical-pedagogical parecer (SEI 3959640), shared base of the review policies. */
export interface ReviewCriterion {
  id: string;
  title: string;
  item: string;
  /** Name/category search used as a weak signal; never proof of compliance. */
  pattern: string | null;
  /** What the norm requires, complete enough to assess the criterion; absent without a norm. */
  requirement?: string;
  /** Device and decisions behind the requirement, shown next to it. */
  source?: string;
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
const rows: [string, string, string, string | null][] = [
  [
    'annual',
    'Mínimo de 200 dias letivos anuais e carga horária do PPC',
    'Análise técnico-pedagógica',
    null,
  ],
  ['semester', '100 dias por semestre para oferta semestral', 'Análise técnico-pedagógica', null],
  [
    'window',
    'Janela do ano letivo: 04/02 a 18/12/2026; início até 28/02/2026',
    'Análise técnico-pedagógica',
    null,
  ],
  [
    'minutes',
    'Extratos das atas de aprovação pelo CGPC e Codic',
    'Instrução processual',
    'cgpc|codic|ata',
  ],
  ['I', 'Início e término de cada período: bimestre/trimestre, semestre e ano', 'Art. 7º, I', null],
  ['II', 'Feriados e recessos acadêmicos e administrativos', 'Art. 7º, II', 'feriado|recesso'],
  ['III', 'Períodos de férias escolares', 'Art. 7º, III', 'ferias'],
  [
    'IV',
    'Férias docentes: 45 dias, preferencialmente coincidentes com férias escolares',
    'Art. 7º, IV',
    'ferias.*docent|docent.*ferias',
  ],
  [
    'V',
    'Matrícula e ajustes de veteranos dos cursos subsequentes e de graduação',
    'Art. 7º, V',
    'matricula',
  ],
  [
    'VI',
    'Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio: uma vez no anual; duas no semestral',
    'Art. 7º, VI',
    'aproveitamento|certificacao|equivalencia',
  ],
  [
    'VII',
    'Trancamento de curso e cancelamento de componente: subsequentes e graduação',
    'Art. 7º, VII',
    'trancamento|cancelamento',
  ],
  [
    'VIII',
    'Editais de transferência, reingresso e portadores de diploma antes do período: uma vez no anual; duas no semestral',
    'Art. 7º, VIII',
    'transferencia|reingresso|diploma',
  ],
  [
    'IX',
    'Lançamento dos resultados e frequência de cada etapa',
    'Art. 7º, IX',
    'resultado|rendimento|frequencia',
  ],
  [
    'X',
    'Lançamento dos resultados finais e frequência',
    'Art. 7º, X',
    'resultado.*fina|fina.*resultado',
  ],
  ['XI', 'Fechamento e entrega dos diários de classe', 'Art. 7º, XI', 'diario'],
  [
    'XII',
    'Submissão do PIT e do Plano de Ensino à direção',
    'Art. 7º, XII',
    '\\bpit\\b|plano.*ensino|plano individual',
  ],
  [
    'XIII',
    'Conselhos/coletivos e reuniões pedagógicas após resultados parciais',
    'Art. 7º, XIII',
    'conselho|coletivo|reuniao pedagogica',
  ],
  [
    'XIV',
    'Prazo para estudantes solicitarem revisão de resultados finais',
    'Art. 7º, XIV',
    'revisao.*resultado',
  ],
  [
    'XV',
    'Conselhos/coletivos extraordinários para revisão de resultados',
    'Art. 7º, XV',
    'extraordinario',
  ],
  [
    'XVI',
    'Reuniões com familiares, responsáveis e comunidade',
    'Art. 7º, XVI',
    'familia|responsave|comunidade',
  ],
  [
    'XVII',
    'Eventos de ensino, pesquisa, extensão e inovação do campus',
    'Art. 7º, XVII',
    'ensino|pesquisa|extensao|inovacao',
  ],
  ['XVIII', 'Encontro dos egressos', 'Art. 7º, XVIII', 'egresso'],
  ['XIX', 'Evento sobre estágios', 'Art. 7º, XIX', 'estagio'],
  [
    'XX',
    'Fase local da Olimpíada Brasileira de Robótica até 31/08/2026',
    'Art. 7º, XX',
    'robotica|\\bobr\\b',
  ],
  ['XXI', 'Mostra de Cursos até 30/09/2026', 'Art. 7º, XXI', 'mostra.*curso'],
  ['XXII', 'Formação pedagógica: mínimo de 40 horas anuais', 'Art. 7º, XXII', 'formacao'],
  [
    'XXIII',
    'Planejamento/replanejamento coletivo: mínimo de 20 horas anuais',
    'Art. 7º, XXIII',
    'planejamento',
  ],
  [
    'XXIV',
    'Semana de Valorização de Mulheres que Fizeram História em março: obrigatória nos técnicos e facultativa na graduação',
    'Art. 7º, XXIV',
    'mulher',
  ],
  [
    'XXV',
    'Semana Cultural Interescolar em outubro: obrigatória nos técnicos e facultativa na graduação',
    'Art. 7º, XXV',
    'cultural|interescolar',
  ],
];
export const parecerItems = frozenCriteria(
  rows.map(([id, title, item, pattern]) => ({ id, title, item, pattern })),
);

/** School holidays leave out teacher vacations, which have a criterion of their own. */
export const isTeacherVacation = (event: { id: string; name: string }) =>
  /docent|professor/.test(
    event.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  ) || event.id.startsWith('teacher-vacation');
const hoursNote = {
  text: 'A quantidade de dias/horas não está comprovada pela identificação do evento.',
};
/** Checks the 2026 parecer leaves to the reviewer, by its own criteria. */
export const parecerNotes = Object.freeze({
  annual: [{ text: 'Carga horária do PPC exige análise.' }],
  IV: [hoursNote],
  V: [
    {
      text: 'O texto do parecer menciona subsequentes e graduação: confira se não se aplica.',
      whenAllOffers: ['integrado'],
    },
  ],
  VII: [
    {
      text: 'O texto do parecer menciona subsequentes e graduação: confira se não se aplica.',
      whenAllOffers: ['integrado'],
    },
  ],
  XXII: [hoursNote],
  XXIII: [hoursNote],
  XXIV: [
    {
      text: 'A norma de referência considera esse evento facultativo para graduação.',
      whenAllOffers: ['graduacao'],
    },
  ],
  XXV: [
    {
      text: 'A norma de referência considera esse evento facultativo para graduação.',
      whenAllOffers: ['graduacao'],
    },
  ],
} as const);
