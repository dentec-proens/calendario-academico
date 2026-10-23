type ClientEnvironment = { DENTEC_DISPOSABLE_E2E?: string; VERCEL_ENV?: string };

export function validatePortalDeploymentUrl(url: string | undefined, env: ClientEnvironment): void {
  if (/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(url ?? '')) return;
  const local = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(url ?? '');
  if (
    env.DENTEC_DISPOSABLE_E2E === '1' &&
    env.VERCEL_ENV !== 'production' &&
    local &&
    Number(local[1]) >= 1 &&
    Number(local[1]) <= 65535
  )
    return;
  throw Error('Configure VITE_CONVEX_URL em .env.local com a URL do deployment Convex.');
}
