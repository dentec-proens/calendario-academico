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

test('the situation accepts any calendar status and each screen narrows it', () => {
  expect(applicationSearch({ situacao: 'em_revisao' })).toEqual({ situacao: 'em_revisao' });
  expect(applicationSearch({ situacao: 'enviado' })).toEqual({ situacao: 'enviado' });
  expect(applicationSearch({ situacao: 'constructor' })).toEqual({});
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
    'stage:stage:first:3:integrado',
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

test('the printed version is official by default and complete only by `impressao=completa`', () => {
  expect(applicationSearch(parseApplicationSearch('?impressao=completa'))).toEqual({
    impressao: 'completa',
  });
  expect(stringifyApplicationSearch({ impressao: 'completa' })).toBe('?impressao=completa');
  for (const value of ['oficial', 'completo', 'COMPLETA', ''])
    expect(applicationSearch(parseApplicationSearch(`?impressao=${value}`))).toEqual({});
  expect(applicationSearch({ impressao: ['completa'] })).toEqual({});
});

test('the visibility of dates is every date by default, official or internal', () => {
  for (const value of ['oficiais', 'internas'] as const)
    expect(applicationSearch(parseApplicationSearch(`?atividadeVisibilidade=${value}`))).toEqual({
      atividadeVisibilidade: value,
    });
  for (const value of ['todas', 'interna', 'Internas', ''])
    expect(applicationSearch(parseApplicationSearch(`?atividadeVisibilidade=${value}`))).toEqual(
      {},
    );
});

test('the account filter accepts only known profiles', () => {
  expect(applicationSearch({ perfil: 'PARECERISTA' }).perfil).toBe('PARECERISTA');
  expect(applicationSearch({ perfil: 'outro' }).perfil).toBeUndefined();
});
