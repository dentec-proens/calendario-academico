import type { CalendarActivity, ActivityState, CalendarReview } from './domain-types.ts';
import { calendarModalities, modalityLabels, appliesTo } from './modalities.ts';
import { activityChecklist, assessmentCount, scopedRequirement } from './obligations.ts';
import { evaluateCalendar as calendarResult } from './evaluation.ts';
import { reviewCriteria } from './review.ts';

const plain = (value: string) =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// Fail closed: machine checks never replace a current, evidenced human review.
export function releaseReadiness(
  record: {
    id: string;
    version?: number;
    catalogueRevision: number;
    institutionalSnapshot: CalendarActivity[];
    state: ActivityState;
  },
  db: { catalogue: { revision: number }; reviews?: CalendarReview[] },
) {
  const issues = [],
    warnings = [];
  const events = [...record.institutionalSnapshot, ...record.state.events];
  if (
    calendarModalities(record.state).some(
      (m) => ![2, 3, 4].includes(assessmentCount(record.state, m)),
    )
  )
    issues.push('Informe a quantidade de etapas de avaliação (2, 3 ou 4).');
  for (const modality of calendarModalities(record.state))
    for (const activity of activityChecklist(record.state).filter(
      (a) => a.required !== false && (!a.modality || a.modality === modality),
    ))
      if (
        !events.some(
          (e) => appliesTo(e, modality) && e.requirementId === activity.id && e.evidence?.trim(),
        )
      )
        issues.push(
          `${modalityLabels[modality]} — ${activity.name}: vincule um evento com datas e fonte no roteiro de atividades.`,
        );
  for (const modality of calendarModalities(record.state)) {
    for (const activity of activityChecklist(record.state).filter(
      (a) => !a.modality || a.modality === modality,
    )) {
      const linked = events.filter(
        (e) => e.requirementId === activity.id && appliesTo(e, modality),
      );
      const prefix = `${modalityLabels[modality]} — ${activity.name}`;
      if (
        activity.minHours &&
        linked.reduce(
          (sum, e) =>
            sum + (Number.isFinite(e.hours) && e.hours !== undefined && e.hours > 0 ? e.hours : 0),
          0,
        ) < activity.minHours
      )
        issues.push(`${prefix}: registre pelo menos ${activity.minHours} horas.`);
      if (activity.deadline && linked.some((e) => e.end > activity.deadline!))
        issues.push(`${prefix}: data posterior ao prazo de ${activity.deadline}.`);
      if (
        activity.month &&
        linked.some(
          (e) =>
            Number(e.start.slice(5, 7)) !== activity.month ||
            Number(e.end.slice(5, 7)) !== activity.month,
        )
      )
        issues.push(`${prefix}: confira o mês exigido.`);
      if (activity.id.startsWith('admission-notice-')) {
        const term = Number(activity.id.split('-').at(-1));
        const periods = [...record.state.periods].sort((a, b) => a.start.localeCompare(b.start));
        const start = periods[term === 0 ? 0 : term - 1]?.start;
        if (linked.length && (!start || linked.some((e) => e.end >= start)))
          issues.push(`${prefix}: publique antes do início do período letivo.`);
      }
    }
    const eventFor = (id: string) =>
      events.find(
        (e) =>
          e.requirementId === scopedRequirement(record.state, id, modality) &&
          appliesTo(e, modality),
      );
    for (let n = 1; n <= (assessmentCount(record.state, modality) || 0); n++) {
      const start = eventFor('stage-' + n),
        end = eventFor('stage-' + n),
        results = eventFor('results-' + n),
        council = eventFor('council-' + n);
      if (start && end && start.start > end.end)
        issues.push(`${n}ª etapa: término anterior ao início.`);
      if (end && results && results.end < end.end)
        warnings.push(
          `${modalityLabels[modality]} — ${n}ª etapa: o prazo de lançamento de resultados antecede o término da etapa. Confira a organização definida pelo campus.`,
        );
      const councilRequired =
        activityChecklist(record.state).find(
          (a) => a.id === scopedRequirement(record.state, 'council-' + n, modality),
        )?.required !== false;
      if (councilRequired && results && council && council.start < results.end)
        warnings.push(
          `${modalityLabels[modality]} — ${n}ª etapa: o conselho antecede o prazo de lançamento dos resultados. Confira a organização definida pelo campus.`,
        );
      const meeting = eventFor('pedagogical-meeting-' + n);
      if (results && meeting && meeting.start < results.end)
        warnings.push(
          `${modalityLabels[modality]} — ${n}ª etapa: a reunião pedagógica antecede o prazo de lançamento dos resultados. Confira a organização definida pelo campus.`,
        );
    }
  }

  // Campus event requirements come from the same checklist displayed in the editor.
  // Do not add hidden, duplicate keyword requirements when generating the calendar.
  if (record.catalogueRevision !== db.catalogue.revision)
    issues.push('Salve o calendário com a base institucional atualizada.');
  try {
    const result = calendarResult(record.state, [
      ...record.institutionalSnapshot,
      ...record.state.events,
    ]);
    if (!record.state.periods.length) issues.push('Cadastre os períodos letivos.');
    if (record.state.regime !== 'anual' && record.state.periods.length !== 2)
      issues.push('Cadastre os dois semestres letivos.');
    for (const [modality, detail] of Object.entries(result.byModality))
      for (const check of detail.checks) {
        if (check.scope !== 'annual' && record.state.regime === 'anual') continue;
        if (check.status !== 'MET')
          issues.push(
            `${modalityLabels[modality]} — ${check.scope === 'annual' ? 'Total anual' : record.state.periods.find((p) => p.id === check.scope)?.name}: mínimo de dias não atendido ou não configurado.`,
          );
      }
    if (Object.values(result.byModality).some((r) => r.conflicts.length))
      issues.push('Resolva os conflitos entre dias letivos e exclusões.');
  } catch {
    issues.push('Complete e confira a semana letiva, os períodos e as evidências da contagem.');
  }
  const review = (db.reviews || []).find((r) => r.calendarId === record.id);
  const current =
    review &&
    review.calendarVersion === record.version &&
    review.catalogueRevision === db.catalogue.revision;
  if (!current)
    issues.push('A DENTEC/PROENS precisa salvar a revisão desta versão do calendário e da base.');
  if (!review?.applicableNorm?.trim())
    issues.push('Identifique a norma vigente aplicável na revisão.');
  for (const c of reviewCriteria) {
    const entry = current ? review.entries.find((e) => e.id === c.id) : undefined;
    if (!entry?.reviewed || !['ATENDIDO', 'NAO_APLICAVEL'].includes(entry.status))
      issues.push(
        `${c.item}: ${c.title} — atendimento ou não aplicabilidade aguardando confirmação.`,
      );
    if (
      c.pattern &&
      entry?.status === 'ATENDIDO' &&
      !events.some(
        (e) =>
          e.evidence?.trim() &&
          new RegExp(c.pattern!).test(plain(e.name + ' ' + (e.category || ''))),
      )
    )
      issues.push(
        `${c.item}: ${c.title} — nenhum evento com data e fonte localizado no calendário; confira o cadastro.`,
      );
  }
  return { ready: issues.length === 0, issues, warnings, officialApproval: false };
}
