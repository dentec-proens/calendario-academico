import { diagnoseCalendar, diagnoseTeachingDays } from './diagnostics.ts';
import { assessmentStageCounts } from './config.ts';
import { referenceIsCurrent, reviewIsCurrent } from './base.ts';
import {
  projectDates,
  type InstitutionalEventSnapshot,
  type ActivityState,
  type CalendarReview,
} from './model.ts';
import { appliesTo } from './modalities.ts';
import { calendarOffers, labelFor, stageInTerm } from './offers.ts';
import { assessmentCount, stageActivity } from './activities/assessment.ts';
import { sameActivity } from './activities/activity-ref.ts';
import { assessmentCycleIssue } from './activities/assessment-intervals.ts';
import { linkIssueActions, linkIssueLabels } from './activities/links.ts';
import { noticeDestinationIssues } from './activities/validation.ts';
import { evaluateCalendar as calendarResult } from './counting/evaluation.ts';
import { periodsForOffer } from './organization/periods.ts';
import { policyFor } from '../policies/registry.ts';
import { observanceIssues } from './observances.ts';
import { isInternalDate } from './internal-dates.ts';

const plain = (value: string) =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** A content issue with a code that does not depend on its wording, for comparisons. */
export interface ContentIssue {
  code: string;
  message: string;
}
type ContentRecord = { institutionalSnapshot: InstitutionalEventSnapshot[]; state: ActivityState };

