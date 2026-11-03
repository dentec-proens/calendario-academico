import { expect, test } from 'vitest';
import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { api } from '../../convex/_generated/api.js';
import type { ContentState } from '../../convex/validators.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { CalendarContent } from '../../src/domain/calendar/model.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, calendarStatus, readyContent, saveReview } from '../helpers/lifecycle.ts';
import { cycleLink, definedStage } from '../helpers/activity-links.ts';
import { offerCalendarContent } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import {
  activityChangeOptions,
  changeActivity,
  updateDate,
} from '../../src/domain/calendar/commands/events.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { conflictingLinks, ivaiporaAnnual } from '../fixtures/pending-links-2027.ts';

/**
 * `changeActivity` at the Convex save boundary (plan, section 4.6; phase 2, step 13): `saveCalendar`
 * accepts a swapped link only as a correction of a date under “Vínculo a conferir” to a generated
 * activity covering every offer of the date, with nothing else of the date changed. A date under
 * review blocks the conclusion, so a reviewed calendar keeps its status and cannot be published.
 */
const sei = '23411.000001/2027-11';
const annualFinal = cycleLink('final', 'annual');

async function stored(content: CalendarContent & { year: number }, kinds: string[]) {
  const native = await createNativeFixture();
  const actor = native.asClient('campus-a');
  const created = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: native.ids.campuses.a,
        year: 2027,
        offers: kinds.map((kind) => ({
          kind: kind as 'integrado',
          organization: 'anual' as const,
        })),
      },
    })
    .then(calendarRecordDates);
  await native.client.run(async (ctx) => {
    await ctx.db.patch(created.id, { courses: 'Curso sintético' });
    const row = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', created.id))
      .unique();
    if (!row) throw Error('Conteúdo esperado.');
    const state = offerCalendarContent({ ...content, rulesetVersion: rulesetVersion(content) });
    await ctx.db.patch(row._id, { state: state as ContentState });
  });
  const current = () =>
    actor.query(api.calendars.calendar, { id: created.id }).then(calendarRecordDates);
  const record = await current();
  const save = (state: typeof record.state, version: number) =>
    actor
      .mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version,
          catalogueRevision: record.catalogueRevision,
          // Match the HTTP JSON boundary, which omits undefined optional fields.
          state: JSON.parse(JSON.stringify(state)) as typeof state,
        },
      })
      .then(calendarSaveDates);
  return { native, actor, record, save, current };
}

test('a correction of a date under review is saved with only its link changed', async () => {
  const { record, save, current } = await stored(ivaiporaAnnual(), ['integrado', 'subsequente']);
  const original = record.state.events.find((event) => event.id === 'ivaipora-final-1')!;
  const saved = await save(
    changeActivity(record.state, 'ivaipora-final-1', annualFinal, []),
    record.version,
  );
  const corrected = saved.state.events.find((event) => event.id === 'ivaipora-final-1')!;
  expect(corrected).toEqual({ ...original, activity: annualFinal });
  expect(saved.state.events.map((event) => event.id)).toEqual(
    record.state.events.map((event) => event.id),
  );
  for (const event of record.state.events)
    if (event.id !== original.id)
      expect(saved.state.events.find((item) => item.id === event.id)).toEqual(event);
  const reviewed = linksToReview({ ...saved.state, year: 2027 });
  expect(reviewed.has(original.id)).toBe(false);
  expect(reviewed.size).toBe(10);
  expect((await current()).state).toEqual(saved.state);
});

test('swaps that are not a correction are refused and the stored calendar stays intact', async () => {
  const { record, save, current } = await stored(ivaiporaAnnual(), ['integrado', 'subsequente']);
  const swapped = (change: object, id = 'ivaipora-final-1', state = record.state) => ({
    ...state,
    events: state.events.map((event) => (event.id === id ? { ...event, ...change } : event)),
  });
  for (const [state, message] of [
    // The new activity is not generated, or does not cover every offer of the date.
    [swapped({ activity: cycleLink('diary', 'second') }), 'não perde nem troca'],
    [swapped({ activity: definedStage('stage', 'integrado', 'annual', 1) }), 'não perde nem troca'],
    // The other change of the corrected date must still be valid for an edited date.
    [swapped({ activity: annualFinal, end: civilDate('2027-06-20') }), 'Intervalo invertido'],
    // Removing the link is never a correction.
    [swapped({ activity: undefined }), 'não perde nem troca'],
  ] as const)
    await expect(save(state, record.version)).rejects.toThrow(message);
  expect((await current()).state).toEqual(record.state);

  // A link that counts is never swapped, even for another generated activity.
  const corrected = await save(
    changeActivity(record.state, 'ivaipora-final-1', annualFinal, []),
    record.version,
  );
  await expect(
    save(
      swapped({ activity: cycleLink('diary', 'annual') }, 'ivaipora-final-1', corrected.state),
      corrected.version,
    ),
  ).rejects.toThrow('não perde nem troca');
  expect((await current()).state).toEqual(corrected.state);
});

