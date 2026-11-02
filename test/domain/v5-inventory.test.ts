import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { v, type GenericValidator } from 'convex/values';
import schema from '../../convex/schema.ts';
import {
  contentStateV4,
  eventV4 as localEvent,
  institutionalEventSnapshotV4 as institutionalEventSnapshot,
  institutionalEventV4,
} from '../../convex/legacyValidators.ts';
import {
  documentSnapshot,
  institutionalEvent,
  institutionalEventSnapshot as institutionalEventSnapshotV5,
  reviewEntry,
  reviewFields,
} from '../../convex/validators.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { operationalRules } from '../../src/domain/calendar/activities/operational-checklist.ts';
import type { RepeatBase as DomainRepeat } from '../../src/domain/calendar/migration/inventory.ts';
import {
  blockingForms,
  classifyRequirementId,
  inventoryCatalogueRow,
  inventoryContent,
  inventorySubmission,
  mergeInventories,
  UnknownShapeError,
  v4Declarations,
  v4StorageFields,
  v4Forms,
  type Inventory,
  type V4Form,
} from '../../src/domain/calendar/migration/inventory.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { rules as policyRules } from '../../src/domain/policies/consup-292-2027/requirements.ts';
import { readOracle, v4CatalogueRows, v4Cases, type V4Case } from '../helpers/v4-fixtures.ts';
import { convertedContent } from '../helpers/v5-conversion.ts';

const repository = resolve(import.meta.dirname, '../..');
const cases = v4Cases();
const oracle = readOracle<{ cases: { name: string; linksToReview: Record<string, string> }[] }>();
const reviewed = (item: V4Case) =>
  oracle.cases.find((entry) => entry.name === item.name)!.linksToReview;
const contentInventory = (item: V4Case, submissions: unknown[] = item.submissions) =>
  inventoryContent(item.content, {
    year: item.year,
    submissions,
    linksToReview: reviewed(item),
  });
const everything = (): Inventory =>
  mergeInventories([
    ...cases.map((item) => contentInventory(item)),
    ...cases.flatMap((item) =>
      item.submissions.map((submission) => inventorySubmission(submission, { year: item.year })),
    ),
    ...v4CatalogueRows().map(inventoryCatalogueRow),
  ]);
const copy = <T>(value: T): T => structuredClone(value);
const byName = (name: string) => cases.find((item) => item.name === name)!;

