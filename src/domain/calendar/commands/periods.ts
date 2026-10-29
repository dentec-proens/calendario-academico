import type {
  ActivityState,
  CalendarActivity,
  CalendarPeriod,
  PeriodAssociation,
} from '../model.ts';
import { samePeriodScope, organizationForOffer } from '../organization/periods.ts';
import { durationEnd } from '../counting/duration.ts';
import { activityChecklist } from '../activities/checklist.ts';
import { associationOffers, offerFor, offerIds } from '../offers.ts';
import { recalculateCalendar, validateInterval } from './recalculate.ts';
import { DomainError } from '../../errors.ts';

export function applyWeek<S extends ActivityState>(
  state: S,
  values: { weekdays: number[]; weekConfirmed: boolean },
  institutional: CalendarActivity[],
): S {
  if (
    !values.weekdays.length ||
    values.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 5)
  )
    throw new DomainError('Selecione pelo menos um dia regular.');
  if (!values.weekConfirmed) throw new DomainError('Confirme a organização da semana letiva.');
  return recalculateCalendar(
    {
      ...state,
      ...values,
      weekdays: [...new Set(values.weekdays)],
    },
    institutional,
  );
}

export function applyPeriod<S extends ActivityState>(
  state: S,
  values: {
    id?: string;
    name: string;
    start: string;
    end: string;
    days: string;
    association?: PeriodAssociation;
  },
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!values.name.trim()) throw new DomainError('Informe o nome do período.');
  if (values.id && !state.periods.some((period) => period.id === values.id))
    throw new DomainError('O período não existe mais. Reabra o calendário.');
  const associated =
    values.association?.status === 'defined' ? associationOffers(values.association) : undefined;
  if (
    associated &&
    (!associated.length ||
      new Set(associated).size !== associated.length ||
      associated.some((m) => !offerIds(state).includes(m)))
  )
    throw new DomainError('Associação do período incompatível com a organização por oferta.');
  if (values.association?.status === 'defined' && associated) {
    const organization = values.association.term === 'annual' ? 'anual' : 'semestral';
    if (associated.some((id) => offerFor(state, id)?.legacyStageCount !== undefined))
      throw new DomainError(
        'Configure a organização e todas as etapas da oferta antes de classificar o período.',
      );
    const conflicts = state.periods.filter(
      (period) =>
        period.id !== values.id &&
        period.association?.status === 'defined' &&
        associationOffers(period.association).some((m) => associated.includes(m)) &&
        (period.association.term === 'annual' ? 'anual' : 'semestral') !== organization,
    );
    if (conflicts.length)
      throw new DomainError(
        `O ciclo conflita com ${conflicts.map((p) => p.name || p.id).join(', ')}. Edite os períodos existentes antes de mudar o ciclo da oferta.`,
      );
    if (
      associated.some(
        (m) =>
          organizationForOffer(state, m) !== organization &&
          Object.entries(offerFor(state, m)?.intake ?? {}).some(
            ([term, entry]) => entry.required && (term === 'annual') !== (organization === 'anual'),
          ),
      )
    )
      throw new DomainError(
        'Revise a exigência local de matrícula nas atividades antes de alterar o ciclo da oferta.',
      );
    const previous = state.periods.find((p) => p.id === values.id);
    if (
      previous?.association?.status === 'defined' &&
      previous.association.term !== values.association.term &&
      state.events.some((event) => event.admission?.periodId === previous.id)
    )
      throw new DomainError(
        'Revise os editais vinculados a este período antes de alterar seu ciclo.',
      );
    if (
      associated.some((id) => {
        const stages = offerFor(state, id)?.stages;
        return (
          stages && !(organization === 'semestral' ? [1, 2] : [2, 3, 4]).includes(stages.perTerm)
        );
      })
    )
      throw new DomainError('Revise as etapas de avaliação antes de alterar o ciclo da oferta.');
    const candidate = {
      ...state,
      offers: state.offers.map((offer) =>
        associated.includes(offer.id) ? { ...offer, organization } : offer,
      ),
    };
    const requirements = new Map(activityChecklist(candidate).map((item) => [item.id, item]));
    const incompatible = state.events.filter((event) => {
      if (!event.requirementId) return false;
      const requirement = requirements.get(event.requirementId);
      if (!requirement) return true;
      const explicit = event.offers;
      return (explicit?.length ? explicit : offerIds(state)).some(
        (m) =>
          associated.includes(m) &&
          organizationForOffer(state, m) !== organization &&
          ((requirement.offerId && requirement.offerId !== m) ||
            (requirement.modalities && !requirement.modalities.includes(offerFor(state, m)!.kind))),
      );
    });
    if (incompatible.length)
      throw new DomainError(
        `Revise as atividades vinculadas antes de alterar o ciclo: ${incompatible.map((event) => event.name).join(', ')}.`,
      );
    state = candidate;
  }
  if (
    values.association?.status === 'defined' &&
    state.periods.some(
      (p) =>
        p.id !== values.id &&
        p.association?.status === 'defined' &&
        p.association.term ===
          (values.association?.status === 'defined' ? values.association.term : undefined) &&
        associationOffers(p.association).some((m) => associated?.includes(m)),
    )
  )
    throw new DomainError(
      'Já existe um período para este ciclo da oferta. Edite o período existente.',
    );
  if (values.days && !associated)
    throw new DomainError('Classifique a oferta e o ciclo do período antes de calcular o término.');
  const scopedState = associated
    ? { ...state, offers: state.offers.filter((offer) => associated.includes(offer.id)) }
    : state;
  const end = values.days
    ? durationEnd(values.start, values.days, scopedState, [...institutional, ...state.events])
    : values.end;
  validateInterval(state, values.start, end);
  if (
    state.periods.some(
      (period) =>
        period.id !== values.id &&
        samePeriodScope(period, {
          id: values.id ?? 'new',
          start: values.start,
          end,
          association: values.association ?? { status: 'a-classificar' },
        }) &&
        period.start <= end &&
        period.end >= values.start,
    )
  )
    throw new DomainError(
      'Este período se sobrepõe a outro. Para bimestres ou etapas de outra oferta, use Etapas de avaliação.',
    );
  const period: CalendarPeriod = {
    id: values.id || id(),
    name: values.name.trim(),
    association:
      values.association?.status === 'defined'
        ? { status: 'defined', offers: associated!, term: values.association.term }
        : { status: 'a-classificar' },
    start: values.start,
    end,
    ...(values.days ? { targetDays: Number(values.days) } : {}),
  };
  const periods = values.id
    ? state.periods.map((item) => (item.id === values.id ? period : item))
    : [...state.periods, period];
  return recalculateCalendar({ ...state, periods }, institutional);
}

export function removePeriod<S extends ActivityState>(
  state: S,
  id: string,
  institutional: CalendarActivity[],
): S {
  if (!state.periods.some((period) => period.id === id))
    throw new DomainError('O período não existe mais.');
  return recalculateCalendar(
    { ...state, periods: state.periods.filter((period) => period.id !== id) },
    institutional,
  );
}
