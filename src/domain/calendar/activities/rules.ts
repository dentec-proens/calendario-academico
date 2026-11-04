import type {
  AcademicTerm,
  ActivityPlanItem,
  AssessmentSettings,
  CalendarOffer,
} from '../model.ts';
import {
  calendarOffers,
  stageCount,
  stageInTerm,
  stagePosition,
  stagesPerTerm,
  stageTerm,
} from '../offers.ts';
import type { ActivityRef } from './activity-ref.ts';
import type { ActivityGroup, ActivityVariant } from './metadata.ts';

/** Position of one generated row: an offer's assessment stage, an academic cycle or a semester. */
export interface Slot {
  state: AssessmentSettings;
  /** Stage number, cycle number (0 annual, 1 first, 2 second) or semester; 0 for single rows. */
  n: number;
  /** Stage rows: the offer and its stage count. */
  offer?: CalendarOffer;
  /** Displayed stage number, restarted within each organization cycle. */
  number?: number;
  stages?: number;
  /** Cycle and semester rows. */
  term?: AcademicTerm;
  /** Cycle rows: offers organised in the cycle, when the rule derives cycles from them. */
  offers?: string[];
}

type PerSlot<T> = T | ((slot: Slot) => T);
type Fields = Omit<
  ActivityPlanItem,
  'id' | 'activity' | 'group' | 'defaultCategory' | 'variant' | 'reviewCriterionId'
>;

/** Offer-level declarations are plain values: policies read them from rows of any slot. */
type OfferFields = 'optionalFor' | 'intake';

/**
 * What one activity of a norm declares besides its repetition. Fields may depend on the slot,
 * which keeps wording and per-slot exceptions next to the activity instead of in identifier checks.
 */
export type ActivityRuleFields = {
  [K in Exclude<keyof Fields, OfferFields>]?: PerSlot<Fields[K]>;
} & Pick<Fields, OfferFields> & {
    /** Stable identifier; repeated rows append `-n` or `-n:offer`, as persisted records expect. */
    id: string;
    name: PerSlot<string>;
    /** Name without the stage, cycle or semester, for the rules page; `name` when it is text. */
    title?: string;
    group: ActivityGroup;
    /** Review criterion of the policy's parecer. */
    criterion?: string;
    /** Category prepared for a new record; `prazo` when absent. */
    category?: string;
    /** Form blocks; `admission-notice` with `admissionType`, `hours` with `minHours`, else `activity`. */
    variant?: ActivityVariant;
  };

export interface CycleSlot {
  n: number;
  term: AcademicTerm;
  offers?: string[];
}

/**
 * Repetition base of an activity: once a year; per offer cycle (art. 11, VI and VIII), whose
 * `cycles` derive the cycles of a calendar; per reference semester, even for annual offers
 * (art. 11, XII); or per offer stage (art. 11, I and IX).
 */
export type RepeatBasis =
  | { repeat: 'once' | 'semester' | 'stage' }
  | { repeat: 'cycle'; cycles: (state: AssessmentSettings) => CycleSlot[] };

/** One activity of a norm, declared as data with its repetition base. */
export type ActivityRule = ActivityRuleFields & RepeatBasis;

/** Values shared by several rules of one base; a rule's own defined fields win. */
export type CommonRuleFields = Omit<ActivityRuleFields, 'id' | 'name' | 'group'>;

/** A rule's explicitly undefined field keeps the common value. */
const defined = (fields: object) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

/**
 * Declares rules that share a repetition base and common values, in display order. Each result is
 * a complete `ActivityRule`: the base and the common values are composed in it, in one place.
 */
export function declareRules(
  basis: RepeatBasis & { each?: CommonRuleFields },
  rules: readonly ActivityRuleFields[],
): ActivityRule[] {
  const { each, ...repeat } = basis;
  return rules.map((own) => ({ ...repeat, ...each, ...defined(own) }) as ActivityRule);
}

