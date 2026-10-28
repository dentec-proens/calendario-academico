import { expect, test } from 'vitest';
import { api } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';
import { applyOfferOrganization, offerOrganizationDraft } from '../src/offer-organization.ts';
import type { ActivityState } from '../src/domain-types.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 3,
    year: 2027,
    modalities: ['integrado'],
    offer: 'integrado',
    regime: 'anual',
    organizationByModality: { integrado: 'anual' },
    assessmentStagesByModality: {},
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata',
    periods: [],
    events: [
      {
        id: 'legacy-note',
        name: 'Registro anterior',
        start: '2027-03-01',
        end: '2027-03-01',
        kind: 'note',
        evidence: 'Fonte anterior',
      },
    ],
  };
}

test('a complete organization adds one catalog offer without extending existing records to it', () => {
  const original = calendar(),
    before = structuredClone(original),
    draft = offerOrganizationDraft(original, 'graduacao');
  draft.organization = 'anual';
  draft.periods[0].start = '2027-03-01';
  draft.periods[0].end = '2027-03-26';
  draft.count = '2';
  draft.evidence = 'Ata da graduação';
  draft.stages[0].start = '2027-03-01';
  draft.stages[0].end = '2027-03-12';
  draft.stages[1].start = '2027-03-15';
  draft.stages[1].end = '2027-03-26';
  let sequence = 0;
  const next = applyOfferOrganization(original, 'graduacao', draft, () => `added-${sequence++}`);
  expect(next.modalities).toEqual(['integrado', 'graduacao']);
  expect(next.events.find((e) => e.id === 'legacy-note')).toEqual({
    ...before.events[0],
    modalities: ['integrado'],
  });
  expect(next.events.filter((e) => e.requirementId?.endsWith(':graduacao'))).toHaveLength(2);
  expect(original).toEqual(before);
});

test('Convex includes a complete new offer atomically and preserves the earlier version scope', async () => {
  const fixture = await createNativeFixture(),
    actor = fixture.asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['posgraduacao'],
      regime: 'anual',
      courses: 'Pós-graduação sintética',
      purpose: 'test',
    },
  });
  const modalities: typeof record.state.modalities = ['posgraduacao', 'integrado'];
  const state = {
    ...record.state,
    modalities,
    rulesetVersion: 'consup-292-2027-v1',
    organizationByModality: { ...record.state.organizationByModality, integrado: 'anual' as const },
    assessmentStagesByModality: { integrado: 2 as const },
    periods: [
      {
        id: 'integrated',
        name: 'Anual integrado',
        start: '2027-03-01',
        end: '2027-03-26',
        association: {
          status: 'defined' as const,
          modalities: ['integrado' as const],
          term: 'annual' as const,
        },
      },
    ],
    events: [0, 1].map((index) => ({
      id: `stage-${index + 1}`,
      name: `${index + 1}ª etapa`,
      requirementId: `stage-${index + 1}:integrado`,
      modalities: ['integrado' as const],
      start: index ? '2027-03-15' : '2027-03-01',
      end: index ? '2027-03-26' : '2027-03-12',
      kind: 'note' as const,
      evidence: 'Ata sintética',
    })),
  };
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: { version: record.version, catalogueRevision: record.catalogueRevision, state },
  });
  const loaded = await actor.query(api.calendars.calendar, { id: record.id });
  expect(saved.version).toBe(record.version + 1);
  expect(loaded.modalities).toEqual(modalities);
  expect(loaded.state.modalities).toEqual(modalities);
  expect(loaded.state.periods).toEqual(saved.state.periods);
  expect(loaded.state.events).toEqual(saved.state.events);
  const previous = await actor.query(api.calendars.calendarVersion, {
    id: record.id,
    version: record.version,
  });
  expect(previous.state.modalities).toEqual(['posgraduacao']);
  expect(previous.state.periods).toEqual([]);
  for (const changed of [
    { ...loaded.state, modalities: ['integrado' as const] },
    {
      ...loaded.state,
      modalities: [...modalities, 'graduacao' as const],
      organizationByModality: {
        ...loaded.state.organizationByModality,
        graduacao: 'anual' as const,
      },
    },
    { ...loaded.state, year: 2028 },
  ]) {
    await expect(
      actor.mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version: loaded.version,
          catalogueRevision: loaded.catalogueRevision,
          state: changed,
        },
      }),
    ).rejects.toThrow();
    expect((await actor.query(api.calendars.calendar, { id: record.id })).version).toBe(
      loaded.version,
    );
  }
});
