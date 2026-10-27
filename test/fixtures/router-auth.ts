import { mountApplication } from './mount-application.ts';
import { convex } from './router-auth-client.ts';

const googleEnabled = new URLSearchParams(location.search).has('google');
window.routerAuthTest.googleRedirect = googleEnabled;
mountApplication({
  client: convex,
  isAuthenticated: false,
  status: {
    user: null,
    hosted: true,
    setupRequired: false,
    googleEnabled,
  },
});
