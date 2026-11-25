import { printMark } from '../domain/calendar/lifecycle.ts';
import { civilDate } from '../domain/civil-date.ts';
import { automaticEventSource } from '../domain/calendar/counting/core.ts';
import type { PrintState, PrintResult, PrintRecord, PrintEvent, DistributionRow } from './types.ts';
import type { CalendarPeriod } from '../domain/calendar/model.ts';
import { termLabels } from '../domain/calendar/config.ts';
import { teachingDayBreakdown } from './teaching-day-breakdown.ts';
import { categories, eventCategory } from '../domain/calendar/activities/categories.ts';
import { isAssessmentStage } from '../domain/calendar/activities/activity-ref.ts';
import {
  defaultSchoolVacationName,
  isVacationActivity,
  startsDecemberVacation,
  vacationKind,
} from '../domain/calendar/activities/vacations.ts';
import { associationOffers, labelFor, offerIds } from '../domain/calendar/offers.ts';
import { executionLabels } from '../domain/calendar/activities/plan-evaluation.ts';
import { canBeInternal, isInternalDate } from '../domain/calendar/internal-dates.ts';

/**
 * Printed version of the calendar. The official version, sent to Proens and
 * published (arts. 15 and 16), leaves internal dates out; the complete one marks them.
 */
export type PrintVersion = 'official' | 'complete';

/** Heading of the complete version, which never replaces the official calendar. */
export const completeVersionNote =
  'Versão completa: inclui datas de organização interna (art. 18); não substitui o calendário oficial';

/**
 * A date the campus marked internal and that may be internal under the single eligibility rule.
 * A mark on an ineligible date, which saving refuses, keeps the date in the official version.
 */
export const printsAsInternal = (event: PrintEvent) =>
  isInternalDate(event) && canBeInternal(event);

export const hasInternalDates = (events: readonly PrintEvent[]) => events.some(printsAsInternal);

const internalLabel = (event: PrintEvent) =>
  printsAsInternal(event) ? '<small class="internal-date-label">Data interna</small>' : '';

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const dateLabel = (date: string | undefined, year?: number) =>
  (date?.startsWith(`${year}-`) ? date.slice(5) : date)?.split('-').reverse().join('/') || '';
const fullInterval = (event: PrintEvent) =>
  dateLabel(event.start) + (event.end === event.start ? '' : ` a ${dateLabel(event.end)}`);
/**
 * Offers printed beside a date: only when the calendar has several offers and the date reaches
 * part of them. A calendar with one offer, or a date over every offer, prints no list, nor does a
 * date whose description already names its only offer.
 */
function eventOffers(state: PrintState, event: PrintEvent) {
  const all = state.offers ? offerIds(state) : [];
  const listed = event.offers;
  if (all.length < 2 || all.every((id) => listed.includes(id))) return '';
  const labels = listed.map((id) => labelFor(state, id));
  // A date of one offer whose description already ends with that offer, as the stage dates the
  // organization creates, does not repeat it.
  if (labels.length === 1 && event.name?.endsWith(` — ${labels[0]}`)) return '';
  return labels.join(', ');
}

/** Label of a period boundary: its cycle. */
const boundaryName = (edge: 'Início' | 'Término', period: CalendarPeriod) =>
  `${edge} — ${
    period.association.term === 'annual' ? 'Ano letivo' : termLabels[period.association.term]
  }`;

/**
 * Entries of a month, one row per date and description: dates of different offers with the same
 * interval, description and details print once, with their offers together.
 */
function mergedEntries(state: PrintState, events: PrintEvent[]): PrintEvent[] {
  const merged = new Map<string, PrintEvent>();
  for (const event of events) {
    const key = [
      event.start,
      event.end,
      event.name ?? '',
      eventCategory(event),
      printsAsInternal(event),
      publicationDetails(event, state.year),
    ].join('\0');
    const previous = merged.get(key);
    merged.set(
      key,
      previous
        ? { ...previous, offers: [...new Set([...previous.offers, ...event.offers])] }
        : event,
    );
  }
  return mergedVacations(state, [...merged.values()]);
}

/**
 * School and teacher vacations with the same dates print as one line when it says no more than the
 * data: the default name and every offer of the calendar. The two records stay.
 */
