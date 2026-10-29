import { diagnoseCalendar, diagnoseTeachingDays } from './diagnostics.ts';
import { assessmentStageCounts } from './config.ts';
import { referenceIsCurrent, reviewIsCurrent } from './base.ts';
import type { CalendarActivity, ActivityState, CalendarReview } from './model.ts';
import { calendarModalities, modalityLabels, appliesTo } from './modalities.ts';
import { assessmentCount, scopedRequirement } from './activities/assessment.ts';
import { evaluateCalendar as calendarResult } from './counting/evaluation.ts';
import { periodsForModality } from './organization/periods.ts';
import { policyFor } from '../policies/registry.ts';

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
  db: {
    catalogue: { revision: number };
    reviews?: CalendarReview[];
    base?: { compatible: boolean; identity: string };
  },
) {
  const issues = [],
    warnings = [];
  const policy = policyFor(record.state.year);
  if (policy.scope && record.state.scopeConfirmation?.status !== 'covered')
    issues.push(policy.scope.readinessIssue);
  const events = [...record.institutionalSnapshot, ...record.state.events];
  if (
    calendarModalities(record.state).some(
      (m) => !assessmentStageCounts.includes(assessmentCount(record.state, m)),
    )
  )
    issues.push('Informe a quantidade de etapas de avaliação (2, 3 ou 4).');
  const diagnostics = diagnoseCalendar(record.state, events);
  const coverage = diagnostics.coverage;
  for (const row of coverage) {
    const prefix = `${modalityLabels[row.modality]} — ${row.requirement.name}`;
    if (row.applicability === 'required' && row.coverage === 'pending')
      issues.push(`${prefix}: vincule um evento com datas no roteiro de atividades.`);
    if (row.applicability === 'required' || row.events.length)
      for (const issue of row.issues) issues.push(`${prefix}: ${issue}`);
    for (const warning of row.warnings) warnings.push(`${prefix}: ${warning}`);
  }
  for (const modality of calendarModalities(record.state)) {
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
      const councilRequired = coverage.some(
        (row) =>
          row.requirement.id === scopedRequirement(record.state, 'council-' + n, modality) &&
          row.modality === modality &&
          row.applicability === 'required',
      );
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

  const window = policy.window(record.state);
  if (window && policy.windowInReadiness)
    for (const modality of calendarModalities(record.state).filter(
      (m) => !policy.excludedModalities.includes(m),
    )) {
      const periods = periodsForModality(record.state, modality);
      const start = periods.map((p) => p.start).sort()[0],
        end = periods
          .map((p) => p.end)
          .sort()
          .at(-1);
      if (start && end && (start < window.start || start > window.latestStart || end > window.end))
        warnings.push(
          `${modalityLabels[modality]} — Datas fora da referência ${window.start} a ${window.end}, início até ${window.latestStart}. Confira a justificativa e a deliberação institucional antes de concluir a revisão.`,
        );
    }
  // Campus event requirements come from the same checklist displayed in the editor.
  // Do not add hidden, duplicate keyword requirements when generating the calendar.
  if (!referenceIsCurrent(record.catalogueRevision, db.catalogue.revision, db.base))
    issues.push('Salve o calendário com a base institucional atualizada.');
  try {
    const result = calendarResult(record.state, [
      ...record.institutionalSnapshot,
      ...record.state.events,
    ]);
    for (const issue of diagnostics.structure) {
      if (issue.code === 'periods-missing') issues.push('Cadastre os períodos letivos.');
      else if (issue.code === 'organization-unclassified')
        issues.push(
          `${modalityLabels[issue.modality]} — Organização a conferir antes de confirmar contagem e conclusão.`,
        );
      else if (issue.code === 'period-count')
        issues.push(
          `${modalityLabels[issue.modality]} — Cadastre ${issue.expected === 1 ? 'o ciclo anual' : 'os dois semestres letivos'}.`,
        );
    }
    for (const check of diagnoseTeachingDays(record.state, result))
      if (check.status !== 'MET')
        issues.push(
          `${modalityLabels[check.modality]} — ${check.scope === 'annual' ? 'Total anual' : record.state.periods.find((p) => p.id === check.scope)?.name}: mínimo de dias não atendido ou não configurado.`,
        );
    if (Object.values(result.byModality).some((r) => r.conflicts.length))
      issues.push('Resolva os conflitos entre dias letivos e exclusões.');
  } catch {
    issues.push('Complete e confira a semana letiva, os períodos e os dados da contagem.');
  }
  const review = (db.reviews || []).find((r) => r.calendarId === record.id);
  const current = reviewIsCurrent(review, record.version, {
    revision: db.catalogue.revision,
    identity: db.base?.identity,
    rulesetVersion: policy.rulesetPrefix ? policy.rulesetVersion(record.state) : undefined,
  });
  if (!current)
    issues.push('A DENTEC/PROENS precisa salvar a revisão desta versão do calendário e da base.');
  if (!review?.applicableNorm?.trim())
    issues.push('Identifique a norma vigente aplicável na revisão.');
  for (const c of policy.review.criteria) {
    const entry = current ? review?.entries.find((e) => e.id === c.id) : undefined;
    if (!entry?.reviewed || !['ATENDIDO', 'NAO_APLICAVEL'].includes(entry.status))
      issues.push(
        `${c.item}: ${c.title} — atendimento ou não aplicabilidade aguardando confirmação.`,
      );
    if (
      policy.review.evidence === 'pattern' &&
      c.pattern &&
      entry?.status === 'ATENDIDO' &&
      !events.some((e) => new RegExp(c.pattern!).test(plain(e.name + ' ' + (e.category || ''))))
    )
      issues.push(
        `${c.item}: ${c.title} — nenhum evento com data localizado no calendário; confira o cadastro.`,
      );
  }
  return {
    ready: issues.length === 0,
    issues,
    warnings,
    officialApproval: false,
    humanReview: {
      current,
      reviewedCriterionIds: current
        ? (review?.entries
            .filter((entry) => entry.reviewed && entry.status !== 'PENDENTE')
            .map((entry) => entry.id) ?? [])
        : [],
    },
  };
}
