import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import {
  calendarReferenceAnchor,
  isCalendarReferenceHash,
} from '../../../../src/calendar-reference.ts';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import { scrollIntoView } from '../../../scroll.ts';
import '../history/history-reference.css';
import { downloadLink } from '../../../shared/convex/files.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useHistoryAnalysis } from '../history/useHistoryAnalysis.tsx';
import HistoryUploadForm from '../history/HistoryUploadForm.tsx';
import RestoreHistoryForm from '../history/RestoreHistoryForm.tsx';
import HistoryCandidates from '../history/HistoryCandidates.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

export default function HistorySection() {
  const { record, isAdmin, notify, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const location = useRouterState({ select: (router) => router.location });
  const reference = useRef<HTMLElement>(null);
  const previousEntry = useRef<typeof location | null>(null);
  const explicitReference = isCalendarReferenceHash(location.hash);
  useEffect(() => {
    const entered = previousEntry.current !== location;
    previousEntry.current = location;
    // A draft from the previous calendar opens in the side panel, which takes the focus.
    if (!explicitReference || !entered || (editor.context?.kind === 'history' && editor.open))
      return;
    const frame = requestAnimationFrame(() => {
      const target = readOnly
        ? reference.current?.querySelector<HTMLElement>('#open-history')
        : reference.current?.querySelector<HTMLElement>('#history-file');
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location, explicitReference, editor.context, editor.open, readOnly]);
  const analysis = useHistoryAnalysis();
  return (
    <section id={calendarReferenceAnchor} className="calendar-reference" ref={reference}>
      <div className="calendar-reference-heading">
        <FileText aria-hidden="true" />
        <h3 id="open-history" tabIndex={-1}>
          Usar calendário anterior
        </h3>
        <span className="calendar-reference-optional">Opcional</span>
      </div>
      <section id="history">
        <div className="history-area" id="history-area">
          <h4>PDFs de referência</h4>
          <p className="help">
            Consulte o calendário anterior para identificar atividades e datas do campus. Revise
            datas e fontes do ano atual antes de incluir.
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
                      <Notice tone="warning">
                        PDF original aguardando restauração pela administração.
                      </Notice>
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
    </section>
  );
}
