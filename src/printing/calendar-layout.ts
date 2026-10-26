import type { PrintState, PrintResult, PrintRecord, PrintEvent, DistributionRow } from './types.ts';
import { teachingDayBreakdown } from './teaching-day-breakdown.ts';
import { printLogo } from './assets.generated.mjs';
import { calendarModalities, modalityLabels } from '../modalities.ts';
import { categories, eventCategory } from '../categories.ts';

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const dateLabel = (date: string | undefined) => date?.split('-').reverse().join('/') || '';

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
    `<table class="teaching-distribution"><caption>${esc(title)}</caption><thead><tr><th scope="col">Intervalo</th>${weekdays.map(([, name]) => `<th scope="col">${name}</th>`).join('')}<th scope="col">Total</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.label)}${r.start && r.end ? `<small>${dateLabel(r.start)} a ${dateLabel(r.end)}</small>` : ''}</th>${weekdays.map(([day]) => `<td>${r.available ? r.byWeekday![day] : '—'}</td>`).join('')}<td><strong>${r.available ? r.total : '—'}</strong></td></tr>`).join('')}</tbody></table>`;
  return calendarModalities(state)
    .map((modality) => {
      const report = teachingDayBreakdown(state, events, result, modality);
      return `<section class="teaching-distribution-group"><h4>Dias letivos — ${esc(modalityLabels[modality] || modality)}</h4>${table('Distribuição por mês', report.months)}${report.stages.length ? table('Distribuição por ' + report.stageLabel, report.stages) : ''}${table('Distribuição por semestre letivo', report.semesters)}${table('Consolidado anual', [report.annual])}${report.notes.map((note) => `<p>${esc(note)}</p>`).join('')}</section>`;
    })
    .join('');
}

export function proensLayout(
  state: PrintState,
  events: PrintEvent[],
  result: PrintResult = null,
  record?: PrintRecord | null,
  logo = printLogo,
) {
  const ledger = new Map(result?.ledger.map((d) => [d.date, d]) || []),
    boundary = new Set(state.periods.flatMap((p) => [p.start, p.end]));
  const colorKeys = categories.filter((c) => c[2]).map((c) => c[0]);
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${state.year}-${String(m + 1).padStart(2, '0')}`,
      first = new Date(prefix + '-01T00:00:00Z'),
      length = new Date(Date.UTC(state.year, m + 1, 0)).getUTCDate(),
      name = first.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
    const monthEvents: PrintEvent[] = events
      .filter((e) => e.start.slice(0, 7) <= prefix && e.end.slice(0, 7) >= prefix)
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const p of state.periods) {
      if (p.start.startsWith(prefix))
        monthEvents.push({
          start: p.start,
          end: p.start,
          category: 'limite',
          name: 'Início — ' + p.name,
        });
      if (p.end.startsWith(prefix))
        monthEvents.push({
          start: p.end,
          end: p.end,
          category: 'limite',
          name: 'Término — ' + p.name,
        });
    }
    let cells = Array(first.getUTCDay()).fill('<td></td>'),
      total = 0;
    for (let day = 1; day <= length; day++) {
      const date = prefix + '-' + String(day).padStart(2, '0'),
        d = ledger.get(date),
        list = events.filter((e) => e.start <= date && e.end >= date);
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
          .join('')}</td>`,
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
        return `<tr><td class="cat-${eventCategory(e)}">${a === b ? a : a + ' a ' + b}</td><td>${esc(e.name)}${!e.institutional && e.modalities?.length ? ' [' + esc(e.modalities.map((m) => modalityLabels[m]).join(', ')) + ']' : ''}</td></tr>`;
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
    return `<section class="proens-month"><div><h3>${name} ${state.year}</h3><table class="month-grid"><thead><tr>${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => '<th>' + d + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table><p class="monthly-total">${result ? total : '—'} dias letivos</p></div><div><h3>${name} ${state.year}</h3><div class="event-columns">${eventTables}</div></div></section>`;
  }).join('');
  const countRows = state.periods
    .map((p) => `<tr><td>${esc(p.name)}</td><td>${result?.byPeriod[p.id] ?? '—'}</td></tr>`)
    .join('');
  const dayDistribution = distributionTables(state, events, result);
  return `<div class="proens-document"><div class="proens-heading"><img class="ifpr-logo" src="${esc(logo)}" alt="Instituto Federal do Paraná"><strong>INSTITUTO FEDERAL DO PARANÁ</strong><h2>CALENDÁRIO ACADÊMICO E ADMINISTRATIVO ${state.year}</h2><h2>CAMPUS ${esc(state.campus)}</h2><p>${esc(
    calendarModalities(state)
      .map((m) => modalityLabels[m] || m)
      .join(' + '),
  )}</p><p>${esc(record?.courses || '')} ${record?.classes ? ' · ' + esc(record.classes) : ''} ${record?.shifts ? ' · ' + esc(record.shifts) : ''}</p><small>${record?.purpose === 'test' ? 'CALENDÁRIO DE TESTE — SEM VALIDADE PARA ENVIO · ' : ''}${record?.purpose !== 'test' && (record?.proposalCopy || record?.readiness?.ready === false) ? 'CÓPIA DA PROPOSTA PARA ANÁLISE DA PROENS · ' : ''}Proposta preliminar · Versão ${record?.version ?? 'local'}${record ? ' · Base institucional ' + record.currentCatalogueRevision : ''} · Sem aprovação oficial</small></div>${months}<section class="proens-summary"><h3>Legendas e contagem</h3><p>Marcação gráfica de dias: ${esc(modalityLabels[calendarModalities(state)[0]] || state.offer)}.</p>${
    result?.byModality
      ? `<table><thead><tr><th>Forma de oferta/nível</th><th>Total anual</th><th>Períodos</th></tr></thead><tbody>${Object.entries(
          result.byModality,
        )
          .map(
            ([m, r]) =>
              `<tr><td>${esc(modalityLabels[m])}</td><td>${r.total}</td><td>${state.periods.map((p) => `${esc(p.name)}: ${r.byPeriod[p.id]}`).join(' · ')}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : ''
  }<div class="proens-key">${categories
    .filter((c) => c[2])
    .map(([key, label]) => `<div><span class="swatch cat-${key}"></span>${esc(label)}</div>`)
    .join(
      '',
    )}</div><p>· Dia letivo calculado. Faixas adicionais na data indicam categorias simultâneas. A cor não substitui a conferência de conflitos.</p><table><thead><tr><th>Período</th><th>Dias letivos</th></tr></thead><tbody>${countRows}<tr><th>Total anual</th><th>${result?.total ?? '—'}</th></tr></tbody></table>${dayDistribution}<p>Carga horária, checklist integral e deliberação institucional permanecem sujeitos à conferência.</p></section></div>`;
}
