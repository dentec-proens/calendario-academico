import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, type FormEvent } from 'react';
import { civilDate, type CivilDate } from '#src/domain/civil-date.ts';
import { compactRange } from '#src/domain/date-labels.ts';
import { activityPlan } from '#src/domain/calendar/activities/plan.ts';
import {
  coincidentDays,
  defaultSchoolVacationName,
  startsDecemberVacation,
  vacationDates,
  vacationDays,
  vacationKinds,
  vacationRef,
  type VacationKind,
} from '#src/domain/calendar/activities/vacations.ts';
import { sameActivity } from '#src/domain/calendar/activities/activity-ref.ts';
import {
  copySchoolVacationsToTeachers,
  saveVacationPeriod,
} from '#src/domain/calendar/commands/vacations.ts';
import { durationEnd } from '#src/domain/calendar/counting/duration.ts';
import { vacationRemovedDays } from '#src/domain/calendar/counting/vacation-days.ts';
import type { CalendarEvent } from '#src/domain/calendar/model.ts';
import { labelFor, offerIds, offerNames } from '#src/domain/calendar/offers.ts';
import { Button } from '../../../components/ui/Button.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import SaturdayOfferChoice from '../saturdays/SaturdayOfferChoice.tsx';
import '../saturdays/saturdays.css';
import { editorNavigation } from '../editor-steps.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { Input } from './fields.tsx';
import { useCalendarForm } from './useCalendarForm.ts';

interface VacationValues {
  /** The list the form is open in; empty while it is closed. */
  kind: '' | VacationKind;
  /** The period being edited; empty for a new one. */
  id: string;
  name: string;
  start: string;
  days: string;
  end: string;
  offers: string[];
}

const closed: VacationValues = {
  kind: '',
  id: '',
  name: '',
  start: '',
  days: '',
  end: '',
  offers: [],
};
// Which list is open says nothing about values not applied yet.
const browsingFields = ['kind', 'id'] as const;

const copy: Record<VacationKind, { title: string; help: string }> = {
  school: {
    title: 'Férias escolares',
    help: 'Não há número fixo de períodos: basta que cada oferta tenha férias.',
  },
  teacher: {
    title: 'Férias docentes',
    help: 'Únicas para todo o campus: valem para todas as ofertas do calendário.',
  },
};

const parsed = (value: string): CivilDate | undefined => {
  try {
    return civilDate(value);
  } catch {
    return undefined;
  }
};

/** Says nothing about an offer that loses no day: only what the period takes from the count. */
function RemovedDays({ removed }: { removed: ReturnType<typeof vacationRemovedDays> }) {
  const { state } = useCalendarEditor();
  const affected = removed?.filter(({ days }) => days > 0) ?? [];
  if (!affected.length) return null;
  const amount = (days: number) => `${days} ${days === 1 ? 'dia letivo' : 'dias letivos'}`;
  return (
    <p className="help">
      Retira{' '}
      {offerIds(state).length === 1
        ? amount(affected[0]!.days)
        : affected
            .map(({ offerId, days }) => `${amount(days)} de ${labelFor(state, offerId)}`)
            .join(' · ')}
    </p>
  );
}

