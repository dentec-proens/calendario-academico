import { test } from 'vitest';
import assert from 'node:assert/strict';
import { historyCandidateKey, includedHistoryCandidate } from '../src/history-progress.ts';

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

import { existingHistoryEvent } from '../src/history-progress.ts';

const setup = {
  year: 2027,
  assessmentStagesByModality: { integrado: 4 },
  modalities: ['integrado', 'graduacao'],
};
test('history recognizes non-stage obligations while respecting their modality scope', () => {
  for (const [requirementId, name] of [
    ['pit-1', 'Prazo final de entrega do PIT do 1º semestre'],
    ['enrolment-2', 'Rematrícula dos estudantes do 2º semestre'],
    ['adjustment-1', 'Ajuste de matrícula dos veteranos do 1º semestre'],
    ['extraordinary-council', 'Conselho extraordinário'],
  ]) {
    const event = { name: 'Nome revisado', requirementId, start: '2027-02-09', end: '2027-04-20' };
    assert.equal(existingHistoryEvent([event], { name }, setup), event);
    assert.equal(
      existingHistoryEvent([{ ...event, modalities: ['integrado'] }], { name }, setup),
      null,
    );
    assert.equal(existingHistoryEvent([], { name }, setup), null);
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
    const candidate = { name, dates: { startMonth: 2, startDay: 9, endMonth: 4, endDay: 20 } };
    assert.equal(existingHistoryEvent(events, candidate, state), null);
    assert.equal(
      existingHistoryEvent(events, candidate, {
        ...state,
        modalities: [...state.modalities].reverse(),
      }),
      null,
    );
    const exact = events.map((event) => ({ ...event, name }));
    assert.equal(existingHistoryEvent(exact, candidate, state), exact[0]);
    assert.equal(existingHistoryEvent(exact.slice(0, 1), candidate, state), null);
    assert.equal(
      existingHistoryEvent(
        exact,
        { ...candidate, dates: { ...candidate.dates, startDay: 10 } },
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
    dates: { startMonth: 5, startDay: 10, endMonth: 5, endDay: 10 },
  };
  const event = { name: 'Feira local', start: '2027-05-10', end: '2027-05-10' };
  assert.equal(existingHistoryEvent([event], candidate, setup), event);
  assert.equal(existingHistoryEvent([{ ...event, start: '2027-05-11' }], candidate, setup), null);
  assert.equal(existingHistoryEvent([event], { name: 'Feira local' }, setup), null);
});
