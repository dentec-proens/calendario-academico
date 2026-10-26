import { useState } from 'react';
import { useQuery } from 'convex/react';
import { functions } from '../../../shared/convex/client.ts';
import {
  existingHistoryEvent,
  historyCandidateKey,
  historicalOccurrence,
  includedHistoryCandidate,
} from '../../../../src/history-progress.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import EventEditor from '../events/EventEditor.tsx';
import { useHistoryAnalysis } from './useHistoryAnalysis.tsx';
import { removeEvent } from '../../../../src/calendar-edits/commands.ts';

export default function HistoryCandidates() {
  const { state, events, record, institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const { value, analyze, pending, selectAnalysis } = useHistoryAnalysis();
  const [showExisting, setShowExisting] = useState(false);
  const history = record.histories.find((item) => item.id === value?.historyId);
  const versions = useQuery(
    functions.histories.analysisVersions,
    history ? { id: history.id } : 'skip',
  );
  const historicalContext = editor.context?.kind === 'history' ? editor.context : null;
  if (!value || !history) return historicalContext ? <EventEditor /> : null;
  const { analysis } = value;
  const draftInAnalysis =
    historicalContext?.historyId === history.id &&
    analysis.candidates.some(
      (candidate) => historyCandidateKey(candidate) === historicalContext.candidateKey,
    );
  const count = analysis.candidates.filter((candidate) =>
    includedHistoryCandidate(state.events, history.id, candidate, analysis.candidates, {
      analysisId: analysis.analysisId,
      originalAnalysisId: versions?.history?.originalAnalysisId,
    }),
  ).length;
  return (
    <section id="history-analysis">
      <h3>Sugestões do calendário anterior</h3>
      <p className="help">
        Referenciar conserva a ocorrência e suas datas reais; preparar nova ocorrência reutiliza o
        contexto e deixa datas e fonte por preencher.
      </p>
      {Boolean(versions?.history?.analyses?.length) && (
        <label>
          Análise do documento
          <select
            id="history-analysis-version"
            value={analysis.analysisId ?? ''}
            disabled={pending}
            onChange={(event) => {
              void selectAnalysis(history.id, event.target.value);
            }}
          >
            {versions?.history?.analyses?.map((item) => (
              <option key={item.analysisId} value={item.analysisId}>
                Extrator {item.extractorVersion ?? 'legado'} ·{' '}
                {item.analysisId === versions.history.latestAnalysisId
                  ? 'mais recente'
                  : item.analysisId === versions.history.originalAnalysisId
                    ? 'original'
                    : 'anterior'}{' '}
                · {item.analysisId}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="help">
        {analysis.analysisId
          ? `Análise consultada: ${analysis.analysisId} · extrator ${analysis.extractorVersion ?? 'legado'}`
          : 'Análise legada: anos e pertinência precisam de conferência.'}
      </p>
      <button
        type="button"
        className="secondary"
        disabled={readOnly || pending || Boolean(history.unavailableFile)}
        onClick={() => {
          void analyze(history.id, true);
        }}
      >
        Reanalisar original com o extrator atual
      </button>
      <p id="history-analysis-help">
        {analysis.needsText
          ? 'Este PDF parece ser uma imagem digitalizada. Ainda não há leitura de imagens (OCR). Consulte o original e preencha os eventos manualmente.'
          : `Foram encontrados ${analysis.candidates.length} possíveis itens. Confira as datas e fontes vigentes antes de incluir.`}
      </p>
      <label className="check">
        <input
          type="checkbox"
          id="show-existing-history"
          checked={showExisting}
          onChange={(event) => setShowExisting(event.target.checked)}
        />
        Destacar possíveis registros existentes
      </label>
      <p id="history-progress" role="status">
        {count} itens incluídos a partir do PDF. Itens ambíguos aguardam revisão.
      </p>
      <ul id="history-suggestions" className="records">
        {analysis.candidates.map((candidate, index) => {
          const key = historyCandidateKey(candidate);
          const included = state.events.filter((event) =>
            includedHistoryCandidate([event], history.id, candidate, analysis.candidates, {
              analysisId: analysis.analysisId,
              originalAnalysisId: versions?.history?.originalAnalysisId,
            }),
          );
          const occurrence = historicalOccurrence(history, analysis, candidate);
          const existing = !included.length && existingHistoryEvent(events, occurrence, state);
          const ignored = state.ignoredHistory.includes(`${history.id}:${key}`);
          const editing =
            historicalContext?.historyId === history.id && historicalContext.candidateKey === key;
          return (
            <li
              key={key}
              data-history-item={index}
              className={
                included.length || (existing && showExisting) ? 'history-included' : undefined
              }
            >
              <div>
                <strong>
                  {index + 1}. {candidate.name}
                </strong>
                <small>
                  Página {candidate.page} · texto do ano anterior: {candidate.excerpt}
                </small>
                {existing ? (
                  <span className="history-check">
                    Possível registro existente: {existing.name}. Confira finalidade, ofertas e
                    procedência.
                  </span>
                ) : included.length ? (
                  <span className="history-check">
                    Registro vinculado; confira a cobertura por oferta e a intenção.
                  </span>
                ) : ignored ? (
                  <span className="history-check">Não será utilizado</span>
                ) : null}
              </div>
              <div className="history-actions">
                <button
                  type="button"
                  data-history-candidate={index}
                  disabled={readOnly || ignored}
                  onClick={() => editor.history(history, candidate, 'new', analysis)}
                >
                  Preparar nova ocorrência
                </button>
                <button
                  type="button"
                  data-history-reference={index}
                  disabled={readOnly || ignored}
                  onClick={() => editor.history(history, candidate, 'reference', analysis)}
                >
                  Referenciar esta ocorrência
                </button>
                {existing && (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => editor.linkHistory(history, candidate, existing.id, analysis)}
                  >
                    Conferir e vincular procedência ao evento existente
                  </button>
                )}
                {included.map((event) => (
                  <button
                    type="button"
                    key={`edit:${event.id}`}
                    disabled={readOnly}
                    onClick={() => editor.edit(event.id)}
                  >
                    Editar registro vinculado: {event.name}
                  </button>
                ))}
                {!included.length && !existing && (
                  <button
                    type="button"
                    data-history-discard={index}
                    disabled={readOnly}
                    onClick={() =>
                      applyCommand((current) => ({
                        ...current,
                        ignoredHistory: ignored
                          ? current.ignoredHistory.filter((item) => item !== `${history.id}:${key}`)
                          : [...current.ignoredHistory, `${history.id}:${key}`],
                      }))
                    }
                  >
                    {ignored ? 'Desfazer descarte' : 'Não utilizar este evento'}
                  </button>
                )}
                {included.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    disabled={readOnly}
                    data-remove-event={event.id}
                    onClick={() => {
                      if (
                        applyCommand((current) => removeEvent(current, event.id, institutional)) &&
                        editor.eventId === event.id
                      )
                        editor.discard();
                    }}
                  >
                    Excluir evento incluído
                  </button>
                ))}
              </div>
              {editing && <EventEditor />}
            </li>
          );
        })}
      </ul>
      {historicalContext && !draftInAnalysis && <EventEditor />}
      <details>
        <summary>Consultar todo o texto identificado no PDF</summary>
        <pre id="history-text">
          {analysis.pages.map((page) => `Página ${page.page}\n${page.text}`).join('\n\n')}
        </pre>
      </details>
    </section>
  );
}
