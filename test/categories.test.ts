import { test } from 'vitest';
import assert from 'node:assert/strict';
import { categories, eventCategory } from '../src/domain/calendar/activities/categories.ts';
import { proensLayout } from '../src/printing/calendar-layout.ts';
import { readFile } from 'node:fs/promises';

test('PROENS palette matches reference and simultaneous classifications remain visible', async () => {
  const css = await readFile(new URL('../assets/printing/calendar.css', import.meta.url), 'utf8');
  assert.equal(categories.filter((c) => c[2]).length, 10);
  for (const [key, , color] of categories.filter((c) => c[2]))
    assert.match(
      css,
      new RegExp(`\\.cat-${key}\\s*\\{\\s*background:\\s*${color}(?=[\\s;}])`, 'u'),
    );
  assert.equal(
    eventCategory({
      id: 'inst:ifpr2027-21',
      name: 'Criação do IFPR e da Rede Federal de EPT',
      category: 'criacao',
    }),
    'criacao',
  );
  const events = categories
    .filter((c) => c[2])
    .map(([category], i) => ({
      id: String(i),
      name: category,
      start: '2027-02-06',
      end: '2027-02-06',
      kind: 'note',
      category,
    }));
  const html = proensLayout({ year: 2027, campus: 'Foz', periods: [] }, events, null, null);
  assert(html.includes('class="cat-feriado"'));
  assert(html.includes('color-mark cat-formacao'));
  assert(html.includes('color-mark cat-conselho'));
  assert.equal((html.match(/class="event-columns"/g) || []).length, 12);
  assert(html.includes('ifpr-logo'));
  for (const [, label, color] of categories) if (color) assert(html.includes(label!));
});

test('canonical institutional scopes preserve the printed legend while local scopes remain explicit', () => {
  const state = { year: 2027, campus: 'Foz', modalities: ['integrado'], periods: [] };
  const event = {
    id: 'fixture',
    name: 'Feriado institucional',
    start: '2027-02-06',
    end: '2027-02-06',
    kind: 'exclude',
    category: 'feriado',
    modalities: ['integrado'],
  };
  const institutional = proensLayout(state, [{ ...event, institutional: true }]);
  const local = proensLayout(state, [{ ...event, institutional: false }]);
  assert(!institutional.includes('Feriado institucional [Técnico integrado]'));
  assert(local.includes('Feriado institucional [Técnico integrado]'));
});
