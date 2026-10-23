import { validateImport } from './editor-import.ts';
import type {
  CalendarRecord,
  CalendarState,
  CalendarEvent,
  Modality,
  History,
  HistoryAnalysis,
} from './editor-types.ts';
import {
  campusInstitutionalEvents,
  withVacationExclusions,
  calendarModalities,
  modalityLabels,
  recalculateAssessmentStages,
  saturdayEvents,
  teacherVacations,
  suggestStages,
  isModality,
} from './editor-domain.ts';
import { confirmAction } from './components/confirmation.ts';
import { editorElement as $, editorControl } from './editor-dom.ts';
import type { AutosaveStatus } from './autosave.ts';
import logoUrl from './ifpr-logo.png?url';
import './proens.css';
import { teacherDayId, validateTeacherDay, teacherDayWeek } from '../src/teacher-day.mjs';
import { createAutosaver } from './autosave.ts';
import { durationEnd, recalculatePeriods } from '../src/duration.mjs';
import { proposedDates } from '../src/history-dates.ts';
import {
  historyCandidateKey,
  includedHistoryCandidate,
  existingHistoryEvent,
} from '../src/history-progress.mjs';
import {
  suggestStageEnd,
  isFirstStageStart,
  assessmentDayCounts,
} from '../src/stage-suggestions.mjs';
import { regimeLabels } from '../src/calendar-label.mjs';
import { evaluateCalendar } from '../src/evaluation.mjs';
import {
  activityChecklist,
  assessmentCount,
  stageRequirement,
  migrateAssessmentEvents,
} from '../src/obligations.mjs';
import { filePayload } from './upload.ts';
import { categories, eventCategory, categoryLabel } from '../src/categories.mjs';
import { datesBetween } from '../src/calendar.ts';
import { monthSaturdays } from '../src/saturdays.mjs';
import { proensLayout } from './print.mjs';
import {
  accounts,
  calendars,
  subscribeCalendar,
  subscribeNativeConnection,
  downloadLink,
  nativeError,
} from './native/client.ts';

type HistoricalSource = NonNullable<CalendarEvent['historicalSource']>;
const eventFormHome = document.createComment('event-form-home');
$('event-form').before(eventFormHome);
let inlineHistoryIndex: number | null = null;
let inlineActivityId: string | null = null;
let editingEventId: string | null = null;
let state: CalendarState = {
  schemaVersion: 1,
  campus: '',
  year: 2027,
  offer: 'tecnico',
  modalities: [],
  ignoredHistory: [],
  assessmentStagesByModality: {},
  regime: 'anual',
  weekdays: [],
  weekEvidence: '',
  weekConfirmed: false,
  periods: [],
  events: [],
};
let dirty = false;
let result: ReturnType<typeof evaluateCalendar> | null = null;
let editingPeriodId: string | null = null;
let historicalSource: HistoricalSource | null = null;
let historyAnalysis: HistoryAnalysis | null = null;
let analyzedHistory: History | null = null;
let record: CalendarRecord;
let institutional: CalendarRecord['institutionalEvents'] = [];
let isAdmin = false;
const restoringHistories = new Set<string>();
const calendarId = new URLSearchParams(location.search).get('id') ?? '';
const campusEvents = () => campusInstitutionalEvents(institutional, state);
const allEvents = () => withVacationExclusions([...campusEvents(), ...state.events]);

const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
const dateLabel = (s: string) => s.split('-').reverse().join('/');
const message = (text: string, error = false) => {
  $('message').textContent = new Date().toLocaleTimeString('pt-BR') + ' — ' + text;
  $('message').className = error ? 'error' : '';
};

function act(fn: () => void) {
  try {
    fn();
  } catch (e) {
    message(nativeError(e).message, true);
  }
}

function identified() {
  if (!state.campus || !state.offer)
    throw Error(
      'Abra um calendário com campus e forma de oferta/nível cadastrados antes de continuar.',
    );
}

function interval(start: string, end: string) {
  datesBetween(start, end);
  if (Number(start.slice(0, 4)) !== state.year || Number(end.slice(0, 4)) !== state.year)
    throw Error('As datas devem pertencer ao ano selecionado.');
}

