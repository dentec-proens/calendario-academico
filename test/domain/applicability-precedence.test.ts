import { expect, test } from 'vitest';
import type { ActivityRef } from '../../src/domain/calendar/activities/activity-ref.ts';
import type { ActivityPlanItem, CalendarOffer } from '../../src/domain/calendar/model.ts';
import { applicability } from '../../src/domain/policies/consup-292-2027/requirements.ts';

const graduacao: CalendarOffer = {
  id: 'curso',
  kind: 'graduacao',
  delivery: 'presencial',
  organization: 'anual',
};
const state = { year: 2027, offers: [graduacao] };
const row = (fields: Partial<ActivityPlanItem>): ActivityPlanItem => ({
  id: 'synthetic',
  activity: { activityId: 'synthetic' } as ActivityRef,
  name: 'Atividade sintética',
  ...fields,
});

test.each<[string, Partial<CalendarOffer>, Partial<ActivityPlanItem>, string]>([
  [
    'excluded offer wins over a required row',
    { kind: 'posgraduacao' },
    { applicability: 'required' },
    'unconfigured',
  ],
  [
    'own regulation wins over a required row',
    { scope: { status: 'own-regulation' } },
    { applicability: 'required' },
    'unconfigured',
  ],
  ['offer outside the kinds', {}, { modalities: ['integrado'] }, 'optional'],
  ['offer other than the row offer', {}, { offerId: 'outra' }, 'optional'],
  [
    'offer outside the row offers wins over a required intake',
    { intake: { annual: true } },
    { offerIds: ['outra'], intake: true },
    'optional',
  ],
  ['empty note in optionalFor still counts', {}, { optionalFor: { graduacao: '' } }, 'optional'],
  [
    'optionalFor wins over applicability',
    {},
    { optionalFor: { graduacao: '' }, applicability: 'required' },
    'optional',
  ],
  [
    'required intake wins over the row field',
    { intake: { annual: true } },
    { intake: true, required: false },
    'required',
  ],
  [
    'no local requirement ends the branch',
    {},
    { intake: true, applicability: 'required' },
    'optional',
  ],
  ['intake not configured', {}, { intake: true }, 'optional'],
  [
    'intake row without term reads the annual entry',
    { intake: { annual: true } },
    { intake: true },
    'required',
  ],
  [
    'intake row with term ignores the annual entry',
    { intake: { annual: true } },
    { intake: true, term: 'first' },
    'optional',
  ],
  [
    'applicability wins over required',
    {},
    { applicability: 'required', required: false },
    'required',
  ],
  ['required false without applicability', {}, { required: false }, 'optional'],
  ['no field means required', {}, {}, 'required'],
])('%s', (_name, offer, fields, expected) => {
  expect(applicability(state, row(fields), { ...graduacao, ...offer })).toBe(expected);
});
