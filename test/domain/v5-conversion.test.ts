import { describe, expect, test } from 'vitest';
import { eventCategory } from '../../src/domain/calendar/activities/categories.ts';
import {
  BlockedConversionError,
  convertCatalogueEventV5,
  convertLink,
  convertContentV5,
  convertSnapshotV5,
  type Conversion,
  type ManifestEntry,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import {
  inventoryContent,
  UnknownShapeError,
} from '../../src/domain/calendar/migration/inventory.ts';
import {
  formatFourCopyMessage,
  readCalendarOfferInput,
} from '../../src/domain/calendar/normalization/input.ts';
import { noticeDestinationIssues } from '../../src/domain/calendar/activities/validation.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { contentAssessment } from '../../src/domain/calendar/readiness.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { stageCount, stageTerm } from '../../src/domain/calendar/offers.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  offerOrganizationWarnings,
} from '../../src/domain/calendar/organization/offers.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { updateDate } from '../../src/domain/calendar/commands/events.ts';
import { convertedState } from '../helpers/v5-conversion.ts';
import { activityRef } from '../../src/domain/calendar/activities/activity-ref.ts';
import { definedStage, unclassifiedStage } from '../helpers/activity-links.ts';
import {
  readOracle,
  v4CatalogueRows,
  v4Cases,
  type V4Case,
  type V4CatalogueRow,
} from '../helpers/v4-fixtures.ts';

/**
 * Converter of phase 2 (step 5 of `docs/plans/2026-11-02-atividades-e-datas.md`): every frozen v4
 * document converts one to one, deterministically, and is never rewritten once in format 5; a
 * shape outside the inventory or a blocking one stops the conversion; the manifest recovers the
 * stored document.
 */
type Json = Record<string, unknown>;
const cases = v4Cases();
const rows = v4CatalogueRows();
const oracle = readOracle<{ cases: { name: string; linksToReview: Record<string, string> }[] }>();
const context = (item: V4Case) => ({
  year: item.year,
  submissions: item.submissions,
  linksToReview: oracle.cases.find((entry) => entry.name === item.name)!.linksToReview,
});
const copy = <T>(value: T): T => structuredClone(value);
const byName = (name: string) => cases.find((item) => item.name === name)!;

/** Fields other than the converted ones stay identical. */
const withoutEffect = ({ kind: _kind, recordType: _type, effect: _effect, ...rest }: Json) => rest;
const unchanged = ({
  requirementId: _link,
  activity: _activity,
  publicationStatus: _publication,
  admission: _admission,
  notice: _notice,
  offers: _offers,
  scope: _scope,
  ...rest
}: Json) => withoutEffect(rest);

/**
 * Scope expected for a stored v4 local date (plan, section 5.3): a non-empty list kept and
 * confirmed; an absent or empty one completed with the offers of its own state, unconfirmed.
 */
function expectedScope(stored: Json, stateOffers: readonly string[]) {
  const offers = stored.offers as string[] | undefined;
  return offers?.length
    ? { offers, confirmed: true }
    : { offers: [...stateOffers], confirmed: false };
}

/**
 * Notice expected for a stored v4 date (plan, section 5.4): publication and admission grouped,
 * the old period copied as the destination of each offer of the date (its own offers, or every
 * offer of the state when it has none), never confirmed nor dropped.
 */
function expectedNotice(stored: Json, stateOffers: readonly string[]) {
  const publication = stored.publicationStatus as string | undefined;
  const admission = stored.admission as (Json & { periodId?: string }) | undefined;
  if (publication === undefined && admission === undefined) return undefined;
  const offers = (stored.offers as string[] | undefined)?.length
    ? (stored.offers as string[])
    : stateOffers;
  return {
    ...(publication === undefined ? {} : { publication }),
    ...(admission === undefined
      ? {}
      : {
          admission: {
            type: admission.type,
            year: admission.year,
            term: admission.term,
            destinations: admission.periodId
              ? offers.map((offerId) => ({ offerId, periodId: admission.periodId }))
              : [],
          },
        }),
  };
}

/**
 * Offer expected for a stored v4 offer (plan, section 5.5): `legacyStageCount` becomes the reported
 * total and `stages: { perTerm }` the stages per cycle; every other field is kept.
 */
