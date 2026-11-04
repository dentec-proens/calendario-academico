import type { AssessmentSettings, ActivityPlanItem } from '../model.ts';
import { calendarOffers, offerLabel, organizationSummary, stageCycle } from '../offers.ts';
import {
  declareRules,
  expandRules,
  type ActivityRule,
  type CycleSlot,
  type Slot,
} from './rules.ts';

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

/**
 * Undated PROENS operational checklist, the explicit catalogue of years without a configured
 * policy (`unconfiguredPolicy`). It links no review criterion and asserts no compliance. A policy
 * year never falls back to it: a link the policy does not generate stays under “Vínculo a
 * conferir”. Its IDs stay declared (`declaredActivityRules`), so links
 * of years without a policy remain valid.
 */
export function operationalRules(): ActivityRule[] {
  return [
    ...declareRules({ repeat: 'stage' }, [
      {
        id: 'stage',
        name: (s) => `${stageNumber(s)}ª etapa de avaliação — início e término${stageSuffix(s)}`,
        group: 'teaching',
        category: 'limite',
        variant: 'stage',
      },
      {
        id: 'results',
        name: (s) =>
          `Prazo de lançamento dos resultados (rendimento e frequência) da ${stageNumber(s)}ª etapa${stageSuffix(s)}`,
        group: 'teaching',
      },
      {
        id: 'council',
        name: (s) =>
          `Conselho de classe/coletivo pedagógico da ${stageNumber(s)}ª etapa${optionalCouncil(s) ? optionalLabel : ''}${stageSuffix(s)}`,
        required: (s) => (optionalCouncil(s) ? false : undefined),
        group: 'teaching',
        category: 'conselho',
      },
      {
        id: 'pedagogical-meeting',
        name: (s) =>
          `Reunião pedagógica após os resultados parciais da ${stageNumber(s)}ª etapa${stageSuffix(s)}`,
        group: 'teaching',
      },
    ]),
    ...declareRules({ repeat: 'cycle', cycles: cyclesByRegime }, [
      {
        id: 'final',
        name: (s) =>
          `Prazo de lançamento do resultado final (rendimento e frequência) do ${termLabel(s)}`,
        group: 'teaching',
      },
      {
        id: 'diary',
        name: (s) => `Prazo de fechamento e entrega dos diários de classe do ${termLabel(s)}`,
        group: 'teaching',
      },
      {
        id: 'teaching-plan',
        name: (s) => `Prazo de entrega do Plano de Ensino do ${termLabel(s)}`,
        group: 'teaching',
      },
      {
        id: 'recognition',
        name: (s) =>
          `Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio — ${termLabel(s)}`,
        group: 'admission',
      },
      {
        id: 'registration',
        name: (s) => `Período destinado à matrícula — ${termLabel(s)}`,
        intake: true,
        group: 'admission',
      },
      {
        id: 'admission-notice',
        name: (s) =>
          `Publicação dos editais de transferência interna e externa, reingresso e portadores de diploma — antes do início do ${termLabel(s)}`,
        required: false,
        reason: 'Edital opcional por decisão institucional; cadastro permitido.',
        group: 'admission',
        variant: 'admission-notice',
      },
      {
        id: 'final-appeal',
        name: (s) =>
          `Prazo para estudantes solicitarem revisão de resultados finais — ${termLabel(s)}`,
        group: 'admission',
      },
    ]),
    ...declareRules({ repeat: 'semester' }, [
      {
        id: 'pit',
        name: (s) => `Prazo de entrega do PIT — ${s.n}º semestre`,
        group: 'teaching',
      },
      {
        id: 'enrolment',
        name: (s) => `Rematrícula dos estudantes — ${s.n}º semestre`,
        group: 'admission',
      },
      {
        id: 'adjustment',
        name: (s) => `Ajuste de matrículas dos veteranos — ${s.n}º semestre`,
        group: 'admission',
      },
      {
        id: 'withdrawal',
        name: (s) => `Prazo de trancamento de curso — ${s.n}º semestre`,
        group: 'admission',
      },
      {
        id: 'component-cancellation',
        name: (s) => `Prazo de cancelamento de matrícula em componente — ${s.n}º semestre`,
        group: 'admission',
      },
    ]),
    ...declareRules({ repeat: 'once' }, [
      {
        id: 'extraordinary-council',
        name: (s) =>
          'Conselho de classe/coletivo pedagógico extraordinário para revisão dos resultados finais' +
          (optionalMeeting(s) ? optionalLabel : ''),
        required: (s) => (optionalMeeting(s) ? false : undefined),
        group: 'campus',
        category: 'conselho',
      },
      {
        id: 'family-meeting',
        name: (s) =>
          'Reunião com familiares, responsáveis e comunidade' +
          (optionalMeeting(s) ? optionalLabel : ''),
        required: (s) => (optionalMeeting(s) ? false : undefined),
        group: 'campus',
      },
      {
        id: 'campus-events',
        name: 'Eventos de ensino, pesquisa, extensão e inovação do campus',
        group: 'campus',
      },
      {
        id: 'alumni-meeting',
        name: 'Encontro dos egressos',
        group: 'campus',
      },
      {
        id: 'internship-event',
        name: 'Evento sobre a temática de estágios',
        group: 'campus',
      },
      {
        id: 'robotics',
        name: 'Fase local da Olimpíada Brasileira de Robótica',
        group: 'campus',
      },
      {
        id: 'course-showcase',
        name: 'Mostra de Cursos do campus',
        group: 'campus',
      },
      {
        id: 'pedagogical-training',
        name: 'Formação pedagógica — mínimo de 40 horas anuais',
        minHours: 40,
        group: 'campus',
      },
      {
        id: 'collective-planning',
        name: 'Planejamento/replanejamento coletivo — mínimo de 20 horas anuais',
        minHours: 20,
        group: 'campus',
      },
      {
        id: 'women-week',
        name: 'Semana de Valorização de Mulheres que Fizeram História — março',
        month: 3,
        group: 'campus',
      },
      {
        id: 'cultural-week',
        name: 'Semana Cultural Interescolar — outubro, aberta a estudantes, famílias e comunidade',
        month: 10,
        group: 'campus',
        category: 'evento',
      },
    ]),
  ];
}

export const operationalChecklist = (state: AssessmentSettings): ActivityPlanItem[] =>
  expandRules(operationalRules(), state).map(({ row }) => row);
