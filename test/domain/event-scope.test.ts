import { describe, expect, test } from 'vitest';
import { linkedToRow, rowLink } from '../helpers/activity-links.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { applySaturdays } from '../../src/domain/calendar/commands/saturdays.ts';
import { applyVacations } from '../../src/domain/calendar/commands/vacations.ts';
import { compareContents, type DiffSide } from '../../src/domain/calendar/diff.ts';
import {
  convertContentV5,
  provenScopeIds,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { appliesTo } from '../../src/domain/calendar/modalities.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  countingOf,
  newOffer,
  offerAdditionCase,
  offerAdditionCatalogue,
  offerAdditionState,
  oracleCounting,
  scopeForms,
  withNewOffer,
  type ScopeState,
} from '../helpers/event-scope.ts';
import { readyContent } from '../helpers/lifecycle.ts';

/**
 * Scope with confirmation (phase 2, step 7 of `docs/plans/2026-11-02-atividades-e-datas.md`,
 * section 5.3): offers are always listed and drive the count; `confirmed` records that the campus
 * chose them, and only a confirmed scope counts toward 2027 coverage.
 */
describe('adding an offer (offer-addition)', () => {
  test('every form of scope is present in the converted fixture', () => {
    const { state } = offerAdditionState();
    const scope = (id: string) => state.events.find((event) => event.id === id)?.scope;
    expect(scope('graduacao-stage-1')).toEqual({ offers: ['graduacao'], confirmed: true });
    expect(scope('integrado-stage-1')).toEqual({ offers: ['integrado'], confirmed: true });
    expect(scope('campus-meeting')).toEqual({
      offers: ['integrado', 'graduacao'],
      confirmed: true,
    });
    expect(scope('legacy-note')).toEqual({
      offers: ['integrado', 'graduacao', 'graduacao-2', 'graduacao-3'],
      confirmed: false,
    });
  });

  test('neither extends nor confirms any form of scope, and keeps the count of the oracle', () => {
    const { state: previous, snapshot } = offerAdditionState();
    const originalOffers = previous.offers.map((offer) => offer.id);
    // The count of the converted document is the one the v4 code recorded.
    expect(countingOf(previous, snapshot, originalOffers)).toEqual(oracleCounting());
    const before = structuredClone(previous);
    const proposed = withNewOffer(previous);
    const prepared = prepareOfferCalendarSave(previous, proposed, {
      storedContent: offerCalendarContent(previous),
      catalogue: { events: offerAdditionCatalogue() },
      recalculate: false,
    });
    expect(previous).toEqual(before);
    expect(prepared.state.offers.map((offer) => offer.id)).toEqual([
      ...originalOffers,
      newOffer.id,
    ]);
    for (const event of previous.events)
      expect(
        prepared.state.events.find((item) => item.id === event.id)?.scope,
        `${event.id} (${scopeForms[event.id as keyof typeof scopeForms] ?? 'explicit'})`,
      ).toEqual(event.scope);
    // Only the dates of the new offer reach it; the earlier offers keep the count of the oracle.
    expect(
      prepared.state.events
        .filter((event) => appliesTo(event, newOffer.id))
        .map((event) => event.activity),
    ).toEqual([1, 2].map((n) => rowLink(prepared.state, `stage-${n}:subsequente`)));
    expect(
      countingOf(prepared.state as ScopeState, prepared.institutionalSnapshot, originalOffers),
    ).toEqual(oracleCounting());
  });

  test('an unconfirmed exclusion of the earlier offers does not reach the new offer', () => {
    const { state } = offerAdditionState();
    const holiday = {
      id: 'legacy-holiday',
      name: 'Feriado municipal sem ofertas declaradas',
      start: civilDate('2027-05-04'),
      end: civilDate('2027-05-04'),
      effect: 'exclude' as const,
      category: 'feriado',
      scope: { offers: state.offers.map((offer) => offer.id), confirmed: false },
    };
    const next = withNewOffer({ ...state, events: [...state.events, holiday] });
    expect(next.events.find((event) => event.id === holiday.id)).toEqual(holiday);
    const counting = countingOf(next, [], ['integrado', newOffer.id]) as Record<
      string,
      { byWeekday: Record<string, number>; total: number }
    >;
    const without = countingOf(withNewOffer(state), [], ['integrado', newOffer.id]) as Record<
      string,
      { total: number }
    >;
    expect(counting.integrado.total).toBe(without.integrado.total - 1);
    expect(counting[newOffer.id].total).toBe(without[newOffer.id].total);
  });
});