function render({ recalculate = false } = {}) {
  const activeActivity = inlineActivityId;
  const draftModalities = unappliedForms.has('event-form')
    ? [...document.querySelectorAll<HTMLInputElement>('input[name=event-modality]:checked')].map(
        (el) => el.value,
      )
    : null;
  const draftTeacherDay = unappliedForms.has('teacher-day')
    ? document.querySelector<HTMLInputElement>('#teacher-day-date')?.value
    : null;
  if (activeActivity) restoreEventForm();
  // Loading a saved record is read-only. Recalculate dates only after the user
  // applies an edit; current institutional rules may differ from its last save.
  try {
    const periods: CalendarState['periods'] = recalculate
      ? recalculatePeriods(state, allEvents())
      : state.periods;
    const changes = periods.filter((p, i) => p.end !== state.periods[i].end);
    if (changes.length) {
      state.periods = periods;
      dirty = true;
      $('period-auto-status').textContent =
        'Término atualizado automaticamente: ' +
        changes
          .map((p) => p.name + ' — ' + dateLabel(p.end) + ' (' + p.targetDays + ' dias letivos)')
          .join('; ') +
        '.';
    } else
      $('period-auto-status').textContent = periods.some((p) => p.targetDays)
        ? 'Metas de dias letivos ativas: términos recalculados ao alterar os impedimentos.'
        : '';
  } catch (error) {
    $('period-auto-status').textContent = nativeError(error).message;
  }
  let stageCounts: Record<
    string,
    { modality: string; days: number; saturdays: number; excluded: number }[]
  > = {};
  try {
    const adjusted: CalendarEvent[] = recalculate
      ? recalculateAssessmentStages(state, allEvents())
      : state.events;
    if (
      adjusted.some((e, i) => e.start !== state.events[i].start || e.end !== state.events[i].end)
    ) {
      state.events = adjusted;
      dirty = true;
    }
    stageCounts = assessmentDayCounts(state, allEvents());
    $('assessment-auto-status').textContent =
      'Períodos com meta de dias letivos ajustam suas etapas automaticamente.';
  } catch (error) {
    $('assessment-auto-status').textContent = 'Contagem das etapas: ' + nativeError(error).message;
  }
  periodDurationPreview();
  $('regime-summary').textContent = 'Organização: ' + regimeLabels[state.regime];
  $('second-semester-intake-field').hidden = state.regime === 'anual';
  $('second-semester-intake').value =
    state.secondSemesterIntake === false ? 'no' : state.secondSemesterIntake === true ? 'yes' : '';

  if (recalculate && dirty) message('Alteração aplicada.');
  $('selected-modalities').textContent =
    'Forma de oferta/nível: ' +
    calendarModalities(state)
      .filter(Boolean)
      .map((m) => modalityLabels[m])
      .join(' + ');
  const requirements = activityChecklist(state);
  $('assessment-settings').innerHTML = calendarModalities(state)
    .map(
      (m) =>
        `<label>${escape(modalityLabels[m])} — etapas de avaliação no ano<select data-assessment-modality="${m}"><option value="">Selecione</option>${[
          [2, '2 etapas / semestres'],
          [3, '3 etapas / trimestres'],
          [4, '4 etapas / bimestres'],
        ]
          .map(
            ([n, label]) =>
              `<option value="${n}" ${assessmentCount(state, m) === n ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select></label>`,
    )
    .join('');
  $('event-modalities').innerHTML = calendarModalities(state)
    .filter(Boolean)
    .map(
      (m) =>
        `<label class="check"><input type="checkbox" name="event-modality" value="${m}" ${!draftModalities || draftModalities.includes(m) ? 'checked' : ''}>${escape(modalityLabels[m])}</label>`,
    )
    .join('');
  const selected = $('event-requirement').value;
  $('event-requirement').innerHTML =
    '<option value="">Outro evento / sem vínculo</option>' +
    requirements.map((r) => `<option value="${r.id}">${escape(r.name)}</option>`).join('');
  $('event-requirement').value = selected;
  const activityRow = (r: ReturnType<typeof activityChecklist>[number]) =>
    `<li data-activity-row="${r.id}"><div><strong>${escape(r.name)}</strong><small>${
      state.events.some((e) => e.requirementId === r.id)
        ? '✓ Registrado no calendário — ' +
          state.events
            .filter((e) => e.requirementId === r.id)
            .map(
              (e) =>
                dateLabel(e.start) +
                ' a ' +
                dateLabel(e.end) +
                (stageCounts[e.id]
                  ? ' · ' +
                    stageCounts[e.id]
                      .map(
                        (c) =>
                          modalityLabels[c.modality] +
                          ': ' +
                          c.days +
                          ' dias letivos (' +
                          c.saturdays +
                          ' sábados; ' +
                          c.excluded +
                          ' dias excluídos)',
                      )
                      .join(' / ')
                  : '') +
                (e.assessmentAutoStart ? ' · ajuste automático' : ''),
            )
            .join('; ')
        : r.required === false
          ? 'Opcional — preencha apenas se houver previsão no calendário.'
          : 'Pendente de data e fonte'
    }</small></div><div class="actions"><button type="button" data-prepare-activity="${r.id}" >${state.events.some((e) => e.requirementId === r.id) ? 'Editar evento' : 'Preencher atividade'}</button>${
      stageRequirement(r.id)
        ? state.events
            .filter((e) => e.requirementId === r.id)
            .map(
              (e) =>
                `<button type="button" data-remove-event="${escape(e.id)}" aria-label="Excluir datas de ${escape(r.name)}">Excluir datas${state.events.filter((x) => x.requirementId === r.id).length > 1 ? ' — ' + dateLabel(e.start) : ''}</button>`,
            )
            .join('')
        : ''
    }</div></li>`;
  $('assessment-checklist').innerHTML = requirements
    .filter((r) => stageRequirement(r.id))
    .map(activityRow)
    .join('');
  $('activity-checklist').innerHTML = requirements
    .filter((r) => !stageRequirement(r.id))
    .map(activityRow)
    .join('');
  $('assessment-status').textContent = calendarModalities(state).every((m) =>
    [2, 3, 4].includes(assessmentCount(state, m)),
  )
    ? 'Intervalos por oferta'
    : 'Selecione o número de etapas para visualizar e preencher seus intervalos.';

  result = null;
  const issues = [];
  if (!state.campus || !state.offer)
    issues.push(['Pendente', 'Identificação', 'Informe campus e oferta.']);
  if (!state.weekConfirmed)
    issues.push([
      'Pendente',
      'Semana letiva',
      'Registre e confirme os dias regulares e a referência da decisão.',
    ]);
  if (!state.periods.length)
    issues.push([
      'Pendente',
      'Períodos letivos',
      'Cadastre pelo menos um período com início e término.',
    ]);
  if (state.regime !== 'anual' && state.periods.length !== 2)
    issues.push([
      'Pendente',
      'Organização semestral',
      'Cadastre exatamente dois semestres para a conferência anual.',
    ]);
  if (state.campus && state.offer && state.weekConfirmed && state.periods.length) {
    try {
      result = evaluateCalendar(state, allEvents());
    } catch (e) {
      issues.push(['Corrigir', 'Dados do calendário', nativeError(e).message]);
    }
  }
  if (result) {
    for (const [modality, detail] of Object.entries(result.byModality))
      for (const c of detail.checks) {
        if (c.scope !== 'annual' && state.regime === 'anual') continue;
        const name =
          c.scope === 'annual'
            ? 'Total anual'
            : (state.periods.find((p) => p.id === c.scope)?.name ?? c.scope);
        issues.push([
          c.status === 'MET' ? 'Atendido' : c.status === 'NOT_MET' ? 'Corrigir' : 'Pendente',
          modalityLabels[modality] + ' — ' + name,
          c.expected === null
            ? 'Não há mínimo normativo configurado para este escopo.'
            : `${c.observed} de ${c.expected} dias mínimos. ${state.year === 2027 ? 'Resolução 2027, art. 4º.' : ''}`,
        ]);
      }
    for (const c of result.conflicts)
      issues.push([
        'Conflito',
        dateLabel(c.date),
        'Há inclusão e exclusão na mesma data. O dia foi excluído da contagem até a resolução do conflito.',
      ]);
  }
  issues.push(
    [
      'Pendente',
      'Feriados municipais e decisões locais',
      'Confira a legislação municipal. Os itens nacionais e institucionais vêm da base ADMIN; os locais precisam ser registrados com fonte.',
    ],
    [
      'Pendente',
      'Parecer e demais requisitos',
      'As datas centrais e metas de dias estão incorporadas. O checklist completo, a sequência de atividades e as verificações humanas ainda não estão automatizados.',
    ],
    [
      'Pendente',
      'Carga horária e apreciação institucional',
      'Horas, atividades pedagógicas, atas e demais requisitos precisam de análise documental. Não há aprovação oficial.',
    ],
  );
  if (record && record.catalogueRevision !== record.currentCatalogueRevision)
    issues.unshift([
      'Atualizado',
      'Base institucional',
      `Esta tela incorpora a revisão ${record.currentCatalogueRevision}. O último salvamento usava a revisão ${record.catalogueRevision}. Confira o impacto e use Confirmar atualização da base para registrar a nova revisão neste calendário.`,
    ]);
  $('total').textContent = result ? String(result.total) : '—';
  $('goal').textContent = result
    ? 'Marcação dos dias: ' +
      modalityLabels[calendarModalities(state)[0]] +
      '. ' +
      (state.year === 2027
        ? 'Referência: mínimo anual de 200 dias.'
        : 'Sem meta normativa cadastrada para este ano.')
    : 'Configure identificação, semana e períodos.';
  $('period-count').textContent = String(state.periods.length);
  $('period-summary').textContent = result
    ? Object.entries(result.byModality)
        .map(
          ([m, r]) =>
            modalityLabels[m] +
            ': ' +
            r.total +
            ' dias — ' +
            state.periods.map((p) => `${p.name}: ${r.byPeriod[p.id]}`).join(' · '),
        )
        .join(' | ')
    : 'Aguardando dados para contagem';
  $('period-list').innerHTML = state.periods.length
    ? state.periods
        .map(
          (p) =>
            `<li><div><strong>${escape(p.name)}</strong><small>${dateLabel(p.start)} a ${dateLabel(p.end)}${p.targetDays ? ` · Meta: ${p.targetDays} dias letivos · término automático` : ''}</small></div><div class="actions"><button type="button" data-edit-period="${escape(p.id)}">Editar período</button><button type="button" data-remove-period="${escape(p.id)}" aria-label="Remover ${escape(p.name)}">Remover</button></div></li>`,
        )
        .join('')
    : '<li class="help">Nenhum período cadastrado.</li>';
  $('event-list').innerHTML = allEvents().length
    ? allEvents()
        .sort((a, b) => a.start.localeCompare(b.start))
        .map(
          (e) =>
            `<li><div><strong>${escape(e.name)}</strong><small>${dateLabel(e.start)} a ${dateLabel(e.end)} · ${{ include: 'Inclusão letiva', exclude: 'Exclusão', note: 'Sem efeito na contagem' }[e.kind]}</small><small>Fonte: ${escape(e.evidence)}</small>${e.historicalSource ? `<small>Origem histórica: página ${e.historicalSource.page} do <a href="#history-${escape(e.historicalSource.historyId)}" data-history-id="${escape(e.historicalSource.historyId)}">calendário anterior</a></small>` : ''}<small>${escape(categoryLabel(e))}</small></div>${
              e.institutional
                ? e.id === teacherDayId
                  ? `<div><label>Dia do Professor neste calendário<input type="date" id="teacher-day-date" value="${escape(e.start)}" min="${teacherDayWeek(state.year).start}" max="${teacherDayWeek(state.year).end}"></label><button type="button" id="apply-teacher-day">Aplicar data</button><button type="button" id="reset-teacher-day">Restaurar data institucional</button><small>Escolha de ${dateLabel(teacherDayWeek(state.year).start)} a ${dateLabel(teacherDayWeek(state.year).end)}. A alteração vale apenas para este calendário.</small></div>`
                  : ['feriado', 'recesso'].includes(eventCategory(e))
                    ? ''
                    : '<span class="institution-label">Base PROENS</span>'
                : `<label>Categoria e cor<select data-category-event="${escape(e.id)}">${categories.map(([key, label]) => `<option value="${key}" ${eventCategory(e) === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Atividade do roteiro<select data-link-activity="${escape(e.id)}"><option value="">Sem vínculo</option>${activityChecklist(
                    state,
                  )
                    .map(
                      (r) =>
                        `<option value="${r.id}" ${e.requirementId === r.id ? 'selected' : ''}>${escape(r.name)}</option>`,
                    )
                    .join(
                      '',
                    )}</select></label><button type="button" data-edit-event="${escape(e.id)}">Editar evento</button><button data-remove-event="${escape(e.id)}" aria-label="Remover ${escape(e.name)}">Remover</button>`
            }</li>`,
        )
        .join('')
    : '<li class="help">Nenhum evento registrado. Confira a base para este ano.</li>';
  if (draftTeacherDay !== null && document.getElementById('teacher-day-date'))
    $('teacher-day-date').value = draftTeacherDay ?? '';
  if (record?.purpose !== 'test') {
    issues.push([
      !dirty && record?.readiness?.ready ? 'Atendido' : 'Pendente',
      'Geração definitiva',
      dirty
        ? 'A conferência será atualizada após a confirmação do salvamento.'
        : record?.readiness?.ready
          ? 'Conferência registrada. Não representa aprovação oficial.'
          : 'Cópia da proposta disponível para análise. A validação depende da revisão da PROENS.',
    ]);
    if (!dirty)
      for (const issue of record?.readiness?.issues || [])
        issues.push(['Pendente', 'Pendência para validação', issue]);
  }
  if (!dirty)
    for (const warning of record?.readiness?.warnings || [])
      issues.push(['Aviso', 'Organização dos prazos — sem bloqueio', warning]);
  $('issue-count').textContent = String(
    issues.filter((i) => !['Atendido', 'Aviso'].includes(i[0])).length,
  );
  $('issue-list').innerHTML = issues
    .map(
      ([mark, title, detail]) =>
        `<li class="issue-item"><span class="issue-mark">${mark}</span><div><strong>${escape(title)}</strong><small>${escape(detail)}</small></div></li>`,
    )
    .join('');
  $('calendar-title').textContent = `${state.year} · ${state.campus || 'Campus não informado'}${
    state.offer
      ? ' · ' +
        calendarModalities(state)
          .map((m) => modalityLabels[m])
          .join(' + ')
      : ''
  }`;
  $('months').innerHTML = proensLayout(state, allEvents(), result, record, logoUrl);
  renderSaturdays();
  updateStageSuggestion();
  renderHistorySuggestions();
  if (activeActivity) openInlineActivity(activeActivity);
  if (recalculate && dirty && !converting) autosaver.schedule();
  refreshSaveStatus();
}

function sync() {
  for (const [field, id] of [
    ['firstStart', 'vacation-first-start'],
    ['firstEnd', 'vacation-first-end'],
    ['secondStart', 'vacation-second-start'],
    ['secondEnd', 'vacation-second-end'],
    ['thirdStart', 'vacation-third-start'],
    ['thirdEnd', 'vacation-third-end'],
  ] as const)
    editorControl(id).value = state.teacherVacations?.[field] || '';
  $('vacation-evidence').value = state.teacherVacations?.evidence || '';
  vacationPreview();
  if (
    ['integrado', 'subsequente', 'posgraduacao'].includes(state.offer) &&
    !Array.from($('offer').options).some((o) => o.value === state.offer)
  )
    $('offer').add(new Option(modalityLabels[state.offer], state.offer));
  for (const key of ['campus', 'year', 'offer', 'regime'] as const)
    editorControl(key).value = String(state[key]);
  document
    .querySelectorAll<HTMLInputElement>('#weekdays input')
    .forEach((el) => (el.checked = state.weekdays.includes(Number(el.value))));
  $('week-evidence').value = state.weekEvidence;
  $('week-confirmed').checked = state.weekConfirmed;
}

$('identity').onsubmit = (e) => e.preventDefault();
$('week-form').addEventListener('submit', (e) => {
  e.preventDefault();
  act(() => {
    identified();
    const weekdays = [
      ...document.querySelectorAll<HTMLInputElement>('#weekdays input:checked'),
    ].map((el) => Number(el.value));
    if (!weekdays.length) throw Error('Selecione pelo menos um dia regular.');
    if (!$('week-evidence').value.trim()) throw Error('Informe a referência da semana letiva.');
    Object.assign(state, {
      weekdays,
      weekEvidence: $('week-evidence').value.trim(),
      weekConfirmed: $('week-confirmed').checked,
    });
    dirty = true;
    render({ recalculate: true });
    markAppliedForm('week-form');
    message('Semana letiva confirmada. Contagem atualizada.');
  });
});
$('period-form').addEventListener('submit', (e) => {
  e.preventDefault();
  act(() => {
    if ($('period-days').value)
      $('period-end').value = durationEnd(
        $('period-start').value,
        $('period-days').value,
        state,
        allEvents(),
      );
    identified();
    const start = $('period-start').value,
      end = $('period-end').value,
      name = $('period-name').value.trim();
    interval(start, end);
    if (!name) throw Error('Informe o nome do período.');
    if (state.periods.some((p) => p.id !== editingPeriodId && p.start <= end && p.end >= start))
      throw Error(
        'Este período se sobrepõe a outro. Para bimestres ou etapas de outra oferta, use Etapas de avaliação logo abaixo; os períodos letivos comuns não devem se sobrepor.',
      );
    const previous = editingPeriodId ? state.periods.find((p) => p.id === editingPeriodId) : null;
    if (editingPeriodId && !previous)
      throw Error('O período não existe mais. Reabra o calendário.');
    const updated = {
      id: previous?.id || crypto.randomUUID(),
      name,
      start,
      end,
      ...($('period-days').value ? { targetDays: Number($('period-days').value) } : {}),
    };
    if (previous) state.periods = state.periods.map((p) => (p.id === previous.id ? updated : p));
    else state.periods.push(updated);
    dirty = true;
    resetPeriodForm();
    render({ recalculate: true });
    message(
      previous
        ? 'Período atualizado. Confira as etapas, os eventos relacionados e o indicador de salvamento.'
        : 'Período adicionado.',
    );
  });
});
$('event-form').addEventListener('submit', (e) => {
  e.preventDefault();
  act(() => {
    identified();
    const start = $('event-start').value,
      end = $('event-end').value,
      kind = $('event-kind').value,
      name = $('event-name').value.trim(),
      evidence = $('event-evidence').value.trim();
    if (kind !== 'include' && kind !== 'exclude' && kind !== 'note')
      throw new Error('Tipo de evento inválido.');
    interval(start, end);
    if (!name || !evidence) throw Error('Informe descrição e fonte.');
    if (
      kind === 'include' &&
      datesBetween(start, end).some(
        (date) => !state.periods.some((p) => p.start <= date && p.end >= date),
      )
    )
      throw Error('Inclusões letivas devem estar dentro dos períodos cadastrados.');
    const modalities = selectedEventModalities();
    if (!modalities.length)
      throw Error('Selecione ao menos uma forma de oferta/nível para o evento.');
    if (
      state.events.some(
        (ev) =>
          ev.id !== editingEventId &&
          ev.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
          ev.start === start &&
          ev.end === end,
      )
    )
      throw Error('Este evento já foi incluído com as mesmas datas.');
    const completedHistoryIndex = inlineHistoryIndex;
    const previous = editingEventId ? state.events.find((ev) => ev.id === editingEventId) : null;
    if (editingEventId && !previous)
      throw Error(
        'O evento não existe mais. Abra outro evento ou clique em Adicionar novo evento.',
      );
    const updated: CalendarEvent = {
      ...previous,
      hours: $('event-hours').value ? Number($('event-hours').value) : undefined,
      historicalSource: previous?.historicalSource || historicalSource || undefined,
      modalities,
      requirementId: $('event-requirement').value || undefined,
      id: previous?.id || crypto.randomUUID(),
      name,
      start,
      end,
      kind,
      evidence,
      category: $('event-category').value,
    };
    if (previous && stageRequirement(previous.requirementId)) {
      delete updated.assessmentAutoStart;
      for (const event of state.events)
        if (
          stageRequirement(event.requirementId) &&
          (!event.modalities?.length || event.modalities.some((m) => modalities.includes(m)))
        )
          delete event.assessmentAutoStart;
    }
    if (previous) state.events = state.events.map((ev) => (ev.id === previous.id ? updated : ev));
    else state.events.push(updated);
    editingEventId = updated.id;
    setEventSubmitLabel();
    historicalSource = null;
    $('historical-event-source').hidden = true;
    dirty = true;
    render({ recalculate: true });
    markAppliedForm('event-form');
    document
      .querySelectorAll<HTMLInputElement>('input[name=event-modality]')
      .forEach((el) => (el.checked = modalities.some((modality) => modality === el.value)));
    if (completedHistoryIndex !== null) {
      const row = document.querySelector('[data-history-item="' + completedHistoryIndex + '"]');
      row?.scrollIntoView({ block: 'nearest' });
    }
    message(
      'Evento registrado: ' +
        name +
        ' — ' +
        dateLabel(start) +
        ' a ' +
        dateLabel(end) +
        '. Os dados continuam visíveis.',
    );
  });
});
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) {
    document
      .querySelectorAll<HTMLElement>('.view')
      .forEach((v) => (v.hidden = v.id !== b.dataset.view));
    document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
      t.classList.toggle('active', t === b);
      if (t === b) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
  }
  if (b.dataset.editPeriod) editPeriod(b.dataset.editPeriod);
  if (b.dataset.removePeriod) {
    if (editingPeriodId === b.dataset.removePeriod) resetPeriodForm();
    state.periods = state.periods.filter((p) => p.id !== b.dataset.removePeriod);
    dirty = true;
    render({ recalculate: true });
    message('Período removido. Confira os eventos que dependiam dele.');
  }
  if (b.dataset.editEvent) editEvent(b.dataset.editEvent);
  if (b.dataset.removeEvent) {
    if (editingEventId === b.dataset.removeEvent) {
      $('event-form').reset();
      restoreEventForm();
    }
    if (
      ['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'].includes(
        b.dataset.removeEvent,
      )
    ) {
      delete state.teacherVacations;
      state.events = state.events.filter(
        (ev) =>
          !['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'].includes(
            ev.id,
          ),
      );
      sync();
    }
    state.events = state.events.filter((ev) => ev.id !== b.dataset.removeEvent);
    dirty = true;
    render({ recalculate: true });
    message('Evento removido do rascunho. Acompanhe a confirmação do salvamento no indicador.');
  }
});
$('save').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `rascunho-calendario-${state.year}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(
    'Download solicitado. Guarde o arquivo para continuar depois. Somente dados aplicados aos formulários foram incluídos.',
  );
};
$('load').onclick = () => $('file').click();

$('file').onchange = async () => {
  const f = $('file').files?.[0];
  if (!f) return;
  try {
    if (f.size > 2_000_000) throw Error('O rascunho excede o limite de 2 MB.');
    const next = validateImport(JSON.parse(await f.text()));
    if (
      record &&
      (next.year !== record.state.year ||
        next.offer !== record.state.offer ||
        next.campus !== record.state.campus)
    )
      throw Error('O rascunho deve corresponder ao campus, ano e oferta deste registro.');
    if (
      (dirty || unappliedInputs) &&
      !(await confirmAction({
        title: 'Substituir o rascunho atual?',
        description: `Abrir “${f.name}” substituirá os dados desta sessão, incluindo os campos ainda não aplicados.`,
        consequence:
          'Baixe uma cópia das alterações aplicadas antes de continuar se precisar preservá-las.',
        intent: 'danger',
        confirmLabel: 'Substituir rascunho',
        cancelLabel: 'Manter rascunho atual',
      }))
    )
      return;
    // Discard unapplied form fields only after the user accepts the replacement.
    for (const id of appliedFormIds) {
      const form = document.getElementById(id);
      if (form instanceof HTMLFormElement) form.reset();
    }
    resetPeriodForm();
    restoreEventForm();
    historicalSource = null;
    $('historical-event-source').hidden = true;
    selectedSaturdays.clear();
    unappliedForms.clear();
    unappliedInputs = false;
    state = next;
    dirty = true;
    sync();
    render({ recalculate: true });
    message('Rascunho importado.');
  } catch (err) {
    message('Não foi possível abrir: ' + nativeError(err).message, true);
  } finally {
    $('file').value = '';
  }
};
$('print').onclick = async () => {
  try {
    if (!record) throw new Error('Abra um calendário registrado.');
    await autosaver.save();
    if (dirty)
      throw Error('O salvamento ainda não foi confirmado. Confira o indicador antes de imprimir.');
    const fresh = await calendars.get(calendarId);
    if (
      fresh.version !== record.version ||
      fresh.currentCatalogueRevision !== record.currentCatalogueRevision
    )
      throw Error(
        'O calendário ou a base institucional mudou. Reabra e confira antes de imprimir.',
      );
    record.readiness = fresh.readiness;
    record.proposalCopy = fresh.purpose !== 'test' && !fresh.readiness?.ready;
    $('months').innerHTML = proensLayout(state, allEvents(), result, record, logoUrl);
    window.print();
  } catch (e) {
    message(nativeError(e).message, true);
  }
};
window.addEventListener('beforeunload', (e) => {
  if (dirty || unappliedInputs) {
    e.preventDefault();
    e.returnValue = '';
  }
});
type ReadTool = {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, never> };
  execute: () => Promise<{ content: { type: string; text: string }[] }>;
};
const modelContext = (
  navigator as Navigator & { modelContext?: { registerTool: (tool: ReadTool) => void } }
).modelContext;
// Structured read tool only: no mutation or automatic confirmation by agents.
if (modelContext?.registerTool)
  modelContext.registerTool({
    name: 'read_calendar_summary',
    description:
      'Read the local calendar totals and pending checks; never certifies institutional approval.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            campus: state.campus,
            year: state.year,
            offer: state.offer,
            total: result?.total ?? null,
            officialApproval: false,
            institutionalValidation: 'INCOMPLETE',
          }),
        },
      ],
    }),
  });

function updateRecordHeading() {
  if (!record) return;
  $('make-definitive').hidden = record.purpose !== 'test';
  $('record-title').textContent = record.name;
  $('record-heading').textContent =
    `${record.purpose === 'test' ? 'Teste · PDF identificado como teste' : 'Definitivo · sujeito à conferência e revisão'} · ${record.courses}${record.classes ? ' · ' + record.classes : ''}${record.shifts ? ' · ' + record.shifts : ''}`;
}

async function openRecord() {
  if (!calendarId) {
    location.href = '/';
    return;
  }
  try {
    const [status, opened] = await Promise.all([accounts.status(), calendars.get(calendarId)]);
    record = opened;
    isAdmin = status.user?.role === 'ADMIN';
    state = record.state;
    institutional = record.institutionalEvents;
    sync();
    for (const key of ['campus', 'year', 'offer']) editorControl(key).disabled = true;
    updateRecordHeading();
    showHistory();
    render();
    observeRecord();
    if (location.hash === '#history-area') openHistory();
  } catch (e) {
    message(nativeError(e).message, true);
  }
}

let stopRecordSubscription: (() => void) | undefined;
let unappliedInputs = false;
let saveInFlight = false;
const unappliedForms = new Set<string>();
const appliedFormIds = new Set([
  'week-form',
  'period-form',
  'event-form',
  'saturday-form',
  'vacation-form',
  'history-form',
]);

function markAppliedForm(formId: string) {
  unappliedForms.delete(formId);
  unappliedInputs = unappliedForms.size > 0;
  refreshSaveStatus();
}

function trackUnappliedForm(event: Event) {
  if (!(event.target instanceof HTMLElement)) return;
  const formId =
    event.target.id === 'teacher-day-date' ? 'teacher-day' : event.target.closest('form')?.id;
  if (
    !formId ||
    (!appliedFormIds.has(formId) && formId !== 'teacher-day') ||
    event.target.id === 'saturday-month'
  )
    return;
  unappliedForms.add(formId);
  unappliedInputs = true;
  refreshSaveStatus();
}

document.addEventListener('input', trackUnappliedForm);
document.addEventListener('change', trackUnappliedForm);

function observeRecord() {
  stopRecordSubscription?.();
  stopRecordSubscription = subscribeCalendar(
    calendarId,
    (fresh) => {
      if (!record) return;
      const changed =
        fresh.version !== record.version ||
        fresh.currentCatalogueRevision !== record.currentCatalogueRevision;
      record.histories = fresh.histories;
      showHistory();
      if (!changed) return;
      if (dirty || unappliedInputs || saveInFlight || converting) {
        if (!saveInFlight)
          message(
            'O calendário ou a base institucional mudou em outra sessão. Suas alterações foram preservadas. A cópia inclui somente alterações já aplicadas; confira os campos em edição antes de reabrir. O salvamento verificará a versão atual.',
            true,
          );
        return;
      }
      record = fresh;
      state = fresh.state;
      institutional = fresh.institutionalEvents;
      sync();
      updateRecordHeading();
      render();
      message('Calendário atualizado com as alterações recebidas de outra sessão.');
    },
    (error) => message(nativeError(error).message, true),
  );
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[data-history-id]');
  if (link)
    downloadLink(
      event,
      { kind: 'history', id: link.dataset.historyId ?? '' },
      'calendario-anterior.pdf',
    ).catch((error) => message(nativeError(error).message, true));
});

function openHistory() {
  document.querySelector<HTMLButtonElement>('[data-view="edit"]')?.click();
  $('history-area').scrollIntoView({ behavior: 'smooth' });
  $('history-file').focus({ preventScroll: true });
}

$('open-history').onclick = openHistory;

function showHistory() {
  if (!record) return;
  $('history-list').innerHTML = record.histories.length
    ? record.histories
        .map((h) => {
          const missing = h.unavailableFile;
          const restoring = restoringHistories.has(h.id);
          return `<li><div><strong>${h.year} · ${escape(h.filename)}</strong>${h.notes ? '<small>' + escape(h.notes) + '</small>' : ''}<a href="#history-${escape(h.id)}" data-history-id="${escape(h.id)}">Consultar PDF original</a>${missing ? `<p class="notice">PDF original aguardando restauração pela administração.</p>${isAdmin ? `<form data-restore-history="${escape(h.id)}" aria-busy="${restoring}"><label>PDF original<input type="file" name="original" accept="application/pdf,.pdf" required ${restoring ? 'disabled' : ''}></label><small>Selecione o mesmo PDF original deste registro. Os dados e análises serão preservados.</small><button type="submit" ${restoring ? 'disabled' : ''}>${restoring ? 'Restaurando…' : 'Restaurar PDF original'}</button></form>` : ''}` : ''}</div><button type="button" data-analyze-history="${escape(h.id)}">Identificar datas e atividades</button></li>`;
        })
        .join('')
    : '<li>Envie o calendário anterior para consultar seus feriados e eventos locais.</li>';
}

$('history-list').addEventListener('submit', (event) => {
  void restoreHistoryOriginal(event);
});

async function restoreHistoryOriginal(event: Event) {
  if (!(event.target instanceof Element)) return;
  const form = event.target.closest<HTMLFormElement>('form[data-restore-history]');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.restoreHistory;
  if (!id || !record) return;
  if (!isAdmin || restoringHistories.has(id)) return;
  const file = form.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
  restoringHistories.add(id);
  showHistory();
  try {
    if (!file) throw new Error('Escolha o PDF original.');
    const payload = await filePayload(file);
    await calendars.restoreHistoryOriginal(id, payload.uploadId);
    const fresh = await calendars.get(calendarId);
    record.histories = fresh.histories;
    message('PDF original restaurado. Os dados e análises foram preservados.');
  } catch (error) {
    message(nativeError(error).message, true);
  } finally {
    restoringHistories.delete(id);
    showHistory();
  }
}

async function analyzeUploadedHistory(id: string) {
  $('history-status').textContent =
    'PDF guardado. Lendo o texto para identificar possíveis feriados e eventos…';
  $('history-analysis').hidden = true;
  historyAnalysis = null;
  analyzedHistory = null;
  try {
    const analysis = await calendars.analyzeHistory(id);
    historyAnalysis = analysis;
    analyzedHistory = record.histories.find((h) => h.id === id) ?? null;
    $('history-analysis').hidden = false;
    $('history-analysis-help').textContent = analysis.needsText
      ? 'Este PDF parece ser uma imagem digitalizada. Ainda não há leitura de imagens (OCR). Envie uma versão com texto selecionável ou consulte o original e preencha os eventos manualmente.'
      : `Foram encontrados ${analysis.candidates.length} possíveis itens${analysis.truncated ? ' (limite de 150)' : ''}. A leitura pode omitir ou juntar trechos. Confira as datas e fontes vigentes antes de incluir.`;
    renderHistorySuggestions();
    $('history-text').textContent = analysis.pages
      .map((p) => `Página ${p.page}\n${p.text}`)
      .join('\n\n');
    $('history-status').textContent = 'Leitura concluída.';
  } catch (err) {
    $('history-status').textContent = nativeError(err).message;
    message(nativeError(err).message, true);
  }
}

document.addEventListener('click', (event) => {
  void handleHistoryClick(event);
});

async function handleHistoryClick(e: MouseEvent) {
  if (!(e.target instanceof Element)) return;
  const b = e.target.closest<HTMLButtonElement>('[data-analyze-history]');
  if (b) {
    b.disabled = true;
    await analyzeUploadedHistory(b.dataset.analyzeHistory ?? '');
    b.disabled = false;
  }
  const discard = e.target.closest<HTMLButtonElement>('[data-history-discard]');
  if (discard && historyAnalysis && analyzedHistory) {
    const c = historyAnalysis.candidates[Number(discard.dataset.historyDiscard)],
      key = analyzedHistory.id + ':' + historyCandidateKey(c);
    state.ignoredHistory ??= [];
    if (state.ignoredHistory.includes(key))
      state.ignoredHistory = state.ignoredHistory.filter((k) => k !== key);
    else state.ignoredHistory.push(key);
    historicalSource = null;
    restoreEventForm();
    $('event-form').reset();
    $('historical-event-source').hidden = true;
    dirty = true;
    render({ recalculate: true });
    message('Decisão sobre o evento aplicada.');
    return;
  }
  const candidateButton = e.target.closest<HTMLButtonElement>('[data-history-candidate]');
  if (!candidateButton || !historyAnalysis || !analyzedHistory) return;
  const c = historyAnalysis.candidates[Number(candidateButton.dataset.historyCandidate)];
  if (!c) return;
  if (
    includedHistoryCandidate(state.events, analyzedHistory.id, c, historyAnalysis.candidates) ||
    existingHistoryEvent(allEvents(), c, state)
  )
    return;
  editingEventId = null;
  setEventSubmitLabel();
  historicalSource = {
    historyId: analyzedHistory.id,
    page: c.page,
    candidateKey: historyCandidateKey(c),
  };
  $('historical-event-source').hidden = false;
  $('historical-event-source').textContent =
    `Origem histórica: ${analyzedHistory.filename}, página ${c.page}. Confira a descrição, informe as datas de ${state.year} e a fonte vigente. O PDF anterior não comprova a vigência do feriado.`;
  $('event-requirement').value = '';
  $('event-name').value = c.name;
  $('event-category').value = c.category;
  $('event-kind').value = 'note';
  const proposed = proposedDates(c, state.year);
  $('event-start').value = proposed.start;
  $('event-end').value = proposed.end;
  $('event-evidence').value = '';
  $('event-hours').value = '';
  $('event-confirmed').checked = false;
  updateStageSuggestion();
  openInlineHistory(Number(candidateButton.dataset.historyCandidate));
  $('event-name').focus({ preventScroll: true });
  message(
    'Sugestão aberta para revisão. Confira também o efeito na contagem e a forma de oferta/nível.',
  );
}

let converting = false;
let saveStatus: AutosaveStatus | 'idle' = 'idle';
let saveStatusData: { updatedAt?: string; message?: string; status?: number } | undefined;
let nativeConnected = true;

function refreshSaveStatus() {
  const outdatedBase = record && record.catalogueRevision !== record.currentCatalogueRevision;
  const labels = {
    idle: 'Salvamento automático ativo.',
    scheduled: 'Alterações aplicadas aguardando salvamento automático…',
    saving: 'Salvando…',
    pending: 'Última versão salva. Salvando as alterações seguintes…',
    saved:
      'Salvo às ' +
      new Date(saveStatusData?.updatedAt || record?.updatedAt || Date.now()).toLocaleTimeString(
        'pt-BR',
      ) +
      '.',
    error:
      'Não foi possível salvar: ' +
      (saveStatusData?.message || 'Confira a conexão.') +
      ' Use Tentar novamente. Baixar cópia guarda as alterações já aplicadas.',
    blocked:
      (saveStatusData?.status === 401 ? 'Sessão expirada: ' : 'Conflito de versões: ') +
      (saveStatusData?.message || 'Reabra o calendário para conferir a versão atual.') +
      ' Suas alterações continuam nesta tela. Baixe uma cópia das alterações aplicadas antes de sair.',
  };
  let text = labels[saveStatus];
  if (outdatedBase && ['idle', 'saved'].includes(saveStatus))
    text +=
      ' A base institucional mudou. Confira o impacto e confirme a atualização neste calendário.';
  if (!nativeConnected && !['error', 'blocked'].includes(saveStatus))
    text =
      dirty || saveInFlight
        ? 'Sem conexão. Alterações aplicadas aguardam sincronização. Mantenha esta tela aberta; o envio continua quando a conexão voltar. Baixar cópia guarda as alterações aplicadas.'
        : 'Sem conexão. Novas alterações aguardarão sincronização. Mantenha esta tela aberta até a confirmação do salvamento.';
  $('autosave-status').textContent = text;
  $('autosave-status').dataset.state = saveStatus;
  $('autosave-status').className =
    ['error', 'blocked'].includes(saveStatus) || !nativeConnected ? 'notice' : '';
  const retry = saveStatus === 'error';
  const confirmBase = outdatedBase && !dirty && ['idle', 'saved'].includes(saveStatus);
  $('server-save').hidden = !record || (!retry && !confirmBase);
  $('server-save').disabled = saveInFlight || converting || !nativeConnected;
  $('server-save').textContent = retry ? 'Tentar novamente' : 'Confirmar atualização da base';
  $('server-save').title = retry
    ? 'Enviar novamente as alterações aplicadas neste calendário.'
    : 'Registrar a revisão atual da base institucional neste calendário após sua conferência.';
  $('unapplied-status').hidden = !unappliedInputs;
}

const autosaver = createAutosaver({
  isDirty: () => !!record && dirty,
  snapshot: () => ({
    version: record.version,
    catalogueRevision: record.currentCatalogueRevision,
    state,
  }),
  write: (body) => calendars.save(calendarId, body),
  onSaved: (saved, sent) => {
    const unchanged = JSON.stringify(state) === JSON.stringify(sent.state);
    record.version = saved.version;
    record.updatedAt = saved.updatedAt;
    record.catalogueRevision = sent.catalogueRevision;
    record.readiness = saved.readiness;
    if (unchanged) {
      state = saved.state;
      dirty = false;
    }
  },
  onStatus: (status, data) => {
    saveInFlight = status === 'saving';
    saveStatus = status;
    saveStatusData =
      status === 'error' || status === 'blocked'
        ? nativeError(data)
        : record
          ? { updatedAt: record.updatedAt }
          : undefined;
    refreshSaveStatus();
  },
});
const stopConnectionSubscription = subscribeNativeConnection((connected) => {
  nativeConnected = connected;
  refreshSaveStatus();
});
window.addEventListener('pagehide', () => stopConnectionSubscription());
$('server-save').onclick = () => {
  if (converting) return;
  if (!record) {
    message('Abra um calendário registrado.', true);
    return;
  }
  void autosaver.save(true);
};
$('make-definitive').onclick = () => {
  if (!record || record.purpose !== 'test' || converting) return;
  void confirmAction({
    title: 'Tornar calendário definitivo?',
    description:
      'Os dados e o histórico serão mantidos. Você poderá continuar editando o calendário.',
    consequence:
      'Isso não representa aprovação institucional. A geração definitiva exige a revisão prevista no sistema.',
    intent: 'primary',
    confirmLabel: 'Tornar definitivo',
    pendingLabel: 'Convertendo…',
    onConfirm: async () => {
      if (!record || record.purpose !== 'test')
        throw new Error('Reabra o calendário para conferir a situação atual.');
      converting = true;
      $('make-definitive').disabled = true;
      refreshSaveStatus();
      try {
        await autosaver.save();
        if (dirty)
          throw new Error(
            'Não foi possível concluir o salvamento. Resolva a pendência indicada antes de tornar definitivo.',
          );
        $('server-save').disabled = true;
        const saved = await calendars.makeDefinitive(calendarId, record.version);
        Object.assign(record, saved);
        updateRecordHeading();
        render();
        message(
          'Calendário convertido para definitivo. Os dados e o histórico foram mantidos. Você pode continuar editando. Confira as pendências antes de gerar o PDF definitivo.',
        );
      } finally {
        converting = false;
        $('make-definitive').disabled = false;
        refreshSaveStatus();
        if (dirty) autosaver.schedule();
      }
    },
  });
};

$('history-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!record) return;
  $('history-submit').disabled = true;
  try {
    const file = $('history-file').files?.[0];
    if (!file || file.size > 8_000_000) throw Error('Envie um PDF de até 8 MB.');
    $('history-status').textContent = 'Enviando calendário anterior…';
    const payload = await filePayload(file);
    const uploaded = await calendars.uploadHistory(calendarId, {
      filename: file.name,
      year: state.year - 1,
      ...payload,
      notes: $('history-notes').value,
    });
    const fresh = await calendars.get(calendarId);
    record.histories = fresh.histories;
    showHistory();
    $('history-form').reset();
    markAppliedForm('history-form');
    message('Calendário anterior guardado neste campus.');
    await analyzeUploadedHistory(uploaded.id);
  } catch (err) {
    $('history-status').textContent = nativeError(err).message;
    message(nativeError(err).message, true);
  } finally {
    $('history-submit').disabled = false;
  }
};
const monthNames = Array.from({ length: 12 }, (_, m) =>
  new Date(Date.UTC(2027, m, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }),
);
const selectedSaturdays = new Set<string>();
$('saturday-month').innerHTML = monthNames
  .map((name, m) => `<option value="${m + 1}">${name}</option>`)
  .join('');

function renderSaturdays() {
  const dates = monthSaturdays(state.year, Number($('saturday-month').value));
  $('saturday-dates').innerHTML =
    '<legend>Sábados de ' +
    monthNames[Number($('saturday-month').value) - 1] +
    '</legend>' +
    dates
      .map((date) => {
        const inside = state.periods.some((p) => p.start <= date && date <= p.end),
          included = allEvents().some(
            (e) => e.kind === 'include' && e.start <= date && date <= e.end,
          ),
          blocked = allEvents().some(
            (e) => e.kind === 'exclude' && e.start <= date && date <= e.end,
          );
        if (included) selectedSaturdays.delete(date);
        return `<label class="check"><input type="checkbox" value="${date}" ${included ? 'disabled' : ''} ${included || selectedSaturdays.has(date) ? 'checked' : ''}>${dateLabel(date)}${included ? ' · já registrado' : !inside ? ' · ajuste o período letivo antes de adicionar' : ''}${blocked ? ' · feriado/recesso: conflito se incluído' : ''}</label>`;
      })
      .join('');
  const count = dates.filter((date) =>
    allEvents().some((e) => e.kind === 'include' && e.start <= date && date <= e.end),
  ).length;
  $('saturday-summary').textContent =
    (state.periods.length
      ? ''
      : 'Primeiro, cadastre o início e o término na seção 3. Períodos letivos. Você já pode selecionar os sábados, mas só poderá adicioná-los dentro de um período. ') +
    `${count} sábado(s) registrado(s) neste mês. Caixas marcadas e desativadas indicam datas já registradas; para removê-las, use a lista de eventos abaixo.`;
}

$('saturday-dates').addEventListener('change', (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.matches('input[type="checkbox"]') && !input.disabled) {
    if (input.checked) selectedSaturdays.add(input.value);
    else selectedSaturdays.delete(input.value);
  }
});
$('saturday-month').onchange = renderSaturdays;
$('saturday-form').onsubmit = (e) => {
  e.preventDefault();
  act(() => {
    identified();
    const dates = [
      ...document.querySelectorAll<HTMLInputElement>(
        '#saturday-dates input:checked:not(:disabled)',
      ),
    ].map((el) => el.value);
    const additions = saturdayEvents(
      state,
      dates,
      $('saturday-name').value,
      $('saturday-evidence').value,
      () => crypto.randomUUID(),
    );
    state.events.push(...additions);
    for (const date of dates) selectedSaturdays.delete(date);
    dirty = true;
    render({ recalculate: true });
    if (!selectedSaturdays.size) markAppliedForm('saturday-form');
    message(`${additions.length} sábado(s) adicionado(s).`);
  });
};
$('download-pdf').onclick = async () => {
  if (!record) return;
  const button = $('download-pdf');
  try {
    button.disabled = true;
    $('download-pdf-top').disabled = true;
    await autosaver.save();
    if (dirty)
      throw Error(
        'O salvamento ainda não foi confirmado. Confira o indicador antes de baixar o PDF.',
      );
    button.textContent = 'Gerando PDF…';
    $('download-pdf-top').textContent = 'Gerando PDF…';
    message('Gerando o calendário em PDF. Aguarde o download.');
    const pdfBody = {
      version: record.version,
      catalogueRevision: record.currentCatalogueRevision,
      copy: record.purpose !== 'test' && !record.readiness?.ready,
    };
    const file = await calendars.generatePdf(calendarId, pdfBody);
    const response = await fetch(file.url);
    if (!response.ok) {
      const data = await response.json();
      throw Error(data.error);
    }
    const url = URL.createObjectURL(await response.blob()),
      link = document.createElement('a');
    link.href = url;
    link.download = `${record.purpose === 'test' ? 'teste-' : !record.readiness?.ready ? 'proposta-' : ''}calendario-${state.year}-v${record.version}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    message('PDF gerado. Confira o arquivo antes do encaminhamento institucional.');
  } catch (e) {
    message(nativeError(e).message, true);
  } finally {
    button.disabled = false;
    $('download-pdf-top').disabled = false;
    button.textContent = 'Baixar PDF';
    $('download-pdf-top').textContent = 'Baixar calendário em PDF';
  }
};
$('event-category').innerHTML = categories
  .map(([key, label]) => `<option value="${key}">${label}</option>`)
  .join('');
