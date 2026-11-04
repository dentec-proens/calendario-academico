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
import { calendarOffers, labelFor, scopeStatus, stageInTerm } from './offers.ts';
import { assessmentCount, stageActivity } from './activities/assessment.ts';
import { sameActivity, type ActivityRef } from './activities/activity-ref.ts';
import { assessmentCycleIssue } from './activities/assessment-intervals.ts';
import { linkIssueActions, linkIssueLabels } from './activities/links.ts';
import { noticeDestinationIssues } from './activities/validation.ts';
import { schoolDayIssue } from './activities/school-day.ts';
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

/** Where an issue is resolved; the editor turns it into a link. */
export type ContentIssueTarget =
  | { area: 'scope' | 'organization' | 'teaching-days' }
  | { area: 'activity'; activity: ActivityRef }
  | { area: 'date'; eventId: string; name: string }
  | { area: 'observance'; key: string };

/** The part of the calendar an issue belongs to, in the order the review step lists them. */
export type ContentIssueGroup = 'structure' | 'activities' | 'dates' | 'teaching-days';

/**
 * A content issue with a code that does not depend on its wording, for comparisons. `message`
 * is the full sentence kept in readiness and submissions; `title` and `detail` split it for the
 * review step, which also uses `group`, `offerId` and `target`.
 */
export interface ContentIssue {
  code: string;
  message: string;
  group: ContentIssueGroup;
  title: string;
  detail: string;
  offerId?: string;
  target?: ContentIssueTarget;
}
type IssueInfo = Omit<ContentIssue, 'code' | 'message'>;
type ContentRecord = { institutionalSnapshot: InstitutionalEventSnapshot[]; state: ActivityState };

