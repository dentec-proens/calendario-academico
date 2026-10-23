import { mountNativePage } from './Page.tsx';
import { calendars } from './client.ts';

mountNativePage(async () => {
  const url = new URL(window.location.href);
  const reference = url.searchParams.get('id');
  if (reference) {
    const id = await calendars.resolveId(reference);
    if (id !== reference) {
      url.searchParams.set('id', id);
      window.history.replaceState(window.history.state, '', url);
    }
  }
  return import('../app.js');
});
