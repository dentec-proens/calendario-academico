import { describe, expect, test } from 'vitest';
import {
  activityChangeOptions,
  changeActivity,
  previewActivityChange,
} from '../../src/domain/calendar/commands/events.ts';
import { activityKey } from '../../src/domain/calendar/activities/activity-ref.ts';
import { linksToReview, validateLinks } from '../../src/domain/calendar/activities/links.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { offerCalendarContent } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { cycleLink, definedStage, onceLink } from '../helpers/activity-links.ts';
import {
  conflictingLinks,
  ivaiporaAnnual,
  ivaiporaDraft,
  type PendingLinksFixture,
} from '../fixtures/pending-links-2027.ts';

/**
 * `changeActivity` (**Corrigir atividade vinculada**, plan section 4.6; phase 2, step 13): the
 * link of the whole date is corrected after a preview; nothing else of the date changes, the new
 * activity is generated and covers every offer of the date, and a link is never removed.
 */
const save = (previous: PendingLinksFixture, proposed: PendingLinksFixture) =>
  prepareOfferCalendarSave(previous, proposed, {
    storedContent: offerCalendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });

const withoutLink = <T extends { activity?: unknown }>({ activity: _activity, ...rest }: T) => rest;
const date = (state: PendingLinksFixture, id: string) =>
  state.events.find((event) => event.id === id)!;

const annualFinal = cycleLink('final', 'annual');

describe('preview and command', () => {
  test('the preview shows the date unchanged, both links and that the date will count', () => {
    const state = ivaiporaAnnual();
    const before = structuredClone(state);
    const preview = previewActivityChange(state, 'ivaipora-final-1', annualFinal, []);
    expect(state).toEqual(before);
    expect(preview).toEqual({
      date: date(state, 'ivaipora-final-1'),
      from: { activity: cycleLink('final', 'first'), name: undefined, issue: 'unclassified' },
      to: {
        activity: annualFinal,
        name: expect.stringContaining('Prazo de lançamento do resultado final'),
      },
      issueAfter: undefined,
    });
  });

  test('only the link of the whole date changes; the date leaves review and counts', () => {
    const state = ivaiporaAnnual();
    const corrected = changeActivity(state, 'ivaipora-final-1', annualFinal, []);
    expect(corrected.events.map((event) => event.id)).toEqual(
      state.events.map((event) => event.id),
    );
    const after = date(corrected, 'ivaipora-final-1');
    expect(after.activity).toEqual(annualFinal);
    expect(withoutLink(after)).toEqual(withoutLink(date(state, 'ivaipora-final-1')));
    for (const event of state.events)
      if (event.id !== 'ivaipora-final-1') expect(date(corrected, event.id)).toEqual(event);
    expect(linksToReview(corrected).has('ivaipora-final-1')).toBe(false);
    expect(linksToReview(corrected).size).toBe(linksToReview(state).size - 1);
    const rows = evaluatePlan(corrected).rows.filter(
      (row) => activityKey(row.requirement.activity) === activityKey(annualFinal),
    );
    expect(rows.map((row) => row.offerId).sort()).toEqual(['integrado', 'subsequente']);
    for (const row of rows) {
      expect(row.events.map((event) => event.id)).toEqual(['ivaipora-final-1']);
      expect(row.coverage).toBe('complete');
    }
  });

  test('options list generated activities covering every offer, the same declaration first', () => {
    const state = ivaiporaAnnual();
    const options = activityChangeOptions(state, 'ivaipora-diary-2').map((row) =>
      activityKey(row.activity),
    );
    expect(options[0]).toBe('diary:cycle:annual');
    expect(options).toContain('final:cycle:annual');
    expect(options).not.toContain('diary:cycle:second');
    // A stage row reaches one offer only; the date has two.
    expect(options.some((key) => key.includes(':stage:'))).toBe(false);
    expect(activityChangeOptions(state, 'ivaipora-annual-final')).toEqual([]);
  });

  test('the command and the preview refuse what is not a correction of the link', () => {
    const state = ivaiporaAnnual();
    const refuses = (
      id: string,
      activity: Parameters<typeof changeActivity>[2],
      message: string,
    ) => {
      expect(() => changeActivity(state, id, activity, [])).toThrow(message);
      expect(() => previewActivityChange(state, id, activity, [])).toThrow(message);
    };
    refuses('missing', annualFinal, 'A data não existe mais');
    refuses('ivaipora-annual-final', annualFinal, 'Uma data do campus não passa a ter');
    refuses('ivaipora-final-1', undefined, 'não remove o vínculo');
    refuses('ivaipora-final-1', cycleLink('final', 'first'), 'já está vinculada');
    refuses('ivaipora-final-1', cycleLink('diary', 'second'), 'Atividade inválida');
    refuses(
      'ivaipora-final-1',
      definedStage('stage', 'integrado', 'annual', 1),
      'não abrange todas as ofertas',
    );
  });

  test('a date that already counts for its activity is not corrected', () => {
    const corrected = changeActivity(ivaiporaAnnual(), 'ivaipora-final-1', annualFinal, []);
    expect(() =>
      changeActivity(corrected, 'ivaipora-final-1', cycleLink('diary', 'annual'), []),
    ).toThrow('Só uma data em Vínculo a conferir');
    expect(activityChangeOptions(corrected, 'ivaipora-final-1')).toEqual([]);
  });

  test('a cycle generated for one offer only does not cover a date of two offers', () => {
    let state = ivaiporaDraft();
    const draft = offerOrganizationDraft(state, 'integrado');
    draft.organization = 'anual';
    draft.count = '2';
    draft.periods[0] = {
      sourceId: '',
      name: 'Ano letivo',
      start: civilDate('2027-02-01'),
      end: civilDate('2027-12-17'),
    };
    draft.stages[0] = { id: '', start: civilDate('2027-02-01'), end: civilDate('2027-06-30') };
    draft.stages[1] = { id: '', start: civilDate('2027-07-26'), end: civilDate('2027-12-17') };
    let sequence = 0;
    state = applyOfferOrganization(state, 'integrado', draft, () => `annual-${++sequence}`);
    expect(() => changeActivity(state, 'ivaipora-final-1', annualFinal, [])).toThrow(
      'Ajuste as ofertas da data antes de corrigir o vínculo',
    );
    expect(
      activityChangeOptions(state, 'ivaipora-final-1').map((row) => row.activity),
    ).not.toContainEqual(annualFinal);
  });

  test('a stage correction passes the checks of an edited stage', () => {
    const state = conflictingLinks();
    expect(linksToReview(state).get('stage-twice-b')).toBe('duplicate-stage');
    expect(() =>
      changeActivity(state, 'stage-twice-b', definedStage('stage', 'integrado', 'annual', 1), []),
    ).toThrow('nenhuma outra data a ocupa');
    // A notice keeps its admission data and destinations when its link is corrected.
    const corrected = changeActivity(
      state,
      'transfer-notice',
      cycleLink('admission-notice', 'annual'),
      [],
    );
    expect(withoutLink(date(corrected, 'transfer-notice'))).toEqual(
      withoutLink(date(state, 'transfer-notice')),
    );
    expect(linksToReview(corrected).has('transfer-notice')).toBe(false);
  });
});

