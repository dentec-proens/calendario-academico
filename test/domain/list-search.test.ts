import { expect, test } from 'vitest';
import { matchesSearch, searchText } from '../../src/shared/search-text.ts';
import { textLinkParts } from '../../src/shared/text-links.ts';

test('search folds accents and case in both directions', () => {
  expect(searchText('Ação ÚNICA')).toBe('acao unica');
  expect(matchesSearch('acao', 'Ação')).toBe(true);
  expect(matchesSearch('AÇÃO', 'acao')).toBe(true);
});

test('every word of the search must appear, in any field and order', () => {
  expect(matchesSearch('2027 umuarama', 'Campus Umuarama', 'Ano 2027')).toBe(true);
  expect(matchesSearch('2028 umuarama', 'Campus Umuarama', 'Ano 2027')).toBe(false);
  expect(matchesSearch('   ', 'qualquer')).toBe(true);
});

test('only web addresses become links, without the punctuation around them', () => {
  expect(textLinkParts('Resolução 292/2025')).toEqual([{ text: 'Resolução 292/2025' }]);
  expect(textLinkParts('Veja https://ifpr.edu.br/a?b=1. Depois (http://x.org).')).toEqual([
    { text: 'Veja ' },
    { text: 'https://ifpr.edu.br/a?b=1', href: 'https://ifpr.edu.br/a?b=1' },
    { text: '. Depois (' },
    { text: 'http://x.org', href: 'http://x.org/' },
    { text: ').' },
  ]);
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,x', 'ftp://ifpr.edu.br/a'])
    expect(textLinkParts(unsafe)).toEqual([{ text: unsafe }]);
  // A web address cannot smuggle another scheme, and an unparsable one stays as text.
  expect(textLinkParts('https://')).toEqual([{ text: 'https://' }]);
});