$('event-category').value = 'recesso';
document.addEventListener('change', (e) => {
  if (!(e.target instanceof HTMLSelectElement)) return;
  const target = e.target;
  if (!target.dataset.categoryEvent) return;
  const event = state.events.find((x) => x.id === target.dataset.categoryEvent);
  if (!event) return;
  event.category = e.target.value;
  dirty = true;
  render({ recalculate: true });
  message('Categoria e cor aplicadas. O efeito na contagem foi preservado.');
});
$('event-category').onchange = () => {
  const category = $('event-category').value;
  $('event-kind').value = ['feriado', 'recesso', 'ferias'].includes(category)
    ? 'exclude'
    : category === 'sabado'
      ? 'include'
      : 'note';
};
$('proens-color-guide').innerHTML = categories
  .filter((c) => c[2])
  .map(([key, label]) => `<span class="cat-${key}">${label}</span>`)
  .join('');
$('download-pdf-top').onclick = () => $('download-pdf').click();
void openRecord();

$('recalculate-stages').onclick = () =>
  act(() => {
    const next = state.events.map((e) => ({ ...e }));
    let groups = 0;
    for (const m of calendarModalities(state)) {
      const rows = next.filter(
        (e) =>
          stageRequirement(e.requirementId) && (!e.modalities?.length || e.modalities.includes(m)),
      );
      if (!rows.length) continue;
      if (rows.length !== assessmentCount(state, m))
        throw Error('Preencha todas as etapas de ' + modalityLabels[m] + ' antes de recalcular.');
      const anchor = rows.map((e) => e.start).sort((a, b) => a.localeCompare(b))[0];
      for (const row of rows) row.assessmentAutoStart = anchor;
      groups++;
    }
    if (!groups) throw Error('Preencha as etapas antes de recalcular.');
    const updated = recalculateAssessmentStages({ ...state, events: next }, [
      ...campusEvents(),
      ...next,
    ]);
    state.events = updated;
    dirty = true;
    render({ recalculate: true });
    message(
      'Etapas recalculadas com sábados e impedimentos. O ajuste automático está ativo. Confira também os prazos de resultados e reuniões e o indicador de salvamento.',
    );
  });
