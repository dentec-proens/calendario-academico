/**
 * Inventory of the stored v4 calendar format, ahead of the v5 conversion (plan
 * `docs/plans/2026-11-02-atividades-e-datas.md`, phase 2, step 1).
 *
 * It reads stored documents as plain JSON (`unknown`) and never imports domain types or rules:
 * the format it describes is frozen, while the domain keeps changing until the conversion. Every
 * value is matched against the shapes the v4 storage validators accept; anything else is an
 * unknown shape and throws, so a new shape stops the preparation instead of being guessed.
 *
 * Links (`requirementId`) are classified by the declaration and the repetition base of the
 * catalogue that applies to the calendar year, from the frozen table below: the 2027 policy
 * (`consup-292-2027`) and, for IDs it does not declare in that shape and for years without a
 * policy, the operational catalogue. Never by description or a permissive pattern.
 */

export type RepeatBase = 'once' | 'cycle' | 'semester' | 'stage';
export type DeclarationCatalogue = 'consup-292-2027' | 'operational';
export type AcademicTerm = 'annual' | 'first' | 'second';

/** Declarations of the v4 catalogues by repetition base, frozen as of the v4 format. */
export const v4Declarations: Readonly<
  Record<DeclarationCatalogue, Readonly<Record<RepeatBase, readonly string[]>>>
> = {
  'consup-292-2027': {
    stage: ['stage', 'results', 'council', 'pedagogical-meeting'],
    cycle: [
      'final',
      'diary',
      'recognition',
      'final-appeal',
      'admission-notice',
      'enrolment',
      'adjustment',
      'withdrawal',
      'registration',
    ],
    semester: ['pit', 'rit', 'teaching-plan'],
    once: [
      'extraordinary-council',
      'family-meeting',
      'campus-events',
      'alumni-meeting',
      'internship-event',
      'regular-admission-notice',
      'robotics',
      'course-showcase',
      'pedagogical-training',
      'collective-planning',
      'women-week',
      'ethics-week',
      'cultural-week',
    ],
  },
  operational: {
    stage: ['stage', 'results', 'council', 'pedagogical-meeting'],
    cycle: [
      'final',
      'diary',
      'teaching-plan',
      'recognition',
      'registration',
      'admission-notice',
      'final-appeal',
    ],
    semester: ['pit', 'enrolment', 'adjustment', 'withdrawal'],
    once: [
      'extraordinary-council',
      'family-meeting',
      'campus-events',
      'alumni-meeting',
      'internship-event',
      'robotics',
      'course-showcase',
      'pedagogical-training',
      'collective-planning',
      'women-week',
      'cultural-week',
    ],
  },
};

/** Calendar years whose v4 checklist came from a normative policy; other years used the operational catalogue. */
export const v4PolicyYears: Readonly<Record<number, DeclarationCatalogue>> = {
  2027: 'consup-292-2027',
};

/** Where a link's declaration came from, relative to the calendar year. */
export type LinkOrigin =
  /** Declared by the year's policy. */
  | 'consup-292-2027'
  /** Policy year, but the ID shape is declared only by the operational catalogue (kept by v4 as “Classificação legada”). */
  | 'legacy-operational'
  /** Year without a policy: the operational catalogue. */
  | 'operational';

export type StagePositionShape =
  /** Offer organised (annual or semester) with a stage count, ordinal within it. */
  | 'defined'
  /** Offer organisation still `a-classificar`: only the reported ordinal is known. */
  | 'unclassified'
  /** Offer organised, ordinal above its stage count. */
  | 'beyond-count'
  /** Offer organised without a stage count. */
  | 'without-count'
  /** The offer in the link is not an offer of the calendar. */
  | 'orphan-offer';

export interface LinkShape {
  requirementId: string;
  origin: LinkOrigin;
  declaration: string;
  base: RepeatBase;
  /** Cycle links: the offer cycle; stage links with a `defined` position: the cycle of the stage. */
  term?: AcademicTerm;
  /** Semester links: the reference semester. */
  semester?: 'first' | 'second';
  /** Stage links: reported ordinal, offer and how the position reads under the current organisation. */
  ordinal?: number;
  offerId?: string;
  position?: StagePositionShape;
  /** Stage links with a `defined` position: number of the stage within its cycle. */
  number?: number;
}

export type ScopeShape =
  'absent' | 'empty' | 'explicit' | 'orphan' | 'materialized-candidate' | 'materialized-proven';

/**
 * Every shape the inventory recognises, with its v5 conversion rule. A shape outside this table
 * is unknown; blocking shapes are known but stop the conversion until the owner decides.
 */
