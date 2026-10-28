export const reviewSource = {
  id: 'SEI 3959640',
  year: 2026,
  title: 'Parecer técnico-pedagógico de calendário acadêmico e administrativo',
  norm: 'Resolução Consup/IFPR 259, de 27/11/2025',
};
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
export const reviewCriteria = rows.map(([id, title, page, item, pattern]) => ({
  id,
  title,
  page,
  item,
  pattern,
}));

export function reviewSourceFor(year: number) {
  return year === 2027
    ? {
        id: 'SEI 4422750',
        year: 2027,
        title: 'Resolução de diretrizes para o calendário acadêmico de 2027',
        norm: 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026',
      }
    : reviewSource;
}
export function reviewCriteriaFor(year: number) {
  if (year !== 2027) return reviewCriteria;
  return [
    ...reviewCriteria.map((criterion) => ({
      ...criterion,
      page: [
        'XII',
        'XIII',
        'XIV',
        'XV',
        'XVI',
        'XVII',
        'XVIII',
        'XIX',
        'XX',
        'XXI',
        'XXII',
        'XXIII',
        'XXIV',
        'XXV',
      ].includes(criterion.id)
        ? 4
        : 3,
      item:
        criterion.id === 'annual'
          ? 'Art. 4º'
          : criterion.id === 'semester'
            ? 'Art. 4º, § 1º'
            : criterion.id === 'window'
              ? 'Art. 8º'
              : criterion.item.replace('Art. 7º', 'Art. 11'),
      title:
        criterion.id === 'window'
          ? 'Janela do ano letivo: 01/02 a 17/12/2027; início até 15/02/2027'
          : criterion.id === 'XII'
            ? 'Plano de Ensino, PIT e RIT em cada semestre'
            : criterion.id === 'XXIV'
              ? 'Semana de Valorização de Mulheres que Fizeram História — segunda semana de março'
              : criterion.id === 'XXV'
                ? 'Semana da Ética e da Cidadania — primeira semana de maio'
                : criterion.title.replaceAll('2026', '2027'),
      pattern: criterion.id === 'XXV' ? 'etica|cidadania' : criterion.pattern,
    })),
    {
      id: 'XXVI',
      title:
        'Semana Cultural Interescolar em outubro: obrigatória nos técnicos e facultativa na graduação',
      page: 4,
      item: 'Art. 11, XXVI',
      pattern: 'cultural|interescolar',
    },
    {
      id: 'admission-regular',
      title:
        'Editais do Processo Seletivo 2028 até 15/06/2027; eventual ajuste pela Proens documentado',
      page: 3,
      item: 'Art. 10',
      pattern: 'processo seletivo',
    },
  ];
}

export const reviewStatuses = ['PENDENTE', 'ATENDIDO', 'NAO_ATENDIDO', 'NAO_APLICAVEL'];