/** Content checks only: no institutional-base or human-review issues. */
export function contentAssessment(record: ContentRecord) {
  const issues: ContentIssue[] = [],
    warnings: string[] = [];
  const issue = (code: string, message: string) => issues.push({ code, message });
  const policy = policyFor(record.state.year);
  const offers = calendarOffers(record.state);
  if (policy.scope) {
    const included = offers.filter((offer) => !policy.excludes(offer));
    const pending = included.filter((offer) => offer.scope?.status !== 'covered');
    if (pending.length) {
      if (new Set(included.map((offer) => offer.scope?.status)).size === 1)
        issue('scope', policy.scope.readinessIssue);
      else
        for (const offer of pending)
          issue(
            `scope:${offer.id}`,
            `${labelFor(record.state, offer.id)} — ${policy.scope.readinessIssue}`,
          );
    }
  }
  for (const item of observanceIssues(record.institutionalSnapshot, record.state))
    issue(`observance:${item.key}:${item.message}`, item.message);
  const events = projectDates(record.institutionalSnapshot, record.state.events);
  if (
    offers.some(
      (offer) =>
        offer.stages?.status !== 'reported' &&
        (offer.stages?.status !== 'defined' ||
          !(offer.organization === 'anual'
            ? assessmentStageCounts.includes(offer.stages.perTerm)
            : offer.organization === 'semestral' && [1, 2].includes(offer.stages.perTerm))),
    )
  )
    issue('stages', 'Informe a quantidade de etapas de avaliação (2, 3 ou 4).');
  const diagnostics = diagnoseCalendar(record.state, events);
  const coverage = diagnostics.plan.rows;
  for (const row of coverage) {
    const prefix = `${labelFor(record.state, row.offerId)} — ${row.requirement.name}`;
    const code = `coverage:${row.offerId}:${row.requirement.id}`;
    if (row.applicability === 'required' && row.coverage === 'pending')
      issue(`${code}:pending`, `${prefix}: vincule um evento com datas no roteiro de atividades.`);
    if (row.applicability === 'required' || row.events.length)
      for (const item of row.issues) issue(`${code}:${item}`, `${prefix}: ${item}`);
    for (const warning of row.warnings) warnings.push(`${prefix}: ${warning}`);
  }
  for (const offer of offers) {
    for (let n = 1; n <= (assessmentCount(record.state, offer.id) || 0); n++) {
      const link = (id: string) => stageActivity(record.state, id, offer.id, n);
      const eventFor = (id: string) =>
        record.state.events.find(
          (e) => e.activity && sameActivity(e.activity, link(id)) && appliesTo(e, offer),
        );
      const start = eventFor('stage'),
        end = eventFor('stage'),
        results = eventFor('results'),
        council = eventFor('council');
      const position =
        offer.organization === 'semestral' && offer.stages?.status === 'defined'
          ? stageInTerm(n, offer.stages.perTerm)
          : undefined;
      const stage = position
        ? `${position.number}ª etapa — ${position.term}º semestre`
        : `${n}ª etapa`;
      if (start && end && start.start > end.end)
        issue(`stage-order:${offer.id}:${n}`, `${stage}: término anterior ao início.`);
      if (start && offer.stages?.status !== 'reported') {
        const cycleIssue = assessmentCycleIssue(record.state, start);
        if (cycleIssue)
          warnings.push(`${labelFor(record.state, offer.id)} — ${stage}: ${cycleIssue}`);
      }
      if (end && results && results.end < end.end)
        warnings.push(
          `${labelFor(record.state, offer.id)} — ${stage}: o prazo de lançamento de resultados antecede o término da etapa. Confira a organização definida pelo campus.`,
        );
      const councilRequired = coverage.some(
        (row) =>
          sameActivity(row.requirement.activity, link('council')) &&
          row.offerId === offer.id &&
          row.applicability === 'required',
      );
      if (councilRequired && results && council && council.start < results.end)
        warnings.push(
          `${labelFor(record.state, offer.id)} — ${stage}: o conselho antecede o prazo de lançamento dos resultados. Confira a organização definida pelo campus.`,
        );
      const meeting = eventFor('pedagogical-meeting');
      if (results && meeting && meeting.start < results.end)
        warnings.push(
          `${labelFor(record.state, offer.id)} — ${stage}: a reunião pedagógica antecede o prazo de lançamento dos resultados. Confira a organização definida pelo campus.`,
        );
    }
  }

  // A date under “Vínculo a conferir” blocks the conclusion until its link is corrected
  // (**Corrigir atividade vinculada**), the organization generates its activity or it is removed.
  const review = diagnostics.plan.links.issues;
  for (const event of record.state.events) {
    const reason = review.get(event.id);
    if (reason)
      issue(
        `link-review:${event.id}:${reason}`,
        `Vínculo a conferir — “${event.name}” (${event.start.split('-').reverse().join('/')}): ${linkIssueLabels[reason]}. ${linkIssueActions[reason]}`,
      );
  }
  // A notice destination is diagnosed per offer and never corrected automatically.
  for (const event of record.state.events)
    for (const item of noticeDestinationIssues(record.state, event))
      warnings.push(
        `${labelFor(record.state, item.offerId)} — “${event.name}” (${event.start.split('-').reverse().join('/')}): ${item.message}. Revise o destino do edital.`,
      );
  const window = policy.window(record.state);
  if (window && policy.windowInReadiness)
    for (const offer of offers.filter(
      (offer) => !policy.excludes(offer) && offer.scope?.status !== 'own-regulation',
    )) {
      const periods = periodsForOffer(record.state, offer.id);
      const start = periods.map((p) => p.start).sort()[0],
        end = periods
          .map((p) => p.end)
          .sort()
          .at(-1);
      if (start && end && (start < window.start || start > window.latestStart || end > window.end))
        warnings.push(
          `${labelFor(record.state, offer.id)} — Datas fora da referência ${window.start} a ${window.end}, início até ${window.latestStart}. Confira a justificativa e a deliberação institucional antes de concluir a revisão.`,
        );
    }
  // Campus event requirements come from the same checklist displayed in the editor.
  // Do not add hidden, duplicate keyword requirements when generating the calendar.
  // The release check places the base issue here, before the counting issues.
  const baseIssueAt = issues.length;
  try {
    const result = calendarResult(
      record.state,
      projectDates(record.institutionalSnapshot, record.state.events),
    );
    for (const item of diagnostics.structure) {
      if (item.code === 'periods-missing')
        issue('periods-missing', 'Cadastre os períodos letivos.');
      else if (item.code === 'organization-unclassified')
        issue(
          `organization-unclassified:${item.offerId}`,
          `${labelFor(record.state, item.offerId)} — Organização a conferir antes de confirmar contagem e conclusão.`,
        );
      else if (item.code === 'period-count')
        issue(
          `period-count:${item.offerId}`,
          `${labelFor(record.state, item.offerId)} — Cadastre ${item.expected === 1 ? 'o ciclo anual' : 'os dois semestres letivos'}.`,
        );
    }
    for (const check of diagnoseTeachingDays(record.state, result))
      if (check.status !== 'MET') {
        const period = record.state.periods.find((p) => p.id === check.scope);
        // A period split changes its identifier, so the code names the term instead.
        const scope =
          check.scope === 'annual'
            ? 'annual'
            : period?.association.status === 'defined'
              ? period.association.term
              : check.scope;
        issue(
          `teaching-days:${check.offerId}:${scope}`,
          `${labelFor(record.state, check.offerId)} — ${check.scope === 'annual' ? 'Total anual' : period?.name}: mínimo de dias não atendido ou não configurado.`,
        );
      }
    if (Object.values(result.byOffer).some((r) => r.conflicts.length))
      issue('conflicts', 'Resolva os conflitos entre dias letivos e exclusões.');
  } catch {
    issue(
      'count-unavailable',
      'Complete e confira a semana letiva, os períodos e os dados da contagem.',
    );
  }
  return { issues, warnings, events, baseIssueAt };
}

