import { Link } from '@tanstack/react-router';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarExport } from '../export/CalendarExportProvider.tsx';
import { modalityLabels } from '../../../../src/modalities.ts';
import { Download, Eye } from 'lucide-react';

export default function IssuesSection() {
  const { state, record, dirty, evaluation } = useCalendarEditor();
  const exporting = useCalendarExport();
  const issues: { mark: string; title: string; detail: string }[] = [];
  if (!state.weekConfirmed)
    issues.push({
      mark: 'Pendente',
      title: 'Semana letiva',
      detail: 'Registre e confirme os dias regulares e a referência da decisão.',
    });
  if (!state.periods.length)
    issues.push({
      mark: 'Pendente',
      title: 'Períodos letivos',
      detail: 'Cadastre pelo menos um período com início e término.',
    });
  if (state.regime !== 'anual' && state.periods.length !== 2)
    issues.push({
      mark: 'Pendente',
      title: 'Organização semestral',
      detail: 'Cadastre exatamente dois semestres para a conferência anual.',
    });
  if (evaluation) {
    for (const [modality, detail] of Object.entries(evaluation.byModality))
      for (const check of detail.checks)
        if (check.scope === 'annual' || state.regime !== 'anual')
          issues.push({
            mark:
              check.status === 'MET'
                ? 'Atendido'
                : check.status === 'NOT_MET'
                  ? 'Corrigir'
                  : 'Pendente',
            title: `${modalityLabels[modality]} — ${check.scope === 'annual' ? 'Total anual' : state.periods.find((period) => period.id === check.scope)?.name || check.scope}`,
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
      <div className="metrics editor-review-metrics">
        <article>
          <span>Dias letivos calculados</span>
          <strong id="total">{evaluation?.total ?? '—'}</strong>
          <small id="goal">
            {state.year === 2027
              ? 'Referência: mínimo anual de 200 dias.'
              : 'Sem meta normativa cadastrada para este ano.'}
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
        <ul id="issue-list" className="records">
          {issues.map((issue, index) => (
            <li key={`${issue.title}:${index}`} className="issue-item">
              <span className="issue-mark">{issue.mark}</span>
              <div>
                <strong>{issue.title}</strong>
                <small>{issue.detail}</small>
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
          <button
            type="button"
            id="export-calendar"
            className="secondary"
            disabled={exporting.pending}
            onClick={() => {
              void exporting.pdf();
            }}
          >
            <Download aria-hidden="true" /> Baixar calendário em PDF
          </button>
        </div>
      </div>
    </section>
  );
}
