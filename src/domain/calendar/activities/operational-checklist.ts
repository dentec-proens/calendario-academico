import type { AssessmentSettings, ActivityRequirement } from '../model.ts';
import {
  calendarOffers,
  offerLabel,
  organizationSummary,
  secondSemesterIntake,
  stageCycle,
} from '../offers.ts';
import {
  expandRequirements,
  type CycleSlot,
  type ExpandedRequirement,
  type RequirementSection,
  type RequirementSpec,
  type Slot,
} from './requirement-table.ts';

/** Year-specific details a policy may add to the undated operational checklist. */
export interface OperationalChecklistOptions {
  /** The 2026 operational decision can differ from the offer-level intake configuration. */
  usesLegacySecondSemesterIntake?: boolean;
  /** Civil deadlines by activity ID; the label shows them in dd/mm/yyyy. */
  deadlines?: Readonly<Record<string, string>>;
  /** Review criteria are linked only when given; entries renumber criteria by activity ID. */
  criteria?: Readonly<Record<string, string>>;
}

const civilDate = (date: string) => date.split('-').reverse().join('/');
const optionalLabel = ' (opcional para esta oferta)';
const nonIntegrated = ['graduacao', 'subsequente', 'posgraduacao'];
const stageSuffix = ({ offer, term }: Slot) =>
  ` — ${offerLabel(offer!)}${term && term !== 'annual' ? ` — ${term === 'first' ? '1º' : '2º'} semestre` : ''} (${stageCycle(offer!)})`;
const stageNumber = (slot: Slot) => slot.number;
const termLabel = ({ n }: Slot) => (n ? `${n}º semestre` : 'ano letivo');
/** Councils of an offer outside integrated secondary education. */
const optionalCouncil = (slot: Slot) => nonIntegrated.includes(slot.offer!.kind);
/** School meetings of a calendar without integrated secondary education. */
const optionalMeeting = ({ state }: Slot) =>
  calendarOffers(state).every((offer) => nonIntegrated.includes(offer.kind));
const cyclesByRegime = (state: AssessmentSettings): CycleSlot[] => {
  const regime = organizationSummary(state.offers);
  return (regime === 'misto' ? [0, 1, 2] : regime === 'semestral' ? [1, 2] : [0]).map((n) => ({
    n,
    term: n === 0 ? 'annual' : n === 1 ? 'first' : 'second',
  }));
};

