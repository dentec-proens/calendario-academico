import { longDate } from '#src/domain/date-labels.ts';
import type { CalendarEvent } from '#src/domain/calendar/model.ts';
import { saturdayOfferOptions } from '#src/domain/calendar/activities/saturdays.ts';
import { updateSaturdayActivity } from '#src/domain/calendar/commands/saturdays.ts';
import { labelFor } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Input } from '../forms/fields.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import SaturdayOfferChoice from './SaturdayOfferChoice.tsx';

export default function SaturdayEditForm({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: (focusDate: string) => void;
}) {
  const { state, session, readOnly, removeDate } = useCalendarEditor();
  const id = `saturday-edit:${event.id}`;
  const options = saturdayOfferOptions(state, event);
  // In the order of the options, so unchecking and checking again returns to the original value.
  const ordered = (offers: readonly string[]) =>
    options.map((option) => option.id).filter((offer) => offers.includes(offer));
  const saved = { name: event.name, offers: ordered(event.offers) };
  const { form, submit, pending, error, dirty } = useCalendarForm(
    id,
    saved,
    function apply(value) {
      session.apply((current) => updateSaturdayActivity(current, { id: event.id, ...value }));
      onClose(event.start);
    },
    { successMessage: () => `Sábado ${longDate(event.start)} atualizado.` },
  );
  function discard() {
    form.reset(saved);
    session.setFormDirty(id, false);
    onClose(event.start);
  }

  function remove() {
    if (removeDate(event.id)) discard();
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
        <form.Field name="offers">
          {(field) => (
            <SaturdayOfferChoice
              id="saturday-edit-offers"
              items={options.map((option) => {
                const checked = field.state.value.includes(option.id);
                // A listed offer can always be unchecked, which is how a stale list is corrected.
                const blocked = !option.inPeriod || Boolean(option.coveredBy);
                return {
                  id: option.id,
                  label: labelFor(state, option.id),
                  checked,
                  disabled: blocked && !checked,
                  ...(!option.inPeriod
                    ? { note: 'Sem período letivo nesta data.' }
                    : option.coveredBy
                      ? { note: `Já registrado nesta data: ${option.coveredBy}.` }
                      : {}),
                };
              })}
              onToggle={(offer, checked) =>
                field.handleChange(
                  ordered(
                    checked
                      ? [...field.state.value, offer]
                      : field.state.value.filter((item) => item !== offer),
                  ),
                )
              }
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
          <Button id="saturday-edit-remove" variant="danger" onClick={remove}>
            Remover
          </Button>
        </FormActions>
      </fieldset>
    </form>
  );
}