$('assessment-settings').addEventListener('change', (e) => {
  if (!(e.target instanceof HTMLSelectElement)) return;
  const modality = e.target.dataset.assessmentModality,
    value = Number(e.target.value);
  if (!modality || (e.target.value !== '' && ![2, 3, 4].includes(value))) return;
  restoreEventForm();
  $('event-form').reset();
  state.assessmentStagesByModality = Object.fromEntries(
    calendarModalities(state)
      .map((m): [Modality, number] => [m, m === modality ? value : assessmentCount(state, m)])
      .filter((row): row is [Modality, 2 | 3 | 4] => [2, 3, 4].includes(row[1])),
  );
  state.events = migrateAssessmentEvents(state);
  const ids = new Set(activityChecklist(state).map((r) => r.id));
  for (const event of state.events)
    if (event.requirementId && !ids.has(event.requirementId)) {
      delete event.requirementId;
      delete event.assessmentAutoStart;
    }
  dirty = true;
  render({ recalculate: true });
  message(
    value
      ? 'Etapas da oferta aplicadas. Os eventos existentes foram preservados; confira os intervalos.'
      : 'Escolha das etapas desfeita para ' +
          modalityLabels[modality] +
          '. Se havia eventos preenchidos, eles permanecem na lista de Eventos e impedimentos e podem ser removidos lá.',
  );
});

