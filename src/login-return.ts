import { pageDocument } from './app-routes.ts';

/** Only application work pages on this origin may be resumed after signing in. */
export function loginReturnTarget(search: string, origin: string): string | undefined {
  const requested = new URLSearchParams(search).get('retorno');
  if (!requested) return undefined;
  try {
    const url = new URL(requested, origin);
    const document = pageDocument(url.pathname);
    if (
      url.origin !== origin ||
      !['portal.html', 'editor.html', 'logs.html'].includes(document ?? '')
    )
      return undefined;
    url.searchParams.delete('retorno');
    return url.pathname + url.search;
  } catch {
    return undefined;
  }
}
