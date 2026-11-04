function errorRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * A refused request reaches the client as a server error, without a message of the application,
 * when it does not match the backend's contract: the usual cause is a tab running an earlier build.
 */
const outdatedClient = /ArgumentValidationError|Server Error/;
export const outdatedClientMessage =
  'O servidor não aceitou o pedido. Atualize a aplicação recarregando a página e tente novamente.';

export function nativeError(error: unknown): Error & { status?: number } {
  const outer = errorRecord(error);
  const detail = errorRecord(outer.data);
  const message = [detail.error, detail.message, outer.message].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const status = detail.status ?? outer.status;
  const shown =
    typeof detail.error !== 'string' && message && outdatedClient.test(message)
      ? outdatedClientMessage
      : message;
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