test('a correction and an edit of the same date are saved together (review of step 13)', async () => {
  const { record, save } = await stored(ivaiporaAnnual(), ['integrado', 'subsequente']);
  const corrected = changeActivity(record.state, 'ivaipora-final-1', annualFinal, []);
  const { activity: _activity, ...edit } = corrected.events.find(
    (event) => event.id === 'ivaipora-final-1',
  )!;
  const edited = updateDate(corrected, { ...edit, name: 'Resultado final corrigido' }, []);
  const saved = await save(edited, record.version);
  expect(saved.state.events.find((event) => event.id === 'ivaipora-final-1')).toMatchObject({
    activity: annualFinal,
    name: 'Resultado final corrigido',
  });
});

test('a stage with automatic distribution corrected to another activity is saved without it', async () => {
  const content = conflictingLinks();
  const stage = content.events.find((event) => event.id === 'stage-twice-b')!;
  stage.assessmentAutoStart = civilDate('2027-04-05');
  const { record, save } = await stored(content, ['integrado', 'subsequente']);
  const other = activityChangeOptions(record.state, 'stage-twice-b').find(
    (row) => row.activity.activityId !== 'stage',
  )!;
  const saved = await save(
    changeActivity(record.state, 'stage-twice-b', other.activity, []),
    record.version,
  );
  const corrected = saved.state.events.find((event) => event.id === 'stage-twice-b')!;
  expect(corrected.activity).toEqual(other.activity);
  expect(corrected.assessmentAutoStart).toBeUndefined();
});

/** Ready content of the lifecycle tests plus one date whose cycle the offer does not generate. */
function readyWithLinkToReview() {
  const content = readyContent();
  content.events.push({
    id: 'pending-final-1',
    name: 'Resultado final do 1º semestre',
    start: civilDate('2027-06-22'),
    end: civilDate('2027-06-22'),
    effect: 'note',
    category: 'prazo',
    activity: cycleLink('final', 'first'),
    scope: { offers: ['integrado'], confirmed: true },
  });
  return { ...content, year: 2027 };
}

async function reviewer(native: Awaited<ReturnType<typeof createNativeFixture>>) {
  const identity = await native.client.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: 'Parecerista',
      email: 'parecer@ifpr.edu.br',
      role: 'PARECERISTA',
      active: true,
      loginMethod: 'local',
    });
    const sessionId = await ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 3_600_000,
    });
    return { subject: `${userId}|${sessionId}` };
  });
  return native.client.withIdentity(identity);
}

test('a reviewed calendar with a link to review keeps its status and is published only after the correction', async () => {
  const { native, actor, record, save, current } = await stored(readyWithLinkToReview(), [
    'integrado',
  ]);
  const id = record.id as Id<'calendars'>;
  const admin = native.asClient('admin');
  const parecer = await reviewer(native);
  expect(record.readiness.issues.filter((issue) => issue.startsWith('Vínculo a conferir'))).toEqual(
    [
      expect.stringContaining(
        '“Resultado final do 1º semestre” (22/06/2027): Classificação pendente',
      ),
    ],
  );

  await act(actor, id, 'submit');
  await saveReview(parecer, id);
  await act(parecer, id, 'conclude');
  expect((await calendarStatus(actor, id)).status).toBe('revisado');
  await expect(act(admin, id, 'publish', { sei })).rejects.toThrow(
    'Resolva as pendências da conferência antes de publicar.',
  );
  const refused = await calendarStatus(actor, id);
  expect(refused.status).toBe('revisado');
  expect(
    refused.record.readiness.issues.some((issue) => issue.startsWith('Vínculo a conferir')),
  ).toBe(true);

  // The campus corrects the link after a return and the calendar is published.
  await act(parecer, id, 'return', { note: 'Corrija a atividade vinculada.' });
  const returned = await current();
  const corrected = await save(
    changeActivity(returned.state, 'pending-final-1', annualFinal, returned.institutionalSnapshot),
    returned.version,
  );
  expect(corrected.state.events.find((event) => event.id === 'pending-final-1')?.activity).toEqual(
    annualFinal,
  );
  expect(
    (await calendarStatus(actor, id)).record.readiness.issues.filter((issue) =>
      issue.startsWith('Vínculo a conferir'),
    ),
  ).toEqual([]);
  await act(actor, id, 'submit');
  await saveReview(parecer, id);
  await act(parecer, id, 'conclude');
  await act(admin, id, 'publish', { sei });
  expect((await calendarStatus(actor, id)).status).toBe('vigente');
});
