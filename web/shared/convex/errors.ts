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

const unexplained = (message: string | undefined) =>
  message?.includes('ArgumentValidationError')
    ? outdatedClientMessage
    : message?.includes('Server Error')
      ? serverFailureMessage
      : message;

export function nativeError(error: unknown): Error & { status?: number } {
  const outer = errorRecord(error);
  const detail = errorRecord(outer.data);
  const message = [detail.error, detail.message, outer.message].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const status = detail.status ?? outer.status;
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
