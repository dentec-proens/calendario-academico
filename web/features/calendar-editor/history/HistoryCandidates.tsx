import { useState } from 'react';
import {
  existingHistoryEvent,
  historyCandidateKey,
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
  const { value } = useHistoryAnalysis();
  const [showExisting, setShowExisting] = useState(false);
  const history = record.histories.find((item) => item.id === value?.historyId);
  if (!value || !history) return null;
  const { analysis } = value;
  const count = analysis.candidates.filter((candidate) =>
    includedHistoryCandidate(state.events, history.id, candidate, analysis.candidates),
  ).length;
  return (
    <section id="history-analysis">
      <h3>Sugestões do calendário anterior</h3>
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
        Mostrar sugestões já cadastradas
      </label>
      <p id="history-progress" role="status">
        {count} itens incluídos a partir do PDF. Itens ambíguos aguardam revisão.
      </p>
      <ul id="history-suggestions" className="records">
        {analysis.candidates.map((candidate, index) => {
          const key = historyCandidateKey(candidate);
          const included = state.events.filter((event) =>
            includedHistoryCandidate([event], history.id, candidate, analysis.candidates),
          );
          const existing = !included.length && existingHistoryEvent(events, candidate, state);
          const ignored = state.ignoredHistory.includes(`${history.id}:${key}`);
          if (existing && !showExisting) return null;
          return (
            <li
              key={key}
              data-history-item={index}
              className={included.length ? 'history-included' : undefined}
            >
              <div>
                <strong>
                  {index + 1}. {candidate.name}
                </strong>
                <small>
                  Página {candidate.page} · texto do ano anterior: {candidate.excerpt}
                </small>
                {existing ? (
                  <span className="history-check">✓ Já cadastrado: {existing.name}</span>
                ) : included.length ? (
                  <span className="history-check">✓ Revisado e incluído</span>
                ) : ignored ? (
                  <span className="history-check">Não será utilizado</span>
                ) : null}
              </div>
              <div className="history-actions">
                <button
                  type="button"
                  data-history-candidate={index}
                  disabled={readOnly || Boolean(included.length || ignored || existing)}
                  onClick={() => editor.history(history, candidate)}
                >
                  {existing
                    ? '✓ Já cadastrado'
                    : included.length
                      ? '✓ Incluído'
                      : 'Revisar e incluir'}
                </button>
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
              {editor.context?.kind === 'history' &&
                editor.context.historyId === history.id &&
                editor.context.candidateKey === key && <EventEditor />}
            </li>
          );
        })}
      </ul>
      <details>
        <summary>Consultar todo o texto identificado no PDF</summary>
        <pre id="history-text">
          {analysis.pages.map((page) => `Página ${page.page}\n${page.text}`).join('\n\n')}
        </pre>
      </details>
    </section>
  );
}
