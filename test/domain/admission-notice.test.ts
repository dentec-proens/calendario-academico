import { expect, test } from 'vitest';
import { cycleLink } from '../helpers/activity-links.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import {
  noticeDestinationIssues,
  validateActivityRecord,
} from '../../src/domain/calendar/activities/validation.ts';
import type { AdmissionDestination, CalendarEvent } from '../../src/domain/calendar/model.ts';
import { contentAssessment } from '../../src/domain/calendar/readiness.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';

/**
 * Notice and admission destination by offer (plan `docs/plans/2026-11-02-atividades-e-datas.md`,
 * section 5.4; phase 2, step 6): each offer of the date has its own destination, which is diagnosed
 * on its own and never corrected automatically.
 */
const notice = (
  destinations: AdmissionDestination[],
  changes: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id: 'transfer-notice',
  name: 'Edital de transferência',
  start: civilDate('2027-01-10'),
  end: civilDate('2027-01-10'),
  effect: 'note',
  category: 'prazo',
  scope: { offers: ['integrado', 'graduacao'], confirmed: true },
  activity: cycleLink('admission-notice', 'annual'),
  notice: {
    publication: 'planned',
    admission: { type: 'transfer', year: 2027, term: 'annual', destinations },
  },
  ...changes,
});

const withNotice = (event: CalendarEvent) => {
  const state = calendarOffersV4Fixture();
  state.events.push(event);
  return state;
};

test('each offer is diagnosed against its own destination', () => {
  const state = withNotice(
    notice([
      { offerId: 'integrado', periodId: 'integrado-annual' },
      { offerId: 'graduacao', periodId: 'removed' },
    ]),
  );
  const event = state.events.at(-1)!;
  expect(
    noticeDestinationIssues(state, event).map(({ offerId, problem }) => [offerId, problem]),
  ).toEqual([['graduacao', 'orphan']]);
  const coverage = (offerId: string) =>
    evaluatePlan(state).rows.find(
      (row) => row.offerId === offerId && row.requirement.id === 'admission-notice-0',
    )!;
  expect(coverage('integrado').coverage).toBe('complete');
  expect(coverage('graduacao')).toMatchObject({
    coverage: 'partial',
    issues: ['Vincule o período de ingresso correspondente à oferta.'],
  });
  const { warnings, issues } = contentAssessment({ state, institutionalSnapshot: [] });
  expect(warnings.filter((warning) => warning.includes('Revise o destino do edital'))).toEqual([
    expect.stringContaining('período de destino removido do calendário (removed)'),
  ]);
  // The diagnosis warns; it does not add a readiness issue of its own.
  expect(issues.some((issue) => issue.message.includes('Revise o destino'))).toBe(false);
});

test('a destination of another offer or cycle, or an offer left without one, is diagnosed', () => {
  const state = withNotice(
    notice(
      [
        { offerId: 'integrado', periodId: 'graduacao-annual' },
        { offerId: 'graduacao-2', periodId: 'graduacao-2-second' },
      ],
      { scope: { offers: ['integrado', 'graduacao', 'graduacao-2'], confirmed: true } },
    ),
  );
  expect(
    noticeDestinationIssues(state, state.events.at(-1)!).map(({ offerId, problem }) => [
      offerId,
      problem,
    ]),
  ).toEqual([
    ['integrado', 'unassociated'],
    ['graduacao', 'missing'],
    ['graduacao-2', 'other-term'],
  ]);
});

test('a notice without destination is not informed and has nothing to diagnose', () => {
  const state = withNotice(notice([]));
  expect(noticeDestinationIssues(state, state.events.at(-1)!)).toEqual([]);
});

test('a notice is validated as a whole: purpose, publication and one destination per offer', () => {
  const state = calendarOffersV4Fixture();
  const valid = notice([{ offerId: 'integrado', periodId: 'integrado-annual' }]);
  expect(() => validateActivityRecord(state, valid)).not.toThrow();
  expect(() =>
    validateActivityRecord(
      state,
      notice([
        { offerId: 'integrado', periodId: 'integrado-annual' },
        { offerId: 'integrado', periodId: 'graduacao-annual' },
      ]),
    ),
  ).toThrow('Período de ingresso inválido.');
  expect(() =>
    validateActivityRecord(state, {
      ...valid,
      notice: { admission: valid.notice!.admission },
    }),
  ).toThrow('Informe se a publicação é programada ou realizada.');
  expect(() =>
    validateActivityRecord(state, { ...valid, notice: { publication: 'planned' } }),
  ).toThrow('Identifique a finalidade de ingresso do edital.');
});
