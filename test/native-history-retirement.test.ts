import assert from 'node:assert/strict';
import { test } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { api } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';

test('previous calendar actions are no longer callable', async () => {
  const { asClient, ids } = await createNativeFixture();
  const actor = asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      purpose: 'test',
      courses: 'Arquivo preservado',
    },
  });
  for (const name of [
    'uploadHistory',
    'downloadHistory',
    'analyzeHistory',
    'reanalyzeHistory',
    'restoreHistoryOriginal',
  ])
    await assert.rejects(
      actor.action(makeFunctionReference<'action'>(`actions/history:${name}`), {
        calendarId: record.id,
        filename: 'anterior.pdf',
        year: 2026,
        uploadId: 'retired-upload',
      }),
      /Could not find|no such export|not found/,
    );
  await assert.rejects(
    actor.query(makeFunctionReference<'query'>('histories:analysisVersions'), {}),
    /Could not find|no such export|not found/,
  );
  assert.equal('histories' in record, false);
  assert.equal('ignoredHistory' in record.state, false);
});
