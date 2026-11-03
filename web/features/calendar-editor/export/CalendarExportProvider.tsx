import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { saveBlob } from '../../../shared/convex/files.ts';
import { fileNamePrefix } from '#src/domain/calendar/lifecycle.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import type { PrintVersion } from '#src/printing/calendar-layout.ts';

function useExportController() {
  const { session, record, notify, baseUpdate, readOnly } = useCalendarEditor();
  const protection = useFormDrafts()?.protection;
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(operation: () => Promise<void>) {
    if (busy.current || !active.current || protection?.locked) return;
    const token = protection?.begin();
    busy.current = true;
    setPending(true);
    try {
      await operation();
    } catch (cause) {
      if (!active.current) return;
      notify(
        cause instanceof Error ? cause.message : 'Não foi possível concluir a exportação.',
        true,
      );
    } finally {
      if (token) protection?.finish(token);
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  /** Prints the preview; the complete version (with internal dates) suggests its own file name. */
  const print = (version: PrintVersion = 'official') =>
    run(async () => {
      if (!readOnly && !baseUpdate.compatible)
        throw new Error('Incorpore a atualização da base institucional antes de imprimir.');
      const saved = await session.flush();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!active.current) return;
      // The browser suggests the document title as the name of the saved PDF.
      const title = document.title;
      document.title = `${fileNamePrefix(saved.status)}calendario-${saved.state.year}-v${saved.version}${version === 'complete' ? '-completo' : ''}`;
      window.addEventListener('afterprint', () => (document.title = title), { once: true });
      window.print();
    });
  const copy = () => {
    if (!active.current || protection?.locked) return;
    const applied = session.getSnapshot().state;
    saveBlob(
      new Blob([JSON.stringify(applied, null, 2)], { type: 'application/json' }),
      `rascunho-calendario-${applied.year}.json`,
    );
    notify('Download solicitado. Somente dados aplicados foram incluídos.');
  };
  return { pending, print, copy, status: record.status };
}

const ExportContext = createContext<ReturnType<typeof useExportController> | null>(null);
export function CalendarExportProvider({ children }: PropsWithChildren) {
  return <ExportContext.Provider value={useExportController()}>{children}</ExportContext.Provider>;
}
export function useCalendarExport() {
  const context = useContext(ExportContext);
  if (!context) throw new Error('A exportação precisa da sessão do calendário.');
  return context;
}
