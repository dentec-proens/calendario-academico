import { normativeDayMinimums } from '../calendar/policies/consup-292-2027.ts';
import { legacyDayMinimums } from '../calendar/policies/legacy-2026.ts';
import type { CalendarActivity, TeachingState } from '../calendar/model.ts';
import { calendarModalities, modalityLabels } from '../calendar/modalities.ts';
import { automaticEventSource } from '../calendar/counting/core.ts';
import { evaluateCalendar as calendarResult } from '../calendar/counting/evaluation.ts';
import { activityCoverage } from '../calendar/activities/coverage.ts';
import { organizationForModality, periodsForModality } from '../calendar/organization/periods.ts';
import { rulesetVersion, calendarWindow } from '../calendar/policies/resolve.ts';

import { reviewSourceFor, reviewCriteriaFor } from './criteria.ts';
const normalize = (s: string) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function reviewSupport<
  T extends {
    id: string;
    name: string;
    version: number;
    state: TeachingState & { campus?: string };
  },
>(
  record: T,
  events: (Pick<CalendarActivity, 'id' | 'name' | 'start' | 'end' | 'category' | 'modalities'> &
    Partial<
      Pick<
        CalendarActivity,
        | 'kind'
        | 'requirementId'
        | 'recordType'
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
  const counts = result ? Object.entries(result.byModality) : [];
  const countLabel = provisional ? 'Contagem provisória dos dados cadastrados. ' : '';
  const source = reviewSourceFor(record.state.year);
  const sameYear = record.state.year === source.year;
  const normativeScopeConfirmed =
    record.state.year !== 2027 || record.state.scopeConfirmation?.status === 'covered';
  const window = calendarWindow(record.state);
  const windowStart = window?.start ?? '',
    latestStart = window?.latestStart ?? '',
    windowEnd = window?.end ?? '';
  const coverage =
    record.state.year === 2027
      ? activityCoverage({
          ...record.state,
          events: events.map((event) => ({ ...event, kind: event.kind ?? 'note' })),
        })
      : [];
  return {
    source,
    rulesetVersion: rulesetVersion(record.state),
    sameYear,
    officialApproval: false,
    calendar: {
      id: record.id,
      name: record.name,
      campus: record.state.campus,
      year: record.state.year,
      offer: record.state.offer,
      modalities: calendarModalities(record.state),
      regime: record.state.regime,
      version: record.version,
    },
    criteria: reviewCriteriaFor(record.state.year).map((c) => {
      const dayMinimums =
        record.state.year === normativeDayMinimums.year ? normativeDayMinimums : legacyDayMinimums;
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
          .map((e) => ({
            id: e.id,
            name: e.name,
            start: e.start,
            end: e.end,
            evidence: automaticEventSource(e) ?? '',
          }));
        signal = candidates.length
          ? `${candidates.length} registro(s) possivelmente relacionado(s). A presença não comprova atendimento.`
          : 'Nenhum registro localizado por nome/categoria. Isso não comprova ausência no processo.';
      }
      if (c.id === 'annual')
        signal = result
          ? countLabel +
            counts
              .map(([m, r]) => {
                const minimum =
                  record.state.year === 2026 && m !== 'posgraduacao'
                    ? legacyDayMinimums.annual
                    : r.checks.find((check) => check.scope === 'annual')?.expected;
                return `${modalityLabels[m] || m}: ${r.total} dias letivos registrados; ${minimum == null ? 'mínimo normativo não configurado para este escopo' : `${r.total >= minimum ? 'alcança' : 'não alcança'} a referência de ${minimum} dias`}`;
              })
              .join('; ') +
            '. Carga horária do PPC exige análise.' +
            (provisional ? ' ' + error : '')
          : (error ?? '');
      if (c.id === 'semester')
        signal =
          (record.state.regime === 'anual'
            ? 'Regime anual: confira a aplicabilidade do mínimo semestral. '
            : '') +
          (result
            ? countLabel +
              counts
                .map(
                  ([m, r]) =>
                    `${modalityLabels[m] || m}: ` +
                    periodsForModality(record.state, m)
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
        const starts = record.state.periods.map((p) => p.start).sort(),
          ends = record.state.periods.map((p) => p.end).sort();
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
        calendarModalities(record.state).every((m) => m === 'integrado')
      )
        signal +=
          ' O texto do parecer menciona subsequentes e graduação: confira se não se aplica.';
      if (
        ['XXIV', 'XXV', 'XXVI'].includes(c.id) &&
        calendarModalities(record.state).every((m) => m === 'graduacao')
      )
        signal += ' A norma de referência considera esse evento facultativo para graduação.';
      if (['IV', 'XXII', 'XXIII'].includes(c.id))
        signal += ' A quantidade de dias/horas não está comprovada pela identificação do evento.';
      if (record.state.year === 2027) {
        const linked = coverage.filter((row) => row.requirement.reviewCriterionId === c.id);
        if (linked.length) {
          signal =
            linked
              .map(
                (row) =>
                  `${modalityLabels[row.modality]} — ${row.requirement.name}: ${row.applicability === 'required' ? 'obrigatório' : row.applicability === 'optional' ? 'opcional' : 'escopo a conferir'}; planejamento ${row.coverage === 'complete' ? 'completo' : row.coverage === 'partial' ? 'parcial' : 'pendente'}; ${row.execution === 'published' ? 'execução comprovada' : row.execution === 'planned' ? 'publicação prevista' : 'execução a classificar'}. ${[...row.issues, ...row.warnings].join(' ')}`,
              )
              .join(' | ') +
            ' A presença não comprova atendimento. A conferência humana permanece necessária.';
          candidates = [
            ...new Map(
              [...candidates, ...linked.flatMap((row) => row.events)].map((e) => [
                e.id,
                { ...e, evidence: automaticEventSource(e) ?? '' },
              ]),
            ).values(),
          ];
        }
      }
      let status = 'PENDENTE',
        finding = candidates.length ? 'REGISTROS_LOCALIZADOS' : 'CONFERENCIA_NECESSARIA';
      if (c.pattern && !candidates.length) finding = 'NAO_LOCALIZADO';
      if (c.id === 'annual' && result && !provisional) {
        finding = counts.some(([, r]) => r.total < dayMinimums.annual)
          ? 'CONTAGEM_INSUFICIENTE'
          : 'CONTAGEM_ALCANCADA';
        if (
          sameYear &&
          normativeScopeConfirmed &&
          counts.some(([, r]) => r.total < dayMinimums.annual)
        )
          status = 'NAO_ATENDIDO';
      }
      if (c.id === 'semester' && record.state.regime === 'anual') {
        finding = 'APLICABILIDADE';
        if (sameYear && normativeScopeConfirmed) status = 'NAO_APLICAVEL';
      }
      if (c.id === 'semester' && record.state.regime !== 'anual' && result && !provisional) {
        const valid =
          counts.length > 0 &&
          counts.every(
            ([m, r]) =>
              organizationForModality(record.state, m) !== 'semestral' ||
              (periodsForModality(record.state, m).length === 2 &&
                periodsForModality(record.state, m).every(
                  (p) => r.byPeriod[p.id] >= dayMinimums.semester,
                )),
          );
        finding = valid ? 'CONTAGEM_ALCANCADA' : 'CONTAGEM_INSUFICIENTE';
        if (sameYear && normativeScopeConfirmed) status = valid ? 'ATENDIDO' : 'NAO_ATENDIDO';
      }
      if (c.id === 'window' && sameYear && normativeScopeConfirmed && record.state.periods.length) {
        const starts = record.state.periods.map((p) => p.start).sort(),
          ends = record.state.periods.map((p) => p.end).sort();
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
      modality,
      total: r.total,
      byPeriod: r.byPeriod,
      provisional,
    })),
    conflicts: result?.conflicts || [],
    countError: error,
  };
}
