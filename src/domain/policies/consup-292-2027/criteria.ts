import { frozenCriteria } from '../../reviews/parecer-items.ts';

/**
 * Items of the review under Resolução 292, declared whole: the 2026 parecer's list is not their
 * source. `requirement` is the rule in force, the norm plus the recorded decisions, so a reviewer
 * assesses the criterion without going back to the norm. The wording was validated by the PROENS.
 */
export const criteria = frozenCriteria([
  {
    id: 'annual',
    title: 'Dias letivos anuais',
    requirement:
      'Cada curso precisa de pelo menos 200 dias letivos no ano, suficientes para cumprir a carga horária do PPC. Conselhos, reuniões, formação, planejamento, encontro de egressos, prazos e marcos não contam como dia letivo.',
    source: 'Arts. 4º e 5º; decisão de 03/11/2026',
    item: 'Art. 4º',
    pattern: null,
  },
  {
    id: 'semester',
    title: 'Dias letivos por semestre',
    requirement: 'Cursos semestrais precisam de pelo menos 100 dias letivos em cada semestre.',
    source: 'Art. 4º, § 1º',
    item: 'Art. 4º, § 1º',
    pattern: null,
  },
  {
    id: 'window',
    title: 'Período do ano letivo',
    requirement:
      'As atividades letivas devem começar até 15/02/2027, e o ano letivo deve ser cumprido no período de referência de 01/02 a 17/12/2027.',
    source: 'Art. 8º',
    item: 'Art. 8º',
    pattern: null,
  },
  {
    id: 'minutes',
    title: 'Atas do CGPC e do Codic',
    requirement:
      'O processo SEI deve trazer os extratos das atas que comprovam a apreciação do calendário pelo CGPC e pelo Codic.',
    source: 'Arts. 14 e 15',
    item: 'Instrução processual',
    pattern: null,
  },
  {
    id: 'I',
    title: 'Períodos e etapas',
    requirement:
      'Registrar o início e o término do ano ou semestre letivo e de cada etapa acadêmica, conforme a organização do curso.',
    source: 'Art. 11, I',
    item: 'Art. 11, I',
    pattern: null,
  },
  {
    id: 'II',
    title: 'Feriados e recessos',
    requirement:
      'Registrar os feriados e recessos do art. 2º. O campus pode ajustar o Dia do Professor dentro da semana de 15/10, de segunda a domingo, e o Dia do Servidor pode ser 28 ou 29/10. Outra alteração exige justificativa e deliberação da Proens.',
    source: 'Art. 11, II; Arts. 2º e 3º; regra do sistema; decisão de 30/10/2026',
    item: 'Art. 11, II',
    pattern: 'feriado|recesso',
  },
  {
    id: 'III',
    title: 'Férias escolares',
    requirement:
      'Registrar as férias escolares de cada oferta, sem número fixo de períodos. O recesso escolar de julho atende a este item.',
    source: 'Art. 11, III; decisão de 06/11/2026',
    item: 'Art. 11, III',
    pattern: 'ferias',
  },
  {
    id: 'IV',
    title: 'Férias docentes',
    requirement:
      'Registrar as férias docentes, únicas para todo o campus, com exatamente 45 dias no ano do calendário. A coincidência com as férias escolares é orientação, e a parcial é válida.',
    source: 'Art. 11, IV; decisão de 06/11/2026',
    item: 'Art. 11, IV',
    pattern: 'ferias.*docent|docent.*ferias',
  },
  {
    id: 'V',
    title: 'Matrícula de veteranos',
    requirement:
      'Subsequente e graduação: registrar, em cada ciclo, os períodos de matrícula e de ajuste dos veteranos. Opcional no integrado.',
    source: 'Art. 11, V',
    item: 'Art. 11, V',
    pattern: 'matricula',
  },
  {
    id: 'VI',
    title: 'Aproveitamento e certificação',
    requirement:
      'Registrar o período de solicitação de aproveitamento de estudos, certificação de conhecimentos anteriores e equivalência de estágio: ao menos uma vez ao ano em cursos anuais e duas em semestrais.',
    source: 'Art. 11, VI',
    item: 'Art. 11, VI',
    pattern: 'aproveitamento|certificacao|equivalencia',
  },
  {
    id: 'VII',
    title: 'Trancamento e cancelamento',
    requirement:
      'Subsequente e graduação: registrar, em cada ciclo e separadamente, os períodos de trancamento de curso e de cancelamento de matrícula em componente. Opcional no integrado.',
    source: 'Art. 11, VII; decisão de 04/11/2026',
    item: 'Art. 11, VII',
    pattern: 'trancamento|cancelamento',
  },
  {
    id: 'VIII',
    title: 'Editais de transferência e reingresso',
    requirement:
      'Opcional em todas as ofertas. Se houver edital de transferência interna ou externa, reingresso ou portador de diploma, a publicação deve ser anterior ao início do período letivo de destino.',
    source: 'Art. 11, VIII; decisão de 04/11/2026',
    item: 'Art. 11, VIII',
    pattern: 'transferencia|reingresso|diploma',
  },
  {
    id: 'IX',
    title: 'Resultados parciais',
    requirement:
      'Registrar, para cada etapa, o prazo para os docentes lançarem rendimento e frequência no sistema acadêmico.',
    source: 'Art. 11, IX',
    item: 'Art. 11, IX',
    pattern: 'resultado|rendimento|frequencia',
  },
  {
    id: 'X',
    title: 'Resultados finais',
    requirement:
      'Registrar, em cada ciclo, o prazo para os docentes lançarem o rendimento e a frequência finais no sistema acadêmico.',
    source: 'Art. 11, X',
    item: 'Art. 11, X',
    pattern: 'resultado.*fina|fina.*resultado',
  },
  {
    id: 'XI',
    title: 'Diários de classe',
    requirement:
      'Registrar, em cada ciclo, as datas de fechamento e entrega dos diários no sistema acadêmico.',
    source: 'Art. 11, XI',
    item: 'Art. 11, XI',
    pattern: 'diario',
  },
  {
    id: 'XII',
    title: 'Plano de Ensino, PIT e RIT',
    requirement:
      'Registrar, em cada semestre, inclusive em cursos anuais, os prazos para os docentes submeterem os três documentos no sistema acadêmico.',
    source: 'Art. 11, XII',
    item: 'Art. 11, XII',
    pattern: '\\bpit\\b|plano.*ensino|plano individual',
  },
  {
    id: 'XIII',
    title: 'Conselhos e reuniões pedagógicas',
    requirement:
      'Registrar, para cada etapa e após a divulgação dos resultados parciais, as datas do conselho de classe ou coletivo pedagógico e da reunião pedagógica.',
    source: 'Art. 11, XIII',
    item: 'Art. 11, XIII',
    pattern: 'conselho|coletivo|reuniao pedagogica',
  },
  {
    id: 'XIV',
    title: 'Pedido de revisão de resultados',
    requirement:
      'Registrar, em cada ciclo, o prazo para os estudantes pedirem a revisão dos resultados finais.',
    source: 'Art. 11, XIV',
    item: 'Art. 11, XIV',
    pattern: 'revisao.*resultado',
  },
  {
    id: 'XV',
    title: 'Conselho extraordinário',
    requirement:
      'Registrar as datas dos conselhos ou coletivos extraordinários que analisam os pedidos de revisão dos resultados finais.',
    source: 'Art. 11, XV',
    item: 'Art. 11, XV',
    pattern: 'extraordinario',
  },
  {
    id: 'XVI',
    title: 'Reunião com famílias',
    requirement:
      'Obrigatória no técnico integrado: registrar as datas das reuniões com familiares, responsáveis e comunidade. Opcional nas demais ofertas.',
    source: 'Art. 11, XVI; decisão de 29/10/2026',
    item: 'Art. 11, XVI',
    pattern: 'familia|responsave|comunidade',
  },
  {
    id: 'XVII',
    title: 'Eventos do campus',
    requirement:
      'Registrar os eventos de ensino, pesquisa, extensão e inovação realizados no campus.',
    source: 'Art. 11, XVII',
    item: 'Art. 11, XVII',
    pattern: 'ensino|pesquisa|extensao|inovacao',
  },
  {
    id: 'XVIII',
    title: 'Encontro de egressos',
    requirement: 'Registrar a data do encontro de egressos.',
    source: 'Art. 11, XVIII',
    item: 'Art. 11, XVIII',
    pattern: 'egresso',
  },
  {
    id: 'XIX',
    title: 'Evento sobre estágios',
    requirement: 'Registrar a data do evento sobre a temática de estágios.',
    source: 'Art. 11, XIX',
    item: 'Art. 11, XIX',
    pattern: 'estagio',
  },
  {
    id: 'XX',
    title: 'Olimpíada de Robótica',
    requirement: 'Registrar a data da fase local no campus, até 31/08/2027.',
    source: 'Art. 11, XX',
    item: 'Art. 11, XX',
    pattern: 'robotica|\\bobr\\b',
  },
  {
    id: 'XXI',
    title: 'Mostra de Cursos',
    requirement: 'Registrar os dias da Mostra de Cursos no campus, até 30/09/2027.',
    source: 'Art. 11, XXI',
    item: 'Art. 11, XXI',
    pattern: 'mostra.*curso',
  },
  {
    id: 'XXII',
    title: 'Formação pedagógica',
    requirement: 'Registrar períodos de formação pedagógica que somem ao menos 40 horas no ano.',
    source: 'Art. 11, XXII',
    item: 'Art. 11, XXII',
    pattern: 'formacao',
  },
  {
    id: 'XXIII',
    title: 'Planejamento coletivo',
    requirement:
      'Registrar encontros de planejamento e replanejamento coletivo que somem ao menos 20 horas no ano.',
    source: 'Art. 11, XXIII',
    item: 'Art. 11, XXIII',
    pattern: 'planejamento',
  },
  {
    id: 'XXIV',
    title: 'Semana de Valorização de Mulheres',
    requirement:
      'Evento na segunda semana de março. Obrigatório nos técnicos; facultativo na graduação.',
    source: 'Art. 11, XXIV e parágrafo único',
    item: 'Art. 11, XXIV',
    pattern: 'mulher',
  },
  {
    id: 'XXV',
    title: 'Semana da Ética e da Cidadania',
    requirement:
      'Evento na primeira semana de maio. Obrigatório nos técnicos; facultativo na graduação.',
    source: 'Art. 11, XXV e parágrafo único',
    item: 'Art. 11, XXV',
    pattern: 'etica|cidadania',
  },
  {
    id: 'XXVI',
    title: 'Semana Cultural Interescolar',
    requirement:
      'Evento em outubro, aberto a estudantes, famílias e comunidade. Obrigatório nos técnicos; facultativo na graduação.',
    source: 'Art. 11, XXVI e parágrafo único',
    item: 'Art. 11, XXVI',
    pattern: 'cultural|interescolar',
  },
  {
    id: 'admission-regular',
    title: 'Editais do Processo Seletivo 2028',
    requirement:
      'Publicar os editais dos cursos técnicos e de graduação presenciais até 15/06/2027. A Proens pode ajustar o prazo conforme o cronograma do certame.',
    source: 'Art. 10 e parágrafo único',
    item: 'Art. 10',
    pattern: 'processo seletivo',
  },
]);
