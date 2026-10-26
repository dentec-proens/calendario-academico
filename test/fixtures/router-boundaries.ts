import { createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApplicationRouter, AppLink, navigateApp } from '../../web/routing.tsx';
import { editorUrl, pageDocument, parseEditorPath } from '../../src/app-routes.ts';

const documentName = pageDocument(location.pathname);
if (!documentName) throw new Error('Documento sintético desconhecido.');
const calendarId = parseEditorPath(location.pathname)?.id;
window.routerDocumentId = crypto.randomUUID();

function DocumentContent() {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (!draft) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [draft]);
  const otherCalendar = editorUrl('calendar-b', 'events');
  return createElement(
    'main',
    { 'data-document': documentName, 'data-calendar': calendarId },
    createElement('h1', null, calendarId ? `Editor ${calendarId}` : 'Histórico de alterações'),
    createElement(
      'label',
      null,
      'Rascunho',
      createElement('input', {
        id: 'draft',
        value: draft,
        onChange: (event) => setDraft(event.currentTarget.value),
      }),
    ),
    createElement(AppLink, { id: 'logs-link', href: '/logs' }, 'Abrir histórico'),
    createElement(AppLink, { id: 'calendar-link', href: otherCalendar }, 'Abrir outro calendário'),
    createElement(
      'button',
      { id: 'logs-action', onClick: () => void navigateApp('/logs') },
      'Abrir histórico por ação',
    ),
    createElement(
      'button',
      { id: 'calendar-action', onClick: () => void navigateApp(otherCalendar) },
      'Abrir outro calendário por ação',
    ),
  );
}

createRoot(document.getElementById('root')!).render(
  createElement(ApplicationRouter, { document: documentName }, createElement(DocumentContent)),
);

declare global {
  interface Window {
    routerDocumentId: string;
  }
}
