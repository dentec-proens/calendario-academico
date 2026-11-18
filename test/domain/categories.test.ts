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
  for (const [key, , color] of categories.filter((c) => c[2])) {
    assert.match(css, new RegExp(`--cat-${key}:\\s*${color};`, 'u'));
    assert.match(
      css,
      new RegExp(`\\.cat-${key}\\s*\\{\\s*background:\\s*var\\(--cat-${key}\\)`, 'u'),
    );
  }
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
  // Every category of the date shares the cell in equal diagonal bands, by priority.
  assert(
    html.includes(
      '<td class="cat-split" style="--bands: var(--cat-feriado) 0% 10%, var(--cat-recesso) 10% 20%, var(--cat-ferias) 20% 30%, var(--cat-limite) 30% 40%, var(--cat-sabado) 40% 50%, var(--cat-formacao) 50% 60%, var(--cat-conselho) 60% 70%, var(--cat-criacao) 70% 80%, var(--cat-evento) 80% 90%, var(--cat-comemorativo) 90% 100%"',
    ),
  );
  // February, with its ten dates, splits in two columns; the other months keep one.
  assert.equal((html.match(/class="event-columns"/g) || []).length, 1);
  assert.equal((html.match(/class="event-columns single"/g) || []).length, 11);
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

test('the key lists only the categories the calendar uses', () => {
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
  const start = html.indexOf('class="proens-key"');
  const key = html.slice(start, html.indexOf('</section>', start));
  assert(key.includes('cat-feriado'));
  assert(!key.includes('cat-ferias'));
  assert(!key.includes('cat-sabado'));
});

test('a commemoration of several days reads in the list and leaves the grid uncolored', () => {
  const state = { year: 2027, campus: 'Foz', periods: [], offers: [] };
  const commemoration = (id: string, start: string, end: string) => ({
    id,
    name: id,
    start: civilDate(start),
    end: civilDate(end),
    effect: 'note' as const,
    category: 'comemorativo',
    offers: ['integrado'],
  });
  const grid = (html: string) => {
    const october = html.indexOf('<h3>outubro</h3><table class="month-grid">');
    return html.slice(october, html.indexOf('</table>', october));
  };
  const month = proensLayout(state, [commemoration('Mês da Ciência', '2027-10-01', '2027-10-31')]);
  assert(!grid(month).includes('cat-comemorativo'));
  assert(month.includes('<td class="cat-comemorativo">1 a 31</td><td>Mês da Ciência'));
  // The key still explains the color the list shows.
  assert(month.slice(month.indexOf('class="proens-key"')).includes('swatch cat-comemorativo'));
  // A commemoration of one day still colors its day.
  const day = proensLayout(state, [commemoration('Dia do Livro', '2027-10-29', '2027-10-29')]);
  assert(grid(day).includes('class="cat-comemorativo" title="Dia do Livro">29</td>'));
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
