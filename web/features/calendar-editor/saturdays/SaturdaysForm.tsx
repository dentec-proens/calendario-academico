import { useEffect, useMemo, useRef, useState } from 'react';
import { isYearSaturday, saturdayYear, type YearSaturday } from '../../../../src/saturdays.ts';
import { applySaturdayActivities } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Input } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import SaturdayYearGrid from './SaturdayYearGrid.tsx';
import './saturdays.css';

const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const dateControl = (date: string) =>
  document.querySelector<HTMLElement>(
    `[data-saturday="${date}"] input, [data-saturday="${date}"] button`,
  );

function focusDate(date: string) {
  dateControl(date)?.focus();
}

function bySource(days: YearSaturday[]) {
  const groups = new Map<string, YearSaturday[]>();
  for (const day of days) {
    const source = day.registration!.evidence;
    groups.set(source, [...(groups.get(source) ?? []), day]);
  }
  return groups;
}

export default function SaturdaysForm() {
  const { state, events, session, institutional, readOnly } = useCalendarEditor();
  // Opening a registered Saturday is local panel state, like the event editor; it never enters the URL.
  const [editingId, setEditingId] = useState<string | null>(null);
  // A control that leaves the panel takes focus with it; this names its successor, which
  // only exists after the next render.
  const pendingFocus = useRef<(() => HTMLElement | null) | null>(null);
  useEffect(() => {
    const target = pendingFocus.current?.();
    if (!target) return;
    pendingFocus.current = null;
    target.focus();
  });
  const { form, values, submit, pending, error } = useCalendarForm(
    'saturdays',
    { dates: [] as string[], name: '', evidence: '' },
    function apply(value) {
      let first = '';
      session.apply((current) => {
        const dates = value.dates
          .filter(
            (date) =>
              !current.events.some(
                (event) => event.kind === 'include' && event.start <= date && date <= event.end,
              ),
          )
          .sort();
        first = dates[0] ?? '';
        return applySaturdayActivities(
          current,
          dates.map((date) => ({ date, name: value.name, evidence: value.evidence })),
          institutional,
          () => crypto.randomUUID(),
        );
      });
      // The submit button leaves with the selection: continue from the first registered date.
      if (first) pendingFocus.current = () => dateControl(first);
      return { dates: [], name: '', evidence: '' };
    },
  );
  const months = useMemo(() => saturdayYear(state, events), [state, events]);
  const saturdays = useMemo(
    () => months.flatMap((month) => month.days).filter(isYearSaturday),
    [months],
  );
  const registered = saturdays.filter((day) => day.status === 'registered');
  const registeredDates = new Set(registered.map((day) => day.date));
  const selection = saturdays.filter(
    (day) => day.status !== 'registered' && values.dates.includes(day.date),
  );
  const saturdayActivities = state.events.filter((event) => event.category === 'sabado');
  const lastSource = saturdayActivities.at(-1)?.evidence ?? '';
  const suggestions = [...new Set(saturdayActivities.map((event) => event.name))].filter(
    (name) => name !== values.name,
  );
  const editing = registered.find((day) => day.registration!.id === editingId);

  function clear(focus?: string) {
    // An empty selection returns to the defaults, so nothing remains unapplied.
    form.setFieldValue('dates', []);
    form.setFieldValue('name', '');
    form.setFieldValue('evidence', '');
    if (focus) focusDate(focus);
  }
  function toggle(date: string, checked: boolean) {
    // Read the live form value: several toggles can happen before the next render.
    const rest = form.getFieldValue('dates').filter((item) => item !== date);
    const active = rest.filter((item) => !registeredDates.has(item));
    if (!checked) {
      if (active.length) form.setFieldValue('dates', rest);
      else clear();
      return;
    }
    setEditingId(null);
    if (!active.length && !form.getFieldValue('evidence').trim() && lastSource)
      form.setFieldValue('evidence', lastSource);
    form.setFieldValue('dates', [...rest, date]);
  }
  function closeEditing(day: YearSaturday) {
    setEditingId(null);
    focusDate(day.date);
  }

  return (
    <div className="saturday-step">
      <div className="saturday-layout">
        {/* The panel's fields join this form through their form attribute, so the panel can
          also host its own forms without nesting them. */}
        <form id="saturday-form" onSubmit={submit}>
          <form.Field name="dates">
            {(field) => (
              <SaturdayYearGrid
                months={months}
                year={state.year}
                selected={field.state.value}
                editingId={editing ? editingId : null}
                disabled={readOnly || pending}
                onToggle={toggle}
                onBlur={field.handleBlur}
                onEdit={setEditingId}
              />
            )}
          </form.Field>
        </form>
        <aside id="saturday-panel" aria-label="Seleção de sábados">
          <p id="saturday-summary" role="status" aria-live="polite">
            <strong>
              {selection.length
                ? plural(selection.length, 'sábado selecionado', 'sábados selecionados')
                : 'Nenhum sábado selecionado'}
            </strong>
            <span>
              {plural(registered.length, 'sábado já registrado', 'sábados já registrados')}
            </span>
          </p>
          {editing ? (
            <section className="saturday-panel-section" aria-labelledby="saturday-edit-title">
              <h5 id="saturday-edit-title" tabIndex={-1}>
                Sábado, {shortDate(editing.date)}
              </h5>
              <dl className="saturday-registration">
                <dt>Atividade</dt>
                <dd>{editing.registration!.name}</dd>
                <dt>Fonte da decisão</dt>
                <dd>{editing.registration!.evidence}</dd>
              </dl>
              {!editing.editable && (
                <p className="help">Edite este registro em Atividades e datas do campus.</p>
              )}
              <button
                type="button"
                id="saturday-edit-close"
                className="secondary"
                onClick={() => closeEditing(editing)}
              >
                Fechar
              </button>
            </section>
          ) : selection.length ? (
            <fieldset
              className="saturday-panel-section"
              disabled={readOnly || pending}
              aria-label="Atividade dos sábados selecionados"
            >
              <ul className="saturday-chips" aria-label="Datas selecionadas">
                {selection.map((day) => (
                  <li key={day.date}>
                    <button
                      type="button"
                      className={day.impediments.length ? 'has-impediment' : undefined}
                      aria-label={`Remover ${shortDate(day.date)} da seleção`}
                      onClick={() => {
                        toggle(day.date, false);
                        focusDate(day.date);
                      }}
                    >
                      {shortDate(day.date)}
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
              {selection.some((day) => day.impediments.length) && (
                <div id="saturday-impediments" className="saturday-impediments">
                  <p>Não contam como dia letivo enquanto o impedimento permanecer:</p>
                  <ul>
                    {selection
                      .filter((day) => day.impediments.length)
                      .map((day) => (
                        <li key={day.date}>
                          <strong>{shortDate(day.date)}</strong> · {day.impediments.join('; ')}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <form.Field name="name">
                {(field) => (
                  <Input
                    field={field}
                    label="Atividade"
                    id="saturday-name"
                    form="saturday-form"
                    maxLength={160}
                    required
                  />
                )}
              </form.Field>
              {suggestions.length > 0 && (
                <div className="saturday-suggestions">
                  <span id="saturday-suggestions-label">Usadas neste calendário:</span>
                  <ul aria-labelledby="saturday-suggestions-label">
                    {suggestions.map((name) => (
                      <li key={name}>
                        <button
                          type="button"
                          onClick={() => {
                            form.setFieldValue('name', name);
                            document.getElementById('saturday-name')?.focus();
                          }}
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <form.Field name="evidence">
                {(field) => (
                  <Input
                    field={field}
                    label="Fonte da decisão"
                    id="saturday-evidence"
                    form="saturday-form"
                    aria-describedby="saturday-evidence-help"
                    maxLength={240}
                    required
                  />
                )}
              </form.Field>
              <p id="saturday-evidence-help" className="help">
                Documento que definiu a atividade, como uma resolução, portaria ou ata.
              </p>
              <FormFeedback error={error} />
              <div className="saturday-actions">
                <button type="submit" id="saturday-submit" form="saturday-form">
                  Adicionar {plural(selection.length, 'sábado', 'sábados')}
                </button>
                <button
                  type="button"
                  id="saturday-clear"
                  className="secondary"
                  onClick={() => clear(selection[0]!.date)}
                >
                  Limpar
                </button>
              </div>
            </fieldset>
          ) : (
            <section className="saturday-panel-section" aria-label="Sábados registrados">
              <p className="help">
                Selecione sábados disponíveis no calendário para informar a atividade e a fonte da
                decisão.
              </p>
              {registered.length > 0 && (
                <>
                  <h5>Sábados registrados</h5>
                  {[...bySource(registered)].map(([source, days]) => (
                    <section key={source} className="saturday-source">
                      <h6>{source}</h6>
                      <ul>
                        {days.map((day) => (
                          <li key={day.date}>
                            <button
                              type="button"
                              className="secondary"
                              {...(day.editable && { 'data-edit-saturday': day.registration!.id })}
                              onClick={() => {
                                // This list leaves the panel; continue on the opened registration.
                                setEditingId(day.registration!.id);
                                pendingFocus.current = () =>
                                  document.getElementById('saturday-edit-title');
                              }}
                            >
                              <strong>{shortDate(day.date)}</strong> {day.registration!.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
