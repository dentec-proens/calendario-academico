import type { useAuthActions } from '@convex-dev/auth/react';
import type { Value } from 'convex/values';
import { convex, functions } from './runtime.ts';
import type { RequestBody, RequestMethod } from './types.ts';

export { convex, functions };

let authActions: ReturnType<typeof useAuthActions> | undefined;

export function setAuthActions(actions: ReturnType<typeof useAuthActions>) {
  authActions = actions;
}

function actions() {
  if (!authActions) throw new Error('A conexão de autenticação ainda está iniciando.');
  return authActions;
}

function errorRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function nativeError(error: unknown): Error & { status?: number } {
  const outer = errorRecord(error);
  const detail = errorRecord(outer.data);
  const message = [detail.error, detail.message, outer.message].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const status = detail.status ?? outer.status;
  return Object.assign(new Error(message || 'Não foi possível concluir.'), {
    status: typeof status === 'number' ? status : undefined,
  });
}

function text(body: RequestBody, key: string): string {
  const value = body[key];
  if (typeof value !== 'string') throw new Error('Informe ' + key + ' para continuar.');
  return value;
}

// This compatibility seam maps existing domain route names directly to the
// Convex SDK. It never issues a request to the retired HTTP application server.
export async function nativeApi<T = unknown>(
  path: string,
  method: RequestMethod = 'GET',
  body: RequestBody = {},
): Promise<T> {
  try {
    let result: unknown;
    if (path === '/api/login') {
      await actions().signIn('password', { flow: 'signIn', ...body });
      result = { ok: true };
    } else if (path === '/api/logout') {
      await actions().signOut();
      result = { ok: true };
    } else if (path === '/api/google/start') {
      await actions().signIn('google', { redirectTo: window.location.origin });
      result = {};
    } else if (path === '/api/status') {
      result = await convex.query(functions.nativeAuth.status, {});
    } else if (path === '/api/password/options') {
      result = await convex.query(functions.nativeAuth.passwordOptions, {});
    } else if (path === '/api/setup') {
      result = await convex.action(functions.nativeAuth.setup, {
        data: {
          name: text(body, 'name'),
          email: text(body, 'email'),
          password: text(body, 'password'),
          code: text(body, 'code'),
        },
      });
    } else if (path === '/api/invitations/check') {
      result = await convex.query(functions.nativeAuth.checkInvitation, {
        token: text(body, 'token'),
      });
    } else if (path === '/api/invitations/accept') {
      result = await convex.action(functions.nativeAuth.acceptInvitation, {
        token: text(body, 'token'),
        email: text(body, 'email'),
        password: text(body, 'password'),
      });
    } else if (path === '/api/password/reset') {
      result = await convex.action(functions.nativeAuth.resetPassword, {
        token: text(body, 'token'),
        password: text(body, 'password'),
      });
    } else if (path === '/api/password/request') {
      result = await convex.action(functions.nativeAuth.requestPasswordRecovery, {
        email: text(body, 'email'),
      });
    } else if (path === '/api/users' && method === 'POST') {
      const role = body.role;
      if (role !== undefined && role !== 'ADMIN' && role !== 'CAMPUS')
        throw new Error('Perfil inválido.');
      const loginMethod = body.loginMethod;
      if (
        loginMethod !== undefined &&
        loginMethod !== 'local' &&
        loginMethod !== 'google' &&
        loginMethod !== 'invite'
      )
        throw new Error('Forma de acesso inválida.');
      const campusId = body.campusId;
      if (campusId !== undefined && campusId !== null && typeof campusId !== 'string')
        throw new Error('Campus inválido.');
      const password = body.password;
      if (password !== undefined && typeof password !== 'string')
        throw new Error('Senha inválida.');
      result = await convex.action(functions.nativeAuth.createMember, {
        data: {
          name: text(body, 'name'),
          email: text(body, 'email'),
          role,
          loginMethod,
          campusId,
          password,
        },
      });
    } else {
      const member = path.match(/^\/api\/users\/([^/]+)(?:\/(invitation|password-recovery))?$/);
      if (member && method !== 'GET') {
        const id = decodeURIComponent(member[1]!);
        if (method === 'DELETE')
          result = await convex.mutation(functions.nativeAuth.removeMember, { id });
        else if (member[2] === 'invitation')
          result = await convex.mutation(functions.nativeAuth.issueInvitation, { id });
        else if (member[2] === 'password-recovery')
          result = await convex.mutation(functions.nativeAuth.passwordRecovery, { id });
        else throw new Error('Operação de conta indisponível.');
      } else if (
        /\/(pdf|analysis)$/.test(path) ||
        (method === 'POST' &&
          (path === '/api/documents' || /^\/api\/calendars\/[^/]+\/history$/.test(path)))
      ) {
        result = await convex.action(functions.nativeActions.run, { path, body });
      } else if (method === 'GET') {
        result = await convex.query(functions.native.read, { path });
      } else {
        result = await convex.mutation(functions.native.write, { path, method, body });
      }
    }
    return result as T;
  } catch (error) {
    throw nativeError(error);
  }
}

export function subscribeNative<T = Value>(
  path: string,
  onValue: (value: T) => void,
  onError?: (error: Error) => void,
) {
  const watch = convex.watchQuery(functions.native.read, { path });
  const update = () => {
    try {
      const value: unknown = watch.localQueryResult();
      if (value !== undefined) onValue(value as T);
    } catch (error) {
      onError?.(nativeError(error));
    }
  };
  const stop = watch.onUpdate(update);
  update();
  return stop;
}

export function subscribeNativeConnection(onChange: (connected: boolean) => void) {
  const update = () => onChange(convex.connectionState().isWebSocketConnected);
  const stop = convex.subscribeToConnectionState(update);
  update();
  return stop;
}

export async function downloadNative(path: string, filename: string) {
  try {
    const result = await convex.action(functions.nativeActions.download, { path });
    const response = await fetch(result.url);
    if (!response.ok) throw new Error('Não foi possível baixar o arquivo. Tente novamente.');
    return { blob: await response.blob(), filename: result.filename || filename };
  } catch (error) {
    throw nativeError(error);
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function downloadLink(
  event: { preventDefault(): void },
  path: string,
  filename: string,
) {
  event.preventDefault();
  const file = await downloadNative(path, filename);
  saveBlob(file.blob, file.filename);
}
