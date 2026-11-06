import { expect, test } from 'vitest';
import { conclusionBlock } from '../../src/domain/reviews/conclusion-block.ts';

const criteria = [{ id: 'I' }, { id: 'II' }];
const confirmed = (id: string, status = 'ATENDIDO') => ({ id, reviewed: true, status });
const ready = {
  baseCompatible: true,
  reviewCurrent: true,
  criteria,
  entries: [confirmed('I'), confirmed('II')],
};

test('a saved, current and fully confirmed review can be concluded', () => {
  expect(conclusionBlock(ready)).toBeNull();
});

test('a changed base is reported first, because only returning resolves it', () => {
  expect(conclusionBlock({ ...ready, baseCompatible: false, reviewCurrent: false })).toMatch(
    /base institucional mudou/,
  );
});

test('a review not saved for this submission asks for saving before counting criteria', () => {
  expect(conclusionBlock({ ...ready, reviewCurrent: false, entries: [] })).toMatch(/^Salve/);
});

test('the reason counts the criteria missing, confirmed or still pending', () => {
  expect(conclusionBlock({ ...ready, entries: [confirmed('I')] })).toMatch(/^Falta 1 critério:/);
  expect(
    conclusionBlock({
      ...ready,
      entries: [{ id: 'I', reviewed: false, status: 'ATENDIDO' }, confirmed('II', 'PENDENTE')],
    }),
  ).toMatch(/^Faltam 2 critérios:/);
});

test('a criterion not met points to returning the calendar', () => {
  expect(
    conclusionBlock({ ...ready, entries: [confirmed('I'), confirmed('II', 'NAO_ATENDIDO')] }),
  ).toMatch(/Devolva o calendário/);
});