function expectedOffer(stored: Json) {
  const { legacyStageCount, stages, ...rest } = stored as Json & {
    legacyStageCount?: number;
    stages?: { perTerm: number };
  };
  if (legacyStageCount !== undefined)
    return { ...rest, stages: { status: 'reported', count: legacyStageCount } };
  return stages ? { ...rest, stages: { status: 'defined', perTerm: stages.perTerm } } : rest;
}

/** Applies the manifest backwards: each change restores the field as stored in v4. */
function revert<T>(conversion: Conversion<T>, root: string): unknown {
  const document = copy(conversion.document) as unknown;
  const at = (path: string) => {
    let target = document as Json | Json[];
    const steps = path.slice(root.length).match(/\.\w+|\[\d+\]/g) ?? [];
    for (const step of steps)
      target = (
        step.startsWith('[')
          ? (target as Json[])[Number(step.slice(1, -1))]
          : (target as Json)[step.slice(1)]
      ) as Json;
    return target as Json;
  };
  for (const entry of [...conversion.manifest].reverse()) {
    const target = at(entry.path);
    for (const change of [...entry.changes].reverse()) {
      if (change.before === undefined) delete target[change.field];
      else target[change.field] = change.before;
    }
  }
  return document;
}

function expectDatesConverted(
  before: Json[],
  after: Json[],
  manifest: ManifestEntry[],
  /** Offers of the local state; snapshot entries (without it) keep their own `offers`. */
  stateOffers?: readonly string[],
) {
  // One to one: nothing created, removed, merged or moved.
  expect(after.map((event) => event.id)).toEqual(before.map((event) => event.id));
  before.forEach((stored, index) => {
    const converted = after[index];
    expect(converted.effect).toBe(stored.kind);
    expect(converted).not.toHaveProperty('kind');
    expect(converted).not.toHaveProperty('recordType');
    expect(converted).not.toHaveProperty('publicationStatus');
    expect(converted).not.toHaveProperty('admission');
    const notice = expectedNotice(stored, stateOffers ?? []);
    if (notice === undefined) expect(converted).not.toHaveProperty('notice');
    else expect(converted.notice).toEqual(notice);
    // Step 9b: the stored link becomes `activity`, as `convertLink` maps the classified link.
    expect(converted).not.toHaveProperty('requirementId');
    if (stored.requirementId === undefined) expect(converted).not.toHaveProperty('activity');
    else {
      expect(manifest[index].link?.requirementId).toBe(stored.requirementId);
      expect(converted.activity).toEqual(convertLink(manifest[index].link!));
      expect(activityRef(converted.activity)).toEqual(converted.activity);
      expect(manifest[index].changes).toEqual(
        expect.arrayContaining([
          { field: 'requirementId', before: stored.requirementId },
          { field: 'activity', after: converted.activity },
        ]),
      );
    }
    if (stateOffers) {
      expect(converted.scope).toEqual(expectedScope(stored, stateOffers));
      expect(converted).not.toHaveProperty('offers');
    } else {
      expect(converted).not.toHaveProperty('scope');
      expect(converted.offers).toEqual(stored.offers);
    }
    expect(unchanged(converted)).toEqual(unchanged(stored));
  });
  expect(manifest.map((entry) => entry.id)).toEqual(before.map((event) => event.id));
}

