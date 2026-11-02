import { DomainError } from '../../errors.ts';
import { declaredActivityRules } from '../../policies/registry.ts';
import { academicTerms, type AcademicTerm } from '../config.ts';
import type { RepeatBasis } from './rules.ts';

/**
 * Link of a date with the activity it serves (plan `docs/plans/2026-11-02-atividades-e-datas.md`,
 * section 5.1). The activity is identified by its declaration and its repetition base, never by
 * a composed string: each base has its own shape, and the IDs each base accepts come from the
 * declared `ActivityRule`s of the policies (`declaredActivityRules()`), checked at runtime by
 * `activityRef()`. A link is valid by these declarations, not by the rows the current
 * configuration generates; whether it is generated is a classification, evaluated elsewhere.
 */
export type ActivityBase = RepeatBasis['repeat'];

declare const activityIdBase: unique symbol;
/** ID declared with repetition base `B`; obtained only from `activityRef()`. */
export type ActivityId<B extends ActivityBase> = string & { readonly [activityIdBase]: B };
export type OnceActivityId = ActivityId<'once'>;
export type CycleActivityId = ActivityId<'cycle'>;
export type SemesterActivityId = ActivityId<'semester'>;
export type StageActivityId = ActivityId<'stage'>;

/** Reference semester (art. 11, XII: “em cada semestre”), also for annual offers. */
export type ReferenceSemester = 'first' | 'second';

/**
 * Position of a stage link: the ordinal reported while the offer's organization is not classified
 * (`unclassified`), or the stage's cycle and number within it once defined. A defined position is
 * kept when the number of stages changes; it is never reinterpreted.
 */
export type StagePosition =
  | { status: 'unclassified'; reportedOrdinal: number }
  | { status: 'defined'; term: AcademicTerm; number: number };

export type ActivityRef =
  | { activityId: OnceActivityId }
  /** Offer cycle (art. 11, VI and VIII). */
  | { activityId: CycleActivityId; term: AcademicTerm }
  /** Reference semester (art. 11, XII). */
  | { activityId: SemesterActivityId; semester: ReferenceSemester }
  /** Offer stage (art. 11, I, IX and XIII): stages, results, councils and meetings. */
  | { activityId: StageActivityId; offerId: string; position: StagePosition };

const semesters: readonly ReferenceSemester[] = ['first', 'second'];
const baseLabels: Record<ActivityBase, string> = {
  once: 'como atividade única',
  cycle: 'por ciclo da oferta',
  semester: 'por semestre de referência',
  stage: 'por etapa',
};

let declared: Readonly<Record<ActivityBase, ReadonlySet<string>>> | undefined;

/** IDs declared with each repetition base by the policies and the operational catalogue. */
export function activityIds(base: ActivityBase): ReadonlySet<string> {
  if (!declared) {
    const rules = declaredActivityRules();
    const idsOf = (item: ActivityBase) =>
      new Set(rules.filter((rule) => rule.repeat === item).map((rule) => rule.id));
    declared = {
      once: idsOf('once'),
      cycle: idsOf('cycle'),
      semester: idsOf('semester'),
      stage: idsOf('stage'),
    };
  }
  return declared[base];
}

const invalid = (detail: string) => new DomainError(`Atividade vinculada inválida: ${detail}.`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value: Record<string, unknown>, keys: readonly string[], what: string) {
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => value[key] === undefined);
  if (extra.length || missing.length)
    throw invalid(
      `${what} tem ${[
        ...(extra.length ? [`campos não previstos (${extra.join(', ')})`] : []),
        ...(missing.length ? [`campos ausentes (${missing.join(', ')})`] : []),
      ].join(' e ')}`,
    );
}

const positiveInteger = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function stagePosition(value: unknown): StagePosition {
  if (!isObject(value)) throw invalid('posição de etapa ausente');
  if (value.status === 'unclassified') {
    exactKeys(value, ['status', 'reportedOrdinal'], 'a posição não classificada');
    if (!positiveInteger(value.reportedOrdinal))
      throw invalid('ordinal informado deve ser inteiro positivo');
    return { status: 'unclassified', reportedOrdinal: value.reportedOrdinal as number };
  }
  if (value.status === 'defined') {
    exactKeys(value, ['status', 'term', 'number'], 'a posição definida');
    if (!academicTerms.includes(value.term as AcademicTerm))
      throw invalid(`ciclo da etapa “${String(value.term)}” desconhecido`);
    if (!positiveInteger(value.number)) throw invalid('número da etapa deve ser inteiro positivo');
    return {
      status: 'defined',
      term: value.term as AcademicTerm,
      number: value.number as number,
    };
  }
  throw invalid(`situação de posição “${String(value.status)}” desconhecida`);
}

/** Base implied by the fields of a link: each base has its own shape. */
const baseOf = (value: Record<string, unknown>): ActivityBase =>
  'position' in value || 'offerId' in value
    ? 'stage'
    : 'term' in value
      ? 'cycle'
      : 'semester' in value
        ? 'semester'
        : 'once';

/**
 * Validates an activity link: the shape of its base and an ID declared with that base. An ID is
 * matched whole against the declared set, so a string that only starts like a declared ID (as the
 * old `stage-1:integrado`) is refused, and an activity that is not repeated by stage (as a
 * meeting with families) never takes a stage position.
 */
export function activityRef(value: unknown): ActivityRef {
  if (!isObject(value)) throw invalid('vínculo ausente');
  const base = baseOf(value);
  const id = value.activityId;
  if (typeof id !== 'string' || !id) throw invalid('identificador ausente');
  if (!activityIds(base).has(id))
    throw invalid(`atividade “${id}” não declarada ${baseLabels[base]}`);
  switch (base) {
    case 'once':
      exactKeys(value, ['activityId'], 'o vínculo de atividade única');
      return { activityId: id as OnceActivityId };
    case 'cycle':
      exactKeys(value, ['activityId', 'term'], 'o vínculo por ciclo');
      if (!academicTerms.includes(value.term as AcademicTerm))
        throw invalid(`ciclo “${String(value.term)}” desconhecido`);
      return { activityId: id as CycleActivityId, term: value.term as AcademicTerm };
    case 'semester':
      exactKeys(value, ['activityId', 'semester'], 'o vínculo por semestre de referência');
      if (!semesters.includes(value.semester as ReferenceSemester))
        throw invalid(`semestre de referência “${String(value.semester)}” desconhecido`);
      return {
        activityId: id as SemesterActivityId,
        semester: value.semester as ReferenceSemester,
      };
    case 'stage':
      exactKeys(value, ['activityId', 'offerId', 'position'], 'o vínculo por etapa');
      if (typeof value.offerId !== 'string' || !value.offerId) throw invalid('oferta ausente');
      return {
        activityId: id as StageActivityId,
        offerId: value.offerId,
        position: stagePosition(value.position),
      };
  }
}

/**
 * Key of a linked activity, for grouping and URLs: the declaration, the base and its position,
 * with the offer last. Pure and injective (declared IDs never contain `:`); it is not a parser
 * and has nothing in common with the old `requirementId`.
 */
export function activityKey(ref: ActivityRef): string {
  if ('term' in ref) return `${ref.activityId}:cycle:${ref.term}`;
  if ('semester' in ref) return `${ref.activityId}:semester:${ref.semester}`;
  if ('position' in ref) {
    const { position } = ref;
    const at =
      position.status === 'defined'
        ? `${position.term}:${position.number}`
        : `unclassified:${position.reportedOrdinal}`;
    return `${ref.activityId}:stage:${at}:${ref.offerId}`;
  }
  return ref.activityId;
}
