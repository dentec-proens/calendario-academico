import { printMark } from '../domain/calendar/lifecycle.ts';
import { civilDate } from '../domain/civil-date.ts';
import { automaticEventSource } from '../domain/calendar/counting/core.ts';
import type { PrintState, PrintResult, PrintRecord, PrintEvent, DistributionRow } from './types.ts';
import { teachingDayBreakdown } from './teaching-day-breakdown.ts';
import { categories, eventCategory } from '../domain/calendar/activities/categories.ts';
import { periodsForOffer } from '../domain/calendar/organization/periods.ts';
import { associationOffers, labelFor, offerIds } from '../domain/calendar/offers.ts';
import { listedOffers } from '../domain/calendar/modalities.ts';
import { executionLabels } from '../domain/calendar/activities/plan-evaluation.ts';
import { canBeInternal, isInternalDate } from '../domain/calendar/internal-dates.ts';
import { isSaturdayRecord } from '../domain/calendar/activities/saturdays.ts';

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
 * Offers printed beside a date. An unconfirmed scope over every offer of the calendar is the
 * format 4 date without its own list and prints without a list, as before.
 * So does a Saturday over every offer: the Saturdays step creates it confirmed for all of them,
 * where format 4 stored no list.
 */
function eventOffers(state: PrintState, event: PrintEvent) {
  const scope = event.scope;
  const all = state.offers ? offerIds(state) : [];
  if (
    scope &&
    (!scope.confirmed || isSaturdayRecord(event)) &&
    scope.offers.length === all.length &&
    all.every((id) => scope.offers.includes(id))
  )
    return '';
  return (
    listedOffers(event)
      ?.map((id) => labelFor(state, id))
      .join(', ') ?? ''
  );
}

function publicationDetails(event: PrintEvent, year: number, includeSource = true) {
  const labels = [];
  const publication = event.notice?.publication;
  const admission = event.notice?.admission;
  if (publication) labels.push(executionLabels[publication]);
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
  if (event.deadlineAdjustment)
    labels.push(
      `Prazo ajustado declarado: ${dateLabel(event.deadlineAdjustment.date, year)}; consulte a conferência institucional no parecer`,
    );
  return labels.length ? `<small>${labels.map(esc).join(' · ')}</small>` : '';
}