describe('coverage under explicit offers (2027)', () => {
  test('a scope the campus has not confirmed never counts; the same date confirmed does', () => {
    const content = { ...readyContent(), year: 2027 };
    const row = (state: typeof content) =>
      evaluatePlan(state).rows.find((item) => item.requirement.id === 'family-meeting')!;
    expect(row(content).coverage).toBe('complete');
    const unconfirmed = {
      ...content,
      events: content.events.map((event) =>
        linkedToRow(content, 'family-meeting')(event)
          ? { ...event, scope: { ...event.scope, confirmed: false } }
          : event,
      ),
    };
    // The date stays visible in the row, but never as fulfilment.
    expect(row(unconfirmed).coverage).toBe('partial');
    expect(row(unconfirmed).events.map((event) => event.id)).toEqual(['family-meeting']);
    expect(row(unconfirmed).issues).toContain(
      'Confirme explicitamente as ofertas abrangidas pelo registro legado.',
    );
  });

  test('saving the organization form confirms the scope of the stages it lists', () => {
    // A v4 stage without offers in a calendar of one offer converts to that offer, unconfirmed.
    // The editor opens a stage only in the organization form, so saving it is the confirmation.
    const content = { ...readyContent(), year: 2027 };
    const stage = (state: typeof content) =>
      state.events.find(linkedToRow(state, 'stage-1:integrado'))!;
    const unconfirmed = {
      ...content,
      events: content.events.map((event) =>
        linkedToRow(content, 'stage-1:integrado')(event)
          ? { ...event, scope: { offers: ['integrado'], confirmed: false } }
          : event,
      ),
    };
    const issue = 'Confirme explicitamente as ofertas abrangidas pelo registro legado.';
    const issues = (state: typeof content) => evaluatePlan(state).rows.flatMap((row) => row.issues);
    expect(issues(unconfirmed)).toContain(issue);
    const organized = applyOfferOrganization(
      unconfirmed,
      'integrado',
      offerOrganizationDraft(unconfirmed, 'integrado'),
      () => 'unused',
    );
    expect(stage(organized).scope).toEqual({ offers: ['integrado'], confirmed: true });
    expect(stage(organized).id).toBe(stage(unconfirmed).id);
    expect(issues(organized)).not.toContain(issue);
  });
});

describe('dates generated by the system', () => {
  const vacationValues = {
    firstStart: civilDate('2027-01-04'),
    firstEnd: civilDate('2027-01-18'),
    secondStart: civilDate('2027-07-12'),
    secondEnd: civilDate('2027-07-23'),
  };

  test('regenerated vacations reach the current offers and keep the confirmation of their ID', () => {
    const { state } = offerAdditionState();
    const offers = state.offers.map((offer) => offer.id);
    const january = {
      id: 'teacher-vacation-january',
      name: 'Férias docentes — 15 dias',
      start: civilDate('2027-01-04'),
      end: civilDate('2027-01-18'),
      effect: 'exclude' as const,
      category: 'ferias',
      scope: { offers: ['integrado'], confirmed: true },
    };
    const next = applyVacations(
      { ...state, events: [...state.events, january] },
      vacationValues,
      [],
    );
    const scope = (id: string) => next.events.find((event) => event.id === id)?.scope;
    expect(scope('teacher-vacation-january')).toEqual({ offers, confirmed: true });
    expect(scope('teacher-vacation-july')).toEqual({ offers, confirmed: false });
    // Saving regenerates them the same way, from the proposed date or else the previous one.
    const saved = normalizeOfferCalendar({ ...next, teacherVacations: vacationValues }, next);
    expect(saved.events.filter((event) => event.id.startsWith('teacher-vacation-'))).toEqual(
      next.events.filter((event) => event.id.startsWith('teacher-vacation-')),
    );
    const withoutJanuary = next.events.filter((event) => event.id !== 'teacher-vacation-january');
    expect(
      normalizeOfferCalendar(
        { ...next, events: withoutJanuary, teacherVacations: vacationValues },
        next,
      ).events.find((event) => event.id === 'teacher-vacation-january')?.scope,
    ).toEqual({ offers, confirmed: true });
  });

  test('Saturdays created by the Saturdays step reach the current offers, confirmed', () => {
    const { state } = offerAdditionState();
    let sequence = 0;
    const next = applySaturdays(
      state,
      { dates: ['2027-03-06'], name: 'Sábado letivo', confirmed: true },
      [],
      () => `saturday-${++sequence}`,
    );
    expect(next.events.find((event) => event.id === 'saturday-1')?.scope).toEqual({
      offers: state.offers.map((offer) => offer.id),
      confirmed: true,
    });
  });
});

