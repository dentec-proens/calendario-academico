import { assessmentStageCounts } from '../config.ts';
import type { AssessmentSettings, ActivityRequirement } from '../model.ts';
import { calendarModalities, modalityLabels } from '../modalities.ts';
import { withActivityMetadata } from './metadata.ts';
import { assessmentCount } from './assessment.ts';

/** Year-specific details a policy may add to the undated operational checklist. */
export interface OperationalChecklistOptions {
  /** Civil deadlines by activity ID; the label shows them in dd/mm/yyyy. */
  deadlines?: Readonly<Record<string, string>>;
  reviewCriterion?: (activityId: string) => string | undefined;
}

const civilDate = (date: string) => date.split('-').reverse().join('/');

// Undated PROENS operational checklist, shared by the 2026 policy, unconfigured years and the
// legacy IDs kept by later policies. Historical dates come only from the selected policy.
export function operationalChecklist(
  state: AssessmentSettings,
  options: OperationalChecklistOptions = {},
): ActivityRequirement[] {
  const rows: ActivityRequirement[] = [];
  const optionalSchoolMeetings = calendarModalities(state).every((m) =>
    ['graduacao', 'subsequente', 'posgraduacao'].includes(m),
  );
  const add = (id: string, name: string, extra: Partial<ActivityRequirement> = {}) => {
    const optional =
      optionalSchoolMeetings &&
      (id === 'family-meeting' || id === 'extraordinary-council' || /^council-[1-4]$/.test(id));
    rows.push({
      id,
      name: name + (optional ? ' (opcional para esta oferta)' : ''),
      ...extra,
      ...(optional ? { required: false } : {}),
    });
  };
  const dated = (id: string, name: string) => {
    const deadline = options.deadlines?.[id];
    add(id, name + (deadline ? ` — até ${civilDate(deadline)}` : ''), deadline ? { deadline } : {});
  };
  for (const modality of calendarModalities(state)) {
    const stages = assessmentCount(state, modality);
    if (!assessmentStageCounts.includes(stages)) continue;
    const cycle = stages === 4 ? 'bimestral' : stages === 3 ? 'trimestral' : 'semestral';
    const suffix = ` — ${modalityLabels[modality]} (${cycle})`;
    for (let n = 1; n <= stages; n++) {
      const optional = ['graduacao', 'subsequente', 'posgraduacao'].includes(modality);
      rows.push(
        {
          id: `stage-${n}:${modality}`,
          name: `${n}ª etapa de avaliação — início e término${suffix}`,
          modality,
        },
        {
          id: `results-${n}:${modality}`,
          name: `Prazo de lançamento dos resultados (rendimento e frequência) da ${n}ª etapa${suffix}`,
          modality,
        },
        {
          id: `council-${n}:${modality}`,
          name: `Conselho de classe/coletivo pedagógico da ${n}ª etapa${optional ? ' (opcional para esta oferta)' : ''}${suffix}`,
          modality,
          ...(optional ? { required: false } : {}),
        },
        {
          id: `pedagogical-meeting-${n}:${modality}`,
          name: `Reunião pedagógica após os resultados parciais da ${n}ª etapa${suffix}`,
          modality,
        },
      );
    }
  }
  const terms = state.regime === 'misto' ? [0, 1, 2] : state.regime === 'semestral' ? [1, 2] : [0];
  for (const n of terms) {
    const label = n ? `${n}º semestre` : 'ano letivo';
    add(
      `final-${n}`,
      `Prazo de lançamento do resultado final (rendimento e frequência) do ${label}`,
    );
    add(`diary-${n}`, `Prazo de fechamento e entrega dos diários de classe do ${label}`);
    add(`teaching-plan-${n}`, `Prazo de entrega do Plano de Ensino do ${label}`);
    add(
      `recognition-${n}`,
      `Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio — ${label}`,
    );
    add(
      `registration-${n}`,
      `Período destinado à matrícula — ${label}` +
        (n === 2 && state.secondSemesterIntake === false
          ? ' (não exigido: sem ingresso neste semestre)'
          : ''),
      n === 2 && state.secondSemesterIntake === false ? { required: false } : {},
    );
    add(
      `admission-notice-${n}`,
      `Publicação dos editais de transferência interna e externa, reingresso e portadores de diploma — antes do início do ${label}`,
    );
    add(
      `final-appeal-${n}`,
      `Prazo para estudantes solicitarem revisão de resultados finais — ${label}`,
    );
  }
  for (const n of [1, 2]) {
    add(`pit-${n}`, `Prazo de entrega do PIT — ${n}º semestre`);
    add(`enrolment-${n}`, `Rematrícula dos estudantes — ${n}º semestre`);
    add(`adjustment-${n}`, `Ajuste de matrículas dos veteranos — ${n}º semestre`);
    add(
      `withdrawal-${n}`,
      `Prazo de trancamento de curso e cancelamento de matrícula em componente — ${n}º semestre`,
    );
  }
  add(
    'extraordinary-council',
    'Conselho de classe/coletivo pedagógico extraordinário para revisão dos resultados finais',
  );
  add('family-meeting', 'Reunião com familiares, responsáveis e comunidade');
  add('campus-events', 'Eventos de ensino, pesquisa, extensão e inovação do campus');
  add('alumni-meeting', 'Encontro dos egressos');
  add('internship-event', 'Evento sobre a temática de estágios');
  dated('robotics', 'Fase local da Olimpíada Brasileira de Robótica');
  dated('course-showcase', 'Mostra de Cursos do campus');
  add('pedagogical-training', 'Formação pedagógica — mínimo de 40 horas anuais', { minHours: 40 });
  add('collective-planning', 'Planejamento/replanejamento coletivo — mínimo de 20 horas anuais', {
    minHours: 20,
  });
  add('women-week', 'Semana de Valorização de Mulheres que Fizeram História — março', { month: 3 });
  add(
    'cultural-week',
    'Semana Cultural Interescolar — outubro, aberta a estudantes, famílias e comunidade',
    { month: 10 },
  );
  return rows.map((row) =>
    withActivityMetadata({
      ...row,
      reviewCriterionId: options.reviewCriterion?.(row.id),
    }),
  );
}