function prepareActivity(id: string) {
  const existing = state.events.find((e) => e.requirementId === id);
  if (existing) {
    editEvent(existing.id);
    return;
  }
  editingEventId = null;
  setEventSubmitLabel();
  restoreEventForm();
  historicalSource = null;
  $('historical-event-source').hidden = true;
  const item = activityChecklist(state).find((r) => r.id === id);
  if (!item) {
    updateStageSuggestion();
    return;
  }
  $('event-requirement').value = id;
  document.querySelectorAll<HTMLInputElement>('input[name=event-modality]').forEach((el) => {
    el.checked = !item.modality || el.value === item.modality;
  });
  $('event-name').value = item.name;
  $('event-category').value = id.includes('council')
    ? 'conselho'
    : id.startsWith('stage-')
      ? 'limite'
      : id === 'cultural-week'
        ? 'evento'
        : 'prazo';
  $('event-kind').value = 'note';
  $('event-start').value = '';
  $('event-end').value = '';
  $('event-evidence').value = '';
  $('event-hours').value = '';
  $('event-confirmed').checked = false;
  updateStageSuggestion();
  openInlineActivity(id);
  $('event-start').focus({ preventScroll: true });
}

$('event-requirement').onchange = () => {
  if (!editingEventId) prepareActivity($('event-requirement').value);
};
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  const b = e.target.closest<HTMLButtonElement>('[data-prepare-activity]');
  if (b) prepareActivity(b.dataset.prepareActivity ?? '');
});
document.addEventListener('change', (e) => {
  if (!(e.target instanceof HTMLSelectElement)) return;
  const target = e.target;
  if (!target.dataset.linkActivity) return;
  const event = state.events.find((x) => x.id === target.dataset.linkActivity);
  if (event) {
    event.requirementId = e.target.value || undefined;
    delete event.assessmentAutoStart;
    dirty = true;
    render({ recalculate: true });
  }
});

