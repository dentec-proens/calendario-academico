import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';

const host = document.createElement('div');
document.body.append(host);
flushSync(() => createRoot(host).render(createElement(ConfirmationDialogHost)));
await import('../../web/app.ts');