function mergedVacations(state: PrintState, events: PrintEvent[]) {
  const all = state.offers ? offerIds(state) : [];
  const fits = (event: PrintEvent) =>
    vacationKind(event.activity) === 'school' &&
    event.name === defaultSchoolVacationName &&
    all.every((id) => event.offers.includes(id));
  return events.flatMap((event) => {
    if (
      vacationKind(event.activity) === 'teacher' &&
      events.some((other) => sameRange(other, event) && fits(other))
    )
      return [];
    const teacher = fits(event)
      ? events.find(
          (other) => vacationKind(other.activity) === 'teacher' && sameRange(other, event),
        )
      : undefined;
    return [
      teacher
        ? { ...event, name: teacher.name?.replace('docentes', 'escolares e docentes') }
        : event,
    ];
  });
}

const sameRange = (a: PrintEvent, b: PrintEvent) => a.start === b.start && a.end === b.end;

/** The line of a period that runs to the end of the year says where it starts (`startsDecemberVacation`). */
function printedVacationName(event: PrintEvent, year: number) {
  if (!isVacationActivity(event.activity) || !startsDecemberVacation(event, year))
    return event.name;
  return event.name?.startsWith('Férias ')
    ? `Início das f${event.name.slice(1)}`
    : `Início: ${event.name}`;
}

/**
 * Execution, admission and source of a notice. Outside the annual grid the group heading already
 * states the execution and the row prints its own source, so both can be left out.
 */
function publicationDetails(
  event: PrintEvent,
  year: number,
  { execution = true, source: includeSource = true } = {},
) {
  const labels = [];
  const publication = event.notice?.publication;
  const admission = event.notice?.admission;
  if (execution && publication) labels.push(executionLabels[publication]);
  if (admission) {
    const term = {
      annual: 'ciclo anual',
      first: '1º semestre',
      second: '2º semestre',
    }[admission.term];
    labels.push(`Ingresso${admission.year === year ? '' : ` ${admission.year}`} — ${term}`);
    labels.push(
      admission.type === 'regular'
        ? 'Processo seletivo regular'
        : 'Transferência, reingresso e portador de diploma',
    );
  }
  const source = automaticEventSource(event);
  if (includeSource && (admission || publication) && source) labels.push(`Fonte: ${source}`);
  return labels.length ? `<small>${labels.map(esc).join(' · ')}</small>` : '';
}

/** Multi-day boundary intervals (teaching periods and assessment stages) print as start/end markers. */
const isBoundaryInterval = (event: PrintEvent) =>
  event.start !== event.end &&
  (eventCategory(event) === 'limite' || isAssessmentStage(event.activity));

const boundaryEntry = (edge: 'Início' | 'Término', event: PrintEvent): PrintEvent => {
  const date = edge === 'Início' ? event.start : event.end;
  // Saved stage names generated from the checklist may already contain "— início e término".
  const label = event.name?.replace(/\s*[—–-]\s*início e término\b/i, '').trim();
  return {
    ...event,
    start: date,
    end: date,
    name: label ? `${edge} — ${label}` : edge,
  };
};

/**
 * Whether a date colors this day of the grid. A long stage marks only its first and last days; a
 * commemoration of several days, such as a national month or week, marks none, since it occupies
 * no day: it reads in the month's list.
 */
function paintsDay(e: PrintEvent, date: string) {
  const category = eventCategory(e);
  if (category === 'limite' || isAssessmentStage(e.activity))
    return e.start === date || e.end === date;
  if (category === 'comemorativo') return e.start === e.end;
  return true;
}

/** Equal diagonal bands, one per category, for a date that belongs to several. */
const splitBands = (keys: string[]) =>
  keys
    .map(
      (key, i) =>
        `var(--cat-${key}) ${Math.round((i * 100) / keys.length)}% ${Math.round(((i + 1) * 100) / keys.length)}%`,
    )
    .join(', ');

