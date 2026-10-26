import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';
import { editorUrl } from '../../src/app-routes.ts';

if (location.pathname === '/__editor')
  history.replaceState(
    null,
    '',
    editorUrl(new URLSearchParams(location.search).get('id') ?? 'synthetic-calendar') +
      location.hash,
  );

const host = document.createElement('div');
document.body.append(host);
flushSync(() => createRoot(host).render(createElement(ConfirmationDialogHost)));
await import('../../web/app.ts');
