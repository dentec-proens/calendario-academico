import { test } from 'vitest';
import assert from 'node:assert/strict';
import { analyzeHistory, suggestionsFromPages } from '../src/history-analysis.ts';
import { syntheticPdf as fixture } from './helpers/synthetic-pdf.ts';

test('PDF text extraction preserves page evidence and never assigns dates or confirms events', async () => {
  const result = await analyzeHistory(fixture());
  assert.equal(result.needsText, false);
  assert.equal(result.candidates[0].name, 'FERIADO MUNICIPAL - Padroeiro');
  assert.equal(result.candidates[0].page, 1);
  assert.equal(result.candidates[0].likelyLocal, true);
  assert.equal(Object.hasOwn(result.candidates[0], 'start'), false);
  assert.equal((await analyzeHistory(fixture(''))).needsText, true);
  await assert.rejects(analyzeHistory(Buffer.from('%PDF-broken')));
  const multi = suggestionsFromPages([
    { page: 1, text: '10 11 12 13 Feira de cursos\n24 Feriado municipal\n24 Feriado municipal' },
  ]);
  assert.equal(multi.candidates.length, 2);
  assert.equal(multi.candidates[0].name, 'Feriado municipal');
  assert.equal(multi.candidates[1].name, 'Feira de cursos');
});
