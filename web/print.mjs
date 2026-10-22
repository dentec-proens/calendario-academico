import { calendarModalities, modalityLabels, appliesTo } from '../src/modalities.mjs';
import { categories, eventCategory } from '../src/categories.mjs';

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const dateLabel = (date) => date?.split('-').reverse().join('/') || '';

export function teachingDayBreakdown(state, events, result, modality) {
  const scoped = result?.byModality ? result.byModality[modality] : result;
  const ledger = scoped?.ledger;
  const row = (label, range) => {
    const available = !!ledger && !!range && range.start <= range.end;
    const byWeekday = Array(7).fill(0);
    if (available)
      for (const day of ledger)
        if (day.counted && day.date >= range.start && day.date <= range.end)
          byWeekday[day.weekday]++;
    return {
      label,
      ...range,
      available,
      total: available ? byWeekday.reduce((a, b) => a + b, 0) : null,
      byWeekday: available ? byWeekday : null,
    };
  };
  const months = Array.from({ length: 12 }, (_, i) => {
    const prefix = `${state.year}-${String(i + 1).padStart(2, '0')}`;
    const start = prefix + '-01',
      end = prefix + '-' + new Date(Date.UTC(state.year, i + 1, 0)).getUTCDate();
    return row(
      new Date(start + 'T00:00:00Z').toLocaleDateString('pt-BR', {
        month: 'long',
        timeZone: 'UTC',
      }),
      { start, end },
    );
  });
  const count = Number(
    state.assessmentStagesByModality
      ? state.assessmentStagesByModality[modality]
      : state.assessmentStages,
  );
  const candidates = (events || []).filter((e) => appliesTo(e, modality));
  const stages = Array.from({ length: [2, 3, 4].includes(count) ? count : 0 }, (_, i) => {
    const id = String(i + 1),
      matches = candidates.filter((e) =>
        new RegExp(`^stage-${id}(?::${modality})?$`).test(e.requirementId || ''),
      );
    if (matches.length === 1) return { start: matches[0].start, end: matches[0].end };
    if (matches.length) return null;
    const starts = candidates.filter((e) =>
      new RegExp(`^stage-start-${id}(?::${modality})?$`).test(e.requirementId || ''),
    );
    const ends = candidates.filter((e) =>
      new RegExp(`^stage-end-${id}(?::${modality})?$`).test(e.requirementId || ''),
    );
    return starts.length === 1 && ends.length === 1
      ? { start: starts[0].start, end: ends[0].end }
      : null;
  });
  const periods = [...(state.periods || [])].sort((a, b) => a.start.localeCompare(b.start));
  let semesters = [null, null];
  if (periods.length === 2) semesters = periods.map((p) => ({ start: p.start, end: p.end }));
  else if (periods.length === 1 && /\b[12]\s*[ºªo°]?\s*semestre\b/i.test(periods[0].name || ''))
    semesters[Number(periods[0].name.match(/[12]/)[0]) - 1] = {
      start: periods[0].start,
      end: periods[0].end,
    };
  else if (count === 2) semesters = stages;
  else if (count === 4)
    semesters = [0, 2].map((i) =>
      stages[i] && stages[i + 1] ? { start: stages[i].start, end: stages[i + 1].end } : null,
    );
  const notes = [];
  const overlaps = (ranges) =>
    ranges.some(
      (a, i) => a && ranges.some((b, j) => b && i < j && a.start <= b.end && b.start <= a.end),
    );
  if (overlaps(semesters)) {
    semesters = [null, null];
    notes.push('Confira os intervalos dos semestres: há sobreposição.');
  }
  const stageRows = stages.map((range, i) =>
    row(`${i + 1}º ${count === 4 ? 'bimestre' : count === 3 ? 'trimestre' : 'semestre'}`, range),
  );
  if (overlaps(stages)) {
    for (const item of stageRows) {
      item.available = false;
      item.total = null;
      item.byWeekday = null;
    }
    notes.push('Confira os intervalos das etapas: há sobreposição.');
  }
  const semesterRows = semesters.map((range, i) => row(`${i + 1}º semestre`, range));
  if (semesters.some((r) => !r || r.start > r.end))
    notes.push(
      'Preencha os intervalos dos semestres letivos para completar a distribuição semestral.',
    );
  if (stages.some((r) => !r || r.start > r.end))
    notes.push('Preencha os intervalos das etapas de avaliação para completar sua distribuição.');
  if (ledger && semesterRows.every((r) => r.available)) {
    const uncovered = ledger.filter(
      (d) => d.counted && !semesters.some((s) => d.date >= s.start && d.date <= s.end),
    ).length;
    if (uncovered)
      notes.push(
        `${uncovered} dia(s) letivo(s) fora dos intervalos dos semestres. Confira as datas cadastradas.`,
      );
  }
  return {
    months,
    stages: count === 4 || count === 3 ? stageRows : [],
    stageLabel: count === 4 ? 'bimestre' : 'trimestre',
    semesters: semesterRows,
    annual: row('Total anual', { start: `${state.year}-01-01`, end: `${state.year}-12-31` }),
    notes,
  };
}

