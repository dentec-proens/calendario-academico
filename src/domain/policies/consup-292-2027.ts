import { modalityIds, termLabels } from '../calendar/config.ts';
import type {
  AssessmentSettings,
  ActivityRequirement,
  AcademicTerm,
  CalendarOffer,
} from '../calendar/model.ts';
import { calendarOffers, offerFor, stageCycle as offerStageCycle } from '../calendar/offers.ts';
import { operationalRequirements } from '../calendar/activities/operational-checklist.ts';
import {
  expandRequirements,
  type RequirementSection,
  type RequirementSpec,
  type Slot,
} from '../calendar/activities/requirement-table.ts';
import { termsFor } from '../calendar/organization/periods.ts';
import { frozenCriteria, parecerItems } from '../reviews/parecer-items.ts';
import type { Applicability, CalendarPolicy, RulesetChange } from './contract.ts';

const citation = 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026';
// Append a version for every catalogue change; `ruleset-history.test.ts` guards the catalogue.
const rulesetChanges: readonly RulesetChange[] = [
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
];
const rulesetVersion = rulesetChanges.at(-1)!.version;
const dayMinimums = { annual: 200, semester: 100 } as const;
const excludedModalities = ['posgraduacao'] as const;
const excluded = (modality: string) => excludedModalities.some((item) => item === modality);
const supported = (state: AssessmentSettings) =>
  calendarOffers(state).filter((offer) => !excluded(offer.kind));
const supportedKinds = (state: AssessmentSettings) => [
  ...new Set(supported(state).map((offer) => offer.kind)),
];
const termNumber = (term: AcademicTerm) => (term === 'annual' ? 0 : term === 'first' ? 1 : 2);
const stageCycle = ({ state, stages, offer }: Slot) =>
  state.offers && offer
    ? offerStageCycle(offer)
    : stages === 4
      ? 'bimestral'
      : stages === 3
        ? 'trimestral'
        : 'semestral';
const stageNumber = (slot: Slot, title = 'etapa') =>
  `${slot.state.offers ? slot.number : slot.n}ª ${title}${slot.state.offers && slot.term && slot.term !== 'annual' ? ` do ${termLabels[slot.term]}` : ''}`;
const perTerm = (title: string) => ({
  title,
  name: (s: Slot) => `${title} — ${termLabels[s.term!]}`,
});
const perSemester = (title: string) => ({
  title,
  name: (s: Slot) => `${title} — ${s.n}º semestre`,
});
const familyMeetingOffers: readonly string[] = ['integrado'];
const notOnIntegrated = {
  integrado: 'Não exigido por este inciso para o integrado; cadastro permitido.',
};
const optionalOnUndergraduate = { graduacao: '' };
const perCycle =
  'Frequência por ciclo de organização da oferta; o inciso não fixa dois semestres para cursos anuais.';

/**
 * Resolução 292 is scoped to technical and undergraduate offers. Every row requires all covered
 * offers unless it declares `modalities` or `optionalFor`; pending interpretation remains human.
 */
