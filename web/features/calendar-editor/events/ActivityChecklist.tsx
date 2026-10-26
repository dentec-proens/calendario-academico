import { activityChecklist, stageRequirement } from '../../../../src/obligations.ts';
import { assessmentDayCounts } from '../../../../src/stage-suggestions.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import EventEditor from './EventEditor.tsx';
import { removeEvent } from '../../../../src/calendar-edits/commands.ts';

export default function ActivityChecklist({ stages = false }: { stages?: boolean }) {
  const { state, events, institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  let counts: ReturnType<typeof assessmentDayCounts> = {};
  try {
    counts = assessmentDayCounts(state, events);
  } catch {
    /* Counts become available after periods and stages are valid. */
  }
  const selected =
    editor.context?.kind === 'activity'
      ? editor.context.requirementId
      : editor.context?.kind === 'new'
        ? editor.values.requirementId
        : '';
  return (
    <ul id={stages ? 'assessment-checklist' : 'activity-checklist'} className="records">
      {activityChecklist(state)
        .filter((item) => Boolean(stageRequirement(item.id)) === stages)
        .map((item) => {
          const registered = state.events.filter((event) => event.requirementId === item.id);
          return (
            <li key={item.id} data-activity-row={item.id}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {registered.length
                    ? '✓ Registrado no calendário — ' +
                      registered
                        .map(
                          (event) =>
                            `${event.start} a ${event.end}${counts[event.id] ? ' · ' + counts[event.id].map((count) => `${modalityLabels[count.modality]}: ${count.days} dias letivos (${count.saturdays} sábados; ${count.excluded} dias excluídos)`).join(' / ') : ''}${event.assessmentAutoStart ? ' · ajuste automático' : ''}`,
                        )
                        .join('; ')
                    : item.required === false
                      ? 'Opcional — preencha apenas se houver previsão no calendário.'
                      : 'Pendente de data e fonte'}
                </small>
              </div>
              <div className="actions">
                <button
                  type="button"
                  data-prepare-activity={item.id}
                  disabled={readOnly}
                  onClick={() => editor.prepare(item.id)}
                >
                  {registered.length ? 'Editar evento' : 'Preencher atividade'}
                </button>
                {stages &&
                  registered.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      data-remove-event={event.id}
                      disabled={readOnly}
                      aria-label={`Excluir datas de ${item.name}`}
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
                      Excluir datas
                    </button>
                  ))}
              </div>
              {selected === item.id && <EventEditor />}
            </li>
          );
        })}
    </ul>
  );
}
