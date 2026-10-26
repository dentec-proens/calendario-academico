type PrivatePath = '/ativar-conta' | '/recuperar-senha';
let privateLink: { pathname: PrivatePath; token: string } | undefined;

export function capturePrivateLinkToken(location: Location, history: History) {
  if (location.pathname !== '/ativar-conta' && location.pathname !== '/recuperar-senha') return;
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (!token) return;
  privateLink = { pathname: location.pathname, token };
  history.replaceState(history.state, '', location.pathname + location.search);
}

/** Secrets are deliberately kept outside router context, search state and draft storage. */
export function readPrivateLinkToken(pathname: PrivatePath): string | null {
  return privateLink?.pathname === pathname ? privateLink.token : null;
}

export function clearPrivateLinkToken() {
  privateLink = undefined;
}

export function clearPrivateLinkWhenLeaving(pathname: string) {
  if (privateLink && privateLink.pathname !== pathname) clearPrivateLinkToken();
}

export function isPrivateAccessPath(pathname: string) {
  return pathname === '/' || pathname === '/ativar-conta' || pathname === '/recuperar-senha';
}
