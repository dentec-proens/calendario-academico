import { expect, test } from 'vitest';
import { criteriaToReturn, fillReturnNote } from '../../src/domain/reviews/returned-criteria.ts';

const criteria = [
  { id: 'a', title: 'Primeiro' },
  { id: 'b', title: 'Segundo' },
  { id: 'c', title: 'Terceiro' },
];
const entry = (id: string, status: string, notes = '', reviewed = true) => ({
  id,
  status,
  notes,
  reviewed,
});
const current = { submissionId: 'round-2', rulesetVersion: 'consup-292-2027-v9' };

test('only an assessed "Não atendido" of this round and rules goes to the campus, in criteria order', () => {
  const review = {
    submissionId: 'round-2',
    rulesetVersion: 'consup-292-2027-v9',
    entries: [
      entry('c', 'NAO_ATENDIDO', '  Observação.  '),
      entry('a', 'NAO_ATENDIDO'),
      entry('b', 'NAO_ATENDIDO', 'Só sugestão', false),
    ],
  };
  expect(criteriaToReturn(criteria, review, current)).toEqual([
    { criterionId: 'a', title: 'Primeiro' },
    { criterionId: 'c', title: 'Terceiro', note: 'Observação.' },
  ]);
  expect(criteriaToReturn(criteria, null, current)).toEqual([]);
  expect(criteriaToReturn(criteria, { ...review, submissionId: 'round-1' }, current)).toEqual([]);
  expect(
    criteriaToReturn(criteria, { ...review, rulesetVersion: 'consup-292-2027-v1' }, current),
  ).toEqual([]);
});

const returned = [
  { criterionId: 'a', title: 'Primeiro' },
  { criterionId: 'c', title: 'Terceiro', note: 'Falta a data.' },
];

test('filling an empty note lists each criterion with its observation', () => {
  expect(fillReturnNote('', returned, 4000)).toEqual({
    note: 'Critérios não atendidos:\n- Primeiro\n- Terceiro: Falta a data.',
    added: 2,
    left: [],
  });
});

test('filling keeps what was typed and does not repeat a criterion', () => {
  const typed = fillReturnNote('Reveja o calendário.\n', returned, 4000);
  expect(typed.note).toBe(
    'Reveja o calendário.\n\nCritérios não atendidos:\n- Primeiro\n- Terceiro: Falta a data.',
  );
  expect(fillReturnNote(typed.note, returned, 4000)).toEqual({
    note: typed.note,
    added: 0,
    left: [],
  });
  // Only what is missing joins the list already in the note.
  const partial = fillReturnNote('Critérios não atendidos:\n- Primeiro', returned, 4000);
  expect(partial.note).toBe('Critérios não atendidos:\n- Primeiro\n\n- Terceiro: Falta a data.');
  expect(partial.added).toBe(1);
});

test('only whole criteria enter a note at its limit, naming the ones left out', () => {
  const limit = 'Critérios não atendidos:\n- Primeiro'.length;
  expect(fillReturnNote('', returned, limit)).toEqual({
    note: 'Critérios não atendidos:\n- Primeiro',
    added: 1,
    left: ['Terceiro'],
  });
  expect(fillReturnNote('Já cheia', returned, 8)).toEqual({
    note: 'Já cheia',
    added: 0,
    left: ['Primeiro', 'Terceiro'],
  });
});
