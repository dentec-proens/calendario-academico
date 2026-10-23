/// <reference types="vite/client" />
import { installAvailabilityClock } from './backend-availability-clock.ts';

installAvailabilityClock();
await import('../../web/portal/main.tsx');
