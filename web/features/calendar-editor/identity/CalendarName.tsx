import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { Pencil } from 'lucide-react';
import { calendarName, maximumLabelLength } from '#src/domain/calendar/label.ts';
import { PanelDialog, PanelHeader } from '../../../components/ui/Panel.tsx';
import { TextField } from '../../../components/ui/Field.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { calendars } from '../../../shared/convex/calendars.ts';
import { useAppSession } from '../../../app/session.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useUnappliedDraft } from './useUnappliedDraft.ts';

// Inside the calendar draft scope, so leaving or reopening the calendar also discards it.
const nameDraftKey = (calendarId: string) => `calendar:${calendarId}:name`;

const NamePanelContext = createContext<{ show: () => void; renames: boolean } | null>(null);

/** Opens the name panel from the title or from the review issues, when the name may change. */
export function useNamePanel() {
  const panel = useContext(NamePanelContext);
  if (!panel) throw new Error('Abra um calendário para continuar.');
  return panel;
}

export function NamePanelProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { editorRecovery, maintenance } = useAppSession();
  const { record, readOnly, locked, role } = useCalendarEditor();
  const paused = Boolean(editorRecovery || maintenance);
  // The name is outside the submitted content: the administration corrects it in any state.
  const renames = !readOnly || (role === 'ADMIN' && locked && !paused);
  const panel = useMemo(() => ({ show: () => setOpen(true), renames }), [renames]);
  // An unsaved name, even with the panel closed, is unapplied work: it blocks the submission.
  useUnappliedDraft('name', nameDraftKey(record.id));
  return (
    <NamePanelContext.Provider value={panel}>
      {children}
      {/* Mounted only while open; an unsaved name stays in the form drafts. */}
      {open && !paused ? (
        <PanelDialog
          id="name-panel"
          className="ui-panel-dialog--side"
          open
          aria-labelledby="name-panel-title"
          onClose={() => setOpen(false)}
          returnFocus={() => document.getElementById('calendar-rename')}
        >
          <PanelHeader
            title="Nome do calendário"
            titleId="name-panel-title"
            closeId="name-panel-close"
            onClose={() => setOpen(false)}
          />
          <NameForm onSaved={() => setOpen(false)} />
        </PanelDialog>
      ) : null}
    </NamePanelContext.Provider>
  );
}

/** The calendar name as the page title, with the way to change its label while editable. */
export function CalendarTitle() {
  const { record } = useCalendarEditor();
  const { show, renames } = useNamePanel();
  return (
    <div className="editor-title-row">
      <h1 id="record-title" tabIndex={-1}>
        {record.name}
      </h1>
      {renames ? (
        <button
          id="calendar-rename"
          type="button"
          className="editor-inline-action"
          aria-label="Renomear calendário"
          onClick={show}
        >
          <Pencil aria-hidden="true" size={14} /> Renomear
        </button>
      ) : null}
    </div>
  );
}

function NameForm({ onSaved }: { onSaved: () => void }) {
  const { record } = useCalendarEditor();
  const label = record.label ?? '';
  // `expected` keeps the label this edit started from, even when resumed from a draft.
  const saved = { label, expected: label };
  const { form, values, dirty, pending, error, submit, clearDraft } = useDraftForm({
    draftKey: nameDraftKey(record.id),
    defaultValues: saved,
    nonEditingFields: ['expected'],
    onSubmit: async ({ expected, label }, { isCurrent }) => {
      await calendars.rename(record.id, { expected, label });
      if (!isCurrent()) return;
      clearDraft();
      onSaved();
    },
  });
  const campus = record.state.campus;
  return (
    <form id="name-form" onSubmit={submit}>
      <p className="help">
        O ano letivo e o campus fazem parte do nome e não mudam. O complemento é obrigatório e
        distingue este calendário dos demais do mesmo campus e ano; acompanha o calendário na
        análise, na publicação e nas novas versões.
      </p>
      <fieldset className="form-fields" disabled={pending}>
        <TextField
          id="calendar-label"
          name="label"
          label="Complemento do nome"
          description="Ex.: Cursos bimestrais. Não pode repetir o de outro calendário do campus no mesmo ano."
          required
          maxLength={maximumLabelLength}
          value={values.label}
          onValueChange={(value) => form.setFieldValue('label', value)}
        />
        <p className="editor-name-preview" aria-live="polite">
          <span>O nome fica:</span>{' '}
          <strong>{calendarName(record.year, campus, values.label)}</strong>
        </p>
        <FormActions>
          <Button type="submit" pending={pending} loadingLabel="Salvando…">
            Salvar nome
          </Button>
          {dirty ? (
            <Button type="button" variant="secondary" onClick={() => form.reset(saved)}>
              Descartar alterações
            </Button>
          ) : null}
        </FormActions>
      </fieldset>
      <FormFeedback error={error} />
    </form>
  );
}