function vacationValues(): Omit<NonNullable<CalendarState['teacherVacations']>, 'evidence'> {
  return {
    firstStart: $('vacation-first-start').value,
    firstEnd: $('vacation-first-end').value,
    secondStart: $('vacation-second-start').value,
    secondEnd: $('vacation-second-end').value,
    thirdStart: $('vacation-third-start').value,
    thirdEnd: $('vacation-third-end').value,
  };
}

function vacationPreview() {
  try {
    const v = teacherVacations(
      state.year,
      vacationValues(),
      $('vacation-evidence').value || 'Prévia',
    );
    $('vacation-preview').textContent =
      'Total informado: ' + v.total + ' dias. Confira o quantitativo e a decisão do campus.';
  } catch (e) {
    $('vacation-preview').textContent = nativeError(e).message;
  }
}

$('vacation-form').addEventListener('change', vacationPreview);
$('vacation-form').onsubmit = (e) => {
  e.preventDefault();
  act(() => {
    const values = vacationValues(),
      evidence = $('vacation-evidence').value.trim(),
      vacation = teacherVacations(state.year, values, evidence);
    state.teacherVacations = { ...values, evidence };
    state.events = state.events
      .filter(
        (e) =>
          !['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'].includes(
            e.id,
          ),
      )
      .concat(vacation.events);
    dirty = true;
    render({ recalculate: true });
    vacationPreview();
    markAppliedForm('vacation-form');
    message('Férias docentes aplicadas.');
  });
};
document.addEventListener('input', (e) => {
  if (!(e.target instanceof HTMLElement)) return;
  if (appliedFormIds.has(e.target.closest('form')?.id ?? '') && e.target.id !== 'saturday-month')
    message(
      'Formulário alterado. Use Adicionar ou Aplicar para incluir o preenchimento no calendário e iniciar o salvamento automático.',
    );
});