const sections: RequirementSection[] = [
  {
    repeat: 'stage',
    each: {
      modalities: (s) => [s.offer?.kind ?? s.modality!],
      reason: (s) =>
        excluded(s.offer?.kind ?? s.modality!)
          ? 'Pós-graduação depende de norma própria.'
          : undefined,
    },
    rows: [
      {
        id: 'stage',
        title: 'Etapa de avaliação — início e término',
        name: (s) =>
          `${stageNumber(s, 'etapa de avaliação')} — início e término — ${stageCycle(s)}`,
        basis: 'Art. 11, I',
        group: 'teaching',
        criterion: 'I',
        category: 'limite',
        variant: 'stage',
      },
      {
        id: 'results',
        title: 'Prazo de lançamento dos resultados (rendimento e frequência) de cada etapa',
        name: (s) =>
          `Prazo de lançamento dos resultados (rendimento e frequência) da ${stageNumber(s)} — ${stageCycle(s)}`,
        basis: 'Art. 11, IX',
        group: 'teaching',
        criterion: 'IX',
      },
      {
        id: 'council',
        title: 'Conselho de classe/coletivo pedagógico de cada etapa',
        name: (s) =>
          `Conselho de classe/coletivo pedagógico da ${stageNumber(s)} — ${stageCycle(s)}`,
        basis: 'Art. 11, XIII',
        group: 'teaching',
        criterion: 'XIII',
        category: 'conselho',
      },
      {
        id: 'pedagogical-meeting',
        title: 'Reunião pedagógica após os resultados parciais de cada etapa',
        name: (s) =>
          `Reunião pedagógica após os resultados parciais da ${stageNumber(s)} — ${stageCycle(s)}`,
        basis: 'Art. 11, XIII',
        group: 'teaching',
        criterion: 'XIII',
      },
    ],
  },
  {
    repeat: 'cycle',
    cycles: (state) =>
      (['annual', 'first', 'second'] as const)
        .map((term) => ({
          n: termNumber(term),
          term,
          offers: supported(state)
            .filter((offer) => termsFor(state, offer.id).includes(term))
            .map((offer) => offer.id),
        }))
        .filter((cycle) => cycle.offers.length),
    each: {
      modalities: (s) => [
        ...new Set(
          s.offers?.flatMap((id) => {
            const offer = offerFor(s.state, id);
            return offer ? [offer.kind] : [];
          }),
        ),
      ],
      term: (s) => s.term,
    },
    rows: [
      {
        id: 'final',
        ...perTerm('Prazo de lançamento do resultado final (rendimento e frequência)'),
        basis: 'Art. 11, X',
        group: 'teaching',
        criterion: 'X',
      },
      {
        id: 'diary',
        ...perTerm('Prazo de fechamento e entrega dos diários de classe'),
        basis: 'Art. 11, XI',
        group: 'teaching',
        criterion: 'XI',
      },
      {
        id: 'recognition',
        ...perTerm(
          'Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio',
        ),
        basis: 'Art. 11, VI',
        group: 'admission',
        criterion: 'VI',
      },
      {
        id: 'final-appeal',
        ...perTerm('Prazo para estudantes solicitarem revisão de resultados finais'),
        basis: 'Art. 11, XIV',
        group: 'admission',
        criterion: 'XIV',
      },
      {
        id: 'admission-notice',
        ...perTerm(
          'Publicação dos editais de transferência interna e externa, reingresso e portadores de diploma',
        ),
        basis: 'Art. 11, VIII',
        acceptsPriorReference: true,
        admissionType: 'transfer',
        group: 'admission',
        criterion: 'VIII',
      },
      {
        id: 'enrolment',
        ...perTerm('Rematrícula dos estudantes'),
        basis: 'Art. 11, V',
        reason: perCycle,
        optionalFor: notOnIntegrated,
        group: 'admission',
        criterion: 'V',
      },
      {
        id: 'adjustment',
        ...perTerm('Ajuste de matrículas dos veteranos'),
        basis: 'Art. 11, V',
        reason: perCycle,
        optionalFor: notOnIntegrated,
        group: 'admission',
        criterion: 'V',
      },
      {
        id: 'withdrawal',
        ...perTerm('Prazo de trancamento de curso e cancelamento de matrícula em componente'),
        basis: 'Art. 11, VII',
        reason: perCycle,
        optionalFor: notOnIntegrated,
        group: 'admission',
        criterion: 'VII',
      },
      {
        id: 'registration',
        ...perTerm('Período destinado à matrícula de ingressantes'),
        basis: 'Regra local de ingresso',
        reason: 'Defina ingresso e eventual exigência com fonte por oferta e período.',
        intake: true,
        group: 'admission',
      },
    ],
  },
  {
    repeat: 'semester',
    each: { basis: 'Art. 11, XII', term: (s) => s.term, criterion: 'XII' },
    rows: [
      { id: 'pit', ...perSemester('Prazo de entrega do PIT'), group: 'teaching' },
      { id: 'rit', ...perSemester('Prazo de entrega do RIT'), group: 'teaching' },
      {
        id: 'teaching-plan',
        ...perSemester('Prazo de entrega do Plano de Ensino'),
        group: 'teaching',
      },
    ],
  },
  {
    repeat: 'once',
    rows: [
      {
        id: 'extraordinary-council',
        name: 'Conselho de classe/coletivo pedagógico extraordinário para revisão dos resultados finais',
        basis: 'Art. 11, XV',
        group: 'campus',
        criterion: 'XV',
        category: 'conselho',
      },
      {
        id: 'family-meeting',
        name: 'Reunião com familiares, responsáveis e comunidade',
        basis: 'Art. 11, XVI',
        decision: 'exigida apenas no técnico integrado (consup-292-2027-v2)',
        modalities: ({ state }) =>
          supported(state)
            .filter((offer) => familyMeetingOffers.includes(offer.kind))
            .map((offer) => offer.kind),
        optionalFor: Object.fromEntries(
          modalityIds
            .filter((m) => !familyMeetingOffers.includes(m))
            .map((m) => [m, 'Exigida apenas para o integrado; cadastro permitido.']),
        ),
        group: 'campus',
        criterion: 'XVI',
      },
      {
        id: 'campus-events',
        name: 'Eventos de ensino, pesquisa, extensão e inovação do campus',
        basis: 'Art. 11, XVII',
        group: 'campus',
        criterion: 'XVII',
      },
      {
        id: 'alumni-meeting',
        name: 'Encontro dos egressos',
        basis: 'Art. 11, XVIII',
        group: 'campus',
        criterion: 'XVIII',
      },
      {
        id: 'internship-event',
        name: 'Evento sobre a temática de estágios',
        basis: 'Art. 11, XIX',
        group: 'campus',
        criterion: 'XIX',
      },
      {
        id: 'regular-admission-notice',
        name: 'Publicação dos editais do Processo Seletivo 2028',
        basis: 'Art. 10',
        deadline: '2027-06-15',
        deadlinePolicy: 'reference',
        acceptsPriorReference: true,
        admissionType: 'regular',
        group: 'admission',
        criterion: 'admission-regular',
      },
      {
        id: 'robotics',
        name: 'Fase local da Olimpíada Brasileira de Robótica — até 31/08/2027',
        basis: 'Art. 11, XX',
        deadline: '2027-08-31',
        group: 'campus',
        criterion: 'XX',
      },
      {
        id: 'course-showcase',
        name: 'Mostra de Cursos do campus — até 30/09/2027',
        basis: 'Art. 11, XXI',
        deadline: '2027-09-30',
        group: 'campus',
        criterion: 'XXI',
      },
      {
        id: 'pedagogical-training',
        name: 'Formação pedagógica — mínimo de 40 horas anuais',
        basis: 'Art. 11, XXII',
        minHours: 40,
        group: 'campus',
        criterion: 'XXII',
      },
      {
        id: 'collective-planning',
        name: 'Planejamento/replanejamento coletivo — mínimo de 20 horas anuais',
        basis: 'Art. 11, XXIII',
        minHours: 20,
        group: 'campus',
        criterion: 'XXIII',
      },
      {
        id: 'women-week',
        name: 'Semana de Valorização de Mulheres que Fizeram História — segunda semana de março',
        basis: 'Art. 11, XXIV',
        month: 3,
        reviewInstruction:
          'Confira a segunda semana de março; o critério operacional de semana depende de definição institucional.',
        optionalFor: optionalOnUndergraduate,
        group: 'campus',
        criterion: 'XXIV',
      },
      {
        id: 'ethics-week',
        name: 'Semana da Ética e da Cidadania — primeira semana de maio',
        basis: 'Art. 11, XXV',
        month: 5,
        reviewInstruction:
          'Confira a primeira semana de maio; o critério operacional de semana depende de definição institucional.',
        optionalFor: optionalOnUndergraduate,
        group: 'campus',
        criterion: 'XXV',
      },
      {
        id: 'cultural-week',
        name: 'Semana Cultural Interescolar — outubro',
        basis: 'Art. 11, XXVI',
        month: 10,
        optionalFor: optionalOnUndergraduate,
        group: 'campus',
        criterion: 'XXVI',
        category: 'evento',
      },
    ],
  },
];
const declared = new Map<string, RequirementSpec>(
  sections.flatMap((section) => section.rows.map((row) => [row.id, row] as const)),
);

