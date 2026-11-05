import { civilDate } from '../../../../src/domain/civil-date.ts';
import { calendarObservances, chooseObservance } from '#src/domain/calendar/observances.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

const dateLabel = (date: string) => date.split('-').reverse().join('/');

export default function ObservanceForm({
  observanceKey,
  onClose,
}: {
  observanceKey: string;
  onClose: () => void;
}) {
  const { state, record, session, readOnly } = useCalendarEditor();
  const entry = calendarObservances(record.institutionalEvents, state).find(
    (item) => item.key === observanceKey,
  );
  const reference = entry?.event?.originalStart ?? entry?.event?.start ?? '';
  const date = state.observanceDates?.[observanceKey] ?? reference;
  const formId = `observance:${observanceKey}`;
  const applyDate = (selected: string | undefined) => {
    session.apply((current) =>
      chooseObservance(
        current,
        observanceKey,
        selected === undefined ? undefined : civilDate(selected),
        record.institutionalEvents,
      ),
    );
  };
  const { form, submit, error, dirty, pending } = useCalendarForm(formId, { date }, (value) =>
    applyDate(value.date),
  );
  return (
    <form id={`observance-form-${observanceKey}`} onSubmit={submit}>
      <fieldset disabled={readOnly || pending}>
        {entry?.rule && entry.event ? (
          <>
            <form.Field name="date">
              {(field) => (
                <Select
                  field={field}
                  label={`${entry.label} neste calendário`}
                  id={`observance-date-${observanceKey}`}
                  required
                >
                  {!entry.rule!.allowedDates.some((date) => date === field.state.value) && (
                    <option value={field.state.value}>
                      Escolha registrada: {field.state.value}
                    </option>
                  )}
                  {entry.rule!.allowedDates.map((allowed) => (
                    <option key={allowed} value={allowed}>
                      {dateLabel(allowed)}
                      {allowed === reference ? ' — data institucional' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </form.Field>
          </>
        ) : (
          <Notice tone="warning">
            Esta observância não está disponível na base atual. Restaure a data institucional para
            limpar a escolha registrada.
          </Notice>
        )}
        <FormFeedback error={error} />
        <FormActions>
          {entry?.rule && entry.event && (
            <Button type="submit" id={`apply-observance-${observanceKey}`}>
              Aplicar data
            </Button>
          )}
          <Button
            variant="secondary"
            id={`reset-observance-${observanceKey}`}
            onClick={() => {
              applyDate(undefined);
              form.reset({ date: reference });
              session.setFormDirty(formId, false);
            }}
          >
            Restaurar data institucional
          </Button>
          {dirty && (
            <Button
              variant="secondary"
              id={`discard-observance-${observanceKey}`}
              onClick={() => {
                form.reset({ date });
                session.setFormDirty(formId, false);
                onClose();
              }}
            >
              Descartar alterações
            </Button>
          )}
        </FormActions>
      </fieldset>
    </form>
  );
}
