import { longDate } from '#src/domain/date-labels.ts';
import { civilDate } from '../../../../src/domain/civil-date.ts';
import { calendarObservances, chooseObservance } from '#src/domain/calendar/observances.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { PanelFooter } from '../../../components/ui/Panel.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

export default function ObservanceForm({
  observanceKey,
  onClose,
}: {
  observanceKey: string;
  onClose: () => void;
}) {
  const { state, record, session, readOnly, notify } = useCalendarEditor();
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
  const label = entry?.label ?? 'A observância';
  const { form, submit, error, dirty, pending } = useCalendarForm(
    formId,
    { date },
    (value) => applyDate(value.date),
    {
      successMessage: (value) => `${label}: ${longDate(value.date)} neste calendário.`,
      onSubmit: onClose,
    },
  );
  function restore() {
    try {
      applyDate(undefined);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Não foi possível restaurar a data.', true);
      return;
    }
    form.reset({ date: reference });
    session.setFormDirty(formId, false);
    notify(`${label}: de volta à data institucional.`);
    onClose();
  }
  return (
    <form id={`observance-form-${observanceKey}`} className="ui-panel-view" onSubmit={submit}>
      <fieldset className="ui-panel-view" disabled={readOnly || pending}>
        <div className="ui-panel-view__body">
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
                        Escolha registrada: {field.state.value && longDate(field.state.value)}
                      </option>
                    )}
                    {entry.rule!.allowedDates.map((allowed) => (
                      <option key={allowed} value={allowed}>
                        {longDate(allowed)}
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
        </div>
        <PanelFooter feedback={<FormFeedback error={error} />}>
          {entry?.rule && entry.event && (
            <Button type="submit" id={`apply-observance-${observanceKey}`}>
              Aplicar data
            </Button>
          )}
          <Button variant="secondary" id={`reset-observance-${observanceKey}`} onClick={restore}>
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
        </PanelFooter>
      </fieldset>
    </form>
  );
}