// Undated PROENS operational checklist, shared by the 2026 policy, unconfigured years and the
// legacy IDs kept by later policies. Historical dates come only from the selected policy.
function sections(options: OperationalChecklistOptions): RequirementSection[] {
  const withoutSecondIntake = ({ n, state }: Slot) => {
    const intake =
      (options.usesLegacySecondSemesterIntake ? state.legacySecondSemesterIntake : undefined) ??
      secondSemesterIntake(state.offers);
    return n === 2 && intake === false;
  };
  const linked = (rows: RequirementSpec[]) =>
    rows.map((row) => ({
      ...row,
      criterion: options.criteria ? (options.criteria[row.id] ?? row.criterion) : undefined,
    }));
  const dated = (id: string, name: string) => ({
    name: name + (options.deadlines?.[id] ? ` — até ${civilDate(options.deadlines[id])}` : ''),
    deadline: options.deadlines?.[id],
  });
  const table: RequirementSection[] = [
    {
      repeat: 'stage',
      rows: [
        {
          id: 'stage',
          name: (s) => `${stageNumber(s)}ª etapa de avaliação — início e término${stageSuffix(s)}`,
          group: 'teaching',
          criterion: 'I',
          category: 'limite',
          variant: 'stage',
        },
        {
          id: 'results',
          name: (s) =>
            `Prazo de lançamento dos resultados (rendimento e frequência) da ${stageNumber(s)}ª etapa${stageSuffix(s)}`,
          group: 'teaching',
          criterion: 'IX',
        },
        {
          id: 'council',
          name: (s) =>
            `Conselho de classe/coletivo pedagógico da ${stageNumber(s)}ª etapa${optionalCouncil(s) ? optionalLabel : ''}${stageSuffix(s)}`,
          required: (s) => (optionalCouncil(s) ? false : undefined),
          group: 'teaching',
          criterion: 'XIII',
          category: 'conselho',
        },
        {
          id: 'pedagogical-meeting',
          name: (s) =>
            `Reunião pedagógica após os resultados parciais da ${stageNumber(s)}ª etapa${stageSuffix(s)}`,
          group: 'teaching',
          criterion: 'XIII',
        },
      ],
    },
    {
      repeat: 'cycle',
      cycles: cyclesByRegime,
      rows: [
        {
          id: 'final',
          name: (s) =>
            `Prazo de lançamento do resultado final (rendimento e frequência) do ${termLabel(s)}`,
          group: 'teaching',
          criterion: 'X',
        },
        {
          id: 'diary',
          name: (s) => `Prazo de fechamento e entrega dos diários de classe do ${termLabel(s)}`,
          group: 'teaching',
          criterion: 'XI',
        },
        {
          id: 'teaching-plan',
          name: (s) => `Prazo de entrega do Plano de Ensino do ${termLabel(s)}`,
          group: 'teaching',
          criterion: 'XII',
        },
        {
          id: 'recognition',
          name: (s) =>
            `Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio — ${termLabel(s)}`,
          group: 'admission',
          criterion: 'VI',
        },
        {
          id: 'registration',
          name: (s) =>
            `Período destinado à matrícula — ${termLabel(s)}` +
            (withoutSecondIntake(s) ? ' (não exigido: sem ingresso neste semestre)' : ''),
          required: (s) => (withoutSecondIntake(s) ? false : undefined),
          intake: true,
          group: 'admission',
        },
        {
          id: 'admission-notice',
          name: (s) =>
            `Publicação dos editais de transferência interna e externa, reingresso e portadores de diploma — antes do início do ${termLabel(s)}`,
          group: 'admission',
          criterion: 'VIII',
          variant: 'admission-notice',
        },
        {
          id: 'final-appeal',
          name: (s) =>
            `Prazo para estudantes solicitarem revisão de resultados finais — ${termLabel(s)}`,
          group: 'admission',
          criterion: 'XIV',
        },
      ],
    },
    {
      repeat: 'semester',
      rows: [
        {
          id: 'pit',
          name: (s) => `Prazo de entrega do PIT — ${s.n}º semestre`,
          group: 'teaching',
          criterion: 'XII',
        },
        {
          id: 'enrolment',
          name: (s) => `Rematrícula dos estudantes — ${s.n}º semestre`,
          group: 'admission',
          criterion: 'V',
        },
        {
          id: 'adjustment',
          name: (s) => `Ajuste de matrículas dos veteranos — ${s.n}º semestre`,
          group: 'admission',
          criterion: 'V',
        },
        {
          id: 'withdrawal',
          name: (s) =>
            `Prazo de trancamento de curso e cancelamento de matrícula em componente — ${s.n}º semestre`,
          group: 'admission',
          criterion: 'VII',
        },
      ],
    },
    {
      repeat: 'once',
      rows: [
        {
          id: 'extraordinary-council',
          name: (s) =>
            'Conselho de classe/coletivo pedagógico extraordinário para revisão dos resultados finais' +
            (optionalMeeting(s) ? optionalLabel : ''),
          required: (s) => (optionalMeeting(s) ? false : undefined),
          group: 'campus',
          criterion: 'XV',
          category: 'conselho',
        },
        {
          id: 'family-meeting',
          name: (s) =>
            'Reunião com familiares, responsáveis e comunidade' +
            (optionalMeeting(s) ? optionalLabel : ''),
          required: (s) => (optionalMeeting(s) ? false : undefined),
          group: 'campus',
          criterion: 'XVI',
        },
        {
          id: 'campus-events',
          name: 'Eventos de ensino, pesquisa, extensão e inovação do campus',
          group: 'campus',
          criterion: 'XVII',
        },
        {
          id: 'alumni-meeting',
          name: 'Encontro dos egressos',
          group: 'campus',
          criterion: 'XVIII',
        },
        {
          id: 'internship-event',
          name: 'Evento sobre a temática de estágios',
          group: 'campus',
          criterion: 'XIX',
        },
        {
          id: 'robotics',
          ...dated('robotics', 'Fase local da Olimpíada Brasileira de Robótica'),
          group: 'campus',
          criterion: 'XX',
        },
        {
          id: 'course-showcase',
          ...dated('course-showcase', 'Mostra de Cursos do campus'),
          group: 'campus',
          criterion: 'XXI',
        },
        {
          id: 'pedagogical-training',
          name: 'Formação pedagógica — mínimo de 40 horas anuais',
          minHours: 40,
          group: 'campus',
          criterion: 'XXII',
        },
        {
          id: 'collective-planning',
          name: 'Planejamento/replanejamento coletivo — mínimo de 20 horas anuais',
          minHours: 20,
          group: 'campus',
          criterion: 'XXIII',
        },
        {
          id: 'women-week',
          name: 'Semana de Valorização de Mulheres que Fizeram História — março',
          month: 3,
          group: 'campus',
          criterion: 'XXIV',
        },
        {
          id: 'cultural-week',
          name: 'Semana Cultural Interescolar — outubro, aberta a estudantes, famílias e comunidade',
          month: 10,
          group: 'campus',
          category: 'evento',
        },
      ],
    },
  ];
  return table.map((section) => ({ ...section, rows: linked([...section.rows]) }));
}

/** Operational rows with their slot and declaration, for policies that keep legacy IDs. */
export function operationalRequirements(
  state: AssessmentSettings,
  options: OperationalChecklistOptions = {},
): ExpandedRequirement[] {
  return expandRequirements(sections(options), state);
}

export const operationalChecklist = (
  state: AssessmentSettings,
  options: OperationalChecklistOptions = {},
): ActivityRequirement[] => operationalRequirements(state, options).map(({ row }) => row);
