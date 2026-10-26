import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { calendars } from '../../../shared/convex/calendars.ts';
import type { HistoryAnalysis } from '../types.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

function useAnalysis() {
  const { notify } = useCalendarEditor();
  const [value, setValue] = useState<{ historyId: string; analysis: HistoryAnalysis } | null>(null);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function analyze(historyId: string, reanalyze = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setStatus('Identificando datas e atividades…');
    try {
      const analysis = await (reanalyze
        ? calendars.reanalyzeHistory(historyId)
        : calendars.analyzeHistory(historyId));
      if (active.current) {
        setValue({ historyId, analysis });
        setStatus('Leitura concluída.');
      }
    } catch (cause) {
      if (active.current) {
        const message = cause instanceof Error ? cause.message : 'Não foi possível analisar o PDF.';
        setStatus(message);
        notify(message, true);
      }
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  async function selectAnalysis(historyId: string, analysisId: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await calendars.historyAnalysisVersions(historyId, analysisId);
      if (active.current && result.history.analysis)
        setValue({ historyId, analysis: result.history.analysis });
    } catch (cause) {
      if (active.current)
        notify(
          cause instanceof Error ? cause.message : 'Não foi possível consultar esta análise.',
          true,
        );
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return { value, status, pending, analyze, selectAnalysis };
}
const Context = createContext<ReturnType<typeof useAnalysis> | null>(null);
export function HistoryAnalysisProvider({ children }: PropsWithChildren) {
  return <Context.Provider value={useAnalysis()}>{children}</Context.Provider>;
}
export function useHistoryAnalysis() {
  const value = useContext(Context);
  if (!value) throw new Error('A leitura do PDF precisa da sessão do calendário.');
  return value;
}
