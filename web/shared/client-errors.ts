import {
  nativeError,
  networkFailureMessage,
  outdatedClientMessage,
  serverFailureMessage,
} from './convex/errors.ts';

export type ClientErrorKind = 'save' | 'render' | 'rejection';
export interface ClientErrorReport {
  kind: ClientErrorKind;
  status?: number;
  message: string;
  route: string;
  calendarId?: string;
  release: string;
}

const repeatWindow = 60_000;

/** These refusals are about the record's situation. A 400 can quote a name typed in the calendar. */
const describedRefusals = new Set([403, 404, 409, 503]);

/** The header of a stack repeats the message, so only real frames are searched. */
function firstFrame(error: Error) {
  const header = `${error.name}: ${error.message}`;
  const frames = error.stack?.startsWith(header) ? error.stack.slice(header.length) : error.stack;
  return frames?.match(/\/([^\s/()@?]+\.[cm]?[jt]sx?)(?:\?[^\s:)]*)?:(\d+:\d+)/);
}

/**
 * Only messages known to carry no content are recorded. Anything else can quote what the person
 * typed (a JSON parse error does), so it is reduced to the error type and where it happened.
 */
export function describeClientError(error: unknown) {
  const { message, status } = nativeError(error);
  if (status !== undefined)
    return { message: describedRefusals.has(status) ? message : 'Recusa do servidor', status };
  if (
    message === outdatedClientMessage ||
    message === serverFailureMessage ||
    message === networkFailureMessage
  )
    return { message, status };
  if (!(error instanceof Error)) return { message: typeof error, status };
  const frame = firstFrame(error);
  return { message: frame ? `${error.name} em ${frame[1]}:${frame[2]}` : error.name, status };
}

export function createClientErrorReporter({
  send,
  route,
  release,
  now = Date.now,
}: {
  send: (report: ClientErrorReport) => Promise<unknown>;
  route: () => string;
  release: string;
  now?: () => number;
}) {
  const seen = new Map<string, number>();
  return (kind: ClientErrorKind, error: unknown, calendarId?: string) => {
    const { message, status } = describeClientError(error);
    // A lost connection left unhandled, such as the session renewal of `@convex-dev/auth` after the
    // computer wakes up, is almost always the person's network. Skipping it keeps the log readable;
    // the cost is that a transport failure for everyone (a blocked endpoint, a paused deployment)
    // shows up only when a save fails or someone complains. The described message also catches an
    // error already converted by `request()`.
    if (kind === 'rejection' && message === networkFailureMessage) return;
    // An expired session is expected, and the report itself would be refused.
    if (status === 401) return;
    const key = `${kind}:${status}:${message}:${calendarId}`;
    const last = seen.get(key);
    if (last !== undefined && now() - last < repeatWindow) return;
    seen.set(key, now());
    const report: ClientErrorReport = {
      kind,
      message,
      route: route(),
      release,
      ...(status === undefined ? {} : { status }),
      ...(calendarId ? { calendarId } : {}),
    };
    // Reporting a failure must never become another failure.
    void send(report).catch(() => undefined);
  };
}

export function listenForUnhandledRejections(
  target: Pick<Window, 'addEventListener'>,
  report: (kind: ClientErrorKind, error: unknown) => void,
) {
  target.addEventListener('unhandledrejection', (event) => {
    report('rejection', event.reason);
  });
}
