import type { AssessmentSettings, CalendarOffer } from '#src/domain/calendar/model.ts';
import { selectableModalities } from '#src/domain/calendar/modalities.ts';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import { expandRequirements } from '#src/domain/calendar/activities/requirement-table.ts';
import type { RulesetChange } from '#src/domain/policies/contract.ts';
import { policyFor } from '#src/domain/policies/registry.ts';
import { offerLabel } from '#src/domain/calendar/offers.ts';

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
  relaxes: 'Flexibiliza as regras',
  editorial: 'Redação',
};
const repeatLabels = {
  stage: {
    title: 'Por etapa de avaliação',
    help: 'Nas ofertas anuais: 2, 3 ou 4 etapas no ano letivo. Nas semestrais: 1 ou 2 etapas por semestre, numeradas novamente em cada ciclo.',
  },
  cycle: {
    title: 'Por ciclo letivo',
    help: 'No ano letivo, nas ofertas anuais, ou no 1º e no 2º semestre, nas semestrais.',
  },
  semester: {
    title: 'Por semestre',
    help: 'No 1º e no 2º semestre, inclusive nas ofertas anuais.',
  },
  once: { title: 'Uma vez por ano letivo', help: '' },
};
const civilDate = (date: string) => date.split('-').reverse().join('/');

/** Meaning of the statuses whose label alone does not explain them. */
export const statusHelp = [
  ['intake', 'exigida quando o campus declara ingresso com exigência local na oferta e no ciclo'],
  ['unconfigured', 'oferta fora desta norma, com calendário e norma próprios'],
] as const satisfies readonly (readonly [OfferStatus, string])[];

/**
 * Everything the rules page shows for one year, read from the policy that the editor uses. Rows
 * come from one calendar with every offer; the organisation only repeats them, which
 * `rules-view.test.ts` checks.
 */
export function rulesView(year: number) {
  const policy = policyFor(year);
  const offers: CalendarOffer[] = selectableModalities.map((kind) => {
    const offer: CalendarOffer = {
      id: kind,
      kind,
      delivery: 'a-conferir',
      organization: 'anual',
      stages: { perTerm: 2 },
    };
    return policy.excludes(offer) ? offer : { ...offer, scope: { status: 'covered' } };
  });
  const state: AssessmentSettings = {
    year,
    schemaVersion: 4,
    offers,
  };
  const rows = new Map(activityChecklist(state).map((row) => [row.id, row]));
  const minimums = offers.map((offer) => {
    const values = policy.countingMinimums(state, offer);
    return {
      offer: offerLabel(offer),
      annual: values.annual?.days ?? null,
      semester: values.semester?.days ?? null,
      annualBasis: values.annual?.basis,
      semesterBasis: values.semester?.basis,
    };
  });
  return {
    year,
    norm: policy.review.citation ?? policy.review.source.title,
    version: policy.rulesetVersion(state),
    window: policy.window(state),
    excluded: offers.filter((offer) => policy.excludes(offer)).map(offerLabel),
    offers: offers.map((offer) => ({ id: offer.id, label: offerLabel(offer) })),
    observances: policy.observances,
    minimums,
    minimumSources: [
      ...new Set(
        minimums.flatMap((row) => [
          ...(row.annualBasis ? [`Ano letivo: ${row.annualBasis}.`] : []),
          ...(row.semesterBasis ? [`Semestre: ${row.semesterBasis}.`] : []),
        ]),
      ),
    ],
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
          const rowFor = (id: string) => own.find((row) => !row.offerId || row.offerId === id);
          const sample = own[0];
          const byOffer = offers.map((offer) => {
            const row = rowFor(offer.id);
            if (!row) return { offer: offer.id, status: 'absent' as OfferStatus };
            const applicability = policy.applicability(state, row, offer);
            const status: OfferStatus =
              row.intake && policy.intakeRequirements && applicability !== 'unconfigured'
                ? 'intake'
                : applicability;
            return { offer: offer.id, status, note: policy.applicabilityNote?.(row, offer) };
          });
          return {
            id: spec.id,
            name: spec.title ?? sample.name,
            basis: sample.basis,
            criterion: sample.reviewCriterionId,
            decision: sample.decision,
            byOffer,
            details: [
              sample.deadline &&
                !sample.name.includes(civilDate(sample.deadline)) &&
                `Prazo${sample.deadlinePolicy === 'reference' ? ' de referência' : ''}: ${civilDate(sample.deadline)}.`,
            ].filter((item): item is string => Boolean(item)),
          };
        }),
      };
    }),
    criteria: policy.review.criteria.map(({ id, item, title }) => ({ id, item, title })),
  };
}

export type RulesView = ReturnType<typeof rulesView>;
