import { mountApplication } from './mount-application.ts';
import { convex, info, status } from './review-ui-client.ts';
if (location.pathname === '/__review')
  history.replaceState(null, '', '/revisoes' + location.search);
mountApplication({ client: convex, info, status });