/** Content checks only: no institutional-base or human-review issues. */
export function contentAssessment(record: ContentRecord) {
  const issues: ContentIssue[] = [],
    notes: ContentIssue[] = [];
  const issue = (code: string, message: string, info: IssueInfo) =>
    issues.push({ code, message, ...info });
  // Warnings never block; they keep the same shape so the review step lists them alike.
  const warn = (code: string, message: string, info: IssueInfo) =>
    notes.push({ code, message, ...info });
  const policy = policyFor(record.state.year);
  const offers = calendarOffers(record.state);
  if (policy.scope) {
    const included = offers.filter((offer) => !policy.excludes(offer));
    const pending = included.filter((offer) => scopeStatus(offer) !== 'covered');
    if (pending.length) {
      const scope = {
        group: 'structure',
        title: 'Norma aplicável',
        detail: policy.scope.readinessIssue,
        target: { area: 'scope' },
      } as const;
      if (new Set(included.map((offer) => scopeStatus(offer))).size === 1)
        issue('scope', policy.scope.readinessIssue, scope);
      else
        for (const offer of pending)
          issue(
            `scope:${offer.id}`,
            `${labelFor(record.state, offer.id)} — ${policy.scope.readinessIssue}`,
            { ...scope, offerId: offer.id },
          );
    }
  }
  for (const item of observanceIssues(record.institutionalSnapshot, record.state))
    issue(`observance:${item.key}:${item.message}`, item.message, {
      group: 'dates',
      title: 'Data da base institucional',
      detail: item.message,
      target: { area: 'observance', key: item.key },
    });
  const events = projectDates(record.institutionalSnapshot, record.state.events);
  if (
    offers.some(
      (offer) =>
        !offer.stages ||
        !(offer.organization === 'anual'
          ? assessmentStageCounts.includes(offer.stages.perTerm)
          : [1, 2].includes(offer.stages.perTerm)),
    )
  )
    issue('stages', 'Informe a quantidade de etapas de avaliação (2, 3 ou 4).', {
      group: 'structure',
      title: 'Etapas de avaliação',
      detail: 'Informe a quantidade de etapas de avaliação (2, 3 ou 4).',
      target: { area: 'organization' },
    });
  const diagnostics = diagnoseCalendar(record.state, events);
  const coverage = diagnostics.plan.rows;
  for (const row of coverage) {
    const prefix = `${labelFor(record.state, row.offerId)} — ${row.requirement.name}`;
    const code = `coverage:${row.offerId}:${row.requirement.id}`;
    const activity = (detail: string) =>
      ({
        group: 'activities',
        title: row.requirement.name,
        detail,
        offerId: row.offerId,
        target: { area: 'activity', activity: row.requirement.activity },
      }) as const;
    if (row.applicability === 'required' && row.coverage === 'pending')
      issue(
        `${code}:pending`,
        `${prefix}: vincule um evento com datas no roteiro de atividades.`,
        activity('Sem datas registradas.'),
      );
    if (row.applicability === 'required' || row.events.length)
      for (const item of row.issues) issue(`${code}:${item}`, `${prefix}: ${item}`, activity(item));
    for (const warning of row.warnings)
      warn(`${code}:${warning}`, `${prefix}: ${warning}`, activity(warning));
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
        offer.organization === 'semestral' && offer.stages
          ? stageInTerm(n, offer.stages.perTerm)
          : undefined;
      const stage = position
        ? `${position.number}ª etapa — ${position.term}º semestre`
        : `${n}ª etapa`;
      const stageInfo = (detail: string) =>
        ({
          group: 'structure',
          title: `Etapas de avaliação — ${stage}`,
          detail,
          offerId: offer.id,
          target: { area: 'organization' },
        }) as const;
      const stageWarning = (code: string, detail: string) =>
        warn(
          `${code}:${offer.id}:${n}`,
          `${labelFor(record.state, offer.id)} — ${stage}: ${detail}`,
          stageInfo(detail.charAt(0).toUpperCase() + detail.slice(1)),
        );
      if (start && end && start.start > end.end)
        issue(
          `stage-order:${offer.id}:${n}`,
          `${stage}: término anterior ao início.`,
          stageInfo('Término anterior ao início.'),
        );
      if (start) {
        const cycleIssue = assessmentCycleIssue(record.state, start);
        if (cycleIssue) stageWarning('stage-cycle', cycleIssue);
      }
      if (end && results && results.end < end.end)
        stageWarning(
          'stage-results',
          'o prazo de lançamento de resultados antecede o término da etapa. Confira a organização definida pelo campus.',
        );
      const councilRequired = coverage.some(
        (row) =>
          sameActivity(row.requirement.activity, link('council')) &&
          row.offerId === offer.id &&
          row.applicability === 'required',
      );
      if (councilRequired && results && council && council.start < results.end)
        stageWarning(
          'stage-council',
          'o conselho antecede o prazo de lançamento dos resultados. Confira a organização definida pelo campus.',
        );
      const meeting = eventFor('pedagogical-meeting');
      if (results && meeting && meeting.start < results.end)
        stageWarning(
          'stage-meeting',
          'a reunião pedagógica antecede o prazo de lançamento dos resultados. Confira a organização definida pelo campus.',
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
        {
          group: 'dates',
          title: `Vínculo a conferir — ${event.name} (${event.start.split('-').reverse().join('/')})`,
          detail: `${linkIssueLabels[reason]}. ${linkIssueActions[reason]}`,
          target: { area: 'date', eventId: event.id, name: event.name },
        },
      );
  }
  // Art. 5º: a saved date that adds days without being a school day is kept as it was and blocks
  // the conclusion until corrected, also under “Vínculo a conferir”, whose correction it refuses.
  for (const event of record.state.events) {
    const message = schoolDayIssue(record.state, event);
    if (message) {
      const date = event.start.split('-').reverse().join('/');
      issue(`school-day:${event.id}`, message, {
        group: 'dates',
        title: `Não constitui dia letivo — ${event.name} (${date})`,
        detail: message,
        target: { area: 'date', eventId: event.id, name: event.name },
      });
    }
  }
  // A notice destination is diagnosed per offer and never corrected automatically.
  for (const event of record.state.events)
    for (const item of noticeDestinationIssues(record.state, event))
      warn(
        `notice-destination:${event.id}:${item.offerId}`,
        `${labelFor(record.state, item.offerId)} — “${event.name}” (${event.start.split('-').reverse().join('/')}): ${item.message}. Revise o destino do edital.`,
        {
          group: 'dates',
          title: `${event.name} (${event.start.split('-').reverse().join('/')})`,
          detail: `${item.message.charAt(0).toUpperCase() + item.message.slice(1)}. Revise o destino do edital.`,
          offerId: item.offerId,
          target: { area: 'date', eventId: event.id, name: event.name },
        },
      );
  const window = policy.window(record.state);
  if (window && policy.configured)
    for (const offer of offers.filter(
      (offer) => !policy.excludes(offer) && scopeStatus(offer) !== 'own-regulation',
    )) {
      const periods = periodsForOffer(record.state, offer.id);
      const start = periods.map((p) => p.start).sort()[0],
        end = periods
          .map((p) => p.end)
          .sort()
          .at(-1);
      if (
        start &&
        end &&
        (start < window.start || start > window.latestStart || end > window.end)
      ) {
        const detail = `Datas fora da referência ${window.start} a ${window.end}, início até ${window.latestStart}. Confira a justificativa e a deliberação institucional antes de concluir a revisão.`;
        warn(`window:${offer.id}`, `${labelFor(record.state, offer.id)} — ${detail}`, {
          group: 'structure',
          title: 'Ano letivo',
          detail,
          offerId: offer.id,
          target: { area: 'organization' },
        });
      }
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
      const organization = { group: 'structure', target: { area: 'organization' } } as const;
      if (item.code === 'periods-missing')
        issue('periods-missing', 'Cadastre os períodos letivos.', {
          ...organization,
          title: 'Períodos letivos',
          detail: 'Cadastre os períodos letivos.',
        });
      else if (item.code === 'period-count') {
        const detail = `Cadastre ${item.expected === 1 ? 'o ciclo anual' : 'os dois semestres letivos'}.`;
        issue(
          `period-count:${item.offerId}`,
          `${labelFor(record.state, item.offerId)} — ${detail}`,
          {
            ...organization,
            title: 'Períodos letivos',
            detail,
            offerId: item.offerId,
          },
        );
      }
    }
    for (const check of diagnoseTeachingDays(record.state, result))
      if (check.status !== 'MET') {
        const period = record.state.periods.find((p) => p.id === check.scope);
        // A period split changes its identifier, so the code names the term instead.
        const scope =
          check.scope === 'annual' ? 'annual' : (period?.association.term ?? check.scope);
        issue(
          `teaching-days:${check.offerId}:${scope}`,
          `${labelFor(record.state, check.offerId)} — ${check.scope === 'annual' ? 'Total anual' : period?.name}: mínimo de dias não atendido ou não configurado.`,
          {
            group: 'teaching-days',
            title: check.scope === 'annual' ? 'Total anual' : (period?.name ?? 'Período'),
            detail:
              check.expected === null
                ? 'Não há mínimo de dias configurado para este escopo.'
                : `${check.observed} de ${check.expected} dias letivos mínimos.`,
            offerId: check.offerId,
            target: { area: 'teaching-days' },
          },
        );
      }
    const conflicts = [
      ...new Set(Object.values(result.byOffer).flatMap((r) => r.conflicts.map((c) => c.date))),
    ].sort();
    if (conflicts.length)
      issue('conflicts', 'Resolva os conflitos entre dias letivos e exclusões.', {
        group: 'teaching-days',
        title: 'Conflitos na contagem',
        detail: `Há inclusão e exclusão em ${conflicts.map((date) => date.split('-').reverse().join('/')).join(', ')}. Esses dias ficam fora da contagem até a resolução.`,
        target: { area: 'teaching-days' },
      });
  } catch {
    issue(
      'count-unavailable',
      'Complete e confira a semana letiva, os períodos e os dados da contagem.',
      {
        group: 'structure',
        title: 'Contagem de dias',
        // The structure issues are not reported when the count fails; the detail names them.
        detail: diagnostics.structure.length
          ? `Contagem indisponível: ${diagnostics.structure
              .map((item) =>
                item.code === 'week-unconfirmed'
                  ? 'confirme a semana letiva'
                  : item.code === 'periods-missing'
                    ? 'cadastre os períodos letivos'
                    : item.code === 'period-count'
                      ? `cadastre os períodos de ${labelFor(record.state, item.offerId)}`
                      : '',
              )
              .join('; ')}.`
          : 'Complete e confira a semana letiva, os períodos e os dados da contagem.',
        target: { area: 'organization' },
      },
    );
  }
  const warnings = notes.map((note) => note.message);
  return { issues, warnings, notes, events, baseIssueAt };
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
