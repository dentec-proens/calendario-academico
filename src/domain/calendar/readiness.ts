import { diagnoseCalendar, diagnoseTeachingDays } from './diagnostics.ts';
import { compactDate, longDate, longRange } from '../date-labels.ts';
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
import {
  isVacationActivity,
  vacationDateIssue,
  vacationOverlapIssue,
} from './activities/vacations.ts';
import { evaluateCalendar as calendarResult } from './counting/evaluation.ts';
import { periodsForOffer } from './organization/periods.ts';
import { datesBetween } from './counting/core.ts';
import { policyFor } from '../policies/registry.ts';
import { observanceIssues } from './observances.ts';
import { isInternalDate } from './internal-dates.ts';
import { blocks, findingKey, type CheckId, type FindingSubject } from './checks.ts';

const observanceChecks = {
  orphan: 'observance-orphan',
  base: 'observance-base',
  choice: 'observance-choice',
} as const satisfies Record<string, CheckId>;

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
 * A content issue: the check that found it and a key built from the check and the subject, which
 * never depends on the wording, for comparisons. `message` is the full sentence kept in readiness;
 * `title` and `detail` split it for the review step, which also uses `group`, `offerId` and
 * `target`.
 */
export interface ContentIssue {
  check: CheckId;
  key: string;
  message: string;
  group: ContentIssueGroup;
  title: string;
  detail: string;
  offerId?: string;
  target?: ContentIssueTarget;
}
type IssueInfo = Omit<ContentIssue, 'check' | 'key' | 'message'>;
type ContentRecord = { institutionalSnapshot: InstitutionalEventSnapshot[]; state: ActivityState };