function selectedEventModalities() {
  const selected = [
      ...document.querySelectorAll<HTMLInputElement>('input[name=event-modality]:checked'),
    ]
      .map((el) => el.value)
      .filter(isModality),
    activity = activityChecklist(state).find((r) => r.id === $('event-requirement').value);
  if (activity?.modality && (selected.length !== 1 || selected[0] !== activity.modality))
    throw Error('Selecione somente ' + modalityLabels[activity.modality] + ' para esta atividade.');
  return selected;
}

function isStageRequest() {
  return (
    stageRequirement($('event-requirement').value) ||
    (!$('event-requirement').value && isFirstStageStart($('event-name').value))
  );
}

function applyStageSuggestion() {
  identified();
  const evidence = $('event-evidence').value.trim();
  if (!evidence || !$('event-confirmed').checked)
    throw Error('Informe a fonte e confirme as datas antes de aplicar as etapas.');
  const modalities = selectedEventModalities();
  if (!modalities.length) throw Error('Selecione uma forma de oferta/nível.');
  const fresh = suggestStages(
      { ...state, modalities, offer: modalities[0] },
      allEvents(),
      $('event-start').value,
    ),
    completed = inlineHistoryIndex;
  state.events.push(
    ...fresh.stages.map((s, i): CalendarEvent => ({
      id: crypto.randomUUID(),
      name: activityChecklist(state).find((r) => r.id === s.requirementId)?.name || s.name,
      requirementId: s.requirementId,
      start: s.start,
      end: s.end,
      kind: 'note',
      category: 'limite',
      evidence,
      modalities,
      assessmentAutoStart: $('event-start').value,
      historicalSource: i === 0 ? (historicalSource ?? undefined) : undefined,
    })),
  );
  dirty = true;
  historicalSource = null;
  $('event-form').reset();
  $('historical-event-source').hidden = true;
  render({ recalculate: true });
  if (completed !== null)
    document
      .querySelector('[data-history-item="' + completed + '"]')
      ?.scrollIntoView({ block: 'nearest' });
  message(fresh.stages.length + ' etapas incluídas.');
}

function updateStageSuggestion() {
  let panel = document.getElementById('stage-suggestion');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'stage-suggestion';
    panel.className = 'notice';
    panel.setAttribute('aria-live', 'polite');
    $('event-form').append(panel);
  }
  const stageRequest = isStageRequest();
  $('event-hours').closest('label')!.hidden = stageRequest;
  if (stageRequest) $('event-hours').value = '';
  panel.hidden = !!editingEventId || !stageRequest;
  if (panel.hidden) return;
  panel.replaceChildren();
  if (
    state.events.some(
      (e) =>
        e.requirementId === $('event-requirement').value &&
        e.start === $('event-start').value &&
        e.end === $('event-end').value,
    )
  ) {
    panel.textContent = 'Etapa incluída no calendário.';
    return;
  }
  $('event-end').value = '';
  if (!$('event-start').value) {
    panel.textContent =
      'Informe o início da etapa. O sistema usará o número de etapas já cadastrado e os dias letivos até o final dos períodos para sugerir todos os intervalos.';
    return;
  }
  try {
    const modalities = selectedEventModalities();
    if (!modalities.length) throw Error('Selecione uma forma de oferta/nível.');
    const scopedState = { ...state, modalities, offer: modalities[0] };
    const number = Number(
      $('event-requirement').value.match(/^stage-([1-4])(?::[a-z]+)?$/)?.[1] || 1,
    );
    if (
      number !== 1 ||
      allEvents().some(
        (e) =>
          stageRequirement(e.requirementId) &&
          (!e.modalities?.length || e.modalities.some((m) => modalities.includes(m))),
      )
    ) {
      const stage = suggestStageEnd(scopedState, allEvents(), $('event-start').value, number);
      $('event-end').value = stage.end;
      panel.textContent =
        'Feriados, recessos e dias sem aula não entram na contagem; sábados letivos cadastrados entram. Término sugerido: ' +
        dateLabel(stage.end) +
        ' — ' +
        stage.days +
        ' dias letivos, descontando os impedimentos cadastrados. Confira e use Adicionar evento para registrar esta etapa.';
      return;
    }
    const suggestion = suggestStages(scopedState, allEvents(), $('event-start').value);
    $('event-end').value = suggestion.stages[0].end;
    panel.innerHTML =
      '<strong>Sugestão de distribuição das etapas</strong><p>O início pode ser uma data sem aula. Feriados, recessos e dias sem aula não contam; sábados letivos cadastrados contam.</p><p>Distribuição equilibrada dos dias letivos cadastrados' +
      (suggestion.byPeriod ? ', respeitando os limites de cada período' : '') +
      '. Confira as datas e a norma vigente antes de aplicar. Não representa aprovação institucional.</p><ul>' +
      suggestion.stages
        .map(
          (s) =>
            `<li>${escape(s.name)}: ${dateLabel(s.start)} a ${dateLabel(s.end)} — ${s.days} dias letivos</li>`,
        )
        .join('') +
      '</ul><p>Preencha a fonte da decisão e marque a confirmação do formulário. Este botão inclui todas as etapas para as formas de oferta/níveis selecionadas.</p><button type="button" id="apply-stage-suggestion">Aplicar todas as etapas sugeridas</button>';
    $('apply-stage-suggestion').onclick = () => act(applyStageSuggestion);
  } catch (error) {
    panel.textContent = nativeError(error).message;
  }
}

$('event-name').addEventListener('input', updateStageSuggestion);
document
  .querySelector<HTMLElement>('#event-modalities')!
  .addEventListener('change', updateStageSuggestion);
$('event-start').addEventListener('input', updateStageSuggestion);
$('event-start').addEventListener('change', updateStageSuggestion);

