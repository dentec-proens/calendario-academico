import type { CalendarActivity, TeachingState } from '../calendar/model.ts';
import {
  calendarOffers,
  labelFor,
  organizationSummary,
  kinds,
  offerFor,
  associationOffers,
} from '../calendar/offers.ts';
import { automaticEventSource } from '../calendar/counting/core.ts';
import { evaluateCalendar as calendarResult } from '../calendar/counting/evaluation.ts';
import { activityCoverage } from '../calendar/activities/coverage.ts';
import { organizationForOffer, periodsForOffer } from '../calendar/organization/periods.ts';
import { policyFor } from '../policies/registry.ts';

const normalize = (s: string) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
// Candidates cross the review contract, so they carry only what the reviewer sees, never the
// whole event (offers, requirement links and assessment anchors stay in the calendar).
const reviewCandidate = (
  e: Pick<CalendarActivity, 'id' | 'name' | 'start' | 'end'> &
    Parameters<typeof automaticEventSource>[0],
) => ({
  id: e.id,
  name: e.name,
  start: e.start,
  end: e.end,
  evidence: automaticEventSource(e) ?? '',
});
export function reviewSupport<
  T extends {
    id: string;
    name: string;
    version: number;
    state: TeachingState & { campus?: string };
  },
>(
  record: T,
  events: (Pick<CalendarActivity, 'id' | 'name' | 'start' | 'end' | 'category' | 'offers'> &
    Partial<
      Pick<
        CalendarActivity,
        | 'kind'
        | 'requirementId'
        | 'publicationStatus'
        | 'admission'
        | 'deadlineAdjustment'
        | 'hours'
      >
    > & { evidence?: string; institutional?: boolean })[],
) {
  let result: ReturnType<typeof calendarResult> | null = null,
    error: string | null = null,
    provisional = false;
  try {
    result = calendarResult(
      record.state,
      events.map((event) => ({ ...event, kind: event.kind ?? 'note' })),
    );
  } catch (cause) {
    error = 'Contagem indisponível: ' + (cause instanceof Error ? cause.message : String(cause));
    // A numerical preview uses only registered weekdays and events, never an assumed week.
    if (record.state.weekdays?.length) {
      try {
        result = calendarResult(
          {
            ...record.state,
            weekConfirmed: true,
          },
          events.map((e) => ({
            ...e,
            kind: e.kind ?? 'note',
          })),
        );
        provisional = true;
        error = 'Contagem provisória: confirme a semana letiva no editor.';
      } catch {
        /* Invalid periods or dates must not produce a misleading total. */
      }
    }
  }
  const regime = organizationSummary(record.state.offers);
  const counts = result ? Object.entries(result.byOffer) : [];
  const countLabel = provisional ? 'Contagem provisória dos dados cadastrados. ' : '';
  const policy = policyFor(record.state.year);
  const source = policy.review.source;
  const sameYear = record.state.year === source.year;
  const normativeScopeConfirmed =
    !policy.scope ||
    (calendarOffers(record.state).filter(
      (offer) => !policy.excludes(offer) && offer.scope?.status !== 'own-regulation',
    ).length > 0 &&
      calendarOffers(record.state)
        .filter((offer) => !policy.excludes(offer) && offer.scope?.status !== 'own-regulation')
        .every((offer) => offer.scope?.status === 'covered'));
  const window = policy.window(record.state);
  const normativeOffers = calendarOffers(record.state).filter(
    (offer) => !policy.excludes(offer) && (!policy.scope || offer.scope?.status === 'covered'),
  );
  const normativeCounts = counts.filter(([id]) => normativeOffers.some((offer) => offer.id === id));
  const normativeRegime = organizationSummary(normativeOffers);
  const windowPeriods = record.state.periods.filter((period) =>
    associationOffers(period.association).some((id) => {
      const offer = offerFor(record.state, id);
      return offer && !policy.excludes(offer) && offer.scope?.status !== 'own-regulation';
    }),
  );
  const windowStart = window?.start ?? '',
    latestStart = window?.latestStart ?? '',
    windowEnd = window?.end ?? '';
  const coverage =
    policy.review.evidence === 'coverage'
      ? activityCoverage({
          ...record.state,
          events: events.map((event) => ({ ...event, kind: event.kind ?? 'note' })),
        })
      : [];
  return {
    source,
    rulesetVersion: policy.rulesetVersion(record.state),
    sameYear,
    officialApproval: false,
    calendar: {
      id: record.id,
      name: record.name,
      campus: record.state.campus,
      year: record.state.year,
      offerKinds: kinds({ offers: record.state.offers }),
      offers: record.state.offers,
      regime: regime,
      version: record.version,
    },
    criteria: policy.review.criteria.map((c) => {
      const dayMinimums = policy.review.dayMinimums;
      let signal: string = 'Conferência documental necessária.';
      let candidates: (Pick<CalendarActivity, 'id' | 'name' | 'start' | 'end'> & {
        evidence: string;
      })[] = [];
      if (c.pattern) {
        const pattern = new RegExp(c.pattern);
        candidates = events
          .filter(
            (e) =>
              pattern.test(normalize(e.name + ' ' + (e.category || ''))) &&
              (c.id !== 'III' ||
                !(
                  /docent|professor/.test(normalize(e.name)) ||
                  String(e.id).startsWith('teacher-vacation')
                )),
          )
          .map(reviewCandidate);
        signal = candidates.length
          ? `${candidates.length} registro(s) possivelmente relacionado(s). A presença não comprova atendimento.`
          : 'Nenhum registro localizado por nome/categoria. Isso não comprova ausência no processo.';
      }
      if (c.id === 'annual')
        signal = result
          ? countLabel +
            counts
              .map(([m, r]) => {
                const offer = offerFor(record.state, m);
                const minimum =
                  (offer ? policy.review.annualReference?.(offer.kind) : undefined) ??
                  r.checks.find((check) => check.scope === 'annual')?.expected;
                return `${labelFor(record.state, m)}: ${r.total} dias letivos registrados; ${minimum == null ? 'mínimo normativo não configurado para este escopo' : `${r.total >= minimum ? 'alcança' : 'não alcança'} a referência de ${minimum} dias`}`;
              })
              .join('; ') +
            '. Carga horária do PPC exige análise.' +
            (provisional ? ' ' + error : '')
          : (error ?? '');
      if (c.id === 'semester')
        signal =
          (normativeRegime === 'anual'
            ? 'Regime anual: confira a aplicabilidade do mínimo semestral. '
            : '') +
          (result
            ? countLabel +
              counts
                .map(
                  ([m, r]) =>
                    `${labelFor(record.state, m)}: ` +
                    periodsForOffer(record.state, m)
                      .map((p) => `${p.name || p.id}: ${r.byPeriod[p.id]} dias letivos`)
                      .join('; '),
                )
                .join(' | ')
            : error);
      if (c.id === 'I')
        signal =
          record.state.periods.map((p) => `${p.name}: ${p.start} a ${p.end}`).join('; ') ||
          'Nenhum período cadastrado. Confira também as etapas internas.';
      if (c.id === 'window') {
        const starts = windowPeriods.map((p) => p.start).sort(),
          ends = windowPeriods.map((p) => p.end).sort();
        signal = !sameYear
          ? 'Datas da norma de referência não aplicadas. Consulte a resolução do ano do calendário.'
          : !normativeScopeConfirmed || !window
            ? 'Aplicabilidade da janela a conferir; identifique o escopo e a norma própria quando necessária.'
            : !starts.length
              ? 'Nenhum período cadastrado.'
              : `${starts[0]} a ${ends.at(-1)}. ${starts[0] >= windowStart && starts[0] <= latestStart && ends.at(-1)! <= windowEnd ? 'Dentro da janela indicada no parecer.' : 'Fora da janela indicada no parecer; revisar.'}`;
      }
      if (
        ['V', 'VII'].includes(c.id) &&
        calendarOffers(record.state).every((offer) => offer.kind === 'integrado')
      )
        signal +=
          ' O texto do parecer menciona subsequentes e graduação: confira se não se aplica.';
      if (
        ['XXIV', 'XXV', 'XXVI'].includes(c.id) &&
        calendarOffers(record.state).every((offer) => offer.kind === 'graduacao')
      )
        signal += ' A norma de referência considera esse evento facultativo para graduação.';
      if (['IV', 'XXII', 'XXIII'].includes(c.id))
        signal += ' A quantidade de dias/horas não está comprovada pela identificação do evento.';
      if (policy.review.evidence === 'coverage') {
        const linked = coverage.filter((row) => row.requirement.reviewCriterionId === c.id);
        if (linked.length) {
          signal =
            linked
              .map(
                (row) =>
                  `${labelFor(record.state, row.offerId)} — ${row.requirement.name}: ${row.applicability === 'required' ? 'obrigatório' : row.applicability === 'optional' ? 'opcional' : 'escopo a conferir'}; planejamento ${row.coverage === 'complete' ? 'completo' : row.coverage === 'partial' ? 'parcial' : 'pendente'}; ${row.execution === 'published' ? 'execução comprovada' : row.execution === 'planned' ? 'publicação prevista' : 'execução a classificar'}. ${[...row.issues, ...row.warnings].join(' ')}`,
              )
              .join(' | ') +
            ' A presença não comprova atendimento. A conferência humana permanece necessária.';
          candidates = [
            ...new Map(
              [...candidates, ...linked.flatMap((row) => row.events.map(reviewCandidate))].map(
                (e) => [e.id, e],
              ),
            ).values(),
          ];
        }
      }
      let status = 'PENDENTE',
        finding = candidates.length ? 'REGISTROS_LOCALIZADOS' : 'CONFERENCIA_NECESSARIA';
      if (c.pattern && !candidates.length) finding = 'NAO_LOCALIZADO';
      if (c.id === 'annual' && result && !provisional && normativeCounts.length) {
        finding = normativeCounts.some(([, r]) => r.total < dayMinimums.annual)
          ? 'CONTAGEM_INSUFICIENTE'
          : 'CONTAGEM_ALCANCADA';
        if (
          sameYear &&
          normativeScopeConfirmed &&
          normativeCounts.some(([, r]) => r.total < dayMinimums.annual)
        )
          status = 'NAO_ATENDIDO';
      }
      if (c.id === 'semester' && normativeRegime === 'anual') {
        finding = 'APLICABILIDADE';
        if (sameYear && normativeScopeConfirmed) status = 'NAO_APLICAVEL';
      }
      if (c.id === 'semester' && normativeRegime !== 'anual' && result && !provisional) {
        const valid =
          normativeCounts.length > 0 &&
          normativeCounts.every(
            ([m, r]) =>
              organizationForOffer(record.state, m) !== 'semestral' ||
              (periodsForOffer(record.state, m).length === 2 &&
                periodsForOffer(record.state, m).every(
                  (p) => r.byPeriod[p.id] >= dayMinimums.semester,
                )),
          );
        finding = valid ? 'CONTAGEM_ALCANCADA' : 'CONTAGEM_INSUFICIENTE';
        if (sameYear && normativeScopeConfirmed) status = valid ? 'ATENDIDO' : 'NAO_ATENDIDO';
      }
      if (c.id === 'window' && sameYear && normativeScopeConfirmed && windowPeriods.length) {
        const starts = windowPeriods.map((p) => p.start).sort(),
          ends = windowPeriods.map((p) => p.end).sort();
        status =
          starts[0] >= windowStart && starts[0] <= latestStart && ends.at(-1)! <= windowEnd
            ? 'ATENDIDO'
            : 'NAO_ATENDIDO';
        finding = 'DATAS_COMPARADAS';
      }
      if (!normativeScopeConfirmed) {
        status = 'PENDENTE';
        signal =
          (signal.trim() ? signal.trim().replace(/[.!?]+$/, '') + '. ' : '') +
          'Escopo da norma a confirmar; EaD, qualificação e pós-graduação dependem de calendário próprio.';
      }
      return {
        ...c,
        signal,
        candidates,
        initial: { id: c.id, status, notes: '', reviewed: false, finding },
      };
    }),
    teachingDays: counts.map(([modality, r]) => ({
      offerId: modality,
      label: labelFor(record.state, modality),
      total: r.total,
      byPeriod: r.byPeriod,
      provisional,
    })),
    conflicts: result?.conflicts || [],
    countError: error,
  };
}
