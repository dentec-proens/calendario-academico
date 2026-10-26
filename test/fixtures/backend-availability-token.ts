/// <reference types="vite/client" />
import { installAvailabilityClock } from './backend-availability-clock.ts';

installAvailabilityClock();
history.replaceState(null, '', '/ativar-conta#token=token-sintetico-local');
await import('../../web/main.tsx');
