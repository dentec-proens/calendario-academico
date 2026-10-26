import { createRoot } from 'react-dom/client';
import './style.css';
import './portal.css';
import './portal/react-portal.css';
import { AppProviders } from './app/providers.tsx';
import { ApplicationRouter } from './app/router.tsx';
import { capturePrivateLinkToken } from './app/private-links.ts';
import { configureFormInstrumentation } from './app/form-instrumentation.ts';

capturePrivateLinkToken(window.location, window.history);
configureFormInstrumentation(import.meta.env.DEV);
const root = document.getElementById('root');
if (!root) throw new Error('A aplicação precisa do elemento raiz.');
createRoot(root).render(
  <AppProviders>
    <ApplicationRouter />
  </AppProviders>,
);
