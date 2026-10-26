import { test } from 'vitest';
import assert from 'node:assert/strict';
import { historyCandidateKey, includedHistoryCandidate } from '../src/history-progress.ts';
import { extractHistoricalDates } from '../src/history-dates.ts';

test('progress follows the source even after renaming and resets when event is removed', () => {
  const first = { page: 1, excerpt: '10/05 Feira', name: 'Feira' },
    second = { page: 1, excerpt: '11/05 Feira', name: 'Feira' },
    list = [first, second];
  const events = [
    {
      name: 'Nome revisado',
      historicalSource: { historyId: 'pdf', page: 1, candidateKey: historyCandidateKey(first) },
    },
  ];
  assert(includedHistoryCandidate(JSON.parse(JSON.stringify(events)), 'pdf', first, list));
  assert(!includedHistoryCandidate(events, 'pdf', second, list));
  assert(!includedHistoryCandidate(events, 'other', first, list));
  assert(!includedHistoryCandidate([], 'pdf', first, list));
  assert(
    !includedHistoryCandidate(
      [{ name: 'Feira', historicalSource: { historyId: 'pdf', page: 1, candidateKey: 'invalid' } }],
      'pdf',
      first,
      list,
    ),
  );
});

import { existingHistoryEvent, historicalOccurrence } from '../src/history-progress.ts';

const occurrence = (candidate: Parameters<typeof historicalOccurrence>[2]) =>
  historicalOccurrence({ year: 2027 }, { documentYear: 2027, extractorVersion: 3 }, candidate);

const setup = {
  year: 2027,
  assessmentStagesByModality: { integrado: 4 },
  modalities: ['integrado', 'graduacao'],
};
test('a similar obligation without occurrence dates never hides a distinct historical occurrence', () => {
  for (const [requirementId, name] of [
    ['pit-1', 'Prazo final de entrega do PIT do 1º semestre'],
    ['enrolment-2', 'Rematrícula dos estudantes do 2º semestre'],
    ['adjustment-1', 'Ajuste de matrícula dos veteranos do 1º semestre'],
    ['extraordinary-council', 'Conselho extraordinário'],
  ]) {
    const event = { name: 'Nome revisado', requirementId, start: '2027-02-09', end: '2027-04-20' };
    assert.equal(existingHistoryEvent([event], occurrence({ name }), setup), null);
    assert.equal(
      existingHistoryEvent([{ ...event, modalities: ['integrado'] }], occurrence({ name }), setup),
      null,
    );
    assert.equal(existingHistoryEvent([], occurrence({ name }), setup), null);
  }
});

test('combined bimonthly and semester stages do not hide suggestions inferred from names or links', () => {
  const state = {
    year: 2027,
    modalities: ['integrado', 'subsequente'],
    assessmentStagesByModality: { integrado: 4, subsequente: 2 },
  };
  const events = state.modalities.map((modality) => ({
    id: modality,
    name: `1ª etapa — ${modality}`,
    requirementId: `stage-1:${modality}`,
    start: '2027-02-09',
    end: '2027-04-20',
    modalities: [modality],
  }));
  const before = structuredClone(events);
  for (const name of ['Início do 1º Bimestre', 'Término do 1º Semestre']) {
    const candidate = {
      name,
      dates: {
        startMonth: 2,
        startDay: 9,
        endMonth: 4,
        endDay: 20,
        sourceYear: 2027,
        endYear: 2027,
      },
    };
    assert.equal(existingHistoryEvent(events, occurrence(candidate), state), null);
    assert.equal(
      existingHistoryEvent(events, occurrence(candidate), {
        ...state,
        modalities: [...state.modalities].reverse(),
      }),
      null,
    );
    const exact = events.map((event) => ({ ...event, name }));
    assert.equal(existingHistoryEvent(exact, occurrence(candidate), state), exact[0]);
    assert.equal(existingHistoryEvent(exact.slice(0, 1), occurrence(candidate), state), null);
    assert.equal(
      existingHistoryEvent(
        exact,
        occurrence({ ...candidate, dates: { ...candidate.dates, startDay: 10 } }),
        state,
      ),
      null,
    );
  }
  assert.deepEqual(events, before);
});

test('same names require matching dates and keep distinct recurring events', () => {
  const candidate = {
    name: 'FEIRA LOCAL',
    dates: {
      startMonth: 5,
      startDay: 10,
      endMonth: 5,
      endDay: 10,
      sourceYear: 2027,
      endYear: 2027,
    },
  };
  const event = { name: 'Feira local', start: '2027-05-10', end: '2027-05-10' };
  assert.equal(existingHistoryEvent([event], occurrence(candidate), setup), event);
  assert.equal(
    existingHistoryEvent([{ ...event, start: '2027-05-11' }], occurrence(candidate), setup),
    null,
  );
  assert.equal(existingHistoryEvent([event], occurrence({ name: 'Feira local' }), setup), null);
  const notice = {
    ...event,
    admission: { type: 'regular' as const, year: 2028, term: 'annual' as const },
  };
  assert.equal(existingHistoryEvent([notice], occurrence(candidate), setup), null);
  assert.equal(
    existingHistoryEvent(
      [notice],
      occurrence({ ...candidate, admission: { type: 'transfer', year: 2027, term: 'annual' } }),
      setup,
    ),
    null,
  );
});

test('an occurrence whose year comes from the analysis heading finds the same manually registered fact', () => {
  const dates = extractHistoricalDates('05 Feriado municipal', 3, {
    headerYear: 2026,
    documentYear: 2026,
  })!;
  const candidate = { name: dates.name, dates };
  const event = {
    name: dates.name,
    start: '2026-03-05',
    end: '2026-03-05',
    modalities: ['integrado'],
  };
  assert.equal(
    existingHistoryEvent(
      [event],
      historicalOccurrence({ year: 2026 }, { documentYear: 2026, extractorVersion: 3 }, candidate),
      { year: 2027, modalities: ['integrado'] },
    ),
    event,
  );
  for (const analysis of [
    undefined,
    { documentYear: 2026, extractorVersion: 2 },
    { documentYear: 2025, extractorVersion: 3 },
  ]) {
    assert.equal(
      existingHistoryEvent([event], historicalOccurrence({ year: 2026 }, analysis, candidate), {
        year: 2027,
        modalities: ['integrado'],
      }),
      null,
      'missing, old or conflicting analysis context must remain unresolved',
    );
  }
});

test('one source can support distinct intentions and partial offer coverage remains visible', () => {
  const candidate = { name: 'Edital', page: 1, excerpt: '10/12/2026 Edital' };
  const event = {
    name: 'Edital',
    recordType: 'prior-reference' as const,
    modalities: ['integrado'],
    historicalSource: {
      historyId: 'pdf',
      analysisId: 'original',
      page: 1,
      candidateKey: historyCandidateKey(candidate),
    },
  };
  assert.equal(
    includedHistoryCandidate([event], 'pdf', candidate, [candidate], { recordType: 'event' }),
    false,
  );
  assert.equal(
    includedHistoryCandidate([event], 'pdf', candidate, [candidate], {
      recordType: 'prior-reference',
      modalities: ['integrado', 'graduacao'],
    }),
    false,
  );
  assert.equal(
    includedHistoryCandidate([event], 'pdf', candidate, [candidate], {
      recordType: 'prior-reference',
      modalities: ['integrado'],
      analysisId: 'original',
    }),
    true,
  );
  assert.equal(
    includedHistoryCandidate([event], 'pdf', candidate, [candidate], {
      analysisId: 'new-extraction',
    }),
    false,
  );
});
