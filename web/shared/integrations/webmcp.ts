import { useEffect, useRef } from 'react';
import type { ActivityState } from '../../../src/domain-types.ts';
import type { evaluateCalendar } from '../../../src/evaluation.ts';

type Summary = {
  state: ActivityState;
  evaluation: ReturnType<typeof evaluateCalendar> | null;
  saved: boolean;
};
interface ModelContext {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, never> };
    execute: () => Promise<{ content: { type: 'text'; text: string }[] }>;
  }): void;
  unregisterTool?(name: string): void;
}

export function useCalendarSummaryTool(
  state: ActivityState,
  evaluation: Summary['evaluation'],
  saved: boolean,
) {
  const current = useRef<Summary>({ state, evaluation, saved });
  useEffect(() => {
    current.current = { state, evaluation, saved };
  }, [state, evaluation, saved]);
  useEffect(() => {
    const context = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!context) return;
    let active = true;
    context.registerTool({
      name: 'read_calendar_summary',
      description:
        'Consulta o resumo do calendário aplicado e indica se foi salvo. Não representa aprovação institucional.',
      inputSchema: { type: 'object', properties: {} },
      execute: () =>
        Promise.resolve({
          content: [
            {
              type: 'text',
              text: active
                ? JSON.stringify({
                    campus: current.current.state.campus,
                    year: current.current.state.year,
                    modalities: current.current.state.modalities,
                    periods: current.current.state.periods,
                    total: current.current.evaluation?.total ?? null,
                    saved: current.current.saved,
                    institutionalApproval: false,
                  })
                : 'A sessão do calendário foi encerrada.',
            },
          ],
        }),
    });
    return () => {
      active = false;
      context.unregisterTool?.('read_calendar_summary');
    };
  }, []);
}