function renderHistorySuggestions() {
  if (!historyAnalysis || !analyzedHistory) return;
  const analysis = historyAnalysis;
  const history = analyzedHistory;
  const reopenIndex = inlineHistoryIndex;
  restoreEventForm();
  let count = 0,
    existingCount = 0;
  $('history-suggestions').innerHTML = analysis.candidates
    .map((c, i) => {
      const included = state.events.filter((event) =>
          includedHistoryCandidate([event], history.id, c, analysis.candidates),
        ),
        done = included.length > 0,
        ignored = state.ignoredHistory?.includes(history.id + ':' + historyCandidateKey(c));
      if (done) count++;
      const existing = !done && existingHistoryEvent(allEvents(), c, state);
      if (existing) existingCount++;
      if (existing && !$('show-existing-history').checked) return '';
      return `<li data-history-item="${i}" class="${done ? 'history-included' : ''}"><div><strong>${i + 1}. ${escape(c.name)}</strong><small>Página ${c.page} · texto do ano anterior: ${escape(c.excerpt)}</small>${existing ? '<span class="history-check">✓ Já cadastrado: ' + escape(existing.name) + '</span>' : done ? '<span class="history-check">✓ Revisado e incluído</span>' : ignored ? '<span class="history-check">Não será utilizado</span>' : ''}</div><div class="history-actions"><button type="button" data-history-candidate="${i}" ${done || ignored || existing ? 'disabled' : ''}>${existing ? '✓ Já cadastrado' : done ? '✓ Incluído' : 'Revisar e incluir'}</button>${!done && !existing ? `<button type="button" data-history-discard="${i}">${ignored ? 'Desfazer descarte' : 'Não utilizar este evento'}</button>` : ''}${included.map((event) => `<button type="button" data-remove-event="${escape(event.id)}" aria-label="Excluir evento incluído: ${escape(event.name)}">Excluir evento incluído${included.length > 1 ? ' — ' + escape(event.name) + ' (' + dateLabel(event.start) + ')' : ''}</button>`).join('')}</div></li>`;
    })
    .join('');
  if (reopenIndex !== null && historicalSource) {
    const candidate = analysis.candidates[reopenIndex];
    if (
      candidate &&
      !includedHistoryCandidate(state.events, history.id, candidate, analysis.candidates)
    )
      openInlineHistory(reopenIndex, false);
  }
  let progress = document.getElementById('history-progress');
  if (!progress) {
    progress = document.createElement('p');
    progress.id = 'history-progress';
    progress.setAttribute('role', 'status');
    $('history-suggestions').before(progress);
  }
  progress.textContent = `${count} itens incluídos a partir do PDF; ${existingCount} sugestões já atendidas por eventos cadastrados. Itens ambíguos aguardam revisão.`;
}

function restoreEventForm() {
  inlineActivityId = null;
  eventFormHome.after($('event-form'));
  $('event-form').classList.remove('inline-history-review');
  document.getElementById('cancel-inline-history')?.remove();
  inlineHistoryIndex = null;
}

function openInlineHistory(index: number, scroll = true) {
  const row = document.querySelector('[data-history-item="' + index + '"]');
  if (!row) return;
  restoreEventForm();
  inlineHistoryIndex = index;
  row.append($('event-form'));
  $('event-form').classList.add('inline-history-review');
  const close = document.createElement('button');
  close.id = 'cancel-inline-history';
  close.type = 'button';
  close.className = 'secondary';
  close.textContent = 'Fechar revisão';
  close.onclick = () => {
    historicalSource = null;
    $('historical-event-source').hidden = true;
    $('event-form').reset();
    restoreEventForm();
    row.scrollIntoView({ block: 'nearest' });
  };
  $('event-form').append(close);
  if (scroll) row.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('new-event').onclick = () => {
  restoreEventForm();
  historicalSource = null;
  $('event-form').reset();
  $('historical-event-source').hidden = true;
  updateStageSuggestion();
  $('event-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
  $('event-name').focus({ preventScroll: true });
};

$('show-existing-history').onchange = renderHistorySuggestions;

function periodDurationPreview() {
  $('period-end').readOnly = !!$('period-days').value;
  if (!$('period-days').value) {
    $('period-duration-status').textContent = $('period-end').value
      ? 'Término definido manualmente. Informe uma quantidade de dias para voltar ao cálculo automático.'
      : 'Informe início e quantidade para sugerir o término usando os impedimentos já registrados.';
    return;
  }
  try {
    const pending = !state.weekConfirmed;
    const checked = [...document.querySelectorAll<HTMLInputElement>('#weekdays input:checked')].map(
      (el) => Number(el.value),
    );
    const preview = pending
      ? { ...state, weekConfirmed: true, weekdays: checked.length ? checked : [1, 2, 3, 4, 5] }
      : state;
    $('period-end').value = durationEnd(
      $('period-start').value,
      $('period-days').value,
      preview,
      allEvents(),
    );
    $('period-duration-status').textContent =
      (pending
        ? 'Estimativa provisória (' +
          (checked.length ? 'dias marcados' : 'segunda a sexta') +
          '). Confirme e aplique a semana letiva no item 2 para adicionar o período. '
        : '') +
      'Término previsto: ' +
      dateLabel($('period-end').value) +
      '. Após adicionar, a meta será mantida e o término recalculado com os impedimentos.';
  } catch (e) {
    $('period-end').value = '';
    $('period-duration-status').textContent = nativeError(e).message;
  }
}

for (const id of ['period-start', 'period-days'])
  $(id).addEventListener('input', periodDurationPreview);
for (const part of ['first', 'second', 'third']) {
  const start = editorControl('vacation-' + part + '-start'),
    days = editorControl('vacation-' + part + '-days'),
    end = editorControl('vacation-' + part + '-end');
  const calculate = () => {
    if (!days.value) return;
    try {
      end.value = durationEnd(start.value, days.value);
      vacationPreview();
    } catch (e) {
      end.value = '';
      $('vacation-preview').textContent = nativeError(e).message;
    }
  };
  start.addEventListener('input', calculate);
  days.addEventListener('input', calculate);
  end.addEventListener('input', () => {
    days.value = '';
    vacationPreview();
  });
}

document.querySelector<HTMLElement>('#weekdays')!.addEventListener('change', periodDurationPreview);

function openInlineActivity(id: string) {
  const row = document.querySelector('[data-activity-row="' + id + '"]');
  if (!row) return;
  restoreEventForm();
  inlineActivityId = id;
  row.append($('event-form'));
  $('event-form').classList.add('inline-history-review');
  const close = document.createElement('button');
  close.id = 'cancel-inline-history';
  close.type = 'button';
  close.className = 'secondary';
  close.textContent = 'Fechar preenchimento';
  close.onclick = () => {
    restoreEventForm();
    $('event-form').reset();
    row.scrollIntoView({ block: 'nearest' });
  };
  $('event-form').append(close);
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setEventSubmitLabel() {
  $('event-form').querySelector<HTMLButtonElement>(
    'button:not([type]), button[type="submit"]',
  )!.textContent = editingEventId ? 'Aplicar alterações do evento' : 'Adicionar evento';
}

$('event-form').addEventListener('reset', () => {
  editingEventId = null;
  setEventSubmitLabel();
  markAppliedForm('event-form');
});

function editEvent(id: string) {
  const event = state.events.find((e) => e.id === id);
  if (!event) return;
  if (
    ['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'].includes(id)
  ) {
    $('vacation-form').scrollIntoView({ block: 'center' });
    message('Edite as férias docentes no formulário próprio e clique em Aplicar férias docentes.');
    return;
  }
  restoreEventForm();
  editingEventId = id;
  historicalSource = event.historicalSource || null;
  $('historical-event-source').hidden = true;
  for (const [field, value] of Object.entries({
    name: event.name,
    start: event.start,
    end: event.end,
    kind: event.kind,
    category: eventCategory(event),
    evidence: event.evidence,
    hours: event.hours ?? '',
    requirement: event.requirementId || '',
  }))
    editorControl('event-' + field).value = value;
  document
    .querySelectorAll<HTMLInputElement>('input[name=event-modality]')
    .forEach(
      (el) =>
        (el.checked = (
          event.modalities?.length ? event.modalities : calendarModalities(state)
        ).some((modality) => modality === el.value)),
    );
  $('event-confirmed').checked = false;
  setEventSubmitLabel();
  updateStageSuggestion();
  if (
    event.requirementId &&
    document.querySelector('[data-activity-row="' + event.requirementId + '"]')
  )
    openInlineActivity(event.requirementId);
  else $('event-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
  message(
    'Editando ' +
      event.name +
      '. Confira os dados, confirme e clique em Aplicar alterações do evento para iniciar o salvamento automático.',
  );
}

function resetPeriodForm() {
  editingPeriodId = null;
  $('period-form').reset();
  $('period-submit').textContent = 'Adicionar período';
  $('cancel-period-edit').hidden = true;
  periodDurationPreview();
  markAppliedForm('period-form');
}

function editPeriod(id: string) {
  const period = state.periods.find((p) => p.id === id);
  if (!period) return;
  editingPeriodId = id;
  for (const [key, value] of Object.entries({
    name: period.name,
    start: period.start,
    end: period.end,
    days: period.targetDays ?? '',
  }))
    editorControl('period-' + key).value = String(value);
  $('period-submit').textContent = 'Aplicar alterações do período';
  $('cancel-period-edit').hidden = false;
  periodDurationPreview();
  $('period-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
  $('period-start').focus({ preventScroll: true });
  message(
    'Edite o período e clique em Aplicar alterações do período. A meta de dias letivos continua ativa: o término do período e as etapas vinculadas serão recalculados juntos.',
  );
}

$('cancel-period-edit').onclick = resetPeriodForm;
$('period-end').addEventListener('input', periodDurationPreview);

$('event-list').addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const target = event.target;
  if (!['apply-teacher-day', 'reset-teacher-day'].includes(target.id)) return;
  act(() => {
    const date = target.id === 'reset-teacher-day' ? undefined : $('teacher-day-date').value;
    if (target.id === 'apply-teacher-day' && !date)
      throw Error('Informe a data do Dia do Professor.');
    validateTeacherDay(date, state.year);
    state.teacherDayDate = date;
    markAppliedForm('teacher-day');
    dirty = true;
    render({ recalculate: true });
    message('Data do Dia do Professor aplicada neste calendário.');
  });
});

$('second-semester-intake').addEventListener('change', (e) => {
  if (!(e.target instanceof HTMLSelectElement)) return;
  state.secondSemesterIntake = e.target.value === '' ? undefined : e.target.value === 'yes';
  dirty = true;
  render({ recalculate: true });
});
