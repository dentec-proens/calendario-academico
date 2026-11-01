import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { CircleAlert, Pencil } from 'lucide-react';
import { identityLimits, type CalendarIdentity } from '#src/domain/calendar/identity.ts';
import { calendarName } from '#src/domain/calendar/label.ts';
import { PanelDialog, PanelHeader } from '../../../components/ui/Panel.tsx';
import { TextAreaField, TextField } from '../../../components/ui/Field.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { calendars } from '../../../shared/convex/calendars.ts';
import { useAppSession } from '../../../app/session.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

const IdentityPanelContext = createContext<(() => void) | null>(null);

/** Opens the identity panel from the header or from the review issues. */
export function useIdentityPanel() {
  const open = useContext(IdentityPanelContext);
  if (!open) throw new Error('Abra um calendário para continuar.');
  return open;
}

// Inside the calendar draft scope, so leaving or reopening the calendar also discards it.
const identityDraftKey = (calendarId: string) => `calendar:${calendarId}:identity`;
const noSubscription = () => () => {};

export function IdentityPanelProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { editorRecovery, maintenance } = useAppSession();
  const { record, session } = useCalendarEditor();
  const paused = Boolean(editorRecovery || maintenance);
  const show = useMemo(() => () => setOpen(true), []);
  // An unsaved identity, even with the panel closed, is unapplied work: it blocks the submission.
  const drafts = useFormDrafts();
  const editing = useSyncExternalStore(
    drafts?.subscribe ?? noSubscription,
    () => Boolean(drafts?.isEditing(identityDraftKey(record.id))),
    () => false,
  );
  useEffect(() => {
    session.setFormDirty('identity', editing);
  }, [session, editing]);
  return (
    <IdentityPanelContext.Provider value={show}>
      {children}
      {/* Mounted only while open; an unsaved identity stays in the form drafts. */}
      {open && !paused ? (
        <PanelDialog
          id="identity-panel"
          className="ui-panel-dialog--side"
          open
          aria-labelledby="identity-panel-title"
          onClose={() => setOpen(false)}
          returnFocus={() => document.getElementById('calendar-identity-edit')}
        >
          <PanelHeader
            title="Identificação"
            titleId="identity-panel-title"
            closeId="identity-panel-close"
            onClose={() => setOpen(false)}
          />
          <IdentityForm onSaved={() => setOpen(false)} />
        </PanelDialog>
      ) : null}
    </IdentityPanelContext.Provider>
  );
}

/** Courses, classes and shifts under the title, with the way to fill or change them. */
export function IdentitySummary() {
  const { record, readOnly } = useCalendarEditor();
  const open = useIdentityPanel();
  const details = [record.courses, record.classes, record.shifts].filter(Boolean).join(' · ');
  return (
    <p id="calendar-identity" className="editor-identity">
      {record.courses ? (
        <span>{details}</span>
      ) : (
        <span className="editor-identity-missing">
          <CircleAlert aria-hidden="true" size={16} /> Cursos não informados
        </span>
      )}
      {readOnly ? null : (
        <button
          id="calendar-identity-edit"
          type="button"
          className="editor-identity-edit"
          aria-label={record.courses ? 'Editar identificação do calendário' : undefined}
          onClick={open}
        >
          {record.courses ? (
            <>
              <Pencil aria-hidden="true" size={14} /> Editar
            </>
          ) : (
            'Informar cursos'
          )}
        </button>
      )}
    </p>
  );
}

function IdentityForm({ onSaved }: { onSaved: () => void }) {
  const { record } = useCalendarEditor();
  const identity: CalendarIdentity = {
    courses: record.courses,
    classes: record.classes,
    shifts: record.shifts,
    label: record.label ?? '',
  };
  // `expected` keeps the identity this edit started from, even when resumed from a draft.
  const saved = { ...identity, expected: identity };
  const { form, values, dirty, pending, error, submit, clearDraft } = useDraftForm({
    draftKey: identityDraftKey(record.id),
    defaultValues: saved,
    nonEditingFields: ['expected'],
    onSubmit: async ({ expected, ...body }, { isCurrent }) => {
      await calendars.updateIdentity(record.id, { expected, body });
      if (!isCurrent()) return;
      clearDraft();
      onSaved();
    },
  });
  const campus = record.state.campus;
  return (
    <form id="identity-form" onSubmit={submit}>
      <p className="help">
        Editável enquanto o calendário for rascunho ou estiver devolvido. Os cursos são exigidos
        para enviar à PROENS.
      </p>
      <fieldset className="form-fields" disabled={pending}>
        <TextAreaField
          id="calendar-courses"
          name="courses"
          label="Cursos"
          description="Separe os cursos por vírgulas. Ex.: Técnico em Informática, Técnico em Administração."
          rows={2}
          maxLength={identityLimits.courses}
          value={values.courses}
          onValueChange={(value) => form.setFieldValue('courses', value)}
        />
        <TextField
          id="calendar-classes"
          name="classes"
          label={
            <>
              Turmas <span className="field-optional">(opcional)</span>
            </>
          }
          description="Ex.: 1º ano A, 2º ano A, 3º ano B."
          maxLength={identityLimits.classes}
          value={values.classes}
          onValueChange={(value) => form.setFieldValue('classes', value)}
        />
        <TextField
          id="calendar-shifts"
          name="shifts"
          label={
            <>
              Turnos <span className="field-optional">(opcional)</span>
            </>
          }
          description="Ex.: matutino, vespertino, noturno."
          maxLength={identityLimits.shifts}
          value={values.shifts}
          onValueChange={(value) => form.setFieldValue('shifts', value)}
        />
        <TextField
          id="calendar-label"
          name="label"
          label={
            <>
              Apelido do rascunho <span className="field-optional">(opcional)</span>
            </>
          }
          description={`Diferencia rascunhos do mesmo campus e ano. ${values.label.trim() ? `O nome fica: ${calendarName(record.year, campus, values.label)}.` : 'Ex.: Proposta com recesso em julho.'}`}
          maxLength={identityLimits.label}
          value={values.label}
          onValueChange={(value) => form.setFieldValue('label', value)}
        />
        <FormActions preserveOnClose>
          <Button type="submit" pending={pending} loadingLabel="Salvando…">
            Salvar identificação
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
