import type { Infer } from 'convex/values';
import type { domainStateDto, DomainState } from '../validators';
import { withoutManualSources } from '../../src/manual-sources';

/**
 * Read-only bridge for retained clients. A source slot identifies the actual calendar
 * record/version, not a document or a user assertion. Never pass this DTO to storage.
 */
export function legacyCalendarState(
  value: DomainState,
  calendarId: string,
  version: number,
): Infer<typeof domainStateDto> {
  const state = withoutManualSources(value).state;
  const identity = `registro:${calendarId}:v${version}`;
  return {
    ...state,
    weekEvidence: `${identity}:semana`,
    events: state.events.map((event) => {
      const reference = `${identity}:${event.id}`;
      return {
        ...event,
        recordType: event.recordType === 'retired-stage' ? 'event' : event.recordType,
        evidence: reference,
        deadlineAdjustment: event.deadlineAdjustment
          ? { ...event.deadlineAdjustment, evidence: `${reference}:prazo` }
          : undefined,
      };
    }),
    teacherVacations: state.teacherVacations
      ? { ...state.teacherVacations, evidence: `${identity}:ferias` }
      : undefined,
    scopeConfirmation: state.scopeConfirmation
      ? { ...state.scopeConfirmation, source: `${identity}:escopo` }
      : undefined,
    intakeByModality: state.intakeByModality
      ? Object.fromEntries(
          Object.entries(state.intakeByModality).map(([modality, terms]) => [
            modality,
            Object.fromEntries(
              Object.entries(terms).map(([term, entry]) => [
                term,
                {
                  ...entry,
                  ...(entry.required ? { source: `${identity}:ingresso:${modality}:${term}` } : {}),
                },
              ]),
            ),
          ]),
        )
      : undefined,
  };
}