describe('conversion of every frozen v4 document', () => {
  test.each(cases.map((item) => [item.name, item] as const))('content: %s', (_name, item) => {
    const stored = copy(item.content);
    const conversion = convertContentV5(item.content, context(item))!;
    const converted = conversion.document as unknown as typeof item.content;
    expect(item.content).toEqual(stored);
    expect(convertContentV5(item.content, context(item))).toEqual(conversion);
    expect(converted.state.schemaVersion).toBe(5);
    const { events: _before, schemaVersion: _from, offers: storedOffers, ...state } = stored.state;
    const {
      events: _after,
      schemaVersion: _to,
      offers: convertedOffers,
      ...convertedState
    } = converted.state;
    expect(convertedState).toEqual(state);
    expect(convertedOffers).toEqual(storedOffers.map(expectedOffer));
    for (const offer of convertedOffers) expect(offer).not.toHaveProperty('legacyStageCount');
    expect(converted.documentSnapshot).toEqual(stored.documentSnapshot);
    expect(converted.catalogueRevision).toBe(stored.catalogueRevision);
    expect(converted.calendarId).toBe(stored.calendarId);
    const [stateEntry, ...entries] = conversion.manifest;
    expect(stateEntry).toMatchObject({
      path: 'content.state',
      changes: [{ field: 'schemaVersion', before: 4, after: 5 }],
    });
    expect(stateEntry.forms).toContain('state.schemaVersion:4');
    const offers = entries.filter((entry) => entry.path.startsWith('content.state.offers'));
    const events = entries.filter((entry) => entry.path.startsWith('content.state.events'));
    const snapshot = entries.filter((entry) =>
      entry.path.startsWith('content.institutionalSnapshot'),
    );
    expect(offers.length + events.length + snapshot.length).toBe(entries.length);
    // Only offers with stages or a reported total change, each recorded once.
    expect(offers.map((entry) => entry.id)).toEqual(
      storedOffers
        .filter((offer) => offer.stages !== undefined || offer.legacyStageCount !== undefined)
        .map((offer) => String(offer.id)),
    );
    expectDatesConverted(
      stored.state.events,
      converted.state.events,
      events,
      stored.state.offers.map((offer) => String(offer.id)),
    );
    expectDatesConverted(stored.institutionalSnapshot, converted.institutionalSnapshot, snapshot);
    stored.state.events.forEach((event, index) => {
      expect(events[index].forms).toContain(`event.kind:${String(event.kind)}`);
      expect(events[index].link?.requirementId).toBe(event.requirementId);
    });
    expect(revert(conversion, 'content')).toEqual(stored);
    // Idempotent: a converted document is never rewritten.
    expect(convertContentV5(converted, context(item))).toBeNull();
  });

  test.each(
    cases.flatMap((item) =>
      item.submissions.map(
        (submission) => [item.name, submission.sequence, item, submission] as const,
      ),
    ),
  )('submission: %s #%i', (_name, _sequence, item, submission) => {
    const stored = copy(submission);
    const conversion = convertContentV5(submission, { year: item.year, source: 'submission' })!;
    const converted = conversion.document as typeof submission;
    expect(converted.state.schemaVersion).toBe(5);
    expect(conversion.manifest[0].path).toBe('submission.state');
    expectDatesConverted(
      stored.state.events,
      converted.state.events,
      conversion.manifest.filter((entry) => entry.path.startsWith('submission.state.events')),
      stored.state.offers.map((offer) => String(offer.id)),
    );
    // The stored hash is kept here; the migration recalculates it in the same write (step 17b).
    expect(converted.contentHash).toBe(stored.contentHash);
    expect(revert(conversion, 'submission')).toEqual(stored);
    expect(convertContentV5(converted, { year: item.year, source: 'submission' })).toBeNull();
  });

  test.each(rows.map((row) => [row.code, row] as const))('catalogue row: %s', (_code, row) => {
    const stored = copy(row);
    const conversion = convertCatalogueEventV5(row)!;
    const converted = conversion.document as V4CatalogueRow;
    expect(converted.effect).toBe(stored.kind);
    expect(converted).not.toHaveProperty('kind');
    expect(withoutEffect(converted)).toEqual(withoutEffect(stored));
    expect(conversion.manifest).toEqual([
      {
        path: 'institutionalEvent',
        id: row.code,
        forms: [`catalogue.kind:${String(row.kind)}`, `catalogue.active:${String(row.active)}`],
        changes: [
          { field: 'kind', before: row.kind },
          { field: 'effect', after: row.kind },
        ],
      },
    ]);
    expect(revert(conversion, 'institutionalEvent')).toEqual(stored);
    expect(convertCatalogueEventV5(converted)).toBeNull();
  });

  test('a snapshot converts on its own as inside its content', () => {
    const withSnapshot = cases.filter((item) => item.content.institutionalSnapshot.length);
    expect(withSnapshot.length).toBeGreaterThan(0);
    for (const item of withSnapshot) {
      const alone = convertSnapshotV5(item.content.institutionalSnapshot)!;
      const content = convertContentV5(item.content, context(item))!;
      expect(alone.document).toEqual(
        (content.document as unknown as typeof item.content).institutionalSnapshot,
      );
      expect(convertSnapshotV5(alone.document)).toBeNull();
    }
    expect(convertSnapshotV5([])).toBeNull();
  });

  test('every date and catalogue row of the oracles is converted exactly once', () => {
    const isDate = (entry: ManifestEntry) => !/^\w+\.state(\.offers|$)/.test(entry.path);
    const dates = cases.flatMap((item) => [
      ...convertContentV5(item.content, context(item))!.manifest.filter(isDate),
      ...item.submissions.flatMap((submission) =>
        convertContentV5(submission, { year: item.year, source: 'submission' })!.manifest.filter(
          isDate,
        ),
      ),
    ]);
    const stored = cases.flatMap((item) =>
      [item.content, ...item.submissions].flatMap(
        (content) => content.state.events.length + content.institutionalSnapshot.length,
      ),
    );
    expect(dates).toHaveLength(stored.reduce((total, count) => total + count, 0));
    expect(rows.map((row) => convertCatalogueEventV5(row)!.manifest)).toHaveLength(rows.length);
  });
});

