import { civilDate } from '../../src/domain/civil-date.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { categories, eventCategory } from '../../src/domain/calendar/activities/categories.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { readFile } from 'node:fs/promises';

test('PROENS palette matches reference and simultaneous classifications remain visible', async () => {
  const css = await readFile(
    new URL('../../assets/printing/calendar.css', import.meta.url),
    'utf8',
  );
  assert.equal(categories.filter((c) => c[2]).length, 10);
  for (const [key, , color] of categories.filter((c) => c[2]))
    assert.match(
      css,
      new RegExp(`\\.cat-${key}\\s*\\{\\s*background:\\s*${color}(?=[\\s;}])`, 'u'),
    );
  assert.equal(eventCategory({ category: 'criacao' }), 'criacao');
  const events = categories
    .filter((c) => c[2])
    .map(([category], i) => ({
      id: String(i),
      name: category,
      start: civilDate('2027-02-06'),
      end: civilDate('2027-02-06'),
      effect: 'note' as const,
      category,
      offers: ['integrado'],
    }));
  const html = proensLayout(
    { year: 2027, campus: 'Foz', periods: [], offers: [] },
    events,
    null,
    null,
  );
  assert(html.includes('class="cat-feriado"'));
  assert(html.includes('color-mark cat-formacao'));
  assert(html.includes('color-mark cat-conselho'));
  assert.equal((html.match(/class="event-columns"/g) || []).length, 12);
  assert(html.includes('ifpr-logo'));
  for (const [, label, color] of categories) if (color) assert(html.includes(label!));
});

test('institutional and local scopes identify their actual offer in v4 printing', () => {
  const offer = (id: 'integrado' | 'subsequente') => ({
    id,
    kind: id,
    delivery: 'a-conferir' as const,
    organization: 'anual' as const,
  });
  const state = {
    year: 2027,
    campus: 'Foz',
    periods: [],
    offers: [offer('integrado'), offer('subsequente')],
  };
  const event = {
    id: 'fixture',
    name: 'Feriado institucional',
    start: civilDate('2027-02-06'),
    end: civilDate('2027-02-06'),
    effect: 'exclude' as const,
    category: 'feriado',
    offers: ['integrado'],
  };
  const institutional = proensLayout(state, [{ ...event, institutional: true }]);
  const local = proensLayout(state, [{ ...event, institutional: false }]);
  assert(institutional.includes('Feriado institucional [Técnico integrado]'));
  assert(local.includes('Feriado institucional [Técnico integrado]'));
  // One offer, or a date over every offer, prints no list.
  const single = { ...state, offers: [offer('integrado')] };
  assert(proensLayout(single, [event]).includes('Feriado institucional</td>'));
  const both = proensLayout(state, [{ ...event, offers: ['integrado', 'subsequente'] }]);
  assert(both.includes('Feriado institucional</td>'));
});

test('the key lists only the categories the grid marks', () => {
  const state = { year: 2027, campus: 'Foz', periods: [], offers: [] };
  const html = proensLayout(state, [
    {
      id: 'holiday',
      name: 'Feriado',
      start: civilDate('2027-02-06'),
      end: civilDate('2027-02-06'),
      effect: 'exclude' as const,
      category: 'feriado',
      offers: ['integrado'],
    },
  ]);
  const key = html.slice(html.indexOf('class="proens-key"'), html.indexOf('</div><p>· Dia letivo'));
  assert(key.includes('cat-feriado'));
  assert(!key.includes('cat-ferias'));
  assert(!key.includes('cat-sabado'));
});

test('dates of different offers with the same description print once, with their offers together', () => {
  const offer = (id: 'integrado' | 'subsequente') => ({
    id,
    kind: id,
    delivery: 'presencial' as const,
    organization: 'anual' as const,
  });
  const period = (id: string, offers: string[]) => ({
    id,
    name: `Ano letivo — ${id}`,
    start: civilDate('2027-02-08'),
    end: civilDate('2027-12-17'),
    association: { status: 'defined' as const, offers, term: 'annual' as const },
  });
  const state = {
    year: 2027,
    campus: 'Foz',
    offers: [offer('integrado'), offer('subsequente')],
    periods: [period('p1', ['integrado']), period('p2', ['subsequente'])],
  };
  const date = (id: string, offers: string[]) => ({
    id,
    name: 'Reunião de planejamento',
    start: civilDate('2027-03-03'),
    end: civilDate('2027-03-03'),
    effect: 'note' as const,
    category: 'formacao',
    offers,
  });
  const html = proensLayout(state, [date('a', ['integrado']), date('b', ['subsequente'])]);
  assert.equal(html.match(/Início — Ano letivo/g)?.length, 1);
  assert(html.includes('Início — Ano letivo</td>'));
  // One row in the list; the grid title still names each date.
  assert.equal(html.match(/<td>Reunião de planejamento/g)?.length, 1);
  assert(html.includes('Reunião de planejamento</td>'));
  const only = proensLayout(state, [date('a', ['integrado'])]);
  assert(only.includes('Reunião de planejamento [Técnico integrado]'));
});