/** Content checks only: no institutional-base or human-review issues. */
export function contentAssessment(record: ContentRecord) {
  const issues: ContentIssue[] = [],
    notes: ContentIssue[] = [];
  // The check decides where a finding goes: what keeps the campus from submitting is an issue; the
  // rest is a note, which keeps the same shape so the review step lists it alike.
  const report = (check: CheckId, subject: FindingSubject, message: string, info: IssueInfo) =>
    (blocks(check).submit ? issues : notes).push({
      check,
      key: findingKey(check, ...subject),
      message,
      ...info,
    });
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
        report('scope', [], policy.scope.readinessIssue, scope);
      else
        for (const offer of pending)
          report(
            'scope',
            [offer.id],
            `${labelFor(record.state, offer.id)} — ${policy.scope.readinessIssue}`,
            { ...scope, offerId: offer.id },
          );
    }
  }
  for (const item of observanceIssues(record.institutionalSnapshot, record.state))
    report(observanceChecks[item.kind], [item.key], item.message, {
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
    report('stages', [], 'Informe a quantidade de etapas de avaliação (2, 3 ou 4).', {
      group: 'structure',
      title: 'Etapas de avaliação',
      detail: 'Informe a quantidade de etapas de avaliação (2, 3 ou 4).',
      target: { area: 'organization' },
    });
  const diagnostics = diagnoseCalendar(record.state, events);
  const coverage = diagnostics.plan.rows;
  for (const row of coverage) {
    const prefix = `${labelFor(record.state, row.offerId)} — ${row.requirement.name}`;
    const activity = (detail: string) =>
      ({
        group: 'activities',
        title: row.requirement.name,
        detail,
        offerId: row.offerId,
        target: { area: 'activity', activity: row.requirement.activity },
      }) as const;
    if (row.applicability === 'required' && row.coverage === 'pending')
      report(
        'coverage-pending',
        [row.offerId, row.requirement.id],
        isVacationActivity(row.requirement.activity)
          ? `${prefix}: registre os períodos no passo Férias.`
          : `${prefix}: vincule um evento com datas no roteiro de atividades.`,
        activity('Sem datas registradas.'),
      );
    if (row.applicability === 'required' || row.events.length)
      for (const item of row.issues)
        report(
          item.check,
          [row.offerId, row.requirement.id, item.eventId],
          `${prefix}: ${item.detail}`,
          activity(item.detail),
        );
    // A date under “Vínculo a conferir” is reported once, by its own `link-review`.
    for (const item of [...row.warnings, ...row.reviewNotes])
      if (item.check !== 'link-review-row')
        report(
          item.check,
          [row.offerId, row.requirement.id, item.eventId],
          `${prefix}: ${item.detail}`,
          activity(item.detail),
        );
  }
  for (const offer of offers) {
    for (let n = 1; n <= (assessmentCount(record.state, offer.id) || 0); n++) {
      const link = (id: string) => stageActivity(record.state, id, offer.id, n);
      const eventFor = (id: string) =>
        record.state.events.find(
          (e) => e.activity && sameActivity(e.activity, link(id)) && appliesTo(e, offer),
        );
      // The stage is one date: its start and its end come from the same record.
      const stageDate = eventFor('stage'),
        results = eventFor('results');
      // Every council of the stage, also from a merged meeting, and in every offer: Art. 11, XIII,
      // places them after the partial results whether or not the stage asks for one.
      const councils = record.state.events.filter(
        (e) => e.activity && sameActivity(e.activity, link('council')) && appliesTo(e, offer),
      );
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
      const stageWarning = (check: CheckId, detail: string) =>
        report(
          check,
          [offer.id, n],
          `${labelFor(record.state, offer.id)} — ${stage}: ${detail}`,
          stageInfo(detail.charAt(0).toUpperCase() + detail.slice(1)),
        );
      if (stageDate) {
        const cycleIssue = assessmentCycleIssue(record.state, stageDate);
        if (cycleIssue) stageWarning('stage-cycle', cycleIssue);
      }
      if (stageDate && results && results.end < stageDate.end)
        stageWarning(
          'stage-results',
          'o prazo de lançamento de resultados antecede o término da etapa. Confira a organização definida pelo campus.',
        );
      if (results && councils.some((council) => council.start < results.end))
        stageWarning(
          'stage-council',
          'o conselho de classe ou a reunião pedagógica antecede o prazo de lançamento dos resultados. Confira a organização definida pelo campus.',
        );
    }
  }

  // A date under “Vínculo a conferir” blocks the conclusion until its link is corrected
  // (**Corrigir atividade vinculada**), the organization generates its activity or it is removed.
  const review = diagnostics.plan.links.issues;
  for (const event of record.state.events) {
    const reason = review.get(event.id);
    if (reason)
      report(
        'link-review',
        [event.id, reason],
        `Vínculo a conferir — “${event.name}” (${longDate(event.start)}): ${linkIssueLabels[reason]}. ${linkIssueActions[reason]}`,
        {
          group: 'dates',
          title: `Vínculo a conferir — ${event.name} (${compactDate(event.start, record.state.year)})`,
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
      report('school-day', [event.id], message, {
        group: 'dates',
        title: `Não constitui dia letivo — ${event.name} (${compactDate(event.start, record.state.year)})`,
        detail: message,
        target: { area: 'date', eventId: event.id, name: event.name },
      });
    }
  }
  // Vacations stay out of the count in every year; a saved date that breaks it, or a vacation left
  // as a date of the campus, is kept as it was and blocks the conclusion until corrected.
  for (const event of record.state.events) {
    const message =
      vacationDateIssue(record.state, event) ?? vacationOverlapIssue(record.state.events, event);
    if (message)
      report('vacation', [event.id], message, {
        group: 'dates',
        title: `Férias a corrigir — ${event.name} (${compactDate(event.start, record.state.year)})`,
        detail: message,
        target: event.activity
          ? { area: 'activity', activity: event.activity }
          : { area: 'date', eventId: event.id, name: event.name },
      });
  }
  // A notice destination is diagnosed per offer and never corrected automatically.
  for (const event of record.state.events)
    for (const item of noticeDestinationIssues(record.state, event))
      report(
        'notice-destination',
        [event.id, item.offerId],
        `${labelFor(record.state, item.offerId)} — “${event.name}” (${longDate(event.start)}): ${item.message}. Revise o destino do edital.`,
        {
          group: 'dates',
          title: `${event.name} (${compactDate(event.start, record.state.year)})`,
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
        const detail = `Datas fora da referência: ${longRange(window)}, início até ${longDate(window.latestStart)}. Confira a justificativa e a deliberação institucional antes de concluir a revisão.`;
        report('window', [offer.id], `${labelFor(record.state, offer.id)} — ${detail}`, {
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
  // The structure is reported on its own, and the count runs only on a complete structure: what
  // the campus has still to fill is never mistaken for a failure of the count.
  const organization = { group: 'structure', target: { area: 'organization' } } as const;
  for (const item of diagnostics.structure)
    if (item.code === 'week-unconfirmed')
      report('week-unconfirmed', [], 'Confirme a semana letiva.', {
        ...organization,
        title: 'Semana letiva',
        detail: 'Confirme a semana letiva.',
      });
    else if (item.code === 'periods-missing')
      report('periods-missing', [], 'Cadastre os períodos letivos.', {
        ...organization,
        title: 'Períodos letivos',
        detail: 'Cadastre os períodos letivos.',
      });
    // Without any period, “Cadastre os períodos letivos” already says it for every offer.
    else if (item.code === 'period-count' && record.state.periods.length) {
      const detail = `Cadastre ${item.expected === 1 ? 'o ciclo anual' : 'os dois semestres letivos'}.`;
      report(
        'period-count',
        [item.offerId],
        `${labelFor(record.state, item.offerId)} — ${detail}`,
        {
          ...organization,
          title: 'Períodos letivos',
          detail,
          offerId: item.offerId,
        },
      );
    }
  // A date that adds teaching days outside every period of an offer is the campus's to correct;
  // the count refuses it, so it is found here, before the count runs.
  const outside = diagnostics.structure.length
    ? []
    : record.state.events.filter(
        (event) =>
          event.effect === 'include' &&
          // An inverted date is reported as an invalid record; the count never reaches it.
          event.start <= event.end &&
          offers.some((offer) => {
            if (!appliesTo(event, offer)) return false;
            const periods = periodsForOffer(record.state, offer.id);
            return datesBetween(event.start, event.end).some(
              (date) => !periods.some((p) => p.start <= date && date <= p.end),
            );
          }),
      );
  for (const event of outside) {
    const detail =
      'Acrescenta dias letivos fora dos períodos letivos das ofertas. Ajuste a data ou o efeito na contagem.';
    report(
      'inclusion-outside-periods',
      [event.id],
      `“${event.name}” (${longDate(event.start)}): ${detail}`,
      {
        group: 'dates',
        title: `Fora dos períodos — ${event.name} (${compactDate(event.start, record.state.year)})`,
        detail,
        target: { area: 'date', eventId: event.id, name: event.name },
      },
    );
  }
  if (diagnostics.structure.length === 0 && outside.length === 0) {
    let result: ReturnType<typeof calendarResult> | undefined;
    try {
      result = calendarResult(
        record.state,
        projectDates(record.institutionalSnapshot, record.state.events),
      );
    } catch (error) {
      // A complete structure that still cannot be counted is a fault the campus cannot fix.
      const detail = `Erro do sistema na contagem de dias (${error instanceof Error ? error.message : String(error)}). Avise a administração.`;
      report('system-error', ['count'], detail, {
        group: 'teaching-days',
        title: 'Contagem de dias',
        detail,
        target: { area: 'teaching-days' },
      });
    }
    if (result) {
      for (const check of diagnoseTeachingDays(record.state, result))
        if (check.status !== 'MET') {
          const period = record.state.periods.find((p) => p.id === check.scope);
          // A period split changes its identifier, so the key names the term instead.
          const scope =
            check.scope === 'annual' ? 'annual' : (period?.association.term ?? check.scope);
          const unverifiable = check.expected === null;
          report(
            unverifiable ? 'teaching-days-unverifiable' : 'teaching-days',
            [check.offerId, scope],
            `${labelFor(record.state, check.offerId)} — ${check.scope === 'annual' ? 'Total anual' : period?.name}: ${unverifiable ? 'sem mínimo de dias configurado.' : 'mínimo de dias não atendido.'}`,
            {
              group: 'teaching-days',
              title: check.scope === 'annual' ? 'Total anual' : (period?.name ?? 'Período'),
              detail: unverifiable
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
        report('conflicts', [], 'Resolva os conflitos entre dias letivos e exclusões.', {
          group: 'teaching-days',
          title: 'Conflitos na contagem',
          detail: `Há inclusão e exclusão em ${conflicts.map((date) => compactDate(date, record.state.year)).join(', ')}. Esses dias ficam fora da contagem até a resolução.`,
          target: { area: 'teaching-days' },
        });
    }
  }
  const warnings = notes.map((note) => note.message);
  return { issues, warnings, notes, events, baseIssueAt };
}

/** What keeps the campus from submitting: every finding the campus or the base must correct. */
export function contentIssues(
  state: ActivityState,
  institutionalSnapshot: InstitutionalEventSnapshot[],
): ContentIssue[] {
  return contentAssessment({ state, institutionalSnapshot }).issues;
}

/** Why the campus cannot submit yet, or nothing: every content issue must be corrected first. */
export function submitRefusal(issues: readonly ContentIssue[]): string | undefined {
  if (issues.length === 0) return undefined;
  if (issues.length === 1) return issues[0].message;
  // The editor counts grouped pendencies; the message names the first instead of a second count.
  return `Há pendências de conteúdo a corrigir antes do envio, listadas no passo Conferir e enviar. A primeira: ${issues[0].message}`;
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
        `${c.item}: ${c.title} — atendimento ou não aplicabilidade aguardando avaliação.`,
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