describe('the conversion refuses what the inventory does not know', () => {
  const base = byName('Formas adicionais do inventário');
  const event = (content: V4Case['content'], id: string) =>
    content.state.events.find((item) => item.id === id)!;
  const snapshotEvent = {
    id: 'inst:linked',
    name: 'Snapshot com vínculo',
    start: '2027-03-01',
    end: '2027-03-01',
    kind: 'note',
    evidence: '',
  };

  test.each<[string, (content: V4Case['content']) => void]>([
    ['unknown event field', (c) => void (event(c, 'forms-pit').internal = true)],
    ['effect beside kind', (c) => void (event(c, 'forms-pit').effect = 'note')],
    ['schema version 3', (c) => void (c.state.schemaVersion = 3)],
    ['undeclared link', (c) => void (event(c, 'forms-pit').requirementId = 'pit-3')],
    [
      'reported total beside stages per cycle',
      (c) => void Object.assign(c.state.offers[0], { stages: { perTerm: 2 }, legacyStageCount: 3 }),
    ],
    [
      'stages already in format 5',
      (c) => void (c.state.offers[0].stages = { status: 'defined', perTerm: 2 }),
    ],
    [
      'reported total in format 5',
      (c) => void (c.state.offers[0].stages = { status: 'reported', count: 3 }),
    ],
    [
      'snapshot with activity',
      (c) => void c.institutionalSnapshot.push({ ...snapshotEvent, activity: {} }),
    ],
  ])('%s', (_name, inject) => {
    const content = copy(base.content);
    expect(convertContentV5(content, { year: base.year })).not.toBeNull();
    inject(content);
    expect(() => convertContentV5(content, { year: base.year })).toThrow(UnknownShapeError);
  });

  test.each<[string, (content: V4Case['content']) => void]>([
    [
      'snapshot with requirementId',
      (c) => void c.institutionalSnapshot.push({ ...snapshotEvent, requirementId: 'final-0' }),
    ],
    ['date offer outside the calendar', (c) => void (event(c, 'forms-pit').offers = ['removida'])],
    [
      'stage of an offer outside the calendar',
      (c) => void (event(c, 'forms-stage').requirementId = 'stage-3:removida'),
    ],
    [
      'snapshot with an admission destination',
      (c) =>
        void c.institutionalSnapshot.push({
          ...snapshotEvent,
          publicationStatus: 'planned',
          admission: { type: 'transfer', year: 2027, term: 'annual', periodId: 'year' },
        }),
    ],
  ])('blocking shape: %s', (_name, inject) => {
    const content = copy(base.content);
    inject(content);
    expect(() => convertContentV5(content, { year: base.year })).toThrow(BlockedConversionError);
  });

  test('a format 5 state beside a format 4 base is refused, never kept as converted', () => {
    const item = cases.find((entry) => entry.content.institutionalSnapshot.length)!;
    const converted = convertContentV5(item.content, context(item))!.document as Json & {
      institutionalSnapshot: Json[];
    };
    expect(convertContentV5(converted, context(item))).toBeNull();
    const mixed = { ...converted, institutionalSnapshot: item.content.institutionalSnapshot };
    expect(() => convertContentV5(mixed, context(item))).toThrow(UnknownShapeError);
    const partly = {
      ...converted,
      institutionalSnapshot: [
        ...converted.institutionalSnapshot.slice(1),
        item.content.institutionalSnapshot[0],
      ],
    };
    expect(() => convertContentV5(partly, context(item))).toThrow(UnknownShapeError);
    const empty = { ...converted, institutionalSnapshot: [] };
    expect(convertContentV5(empty, context(item))).toBeNull();
  });

  test('a standalone snapshot and a catalogue row are refused the same way', () => {
    expect(() => convertSnapshotV5([{ ...snapshotEvent, requirementId: 'final-0' }])).toThrow(
      BlockedConversionError,
    );
    expect(() => convertSnapshotV5([{ ...snapshotEvent, activity: {} }])).toThrow(
      UnknownShapeError,
    );
    const [first] = convertSnapshotV5([snapshotEvent])!.document;
    expect(() => convertSnapshotV5([first, snapshotEvent])).toThrow(UnknownShapeError);
    const [row] = rows;
    expect(() => convertCatalogueEventV5({ ...row, kind: 'shift' })).toThrow(UnknownShapeError);
    expect(() => convertCatalogueEventV5({ ...row, requirementId: 'final-1' })).toThrow(
      UnknownShapeError,
    );
    expect(() => convertCatalogueEventV5({ ...row, effect: row.kind })).toThrow(UnknownShapeError);
  });
});

