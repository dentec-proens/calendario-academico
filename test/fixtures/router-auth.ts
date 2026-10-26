import { mountApplication } from './mount-application.ts';
import { convex } from './router-auth-client.ts';

mountApplication({
  client: convex,
  isAuthenticated: false,
  status: {
    user: null,
    hosted: true,
    setupRequired: false,
    googleEnabled: false,
  },
});
