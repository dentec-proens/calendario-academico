import { declaredCategory } from '../helpers/declared-categories.ts';
import { calendarOffers } from '../../src/domain/calendar/offers.ts';
import { expect, test } from 'vitest';
import type { ActivityPlanItem, AssessmentSettings } from '../../src/domain/calendar/model.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { activityGroups } from '../../src/domain/calendar/activities/metadata.ts';
import { applicabilityFor } from '../../src/domain/policies/registry.ts';
import { activityDraft } from '../../web/features/calendar-editor/events/event-draft.ts';

// Rules that lived in the editor before the metadata moved into the catalogue.
const previous = {
  group(id: string) {
    if (
      /^(registration|admission-notice|regular-admission|enrolment|adjustment|withdrawal|component-cancellation|recognition|final-appeal)-/.test(
        id,
      )
    )
      return 'admission';
    if (/^(final|diary|teaching-plan|pit|rit|results|stage|council|pedagogical-meeting)-/.test(id))
      return 'teaching';
    if (/week|training|planning|campus|meeting|event|robotics|showcase|council/.test(id))
      return 'campus';
    return 'other';
  },
  category(id: string) {
    return id.includes('council')
      ? 'conselho'
      : /^stage-[1-4]:[a-z]+$/.test(id)
        ? 'limite'
        : id === 'cultural-week'
          ? 'evento'
          : 'prazo';
  },
  stage: (id: string) => /^stage-[1-4]:[a-z]+$/.test(id),
  notice: (id: string) => id.startsWith('admission-notice-') || id === 'regular-admission-notice',
};

/** consup-292-2027-v6 declares the legend category of activities that used `prazo`. */
const categoryOf = (year: number, id: string) =>
  id.endsWith('-vacation')
    ? 'ferias'
    : (year === 2027 && declaredCategory(id)) || previous.category(id);

const settings: (AssessmentSettings & { year: number })[] = [2027, 2028].flatMap((year) =>
  (['anual', 'semestral', 'misto'] as const).flatMap((regime) =>
    [['integrado'], ['graduacao'], ['integrado', 'subsequente', 'graduacao', 'posgraduacao']].map(
      (kinds) => ({
        year,
        offers: kinds.map((kind, index) => {
          const organization =
            regime === 'misto' ? (kind === 'integrado' ? 'anual' : 'semestral') : regime;
          const total = [4, 3, 2, 2][index];
          return {
            id: kind,
            kind: kind as 'integrado' | 'subsequente' | 'graduacao' | 'posgraduacao',
            delivery: 'a-conferir' as const,
            organization,
            ...(organization === 'semestral' && total === 3
              ? {}
              : {
                  stages: {
                    status: 'defined',
                    perTerm: total / (organization === 'semestral' ? 2 : 1),
                  },
                }),
          };
        }),
      }),
    ),
  ),
);

test('catalogue metadata reproduces the previous grouping, category and form rules', () => {
  const rows: ActivityPlanItem[] = settings.flatMap((state) => activityPlan(state));
  expect(new Set(rows.map((row) => row.variant))).toEqual(
    new Set(['activity', 'hours', 'admission-notice', 'stage', 'vacation']),
  );
  for (const state of settings)
    for (const row of activityPlan(state))
      expect(row.defaultCategory, `${state.year} ${row.id}`).toBe(categoryOf(state.year, row.id));
  for (const row of rows) {
    expect(row.group, row.id).toBe(previous.group(row.id));
    expect(row.variant === 'stage', row.id).toBe(previous.stage(row.id));
    expect(row.variant === 'admission-notice', row.id).toBe(
      previous.notice(row.id) || Boolean(row.admissionType),
    );
    expect(row.variant === 'hours', row.id).toBe(
      Boolean(row.minHours) && !previous.stage(row.id) && !previous.notice(row.id),
    );
  }
});

test('every catalogue subject is offered by the checklist filter', () => {
  const groups = new Set(settings.flatMap((state) => activityPlan(state)).map((row) => row.group));
  expect([...groups].every((group) => activityGroups.some(([id]) => id === group))).toBe(true);
});

// The values `prepare()` produced before it moved to `activityDraft`.
function previousDraft(state: (typeof settings)[number], row: ActivityPlanItem) {
  const modalities = state.offers.map((offer) => offer.id);
  const pertinent = modalities.filter(
    (modality) => applicabilityFor(state, row, modality) === 'required',
  );
  const notice = previous.notice(row.id);
  return {
    offers: pertinent.length
      ? pertinent
      : row.offerId
        ? modalities.filter((modality) => modality === row.offerId)
        : row.modalities?.length
          ? modalities.filter((modality) => row.modalities?.includes(modality))
          : modalities,
    admissionType: row.admissionType ?? '',
    admissionYear: row.id.startsWith('admission-notice-')
      ? String(state.year)
      : row.id === 'regular-admission-notice'
        ? String(state.year + 1)
        : '',
    admissionTerm: row.term ?? 'annual',
    publicationStatus: notice ? 'planned' : '',
    category: categoryOf(state.year, row.id),
    effect: 'note',
    // The link is no longer a form value: `planActivityDate` takes it from the context.
    name: row.name,
  };
}

test('every year keeps a catalogue and prepares the same draft as before', () => {
  for (const year of [2027, 2028])
    expect(
      settings
        .filter((state) => state.year === year)
        .every((state) => activityPlan(state).length > 0),
    ).toBe(true);
  for (const state of settings) {
    const draftState = { ...state, offers: calendarOffers(state), periods: [] };
    for (const row of activityPlan(state)) {
      const expected = previousDraft(state, row);
      // A stage record may only cover its own offer.
      if (row.offerId) expected.offers = expected.offers.filter((m) => m === row.offerId);
      const { offers, ...fields } = expected;
      expect(activityDraft(draftState, row), `${state.year} ${row.id}`).toMatchObject({
        ...fields,
        offers,
      });
    }
  }
});