describe('dates without category keep their effective category', () => {
  /** `eventCategory()` of the v4 code (commit 43aff30), reading the stored `kind`. */
  const v4Category = (event: Json) =>
    event.kind === 'include' ? 'sabado' : event.kind === 'exclude' ? 'recesso' : 'institucional';

  test('before and after `kind` → `effect`, on every frozen date without category', () => {
    let notes = 0;
    for (const item of cases) {
      const converted = convertContentV5(item.content, context(item))!
        .document as unknown as V4Case['content'];
      converted.state.events.forEach((event, index) => {
        const stored = item.content.state.events[index];
        if (stored.category !== undefined) return;
        expect(eventCategory(event as { effect?: string }), String(stored.id)).toBe(
          v4Category(stored),
        );
        if (stored.kind === 'note') notes++;
      });
    }
    // Every note without category resolves to `institucional`, as before.
    expect(notes).toBeGreaterThan(0);
  });

  test('after exporting and importing the JSON copy', () => {
    const item = byName('v3 anual integrado, quatro etapas');
    const converted = convertContentV5(item.content, context(item))!
      .document as unknown as V4Case['content'];
    const applied = { ...converted.state, year: item.year, campus: item.campus };
    const exported = JSON.parse(JSON.stringify(applied, null, 2)) as unknown;
    const read = readCalendarOfferInput(exported);
    const implicit = read.events.find((event) => event.id === 'implicit-note')!;
    expect(implicit).toMatchObject({ effect: 'note' });
    expect(implicit.category).toBeUndefined();
    expect(eventCategory(implicit)).toBe('institucional');
    const imported = normalizeOfferCalendar(exported, read);
    expect(imported.events.find((event) => event.id === 'implicit-note')!.category).toBe(
      'institucional',
    );
  });

  test('a converted note without category may be marked internal (art. 18), also after a JSON copy', () => {
    const item = byName('v3 anual integrado, quatro etapas');
    const converted = convertContentV5(item.content, context(item))!
      .document as unknown as V4Case['content'];
    const state = {
      ...converted.state,
      year: item.year,
      campus: item.campus,
    } as unknown as Parameters<typeof updateDate>[0];
    const implicit = state.events.find((event) => event.id === 'implicit-note')!;
    expect(implicit.category).toBeUndefined();
    const marked = updateDate(
      state,
      { ...implicit, internal: true } as Parameters<typeof updateDate>[1],
      [],
    );
    const exported = JSON.parse(JSON.stringify(marked, null, 2)) as unknown;
    const imported = normalizeOfferCalendar(exported, readCalendarOfferInput(exported));
    expect(imported.events.find((event) => event.id === 'implicit-note')).toMatchObject({
      internal: true,
      category: 'institucional',
    });
  });

  test('the conversion never creates `internal`: every converted date is official', () => {
    for (const item of cases)
      for (const content of [item.content, ...item.submissions]) {
        const document = convertContentV5(
          content,
          content === item.content ? context(item) : { year: item.year, source: 'submission' },
        )!.document as unknown as V4Case['content'];
        for (const event of [...document.state.events, ...document.institutionalSnapshot])
          expect(event, `${item.name}: ${String(event.id)}`).not.toHaveProperty('internal');
      }
  });

  test('a format 4 copy is refused with its own message, never converted', () => {
    const item = byName('v3 anual integrado, quatro etapas');
    const copy4 = { ...item.content.state, year: item.year, campus: item.campus };
    expect(() => readCalendarOfferInput(copy4)).toThrow(formatFourCopyMessage);
    expect(() => normalizeOfferCalendar(copy4)).toThrow(formatFourCopyMessage);
    expect(() => readCalendarOfferInput({ ...copy4, schemaVersion: 3 })).toThrow(
      'Use uma cópia de formato 5.',
    );
  });
});

