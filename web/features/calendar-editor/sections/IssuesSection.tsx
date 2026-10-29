import { diagnoseCalendar, diagnoseTeachingDays } from '#src/domain/calendar/diagnostics.ts';
import { Link } from '@tanstack/react-router';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { labelFor } from '#src/domain/calendar/offers.ts';
import { Eye } from 'lucide-react';
import { rulesetVersion } from '#src/domain/policies/registry.ts';
import { stageRequirement } from '#src/domain/calendar/activities/assessment.ts';
import ScopeForm from '../forms/ScopeForm.tsx';

export default function IssuesSection() {
  const { state, record, dirty, evaluation } = useCalendarEditor();
  const issues: { mark: string; title: string; detail: string; requirementId?: string }[] = [];
  const diagnostics = diagnoseCalendar(state);
  for (const issue of diagnostics.structure) {
    if (issue.code === 'week-unconfirmed')
      issues.push({
        mark: 'Pendente',
        title: 'Semana letiva',
        detail: 'Registre e confirme os dias regulares.',
      });
    else if (issue.code === 'periods-missing')
      issues.push({
        mark: 'Pendente',
        title: 'Períodos letivos',
        detail: 'Cadastre pelo menos um período com início e término.',
      });
    else if (issue.code === 'organization-unclassified' || issue.code === 'period-count')
      issues.push({
        mark: 'Pendente',
        title: `Organização — ${labelFor(state, issue.modality)}`,
        detail:
          issue.code === 'organization-unclassified'
            ? 'Classifique a organização e a associação dos períodos na etapa 2.'
            : `Cadastre ${issue.expected === 1 ? 'um período anual' : 'dois semestres identificados'} para esta oferta.`,
      });
  }
  for (const row of diagnostics.coverage) {
    if (row.applicability !== 'required' && row.applicability !== 'unconfigured') continue;
    if (row.coverage !== 'complete' || row.warnings.length)
      issues.push({
        mark:
          row.applicability === 'unconfigured'
            ? 'Escopo a conferir'
            : row.coverage === 'complete'
              ? 'Conferir'
              : 'Pendente',
        title: `${labelFor(state, row.modality)} — ${row.requirement.name}`,
        detail:
          [...row.issues, ...row.warnings].join(' ') ||
          'Planejamento pendente de registro e datas.',
        requirementId: row.requirement.id,
      });
  }
  if (evaluation) {
    for (const check of diagnoseTeachingDays(state, evaluation))
      issues.push({
        mark:
          check.status === 'MET'
            ? 'Atendido'
            : check.status === 'NOT_MET'
              ? 'Corrigir'
              : 'Pendente',
        title: `${labelFor(state, check.modality)} — ${check.scope === 'annual' ? 'Total anual' : state.periods.find((period) => period.id === check.scope)?.name || check.scope}`,
        detail:
          check.expected === null
            ? 'Não há mínimo normativo configurado para este escopo.'
            : `${check.observed} de ${check.expected} dias mínimos.`,
      });
    for (const conflict of evaluation.conflicts)
      issues.push({
        mark: 'Conflito',
        title: conflict.date,
        detail:
          'Há inclusão e exclusão na mesma data. O dia foi excluído da contagem até a resolução do conflito.',
      });
  }
  for (const title of [
    'Feriados municipais e decisões locais',
    'Carga horária e apreciação institucional',
  ])
    issues.push({
      mark: 'Pendente',
      title,
      detail:
        'Confira as evidências e a legislação aplicável. A contagem não representa aprovação institucional.',
    });
  if (!dirty)
    for (const issue of record.readiness.issues)
      issues.push({ mark: 'Pendente', title: 'Pendência para validação', detail: issue });
  if (!dirty)
    for (const warning of record.readiness.warnings)
      issues.push({
        mark: 'Aviso',
        title: 'Organização dos prazos — sem bloqueio',
        detail: warning,
      });
  return (
    <section id="issues" className="view">
      <ScopeForm />
      <div className="metrics editor-review-metrics">
        <article>
          <span>Dias letivos calculados</span>
          <strong id="total">{evaluation?.total ?? '—'}</strong>
          <small id="goal">
            {evaluation
              ? Object.entries(evaluation.byOffer)
                  .map(([modality, detail]) => {
                    const target = detail.checks.find(
                      (check) => check.scope === 'annual',
                    )?.expected;
                    return `${labelFor(state, modality)}: ${target == null ? 'sem mínimo normativo confirmado para este escopo' : `mínimo anual de ${target} dias`}`;
                  })
                  .join(' · ')
              : 'A contagem depende da organização e dos períodos por oferta.'}
          </small>
        </article>
        <article>
          <span>Períodos cadastrados</span>
          <strong id="period-count">{state.periods.length}</strong>
          <small id="period-summary">
            {state.periods.length
              ? state.periods.map((period) => period.name).join(' · ')
              : 'Nenhum período definido'}
          </small>
        </article>
      </div>
      <div className="panel">
        <h3>Conferência do calendário</h3>
        <p>A saída definitiva depende das verificações e da revisão humana atualizada.</p>
        <p>
          Conjunto de regras: {rulesetVersion(state)}. Planejamento completo e execução comprovada
          são conferências distintas. A passagem do tempo não transforma publicação prevista em
          realizada.
        </p>
        <ul id="issue-list" className="records">
          {issues.map((issue, index) => (
            <li key={`${issue.title}:${index}`} className="issue-item">
              <span className="issue-mark">{issue.mark}</span>
              <div>
                <strong>{issue.title}</strong>
                <small>{issue.detail}</small>
                {issue.requirementId && (
                  <Link
                    to={
                      stageRequirement(issue.requirementId)
                        ? '/calendarios/$calendarId/periodos'
                        : '/calendarios/$calendarId/eventos'
                    }
                    params={{ calendarId: record.id }}
                    search={(previous) => ({ ...previous, atividade: issue.requirementId })}
                    hashScrollIntoView={false}
                  >
                    Conferir esta atividade
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="actions">
          <Link
            to="/calendarios/$calendarId/visualizar"
            params={{ calendarId: record.id }}
            className="editor-action secondary"
          >
            <Eye aria-hidden="true" /> Visualizar calendário
          </Link>
        </div>
      </div>
    </section>
  );
}
