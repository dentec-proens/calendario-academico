import { referenceIsCurrent, reviewIsCurrent } from './calendar-base/index.ts';
import type { CalendarActivity, ActivityState, CalendarReview } from './domain-types.ts';
import { calendarModalities, modalityLabels, appliesTo } from './modalities.ts';
import { assessmentCount, scopedRequirement } from './obligations.ts';
import { evaluateCalendar as calendarResult } from './evaluation.ts';
import { reviewCriteriaFor } from './review.ts';
import {
  activityCoverage,
  organizationForModality,
  periodsForModality,
  rulesetVersion,
  calendarWindow,
} from './calendar-rules/index.ts';

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
  if (
    record.state.year === 2027 &&
    (!record.state.scopeConfirmation ||
      record.state.scopeConfirmation.status !== 'covered' ||
      !record.state.scopeConfirmation.source.trim())
  )
    issues.push(
      'Confirme o escopo da Resolução 292: EaD, qualificação e pós-graduação exigem calendário e norma próprios; a oferta não identifica sozinha essa aplicabilidade.',
    );
  const events = [...record.institutionalSnapshot, ...record.state.events];
  if (
    calendarModalities(record.state).some(
      (m) => ![2, 3, 4].includes(assessmentCount(record.state, m)),
    )
  )
    issues.push('Informe a quantidade de etapas de avaliação (2, 3 ou 4).');
  const coverage = activityCoverage(record.state, events);
  for (const row of coverage) {
    const prefix = `${modalityLabels[row.modality]} — ${row.requirement.name}`;
    if (row.applicability === 'required' && row.coverage === 'pending')
      issues.push(`${prefix}: vincule um evento com datas e fonte no roteiro de atividades.`);
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

  const window = calendarWindow(record.state);
  if (window && record.state.year === 2027)
    for (const modality of calendarModalities(record.state).filter((m) => m !== 'posgraduacao')) {
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
    if (!record.state.periods.length) issues.push('Cadastre os períodos letivos.');
    for (const modality of calendarModalities(record.state)) {
      const organization = organizationForModality(record.state, modality),
        periods = periodsForModality(record.state, modality);
      if (organization === 'a-classificar')
        issues.push(
          `${modalityLabels[modality]} — Organização a conferir antes de confirmar contagem e conclusão.`,
        );
      else if (periods.length !== (organization === 'anual' ? 1 : 2))
        issues.push(
          `${modalityLabels[modality]} — Cadastre ${organization === 'anual' ? 'o ciclo anual' : 'os dois semestres letivos'}.`,
        );
    }
    for (const [modality, detail] of Object.entries(result.byModality))
      for (const check of detail.checks) {
        if (check.scope !== 'annual' && organizationForModality(record.state, modality) === 'anual')
          continue;
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
  const current = reviewIsCurrent(review, record.version, {
    revision: db.catalogue.revision,
    identity: db.base?.identity,
    rulesetVersion: record.state.year === 2027 ? rulesetVersion(record.state) : undefined,
  });
  if (!current)
    issues.push('A DENTEC/PROENS precisa salvar a revisão desta versão do calendário e da base.');
  if (!review?.applicableNorm?.trim())
    issues.push('Identifique a norma vigente aplicável na revisão.');
  for (const c of reviewCriteriaFor(record.state.year)) {
    const entry = current ? review?.entries.find((e) => e.id === c.id) : undefined;
    if (!entry?.reviewed || !['ATENDIDO', 'NAO_APLICAVEL'].includes(entry.status))
      issues.push(
        `${c.item}: ${c.title} — atendimento ou não aplicabilidade aguardando confirmação.`,
      );
    if (
      record.state.year !== 2027 &&
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
