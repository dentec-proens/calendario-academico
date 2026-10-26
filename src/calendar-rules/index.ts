import type {
  AcademicTerm,
  ActivityRequirement,
  ActivityState,
  AssessmentSettings,
  CalendarActivity,
  CalendarPeriod,
  Organization,
} from '../domain-types.ts';
import { parseDate } from '../calendar.ts';
import { calendarModalities, appliesTo } from '../modalities.ts';
import { legacyActivityChecklist } from '../obligations.ts';
import { activityReviewCriterion } from './review-links.ts';

export const rules2027 = 'consup-292-2027-v1';
export const termLabels: Record<AcademicTerm, string> = {
  annual: 'ano letivo',
  first: '1º semestre',
  second: '2º semestre',
};
export function rulesetVersion(state: AssessmentSettings): string {
  if (state.year === 2026) return 'legacy-2026-v1';
  return state.year === 2027 && calendarModalities(state).some((m) => m !== 'posgraduacao')
    ? rules2027
    : `unconfigured:${state.year ?? ''}`;
}
export function organizationForModality(state: AssessmentSettings, modality: string): Organization {
  if (state.organizationByModality)
    return state.organizationByModality[modality] ?? 'a-classificar';
  if (state.schemaVersion === 3) return 'a-classificar';
  return state.regime === 'anual' || state.regime === 'semestral' ? state.regime : 'a-classificar';
}
export function organizationSummary(
  map: Record<string, Organization>,
  modalities: string[],
): 'anual' | 'semestral' | 'misto' | 'a-classificar' {
  const values = modalities.map((m) => map[m]);
  if (values.some((value) => !value || value === 'a-classificar')) return 'a-classificar';
  return new Set(values).size === 1 ? (values[0] ?? 'a-classificar') : 'misto';
}
/** Never pass overlapping offers to the counting core. Unclassified periods have no coverage. */
export function periodsForModality<T extends CalendarPeriod>(
  state: AssessmentSettings & { periods: T[] },
  modality: string,
): T[] {
  if (!state.organizationByModality && state.schemaVersion !== 3) return state.periods;
  return state.periods.filter(
    (p) => p.association?.status === 'defined' && p.association.modalities.includes(modality),
  );
}
export function periodForTerm(
  state: AssessmentSettings & { periods: CalendarPeriod[] },
  modality: string,
  term: AcademicTerm,
) {
  return periodsForModality(state, modality).find(
    (p) => p.association?.status === 'defined' && p.association.term === term,
  );
}
export function samePeriodScope(a: CalendarPeriod, b: CalendarPeriod) {
  if (a.association?.status === 'a-classificar' || b.association?.status === 'a-classificar')
    return false;
  if (!a.association || !b.association) return true;
  return a.association.modalities.some(
    (m) => b.association?.status === 'defined' && b.association.modalities.includes(m),
  );
}
const termsFor = (state: AssessmentSettings, modality: string): AcademicTerm[] => {
  const organization = organizationForModality(state, modality);
  return organization === 'anual'
    ? ['annual']
    : organization === 'semestral'
      ? ['first', 'second']
      : [];
};
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
    for (let n = 1; n <= ([2, 3, 4].includes(stages) ? stages : 0); n++) {
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
  return rows;
}
export function applicabilityFor(
  state: AssessmentSettings,
  requirement: ActivityRequirement,
  modality: string,
): 'required' | 'optional' | 'unconfigured' {
  if (state.year !== 2026 && state.year !== 2027) return 'unconfigured';
  if (state.year !== 2027) return requirement.required === false ? 'optional' : 'required';
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
    if (!config || config.status === 'unknown') return 'unconfigured';
    return config.status === 'yes' && config.required === true && Boolean(config.source?.trim())
      ? 'required'
      : 'optional';
  }
  return requirement.applicability ?? (requirement.required === false ? 'optional' : 'required');
}
export function temporalPosition(
  state: Pick<ActivityState, 'year'>,
  event: Pick<CalendarActivity, 'start' | 'end'>,
) {
  const start = parseDate(event.start),
    end = parseDate(event.end);
  if (start > end) throw new Error('Intervalo invertido.');
  const first = `${state.year}-01-01`,
    last = `${state.year}-12-31`;
  if (event.end > last) return event.start > last ? 'future' : 'future-crossing';
  return event.start > last
    ? 'future'
    : event.start < first
      ? event.end < first
        ? 'prior'
        : 'crossing'
      : 'current';
}
/** Structural validation is shared by command/import/backend. It does not certify normative coverage. */
export function validateActivityRecord(
  state: AssessmentSettings & { year: number; periods?: CalendarPeriod[] },
  event: CalendarActivity,
) {
  const position = temporalPosition(state, event);
  if (!['include', 'exclude', 'note'].includes(event.kind)) throw new Error('Efeito inválido.');
  if (
    event.deadlineExtensionCause !== undefined &&
    (!['municipal-holiday', 'municipal-recess'].includes(event.deadlineExtensionCause) ||
      event.kind !== 'exclude' ||
      !event.evidence.trim() ||
      position !== 'current')
  )
    throw new Error(
      'A prorrogação municipal exige feriado ou recesso decorrente, exclusão no ano e fonte.',
    );
  if (event.recordType !== undefined && !['event', 'prior-reference'].includes(event.recordType))
    throw new Error('Natureza do registro inválida.');
  if (
    event.publicationStatus !== undefined &&
    !['planned', 'published'].includes(event.publicationStatus)
  )
    throw new Error('Situação de publicação inválida.');
  if (position === 'future' || position === 'future-crossing')
    throw new Error(
      'A ocorrência não pode ser inteiramente futura nem terminar depois do ano do calendário.',
    );
  if (event.recordType === 'prior-reference' && event.publicationStatus === 'planned')
    throw new Error(
      'Referência anterior exige ocorrência comprovada; uma previsão é atividade de planejamento.',
    );
  if (event.recordType === 'prior-reference' && !['prior', 'crossing'].includes(position))
    throw new Error('A referência anterior deve começar antes do ano do calendário.');
  const outOfYear = position !== 'current';
  if (outOfYear || event.recordType === 'prior-reference') {
    if (event.kind !== 'note')
      throw new Error('Referências e ocorrências fora do ano são informativas, sem efeito letivo.');
    if (
      event.hours !== undefined ||
      event.days !== undefined ||
      event.assessmentAutoStart ||
      /^teacher-vacation|^saturday/.test(event.id)
    )
      throw new Error('Referência anterior não comprova horas, férias, sábados ou etapas atuais.');
    const requirement = event.requirementId
      ? requirements2027(state).find((r) => r.id === event.requirementId)
      : undefined;
    if (event.requirementId && !(state.year === 2027 && requirement?.acceptsPriorReference))
      throw new Error('Esta atividade não aceita referência anterior ou datas fora do ano.');
  }
  if (event.admission) {
    const a = event.admission;
    if (
      !['regular', 'transfer'].includes(a.type) ||
      !['annual', 'first', 'second'].includes(a.term) ||
      !Number.isInteger(a.year) ||
      a.year < 1900 ||
      a.year > 9999
    )
      throw new Error('Finalidade de ingresso inválida.');
    if (event.kind !== 'note') throw new Error('Publicação de edital é um registro informativo.');
    if (!event.publicationStatus)
      throw new Error('Informe se a publicação é prevista ou realizada.');
    if (event.recordType === 'prior-reference' && event.publicationStatus !== 'published')
      throw new Error('Referência anterior exige publicação realizada com fonte.');
    if (a.periodId && (typeof a.periodId !== 'string' || a.periodId.length > 100))
      throw new Error('Período de ingresso inválido.');
    // Deleted periods remain visible as unresolved evidence instead of being reassigned.
  }
  if (event.kind === 'include' && state.periods) {
    const scope = event.modalities?.length ? event.modalities : calendarModalities(state);
    for (let time = parseDate(event.start); time <= parseDate(event.end); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      if (
        scope.some(
          (modality) =>
            !periodsForModality({ ...state, periods: state.periods ?? [] }, modality).some(
              (period) => period.start <= date && period.end >= date,
            ),
        )
      )
        throw new Error('Inclusões letivas devem estar dentro dos períodos cadastrados da oferta.');
    }
  }
  if (event.deadlineAdjustment) {
    parseDate(event.deadlineAdjustment.date);
    if (
      !event.admission ||
      event.admission.type !== 'regular' ||
      !event.deadlineAdjustment.evidence.trim() ||
      event.deadlineAdjustment.evidence.length > 240 ||
      typeof event.deadlineAdjustment.reviewed !== 'boolean'
    )
      throw new Error('Ajuste de prazo exige edital regular, fonte e conferência.');
  }
  if (
    event.publicationStatus &&
    !event.admission &&
    event.requirementId?.startsWith('admission-notice')
  )
    throw new Error('Identifique a finalidade de ingresso do edital.');
}
export function activityCoverage(
  state: AssessmentSettings & {
    year: number;
    periods: CalendarPeriod[];
    events: CalendarActivity[];
    weekdays?: number[];
    weekConfirmed?: boolean;
  },
  events: CalendarActivity[] = state.events,
  humanReview?: { current: boolean; reviewedCriterionIds: readonly string[] },
) {
  const requirements =
    state.year === 2027 ? requirements2027(state) : legacyActivityChecklist(state);
  return requirements.flatMap((requirement) =>
    calendarModalities(state)
      .filter((m) => !requirement.modality || requirement.modality === m)
      .map((modality) => {
        const applicability = applicabilityFor(state, requirement, modality);
        const linked = events.filter(
          (event) => event.requirementId === requirement.id && appliesTo(event, modality),
        );
        const issues: string[] = [],
          warnings: string[] = [];
        const valid = linked.filter((event) => {
          if (state.year === 2027 && !event.modalities?.includes(modality)) {
            issues.push('Confirme explicitamente as ofertas abrangidas pelo registro legado.');
            return false;
          }
          try {
            validateActivityRecord(state, event);
          } catch (error) {
            issues.push(error instanceof Error ? error.message : String(error));
            return false;
          }
          if (!event.evidence?.trim()) {
            issues.push('Informe a fonte do registro.');
            return false;
          }
          if (requirement.admissionType) {
            const admission = event.admission;
            if (
              !admission ||
              admission.type !== requirement.admissionType ||
              !event.publicationStatus
            ) {
              issues.push('Classificação de ingresso a conferir.');
              return false;
            }
            const expectedYear =
              requirement.admissionType === 'regular' ? state.year + 1 : state.year;
            if (
              admission.year !== expectedYear ||
              (requirement.term && admission.term !== requirement.term)
            ) {
              issues.push('Finalidade de ingresso incompatível com o requisito.');
              return false;
            }
            if (admission.type === 'transfer') {
              const period = admission.periodId
                ? periodsForModality(state, modality).find((p) => p.id === admission.periodId)
                : undefined;
              if (
                !period ||
                period.association?.status !== 'defined' ||
                period.association.term !== admission.term
              ) {
                issues.push('Vincule o período de ingresso correspondente à oferta.');
                return false;
              }
              if (event.end >= period.start) {
                issues.push('Publique antes do início do período letivo de destino.');
                return false;
              }
            }
          }
          const deadline = requirement.deadline
            ? requirement.deadlinePolicy === 'reference'
              ? prorogatedDeadline(state, requirement.deadline, events, modality)
              : {
                  date: requirement.deadline,
                  original: requirement.deadline,
                  source: 'norm' as const,
                  evidence: [] as string[],
                }
            : null;
          if (deadline?.source === 'municipal-extension')
            warnings.push(
              `Prazo de ${deadline.original} prorrogado para ${deadline.date ?? 'conferência do primeiro dia letivo subsequente'} por feriado municipal ou recesso decorrente. Fontes: ${deadline.evidence.join('; ')}.`,
            );
          if (deadline && (!deadline.date || event.end > deadline.date)) {
            const adjustment = event.deadlineAdjustment;
            if (!(
              requirement.admissionType === 'regular' &&
              adjustment?.evidence.trim() &&
              event.end <= adjustment.date
            )) {
              issues.push(
                `Data posterior ao prazo de ${requirement.deadline}; confira a fonte de eventual ajuste pela Proens.`,
              );
              return false;
            }
            warnings.push(
              'Prazo ajustado informado pelo campus; confira a autorização e o escopo na revisão.',
            );
          }
          if (
            requirement.month &&
            (Number(event.start.slice(5, 7)) !== requirement.month ||
              Number(event.end.slice(5, 7)) !== requirement.month)
          ) {
            issues.push('Confira o mês exigido.');
            return false;
          }
          return true;
        });
        if (requirement.minHours) {
          const hours = valid
            .filter((e) => temporalPosition(state, e) === 'current')
            .reduce((sum, e) => sum + (e.hours ?? 0), 0);
          if (hours < requirement.minHours)
            issues.push(`Registre pelo menos ${requirement.minHours} horas.`);
        }
        if (requirement.reviewInstruction && valid.length)
          warnings.push(requirement.reviewInstruction);
        if (applicability === 'unconfigured')
          warnings.push(
            requirement.id.startsWith('registration-')
              ? 'Defina a configuração de ingresso e sua fonte por oferta e período.'
              : 'Escopo depende de norma própria ou classificação.',
          );
        const complete = valid.length > 0 && issues.length === 0;
        return {
          requirement,
          modality,
          applicability,
          humanReview: !requirement.reviewCriterionId
            ? ('unmapped' as const)
            : humanReview?.current &&
                humanReview.reviewedCriterionIds.includes(requirement.reviewCriterionId)
              ? ('reviewed' as const)
              : ('pending' as const),
          coverage: complete
            ? ('complete' as const)
            : linked.length
              ? ('partial' as const)
              : ('pending' as const),
          events: linked,
          issues,
          warnings,
          execution:
            linked.length && linked.every((e) => e.publicationStatus === 'published')
              ? ('published' as const)
              : linked.some((e) => e.publicationStatus === 'planned')
                ? ('planned' as const)
                : ('unclassified' as const),
        };
      }),
  );
}