export function contentIssues(
  state: ActivityState,
  institutionalSnapshot: InstitutionalEventSnapshot[],
): ContentIssue[] {
  return contentAssessment({ state, institutionalSnapshot }).issues;
}

export const baseOutdatedIssue = 'Salve o calendário com a base institucional atualizada.';
export const lockedBaseIssue =
  'A base institucional mudou depois do envio. Devolva o calendário para o campus reconciliar e reenviar.';

// Fail closed: machine checks never replace a current, evidenced human review.
export function releaseReadiness(
  record: ContentRecord & {
    id: string;
    version?: number;
    catalogueRevision: number;
  },
  db: {
    catalogue: { revision: number };
    reviews?: CalendarReview[];
    base?: { compatible: boolean; identity: string };
    /** When given, a review counts only for this submission (`null`: no open submission). */
    submissionId?: string | null;
    /** The calendar is locked: the campus cannot reconcile a changed base before a return. */
    locked?: boolean;
  },
) {
  const assessment = contentAssessment(record);
  const issues = assessment.issues.map((item) => item.message),
    warnings = assessment.warnings;
  const events = assessment.events;
  const policy = policyFor(record.state.year);
  if (!referenceIsCurrent(record.catalogueRevision, db.catalogue.revision, db.base)) {
    issues.splice(assessment.baseIssueAt, 0, db.locked ? lockedBaseIssue : baseOutdatedIssue);
    if (db.locked) warnings.push(lockedBaseIssue);
  }
  const review = (db.reviews || []).find((r) => r.calendarId === record.id);
  const current =
    reviewIsCurrent(review, record.version, {
      revision: db.catalogue.revision,
      identity: db.base?.identity,
      rulesetVersion: policy.rulesetPrefix ? policy.rulesetVersion(record.state) : undefined,
    }) &&
    (db.submissionId === undefined ||
      (db.submissionId !== null && review?.submissionId === db.submissionId));
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
      // An internal date (art. 18) never evidences a criterion.
      !events.some(
        (e) =>
          !isInternalDate(e) &&
          new RegExp(c.pattern!).test(plain(e.name + ' ' + (e.category || ''))),
      )
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
