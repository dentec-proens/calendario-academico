export const nativeEnabled = import.meta.env?.VITE_CONVEX_NATIVE === '1';
// The original editor is also served as browser modules in baseline mode.
// Load package imports only in the bundled native build.
const runtime = nativeEnabled ? await import('./runtime.js') : null;
export const convex = runtime?.convex;
export const functions = runtime?.functions;

let authActions;

export function setAuthActions(actions) {
  authActions = actions;
}

export function nativeError(error) {
  const detail = error.data;
  return Object.assign(
    new Error(detail?.error || detail?.message || error.message || 'Não foi possível concluir.'),
    { status: detail?.status || error.status },
  );
}

export async function nativeApi(path, method = 'GET', body = {}) {
  try {
    if (path === '/api/login') {
      await authActions.signIn('password', { flow: 'signIn', ...body });
      return { ok: true };
    }
    if (path === '/api/logout') {
      await authActions.signOut();
      return { ok: true };
    }
    if (path === '/api/google/start') {
      await authActions.signIn('google', { redirectTo: window.location.origin });
      return {};
    }
    if (path === '/api/status') return await convex.query(functions.nativeAuth.status, {});
    if (path === '/api/password/options')
      return await convex.query(functions.nativeAuth.passwordOptions, {});
    if (path === '/api/setup')
      return await convex.action(functions.nativeAuth.setup, { data: body });
    if (path === '/api/invitations/check')
      return await convex.query(functions.nativeAuth.checkInvitation, body);
    if (path === '/api/invitations/accept')
      return await convex.action(functions.nativeAuth.acceptInvitation, body);
    if (path === '/api/password/reset')
      return await convex.action(functions.nativeAuth.resetPassword, body);
    if (path === '/api/password/request')
      return await convex.action(functions.nativeAuth.requestPasswordRecovery, body);
    if (path === '/api/users' && method === 'POST')
      return await convex.action(functions.nativeAuth.createMember, { data: body });
    const member = path.match(/^\/api\/users\/([^/]+)(?:\/(invitation|password-recovery))?$/);
    if (member) {
      const id = decodeURIComponent(member[1]);
      if (method === 'DELETE')
        return await convex.mutation(functions.nativeAuth.removeMember, { id });
      if (member[2] === 'invitation')
        return await convex.mutation(functions.nativeAuth.issueInvitation, { id });
      if (member[2] === 'password-recovery')
        return await convex.mutation(functions.nativeAuth.passwordRecovery, { id });
    }
    if (
      /\/(pdf|analysis)$/.test(path) ||
      (method === 'POST' &&
        (path === '/api/documents' || /^\/api\/calendars\/[^/]+\/history$/.test(path)))
    )
      return await convex.action(functions.nativeActions.run, { path, body });
    if (method === 'GET') return await convex.query(functions.native.read, { path });
    return await convex.mutation(functions.native.write, { path, method, body });
  } catch (error) {
    throw nativeError(error);
  }
}

export function subscribeNative(path, onValue, onError) {
  const watch = convex.watchQuery(functions.native.read, { path });
  const update = () => {
    try {
      const value = watch.localQueryResult();
      if (value !== undefined) onValue(value);
    } catch (error) {
      onError?.(nativeError(error));
    }
  };
  const stop = watch.onUpdate(update);
  update();
  return stop;
}

export async function downloadNative(path, filename) {
  try {
    const result = await convex.action(functions.nativeActions.download, { path });
    const response = await fetch(result.url);
    if (!response.ok) throw Error('Não foi possível baixar o arquivo. Tente novamente.');
    return { blob: await response.blob(), filename: result.filename || filename };
  } catch (error) {
    throw nativeError(error);
  }
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function downloadLink(event, path, filename) {
  if (!nativeEnabled) return;
  event.preventDefault();
  const file = await downloadNative(path, filename);
  saveBlob(file.blob, file.filename);
}
