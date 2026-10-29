import type { AssessmentSettings } from '#src/domain/calendar/model.ts';
import { modalityLabels, selectableModalities } from '#src/domain/calendar/modalities.ts';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { expandRequirements } from '#src/domain/calendar/activities/requirement-table.ts';
import type { RulesetChange } from '#src/domain/policies/contract.ts';
import { policyFor } from '#src/domain/policies/registry.ts';

export type OfferStatus = 'required' | 'optional' | 'unconfigured' | 'intake' | 'absent';

export const offerStatusLabels: Record<OfferStatus, string> = {
  required: 'Obrigatória',
  optional: 'Opcional',
  unconfigured: 'Norma própria',
  intake: 'Conforme ingresso',
  absent: 'Não se aplica',
};
export const effectLabels: Record<RulesetChange['effect'], string> = {
  establishes: 'Estabelece as regras',
  tightens: 'Amplia exigência',
  relaxes: 'Dispensa exigência',
  editorial: 'Redação',
};
const repeatLabels = {
  stage: {
    title: 'Por etapa de avaliação',
    help: 'Repetidas em cada etapa de cada oferta. Os rótulos mostram a 1ª etapa.',
  },
  cycle: {
    title: 'Por ciclo letivo',
    help: 'Repetidas em cada ciclo organizado das ofertas. Os rótulos mostram o ano letivo.',
  },
  semester: {
    title: 'Por semestre',
    help: 'Repetidas no 1º e no 2º semestre. Os rótulos mostram o 1º semestre.',
  },
  once: { title: 'Uma vez por calendário', help: 'Registradas uma vez no ano letivo.' },
};
const civilDate = (date: string) => date.split('-').reverse().join('/');

/**
 * Applicability is shown as on a calendar with every offer organised annually in two assessment
 * stages and the norm's scope confirmed. A campus calendar can differ with its organisation.
 */
export const referenceAssumption =
  'A aplicação por oferta considera um calendário com todas as ofertas organizadas por ano letivo, duas etapas de avaliação e escopo da norma confirmado. A organização de cada calendário pode mudar os ciclos e as etapas exigidos.';

/** Everything the rules page shows for one year, read from the policy that the editor uses. */
export function rulesView(year: number) {
  const policy = policyFor(year);
  const offers = [...selectableModalities];
  const state: AssessmentSettings = {
    year,
    modalities: offers,
    regime: 'anual',
    organizationByModality: Object.fromEntries(offers.map((m) => [m, 'anual' as const])),
    assessmentStagesByModality: Object.fromEntries(offers.map((m) => [m, 2])),
    scopeConfirmation: { status: 'covered' },
  };
  const rows = new Map(activityChecklist(state).map((row) => [row.id, row]));
  return {
    year,
    norm: policy.review.citation ?? policy.review.source.title,
    version: policy.rulesetVersion(state),
    window: policy.window(state),
    excluded: policy.excludedModalities.map((m) => modalityLabels[m]),
    offers: offers.map((id) => ({ id, label: modalityLabels[id] })),
    minimums: offers.map((m) => ({
      offer: modalityLabels[m],
      ...policy.countingMinimums(state, m),
    })),
    changes: (policy.rulesetChanges ?? []).map((change) => ({
      ...change,
      date: civilDate(change.date),
      effect: effectLabels[change.effect],
    })),
    sections: (policy.catalogue ?? []).map((section) => {
      const expanded = expandRequirements([section], state);
      return {
        ...repeatLabels[section.repeat],
        activities: section.rows.map((spec) => {
          // The checklist rows, not the bare expansion, carry the policy's own defaults.
          const own = expanded
            .filter((item) => item.spec.id === spec.id)
            .map((item) => rows.get(item.row.id)!);
          const rowFor = (m: string) => own.find((row) => !row.modality || row.modality === m);
          const sample = own[0];
          const byOffer = offers.map((m) => {
            const row = rowFor(m);
            if (!row) return { offer: m, status: 'absent' as OfferStatus };
            const applicability = policy.applicability(state, row, m);
            const status: OfferStatus =
              row.intake && policy.intakeRequirements && applicability !== 'unconfigured'
                ? 'intake'
                : applicability;
            return { offer: m, status, note: policy.applicabilityNote?.(row, m) };
          });
          return {
            id: spec.id,
            name: sample.name,
            basis: sample.basis,
            criterion: sample.reviewCriterionId,
            decision: sample.decision,
            byOffer,
            details: [
              sample.deadline &&
                `Prazo${sample.deadlinePolicy === 'reference' ? ' de referência' : ''}: ${civilDate(sample.deadline)}.`,
              sample.month && `Mês exigido: ${sample.month}.`,
              sample.minHours && `Mínimo de ${sample.minHours} horas.`,
              sample.reason,
              sample.reviewInstruction,
            ].filter((item): item is string => Boolean(item)),
          };
        }),
      };
    }),
    criteria: policy.review.criteria.map(({ id, item, title }) => ({ id, item, title })),
  };
}

export type RulesView = ReturnType<typeof rulesView>;