function requirements(state: AssessmentSettings): ActivityRequirement[] {
  const rows = expandRequirements(sections, state).map(({ row }) => ({
    modalities: supportedKinds(state),
    ...row,
  }));
  // Keep every legacy ID resolvable. It is evidence awaiting classification, never silently rebound.
  const legacy = operationalRequirements(state, { criteria: { 'cultural-week': 'XXVI' } })
    .filter(({ row }) => !rows.some((r) => r.id === row.id))
    .map(({ row, slot, spec }) => ({
      ...row,
      required: false,
      applicability: 'optional' as const,
      reason: 'Vínculo legado conservado; confira o requisito e a organização aplicáveis em 2027.',
      basis: 'Classificação legada',
      modalities: calendarOffers(state).map((offer) => offer.kind),
      term: slot.term,
      ...(declared.get(spec.id)?.optionalFor && {
        optionalFor: declared.get(spec.id)!.optionalFor,
      }),
    }));
  return [...rows, ...legacy];
}
function applicability(
  _state: AssessmentSettings,
  requirement: ActivityRequirement,
  offer: CalendarOffer,
): Applicability {
  const kind = offer.kind;
  if (excluded(kind) || offer.scope?.status === 'own-regulation') return 'unconfigured';
  if (requirement.modalities && !requirement.modalities.includes(kind)) return 'optional';
  if (
    (requirement.offerId ?? requirement.modality) &&
    (requirement.offerId ?? requirement.modality) !== offer.id
  )
    return 'optional';
  if (requirement.offerIds && !requirement.offerIds.includes(offer.id)) return 'optional';
  if (requirement.optionalFor?.[kind] !== undefined) return 'optional';
  if (requirement.intake) {
    const config = offer.intake?.[requirement.term ?? 'annual'];
    if (!config || config.status === 'unknown') return 'optional';
    return config.status === 'yes' && config.required === true ? 'required' : 'optional';
  }
  return requirement.applicability ?? (requirement.required === false ? 'optional' : 'required');
}
const criteria = frozenCriteria([
  ...parecerItems.map((criterion) => ({
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
]);

/** Resolução CONSUP/IFPR nº 292/2026: structured requirements for technical and undergraduate offers. */
export const consup2922027Policy: CalendarPolicy = {
  year: 2027,
  configured: true,
  rulesetPrefix: 'consup-292-2027-',
  rulesetChanges,
  catalogue: sections,
  rulesetVersion: (state) =>
    calendarOffers(state).some((offer) => !excluded(offer.kind))
      ? rulesetVersion
      : 'unconfigured:2027',
  requirements,
  applicability,
  applicabilityNote: (requirement, offer) => requirement.optionalFor?.[offer.kind] || undefined,
  window: (state) =>
    calendarOffers(state).some(
      (offer) => !excluded(offer.kind) && offer.scope?.status !== 'own-regulation',
    )
      ? {
          start: '2027-02-01',
          latestStart: '2027-02-15',
          end: '2027-12-17',
          basis: 'Arts. 4º e 8º da Resolução CONSUP/IFPR nº 292/2026',
        }
      : null,
  countingMinimums: (_state, offer) => {
    const configured = !excluded(offer.kind) && offer.scope?.status === 'covered';
    return {
      annual: configured ? { days: dayMinimums.annual, basis: `Art. 4º da ${citation}` } : null,
      semester: configured
        ? { days: dayMinimums.semester, basis: `Art. 4º, § 1º, da ${citation}` }
        : null,
    };
  },
  excludes: (offer) => excluded(offer.kind),
  scope: {
    norm: 'Resolução 292',
    readinessIssue:
      'Confirme o escopo da Resolução 292: EaD, qualificação e pós-graduação exigem calendário e norma próprios; a oferta não identifica sozinha essa aplicabilidade.',
  },
  explicitRecordOffers: true,
  intakeRequirements: true,
  windowInReadiness: true,
  review: {
    source: {
      id: 'SEI 4422750',
      year: 2027,
      title: 'Resolução de diretrizes para o calendário acadêmico de 2027',
      norm: citation,
    },
    criteria,
    citation,
    evidence: 'coverage',
    dayMinimums,
  },
  notices: {
    regularAdmission:
      'Art. 10: publicação do processo seletivo de 2028 até 15/06/2027. O prazo não preenche a data de publicação. Cronograma ajustado pela Proens exige conferência institucional.',
  },
};