describe('conversion of the scope (plan, section 5.3)', () => {
  test('materialized lists convert confirmed, each with its own manifest entry', () => {
    const item = offerAdditionCase();
    const conversion = convertContentV5(item.content, {
      year: item.year,
      submissions: item.submissions,
    })!;
    const entry = (id: string) => conversion.manifest.find((item) => item.id === id);
    expect(entry('integrado-stage-1')?.scope).toEqual({
      status: 'materialized-candidate',
      offers: ['integrado'],
      proofs: [],
    });
    expect(entry('campus-meeting')?.scope).toEqual({
      status: 'materialized-proven',
      offers: ['integrado', 'graduacao'],
      proofs: [1],
    });
    expect(entry('legacy-note')?.scope).toEqual({
      status: 'unconfirmed',
      offers: ['integrado', 'graduacao', 'graduacao-2', 'graduacao-3'],
      proofs: [],
    });
    // A list the campus chose needs no review.
    expect(entry('graduacao-stage-1')).not.toHaveProperty('scope');
    expect(
      conversion.manifest
        .filter((item) => item.scope?.status.startsWith('materialized-'))
        .map((item) => `${item.id}:${item.scope!.status}`),
    ).toEqual([
      'integrado-stage-1:materialized-candidate',
      'integrado-stage-2:materialized-candidate',
      'integrado-stage-3:materialized-candidate',
      'integrado-stage-4:materialized-candidate',
      'campus-meeting:materialized-proven',
    ]);
  });

  test('a submission uses its own offers, never the current ones', () => {
    const item = offerAdditionCase();
    const [submission] = item.submissions;
    const conversion = convertContentV5(submission, { year: item.year, source: 'submission' })!;
    const state = (conversion.document as { state: ScopeState }).state;
    expect(state.events.find((event) => event.id === 'campus-meeting')?.scope).toEqual({
      offers: ['integrado', 'graduacao'],
      confirmed: false,
    });
    expect(conversion.manifest.find((entry) => entry.id === 'campus-meeting')?.scope).toEqual({
      status: 'unconfirmed',
      offers: ['integrado', 'graduacao'],
      proofs: [],
    });
  });
});

describe('comparison of a converted submission with the converted content', () => {
  test('a proven materialized list shows no confirmation the campus never made', () => {
    const item = offerAdditionCase();
    const content = convertContentV5(item.content, {
      year: item.year,
      submissions: item.submissions,
    })!;
    const [submission] = item.submissions;
    const copy = convertContentV5(submission, {
      year: item.year,
      source: 'submission',
      provenScopes: provenScopeIds(content.manifest, submission.sequence),
    })!;
    const side = (document: unknown) => document as DiffSide;
    const scope = (document: unknown, id: string) =>
      (document as { state: ScopeState }).state.events.find((event) => event.id === id)?.scope;
    // The copy keeps its own offers and inherits the confirmation of the proven list.
    expect(scope(copy.document, 'campus-meeting')).toEqual({
      offers: ['integrado', 'graduacao'],
      confirmed: true,
    });
    expect(copy.manifest.find((entry) => entry.id === 'campus-meeting')?.scope).toEqual({
      status: 'materialized-proven',
      offers: ['integrado', 'graduacao'],
      proofs: [submission.sequence],
    });
    const diff = compareContents(side(copy.document), side(content.document));
    expect(diff.events.map((event) => event.id)).not.toContain('campus-meeting');
    // Without the proven list, the same copy would show a confirmation never made.
    const plain = convertContentV5(submission, { year: item.year, source: 'submission' })!;
    const before = compareContents(side(plain.document), side(content.document));
    expect(before.events.find((event) => event.id === 'campus-meeting')).toMatchObject({
      fields: [{ field: 'scope.confirmed', before: false, after: true }],
    });
    expect(diff.campusChanges).toBe(before.campusChanges - 1);
  });
});
