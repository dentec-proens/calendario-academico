import { assessmentStageCounts } from '../config.ts';
import type { AcademicTerm, ActivityRequirement, AssessmentSettings } from '../model.ts';
import { calendarModalities } from '../modalities.ts';
import type { ActivityGroup, ActivityVariant } from './metadata.ts';

/** Position of one generated row: an offer's assessment stage, an academic cycle or a semester. */
export interface Slot {
  state: AssessmentSettings;
  /** Stage number, cycle number (0 annual, 1 first, 2 second) or semester; 0 for single rows. */
  n: number;
  /** Stage rows: the offer and its stage count. */
  modality?: string;
  stages?: number;
  /** Cycle and semester rows. */
  term?: AcademicTerm;
  /** Cycle rows: offers organised in the cycle, when the section derives cycles from them. */
  offers?: string[];
}

type PerSlot<T> = T | ((slot: Slot) => T);
type Fields = Omit<
  ActivityRequirement,
  'id' | 'group' | 'defaultCategory' | 'variant' | 'reviewCriterionId'
>;

/** Offer-level declarations are plain values: policies read them from rows of any slot. */
type OfferFields = 'optionalFor' | 'intake';

/**
 * One activity of a norm, declared as data. Other fields may depend on the slot, which keeps
 * wording and per-slot exceptions next to the activity instead of in identifier checks.
 */
export type RequirementSpec = {
  [K in Exclude<keyof Fields, OfferFields>]?: PerSlot<Fields[K]>;
} & Pick<Fields, OfferFields> & {
    /** Stable identifier; repeated rows append `-n` or `-n:offer`, as persisted records expect. */
    id: string;
    name: PerSlot<string>;
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

/** Rows repeated per offer stage, per cycle, per semester, or declared once, in display order. */
export type RequirementSection = {
  /** Fields shared by every row of the section; a row's own fields win. */
  each?: Omit<RequirementSpec, 'id' | 'name' | 'group'>;
  rows: readonly RequirementSpec[];
} & (
  | { repeat: 'stage' | 'semester' | 'once' }
  | { repeat: 'cycle'; cycles(state: AssessmentSettings): CycleSlot[] }
);

export interface ExpandedRequirement {
  row: ActivityRequirement;
  slot: Slot;
  spec: RequirementSpec;
}

const semesterTerms = { 1: 'first', 2: 'second' } as const;

function slotsOf(section: RequirementSection, state: AssessmentSettings): [Slot, string][] {
  switch (section.repeat) {
    case 'stage':
      return calendarModalities(state).flatMap((modality) => {
        const stages = Number(state.assessmentStagesByModality?.[modality]);
        if (!assessmentStageCounts.includes(stages)) return [];
        return Array.from({ length: stages }, (_, index): [Slot, string] => [
          { state, n: index + 1, modality, stages },
          `-${index + 1}:${modality}`,
        ]);
      });
    case 'cycle':
      return section.cycles(state).map((cycle) => [{ state, ...cycle }, `-${cycle.n}`]);
    case 'semester':
      return ([1, 2] as const).map((n) => [{ state, n, term: semesterTerms[n] }, `-${n}`]);
    case 'once':
      return [[{ state, n: 0 }, '']];
  }
}

/** A row's explicitly undefined field keeps the section's value. */
const defined = (spec: RequirementSpec) =>
  Object.fromEntries(Object.entries(spec).filter(([, value]) => value !== undefined));

const resolve = (value: unknown, slot: Slot) =>
  typeof value === 'function' ? (value as (slot: Slot) => unknown)(slot) : value;

/** Expands declared sections into the rows of one calendar, slot by slot, keeping section order. */
export function expandRequirements(
  sections: readonly RequirementSection[],
  state: AssessmentSettings,
): ExpandedRequirement[] {
  return sections.flatMap((section) =>
    slotsOf(section, state).flatMap(([slot, suffix]) =>
      section.rows.map((own) => {
        const spec = { ...section.each, ...defined(own) } as RequirementSpec;
        const { id, group, criterion, category, variant, ...fields } = spec;
        const row: Record<string, unknown> = { id: id + suffix };
        for (const [key, value] of Object.entries(fields)) {
          const resolved = resolve(value, slot);
          if (resolved !== undefined) row[key] = resolved;
        }
        if (slot.modality) row.modality = slot.modality;
        Object.assign(row, {
          reviewCriterionId: criterion,
          group,
          defaultCategory: category ?? 'prazo',
          variant:
            variant ??
            (row.admissionType ? 'admission-notice' : row.minHours ? 'hours' : 'activity'),
        });
        return { row: row as unknown as ActivityRequirement, slot, spec };
      }),
    ),
  );
}