describe('notice and destination by offer (plan, section 5.4; phase 2, step 6)', () => {
  const converted = (item: V4Case) =>
    convertContentV5(item.content, context(item))!.document as unknown as V4Case['content'];
  const dates = (item: V4Case) =>
    [item.content, ...item.submissions].flatMap((content, index) =>
      (
        (index
          ? convertContentV5(content, { year: item.year, source: 'submission' })!.document
          : converted(item)) as unknown as V4Case['content']
      ).state.events.map((event) => event as Json),
    );
  const forms = byName('Formas adicionais do inventário');
  const state = (item: V4Case) =>
    ({ ...converted(item).state, year: item.year }) as unknown as ActivityState;

  test('the four notices of section 11 keep the absence of admission and publication', () => {
    const audited = cases.filter((item) => item.name.endsWith('(seção 11)'));
    const notices = audited
      .flatMap(dates)
      .filter(
        (event) => (event.activity as { activityId?: string })?.activityId === 'admission-notice',
      );
    expect(new Set(notices.map((event) => event.id))).toEqual(
      new Set([
        'ivaipora-admission-notice-1',
        'ivaipora-admission-notice-2',
        'cascavel-admission-notice-1',
        'cascavel-admission-notice-2',
      ]),
    );
    for (const event of notices) {
      expect(event).not.toHaveProperty('notice');
      expect(event).not.toHaveProperty('publicationStatus');
      expect(event).not.toHaveProperty('admission');
    }
    // Without destination there is nothing to diagnose; the pending purpose stays under
    // “Vínculo a conferir” and in the coverage, as the oracle records.
    for (const item of audited) expect(noticeDestinationIssuesOf(state(item))).toEqual([]);
  });

  test('an orphan destination is copied, kept and diagnosed for its offer, never dropped', () => {
    const event = converted(forms).state.events.find((item) => item.id === 'forms-notice-orphan')!;
    expect(event.notice).toEqual({
      publication: 'planned',
      admission: {
        type: 'transfer',
        year: 2027,
        term: 'second',
        destinations: [{ offerId: 'graduacao', periodId: 'removed-period' }],
      },
    });
    expect(noticeDestinationIssuesOf(state(forms))).toEqual([
      {
        eventId: 'forms-notice-orphan',
        offerId: 'graduacao',
        periodId: 'removed-period',
        problem: 'orphan',
      },
    ]);
    const { warnings } = contentAssessment({ state: state(forms), institutionalSnapshot: [] });
    expect(warnings.filter((warning) => warning.includes('período de destino'))).toHaveLength(1);
  });

  test('a notice without period keeps its destinations empty, not informed', () => {
    const event = converted(forms).state.events.find(
      (item) => item.id === 'forms-notice-published',
    )!;
    expect(event.notice).toEqual({
      publication: 'published',
      admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
    });
  });

  test('an empty v4 period stays not informed: no destination, and the calendar still saves', () => {
    // Format 4 accepted `periodId: ''` in storage and in the JSON copy and read it as not informed
    // (`a.periodId && …`, `admission.periodId ? … : undefined`), never as an orphan period.
    const item = byName('Vínculos em conflito (fase 1)');
    const content = copy(item.content);
    const stored = content.state.events.find((event) => event.id === 'transfer-notice')!;
    (stored.admission as { periodId?: string }).periodId = '';
    expect(
      inventoryContent(content, context(item))
        .occurrences.filter(({ path }) =>
          path.endsWith(`[${content.state.events.indexOf(stored)}]`),
        )
        .map(({ form }) => form)
        .filter((form) => form.startsWith('event.admission:')),
    ).toEqual(['event.admission:without-period']);
    const conversion = convertContentV5(content, context(item))!;
    const document = conversion.document as unknown as V4Case['content'];
    const event = document.state.events.find((entry) => entry.id === 'transfer-notice')!;
    expect((event.notice as { admission: Json }).admission.destinations).toEqual([]);
    // The manifest keeps the stored empty period, so the change is recorded and reversible.
    expect(revert(conversion, 'content')).toEqual(content);
    const converted = { ...document.state, year: item.year, campus: item.campus };
    expect(noticeDestinationIssuesOf(converted as unknown as ActivityState)).toEqual([]);
    // Any later save runs the save validation on every date, the notice included.
    expect(() =>
      normalizeOfferCalendar(converted, readCalendarOfferInput(converted)),
    ).not.toThrow();
  });

  test('the period of a date is copied for each of its offers, or every offer of a date without offers', () => {
    const conflicting = byName('Vínculos em conflito (fase 1)');
    const notice = converted(conflicting).state.events.find(
      (item) => item.id === 'transfer-notice',
    )!;
    expect((notice.notice as { admission: Json }).admission.destinations).toEqual([
      { offerId: 'integrado', periodId: 'year' },
      { offerId: 'subsequente', periodId: 'year' },
    ]);
    const content = copy(conflicting.content);
    delete content.state.events.find((item) => item.id === 'transfer-notice')!.offers;
    const all = (
      convertContentV5(content, { year: conflicting.year })!
        .document as unknown as V4Case['content']
    ).state.events.find((item) => item.id === 'transfer-notice')!;
    expect((all.notice as { admission: Json }).admission.destinations).toEqual(
      content.state.offers.map((offer) => ({ offerId: offer.id, periodId: 'year' })),
    );
  });
});