export const v4Forms = {
  'state.schemaVersion:4': 'Convertido para `schemaVersion: 5`.',
  'state.offers:present': 'Ofertas mantidas, mesmos IDs e ordem.',
  'state.offers:empty': 'Bloqueia: estado sem ofertas (seção 5.3).',
  'offer.organization:anual': 'Mantida.',
  'offer.organization:semestral': 'Mantida.',
  'offer.organization:a-classificar': 'Mantida.',
  'offer.stages:defined': '`stages: { status: "defined", perTerm }`.',
  'offer.stages:absent': 'Sem etapas.',
  'offer.legacyStageCount:2': '`stages: { status: "reported", count: 2 }`.',
  'offer.legacyStageCount:3': '`stages: { status: "reported", count: 3 }`.',
  'offer.legacyStageCount:4': '`stages: { status: "reported", count: 4 }`.',
  'period.association:defined': 'Mantida.',
  'period.association:a-classificar': 'Mantida.',
  'period.association:orphan-offer': 'Bloqueia: período associado a oferta fora do calendário.',
  'event.kind:include': '`effect: "include"`.',
  'event.kind:exclude': '`effect: "exclude"`.',
  'event.kind:note': '`effect: "note"`.',
  'event.recordType:absent': 'Nada a converter.',
  'event.recordType:event': 'Removido (`recordType` deixa de existir).',
  'event.requirementId:absent': 'Sem `activity` (data do campus).',
  'event.requirementId:consup-292-2027:once': '`activity: { activityId }`.',
  'event.requirementId:consup-292-2027:cycle':
    '`activity: { activityId, term }` (0 anual, 1 primeiro, 2 segundo).',
  'event.requirementId:consup-292-2027:semester':
    '`activity: { activityId, semester }` (semestre de referência).',
  'event.requirementId:consup-292-2027:stage': '`activity: { activityId, offerId, position }`.',
  'event.requirementId:legacy-operational:once':
    '`activity` pela declaração operacional; fica em Vínculo a conferir.',
  'event.requirementId:legacy-operational:cycle':
    '`activity: { activityId, term }` pela declaração operacional; fica em Vínculo a conferir.',
  'event.requirementId:legacy-operational:semester':
    '`activity: { activityId, semester }` pela declaração operacional; fica em Vínculo a conferir.',
  'event.requirementId:operational:once': '`activity: { activityId }` do catálogo operacional.',
  'event.requirementId:operational:cycle':
    '`activity: { activityId, term }` do catálogo operacional.',
  'event.requirementId:operational:semester':
    '`activity: { activityId, semester }` do catálogo operacional.',
  'event.requirementId:operational:stage':
    '`activity: { activityId, offerId, position }` do catálogo operacional.',
  'event.stagePosition:defined':
    '`position: { status: "defined", term, number }` (ciclo e número na etapa).',
  'event.stagePosition:unclassified': '`position: { status: "unclassified", reportedOrdinal }`.',
  'event.stagePosition:beyond-count':
    '`position: { status: "unclassified", reportedOrdinal }`; fica em Vínculo a conferir.',
  'event.stagePosition:without-count':
    '`position: { status: "unclassified", reportedOrdinal }`; fica em Vínculo a conferir.',
  'event.stagePosition:orphan-offer': 'Bloqueia: etapa de oferta fora do calendário.',
  'event.offers:absent':
    '`scope: { offers: ofertas do próprio estado, confirmed: false }`; entrada no manifesto.',
  'event.offers:empty':
    '`scope: { offers: ofertas do próprio estado, confirmed: false }`; entrada no manifesto.',
  'event.offers:explicit': '`scope: { offers, confirmed: true }`, mesmos IDs e ordem.',
  'event.offers:orphan': 'Bloqueia: oferta da data fora do calendário (seção 5.3).',
  'event.offers:materialized-candidate':
    '`scope: { offers, confirmed: true }`; entrada própria no manifesto (seção 5.3).',
  'event.offers:materialized-proven':
    '`scope: { offers, confirmed: true }`; entrada própria no manifesto com o envio que prova (seção 5.3).',
  'event.publicationStatus:absent': 'Sem `notice.publication`.',
  'event.publicationStatus:planned': '`notice.publication: "planned"`.',
  'event.publicationStatus:published': '`notice.publication: "published"`.',
  'event.admission:absent': 'Sem `notice.admission`.',
  'event.admission:without-period':
    '`notice.admission` com `destinations: []` (destino não informado).',
  'event.admission:period-valid':
    '`notice.admission.destinations`: o período copiado para cada oferta da data.',
  'event.admission:period-orphan':
    '`notice.admission.destinations`: período órfão copiado e diagnosticado, nunca ausência.',
  'event.linkReview:unclassified': 'Vínculo convertido; Classificação pendente por oferta.',
  'event.linkReview:duplicate-stage': 'Vínculo convertido; Etapa duplicada.',
  'event.linkReview:stage-sequence': 'Vínculo convertido; Etapas fora de sequência.',
  'event.linkReview:out-of-cycle': 'Vínculo convertido; Fora do período do ciclo.',
  'snapshot.kind:include': '`effect: "include"`.',
  'snapshot.kind:exclude': '`effect: "exclude"`.',
  'snapshot.kind:note': '`effect: "note"`.',
  'snapshot.requirementId:absent': 'Snapshot sem vínculo.',
  'snapshot.requirementId:present': 'Bloqueia: nenhum caminho grava vínculo em snapshot.',
  'snapshot.recordType:absent': 'Nada a converter.',
  'snapshot.recordType:event': 'Removido.',
  'snapshot.offers:absent': 'Escopo por tipo de oferta (`modalities`), mantido.',
  'snapshot.offers:explicit': 'Escopo do snapshot mantido.',
  'snapshot.notice:absent': 'Sem `notice`.',
  'snapshot.notice:present': '`notice` com os mesmos valores.',
  'snapshot.admission:period':
    'Bloqueia: destino de ingresso em snapshot (nenhum caminho grava edital em snapshot, e o destino por oferta exige as ofertas da data).',
  'catalogue.kind:include': '`effect: "include"`.',
  'catalogue.kind:exclude': '`effect: "exclude"`.',
  'catalogue.kind:note': '`effect: "note"`.',
  'catalogue.active:true': 'Mantido.',
  'catalogue.active:false': 'Mantido.',
} as const;

export type V4Form = keyof typeof v4Forms;

/** Known shapes that stop the conversion until the owner decides (plan, sections 5.3 and 6). */
export const blockingForms: ReadonlySet<V4Form> = new Set<V4Form>([
  'state.offers:empty',
  'period.association:orphan-offer',
  'event.stagePosition:orphan-offer',
  'event.offers:orphan',
  'snapshot.requirementId:present',
  'snapshot.admission:period',
]);