describe('save boundary', () => {
  test('a corrected link is accepted and saved with the date otherwise unchanged', () => {
    const state = ivaiporaAnnual();
    const saved = save(state, changeActivity(state, 'ivaipora-final-1', annualFinal, []));
    expect(date(saved.state, 'ivaipora-final-1')).toMatchObject({
      activity: annualFinal,
      name: 'Data sintética final-1',
    });
  });

  test('a swap with any other change, outside the generated plan or removing the link is refused', () => {
    const state = ivaiporaAnnual();
    const swap = (change: Partial<PendingLinksFixture['events'][number]>) => ({
      ...state,
      events: state.events.map((event) =>
        event.id === 'ivaipora-final-1' ? { ...event, ...change } : event,
      ),
    });
    expect(() => validateLinks(state, swap({ activity: annualFinal }))).not.toThrow();
    for (const change of [
      { activity: annualFinal, name: 'Outra descrição' },
      { activity: annualFinal, end: civilDate('2027-06-23') },
      { activity: annualFinal, scope: { offers: ['integrado'], confirmed: true } },
      { activity: cycleLink('diary', 'second') },
      { activity: undefined },
    ])
      expect(() => validateLinks(state, swap(change))).toThrow('não perde nem troca');
    expect(() => save(state, swap({ activity: annualFinal, hours: 4 }))).toThrow(
      'não perde nem troca',
    );
  });

  test('a corrected stage passes the cycle checks at the boundary', () => {
    const state = conflictingLinks();
    const moved = {
      ...state,
      events: state.events.map((event) =>
        event.id === 'stage-twice-b'
          ? { ...event, activity: definedStage('stage', 'integrado', 'annual', 1) }
          : event,
      ),
    };
    expect(() => validateLinks(state, moved)).toThrow('nenhuma outra data a ocupa');
  });

  test('a correction to a once activity is accepted when it covers the date', () => {
    const state = ivaiporaAnnual();
    const corrected = changeActivity(
      state,
      'ivaipora-recognition-1',
      onceLink('family-meeting'),
      [],
    );
    expect(() => validateLinks(state, corrected)).not.toThrow();
  });
});

describe('readiness', () => {
  test('a date under “Vínculo a conferir” blocks the conclusion until its link is corrected', () => {
    const state = ivaiporaAnnual();
    const readiness = (content: PendingLinksFixture) =>
      releaseReadiness(
        { id: 'c', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state: content },
        { catalogue: { revision: 1 } },
      ).issues.filter((issue) => issue.startsWith('Vínculo a conferir'));
    expect(readiness(state)).toHaveLength(11);
    expect(readiness(state)[0]).toContain('Corrija a atividade vinculada');
    const corrected = changeActivity(state, 'ivaipora-final-1', annualFinal, []);
    expect(readiness(corrected)).toHaveLength(10);
    expect(readiness(corrected).some((issue) => issue.includes('final-1'))).toBe(false);
  });
});
