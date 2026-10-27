import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { calendars } from '../../../shared/convex/calendars.ts';
import { saveBlob } from '../../../shared/convex/files.ts';
import { confirmAction } from '../../../components/confirmation.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

function useExportController() {
  const { session, record, notify } = useCalendarEditor();
  const protection = useFormDrafts()?.protection;
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const download = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      download.current?.abort();
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
  const pdf = () =>
    run(async () => {
      const saved = await session.flush();
      if (!active.current) return;
      const file = await calendars.generatePdf(saved.id, {
        version: saved.version,
        catalogueRevision: saved.currentCatalogueRevision,
        copy: saved.purpose !== 'test' && !saved.readiness.ready,
      });
      if (!active.current) return;
      download.current = new AbortController();
      const response = await fetch(file.url, { signal: download.current.signal });
      if (!response.ok) throw new Error('Não foi possível baixar o PDF. Tente novamente.');
      const blob = await response.blob();
      if (!active.current) return;
      saveBlob(
        blob,
        `${saved.purpose === 'test' ? 'teste-' : !saved.readiness.ready ? 'proposta-' : ''}calendario-${saved.state.year}-v${saved.version}.pdf`,
      );
      notify('PDF gerado. Confira o arquivo antes do encaminhamento institucional.');
    });
  const print = () =>
    run(async () => {
      await session.flush();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (active.current) window.print();
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
  const makeDefinitive = () => {
    void confirmAction({
      title: 'Tornar calendário definitivo?',
      description:
        'Os dados e o histórico serão mantidos. Você poderá continuar editando o calendário.',
      consequence:
        'Isso não representa aprovação institucional. A geração definitiva exige a revisão prevista no sistema.',
      confirmLabel: 'Tornar definitivo',
      pendingLabel: 'Convertendo…',
      intent: 'primary',
      onConfirm: async () => {
        const saved = await session.flush();
        if (!active.current) throw new Error('A sessão de edição foi encerrada.');
        const definitive = await calendars.makeDefinitive(saved.id, saved.version);
        if (!active.current) return;
        session.confirmDefinitive(definitive);
        notify(
          'Calendário convertido para definitivo. Confira as pendências antes de gerar o PDF definitivo.',
        );
      },
    });
  };
  return { pending, pdf, print, copy, makeDefinitive, purpose: record.purpose };
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
