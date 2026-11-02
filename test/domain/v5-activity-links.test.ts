import { describe, expect, test } from 'vitest';
import { activityRef } from '../../src/domain/calendar/activities/activity-ref.ts';
import type { CalendarOffer } from '../../src/domain/calendar/model.ts';
import { stageInTerm, stagesPerTerm, stageTerm } from '../../src/domain/calendar/offers.ts';
import {
  BlockedConversionError,
  convertContentV5,
  convertLink,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import {
  classifyRequirementId,
  inventoryContent,
  inventorySubmission,
  matchDeclaration,
  UnknownShapeError,
  type Inventory,
  type LinkShape,
} from '../../src/domain/calendar/migration/inventory.ts';
import { convertedContent } from '../helpers/v5-conversion.ts';
import { readOracle, v4Cases, type V4Case } from '../helpers/v4-fixtures.ts';

/**
 * Conversion of `requirementId` to `ActivityRef` (plan `docs/plans/2026-11-02-atividades-e-datas.md`,
 * section 5.1; phase 2, step 9a): every link of the frozen v4 documents maps by its declaration
 * and repetition base, stage links read their position under the organisation of the state, and
 * an unknown or ambiguous link stops the conversion.
 */
const cases = v4Cases();
const oracle = readOracle<{ cases: { name: string; linksToReview: Record<string, string> }[] }>();
const reviewed = (item: V4Case) =>
  oracle.cases.find((entry) => entry.name === item.name)!.linksToReview;
const byName = (name: string) => cases.find((item) => item.name === name)!;
const copy = <T>(value: T): T => structuredClone(value);

/** Every inventory of a case: the content and each of its submissions. */
const inventories = (item: V4Case): Inventory[] => [
  inventoryContent(item.content, {
    year: item.year,
    submissions: item.submissions,
    linksToReview: reviewed(item),
  }),
  ...item.submissions.map((submission) =>
    inventorySubmission(submission, { year: item.year, linksToReview: reviewed(item) }),
  ),
];

/** Offers of the case in the current model, to read stage positions with domain functions. */
const currentOffers = (item: V4Case) =>
  convertedContent(item).state.offers as unknown as CalendarOffer[];

/** The position a stage link must have, from the domain's reading of the offer's stages. */
function expectedPosition(link: LinkShape, offers: readonly CalendarOffer[]) {
  const offer = offers.find((item) => item.id === link.offerId)!;
  const term = stageTerm(offer, link.ordinal!);
  if (term === undefined) return { status: 'unclassified', reportedOrdinal: link.ordinal };
  return {
    status: 'defined',
    term,
    number:
      offer.organization === 'semestral'
        ? stageInTerm(link.ordinal!, stagesPerTerm(offer)!).number
        : link.ordinal,
  };
}

function expectedRef(link: LinkShape, offers: readonly CalendarOffer[]) {
  switch (link.base) {
    case 'once':
      return { activityId: link.declaration };
    case 'cycle':
      return { activityId: link.declaration, term: link.term };
    case 'semester':
      return { activityId: link.declaration, semester: link.semester };
    case 'stage':
      return {
        activityId: link.declaration,
        offerId: link.offerId,
        position: expectedPosition(link, offers),
      };
  }
}

/** Adds dates linked to `requirementIds` to a frozen content, copying its first date. */
function withLinks(item: V4Case, requirementIds: string[]): V4Case {
  const changed = copy(item);
  const [model] = changed.content.state.events;
  changed.content.state.events.push(
    ...requirementIds.map((requirementId, index) => ({
      ...copy(model),
      id: `injected-${index}`,
      requirementId,
    })),
  );
  changed.submissions = [];
  return changed;
}

const linksOf = (item: V4Case) =>
  inventories(item).flatMap((inventory) => inventory.links.map(({ link }) => link));

describe('every link of the oracles converts to its ActivityRef', () => {
  test.each(cases.map((item) => [item.name, item] as const))('%s', (_name, item) => {
    const offers = currentOffers(item);
    for (const link of linksOf(item)) {
      const ref = convertLink(link);
      expect(ref, link.requirementId).toEqual(expectedRef(link, offers));
      // Valid for the current model, and the same when validated again.
      expect(activityRef(structuredClone(ref))).toEqual(ref);
    }
  });

  test('covers every link of contents and submissions, of every base and origin', () => {
    const links = cases.flatMap(linksOf);
    // Sum of the `event.requirementId:*` occurrences of the inventory table (plan, section 6).
    expect(links).toHaveLength(180);
    expect(new Set(links.map((link) => link.base))).toEqual(
      new Set(['once', 'cycle', 'semester', 'stage']),
    );
    expect(new Set(links.map((link) => link.origin))).toEqual(
      new Set(['consup-292-2027', 'legacy-operational', 'operational']),
    );
    expect(new Set(links.map((link) => link.position).filter(Boolean))).toEqual(
      new Set(['defined', 'unclassified', 'beyond-count', 'without-count']),
    );
  });

  test('the 21 audited dates keep their cycle, unclassified only by the organisation', () => {
    const drafts = ['Rascunho Ivaiporã (seção 11)', 'Rascunho Cascavel (seção 11)'];
    const refs = drafts.flatMap((name) =>
      inventories(byName(name))[0].links.map(({ link }) => [link.requirementId, convertLink(link)]),
    );
    expect(refs).toHaveLength(21);
    expect(refs).toContainEqual(['final-1', { activityId: 'final', term: 'first' }]);
    expect(refs).toContainEqual([
      'admission-notice-2',
      { activityId: 'admission-notice', term: 'second' },
    ]);
    for (const [, ref] of refs) expect(Object.keys(ref)).toEqual(['activityId', 'term']);
  });

  test('a semester declaration of 2027 converts to the reference semester, not to a cycle', () => {
    const links = cases.flatMap(linksOf);
    const ref = (id: string, origin: string) =>
      convertLink(links.find((link) => link.requirementId === id && link.origin === origin)!);
    expect(ref('teaching-plan-1', 'consup-292-2027')).toEqual({
      activityId: 'teaching-plan',
      semester: 'first',
    });
    expect(ref('teaching-plan-1', 'operational')).toEqual({
      activityId: 'teaching-plan',
      term: 'first',
    });
    expect(ref('enrolment-1', 'legacy-operational')).toEqual({
      activityId: 'enrolment',
      semester: 'first',
    });
  });
});

describe('stage activities beyond `stage` (results and councils)', () => {
  test('under an unclassified organisation keep the reported ordinal', () => {
    const links = linksOf(byName('Formas adicionais do inventário'));
    const ref = (id: string) => convertLink(links.find((link) => link.requirementId === id)!);
    expect(ref('results-2:integrado')).toEqual({
      activityId: 'results',
      offerId: 'integrado',
      position: { status: 'unclassified', reportedOrdinal: 2 },
    });
    expect(ref('council-1:graduacao')).toEqual({
      activityId: 'council',
      offerId: 'graduacao',
      position: { status: 'unclassified', reportedOrdinal: 1 },
    });
  });

  test('under a defined organisation read the cycle and number of the stage', () => {
    // Annual `integrado` (4 stages) and semester `graduacao-2` (2 per cycle); the frozen
    // fixtures have no defined result or council, so they are added to a copy.
    const item = withLinks(byName('Ofertas independentes com base institucional'), [
      'results-2:integrado',
      'council-3:graduacao-2',
      'council-2:graduacao-2',
    ]);
    const links = linksOf(item);
    const ref = (id: string) => convertLink(links.find((link) => link.requirementId === id)!);
    expect(ref('results-2:integrado')).toEqual({
      activityId: 'results',
      offerId: 'integrado',
      position: { status: 'defined', term: 'annual', number: 2 },
    });
    expect(ref('council-3:graduacao-2')).toEqual({
      activityId: 'council',
      offerId: 'graduacao-2',
      position: { status: 'defined', term: 'second', number: 1 },
    });
    expect(ref('council-2:graduacao-2')).toEqual({
      activityId: 'council',
      offerId: 'graduacao-2',
      position: { status: 'defined', term: 'first', number: 2 },
    });
    const offers = currentOffers(item);
    for (const link of links)
      expect(convertLink(link), link.requirementId).toEqual(expectedRef(link, offers));
  });

  test('above the count or without one keep the reported ordinal', () => {
    const links = linksOf(byName('Formas adicionais sem política configurada'));
    expect(convertLink(links.find((link) => link.position === 'beyond-count')!)).toEqual({
      activityId: 'stage',
      offerId: 'graduacao',
      position: { status: 'unclassified', reportedOrdinal: 5 },
    });
    expect(convertLink(links.find((link) => link.position === 'without-count')!)).toEqual({
      activityId: 'results',
      offerId: 'integrado',
      position: { status: 'unclassified', reportedOrdinal: 1 },
    });
  });
});

describe('an unknown or ambiguous link stops the conversion', () => {
  test.each([
    'family-meeting-1',
    'family-meeting-1:integrado',
    'stage-1',
    'stage-0:integrado',
    'final-3',
    'final',
    'rit-0',
    'pit-0',
    'retired-activity',
  ])('“%s” in a stored date', (requirementId) => {
    const item = withLinks(byName('v3 anual integrado, quatro etapas'), [requirementId]);
    expect(() => convertContentV5(item.content, { year: item.year, submissions: [] })).toThrow(
      UnknownShapeError,
    );
  });

  test('a forged link whose declaration its catalogue lacks in that base', () => {
    const link: LinkShape = {
      requirementId: 'retired-1',
      origin: 'operational',
      declaration: 'retired',
      base: 'cycle',
      term: 'first',
    };
    expect(() => convertLink(link, 'content.state.events[0].requirementId')).toThrow(
      UnknownShapeError,
    );
    const meeting: LinkShape = {
      requirementId: 'family-meeting-1:integrado',
      origin: 'operational',
      declaration: 'family-meeting',
      base: 'stage',
      ordinal: 1,
      offerId: 'integrado',
      position: 'unclassified',
    };
    expect(() => convertLink(meeting)).toThrow(UnknownShapeError);
    // `rit` is declared only by the 2027 policy.
    expect(() =>
      convertLink({ ...link, requirementId: 'rit-1', declaration: 'rit', base: 'semester' }),
    ).toThrow(UnknownShapeError);
  });

  test('an ID two bases of one catalogue could have produced', () => {
    const declarations = { once: [], cycle: ['report'], semester: ['report'], stage: [] };
    expect(() => matchDeclaration(declarations, 'report-1')).toThrow(UnknownShapeError);
    expect(() => matchDeclaration(declarations, 'report-1')).toThrow('vínculo ambíguo');
    expect(matchDeclaration(declarations, 'report-0')).toEqual({
      declaration: 'report',
      base: 'cycle',
      term: 'annual',
    });
  });

  test('a stage of an offer outside the calendar is blocking', () => {
    const link = classifyRequirementId('results-1:removida', 2027, [
      { id: 'integrado', organization: 'anual', stageCount: 4 },
    ]);
    expect(link.position).toBe('orphan-offer');
    expect(() => convertLink(link)).toThrow(BlockedConversionError);
  });
});
