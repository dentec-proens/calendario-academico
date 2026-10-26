import { useMemo, useRef, useState } from 'react';
import { isYearSaturday, saturdayGain, saturdayYear } from '../../../../src/saturdays.ts';
import { applySaturdayActivities } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Input } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import SaturdayYearGrid from './SaturdayYearGrid.tsx';
import SaturdayEditForm from './SaturdayEditForm.tsx';
import SaturdayDayCount from './SaturdayDayCount.tsx';
import SaturdayPanel from './SaturdayPanel.tsx';
import SaturdayRegisteredList from './SaturdayRegisteredList.tsx';
import SaturdayPrerequisites from './SaturdayPrerequisites.tsx';
import { useDeferredFocus } from './useDeferredFocus.ts';
import { useNarrowContainer } from './useNarrowContainer.ts';
import './saturdays.css';

/** Below this step width the panel no longer fits beside the grid and opens as a dialog. */
const compactWidth = 760;

const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// A date outside the periods has no control; its cell takes focus so keyboard users keep their place.
const dateControl = (date: string) =>
  document.querySelector<HTMLElement>(
    `[data-saturday="${date}"] input, [data-saturday="${date}"] button, [data-saturday="${date}"][tabindex]`,
  );

export default function SaturdaysForm() {
  const { state, record, events, evaluation, session, institutional, readOnly } =
    useCalendarEditor();
  // Opening a registered Saturday is local panel state, like the event editor; it never enters the URL.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // A control that leaves the panel takes focus with it; its successor exists after the render.
  const focusLater = useDeferredFocus();
  const step = useRef<HTMLDivElement>(null);
  const compact = useNarrowContainer(step, compactWidth, (narrow) => {
    // Crossing the width moves the panel between the aside and the dialog. Someone working in
    // the panel keeps their place: the dialog opens, or the aside returns, on the same field.
    const active = document.activeElement;
    const inPanel = active instanceof HTMLElement && Boolean(active.closest('#saturday-panel'));
    // Controls without an id (chips, suggestions) come back on the panel's main field.
    const id = inPanel ? active.id || (editingId ? 'saturday-edit-title' : 'saturday-name') : '';
    setPanelOpen(narrow && inPanel);
    // A record left open beside the grid would otherwise take over the compact bar.
    if (narrow && !inPanel) setEditingId(null);
    // Returning focus after a layout change must not scroll the page the person is looking at.
    if (id) focusLater(() => document.getElementById(id), { preventScroll: true });
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
      setPanelOpen(false);
      // The submit button leaves with the selection: continue from the first registered date.
      if (first) focusLater(() => dateControl(first));
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
  const selectionLabel = plural(selection.length, 'sábado selecionado', 'sábados selecionados');

  function clear(focus?: string) {
    // An empty selection returns to the defaults, so nothing remains unapplied.
    form.setFieldValue('dates', []);
    form.setFieldValue('name', '');
    form.setFieldValue('evidence', '');
    setPanelOpen(false);
    // A compact panel closes first; the date is reachable only once the dialog is gone.
    if (focus) focusLater(() => dateControl(focus));
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
  function unselect(date: string) {
    if (selection.length === 1) return clear(date);
    toggle(date, false);
    // Inside the dialog the grid is out of reach; stay with the fields.
    if (compact) document.getElementById('saturday-name')?.focus();
    else dateControl(date)?.focus();
  }
  function openEditing(eventId: string) {
    setEditingId(eventId);
    if (compact) setPanelOpen(true);
  }
  function closeEditing(date: string) {
    setEditingId(null);
    setPanelOpen(false);
    // After a removal the date's control becomes a checkbox, which only exists after the render.
    focusLater(() => dateControl(date));
  }

  const overview = (
    <>
      <SaturdayDayCount
        evaluation={evaluation}
        gain={saturdayGain(
          months,
          selection.map((day) => day.date),
        )}
      />
      <p id="saturday-summary" role="status" aria-live="polite">
        <strong>{selection.length ? selectionLabel : 'Nenhum sábado selecionado'}</strong>
        <span>{plural(registered.length, 'sábado já registrado', 'sábados já registrados')}</span>
      </p>
    </>
  );
  const editBody = editing && (
    <section className="saturday-panel-section" aria-labelledby="saturday-edit-title">
      <div className="saturday-edit-heading">
        <h5 id="saturday-edit-title" tabIndex={-1}>
          Sábado, {shortDate(editing.date)}
        </h5>
        <button
          type="button"
          id="saturday-edit-close"
          className="secondary"
          onClick={() => closeEditing(editing.date)}
        >
          Fechar
        </button>
      </div>
      {editing.editable ? (
        <SaturdayEditForm
          key={editing.registration!.id}
          event={editing.registration!}
          onClose={closeEditing}
        />
      ) : (
        <>
          <dl className="saturday-registration">
            <dt>Atividade</dt>
            <dd>{editing.registration!.name}</dd>
            <dt>Fonte da decisão</dt>
            <dd>{editing.registration!.evidence}</dd>
          </dl>
          <p className="help">Edite este registro em Atividades e datas do campus.</p>
        </>
      )}
    </section>
  );
  const selectionBody = selection.length > 0 && (
    <fieldset
      className="saturday-panel-section"
      disabled={readOnly || pending}
      aria-label="Atividade dos sábados selecionados"
    >
      {compact && (
        <div className="saturday-edit-heading">
          <h5>{selectionLabel}</h5>
          <button
            type="button"
            id="saturday-close-panel"
            className="secondary"
            onClick={() => setPanelOpen(false)}
          >
            Fechar
          </button>
        </div>
      )}
      <ul className="saturday-chips" aria-label="Datas selecionadas">
        {selection.map((day) => (
          <li key={day.date}>
            <button
              type="button"
              className={day.impediments.length ? 'has-impediment' : undefined}
              aria-label={`Remover ${shortDate(day.date)} da seleção`}
              onClick={() => unselect(day.date)}
            >
              {shortDate(day.date)}
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      {selection.some((day) => day.impediments.length) && (
        <Notice id="saturday-impediments" tone="warning">
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
        </Notice>
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
  );
  const idleBody = (
    <SaturdayRegisteredList
      registered={registered}
      hasAvailable={saturdays.some((day) => day.status === 'available')}
      onOpen={(eventId) => {
        // The list leaves the panel; continue on the opened registration.
        openEditing(eventId);
        focusLater(() => document.getElementById('saturday-edit-title'));
      }}
    />
  );
  const activeBody = editBody || selectionBody;
  // Remote changes can register the selection or delete the open record: drop panel state that no
  // longer has content, so a later selection doesn't reopen the dialog on its own.
  if (editingId && !editing) setEditingId(null);
  if (panelOpen && !activeBody) setPanelOpen(false);

  return (
    <div className="saturday-step" ref={step}>
      <SaturdayPrerequisites
        calendarId={record.id}
        hasPeriods={state.periods.length > 0}
        weekConfirmed={Boolean(state.weekConfirmed)}
      />
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
                onEdit={openEditing}
              />
            )}
          </form.Field>
        </form>
        {compact ? (
          <section id="saturday-overview" aria-label="Resumo dos sábados">
            {overview}
            {idleBody}
          </section>
        ) : (
          <aside id="saturday-panel" aria-label="Seleção de sábados">
            {overview}
            {activeBody || idleBody}
          </aside>
        )}
      </div>
      {compact && (
        <>
          {/* The bar stays mounted under the modal, so closing the dialog returns focus to it. */}
          {selection.length > 0 && (
            <div id="saturday-compact-bar">
              <strong>{selectionLabel}</strong>
              <button type="button" id="saturday-open-panel" onClick={() => setPanelOpen(true)}>
                Preencher atividade
              </button>
            </div>
          )}
          <SaturdayPanel
            open={panelOpen && Boolean(activeBody)}
            returnFocus={() => document.getElementById('saturday-open-panel')}
            label={editing ? `Sábado, ${shortDate(editing.date)}` : 'Seleção de sábados'}
            onClose={() => (editing ? closeEditing(editing.date) : setPanelOpen(false))}
          >
            {activeBody}
          </SaturdayPanel>
        </>
      )}
    </div>
  );
}
