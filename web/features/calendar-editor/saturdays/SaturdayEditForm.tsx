import { longDate } from '#src/domain/date-labels.ts';
import type { CalendarEvent } from '#src/domain/calendar/model.ts';
import { removeEvent } from '#src/domain/calendar/commands/events.ts';
import { updateSaturdayActivity } from '#src/domain/calendar/commands/saturdays.ts';
import { confirmAction } from '../../../components/confirmation.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Input } from '../forms/fields.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function SaturdayEditForm({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: (focusDate: string) => void;
}) {
  const { session, readOnly, applyCommand } = useCalendarEditor();
  const id = `saturday-edit:${event.id}`;
  const { form, submit, pending, error, dirty } = useCalendarForm(
    id,
    { name: event.name },
    function apply(value) {
      session.apply((current) => updateSaturdayActivity(current, { id: event.id, ...value }));
      onClose(event.start);
    },
    { successMessage: () => `Sábado ${longDate(event.start)} atualizado.` },
  );
  function discard() {
    form.reset({ name: event.name });
    session.setFormDirty(id, false);
    onClose(event.start);
  }

  async function remove() {
    const confirmed = await confirmAction({
      title: 'Remover sábado letivo',
      description: `O sábado ${longDate(event.start)} deixa de contar como dia letivo.`,
      intent: 'danger',
      confirmLabel: 'Remover sábado',
    });
    if (confirmed && applyCommand((current) => removeEvent(current, event.id))) discard();
  }

  return (
    <form id="saturday-edit-form" onSubmit={submit}>
      <fieldset disabled={readOnly || pending}>
        <legend className="saturday-sr">Atividade do sábado {longDate(event.start)}</legend>
        <form.Field name="name">
          {(field) => (
            <Input
              field={field}
              label="Atividade"
              id="saturday-edit-name"
              maxLength={160}
              required
            />
          )}
        </form.Field>
        <FormFeedback error={error} />
        <FormActions>
          <Button type="submit" id="saturday-edit-save">
            Aplicar
          </Button>
          {dirty && (
            <Button id="saturday-edit-discard" variant="secondary" onClick={discard}>
              Descartar alterações
            </Button>
          )}
          <Button id="saturday-edit-remove" variant="danger" onClick={() => void remove()}>
            Remover
          </Button>
        </FormActions>
      </fieldset>
    </form>
  );
}