function externalReferences(state: PrintState, events: PrintEvent[]) {
  const rows = events.filter((event) => event.start < `${state.year}-01-01`);
  if (!rows.length) return '';
  const table = (title: string, items: PrintEvent[]) =>
    items.length
      ? `<h4>${esc(title)}</h4><table class="external-references"><thead><tr><th>Datas completas</th><th>Atividade e finalidade</th></tr></thead><tbody>${items.map((event) => `<tr><td>${esc(fullInterval(event))}</td><td>${esc(event.name)}${internalLabel(event)}${publicationDetails(event, state.year, false)}<small>${esc(eventOffers(state, event))}</small>${automaticEventSource(event) ? `<small>Fonte: ${esc(automaticEventSource(event))}</small>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '';
  return `<section class="proens-external-references"><h3>Atividades e referências de outros anos</h3><p>As datas integrais são preservadas. Estes registros informativos não alteram a contagem de dias letivos.</p>${table(
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
  const details = [record?.courses, record?.classes, record?.shifts].filter(Boolean).join(' · ');
  const byOffer = result?.byOffer;
  const ledger = new Map(result?.ledger.map((d) => [d.date, d]) || []),
    boundary = new Set(state.periods.flatMap((p) => [p.start, p.end]));
  const colorKeys = categories.filter((c) => c[2]).map((c) => c[0]);
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${state.year}-${String(m + 1).padStart(2, '0')}`,
      first = new Date(prefix + '-01T00:00:00Z'),
      length = new Date(Date.UTC(state.year, m + 1, 0)).getUTCDate(),
      name = first.toLocaleDateString('pt-BR', {
        month: 'long',
        timeZone: 'UTC',
      });
    const monthEvents: PrintEvent[] = listed
      .filter((e) => e.start.slice(0, 7) <= prefix && e.end.slice(0, 7) >= prefix)
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const p of state.periods) {
      if (p.start.startsWith(prefix))
        monthEvents.push({
          start: p.start,
          end: p.start,
          category: 'limite',
          name: 'Início — ' + p.name,
          offers: associationOffers(p.association),
        });
      if (p.end.startsWith(prefix))
        monthEvents.push({
          start: p.end,
          end: p.end,
          category: 'limite',
          name: 'Término — ' + p.name,
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
          ...list
            .filter((e) => eventCategory(e) !== 'limite' || e.start === date || e.end === date)
            .map(eventCategory),
        ]),
      ].filter((c) => colorKeys.includes(c));
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
      const primary = priority.find((c) => marks.includes(c));
      let cls = primary ? 'cat-' + primary : '';
      cells.push(
        `<td class="${cls}" title="${esc(list.map((e) => e.name).join('; '))}">${day}${d?.counted ? '<b class="day-mark">·</b>' : ''}${marks
          .filter((c) => c !== primary)
          .map(
            (c) =>
              `<i class="color-mark cat-${c}" aria-label="${esc(categories.find((x) => x[0] === c)![1])}"></i>`,
          )
          .join(
            '',
          )}${list.some(printsAsInternal) ? '<i class="internal-day-mark" aria-label="Data interna"></i>' : ''}</td>`,
      );
    }
    while (cells.length % 7) cells.push('<td></td>');
    let rows = '';
    for (let i = 0; i < cells.length; i += 7)
      rows += '<tr>' + cells.slice(i, i + 7).join('') + '</tr>';

    const entries = monthEvents
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => {
        const a = e.start.startsWith(prefix) ? Number(e.start.slice(8)) : 1,
          b = e.end.startsWith(prefix) ? Number(e.end.slice(8)) : length;
        const crossesYear = e.start < `${state.year}-01-01`;
        const scope = eventOffers(state, e);
        return `<tr${printsAsInternal(e) ? ' class="internal-date"' : ''}><td class="cat-${eventCategory(e)}">${a === b ? a : a + ' a ' + b}</td><td>${esc(e.name)}${internalLabel(e)}${crossesYear ? `<small>Intervalo integral: ${esc(fullInterval(e))}</small>` : ''}${publicationDetails(e, state.year)}${(state.offers || !e.institutional) && scope ? ' [' + esc(scope) + ']' : ''}</td></tr>`;
      });
    const middle = Math.max(6, Math.ceil(entries.length / 2)),
      columns = [entries.slice(0, middle), entries.slice(middle)];
    for (const column of columns)
      while (column.length < middle) column.push('<tr><td>&nbsp;</td><td></td></tr>');
    const eventTables = columns
      .map(
        (column) =>
          `<table class="event-grid"><thead><tr><th>Dia(s)</th><th>Descrição</th></tr></thead><tbody>${column.join('')}</tbody></table>`,
      )
      .join('');
    return `<section class="proens-month"><div><h3>${name}</h3><table class="month-grid"><thead><tr>${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => '<th>' + d + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table><p class="monthly-total">${result ? total : '—'} dias letivos</p></div><div><h3>${name}</h3><div class="event-columns">${eventTables}</div></div></section>`;
  }).join('');
  const countRows = state.periods
    .map((p) => {
      const scope =
        p.association?.status === 'defined' ? associationOffers(p.association) : offerIds(state);
      const unclassified = p.association?.status === 'a-classificar';
      const counts = unclassified
        ? 'Organização a conferir'
        : scope
            .map(
              (m) =>
                `${esc(labelFor(state, m))}: ${byOffer?.[m]?.byPeriod[p.id] ?? (byOffer ? '—' : (result?.byPeriod[p.id] ?? '—'))}`,
            )
            .join(' · ');
      return `<tr><td>${esc(p.name)}</td><td>${counts}</td></tr>`;
    })
    .join('');
  const dayDistribution = distributionTables(state, events, result);
  return `<div class="proens-document"${version === 'complete' ? ' data-print-version="complete"' : ''}><div class="proens-heading"><img class="ifpr-logo" src="${esc(logo)}" alt="Instituto Federal do Paraná"><strong>INSTITUTO FEDERAL DO PARANÁ</strong><h2>CALENDÁRIO ACADÊMICO E ADMINISTRATIVO ${state.year}</h2><h2>CAMPUS ${esc(state.campus)}</h2><small class="proens-status-mark" data-status="${status}">${esc(printMark(status, { seiProcess: record?.seiProcess, supersededByName: record?.supersededByName }))}</small>${version === 'complete' ? `<small class="proens-version-mark">${esc(completeVersionNote)}</small>` : ''}<p>${esc(
    offerIds(state)
      .map((m) => labelFor(state, m))
      .join(' + '),
  )}</p>${details ? `<p>${esc(details)}</p>` : ''}</div>${months}${externalReferences(state, listed)}<section class="proens-summary"><h3>Legendas e contagem</h3><p>Marcação gráfica de dias: ${esc(labelFor(state, offerIds(state)[0] ?? ''))}.</p>${
    byOffer
      ? `<table><thead><tr><th>Oferta</th><th>Total anual</th><th>Períodos</th></tr></thead><tbody>${Object.entries(
          byOffer,
        )
          .map(
            ([m, r]) =>
              `<tr><td>${esc(labelFor(state, m))}</td><td>${r.total}</td><td>${periodsForOffer(
                state,
                m,
              )
                .map((p) => `${esc(p.name)}: ${r.byPeriod[p.id] ?? '—'}`)
                .join(' · ')}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : ''
  }<div class="proens-key">${categories
    .filter((c) => c[2])
    .map(([key, label]) => `<div><span class="swatch cat-${key}"></span>${esc(label)}</div>`)
    .join(
      '',
    )}${showsInternal ? '<div><span class="swatch internal-swatch"></span>Data interna</div>' : ''}</div><p>· Dia letivo calculado. Faixas adicionais na data indicam categorias simultâneas. A cor não substitui a conferência de conflitos.</p><table><thead><tr><th>Período</th><th>Dias letivos</th></tr></thead><tbody>${countRows}<tr><th>Total anual</th><th>${result?.total ?? '—'}</th></tr></tbody></table>${dayDistribution}<p>Carga horária, checklist integral e deliberação institucional permanecem sujeitos à conferência.</p></section></div>`;
}
