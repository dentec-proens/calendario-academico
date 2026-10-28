import { assessmentStageCounts } from '../config.ts';
import type { AssessmentSettings, ActivityRequirement } from '../model.ts';
import { calendarModalities, modalityLabels } from '../modalities.ts';
import { activityReviewCriterion } from '../activities/review-links.ts';
import { withActivityMetadata } from '../activities/metadata.ts';
import { assessmentCount } from '../activities/assessment.ts';
// Undated PROENS operational checklist.
// Historical dates are deliberately excluded. Applicability is reviewed separately.
export function legacyActivityChecklist(state: AssessmentSettings): ActivityRequirement[] {
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
  add(
    'robotics',
    'Fase local da Olimpíada Brasileira de Robótica' +
      (Number(state.year) === 2026 ? ' — até 31/08/2026' : ''),
    Number(state.year) === 2026 ? { deadline: '2026-08-31' } : {},
  );
  add(
    'course-showcase',
    'Mostra de Cursos do campus' + (Number(state.year) === 2026 ? ' — até 30/09/2026' : ''),
    Number(state.year) === 2026 ? { deadline: '2026-09-30' } : {},
  );
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
      reviewCriterionId: activityReviewCriterion(state.year, row.id),
    }),
  );
}

export const legacyDayMinimums = { year: 2026, annual: 200, semester: 100 } as const;

export const calendarWindow2026 = {
  start: '2026-02-04',
  latestStart: '2026-02-28',
  end: '2026-12-18',
  basis: 'Referência do parecer de 2026',
};
