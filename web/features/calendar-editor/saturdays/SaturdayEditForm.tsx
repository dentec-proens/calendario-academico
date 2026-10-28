import { Trash2 } from 'lucide-react';
import type { CalendarActivity } from '../../../../src/domain-types.ts';
import { removeEvent, updateSaturdayActivity } from '../../../../src/calendar-edits/commands.ts';
import { confirmAction } from '../../../components/confirmation.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Input } from '../forms/fields.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

const fullDate = (date: string) => date.split('-').reverse().join('/');
const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');

export default function SaturdayEditForm({
  event,
  onClose,
}: {
  event: CalendarActivity;
  onClose: (focusDate: string) => void;
}) {
  const { state, session, institutional, readOnly, applyCommand } = useCalendarEditor();
  const id = `saturday-edit:${event.id}`;
  const { form, submit, pending, error, dirty } = useCalendarForm(
    id,
    { name: event.name, evidence: event.evidence },
    function apply(value) {
      session.apply((current) =>
        updateSaturdayActivity(current, { id: event.id, ...value }, institutional),
      );
      onClose(event.start);
    },
    { successMessage: () => `Sábado ${fullDate(event.start)} atualizado.` },
  );
  function discard() {
    form.reset({ name: event.name, evidence: event.evidence });
    session.setFormDirty(id, false);
    onClose(event.start);
  }
  const sameSource = state.events
    .filter(
      (item) =>
        item.id !== event.id && item.category === 'sabado' && item.evidence === event.evidence,
    )
    .map((item) => shortDate(item.start))
    .sort();

  async function remove() {
    const confirmed = await confirmAction({
      title: 'Remover sábado letivo',
      description: `O sábado ${fullDate(event.start)} deixa de contar como dia letivo.`,
      intent: 'danger',
      confirmLabel: 'Remover sábado',
    });
    if (confirmed && applyCommand((current) => removeEvent(current, event.id, institutional)))
      discard();
  }

  return (
    <form id="saturday-edit-form" onSubmit={submit}>
      <fieldset disabled={readOnly || pending}>
        <legend className="saturday-sr">Atividade do sábado {fullDate(event.start)}</legend>
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
        <form.Field name="evidence">
          {(field) => (
            <Input
              field={field}
              label="Fonte da decisão"
              id="saturday-edit-evidence"
              aria-describedby={sameSource.length ? 'saturday-edit-siblings' : undefined}
              maxLength={240}
              required
            />
          )}
        </form.Field>
        {sameSource.length > 0 && (
          <p id="saturday-edit-siblings" className="help">
            Mesma fonte também usada em {sameSource.join(', ')}.
          </p>
        )}
        <FormFeedback error={error} />
        <FormActions preserveOnClose={dirty}>
          <Button type="submit" id="saturday-edit-save">
            Aplicar alterações
          </Button>
          {dirty && (
            <Button id="saturday-edit-discard" variant="secondary" onClick={discard}>
              Descartar alterações
            </Button>
          )}
          <Button id="saturday-edit-remove" variant="danger" onClick={() => void remove()}>
            <Trash2 size={18} aria-hidden="true" /> Remover sábado
          </Button>
        </FormActions>
      </fieldset>
    </form>
  );
}