function externalReferences(state: PrintState, events: PrintEvent[]) {
  const rows = events.filter((event) => event.start < `${state.year}-01-01`);
  if (!rows.length) return '';
  const table = (title: string, items: PrintEvent[]) =>
    items.length
      ? `<h4>${esc(title)}</h4><table class="external-references"><thead><tr><th>Datas completas</th><th>Atividade e finalidade</th></tr></thead><tbody>${items.map((event) => `<tr><td>${esc(fullInterval(event))}</td><td>${esc(event.name)}${internalLabel(event)}${publicationDetails(event, state.year, { execution: false, source: false })}<small>${esc(eventOffers(state, event))}</small>${automaticEventSource(event) ? `<small>Fonte: ${esc(automaticEventSource(event))}</small>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '';
  return `<section class="proens-external-references"><h3>Atividades e referências de outros anos</h3><p>Datas fora de ${state.year}, registradas para referência: não contam como dias letivos.</p>${table(
    'Publicações programadas',
    rows.filter((event) => event.notice?.publication === 'planned'),
  )}${table(
    'Fatos anteriores registrados',
    rows.filter((event) => event.notice?.publication === 'published'),
  )}${table(
    'Registros informativos com data anterior — conferir natureza e execução',
    rows.filter((event) => !event.notice?.publication),
  )}</section>`;
}

function distributionTables(state: PrintState, events: PrintEvent[], result: PrintResult) {
  const weekdays: [number, string][] = [
    [1, 'Seg.'],
    [2, 'Ter.'],
    [3, 'Qua.'],
    [4, 'Qui.'],
    [5, 'Sex.'],
    [6, 'Sáb.'],
    [0, 'Dom.'],
  ];
  const table = (title: string, rows: DistributionRow[]) =>
    `<table class="teaching-distribution"><caption>${esc(title)}</caption><thead><tr><th scope="col">Intervalo</th>${weekdays.map(([, name]) => `<th scope="col">${name}</th>`).join('')}<th scope="col">Total</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.label)}${r.start && r.end ? `<small>${dateLabel(r.start, state.year)} a ${dateLabel(r.end, state.year)}</small>` : ''}</th>${weekdays.map(([day]) => `<td>${r.available ? r.byWeekday![day] : '—'}</td>`).join('')}<td><strong>${r.available ? r.total : '—'}</strong></td></tr>`).join('')}</tbody></table>`;
  return offerIds(state)
    .map((modality) => {
      const report = teachingDayBreakdown(state, events, result, modality);
      const stages = report.stageGroups.length
        ? report.stageGroups.map((group) => table(group.label, group.rows)).join('')
        : report.stages.length
          ? table('Distribuição por ' + report.stageLabel, report.stages)
          : '';
      return `<section class="teaching-distribution-group"><h4>Dias letivos — ${esc(labelFor(state, modality))}</h4>${table('Distribuição por mês', report.months)}${stages}${report.showSemesters ? table('Distribuição por semestre letivo', report.semesters) : ''}${table('Consolidado anual', [report.annual])}${report.notes.map((note) => `<p>${esc(note)}</p>`).join('')}</section>`;
    })
    .join('');
}

