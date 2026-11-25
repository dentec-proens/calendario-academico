import { useStore } from '@tanstack/react-form';
import { longDate } from '#src/domain/date-labels.ts';
import { civilDate, optionalCivilDate } from '../../../../src/domain/civil-date.ts';
import {
  calendarObservances,
  chooseObservance,
  observanceCoincidences,
  observanceEventId,
} from '#src/domain/calendar/observances.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input, Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { PanelFooter } from '../../../components/ui/Panel.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

function safeDate(value: string) {
  try {
    return optionalCivilDate(value);
  } catch {
    return undefined;
  }
}

export default function ObservanceForm({
  observanceKey,
  onClose,
}: {
  observanceKey: string;
  onClose: () => void;
}) {
  const { state, record, events, session, readOnly, notify } = useCalendarEditor();
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
  const selected = safeDate(useStore(form.store, (current) => current.values.date));
  const coincidences =
    entry?.rule && selected
      ? observanceCoincidences(events, state, observanceEventId(entry.rule), selected)
      : [];
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
                {(field) => {
                  const allowed = entry.rule!.allowed;
                  const label = `${entry.label} neste calendário`;
                  const id = `observance-date-${observanceKey}`;
                  if (allowed.kind === 'range')
                    return (
                      <Input
                        field={field}
                        label={label}
                        id={id}
                        type="date"
                        min={allowed.start}
                        max={allowed.end}
                        aria-describedby={`observance-help-${observanceKey}`}
                        required
                      />
                    );
                  return (
                    <Select field={field} label={label} id={id} required>
                      {!allowed.dates.some((date) => date === field.state.value) && (
                        <option value={field.state.value}>
                          Escolha registrada: {field.state.value && longDate(field.state.value)}
                        </option>
                      )}
                      {allowed.dates.map((date) => (
                        <option key={date} value={date}>
                          {longDate(date)}
                          {date === reference ? ' — data institucional' : ''}
                        </option>
                      ))}
                    </Select>
                  );
                }}
              </form.Field>
              {coincidences.length > 0 && (
                <Notice tone="info" id={`observance-coincidence-${observanceKey}`}>
                  Nesta data já não há aula ({coincidences.join('; ')}). A escolha é permitida, mas
                  o {entry.label} não retira nenhum dia letivo.
                </Notice>
              )}
              {entry.rule.allowed.kind === 'range' && (
                <p className="help" id={`observance-help-${observanceKey}`}>
                  Data institucional: {longDate(reference)}.{' '}
                  {entry.rule.guidance ??
                    `Escolha uma data de ${longDate(entry.rule.allowed.start)} a ${longDate(entry.rule.allowed.end)}.`}
                </p>
              )}
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
