import { test } from 'vitest';
import assert from 'node:assert/strict';
import { extractHistoricalDates, originalDates, proposedDates } from '../src/history-dates.ts';
import { suggestionsFromPages } from '../src/history-analysis.ts';
import { historyCandidateKey } from '../src/history-progress.ts';

test('extracts full dates, ranges and month headings beyond the old keyword filter', () => {
  const analysis = suggestionsFromPages([
    {
      page: 1,
      text: 'JANEIRO 2026\n02 a 31 Férias docentes\nFEVEREIRO\n05 Início das aulas\n10/03/2026 a 12/03/2026 - Entrega dos diários\n15/04 - Submissão do PIT',
    },
  ]);
  assert.equal(analysis.version, 3);
  assert.equal(analysis.candidates.length, 4);
  assert.equal(originalDates(analysis.candidates[0], { analysisVersion: 3 }).start, '2026-01-02');
  assert.equal(originalDates(analysis.candidates[1], { analysisVersion: 3 }).start, '');
  assert.equal(originalDates(analysis.candidates[2], { analysisVersion: 3 }).end, '2026-03-12');
  assert.equal(proposedDates(analysis.candidates[0], 2027).start, '');
  assert.equal(proposedDates(analysis.candidates[2], 2027).end, '');
  assert.equal(extractHistoricalDates('01 a 15/07 - Férias docentes')!.startMonth, 7);
});

test('original occurrence preserves explicit years and refuses conflicting or insufficient year context', () => {
  const candidate = (line: string) => ({ name: 'Evento', dates: extractHistoricalDates(line) });
  assert.equal(originalDates(candidate('29/02/2024 - Evento')).start, '2024-02-29');
  assert.equal(originalDates(candidate('31/04/2026 - Evento')).start, '');
  assert.equal(
    originalDates(candidate('12/12/2025 - Evento'), { documentYear: 2026, analysisVersion: 3 })
      .start,
    '',
  );
  assert.equal(
    originalDates(candidate('20/12 a 10/01/2027 - Evento'), {
      documentYear: 2026,
      analysisVersion: 3,
    }).end,
    '2027-01-10',
  );
  const heading = suggestionsFromPages(
    [{ page: 1, text: 'DEZEMBRO 2026\n20/12/2025 - Evento' }],
    2026,
  );
  assert.equal(heading.candidates[0].dates?.sourceYear, 2025);
  assert.equal(heading.candidates[0].dates?.headerYear, 2026);
  assert.equal(
    originalDates(heading.candidates[0], { documentYear: 2026, analysisVersion: 3 }).start,
    '',
  );
  const old = { name: 'Evento', dates: extractHistoricalDates('12/12 - Evento') };
  assert.equal(originalDates(old, { documentYear: 2026, analysisVersion: 2 }).start, '');
  assert.equal(originalDates(old, { documentYear: 2026, analysisVersion: 3 }).start, '2026-12-12');
  assert.equal(originalDates(candidate('20/12/2026 a 10/01 - Evento')).start, '');
});

test('new candidate identity distinguishes identical lines under different month headings without renaming legacy keys', () => {
  const analysis = suggestionsFromPages(
    [{ page: 1, text: 'JANEIRO 2026\n05 Evento local\nFEVEREIRO 2026\n05 Evento local' }],
    2026,
  );
  assert.equal(analysis.candidates.length, 2);
  assert.notEqual(
    historyCandidateKey(analysis.candidates[0]),
    historyCandidateKey(analysis.candidates[1]),
  );
  assert.equal(
    historyCandidateKey({ page: 1, excerpt: '05 Evento local' }),
    JSON.stringify([1, '05 Evento local']),
  );
  const retry = suggestionsFromPages(analysis.pages, 2026);
  assert.deepEqual(
    retry.candidates.map(historyCandidateKey),
    analysis.candidates.map(historyCandidateKey),
  );
});
test('does not infer movable holidays, impossible dates, grids or ambiguous date lists', () => {
  const candidate = (line: string) => ({ name: line, dates: extractHistoricalDates(line) });
  assert.equal(proposedDates(candidate('29/02/2024 - Evento'), 2027).start, '');
  assert.equal(proposedDates(candidate('03/03 - Carnaval'), 2027).start, '');
  assert.equal(proposedDates(candidate('31/04 - Evento'), 2027).start, '');
  assert.equal(extractHistoricalDates('04 05 06 07 08 09 10', 2), null);
  assert.equal(extractHistoricalDates('01 e 03/05 - Evento'), null);
  assert.equal(extractHistoricalDates('15 - Entrega do PIT'), null);
  const parsed = suggestionsFromPages([
    { page: 1, text: 'JANEIRO\n05 Início das aulas' },
    { page: 2, text: '05 Início das aulas' },
  ]);
  assert.equal(parsed.candidates.length, 1);
});
