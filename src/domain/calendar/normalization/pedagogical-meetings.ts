import type { CalendarPolicy } from '../../policies/contract.ts';

/** The activity that held the pedagogical meeting of each stage until `consup-292-2027-v11`. */
export const pedagogicalMeetingActivity = 'pedagogical-meeting';

/**
 * Since v11 the council, the pedagogical collective and the pedagogical meeting of a stage are one
 * activity (Art. 11, XIII): each campus or course uses one of the terms. A date linked to the
 * meeting of a stage moves to the council of the same offer and position; its name, dates and
 * every other field stay as typed. A stage that already had a council keeps both dates.
 *
 * Returns the converted events, or `undefined` when no date is linked to the meeting, so a
 * migration writes only what changes and running it again changes nothing.
 */
export function mergePedagogicalMeetings<E extends { activity?: { activityId: string } }>(
  events: readonly E[],
): E[] | undefined {
  if (!events.some((event) => event.activity?.activityId === pedagogicalMeetingActivity))
    return undefined;
  return events.map((event) =>
    event.activity?.activityId === pedagogicalMeetingActivity
      ? { ...event, activity: { ...event.activity, activityId: 'council' } }
      : event,
  );
}

/**
 * Whether the policy of a calendar declares the meeting merged into the council. Its catalogue still
 * declares the meeting, so links of submissions keep reading; a year without a declared catalogue
 * keeps the operational checklist, where the meeting is its own activity.
 */
export const mergesPedagogicalMeetings = (policy: Pick<CalendarPolicy, 'catalogue'>) =>
  policy.catalogue?.some(
    (rule) => rule.id === pedagogicalMeetingActivity && rule.mergedInto === 'council',
  ) === true;

/** The state with its meeting dates in the council when its policy merged them; else unchanged. */
export function withPedagogicalMeetingsMerged<
  S extends { events: readonly { activity?: { activityId: string } }[] },
>(state: S, policy: Pick<CalendarPolicy, 'catalogue'>): S {
  if (!mergesPedagogicalMeetings(policy)) return state;
  const events = mergePedagogicalMeetings(state.events);
  return events ? { ...state, events } : state;
}
