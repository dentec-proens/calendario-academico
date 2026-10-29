import { pageDocument, parseEditorPath } from './routes.ts';
import { calendarReferenceAnchor, isCalendarReferenceHash } from './calendar-reference.ts';

/** Only application work pages on this origin may be resumed after signing in. */
export function loginReturnTarget(search: string, origin: string): string | undefined {
  const requested = new URLSearchParams(search).get('retorno');
  if (!requested) return undefined;
  try {
    const url = new URL(requested, origin);
    const document = pageDocument(url.pathname);
    if (
      url.origin !== origin ||
      !document ||
      ['/', '/ativar-conta', '/recuperar-senha'].includes(url.pathname.replace(/\/+$/, '') || '/')
    )
      return undefined;
    url.searchParams.delete('retorno');
    const hash =
      parseEditorPath(url.pathname)?.section === 'events' && isCalendarReferenceHash(url.hash)
        ? `#${calendarReferenceAnchor}`
        : '';
    return url.pathname + url.search + hash;
  } catch {
    return undefined;
  }
}