export default function VacationsForm() {
  const { state, events, record, session, readOnly, removeDate, notify } = useCalendarEditor();
  const navigate = useNavigate();
  const next = editorNavigation('vacations').next;
  const continuing = useRef(false);
  const { form, values, submit, error, dirty } = useCalendarForm<VacationValues>(
    'vacations',
    closed,
    function apply(value) {
      // The Continue button also submits a form with values typed in a list left open.
      const kind = value.kind;
      if (!kind) return closed;
      const start = parsed(value.start),
        end = parsed(value.end);
      if (!start || !end) throw new Error('Informe início e término do período.');
      session.apply((current) =>
        saveVacationPeriod(current, kind, {
          id: value.id || crypto.randomUUID(),
          start,
          end,
          ...(kind === 'school' ? { name: value.name, offers: value.offers } : {}),
        }),
      );
      return closed;
    },
    {
      nonEditingFields: browsingFields,
      successMessage: () => 'Período de férias aplicado.',
      onSubmit: () => {
        if (continuing.current && next)
          void navigate({
            to: next.path,
            params: { calendarId: record.id },
            search: (previous) => previous,
          });
      },
    },
  );
  // Days and end describe the same thing: each follows the other while the person types.
  useEffect(() => {
    if (!values.days || !values.start) return;
    try {
      const end = durationEnd(values.start, values.days);
      if (end !== form.state.values.end) form.setFieldValue('end', end);
    } catch {
      /* The field stays as typed until the value is a duration. */
    }
  }, [form, values.days, values.start]);
  // A period gone while being edited (its offer removed, an undone copy) has no form to show.
  const gone = Boolean(values.id) && !state.events.some((event) => event.id === values.id);
  useEffect(() => {
    if (!gone) return;
    form.reset(closed);
    session.setFormDirty('vacations', false);
  }, [form, gone, session]);
  const opened = useRef({ kind: '', id: '' });
  useEffect(() => {
    const previous = opened.current;
    opened.current = { kind: values.kind, id: values.id };
    if (values.kind === previous.kind && values.id === previous.id) return;
    if (values.kind) document.getElementById('vacation-start')?.focus();
    // The button that closed the form is gone: the focus returns to what opened it.
    else if (previous.kind)
      (
        document.querySelector<HTMLElement>(`[data-edit-vacation="${previous.id}"]`) ??
        document.getElementById(`vacation-add-${previous.kind}`)
      )?.focus();
  }, [values.kind, values.id]);

  function openNew(kind: VacationKind) {
    form.reset({
      ...closed,
      kind,
      ...(kind === 'school' ? { name: defaultSchoolVacationName, offers: offerIds(state) } : {}),
    });
  }
  function openPeriod(kind: VacationKind, event: CalendarEvent) {
    form.reset({
      kind,
      id: event.id,
      name: event.name,
      start: event.start,
      days: String(vacationDays([event])),
      end: event.end,
      offers: offerIds(state).filter((offer) => event.offers.includes(offer)),
    });
  }
  function close() {
    form.reset(closed);
    session.setFormDirty('vacations', false);
  }

  const start = parsed(values.start),
    end = parsed(values.end);
  const preview =
    start && end && start <= end
      ? {
          id: values.id,
          start,
          end,
          offers: values.kind === 'school' ? values.offers : offerIds(state),
        }
      : undefined;

  const periodForm = (kind: VacationKind) => (
    <form
      id="vacation-form"
      aria-label={`Período de ${copy[kind].title.toLocaleLowerCase('pt-BR')}`}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        // The step's Continue button submits this form from outside it.
        const { submitter } = event.nativeEvent as SubmitEvent;
        continuing.current = submitter?.id === 'editor-continue';
        submit(event);
      }}
    >
      <fieldset disabled={readOnly}>
        {kind === 'school' && (
          <form.Field name="name">
            {(field) => (
              <Input field={field} label="Descrição" id="vacation-name" maxLength={160} required />
            )}
          </form.Field>
        )}
        <div className="row-form">
          <form.Field name="start">
            {(field) => (
              <Input
                field={field}
                label="Início"
                id="vacation-start"
                type="date"
                min={`${state.year}-01-01`}
                max={`${state.year}-12-31`}
                required
              />
            )}
          </form.Field>
          <form.Field name="days">
            {(field) => (
              <Input
                field={field}
                label="Dias corridos"
                aria-label="Quantidade de dias corridos"
                className="vacation-day-count"
                id="vacation-days"
                type="number"
                min="1"
                max="366"
                step="1"
              />
            )}
          </form.Field>
          <form.Field name="end">
            {(field) => (
              <label>
                Término
                <input
                  name={field.name}
                  id="vacation-end"
                  type="date"
                  min={`${state.year}-01-01`}
                  max={`${state.year}-12-31`}
                  required
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    const typed = parsed(event.target.value);
                    form.setFieldValue(
                      'days',
                      typed && start && start <= typed
                        ? String(vacationDays([{ start, end: typed }]))
                        : '',
                    );
                    field.handleChange(event.target.value);
                  }}
                />
              </label>
            )}
          </form.Field>
        </div>
        <p className="help">
          Se as férias continuam no ano seguinte, termine em 31/12 e registre o restante no
          calendário daquele ano.
        </p>
        {kind === 'school' && (
          <form.Field name="offers">
            {(field) => (
              <SaturdayOfferChoice
                id="vacation-offers"
                items={offerIds(state).map((offer) => ({
                  id: offer,
                  label: labelFor(state, offer),
                  checked: field.state.value.includes(offer),
                  disabled: false,
                }))}
                onToggle={(offer, checked) =>
                  field.handleChange(
                    offerIds(state).filter((id) =>
                      id === offer ? checked : field.state.value.includes(id),
                    ),
                  )
                }
              />
            )}
          </form.Field>
        )}
        <div id="vacation-preview" role="status">
          {preview && <RemovedDays removed={vacationRemovedDays(state, events, preview)} />}
        </div>
      </fieldset>
      <FormFeedback error={error} />
      <FormActions>
        <Button type="submit" id="vacation-apply" disabled={readOnly}>
          Aplicar período
        </Button>
        <Button id="vacation-discard" variant="secondary" onClick={close}>
          Descartar
        </Button>
      </FormActions>
    </form>
  );

  const periodLine = (kind: VacationKind, event: CalendarEvent) => (
    <li key={event.id} className="vacation-period" data-vacation-period={event.id}>
      {values.kind === kind && values.id === event.id ? (
        periodForm(kind)
      ) : (
        <>
          <div>
            {kind === 'school' && <strong>{event.name}</strong>}
            <p>
              {compactRange(event, state.year)} · {vacationDays([event])}{' '}
              {vacationDays([event]) === 1 ? 'dia' : 'dias'}
              {startsDecemberVacation(event, state.year) && ' · até o fim do ano'}
            </p>
            {kind === 'school' && offerIds(state).length > 1 && (
              <p className="help">Vale para: {offerNames(state, event.offers)}</p>
            )}
            <RemovedDays removed={vacationRemovedDays(state, events, event)} />
          </div>
          {!readOnly && (
            <div className="vacation-period-actions">
              <Button
                data-edit-vacation={event.id}
                variant="secondary"
                disabled={dirty}
                onClick={() => openPeriod(kind, event)}
              >
                Editar
              </Button>
              <Button
                data-remove-vacation={event.id}
                variant="danger"
                disabled={dirty}
                onClick={() => removeDate(event.id)}
              >
                Remover
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );

  const teacherPlan = activityPlan(state).find((row) =>
    sameActivity(row.activity, vacationRef('teacher')),
  );
  const teacherDates = vacationDates(state.events, 'teacher');
  const schoolDates = vacationDates(state.events, 'school');
  const total = vacationDays(teacherDates);
  const exact = teacherPlan?.exactDays;
  const coincidence = offerIds(state).map((offer) => ({
    offer,
    days: coincidentDays(state.events, offer),
  }));
  const sameCoincidence = new Set(coincidence.map(({ days }) => days)).size === 1;
  // Each distinct set of school periods is one source; usually all the offers share it.
  const copySources = [
    ...new Map(
      offerIds(state)
        .map((offer) => ({
          offer,
          key: JSON.stringify(
            schoolDates
              .filter((event) => event.offers.includes(offer))
              .map(({ start: from, end: to }) => [from, to]),
          ),
        }))
        .filter(({ key }) => key !== '[]')
        .map(({ offer, key }) => [key, offer] as const),
    ).values(),
  ];
  function copyFromSchool(offer: string) {
    session.apply((current) =>
      copySchoolVacationsToTeachers(current, offer, () => crypto.randomUUID()),
    );
    notify('Períodos das férias escolares copiados para as férias docentes.');
  }

  return (
    <>
      <p className="help">Os dias destes períodos não contam como letivos.</p>
      {vacationKinds.map((kind) => {
        const dates = kind === 'school' ? schoolDates : teacherDates;
        return (
          <section
            key={kind}
            id={`vacations-${kind}`}
            className="vacation-kind"
            aria-labelledby={`vacations-${kind}-title`}
          >
            <h3 id={`vacations-${kind}-title`}>{copy[kind].title}</h3>
            <p className="help">{copy[kind].help}</p>
            {dates.length > 0 && (
              <ul className="vacation-periods">{dates.map((event) => periodLine(kind, event))}</ul>
            )}
            {values.kind === kind && !values.id && periodForm(kind)}
            {!readOnly && !(values.kind === kind && !values.id) && (
              <div className="vacation-actions">
                {kind === 'teacher' &&
                  !teacherDates.length &&
                  copySources.map((offer) => (
                    <Button
                      key={offer}
                      variant="secondary"
                      disabled={dirty}
                      onClick={() => copyFromSchool(offer)}
                    >
                      Usar os períodos das escolares
                      {copySources.length > 1 ? ` — ${labelFor(state, offer)}` : ''}
                    </Button>
                  ))}
                <Button
                  id={`vacation-add-${kind}`}
                  variant="secondary"
                  disabled={dirty}
                  onClick={() => openNew(kind)}
                >
                  Adicionar período
                </Button>
              </div>
            )}
            {kind === 'teacher' && dates.length > 0 && (
              <div className="vacation-summary" id="vacation-teacher-summary">
                <p>
                  Total em {state.year}: {total}
                  {exact ? ` de ${exact}` : ''} dias.
                  {exact && total < exact ? ` Faltam ${exact - total}.` : ''}
                  {exact && total > exact ? ` Excede em ${total - exact}.` : ''}
                </p>
                {schoolDates.length > 0 && (
                  <p className="help">
                    {sameCoincidence
                      ? `${coincidence[0]?.days ?? 0} dias coincidem com as férias escolares.`
                      : `Coincidem com as férias escolares: ${coincidence
                          .map(({ offer, days }) => `${labelFor(state, offer)}, ${days} dias`)
                          .join('; ')}.`}
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
