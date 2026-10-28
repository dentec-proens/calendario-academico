import { expect, test } from 'vitest';
import type {
  ActivityRequirement,
  AssessmentSettings,
  CalendarActivity,
} from '../src/domain-types.ts';
import { activityChecklist } from '../src/obligations.ts';
import { activityGroups } from '../src/activity-metadata.ts';
import { applicabilityFor } from '../src/calendar-rules/index.ts';
import { applyEvent } from '../src/calendar-edits/commands.ts';
import {
  activityDraft,
  eventFromValues,
} from '../web/features/calendar-editor/events/event-draft.ts';
import type { Modality } from '../web/features/calendar-editor/types.ts';

// Rules that lived in the editor before the metadata moved into the catalogue.
const previous = {
  group(id: string) {
    if (
      /^(registration|admission-notice|regular-admission|enrolment|adjustment|withdrawal|recognition|final-appeal)-/.test(
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

const settings: (AssessmentSettings & { year: number })[] = [2026, 2027, 2028].flatMap((year) =>
  (['anual', 'semestral', 'misto'] as const).flatMap((regime) =>
    [['integrado'], ['graduacao'], ['integrado', 'subsequente', 'graduacao', 'posgraduacao']].map(
      (modalities) => ({
        year,
        offer: modalities[0],
        modalities,
        regime,
        secondSemesterIntake: regime === 'semestral' ? false : undefined,
        organizationByModality: Object.fromEntries(
          modalities.map((modality) => [
            modality,
            regime === 'misto' ? (modality === 'integrado' ? 'anual' : 'semestral') : regime,
          ]),
        ),
        assessmentStagesByModality: Object.fromEntries(
          modalities.map((modality, index) => [modality, [4, 3, 2, 2][index]]),
        ),
      }),
    ),
  ),
);

test('catalogue metadata reproduces the previous grouping, category and form rules', () => {
  const rows: ActivityRequirement[] = settings.flatMap((state) => activityChecklist(state));
  expect(new Set(rows.map((row) => row.variant))).toEqual(
    new Set(['activity', 'hours', 'admission-notice', 'stage']),
  );
  for (const row of rows) {
    expect(row.group, row.id).toBe(previous.group(row.id));
    expect(row.defaultCategory, row.id).toBe(previous.category(row.id));
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
  const groups = new Set(
    settings.flatMap((state) => activityChecklist(state)).map((row) => row.group),
  );
  expect([...groups].every((group) => activityGroups.some(([id]) => id === group))).toBe(true);
});

// The values `prepare()` produced before it moved to `activityDraft`.
function previousDraft(state: (typeof settings)[number], row: ActivityRequirement) {
  const modalities = state.modalities ?? [];
  const pertinent = modalities.filter(
    (modality) => applicabilityFor(state, row, modality) === 'required',
  );
  const notice = previous.notice(row.id);
  return {
    modalities: pertinent.length
      ? pertinent
      : row.modality
        ? modalities.filter((modality) => modality === row.modality)
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
    category: previous.category(row.id),
    kind: 'note',
    name: row.name,
    requirementId: row.id,
  };
}

test('every year keeps a catalogue and prepares the same draft as before', () => {
  for (const year of [2026, 2027, 2028])
    expect(
      settings
        .filter((state) => state.year === year)
        .every((state) => activityChecklist(state).length > 0),
    ).toBe(true);
  for (const state of settings) {
    const draftState = { ...state, modalities: state.modalities as Modality[], periods: [] };
    for (const row of activityChecklist(state)) {
      const expected = previousDraft(state, row);
      // A stage record may only cover its own offer; 2026 used to prepare every offer.
      if (row.modality) expected.modalities = expected.modalities.filter((m) => m === row.modality);
      expect(activityDraft(draftState, row), `${state.year} ${row.id}`).toMatchObject(expected);
    }
  }
});

test('a 2026 stage prepared in a calendar with several offers can be applied', () => {
  const state = {
    year: 2026,
    offer: 'integrado',
    modalities: ['integrado', 'graduacao'] as Modality[],
    regime: 'anual',
    assessmentStagesByModality: { integrado: 4, graduacao: 2 },
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [],
    events: [] as CalendarActivity[],
  };
  const row = activityChecklist(state).find((item) => item.id === 'stage-1:integrado')!;
  const draft = activityDraft(state, row);
  expect(draft.modalities).toEqual(['integrado']);
  const event = eventFromValues(
    { ...draft, start: '2026-03-02', end: '2026-04-30' },
    { id: 'stage' },
  );
  expect(() => applyEvent(state, event, [])).toThrow(/inteiramente dentro/);
  const organized = {
    ...state,
    periods: [
      {
        id: 'annual',
        name: 'Anual',
        start: '2026-03-02',
        end: '2026-12-18',
        association: {
          status: 'defined' as const,
          modalities: ['integrado'],
          term: 'annual' as const,
        },
      },
    ],
  };
  expect(applyEvent(organized, event, []).events).toHaveLength(1);
});
