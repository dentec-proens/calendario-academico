import { formEventClient } from '@tanstack/react-form';

let enabled = false;
let configured = false;
const originalEmit = formEventClient.emit.bind(formEventClient);
const secretField = /(?:password|senha|token|secret|credential|setupCode|installationCode|^code$)/i;

function inspectable(value: unknown, visited = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object') return true;
  if ((typeof Blob !== 'undefined' && value instanceof Blob) || value instanceof ArrayBuffer)
    return false;
  if (visited.has(value)) return true;
  visited.add(value);
  return Object.entries(value).every(
    ([key, entry]) => !secretField.test(key) && inspectable(entry, visited),
  );
}

export function mayInspectFormPayload(payload: {
  id: string;
  state?: { values?: unknown };
  options?: { defaultValues?: unknown };
}) {
  return (
    payload.id.startsWith('inspect:') &&
    inspectable(payload.state?.values) &&
    inspectable(payload.options?.defaultValues)
  );
}

/** Form emits even without a panel; filter before any event reaches its bus or queue. */
export function configureFormInstrumentation(allowInspection: boolean) {
  enabled = allowInspection;
  if (configured) return;
  configured = true;
  formEventClient.emit = (event, payload) => {
    if (enabled && mayInspectFormPayload(payload)) originalEmit(event, payload);
  };
}

configureFormInstrumentation(import.meta.env.DEV);
