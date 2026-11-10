function errorRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * A request without a message of the application. A contract refusal is identified by name where
 * the deployment shows it; production only says `Server Error`, also for an internal failure, so
 * that message suggests reloading without asserting that the build is the cause.
 */
export const outdatedClientMessage =
  'O servidor não aceitou o pedido. Atualize a aplicação recarregando a página e tente novamente.';
export const serverFailureMessage =
  'O servidor não concluiu o pedido. Se esta página está aberta há algum tempo, recarregue-a e tente novamente.';

export const networkFailureMessage =
  'Não foi possível falar com o servidor. Verifique sua conexão com a internet e tente novamente.';

/**
 * What a browser says when `fetch` cannot reach the server, as `is-network-error` (used by
 * `@convex-dev/auth` to retry) lists them: Chrome and Edge, Safari 17+ and 16, Firefox. Chrome and
 * Safari may add the host in parentheses. Only these texts on a `TypeError` count, so a `TypeError`
 * from a bug is never mistaken for a lost connection.
 */
const networkFailures = new Set([
  'Failed to fetch',
  'network error',
  'Load failed',
  'The Internet connection appears to be offline.',
  'NetworkError when attempting to fetch resource.',
]);
const withHost = /^(?:Failed to fetch|Load failed) \(.*\)$/;

/** By name, not `instanceof`: an error from another frame has another `TypeError`. */
export function isNetworkFailure(error: unknown) {
  const { name, message } = errorRecord(error);
  return (
    name === 'TypeError' &&
    typeof message === 'string' &&
    (networkFailures.has(message) || withHost.test(message))
  );
}

const unexplained = (message: string | undefined) =>
  message?.includes('ArgumentValidationError')
    ? outdatedClientMessage
    : message?.includes('Server Error')
      ? serverFailureMessage
      : message;

export function nativeError(error: unknown): Error & { status?: number } {
  const outer = errorRecord(error);
  const detail = errorRecord(outer.data);
  const status = detail.status ?? outer.status;
  if (isNetworkFailure(error))
    return Object.assign(new Error(networkFailureMessage), {
      status: typeof status === 'number' ? status : undefined,
    });
  const message = [detail.error, detail.message, outer.message].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const shown = typeof detail.error === 'string' ? message : unexplained(message);
  return Object.assign(new Error(shown || 'Não foi possível concluir.'), {
    status: typeof status === 'number' ? status : undefined,
  });
}

export async function request<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw nativeError(error);
  }
}