export interface ExpandedRule {
  row: ActivityPlanItem;
  slot: Slot;
  rule: ActivityRule;
}

const semesterTerms = { 1: 'first', 2: 'second' } as const;

function slotsOf(basis: RepeatBasis, state: AssessmentSettings): [Slot, string][] {
  switch (basis.repeat) {
    case 'stage':
      return calendarOffers(state).flatMap((offer) =>
        Array.from({ length: stageCount(offer) }, (_, index): [Slot, string] => {
          const n = index + 1;
          return [
            {
              state,
              n,
              number:
                offer.organization === 'semestral'
                  ? stageInTerm(n, stagesPerTerm(offer)!).number
                  : n,
              offer,
              stages: stageCount(offer),
              term: stageTerm(offer, n),
            },
            `-${n}:${offer.id}`,
          ];
        }),
      );
    case 'cycle':
      return basis.cycles(state).map((cycle) => [{ state, ...cycle }, `-${cycle.n}`]);
    case 'semester':
      return ([1, 2] as const).map((n) => [{ state, n, term: semesterTerms[n] }, `-${n}`]);
    case 'once':
      return [[{ state, n: 0 }, '']];
  }
}

/** Rules with the same base expand together; cycle rules share a base only with the same `cycles`. */
const basisOf = (rule: ActivityRule) => (rule.repeat === 'cycle' ? rule.cycles : rule.repeat);

/**
 * Link of the row's slot, by the rule's base: the declared ID never carries
 * the slot. The IDs come from declared rules, the set `activityRef()` validates against.
 */
function rowActivity(rule: ActivityRule, slot: Slot): ActivityRef {
  switch (rule.repeat) {
    case 'once':
      return { activityId: rule.id } as ActivityRef;
    case 'cycle':
      return { activityId: rule.id, term: slot.term! } as ActivityRef;
    case 'semester':
      return { activityId: rule.id, semester: slot.term as 'first' | 'second' } as ActivityRef;
    case 'stage':
      return {
        activityId: rule.id,
        offerId: slot.offer!.id,
        // The slots of a stage rule are the stages the offer has, each with its position.
        position: stagePosition(slot.offer!, slot.n)!,
      } as ActivityRef;
  }
}

const resolve = (value: unknown, slot: Slot) =>
  typeof value === 'function' ? (value as (slot: Slot) => unknown)(slot) : value;

function expandRule(rule: ActivityRule, slot: Slot, suffix: string): ActivityPlanItem {
  const {
    id,
    title: _title,
    group,
    criterion,
    category,
    variant,
    repeat: _repeat,
    ...fields
  } = rule;
  const row: Record<string, unknown> = { id: id + suffix, activity: rowActivity(rule, slot) };
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'cycles') continue;
    const resolved = resolve(value, slot);
    if (resolved !== undefined) row[key] = resolved;
  }
  if (slot.offer) {
    row.offerId = slot.offer.id;
    row.term = slot.term;
  }
  if (slot.offers) row.offerIds = slot.offers;
  Object.assign(row, {
    reviewCriterionId: criterion,
    group,
    defaultCategory: category ?? 'prazo',
    variant:
      variant ?? (row.admissionType ? 'admission-notice' : row.minHours ? 'hours' : 'activity'),
  });
  return row as unknown as ActivityPlanItem;
}

/**
 * Expands declared rules into the rows of one calendar. Rules of one base are grouped where the
 * base first appears and expand slot by slot, each slot listing its rules in declaration order.
 */
export function expandRules(
  rules: readonly ActivityRule[],
  state: AssessmentSettings,
): ExpandedRule[] {
  const groups = new Map<unknown, ActivityRule[]>();
  for (const rule of rules) {
    const key = basisOf(rule);
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  return [...groups.values()].flatMap((group) =>
    slotsOf(group[0], state).flatMap(([slot, suffix]) =>
      group.map((rule) => ({ row: expandRule(rule, slot, suffix), slot, rule })),
    ),
  );
}
