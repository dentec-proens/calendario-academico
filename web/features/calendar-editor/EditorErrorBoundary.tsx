import { CatchBoundary, Link, type ErrorComponentProps } from '@tanstack/react-router';
import type { PropsWithChildren } from 'react';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';

function EditorFailure({ reset }: ErrorComponentProps) {
  const { readOnly } = useCalendarEditor();
  return (
    <section className="panel">
      <h2>Não foi possível exibir esta parte do editor</h2>
      <Notice tone="warning" announce="assertive">
        O calendário e o preenchimento permanecem na mesma sessão. Tente abrir esta parte novamente
        ou saia pelo fluxo protegido.
      </Notice>
      <div className="actions">
        <Button type="button" onClick={reset}>
          Tentar novamente
        </Button>
        <Link to={readOnly ? '/revisoes' : '/calendarios'}>Sair do calendário</Link>
      </div>
    </section>
  );
}

/** Place below calendar, export and event-form ownership; never recreate their state. */
export function EditorErrorBoundary({ children }: PropsWithChildren) {
  return (
    <CatchBoundary getResetKey={() => 'editor-region'} errorComponent={EditorFailure}>
      {children}
    </CatchBoundary>
  );
}