export function calendarWindow(state: AssessmentSettings) {
  if (
    state.year === 2027 &&
    state.scopeConfirmation?.status !== 'own-regulation' &&
    calendarModalities(state).some((m) => m !== 'posgraduacao')
  )
    return {
      start: '2027-02-01',
      latestStart: '2027-02-15',
      end: '2027-12-17',
      basis: 'Arts. 4º e 8º da Resolução CONSUP/IFPR nº 292/2026',
    };
  if (state.year === 2026)
    return {
      start: '2026-02-04',
      latestStart: '2026-02-28',
      end: '2026-12-18',
      basis: 'Referência do parecer de 2026',
    };
  return null;
}

/** Article 3 §2. A plain exclusion is not proof of a municipal holiday. */
export function prorogatedDeadline(
  state: AssessmentSettings & {
    year: number;
    periods: CalendarPeriod[];
    weekdays?: number[];
    weekConfirmed?: boolean;
  },
  original: string,
  events: CalendarActivity[],
  modality: string,
) {
  parseDate(original);
  const causes = events.filter(
    (event) =>
      event.deadlineExtensionCause &&
      event.kind === 'exclude' &&
      event.evidence.trim() &&
      appliesTo(event, modality) &&
      event.start <= original &&
      event.end >= original,
  );
  if (!causes.length)
    return { date: original, original, source: 'norm' as const, evidence: [] as string[] };
  const evidence = causes.map((e) => e.evidence);
  if (!state.weekConfirmed || !state.weekdays?.length)
    return { date: null, original, source: 'municipal-extension' as const, evidence };
  const periods = periodsForModality(state, modality),
    scoped = events.filter((e) => appliesTo(e, modality));
  for (
    let time = parseDate(original) + 86400000;
    time <= parseDate(`${state.year}-12-31`);
    time += 86400000
  ) {
    const date = new Date(time).toISOString().slice(0, 10),
      active = scoped.filter((e) => e.start <= date && e.end >= date);
    if (
      periods.some((p) => p.start <= date && p.end >= date) &&
      !active.some((e) => e.kind === 'exclude') &&
      (state.weekdays.includes(new Date(time).getUTCDay()) ||
        active.some((e) => e.kind === 'include'))
    )
      return { date, original, source: 'municipal-extension' as const, evidence };
  }
  return { date: null, original, source: 'municipal-extension' as const, evidence };
}