describe('frozen declarations', () => {
  const byBase = (
    rules: readonly { repeat: string; id: string }[],
  ): Record<DomainRepeat, string[]> => {
    const bases: Record<DomainRepeat, string[]> = { stage: [], cycle: [], semester: [], once: [] };
    for (const rule of rules) bases[rule.repeat as DomainRepeat].push(rule.id);
    return bases;
  };

  test('match the 2027 policy and the operational catalogue the v4 code declares', () => {
    expect(byBase(policyRules)).toEqual(v4Declarations['consup-292-2027']);
    expect(byBase(operationalRules())).toEqual(v4Declarations.operational);
  });

  test('read the repetition base of the catalogue of the year, never only the numeric suffix', () => {
    expect(classifyRequirementId('teaching-plan-1', 2027)).toMatchObject({
      origin: 'consup-292-2027',
      declaration: 'teaching-plan',
      base: 'semester',
      semester: 'first',
    });
    expect(classifyRequirementId('teaching-plan-1', 2026)).toMatchObject({
      origin: 'operational',
      base: 'cycle',
      term: 'first',
    });
    expect(classifyRequirementId('teaching-plan-0', 2027)).toMatchObject({
      origin: 'legacy-operational',
      base: 'cycle',
      term: 'annual',
    });
    // `enrolment-1` is a policy cycle only when the policy generated that cycle (a supported
    // semester offer); otherwise v4 kept the operational semester row under the same ID.
    const semesterOffer = [{ id: 'graduacao', kind: 'graduacao', organization: 'semestral' }];
    expect(classifyRequirementId('enrolment-1', 2027, semesterOffer)).toMatchObject({
      origin: 'consup-292-2027',
      base: 'cycle',
      term: 'first',
    });
    for (const offers of [
      [{ id: 'integrado', kind: 'integrado', organization: 'anual' }],
      [{ id: 'integrado', kind: 'integrado', organization: 'a-classificar' }],
      [{ id: 'pos', kind: 'posgraduacao', organization: 'semestral' }],
    ])
      expect(classifyRequirementId('adjustment-2', 2027, offers), offers[0].id).toMatchObject({
        origin: 'legacy-operational',
        base: 'semester',
        semester: 'second',
      });
    expect(
      classifyRequirementId('withdrawal-0', 2027, [
        { id: 'integrado', kind: 'integrado', organization: 'anual' },
      ]),
    ).toMatchObject({ origin: 'consup-292-2027', base: 'cycle', term: 'annual' });
    expect(classifyRequirementId('enrolment-1', 2026)).toMatchObject({
      base: 'semester',
      semester: 'first',
    });
    expect(classifyRequirementId('final-appeal-2', 2027)).toMatchObject({
      declaration: 'final-appeal',
      base: 'cycle',
      term: 'second',
    });
    expect(classifyRequirementId('family-meeting', 2027)).toMatchObject({ base: 'once' });
    for (const unknown of [
      'final-3',
      'pit-0',
      'rit-1x',
      'family-meeting-1',
      'stage-0:integrado',
      'stage-1',
      'final-appeal',
      'regular-admission-notice',
      'Plano de Ensino',
    ])
      expect(() =>
        classifyRequirementId(unknown, unknown.startsWith('regular') ? 2026 : 2027),
      ).toThrow(UnknownShapeError);
  });

  test('stage ordinals read under defined and unclassified organisation', () => {
    const offers = [
      { id: 'anual', organization: 'anual', stageCount: 4 },
      { id: 'semestral', organization: 'semestral', stageCount: 4 },
      { id: 'pendente', organization: 'a-classificar' },
      { id: 'sem-etapas', organization: 'anual' },
    ];
    const position = (id: string) => classifyRequirementId(id, 2027, offers).position;
    expect(position('stage-4:anual')).toBe('defined');
    expect(position('results-4:semestral')).toBe('defined');
    expect(position('council-5:anual')).toBe('beyond-count');
    expect(position('stage-3:pendente')).toBe('unclassified');
    expect(position('stage-1:sem-etapas')).toBe('without-count');
    expect(position('stage-1:removida')).toBe('orphan-offer');
    expect(classifyRequirementId('pedagogical-meeting-3:pendente', 2027, offers)).toMatchObject({
      declaration: 'pedagogical-meeting',
      ordinal: 3,
      offerId: 'pendente',
    });
  });

  test('agree with the v4 checklist on every link it generates', () => {
    let checked = 0;
    for (const item of cases) {
      // The code reads the current format: the offers' stages are converted (step 8).
      const state = {
        ...convertedContent(item).state,
        year: item.year,
        campus: item.campus,
      } as unknown as ActivityState;
      const generated = new Map(activityPlan(state).map((row) => [row.id, row]));
      for (const { link } of contentInventory(item).links) {
        const row = generated.get(link.requirementId);
        if (!row) continue;
        checked++;
        // In a policy year, a row the policy does not generate for the current organisation may
        // come from the operational catalogue (“Classificação legada”). The year's declaration
        // still decides; both catalogues must then agree on declaration and base.
        const legacy = row.basis === 'Classificação legada';
        if (item.year !== 2027) expect(link.origin, link.requirementId).toBe('operational');
        else if (!legacy) expect(link.origin, link.requirementId).toBe('consup-292-2027');
        else if (link.origin === 'consup-292-2027')
          expect(v4Declarations.operational[link.base], link.requirementId).toContain(
            link.declaration,
          );
        else expect(link.origin, link.requirementId).toBe('legacy-operational');
        expect(link.base === 'stage', link.requirementId).toBe(Boolean(row.offerId));
        if (link.base === 'stage') expect(link.offerId).toBe(row.offerId);
        // Operational rows do not carry their cycle; policy rows do.
        if (row.term !== undefined && !legacy && link.base !== 'stage')
          expect(row.term, link.requirementId).toBe(link.term ?? link.semester);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

test('accepted fields are exactly those of the frozen v4 storage validators', () => {
  const fields = (validators: Record<string, { isOptional: string }>) => {
    const entries = Object.entries(validators);
    const names = (optional: boolean) =>
      entries
        .filter(([, validator]) => (validator.isOptional === 'optional') === optional)
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b));
    return { required: names(false), optional: names(true) };
  };
  const accepted = (kind: keyof typeof v4StorageFields) => ({
    required: [...v4StorageFields[kind].required].sort((a, b) => a.localeCompare(b)),
    optional: [...v4StorageFields[kind].optional].sort((a, b) => a.localeCompare(b)),
  });
  const table = (name: 'calendarContents' | 'calendarSubmissions') =>
    fields(schema.tables[name].validator.fields);
  // The v4 offer and period are reached through the frozen state, which keeps them private.
  const element = (validator: GenericValidator) =>
    (validator as unknown as { element: { fields: Record<string, { isOptional: string }> } })
      .element.fields;
  expect(accepted('offer')).toEqual(fields(element(contentStateV4.fields.offers)));
  expect(accepted('period')).toEqual(fields(element(contentStateV4.fields.periods)));
  expect(accepted('event')).toEqual(fields(localEvent.fields));
  expect(accepted('snapshot')).toEqual(fields(institutionalEventSnapshot.fields));
  expect(accepted('state')).toEqual(fields(contentStateV4.fields));
  // Document envelopes keep their fields in v5; only the nested state and snapshot change.
  expect(accepted('content')).toEqual(table('calendarContents'));
  expect(accepted('submission')).toEqual(table('calendarSubmissions'));
  expect(accepted('document')).toEqual(fields(documentSnapshot.fields));
  expect(accepted('institutionalEvent')).toEqual(
    fields({ code: v.string(), year: v.number(), ...institutionalEventV4.fields }),
  );
});

describe('inventory of the frozen v4 documents', () => {
  test('classifies every shape found and registers its conversion rule', () => {
    const inventory = everything();
    const found = Object.keys(inventory.forms).sort();
    for (const form of found) expect(v4Forms).toHaveProperty([form]);
    // Every rule of the table is backed by a frozen document, except blocking shapes (proven by
    // injection below) and shapes the storage accepts but no fixture or seed has.
    const absent = (Object.keys(v4Forms) as V4Form[]).filter((form) => !(form in inventory.forms));
    expect(absent.sort()).toEqual(
      [
        ...blockingForms,
        'catalogue.active:false',
        'catalogue.kind:include',
        'event.requirementId:legacy-operational:once',
        'snapshot.kind:include',
        'snapshot.notice:present',
        'snapshot.offers:absent',
        'snapshot.recordType:event',
      ].sort(),
    );
    expect(inventory.blocking).toEqual([]);
  });

  test('records the 21 audited links as unclassified, with their declarations', () => {
    const audited = cases.filter((item) => item.name.endsWith('(seção 11)'));
    const inventory = mergeInventories(audited.map((item) => contentInventory(item)));
    expect(inventory.forms['event.linkReview:unclassified']).toBe(21);
    expect(
      inventory.links.map(({ link }) => [link.origin, link.base, link.declaration, link.term]),
    ).toEqual(
      expect.arrayContaining([
        ['consup-292-2027', 'cycle', 'final', 'first'],
        ['consup-292-2027', 'cycle', 'admission-notice', 'second'],
        ['consup-292-2027', 'cycle', 'registration', 'first'],
      ]),
    );
    expect(inventory.links).toHaveLength(21);
    expect(inventory.forms['event.admission:absent']).toBe(
      audited.reduce((total, item) => total + item.content.state.events.length, 0),
    );
  });

  test('a semester link kept by v4 as legacy in a 2027 annual calendar stays a semester to review', () => {
    const item = byName('Vínculo semestral legado em 2027 só anual, com documentos');
    const state = { ...item.content.state, year: item.year, campus: item.campus };
    const row = activityPlan(state as unknown as ActivityState).find(
      (entry) => entry.id === 'enrolment-1',
    );
    expect(row?.basis).toBe('Classificação legada');
    const inventory = contentInventory(item);
    expect(inventory.links.find(({ link }) => link.requirementId === 'enrolment-1')?.link).toEqual({
      requirementId: 'enrolment-1',
      origin: 'legacy-operational',
      declaration: 'enrolment',
      base: 'semester',
      semester: 'first',
    });
    expect(inventory.forms['event.requirementId:legacy-operational:semester']).toBe(1);
    expect(item.content.documentSnapshot).toHaveLength(2);
    expect(inventorySubmission(item.submissions[0], { year: item.year }).blocking).toEqual([]);
  });

  test('a materialized offer list is a candidate without a submission and proven with one', () => {
    const item = byName('Acréscimo de oferta materializa a abrangência');
    const meeting = (inventory: Inventory) =>
      inventory.materialized.find((entry) => entry.eventId === 'campus-meeting');
    expect(meeting(contentInventory(item, []))).toEqual({
      eventId: 'campus-meeting',
      offers: ['integrado', 'graduacao'],
      status: 'candidate',
      proofs: [],
    });
    expect(meeting(contentInventory(item))).toEqual({
      eventId: 'campus-meeting',
      offers: ['integrado', 'graduacao'],
      status: 'proven',
      proofs: [1],
    });
    // A submission with other offers proves nothing.
    const other = copy(item.submissions[0]);
    other.state.offers = other.state.offers.slice(0, 1);
    expect(meeting(contentInventory(item, [other]))?.status).toBe('candidate');
    // Every proper prefix is a candidate, including lists the campus may have chosen.
    expect(
      contentInventory(item)
        .materialized.map((entry) => `${entry.eventId}:${entry.status}`)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual([
      'campus-meeting:proven',
      'integrado-stage-1:candidate',
      'integrado-stage-2:candidate',
      'integrado-stage-3:candidate',
      'integrado-stage-4:candidate',
    ]);
    // The full list of offers is an explicit choice, never a materialization.
    const full = copy(item.content);
    full.state.events.find((event) => event.id === 'campus-meeting')!.offers =
      full.state.offers.map((offer) => offer.id);
    expect(
      inventoryContent(full, { year: item.year }).materialized.some(
        (entry) => entry.eventId === 'campus-meeting',
      ),
    ).toBe(false);
  });

  test('submissions keep their own offers and never yield materialization candidates', () => {
    const item = byName('Acréscimo de oferta materializa a abrangência');
    const inventory = inventorySubmission(item.submissions[0], { year: item.year });
    expect(inventory.materialized).toEqual([]);
    expect(inventory.forms['event.offers:absent']).toBe(1);
  });
});

describe('a shape outside the inventory stops it', () => {
  const base = byName('Formas adicionais do inventário');
  const documentItem = byName('Vínculo semestral legado em 2027 só anual, com documentos').content
    .documentSnapshot[0];
  const event = (content: V4Case['content'], id: string) =>
    content.state.events.find((item) => item.id === id)!;
  const injected: [string, (content: V4Case['content']) => void][] = [
    ['unknown event field', (c) => void (event(c, 'forms-pit').internal = true)],
    ['domain-only field days', (c) => void (event(c, 'forms-pit').days = 1)],
    [
      'domain-only field originalStart',
      (c) => void (event(c, 'forms-pit').originalStart = '2027-08-01'),
    ],
    ['unknown kind', (c) => void (event(c, 'forms-pit').kind = 'shift')],
    [
      'effect instead of kind',
      (c) => {
        const target = event(c, 'forms-pit');
        target.effect = target.kind;
        delete target.kind;
      },
    ],
    ['unknown record type', (c) => void (event(c, 'forms-pit').recordType = 'activity')],
    ['undeclared link', (c) => void (event(c, 'forms-pit').requirementId = 'pit-3')],
    ['link by description', (c) => void (event(c, 'forms-pit').requirementId = 'Plano individual')],
    ['structured link', (c) => void (event(c, 'forms-pit').requirementId = { activityId: 'pit' })],
    ['publication status', (c) => void (event(c, 'forms-pit').publicationStatus = 'scheduled')],
    [
      'admission without year',
      (c) =>
        void delete (event(c, 'forms-notice-orphan').admission as Record<string, unknown>).year,
    ],
    ['offers as text', (c) => void (event(c, 'forms-pit').offers = 'integrado')],
    ['legacy stage count 5', (c) => void (c.state.offers[0].legacyStageCount = 5)],
    ['stages as number', (c) => void (c.state.offers[0].stages = 4)],
    ['offer organization misto', (c) => void (c.state.offers[0].organization = 'misto')],
    ['schema version 5', (c) => void (c.state.schemaVersion = 5)],
    ['scope inside the state', (c) => void (c.state.scope = { offers: [] })],
    [
      'unknown snapshot field',
      (c) =>
        void c.institutionalSnapshot.push({
          id: 'inst:x',
          name: 'x',
          start: '2027-01-01',
          end: '2027-01-01',
          kind: 'note',
          evidence: '',
          activity: {},
        }),
    ],
    ['date without zero padding', (c) => void (event(c, 'forms-pit').start = '2027-8-2')],
    ...(
      [
        ['unknown document field', { activity: 'pit' }],
        ['document status', { status: 'publicado' }],
        ['document without version', { version: undefined }],
        ['unavailable file reason', { unavailableFile: { sourceReference: 'x', reason: 'lost' } }],
      ] as const
    ).map(([name, change]): [string, (content: V4Case['content']) => void] => [
      name,
      (c) => {
        const document: Record<string, unknown> = { ...documentItem, ...change };
        for (const key of Object.keys(document))
          if (document[key] === undefined) delete document[key];
        c.documentSnapshot.push(document);
      },
    ]),
  ];
  test('a valid document is accepted', () => {
    const content = copy(base.content);
    content.documentSnapshot.push({ ...documentItem });
    expect(() => inventoryContent(content, { year: base.year })).not.toThrow();
  });

  test.each(injected)('%s', (_name, inject) => {
    const content = copy(base.content);
    expect(() => inventoryContent(content, { year: base.year })).not.toThrow();
    inject(content);
    expect(() => inventoryContent(content, { year: base.year })).toThrow(UnknownShapeError);
  });

  test('an unknown link review reason or catalogue row is also refused', () => {
    expect(() =>
      inventoryContent(base.content, { year: base.year, linksToReview: { 'forms-pit': 'stale' } }),
    ).toThrow(UnknownShapeError);
    const [row] = v4CatalogueRows();
    expect(() => inventoryCatalogueRow({ ...row, requirementId: 'final-1' })).toThrow(
      UnknownShapeError,
    );
    expect(() => inventoryCatalogueRow({ ...row, kind: 'shift' })).toThrow(UnknownShapeError);
  });

  test('known exceptional shapes are inventoried as blocking', () => {
    const content = copy(base.content);
    event(content, 'forms-pit').offers = ['removida'];
    event(content, 'forms-stage').requirementId = 'stage-3:removida';
    content.institutionalSnapshot.push({
      id: 'inst:linked',
      name: 'Snapshot com vínculo',
      start: '2027-03-01',
      end: '2027-03-01',
      kind: 'note',
      evidence: '',
      requirementId: 'final-0',
    });
    content.institutionalSnapshot.push({
      id: 'inst:notice',
      name: 'Snapshot com destino de ingresso',
      start: '2027-03-01',
      end: '2027-03-01',
      kind: 'note',
      evidence: '',
      publicationStatus: 'planned',
      admission: { type: 'transfer', year: 2027, term: 'annual', periodId: 'year' },
    });
    const inventory = inventoryContent(content, { year: base.year });
    expect(inventory.blocking.map(({ form }) => form).sort()).toEqual([
      'event.offers:orphan',
      'event.stagePosition:orphan-offer',
      'snapshot.admission:period',
      'snapshot.requirementId:present',
    ]);
    const empty = copy(base.content);
    empty.state.offers = [];
    empty.state.events = [];
    empty.state.periods = [];
    expect(inventoryContent(empty, { year: base.year }).blocking).toEqual([
      { path: 'content.state.offers', form: 'state.offers:empty' },
    ]);
    const period = copy(base.content);
    (period.state.periods as Record<string, unknown>[])[0].association = {
      status: 'defined',
      offers: ['removida'],
      term: 'first',
    };
    expect(inventoryContent(period, { year: base.year }).blocking).toEqual([
      { path: 'content.state.periods[0]', form: 'period.association:orphan-offer' },
    ]);
  });
});

describe('searches the plan asks for', () => {
  test('no path stores a link in an institutional snapshot', async () => {
    // Catalogue rows have no link field, and every snapshot is built from the catalogue
    // (create and save) or copied whole (submission, revision copy).
    expect(Object.keys(institutionalEvent.fields)).not.toContain('requirementId');
    const writers = {
      'convex/calendars.ts': [
        'applyObservances(inheritedEvents(base, body.year, state.offers), state)',
        'clean(prepared.institutionalSnapshot)',
        'institutionalSnapshot: content.institutionalSnapshot',
      ],
      'src/domain/calendar/prepare-save.ts': [
        'institutionalSnapshot: applyObservances(inherited, state)',
      ],
      'convex/calendars/transitions.ts': ['institutionalSnapshot: content.institutionalSnapshot'],
      'convex/catalogue/model.ts': [
        '({ code, name, start, end, effect, category, evidence, modalities, active }) => ({',
      ],
    };
    for (const [file, snippets] of Object.entries(writers)) {
      const text = await readFile(resolve(repository, file), 'utf8');
      for (const snippet of snippets) expect(text, file).toContain(snippet);
    }
    // The v4 storage validator accepted the optional field, so the inventory checks it; the v5
    // snapshot has no link at all (plan, phase 2, step 5).
    expect(Object.keys(institutionalEventSnapshot.fields)).toContain('requirementId');
    for (const field of ['requirementId', 'activity'])
      expect(Object.keys(institutionalEventSnapshotV5.fields)).not.toContain(field);
  });

  test('reviews and review versions store criteria, not links', () => {
    expect(Object.keys(reviewEntry.fields).sort()).toEqual(['id', 'notes', 'reviewed', 'status']);
    expect(Object.keys(reviewFields)).not.toContain('requirementId');
  });

  test('domain-only fields of a date are absent from the local storage validator', () => {
    const fields = Object.keys(localEvent.fields);
    for (const field of ['days', 'originalStart', 'originalEnd'])
      expect(fields).not.toContain(field);
    expect(Object.keys(institutionalEventSnapshot.fields)).toEqual(
      expect.arrayContaining(['originalStart', 'originalEnd']),
    );
  });
});
