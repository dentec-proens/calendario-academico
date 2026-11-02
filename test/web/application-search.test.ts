import { expect, test } from 'vitest';
import {
  applicationSearch,
  parseApplicationSearch,
  stringifyApplicationSearch,
} from '../../web/app/search.ts';

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

test('view, pendency, origin and situation are separate step filters without aliases', () => {
  expect(
    applicationSearch(
      parseApplicationSearch(
        '?atividadeVisao=data&atividadePendencia=preencher&atividadeOrigem=campus&atividadeSituacao=partial',
      ),
    ),
  ).toEqual({
    atividadeVisao: 'data',
    atividadePendencia: 'preencher',
    atividadeOrigem: 'campus',
    atividadeSituacao: 'partial',
  });
  // Former view values and the former "all" situation are dropped, like any unknown value.
  expect(
    applicationSearch(
      parseApplicationSearch('?atividadeVisao=preencher&atividadeSituacao=all&aba=eventos'),
    ),
  ).toEqual({});
});

test('the activity of a review link is a complete key, kept readable in the URL', () => {
  for (const key of [
    'family-meeting',
    'final:cycle:first',
    'pit:semester:second',
    'stage:stage:unclassified:3:integrado',
    'results:stage:first:2:graduacao',
  ]) {
    expect(applicationSearch(parseApplicationSearch(`?atividade=${key}`))).toEqual({
      atividade: key,
    });
    expect(stringifyApplicationSearch({ atividade: key })).toBe(`?atividade=${key}`);
    expect(
      applicationSearch(parseApplicationSearch(`?atividade=${encodeURIComponent(key)}`)),
    ).toEqual({ atividade: key });
  }
});

test('any other activity value is dropped and flagged, and the flag never reaches the URL', () => {
  for (const value of ['final-1', 'stage-1:integrado', 'final:cycle', 'unknown-activity']) {
    const search = applicationSearch(parseApplicationSearch(`?atividade=${value}&ano=2027`));
    expect(search).toEqual({ ano: '2027', atividadeInvalida: true });
    expect(stringifyApplicationSearch(search)).toBe('?ano=2027');
  }
  expect(applicationSearch({ atividade: 'x'.repeat(201) })).toEqual({ atividadeInvalida: true });
  expect(applicationSearch({ atividade: '' })).toEqual({});
  expect(applicationSearch({ atividade: ['final:cycle:first'] })).toEqual({});
});
