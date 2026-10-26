import { downloadLink } from '../../../shared/convex/files.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useHistoryAnalysis } from '../history/useHistoryAnalysis.tsx';
import HistoryUploadForm from '../history/HistoryUploadForm.tsx';
import RestoreHistoryForm from '../history/RestoreHistoryForm.tsx';
import HistoryCandidates from '../history/HistoryCandidates.tsx';

export default function HistorySection() {
  const { record, isAdmin, notify } = useCalendarEditor();
  const analysis = useHistoryAnalysis();
  return (
    <section id="history" className="view">
      <div className="panel history-area" id="history-area">
        <h3>Complementar com o calendário anterior</h3>
        <p className="help">
          Use o calendário anterior como referência para eventos locais. Revise datas e fontes do
          ano atual antes de incluir.
        </p>
        <ul id="history-list" className="records">
          {record.histories.map((history) => (
            <li key={history.id}>
              <div>
                <strong>
                  {history.year} · {history.filename}
                </strong>
                {history.notes && <small>{history.notes}</small>}
                {history.unavailableFile ? (
                  <>
                    <p className="notice">
                      PDF original aguardando restauração pela administração.
                    </p>
                    {isAdmin && <RestoreHistoryForm history={history} />}
                  </>
                ) : (
                  <a
                    href={`#history-${history.id}`}
                    data-history-id={history.id}
                    onClick={(event) => {
                      void downloadLink(
                        event,
                        { kind: 'history', id: history.id },
                        history.filename,
                      ).catch((cause: unknown) =>
                        notify(
                          cause instanceof Error
                            ? cause.message
                            : 'Não foi possível abrir o arquivo.',
                          true,
                        ),
                      );
                    }}
                  >
                    Consultar PDF original
                  </a>
                )}
              </div>
              <button
                type="button"
                disabled={analysis.pending}
                data-analyze-history={history.id}
                onClick={() => {
                  void analysis.analyze(history.id);
                }}
              >
                Identificar datas e atividades
              </button>
            </li>
          ))}
        </ul>
        <HistoryUploadForm />
        <p id="history-status" role="status" aria-live="polite">
          {analysis.status}
        </p>
        <HistoryCandidates />
      </div>
    </section>
  );
}
