import { describe, expect, test } from 'vitest';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import type { ActivityRef } from '../../src/domain/calendar/activities/activity-ref.ts';
import { offerCalendarContent } from '../../src/domain/calendar/normalization/normalize.ts';
import {
  applyOfferOrganization,
  organizationAwaitingSave,
  offerOrganizationDraft,
  offerOrganizationIssues,
  offerOrganizationWarnings,
  organizationDraftStages,
  type OfferOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { definedStage } from '../helpers/activity-links.ts';
import {
  stagePositionsToConfirm,
  type PendingLinksFixture,
} from '../fixtures/pending-links-2027.ts';

/**
 * Stage positions when the organization is confirmed: a position is never reinterpreted. Those the
 * organization has count, and those it lacks stay as recorded, under “Vínculo a conferir”, listed
 * in the preview.
 */
const save = (previous: PendingLinksFixture, proposed: PendingLinksFixture) =>
  prepareOfferCalendarSave(previous, proposed, {
    storedContent: offerCalendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });
const links = (state: { events: { id: string; activity?: ActivityRef }[] }) =>
  Object.fromEntries(state.events.map(({ id, activity }) => [id, activity]));

/** The integrated offer confirmed annual with three stages, its stage fields as the form fills them. */
function integratedAnnual(state: PendingLinksFixture): OfferOrganizationDraft {
  const draft = offerOrganizationDraft(state, 'integrado');
  draft.organization = 'anual';
  draft.count = '3';
  draft.stages = organizationDraftStages(state, 'integrado', draft);
  draft.periods[0] = {
    sourceId: 'integrado-period',
    name: 'Ano letivo',
    start: '2027-02-01',
    end: '2027-12-17',
  };
  return draft;
}

describe('informing the stages of an offer keeps every recorded position', () => {
  test('the positions it has count, a duplicate is flagged and the one beyond goes to review', () => {
    const state = stagePositionsToConfirm();
    const draft = integratedAnnual(state);
    // The form fills each position a recorded date holds: the first date, for a duplicate.
    expect(draft.stages.slice(0, 3).map((stage) => stage.id)).toEqual([
      'stage-one',
      'stage-two-a',
      '',
    ]);
    expect(offerOrganizationIssues(state, 'integrado', draft).map((item) => item.path)).toEqual([
      'stages[2]',
    ]);
    draft.stages[2] = { id: '', start: '2027-08-02', end: '2027-10-29' };
    expect(offerOrganizationIssues(state, 'integrado', draft)).toEqual([]);
    // The preview lists the dates that will not count, with their reason.
    expect(
      offerOrganizationWarnings(state, 'integrado', draft).map((item) => item.message),
    ).toEqual([
      '“Data sintética stage-two-a” ficará em Vínculo a conferir (Etapa duplicada).',
      '“Data sintética stage-two-b” ficará em Vínculo a conferir (Etapa duplicada).',
      '“Data sintética stage-four” ficará em Vínculo a conferir (Atividade não gerada).',
    ]);
    let sequence = 0;
    const configured = applyOfferOrganization(state, 'integrado', draft, () => `new-${++sequence}`);
    expect(links(configured)).toEqual({
      ...links(state),
      'new-1': definedStage('stage', 'integrado', 'annual', 3),
    });
    const saved = save(state, configured);
    expect(links(saved.state)).toEqual(links(configured));
    expect(Object.fromEntries(linksToReview(saved.state))).toEqual({
      'stage-two-a': 'duplicate-stage',
      'stage-two-b': 'duplicate-stage',
      'stage-four': 'not-generated',
      'sub-stage-4': 'not-generated',
    });
  });
});

describe('a defined position is never reinterpreted when the count changes', () => {
  const recount = (organization: 'anual' | 'semestral', count: string) => {
    const state = stagePositionsToConfirm();
    const draft = offerOrganizationDraft(state, 'subsequente');
    draft.organization = organization;
    draft.count = count;
    if (organization === 'semestral') {
      draft.periods[0] = { sourceId: '', name: '', start: '2027-02-01', end: '2027-07-09' };
      draft.periods[1] = { sourceId: '', name: '', start: '2027-07-26', end: '2027-12-17' };
    }
    draft.stages = organizationDraftStages(state, 'subsequente', draft);
    return { state, draft };
  };

  test('three to two annual stages: the third keeps its position and goes to review', () => {
    const { state, draft } = recount('anual', '2');
    expect(offerOrganizationWarnings(state, 'subsequente', draft).map((w) => w.message)).toEqual([
      '“Data sintética sub-stage-3” ficará em Vínculo a conferir (Atividade não gerada).',
      '“Data sintética sub-stage-4” ficará em Vínculo a conferir (Atividade não gerada).',
    ]);
    const configured = applyOfferOrganization(state, 'subsequente', draft, () => 'unused');
    expect(links(configured)).toEqual(links(state));
    expect(Object.fromEntries(linksToReview(save(state, configured).state))).toMatchObject({
      'sub-stage-3': 'not-generated',
      'sub-stage-4': 'not-generated',
    });
  });

  test('three to four annual stages: the recorded fourth position starts to count', () => {
    const { state, draft } = recount('anual', '4');
    expect(offerOrganizationWarnings(state, 'subsequente', draft)).toEqual([]);
    const configured = applyOfferOrganization(state, 'subsequente', draft, () => 'unused');
    expect(links(configured)).toEqual(links(state));
    const saved = save(state, configured).state;
    expect(saved.events).toHaveLength(state.events.length);
    expect(linksToReview(saved).has('sub-stage-4')).toBe(false);
  });

  test('annual to semester: the form leaves the new positions empty instead of the old ordinals', () => {
    const { state, draft } = recount('semestral', '2');
    expect(draft.stages.map((stage) => stage.id)).toEqual(['', '', '', '']);
    for (const [index, [start, end]] of [
      ['2027-02-01', '2027-04-30'],
      ['2027-05-03', '2027-07-09'],
      ['2027-07-26', '2027-10-29'],
      ['2027-11-01', '2027-12-17'],
    ].entries())
      draft.stages[index] = { id: '', start, end };
    expect(offerOrganizationIssues(state, 'subsequente', draft)).toEqual([]);
    let sequence = 0;
    const configured = applyOfferOrganization(
      state,
      'subsequente',
      draft,
      () => `new-${++sequence}`,
    );
    const stored = ['sub-stage-1', 'sub-stage-2', 'sub-stage-3', 'sub-stage-4'];
    for (const id of stored)
      expect(configured.events.find((event) => event.id === id)?.activity).toEqual(
        links(state)[id],
      );
    const review = linksToReview(save(state, configured).state);
    for (const id of stored) expect(review.get(id)).toBe('not-generated');
  });

  test('a save cannot put a recorded date on another position of the new organization', () => {
    const semester = recount('semestral', '2');
    semester.draft.stages = semester.draft.stages.map((stage, index) =>
      index < 4
        ? {
            id: '',
            start: ['2027-02-01', '2027-05-03', '2027-07-26', '2027-11-01'][index],
            end: ['2027-04-30', '2027-07-09', '2027-10-29', '2027-12-17'][index],
          }
        : stage,
    );
    let sequence = 0;
    const reorganized = applyOfferOrganization(
      semester.state,
      'subsequente',
      semester.draft,
      () => `unused-${++sequence}`,
    );
    const reinterpreted = {
      ...reorganized,
      events: reorganized.events
        .filter((event) => !event.id.startsWith('unused-'))
        .map((event) =>
          event.id === 'sub-stage-1'
            ? { ...event, activity: definedStage('stage', 'subsequente', 'first', 1) }
            : event,
        ),
    };
    expect(() => save(semester.state, reinterpreted)).toThrow('não perde nem troca');
  });
});

describe('two confirmations of the organization reach the server in one save', () => {
  /** The subsequent offer confirmed again, from `state`, with this organization and count. */
  const confirm = (
    state: PendingLinksFixture,
    organization: 'anual' | 'semestral',
    count: string,
  ) => {
    const draft = offerOrganizationDraft(state, 'subsequente');
    draft.organization = organization;
    draft.count = count;
    if (organization === 'semestral') {
      draft.periods[0] = { sourceId: '', name: '', start: '2027-02-01', end: '2027-07-09' };
      draft.periods[1] = { sourceId: '', name: '', start: '2027-07-26', end: '2027-12-17' };
    }
    draft.stages = organizationDraftStages(state, 'subsequente', draft);
    const dates = [
      ['2027-02-01', '2027-04-30'],
      ['2027-05-03', '2027-07-09'],
      ['2027-07-26', '2027-10-29'],
      ['2027-11-01', '2027-12-17'],
    ];
    draft.stages = draft.stages.map((stage, index) =>
      stage.id || !dates[index] ? stage : { id: '', start: dates[index][0], end: dates[index][1] },
    );
    let sequence = 0;
    return applyOfferOrganization(state, 'subsequente', draft, () => `new-${count}-${++sequence}`);
  };

  test.each([
    ['annual 4, then annual 3', 'anual', '3'],
    ['annual 4, then semester 2', 'semestral', '2'],
  ] as const)(
    '%s: the position the first brings to count is kept and saved',
    (_, organization, count) => {
      const state = stagePositionsToConfirm();
      const first = confirm(state, 'anual', '4');
      expect(links(first)['sub-stage-4']).toEqual(
        definedStage('stage', 'subsequente', 'annual', 4),
      );
      const second = confirm(first, organization, count);
      expect(links(second)['sub-stage-4']).toEqual(
        definedStage('stage', 'subsequente', 'annual', 4),
      );
      expect(links(save(state, second).state)['sub-stage-4']).toEqual(
        definedStage('stage', 'subsequente', 'annual', 4),
      );
    },
  );
});

describe('the editor waits for the save before confirming the organization again', () => {
  test('a stage date created by an unsaved confirmation would be a new link the second one lacks', () => {
    const state = stagePositionsToConfirm();
    const annual = integratedAnnual(state);
    annual.stages[2] = { id: '', start: '2027-08-02', end: '2027-10-29' };
    expect(organizationAwaitingSave(state, state, 'integrado', annual)).toBe(false);
    let sequence = 0;
    const first = applyOfferOrganization(state, 'integrado', annual, () => `a-${++sequence}`);
    const semester = offerOrganizationDraft(first, 'integrado');
    semester.organization = 'semestral';
    semester.count = '2';
    // Still unsaved: confirming another organization waits; the same one does not.
    expect(organizationAwaitingSave(state, first, 'integrado', semester)).toBe(true);
    expect(organizationAwaitingSave(state, first, 'integrado', annual)).toBe(false);
    // Once saved, the second confirmation is free again.
    const saved = save(state, first).state;
    expect(organizationAwaitingSave(saved, first, 'integrado', semester)).toBe(false);
    // Unrelated offers are not held back.
    expect(
      organizationAwaitingSave(state, first, 'subsequente', {
        organization: 'anual',
        count: '4',
      }),
    ).toBe(false);
    // Saved together, the new date for the third annual stage would be refused.
    semester.periods[0] = { sourceId: '', name: '', start: '2027-02-01', end: '2027-07-09' };
    semester.periods[1] = { sourceId: '', name: '', start: '2027-07-26', end: '2027-12-17' };
    semester.stages = organizationDraftStages(first, 'integrado', semester).map((stage, index) =>
      stage.id
        ? stage
        : {
            id: '',
            start: ['2027-02-01', '2027-05-03', '2027-07-26', '2027-10-01'][index],
            end: ['2027-04-30', '2027-07-09', '2027-09-30', '2027-12-17'][index],
          },
    );
    const second = applyOfferOrganization(first, 'integrado', semester, () => `s-${++sequence}`);
    expect(() => save(state, second)).toThrow('Vínculo de atividade inválido');
    expect(links(save(saved, second).state)['stage-one']).toEqual(
      definedStage('stage', 'integrado', 'annual', 1),
    );
  });
});
