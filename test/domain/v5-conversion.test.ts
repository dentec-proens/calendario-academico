import { describe, expect, test } from 'vitest';
import { eventCategory } from '../../src/domain/calendar/activities/categories.ts';
import {
  BlockedConversionError,
  convertCatalogueEventV5,
  convertContentV5,
  convertSnapshotV5,
  type Conversion,
  type ManifestEntry,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import { UnknownShapeError } from '../../src/domain/calendar/migration/inventory.ts';
import {
  formatFourCopyMessage,
  readCalendarOfferInput,
} from '../../src/domain/calendar/normalization/input-v4.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { noticeDestinationIssues } from '../../src/domain/calendar/activities/validation.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { contentAssessment } from '../../src/domain/calendar/readiness.ts';
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
  publicationStatus: _publication,
  admission: _admission,
  notice: _notice,
  ...rest
}: Json) => withoutEffect(rest);

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
            destinations:
              admission.periodId === undefined
                ? []
                : offers.map((offerId) => ({ offerId, periodId: admission.periodId })),
          },
        }),
  };
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
  stateOffers: readonly string[] = [],
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
    const notice = expectedNotice(stored, stateOffers);
    if (notice === undefined) expect(converted).not.toHaveProperty('notice');
    else expect(converted.notice).toEqual(notice);
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
    const { events: _before, schemaVersion: _from, ...state } = stored.state;
    const { events: _after, schemaVersion: _to, ...convertedState } = converted.state;
    expect(convertedState).toEqual(state);
    expect(converted.documentSnapshot).toEqual(stored.documentSnapshot);
    expect(converted.catalogueRevision).toBe(stored.catalogueRevision);
    expect(converted.calendarId).toBe(stored.calendarId);
    const [stateEntry, ...entries] = conversion.manifest;
    expect(stateEntry).toMatchObject({
      path: 'content.state',
      changes: [{ field: 'schemaVersion', before: 4, after: 5 }],
    });
    expect(stateEntry.forms).toContain('state.schemaVersion:4');
    const events = entries.filter((entry) => entry.path.startsWith('content.state.events'));
    const snapshot = entries.filter((entry) =>
      entry.path.startsWith('content.institutionalSnapshot'),
    );
    expect(events.length + snapshot.length).toBe(entries.length);
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
    const dates = cases.flatMap((item) => [
      ...convertContentV5(item.content, context(item))!.manifest.slice(1),
      ...item.submissions.flatMap((submission) =>
        convertContentV5(submission, { year: item.year, source: 'submission' })!.manifest.slice(1),
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
      .filter((event) => String(event.requirementId).startsWith('admission-notice'));
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
