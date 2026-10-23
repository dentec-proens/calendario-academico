/// <reference types="vite/client" />
import { mountNativePage } from '../../web/native/Page.tsx';
import { installAvailabilityClock } from './backend-availability-clock.ts';

installAvailabilityClock();
mountNativePage(() => {
  // Token pages consume their private fragment before their data request settles.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return new Promise<void>(() => undefined);
}, false);
