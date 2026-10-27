import { useRef, type KeyboardEvent } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { teacherDayId } from '../../../../src/teacher-day.ts';
import { removeEvent } from '../../../../src/calendar-edits/commands.ts';
import { activityChecklist } from '../../../../src/obligations.ts';
import { isCalendarReferenceHash } from '../../../../src/calendar-reference.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useActivitySearch } from '../events/activity-query.ts';
import { useEventEditor } from '../events/EventEditorProvider.tsx';
import { useActivityCoverage } from '../events/useActivityCoverage.ts';
import ActivityChecklist from '../events/ActivityChecklist.tsx';
import EventRecordDetails from '../events/EventRecordDetails.tsx';
import HistorySection from './HistorySection.tsx';
import ActivityFilters from '../events/ActivityFilters.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import { editorPages } from '../editor-steps.ts';

const tabs = [
  { id: 'atividades', label: 'Atividades' },
  { id: 'eventos', label: 'Eventos do campus' },
  { id: 'anterior', label: 'Calendário anterior' },
] as const;
type Tab = (typeof tabs)[number]['id'];

export default function EventsSection() {
  const { events, state, record, institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const hash = useRouterState({ select: (router) => router.location.hash });
  const navigate = useNavigate();
  const { statusFor } = useActivityCoverage();
  const tabList = useRef<HTMLDivElement>(null);
  const tab: Tab = isCalendarReferenceHash(hash) ? 'anterior' : (search.aba ?? 'atividades');
  const hasPendingEvent = Boolean(editor.context && editor.dirty);
  const checklist = activityChecklist(state);
  const activities = new Set(checklist.map((item) => item.id));
  const toFill = checklist.filter(
    (item) =>
      item.variant !== 'stage' &&
      ['pending', 'partial', 'unconfigured'].includes(statusFor(item.id).status),
  ).length;
  // Records answering an activity live with it; the rest are the campus' own events.
  const campusEvents = [...events]
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter(
      (event) =>
        event.id === teacherDayId ||
        (!event.institutional && !(event.requirementId && activities.has(event.requirementId))),
    );
  const counts: Record<Tab, string> = {
    atividades: toFill ? ` · ${toFill} a preencher` : '',
    eventos: campusEvents.length ? ` · ${campusEvents.length}` : '',
    anterior: '',
  };
  function select(next: Tab, focus = false) {
    void navigate({
      to: editorPages.events.path,
      params: { calendarId: record.id },
      search: (previous) => ({ ...previous, aba: next === 'atividades' ? undefined : next }),
      hash: '',
      hashScrollIntoView: false,
    });
    if (focus) document.getElementById(`tab-${next}`)?.focus();
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex((item) => item.id === tab);
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: -index,
      End: tabs.length - 1 - index,
    };
    if (!(event.key in keys)) return;
    // Recognised keys never scroll the page, even at the first or last tab.
    event.preventDefault();
    const step = keys[event.key];
    if (!step) return;
    select(tabs[(index + step + tabs.length) % tabs.length].id, true);
  }
  return (
    <section id="events" className="view">
      <div className="panel">
        <div className="events-tabs" role="tablist" aria-label="Partes da etapa" ref={tabList}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              data-tab={item.id}
              aria-selected={tab === item.id}
              aria-controls={`tabpanel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => select(item.id)}
              onKeyDown={onTabKey}
            >
              {item.label}
              <span className="events-tab-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="tabpanel-atividades"
          aria-labelledby="tab-atividades"
          hidden={tab !== 'atividades'}
        >
          <ActivityFilters />
          <ActivityChecklist />
        </div>
        <div
          role="tabpanel"
          id="tabpanel-eventos"
          aria-labelledby="tab-eventos"
          hidden={tab !== 'eventos'}
        >
          <div id="event-creation">
            <button
              id="new-event"
              type="button"
              disabled={readOnly || editor.pending}
              aria-describedby={hasPendingEvent ? 'pending-event-description' : undefined}
              onClick={editor.newEvent}
            >
              Adicionar novo evento
            </button>
            <p className="help">
              Feriados, recessos, reposições, eventos e prazos que não correspondem a uma atividade.
            </p>
            {hasPendingEvent && (
              <Notice
                as="section"
                id="pending-event"
                tone="warning"
                aria-labelledby="pending-event-title"
                title="Preenchimento pendente"
                titleAs="h4"
                titleProps={{ id: 'pending-event-title', tabIndex: -1 }}
                actions={
                  <>
                    <button
                      id="resume-pending-event"
                      type="button"
                      disabled={readOnly || editor.pending}
                      onClick={() => {
                        void editor.resume();
                      }}
                    >
                      Continuar preenchimento
                    </button>
                    <button
                      id="discard-pending-event"
                      type="button"
                      className="secondary"
                      disabled={readOnly || editor.pending}
                      onClick={editor.discard}
                    >
                      Descartar preenchimento
                    </button>
                  </>
                }
              >
                <p id="pending-event-description">
                  Há alterações ainda não aplicadas em{' '}
                  <strong>{editor.values.name.trim() || 'Novo evento'}</strong>. Continue esse
                  preenchimento ou descarte as alterações antes de adicionar outro evento.
                </p>
              </Notice>
            )}
          </div>
          <ul id="event-list" className="records">
            {campusEvents.map((event) => (
              <li key={event.id}>
                <div>
                  <EventRecordDetails event={event} />
                </div>
                {event.id === teacherDayId ? (
                  <div className="actions">
                    <button
                      type="button"
                      id="open-teacher-day"
                      disabled={readOnly}
                      onClick={editor.viewTeacherDay}
                    >
                      Ajustar data
                    </button>
                  </div>
                ) : (
                  <div className="actions">
                    <button
                      type="button"
                      data-edit-event={event.id}
                      disabled={readOnly}
                      onClick={() => editor.edit(event.id)}
                    >
                      Editar evento
                    </button>
                    <button
                      type="button"
                      data-remove-event={event.id}
                      disabled={readOnly}
                      aria-label={`Remover ${event.name}`}
                      onClick={() => {
                        if (
                          applyCommand((current) =>
                            removeEvent(current, event.id, institutional),
                          ) &&
                          editor.eventId === event.id
                        )
                          editor.discard();
                      }}
                    >
                      Remover
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="help">
            <Link
              to={editorPages.calendar.path}
              params={{ calendarId: record.id }}
              search={(previous) => previous}
              hash="calendar-records"
            >
              Consultar todos os registros do calendário
            </Link>
          </p>
        </div>
        <div
          role="tabpanel"
          id="tabpanel-anterior"
          aria-labelledby="tab-anterior"
          hidden={tab !== 'anterior'}
        >
          <HistorySection />
        </div>
      </div>
    </section>
  );
}
