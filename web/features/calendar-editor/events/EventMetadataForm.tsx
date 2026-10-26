import { categories, eventCategory } from '../../../../src/categories.ts';
import { activityChecklist } from '../../../../src/obligations.ts';
import { applyEvent } from '../../../../src/calendar-edits/commands.ts';
import type { CalendarEvent } from '../types.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Select } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function EventMetadataForm({ event }: { event: CalendarEvent }) {
  const { state, session, institutional, readOnly } = useCalendarEditor();
  const { form, submit, error } = useCalendarForm(
    `event-metadata:${event.id}`,
    { category: eventCategory(event), requirementId: event.requirementId || '' },
    function apply(value) {
      session.apply((current) => {
        const saved = current.events.find((item) => item.id === event.id);
        if (!saved) throw new Error('O evento não existe mais. Reabra o calendário.');
        return applyEvent(
          current,
          {
            ...saved,
            modalities: saved.modalities?.length ? saved.modalities : current.modalities,
            category: value.category,
            requirementId: value.requirementId || undefined,
            assessmentAutoStart: undefined,
          },
          institutional,
          true,
        );
      });
    },
  );
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly}>
        <form.Field name="category">
          {(field) => (
            <Select field={field} label="Categoria e cor" data-category-event={event.id}>
              {categories.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </form.Field>
        <form.Field name="requirementId">
          {(field) => (
            <Select field={field} label="Atividade do roteiro" data-link-activity={event.id}>
              <option value="">Sem vínculo</option>
              {activityChecklist(state).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </form.Field>
        <button type="submit">Aplicar categoria e vínculo</button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
