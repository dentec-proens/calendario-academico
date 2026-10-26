/// <reference types="vite/client" />
import { installAvailabilityClock } from './backend-availability-clock.ts';

installAvailabilityClock();
history.replaceState(null, '', '/' + location.search);
await import('../../web/main.tsx');