function distributionTables(state, events, result) {
  const weekdays = [
    [1, 'Seg.'],
    [2, 'Ter.'],
    [3, 'Qua.'],
    [4, 'Qui.'],
    [5, 'Sex.'],
    [6, 'Sáb.'],
    [0, 'Dom.'],
  ];
  const table = (title, rows) =>
    `<table class="teaching-distribution"><caption>${esc(title)}</caption><thead><tr><th scope="col">Intervalo</th>${weekdays.map(([, name]) => `<th scope="col">${name}</th>`).join('')}<th scope="col">Total</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.label)}${r.start && r.end ? `<small>${dateLabel(r.start)} a ${dateLabel(r.end)}</small>` : ''}</th>${weekdays.map(([day]) => `<td>${r.available ? r.byWeekday[day] : '—'}</td>`).join('')}<td><strong>${r.available ? r.total : '—'}</strong></td></tr>`).join('')}</tbody></table>`;
  return calendarModalities(state)
    .map((modality) => {
      const report = teachingDayBreakdown(state, events, result, modality);
      return `<section class="teaching-distribution-group"><h4>Dias letivos — ${esc(modalityLabels[modality] || modality)}</h4>${table('Distribuição por mês', report.months)}${report.stages.length ? table('Distribuição por ' + report.stageLabel, report.stages) : ''}${table('Distribuição por semestre letivo', report.semesters)}${table('Consolidado anual', [report.annual])}${report.notes.map((note) => `<p>${esc(note)}</p>`).join('')}</section>`;
    })
    .join('');
}

export function proensLayout(state, events, result, record, logo = '/ifpr-logo.png') {
  const ledger = new Map(result?.ledger.map((d) => [d.date, d]) || []),
    boundary = new Set(state.periods.flatMap((p) => [p.start, p.end]));
  const colorKeys = categories.filter((c) => c[2]).map((c) => c[0]);
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${state.year}-${String(m + 1).padStart(2, '0')}`,
      first = new Date(prefix + '-01T00:00:00Z'),
      length = new Date(Date.UTC(state.year, m + 1, 0)).getUTCDate(),
      name = first.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
    const monthEvents = events
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
              `<i class="color-mark cat-${c}" aria-label="${esc(categories.find((x) => x[0] === c)[1])}"></i>`,
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
        return `<tr><td class="cat-${eventCategory(e)}">${a === b ? a : a + ' a ' + b}</td><td>${esc(e.name)}${e.modalities?.length ? ' [' + esc(e.modalities.map((m) => modalityLabels[m]).join(', ')) + ']' : ''}</td></tr>`;
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
  )}</p><p>${esc(record?.courses || '')} ${record?.classes ? ' · ' + esc(record.classes) : ''} ${record?.shifts ? ' · ' + esc(record.shifts) : ''}</p><small>${record?.purpose === 'test' ? 'CALENDÁRIO DE TESTE — SEM VALIDADE PARA ENVIO · ' : ''}${record?.purpose !== 'test' && (record?.proposalCopy || record?.readiness?.ready === false) ? 'CÓPIA DA PROPOSTA PARA ANÁLISE DA PROENS · ' : ''}Proposta preliminar · Versão ${record?.version ?? 'local'}${record ? ' · Base institucional ' + record.currentCatalogueRevision : ''} · Sem aprovação oficial</small></div>${months}<section class="proens-summary"><h3>Legendas e contagem</h3>${state.teacherVacations ? '<p>Férias docentes: conforme os períodos registrados pelo campus e apresentados neste calendário.</p>' : ''}<p>Marcação gráfica de dias: ${esc(modalityLabels[calendarModalities(state)[0]] || state.offer)}.</p>${
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
    )}</div><p>· Dia letivo calculado. Faixas adicionais na data indicam categorias simultâneas. A cor não substitui a conferência de conflitos.</p><table><thead><tr><th>Período</th><th>Dias letivos</th></tr></thead><tbody>${countRows}<tr><th>Total anual</th><th>${result?.total ?? '—'}</th></tr></tbody></table>${dayDistribution}<p>Estrutura baseada no modelo PROENS 2026 fornecido. Datas provenientes da base do ano selecionado e das decisões do campus. Carga horária, checklist integral e deliberação institucional permanecem sujeitos à conferência.</p></section></div>`;
}