describe('reported stages (plan, section 5.5; phase 2, step 8)', () => {
  const asState = (item: V4Case, content = item.content) =>
    ({
      ...(convertContentV5(content, context(item))!.document as unknown as V4Case['content']).state,
      year: item.year,
      campus: item.campus,
    }) as unknown as ActivityState;

  test.each([2, 3, 4])(
    'a total of %i kept without cycle becomes reported, recorded in the manifest',
    (count) => {
      const item = byName(`Quantidade anterior de ${count} etapas`);
      const conversion = convertContentV5(item.content, context(item))!;
      const [offer] = (conversion.document as unknown as V4Case['content']).state.offers;
      expect(offer).toEqual({
        id: 'integrado',
        kind: 'integrado',
        delivery: 'a-conferir',
        organization: 'a-classificar',
        stages: { status: 'reported', count },
      });
      expect(conversion.manifest.find((entry) => entry.path === 'content.state.offers[0]')).toEqual(
        {
          path: 'content.state.offers[0]',
          id: 'integrado',
          forms: [
            'offer.organization:a-classificar',
            'offer.stages:absent',
            `offer.legacyStageCount:${count}`,
          ],
          changes: [
            { field: 'legacyStageCount', before: count },
            { field: 'stages', after: { status: 'reported', count } },
          ],
        },
      );
      expect(revert(conversion, 'content')).toEqual(item.content);
      // The domain reads the same total, still without a cycle, and an unrelated save keeps it.
      const state = asState(item);
      expect(stageCount(state.offers[0])).toBe(count);
      expect(stageTerm(state.offers[0], 1)).toBeUndefined();
      const stored = state as unknown as Parameters<typeof prepareOfferCalendarSave>[0];
      const saved = prepareOfferCalendarSave(stored, stored, {
        storedContent: offerCalendarContent(stored),
        catalogue: { events: [] },
        recalculate: false,
      });
      expect(saved.content.offers).toEqual(state.offers);
    },
  );

  test('stages per cycle become defined, with the same total and cycle of every stage', () => {
    let checked = 0;
    for (const item of cases) {
      const state = asState(item);
      item.content.state.offers.forEach((stored, index) => {
        const offer = state.offers[index];
        const perTerm = (stored.stages as { perTerm?: number } | undefined)?.perTerm;
        if (perTerm === undefined) return;
        checked++;
        expect(offer.stages).toEqual({ status: 'defined', perTerm });
        const total =
          stored.organization === 'semestral'
            ? perTerm * 2
            : stored.organization === 'anual'
              ? perTerm
              : 0;
        expect(stageCount(offer), `${item.name} ${offer.id}`).toBe(total);
        for (let n = 1; n <= total; n++)
          expect(stageTerm(offer, n)).toBe(
            stored.organization === 'anual' ? 'annual' : n <= perTerm ? 'first' : 'second',
          );
      });
    }
    expect(checked).toBeGreaterThan(30);
  });

  test('confirming the organization resolves count and cycles; stage links keep their ordinal', () => {
    const item = byName('Quantidade anterior de 3 etapas');
    const content = copy(item.content);
    content.state.events = [1, 2, 3].map((n) => ({
      id: `old-${n}`,
      name: `${n}ª etapa preservada`,
      start: `2027-0${n + 1}-02`,
      end: `2027-0${n + 1}-12`,
      kind: 'note',
      category: 'limite',
      requirementId: `stage-${n}:integrado`,
      offers: ['integrado'],
    }));
    const state = convertedState({ ...content.state, year: item.year, campus: item.campus });
    const converted = state as unknown as ActivityState;
    expect(converted.events.map((event) => event.activity)).toEqual(
      [1, 2, 3].map((n) => unclassifiedStage('stage', 'integrado', n)),
    );
    // The reported total still generates its stage rows, so no link waits for review (phase 1).
    expect(Object.fromEntries(linksToReview(converted))).toEqual({});
    const draft = offerOrganizationDraft(converted, 'integrado');
    expect(draft.count).toBe('');
    expect(draft.stages.slice(0, 3).map((stage) => stage.id)).toEqual(['old-1', 'old-2', 'old-3']);
    draft.organization = 'anual';
    draft.count = '2';
    draft.periods[0] = { sourceId: '', name: 'Ano', start: '2027-02-01', end: '2027-12-17' };
    draft.stages[0] = { id: 'old-1', start: '2027-02-01', end: '2027-07-09' };
    draft.stages[1] = { id: 'old-2', start: '2027-07-26', end: '2027-12-17' };
    // The preview names the surplus stage, which keeps its link to review.
    expect(offerOrganizationWarnings(converted, 'integrado', draft)).toEqual([
      {
        path: 'organization',
        message: '“3ª etapa preservada” ficará em Vínculo a conferir (Classificação pendente).',
      },
    ]);
    let sequence = 0;
    const configured = applyOfferOrganization(
      converted,
      'integrado',
      draft,
      () => `configured-${++sequence}`,
    );
    expect(configured.offers[0]).toMatchObject({
      organization: 'anual',
      stages: { status: 'defined', perTerm: 2 },
    });
    // Confirmed stages take their position in the new cycle by the reported ordinal, as the v4
    // `stage-N` did; the surplus one keeps its reported ordinal (step 9e decides reinterpretation).
    expect(configured.events.map((event) => [event.id, event.activity])).toEqual([
      ['old-1', definedStage('stage', 'integrado', 'annual', 1)],
      ['old-2', definedStage('stage', 'integrado', 'annual', 2)],
      ['old-3', unclassifiedStage('stage', 'integrado', 3)],
    ]);
    expect(configured.events[2]).toEqual(converted.events[2]);
    expect(Object.fromEntries(linksToReview(configured))).toEqual({ 'old-3': 'unclassified' });
  });
});

function noticeDestinationIssuesOf(state: ActivityState) {
  return state.events.flatMap((event) =>
    noticeDestinationIssues(state, event).map(({ offerId, periodId, problem }) => ({
      eventId: event.id,
      offerId,
      periodId,
      problem,
    })),
  );
}