export class UnknownShapeError extends Error {
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`Forma v4 desconhecida em ${path}: ${detail}`);
    this.name = 'UnknownShapeError';
  }
}

export interface MaterializedScope {
  eventId: string;
  offers: string[];
  status: 'candidate' | 'proven';
  /** Submissions whose copy of the date proves the materialization. */
  proofs: number[];
}

export interface Inventory {
  forms: Partial<Record<V4Form, number>>;
  /** Every shape found, by the path of the stored object that has it (for the manifest). */
  occurrences: { path: string; form: V4Form }[];
  blocking: { path: string; form: V4Form }[];
  links: { path: string; eventId: string; link: LinkShape }[];
  materialized: MaterializedScope[];
}

type Json = Record<string, unknown>;
const linkIssues = ['unclassified', 'duplicate-stage', 'stage-sequence', 'out-of-cycle'] as const;
const kinds = ['include', 'exclude', 'note'] as const;
const modalities = ['integrado', 'subsequente', 'graduacao', 'posgraduacao'] as const;
const terms = ['annual', 'first', 'second'] as const;
const cycleTerms: Readonly<Record<string, AcademicTerm>> = { 0: 'annual', 1: 'first', 2: 'second' };
const semesters: Readonly<Record<string, 'first' | 'second'>> = { 1: 'first', 2: 'second' };
const systemFields = ['_id', '_creationTime'];

const fail = (path: string, detail: string): never => {
  throw new UnknownShapeError(path, detail);
};

function record(value: unknown, path: string, required: string[], optional: string[] = []): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail(path, 'objeto esperado');
  const object = value as Json;
  for (const key of Object.keys(object))
    if (!required.includes(key) && !optional.includes(key) && object[key] !== undefined)
      fail(`${path}.${key}`, 'campo não inventariado');
  for (const key of required) if (object[key] === undefined) fail(`${path}.${key}`, 'ausente');
  return object;
}

/** An object whose keys are checked elsewhere (or are free, as in a record). */
function loose(value: unknown, path: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail(path, 'objeto esperado');
  return value as Json;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, 'lista esperada');
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') return fail(path, 'texto esperado');
  return value;
}

function optionalText(value: unknown, path: string) {
  if (value !== undefined) text(value, path);
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'número esperado');
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'booleano esperado');
  return value;
}