export function proensLayout(
  state: PrintState,
  events: PrintEvent[],
  result: PrintResult = null,
  record?: PrintRecord | null,
  logo = '',
  version: PrintVersion = 'official',
) {
  // Internal dates never change the count (effect `note`), so the count and the distribution read
  // every date and both versions print the same school days; only the grid and lists differ.
  const listed = version === 'complete' ? events : events.filter((e) => !printsAsInternal(e));
  const showsInternal = hasInternalDates(listed);
  const status = record?.status ?? 'rascunho';
  const byOffer = result?.byOffer;
  const ledger = new Map(result?.ledger.map((d) => [d.date, d]) || []),
    boundary = new Set(state.periods.flatMap((p) => [p.start, p.end]));
  const colorKeys = categories.filter((c) => c[2]).map((c) => c[0]);
  // The key lists only the categories the grid marks.
  const usedCategories = new Set<string>();
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${state.year}-${String(m + 1).padStart(2, '0')}`,
      first = new Date(prefix + '-01T00:00:00Z'),
      length = new Date(Date.UTC(state.year, m + 1, 0)).getUTCDate(),
      name = first.toLocaleDateString('pt-BR', {
        month: 'long',
        timeZone: 'UTC',
      });
    const monthEvents: PrintEvent[] = listed
      .flatMap((e) => {
        if (isBoundaryInterval(e)) {
          const edges: PrintEvent[] = [];
          if (e.start.startsWith(prefix)) edges.push(boundaryEntry('Início', e));
          if (e.end.startsWith(prefix)) edges.push(boundaryEntry('Término', e));
          return edges;
        }
        return e.start.slice(0, 7) <= prefix && e.end.slice(0, 7) >= prefix ? [e] : [];
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const p of state.periods) {
      if (p.start.startsWith(prefix))
        monthEvents.push({
          start: p.start,
          end: p.start,
          category: 'limite',
          name: boundaryName('Início', p),
          offers: associationOffers(p.association),
        });
      if (p.end.startsWith(prefix))
        monthEvents.push({
          start: p.end,
          end: p.end,
          category: 'limite',
          name: boundaryName('Término', p),
          offers: associationOffers(p.association),
        });
    }
    let cells = Array(first.getUTCDay()).fill('<td></td>'),
      total = 0;
    for (let day = 1; day <= length; day++) {
      const date = civilDate(prefix + '-' + String(day).padStart(2, '0')),
        d = ledger.get(date),
        list = listed.filter((e) => e.start <= date && e.end >= date);
      if (d?.counted) total++;
      const marks = [
        ...new Set([
          ...(boundary.has(date) ? ['limite'] : []),
          ...list.filter((e) => paintsDay(e, date)).map(eventCategory),
        ]),
      ].filter((c) => colorKeys.includes(c));
      for (const c of marks) usedCategories.add(c);
      const priority = [
        'feriado',
        'recesso',
        'ferias',
        'limite',
        'sabado',
        'formacao',
        'conselho',
        'criacao',
        'evento',
        'comemorativo',
      ];
      // The color of highest priority fills the cell; a date of several categories splits it
      // diagonally, in that order, and a school day prints its number in bold.
      const ordered = priority.filter((c) => marks.includes(c));
      const classes = [
        ordered.length === 1 ? `cat-${ordered[0]}` : ordered.length ? 'cat-split' : '',
        d?.counted ? 'school-day' : '',
      ].filter(Boolean);
      const bands = ordered.length > 1 ? ` style="--bands: ${splitBands(ordered)}"` : '';
      cells.push(
        `<td class="${classes.join(' ')}"${bands} title="${esc(list.map((e) => e.name).join('; '))}">${day}${list.some(printsAsInternal) ? '<i class="internal-day-mark" aria-label="Data interna"></i>' : ''}</td>`,
      );
    }
    while (cells.length % 7) cells.push('<td></td>');
    let rows = '';
    for (let i = 0; i < cells.length; i += 7)
      rows += '<tr>' + cells.slice(i, i + 7).join('') + '</tr>';

    interface EventEntry {
      a: number;
      b: number;
      dateText: string;
      category: string;
      colorKey: string;
      internal: boolean;
      body: string;
    }
    const entries: EventEntry[] = mergedEntries(state, monthEvents)
      .map((e) => {
        const untilYearEnd =
          isVacationActivity(e.activity) && startsDecemberVacation(e, state.year);
        const a = e.start.startsWith(prefix) ? Number(e.start.slice(8)) : 1,
          b = untilYearEnd ? a : e.end.startsWith(prefix) ? Number(e.end.slice(8)) : length;
        const crossesYear = e.start < `${state.year}-01-01`;
        const scope = eventOffers(state, e);
        const category = eventCategory(e);
        const colored = colorKeys.includes(category);
        // The key explains the colors of the lists too, such as a commemoration the grid omits.
        if (colored) usedCategories.add(category);
        return {
          a,
          b,
          dateText: a === b ? String(a) : `${a} a ${b}`,
          category,
          colorKey: colored ? category : '',
          internal: printsAsInternal(e),
          body: `${esc(printedVacationName(e, state.year))}${internalLabel(e)}${crossesYear ? `<small>Intervalo integral: ${esc(fullInterval(e))}</small>` : ''}${publicationDetails(e, state.year)}${(state.offers || !e.institutional) && scope ? ' [' + esc(scope) + ']' : ''}`,
        };
      })
      .sort((x, y) => x.a - y.a || x.b - y.b || x.colorKey.localeCompare(y.colorKey));
    const groups: EventEntry[][] = [];
    for (const entry of entries) {
      const previous = groups[groups.length - 1];
      if (
        previous &&
        previous[0]!.dateText === entry.dateText &&
        previous[0]!.colorKey === entry.colorKey
      )
        previous.push(entry);
      else groups.push([entry]);
    }
    // Up to six dates, as many as the grid has weeks, fit one table beside it; more split
    // evenly in two without breaking a merged date group. No blank rows: the grid sets the height.
    const columns: EventEntry[][][] =
      entries.length > 6 && groups.length > 1
        ? (() => {
            const target = entries.length / 2;
            let bestIndex = 1,
              bestDiff = Infinity,
              running = 0;
            for (let i = 0; i < groups.length - 1; i++) {
              running += groups[i]!.length;
              const diff = Math.abs(running - target);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestIndex = i + 1;
              }
            }
            return [groups.slice(0, bestIndex), groups.slice(bestIndex)];
          })()
        : [groups];
    const renderGroup = (group: EventEntry[]) =>
      group
        .map((entry, index) => {
          const dateCell =
            index === 0
              ? `<td class="cat-${entry.category}"${group.length > 1 ? ` rowspan="${group.length}"` : ''}>${entry.dateText}</td>`
              : '';
          return `<tr${entry.internal ? ' class="internal-date"' : ''}>${dateCell}<td>${entry.body}</td></tr>`;
        })
        .join('');
    const eventTables = columns
      .map(
        (column) =>
          `<table class="event-grid"><tbody>${column.map(renderGroup).join('')}</tbody></table>`,
      )
      .join('');
    return `<section class="proens-month"><div><h3>${name}</h3><table class="month-grid"><thead><tr>${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => '<th>' + d + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table><p class="monthly-total">${result ? total : '—'} dias letivos</p></div><div><h3>${name}</h3><div class="event-columns${columns.length === 1 ? ' single' : ''}">${eventTables}</div></div></section>`;
  }).join('');
  // One table for every offer: a column per offer, a row per period, the annual total last.
  const countedOffers = byOffer ? offerIds(state).filter((m) => byOffer[m]) : [];
  const countHeads =
    countedOffers.length > 1
      ? countedOffers.map((m) => `<th>${esc(labelFor(state, m))}</th>`).join('')
      : '<th>Dias letivos</th>';
  const countCells = (value: (m: string | undefined) => number | string | undefined) =>
    (countedOffers.length ? countedOffers : [undefined]).map((m) => value(m) ?? '—');
  const countRows = state.periods
    .map((p) => {
      const offers = associationOffers(p.association);
      const cells = countCells((m) =>
        m === undefined
          ? result?.byPeriod[p.id]
          : offers.includes(m)
            ? byOffer?.[m]?.byPeriod[p.id]
            : '',
      );
      return `<tr><td>${esc(p.name)}</td>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .join('');
  const annualCells = countCells((m) => (m === undefined ? result?.total : byOffer?.[m]?.total));
  const dayDistribution = distributionTables(state, events, result);
  return `<div class="proens-document"${version === 'complete' ? ' data-print-version="complete"' : ''}><div class="proens-heading"><img class="ifpr-logo" src="${esc(logo)}" alt="Instituto Federal do Paraná"><strong>INSTITUTO FEDERAL DO PARANÁ</strong><h2>CALENDÁRIO ACADÊMICO E ADMINISTRATIVO ${state.year}</h2><h2>CAMPUS ${esc(state.campus)}</h2><small class="proens-status-mark" data-status="${status}">${esc(printMark(status, { seiProcess: record?.seiProcess, supersededByName: record?.supersededByName }))}</small>${version === 'complete' ? `<small class="proens-version-mark">${esc(completeVersionNote)}</small>` : ''}<p>${esc(
    offerIds(state)
      .map((m) => labelFor(state, m))
      .join(' + '),
  )}</p></div>${months}<section class="proens-legend">${
    // The grid marks the days of the first offer; with one offer the heading already names it.
    offerIds(state).length > 1
      ? `<p>Os dias letivos em negrito seguem a contagem de ${esc(labelFor(state, offerIds(state)[0]))}.</p>`
      : ''
  }<div class="proens-key"><div><span class="swatch school-day-sample">15</span>Dia letivo</div>${categories
    .filter((c) => c[2] && usedCategories.has(c[0]))
    .map(([key, label]) => `<div><span class="swatch cat-${key}"></span>${esc(label)}</div>`)
    .join(
      '',
    )}${showsInternal ? '<div><span class="swatch internal-swatch"></span>Data interna</div>' : ''}</div></section>${externalReferences(state, listed)}<section class="proens-summary"><h3>Contagem de dias letivos</h3><table class="period-count"><thead><tr><th>Período</th>${countHeads}</tr></thead><tbody>${countRows}<tr><th>Total anual</th>${annualCells.map((c) => `<th>${c}</th>`).join('')}</tr></tbody></table>${dayDistribution}</section></div>`;
}
