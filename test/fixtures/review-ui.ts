import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewContent } from '../../web/portal/ReviewPanel.tsx';
import type { Bootstrap } from '../../web/native/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

const calendars: Bootstrap['calendars'] = [
  {
    id: 'synthetic-review' as Id<'calendars'>,
    name: '2027 — Campus de teste',
    campusId: 'synthetic-campus' as Id<'campuses'>,
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado'],
    purpose: 'test',
    courses: 'Curso de teste',
    classes: '',
    shifts: '',
    version: 1,
    updatedAt: '2026-10-23T15:00:00Z',
  },
];
createRoot(document.getElementById('root')!).render(
  createElement(
    'main',
    null,
    createElement(ReviewContent, {
      calendars,
      liveReview: undefined,
      onOpened: () => {},
      pagination: { status: 'Exhausted', loadMore: () => {} },
    }),
    createElement(ConfirmationDialogHost),
  ),
);
