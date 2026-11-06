import { compactDate, longDate } from '#src/domain/date-labels.ts';
import {
  calendarSchemaVersion,
  type AssessmentSettings,
  type CalendarOffer,
} from '#src/domain/calendar/model.ts';
import { selectableModalities } from '#src/domain/calendar/modalities.ts';
import { generatedActivities } from '#src/domain/calendar/activities/links.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { expandRules, type ActivityRule } from '#src/domain/calendar/activities/rules.ts';
import type { RulesetChange } from '#src/domain/policies/contract.ts';
import { policyFor } from '#src/domain/policies/registry.ts';
import { offerLabel } from '#src/domain/calendar/offers.ts';
import { schoolDayNature } from '#src/domain/calendar/activities/school-day.ts';

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
/** The written form of a deadline inside the name of a rule, which comes from the norm's text. */
const dateInRuleName = (date: string) => date.split('-').reverse().join('/');

/** Rules grouped by repetition base, in the order each base first appears. */
function byRepeat(rules: readonly ActivityRule[]) {
  const groups = new Map<ActivityRule['repeat'], ActivityRule[]>();
  for (const rule of rules) groups.set(rule.repeat, [...(groups.get(rule.repeat) ?? []), rule]);
  return [...groups];
}

/** Meaning of the statuses whose label alone does not explain them. */
export const statusHelp = [
  ['intake', 'exigida quando o campus declara exigência local na oferta e no ciclo'],
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
      stages: { status: 'defined', perTerm: 2 },
    };
    return policy.excludes(offer) ? offer : { ...offer, scope: { status: 'covered' } };
  });
  const state: AssessmentSettings = {
    year,
    schemaVersion: calendarSchemaVersion,
    offers,
  };
  const rows = generatedActivities(state);
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
    normUrl: policy.review.citationUrl,
    version: policy.rulesetVersion(state),
    window: policy.window(state),
    excluded: offers.filter((offer) => policy.excludes(offer)).map(offerLabel),
    offers: offers.map((offer) => ({ id: offer.id, label: offerLabel(offer) })),
    observances: policy.observances,
    schoolDay: policy.schoolDay && { basis: policy.schoolDay.basis },
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
      date: compactDate(change.date, year),
      effect: effectLabels[change.effect],
    })),
    sections: byRepeat(policy.catalogue ?? []).map(([repeat, rules]) => {
      const expanded = expandRules(rules, state);
      return {
        ...repeatLabels[repeat],
        activities: rules.map((rule) => {
          // The plan rows, not the bare expansion, carry the policy's own defaults; both are matched
          // by the key of their link.
          const own = expanded
            .filter((item) => item.rule.id === rule.id)
            .map((item) => rows.get(activityKey(item.row.activity))!);
          const rowFor = (id: string) => own.find((row) => !row.offerId || row.offerId === id);
          const sample = own[0];
          const byOffer = offers.map((offer) => {
            const row = rowFor(offer.id);
            if (!row) return { offer: offer.id, status: 'absent' as OfferStatus };
            const applicability = policy.applicability(state, row, offer);
            const status: OfferStatus =
              row.intake && policy.configured && applicability !== 'unconfigured'
                ? 'intake'
                : applicability;
            return { offer: offer.id, status, note: policy.applicabilityNote?.(row, offer) };
          });
          return {
            id: rule.id,
            name: rule.title ?? sample.name,
            basis: sample.basis,
            criterion: sample.reviewCriterionId,
            decision: sample.decision,
            byOffer,
            details: [
              sample.deadline &&
                !sample.name.includes(dateInRuleName(sample.deadline)) &&
                `Prazo${sample.deadlinePolicy === 'reference' ? ' de referência' : ''}: ${longDate(sample.deadline)}.`,
              policy.schoolDay &&
                schoolDayNature(year, { activity: sample.activity, effect: 'note' }) !==
                  'school-day' &&
                'Não constitui dia letivo.',
            ].filter((item): item is string => Boolean(item)),
          };
        }),
      };
    }),
    criteria: policy.review.criteria.map(({ id, item, title, requirement, source }) => ({
      id,
      title,
      requirement,
      source: source ?? item,
    })),
    notEvaluated: policy.review.notEvaluated ?? [],
  };
}

export type RulesView = ReturnType<typeof rulesView>;