function date(value: unknown, path: string): string {
  const day = text(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(path, `data inválida “${day}”`);
  return day;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  path: string,
  values: readonly T[],
): T {
  if (!values.includes(value as T)) fail(path, `valor não inventariado “${String(value)}”`);
  return value as T;
}

function texts(value: unknown, path: string): string[] {
  return list(value, path).map((item, index) => text(item, `${path}[${index}]`));
}

/**
 * Fields of each stored v4 object, required and optional, as the storage validators of
 * `convex/validators.ts` and `convex/schema.ts` accept them (Convex system fields aside).
 */
export const v4StorageFields = {
  offer: {
    required: ['id', 'kind', 'delivery', 'organization'],
    optional: ['label', 'legacyStageCount', 'stages', 'scope', 'intake', 'organizationBasis'],
  },
  period: { required: ['id', 'name', 'start', 'end', 'association'], optional: ['targetDays'] },
  event: {
    required: ['id', 'name', 'start', 'end', 'kind'],
    optional: [
      'category',
      'requirementId',
      'offers',
      'hours',
      'assessmentAutoStart',
      'recordType',
      'publicationStatus',
      'admission',
      'deadlineAdjustment',
      'deadlineExtensionCause',
    ],
  },
  snapshot: {
    required: ['id', 'name', 'start', 'end', 'kind', 'evidence'],
    optional: [
      'category',
      'requirementId',
      'modalities',
      'offers',
      'hours',
      'assessmentAutoStart',
      'recordType',
      'publicationStatus',
      'admission',
      'deadlineAdjustment',
      'deadlineExtensionCause',
      'active',
      'source',
      'institutional',
      'originalStart',
      'originalEnd',
    ],
  },
  state: {
    required: ['schemaVersion', 'offers', 'weekdays', 'weekConfirmed', 'periods', 'events'],
    optional: ['rulesetVersion', 'observanceDates', 'teacherVacations'],
  },
  content: {
    required: [
      'calendarId',
      'state',
      'catalogueRevision',
      'institutionalSnapshot',
      'documentSnapshot',
    ],
    optional: [],
  },
  submission: {
    required: [
      'calendarId',
      'sequence',
      'submittedAt',
      'submittedBy',
      'submittedFrom',
      'contentVersion',
      'contentHash',
      'state',
      'catalogueRevision',
      'institutionalSnapshot',
      'documentSnapshot',
      'offerKinds',
      'campusName',
      'decisions',
    ],
    optional: ['previousSubmissionId'],
  },
  document: {
    required: [
      'id',
      'year',
      'type',
      'title',
      'source',
      'hash',
      'filename',
      'status',
      'version',
      'createdAt',
    ],
    optional: [
      'storageId',
      'unavailableFile',
      'size',
      'createdBy',
      'publishedAt',
      'publishedBy',
      'archivedAt',
    ],
  },
  institutionalEvent: {
    required: [
      'code',
      'year',
      'name',
      'start',
      'end',
      'kind',
      'category',
      'evidence',
      'modalities',
      'active',
    ],
    optional: [],
  },
} as const satisfies Record<string, { required: readonly string[]; optional: readonly string[] }>;

type StoredObject = keyof typeof v4StorageFields;

/** Reads a stored object of the given kind, refusing fields outside its validator. */
function stored(kind: StoredObject, value: unknown, path: string, system = false): Json {
  const { required, optional } = v4StorageFields[kind];
  return record(value, path, [...required], [...optional, ...(system ? systemFields : [])]);
}

const emptyInventory = (): Inventory => ({
  forms: {},
  occurrences: [],
  blocking: [],
  links: [],
  materialized: [],
});

class Collector {
  readonly inventory: Inventory = emptyInventory();

  form(form: V4Form, path: string) {
    this.inventory.forms[form] = (this.inventory.forms[form] ?? 0) + 1;
    this.inventory.occurrences.push({ path, form });
    if (blockingForms.has(form)) this.inventory.blocking.push({ path, form });
  }
}

/**
 * Classifies a stored `requirementId` by the declaration and repetition base of the catalogue of
 * the calendar year. Throws for an ID no catalogue declares in that shape.
 */
export function classifyRequirementId(
  requirementId: string,
  year: number,
  offers: readonly OfferShape[] = [],
): LinkShape {
  const policy = v4PolicyYears[year];
  const attempts: [DeclarationCatalogue, LinkOrigin][] = policy
    ? [
        [policy, policy as LinkOrigin],
        ['operational', 'legacy-operational'],
      ]
    : [['operational', 'operational']];
  for (const [catalogue, origin] of attempts) {
    const match = matchDeclaration(v4Declarations[catalogue], requirementId);
    if (!match) continue;
    if (catalogue !== 'operational' && conflictsWithLegacyRow(match, requirementId, offers))
      continue;
    const link: LinkShape = { requirementId, origin, ...match };
    if (match.base !== 'stage') return link;
    const offer = offers.find((item) => item.id === match.offerId);
    link.position = !offer
      ? 'orphan-offer'
      : offer.organization === 'a-classificar'
        ? 'unclassified'
        : offer.stageCount === undefined
          ? 'without-count'
          : match.ordinal! > offer.stageCount
            ? 'beyond-count'
            : 'defined';
    if (link.position === 'defined') Object.assign(link, stageInCycle(offer!, match.ordinal!));
    return link;
  }
  return fail('requirementId', `vínculo não declarado “${requirementId}” em ${year}`);
}

/**
 * The declaration and base an ID has in one catalogue, each ID read whole against the declared
 * names of every base. An ID that two bases of the same catalogue could both have produced is
 * ambiguous and throws, instead of being resolved by the order of the checks.
 */
export function matchDeclaration(
  declarations: Readonly<Record<RepeatBase, readonly string[]>>,
  requirementId: string,
): Omit<LinkShape, 'requirementId' | 'origin'> | undefined {
  const matches: Omit<LinkShape, 'requirementId' | 'origin'>[] = [];
  for (const declaration of declarations.once)
    if (requirementId === declaration) matches.push({ declaration, base: 'once' });
  const suffix = /^(.+)-(\d+)$/.exec(requirementId);
  if (suffix) {
    const [, declaration, n] = suffix;
    if (declarations.cycle.includes(declaration) && cycleTerms[n])
      matches.push({ declaration, base: 'cycle', term: cycleTerms[n] });
    if (declarations.semester.includes(declaration) && semesters[n])
      matches.push({ declaration, base: 'semester', semester: semesters[n] });
  }
  const stage = /^(.+)-([1-9]\d*):(.+)$/.exec(requirementId);
  if (stage && declarations.stage.includes(stage[1]))
    matches.push({
      declaration: stage[1],
      base: 'stage',
      ordinal: Number(stage[2]),
      offerId: stage[3],
    });
  if (matches.length > 1)
    return fail(
      'requirementId',
      `vínculo ambíguo “${requirementId}”: ${matches.map((item) => `${item.declaration} (${item.base})`).join(', ')}`,
    );
  return matches[0];
}

/**
 * Cycle and number of a stage within it, for an organised offer whose stage count covers the
 * ordinal (frozen from the v4 `stageTerm`/`stageInTerm`): annual stages number on in the year;
 * semester stages split evenly between the first and second cycles.
 */
function stageInCycle(offer: OfferShape, ordinal: number): { term: AcademicTerm; number: number } {
  if (offer.organization === 'anual') return { term: 'annual', number: ordinal };
  const perTerm = offer.stageCount! / 2;
  return ordinal <= perTerm
    ? { term: 'first', number: ordinal }
    : { term: 'second', number: ordinal - perTerm };
}

interface OfferShape {
  id: string;
  organization: string;
  kind?: string;
  stageCount?: number;
}

/** Modalities the 2027 policy leaves out of its rows (frozen from the v4 policy). */
const v4PolicyExcludedKinds: readonly string[] = ['posgraduacao'];

/**
 * In a policy year, an ID such as `enrolment-1` is declared by the policy as a cycle and by the
 * operational catalogue as a semester. The v4 policy generated a cycle row only for the terms of
 * its supported offers (annual for `anual`, first and second for `semestral`, none for
 * `a-classificar`); otherwise v4 kept the operational row (“Classificação legada”) under the same
 * ID. Reading the policy cycle then would silently turn a reference semester into a cycle, so the
 * link is read by the row v4 actually generated for the organisation of the state.
 */
function conflictsWithLegacyRow(
  match: Omit<LinkShape, 'requirementId' | 'origin'>,
  requirementId: string,
  offers: readonly OfferShape[],
): boolean {
  if (match.base !== 'cycle') return false;
  const operational = matchDeclaration(v4Declarations.operational, requirementId);
  if (!operational || operational.base === match.base) return false;
  const generated = offers.some(
    (offer) =>
      !v4PolicyExcludedKinds.includes(offer.kind ?? '') &&
      (match.term === 'annual'
        ? offer.organization === 'anual'
        : offer.organization === 'semestral'),
  );
  return !generated;
}

/** Stages per cycle each organization accepted in v4 (`validateOffers`), frozen. */
const v4StagesPerTerm: Readonly<Record<string, readonly number[]>> = {
  anual: [2, 3, 4],
  semestral: [1, 2],
  'a-classificar': [],
};

function readOffers(value: unknown, path: string, out: Collector): OfferShape[] {
  const ids = new Set<string>();
  const offers = list(value, path).map((item, index): OfferShape => {
    const at = `${path}[${index}]`;
    const offer = stored('offer', item, at);
    const id = text(offer.id, `${at}.id`);
    // Offers, links and scopes are matched by ID: a repeated one has no single reading.
    if (ids.has(id)) fail(`${at}.id`, `oferta repetida “${id}”`);
    ids.add(id);
    literal(offer.kind, `${at}.kind`, modalities);
    optionalText(offer.label, `${at}.label`);
    literal(offer.delivery, `${at}.delivery`, ['presencial', 'ead', 'a-conferir']);
    const organization = literal(offer.organization, `${at}.organization`, [
      'anual',
      'semestral',
      'a-classificar',
    ]);
    out.form(`offer.organization:${organization}`, at);
    let perTerm: number | undefined;
    if (offer.stages !== undefined) {
      const stages = record(offer.stages, `${at}.stages`, ['perTerm']);
      perTerm = literal(stages.perTerm, `${at}.stages.perTerm`, [1, 2, 3, 4]);
      out.form('offer.stages:defined', at);
    } else out.form('offer.stages:absent', at);
    // v4 never saved both (`normalize-v4.ts`); converting one would drop the other (section 5.5).
    if (offer.legacyStageCount !== undefined && perTerm !== undefined)
      fail(`${at}.legacyStageCount`, 'quantidade anterior junto de etapas por ciclo');
    // The conversion rules of the stages hold only for the pairs v4 saved (`validateOffers`): a
    // reported total without a confirmed cycle, and stages per cycle that the organization allows.
    // Any other pair is accepted by the storage validator but has no rule (section 5.5): reading
    // it as reported or defined would be a guess, so it stops the conversion.
    if (offer.legacyStageCount !== undefined && organization !== 'a-classificar')
      fail(`${at}.legacyStageCount`, `quantidade anterior com organização ${organization}`);
    if (perTerm !== undefined && !v4StagesPerTerm[organization].includes(perTerm))
      fail(`${at}.stages.perTerm`, `${perTerm} etapa(s) por ciclo com organização ${organization}`);
    if (offer.legacyStageCount !== undefined)
      out.form(
        `offer.legacyStageCount:${literal(offer.legacyStageCount, `${at}.legacyStageCount`, [2, 3, 4])}`,
        at,
      );
    if (offer.scope !== undefined)
      literal(record(offer.scope, `${at}.scope`, ['status']).status, `${at}.scope.status`, [
        'covered',
        'own-regulation',
      ]);
    if (offer.intake !== undefined) {
      const intake = record(offer.intake, `${at}.intake`, [], [...terms]);
      for (const [term, entry] of Object.entries(intake)) {
        const item = record(entry, `${at}.intake.${term}`, ['status'], ['required']);
        literal(item.status, `${at}.intake.${term}.status`, ['unknown', 'yes', 'no']);
        if (item.required !== undefined) boolean(item.required, `${at}.intake.${term}.required`);
      }
    }
    optionalText(offer.organizationBasis, `${at}.organizationBasis`);
    return {
      id,
      organization,
      kind: offer.kind as string,
      stageCount:
        perTerm === undefined
          ? undefined
          : organization === 'semestral'
            ? perTerm * 2
            : organization === 'anual'
              ? perTerm
              : undefined,
    };
  });
  out.form(offers.length ? 'state.offers:present' : 'state.offers:empty', path);
  return offers;
}

function readPeriods(value: unknown, path: string, offerIds: string[], out: Collector) {
  return list(value, path).map((item, index) => {
    const at = `${path}[${index}]`;
    const period = stored('period', item, at);
    const id = text(period.id, `${at}.id`);
    text(period.name, `${at}.name`);
    date(period.start, `${at}.start`);
    date(period.end, `${at}.end`);
    if (period.targetDays !== undefined) number(period.targetDays, `${at}.targetDays`);
    const association = record(
      period.association,
      `${at}.association`,
      ['status'],
      ['offers', 'term'],
    );
    if (association.status === 'a-classificar') {
      record(association, `${at}.association`, ['status']);
      out.form('period.association:a-classificar', at);
    } else {
      literal(association.status, `${at}.association.status`, ['defined']);
      record(association, `${at}.association`, ['status', 'offers', 'term']);
      literal(association.term, `${at}.association.term`, terms);
      const offers = texts(association.offers, `${at}.association.offers`);
      out.form(
        offers.every((id) => offerIds.includes(id))
          ? 'period.association:defined'
          : 'period.association:orphan-offer',
        at,
      );
    }
    return id;
  });
}

function readAdmission(value: unknown, path: string) {
  const admission = record(value, path, ['type', 'year', 'term'], ['periodId']);
  literal(admission.type, `${path}.type`, ['regular', 'transfer']);
  number(admission.year, `${path}.year`);
  literal(admission.term, `${path}.term`, terms);
  optionalText(admission.periodId, `${path}.periodId`);
  // Format 4 read an empty period as not informed (`a.periodId && …`), never as an orphan.
  return (admission.periodId as string | undefined) || undefined;
}

export interface ScopeContext {
  /** Only the current content has offer lists an offer addition may have materialized. */
  materialize: boolean;
  /** Submission states of the same calendar, to prove materialized scopes. */
  submissions: readonly { sequence: number; offers: string[]; events: Json[] }[];
}

function scopeShape(
  value: unknown,
  path: string,
  offerIds: string[],
): { shape: ScopeShape; offers?: string[] } {
  if (value === undefined) return { shape: 'absent' };
  const offers = texts(value, path);
  if (!offers.length) return { shape: 'empty' };
  if (offers.some((id) => !offerIds.includes(id))) return { shape: 'orphan', offers };
  return { shape: 'explicit', offers };
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * A list added by an offer addition equals the offers the calendar had before it, which are a
 * proper prefix of the current offers (new offers are appended). It is proven when a submission
 * of the same calendar had the same date without offers and exactly those offers.
 */
export function materialization(
  eventId: string,
  offers: string[],
  offerIds: string[],
  context: ScopeContext,
): MaterializedScope | undefined {
  if (offers.length >= offerIds.length || !sameList(offers, offerIds.slice(0, offers.length)))
    return undefined;
  const proofs = context.submissions
    .filter(
      (submission) =>
        sameList(submission.offers, offers) &&
        submission.events.some(
          (event) =>
            event.id === eventId &&
            (event.offers === undefined || (Array.isArray(event.offers) && !event.offers.length)),
        ),
    )
    .map((submission) => submission.sequence);
  return { eventId, offers, status: proofs.length ? 'proven' : 'candidate', proofs };
}

function readEvents(
  value: unknown,
  path: string,
  state: { year: number; offers: OfferShape[]; periodIds: string[] },
  context: ScopeContext & { linkIssues: Readonly<Record<string, unknown>> },
  out: Collector,
) {
  const offerIds = state.offers.map((offer) => offer.id);
  const ids = new Set<string>();
  for (const [index, item] of list(value, path).entries()) {
    const at = `${path}[${index}]`;
    const event = stored('event', item, at);
    const id = text(event.id, `${at}.id`);
    // The manifest, the proof of materialized scopes and the save boundary identify a date by its
    // ID (plan, section 6): a repeated one would merge two dates, so it has no reading.
    if (ids.has(id)) fail(`${at}.id`, `data repetida “${id}”`);
    ids.add(id);
    text(event.name, `${at}.name`);
    date(event.start, `${at}.start`);
    date(event.end, `${at}.end`);
    out.form(`event.kind:${literal(event.kind, `${at}.kind`, kinds)}`, at);
    optionalText(event.category, `${at}.category`);
    if (event.hours !== undefined) number(event.hours, `${at}.hours`);
    if (event.assessmentAutoStart !== undefined)
      date(event.assessmentAutoStart, `${at}.assessmentAutoStart`);
    if (event.deadlineAdjustment !== undefined) {
      const adjustment = record(event.deadlineAdjustment, `${at}.deadlineAdjustment`, [
        'date',
        'reviewed',
      ]);
      date(adjustment.date, `${at}.deadlineAdjustment.date`);
      boolean(adjustment.reviewed, `${at}.deadlineAdjustment.reviewed`);
    }
    if (event.deadlineExtensionCause !== undefined)
      literal(event.deadlineExtensionCause, `${at}.deadlineExtensionCause`, [
        'municipal-holiday',
        'municipal-recess',
      ]);
    out.form(
      event.recordType === undefined
        ? 'event.recordType:absent'
        : `event.recordType:${literal(event.recordType, `${at}.recordType`, ['event'])}`,
      at,
    );
    if (event.requirementId === undefined) out.form('event.requirementId:absent', at);
    else {
      const requirementId = text(event.requirementId, `${at}.requirementId`);
      let link: LinkShape;
      try {
        link = classifyRequirementId(requirementId, state.year, state.offers);
      } catch (error) {
        if (error instanceof UnknownShapeError) fail(`${at}.requirementId`, error.message);
        throw error;
      }
      const form = `event.requirementId:${link.origin}:${link.base}`;
      if (!(form in v4Forms))
        fail(`${at}.requirementId`, `base ${link.base} sem regra para ${link.origin}`);
      out.form(form as V4Form, at);
      if (link.position) out.form(`event.stagePosition:${link.position}`, at);
      out.inventory.links.push({ path: `${at}.requirementId`, eventId: id, link });
    }
    const scope = scopeShape(event.offers, `${at}.offers`, offerIds);
    const materialized =
      scope.shape === 'explicit' && context.materialize
        ? materialization(id, scope.offers!, offerIds, context)
        : undefined;
    if (materialized) out.inventory.materialized.push(materialized);
    out.form(
      materialized
        ? `event.offers:materialized-${materialized.status}`
        : `event.offers:${scope.shape}`,
      at,
    );
    out.form(
      event.publicationStatus === undefined
        ? 'event.publicationStatus:absent'
        : `event.publicationStatus:${literal(event.publicationStatus, `${at}.publicationStatus`, [
            'planned',
            'published',
          ])}`,
      at,
    );
    if (event.admission === undefined) out.form('event.admission:absent', at);
    else {
      const periodId = readAdmission(event.admission, `${at}.admission`);
      out.form(
        periodId === undefined
          ? 'event.admission:without-period'
          : state.periodIds.includes(periodId)
            ? 'event.admission:period-valid'
            : 'event.admission:period-orphan',
        at,
      );
    }
    const issue = context.linkIssues[id];
    if (issue !== undefined)
      out.form(`event.linkReview:${literal(issue, `linksToReview.${id}`, linkIssues)}`, at);
  }
}

function readSnapshot(value: unknown, path: string, out: Collector) {
  for (const [index, item] of list(value, path).entries()) {
    const at = `${path}[${index}]`;
    const event = stored('snapshot', item, at);
    text(event.id, `${at}.id`);
    text(event.name, `${at}.name`);
    date(event.start, `${at}.start`);
    date(event.end, `${at}.end`);
    text(event.evidence, `${at}.evidence`);
    out.form(`snapshot.kind:${literal(event.kind, `${at}.kind`, kinds)}`, at);
    optionalText(event.category, `${at}.category`);
    if (event.requirementId === undefined) out.form('snapshot.requirementId:absent', at);
    else {
      text(event.requirementId, `${at}.requirementId`);
      out.form('snapshot.requirementId:present', at);
    }
    if (event.modalities !== undefined)
      list(event.modalities, `${at}.modalities`).forEach((item, i) =>
        literal(item, `${at}.modalities[${i}]`, modalities),
      );
    if (event.offers === undefined) out.form('snapshot.offers:absent', at);
    else {
      texts(event.offers, `${at}.offers`);
      out.form('snapshot.offers:explicit', at);
    }
    if (event.hours !== undefined) number(event.hours, `${at}.hours`);
    if (event.assessmentAutoStart !== undefined)
      date(event.assessmentAutoStart, `${at}.assessmentAutoStart`);
    out.form(
      event.recordType === undefined
        ? 'snapshot.recordType:absent'
        : `snapshot.recordType:${literal(event.recordType, `${at}.recordType`, ['event'])}`,
      at,
    );
    if (event.publicationStatus !== undefined)
      literal(event.publicationStatus, `${at}.publicationStatus`, ['planned', 'published']);
    if (
      event.admission !== undefined &&
      readAdmission(event.admission, `${at}.admission`) !== undefined
    )
      out.form('snapshot.admission:period', at);
    out.form(
      event.publicationStatus === undefined && event.admission === undefined
        ? 'snapshot.notice:absent'
        : 'snapshot.notice:present',
      at,
    );
    if (event.deadlineAdjustment !== undefined) {
      const adjustment = record(event.deadlineAdjustment, `${at}.deadlineAdjustment`, [
        'date',
        'evidence',
        'reviewed',
      ]);
      date(adjustment.date, `${at}.deadlineAdjustment.date`);
      text(adjustment.evidence, `${at}.deadlineAdjustment.evidence`);
      boolean(adjustment.reviewed, `${at}.deadlineAdjustment.reviewed`);
    }
    if (event.deadlineExtensionCause !== undefined)
      literal(event.deadlineExtensionCause, `${at}.deadlineExtensionCause`, [
        'municipal-holiday',
        'municipal-recess',
      ]);
    if (event.active !== undefined) boolean(event.active, `${at}.active`);
    optionalText(event.source, `${at}.source`);
    if (event.institutional !== undefined) boolean(event.institutional, `${at}.institutional`);
    if (event.originalStart !== undefined) date(event.originalStart, `${at}.originalStart`);
    if (event.originalEnd !== undefined) date(event.originalEnd, `${at}.originalEnd`);
  }
}

function readDocuments(value: unknown, path: string) {
  for (const [index, item] of list(value, path).entries()) {
    const at = `${path}[${index}]`;
    const document = stored('document', item, at);
    text(document.id, `${at}.id`);
    number(document.year, `${at}.year`);
    literal(document.type, `${at}.type`, ['norma', 'referencia', 'parecer']);
    for (const key of ['title', 'source', 'hash', 'filename']) text(document[key], `${at}.${key}`);
    literal(document.status, `${at}.status`, ['rascunho', 'vigente', 'arquivado']);
    for (const key of ['version', 'createdAt']) number(document[key], `${at}.${key}`);
    for (const key of ['size', 'publishedAt', 'archivedAt'])
      if (document[key] !== undefined) number(document[key], `${at}.${key}`);
    for (const key of ['storageId', 'createdBy', 'publishedBy'])
      optionalText(document[key], `${at}.${key}`);
    if (document.unavailableFile !== undefined) {
      const file = record(document.unavailableFile, `${at}.unavailableFile`, [
        'sourceReference',
        'reason',
      ]);
      text(file.sourceReference, `${at}.unavailableFile.sourceReference`);
      literal(file.reason, `${at}.unavailableFile.reason`, ['not_migrated']);
    }
  }
}

function readState(
  value: unknown,
  path: string,
  year: number,
  context: ScopeContext & { linkIssues: Readonly<Record<string, unknown>> },
  out: Collector,
) {
  const state = stored('state', value, path);
  out.form(
    `state.schemaVersion:${literal(state.schemaVersion, `${path}.schemaVersion`, [4])}`,
    path,
  );
  optionalText(state.rulesetVersion, `${path}.rulesetVersion`);
  const offers = readOffers(state.offers, `${path}.offers`, out);
  list(state.weekdays, `${path}.weekdays`).forEach((day, index) =>
    literal(day, `${path}.weekdays[${index}]`, [0, 1, 2, 3, 4, 5, 6]),
  );
  boolean(state.weekConfirmed, `${path}.weekConfirmed`);
  const periodIds = readPeriods(
    state.periods,
    `${path}.periods`,
    offers.map((offer) => offer.id),
    out,
  );
  readEvents(state.events, `${path}.events`, { year, offers, periodIds }, context, out);
  if (state.observanceDates !== undefined)
    for (const [key, day] of Object.entries(
      loose(state.observanceDates, `${path}.observanceDates`),
    ))
      date(day, `${path}.observanceDates.${key}`);
  if (state.teacherVacations !== undefined) {
    const vacations = record(
      state.teacherVacations,
      `${path}.teacherVacations`,
      ['firstStart', 'firstEnd'],
      ['secondStart', 'secondEnd', 'thirdStart', 'thirdEnd'],
    );
    for (const [key, day] of Object.entries(vacations))
      date(day, `${path}.teacherVacations.${key}`);
  }
}

export function submissionStates(submissions: readonly unknown[]) {
  return submissions.map((item, index) => {
    const at = `submissions[${index}]`;
    const submission = loose(item, at);
    const state = loose(submission.state, `${at}.state`);
    return {
      sequence: number(submission.sequence, `${at}.sequence`),
      offers: list(state.offers, `${at}.state.offers`).map((offer, i) =>
        text(loose(offer, `${at}.state.offers[${i}]`).id, `${at}.state.offers[${i}].id`),
      ),
      events: list(state.events, `${at}.state.events`).map((event, i) =>
        loose(event, `${at}.state.events[${i}]`),
      ),
    };
  });
}

export interface ContentContext {
  /** Year of the calendar (`calendars.year`); the stored state does not repeat it. */
  year: number;
  /** Stored submissions of the same calendar, to prove materialized offer lists. */
  submissions?: readonly unknown[];
  /** `linksToReview()` of this state under v4 rules, by date ID, as recorded in the oracle. */
  linksToReview?: Readonly<Record<string, unknown>>;
}

function readContentFields(
  document: Json,
  path: string,
  context: ContentContext & { materialize: boolean },
  out: Collector,
) {
  number(document.catalogueRevision, `${path}.catalogueRevision`);
  readState(
    document.state,
    `${path}.state`,
    context.year,
    {
      materialize: context.materialize,
      submissions: submissionStates(context.submissions ?? []),
      linkIssues: context.linksToReview ?? {},
    },
    out,
  );
  readSnapshot(document.institutionalSnapshot, `${path}.institutionalSnapshot`, out);
  readDocuments(document.documentSnapshot, `${path}.documentSnapshot`);
}

/** Inventory of one `calendarContents` document. */
export function inventoryContent(document: unknown, context: ContentContext): Inventory {
  const out = new Collector();
  const content = stored('content', document, 'content', true);
  text(content.calendarId, 'content.calendarId');
  readContentFields(content, 'content', { ...context, materialize: true }, out);
  return out.inventory;
}

/**
 * Inventory of one `calendarSubmissions` copy. Its scope stands alone: a submission uses its own
 * offers, never the current ones, so no list in it is a materialization candidate.
 */
export function inventorySubmission(
  document: unknown,
  context: Omit<ContentContext, 'submissions'>,
): Inventory {
  const out = new Collector();
  const submission = stored('submission', document, 'submission', true);
  number(submission.sequence, 'submission.sequence');
  number(submission.contentVersion, 'submission.contentVersion');
  text(submission.contentHash, 'submission.contentHash');
  literal(submission.submittedFrom, 'submission.submittedFrom', ['rascunho', 'devolvido']);
  list(submission.decisions, 'submission.decisions');
  readContentFields(submission, 'submission', { ...context, materialize: false }, out);
  return out.inventory;
}

/**
 * Inventory of an institutional snapshot (`institutionalSnapshot` of a content or submission),
 * on its own: the conversion of a snapshot reads it without the state it belongs to.
 */
export function inventorySnapshot(value: unknown, path = 'institutionalSnapshot'): Inventory {
  const out = new Collector();
  readSnapshot(value, path, out);
  return out.inventory;
}

/** Inventory of one `institutionalEvents` row (the catalogue). */
export function inventoryCatalogueRow(row: unknown): Inventory {
  const out = new Collector();
  const event = stored('institutionalEvent', row, 'institutionalEvent', true);
  text(event.code, 'institutionalEvent.code');
  number(event.year, 'institutionalEvent.year');
  text(event.name, 'institutionalEvent.name');
  date(event.start, 'institutionalEvent.start');
  date(event.end, 'institutionalEvent.end');
  text(event.category, 'institutionalEvent.category');
  text(event.evidence, 'institutionalEvent.evidence');
  out.form(
    `catalogue.kind:${literal(event.kind, 'institutionalEvent.kind', kinds)}`,
    'institutionalEvent',
  );
  list(event.modalities, 'institutionalEvent.modalities').forEach((item, index) =>
    literal(item, `institutionalEvent.modalities[${index}]`, modalities),
  );
  out.form(
    `catalogue.active:${boolean(event.active, 'institutionalEvent.active')}`,
    'institutionalEvent',
  );
  return out.inventory;
}

/** Sums inventories, keeping paths of occurrences, blocking shapes, links and materialized lists. */
export function mergeInventories(inventories: readonly Inventory[]): Inventory {
  const total = emptyInventory();
  for (const inventory of inventories) {
    for (const [form, count] of Object.entries(inventory.forms) as [V4Form, number][])
      total.forms[form] = (total.forms[form] ?? 0) + count;
    total.occurrences.push(...inventory.occurrences);
    total.blocking.push(...inventory.blocking);
    total.links.push(...inventory.links);
    total.materialized.push(...inventory.materialized);
  }
  return total;
}

/** A calendar with the status of `calendars` and the inventory of its current content. */
export interface CalendarInventory {
  calendarId: string;
  status: string;
  inventory: Inventory;
}

/**
 * Calendars `revisado` or `vigente` whose current content has dates under “Vínculo a conferir”
 * (forms `event.linkReview:*` of the content, not of its submissions), with how many. Since phase
 * 2, step 13, such a date blocks the conclusion: a reviewed calendar keeps its status, but its
 * publication is refused until a return and the correction of the link; a published one is not
 * changed. Counted in the production inventory for the decision of the person responsible.
 */
export function reviewedCalendarsWithLinksToReview(calendars: readonly CalendarInventory[]) {
  const counted: Record<'revisado' | 'vigente', { calendarId: string; dates: number }[]> = {
    revisado: [],
    vigente: [],
  };
  for (const { calendarId, status, inventory } of calendars) {
    if (status !== 'revisado' && status !== 'vigente') continue;
    const dates = inventory.occurrences.filter(
      (item) => item.path.startsWith('content.') && item.form.startsWith('event.linkReview:'),
    ).length;
    if (dates) counted[status].push({ calendarId, dates });
  }
  return counted;
}
