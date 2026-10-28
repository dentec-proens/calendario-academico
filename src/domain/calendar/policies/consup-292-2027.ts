import { termLabels, assessmentStageCounts } from '../config.ts';
import type { AssessmentSettings, ActivityRequirement, AcademicTerm } from '../model.ts';
import { calendarModalities } from '../modalities.ts';
import { legacyActivityChecklist } from './legacy-2026.ts';
import { activityReviewCriterion } from '../activities/review-links.ts';
import { withActivityMetadata } from '../activities/metadata.ts';
import { termsFor } from '../organization/periods.ts';
const termNumber = (term: AcademicTerm) => (term === 'annual' ? 0 : term === 'first' ? 1 : 2);
const termFromId = (id: string): AcademicTerm | undefined =>
  /-[012]$/.test(id) ? (['annual', 'first', 'second'] as const)[Number(id.at(-1))] : undefined;

/** Resolução 292 is scoped to technical and undergraduate offers. Pending interpretation remains human. */
export function requirements2027(state: AssessmentSettings): ActivityRequirement[] {
  const modalities = calendarModalities(state);
  const supported = modalities.filter((m) => m !== 'posgraduacao');
  const legacy = legacyActivityChecklist(state);
  const rows: ActivityRequirement[] = [];
  const add = (
    id: string,
    name: string,
    basis: string,
    extra: Partial<ActivityRequirement> = {},
  ) => {
    rows.push({
      id,
      name,
      basis,
      reviewCriterionId: activityReviewCriterion(state.year, id),
      modalities: supported,
      required: true,
      applicability: 'required',
      ...extra,
    });
  };
  for (const modality of modalities) {
    const stages = Number(state.assessmentStagesByModality?.[modality]);
    for (let n = 1; n <= (assessmentStageCounts.includes(stages) ? stages : 0); n++) {
      for (const [prefix, label, basis] of [
        ['stage', `${n}ª etapa de avaliação — início e término`, 'Art. 11, I'],
        [
          'results',
          `Prazo de lançamento dos resultados (rendimento e frequência) da ${n}ª etapa`,
          'Art. 11, IX',
        ],
        ['council', `Conselho de classe/coletivo pedagógico da ${n}ª etapa`, 'Art. 11, XIII'],
        [
          'pedagogical-meeting',
          `Reunião pedagógica após os resultados parciais da ${n}ª etapa`,
          'Art. 11, XIII',
        ],
      ])
        add(
          `${prefix}-${n}:${modality}`,
          `${label} — ${stages === 4 ? 'bimestral' : stages === 3 ? 'trimestral' : 'semestral'}`,
          basis,
          {
            modality,
            modalities: [modality],
            ...(modality === 'posgraduacao'
              ? {
                  required: false,
                  applicability: 'unconfigured',
                  reason: 'Pós-graduação depende de norma própria.',
                }
              : {}),
          },
        );
    }
  }
  for (const term of ['annual', 'first', 'second'] as const) {
    const offers = supported.filter((m) => termsFor(state, m).includes(term));
    if (!offers.length) continue;
    const n = termNumber(term),
      suffix = ` — ${termLabels[term]}`;
    for (const [prefix, label, basis] of [
      ['final', 'Prazo de lançamento do resultado final (rendimento e frequência)', 'Art. 11, X'],
      ['diary', 'Prazo de fechamento e entrega dos diários de classe', 'Art. 11, XI'],
      [
        'recognition',
        'Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio',
        'Art. 11, VI',
      ],
      [
        'final-appeal',
        'Prazo para estudantes solicitarem revisão de resultados finais',
        'Art. 11, XIV',
      ],
      [
        'admission-notice',
        'Publicação dos editais de transferência interna e externa, reingresso e portadores de diploma',
        'Art. 11, VIII',
      ],
    ])
      add(`${prefix}-${n}`, label + suffix, basis, {
        modalities: offers,
        term,
        ...(prefix === 'admission-notice'
          ? { acceptsPriorReference: true, admissionType: 'transfer' as const }
          : {}),
      });
    for (const [prefix, label, basis] of [
      ['enrolment', 'Rematrícula dos estudantes', 'Art. 11, V'],
      ['adjustment', 'Ajuste de matrículas dos veteranos', 'Art. 11, V'],
      [
        'withdrawal',
        'Prazo de trancamento de curso e cancelamento de matrícula em componente',
        'Art. 11, VII',
      ],
    ]) {
      add(`${prefix}-${n}`, label + suffix, basis, {
        modalities: offers,
        term,
        reason:
          'Frequência por ciclo de organização da oferta; o inciso não fixa dois semestres para cursos anuais.',
      });
    }
    add(
      `registration-${n}`,
      'Período destinado à matrícula de ingressantes' + suffix,
      'Regra local de ingresso',
      {
        modalities: offers,
        term,
        required: false,
        applicability: 'unconfigured',
        reason: 'Defina ingresso e eventual exigência com fonte por oferta e período.',
      },
    );
  }
  for (const n of [1, 2])
    for (const [prefix, label] of [
      ['pit', 'Prazo de entrega do PIT'],
      ['rit', 'Prazo de entrega do RIT'],
      ['teaching-plan', 'Prazo de entrega do Plano de Ensino'],
    ])
      add(`${prefix}-${n}`, `${label} — ${n}º semestre`, 'Art. 11, XII', {
        term: n === 1 ? 'first' : 'second',
      });
  for (const [id, label, basis] of [
    [
      'extraordinary-council',
      'Conselho de classe/coletivo pedagógico extraordinário para revisão dos resultados finais',
      'Art. 11, XV',
    ],
    ['family-meeting', 'Reunião com familiares, responsáveis e comunidade', 'Art. 11, XVI'],
    [
      'campus-events',
      'Eventos de ensino, pesquisa, extensão e inovação do campus',
      'Art. 11, XVII',
    ],
    ['alumni-meeting', 'Encontro dos egressos', 'Art. 11, XVIII'],
    ['internship-event', 'Evento sobre a temática de estágios', 'Art. 11, XIX'],
  ])
    add(id, label, basis);
  add('regular-admission-notice', 'Publicação dos editais do Processo Seletivo 2028', 'Art. 10', {
    deadline: '2027-06-15',
    deadlinePolicy: 'reference',
    acceptsPriorReference: true,
    admissionType: 'regular',
  });
  add(
    'robotics',
    'Fase local da Olimpíada Brasileira de Robótica — até 31/08/2027',
    'Art. 11, XX',
    { deadline: '2027-08-31' },
  );
  add('course-showcase', 'Mostra de Cursos do campus — até 30/09/2027', 'Art. 11, XXI', {
    deadline: '2027-09-30',
  });
  add('pedagogical-training', 'Formação pedagógica — mínimo de 40 horas anuais', 'Art. 11, XXII', {
    minHours: 40,
  });
  add(
    'collective-planning',
    'Planejamento/replanejamento coletivo — mínimo de 20 horas anuais',
    'Art. 11, XXIII',
    { minHours: 20 },
  );
  add(
    'women-week',
    'Semana de Valorização de Mulheres que Fizeram História — segunda semana de março',
    'Art. 11, XXIV',
    {
      month: 3,
      reviewInstruction:
        'Confira a segunda semana de março; o critério operacional de semana depende de definição institucional.',
    },
  );
  add('ethics-week', 'Semana da Ética e da Cidadania — primeira semana de maio', 'Art. 11, XXV', {
    month: 5,
    reviewInstruction:
      'Confira a primeira semana de maio; o critério operacional de semana depende de definição institucional.',
  });
  add('cultural-week', 'Semana Cultural Interescolar — outubro', 'Art. 11, XXVI', { month: 10 });
  // Keep every legacy ID resolvable. It is evidence awaiting classification, never silently rebound.
  for (const old of legacy)
    if (!rows.some((r) => r.id === old.id))
      rows.push({
        ...old,
        required: false,
        applicability: 'optional',
        reason:
          'Vínculo legado conservado; confira o requisito e a organização aplicáveis em 2027.',
        basis: 'Classificação legada',
        modalities,
        term: termFromId(old.id),
      });
  return rows.map(withActivityMetadata);
}
export function applicability2027For(
  state: AssessmentSettings,
  requirement: ActivityRequirement,
  modality: string,
): 'required' | 'optional' | 'unconfigured' {
  if (modality === 'posgraduacao' || state.scopeConfirmation?.status === 'own-regulation')
    return 'unconfigured';
  if (requirement.modalities && !requirement.modalities.includes(modality)) return 'optional';
  if (requirement.modality && requirement.modality !== modality) return 'optional';
  if (/^(enrolment|adjustment|withdrawal)-/.test(requirement.id) && modality === 'integrado')
    return 'optional';
  if (
    ['women-week', 'ethics-week', 'cultural-week'].includes(requirement.id) &&
    modality === 'graduacao'
  )
    return 'optional';
  if (requirement.id.startsWith('registration-')) {
    const config = state.intakeByModality?.[modality]?.[requirement.term ?? 'annual'];
    if (!config || config.status === 'unknown') return 'optional';
    return config.status === 'yes' && config.required === true ? 'required' : 'optional';
  }
  return requirement.applicability ?? (requirement.required === false ? 'optional' : 'required');
}
/** Applicability (year, scope confirmation and offer) is checked by the rule functions. */
export const normativeDayMinimums = {
  year: 2027,
  annual: 200,
  semester: 100,
  excludedModalities: ['posgraduacao'],
} as const;
export const rules2027 = 'consup-292-2027-v1';

export const calendarWindow2027 = {
  start: '2027-02-01',
  latestStart: '2027-02-15',
  end: '2027-12-17',
  basis: 'Arts. 4º e 8º da Resolução CONSUP/IFPR nº 292/2026',
};
