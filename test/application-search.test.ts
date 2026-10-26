import { expect, test } from 'vitest';
import {
  applicationSearch,
  parseApplicationSearch,
  stringifyApplicationSearch,
} from '../web/app/search.ts';

test('typed filters retain readable scalar URLs and reject repeated or invalid values', () => {
  expect(applicationSearch(parseApplicationSearch('?ano=2029&situacao=vigente'))).toEqual({
    ano: '2029',
    situacao: 'vigente',
  });
  expect(stringifyApplicationSearch({ ano: '2029', situacao: 'vigente', campus: undefined })).toBe(
    '?ano=2029&situacao=vigente',
  );
  expect(applicationSearch(parseApplicationSearch('?ano=2029&ano=2030&situacao=invalid'))).toEqual(
    {},
  );
  expect(applicationSearch({ ano: 1899, situacao: ['vigente'], campus: ['campus-a'] })).toEqual({});
});
