/** Sources typed by a campus belong only to these explicit paths in a calendar state. */
export const manualSourcePaths = [
  'weekEvidence',
  'teacherVacations.evidence',
  'events[].evidence',
  'events[].deadlineAdjustment.evidence',
  'scopeConfirmation.source',
  'intakeByModality[*][*].source',
] as const;

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Never recurse by property name: institutional snapshots, documents and free text are untouched.
 * The caller can use persisted v2/v3 states, import values or form drafts without a conversion.
 */
export function withoutManualSources<T>(input: T): { state: T; removed: number } {
  if (!object(input)) return { state: input, removed: 0 };
  if (
    Array.isArray(input.events) &&
    input.events.some(
      (event: unknown) =>
        object(event) &&
        ((typeof event.id === 'string' && event.id.startsWith('inst:')) ||
          event.institutional === true),
    )
  )
    throw Error(
      'Referência institucional automática no array local: reconcilie o estado antes de remover fontes.',
    );

  let removed = 0;
  function omit(value: ObjectValue, key: string): ObjectValue {
    if (!Object.hasOwn(value, key)) return value;
    const next = { ...value };
    delete next[key];
    removed++;
    return next;
  }
  let state = omit(input, 'weekEvidence');
  for (const [key, source] of [
    ['teacherVacations', 'evidence'],
    ['scopeConfirmation', 'source'],
  ] as const) {
    const value = state[key];
    if (!object(value)) continue;
    const next = omit(value, source);
    if (next !== value) state = { ...state, [key]: next };
  }
  if (Array.isArray(state.events)) {
    let changed = false;
    const events = state.events.map((event: unknown) => {
      if (!object(event)) return event;
      let next = omit(event, 'evidence');
      if (object(next.deadlineAdjustment)) {
        const adjustment = omit(next.deadlineAdjustment, 'evidence');
        if (adjustment !== next.deadlineAdjustment)
          next = { ...next, deadlineAdjustment: adjustment };
      }
      changed ||= next !== event;
      return next;
    });
    if (changed) state = { ...state, events };
  }
  if (object(state.intakeByModality)) {
    let changed = false;
    const intake = Object.fromEntries(
      Object.entries(state.intakeByModality).map(([modality, terms]) => {
        if (!object(terms)) return [modality, terms];
        let termChanged = false;
        const next = Object.fromEntries(
          Object.entries(terms).map(([term, value]) => {
            if (!object(value)) return [term, value];
            const entry = omit(value, 'source');
            termChanged ||= entry !== value;
            return [term, entry];
          }),
        );
        changed ||= termChanged;
        return [modality, termChanged ? next : terms];
      }),
    );
    if (changed) state = { ...state, intakeByModality: intake };
  }
  return { state: state as T, removed };
}
