import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { FileText, ChevronDown } from 'lucide-react';
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
  const reference = useRef<HTMLDetailsElement>(null);
  const previousEntry = useRef<typeof location | null>(null);
  const explicitReference = isCalendarReferenceHash(location.hash);
  const historicalDraft = editor.context?.kind === 'history';
  useEffect(() => {
    const entered = previousEntry.current !== location;
    if (!explicitReference && !historicalDraft) {
      previousEntry.current = location;
      return;
    }
    if (reference.current) reference.current.open = true;
    if (!entered || (!explicitReference && !editor.open)) {
      previousEntry.current = location;
      return;
    }
    const frame = requestAnimationFrame(() => {
      previousEntry.current = location;
      const target =
        historicalDraft && editor.open
          ? reference.current?.querySelector<HTMLElement>('#event-form-title')
          : !historicalDraft && !readOnly
            ? reference.current?.querySelector<HTMLElement>('#history-file')
            : reference.current?.querySelector<HTMLElement>(':scope > summary');
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location, explicitReference, historicalDraft, editor.open, readOnly]);
  const analysis = useHistoryAnalysis();
  return (
    <details id={calendarReferenceAnchor} className="calendar-reference" ref={reference}>
      <summary id="open-history" data-view="history">
        <FileText aria-hidden="true" />
        <span>
          <strong>Usar calendário anterior</strong>
          <small>Referência opcional para atividades e datas</small>
        </span>
        <span className="calendar-reference-optional">Opcional</span>
        <ChevronDown className="calendar-reference-chevron" aria-hidden="true" />
      </summary>
      <section id="history">
        <div className="panel history-area" id="history-area">
          <h3>PDFs de referência</h3>
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
    </details>
  );
}
